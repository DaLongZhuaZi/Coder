'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { WorkspaceService } = require('../src/workspace-service');
const { WorkspaceGitPlanManager } = require('../src/workspace-git-plan-manager');
const { runWorkspaceGitPlanSmoke } = require('./check-workspace-git-plan-smoke');

function runGit(cwd, args) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true
  });
}

function quoteCommandArg(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

async function main() {
  try {
    assert.strictEqual(typeof WorkspaceGitPlanManager, 'function');
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
  } catch (_error) {
    console.log('workspace git smoke skipped: git not available');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-git-smoke-'));
  try {
    runGit(root, ['init']);
    runGit(root, ['config', 'user.email', 'bridge@example.test']);
    runGit(root, ['config', 'user.name', 'Bridge Smoke']);
    fs.writeFileSync(path.join(root, 'README.md'), '# Smoke\n', 'utf8');
    fs.writeFileSync(path.join(root, 'SECOND.md'), '# Second\n', 'utf8');
    runGit(root, ['add', 'README.md', 'SECOND.md']);
    runGit(root, ['commit', '-m', 'initial']);
    const longLines = [];
    for (let index = 0; index < 180; index += 1) longLines.push('line-' + String(index));
    fs.writeFileSync(path.join(root, 'README.md'), '# Smoke\n' + longLines.join('\n') + '\n', 'utf8');
    fs.writeFileSync(path.join(root, 'SECOND.md'), '# Second changed\n', 'utf8');

    const registry = {
      findSession(sessionId) {
        if (sessionId !== 'session-git') {
          return null;
        }
        return {
          provider: { id: 'mock' },
          session: {
            sessionId,
            workspacePath: root
          }
        };
      }
    };
    const service = new WorkspaceService(registry);
    const firstDiffPage = await service.getDiff({ sessionId: 'session-git', path: 'README.md', lineLimit: 8, maxBytes: 4096 });
    assert.strictEqual(firstDiffPage.truncated, true);
    assert.strictEqual(firstDiffPage.truncationReason, 'line_limit');
    assert.ok(firstDiffPage.nextLineOffset > 0);
    const secondDiffPage = await service.getDiff({ sessionId: 'session-git', path: 'README.md', lineOffset: firstDiffPage.nextLineOffset, lineLimit: 8, maxBytes: 4096 });
    assert.strictEqual(secondDiffPage.lineOffset, firstDiffPage.nextLineOffset);
    assert.notStrictEqual(secondDiffPage.diffText, firstDiffPage.diffText);
    const firstFilePage = await service.getDiff({ sessionId: 'session-git', path: '', fileLimit: 1, lineLimit: 10000, maxBytes: 4096 });
    assert.strictEqual(firstFilePage.truncated, true);
    assert.strictEqual(firstFilePage.truncationReason, 'file_limit');
    assert.strictEqual(firstFilePage.fileCursor, 0);
    assert.strictEqual(firstFilePage.nextFileCursor, 1);
    const secondFilePage = await service.getDiff({
      sessionId: 'session-git',
      path: '',
      fileCursor: firstFilePage.nextFileCursor,
      fileLimit: 1,
      lineLimit: 10000,
      maxBytes: 4096
    });
    assert.strictEqual(secondFilePage.fileCursor, 1);
    assert.strictEqual(secondFilePage.nextFileCursor, -1);
    assert.notStrictEqual(secondFilePage.diffText, firstFilePage.diffText);
    const byteLimitedPage = await service.getDiff({ sessionId: 'session-git', path: 'README.md', lineLimit: 10000, maxBytes: 1024 });
    assert.strictEqual(byteLimitedPage.truncated, true);
    assert.strictEqual(byteLimitedPage.truncationReason, 'byte_limit');
    assert.ok(byteLimitedPage.diffText.length > 0);
    const coldSessionWorktreeList = await service.listWorktrees({
      sessionId: 'session-not-cached',
      workspacePath: root
    });
    assert.strictEqual(coldSessionWorktreeList.ok, true);
    assert.strictEqual(coldSessionWorktreeList.cwd, root);
    assert.strictEqual(coldSessionWorktreeList.sessionId, 'session-not-cached');
    const nonGitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-non-git-'));
    const nonGitStatus = await service.status({
      workspacePath: nonGitRoot
    });
    assert.strictEqual(nonGitStatus.ok, false);
    assert.strictEqual(nonGitStatus.failureCategory, 'not_git_repo');
    assert.strictEqual(nonGitStatus.conflictSummary.hasConflicts, false);
    fs.rmSync(nonGitRoot, { recursive: true, force: true });

    const branchCreated = await service.branch({
      sessionId: 'session-git',
      action: 'create',
      name: 'feature/smoke'
    });
    assert.strictEqual(branchCreated.ok, true);
    assert.strictEqual(branchCreated.exitCode, 0);
    assert.strictEqual(branchCreated.action, 'create');
    assert.ok(branchCreated.command.indexOf('git') >= 0);
    assert.ok(branchCreated.branches.length >= 1);
    assert.strictEqual(typeof branchCreated.remoteName, 'string');
    assert.strictEqual(typeof branchCreated.changedFiles, 'number');
    assert.strictEqual(branchCreated.conflictSummary.hasConflicts, false);
    assert.ok(branchCreated.diffSummary);

    const switched = await service.branch({
      sessionId: 'session-git',
      action: 'checkout',
      name: 'feature/smoke'
    });
    assert.strictEqual(switched.ok, true);
    assert.strictEqual(switched.branchName, 'feature/smoke');

    fs.appendFileSync(path.join(root, 'README.md'), 'changed\n', 'utf8');
    const stashed = await service.stash({
      sessionId: 'session-git',
      action: 'push',
      message: 'smoke stash',
      includeUntracked: false
    });
    assert.strictEqual(stashed.ok, true);
    assert.strictEqual(stashed.exitCode, 0);
    assert.ok(stashed.stashes.length >= 1);
    assert.strictEqual(stashed.conflictSummary.hasConflicts, false);

    const listed = await service.stash({
      sessionId: 'session-git',
      action: 'list'
    });
    assert.strictEqual(listed.ok, true);
    assert.ok(listed.stashes.length >= 1);

    const status = await service.status({
      workspacePath: root
    });
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.action, 'status');
    assert.strictEqual(status.changedFiles, 0);

    fs.writeFileSync(path.join(root, 'clean.txt'), 'base\n', 'utf8');
    runGit(root, ['add', 'clean.txt']);
    runGit(root, ['commit', '-m', 'clean base']);
    const cleanBranch = await service.branch({
      sessionId: 'session-git',
      action: 'create',
      name: 'feature/clean-merge'
    });
    assert.strictEqual(cleanBranch.ok, true);
    runGit(root, ['switch', 'feature/clean-merge']);
    fs.writeFileSync(path.join(root, 'clean-feature.txt'), 'feature\n', 'utf8');
    runGit(root, ['add', 'clean-feature.txt']);
    runGit(root, ['commit', '-m', 'clean feature']);
    runGit(root, ['switch', 'feature/smoke']);
    const cleanMergePreview = await service.merge({
      sessionId: 'session-git',
      ref: 'feature/clean-merge'
    });
    assert.strictEqual(cleanMergePreview.ok, true);
    assert.strictEqual(cleanMergePreview.preview, true);
    assert.strictEqual(cleanMergePreview.confirmed, false);
    assert.ok(cleanMergePreview.planId.length > 0);
    const cleanMerge = await service.merge({
      sessionId: 'session-git',
      ref: 'feature/clean-merge',
      planId: cleanMergePreview.planId,
      confirm: true
    });
    assert.strictEqual(cleanMerge.ok, true);
    assert.strictEqual(cleanMerge.action, 'merge');
    assert.strictEqual(cleanMerge.confirmed, true);
    assert.strictEqual(cleanMerge.conflictSummary.hasConflicts, false);

    fs.writeFileSync(path.join(root, 'conflict.txt'), 'base\n', 'utf8');
    runGit(root, ['add', 'conflict.txt']);
    runGit(root, ['commit', '-m', 'conflict base']);
    const conflictBranch = await service.branch({
      sessionId: 'session-git',
      action: 'create',
      name: 'feature/conflict-merge'
    });
    assert.strictEqual(conflictBranch.ok, true);
    runGit(root, ['switch', 'feature/conflict-merge']);
    fs.writeFileSync(path.join(root, 'conflict.txt'), 'feature\n', 'utf8');
    runGit(root, ['add', 'conflict.txt']);
    runGit(root, ['commit', '-m', 'conflict feature']);
    runGit(root, ['switch', 'feature/smoke']);
    fs.writeFileSync(path.join(root, 'conflict.txt'), 'main\n', 'utf8');
    runGit(root, ['add', 'conflict.txt']);
    runGit(root, ['commit', '-m', 'conflict main']);
    const conflictMergePreview = await service.merge({
      sessionId: 'session-git',
      ref: 'feature/conflict-merge'
    });
    assert.strictEqual(conflictMergePreview.ok, true);
    assert.strictEqual(conflictMergePreview.preview, true);
    assert.strictEqual(conflictMergePreview.conflictPossible, true);
    const conflictMerge = await service.merge({
      sessionId: 'session-git',
      ref: 'feature/conflict-merge',
      planId: conflictMergePreview.planId,
      confirm: true
    });
    assert.strictEqual(conflictMerge.ok, false);
    assert.strictEqual(conflictMerge.failureCategory, 'conflict');
    assert.strictEqual(conflictMerge.conflictSummary.hasConflicts, true);
    assert.ok(conflictMerge.conflictSummary.count >= 1);
    assert.ok(conflictMerge.conflictSummary.files.includes('conflict.txt'));
    runGit(root, ['merge', '--abort']);

    await assert.rejects(service.status({
      workspacePath: path.join(root, '..', '..', 'path-that-should-not-exist')
    }));

    const worktreePath = path.join(path.dirname(root), path.basename(root) + '-worktree');
    const previewSetupMarker = path.join(path.dirname(root), 'worktree-preview-setup.txt');
    const setupMarkerName = 'setup-marker.txt';
    const teardownMarker = path.join(root, 'worktree-teardown.txt');
    const setupCommand = 'node -e "require(' + "'fs'" + ').writeFileSync(' + "'" + setupMarkerName + "'" + ',' + "'setup-ok'" + ',' + "'utf8'" + ')"';
    const previewSetupCommand = 'node -e "require(' + "'fs'" + ').writeFileSync(process.argv[1],' + "'bad'" + ',' + "'utf8'" + ')" ' + quoteCommandArg(previewSetupMarker);
    const teardownCommand = 'node -e "require(' + "'fs'" + ').writeFileSync(process.argv[1],' + "'teardown-ok'" + ',' + "'utf8'" + ')" ' + quoteCommandArg(teardownMarker);
    const previewWorktree = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath,
      branch: 'feature/worktree',
      setupCommand: previewSetupCommand
    });
    assert.strictEqual(previewWorktree.ok, true);
    assert.strictEqual(previewWorktree.preview, true);
    assert.strictEqual(previewWorktree.confirmed, false);
    assert.strictEqual(previewWorktree.created, false);
    assert.strictEqual(previewWorktree.validation.ok, true);
    assert.strictEqual(fs.existsSync(worktreePath), false);
    assert.strictEqual(previewWorktree.setupStatus, 'planned');
    assert.strictEqual(fs.existsSync(previewSetupMarker), false);

    const relativePathRejected = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath: 'relative-worktree',
      branch: 'feature/worktree-relative',
      confirm: true
    });
    assert.strictEqual(relativePathRejected.ok, false);
    assert.strictEqual(relativePathRejected.validation.ok, false);
    assert.strictEqual(relativePathRejected.validation.code, 'path_not_absolute');

    const missingParentRejected = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath: path.join(worktreePath, 'missing-parent', 'child'),
      branch: 'feature/worktree-missing-parent',
      confirm: true
    });
    assert.strictEqual(missingParentRejected.ok, false);
    assert.strictEqual(missingParentRejected.validation.code, 'parent_missing');

    const nonEmptyTarget = path.join(path.dirname(root), path.basename(root) + '-non-empty-worktree');
    fs.mkdirSync(nonEmptyTarget, { recursive: true });
    fs.writeFileSync(path.join(nonEmptyTarget, 'file.txt'), 'occupied\n', 'utf8');
    const nonEmptyRejected = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath: nonEmptyTarget,
      branch: 'feature/worktree-non-empty',
      confirm: true
    });
    assert.strictEqual(nonEmptyRejected.ok, false);
    assert.strictEqual(nonEmptyRejected.validation.code, 'target_not_empty');
    fs.rmSync(nonEmptyTarget, { recursive: true, force: true });

    const gitDirRejected = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath: path.join(root, '.git', 'bad-worktree'),
      branch: 'feature/worktree-git-dir',
      confirm: true
    });
    assert.strictEqual(gitDirRejected.ok, false);
    assert.strictEqual(gitDirRejected.validation.code, 'path_inside_git_dir');

    const archiveWithoutConfirm = await service.archiveWorktree({
      sessionId: 'session-git',
      worktreePath,
      force: true
    });
    assert.strictEqual(archiveWithoutConfirm.preview, true);
    assert.strictEqual(archiveWithoutConfirm.confirmed, false);
    assert.strictEqual(archiveWithoutConfirm.archived, false);
    assert.strictEqual(archiveWithoutConfirm.validation.ok, false);
    assert.strictEqual(archiveWithoutConfirm.validation.code, 'not_git_registered');

    const createdWorktree = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath,
      branch: 'feature/worktree',
      setupCommand,
      confirm: true
    });
    assert.strictEqual(createdWorktree.ok, true);
    assert.strictEqual(createdWorktree.exitCode, 0);
    assert.strictEqual(createdWorktree.confirmed, true);
    assert.strictEqual(createdWorktree.created, true);
    assert.strictEqual(createdWorktree.setupStatus, 'completed');
    assert.strictEqual(createdWorktree.setupResult.ok, true);
    assert.ok(createdWorktree.worktrees.length >= 2);
    assert.strictEqual(fs.existsSync(worktreePath), true);
    assert.strictEqual(fs.readFileSync(path.join(worktreePath, setupMarkerName), 'utf8'), 'setup-ok');
    let listedWorktree = null;
    for (const item of createdWorktree.worktrees) {
      if (path.resolve(item.path) === path.resolve(worktreePath)) {
        listedWorktree = item;
      }
    }
    assert.ok(listedWorktree, 'created worktree should be listed');
    assert.strictEqual(listedWorktree.gitRegistered, true);
    assert.strictEqual(listedWorktree.missing, false);

    const duplicateRejected = await service.createWorktree({
      sessionId: 'session-git',
      worktreePath,
      branch: 'feature/worktree-duplicate',
      confirm: true
    });
    assert.strictEqual(duplicateRejected.ok, false);
    assert.strictEqual(duplicateRejected.validation.code, 'already_registered');

    const mainArchiveRejected = await service.archiveWorktree({
      sessionId: 'session-git',
      worktreePath: root,
      force: true,
      confirm: true
    });
    assert.strictEqual(mainArchiveRejected.ok, false);
    assert.strictEqual(mainArchiveRejected.validation.code, 'main_worktree');

    const archivePreview = await service.archiveWorktree({
      sessionId: 'session-git',
      worktreePath,
      force: true,
      teardownCommand
    });
    assert.strictEqual(archivePreview.ok, true);
    assert.strictEqual(archivePreview.preview, true);
    assert.strictEqual(archivePreview.confirmed, false);
    assert.strictEqual(archivePreview.archived, false);
    assert.strictEqual(archivePreview.teardownStatus, 'planned');
    assert.strictEqual(fs.existsSync(teardownMarker), false);
    assert.strictEqual(fs.existsSync(worktreePath), true);

    const archivedWorktree = await service.archiveWorktree({
      sessionId: 'session-git',
      worktreePath,
      force: true,
      teardownCommand,
      confirm: true
    });
    assert.strictEqual(archivedWorktree.ok, true);
    assert.strictEqual(archivedWorktree.archived, true);
    assert.strictEqual(archivedWorktree.teardownStatus, 'completed');
    assert.strictEqual(archivedWorktree.teardownResult.ok, true);
    assert.strictEqual(fs.readFileSync(teardownMarker, 'utf8'), 'teardown-ok');
    assert.strictEqual(fs.existsSync(worktreePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  await runWorkspaceGitPlanSmoke();
  console.log('workspace git smoke ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
