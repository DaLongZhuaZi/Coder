'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { WorkspaceGitPlanManager, digestGitPlanValue } = require('./workspace-git-plan-manager');

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
const SHORT_FILE_SEARCH_MAX_DIRECTORIES = 8000;
const SHORT_FILE_SEARCH_MAX_MATCHES = 2;
const CHANGES_CACHE_TTL_MS = 4000;

function readStringValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'string') {
    return value;
  }
  return fallbackValue;
}

function readBooleanValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return fallbackValue;
}

function readNumberValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') return fallbackValue;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readPathArray(source) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  if (Array.isArray(source.paths)) {
    return source.paths.filter((item) => typeof item === 'string' && item.length > 0);
  }
  if (Array.isArray(source.files)) {
    return source.files.filter((item) => typeof item === 'string' && item.length > 0);
  }
  const singlePath = readStringValue(source, 'path', '');
  if (singlePath.length > 0) {
    return [singlePath];
  }
  return [];
}

function normalizeRelativePath(inputPath) {
  const value = typeof inputPath === 'string' ? inputPath.trim() : '';
  if (value.length === 0 || value === '.' || value === '/') {
    return '';
  }
  if (path.isAbsolute(value)) {
    throw new Error('Absolute paths are not allowed.');
  }
  const normalized = path.normalize(value.replace(/\\/g, '/'));
  if (normalized === '.' || normalized === '/') {
    return '';
  }
  if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.indexOf(path.sep + '..' + path.sep) >= 0) {
    throw new Error('Path traversal is not allowed.');
  }
  return normalized.replace(/\\/g, '/');
}

function filePathFromPayload(payload) {
  const rawPath = readStringValue(payload, 'path', '');
  const filePath = normalizeRelativePath(rawPath);
  const parentPath = normalizeRelativePath(readStringValue(payload, 'parentPath', ''));
  if (parentPath.length > 0 && filePath.length > 0 && filePath.indexOf('/') < 0) {
    return normalizeRelativePath(parentPath + '/' + filePath);
  }
  return filePath;
}

function resolveInside(rootPath, relativePath) {
  const root = path.resolve(rootPath);
  const rel = normalizeRelativePath(relativePath);
  const target = rel.length > 0 ? path.resolve(root, rel) : root;
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Resolved path escapes workspace.');
  }
  return {
    root,
    relativePath: rel,
    absolutePath: target
  };
}

function shouldSkipShortFileSearchDirectory(name) {
  return name === '.git' ||
    name === 'node_modules' ||
    name === 'oh_modules' ||
    name === 'build' ||
    name === '.cxx' ||
    name === '.hvigor' ||
    name === '.preview' ||
    name === '.test' ||
    name === '.appanalyzer';
}

function findUniqueFileByName(rootPath, fileName) {
  if (fileName.length === 0 || fileName.indexOf('/') >= 0 || fileName.indexOf('\\') >= 0) {
    return '';
  }
  const queue = [''];
  const matches = [];
  let scannedDirectories = 0;
  while (queue.length > 0 && scannedDirectories < SHORT_FILE_SEARCH_MAX_DIRECTORIES && matches.length < SHORT_FILE_SEARCH_MAX_MATCHES) {
    const parentPath = queue.shift();
    scannedDirectories += 1;
    const absoluteParentPath = parentPath.length > 0 ? path.join(rootPath, parentPath) : rootPath;
    let entries = [];
    try {
      entries = fs.readdirSync(absoluteParentPath, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const relativePath = formatRelativePath(parentPath, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        matches.push(relativePath);
        if (matches.length >= SHORT_FILE_SEARCH_MAX_MATCHES) {
          break;
        }
      } else if (entry.isDirectory() && !shouldSkipShortFileSearchDirectory(entry.name)) {
        queue.push(relativePath);
      }
    }
  }
  return matches.length === 1 ? matches[0] : '';
}

function resolveWorkspaceFileForPayload(rootPath, payload) {
  const requestedPath = filePathFromPayload(payload);
  const requested = resolveInside(rootPath, requestedPath);
  if (fs.existsSync(requested.absolutePath)) {
    return requested;
  }
  if (requestedPath.indexOf('/') >= 0 || requestedPath.indexOf('\\') >= 0) {
    return requested;
  }
  const matchedPath = findUniqueFileByName(rootPath, requestedPath);
  if (matchedPath.length === 0) {
    return requested;
  }
  return resolveInside(rootPath, matchedPath);
}

function normalizeWorkspaceRoot(session) {
  const workspacePath = readStringValue(session, 'workspacePath', '');
  if (workspacePath.length === 0) {
    throw new Error('Session has no workspacePath.');
  }
  const root = path.resolve(workspacePath);
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) {
    throw new Error('Session workspacePath is not a directory.');
  }
  return root;
}

function formatRelativePath(parentPath, name) {
  if (parentPath.length === 0) {
    return name;
  }
  return parentPath + '/' + name;
}

function depthForPath(relativePath) {
  if (relativePath.length === 0) {
    return 0;
  }
  return relativePath.split('/').length - 1;
}

function isHiddenName(name) {
  return typeof name === 'string' && name.startsWith('.');
}

function makeFileItem(parentPath, entry, stat) {
  const itemPath = formatRelativePath(parentPath, entry.name);
  return {
    workspaceId: '',
    path: itemPath,
    parentPath,
    name: entry.name,
    kind: entry.isDirectory() ? 'directory' : 'file',
    depth: depthForPath(itemPath),
    sizeBytes: entry.isDirectory() ? 0 : stat.size,
    modifiedAt: stat.mtimeMs,
    isHidden: isHiddenName(entry.name),
    updatedAt: Date.now()
  };
}

function workspaceChangeKindForPath(rootPath, relativePath) {
  try {
    const resolved = resolveInside(rootPath, relativePath);
    if (fs.existsSync(resolved.absolutePath)) {
      const stat = fs.statSync(resolved.absolutePath);
      return stat.isDirectory() ? 'directory' : 'file';
    }
  } catch (error) {
    return 'file';
  }
  return 'file';
}

function mediaTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') {
    return 'image/svg+xml';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.gif') {
    return 'image/gif';
  }
  if (extension === '.bmp') {
    return 'image/bmp';
  }
  if (extension === '.ico') {
    return 'image/x-icon';
  }
  if (extension === '.avif') {
    return 'image/avif';
  }
  if (extension === '.apng') {
    return 'image/apng';
  }
  if (extension === '.heic') {
    return 'image/heic';
  }
  if (extension === '.heif') {
    return 'image/heif';
  }
  if (extension === '.tif' || extension === '.tiff') {
    return 'image/tiff';
  }
  return 'text/plain';
}

function isRasterImageMediaType(mediaType) {
  return mediaType.startsWith('image/') && mediaType !== 'image/svg+xml';
}

