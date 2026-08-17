'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RELAY_IDENTITY_STORE_VERSION = 1;
const RELAY_IDENTITY_CURVE = 'prime256v1';
const SECURITY_DIRECTORY_MODE = 0o700;
const IDENTITY_FILE_MODE = 0o600;

const RelayIdentityFailure = Object.freeze({
  INVALID_ARGUMENT: 'relay_identity_invalid_argument',
  STORE_CORRUPT: 'relay_identity_store_corrupt',
  STORE_WRITE_FAILED: 'relay_identity_store_write_failed',
  LEGACY_KEY_INVALID: 'relay_identity_legacy_key_invalid',
  LEGACY_SCRUB_FAILED: 'relay_identity_legacy_scrub_failed'
});

class RelayIdentityStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RelayIdentityStoreError';
    this.code = code;
  }
}

function identityError(code, message) {
  return new RelayIdentityStoreError(code, message);
}

function defaultBridgeHome() {
  if (process.env.AGENT_BRIDGE_HOME && process.env.AGENT_BRIDGE_HOME.length > 0) {
    return process.env.AGENT_BRIDGE_HOME;
  }
  return path.join(os.homedir(), '.ngf-agent-bridge');
}

function nonEmptyString(value, fallbackValue) {
  return typeof value === 'string' && value.length > 0 ? value : fallbackValue;
}

function isoNow() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return prefix + '_' + crypto.randomBytes(16).toString('base64url');
}

function publicKeyFingerprint(publicKeyPem) {
  const publicKey = assertP256PublicKey(publicKeyPem, RelayIdentityFailure.INVALID_ARGUMENT);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

function legacyPublicKeyFingerprint(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem, 'utf8').digest('hex');
}

function assertP256PublicKey(publicKeyPem, failureCode) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'ec' || details.namedCurve !== RELAY_IDENTITY_CURVE) {
      throw new Error('curve');
    }
    return key;
  } catch (_error) {
    throw identityError(failureCode, 'Relay identity public key is invalid.');
  }
}

function assertP256PrivateKey(privateKeyPem, failureCode) {
  try {
    const key = crypto.createPrivateKey(privateKeyPem);
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'ec' || details.namedCurve !== RELAY_IDENTITY_CURVE) {
      throw new Error('curve');
    }
    return key;
  } catch (_error) {
    throw identityError(failureCode, 'Relay identity private key is invalid.');
  }
}

function normalizeKeyPair(publicKeyPem, privateKeyPem, failureCode) {
  const privateKey = assertP256PrivateKey(privateKeyPem, failureCode);
  const derivedPublicKey = crypto.createPublicKey(privateKey);
  const derivedDer = derivedPublicKey.export({ type: 'spki', format: 'der' });
  let normalizedPublicKeyPem = publicKeyPem;
  if (typeof normalizedPublicKeyPem === 'string' && normalizedPublicKeyPem.length > 0) {
    const providedPublicKey = assertP256PublicKey(normalizedPublicKeyPem, failureCode);
    const providedDer = providedPublicKey.export({ type: 'spki', format: 'der' });
    if (derivedDer.length !== providedDer.length || !crypto.timingSafeEqual(derivedDer, providedDer)) {
      throw identityError(failureCode, 'Relay identity public and private keys do not match.');
    }
  } else {
    normalizedPublicKeyPem = derivedPublicKey.export({ type: 'spki', format: 'pem' });
  }
  return {
    publicKeyPem: normalizedPublicKeyPem,
    privateKeyPem
  };
}

function generateIdentityKeyPair() {
  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: RELAY_IDENTITY_CURVE,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return {
    publicKeyPem: pair.publicKey,
    privateKeyPem: pair.privateKey
  };
}

function ensureDirectorySecure(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: SECURITY_DIRECTORY_MODE });
  if (process.platform !== 'win32') {
    fs.chmodSync(directoryPath, SECURITY_DIRECTORY_MODE);
  }
}

function writeJsonAtomic(filePath, value, mode) {
  ensureDirectorySecure(path.dirname(filePath));
  const suffix = crypto.randomBytes(8).toString('hex');
  const tempPath = filePath + '.tmp-' + process.pid + '-' + suffix;
  let descriptor = null;
  let renamed = false;
  try {
    descriptor = fs.openSync(tempPath, 'wx', mode);
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    if (process.platform !== 'win32') {
      fs.chmodSync(tempPath, mode);
    }
    fs.renameSync(tempPath, filePath);
    renamed = true;
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, mode);
    }
  } catch (_error) {
    throw identityError(RelayIdentityFailure.STORE_WRITE_FAILED, 'Relay identity store could not be written atomically.');
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch (_error) {
        // Preserve the original storage failure.
      }
    }
    if (!renamed) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_error) {
        // Preserve the original storage failure.
      }
    }
  }
}

