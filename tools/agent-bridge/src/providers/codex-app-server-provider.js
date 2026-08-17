'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { EventType, makeEvent } = require('../protocol');
const { CodexAppServerTransport } = require('./codex-app-server-transport');
const { createCodexProvider } = require('./cli-provider');

const CODEX_RUNTIME_VALUES = ['auto', 'app-server', 'exec'];
const CODEX_THREAD_LIST_PAGE_SIZE = 100;
const CODEX_THREAD_LIST_MAX_SESSIONS = 1000;
// The exec runtime enumerates through a third-party CLI that can take 15-30s.
// Keep the catalog cached for 30s so repeated discovery triggers are cheap.
const CODEX_THREAD_LIST_CACHE_MS = 30000;
const CODEX_THREAD_TITLE_MAX_LENGTH = 120;
const CODEX_THREAD_LIST_SOURCE_KINDS = ['cli', 'vscode', 'exec', 'appServer', 'unknown'];
const MAX_EMITTED_COMPACTION_IDS = 4096;
const PLAN_PREFIX = 'Plan mode: analyze the request and produce an implementation plan only. Do not edit files, run destructive commands, or perform the implementation yet. End with a concise plan that can be approved or rejected.';

function firstNumber(source, keys) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  for (const key of keys) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) {
      return source[key];
    }
  }
  return undefined;
}

function usageInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function usageCost(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeCodexTimestamp(primary, secondary) {
  const sources = [primary, secondary];
  const numericKeys = ['occurredAtMs', 'completedAtMs', 'completed_at_ms', 'timestampMs', 'timestamp', 'updatedAtMs', 'updated_at_ms'];
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const numeric = firstNumber(source, numericKeys);
    if (numeric !== undefined) {
      return new Date(normalizeEpochMilliseconds(numeric, Date.now())).toISOString();
    }
  }
  const textKeys = ['occurredAt', 'completedAt', 'completed_at', 'timestamp', 'updatedAt', 'updated_at'];
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const key of textKeys) {
      const value = readString(source, key, '').trim();
      if (value.length === 0) continue;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

function nestedObject(source, keys) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function normalizeCodexUsage(raw, threadId, turnId) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const usage = nestedObject(source, ['tokenUsage', 'token_usage', 'usage']) || source;
  const last = nestedObject(usage, ['last', 'latest', 'turn']) || usage;
  const inputTokens = usageInteger(firstNumber(last, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']));
  const outputTokens = usageInteger(firstNumber(last, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']));
  const cacheReadTokens = usageInteger(firstNumber(last, ['cacheReadTokens', 'cache_read_tokens', 'cachedInputTokens', 'cached_input_tokens']));
  const cacheWriteTokens = usageInteger(firstNumber(last, ['cacheWriteTokens', 'cache_write_tokens']));
  const reasoningTokens = usageInteger(firstNumber(last, ['reasoningTokens', 'reasoning_tokens', 'reasoningOutputTokens', 'reasoning_output_tokens']));
  let totalTokens = usageInteger(firstNumber(last, ['totalTokens', 'total_tokens']));
  if (totalTokens === undefined && inputTokens !== undefined && outputTokens !== undefined) {
    totalTokens = inputTokens + outputTokens;
  }
  const cost = usageCost(firstNumber(last, ['cost', 'costUsd', 'cost_usd']));
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined && cost === undefined) {
    return null;
  }
  const eventId = 'codex:' + threadId + ':' + turnId + ':usage';
  const result = {
    eventId,
    source: 'provider',
    kind: 'turn',
    estimated: false,
    window: 'session',
    occurredAt: normalizeCodexTimestamp(last, source)
  };
  if (threadId.length > 0) {
    result.threadId = threadId;
  }
  if (turnId.length > 0) {
    result.turnId = turnId;
  }
  if (inputTokens !== undefined) result.inputTokens = inputTokens;
  if (outputTokens !== undefined) result.outputTokens = outputTokens;
  if (cacheReadTokens !== undefined) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens !== undefined) result.cacheWriteTokens = cacheWriteTokens;
  if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;
  if (totalTokens !== undefined) result.totalTokens = totalTokens;
  if (cost !== undefined) {
    result.cost = cost;
    const currency = readString(last, 'currency', readString(last, 'costCurrency', '')).trim().toUpperCase();
    if (currency.length > 0) result.currency = currency;
  }
  return result;
}

function compactionIdentity(turnId, details) {
  const source = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  const explicitId = readString(source, 'id', readString(source, 'itemId', readString(source, 'compactionId', ''))).trim();
  if (explicitId.length > 0) {
    return 'item:' + explicitId;
  }
  if (turnId.length > 0) {
    return 'turn:' + turnId;
  }
  const timestampMs = firstNumber(source, ['occurredAtMs', 'completedAtMs', 'completed_at_ms', 'timestampMs', 'updatedAtMs', 'updated_at_ms']);
  const timestamp = timestampMs === undefined
    ? readString(source, 'occurredAt', readString(source, 'completedAt', readString(source, 'completed_at', readString(source, 'timestamp', '')))).trim()
    : String(timestampMs);
  const reason = readString(source, 'reason', '').trim();
  const beforeTokens = firstNumber(source, ['beforeTokens', 'before_tokens']);
  const afterTokens = firstNumber(source, ['afterTokens', 'after_tokens']);
  return 'snapshot:' + [timestamp, reason, beforeTokens === undefined ? '' : String(beforeTokens), afterTokens === undefined ? '' : String(afterTokens)].join('|');
}

function parseMetadataResponse(rawText) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length === 0) {
    throw new Error('Codex metadata turn returned empty output.');
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (_nestedError) {
        parsed = null;
      }
    }
  }
  const suggestion = parsed && typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : text.split(/\r?\n/)[0].trim();
  if (suggestion.length === 0) {
    throw new Error('Codex metadata turn did not return a suggestion.');
  }
  const alternatives = [];
  if (parsed && Array.isArray(parsed.alternatives)) {
    for (const alternative of parsed.alternatives) {
      if (typeof alternative === 'string' && alternative.trim().length > 0 && alternatives.length < 5) {
        const value = alternative.trim();
        if (!alternatives.includes(value) && value !== suggestion) alternatives.push(value);
      }
    }
  }
  return { suggestion, alternatives };
}

function normalizeMetadataResult(kind, rawText) {
  const parsed = parseMetadataResponse(rawText);
  const suggestion = parsed.suggestion;
  if (kind === 'branchName' && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(suggestion)) {
    throw new Error('Codex metadata branch name failed validation.');
  }
  const maxLength = kind === 'pullRequest' ? 12000 : (kind === 'commitMessage' ? 2000 : 240);
  const normalizedSuggestion = suggestion.substring(0, maxLength);
  const normalizedAlternatives = [];
  for (const alternative of parsed.alternatives) {
    if (kind === 'branchName' && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(alternative)) continue;
    const value = alternative.substring(0, maxLength);
    if (value.length > 0 && value !== normalizedSuggestion && !normalizedAlternatives.includes(value)) normalizedAlternatives.push(value);
  }
  return { suggestion: normalizedSuggestion, alternatives: normalizedAlternatives };
}

