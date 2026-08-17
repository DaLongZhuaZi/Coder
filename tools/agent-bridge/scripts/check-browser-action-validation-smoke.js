'use strict';

const assert = require('assert');
const {
  MAX_BROWSER_ACTION_TEXT_BYTES,
  validateBrowserActionPayload
} = require('../src/browser-automation-manager');

function expectFailure(payload, category) {
  const result = validateBrowserActionPayload(payload);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failureCategory, category);
}

function main() {
  expectFailure({ action: 'click' }, 'browser_action_ref_invalid');
  expectFailure({ action: 'evaluate', functionSource: ' ' }, 'browser_script_empty');
  expectFailure({ action: 'type', text: 'x'.repeat(MAX_BROWSER_ACTION_TEXT_BYTES + 1) }, 'browser_action_input_too_large');
  expectFailure({ action: 'keypress', key: 'Enter\u0000' }, 'browser_action_key_invalid');
  expectFailure({ action: 'click', ref: '@e1', hostId: 'host\ninvalid' }, 'browser_action_scope_invalid');
  expectFailure({ action: 'scroll', deltaY: 'not-a-number' }, 'browser_action_scroll_invalid');
  expectFailure({ action: 'drag', sourceRef: '@source' }, 'browser_action_target_invalid');
  expectFailure({ action: 'evaluate', function: '() => 1', functionSource: '() => 2' }, 'browser_script_ambiguous');

  const legacyDrag = validateBrowserActionPayload({ action: 'drag', sourceRef: '@source', toX: 12, toY: 24 });
  assert.strictEqual(legacyDrag.ok, true);
  assert.strictEqual(legacyDrag.payload.targetX, 12);
  assert.strictEqual(legacyDrag.payload.targetY, 24);

  const valid = validateBrowserActionPayload({ action: 'evaluate', functionSource: '() => document.title' });
  assert.strictEqual(valid.ok, true);
  assert.strictEqual(valid.payload.function, '() => document.title');

  const projected = validateBrowserActionPayload({
    workspaceId: 'workspace-1',
    agentId: 'agent-1',
    hostId: 'host-1',
    instanceId: 'instance-1',
    pageId: 'page-1',
    action: 'click',
    ref: '@e1',
    url: 'https://user:password@example.invalid/private',
    cwd: 'C:\\Users\\coder\\private',
    headers: { authorization: 'Bearer secret' },
    filePaths: ['C:\\Users\\coder\\private.txt'],
    functionSource: '() => secret'
  });
  assert.strictEqual(projected.ok, true);
  assert.deepStrictEqual(Object.keys(projected.payload).sort(), [
    'action', 'agentId', 'hostId', 'instanceId', 'pageId', 'ref', 'workspaceId'
  ]);
  assert.strictEqual(projected.payload.url, undefined);
  assert.strictEqual(projected.payload.headers, undefined);

  const dragSteps = validateBrowserActionPayload({ action: 'drag', sourceRef: '@source', targetRef: '@target', steps: '12' });
  assert.strictEqual(dragSteps.ok, true);
  assert.strictEqual(dragSteps.payload.steps, 12);
  expectFailure({ action: 'drag', sourceRef: '@source', targetRef: '@target', steps: 2.5 }, 'browser_action_steps_invalid');
  console.log('browser action validation smoke ok');
}

main();
