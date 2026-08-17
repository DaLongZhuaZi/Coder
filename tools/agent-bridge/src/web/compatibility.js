'use strict';

(function installWebCompatibility(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AgentBridgeWebCompatibility = api;
})(typeof window !== 'undefined' ? window : null, () => {
  const KNOWN_FEATURES = Object.freeze([
    'agentLifecycle',
    'terminalBinaryFrames',
    'terminalActivity',
    'gitAdvanced',
    'workspaceFiles',
    'offlineNotifications',
    'diagnosticsExport',
    'richContentAst',
    'messageQueue',
    'usageEvents',
    'usageBudgets',
    'providerUsage',
    'metadataGeneration',
    'serviceProxy',
    'browserAutomation',
    'browserHostCapabilityMetadata',
    'browserPlatformHost',
    'githubIntegration',
    'githubPrWorkflow',
    'githubAssetUpload'
  ]);
  const KNOWN_EVENTS = new Set([
    'bridge.connected',
    'server.info',
    'agent.updated',
    'session.created',
    'session.messages',
    'message.delta',
    'message.completed',
    'message.queue.updated',
    'workspace.registry.updated',
    'workspace.changes.updated',
    'workspace.files.updated',
    'file.download.ready',
    'terminal.updated',
    'terminal.activity',
    'terminal.snapshot',
    'terminal.stream.exit',
    'terminal.attention',
    'notification.updated',
    'browser.updated',
    'github.auth.updated',
    'github.binding.updated',
    'github.pr.updated',
    'github.checks.updated',
    'daemon.health.updated',
    'daemon.config.updated',
    'daemon.update.updated',
    'usage.updated',
    'usage.budget.warning',
    'diagnostics.updated'
  ]);

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function stringValue(source, key, fallback) {
    return isObject(source) && typeof source[key] === 'string' ? source[key] : fallback;
  }

  function objectValue(source, key) {
    return isObject(source) && isObject(source[key]) ? source[key] : null;
  }

  function arrayValue(source, key) {
    return isObject(source) && Array.isArray(source[key]) ? source[key] : [];
  }

  function normalizeFeatures(source) {
    const features = {};
    if (!isObject(source)) return features;
    Object.keys(source).forEach((key) => {
      if (typeof source[key] === 'boolean') features[key] = source[key];
    });
    return features;
  }

  function normalizeProviderCapabilities(payload) {
    const hasProvidersField = isObject(payload) && Array.isArray(payload.providers);
    const items = Array.isArray(payload) ? payload : arrayValue(payload, 'providers');
    const providers = items.filter((item) => isObject(item)).map((item) => {
      const capabilities = objectValue(item, 'capabilities') || {};
      return {
        providerId: stringValue(item, 'providerId', stringValue(item, 'id', '')),
        name: stringValue(item, 'name', stringValue(item, 'displayName', '')),
        capabilities: {
          usageEvents: capabilities.usageEvents === true,
          metadataGeneration: capabilities.metadataGeneration === true,
          providerUsage: capabilities.providerUsage === true
        }
      };
    }).filter((item) => item.providerId.length > 0);
    return { providers, advertised: hasProvidersField || Array.isArray(payload) };
  }

  function providerCapabilityEnabled(providers, providerId, capability) {
    if (!Array.isArray(providers) || typeof providerId !== 'string' || providerId.length === 0 || typeof capability !== 'string' || capability.length === 0) {
      return false;
    }
    const provider = providers.find((item) => isObject(item) && stringValue(item, 'providerId', '') === providerId);
    const capabilities = provider ? objectValue(provider, 'capabilities') : null;
    return capabilities !== null && capabilities[capability] === true;
  }

  function normalizeCompatibility(source) {
    const item = isObject(source) ? source : {};
    const allowed = ['compatible', 'upgradeRecommended', 'appTooOld', 'bridgeTooOld', 'unknown'];
    const candidate = stringValue(item, 'status', 'unknown');
    return {
      status: allowed.includes(candidate) ? candidate : 'unknown',
      blocking: item.blocking === true,
      reason: stringValue(item, 'reason', ''),
      remediation: stringValue(item, 'remediation', ''),
      minimumAppVersion: stringValue(item, 'minimumAppVersion', ''),
      recommendedAppVersion: stringValue(item, 'recommendedAppVersion', ''),
      minimumBridgeVersion: stringValue(item, 'minimumBridgeVersion', ''),
      recommendedBridgeVersion: stringValue(item, 'recommendedBridgeVersion', '')
    };
  }

  function normalizeBridgeCapabilities(health) {
    const healthObject = isObject(health) ? health : {};
    const serverInfo = objectValue(healthObject, 'serverInfo') || {};
    const healthFeatures = objectValue(healthObject, 'features');
    const serverFeatures = objectValue(serverInfo, 'features');
    const advertisedSource = healthFeatures || serverFeatures;
    const features = normalizeFeatures(advertisedSource);
    const hasFeatureAdvertisement = advertisedSource !== null;
    return {
      serverInfo,
      features,
      hasFeatureAdvertisement,
      legacy: !hasFeatureAdvertisement,
      core: {
        agentList: true,
        agentAttach: true,
        agentSend: true,
        workspaceFallback: true,
        sessionAttachTimeline: true
      },
      compatibility: normalizeCompatibility(objectValue(serverInfo, 'compatibility') || objectValue(healthObject, 'compatibility')),
      warnings: hasFeatureAdvertisement ? [] : ['feature_advertisement_missing']
    };
  }

  function featureEnabled(capabilities, name) {
    return isObject(capabilities) && isObject(capabilities.features) && capabilities.features[name] === true;
  }

  function hasFeature(capabilities, name) {
    return featureEnabled(capabilities, name);
  }

  function normalizeAgents(payload) {
    const items = Array.isArray(payload) ? payload : arrayValue(payload, 'agents');
    return items.filter((item) => isObject(item));
  }

  function normalizeWorkspaces(payload) {
    const items = Array.isArray(payload) ? payload : arrayValue(payload, 'workspaces');
    return items.filter((item) => isObject(item));
  }

  const RICH_CONTENT_KINDS = Object.freeze(['text', 'code', 'link', 'file', 'tool', 'todo', 'diff', 'warning', 'fallback']);
  const RICH_TOOL_NAMES = Object.freeze(['file', 'shell', 'Git', 'GitHub', 'checkpoint', 'terminal', 'permission', 'plan']);
  const RICH_CONTENT_MAX_NODES = 64;
  const RICH_CONTENT_MAX_TEXT_BYTES = 16 * 1024;
  const RICH_CONTENT_MAX_CODE_BYTES = 64 * 1024;
  const RICH_CONTENT_MAX_CODE_LINES = 2000;

  function utf8ByteLength(value) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).length;
    try { return unescape(encodeURIComponent(value)).length; } catch (_error) { return value.length; }
  }

  function truncateUtf8(value, maxBytes) {
    const input = typeof value === 'string' ? value : '';
    if (utf8ByteLength(input) <= maxBytes) return input;
    let low = 0;
    let high = input.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (utf8ByteLength(input.substring(0, middle)) <= maxBytes) low = middle;
      else high = middle - 1;
    }
    let end = low;
    if (end > 0 && end < input.length) {
      const code = input.charCodeAt(end - 1);
      if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
    }
    return input.substring(0, end);
  }

  function boundedText(value, maxBytes) {
    return truncateUtf8(typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ') : '', maxBytes);
  }

  function safeRelativePath(value) {
    const candidate = boundedText(value, 1024).trim().replace(/\\/g, '/');
    if (candidate.length === 0 || candidate.startsWith('/') || /^[A-Za-z]:\//.test(candidate)) return '';
    const segments = candidate.split('/');
    if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return '';
    return candidate;
  }

  function safeLinkUrl(value) {
    const candidate = boundedText(value, 4096).trim();
    if (candidate.length === 0) return '';
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
      ['token', 'access_token', 'refresh_token', 'api_key', 'apikey', 'client_secret', 'secret', 'password', 'credential'].forEach((key) => parsed.searchParams.delete(key));
      return parsed.toString();
    } catch (_error) {
      return '';
    }
  }

  function fallbackRichNode(value, reason) {
    return {
      kind: 'fallback',
      text: boundedText(value, RICH_CONTENT_MAX_TEXT_BYTES),
      reason: boundedText(reason, 128)
    };
  }

  function normalizeRichContentNode(source) {
    const item = isObject(source) ? source : {};
    const rawKind = stringValue(item, 'kind', 'fallback');
    if (!RICH_CONTENT_KINDS.includes(rawKind)) return fallbackRichNode(stringValue(item, 'text', stringValue(item, 'content', '')), 'unknown_kind');
    if (rawKind === 'text') return { kind: 'text', text: boundedText(stringValue(item, 'text', stringValue(item, 'content', '')), RICH_CONTENT_MAX_TEXT_BYTES) };
    if (rawKind === 'code') {
      const rawText = stringValue(item, 'text', stringValue(item, 'content', ''));
      const bounded = truncateUtf8(rawText, RICH_CONTENT_MAX_CODE_BYTES);
      const lines = bounded.split('\n');
      const lineLimited = lines.length > RICH_CONTENT_MAX_CODE_LINES;
      const textValue = lineLimited ? lines.slice(0, RICH_CONTENT_MAX_CODE_LINES).join('\n') : bounded;
      return {
        kind: 'code',
        language: boundedText(stringValue(item, 'language', 'text'), 64).trim() || 'text',
        text: textValue,
        lineCount: lines.length,
        truncated: lineLimited || bounded.length < rawText.length
      };
    }
    if (rawKind === 'link') {
      const url = safeLinkUrl(stringValue(item, 'url', ''));
      if (url.length === 0) return fallbackRichNode(stringValue(item, 'label', stringValue(item, 'text', '')), 'unsafe_link');
      return { kind: 'link', url, label: boundedText(stringValue(item, 'label', stringValue(item, 'text', url)), 1024) || url };
    }
    if (rawKind === 'file') {
      const workspaceId = boundedText(stringValue(item, 'workspaceId', ''), 256).trim();
      const relativePath = safeRelativePath(stringValue(item, 'relativePath', stringValue(item, 'path', '')));
      if (workspaceId.length === 0 || relativePath.length === 0) return fallbackRichNode(stringValue(item, 'displayName', relativePath), 'unsafe_file_scope');
      const line = typeof item.line === 'number' && Number.isSafeInteger(item.line) && item.line > 0 && item.line <= 1000000 ? item.line : null;
      return { kind: 'file', workspaceId, relativePath, line, displayName: boundedText(stringValue(item, 'displayName', relativePath), 512) || relativePath };
    }
    if (rawKind === 'tool') {
      const toolName = boundedText(stringValue(item, 'toolName', stringValue(item, 'name', 'fallback')), 128).trim();
      const normalizedTool = RICH_TOOL_NAMES.includes(toolName) ? toolName : 'fallback';
      if (normalizedTool === 'fallback') return fallbackRichNode(stringValue(item, 'text', stringValue(item, 'content', toolName)), 'unknown_tool');
      return {
        kind: 'tool',
        toolName: normalizedTool,
        title: boundedText(stringValue(item, 'title', toolName || 'Tool'), 512),
        status: boundedText(stringValue(item, 'status', 'info'), 64),
        text: boundedText(stringValue(item, 'text', stringValue(item, 'content', '')), RICH_CONTENT_MAX_TEXT_BYTES)
      };
    }
    if (rawKind === 'todo') {
      const id = boundedText(stringValue(item, 'id', ''), 256).trim();
      const status = stringValue(item, 'status', 'pending');
      const sourceName = boundedText(stringValue(item, 'source', ''), 256).trim();
      if (id.length === 0 || sourceName.length === 0 || !['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(status)) return fallbackRichNode(stringValue(item, 'text', stringValue(item, 'title', '')), 'todo_contract_invalid');
      return { kind: 'todo', id, status, source: sourceName, title: boundedText(stringValue(item, 'title', stringValue(item, 'text', id)), 1024) };
    }
    if (rawKind === 'diff') {
      const rawText = stringValue(item, 'text', stringValue(item, 'content', ''));
      const bounded = truncateUtf8(rawText, RICH_CONTENT_MAX_CODE_BYTES);
      return {
        kind: 'diff',
        path: safeRelativePath(stringValue(item, 'path', '')),
        text: bounded,
        truncated: bounded.length < rawText.length || item.truncated === true,
        truncationReason: boundedText(stringValue(item, 'truncationReason', ''), 256)
      };
    }
    if (rawKind === 'warning') return { kind: 'warning', text: boundedText(stringValue(item, 'text', stringValue(item, 'message', '')), RICH_CONTENT_MAX_TEXT_BYTES), code: boundedText(stringValue(item, 'code', ''), 128) };
    return fallbackRichNode(stringValue(item, 'text', stringValue(item, 'content', '')), rawKind === 'fallback' ? stringValue(item, 'reason', '') : 'fallback');
  }

  function normalizeRichContentNodes(source) {
    const items = Array.isArray(source) ? source : [];
    if (items.length <= RICH_CONTENT_MAX_NODES) {
      return items.map((item) => normalizeRichContentNode(item));
    }
    const nodes = items.slice(0, RICH_CONTENT_MAX_NODES - 1).map((item) => normalizeRichContentNode(item));
    nodes.push(fallbackRichNode('Additional rich content was omitted.', 'node_limit'));
    return nodes;
  }

  function normalizeMessage(source) {
    const item = isObject(source) ? source : {};
    const nodes = normalizeRichContentNodes(item.contentNodes);
    return Object.assign({}, item, { contentNodes: nodes });
  }

  function normalizeSessionMessages(payload) {
    if (Array.isArray(payload)) return { messages: payload.filter((item) => isObject(item)).map((item) => normalizeMessage(item)), source: 'array', supported: true, warning: '' };
    const item = isObject(payload) ? payload : {};
    const messages = arrayValue(item, 'messages');
    if (messages.length > 0) return { messages: messages.filter((entry) => isObject(entry)).map((entry) => normalizeMessage(entry)), source: 'messages', supported: true, warning: '' };
    const timeline = arrayValue(item, 'timeline');
    if (timeline.length > 0) return { messages: timeline.filter((entry) => isObject(entry)).map((entry) => normalizeMessage(entry)), source: 'timeline', supported: true, warning: 'legacy_timeline_source' };
    const items = arrayValue(item, 'items');
    if (items.length > 0) return { messages: items.filter((entry) => isObject(entry)).map((entry) => normalizeMessage(entry)), source: 'items', supported: true, warning: 'legacy_items_source' };
    const hasMessagesField = Object.keys(item).includes('messages') || Object.keys(item).includes('timeline') || Object.keys(item).includes('items');
    return { messages: [], source: hasMessagesField ? 'empty' : 'unsupported', supported: hasMessagesField, warning: hasMessagesField ? '' : 'session_messages_unavailable' };
  }

  function normalizeAgentAttach(payload) {
    const item = isObject(payload) ? payload : {};
    const messageResult = normalizeSessionMessages(item);
    const timeline = arrayValue(item, 'timeline').filter((entry) => isObject(entry));
    return {
      agent: objectValue(item, 'agent'),
      messages: messageResult.messages,
      timeline,
      messageSource: messageResult.source,
      sessionMessagesSupported: messageResult.supported,
      warning: messageResult.warning
    };
  }

  function normalizeWorkspaceRegistry(payload) {
    const workspaces = normalizeWorkspaces(payload);
    const hasRegistryField = isObject(payload) && Object.keys(payload).includes('workspaces');
    return {
      workspaces,
      supported: hasRegistryField || Array.isArray(payload),
      warning: hasRegistryField || Array.isArray(payload) ? '' : 'workspace_registry_unavailable'
    };
  }

  function boundedNumber(source, key) {
    if (!isObject(source) || typeof source[key] !== 'number' || !Number.isFinite(source[key])) return null;
    return source[key];
  }

  function normalizeQueueItem(source) {
    const item = isObject(source) ? source : {};
    const statuses = ['queued', 'sending', 'accepted', 'failed', 'cancelled'];
    const statusCandidate = stringValue(item, 'status', 'queued');
    return {
      queueId: stringValue(item, 'queueId', ''),
      clientMessageId: stringValue(item, 'clientMessageId', ''),
      hostProfileId: stringValue(item, 'hostProfileId', ''),
      workspaceId: stringValue(item, 'workspaceId', ''),
      agentId: stringValue(item, 'agentId', ''),
      sessionId: stringValue(item, 'sessionId', ''),
      status: statuses.includes(statusCandidate) ? statusCandidate : 'queued',
      attempt: boundedNumber(item, 'attempt'),
      failureCategory: stringValue(item, 'failureCategory', ''),
      message: stringValue(item, 'message', ''),
      createdAt: stringValue(item, 'createdAt', ''),
      updatedAt: stringValue(item, 'updatedAt', '')
    };
  }

  const COMPOSER_TOKEN_KINDS = Object.freeze(['text', 'slash', 'workspace', 'file', 'agent', 'attachment']);

  function normalizeComposerToken(source) {
    const item = isObject(source) ? source : {};
    const rawKind = stringValue(item, 'kind', 'text');
    return {
      id: stringValue(item, 'id', ''),
      kind: COMPOSER_TOKEN_KINDS.includes(rawKind) ? rawKind : 'text',
      label: stringValue(item, 'label', ''),
      value: stringValue(item, 'value', ''),
      hostProfileId: stringValue(item, 'hostProfileId', ''),
      workspaceId: stringValue(item, 'workspaceId', '')
    };
  }

  function normalizeComposerTokens(source) {
    const items = Array.isArray(source) ? source : [];
    return items.slice(0, 100).filter((item) => isObject(item)).map((item) => normalizeComposerToken(item));
  }

  function normalizeUsageAggregate(source) {
    const item = isObject(source) ? source : {};
    const tokensSource = objectValue(item, 'tokens') || {};
    const tokenKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens'];
    const tokens = {};
    tokenKeys.forEach((key) => { tokens[key] = boundedNumber(tokensSource, key); });
    const costs = arrayValue(item, 'costs').filter((cost) => isObject(cost)).map((cost) => ({
      amount: boundedNumber(cost, 'amount'),
      currency: stringValue(cost, 'currency', '')
    })).filter((cost) => cost.amount !== null && cost.currency.length > 0);
    return { tokens, costs };
  }

  function normalizeUsageQuota(source) {
    const item = isObject(source) ? source : {};
    return {
      providerId: stringValue(item, 'providerId', ''),
      source: stringValue(item, 'source', stringValue(item, 'quotaSource', '')),
      window: stringValue(item, 'window', ''),
      remaining: boundedNumber(item, 'remaining'),
      limit: boundedNumber(item, 'limit'),
      resetAt: stringValue(item, 'resetAt', ''),
      occurredAt: stringValue(item, 'occurredAt', '')
    };
  }

  function normalizeUsageEvent(source) {
    const item = isObject(source) ? source : {};
    const kind = stringValue(item, 'kind', 'usage');
    return {
      eventId: stringValue(item, 'eventId', ''),
      kind,
      hostProfileId: stringValue(item, 'hostProfileId', ''),
      workspaceId: stringValue(item, 'workspaceId', ''),
      agentId: stringValue(item, 'agentId', ''),
      sessionId: stringValue(item, 'sessionId', ''),
      providerId: stringValue(item, 'providerId', ''),
      source: stringValue(item, 'source', ''),
      estimated: item.estimated === true,
      occurredAt: stringValue(item, 'occurredAt', ''),
      tokens: normalizeUsageAggregate({ tokens: objectValue(item, 'tokens') || item }).tokens,
      cost: boundedNumber(item, 'cost'),
      currency: stringValue(item, 'currency', ''),
      quota: normalizeUsageQuota(item),
      beforeTokens: boundedNumber(item, 'beforeTokens'),
      afterTokens: boundedNumber(item, 'afterTokens'),
      reason: stringValue(item, 'reason', '')
    };
  }

  function normalizeUsageSummary(source) {
    const item = isObject(source) ? source : {};
    return {
      eventCount: boundedNumber(item, 'eventCount'),
      actual: normalizeUsageAggregate(item.actual),
      estimated: normalizeUsageAggregate(item.estimated),
      quotas: arrayValue(item, 'quotas').filter((quota) => isObject(quota)).map((quota) => normalizeUsageQuota(quota)),
      compactionEvents: arrayValue(item, 'compactionEvents').filter((event) => isObject(event)).map((event) => normalizeUsageEvent(event)),
      window: stringValue(item, 'window', ''),
      windowStartAt: stringValue(item, 'windowStartAt', ''),
      windowEndAt: stringValue(item, 'windowEndAt', '')
    };
  }

  function normalizeUsageBudget(source) {
    const item = isObject(source) ? source : {};
    return {
      hostProfileId: stringValue(item, 'hostProfileId', ''),
      sessionId: stringValue(item, 'sessionId', ''),
      agentId: stringValue(item, 'agentId', ''),
      window: stringValue(item, 'window', 'session'),
      tokenLimit: boundedNumber(item, 'tokenLimit'),
      costLimit: boundedNumber(item, 'costLimit'),
      currency: stringValue(item, 'currency', ''),
      warningThreshold: boundedNumber(item, 'warningThreshold'),
      updatedAt: stringValue(item, 'updatedAt', '')
    };
  }

  function normalizeProviderUsage(source) {
    const item = isObject(source) ? source : {};
    const allowedStates = ['unsupported', 'available-empty', 'available', 'failed', 'stale', 'loading'];
    const stateCandidate = stringValue(item, 'availabilityState', '');
    const windows = arrayValue(item, 'windows').filter((entry) => isObject(entry)).slice(0, 32).map((entry) => ({
      name: stringValue(entry, 'name', ''),
      label: stringValue(entry, 'label', ''),
      status: stringValue(entry, 'status', ''),
      unit: stringValue(entry, 'unit', ''),
      used: boundedNumber(entry, 'used'),
      remaining: boundedNumber(entry, 'remaining'),
      limit: boundedNumber(entry, 'limit'),
      resetAt: stringValue(entry, 'resetAt', '')
    }));
    const details = arrayValue(item, 'details').filter((entry) => isObject(entry)).slice(0, 64).map((entry, index) => ({
      key: stringValue(entry, 'key', 'detail-' + String(index + 1)).slice(0, 128),
      label: stringValue(entry, 'label', '').slice(0, 256),
      value: stringValue(entry, 'value', '').slice(0, 1024),
      status: stringValue(entry, 'status', 'info').slice(0, 64)
    }));
    return {
      ok: item.ok !== false,
      providerId: stringValue(item, 'providerId', ''),
      hostProfileId: stringValue(item, 'hostProfileId', ''),
      workspaceId: stringValue(item, 'workspaceId', ''),
      agentId: stringValue(item, 'agentId', ''),
      sessionId: stringValue(item, 'sessionId', ''),
      window: stringValue(item, 'window', 'session'),
      status: stringValue(item, 'status', 'unavailable'),
      availabilityState: allowedStates.includes(stateCandidate) ? stateCandidate : 'unsupported',
      planLabel: stringValue(item, 'planLabel', '').slice(0, 256),
      source: stringValue(item, 'source', '').slice(0, 128),
      fetchedAt: stringValue(item, 'fetchedAt', ''),
      expiresAt: stringValue(item, 'expiresAt', ''),
      stale: item.stale === true,
      windows,
      details,
      warnings: arrayValue(item, 'warnings').filter((value) => typeof value === 'string').slice(0, 20).map((value) => value.slice(0, 512)),
      failureCategory: stringValue(item, 'failureCategory', '').slice(0, 128),
      message: stringValue(item, 'message', '').slice(0, 512),
      remediation: stringValue(item, 'remediation', '').slice(0, 512)
    };
  }

  const BROWSER_SCREENSHOT_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
  const BROWSER_SCREENSHOT_MAX_BASE64_BYTES = 8 * 1024 * 1024;
  const BROWSER_SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024;
  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64ByteLength(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || value.length > BROWSER_SCREENSHOT_MAX_BASE64_BYTES) return null;
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
    const bytes = [];
    let accumulator = 0;
    let bitCount = 0;
    for (let index = 0; index < value.length && bytes.length < 12; index += 1) {
      const character = value.charAt(index);
      if (character === '=') break;
      const digit = BASE64_ALPHABET.indexOf(character);
      if (digit < 0) return [];
      accumulator = (accumulator << 6) | digit;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        bytes.push((accumulator >> bitCount) & 0xff);
        accumulator &= bitCount === 0 ? 0 : (1 << bitCount) - 1;
      }
    }
    return bytes;
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
      return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    }
    return false;
  }

  function normalizeBrowserScreenshot(source) {
    const item = isObject(source) ? source : {};
    const raw = objectValue(item, 'screenshot') || {};
    const candidateMime = stringValue(raw, 'mimeType', '').trim().toLowerCase();
    const mimeType = BROWSER_SCREENSHOT_MIME_TYPES.includes(candidateMime) ? candidateMime : '';
    const dataBase64 = stringValue(raw, 'dataBase64', '').trim();
    const bytes = base64ByteLength(dataBase64);
    const valid = mimeType.length > 0 && dataBase64.length <= BROWSER_SCREENSHOT_MAX_BASE64_BYTES && bytes !== null && bytes <= BROWSER_SCREENSHOT_MAX_BYTES
      && hasScreenshotSignature(mimeType, dataBase64);
    return {
      ok: item.ok !== false,
      screenshot: {
        valid,
        mimeType: valid ? mimeType : '',
        dataBase64: valid ? dataBase64 : '',
        bytes: valid && bytes !== null ? bytes : null,
        fullPage: raw.fullPage === true
      },
      failureCategory: valid ? stringValue(item, 'failureCategory', '') : 'browser_screenshot_invalid',
      message: valid ? stringValue(item, 'message', '') : 'Browser screenshot data is unavailable or unsupported.',
      remediation: valid ? stringValue(item, 'remediation', '') : 'Request a PNG, JPEG, or WebP screenshot within the size limit.',
      warnings: arrayValue(item, 'warnings').filter((value) => typeof value === 'string').slice(0, 8),
      updatedAt: stringValue(item, 'updatedAt', '')
    };
  }

  const BROWSER_HOST_READINESS = Object.freeze(['ready', 'degraded', 'unavailable']);

  function normalizedStringArray(source, key, maxItems, maxLength) {
    const values = arrayValue(source, key);
    const result = [];
    values.forEach((value) => {
      if (typeof value !== 'string') return;
      const normalized = value.trim().slice(0, maxLength);
      if (normalized.length > 0 && !result.includes(normalized)) result.push(normalized);
    });
    return result.slice(0, maxItems);
  }

  function normalizeBrowserHost(source) {
    const item = isObject(source) ? source : {};
    const keys = Object.keys(item);
    const hostKind = stringValue(item, 'hostKind', 'external').toLowerCase();
    const capabilitySource = stringValue(item, 'capabilitySource', 'declared').toLowerCase();
    const platformHost = item.platformHost === true || hostKind === 'harmonyos' || capabilitySource === 'platform';
    const readinessAdvertised = keys.includes('readiness');
    const readinessCandidate = stringValue(item, 'readiness', '').toLowerCase();
    const readiness = BROWSER_HOST_READINESS.includes(readinessCandidate)
      ? readinessCandidate
      : platformHost ? 'unknown' : 'legacy';
    const connectedAdvertised = keys.includes('connected');
    const connected = connectedAdvertised ? item.connected === true : !platformHost;
    return {
      hostId: stringValue(item, 'hostId', ''),
      label: stringValue(item, 'label', ''),
      platform: stringValue(item, 'platform', 'external'),
      hostKind,
      runtime: stringValue(item, 'runtime', ''),
      capabilitySource,
      platformHost,
      readiness,
      readinessAdvertised,
      connected,
      connectedAdvertised,
      supportedPlatforms: normalizedStringArray(item, 'supportedPlatforms', 16, 64),
      capabilityWarnings: normalizedStringArray(item, 'capabilityWarnings', 8, 512),
      supportedCommands: normalizedStringArray(item, 'supportedCommands', 64, 96),
      supportedActions: normalizedStringArray(item, 'supportedActions', 32, 64),
      actionCapabilitiesExplicit: item.actionCapabilitiesExplicit === true,
      workspaceIds: normalizedStringArray(item, 'workspaceIds', 64, 128),
      registeredAt: stringValue(item, 'registeredAt', ''),
      lastSeenAt: stringValue(item, 'lastSeenAt', '')
    };
  }

  function normalizeBrowserHostList(source) {
    const items = Array.isArray(source) ? source : arrayValue(source, 'hosts');
    const advertised = Array.isArray(source) || (isObject(source) && Object.keys(source).includes('hosts'));
    const hosts = items.filter((item) => isObject(item)).map((item) => normalizeBrowserHost(item))
      .filter((item) => item.hostId.length > 0);
    return {
      hosts,
      totalCount: boundedNumber(source, 'totalCount') === null ? hosts.length : boundedNumber(source, 'totalCount'),
      updatedAt: stringValue(source, 'updatedAt', ''),
      supported: advertised,
      warning: advertised ? '' : 'browser_host_list_unavailable'
    };
  }

  function browserHostGate(host, capabilities) {
    const normalized = isObject(host) && Object.keys(host).includes('platformHost') ? host : normalizeBrowserHost(host);
    if (normalized.platformHost) {
      if (!featureEnabled(capabilities, 'browserHostCapabilityMetadata') || !featureEnabled(capabilities, 'browserPlatformHost')) {
        return {
          ok: false,
          failureCategory: 'browser_platform_capability_unavailable',
          remediation: 'Use a Bridge that advertises verified platform Browser host capabilities.'
        };
      }
      if (normalized.connected !== true) {
        return {
          ok: false,
          failureCategory: 'browser_host_disconnected',
          remediation: 'Reconnect the platform Browser host and refresh the host list.'
        };
      }
      if (normalized.readiness !== 'ready') {
        return {
          ok: false,
          failureCategory: 'browser_host_not_ready',
          remediation: 'Resolve the host capability warning and wait for readiness=ready.'
        };
      }
      return { ok: true, failureCategory: '', remediation: '' };
    }
    if (normalized.connected === false) {
      return {
        ok: false,
        failureCategory: 'browser_host_disconnected',
        remediation: 'Reconnect the Browser host and refresh the host list.'
      };
    }
    if (normalized.readinessAdvertised && normalized.readiness !== 'ready') {
      return {
        ok: false,
        failureCategory: 'browser_host_not_ready',
        remediation: 'Resolve the host capability warning and refresh the host list.'
      };
    }
    return { ok: true, failureCategory: '', remediation: '' };
  }

  function browserHostSupportsCommand(host, command, capabilities) {
    if (typeof command !== 'string' || command.length === 0) return false;
    const normalized = isObject(host) && Object.keys(host).includes('platformHost') ? host : normalizeBrowserHost(host);
    return browserHostGate(normalized, capabilities).ok && normalized.supportedCommands.includes(command);
  }

  function browserHostSupportsAction(host, action, capabilities) {
    if (typeof action !== 'string' || action.length === 0) return false;
    const normalized = isObject(host) && Object.keys(host).includes('platformHost') ? host : normalizeBrowserHost(host);
    if (!browserHostGate(normalized, capabilities).ok) return false;
    if (normalized.actionCapabilitiesExplicit !== true) return true;
    return normalized.supportedActions.includes(action);
  }

  function normalizeBrowserActionTarget(source) {
    const item = isObject(source) ? source : {};
    return {
      workspaceId: stringValue(item, 'workspaceId', ''),
      agentId: stringValue(item, 'agentId', ''),
      hostId: stringValue(item, 'hostId', ''),
      instanceId: stringValue(item, 'instanceId', ''),
      pageId: stringValue(item, 'pageId', ''),
      action: stringValue(item, 'action', '').toLowerCase()
    };
  }

  function normalizeBrowserActionTargetState(source) {
    const item = isObject(source) ? source : {};
    const modes = ['bound', 'legacy'];
    const candidate = stringValue(item, 'mode', 'unknown');
    return { mode: modes.includes(candidate) ? candidate : 'unknown' };
  }

  function normalizeBrowserActionResult(source) {
    const item = isObject(source) ? source : {};
    const targetSource = objectValue(item, 'target') || {
      workspaceId: stringValue(item, 'workspaceId', ''),
      agentId: stringValue(item, 'agentId', ''),
      hostId: stringValue(item, 'hostId', ''),
      instanceId: stringValue(item, 'instanceId', ''),
      pageId: stringValue(item, 'pageId', ''),
      action: stringValue(item, 'action', '')
    };
    return {
      ok: item.ok !== false,
      preview: item.preview === true,
      confirmed: item.confirmed === true,
      planId: stringValue(item, 'planId', ''),
      commandId: stringValue(item, 'commandId', ''),
      hostId: stringValue(item, 'hostId', ''),
      action: stringValue(item, 'action', ''),
      target: normalizeBrowserActionTarget(targetSource),
      targetState: normalizeBrowserActionTargetState(item.targetState),
      applied: item.applied === true,
      accepted: item.accepted === true,
      uploadBytes: boundedNumber(item, 'uploadBytes'),
      uploadFileCount: boundedNumber(item, 'uploadFileCount'),
      failureCategory: stringValue(item, 'failureCategory', ''),
      message: stringValue(item, 'message', ''),
      remediation: stringValue(item, 'remediation', ''),
      warnings: arrayValue(item, 'warnings').filter((value) => typeof value === 'string').slice(0, 8).map((value) => value.slice(0, 512)),
      updatedAt: stringValue(item, 'updatedAt', '')
    };
  }

  function normalizeMetadataResult(source) {
    const item = isObject(source) ? source : {};
    return {
      ok: item.ok !== false,
      kind: stringValue(item, 'kind', 'sessionTitle'),
      suggestion: stringValue(item, 'suggestion', ''),
      alternatives: arrayValue(item, 'alternatives').filter((value) => typeof value === 'string'),
      sourceProvider: stringValue(item, 'sourceProvider', ''),
      estimatedUsage: item.estimatedUsage === true,
      planId: stringValue(item, 'planId', ''),
      requestId: stringValue(item, 'requestId', ''),
      failureCategory: stringValue(item, 'failureCategory', ''),
      message: stringValue(item, 'message', ''),
      remediation: stringValue(item, 'remediation', ''),
      warnings: arrayValue(item, 'warnings').filter((value) => typeof value === 'string'),
      updatedAt: stringValue(item, 'updatedAt', '')
    };
  }

  function normalizeResponse(type, payload) {
    if (type === 'agent.list') return { agents: normalizeAgents(payload), supported: true, warning: '' };
    if (type === 'agent.attach') return normalizeAgentAttach(payload);
    if (type === 'workspace.registry.list') return normalizeWorkspaceRegistry(payload);
    if (type === 'session.messages') return normalizeSessionMessages(payload);
    if (type === 'message.queue.list') {
      return { items: arrayValue(payload, 'items').filter((item) => isObject(item)).map((item) => normalizeQueueItem(item)), supported: true, warning: '' };
    }
    if (type === 'message.send') {
      const queueItem = objectValue(payload, 'queueItem');
      return {
        accepted: payload && payload.accepted === true,
        queued: payload && payload.queued === true,
        queueItem: queueItem ? normalizeQueueItem(queueItem) : null,
        supported: true,
        warning: ''
      };
    }
    if (type === 'usage.summary.get') {
      return { summary: normalizeUsageSummary(objectValue(payload, 'summary') || payload), supported: true, warning: '' };
    }
    if (type === 'usage.events.list') {
      return { events: arrayValue(payload, 'events').filter((item) => isObject(item)).map((item) => normalizeUsageEvent(item)), supported: true, warning: '' };
    }
    if (type === 'usage.budget.get') {
      const budget = objectValue(payload, 'budget');
      return { budget: budget ? normalizeUsageBudget(budget) : null, supported: true, warning: '' };
    }
    if (type === 'provider.usage.list') {
      return { result: normalizeProviderUsage(payload), supported: true, warning: '' };
    }
    if (type === 'browser.page.screenshot') {
      return { result: normalizeBrowserScreenshot(payload), supported: true, warning: '' };
    }
    if (type === 'browser.host.list') {
      return normalizeBrowserHostList(payload);
    }
    if (type === 'browser.page.action') {
      return { result: normalizeBrowserActionResult(payload), supported: true, warning: '' };
    }
    if (type === 'metadata.generate') {
      return { result: normalizeMetadataResult(payload), supported: true, warning: '' };
    }
    return { value: isObject(payload) || Array.isArray(payload) ? payload : {}, supported: true, warning: '' };
  }

  function normalizeOptionalFailure(type, error) {
    const message = error instanceof Error ? error.message : String(error || 'Request failed.');
    const lowered = message.toLowerCase();
    const unsupported = lowered.includes('unknown request') || lowered.includes('unsupported') || lowered.includes('not implemented') || lowered.includes('method not found') || lowered.includes('unknown type') || lowered.includes('not available');
    return {
      ok: false,
      type,
      unsupported,
      code: unsupported ? 'legacy_rpc_unsupported' : 'rpc_failed',
      message,
      warning: unsupported ? type + '_unsupported' : ''
    };
  }

  function normalizeEvent(message) {
    const item = isObject(message) ? message : {};
    const event = stringValue(item, 'event', '');
    const payload = objectValue(item, 'payload') || {};
    return {
      event,
      payload,
      known: KNOWN_EVENTS.has(event),
      hostProfileId: stringValue(payload, 'hostProfileId', ''),
      workspaceId: stringValue(payload, 'workspaceId', ''),
      agentId: stringValue(payload, 'agentId', ''),
      sessionId: stringValue(payload, 'sessionId', stringValue(item, 'sessionId', ''))
    };
  }

  function eventMatchesScope(event, scope) {
    const normalized = isObject(event) ? event : normalizeEvent(event);
    const expected = isObject(scope) ? scope : {};
    const pairs = [
      ['hostProfileId', normalized.hostProfileId, stringValue(expected, 'hostProfileId', '')],
      ['workspaceId', normalized.workspaceId, stringValue(expected, 'workspaceId', '')],
      ['agentId', normalized.agentId, stringValue(expected, 'agentId', '')],
      ['sessionId', normalized.sessionId, stringValue(expected, 'sessionId', '')]
    ];
    return pairs.every((pair) => pair[1].length === 0 || pair[2].length === 0 || pair[1] === pair[2]);
  }

  function isKnownFeature(name) {
    return KNOWN_FEATURES.includes(name);
  }

  return Object.freeze({
    KNOWN_FEATURES,
    KNOWN_EVENTS,
    isObject,
    normalizeFeatures,
    normalizeProviderCapabilities,
    providerCapabilityEnabled,
    normalizeCompatibility,
    normalizeBridgeCapabilities,
    featureEnabled,
    hasFeature,
    normalizeAgents,
    normalizeWorkspaces,
    normalizeRichContentNode,
    normalizeRichContentNodes,
    normalizeSessionMessages,
    normalizeAgentAttach,
    normalizeWorkspaceRegistry,
    normalizeQueueItem,
    normalizeComposerToken,
    normalizeComposerTokens,
    normalizeUsageAggregate,
    normalizeUsageQuota,
    normalizeUsageEvent,
    normalizeUsageSummary,
    normalizeUsageBudget,
    normalizeProviderUsage,
    normalizeBrowserScreenshot,
    normalizeBrowserHost,
    normalizeBrowserHostList,
    browserHostGate,
    browserHostSupportsCommand,
    browserHostSupportsAction,
    normalizeBrowserActionTarget,
    normalizeBrowserActionTargetState,
    normalizeBrowserActionResult,
    BROWSER_SCREENSHOT_MIME_TYPES,
    BROWSER_SCREENSHOT_MAX_BASE64_BYTES,
    BROWSER_SCREENSHOT_MAX_BYTES,
    normalizeMetadataResult,
    normalizeResponse,
    normalizeOptionalFailure,
    normalizeEvent,
    eventMatchesScope,
    isKnownFeature,
    stringValue,
    objectValue,
    arrayValue
  });
});
