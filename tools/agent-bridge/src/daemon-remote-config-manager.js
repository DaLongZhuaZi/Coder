'use strict';

const crypto = require('crypto');
const https = require('https');

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15000;
const REMOTE_CONFIG_SCHEMA_VERSION = 1;
const MAX_CONFIG_VERSION_LENGTH = 128;
const MAX_SCOPE_KEYS = 16;
const MAX_VALUE_KEYS = 128;
const MAX_VALUE_DEPTH = 8;
const MAX_STRING_VALUE_LENGTH = 2048;
const BUILTIN_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAstG7EB//353Jf0uIRruR\n' +
  'SKZ55qFuYsKeCFbNInUCGDFGmkUaHSrr3TnjxIYhswjdD64wvaOOCkHzGSzVubc+\n' +
  'AQQAwNXRcQCFkTxDLBqLSZSGzwA4YkeXUoZWh0meC+uvslNbnhh4RaxOrp6XZ2vs\n' +
  'L8bEnZISFnKpLqNHdCsUlFSpIHUfKixhLt79GB6B7hGHNRx1SFyry2pTuOGIEQ6A\n' +
  '/1puNNl3XtBdO6eqCkCwao0ooiolLNxUb+q7+ijx3sC8dzAmW4LtsFgYEHDizZXA\n' +
  'y3SjlSHtbeB6d58DMMYIr3VUWp/hmTkvDfKsY+krYNR5uz1gT99q/HikY0cSa/IITQIDAQAB\n' +
  '-----END PUBLIC KEY-----\n';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).filter((key) => key !== 'signature').sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function digestDocument(document) {
  return crypto.createHash('sha256').update(canonicalJson(document), 'utf8').digest('hex');
}

function normalizeRemoteConfigUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || /[\r\n\0]/.test(value)) return null;
  let parsed;
  try { parsed = new URL(value.trim()); } catch (_error) { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null;
  if (!parsed.hostname || parsed.hostname.length > 253) return null;
  return parsed.toString();
}

function versionParts(value) {
  return String(value || '0.0.0').replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(actual, minimum) {
  const left = versionParts(actual); const right = versionParts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validVersionString(value) {
  return typeof value === 'string' && /^v?\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(value.trim());
}

function validateValueShape(value, depth, keyCount) {
  if (depth > MAX_VALUE_DEPTH) return 'config_values_too_deep';
  if (typeof value === 'string') return value.length <= MAX_STRING_VALUE_LENGTH ? '' : 'config_value_too_long';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return typeof value === 'number' && !Number.isFinite(value) ? 'config_value_invalid' : '';
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_VALUE_KEYS) return 'config_values_too_large';
    for (const item of value) {
      const nestedError = validateValueShape(item, depth + 1, keyCount);
      if (nestedError) return nestedError;
    }
    return '';
  }
  if (!isPlainObject(value)) return 'config_value_invalid';
  const keys = Object.keys(value);
  if (keyCount + keys.length > MAX_VALUE_KEYS) return 'config_values_too_large';
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return 'config_key_invalid';
    const nestedError = validateValueShape(value[key], depth + 1, keyCount + keys.length);
    if (nestedError) return nestedError;
  }
  return '';
}

function invalidValidation(failureCategory, message, warnings) {
  return { ok: false, failureCategory, message, warnings: warnings || [] };
}

function containsForbiddenKey(value, parentKey) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = /(token|password|secret|privatekey|private_key|bearer|credential|environment|\benv\b)/i;
  for (const key of Object.keys(value)) {
    if (forbidden.test(key) || forbidden.test(parentKey || '')) return true;
    if (containsForbiddenKey(value[key], key)) return true;
  }
  return false;
}

