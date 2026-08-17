'use strict';

const crypto = require('crypto');

const RELAY_CRYPTO_VERSION = 1;
const RELAY_CURVE = 'prime256v1';
const RELAY_KEY_BYTES = 32;
const RELAY_IV_BYTES = 12;
const RELAY_TAG_BYTES = 16;

const RelayRole = Object.freeze({
  APP: 'app',
  BRIDGE: 'bridge'
});

const RelayDirection = Object.freeze({
  APP_TO_BRIDGE: 'app_to_bridge',
  BRIDGE_TO_APP: 'bridge_to_app'
});

const RelayCryptoFailure = Object.freeze({
  INVALID_ARGUMENT: 'relay_invalid_argument',
  INVALID_LOCAL_KEY: 'relay_invalid_local_key',
  INVALID_PEER_KEY: 'relay_invalid_peer_key',
  INVALID_ENVELOPE: 'relay_invalid_envelope',
  SESSION_MISMATCH: 'relay_session_mismatch',
  DIRECTION_MISMATCH: 'relay_direction_mismatch',
  REPLAY_DETECTED: 'relay_replay_detected',
  OUT_OF_ORDER: 'relay_out_of_order',
  KEY_EPOCH_MISMATCH: 'relay_key_epoch_mismatch',
  AUTHENTICATION_FAILED: 'relay_authentication_failed',
  SESSION_CLOSED: 'relay_session_closed'
});

class RelayCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RelayCryptoError';
    this.code = code;
  }
}

class RelayEphemeralKeyPair {
  constructor(privateKey, publicKeyPem) {
    Object.defineProperty(this, 'privateKey', {
      value: privateKey,
      configurable: false,
      enumerable: false,
      writable: false
    });
    this.publicKeyPem = publicKeyPem;
    this.publicKeyBase64 = crypto.createPublicKey(publicKeyPem)
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
    this.curve = RELAY_CURVE;
  }
}

function cryptoError(code, message) {
  return new RelayCryptoError(code, message);
}

function assertSafeText(value, name, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, name + ' is invalid.');
  }
  return value;
}

function assertBoundedText(value, name, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\u0000')) {
    throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, name + ' is invalid.');
  }
  return value;
}

function assertProtocolToken(value, name, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || !/^[A-Za-z0-9.\/:_+\-]+$/.test(value)) {
    throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, name + ' is invalid.');
  }
  return value;
}

function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay sequence is invalid.');
  }
  return value;
}

function normalizeKeyEpoch(value, failureCategory) {
  const epoch = typeof value === 'undefined' || value === null ? 1 : value;
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw cryptoError(failureCategory, 'Relay key epoch is invalid.');
  }
  return epoch;
}

function normalizeRole(value) {
  if (value === RelayRole.APP || value === RelayRole.BRIDGE) return value;
  throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, 'Relay role is invalid.');
}

function directionForRole(role, outbound) {
  if (role === RelayRole.APP) return outbound ? RelayDirection.APP_TO_BRIDGE : RelayDirection.BRIDGE_TO_APP;
  return outbound ? RelayDirection.BRIDGE_TO_APP : RelayDirection.APP_TO_BRIDGE;
}

function normalizePrivateKey(value) {
  try {
    const key = value && typeof value === 'object' && value.type === 'private' ? value : crypto.createPrivateKey(value);
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'ec' || details.namedCurve !== RELAY_CURVE) throw new Error('curve');
    return key;
  } catch (_error) {
    throw cryptoError(RelayCryptoFailure.INVALID_LOCAL_KEY, 'Relay local ephemeral key is invalid.');
  }
}

function normalizePublicKey(value) {
  try {
    const key = value && typeof value === 'object' && value.type === 'public' ? value : crypto.createPublicKey(value);
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'ec' || details.namedCurve !== RELAY_CURVE) throw new Error('curve');
    return key;
  } catch (_error) {
    throw cryptoError(RelayCryptoFailure.INVALID_PEER_KEY, 'Relay peer ephemeral key is invalid.');
  }
}

function generateRelayEphemeralKeyPair() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: RELAY_CURVE });
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  return new RelayEphemeralKeyPair(pair.privateKey, publicKeyPem);
}

function lengthPrefixed(value) {
  return String(value.length) + ':' + value;
}

