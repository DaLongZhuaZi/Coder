'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sendScopedFileTransferEvent } = require('../src/file-transfer-event-router');

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
  const ownerA = connection('transfer-owner-a');
  const ownerB = connection('transfer-owner-b');
  const connections = new Set([ownerA, ownerB]);
  const message = {
    type: 'event',
    event: 'file.transfer.progress',
    payload: {
      requestId: 'transfer-a',
      direction: 'upload',
      workspaceId: 'workspace-a',
      path: 'docs/report.md'
    }
  };

  assert.strictEqual(sendScopedFileTransferEvent(connections, 'transfer-owner-a', message), 1);
  assert.strictEqual(ownerA.messages.length, 1);
  assert.strictEqual(ownerB.messages.length, 0);
  assert.strictEqual(sendScopedFileTransferEvent(connections, '', message), 0);
  assert.strictEqual(sendScopedFileTransferEvent(connections, 'missing-owner', message), 0);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const managerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'file-transfer-manager.js'), 'utf8');
  assert.ok(serverSource.includes("require('./file-transfer-event-router')"), 'server should import file transfer event router');
  assert.ok(serverSource.includes('sendScopedFileTransferEvent('), 'server should route file transfer events through owner scope');
  assert.ok(managerSource.includes('ownerId: state && state.connection'), 'transfer manager should attach internal owner metadata');
  assert.ok(!serverSource.includes('broadcast: broadcastToClients\n});\nconst providerDirectoryManager'), 'file transfer events must not use global broadcast');
  console.log('file transfer event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
