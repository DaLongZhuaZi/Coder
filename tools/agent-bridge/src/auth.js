'use strict';

const crypto = require('crypto');
const net = require('net');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const MIN_NONCE_LENGTH = 12;
const MAX_NONCE_LENGTH = 256;
const MAX_CLIENT_ID_LENGTH = 128;

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function daemonAuthConfig(store) {
  const config = store && store.config && store.config.daemon && typeof store.config.daemon === 'object'
    ? store.config.daemon
    : {};
  const auth = config.auth && typeof config.auth === 'object' && !Array.isArray(config.auth)
    ? config.auth
    : {};
  const requestedMode = readString(auth, 'mode', 'bearer');
  return {
    mode: requestedMode === 'bcrypt' ? 'bcrypt' : 'bearer',
    bcryptHash: readString(auth, 'bcryptHash', readString(auth, 'passwordHash', '')),
    updatedAt: readString(auth, 'updatedAt', '')
  };
}

function validateBcryptHash(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return {
      ok: false,
      rounds: 0,
      failureCategory: 'bcrypt_hash_missing',
      message: 'Bcrypt authentication requires a configured password hash.'
    };
  }
  if (!/^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(value)) {
    return {
      ok: false,
      rounds: 0,
      failureCategory: 'bcrypt_hash_invalid',
      message: 'Configured bcrypt hash has an invalid format.'
    };
  }
  let rounds = 0;
  try {
    rounds = bcrypt.getRounds(value);
  } catch (_error) {
    return {
      ok: false,
      rounds: 0,
      failureCategory: 'bcrypt_hash_invalid',
      message: 'Configured bcrypt hash cannot be parsed.'
    };
  }
  if (rounds !== BCRYPT_COST) {
    return {
      ok: false,
      rounds,
      failureCategory: 'bcrypt_cost_invalid',
      message: 'Configured bcrypt hash must use cost ' + String(BCRYPT_COST) + '.'
    };
  }
  return {
    ok: true,
    rounds,
    failureCategory: '',
    message: ''
  };
}

function authConfigurationStatus(store) {
  const auth = daemonAuthConfig(store);
  const validation = validateBcryptHash(auth.bcryptHash);
  const bcryptConfigured = auth.bcryptHash.length > 0;
  const bcryptActive = auth.mode === 'bcrypt' && validation.ok;
  const authReady = auth.mode === 'bearer' || bcryptActive;
  let failureCategory = '';
  let message = 'Bearer token authentication is active.';
  let remediation = '';
  if (auth.mode === 'bcrypt' && !validation.ok) {
    failureCategory = validation.failureCategory;
    message = validation.message + ' Authentication is fail-closed.';
    remediation = 'Run security auth set --local --mode bcrypt --password-env <ENV_NAME>, or recover bearer mode locally.';
  } else if (bcryptActive) {
    message = 'Bcrypt password authentication is active.';
    remediation = 'Clients send the password through the existing Bearer credential channel; use TLS outside loopback networks.';
  } else if (bcryptConfigured) {
    if (validation.ok) {
      message = 'Bearer token authentication is active; a valid inactive bcrypt hash is retained for an explicit mode switch.';
    } else {
      failureCategory = validation.failureCategory;
      message = 'Bearer token authentication is active, but the retained inactive bcrypt hash is invalid.';
      remediation = 'Generate a new cost-12 hash locally before switching to bcrypt mode.';
    }
  }
  return {
    ok: authReady,
    action: 'security.auth.status',
    mode: auth.mode,
    activeMode: authReady ? auth.mode : 'blocked',
    authReady,
    bcryptConfigured,
    bcryptHashValid: bcryptConfigured && validation.ok,
    bcryptActive,
    bcryptCost: validation.rounds,
    bcryptRequiredCost: BCRYPT_COST,
    bcryptHashFingerprint: auth.bcryptHash.length > 0
      ? crypto.createHash('sha256').update(auth.bcryptHash).digest('hex').substring(0, 16)
      : '',
    failureCategory,
    message,
    remediation,
    updatedAt: auth.updatedAt
  };
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(typeof left === 'string' ? left : '', 'utf8');
  const rightBuffer = Buffer.from(typeof right === 'string' ? right : '', 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function authenticateCredential(candidate, store, bearerToken) {
  const credential = typeof candidate === 'string' ? candidate : '';
  const auth = daemonAuthConfig(store);
  if (auth.mode === 'bcrypt') {
    const validation = validateBcryptHash(auth.bcryptHash);
    if (!validation.ok) {
      return {
        ok: false,
        mode: 'bcrypt',
        failureCategory: 'auth_config_invalid',
        detailCategory: validation.failureCategory,
        message: validation.message + ' Authentication is fail-closed.'
      };
    }
    if (credential.length === 0) {
      return {
        ok: false,
        mode: 'bcrypt',
        failureCategory: 'credential_missing',
        detailCategory: '',
        message: 'A password credential is required.'
      };
    }
    try {
      const matches = await bcrypt.compare(credential, auth.bcryptHash);
      return {
        ok: matches,
        mode: 'bcrypt',
        failureCategory: matches ? '' : 'credential_invalid',
        detailCategory: '',
        message: matches ? '' : 'Password credential is invalid.'
      };
    } catch (_error) {
      return {
        ok: false,
        mode: 'bcrypt',
        failureCategory: 'auth_config_invalid',
        detailCategory: 'bcrypt_compare_failed',
        message: 'Bcrypt credential verification failed closed.'
      };
    }
  }
  if (credential.length === 0) {
    return {
      ok: false,
      mode: 'bearer',
      failureCategory: 'credential_missing',
      detailCategory: '',
      message: 'A bearer token is required.'
    };
  }
  const matches = timingSafeEquals(credential, bearerToken);
  return {
    ok: matches,
    mode: 'bearer',
    failureCategory: matches ? '' : 'credential_invalid',
    detailCategory: '',
    message: matches ? '' : 'Bearer token is invalid.'
  };
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    const error = new Error('Password environment variable is empty.');
    error.code = 'password_env_empty';
    throw error;
  }
  if (password.length > 4096) {
    const error = new Error('Password exceeds the 4096 character safety limit.');
    error.code = 'password_too_long';
    throw error;
  }
  return await bcrypt.hash(password, BCRYPT_COST);
}

function normalizeHostHeader(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return '';
  }
  let host = trimmed;
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    host = end > 1 ? host.substring(1, end) : '';
  } else {
    const firstColon = host.indexOf(':');
    const lastColon = host.lastIndexOf(':');
    if (firstColon > 0 && firstColon === lastColon) {
      const port = host.substring(firstColon + 1);
      if (/^[0-9]+$/.test(port)) {
        host = host.substring(0, firstColon);
      }
    }
  }
  if (host.endsWith('.')) {
    host = host.substring(0, host.length - 1);
  }
  return host;
}

