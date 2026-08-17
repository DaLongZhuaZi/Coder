'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { randomId, writeJsonFileAtomic } = require('./daemon-store');

const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 400;
const EXCLUDED_PATH_PARTS = [
  '.git',
  'node_modules',
  'oh_modules',
  'build',
  'dist',
  '.cxx',
  '.hvigor',
  '.preview',
  '.test',
  '.appanalyzer'
];

function defaultFilePolicy() {
  return {
    scope: 'git_workspace_text_files',
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    maxFiles: MAX_FILES,
    excludedPathParts: EXCLUDED_PATH_PARTS.slice()
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeRoot(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    return '';
  }
  return path.resolve(cwd);
}

function isInside(rootPath, filePath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(filePath);
  return target === root || target.startsWith(root + path.sep);
}

function normalizeRelativePath(value) {
  const text = typeof value === 'string' ? value.replace(/\\/g, '/') : '';
  if (text.length === 0 || text === '.' || text.indexOf('\0') >= 0) {
    return '';
  }
  const normalized = path.normalize(text).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.indexOf('/../') >= 0) {
    return '';
  }
  return normalized === '.' ? '' : normalized;
}

function shouldSkipPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.length === 0) {
    return true;
  }
  const parts = normalized.split('/');
  for (const part of parts) {
    if (EXCLUDED_PATH_PARTS.includes(part)) {
      return true;
    }
  }
  return false;
}

function skipReasonForPolicy(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.length === 0) {
    return 'invalid_path';
  }
  if (shouldSkipPath(normalized)) {
    return 'excluded_path';
  }
  return '';
}

function addSkipped(skipped, skippedCounts, relativePath, reason) {
  const normalized = normalizeRelativePath(relativePath);
  const entry = {
    path: normalized.length > 0 ? normalized : (typeof relativePath === 'string' ? relativePath : ''),
    reason: typeof reason === 'string' && reason.length > 0 ? reason : 'skipped'
  };
  skipped.push(entry);
  skippedCounts[entry.reason] = (skippedCounts[entry.reason] || 0) + 1;
}

function skippedReasonsFromCounts(skippedCounts) {
  const reasons = [];
  for (const reason of Object.keys(skippedCounts).sort()) {
    reasons.push({
      reason,
      count: skippedCounts[reason]
    });
  }
  return reasons;
}

function skippedReasonsFromSnapshot(snapshot) {
  if (snapshot && Array.isArray(snapshot.skippedReasons)) {
    return snapshot.skippedReasons.filter((item) => item && typeof item.reason === 'string' && typeof item.count === 'number');
  }
  const counts = {};
  const skipped = snapshot && Array.isArray(snapshot.skipped) ? snapshot.skipped : [];
  for (const item of skipped) {
    if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.reason === 'string') {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
    } else if (typeof item === 'string') {
      counts.skipped = (counts.skipped || 0) + 1;
    }
  }
  return skippedReasonsFromCounts(counts);
}

function skippedPreviewFromSnapshot(snapshot) {
  const skipped = snapshot && Array.isArray(snapshot.skipped) ? snapshot.skipped : [];
  const preview = [];
  for (const item of skipped.slice(0, 200)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      preview.push({
        path: typeof item.path === 'string' ? item.path : '',
        reason: typeof item.reason === 'string' ? item.reason : 'skipped'
      });
    } else if (typeof item === 'string') {
      preview.push({
        path: item,
        reason: 'skipped'
      });
    }
  }
  return preview;
}

function isTextBuffer(buffer) {
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) {
      return false;
    }
  }
  return true;
}

