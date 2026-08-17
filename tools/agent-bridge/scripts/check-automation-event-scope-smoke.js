'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  rememberAutomationResult,
  sendScopedAutomationEvent,
  clearAutomationEventScopes
} = require('../src/automation-event-router');

function connection(connectionId) {
  return {
    connectionId,
    messages: [],
    sendJson(message) {
      this.messages.push(message);
    }
  };
}

function main() {
  const ownerA = connection('automation-a');
  const ownerB = connection('automation-b');
  const connections = new Set([ownerA, ownerB]);

  rememberAutomationResult(ownerA, 'schedule', {
    ok: true,
    schedule: { id: 'schedule-a', workspaceId: 'workspace-a' }
  });
  rememberAutomationResult(ownerB, 'schedule', {
    ok: true,
    schedule: { id: 'schedule-b', workspaceId: 'workspace-b' }
  });
  rememberAutomationResult(ownerA, 'loop', {
    ok: true,
    loop: { id: 'loop-a', workspaceId: 'workspace-a' }
  });
  rememberAutomationResult(ownerA, 'chatRoom', {
    ok: true,
    room: { id: 'room-a', workspaceId: 'workspace-a' }
  });

  assert.strictEqual(sendScopedAutomationEvent(connections, 'schedule', {
    type: 'event',
    event: 'schedule.updated',
    payload: { scheduleId: 'schedule-a', schedule: { workspaceId: 'workspace-a' } }
  }), 1);
  assert.strictEqual(ownerA.messages.length, 1);
  assert.strictEqual(ownerB.messages.length, 0);

  assert.strictEqual(sendScopedAutomationEvent(connections, 'schedule', {
    type: 'event',
    event: 'schedule.updated',
    payload: { scheduleId: 'schedule-b', schedule: { workspaceId: 'workspace-b' } }
  }), 1);
  assert.strictEqual(ownerB.messages.length, 1);

  assert.strictEqual(sendScopedAutomationEvent(connections, 'loop', {
    type: 'event',
    event: 'loop.updated',
    payload: { loopId: 'loop-a', workspaceId: 'workspace-a' }
  }), 1);
  assert.strictEqual(sendScopedAutomationEvent(connections, 'chatRoom', {
    type: 'event',
    event: 'chat.room.message.created',
    payload: { roomId: 'room-a', workspaceId: 'workspace-a' }
  }), 1);
  assert.strictEqual(sendScopedAutomationEvent(connections, 'schedule', {
    type: 'event',
    event: 'schedule.updated',
    payload: { scheduleId: 'missing', workspaceId: 'workspace-missing' }
  }), 0);
  assert.strictEqual(sendScopedAutomationEvent(connections, 'schedule', {
    type: 'event',
    event: 'schedule.updated',
    payload: {}
  }), 0);

  clearAutomationEventScopes(ownerA);
  assert.strictEqual(sendScopedAutomationEvent(connections, 'loop', {
    type: 'event',
    event: 'loop.updated',
    payload: { loopId: 'loop-a', workspaceId: 'workspace-a' }
  }), 0);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const chatSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'chat-room-manager.js'), 'utf8');
  assert.ok(serverSource.includes("require('./automation-event-router')"), 'server should import automation event scope router');
  assert.ok(serverSource.includes("sendScopedAutomationEvent(\n    activeWsConnections"), 'server should route automation events through scoped delivery');
  assert.ok(!serverSource.includes("broadcastToClients(makeEvent(\n    String(event.kind || '').startsWith('run.')"), 'schedule events must not use global broadcast');
  assert.ok(!serverSource.includes("broadcastToClients(makeEvent(\n    String(event.kind || '').includes('round')"), 'loop events must not use global broadcast');
  assert.ok(!serverSource.includes("broadcastToClients(makeEvent(\n    event.kind === 'message.created'"), 'Chat Room events must not use global broadcast');
  assert.ok(chatSource.includes("workspaceId: text(room, 'workspaceId', '')"), 'Chat Room events should carry workspace scope');
  console.log('automation event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
