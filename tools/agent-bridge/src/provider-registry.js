'use strict';

const { URL } = require('url');

const ENVIRONMENT_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;

function safeUsageEndpoint(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' && parsed.username.length === 0 && parsed.password.length === 0;
  } catch (_error) {
    return false;
  }
}

function configuredUsageEndpoint(provider) {
  if (!provider || typeof provider !== 'object') {
    return '';
  }
  const direct = typeof provider.usageEndpoint === 'string' ? provider.usageEndpoint.trim() : '';
  if (direct.length > 0) {
    return direct;
  }
  const environmentName = typeof provider.usageEndpointEnv === 'string' ? provider.usageEndpointEnv.trim() : '';
  if (ENVIRONMENT_NAME_PATTERN.test(environmentName) && typeof process.env[environmentName] === 'string') {
    return process.env[environmentName].trim();
  }
  const providerId = typeof provider.id === 'string' ? provider.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase() : '';
  const conventionalName = providerId.length > 0 ? 'AGENT_BRIDGE_' + providerId + '_USAGE_URL' : '';
  if (conventionalName.length > 0 && typeof process.env[conventionalName] === 'string') {
    return process.env[conventionalName].trim();
  }
  if (provider.id === 'codex' && typeof process.env.AGENT_BRIDGE_CODEX_USAGE_URL === 'string') {
    return process.env.AGENT_BRIDGE_CODEX_USAGE_URL.trim();
  }
  return '';
}

function providerUsageConfigured(provider) {
  if (!provider || typeof provider !== 'object') {
    return false;
  }
  if (provider.providerUsageAvailable === true && typeof provider.getUsage === 'function') {
    return true;
  }
  return safeUsageEndpoint(configuredUsageEndpoint(provider));
}

function providerRuntimeEnabled(provider) {
  if (!provider || typeof provider !== 'object') {
    return false;
  }
  if (typeof provider.runtimeConfigError === 'string' && provider.runtimeConfigError.length > 0) {
    return false;
  }
  return provider.runtimePreference !== 'exec';
}

function withProviderUsageCapability(provider, descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return descriptor;
  }
  const capabilities = descriptor.capabilities && typeof descriptor.capabilities === 'object' && !Array.isArray(descriptor.capabilities)
    ? Object.assign({}, descriptor.capabilities)
    : {};
  capabilities.providerUsage = providerUsageConfigured(provider);
  // Descriptor flags are protocol declarations, but the runtime object is the
  // authority for whether a capability can actually be serviced. Keep absent
  // legacy fields false and never expose a static true for a missing method.
  const metadataDeclared = capabilities.metadataGeneration === true;
  const metadataImplemented = typeof provider.generateMetadataResult === 'function' ||
    typeof provider.generateMetadata === 'function';
  capabilities.metadataGeneration = providerRuntimeEnabled(provider) && metadataDeclared && metadataImplemented;
  const usageDeclared = capabilities.usageEvents === true;
  capabilities.usageEvents = providerRuntimeEnabled(provider) && usageDeclared && provider.usageEventsAvailable === true;
  return Object.assign({}, descriptor, { capabilities });
}

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    // Cooldown for session ids confirmed missing after discovery.
    // Repeated queries for a vanished session must not re-trigger an
    // expensive provider-wide discovery (e.g. Codex CLI enumeration)
    // on every Web UI refresh cycle, which would stall the event loop.
    this.missingSessionCooldown = new Map();
    // Discovery is expensive (codex exec can take 15-30s); confirmed-missing