function listGitFiles(rootPath) {
  try {
    const output = execFileSync('git', ['-C', rootPath, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: rootPath,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
    return output.split('\0').map(normalizeRelativePath).filter((item) => item.length > 0);
  } catch (_error) {
    return [];
  }
}

function manifestEntryForFile(item) {
  return {
    path: typeof item.path === 'string' ? item.path : '',
    sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0,
    sha256: typeof item.sha256 === 'string' ? item.sha256 : '',
    mode: typeof item.mode === 'number' && Number.isFinite(item.mode) ? item.mode : 0
  };
}

function manifestHashForFiles(files) {
  const entries = [];
  if (Array.isArray(files)) {
    for (const item of files) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        entries.push(manifestEntryForFile(item));
      }
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return sha256Text(JSON.stringify(entries));
}

function verifySnapshotManifest(snapshot) {
  const files = snapshot && Array.isArray(snapshot.files) ? snapshot.files : [];
  const verifyErrors = [];
  let validFiles = 0;
  for (const item of files) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      verifyErrors.push({
        path: '',
        reason: 'invalid_file_record'
      });
      continue;
    }
    const relativePath = normalizeRelativePath(item.path);
    if (relativePath.length === 0 || shouldSkipPath(relativePath)) {
      verifyErrors.push({
        path: typeof item.path === 'string' ? item.path : '',
        reason: 'invalid_path'
      });
      continue;
    }
    const contentBase64 = typeof item.contentBase64 === 'string' ? item.contentBase64 : '';
    const buffer = Buffer.from(contentBase64, 'base64');
    const expectedSize = typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? item.sizeBytes : -1;
    const expectedHash = typeof item.sha256 === 'string' ? item.sha256 : '';
    if (expectedSize !== buffer.length) {
      verifyErrors.push({
        path: relativePath,
        reason: 'size_mismatch'
      });
      continue;
    }
    const actualHash = sha256(buffer);
    if (expectedHash.length === 0 || actualHash !== expectedHash) {
      verifyErrors.push({
        path: relativePath,
        reason: 'content_hash_mismatch',
        currentSha256: actualHash,
        checkpointSha256: expectedHash
      });
      continue;
    }
    validFiles += 1;
  }
  const expectedManifestHash = snapshot && typeof snapshot.manifestSha256 === 'string' ? snapshot.manifestSha256 : '';
  const actualManifestHash = manifestHashForFiles(files);
  if (expectedManifestHash.length > 0 && expectedManifestHash !== actualManifestHash) {
    verifyErrors.push({
      path: '',
      reason: 'manifest_hash_mismatch',
      currentSha256: actualManifestHash,
      checkpointSha256: expectedManifestHash
    });
  }
  return {
    manifestVerified: verifyErrors.length === 0,
    filesVerified: validFiles,
    verifyErrors
  };
}

class FileCheckpointStore {
  constructor(store) {
    this.store = store;
  }

  isAvailable() {
    return !!this.store && typeof this.store.fileCheckpointPath === 'function';
  }

