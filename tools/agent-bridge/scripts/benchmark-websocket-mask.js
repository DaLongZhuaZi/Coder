'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { maskPayload } = require('../src/websocket-mask');
const { encodeFrame } = require('../src/websocket-client');

function baselineMask(source, mask, target, offset = 0) {
  for (let index = 0; index < source.length; index += 1) {
    target[offset + index] = source[index] ^ mask[index % 4];
  }
}

function baselineEncodeFrame(opcode, payload, options) {
  const source = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  const opts = options && typeof options === 'object' ? options : {};
  const masked = opts.masked === true;
  const fin = opts.fin !== false;
  let extendedBytes = 0;
  let lengthMarker = source.length;
  if (source.length >= 126 && source.length < 65536) {
    extendedBytes = 2;
    lengthMarker = 126;
  } else if (source.length >= 65536) {
    extendedBytes = 8;
    lengthMarker = 127;
  }
  const frame = Buffer.alloc(2 + extendedBytes + (masked ? 4 : 0) + source.length);
  frame[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  frame[1] = (masked ? 0x80 : 0) | lengthMarker;
  let offset = 2;
  if (extendedBytes === 2) {
    frame.writeUInt16BE(source.length, offset);
    offset += 2;
  } else if (extendedBytes === 8) {
    frame.writeBigUInt64BE(BigInt(source.length), offset);
    offset += 8;
  }
  if (!masked) {
    source.copy(frame, offset);
    return frame;
  }
  const mask = crypto.randomBytes(4);
  mask.copy(frame, offset);
  offset += 4;
  for (let index = 0; index < source.length; index += 1) {
    frame[offset + index] = source[index] ^ mask[index % 4];
  }
  return frame;
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

let sink = 0;
function measure(operation, count) {
  const start = performance.now();
  for (let index = 0; index < count; index += 1) {
    const result = operation();
    sink ^= result[result.length - 1];
  }
  return performance.now() - start;
}

function compare(baseline, optimized, count) {
  for (let index = 0; index < 300; index += 1) {
    baseline();
    optimized();
  }
  const before = [];
  const after = [];
  for (let sample = 0; sample < 7; sample += 1) {
    if (sample % 2 === 0) {
      before.push(measure(baseline, count));
      after.push(measure(optimized, count));
    } else {
      after.push(measure(optimized, count));
      before.push(measure(baseline, count));
    }
  }
  return {
    baselineMicroseconds: Number((median(before) * 1000 / count).toFixed(3)),
    optimizedMicroseconds: Number((median(after) * 1000 / count).toFixed(3)),
    speedup: Number((median(before) / median(after)).toFixed(2))
  };
}

const results = [];
for (const size of [16, 32, 64, 125, 256, 512, 1024, 65536, 262144]) {
  const source = Buffer.alloc(size + 1, 0x75).subarray(1);
  const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  const oldTarget = Buffer.alloc(size + 1);
  const newTarget = Buffer.alloc(size + 1);
  baselineMask(source, mask, oldTarget, 1);
  maskPayload(source, mask, newTarget, 1);
  assert.deepEqual(newTarget, oldTarget);
  const count = Math.max(64, Math.min(20000, Math.floor(16 * 1024 * 1024 / size)));
  results.push({
    operation: 'mask', size, iterationsPerSample: count,
    ...compare(
      () => { baselineMask(source, mask, oldTarget, 1); return oldTarget; },
      () => { maskPayload(source, mask, newTarget, 1); return newTarget; }, count
    )
  });
  results.push({
    operation: 'encodeFrame', size, iterationsPerSample: count,
    ...compare(
      () => baselineEncodeFrame(2, source, { masked: true }),
      () => encodeFrame(2, source, { masked: true }), count
    )
  });
}

console.log(JSON.stringify({
  node: process.version, platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0].model, samples: 7, warmupCalls: 300, results, sink
}, null, 2));
