'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomId } = require('./daemon-store');
const {
  createBrowserPlatformHostAdapter,
  isPlatformHostRegistration,
  validateBrowserPlatformHost
} = require('./browser-platform-host');

const BROWSER_PLAN_TTL_MS = 2 * 60 * 1000;
const BROWSER_COMMAND_TIMEOUT_MS = 30 * 1000;
const MAX_BROWSER_RESULT_BYTES = 16 * 1024 * 1024;
const MAX_BROWSER_UPLOAD_FILE_BYTES = 64 * 1024 * 1024;
const MAX_BROWSER_UPLOAD_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_PUBLIC_DOWNLOAD_URL_LENGTH = 4096;
const MAX_PUBLIC_BROWSER_LOG_ENTRIES = 500;
const MAX_PUBLIC_BROWSER_LOG_TEXT_BYTES = 4096;
const MAX_PUBLIC_BROWSER_LOG_DEPTH = 3;
const MAX_PUBLIC_BROWSER_LOG_KEYS = 64;
const BROWSER_DOWNLOAD_DIRECTORY_MARKER = '.agent-bridge-downloads';
const MAX_PUBLIC_HOST_RESULT_DEPTH = 6;
const MAX_PUBLIC_HOST_RESULT_KEYS = 256;
const MAX_PUBLIC_HOST_RESULT_ARRAY_ITEMS = 256;
const MAX_PUBLIC_HOST_RESULT_TEXT_BYTES = 32768;
const MAX_PUBLIC_SCREENSHOT_BASE64_BYTES = 8 * 1024 * 1024;
const MAX_PUBLIC_SCREENSHOT_BYTES = 6 * 1024 * 1024;
const MAX_BROWSER_ACTION_REF_BYTES = 256;
const MAX_BROWSER_ACTION_TEXT_BYTES = 128 * 1024;
const MAX_BROWSER_ACTION_KEY_BYTES = 128;
const MAX_BROWSER_ACTION_COORDINATE = 100000;
const MAX_BROWSER_ACTION_SCROLL_DELTA = 100000;
const BROWSER_ACTION_IDENTIFIER_FIELDS = new Set([
  'ref', 'sourceRef', 'targetRef', 'key', 'workspaceId', 'agentId', 'hostId', 'instanceId', 'pageId'
]);
const PUBLIC_SCREENSHOT_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const SUPPORTED_HOST_COMMANDS = Object.freeze([
  'instance.list',
  'instance.create',
  'instance.close',
  'page.list',
  'page.create',
  'page.close',
  'page.navigate',
  'page.snapshot',
  'page.screenshot',
  'page.logs',
  'page.wait',
  'page.action',
  'download.list'
]);
const SUPPORTED_BROWSER_ACTIONS = Object.freeze([
  'click',
  'fill',
  'type',
  'keypress',
  'hover',
  'select',
  'drag',
  'upload',
  'scroll',
  'download',
  'evaluate'
]);
const SENSITIVE_ACTIONS = new Set(['click', 'fill', 'type', 'keypress', 'select', 'drag', 'upload', 'download', 'evaluate']);
const SUPPORTED_BROWSER_HOST_KINDS = Object.freeze(['external', 'cdp', 'electron', 'harmonyos', 'native', 'custom']);
const SUPPORTED_BROWSER_CAPABILITY_SOURCES = Object.freeze(['declared', 'cdp', 'platform', 'native', 'custom']);
const SUPPORTED_BROWSER_HOST_READINESS = Object.freeze(['ready', 'degraded', 'unavailable']);
const HOST_RESULT_RESERVED_KEYS = new Set([
  'ok',
  'commandId',
  'hostId',
  'updatedAt',
  'accepted',
  'failureCategory',
  'message',
  'remediation',
  'warnings',
  'target'
]);

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  return typeof source[key] === 'boolean' ? source[key] : fallbackValue;
}

function normalizeOwnerId(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.connectionId === 'string') return value.connectionId.trim();
  return '';
}

function normalizeHostMetadataValue(value, allowed, fallbackValue) {
  if (typeof value !== 'string') return fallbackValue;
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : '';
}

function normalizeSupportedPlatforms(source, fallbackValue) {
  const values = Array.isArray(source) ? source : [fallbackValue];
  const platforms = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.length > 64 || !/^[a-z0-9._-]+$/.test(normalized) || platforms.includes(normalized)) continue;
    platforms.push(normalized);
    if (platforms.length >= 16) break;
  }
  return platforms;
}

function truncateUtf8(value, maxBytes) {
  if (typeof value !== 'string') return '';
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.substring(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  let end = low;
  if (end > 0 && end < value.length) {
    const code = value.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
  }
  return value.substring(0, end);
}

function sanitizeBrowserWarningUrl(value) {
  const source = typeof value === 'string' ? value : '';
  const trailingMatch = source.match(/[),.;!?\]}]+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const candidate = trailing.length > 0 ? source.slice(0, -trailing.length) : source;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      return '[url]' + trailing;
    }
  } catch (_error) {
    return '[url]' + trailing;
  }
  return '[url]' + trailing;
}

function sanitizeCapabilityWarningText(value, maxBytes) {
  if (typeof value !== 'string') return '';
  let normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  normalized = normalized.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, (match) => sanitizeBrowserWarningUrl(match));
  normalized = normalized.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]');
  normalized = normalized.replace(/\b(?:token|secret|password|authorization|cookie|api[-_]?key)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, '[credential redacted]');
  normalized = normalized.replace(/[A-Za-z]:[\\/][^\s,;]*/g, '[path]');
  normalized = normalized.replace(/\/(?:Users|home|tmp|private|var)\/[^\s,;]*/gi, '[path]');
  return truncateUtf8(normalized, maxBytes);
}

function normalizeCapabilityWarnings(source) {
  if (!Array.isArray(source)) return [];
  const warnings = [];
  for (const value of source) {
    const normalized = sanitizeCapabilityWarningText(value, 256);
    if (normalized && !warnings.includes(normalized)) warnings.push(normalized);
    if (warnings.length >= 16) break;
  }
  return warnings;
}

function publicBrowserLogKeyAllowed(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 128) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  return !/(?:token|secret|password|authorization|cookie|headers|api[-_]?key|private[-_]?key|credential|set-cookie|request-headers|response-headers)/i.test(key);
}

function sanitizePublicBrowserLogValue(value, depth) {
  if (typeof value === 'string') return sanitizeCapabilityWarningText(value, depth === 0 ? MAX_PUBLIC_BROWSER_LOG_TEXT_BYTES : 1024);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;
  if (!value || typeof value !== 'object') return undefined;
  if (depth >= MAX_PUBLIC_BROWSER_LOG_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length && index < MAX_PUBLIC_BROWSER_LOG_KEYS; index += 1) {
      const sanitized = sanitizePublicBrowserLogValue(value[index], depth + 1);
      if (sanitized !== undefined) items.push(sanitized);
    }
    if (value.length > MAX_PUBLIC_BROWSER_LOG_KEYS) items.push('[truncated]');
    return items;
  }
  const output = {};
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length && index < MAX_PUBLIC_BROWSER_LOG_KEYS; index += 1) {
    const key = keys[index];
    if (!publicBrowserLogKeyAllowed(key)) continue;
    const sanitized = sanitizePublicBrowserLogValue(value[key], depth + 1);
    if (sanitized === undefined) continue;
    Object.defineProperty(output, key, {
      value: sanitized,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  if (keys.length > MAX_PUBLIC_BROWSER_LOG_KEYS) output.truncated = true;
  return output;
}

function sanitizeBrowserLogsHostResult(source) {
  const output = copyHostResult(source);
  if (!Array.isArray(output.logs)) return output;
  const logs = [];
  const start = Math.max(0, output.logs.length - MAX_PUBLIC_BROWSER_LOG_ENTRIES);
  for (let index = start; index < output.logs.length; index += 1) {
    const sanitized = sanitizePublicBrowserLogValue(output.logs[index], 0);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) logs.push(sanitized);
  }
  output.logs = logs;
  if (start > 0) output.truncated = true;
  return output;
}

function publicHostResultKeyAllowed(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 128) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  const normalized = key.toLowerCase();
  if (normalized === 'path' || normalized === 'paths' || normalized === 'cwd' || normalized === 'args' || normalized === 'argv' ||
    normalized === 'env' || normalized === 'headers' || normalized === 'cookies' || normalized === 'filepaths' ||
    normalized === 'filepath' || normalized === 'downloadpath' || normalized === 'downloaddirectory') return false;
  return !/(?:token|secret|password|authorization|private[-_]?key|api[-_]?key|credential|set-cookie|working[-_]?directory)/i.test(key);
}

