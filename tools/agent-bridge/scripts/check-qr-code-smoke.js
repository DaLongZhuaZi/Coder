'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createQrMatrix,
  renderPngBuffer,
  renderSvg,
  renderTerminalQr,
  writeQrImageFiles
} = require('../src/qr-code');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const payload = 'x'.repeat(604);
const qr = createQrMatrix(payload);
assert(qr.version === 17, 'Expected a 604-byte payload to use QR version 17.');
assert(qr.size === 85, 'Expected QR version 17 to have 85 modules.');

const png = renderPngBuffer(payload, { targetSize: 720, quietZone: 6 });
assert(png.subarray(1, 4).toString('ascii') === 'PNG', 'PNG signature is missing.');
const svg = renderSvg(payload, { quietZone: 6 });
assert(svg.indexOf('<svg') >= 0 && svg.indexOf('<path') >= 0, 'SVG output is incomplete.');
const terminal = renderTerminalQr(payload, 1);
assert(terminal.length > 0, 'Terminal QR output is empty.');

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-agent-bridge-qr-'));
try {
  const files = writeQrImageFiles(payload, outputDir, 'connection', { targetSize: 720, quietZone: 6 });
  assert(files.version === 17, 'Written QR files reported an unexpected version.');
  assert(fs.statSync(files.pngPath).size > 0, 'Written PNG is empty.');
  assert(fs.statSync(files.svgPath).size > 0, 'Written SVG is empty.');
  assert(fs.statSync(files.htmlPath).size > 0, 'Written HTML is empty.');
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

let oversizedRejected = false;
try {
  createQrMatrix('x'.repeat(900));
} catch (error) {
  oversizedRejected = error instanceof Error && error.message.indexOf('too long') >= 0;
}
assert(oversizedRejected, 'Payloads above the built-in QR capacity must be rejected deterministically.');

process.stdout.write('qr code smoke ok\n');
