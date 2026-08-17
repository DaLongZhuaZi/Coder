'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { randomId } = require('./daemon-store');
const {
  TerminalStreamOpcode,
  TERMINAL_STREAM_PROTOCOL_VERSION,
  encodeTerminalFrame,
  encodeTerminalSnapshotPayload
} = require('./binary-frames');
const { EventType, readString, readNumber } = require('./protocol');
const { withTerminalScope } = require('./terminal-event-router');

const OUTPUT_COALESCE_MS = 8;
const CAPTURE_MAX_BYTES = 512 * 1024;
const SNAPSHOT_MAX_BYTES = 256 * 1024;
const ACTIVITY_IDLE_AFTER_MS = 2500;
const ATTENTION_MIN_WORK_MS = 8000;
const RECENT_INPUT_SUPPRESS_MS = 3000;
const CAPTURE_PERSIST_EVENT_MS = 1000;
const WINDOWS_BACKEND_CONPTY_DLL = 'conpty-dll';
const WINDOWS_BACKEND_SYSTEM_CONPTY = 'system-conpty';
const HOOK_BLOCK_START = '# >>> NGF Agent Bridge terminal hook >>>';
const HOOK_BLOCK_END = '# <<< NGF Agent Bridge terminal hook <<<';

const TerminalActivityState = Object.freeze({
  UNKNOWN: 'unknown',
  WORKING: 'working',
  IDLE: 'idle'
});

const TerminalAttentionReason = Object.freeze({
  FINISHED: 'finished',
  NEEDS_INPUT: 'needs_input'
});

function tryLoadNodePty() {
  try {
    return require('node-pty');
  } catch (error) {
    return null;
  }
}

function resolveWindowsBackend(value) {
  if (process.platform !== 'win32') {
    return { backend: 'native', error: '' };
  }
  const normalized = typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : WINDOWS_BACKEND_CONPTY_DLL;
  if (normalized === WINDOWS_BACKEND_CONPTY_DLL || normalized === WINDOWS_BACKEND_SYSTEM_CONPTY) {
    return { backend: normalized, error: '' };
  }
  return { backend: normalized, error: 'terminal_windows_backend_invalid' };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCwd(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return path.resolve(value);
}

function defaultShell() {
  const override = process.env.AGENT_BRIDGE_TERMINAL_SHELL;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  if (process.platform === 'win32') {
    return process.env.ComSpec && process.env.ComSpec.length > 0 ? process.env.ComSpec : 'cmd.exe';
  }
  return process.env.SHELL && process.env.SHELL.length > 0 ? process.env.SHELL : '/bin/sh';
}

function shellArgs(shell) {
  const overrideArgs = process.env.AGENT_BRIDGE_TERMINAL_SHELL_ARGS;
  if (typeof overrideArgs === 'string' && overrideArgs.trim().length > 0) {
    return overrideArgs.trim().split(/\s+/);
  }
  const lower = shell.toLowerCase();
  if (process.platform === 'win32' && lower.endsWith('powershell.exe')) {
    return ['-NoLogo'];
  }
  return [];
}

function bufferText(buffer) {
  if (!buffer) {
    return '';
  }
  return Buffer.isBuffer(buffer) ? buffer.toString('utf8') : Buffer.from(buffer).toString('utf8');
}

function tailStringByBytes(text, maxBytes) {
  const buffer = Buffer.from(text || '', 'utf8');
  if (buffer.length <= maxBytes) {
    return {
      text: text || '',
      truncated: false,
      bytes: buffer.length,
      source: 'memory',
      persistedBytes: 0,
      warning: ''
    };
  }
  const tail = buffer.subarray(buffer.length - maxBytes).toString('utf8');
  return {
    text: tail,
    truncated: true,
    bytes: Buffer.byteLength(tail, 'utf8'),
    source: 'memory',
    persistedBytes: 0,
    warning: ''
  };
}

function tailFileByBytes(filePath, maxBytes) {
  if (typeof filePath !== 'string' || filePath.length === 0 || !fs.existsSync(filePath)) {
    return {
      text: '',
      truncated: false,
      bytes: 0,
      source: 'persisted',
      persistedBytes: 0,
      warning: typeof filePath === 'string' && filePath.length > 0 ? 'persisted_capture_missing' : ''
    };
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    return {
      text: '',
      truncated: false,
      bytes: 0,
      source: 'persisted',
      persistedBytes: stat.size || 0,
      warning: !stat.isFile() ? 'persisted_capture_not_file' : ''
    };
  }
  const start = stat.size > maxBytes ? stat.size - maxBytes : 0;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8');
    return {
      text,
      truncated: start > 0,
      bytes: Buffer.byteLength(text, 'utf8'),
      source: 'persisted',
      persistedBytes: stat.size,
      warning: ''
    };
  } finally {
    fs.closeSync(fd);
  }
}

function appendCapture(session, chunk) {
  const text = bufferText(chunk);
  if (text.length === 0) {
    return {
      text: '',
      trimmed: false
    };
  }
  session.captureText += text;
  let trimmed = false;
  if (Buffer.byteLength(session.captureText, 'utf8') > CAPTURE_MAX_BYTES) {
    session.captureText = tailStringByBytes(session.captureText, CAPTURE_MAX_BYTES).text;
    trimmed = true;
  }
  session.captureByteLength = Buffer.byteLength(session.captureText, 'utf8');
  session.snapshotSeq += 1;
  return {
    text,
    trimmed
  };
}

function inferMouseMode(input, previousMode) {
  if (typeof input !== 'string' || input.length === 0) {
    return previousMode || 'off';
  }
  if (input.includes('?1003h')) {
    return 'all';
  }
  if (input.includes('?1002h') && input.includes('?1006h')) {
    return 'sgr';
  }
  if (input.includes('?1002h')) {
    return 'drag';
  }
  if (input.includes('?1000h') || input.includes('?9h')) {
    return input.includes('?1006h') ? 'sgr' : 'click';
  }
  if (
    input.includes('?9l') ||
    input.includes('?1000l') ||
    input.includes('?1002l') ||
    input.includes('?1003l') ||
    input.includes('?1006l')
  ) {
    return 'off';
  }
  return previousMode && previousMode !== 'off' ? previousMode : 'raw';
}

function powershellQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function posixQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function readBooleanValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  return typeof source[key] === 'boolean' ? source[key] : fallbackValue;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function hookHomeDirectory() {
  const override = process.env.AGENT_BRIDGE_HOOK_HOME;
  if (typeof override === 'string' && override.length > 0) {
    return path.resolve(override);
  }
  return os.homedir();
}

function powershellProfilePaths() {
  const home = hookHomeDirectory();
  if (home.length === 0) {
    return [];
  }
  return uniqueStrings([
    path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
  ]);
}

function posixProfilePaths() {
  const home = hookHomeDirectory();
  if (home.length === 0) {
    return [];
  }
  const shell = typeof process.env.SHELL === 'string' ? process.env.SHELL.toLowerCase() : '';
  const preferred = shell.indexOf('zsh') >= 0
    ? path.join(home, '.zshrc')
    : (shell.indexOf('bash') >= 0 ? path.join(home, '.bashrc') : path.join(home, '.profile'));
  return uniqueStrings([
    preferred,
    path.join(home, '.profile')
  ]);
}

function profilePathsForShell(shell) {
  if (shell === 'powershell') {
    return powershellProfilePaths();
  }
  if (shell === 'posix') {
    return posixProfilePaths();
  }
  return [];
}