function sanitizePublicBrowserUrl(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (source === 'about:blank') return source;
  if (source.length === 0 || source.length > MAX_PUBLIC_DOWNLOAD_URL_LENGTH || /[\r\n\0]/.test(source)) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch (_error) {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  parsed.username = '';
  parsed.password = '';
  const sensitiveQueryNames = /^(?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|password|secret|token)$/i;
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (sensitiveQueryNames.test(key)) parsed.searchParams.delete(key);
  }
  const normalized = parsed.toString();
  return Buffer.byteLength(normalized, 'utf8') <= MAX_PUBLIC_DOWNLOAD_URL_LENGTH ? normalized : '';
}

function sanitizePublicHostResultValue(value, key, depth) {
  if (typeof value === 'string') {
    const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
    if (normalizedKey === 'url' || normalizedKey.endsWith('url') || normalizedKey.endsWith('urls')) {
      return sanitizePublicBrowserUrl(value) || undefined;
    }
    if (normalizedKey === 'message' || normalizedKey === 'error' || normalizedKey === 'warning' ||
      normalizedKey === 'warnings' || normalizedKey === 'remediation' || normalizedKey === 'reason' ||
      normalizedKey === 'detail' || normalizedKey === 'details') {
      return sanitizeCapabilityWarningText(value, MAX_PUBLIC_HOST_RESULT_TEXT_BYTES);
    }
    return truncateUtf8(value, MAX_PUBLIC_HOST_RESULT_TEXT_BYTES);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;
  if (!value || typeof value !== 'object') return undefined;
  if (depth >= MAX_PUBLIC_HOST_RESULT_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    const items = [];
    const limit = Math.min(value.length, MAX_PUBLIC_HOST_RESULT_ARRAY_ITEMS);
    for (let index = 0; index < limit; index += 1) {
      const item = sanitizePublicHostResultValue(value[index], key, depth + 1);
      if (item !== undefined) items.push(item);
    }
    if (value.length > limit) items.push('[truncated]');
    return items;
  }
  const output = {};
  const keys = Object.keys(value);
  const limit = Math.min(keys.length, MAX_PUBLIC_HOST_RESULT_KEYS);
  for (let index = 0; index < limit; index += 1) {
    const childKey = keys[index];
    if (!publicHostResultKeyAllowed(childKey)) continue;
    const child = sanitizePublicHostResultValue(value[childKey], childKey, depth + 1);
    if (child === undefined) continue;
    Object.defineProperty(output, childKey, {
      value: child,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  if (keys.length > limit) output.truncated = true;
  return output;
}

function failure(category, message, remediation) {
  return {
    ok: false,
    failureCategory: category,
    message,
    remediation: remediation || '',
    warnings: [],
    updatedAt: new Date().toISOString()
  };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalValue(value[key]);
  return output;
}

function digestValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function safeBrowserTargetIdentifier(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128);
}

function publicBrowserActionTarget(scope, payload, selectedHost, action, resolvedHostId) {
  const selectedHostId = selectedHost && typeof selectedHost.hostId === 'string' ? selectedHost.hostId : '';
  const hostId = selectedHostId || resolvedHostId || readString(payload, 'hostId', '');
  return {
    workspaceId: safeBrowserTargetIdentifier(scope.workspaceId),
    agentId: safeBrowserTargetIdentifier(scope.agentId),
    hostId: safeBrowserTargetIdentifier(hostId),
    instanceId: safeBrowserTargetIdentifier(readString(payload, 'instanceId', '')),
    pageId: safeBrowserTargetIdentifier(readString(payload, 'pageId', '')),
    action: safeBrowserTargetIdentifier(action).toLowerCase()
  };
}

function attachBrowserActionTarget(result, target) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  return Object.assign({}, result, { target });
}

function attachBrowserActionTargetState(result, targetState) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !targetState || targetState.mode === 'none') return result;
  const output = Object.assign({}, result, {
    targetState: { mode: targetState.mode }
  });
  const warnings = Array.isArray(output.warnings) ? output.warnings.slice() : [];
  const targetWarnings = Array.isArray(targetState.warnings) ? targetState.warnings : [];
  for (const warning of targetWarnings) {
    if (typeof warning === 'string' && warning.length > 0 && !warnings.includes(warning)) warnings.push(warning);
  }
  if (warnings.length > 0) output.warnings = warnings;
  return output;
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function copyHostResult(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    const value = sanitizePublicHostResultValue(source, 'value', 0);
    return value === undefined ? {} : { value };
  }
  const output = {};
  for (const key of Object.keys(source)) {
    if (HOST_RESULT_RESERVED_KEYS.has(key) || !publicHostResultKeyAllowed(key)) continue;
    const value = sanitizePublicHostResultValue(source[key], key, 0);
    if (value === undefined) continue;
    Object.defineProperty(output, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return output;
}

function base64ByteLength(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || value.length > MAX_PUBLIC_SCREENSHOT_BASE64_BYTES) return null;
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 61) {
      if (index < value.length - 2 || padding >= 2) return null;
      padding += 1;
      continue;
    }
    if (padding > 0 || !((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47)) return null;
  }
  return Math.floor(value.length * 3 / 4) - padding;
}

function screenshotPrefixBytes(value) {
  return Buffer.from(value.slice(0, 16), 'base64');
}

function hasScreenshotSignature(mimeType, dataBase64) {
  const bytes = screenshotPrefixBytes(dataBase64);
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

function sanitizeScreenshotHostResult(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) && source.screenshot && typeof source.screenshot === 'object' && !Array.isArray(source.screenshot)
    ? source.screenshot
    : null;
  if (!raw) return { ok: false, failureCategory: 'browser_screenshot_invalid', message: 'Browser host did not return screenshot data.', remediation: 'Request a fresh PNG, JPEG, or WebP screenshot.' };
  const candidateMime = readString(raw, 'mimeType', '').trim().toLowerCase();
  const mimeType = PUBLIC_SCREENSHOT_MIME_TYPES.includes(candidateMime) ? candidateMime : '';
  const dataBase64 = readString(raw, 'dataBase64', '').trim();
  const bytes = base64ByteLength(dataBase64);
  if (!mimeType || dataBase64.length > MAX_PUBLIC_SCREENSHOT_BASE64_BYTES || bytes === null || bytes > MAX_PUBLIC_SCREENSHOT_BYTES || !hasScreenshotSignature(mimeType, dataBase64)) {
    return { ok: false, failureCategory: 'browser_screenshot_invalid', message: 'Browser screenshot data is unavailable or exceeds the public image limits.', remediation: 'Request a PNG, JPEG, or WebP screenshot within the size limit.' };
  }
  return {
    ok: true,
    result: {
      screenshot: {
        mimeType,
        dataBase64,
        bytes,
        fullPage: readBoolean(raw, 'fullPage', false)
      }
    }
  };
}

