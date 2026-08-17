'use strict';

const assert = require('assert');
const { ProviderCatalog, normalizeProviderDescriptor } = require('../src/provider-catalog');
const { ProviderRegistry, withProviderUsageCapability } = require('../src/provider-registry');
const { MockProvider } = require('../src/providers/mock-provider');
const {
  CliProvider,
  createAntigravityProvider,
  createClaudeProvider,
  createHermesProvider,
  createOpenClawProvider
} = require('../src/providers/cli-provider');
const { CodexAppServerProvider } = require('../src/providers/codex-app-server-provider');

function defaults() {
  return {
    now: Date.now(),
    cacheStatus: 'cold',
    fallbackSource: 'runtime'
  };
}

async function main() {
  const invalidCodex = new CodexAppServerProvider({ runtime: 'invalid' });
  const invalidCodexDescriptor = await invalidCodex.describe();
  assert.strictEqual(invalidCodexDescriptor.capabilities.usageEvents, false, 'invalid Codex runtime must not publish usage events');
  assert.strictEqual(invalidCodexDescriptor.capabilities.metadataGeneration, false, 'invalid Codex runtime must not publish metadata generation');

  const normalized = normalizeProviderDescriptor({
    id: 'minimal',
    status: 'available',
    runtimeMode: 'invalid',
    capabilities: {},
    sessionFeatures: {}
  }, defaults());
  assert.strictEqual(normalized.runtimeMode, 'oneshot');
  assert.strictEqual(normalized.capabilities.interactiveSessions, false);
  assert.strictEqual(normalized.sessionFeatures.attach, false);
  assert.strictEqual(normalized.sessionFeatures.abort, false);
  assert.strictEqual(normalized.sessionFeatures.resume, false);

  const unavailable = normalizeProviderDescriptor({
    id: 'missing',
    status: 'unavailable',
    capabilities: { health: 'not installed' },
    models: [{ id: 'configured', displayName: 'Configured', available: true }],
    tools: [{ id: 'missing.run', displayName: 'Run', available: true }]
  }, defaults());
  assert.strictEqual(unavailable.models[0].available, false);
  assert.strictEqual(unavailable.tools[0].available, false);

  const stdio = new CliProvider({
    id: 'profile.stdio',
    command: process.execPath,
    runtimeMode: 'stdio',
    models: [{ id: 'configured', displayName: 'Configured' }]
  });
  const oneshot = new CliProvider({
    id: 'profile.oneshot',
    command: process.execPath,
    runtimeMode: 'oneshot',
    models: [{ id: 'configured', displayName: 'Configured' }]
  });
  const usageConfigured = new CliProvider({
    id: 'profile.usage',
    command: process.execPath,
    runtimeMode: 'oneshot',
    usageEndpoint: 'https://usage.example.test/v1/usage',
    models: [{ id: 'configured', displayName: 'Configured' }]
  });
  const insecureUsageConfigured = new CliProvider({
    id: 'profile.insecure-usage',
    command: process.execPath,
    runtimeMode: 'oneshot',
    usageEndpoint: 'http://usage.example.test/v1/usage',
    models: [{ id: 'configured', displayName: 'Configured' }]
  });
  const credentialUsageConfigured = new CliProvider({
    id: 'profile.credential-usage',
    command: process.execPath,
    runtimeMode: 'oneshot',
    usageEndpoint: 'https://user:password@usage.example.test/v1/usage',
    models: [{ id: 'configured', displayName: 'Configured' }]
  });
  const mockProvider = new MockProvider();
  const mockDescriptor = withProviderUsageCapability(mockProvider, mockProvider.describe());
  assert.strictEqual(mockDescriptor.capabilities.usageEvents, true, 'Mock provider usage events must remain available');
  assert.strictEqual(mockDescriptor.capabilities.metadataGeneration, true, 'Mock provider metadata generation must remain available');
  const stdioDescriptor = await stdio.describe();
  const oneshotDescriptor = await oneshot.describe();
  assert.strictEqual(stdioDescriptor.capabilities.interactiveSessions, true);
  assert.strictEqual(stdioDescriptor.sessionFeatures.attach, true);
  assert.strictEqual(stdioDescriptor.sessionFeatures.abort, true);
  assert.strictEqual(stdioDescriptor.sessionFeatures.resume, false);
  assert.strictEqual(oneshotDescriptor.capabilities.interactiveSessions, false);
  assert.strictEqual(oneshotDescriptor.sessionFeatures.attach, false);

  const builtinCliProviders = [
    createClaudeProvider({ command: process.execPath }),
    createAntigravityProvider({ command: process.execPath }),
    createOpenClawProvider({ command: process.execPath }),
    createHermesProvider({ command: process.execPath })
  ];
  for (const provider of builtinCliProviders) {
    const descriptor = await provider.describe();
    assert.strictEqual(descriptor.runtimeMode, 'oneshot', provider.id + ' must remain oneshot');
    assert.strictEqual(descriptor.capabilities.interactiveSessions, false, provider.id + ' must not advertise interactive sessions');
    assert.strictEqual(descriptor.sessionFeatures.attach, false, provider.id + ' must not advertise attach');
    assert.strictEqual(descriptor.sessionFeatures.abort, true, provider.id + ' must support aborting an active oneshot run');
    assert.strictEqual(descriptor.sessionFeatures.resume, false, provider.id + ' must not advertise runtime resume');
  }

  const registry = new ProviderRegistry();
  const attachable = {
    id: 'fake.service',
    supportsInteractiveSessions: true,
    sessions: new Map([['fake.service:remote', { sessionId: 'fake.service:remote' }]]),
    getSession(sessionId) {
      return this.sessions.get(sessionId) || null;
    },
    async attachSession(payload) {
      return { providerId: this.id, sessionId: payload.sessionId, runtimeMode: 'service', interactiveReady: true };
    },
    async describe() {
      return {
        id: this.id,
        status: 'available',
        runtimeMode: 'service',
        capabilities: { interactiveSessions: true, metadataGeneration: true, usageEvents: true },
        sessionFeatures: { attach: true, abort: true, resume: true }
      };
    },
    async listSessions() {
      return Array.from(this.sessions.values());
    }
  };
  registry.register(attachable);
  registry.register(oneshot);
  registry.register(usageConfigured);
  registry.register(insecureUsageConfigured);
  registry.register(credentialUsageConfigured);
  assert.strictEqual(registry.hasInteractiveSessions(), true);
  const attached = await registry.attachSession({ providerId: attachable.id, sessionId: 'fake.service:remote' }, () => {});
  assert.strictEqual(attached.runtimeMode, 'service');

  assert.strictEqual(registry.hasUsageEvents(), false,
    'top-level usageEvents must remain false when no registered provider exposes a runtime producer');
  assert.strictEqual(registry.hasMetadataGeneration(), false,
    'top-level metadataGeneration must remain false when no registered provider exposes a runtime method');

  const runtimeCapabilityRegistry = new ProviderRegistry();
  runtimeCapabilityRegistry.register(mockProvider);
  assert.strictEqual(runtimeCapabilityRegistry.hasUsageEvents(), true,
    'a registered usage producer must enable the top-level usageEvents capability');
  assert.strictEqual(runtimeCapabilityRegistry.hasMetadataGeneration(), true,
    'a registered metadata producer must enable the top-level metadataGeneration capability');

  const invalidRuntimeRegistry = new ProviderRegistry();
  invalidRuntimeRegistry.register(invalidCodex);
  assert.strictEqual(invalidRuntimeRegistry.hasUsageEvents(), false,
    'an invalid runtime must not enable top-level usageEvents');
  assert.strictEqual(invalidRuntimeRegistry.hasMetadataGeneration(), false,
    'an invalid runtime must not enable top-level metadataGeneration');

  const blockedRuntime = {
    id: 'blocked.runtime',
    runtimePreference: 'exec',
    runtimeConfigError: 'runtime is unavailable',
    usageEventsAvailable: true,
    generateMetadataResult() {
      return { suggestion: 'blocked' };
    },
    async describe() {
      return {
        id: this.id,
        status: 'unavailable',
        capabilities: { usageEvents: true, metadataGeneration: true }
      };
    }
  };
  const blockedDescriptor = withProviderUsageCapability(blockedRuntime, await blockedRuntime.describe());
  assert.strictEqual(blockedDescriptor.capabilities.usageEvents, false,
    'runtime config errors and exec fallbacks must not publish usage events');
  assert.strictEqual(blockedDescriptor.capabilities.metadataGeneration, false,
    'runtime config errors and exec fallbacks must not publish metadata generation');
  const blockedRuntimeRegistry = new ProviderRegistry();
  blockedRuntimeRegistry.register(blockedRuntime);
  assert.strictEqual(blockedRuntimeRegistry.hasUsageEvents(), false,
    'blocked runtimes must not enable top-level usageEvents');
  assert.strictEqual(blockedRuntimeRegistry.hasMetadataGeneration(), false,
    'blocked runtimes must not enable top-level metadataGeneration');

  const catalog = new ProviderCatalog(registry);
  const result = await catalog.fetch({ scope: 'global', force: true });
  assert.strictEqual(result.providers.length, 5);
  assert(result.providers.every((provider) => provider.sessionFeatures && typeof provider.sessionFeatures.attach === 'boolean'));
  const descriptors = await registry.listCapabilities();
  const attachableDescriptor = descriptors.find((provider) => provider.id === attachable.id);
  const usageDescriptor = descriptors.find((provider) => provider.id === usageConfigured.id);
  const oneshotDescriptorWithCapability = descriptors.find((provider) => provider.id === oneshot.id);
  const insecureUsageDescriptor = descriptors.find((provider) => provider.id === insecureUsageConfigured.id);
  const credentialUsageDescriptor = descriptors.find((provider) => provider.id === credentialUsageConfigured.id);
  assert.strictEqual(attachableDescriptor.capabilities.providerUsage, false, 'providers without a usage adapter or endpoint must publish false');
  assert.strictEqual(usageDescriptor.capabilities.providerUsage, true, 'configured HTTPS usage endpoints must publish providerUsage');
  assert.strictEqual(oneshotDescriptorWithCapability.capabilities.providerUsage, false, 'unconfigured providers must not inherit the global usage flag');
  assert.strictEqual(insecureUsageDescriptor.capabilities.providerUsage, false, 'HTTP usage endpoints must not publish providerUsage');
  assert.strictEqual(credentialUsageDescriptor.capabilities.providerUsage, false, 'usage endpoints with embedded credentials must not publish providerUsage');
  assert.strictEqual(attachableDescriptor.capabilities.metadataGeneration, false, 'metadataGeneration must require a runtime method');
  assert.strictEqual(attachableDescriptor.capabilities.usageEvents, false, 'usageEvents must require a runtime producer marker');
  assert.strictEqual(result.providers.find((provider) => provider.id === usageConfigured.id).capabilities.providerUsage, true, 'catalog must preserve providerUsage capability');
  console.log('provider runtime capability smoke ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