function profileText(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 || !fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function hookProfileBlock(sourceCommand) {
  return [HOOK_BLOCK_START, sourceCommand, HOOK_BLOCK_END, ''].join('\n');
}

function hasHookProfileBlock(text, sourceCommand) {
  return text.indexOf(HOOK_BLOCK_START) >= 0 ||
    (typeof sourceCommand === 'string' && sourceCommand.length > 0 && text.indexOf(sourceCommand) >= 0);
}

function removeHookProfileBlock(text, sourceCommand) {
  let next = typeof text === 'string' ? text : '';
  let start = next.indexOf(HOOK_BLOCK_START);
  while (start >= 0) {
    const end = next.indexOf(HOOK_BLOCK_END, start);
    if (end < 0) {
      break;
    }
    let removeEnd = end + HOOK_BLOCK_END.length;
    if (next.charAt(removeEnd) === '\r' && next.charAt(removeEnd + 1) === '\n') {
      removeEnd += 2;
    } else if (next.charAt(removeEnd) === '\n') {
      removeEnd += 1;
    }
    next = next.substring(0, start) + next.substring(removeEnd);
    start = next.indexOf(HOOK_BLOCK_START);
  }
  if (typeof sourceCommand === 'string' && sourceCommand.length > 0) {
    const trimmedCommand = sourceCommand.trim();
    const lines = next.split(/\r?\n/);
    const kept = [];
    for (const line of lines) {
      if (line.trim() !== trimmedCommand) {
        kept.push(line);
      }
    }
    next = kept.join('\n');
  }
  return next;
}

function backupProfile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const backupPath = filePath + '.ngf-agent-bridge.bak-' + Date.now();
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  } else {
    fs.writeFileSync(backupPath, '', 'utf8');
  }
  return backupPath;
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function captureWarning(action, error) {
  const message = errorText(error);
  return action + (message.length > 0 ? ': ' + message : '');
}

class TerminalManager {
  constructor(options) {
    this.workspaceRegistry = options.workspaceRegistry;
    this.agentManager = options.agentManager;
    this.managedProcessLedger = options.managedProcessLedger;
    this.daemonStore = options.daemonStore || null;
    this.broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
    this.pty = options.ptyFactory || tryLoadNodePty();
    const windowsBackend = resolveWindowsBackend(
      options.windowsBackend || process.env.AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND
    );
    this.windowsBackend = windowsBackend.backend;
    this.windowsBackendError = windowsBackend.error;
    this.terminals = new Map();
    this.activityToken = randomId('termact');
    this.activityBaseUrl = '';
  }

  setActivityBaseUrl(url) {
    this.activityBaseUrl = typeof url === 'string' ? url.replace(/\/+$/, '') : '';
  }

  isActivityTokenValid(token) {
    if (typeof token !== 'string' || token.length === 0) {
      return false;
    }
    const expected = Buffer.from(this.activityToken, 'utf8');
    const provided = Buffer.from(token, 'utf8');
    if (expected.length !== provided.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, provided);
  }

  isAvailable() {
    return !!this.pty && this.windowsBackendError.length === 0;
  }

  hasCapturePersistence() {
    return !!this.daemonStore && typeof this.daemonStore.terminalCaptureFilePath === 'function';
  }

  hasSnapshotBackpressure() {
    return true;
  }

  supportsHooks() {
    return !!this.daemonStore && typeof this.daemonStore.terminalHookFilePath === 'function';
  }

  unavailablePayload() {
    if (this.windowsBackendError.length > 0) {
      return {
        available: false,
        code: this.windowsBackendError,
        message: 'AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND must be conpty-dll or system-conpty.',
        backend: this.windowsBackend
      };
    }
    return {
      available: false,
      code: 'terminal_unavailable',
      message: 'Terminal support requires optional dependency node-pty.'
    };
  }

  list(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const agentId = readString(payload, 'agentId', '');
    const cwd = normalizeCwd(readString(payload, 'cwd', readString(payload, 'workspacePath', '')));
    const terminals = [];
    for (const session of this.terminals.values()) {
      const ownerAgentId = typeof session.ownerAgentId === 'string' ? session.ownerAgentId : '';
      if (ownerAgentId.length > 0 && ownerAgentId !== agentId) {
        continue;
      }
      if (workspaceId.length > 0 && session.workspaceId !== workspaceId) {
        continue;
      }
      if (cwd.length > 0 && session.cwd !== cwd) {
        continue;
      }
      terminals.push(this.publicTerminal(session));
    }
    terminals.sort((left, right) => right.updatedAt - left.updatedAt);
    return {
      available: this.isAvailable(),
      terminals
    };
  }

