'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TOTAL_CODEWORDS = [
  0,
  26,
  44,
  70,
  100,
  134,
  172,
  196,
  242,
  292,
  346
];

const ECC_LOW = [
  null,
  { blocks: 1, eccCodewords: 7 },
  { blocks: 1, eccCodewords: 10 },
  { blocks: 1, eccCodewords: 15 },
  { blocks: 1, eccCodewords: 20 },
  { blocks: 1, eccCodewords: 26 },
  { blocks: 2, eccCodewords: 18 },
  { blocks: 2, eccCodewords: 20 },
  { blocks: 2, eccCodewords: 24 },
  { blocks: 2, eccCodewords: 30 },
  { blocks: 4, eccCodewords: 18 }
];

const ALIGNMENT_PATTERN_POSITIONS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable = null;

function dataCodewordCount(version) {
  const spec = ECC_LOW[version];
  return TOTAL_CODEWORDS[version] - spec.blocks * spec.eccCodewords;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push(((value >>> i) & 1) !== 0);
  }
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= 10; version++) {
    const countBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= dataCodewordCount(version) * 8) {
      return version;
    }
  }
  throw new Error('QR payload is too long for the built-in terminal encoder.');
}

function encodeDataCodewords(text, version) {
  const bytes = Buffer.from(text, 'utf8');
  const bits = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const capacityBits = dataCodewordCount(version) * 8;
  const terminatorBits = Math.min(4, capacityBits - bits.length);
  appendBits(bits, 0, terminatorBits);
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) {
      value = (value << 1) | (bits[i + j] ? 1 : 0);
    }
    data.push(value);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < dataCodewordCount(version)) {
    data.push(padBytes[padIndex]);
    padIndex = 1 - padIndex;
  }
  return data;
}

function reedSolomonMultiply(left, right) {
  let x = left;
  let y = right;
  let result = 0;
  while (y !== 0) {
    if ((y & 1) !== 0) {
      result ^= x;
    }
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x ^= 0x11d;
    }
    y >>>= 1;
  }
  return result;
}

function reedSolomonDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] ^= reedSolomonMultiply(divisor[i], factor);
    }
  }
  return result;
}

function addErrorCorrection(data, version) {
  const spec = ECC_LOW[version];
  const blockCount = spec.blocks;
  const eccCodewords = spec.eccCodewords;
  const rawCodewords = TOTAL_CODEWORDS[version];
  const numShortBlocks = blockCount - (rawCodewords % blockCount);
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const divisor = reedSolomonDivisor(eccCodewords);
  const blocks = [];
  let offset = 0;

  for (let i = 0; i < blockCount; i++) {
    const dataLength = shortBlockLength - eccCodewords + (i < numShortBlocks ? 0 : 1);
    const blockData = data.slice(offset, offset + dataLength);
    offset += dataLength;
    blocks.push({
      data: blockData,
      ecc: reedSolomonRemainder(blockData, divisor)
    });
  }

  const result = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i++) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i]);
      }
    }
  }
  for (let i = 0; i < eccCodewords; i++) {
    for (const block of blocks) {
      result.push(block.ecc[i]);
    }
  }
  return result;
}

function createMatrix(size, value) {
  const matrix = [];
  for (let y = 0; y < size; y++) {
    matrix.push(new Array(size).fill(value));
  }
  return matrix;
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function setFunctionModule(modules, reserved, x, y, black) {
  modules[y][x] = black;
  reserved[y][x] = true;
}

function drawFinderPattern(modules, reserved, centerX, centerY) {
  const size = modules.length;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) {
        continue;
      }
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, reserved, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignmentPattern(modules, reserved, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, reserved, centerX + dx, centerY + dy, dist !== 1);
    }
  }
}

function drawTimingPatterns(modules, reserved) {
  const size = modules.length;
  for (let i = 0; i < size; i++) {
    const black = i % 2 === 0;
    if (!reserved[6][i]) {
      setFunctionModule(modules, reserved, i, 6, black);
    }
    if (!reserved[i][6]) {
      setFunctionModule(modules, reserved, 6, i, black);
    }
  }
}

