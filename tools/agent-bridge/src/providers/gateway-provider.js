'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const { EventType, makeEvent } = require('../protocol');
const { buildPromptWithContext } = require('./context-utils');

const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 30000;

function readStringValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readNumberValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }
  return fallbackValue;
}

function readArrayValue(source, key) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function readObjectValue(source, key) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function firstNumberFromSources(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      const value = readNumberValue(source, key, Number.NaN);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
  }
  return undefined;
}

function firstIntegerFromSources(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      const value = readNumberValue(source, key, Number.NaN);
      if (Number.isSafeInteger(value) && value >= 0) {
        return value;
      }
    }
  }
  return undefined;
}

function firstStringFromSources(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      const value = readStringValue(source, key, '');
      if (value.length > 0) {
        return value;
      }
    }
  }
  return '';
}

function normalizeGatewayUsage(raw, remoteSessionId, eventId) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const response = readObjectValue(source, 'response') || source;
  const usage = readObjectValue(response, 'usage') || readObjectValue(source, 'usage');
  if (!usage) {
    return null;
  }
  const inputDetails = readObjectValue(usage, 'input_tokens_details') || readObjectValue(usage, 'inputTokensDetails') || {};
  const inputTokens = firstIntegerFromSources([usage], ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens']);
  const outputTokens = firstIntegerFromSources([usage], ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens']);
  const reasoningTokens = firstIntegerFromSources([usage], ['reasoning_tokens', 'reasoningTokens']);
  const cacheReadTokens = firstIntegerFromSources([usage, inputDetails], ['cache_read_tokens', 'cacheReadTokens', 'cached_tokens', 'cachedTokens']);
  const cacheWriteTokens = firstIntegerFromSources([usage], ['cache_write_tokens', 'cacheWriteTokens']);
  const totalTokens = firstIntegerFromSources([usage], ['total_tokens', 'totalTokens']);
  const cost = firstNumberFromSources([usage, response, source], ['cost', 'total_cost', 'totalCost', 'cost_usd', 'costUsd']);
  if (inputTokens === undefined && outputTokens === undefined && reasoningTokens === undefined &&
      cacheReadTokens === undefined && cacheWriteTokens === undefined && totalTokens === undefined && cost === undefined) {
    return null;
  }
  const occurredAtText = firstStringFromSources([source, response, usage], ['completedAt', 'completed_at', 'createdAt', 'created_at', 'timestamp']);
  const occurredAtTime = occurredAtText.length > 0 ? Date.parse(occurredAtText) : NaN;
  const occurredAt = Number.isFinite(occurredAtTime) ? new Date(occurredAtTime).toISOString() : new Date().toISOString();
  const result = {
    eventId,
    source: 'provider',
    kind: 'turn',
    estimated: false,
    window: 'session',
    occurredAt,
    threadId: remoteSessionId
  };
  if (inputTokens !== undefined) result.inputTokens = inputTokens;
  if (outputTokens !== undefined) result.outputTokens = outputTokens;
  if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;
  if (cacheReadTokens !== undefined) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens !== undefined) result.cacheWriteTokens = cacheWriteTokens;
  if (totalTokens !== undefined) {
    result.totalTokens = totalTokens;
  } else if (inputTokens !== undefined && outputTokens !== undefined) {
    result.totalTokens = inputTokens + outputTokens;
  }
  if (cost !== undefined) {
    result.cost = cost;
    const currency = firstStringFromSources([usage, response, source], ['currency', 'costCurrency']).trim().toUpperCase();
    if (currency.length > 0) result.currency = currency;
  }
  return result;
}

function normalizeBaseUrl(value, fallbackValue) {
  const text = typeof value === 'string' && value.length > 0 ? value : fallbackValue;
  return text.endsWith('/') ? text.substring(0, text.length - 1) : text;
}

function createRemoteSessionId(providerId) {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return providerId + '-' + crypto.randomBytes(16).toString('hex');
}

function configuredModel(providerId, displayName) {
  return {
    id: 'configured',
    displayName: displayName || 'Configured Model',
    vendor: providerId,
    isDefault: true,
    contextWindow: 0
  };
}

function modelOption(providerId, id, isDefault) {
  return {
    id,
    displayName: id,
    vendor: providerId,
    isDefault,
    contextWindow: 0
  };
}

function buildDefaultSpeedModes(label) {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the runtime configured in ' + label + '.',
      isDefault: true
    }
  ];
}

function buildDefaultReasoningModes(label) {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the reasoning effort configured in ' + label + '.',
      isDefault: true
    },
    {
      id: 'low',
      displayName: 'Low',
      description: 'Prefer lower latency when the provider supports it.',
      isDefault: false
    },
    {
      id: 'medium',
      displayName: 'Medium',
      description: 'Balanced reasoning for coding work.',
      isDefault: false
    },
    {
      id: 'high',
      displayName: 'High',
      description: 'Use deeper reasoning when the provider supports it.',
      isDefault: false
    }
  ];
}