  create(payload, connection) {
    if (!this.isAvailable()) {
      return this.unavailablePayload();
    }
    const resolved = this.resolveAllowedCwd(payload);
    if (!resolved.ok) {
      return {
        available: true,
        code: 'terminal_cwd_not_allowed',
        message: resolved.message
      };
    }
    const rows = Math.max(8, Math.min(80, Math.floor(readNumber(payload, 'rows', 24))));
    const cols = Math.max(20, Math.min(240, Math.floor(readNumber(payload, 'cols', 80))));
    const requestedName = readString(payload, 'name', '');
    const terminalId = readString(payload, 'terminalId', randomId('term'));
    const shell = defaultShell();
    const args = shellArgs(shell);
    const title = requestedName.length > 0 ? requestedName : path.basename(resolved.cwd);
    const capturePath = this.capturePathForTerminal(terminalId);
    let captureStatus = capturePath.length > 0 ? 'ready' : 'memory';
    let captureWarningText = '';
    if (capturePath.length > 0) {
      try {
        fs.writeFileSync(capturePath, '', 'utf8');
      } catch (error) {
        captureStatus = 'error';
        captureWarningText = captureWarning('capture_init_failed', error);
        // Capture persistence is best effort; the in-memory terminal remains usable.
      }
    }
    const spawnEnv = Object.assign({}, process.env, {
      NGF_BRIDGE_TERMINAL_ID: terminalId,
      NGF_BRIDGE_ACTIVITY_TOKEN: this.activityToken
    });
    if (this.activityBaseUrl.length > 0) {
      spawnEnv.NGF_BRIDGE_ACTIVITY_URL = this.activityBaseUrl + '/terminal-activity';
    }
    let ptyProcess;
    try {
      const spawnOptions = {
        name: 'xterm-color',
        cwd: resolved.cwd,
        cols,
        rows,
        env: spawnEnv
      };
      if (process.platform === 'win32') {
        spawnOptions.useConpty = true;
        spawnOptions.useConptyDll = this.windowsBackend === WINDOWS_BACKEND_CONPTY_DLL;
      }
      ptyProcess = this.pty.spawn(shell, args, spawnOptions);
    } catch (error) {
      return {
        available: true,
        code: 'terminal_spawn_failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
    const ledgerRecord = this.managedProcessLedger.record({
      providerId: '',
      kind: 'terminal',
      pid: typeof ptyProcess.pid === 'number' ? ptyProcess.pid : 0,
      command: shell,
      args,
      cwd: resolved.cwd,
      identity: {
        terminalId,
        workspaceId: resolved.workspaceId,
        agentId: resolved.ownerAgentId,
        runtimeOwnerId: resolved.ownerAgentId
      }
    });
    const now = Date.now();
    const session = {
      terminalId,
      ownerConnectionId: connection && typeof connection.connectionId === 'string' ? connection.connectionId : '',
      workspaceId: resolved.workspaceId,
      ownerAgentId: resolved.ownerAgentId,
      backend: this.windowsBackend,
      cwd: resolved.cwd,
      name: title,
      status: 'running',
      rows,
      cols,
      process: ptyProcess,
      ledgerId: ledgerRecord.id,
      captureText: '',
      captureByteLength: 0,
      capturePath,
      capturePersisted: false,
      captureStatus,
      captureWarning: captureWarningText,
      captureFileBytes: 0,
      capturePersistedAt: 0,
      lastCapturePersistedEventAt: 0,
      lastCaptureWarningEventAt: 0,
      snapshotSeq: 0,
      restoreSeq: 0,
      snapshotMaxBytes: SNAPSHOT_MAX_BYTES,
      lastSnapshotBytes: 0,
      lastSnapshotTruncated: false,
      lastSnapshotSource: 'memory',
      lastSnapshotPersistedBytes: 0,
      lastSnapshotWarning: '',
      lastInputError: '',
      lastResizeError: '',
      mouseMode: 'off',
      lastMouseInput: '',
      lastMouseAt: 0,
      lastMouseError: '',
      subscribers: new Map(),
      pendingOutput: [],
      flushTimer: null,
      lastFlushAt: 0,
      activity: TerminalActivityState.UNKNOWN,
      workingSince: 0,
      lastOutputAt: 0,
      lastInputAt: 0,
      idleTimer: null,
      requiresAttention: false,
      attentionReason: '',
      attentionAt: 0,
      killRequested: false,
      processExitedAt: 0,
      exitCode: 0,
      exitSignal: '',
      createdAt: now,
      updatedAt: now
    };
    this.terminals.set(terminalId, session);
    ptyProcess.onData((data) => {
      this.handleOutput(session, Buffer.from(data, 'utf8'));
    });
    ptyProcess.onExit((event) => {
      this.handleExit(session, event);
    });
    this.broadcastTerminalUpdated(session);
    return {
      available: true,
      terminal: this.publicTerminal(session)
    };
  }

  subscribe(connection, payload) {
    const terminalId = readString(payload, 'terminalId', '');
    const session = this.terminals.get(terminalId);
    if (!session) {
      return {
        code: 'terminal_not_found',
        message: 'Terminal not found.'
      };
    }
    const access = this.validateTerminalAccess(session, payload);
    if (!access.ok) {
      return access;
    }
    if (!connection.terminalSlots) {
      connection.terminalSlots = new Map();
    }
    if (!connection.terminalSubscriptions) {
      connection.terminalSubscriptions = new Map();
    }
    const requestedVersion = Math.max(1, Math.min(
      TERMINAL_STREAM_PROTOCOL_VERSION,
      Math.floor(readNumber(payload, 'streamProtocolVersion', 1))
    ));
    const existingSlot = connection.terminalSubscriptions.get(terminalId);
    if (typeof existingSlot === 'number' && connection.terminalSlots.get(existingSlot) === terminalId) {
      const existingSubscriber = this.findSubscriber(session, connection, existingSlot);
      if (existingSubscriber) {
        existingSubscriber.streamProtocolVersion = requestedVersion;
        existingSubscriber.pendingRestore = this.snapshotPayload(session);
        session.updatedAt = Date.now();
        if (!readBooleanValue(payload, 'preserveAttention', false)) {
          this.clearAttention(session);
        }
        return {
          terminal: this.publicTerminal(session),
          slot: existingSlot,
          streamProtocolVersion: requestedVersion,
          restoreSeq: session.restoreSeq,
          snapshotSeq: session.snapshotSeq,
          reused: true
        };
      }
      connection.terminalSubscriptions.delete(terminalId);
      connection.terminalSlots.delete(existingSlot);
    }
    const slot = this.allocateSlot(connection);
    if (slot <= 0) {
      return {
        code: 'terminal_slot_unavailable',
        message: 'No terminal stream slots are available for this connection.'
      };
    }
    connection.terminalSlots.set(slot, terminalId);
    connection.terminalSubscriptions.set(terminalId, slot);
    const subscriberKey = connection.connectionId || 'slot:' + String(slot);
    const pendingRestore = this.snapshotPayload(session);
    session.subscribers.set(subscriberKey, {
      subscriberKey,
      connection,
      slot,
      streamProtocolVersion: requestedVersion,
      pendingRestore
    });
    session.updatedAt = Date.now();
    if (!readBooleanValue(payload, 'preserveAttention', false)) {
      this.clearAttention(session);
    }
    return {
      terminal: this.publicTerminal(session),
      slot,
      streamProtocolVersion: requestedVersion,
      restoreSeq: pendingRestore.restoreSeq,
      snapshotSeq: pendingRestore.snapshotSeq,
      reused: false
    };
  }

  sendRestore(connection, terminalId) {
    if (!connection || !connection.terminalSubscriptions) {
      return;
    }
    const slot = connection.terminalSubscriptions.get(terminalId);
    const session = this.terminals.get(terminalId);
    if (typeof slot !== 'number' || !session) {
      return;
    }
    const subscriber = this.findSubscriber(session, connection, slot);
    const snapshot = subscriber && subscriber.pendingRestore
      ? subscriber.pendingRestore
      : this.snapshotPayload(session);
    if (subscriber) {
      subscriber.pendingRestore = null;
    }
    const payload = subscriber && subscriber.streamProtocolVersion >= TERMINAL_STREAM_PROTOCOL_VERSION
      ? encodeTerminalSnapshotPayload(snapshot)
      : snapshot.text;
    connection.sendBinary(encodeTerminalFrame(TerminalStreamOpcode.RESTORE, slot, payload));
    this.broadcastTerminalUpdated(session);
    return snapshot;
  }

  unsubscribe(connection, payload) {
    const terminalId = readString(payload, 'terminalId', '');
    this.removeSubscription(connection, terminalId);
    return {
      terminalId,
      unsubscribed: true
    };
  }

  capture(payload) {
    const terminalId = readString(payload, 'terminalId', '');
    const session = this.terminals.get(terminalId);
    if (!session) {
      return {
        code: 'terminal_not_found',
        message: 'Terminal not found.'
      };
    }
    const access = this.validateTerminalAccess(session, payload);
    if (!access.ok) {
      return access;
    }
    const snapshot = this.snapshotPayload(session);
    return {
      terminal: this.publicTerminal(session),
      text: snapshot.text,
      capturedAt: Date.now(),
      persistence: this.capturePersistencePayload(session),
      snapshot: this.snapshotState(session),
      source: snapshot.source,
      truncated: snapshot.truncated,
      bytes: snapshot.bytes,
      persistedBytes: snapshot.persistedBytes,
      restoreSeq: snapshot.restoreSeq
    };
  }

  kill(payload) {
    const terminalId = readString(payload, 'terminalId', '');
    const session = this.terminals.get(terminalId);
    if (!session) {
      return {
        code: 'terminal_not_found',
        message: 'Terminal not found.'
      };
    }
    const access = this.validateTerminalAccess(session, payload);
    if (!access.ok) {
      return access;
    }
    try {
      session.process.kill();
    } catch (_error) {
      // The exit event or cleanup path will settle state.
    }
    session.killRequested = true;
    session.status = 'closed';
    session.updatedAt = Date.now();
    this.broadcastTerminalUpdated(session);
    return {
      terminal: this.publicTerminal(session),
      killed: true
    };
  }

  closeByAgent(agentId) {
    const closed = [];
    for (const session of this.terminals.values()) {
      if (session.ownerAgentId !== agentId) {
        continue;
      }
      for (const subscriber of session.subscribers.values()) {
        if (subscriber && subscriber.connection) {
          this.removeSubscription(subscriber.connection, session.terminalId);
        }
      }
      if (session.flushTimer) {
        clearTimeout(session.flushTimer);
        session.flushTimer = null;
      }
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
      }
      try {
        session.process.kill();
      } catch (_error) {
        // The terminal is still revoked locally even when the PTY already exited.
      }
      session.killRequested = true;
      session.status = 'closed';
      session.updatedAt = Date.now();
      this.managedProcessLedger.remove(session.ledgerId);
      closed.push(this.publicTerminal(session));
    }
    return { status: 'completed', closed };
  }

  captureCheckpoint(agentId) {
    const terminals = [];
    for (const session of this.terminals.values()) {
      if (session.ownerAgentId !== agentId) {
        continue;
      }
      const snapshot = tailStringByBytes(session.captureText, SNAPSHOT_MAX_BYTES);
      terminals.push({
        terminalId: session.terminalId,
        workspaceId: session.workspaceId,
        cwd: session.cwd,
        name: session.name,
        rows: session.rows,
        cols: session.cols,
        status: session.status,
        text: snapshot.text,
        truncated: snapshot.truncated,
        snapshotSeq: session.snapshotSeq || 0
      });
    }
    return {
      status: terminals.length > 0 ? 'captured' : 'not_available',
      kind: 'terminal_transcript_v1',
      restoreSupported: terminals.length > 0,
      reason: terminals.length > 0 ? 'terminal_transcripts_captured' : 'agent_has_no_terminal_sessions',
      token: terminals.length > 0 ? { terminals } : null
    };
  }

  restoreCheckpoint(agentId, token) {
    const items = token && Array.isArray(token.terminals) ? token.terminals : [];
    let restoredCount = 0;
    let missingCount = 0;
    for (const item of items) {
      const terminalId = item && typeof item.terminalId === 'string' ? item.terminalId : '';
      const session = terminalId.length > 0 ? this.terminals.get(terminalId) : null;
      if (!session || session.ownerAgentId !== agentId) {
        missingCount += 1;
        continue;
      }
      session.captureText = typeof item.text === 'string' ? item.text : '';
      session.captureByteLength = Buffer.byteLength(session.captureText, 'utf8');
      session.snapshotSeq = (session.snapshotSeq || 0) + 1;
      session.updatedAt = Date.now();
      if (session.capturePath.length > 0) {
        try {
          fs.writeFileSync(session.capturePath, session.captureText, 'utf8');
          session.capturePersisted = true;
          session.captureFileBytes = session.captureByteLength;
          session.capturePersistedAt = Date.now();
        } catch (error) {
          session.captureWarning = captureWarning('checkpoint_capture_persist_failed', error);
        }
      }
      for (const subscriber of session.subscribers.values()) {
        subscriber.pendingRestore = this.snapshotPayload(session);
        this.sendRestore(subscriber.connection, session.terminalId);
      }
      this.broadcastTerminalUpdated(session);
      restoredCount += 1;
    }
    return {
      status: restoredCount > 0 ? (missingCount > 0 ? 'partially_restored' : 'restored') : 'unavailable',
      restored: restoredCount > 0,
      restoredCount,
      missingCount,
      reason: restoredCount > 0
        ? 'terminal_transcripts_restored_live_process_unchanged'
        : 'checkpoint_terminal_sessions_unavailable'
    };
  }

  shutdownAll() {
    const owners = new Set();
    for (const session of this.terminals.values()) {
      const ownerAgentId = typeof session.ownerAgentId === 'string' ? session.ownerAgentId : '';
      if (ownerAgentId.length > 0) {
        owners.add(ownerAgentId);
      }
    }
    const results = [];
    for (const owner of owners) {
      results.push(this.closeByAgent(owner));
    }
    for (const session of this.terminals.values()) {
      const ownerAgentId = typeof session.ownerAgentId === 'string' ? session.ownerAgentId : '';
      if (ownerAgentId.length === 0 && session.status !== 'closed') {
        try {
          session.process.kill();
        } catch (_error) {
        }
        session.status = 'closed';
        this.managedProcessLedger.remove(session.ledgerId);
      }
    }
    return { status: 'completed', results };
  }

  rename(payload) {
    const terminalId = readString(payload, 'terminalId', '');
    const name = readString(payload, 'name', '').trim();
    const session = this.terminals.get(terminalId);
    if (!session) {
      return {
        code: 'terminal_not_found',
        message: 'Terminal not found.'
      };
    }
    const access = this.validateTerminalAccess(session, payload);
    if (!access.ok) {
      return access;
    }
    if (name.length > 0) {
      session.name = name;
      session.updatedAt = Date.now();
      this.broadcastTerminalUpdated(session);
    }
    return {
      terminal: this.publicTerminal(session)
    };
  }

  hookStatus(_payload) {
    if (!this.supportsHooks()) {
      return {
        available: false,
        code: 'terminal_hooks_unavailable',
        message: 'Terminal hook installation requires a daemon store.'
      };
    }
    return this.buildHookStatus();
  }

  hookDescriptors() {
    const powershellPath = this.daemonStore.terminalHookFilePath('ngf-terminal-hook.ps1');
    const posixPath = this.daemonStore.terminalHookFilePath('ngf-terminal-hook.sh');
    return [
      {
        shell: 'powershell',
        path: powershellPath,
        sourceCommand: '. ' + powershellQuote(powershellPath),
        profilePaths: profilePathsForShell('powershell')
      },
      {
        shell: 'posix',
        path: posixPath,
        sourceCommand: '. ' + posixQuote(posixPath),
        profilePaths: profilePathsForShell('posix')
      }
    ];
  }

  writeHookScripts() {
    const powershellPath = this.daemonStore.terminalHookFilePath('ngf-terminal-hook.ps1');
    const posixPath = this.daemonStore.terminalHookFilePath('ngf-terminal-hook.sh');
    fs.writeFileSync(powershellPath, this.powershellHookScript(), 'utf8');
    fs.writeFileSync(posixPath, this.posixHookScript(), 'utf8');
    if (process.platform !== 'win32') {
      fs.chmodSync(posixPath, 0o755);
    }
  }

  activeHookDescriptor() {
    const descriptors = this.hookDescriptors();
    const shell = process.platform === 'win32' ? 'powershell' : 'posix';
    for (const descriptor of descriptors) {
      if (descriptor.shell === shell) {
        return descriptor;
      }
    }
    return descriptors.length > 0 ? descriptors[0] : null;
  }

  hookProfilePlan(action) {
    const descriptor = this.activeHookDescriptor();
    const plannedProfileEdits = this.hookProfilePlans(action);
    if (!descriptor) {
      return {
        profilePath: '',
        sourceCommand: '',
        plannedProfileEdits,
        installed: false
      };
    }
    const profilePaths = descriptor.profilePaths;
    const profilePath = profilePaths.length > 0 ? profilePaths[0] : '';
    const text = profileText(profilePath);
    const installed = hasHookProfileBlock(text, descriptor.sourceCommand);
    return {
      profilePath,
      sourceCommand: descriptor.sourceCommand,
      plannedProfileEdits,
      installed
    };
  }

  hookProfilePlans(action) {
    const descriptors = this.hookDescriptors();
    const plannedProfileEdits = [];
    for (const descriptor of descriptors) {
      const profilePaths = descriptor.profilePaths;
      for (const profilePath of profilePaths) {
        const text = profileText(profilePath);
        const installed = hasHookProfileBlock(text, descriptor.sourceCommand);
        plannedProfileEdits.push({
          action,
          shell: descriptor.shell,
          profilePath,
          sourceCommand: descriptor.sourceCommand,
          profileInstalled: installed,
          wouldModify: action === 'install' ? !installed : installed
        });
      }
    }
    return plannedProfileEdits;
  }

  applyHookProfile(action) {
    const plan = this.hookProfilePlan(action);
    if (plan.profilePath.length === 0) {
      return {
        profileModified: false,
        backupPath: '',
        profilePath: '',
        profileInstalled: false
      };
    }
    const before = profileText(plan.profilePath);
    let after = before;
    if (action === 'install') {
      const withoutOldBlock = removeHookProfileBlock(before, plan.sourceCommand);
      after = withoutOldBlock;
      if (after.length > 0 && !after.endsWith('\n')) {
        after += '\n';
      }
      after += hookProfileBlock(plan.sourceCommand);
    } else if (action === 'uninstall') {
      after = removeHookProfileBlock(before, plan.sourceCommand);
      if (after.length > 0 && !after.endsWith('\n')) {
        after += '\n';
      }
    }
    if (after === before) {
      return {
        profileModified: false,
        backupPath: '',
        profilePath: plan.profilePath,
        profileInstalled: hasHookProfileBlock(after, plan.sourceCommand)
      };
    }
    const backupPath = backupProfile(plan.profilePath);
    fs.writeFileSync(plan.profilePath, after, 'utf8');
    return {
      profileModified: true,
      backupPath,
      profilePath: plan.profilePath,
      profileInstalled: hasHookProfileBlock(after, plan.sourceCommand)
    };
  }

  installHook(payload) {
    if (!this.supportsHooks()) {
      return {
        available: false,
        code: 'terminal_hooks_unavailable',
        message: 'Terminal hook installation requires a daemon store.'
      };
    }
    const action = readString(payload, 'action', 'install');
    const confirm = readBooleanValue(payload, 'confirm', readBooleanValue(payload, 'force', false));
    const effectiveAction = action === 'preview' || action === 'uninstall' ? action : 'install';
    const plan = this.hookProfilePlan(effectiveAction === 'preview' ? 'install' : effectiveAction);
    if (effectiveAction === 'preview') {
      return Object.assign(this.buildHookStatus(), {
        action: effectiveAction,
        confirmRequired: false,
        profilePath: plan.profilePath,
        plannedProfileEdits: plan.plannedProfileEdits,
        needsRestart: false,
        profileModified: false,
        backupPath: ''
      });
    }
    try {
      if (effectiveAction === 'install') {
        this.writeHookScripts();
      }
      if (!confirm) {
        const status = this.buildHookStatus();
        return Object.assign(status, {
          action: effectiveAction,
          confirmRequired: true,
          profilePath: plan.profilePath,
          plannedProfileEdits: plan.plannedProfileEdits,
          profileModified: false,
          backupPath: '',
          needsRestart: effectiveAction === 'install' ? !plan.installed : plan.installed
        });
      }
      const profileResult = this.applyHookProfile(effectiveAction);
      const status = Object.assign(this.buildHookStatus(), {
        action: effectiveAction,
        confirmRequired: false,
        profileModified: profileResult.profileModified,
        backupPath: profileResult.backupPath,
        profilePath: profileResult.profilePath,
        needsRestart: profileResult.profileModified,
        profileInstalled: profileResult.profileInstalled
      });
      this.applyHookResultToRecords(status, profileResult);
      this.broadcast({
        type: 'event',
        event: EventType.TERMINAL_HOOK_UPDATED,
        sessionId: '',
        payload: status,
        createdAt: Date.now()
      });
      return status;
    } catch (error) {
      return {
        available: true,
        code: 'terminal_hook_install_failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  handleBinaryFrame(connection, frame) {
    if (!connection || !connection.terminalSlots) {
      return false;
    }
    const terminalId = connection.terminalSlots.get(frame.slot);
    if (typeof terminalId !== 'string') {
      return false;
    }
    const session = this.terminals.get(terminalId);
    if (!session || session.status === 'closed') {
      return false;
    }
    if (frame.opcode === TerminalStreamOpcode.INPUT || frame.opcode === TerminalStreamOpcode.MOUSE) {
      const input = bufferText(frame.payload);
      try {
        session.process.write(input);
        session.lastInputError = '';
        session.lastInputAt = Date.now();
        if (frame.opcode === TerminalStreamOpcode.MOUSE) {
          session.mouseMode = inferMouseMode(input, session.mouseMode);
          session.lastMouseInput = input;
          session.lastMouseAt = session.lastInputAt;
          session.lastMouseError = '';
        }
        session.updatedAt = session.lastInputAt;
        this.clearAttention(session);
        return true;
      } catch (error) {
        const message = errorText(error);
        session.lastInputError = message;
        if (frame.opcode === TerminalStreamOpcode.MOUSE) {
          session.lastMouseError = message;
          session.lastMouseAt = Date.now();
        }
        session.updatedAt = Date.now();
        this.broadcastTerminalUpdated(session);
        return false;
      }
    }
    if (frame.opcode === TerminalStreamOpcode.SNAPSHOT) {
      // Client asks for a catch-up snapshot of the capture buffer (e.g. after
      // reconnecting). Reply on the same slot with a SNAPSHOT frame so the
      // client can replace its local buffer instead of replaying deltas.
      try {
        const snapshot = this.snapshotPayload(session);
        const subscriber = this.findSubscriber(session, connection, frame.slot);
        const payload = subscriber && subscriber.streamProtocolVersion >= TERMINAL_STREAM_PROTOCOL_VERSION
          ? encodeTerminalSnapshotPayload(snapshot)
          : snapshot.text;
        connection.sendBinary(encodeTerminalFrame(TerminalStreamOpcode.SNAPSHOT, frame.slot, payload));
        this.broadcastTerminalUpdated(session);
      } catch (_error) {
        return false;
      }
      return true;
    }
    if (frame.opcode === TerminalStreamOpcode.RESIZE) {
      try {
        const parsed = JSON.parse(bufferText(frame.payload));
        const rows = typeof parsed.rows === 'number' ? Math.floor(parsed.rows) : session.rows;
        const cols = typeof parsed.cols === 'number' ? Math.floor(parsed.cols) : session.cols;
        if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 8 || cols < 20 || rows > 80 || cols > 240) {
          session.lastResizeError = 'terminal_resize_out_of_bounds';
          session.updatedAt = Date.now();
          this.broadcastTerminalUpdated(session);
          return false;
        }
        session.process.resize(cols, rows);
        session.lastResizeError = '';
        session.rows = rows;
        session.cols = cols;
        session.updatedAt = Date.now();
        this.broadcastTerminalUpdated(session);
      } catch (_error) {
        session.lastResizeError = 'terminal_resize_invalid_payload';
        session.updatedAt = Date.now();
        this.broadcastTerminalUpdated(session);
        return false;
      }
      return true;
    }
    return false;
  }

  detachConnection(connection) {
    if (!connection || !connection.terminalSubscriptions) {
      return;
    }
    const terminalIds = Array.from(connection.terminalSubscriptions.keys());
    for (const terminalId of terminalIds) {
      this.removeSubscription(connection, terminalId);
    }
  }

  removeSubscription(connection, terminalId) {
    if (!connection || typeof terminalId !== 'string' || terminalId.length === 0) {
      return;
    }
    const session = this.terminals.get(terminalId);
    if (connection.terminalSubscriptions) {
      const slot = connection.terminalSubscriptions.get(terminalId);
      connection.terminalSubscriptions.delete(terminalId);
      if (connection.terminalSlots && typeof slot === 'number') {
        connection.terminalSlots.delete(slot);
      }
    }
    if (session) {
      for (const [key, subscriber] of session.subscribers.entries()) {
        if (subscriber && subscriber.connection === connection) {
          session.subscribers.delete(key);
        }
      }
      session.updatedAt = Date.now();
    }
  }

  findSubscriber(session, connection, slot) {
    if (!session || !session.subscribers) {
      return null;
    }
    for (const subscriber of session.subscribers.values()) {
      if (subscriber && subscriber.connection === connection && subscriber.slot === slot) {
        return subscriber;
      }
    }
    return null;
  }

  allocateSlot(connection) {
    if (!connection.terminalSlots) {
      connection.terminalSlots = new Map();
    }
    for (let slot = 1; slot <= 255; slot += 1) {
      if (!connection.terminalSlots.has(slot)) {
        return slot;
      }
    }
    return -1;
  }

  handleOutput(session, chunk) {
    const capture = appendCapture(session, chunk);
    this.persistCapture(session, chunk, capture.trimmed);
    this.markWorking(session);
    session.updatedAt = Date.now();
    const now = Date.now();
    if (session.pendingOutput.length === 0 && now - session.lastFlushAt >= OUTPUT_COALESCE_MS) {
      this.flushOutput(session, [chunk]);
      return;
    }
    session.pendingOutput.push(chunk);
    if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => {
        const pending = session.pendingOutput.splice(0);
        session.flushTimer = null;
        this.flushOutput(session, pending);
      }, OUTPUT_COALESCE_MS);
    }
  }

