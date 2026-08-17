'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { WorkspaceRegistry } = require('../src/workspace-registry');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function removeTempDirectory(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp + path.sep)) {
    throw new Error('refusing to remove path outside temp directory: ' + resolvedTarget);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-cascade-archive-'));
try {
  const store = createDaemonStore(path.join(root, 'bridge-home'));
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const workspaceRegistry = new WorkspaceRegistry(store);
  const manager = new AgentManager({ store, workspaceRegistry });

  const parent = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Parent'
  });
  const child = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Child',
    parentAgentId: parent.id,
    rootAgentId: parent.id
  });
  const grandchild = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Grandchild',
    parentAgentId: child.id,
    rootAgentId: parent.id
  });
  assert(child.rootAgentId === parent.id, 'child should inherit parent root');
  assert(grandchild.rootAgentId === parent.id, 'grandchild should inherit parent root');

  const treeBeforeArchive = manager.relationshipTree({ includeArchived: false });
  assert(Array.isArray(treeBeforeArchive) && treeBeforeArchive.length === 1, 'relationship tree should expose one root');
  assert(treeBeforeArchive[0].children.length === 1, 'relationship tree should expose child');

  const doctorBeforeArchive = manager.relationshipDoctor({ includeArchived: true });
  assert(doctorBeforeArchive.status === 'ok', 'relationship doctor should pass for valid tree');

  const single = manager.archive(parent.id, { cascade: false });
  assert(single.agent.id === parent.id, 'single archive should return parent agent');
  assert(single.archivedAgents.length === 1, 'single archive should only archive one agent');
  assert(manager.find(parent.id).archivedAt.length > 0, 'parent should be archived');
  assert(manager.find(child.id).archivedAt.length === 0, 'child should remain unarchived without cascade');
  assert(manager.find(grandchild.id).archivedAt.length === 0, 'grandchild should remain unarchived without cascade');
  assert(single.relationshipDoctor.status === 'warning', 'single archive with active child should warn');

  const cascade = manager.archive(child.id, { cascade: true });
  assert(cascade.cascade === true, 'cascade result should expose cascade flag');
  assert(cascade.archivedAgents.length === 2, 'cascade archive should include child and grandchild');
  assert(manager.find(child.id).archivedAt.length > 0, 'child should be archived by cascade root');
  assert(manager.find(grandchild.id).archivedAt.length > 0, 'grandchild should be archived by cascade');

  const freshParent = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Fresh Parent'
  });
  const freshChild = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Fresh Child',
    parentAgentId: freshParent.id
  });
  const freshGrandchild = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Fresh Grandchild',
    parentAgentId: freshChild.id
  });
  const detached = manager.detach(freshChild.id);
  assert(detached.agent.detached === true, 'detach should mark child detached');
  assert(detached.agent.parentAgentId.length === 0, 'detach should clear parent');
  assert(detached.agent.rootAgentId === freshChild.id, 'detach should make child its own root');
  assert(manager.find(freshGrandchild.id).rootAgentId === freshChild.id, 'detach should update descendants root');

  const contextParent = manager.createPlaceholder({
    providerId: 'mock',
    workspacePath: workspaceRoot,
    workspaceTitle: 'Context Parent',
    modelId: 'mock-deep',
    modeId: 'deep',
    thinkingOptionId: 'high',
    permissionPolicyId: 'review',
    sandboxPolicyId: 'workspace-write'
  });
  const checkpointResult = manager.createCheckpoint(contextParent.id, { title: 'fork point' });
  const contextFork = manager.fork(contextParent.id, {
    checkpointId: checkpointResult.checkpoint.checkpointId,
    workspaceMode: 'shared'
  });
  assert(contextFork.agent.forkContext.checkpointId === checkpointResult.checkpoint.checkpointId, 'fork context should retain checkpoint id');
  assert(contextFork.agent.forkContext.timelineSeq === checkpointResult.checkpoint.latestSeq, 'fork context should inherit checkpoint cursor');
  assert(contextFork.agent.forkContext.modelId === 'mock-deep', 'fork context should inherit model');
  assert(contextFork.agent.executionPolicy.permissionPolicyId === 'review', 'fork should inherit permission policy explicitly');
  assert(contextFork.agent.executionPolicy.sandboxPolicyId === 'workspace-write', 'fork should inherit sandbox policy explicitly');
  assert(contextFork.agent.runtimeInfo.sessionState === 'not_started', 'fork child runtime should be lazy');

  const reloaded = new AgentManager({ store, workspaceRegistry });
  const reloadedFork = reloaded.find(contextFork.agent.id);
  assert(reloadedFork !== null, 'fork should survive persistence reload');
  assert(reloadedFork.forkContext.timelineSeq === checkpointResult.checkpoint.latestSeq, 'fork context should survive persistence reload');
  assert(reloaded.relationshipDoctor({ includeArchived: true }).status === 'ok', 'reloaded valid relationships should pass doctor');

  const migrationRoot = path.join(root, 'migration-workspace');
  fs.mkdirSync(migrationRoot, { recursive: true });
  const migrationStore = createDaemonStore(path.join(root, 'migration-home'));
  const migrationRegistry = new WorkspaceRegistry(migrationStore);
  const migrationWorkspace = migrationRegistry.upsertWorkspace({ workspacePath: migrationRoot, workspaceTitle: 'Migration' });
  const baseLegacy = {
    schemaVersion: 1,
    provider: 'mock',
    cwd: migrationRoot,
    workspaceId: migrationWorkspace.workspaceId,
    providerSessionId: '',
    remoteSessionId: '',
    title: 'Legacy',
    lastStatus: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    timeline: []
  };
  migrationStore.writeAgentRecord(Object.assign({}, baseLegacy, { id: 'legacy-root', parentAgentId: '', rootAgentId: 'legacy-root' }));
  migrationStore.writeAgentRecord(Object.assign({}, baseLegacy, { id: 'legacy-child', parentAgentId: 'legacy-root', rootAgentId: 'legacy-root', forkedFromAgentId: 'legacy-root' }));
  migrationStore.writeAgentRecord(Object.assign({}, baseLegacy, { id: 'legacy-orphan', parentAgentId: 'missing', rootAgentId: 'missing' }));
  migrationStore.writeAgentRecord(Object.assign({}, baseLegacy, { id: 'legacy-cycle-a', parentAgentId: 'legacy-cycle-b', rootAgentId: 'legacy-cycle-a', createdAt: '2026-01-02T00:00:00.000Z' }));
  migrationStore.writeAgentRecord(Object.assign({}, baseLegacy, { id: 'legacy-cycle-b', parentAgentId: 'legacy-cycle-a', rootAgentId: 'legacy-cycle-a', createdAt: '2026-01-03T00:00:00.000Z' }));
  const migrated = new AgentManager({ store: migrationStore, workspaceRegistry: migrationRegistry });
  assert(migrated.find('legacy-child').schemaVersion === 2, 'legacy record should migrate to schema v2');
  assert(migrated.find('legacy-child').forkContext.sourceAgentId === 'legacy-root', 'legacy fork fields should migrate to fork context');
  assert(migrated.find('legacy-orphan').detached === true, 'legacy orphan should migrate to detached root');
  assert(migrated.relationshipDoctor({ includeArchived: true }).status === 'ok', 'migrated legacy graph should pass doctor');

  const corrupted = manager.find(freshGrandchild.id);
  corrupted.parentAgentId = 'missing-parent';
  corrupted.rootAgentId = 'missing-root';
  const doctorAfterCorruption = manager.relationshipDoctor({ includeArchived: true });
  assert(doctorAfterCorruption.status === 'warning', 'relationship doctor should warn for corrupt graph');
  assert(doctorAfterCorruption.checks.length > 0, 'relationship doctor should include checks');

  console.log('agent cascade archive smoke ok');
} finally {
  removeTempDirectory(root);
}
