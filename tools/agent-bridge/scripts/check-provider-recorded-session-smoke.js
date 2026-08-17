'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const fixture = require('./provider-recorded-session-fixture.json');
const { UsageManager } = require('../src/agent-experience-manager');
const { normalizeMetadataResult: normalizeBridgeMetadataResult } = require('../src/metadata-scope');
const {
  CodexAppServerProvider,
  normalizeCodexUsage,
  normalizeMetadataResult: normalizeCodexMetadataResult
} = require('../src/providers/codex-app-server-provider');
const {
  normalizeOpenCodeUsagePart,
  normalizeOpenCodeCompactionPart
} = require('../src/providers/opencode-provider');
const { normalizeGatewayUsage } = require('../src/providers/gateway-provider');
const { normalizeProviderUsage, providerUsageQuotaEvents } = require('../src/provider-usage-service');

const SCOPE = {
  hostProfileId: 'recorded-host',
  sessionId: 'recorded-session',
  agentId: 'recorded-agent'
};

class MemoryUsageStore {
  constructor() {
    this.value = null;
  }

  readUsageState() {
    return this.value === null ? null : JSON.parse(JSON.stringify(this.value));
  }

  writeUsageState(value) {
    this.value = JSON.parse(JSON.stringify(value));
  }
}

function withScope(event, providerId) {
  return Object.assign({}, event, SCOPE, { providerId });
}

function usageEvents(events) {
  return events.filter((event) => event && event.event === 'usage.updated' && event.payload && event.payload.usage)
    .map((event) => event.payload.usage);
}

function createCodexFixtureProvider(events) {
  const transport = new EventEmitter();
  transport.generation = 1;
  transport.start = async () => {};
  transport.stop = () => {};
  transport.request = async () => ({});
  const provider = new CodexAppServerProvider({
    command: process.execPath,
    runtime: 'app-server',
    commandAvailable: async () => true,
    transport
  });
  const remoteThreadId = fixture.codex.threadId;
  provider.sessions.set('codex:' + remoteThreadId, {
    sessionId: 'codex:' + remoteThreadId,
    remoteSessionId: remoteThreadId,
    codexRuntime: 'app-server',
    sessionState: 'idle',
    activeTurnId: '',
    updatedAt: Date.now()
  });
  provider.subscribeEvents('recorded-session-smoke', (event) => events.push(event));
  return provider;
}

function replayCodexCompactions(provider) {
  for (const compaction of fixture.codex.compactions) {
    if (compaction.itemFirst) provider.handleNotification(compaction.itemFirst);
    if (compaction.notificationSecond) provider.handleNotification(compaction.notificationSecond);
    if (compaction.notificationFirst) provider.handleNotification(compaction.notificationFirst);
    if (compaction.itemSecond) provider.handleNotification(compaction.itemSecond);
    if (compaction.notificationOnly) provider.handleNotification(compaction.notificationOnly);
    if (compaction.turnCompleted) provider.handleNotification(compaction.turnCompleted);
  }
}

function replayCodex(provider, events) {
  for (const record of fixture.codex.usage) {
    const normalized = normalizeCodexUsage(record.params, fixture.codex.threadId, record.turnId);
    assert(normalized, 'recorded Codex usage should normalize');
    events.push({ providerId: 'codex', usage: normalized });
  }
  replayCodexCompactions(provider);
}

function replayServiceUsage(manager, events) {
  for (const item of events) {
    manager.record(withScope(item.usage, item.providerId), null);
  }
}