function readJsonObject(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('shape');
    }
    return value;
  } catch (_error) {
    throw identityError(RelayIdentityFailure.STORE_CORRUPT, 'Relay identity store is corrupt.');
  }
}

function findStringDeep(value, key) {
  if (!value || typeof value !== 'object') return '';
  if (!Array.isArray(value) && typeof value[key] === 'string' && value[key].length > 0) {
    return value[key];
  }
  const children = Array.isArray(value) ? value : Object.keys(value).map((name) => value[name]);
  for (const child of children) {
    const found = findStringDeep(child, key);
    if (found.length > 0) return found;
  }
  return '';
}

function removeLegacyPrivateKey(value) {
  if (!value || typeof value !== 'object') return false;
  let changed = false;
  if (!Array.isArray(value) && Object.keys(value).includes('devicePrivateKeyPem')) {
    delete value.devicePrivateKeyPem;
    changed = true;
  }
  const children = Array.isArray(value) ? value : Object.keys(value).map((name) => value[name]);
  for (const child of children) {
    if (removeLegacyPrivateKey(child)) changed = true;
  }
  return changed;
}

function readOrdinaryJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function normalizeTrustedDevice(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const physicalDeviceId = nonEmptyString(value.physicalDeviceId, nonEmptyString(value.deviceId, ''));
  const publicKeyPem = nonEmptyString(value.publicKeyPem, '');
  let fingerprint = nonEmptyString(value.publicKeyFingerprint, nonEmptyString(value.keyFingerprint, ''));
  if (publicKeyPem.length > 0) {
    assertP256PublicKey(publicKeyPem, RelayIdentityFailure.INVALID_ARGUMENT);
    if (fingerprint.length === 0) fingerprint = publicKeyFingerprint(publicKeyPem);
  }
  if (physicalDeviceId.length === 0 && fingerprint.length === 0) {
    throw identityError(RelayIdentityFailure.INVALID_ARGUMENT, 'A relay device id or public key fingerprint is required.');
  }
  const now = isoNow();
  return {
    physicalDeviceId,
    bridgeInstanceId: nonEmptyString(value.bridgeInstanceId, ''),
    displayName: nonEmptyString(value.displayName, 'Trusted device'),
    platform: nonEmptyString(value.platform, ''),
    publicKeyPem,
    publicKeyFingerprint: fingerprint,
    trusted: value.trusted !== false,
    trustedAt: nonEmptyString(value.trustedAt, now),
    revokedAt: nonEmptyString(value.revokedAt, ''),
    updatedAt: nonEmptyString(value.updatedAt, now)
  };
}

function normalizeStoredTrustedDevices(value) {
  if (!Array.isArray(value)) return [];
  const devices = [];
  for (const item of value) {
    try {
      devices.push(normalizeTrustedDevice(item));
    } catch (_error) {
      throw identityError(RelayIdentityFailure.STORE_CORRUPT, 'Relay trusted device state is corrupt.');
    }
  }
  return devices;
}

function normalizeRecord(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.version !== RELAY_IDENTITY_STORE_VERSION) {
    throw identityError(RelayIdentityFailure.STORE_CORRUPT, 'Relay identity store schema is unsupported.');
  }
  const keyPair = normalizeKeyPair(
    source.devicePublicKeyPem,
    source.devicePrivateKeyPem,
    RelayIdentityFailure.STORE_CORRUPT
  );
  const physicalDeviceId = nonEmptyString(source.physicalDeviceId, '');
  const bridgeInstanceId = nonEmptyString(source.bridgeInstanceId, '');
  if (physicalDeviceId.length === 0 || bridgeInstanceId.length === 0) {
    throw identityError(RelayIdentityFailure.STORE_CORRUPT, 'Relay identity identifiers are missing.');
  }
  const fingerprint = legacyPublicKeyFingerprint(keyPair.publicKeyPem);
  if (
    typeof source.deviceKeyFingerprint === 'string' &&
    source.deviceKeyFingerprint.length > 0 &&
    source.deviceKeyFingerprint !== fingerprint
  ) {
    throw identityError(RelayIdentityFailure.STORE_CORRUPT, 'Relay identity fingerprint is invalid.');
  }
  return {
    version: RELAY_IDENTITY_STORE_VERSION,
    generation: Number.isSafeInteger(source.generation) && source.generation > 0 ? source.generation : 1,
    physicalDeviceId,
    bridgeInstanceId,
    deviceDisplayName: nonEmptyString(source.deviceDisplayName, ''),
    devicePlatform: nonEmptyString(source.devicePlatform, ''),
    devicePublicKeyPem: keyPair.publicKeyPem,
    devicePrivateKeyPem: keyPair.privateKeyPem,
    deviceKeyFingerprint: fingerprint,
    createdAt: nonEmptyString(source.createdAt, isoNow()),
    updatedAt: nonEmptyString(source.updatedAt, isoNow()),
    trustedDevices: normalizeStoredTrustedDevices(source.trustedDevices)
  };
}

