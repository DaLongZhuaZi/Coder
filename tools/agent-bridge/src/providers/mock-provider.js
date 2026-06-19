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
    this.sessions = new Map();
    this.messages = new Map();
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
        modelSelection: true,
        speedProfiles: true,
        workspaceAware: true
      },
      models: buildMockModels(),
      speedModes: buildSpeedModes(),
      reasoningModes: buildReasoningModes(),
      tools: buildTools(),
      sessionFeatures: {
        list: true,
        import: true,
        resume: true
      }
    };
  }

  createSession(payload) {
    const sessionId = createSessionId();
    const workspacePath = readString(payload, 'workspacePath', '');
    const workspaceTitle = readString(payload, 'workspaceTitle', '');
    const modelId = readString(payload, 'modelId', 'mock-fast');
    const speedMode = readString(payload, 'speedMode', 'auto');
    const reasoningMode = readString(payload, 'reasoningMode', 'auto');
    const now = Date.now();
    const session = {
      sessionId,
      providerId: this.id,
      remoteSessionId: sessionId,
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
    this.messages.set(sessionId, []);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
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
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
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
}

module.exports = {
  MockProvider
};