function normalizeMetadataSuggestion(kind, rawText) {
  return normalizeMetadataResult(kind, rawText).suggestion;
}

function readString(source, key, fallback) {
  if (!source || typeof source !== 'object') {
    return fallback;
  }
  return typeof source[key] === 'string' ? source[key] : fallback;
}

function readArray(source, key) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  return Array.isArray(source[key]) ? source[key] : [];
}

function readNumber(source, key, fallback) {
  if (!source || typeof source !== 'object') {
    return fallback;
  }
  return typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback;
}

function readObject(source, key) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeEpochMilliseconds(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value < 100000000000 ? value * 1000 : value;
}

function normalizedThreadTitle(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.split(/\s+/).join(' ').trim();
  if (normalized.length <= CODEX_THREAD_TITLE_MAX_LENGTH) {
    return normalized;
  }
  return normalized.substring(0, CODEX_THREAD_TITLE_MAX_LENGTH - 3).trim() + '...';
}

function threadStatus(thread) {
  const status = readObject(thread, 'status');
  if (status) {
    const type = readString(status, 'type', '');
    if (type.length > 0) {
      return type;
    }
  }
  return readString(thread, 'status', 'ready');
}

function textFromUserMessageContent(content) {
  if (!Array.isArray(content)) {
    return '';
  }
  const fragments = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const text = readString(part, 'text', '');
    if (text.length > 0) {
      fragments.push(text);
    }
  }
  return fragments.join('\n').trim();
}

function normalizeRuntime(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'auto';
  return CODEX_RUNTIME_VALUES.includes(normalized) ? normalized : '';
}

function threadFromResult(result) {
  return result && result.thread && typeof result.thread.id === 'string' ? result.thread : null;
}

function turnFromResult(result) {
  return result && result.turn && typeof result.turn.id === 'string' ? result.turn : null;
}

function itemId(item) {
  return item && typeof item.id === 'string' ? item.id : 'codex_item';
}

function itemType(item) {
  return item && typeof item.type === 'string' ? item.type : 'tool';
}

function itemText(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }
  if (typeof item.text === 'string') {
    return item.text;
  }
  if (typeof item.command === 'string') {
    return item.command;
  }
  if (Array.isArray(item.command)) {
    return item.command.join(' ');
  }
  if (typeof item.output === 'string') {
    return item.output;
  }
  return '';
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      shell: process.platform === 'win32' && !path.isAbsolute(command),
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === 0));
    setTimeout(() => {
      if (!settled) {
        child.kill();
        finish(false);
      }
    }, 3000);
  });
}

class CodexAppServerProvider {
  constructor(config) {
    this.id = 'codex';
    this.displayName = 'Codex';
    this.description = 'Runs Codex through the official App Server with exec fallback before thread creation.';
    this.command = readString(config, 'command', 'codex');
    this.runtimePreference = normalizeRuntime(readString(config, 'runtime', 'auto'));
    this.runtimeConfigError = this.runtimePreference.length === 0 ? 'AGENT_BRIDGE_CODEX_RUNTIME must be auto, app-server, or exec.' : '';
    this.usageFetcher = config && typeof config.usageFetcher === 'function' ? config.usageFetcher : null;
    this.usageEndpoint = config && typeof config.usageEndpoint === 'string' ? config.usageEndpoint : '';
    this.usageEndpointEnv = config && typeof config.usageEndpointEnv === 'string' ? config.usageEndpointEnv : '';
    this.usageEndpointTokenEnv = config && typeof config.usageEndpointTokenEnv === 'string' ? config.usageEndpointTokenEnv : '';
    this.providerUsageAvailable = this.usageFetcher !== null;
    this.usageEventsAvailable = this.runtimePreference !== 'exec' && this.runtimeConfigError.length === 0;
    this.supportsInteractiveSessions = this.runtimePreference !== 'exec' && this.runtimeConfigError.length === 0;
    this.transport = config && config.transport ? config.transport : new CodexAppServerTransport({
      command: this.command,
      appServerArgs: Array.isArray(config && config.appServerArgs) ? config.appServerArgs : ['app-server'],
      requestTimeoutMs: config && typeof config.timeoutMs === 'number' ? config.timeoutMs : 30000,
      spawnFactory: config && config.spawnFactory
    });
    this.execProvider = config && config.execProvider ? config.execProvider : createCodexProvider(config || {});
    this.commandAvailable = config && typeof config.commandAvailable === 'function' ? config.commandAvailable : commandAvailable;
    this.sessions = new Map();
    this.messages = new Map();
    this.turnWaiters = new Map();
    this.startingTurns = new Map();
    this.pendingInteractions = new Map();
    this.subscribers = new Map();
    this.latestUsageByThread = new Map();
    this.metadataRequests = new Map();
    // Codex reports a completed compaction through both a thread notification
    // and a contextCompaction item. Keep the counters scoped to the active
    // turn so either ordering produces one durable usage event.
    this.compactionNotificationCompletions = 0;
    this.compactionItemCompletions = 0;
    this.pendingCompactions = new Map();
    this.emittedCompactionIds = new Set();
    this.sessionListPromise = null;
    this.sessionListCache = [];
    this.sessionListCachedAt = 0;
    this.transport.on('notification', (message) => this.handleNotification(message));
    this.transport.on('request', (message) => this.handleServerRequest(message));
    this.transport.on('exit', (error) => this.handleTransportExit(error));
  }

  async describe() {
    if (this.runtimeConfigError.length > 0) {
      return this.buildDescriptor('unavailable', 'oneshot', false, this.runtimeConfigError, 'degraded');
    }
    if (this.runtimePreference === 'exec') {
      const descriptor = await this.execProvider.describe();
      descriptor.runtimeMode = 'oneshot';
      descriptor.capabilities.interactiveSessions = false;
      descriptor.sessionFeatures.attach = false;
      descriptor.sessionFeatures.resume = false;
      descriptor.runtimeFallbackReason = 'Codex runtime is explicitly configured to exec.';
      return descriptor;
    }
    const available = await this.commandAvailable(this.command);
    if (!available) {
      const health = this.command + ' is not available; App Server and exec runtime are unavailable.';
      return this.buildDescriptor('unavailable', 'service', false, health, 'degraded');
    }
    return this.buildDescriptor('available', 'service', true, 'Codex App Server starts lazily.', 'ready');
  }

  async getUsage(payload) {
    if (!this.usageFetcher) {
      throw new Error('Codex usage endpoint is not configured.');
    }
    return await this.usageFetcher(payload || {});
  }

  async generateMetadata(payload) {
    const result = await this.generateMetadataResult(payload);
    return result.suggestion;
  }

