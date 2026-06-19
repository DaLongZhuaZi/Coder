'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const { EventType, makeEvent } = require('../protocol');

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_LOCAL_DB_SESSIONS = 500;
const MAX_LOCAL_DB_MESSAGES = 1000;
const MAX_LOCAL_DB_PARTS = 8000;

function readStringValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'string') {
    return value;
  }
  return fallbackValue;
}

function readNumberValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : fallbackValue;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }
  return fallbackValue;
}

function readBooleanValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return fallbackValue;
}

function readObjectValue(source, key) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return null;
}

function readArrayValue(source, key) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  const value = source[key];
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function readAgentName(source) {
  if (!source || typeof source !== 'object') {
    return '';
  }
  const direct = readAgentNameValue(source);
  if (direct.length > 0) {
    return direct;
  }
  const payload = readObjectValue(source, 'payload');
  if (payload) {
    const payloadAgent = readAgentNameValue(payload);
    if (payloadAgent.length > 0) {
      return payloadAgent;
    }
  }
  const info = readObjectValue(source, 'info');
  if (info) {
    const infoAgent = readAgentNameValue(info);
    if (infoAgent.length > 0) {
      return infoAgent;
    }
  }
  const message = readObjectValue(source, 'message');
  if (message) {
    const messageAgent = readAgentNameValue(message);
    if (messageAgent.length > 0) {
      return messageAgent;
    }
  }
  const part = readObjectValue(source, 'part');
  if (part) {
    return readAgentNameValue(part);
  }
  return '';
}

function readAgentNameValue(source) {
  const direct = readStringValue(source, 'agent', '');
  if (direct.length > 0) {
    return direct;
  }
  const agentName = readStringValue(source, 'agentName', '');
  if (agentName.length > 0) {
    return agentName;
  }
  const subagent = readStringValue(source, 'subagent', '');
  if (subagent.length > 0) {
    return subagent;
  }
  const subAgent = readStringValue(source, 'subAgent', '');
  if (subAgent.length > 0) {
    return subAgent;
  }
  const agentId = readStringValue(source, 'agentId', '');
  if (agentId.length > 0) {
    return agentId;
  }
  return readStringValue(source, 'agentID', '');
}

function normalizeBaseUrl(baseUrl) {
  const value = typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : 'http://127.0.0.1:4096';
  if (value.endsWith('/')) {
    return value.substring(0, value.length - 1);
  }
  return value;
}

function defaultMetadataPath(providerId) {
  const safeProviderId = typeof providerId === 'string' && providerId.length > 0 ? providerId : 'opencode';
  return path.join(os.homedir(), '.ngf-agent-bridge', safeProviderId + '-sessions.json');
}

function readMetadataFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    // Metadata is best-effort. A bad cache must not block live OpenCode sessions.
  }
  return {};
}

function writeMetadataFile(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  } catch (error) {
    // Metadata is best-effort.
  }
}

function defaultDatabasePath(providerId) {
  const directoryName = providerId === 'mimo' ? 'mimocode' : (typeof providerId === 'string' && providerId.length > 0 ? providerId : 'opencode');
  return path.join(os.homedir(), '.local', 'share', directoryName, directoryName + '.db');
}

function loadDatabaseSync() {
  const originalEmitWarning = process.emitWarning;
  try {
    process.emitWarning = function suppressedSqliteExperimentalWarning(warning, type) {
      const warningText = typeof warning === 'string' ? warning : (warning && typeof warning.message === 'string' ? warning.message : '');
      if (type === 'ExperimentalWarning' && warningText.indexOf('SQLite') >= 0) {
        return;
      }
      return originalEmitWarning.apply(process, arguments);
    };
    const sqlite = require('node:sqlite');
    return sqlite.DatabaseSync;
  } catch (error) {
    return null;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function readSqliteColumnNames(db, tableName) {
  try {
    const rows = db.prepare('PRAGMA table_info(' + tableName + ')').all();
    const columns = new Set();
    for (const row of rows) {
      const name = readStringValue(row, 'name', '');
      if (name.length > 0) {
        columns.add(name);
      }
    }
    return columns;
  } catch (error) {
    return new Set();
  }
}

function parseJsonObjectText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function createSessionIdFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') {
    return '';
  }
  const directId = readStringValue(responseBody, 'id', '');
  if (directId.length > 0) {
    return directId;
  }
  const sessionId = readStringValue(responseBody, 'sessionId', '');
  if (sessionId.length > 0) {
    return sessionId;
  }
  const session = responseBody.session;
  if (session && typeof session === 'object') {
    return readStringValue(session, 'id', readStringValue(session, 'sessionId', ''));
  }
  return '';
}

