'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RelayCryptoFailure,
  RelayRole,
  canonicalPairingMaterial,
  canonicalRelayAad,
  canonicalRelayIdentityMaterial,
  createEncryptedSession,
  createPairingProof,
  createPairingSecret,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  signHandshake,
  verifyHandshake,
  verifyPairingProof
} = require('../src/relay-crypto');
const {
  RelayIdentityFailure,
  RelayIdentityStore
} = require('../src/relay-identity-store');
const {
  ensureDeviceIdentity,
  rotateDeviceIdentity,
  signConnectionChallenge
} = require('../src/device-identity');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectCode(action, code, message) {
  let actual = '';
  try {
    action();
  } catch (error) {
    actual = error && typeof error.code === 'string' ? error.code : '';
  }
  assert(actual === code, message + ': expected=' + code + ' actual=' + actual);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flipBase64Url(value) {
  assert(typeof value === 'string' && value.length > 0, 'tamper target must not be empty');
  const replacement = value[0] === 'A' ? 'B' : 'A';
  return replacement + value.substring(1);
}

function sessionContext(sessionId) {
  return {
    sessionId,
    relayId: 'relay-smoke',
    clientNonce: 'client-nonce-smoke',
    bridgeNonce: 'bridge-nonce-smoke',
    clientIdentityFingerprint: 'client-fingerprint-smoke',
    bridgeIdentityFingerprint: 'bridge-fingerprint-smoke'
  };
}

function sessionPair(sessionId, overrides) {
  const appKeys = generateEphemeralKeyPair();
  const bridgeKeys = generateEphemeralKeyPair();
  const context = Object.assign(sessionContext(sessionId), overrides || {});
  return {
    appKeys,
    bridgeKeys,
    app: createEncryptedSession(Object.assign({}, context, {
      role: RelayRole.APP,
      localPrivateKey: appKeys.privateKey,
      peerPublicKey: bridgeKeys.publicKeyPem
    })),
    bridge: createEncryptedSession(Object.assign({}, context, {
      role: RelayRole.BRIDGE,
      localPrivateKey: bridgeKeys.privateKey,
      peerPublicKey: appKeys.publicKeyPem
    }))
  };
}

function verifyConnectionChallenge(proof) {
  const verifier = crypto.createVerify('SHA256');
  verifier.update(proof.signature.material, 'utf8');
  verifier.end();
  return verifier.verify(
    proof.deviceIdentity.publicKeyPem,
    Buffer.from(proof.signature.signature, 'base64')
  );
}

function containsPrivateKeyField(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value) && Object.keys(value).includes('devicePrivateKeyPem')) return true;
  const children = Array.isArray(value) ? value : Object.keys(value).map((key) => value[key]);
  return children.some(containsPrivateKeyField);
}

