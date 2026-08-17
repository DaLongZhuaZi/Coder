'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/web/terminal-stream-state.js'), 'utf8');
const context = {
  ArrayBuffer,
  DataView,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  window: {}
};
vm.runInNewContext(source, context, { filename: 'terminal-stream-state.js' });
const stream = context.window.AgentBridgeWebTerminalStream;
assert.ok(stream, 'terminal stream state API should be exposed');

const state = stream.createState();
stream.beginSubscribe(state, { restoreSeq: 4, snapshotSeq: 7 });
assert.strictEqual(stream.acceptOutput(state), false, 'V2 deltas must wait for the authoritative restore');

const payload = new Uint8Array(13 + 11);
payload.set([78, 71, 70, 50], 0);
new DataView(payload.buffer).setUint32(4, 4);
new DataView(payload.buffer).setUint32(8, 7);
payload[12] = 0x02;
payload.set(new TextEncoder().encode('hello world'), 13);
const snapshot = stream.decodeSnapshot(payload);
assert.strictEqual(snapshot.version, 2, 'NGF2 snapshots should expose V2 metadata');
assert.strictEqual(snapshot.restoreSeq, 4, 'restore sequence should be decoded');
assert.strictEqual(snapshot.snapshotSeq, 7, 'snapshot sequence should be decoded');
assert.strictEqual(snapshot.source, 'persisted', 'persisted flag should be decoded');
assert.strictEqual(stream.acceptSnapshot(state, snapshot), true, 'expected restore should be accepted');
assert.strictEqual(stream.acceptOutput(state), true, 'deltas should resume after restore');
assert.strictEqual(stream.acceptSnapshot(state, snapshot), false, 'duplicate restore should be ignored');

const stale = Object.assign({}, snapshot, { restoreSeq: 3, snapshotSeq: 6 });
stream.beginSnapshotRequest(state);
assert.strictEqual(stream.acceptSnapshot(state, stale), false, 'older restore should never replace current output');

const current = Object.assign({}, snapshot, { restoreSeq: 5, snapshotSeq: 8, text: 'new output' });
assert.strictEqual(stream.acceptSnapshot(state, current), true, 'newer restore should replace current output');
stream.reset(state);
assert.strictEqual(state.awaitingRestore, false, 'reset should end an old stream epoch');
assert.strictEqual(state.restoreSeq, 0, 'reset should clear sequence state');

const legacy = stream.decodeSnapshot(new TextEncoder().encode('legacy output'));
assert.strictEqual(legacy.version, 1, 'legacy snapshots should remain readable');
assert.strictEqual(legacy.text, 'legacy output', 'legacy snapshot text should be preserved');

console.log('web terminal stream smoke ok');