function canonicalRelayAad(sessionId, direction, contentType, seq, keyEpoch) {
  const normalizedSessionId = assertProtocolToken(sessionId, 'sessionId', 160);
  if (direction !== RelayDirection.APP_TO_BRIDGE && direction !== RelayDirection.BRIDGE_TO_APP) {
    throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay direction is invalid.');
  }
  const normalizedContentType = assertProtocolToken(contentType, 'contentType', 128);
  const normalizedSequence = assertSequence(seq);
  const normalizedEpoch = normalizeKeyEpoch(keyEpoch, RelayCryptoFailure.INVALID_ENVELOPE);
  const text = 'ngf-relay-v1\n' +
    lengthPrefixed(normalizedSessionId) + '\n' +
    lengthPrefixed(direction) + '\n' +
    String(normalizedSequence) + '\n' +
    String(normalizedEpoch) + '\n' +
    lengthPrefixed(normalizedContentType);
  return Buffer.from(text, 'utf8');
}

function optionalContextText(value, name, maxLength) {
  if (typeof value === 'undefined' || value === null || value === '') return 'legacy-unspecified';
  return assertSafeText(value, name, maxLength);
}

function optionalProtocolToken(value, name, maxLength) {
  if (typeof value === 'undefined' || value === null || value === '') return 'legacy-unspecified';
  return assertProtocolToken(value, name, maxLength);
}

function optionalBoundedText(value, name, maxLength) {
  if (typeof value === 'undefined' || value === null || value === '') return 'legacy-unspecified';
  return assertBoundedText(value, name, maxLength);
}

function canonicalRelayKdfContext(source) {
  const sessionId = assertProtocolToken(source.sessionId, 'sessionId', 160);
  const relayId = optionalProtocolToken(source.relayId, 'relayId', 256);
  const clientNonce = optionalProtocolToken(source.clientNonce, 'clientNonce', 256);
  const bridgeNonce = optionalProtocolToken(source.bridgeNonce, 'bridgeNonce', 256);
  const clientFingerprint = optionalProtocolToken(
    source.clientIdentityFingerprint || source.appIdentityFingerprint,
    'clientIdentityFingerprint',
    256
  );
  const bridgeFingerprint = optionalProtocolToken(source.bridgeIdentityFingerprint, 'bridgeIdentityFingerprint', 256);
  const keyEpoch = normalizeKeyEpoch(source.keyEpoch, RelayCryptoFailure.INVALID_ARGUMENT);
  const saltText = 'ngf-relay-hkdf-salt-v1\n' + relayId + '\n' + clientNonce + '\n' + bridgeNonce;
  const infoText = 'ngf-relay-session-v1\n' + sessionId + '\n' + clientFingerprint + '\n' +
    bridgeFingerprint + '\n' + String(keyEpoch);
  return JSON.stringify({ saltText, infoText });
}

function relayKdfBuffers(source) {
  const context = JSON.parse(canonicalRelayKdfContext(source));
  return {
    context,
    salt: crypto.createHash('sha256').update(context.saltText, 'utf8').digest(),
    info: Buffer.from(context.infoText, 'utf8')
  };
}

function decodeBase64Field(value, expectedLength, allowEmpty) {
  const emptyAllowed = allowEmpty === true;
  if (typeof value !== 'string' || (!emptyAllowed && value.length === 0)) {
    throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay binary field is invalid.');
  }
  let decoded;
  if (value.length === 0) {
    decoded = Buffer.alloc(0);
  } else if (/^[A-Za-z0-9_-]+$/.test(value)) {
    decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay binary field is not canonical base64url.');
    }
  } else if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
      throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay binary field is not canonical base64.');
    }
  } else {
    throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay binary field encoding is invalid.');
  }
  if (expectedLength > 0 && decoded.length !== expectedLength) {
    throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay binary field length is invalid.');
  }
  return decoded;
}

function normalizePlaintext(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, 'Relay plaintext is invalid.');
}

class RelaySessionCipher {
  constructor(options) {
    const source = options && typeof options === 'object' ? options : {};
    this.sessionId = assertProtocolToken(source.sessionId, 'sessionId', 160);
    this.role = normalizeRole(source.role);
    this.outboundDirection = directionForRole(this.role, true);
    this.inboundDirection = directionForRole(this.role, false);
    this.keyEpoch = normalizeKeyEpoch(source.keyEpoch, RelayCryptoFailure.INVALID_ARGUMENT);
    this.outboundSeq = 0;
    this.inboundSeq = 0;
    this.closed = false;
    const keys = deriveSessionKeys({
      sessionId: this.sessionId,
      localPrivateKey: source.localPrivateKey || source.localPrivateKeyPem || source.privateKey,
      peerPublicKey: source.peerPublicKey || source.peerPublicKeyPem,
      relayId: source.relayId,
      clientNonce: source.clientNonce,
      bridgeNonce: source.bridgeNonce,
      clientIdentityFingerprint: source.clientIdentityFingerprint,
      bridgeIdentityFingerprint: source.bridgeIdentityFingerprint,
      keyEpoch: this.keyEpoch
    });
    const outboundKey = this.outboundDirection === RelayDirection.APP_TO_BRIDGE
      ? keys.appToBridgeKey
      : keys.bridgeToAppKey;
    const inboundKey = this.inboundDirection === RelayDirection.APP_TO_BRIDGE
      ? keys.appToBridgeKey
      : keys.bridgeToAppKey;
    Object.defineProperty(this, 'outboundKey', { value: outboundKey, enumerable: false, writable: false });
    Object.defineProperty(this, 'inboundKey', { value: inboundKey, enumerable: false, writable: false });
  }

