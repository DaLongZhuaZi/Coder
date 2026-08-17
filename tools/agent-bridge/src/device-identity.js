'use strict';

const crypto = require('crypto');
const os = require('os');
const childProcess = require('child_process');
const { RelayIdentityStore } = require('./relay-identity-store');

const DEVICE_ID_NAMESPACE = 'ngf-agent-bridge.physical-device.v1';
const SIGNATURE_ALGORITHM = 'SHA256';
const SIGNATURE_KEY_TYPE = 'ECDSA_P256';
const SIGNATURE_CURVE = 'ECC256';
const SIGNATURE_ENCODING = 'asn1-der';
const SIGNATURE_VERIFIER = 'ECC256|SHA256';

function stableMachineSource() {
  const platform = os.platform();
  if (platform === 'win32') {
    const value = runCommand('REG QUERY HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid');
    const match = value.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (match && match[1]) {
      return 'win32:' + match[1].trim();
    }
  }
  if (platform === 'darwin') {
    const value = runCommand('ioreg -rd1 -c IOPlatformExpertDevice');
    const match = value.match(/"IOPlatformUUID"\s+=\s+"([^"]+)"/);
    if (match && match[1]) {
      return 'darwin:' + match[1].trim();
    }
  }
  if (platform === 'linux') {
    const machineId = readTextFile('/etc/machine-id');
    if (machineId.length > 0) {
      return 'linux:' + machineId;
    }
    const dbusId = readTextFile('/var/lib/dbus/machine-id');
    if (dbusId.length > 0) {
      return 'linux:' + dbusId;
    }
  }
  const user = os.userInfo && os.userInfo().username ? os.userInfo().username : '';
  return platform + ':' + os.hostname() + ':' + user + ':' + os.homedir();
}