function formatBits(mask) {
  const data = (1 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormatBits(modules, reserved, mask) {
  const size = modules.length;
  const bits = formatBits(mask);
  for (let i = 0; i <= 5; i++) {
    setFunctionModule(modules, reserved, 8, i, ((bits >>> i) & 1) !== 0);
  }
  setFunctionModule(modules, reserved, 8, 7, ((bits >>> 6) & 1) !== 0);
  setFunctionModule(modules, reserved, 8, 8, ((bits >>> 7) & 1) !== 0);
  setFunctionModule(modules, reserved, 7, 8, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) {
    setFunctionModule(modules, reserved, 14 - i, 8, ((bits >>> i) & 1) !== 0);
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(modules, reserved, size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
  }
  for (let i = 8; i < 15; i++) {
    setFunctionModule(modules, reserved, 8, size - 15 + i, ((bits >>> i) & 1) !== 0);
  }
  setFunctionModule(modules, reserved, 8, size - 8, true);
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
  }
  return (version << 12) | rem;
}

function drawVersionBits(modules, reserved, version) {
  if (version < 7) {
    return;
  }
  const size = modules.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const x = size - 11 + (i % 3);
    const y = Math.floor(i / 3);
    setFunctionModule(modules, reserved, x, y, bit);
    setFunctionModule(modules, reserved, y, x, bit);
  }
}

function drawFunctionPatterns(modules, reserved, version) {
  const size = modules.length;
  drawFinderPattern(modules, reserved, 3, 3);
  drawFinderPattern(modules, reserved, size - 4, 3);
  drawFinderPattern(modules, reserved, 3, size - 4);
  drawTimingPatterns(modules, reserved);

  const positions = ALIGNMENT_PATTERN_POSITIONS[version];
  for (const y of positions) {
    for (const x of positions) {
      const overlapsTopLeftFinder = x === 6 && y === 6;
      const overlapsTopRightFinder = x === size - 7 && y === 6;
      const overlapsBottomLeftFinder = x === 6 && y === size - 7;
      if (!overlapsTopLeftFinder && !overlapsTopRightFinder && !overlapsBottomLeftFinder) {
        drawAlignmentPattern(modules, reserved, x, y);
      }
    }
  }

  drawFormatBits(modules, reserved, 0);
  drawVersionBits(modules, reserved, version);
}

function drawCodewords(modules, reserved, codewords) {
  const size = modules.length;
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right--;
    }
    for (let vertical = 0; vertical < size; vertical++) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (reserved[y][x]) {
          continue;
        }
        let black = false;
        if (bitIndex < codewords.length * 8) {
          black = ((codewords[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) !== 0;
        }
        modules[y][x] = black;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

function maskBit(mask, x, y) {
  if (mask === 0) {
    return (x + y) % 2 === 0;
  }
  if (mask === 1) {
    return y % 2 === 0;
  }
  if (mask === 2) {
    return x % 3 === 0;
  }
  if (mask === 3) {
    return (x + y) % 3 === 0;
  }
  if (mask === 4) {
    return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  }
  if (mask === 5) {
    return ((x * y) % 2) + ((x * y) % 3) === 0;
  }
  if (mask === 6) {
    return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
  return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
}

function applyMask(baseModules, reserved, mask) {
  const modules = cloneMatrix(baseModules);
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved[y][x] && maskBit(mask, x, y)) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
  drawFormatBits(modules, cloneMatrix(reserved), mask);
  return modules;
}

function penaltyScore(modules) {
  const size = modules.length;
  let penalty = 0;

  for (let y = 0; y < size; y++) {
    let runColor = modules[y][0];
    let runLength = 1;
    for (let x = 1; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLength++;
      } else {
        if (runLength >= 5) {
          penalty += 3 + runLength - 5;
        }
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) {
      penalty += 3 + runLength - 5;
    }
  }

  for (let x = 0; x < size; x++) {
    let runColor = modules[0][x];
    let runLength = 1;
    for (let y = 1; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLength++;
      } else {
        if (runLength >= 5) {
          penalty += 3 + runLength - 5;
        }
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) {
      penalty += 3 + runLength - 5;
    }
  }

  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const color = modules[y][x];
      if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) {
        penalty += 3;
      }
    }
  }

  const finderPatternA = [true, false, true, true, true, false, true, false, false, false, false];
  const finderPatternB = [false, false, false, false, true, false, true, true, true, false, true];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x + 10 < size; x++) {
      if (matchesPattern(modules, x, y, 1, 0, finderPatternA) || matchesPattern(modules, x, y, 1, 0, finderPatternB)) {
        penalty += 40;
      }
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y + 10 < size; y++) {
      if (matchesPattern(modules, x, y, 0, 1, finderPatternA) || matchesPattern(modules, x, y, 0, 1, finderPatternB)) {
        penalty += 40;
      }
    }
  }

  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        dark++;
      }
    }
  }
  const total = size * size;
  penalty += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return penalty;
}

