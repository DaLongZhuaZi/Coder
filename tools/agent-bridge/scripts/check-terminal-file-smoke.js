'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const {
  TerminalStreamOpcode,
  decodeBinaryFrame,
  encodeFileBeginFrame,
  encodeFileChunkFrame,
  encodeFileEndFrame
} = require('../src/binary-frames');
const { createDaemonStore } = require('../src/daemon-store');
const { FileTransferManager } = require('../src/file-transfer-manager');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');
const { TerminalManager } = require('../src/terminal-manager');
const { WorkspaceRegistry } = require('../src/workspace-registry');

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-agent-bridge-io-smoke-'));
  try {
    const store = createDaemonStore(path.join(tempRoot, 'bridge-home'));
    const workspaceRoot = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'input.bin'), Buffer.from('hello binary transfer\n'), 'utf8');

    const workspaceRegistry = new WorkspaceRegistry(store);
    const workspace = workspaceRegistry.upsertWorkspace({
      cwd: workspaceRoot,
      title: 'IO Smoke',
      dedupeByCwd: true
    });
    const agentManager = new AgentManager({ store, workspaceRegistry });
    const ledger = new ManagedProcessLedger(store);
    const events = [];
    const manager = new FileTransferManager({
      registry: createRegistry(workspaceRoot),
      workspaceRegistry,
      agentManager,
      broadcast(message) {
        events.push(message);
      }
    });

    const downloadConnection = createFakeConnection();
    const downloadResult = await manager.download(downloadConnection, {
      requestId: 'download-smoke',
      workspaceId: workspace.workspaceId,
      path: 'input.bin'
    });
    assert(downloadResult.accepted === true, 'download should be accepted');
    await waitForFrame(downloadConnection, 'download-smoke', 'end');
    const downloadPayload = collectDownloadPayload(downloadConnection.frames);
    assert(downloadPayload.toString('utf8') === 'hello binary transfer\n', 'download chunks should match file content');

    const uploadContent = Buffer.from('uploaded content\n', 'utf8');
    const uploadSha = crypto.createHash('sha256').update(uploadContent).digest('hex');
    const uploadConnection = createFakeConnection();
    const uploadResult = manager.upload(uploadConnection, {
      requestId: 'upload-smoke',
      workspaceId: workspace.workspaceId,
      path: 'nested/output.bin',
      sizeBytes: uploadContent.length,
      sha256: uploadSha
    });
    assert(uploadResult.accepted === true, 'upload should be accepted');
    const completion = waitForEvent(events, 'file.transfer.completed', 'upload-smoke');
    manager.handleBinaryFrame(uploadConnection, decodeBinaryFrame(encodeFileBeginFrame('upload-smoke', {
      path: 'nested/output.bin',
      sizeBytes: uploadContent.length,
      sha256: uploadSha
    })).frame);
    manager.handleBinaryFrame(uploadConnection, decodeBinaryFrame(encodeFileChunkFrame('upload-smoke', uploadContent)).frame);
    manager.handleBinaryFrame(uploadConnection, decodeBinaryFrame(encodeFileEndFrame('upload-smoke')).frame);
    await completion;
    const uploaded = fs.readFileSync(path.join(workspaceRoot, 'nested', 'output.bin'));
    assert(uploaded.equals(uploadContent), 'uploaded file should match chunk content');

    const terminalManager = new TerminalManager({
      workspaceRegistry,
      agentManager,
      managedProcessLedger: ledger,
      daemonStore: store,
      broadcast(message) {
        events.push(message);
      }
    });
    const checkpointCapturePath = path.join(tempRoot, 'checkpoint-terminal.log');
    terminalManager.terminals.set('term-checkpoint', {
      terminalId: 'term-checkpoint',
      workspaceId: workspace.workspaceId,
      ownerAgentId: 'agent-checkpoint',
      cwd: workspaceRoot,
      name: 'Checkpoint terminal',
      status: 'running',
      rows: 24,
      cols: 80,
      captureText: 'before checkpoint',
      captureByteLength: 17,
      capturePath: checkpointCapturePath,
      capturePersisted: false,
      captureFileBytes: 0,
      capturePersistedAt: 0,
      captureWarning: '',
      snapshotSeq: 1,
      restoreSeq: 0,
      subscribers: new Map(),
      updatedAt: Date.now()
    });
    const terminalCheckpoint = terminalManager.captureCheckpoint('agent-checkpoint');
    assert(terminalCheckpoint.status === 'captured', 'terminal checkpoint should capture owned transcript');
    terminalManager.terminals.get('term-checkpoint').captureText = 'after checkpoint';
    const terminalRestore = terminalManager.restoreCheckpoint('agent-checkpoint', terminalCheckpoint.token);
    assert(terminalRestore.restored === true, 'terminal checkpoint should restore owned transcript');
    assert(terminalManager.terminals.get('term-checkpoint').captureText === 'before checkpoint', 'terminal checkpoint should restore captured text');
    terminalManager.terminals.delete('term-checkpoint');
    terminalManager.setActivityBaseUrl('http://127.0.0.1:49321');
    const hookBefore = terminalManager.hookStatus({});
    assert(hookBefore.available === true, 'terminal hook status should be available with daemon store');
    const hookPreview = terminalManager.installHook({ action: 'preview' });
    assert(hookPreview.confirmRequired === false, 'terminal hook preview should not require confirm');
    assert(Array.isArray(hookPreview.plannedProfileEdits) && hookPreview.plannedProfileEdits.length > 0, 'terminal hook preview should expose planned profile edits');
    assert(!fs.existsSync(store.terminalHookFilePath('ngf-terminal-hook.ps1')), 'terminal hook preview should not write powershell hook');
    assert(!fs.existsSync(store.terminalHookFilePath('ngf-terminal-hook.sh')), 'terminal hook preview should not write posix hook');
    const hookInstalled = terminalManager.installHook({});
    assert(hookInstalled.installed === true, 'terminal hook install should write hook scripts');
    assert(hookInstalled.confirmRequired === true, 'terminal hook install without confirm should require explicit profile confirmation');
    assert(fs.existsSync(store.terminalHookFilePath('ngf-terminal-hook.ps1')), 'powershell hook should exist');
    assert(fs.existsSync(store.terminalHookFilePath('ngf-terminal-hook.sh')), 'posix hook should exist');

    const captureSession = createFakeTerminalSession(store, workspace.workspaceId, workspaceRoot, 'term-smoke-capture');
    terminalManager.terminals.set(captureSession.terminalId, captureSession);
    const captureChunk = Buffer.from('hello persisted terminal capture\n', 'utf8');
    captureSession.captureText = captureChunk.toString('utf8');
    captureSession.captureByteLength = captureChunk.length;
    captureSession.snapshotSeq = 1;
    terminalManager.persistCapture(captureSession, captureChunk, false);
    assert(captureSession.capturePersisted === true, 'terminal capture should be marked persisted');
    assert(captureSession.captureStatus === 'persisted', 'terminal capture should expose persisted status');
    assert(fs.readFileSync(captureSession.capturePath, 'utf8') === captureChunk.toString('utf8'), 'terminal capture file should match capture text');
    captureSession.captureText = '';
    captureSession.captureByteLength = 0;
    const snapshot = terminalManager.snapshotPayload(captureSession);
    assert(snapshot.text === captureChunk.toString('utf8'), 'terminal snapshot should include current capture text');
    assert(snapshot.truncated === false, 'small terminal snapshot should not be truncated');
    assert(snapshot.source === 'persisted', 'empty memory snapshot should fall back to persisted capture');
    assert(snapshot.persistedBytes === captureChunk.length, 'snapshot should expose persisted byte count');
    assert(snapshot.restoreSeq === 1, 'snapshot should increment restore sequence');
    assert(terminalManager.publicTerminal(captureSession).snapshotBytes === captureChunk.length, 'public terminal should expose last snapshot byte count');
    const snapshotConnection = createFakeConnection();
    snapshotConnection.terminalSlots = new Map([[7, captureSession.terminalId]]);
    snapshotConnection.terminalSubscriptions = new Map([[captureSession.terminalId, 7]]);
    terminalManager.sendRestore(snapshotConnection, captureSession.terminalId);
    assert(snapshotConnection.frames.length === 1, 'terminal restore should be sent from persisted capture');
    const decodedRestore = decodeBinaryFrame(snapshotConnection.frames[0]);
    assert(decodedRestore.frame.opcode === TerminalStreamOpcode.RESTORE, 'restore response should use RESTORE opcode');
    assert(decodedRestore.frame.payload.toString('utf8') === captureChunk.toString('utf8'), 'restore payload should match persisted capture');
    const snapshotHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.SNAPSHOT,
      slot: 7,
      payload: Buffer.alloc(0)
    });
    assert(snapshotHandled === true, 'terminal snapshot frame should be handled');
    const decodedSnapshot = decodeBinaryFrame(snapshotConnection.frames[1]);
    assert(decodedSnapshot.kind === 'terminal', 'snapshot response should be a terminal frame');
    assert(decodedSnapshot.frame.opcode === TerminalStreamOpcode.SNAPSHOT, 'snapshot response should use SNAPSHOT opcode');
    assert(decodedSnapshot.frame.payload.toString('utf8') === captureChunk.toString('utf8'), 'snapshot payload should match capture text');
    const memoryLarge = 'm'.repeat(300 * 1024);
    const persistedLarge = 'p'.repeat(300 * 1024);
    captureSession.captureText = memoryLarge;
    captureSession.captureByteLength = Buffer.byteLength(memoryLarge, 'utf8');
    fs.writeFileSync(captureSession.capturePath, persistedLarge, 'utf8');
    captureSession.captureFileBytes = Buffer.byteLength(persistedLarge, 'utf8');
    const truncatedSnapshot = terminalManager.snapshotPayload(captureSession);
    assert(truncatedSnapshot.source === 'persisted', 'truncated memory snapshot should fall back to persisted tail');
    assert(truncatedSnapshot.truncated === true, 'persisted tail snapshot should report truncation');
    assert(truncatedSnapshot.text.indexOf('p') === 0, 'persisted tail snapshot should come from persisted capture');
    const badCaptureSession = createFakeTerminalSession(store, workspace.workspaceId, workspaceRoot, 'term-smoke-capture-bad');
    badCaptureSession.capturePath = workspaceRoot;
    terminalManager.terminals.set(badCaptureSession.terminalId, badCaptureSession);
    terminalManager.persistCapture(badCaptureSession, Buffer.from('bad capture\n', 'utf8'), false);
    assert(badCaptureSession.captureStatus === 'error', 'capture persist failure should expose error status');
    assert(badCaptureSession.captureWarning.length > 0, 'capture persist failure should expose warning text');
    const badCapture = terminalManager.capture({ terminalId: badCaptureSession.terminalId });
    assert(badCapture.persistence.warning.length > 0, 'capture response should include persistence warning');
    const mouseHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.MOUSE,
      slot: 7,
      payload: Buffer.from('\u001b[M', 'utf8')
    });
    assert(mouseHandled === true, 'terminal mouse frame should be handled');
    assert(captureSession.writes.length === 1 && captureSession.writes[0] === '\u001b[M', 'mouse payload should be written to terminal process');
    assert(terminalManager.publicTerminal(captureSession).mouseMode === 'raw', 'raw mouse payload should expose raw mouse mode');
    const sgrMouseHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.MOUSE,
      slot: 7,
      payload: Buffer.from('\u001b[?1000h\u001b[?1002h\u001b[?1006h', 'utf8')
    });
    assert(sgrMouseHandled === true, 'terminal mouse SGR mode frame should be handled');
    assert(terminalManager.publicTerminal(captureSession).mouseMode === 'sgr', 'terminal mouse mode should be inferred from SGR enable sequence');
    const mouseOffHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.MOUSE,
      slot: 7,
      payload: Buffer.from('\u001b[?9l\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l', 'utf8')
    });
    assert(mouseOffHandled === true, 'terminal mouse disable frame should be handled');
    assert(terminalManager.publicTerminal(captureSession).mouseMode === 'off', 'terminal mouse mode should return to off after disable sequence');
    const resizeHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.RESIZE,
      slot: 7,
      payload: Buffer.from('{"rows":30,"cols":120}', 'utf8')
    });
    assert(resizeHandled === true, 'terminal resize frame should be handled');
    assert(captureSession.rows === 30 && captureSession.cols === 120, 'terminal resize should update public dimensions');
    const invalidResizeHandled = terminalManager.handleBinaryFrame(snapshotConnection, {
      opcode: TerminalStreamOpcode.RESIZE,
      slot: 7,
      payload: Buffer.from('{"rows":2,"cols":10}', 'utf8')
    });
    assert(invalidResizeHandled === false, 'invalid terminal resize should be rejected');
    assert(captureSession.lastResizeError === 'terminal_resize_out_of_bounds', 'invalid resize should expose structured resize error');
    const working = terminalManager.reportActivity({
      terminalId: captureSession.terminalId,
      state: 'working'
    });
    assert(working.terminal.activity === 'working', 'terminal activity should enter working state');
    const needsInput = terminalManager.reportActivity({
      terminalId: captureSession.terminalId,
      state: 'idle',
      reason: 'needs_input'
    });
    assert(needsInput.terminal.requiresAttention === true && needsInput.terminal.attentionReason === 'needs_input', 'terminal activity should raise needs_input attention');
    const cleared = terminalManager.reportActivity({
      terminalId: captureSession.terminalId,
      state: 'working'
    });
    assert(cleared.terminal.requiresAttention === false, 'terminal working activity should clear attention');

    if (!terminalManager.isAvailable()) {
      const unavailable = terminalManager.create({ workspaceId: workspace.workspaceId });
      assert(unavailable.code === 'terminal_unavailable', 'terminal should degrade when node-pty is missing');
    } else {
      const created = terminalManager.create({ workspaceId: workspace.workspaceId, rows: 12, cols: 80 });
      assert(created.terminal && created.terminal.terminalId.length > 0, 'terminal should be created when node-pty is available');
      const killed = terminalManager.kill({ terminalId: created.terminal.terminalId });
      assert(killed.killed === true, 'terminal should be killable');
      const processExited = await waitForCondition(() => {
        const listed = terminalManager.list({}).terminals;
        const terminal = listed.find((item) => item.terminalId === created.terminal.terminalId);
        return !!terminal && terminal.processExitedAt > 0;
      }, 5000);
      assert(processExited, 'terminal kill should settle the underlying pty process');
    }

    console.log('terminal/file io smoke passed');
  } finally {
    await removeTempDirectory(tempRoot);
  }
}