  seal(contentType, plaintext) {
    this.assertOpen();
    const nextSeq = this.outboundSeq + 1;
    if (!Number.isSafeInteger(nextSeq)) throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, 'Relay sequence is exhausted.');
    const aad = canonicalRelayAad(this.sessionId, this.outboundDirection, contentType, nextSeq, this.keyEpoch);
    const iv = crypto.randomBytes(RELAY_IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.outboundKey, iv, { authTagLength: RELAY_TAG_BYTES });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(normalizePlaintext(plaintext)), cipher.final()]);
    const authTag = cipher.getAuthTag();
    this.outboundSeq = nextSeq;
    return {
      version: RELAY_CRYPTO_VERSION,
      sessionId: this.sessionId,
      direction: this.outboundDirection,
      contentType,
      seq: nextSeq,
      keyEpoch: this.keyEpoch,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: authTag.toString('base64url'),
      nonceBase64: iv.toString('base64'),
      cipherTextBase64: ciphertext.toString('base64'),
      authTagBase64: authTag.toString('base64'),
      aadBase64: aad.toString('base64')
    };
  }

  open(envelope) {
    this.assertOpen();
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.version !== RELAY_CRYPTO_VERSION) {
      throw cryptoError(RelayCryptoFailure.INVALID_ENVELOPE, 'Relay envelope is invalid.');
    }
    if (envelope.sessionId !== this.sessionId) {
      throw cryptoError(RelayCryptoFailure.SESSION_MISMATCH, 'Relay envelope belongs to another session.');
    }
    if (envelope.direction !== this.inboundDirection) {
      throw cryptoError(RelayCryptoFailure.DIRECTION_MISMATCH, 'Relay envelope direction is invalid for this receiver.');
    }
    const keyEpoch = normalizeKeyEpoch(envelope.keyEpoch, RelayCryptoFailure.INVALID_ENVELOPE);
    if (keyEpoch !== this.keyEpoch) {
      throw cryptoError(RelayCryptoFailure.KEY_EPOCH_MISMATCH, 'Relay envelope key epoch does not match this session.');
    }
    const seq = assertSequence(envelope.seq);
    if (seq <= this.inboundSeq) {
      throw cryptoError(RelayCryptoFailure.REPLAY_DETECTED, 'Relay envelope sequence was already consumed.');
    }
    if (seq !== this.inboundSeq + 1) {
      throw cryptoError(RelayCryptoFailure.OUT_OF_ORDER, 'Relay envelope sequence is out of order.');
    }
    const aad = canonicalRelayAad(this.sessionId, this.inboundDirection, envelope.contentType, seq, keyEpoch);
    if (typeof envelope.aadBase64 === 'string' && envelope.aadBase64.length > 0) {
      const providedAad = decodeBase64Field(envelope.aadBase64, -1, false);
      if (providedAad.length !== aad.length || !crypto.timingSafeEqual(providedAad, aad)) {
        throw cryptoError(RelayCryptoFailure.AUTHENTICATION_FAILED, 'Relay envelope AAD does not match canonical metadata.');
      }
    }
    const iv = decodeBase64Field(
      typeof envelope.nonceBase64 === 'string' ? envelope.nonceBase64 : envelope.iv,
      RELAY_IV_BYTES,
      false
    );
    const ciphertext = decodeBase64Field(
      typeof envelope.cipherTextBase64 === 'string' ? envelope.cipherTextBase64 : envelope.ciphertext,
      -1,
      true
    );
    const authTag = decodeBase64Field(
      typeof envelope.authTagBase64 === 'string' ? envelope.authTagBase64 : envelope.authTag,
      RELAY_TAG_BYTES,
      false
    );
    let plaintext;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.inboundKey, iv, { authTagLength: RELAY_TAG_BYTES });
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (_error) {
      throw cryptoError(RelayCryptoFailure.AUTHENTICATION_FAILED, 'Relay envelope authentication failed.');
    }
    this.inboundSeq = seq;
    return {
      sessionId: this.sessionId,
      direction: this.inboundDirection,
      contentType: envelope.contentType,
      seq,
      keyEpoch,
      plaintext
    };
  }

  openText(envelope) {
    return this.open(envelope).plaintext.toString('utf8');
  }

  encrypt(contentType, plaintext) {
    return this.seal(contentType, plaintext);
  }

  decrypt(envelope) {
    return this.open(envelope);
  }

  status() {
    return this.toJSON();
  }

  destroy() {
    if (this.closed) return;
    this.outboundKey.fill(0);
    this.inboundKey.fill(0);
    this.closed = true;
  }

  assertOpen() {
    if (this.closed) throw cryptoError(RelayCryptoFailure.SESSION_CLOSED, 'Relay cipher session is closed.');
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      role: this.role,
      outboundDirection: this.outboundDirection,
      inboundDirection: this.inboundDirection,
      keyEpoch: this.keyEpoch,
      outboundSeq: this.outboundSeq,
      inboundSeq: this.inboundSeq,
      closed: this.closed
    };
  }
}