function runSessionCryptoSmoke() {
  const primary = sessionPair('session-round-trip');
  assert(!JSON.stringify(primary.appKeys).includes('PRIVATE'), 'ephemeral private key leaked through JSON');
  assert(!JSON.stringify(primary.app).includes('outboundKey'), 'session key leaked through JSON');

  const first = primary.app.encrypt('application/json', '{"hello":"bridge"}');
  const second = primary.app.encrypt('application/octet-stream', Buffer.alloc(0));
  assert(first.iv !== second.iv, 'random IV was reused for consecutive envelopes');
  assert(first.keyEpoch === 1, 'default key epoch was not serialized');
  assert(typeof first.nonceBase64 === 'string' && typeof first.aadBase64 === 'string', 'App envelope aliases are missing');
  assert(primary.bridge.decrypt(first).plaintext.toString('utf8') === '{"hello":"bridge"}', 'app to Bridge round trip failed');
  assert(primary.bridge.decrypt(second).plaintext.length === 0, 'empty plaintext round trip failed');
  const reply = primary.bridge.encrypt('text/plain', 'hello app');
  assert(primary.app.decrypt(reply).plaintext.toString('utf8') === 'hello app', 'Bridge to app round trip failed');

  const directional = deriveSessionKeys(Object.assign(sessionContext('session-keys'), {
    localPrivateKey: primary.appKeys.privateKey,
    peerPublicKey: primary.bridgeKeys.publicKeyPem
  }));
  const peerDirectional = deriveSessionKeys(Object.assign(sessionContext('session-keys'), {
    localPrivateKey: primary.bridgeKeys.privateKey,
    peerPublicKey: primary.appKeys.publicKeyPem
  }));
  assert(directional.appToBridgeKey.equals(peerDirectional.appToBridgeKey), 'ECDH peers derived different app direction keys');
  assert(directional.bridgeToAppKey.equals(peerDirectional.bridgeToAppKey), 'ECDH peers derived different Bridge direction keys');
  assert(!directional.appToBridgeKey.equals(directional.bridgeToAppKey), 'directional keys were not isolated');
  assert(!JSON.stringify(directional).includes('appToBridgeKey'), 'derived keys leaked through JSON');
  directional.destroy();
  peerDirectional.destroy();

  const ordered = sessionPair('session-order');
  const orderedOne = ordered.app.encrypt('text/plain', 'one');
  const orderedTwo = ordered.app.encrypt('text/plain', 'two');
  expectCode(
    () => ordered.bridge.decrypt(orderedTwo),
    RelayCryptoFailure.OUT_OF_ORDER,
    'out-of-order envelope was not rejected'
  );
  assert(ordered.bridge.decrypt(orderedOne).plaintext.toString('utf8') === 'one', 'out-of-order rejection advanced sequence');
  assert(ordered.bridge.decrypt(orderedTwo).plaintext.toString('utf8') === 'two', 'second ordered envelope failed');
  expectCode(
    () => ordered.bridge.decrypt(orderedTwo),
    RelayCryptoFailure.REPLAY_DETECTED,
    'replayed envelope was not rejected'
  );

  const tampered = sessionPair('session-tamper');
  const authentic = tampered.app.encrypt('text/plain', 'authentic');
  const ciphertextTamper = clone(authentic);
  ciphertextTamper.cipherTextBase64 = flipBase64Url(ciphertextTamper.cipherTextBase64);
  expectCode(
    () => tampered.bridge.decrypt(ciphertextTamper),
    RelayCryptoFailure.AUTHENTICATION_FAILED,
    'ciphertext tamper was not authenticated'
  );
  const contentTypeTamper = clone(authentic);
  contentTypeTamper.contentType = 'application/json';
  expectCode(
    () => tampered.bridge.decrypt(contentTypeTamper),
    RelayCryptoFailure.AUTHENTICATION_FAILED,
    'AAD content type tamper was not authenticated'
  );
  const ivTamper = clone(authentic);
  ivTamper.nonceBase64 = flipBase64Url(ivTamper.nonceBase64);
  expectCode(
    () => tampered.bridge.decrypt(ivTamper),
    RelayCryptoFailure.AUTHENTICATION_FAILED,
    'IV tamper was not authenticated'
  );
  assert(tampered.bridge.decrypt(authentic).plaintext.toString('utf8') === 'authentic', 'tamper failure advanced sequence');
  expectCode(
    () => tampered.app.decrypt(authentic),
    RelayCryptoFailure.DIRECTION_MISMATCH,
    'outbound envelope was accepted in the wrong direction'
  );

  const epochPair = sessionPair('session-key-epoch');
  const epochEnvelope = epochPair.app.encrypt('text/plain', 'epoch');
  const wrongEpochEnvelope = clone(epochEnvelope);
  wrongEpochEnvelope.keyEpoch = 2;
  expectCode(
    () => epochPair.bridge.decrypt(wrongEpochEnvelope),
    RelayCryptoFailure.KEY_EPOCH_MISMATCH,
    'wrong key epoch was accepted'
  );
  delete epochEnvelope.keyEpoch;
  assert(epochPair.bridge.decrypt(epochEnvelope).plaintext.toString('utf8') === 'epoch', 'missing key epoch did not default to one');

  const wrongPeer = sessionPair('session-wrong-peer');
  const unrelatedBridge = generateEphemeralKeyPair();
  const wrongReceiver = createEncryptedSession(Object.assign(sessionContext('session-wrong-peer'), {
    role: RelayRole.BRIDGE,
    localPrivateKey: unrelatedBridge.privateKey,
    peerPublicKey: wrongPeer.appKeys.publicKeyPem
  }));
  expectCode(
    () => wrongReceiver.decrypt(wrongPeer.app.encrypt('text/plain', 'wrong peer')),
    RelayCryptoFailure.AUTHENTICATION_FAILED,
    'wrong peer derived an accepted session key'
  );

  const contextBase = sessionPair('session-context');
  const mismatchedContext = createEncryptedSession(Object.assign(sessionContext('session-context'), {
    relayId: 'different-relay',
    role: RelayRole.BRIDGE,
    localPrivateKey: contextBase.bridgeKeys.privateKey,
    peerPublicKey: contextBase.appKeys.publicKeyPem
  }));
  expectCode(
    () => mismatchedContext.decrypt(contextBase.app.encrypt('text/plain', 'bound context')),
    RelayCryptoFailure.AUTHENTICATION_FAILED,
    'changed relay context did not change the session key'
  );

  for (const field of [
    'relayId',
    'clientNonce',
    'bridgeNonce',
    'clientIdentityFingerprint',
    'bridgeIdentityFingerprint'
  ]) {
    const baseContext = sessionContext('session-context-' + field);
    const base = deriveSessionKeys(Object.assign({}, baseContext, {
      localPrivateKey: primary.appKeys.privateKey,
      peerPublicKey: primary.bridgeKeys.publicKeyPem
    }));
    const changedContext = Object.assign({}, baseContext);
    changedContext[field] = baseContext[field] + '-changed';
    const changed = deriveSessionKeys(Object.assign({}, changedContext, {
      localPrivateKey: primary.appKeys.privateKey,
      peerPublicKey: primary.bridgeKeys.publicKeyPem
    }));
    assert(!base.appToBridgeKey.equals(changed.appToBridgeKey), field + ' was not bound into HKDF context');
    base.destroy();
    changed.destroy();
  }

  primary.app.destroy();
  expectCode(
    () => primary.app.encrypt('text/plain', 'closed'),
    RelayCryptoFailure.SESSION_CLOSED,
    'destroyed session remained usable'
  );
}

