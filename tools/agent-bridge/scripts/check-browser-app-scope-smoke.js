'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function main() {
  const models = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const coordinator = readUtf8('entry/src/main/ets/features/agentHome/AgentHomeBrowserRequestCoordinator.ets');
  const page = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const tests = readUtf8('entry/src/test/AgentHomeBrowserRequestCoordinator.test.ets');

  assert(models.includes("eventKind: string = ''"), 'Browser result should retain lifecycle event kind');
  assert(models.includes("host: AgentBridgeBrowserHostRecord = new AgentBridgeBrowserHostRecord()"), 'Browser result should parse a singular host event record');
  assert(models.includes("extractStringProperty(value, 'kind')"), 'Browser parser should read lifecycle kind from the event payload');
  assert(models.includes("extractObjectProperty(value, 'host')"), 'Browser parser should read host lifecycle payloads');
  assert(coordinator.includes('class AgentHomeBrowserEventScopeCoordinator'), 'App should centralize Browser event scope validation');
  assert(coordinator.includes('class AgentHomeBrowserCapabilityPolicy'), 'App should centralize Browser capability readiness policy');
  assert(coordinator.includes("hostKind === 'harmonyos'"), 'Platform Browser hosts must be identified explicitly');
  assert(coordinator.includes('platformHostEnabled'), 'Platform Browser readiness must use the Bridge capability flag');
  assert(coordinator.includes('browser.host.registered'), 'Registered host events must require workspace scope');
  assert(coordinator.includes('browser.host.unregistered'), 'Unregistered host events must require selected host scope');
  assert(page.includes('this.browserEventScopeCoordinator.accepts('), 'Page must gate unsolicited Browser events');
  assert(page.includes('AgentHomeBrowserCapabilityPolicy.isReady('), 'Page must use the shared Browser readiness policy');
  assert(page.includes('features.browserPlatformHost'), 'Page must gate platform Browser hosts by capability');
  assert(page.includes('this.agentHomePageVisible'), 'Browser events must be ignored while the page is hidden');
  assert(page.includes('private clearBrowserWorkspaceState(): void'), 'Workspace changes must clear Browser state');
  assert(page.includes('private updateActiveWorkspaceId(workspaceId: string): void'), 'Workspace assignment must use Browser state gate');
  assert(page.includes('this.updateActiveWorkspaceId(workspaceId);'), 'Workspace activation must invalidate old Browser state');
  assert(tests.includes('acceptsOnlyVisibleCurrentWorkspaceLifecycleEvents'), 'Scope tests must cover visibility and workspace mismatch');
  assert(tests.includes('requiresHostWorkspaceForRegisteredEvents'), 'Scope tests must cover host registration workspace scope');
  assert(tests.includes('rejectsStalePageAndUnselectedHostEvents'), 'Scope tests must cover stale page and host events');
  process.stdout.write('browser app scope smoke ok\n');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
