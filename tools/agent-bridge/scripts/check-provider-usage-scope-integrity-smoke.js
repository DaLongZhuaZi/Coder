'use strict';

const assert = require('assert');
const { ProviderUsageService, providerUsageQuotaEvents } = require('../src/provider-usage-service');

async function main() {
  const registry = {
    providers: new Map([
      ['fixture', {
        id: 'fixture',
        providerUsageAvailable: true,
        async getUsage() {
          return {
            ok: true,
            hostProfileId: 'provider-host',
            sessionId: 'provider-session',
            agentId: 'provider-agent',
            usage: {
              status: 'available',
              windows: [{ name: 'day', remaining: 7, limit: 10 }]
            },
            window: 'month'
          };
        }
      }]
    ]),
    resolve(providerId) {
      return this.providers.get(providerId) || null;
    }
  };
  const service = new ProviderUsageService(registry);
  const requestedScope = {
    providerId: 'fixture',
    hostProfileId: 'request-host',
    sessionId: 'request-session',
    agentId: 'request-agent',
    window: 'day'
  };
  const result = await service.list(requestedScope);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hostProfileId, 'request-host', 'request host scope must override provider response');
  assert.strictEqual(result.sessionId, 'request-session', 'request session scope must override provider response');
  assert.strictEqual(result.agentId, 'request-agent', 'request agent scope must override provider response');
  assert.strictEqual(result.window, 'day', 'request usage window must override provider response');
  assert.ok(result.warnings.includes('provider_scope_response_ignored'), 'scope mismatch must be visible as a stable warning');

  const events = providerUsageQuotaEvents(result, requestedScope);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].hostProfileId, 'request-host');
  assert.strictEqual(events[0].sessionId, 'request-session');
  assert.strictEqual(events[0].agentId, 'request-agent');

  const legacyResult = await service.list({ providerId: 'fixture' });
  assert.strictEqual(legacyResult.hostProfileId, 'provider-host', 'legacy unscoped callers retain response compatibility');
  assert.strictEqual(legacyResult.sessionId, 'provider-session');
  assert.strictEqual(legacyResult.agentId, 'provider-agent');
  console.log('provider usage scope integrity smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