function collectTextFragments(value, fragments, depth) {
  if (depth > 5 || value === null || value === undefined) {
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 0) {
      fragments.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, fragments, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const text = readStringValue(value, 'text', '');
  if (text.length > 0) {
    fragments.push(text);
  }
  const content = readStringValue(value, 'content', '');
  if (content.length > 0) {
    fragments.push(content);
  }
  const message = readStringValue(value, 'message', '');
  if (message.length > 0) {
    fragments.push(message);
  }
  const parts = value.parts;
  if (parts && Array.isArray(parts)) {
    collectTextFragments(parts, fragments, depth + 1);
  }
  const output = value.output;
  if (output) {
    collectTextFragments(output, fragments, depth + 1);
  }
  const result = value.result;
  if (result) {
    collectTextFragments(result, fragments, depth + 1);
  }
}

function collectMessageFragments(value, textFragments, reasoningFragments, depth) {
  if (depth > 5 || value === null || value === undefined) {
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 0) {
      textFragments.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMessageFragments(item, textFragments, reasoningFragments, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }

  const partType = readStringValue(value, 'type', '').toLowerCase();
  const isReasoningPart = partType === 'reasoning' || partType === 'thinking';
  const isToolPart = partType === 'tool' || partType === 'tool_call' || partType === 'tool-result' || partType === 'tool_result';
  const targetFragments = isReasoningPart ? reasoningFragments : textFragments;
  if (!isToolPart) {
    const text = readStringValue(value, 'text', '');
    if (text.length > 0) {
      targetFragments.push(text);
    }
    const content = readStringValue(value, 'content', '');
    if (content.length > 0) {
      targetFragments.push(content);
    }
    const message = readStringValue(value, 'message', '');
    if (message.length > 0) {
      targetFragments.push(message);
    }
  }

  const directReasoning = readStringValue(value, 'reasoningText', readStringValue(value, 'reasoning', readStringValue(value, 'thinking', '')));
  if (directReasoning.length > 0) {
    reasoningFragments.push(directReasoning);
  }
  const parts = value.parts;
  if (parts && Array.isArray(parts)) {
    collectMessageFragments(parts, textFragments, reasoningFragments, depth + 1);
  }
  const output = value.output;
  if (output && !isToolPart) {
    collectMessageFragments(output, textFragments, reasoningFragments, depth + 1);
  }
  const result = value.result;
  if (result && !isToolPart) {
    collectMessageFragments(result, textFragments, reasoningFragments, depth + 1);
  }
}

function modelIdFromOpenCodeModel(value, fallbackValue) {
  if (typeof value === 'string' && value.length > 0) {
    const parsed = parseJsonObjectText(value);
    if (parsed) {
      return modelIdFromOpenCodeModel(parsed, fallbackValue);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallbackValue;
  }
  const direct = readStringValue(value, 'modelId', readStringValue(value, 'modelID', readStringValue(value, 'id', '')));
  if (direct.length === 0) {
    return fallbackValue;
  }
  const providerId = readStringValue(value, 'providerId', readStringValue(value, 'providerID', ''));
  if (providerId.length > 0 && direct.indexOf('/') < 0) {
    return providerId + '/' + direct;
  }
  return direct;
}

function rowModelId(row, fallbackValue) {
  const fromModel = modelIdFromOpenCodeModel(row ? row.model : null, '');
  if (fromModel.length > 0) {
    return fromModel;
  }
  const providerId = readStringValue(row, 'provider_id', readStringValue(row, 'providerID', ''));
  const modelId = readStringValue(row, 'model_id', readStringValue(row, 'modelID', ''));
  if (providerId.length > 0 && modelId.length > 0) {
    return providerId + '/' + modelId;
  }
  if (modelId.length > 0) {
    return modelId;
  }
  return fallbackValue;
}

function parseModelSelection(modelId) {
  if (typeof modelId !== 'string' || modelId.length === 0 || modelId === 'configured') {
    return null;
  }
  const separator = modelId.indexOf('/');
  if (separator <= 0 || separator + 1 >= modelId.length) {
    return null;
  }
  return {
    providerID: modelId.substring(0, separator),
    modelID: modelId.substring(separator + 1)
  };
}

function buildMessageBody(text, modelId) {
  const body = {
    parts: [
      {
        type: 'text',
        text
      }
    ]
  };
  const model = parseModelSelection(modelId);
  if (model) {
    body.model = model;
  }
  return body;
}

function buildPromptBody(payload, session) {
  const text = readStringValue(payload, 'text', '');
  const explicitParts = readArrayValue(payload, 'parts');
  const parts = explicitParts.length > 0 ? explicitParts : [
    {
      type: 'text',
      text
    }
  ];
  const body = {
    parts
  };
  const modelId = readStringValue(payload, 'modelId', readStringValue(payload, 'model', session ? session.modelId : ''));
  const model = typeof payload.model === 'object' && payload.model !== null ? payload.model : parseModelSelection(modelId);
  if (model) {
    body.model = model;
  }
  const messageID = readStringValue(payload, 'messageID', readStringValue(payload, 'messageId', ''));
  if (messageID.length > 0) {
    body.messageID = messageID;
  }
  const agent = resolvePromptAgent(payload);
  if (agent.length > 0) {
    body.agent = agent;
  }
  const system = readStringValue(payload, 'system', '');
  if (system.length > 0) {
    body.system = system;
  }
  const variant = readStringValue(payload, 'variant', '');
  if (variant.length > 0) {
    body.variant = variant;
  }
  const reasoningMode = readStringValue(payload, 'reasoningMode', readStringValue(payload, 'thinkingMode', ''));
  if (reasoningMode.length > 0 && reasoningMode !== 'auto') {
    body.reasoning = { effort: reasoningMode };
    body.thinking = { effort: reasoningMode };
    body.reasoningEffort = reasoningMode;
  }
  const tools = readObjectValue(payload, 'tools');
  if (tools) {
    body.tools = tools;
  }
  if (readBooleanValue(payload, 'noReply', false)) {
    body.noReply = true;
  }
  return body;
}

function resolvePromptAgent(payload) {
  const explicitAgent = readStringValue(payload, 'agent', '');
  if (explicitAgent.length > 0) {
    return explicitAgent;
  }
  const modes = readArrayValue(payload, 'interactionModes');
  for (const mode of modes) {
    if (typeof mode === 'string' && mode.toLowerCase() === 'plan') {
      return 'plan';
    }
  }
  for (const mode of modes) {
    if (typeof mode === 'string' && mode.toLowerCase() === 'build') {
      return 'build';
    }
  }
  const interactionMode = readStringValue(payload, 'interactionMode', '');
  if (interactionMode === 'plan') {
    return 'plan';
  }
  if (interactionMode === 'build') {
    return 'build';
  }
  return '';
}

function buildOpenCodeModels(providerId) {
  const vendor = typeof providerId === 'string' && providerId.length > 0 ? providerId : 'opencode';
  return [
    {
      id: 'configured',
      displayName: 'Configured Model',
      vendor,
      isDefault: true,
      contextWindow: 0
    }
  ];
}

function addModelOption(models, seen, providerId, modelId, displayName, isDefault, contextWindow) {
  if (typeof providerId !== 'string' || providerId.length === 0 || typeof modelId !== 'string' || modelId.length === 0) {
    return;
  }
  const id = providerId + '/' + modelId;
  if (seen.has(id)) {
    return;
  }
  seen.add(id);
  models.push({
    id,
    displayName: displayName.length > 0 ? displayName : id,
    vendor: providerId,
    isDefault,
    contextWindow
  });
}

function readModelContextWindow(value) {
  if (!value || typeof value !== 'object') {
    return 0;
  }
  const direct = readNumberValue(
    value,
    'contextWindow',
    readNumberValue(
      value,
      'contextLength',
      readNumberValue(
        value,
        'context',
        readNumberValue(
          value,
          'maxContextTokens',
          readNumberValue(value, 'maxInputTokens', 0)
        )
      )
    )
  );
  if (direct > 0) {
    return direct;
  }
  const limits = readObjectValue(value, 'limits');
  if (limits) {
    return readModelContextWindow(limits);
  }
  const limit = readObjectValue(value, 'limit');
  if (limit) {
    return readModelContextWindow(limit);
  }
  return 0;
}

function addModelFromValue(models, seen, providerId, value, isDefault) {
  if (typeof value === 'string') {
    addModelOption(models, seen, providerId, value, value, isDefault, 0);
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const modelId = readStringValue(value, 'id', readStringValue(value, 'modelID', readStringValue(value, 'name', '')));
  const displayName = readStringValue(value, 'displayName', readStringValue(value, 'name', modelId));
  const contextWindow = readModelContextWindow(value);
  addModelOption(models, seen, providerId, modelId, displayName, isDefault, contextWindow);
}

function collectModelsFromContainer(models, seen, providerId, container, defaultModelId) {
  if (!container) {
    return;
  }
  if (Array.isArray(container)) {
    for (const item of container) {
      const modelId = typeof item === 'string' ? item : readStringValue(item, 'id', readStringValue(item, 'modelID', ''));
      addModelFromValue(models, seen, providerId, item, modelId.length > 0 && modelId === defaultModelId);
    }
    return;
  }
  if (typeof container !== 'object') {
    return;
  }
  for (const key of Object.keys(container)) {
    const value = container[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const displayName = readStringValue(value, 'displayName', readStringValue(value, 'name', key));
      const contextWindow = readModelContextWindow(value);
      addModelOption(models, seen, providerId, key, displayName, key === defaultModelId, contextWindow);
    } else {
      addModelOption(models, seen, providerId, key, key, key === defaultModelId, 0);
    }
  }
}

function collectProviderModels(models, seen, provider, defaultMap) {
  if (!provider || typeof provider !== 'object') {
    return;
  }
  const providerId = readStringValue(provider, 'id', readStringValue(provider, 'providerID', readStringValue(provider, 'name', '')));
  if (providerId.length === 0) {
    return;
  }
  const defaultModelId = defaultMap && typeof defaultMap === 'object' ? readStringValue(defaultMap, providerId, '') : '';
  const providerModels = provider.models;
  collectModelsFromContainer(models, seen, providerId, providerModels, defaultModelId);
}

function collectProviderMap(models, seen, providerMap, defaultMap) {
  if (!providerMap || typeof providerMap !== 'object' || Array.isArray(providerMap)) {
    return;
  }
  for (const key of Object.keys(providerMap)) {
    const value = providerMap[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const providerId = readStringValue(value, 'id', readStringValue(value, 'providerID', key));
    const defaultModelId = defaultMap && typeof defaultMap === 'object' ? readStringValue(defaultMap, providerId, '') : '';
    collectModelsFromContainer(models, seen, providerId, value.models, defaultModelId);
  }
}

function modelsFromProviderResponse(body, providerId) {
  const models = buildOpenCodeModels(providerId);
  const seen = new Set();
  seen.add('configured');
  if (!body || typeof body !== 'object') {
    return models;
  }
  if (Array.isArray(body)) {
    for (const provider of body) {
      collectProviderModels(models, seen, provider, null);
    }
    return models;
  }
  const defaultMap = body.default && typeof body.default === 'object' ? body.default : null;
  const providers = Array.isArray(body.providers) ? body.providers : (Array.isArray(body.all) ? body.all : []);
  for (const provider of providers) {
    collectProviderModels(models, seen, provider, defaultMap);
  }
  if (providers.length === 0 && body.providers && typeof body.providers === 'object') {
    collectProviderMap(models, seen, body.providers, defaultMap);
  }
  if (providers.length === 0) {
    collectProviderMap(models, seen, body, defaultMap);
  }
  return models;
}

function buildSpeedModes(displayName) {
  const name = typeof displayName === 'string' && displayName.length > 0 ? displayName : 'OpenCode';
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the model and runtime configured in ' + name + '.',
      isDefault: true
    }
  ];
}

function buildReasoningModes(displayName) {
  const name = typeof displayName === 'string' && displayName.length > 0 ? displayName : 'OpenCode';
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the reasoning effort configured in ' + name + '.',
      isDefault: true
    },
    {
      id: 'low',
      displayName: 'Low',
      description: 'Prefer lighter reasoning when the backing model supports it.',
      isDefault: false
    },
    {
      id: 'medium',
      displayName: 'Medium',
      description: 'Use balanced reasoning when the backing model supports it.',
      isDefault: false
    },
    {
      id: 'high',
      displayName: 'High',
      description: 'Use deeper reasoning when the backing model supports it.',
      isDefault: false
    }
  ];
}

function buildInteractionModes() {
  return [
    {
      id: 'build',
      displayName: 'Build',
      description: 'Use the OpenCode build agent for implementation work.',
      isDefault: true,
      agent: 'build'
    },
    {
      id: 'plan',
      displayName: 'Plan',
      description: 'Use the OpenCode plan agent before implementation.',
      isDefault: false,
      agent: 'plan'
    }
  ];
}

function buildTools(providerId, displayName) {
  const idPrefix = typeof providerId === 'string' && providerId.length > 0 ? providerId : 'opencode';
  const name = typeof displayName === 'string' && displayName.length > 0 ? displayName : 'OpenCode';
  return [
    {
      id: idPrefix + '.message',
      displayName: name + ' Message',
      description: 'Sends a user message into a ' + name + ' session.',
      risk: 'write'
    },
    {
      id: idPrefix + '.diff',
      displayName: name + ' Diff',
      description: 'Reads the current session diff.',
      risk: 'read'
    },
    {
      id: idPrefix + '.file',
      displayName: 'File Preview',
      description: 'Reads a file through the ' + name + ' server.',
      risk: 'read'
    }
  ];
}

function readArrayFromResponse(body) {
  return readArrayFromResponseDepth(body, 0);
}

function readArrayFromResponseDepth(body, depth) {
  if (Array.isArray(body)) {
    return body;
  }
  if (!body || typeof body !== 'object' || depth > 4) {
    return [];
  }
  const candidateKeys = ['sessions', 'data', 'items', 'results', 'messages', 'session', 'result'];
  for (const key of candidateKeys) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = readArrayFromResponseDepth(value, depth + 1);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
}

function normalizeTimestamp(value, fallbackValue) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  if (value < 1000000000000) {
    return value * 1000;
  }
  return value;
}

