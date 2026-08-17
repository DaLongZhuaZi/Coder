'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { authConfigurationStatus, validateBcryptHash } = require('./auth');
const { writeJsonFileAtomic } = require('./daemon-store');
const { defaultProfile, loadProfile, profilePath, saveProfile } = require('./profile-store');

const MAX_AUDIT_EVENTS = 1000;

function nowIso() {
  return new Date().toISOString();
}

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallbackValue;
  }
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function normalizeAuditEvent(source) {
  const now = nowIso();
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    auditId: readString(raw, 'auditId', 'aud_' + crypto.randomBytes(10).toString('base64url')),
    category: readString(raw, 'category', 'security'),
    action: readString(raw, 'action', 'event'),
    severity: readString(raw, 'severity', 'info'),
    status: readString(raw, 'status', 'recorded'),
    reason: readString(raw, 'reason', ''),
    message: readString(raw, 'message', ''),
    remoteAddress: readString(raw, 'remoteAddress', ''),
    host: readString(raw, 'host', ''),
    clientId: readString(raw, 'clientId', ''),
    deviceId: readString(raw, 'deviceId', ''),
    fingerprint: readString(raw, 'fingerprint', ''),
    createdAt: readString(raw, 'createdAt', now)
  };
}

class SecurityAuditLog {
  constructor(store) {
    this.store = store || null;
    this.filePath = store && store.paths ? store.paths.securityAudit : '';
  }

  isAvailable() {
    return typeof this.filePath === 'string' && this.filePath.length > 0;
  }

  readAll() {
    if (!this.isAvailable()) {
      return [];
    }
    const value = readJsonFile(this.filePath, []);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(normalizeAuditEvent);
  }

  writeAll(events) {
    if (!this.isAvailable()) {
      return [];
    }
    const normalized = Array.isArray(events) ? events.map(normalizeAuditEvent) : [];
    const trimmed = normalized.slice(0, MAX_AUDIT_EVENTS);
    writeJsonFileAtomic(this.filePath, trimmed);
    return trimmed;
  }

  record(event) {
    if (!this.isAvailable()) {
      return null;
    }
    const normalized = normalizeAuditEvent(event);
    const events = [normalized].concat(this.readAll());
    this.writeAll(events);
    return normalized;
  }

  list(payload) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const limitRaw = typeof source.limit === 'number' && Number.isFinite(source.limit) ? source.limit : 100;
    const limit = Math.max(1, Math.min(Math.floor(limitRaw), 500));
    const severity = readString(source, 'severity', '');
    const events = this.readAll().filter((event) => severity.length === 0 || event.severity === severity);
    return {
      ok: true,
      action: 'security.audit.list',
      events: events.slice(0, limit),
      totalCount: events.length,
      limit,
      storePath: this.filePath
    };
  }

  summary() {
    const events = this.readAll();
    let warnings = 0;
    let errors = 0;
    for (const event of events) {
      if (event.severity === 'error') {
        errors += 1;
      } else if (event.severity === 'warning') {
        warnings += 1;
      }
    }
    return {
      storePath: this.filePath,
      totalCount: events.length,
      warnings,
      errors,
      latestAt: events.length > 0 ? events[0].createdAt : ''
    };
  }
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function normalizeHostValue(value) {
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
    host = end > 1 ? host.substring(1, end) : host;
  } else {
    const colon = host.indexOf(':');
    const lastColon = host.lastIndexOf(':');
    if (colon > 0 && colon === lastColon) {
      const suffix = host.substring(colon + 1);
      if (/^[0-9]+$/.test(suffix)) {
        host = host.substring(0, colon);
      }
    }
  }
  if (host.endsWith('.')) {
    host = host.substring(0, host.length - 1);
  }
  return host;
}

function validateHostValue(value) {
  const host = normalizeHostValue(value);
  if (host.length === 0) {
    return {
      ok: false,
      host: '',
      reason: 'empty_host'
    };
  }
  if (host === '*') {
    return {
      ok: false,
      host,
      reason: 'wildcard_not_allowed'
    };
  }
  if (host.length > 253) {
    return {
      ok: false,
      host,
      reason: 'host_too_long'
    };
  }
  if (/[\s/\\]/.test(host)) {
    return {
      ok: false,
      host,
      reason: 'host_contains_invalid_characters'
    };
  }
  if (!/^[a-z0-9.:-]+$/.test(host)) {
    return {
      ok: false,
      host,
      reason: 'host_contains_invalid_characters'
    };
  }
  if (net.isIP(host) === 0) {
    if (host.includes(':')) {
      return {
        ok: false,
        host,
        reason: 'host_contains_invalid_characters'
      };
    }
    const labels = host.split('.');
    const labelsValid = labels.length > 0 && labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    );
    if (!labelsValid) {
      return {
        ok: false,
        host,
        reason: 'invalid_hostname'
      };
    }
  }
  return {
    ok: true,
    host,
    reason: ''
  };
}

