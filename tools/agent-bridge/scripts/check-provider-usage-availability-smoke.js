'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ProviderUsageService,
  normalizeProviderUsage,
  normalizeProviderUsageAvailabilityState
} = require('../src/provider-usage-service');

async function main() {
  const available = normalizeProviderUsage('fixture', {
    ok: true,
    usage: {
      status: 'available',
      windows: [{ name: 'session', remaining: 10, limit: 20 }]
    }
  });
  assert.strictEqual(available.ok, true);
  assert.strictEqual(available.availabilityState, 'available');

  const empty = normalizeProviderUsage('fixture', {
    ok: true,
    usage: { status: 'available', windows: [], details: [] }
  });
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.availabilityState, 'available-empty');

  const stale = normalizeProviderUsage('fixture', {
    ok: true,
    usage: {
      status: 'available',
      expiresAt: '2020-01-01T00:00:00Z',
      windows: [{ name: 'day', remaining: 1, limit: 2 }]
    }
  });
  assert.strictEqual(stale.ok, true);
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.availabilityState, 'stale');

  const unsupported = normalizeProviderUsage('fixture', {
    ok: false,
    failureCategory: 'capability_unavailable',
    usage: { status: 'unavailable' }
  });
  assert.strictEqual(unsupported.ok, false);
  assert.strictEqual(unsupported.availabilityState, 'unsupported');

  const failed = normalizeProviderUsage('fixture', {
    ok: false,
    failureCategory: 'timeout',
    usage: { status: 'unavailable' }
  });
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.availabilityState, 'failed');

  const loading = normalizeProviderUsage('fixture', {
    ok: true,
    usage: { status: 'available', availabilityState: 'loading' }
  });
  assert.strictEqual(loading.availabilityState, 'loading');

  const invalidState = normalizeProviderUsage('fixture', {
    ok: true,
    usage: { status: 'available', availabilityState: 'not-a-state' }
  });
  assert.strictEqual(invalidState.availabilityState, 'available-empty');
  assert.strictEqual(normalizeProviderUsageAvailabilityState('STALE'), 'stale');
  assert.strictEqual(normalizeProviderUsageAvailabilityState('invalid'), '');

  const throwingProvider = {
    id: 'throwing',
    providerUsageAvailable: true,
    async getUsage() {
      throw new Error('fixture failure');
    }
  };
  const registry = {
    providers: new Map([['throwing', throwingProvider]]),
    resolve(providerId) {
      const provider = this.providers.get(providerId);
      if (!provider) throw new Error('missing provider');
      return provider;
    }
  };
  const service = new ProviderUsageService(registry);
  const serviceFailure = await service.list({ providerId: 'throwing' });
  assert.strictEqual(serviceFailure.availabilityState, 'failed');
  const serviceUnsupported = await service.list({ providerId: 'missing' });
  assert.strictEqual(serviceUnsupported.availabilityState, 'unsupported');

  const modelSource = fs.readFileSync(path.resolve(__dirname, '../../../entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets'), 'utf8');
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../../../entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets'), 'utf8');
  assert.ok(modelSource.includes('AgentBridgeProviderUsageAvailabilityState'), 'App model must define usage availability states');
  assert.ok(modelSource.includes('availabilityState: string'), 'App usage result must expose availabilityState');
  assert.ok(modelSource.includes("extractStringProperty(sourceObject, 'availabilityState')"), 'App parser must read availabilityState');
  assert.ok(pageSource.includes('agent_home_provider_usage_unsupported'), 'App must localize unsupported usage');
  assert.ok(pageSource.includes('agent_home_provider_usage_empty'), 'App must localize empty usage');
  assert.ok(pageSource.includes('agent_home_provider_usage_failed'), 'App must localize failed usage');

  console.log('provider usage availability smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