function downloadJson(url, redirects) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = normalizeRemoteConfigUrl(url);
    if (!normalizedUrl) { reject(new Error('https_url_invalid')); return; }
    const target = new URL(normalizedUrl);
    const request = https.get(target, { timeout: DEFAULT_TIMEOUT_MS, headers: { accept: 'application/json', 'user-agent': 'ngf-agent-bridge' } }, (response) => {
      const location = typeof response.headers.location === 'string' ? response.headers.location : '';
      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) { reject(new Error('redirect_limit')); return; }
        const next = new URL(location, target).toString();
        downloadJson(next, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); reject(new Error('http_' + response.statusCode)); return; }
      const chunks = []; let size = 0;
      response.on('data', (chunk) => { size += chunk.length; if (size > MAX_BYTES) request.destroy(new Error('response_too_large')); else chunks.push(chunk); });
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_error) { reject(new Error('invalid_json')); } });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

function result(action, ok, extra) {
  return Object.assign({ ok, action, preview: false, confirmed: false, planId: '', configVersion: '', activeVersion: '', previousVersion: '', requiresRestart: false, failureCategory: '', message: '', remediation: '', warnings: [], updatedAt: new Date().toISOString() }, extra || {});
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') return fallbackValue;
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function scopedResult(action, ok, payload, extra) {
  const hostProfileId = readString(payload, 'hostProfileId', '');
  const scope = hostProfileId.length > 0 ? { hostProfileId } : {};
  return result(action, ok, Object.assign(scope, extra || {}));
}

class DaemonRemoteConfigManager {
  constructor(store, options) {
    const opts = options && typeof options === 'object' ? options : {};
    this.store = store;
    this.bridgeVersion = typeof opts.bridgeVersion === 'string' ? opts.bridgeVersion : '0.0.0';
    this.instanceId = typeof opts.instanceId === 'string' ? opts.instanceId : store.instanceId;
    this.generation = typeof opts.generation === 'function' ? opts.generation : () => 0;
    this.fetchDocument = typeof opts.fetchDocument === 'function' ? opts.fetchDocument : (url) => downloadJson(url, 0);
    this.publicKey = typeof opts.publicKey === 'string' ? opts.publicKey : (process.env.AGENT_BRIDGE_REMOTE_CONFIG_PUBLIC_KEY || BUILTIN_PUBLIC_KEY);
    this.plans = new Map();
    this.reconcilePersistedState();
  }

  state() { return this.store.readDaemonRemoteConfigState(); }

  validateStoredEntry(entry) {
    if (!isPlainObject(entry) || !isPlainObject(entry.document)) {
      return { present: Boolean(entry), ok: false, validation: invalidValidation('state_entry_invalid', 'Persisted remote config entry is invalid.', []) };
    }
    const validation = this.validateDocument(entry.document);
    if (validation.ok && typeof entry.digest === 'string' && entry.digest.length > 0 && entry.digest !== validation.digest) {
      return { present: true, ok: false, validation: invalidValidation('state_digest_mismatch', 'Persisted remote config digest does not match its document.', validation.warnings) };
    }
    if (typeof entry.sourceUrl === 'string' && entry.sourceUrl.length > 0 && !normalizeRemoteConfigUrl(entry.sourceUrl)) {
      return { present: true, ok: false, validation: invalidValidation('state_source_url_invalid', 'Persisted remote config source URL is invalid.', validation.warnings) };
    }
    return { present: true, ok: validation.ok, validation };
  }

  reconcilePersistedState() {
    const state = this.state();
    if (!isPlainObject(state)) return;
    let changed = false;
    let degraded = state.degraded === true;
    const activeCheck = this.validateStoredEntry(state.active);
    const previousCheck = this.validateStoredEntry(state.previous);
    const fetchedCheck = this.validateStoredEntry(state.fetched);
    if (activeCheck.present && !activeCheck.ok) {
      degraded = true;
      if (isPlainObject(state.active)) state.active.validation = activeCheck.validation;
      changed = true;
    } else if (activeCheck.present && isPlainObject(state.active) && JSON.stringify(state.active.validation || {}) !== JSON.stringify(activeCheck.validation)) {
      state.active.validation = activeCheck.validation;
      changed = true;
    }
    if (previousCheck.present && !previousCheck.ok) {
      degraded = true;
      if (isPlainObject(state.previous)) state.previous.validation = previousCheck.validation;
      changed = true;
    } else if (previousCheck.present && isPlainObject(state.previous) && JSON.stringify(state.previous.validation || {}) !== JSON.stringify(previousCheck.validation)) {
      state.previous.validation = previousCheck.validation;
      changed = true;
    }
    if (fetchedCheck.present && !fetchedCheck.ok) {
      state.fetched = null;
      degraded = true;
      changed = true;
    }
    if (state.version !== 1) {
      state.version = 1;
      changed = true;
    }
    if (state.degraded !== degraded) {
      state.degraded = degraded;
      changed = true;
    }
    if (changed) {
      try {
        this.store.writeDaemonRemoteConfigState(state);
      } catch (_error) {
        // Startup must remain available even when the diagnostic reconcile cannot be persisted.
      }
    }
  }

  validateDocument(document) {
    const warnings = [];
    if (!document || typeof document !== 'object' || Array.isArray(document)) return { ok: false, failureCategory: 'schema_invalid', message: 'Remote config must be an object.', warnings };
    for (const key of ['schemaVersion', 'configVersion', 'issuedAt', 'expiresAt', 'minimumBridgeVersion', 'scope', 'priority', 'values', 'signature']) if (document[key] === undefined) return { ok: false, failureCategory: 'schema_invalid', message: 'Missing field: ' + key, warnings };
    if (document.schemaVersion !== REMOTE_CONFIG_SCHEMA_VERSION || !Number.isInteger(document.schemaVersion)) return invalidValidation('schema_invalid', 'Remote config schemaVersion is unsupported.', warnings);
    if (!validVersionString(document.configVersion) || document.configVersion.length > MAX_CONFIG_VERSION_LENGTH) return invalidValidation('schema_invalid', 'Remote config configVersion is invalid.', warnings);
    if (!validVersionString(document.minimumBridgeVersion)) return invalidValidation('schema_invalid', 'Remote config minimumBridgeVersion is invalid.', warnings);
    if (!isPlainObject(document.scope) || Object.keys(document.scope).length > MAX_SCOPE_KEYS) return invalidValidation('schema_invalid', 'Remote config scope is invalid.', warnings);
    if (typeof document.scope.kind !== 'string' || document.scope.kind.trim().length === 0 || document.scope.kind.length > 64) return invalidValidation('schema_invalid', 'Remote config scope.kind is invalid.', warnings);
    if (!Number.isInteger(document.priority) || document.priority < 0 || document.priority > 1000) return invalidValidation('schema_invalid', 'Remote config priority is invalid.', warnings);
    if (!isPlainObject(document.values)) return invalidValidation('schema_invalid', 'Remote config values must be an object.', warnings);
    const valueError = validateValueShape(document.values, 0, 0);
    if (valueError) return invalidValidation(valueError, 'Remote config values are outside the supported limits.', warnings);
    if (typeof document.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(document.signature) || document.signature.length > 8192) return invalidValidation('signature_invalid', 'Remote config signature is invalid.', warnings);
    const knownFields = ['schemaVersion', 'configVersion', 'issuedAt', 'expiresAt', 'minimumBridgeVersion', 'scope', 'priority', 'values', 'digest', 'signature'];
    const unknownFields = Object.keys(document).filter((key) => !knownFields.includes(key));
    if (unknownFields.length > 0) warnings.push('unknown_fields_ignored');
    if (containsForbiddenKey(document.values, 'values')) return { ok: false, failureCategory: 'secret_field_rejected', message: 'Remote config contains a forbidden secret field.', warnings };
    const now = Date.now(); const issuedAt = Date.parse(document.issuedAt); const expiresAt = Date.parse(document.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 300000) return { ok: false, failureCategory: 'issued_at_invalid', message: 'Remote config issuedAt is invalid.', warnings };
    if (expiresAt <= issuedAt) return { ok: false, failureCategory: 'expires_at_invalid', message: 'Remote config expiresAt must be after issuedAt.', warnings };
    if (expiresAt <= now) return { ok: false, failureCategory: 'config_expired', message: 'Remote config is expired.', warnings };
    if (!versionAtLeast(this.bridgeVersion, document.minimumBridgeVersion)) return { ok: false, failureCategory: 'bridge_version_incompatible', message: 'Bridge version is below minimumBridgeVersion.', warnings };
    let validSignature = false;
    try { validSignature = crypto.verify('RSA-SHA256', Buffer.from(canonicalJson(document), 'utf8'), this.publicKey, Buffer.from(String(document.signature), 'base64')); } catch (_error) { validSignature = false; }
    if (!validSignature) return { ok: false, failureCategory: 'signature_invalid', message: 'Remote config signature is invalid.', warnings };
    return { ok: true, digest: digestDocument(document), warnings };
  }

  status(payload) {
    const state = this.state(); const active = state.active || null; const previous = state.previous || null;
    const activeValidation = active ? this.validateStoredEntry(active).validation : {};
    const previousValidation = previous ? this.validateStoredEntry(previous).validation : {};
    const degraded = state.degraded === true || activeValidation.ok === false || previousValidation.ok === false;
    const activeVersion = active && typeof active.configVersion === 'string' ? active.configVersion : '';
    const previousVersion = previous && typeof previous.configVersion === 'string' ? previous.configVersion : '';
    const fetchedVersion = state.fetched && state.fetched.document && typeof state.fetched.document.configVersion === 'string'
      ? state.fetched.document.configVersion : '';
    const sourceUrl = active && typeof active.sourceUrl === 'string' && normalizeRemoteConfigUrl(active.sourceUrl)
      ? active.sourceUrl : '';
    const manifestDigest = active && typeof active.digest === 'string' && /^[a-f0-9]{64}$/i.test(active.digest)
      ? active.digest : '';
    return scopedResult('daemon.config.status', true, payload, {
      activeVersion,
      previousVersion,
      fetchedVersion,
      sourceUrl,
      manifestDigest,
      validation: activeValidation,
      previousValidation,
      degraded,
      failureCategory: degraded ? (activeValidation.failureCategory || previousValidation.failureCategory || 'remote_config_degraded') : ''
    });
  }

  async fetch(payload) {
    const url = normalizeRemoteConfigUrl(readString(payload, 'url', ''));
    if (!url) return scopedResult('daemon.config.fetch', false, payload, { failureCategory: 'https_url_invalid', message: 'Remote config URL must be a credential-free HTTPS URL.', remediation: 'Use a trusted HTTPS endpoint without embedded credentials or a fragment.' });
    try {
      const document = await this.fetchDocument(url); const validation = this.validateDocument(document);
      if (!validation.ok) return scopedResult('daemon.config.fetch', false, payload, Object.assign(validation, { remediation: 'Fix the signed remote config and fetch again.' }));
      const state = this.state();
      state.fetched = { document, sourceUrl: url, digest: validation.digest, validation, fetchedAt: new Date().toISOString() };
      try {
        this.store.writeDaemonRemoteConfigState(state);
      } catch (_error) {
        return scopedResult('daemon.config.fetch', false, payload, { failureCategory: 'state_persist_failed', message: 'Remote config state could not be saved.', remediation: 'Check Bridge home permissions and retry.' });
      }
      return scopedResult('daemon.config.fetch', true, payload, { configVersion: document.configVersion, manifestDigest: validation.digest, sourceUrl: url, validation });
    } catch (error) { return scopedResult('daemon.config.fetch', false, payload, { failureCategory: error instanceof Error ? error.message : 'network_error', message: 'Remote config download failed.', remediation: 'Check HTTPS connectivity and endpoint limits.' }); }
  }

  validate(payload) {
    const state = this.state(); const fetched = state.fetched;
    if (!fetched || !fetched.document) return scopedResult('daemon.config.validate', false, payload, { failureCategory: 'config_missing', message: 'No fetched remote config is available.', remediation: 'Fetch a signed config first.' });
    const validation = this.validateDocument(fetched.document);
    if (validation.ok && typeof fetched.digest === 'string' && fetched.digest.length > 0 && fetched.digest !== validation.digest) return scopedResult('daemon.config.validate', false, payload, { failureCategory: 'state_digest_mismatch', message: 'Fetched remote config digest does not match its document.', remediation: 'Fetch the signed config again.' });
    return scopedResult('daemon.config.validate', validation.ok, payload, Object.assign(validation, { configVersion: fetched.document.configVersion, manifestDigest: validation.digest }));
  }

  preview(payload) {
    const state = this.state(); const fetched = state.fetched;
    if (!fetched || !fetched.document) return scopedResult('daemon.config.preview', false, payload, { failureCategory: 'config_missing', message: 'No fetched remote config is available.', remediation: 'Fetch a signed config first.' });
    const validation = this.validateDocument(fetched.document);
    if (!validation.ok) return scopedResult('daemon.config.preview', false, payload, validation);
    if (typeof fetched.digest === 'string' && fetched.digest.length > 0 && fetched.digest !== validation.digest) return scopedResult('daemon.config.preview', false, payload, { failureCategory: 'state_digest_mismatch', message: 'Fetched remote config digest does not match its document.', remediation: 'Fetch the signed config again.' });
    const planId = crypto.randomBytes(18).toString('base64url');
    const generation = this.generation();
    const plan = { planId, action: 'apply', sourceUrl: fetched.sourceUrl, configVersion: fetched.document.configVersion, digest: fetched.digest, instanceId: this.instanceId, generation, hostProfileId: readString(payload, 'hostProfileId', ''), expiresAt: Date.now() + 300000 };
    this.plans.set(planId, plan);
    const localConfig = this.store.config || {}; const values = fetched.document.values || {}; const overriddenFields = [];
    for (const key of Object.keys(values)) if (localConfig[key] !== undefined) overriddenFields.push(key);
    return scopedResult('daemon.config.preview', true, payload, { preview: true, planId, configVersion: plan.configVersion, manifestDigest: plan.digest, instanceId: this.instanceId, generation, overriddenFields, requiresRestart: true, scope: fetched.document.scope, priority: fetched.document.priority });
  }

  apply(payload) {
    if (payload.confirm !== true) return scopedResult('daemon.config.apply', false, payload, { failureCategory: 'confirm_required', message: 'Remote config apply requires confirm=true.', remediation: 'Preview and confirm the plan.' });
    const state = this.state(); const fetched = state.fetched; const plan = this.plans.get(readString(payload, 'planId', ''));
    if (plan && readString(plan, 'hostProfileId', '').length > 0 && readString(plan, 'hostProfileId', '') !== readString(payload, 'hostProfileId', '')) return scopedResult('daemon.config.apply', false, payload, { failureCategory: 'host_scope_mismatch', message: 'Remote config plan belongs to another host profile.', remediation: 'Preview the configuration from the current host profile.' });
    if (!plan || !fetched || plan.digest !== fetched.digest || plan.sourceUrl !== fetched.sourceUrl || plan.configVersion !== fetched.document.configVersion || plan.instanceId !== this.instanceId || plan.generation !== this.generation() || Date.now() > plan.expiresAt) return scopedResult('daemon.config.apply', false, payload, { failureCategory: 'plan_expired', message: 'Remote config plan is stale or expired.', remediation: 'Preview the current config again.' });
    const validation = this.validateDocument(fetched.document); if (!validation.ok) return scopedResult('daemon.config.apply', false, payload, validation);
    if (typeof fetched.digest !== 'string' || fetched.digest !== validation.digest) return scopedResult('daemon.config.apply', false, payload, { failureCategory: 'state_digest_mismatch', message: 'Fetched remote config digest does not match its document.', remediation: 'Fetch the signed config again.' });
    state.previous = state.active || null; state.active = { document: fetched.document, sourceUrl: fetched.sourceUrl, digest: fetched.digest, configVersion: fetched.document.configVersion, validation, appliedAt: new Date().toISOString() }; state.degraded = false;
    try {
      this.store.writeDaemonRemoteConfigState(state);
    } catch (_error) {
      return scopedResult('daemon.config.apply', false, payload, { failureCategory: 'state_persist_failed', message: 'Remote config state could not be saved.', remediation: 'Check Bridge home permissions and retry.' });
    }
    this.plans.delete(payload.planId);
    return scopedResult('daemon.config.apply', true, payload, { confirmed: true, configVersion: state.active.configVersion, activeVersion: state.active.configVersion, previousVersion: state.previous ? state.previous.configVersion : '', requiresRestart: true });
  }

  rollback(payload) {
    const state = this.state(); const previous = state.previous;
    if (!previous) return scopedResult('daemon.config.rollback', false, payload, { failureCategory: 'rollback_unavailable', message: 'No previous remote config is available.', remediation: 'Apply at least two valid config versions first.' });
    const previousValidation = this.validateStoredEntry(previous);
    if (!previousValidation.ok) return scopedResult('daemon.config.rollback', false, payload, Object.assign(previousValidation.validation, { remediation: 'Fetch and apply a valid config before retrying rollback.' }));
    if (payload.confirm !== true) {
      const planId = crypto.randomBytes(18).toString('base64url'); this.plans.set(planId, { planId, action: 'rollback', digest: previous.digest, sourceUrl: previous.sourceUrl, configVersion: previous.configVersion, instanceId: this.instanceId, generation: this.generation(), hostProfileId: readString(payload, 'hostProfileId', ''), expiresAt: Date.now() + 300000 });
      return scopedResult('daemon.config.rollback', true, payload, { preview: true, planId, configVersion: previous.configVersion, activeVersion: state.active ? state.active.configVersion : '', previousVersion: previous.configVersion, requiresRestart: true });
    }
    const plan = this.plans.get(readString(payload, 'planId', ''));
    if (plan && readString(plan, 'hostProfileId', '').length > 0 && readString(plan, 'hostProfileId', '') !== readString(payload, 'hostProfileId', '')) return scopedResult('daemon.config.rollback', false, payload, { failureCategory: 'host_scope_mismatch', message: 'Remote config rollback plan belongs to another host profile.', remediation: 'Preview rollback from the current host profile.' });
    if (!plan || plan.action !== 'rollback' || plan.digest !== previous.digest || plan.sourceUrl !== previous.sourceUrl || plan.configVersion !== previous.configVersion || plan.instanceId !== this.instanceId || plan.generation !== this.generation() || Date.now() > plan.expiresAt) return scopedResult('daemon.config.rollback', false, payload, { failureCategory: 'plan_expired', message: 'Rollback plan is stale or expired.', remediation: 'Preview rollback again.' });
    const current = state.active; state.active = previous; state.previous = current || null;
    try {
      this.store.writeDaemonRemoteConfigState(state);
    } catch (_error) {
      return scopedResult('daemon.config.rollback', false, payload, { failureCategory: 'state_persist_failed', message: 'Remote config rollback could not be saved.', remediation: 'Check Bridge home permissions and retry.' });
    }
    this.plans.delete(payload.planId);
    return scopedResult('daemon.config.rollback', true, payload, { confirmed: true, activeVersion: state.active.configVersion, previousVersion: state.previous ? state.previous.configVersion : '', requiresRestart: true });
  }
}

module.exports = { DaemonRemoteConfigManager, canonicalJson, digestDocument, versionAtLeast, normalizeRemoteConfigUrl };
