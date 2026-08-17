'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const compatibility = require('../src/web/compatibility');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'app.js'), 'utf8');

const bound = compatibility.normalizeBrowserActionResult({
  ok: true,
  preview: true,
  confirmed: false,
  planId: 'plan-bound',
  action: 'click',
  target: {
    workspaceId: 'workspace-1',
    agentId: 'agent-1',
    hostId: 'host-1',
    instanceId: 'instance-1',
    pageId: 'page-1',
    action: 'CLICK'
  },
  targetState: { mode: 'bound' },
  warnings: ['This browser action can modify page or workspace state.']
});
assert.strictEqual(bound.target.action, 'click');
assert.deepStrictEqual(bound.targetState, { mode: 'bound' });
assert.strictEqual(bound.planId, 'plan-bound');

const legacy = compatibility.normalizeBrowserActionResult({
  ok: true,
  preview: true,
  targetState: { mode: 'legacy' },
  warnings: ['browser_target_snapshot_unavailable']
});
assert.deepStrictEqual(legacy.targetState, { mode: 'legacy' });
assert.deepStrictEqual(legacy.warnings, ['browser_target_snapshot_unavailable']);

const changed = compatibility.normalizeBrowserActionResult({
  ok: false,
  failureCategory: 'browser_target_changed',
  message: 'The browser page changed after the action preview.',
  remediation: 'Request a fresh action preview before confirming the action.'
});
assert.strictEqual(changed.ok, false);
assert.strictEqual(changed.failureCategory, 'browser_target_changed');
assert.strictEqual(changed.targetState.mode, 'unknown');

const oldBridge = compatibility.normalizeBrowserActionResult({ ok: true, accepted: true, action: 'click' });
assert.strictEqual(oldBridge.targetState.mode, 'unknown');
assert.strictEqual(oldBridge.target.action, 'click');

assert(appSource.includes('normalizeBrowserActionResult'), 'Web UI must normalize browser action result state');
assert(appSource.includes('target snapshot unavailable'), 'Web UI must surface legacy target-state warning');
assert(appSource.includes('browser.page.action'), 'Web UI must retain browser action preview/confirm RPC');

console.log('web browser target state smoke ok');