  async generateMetadataResult(payload) {
    if (this.runtimeConfigError.length > 0 || this.runtimePreference === 'exec') {
      throw new Error('Codex metadata generation requires the App Server runtime.');
    }
    const source = payload && typeof payload === 'object' ? payload : {};
    const metadataRequestId = readString(source, 'metadataRequestId', '');
    const metadataRecord = {
      requestId: metadataRequestId,
      sessionId: '',
      threadId: '',
      cancelRequested: false,
      cleanupPromise: null
    };
    if (metadataRequestId.length > 0) {
      this.metadataRequests.set(metadataRequestId, metadataRecord);
    }
    let session = null;
    try {
      await this.transport.start();
      if (metadataRecord.cancelRequested) {
        throw this.metadataCancellationError();
      }
    const kindValue = readString(source, 'kind', 'sessionTitle');
    const allowedKinds = ['sessionTitle', 'branchName', 'commitMessage', 'pullRequest'];
    const kind = allowedKinds.includes(kindValue) ? kindValue : 'sessionTitle';
    const workspacePath = readString(source, 'workspacePath', readString(source, 'cwd', ''));
    const modelId = readString(source, 'modelId', '');
    const threadParams = {};
    if (workspacePath.length > 0) threadParams.cwd = workspacePath;
    if (modelId.length > 0 && modelId !== 'configured') threadParams.model = modelId;
    const started = await this.transport.request('thread/start', threadParams);
    const thread = threadFromResult(started);
    if (!thread) {
      throw new Error('Codex metadata thread/start response did not include a thread id.');
    }
    metadataRecord.threadId = thread.id;
    if (metadataRecord.cancelRequested) {
      throw this.metadataCancellationError();
    }
    session = this.rememberThread(thread.id, {
      workspacePath,
      workspaceTitle: readString(source, 'workspaceTitle', ''),
      modelId
    }, 'metadata');
    metadataRecord.sessionId = session.sessionId;
    if (metadataRecord.cancelRequested) {
      throw this.metadataCancellationError();
    }
    const prompt = [
      'Generate metadata for the current coding session.',
      'Return only a JSON object with a string field "suggestion" and optional string array "alternatives".',
      'Do not edit files, run commands, or include markdown fences.',
      'kind=' + kind,
      'user goal=' + readString(source, 'prompt', '').substring(0, 4000),
      'timeline summary=' + readString(source, 'timelineSummary', '').substring(0, 6000),
      'git or diff summary=' + readString(source, 'diffSummary', '').substring(0, 6000),
      'current branch=' + readString(source, 'branchName', '').substring(0, 200)
    ].join('\n');
    const result = await this.sendMessage({
        sessionId: session.sessionId,
        text: prompt,
        workspacePath,
        cwd: workspacePath,
        modelId,
        interactionMode: 'goal'
    }, (_event) => {});
    const normalized = normalizeMetadataResult(kind, readString(result, 'text', ''));
    if (result && result.usage && typeof result.usage === 'object' && !Array.isArray(result.usage)) {
      normalized.usage = Object.assign({}, result.usage, {
        kind: 'metadata',
        eventId: 'codex:' + thread.id + ':metadata:' + readString(result, 'turnId', '')
      });
    }
    return normalized;
    } finally {
      if (metadataRequestId.length > 0) {
        await this.cleanupMetadataRequest(metadataRequestId, 'completed', metadataRecord);
      } else if (session) {
        this.sessions.delete(session.sessionId);
        this.messages.delete(session.sessionId);
        this.latestUsageByThread.delete(metadataRecord.threadId);
      }
    }
  }

  metadataCancellationError() {
    const error = new Error('Metadata generation was cancelled.');
    error.code = 'metadata_cancelled';
    return error;
  }

  async cleanupMetadataRequest(requestId, reason, fallbackRecord) {
    const record = this.metadataRequests.get(requestId) || fallbackRecord || null;
    if (!record) return { ok: true, cleaned: false, requestId };
    if (record.cleanupPromise) return await record.cleanupPromise;
    record.cleanupPromise = (async () => {
      const threadId = record.threadId;
      const session = record.sessionId.length > 0 ? this.getSession(record.sessionId) : null;
      if (session && session.activeTurnId.length > 0 && threadId.length > 0) {
        try {
          await this.transport.request('turn/interrupt', { threadId, turnId: session.activeTurnId });
        } catch (_error) {
          // The App Server may already have completed or disconnected the turn.
        }
      }
      if (threadId.length > 0) {
        try {
          await this.transport.request('thread/archive', { threadId });
        } catch (_error) {
          // Archive is best-effort; local metadata state is still removed below.
        }
      }
      if (record.sessionId.length > 0) this.sessions.delete(record.sessionId);
      if (record.sessionId.length > 0) this.messages.delete(record.sessionId);
      if (threadId.length > 0) this.latestUsageByThread.delete(threadId);
      return { ok: true, cleaned: threadId.length > 0, requestId, reason: reason || '' };
    })();
    try {
      return await record.cleanupPromise;
    } finally {
      if (this.metadataRequests.get(requestId) === record) {
        this.metadataRequests.delete(requestId);
      }
    }
  }

  async cancelMetadata(payload) {
    const requestId = readString(payload, 'requestId', '');
    const record = this.metadataRequests.get(requestId);
    if (!record) return { ok: true, cancelled: false, requestId, providerId: this.id };
    record.cancelRequested = true;
    if (record.threadId.length === 0) {
      return { ok: true, cancelled: true, deferred: true, requestId, providerId: this.id };
    }
    const cleanup = await this.cleanupMetadataRequest(requestId, readString(payload, 'reason', 'cancelled'), record);
    return Object.assign({}, cleanup, { cancelled: true, providerId: this.id });
  }

  buildDescriptor(status, runtimeMode, interactive, health, capabilityStatus) {
    return {
      id: this.id,
      displayName: this.displayName,
      status,
      description: this.description,
      endpoint: this.command,
      runtimeMode,
      capabilitySource: 'runtime',
      capabilityStatus,
      lastDiscoveredAt: Date.now(),
      discoveryWarnings: capabilityStatus === 'degraded' ? [health] : [],
      discoveryErrors: capabilityStatus === 'degraded' ? [health] : [],
      capabilities: {
        streaming: true,
        tools: true,
        previews: false,
        permissions: true,
        history: true,
        interactiveSessions: interactive,
        modelSelection: true,
        speedProfiles: false,
        workspaceAware: true,
        nativeProxy: false,
        events: true,
        requests: true,
        plans: true,
        questions: true,
        shell: true,
        commands: true,
        usageEvents: this.runtimePreference !== 'exec' && this.runtimeConfigError.length === 0,
        metadataGeneration: this.runtimePreference !== 'exec' && this.runtimeConfigError.length === 0,
        health
      },
      models: [{ id: 'configured', displayName: 'Configured Model', vendor: 'codex', isDefault: true, contextWindow: 0 }],
      speedModes: [{ id: 'auto', displayName: 'Auto', description: 'Use Codex configured defaults.', isDefault: true }],
      reasoningModes: [{ id: 'auto', displayName: 'Auto', description: 'Use Codex configured reasoning.', isDefault: true }],
      interactionModes: [
        { id: 'goal', displayName: 'Goal', description: 'Run the prompt as an implementation request.', isDefault: true, category: 'run' },
        { id: 'plan', displayName: 'Plan', description: 'Draft an implementation plan first.', isDefault: false, category: 'run' }
      ],
      tools: [{ id: 'codex.app-server', displayName: 'Codex App Server', description: 'Runs a Codex thread through App Server.', risk: 'write' }],
      sessionFeatures: {
        list: true,
        import: true,
        resume: interactive,
        attach: interactive,
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
      }
    };
  }