  markWorking(session) {
    const now = Date.now();
    session.lastOutputAt = now;
    if (session.activity !== TerminalActivityState.WORKING) {
      session.activity = TerminalActivityState.WORKING;
      session.workingSince = now;
    }
    if (!session.idleTimer) {
      session.idleTimer = setTimeout(() => {
        session.idleTimer = null;
        this.evaluateIdle(session);
      }, ACTIVITY_IDLE_AFTER_MS);
    }
  }

  evaluateIdle(session) {
    if (session.status === 'closed') {
      return;
    }
    const now = Date.now();
    const sinceOutput = now - session.lastOutputAt;
    if (sinceOutput < ACTIVITY_IDLE_AFTER_MS) {
      // Output kept flowing while the timer was pending; re-arm for the
      // remaining quiet window instead of rescheduling on every chunk.
      session.idleTimer = setTimeout(() => {
        session.idleTimer = null;
        this.evaluateIdle(session);
      }, ACTIVITY_IDLE_AFTER_MS - sinceOutput);
      return;
    }
    const workedMs = session.workingSince > 0 ? now - session.workingSince : 0;
    session.activity = TerminalActivityState.IDLE;
    session.workingSince = 0;
    session.updatedAt = now;
    const recentUserInput = session.lastInputAt > 0 && now - session.lastInputAt < ATTENTION_MIN_WORK_MS;
    if (workedMs >= ATTENTION_MIN_WORK_MS && !recentUserInput) {
      this.raiseAttention(session, TerminalAttentionReason.FINISHED);
      return;
    }
    this.broadcastTerminalUpdated(session);
  }