function bufferHasNullByte(buffer) {
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function sortFileItems(left, right) {
  if (left.kind !== right.kind) {
    return left.kind === 'directory' ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function executeGit(rootPath, args) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const finalArgs = ['-C', rootPath].concat(args);
    execFile('git', finalArgs, {
      cwd: rootPath,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = typeof stderr === 'string' && stderr.trim().length > 0 ? stderr.trim() : error.message;
        reject(new Error(detail));
        return;
      }
      resolve({
        ok: true,
        command: formatGitCommand(rootPath, args),
        cwd: rootPath,
        exitCode: 0,
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function formatGitCommandPart(value) {
  const text = String(value);
  if (/^[A-Za-z0-9._/:=+-]+$/.test(text)) {
    return text;
  }
  return '"' + text.replace(/"/g, '\\"') + '"';
}

function formatGitCommand(rootPath, args) {
  return ['git', '-C', rootPath].concat(args).map(formatGitCommandPart).join(' ');
}

function executeGitAction(rootPath, args) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const finalArgs = ['-C', rootPath].concat(args);
    execFile('git', finalArgs, {
      cwd: rootPath,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const exitCode = error && typeof error.code === 'number' ? error.code : (error ? 1 : 0);
      const stderrText = typeof stderr === 'string' ? stderr : '';
      resolve({
        ok: !error,
        command: formatGitCommand(rootPath, args),
        cwd: rootPath,
        exitCode,
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: stderrText.trim().length > 0 ? stderrText : (error ? error.message : ''),
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function splitCommandLine(commandLine) {
  const source = typeof commandLine === 'string' ? commandLine.trim() : '';
  if (source.length === 0) {
    return [];
  }
  const parts = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source.charAt(index);
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      const next = index + 1 < source.length ? source.charAt(index + 1) : '';
      if (next === '"' || next === "'" || next === '\\' || /\s/.test(next)) {
        escaped = true;
        continue;
      }
      current += char;
      continue;
    }
    if (quote.length > 0) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += '\\';
  }
  if (current.length > 0) {
    parts.push(current);
  }
  return parts;
}

function formatProcessCommand(command, args) {
  return [command].concat(Array.isArray(args) ? args : []).map(formatGitCommandPart).join(' ');
}

function executeWorktreeLifecycleCommand(cwd, commandLine, kind) {
  const parts = splitCommandLine(commandLine);
  if (parts.length === 0) {
    return Promise.resolve({
      ok: true,
      status: 'skipped',
      kind,
      command: '',
      cwd,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
      message: 'No ' + kind + ' command was provided.'
    });
  }
  const command = parts[0];
  const args = parts.slice(1);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    execFile(command, args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const exitCode = error && typeof error.code === 'number' ? error.code : (error ? 1 : 0);
      const stdoutText = typeof stdout === 'string' ? stdout : '';
      const stderrText = typeof stderr === 'string' ? stderr : '';
      resolve({
        ok: !error,
        status: error ? 'failed' : 'completed',
        kind,
        command: formatProcessCommand(command, args),
        cwd,
        exitCode,
        stdout: stdoutText,
        stderr: stderrText.trim().length > 0 ? stderrText : (error ? error.message : ''),
        durationMs: Date.now() - startedAt,
        message: error ? kind + ' command failed.' : kind + ' command completed.'
      });
    });
  });
}

function emptyChangesForContext(context) {
  return {
    sessionId: context.sessionId,
    providerId: context.providerId,
    workspacePath: context.rootPath,
    branchName: '',
    changes: [],
    commits: [],
    diffSummary: buildDiffSummaryFromChanges('', [])
  };
}

function countChangedFiles(changes) {
  if (!Array.isArray(changes)) {
    return 0;
  }
  let count = 0;
  for (const change of changes) {
    if (!change || typeof change !== 'object') {
      continue;
    }
    const changedFileCount = typeof change.changedFileCount === 'number' && change.changedFileCount > 0
      ? Math.floor(change.changedFileCount)
      : 1;
    count += changedFileCount;
  }
  return count;
}

function buildDiffSummaryFromChanges(branchName, changes) {
  const items = Array.isArray(changes) ? changes : [];
  const paths = [];
  let additions = 0;
  let deletions = 0;
  let stagedCount = 0;
  let unstagedCount = 0;
  for (const change of items) {
    if (!change || typeof change !== 'object') {
      continue;
    }
    if (paths.length < 20 && typeof change.path === 'string' && change.path.length > 0) {
      paths.push(change.path);
    }
    if (typeof change.additions === 'number') {
      additions += change.additions;
    }
    if (typeof change.deletions === 'number') {
      deletions += change.deletions;
    }
    if (change.staged === true) {
      stagedCount += 1;
    } else {
      unstagedCount += 1;
    }
  }
  return {
    branchName: typeof branchName === 'string' ? branchName : '',
    changesCount: items.length,
    changedFiles: countChangedFiles(items),
    stagedCount,
    unstagedCount,
    additions,
    deletions,
    paths
  };
}

function emptyConflictSummary(message, remediation) {
  return {
    hasConflicts: false,
    count: 0,
    files: [],
    message: typeof message === 'string' ? message : '',
    remediation: typeof remediation === 'string' ? remediation : ''
  };
}

async function readConflictFiles(rootPath) {
  const diffResult = await executeGit(rootPath, ['diff', '--name-only', '--diff-filter=U', '-z']).catch(() => ({ stdout: '' }));
  const files = [];
  const parts = diffResult.stdout.split('\0');
  for (const item of parts) {
    const normalized = typeof item === 'string' ? item.replace(/\\/g, '/').trim() : '';
    if (normalized.length > 0) {
      files.push(normalized);
    }
  }
  if (files.length > 0) {
    return files;
  }
  const statusResult = await executeGit(rootPath, ['status', '--porcelain=v1', '-z']).catch(() => ({ stdout: '' }));
  const entries = parsePorcelainZ(statusResult.stdout);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const status = String(entry.indexStatus || '') + String(entry.worktreeStatus || '');
    if (
      status.indexOf('U') >= 0 ||
      status === 'AA' ||
      status === 'DD'
    ) {
      files.push(entry.path);
    }
  }
  return files;
}

async function buildGitConflictSummary(rootPath, gitResult) {
  const stderr = gitResult && typeof gitResult.stderr === 'string' ? gitResult.stderr : '';
  const stdout = gitResult && typeof gitResult.stdout === 'string' ? gitResult.stdout : '';
  const combined = (stderr + '\n' + stdout).toLowerCase();
  const conflictFiles = await readConflictFiles(rootPath);
  const hasConflictText = combined.indexOf('conflict') >= 0 ||
    combined.indexOf('automatic merge failed') >= 0 ||
    combined.indexOf('unmerged') >= 0;
  if (conflictFiles.length === 0 && !hasConflictText) {
    return emptyConflictSummary('', '');
  }
  return {
    hasConflicts: true,
    count: conflictFiles.length,
    files: conflictFiles.slice(0, 20),
    message: conflictFiles.length > 0
      ? 'Git operation produced conflicts in ' + String(conflictFiles.length) + ' file(s).'
      : 'Git operation reported conflicts.',
    remediation: 'Resolve conflicts, stage the resolved files, then continue or abort the Git operation.'
  };
}

function classifyGitFailure(action, gitResult, conflictSummary) {
  if (!gitResult || gitResult.ok === true) {
    return {
      failureCategory: '',
      message: '',
      remediation: ''
    };
  }
  if (conflictSummary && conflictSummary.hasConflicts === true) {
    return {
      failureCategory: 'conflict',
      message: conflictSummary.message,
      remediation: conflictSummary.remediation
    };
  }
  const text = ((gitResult.stderr || '') + '\n' + (gitResult.stdout || '')).toLowerCase();
  if (text.indexOf('not a git repository') >= 0) {
    return {
      failureCategory: 'not_git_repo',
      message: 'Workspace is not a Git repository.',
      remediation: 'Open or register a workspace inside a Git repository before running Git actions.'
    };
  }
  if (text.indexOf('non-fast-forward') >= 0 || text.indexOf('fetch first') >= 0 || text.indexOf('rejected') >= 0) {
    return {
      failureCategory: 'remote_rejected',
      message: 'Remote rejected the ' + action + ' operation.',
      remediation: 'Fetch or pull the remote changes, resolve local divergence, then retry without force unless explicitly intended.'
    };
  }
  if (text.indexOf('would be overwritten') >= 0 || text.indexOf('local changes') >= 0) {
    return {
      failureCategory: 'local_changes_blocked',
      message: 'Local changes blocked the ' + action + ' operation.',
      remediation: 'Commit, stash, or move local changes before retrying.'
    };
  }
  if (text.indexOf('unknown revision') >= 0 || text.indexOf('not something we can merge') >= 0 || text.indexOf('invalid reference') >= 0) {
    return {
      failureCategory: 'invalid_ref',
      message: 'Git reference is invalid for ' + action + '.',
      remediation: 'Check the branch, ref, or remote name and retry.'
    };
  }
  return {
    failureCategory: 'git_failed',
    message: gitResult.stderr || gitResult.stdout || 'Git command failed.',
    remediation: 'Review the command output and retry after correcting the repository state.'
  };
}

async function resolveRemoteName(rootPath, payloadRemote, branchName) {
  if (typeof payloadRemote === 'string' && payloadRemote.trim().length > 0) {
    return payloadRemote.trim();
  }
  if (typeof branchName === 'string' && branchName.length > 0) {
    const branchRemote = await executeGit(rootPath, ['config', '--get', 'branch.' + branchName + '.remote']).catch(() => ({ stdout: '' }));
    const configured = branchRemote.stdout.trim();
    if (configured.length > 0) {
      return configured;
    }
  }
  const remotes = await executeGit(rootPath, ['remote']).catch(() => ({ stdout: '' }));
  const firstRemote = remotes.stdout.split(/\r?\n/).find((line) => line.trim().length > 0);
  return firstRemote ? firstRemote.trim() : '';
}

async function buildGitActionResponse(action, context, args, gitResult, changes, extra, payload) {
  const changesArray = Array.isArray(changes.changes) ? changes.changes : [];
  const branchName = typeof changes.branchName === 'string' ? changes.branchName : '';
  const diffSummary = changes.diffSummary && typeof changes.diffSummary === 'object'
    ? changes.diffSummary
    : buildDiffSummaryFromChanges(branchName, changesArray);
  const conflictSummary = await buildGitConflictSummary(context.rootPath, gitResult);
  const failure = classifyGitFailure(action, gitResult, conflictSummary);
  const remoteName = await resolveRemoteName(context.rootPath, readStringValue(payload || {}, 'remote', ''), branchName);
  return Object.assign({
    ok: gitResult.ok === true,
    action,
    command: gitResult.command,
    cwd: context.rootPath,
    exitCode: gitResult.exitCode,
    stdout: gitResult.stdout,
    stderr: gitResult.stderr,
    durationMs: gitResult.durationMs,
    sessionId: context.sessionId,
    providerId: context.providerId,
    output: gitResult.stdout,
    errorOutput: gitResult.stderr,
    changes: changesArray,
    branchName,
    remoteName,
    changedFiles: diffSummary.changedFiles,
    changesCount: diffSummary.changesCount,
    commits: changes.commits,
    conflictSummary,
    failureCategory: failure.failureCategory,
    message: failure.message,
    remediation: failure.remediation,
    diffSummary,
    updatedAt: Date.now()
  }, extra || {});
}

function parseWorktreePorcelain(text) {
  const items = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current) {
        items.push(current);
        current = null;
      }
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current) {
        items.push(current);
      }
      current = {
        path: line.substring('worktree '.length),
        head: '',
        branch: '',
        detached: false,
        bare: false,
        locked: false,
        lockedReason: '',
        prunable: false,
        prunableReason: ''
      };
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.substring('branch '.length).replace(/^refs\/heads\//, '');
    } else if (current && line === 'detached') {
      current.detached = true;
    } else if (current && line === 'bare') {
      current.bare = true;
    } else if (current && line.startsWith('locked')) {
      current.locked = true;
      current.lockedReason = line.length > 'locked'.length ? line.substring('locked'.length).trim() : '';
    } else if (current && line.startsWith('prunable')) {
      current.prunable = true;
      current.prunableReason = line.length > 'prunable'.length ? line.substring('prunable'.length).trim() : '';
    }
  }
  if (current) {
    items.push(current);
  }
  return items;
}

function emptyWorktreeValidation() {
  return {
    ok: true,
    code: '',
    message: '',
    remediation: '',
    errors: [],
    warnings: []
  };
}

function pushWorktreeValidationError(validation, code, message, remediation) {
  validation.ok = false;
  if (validation.code.length === 0) {
    validation.code = code;
    validation.message = message;
    validation.remediation = remediation;
  }
  validation.errors.push({
    code,
    message,
    remediation
  });
}

function pushWorktreeValidationWarning(validation, code, message, remediation) {
  validation.warnings.push({
    code,
    message,
    remediation
  });
}

function worktreeFailureFromValidation(validation, fallbackCode) {
  if (!validation || validation.ok === true) {
    return {
      failureCategory: '',
      message: '',
      remediation: ''
    };
  }
  return {
    failureCategory: validation.code.length > 0 ? validation.code : fallbackCode,
    message: validation.message.length > 0 ? validation.message : 'Worktree validation failed.',
    remediation: validation.remediation.length > 0 ? validation.remediation : 'Review the validation errors and retry.'
  };
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function findWorkspaceForPath(workspaceRegistry, targetPath) {
  if (!workspaceRegistry || typeof workspaceRegistry.listWorkspaces !== 'function') {
    return null;
  }
  const resolvedTarget = path.resolve(targetPath);
  const workspaces = workspaceRegistry.listWorkspaces({ includeArchived: true });
  for (const workspace of workspaces) {
    if (!workspace || typeof workspace !== 'object') {
      continue;
    }
    const cwd = typeof workspace.cwd === 'string' && workspace.cwd.length > 0 ? path.resolve(workspace.cwd) : '';
    const worktreePath = typeof workspace.worktreePath === 'string' && workspace.worktreePath.length > 0 ? path.resolve(workspace.worktreePath) : '';
    if (cwd === resolvedTarget || worktreePath === resolvedTarget) {
      return workspace;
    }
  }
  return null;
}

function workspaceStringValue(workspace, key) {
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
    return '';
  }
  const value = workspace[key];
  return typeof value === 'string' ? value : '';
}

function workspaceArchived(workspace) {
  const archivedAt = workspaceStringValue(workspace, 'archivedAt');
  return archivedAt.length > 0;
}

function decorateWorktreeRecord(item, workspaceRegistry, gitPathSet) {
  const targetPath = path.resolve(item.path);
  const workspace = findWorkspaceForPath(workspaceRegistry, targetPath);
  const exists = fs.existsSync(targetPath);
  const registryArchived = workspaceArchived(workspace);
  const gitRegistered = gitPathSet.has(targetPath.toLowerCase());
  return Object.assign({}, item, {
    path: targetPath,
    gitRegistered,
    registryLinked: workspace !== null,
    registryWorkspaceId: workspaceStringValue(workspace, 'workspaceId'),
    registryArchived,
    sourceWorkspaceId: workspaceStringValue(workspace, 'sourceWorkspaceId'),
    sourceRootPath: workspaceStringValue(workspace, 'sourceRootPath'),
    startPoint: workspaceStringValue(workspace, 'startPoint'),
    missing: !exists,
    stale: !gitRegistered || registryArchived || !exists,
    setupStatus: 'skipped',
    teardownStatus: 'skipped',
    setupMessage: 'Worktree setup scripts are not executed in this build.',
    teardownMessage: 'Worktree teardown scripts are not executed in this build.'
  });
}

function appendRegistryOnlyWorktrees(records, workspaceRegistry, gitPathSet, includeArchived) {
  if (!workspaceRegistry || typeof workspaceRegistry.listWorkspaces !== 'function') {
    return records;
  }
  const workspaces = workspaceRegistry.listWorkspaces({ includeArchived: true });
  for (const workspace of workspaces) {
    if (!workspace || typeof workspace !== 'object') {
      continue;
    }
    if (workspaceStringValue(workspace, 'kind') !== 'worktree') {
      continue;
    }
    const archived = workspaceArchived(workspace);
    if (archived && includeArchived !== true) {
      continue;
    }
    const rawPath = workspaceStringValue(workspace, 'worktreePath').length > 0
      ? workspaceStringValue(workspace, 'worktreePath')
      : workspaceStringValue(workspace, 'cwd');
    if (rawPath.length === 0) {
      continue;
    }
    const resolvedPath = path.resolve(rawPath);
    if (gitPathSet.has(resolvedPath.toLowerCase())) {
      continue;
    }
    records.push(decorateWorktreeRecord({
      path: resolvedPath,
      head: '',
      branch: workspaceStringValue(workspace, 'branch'),
      detached: false,
      bare: false,
      locked: false,
      lockedReason: '',
      prunable: false,
      prunableReason: ''
    }, workspaceRegistry, gitPathSet));
  }
  return records;
}

function porcelainStatusName(indexStatus, worktreeStatus) {
  if (indexStatus === 'R' || worktreeStatus === 'R') {
    return 'renamed';
  }
  if (indexStatus === 'A' || worktreeStatus === 'A' || indexStatus === '?' || worktreeStatus === '?') {
    return 'added';
  }
  if (indexStatus === 'D' || worktreeStatus === 'D') {
    return 'deleted';
  }
  if (indexStatus === 'M' || worktreeStatus === 'M') {
    return 'modified';
  }
  return 'changed';
}

function parsePorcelainZ(text) {
  const entries = [];
  const parts = text.split('\0');
  let index = 0;
  while (index < parts.length) {
    const record = parts[index];
    index += 1;
    if (record.length === 0) {
      continue;
    }
    const indexStatus = record.charAt(0);
    const worktreeStatus = record.charAt(1);
    const rawPath = record.length > 3 ? record.substring(3) : '';
    let filePath = rawPath;
    let oldPath = '';
    if (indexStatus === 'R' || indexStatus === 'C') {
      oldPath = rawPath;
      filePath = index < parts.length ? parts[index] : rawPath;
      index += 1;
    }
    const untracked = indexStatus === '?' && worktreeStatus === '?';
    entries.push({
      path: filePath.replace(/\\/g, '/'),
      oldPath: oldPath.replace(/\\/g, '/'),
      status: untracked ? 'untracked' : porcelainStatusName(indexStatus, worktreeStatus),
      staged: indexStatus !== ' ' && indexStatus !== '?',
      indexStatus,
      worktreeStatus
    });
  }
  return entries;
}

function parseNumstat(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 3) {
      continue;
    }
    const additions = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10);
    const deletions = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10);
    const filePath = parts[2].replace(/\\/g, '/');
    map.set(filePath, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0
    });
  }
  return map;
}

