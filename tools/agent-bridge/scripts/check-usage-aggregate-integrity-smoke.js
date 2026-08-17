'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { UsageManager } = require('../src/agent-experience-manager');

function has(object, key) {
  return Object.keys(object).includes(key);
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-usage-aggregate-'));
  try {
    const store = createDaemonStore(home);
    const manager = new UsageManager(store);

    const invalidDecimal = manager.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      tokenLimit: 1.5
    });
    assert.strictEqual(invalidDecimal.ok, false);
    assert.strictEqual(invalidDecimal.failureCategory, 'invalid_budget_limit');

    const invalidHuge = manager.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      tokenLimit: Number.MAX_SAFE_INTEGER + 1
    });
    assert.strictEqual(invalidHuge.ok, false);
    assert.strictEqual(invalidHuge.failureCategory, 'invalid_budget_limit');

    const validBudget = manager.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      tokenLimit: Number.MAX_SAFE_INTEGER,
      warningThreshold: 0.9
    });
    assert.strictEqual(validBudget.ok, true);

    const quotaHour = manager.record({
      eventId: 'quota-hour',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      kind: 'quota',
      window: 'hour',
      quotaSource: 'provider',
      quotaRemaining: 10,
      quotaLimit: 20,
      quotaResetAt: '2026-08-09T01:00:00Z'
    });
    const quotaDay = manager.record({
      eventId: 'quota-day',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      kind: 'quota',
      window: 'day',
      quotaSource: 'provider',
      quotaRemaining: 100,
      quotaLimit: 200,
      quotaResetAt: '2026-08-10T00:00:00Z'
    });
    assert(quotaHour);
    assert(quotaDay);

    const overflowTokenOne = manager.record({
      eventId: 'overflow-token-one',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      inputTokens: Number.MAX_SAFE_INTEGER
    });
    const overflowTokenTwo = manager.record({
      eventId: 'overflow-token-two',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      inputTokens: 1
    });
    assert(overflowTokenOne);
    assert(overflowTokenTwo);

    const overflowCostOne = manager.record({
      eventId: 'overflow-cost-one',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      cost: Number.MAX_VALUE,
      currency: 'USD'
    });
    const overflowCostTwo = manager.record({
      eventId: 'overflow-cost-two',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      cost: Number.MAX_VALUE,
      currency: 'USD'
    });
    assert(overflowCostOne);
    assert(overflowCostTwo);

    const summary = manager.summary({ hostProfileId: 'host-a', sessionId: 'session-a' });
    assert.strictEqual(summary.summary.quotas.length, 2, 'quota windows must remain distinct');
    assert(summary.summary.quotas.some((item) => item.window === 'hour' && item.remaining === 10));
    assert(summary.summary.quotas.some((item) => item.window === 'day' && item.remaining === 100));
    assert.strictEqual(has(summary.summary.actual.tokens, 'inputTokens'), false, 'overflowed token aggregate must stay unavailable');
    assert.strictEqual(summary.summary.actual.costs.length, 0, 'overflowed cost aggregate must stay unavailable');

    const restored = new UsageManager(store);
    const restoredSummary = restored.summary({ hostProfileId: 'host-a', sessionId: 'session-a' });
    assert.strictEqual(restoredSummary.summary.quotas.length, 2, 'quota window separation must survive reload');
    console.log('usage aggregate integrity smoke ok');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