function createRelaySessionCipher(options) {
  return new RelaySessionCipher(options);
}

function deriveSessionKeys(options) {
  const source = options && typeof options === 'object' ? options : {};
  const sessionId = assertProtocolToken(source.sessionId, 'sessionId', 160);
  const material = relayKdfBuffers(source);
  const localPrivateKey = normalizePrivateKey(
    source.localPrivateKey || source.localPrivateKeyPem || source.privateKey
  );
  const peerPublicKey = normalizePublicKey(source.peerPublicKey || source.peerPublicKeyPem);
  let sharedSecret;
  try {
    sharedSecret = crypto.diffieHellman({ privateKey: localPrivateKey, publicKey: peerPublicKey });
  } catch (_error) {
    throw cryptoError(RelayCryptoFailure.INVALID_PEER_KEY, 'Relay peer ephemeral key agreement failed.');
  }
  let appToBridgeKey;
  let bridgeToAppKey;
  let derived;
  try {
    derived = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, material.salt, material.info, RELAY_KEY_BYTES * 2));
    appToBridgeKey = Buffer.from(derived.subarray(0, RELAY_KEY_BYTES));
    bridgeToAppKey = Buffer.from(derived.subarray(RELAY_KEY_BYTES, RELAY_KEY_BYTES * 2));
  } finally {
    sharedSecret.fill(0);
    material.salt.fill(0);
    material.info.fill(0);
    if (derived) derived.fill(0);
  }
  const result = {};
  Object.defineProperty(result, 'appToBridgeKey', {
    value: appToBridgeKey,
    enumerable: false,
    writable: false
  });
  Object.defineProperty(result, 'bridgeToAppKey', {
    value: bridgeToAppKey,
    enumerable: false,
    writable: false
  });
  Object.defineProperty(result, 'destroy', {
    value: () => {
      appToBridgeKey.fill(0);
      bridgeToAppKey.fill(0);
    },
    enumerable: false,
    writable: false
  });
  result.sessionId = sessionId;
  result.keyEpoch = normalizeKeyEpoch(source.keyEpoch, RelayCryptoFailure.INVALID_ARGUMENT);
  result.algorithm = 'ECDH-P256/HKDF-SHA256/AES-256-GCM';
  result.contextDigest = crypto.createHash('sha256')
    .update(material.context.saltText + '\n' + material.context.infoText, 'utf8')
    .digest('hex');
  return result;
}

function generateEphemeralKeyPair() {
  return generateRelayEphemeralKeyPair();
}

function createEncryptedSession(options) {
  return createRelaySessionCipher(options);
}

function canonicalPairingMaterial(source) {
  const value = source && typeof source === 'object' ? source : {};
  const identityPublicKey = nonEmptyFirst(value.clientIdentityPublicKey, value.appIdentityPublicKey);
  const identityFingerprint = nonEmptyFirst(value.clientIdentityFingerprint, value.appIdentityFingerprint);
  return JSON.stringify([
    'ngf-relay-pairing-v1',
    optionalContextText(value.relayId, 'relayId', 256),
    assertSafeText(value.pairingId, 'pairingId', 256),
    assertSafeText(value.deviceId, 'deviceId', 256),
    assertSafeText(value.sessionId, 'sessionId', 256),
    assertBoundedText(value.ephemeralPublicKey, 'ephemeralPublicKey', 4096),
    optionalBoundedText(identityPublicKey, 'clientIdentityPublicKey', 8192),
    optionalContextText(identityFingerprint, 'clientIdentityFingerprint', 256),
    assertSafeText(value.nonce, 'nonce', 256),
    Number.isSafeInteger(value.issuedAt) && value.issuedAt > 0 ? value.issuedAt : 0
  ]);
}

