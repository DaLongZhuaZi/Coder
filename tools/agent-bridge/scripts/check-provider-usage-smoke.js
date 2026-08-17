'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { UsageManager } = require('../src/agent-experience-manager');
const { ProviderUsageService, normalizeProviderUsage, providerUsageQuotaEvents, normalizeQuotaNumber } = require('../src/provider-usage-service');
const { normalizeCodexUsage, normalizeMetadataSuggestion } = require('../src/providers/codex-app-server-provider');

async function main() {
  const fakeProvider = {
    id: 'fixture',
    providerUsageAvailable: true,
    async getUsage() {
      return {
        ok: true,
        usage: {
          status: 'available',
          plan: 'Pro',
          windows: [
            { name: 'session', remaining: 90, limit: 100, resetAt: '2026-08-08T00:00:00Z' },
            { name: 'weekly', remaining_credits: 4, limit_credits: 10 }
          ],
          details: [{ key: 'source', value: 'fixture' }]
        }
      };
    }
  };
  const registry = {
    providers: new Map([['fixture', fakeProvider]]),
    resolve(providerId) {
      const provider = this.providers.get(providerId);
      if (!provider) throw new Error('not found');
      return provider;
    }
  };
  const service = new ProviderUsageService(registry);
  assert.strictEqual(service.anyAvailable(), true);
  const listed = await service.list({ providerId: 'fixture', hostProfileId: 'host-a', sessionId: 'session-a', agentId: 'agent-a', window: 'day' });
  assert.strictEqual(listed.ok, true);
  assert.strictEqual(listed.hostProfileId, 'host-a');
  assert.strictEqual(listed.sessionId, 'session-a');
  assert.strictEqual(listed.agentId, 'agent-a');
  assert.strictEqual(listed.window, 'day');
  assert.strictEqual(listed.windows.length, 2);
  assert.strictEqual(listed.windows[0].remaining, 90);
  assert.strictEqual(listed.windows[1].limit, 10);
  const unavailable = await service.list({ providerId: 'missing' });
  assert.strictEqual(unavailable.ok, false);
  assert.strictEqual(unavailable.failureCategory, 'capability_unavailable');
  assert.strictEqual(normalizeQuotaNumber(-1), undefined);
  assert.strictEqual(normalizeQuotaNumber(Number.MAX_SAFE_INTEGER + 1), undefined);

  const normalized = normalizeProviderUsage('fixture', { usage: { windows: [{ name: 'day', remaining: 1 }] } });
  assert.strictEqual(normalized.windows[0].name, 'day');
  assert.strictEqual(normalized.hostProfileId, '');
  assert.strictEqual(normalized.sessionId, '');
  assert.strictEqual(normalized.agentId, '');
  assert.strictEqual(normalized.window, 'session');
  const invalidNumbers = normalizeProviderUsage('fixture', {
    usage: { status: 'available', windows: [{ name: 'bad', remaining: -2, limit: -1, used: -3 }] }
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(invalidNumbers.windows[0], 'remaining'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(invalidNumbers.windows[0], 'limit'), false);
  assert.strictEqual(providerUsageQuotaEvents(invalidNumbers, { providerId: 'fixture' }).length, 0);
  const fractionalNumbers = normalizeProviderUsage('fixture', {
    usage: { status: 'available', windows: [{ name: 'fractional', remaining: 1.5, limit: 10.25 }] }
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(fractionalNumbers.windows[0], 'remaining'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(fractionalNumbers.windows[0], 'limit'), false);
  const unavailableState = normalizeProviderUsage('fixture', { usage: { status: 'unavailable' } });
  assert.strictEqual(unavailableState.ok, false);
  assert.strictEqual(unavailableState.status, 'unavailable');
  const quotaResult = normalizeProviderUsage('fixture', {
    ok: true,
    hostProfileId: 'host-a',
    sessionId: 'session-a',
    agentId: 'agent-a',
    usage: {
      status: 'available',
      source: 'provider',
      fetchedAt: '2026-08-08T02:05:00Z',
      windows: [
        { name: 'day', remaining: 90, limit: 100, resetAt: '2026-08-09T00:00:00Z' },
        { name: 'unavailable', status: 'unavailable' }
      ],
      details: [{ key: 'token', value: 'Authorization: Bearer should-not-be-persisted' }]
    }
  });
  assert.ok(quotaResult.details[0].value.includes('[redacted]'), 'provider details must redact bearer tokens');
  const credentialText = normalizeProviderUsage('fixture', {
    ok: true,
    message: 'See https://user:password@example.test/usage?access_token=secret-token',
    usage: {
      status: 'available',
      warnings: ['https://client:secret@example.test/status?api_key=private-key'],
      details: [{ key: 'endpoint', value: 'https://name:pass@example.test/data?client_secret=hidden' }]
    }
  });
  assert.ok(credentialText.message.includes('https://[redacted]@example.test/usage?access_token=[redacted]'), 'provider message must redact URL credentials');
  assert.ok(credentialText.warnings[0].includes('https://[redacted]@example.test/status?api_key=[redacted]'), 'provider warnings must redact URL credentials');
  assert.ok(credentialText.details[0].value.includes('https://[redacted]@example.test/data?client_secret=[redacted]'), 'provider details must redact URL credentials');
  assert.strictEqual(credentialText.message.includes('password'), false, 'provider message must not expose URL password');
  assert.strictEqual(credentialText.details[0].value.includes('hidden'), false, 'provider details must not expose URL secret');
  const quotaEvents = providerUsageQuotaEvents(quotaResult, { providerId: 'fixture' });
  assert.strictEqual(quotaEvents.length, 1, 'only windows with real quota fields should become usage events');
  assert.strictEqual(quotaEvents[0].kind, 'quota');
  assert.strictEqual(quotaEvents[0].estimated, false);
  assert.strictEqual(quotaEvents[0].quotaRemaining, 90);
  assert.strictEqual(quotaEvents[0].quotaLimit, 100);
  assert.strictEqual(quotaEvents[0].quotaResetAt, '2026-08-09T00:00:00.000Z');
  assert.strictEqual(
    providerUsageQuotaEvents(quotaResult, { providerId: 'fixture' })[0].eventId,
    quotaEvents[0].eventId,
    'unchanged provider quota snapshots must be idempotent'
  );
  const changedQuota = normalizeProviderUsage('fixture', {
    ok: true,
    usage: { status: 'available', windows: [{ name: 'day', remaining: 89, limit: 100 }] }
  });
  assert.notStrictEqual(
    providerUsageQuotaEvents(changedQuota, { hostProfileId: 'host-a', sessionId: 'session-a' })[0].eventId,
    quotaEvents[0].eventId,
    'changed quota snapshots must produce a new event id'
  );
  const usageHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-quota-usage-'));
  try {
    const usageManager = new UsageManager(createDaemonStore(usageHome));
    assert.ok(usageManager.record(quotaEvents[0]), 'provider quota snapshot should be persisted as a usage event');
    assert.strictEqual(usageManager.record(quotaEvents[0]), null, 'replayed provider quota snapshot must be ignored');
    const persisted = usageManager.summary({ hostProfileId: 'host-a', sessionId: 'session-a', window: 'day', anchorAt: '2026-08-08T12:00:00Z' });
    assert.strictEqual(persisted.summary.quotas.length, 1);
    assert.strictEqual(persisted.summary.quotas[0].remaining, 90);
    assert.strictEqual(persisted.summary.quotas[0].limit, 100);
    assert.strictEqual(persisted.summary.quotas[0].resetAt, '2026-08-09T00:00:00.000Z');
    const isolated = usageManager.summary({ hostProfileId: 'host-b', sessionId: 'session-a', window: 'day', anchorAt: '2026-08-08T12:00:00Z' });
    assert.strictEqual(isolated.summary.quotas.length, 0, 'quota snapshots must remain host scoped');
  } finally {
    fs.rmSync(usageHome, { recursive: true, force: true });
  }
  const usage = normalizeCodexUsage({ tokenUsage: { last: { input_tokens: 12, output_tokens: 8, cached_input_tokens: 3 } } }, 'thread-1', 'turn-1');
  assert.strictEqual(usage.totalTokens, 20);
  assert.strictEqual(usage.cacheReadTokens, 3);
  assert.strictEqual(normalizeMetadataSuggestion('branchName', '{"suggestion":"feature/r4-usage"}'), 'feature/r4-usage');
  assert.throws(() => normalizeMetadataSuggestion('branchName', '{"suggestion":"bad branch"}'));
  const mcpSource = require('fs').readFileSync(require('path').resolve(__dirname, '../src/mcp-host.js'), 'utf8');
  const cliSource = require('fs').readFileSync(require('path').resolve(__dirname, '../src/desktop-launcher.js'), 'utf8');
  const serverSource = require('fs').readFileSync(require('path').resolve(__dirname, '../src/server.js'), 'utf8');
  assert.ok(mcpSource.includes("provider_usage_list"));
  assert.ok(mcpSource.includes('RequestType.PROVIDER_USAGE_LIST'));
  assert.ok(cliSource.includes('RequestType.PROVIDER_USAGE_LIST'));
  assert.ok(cliSource.includes("providerBridgeCommands = new Set(['directory', 'usage'"));
  assert.ok(serverSource.includes('const sessionMatch = event.sessionId ? registry.findSession(event.sessionId) : null;'));
  assert.ok(serverSource.includes('providerUsageQuotaEvents(result, providerPayload)'), 'provider usage refresh must feed the scoped usage store');
  assert.ok(serverSource.includes('EventType.USAGE_UPDATED'), 'provider quota snapshots must notify usage subscribers');
  assert.ok(serverSource.includes('normalizeMetadataResult'), 'metadata Provider output must use the shared result normalizer');
  console.log('provider usage smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