  capture(record, payload) {
    if (!this.isAvailable()) {
      return this.emptyCapture('unavailable');
    }
    const rootPath = normalizeRoot(record && typeof record.cwd === 'string' ? record.cwd : '');
    if (rootPath.length === 0 || !fs.existsSync(path.join(rootPath, '.git'))) {
      return this.emptyCapture('not_git_workspace');
    }
    const snapshotId = randomId('fchk');
    const files = [];
    const skipped = [];
    const skippedCounts = {};
    let scanned = 0;
    let totalBytes = 0;
    const candidates = listGitFiles(rootPath);
    for (const relativePath of candidates) {
      scanned += 1;
      if (files.length >= MAX_FILES) {
        addSkipped(skipped, skippedCounts, relativePath, 'max_files_exceeded');
        continue;
      }
      const policyReason = skipReasonForPolicy(relativePath);
      if (policyReason.length > 0) {
        addSkipped(skipped, skippedCounts, relativePath, policyReason);
        continue;
      }
      const absolutePath = path.resolve(rootPath, relativePath);
      if (!isInside(rootPath, absolutePath)) {
        addSkipped(skipped, skippedCounts, relativePath, 'outside_workspace');
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(absolutePath);
      } catch (_error) {
        addSkipped(skipped, skippedCounts, relativePath, 'stat_failed');
        continue;
      }
      if (!stat.isFile()) {
        addSkipped(skipped, skippedCounts, relativePath, 'not_file');
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        addSkipped(skipped, skippedCounts, relativePath, 'file_too_large');
        continue;
      }
      if (totalBytes + stat.size > MAX_TOTAL_BYTES) {
        addSkipped(skipped, skippedCounts, relativePath, 'total_bytes_exceeded');
        continue;
      }
      const buffer = fs.readFileSync(absolutePath);
      if (!isTextBuffer(buffer)) {
        addSkipped(skipped, skippedCounts, relativePath, 'binary_file');
        continue;
      }
      totalBytes += buffer.length;
      files.push({
        path: relativePath,
        sizeBytes: buffer.length,
        sha256: sha256(buffer),
        mode: stat.mode,
        contentBase64: buffer.toString('base64')
      });
    }
    const snapshot = {
      manifestVersion: 1,
      snapshotId,
      agentId: record.id,
      checkpointId: '',
      workspaceId: record.workspaceId,
      cwd: rootPath,
      workspaceRoot: rootPath,
      createdAt: new Date().toISOString(),
      filePolicy: defaultFilePolicy(),
      conversationCursor: {
        epoch: record && typeof record.currentEpoch === 'number' ? record.currentEpoch : 0,
        latestSeq: record && typeof record.nextSeq === 'number' ? record.nextSeq - 1 : 0
      },
      runtimeSummary: {
        runtimeMode: record && record.runtimeInfo && typeof record.runtimeInfo.runtimeMode === 'string' ? record.runtimeInfo.runtimeMode : '',
        providerSessionId: record && typeof record.providerSessionId === 'string' ? record.providerSessionId : '',
        remoteSessionId: record && typeof record.remoteSessionId === 'string' ? record.remoteSessionId : ''
      },
      filesScanned: scanned,
      filesCaptured: files.length,
      totalBytes,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 200),
      skippedReasons: skippedReasonsFromCounts(skippedCounts),
      manifestSha256: manifestHashForFiles(files),
      files
    };
    writeJsonFileAtomic(this.store.fileCheckpointPath(snapshotId), snapshot);
    return {
      fileSnapshotStatus: files.length > 0 ? 'captured' : 'empty',
      fileSnapshotId: snapshotId,
      filesScanned: scanned,
      filesCaptured: files.length,
      skippedCount: skipped.length,
      workspaceRoot: rootPath,
      filePolicy: defaultFilePolicy(),
      skippedReasons: skippedReasonsFromCounts(skippedCounts),
      manifestVerified: true
    };
  }

  emptyCapture(status) {
    return {
      fileSnapshotStatus: status,
      fileSnapshotId: '',
      filesScanned: 0,
      filesCaptured: 0,
      skippedCount: 0,
      workspaceRoot: '',
      filePolicy: defaultFilePolicy(),
      skippedReasons: [],
      manifestVerified: false
    };
  }

  load(snapshotId) {
    if (!this.isAvailable() || typeof snapshotId !== 'string' || snapshotId.length === 0) {
      return null;
    }
    const filePath = this.store.fileCheckpointPath(snapshotId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  restorePlanPath(restorePlanId) {
    return this.store.fileCheckpointPath(restorePlanId);
  }

  createRestorePlan(snapshotId, snapshot, dryRunResult) {
    if (!this.isAvailable()) {
      return '';
    }
    const restorePlanId = randomId('frp');
    const plan = {
      planVersion: 1,
      restorePlanId,
      sourceSnapshotId: snapshotId,
      workspaceRoot: normalizeRoot(snapshot && typeof snapshot.cwd === 'string' ? snapshot.cwd : ''),
      createdAt: new Date().toISOString(),
      manifestSha256: snapshot && typeof snapshot.manifestSha256 === 'string' ? snapshot.manifestSha256 : '',
      conflicts: dryRunResult && Array.isArray(dryRunResult.conflicts) ? dryRunResult.conflicts : [],
      manifestVerified: dryRunResult && dryRunResult.manifestVerified === true,
      filesCaptured: dryRunResult && typeof dryRunResult.filesCaptured === 'number' ? dryRunResult.filesCaptured : 0
    };
    writeJsonFileAtomic(this.restorePlanPath(restorePlanId), plan);
    return restorePlanId;
  }

  loadRestorePlan(restorePlanId) {
    if (!this.isAvailable() || typeof restorePlanId !== 'string' || restorePlanId.length === 0) {
      return null;
    }
    const filePath = this.restorePlanPath(restorePlanId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  inspect(snapshotId) {
    const snapshot = this.load(snapshotId);
    if (!snapshot) {
      return null;
    }
    const manifest = verifySnapshotManifest(snapshot);
    const rootPath = normalizeRoot(snapshot.cwd);
    return {
      snapshotId: typeof snapshot.snapshotId === 'string' ? snapshot.snapshotId : snapshotId,
      workspaceRoot: typeof snapshot.workspaceRoot === 'string' && snapshot.workspaceRoot.length > 0 ? snapshot.workspaceRoot : rootPath,
      filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
      filesScanned: typeof snapshot.filesScanned === 'number' && Number.isFinite(snapshot.filesScanned) ? snapshot.filesScanned : 0,
      filesCaptured: typeof snapshot.filesCaptured === 'number' && Number.isFinite(snapshot.filesCaptured) ? snapshot.filesCaptured : 0,
      filesSkipped: typeof snapshot.skippedCount === 'number' && Number.isFinite(snapshot.skippedCount) ? snapshot.skippedCount : 0,
      skippedCount: typeof snapshot.skippedCount === 'number' && Number.isFinite(snapshot.skippedCount) ? snapshot.skippedCount : 0,
      skipped: skippedPreviewFromSnapshot(snapshot),
      skippedReasons: skippedReasonsFromSnapshot(snapshot),
      manifestVerified: manifest.manifestVerified,
      filesVerified: manifest.filesVerified,
      verifyErrors: manifest.verifyErrors,
      runtimeRestored: false,
      runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound'
    };
  }

  restore(snapshotId, options) {
    const snapshot = this.load(snapshotId);
    if (!snapshot) {
      return {
        status: 'not_found',
        files: false,
        conflicts: [],
        filesRestored: 0,
        filesSkipped: 0,
        filesVerified: 0,
        manifestVerified: false,
        verifyErrors: [],
        restorePlanId: '',
        preRestoreSnapshotId: '',
        workspaceRoot: '',
        filePolicy: defaultFilePolicy(),
        skippedReasons: [],
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: 'File checkpoint snapshot not found.'
      };
    }
    const rootPath = normalizeRoot(snapshot.cwd);
    if (rootPath.length === 0 || !fs.existsSync(rootPath)) {
      return {
        status: 'workspace_missing',
        files: false,
        conflicts: [],
        filesRestored: 0,
        filesSkipped: 0,
        filesVerified: 0,
        manifestVerified: false,
        verifyErrors: [],
        restorePlanId: '',
        preRestoreSnapshotId: '',
        workspaceRoot: rootPath,
        filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
        skippedReasons: skippedReasonsFromSnapshot(snapshot),
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: 'Checkpoint workspace is missing.'
      };
    }
    const dryRun = !!(options && options.dryRun === true);
    const confirm = !!(options && options.confirm === true);
    const forceConflicts = !!(options && options.forceConflicts === true);
    const restorePlanId = options && typeof options.restorePlanId === 'string' ? options.restorePlanId : '';
    const conflicts = [];
    const files = Array.isArray(snapshot.files) ? snapshot.files : [];
    const manifest = verifySnapshotManifest(snapshot);
    const baseSkippedCount = typeof snapshot.skippedCount === 'number' && Number.isFinite(snapshot.skippedCount) ? snapshot.skippedCount : 0;
    const filesSkipped = baseSkippedCount + manifest.verifyErrors.length;
    for (const item of files) {
      if (!item || typeof item.path !== 'string' || shouldSkipPath(item.path)) {
        continue;
      }
      const targetPath = path.resolve(rootPath, item.path);
      if (!isInside(rootPath, targetPath)) {
        conflicts.push({
          path: item.path,
          reason: 'path_escapes_workspace'
        });
        continue;
      }
      if (!fs.existsSync(targetPath)) {
        conflicts.push({
          path: item.path,
          reason: 'missing'
        });
        continue;
      }
      const current = fs.readFileSync(targetPath);
      const currentHash = sha256(current);
      if (currentHash !== item.sha256) {
        conflicts.push({
          path: item.path,
          reason: 'modified',
          currentSha256: currentHash,
          checkpointSha256: item.sha256
        });
      }
    }
    if (dryRun || !confirm) {
      const result = {
        status: dryRun ? 'dry_run' : 'confirm_required',
        files: false,
        conflicts,
        restoreBlocked: false,
        filesRestored: 0,
        filesCaptured: files.length,
        filesSkipped,
        filesVerified: manifest.filesVerified,
        manifestVerified: manifest.manifestVerified,
        verifyErrors: manifest.verifyErrors,
        restorePlanId: '',
        preRestoreSnapshotId: '',
        workspaceRoot: rootPath,
        filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
        skippedReasons: skippedReasonsFromSnapshot(snapshot),
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: dryRun ? '' : 'File restore requires confirm=true.'
      };
      if (dryRun) {
        result.restorePlanId = this.createRestorePlan(snapshotId, snapshot, result);
      }
      return result;
    }
    const restorePlan = this.loadRestorePlan(restorePlanId);
    if (!restorePlan || restorePlan.sourceSnapshotId !== snapshotId) {
      return {
        status: 'blocked_restore_plan_required',
        files: false,
        conflicts,
        restoreBlocked: true,
        filesRestored: 0,
        filesCaptured: files.length,
        filesSkipped,
        filesVerified: manifest.filesVerified,
        manifestVerified: manifest.manifestVerified,
        verifyErrors: manifest.verifyErrors,
        restorePlanId,
        preRestoreSnapshotId: '',
        workspaceRoot: rootPath,
        filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
        skippedReasons: skippedReasonsFromSnapshot(snapshot),
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: 'File restore requires a restorePlanId from a prior dry-run.'
      };
    }
    if (!manifest.manifestVerified) {
      return {
        status: 'blocked_manifest',
        files: false,
        conflicts,
        restoreBlocked: true,
        filesRestored: 0,
        filesCaptured: files.length,
        filesSkipped,
        filesVerified: manifest.filesVerified,
        manifestVerified: false,
        verifyErrors: manifest.verifyErrors,
        restorePlanId,
        preRestoreSnapshotId: '',
        workspaceRoot: rootPath,
        filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
        skippedReasons: skippedReasonsFromSnapshot(snapshot),
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: 'File restore snapshot manifest failed verification.'
      };
    }
    if (conflicts.length > 0 && !forceConflicts) {
      return {
        status: 'blocked_conflicts',
        files: false,
        conflicts,
        restoreBlocked: true,
        filesRestored: 0,
        filesCaptured: files.length,
        filesSkipped,
        filesVerified: manifest.filesVerified,
        manifestVerified: manifest.manifestVerified,
        verifyErrors: manifest.verifyErrors,
        restorePlanId,
        preRestoreSnapshotId: '',
        workspaceRoot: rootPath,
        filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
        skippedReasons: skippedReasonsFromSnapshot(snapshot),
        runtimeRestored: false,
        runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
        message: 'File restore has conflicts. Re-run with forceConflicts=true to overwrite.'
      };
    }
    const preRestore = this.capture({
      id: snapshot.agentId,
      workspaceId: snapshot.workspaceId,
      cwd: rootPath
    }, {
      reason: 'pre_restore',
      restoreSnapshotId: snapshotId
    });
    let restored = 0;
    let verifiedAfterWrite = 0;
    const verifyErrors = manifest.verifyErrors.slice();
    for (const item of files) {
      if (!item || typeof item.path !== 'string' || shouldSkipPath(item.path)) {
        continue;
      }
      const targetPath = path.resolve(rootPath, item.path);
      if (!isInside(rootPath, targetPath)) {
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(item.contentBase64 || '', 'base64'));
      restored += 1;
      const restoredHash = sha256(fs.readFileSync(targetPath));
      if (restoredHash === item.sha256) {
        verifiedAfterWrite += 1;
      } else {
        verifyErrors.push({
          path: item.path,
          reason: 'restore_hash_mismatch',
          currentSha256: restoredHash,
          checkpointSha256: item.sha256
        });
      }
    }
    return {
      status: verifyErrors.length === 0 ? 'restored' : 'restored_with_verify_errors',
      files: restored > 0,
      conflicts,
      restoreBlocked: false,
      filesRestored: restored,
      filesCaptured: files.length,
      filesSkipped,
      filesVerified: verifiedAfterWrite,
      manifestVerified: manifest.manifestVerified,
      verifyErrors,
      restorePlanId,
      preRestoreSnapshotId: preRestore.fileSnapshotId || '',
      workspaceRoot: rootPath,
      filePolicy: snapshot && snapshot.filePolicy && typeof snapshot.filePolicy === 'object' && !Array.isArray(snapshot.filePolicy) ? snapshot.filePolicy : defaultFilePolicy(),
      skippedReasons: skippedReasonsFromSnapshot(snapshot),
      runtimeRestored: false,
      runtimeRestoreReason: 'provider_runtime_state_is_recorded_not_rewound',
      message: ''
    };
  }
}

module.exports = {
  FileCheckpointStore
};
