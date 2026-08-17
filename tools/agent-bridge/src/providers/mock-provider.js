'use strict';

const crypto = require('crypto');
const { EventType, makeEvent, readString } = require('../protocol');

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSessionId() {
  return 'ses_' + crypto.randomBytes(8).toString('hex');
}

function buildMockModels() {
  return [
    {
      id: 'mock-fast',
      displayName: 'Mock Fast',
      vendor: 'mock',
      isDefault: true,
      contextWindow: 32000
    },
    {
      id: 'mock-deep',
      displayName: 'Mock Deep',
      vendor: 'mock',
      isDefault: false,
      contextWindow: 128000
    }
  ];
}

function buildSpeedModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Provider default latency and reasoning budget.',
      isDefault: true
    },
    {
      id: 'fast',
      displayName: 'Fast',
      description: 'Prefer short responses and lower latency.',
      isDefault: false
    },
    {
      id: 'deep',
      displayName: 'Deep',
      description: 'Prefer longer reasoning and richer tool context.',
      isDefault: false
    }
  ];
}

function buildReasoningModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Mock provider default reasoning.',
      isDefault: true
    },
    {
      id: 'low',
      displayName: 'Low',
      description: 'Shorter mock reasoning latency.',
      isDefault: false
    },
    {
      id: 'medium',
      displayName: 'Medium',
      description: 'Balanced mock reasoning latency.',
      isDefault: false
    },
    {
      id: 'high',
      displayName: 'High',
      description: 'Longer mock reasoning latency.',
      isDefault: false
    }
  ];
}

function buildTools() {
  return [
    {
      id: 'mock.context',
      displayName: 'Context Loader',
      description: 'Loads a simulated workspace context.',
      risk: 'read'
    },
    {
      id: 'mock.preview',
      displayName: 'Preview Reader',
      description: 'Returns simulated file preview content.',
      risk: 'read'
    }
  ];
}

class MockProvider {
  constructor() {
    this.id = 'mock';
    this.supportsInteractiveSessions = true;
    this.usageEventsAvailable = true;
    this.sessions = new Map();
    this.messages = new Map();
    this.metadataRequests = new Map();
  }

  describe() {
    return {
      id: this.id,
      displayName: 'Mock Agent',
      status: 'available',
      description: 'Local protocol test provider.',
      capabilities: {
        streaming: true,
        tools: true,
        previews: true,
        permissions: true,
        history: true,
        interactiveSessions: true,
        modelSelection: true,
        speedProfiles: true,
        workspaceAware: true,
        usageEvents: true,
        metadataGeneration: true
      },
      models: buildMockModels(),
      speedModes: buildSpeedModes(),
      reasoningModes: buildReasoningModes(),
      tools: buildTools(),
      sessionFeatures: {
        list: true,
        import: true,
        resume: true,
        interactive: true,
        checkpointRestore: true
      }
    };
  }

  createSession(payload) {
    const sessionId = createSessionId();
    return this.ensureSession(Object.assign({}, payload || {}, { sessionId }));
  }

