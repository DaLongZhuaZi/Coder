'use strict';

const MASK_WORD_THRESHOLD = 512;

function maskPayload(source, mask, target = source, offset = 0) {
  if (!Buffer.isBuffer(source) || !Buffer.isBuffer(mask) || !Buffer.isBuffer(target)) {
    throw new TypeError('WebSocket masking requires Buffer inputs.');
  }
  if (mask.length !== 4) {
    throw new RangeError('WebSocket mask must contain exactly four bytes.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || source.length > target.length - offset) {
    throw new RangeError('WebSocket mask output exceeds the target buffer.');
  }

  const length = source.length;
  if (length === 0) {
    return;
  }
  const maskWord = mask.readUInt32LE(0);
  const targetStart = target.byteOffset + offset;
  if (source.buffer === target.buffer && targetStart > source.byteOffset && targetStart < source.byteOffset + length) {
    source = Buffer.from(source);
  }

  let index = 0;
  if (length >= MASK_WORD_THRESHOLD) {
    const sourceView = new DataView(source.buffer, source.byteOffset, length);
    const targetView = new DataView(target.buffer, targetStart, length);
    for (const end = length - length % 4; index < end; index += 4) {
      targetView.setUint32(index, sourceView.getUint32(index, true) ^ maskWord, true);
    }
  }
  for (; index < length; index += 1) {
    target[offset + index] = source[index] ^ ((maskWord >>> ((index & 3) << 3)) & 255);
  }
}

module.exports = { MASK_WORD_THRESHOLD, maskPayload };