function main() {
  assert.strictEqual(fixture.fixtureVersion, 1);
  const providerEvents = [];
  const codexProvider = createCodexFixtureProvider(providerEvents);
  const normalizedEvents = [];
  replayCodex(codexProvider, normalizedEvents);
  const codexCompactions = usageEvents(providerEvents);
  assert.strictEqual(codexCompactions.length, 3, 'Codex notification/item pair must produce one event per compaction');
  assert.strictEqual(codexCompactions[0].reason, 'automatic');
  assert.strictEqual(codexCompactions[0].beforeTokens, 24500);
  assert.strictEqual(codexCompactions[1].reason, 'manual');
  assert.strictEqual(codexCompactions[1].beforeTokens, 28000);
  assert.strictEqual(codexCompactions[1].occurredAt, '2026-06-08T00:45:00.000Z');
  assert.strictEqual(codexCompactions[2].reason, 'context_compacted');
  assert.strictEqual(codexCompactions[2].occurredAt, '2026-06-08T01:00:00.000Z');
  const compactionIds = codexCompactions.map((event) => event.eventId);
  replayCodexCompactions(codexProvider);
  const replayedCompactions = usageEvents(providerEvents);
  assert.strictEqual(replayedCompactions.length, 3, 'replaying the same Codex compactions must not emit duplicate events');
  assert.deepStrictEqual(replayedCompactions.map((event) => event.eventId), compactionIds, 'Codex compaction event ids must remain stable across replay');
  const reconnectEvents = [];
  const reconnectedCodexProvider = createCodexFixtureProvider(reconnectEvents);
  replayCodexCompactions(reconnectedCodexProvider);
  const reconnectedCompactions = usageEvents(reconnectEvents);
  assert.strictEqual(reconnectedCompactions.length, 3, 'a recreated Codex provider must replay each recorded compaction once');
  assert.deepStrictEqual(reconnectedCompactions.map((event) => event.eventId), compactionIds, 'Codex compaction event ids must remain stable across provider recreation');
  for (const event of codexCompactions) normalizedEvents.push({ providerId: 'codex', usage: event });

  const openCodeUsage = normalizeOpenCodeUsagePart(fixture.opencode.parts[0], fixture.opencode.sessionId, 'opencode:recorded-step-001');
  const openCodeCompaction = normalizeOpenCodeCompactionPart(fixture.opencode.parts[1], fixture.opencode.sessionId, 'opencode:recorded-opencode-compaction');
  assert(openCodeUsage && openCodeCompaction, 'OpenCode recorded parts should normalize');
  normalizedEvents.push({ providerId: 'opencode', usage: openCodeUsage });
  normalizedEvents.push({ providerId: 'opencode', usage: openCodeCompaction });
  assert.strictEqual(openCodeCompaction.reason, 'auto');
  assert.strictEqual(openCodeCompaction.beforeTokens, 31000);

  for (const response of fixture.gateway.responses) {
    const eventId = 'gateway:' + response.response.id;
    const usage = normalizeGatewayUsage(response, fixture.gateway.remoteSessionId, eventId);
    assert(usage, 'Gateway recorded response should normalize');
    normalizedEvents.push({ providerId: 'openclaw-gateway', usage });
  }

  const initialQuota = normalizeProviderUsage('codex', Object.assign({}, fixture.quota.initial, SCOPE));
  const resetQuota = normalizeProviderUsage('codex', Object.assign({}, fixture.quota.afterReset, SCOPE));
  const initialQuotaEvents = providerUsageQuotaEvents(initialQuota, Object.assign({}, SCOPE, { providerId: 'codex' }));
  const resetQuotaEvents = providerUsageQuotaEvents(resetQuota, Object.assign({}, SCOPE, { providerId: 'codex' }));
  assert.strictEqual(initialQuotaEvents.length, 2);
  assert.strictEqual(resetQuotaEvents.length, 2);
  for (const event of initialQuotaEvents) normalizedEvents.push({ providerId: 'codex', usage: event });
  for (const event of resetQuotaEvents) normalizedEvents.push({ providerId: 'codex', usage: event });
  for (const event of initialQuotaEvents) normalizedEvents.push({ providerId: 'codex', usage: event });

  for (const metadata of fixture.metadata) {
    const providerResult = normalizeCodexMetadataResult(metadata.kind, JSON.stringify(metadata));
    assert.strictEqual(providerResult.suggestion, metadata.suggestion);
    const bridgeResult = normalizeBridgeMetadataResult(metadata.kind, metadata);
    assert.strictEqual(bridgeResult.ok, true);
    assert.strictEqual(bridgeResult.alternatives.length, 1);
    assert(bridgeResult.usage, 'recorded metadata usage should remain available');
    normalizedEvents.push({ providerId: 'codex', usage: bridgeResult.usage });
  }

  const store = new MemoryUsageStore();
  const firstManager = new UsageManager(store);
  replayServiceUsage(firstManager, normalizedEvents);
  const firstSummary = firstManager.summary(SCOPE);
  assert(firstSummary.summary.eventCount >= normalizedEvents.length - initialQuotaEvents.length, 'initial recording must persist events');
  assert.strictEqual(firstSummary.summary.compactions, 4, 'Codex and OpenCode compactions should persist');
  const dailyQuota = firstSummary.summary.quotas.find((item) => item.window === 'daily');
  assert(dailyQuota, 'daily quota snapshot should be present');
  assert.strictEqual(dailyQuota.remaining, 1000, 'latest quota reset snapshot must win over late older data');
  assert.strictEqual(dailyQuota.resetAt, '2026-06-10T00:00:00.000Z');

  const restoredManager = new UsageManager(store);
  const restoredSummary = restoredManager.summary(SCOPE);
  assert.strictEqual(restoredSummary.summary.eventCount, firstSummary.summary.eventCount, 'usage state must survive manager reconstruction');
  assert.strictEqual(restoredSummary.summary.compactions, 4);
  assert.strictEqual(restoredSummary.summary.quotas.find((item) => item.window === 'daily').remaining, 1000);
  restoredManager.record(withScope(codexCompactions[0], 'codex'), null);
  assert.strictEqual(restoredManager.summary(SCOPE).summary.compactions, 4, 'replayed compaction must remain idempotent after reconnect');
  codexProvider.transport.stop();
  reconnectedCodexProvider.transport.stop();
  console.log('provider recorded session smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