function runProofSmoke() {
  const secret = createPairingSecret();
  const clientIdentity = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const pairingSource = {
    relayId: 'relay-pairing-smoke',
    pairingId: 'pair-smoke',
    deviceId: 'device-smoke',
    sessionId: 'session-smoke',
    ephemeralPublicKey: 'public-key-smoke',
    clientIdentityPublicKey: clientIdentity.publicKey,
    clientIdentityFingerprint: crypto.createHash('sha256').update(clientIdentity.publicKey).digest('hex'),
    nonce: 'nonce-smoke',
    issuedAt: Date.now()
  };
  const pairingMaterial = canonicalPairingMaterial(pairingSource);
  const proof = createPairingProof(secret, pairingMaterial);
  assert(verifyPairingProof(secret, pairingMaterial, proof), 'pairing proof verification failed');
  assert(!verifyPairingProof(secret + '-wrong', pairingMaterial, proof), 'wrong pairing secret was accepted');
  assert(!verifyPairingProof(secret, pairingMaterial + '-tamper', proof), 'tampered pairing material was accepted');
  for (const field of ['relayId', 'clientIdentityPublicKey', 'clientIdentityFingerprint']) {
    const changed = Object.assign({}, pairingSource);
    changed[field] = pairingSource[field] + '-changed';
    assert(canonicalPairingMaterial(changed) !== pairingMaterial, field + ' was not bound into pairing transcript');
  }

  const signer = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const identitySource = {
    relayId: 'relay-identity-smoke',
    sessionId: 'session-signature',
    role: RelayRole.BRIDGE,
    ephemeralPublicKey: 'ephemeral-key-smoke',
    clientIdentityFingerprint: 'client-identity-fingerprint',
    bridgeIdentityFingerprint: 'bridge-identity-fingerprint',
    clientNonce: 'client-identity-nonce',
    bridgeNonce: 'bridge-identity-nonce',
    issuedAt: Date.now()
  };
  const identityMaterial = canonicalRelayIdentityMaterial(identitySource);
  const signature = signHandshake(signer.privateKey, identityMaterial);
  assert(verifyHandshake(signer.publicKey, identityMaterial, signature), 'identity handshake signature failed');
  assert(!verifyHandshake(other.publicKey, identityMaterial, signature), 'wrong identity key was accepted');
  assert(!verifyHandshake(signer.publicKey, identityMaterial + '-tamper', signature), 'tampered identity material was accepted');
  for (const field of [
    'relayId',
    'clientIdentityFingerprint',
    'bridgeIdentityFingerprint',
    'clientNonce',
    'bridgeNonce'
  ]) {
    const changed = Object.assign({}, identitySource);
    changed[field] = identitySource[field] + '-changed';
    assert(canonicalRelayIdentityMaterial(changed) !== identityMaterial, field + ' was not bound into identity transcript');
  }
}

