'use strict';

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    if (!provider || typeof provider.id !== 'string' || provider.id.length === 0) {
      throw new Error('Provider id is required');
    }
    this.providers.set(provider.id, provider);
  }

  async listCapabilities() {
    const tasks = [];
    for (const provider of this.providers.values()) {
      tasks.push(provider.describe());
    }
    return await Promise.all(tasks);
  }

  resolve(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error('Provider not found: ' + providerId);
    }
    return provider;
  }

  findSession(sessionId) {
    for (const provider of this.providers.values()) {
      if (typeof provider.getSession === 'function') {
        const session = provider.getSession(sessionId);
        if (session) {
          return { provider, session };
        }
      }
    }
    return null;
  }

  async listSessions(providerId) {
    const tasks = [];
    for (const provider of this.providers.values()) {
      if (providerId && provider.id !== providerId) {
        continue;
      }
      tasks.push(provider.listSessions());
    }
    const sessionGroups = await Promise.all(tasks);
    const sessions = [];
    for (const providerSessions of sessionGroups) {
      for (const session of providerSessions) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async listSessionMessages(sessionId) {
    const match = this.findSession(sessionId);
    if (!match) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (typeof match.provider.listMessages !== 'function') {
      return [];
    }
    return await match.provider.listMessages(sessionId);
  }

  async listSessionToolCalls(sessionId) {
    const match = this.findSession(sessionId);
    if (!match) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (typeof match.provider.listToolCalls !== 'function') {
      return [];
    }
    return await match.provider.listToolCalls(sessionId);
  }

  async revertSession(payload, emit) {
    const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const match = this.findSession(sessionId);
    if (!match) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (typeof match.provider.revertSession !== 'function') {
      throw new Error('Provider does not support session revert: ' + match.provider.id);
    }
    return await match.provider.revertSession(payload, emit);
  }

  async abortSession(payload, emit) {
    const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const remoteSessionId = payload && typeof payload.remoteSessionId === 'string' ? payload.remoteSessionId : '';
    const providerId = payload && typeof payload.providerId === 'string' ? payload.providerId : '';
    const match = sessionId.length > 0 ? this.findSession(sessionId) : null;
    let provider = match ? match.provider : null;
    if (!provider && providerId.length > 0) {
      provider = this.resolve(providerId);
    }
    if (!provider) {
      throw new Error('Provider not found for abort request: ' + (providerId.length > 0 ? providerId : sessionId));
    }
    if (typeof provider.abortSession === 'function') {
      return await provider.abortSession(payload, emit);
    }
    if (typeof provider.proxyOpenCodeRequest === 'function') {
      const effectiveRemoteSessionId = remoteSessionId.length > 0 ? remoteSessionId : sessionId;
      if (effectiveRemoteSessionId.length === 0) {
        throw new Error('Session id is required for abort request: ' + provider.id);
      }
      return await provider.proxyOpenCodeRequest({
        providerId: provider.id,
        method: 'POST',
        path: '/session/' + encodeURIComponent(effectiveRemoteSessionId) + '/abort',
        query: {},
        body: null,
        accept: 'application/json'
      });
    }
    return {
      status: 'unsupported',
      providerId: provider.id,
      sessionId,
      remoteSessionId,
      terminated: false
    };
  }

  subscribeEvents(subscriberId, emit) {
    const cleanup = [];
    for (const provider of this.providers.values()) {
      if (typeof provider.subscribeEvents === 'function') {
        cleanup.push(provider.subscribeEvents(provider.id + ':' + subscriberId, emit));
      }
    }
    return () => {
      for (const close of cleanup) {
        if (typeof close === 'function') {
          close();
        }
      }
    };
  }

  async respondPermission(payload, emit) {
    const provider = this.resolveProviderForInteraction(payload, 'opencode');
    if (typeof provider.respondPermission !== 'function') {
      throw new Error('Provider does not support permission responses: ' + provider.id);
    }
    return await provider.respondPermission(payload, emit);
  }

  async respondRequest(payload, emit) {
    const provider = this.resolveProviderForInteraction(payload, 'opencode');
    if (typeof provider.respondRequest !== 'function') {
      throw new Error('Provider does not support request responses: ' + provider.id);
    }
    return await provider.respondRequest(payload, emit);
  }

  async respondPlan(payload, emit) {
    const provider = this.resolveProviderForInteraction(payload, 'codex');
    if (typeof provider.respondPlan !== 'function') {
      throw new Error('Provider does not support plan responses: ' + provider.id);
    }
    return await provider.respondPlan(payload, emit);
  }

  resolveProviderForInteraction(payload, fallbackProviderId) {
    const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const providerId = payload && typeof payload.providerId === 'string' ? payload.providerId : '';
    let provider = null;
    if (sessionId.length > 0) {
      const match = this.findSession(sessionId);
      if (match) {
        provider = match.provider;
      }
    }
    if (!provider && providerId.length > 0) {
      provider = this.resolve(providerId);
    }
    if (!provider) {
      provider = this.resolve(fallbackProviderId);
    }
    return provider;
  }

  async proxyOpenCodeRequest(payload) {
    const providerId = payload && typeof payload.providerId === 'string' && payload.providerId.length > 0 ? payload.providerId : 'opencode';
    const provider = this.resolve(providerId);
    if (typeof provider.proxyOpenCodeRequest !== 'function') {
      throw new Error('Provider does not support OpenCode-compatible native requests: ' + providerId);
    }
    return await provider.proxyOpenCodeRequest(payload);
  }
}

module.exports = {
  ProviderRegistry
};