function matchesPattern(modules, x, y, dx, dy, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (modules[y + dy * i][x + dx * i] !== pattern[i]) {
      return false;
    }
  }
  return true;
}

function createQrMatrix(text) {
  const version = chooseVersion(Buffer.from(text, 'utf8').length);
  const size = version * 4 + 17;
  const modules = createMatrix(size, false);
  const reserved = createMatrix(size, false);
  const data = encodeDataCodewords(text, version);
  const codewords = addErrorCorrection(data, version);
  drawFunctionPatterns(modules, reserved, version);
  drawCodewords(modules, reserved, codewords);

  let bestMask = 0;
  let bestMatrix = applyMask(modules, reserved, 0);
  let bestPenalty = penaltyScore(bestMatrix);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = applyMask(modules, reserved, mask);
    const score = penaltyScore(candidate);
    if (score < bestPenalty) {
      bestMask = mask;
      bestMatrix = candidate;
      bestPenalty = score;
    }
  }
  return {
    version,
    mask: bestMask,
    size,
    modules: bestMatrix
  };
}

function renderTerminalQr(text, quietZone) {
  const qr = createQrMatrix(text);
  const margin = Number.isFinite(quietZone) ? Math.max(0, Math.floor(quietZone)) : 4;
  const lines = [];
  for (let y = -margin; y < qr.size + margin; y++) {
    let line = '';
    let previousBlack = null;
    for (let x = -margin; x < qr.size + margin; x++) {
      const black = x >= 0 && y >= 0 && x < qr.size && y < qr.size && qr.modules[y][x];
      if (previousBlack !== black) {
        line += black ? '\x1b[40m' : '\x1b[47m';
        previousBlack = black;
      }
      line += '  ';
    }
    lines.push(line + '\x1b[0m');
  }
  return lines.join('\n');
}

function buildCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table.push(value >>> 0);
  }
  return table;
}