// sessions must not re-trigger it every refresh cycle. 5 minutes bounds the
// impact while still allowing genuine session creation to be discovered.
this.missingSessionCooldownMs = 300000;
  }

  register(provider) {
    if (!provider || typeof provider.id !== 'string' || provider.id.length === 0) {
      throw new Error('Provider id is required');
    }
    this.providers.set(provider.id, provider);
  }

  unregister(providerId) {
    if (typeof providerId !== 'string' || providerId.length === 0) {
      return false;
    }
    return this.providers.delete(providerId);
  }

  has(providerId) {
    return typeof providerId === 'string' && providerId.length > 0 && this.providers.has(providerId);
  }

  hasInteractiveSessions() {
    for (const provider of this.providers.values()) {
      if (!provider) {
        continue;
      }
      if (provider.supportsInteractiveSessions === true) {
        return true;
      }
      if (typeof provider.supportsInteractiveSession === 'function' && provider.supportsInteractiveSession()) {
        return true;
      }
    }
    return false;
  }

  hasUsageEvents() {
    for (const provider of this.providers.values()) {
      if (!providerRuntimeEnabled(provider) || provider.usageEventsAvailable !== true) {
        continue;
      }
      return true;
    }
    return false;
  }

  hasMetadataGeneration() {
    for (const provider of this.providers.values()) {
      if (!providerRuntimeEnabled(provider) || (typeof provider.generateMetadataResult !== 'function' &&
        typeof provider.generateMetadata !== 'function')) {
        continue;
      }
      return true;
    }
    return false;
  }

  async attachSession(payload, emit) {
    const provider = this.resolveProviderForSession(payload, 'interactive attach');
    if (typeof provider.attachSession === 'function') {
      return await provider.attachSession(payload, emit);
    }
    if (typeof provider.startInteractiveSession === 'function') {
      const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : '';
      return await provider.startInteractiveSession(sessionId, emit);
    }
    return this.sessionRuntimeDiagnostics(
      payload && typeof payload.sessionId === 'string' ? payload.sessionId : '',
      provider.id
    );
  }

  async archiveSession(payload, emit) {
    const provider = this.resolveProviderForSession(payload, 'archive');
    if (typeof provider.archiveSession === 'function') {
      return await provider.archiveSession(payload, emit);
    }
    return await this.abortSession(payload, emit);
  }

  async listCapabilities() {
    const tasks = [];
    for (const provider of this.providers.values()) {
      tasks.push(Promise.resolve(provider.describe()).then((descriptor) => withProviderUsageCapability(provider, descriptor)));
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

  async findSessionAfterDiscovery(sessionId) {
    const existing = this.findSession(sessionId);
    if (existing) {
      return existing;
    }
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      const lastMiss = this.missingSessionCooldown.get(sessionId);
      if (lastMiss !== undefined && Date.now() - lastMiss < this.missingSessionCooldownMs) {
        return null;
      }
    }
    const separatorIndex = typeof sessionId === 'string' ? sessionId.indexOf(':') : -1;
    const providerId = separatorIndex > 0 ? sessionId.substring(0, separatorIndex) : '';
    if (providerId.length > 0 && this.providers.has(providerId)) {
      const provider = this.providers.get(providerId);
      if (provider && typeof provider.listSessions === 'function') {
        await provider.listSessions();
      }
    } else {
      await this.listSessions('');
    }
    const found = this.findSession(sessionId);
    if (!found && typeof sessionId === 'string' && sessionId.length > 0) {
      this.missingSessionCooldown.set(sessionId, Date.now());
    }
    return found;
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
    const match = await this.findSessionAfterDiscovery(sessionId);
    if (!match) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (typeof match.provider.listMessages !== 'function') {
      return [];
    }
    return await match.provider.listMessages(sessionId);
  }

  async listSessionToolCalls(sessionId) {
    const match = await this.findSessionAfterDiscovery(sessionId);
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

  supportsRuntimeCheckpoint(providerId) {
    const provider = this.resolve(providerId);
    return typeof provider.captureRuntimeCheckpoint === 'function' && typeof provider.restoreRuntimeCheckpoint === 'function';
  }

  async captureRuntimeCheckpoint(payload) {
    const provider = this.resolveProviderForSession(payload, 'runtime checkpoint capture');
    if (typeof provider.captureRuntimeCheckpoint !== 'function' || typeof provider.restoreRuntimeCheckpoint !== 'function') {
      return { status: 'unsupported', kind: '', token: null, reason: 'provider_checkpoint_restore_unsupported' };
    }
    return await provider.captureRuntimeCheckpoint(payload);
  }

  async restoreRuntimeCheckpoint(payload, emit) {
    const provider = this.resolveProviderForSession(payload, 'runtime checkpoint restore');
    if (typeof provider.restoreRuntimeCheckpoint !== 'function') {
      return { status: 'unsupported', restored: false, reason: 'provider_checkpoint_restore_unsupported' };
    }
    return await provider.restoreRuntimeCheckpoint(payload, emit);
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

  sessionRuntimeDiagnostics(sessionId, providerId) {
    const match = sessionId && sessionId.length > 0 ? this.findSession(sessionId) : null;
    let provider = match ? match.provider : null;
    if (!provider && providerId && providerId.length > 0) {
      provider = this.resolve(providerId);
    }
    if (!provider) {
      return null;
    }
    if (typeof provider.sessionRuntimeDiagnostics === 'function') {
      return provider.sessionRuntimeDiagnostics(sessionId);
    }
    return {
      providerId: provider.id,
      sessionId,
      remoteSessionId: '',
      runtimeMode: 'unknown',
      interactiveReady: false,
      sessionState: sessionId && sessionId.length > 0 ? 'attached' : 'detached',
      pid: 0,
      startedAt: 0,
      lastActivityAt: 0,
      exitCode: null,
      lastError: '',
      recentOutputTail: '',
      runtimeFallbackReason: ''
    };
  }

  async startInteractiveSession(payload, emit) {
    return await this.attachSession(payload, emit);
  }

  resolveProviderForSession(payload, action) {
    const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const providerId = payload && typeof payload.providerId === 'string' ? payload.providerId : '';
    const match = sessionId.length > 0 ? this.findSession(sessionId) : null;
    if (match) {
      return match.provider;
    }
    if (providerId.length > 0) {
      return this.resolve(providerId);
    }
    throw new Error('Provider not found for ' + action + ': ' + sessionId);
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

  async shutdown(reason) {
    const results = [];
    for (const provider of this.providers.values()) {
      if (typeof provider.shutdown === 'function') {
        try {
          results.push({ providerId: provider.id, status: 'completed', result: await provider.shutdown(reason) });
        } catch (error) {
          results.push({ providerId: provider.id, status: 'failed', reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return { status: 'completed', results };
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
  ProviderRegistry,
  providerUsageConfigured,
  withProviderUsageCapability,
  safeUsageEndpoint,
  configuredUsageEndpoint
};
