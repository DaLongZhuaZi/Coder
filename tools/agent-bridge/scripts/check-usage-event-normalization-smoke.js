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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-usage-normalization-'));
  try {
    const store = createDaemonStore(home);
    const warnings = [];
    const manager = new UsageManager(store, {
      onBudgetWarning: (warning) => warnings.push(warning)
    });
    const budget = manager.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      window: 'session',
      tokenLimit: 1,
      warningThreshold: 0.5
    });
    assert.strictEqual(budget.ok, true);

    const complete = manager.record({
      eventId: 'complete',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.25,
      currency: 'USD'
    });
    assert(complete);
    assert.strictEqual(complete.totalTokens, 15);
    assert.strictEqual(complete.cost, 0.25);

    const partial = manager.record({
      eventId: 'partial',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      inputTokens: 7
    });
    assert(partial);
    assert.strictEqual(partial.inputTokens, 7);
    assert.strictEqual(has(partial, 'totalTokens'), false, 'missing output must keep total unavailable');

    const missingCurrencyCost = manager.record({
      eventId: 'missing-currency-cost',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      cost: 99
    });
    assert(missingCurrencyCost);
    assert.strictEqual(missingCurrencyCost.cost, 99);
    assert.strictEqual(has(missingCurrencyCost, 'currency'), false, 'cost without currency must remain unavailable in aggregates');

    const malformed = manager.record({
      eventId: 'malformed',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      inputTokens: -3,
      outputTokens: Number.MAX_SAFE_INTEGER + 1,
      quotaRemaining: -1,
      quotaLimit: Number.MAX_SAFE_INTEGER + 1,
      cost: -0.5,
      beforeTokens: -100,
      afterTokens: Number.POSITIVE_INFINITY
    });
    assert(malformed);
    for (const key of ['inputTokens', 'outputTokens', 'quotaRemaining', 'quotaLimit', 'cost', 'beforeTokens', 'afterTokens', 'totalTokens']) {
      assert.strictEqual(has(malformed, key), false, key + ' must remain unavailable for malformed input');
    }

    const compaction = manager.record({
      eventId: 'compaction',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'mock',
      kind: 'compaction',
      beforeTokens: 200,
      afterTokens: 80,
      reason: 'automatic'
    });
    assert(compaction);
    assert.strictEqual(compaction.beforeTokens, 200);
    assert.strictEqual(compaction.afterTokens, 80);

    assert.strictEqual(warnings.length, 1, 'only the valid complete event crosses the budget threshold');
    const summary = manager.summary({ hostProfileId: 'host-a', sessionId: 'session-a' });
    assert.strictEqual(summary.summary.actual.tokens.inputTokens, 17);
    assert.strictEqual(summary.summary.actual.tokens.outputTokens, 5);
    assert.strictEqual(summary.summary.actual.tokens.totalTokens, 15);
    assert.deepStrictEqual(summary.summary.actual.costs, [{ currency: 'USD', amount: 0.25 }]);
    assert.strictEqual(summary.summary.compactionEvents.length, 1);

    const restored = new UsageManager(store);
    const restoredSummary = restored.summary({ hostProfileId: 'host-a', sessionId: 'session-a' });
    assert.strictEqual(restoredSummary.summary.actual.tokens.totalTokens, 15);
    assert.strictEqual(restoredSummary.summary.compactionEvents[0].beforeTokens, 200);
    assert.strictEqual(restored.events({ hostProfileId: 'host-b', sessionId: 'session-a' }).totalCount, 0);

    const costWarnings = [];
    const costManager = new UsageManager(store, {
      onBudgetWarning: (warning) => costWarnings.push(warning)
    });
    const costBudget = costManager.budgetSet({
      hostProfileId: 'host-a',
      sessionId: 'session-cost',
      window: 'session',
      costLimit: 2,
      currency: ' usd ',
      warningThreshold: 0.5
    });
    assert.strictEqual(costBudget.ok, true);
    assert.strictEqual(costBudget.budget.currency, 'USD');
    const lowercaseCost = costManager.record({
      eventId: 'lowercase-currency-cost',
      hostProfileId: 'host-a',
      sessionId: 'session-cost',
      providerId: 'mock',
      cost: 1.1,
      currency: ' usd '
    });
    assert(lowercaseCost);
    assert.strictEqual(lowercaseCost.currency, 'USD');
    assert.strictEqual(costWarnings.length, 1, 'normalized budget currency must match normalized usage currency');
    assert.strictEqual(costWarnings[0].actualCost, 1.1);

    const legacyBudgetState = store.readUsageState();
    const legacyScopeKey = JSON.stringify(['host-a', 'session', 'session-legacy-cost', 'session']);
    const legacyBudget = {
      scopeKey: legacyScopeKey,
      hostProfileId: 'host-a',
      sessionId: 'session-legacy-cost',
      agentId: '',
      scopeType: 'session',
      window: 'session',
      costLimit: 2,
      currency: ' usd ',
      warningThreshold: 0.5
    };
    legacyBudgetState.version = 2;
    legacyBudgetState.budgets = {};
    legacyBudgetState.budgets[legacyScopeKey] = legacyBudget;
    legacyBudgetState.budgetWarnings = {};
    store.writeUsageState(legacyBudgetState);
    const recoveredWarnings = [];
    const recoveredManager = new UsageManager(store, {
      onBudgetWarning: (warning) => recoveredWarnings.push(warning)
    });
    const recoveredBudget = recoveredManager.budgetGet({
      hostProfileId: 'host-a',
      sessionId: 'session-legacy-cost',
      window: 'session'
    });
    assert.strictEqual(recoveredBudget.budget.currency, 'USD');
    const recoveredCost = recoveredManager.record({
      eventId: 'legacy-lowercase-currency-cost',
      hostProfileId: 'host-a',
      sessionId: 'session-legacy-cost',
      providerId: 'mock',
      cost: 1.1,
      currency: ' usd '
    });
    assert(recoveredCost);
    assert.strictEqual(recoveredWarnings.length, 1, 'migrated budget currency must continue matching cost events');
    console.log('usage event normalization smoke ok');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
