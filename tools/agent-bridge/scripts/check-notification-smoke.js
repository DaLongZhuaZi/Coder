'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-notification-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const {
  NotificationManager,
  notificationFromBridgeEvent,
  notificationFromTerminalAttention
} = require('../src/notification-manager');
const { EventType, makeEvent } = require('../src/protocol');

function main() {
  const store = createDaemonStore(tempHome);
  const manager = new NotificationManager(store);
  assert.strictEqual(manager.isAvailable(), true);

  const permissionEvent = makeEvent(EventType.PERMISSION_REQUESTED, 'session-1', {
    requestId: 'perm-1',
    title: 'Approve command',
    prompt: 'Run git status?'
  });
  const permissionDraft = notificationFromBridgeEvent(permissionEvent, {
    id: 'agent-1'
  });
  assert.strictEqual(permissionDraft.kind, 'permission');
  assert.strictEqual(permissionDraft.route.requestId, 'perm-1');
  const permissionNotification = manager.create(permissionDraft);
  assert.ok(permissionNotification.notificationId.length > 0);
  assert.strictEqual(permissionNotification.read, false);

  const terminalDraft = notificationFromTerminalAttention(makeEvent(EventType.TERMINAL_ATTENTION, '', {
    terminalId: 'term-1',
    reason: 'needs_input',
    terminal: {
      terminalId: 'term-1',
      workspaceId: 'workspace-1'
    }
  }));
  assert.strictEqual(terminalDraft.kind, 'terminal_attention');
  assert.strictEqual(terminalDraft.route.terminalId, 'term-1');
  manager.create(terminalDraft);
  const expiredNotification = manager.create({
    kind: 'info',
    severity: 'info',
    title: 'Expired notification',
    body: 'This notification should be pruned.',
    createdAt: '2020-01-01T00:00:00.000Z',
    ttlMs: 1
  });
  assert.ok(expiredNotification.expiresAt.length > 0);

  const listed = manager.list({ includeRead: true, limit: 10 });
  assert.strictEqual(listed.notifications.length, 2);
  assert.strictEqual(listed.unreadCount, 2);
  assert.strictEqual(listed.prunedCount, 1);

  const pruneEmpty = manager.prune({});
  assert.strictEqual(pruneEmpty.removedCount, 0);
  assert.strictEqual(pruneEmpty.remainingCount, 2);

  const readResult = manager.markRead({
    notificationId: permissionNotification.notificationId
  });
  assert.strictEqual(readResult.ok, true);
  assert.strictEqual(readResult.unreadCount, 1);

  const actionResult = manager.handleAction({
    notificationId: permissionNotification.notificationId,
    actionId: 'open'
  });
  assert.strictEqual(actionResult.ok, true);
  assert.strictEqual(actionResult.route.kind, 'permission');
  assert.strictEqual(actionResult.route.sessionId, 'session-1');
  assert.strictEqual(actionResult.route.agentId, 'agent-1');

  const missing = manager.handleAction({
    notificationId: 'missing',
    actionId: 'open'
  });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.failureCategory, 'not_found');

  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('notification smoke ok');
}

try {
  main();
} catch (error) {
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Ignore cleanup errors.
  }
  console.error(error);
  process.exitCode = 1;
}