function defaultHostAllowed(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  return net.isIP(host) > 0;
}

function hostAllowed(hostHeader, configuredHosts) {
  const host = normalizeHostHeader(hostHeader);
  const allowlist = Array.isArray(configuredHosts)
    ? configuredHosts.map(normalizeHostHeader).filter((item) => item.length > 0)
    : [];
  const defaultPolicy = allowlist.length === 0;
  const allowed = host.length > 0 && (defaultPolicy ? defaultHostAllowed(host) : allowlist.includes(host));
  return {
    allowed,
    host,
    policy: defaultPolicy ? 'localhost_or_ip_literal' : 'explicit_allowlist'
  };
}

function pruneNonceReplayCache(cache, now) {
  if (!cache || typeof cache.entries !== 'function') {
    return;
  }
  for (const entry of cache.entries()) {
    if (entry[1] <= now) {
      cache.delete(entry[0]);
    }
  }
}

function validateAndRememberNonce(cache, clientId, appNonce, ttlMs, nowValue) {
  const nonce = typeof appNonce === 'string' ? appNonce : '';
  const normalizedClientId = typeof clientId === 'string' ? clientId : '';
  if (nonce.length === 0) {
    return {
      ok: false,
      code: 'nonce_missing',
      message: 'WebSocket appNonce is required.',
      remediation: 'Generate a new cryptographically random appNonce for every WebSocket connection.'
    };
  }
  if (nonce.length < MIN_NONCE_LENGTH || nonce.length > MAX_NONCE_LENGTH) {
    return {
      ok: false,
      code: 'nonce_length_invalid',
      message: 'WebSocket appNonce length is outside the accepted range.',
      remediation: 'Use a 12 to 256 character random nonce.'
    };
  }
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(nonce)) {
    return {
      ok: false,
      code: 'nonce_format_invalid',
      message: 'WebSocket appNonce contains unsupported characters.',
      remediation: 'Use a base64, base64url, UUID, or similarly encoded random nonce.'
    };
  }
  if (normalizedClientId.length > MAX_CLIENT_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(normalizedClientId)) {
    return {
      ok: false,
      code: 'client_id_invalid',
      message: 'WebSocket clientId is invalid.',
      remediation: 'Use a printable clientId no longer than 128 characters.'
    };
  }
  const now = typeof nowValue === 'number' && Number.isFinite(nowValue) ? nowValue : Date.now();
  const ttl = typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 10 * 60 * 1000;
  pruneNonceReplayCache(cache, now);
  const material = (normalizedClientId.length > 0 ? normalizedClientId : 'anonymous') + '\u0000' + nonce;
  const cacheKey = crypto.createHash('sha256').update(material).digest('hex');
  if (cache.has(cacheKey)) {
    return {
      ok: false,
      code: 'nonce_replay',
      message: 'WebSocket appNonce has already been used recently.',
      remediation: 'Generate a new appNonce before reconnecting.'
    };
  }
  cache.set(cacheKey, now + ttl);
  return {
    ok: true,
    code: '',
    message: '',
    remediation: ''
  };
}

module.exports = {
  BCRYPT_COST,
  authConfigurationStatus,
  authenticateCredential,
  daemonAuthConfig,
  hashPassword,
  hostAllowed,
  normalizeHostHeader,
  timingSafeEquals,
  validateAndRememberNonce,
  validateBcryptHash
};