function splitTextLinesForDiff(text) {
  if (text.length === 0) {
    return [];
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }
  return lines;
}

function readWorkspaceFileForDiff(rootPath, relativePath) {
  const resolved = resolveInside(rootPath, relativePath);
  const stat = fs.statSync(resolved.absolutePath);
  if (!stat.isFile()) {
    return {
      readable: false,
      binary: false,
      lines: []
    };
  }
  if (stat.size > MAX_TEXT_BYTES) {
    return {
      readable: false,
      binary: true,
      lines: []
    };
  }
  const buffer = fs.readFileSync(resolved.absolutePath);
  if (buffer.includes(0)) {
    return {
      readable: false,
      binary: true,
      lines: []
    };
  }
  return {
    readable: true,
    binary: false,
    lines: splitTextLinesForDiff(buffer.toString('utf8'))
  };
}

function countNewFileAdditions(rootPath, relativePath) {
  try {
    return readWorkspaceFileForDiff(rootPath, relativePath).lines.length;
  } catch (error) {
    return 0;
  }
}

function buildSyntheticNewFileDiff(rootPath, relativePath) {
  let fileInfo;
  try {
    fileInfo = readWorkspaceFileForDiff(rootPath, relativePath);
  } catch (error) {
    return '';
  }
  const header = [
    'diff --git a/' + relativePath + ' b/' + relativePath,
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    '+++ b/' + relativePath
  ];
  if (fileInfo.binary) {
    header.push('Binary files /dev/null and b/' + relativePath + ' differ');
    return header.join('\n') + '\n';
  }
  if (!fileInfo.readable) {
    return '';
  }
  if (fileInfo.lines.length === 0) {
    return header.join('\n') + '\n';
  }
  header.push('@@ -0,0 +1,' + String(fileInfo.lines.length) + ' @@');
  for (const line of fileInfo.lines) {
    header.push('+' + line);
  }
  return header.join('\n') + '\n';
}

async function listUntrackedFilesForPath(rootPath, relativePath) {
  const args = ['ls-files', '--others', '--exclude-standard', '-z'];
  if (relativePath.length > 0) {
    args.push('--');
    args.push(relativePath);
  }
  const result = await executeGit(rootPath, args).catch(() => ({ stdout: '' }));
  const files = [];
  const parts = result.stdout.split('\0');
  for (const item of parts) {
    const normalized = normalizeRelativePath(item);
    if (normalized.length > 0) {
      files.push(normalized);
    }
  }
  if (files.length === 0 && relativePath.length > 0) {
    const resolved = resolveInside(rootPath, relativePath);
    if (fs.existsSync(resolved.absolutePath)) {
      const stat = fs.statSync(resolved.absolutePath);
      if (stat.isFile()) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

async function buildUntrackedFileMap(rootPath, untrackedEntries) {
  // Batch the whole untracked enumeration into ONE git subprocess. The old
  // per-entry loop spawned `git ls-files --others --exclude-standard` for every
  // untracked path (hundreds on large workspaces), which took tens of seconds
  // per workspace.changes.get and stalled the Bridge event loop.
  const result = await executeGit(rootPath, ['ls-files', '--others', '--exclude-standard', '-z']).catch(() => ({ stdout: '' }));
  const allFiles = [];
  for (const item of result.stdout.split('\0')) {
    const normalized = normalizeRelativePath(item);
    if (normalized.length > 0) {
      allFiles.push(normalized);
    }
  }
  const map = new Map();
  for (const entry of untrackedEntries) {
    const entryPath = String(entry.path || '').replace(/[\\/]+$/, '');
    const files = [];
    if (entryPath.length === 0) {
      for (const file of allFiles) files.push(file);
    } else {
      for (const file of allFiles) {
        if (file === entryPath || file.startsWith(entryPath + '/')) files.push(file);
      }
      if (files.length === 0) {
        const resolved = resolveInside(rootPath, entryPath);
        if (fs.existsSync(resolved.absolutePath) && fs.statSync(resolved.absolutePath).isFile()) {
          files.push(entryPath);
        }
      }
    }
    map.set(entry.path, files);
  }
  return map;
}

function countUntrackedFileAdditions(rootPath, files) {
  let additions = 0;
  for (const filePath of files) {
    additions += countNewFileAdditions(rootPath, filePath);
  }
  return additions;
}

function buildSyntheticUntrackedDiff(rootPath, files) {
  const parts = [];
  for (const filePath of files) {
    const diffText = buildSyntheticNewFileDiff(rootPath, filePath);
    if (diffText.length > 0) {
      parts.push(diffText);
    }
  }
  return parts.join('\n');
}

function countDiffStats(diffText) {
  const stats = {
    additions: 0,
    deletions: 0
  };
  const lines = diffText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      stats.additions += 1;
    } else if (line.startsWith('-')) {
      stats.deletions += 1;
    }
  }
  return stats;
}

function pathsForGit(paths) {
  const normalized = [];
  for (const item of paths) {
    normalized.push(normalizeRelativePath(item));
  }
  return normalized;
}

function readGitAction(payload, fallbackValue) {
  const action = readStringValue(payload, 'action', fallbackValue).trim().toLowerCase();
  return action.length > 0 ? action : fallbackValue;
}

function uniqueSortedStrings(values) {
  const set = new Set();
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      set.add(value);
    }
  }
  return Array.from(set.values()).sort((left, right) => left.localeCompare(right));
}

function splitNullSeparated(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  return text.split('\0').filter((item) => item.length > 0);
}

function parsePorcelainPaths(text) {
  const tokens = splitNullSeparated(text);
  const paths = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.length < 4) {
      continue;
    }
    paths.push(token.substring(3).replace(/\\/g, '/'));
    const status = token.substring(0, 2);
    if ((status.indexOf('R') >= 0 || status.indexOf('C') >= 0) && index + 1 < tokens.length) {
      index += 1;
      paths.push(tokens[index].replace(/\\/g, '/'));
    }
  }
  return uniqueSortedStrings(paths);
}

function normalizeGitPlanPaths(payload) {
  return uniqueSortedStrings(pathsForGit(readPathArray(payload)));
}

function gitPlanAction(operation) {
  if (operation === 'push.force') return 'push';
  if (operation === 'branch.delete') return 'delete';
  if (operation === 'stash.pop') return 'pop';
  if (operation === 'stash.drop') return 'drop';
  return operation;
}

function gitPlanFailure(action, failureCategory, message, remediation, context) {
  return {
    ok: false,
    action,
    command: '',
    cwd: context && typeof context.rootPath === 'string' ? context.rootPath : '',
    exitCode: 1,
    stdout: '',
    stderr: '',
    durationMs: 0,
    preview: false,
    confirmed: false,
    planId: '',
    failureCategory,
    message,
    remediation,
    affectedPaths: [],
    risks: [],
    branchName: '',
    remoteName: '',
    changedFiles: 0,
    changesCount: 0,
    conflictSummary: {
      hasConflicts: false,
      count: 0,
      files: [],
      message: '',
      remediation: ''
    },
    updatedAt: Date.now()
  };
}

function makeGitRisk(code, severity, message, remediation) {
  return {
    code,
    severity,
    message,
    remediation
  };
}

function publicGitSnapshot(snapshot) {
  return {
    workspaceId: snapshot.workspaceId,
    head: snapshot.head,
    branch: snapshot.branch,
    upstream: snapshot.upstream,
    upstreamHead: snapshot.upstreamHead,
    indexFingerprint: snapshot.indexFingerprint,
    worktreeFingerprint: snapshot.worktreeFingerprint,
    ahead: snapshot.ahead,
    behind: snapshot.behind,
    dirty: snapshot.dirty
  };
}

function normalizedGitPlanRequest(operation, payload) {
  if (operation === 'discard') {
    return {
      operation,
      paths: normalizeGitPlanPaths(payload)
    };
  }
  if (operation === 'pull') {
    return {
      operation,
      remote: readStringValue(payload, 'remote', readStringValue(payload, 'remoteName', '')).trim(),
      branch: readStringValue(payload, 'branch', readStringValue(payload, 'branchName', '')).trim(),
      ffOnly: readBooleanValue(payload, 'ffOnly', true)
    };
  }
  if (operation === 'push.force') {
    return {
      operation,
      remote: readStringValue(payload, 'remote', readStringValue(payload, 'remoteName', '')).trim(),
      branch: readStringValue(payload, 'branch', readStringValue(payload, 'branchName', '')).trim(),
      force: true
    };
  }
  if (operation === 'commit') {
    return {
      operation,
      message: readStringValue(payload, 'message', '').trim()
    };
  }
  if (operation === 'branch.delete') {
    return {
      operation,
      name: readStringValue(payload, 'name', readStringValue(payload, 'branchName', '')).trim(),
      force: readBooleanValue(payload, 'force', false)
    };
  }
  if (operation === 'stash.pop' || operation === 'stash.drop') {
    return {
      operation,
      ref: readStringValue(payload, 'ref', '').trim()
    };
  }
  if (operation === 'merge') {
    return {
      operation,
      ref: readStringValue(payload, 'ref', readStringValue(payload, 'branch', readStringValue(payload, 'branchName', ''))).trim(),
      noCommit: readBooleanValue(payload, 'noCommit', false),
      ffOnly: readBooleanValue(payload, 'ffOnly', false)
    };
  }
  return { operation };
}

class WorkspaceService {
  constructor(registry, workspaceRegistry) {
    this.registry = registry;
    this.workspaceRegistry = workspaceRegistry || (registry && typeof registry.listWorkspaces === 'function' ? registry : null);
    this.agentManager = null;
    this.downloadTokens = new Map();
    this.gitPlanManager = new WorkspaceGitPlanManager();
    this.changesCache = new Map();
  }

  clearChangesCache() {
    this.changesCache.clear();
  }

  remapChangesResponse(payload, sessionId) {
    if (!payload) return payload;
    const effectiveSessionId = typeof sessionId === 'string' ? sessionId : '';
    const changes = Array.isArray(payload.changes) ? payload.changes.map((change) => Object.assign({}, change, {
      id: effectiveSessionId + ':' + String(change.path || '') + ':' + (change.staged === true ? 'staged' : 'worktree'),
      sessionId: effectiveSessionId
    })) : payload.changes;
    const commits = Array.isArray(payload.commits) ? payload.commits.map((commit) => Object.assign({}, commit, {
      id: effectiveSessionId + ':' + String(commit.hash || ''),
      sessionId: effectiveSessionId
    })) : payload.commits;
    return Object.assign({}, payload, { sessionId: effectiveSessionId, changes, commits });
  }

  setAgentManager(agentManager) {
    this.agentManager = agentManager || null;
  }

  setWorkspaceRegistry(workspaceRegistry) {
    this.workspaceRegistry = workspaceRegistry || null;
  }

