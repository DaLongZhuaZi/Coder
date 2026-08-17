'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomId } = require('./daemon-store');
const {
  FileTransferOpcode,
  encodeFileBeginFrame,
  encodeFileChunkFrame,
  encodeFileEndFrame,
  encodeFileCancelFrame
} = require('./binary-frames');
const { readString, readNumber } = require('./protocol');
const { normalizeRelativePath, resolveInside } = require('./workspace-service');

const DOWNLOAD_CHUNK_BYTES = 64 * 1024;
const PROGRESS_INTERVAL_MS = 250;

function nowIso() {
  return new Date().toISOString();
}

function normalizeCwd(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return path.resolve(value);
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
  return 'application/octet-stream';
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function safeRequestId(value) {
  if (typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 255) {
    return value;
  }
  return randomId('xfer');
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readMetadataString(metadata, key, fallbackValue) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return fallbackValue;
  }
  const value = metadata[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readMetadataNumber(metadata, key, fallbackValue) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return fallbackValue;
  }
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

class FileTransferManager {
  constructor(options) {
    this.registry = options.registry;
    this.workspaceRegistry = options.workspaceRegistry;
    this.agentManager = options.agentManager;
    this.broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
    this.downloads = new Map();
    this.uploads = new Map();
  }

  isAvailable() {
    return true;
  }

  async download(connection, payload) {
    const requestId = safeRequestId(readString(payload, 'requestId', ''));
    const resolved = this.resolveWorkspaceFile(payload, false);
    const stat = fs.statSync(resolved.absolutePath);
    if (!stat.isFile()) {
      throw new Error('Requested path is not a file.');
    }
    const metadata = {
      requestId,
      direction: 'download',
      workspaceId: resolved.workspaceId,
      path: resolved.relativePath,
      fileName: path.basename(resolved.relativePath),
      mediaType: mediaTypeForPath(resolved.relativePath),
      size: stat.size,
      sizeBytes: stat.size,
      sha256: await hashFileSha256(resolved.absolutePath),
      modifiedAt: stat.mtimeMs,
      createdAt: nowIso()
    };
    const state = {
      requestId,
      connection,
      canceled: false,
      bytesSent: 0,
      sizeBytes: stat.size,
      lastProgressAt: 0
    };
    this.downloads.set(requestId, state);
    setImmediate(() => {
      this.streamDownload(state, resolved.absolutePath, metadata);
    });
    return {
      available: true,
      accepted: true,
      requestId,
      metadata
    };
  }

  upload(connection, payload) {
    const requestId = safeRequestId(readString(payload, 'requestId', ''));
    const resolved = this.resolveWorkspaceFile(payload, true);
    const overwrite = readBoolean(payload, 'overwrite', true);
    const expectedSize = readNumber(payload, 'sizeBytes', readNumber(payload, 'size', -1));
    const expectedSha256 = readString(payload, 'sha256', '');
    if (!overwrite && fs.existsSync(resolved.absolutePath)) {
      throw new Error('Target file already exists.');
    }
    const tempPath = resolved.absolutePath + '.ngf-upload-' + process.pid + '-' + Date.now() + '.tmp';
    const state = {
      requestId,
      connection,
      workspaceId: resolved.workspaceId,
      relativePath: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      tempPath,
      expectedSize,
      expectedSha256,
      receivedBytes: 0,
      hash: crypto.createHash('sha256'),
      stream: null,
      started: false,
      canceled: false,
      lastProgressAt: 0,
      createdAt: Date.now()
    };
    this.uploads.set(requestId, state);
    return {
      available: true,
      accepted: true,
      requestId,
      ready: true,
      path: resolved.relativePath,
      workspaceId: resolved.workspaceId
    };
  }

  cancel(payload) {
    const requestId = readString(payload, 'requestId', '');
    if (requestId.length === 0) {
      return {
        canceled: false,
        code: 'file_transfer_request_missing',
        message: 'File transfer requestId is required.'
      };
    }
    const upload = this.uploads.get(requestId);
    if (upload) {
      this.cancelUpload(upload, 'Canceled.');
      return { canceled: true, requestId };
    }
    const download = this.downloads.get(requestId);
    if (download) {
      download.canceled = true;
      this.emitFailed(download, 'download_canceled', 'Canceled.');
      return { canceled: true, requestId };
    }
    return {
      canceled: false,
      requestId
    };
  }

  handleBinaryFrame(connection, frame) {
    if (!frame || typeof frame.requestId !== 'string') {
      return false;
    }
    const state = this.uploads.get(frame.requestId);
    if (!state || state.connection !== connection) {
      return false;
    }
    if (frame.opcode === FileTransferOpcode.BEGIN) {
      return this.beginUpload(state, frame.metadata);
    }
    if (frame.opcode === FileTransferOpcode.CHUNK) {
      return this.writeUploadChunk(state, frame.payload);
    }
    if (frame.opcode === FileTransferOpcode.END) {
      this.finishUpload(state);
      return true;
    }
    if (frame.opcode === FileTransferOpcode.CANCEL) {
      this.cancelUpload(state, frame.payload ? frame.payload.toString('utf8') : 'Canceled.');
      return true;
    }
    return false;
  }

  detachConnection(connection) {
    const uploadIds = [];
    for (const upload of this.uploads.values()) {
      if (upload.connection === connection) {
        uploadIds.push(upload.requestId);
      }
    }
    for (const requestId of uploadIds) {
      const upload = this.uploads.get(requestId);
      if (upload) {
        this.cancelUpload(upload, 'Connection closed.');
      }
    }
    for (const download of this.downloads.values()) {
      if (download.connection === connection) {
        download.canceled = true;
      }
    }
  }

  async streamDownload(state, absolutePath, metadata) {
    try {
      state.connection.sendBinary(encodeFileBeginFrame(state.requestId, metadata));
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(absolutePath, { highWaterMark: DOWNLOAD_CHUNK_BYTES });
        stream.on('data', (chunk) => {
          if (state.canceled) {
            stream.destroy(new Error('Download canceled.'));
            return;
          }
          state.bytesSent += chunk.length;
          state.connection.sendBinary(encodeFileChunkFrame(state.requestId, chunk));
          this.emitProgress(state, 'download', state.bytesSent, state.sizeBytes, state.lastProgressAt);
          state.lastProgressAt = Date.now();
        });
        stream.on('error', reject);
        stream.on('end', resolve);
      });
      if (state.canceled) {
        this.emitFailed(state, 'download_canceled', 'Canceled.');
        return;
      }
      state.connection.sendBinary(encodeFileEndFrame(state.requestId));
      this.emitCompleted(state, 'download', metadata);
    } catch (error) {
      try {
        state.connection.sendBinary(encodeFileCancelFrame(state.requestId, error instanceof Error ? error.message : String(error)));
      } catch (_ignored) {
        // The socket may already be gone.
      }
      this.emitFailed(state, 'download_failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.downloads.delete(state.requestId);
    }
  }

  beginUpload(state, metadata) {
    if (state.started) {
      return true;
    }
    const metadataPath = readMetadataString(metadata, 'path', '');
    if (metadataPath.length > 0 && normalizeRelativePath(metadataPath) !== state.relativePath) {
      this.cancelUpload(state, 'Upload path does not match the prepared request.');
      return false;
    }
    const metadataSize = readMetadataNumber(metadata, 'sizeBytes', readMetadataNumber(metadata, 'size', -1));
    const metadataSha256 = readMetadataString(metadata, 'sha256', '');
    if (state.expectedSize < 0 && metadataSize >= 0) {
      state.expectedSize = metadataSize;
    }
    if (state.expectedSha256.length === 0 && metadataSha256.length > 0) {
      state.expectedSha256 = metadataSha256;
    }
    ensureParentDirectory(state.tempPath);
    state.stream = fs.createWriteStream(state.tempPath);
    state.stream.on('error', (error) => {
      this.cancelUpload(state, error instanceof Error ? error.message : String(error));
    });
    state.started = true;
    this.emitProgress(state, 'upload', 0, state.expectedSize, 0);
    return true;
  }

  writeUploadChunk(state, payload) {
    if (!state.started && !this.beginUpload(state, null)) {
      return false;
    }
    if (!payload || payload.length === 0) {
      return true;
    }
    state.receivedBytes += payload.length;
    state.hash.update(payload);
    state.stream.write(payload);
    this.emitProgress(state, 'upload', state.receivedBytes, state.expectedSize, state.lastProgressAt);
    state.lastProgressAt = Date.now();
    return true;
  }

  finishUpload(state) {
    if (!state.started && !this.beginUpload(state, null)) {
      return;
    }
    const stream = state.stream;
    stream.end(() => {
      if (state.canceled) {
        return;
      }
      const actualSha256 = state.hash.digest('hex');
      if (state.expectedSize >= 0 && state.expectedSize !== state.receivedBytes) {
        this.cancelUpload(state, 'Upload size mismatch.');
        return;
      }
      if (state.expectedSha256.length > 0 && state.expectedSha256 !== actualSha256) {
        this.cancelUpload(state, 'Upload sha256 mismatch.');
        return;
      }
      ensureParentDirectory(state.absolutePath);
      fs.renameSync(state.tempPath, state.absolutePath);
      this.uploads.delete(state.requestId);
      this.emitCompleted(state, 'upload', {
        requestId: state.requestId,
        direction: 'upload',
        workspaceId: state.workspaceId,
        path: state.relativePath,
        fileName: path.basename(state.relativePath),
        mediaType: mediaTypeForPath(state.relativePath),
        size: state.receivedBytes,
        sizeBytes: state.receivedBytes,
        sha256: actualSha256,
        modifiedAt: fs.statSync(state.absolutePath).mtimeMs,
        completedAt: nowIso()
      });
    });
  }

  cancelUpload(state, message) {
    state.canceled = true;
    if (state.stream) {
      try {
        state.stream.destroy();
      } catch (_ignored) {
        // Ignore cleanup failures.
      }
    }
    if (fs.existsSync(state.tempPath)) {
      try {
        fs.unlinkSync(state.tempPath);
      } catch (_ignored) {
        // Ignore cleanup failures.
      }
    }
    this.uploads.delete(state.requestId);
    this.emitFailed(state, 'upload_failed', message);
  }

  emitProgress(state, direction, transferredBytes, totalBytes, lastProgressAt) {
    const requestId = state && typeof state.requestId === 'string' ? state.requestId : '';
    const now = Date.now();
    if (lastProgressAt > 0 && now - lastProgressAt < PROGRESS_INTERVAL_MS && totalBytes !== transferredBytes) {
      return;
    }
    this.broadcast({
      type: 'event',
      event: 'file.transfer.progress',
      sessionId: '',
      ownerId: state && state.connection && typeof state.connection.connectionId === 'string' ? state.connection.connectionId : '',
      payload: {
        requestId,
        direction,
        transferredBytes,
        totalBytes: typeof totalBytes === 'number' && totalBytes >= 0 ? totalBytes : 0,
        updatedAt: now
      },
      createdAt: now
    });
  }

  emitCompleted(state, direction, metadata) {
    const requestId = state && typeof state.requestId === 'string' ? state.requestId : '';
    this.broadcast({
      type: 'event',
      event: 'file.transfer.completed',
      sessionId: '',
      ownerId: state && state.connection && typeof state.connection.connectionId === 'string' ? state.connection.connectionId : '',
      payload: {
        requestId,
        direction,
        metadata
      },
      createdAt: Date.now()
    });
  }

  emitFailed(state, code, message) {
    const requestId = state && typeof state.requestId === 'string' ? state.requestId : '';
    this.broadcast({
      type: 'event',
      event: 'file.transfer.failed',
      sessionId: '',
      ownerId: state && state.connection && typeof state.connection.connectionId === 'string' ? state.connection.connectionId : '',
      payload: {
        requestId,
        code,
        message
      },
      createdAt: Date.now()
    });
  }

  resolveWorkspaceFile(payload, allowMissing) {
    const workspace = this.resolveWorkspaceRoot(payload);
    const rawPath = readString(payload, 'path', readString(payload, 'relativePath', ''));
    const relativePath = normalizeRelativePath(rawPath);
    if (relativePath.length === 0) {
      throw new Error('File path is required.');
    }
    const resolved = resolveInside(workspace.rootPath, relativePath);
    if (!allowMissing && !fs.existsSync(resolved.absolutePath)) {
      throw new Error('Requested file does not exist.');
    }
    return {
      workspaceId: workspace.workspaceId,
      rootPath: workspace.rootPath,
      relativePath: resolved.relativePath,
      absolutePath: resolved.absolutePath
    };
  }

  resolveWorkspaceRoot(payload) {
    const sessionId = readString(payload, 'sessionId', '');
    if (sessionId.length > 0) {
      const match = this.registry.findSession(sessionId);
      if (match && match.session && typeof match.session.workspacePath === 'string' && match.session.workspacePath.length > 0) {
        return {
          rootPath: normalizeCwd(match.session.workspacePath),
          workspaceId: readString(payload, 'workspaceId', '')
        };
      }
    }
    const agentId = readString(payload, 'agentId', '');
    if (agentId.length > 0) {
      const agent = this.agentManager.find(agentId);
      if (agent && agent.cwd.length > 0) {
        return {
          rootPath: normalizeCwd(agent.cwd),
          workspaceId: agent.workspaceId
        };
      }
    }
    const requestedWorkspaceId = readString(payload, 'workspaceId', '');
    const requestedCwd = normalizeCwd(readString(payload, 'cwd', readString(payload, 'workspacePath', '')));
    const workspaces = this.workspaceRegistry.listWorkspaces();
    for (const workspace of workspaces) {
      if (!workspace || typeof workspace.cwd !== 'string') {
        continue;
      }
      const cwd = normalizeCwd(workspace.cwd);
      if (requestedWorkspaceId.length > 0 && workspace.workspaceId === requestedWorkspaceId) {
        return {
          rootPath: cwd,
          workspaceId: workspace.workspaceId
        };
      }
      if (requestedCwd.length > 0 && requestedCwd === cwd) {
        return {
          rootPath: cwd,
          workspaceId: workspace.workspaceId
        };
      }
    }
    throw new Error('Workspace must belong to a registered workspace or agent.');
  }
}

module.exports = {
  FileTransferManager,
  FileTransferOpcode
};