function buildDefaultInteractionModes() {
  return [
    {
      id: 'goal',
      displayName: 'Goal',
      description: 'Run the prompt as an implementation request.',
      isDefault: true,
      category: 'run'
    }
  ];
}

function buildSessionFeatures() {
  return {
    list: true,
    import: true,
    resume: true,
    attach: true,
    messages: true,
    update: false,
    delete: false,
    abort: true,
    fork: false,
    share: false,
    revert: false,
    todo: false,
    diff: false,
    command: true,
    shell: true
  };
}

class GatewayRuntimeError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'GatewayRuntimeError';
    this.category = category;
  }
}

function gatewayError(category, message) {
  return new GatewayRuntimeError(category, message);
}

function classifyGatewayError(error) {
  if (error && typeof error.category === 'string' && error.category.length > 0) {
    return error.category;
  }
  const message = error instanceof Error ? error.message : String(error || '');
  if (/HTTP\s+(401|403)|unauthorized|forbidden/i.test(message)) {
    return 'auth_failed';
  }
  if (/timed out|timeout/i.test(message)) {
    return 'timeout';
  }
  if (/aborted|abort/i.test(message)) {
    return 'aborted';
  }
  if (/status=|HTTP\s+\d+/i.test(message)) {
    return 'remote_error';
  }
  return 'transport_failed';
}

function safeJsonText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function collectText(value, fragments, depth) {
  if (depth > 6 || value === null || value === undefined) {
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
      collectText(item, fragments, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const type = readStringValue(value, 'type', '');
  if (type === 'output_text' || type === 'text' || type === 'message') {
    const text = readStringValue(value, 'text', readStringValue(value, 'content', ''));
    if (text.length > 0) {
      fragments.push(text);
    }
  }
  const output = value.output;
  if (output) {
    collectText(output, fragments, depth + 1);
  }
  const content = value.content;
  if (content) {
    collectText(content, fragments, depth + 1);
  }
  const response = value.response;
  if (response) {
    collectText(response, fragments, depth + 1);
  }
}

function responseText(value) {
  const fragments = [];
  collectText(value, fragments, 0);
  return fragments.join('\n').trim();
}

function parseJsonObject(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function parseOpenAiModels(body, providerId, fallbackModel) {
  const models = [configuredModel(providerId)];
  const seen = new Set();
  seen.add('configured');
  const items = Array.isArray(body) ? body : readArrayValue(body, 'data');
  for (const item of items) {
    const id = typeof item === 'string' ? item : readStringValue(item, 'id', '');
    if (id.length > 0 && !seen.has(id)) {
      seen.add(id);
      models.push(modelOption(providerId, id, id === fallbackModel));
    }
  }
  if (fallbackModel.length > 0 && !seen.has(fallbackModel)) {
    models.push(modelOption(providerId, fallbackModel, true));
  }
  return models;
}

function requestJson(baseUrl, requestPath, method, body, headers, timeoutMs, observeRequest) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestPath, baseUrl);
    const bodyText = body === null || body === undefined ? '' : JSON.stringify(body);
    const requestHeaders = {
      Accept: 'application/json'
    };
    for (const key of Object.keys(headers || {})) {
      requestHeaders[key] = headers[key];
    }
    if (bodyText.length > 0) {
      requestHeaders['Content-Type'] = 'application/json; charset=utf-8';
      requestHeaders['Content-Length'] = Buffer.byteLength(bodyText);
    }
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, { method, headers: requestHeaders }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(gatewayError(statusCode === 401 || statusCode === 403 ? 'auth_failed' : 'remote_error', 'HTTP ' + String(statusCode) + ': ' + text));
          return;
        }
        const parsed = parseJsonObject(text);
        resolve({
          statusCode,
          body: parsed || {},
          text
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(gatewayError('timeout', 'Request timed out after ' + String(timeoutMs) + 'ms'));
    });
    req.on('error', reject);
    if (typeof observeRequest === 'function') {
      observeRequest(req);
    }
    if (bodyText.length > 0) {
      req.write(bodyText);
    }
    req.end();
  });
}

function appendAuthHeader(headers, token) {
  if (typeof token === 'string' && token.length > 0) {
    headers.Authorization = 'Bearer ' + token;
  }
}

