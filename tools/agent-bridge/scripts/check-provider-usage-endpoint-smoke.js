#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { ProviderUsageService, normalizeUsageEndpoint } = require('../src/provider-usage-service');

function response(status, body, location) {
  const bytes = Buffer.from(body, 'utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'location' ? (location || '') : '' },
    arrayBuffer: async () => bytes
  };
}

async function main() {
  assert.strictEqual(normalizeUsageEndpoint('https://usage.example.test/quota').url, 'https://usage.example.test/quota');
  assert.strictEqual(normalizeUsageEndpoint('http://usage.example.test/quota').failureCategory, 'insecure_endpoint');
  assert.strictEqual(normalizeUsageEndpoint('https://user:pass@usage.example.test/quota').failureCategory, 'endpoint_credentials_not_allowed');

  const previousFetch = global.fetch;
  const previousToken = process.env.AGENT_BRIDGE_FIXTURE_USAGE_TOKEN;
  const calls = [];
  try {
    process.env.AGENT_BRIDGE_FIXTURE_USAGE_TOKEN = 'fixture-secret';
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/start')) return response(302, '', 'https://usage.example.test/final');
      return response(200, JSON.stringify({ usage: { status: 'available', plan: 'Fixture', windows: [{ name: 'day', remaining: 4, limit: 10 }] } }));
    };
    const provider = {
      id: 'fixture',
      usageEndpoint: 'https://usage.example.test/start',
      usageEndpointTokenEnv: 'AGENT_BRIDGE_FIXTURE_USAGE_TOKEN'
    };
    const registry = { resolve: (providerId) => providerId === 'fixture' ? provider : null, providers: new Map([['fixture', provider]]) };
    const service = new ProviderUsageService(registry);
    assert.strictEqual(service.anyAvailable(), true, 'an HTTPS endpoint-only provider must publish the global providerUsage capability');
    assert.strictEqual(service.isAvailable('fixture'), true);
    const listed = await service.list({ providerId: 'fixture', hostProfileId: 'host-a', window: 'day' });
    assert.strictEqual(listed.ok, true);
    assert.strictEqual(listed.windows[0].remaining, 4);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer fixture-secret');
    assert.strictEqual(Object.keys(listed).includes('usageEndpoint'), false);
    assert.strictEqual(Object.keys(listed).includes('usageEndpointToken'), false);

    const insecureProvider = { id: 'insecure', usageEndpoint: 'http://usage.example.test/quota' };
    const insecureRegistry = { resolve: () => insecureProvider, providers: new Map([['insecure', insecureProvider]]) };
    const insecureResult = await new ProviderUsageService(insecureRegistry).list({ providerId: 'insecure' });
    assert.strictEqual(insecureResult.ok, false);
    assert.strictEqual(insecureResult.failureCategory, 'insecure_endpoint');

    global.fetch = async () => response(302, '', 'http://usage.example.test/insecure');
    const redirectResult = await service.list({ providerId: 'fixture' });
    assert.strictEqual(redirectResult.ok, false);
    assert.strictEqual(redirectResult.failureCategory, 'redirect_to_insecure_endpoint');

    const crossOriginCalls = [];
    global.fetch = async (url, options) => {
      crossOriginCalls.push({ url, options });
      return response(302, '', 'https://other-usage.example.test/final');
    };
    const crossOriginResult = await service.list({ providerId: 'fixture' });
    assert.strictEqual(crossOriginResult.ok, false);
    assert.strictEqual(crossOriginResult.failureCategory, 'redirect_origin_changed');
    assert.strictEqual(crossOriginCalls.length, 1);
    assert.strictEqual(crossOriginCalls[0].options.headers.Authorization, 'Bearer fixture-secret');
    console.log('provider usage endpoint smoke ok');
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.AGENT_BRIDGE_FIXTURE_USAGE_TOKEN;
    else process.env.AGENT_BRIDGE_FIXTURE_USAGE_TOKEN = previousToken;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
