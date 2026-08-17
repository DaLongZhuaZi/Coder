'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const compatibility = require(path.join(root, 'src/web/compatibility.js'));
const app = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/web/index.html'), 'utf8');

for (const feature of ['messageQueue', 'usageEvents', 'usageBudgets', 'providerUsage', 'metadataGeneration']) {
  assert.ok(compatibility.KNOWN_FEATURES.includes(feature), feature + ' must be a known Web capability');
}

const queue = compatibility.normalizeResponse('message.queue.list', {
  items: [{ queueId: 'q-1', clientMessageId: 'client-1', status: 'unexpected', attempt: '1', message: 'busy' }]
});
assert.strictEqual(queue.items.length, 1, 'queue parser should retain object items');
assert.strictEqual(queue.items[0].status, 'queued', 'unknown queue state should use a safe queued default');
assert.strictEqual(queue.items[0].attempt, null, 'invalid attempt must remain unavailable');

const summary = compatibility.normalizeResponse('usage.summary.get', {
  summary: {
    window: 'session',
    actual: { tokens: { inputTokens: 3, totalTokens: 3 }, costs: [{ amount: 0.1, currency: 'USD' }] },
    estimated: { tokens: {}, costs: [] },
    quotas: [{ providerId: 'provider', remaining: '90', limit: 100 }],
    compactionEvents: [{ kind: 'compaction', beforeTokens: 10, afterTokens: 5, occurredAt: '2026-08-09T00:00:00.000Z' }]
  }
});
assert.strictEqual(summary.summary.actual.tokens.inputTokens, 3, 'actual usage tokens should be retained');
assert.strictEqual(summary.summary.actual.tokens.outputTokens, null, 'missing usage values must remain unavailable');
assert.strictEqual(summary.summary.quotas[0].remaining, null, 'invalid quota values must not become zero');
assert.strictEqual(summary.summary.compactionEvents[0].beforeTokens, 10, 'compaction events should be normalized');

const daySummary = compatibility.normalizeResponse('usage.summary.get', {
  summary: { window: 'day', actual: { tokens: { totalTokens: 8 } }, estimated: { tokens: {} } }
});
assert.strictEqual(daySummary.summary.window, 'day', 'usage summary must preserve the requested day window');

const providerUsage = compatibility.normalizeResponse('provider.usage.list', {
  ok: true,
  providerId: 'codex',
  availabilityState: 'available',
  planLabel: 'Pro',
  windows: [{ name: 'day', remaining: 90, limit: 100, used: 10, resetAt: '2026-08-10T00:00:00Z' }],
  details: [{ key: 'account', label: 'Account', value: 'workspace-user', status: 'info' }]
});
assert.strictEqual(providerUsage.result.availabilityState, 'available', 'provider usage state should be retained');
assert.strictEqual(providerUsage.result.windows[0].remaining, 90, 'provider usage window should be normalized');
assert.strictEqual(providerUsage.result.details[0].key, 'account', 'provider usage details should be retained');
const unsafeProviderUsage = compatibility.normalizeResponse('provider.usage.list', {
  ok: false,
  availabilityState: 'unexpected',
  details: [{ key: 'detail', value: 123 }]
});
assert.strictEqual(unsafeProviderUsage.result.availabilityState, 'unsupported', 'unknown provider usage state should fail closed');
assert.strictEqual(unsafeProviderUsage.result.details[0].value, '', 'non-string provider detail should remain unavailable');

const metadata = compatibility.normalizeResponse('metadata.generate', {
  kind: 'sessionTitle',
  suggestion: 'A reviewed title',
  alternatives: ['Alternative'],
  planId: 'plan-1',
  estimatedUsage: true
});
assert.strictEqual(metadata.result.suggestion, 'A reviewed title', 'metadata suggestion should be exposed for editing');
assert.strictEqual(metadata.result.planId, 'plan-1', 'metadata preview plan should be retained');
assert.strictEqual(metadata.result.estimatedUsage, true, 'metadata estimated usage should be explicit');

for (const id of ['experience-section', 'queue-list', 'usage-output', 'usage-event-list', 'usage-view-window', 'provider-usage-panel', 'provider-usage-detail-list', 'provider-usage-refresh-button', 'usage-budget-save-button', 'metadata-generate-button', 'metadata-suggestion']) {
  assert.ok(html.includes(id), 'Web UI must expose ' + id);
}
for (const value of ['session', 'day', 'month']) {
  assert.ok(html.includes('<option value="' + value + '">'), 'Web UI must expose usage window ' + value);
}
for (const marker of [
  "featureEnabled('messageQueue')",
  "featureEnabled('usageEvents')",
  "featureEnabled('usageBudgets')",
  "featureEnabled('metadataGeneration')",
  'normalizeProviderCapabilities',
  'providerCapabilitiesKnown',
  'providerCapabilityEnabled',
  "http('/capabilities')",
  'usageEventsCapability',
  'metadataGenerationEnabled',
  "message.queue.list",
  "message.queue.cancel",
  "message.queue.retry",
  "usage.summary.get",
  "usage.events.list",
  "usage.budget.get",
  "usage.budget.set",
  "provider.usage.list",
  "providerUsageEnabled",
  "renderProviderUsage",
  "metadata.generate",
  "metadata.generate.cancel",
  "['sessionTitle', 'branchName', 'commitMessage', 'pullRequest']",
  "state.metadata.applying",
  "workspace.git.branch",
  "workspace.git.commit",
  "requireConfirm: true",
  "github.pr.create",
  "dryRun: true",
  "send(type, payload, explicitRequestId)",
  "experienceScopeMatches",
  'USAGE_WINDOWS',
  'currentUsageWindow',
  'usageWindowNotice',
  'usage-view-window',
  "window: usageWindow",
  "actionInFlight",
  "agent.update",
  "eventName === 'usage.updated'",
  "eventName === 'usage.budget.warning'"
]) {
  assert.ok(app.includes(marker), 'Web session experience must include ' + marker);
}
assert.ok(!app.includes('access_token'), 'Web session experience must not expose access tokens');
assert.ok(app.includes('navigator.clipboard.writeText'), 'Metadata preview must expose safe copy');

console.log('web session experience smoke ok');