function sanitizePublicDownloadUrl(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (source.length === 0 || /[\r\n\0]/.test(source)) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch (_error) {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  parsed.username = '';
  parsed.password = '';
  const normalized = parsed.toString();
  return Buffer.byteLength(normalized, 'utf8') <= MAX_PUBLIC_DOWNLOAD_URL_LENGTH ? normalized : '';
}

function sanitizeDownloadRecord(source) {
  const record = copyHostResult(source);
  const url = sanitizePublicDownloadUrl(readString(source, 'url', ''));
  if (url.length > 0) record.url = url;
  else delete record.url;
  const privatePathKeys = ['downloadDirectory', 'downloadPath', 'filePath', 'path', 'filePaths'];
  for (const key of privatePathKeys) delete record[key];
  return record;
}

function sanitizeDownloadHostResult(source) {
  const output = copyHostResult(source);
  const url = sanitizePublicDownloadUrl(readString(source, 'url', ''));
  if (url.length > 0) output.url = url;
  else delete output.url;
  const privatePathKeys = ['downloadDirectory', 'downloadPath', 'filePath', 'path', 'filePaths'];
  for (const key of privatePathKeys) delete output[key];
  output.downloadDirectoryConfigured = true;
  output.downloadDirectory = BROWSER_DOWNLOAD_DIRECTORY_MARKER;
  return output;
}

function sanitizeDownloadListHostResult(source) {
  const output = copyHostResult(source);
  if (!Array.isArray(output.downloads)) return output;
  const sanitized = [];
  for (const item of output.downloads) {
    sanitized.push(sanitizeDownloadRecord(item));
  }
  output.downloads = sanitized;
  return output;
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function realPath(value) {
  try {
    return fs.realpathSync(value);
  } catch (_error) {
    return path.resolve(value);
  }
}

function normalizeDomainRule(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim().toLowerCase();
  if (input.length === 0 || input.length > 253 || /[\r\n\0\s/:@]/.test(input)) return '';
  const wildcard = input.startsWith('*.');
  const host = wildcard ? input.substring(2) : input;
  if (host.length === 0 || host.startsWith('.') || host.endsWith('.')) return '';
  const labels = host.split('.');
  if (labels.some((label) => label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return '';
  return wildcard ? '*.' + host : host;
}

function normalizeHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\r\n\0]/.test(value)) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function normalizeSupportedActions(source) {
  const actions = new Set();
  if (!Array.isArray(source)) return actions;
  for (const action of source) {
    if (typeof action === 'string' && SUPPORTED_BROWSER_ACTIONS.includes(action.toLowerCase())) actions.add(action.toLowerCase());
  }
  return actions;
}

function actionPayloadHasKey(source, key) {
  return Boolean(source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).includes(key));
}

function actionStringValue(source, key, required, maxBytes, category) {
  if (!actionPayloadHasKey(source, key)) {
    if (required) return failure(category, 'Browser action requires a valid ' + key + '.', 'Provide a bounded ' + key + ' value and retry.');
    return { ok: true, present: false, value: '' };
  }
  const raw = source[key];
  if (typeof raw !== 'string') return failure(category, 'Browser action ' + key + ' must be a string.', 'Provide a bounded text value and retry.');
  const value = key === 'ref' || key === 'sourceRef' || key === 'targetRef' || key === 'key' ? raw.trim() : raw;
  if (required && value.length === 0) return failure(category, 'Browser action requires a non-empty ' + key + '.', 'Provide a bounded ' + key + ' value and retry.');
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    return failure('browser_action_input_too_large', 'Browser action input exceeds the size limit.', 'Use a shorter value and retry.');
  }
  if (BROWSER_ACTION_IDENTIFIER_FIELDS.has(key)) {
    if (/[\u0000-\u001f\u007f]/.test(value)) return failure(category, 'Browser action ' + key + ' contains unsupported control characters.', 'Use a plain element reference or key name and retry.');
  } else if (value.includes('\u0000')) {
    return failure(category, 'Browser action input contains an unsupported null character.', 'Remove the null character and retry.');
  }
  return { ok: true, present: true, value };
}

function actionNumberValue(source, key, minValue, maxValue, category) {
  if (!actionPayloadHasKey(source, key)) return { ok: true, present: false, value: 0 };
  const raw = source[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim().length > 0 ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < minValue || value > maxValue) {
    return failure(category, 'Browser action ' + key + ' is outside the supported range.', 'Use a finite value between ' + String(minValue) + ' and ' + String(maxValue) + '.');
  }
  return { ok: true, present: true, value };
}

const BROWSER_ACTION_SCOPE_FIELDS = Object.freeze(['workspaceId', 'agentId', 'hostId', 'instanceId', 'pageId']);
function copyBrowserActionScopeFields(payload, commandPayload) {
  for (const key of BROWSER_ACTION_SCOPE_FIELDS) {
    if (!actionPayloadHasKey(payload, key)) continue;
    const value = actionStringValue(payload, key, false, MAX_BROWSER_ACTION_REF_BYTES, 'browser_action_scope_invalid');
    if (!value.ok) return value;
    if (value.present) commandPayload[key] = value.value;
  }
  return { ok: true };
}

function validateBrowserActionPayload(source) {
  const payload = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const kind = readString(payload, 'action', readString(payload, 'kind', '')).trim().toLowerCase();
  const allowed = ['click', 'fill', 'type', 'keypress', 'hover', 'select', 'drag', 'upload', 'scroll', 'download', 'evaluate'];
  if (!allowed.includes(kind)) return failure('browser_action_invalid', 'Browser action kind is unsupported.', 'Use one of the advertised browser action kinds.');
  const commandPayload = { action: kind };
  const scopeResult = copyBrowserActionScopeFields(payload, commandPayload);
  if (!scopeResult.ok) return scopeResult;
  // Upload keeps the legacy optional-ref contract; a capable host may select its own file input.
  const requiredRef = new Set(['click', 'fill', 'hover', 'select', 'download']);
  if (requiredRef.has(kind)) {
    const ref = actionStringValue(payload, 'ref', true, MAX_BROWSER_ACTION_REF_BYTES, 'browser_action_ref_invalid');
    if (!ref.ok) return ref;
    commandPayload.ref = ref.value;
  } else if (actionPayloadHasKey(payload, 'ref')) {
    const ref = actionStringValue(payload, 'ref', false, MAX_BROWSER_ACTION_REF_BYTES, 'browser_action_ref_invalid');
    if (!ref.ok) return ref;
    commandPayload.ref = ref.value;
  }
  if (kind === 'drag') {
    const sourceRef = actionStringValue(payload, 'sourceRef', true, MAX_BROWSER_ACTION_REF_BYTES, 'browser_action_ref_invalid');
    if (!sourceRef.ok) return sourceRef;
    commandPayload.sourceRef = sourceRef.value;
    const targetRef = actionStringValue(payload, 'targetRef', false, MAX_BROWSER_ACTION_REF_BYTES, 'browser_action_ref_invalid');
    if (!targetRef.ok) return targetRef;
    if (targetRef.present) commandPayload.targetRef = targetRef.value;
    const targetXKey = actionPayloadHasKey(payload, 'targetX') ? 'targetX' : 'toX';
    const targetYKey = actionPayloadHasKey(payload, 'targetY') ? 'targetY' : 'toY';
    const targetX = actionNumberValue(payload, targetXKey, 0, MAX_BROWSER_ACTION_COORDINATE, 'browser_action_target_invalid');
    const targetY = actionNumberValue(payload, targetYKey, 0, MAX_BROWSER_ACTION_COORDINATE, 'browser_action_target_invalid');
    if (!targetX.ok) return targetX;
    if (!targetY.ok) return targetY;
    if (!targetRef.present && (!targetX.present || !targetY.present)) {
      return failure('browser_action_target_invalid', 'Browser drag requires a target reference or bounded coordinates.', 'Provide targetRef or both targetX and targetY and retry.');
    }
    if (targetX.present) commandPayload.targetX = targetX.value;
    if (targetY.present) commandPayload.targetY = targetY.value;
    if (actionPayloadHasKey(payload, 'steps')) {
      const steps = actionNumberValue(payload, 'steps', 2, 20, 'browser_action_steps_invalid');
      if (!steps.ok || !Number.isInteger(steps.value)) return failure('browser_action_steps_invalid', 'Browser drag steps must be a bounded integer.', 'Use an integer between 2 and 20.');
      commandPayload.steps = steps.value;
    }
  }
  if (kind === 'fill' || kind === 'select' || kind === 'type') {
    const field = kind === 'type' ? 'text' : actionPayloadHasKey(payload, 'value') ? 'value' : 'text';
    if (actionPayloadHasKey(payload, field)) {
      const textValue = actionStringValue(payload, field, false, MAX_BROWSER_ACTION_TEXT_BYTES, 'browser_action_input_invalid');
      if (!textValue.ok) return textValue;
      commandPayload[field] = textValue.value;
    }
  }
  if (kind === 'keypress') {
    const key = actionStringValue(payload, 'key', true, MAX_BROWSER_ACTION_KEY_BYTES, 'browser_action_key_invalid');
    if (!key.ok) return key;
    commandPayload.key = key.value;
  }
  if (kind === 'evaluate') {
    const functionPresent = actionPayloadHasKey(payload, 'function');
    const sourcePresent = actionPayloadHasKey(payload, 'functionSource');
    if (functionPresent && typeof payload.function !== 'string') return failure('browser_script_invalid', 'Browser evaluation function must be a string.', 'Provide a bounded JavaScript function and retry.');
    if (sourcePresent && typeof payload.functionSource !== 'string') return failure('browser_script_invalid', 'Browser evaluation function must be a string.', 'Provide a bounded JavaScript function and retry.');
    if (functionPresent && sourcePresent && payload.function !== payload.functionSource) return failure('browser_script_ambiguous', 'Browser evaluation function fields do not match.', 'Send only one matching function value and retry.');
    const functionSource = functionPresent ? payload.function : sourcePresent ? payload.functionSource : '';
    if (functionSource.trim().length === 0) return failure('browser_script_empty', 'Browser evaluation requires a non-empty function.', 'Provide a bounded JavaScript function and retry.');
    if (Buffer.byteLength(functionSource, 'utf8') > 65536) return failure('browser_script_too_large', 'Browser evaluation function is too large.', 'Use a bounded JavaScript function.');
    if (functionSource.includes('\u0000')) return failure('browser_script_invalid', 'Browser evaluation function contains an unsupported null character.', 'Remove the null character and retry.');
    commandPayload.function = functionSource;
    if (sourcePresent) commandPayload.functionSource = functionSource;
  }
  if (kind === 'scroll') {
    const deltaX = actionNumberValue(payload, 'deltaX', -MAX_BROWSER_ACTION_SCROLL_DELTA, MAX_BROWSER_ACTION_SCROLL_DELTA, 'browser_action_scroll_invalid');
    const deltaY = actionNumberValue(payload, 'deltaY', -MAX_BROWSER_ACTION_SCROLL_DELTA, MAX_BROWSER_ACTION_SCROLL_DELTA, 'browser_action_scroll_invalid');
    if (!deltaX.ok) return deltaX;
    if (!deltaY.ok) return deltaY;
    if (deltaX.present) commandPayload.deltaX = deltaX.value;
    if (deltaY.present) commandPayload.deltaY = deltaY.value;
  }
  return { ok: true, kind, payload: commandPayload };
}