function normalizeMessageRole(raw) {
  let role = readStringValue(raw, 'role', '');
  if (role.length === 0) {
    role = readStringValue(raw, 'type', '');
  }
  const info = raw && typeof raw === 'object' ? raw.info : null;
  if (role.length === 0 && info && typeof info === 'object') {
    role = readStringValue(info, 'role', readStringValue(info, 'type', ''));
  }
  const lower = role.toLowerCase();
  if (lower.indexOf('user') >= 0) {
    return 'user';
  }
  if (lower.indexOf('assistant') >= 0 || lower.indexOf('agent') >= 0) {
    return 'assistant';
  }
  if (lower.indexOf('tool') >= 0) {
    return 'tool';
  }
  return 'status';
}

function normalizeRemoteMessage(raw, sessionId, index) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const textFragments = [];
  const reasoningFragments = [];
  collectMessageFragments(raw, textFragments, reasoningFragments, 0);
  let text = textFragments.join('\n').trim();
  const reasoningText = reasoningFragments.join('\n').trim();
  if (text.length === 0 && reasoningText.length === 0) {
    const fragments = [];
    collectTextFragments(raw, fragments, 0);
    text = fragments.join('\n').trim();
  }
  if (text.length === 0 && reasoningText.length === 0) {
    return null;
  }
  const info = raw.info && typeof raw.info === 'object' ? raw.info : null;
  const now = Date.now();
  const rawTime = readObjectValue(raw, 'time');
  const infoTime = info ? readObjectValue(info, 'time') : null;
  const createdAt = normalizeTimestamp(
    readNumberValue(raw, 'createdAt', readNumberValue(raw, 'timestamp', rawTime ? readNumberValue(rawTime, 'created', 0) : 0)),
    info ? normalizeTimestamp(
      readNumberValue(info, 'createdAt', readNumberValue(info, 'timestamp', infoTime ? readNumberValue(infoTime, 'created', now) : now)),
      now
    ) : now
  );
  const id = readStringValue(raw, 'id', info ? readStringValue(info, 'id', '') : '');
  const messageId = readStringValue(raw, 'messageId', readStringValue(raw, 'messageID', info ? readStringValue(info, 'messageId', readStringValue(info, 'messageID', id)) : id));
  return {
    id: id.length > 0 ? id : sessionId + ':message:' + String(index + 1),
    messageId: messageId.length > 0 ? messageId : id,
    sessionId,
    role: normalizeMessageRole(raw),
    title: readStringValue(raw, 'title', ''),
    text,
    reasoningText,
    agentName: readAgentName(raw),
    createdAt
  };
}

function normalizeSqlitePart(row) {
  const data = parseJsonObjectText(readStringValue(row, 'data', '')) || {};
  const type = readStringValue(data, 'type', '');
  const state = readObjectValue(data, 'state');
  const text = readStringValue(data, 'text', readStringValue(data, 'content', state ? readStringValue(state, 'output', readStringValue(state, 'error', '')) : ''));
  return {
    id: readStringValue(row, 'id', ''),
    messageId: readStringValue(row, 'message_id', readStringValue(row, 'messageID', '')),
    sessionId: readStringValue(row, 'session_id', readStringValue(row, 'sessionID', '')),
    type,
    text,
    data,
    createdAt: normalizeTimestamp(readNumberValue(row, 'time_created', readNumberValue(row, 'createdAt', 0)), Date.now())
  };
}

function normalizeSqliteMessage(row, parts, sessionId, index) {
  const data = parseJsonObjectText(readStringValue(row, 'data', '')) || {};
  const textFragments = [];
  const reasoningFragments = [];
  for (const part of parts) {
    if (part.type === 'reasoning' || part.type === 'thinking') {
      if (part.text.length > 0) {
        reasoningFragments.push(part.text);
      }
    } else if (part.type !== 'tool' && part.type !== 'tool_call' && part.type !== 'step-start' && part.type !== 'step-finish') {
      if (part.text.length > 0) {
        textFragments.push(part.text);
      }
    }
  }
  if (textFragments.length === 0 && reasoningFragments.length === 0) {
    collectMessageFragments(data, textFragments, reasoningFragments, 0);
  }
  const text = textFragments.join('\n').trim();
  const reasoningText = reasoningFragments.join('\n').trim();
  if (text.length === 0 && reasoningText.length === 0) {
    return null;
  }
  const id = readStringValue(row, 'id', sessionId + ':message:' + String(index + 1));
  const time = readObjectValue(data, 'time');
  const createdAt = normalizeTimestamp(
    readNumberValue(row, 'time_created', 0),
    time ? normalizeTimestamp(readNumberValue(time, 'created', 0), Date.now()) : Date.now()
  );
  return {
    id,
    messageId: id,
    sessionId,
    role: normalizeMessageRole(data),
    title: '',
    text,
    reasoningText,
    agentName: readStringValue(row, 'agent_id', readAgentName(data)),
    createdAt
  };
}

function sqliteColumnSelect(columns, columnName, aliasName) {
  const alias = typeof aliasName === 'string' && aliasName.length > 0 ? aliasName : columnName;
  if (columns.has(columnName)) {
    return columnName;
  }
  return "'' as " + alias;
}

function localSessionQueryForColumns(columns) {
  const fields = [
    'id',
    sqliteColumnSelect(columns, 'project_id'),
    sqliteColumnSelect(columns, 'parent_id'),
    sqliteColumnSelect(columns, 'slug'),
    sqliteColumnSelect(columns, 'directory'),
    sqliteColumnSelect(columns, 'title'),
    sqliteColumnSelect(columns, 'version'),
    sqliteColumnSelect(columns, 'time_created'),
    sqliteColumnSelect(columns, 'time_updated'),
    sqliteColumnSelect(columns, 'time_archived'),
    sqliteColumnSelect(columns, 'path'),
    sqliteColumnSelect(columns, 'agent'),
    sqliteColumnSelect(columns, 'model')
  ];
  return 'select ' + fields.join(', ') + ' from session order by time_updated desc limit ?';
}

function normalizeRemoteSession(raw, providerId, displayName) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const remoteSessionId = readStringValue(raw, 'id', readStringValue(raw, 'sessionId', readStringValue(raw, 'sessionID', '')));
  if (remoteSessionId.length === 0) {
    return null;
  }
  const time = readObjectValue(raw, 'time');
  const pathInfo = readObjectValue(raw, 'path');
  const workspacePath = readStringValue(
    raw,
    'workspacePath',
    readStringValue(raw, 'directory', readStringValue(raw, 'cwd', pathInfo ? readStringValue(pathInfo, 'cwd', '') : ''))
  );
  const name = typeof displayName === 'string' && displayName.length > 0 ? displayName : 'OpenCode';
  const title = readStringValue(raw, 'title', readStringValue(raw, 'slug', workspacePath.length > 0 ? name + ': ' + workspacePath : name + ' Session'));
  const now = Date.now();
  const createdAt = time ? normalizeTimestamp(readNumberValue(time, 'created', 0), now) :
    normalizeTimestamp(readNumberValue(raw, 'createdAt', readNumberValue(raw, 'time_created', 0)), now);
  const updatedAt = time ? normalizeTimestamp(readNumberValue(time, 'updated', 0), now) :
    normalizeTimestamp(readNumberValue(raw, 'updatedAt', readNumberValue(raw, 'time_updated', 0)), now);
  return {
    sessionId: providerId + ':' + remoteSessionId,
    remoteSessionId,
    providerId,
    title,
    workspacePath,
    workspaceTitle: readStringValue(raw, 'workspaceTitle', ''),
    branchName: readStringValue(raw, 'branchName', readStringValue(raw, 'branch', 'main')),
    modelId: readStringValue(raw, 'modelId', rowModelId(raw, 'configured')),
    speedMode: readStringValue(raw, 'speedMode', 'auto'),
    reasoningMode: readStringValue(raw, 'reasoningMode', 'auto'),
    messageCount: readNumberValue(raw, 'messageCount', 0),
    status: readStringValue(raw, 'status', 'ready'),
    source: providerId,
    createdAt,
    updatedAt
  };
}