function normalizedHostList(values) {
  const result = [];
  const rejected = [];
  const seen = new Set();
  const items = Array.isArray(values) ? values : [];
  for (const item of items) {
    const validation = validateHostValue(item);
    if (!validation.ok) {
      rejected.push({
        value: typeof item === 'string' ? item : '',
        host: validation.host,
        reason: validation.reason
      });
      continue;
    }
    if (!seen.has(validation.host)) {
      seen.add(validation.host);
      result.push(validation.host);
    }
  }
  return {
    hostnames: result,
    rejected
  };
}

function currentHostnames(store) {
  const config = store && store.config && store.config.daemon ? store.config.daemon : {};
  const raw = Array.isArray(config.hostnames) ? config.hostnames : [];
  return normalizedHostList(raw).hostnames;
}

function hostAllowlistStatus(store) {
  const hostnames = currentHostnames(store);
  return {
    ok: true,
    action: 'security.hosts.status',
    hostnames,
    count: hostnames.length,
    emptyAllowsAll: false,
    defaultPolicyActive: hostnames.length === 0,
    effectivePolicy: hostnames.length === 0 ? 'localhost_or_ip_literal' : 'explicit_allowlist',
    failureCategory: '',
    message: hostnames.length > 0 ?
      'Host allowlist has ' + String(hostnames.length) + ' configured host(s).' :
      'Host allowlist is empty; Bridge accepts localhost names and IP literals only.',
    remediation: hostnames.length > 0 ?
      '' :
      'Add explicit trusted DNS hostnames before exposing Bridge through them.'
  };
}

function setHostAllowlist(store, payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const operation = readString(source, 'operation', 'set');
  const requested = Array.isArray(source.hostnames) ? source.hostnames : [];
  const normalized = normalizedHostList(requested);
  if (normalized.rejected.length > 0) {
    return {
      ok: false,
      action: 'security.hosts.set',
      operation,
      hostnames: currentHostnames(store),
      rejected: normalized.rejected,
      failureCategory: 'host_allowlist_invalid',
      message: 'One or more host allowlist entries are invalid.',
      remediation: 'Use concrete hostnames, IPv4, or IPv6 literals. Wildcards and paths are not allowed.'
    };
  }
  const existing = currentHostnames(store);
  let next = normalized.hostnames;
  if (operation === 'add') {
    next = normalizedHostList(existing.concat(normalized.hostnames)).hostnames;
  } else if (operation === 'remove') {
    const removeSet = new Set(normalized.hostnames);
    next = existing.filter((item) => !removeSet.has(item));
  } else if (operation === 'reset') {
    next = [];
  }
  const config = store.config;
  const daemon = config.daemon && typeof config.daemon === 'object' && !Array.isArray(config.daemon) ? config.daemon : {};
  const nextConfig = Object.assign({}, config, {
    daemon: Object.assign({}, daemon, {
      hostnames: next,
      hostnamesUpdatedAt: nowIso()
    })
  });
  store.writeConfig(nextConfig);
  const status = hostAllowlistStatus(store);
  return Object.assign({}, status, {
    action: 'security.hosts.set',
    operation,
    updated: true,
    rejected: [],
    message: next.length > 0 ?
      'Host allowlist updated with ' + String(next.length) + ' host(s).' :
      'Host allowlist reset; Bridge accepts localhost names and IP literals only.'
  });
}

function tokenFingerprint(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return '';
  }
  return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
}

function bearerTokenSource(config) {
  const envToken = process.env.AGENT_BRIDGE_TOKEN || '';
  const profile = config && config.profile && typeof config.profile === 'object' && !Array.isArray(config.profile)
    ? config.profile
    : (loadProfile() || {});
  const profileToken = readString(profile, 'token', '');
  const runtimeToken = readString(config, 'token', envToken.length > 0 ? envToken : profileToken);
  if (envToken.length > 0) {
    return {
      source: 'env',
      token: envToken,
      profile,
      profileToken
    };
  }
  if (profileToken.length > 0) {
    return {
      source: 'profile',
      token: profileToken,
      profile,
      profileToken
    };
  }
  if (runtimeToken.length > 0) {
    return {
      source: config && config.tokenGenerated === true ? 'generated' : 'runtime',
      token: runtimeToken,
      profile,
      profileToken
    };
  }
  return {
    source: 'none',
    token: '',
    profile,
    profileToken
  };
}