  ensureSession(payload) {
    const sessionId = readString(payload, 'sessionId', '');
    if (sessionId.length === 0) {
      return null;
    }
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const remoteSessionId = readString(payload, 'remoteSessionId', sessionId);
    const workspacePath = readString(payload, 'workspacePath', '');
    const workspaceTitle = readString(payload, 'workspaceTitle', '');
    const modelId = readString(payload, 'modelId', 'mock-fast');
    const speedMode = readString(payload, 'speedMode', 'auto');
    const reasoningMode = readString(payload, 'reasoningMode', 'auto');
    const now = Date.now();
    const session = {
      sessionId,
      providerId: this.id,
      remoteSessionId: remoteSessionId.length > 0 ? remoteSessionId : sessionId,
      title: workspaceTitle.length > 0 ? workspaceTitle : (workspacePath.length > 0 ? 'Mock: ' + workspacePath : 'Mock Session'),
      workspacePath,
      workspaceTitle,
      branchName: 'main',
      modelId,
      speedMode,
      reasoningMode,
      messageCount: 0,
      status: 'ready',
      source: 'mock',
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(sessionId, session);
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, []);
    }
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async generateMetadataResult(payload) {
    const delayMs = Number.parseInt(process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS || '0', 10);
    const source = payload && typeof payload === 'object' ? payload : {};
    const requestId = readString(source, 'metadataRequestId', '');
    const request = { cancelled: false, timer: null, reject: null };
    if (requestId.length > 0) this.metadataRequests.set(requestId, request);
    try {
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise((resolve, reject) => {
          request.timer = setTimeout(resolve, Math.min(delayMs, 120000));
          request.reject = reject;
        });
      }
      if (request.cancelled) {
        const error = new Error('Metadata generation was cancelled.');
        error.code = 'metadata_cancelled';
        throw error;
      }
      const kind = readString(source, 'kind', 'sessionTitle');
      const prompt = readString(source, 'prompt', '').trim();
      const suggestion = prompt.length > 0 ? prompt : 'Mock metadata ' + kind;
      const result = {
        suggestion,
        alternatives: ['Mock alternative ' + kind],
        warnings: [],
        estimatedUsage: true
      };
      if (process.env.AGENT_BRIDGE_MOCK_METADATA_USAGE === '1') {
        result.usage = {
          eventId: 'mock:metadata:' + readString(source, 'sessionId', 'session') + ':' + kind,
          inputTokens: 4,
          outputTokens: 3,
          totalTokens: 7,
          cost: 0.02,
          currency: 'USD',
          estimated: false,
          occurredAt: new Date().toISOString()
        };
        result.estimatedUsage = false;
      }
      return result;
    } finally {
      if (request.timer) clearTimeout(request.timer);
      request.timer = null;
      request.reject = null;
      if (requestId.length > 0 && this.metadataRequests.get(requestId) === request) {
        this.metadataRequests.delete(requestId);
      }
    }
  }

  cancelMetadata(payload) {
    const requestId = readString(payload, 'requestId', '');
    const request = this.metadataRequests.get(requestId);
    if (!request) return { ok: true, cancelled: false, requestId, providerId: this.id };
    request.cancelled = true;
    if (request.timer) clearTimeout(request.timer);
    request.timer = null;
    if (typeof request.reject === 'function') {
      const error = new Error('Metadata generation was cancelled.');
      error.code = 'metadata_cancelled';
      request.reject(error);
    }
    request.reject = null;
    return { ok: true, cancelled: true, requestId, providerId: this.id };
  }

  async generateMetadata(payload) {
    const result = await this.generateMetadataResult(payload);
    return result.suggestion;
  }

  async listSessions() {
    return Array.from(this.sessions.values());
  }

  async listMessages(sessionId) {
    return this.messages.get(sessionId) || [];
  }

  async sendMessage(payload, emit) {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const text = typeof payload.text === 'string' ? payload.text : '';
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }

    session.status = 'running';
    session.updatedAt = Date.now();
    session.messageCount = session.messageCount + 1;
    const history = this.messages.get(sessionId) || [];
    const now = Date.now();
    history.push({
      id: sessionId + ':user:' + String(history.length + 1),
      sessionId,
      role: 'user',
      text,
      title: '',
      createdAt: now
    });
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));

    emit(makeEvent(EventType.TOOL_STARTED, sessionId, {
      toolCallId: 'tool_mock_context',
      name: 'mock.context',
      input: {
        workspacePath: session.workspacePath,
        modelId: session.modelId,
        speedMode: session.speedMode
      }
    }));
    await wait(session.speedMode === 'fast' ? 30 : 80);
    emit(makeEvent(EventType.TOOL_OUTPUT, sessionId, {
      toolCallId: 'tool_mock_context',
      text: 'Loaded mock workspace context.'
    }));
    await wait(session.speedMode === 'fast' ? 30 : 80);
    emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
      toolCallId: 'tool_mock_context',
      exitCode: 0
    }));

    const prefix = 'Mock provider received: ';
    const chunks = [prefix, text.length > 0 ? text : '(empty message)', '\nBridge protocol is ready.'];
    let assistantText = '';
    for (const chunk of chunks) {
      assistantText = assistantText + chunk;
      await wait(session.speedMode === 'fast' ? 40 : 100);
      emit(makeEvent(EventType.MESSAGE_DELTA, sessionId, {
        role: 'assistant',
        text: chunk,
        contentKind: 'text',
        messageId: sessionId + ':assistant:stream',
        partId: sessionId + ':assistant:part'
      }));
    }
    history.push({
      id: sessionId + ':assistant:' + String(history.length + 1),
      sessionId,
      role: 'assistant',
      text: assistantText,
      title: '',
      createdAt: Date.now()
    });
    this.messages.set(sessionId, history);

    session.status = 'ready';
    session.updatedAt = Date.now();
    emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
      role: 'assistant',
      contentKind: 'text',
      messageId: sessionId + ':assistant:stream'
    }));
    if (process.env.AGENT_BRIDGE_MOCK_USAGE_EVENTS === '1') {
      const usageSequence = String(session.messageCount);
      const usagePrefix = sessionId + ':mock-usage:' + usageSequence;
      const quotaResetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      emit(makeEvent(EventType.USAGE_UPDATED, sessionId, {
        usage: {
          eventId: usagePrefix + ':actual',
          providerId: this.id,
          source: 'mock-provider',
          estimated: false,
          kind: 'usage',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cost: 0.15,
          currency: 'USD',
          quotaRemaining: 90,
          quotaLimit: 100,
          quotaResetAt,
          quotaSource: 'mock-provider',
          window: 'session',
          occurredAt: new Date().toISOString()
        }
      }));
      emit(makeEvent(EventType.USAGE_UPDATED, sessionId, {
        usage: {
          eventId: usagePrefix + ':estimated',
          providerId: this.id,
          source: 'mock-provider',
          estimated: true,
          kind: 'usage',
          totalTokens: 20,
          occurredAt: new Date().toISOString()
        }
      }));
      emit(makeEvent(EventType.USAGE_UPDATED, sessionId, {
        usage: {
          eventId: usagePrefix + ':compaction',
          providerId: this.id,
          source: 'mock-provider',
          estimated: false,
          kind: 'compaction',
          beforeTokens: 200,
          afterTokens: 80,
          reason: 'automatic',
          window: 'session',
          occurredAt: new Date().toISOString()
        }
      }));
    }
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
  }

  async captureRuntimeCheckpoint(payload) {
    const sessionId = readString(payload, 'sessionId', '');
    if (!this.getSession(sessionId)) {
      throw new Error('Session not found: ' + sessionId);
    }
    const messages = this.messages.get(sessionId) || [];
    return {
      status: 'captured',
      kind: 'mock-message-count',
      token: { messageCount: messages.length },
      reason: ''
    };
  }

  async restoreRuntimeCheckpoint(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const session = this.getSession(sessionId);
    const token = payload && payload.runtimeToken && typeof payload.runtimeToken === 'object' ? payload.runtimeToken : null;
    if (!session || !token || typeof token.messageCount !== 'number') {
      throw new Error('Mock runtime checkpoint token is invalid.');
    }
    const history = this.messages.get(sessionId) || [];
    this.messages.set(sessionId, history.slice(0, Math.max(0, Math.floor(token.messageCount))));
    session.messageCount = Math.floor(this.messages.get(sessionId).length / 2);
    session.updatedAt = Date.now();
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
    }
    return { status: 'restored', restored: true, reason: '', sessionId };
  }

  getPreview(payload) {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const path = typeof payload.path === 'string' ? payload.path : '';
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    return {
      sessionId,
      path,
      mediaType: 'text/plain',
      content: 'Mock preview for ' + (path.length > 0 ? path : '(no path)') + '\nProvider: mock\n'
    };
  }

  async respondPermission(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const requestId = readString(payload, 'requestId', readString(payload, 'permissionId', ''));
    const permissionId = readString(payload, 'permissionId', requestId);
    const reply = readString(payload, 'reply', 'once');
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.PERMISSION_REQUESTED, sessionId, {
        providerId: this.id,
        requestId,
        permissionId,
        status: reply === 'reject' ? 'rejected' : 'allowed',
        reply
      }));
    }
    return {
      providerId: this.id,
      requestId,
      permissionId,
      reply,
      status: reply === 'reject' ? 'rejected' : 'allowed'
    };
  }

  async respondRequest(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const requestId = readString(payload, 'requestId', '');
    const optionId = readString(payload, 'optionId', '');
    const answer = readString(payload, 'answer', readString(payload, 'message', ''));
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.QUESTION_REQUESTED, sessionId, {
        providerId: this.id,
        requestId,
        optionId,
        answer,
        status: optionId === 'dismissed' ? 'dismissed' : 'answered'
      }));
    }
    return {
      providerId: this.id,
      requestId,
      optionId,
      answer,
      status: optionId === 'dismissed' ? 'dismissed' : 'answered'
    };
  }

  async respondPlan(payload, emit) {
    const sessionId = readString(payload, 'sessionId', '');
    const planId = readString(payload, 'planId', readString(payload, 'requestId', ''));
    const reply = readString(payload, 'reply', 'implement');
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.PLAN_UPDATED, sessionId, {
        providerId: this.id,
        planId,
        status: reply === 'reject' ? 'rejected' : 'implementing',
        reply
      }));
    }
    return {
      providerId: this.id,
      planId,
      reply,
      status: reply === 'reject' ? 'rejected' : 'implementing'
    };
  }
}

module.exports = {
  MockProvider
};