function normalizeMetadataSession(metadataKey, stored, providerId, displayName) {
  if (!stored || typeof stored !== 'object') {
    return null;
  }
  const prefix = providerId + ':';
  let remoteSessionId = readStringValue(stored, 'remoteSessionId', '');
  if (remoteSessionId.length === 0 && typeof metadataKey === 'string' && metadataKey.startsWith(prefix)) {
    remoteSessionId = metadataKey.substring(prefix.length);
  }
  if (remoteSessionId.length === 0) {
    return null;
  }
  const now = Date.now();
  const workspacePath = readStringValue(stored, 'workspacePath', '');
  const name = typeof displayName === 'string' && displayName.length > 0 ? displayName : 'OpenCode';
  const title = readStringValue(stored, 'title', workspacePath.length > 0 ? name + ': ' + workspacePath : name + ' Session');
  return {
    sessionId: providerId + ':' + remoteSessionId,
    remoteSessionId,
    providerId,
    title,
    workspacePath,
    workspaceTitle: readStringValue(stored, 'workspaceTitle', ''),
    branchName: readStringValue(stored, 'branchName', 'main'),
    modelId: readStringValue(stored, 'modelId', 'configured'),
    speedMode: readStringValue(stored, 'speedMode', 'auto'),
    reasoningMode: readStringValue(stored, 'reasoningMode', 'auto'),
    messageCount: readNumberValue(stored, 'messageCount', 0),
    status: readStringValue(stored, 'status', 'ready'),
    source: readStringValue(stored, 'source', providerId + '-cache'),
    createdAt: readNumberValue(stored, 'createdAt', now),
    updatedAt: readNumberValue(stored, 'updatedAt', now)
  };
}

function remoteSessionIdFromLocal(sessionId, providerId) {
  if (typeof sessionId !== 'string') {
    return '';
  }
  const prefix = providerId + ':';
  if (sessionId.startsWith(prefix)) {
    return sessionId.substring(prefix.length);
  }
  return sessionId;
}

function localSessionIdFromRemote(remoteSessionId, providerId) {
  if (typeof remoteSessionId !== 'string' || remoteSessionId.length === 0) {
    return '';
  }
  const prefix = providerId + ':';
  return remoteSessionId.startsWith(prefix) ? remoteSessionId : prefix + remoteSessionId;
}

function normalizePermissionReply(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'once';
  }
  const lower = value.toLowerCase();
  if (lower === 'allow' || lower === 'approve' || lower === 'approved' || lower === 'yes') {
    return 'once';
  }
  if (lower === 'deny' || lower === 'denied' || lower === 'reject' || lower === 'rejected' || lower === 'no') {
    return 'reject';
  }
  if (lower === 'always') {
    return 'always';
  }
  if (lower === 'once') {
    return 'once';
  }
  return 'once';
}

function normalizeQuestionOptions(properties) {
  const candidates = readArrayValue(properties, 'options');
  const result = [];
  for (const item of candidates) {
    if (typeof item === 'string') {
      result.push({
        id: item,
        label: item,
        description: ''
      });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const label = readStringValue(item, 'label', readStringValue(item, 'title', readStringValue(item, 'text', readStringValue(item, 'value', readStringValue(item, 'id', '')))));
    if (label.length === 0) {
      continue;
    }
    result.push({
      id: readStringValue(item, 'id', readStringValue(item, 'value', label)),
      label,
      description: readStringValue(item, 'description', readStringValue(item, 'detail', readStringValue(item, 'hint', '')))
    });
  }
  return result;
}

function normalizedQuestionPayload(providerId, properties) {
  return {
    providerId,
    requestId: readStringValue(properties, 'id', readStringValue(properties, 'requestId', '')),
    kind: readStringValue(properties, 'kind', 'request'),
    title: readStringValue(properties, 'title', readStringValue(properties, 'header', readStringValue(properties, 'name', ''))),
    prompt: readStringValue(properties, 'question', readStringValue(properties, 'prompt', readStringValue(properties, 'message', readStringValue(properties, 'text', '')))),
    options: normalizeQuestionOptions(properties),
    allowFreeText: readBooleanValue(properties, 'allowFreeText', true),
    status: 'pending',
    rawJson: safeJsonText(properties),
    question: properties
  };
}

function normalizedPlanPayload(providerId, properties) {
  return {
    providerId,
    planId: readStringValue(properties, 'id', readStringValue(properties, 'planId', readStringValue(properties, 'requestId', ''))),
    title: readStringValue(properties, 'title', readStringValue(properties, 'name', '')),
    content: readStringValue(properties, 'plan', readStringValue(properties, 'content', readStringValue(properties, 'text', readStringValue(properties, 'markdown', '')))),
    status: readStringValue(properties, 'status', readStringValue(properties, 'state', 'pending')),
    rawJson: safeJsonText(properties)
  };
}

function isPlanEventType(eventType) {
  if (typeof eventType !== 'string') {
    return false;
  }
  const lower = eventType.toLowerCase();
  return lower === 'plan.asked' ||
    lower === 'plan.requested' ||
    lower === 'plan.created' ||
    lower === 'plan.updated' ||
    lower.indexOf('plan') >= 0 && (lower.indexOf('asked') >= 0 || lower.indexOf('request') >= 0 || lower.indexOf('proposal') >= 0);
}

function safeJsonText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    const text = JSON.stringify(value, null, 2);
    return typeof text === 'string' ? text : '';
  } catch (error) {
    return String(value);
  }
}

class OpenCodeProvider {
  constructor(config) {
    this.id = config && typeof config.id === 'string' && config.id.length > 0 ? config.id : 'opencode';
    this.displayName = config && typeof config.displayName === 'string' && config.displayName.length > 0 ? config.displayName : 'OpenCode';
    this.description = config && typeof config.description === 'string' && config.description.length > 0 ? config.description : 'Connects to a local opencode serve endpoint.';
    this.healthName = config && typeof config.healthName === 'string' && config.healthName.length > 0 ? config.healthName : this.displayName;
    this.defaultUsername = config && typeof config.defaultUsername === 'string' && config.defaultUsername.length > 0 ? config.defaultUsername : this.id;
    this.baseUrl = normalizeBaseUrl(config && config.baseUrl);
    this.username = config && typeof config.username === 'string' ? config.username : '';
    this.password = config && typeof config.password === 'string' ? config.password : '';
    this.metadataPath = config && typeof config.metadataPath === 'string' ? config.metadataPath : defaultMetadataPath(this.id);
    this.databasePath = config && typeof config.databasePath === 'string' && config.databasePath.length > 0 ? config.databasePath : defaultDatabasePath(this.id);
    this.requestTimeoutMs = config && typeof config.requestTimeoutMs === 'number' ? config.requestTimeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    this.lightCapabilities = !config || config.lightCapabilities !== false;
    this.metadata = readMetadataFile(this.metadataPath);
    this.sessions = new Map();
    this.eventSubscriptions = new Map();
    this.partTextOffsets = new Map();
    this.messageRoles = new Map();
    this.messageAgents = new Map();
  }

  async describe() {
    const health = await this.checkHealth();
    const models = this.lightCapabilities ? buildOpenCodeModels(this.id) : await this.resolveModels();
    const tools = this.lightCapabilities ? buildTools(this.id, this.displayName) : await this.resolveToolOptions(models);
    return {
      id: this.id,
      displayName: this.displayName,
      status: health.available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.baseUrl,
      capabilities: {
        streaming: true,
        tools: true,
        previews: true,
        permissions: true,
        authConfigured: this.password.length > 0,
        history: true,
        modelSelection: true,
        speedProfiles: false,
        workspaceAware: true,
        nativeProxy: true,
        events: true,
        requests: true,
        plans: true,
        questions: true,
        files: true,
        search: true,
        shell: true,
        commands: true,
        worktrees: true,
        mcp: true,
        health: health.detail
      },
      models,
      speedModes: buildSpeedModes(this.displayName),
      reasoningModes: buildReasoningModes(this.displayName),
      interactionModes: buildInteractionModes(),
      tools,
      sessionFeatures: {
        list: true,
        import: true,
        resume: true,
        messages: true,
        update: true,
        delete: true,
        abort: true,
        fork: true,
        share: true,
        revert: true,
        todo: true,
        diff: true,
        command: true,
        shell: true
      }
    };
  }

