'use strict';

const {
  TerminalStreamOpcode,
  FileTransferOpcode,
  encodeTerminalFrame,
  decodeTerminalFrame,
  encodeTerminalSnapshotPayload,
  decodeTerminalSnapshotPayload,
  encodeFileBeginFrame,
  encodeFileChunkFrame,
  encodeFileEndFrame,
  encodeFileCancelFrame,
  decodeFileTransferFrame,
  decodeBinaryFrame
} = require('../src/binary-frames');

function main() {
  const terminalOutput = encodeTerminalFrame(TerminalStreamOpcode.OUTPUT, 7, 'hello');
  const decodedTerminal = decodeTerminalFrame(terminalOutput);
  assert(decodedTerminal !== null, 'terminal frame should decode');
  assert(decodedTerminal.opcode === TerminalStreamOpcode.OUTPUT, 'terminal opcode should roundtrip');
  assert(decodedTerminal.slot === 7, 'terminal slot should roundtrip');
  assert(decodedTerminal.payload.toString('utf8') === 'hello', 'terminal payload should roundtrip');

  const snapshotPayload = encodeTerminalSnapshotPayload({
    text: 'restored output',
    restoreSeq: 9,
    snapshotSeq: 14,
    truncated: true,
    source: 'persisted'
  });
  const decodedSnapshotPayload = decodeTerminalSnapshotPayload(snapshotPayload);
  assert(decodedSnapshotPayload !== null, 'sequenced terminal snapshot should decode');
  assert(decodedSnapshotPayload.restoreSeq === 9, 'terminal restore sequence should roundtrip');
  assert(decodedSnapshotPayload.snapshotSeq === 14, 'terminal snapshot sequence should roundtrip');
  assert(decodedSnapshotPayload.truncated === true, 'terminal snapshot truncation should roundtrip');
  assert(decodedSnapshotPayload.source === 'persisted', 'terminal snapshot source should roundtrip');
  assert(decodedSnapshotPayload.text === 'restored output', 'terminal snapshot text should roundtrip');
  assert(decodeTerminalSnapshotPayload(Buffer.from('legacy', 'utf8')) === null, 'legacy snapshot text should remain distinguishable');

  const resize = encodeTerminalFrame(TerminalStreamOpcode.RESIZE, 7, JSON.stringify({ rows: 30, cols: 120 }));
  const decodedResize = decodeBinaryFrame(resize);
  assert(decodedResize.kind === 'terminal', 'terminal binary frame should be routed');
  assert(decodedResize.frame.opcode === TerminalStreamOpcode.RESIZE, 'resize opcode should roundtrip');

  const metadata = {
    path: 'src/index.ts',
    fileName: 'index.ts',
    sizeBytes: 12,
    sha256: 'abc'
  };
  const begin = encodeFileBeginFrame('download-1', metadata);
  const decodedBegin = decodeFileTransferFrame(begin);
  assert(decodedBegin !== null, 'file begin should decode');
  assert(decodedBegin.opcode === FileTransferOpcode.BEGIN, 'file begin opcode should roundtrip');
  assert(decodedBegin.requestId === 'download-1', 'file request id should roundtrip');
  assert(decodedBegin.metadata.path === metadata.path, 'file metadata should roundtrip');

  const chunk = encodeFileChunkFrame('download-1', Buffer.from('chunk'));
  const decodedChunk = decodeBinaryFrame(chunk);
  assert(decodedChunk.kind === 'file_transfer', 'file binary frame should be routed');
  assert(decodedChunk.frame.opcode === FileTransferOpcode.CHUNK, 'file chunk opcode should roundtrip');
  assert(decodedChunk.frame.payload.toString('utf8') === 'chunk', 'file chunk payload should roundtrip');

  const end = decodeFileTransferFrame(encodeFileEndFrame('download-1'));
  assert(end.opcode === FileTransferOpcode.END, 'file end opcode should roundtrip');

  const cancel = decodeFileTransferFrame(encodeFileCancelFrame('download-1', 'stop'));
  assert(cancel.opcode === FileTransferOpcode.CANCEL, 'file cancel opcode should roundtrip');
  assert(cancel.payload.toString('utf8') === 'stop', 'file cancel message should roundtrip');

  assert(decodeBinaryFrame(Buffer.from([0xff, 0x00])) === null, 'invalid opcode should be rejected');
  let threw = false;
  try {
    encodeFileChunkFrame('x'.repeat(256), Buffer.alloc(0));
  } catch (_error) {
    threw = true;
  }
  assert(threw, 'requestId longer than 255 bytes should throw');

  console.log('binary frame smoke passed');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main();
