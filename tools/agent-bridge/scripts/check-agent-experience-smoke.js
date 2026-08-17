#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { buildCompatibilityInfo, buildDiagnosticsExportReport, redactDiagnosticText } = require('../src/diagnostics');
const {
  MessageQueueManager,
  UsageManager,
  metadataSuggestion,
  normalizeRichContentNodes,
  richContentNodes,
  sanitizeComposerTokens,
  truncateText
} = require('../src/agent-experience-manager');

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-experience-'));
  try {
    const store = createDaemonStore(home); const queue = new MessageQueueManager(store); const usage = new UsageManager(store);
    const first = queue.enqueue({ sessionId: 's1', clientMessageId: 'c1', text: 'hello' });
    const duplicate = queue.enqueue({ sessionId: 's1', clientMessageId: 'c1', text: 'hello' });
    assert.strictEqual(first.duplicate, false); assert.strictEqual(duplicate.duplicate, true);
    const updates = []; await queue.drain('s1', async () => {}, (item) => updates.push(item.status));
    assert.deepStrictEqual(updates, ['sending', 'accepted']);
    const acceptedState = createDaemonStore(home).readMessageQueueState();
    assert.strictEqual(acceptedState.version, 2, 'message queue state should migrate to attempt-aware schema');
    assert.strictEqual(acceptedState.items[0].status, 'accepted');
    assert.strictEqual(acceptedState.items[0].attempts, 1);
    assert.strictEqual(acceptedState.items[0].attemptHistory.length, 1);
    assert.strictEqual(acceptedState.items[0].attemptHistory[0].status, 'accepted');
    assert.strictEqual(typeof acceptedState.items[0].attemptId, 'string');
    const legacyHome = path.join(home, 'legacy-queue');
    const legacyStore = createDaemonStore(legacyHome);
    legacyStore.writeMessageQueueState({ version: 1, items: [{ id: 'legacy-q', clientMessageId: 'legacy-c', sessionId: 'legacy-session', status: 'failed', attempts: 1, payload: { text: 'legacy' } }] });
    const legacyQueue = new MessageQueueManager(legacyStore);
    const legacySnapshot = legacyQueue.list({ sessionId: 'legacy-session' }).items[0];
    assert.strictEqual(legacyStore.readMessageQueueState().version, 2, 'legacy queue state must migrate on first read');
    assert.strictEqual(legacySnapshot.id, 'legacy-q');
    assert.strictEqual(legacySnapshot.attemptHistory.length, 0, 'legacy history must default to empty without inventing an attempt');
    const legacyRetry = legacyQueue.retry({ sessionId: 'legacy-session', queueId: 'legacy-q' });
    assert.strictEqual(legacyRetry.item.attempts, 2, 'legacy retry must continue the existing attempt count');
    assert.strictEqual(legacyRetry.item.attemptHistory[0].attemptNumber, 1);
    assert.strictEqual(legacyRetry.item.attemptHistory[1].attemptNumber, 2);
    const failedQueue = queue.enqueue({ sessionId: 'retry-session', clientMessageId: 'retry-client', text: 'retry me' });
    const failedQueueState = queue.state();
    const failedQueueItem = failedQueueState.items.find((item) => item.id === failedQueue.item.id);
    queue.update(failedQueueItem, 'failed', 'provider_error', 'first attempt failed');
    const failedSnapshot = queue.list({ sessionId: 'retry-session' }).items[0];
    const failedAttemptId = failedSnapshot.attemptId;
    assert.strictEqual(failedSnapshot.attempts, 1);
    assert.strictEqual(failedSnapshot.attemptHistory.length, 1);
    assert.strictEqual(failedSnapshot.attemptHistory[0].status, 'failed');
    const retryResult = queue.retry({ sessionId: 'retry-session', queueId: failedQueue.item.id });
    assert.strictEqual(retryResult.ok, true);
    assert.strictEqual(retryResult.item.id, failedQueue.item.id, 'retry must retain queue id');
    assert.strictEqual(retryResult.item.clientMessageId, 'retry-client', 'retry must retain client message id');
    assert.strictEqual(retryResult.item.attempts, 2);
    assert.notStrictEqual(retryResult.item.attemptId, failedAttemptId, 'retry must allocate a new attempt id');
    assert.strictEqual(retryResult.item.attemptHistory.length, 2);
    assert.strictEqual(retryResult.item.attemptHistory[0].status, 'failed');
    assert.strictEqual(retryResult.item.attemptHistory[1].status, 'queued');
    assert.strictEqual(retryResult.item.attemptHistory[1].retryOfAttemptId, failedAttemptId);
    const duplicateRetryQueue = queue.enqueue({ sessionId: 'retry-session', clientMessageId: 'retry-client', text: 'retry me again' });
    assert.strictEqual(duplicateRetryQueue.duplicate, true);
    assert.strictEqual(duplicateRetryQueue.item.attemptId, retryResult.item.attemptId);
    const reloadedQueue = new MessageQueueManager(createDaemonStore(home));
    const reloadedRetry = reloadedQueue.list({ sessionId: 'retry-session' }).items[0];
    assert.strictEqual(reloadedRetry.attempts, 2, 'attempt count must survive daemon restart');
    assert.strictEqual(reloadedRetry.attemptHistory[1].status, 'queued');
    await reloadedQueue.drain('retry-session', async () => {}, () => {});
    const completedRetry = reloadedQueue.list({ sessionId: 'retry-session' }).items[0];
    assert.strictEqual(completedRetry.status, 'accepted');
    assert.strictEqual(completedRetry.attemptHistory[1].status, 'accepted');
    const hostAQueue = queue.enqueue({ hostProfileId: 'host-a', sessionId: 'shared-session', clientMessageId: 'same-client-id', text: 'a' });
    const hostBQueue = queue.enqueue({ hostProfileId: 'host-b', sessionId: 'shared-session', clientMessageId: 'same-client-id', text: 'b' });
    assert.strictEqual(hostAQueue.duplicate, false); assert.strictEqual(hostBQueue.duplicate, false);
    assert.strictEqual(queue.list({ hostProfileId: 'host-a', sessionId: 'shared-session' }).items.length, 1);
    assert.strictEqual(queue.cancel({ hostProfileId: 'host-b', queueId: hostAQueue.item.id }).failureCategory, 'not_found');
    const hostDrain = []; await queue.drain('shared-session', async (payload) => hostDrain.push(payload.text), () => {}, 'host-a');
    assert.deepStrictEqual(hostDrain, ['a']);
    assert.strictEqual(queue.list({ hostProfileId: 'host-b', sessionId: 'shared-session' }).items[0].status, 'queued');
    usage.record({ eventId: 'u1', sessionId: 's1', inputTokens: 10, outputTokens: 5, cost: 0.1, currency: 'USD' });
    usage.record({ eventId: 'u2', sessionId: 's1', totalTokens: 20, estimated: true });
    usage.record({ eventId: 'u1', sessionId: 's1', totalTokens: 999 });
    assert(usage.record({ eventId: 'u1', hostProfileId: 'host-b', sessionId: 's1', totalTokens: 2 }) !== null, 'event dedupe must remain scoped to host/session/provider');
    const summary = usage.summary({ sessionId: 's1' }).summary;
    assert.strictEqual(summary.realTokens, 15); assert.strictEqual(summary.estimatedTokens, 20); assert.strictEqual(summary.realCost, 0.1);
    const categorized = usage.record({ eventId: 'categorized', sessionId: 'category', inputTokens: 7, outputTokens: 3, cacheReadTokens: 5, reasoningTokens: 2 });
    assert.strictEqual(categorized.totalTokens, 10, 'derived total must not double-count cache or reasoning categories');
    assert.strictEqual(usage.budgetSet({ sessionId: 's1', tokenLimit: 100 }).budget.tokenLimit, 100);
    const bulkState = usage.state();
    for (let index = 0; index < 1205; index += 1) {
      bulkState.events.push({ eventId: 'bulk-' + String(index), hostProfileId: 'host-a', sessionId: 'bulk', providerId: 'mock', source: 'provider', estimated: false, kind: 'usage', totalTokens: 1, occurredAt: '2026-07-14T01:00:00.000Z' });
    }
    bulkState.events.push({ eventId: 'bulk-other-host', hostProfileId: 'host-b', sessionId: 'bulk', providerId: 'mock', source: 'provider', estimated: false, kind: 'usage', totalTokens: 500, occurredAt: '2026-07-14T01:00:00.000Z' });
    usage.save(bulkState);
    const bulkSummary = usage.summary({ hostProfileId: 'host-a', sessionId: 'bulk', window: 'day', anchorAt: '2026-07-14T12:00:00.000Z' }).summary;
    assert.strictEqual(bulkSummary.actual.tokens.totalTokens, 1205, 'summary must aggregate every matching event, not only the visible list tail');
    const bulkList = usage.events({ hostProfileId: 'host-a', sessionId: 'bulk', window: 'day', anchorAt: '2026-07-14T12:00:00.000Z', limit: 10 });
    assert.strictEqual(bulkList.events.length, 10); assert.strictEqual(bulkList.totalCount, 1205);
    usage.record({ eventId: 'currency-usd', hostProfileId: 'host-a', sessionId: 'money', providerId: 'mock', totalTokens: 3, cost: 1.25, currency: 'USD', quotaRemaining: 90, quotaLimit: 100, quotaResetAt: '2026-08-01T00:00:00Z', quotaSource: 'provider' });
    usage.record({ eventId: 'currency-eur', hostProfileId: 'host-a', sessionId: 'money', providerId: 'mock', totalTokens: 4, cost: 2.5, currency: 'EUR' });
    const money = usage.summary({ hostProfileId: 'host-a', sessionId: 'money' }).summary;
    assert.strictEqual(money.actual.costs.length, 2, 'costs must remain separated by currency');
    assert.strictEqual(Object.keys(money).includes('realCost'), false, 'multi-currency totals must not expose a misleading scalar cost');
    assert.strictEqual(money.quotas[0].remaining, 90); assert.strictEqual(money.quotas[0].resetAt, '2026-08-01T00:00:00.000Z');
    const warnings = []; usage.onBudgetWarning = (warning) => warnings.push(warning);
    const budgetResult = usage.budgetSet({ hostProfileId: 'host-a', sessionId: 'warn', window: 'month', tokenLimit: 100, warningThreshold: 0.5 });
    assert.strictEqual(budgetResult.ok, true);
    usage.record({ eventId: 'warn-1', hostProfileId: 'host-a', sessionId: 'warn', totalTokens: 50, occurredAt: '2026-07-14T01:00:00Z' });
    usage.record({ eventId: 'warn-2', hostProfileId: 'host-a', sessionId: 'warn', totalTokens: 10, occurredAt: '2026-07-14T02:00:00Z' });
    assert.strictEqual(warnings.length, 1, 'a threshold crossing must emit one deduplicated warning per window');
    assert.strictEqual(warnings[0].window, 'month'); assert.deepStrictEqual(warnings[0].reasons, ['token']);
    assert.strictEqual(usage.budgetSet({ sessionId: 'bad', window: 'week', tokenLimit: 1 }).failureCategory, 'invalid_budget_window');
    const nodes = richContentNodes('before\n```js\nconst x = 1;\n```\nafter');
    assert.strictEqual(nodes[1].kind, 'code'); assert.strictEqual(nodes[1].language, 'js');
    assert.strictEqual(nodes[1].tokenized, true); assert(nodes[1].tokens.some((token) => token.kind === 'keyword' && token.text === 'const'));
    const normalized = normalizeRichContentNodes([
      { kind: 'link', url: 'javascript:alert(1)', text: 'unsafe' },
      { kind: 'file', workspaceId: 'other', path: '../secret', text: 'secret' },
      { kind: 'mystery', text: 'unknown' },
      { kind: 'tool', name: 'github.pr.merge', status: 'completed', text: 'done' },
      { kind: 'diff', text: '+added\n-removed\n' }
    ], '', { workspaceId: 'w1' });
    assert.strictEqual(normalized[0].kind, 'fallback'); assert.strictEqual(normalized[0].source, 'unsafe_link');
    assert.strictEqual(normalized[1].kind, 'fallback'); assert.strictEqual(normalized[1].source, 'unsafe_file_reference');
    assert.strictEqual(normalized[2].kind, 'fallback'); assert.strictEqual(normalized[2].source, 'unknown_node_kind');
    assert.strictEqual(normalized[3].toolType, 'github'); assert.strictEqual(normalized[4].tokenized, true);
    assert.strictEqual(normalizeRichContentNodes([{ kind: 'link', url: 'https://user:password@example.com/private', text: 'credential link' }], '')[0].kind, 'fallback');
    const toolTypes = ['workspace.file.read', 'shell.exec', 'git.status', 'github.pr.merge', 'agent.checkpoint.create', 'terminal.resize', 'permission.respond', 'update_plan'];
    const expectedToolTypes = ['file', 'shell', 'git', 'github', 'checkpoint', 'terminal', 'permission', 'plan'];
    const toolNodes = normalizeRichContentNodes(toolTypes.map((name) => ({ kind: 'tool', name, text: name })), '', { workspaceId: 'w1' });
    assert.deepStrictEqual(toolNodes.map((node) => node.toolType), expectedToolTypes);
    assert.strictEqual(normalizeRichContentNodes([{ kind: 'file', path: 'src/main.js' }], '')[0].kind, 'fallback', 'file nodes require an authoritative workspace id');
    const tokenLimited = normalizeRichContentNodes([{ kind: 'code', language: 'js', text: 'x '.repeat(5000) }], '')[0];
    assert.strictEqual(tokenLimited.truncated, true); assert.strictEqual(tokenLimited.truncationReason, 'token_limit');
    const nodeLimited = normalizeRichContentNodes(Array.from({ length: 110 }, (_value, index) => ({ kind: 'text', text: String(index) })), '');
    assert.strictEqual(nodeLimited.length, 100); assert.strictEqual(nodeLimited[99].truncationReason, 'node_limit');
    const unicode = truncateText('中'.repeat(100), 17, 100);
    assert.strictEqual(Buffer.byteLength(unicode.text, 'utf8') <= 17, true);
    assert.strictEqual(unicode.text.includes('\uFFFD'), false);
    assert.strictEqual(metadataSuggestion('branchName', { prompt: 'Fix Queue Retry' }), 'fix-queue-retry');
    assert.strictEqual(sanitizeComposerTokens({ hostProfileId: 'h1', workspaceId: 'w1', composerTokensJson: '[{"id":"f1","kind":"file","value":"src/main.ets","hostProfileId":"h1","workspaceId":"w1"}]' }).ok, true);
    assert.strictEqual(sanitizeComposerTokens({ hostProfileId: 'h1', workspaceId: 'w1', composerTokensJson: '[{"kind":"file","value":"../secret","hostProfileId":"h1","workspaceId":"w1"}]' }).failureCategory, 'unsafe_composer_path');
    assert.strictEqual(sanitizeComposerTokens({ hostProfileId: 'h1', workspaceId: 'w1', composerTokensJson: '[{"kind":"agent","value":"a1","hostProfileId":"h2","workspaceId":"w1"}]' }).failureCategory, 'composer_scope_mismatch');
    const doctorChecks = [];
    for (let index = 0; index < 80; index += 1) doctorChecks.push({ id: 'daemon_' + String(index), status: 'warning', message: 'token=super-secret-' + String(index) + ' ' + 'detail '.repeat(100) });
    const diagnostics = buildDiagnosticsExportReport(store, { format: 'json', maxBytes: 4096, doctor: { checks: doctorChecks }, health: { instanceHealth: 'degraded' } });
    assert.strictEqual(diagnostics.report.groups.length, 8); assert.strictEqual(diagnostics.truncated, true);
    assert(diagnostics.sizeBytes <= 4096, 'JSON diagnostics must honor the hard byte limit');
    assert(!JSON.stringify(diagnostics.report).includes('super-secret'), 'diagnostics must redact secret assignments');
    const redactedDiagnostic = redactDiagnosticText('config={"token":"json-secret"} keyPath=C:\\private\\device-key.pem url=https://example.com/private/config');
    assert(!redactedDiagnostic.includes('json-secret')); assert(!redactedDiagnostic.includes('device-key.pem')); assert(!redactedDiagnostic.includes('/private/config'));
    const diagnosticsText = buildDiagnosticsExportReport(store, { format: 'text', maxBytes: 4096, doctor: { checks: doctorChecks }, health: { instanceHealth: 'healthy' } });
    assert.strictEqual(typeof diagnosticsText.report.text, 'string'); assert(diagnosticsText.report.text.includes('Agent Bridge diagnostics'));
    assert(diagnosticsText.sizeBytes <= 4096, 'text diagnostics must honor the hard byte limit');
    const compatibilityBase = { appVersion: '2.0.0', bridgeVersion: '2.0.0', minimumAppVersion: '1.0.0', recommendedAppVersion: '2.0.0', minimumBridgeVersion: '1.0.0', recommendedBridgeVersion: '2.0.0', clientProtocolVersion: '2', supportedProtocolVersions: ['1', '2'], recommendedProtocolVersion: '2' };
    assert.strictEqual(buildCompatibilityInfo(compatibilityBase).status, 'compatible');
    assert.strictEqual(buildCompatibilityInfo(Object.assign({}, compatibilityBase, { appVersion: '0.9.0' })).status, 'appTooOld');
    assert.strictEqual(buildCompatibilityInfo(Object.assign({}, compatibilityBase, { bridgeVersion: '0.9.0' })).status, 'bridgeTooOld');
    assert.strictEqual(buildCompatibilityInfo(Object.assign({}, compatibilityBase, { bridgeVersion: '1.5.0' })).status, 'upgradeRecommended');
    assert.strictEqual(buildCompatibilityInfo(Object.assign({}, compatibilityBase, { clientProtocolVersion: '' })).status, 'unknown');
    assert.strictEqual(buildCompatibilityInfo(Object.assign({}, compatibilityBase, { bridgeVersion: 'invalid' })).status, 'unknown');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
  console.log('agent experience smoke ok');
}
main().catch((error) => { console.error(error); process.exit(1); });
