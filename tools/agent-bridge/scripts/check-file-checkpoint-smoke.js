'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createDaemonStore } = require('../src/daemon-store');
const { FileCheckpointStore } = require('../src/file-checkpoint-store');
const { AgentManager } = require('../src/agent-manager');
const { WorkspaceRegistry } = require('../src/workspace-registry');
const { ProviderRegistry } = require('../src/provider-registry');
const { MockProvider } = require('../src/providers/mock-provider');

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-file-checkpoint-'));
const workspace = path.join(root, 'workspace');
const storeDir = path.join(root, 'store');
fs.mkdirSync(workspace, { recursive: true });
run('git', ['init'], workspace);
fs.writeFileSync(path.join(workspace, 'hello.txt'), 'first\n', 'utf8');
run('git', ['add', 'hello.txt'], workspace);

const store = createDaemonStore(storeDir);
const fileStore = new FileCheckpointStore(store);
fs.mkdirSync(path.join(workspace, 'node_modules'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'node_modules', 'ignored.txt'), 'ignored\n', 'utf8');
fs.writeFileSync(path.join(workspace, 'large.txt'), 'x'.repeat(70 * 1024), 'utf8');
fs.writeFileSync(path.join(workspace, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
const capture = fileStore.capture({
  id: 'agt_smoke',
  workspaceId: 'wks_smoke',
  cwd: workspace
}, {
  includeFiles: true
});

assert(capture.fileSnapshotStatus === 'captured', 'expected captured file snapshot');
assert(capture.fileSnapshotId.length > 0, 'expected file snapshot id');
assert(capture.filesCaptured === 1, 'expected one captured file');
assert(capture.workspaceRoot === workspace, 'expected workspace root on capture');
assert(Array.isArray(capture.skippedReasons) && capture.skippedReasons.length >= 2, 'expected skipped reasons');

const inspect = fileStore.inspect(capture.fileSnapshotId);
assert(inspect !== null, 'expected inspect result');
assert(inspect.workspaceRoot === workspace, 'expected inspect workspace root');
assert(inspect.manifestVerified === true, 'expected inspect manifest verification');
assert(inspect.filesCaptured === 1, 'expected inspect captured file count');
assert(Array.isArray(inspect.skippedReasons) && inspect.skippedReasons.length >= 2, 'expected inspect skipped reasons');

const outsideSnapshotId = 'fchk_outside_smoke';
fs.writeFileSync(store.fileCheckpointPath(outsideSnapshotId), JSON.stringify({
  manifestVersion: 1,
  snapshotId: outsideSnapshotId,
  agentId: 'agt_smoke',
  workspaceId: 'wks_smoke',
  cwd: workspace,
  filesScanned: 1,
  filesCaptured: 1,
  skippedCount: 0,
  manifestSha256: '',
  files: [{
    path: '../outside.txt',
    sizeBytes: 4,
    sha256: 'bad',
    mode: 33188,
    contentBase64: Buffer.from('bad\n').toString('base64')
  }]
}), 'utf8');
const outsideInspect = fileStore.inspect(outsideSnapshotId);
assert(outsideInspect !== null && outsideInspect.manifestVerified === false, 'outside path snapshot should fail inspect verification');

fs.writeFileSync(path.join(workspace, 'hello.txt'), 'second\n', 'utf8');
const dryRun = fileStore.restore(capture.fileSnapshotId, {
  dryRun: true,
  confirm: false
});
assert(dryRun.status === 'dry_run', 'expected dry-run restore status');
assert(Array.isArray(dryRun.conflicts) && dryRun.conflicts.length === 1, 'expected modified conflict');
assert(dryRun.manifestVerified === true, 'dry-run should verify snapshot manifest');
assert(dryRun.filesVerified === 1, 'dry-run should count manifest-verified files');
assert(Array.isArray(dryRun.verifyErrors) && dryRun.verifyErrors.length === 0, 'dry-run should not report verify errors');
assert(dryRun.restorePlanId.length > 0, 'dry-run should return restore plan id');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'second\n', 'dry-run must not write files');

const missingPlanBlocked = fileStore.restore(capture.fileSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: true
});
assert(missingPlanBlocked.status === 'blocked_restore_plan_required', 'expected restore without dry-run plan to be blocked');
assert(missingPlanBlocked.restoreBlocked === true, 'expected missing restore plan block flag');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'second\n', 'missing plan restore must not write files');

const blocked = fileStore.restore(capture.fileSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: false,
  restorePlanId: dryRun.restorePlanId
});
assert(blocked.status === 'blocked_conflicts', 'expected conflicting restore to be blocked');
assert(blocked.restoreBlocked === true, 'expected restoreBlocked flag');
assert(blocked.manifestVerified === true, 'blocked restore should still verify manifest');
assert(blocked.filesRestored === 0, 'blocked restore should not report restored files');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'second\n', 'blocked restore must not write files');

const restored = fileStore.restore(capture.fileSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: true,
  restorePlanId: dryRun.restorePlanId
});
assert(restored.status === 'restored', 'expected restored status');
assert(restored.files === true, 'expected files restored flag');
assert(restored.preRestoreSnapshotId.length > 0, 'expected pre-restore snapshot id');
assert(restored.manifestVerified === true, 'restore should expose manifest verification');
assert(restored.filesRestored === 1, 'restore should count restored files');
assert(restored.filesVerified === 1, 'restore should verify written file hash');
assert(Array.isArray(restored.verifyErrors) && restored.verifyErrors.length === 0, 'restore should not report verify errors');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'first\n', 'expected file content restored');