function runInteropVectorSmoke() {
  const appPrivateKeyPem = '-----BEGIN PRIVATE KEY-----\n' +
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgG7jV+jRBWRLmuHr2\n' +
    'rEAWIlbDbQDuzWMaie0nr6TkDnqhRANCAATFWHCWmvkzlQ/NJQa4Si2qy+BI8c7A\n' +
    'SePVT4gSToQ7HX4pwW0cL64O9f+hqJnXiZZbfzSs9LWD9J4mYo3/H5Od\n' +
    '-----END PRIVATE KEY-----';
  const bridgePublicKeyPem = '-----BEGIN PUBLIC KEY-----\n' +
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/RxCUqYj9XwTOn9j8bgQ/G+UfPo9\n' +
    'MFp8P3iw9MAI5UTlxb2Ecv+nmKMqRGLXD8EmaVO8Q0ljqaZq9uxbzUNqig==\n' +
    '-----END PUBLIC KEY-----';
  const options = {
    sessionId: 'vector_session_01',
    relayId: 'relay_vector_012345678901234567890123',
    clientNonce: 'client_nonce_vector_0123456789',
    bridgeNonce: 'bridge_nonce_vector_012345678',
    clientIdentityFingerprint: 'a'.repeat(64),
    bridgeIdentityFingerprint: 'b'.repeat(64),
    keyEpoch: 1,
    localPrivateKey: appPrivateKeyPem,
    peerPublicKey: bridgePublicKeyPem
  };
  const keys = deriveSessionKeys(options);
  assert(
    keys.appToBridgeKey.toString('hex') === 'dad1f504c705100717613db8768da3438b1bf6a8063d2eb7b787e9bfc0f18b83',
    'App-to-Bridge HKDF interoperability vector changed'
  );
  assert(
    keys.bridgeToAppKey.toString('hex') === 'fd123eb81ede1d3a1ceb9c3e8ec4d0e372c3cd888dad87d811f57912e8bc9f1c',
    'Bridge-to-App HKDF interoperability vector changed'
  );
  const aad = canonicalRelayAad(options.sessionId, 'app_to_bridge', 'json', 1, 1);
  assert(
    aad.toString('base64') === 'bmdmLXJlbGF5LXYxCjE3OnZlY3Rvcl9zZXNzaW9uXzAxCjEzOmFwcF90b19icmlkZ2UKMQoxCjQ6anNvbg==',
    'Relay AAD interoperability vector changed'
  );
  const iv = Buffer.from('000102030405060708090a0b', 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.appToBridgeKey, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from('{"vector":true}', 'utf8')), cipher.final()]);
  assert(ciphertext.toString('base64') === '8rjKCKfzH7vGV/9jayHL', 'Relay AES ciphertext vector changed');
  assert(cipher.getAuthTag().toString('base64') === 'w46noXwf4s0b87P0FIUIEw==', 'Relay AES auth tag vector changed');
  keys.destroy();
}