  async checkHealth() {
    try {
      const response = await this.requestJson('GET', '/global/health', null);
      const version = readStringValue(response.body, 'version', '');
      return {
        available: true,
        detail: version.length > 0 ? this.healthName + ' ' + version : this.healthName + ' server is healthy'
      };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async resolveModels() {
    try {
      const response = await this.requestJson('GET', '/config/providers', null);
      const models = modelsFromProviderResponse(response.body, this.id);
      if (models.length > 1) {
        return models;
      }
    } catch (error) {
      // Fall back to the generic provider endpoint, then to the configured default model.
    }
    try {
      const response = await this.requestJson('GET', '/provider', null);
      const models = modelsFromProviderResponse(response.body, this.id);
      if (models.length > 1) {
        return models;
      }
    } catch (error) {
      // Keep capabilities available even when OpenCode is not running.
    }
    return buildOpenCodeModels(this.id);
  }

  async resolveToolOptions(models) {
    try {
      const model = this.firstConcreteModel(models);
      if (model) {
        const parsed = parseModelSelection(model.id);
        if (parsed) {
          const response = await this.requestJson(
            'GET',
            '/experimental/tool/ids?provider=' + encodeURIComponent(parsed.providerID) + '&model=' + encodeURIComponent(parsed.modelID),
            null
          );
          const ids = Array.isArray(response.body) ? response.body : readArrayFromResponse(response.body);
          const tools = [];
          for (const id of ids) {
            if (typeof id !== 'string' || id.length === 0) {
              continue;
            }
            tools.push({
              id,
              displayName: id,
              description: this.displayName + ' tool exposed by the active provider/model.',
              risk: 'provider'
            });
          }
          if (tools.length > 0) {
            return tools;
          }
        }
      }
    } catch (error) {
      // Keep static capabilities available when tool discovery is unavailable.
    }
    return buildTools(this.id, this.displayName);
  }

  firstConcreteModel(models) {
    if (!Array.isArray(models)) {
      return null;
    }
    for (const model of models) {
      if (model && typeof model.id === 'string' && model.id.indexOf('/') > 0) {
        return model;
      }
    }
    return null;
  }

  async createSession(payload) {
    const requestedWorkspacePath = readStringValue(payload, 'workspacePath', '');
    const workspacePath = requestedWorkspacePath.length > 0 ? requestedWorkspacePath : process.cwd();
    const requestedWorkspaceTitle = readStringValue(payload, 'workspaceTitle', '');
    const workspaceTitle = requestedWorkspaceTitle.length > 0 ? requestedWorkspaceTitle : path.basename(workspacePath);
    const modelId = readStringValue(payload, 'modelId', 'configured');
    const speedMode = readStringValue(payload, 'speedMode', 'auto');
    const reasoningMode = readStringValue(payload, 'reasoningMode', 'auto');
    const title = workspaceTitle.length > 0 ? workspaceTitle : (workspacePath.length > 0 ? this.displayName + ': ' + workspacePath : this.displayName + ' Session');
    const sessionPath = workspacePath.length > 0 ? '/session?directory=' + encodeURIComponent(workspacePath) : '/session';
    const response = await this.requestJson('POST', sessionPath, { title });
    const remoteSessionId = createSessionIdFromResponse(response.body);
    if (remoteSessionId.length === 0) {
      throw new Error(this.displayName + ' did not return a session id');
    }
    const responseWorkspacePath = readStringValue(response.body, 'directory', readStringValue(response.body, 'workspacePath', workspacePath));
    const responseWorkspaceTitle = readStringValue(response.body, 'workspaceTitle', workspaceTitle);
    const responseTitle = readStringValue(response.body, 'title', title);
    const now = Date.now();
    const session = {
      sessionId: this.id + ':' + remoteSessionId,
      remoteSessionId,
      providerId: this.id,
      title: responseTitle,
      workspacePath: responseWorkspacePath,
      workspaceTitle: responseWorkspaceTitle,
      branchName: 'main',
      modelId,
      speedMode,
      reasoningMode,
      messageCount: 0,
      status: 'ready',
      source: this.id,
      createdAt: readNumberValue(response.body, 'createdAt', now),
      updatedAt: now
    };
    this.sessions.set(session.sessionId, session);
    this.saveSessionMetadata(session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  buildSessionListPaths() {
    return [
      '/api/session?limit=1000',
      '/api/session?limit=500',
      '/api/session?limit=200',
      '/api/session',
      '/session?limit=1000',
      '/session?limit=500',
      '/session?limit=200',
      '/session'
    ];
  }

  openLocalDatabase() {
    if (typeof this.databasePath !== 'string' || this.databasePath.length === 0 || !fs.existsSync(this.databasePath)) {
      return null;
    }
    const DatabaseSync = loadDatabaseSync();
    if (!DatabaseSync) {
      return null;
    }
    try {
      return new DatabaseSync(this.databasePath, { readOnly: true });
    } catch (error) {
      return null;
    }
  }

  mergeMetadataSessions(merged) {
    const keys = Object.keys(this.metadata);
    for (const key of keys) {
      const session = normalizeMetadataSession(key, this.metadata[key], this.id, this.displayName);
      if (session) {
        merged.set(session.sessionId, session);
        if (!this.sessions.has(session.sessionId)) {
          this.sessions.set(session.sessionId, session);
        }
      }
    }
  }

  collectLocalDatabaseSessions(merged) {
    const db = this.openLocalDatabase();
    if (!db) {
      return;
    }
    try {
      const columns = readSqliteColumnNames(db, 'session');
      if (!columns.has('id') || !columns.has('time_updated')) {
        return;
      }
      const rows = db.prepare(localSessionQueryForColumns(columns)).all(MAX_LOCAL_DB_SESSIONS);
      for (const row of rows) {
        const session = normalizeRemoteSession(row, this.id, this.displayName);
        if (!session) {
          continue;
        }
        session.source = this.id + '-db';
        session.messageCount = this.countLocalDatabaseMessages(db, session.remoteSessionId);
        const existing = merged.get(session.sessionId);
        if (!existing || session.updatedAt >= existing.updatedAt) {
          const mergedSession = this.mergeSessionMetadata(session);
          merged.set(mergedSession.sessionId, mergedSession);
          this.sessions.set(mergedSession.sessionId, mergedSession);
          this.saveSessionMetadata(mergedSession);
        }
      }
    } catch (error) {
      // SQLite fallback is best-effort; HTTP sessions and metadata remain available.
    } finally {
      try {
        db.close();
      } catch (error) {
        // Ignore close failures.
      }
    }
  }

  countLocalDatabaseMessages(db, remoteSessionId) {
    try {
      const row = db.prepare('select count(*) as count from message where session_id = ?').get(remoteSessionId);
      return readNumberValue(row, 'count', readNumberValue(row, 'COUNT(*)', 0));
    } catch (error) {
      return 0;
    }
  }

  async collectRemoteSessions(requestPath, merged) {
    const response = await this.requestJson('GET', requestPath, null);
    const remoteItems = readArrayFromResponse(response.body);
    for (const raw of remoteItems) {
      const normalized = normalizeRemoteSession(raw, this.id, this.displayName);
      const session = normalized ? this.mergeSessionMetadata(normalized) : null;
      if (session) {
        const existing = merged.get(session.sessionId);
        if (!existing || session.updatedAt >= existing.updatedAt) {
          merged.set(session.sessionId, session);
        }
        this.sessions.set(session.sessionId, session);
        this.saveSessionMetadata(session);
      }
    }
  }

  async listSessions() {
    const merged = new Map();
    this.mergeMetadataSessions(merged);
    for (const session of this.sessions.values()) {
      merged.set(session.sessionId, session);
    }

    const paths = this.buildSessionListPaths();
    for (const requestPath of paths) {
      try {
        await this.collectRemoteSessions(requestPath, merged);
      } catch (error) {
        // Keep cached sessions available when a specific compatible history endpoint is unavailable.
      }
    }
    this.collectLocalDatabaseSessions(merged);
    const sessions = Array.from(merged.values());
    sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    return sessions;
  }

  async listMessages(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    const attempts = [
      '/session/' + encodeURIComponent(session.remoteSessionId) + '/message',
      '/api/session/' + encodeURIComponent(session.remoteSessionId) + '/message'
    ];
    for (const requestPath of attempts) {
      try {
        const response = await this.requestJson('GET', requestPath, null);
        const remoteItems = readArrayFromResponse(response.body);
        const messages = [];
        for (let index = 0; index < remoteItems.length; index += 1) {
          const message = normalizeRemoteMessage(remoteItems[index], sessionId, index);
          if (message) {
            messages.push(message);
          }
        }
        if (messages.length > 0) {
          return messages;
        }
      } catch (error) {
        // Fall through to the next compatible path or the local database.
      }
    }
    return this.listLocalDatabaseMessages(session);
  }

  listLocalDatabaseMessages(session) {
    const db = this.openLocalDatabase();
    if (!db) {
      return [];
    }
    try {
      const messageColumns = readSqliteColumnNames(db, 'message');
      const agentColumn = messageColumns.has('agent_id') ? 'agent_id' : "'' as agent_id";
      const messageRows = db.prepare(
        'select id, session_id, ' + agentColumn + ', time_created, time_updated, data from message where session_id = ? order by time_created asc limit ?'
      ).all(session.remoteSessionId, MAX_LOCAL_DB_MESSAGES);
      if (messageRows.length === 0) {
        return [];
      }
      const partRows = db.prepare(
        'select id, message_id, session_id, time_created, time_updated, data from part where session_id = ? order by time_created asc limit ?'
      ).all(session.remoteSessionId, MAX_LOCAL_DB_PARTS);
      const partsByMessage = new Map();
      for (const row of partRows) {
        const part = normalizeSqlitePart(row);
        if (part.messageId.length === 0) {
          continue;
        }
        const list = partsByMessage.get(part.messageId) || [];
        list.push(part);
        partsByMessage.set(part.messageId, list);
      }
      const messages = [];
      for (let index = 0; index < messageRows.length; index += 1) {
        const row = messageRows[index];
        const messageId = readStringValue(row, 'id', '');
        const parts = partsByMessage.get(messageId) || [];
        const message = normalizeSqliteMessage(row, parts, session.sessionId, index);
        if (message) {
          messages.push(message);
        }
      }
      return messages;
    } catch (error) {
      return [];
    } finally {
      try {
        db.close();
      } catch (error) {
        // Ignore close failures.
      }
    }
  }

  async revertSession(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const messageId = readStringValue(payload, 'messageId', readStringValue(payload, 'messageID', ''));
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (messageId.length === 0) {
      throw new Error('Message id is required for session revert.');
    }
    const remoteSessionId = session.remoteSessionId;
    const encodedSessionId = encodeURIComponent(remoteSessionId);
    const body = {
      messageID: messageId,
      messageId
    };
    const attempts = [
      '/session/' + encodedSessionId + '/revert',
      '/session/' + encodedSessionId + '/message/' + encodeURIComponent(messageId) + '/revert'
    ];
    let lastError = null;
    for (const requestPath of attempts) {
      try {
        const response = await this.requestJson('POST', requestPath, body);
        session.updatedAt = Date.now();
        session.status = 'ready';
        if (typeof emit === 'function') {
          emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
          const messages = await this.listMessages(sessionId);
          emit(makeEvent(EventType.SESSION_MESSAGES, sessionId, { sessionId, messages }));
        }
        return {
          session,
          messageId,
          result: response.body
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('Session revert failed: ' + (lastError instanceof Error ? lastError.message : String(lastError)));
  }

  async sendMessage(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const text = readStringValue(payload, 'text', '');
    const modelId = readStringValue(payload, 'modelId', '');
    const speedMode = readStringValue(payload, 'speedMode', '');
    const reasoningMode = readStringValue(payload, 'reasoningMode', '');
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (modelId.length > 0) {
      session.modelId = modelId;
    }
    if (speedMode.length > 0) {
      session.speedMode = speedMode;
    }
    if (reasoningMode.length > 0) {
      session.reasoningMode = reasoningMode;
    }

    session.status = 'running';
    session.updatedAt = Date.now();
    session.messageCount = session.messageCount + 1;
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));

    emit(makeEvent(EventType.TOOL_STARTED, sessionId, {
      toolCallId: this.id + '_message',
      name: this.id + '.message',
      input: {
        remoteSessionId: session.remoteSessionId,
        modelId: session.modelId,
        speedMode: session.speedMode,
        reasoningMode: session.reasoningMode
      }
    }));

    const promptBody = buildPromptBody(payload, session);
    if (this.hasActiveEventSubscriptions()) {
      await this.requestRaw(
        'POST',
        '/session/' + encodeURIComponent(session.remoteSessionId) + '/prompt_async',
        null,
        promptBody,
        'application/json'
      );
      this.saveSessionMetadata(session);
      return;
    }

    const response = await this.requestJson(
      'POST',
      '/session/' + encodeURIComponent(session.remoteSessionId) + '/message',
      promptBody
    );
    const textFragments = [];
    const reasoningFragments = [];
    collectMessageFragments(response.body, textFragments, reasoningFragments, 0);

    for (const fragment of reasoningFragments) {
      emit(makeEvent(EventType.MESSAGE_DELTA, sessionId, {
        role: 'assistant',
        text: fragment,
        reasoningText: fragment,
        contentKind: 'reasoning'
      }));
    }

    if (textFragments.length === 0 && reasoningFragments.length === 0) {
      emit(makeEvent(EventType.MESSAGE_DELTA, sessionId, {
        role: 'assistant',
        text: JSON.stringify(response.body),
        contentKind: 'text'
      }));
    } else {
      for (const fragment of textFragments) {
        emit(makeEvent(EventType.MESSAGE_DELTA, sessionId, {
          role: 'assistant',
          text: fragment,
          contentKind: 'text'
        }));
      }
    }

    emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
      toolCallId: this.id + '_message',
      statusCode: response.statusCode
    }));

    session.status = 'ready';
    session.updatedAt = Date.now();
    this.saveSessionMetadata(session);
    emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
      role: 'assistant',
      text: textFragments.join('\n').trim(),
      reasoningText: reasoningFragments.join('\n').trim(),
      contentKind: 'text'
    }));
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
  }

  async getPreview(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const path = readStringValue(payload, 'path', '');
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }

    if (path === 'diff' || path === '__diff__') {
      const diffResponse = await this.requestJson('GET', '/session/' + encodeURIComponent(session.remoteSessionId) + '/diff', null);
      return {
        sessionId,
        path,
        mediaType: 'application/json',
        content: JSON.stringify(diffResponse.body, null, 2)
      };
    }

    const targetPath = path.length > 0 ? path : 'README.md';
    const contentResponse = await this.requestText('GET', '/file/content?path=' + encodeURIComponent(targetPath), null);
    return {
      sessionId,
      path: targetPath,
      mediaType: 'text/plain',
      content: contentResponse.body
    };
  }

  hasActiveEventSubscriptions() {
    return this.eventSubscriptions.size > 0;
  }

  subscribeEvents(subscriberId, emit) {
    if (typeof subscriberId !== 'string' || subscriberId.length === 0 || typeof emit !== 'function') {
      return () => {};
    }
    if (this.eventSubscriptions.has(subscriberId)) {
      return this.eventSubscriptions.get(subscriberId).close;
    }

    const subscription = {
      closed: false,
      req: null,
      reconnectTimer: null,
      close: () => {}
    };
    this.eventSubscriptions.set(subscriberId, subscription);

    const scheduleReconnect = () => {
      if (subscription.closed || subscription.reconnectTimer) {
        return;
      }
      subscription.reconnectTimer = setTimeout(() => {
        subscription.reconnectTimer = null;
        startStream();
      }, 1500);
    };

    const startStream = () => {
      if (subscription.closed) {
        return;
      }
      subscription.req = this.openEventStream('/event', (event) => {
        this.emitMappedOpenCodeEvent(event, emit);
      }, (error) => {
        if (!subscription.closed) {
          emit(makeEvent(EventType.ERROR, '', {
            code: this.id + '_event_stream_failed',
            message: error instanceof Error ? error.message : String(error)
          }));
          scheduleReconnect();
        }
      }, () => {
        scheduleReconnect();
      });
    };

    this.checkHealth()
      .then((health) => {
        if (health.available) {
          startStream();
        }
      })
      .catch(() => {
        // Capabilities already expose provider health. Do not spam websocket clients for inactive compatible providers.
      });

    subscription.close = () => {
      subscription.closed = true;
      this.eventSubscriptions.delete(subscriberId);
      if (subscription.reconnectTimer) {
        clearTimeout(subscription.reconnectTimer);
        subscription.reconnectTimer = null;
      }
      if (subscription.req) {
        subscription.req.destroy();
        subscription.req = null;
      }
    };
    return subscription.close;
  }

  openEventStream(pathname, onEvent, onError, onEnd) {
    const url = new URL(pathname, this.baseUrl);
    const headers = {
      Accept: 'text/event-stream'
    };
    if (this.password.length > 0 || this.username.length > 0) {
      const username = this.username.length > 0 ? this.username : this.defaultUsername;
      const token = Buffer.from(username + ':' + this.password).toString('base64');
      headers.Authorization = 'Basic ' + token;
    }
    const client = url.protocol === 'https:' ? https : http;
    let buffer = '';
    const req = client.request(url, { method: 'GET', headers }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer = buffer + chunk;
        buffer = buffer.replace(/\r\n/g, '\n');
        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex >= 0) {
          const rawBlock = buffer.substring(0, separatorIndex);
          buffer = buffer.substring(separatorIndex + 2);
          this.handleSseBlock(rawBlock, onEvent);
          separatorIndex = buffer.indexOf('\n\n');
        }
      });
      res.on('error', onError);
      res.on('end', () => {
        if (typeof onEnd === 'function') {
          onEnd();
        }
      });
    });
    req.on('error', onError);
    req.end();
    return req;
  }

  handleSseBlock(rawBlock, onEvent) {
    const lines = rawBlock.split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.substring(5).trimStart());
      }
    }
    if (dataLines.length === 0) {
      return;
    }
    const text = dataLines.join('\n');
    if (text.length === 0 || text === '[DONE]') {
      return;
    }
    try {
      onEvent(JSON.parse(text));
    } catch (error) {
      onEvent({
        type: 'raw',
        properties: {
          text
        }
      });
    }
  }

  emitMappedOpenCodeEvent(rawEvent, emit) {
    const event = rawEvent && rawEvent.payload && typeof rawEvent.payload === 'object' ? rawEvent.payload : rawEvent;
    if (!event || typeof event !== 'object') {
      return;
    }
    const eventType = readStringValue(event, 'type', 'raw');
    const properties = event.properties && typeof event.properties === 'object' ? event.properties : {};
    const remoteSessionId = this.remoteSessionIdFromEvent(eventType, properties);
    const sessionId = localSessionIdFromRemote(remoteSessionId, this.id);

    emit(makeEvent(EventType.OPENCODE_EVENT, sessionId, {
      opencodeEvent: event,
      providerId: this.id,
      directory: rawEvent && typeof rawEvent.directory === 'string' ? rawEvent.directory : ''
    }));

    if (eventType === 'session.created' || eventType === 'session.updated') {
      const info = readObjectValue(properties, 'info');
      const session = normalizeRemoteSession(info, this.id);
      if (session) {
        const merged = this.mergeSessionMetadata(session);
        this.sessions.set(merged.sessionId, merged);
        emit(makeEvent(eventType === 'session.created' ? EventType.SESSION_CREATED : EventType.SESSION_UPDATED, merged.sessionId, { session: merged }));
      }
      return;
    }

    if (eventType === 'session.status') {
      this.emitSessionStatus(properties, emit);
      return;
    }

    if (eventType === 'session.idle') {
      const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
      const session = this.sessions.get(localId);
      if (session) {
        session.status = 'ready';
        session.updatedAt = Date.now();
        this.saveSessionMetadata(session);
        emit(makeEvent(EventType.MESSAGE_COMPLETED, localId, { role: 'assistant', contentKind: 'text' }));
        emit(makeEvent(EventType.SESSION_UPDATED, localId, { session }));
      }
      return;
    }

    if (eventType === 'session.error') {
      emit(makeEvent(EventType.ERROR, sessionId, {
        code: this.id + '_session_error',
        error: properties.error || properties
      }));
      return;
    }

    if (eventType === 'session.diff') {
      emit(makeEvent(EventType.PREVIEW_UPDATED, sessionId, {
        preview: {
          sessionId,
          path: 'diff',
          mediaType: 'application/json',
          content: safeJsonText(properties.diff || [])
        }
      }));
      return;
    }

    if (eventType === 'message.part.updated') {
      const part = readObjectValue(properties, 'part');
      const delta = readStringValue(properties, 'delta', '');
      this.emitPartUpdate(part, delta, emit);
      return;
    }

    if (eventType === 'message.updated') {
      const info = readObjectValue(properties, 'info');
      if (info) {
        this.emitMessageUpdate(info, emit);
      }
      return;
    }

    if (eventType === 'permission.asked') {
      const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
      emit(makeEvent(EventType.PERMISSION_REQUESTED, localId, {
        permission: properties,
        requestId: readStringValue(properties, 'id', ''),
        permissionId: readStringValue(properties, 'id', ''),
        agent: readAgentName(properties)
      }));
      return;
    }

    if (eventType === 'question.asked') {
      const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
      const payload = normalizedQuestionPayload(this.id, properties);
      payload.agent = readAgentName(properties);
      emit(makeEvent(EventType.QUESTION_REQUESTED, localId, payload));
      return;
    }

    if (isPlanEventType(eventType)) {
      const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
      const payload = normalizedPlanPayload(this.id, properties);
      payload.agent = readAgentName(properties);
      if (payload.content.length > 0 || payload.rawJson.length > 0) {
        emit(makeEvent(EventType.PLAN_REQUESTED, localId, payload));
      }
      return;
    }

    if (eventType === 'todo.updated') {
      const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
      emit(makeEvent(EventType.TODO_UPDATED, localId, {
        todos: readArrayValue(properties, 'todos')
      }));
    }
  }

  remoteSessionIdFromEvent(eventType, properties) {
    const direct = readStringValue(properties, 'sessionID', '');
    if (direct.length > 0) {
      return direct;
    }
    const info = readObjectValue(properties, 'info');
    if (info) {
      const infoSessionId = readStringValue(info, 'sessionID', readStringValue(info, 'id', ''));
      if (infoSessionId.length > 0) {
        return infoSessionId;
      }
    }
    const part = readObjectValue(properties, 'part');
    if (part) {
      const partSessionId = readStringValue(part, 'sessionID', '');
      if (partSessionId.length > 0) {
        return partSessionId;
      }
    }
    return '';
  }

  emitSessionStatus(properties, emit) {
    const localId = localSessionIdFromRemote(readStringValue(properties, 'sessionID', ''), this.id);
    if (localId.length === 0) {
      return;
    }
    const status = readObjectValue(properties, 'status');
    const session = this.sessions.get(localId);
    if (session) {
      const statusType = status ? readStringValue(status, 'type', '') : '';
      session.status = statusType === 'busy' || statusType === 'retry' ? 'running' : 'ready';
      session.updatedAt = Date.now();
      emit(makeEvent(EventType.SESSION_UPDATED, localId, { session, status }));
    } else {
      emit(makeEvent(EventType.SESSION_UPDATED, localId, { status }));
    }
  }

  emitMessageUpdate(info, emit) {
    const localId = localSessionIdFromRemote(readStringValue(info, 'sessionID', ''), this.id);
    if (localId.length === 0) {
      return;
    }
    const role = readStringValue(info, 'role', '');
    const messageId = readStringValue(info, 'id', readStringValue(info, 'messageID', ''));
    if (messageId.length > 0 && role.length > 0) {
      this.messageRoles.set(this.messageRoleKey(localId, messageId), role.toLowerCase());
    }
    const agentName = readAgentName(info);
    if (messageId.length > 0 && agentName.length > 0) {
      this.messageAgents.set(this.messageRoleKey(localId, messageId), agentName);
    }
    const time = readObjectValue(info, 'time');
    if (role === 'assistant' && time && readNumberValue(time, 'completed', 0) > 0) {
      emit(makeEvent(EventType.MESSAGE_COMPLETED, localId, {
        role: 'assistant',
        messageId,
        agent: agentName,
        contentKind: 'text',
        message: info
      }));
    }
  }

  resolvePartAgent(localId, part) {
    const directAgent = readAgentName(part);
    if (directAgent.length > 0) {
      return directAgent;
    }
    const messageId = readStringValue(part, 'messageID', readStringValue(part, 'messageId', ''));
    if (messageId.length === 0) {
      return '';
    }
    const stored = this.messageAgents.get(this.messageRoleKey(localId, messageId));
    if (typeof stored === 'string' && stored.length > 0) {
      return stored;
    }
    return '';
  }

  messageRoleKey(sessionId, messageId) {
    return sessionId + ':' + messageId;
  }

  resolvePartRole(localId, part) {
    const directRole = readStringValue(part, 'role', '');
    if (directRole.length > 0) {
      return directRole.toLowerCase();
    }
    const messageId = readStringValue(part, 'messageID', readStringValue(part, 'messageId', ''));
    if (messageId.length === 0) {
      return 'assistant';
    }
    const stored = this.messageRoles.get(this.messageRoleKey(localId, messageId));
    if (typeof stored === 'string' && stored.length > 0) {
      return stored;
    }
    return 'assistant';
  }

  emitPartUpdate(part, delta, emit) {
    if (!part || typeof part !== 'object') {
      return;
    }
    const localId = localSessionIdFromRemote(readStringValue(part, 'sessionID', ''), this.id);
    const partType = readStringValue(part, 'type', '');
    if (localId.length === 0) {
      return;
    }
    if (partType === 'text' || partType === 'reasoning') {
      let text = delta;
      if (text.length === 0) {
        text = this.deltaFromPartText(part);
      }
      if (text.length > 0) {
        const role = this.resolvePartRole(localId, part);
        const messageId = readStringValue(part, 'messageID', readStringValue(part, 'messageId', ''));
        const partId = readStringValue(part, 'id', '');
        const agent = this.resolvePartAgent(localId, part);
        emit(makeEvent(EventType.MESSAGE_DELTA, localId, {
          role,
          text,
          messageId,
          partId,
          agent,
          contentKind: partType,
          part
        }));
      }
      return;
    }
    if (partType === 'tool') {
      this.emitToolPart(localId, part, emit);
    }
  }

  deltaFromPartText(part) {
    const text = readStringValue(part, 'text', '');
    if (text.length === 0) {
      return '';
    }
    const partId = readStringValue(part, 'id', '');
    if (partId.length === 0) {
      return text;
    }
    const previousLength = this.partTextOffsets.get(partId) || 0;
    this.partTextOffsets.set(partId, text.length);
    if (text.length <= previousLength) {
      return '';
    }
    return text.substring(previousLength);
  }

  emitToolPart(localId, part, emit) {
    const state = readObjectValue(part, 'state');
    const status = state ? readStringValue(state, 'status', '') : '';
    const toolCallId = readStringValue(part, 'callID', readStringValue(part, 'id', this.id + '_tool'));
    const toolName = readStringValue(part, 'tool', this.id + '.tool');
    const inputText = state ? safeJsonText(state.input || {}) : '';
    const rawJson = safeJsonText(part);
    const agent = this.resolvePartAgent(localId, part);
    if (status === 'pending' || status === 'running') {
      emit(makeEvent(EventType.TOOL_STARTED, localId, {
        toolCallId,
        name: toolName,
        status: 'running',
        agent,
        input: state ? state.input || {} : {},
        inputText,
        rawJson,
        part
      }));
      return;
    }
    if (status === 'completed') {
      const output = state ? readStringValue(state, 'output', '') : '';
      if (output.length > 0) {
        emit(makeEvent(EventType.TOOL_OUTPUT, localId, {
          toolCallId,
          name: toolName,
          text: output,
          outputText: output,
          agent,
          rawJson,
          part
        }));
      }
      emit(makeEvent(EventType.TOOL_COMPLETED, localId, {
        toolCallId,
        name: toolName,
        status: 'completed',
        agent,
        inputText,
        outputText: output,
        rawJson,
        part
      }));
      return;
    }
    if (status === 'error') {
      const errorText = state ? readStringValue(state, 'error', '') : '';
      emit(makeEvent(EventType.TOOL_OUTPUT, localId, {
        toolCallId,
        name: toolName,
        text: errorText,
        errorText,
        agent,
        rawJson,
        part
      }));
      emit(makeEvent(EventType.TOOL_COMPLETED, localId, {
        toolCallId,
        name: toolName,
        status: 'error',
        agent,
        inputText,
        errorText,
        rawJson,
        part
      }));
    }
  }

  async respondPermission(payload) {
    const requestId = readStringValue(payload, 'requestId', readStringValue(payload, 'requestID', ''));
    const permissionId = readStringValue(payload, 'permissionId', readStringValue(payload, 'permissionID', ''));
    const sessionId = readStringValue(payload, 'sessionId', readStringValue(payload, 'sessionID', ''));
    const reply = normalizePermissionReply(readStringValue(payload, 'reply', readStringValue(payload, 'response', 'once')));
    const message = readStringValue(payload, 'message', '');
    if (requestId.length > 0) {
      const body = { reply };
      if (message.length > 0) {
        body.message = message;
      }
      const response = await this.requestJson('POST', '/permission/' + encodeURIComponent(requestId) + '/reply', body);
      return response.body;
    }
    if (sessionId.length > 0 && permissionId.length > 0) {
      const remoteSessionId = remoteSessionIdFromLocal(sessionId, this.id);
      const body = { response: reply };
      if (message.length > 0) {
        body.message = message;
      }
      const response = await this.requestJson(
        'POST',
        '/session/' + encodeURIComponent(remoteSessionId) + '/permissions/' + encodeURIComponent(permissionId),
        body
      );
      return response.body;
    }
    throw new Error('permission requestId or sessionId+permissionId is required');
  }

  async respondRequest(payload) {
    const requestId = readStringValue(payload, 'requestId', readStringValue(payload, 'requestID', ''));
    const sessionId = readStringValue(payload, 'sessionId', readStringValue(payload, 'sessionID', ''));
    const optionId = readStringValue(payload, 'optionId', readStringValue(payload, 'choice', ''));
    const answer = readStringValue(payload, 'answer', readStringValue(payload, 'message', ''));
    const body = {
      optionId,
      answer,
      response: answer.length > 0 ? answer : optionId
    };
    const attempts = [];
    if (requestId.length > 0) {
      attempts.push('/question/' + encodeURIComponent(requestId) + '/reply');
      attempts.push('/request/' + encodeURIComponent(requestId) + '/reply');
    }
    if (sessionId.length > 0 && requestId.length > 0) {
      const remoteSessionId = remoteSessionIdFromLocal(sessionId, this.id);
      attempts.push('/session/' + encodeURIComponent(remoteSessionId) + '/question/' + encodeURIComponent(requestId) + '/reply');
      attempts.push('/session/' + encodeURIComponent(remoteSessionId) + '/request/' + encodeURIComponent(requestId) + '/reply');
    }
    return await this.firstSuccessfulPost(attempts, body, 'request response failed');
  }

  async respondPlan(payload) {
    const planId = readStringValue(payload, 'planId', readStringValue(payload, 'requestId', ''));
    const sessionId = readStringValue(payload, 'sessionId', readStringValue(payload, 'sessionID', ''));
    const reply = readStringValue(payload, 'reply', readStringValue(payload, 'action', 'implement'));
    const message = readStringValue(payload, 'message', '');
    const body = {
      reply,
      action: reply,
      message
    };
    const attempts = [];
    if (planId.length > 0) {
      attempts.push('/plan/' + encodeURIComponent(planId) + '/reply');
      attempts.push('/plan/' + encodeURIComponent(planId));
    }
    if (sessionId.length > 0 && planId.length > 0) {
      const remoteSessionId = remoteSessionIdFromLocal(sessionId, this.id);
      attempts.push('/session/' + encodeURIComponent(remoteSessionId) + '/plan/' + encodeURIComponent(planId) + '/reply');
      attempts.push('/session/' + encodeURIComponent(remoteSessionId) + '/plan/' + encodeURIComponent(planId));
    }
    return await this.firstSuccessfulPost(attempts, body, 'plan response failed');
  }

  async firstSuccessfulPost(paths, body, failureMessage) {
    let lastError = null;
    for (const requestPath of paths) {
      try {
        const response = await this.requestJson('POST', requestPath, body);
        return response.body;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(failureMessage + (lastError ? ': ' + (lastError instanceof Error ? lastError.message : String(lastError)) : ''));
  }

  async proxyOpenCodeRequest(payload) {
    const method = readStringValue(payload, 'method', 'GET').toUpperCase();
    const pathname = readStringValue(payload, 'path', '/');
    const query = readObjectValue(payload, 'query');
    const body = Object.prototype.hasOwnProperty.call(payload, 'body') ? payload.body : null;
    const accept = readStringValue(payload, 'accept', 'application/json');
    return this.requestRaw(method, pathname, query, body, accept);
  }

  async requestJson(method, path, body) {
    const response = await this.requestRaw(method, path, null, body, 'application/json');
    if (typeof response.body !== 'string') {
      return response;
    }
    if (response.body.length === 0) {
      return {
        statusCode: response.statusCode,
        body: {}
      };
    }
    try {
      return {
        statusCode: response.statusCode,
        body: JSON.parse(response.body)
      };
    } catch (error) {
      throw new Error(this.displayName + ' returned invalid JSON: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async requestText(method, path, body) {
    return this.request(method, path, null, body, 'text/plain');
  }

  async requestRaw(method, path, query, body, accept) {
    const response = await this.request(method, path, query, body, accept);
    const contentType = response.headers['content-type'] || '';
    if (contentType.indexOf('application/json') >= 0 && response.body.length > 0) {
      try {
        return {
          statusCode: response.statusCode,
          headers: response.headers,
          body: JSON.parse(response.body),
          text: response.body
        };
      } catch (error) {
        return {
          statusCode: response.statusCode,
          headers: response.headers,
          body: response.body,
          text: response.body
        };
      }
    }
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      text: response.body
    };
  }

  request(method, path, query, body, accept) {
    return new Promise((resolve, reject) => {
      if (typeof path !== 'string' || path.length === 0 || !path.startsWith('/')) {
        reject(new Error(this.displayName + ' request path must start with /'));
        return;
      }
      const url = new URL(path, this.baseUrl);
      if (query && typeof query === 'object') {
        for (const key of Object.keys(query)) {
          const value = query[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              url.searchParams.append(key, String(item));
            }
          } else if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        }
      }
      const bodyText = body === null || body === undefined ? '' : JSON.stringify(body);
      const headers = {
        Accept: accept,
        'Content-Length': Buffer.byteLength(bodyText)
      };
      if (bodyText.length > 0) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
      }
      if (this.password.length > 0 || this.username.length > 0) {
        const username = this.username.length > 0 ? this.username : this.defaultUsername;
        const token = Buffer.from(username + ':' + this.password).toString('base64');
        headers.Authorization = 'Basic ' + token;
      }

      const options = {
        method,
        headers
      };
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(url, options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(this.displayName + ' request failed: status=' + String(statusCode) + ', body=' + responseBody));
            return;
          }
          resolve({
            statusCode,
            headers: res.headers,
            body: responseBody
          });
        });
      });
      req.setTimeout(this.requestTimeoutMs, () => {
        req.destroy(new Error(this.displayName + ' request timed out after ' + String(this.requestTimeoutMs) + 'ms'));
      });
      req.on('error', (error) => {
        reject(error);
      });
      if (bodyText.length > 0) {
        req.write(bodyText);
      }
      req.end();
    });
  }

  metadataKey(remoteSessionId) {
    return this.id + ':' + remoteSessionId;
  }

  mergeSessionMetadata(session) {
    const stored = this.metadata[this.metadataKey(session.remoteSessionId)];
    if (!stored || typeof stored !== 'object') {
      return session;
    }
    return {
      sessionId: session.sessionId,
      remoteSessionId: session.remoteSessionId,
      providerId: session.providerId,
      title: session.title.length > 0 ? session.title : readStringValue(stored, 'title', ''),
      workspacePath: session.workspacePath.length > 0 ? session.workspacePath : readStringValue(stored, 'workspacePath', ''),
      workspaceTitle: session.workspaceTitle.length > 0 ? session.workspaceTitle : readStringValue(stored, 'workspaceTitle', ''),
      branchName: session.branchName.length > 0 ? session.branchName : readStringValue(stored, 'branchName', 'main'),
      modelId: session.modelId.length > 0 && session.modelId !== 'configured' ? session.modelId : readStringValue(stored, 'modelId', session.modelId),
      speedMode: session.speedMode.length > 0 && session.speedMode !== 'auto' ? session.speedMode : readStringValue(stored, 'speedMode', session.speedMode),
      reasoningMode: session.reasoningMode && session.reasoningMode.length > 0 && session.reasoningMode !== 'auto' ?
        session.reasoningMode : readStringValue(stored, 'reasoningMode', session.reasoningMode || 'auto'),
      messageCount: Math.max(session.messageCount, readNumberValue(stored, 'messageCount', 0)),
      status: session.status,
      source: session.source,
      createdAt: readNumberValue(stored, 'createdAt', session.createdAt),
      updatedAt: Math.max(session.updatedAt, readNumberValue(stored, 'updatedAt', 0))
    };
  }

  saveSessionMetadata(session) {
    if (!session || typeof session !== 'object' || !session.remoteSessionId) {
      return;
    }
    this.metadata[this.metadataKey(session.remoteSessionId)] = {
      remoteSessionId: session.remoteSessionId,
      title: session.title,
      workspacePath: session.workspacePath,
      workspaceTitle: session.workspaceTitle,
      branchName: session.branchName,
      modelId: session.modelId,
      speedMode: session.speedMode,
      reasoningMode: session.reasoningMode || 'auto',
      messageCount: session.messageCount,
      status: session.status,
      source: session.source,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
    writeMetadataFile(this.metadataPath, this.metadata);
  }
}

module.exports = {
  OpenCodeProvider
};
