'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function requireSource(source, fragment, description) {
  assert.ok(source.includes(fragment), description);
}

function main() {
  const page = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const client = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const models = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const parserTests = readUtf8('entry/src/test/AgentBridgeBrowserParser.test.ets');
  const uploadPolicy = readUtf8('entry/src/main/ets/features/agentHome/AgentHomeBrowserUploadPolicy.ets');
  const zh = readUtf8('entry/src/main/resources/base/element/string.json');
  const en = readUtf8('entry/src/main/resources/en_US/element/string.json');

  requireSource(models, 'fullPage: boolean = false;', 'Browser payload and result must retain fullPage support');
  requireSource(client, 'requestBrowserScreenshot(workspaceId: string, pageId: string, fullPage: boolean = false', 'Client must forward the fullPage request flag');
  requireSource(page, 'browserScreenshotFullPage: boolean = false;', 'App must retain the full-page screenshot preference');
  requireSource(page, 'Toggle({ type: ToggleType.Switch, isOn: this.browserScreenshotFullPage })', 'App must expose a full-page screenshot toggle');
  requireSource(page, 'this.browserScreenshotFullPage = value;', 'App must update the full-page screenshot toggle state');
  requireSource(page, 'this.browserScreenshotFullPage,', 'App must forward fullPage to the Browser screenshot RPC');
  requireSource(parserTests, 'expect(result.screenshot.fullPage).assertTrue();', 'App parser test must cover a full-page screenshot response');
  requireSource(zh, 'agent_home_browser_screenshot_full_page', 'Chinese full-page screenshot label must be localized');
  requireSource(en, 'agent_home_browser_screenshot_full_page', 'English full-page screenshot label must be localized');
  requireSource(uploadPolicy, 'resolveSelectedFilePath', 'Browser uploads must remain constrained to selected workspace files');
  requireSource(page, 'this.showBrowserActionPreview(result);', 'Sensitive Browser actions must retain preview handling');
  requireSource(page, 'this.browserActionConfirmPayload(result.planId);', 'Sensitive Browser actions must retain confirm handling');

  const actions = ['click', 'fill', 'type', 'keypress', 'hover', 'select', 'drag', 'upload', 'scroll', 'download', 'evaluate'];
  for (const action of actions) {
    requireSource(page, "new AgentHomeBrowserActionOption('" + action + "'", 'App must retain the ' + action + ' Browser action entry');
  }

  process.stdout.write('browser app action surface smoke ok\n');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