function publicTrustedDevice(device) {
  return {
    physicalDeviceId: device.physicalDeviceId,
    bridgeInstanceId: device.bridgeInstanceId,
    displayName: device.displayName,
    platform: device.platform,
    publicKeyPem: device.publicKeyPem,
    publicKeyFingerprint: device.publicKeyFingerprint,
    trusted: device.trusted,
    trustedAt: device.trustedAt,
    revokedAt: device.revokedAt,
    updatedAt: device.updatedAt
  };
}

function publicIdentity(record) {
  const identity = {
    version: record.version,
    generation: record.generation,
    physicalDeviceId: record.physicalDeviceId,
    bridgeInstanceId: record.bridgeInstanceId,
    deviceDisplayName: record.deviceDisplayName,
    devicePlatform: record.devicePlatform,
    devicePublicKeyPem: record.devicePublicKeyPem,
    deviceKeyFingerprint: record.deviceKeyFingerprint,
    publicKeyPem: record.devicePublicKeyPem,
    publicKeyFingerprint: record.deviceKeyFingerprint,
    relayPublicKeyFingerprint: publicKeyFingerprint(record.devicePublicKeyPem),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  Object.defineProperty(identity, 'devicePrivateKeyPem', {
    value: record.devicePrivateKeyPem,
    configurable: false,
    enumerable: false,
    writable: false
  });
  Object.defineProperty(identity, 'privateKeyPem', {
    value: record.devicePrivateKeyPem,
    configurable: false,
    enumerable: false,
    writable: false
  });
  return identity;
}

function sameDevice(left, right) {
  const samePhysical = left.physicalDeviceId.length > 0 && left.physicalDeviceId === right.physicalDeviceId;
  const sameFingerprint = left.publicKeyFingerprint.length > 0 && left.publicKeyFingerprint === right.publicKeyFingerprint;
  return samePhysical || sameFingerprint;
}

class RelayIdentityStore {
  constructor(options) {
    const source = typeof options === 'string'
      ? { baseDirectory: options }
      : (options && typeof options === 'object' ? options : {});
    this.baseDirectory = nonEmptyString(source.baseDirectory, nonEmptyString(source.homeDirectory, defaultBridgeHome()));
    this.securityDirectory = path.join(this.baseDirectory, 'security');
    this.filePath = path.join(this.securityDirectory, 'relay-identity.json');
  }

  identity(options) {
    const record = this.recordForOperation(options);
    return publicIdentity(record);
  }

  rotate(options) {
    const current = this.recordForOperation(options);
    const pair = generateIdentityKeyPair();
    const clearTrustedDevices = options && typeof options === 'object' &&
      options.clearTrustedDevices === true;
    const next = {
      version: RELAY_IDENTITY_STORE_VERSION,
      generation: current.generation + 1,
      physicalDeviceId: current.physicalDeviceId,
      bridgeInstanceId: current.bridgeInstanceId,
      deviceDisplayName: current.deviceDisplayName,
      devicePlatform: current.devicePlatform,
      devicePublicKeyPem: pair.publicKeyPem,
      devicePrivateKeyPem: pair.privateKeyPem,
      deviceKeyFingerprint: legacyPublicKeyFingerprint(pair.publicKeyPem),
      createdAt: current.createdAt,
      updatedAt: isoNow(),
      trustedDevices: clearTrustedDevices ? [] : current.trustedDevices
    };
    this.writeRecord(next);
    this.scrubLegacyFiles(options);
    return publicIdentity(next);
  }

  deviceList() {
    const record = this.recordForOperation(null);
    return record.trustedDevices.map(publicTrustedDevice);
  }

  trustDevice(device) {
    const candidate = normalizeTrustedDevice(device);
    const record = this.recordForOperation(null);
    const now = isoNow();
    let stored = null;
    for (const current of record.trustedDevices) {
      if (!sameDevice(current, candidate)) continue;
      current.physicalDeviceId = nonEmptyString(candidate.physicalDeviceId, current.physicalDeviceId);
      current.bridgeInstanceId = nonEmptyString(candidate.bridgeInstanceId, current.bridgeInstanceId);
      current.displayName = nonEmptyString(candidate.displayName, current.displayName);
      current.platform = nonEmptyString(candidate.platform, current.platform);
      current.publicKeyPem = nonEmptyString(candidate.publicKeyPem, current.publicKeyPem);
      current.publicKeyFingerprint = nonEmptyString(candidate.publicKeyFingerprint, current.publicKeyFingerprint);
      current.trusted = true;
      current.trustedAt = nonEmptyString(current.trustedAt, now);
      current.revokedAt = '';
      current.updatedAt = now;
      stored = current;
      break;
    }
    if (!stored) {
      candidate.trusted = true;
      candidate.revokedAt = '';
      candidate.updatedAt = now;
      record.trustedDevices.push(candidate);
      stored = candidate;
    }
    record.updatedAt = now;
    this.writeRecord(record);
    return publicTrustedDevice(stored);
  }

  revokeDevice(identifier) {
    const lookup = this.normalizeDeviceLookup(identifier);
    const record = this.recordForOperation(null);
    const now = isoNow();
    let revoked = null;
    for (const current of record.trustedDevices) {
      if (!sameDevice(current, lookup)) continue;
      current.trusted = false;
      current.revokedAt = now;
      current.updatedAt = now;
      revoked = current;
      break;
    }
    if (revoked) {
      record.updatedAt = now;
      this.writeRecord(record);
      return publicTrustedDevice(revoked);
    }
    return null;
  }

  isRevoked(identifier) {
    const lookup = this.normalizeDeviceLookup(identifier);
    const record = this.recordForOperation(null);
    for (const current of record.trustedDevices) {
      if (sameDevice(current, lookup)) {
        return current.trusted === false || current.revokedAt.length > 0;
      }
    }
    return false;
  }

  normalizeDeviceLookup(identifier) {
    if (typeof identifier === 'string') {
      return {
        physicalDeviceId: identifier,
        publicKeyFingerprint: identifier
      };
    }
    const source = identifier && typeof identifier === 'object' && !Array.isArray(identifier) ? identifier : {};
    const physicalDeviceId = nonEmptyString(source.physicalDeviceId, nonEmptyString(source.deviceId, ''));
    const publicKeyFingerprintValue = nonEmptyString(
      source.publicKeyFingerprint,
      nonEmptyString(source.keyFingerprint, '')
    );
    if (physicalDeviceId.length === 0 && publicKeyFingerprintValue.length === 0) {
      throw identityError(RelayIdentityFailure.INVALID_ARGUMENT, 'A relay device id or fingerprint is required.');
    }
    return {
      physicalDeviceId,
      publicKeyFingerprint: publicKeyFingerprintValue
    };
  }

  loadOrCreateRecord(options) {
    const source = options && typeof options === 'object' ? options : {};
    if (fs.existsSync(this.filePath)) {
      const current = normalizeRecord(readJsonObject(this.filePath));
      const metadata = source.defaults && typeof source.defaults === 'object' ? source.defaults : source;
      const nextDisplayName = nonEmptyString(metadata.deviceDisplayName, current.deviceDisplayName);
      const nextPlatform = nonEmptyString(metadata.devicePlatform, current.devicePlatform);
      if (nextDisplayName !== current.deviceDisplayName || nextPlatform !== current.devicePlatform) {
        current.deviceDisplayName = nextDisplayName;
        current.devicePlatform = nextPlatform;
        current.updatedAt = isoNow();
        this.writeRecord(current);
      } else {
        this.enforcePermissions();
      }
      return current;
    }
    const record = this.createInitialRecord(source);
    this.writeRecord(record);
    return record;
  }

  recordForOperation(options) {
    const record = this.loadOrCreateRecord(options);
    this.scrubLegacyFiles(options);
    return record;
  }

  createInitialRecord(options) {
    const legacySources = [];
    if (options.legacyProfile && typeof options.legacyProfile === 'object') {
      legacySources.push(options.legacyProfile);
    }
    const profileJson = readOrdinaryJson(path.join(this.baseDirectory, 'profile.json'));
    const configJson = readOrdinaryJson(path.join(this.baseDirectory, 'config.json'));
    if (profileJson) legacySources.push(profileJson);
    if (configJson) legacySources.push(configJson);
    const defaults = options.defaults && typeof options.defaults === 'object' ? options.defaults : options;
    let privateKeyPem = '';
    let publicKeyPem = '';
    let legacyIdentity = null;
    for (const candidate of legacySources) {
      const candidatePrivateKey = findStringDeep(candidate, 'devicePrivateKeyPem');
      if (candidatePrivateKey.length === 0) continue;
      privateKeyPem = candidatePrivateKey;
      publicKeyPem = findStringDeep(candidate, 'devicePublicKeyPem');
      legacyIdentity = candidate;
      break;
    }
    let pair;
    if (privateKeyPem.length > 0) {
      pair = normalizeKeyPair(publicKeyPem, privateKeyPem, RelayIdentityFailure.LEGACY_KEY_INVALID);
    } else {
      pair = generateIdentityKeyPair();
    }
    const metadataSources = [];
    if (legacyIdentity) metadataSources.push(legacyIdentity);
    for (const candidate of legacySources) {
      if (candidate !== legacyIdentity) metadataSources.push(candidate);
    }
    metadataSources.push(defaults);
    const firstValue = (key, fallbackValue) => {
      for (const source of metadataSources) {
        const value = findStringDeep(source, key);
        if (value.length > 0) return value;
      }
      return fallbackValue;
    };
    const now = isoNow();
    return {
      version: RELAY_IDENTITY_STORE_VERSION,
      generation: 1,
      physicalDeviceId: firstValue('physicalDeviceId', randomId('device')),
      bridgeInstanceId: firstValue('bridgeInstanceId', randomId('bridge')),
      deviceDisplayName: firstValue('deviceDisplayName', ''),
      devicePlatform: firstValue('devicePlatform', os.platform()),
      devicePublicKeyPem: pair.publicKeyPem,
      devicePrivateKeyPem: pair.privateKeyPem,
      deviceKeyFingerprint: legacyPublicKeyFingerprint(pair.publicKeyPem),
      createdAt: now,
      updatedAt: now,
      trustedDevices: []
    };
  }

  writeRecord(record) {
    const normalized = normalizeRecord(record);
    writeJsonAtomic(this.filePath, normalized, IDENTITY_FILE_MODE);
  }

  enforcePermissions() {
    ensureDirectorySecure(this.securityDirectory);
    if (process.platform !== 'win32' && fs.existsSync(this.filePath)) {
      fs.chmodSync(this.filePath, IDENTITY_FILE_MODE);
    }
  }

  scrubLegacyFiles(options) {
    const targets = [
      path.join(this.baseDirectory, 'profile.json'),
      path.join(this.baseDirectory, 'config.json')
    ];
    try {
      for (const filePath of targets) {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (_error) {
          if (raw.includes('devicePrivateKeyPem')) {
            throw new Error('legacy-json-invalid');
          }
          continue;
        }
        if (!parsed || typeof parsed !== 'object' || !removeLegacyPrivateKey(parsed)) continue;
        writeJsonAtomic(filePath, parsed, IDENTITY_FILE_MODE);
      }
      if (options && options.legacyProfile && typeof options.legacyProfile === 'object') {
        removeLegacyPrivateKey(options.legacyProfile);
      }
    } catch (_error) {
      throw identityError(RelayIdentityFailure.LEGACY_SCRUB_FAILED, 'Legacy relay identity private key could not be scrubbed.');
    }
  }
}

function createRelayIdentityStore(options) {
  return new RelayIdentityStore(options);
}

module.exports = {
  IDENTITY_FILE_MODE,
  RELAY_IDENTITY_CURVE,
  RELAY_IDENTITY_STORE_VERSION,
  RelayIdentityFailure,
  RelayIdentityStore,
  RelayIdentityStoreError,
  SECURITY_DIRECTORY_MODE,
  createRelayIdentityStore,
  legacyPublicKeyFingerprint,
  publicKeyFingerprint
};