class LocalGatewayProvider {
  constructor(config) {
    this.id = readStringValue(config, 'id', 'gateway');
    this.displayName = readStringValue(config, 'displayName', this.id);
    this.description = readStringValue(config, 'description', 'Connects to a local agent gateway.');
    this.baseUrl = normalizeBaseUrl(readStringValue(config, 'baseUrl', ''), 'http://127.0.0.1:8788');
    this.token = readStringValue(config, 'token', '');
    this.defaultModel = readStringValue(config, 'model', 'configured');
    this.profile = readStringValue(config, 'profile', 'default');
    this.provider = readStringValue(config, 'provider', '');
    this.model = readStringValue(config, 'studioModel', '');
    this.usageEndpoint = readStringValue(config, 'usageEndpoint', '');
    this.usageEndpointEnv = readStringValue(config, 'usageEndpointEnv', '');
    this.usageEndpointTokenEnv = readStringValue(config, 'usageEndpointTokenEnv', '');
    this.requestTimeoutMs = readNumberValue(config, 'requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS);
    this.healthTimeoutMs = readNumberValue(config, 'healthTimeoutMs', DEFAULT_HTTP_TIMEOUT_MS);
    this.sessions = new Map();
    this.messages = new Map();
    this.inFlight = new Map();
    this.emittedUsageIds = new Set();
    this.usageSequence = 0;
    this.supportsInteractiveSessions = true;
    this.usageEventsAvailable = true;
  }

  createLocalSession(payload) {
    const requestedWorkspacePath = readStringValue(payload, 'workspacePath', '');
    const workspacePath = requestedWorkspacePath.length > 0 ? requestedWorkspacePath : process.cwd();
    const requestedWorkspaceTitle = readStringValue(payload, 'workspaceTitle', '');
    const workspaceTitle = requestedWorkspaceTitle.length > 0 ? requestedWorkspaceTitle : path.basename(workspacePath);
    const remoteSessionId = readStringValue(payload, 'remoteSessionId', createRemoteSessionId(this.id));
    const requestedSessionId = readStringValue(payload, 'sessionId', '');
    const now = Date.now();
    const session = {
      sessionId: requestedSessionId.length > 0 ? requestedSessionId : this.id + ':' + remoteSessionId,
      remoteSessionId,
      providerId: this.id,
      title: workspaceTitle.length > 0 ? workspaceTitle : this.displayName + ' Session',
      workspacePath,
      workspaceTitle,
      branchName: 'main',
      modelId: readStringValue(payload, 'modelId', 'configured'),
      speedMode: readStringValue(payload, 'speedMode', 'auto'),
      reasoningMode: readStringValue(payload, 'reasoningMode', 'auto'),
      messageCount: 0,
      status: 'ready',
      source: this.id,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.sessionId, session);
    this.messages.set(session.sessionId, []);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async createSession(payload) {
    return this.createLocalSession(payload);
  }

  async attachSession(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const existing = sessionId.length > 0 ? this.getSession(sessionId) : null;
    if (existing) {
      return this.sessionRuntimeDiagnostics(existing.sessionId);
    }
    const remoteSessionId = readStringValue(payload, 'remoteSessionId', '');
    if (remoteSessionId.length === 0) {
      throw gatewayError('remote_error', 'Remote session id is required to attach ' + this.displayName + '.');
    }
    const session = this.createLocalSession(payload);
    this.emitSession(session, emit);
    return this.sessionRuntimeDiagnostics(session.sessionId);
  }

  sessionRuntimeDiagnostics(sessionId) {
    const session = this.getSession(sessionId);
    return {
      providerId: this.id,
      sessionId,
      remoteSessionId: session ? session.remoteSessionId : '',
      runtimeMode: 'service',
      interactiveReady: session !== null,
      sessionState: session ? session.status : 'detached',
      pid: 0,
      startedAt: session ? session.createdAt : 0,
      lastActivityAt: session ? session.updatedAt : 0,
      exitCode: null,
      lastError: session && session.lastError ? session.lastError : '',
      recentOutputTail: '',
      runtimeFallbackReason: ''
    };
  }

  rememberInFlight(sessionId, handle) {
    this.inFlight.set(sessionId, handle);
  }

  clearInFlight(sessionId, handle) {
    if (!handle || this.inFlight.get(sessionId) === handle) {
      this.inFlight.delete(sessionId);
    }
  }

  async abortSession(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const handle = this.inFlight.get(sessionId);
    let terminated = false;
    if (handle && typeof handle.abort === 'function') {
      handle.abort();
      terminated = true;
    }
    this.clearInFlight(sessionId, handle);
    const session = this.getSession(sessionId);
    if (session) {
      session.status = 'ready';
      session.updatedAt = Date.now();
      session.lastError = terminated ? 'Request aborted.' : '';
      this.emitSession(session, emit);
    }
    return {
      status: terminated ? 'aborted' : 'idle',
      providerId: this.id,
      sessionId,
      remoteSessionId: session ? session.remoteSessionId : readStringValue(payload, 'remoteSessionId', ''),
      runtimeMode: 'service',
      interactiveReady: session !== null,
      sessionState: session ? session.status : 'detached',
      terminated,
      failureCategory: terminated ? 'aborted' : ''
    };
  }

  async archiveSession(payload, emit) {
    const result = await this.abortSession(payload, emit);
    const sessionId = readStringValue(payload, 'sessionId', '');
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
    return Object.assign({}, result, { archived: true, interactiveReady: false, sessionState: 'archived' });
  }

  async shutdown(reason) {
    const results = [];
    for (const [sessionId, handle] of this.inFlight.entries()) {
      if (handle && typeof handle.abort === 'function') {
        try {
          handle.abort();
          results.push({ sessionId, status: 'aborted' });
        } catch (error) {
          results.push({ sessionId, status: 'failed', reason: error instanceof Error ? error.message : String(error) });
        }
      }
      this.inFlight.delete(sessionId);
    }
    return { status: 'completed', reason: reason || '', results };
  }

  async listSessions() {
    const sessions = Array.from(this.sessions.values());
    sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    return sessions;
  }

  async listMessages(sessionId) {
    return this.messages.get(sessionId) || [];
  }

  updateSessionFromPayload(session, payload) {
    const modelId = readStringValue(payload, 'modelId', '');
    const speedMode = readStringValue(payload, 'speedMode', '');
    const reasoningMode = readStringValue(payload, 'reasoningMode', '');
    if (modelId.length > 0) {
      session.modelId = modelId;
    }
    if (speedMode.length > 0) {
      session.speedMode = speedMode;
    }
    if (reasoningMode.length > 0) {
      session.reasoningMode = reasoningMode;
    }
  }

  appendUserMessage(sessionId, text) {
    const history = this.messages.get(sessionId) || [];
    history.push({
      id: sessionId + ':user:' + String(history.length + 1),
      sessionId,
      role: 'user',
      title: '',
      text,
      createdAt: Date.now()
    });
    this.messages.set(sessionId, history);
    return history;
  }

  appendAssistantMessage(sessionId, text, reasoningText) {
    const history = this.messages.get(sessionId) || [];
    history.push({
      id: sessionId + ':assistant:' + String(history.length + 1),
      sessionId,
      role: 'assistant',
      title: '',
      text,
      reasoningText: reasoningText || '',
      createdAt: Date.now()
    });
    this.messages.set(sessionId, history);
  }

  emitSession(session, emit) {
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.SESSION_UPDATED, session.sessionId, { session }));
    }
  }

  headers() {
    const headers = {};
    appendAuthHeader(headers, this.token);
    return headers;
  }

  emitGatewayUsage(session, raw, emit, sourceLabel) {
    if (!session || typeof emit !== 'function') {
      return;
    }
    const source = raw && typeof raw === 'object' ? raw : {};
    const response = readObjectValue(source, 'response') || source;
    this.usageSequence += 1;
    const providerEventId = firstStringFromSources([response, source], ['id', 'responseId', 'response_id']);
    const identity = providerEventId.length > 0 ? providerEventId : String(this.usageSequence);
    const key = session.sessionId + ':usage:' + sourceLabel + ':' + identity;
    if (this.emittedUsageIds.has(key)) {
      return;
    }
    const usage = normalizeGatewayUsage(
      source,
      session.remoteSessionId,
      this.id + ':' + session.remoteSessionId + ':usage:' + sourceLabel + ':' + identity
    );
    if (!usage) {
      return;
    }
    this.emittedUsageIds.add(key);
    emit(makeEvent(EventType.USAGE_UPDATED, session.sessionId, { usage }));
  }
}