function createRegistry(workspaceRoot) {
  return {
    findSession(sessionId) {
      if (sessionId === 'session-smoke') {
        return {
          provider: { id: 'mock' },
          session: {
            sessionId,
            workspacePath: workspaceRoot
          }
        };
      }
      return null;
    }
  };
}

function createFakeConnection() {
  return {
    frames: [],
    sendBinary(payload) {
      this.frames.push(Buffer.from(payload));
    },
    sendJson(_payload) {
    }
  };
}

function createFakeTerminalSession(store, workspaceId, cwd, terminalId) {
  const writes = [];
  const resizes = [];
  return {
    terminalId,
    workspaceId,
    cwd,
    name: 'Capture Smoke',
    status: 'running',
    rows: 24,
    cols: 80,
    process: {
      write(value) {
        writes.push(value);
      },
      resize(cols, rows) {
        resizes.push({ cols, rows });
      },
      kill() {
      }
    },
    ledgerId: '',
    captureText: '',
    captureByteLength: 0,
    capturePath: store.terminalCaptureFilePath(terminalId),
    capturePersisted: false,
    captureStatus: 'ready',
    captureWarning: '',
    captureFileBytes: 0,
    capturePersistedAt: 0,
    lastCapturePersistedEventAt: 0,
    lastCaptureWarningEventAt: 0,
    snapshotSeq: 0,
    restoreSeq: 0,
    snapshotMaxBytes: 256 * 1024,
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
    writes,
    resizes,
    subscribers: new Map(),
    pendingOutput: [],
    flushTimer: null,
    lastFlushAt: 0,
    activity: 'unknown',
    workingSince: 0,
    lastOutputAt: 0,
    lastInputAt: 0,
    idleTimer: null,
    requiresAttention: false,
    attentionReason: '',
    attentionAt: 0,
    killRequested: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function collectDownloadPayload(frames) {
  const chunks = [];
  for (const frame of frames) {
    const decoded = decodeBinaryFrame(frame);
    if (decoded && decoded.kind === 'file_transfer' && decoded.frame.opcode === 0x11) {
      chunks.push(decoded.frame.payload);
    }
  }
  return Buffer.concat(chunks);
}

function waitForFrame(connection, requestId, target) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      for (const frame of connection.frames) {
        const decoded = decodeBinaryFrame(frame);
        if (!decoded || decoded.kind !== 'file_transfer' || decoded.frame.requestId !== requestId) {
          continue;
        }
        if (target === 'end' && decoded.frame.opcode === 0x12) {
          clearInterval(timer);
          resolve(decoded.frame);
          return;
        }
      }
      if (Date.now() - startedAt > 5000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for frame: ' + target));
      }
    }, 10);
  });
}

function waitForEvent(events, eventName, requestId) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      for (const event of events) {
        if (!event || event.event !== eventName || !event.payload) {
          continue;
        }
        if (event.payload.requestId === requestId) {
          clearInterval(timer);
          resolve(event);
          return;
        }
      }
      if (Date.now() - startedAt > 5000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for event: ' + eventName));
      }
    }, 10);
  });
}

function waitForCondition(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve(false);
      }
    }, 20);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function removeTempDirectory(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp + path.sep)) {
    throw new Error('refusing to remove path outside temp directory: ' + resolvedTarget);
  }
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const retryable = error && (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'ENOTEMPTY');
      if (!retryable) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 + attempt * 50));
    }
  }
  throw lastError;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
