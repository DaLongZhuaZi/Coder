'use strict';

const assert = require('assert');
const { OpenCodeProvider } = require('../src/providers/opencode-provider');

async function main() {
  const provider = new OpenCodeProvider({
    id: 'opencode-smoke',
    displayName: 'OpenCode Smoke',
    baseUrl: 'http://127.0.0.1:1',
    lightCapabilities: true
  });
  provider.checkHealth = async () => ({ available: true, detail: 'smoke' });
  const session = {
    sessionId: 'opencode-smoke:session-1',
    remoteSessionId: 'session-1',
    providerId: 'opencode-smoke',
    status: 'ready',
    updatedAt: Date.now()
  };
  provider.sessions.set(session.sessionId, session);

  const events = [];
  const emit = (event) => events.push(event);
  const usagePart = {
    sessionID: 'session-1',
    id: 'step-1',
    type: 'step-finish',
    tokens: {
      input: 12,
      output: 8,
      reasoning: 2,
      total: 22,
      cache: { read: 3, write: 4 }
    },
    cost: 0.25,
    currency: 'USD',
    time: { end: Date.now() }
  };
  provider.emitPartUpdate(usagePart, '', emit);
  provider.emitPartUpdate(usagePart, '', emit);

  const usageEvents = events.filter((event) => event.event === 'usage.updated');
  assert.strictEqual(usageEvents.length, 1);
  const usage = usageEvents[0].payload.usage;
  assert.strictEqual(usage.inputTokens, 12);
  assert.strictEqual(usage.outputTokens, 8);
  assert.strictEqual(usage.reasoningTokens, 2);
  assert.strictEqual(usage.cacheReadTokens, 3);
  assert.strictEqual(usage.cacheWriteTokens, 4);
  assert.strictEqual(usage.totalTokens, 22);
  assert.strictEqual(usage.cost, 0.25);
  assert.strictEqual(usage.currency, 'USD');
  assert.strictEqual(usage.estimated, false);
  assert.strictEqual(usage.window, 'session');
  assert.strictEqual(usage.threadId, 'session-1');
  assert.match(usage.occurredAt, /^20\d\d-/);

  const compactionPart = {
    sessionID: 'session-1',
    id: 'compact-1',
    type: 'compaction',
    auto: true,
    beforeTokens: 100,
    afterTokens: 40,
    time: { end: Date.now() }
  };
  provider.emitPartUpdate(compactionPart, '', emit);
  provider.emitPartUpdate(compactionPart, '', emit);

  const compactionEvents = events.filter((event) => event.event === 'usage.updated' && event.payload.usage.kind === 'compaction');
  assert.strictEqual(compactionEvents.length, 1);
  const compaction = compactionEvents[0].payload.usage;
  assert.strictEqual(compaction.reason, 'auto');
  assert.strictEqual(compaction.beforeTokens, 100);
  assert.strictEqual(compaction.afterTokens, 40);
  assert.strictEqual(compaction.estimated, false);
  assert.strictEqual(compaction.window, 'session');

  const descriptor = await provider.describe();
  assert.strictEqual(descriptor.capabilities.usageEvents, true);
  assert.strictEqual(descriptor.runtimeMode, 'service');
  console.log('opencode provider usage smoke ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