class OpenClawGatewayProvider extends LocalGatewayProvider {
  constructor(config) {
    super({
      id: 'openclaw-gateway',
      displayName: 'OpenClaw Gateway',
      description: 'Connects to OpenClaw Gateway through the OpenAI-compatible Responses API.',
      baseUrl: readStringValue(config, 'baseUrl', 'http://127.0.0.1:18789'),
      token: readStringValue(config, 'token', ''),
      model: readStringValue(config, 'model', 'openclaw/default'),
      usageEndpoint: readStringValue(config, 'usageEndpoint', ''),
      usageEndpointEnv: readStringValue(config, 'usageEndpointEnv', ''),
      usageEndpointTokenEnv: readStringValue(config, 'usageEndpointTokenEnv', ''),
      requestTimeoutMs: readNumberValue(config, 'requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS),
      healthTimeoutMs: readNumberValue(config, 'healthTimeoutMs', DEFAULT_HTTP_TIMEOUT_MS)
    });
  }

  async describe() {
    const health = await this.checkHealth();
    return {
      id: this.id,
      displayName: this.displayName,
      status: health.available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.baseUrl,
      runtimeMode: 'service',
      capabilities: {
        streaming: true,
        tools: true,
        previews: false,
        permissions: false,
        authConfigured: this.token.length > 0,
        history: true,
        interactiveSessions: true,
        modelSelection: true,
        speedProfiles: false,
        workspaceAware: true,
        nativeProxy: false,
        events: true,
        requests: false,
        plans: false,
        questions: false,
        files: false,
        search: true,
        shell: true,
        commands: true,
        usageEvents: true,
        health: health.detail
      },
      models: health.models,
      speedModes: buildDefaultSpeedModes('OpenClaw Gateway'),
      reasoningModes: buildDefaultReasoningModes('OpenClaw Gateway'),
      interactionModes: buildDefaultInteractionModes(),
      tools: [
        {
          id: 'openclaw.gateway',
          displayName: 'OpenClaw Gateway',
          description: 'Runs OpenClaw through the local gateway operator surface.',
          risk: 'write'
        }
      ],
      sessionFeatures: buildSessionFeatures()
    };
  }

  async checkHealth() {
    try {
      const response = await requestJson(this.baseUrl, '/v1/models', 'GET', null, this.headers(), this.healthTimeoutMs);
      const models = parseOpenAiModels(response.body, this.id, this.defaultModel);
      return {
        available: true,
        detail: 'OpenClaw Gateway is reachable',
        models
      };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : String(error),
        models: parseOpenAiModels(null, this.id, this.defaultModel)
      };
    }
  }

