'use strict';

const assert = require('assert');
const { BrowserAutomationManager } = require('../src/browser-automation-manager');

async function main() {
  const workspaceRegistry = {
    findWorkspaceById(workspaceId) {
      return workspaceId === 'workspace-generation' ? {
        workspaceId,
        cwd: process.cwd(),
        archivedAt: ''
      } : null;
    }
  };
  const connection = {
    connectionId: 'connection-generation',
    messages: [],
    sendJson(message) {
      this.messages.push(message);
    }
  };
  const manager = new BrowserAutomationManager({
    workspaceRegistry,
    commandTimeoutMs: 5000
  });
  const first = manager.registerHost({
    hostId: 'host-generation',
    workspaceIds: ['workspace-generation'],
    supportedCommands: ['page.snapshot']
  }, connection);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(manager.hosts.get('host-generation').registrationGeneration, 1);

  const pending = manager.execute('browser.page.snapshot', {
    workspaceId: 'workspace-generation',
    pageId: 'page-generation'
  });
  assert.strictEqual(connection.messages.length, 1);
  const commandId = connection.messages[0].payload.commandId;

  const second = manager.registerHost({
    hostId: 'host-generation',
    workspaceIds: ['workspace-generation'],
    supportedCommands: ['page.list']
  }, connection);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(manager.hosts.get('host-generation').registrationGeneration, 2);
  assert.strictEqual((await pending).failureCategory, 'browser_host_reconfigured');

  const stale = manager.handleHostResult({
    commandId,
    ok: true,
    result: { page: { pageId: 'stale' } }
  }, connection);
  assert.strictEqual(stale.failureCategory, 'browser_command_not_found');
  assert.strictEqual(manager.listHosts({ workspaceId: 'workspace-generation' }).hosts[0].hostId, 'host-generation');
  manager.detachConnection(connection);
  console.log('browser host generation smoke ok');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
