'use strict';

const crypto = require('crypto');
const { URL } = require('url');

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const DEFAULT_SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SNAPSHOT_CACHE_ENTRIES = 128;
const ENVIRONMENT_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const MAX_PUBLIC_TEXT_BYTES = 1024;
const MAX_QUOTA_VALUE = Number.MAX_SAFE_INTEGER;
const PROVIDER_USAGE_AVAILABILITY_STATES = Object.freeze([
  'unsupported',
  'available',
  'available-empty',
  'failed',
  'stale',
  'loading'
]);

function text(source, key, fallback) {
  if (!source || typeof source !== 'object' || typeof source[key] !== 'string') {
    return fallback;
  }
  return source[key];
}

function number(source, key) {
  if (!source || typeof source !== 'object' || typeof source[key] !== 'number' || !Number.isFinite(source[key])) {
    return undefined;
  }
  return source[key];
}

function boolean(source, key, fallback) {
  if (!source || typeof source !== 'object' || typeof source[key] !== 'boolean') {
    return fallback;
  }
  return source[key];
}

function normalizeFailureCategory(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return /^[a-z][a-z0-9_]{0,63}$/.test(normalized) ? normalized : fallback;
}

function object(source, key) {
  if (!source || typeof source !== 'object' || !source[key] || typeof source[key] !== 'object' || Array.isArray(source[key])) {
    return null;
  }
  return source[key];
}

