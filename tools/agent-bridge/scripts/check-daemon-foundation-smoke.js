'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');
const { ProviderCatalog } = require('../src/provider-catalog');
const { EventType, makeEvent } = require('../src/protocol');
const { setTlsPreference, tlsStatus } = require('../src/security-audit');
const { WorkspaceRegistry } = require('../src/workspace-registry');

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-agent-bridge-smoke-'));
  try {
    const store = createDaemonStore(tempRoot);
    const sameStore = createDaemonStore(tempRoot);
    assert(store.serverId === sameStore.serverId, 'server id should persist');
    assert(fs.existsSync(path.join(tempRoot, 'config.json')), 'config.json should be created');

    const workspaceRegistry = new WorkspaceRegistry(store);
    const agentManager = new AgentManager({ store, workspaceRegistry });
    const session = {
      sessionId: 'mock:session-1',
      remoteSessionId: 'session-1',
      providerId: 'mock',
      title: 'Smoke Agent',
      workspacePath: tempRoot,
      workspaceTitle: 'Smoke Workspace',
      modelId: 'mock-fast',
      speedMode: 'auto',
      status: 'ready'
    };
    const agent = agentManager.upsertFromSession(session, {
      providerId: 'mock',
      workspacePath: tempRoot,
      workspaceTitle: 'Smoke Workspace'
    });
    assert(agent.id.length > 0, 'agent id should be generated');
    assert(agent.workspaceId.indexOf('wks_') === 0, 'workspace id should be opaque');

    agentManager.appendUserMessage(session.sessionId, { text: 'hello' });
    agentManager.observeBridgeEvent(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
      role: 'assistant',
      text: 'world'
    }));
    const page = agentManager.fetchTimeline({
      agentId: agent.id,
      cursor: '',
      direction: 'after',
      limit: 10
    });
    assert(page.items.length >= 3, 'timeline should include session, user, and assistant rows');
    assert(page.latestSeq >= page.items.length, 'latest sequence should advance');
    assert(!Object.prototype.hasOwnProperty.call(page.items[0], 'providerRaw'), 'provider raw should be hidden by default');
    const debugPage = agentManager.fetchTimeline({
      agentId: agent.id,
      cursor: '',
      direction: 'after',
      limit: 10,
      debugRaw: true
    });
    assert(Object.prototype.hasOwnProperty.call(debugPage.items[0], 'providerRaw'), 'debug timeline should include provider raw');

    const modeAgent = agentManager.setMode(agent.id, 'deep', 'high');
    assert(modeAgent.lastModeId === 'deep', 'mode should be persisted');
    const modelAgent = agentManager.setModel(agent.id, 'mock-deep');
    assert(modelAgent.modelId === 'mock-deep', 'model should be persisted');
    const stoppedAgent = agentManager.stop(agent.id, { status: 'ok' });
    assert(stoppedAgent.lastStatus === 'idle', 'stop should return agent to idle');
    const stoppedTimeline = agentManager.fetchTimeline({
      agentId: agent.id,
      cursor: '',
      direction: 'after',
      limit: 50
    });
    assert(hasTimelineEvent(stoppedTimeline.items, 'turn_canceled'), 'stop should append turn_canceled timeline item');
    const ack = agentManager.ackTimeline(agent.id, stoppedTimeline.latestSeq);
    assert(ack.latestSeq === stoppedTimeline.latestSeq, 'timeline ack should persist latest sequence');
    const resumedAgent = agentManager.resume(agent.id);
    assert(resumedAgent.lastStatus === 'idle', 'resume should keep agent usable');

    const sameCwdA = workspaceRegistry.upsertWorkspace({
      cwd: tempRoot,
      title: 'A',
      dedupeByCwd: false
    });
    const sameCwdB = workspaceRegistry.upsertWorkspace({
      cwd: tempRoot,
      title: 'B',
      dedupeByCwd: false
    });
    assert(sameCwdA.workspaceId !== sameCwdB.workspaceId, 'same cwd can own separate opaque workspaces');
    const suggestions = workspaceRegistry.listDirectorySuggestions({ limit: 8 });
    assert(suggestions.length > 0, 'workspace registry should return directory suggestions');
    const archivedWorkspace = workspaceRegistry.archiveWorkspace({
      workspaceId: sameCwdA.workspaceId
    });
    assert(archivedWorkspace.archivedAt, 'workspace archive should mark archivedAt');
    const activeWorkspaces = workspaceRegistry.listWorkspaces({});
    assert(!activeWorkspaces.some((item) => item.workspaceId === sameCwdA.workspaceId), 'archived workspace should be hidden by default');
    const allWorkspaces = workspaceRegistry.listWorkspaces({ includeArchived: true });
    assert(allWorkspaces.some((item) => item.workspaceId === sameCwdA.workspaceId), 'archived workspace should be available when requested');

    store.writeProviderProfiles([{
      profileId: 'profile-smoke',
      providerId: 'custom',
      displayName: 'Smoke Provider',
      endpoint: 'http://127.0.0.1:65530',
      binary: 'smoke-agent',
      args: '--json',
      cwd: tempRoot,
      env: {},
      kind: 'acp',
      sourcePath: path.join(tempRoot, 'acp-providers.json'),
      acp: {
        protocol: 'acp',
        catalogPath: path.join(tempRoot, 'acp-providers.json'),
        extends: 'acp'
      },
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }]);
    const providerProfiles = sameStore.readProviderProfiles();
    assert(providerProfiles.length === 1, 'provider profiles should persist');
    assert(providerProfiles[0].profileId === 'profile-smoke', 'provider profile id should round trip');
    assert(providerProfiles[0].kind === 'acp', 'provider profile kind should persist');

    store.writeTrustedDevices([{
      physicalDeviceId: 'physical-smoke',
      bridgeInstanceId: 'bridge-smoke',
      displayName: 'Smoke Device',
      platform: 'test',
      publicKeyFingerprint: 'fingerprint-smoke',
      trusted: true,
      trustedAt: new Date().toISOString(),
      revokedAt: '',
      updatedAt: new Date().toISOString()
    }]);
    const trustedDevices = sameStore.readTrustedDevices();
    assert(trustedDevices.length === 1, 'trusted devices should persist');
    assert(trustedDevices[0].trusted === true, 'trusted device should round trip');

    const nextConfig = store.writeConfig(Object.assign({}, store.config, {
      daemon: Object.assign({}, store.config.daemon, {
        autostart: {
          enabled: true,
          method: 'manual',
          configured: false,
          updatedAt: new Date().toISOString()
        }
      })
    }));
    assert(nextConfig.daemon.autostart.enabled === true, 'daemon autostart preference should persist');

    const tlsDisabled = tlsStatus(store);
    assert(tlsDisabled.enabled === false, 'TLS should be disabled by default');
    assert(tlsDisabled.active === false, 'TLS should be inactive by default');
    const tlsMissing = setTlsPreference(store, {
      enabled: true,
      certPath: path.join(tempRoot, 'missing-cert.pem'),
      keyPath: path.join(tempRoot, 'missing-key.pem'),
      port: 9443
    });
    assert(tlsMissing.enabled === true, 'TLS preference should persist enabled state');
    assert(tlsMissing.port === 9443, 'TLS preference should persist port');
    assert(tlsMissing.failureCategory === 'tls_material_missing', 'TLS status should classify missing certificate material');
    fs.writeFileSync(path.join(tempRoot, 'missing-cert.pem'), 'test certificate placeholder', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'missing-key.pem'), 'test key placeholder', 'utf8');
    const tlsActive = tlsStatus(store, {
      active: true,
      bindUrl: 'https://127.0.0.1:9443',
      startedAt: '2026-07-10T00:00:00.000Z',
      lastError: ''
    });
    assert(tlsActive.active === true, 'TLS runtime status should expose active listener state');
    assert(tlsActive.failureCategory === '', 'active TLS runtime should not expose failure category');

    const reloadedAgentManager = new AgentManager({ store: sameStore, workspaceRegistry });
    const persistedTimeline = reloadedAgentManager.fetchTimeline({
      agentId: agent.id,
      cursor: '',
      direction: 'after',
      limit: 50
    });
    assert(persistedTimeline.latestSeq >= stoppedTimeline.latestSeq, 'timeline should survive manager reload');

    const ledger = new ManagedProcessLedger(store);
    ledger.record({
      providerId: 'mock',
      kind: 'provider-helper',
      pid: process.pid,
      command: 'node',
      args: ['smoke'],
      cwd: tempRoot
    });
    const reconcileResult = ledger.reconcile();
    assert(reconcileResult.retained.length === 1, 'current process should be retained');

    const catalog = new ProviderCatalog({
      async listCapabilities() {
        return [{
          id: 'mock',
          status: 'available',
          models: [{ id: 'configured', displayName: 'Configured Model' }],
          tools: [{ id: 'mock.tool', displayName: 'Mock Tool', risk: 'read' }]
        }];
      }
    });
    const cold = await catalog.fetch({ scope: 'global', force: false });
    const warm = await catalog.fetch({ scope: 'global', force: false });
    const refreshed = await catalog.refresh({ scope: 'global' });
    assert(cold.cacheStatus === 'cold', 'first provider catalog read should be cold');
    assert(warm.cacheStatus === 'warm', 'second provider catalog read should be warm');
    assert(refreshed.cacheStatus === 'refreshed', 'provider catalog refresh should force probe');
    assert(cold.cacheTtlMs > 0, 'provider catalog should expose cache ttl');
    assert(cold.providers[0].capabilitySource === 'runtime', 'provider catalog should default runtime source');
    assert(cold.providers[0].capabilityStatus === 'ready', 'provider catalog should expose ready capability status');
    assert(cold.providers[0].models[0].source === 'runtime', 'provider model options should expose source');
    assert(cold.providers[0].tools[0].slashCommand === '/tool', 'provider tools should expose slash command metadata');

    const degradedCatalog = new ProviderCatalog({
      providers: new Map([
        ['good', {
          id: 'good',
          describe() {
            return {
              id: 'good',
              status: 'available',
              models: [{ id: 'configured', displayName: 'Configured Model' }]
            };
          }
        }],
        ['bad', {
          id: 'bad',
          displayName: 'Bad Provider',
          describe() {
            throw new Error('discovery exploded');
          }
        }]
      ])
    });
    const degraded = await degradedCatalog.fetch({ scope: 'global', force: true });
    assert(degraded.providers.length === 2, 'degraded catalog should keep healthy providers');
    assert(degraded.degradedProviders === 1, 'degraded catalog should count failed provider');
    assert(degraded.discoveryErrors.length === 1, 'degraded catalog should expose discovery errors');

    console.log('daemon foundation smoke passed');
  } finally {
    removeTempDirectory(tempRoot);
  }
}

function hasTimelineEvent(items, eventType) {
  for (const item of items) {
    if (item && item.eventType === eventType) {
      return true;
    }
  }
  return false;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function removeTempDirectory(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp + path.sep)) {
    throw new Error('refusing to remove path outside temp directory: ' + resolvedTarget);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