  async sendMessage(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const text = readStringValue(payload, 'text', '');
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    this.updateSessionFromPayload(session, payload);
    session.status = 'running';
    session.updatedAt = Date.now();
    session.messageCount = session.messageCount + 1;
    this.appendUserMessage(sessionId, text);
    this.emitSession(session, emit);
    emit(makeEvent(EventType.TOOL_STARTED, sessionId, {
      toolCallId: this.id + '_responses',
      name: this.id + '.responses',
      input: {
        endpoint: this.baseUrl,
        modelId: session.modelId,
        workspacePath: session.workspacePath
      }
    }));

    const promptText = buildPromptWithContext(text, payload, session);
    try {
      const result = await this.runResponsesStream(session, promptText, emit);
      const output = result.output.trim();
      const reasoning = result.reasoning.trim();
      if (output.length > 0) {
        this.appendAssistantMessage(sessionId, output, reasoning);
      }
      emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
        role: 'assistant',
        text: output,
        reasoningText: reasoning,
        contentKind: 'text'
      }));
      emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
        toolCallId: this.id + '_responses',
        status: 'completed',
        statusCode: result.statusCode
      }));
    } catch (error) {
      const failureCategory = classifyGatewayError(error);
      session.lastError = error instanceof Error ? error.message : String(error);
      emit(makeEvent(EventType.ERROR, sessionId, {
        code: this.id + '_' + failureCategory,
        message: session.lastError,
        failureCategory
      }));
      emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
        toolCallId: this.id + '_responses',
        status: 'error',
        errorText: session.lastError,
        failureCategory
      }));
    } finally {
      session.status = 'ready';
      session.updatedAt = Date.now();
      this.emitSession(session, emit);
    }
  }

  buildResponseRequestBody(session, promptText) {
    const model = session.modelId.length > 0 && session.modelId !== 'configured' ? session.modelId : this.defaultModel;
    const body = {
      model,
      input: promptText,
      stream: true
    };
    if (session.reasoningMode && session.reasoningMode.length > 0 && session.reasoningMode !== 'auto') {
      body.reasoning = { effort: session.reasoningMode };
      body.thinking = { effort: session.reasoningMode };
    }
    return body;
  }

  runResponsesStream(session, promptText, emit) {
    return new Promise((resolve, reject) => {
      const bodyText = JSON.stringify(this.buildResponseRequestBody(session, promptText));
      const url = new URL('/v1/responses', this.baseUrl);
      const headers = this.headers();
      headers.Accept = 'text/event-stream';
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(bodyText);
      headers['x-openclaw-session-key'] = session.remoteSessionId;
      const client = url.protocol === 'https:' ? https : http;
      let buffer = '';
      let output = '';
      let reasoning = '';
      let settled = false;
      let statusCode = 0;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.clearInFlight(session.sessionId, requestHandle);
        resolve({ output, reasoning, statusCode });
      };
      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.clearInFlight(session.sessionId, requestHandle);
        reject(error);
      };

      const handleEvent = (eventName, value) => {
        const type = readStringValue(value, 'type', readStringValue(value, 'event', eventName));
        if (type === 'response.output_text.delta') {
          const delta = readStringValue(value, 'delta', readStringValue(value, 'text', ''));
          if (delta.length > 0) {
            output += delta;
            emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
              role: 'assistant',
              text: delta,
              contentKind: 'text'
            }));
          }
          return;
        }
        if (type === 'response.reasoning.delta' || type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta') {
          const delta = readStringValue(value, 'delta', readStringValue(value, 'text', readStringValue(value, 'summary', '')));
          if (delta.length > 0) {
            reasoning += delta;
            emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
              role: 'assistant',
              text: delta,
              reasoningText: delta,
              contentKind: 'reasoning'
            }));
          }
          return;
        }
        if (type === 'response.completed') {
          this.emitGatewayUsage(session, value, emit, 'responses');
          const finalText = responseText(value);
          if (output.length === 0 && finalText.length > 0) {
            output = finalText;
            emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
              role: 'assistant',
              text: finalText,
              contentKind: 'text'
            }));
          }
          finish();
          return;
        }
        if (type === 'response.failed' || type === 'error') {
          const errorMessage = readStringValue(value, 'message', readStringValue(value, 'error', safeJsonText(value)));
          fail(new Error(errorMessage.length > 0 ? errorMessage : 'OpenClaw response failed'));
        }
      };

      const flushRecord = (record) => {
        const lines = record.split(/\r?\n/);
        let eventName = '';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.substring('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.substring('data:'.length).trim());
          }
        }
        const dataText = dataLines.join('\n').trim();
        if (dataText.length === 0) {
          return;
        }
        if (dataText === '[DONE]') {
          finish();
          return;
        }
        const parsed = parseJsonObject(dataText);
        if (parsed) {
          handleEvent(eventName, parsed);
        }
      };

      const req = client.request(url, { method: 'POST', headers }, (res) => {
        statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const category = statusCode === 401 || statusCode === 403 ? 'auth_failed' : 'remote_error';
            fail(gatewayError(category, 'OpenClaw Gateway request failed: status=' + String(statusCode) + ', body=' + Buffer.concat(chunks).toString('utf8')));
          });
          return;
        }
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('text/event-stream')) {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const parsed = parseJsonObject(text);
            if (!parsed) {
              fail(gatewayError('remote_error', 'OpenClaw Gateway returned invalid JSON: ' + text));
              return;
            }
            this.emitGatewayUsage(session, parsed, emit, 'responses');
            output = responseText(parsed);
            if (output.length > 0) {
              emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
                role: 'assistant',
                text: output,
                contentKind: 'text'
              }));
            }
            finish();
          });
          return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const records = buffer.split(/\r?\n\r?\n/);
          buffer = records.pop() || '';
          for (const record of records) {
            flushRecord(record);
          }
        });
        res.on('end', () => {
          if (buffer.trim().length > 0) {
            flushRecord(buffer);
          }
          finish();
        });
      });
      req.setTimeout(this.requestTimeoutMs, () => {
        req.destroy(gatewayError('timeout', 'OpenClaw Gateway timed out after ' + String(this.requestTimeoutMs) + 'ms'));
      });
      req.on('error', fail);
      const requestHandle = {
        abort: () => req.destroy(gatewayError('aborted', 'OpenClaw Gateway request aborted.'))
      };
      this.rememberInFlight(session.sessionId, requestHandle);
      req.write(bodyText);
      req.end();
    });
  }
}