  async optionalGitText(rootPath, args) {
    const result = await executeGit(rootPath, args).catch(() => ({ stdout: '' }));
    return typeof result.stdout === 'string' ? result.stdout : '';
  }

  async buildGitRepositorySnapshot(context, payload) {
    const rootText = await this.optionalGitText(context.rootPath, ['rev-parse', '--show-toplevel']);
    if (rootText.trim().length === 0) {
      throw new Error('Workspace is not a Git repository.');
    }
    const repositoryPath = fs.realpathSync(path.resolve(rootText.trim()));
    const workspaceId = readStringValue(payload, 'workspaceId',
      typeof context.workspaceId === 'string' ? context.workspaceId : '');
    const head = (await this.optionalGitText(repositoryPath, ['rev-parse', 'HEAD'])).trim();
    const branch = (await this.optionalGitText(repositoryPath, ['symbolic-ref', '--short', '-q', 'HEAD'])).trim();
    const upstream = (await this.optionalGitText(repositoryPath,
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim();
    const upstreamHead = upstream.length > 0
      ? (await this.optionalGitText(repositoryPath, ['rev-parse', '@{upstream}'])).trim()
      : '';
    const indexState = await this.optionalGitText(repositoryPath, ['ls-files', '--stage', '-z']);
    const statusState = await this.optionalGitText(repositoryPath,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const worktreeDiff = await this.optionalGitText(repositoryPath, ['diff', '--binary', '--no-ext-diff']);
    const untrackedPaths = uniqueSortedStrings(splitNullSeparated(await this.optionalGitText(
      repositoryPath,
      ['ls-files', '--others', '--exclude-standard', '-z']
    )));
    if (untrackedPaths.length > 2000) {
      const error = new Error('Git snapshot contains too many untracked files.');
      error.code = 'git_snapshot_too_large';
      throw error;
    }
    const untrackedState = [];
    for (const relativePath of untrackedPaths) {
      let contentHash = '';
      const hashResult = await executeGit(repositoryPath, ['hash-object', '--no-filters', '--', relativePath])
        .catch(() => null);
      if (hashResult && typeof hashResult.stdout === 'string') {
        contentHash = hashResult.stdout.trim();
      }
      if (contentHash.length === 0) {
        try {
          const resolved = resolveInside(repositoryPath, relativePath);
          const stat = fs.lstatSync(resolved.absolutePath);
          contentHash = digestGitPlanValue({
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            symbolicLink: stat.isSymbolicLink()
          });
        } catch (_error) {
          contentHash = 'unreadable';
        }
      }
      untrackedState.push({
        path: relativePath,
        hash: contentHash
      });
    }
    let ahead = 0;
    let behind = 0;
    if (upstream.length > 0 && head.length > 0) {
      const countText = (await this.optionalGitText(repositoryPath,
        ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).trim();
      const counts = countText.split(/\s+/);
      ahead = counts.length > 0 ? Number.parseInt(counts[0], 10) : 0;
      behind = counts.length > 1 ? Number.parseInt(counts[1], 10) : 0;
      if (!Number.isFinite(ahead)) ahead = 0;
      if (!Number.isFinite(behind)) behind = 0;
    }
    return {
      workspaceId,
      repositoryPath,
      head,
      branch,
      upstream,
      upstreamHead,
      indexFingerprint: digestGitPlanValue(indexState),
      worktreeFingerprint: digestGitPlanValue({
        statusState,
        worktreeDiff,
        untrackedState
      }),
      ahead,
      behind,
      dirty: statusState.length > 0
    };
  }

  async verifyGitCommitRef(repositoryPath, ref) {
    if (ref.length === 0) {
      return '';
    }
    const result = await executeGitAction(repositoryPath, ['rev-parse', '--verify', ref + '^{commit}']);
    return result.ok ? result.stdout.trim() : '';
  }

  async buildGitPlanPreview(operation, request, snapshot, context, args) {
    const action = gitPlanAction(operation);
    const affectedPaths = [];
    const untrackedPaths = [];
    const risks = [];
    let targetRef = '';
    let remoteName = '';
    let conflictPossible = false;
    if (operation === 'discard') {
      if (!Array.isArray(request.paths) || request.paths.length === 0) {
        return gitPlanFailure(action, 'git_paths_required', 'At least one path is required.', 'Select workspace-relative paths and retry.', context);
      }
      const statusArgs = ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--'].concat(request.paths);
      affectedPaths.push(...parsePorcelainPaths(await this.optionalGitText(snapshot.repositoryPath, statusArgs)));
      untrackedPaths.push(...splitNullSeparated(await this.optionalGitText(
        snapshot.repositoryPath,
        ['ls-files', '--others', '--exclude-standard', '-z', '--'].concat(request.paths)
      )));
      if (affectedPaths.length === 0) {
        return gitPlanFailure(action, 'git_nothing_to_do', 'Selected paths have no Git changes to discard.', 'Refresh workspace changes and select a changed path.', context);
      }
      risks.push(makeGitRisk(
        'worktree_overwrite',
        'high',
        'Tracked changes in the selected paths will be restored from the index or HEAD.',
        'Review the affected paths and preserve any changes that must not be lost.'
      ));
      if (untrackedPaths.length > 0) {
        risks.push(makeGitRisk(
          'untracked_delete',
          'critical',
          'Untracked files under the selected paths will be permanently deleted.',
          'Move or copy untracked files before confirming.'
        ));
      }
    } else if (operation === 'commit') {
      if (request.message.length === 0) {
        return gitPlanFailure(action, 'git_commit_message_required', 'Commit message is required.', 'Provide a non-empty commit message and request a new preview.', context);
      }
      const stagedPaths = splitNullSeparated(await this.optionalGitText(
        snapshot.repositoryPath,
        ['diff', '--cached', '--name-only', '-z']
      ));
      if (stagedPaths.length === 0) {
        return gitPlanFailure(action, 'git_nothing_to_commit', 'There are no staged changes to commit.', 'Stage the intended changes and request a new preview.', context);
      }
      affectedPaths.push(...stagedPaths);
      risks.push(makeGitRisk(
        'create_local_commit',
        'medium',
        'A new local commit will be created from the currently staged changes.',
        'Review the staged paths and commit message before confirming.'
      ));
    } else if (operation === 'pull') {
      remoteName = request.remote.length > 0
        ? request.remote
        : await resolveRemoteName(snapshot.repositoryPath, '', snapshot.branch);
      if (request.remote.length > 0 && request.branch.length > 0) {
        targetRef = request.remote + '/' + request.branch;
      } else if (request.branch.length > 0 && remoteName.length > 0) {
        targetRef = remoteName + '/' + request.branch;
      } else {
        targetRef = snapshot.upstream;
      }
      const targetHead = await this.verifyGitCommitRef(snapshot.repositoryPath, targetRef);
      if (targetHead.length === 0) {
        return gitPlanFailure(action, 'upstream_missing', 'Pull target is not available in local remote-tracking refs.', 'Fetch the remote or specify a valid remote and branch, then request a new preview.', context);
      }
      affectedPaths.push(...splitNullSeparated(await this.optionalGitText(
        snapshot.repositoryPath,
        ['diff', '--name-only', '-z', 'HEAD..' + targetRef]
      )));
      risks.push(makeGitRisk(
        request.ffOnly ? 'fast_forward_update' : 'merge_update',
        request.ffOnly ? 'medium' : 'high',
        request.ffOnly
          ? 'Pull will update the checked-out branch and worktree to the current tracking ref.'
          : 'Pull may create a merge commit or conflicts in the current worktree.',
        'Review local changes, ahead/behind counts, and affected paths before confirming.'
      ));
      if (snapshot.dirty) {
        risks.push(makeGitRisk(
          'dirty_worktree',
          'high',
          'The repository contains local index or worktree changes.',
          'Commit or stash local changes before pulling when possible.'
        ));
      }
    } else if (operation === 'push.force') {
      remoteName = request.remote.length > 0
        ? request.remote
        : await resolveRemoteName(snapshot.repositoryPath, '', snapshot.branch);
      const branchName = request.branch.length > 0 ? request.branch : snapshot.branch;
      targetRef = snapshot.upstream.length > 0 ? snapshot.upstream
        : (remoteName.length > 0 && branchName.length > 0 ? remoteName + '/' + branchName : '');
      if (remoteName.length === 0 || branchName.length === 0) {
        return gitPlanFailure(action, 'upstream_missing', 'Force push requires a remote and branch.', 'Configure an upstream or provide remote and branch explicitly.', context);
      }
      if (targetRef.length > 0 && await this.verifyGitCommitRef(snapshot.repositoryPath, targetRef)) {
        affectedPaths.push(...splitNullSeparated(await this.optionalGitText(
          snapshot.repositoryPath,
          ['diff', '--name-only', '-z', targetRef + '..HEAD']
        )));
      }
      risks.push(makeGitRisk(
        'remote_history_rewrite',
        'critical',
        'Force-with-lease may rewrite remote branch history.',
        'Confirm that remote collaborators do not depend on commits being replaced.'
      ));
    } else if (operation === 'branch.delete') {
      targetRef = request.name;
      if (targetRef.length === 0) {
        return gitPlanFailure(action, 'invalid_ref', 'Branch name is required.', 'Specify a local branch to delete.', context);
      }
      if (targetRef === snapshot.branch) {
        return gitPlanFailure(action, 'current_branch_delete', 'The checked-out branch cannot be deleted.', 'Switch to another branch before requesting deletion.', context);
      }
      const branchHead = await this.verifyGitCommitRef(snapshot.repositoryPath, 'refs/heads/' + targetRef);
      if (branchHead.length === 0) {
        return gitPlanFailure(action, 'invalid_ref', 'Local branch does not exist.', 'Refresh the branch list and select an existing local branch.', context);
      }
      const mergedText = await this.optionalGitText(snapshot.repositoryPath, ['branch', '--merged', 'HEAD', '--format=%(refname:short)']);
      const mergedBranches = mergedText.split(/\r?\n/).map((item) => item.trim()).filter((item) => item.length > 0);
      const merged = mergedBranches.includes(targetRef);
      risks.push(makeGitRisk(
        request.force || !merged ? 'unmerged_branch_delete' : 'branch_delete',
        request.force || !merged ? 'critical' : 'high',
        request.force || !merged
          ? 'The branch may contain commits that are not merged into HEAD.'
          : 'The local branch reference will be deleted.',
        'Create a backup ref or verify the branch is no longer needed.'
      ));
    } else if (operation === 'stash.pop' || operation === 'stash.drop') {
      targetRef = request.ref.length > 0 ? request.ref : 'stash@{0}';
      const stashHead = await this.verifyGitCommitRef(snapshot.repositoryPath, targetRef);
      if (stashHead.length === 0) {
        return gitPlanFailure(action, 'invalid_ref', 'Stash reference is invalid.', 'Refresh the stash list and select an existing stash.', context);
      }
      affectedPaths.push(...splitNullSeparated(await this.optionalGitText(
        snapshot.repositoryPath,
        ['stash', 'show', '--name-only', '-z', '--include-untracked', targetRef]
      )));
      risks.push(makeGitRisk(
        operation === 'stash.drop' ? 'stash_delete' : 'stash_apply_and_delete',
        operation === 'stash.drop' ? 'critical' : 'high',
        operation === 'stash.drop'
          ? 'The selected stash entry will be permanently removed.'
          : 'The stash will be applied to the worktree and removed if apply succeeds.',
        'Review the stash ref and affected paths before confirming.'
      ));
      if (operation === 'stash.pop' && snapshot.dirty) {
        risks.push(makeGitRisk(
          'dirty_worktree',
          'high',
          'Existing local changes may conflict with the stash.',
          'Commit or create another stash before popping when possible.'
        ));
      }
    } else if (operation === 'merge') {
      targetRef = request.ref;
      const targetHead = await this.verifyGitCommitRef(snapshot.repositoryPath, targetRef);
      if (targetHead.length === 0) {
        return gitPlanFailure(action, 'invalid_ref', 'Merge reference is invalid.', 'Refresh branch refs and provide a valid commit or branch.', context);
      }
      affectedPaths.push(...splitNullSeparated(await this.optionalGitText(
        snapshot.repositoryPath,
        ['diff', '--name-only', '-z', 'HEAD...' + targetRef]
      )));
      const mergeBase = (await this.optionalGitText(snapshot.repositoryPath, ['merge-base', 'HEAD', targetRef])).trim();
      if (mergeBase.length > 0) {
        const localPaths = new Set(splitNullSeparated(await this.optionalGitText(
          snapshot.repositoryPath,
          ['diff', '--name-only', '-z', mergeBase + '..HEAD']
        )));
        const targetPaths = splitNullSeparated(await this.optionalGitText(
          snapshot.repositoryPath,
          ['diff', '--name-only', '-z', mergeBase + '..' + targetRef]
        ));
        conflictPossible = targetPaths.some((item) => localPaths.has(item));
      }
      risks.push(makeGitRisk(
        request.ffOnly ? 'fast_forward_merge' : 'merge_changes',
        request.ffOnly ? 'medium' : 'high',
        request.ffOnly
          ? 'The current branch will move only if the merge is fast-forward.'
          : 'Merge may create a commit or leave conflicts in the worktree.',
        'Review the target ref and affected paths before confirming.'
      ));
      if (snapshot.dirty) {
        risks.push(makeGitRisk(
          'dirty_worktree',
          'high',
          'Local index or worktree changes may block or complicate the merge.',
          'Commit or stash local changes before merging.'
        ));
      }
      if (conflictPossible) {
        risks.push(makeGitRisk(
          'conflict_possible',
          'high',
          'Both sides changed at least one common path.',
          'Prepare to resolve conflicts or use a clean worktree.'
        ));
      }
    }
    return {
      ok: true,
      action,
      command: formatGitCommand(snapshot.repositoryPath, args),
      cwd: snapshot.repositoryPath,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
      preview: true,
      confirmed: false,
      affectedPaths: uniqueSortedStrings(affectedPaths),
      untrackedPaths: uniqueSortedStrings(untrackedPaths),
      targetRef,
      remoteName,
      ahead: snapshot.ahead,
      behind: snapshot.behind,
      conflictPossible,
      forceRisk: operation === 'push.force' || operation === 'branch.delete' && request.force === true,
      overwriteRisk: operation === 'discard' || operation === 'pull' || operation === 'merge' || operation === 'stash.pop',
      normalizedArgs: args.slice(),
      risks,
      snapshot: publicGitSnapshot(snapshot),
      branchName: snapshot.branch,
      changedFiles: uniqueSortedStrings(affectedPaths).length,
      changesCount: uniqueSortedStrings(affectedPaths).length,
      conflictSummary: {
        hasConflicts: false,
        count: 0,
        files: [],
        message: conflictPossible ? 'The preview found paths changed on both sides; conflicts are possible.' : '',
        remediation: conflictPossible ? 'Review the affected paths and prepare to resolve conflicts.' : ''
      },
      failureCategory: '',
      message: 'Git operation preview is ready.',
      remediation: 'Review the affected paths and risks, then confirm with the returned planId.',
      updatedAt: Date.now()
    };
  }

  async authorizeGitPlan(operation, payload, context, args) {
    const action = gitPlanAction(operation);
    const request = normalizedGitPlanRequest(operation, payload);
    let snapshot = null;
    try {
      snapshot = await this.buildGitRepositorySnapshot(context, payload);
    } catch (error) {
      return {
        authorized: false,
        response: gitPlanFailure(
          action,
          error && typeof error.code === 'string' ? error.code : 'git_snapshot_failed',
          error && typeof error.message === 'string' ? error.message : 'Git repository snapshot failed.',
          'Refresh the workspace Git state and retry.',
          context
        )
      };
    }
    if (!readBooleanValue(payload, 'confirm', false)) {
      const preview = await this.buildGitPlanPreview(operation, request, snapshot, context, args);
      if (!preview.ok) {
        return { authorized: false, response: preview };
      }
      const created = this.gitPlanManager.create({
        operation,
        workspaceId: snapshot.workspaceId,
        repositoryPath: snapshot.repositoryPath,
        request,
        snapshot,
        preview
      });
      if (!created.ok) {
        return { authorized: false, response: Object.assign(preview, created) };
      }
      return {
        authorized: false,
        response: Object.assign(preview, created)
      };
    }
    const consumed = this.gitPlanManager.consume({
      planId: readStringValue(payload, 'planId', ''),
      operation,
      workspaceId: snapshot.workspaceId,
      repositoryPath: snapshot.repositoryPath,
      request,
      snapshot
    });
    if (!consumed.ok) {
      return {
        authorized: false,
        response: Object.assign(
          gitPlanFailure(action, consumed.failureCategory, consumed.message, consumed.remediation, context),
          { planId: readStringValue(payload, 'planId', '') }
        )
      };
    }
    return {
      authorized: true,
      plan: consumed.plan,
      snapshot
    };
  }

  confirmedGitPlanExtra(authorization, payload) {
    const preview = authorization && authorization.plan && authorization.plan.preview
      ? authorization.plan.preview
      : {};
    return {
      preview: false,
      confirmed: true,
      planId: readStringValue(payload, 'planId', ''),
      affectedPaths: Array.isArray(preview.affectedPaths) ? preview.affectedPaths : [],
      untrackedPaths: Array.isArray(preview.untrackedPaths) ? preview.untrackedPaths : [],
      targetRef: typeof preview.targetRef === 'string' ? preview.targetRef : '',
      remoteName: typeof preview.remoteName === 'string' ? preview.remoteName : '',
      ahead: typeof preview.ahead === 'number' ? preview.ahead : 0,
      behind: typeof preview.behind === 'number' ? preview.behind : 0,
      conflictPossible: preview.conflictPossible === true,
      forceRisk: preview.forceRisk === true,
      overwriteRisk: preview.overwriteRisk === true,
      normalizedArgs: Array.isArray(preview.normalizedArgs) ? preview.normalizedArgs : [],
      risks: Array.isArray(preview.risks) ? preview.risks : [],
      snapshot: preview.snapshot && typeof preview.snapshot === 'object' ? preview.snapshot : {}
    };
  }

  resolveSession(sessionId) {
    if (!this.registry || typeof this.registry.findSession !== 'function') {
      throw new Error('Session lookup is not available for this WorkspaceService.');
    }
    const match = this.registry.findSession(sessionId);
    if (!match) {
      throw new Error('Session not found: ' + sessionId);
    }
    const rootPath = normalizeWorkspaceRoot(match.session);
    return {
      provider: match.provider,
      session: match.session,
      rootPath
    };
  }

  resolveContext(payload, write) {
    const agentId = readStringValue(payload, 'agentId', '');
    if (agentId.length > 0) {
      if (!this.agentManager) {
        throw new Error('Agent resource scope lookup is not available.');
      }
      const scope = this.agentManager.validateResourceScope(agentId, payload, { write: write === true });
      if (!scope.ok) {
        const error = new Error(scope.message || 'Agent resource scope validation failed.');
        error.code = scope.code || 'agent_resource_scope_mismatch';
        throw error;
      }
      const agent = this.agentManager.find(agentId);
      const provider = agent && this.registry && typeof this.registry.resolve === 'function'
        ? this.registry.resolve(agent.provider)
        : null;
      const match = scope.providerSessionId.length > 0 && this.registry && typeof this.registry.findSession === 'function'
        ? this.registry.findSession(scope.providerSessionId)
        : null;
      return {
        provider: match ? match.provider : provider,
        session: match ? match.session : null,
        rootPath: scope.rootPath,
        agentId: scope.agentId,
        workspaceId: scope.workspaceId
      };
    }
    const sessionId = readStringValue(payload, 'sessionId', '');
    return this.resolveSession(sessionId);
  }

  resolveGitRoot(payload) {
    const agentId = readStringValue(payload, 'agentId', '');
    if (agentId.length > 0) {
      const context = this.resolveContext(payload, true);
      return {
        sessionId: readStringValue(payload, 'sessionId', ''),
        providerId: context.provider ? context.provider.id : '',
        rootPath: context.rootPath,
        agentId: context.agentId,
        workspaceId: context.workspaceId
      };
    }
    const sessionId = readStringValue(payload, 'sessionId', '');
    if (sessionId.length > 0) {
      const match = this.registry && typeof this.registry.findSession === 'function'
        ? this.registry.findSession(sessionId)
        : null;
      if (match) {
        return {
          sessionId,
          providerId: match.provider.id,
          rootPath: normalizeWorkspaceRoot(match.session)
        };
      }
    }
    const workspacePath = readStringValue(payload, 'workspacePath', readStringValue(payload, 'cwd', ''));
    if (workspacePath.length === 0) {
      if (sessionId.length > 0) {
        throw new Error('Session not found: ' + sessionId);
      }
      throw new Error('sessionId or workspacePath is required.');
    }
    const rootPath = path.resolve(workspacePath);
    const stat = fs.statSync(rootPath);
    if (!stat.isDirectory()) {
      throw new Error('workspacePath is not a directory.');
    }
    return {
      sessionId,
      providerId: '',
      rootPath
    };
  }

  async getChanges(payload) {
    const context = this.resolveGitRoot(payload);
    const sessionId = context.sessionId;
    // Collapse the per-tab 15s refresh storms into one computation per TTL:
    // several Web UI tabs recompute the same workspace changes constantly,
    // each spawning dozens of git subprocesses.
    const cached = this.changesCache.get(context.rootPath);
    if (cached && Date.now() - cached.at < CHANGES_CACHE_TTL_MS) {
      return this.remapChangesResponse(cached.payload, sessionId);
    }
    const computed = await this.computeChangesUncached(context, payload);
    this.changesCache.set(context.rootPath, { at: Date.now(), payload: computed });
    return this.remapChangesResponse(computed, sessionId);
  }

  async computeChangesUncached(context, payload) {
    const sessionId = 'cached';
    const statusResult = await executeGit(context.rootPath, ['status', '--porcelain=v1', '-z']);
    const entries = parsePorcelainZ(statusResult.stdout);
    const branchResult = await executeGit(context.rootPath, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: '' }));
    const unstagedNumstat = parseNumstat((await executeGit(context.rootPath, ['diff', '--numstat']).catch(() => ({ stdout: '' }))).stdout);
    const stagedNumstat = parseNumstat((await executeGit(context.rootPath, ['diff', '--cached', '--numstat']).catch(() => ({ stdout: '' }))).stdout);
    const changes = [];
    const untrackedEntries = entries.filter((entry) => entry.status === 'untracked');
    const untrackedIndex = untrackedEntries.length > 0 ? await buildUntrackedFileMap(context.rootPath, untrackedEntries) : new Map();
    for (const entry of entries) {
      const numstat = entry.staged && stagedNumstat.has(entry.path) ? stagedNumstat.get(entry.path) : unstagedNumstat.get(entry.path);
      let additions = numstat ? numstat.additions : 0;
      let deletions = numstat ? numstat.deletions : 0;
      let kind = workspaceChangeKindForPath(context.rootPath, entry.path);
      let changedFileCount = kind === 'directory' ? 0 : 1;
      if (entry.status === 'untracked') {
        const untrackedFiles = untrackedIndex.get(entry.path) || [];
        additions = countUntrackedFileAdditions(context.rootPath, untrackedFiles);
        deletions = 0;
        changedFileCount = untrackedFiles.length > 0 ? untrackedFiles.length : changedFileCount;
        if (untrackedFiles.length > 0 && (untrackedFiles.length > 1 || untrackedFiles[0] !== entry.path)) {
          kind = 'directory';
        }
      }
      changes.push({
        id: sessionId + ':' + entry.path + ':' + (entry.staged ? 'staged' : 'worktree'),
        sessionId,
        workspaceId: readStringValue(payload, 'workspaceId', ''),
        providerId: context.providerId,
        path: entry.path,
        oldPath: entry.oldPath,
        kind,
        changedFileCount,
        status: entry.status,
        staged: entry.staged,
        additions,
        deletions,
        diffText: '',
        updatedAt: Date.now()
      });
    }
    const branchName = branchResult.stdout.trim();
    return {
      sessionId,
      providerId: context.providerId,
      workspacePath: context.rootPath,
      branchName,
      changes,
      commits: await this.getRecentCommitsForRoot(context.rootPath, sessionId, context.providerId, readStringValue(payload, 'workspaceId', '')),
      diffSummary: buildDiffSummaryFromChanges(branchName, changes)
    };
  }

  async getChangesOrEmpty(payload, context) {
    try {
      return await this.getChanges(payload);
    } catch (_error) {
      return emptyChangesForContext(context);
    }
  }

  async getDiff(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const filePath = normalizeRelativePath(readStringValue(payload, 'path', ''));
    const staged = readBooleanValue(payload, 'staged', false);
    const context = this.resolveContext(payload, false);
    const args = ['diff'];
    if (staged) {
      args.push('--cached');
    }
    if (filePath.length > 0) {
      args.push('--');
      args.push(filePath);
    }
    const result = await executeGit(context.rootPath, args);
    let diffText = result.stdout;
    let additions = 0;
    let deletions = 0;
    let kind = workspaceChangeKindForPath(context.rootPath, filePath);
    let changedFileCount = kind === 'directory' ? 0 : 1;
    if (!staged && diffText.length === 0 && filePath.length > 0) {
      const untrackedFiles = await listUntrackedFilesForPath(context.rootPath, filePath);
      diffText = buildSyntheticUntrackedDiff(context.rootPath, untrackedFiles);
      additions = countUntrackedFileAdditions(context.rootPath, untrackedFiles);
      changedFileCount = untrackedFiles.length > 0 ? untrackedFiles.length : changedFileCount;
      if (untrackedFiles.length > 0 && (untrackedFiles.length > 1 || untrackedFiles[0] !== filePath)) {
        kind = 'directory';
      }
    }
    if (additions === 0 && deletions === 0 && diffText.length > 0) {
      const stats = countDiffStats(diffText);
      additions = stats.additions;
      deletions = stats.deletions;
    }
    const fileCursor = Math.max(0, readNumberValue(payload, 'fileCursor', 0));
    const fileLimit = Math.min(200, Math.max(1, readNumberValue(payload, 'fileLimit', 50)));
    const lineOffset = Math.max(0, readNumberValue(payload, 'lineOffset', 0));
    const lineLimit = Math.min(10000, Math.max(1, readNumberValue(payload, 'lineLimit', 2000)));
    const maxBytes = Math.min(4 * 1024 * 1024, Math.max(1024, readNumberValue(payload, 'maxBytes', 512 * 1024)));
    const sections = diffText.length > 0 ? diffText.split(/(?=^diff --git )/m).filter((item) => item.length > 0) : [];
    const selectedSections = sections.length > 0 ? sections.slice(fileCursor, fileCursor + fileLimit) : [diffText];
    const selectedText = selectedSections.join('');
    const lines = selectedText.split('\n');
    let pagedText = lines.slice(lineOffset, lineOffset + lineLimit).join('\n');
    let truncationReason = '';
    if (lineOffset + lineLimit < lines.length) truncationReason = 'line_limit';
    if (Buffer.byteLength(pagedText, 'utf8') > maxBytes) {
      const bytes = Buffer.from(pagedText, 'utf8');
      pagedText = bytes.subarray(0, maxBytes).toString('utf8');
      truncationReason = 'byte_limit';
    } else if (fileCursor + fileLimit < sections.length) {
      truncationReason = 'file_limit';
    }
    const truncated = truncationReason.length > 0;
    return {
      sessionId,
      path: filePath,
      kind,
      changedFileCount,
      staged,
      additions,
      deletions,
      diffText: pagedText,
      fileCursor,
      fileLimit,
      nextFileCursor: fileCursor + fileLimit < sections.length ? fileCursor + fileLimit : -1,
      lineOffset,
      lineLimit,
      nextLineOffset: lineOffset + lineLimit < lines.length ? lineOffset + lineLimit : -1,
      truncated,
      truncationReason,
      totalFiles: sections.length,
      totalLines: lines.length,
      updatedAt: Date.now()
    };
  }

  async listFiles(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const parentPath = normalizeRelativePath(readStringValue(payload, 'parentPath', readStringValue(payload, 'path', '')));
    const context = this.resolveContext(payload, false);
    const resolved = resolveInside(context.rootPath, parentPath);
    const entries = fs.readdirSync(resolved.absolutePath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const absolutePath = path.join(resolved.absolutePath, entry.name);
      try {
        const stat = fs.statSync(absolutePath);
        files.push(makeFileItem(parentPath, entry, stat));
      } catch (error) {
        files.push({
          workspaceId: '',
          path: formatRelativePath(parentPath, entry.name),
          parentPath,
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file',
          depth: depthForPath(formatRelativePath(parentPath, entry.name)),
          sizeBytes: 0,
          modifiedAt: 0,
          isHidden: isHiddenName(entry.name),
          updatedAt: Date.now()
        });
      }
    }
    files.sort(sortFileItems);
    return {
      sessionId,
      providerId: context.provider ? context.provider.id : '',
      workspacePath: context.rootPath,
      parentPath,
      files
    };
  }

  async getFile(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const rawPath = readStringValue(payload, 'path', '');
    const rawParentPath = readStringValue(payload, 'parentPath', '');
    const context = this.resolveContext(payload, false);
    const resolved = resolveWorkspaceFileForPayload(context.rootPath, payload);
    const filePath = resolved.relativePath;
    console.info('[workspace.file.get]', JSON.stringify({
      sessionId,
      rawPath,
      rawParentPath,
      filePath,
      absolutePath: resolved.absolutePath
    }));
    const stat = fs.statSync(resolved.absolutePath);
    if (!stat.isFile()) {
      throw new Error('Requested path is not a file.');
    }
    const mediaType = mediaTypeForPath(filePath);
    if (isRasterImageMediaType(mediaType)) {
      if (stat.size > MAX_IMAGE_BYTES) {
        return {
          sessionId,
          path: filePath,
          mediaType,
          content: '',
          sizeBytes: stat.size,
          truncated: true,
          updatedAt: Date.now()
        };
      }
      const imageBuffer = fs.readFileSync(resolved.absolutePath);
      return {
        sessionId,
        path: filePath,
        mediaType,
        content: 'data:' + mediaType + ';base64,' + imageBuffer.toString('base64'),
        sizeBytes: stat.size,
        truncated: false,
        updatedAt: Date.now()
      };
    }
    if (stat.size > MAX_TEXT_BYTES) {
      return {
        sessionId,
        path: filePath,
        mediaType,
        content: '',
        sizeBytes: stat.size,
        truncated: true,
        updatedAt: Date.now()
      };
    }
    const contentBuffer = fs.readFileSync(resolved.absolutePath);
    if (mediaType === 'text/plain' && bufferHasNullByte(contentBuffer)) {
      return {
        sessionId,
        path: filePath,
        mediaType: 'application/octet-stream',
        content: '',
        sizeBytes: stat.size,
        truncated: true,
        updatedAt: Date.now()
      };
    }
    const content = contentBuffer.toString('utf8');
    return {
      sessionId,
      path: filePath,
      mediaType,
      content,
      sizeBytes: stat.size,
      truncated: false,
      updatedAt: Date.now()
    };
  }

  async prepareDownload(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveContext(payload, false);
    const resolved = resolveWorkspaceFileForPayload(context.rootPath, payload);
    const filePath = resolved.relativePath;
    const stat = fs.statSync(resolved.absolutePath);
    if (!stat.isFile()) {
      throw new Error('Requested path is not a file.');
    }
    const token = crypto.randomBytes(20).toString('hex');
    this.downloadTokens.set(token, {
      token,
      sessionId,
      path: filePath,
      absolutePath: resolved.absolutePath,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS
    });
    return {
      sessionId,
      path: filePath,
      token,
      downloadPath: '/download/' + encodeURIComponent(token),
      fileName: path.basename(filePath),
      sizeBytes: stat.size,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS
    };
  }

  async prepareAttachmentDownload(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const requestedPath = readStringValue(payload, 'path', '').trim();
    const kind = readStringValue(payload, 'kind', 'attachment.preview');
    if (requestedPath.length === 0) {
      throw new Error('Attachment path is required.');
    }
    if (!path.isAbsolute(requestedPath)) {
      throw new Error('Attachment path must be absolute.');
    }
    const absolutePath = path.resolve(requestedPath);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw new Error('Requested attachment is not a file.');
    }
    const token = crypto.randomBytes(20).toString('hex');
    const fileName = path.basename(absolutePath);
    this.downloadTokens.set(token, {
      token,
      sessionId,
      path: absolutePath,
      absolutePath,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS
    });
    return {
      sessionId,
      path: absolutePath,
      kind,
      token,
      downloadPath: '/download/' + encodeURIComponent(token),
      fileName,
      mediaType: mediaTypeForPath(fileName),
      sizeBytes: stat.size,
      expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS
    };
  }

  consumeDownloadToken(token) {
    const item = this.downloadTokens.get(token);
    if (!item) {
      return null;
    }
    if (item.expiresAt < Date.now()) {
      this.downloadTokens.delete(token);
      return null;
    }
    return item;
  }

  async stage(payload) {
    this.clearChangesCache();
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveContext(payload, true);
    const paths = pathsForGit(readPathArray(payload));
    if (paths.length === 0) {
      throw new Error('At least one path is required.');
    }
    await executeGit(context.rootPath, ['add', '--'].concat(paths));
    return await this.getChanges(payload);
  }

  async unstage(payload) {
    this.clearChangesCache();
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveContext(payload, true);
    const paths = pathsForGit(readPathArray(payload));
    if (paths.length === 0) {
      throw new Error('At least one path is required.');
    }
    try {
      await executeGit(context.rootPath, ['restore', '--staged', '--'].concat(paths));
    } catch (error) {
      await executeGit(context.rootPath, ['reset', 'HEAD', '--'].concat(paths));
    }
    return await this.getChanges(payload);
  }

  async discard(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const paths = pathsForGit(readPathArray(payload));
    if (paths.length === 0) {
      throw new Error('At least one path is required.');
    }
    const args = ['restore', '--staged', '--worktree', '--'].concat(paths);
    const authorization = await this.authorizeGitPlan('discard', payload, context, args);
    if (!authorization.authorized) {
      return authorization.response;
    }
    const preview = authorization.plan && authorization.plan.preview ? authorization.plan.preview : {};
    const affectedPaths = Array.isArray(preview.affectedPaths) ? preview.affectedPaths : [];
    const untrackedPaths = Array.isArray(preview.untrackedPaths) ? preview.untrackedPaths : [];
    const untrackedSet = new Set(untrackedPaths);
    const trackedPaths = affectedPaths.filter((item) => !untrackedSet.has(item));
    const results = [];
    if (trackedPaths.length > 0) {
      results.push(await executeGitAction(context.rootPath, ['restore', '--staged', '--worktree', '--'].concat(trackedPaths)));
    }
    if (untrackedPaths.length > 0) {
      results.push(await executeGitAction(context.rootPath, ['clean', '-fd', '--'].concat(untrackedPaths)));
    }
    const ok = results.length > 0 && results.every((item) => item.ok === true);
    const combined = {
      ok,
      command: results.map((item) => item.command).join(' && '),
      cwd: context.rootPath,
      exitCode: ok ? 0 : 1,
      stdout: results.map((item) => item.stdout).filter((item) => item.length > 0).join('\n'),
      stderr: results.map((item) => item.stderr).filter((item) => item.length > 0).join('\n'),
      durationMs: results.reduce((total, item) => total + item.durationMs, 0)
    };
    const changes = await this.getChangesOrEmpty(payload, context);
    return await buildGitActionResponse(
      'discard',
      context,
      args,
      combined,
      changes,
      this.confirmedGitPlanExtra(authorization, payload),
      payload
    );
  }

  async commit(payload) {
    this.clearChangesCache();
    const sessionId = readStringValue(payload, 'sessionId', '');
    const message = readStringValue(payload, 'message', '').trim();
    if (message.length === 0) {
      throw new Error('Commit message is required.');
    }
    const context = this.resolveContext(payload, true);
    const requiresPlan = readBooleanValue(payload, 'preview', false) ||
      readBooleanValue(payload, 'requireConfirm', false) ||
      readBooleanValue(payload, 'confirm', false) ||
      readStringValue(payload, 'planId', '').length > 0;
    if (requiresPlan) {
      const args = ['commit', '-m', message];
      const authorization = await this.authorizeGitPlan('commit', payload, context, args);
      if (!authorization.authorized) {
        return authorization.response;
      }
      const result = await executeGitAction(context.rootPath, args);
      const changes = await this.getChangesOrEmpty(payload, context);
      return await buildGitActionResponse('commit', context, args, result, changes, Object.assign({
        commitMessage: message
      }, this.confirmedGitPlanExtra(authorization, payload)), payload);
    }
    const result = await executeGit(context.rootPath, ['commit', '-m', message]);
    const changes = await this.getChanges(payload);
    return {
      sessionId,
      output: result.stdout,
      changes: changes.changes,
      branchName: changes.branchName,
      commits: await this.getRecentCommitsForRoot(context.rootPath, sessionId, context.provider ? context.provider.id : '', readStringValue(payload, 'workspaceId', ''))
    };
  }

  async pull(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const args = ['pull'];
    if (readBooleanValue(payload, 'ffOnly', true)) {
      args.push('--ff-only');
    }
    const remote = readStringValue(payload, 'remote', '').trim();
    const branch = readStringValue(payload, 'branch', '').trim();
    if (remote.length > 0) {
      args.push(remote);
    }
    if (branch.length > 0) {
      args.push(branch);
    }
    const authorization = await this.authorizeGitPlan('pull', payload, context, args);
    if (!authorization.authorized) {
      return authorization.response;
    }
    const result = await executeGitAction(context.rootPath, args);
    const changes = await this.getChangesOrEmpty(payload, context);
    return await buildGitActionResponse(
      'pull',
      context,
      args,
      result,
      changes,
      this.confirmedGitPlanExtra(authorization, payload),
      payload
    );
  }

  async push(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const args = ['push'];
    const force = readBooleanValue(payload, 'force', false);
    if (force) {
      args.push('--force-with-lease');
    }
    const remote = readStringValue(payload, 'remote', '').trim();
    const branch = readStringValue(payload, 'branch', '').trim();
    if (remote.length > 0) {
      args.push(remote);
    }
    if (branch.length > 0) {
      args.push(branch);
    }
    let authorization = null;
    if (force) {
      authorization = await this.authorizeGitPlan('push.force', payload, context, args);
      if (!authorization.authorized) {
        return authorization.response;
      }
    }
    const result = await executeGitAction(context.rootPath, args);
    const changes = await this.getChangesOrEmpty(payload, context);
    return await buildGitActionResponse(
      'push',
      context,
      args,
      result,
      changes,
      authorization ? this.confirmedGitPlanExtra(authorization, payload) : { preview: false, confirmed: true },
      payload
    );
  }

  async branch(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const action = readGitAction(payload, 'list');
    let actionArgs = ['branch', '--list', '--format=%(refname:short)%x1f%(HEAD)%x1f%(upstream:short)'];
    let actionResult = null;
    let authorization = null;
    if (action === 'create') {
      const name = readStringValue(payload, 'name', '').trim();
      if (name.length === 0) {
        throw new Error('Branch name is required.');
      }
      const startPoint = readStringValue(payload, 'startPoint', '').trim();
      const args = ['branch', name];
      if (startPoint.length > 0) {
        args.push(startPoint);
      }
      actionArgs = args;
      actionResult = await executeGitAction(context.rootPath, args);
    } else if (action === 'checkout' || action === 'switch') {
      const name = readStringValue(payload, 'name', '').trim();
      if (name.length === 0) {
        throw new Error('Branch name is required.');
      }
      actionArgs = ['switch', name];
      actionResult = await executeGitAction(context.rootPath, actionArgs);
    } else if (action === 'delete') {
      const name = readStringValue(payload, 'name', '').trim();
      if (name.length === 0) {
        throw new Error('Branch name is required.');
      }
      const force = readBooleanValue(payload, 'force', false);
      actionArgs = ['branch', force ? '-D' : '-d', name];
      authorization = await this.authorizeGitPlan('branch.delete', payload, context, actionArgs);
      if (!authorization.authorized) {
        return authorization.response;
      }
      actionResult = await executeGitAction(context.rootPath, actionArgs);
    } else if (action !== 'list') {
      throw new Error('Unsupported branch action: ' + action);
    }
    if (!actionResult) {
      actionResult = await executeGitAction(context.rootPath, actionArgs);
    }
    const result = await executeGit(context.rootPath, ['branch', '--list', '--format=%(refname:short)%x1f%(HEAD)%x1f%(upstream:short)']).catch(() => ({ stdout: '' }));
    const branches = [];
    const lines = result.stdout.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const parts = line.split('\x1f');
      branches.push({
        name: parts[0] || '',
        current: parts.length > 1 && parts[1] === '*',
        upstream: parts.length > 2 ? parts[2] : ''
      });
    }
    const changes = await this.getChangesOrEmpty(payload, context);
    const branchExtra = {
      branches
    };
    if (authorization) {
      Object.assign(branchExtra, this.confirmedGitPlanExtra(authorization, payload));
    }
    return await buildGitActionResponse(action, context, actionArgs, actionResult, changes, branchExtra, payload);
  }

