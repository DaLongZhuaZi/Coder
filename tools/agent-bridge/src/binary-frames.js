'use strict';

const TerminalStreamOpcode = Object.freeze({
  OUTPUT: 0x01,
  INPUT: 0x02,
  RESIZE: 0x03,
  SNAPSHOT: 0x04,
  RESTORE: 0x05,
  MOUSE: 0x06
});

const FileTransferOpcode = Object.freeze({
  BEGIN: 0x10,
  CHUNK: 0x11,
  END: 0x12,
  CANCEL: 0x13
});

const TERMINAL_STREAM_PROTOCOL_VERSION = 2;
const TERMINAL_SNAPSHOT_MAGIC = Buffer.from('NGF2', 'ascii');
const TERMINAL_SNAPSHOT_HEADER_BYTES = 13;
const TerminalSnapshotFlag = Object.freeze({
  TRUNCATED: 0x01,
  PERSISTED: 0x02
});

function isTerminalOpcode(opcode) {
  return opcode === TerminalStreamOpcode.OUTPUT ||
    opcode === TerminalStreamOpcode.INPUT ||
    opcode === TerminalStreamOpcode.RESIZE ||
    opcode === TerminalStreamOpcode.SNAPSHOT ||
    opcode === TerminalStreamOpcode.RESTORE ||
    opcode === TerminalStreamOpcode.MOUSE;
}

function isFileTransferOpcode(opcode) {
  return opcode === FileTransferOpcode.BEGIN ||
    opcode === FileTransferOpcode.CHUNK ||
    opcode === FileTransferOpcode.END ||
    opcode === FileTransferOpcode.CANCEL;
}

function bufferFromPayload(payload) {
  if (!payload) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(payload)) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (typeof payload === 'string') {
    return Buffer.from(payload, 'utf8');
  }
  return Buffer.alloc(0);
}

function encodeTerminalFrame(opcode, slot, payload) {
  if (!isTerminalOpcode(opcode)) {
    throw new RangeError('Invalid terminal opcode.');
  }
  if (typeof slot !== 'number' || slot < 0 || slot > 255) {
    throw new RangeError('Invalid terminal slot.');
  }
  const body = bufferFromPayload(payload);
  const frame = Buffer.allocUnsafe(2 + body.length);
  frame[0] = opcode;
  frame[1] = slot & 0xff;
  body.copy(frame, 2);
  return frame;
}

function decodeTerminalFrame(bytes) {
  const buffer = bufferFromPayload(bytes);
  if (buffer.length < 2 || !isTerminalOpcode(buffer[0])) {
    return null;
  }
  return {
    opcode: buffer[0],
    slot: buffer[1],
    payload: buffer.subarray(2)
  };
}

function uint32(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(0xffffffff, Math.floor(value));
}

function encodeTerminalSnapshotPayload(snapshot) {
  const text = snapshot && typeof snapshot.text === 'string' ? snapshot.text : '';
  const body = Buffer.from(text, 'utf8');
  const payload = Buffer.allocUnsafe(TERMINAL_SNAPSHOT_HEADER_BYTES + body.length);
  TERMINAL_SNAPSHOT_MAGIC.copy(payload, 0);
  payload.writeUInt32BE(uint32(snapshot && snapshot.restoreSeq), 4);
  payload.writeUInt32BE(uint32(snapshot && snapshot.snapshotSeq), 8);
  let flags = 0;
  if (snapshot && snapshot.truncated === true) {
    flags |= TerminalSnapshotFlag.TRUNCATED;
  }
  if (snapshot && snapshot.source === 'persisted') {
    flags |= TerminalSnapshotFlag.PERSISTED;
  }
  payload[12] = flags;
  body.copy(payload, TERMINAL_SNAPSHOT_HEADER_BYTES);
  return payload;
}

function decodeTerminalSnapshotPayload(bytes) {
  const payload = bufferFromPayload(bytes);
  if (payload.length < TERMINAL_SNAPSHOT_HEADER_BYTES || !payload.subarray(0, 4).equals(TERMINAL_SNAPSHOT_MAGIC)) {
    return null;
  }
  const flags = payload[12];
  return {
    version: TERMINAL_STREAM_PROTOCOL_VERSION,
    restoreSeq: payload.readUInt32BE(4),
    snapshotSeq: payload.readUInt32BE(8),
    truncated: (flags & TerminalSnapshotFlag.TRUNCATED) !== 0,
    source: (flags & TerminalSnapshotFlag.PERSISTED) !== 0 ? 'persisted' : 'memory',
    text: payload.subarray(TERMINAL_SNAPSHOT_HEADER_BYTES).toString('utf8')
  };
}