function runCommand(command) {
  try {
    return childProcess.execSync(command, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (error) {
    return '';
  }
}

function readTextFile(filePath) {
  try {
    const fs = require('fs');
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    return '';
  }
}

function createPhysicalDeviceId() {
  return crypto.createHash('sha256')
    .update(DEVICE_ID_NAMESPACE)
    .update('\n')
    .update(stableMachineSource())
    .digest('hex');
}

function createBridgeInstanceId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function createKeyPair() {
  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  return {
    publicKeyPem: pair.publicKey,
    privateKeyPem: pair.privateKey
  };
}

function keyFingerprint(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}

function defaultDisplayName() {
  const hostname = os.hostname();
  if (hostname && hostname.length > 0) {
    return hostname;
  }
  return os.platform() + ' computer';
}

function attachPrivateKey(profile, privateKeyPem) {
  if (Object.keys(profile).includes('devicePrivateKeyPem')) {
    delete profile.devicePrivateKeyPem;
  }
  Object.defineProperty(profile, 'devicePrivateKeyPem', {
    value: privateKeyPem,
    configurable: true,
    enumerable: false,
    writable: true
  });
}

function keyPairIsValid(publicKeyPem, privateKeyPem) {
  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    const provided = publicKey.export({ type: 'spki', format: 'der' });
    return (
      privateKey.asymmetricKeyType === 'ec' &&
      publicKey.asymmetricKeyType === 'ec' &&
      privateKey.asymmetricKeyDetails &&
      privateKey.asymmetricKeyDetails.namedCurve === 'prime256v1' &&
      provided.length === derived.length &&
      crypto.timingSafeEqual(provided, derived)
    );
  } catch (_error) {
    return false;
  }
}

function persistentIdentityStore(profile, options) {
  const source = options && typeof options === 'object' ? options : {};
  if (source.identityStore && typeof source.identityStore.identity === 'function') {
    return source.identityStore;
  }
  const hasBridgeHome = typeof process.env.AGENT_BRIDGE_HOME === 'string' && process.env.AGENT_BRIDGE_HOME.length > 0;
  const isPersistentProfile = profile && typeof profile === 'object' && Number.isSafeInteger(profile.version);
  return hasBridgeHome || isPersistentProfile ? new RelayIdentityStore() : null;
}

function ensureDeviceIdentity(profile, options) {
  const next = profile && typeof profile === 'object' ? profile : {};
  if (typeof next.physicalDeviceId !== 'string' || next.physicalDeviceId.length === 0) {
    next.physicalDeviceId = createPhysicalDeviceId();
  }
  if (typeof next.bridgeInstanceId !== 'string' || next.bridgeInstanceId.length === 0) {
    next.bridgeInstanceId = createBridgeInstanceId();
  }
  if (typeof next.deviceDisplayName !== 'string' || next.deviceDisplayName.length === 0) {
    next.deviceDisplayName = defaultDisplayName();
  }
  if (typeof next.devicePlatform !== 'string' || next.devicePlatform.length === 0) {
    next.devicePlatform = os.platform();
  }
  const store = persistentIdentityStore(next, options);
  if (store) {
    const source = options && typeof options === 'object' ? options : {};
    const secured = store.identity({
      legacyProfile: source.legacyProfile && typeof source.legacyProfile === 'object' ? source.legacyProfile : next,
      defaults: {
        physicalDeviceId: next.physicalDeviceId,
        bridgeInstanceId: next.bridgeInstanceId,
        deviceDisplayName: next.deviceDisplayName,
        devicePlatform: next.devicePlatform
      }
    });
    next.physicalDeviceId = secured.physicalDeviceId;
    next.bridgeInstanceId = secured.bridgeInstanceId;
    next.deviceDisplayName = secured.deviceDisplayName;
    next.devicePlatform = secured.devicePlatform;
    next.devicePublicKeyPem = secured.devicePublicKeyPem;
    next.deviceKeyFingerprint = secured.deviceKeyFingerprint;
    next.relayIdentityGeneration = secured.generation;
    attachPrivateKey(next, secured.devicePrivateKeyPem);
    return next;
  }
  if (
    typeof next.devicePublicKeyPem !== 'string' ||
    next.devicePublicKeyPem.length === 0 ||
    typeof next.devicePrivateKeyPem !== 'string' ||
    next.devicePrivateKeyPem.length === 0 ||
    !keyPairIsValid(next.devicePublicKeyPem, next.devicePrivateKeyPem)
  ) {
    const pair = createKeyPair();
    next.devicePublicKeyPem = pair.publicKeyPem;
    attachPrivateKey(next, pair.privateKeyPem);
  } else {
    attachPrivateKey(next, next.devicePrivateKeyPem);
  }
  next.deviceKeyFingerprint = keyFingerprint(next.devicePublicKeyPem);
  return next;
}

function publicDeviceIdentity(profile, options) {
  const identity = ensureDeviceIdentity(profile, options);
  return {
    physicalDeviceId: identity.physicalDeviceId,
    bridgeInstanceId: identity.bridgeInstanceId,
    displayName: identity.deviceDisplayName,
    platform: identity.devicePlatform,
    publicKeyPem: identity.devicePublicKeyPem,
    publicKeyFingerprint: identity.deviceKeyFingerprint,
    keyType: SIGNATURE_KEY_TYPE,
    signatureAlgorithm: SIGNATURE_ALGORITHM
  };
}

function canonicalSignatureMaterial(identity, endpoint, clientId, appNonce, serverNonce, issuedAt) {
  return [
    'protocolVersion=agent-bridge.v1',
    'physicalDeviceId=' + identity.physicalDeviceId,
    'bridgeInstanceId=' + identity.bridgeInstanceId,
    'endpoint=' + endpoint,
    'clientId=' + clientId,
    'appNonce=' + appNonce,
    'serverNonce=' + serverNonce,
    'issuedAt=' + String(issuedAt)
  ].join('\n');
}

function signConnectionChallenge(profile, endpoint, clientId, appNonce, options) {
  const securedProfile = ensureDeviceIdentity(profile, options);
  const identity = {
    physicalDeviceId: securedProfile.physicalDeviceId,
    bridgeInstanceId: securedProfile.bridgeInstanceId,
    displayName: securedProfile.deviceDisplayName,
    platform: securedProfile.devicePlatform,
    publicKeyPem: securedProfile.devicePublicKeyPem,
    publicKeyFingerprint: securedProfile.deviceKeyFingerprint,
    keyType: SIGNATURE_KEY_TYPE,
    signatureAlgorithm: SIGNATURE_ALGORITHM
  };
  const serverNonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const material = canonicalSignatureMaterial(identity, endpoint, clientId, appNonce, serverNonce, issuedAt);
  const signer = crypto.createSign(SIGNATURE_ALGORITHM);
  signer.update(material);
  signer.end();
  const signature = signer.sign(securedProfile.devicePrivateKeyPem).toString('base64');
  return {
    deviceIdentity: identity,
    signature: {
      algorithm: SIGNATURE_ALGORITHM,
      keyType: SIGNATURE_KEY_TYPE,
      curve: SIGNATURE_CURVE,
      encoding: SIGNATURE_ENCODING,
      verifier: SIGNATURE_VERIFIER,
      material,
      signature,
      appNonce,
      serverNonce,
      issuedAt
    }
  };
}

function rotateDeviceIdentity(profile, options) {
  const next = profile && typeof profile === 'object' ? profile : {};
  const store = persistentIdentityStore(next, options);
  if (!store || typeof store.rotate !== 'function') {
    const pair = createKeyPair();
    next.devicePublicKeyPem = pair.publicKeyPem;
    next.deviceKeyFingerprint = keyFingerprint(pair.publicKeyPem);
    attachPrivateKey(next, pair.privateKeyPem);
    return ensureDeviceIdentity(next, options);
  }
  const secured = store.rotate({
    legacyProfile: next,
    defaults: {
      physicalDeviceId: next.physicalDeviceId,
      bridgeInstanceId: next.bridgeInstanceId,
      deviceDisplayName: next.deviceDisplayName,
      devicePlatform: next.devicePlatform
    }
  });
  next.physicalDeviceId = secured.physicalDeviceId;
  next.bridgeInstanceId = secured.bridgeInstanceId;
  next.deviceDisplayName = secured.deviceDisplayName;
  next.devicePlatform = secured.devicePlatform;
  next.devicePublicKeyPem = secured.devicePublicKeyPem;
  next.deviceKeyFingerprint = secured.deviceKeyFingerprint;
  next.relayIdentityGeneration = secured.generation;
  attachPrivateKey(next, secured.devicePrivateKeyPem);
  return next;
}

module.exports = {
  canonicalSignatureMaterial,
  ensureDeviceIdentity,
  publicDeviceIdentity,
  rotateDeviceIdentity,
  signConnectionChallenge
};
