'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const compatibility = require('../src/web/compatibility');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src/web/app.js'), 'utf8');

function capabilities(platformHost) {
  return {
    features: {
      browserHostCapabilityMetadata: true,
      browserPlatformHost: platformHost
    }
  };
}

const platformReady = compatibility.normalizeBrowserHost({
  hostId: 'platform-ready',
  label: 'Harmony host',
  hostKind: 'harmonyos',
  capabilitySource: 'platform',
  platformHost: true,
  connected: true,
  readiness: 'ready',
  supportedCommands: ['page.list', 'page.action'],
  supportedActions: ['click']
});
assert.strictEqual(platformReady.platformHost, true);
assert.strictEqual(compatibility.browserHostGate(platformReady, capabilities(true)).ok, true);
assert.strictEqual(compatibility.browserHostSupportsCommand(platformReady, 'page.list', capabilities(true)), true);
assert.strictEqual(compatibility.browserHostSupportsAction(platformReady, 'click', capabilities(true)), true);

const missingPlatformFeature = capabilities(false);
assert.strictEqual(compatibility.browserHostGate(platformReady, missingPlatformFeature).failureCategory, 'browser_platform_capability_unavailable');
assert.strictEqual(compatibility.browserHostSupportsCommand(platformReady, 'page.list', missingPlatformFeature), false);

const degradedPlatform = compatibility.normalizeBrowserHost({
  hostId: 'platform-degraded',
  hostKind: 'harmonyos',
  capabilitySource: 'platform',
  platformHost: true,
  connected: true,
  readiness: 'degraded',
  supportedCommands: ['page.list']
});
assert.strictEqual(compatibility.browserHostGate(degradedPlatform, capabilities(true)).failureCategory, 'browser_host_not_ready');
assert.strictEqual(compatibility.browserHostSupportsCommand(degradedPlatform, 'page.list', capabilities(true)), false);

const disconnectedPlatform = compatibility.normalizeBrowserHost({
  hostId: 'platform-disconnected',
  hostKind: 'harmonyos',
  capabilitySource: 'platform',
  platformHost: true,
  connected: false,
  readiness: 'ready',
  supportedCommands: ['page.list']
});
assert.strictEqual(compatibility.browserHostGate(disconnectedPlatform, capabilities(true)).failureCategory, 'browser_host_disconnected');

const legacyExternal = compatibility.normalizeBrowserHost({
  hostId: 'legacy-external',
  platform: 'electron',
  supportedCommands: ['page.list', 'page.action'],
  supportedActions: ['click']
});
assert.strictEqual(legacyExternal.platformHost, false);
assert.strictEqual(legacyExternal.readiness, 'legacy');
assert.strictEqual(legacyExternal.connected, true);
assert.strictEqual(compatibility.browserHostSupportsCommand(legacyExternal, 'page.list', { features: {} }), true);
assert.strictEqual(compatibility.browserHostSupportsAction(legacyExternal, 'click', { features: {} }), true);

const degradedExternal = compatibility.normalizeBrowserHost({
  hostId: 'degraded-external',
  platform: 'electron',
  connected: true,
  readiness: 'degraded',
  supportedCommands: ['page.list']
});
assert.strictEqual(compatibility.browserHostSupportsCommand(degradedExternal, 'page.list', { features: {} }), false);

const list = compatibility.normalizeBrowserHostList({
  hosts: [platformReady, null, { hostId: 'array-external', supportedCommands: ['page.list'] }],
  totalCount: 3,
  updatedAt: '2026-08-10T00:00:00.000Z'
});
assert.strictEqual(list.supported, true);
assert.strictEqual(list.hosts.length, 2);
assert.strictEqual(list.totalCount, 3);
assert.strictEqual(compatibility.normalizeResponse('browser.host.list', [{ hostId: 'legacy-array', supportedCommands: ['page.list'] }]).hosts.length, 1);
assert.strictEqual(compatibility.normalizeBrowserHost({ hostKind: 'harmonyos', supportedCommands: ['page.list'] }).connected, false);

assert.ok(appSource.includes('normalizeBrowserHostList'), 'Web UI must normalize Browser host list payloads');
assert.ok(appSource.includes('browserHostGate'), 'Web UI must render the Browser host readiness gate');
assert.ok(appSource.includes('browserHostSupportsAction'), 'Web UI must use the shared Browser action gate');
assert.ok(appSource.includes('browserHostSupportsCommand'), 'Web UI must use the shared Browser command gate');

process.stdout.write('web browser host capability smoke ok\n');
