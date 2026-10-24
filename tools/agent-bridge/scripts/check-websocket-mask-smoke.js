'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { maskPayload } = require('../src/websocket-mask');
const { encodeFrame, WebSocketFramePeer } = require('../src/websocket-client');
const { WebSocketConnection } = require('../src/websocket');

function referenceMask(source, mask) {
  return Buffer.from(source.map((value, index) => value ^ mask[index % 4]));
}

function payloadBytes(length) {
  return Buffer.from(Array.from({ length }, (_, index) => (index * 73 + 19) & 255));
}

function maskedBinaryFrame(payload) {
  const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x82, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 0xfe;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 0xff;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, mask, referenceMask(payload, mask)]);
}

class MemorySocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
  }

  write() { return true; }
  end() { this.destroy(); }
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

test('masks the RFC 6455 Hello vector without modifying its input or key', () => {
  const source = Buffer.from('Hello');
  const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  const target = Buffer.alloc(5);
  maskPayload(source, mask, target);
  assert.equal(target.toString('hex'), '7f9f4d5158');
  assert.equal(source.toString(), 'Hello');
  assert.equal(mask.toString('hex'), '37fa213d');
  maskPayload(target, mask);
  assert.equal(target.toString(), 'Hello');
});

test('preserves every byte value, mask order and all short remainders', () => {
  for (const mask of [Buffer.alloc(4), Buffer.alloc(4, 255), Buffer.from([0x80, 1, 0xfe, 0x47])]) {
    for (const length of [0, 1, 2, 3, 4, 5, 7, 15, 16, 17, 31, 32, 33, 63, 64, 65, 255, 256, 257, 511, 512, 513, 514, 515, 65539]) {
      const source = payloadBytes(length);
      const expected = referenceMask(source, mask);
      const target = Buffer.alloc(length + 5, 0xa5);
      maskPayload(source, mask, target, 3);
      assert.deepEqual(target.subarray(3, 3 + length), expected, 'length=' + length);
      assert.deepEqual(target.subarray(0, 3), Buffer.alloc(3, 0xa5));
      assert.deepEqual(target.subarray(3 + length), Buffer.alloc(2, 0xa5));
    }
  }
});

test('addresses Buffer subarrays at arbitrary source, mask and output alignment', () => {
  for (let alignment = 0; alignment < 8; alignment += 1) {
    const backing = Buffer.alloc(524, 0xcc);
    const source = backing.subarray(alignment, alignment + 513);
    payloadBytes(source.length).copy(source);
    const mask = Buffer.from([99, 0x37, 0xfa, 0x21, 0x3d, 99]).subarray(1, 5);
    const before = Buffer.from(backing);
    const expected = referenceMask(source, mask);
    const targetBacking = Buffer.alloc(530, 0xa5);
    const target = targetBacking.subarray(alignment + 1, alignment + 518);
    maskPayload(source, mask, target, 2);
    assert.deepEqual(target.subarray(2, 515), expected);
    assert.deepEqual(backing, before);
    assert.deepEqual(targetBacking.subarray(0, alignment + 3), Buffer.alloc(alignment + 3, 0xa5));
    assert.deepEqual(targetBacking.subarray(alignment + 516), Buffer.alloc(530 - alignment - 516, 0xa5));
    maskPayload(source, mask);
    assert.deepEqual(source, expected);
    assert.deepEqual(backing.subarray(0, alignment), before.subarray(0, alignment));
    assert.deepEqual(backing.subarray(alignment + 513), before.subarray(alignment + 513));
  }
});

test('handles partially overlapping outputs in both directions', () => {
  const mask = Buffer.from([0x80, 0xff, 0x01, 0x47]);
  for (const length of [0, 1, 3, 4, 5, 511, 512, 513]) {
    for (const delta of [-5, -1, 0, 1, 5]) {
      const backing = payloadBytes(600);
      const source = backing.subarray(10, 10 + length);
      const expected = Buffer.from(backing);
      referenceMask(source, mask).copy(expected, 10 + delta);
      maskPayload(source, mask, backing.subarray(2), 8 + delta);
      assert.deepEqual(backing, expected, 'length=' + length + ', delta=' + delta);
    }
  }
});

test('validates buffers and output ranges before writing any bytes', () => {
  const source = payloadBytes(9);
  const mask = Buffer.from([1, 2, 3, 4]);
  const target = Buffer.alloc(12, 0xa5);
  for (const offset of [-1, 4, 0.5, NaN, Infinity]) {
    assert.throws(() => maskPayload(source, mask, target, offset), RangeError);
    assert.deepEqual(target, Buffer.alloc(12, 0xa5));
  }
  for (const badMask of [Buffer.alloc(0), Buffer.alloc(3), Buffer.alloc(5)]) {
    assert.throws(() => maskPayload(source, badMask, target), RangeError);
  }
  assert.throws(() => maskPayload('text', mask, target), TypeError);
  assert.throws(() => maskPayload(source, [1, 2, 3, 4], target), TypeError);
  assert.throws(() => maskPayload(source, mask, new Uint8Array(12)), TypeError);
  maskPayload(Buffer.alloc(0), mask, target, target.length);
  assert.deepEqual(target, Buffer.alloc(12, 0xa5));
});

for (const length of [0, 1, 3, 4, 31, 32, 33, 125, 126, 255, 256, 257, 511, 512, 513, 65535, 65536, 262144]) {
  test('encodes masked binary frames byte-for-byte at payload length ' + length, () => {
    const source = payloadBytes(length);
    const before = Buffer.from(source);
    const encoded = encodeFrame(2, source, { masked: true });
    assert.equal(encoded[0], 0x82);
    assert.equal(encoded[1] & 0x80, 0x80);
    const marker = encoded[1] & 0x7f;
    const headerBytes = marker === 127 ? 10 : marker === 126 ? 4 : 2;
    const decodedLength = marker === 127 ? Number(encoded.readBigUInt64BE(2))
      : marker === 126 ? encoded.readUInt16BE(2) : marker;
    assert.equal(decodedLength, length);
    const mask = encoded.subarray(headerBytes, headerBytes + 4);
    assert.deepEqual(encoded.subarray(headerBytes + 4), referenceMask(source, mask));
    assert.deepEqual(source, before);
    assert.equal(encoded.length, headerBytes + 4 + length);
  });

  test('both WebSocket receivers decode independently masked split frames at length ' + length, () => {
    const expected = payloadBytes(length);
    const frame = maskedBinaryFrame(expected);
    const before = Buffer.from(frame);
    const received = [[], []];
    const sockets = [new MemorySocket(), new MemorySocket()];
    const peer = new WebSocketFramePeer(sockets[0], { requireMaskedIncoming: true });
    peer.on('binary', (value) => received[0].push(value));
    const connection = new WebSocketConnection(sockets[1], {
      onBinary: (value) => received[1].push(value)
    });
    const cuts = [0, 1, 3, Math.min(14, frame.length), frame.length].sort((left, right) => left - right);
    for (let index = 1; index < cuts.length; index += 1) {
      const chunk = frame.subarray(cuts[index - 1], cuts[index]);
      sockets[0].emit('data', chunk);
      sockets[1].emit('data', chunk);
    }
    assert.deepEqual(received, [[expected], [expected]]);
    assert.deepEqual(frame, before, 'receivers must not mutate caller buffers');
    peer.terminate();
    connection.close();
  });
}