  raiseAttention(session, reason) {
    session.requiresAttention = true;
    session.attentionReason = reason;
    session.attentionAt = Date.now();
    session.updatedAt = session.attentionAt;
    this.broadcast(withTerminalScope({
      type: 'event',
      event: 'terminal.attention',
      sessionId: '',
      payload: {
        terminal: this.publicTerminal(session),
        terminalId: session.terminalId,
        reason
      },
      createdAt: Date.now()
    }, session));
    this.broadcastTerminalUpdated(session);
  }

  clearAttention(session) {
    if (!session || !session.requiresAttention) {
      return;
    }
    session.requiresAttention = false;
    session.attentionReason = '';
    session.attentionAt = 0;
    session.updatedAt = Date.now();
    this.broadcastTerminalUpdated(session);
  }

  reportActivity(payload) {
    const terminalId = readString(payload, 'terminalId', '');
    const state = readString(payload, 'state', '');
    const reason = readString(payload, 'reason', '');
    const session = this.terminals.get(terminalId);
    if (!session) {
      return {
        code: 'terminal_not_found',
        message: 'Terminal not found.'
      };
    }
    const now = Date.now();
    if (state === TerminalActivityState.WORKING) {
      session.activity = TerminalActivityState.WORKING;
      if (session.workingSince <= 0) {
        session.workingSince = now;
      }
      session.updatedAt = now;
      this.clearAttention(session);
    } else if (state === TerminalActivityState.IDLE) {
      session.activity = TerminalActivityState.IDLE;
      session.workingSince = 0;
      session.updatedAt = now;
    }
    if (reason === TerminalAttentionReason.FINISHED || reason === TerminalAttentionReason.NEEDS_INPUT) {
      this.raiseAttention(session, reason);
    } else {
      this.broadcastTerminalUpdated(session);
    }
    return {
      terminal: this.publicTerminal(session)
    };
  }