function domainAllowed(hostname, rules) {
  const host = String(hostname || '').toLowerCase();
  for (const rule of rules) {
    if (rule.startsWith('*.')) {
      const suffix = rule.substring(1);
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
    } else if (host === rule) {
      return true;
    }
  }
  return false;
}

class BrowserAutomationManager {
  constructor(options) {
    const source = options && typeof options === 'object' ? options : {};
    this.workspaceRegistry = source.workspaceRegistry;
    this.agentManager = source.agentManager || null;
    this.store = source.store || null;
    this.broadcast = typeof source.broadcast === 'function' ? source.broadcast : () => {};
    this.now = typeof source.now === 'function' ? source.now : () => Date.now();
    this.commandTimeoutMs = Math.max(250, Math.min(120000, Number(source.commandTimeoutMs) || BROWSER_COMMAND_TIMEOUT_MS));
    this.maxUploadFileBytes = Math.max(1, Math.min(MAX_BROWSER_UPLOAD_FILE_BYTES, Number(source.maxUploadFileBytes) || MAX_BROWSER_UPLOAD_FILE_BYTES));
    this.maxUploadTotalBytes = Math.max(this.maxUploadFileBytes, Math.min(MAX_BROWSER_UPLOAD_TOTAL_BYTES, Number(source.maxUploadTotalBytes) || MAX_BROWSER_UPLOAD_TOTAL_BYTES));
    this.platformHostAdapter = createBrowserPlatformHostAdapter(source.platformHostAdapter);
    this.hosts = new Map();
    this.pending = new Map();
    this.plans = new Map();
    this.permissions = new Map();
    this.loadPermissions();
  }