function bearerTokenStatus(config) {
  const source = bearerTokenSource(config || {});
  const rotatable = source.source !== 'env';
  return {
    ok: true,
    action: 'security.token.status',
    activeMode: 'bearer',
    tokenPresent: source.token.length > 0,
    tokenSource: source.source,
    tokenGenerated: source.source === 'generated',
    tokenFingerprint: tokenFingerprint(source.token),
    profilePath: profilePath(),
    profileTokenConfigured: source.profileToken.length > 0,
    rotatable,
    failureCategory: '',
    message: source.source === 'env' ?
      'Bearer token is provided by AGENT_BRIDGE_TOKEN.' :
      source.source === 'profile' ?
        'Bearer token is loaded from the local Bridge profile.' :
        source.source === 'generated' ?
          'Bearer token was generated for this Bridge process and should be persisted or rotated into the profile.' :
          'Bearer token is not configured.',
    remediation: source.source === 'env' ?
      'Rotate the environment variable outside Bridge, then restart the process.' :
      source.source === 'none' ?
        'Run security token rotate to generate and persist a profile token.' :
        ''
  };
}

function rotateBearerToken(config) {
  const status = bearerTokenStatus(config || {});
  if (status.tokenSource === 'env') {
    return Object.assign({}, status, {
      ok: false,
      action: 'security.token.rotate',
      rotated: false,
      failureCategory: 'env_token_not_rotatable',
      message: 'Bearer token is provided by AGENT_BRIDGE_TOKEN and cannot be rotated by Bridge.',
      remediation: 'Update AGENT_BRIDGE_TOKEN outside Bridge and restart the process.'
    });
  }
  const currentProfile = config && config.profile && typeof config.profile === 'object' && !Array.isArray(config.profile)
    ? config.profile
    : (loadProfile() || defaultProfile());
  const newToken = crypto.randomBytes(32).toString('hex');
  const savedProfile = saveProfile(Object.assign({}, currentProfile, {
    token: newToken
  }));
  if (config && typeof config === 'object') {
    config.profile = savedProfile;
    config.token = newToken;
    config.tokenGenerated = false;
  }
  const nextStatus = bearerTokenStatus(Object.assign({}, config || {}, {
    profile: savedProfile,
    token: newToken,
    tokenGenerated: false
  }));
  return Object.assign({}, nextStatus, {
    action: 'security.token.rotate',
    rotated: true,
    previousTokenFingerprint: status.tokenFingerprint,
    message: 'Bearer token rotated and persisted to the local Bridge profile.',
    remediation: 'Reconnect clients with the updated profile token.'
  });
}

function tlsStatus(store, runtime) {
  const config = store && store.config && store.config.daemon ? store.config.daemon : {};
  const tls = config.tls && typeof config.tls === 'object' && !Array.isArray(config.tls) ? config.tls : {};
  const runtimeState = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  const enabled = tls.enabled === true;
  const certPath = readString(tls, 'certPath', '');
  const keyPath = readString(tls, 'keyPath', '');
  const caPath = readString(tls, 'caPath', '');
  const port = readNumber(tls, 'port', 0);
  const certExists = certPath.length > 0 && fs.existsSync(certPath);
  const keyExists = keyPath.length > 0 && fs.existsSync(keyPath);
  const configured = certPath.length > 0 && keyPath.length > 0;
  const active = enabled && runtimeState.active === true;
  const runtimeError = readString(runtimeState, 'lastError', '');
  let failureCategory = '';
  let message = 'TLS preference is disabled.';
  let remediation = 'Use security tls set to store certificate paths, then start or restart Bridge to open the HTTPS listener.';
  if (enabled && !configured) {
    failureCategory = 'tls_config_incomplete';
    message = 'TLS preference is enabled, but certificate and key paths are not both configured.';
    remediation = 'Set both certPath and keyPath, then restart or start Bridge to open the HTTPS listener.';
  } else if (enabled && (!certExists || !keyExists)) {
    failureCategory = 'tls_material_missing';
    message = 'TLS preference is enabled, but the configured certificate or key file does not exist.';
    remediation = 'Check certPath and keyPath, then restart or start Bridge to open the HTTPS listener.';
  } else if (enabled && active) {
    message = 'TLS listener is active for this Bridge process.';
    remediation = '';
  } else if (enabled) {
    failureCategory = runtimeError.length > 0 ? 'tls_listener_failed' : 'tls_listener_inactive';
    message = runtimeError.length > 0 ? runtimeError : 'TLS preference is stored, but this Bridge process has no active HTTPS listener.';
    remediation = runtimeError.length > 0 ? 'Check certificate files, port availability, and Bridge logs.' : 'Restart or start Bridge after storing TLS certificate paths.';
  }
  return {
    ok: true,
    action: 'security.tls.status',
    enabled,
    configured,
    certPath,
    keyPath,
    caPath,
    port,
    certExists,
    keyExists,
    active,
    bindUrl: readString(runtimeState, 'bindUrl', ''),
    startedAt: readString(runtimeState, 'startedAt', ''),
    lastError: runtimeError,
    failureCategory,
    message,
    remediation
  };
}