  async createSession(payload) {
    if (this.runtimeConfigError.length > 0) {
      throw new Error(this.runtimeConfigError);
    }
    if (this.runtimePreference === 'exec') {
      return this.createExecSession(payload, 'Codex runtime is explicitly configured to exec.');
    }
    try {
      await this.transport.start();
      const params = {};
      const cwd = readString(payload, 'workspacePath', readString(payload, 'cwd', ''));
      const model = readString(payload, 'modelId', '');
      if (cwd.length > 0) {
        params.cwd = cwd;
      }
      if (model.length > 0 && model !== 'configured') {
        params.model = model;
      }
      const result = await this.transport.request('thread/start', params);
      const thread = threadFromResult(result);
      if (!thread) {
        throw new Error('Codex thread/start response did not include a thread id.');
      }
      return this.rememberThread(thread.id, payload, 'ready');
    } catch (error) {
      if (this.runtimePreference === 'auto') {
        return this.createExecSession(payload, error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  createExecSession(payload, reason) {
    const session = this.execProvider.createSession(payload);
    session.runtimeMode = 'oneshot';
    session.interactiveReady = false;
    session.sessionState = 'oneshot';
    session.runtimeFallbackReason = reason;
    session.codexRuntime = 'exec';
    this.sessions.set(session.sessionId, session);
    this.messages.set(session.sessionId, []);
    return session;
  }

  rememberThread(threadId, payload, state) {
    const sessionId = 'codex:' + threadId;
    const requestedWorkspacePath = readString(payload, 'workspacePath', readString(payload, 'cwd', ''));
    const workspacePath = requestedWorkspacePath.length > 0 ? requestedWorkspacePath : process.cwd();
    const now = Date.now();
    const existing = this.sessions.get(sessionId);
    const session = existing || {
      sessionId,
      remoteSessionId: threadId,
      providerId: this.id,
      title: readString(payload, 'workspaceTitle', path.basename(workspacePath) || 'Codex Session'),
      workspacePath,
      workspaceTitle: readString(payload, 'workspaceTitle', path.basename(workspacePath)),
      branchName: 'main',
      modelId: readString(payload, 'modelId', 'configured'),
      speedMode: readString(payload, 'speedMode', 'auto'),
      reasoningMode: readString(payload, 'reasoningMode', 'auto'),
      interactionMode: '',
      messageCount: 0,
      source: this.id,
      createdAt: now
    };
    session.status = 'ready';
    session.runtimeMode = 'service';
    session.interactiveReady = true;
    session.sessionState = state;
    session.activeTurnId = '';
    session.lastError = '';
    session.runtimeFallbackReason = '';
    session.codexRuntime = 'app-server';
    session.transportGeneration = this.transport.generation || 0;
    session.discoveredFromCatalog = false;
    session.updatedAt = now;
    this.sessions.set(sessionId, session);
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, []);
    }
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async primeExecHistory() {
    try {
      return await this.execProvider.listSessions();
    } catch (_error) {
      return [];
    }
  }

  materializePersistedSession(persisted, codexRuntime) {
    const session = {
      sessionId: persisted.sessionId,
      remoteSessionId: persisted.remoteSessionId,
      providerId: this.id,
      title: persisted.title,
      workspacePath: persisted.workspacePath,
      workspaceTitle: persisted.workspaceTitle,
      branchName: persisted.branchName,
      modelId: persisted.modelId,
      speedMode: persisted.speedMode,
      reasoningMode: persisted.reasoningMode,
      interactionMode: persisted.interactionMode,
      messageCount: persisted.messageCount,
      status: persisted.status,
      source: this.id,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      runtimeMode: codexRuntime === 'exec' ? 'oneshot' : 'service',
      interactiveReady: false,
      sessionState: codexRuntime === 'exec' ? 'oneshot' : 'not_loaded',
      activeTurnId: '',
      lastError: '',
      runtimeFallbackReason: '',
      codexRuntime,
      transportGeneration: 0,
      discoveredFromCatalog: true
    };
    this.sessions.set(session.sessionId, session);
    if (!this.messages.has(session.sessionId)) {
      this.messages.set(session.sessionId, []);
    }
    return session;
  }

  sessionFromListedThread(thread, persisted) {
    const threadId = readString(thread, 'id', '');
    if (threadId.length === 0) {
      return null;
    }
    const sessionId = 'codex:' + threadId;
    const existing = this.sessions.get(sessionId) || null;
    const workspacePath = readString(thread, 'cwd', persisted ? persisted.workspacePath : '');
    const workspaceTitle = workspacePath.length > 0 ? path.basename(workspacePath) :
      (persisted ? persisted.workspaceTitle : '');
    const explicitName = normalizedThreadTitle(readString(thread, 'name', ''));
    const persistedTitle = persisted ? normalizedThreadTitle(persisted.title) : '';
    const previewTitle = normalizedThreadTitle(readString(thread, 'preview', ''));
    const title = explicitName.length > 0 ? explicitName :
      (persistedTitle.length > 0 && persistedTitle !== 'Codex Session' ? persistedTitle :
        (previewTitle.length > 0 ? previewTitle : (workspaceTitle.length > 0 ? workspaceTitle : 'Codex Session')));
    const gitInfo = readObject(thread, 'gitInfo');
    const branchName = gitInfo ? readString(gitInfo, 'branch', persisted ? persisted.branchName : 'main') :
      (persisted ? persisted.branchName : 'main');
    const now = Date.now();
    const createdAt = normalizeEpochMilliseconds(readNumber(thread, 'createdAt', 0), persisted ? persisted.createdAt : now);
    const updatedAt = normalizeEpochMilliseconds(readNumber(thread, 'updatedAt', 0), persisted ? persisted.updatedAt : createdAt);
    if (existing && existing.discoveredFromCatalog !== true) {
      existing.title = title;
      existing.workspacePath = workspacePath;
      existing.workspaceTitle = workspaceTitle;
      existing.branchName = branchName;
      existing.updatedAt = Math.max(existing.updatedAt || 0, updatedAt);
      return existing;
    }
    const session = {
      sessionId,
      remoteSessionId: threadId,
      providerId: this.id,
      title,
      workspacePath,
      workspaceTitle,
      branchName,
      modelId: persisted && persisted.modelId.length > 0 ? persisted.modelId : 'configured',
      speedMode: persisted && persisted.speedMode.length > 0 ? persisted.speedMode : 'auto',
      reasoningMode: persisted && persisted.reasoningMode.length > 0 ? persisted.reasoningMode : 'auto',
      interactionMode: persisted ? persisted.interactionMode : '',
      messageCount: persisted ? persisted.messageCount : 0,
      status: threadStatus(thread),
      source: this.id,
      createdAt,
      updatedAt,
      runtimeMode: 'service',
      interactiveReady: false,
      sessionState: 'not_loaded',
      activeTurnId: '',
      lastError: '',
      runtimeFallbackReason: '',
      codexRuntime: 'app-server',
      transportGeneration: this.transport.generation || 0,
      discoveredFromCatalog: true
    };
    this.sessions.set(sessionId, session);
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, []);
    }
    return session;
  }

  async loadSessionCatalog() {
    const persistedSessions = await this.primeExecHistory();
    const persistedById = new Map();
    for (const session of persistedSessions) {
      if (session && typeof session.sessionId === 'string' && session.sessionId.length > 0) {
        persistedById.set(session.sessionId, session);
      }
    }
    if (this.runtimePreference === 'exec') {
      return persistedSessions.map((session) => this.materializePersistedSession(session, 'exec'));
    }
    const sessions = [];
    let cursor = '';
    const seenCursors = new Set();
    try {
      await this.transport.start();
      do {
        const params = {
          archived: false,
          limit: CODEX_THREAD_LIST_PAGE_SIZE,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          sourceKinds: CODEX_THREAD_LIST_SOURCE_KINDS
        };
        if (cursor.length > 0) {
          params.cursor = cursor;
        }
        const result = await this.transport.request('thread/list', params);
        const threads = readArray(result, 'data');
        for (const thread of threads) {
          if (sessions.length >= CODEX_THREAD_LIST_MAX_SESSIONS) {
            break;
          }
          const threadId = readString(thread, 'id', '');
          const persisted = persistedById.get('codex:' + threadId) || null;
          const session = this.sessionFromListedThread(thread, persisted);
          if (session) {
            sessions.push(session);
          }
        }
        const nextCursor = readString(result, 'nextCursor', '');
        if (nextCursor.length === 0 || nextCursor === cursor || seenCursors.has(nextCursor)) {
          cursor = '';
        } else {
          seenCursors.add(nextCursor);
          cursor = nextCursor;
        }
      } while (cursor.length > 0 && sessions.length < CODEX_THREAD_LIST_MAX_SESSIONS);
      return this.mergePersistedSessionsIntoCatalog(sessions, persistedSessions);
    } catch (_error) {
      return this.mergePersistedSessionsIntoCatalog([], persistedSessions);
    }
  }

  mergePersistedSessionsIntoCatalog(catalog, persistedSessions) {
    const merged = new Map();
    for (const session of catalog) {
      if (session && typeof session.sessionId === 'string' && session.sessionId.length > 0) {
        merged.set(session.sessionId, session);
      }
    }
    for (const persisted of persistedSessions) {
      if (!persisted || typeof persisted.sessionId !== 'string' || persisted.sessionId.length === 0 ||
        merged.has(persisted.sessionId) || merged.size >= CODEX_THREAD_LIST_MAX_SESSIONS) {
        continue;
      }
      const persistedRuntime = readString(persisted, 'codexRuntime', '');
      const codexRuntime = persistedRuntime === 'exec' || persistedRuntime === 'app-server'
        ? persistedRuntime
        : (readString(persisted, 'runtimeMode', '') === 'oneshot' ? 'exec' : 'app-server');
      const session = this.materializePersistedSession(persisted, codexRuntime);
      merged.set(session.sessionId, session);
    }
    const sessions = Array.from(merged.values());
    sessions.sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    return sessions;
  }

  mergeCurrentSessionsIntoCatalog(catalog) {
    const merged = new Map();
    for (const session of catalog) {
      merged.set(session.sessionId, session);
    }
    for (const session of this.sessions.values()) {
      if (session.status === 'archived' || session.sessionState === 'archived') {
        continue;
      }
      if (session.discoveredFromCatalog !== true || merged.has(session.sessionId)) {
        merged.set(session.sessionId, session);
      }
    }
    const sessions = Array.from(merged.values());
    sessions.sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    return sessions;
  }

  messagesFromThread(sessionId, thread) {
    const messages = [];
    const turns = readArray(thread, 'turns');
    let sequence = 0;
    for (const turn of turns) {
      const items = readArray(turn, 'items');
      let reasoningText = '';
      const turnCreatedAt = normalizeEpochMilliseconds(
        readNumber(turn, 'startedAt', readNumber(turn, 'completedAt', 0)),
        Date.now()
      );
      for (const item of items) {
        const type = itemType(item);
        if (type === 'reasoning') {
          const summary = readArray(item, 'summary');
          const fragments = [];
          for (const part of summary) {
            const text = readString(part, 'text', typeof part === 'string' ? part : '');
            if (text.length > 0) {
              fragments.push(text);
            }
          }
          reasoningText = fragments.join('\n\n');
          continue;
        }
        let role = '';
        let text = '';
        if (type === 'userMessage') {
          role = 'user';
          text = textFromUserMessageContent(item.content);
          reasoningText = '';
        } else if (type === 'agentMessage') {
          role = 'assistant';
          text = readString(item, 'text', '');
        }
        if (role.length === 0 || text.trim().length === 0) {
          continue;
        }
        sequence += 1;
        const messageId = itemId(item);
        messages.push({
          id: sessionId + ':thread:' + messageId,
          sessionId,
          role,
          title: '',
          text,
          createdAt: turnCreatedAt + sequence,
          reasoningText: role === 'assistant' ? reasoningText : '',
          messageId,
          agentName: ''
        });
        if (role === 'assistant') {
          reasoningText = '';
        }
      }
    }
    return messages;
  }

  async listSessions() {
    if (this.sessionListPromise) {
      return await this.sessionListPromise;
    }
    if (Date.now() - this.sessionListCachedAt < CODEX_THREAD_LIST_CACHE_MS) {
      return this.mergeCurrentSessionsIntoCatalog(this.sessionListCache);
    }
    this.sessionListPromise = this.loadSessionCatalog();
    try {
      const sessions = await this.sessionListPromise;
      this.sessionListCache = sessions;
      this.sessionListCachedAt = Date.now();
      return this.mergeCurrentSessionsIntoCatalog(sessions);
    } finally {
      this.sessionListPromise = null;
    }
  }

  async listMessages(sessionId) {
    const session = this.getSession(sessionId);
    if (session && session.codexRuntime === 'exec') {
      return await this.execProvider.listMessages(sessionId);
    }
    const cached = this.messages.get(sessionId) || [];
    if (cached.length > 0) {
      return cached;
    }
    if (session && session.remoteSessionId.length > 0) {
      try {
        await this.transport.start();
        const result = await this.transport.request('thread/read', {
          threadId: session.remoteSessionId,
          includeTurns: true
        });
        const thread = threadFromResult(result);
        if (thread) {
          const messages = this.messagesFromThread(sessionId, thread);
          this.messages.set(sessionId, messages);
          return messages;
        }
      } catch (_error) {
        // The persisted rollout parser below keeps history available across protocol versions.
      }
    }
    await this.primeExecHistory();
    return await this.execProvider.listMessages(sessionId);
  }

  async listToolCalls(sessionId) {
    const session = this.getSession(sessionId);
    if (session && session.codexRuntime === 'exec' && typeof this.execProvider.listToolCalls === 'function') {
      return await this.execProvider.listToolCalls(sessionId);
    }
    await this.primeExecHistory();
    if (typeof this.execProvider.listToolCalls !== 'function') {
      return [];
    }
    return await this.execProvider.listToolCalls(sessionId);
  }

  async attachSession(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const existing = this.getSession(sessionId);
    if (existing && existing.codexRuntime === 'exec') {
      return this.sessionRuntimeDiagnostics(sessionId);
    }
    const threadId = readString(payload, 'remoteSessionId', sessionId.startsWith('codex:') ? sessionId.substring(6) : '');
    if (threadId.length === 0) {
      throw new Error('Codex thread id is required for attach.');
    }
    await this.transport.start();
    await this.transport.request('thread/resume', { threadId });
    const session = this.rememberThread(threadId, payload, 'idle');
    this.emitEvent(makeEvent(EventType.SESSION_UPDATED, session.sessionId, { session }), emit);
    return this.sessionRuntimeDiagnostics(session.sessionId);
  }

  async sendMessage(payload, emit) {
    let session = this.getSession(readString(payload, 'sessionId', ''));
    if (!session && readString(payload, 'remoteSessionId', '').length > 0) {
      await this.attachSession(payload, emit);
      session = this.getSession(readString(payload, 'sessionId', ''));
    }
    if (!session) {
      throw new Error('Session not found: ' + readString(payload, 'sessionId', ''));
    }
    if (session.codexRuntime === 'exec') {
      return await this.execProvider.sendMessage(payload, emit);
    }
    await this.transport.start();
    if (session.transportGeneration !== (this.transport.generation || 0) || !session.interactiveReady) {
      await this.transport.request('thread/resume', { threadId: session.remoteSessionId });
      session.transportGeneration = this.transport.generation || 0;
      session.interactiveReady = true;
      session.sessionState = 'idle';
      session.lastError = '';
    }
    const rawText = readString(payload, 'text', '');
    const interactionMode = readString(payload, 'interactionMode', readArray(payload, 'interactionModes').includes('plan') ? 'plan' : 'goal');
    const text = interactionMode === 'plan' ? PLAN_PREFIX + '\n\n' + rawText : rawText;
    const params = {
      threadId: session.remoteSessionId,
      input: [{ type: 'text', text }]
    };
    const cwd = readString(payload, 'workspacePath', readString(payload, 'cwd', ''));
    const model = readString(payload, 'modelId', '');
    if (cwd.length > 0) {
      params.cwd = cwd;
    }
    if (model.length > 0 && model !== 'configured') {
      params.model = model;
    }
    session.status = 'running';
    session.sessionState = 'running';
    session.interactionMode = interactionMode;
    session.messageCount += 1;
    session.updatedAt = Date.now();
    this.appendMessage(session, 'user', rawText, '');
    this.emitEvent(makeEvent(EventType.SESSION_UPDATED, session.sessionId, { session }), emit);
    this.compactionNotificationCompletions = 0;
    this.compactionItemCompletions = 0;
    return await new Promise((resolve, reject) => {
      const waiter = {
        sessionId: session.sessionId,
        threadId: session.remoteSessionId,
        emit,
        resolve,
        reject,
        output: '',
        completed: false,
        turnId: '',
        latestUsage: null
      };
      this.startingTurns.set(session.remoteSessionId, waiter);
      this.transport.request('turn/start', params).then((result) => {
        const turn = turnFromResult(result);
        if (!turn) {
          throw new Error('Codex turn/start response did not include a turn id.');
        }
        waiter.turnId = turn.id;
        session.activeTurnId = turn.id;
        this.startingTurns.delete(session.remoteSessionId);
        if (!waiter.completed) {
          this.turnWaiters.set(turn.id, waiter);
        }
      }).catch((error) => {
        this.startingTurns.delete(session.remoteSessionId);
        this.finishTurnFailure(waiter.turnId, waiter, error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  appendMessage(session, role, text, reasoningText) {
    const history = this.messages.get(session.sessionId) || [];
    history.push({
      id: session.sessionId + ':' + role + ':' + String(history.length + 1),
      sessionId: session.sessionId,
      role,
      title: '',
      text,
      reasoningText,
      createdAt: Date.now()
    });
    this.messages.set(session.sessionId, history);
  }

  sessionForThread(threadId) {
    if (threadId.length === 0) {
      return null;
    }
    const direct = this.getSession('codex:' + threadId);
    if (direct && direct.remoteSessionId === threadId) {
      return direct;
    }
    for (const session of this.sessions.values()) {
      if (session.remoteSessionId === threadId) {
        return session;
      }
    }
    return null;
  }

  emitCompactionUsage(threadId, turnId, directEmit, details) {
    const session = this.sessionForThread(threadId);
    if (!session) {
      return false;
    }
    const eventId = 'codex:' + threadId + ':compaction:' + compactionIdentity(turnId, details);
    if (this.emittedCompactionIds.has(eventId)) {
      return false;
    }
    this.emittedCompactionIds.add(eventId);
    while (this.emittedCompactionIds.size > MAX_EMITTED_COMPACTION_IDS) {
      const oldest = this.emittedCompactionIds.values().next().value;
      this.emittedCompactionIds.delete(oldest);
    }
    const usage = {
      eventId,
      source: 'provider',
      kind: 'compaction',
      estimated: false,
      window: 'session',
      occurredAt: normalizeCodexTimestamp(details, null),
      turnId: turnId.length > 0 ? turnId : undefined,
      reason: readString(details, 'reason', 'context_compacted')
    };
    const beforeTokens = readNumber(details, 'beforeTokens', -1);
    const afterTokens = readNumber(details, 'afterTokens', -1);
    if (beforeTokens >= 0) {
      usage.beforeTokens = beforeTokens;
    }
    if (afterTokens >= 0) {
      usage.afterTokens = afterTokens;
    }
    this.emitEvent(makeEvent(EventType.USAGE_UPDATED, session.sessionId, { usage }), directEmit);
    return true;
  }

  compactionKey(threadId, turnId) {
    return threadId + '|' + (turnId || 'unknown');
  }

  flushPendingCompaction(threadId, turnId, waiter) {
    const key = this.compactionKey(threadId, turnId);
    const pending = this.pendingCompactions.get(key);
    if (!pending) return;
    this.pendingCompactions.delete(key);
    if (pending.kind === 'notification') {
      this.emitCompactionUsage(threadId, turnId, waiter ? waiter.emit : null, pending.details);
    }
  }

  handleCompactionCompletion(method, threadId, turnId, waiter, item, details) {
    const directEmit = waiter ? waiter.emit : null;
    const key = this.compactionKey(threadId, turnId);
    const pending = this.pendingCompactions.get(key);
    if (method === 'thread/compacted') {
      if (pending && pending.kind === 'item') {
        this.pendingCompactions.delete(key);
        return;
      }
      this.pendingCompactions.set(key, { kind: 'notification', details: details || {} });
      return;
    }
    if (method === 'item/completed') {
      if (pending && pending.kind === 'notification') {
        this.pendingCompactions.delete(key);
        const combinedDetails = Object.assign({}, pending.details || {}, details || {}, item || {});
        this.emitCompactionUsage(threadId, turnId, directEmit, combinedDetails);
      } else {
        this.emitCompactionUsage(threadId, turnId, directEmit, Object.assign({}, details || {}, item || {}));
        this.pendingCompactions.set(key, { kind: 'item', details: details || {} });
      }
    }
  }

  handleNotification(message) {
    const params = message && message.params && typeof message.params === 'object' ? message.params : {};
    const threadId = readString(params, 'threadId', '');
    const turnId = readString(params, 'turnId', params.turn && typeof params.turn.id === 'string' ? params.turn.id : '');
    let waiter = turnId.length > 0 ? this.turnWaiters.get(turnId) : null;
    if (!waiter && threadId.length > 0) {
      waiter = this.startingTurns.get(threadId) || null;
      if (waiter && turnId.length > 0) {
        waiter.turnId = turnId;
      }
    }
    if (message.method === 'thread/tokenUsage/updated' || message.method === 'thread/token_usage/updated') {
      const usage = normalizeCodexUsage(params, threadId, turnId);
      if (usage && threadId.length > 0) {
        this.latestUsageByThread.set(threadId, usage);
        if (waiter) {
          waiter.latestUsage = usage;
        }
      }
      return;
    }
    if (message.method === 'thread/compacted') {
      this.handleCompactionCompletion(message.method, threadId, turnId, waiter, null, params);
      return;
    }
    const notificationItem = params.item && typeof params.item === 'object' ? params.item : {};
    if ((message.method === 'item/started' || message.method === 'item/completed') &&
      itemType(notificationItem) === 'contextCompaction') {
      if (message.method === 'item/completed') {
        this.handleCompactionCompletion(message.method, threadId, turnId, waiter, notificationItem, params);
      }
      return;
    }
    if (message.method === 'item/agentMessage/delta' && waiter) {
      const delta = readString(params, 'delta', '');
      waiter.output += delta;
      this.emitEvent(makeEvent(EventType.MESSAGE_DELTA, waiter.sessionId, { role: 'assistant', text: delta, contentKind: 'text' }), waiter.emit);
      return;
    }
    if ((message.method === 'item/started' || message.method === 'item/completed') && waiter) {
      const item = params.item || {};
      const type = itemType(item);
      if (type === 'agentMessage') {
        if (message.method === 'item/completed' && waiter.output.length === 0) {
          waiter.output = itemText(item);
        }
        return;
      }
      const eventType = message.method === 'item/started' ? EventType.TOOL_STARTED : EventType.TOOL_COMPLETED;
      const payload = {
        toolCallId: itemId(item),
        name: type,
        status: message.method === 'item/started' ? 'running' : readString(item, 'status', 'completed'),
        input: item,
        outputText: itemText(item)
      };
      this.emitEvent(makeEvent(eventType, waiter.sessionId, payload), waiter.emit);
      return;
    }
    if (message.method === 'turn/completed') {
      this.flushPendingCompaction(threadId, turnId, waiter);
      if (!waiter || waiter.completed) return;
      waiter.completed = true;
      const session = this.getSession(waiter.sessionId);
      const turn = params.turn || {};
      const status = readString(turn, 'status', 'completed');
      if (status === 'failed') {
        const error = new Error(readString(turn.error, 'message', 'Codex turn failed.'));
        this.finishTurnFailure(turnId, waiter, error);
        return;
      }
      if (session) {
        session.status = 'ready';
        session.sessionState = status === 'interrupted' ? 'interrupted' : 'idle';
        session.activeTurnId = '';
        session.updatedAt = Date.now();
        if (waiter.output.length > 0) {
          this.appendMessage(session, 'assistant', waiter.output, '');
        }
      }
      const completedPayload = { role: 'assistant', text: waiter.output, contentKind: 'text', status };
      const usage = waiter.latestUsage || this.latestUsageByThread.get(threadId) || normalizeCodexUsage(turn, threadId, turnId);
      if (usage) {
        completedPayload.usage = usage;
      }
      const completedUsage = usage;
      this.emitEvent(makeEvent(EventType.MESSAGE_COMPLETED, waiter.sessionId, completedPayload), waiter.emit);
      this.turnWaiters.delete(turnId);
      this.startingTurns.delete(threadId);
      this.latestUsageByThread.delete(threadId);
      waiter.resolve({ status, text: waiter.output, turnId, usage: completedUsage });
      return;
    }
    if (message.method === 'error' && waiter) {
      const errorMessage = readString(params.error, 'message', readString(params, 'message', 'Codex App Server error.'));
      if (params.willRetry === true) {
        this.emitEvent(makeEvent(EventType.ERROR, waiter.sessionId, {
          code: 'codex_turn_retrying',
          message: errorMessage,
          willRetry: true
        }), waiter.emit);
        return;
      }
      this.finishTurnFailure(turnId, waiter, new Error(errorMessage));
    }
  }

  finishTurnFailure(turnId, waiter, error) {
    const session = this.getSession(waiter.sessionId);
    if (session) {
      session.status = 'ready';
      session.sessionState = 'failed';
      session.activeTurnId = '';
      session.lastError = error.message;
      session.updatedAt = Date.now();
    }
    this.emitEvent(makeEvent(EventType.ERROR, waiter.sessionId, { code: 'codex_turn_failed', message: error.message }), waiter.emit);
    this.emitEvent(makeEvent(EventType.TOOL_COMPLETED, waiter.sessionId, { toolCallId: 'codex_turn', status: 'failed', errorText: error.message }), waiter.emit);
    this.turnWaiters.delete(turnId);
    this.startingTurns.delete(waiter.threadId || '');
    waiter.reject(error);
  }

  handleServerRequest(message) {
    const params = message.params && typeof message.params === 'object' ? message.params : {};
    const threadId = readString(params, 'threadId', '');
    const sessionId = threadId.length > 0 ? 'codex:' + threadId : '';
    const requestId = String(message.id);
    const pending = { requestId: message.id, method: message.method, sessionId, params };
    if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') {
      this.pendingInteractions.set(requestId, pending);
      this.emitEvent(makeEvent(EventType.PERMISSION_REQUESTED, sessionId, {
        providerId: this.id,
        requestId,
        permissionId: requestId,
        title: message.method === 'item/fileChange/requestApproval' ? 'Approve file changes' : 'Approve command execution',
        prompt: itemText(params),
        rawJson: JSON.stringify(params)
      }));
      return;
    }
    if (message.method === 'item/tool/requestUserInput') {
      const questions = Array.isArray(params.questions) ? params.questions : [];
      pending.answers = {};
      pending.remainingQuestionIds = [];
      const effectiveQuestions = questions.length > 0 ? questions : [{ id: 'question', header: 'Codex question', question: '', options: [] }];
      for (let index = 0; index < effectiveQuestions.length; index++) {
        const question = effectiveQuestions[index];
        const questionId = readString(question, 'id', 'question_' + String(index + 1));
        const bridgeRequestId = requestId + ':' + questionId;
        pending.remainingQuestionIds.push(questionId);
        this.pendingInteractions.set(bridgeRequestId, pending);
        this.emitEvent(makeEvent(EventType.QUESTION_REQUESTED, sessionId, {
          providerId: this.id,
          requestId: bridgeRequestId,
          questionId,
          title: readString(question, 'header', 'Codex question'),
          prompt: readString(question, 'question', ''),
          options: Array.isArray(question.options) ? question.options : [],
          rawJson: JSON.stringify(params)
        }));
      }
      return;
    }
    this.transport.rejectServerRequest(message.id, -32601, 'Method not supported by NGF Agent Bridge: ' + message.method);
  }

  async respondPermission(payload) {
    const requestId = readString(payload, 'requestId', readString(payload, 'permissionId', ''));
    const pending = this.pendingInteractions.get(requestId);
    if (!pending) {
      throw new Error('Codex permission request not found: ' + requestId);
    }
    const reply = readString(payload, 'reply', readString(payload, 'response', 'once')).toLowerCase();
    const fileRequest = pending.method === 'item/fileChange/requestApproval';
    let decision = fileRequest ? 'accept' : 'approved';
    if (reply === 'always' || reply === 'session' || reply === 'approved_for_session') {
      decision = fileRequest ? 'acceptForSession' : 'approved_for_session';
    } else if (reply === 'reject' || reply === 'denied' || reply === 'decline') {
      decision = fileRequest ? 'decline' : 'denied';
    }
    this.transport.respondServerRequest(pending.requestId, { decision });
    this.pendingInteractions.delete(requestId);
    return { status: decision, requestId, continued: decision !== 'denied' && decision !== 'decline' };
  }

  async respondRequest(payload) {
    const requestId = readString(payload, 'requestId', '');
    const pending = this.pendingInteractions.get(requestId);
    if (!pending || pending.method !== 'item/tool/requestUserInput') {
      throw new Error('Codex user-input request not found: ' + requestId);
    }
    const questionId = readString(payload, 'questionId', '');
    const answer = readString(payload, 'answer', readString(payload, 'message', readString(payload, 'optionId', '')));
    const separator = requestId.lastIndexOf(':');
    const requestQuestionId = separator >= 0 ? requestId.substring(separator + 1) : '';
    const effectiveQuestionId = questionId.length > 0 ? questionId : (requestQuestionId.length > 0 ? requestQuestionId : 'question');
    pending.answers[effectiveQuestionId] = { answers: answer.length > 0 ? [answer] : [] };
    this.pendingInteractions.delete(requestId);
    const remaining = [];
    for (const item of pending.remainingQuestionIds) {
      if (!Object.prototype.hasOwnProperty.call(pending.answers, item)) {
        remaining.push(item);
      }
    }
    if (remaining.length > 0) {
      return { status: 'partial', requestId, questionId: effectiveQuestionId, remainingQuestionIds: remaining, continued: false };
    }
    this.transport.respondServerRequest(pending.requestId, { answers: pending.answers });
    for (const item of pending.remainingQuestionIds) {
      this.pendingInteractions.delete(String(pending.requestId) + ':' + item);
    }
    return { status: 'answered', requestId, questionId: effectiveQuestionId, continued: true };
  }

  async abortSession(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const session = this.getSession(sessionId);
    if (!session) {
      return { status: 'idle', providerId: this.id, sessionId, terminated: false };
    }
    if (session.codexRuntime === 'exec') {
      return await this.execProvider.abortSession(payload, emit);
    }
    if (session.activeTurnId.length > 0) {
      await this.transport.request('turn/interrupt', { threadId: session.remoteSessionId, turnId: session.activeTurnId });
      return { status: 'aborted', providerId: this.id, sessionId, remoteSessionId: session.remoteSessionId, terminated: true, runtimeMode: 'service' };
    }
    return { status: 'idle', providerId: this.id, sessionId, remoteSessionId: session.remoteSessionId, terminated: false, runtimeMode: 'service' };
  }

  async archiveSession(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const session = this.getSession(sessionId);
    if (!session) {
      return { status: 'archived', providerId: this.id, sessionId, archived: true };
    }
    if (session.codexRuntime === 'exec') {
      const result = await this.execProvider.abortSession(payload, emit);
      this.sessions.delete(sessionId);
      return Object.assign({}, result, { archived: true });
    }
    if (session.activeTurnId.length > 0) {
      await this.transport.request('turn/interrupt', { threadId: session.remoteSessionId, turnId: session.activeTurnId });
    }
    await this.transport.request('thread/archive', { threadId: session.remoteSessionId });
    session.status = 'archived';
    session.sessionState = 'archived';
    session.interactiveReady = false;
    return { status: 'archived', providerId: this.id, sessionId, remoteSessionId: session.remoteSessionId, archived: true, runtimeMode: 'service' };
  }

  async shutdown(reason) {
    if (this.execProvider && typeof this.execProvider.shutdown === 'function') {
      await this.execProvider.shutdown(reason);
    }
    this.transport.stop();
    return { status: 'completed', reason: reason || '' };
  }

  sessionRuntimeDiagnostics(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { providerId: this.id, sessionId, remoteSessionId: '', runtimeMode: 'service', interactiveReady: false, sessionState: 'detached', pid: this.transport.pid || 0, startedAt: this.transport.startedAt || 0, lastActivityAt: this.transport.lastActivityAt || 0, exitCode: null, lastError: this.transport.lastError || '', recentOutputTail: '', runtimeFallbackReason: '' };
    }
    if (session.codexRuntime === 'exec') {
      const diagnostics = this.execProvider.sessionRuntimeDiagnostics(sessionId);
      diagnostics.runtimeFallbackReason = session.runtimeFallbackReason || '';
      return diagnostics;
    }
    return { providerId: this.id, sessionId, remoteSessionId: session.remoteSessionId, runtimeMode: 'service', interactiveReady: session.interactiveReady === true, sessionState: session.sessionState, pid: this.transport.pid || 0, startedAt: this.transport.startedAt || 0, lastActivityAt: this.transport.lastActivityAt || session.updatedAt, exitCode: null, lastError: session.lastError || '', recentOutputTail: '', runtimeFallbackReason: '' };
  }

  subscribeEvents(subscriberId, emit) {
    this.subscribers.set(subscriberId, emit);
    return () => this.subscribers.delete(subscriberId);
  }

  emitEvent(event, directEmit) {
    if (typeof directEmit === 'function') {
      directEmit(event);
      return;
    }
    for (const subscriber of this.subscribers.values()) {
      subscriber(event);
    }
  }

  handleTransportExit(error) {
    for (const session of this.sessions.values()) {
      if (session.codexRuntime !== 'app-server' || session.sessionState === 'archived') {
        continue;
      }
      session.interactiveReady = false;
      session.sessionState = session.activeTurnId.length > 0 ? 'failed' : 'disconnected';
      session.lastError = error.message;
    }
    for (const [turnId, waiter] of this.turnWaiters.entries()) {
      this.finishTurnFailure(turnId, waiter, error);
    }
    for (const waiter of this.startingTurns.values()) {
      this.finishTurnFailure(waiter.turnId, waiter, error);
    }
    this.startingTurns.clear();
    this.pendingInteractions.clear();
    this.compactionNotificationCompletions = 0;
    this.compactionItemCompletions = 0;
    this.pendingCompactions.clear();
  }
}

function createCodexAppServerProvider(config) {
  return new CodexAppServerProvider(config || {});
}

module.exports = {
  CodexAppServerProvider,
  createCodexAppServerProvider,
  normalizeCodexUsage,
  normalizeCodexTimestamp,
  normalizeMetadataSuggestion,
  normalizeMetadataResult
};
