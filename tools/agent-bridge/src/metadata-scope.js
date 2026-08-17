'use strict';

const METADATA_KINDS = Object.freeze(['sessionTitle', 'branchName', 'commitMessage', 'pullRequest']);
const MAX_PROMPT_BYTES = 4 * 1024;
const MAX_SUMMARY_BYTES = 6 * 1024;
const MAX_BRANCH_BYTES = 200;
const MAX_SUGGESTION_BYTES = 4 * 1024;
const MAX_ALTERNATIVE_BYTES = 1024;
const MAX_WARNING_BYTES = 512;
const METADATA_USAGE_TOKEN_KEYS = Object.freeze([
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'totalTokens'
]);

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function truncateUtf8(value, maxBytes) {
  const input = typeof value === 'string' ? value : '';
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) {
    return input;
  }
  let low = 0;
  let high = input.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(input.substring(0, middle), 'utf8') <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let end = low;
  if (end > 0 && end < input.length) {
    const code = input.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) {
      end -= 1;
    }
  }
  return input.substring(0, end);
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ') : '';
}

function boundedMetadataText(value, maxBytes) {
  return truncateUtf8(sanitizeText(value).trim(), maxBytes);
}

function redactSummary(value) {
  let result = boundedMetadataText(value, MAX_SUMMARY_BYTES);
  result = result.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, '[redacted-private-key]');
  result = result.replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[redacted]');
  result = result.replace(/((?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]');
  result = result.replace(/\bhttps?:\/\/[^\s<>"']+/gi, (candidate) => {
    const authorityMatch = candidate.match(/^(https?:\/\/)([^/?#\s]+)([\s\S]*)$/i);
    if (!authorityMatch) return candidate;
    const authority = authorityMatch[2];
    const atIndex = authority.lastIndexOf('@');
    if (atIndex < 0) return candidate;
    return authorityMatch[1] + '[redacted]@' + authority.substring(atIndex + 1) + authorityMatch[3];
  });
  result = result.replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|client_secret|secret|password|credential)=)[^&#\s]*/gi, '$1[redacted]');
  return result;
}

function safeUsageInteger(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function safeUsageCost(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }
  const value = source.cost;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeMetadataUsage(rawUsage, estimatedUsage) {
  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) {
    return null;
  }
  const usage = {
    source: 'provider',
    kind: 'metadata',
    estimated: rawUsage.estimated === true || estimatedUsage === true,
    window: 'session',
    occurredAt: ''
  };
  const rawEventId = readString(rawUsage, 'eventId', '');
  if (rawEventId.length > 0) {
    usage.eventId = boundedMetadataText(rawEventId, 160);
  }
  const rawOccurredAt = readString(rawUsage, 'occurredAt', '');
  const occurredAtMs = Date.parse(rawOccurredAt);
  usage.occurredAt = Number.isFinite(occurredAtMs) ? new Date(occurredAtMs).toISOString() : new Date().toISOString();
  let hasValue = false;
  for (const key of METADATA_USAGE_TOKEN_KEYS) {
    const value = safeUsageInteger(rawUsage, key);
    if (value !== undefined) {
      usage[key] = value;
      hasValue = true;
    }
  }
  if (usage.totalTokens === undefined && usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    const derivedTotal = usage.inputTokens + usage.outputTokens;
    if (Number.isSafeInteger(derivedTotal)) {
      usage.totalTokens = derivedTotal;
    }
  }
  const cost = safeUsageCost(rawUsage);
  if (cost !== undefined) {
    usage.cost = cost;
    hasValue = true;
    const currency = readString(rawUsage, 'currency', '').trim().toUpperCase();
    if (/^[A-Z]{3,8}$/.test(currency)) {
      usage.currency = currency;
    }
  }
  return hasValue ? usage : null;
}

function normalizeMetadataResult(kind, generated) {
  if (!METADATA_KINDS.includes(kind)) {
    return {
      ok: false,
      failureCategory: 'metadata_kind_invalid',
      message: 'Metadata kind is not supported.',
      remediation: 'Use sessionTitle, branchName, commitMessage, or pullRequest.'
    };
  }
  let rawSuggestion = '';
  let rawAlternatives = [];
  let rawWarnings = [];
  let estimatedUsage = false;
  let rawUsage = null;
  if (typeof generated === 'string') {
    rawSuggestion = generated;
  } else if (generated && typeof generated === 'object' && !Array.isArray(generated)) {
    rawSuggestion = readString(generated, 'suggestion', '');
    rawAlternatives = Array.isArray(generated.alternatives) ? generated.alternatives : [];
    rawWarnings = Array.isArray(generated.warnings) ? generated.warnings : [];
    estimatedUsage = generated.estimatedUsage === true;
    rawUsage = generated.usage && typeof generated.usage === 'object' && !Array.isArray(generated.usage)
      ? generated.usage : null;
  }
  const suggestion = boundedMetadataText(rawSuggestion, MAX_SUGGESTION_BYTES);
  if (suggestion.length === 0) {
    return {
      ok: false,
      failureCategory: 'metadata_empty',
      message: 'Metadata Provider returned an empty suggestion.',
      remediation: 'Retry the metadata preview or inspect the current Provider diagnostics.'
    };
  }
  const alternatives = [];
  let truncated = suggestion.length < sanitizeText(rawSuggestion).trim().length;
  for (const item of rawAlternatives) {
    if (typeof item !== 'string') continue;
    const normalized = boundedMetadataText(item, MAX_ALTERNATIVE_BYTES);
    if (normalized.length === 0 || normalized === suggestion || alternatives.includes(normalized)) continue;
    alternatives.push(normalized);
    if (normalized.length < item.trim().length) truncated = true;
    if (alternatives.length >= 5) break;
  }
  const warnings = [];
  for (const item of rawWarnings) {
    if (typeof item !== 'string') continue;
    const normalized = boundedMetadataText(item, MAX_WARNING_BYTES);
    if (normalized.length === 0 || warnings.includes(normalized)) continue;
    warnings.push(normalized);
    if (warnings.length >= 20) break;
  }
  if (truncated && !warnings.includes('metadata_result_truncated')) warnings.push('metadata_result_truncated');
  const result = { ok: true, suggestion, alternatives, warnings, estimatedUsage };
  const usage = normalizeMetadataUsage(rawUsage, estimatedUsage);
  if (usage) {
    result.usage = usage;
  }
  return result;
}

function mismatch(field, message) {
  return {
    ok: false,
    action: 'metadata.generate',
    failureCategory: 'metadata_scope_mismatch',
    message,
    remediation: 'Use the active Agent session and workspace scope for metadata generation.',
    scopeField: field
  };
}

function validateMetadataScope(payload, options) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const settings = options && typeof options === 'object' ? options : {};
  const match = settings.match && typeof settings.match === 'object' ? settings.match : null;
  const agentManager = settings.agentManager && typeof settings.agentManager === 'object' ? settings.agentManager : null;
  const connection = settings.connection && typeof settings.connection === 'object' ? settings.connection : null;
  const sessionId = readString(source, 'sessionId', '');
  if (sessionId.length === 0) {
    return {
      ok: false,
      action: 'metadata.generate',
      failureCategory: 'session_required',
      message: 'A session is required for metadata generation.',
      remediation: 'Select an active Agent session and try again.'
    };
  }
  if (!match || !match.provider) {
    return {
      ok: false,
      action: 'metadata.generate',
      failureCategory: 'session_not_found',
      message: 'The requested Agent session was not found.',
      remediation: 'Refresh the session list and select an active session.'
    };
  }
  const clientHello = connection && connection.clientHello && typeof connection.clientHello === 'object'
    ? connection.clientHello
    : {};
  const connectionHostProfileId = readString(clientHello, 'hostProfileId', '');
  const requestedHostProfileId = readString(source, 'hostProfileId', '');
  if (connectionHostProfileId.length > 0 && requestedHostProfileId.length > 0 && connectionHostProfileId !== requestedHostProfileId) {
    return mismatch('hostProfileId', 'The metadata request belongs to another host profile.');
  }
  const hostProfileId = connectionHostProfileId || requestedHostProfileId;
  const record = agentManager && typeof agentManager.findBySessionId === 'function'
    ? agentManager.findBySessionId(sessionId)
    : null;
  const requestedAgentId = readString(source, 'agentId', '');
  if (requestedAgentId.length > 0 && !record) {
    return {
      ok: false,
      action: 'metadata.generate',
      failureCategory: 'agent_not_found',
      message: 'The Agent record for this session was not found.',
      remediation: 'Refresh Agent state and retry metadata generation.'
    };
  }
  if (record && requestedAgentId.length > 0 && requestedAgentId !== record.id) {
    return mismatch('agentId', 'The metadata request belongs to another Agent.');
  }
  const providerId = typeof match.provider.id === 'string' ? match.provider.id : '';
  const requestedProviderId = readString(source, 'providerId', '');
  if (requestedProviderId.length > 0 && requestedProviderId !== providerId) {
    return mismatch('providerId', 'The metadata request selected another Provider.');
  }
  if (record && record.provider.length > 0 && record.provider !== providerId) {
    return mismatch('providerId', 'The Agent session is owned by another Provider.');
  }
  const requestedProviderSessionId = readString(source, 'providerSessionId', '');
  if (record && requestedProviderSessionId.length > 0 &&
      requestedProviderSessionId !== record.providerSessionId && requestedProviderSessionId !== record.remoteSessionId) {
    return mismatch('providerSessionId', 'The metadata request selected another Provider session.');
  }
  const requestedWorkspaceId = readString(source, 'workspaceId', '');
  if (record && requestedWorkspaceId.length > 0 && record.workspaceId.length > 0 && requestedWorkspaceId !== record.workspaceId) {
    return mismatch('workspaceId', 'The metadata request belongs to another workspace.');
  }
  const session = match.session && typeof match.session === 'object' ? match.session : {};
  const workspaceId = record && record.workspaceId.length > 0 ? record.workspaceId : requestedWorkspaceId;
  const workspacePath = record && record.rootPath.length > 0
    ? record.rootPath
    : readString(session, 'workspacePath', readString(session, 'cwd', ''));
  const agentId = record ? record.id : requestedAgentId;
  const modelId = record && record.modelId.length > 0 ? record.modelId : readString(source, 'modelId', '');
  const kindValue = readString(source, 'kind', 'sessionTitle');
  if (kindValue.length > 0 && !METADATA_KINDS.includes(kindValue)) {
    return {
      ok: false,
      action: 'metadata.generate',
      failureCategory: 'metadata_kind_invalid',
      message: 'Metadata kind is not supported.',
      remediation: 'Use sessionTitle, branchName, commitMessage, or pullRequest.'
    };
  }
  const kind = METADATA_KINDS.includes(kindValue) ? kindValue : 'sessionTitle';
  const providerPayload = {
    kind,
    prompt: boundedMetadataText(readString(source, 'prompt', ''), MAX_PROMPT_BYTES),
    timelineSummary: redactSummary(readString(source, 'timelineSummary', '')),
    diffSummary: redactSummary(readString(source, 'diffSummary', '')),
    branchName: boundedMetadataText(readString(source, 'branchName', ''), MAX_BRANCH_BYTES),
    workspacePath,
    workspaceId,
    agentId,
    sessionId,
    modelId
  };
  const warnings = [];
  if (!record) {
    warnings.push('agent_scope_unavailable_legacy_session');
  }
  if (hostProfileId.length === 0) {
    warnings.push('host_scope_unverified_legacy_client');
  }
  return {
    ok: true,
    hostProfileId,
    agentId,
    workspaceId,
    providerId,
    sessionId,
    providerSessionId: record ? record.providerSessionId : sessionId,
    workspacePath,
    record,
    providerPayload,
    warnings
  };
}

module.exports = {
  METADATA_KINDS,
  redactSummary,
  normalizeMetadataUsage,
  normalizeMetadataResult,
  validateMetadataScope
};
