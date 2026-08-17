'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { WorkspaceService } = require('../src/workspace-service');

function runGit(cwd, args) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true
  });
}

function gitText(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  }).trim();
}

function fileText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function registryFor(root) {
  return {
    findSession(sessionId) {
      if (sessionId !== 'session-plan') return null;
      return {
        provider: { id: 'mock' },
        session: {
          sessionId,
          workspacePath: root
        }
      };
    }
  };
}

function payload(extra) {
  return Object.assign({
    sessionId: 'session-plan',
    workspaceId: 'workspace-plan'
  }, extra || {});
}

async function main() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
  } catch (_error) {
    console.log('workspace git plan smoke skipped: git not available');
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-git-plan-'));
  const root = path.join(tempRoot, 'repo');
  const remote = path.join(tempRoot, 'remote.git');
  const peer = path.join(tempRoot, 'peer');
  fs.mkdirSync(root, { recursive: true });
  try {
    runGit(root, ['init']);
    runGit(root, ['config', 'user.email', 'bridge@example.test']);
    runGit(root, ['config', 'user.name', 'Bridge Plan Smoke']);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
    runGit(root, ['add', 'tracked.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const primaryBranch = gitText(root, ['branch', '--show-current']);
    runGit(tempRoot, ['init', '--bare', remote]);
    runGit(root, ['remote', 'add', 'origin', remote]);
    runGit(root, ['push', '-u', 'origin', 'HEAD']);
    runGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/' + primaryBranch]);

    const service = new WorkspaceService(registryFor(root));

    fs.writeFileSync(path.join(root, 'commit-planned.txt'), 'planned\n', 'utf8');
    runGit(root, ['add', 'commit-planned.txt']);
    const commitPreview = await service.commit(payload({
      message: 'planned commit',
      preview: true,
      requireConfirm: true
    }));
    assert.strictEqual(commitPreview.ok, true);
    assert.strictEqual(commitPreview.preview, true);
    assert.strictEqual(commitPreview.confirmed, false);
    assert.ok(commitPreview.planId.length > 0);
    assert.ok(commitPreview.affectedPaths.includes('commit-planned.txt'));
    assert.strictEqual(gitText(root, ['log', '-1', '--pretty=%s']), 'initial');
    const committed = await service.commit(payload({
      message: 'planned commit',
      planId: commitPreview.planId,
      confirm: true
    }));
    assert.strictEqual(committed.ok, true);
    assert.strictEqual(committed.preview, false);
    assert.strictEqual(committed.confirmed, true);
    assert.strictEqual(gitText(root, ['log', '-1', '--pretty=%s']), 'planned commit');
    const repeatedCommit = await service.commit(payload({
      message: 'planned commit',
      planId: commitPreview.planId,
      confirm: true
    }));
    assert.strictEqual(repeatedCommit.failureCategory, 'git_plan_expired');

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'changed-one\n', 'utf8');
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'untracked-one\n', 'utf8');
    const discardPreview = await service.discard(payload({ paths: ['tracked.txt', 'untracked.txt'] }));
    assert.strictEqual(discardPreview.ok, true);
    assert.strictEqual(discardPreview.preview, true);
    assert.strictEqual(discardPreview.confirmed, false);
    assert.ok(discardPreview.planId.length > 0);
    assert.ok(discardPreview.affectedPaths.includes('tracked.txt'));
    assert.ok(discardPreview.untrackedPaths.includes('untracked.txt'));
    assert.strictEqual(fileText(path.join(root, 'tracked.txt')), 'changed-one\n');
    assert.strictEqual(fs.existsSync(path.join(root, 'untracked.txt')), true);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'changed-after-preview\n', 'utf8');
    const staleDiscard = await service.discard(payload({
      paths: ['tracked.txt', 'untracked.txt'],
      planId: discardPreview.planId,
      confirm: true
    }));
    assert.strictEqual(staleDiscard.ok, false);
    assert.strictEqual(staleDiscard.failureCategory, 'git_plan_stale');
    assert.strictEqual(fileText(path.join(root, 'tracked.txt')), 'changed-after-preview\n');

    const freshDiscardPreview = await service.discard(payload({ paths: ['tracked.txt', 'untracked.txt'] }));
    const discarded = await service.discard(payload({
      paths: ['tracked.txt', 'untracked.txt'],
      planId: freshDiscardPreview.planId,
      confirm: true
    }));
    assert.strictEqual(discarded.ok, true);
    assert.strictEqual(discarded.preview, false);
    assert.strictEqual(discarded.confirmed, true);
    assert.strictEqual(fileText(path.join(root, 'tracked.txt')), 'base\n');
    assert.strictEqual(fs.existsSync(path.join(root, 'untracked.txt')), false);
    const repeatedDiscard = await service.discard(payload({
      paths: ['tracked.txt', 'untracked.txt'],
      planId: freshDiscardPreview.planId,
      confirm: true
    }));
    assert.strictEqual(repeatedDiscard.failureCategory, 'git_plan_expired');
    await assert.rejects(service.discard(payload({ paths: ['../escape.txt'] })));

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'stash-drop\n', 'utf8');
    const stashCreated = await service.stash(payload({ action: 'push', message: 'drop', includeUntracked: true }));
    assert.strictEqual(stashCreated.ok, true);
    const dropPreview = await service.stash(payload({ action: 'drop', ref: 'stash@{0}' }));
    assert.strictEqual(dropPreview.preview, true);
    assert.ok((await service.stash(payload({ action: 'list' }))).stashes.length > 0);
    const dropped = await service.stash(payload({
      action: 'drop',
      ref: 'stash@{0}',
      planId: dropPreview.planId,
      confirm: true
    }));
    assert.strictEqual(dropped.ok, true);
    assert.strictEqual((await service.stash(payload({ action: 'list' }))).stashes.length, 0);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'stash-pop\n', 'utf8');
    await service.stash(payload({ action: 'push', message: 'pop', includeUntracked: true }));
    const popPreview = await service.stash(payload({ action: 'pop', ref: 'stash@{0}' }));
    assert.strictEqual(popPreview.preview, true);
    const popped = await service.stash(payload({
      action: 'pop',
      ref: 'stash@{0}',
      planId: popPreview.planId,
      confirm: true
    }));
    assert.strictEqual(popped.ok, true);
    assert.strictEqual(fileText(path.join(root, 'tracked.txt')), 'stash-pop\n');
    const popCleanupPreview = await service.discard(payload({ paths: ['tracked.txt'] }));
    await service.discard(payload({ paths: ['tracked.txt'], planId: popCleanupPreview.planId, confirm: true }));

    await service.branch(payload({ action: 'create', name: 'delete-me' }));
    const branchDeletePreview = await service.branch(payload({ action: 'delete', name: 'delete-me' }));
    assert.strictEqual(branchDeletePreview.preview, true);
    assert.ok(gitText(root, ['branch', '--list', 'delete-me']).length > 0);
    const deletedBranch = await service.branch(payload({
      action: 'delete',
      name: 'delete-me',
      planId: branchDeletePreview.planId,
      confirm: true
    }));
    assert.strictEqual(deletedBranch.ok, true);
    assert.strictEqual(gitText(root, ['branch', '--list', 'delete-me']), '');

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'remote-b\n', 'utf8');
    runGit(root, ['add', 'tracked.txt']);
    runGit(root, ['commit', '-m', 'remote b']);
    runGit(root, ['push']);
    const remoteBeforeForce = gitText(root, ['rev-parse', 'refs/remotes/origin/' + primaryBranch]);
    runGit(root, ['reset', '--hard', 'HEAD~1']);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'force-c\n', 'utf8');
    runGit(root, ['add', 'tracked.txt']);
    runGit(root, ['commit', '-m', 'force c']);
    const forcePreview = await service.push(payload({ force: true }));
    assert.strictEqual(forcePreview.preview, true);
    assert.strictEqual(gitText(remote, ['rev-parse', 'HEAD']), remoteBeforeForce);
    const forced = await service.push(payload({
      force: true,
      planId: forcePreview.planId,
      confirm: true
    }));
    assert.strictEqual(forced.ok, true);
    assert.strictEqual(gitText(remote, ['rev-parse', 'HEAD']), gitText(root, ['rev-parse', 'HEAD']));

    runGit(tempRoot, ['clone', remote, peer]);
    runGit(peer, ['config', 'user.email', 'peer@example.test']);
    runGit(peer, ['config', 'user.name', 'Peer']);
    fs.writeFileSync(path.join(peer, 'peer.txt'), 'peer\n', 'utf8');
    runGit(peer, ['add', 'peer.txt']);
    runGit(peer, ['commit', '-m', 'peer update']);
    runGit(peer, ['push']);
    runGit(root, ['fetch', 'origin']);
    const beforePullHead = gitText(root, ['rev-parse', 'HEAD']);
    const pullPreview = await service.pull(payload({ ffOnly: true }));
    assert.strictEqual(pullPreview.preview, true);
    assert.strictEqual(gitText(root, ['rev-parse', 'HEAD']), beforePullHead);
    fs.writeFileSync(path.join(root, 'local-stale.txt'), 'stale\n', 'utf8');
    const stalePull = await service.pull(payload({
      ffOnly: true,
      planId: pullPreview.planId,
      confirm: true
    }));
    assert.strictEqual(stalePull.failureCategory, 'git_plan_stale');
    fs.rmSync(path.join(root, 'local-stale.txt'));
    const freshPullPreview = await service.pull(payload({ ffOnly: true }));
    const pulled = await service.pull(payload({
      ffOnly: true,
      planId: freshPullPreview.planId,
      confirm: true
    }));
    assert.strictEqual(pulled.ok, true);
    assert.strictEqual(fs.existsSync(path.join(root, 'peer.txt')), true);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'restart-plan\n', 'utf8');
    const restartPreview = await service.discard(payload({ paths: ['tracked.txt'] }));
    const restartedService = new WorkspaceService(registryFor(root));
    const afterRestart = await restartedService.discard(payload({
      paths: ['tracked.txt'],
      planId: restartPreview.planId,
      confirm: true
    }));
    assert.strictEqual(afterRestart.failureCategory, 'git_plan_expired');
    runGit(root, ['restore', '--', 'tracked.txt']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('workspace git plan smoke ok');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
} else {
  module.exports = {
    runWorkspaceGitPlanSmoke: main
  };
}
