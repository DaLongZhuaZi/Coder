'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { BrowserAutomationManager } = require('../src/browser-automation-manager');
const { sendScopedBrowserEvent } = require('../src/browser-event-router');

function publicBrowserEvent(event) {
  const output = Object.assign({}, event);
  delete output.ownerId;
  return output;
}

function main() {
  const events = [];
  const workspaceRegistry = {
    findWorkspaceById(workspaceId) {
      return workspaceId === 'workspace-browser-scope'
        ? { workspaceId, cwd: process.cwd(), archivedAt: '' }
        : null;
    }
  };
  const manager = new BrowserAutomationManager({
    workspaceRegistry,
    broadcast: (event) => events.push(event)
  });
  const ownerA = { connectionId: 'browser-owner-a', messages: [], sendJson(message) { this.messages.push(message); } };
  const ownerB = { connectionId: 'browser-owner-b', messages: [], sendJson(message) { this.messages.push(message); } };
  const connections = new Set([ownerA, ownerB]);

  const registered = manager.registerHost({
    hostId: 'browser-host-a',
    workspaceIds: ['workspace-browser-scope'],
    supportedCommands: ['page.list']
  }, ownerA);
  assert.strictEqual(registered.ok, true);
  const registeredEvent = events[events.length - 1];
  assert.strictEqual(registeredEvent.kind, 'browser.host.registered');
  assert.strictEqual(registeredEvent.ownerId, ownerA.connectionId);

  const publicMessage = { type: 'event', event: 'browser.updated', payload: publicBrowserEvent(registeredEvent) };
  assert.strictEqual(sendScopedBrowserEvent(connections, registeredEvent.ownerId, publicMessage), 1);
  assert.strictEqual(ownerA.messages.length, 1);
  assert.strictEqual(ownerB.messages.length, 0);
  assert.strictEqual(sendScopedBrowserEvent(connections, ownerB.connectionId, publicMessage), 1);
  assert.strictEqual(ownerA.messages.length, 1);
  assert.strictEqual(ownerB.messages.length, 1);
  assert.strictEqual(sendScopedBrowserEvent(connections, '', publicMessage), 0);
  assert.strictEqual(sendScopedBrowserEvent(connections, 'missing-owner', publicMessage), 0);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(publicMessage.payload, 'ownerId'), false);

  const permissionPreview = manager.permissionSet({
    workspaceId: 'workspace-browser-scope',
    domains: ['example.com']
  }, ownerA.connectionId);
  assert.strictEqual(permissionPreview.preview, true);
  const permissionResult = manager.permissionSet({
    workspaceId: 'workspace-browser-scope',
    domains: ['example.com'],
    planId: permissionPreview.planId,
    confirm: true
  }, ownerA.connectionId);
  assert.strictEqual(permissionResult.confirmed, true);
  const permissionEvent = events[events.length - 1];
  assert.strictEqual(permissionEvent.kind, 'browser.permission.updated');
  assert.strictEqual(permissionEvent.ownerId, ownerA.connectionId);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(serverSource.includes("const { sendScopedBrowserEvent } = require('./browser-event-router');"), 'server should import the Browser event router');
  assert.ok(serverSource.includes('sendScopedBrowserEvent(\n      activeWsConnections'), 'server should route Browser events through the owner-scoped router');
  assert.ok(serverSource.includes('delete publicEvent.ownerId;'), 'server should strip internal Browser owner metadata');
  assert.ok(serverSource.includes('browserAutomationManager.execute(message.type, payload, connection.connectionId || \'\')'), 'Browser execute should receive the connection owner');
  assert.strictEqual(serverSource.includes("broadcastToClients(makeEvent(EventType.BROWSER_UPDATED, '', event))"), false, 'Browser events must not use global broadcast');
  console.log('browser event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