class HermesStudioProvider extends LocalGatewayProvider {
  constructor(config) {
    super({
      id: 'hermes-studio',
      displayName: 'Hermes Studio',
      description: 'Connects to Hermes Studio BFF through chat-run Socket.IO and HTTP fallback.',
      baseUrl: readStringValue(config, 'baseUrl', 'http://127.0.0.1:8648'),
      token: readStringValue(config, 'token', ''),
      profile: readStringValue(config, 'profile', 'default'),
      provider: readStringValue(config, 'provider', ''),
      studioModel: readStringValue(config, 'model', ''),
      usageEndpoint: readStringValue(config, 'usageEndpoint', ''),
      usageEndpointEnv: readStringValue(config, 'usageEndpointEnv', ''),
      usageEndpointTokenEnv: readStringValue(config, 'usageEndpointTokenEnv', ''),
      requestTimeoutMs: readNumberValue(config, 'requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS),
      healthTimeoutMs: readNumberValue(config, 'healthTimeoutMs', DEFAULT_HTTP_TIMEOUT_MS)
    });
    this.socketFactory = config && typeof config.socketFactory === 'function' ? config.socketFactory : null;
  }

  async describe() {
    const health = await this.checkHealth();
    return {
      id: this.id,
      displayName: this.displayName,
      status: health.available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.baseUrl,
      runtimeMode: 'service',
      capabilities: {
        streaming: true,
        tools: true,
        previews: false,
        permissions: false,
        authConfigured: this.token.length > 0,
        history: true,
        interactiveSessions: true,
        modelSelection: this.provider.length > 0 || this.model.length > 0,
        speedProfiles: false,
        workspaceAware: true,
        nativeProxy: false,
        events: true,
        requests: false,
        plans: false,
        questions: false,
        files: false,
        search: true,
        shell: true,
        commands: true,
        usageEvents: true,
        health: health.detail
      },
      models: this.buildModels(),
      speedModes: buildDefaultSpeedModes('Hermes Studio'),
      reasoningModes: buildDefaultReasoningModes('Hermes Studio'),
      interactionModes: buildDefaultInteractionModes(),
      tools: [
        {
          id: 'hermes.chat-run',
          displayName: 'Hermes Chat Run',
          description: 'Runs Hermes Agent through the Studio chat-run bridge.',
          risk: 'write'
        }
      ],
      sessionFeatures: buildSessionFeatures()
    };
  }

  buildModels() {
    const models = [configuredModel(this.id)];
    if (this.provider.length > 0 && this.model.length > 0) {
      models.push(modelOption(this.provider, this.provider + '/' + this.model, true));
    }
    return models;
  }

  async checkHealth() {
    const paths = ['/api/health', '/health'];
    for (const requestPath of paths) {
      try {
        await requestJson(this.baseUrl, requestPath, 'GET', null, this.headers(), this.healthTimeoutMs);
        return {
          available: true,
          detail: 'Hermes Studio is reachable'
        };
      } catch (error) {
        // Try the next health path.
      }
    }
    return {
      available: false,
      detail: 'Hermes Studio health endpoint is not reachable'
    };
  }

  async sendMessage(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const text = readStringValue(payload, 'text', '');
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    this.updateSessionFromPayload(session, payload);
    session.status = 'running';
    session.updatedAt = Date.now();
    session.messageCount = session.messageCount + 1;
    this.appendUserMessage(sessionId, text);
    this.emitSession(session, emit);
    emit(makeEvent(EventType.TOOL_STARTED, sessionId, {
      toolCallId: this.id + '_chat_run',
      name: this.id + '.chat-run',
      input: {
        endpoint: this.baseUrl,
        profile: this.profile,
        modelId: session.modelId,
        workspacePath: session.workspacePath
      }
    }));

    const promptText = buildPromptWithContext(text, payload, session);
    try {
      const result = await this.runChat(session, promptText, emit);
      if (result.status === 'requires_action') {
        emit(makeEvent(EventType.ERROR, sessionId, {
          code: this.id + '_requires_action',
          message: 'Hermes Studio requested approval or clarification.',
          action: result.action || {}
        }));
        emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
          toolCallId: this.id + '_chat_run',
          status: 'requires_action'
        }));
      } else {
        const output = result.output.trim();
        const reasoning = result.reasoning.trim();
        if (output.length > 0) {
          this.appendAssistantMessage(sessionId, output, reasoning);
        }
        emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
          role: 'assistant',
          text: output,
          reasoningText: reasoning,
          contentKind: 'text'
        }));
        emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
          toolCallId: this.id + '_chat_run',
          status: 'completed'
        }));
      }
    } catch (error) {
      const failureCategory = classifyGatewayError(error);
      session.lastError = error instanceof Error ? error.message : String(error);
      emit(makeEvent(EventType.ERROR, sessionId, {
        code: this.id + '_' + failureCategory,
        message: session.lastError,
        failureCategory
      }));
      emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
        toolCallId: this.id + '_chat_run',
        status: 'error',
        errorText: session.lastError,
        failureCategory
      }));
    } finally {
      session.status = 'ready';
      session.updatedAt = Date.now();
      this.emitSession(session, emit);
    }
  }

  buildChatRunPayload(session, promptText) {
    const payload = {
      input: promptText,
      session_id: session.remoteSessionId,
      profile: this.profile,
      workspace: session.workspacePath.length > 0 ? session.workspacePath : null,
      timeout_ms: this.requestTimeoutMs
    };
    const modelSelection = this.resolveModelSelection(session.modelId);
    if (modelSelection.provider.length > 0) {
      payload.provider = modelSelection.provider;
    }
    if (modelSelection.model.length > 0) {
      payload.model = modelSelection.model;
    }
    if (session.reasoningMode && session.reasoningMode.length > 0 && session.reasoningMode !== 'auto') {
      payload.reasoning_effort = session.reasoningMode;
    }
    return payload;
  }

  resolveModelSelection(modelId) {
    if (this.provider.length > 0 || this.model.length > 0) {
      return {
        provider: this.provider,
        model: this.model
      };
    }
    if (typeof modelId === 'string' && modelId.length > 0 && modelId !== 'configured') {
      const separator = modelId.indexOf('/');
      if (separator > 0 && separator + 1 < modelId.length) {
        return {
          provider: modelId.substring(0, separator),
          model: modelId.substring(separator + 1)
        };
      }
      return {
        provider: '',
        model: modelId
      };
    }
    return {
      provider: '',
      model: ''
    };
  }

  async runChat(session, promptText, emit) {
    try {
      return await this.runChatViaSocket(session, promptText, emit);
    } catch (error) {
      const category = classifyGatewayError(error);
      if (category === 'aborted' || category === 'auth_failed' || category === 'remote_error') {
        throw error;
      }
      return await this.runChatViaHttp(session, promptText, emit, error);
    }
  }

  runChatViaSocket(session, promptText, emit) {
    return new Promise((resolve, reject) => {
      let io = this.socketFactory;
      if (!io) {
        try {
          io = require('socket.io-client').io;
        } catch (error) {
          reject(gatewayError('transport_failed', 'socket.io-client is not installed; falling back to HTTP chat-run.'));
          return;
        }
      }
      const socket = io(this.baseUrl + '/chat-run', {
        auth: this.token.length > 0 ? { token: this.token } : {},
        query: { profile: this.profile },
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 30000
      });
      const payload = this.buildChatRunPayload(session, promptText);
      let output = '';
      let reasoning = '';
      let settled = false;
      const timer = setTimeout(() => {
        finishError(new Error('Hermes Studio chat-run timed out after ' + String(this.requestTimeoutMs) + 'ms'));
      }, this.requestTimeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.clearInFlight(session.sessionId, socketHandle);
        socket.removeAllListeners();
        socket.disconnect();
      };
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };
      const finishError = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };
      const socketHandle = {
        abort: () => finishError(gatewayError('aborted', 'Hermes Studio request aborted.'))
      };
      this.rememberInFlight(session.sessionId, socketHandle);
      const eventNames = [
        'run.started',
        'message.delta',
        'reasoning.delta',
        'thinking.delta',
        'reasoning.available',
        'tool.started',
        'tool.completed',
        'run.completed',
        'run.failed',
        'approval.requested',
        'clarify.requested'
      ];
      const handleEvent = (eventName, event) => {
        const value = event && typeof event === 'object' ? event : {};
        if (eventName === 'message.delta') {
          const delta = readStringValue(value, 'delta', readStringValue(value, 'text', ''));
          if (delta.length > 0) {
            output += delta;
            emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
              role: 'assistant',
              text: delta,
              contentKind: 'text'
            }));
          }
          return;
        }
        if (eventName === 'reasoning.delta' || eventName === 'thinking.delta') {
          const delta = readStringValue(value, 'delta', readStringValue(value, 'text', ''));
          if (delta.length > 0) {
            reasoning += delta;
            emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
              role: 'assistant',
              text: delta,
              reasoningText: delta,
              contentKind: 'reasoning'
            }));
          }
          return;
        }
        if (eventName === 'tool.started') {
          const toolCallId = readStringValue(value, 'tool_call_id', readStringValue(value, 'toolCallId', this.id + '_tool'));
          emit(makeEvent(EventType.TOOL_STARTED, session.sessionId, {
            toolCallId,
            name: readStringValue(value, 'tool', 'hermes.tool'),
            input: value,
            rawJson: safeJsonText(value)
          }));
          return;
        }
        if (eventName === 'tool.completed') {
          const toolCallId = readStringValue(value, 'tool_call_id', readStringValue(value, 'toolCallId', this.id + '_tool'));
          emit(makeEvent(EventType.TOOL_COMPLETED, session.sessionId, {
            toolCallId,
            name: readStringValue(value, 'tool', 'hermes.tool'),
            status: readStringValue(value, 'status', 'completed'),
            outputText: readStringValue(value, 'output', ''),
            rawJson: safeJsonText(value)
          }));
          return;
        }
        if (eventName === 'run.completed') {
          this.emitGatewayUsage(session, value, emit, 'chat-run');
          const finalOutput = readStringValue(value, 'output', '');
          const finalReasoning = readStringValue(value, 'reasoning', '');
          finish({
            status: 'completed',
            output: finalOutput.length > 0 ? finalOutput : output,
            reasoning: finalReasoning.length > 0 ? finalReasoning : reasoning,
            action: null
          });
          return;
        }
        if (eventName === 'run.failed') {
          finishError(new Error(readStringValue(value, 'error', 'Hermes Studio chat-run failed')));
          return;
        }
        if (eventName === 'approval.requested' || eventName === 'clarify.requested') {
          finish({
            status: 'requires_action',
            output,
            reasoning,
            action: value
          });
        }
      };

      socket.on('connect_error', (error) => {
        finishError(error instanceof Error ? error : new Error(String(error)));
      });
      socket.on('connect', () => {
        socket.emit('run', payload);
      });
      for (const eventName of eventNames) {
        socket.on(eventName, (event) => {
          handleEvent(eventName, event);
        });
      }
    });
  }

  async runChatViaHttp(session, promptText, emit, originalError) {
    let requestHandle = null;
    let response = null;
    try {
      response = await requestJson(
        this.baseUrl,
        '/api/chat-run/runs',
        'POST',
        this.buildChatRunPayload(session, promptText),
        this.headers(),
        this.requestTimeoutMs,
        (request) => {
          requestHandle = {
            abort: () => request.destroy(gatewayError('aborted', 'Hermes Studio HTTP request aborted.'))
          };
          this.rememberInFlight(session.sessionId, requestHandle);
        }
      );
    } finally {
      this.clearInFlight(session.sessionId, requestHandle);
    }
    const status = readStringValue(response.body, 'status', '');
    if (status === 'requires_action') {
      return {
        status: 'requires_action',
        output: readStringValue(response.body, 'output', ''),
        reasoning: readStringValue(response.body, 'reasoning', ''),
        action: response.body.action || response.body
      };
    }
    if (response.body.ok === false || status === 'failed') {
      const fallback = originalError instanceof Error ? originalError.message : String(originalError || '');
      throw new Error(readStringValue(response.body, 'error', fallback.length > 0 ? fallback : 'Hermes Studio chat-run failed'));
    }
    this.emitGatewayUsage(session, response.body, emit, 'chat-run-http');
    const output = readStringValue(response.body, 'output', responseText(response.body));
    const reasoning = readStringValue(response.body, 'reasoning', '');
    if (output.length > 0) {
      emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
        role: 'assistant',
        text: output,
        contentKind: 'text'
      }));
    }
    if (reasoning.length > 0) {
      emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
        role: 'assistant',
        text: reasoning,
        reasoningText: reasoning,
        contentKind: 'reasoning'
      }));
    }
    return {
      status: 'completed',
      output,
      reasoning,
      action: null
    };
  }
}

module.exports = {
  HermesStudioProvider,
  OpenClawGatewayProvider,
  normalizeGatewayUsage
};
