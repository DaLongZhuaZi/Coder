'use strict';

const {
  TerminalStreamOpcode,
  decodeBinaryFrame,
  decodeTerminalSnapshotPayload
} = require('../src/binary-frames');
const { TerminalManager } = require('../src/terminal-manager');

function main() {
  const manager = new TerminalManager({
    workspaceRegistry: null,
    agentManager: null,
    managedProcessLedger: { remove() {} },
    daemonStore: null,
    ptyFactory: { spawn() {} },
    broadcast() {}
  });
  const session = createFakeSession();
  manager.terminals.set(session.terminalId, session);

  const first = createConnection('first');
  const firstSubscription = manager.subscribe(first, {
    terminalId: session.terminalId,
    streamProtocolVersion: 2
  });
  assert(firstSubscription.slot === 1, 'initial subscription should allocate slot 1');
  assert(firstSubscription.restoreSeq === 1, 'initial subscription should prepare one restore');
  manager.sendRestore(first, session.terminalId);
  assert(snapshotText(first.frames[0]) === 'alpha', 'initial restore should contain the capture');

  session.captureText = 'alpha\nbeta';
  session.captureByteLength = Buffer.byteLength(session.captureText, 'utf8');
  session.snapshotSeq = 2;
  manager.flushOutput(session, [Buffer.from('\nbeta', 'utf8')]);
  assert(frameText(first.frames[1]) === '\nbeta', 'live output should use the subscribed connection');
  manager.detachConnection(first);
  assert(session.subscribers.size === 0, 'disconnect should remove the old subscriber');
  assert(first.terminalSlots.size === 0 && first.terminalSubscriptions.size === 0, 'disconnect should remove old slot mappings');

  session.captureText = 'alpha\nbeta\ngamma';
  session.captureByteLength = Buffer.byteLength(session.captureText, 'utf8');
  session.snapshotSeq = 3;
  session.requiresAttention = true;
  session.attentionReason = 'needs_input';
  session.attentionAt = Date.now();

  const second = createConnection('second');
  const resumed = manager.subscribe(second, {
    terminalId: session.terminalId,
    streamProtocolVersion: 2,
    lastAppliedRestoreSeq: firstSubscription.restoreSeq,
    lastAppliedSnapshotSeq: 2,
    preserveAttention: true
  });
  assert(resumed.slot === 1, 'a new connection should receive a connection-local slot');
  assert(resumed.restoreSeq === 2 && resumed.snapshotSeq === 3, 'reconnect should advance restore sequence at the current snapshot');
  assert(resumed.terminal.requiresAttention === true, 'reconnect should preserve terminal attention');
  manager.sendRestore(second, session.terminalId);
  const restored = decodeSnapshot(second.frames[0]);
  assert(restored.text === 'alpha\nbeta\ngamma', 'reconnect restore should include output produced while disconnected');
  assert(restored.restoreSeq === 2 && restored.snapshotSeq === 3, 'reconnect frame should carry matching sequences');

  const duplicate = manager.subscribe(second, {
    terminalId: session.terminalId,
    streamProtocolVersion: 2,
    preserveAttention: true
  });
  assert(duplicate.reused === true && duplicate.slot === resumed.slot, 'duplicate subscribe should reuse the current slot');
  assert(session.subscribers.size === 1, 'duplicate subscribe must not add another subscriber');
  manager.sendRestore(second, session.terminalId);
  assert(decodeSnapshot(second.frames[1]).restoreSeq === 3, 'duplicate restore should remain sequenced and replaceable');

  const inputHandled = manager.handleBinaryFrame(second, {
    opcode: TerminalStreamOpcode.INPUT,
    slot: resumed.slot,
    payload: Buffer.from('dir\r', 'utf8')
  });
  const resizeHandled = manager.handleBinaryFrame(second, {
    opcode: TerminalStreamOpcode.RESIZE,
    slot: resumed.slot,
    payload: Buffer.from('{"rows":30,"cols":120}', 'utf8')
  });
  const mouseHandled = manager.handleBinaryFrame(second, {
    opcode: TerminalStreamOpcode.MOUSE,
    slot: resumed.slot,
    payload: Buffer.from('\u001b[M', 'utf8')
  });
  assert(inputHandled && resizeHandled && mouseHandled, 'input, resize and mouse should work after reconnect');
  assert(session.writes.length === 2, 'input and mouse should reach the same terminal process');
  assert(session.rows === 30 && session.cols === 120, 'resize should update the resumed terminal');

  session.captureText = '';
  session.captureByteLength = 0;
  session.capturePath = '';
  session.snapshotSeq = 4;
  const emptyConnection = createConnection('empty');
  manager.subscribe(emptyConnection, { terminalId: session.terminalId, streamProtocolVersion: 2 });
  manager.sendRestore(emptyConnection, session.terminalId);
  assert(emptyConnection.frames.length === 1, 'empty capture should still send a restore frame');
  assert(decodeSnapshot(emptyConnection.frames[0]).text === '', 'empty restore should clear stale client text');

  manager.detachConnection(second);
  manager.detachConnection(emptyConnection);
  assert(session.subscribers.size === 0, 'reconnect smoke should leave no subscribers');
  console.log('terminal reconnect smoke passed');
}

function createConnection(connectionId) {
  return {
    connectionId,
    terminalSlots: new Map(),
    terminalSubscriptions: new Map(),
    frames: [],
    sendBinary(frame) {
      this.frames.push(Buffer.from(frame));
    },
    sendJson() {}
  };
}

function createFakeSession() {
  const writes = [];
  return {
    terminalId: 'term-reconnect',
    workspaceId: 'workspace-reconnect',
    ownerAgentId: '',
    backend: 'mock',
    cwd: process.cwd(),
    name: 'Reconnect Smoke',
    status: 'running',
    rows: 24,
    cols: 80,
    process: {
      write(value) { writes.push(value); },
      resize(cols, rows) { this.cols = cols; this.rows = rows; },
      kill() {}
    },
    ledgerId: '',
    captureText: 'alpha',
    captureByteLength: 5,
    capturePath: '',
    capturePersisted: false,
    captureStatus: 'memory',
    captureWarning: '',
    captureFileBytes: 0,
    capturePersistedAt: 0,
    snapshotSeq: 1,
    restoreSeq: 0,
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
    activity: 'idle',
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
    writes,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function decodeSnapshot(frame) {
  const decoded = decodeBinaryFrame(frame);
  assert(decoded && decoded.kind === 'terminal', 'snapshot frame should decode as terminal data');
  const snapshot = decodeTerminalSnapshotPayload(decoded.frame.payload);
  assert(snapshot !== null, 'snapshot frame should contain the V2 envelope');
  return snapshot;
}

function snapshotText(frame) {
  return decodeSnapshot(frame).text;
}

function frameText(frame) {
  const decoded = decodeBinaryFrame(frame);
  assert(decoded && decoded.kind === 'terminal', 'output frame should decode');
  return decoded.frame.payload.toString('utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main();
