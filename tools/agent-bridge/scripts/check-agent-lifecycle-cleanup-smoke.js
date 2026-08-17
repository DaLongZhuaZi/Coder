'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const { AgentLifecycleCoordinator } = require('../src/agent-lifecycle-coordinator');
const { createDaemonStore } = require('../src/daemon-store');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');
const { WorkspaceRegistry } = require('../src/workspace-registry');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lifecycle-cleanup-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const isolatedRoot = path.join(root, 'isolated');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(isolatedRoot, { recursive: true });
    const store = createDaemonStore(path.join(root, 'bridge-home'));
    const workspaceRegistry = new WorkspaceRegistry(store);
    const sourceWorkspace = workspaceRegistry.upsertWorkspace({ workspacePath: sourceRoot, workspaceTitle: 'Source' });
    const isolatedWorkspace = workspaceRegistry.upsertWorkspace({
      workspacePath: isolatedRoot,
      workspaceTitle: 'Isolated',
      kind: 'worktree',
      sourceWorkspaceId: sourceWorkspace.workspaceId,
      sourceRootPath: sourceRoot,
      worktreePath: isolatedRoot
    });
    const manager = new AgentManager({ store, workspaceRegistry });
    const parent = manager.createPlaceholder({ providerId: 'mock', workspacePath: sourceRoot, workspaceId: sourceWorkspace.workspaceId, workspaceTitle: 'Parent' });
    const childResult = manager.fork(parent.id, {
      workspaceMode: 'isolated',
      workspacePath: isolatedRoot,
      rootPath: isolatedRoot,
      workspaceId: isolatedWorkspace.workspaceId,
      title: 'Child'
    });
    const child = childResult.agent;
    const detachedResult = manager.fork(parent.id, { workspaceMode: 'shared', detached: true, title: 'Detached' });
    const detached = detachedResult.agent;
    const providerArchiveOrder = [];
    const terminalClosed = [];
    const notificationClosed = [];
    const registry = {
      async archiveSession(payload) {
        providerArchiveOrder.push(payload.agentId);
        return { status: 'archived' };
      },
      async shutdown() {
        return { status: 'completed' };
      }
    };
    const terminalManager = {
      closeByAgent(agentId) {
        terminalClosed.push(agentId);
        return { status: 'completed', closed: [{ ownerAgentId: agentId }] };
      },
      shutdownAll() {
        return { status: 'completed' };
      }
    };
    const notificationManager = {
      deactivateRoutesForAgent(agentId) {
        notificationClosed.push(agentId);
        return { status: 'completed', updated: 1 };
      }
    };
    const ledger = new ManagedProcessLedger(store);
    ledger.record({ kind: 'terminal', pid: 0, identity: { agentId: child.id, runtimeOwnerId: child.id } });
    ledger.record({ kind: 'terminal', pid: 0, identity: { agentId: parent.id, runtimeOwnerId: parent.id } });
    const coordinator = new AgentLifecycleCoordinator({
      agentManager: manager,
      registry,
      terminalManager,
      workspaceRegistry,
      managedProcessLedger: ledger,
      notificationManager
    });

    const archived = await coordinator.archive(parent.id, { cascade: true }, () => {});
    assert(archived.archivedAgents.length === 2, 'cascade archive should include parent and attached child');
    assert(providerArchiveOrder.length === 0, 'placeholder agents should not call provider archive without sessions');
    assert(terminalClosed[0] === child.id && terminalClosed[1] === parent.id, 'cascade cleanup should run child first');
    assert(notificationClosed.indexOf(detached.id) < 0, 'detached subtree must not be cleaned by former parent cascade');
    assert(manager.find(detached.id).archivedAt.length === 0, 'detached Agent should remain active');
    assert(manager.resourceScope(parent.id, { write: true }).code === 'agent_write_access_revoked', 'archived parent write scope should be revoked');
    assert(manager.resourceScope(child.id, { write: true }).code === 'agent_write_access_revoked', 'archived child write scope should be revoked');
    assert(ledger.listByOwner(parent.id).length === 0 && ledger.listByOwner(child.id).length === 0, 'archive should clear owned process ledger records');
    const archivedWorkspace = workspaceRegistry.listWorkspaces({ includeArchived: true, validate: false }).find((item) => item.workspaceId === isolatedWorkspace.workspaceId);
    assert(archivedWorkspace && archivedWorkspace.status === 'archived', 'isolated workspace should be soft archived');
    assert(fs.existsSync(isolatedRoot), 'Agent archive must not delete isolated worktree files');

    const restartAgent = manager.createPlaceholder({ providerId: 'mock', workspacePath: sourceRoot, workspaceTitle: 'Restart Agent' });
    const shutdown = await coordinator.shutdown('daemon.restart');
    assert(shutdown.status === 'completed', 'daemon shutdown cleanup should complete');
    assert(manager.find(restartAgent.id).lifecycleState === 'disconnected', 'active Agent should become disconnected after daemon restart');
    assert(manager.find(restartAgent.id).archivedAt.length === 0, 'daemon restart must not archive Agent');
    console.log('agent lifecycle cleanup smoke ok');
  } finally {
    const resolved = path.resolve(root);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