  loadPermissions() {
    if (!this.store || typeof this.store.readBrowserAutomationState !== 'function') return;
    const state = this.store.readBrowserAutomationState();
    const records = state && Array.isArray(state.permissions) ? state.permissions : [];
    for (const item of records) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.workspaceId !== 'string') continue;
      const domains = new Set();
      const source = Array.isArray(item.domains) ? item.domains : [];
      for (const value of source) {
        const domain = normalizeDomainRule(value);
        if (domain) domains.add(domain);
      }
      this.permissions.set(item.workspaceId, { domains, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '' });
    }
  }

  persistPermissions() {
    if (!this.store || typeof this.store.writeBrowserAutomationState !== 'function') return;
    const permissions = [];
    for (const [workspaceId, record] of this.permissions.entries()) {
      permissions.push({ workspaceId, domains: Array.from(record.domains), updatedAt: record.updatedAt || '' });
    }
    permissions.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
    this.store.writeBrowserAutomationState({ version: 1, permissions });
  }

  prunePlans() {
    const now = this.now();
    for (const [planId, plan] of this.plans.entries()) if (plan.expiresAt <= now) this.plans.delete(planId);
  }

  activeWorkspace(workspaceId) {
    if (!workspaceId || !this.workspaceRegistry || typeof this.workspaceRegistry.findWorkspaceById !== 'function') return null;
    const workspace = this.workspaceRegistry.findWorkspaceById(workspaceId);
    if (!workspace || (typeof workspace.archivedAt === 'string' && workspace.archivedAt.length > 0)) return null;
    return workspace;
  }

  validateScope(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const workspace = this.activeWorkspace(workspaceId);
    if (!workspace) return failure('browser_workspace_required', 'An active registered workspace is required.', 'Select an active workspace before using browser automation.');
    const agentId = readString(payload, 'agentId', '');
    if (agentId && this.agentManager && typeof this.agentManager.find === 'function') {
      const agent = this.agentManager.find(agentId);
      if (!agent || agent.workspaceId !== workspaceId || (typeof agent.archivedAt === 'string' && agent.archivedAt.length > 0)) {
        return failure('browser_agent_scope_invalid', 'Browser Agent scope does not match the active workspace.', 'Select an active Agent from the same workspace.');
      }
    }
    return { ok: true, workspaceId, workspace, agentId };
  }

  publicHost(host) {
    return {
      hostId: host.hostId,
      label: host.label,
      platform: host.platform,
      hostKind: host.hostKind,
      runtime: host.runtime,
      capabilitySource: host.capabilitySource,
      readiness: host.readiness,
      supportedPlatforms: Array.from(host.supportedPlatforms),
      capabilityWarnings: host.capabilityWarnings.slice(),
      supportedCommands: Array.from(host.supportedCommands),
      supportedActions: Array.from(host.supportedActions),
      actionCapabilitiesExplicit: host.actionCapabilitiesExplicit === true,
      platformHost: isPlatformHostRegistration(host),
      workspaceIds: Array.from(host.workspaceIds),
      connected: true,
      registeredAt: host.registeredAt,
      lastSeenAt: host.lastSeenAt
    };
  }

  registerHost(payload, connection) {
    if (!connection || typeof connection.sendJson !== 'function' || !connection.connectionId) {
      return failure('browser_host_connection_required', 'Browser host registration requires an authenticated live connection.', 'Reconnect the browser host and register again.');
    }
    const requestedId = readString(payload, 'hostId', '');
    const hostId = requestedId && /^[A-Za-z0-9._-]{1,128}$/.test(requestedId) ? requestedId : randomId('browserhost');
    const existing = this.hosts.get(hostId);
    if (existing && existing.connection !== connection) {
      return failure('browser_host_id_conflict', 'Browser host id is already registered by another connection.', 'Generate a new host id and retry.');
    }
    const payloadKeys = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload) : [];
    const requestedKind = payloadKeys.includes('hostKind') ? normalizeHostMetadataValue(payload.hostKind, SUPPORTED_BROWSER_HOST_KINDS, '') : '';
    if (payloadKeys.includes('hostKind') && requestedKind.length === 0) {
      return failure('browser_host_kind_invalid', 'Browser host kind is not supported.', 'Register a host with an advertised external, CDP, Electron, HarmonyOS, native, or custom kind.');
    }
    const hostKind = requestedKind || (existing && existing.hostKind ? existing.hostKind : 'external');
    const requestedSource = payloadKeys.includes('capabilitySource') ? normalizeHostMetadataValue(payload.capabilitySource, SUPPORTED_BROWSER_CAPABILITY_SOURCES, '') : '';
    if (payloadKeys.includes('capabilitySource') && requestedSource.length === 0) {
      return failure('browser_host_capability_source_invalid', 'Browser host capability source is not supported.', 'Use declared, cdp, platform, native, or custom.');
    }
    const capabilitySource = requestedSource || (existing && existing.capabilitySource ? existing.capabilitySource : 'declared');
    if (hostKind === 'harmonyos' && capabilitySource !== 'platform') {
      return failure('browser_host_capability_unverified', 'A HarmonyOS browser host must identify a platform capability source.', 'Register a supported HarmonyOS platform host or use hostKind external/cdp for a desktop browser host.');
    }
    const platformHost = isPlatformHostRegistration({ hostKind, capabilitySource });
    const platformValidation = validateBrowserPlatformHost(this.platformHostAdapter, { hostKind, capabilitySource });
    if (!platformValidation.ok) return platformValidation;
    const requestedReadiness = payloadKeys.includes('readiness') ? normalizeHostMetadataValue(payload.readiness, SUPPORTED_BROWSER_HOST_READINESS, '') : '';
    if (payloadKeys.includes('readiness') && requestedReadiness.length === 0) {
      return failure('browser_host_readiness_invalid', 'Browser host readiness is not supported.', 'Use ready, degraded, or unavailable.');
    }
    const readiness = requestedReadiness || (existing && existing.readiness ? existing.readiness : 'ready');
    const supportedSource = Array.isArray(payload.supportedCommands) ? payload.supportedCommands : [];
    const supportedCommands = new Set();
    for (const command of supportedSource) if (typeof command === 'string' && SUPPORTED_HOST_COMMANDS.includes(command)) supportedCommands.add(command);
    if (supportedCommands.size === 0) {
      return failure('browser_host_capabilities_invalid', 'Browser host must explicitly advertise at least one supported command.', 'Register only commands the host can actually execute.');
    }
    const actionCapabilitiesExplicit = Array.isArray(payload.supportedActions)
      ? true
      : existing ? existing.actionCapabilitiesExplicit === true : false;
    const supportedActions = Array.isArray(payload.supportedActions)
      ? normalizeSupportedActions(payload.supportedActions)
      : existing ? new Set(existing.supportedActions) : new Set();
    if (platformHost && supportedCommands.has('page.action') && !actionCapabilitiesExplicit) {
      return failure('browser_host_action_capabilities_required', 'A platform browser host must explicitly advertise supported page actions.', 'Register supportedActions for every page.action capability and retry.');
    }
    if (actionCapabilitiesExplicit && supportedCommands.has('page.action') && supportedActions.size === 0) {
      return failure('browser_host_capabilities_invalid', 'Browser host page.action capability must include at least one supported action.', 'Advertise the page actions this host can execute.');
    }
    const workspaceIds = new Set();
    const workspaceSource = Array.isArray(payload.workspaceIds) ? payload.workspaceIds : [];
    for (const workspaceId of workspaceSource) if (typeof workspaceId === 'string' && this.activeWorkspace(workspaceId)) workspaceIds.add(workspaceId);
    if (workspaceIds.size === 0) {
      return failure('browser_host_workspace_required', 'Browser host must be scoped to at least one active workspace.', 'Select the workspaces this browser host may access.');
    }
    const fallbackPlatform = readString(payload, 'platform', process.platform).slice(0, 64).toLowerCase() || process.platform;
    const requestedPlatforms = payloadKeys.includes('supportedPlatforms')
      ? normalizeSupportedPlatforms(payload.supportedPlatforms, fallbackPlatform)
      : existing && existing.supportedPlatforms instanceof Set
        ? Array.from(existing.supportedPlatforms)
        : [fallbackPlatform];
    if (requestedPlatforms.length === 0) {
      return failure('browser_host_platform_invalid', 'Browser host supported platforms are invalid.', 'Advertise at least one normalized platform identifier.');
    }
    const registrationGeneration = existing && Number.isSafeInteger(existing.registrationGeneration)
      ? existing.registrationGeneration + 1
      : 1;
    if (existing) {
      this.rejectPendingForHost(
        hostId,
        'browser_host_reconfigured',
        'Browser host capabilities changed before the command completed.'
      );
    }
    const now = new Date(this.now()).toISOString();
    const host = {
      hostId,
      registrationGeneration,
      label: readString(payload, 'label', hostId).slice(0, 160),
      platform: readString(payload, 'platform', 'external').slice(0, 64),
      hostKind,
      runtime: readString(payload, 'runtime', existing ? existing.runtime : '').slice(0, 64),
      capabilitySource,
      readiness,
      supportedPlatforms: new Set(requestedPlatforms),
      capabilityWarnings: payloadKeys.includes('capabilityWarnings')
        ? normalizeCapabilityWarnings(payload.capabilityWarnings)
        : existing && Array.isArray(existing.capabilityWarnings) ? existing.capabilityWarnings.slice() : [],
      supportedCommands,
      supportedActions,
      actionCapabilitiesExplicit,
      workspaceIds,
      connection,
      connectionId: connection.connectionId,
      registeredAt: existing ? existing.registeredAt : now,
      lastSeenAt: now
    };
    this.hosts.set(hostId, host);
    if (!(connection.browserHostIds instanceof Set)) connection.browserHostIds = new Set();
    connection.browserHostIds.add(hostId);
    this.broadcast({ kind: 'browser.host.registered', ownerId: host.connectionId, host: this.publicHost(host), updatedAt: now });
    return { ok: true, host: this.publicHost(host), updatedAt: now };
  }

  unregisterHost(payload, connection) {
    const hostId = readString(payload, 'hostId', '');
    const host = this.hosts.get(hostId);
    if (!host) return failure('browser_host_not_found', 'Browser host was not found.', 'Refresh the browser host list.');
    if (connection && host.connection !== connection) return failure('browser_host_owner_mismatch', 'Browser host belongs to another connection.', 'Unregister the host from its owning connection.');
    this.hosts.delete(hostId);
    if (host.connection && host.connection.browserHostIds instanceof Set) host.connection.browserHostIds.delete(hostId);
    this.rejectPendingForHost(hostId, 'browser_host_disconnected', 'Browser host disconnected before responding.');
    const updatedAt = new Date(this.now()).toISOString();
    this.broadcast({ kind: 'browser.host.unregistered', ownerId: host.connectionId, hostId, updatedAt });
    return { ok: true, hostId, updatedAt };
  }

  detachConnection(connection) {
    const removed = [];
    for (const host of Array.from(this.hosts.values())) {
      if (host.connection !== connection) continue;
      this.unregisterHost({ hostId: host.hostId }, connection);
      removed.push(host.hostId);
    }
    return removed;
  }

  rejectPendingForHost(hostId, category, message) {
    for (const [commandId, pending] of this.pending.entries()) {
      if (pending.hostId !== hostId) continue;
      clearTimeout(pending.timer);
      this.pending.delete(commandId);
      pending.resolve(failure(category, message, 'Reconnect a compatible browser host and retry.'));
    }
  }

  listHosts(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const hosts = Array.from(this.hosts.values())
      .filter((host) => !workspaceId || host.workspaceIds.has(workspaceId))
      .map((host) => this.publicHost(host));
    return { ok: true, hosts, totalCount: hosts.length, updatedAt: new Date(this.now()).toISOString() };
  }

  hostSupportsAction(host, action) {
    if (host.actionCapabilitiesExplicit !== true) return true;
    return typeof action === 'string' && host.supportedActions.has(action);
  }

  hostUnavailableFailure(scope, command, requestedHostId, requiredAction) {
    const hasNotReadyHost = Array.from(this.hosts.values()).some((candidate) =>
      candidate.workspaceIds.has(scope.workspaceId) &&
      candidate.readiness !== 'ready' &&
      candidate.supportedCommands.has(command) &&
      (!requestedHostId || candidate.hostId === requestedHostId)
    );
    if (hasNotReadyHost) return failure('browser_host_not_ready', 'The selected browser host is connected but not ready for automation.', 'Inspect the host capability warnings or reconnect a ready supported platform host.');
    if (command === 'page.action' && typeof requiredAction === 'string' && requiredAction.length > 0) {
      const hasActionHost = Array.from(this.hosts.values()).some((candidate) =>
        candidate.workspaceIds.has(scope.workspaceId) &&
        candidate.supportedCommands.has('page.action') &&
        (!requestedHostId || candidate.hostId === requestedHostId)
      );
      if (hasActionHost) return failure('browser_action_unavailable', 'The connected browser host does not support this action.', 'Connect a host that explicitly advertises the requested browser action.');
    }
    return failure('browser_no_host', 'No compatible browser automation host is connected for this workspace.', 'Connect a browser host that explicitly supports this command.');
  }

  actionHostBinding(host) {
    return {
      hostId: host.hostId,
      registrationGeneration: host.registrationGeneration,
      connectionId: host.connectionId,
      registeredAt: host.registeredAt,
      capabilityDigest: digestValue({
        hostId: host.hostId,
        readiness: host.readiness,
        supportedCommands: Array.from(host.supportedCommands).sort(),
        supportedActions: Array.from(host.supportedActions).sort(),
        actionCapabilitiesExplicit: host.actionCapabilitiesExplicit === true
      })
    };
  }

  selectHost(scope, command, requestedHostId, action) {
    const candidates = Array.from(this.hosts.values()).filter((host) =>
      host.workspaceIds.has(scope.workspaceId) &&
      host.readiness === 'ready' &&
      host.supportedCommands.has(command) &&
      (command !== 'page.action' || this.hostSupportsAction(host, action)) &&
      (!requestedHostId || host.hostId === requestedHostId)
    );
    candidates.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    return candidates[0] || null;
  }

  dispatch(scope, command, payload, requiredAction) {
    const requestedHostId = readString(payload, 'hostId', '');
    const host = this.selectHost(scope, command, requestedHostId, requiredAction);
    if (!host) {
      return Promise.resolve(this.hostUnavailableFailure(scope, command, requestedHostId, requiredAction));
    }
    const commandId = randomId('browser');
    const envelope = {
      commandId,
      command,
      hostId: host.hostId,
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      payload,
      requestedAt: new Date(this.now()).toISOString()
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandId);
        resolve(failure('browser_timeout', 'Browser host did not respond before the command timeout.', 'Retry after checking the browser host connection.'));
      }, this.commandTimeoutMs);
      this.pending.set(commandId, {
        commandId,
        hostId: host.hostId,
        hostGeneration: host.registrationGeneration,
        command,
        action: requiredAction || '',
        connection: host.connection,
        resolve,
        timer
      });
      try {
        host.connection.sendJson({
          type: 'browser.host.command',
          sessionId: scope.agentId,
          payload: envelope,
          createdAt: this.now()
        });
        host.lastSeenAt = new Date(this.now()).toISOString();
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(commandId);
        resolve(failure('browser_host_send_failed', error instanceof Error ? error.message : String(error), 'Reconnect the browser host and retry.'));
      }
    });
  }

  actionPlanRequest(scope, commandPayload, kind, upload, selectedHost) {
    return {
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      action: kind,
      payload: commandPayload,
      uploadFiles: upload && Array.isArray(upload.files) ? upload.files : [],
      hostBinding: selectedHost ? this.actionHostBinding(selectedHost) : null
    };
  }

  async captureActionTargetState(scope, commandPayload, selectedHost) {
    const platformHost = isPlatformHostRegistration(selectedHost);
    const supportsSnapshot = selectedHost.supportedCommands.has('page.snapshot');
    if (!supportsSnapshot) {
      if (platformHost) {
        return failure(
          'browser_target_snapshot_required',
          'The selected platform browser host cannot verify the page before a sensitive action.',
          'Register page.snapshot capability on the platform host and retry.'
        );
      }
      return {
        ok: true,
        mode: 'legacy',
        digest: '',
        warnings: ['browser_target_snapshot_unavailable']
      };
    }
    const snapshotPayload = {
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      hostId: selectedHost.hostId,
      instanceId: readString(commandPayload, 'instanceId', ''),
      pageId: readString(commandPayload, 'pageId', '')
    };
    const snapshotResult = await this.dispatch(scope, 'page.snapshot', snapshotPayload);
    if (!snapshotResult || snapshotResult.ok !== true) {
      if (platformHost) {
        return failure(
          'browser_target_snapshot_failed',
          'The selected platform browser host could not verify the page before a sensitive action.',
          'Reconnect the platform browser host, refresh the page snapshot, and retry.'
        );
      }
      return {
        ok: true,
        mode: 'legacy',
        digest: '',
        warnings: ['browser_target_snapshot_unavailable']
      };
    }
    const rawSnapshot = snapshotResult.snapshot;
    if (!rawSnapshot || typeof rawSnapshot !== 'object' || Array.isArray(rawSnapshot)) {
      if (platformHost) {
        return failure(
          'browser_target_snapshot_invalid',
          'The selected platform browser host returned an invalid page snapshot.',
          'Return a bounded page.snapshot result and retry the action.'
        );
      }
      return {
        ok: true,
        mode: 'legacy',
        digest: '',
        warnings: ['browser_target_snapshot_unavailable']
      };
    }
    const snapshot = copyHostResult(rawSnapshot);
    const targetState = {
      pageId: snapshotPayload.pageId,
      instanceId: snapshotPayload.instanceId,
      snapshot
    };
    return {
      ok: true,
      mode: 'bound',
      digest: digestValue(targetState),
      warnings: []
    };
  }

  handleHostResult(payload, connection) {
    const commandId = readString(payload, 'commandId', '');
    const pending = this.pending.get(commandId);
    if (!pending) return failure('browser_command_not_found', 'Browser command is missing, expired, or already completed.', 'Ignore stale host results and wait for a new command.');
    if (pending.connection !== connection) return failure('browser_host_result_mismatch', 'Browser result came from a different host connection.', 'Return results only from the host that received the command.');
    const currentHost = this.hosts.get(pending.hostId);
    if (!currentHost || currentHost.registrationGeneration !== pending.hostGeneration) {
      this.pending.delete(commandId);
      clearTimeout(pending.timer);
      pending.resolve(failure('browser_host_reconfigured', 'Browser host capabilities changed before the command completed.', 'Retry the command against the current browser host registration.'));
      return { ok: true, accepted: false, commandId, updatedAt: new Date(this.now()).toISOString() };
    }
    this.pending.delete(commandId);
    clearTimeout(pending.timer);
    const serialized = JSON.stringify(payload.result === undefined ? null : payload.result);
    if (Buffer.byteLength(serialized) > MAX_BROWSER_RESULT_BYTES) {
      pending.resolve(failure('browser_result_too_large', 'Browser host result exceeded the Bridge size limit.', 'Return a bounded snapshot, screenshot, or log page.'));
      return { ok: true, accepted: false, commandId };
    }
    const ok = readBoolean(payload, 'ok', true);
    if (!ok) {
      const errorSource = payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error) ? payload.error : {};
      pending.resolve(failure(
        readString(errorSource, 'code', 'browser_command_failed'),
        readString(errorSource, 'message', 'Browser host command failed.'),
        readString(errorSource, 'remediation', 'Inspect the browser host and retry.')
      ));
    } else {
      let result;
      if (pending.command === 'page.action' && pending.action === 'download') {
        result = sanitizeDownloadHostResult(payload.result);
      } else if (pending.command === 'download.list') {
        result = sanitizeDownloadListHostResult(payload.result);
      } else if (pending.command === 'page.logs') {
        result = sanitizeBrowserLogsHostResult(payload.result);
      } else if (pending.command === 'page.screenshot') {
        const screenshot = sanitizeScreenshotHostResult(payload.result);
        if (!screenshot.ok) {
          pending.resolve(failure(screenshot.failureCategory, screenshot.message, screenshot.remediation));
          const screenshotHost = this.hosts.get(pending.hostId);
          if (screenshotHost) screenshotHost.lastSeenAt = new Date(this.now()).toISOString();
          return { ok: true, accepted: false, commandId, updatedAt: new Date(this.now()).toISOString() };
        }
        result = screenshot.result;
      } else {
        result = copyHostResult(payload.result);
      }
      pending.resolve({
        ok: true,
        commandId,
        hostId: pending.hostId,
        updatedAt: new Date(this.now()).toISOString(),
        ...result
      });
    }
    const host = this.hosts.get(pending.hostId);
    if (host) host.lastSeenAt = new Date(this.now()).toISOString();
    return { ok: true, accepted: true, commandId, updatedAt: new Date(this.now()).toISOString() };
  }

  permissionRecord(workspaceId) {
    const existing = this.permissions.get(workspaceId);
    if (existing) return existing;
    const created = { domains: new Set(), updatedAt: '' };
    this.permissions.set(workspaceId, created);
    return created;
  }

  publicPermissionState(workspaceId, record, workspace) {
    const workspaceRoot = realPath(readString(workspace, 'cwd', readString(workspace, 'workspacePath', '')));
    return {
      workspaceId,
      domains: Array.from(record.domains),
      downloadDirectoryConfigured: workspaceRoot.length > 0,
      updatedAt: record.updatedAt || new Date(this.now()).toISOString()
    };
  }

  permissionGet(payload) {
    const scope = this.validateScope(payload);
    if (!scope.ok) return scope;
    const record = this.permissionRecord(scope.workspaceId);
    const permission = this.publicPermissionState(scope.workspaceId, record, scope.workspace);
    return {
      ok: true,
      workspaceId: scope.workspaceId,
      domains: Array.from(record.domains),
      permission,
      downloadDirectoryConfigured: permission.downloadDirectoryConfigured,
      // Keep the legacy field non-empty for old clients without exposing the workspace root.
      downloadDirectory: BROWSER_DOWNLOAD_DIRECTORY_MARKER,
      updatedAt: record.updatedAt || new Date(this.now()).toISOString()
    };
  }

  permissionSet(payload, ownerId) {
    this.prunePlans();
    const scope = this.validateScope(payload);
    if (!scope.ok) return scope;
    const domains = [];
    const source = Array.isArray(payload.domains) ? payload.domains : [];
    for (const value of source) {
      const normalized = normalizeDomainRule(value);
      if (normalized && !domains.includes(normalized)) domains.push(normalized);
    }
    if (domains.length > 128) return failure('browser_permission_invalid', 'Browser domain allowlist is too large.', 'Keep at most 128 exact or wildcard domain rules.');
    const planInput = { workspaceId: scope.workspaceId, domains };
    if (!readBoolean(payload, 'confirm', false)) {
      const planId = randomId('browserperm');
      const expiresAt = this.now() + BROWSER_PLAN_TTL_MS;
      this.plans.set(planId, { kind: 'permission.set', digest: digestValue(planInput), input: planInput, expiresAt });
      const permission = this.publicPermissionState(scope.workspaceId, { domains: new Set(domains), updatedAt: '' }, scope.workspace);
      return {
        ok: true,
        preview: true,
        confirmed: false,
        planId,
        workspaceId: scope.workspaceId,
        domains,
        permission,
        downloadDirectoryConfigured: permission.downloadDirectoryConfigured,
        expiresAt: new Date(expiresAt).toISOString(),
        updatedAt: new Date(this.now()).toISOString()
      };
    }
    const planId = readString(payload, 'planId', '');
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    if (!plan || plan.kind !== 'permission.set' || plan.expiresAt <= this.now() || plan.digest !== digestValue(planInput)) {
      return failure('browser_plan_stale', 'Browser permission plan is missing, expired, or changed.', 'Request a fresh permission preview.');
    }
    const record = this.permissionRecord(scope.workspaceId);
    record.domains = new Set(domains);
    record.updatedAt = new Date(this.now()).toISOString();
    this.persistPermissions();
    const permission = this.publicPermissionState(scope.workspaceId, record, scope.workspace);
    this.broadcast({ kind: 'browser.permission.updated', ownerId: normalizeOwnerId(ownerId), workspaceId: scope.workspaceId, domains, permission, updatedAt: record.updatedAt });
    return { ok: true, preview: false, confirmed: true, planId, workspaceId: scope.workspaceId, domains, permission, downloadDirectoryConfigured: permission.downloadDirectoryConfigured, updatedAt: record.updatedAt };
  }

  validateNavigation(scope, payload) {
    const parsed = normalizeHttpUrl(readString(payload, 'url', ''));
    if (!parsed) return failure('browser_url_invalid', 'Browser navigation only accepts credential-free HTTP(S) URLs.', 'Use a valid http:// or https:// URL without embedded credentials.');
    const permissions = this.permissionRecord(scope.workspaceId);
    if (!domainAllowed(parsed.hostname, permissions.domains)) {
      return failure('browser_domain_not_allowed', 'Browser navigation target is outside the workspace domain allowlist.', 'Preview and confirm a browser permission update for this domain.');
    }
    return { ok: true, url: parsed.toString() };
  }

  async validateUploadPaths(scope, payload) {
    const paths = Array.isArray(payload.filePaths) ? payload.filePaths : [];
    if (paths.length === 0 || paths.length > 32) return failure('browser_upload_invalid', 'Browser upload requires between 1 and 32 workspace files.', 'Choose files inside the active workspace.');
    const workspaceRoot = realPath(readString(scope.workspace, 'cwd', readString(scope.workspace, 'workspacePath', '')));
    const normalized = [];
    const files = [];
    let totalBytes = 0;
    for (const value of paths) {
      if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.existsSync(value)) return failure('browser_upload_path_invalid', 'Browser upload file does not exist.', 'Choose an existing file inside the active workspace.');
      const resolved = realPath(value);
      let stat;
      try {
        stat = fs.statSync(resolved);
      } catch (_error) {
        return failure('browser_upload_path_invalid', 'Browser upload file could not be inspected.', 'Choose a readable regular file inside the active workspace.');
      }
      if (!isPathInside(workspaceRoot, resolved) || !stat.isFile()) return failure('browser_upload_scope_violation', 'Browser upload file escapes the active workspace.', 'Choose a regular file inside the active workspace.');
      if (stat.size > this.maxUploadFileBytes) return failure('browser_upload_too_large', 'Browser upload file exceeds the per-file size limit.', 'Choose a smaller file or split the upload.');
      totalBytes += stat.size;
      if (totalBytes > this.maxUploadTotalBytes) return failure('browser_upload_too_large', 'Browser upload exceeds the total size limit.', 'Choose fewer or smaller files.');
      let sha256;
      try {
        sha256 = await hashFileSha256(resolved);
        const latest = fs.statSync(resolved);
        if (latest.size !== stat.size || latest.mtimeMs !== stat.mtimeMs) return failure('browser_upload_changed', 'Browser upload file changed while it was being inspected.', 'Request a fresh upload preview and confirm again.');
      } catch (_error) {
        return failure('browser_upload_path_invalid', 'Browser upload file could not be hashed.', 'Choose a readable regular file inside the active workspace.');
      }
      normalized.push(resolved);
      files.push({ path: resolved, size: stat.size, mtimeMs: stat.mtimeMs, sha256 });
    }
    return { ok: true, filePaths: normalized, files, totalBytes };
  }

  async action(payload) {
    this.prunePlans();
    const scope = this.validateScope(payload);
    if (!scope.ok) return scope;
    const validation = validateBrowserActionPayload(payload);
    if (!validation.ok) return validation;
    const kind = validation.kind;
    const commandPayload = validation.payload;
    delete commandPayload.confirm;
    delete commandPayload.planId;
    let upload = null;
    if (kind === 'upload') {
      upload = await this.validateUploadPaths(scope, payload);
      if (!upload.ok) return upload;
      commandPayload.filePaths = upload.filePaths;
    }
    if (kind === 'download') {
      commandPayload.downloadDirectory = path.join(
        realPath(readString(scope.workspace, 'cwd', readString(scope.workspace, 'workspacePath', ''))),
        BROWSER_DOWNLOAD_DIRECTORY_MARKER
      );
    }
    const needsConfirmation = SENSITIVE_ACTIONS.has(kind);
    const requestedHostId = readString(commandPayload, 'hostId', '');
    const selectedHost = needsConfirmation ? this.selectHost(scope, 'page.action', requestedHostId, kind) : null;
    if (needsConfirmation && !selectedHost) return this.hostUnavailableFailure(scope, 'page.action', requestedHostId, kind);
    const confirming = needsConfirmation && readBoolean(payload, 'confirm', false);
    let existingPlan = null;
    if (confirming) {
      const planId = readString(payload, 'planId', '');
      existingPlan = this.plans.get(planId) || null;
      this.plans.delete(planId);
      if (!existingPlan || existingPlan.kind !== 'page.action' || existingPlan.expiresAt <= this.now()) {
        return failure('browser_plan_stale', 'Browser action plan is missing, expired, or changed.', 'Request a fresh action preview.');
      }
    }
    const planRequest = this.actionPlanRequest(scope, commandPayload, kind, upload, selectedHost);
    if (confirming && existingPlan.digest !== digestValue(planRequest)) {
      return failure('browser_plan_stale', 'Browser action plan is missing, expired, or changed.', 'Request a fresh action preview.');
    }
    const targetState = needsConfirmation
      ? await this.captureActionTargetState(scope, commandPayload, selectedHost)
      : { ok: true, mode: 'none', digest: '', warnings: [] };
    if (!targetState.ok) return targetState;
    if (confirming && existingPlan.targetStateMode === 'bound') {
      if (targetState.mode !== 'bound') {
        return failure('browser_target_snapshot_required', 'The browser page could not be verified before confirmation.', 'Refresh the page snapshot and request a new action preview.');
      }
      if (targetState.digest !== existingPlan.targetStateDigest) {
        return failure('browser_target_changed', 'The browser page changed after the action preview.', 'Request a fresh action preview before confirming the action.');
      }
    }
    if (!confirming) {
      const planId = randomId('browseraction');
      const expiresAt = this.now() + BROWSER_PLAN_TTL_MS;
      this.plans.set(planId, {
        kind: 'page.action',
        digest: digestValue(planRequest),
        input: planRequest,
        targetStateMode: targetState.mode,
        targetStateDigest: targetState.digest,
        targetStateWarnings: targetState.warnings,
        expiresAt
      });
      const preview = {
        ok: true,
        preview: true,
        confirmed: false,
        planId,
        action: kind,
        target: publicBrowserActionTarget(scope, commandPayload, selectedHost, kind, ''),
        uploadBytes: upload ? upload.totalBytes : 0,
        uploadFileCount: upload ? upload.files.length : 0,
        expiresAt: new Date(expiresAt).toISOString(),
        warnings: ['This browser action can modify page or workspace state.'],
        updatedAt: new Date(this.now()).toISOString()
      };
      return attachBrowserActionTargetState(preview, targetState);
    }
    if (kind === 'download') {
      try {
        fs.mkdirSync(commandPayload.downloadDirectory, { recursive: true });
      } catch (error) {
        return failure('browser_download_directory_failed', error instanceof Error ? error.message : String(error), 'Check workspace write permissions and retry.');
      }
    }
    const dispatched = await this.dispatch(scope, 'page.action', commandPayload, kind);
    const target = publicBrowserActionTarget(scope, commandPayload, selectedHost, kind, readString(dispatched, 'hostId', ''));
    return attachBrowserActionTargetState(attachBrowserActionTarget(dispatched, target), targetState);
  }

  async execute(requestType, payload, ownerId) {
    if (requestType === 'browser.host.list') return this.listHosts(payload);
    if (requestType === 'browser.permission.get') return this.permissionGet(payload);
    if (requestType === 'browser.permission.set') return this.permissionSet(payload, ownerId);
    if (requestType === 'browser.page.action') return this.action(payload);
    const scope = this.validateScope(payload);
    if (!scope.ok) return scope;
    const mappings = {
      'browser.instance.list': 'instance.list',
      'browser.instance.create': 'instance.create',
      'browser.instance.close': 'instance.close',
      'browser.page.list': 'page.list',
      'browser.page.create': 'page.create',
      'browser.page.close': 'page.close',
      'browser.page.navigate': 'page.navigate',
      'browser.page.snapshot': 'page.snapshot',
      'browser.page.screenshot': 'page.screenshot',
      'browser.page.logs': 'page.logs',
      'browser.page.wait': 'page.wait',
      'browser.download.list': 'download.list'
    };
    const command = mappings[requestType];
    if (!command) return failure('browser_request_unsupported', 'Browser automation request is unsupported.', 'Upgrade the Bridge or use an advertised browser command.');
    const commandPayload = Object.assign({}, payload);
    if (requestType === 'browser.instance.close' || requestType === 'browser.page.close') {
      this.prunePlans();
      const planInput = {
        requestType,
        workspaceId: scope.workspaceId,
        agentId: scope.agentId,
        hostId: readString(payload, 'hostId', ''),
        instanceId: readString(payload, 'instanceId', ''),
        pageId: readString(payload, 'pageId', '')
      };
      if (!readBoolean(payload, 'confirm', false)) {
        const planId = randomId('browserclose');
        const expiresAt = this.now() + BROWSER_PLAN_TTL_MS;
        this.plans.set(planId, { kind: requestType, digest: digestValue(planInput), input: planInput, expiresAt });
        return { ok: true, preview: true, confirmed: false, planId, requestType, expiresAt: new Date(expiresAt).toISOString(), warnings: ['Closing browser state cannot be undone.'], updatedAt: new Date(this.now()).toISOString() };
      }
      const planId = readString(payload, 'planId', '');
      const plan = this.plans.get(planId);
      this.plans.delete(planId);
      if (!plan || plan.kind !== requestType || plan.expiresAt <= this.now() || plan.digest !== digestValue(planInput)) {
        return failure('browser_plan_stale', 'Browser close plan is missing, expired, or changed.', 'Request a fresh close preview.');
      }
      delete commandPayload.confirm;
      delete commandPayload.planId;
    }
    if (requestType === 'browser.page.create' && readString(payload, 'url', '')) {
      const navigation = this.validateNavigation(scope, payload);
      if (!navigation.ok) return navigation;
      commandPayload.url = navigation.url;
    }
    if (requestType === 'browser.page.navigate') {
      const operation = readString(payload, 'operation', 'navigate');
      if (operation === 'navigate') {
        const navigation = this.validateNavigation(scope, payload);
        if (!navigation.ok) return navigation;
        commandPayload.url = navigation.url;
      } else if (!['back', 'forward', 'reload'].includes(operation)) {
        return failure('browser_navigation_invalid', 'Browser navigation operation is unsupported.', 'Use navigate, back, forward, or reload.');
      }
    }
    return this.dispatch(scope, command, commandPayload);
  }
}

