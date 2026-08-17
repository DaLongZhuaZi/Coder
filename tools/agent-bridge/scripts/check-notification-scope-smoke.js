'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-notification-scope-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const {
  NotificationManager,
  notificationFromBridgeEvent,
  notificationFromTerminalAttention
} = require('../src/notification-manager');
const { EventType, makeEvent } = require('../src/protocol');

function createHostNotification(manager, hostProfileId, notificationId, kind) {
  const item = manager.create({
    notificationId,
    hostProfileId,
    kind,
    severity: 'info',
    title: hostProfileId,
    body: 'Scoped notification.'
  });
  assert.ok(item, 'notification should be created');
  return item;
}

function main() {
  const store = createDaemonStore(tempHome);
  const manager = new NotificationManager(store);

  const hostA = createHostNotification(manager, 'host-a', 'notification-a', 'agent');
  const hostB = createHostNotification(manager, 'host-b', 'notification-b', 'terminal');
  const legacy = createHostNotification(manager, '', 'notification-legacy', 'info');

  const listedA = manager.list({ includeRead: true }, 'host-a');
  assert.deepStrictEqual(listedA.notifications.map((item) => item.notificationId), [hostA.notificationId]);
  assert.strictEqual(listedA.unreadCount, 1);

  const listedB = manager.list({ includeRead: true }, 'host-b');
  assert.deepStrictEqual(listedB.notifications.map((item) => item.notificationId), [hostB.notificationId]);
  assert.strictEqual(listedB.unreadCount, 1);

  const listedLegacy = manager.list({ includeRead: true });
  assert.strictEqual(listedLegacy.totalCount, 3, 'missing host scope keeps legacy all-notifications behavior');

  const crossHostRead = manager.markRead({ notificationId: hostB.notificationId }, 'host-a');
  assert.strictEqual(crossHostRead.ok, false);
  assert.strictEqual(manager.list({ includeRead: true }, 'host-b').notifications[0].read, false);

  const crossHostAction = manager.handleAction({ notificationId: hostB.notificationId, actionId: 'open' }, 'host-a');
  assert.strictEqual(crossHostAction.ok, false);
  assert.strictEqual(crossHostAction.failureCategory, 'not_found');
  assert.strictEqual(manager.list({ includeRead: true }, 'host-b').notifications[0].clicked, false);

  const expiredA = manager.create({
    notificationId: 'expired-a',
    hostProfileId: 'host-a',
    kind: 'info',
    title: 'Expired A',
    body: 'Expired scoped notification.',
    createdAt: '2020-01-01T00:00:00.000Z',
    ttlMs: 1
  });
  assert.ok(expiredA);
  const pruneA = manager.prune({}, 'host-a');
  assert.strictEqual(pruneA.removedCount, 1);
  assert.strictEqual(pruneA.remainingCount, 1);
  assert.strictEqual(manager.list({ includeRead: true }, 'host-b').totalCount, 1);
  assert.strictEqual(manager.list({ includeRead: true }).totalCount, 3);

  const permission = notificationFromBridgeEvent(makeEvent(EventType.PERMISSION_REQUESTED, 'session-a', {
    requestId: 'permission-a',
    title: 'Approve',
    prompt: 'Approve?'
  }), { id: 'agent-a' }, 'host-a');
  assert.strictEqual(permission.hostProfileId, 'host-a');
  const terminal = notificationFromTerminalAttention(makeEvent(EventType.TERMINAL_ATTENTION, '', {
    terminalId: 'terminal-b',
    reason: 'needs_input'
  }), 'host-b');
  assert.strictEqual(terminal.hostProfileId, 'host-b');

  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('notification scope smoke ok');
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
