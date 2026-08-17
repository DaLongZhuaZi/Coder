'use strict';

const assert = require('assert');
const {
  ProviderUsageService,
  normalizeProviderUsage,
  providerUsageQuotaEvents
} = require('../src/provider-usage-service');

function quotaResult(expiresAt, extraUsage) {
  const usage = {
    status: 'available',
    fetchedAt: '2026-08-08T02:00:00Z',
    expiresAt,
    windows: [{ name: 'day', remaining: 80, limit: 100, resetAt: '2026-08-09T00:00:00Z' }]
  };
  if (extraUsage && typeof extraUsage === 'object') {
    Object.assign(usage, extraUsage);
  }
  return normalizeProviderUsage('fixture', {
    ok: true,
    hostProfileId: 'host-a',
    sessionId: 'session-a',
    agentId: 'agent-a',
    usage
  });
}

async function main() {
  const fresh = quotaResult('2099-01-01T00:00:00Z');
  assert.strictEqual(fresh.stale, false, 'a future expiry must remain fresh');
  assert.strictEqual(providerUsageQuotaEvents(fresh, {}).length, 1, 'fresh quota must produce an event');

  const expired = quotaResult('2020-01-01T00:00:00Z');
  assert.strictEqual(expired.ok, true, 'expired data remains a usable snapshot');
  assert.strictEqual(expired.status, 'available');
  assert.strictEqual(expired.stale, true, 'past expiry must mark the snapshot stale');
  assert.strictEqual(providerUsageQuotaEvents(expired, {}).length, 0, 'stale quota must not create a new event');

  const providerMarkedStale = quotaResult('', { stale: true });
  assert.strictEqual(providerMarkedStale.stale, true, 'provider stale marker must be preserved');
  assert.strictEqual(providerUsageQuotaEvents(providerMarkedStale, {}).length, 0);

  const malformedExpiry = quotaResult('not-a-date');
  assert.strictEqual(malformedExpiry.expiresAt, '', 'invalid expiry must remain unavailable');
  assert.strictEqual(malformedExpiry.stale, false, 'invalid expiry must not invent stale state');

  const legacyResult = {
    ok: true,
    providerId: 'fixture',
    windows: [{ name: 'day', remaining: 1, limit: 2 }]
  };
  assert.strictEqual(providerUsageQuotaEvents(legacyResult, {}).length, 1, 'legacy result without stale must stay compatible');

  let refreshCount = 0;
  const cachedProvider = {
    id: 'cached-fixture',
    providerUsageAvailable: true,
    async getUsage() {
      refreshCount += 1;
      if (refreshCount === 1) {
        return {
          ok: true,
          usage: {
            status: 'available',
            fetchedAt: '2026-08-08T02:00:00Z',
            windows: [{ name: 'day', remaining: 7, limit: 10, resetAt: '2026-08-09T00:00:00Z' }]
          }
        };
      }
      const error = new Error('fixture timeout with secret=must-not-escape');
      error.code = 'timeout';
      throw error;
    }
  };
  const cachedRegistry = {
    providers: new Map([['cached-fixture', cachedProvider]]),
    resolve(providerId) {
      return this.providers.get(providerId) || null;
    }
  };
  const cachedService = new ProviderUsageService(cachedRegistry, { snapshotCacheTtlMs: 1000 });
  const cachedScope = {
    providerId: 'cached-fixture',
    hostProfileId: 'host-cache',
    sessionId: 'session-cache',
    agentId: 'agent-cache',
    window: 'day'
  };
  const firstCached = await cachedService.list(cachedScope);
  assert.strictEqual(firstCached.ok, true);
  assert.strictEqual(firstCached.stale, false);
  const staleFallback = await cachedService.list(cachedScope);
  assert.strictEqual(staleFallback.ok, true, 'a refresh failure should keep the last safe snapshot usable');
  assert.strictEqual(staleFallback.stale, true);
  assert.strictEqual(staleFallback.availabilityState, 'stale');
  assert.strictEqual(staleFallback.lastRefreshFailureCategory, 'timeout');
  assert.strictEqual(staleFallback.message, '', 'provider error details must not leak into stale snapshots');
  assert.ok(staleFallback.warnings.includes('provider_usage_refresh_failed'));
  assert.strictEqual(providerUsageQuotaEvents(staleFallback, cachedScope).length, 0, 'stale fallback must not create quota events');
  const isolatedFailure = await cachedService.list(Object.assign({}, cachedScope, { hostProfileId: 'host-other' }));
  assert.strictEqual(isolatedFailure.ok, false, 'a cached snapshot must never cross host scope');
  assert.strictEqual(isolatedFailure.failureCategory, 'timeout');

  let expiringCount = 0;
  const expiringProvider = {
    id: 'expiring-fixture',
    providerUsageAvailable: true,
    async getUsage() {
      expiringCount += 1;
      if (expiringCount === 1) {
        return { ok: true, usage: { status: 'available', windows: [{ name: 'day', remaining: 1 }] } };
      }
      const error = new Error('expired fixture');
      error.code = 'provider_http_error';
      throw error;
    }
  };
  const expiringRegistry = {
    providers: new Map([['expiring-fixture', expiringProvider]]),
    resolve(providerId) {
      return this.providers.get(providerId) || null;
    }
  };
  const expiringService = new ProviderUsageService(expiringRegistry, { snapshotCacheTtlMs: 1 });
  const expiringScope = { providerId: 'expiring-fixture', hostProfileId: 'host-expiring' };
  await expiringService.list(expiringScope);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const expiredFallback = await expiringService.list(expiringScope);
  assert.strictEqual(expiredFallback.ok, false, 'an expired cache must not hide a failed refresh');
  assert.strictEqual(expiredFallback.failureCategory, 'provider_http_error');
  console.log('provider usage freshness smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