function nonEmptyFirst(primary, fallbackValue) {
  return typeof primary === 'string' && primary.length > 0 ? primary : fallbackValue;
}

function normalizePairingSecret(secret) {
  const value = Buffer.isBuffer(secret) ? Buffer.from(secret) : Buffer.from(typeof secret === 'string' ? secret : '', 'utf8');
  if (value.length < 16) throw cryptoError(RelayCryptoFailure.INVALID_ARGUMENT, 'Pairing secret is invalid.');
  return value;
}

function createPairingSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function createPairingHmac(secret, material) {
  const key = normalizePairingSecret(secret);
  try {
    return crypto.createHmac('sha256', key).update(String(material), 'utf8').digest('base64url');
  } finally {
    key.fill(0);
  }
}

function verifyPairingHmac(secret, material, proof) {
  let expected = null;
  let actual = null;
  try {
    expected = Buffer.from(createPairingHmac(secret, material), 'base64url');
    actual = typeof proof === 'string' && /^[A-Za-z0-9_-]+$/.test(proof) ? Buffer.from(proof, 'base64url') : Buffer.alloc(0);
    return expected.length === actual.length && expected.length > 0 && crypto.timingSafeEqual(expected, actual);
  } catch (_error) {
    return false;
  } finally {
    if (expected) expected.fill(0);
    if (actual) actual.fill(0);
  }
}

function createPairingProof(secret, material) {
  return createPairingHmac(secret, material);
}

function verifyPairingProof(secret, material, proof) {
  return verifyPairingHmac(secret, material, proof);
}

function canonicalRelayIdentityMaterial(source) {
  const value = source && typeof source === 'object' ? source : {};
  const clientNonce = nonEmptyFirst(value.clientNonce, value.nonce);
  const bridgeNonce = nonEmptyFirst(value.bridgeNonce, value.nonce);
  return JSON.stringify([
    'ngf-relay-identity-v1',
    optionalContextText(value.relayId, 'relayId', 256),
    assertSafeText(value.sessionId, 'sessionId', 256),
    normalizeRole(value.role),
    assertBoundedText(value.ephemeralPublicKey, 'ephemeralPublicKey', 4096),
    optionalContextText(value.clientIdentityFingerprint, 'clientIdentityFingerprint', 256),
    optionalContextText(value.bridgeIdentityFingerprint, 'bridgeIdentityFingerprint', 256),
    optionalContextText(clientNonce, 'clientNonce', 256),
    optionalContextText(bridgeNonce, 'bridgeNonce', 256),
    Number.isSafeInteger(value.issuedAt) && value.issuedAt > 0 ? value.issuedAt : 0
  ]);
}

function signRelayIdentity(privateKey, material) {
  const signingKey = normalizePrivateKey(privateKey);
  const transcript = assertBoundedText(material, 'material', 65536);
  const signer = crypto.createSign('SHA256');
  signer.update(transcript, 'utf8');
  signer.end();
  return signer.sign(signingKey).toString('base64');
}

function verifyRelayIdentitySignature(publicKey, material, signature) {
  try {
    if (typeof signature !== 'string' || signature.length === 0) return false;
    const verificationKey = normalizePublicKey(publicKey);
    const transcript = assertBoundedText(material, 'material', 65536);
    const signatureBytes = decodeBase64Field(signature, -1, false);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(transcript, 'utf8');
    verifier.end();
    return verifier.verify(verificationKey, signatureBytes);
  } catch (_error) {
    return false;
  }
}

function signHandshake(privateKeyPem, material) {
  return signRelayIdentity(privateKeyPem, material);
}

function verifyHandshake(publicKeyPem, material, signature) {
  return verifyRelayIdentitySignature(publicKeyPem, material, signature);
}

module.exports = {
  RELAY_CRYPTO_VERSION,
  RelayCryptoError,
  RelayCryptoFailure,
  RelayDirection,
  RelayEphemeralKeyPair,
  RelayRole,
  RelaySessionCipher,
  canonicalPairingMaterial,
  canonicalRelayAad,
  canonicalRelayIdentityMaterial,
  canonicalRelayKdfContext,
  createEncryptedSession,
  createPairingHmac,
  createPairingProof,
  createPairingSecret,
  createRelaySessionCipher,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  generateRelayEphemeralKeyPair,
  signHandshake,
  signRelayIdentity,
  verifyHandshake,
  verifyPairingHmac,
  verifyPairingProof,
  verifyRelayIdentitySignature
};