module.exports = {
  BROWSER_COMMAND_TIMEOUT_MS,
  BROWSER_PLAN_TTL_MS,
  MAX_BROWSER_RESULT_BYTES,
  MAX_BROWSER_UPLOAD_FILE_BYTES,
  MAX_BROWSER_UPLOAD_TOTAL_BYTES,
  MAX_BROWSER_ACTION_REF_BYTES,
  MAX_BROWSER_ACTION_TEXT_BYTES,
  MAX_BROWSER_ACTION_KEY_BYTES,
  MAX_BROWSER_ACTION_COORDINATE,
  MAX_BROWSER_ACTION_SCROLL_DELTA,
  MAX_PUBLIC_SCREENSHOT_BASE64_BYTES,
  MAX_PUBLIC_SCREENSHOT_BYTES,
  PUBLIC_SCREENSHOT_MIME_TYPES,
  BROWSER_DOWNLOAD_DIRECTORY_MARKER,
  SUPPORTED_HOST_COMMANDS,
  SUPPORTED_BROWSER_ACTIONS,
  SUPPORTED_BROWSER_HOST_KINDS,
  SUPPORTED_BROWSER_CAPABILITY_SOURCES,
  SUPPORTED_BROWSER_HOST_READINESS,
  BrowserAutomationManager,
  domainAllowed,
  normalizeDomainRule,
  normalizeHttpUrl,
  normalizeHostMetadataValue,
  normalizeSupportedPlatforms,
  normalizeCapabilityWarnings,
  sanitizeScreenshotHostResult,
  validateBrowserActionPayload
};
