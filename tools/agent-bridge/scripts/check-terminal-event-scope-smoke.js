'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isScopedTerminalEvent,
  withTerminalScope,
  publicTerminalEvent,
  selectScopedTerminalConnections,
  sendScopedTerminalEvent
} = require('../src/terminal-event-router');

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
  const owner = connection('terminal-owner');
  const subscriber = connection('terminal-subscriber');
  const unrelated = connection('terminal-unrelated');
  subscriber.terminalSubscriptions = new Map([['term-a', 1]]);
  const session = {
    terminalId: 'term-a',
    ownerConnectionId: owner.connectionId,
    subscribers: new Map([[
      subscriber.connectionId,
      { connection: subscriber }
    ]])
  };
  const scoped = withTerminalScope({
    type: 'event',
    event: 'terminal.updated',
    sessionId: '',
    payload: {
      terminal: {
        terminalId: 'term-a',
        workspaceId: 'workspace-a',
        cwd: 'C:\\private\\workspace'
      }
    }
  }, session);
  assert.strictEqual(isScopedTerminalEvent(scoped), true, 'terminal lifecycle event should be scoped');
  assert.strictEqual(selectScopedTerminalConnections(new Set([owner, subscriber, unrelated]), scoped).length, 2, 'only owner and subscriber should be selected');
  assert.strictEqual(sendScopedTerminalEvent(new Set([owner, subscriber, unrelated]), scoped), 2, 'scoped event should be delivered to two connections');
  assert.strictEqual(owner.messages.length, 1, 'owner should receive terminal event');
  assert.strictEqual(subscriber.messages.length, 1, 'subscriber should receive terminal event');
  assert.strictEqual(unrelated.messages.length, 0, 'unrelated connection must not receive terminal event');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(owner.messages[0], 'ownerId'), false, 'ownerId must not cross the public event boundary');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(owner.messages[0], 'subscriberIds'), false, 'subscriberIds must not cross the public event boundary');
  assert.strictEqual(publicTerminalEvent(scoped).payload.terminal.cwd, 'C:\\private\\workspace', 'public event should preserve existing terminal payload');
  assert.strictEqual(sendScopedTerminalEvent(new Set([owner, subscriber]), {
    type: 'event',
    event: 'terminal.updated',
    payload: { terminal: { terminalId: 'term-missing' } }
  }), 0, 'unscoped terminal event must be dropped');
  assert.strictEqual(isScopedTerminalEvent({ event: 'terminal.hook.updated' }), false, 'daemon hook event remains global');

  const managerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'terminal-manager.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(managerSource.includes("require('./terminal-event-router')"), 'terminal manager should use terminal event scope helper');
  assert.ok(managerSource.includes('ownerConnectionId'), 'terminal session should retain internal creator connection');
  assert.ok(managerSource.includes('withTerminalScope'), 'terminal lifecycle events should carry internal scope');
  assert.ok(serverSource.includes("require('./terminal-event-router')"), 'server should import terminal event router');
  assert.ok(serverSource.includes('broadcastScopedTerminalEvent'), 'server should route scoped terminal events');
  assert.ok(serverSource.includes('terminalManager.create(payload, connection)'), 'terminal create should bind creator connection');
  console.log('terminal event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