function array(source, key) {
  if (!source || typeof source !== 'object' || !Array.isArray(source[key])) {
    return [];
  }
  return source[key];
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = number(source, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeQuotaNumber(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUOTA_VALUE
    ? value : undefined;
}

function normalizeProviderUsageAvailabilityState(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim().toLowerCase();
  return PROVIDER_USAGE_AVAILABILITY_STATES.includes(normalized) ? normalized : '';
}

function normalizeIso(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function redactProviderUsageText(value, maxBytes) {
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : MAX_PUBLIC_TEXT_BYTES;
  let output = typeof value === 'string' ? value : '';
  output = output.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  output = output.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, '[redacted-private-key]');
  output = output.replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[redacted]');
  output = output.replace(/((?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]');
  // Provider diagnostics are untrusted public text. Remove URL userinfo and
  // credential query values before the text can enter RPC responses or the
  // persisted usage store.
  output = output.replace(/\bhttps?:\/\/[^\s<>"']+/gi, (candidate) => {
    const authorityMatch = candidate.match(/^(https?:\/\/)([^/?#\s]+)([\s\S]*)$/i);
    if (!authorityMatch) return candidate;
    const authority = authorityMatch[2];
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return candidate;
    return authorityMatch[1] + '[redacted]@' + authority.substring(atIndex + 1) + authorityMatch[3];
  });
  output = output.replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|client_secret|secret|password|credential)=)[^&#\s]*/gi, '$1[redacted]');
  if (Buffer.byteLength(output, 'utf8') <= limit) return output;
  let low = 0;
  let high = output.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(output.substring(0, middle), 'utf8') <= limit) low = middle;
    else high = middle - 1;
  }
  let end = low;
  if (end > 0 && end < output.length) {
    const code = output.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
  }
  return output.substring(0, end);
}

function normalizeWindow(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const name = redactProviderUsageText(text(raw, 'name', text(raw, 'window', text(raw, 'id', 'window-' + String(index + 1)))), 128) || 'window-' + String(index + 1);
  const label = redactProviderUsageText(text(raw, 'label', name), 256) || name;
  const item = {
    name,
    label,
    status: redactProviderUsageText(text(raw, 'status', 'unavailable'), 64) || 'unavailable',
    unit: redactProviderUsageText(text(raw, 'unit', 'credits'), 64) || 'credits',
    resetAt: normalizeIso(text(raw, 'resetAt', text(raw, 'reset_at', '')))
  };
  const remaining = normalizeQuotaNumber(firstNumber(raw, ['remaining', 'remainingCredits', 'remaining_credits', 'creditsRemaining']));
  const limit = normalizeQuotaNumber(firstNumber(raw, ['limit', 'limitCredits', 'limit_credits', 'creditsLimit']));
  const used = normalizeQuotaNumber(firstNumber(raw, ['used', 'usedCredits', 'used_credits', 'creditsUsed']));
  if (remaining !== undefined) item.remaining = remaining;
  if (limit !== undefined) item.limit = limit;
  if (used !== undefined) item.used = used;
  return item;
}

function normalizeProviderUsage(providerId, raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const body = object(source, 'usage') || object(source, 'data') || source;
  const statusValue = text(body, 'status', source.ok === false ? 'unavailable' : 'available').trim().toLowerCase();
  const status = statusValue.length > 0 ? statusValue : 'unavailable';
  const failureCategory = normalizeFailureCategory(
    text(source, 'failureCategory', text(body, 'failureCategory', '')),
    ''
  );
  const explicitAvailabilityState = normalizeProviderUsageAvailabilityState(
    text(source, 'availabilityState', text(body, 'availabilityState', ''))
  );
  const expiresAt = normalizeIso(text(body, 'expiresAt', ''));
  const expiresAtMs = expiresAt.length > 0 ? Date.parse(expiresAt) : NaN;
  const stale = boolean(body, 'stale', boolean(source, 'stale', false)) ||
    (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now());
  const result = {
    ok: source.ok !== false && status !== 'unavailable' && status !== 'error' && status !== 'failed',
    action: 'provider.usage.list',
    providerId,
    hostProfileId: text(source, 'hostProfileId', ''),
    sessionId: text(source, 'sessionId', ''),
    agentId: text(source, 'agentId', ''),
    window: text(source, 'window', text(body, 'window', 'session')),
    status,
    availabilityState: '',
    planLabel: redactProviderUsageText(text(body, 'planLabel', text(body, 'plan', '')), 256),
    source: redactProviderUsageText(text(body, 'source', 'provider'), 128) || 'provider',
    fetchedAt: normalizeIso(text(body, 'fetchedAt', '')) || new Date().toISOString(),
    expiresAt,
    stale,
    windows: [],
    details: [],
    warnings: [],
    failureCategory,
    message: redactProviderUsageText(text(source, 'message', ''), 1024),
    remediation: redactProviderUsageText(text(source, 'remediation', ''), 1024)
  };
  const rawWindows = array(body, 'windows').length > 0 ? array(body, 'windows') : array(body, 'balances');
  for (let index = 0; index < rawWindows.length && index < 32; index += 1) {
    const window = normalizeWindow(rawWindows[index], index);
    if (window) {
      result.windows.push(window);
    }
  }
  const rawDetails = array(body, 'details');
  for (let index = 0; index < rawDetails.length && index < 64; index += 1) {
    const detail = rawDetails[index];
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      continue;
    }
    result.details.push({
      key: redactProviderUsageText(text(detail, 'key', 'detail-' + String(index + 1)), 128),
      label: redactProviderUsageText(text(detail, 'label', text(detail, 'key', '')), 256),
      value: redactProviderUsageText(text(detail, 'value', ''), 1024),
      status: redactProviderUsageText(text(detail, 'status', 'info'), 64) || 'info'
    });
  }
  for (const warning of array(body, 'warnings')) {
    if (typeof warning === 'string' && warning.length > 0 && result.warnings.length < 20) {
      result.warnings.push(redactProviderUsageText(warning, 1024));
    }
  }
  const hasUsageData = result.windows.length > 0 || result.details.length > 0 || result.planLabel.length > 0;
  let availabilityState = explicitAvailabilityState;
  if (availabilityState.length > 0 && (result.failureCategory.length > 0 || source.ok === false)) {
    availabilityState = result.failureCategory === 'capability_unavailable' ? 'unsupported' : 'failed';
  }
  if (availabilityState.length === 0) {
    if (result.failureCategory === 'capability_unavailable') {
      availabilityState = 'unsupported';
    } else if (result.failureCategory.length > 0 || source.ok === false ||
      status === 'unavailable' || status === 'error' || status === 'failed') {
      availabilityState = 'failed';
    } else if (stale) {
      availabilityState = 'stale';
    } else if (!hasUsageData) {
      availabilityState = 'available-empty';
    } else {
      availabilityState = 'available';
    }
  }
  result.availabilityState = availabilityState;
  if (availabilityState === 'unsupported' || availabilityState === 'failed') {
    result.ok = false;
  } else if (availabilityState === 'available-empty' || availabilityState === 'available' || availabilityState === 'stale') {
    result.ok = source.ok !== false;
  }
  return result;
}

function providerUsageQuotaEvents(result, payload) {
  if (!result || typeof result !== 'object' || result.ok !== true || result.stale === true || !Array.isArray(result.windows)) {
    return [];
  }
  const source = payload && typeof payload === 'object' ? payload : {};
  const providerId = text(result, 'providerId', text(source, 'providerId', ''));
  const hostProfileId = text(result, 'hostProfileId', text(source, 'hostProfileId', ''));
  const sessionId = text(result, 'sessionId', text(source, 'sessionId', ''));
  const agentId = text(result, 'agentId', text(source, 'agentId', ''));
  const quotaSource = redactProviderUsageText(text(result, 'source', 'provider'), 128) || 'provider';
  const occurredAt = normalizeIso(text(result, 'fetchedAt', '')) || new Date().toISOString();
  const events = [];
  for (let index = 0; index < result.windows.length && index < 32; index += 1) {
    const window = result.windows[index];
    if (!window || typeof window !== 'object' || Array.isArray(window)) continue;
    const remaining = normalizeQuotaNumber(number(window, 'remaining'));
    const limit = normalizeQuotaNumber(number(window, 'limit'));
    const resetAt = normalizeIso(text(window, 'resetAt', ''));
    if (remaining === undefined && limit === undefined && resetAt.length === 0) continue;
    const windowName = redactProviderUsageText(text(window, 'name', 'window-' + String(index + 1)), 128) || 'window-' + String(index + 1);
    const digestInput = JSON.stringify({
      providerId,
      hostProfileId,
      sessionId,
      agentId,
      window: windowName,
      remaining,
      limit,
      resetAt,
      quotaSource
    });
    const digest = crypto.createHash('sha256').update(digestInput, 'utf8').digest('hex').slice(0, 32);
    const event = {
      eventId: 'provider-quota:' + digest,
      hostProfileId,
      sessionId,
      agentId,
      providerId,
      source: 'provider',
      estimated: false,
      kind: 'quota',
      window: windowName,
      quotaSource,
      occurredAt
    };
    if (remaining !== undefined) event.quotaRemaining = remaining;
    if (limit !== undefined) event.quotaLimit = limit;
    if (resetAt.length > 0) event.quotaResetAt = resetAt;
    events.push(event);
  }
  return events;
}

function unavailable(providerId, failureCategory, message, remediation) {
  return normalizeProviderUsage(providerId, {
    ok: false,
    failureCategory,
    message,
    remediation,
    usage: { status: 'unavailable', source: 'provider' }
  });
}

function applyRequestScope(result, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const ignoredScopeFields = [];
  const bindScopeField = (fieldName, payloadKey) => {
    const requestedValue = text(source, payloadKey, '');
    if (requestedValue.length === 0) {
      return;
    }
    const responseValue = typeof result[fieldName] === 'string' ? result[fieldName] : '';
    if (responseValue.length > 0 && responseValue !== requestedValue) {
      ignoredScopeFields.push(payloadKey);
    }
    result[fieldName] = requestedValue;
  };
  // The Bridge request scope is authoritative. A Provider endpoint response is
  // untrusted data and must not move a quota snapshot into another host/session.
  bindScopeField('hostProfileId', 'hostProfileId');
  bindScopeField('sessionId', 'sessionId');
  bindScopeField('agentId', 'agentId');
  const requestedWindow = text(source, 'window', '');
  if (requestedWindow.length > 0) {
    if (result.window.length > 0 && result.window !== 'session' && result.window !== requestedWindow) {
      ignoredScopeFields.push('window');
    }
    result.window = requestedWindow;
  }
  if (ignoredScopeFields.length > 0 && !result.warnings.includes('provider_scope_response_ignored')) {
    result.warnings.push('provider_scope_response_ignored');
  }
  return result;
}

function normalizeUsageEndpoint(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { url: '', failureCategory: '' };
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') {
      return { url: '', failureCategory: 'insecure_endpoint' };
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return { url: '', failureCategory: 'endpoint_credentials_not_allowed' };
    }
    return { url: parsed.toString(), failureCategory: '' };
  } catch (_error) {
    return { url: '', failureCategory: 'invalid_endpoint' };
  }
}

function environmentName(value) {
  return typeof value === 'string' && ENVIRONMENT_NAME_PATTERN.test(value.trim()) ? value.trim() : '';
}

function readEndpoint(providerId, provider) {
  const candidates = [];
  if (provider && typeof provider.usageEndpoint === 'string' && provider.usageEndpoint.trim().length > 0) {
    candidates.push(provider.usageEndpoint);
  }
  const providerEndpointEnv = environmentName(provider && provider.usageEndpointEnv);
  if (providerEndpointEnv.length > 0 && typeof process.env[providerEndpointEnv] === 'string') {
    candidates.push(process.env[providerEndpointEnv]);
  }
  const normalizedProviderId = typeof providerId === 'string'
    ? providerId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
    : '';
  const conventionalName = normalizedProviderId.length > 0
    ? 'AGENT_BRIDGE_' + normalizedProviderId + '_USAGE_URL'
    : '';
  if (conventionalName.length > 0 && typeof process.env[conventionalName] === 'string') {
    candidates.push(process.env[conventionalName]);
  }
  if (providerId === 'codex' && typeof process.env.AGENT_BRIDGE_CODEX_USAGE_URL === 'string') {
    candidates.push(process.env.AGENT_BRIDGE_CODEX_USAGE_URL);
  }
  for (const candidate of candidates) {
    const normalized = normalizeUsageEndpoint(candidate);
    if (normalized.url.length > 0 || normalized.failureCategory.length > 0) {
      return normalized;
    }
  }
  return { url: '', failureCategory: '' };
}

function readEndpointToken(providerId, provider) {
  const configuredName = environmentName(provider && provider.usageEndpointTokenEnv);
  if (configuredName.length > 0 && typeof process.env[configuredName] === 'string') {
    return process.env[configuredName];
  }
  const normalizedProviderId = typeof providerId === 'string'
    ? providerId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
    : '';
  const conventionalName = normalizedProviderId.length > 0
    ? 'AGENT_BRIDGE_' + normalizedProviderId + '_USAGE_TOKEN'
    : '';
  if (conventionalName.length > 0 && typeof process.env[conventionalName] === 'string') {
    return process.env[conventionalName];
  }
  return '';
}

function usageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function fetchJson(urlText, timeoutMs, bearerToken) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is unavailable in this Node runtime.');
  }
  let currentUrl = urlText;
  let initialOrigin = '';
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const endpoint = normalizeUsageEndpoint(currentUrl);
    if (endpoint.url.length === 0) {
      throw usageError(endpoint.failureCategory || 'invalid_endpoint', 'Provider usage endpoint must use HTTPS.');
    }
    if (initialOrigin.length === 0) {
      initialOrigin = new URL(endpoint.url).origin;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
      const headers = {};
      if (typeof bearerToken === 'string' && bearerToken.length > 0) {
        headers.Authorization = 'Bearer ' + bearerToken;
      }
      const response = await fetch(endpoint.url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('location')
          : '';
        if (!location) {
          throw usageError('redirect_location_missing', 'Provider usage endpoint returned a redirect without a location.');
        }
        if (redirectCount >= MAX_REDIRECTS) {
          throw usageError('redirect_limit', 'Provider usage endpoint exceeded the redirect limit.');
        }
        const nextUrl = new URL(location, endpoint.url).toString();
        const nextEndpoint = normalizeUsageEndpoint(nextUrl);
        if (nextEndpoint.url.length === 0) {
          throw usageError('redirect_to_insecure_endpoint', 'Provider usage endpoint redirected to a non-HTTPS URL.');
        }
        if (typeof bearerToken === 'string' && bearerToken.length > 0 && new URL(nextEndpoint.url).origin !== initialOrigin) {
          throw usageError('redirect_origin_changed', 'Provider usage endpoint cannot redirect authenticated requests to another origin.');
        }
        currentUrl = nextEndpoint.url;
        continue;
      }
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_RESPONSE_BYTES) {
        throw usageError('response_too_large', 'Provider usage response exceeded the size limit.');
      }
      const textBody = Buffer.from(body).toString('utf8');
      let parsed = {};
      try {
        parsed = JSON.parse(textBody);
      } catch (_error) {
        throw usageError('invalid_response', 'Provider usage response was not valid JSON.');
      }
      if (!response.ok) {
        const error = usageError('provider_http_error', 'Provider usage request failed with HTTP ' + String(response.status) + '.');
        error.statusCode = response.status;
        throw error;
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
  throw usageError('redirect_limit', 'Provider usage endpoint exceeded the redirect limit.');
}