function encodeRequestId(requestId) {
  const value = typeof requestId === 'string' ? requestId : '';
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length === 0) {
    throw new RangeError('File transfer requestId is required.');
  }
  if (bytes.length > 255) {
    throw new RangeError('File transfer requestId is too long.');
  }
  return bytes;
}

function encodeFileBeginFrame(requestId, metadata) {
  const requestBytes = encodeRequestId(requestId);
  const metadataBytes = Buffer.from(JSON.stringify(metadata || {}), 'utf8');
  if (metadataBytes.length > 65535) {
    throw new RangeError('File transfer metadata is too long.');
  }
  const frame = Buffer.allocUnsafe(4 + requestBytes.length + metadataBytes.length);
  frame[0] = FileTransferOpcode.BEGIN;
  frame[1] = requestBytes.length;
  requestBytes.copy(frame, 2);
  frame.writeUInt16BE(metadataBytes.length, 2 + requestBytes.length);
  metadataBytes.copy(frame, 4 + requestBytes.length);
  return frame;
}

function encodeFilePayloadFrame(opcode, requestId, payload) {
  if (opcode !== FileTransferOpcode.CHUNK && opcode !== FileTransferOpcode.END && opcode !== FileTransferOpcode.CANCEL) {
    throw new RangeError('Invalid file transfer opcode.');
  }
  const requestBytes = encodeRequestId(requestId);
  const body = opcode === FileTransferOpcode.CHUNK || opcode === FileTransferOpcode.CANCEL
    ? bufferFromPayload(payload)
    : Buffer.alloc(0);
  const frame = Buffer.allocUnsafe(2 + requestBytes.length + body.length);
  frame[0] = opcode;
  frame[1] = requestBytes.length;
  requestBytes.copy(frame, 2);
  body.copy(frame, 2 + requestBytes.length);
  return frame;
}

function encodeFileChunkFrame(requestId, payload) {
  return encodeFilePayloadFrame(FileTransferOpcode.CHUNK, requestId, payload);
}

function encodeFileEndFrame(requestId) {
  return encodeFilePayloadFrame(FileTransferOpcode.END, requestId, Buffer.alloc(0));
}

function encodeFileCancelFrame(requestId, message) {
  return encodeFilePayloadFrame(FileTransferOpcode.CANCEL, requestId, typeof message === 'string' ? message : '');
}

function decodeFileTransferFrame(bytes) {
  const buffer = bufferFromPayload(bytes);
  if (buffer.length < 2 || !isFileTransferOpcode(buffer[0])) {
    return null;
  }
  const opcode = buffer[0];
  const requestIdLength = buffer[1];
  if (requestIdLength === 0 || buffer.length < 2 + requestIdLength) {
    return null;
  }
  const requestId = buffer.subarray(2, 2 + requestIdLength).toString('utf8');
  const body = buffer.subarray(2 + requestIdLength);
  if (opcode === FileTransferOpcode.BEGIN) {
    if (body.length < 2) {
      return null;
    }
    const metadataLength = body.readUInt16BE(0);
    if (metadataLength !== body.length - 2) {
      return null;
    }
    try {
      const metadata = JSON.parse(body.subarray(2).toString('utf8'));
      return { opcode, requestId, metadata, payload: Buffer.alloc(0) };
    } catch (_error) {
      return null;
    }
  }
  if (opcode === FileTransferOpcode.END && body.length !== 0) {
    return null;
  }
  return { opcode, requestId, metadata: null, payload: body };
}

function decodeBinaryFrame(bytes) {
  const buffer = bufferFromPayload(bytes);
  if (buffer.length === 0) {
    return null;
  }
  if (isTerminalOpcode(buffer[0])) {
    const frame = decodeTerminalFrame(buffer);
    return frame ? { kind: 'terminal', frame } : null;
  }
  if (isFileTransferOpcode(buffer[0])) {
    const frame = decodeFileTransferFrame(buffer);
    return frame ? { kind: 'file_transfer', frame } : null;
  }
  return null;
}

module.exports = {
  TerminalStreamOpcode,
  TERMINAL_STREAM_PROTOCOL_VERSION,
  TerminalSnapshotFlag,
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
  decodeBinaryFrame,
  bufferFromPayload
};
