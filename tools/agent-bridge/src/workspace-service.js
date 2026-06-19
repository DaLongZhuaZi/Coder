'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

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

function readPathArray(source) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  if (Array.isArray(source.paths)) {
    return source.paths.filter((item) => typeof item === 'string' && item.length > 0);
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
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : ''
      });
    });
  });
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

class WorkspaceService {
  constructor(registry) {
    this.registry = registry;
    this.downloadTokens = new Map();
  }

  resolveSession(sessionId) {
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

  async getChanges(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveSession(sessionId);
    const statusResult = await executeGit(context.rootPath, ['status', '--porcelain=v1', '-z']);
    const entries = parsePorcelainZ(statusResult.stdout);
    const branchResult = await executeGit(context.rootPath, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: '' }));
    const unstagedNumstat = parseNumstat((await executeGit(context.rootPath, ['diff', '--numstat']).catch(() => ({ stdout: '' }))).stdout);
    const stagedNumstat = parseNumstat((await executeGit(context.rootPath, ['diff', '--cached', '--numstat']).catch(() => ({ stdout: '' }))).stdout);
    const changes = [];
    for (const entry of entries) {
      const numstat = entry.staged && stagedNumstat.has(entry.path) ? stagedNumstat.get(entry.path) : unstagedNumstat.get(entry.path);
      let additions = numstat ? numstat.additions : 0;
      let deletions = numstat ? numstat.deletions : 0;
      let kind = workspaceChangeKindForPath(context.rootPath, entry.path);
      let changedFileCount = kind === 'directory' ? 0 : 1;
      if (entry.status === 'untracked') {
        const untrackedFiles = await listUntrackedFilesForPath(context.rootPath, entry.path);
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
        providerId: context.provider.id,
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
    return {
      sessionId,
      providerId: context.provider.id,
      workspacePath: context.rootPath,
      branchName: branchResult.stdout.trim(),
      changes,
      commits: await this.getRecentCommitsForRoot(context.rootPath, sessionId, context.provider.id, readStringValue(payload, 'workspaceId', ''))
    };
  }

  async getDiff(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const filePath = normalizeRelativePath(readStringValue(payload, 'path', ''));
    const staged = readBooleanValue(payload, 'staged', false);
    const context = this.resolveSession(sessionId);
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
    return {
      sessionId,
      path: filePath,
      kind,
      changedFileCount,
      staged,
      additions,
      deletions,
      diffText,
      updatedAt: Date.now()
    };
  }

  async listFiles(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const parentPath = normalizeRelativePath(readStringValue(payload, 'parentPath', readStringValue(payload, 'path', '')));
    const context = this.resolveSession(sessionId);
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
      providerId: context.provider.id,
      workspacePath: context.rootPath,
      parentPath,
      files
    };
  }

  async getFile(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const filePath = normalizeRelativePath(readStringValue(payload, 'path', ''));
    const context = this.resolveSession(sessionId);
    const resolved = resolveInside(context.rootPath, filePath);
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
    const filePath = normalizeRelativePath(readStringValue(payload, 'path', ''));
    const context = this.resolveSession(sessionId);
    const resolved = resolveInside(context.rootPath, filePath);
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
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveSession(sessionId);
    const paths = pathsForGit(readPathArray(payload));
    if (paths.length === 0) {
      throw new Error('At least one path is required.');
    }
    await executeGit(context.rootPath, ['add', '--'].concat(paths));
    return await this.getChanges(payload);
  }

  async unstage(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveSession(sessionId);
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
    const sessionId = readStringValue(payload, 'sessionId', '');
    const context = this.resolveSession(sessionId);
    const paths = pathsForGit(readPathArray(payload));
    if (paths.length === 0) {
      throw new Error('At least one path is required.');
    }
    await executeGit(context.rootPath, ['restore', '--staged', '--worktree', '--'].concat(paths)).catch(() => null);
    await executeGit(context.rootPath, ['clean', '-fd', '--'].concat(paths)).catch(() => null);
    return await this.getChanges(payload);
  }

  async commit(payload) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const message = readStringValue(payload, 'message', '').trim();
    if (message.length === 0) {
      throw new Error('Commit message is required.');
    }
    const context = this.resolveSession(sessionId);
    const result = await executeGit(context.rootPath, ['commit', '-m', message]);
    const changes = await this.getChanges(payload);
    return {
      sessionId,
      output: result.stdout,
      changes: changes.changes,
      branchName: changes.branchName,
      commits: await this.getRecentCommitsForRoot(context.rootPath, sessionId, context.provider.id, readStringValue(payload, 'workspaceId', ''))
    };
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