class ProviderUsageService {
  constructor(registry, options) {
    this.registry = registry;
    this.options = options && typeof options === 'object' ? options : {};
    const configuredTtl = number(this.options, 'snapshotCacheTtlMs');
    this.snapshotCacheTtlMs = configuredTtl === undefined
      ? DEFAULT_SNAPSHOT_CACHE_TTL_MS
      : Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(configuredTtl)));
    this.snapshotCache = new Map();
  }

  snapshotKey(providerId, payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    return JSON.stringify([
      providerId,
      text(source, 'hostProfileId', ''),
      text(source, 'sessionId', ''),
      text(source, 'agentId', ''),
      text(source, 'window', 'session')
    ]);
  }

  cloneResult(result) {
    if (!result || typeof result !== 'object') {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(result));
    } catch (_error) {
      return null;
    }
  }

  rememberSnapshot(providerId, payload, result) {
    if (this.snapshotCacheTtlMs <= 0 || !result || result.ok !== true || result.stale === true) {
      return;
    }
    const clone = this.cloneResult(result);
    if (!clone) {
      return;
    }
    const key = this.snapshotKey(providerId, payload);
    this.snapshotCache.delete(key);
    this.snapshotCache.set(key, { savedAt: Date.now(), result: clone });
    while (this.snapshotCache.size > MAX_SNAPSHOT_CACHE_ENTRIES) {
      const firstKey = this.snapshotCache.keys().next().value;
      if (typeof firstKey !== 'string') {
        break;
      }
      this.snapshotCache.delete(firstKey);
    }
  }

  staleSnapshot(providerId, payload, failureCategory) {
    if (this.snapshotCacheTtlMs <= 0) {
      return null;
    }
    const key = this.snapshotKey(providerId, payload);
    const cached = this.snapshotCache.get(key);
    if (!cached || Date.now() - cached.savedAt > this.snapshotCacheTtlMs) {
      if (cached) {
        this.snapshotCache.delete(key);
      }
      return null;
    }
    const result = this.cloneResult(cached.result);
    if (!result) {
      this.snapshotCache.delete(key);
      return null;
    }
    result.ok = true;
    result.stale = true;
    result.availabilityState = 'stale';
    if (!Array.isArray(result.warnings)) {
      result.warnings = [];
    }
    if (!result.warnings.includes('provider_usage_refresh_failed')) {
      result.warnings.push('provider_usage_refresh_failed');
    }
    result.lastRefreshFailureCategory = normalizeFailureCategory(failureCategory, 'provider_usage_failed');
    result.lastRefreshFailedAt = new Date().toISOString();
    return result;
  }

  rememberAndReturn(providerId, payload, result) {
    const scoped = applyRequestScope(result, payload);
    this.rememberSnapshot(providerId, payload, scoped);
    return scoped;
  }

  provider(providerId) {
    if (!this.registry || typeof this.registry.resolve !== 'function' || typeof providerId !== 'string' || providerId.length === 0) {
      return null;
    }
    try {
      return this.registry.resolve(providerId);
    } catch (_error) {
      return null;
    }
  }

  isAvailable(providerId) {
    const provider = this.provider(providerId);
    if (provider && provider.providerUsageAvailable === true && typeof provider.getUsage === 'function') {
      return true;
    }
    return readEndpoint(providerId, provider).url.length > 0;
  }

  anyAvailable() {
    if (!this.registry || !this.registry.providers || typeof this.registry.providers.values !== 'function') {
      return false;
    }
    for (const provider of this.registry.providers.values()) {
      if (provider && typeof provider.id === 'string' && provider.id.length > 0 && this.isAvailable(provider.id)) {
        return true;
      }
    }
    return false;
  }

  async list(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const providerId = text(source, 'providerId', '');
    const provider = this.provider(providerId);
    if (provider && provider.providerUsageAvailable === true && typeof provider.getUsage === 'function') {
      try {
        return this.rememberAndReturn(providerId, source, normalizeProviderUsage(providerId, await provider.getUsage(source)));
      } catch (error) {
        const category = normalizeFailureCategory(error && error.code, 'provider_usage_failed');
        const stale = this.staleSnapshot(providerId, source, category);
        return stale || unavailable(providerId, category, 'Provider usage request failed.', 'Retry the provider usage refresh later.');
      }
    }
    const endpoint = readEndpoint(providerId, provider);
    if (endpoint.failureCategory.length > 0) {
      return unavailable(providerId, endpoint.failureCategory, 'The configured Provider usage endpoint is not safe to use.', 'Configure an HTTPS usage endpoint without embedded credentials.');
    }
    if (endpoint.url.length === 0) {
      return unavailable(providerId, 'capability_unavailable', 'This provider does not expose usage data.', 'Use a provider with usage support or configure its usage endpoint.');
    }
    try {
      return this.rememberAndReturn(
        providerId,
        source,
        normalizeProviderUsage(providerId, await fetchJson(endpoint.url, number(source, 'timeoutMs') || DEFAULT_TIMEOUT_MS, readEndpointToken(providerId, provider)))
      );
    } catch (error) {
      const category = error && error.name === 'AbortError'
        ? 'timeout'
        : normalizeFailureCategory(error && error.code, 'provider_usage_failed');
      const message = category === 'timeout'
        ? 'Provider usage request timed out.'
        : category === 'response_too_large'
          ? 'Provider usage response exceeded the size limit.'
          : 'Provider usage request failed.';
      const stale = this.staleSnapshot(providerId, source, category);
      return stale || unavailable(providerId, category, message, 'Verify the provider endpoint and try again.');
    }
  }
}

module.exports = {
  ProviderUsageService,
  normalizeProviderUsage,
  normalizeProviderUsageAvailabilityState,
  PROVIDER_USAGE_AVAILABILITY_STATES,
  normalizeUsageEndpoint,
  readEndpoint,
  providerUsageQuotaEvents,
  redactProviderUsageText,
  normalizeQuotaNumber
};
