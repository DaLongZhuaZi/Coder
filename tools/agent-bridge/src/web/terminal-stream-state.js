(() => {
  'use strict';

  const SNAPSHOT_HEADER_BYTES = 13;
  const SNAPSHOT_MAGIC = [78, 71, 70, 50];

  function finiteSequence(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
    return Math.min(0xffffffff, Math.floor(value));
  }

  function bytesFrom(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(0);
  }

  function createState() {
    return {
      epoch: 0,
      snapshotSeq: 0,
      restoreSeq: 0,
      expectedSnapshotSeq: 0,
      expectedRestoreSeq: 0,
      awaitingRestore: false
    };
  }

  function reset(state) {
    state.epoch += 1;
    state.snapshotSeq = 0;
    state.restoreSeq = 0;
    state.expectedSnapshotSeq = 0;
    state.expectedRestoreSeq = 0;
    state.awaitingRestore = false;
    return state;
  }

  function beginSubscribe(state, result) {
    state.expectedSnapshotSeq = finiteSequence(result && result.snapshotSeq);
    state.expectedRestoreSeq = finiteSequence(result && result.restoreSeq);
    state.awaitingRestore = true;
    return state;
  }

  function beginSnapshotRequest(state) {
    state.expectedSnapshotSeq = 0;
    state.expectedRestoreSeq = 0;
    state.awaitingRestore = true;
    return state;
  }

  function decodeSnapshot(value) {
    const bytes = bytesFrom(value);
    if (bytes.length >= SNAPSHOT_HEADER_BYTES &&
      SNAPSHOT_MAGIC[0] === bytes[0] && SNAPSHOT_MAGIC[1] === bytes[1] &&
      SNAPSHOT_MAGIC[2] === bytes[2] && SNAPSHOT_MAGIC[3] === bytes[3]) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const flags = bytes[12];
      return {
        version: 2,
        restoreSeq: view.getUint32(4),
        snapshotSeq: view.getUint32(8),
        truncated: (flags & 0x01) !== 0,
        source: (flags & 0x02) !== 0 ? 'persisted' : 'memory',
        text: new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(SNAPSHOT_HEADER_BYTES))
      };
    }
    return {
      version: 1,
      restoreSeq: 0,
      snapshotSeq: 0,
      truncated: false,
      source: 'legacy',
      text: new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    };
  }

  function acceptSnapshot(state, snapshot) {
    if (!snapshot || typeof snapshot.text !== 'string') return false;
    const restoreSeq = finiteSequence(snapshot.restoreSeq);
    const snapshotSeq = finiteSequence(snapshot.snapshotSeq);
    if (state.expectedRestoreSeq > 0 && restoreSeq > 0 && restoreSeq < state.expectedRestoreSeq) return false;
    if (restoreSeq > 0 && state.restoreSeq > 0 && restoreSeq < state.restoreSeq) return false;
    if (snapshotSeq > 0 && state.snapshotSeq > 0 && snapshotSeq < state.snapshotSeq) return false;
    if (!state.awaitingRestore && restoreSeq > 0 && restoreSeq === state.restoreSeq && snapshotSeq === state.snapshotSeq) return false;
    state.restoreSeq = Math.max(state.restoreSeq, restoreSeq);
    state.snapshotSeq = Math.max(state.snapshotSeq, snapshotSeq);
    state.expectedRestoreSeq = 0;
    state.expectedSnapshotSeq = 0;
    state.awaitingRestore = false;
    return true;
  }

  function acceptOutput(state) {
    return state.awaitingRestore !== true;
  }

  window.AgentBridgeWebTerminalStream = Object.freeze({
    createState,
    reset,
    beginSubscribe,
    beginSnapshotRequest,
    decodeSnapshot,
    acceptSnapshot,
    acceptOutput
  });
})();
