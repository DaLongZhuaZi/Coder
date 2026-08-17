#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { UsageManager } = require('../src/agent-experience-manager');

function assertOptionalNumber(value, message) {
  assert.strictEqual(typeof value, 'number', message);
  assert.strictEqual(Number.isFinite(value), true, message);
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-usage-recovery-'));
  try {
    const store = createDaemonStore(home);
    const warnings = [];
    const warningSources = [];
    const first = new UsageManager(store, {
      onBudgetWarning: (warning, sourceConnection) => {
        warnings.push(warning);
        warningSources.push(sourceConnection);
      }
    });

    const budget = first.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      tokenLimit: 100,
      warningThreshold: 0.5
    });
    assert.strictEqual(budget.ok, true);
    assert.strictEqual(budget.budget.warningThreshold, 0.5);

    const actual = first.record({
      eventId: 'actual-1',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      agentId: 'agent-a',
      providerId: 'mock',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 3,
      cost: 0.25,
      currency: 'USD',
      occurredAt: '2026-08-08T02:00:00Z',
      quotaRemaining: 90,
      quotaLimit: 100,
      quotaResetAt: '2026-08-09T00:00:00Z',
      quotaSource: 'provider'
    });
    assert(actual);
    assertOptionalNumber(actual.totalTokens, 'total tokens should be derived from input and output');
    assert.strictEqual(actual.totalTokens, 15);
    assert.strictEqual(actual.occurredAt, '2026-08-08T02:00:00.000Z');
    assert.strictEqual(actual.quotaResetAt, '2026-08-09T00:00:00.000Z');

    const estimated = first.record({
      eventId: 'estimated-1',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      agentId: 'agent-a',
      providerId: 'mock',
      totalTokens: 60,
      estimated: true,
      occurredAt: '2026-08-08T02:01:00Z'
    });
    assert(estimated);

    const compaction = first.record({
      eventId: 'compaction-1',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      agentId: 'agent-a',
      providerId: 'mock',
      kind: 'compaction',
      beforeTokens: 200,
      afterTokens: 80,
      reason: 'automatic',
      occurredAt: '2026-08-08T02:02:00Z'
    });
    assert(compaction);

    const sourceConnection = { clientId: 'legacy-client' };
    const crossing = first.record({
      eventId: 'actual-2',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      agentId: 'agent-a',
      providerId: 'mock',
      totalTokens: 40,
      occurredAt: '2026-08-08T02:03:00Z'
    }, sourceConnection);
    assert(crossing);
    assert.strictEqual(warnings.length, 1, 'budget warning should be emitted once on threshold crossing');
    assert.strictEqual(warningSources[0], sourceConnection, 'budget warnings must retain their source connection for legacy clients');

    const duplicate = first.record({
      eventId: 'actual-1',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      totalTokens: 999
    });
    assert.strictEqual(duplicate, null, 'duplicate event ids must be idempotent');

    const restoredWarnings = [];
    const restored = new UsageManager(store, { onBudgetWarning: (warning) => restoredWarnings.push(warning) });
    const restoredSummary = restored.summary({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      anchorAt: '2026-08-08T02:04:00Z'
    });
    assert.strictEqual(restoredSummary.ok, true);
    assert.strictEqual(restoredSummary.summary.actual.tokens.inputTokens, 10);
    assert.strictEqual(restoredSummary.summary.actual.tokens.outputTokens, 5);
    assert.strictEqual(restoredSummary.summary.actual.tokens.totalTokens, 55);
    assert.strictEqual(restoredSummary.summary.estimated.tokens.totalTokens, 60);
    assert.strictEqual(restoredSummary.summary.actual.costs[0].currency, 'USD');
    assert.strictEqual(restoredSummary.summary.actual.costs[0].amount, 0.25);
    assert.strictEqual(restoredSummary.summary.quotas[0].remaining, 90);
    assert.strictEqual(restoredSummary.summary.quotas[0].limit, 100);
    assert.strictEqual(restoredSummary.summary.quotas[0].resetAt, '2026-08-09T00:00:00.000Z');
    assert.strictEqual(restoredSummary.summary.compactionEvents.length, 1);
    assert.strictEqual(restoredSummary.summary.compactionEvents[0].beforeTokens, 200);
    assert.strictEqual(restoredSummary.summary.compactionEvents[0].afterTokens, 80);

    const restoredEvents = restored.events({ hostProfileId: 'host-a', sessionId: 'session-a', limit: 20 });
    assert.strictEqual(restoredEvents.totalCount, 4);
    assert.strictEqual(restoredEvents.events.length, 4);
    assert.strictEqual(restoredEvents.events[0].occurredAt, '2026-08-08T02:00:00.000Z');

    const daySummary = restored.summary({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'day',
      anchorAt: '2026-08-08T12:00:00Z'
    });
    assert.strictEqual(daySummary.summary.actual.tokens.totalTokens, 55);
    const monthSummary = restored.summary({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'month',
      anchorAt: '2026-08-08T12:00:00Z'
    });
    assert.strictEqual(monthSummary.summary.actual.tokens.totalTokens, 55);

    const persistedBudget = restored.budgetGet({ hostProfileId: 'host-a', sessionId: 'session-a', window: 'session' });
    assert.strictEqual(persistedBudget.budget.tokenLimit, 100);
    assert.strictEqual(persistedBudget.budget.warningThreshold, 0.5);
    restored.record({
      eventId: 'actual-3',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      totalTokens: 1
    });
    assert.strictEqual(restoredWarnings.length, 0, 'persisted warning state must prevent duplicate warnings after restart');

    const hostIsolated = restored.summary({ hostProfileId: 'host-b', sessionId: 'session-a' });
    assert.strictEqual(hostIsolated.summary.eventCount, 0);
    console.log('usage recovery smoke ok');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