const rollbackDryRun = fileStore.restore(restored.preRestoreSnapshotId, {
  dryRun: true,
  confirm: false
});
assert(rollbackDryRun.status === 'dry_run', 'expected pre-restore dry-run status');
assert(Array.isArray(rollbackDryRun.conflicts) && rollbackDryRun.conflicts.length === 1, 'expected pre-restore conflict summary');
assert(rollbackDryRun.restorePlanId.length > 0, 'expected pre-restore restore plan id');

const rollback = fileStore.restore(restored.preRestoreSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: true,
  restorePlanId: rollbackDryRun.restorePlanId
});
assert(rollback.status === 'restored', 'expected pre-restore rollback status');
assert(rollback.filesRestored === 1, 'pre-restore rollback should restore one file');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'second\n', 'expected pre-restore rollback content');

const noConflictCapture = fileStore.capture({
  id: 'agt_smoke',
  workspaceId: 'wks_smoke',
  cwd: workspace
}, {
  includeFiles: true
});
const noConflictDryRun = fileStore.restore(noConflictCapture.fileSnapshotId, {
  dryRun: true,
  confirm: false
});
assert(noConflictDryRun.conflicts.length === 0, 'expected no-conflict dry-run');
const noConflictRestore = fileStore.restore(noConflictCapture.fileSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: false,
  restorePlanId: noConflictDryRun.restorePlanId
});
assert(noConflictRestore.status === 'restored', 'expected no-conflict confirm restore');
assert(noConflictRestore.filesVerified === 1, 'expected no-conflict restore verification');

const originalReadFileSync = fs.readFileSync;
let glitchRestoreHash = false;
fs.readFileSync = function patchedReadFileSync(filePath, options) {
  if (glitchRestoreHash && path.resolve(filePath) === path.resolve(path.join(workspace, 'hello.txt'))) {
    if (options === 'utf8' || options === 'utf-8') {
      return 'verify-glitch\n';
    }
    return Buffer.from('verify-glitch\n');
  }
  return originalReadFileSync.call(fs, filePath, options);
};
fs.writeFileSync(path.join(workspace, 'hello.txt'), 'third\n', 'utf8');
const verifyDryRun = fileStore.restore(noConflictCapture.fileSnapshotId, {
  dryRun: true,
  confirm: false
});
glitchRestoreHash = true;
const verifyErrorRestore = fileStore.restore(noConflictCapture.fileSnapshotId, {
  dryRun: false,
  confirm: true,
  forceConflicts: true,
  restorePlanId: verifyDryRun.restorePlanId
});
glitchRestoreHash = false;
fs.readFileSync = originalReadFileSync;
assert(verifyErrorRestore.status === 'restored_with_verify_errors', 'expected restore hash verify error status');
assert(Array.isArray(verifyErrorRestore.verifyErrors) && verifyErrorRestore.verifyErrors.length >= 1, 'expected restore verify error');
assert(fs.readFileSync(path.join(workspace, 'hello.txt'), 'utf8') === 'second\n', 'verify glitch should not change restored content');

async function checkRuntimeCheckpointLayers() {
  const registry = new ProviderRegistry();
  const provider = new MockProvider();
  registry.register(provider);
  const session = provider.createSession({ workspacePath: workspace, workspaceTitle: 'Runtime checkpoint' });
  const emit = () => {};
  await provider.sendMessage({ sessionId: session.sessionId, text: 'one' }, emit);
  await provider.sendMessage({ sessionId: session.sessionId, text: 'two' }, emit);
  const captured = await registry.captureRuntimeCheckpoint({ providerId: 'mock', sessionId: session.sessionId });
  assert(captured.status === 'captured' && captured.kind === 'mock-message-count', 'mock runtime checkpoint should capture opaque cursor');
  const capturedLength = (await provider.listMessages(session.sessionId)).length;
  await provider.sendMessage({ sessionId: session.sessionId, text: 'three' }, emit);
  assert((await provider.listMessages(session.sessionId)).length > capturedLength, 'mock runtime should advance after checkpoint');
  const restoredRuntime = await registry.restoreRuntimeCheckpoint({
    providerId: 'mock',
    sessionId: session.sessionId,
    runtimeToken: captured.token
  }, emit);
  assert(restoredRuntime.restored === true, 'mock runtime checkpoint should restore');
  assert((await provider.listMessages(session.sessionId)).length === capturedLength, 'mock runtime history should return to captured cursor');

  const runtimeStore = createDaemonStore(path.join(root, 'runtime-store'));
  const workspaceRegistry = new WorkspaceRegistry(runtimeStore);
  const manager = new AgentManager({ store: runtimeStore, workspaceRegistry });
  const agent = manager.createPlaceholder({ providerId: 'mock', workspacePath: workspace, workspaceTitle: 'Runtime Agent' });
  manager.bindSession(agent.id, session);
  const checkpoint = manager.createCheckpoint(agent.id, {
    runtimeCheckpointStatus: captured.status,
    runtimeCheckpointKind: captured.kind,
    runtimeRestoreSupported: true,
    runtimeCheckpoint: captured.token,
    runtimeRestoreReason: 'runtime_checkpoint_captured'
  });
  assert(checkpoint.checkpoint.runtimeRestoreSupported === true, 'public checkpoint should expose runtime capability');
  assert(Object.keys(checkpoint.checkpoint).indexOf('runtimeCheckpoint') < 0, 'public checkpoint must not expose opaque runtime token');

  const unsupportedRegistry = new ProviderRegistry();
  unsupportedRegistry.register({ id: 'unsupported' });
  const unsupported = await unsupportedRegistry.captureRuntimeCheckpoint({ providerId: 'unsupported' });
  assert(unsupported.status === 'unsupported', 'unsupported provider should return stable runtime checkpoint status');
}

checkRuntimeCheckpointLayers().then(() => {
  console.log('file checkpoint smoke ok');
}).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