  async stash(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const action = readGitAction(payload, 'list');
    let args = ['stash', 'list'];
    if (action === 'push') {
      const message = readStringValue(payload, 'message', '').trim();
      args = ['stash', 'push'];
      if (message.length > 0) {
        args.push('-m');
        args.push(message);
      }
      if (readBooleanValue(payload, 'includeUntracked', true)) {
        args.push('--include-untracked');
      }
    } else if (action === 'pop') {
      const ref = readStringValue(payload, 'ref', '').trim();
      args = ['stash', 'pop'];
      if (ref.length > 0) {
        args.push(ref);
      }
    } else if (action === 'apply') {
      const ref = readStringValue(payload, 'ref', '').trim();
      args = ['stash', 'apply'];
      if (ref.length > 0) {
        args.push(ref);
      }
    } else if (action === 'drop') {
      const ref = readStringValue(payload, 'ref', '').trim();
      args = ['stash', 'drop'];
      if (ref.length > 0) {
        args.push(ref);
      }
    } else if (action !== 'list') {
      throw new Error('Unsupported stash action: ' + action);
    }
    let authorization = null;
    if (action === 'pop' || action === 'drop') {
      authorization = await this.authorizeGitPlan('stash.' + action, payload, context, args);
      if (!authorization.authorized) {
        return authorization.response;
      }
    }
    const result = await executeGitAction(context.rootPath, args);
    const listResult = await executeGit(context.rootPath, ['stash', 'list']).catch(() => ({ stdout: '' }));
    const changes = await this.getChangesOrEmpty(payload, context);
    const stashExtra = {
      stashes: listResult.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0)
    };
    if (authorization) {
      Object.assign(stashExtra, this.confirmedGitPlanExtra(authorization, payload));
    }
    return await buildGitActionResponse(action, context, args, result, changes, stashExtra, payload);
  }

  async merge(payload) {
    this.clearChangesCache();
    const context = this.resolveGitRoot(payload);
    const ref = readStringValue(payload, 'ref', readStringValue(payload, 'branch', '')).trim();
    if (ref.length === 0) {
      throw new Error('Merge ref is required.');
    }
    const args = ['merge'];
    if (readBooleanValue(payload, 'noCommit', false)) {
      args.push('--no-commit');
    }
    if (readBooleanValue(payload, 'ffOnly', false)) {
      args.push('--ff-only');
    }
    args.push(ref);
    const authorization = await this.authorizeGitPlan('merge', payload, context, args);
    if (!authorization.authorized) {
      return authorization.response;
    }
    const result = await executeGitAction(context.rootPath, args);
    const changes = await this.getChangesOrEmpty(payload, context);
    return await buildGitActionResponse('merge', context, args, result, changes, Object.assign({
      ref
    }, this.confirmedGitPlanExtra(authorization, payload)), payload);
  }

  async status(payload) {
    const context = this.resolveGitRoot(payload);
    const args = ['status', '--short', '--branch'];
    const result = await executeGitAction(context.rootPath, args);
    const changes = await this.getChangesOrEmpty(payload, context);
    return await buildGitActionResponse('status', context, args, result, changes, {}, payload);
  }

  async listWorktrees(payload) {
    const context = this.resolveGitRoot(payload);
    const args = ['worktree', 'list', '--porcelain'];
    const result = await executeGitAction(context.rootPath, args);
    const rawWorktrees = result.ok ? parseWorktreePorcelain(result.stdout) : [];
    const gitPathSet = new Set();
    for (const item of rawWorktrees) {
      if (item && typeof item.path === 'string' && item.path.length > 0) {
        gitPathSet.add(path.resolve(item.path).toLowerCase());
      }
    }
    const worktrees = [];
    for (const item of rawWorktrees) {
      worktrees.push(decorateWorktreeRecord(item, this.workspaceRegistry, gitPathSet));
    }
    appendRegistryOnlyWorktrees(worktrees, this.workspaceRegistry, gitPathSet, readBooleanValue(payload, 'includeArchived', false));
    return {
      ok: result.ok,
      action: 'worktree.list',
      command: result.command,
      cwd: context.rootPath,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.stdout,
      errorOutput: result.stderr,
      durationMs: result.durationMs,
      sessionId: context.sessionId,
      providerId: context.providerId,
      rootPath: context.rootPath,
      worktreePath: '',
      branch: '',
      startPoint: '',
      preview: false,
      confirmed: true,
      registryLinked: false,
      sourceWorkspaceId: readStringValue(payload, 'sourceWorkspaceId', readStringValue(payload, 'workspaceId', '')),
      sourceRootPath: readStringValue(payload, 'sourceRootPath', context.rootPath),
      setupStatus: 'skipped',
      teardownStatus: 'skipped',
      validation: emptyWorktreeValidation(),
      worktrees,
      updatedAt: Date.now()
    };
  }

  validateWorktreeCreate(context, payload, currentWorktrees) {
    const validation = emptyWorktreeValidation();
    const rawWorktreePath = readStringValue(payload, 'worktreePath', readStringValue(payload, 'path', '')).trim();
    if (rawWorktreePath.length === 0) {
      pushWorktreeValidationError(validation, 'path_required', 'Absolute worktreePath is required.', 'Choose an absolute path outside the repository .git directory.');
      return {
        validation,
        worktreePath: '',
        branch: '',
        startPoint: ''
      };
    }
    if (!path.isAbsolute(rawWorktreePath)) {
      pushWorktreeValidationError(validation, 'path_not_absolute', 'Worktree path must be absolute.', 'Use an absolute path for the new worktree.');
      return {
        validation,
        worktreePath: rawWorktreePath,
        branch: '',
        startPoint: ''
      };
    }
    const worktreePath = path.resolve(rawWorktreePath);
    const branch = readStringValue(payload, 'branch', '').trim();
    const startPoint = readStringValue(payload, 'startPoint', '').trim();
    const gitDir = path.join(context.rootPath, '.git');
    if (isPathInside(gitDir, worktreePath)) {
      pushWorktreeValidationError(validation, 'path_inside_git_dir', 'Worktree path cannot be inside .git.', 'Choose a path outside the repository metadata directory.');
    }
    const targetLower = worktreePath.toLowerCase();
    for (const item of currentWorktrees) {
      if (!item || typeof item.path !== 'string') {
        continue;
      }
      if (path.resolve(item.path).toLowerCase() === targetLower) {
        pushWorktreeValidationError(validation, 'already_registered', 'Worktree path is already registered in this repository.', 'Choose another path or archive the existing worktree first.');
      }
    }
    const parentPath = path.dirname(worktreePath);
    if (!fs.existsSync(parentPath)) {
      if (readBooleanValue(payload, 'createParent', false)) {
        pushWorktreeValidationWarning(validation, 'parent_will_be_created', 'Worktree parent directory will be created after confirmation.', 'Review the preview before confirming.');
      } else {
        pushWorktreeValidationError(validation, 'parent_missing', 'Worktree parent directory does not exist.', 'Create the parent directory first or choose another path.');
      }
    } else {
      try {
        const parentStat = fs.statSync(parentPath);
        if (!parentStat.isDirectory()) {
          pushWorktreeValidationError(validation, 'parent_not_directory', 'Worktree parent path is not a directory.', 'Choose a path under an existing directory.');
        }
      } catch (_error) {
        pushWorktreeValidationError(validation, 'parent_unreadable', 'Worktree parent directory cannot be read.', 'Check local filesystem permissions and retry.');
      }
    }
    if (fs.existsSync(worktreePath)) {
      try {
        const stat = fs.statSync(worktreePath);
        if (!stat.isDirectory()) {
          pushWorktreeValidationError(validation, 'target_not_directory', 'Worktree target exists and is not a directory.', 'Choose a new path or remove the existing file manually.');
        } else {
          const entries = fs.readdirSync(worktreePath);
          if (entries.length > 0) {
            pushWorktreeValidationError(validation, 'target_not_empty', 'Worktree target directory is not empty.', 'Choose a new empty directory or a path that does not exist.');
          } else {
            pushWorktreeValidationWarning(validation, 'target_empty_directory', 'Worktree target directory already exists but is empty.', 'Git may use this empty directory for the new worktree.');
          }
        }
      } catch (_error) {
        pushWorktreeValidationError(validation, 'target_unreadable', 'Worktree target path cannot be inspected.', 'Check local filesystem permissions and retry.');
      }
    }
    if (branch.length > 0 && /\s/.test(branch)) {
      pushWorktreeValidationError(validation, 'branch_invalid', 'Worktree branch name cannot contain whitespace.', 'Use a valid Git branch name.');
    }
    if (startPoint.length > 0 && /\s/.test(startPoint)) {
      pushWorktreeValidationError(validation, 'start_point_invalid', 'Worktree start point cannot contain whitespace.', 'Use a valid branch, tag, or commit ref.');
    }
    return {
      validation,
      worktreePath,
      branch,
      startPoint
    };
  }

  buildWorktreeResult(action, context, args, gitResult, extra) {
    return Object.assign({
      ok: gitResult.ok === true,
      action,
      command: gitResult.command,
      cwd: context.rootPath,
      exitCode: gitResult.exitCode,
      stdout: gitResult.stdout,
      stderr: gitResult.stderr,
      output: gitResult.stdout,
      errorOutput: gitResult.stderr,
      durationMs: gitResult.durationMs,
      sessionId: context.sessionId,
      providerId: context.providerId,
      rootPath: context.rootPath,
      updatedAt: Date.now()
    }, extra || {});
  }

  async createWorktree(payload) {
    const context = this.resolveGitRoot(payload);
    const listedBefore = await this.listWorktrees(payload);
    const validationState = this.validateWorktreeCreate(context, payload, listedBefore.worktrees);
    const worktreePath = validationState.worktreePath;
    const branch = validationState.branch;
    const startPoint = validationState.startPoint;
    const confirm = readBooleanValue(payload, 'confirm', false);
    const preview = readBooleanValue(payload, 'preview', !confirm);
    const sourceWorkspaceId = readStringValue(payload, 'sourceWorkspaceId', readStringValue(payload, 'workspaceId', ''));
    const sourceRootPath = readStringValue(payload, 'sourceRootPath', context.rootPath);
    const setupCommand = readStringValue(payload, 'setupCommand', '').trim();
    const createParent = readBooleanValue(payload, 'createParent', false);
    const args = ['worktree', 'add'];
    if (branch.length > 0) {
      args.push('-b');
      args.push(branch);
    }
    args.push(path.resolve(worktreePath));
    if (startPoint.length > 0) {
      args.push(startPoint);
    }
    if (!validationState.validation.ok || !confirm) {
      const failure = worktreeFailureFromValidation(validationState.validation, confirm ? 'validation_failed' : 'confirm_required');
      const virtualResult = {
        ok: validationState.validation.ok && preview,
        command: formatGitCommand(context.rootPath, args),
        cwd: context.rootPath,
        exitCode: validationState.validation.ok ? 0 : 1,
        stdout: '',
        stderr: validationState.validation.ok ? '' : validationState.validation.message,
        durationMs: 0
      };
      return this.buildWorktreeResult('worktree.create', context, args, virtualResult, {
        worktreePath,
        branch,
        startPoint,
        preview: true,
        confirmed: false,
        created: false,
        registryLinked: false,
        sourceWorkspaceId,
        sourceRootPath,
        setupStatus: setupCommand.length > 0 ? 'planned' : 'skipped',
        setupCommand,
        teardownStatus: 'skipped',
        validation: validationState.validation,
        failureCategory: failure.failureCategory,
        message: confirm ? failure.message : 'Worktree create preview is ready. Re-run with confirm=true to create it.',
        remediation: confirm ? failure.remediation : 'Review the preview and confirm the create request.',
        worktrees: listedBefore.worktrees
      });
    }
    if (createParent && !fs.existsSync(path.dirname(worktreePath))) {
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    }
    const result = await executeGitAction(context.rootPath, args);
    const listed = await this.listWorktrees(payload);
    const setupResult = result.ok ? await executeWorktreeLifecycleCommand(path.resolve(worktreePath), setupCommand, 'setup') : {
      ok: false,
      status: 'skipped',
      kind: 'setup',
      command: '',
      cwd: path.resolve(worktreePath),
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
      message: 'Setup was skipped because git worktree add failed.'
    };
    return this.buildWorktreeResult('worktree.create', context, args, result, {
      ok: result.ok && setupResult.ok,
      worktreePath: path.resolve(worktreePath),
      branch,
      startPoint,
      preview: false,
      confirmed: true,
      created: result.ok,
      registryLinked: false,
      sourceWorkspaceId,
      sourceRootPath,
      setupStatus: setupResult.status,
      setupCommand,
      setupResult,
      teardownStatus: 'skipped',
      validation: validationState.validation,
      failureCategory: result.ok && !setupResult.ok ? 'setup_failed' : '',
      message: result.ok && !setupResult.ok ? setupResult.message : '',
      remediation: result.ok && !setupResult.ok ? 'Inspect setupResult.stderr, then rerun the setup command manually or archive the worktree.' : '',
      worktrees: result.ok ? listed.worktrees : [],
    });
  }

  async archiveWorktree(payload) {
    const context = this.resolveGitRoot(payload);
    const worktreePath = readStringValue(payload, 'worktreePath', readStringValue(payload, 'path', '')).trim();
    const validation = emptyWorktreeValidation();
    const confirm = readBooleanValue(payload, 'confirm', false);
    let targetPath = worktreePath;
    if (worktreePath.length === 0) {
      pushWorktreeValidationError(validation, 'path_required', 'Absolute worktreePath is required.', 'Choose a Git-registered worktree path to archive.');
    } else if (!path.isAbsolute(worktreePath)) {
      pushWorktreeValidationError(validation, 'path_not_absolute', 'Worktree path must be absolute.', 'Use the absolute path shown in the worktree list.');
    } else {
      targetPath = path.resolve(worktreePath);
    }
    if (targetPath.length > 0 && path.resolve(targetPath) === path.resolve(context.rootPath)) {
      pushWorktreeValidationError(validation, 'main_worktree', 'Main working tree cannot be archived as an isolated worktree.', 'Choose a linked worktree path instead of the source workspace root.');
    }
    const listed = await this.listWorktrees(payload);
    const teardownCommand = readStringValue(payload, 'teardownCommand', '').trim();
    let known = false;
    for (const item of listed.worktrees) {
      if (path.resolve(item.path) === targetPath && item.gitRegistered === true) {
        known = true;
        break;
      }
    }
    if (!known) {
      pushWorktreeValidationError(validation, 'not_git_registered', 'Worktree is not registered in this repository.', 'Only Git-registered worktrees can be archived by Bridge.');
    }
    const args = ['worktree', 'remove'];
    if (readBooleanValue(payload, 'force', false)) {
      args.push('--force');
    }
    args.push(targetPath);
    if (!confirm || !validation.ok) {
      const failure = worktreeFailureFromValidation(validation, confirm ? 'validation_failed' : 'confirm_required');
      const virtualResult = {
        ok: validation.ok && !confirm,
        command: formatGitCommand(context.rootPath, args),
        cwd: context.rootPath,
        exitCode: validation.ok ? 0 : 1,
        stdout: '',
        stderr: validation.ok ? '' : validation.message,
        durationMs: 0
      };
      return this.buildWorktreeResult('worktree.archive', context, args, virtualResult, {
        worktreePath: targetPath,
        branch: '',
        startPoint: '',
        preview: true,
        confirmed: false,
        archived: false,
        registryLinked: findWorkspaceForPath(this.workspaceRegistry, targetPath) !== null,
        sourceWorkspaceId: '',
        sourceRootPath: context.rootPath,
        setupStatus: 'skipped',
        teardownStatus: teardownCommand.length > 0 ? 'planned' : 'skipped',
        teardownCommand,
        validation,
        failureCategory: failure.failureCategory,
        message: confirm ? failure.message : 'Worktree archive preview is ready. Re-run with confirm=true to archive it.',
        remediation: confirm ? failure.remediation : 'Review the preview and confirm the archive request.',
        worktrees: listed.worktrees
      });
    }
    const teardownResult = await executeWorktreeLifecycleCommand(targetPath, teardownCommand, 'teardown');
    if (!teardownResult.ok) {
      const virtualResult = {
        ok: false,
        command: formatGitCommand(context.rootPath, args),
        cwd: context.rootPath,
        exitCode: teardownResult.exitCode,
        stdout: teardownResult.stdout,
        stderr: teardownResult.stderr,
        durationMs: teardownResult.durationMs
      };
      return this.buildWorktreeResult('worktree.archive', context, args, virtualResult, {
        worktreePath: targetPath,
        branch: '',
        startPoint: '',
        preview: false,
        confirmed: true,
        archived: false,
        registryLinked: findWorkspaceForPath(this.workspaceRegistry, targetPath) !== null,
        sourceWorkspaceId: '',
        sourceRootPath: context.rootPath,
        setupStatus: 'skipped',
        teardownStatus: teardownResult.status,
        teardownCommand,
        teardownResult,
        validation,
        failureCategory: 'teardown_failed',
        message: teardownResult.message,
        remediation: 'Inspect teardownResult.stderr and retry archive after teardown succeeds.',
        worktrees: listed.worktrees
      });
    }
    const result = await executeGitAction(context.rootPath, args);
    const nextList = await this.listWorktrees(payload);
    return this.buildWorktreeResult('worktree.archive', context, args, result, {
      worktreePath: targetPath,
      branch: '',
      startPoint: '',
      preview: false,
      confirmed: true,
      archived: result.ok,
      registryLinked: findWorkspaceForPath(this.workspaceRegistry, targetPath) !== null,
      sourceWorkspaceId: '',
      sourceRootPath: context.rootPath,
      setupStatus: 'skipped',
      teardownStatus: result.ok ? teardownResult.status : 'failed',
      teardownCommand,
      teardownResult,
      validation,
      worktrees: result.ok ? nextList.worktrees : listed.worktrees,
    });
  }

  async getRecentCommitsForRoot(rootPath, sessionId, providerId, workspaceId) {
    const result = await executeGit(rootPath, ['log', '-n', '20', '--pretty=format:%H%x1f%an%x1f%at%x1f%s']).catch(() => ({ stdout: '' }));
    const lines = result.stdout.split(/\r?\n/);
    const commits = [];
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const parts = line.split('\x1f');
      commits.push({
        id: sessionId + ':' + (parts[0] || ''),
        sessionId,
        workspaceId,
        providerId,
        hash: parts[0] || '',
        author: parts[1] || '',
        committedAt: parts.length > 2 ? Number.parseInt(parts[2], 10) * 1000 : 0,
        message: parts.length > 3 ? parts[3] : '',
        updatedAt: Date.now()
      });
    }
    return commits;
  }
}

module.exports = {
  WorkspaceService,
  normalizeRelativePath,
  resolveInside
};