function crc32(buffer) {
  if (!crcTable) {
    crcTable = buildCrcTable();
  }
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function resolveQuietZone(options) {
  if (options && Number.isFinite(options.quietZone)) {
    return Math.max(0, Math.floor(options.quietZone));
  }
  return 4;
}

function resolveScale(qrSize, quietZone, options) {
  if (options && Number.isFinite(options.scale)) {
    return Math.max(1, Math.floor(options.scale));
  }
  const targetSize = options && Number.isFinite(options.targetSize) ? Math.max(160, Math.floor(options.targetSize)) : 360;
  return Math.max(3, Math.floor(targetSize / (qrSize + quietZone * 2)));
}

function renderPngBuffer(text, options) {
  const qr = createQrMatrix(text);
  const quietZone = resolveQuietZone(options);
  const scale = resolveScale(qr.size, quietZone, options);
  const imageSize = (qr.size + quietZone * 2) * scale;
  const rowBytes = imageSize * 4;
  const raw = Buffer.alloc((rowBytes + 1) * imageSize);

  for (let y = 0; y < imageSize; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < imageSize; x++) {
      const moduleX = Math.floor(x / scale) - quietZone;
      const moduleY = Math.floor(y / scale) - quietZone;
      const black = moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < qr.size &&
        moduleY < qr.size &&
        qr.modules[moduleY][moduleX];
      const color = black ? 0 : 255;
      const offset = rowStart + 1 + x * 4;
      raw[offset] = color;
      raw[offset + 1] = color;
      raw[offset + 2] = color;
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imageSize, 0);
  ihdr.writeUInt32BE(imageSize, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function renderSvg(text, options) {
  const qr = createQrMatrix(text);
  const quietZone = resolveQuietZone(options);
  const viewSize = qr.size + quietZone * 2;
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        parts.push('M' + String(x + quietZone) + ',' + String(y + quietZone) + 'h1v1h-1z');
      }
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + String(viewSize) + ' ' + String(viewSize) + '" shape-rendering="crispEdges">',
    '<rect width="100%" height="100%" fill="#fff"/>',
    '<path fill="#000" d="' + parts.join('') + '"/>',
    '</svg>'
  ].join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFieldRows(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return '';
  }
  const rows = [];
  for (const field of fields) {
    if (!field || String(field.value || '').length === 0) {
      continue;
    }
    rows.push(
      '<div class="field">' +
      '<div class="field-label">' + escapeHtml(field.label || '') + '</div>' +
      '<div class="field-value">' + escapeHtml(field.value || '') + '</div>' +
      '</div>'
    );
  }
  if (rows.length === 0) {
    return '';
  }
  return '<section class="fields">' + rows.join('\n') + '</section>';
}

function renderDisplayHtml(pngBase64, imageSize, options) {
  const title = options && options.title ? String(options.title) : 'Agent Bridge QR';
  const description = options && options.description ? String(options.description) : 'Scan this code from the NGF app connection settings.';
  const warning = options && options.warning ? String(options.warning) : 'This QR code contains the connection token. Do not share it publicly.';
  const fieldRows = renderFieldRows(options ? options.fields : []);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(title) + '</title>',
    '<style>',
    ':root { color-scheme: light; }',
    'body { margin: 0; min-height: 100vh; font-family: "Segoe UI", Arial, sans-serif; background: #eef3f8; color: #111827; }',
    'main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; box-sizing: border-box; }',
    '.panel { width: min(960px, 100%); display: grid; grid-template-columns: minmax(320px, 1fr) minmax(260px, 340px); gap: 28px; align-items: center; }',
    '.qr-card { display: flex; justify-content: center; padding: 32px; background: #ffffff; border: 1px solid #d8e0ea; border-radius: 24px; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16); }',
    '.qr-card img { width: ' + String(imageSize) + 'px; height: ' + String(imageSize) + 'px; max-width: min(72vw, 640px); max-height: min(72vw, 640px); image-rendering: pixelated; image-rendering: crisp-edges; }',
    '.copy { display: flex; flex-direction: column; gap: 18px; }',
    'h1 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 650; }',
    'p { margin: 0; color: #4b5563; line-height: 1.55; font-size: 15px; }',
    '.warning { padding: 12px 14px; border-radius: 14px; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }',
    '.fields { display: flex; flex-direction: column; gap: 10px; }',
    '.field { padding: 12px 14px; border: 1px solid #d8e0ea; border-radius: 14px; background: rgba(255, 255, 255, 0.78); }',
    '.field-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }',
    '.field-value { font-size: 13px; color: #0f172a; word-break: break-all; font-family: Consolas, "SFMono-Regular", monospace; }',
    '@media (max-width: 780px) { main { padding: 18px; } .panel { grid-template-columns: 1fr; } .qr-card { padding: 22px; } h1 { font-size: 24px; } }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<section class="panel">',
    '<div class="qr-card"><img alt="' + escapeHtml(title) + '" src="data:image/png;base64,' + pngBase64 + '"></div>',
    '<div class="copy">',
    '<h1>' + escapeHtml(title) + '</h1>',
    '<p>' + escapeHtml(description) + '</p>',
    '<p class="warning">' + escapeHtml(warning) + '</p>',
    fieldRows,
    '</div>',
    '</section>',
    '</main>',
    '</body>',
    '</html>'
  ].join('\n');
}

function writeQrImageFiles(text, outputDir, basename, options) {
  fs.mkdirSync(outputDir, { recursive: true });
  const safeBaseName = basename && basename.length > 0 ? basename : 'agent-bridge-connection';
  const pngPath = path.join(outputDir, safeBaseName + '.png');
  const svgPath = path.join(outputDir, safeBaseName + '.svg');
  const htmlPath = path.join(outputDir, safeBaseName + '.html');
  const png = renderPngBuffer(text, options);
  const svg = renderSvg(text, options);
  const qr = createQrMatrix(text);
  const quietZone = resolveQuietZone(options);
  const scale = resolveScale(qr.size, quietZone, options);
  const imageSize = (qr.size + quietZone * 2) * scale;
  const html = renderDisplayHtml(png.toString('base64'), imageSize, options);
  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(svgPath, svg, 'utf8');
  fs.writeFileSync(htmlPath, html, 'utf8');
  return {
    pngPath,
    svgPath,
    htmlPath,
    version: qr.version,
    moduleCount: qr.size,
    imageSize
  };
}

module.exports = {
  createQrMatrix,
  renderDisplayHtml,
  renderPngBuffer,
  renderSvg,
  renderTerminalQr,
  writeQrImageFiles
};
