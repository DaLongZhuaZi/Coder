'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');
const { WorkspaceRegistry } = require('../src/workspace-registry');
const { ServiceProxyManager } = require('../src/service-manager');
const { sendScopedServiceEvent } = require('../src/service-event-router');

function publicServiceEvent(event) {
  const output = Object.assign({}, event);
  delete output.ownerId;
  return output;
}

function main() {
  const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ngf-service-event-scope-'));
  const workspacePath = path.join(root, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const store = createDaemonStore(path.join(root, 'bridge-home'));
  store.writeWorkspaceRegistry([{
    workspaceId: 'workspace-service-scope',
    projectId: 'project-service-scope',
    cwd: workspacePath,
    workspacePath,
    kind: 'directory',
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]);
  const workspaceRegistry = new WorkspaceRegistry(store);
  const events = [];
  const manager = new ServiceProxyManager({
    store,
    workspaceRegistry,
    managedProcessLedger: new ManagedProcessLedger(store),
    broadcast: (event) => events.push(event)
  });
  const ownerA = { connectionId: 'service-owner-a', messages: [], sendJson(message) { this.messages.push(message); } };
  const ownerB = { connectionId: 'service-owner-b', messages: [], sendJson(message) { this.messages.push(message); } };
  const connections = new Set([ownerA, ownerB]);
  try {
    const definition = {
      serviceId: 'service-scope',
      name: 'Scoped service',
      workspaceId: 'workspace-service-scope',
      command: process.execPath,
      args: [],
      cwd: workspacePath,
      port: 43131,
      protocol: 'http',
      health: { kind: 'tcp', path: '', timeoutMs: 250 },
      visibility: 'workspace',
      lifecycle: 'workspace'
    };
    const preview = manager.upsert(definition, ownerA.connectionId);
    assert.strictEqual(preview.preview, true);
    const confirmed = manager.upsert(Object.assign({}, definition, { planId: preview.planId, confirm: true }), ownerA.connectionId);
    assert.strictEqual(confirmed.confirmed, true);
    const event = events[events.length - 1];
    assert.strictEqual(event.kind, 'service.upserted');
    assert.strictEqual(event.ownerId, ownerA.connectionId);

    const publicMessage = { type: 'event', event: 'workspace.service.updated', payload: publicServiceEvent(event) };
    assert.strictEqual(sendScopedServiceEvent(connections, event.ownerId, publicMessage), 1);
    assert.strictEqual(ownerA.messages.length, 1);
    assert.strictEqual(ownerB.messages.length, 0);
    assert.strictEqual(sendScopedServiceEvent(connections, '', publicMessage), 0);
    assert.strictEqual(sendScopedServiceEvent(connections, 'missing-owner', publicMessage), 0);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(publicMessage.payload, 'ownerId'), false);

    manager.detachConnection(ownerA.connectionId);
    manager.emit('service.after_disconnect', manager.find('service-scope'));
    assert.strictEqual(events[events.length - 1].ownerId, '');

    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    assert.ok(serverSource.includes("const { sendScopedServiceEvent } = require('./service-event-router');"), 'server should import the Service event router');
    assert.ok(serverSource.includes('sendScopedServiceEvent(\n      activeWsConnections'), 'server should route Service events through the owner-scoped router');
    assert.ok(serverSource.includes('delete publicEvent.ownerId;'), 'server should strip internal Service owner metadata');
    assert.ok(serverSource.includes("serviceManager.start(payload, false, connection.connectionId || '')"), 'Service start should receive the connection owner');
    assert.strictEqual(serverSource.includes("broadcastToClients(makeEvent(EventType.WORKSPACE_SERVICE_UPDATED, '', event))"), false, 'Service events must not use global broadcast');
    console.log('service event scope smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