function bcryptStatus(store) {
  return authConfigurationStatus(store);
}

function setTlsPreference(store, payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const config = store.config;
  const daemon = config.daemon && typeof config.daemon === 'object' && !Array.isArray(config.daemon) ? config.daemon : {};
  const tls = daemon.tls && typeof daemon.tls === 'object' && !Array.isArray(daemon.tls) ? daemon.tls : {};
  const enabled = source.enabled === true;
  const nextConfig = Object.assign({}, config, {
    daemon: Object.assign({}, daemon, {
      tls: {
        enabled,
        certPath: readString(source, 'certPath', readString(tls, 'certPath', '')),
        keyPath: readString(source, 'keyPath', readString(tls, 'keyPath', '')),
        caPath: readString(source, 'caPath', readString(tls, 'caPath', '')),
        port: readNumber(source, 'port', readNumber(tls, 'port', 0)),
        updatedAt: nowIso()
      }
    })
  });
  store.writeConfig(nextConfig);
  return tlsStatus(store);
}

function setAuthPreference(store, payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const config = store.config;
  const daemon = config.daemon && typeof config.daemon === 'object' && !Array.isArray(config.daemon) ? config.daemon : {};
  const auth = daemon.auth && typeof daemon.auth === 'object' && !Array.isArray(daemon.auth) ? daemon.auth : {};
  const requestedMode = readString(source, 'mode', readString(auth, 'mode', 'bearer'));
  if (requestedMode !== 'bearer' && requestedMode !== 'bcrypt') {
    return Object.assign({}, bcryptStatus(store), {
      ok: false,
      code: 'auth_mode_invalid',
      action: 'security.auth.set',
      updated: false,
      failureCategory: 'auth_mode_invalid',
      message: 'Authentication mode must be bearer or bcrypt.',
      remediation: 'Use --mode bearer or --mode bcrypt.'
    });
  }
  const mode = requestedMode;
  const explicitHash = readString(source, 'bcryptHash', '');
  const existingHash = readString(auth, 'bcryptHash', readString(auth, 'passwordHash', ''));
  const bcryptHash = explicitHash.length > 0 ? explicitHash : existingHash;
  if (mode === 'bcrypt') {
    const validation = validateBcryptHash(bcryptHash);
    if (!validation.ok) {
      return Object.assign({}, bcryptStatus(store), {
        ok: false,
        code: validation.failureCategory,
        action: 'security.auth.set',
        updated: false,
        failureCategory: validation.failureCategory,
        message: validation.message + ' Existing authentication settings were not changed.',
        remediation: 'Generate a cost-12 hash locally with --password-env, then retry.'
      });
    }
  } else if (explicitHash.length > 0) {
    const validation = validateBcryptHash(explicitHash);
    if (!validation.ok) {
      return Object.assign({}, bcryptStatus(store), {
        ok: false,
        code: validation.failureCategory,
        action: 'security.auth.set',
        updated: false,
        failureCategory: validation.failureCategory,
        message: validation.message + ' Existing authentication settings were not changed.',
        remediation: 'Remove the hash argument or provide a cost-12 bcrypt hash.'
      });
    }
  }
  const nextConfig = Object.assign({}, config, {
    daemon: Object.assign({}, daemon, {
      auth: {
        mode,
        bcryptHash,
        updatedAt: nowIso()
      }
    })
  });
  store.writeConfig(nextConfig);
  return Object.assign({}, bcryptStatus(store), {
    action: 'security.auth.set',
    updated: true,
    authenticationChanged: true
  });
}

module.exports = {
  SecurityAuditLog,
  bearerTokenStatus,
  bcryptStatus,
  hostAllowlistStatus,
  rotateBearerToken,
  setAuthPreference,
  setHostAllowlist,
  setTlsPreference,
  tlsStatus
};