  flushOutput(session, chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return;
    }
    session.lastFlushAt = Date.now();
    const payload = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    for (const subscriber of session.subscribers.values()) {
      try {
        subscriber.connection.sendBinary(encodeTerminalFrame(TerminalStreamOpcode.OUTPUT, subscriber.slot, payload));
      } catch (_error) {
        // Dead sockets are cleaned up by websocket close handling.
      }
    }
  }

  handleExit(session, event) {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    if (session.pendingOutput.length > 0) {
      const pending = session.pendingOutput.splice(0);
      this.flushOutput(session, pending);
    }
    session.status = 'closed';
    session.activity = TerminalActivityState.IDLE;
    session.workingSince = 0;
    session.processExitedAt = Date.now();
    session.exitCode = event && typeof event.exitCode === 'number' ? event.exitCode : 0;
    session.exitSignal = event && typeof event.signal === 'number' ? String(event.signal) : '';
    session.updatedAt = Date.now();
    if (session.ledgerId.length > 0) {
      this.managedProcessLedger.remove(session.ledgerId);
    }
    this.broadcast(withTerminalScope({
        type: 'event',
        event: 'terminal.stream.exit',
        sessionId: '',
        payload: {
          terminalId: session.terminalId,
          exitCode: event && typeof event.exitCode === 'number' ? event.exitCode : 0,
          signal: event && typeof event.signal === 'number' ? String(event.signal) : ''
        },
        createdAt: Date.now()
      }, session));
    const exitAt = Date.now();
    const userDrivenExit = session.killRequested === true ||
      (session.lastInputAt > 0 && exitAt - session.lastInputAt < RECENT_INPUT_SUPPRESS_MS);
    if (!userDrivenExit) {
      // A terminal that ends without the user having just interacted with it
      // is treated like a finished background job: surface attention so the
      // client can badge it and push a notification.
      this.raiseAttention(session, TerminalAttentionReason.FINISHED);
      return;
    }
    this.broadcastTerminalUpdated(session);
  }

  broadcastTerminalUpdated(session) {
    this.broadcast(withTerminalScope({
      type: 'event',
      event: 'terminal.updated',
      sessionId: '',
      payload: {
        terminal: this.publicTerminal(session)
      },
      createdAt: Date.now()
    }, session));
  }

  capturePathForTerminal(terminalId) {
    if (!this.hasCapturePersistence()) {
      return '';
    }
    return this.daemonStore.terminalCaptureFilePath(terminalId);
  }

  persistCapture(session, chunk, trimmed) {
    if (!session || typeof session.capturePath !== 'string' || session.capturePath.length === 0) {
      return;
    }
    try {
      if (trimmed) {
        fs.writeFileSync(session.capturePath, session.captureText, 'utf8');
      } else {
        fs.appendFileSync(session.capturePath, chunk);
      }
      const stat = fs.statSync(session.capturePath);
      session.capturePersisted = true;
      session.captureStatus = 'persisted';
      session.captureWarning = '';
      session.captureFileBytes = stat.size;
      session.capturePersistedAt = Date.now();
      if (
        trimmed ||
        session.capturePersistedAt - session.lastCapturePersistedEventAt >= CAPTURE_PERSIST_EVENT_MS
      ) {
        session.lastCapturePersistedEventAt = session.capturePersistedAt;
        this.broadcast(withTerminalScope({
          type: 'event',
          event: EventType.TERMINAL_CAPTURE_PERSISTED,
          sessionId: '',
          payload: {
            terminalId: session.terminalId,
            path: session.capturePath,
            sizeBytes: session.captureFileBytes,
            trimmed,
            status: session.captureStatus,
            warning: session.captureWarning
          },
          createdAt: Date.now()
        }, session));
      }
    } catch (error) {
      const now = Date.now();
      session.capturePersisted = false;
      session.captureStatus = 'error';
      session.captureWarning = captureWarning('capture_persist_failed', error);
      session.capturePersistedAt = now;
      if (
        !session.lastCaptureWarningEventAt ||
        now - session.lastCaptureWarningEventAt >= CAPTURE_PERSIST_EVENT_MS
      ) {
        session.lastCaptureWarningEventAt = now;
        this.broadcast(withTerminalScope({
          type: 'event',
          event: EventType.TERMINAL_CAPTURE_PERSISTED,
          sessionId: '',
          payload: {
            terminalId: session.terminalId,
            path: session.capturePath,
            sizeBytes: session.captureFileBytes || 0,
            trimmed,
            status: session.captureStatus,
            warning: session.captureWarning
          },
          createdAt: now
        }, session));
      }
    }
  }

  snapshotPayload(session) {
    const memorySnapshot = tailStringByBytes(session.captureText, SNAPSHOT_MAX_BYTES);
    let snapshot = memorySnapshot;
    let warning = memorySnapshot.warning || '';
    if (session.capturePath.length > 0 && (memorySnapshot.text.length === 0 || memorySnapshot.truncated)) {
      try {
        const persistedSnapshot = tailFileByBytes(session.capturePath, SNAPSHOT_MAX_BYTES);
        if (persistedSnapshot.text.length > 0) {
          snapshot = persistedSnapshot;
        } else if (persistedSnapshot.warning && persistedSnapshot.warning.length > 0) {
          warning = persistedSnapshot.warning;
        }
      } catch (error) {
        warning = captureWarning('capture_restore_failed', error);
        snapshot = memorySnapshot;
      }
    }
    if (warning.length > 0) {
      session.captureWarning = warning;
      if (session.captureStatus !== 'error') {
        session.captureStatus = 'warning';
      }
    }
    session.lastSnapshotBytes = snapshot.bytes;
    session.lastSnapshotTruncated = snapshot.truncated;
    session.lastSnapshotSource = snapshot.source;
    session.lastSnapshotPersistedBytes = snapshot.persistedBytes;
    session.lastSnapshotWarning = warning;
    session.restoreSeq = (typeof session.restoreSeq === 'number' ? session.restoreSeq : 0) + 1;
    snapshot.restoreSeq = session.restoreSeq;
    snapshot.snapshotSeq = session.snapshotSeq || 0;
    snapshot.warning = warning;
    return snapshot;
  }

  snapshotState(session) {
    return {
      seq: session.snapshotSeq,
      maxBytes: SNAPSHOT_MAX_BYTES,
      captureBytes: session.captureByteLength,
      lastBytes: session.lastSnapshotBytes,
      bytes: session.lastSnapshotBytes,
      truncated: session.lastSnapshotTruncated,
      source: session.lastSnapshotSource || 'memory',
      persistedBytes: session.lastSnapshotPersistedBytes || session.captureFileBytes || 0,
      restoreSeq: session.restoreSeq || 0,
      warning: session.lastSnapshotWarning || ''
    };
  }

  capturePersistencePayload(session) {
    return {
      enabled: this.hasCapturePersistence(),
      persisted: session.capturePersisted === true,
      path: session.capturePath || '',
      sizeBytes: session.captureFileBytes || 0,
      persistedAt: session.capturePersistedAt || 0,
      status: session.captureStatus || (session.capturePersisted === true ? 'persisted' : 'memory'),
      warning: session.captureWarning || ''
    };
  }

  buildHookStatus() {
    const descriptors = this.hookDescriptors();
    const hooks = [];
    let anyScriptExists = false;
    let anyProfileInstalled = false;
    let primaryProfilePath = '';
    for (const descriptor of descriptors) {
      const exists = fs.existsSync(descriptor.path);
      const profilePaths = descriptor.profilePaths;
      let profilePath = profilePaths.length > 0 ? profilePaths[0] : '';
      let profileInstalled = false;
      for (const candidate of profilePaths) {
        if (hasHookProfileBlock(profileText(candidate), descriptor.sourceCommand)) {
          profilePath = candidate;
          profileInstalled = true;
          break;
        }
      }
      if (primaryProfilePath.length === 0 && descriptor.shell === (process.platform === 'win32' ? 'powershell' : 'posix')) {
        primaryProfilePath = profilePath;
      }
      anyScriptExists = anyScriptExists || exists;
      anyProfileInstalled = anyProfileInstalled || profileInstalled;
      hooks.push({
        name: descriptor.shell + ' hook',
        shell: descriptor.shell,
        path: descriptor.path,
        exists,
        installed: exists,
        sourceCommand: descriptor.sourceCommand,
        profilePath,
        profilePaths,
        profileInstalled,
        backupPath: '',
        needsRestart: false,
        confirmRequired: false
      });
    }
    const plan = this.hookProfilePlan('install');
    return {
      available: true,
      installed: anyScriptExists,
      scriptInstalled: anyScriptExists,
      profileInstalled: anyProfileInstalled,
      profileModified: false,
      confirmRequired: false,
      backupPath: '',
      profilePath: primaryProfilePath,
      plannedProfileEdits: plan.plannedProfileEdits,
      needsRestart: false,
      activityBaseUrl: this.activityBaseUrl,
      env: {
        terminalId: 'NGF_BRIDGE_TERMINAL_ID',
        activityUrl: 'NGF_BRIDGE_ACTIVITY_URL',
        activityToken: 'NGF_BRIDGE_ACTIVITY_TOKEN'
      },
      hooks
    };
  }

  applyHookResultToRecords(status, profileResult) {
    if (!status || !Array.isArray(status.hooks) || !profileResult || typeof profileResult.profilePath !== 'string') {
      return;
    }
    for (const hook of status.hooks) {
      if (!hook || hook.profilePath !== profileResult.profilePath) {
        continue;
      }
      hook.backupPath = profileResult.backupPath || '';
      hook.profileInstalled = profileResult.profileInstalled === true;
      hook.needsRestart = profileResult.profileModified === true;
      hook.confirmRequired = false;
    }
  }

  powershellHookScript() {
    return [
      '# NGF Agent Bridge terminal activity hook',
      'function Invoke-NgfBridgeTerminalActivity {',
      '  param([string]$State = "idle", [string]$Reason = "")',
      '  if (-not $env:NGF_BRIDGE_ACTIVITY_URL -or -not $env:NGF_BRIDGE_ACTIVITY_TOKEN -or -not $env:NGF_BRIDGE_TERMINAL_ID) { return }',
      '  $headers = @{ "X-Activity-Token" = $env:NGF_BRIDGE_ACTIVITY_TOKEN }',
      '  $body = @{ terminalId = $env:NGF_BRIDGE_TERMINAL_ID; state = $State; reason = $Reason } | ConvertTo-Json -Compress',
      '  try { Invoke-RestMethod -Method Post -Uri $env:NGF_BRIDGE_ACTIVITY_URL -Headers $headers -ContentType "application/json" -Body $body | Out-Null } catch { }',
      '}',
      'function Start-NgfBridgeTerminalWork { Invoke-NgfBridgeTerminalActivity -State "working" }',
      'function Stop-NgfBridgeTerminalWork { param([string]$Reason = "finished") Invoke-NgfBridgeTerminalActivity -State "idle" -Reason $Reason }',
      ''
    ].join('\n');
  }

  posixHookScript() {
    return [
      '#!/bin/sh',
      '# NGF Agent Bridge terminal activity hook',
      'ngf_bridge_terminal_activity() {',
      '  state="${1:-idle}"',
      '  reason="${2:-}"',
      '  if [ -z "${NGF_BRIDGE_ACTIVITY_URL:-}" ] || [ -z "${NGF_BRIDGE_ACTIVITY_TOKEN:-}" ] || [ -z "${NGF_BRIDGE_TERMINAL_ID:-}" ]; then',
      '    return 0',
      '  fi',
      '  if command -v curl >/dev/null 2>&1; then',
      '    curl -fsS -X POST "$NGF_BRIDGE_ACTIVITY_URL" -H "X-Activity-Token: $NGF_BRIDGE_ACTIVITY_TOKEN" -H "Content-Type: application/json" --data "{\"terminalId\":\"$NGF_BRIDGE_TERMINAL_ID\",\"state\":\"$state\",\"reason\":\"$reason\"}" >/dev/null 2>&1 || true',
      '  fi',
      '}',
      'ngf_bridge_terminal_working() { ngf_bridge_terminal_activity working ""; }',
      'ngf_bridge_terminal_idle() { ngf_bridge_terminal_activity idle "${1:-finished}"; }',
      ''
    ].join('\n');
  }

  resolveAllowedCwd(payload) {
    const requestedWorkspaceId = readString(payload, 'workspaceId', '');
    const requestedAgentId = readString(payload, 'agentId', '');
    const requestedSessionId = readString(payload, 'sessionId', '');
    const requestedCwd = normalizeCwd(readString(payload, 'cwd', readString(payload, 'workspacePath', '')));
    if (requestedAgentId.length > 0) {
      const scope = this.agentManager.validateResourceScope(requestedAgentId, payload, { write: true });
      if (scope.ok) {
        return { ok: true, cwd: scope.rootPath, workspaceId: scope.workspaceId, ownerAgentId: scope.agentId };
      }
      return scope;
    }
    if (requestedSessionId.length > 0) {
      const agent = this.agentManager.findBySessionId(requestedSessionId);
      if (agent && agent.rootPath.length > 0) {
        const scope = this.agentManager.validateResourceScope(agent.id, payload, { write: true });
        if (scope.ok) {
          return { ok: true, cwd: scope.rootPath, workspaceId: scope.workspaceId, ownerAgentId: scope.agentId };
        }
        return scope;
      }
    }
    const workspaces = this.workspaceRegistry.listWorkspaces();
    for (const workspace of workspaces) {
      if (!workspace || typeof workspace.cwd !== 'string') {
        continue;
      }
      const cwd = normalizeCwd(workspace.cwd);
      if (requestedWorkspaceId.length > 0 && workspace.workspaceId === requestedWorkspaceId) {
        return { ok: true, cwd, workspaceId: workspace.workspaceId, ownerAgentId: '' };
      }
      if (requestedCwd.length > 0 && requestedCwd === cwd) {
        return { ok: true, cwd, workspaceId: workspace.workspaceId, ownerAgentId: '' };
      }
    }
    if (requestedCwd.length === 0) {
      return { ok: false, message: 'Terminal cwd is required.' };
    }
    return { ok: false, message: 'Terminal cwd must belong to a trusted registered workspace or agent.' };
  }

  validateTerminalAccess(session, payload) {
    const ownerAgentId = session && typeof session.ownerAgentId === 'string' ? session.ownerAgentId : '';
    if (!session || ownerAgentId.length === 0) {
      return { ok: true };
    }
    const agentId = readString(payload, 'agentId', '');
    if (agentId.length === 0 || agentId !== ownerAgentId) {
      return {
        ok: false,
        code: 'agent_resource_scope_mismatch',
        message: 'Terminal belongs to another Agent resource scope.'
      };
    }
    return this.agentManager.validateResourceScope(agentId, {
      workspaceId: session.workspaceId,
      workspacePath: session.cwd
    }, { write: true });
  }

  publicTerminal(session) {
    return {
      terminalId: session.terminalId,
      id: session.terminalId,
      workspaceId: session.workspaceId,
      ownerAgentId: session.ownerAgentId,
      cwd: session.cwd,
      name: session.name,
      status: session.status,
      rows: session.rows,
      cols: session.cols,
      captureLength: session.captureText.length,
      captureBytes: session.captureByteLength,
      capturePersisted: session.capturePersisted,
      capturePath: session.capturePath,
      captureStatus: session.captureStatus || (session.capturePersisted === true ? 'persisted' : 'memory'),
      captureWarning: session.captureWarning || '',
      capturePersistedBytes: session.captureFileBytes || 0,
      capturePersistedAt: session.capturePersistedAt || 0,
      snapshotSeq: session.snapshotSeq,
      restoreSeq: session.restoreSeq || 0,
      snapshotMaxBytes: SNAPSHOT_MAX_BYTES,
      snapshotBytes: session.lastSnapshotBytes || 0,
      snapshotTruncated: session.lastSnapshotTruncated,
      snapshotSource: session.lastSnapshotSource || 'memory',
      snapshotPersistedBytes: session.lastSnapshotPersistedBytes || session.captureFileBytes || 0,
      snapshotWarning: session.lastSnapshotWarning || '',
      activity: session.activity,
      requiresAttention: session.requiresAttention,
      attentionReason: session.attentionReason,
      attentionAt: session.attentionAt,
      lastInputError: session.lastInputError || '',
      lastResizeError: session.lastResizeError || '',
      mouseMode: session.mouseMode || 'off',
      lastMouseAt: session.lastMouseAt || 0,
      lastMouseError: session.lastMouseError || '',
      killRequested: session.killRequested === true,
      processExitedAt: session.processExitedAt || 0,
      exitCode: session.exitCode || 0,
      exitSignal: session.exitSignal || '',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      hostname: os.hostname(),
      backend: session.backend || this.windowsBackend
    };
  }
}

module.exports = {
  TerminalManager,
  TerminalStreamOpcode,
  TerminalActivityState,
  TerminalAttentionReason,
  WINDOWS_BACKEND_CONPTY_DLL,
  WINDOWS_BACKEND_SYSTEM_CONPTY
};
