'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildCompatibilityInfo } = require('../src/diagnostics');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function compatibilityOptions() {
  return {
    bridgeVersion: '2.0.0',
    minimumAppVersion: '1.0.0',
    recommendedAppVersion: '2.0.0',
    minimumBridgeVersion: '1.0.0',
    recommendedBridgeVersion: '2.0.0',
    clientProtocolVersion: 'agent-bridge.v2',
    minimumProtocolVersion: 'agent-bridge.v1',
    recommendedProtocolVersion: 'agent-bridge.v2',
    supportedProtocolVersions: ['agent-bridge.v1', 'agent-bridge.v2']
  };
}

function run() {
  const models = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const client = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const sessionController = readUtf8('entry/src/main/ets/features/agentHome/AgentHomeSessionWindowController.ets');
  const sessionPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentSessionWindowPage.ets');
  const homePage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const appConfig = readUtf8('AppScope/app.json5');

  assert(models.includes("hostProfileId: string = '', appVersion: string = ''"),
    'connection config must not invent an App version');
  assert(models.includes("appNonce: string, hostProfileId: string = '', appVersion: string = ''"),
    'hello payload must preserve unavailable App version semantics');
  assert(models.includes("platform: string = 'harmonyos', appVersion: string = ''"),
    'push payload must not invent an App version');
  assert(client.includes("registerPushToken(token: string, deviceId: string, appVersion: string = '')"),
    'push registration must use an explicitly supplied build version');
  assert(sessionController.includes('scope.hostProfileId,\n      appVersion\n'),
    'session window must pass unavailable version through to Bridge');
  assert(sessionPage.includes("private appVersion: string = '';"),
    'session window must start without a fabricated version');
  assert(sessionPage.includes('const versionName: string = info.versionName.trim();'),
    'session window must trim bundle build metadata');
  assert(homePage.includes('this.appBuildVersion = info.versionName.trim();'),
    'main window must normalize bundle build metadata');
  assert(homePage.includes('this.client.registerPushToken(token, this.activeDeviceId, this.appBuildVersion)'),
    'main window must pass the loaded build metadata to push registration');
  assert(/"versionName"\s*:\s*['"][^'"]+['"]/.test(appConfig),
    'AppScope must provide build version metadata');

  const unknown = buildCompatibilityInfo(compatibilityOptions());
  assert.strictEqual(unknown.status, 'unknown', 'missing App version must be unknown');
  assert.strictEqual(unknown.blocking, false, 'missing App version must not block legacy capabilities');
  assert(unknown.reason.includes('Client version'), 'unknown compatibility reason must identify missing metadata');
  assert(unknown.remediation.includes('build metadata'), 'unknown compatibility must provide controlled remediation');

  const compatible = buildCompatibilityInfo(Object.assign({}, compatibilityOptions(), { appVersion: '2.0.0' }));
  assert.strictEqual(compatible.status, 'compatible', 'reported build metadata must participate in compatibility');

  const tooOld = buildCompatibilityInfo(Object.assign({}, compatibilityOptions(), { appVersion: '0.9.0' }));
  assert.strictEqual(tooOld.status, 'appTooOld', 'real reported build metadata must enforce minimum version');
  assert.strictEqual(tooOld.blocking, true, 'below-minimum App build must be blocking');

  process.stdout.write('app compatibility build metadata smoke passed\n');
}

run();