function runIdentityStoreSmoke() {
  const previousHome = process.env.AGENT_BRIDGE_HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-relay-identity-'));
  const mismatchHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-relay-identity-mismatch-'));
  const corruptHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-relay-identity-corrupt-'));
  try {
    const legacyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const legacyProfile = {
      version: 1,
      port: 8787,
      physicalDeviceId: 'physical-legacy',
      bridgeInstanceId: 'bridge-legacy',
      deviceDisplayName: 'Legacy Bridge',
      devicePlatform: process.platform,
      devicePublicKeyPem: legacyPair.publicKey,
      devicePrivateKeyPem: legacyPair.privateKey
    };
    fs.writeFileSync(path.join(tempHome, 'profile.json'), JSON.stringify(legacyProfile, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempHome, 'config.json'), JSON.stringify({
      version: 1,
      nested: { devicePrivateKeyPem: legacyPair.privateKey }
    }, null, 2), 'utf8');

    process.env.AGENT_BRIDGE_HOME = tempHome;
    const store = new RelayIdentityStore(tempHome);
    const migrated = store.identity({ legacyProfile });
    assert(migrated.devicePublicKeyPem === legacyPair.publicKey, 'legacy public key changed during migration');
    assert(migrated.devicePrivateKeyPem === legacyPair.privateKey, 'legacy private key did not migrate');
    assert(!JSON.stringify(migrated).includes('PRIVATE KEY'), 'private identity leaked through identity JSON');
    assert(!containsPrivateKeyField(JSON.parse(fs.readFileSync(path.join(tempHome, 'profile.json'), 'utf8'))), 'profile retained legacy private key');
    assert(!containsPrivateKeyField(JSON.parse(fs.readFileSync(path.join(tempHome, 'config.json'), 'utf8'))), 'config retained legacy private key');

    const identityPath = path.join(tempHome, 'security', 'relay-identity.json');
    assert(fs.existsSync(identityPath), 'secure identity file was not created');
    const secureRecord = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    assert(secureRecord.devicePrivateKeyPem === legacyPair.privateKey, 'secure identity file lost the private key');
    if (process.platform !== 'win32') {
      assert((fs.statSync(path.dirname(identityPath)).mode & 0o777) === 0o700, 'security directory mode is not 0700');
      assert((fs.statSync(identityPath).mode & 0o777) === 0o600, 'identity file mode is not 0600');
    }

    const reloaded = new RelayIdentityStore(tempHome).identity();
    assert(reloaded.deviceKeyFingerprint === migrated.deviceKeyFingerprint, 'identity changed after reload');
    assert(reloaded.physicalDeviceId === migrated.physicalDeviceId, 'physical device id changed after reload');
    assert(reloaded.bridgeInstanceId === migrated.bridgeInstanceId, 'Bridge instance id changed after reload');

    const trusted = store.trustDevice({
      physicalDeviceId: 'paired-device',
      displayName: 'Paired Device',
      publicKeyFingerprint: 'paired-fingerprint'
    });
    assert(trusted.trusted === true && store.deviceList().length === 1, 'trusted device was not persisted');
    assert(store.isRevoked('paired-device') === false, 'trusted device was reported revoked');
    const revoked = store.revokeDevice('paired-device');
    assert(revoked && revoked.trusted === false, 'device revocation did not persist');
    assert(store.isRevoked('paired-device') === true, 'revoked device was not rejected');

    const challengeProfile = ensureDeviceIdentity({ version: 1 });
    const challenge = signConnectionChallenge(
      challengeProfile,
      'wss://relay.example.test/bridge',
      'harmony-coder-app',
      'app-nonce-smoke'
    );
    assert(verifyConnectionChallenge(challenge), 'connection challenge failed after migration');

    const previousFingerprint = challengeProfile.deviceKeyFingerprint;
    const previousGeneration = challengeProfile.relayIdentityGeneration;
    const rotatedProfile = rotateDeviceIdentity(challengeProfile);
    assert(rotatedProfile.deviceKeyFingerprint !== previousFingerprint, 'identity rotation retained old fingerprint');
    assert(rotatedProfile.relayIdentityGeneration === previousGeneration + 1, 'identity generation did not advance');
    assert(rotatedProfile.physicalDeviceId === migrated.physicalDeviceId, 'rotation changed physical device id');
    assert(store.deviceList().length === 1 && store.isRevoked('paired-device'), 'rotation lost device revocation state');
    const rotatedChallenge = signConnectionChallenge(
      rotatedProfile,
      'wss://relay.example.test/bridge',
      'harmony-coder-app',
      'app-nonce-after-rotation'
    );
    assert(verifyConnectionChallenge(rotatedChallenge), 'connection challenge failed after rotation');

    const { saveProfile, loadProfile } = require('../src/profile-store');
    const saved = saveProfile({ port: 8790, token: 'not-a-real-token' });
    const savedJson = JSON.parse(fs.readFileSync(path.join(tempHome, 'profile.json'), 'utf8'));
    assert(!containsPrivateKeyField(savedJson), 'ordinary profile save persisted private key');
    assert(saved.devicePrivateKeyPem.length > 0, 'in-memory saved profile lost challenge key');
    assert(!Object.keys(saved).includes('devicePrivateKeyPem'), 'in-memory private key became enumerable');
    const loaded = loadProfile();
    assert(loaded && loaded.deviceKeyFingerprint === rotatedProfile.deviceKeyFingerprint, 'profile reload changed secure identity');
    assert(verifyConnectionChallenge(signConnectionChallenge(
      loaded,
      'wss://relay.example.test/bridge',
      'harmony-coder-app',
      'app-nonce-after-profile-save'
    )), 'connection challenge failed after ordinary profile save');

    const firstMismatchPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const secondMismatchPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(path.join(mismatchHome, 'profile.json'), JSON.stringify({
      physicalDeviceId: 'mismatch-device',
      bridgeInstanceId: 'mismatch-bridge',
      devicePublicKeyPem: firstMismatchPair.publicKey,
      devicePrivateKeyPem: secondMismatchPair.privateKey
    }, null, 2), 'utf8');
    expectCode(
      () => new RelayIdentityStore(mismatchHome).identity(),
      RelayIdentityFailure.LEGACY_KEY_INVALID,
      'mismatched legacy key pair was silently accepted'
    );
    assert(!fs.existsSync(path.join(mismatchHome, 'security', 'relay-identity.json')), 'invalid migration wrote an identity file');

    const corruptSecurityDirectory = path.join(corruptHome, 'security');
    fs.mkdirSync(corruptSecurityDirectory, { recursive: true });
    const corruptIdentityPath = path.join(corruptSecurityDirectory, 'relay-identity.json');
    fs.writeFileSync(corruptIdentityPath, '{not-json', 'utf8');
    expectCode(
      () => new RelayIdentityStore(corruptHome).identity(),
      RelayIdentityFailure.STORE_CORRUPT,
      'corrupt secure identity was silently replaced'
    );
    assert(fs.readFileSync(corruptIdentityPath, 'utf8') === '{not-json', 'corrupt identity was overwritten instead of reported');
  } finally {
    if (typeof previousHome === 'string') {
      process.env.AGENT_BRIDGE_HOME = previousHome;
    } else {
      delete process.env.AGENT_BRIDGE_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(mismatchHome, { recursive: true, force: true });
    fs.rmSync(corruptHome, { recursive: true, force: true });
  }
}

runSessionCryptoSmoke();
runProofSmoke();
runInteropVectorSmoke();
runIdentityStoreSmoke();

console.log('relay crypto smoke passed: ecdh=true aead=true sequence=true context=true migration=true rotation=true');
