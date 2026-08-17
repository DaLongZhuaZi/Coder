'use strict';

const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const { TextDecoder } = require('util');

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_FRAME_BYTES = 256 * 1024;
const DEFAULT_MAX_MESSAGE_BYTES = 512 * 1024;
const DEFAULT_MAX_QUEUED_BYTES = 1024 * 1024;
const DEFAULT_MAX_QUEUED_FRAMES = 256;
const DEFAULT_CLOSE_TIMEOUT_MS = 5000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const MAX_HANDSHAKE_BYTES = 32 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function boundedInteger(value, fallback, minimum, maximum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function createAcceptValue(key) {
  return crypto.createHash('sha1').update(String(key || '') + WEBSOCKET_GUID).digest('base64');
}

function decodeUtf8(payload) {
  return textDecoder.decode(payload);
}

function validCloseCode(code) {
  if (!Number.isInteger(code)) return false;
  if (code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code)) return true;
  return code >= 3000 && code <= 4999;
}

function closePayload(code, reason) {
  const normalizedCode = validCloseCode(code) ? code : 1000;
  let reasonBuffer = Buffer.from(String(reason || ''), 'utf8');
  if (reasonBuffer.length > 123) {
    reasonBuffer = reasonBuffer.subarray(0, 123);
    while (reasonBuffer.length > 0) {
      try {
        decodeUtf8(reasonBuffer);
        break;
      } catch (_error) {
        reasonBuffer = reasonBuffer.subarray(0, reasonBuffer.length - 1);
      }
    }
  }
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(normalizedCode, 0);
  reasonBuffer.copy(payload, 2);
  return payload;
}

function encodeFrame(opcode, payload, options) {
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
  const maskBytes = masked ? 4 : 0;
  const frame = Buffer.alloc(2 + extendedBytes + maskBytes + source.length);
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

class WebSocketProtocolError extends Error {
  constructor(message, closeCode) {
    super(message);
    this.name = 'WebSocketProtocolError';
    this.closeCode = Number.isInteger(closeCode) ? closeCode : 1002;
  }
}

class WebSocketBackpressureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebSocketBackpressureError';
    this.code = 'websocket_backpressure';
  }
}

class WebSocketFramePeer extends EventEmitter {
  constructor(socket, options) {
    super();
    if (!socket || typeof socket.on !== 'function' || typeof socket.write !== 'function') {
      throw new Error('A connected stream socket is required.');
    }
    const opts = options && typeof options === 'object' ? options : {};
    this.socket = socket;
    this.maskOutgoing = opts.maskOutgoing === true;
    this.requireMaskedIncoming = typeof opts.requireMaskedIncoming === 'boolean'
      ? opts.requireMaskedIncoming
      : null;
    this.maxFrameBytes = boundedInteger(opts.maxFrameBytes, DEFAULT_MAX_FRAME_BYTES, 125, 64 * 1024 * 1024);
    this.maxMessageBytes = boundedInteger(
      opts.maxMessageBytes,
      Math.max(DEFAULT_MAX_MESSAGE_BYTES, this.maxFrameBytes),
      this.maxFrameBytes,
      128 * 1024 * 1024
    );
    this.maxQueuedBytes = boundedInteger(opts.maxQueuedBytes, DEFAULT_MAX_QUEUED_BYTES, 1024, 128 * 1024 * 1024);
    this.maxQueuedFrames = boundedInteger(opts.maxQueuedFrames, DEFAULT_MAX_QUEUED_FRAMES, 1, 65536);
    this.maxFragments = boundedInteger(opts.maxFragments, 4096, 1, 65536);
    this.closeTimeoutMs = boundedInteger(opts.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS, 100, 60000);
    this.heartbeatIntervalMs = boundedInteger(opts.heartbeatIntervalMs, 0, 0, 10 * 60 * 1000);
    this.pongTimeoutMs = boundedInteger(
      opts.pongTimeoutMs,
      Math.max(this.heartbeatIntervalMs * 2, 10000),
      100,
      10 * 60 * 1000
    );
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
    this.fragmentBytes = 0;
    this.fragmentCount = 0;
    this.outgoing = [];
    this.outgoingBytes = 0;
    this.writeBlocked = false;
    this.closeSent = false;
    this.closeReceived = false;
    this.receivedCloseCode = 1005;
    this.receivedCloseReason = '';
    this.closed = false;
    this.closeEmitted = false;
    this.endAfterFlush = false;
    this.lastSeenAt = Date.now();
    this.lastPongAt = this.lastSeenAt;
    this.lastPingAt = 0;
    this.awaitingPong = false;
    this.closeTimer = null;
    this.heartbeatTimer = null;

    if (typeof socket.setNoDelay === 'function') socket.setNoDelay(true);
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('drain', () => this.handleDrain());
    socket.on('end', () => this.finalizeClose(false));
    socket.on('close', (hadError) => this.finalizeClose(hadError === true));
    socket.on('error', (error) => this.emitError(error));
    if (this.heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => this.heartbeatTick(), this.heartbeatIntervalMs);
      if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref();
    }
  }

  get bufferedAmount() {
    const socketBytes = this.socket && Number.isFinite(this.socket.writableLength)
      ? this.socket.writableLength
      : 0;
    return socketBytes + this.outgoingBytes;
  }

  get isOpen() {
    return !this.closed && !this.closeSent && this.socket && this.socket.destroyed !== true;
  }

  feed(chunk) {
    if (this.closed || !chunk || chunk.length === 0) return;
    this.lastSeenAt = Date.now();
    this.buffer = this.buffer.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([this.buffer, chunk]);
    try {
      while (this.readOneFrame()) {
        // Continue until the current TCP buffer no longer contains a complete frame.
      }
      if (this.buffer.length > this.maxFrameBytes + 14) {
        throw new WebSocketProtocolError('Incoming frame buffer exceeded the configured limit.', 1009);
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Invalid WebSocket frame.');
      this.failProtocol(failure);
    }
  }

  readOneFrame() {
    if (this.buffer.length < 2 || this.closed) return false;
    const first = this.buffer[0];
    const second = this.buffer[1];
    const fin = (first & 0x80) !== 0;
    const rsv = first & 0x70;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    if (rsv !== 0) throw new WebSocketProtocolError('RSV bits require an unsupported extension.', 1002);
    if (![0x0, 0x1, 0x2, 0x8, 0x9, 0xA].includes(opcode)) {
      throw new WebSocketProtocolError('Unsupported WebSocket opcode.', 1002);
    }
    if (this.requireMaskedIncoming !== null && masked !== this.requireMaskedIncoming) {
      throw new WebSocketProtocolError(
        this.requireMaskedIncoming ? 'Client frames must be masked.' : 'Server frames must not be masked.',
        1002
      );
    }
    const control = opcode >= 0x8;
    if (control && !fin) throw new WebSocketProtocolError('Control frames must not be fragmented.', 1002);

    let offset = 2;
    let length = second & 0x7f;
    if (length === 126) {
      if (this.buffer.length < offset + 2) return false;
      length = this.buffer.readUInt16BE(offset);
      offset += 2;
      if (length < 126) throw new WebSocketProtocolError('Non-canonical WebSocket length encoding.', 1002);
    } else if (length === 127) {
      if (this.buffer.length < offset + 8) return false;
      const bigLength = this.buffer.readBigUInt64BE(offset);
      if ((bigLength & (BigInt(1) << BigInt(63))) !== BigInt(0)) {
        throw new WebSocketProtocolError('Invalid 64-bit WebSocket length.', 1002);
      }
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new WebSocketProtocolError('WebSocket frame length is not safely representable.', 1009);
      }
      length = Number(bigLength);
      offset += 8;
      if (length < 65536) throw new WebSocketProtocolError('Non-canonical WebSocket length encoding.', 1002);
    }
    if (control && length > 125) throw new WebSocketProtocolError('Control frame payload is too large.', 1002);
    if (length > this.maxFrameBytes) throw new WebSocketProtocolError('WebSocket frame exceeds the configured limit.', 1009);

    let mask = null;
    if (masked) {
      if (this.buffer.length < offset + 4) return false;
      mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (this.buffer.length < offset + length) return false;
    const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
    this.buffer = this.buffer.subarray(offset + length);
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = payload[index] ^ mask[index % 4];
      }
    }
    this.handleFrame(opcode, fin, payload);
    return true;
  }

  handleFrame(opcode, fin, payload) {
    this.lastSeenAt = Date.now();
    if (opcode === 0x8) {
      this.handleCloseFrame(payload);
      return;
    }
    if (opcode === 0x9) {
      this.emit('ping', Buffer.from(payload));
      if (!this.closeSent) this.sendPong(payload);
      return;
    }
    if (opcode === 0xA) {
      this.awaitingPong = false;
      this.lastPongAt = Date.now();
      this.emit('pong', Buffer.from(payload));
      return;
    }
    if (opcode === 0x0) {
      if (this.fragmentOpcode === 0) throw new WebSocketProtocolError('Unexpected continuation frame.', 1002);
      this.appendFragment(payload);
      if (fin) this.finishFragmentedMessage();
      return;
    }
    if (this.fragmentOpcode !== 0) {
      throw new WebSocketProtocolError('A fragmented message is already in progress.', 1002);
    }
    if (fin) {
      this.emitMessage(opcode, payload);
      return;
    }
    this.fragmentOpcode = opcode;
    this.fragments = [];
    this.fragmentBytes = 0;
    this.fragmentCount = 0;
    this.appendFragment(payload);
  }

  appendFragment(payload) {
    this.fragmentCount += 1;
    this.fragmentBytes += payload.length;
    if (this.fragmentCount > this.maxFragments || this.fragmentBytes > this.maxMessageBytes) {
      throw new WebSocketProtocolError('Fragmented message exceeds the configured limit.', 1009);
    }
    this.fragments.push(Buffer.from(payload));
  }

  finishFragmentedMessage() {
    const opcode = this.fragmentOpcode;
    const payload = Buffer.concat(this.fragments, this.fragmentBytes);
    this.fragmentOpcode = 0;
    this.fragments = [];
    this.fragmentBytes = 0;
    this.fragmentCount = 0;
    this.emitMessage(opcode, payload);
  }

  emitMessage(opcode, payload) {
    if (payload.length > this.maxMessageBytes) {
      throw new WebSocketProtocolError('WebSocket message exceeds the configured limit.', 1009);
    }
    if (opcode === 0x1) {
      let value;
      try {
        value = decodeUtf8(payload);
      } catch (_error) {
        throw new WebSocketProtocolError('Text frame contains invalid UTF-8.', 1007);
      }
      this.emit('message', value, false);
      this.emit('text', value);
      return;
    }
    const value = Buffer.from(payload);
    this.emit('message', value, true);
    this.emit('binary', value);
  }

  handleCloseFrame(payload) {
    if (payload.length === 1) throw new WebSocketProtocolError('Invalid WebSocket close payload.', 1002);
    let code = 1005;
    let reason = '';
    if (payload.length >= 2) {
      code = payload.readUInt16BE(0);
      if (!validCloseCode(code)) throw new WebSocketProtocolError('Invalid WebSocket close code.', 1002);
      try {
        reason = decodeUtf8(payload.subarray(2));
      } catch (_error) {
        throw new WebSocketProtocolError('Close reason contains invalid UTF-8.', 1007);
      }
    }
    this.closeReceived = true;
    this.receivedCloseCode = code;
    this.receivedCloseReason = reason;
    this.emit('closeFrame', { code, reason });
    if (!this.closeSent) {
      const echoPayload = payload.length > 0 ? payload : closePayload(1000, '');
      const accepted = this.enqueueFrames([encodeFrame(0x8, echoPayload, { masked: this.maskOutgoing })]);
      this.closeSent = true;
      if (!accepted) {
        this.terminate();
        return;
      }
    }
    this.endAfterFlush = true;
    this.armCloseTimer();
    this.finishWriteIfNeeded();
  }

  sendText(value) {
    return this.sendMessage(0x1, Buffer.from(String(value || ''), 'utf8'));
  }

  sendJson(value) {
    return this.sendText(JSON.stringify(value));
  }

  sendBinary(value) {
    return this.sendMessage(0x2, Buffer.isBuffer(value) ? value : Buffer.from(value || ''));
  }

  sendMessage(opcode, payload) {
    if (!this.isOpen) return false;
    if (payload.length > this.maxMessageBytes) {
      throw new WebSocketProtocolError('Outgoing message exceeds the configured limit.', 1009);
    }
    if (payload.length <= this.maxFrameBytes) {
      return this.enqueueFrames([encodeFrame(opcode, payload, { masked: this.maskOutgoing })]);
    }
    return this.sendFragmented(opcode, payload, this.maxFrameBytes);
  }

  sendFragmentedText(value, fragmentBytes) {
    return this.sendFragmented(0x1, Buffer.from(String(value || ''), 'utf8'), fragmentBytes);
  }

  sendFragmentedBinary(value, fragmentBytes) {
    const payload = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
    return this.sendFragmented(0x2, payload, fragmentBytes);
  }

  sendFragmented(opcode, payload, fragmentBytes) {
    if (!this.isOpen) return false;
    if (payload.length > this.maxMessageBytes) {
      throw new WebSocketProtocolError('Outgoing message exceeds the configured limit.', 1009);
    }
    const size = boundedInteger(fragmentBytes, this.maxFrameBytes, 1, this.maxFrameBytes);
    if (payload.length === 0) {
      return this.enqueueFrames([encodeFrame(opcode, payload, { masked: this.maskOutgoing })]);
    }
    const frames = [];
    let offset = 0;
    let first = true;
    while (offset < payload.length) {
      const end = Math.min(payload.length, offset + size);
      const fin = end === payload.length;
      frames.push(encodeFrame(first ? opcode : 0x0, payload.subarray(offset, end), {
        masked: this.maskOutgoing,
        fin
      }));
      first = false;
      offset = end;
    }
    return this.enqueueFrames(frames);
  }

  sendPing(payload) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    if (body.length > 125) throw new WebSocketProtocolError('Ping payload exceeds 125 bytes.', 1002);
    if (!this.isOpen) return false;
    const accepted = this.enqueueFrames([encodeFrame(0x9, body, { masked: this.maskOutgoing })]);
    if (accepted) {
      this.awaitingPong = true;
      this.lastPingAt = Date.now();
    }
    return accepted;
  }

  sendPong(payload) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    if (body.length > 125 || this.closed) return false;
    return this.enqueueFrames([encodeFrame(0xA, body, { masked: this.maskOutgoing })]);
  }

  enqueueFrames(frames) {
    if (this.closed || this.socket.destroyed === true || frames.length === 0) return false;
    let totalBytes = 0;
    for (const frame of frames) totalBytes += frame.length;
    const socketBytes = Number.isFinite(this.socket.writableLength) ? this.socket.writableLength : 0;
    if (this.outgoing.length + frames.length > this.maxQueuedFrames ||
        socketBytes + this.outgoingBytes + totalBytes > this.maxQueuedBytes) {
      const error = new WebSocketBackpressureError('WebSocket outgoing queue limit exceeded.');
      this.emit('backpressure', error);
      return false;
    }
    for (const frame of frames) {
      if (!this.writeBlocked && this.outgoing.length === 0) {
        const writable = this.socket.write(frame);
        if (!writable) this.writeBlocked = true;
      } else {
        this.outgoing.push(frame);
        this.outgoingBytes += frame.length;
      }
    }
    return true;
  }

  handleDrain() {
    if (this.closed) return;
    this.writeBlocked = false;
    while (!this.writeBlocked && this.outgoing.length > 0) {
      const frame = this.outgoing.shift();
      this.outgoingBytes -= frame.length;
      const writable = this.socket.write(frame);
      if (!writable) this.writeBlocked = true;
    }
    if (!this.writeBlocked && this.outgoing.length === 0) this.emit('drain');
    this.finishWriteIfNeeded();
  }

  heartbeatTick() {
    if (!this.isOpen) return;
    const now = Date.now();
    if (this.awaitingPong && now - this.lastPingAt >= this.pongTimeoutMs) {
      this.failProtocol(new WebSocketProtocolError('WebSocket heartbeat timed out.', 1001));
      return;
    }
    if (!this.awaitingPong && now - this.lastSeenAt >= this.heartbeatIntervalMs) {
      const payload = Buffer.alloc(8);
      payload.writeBigUInt64BE(BigInt(now), 0);
      if (!this.sendPing(payload)) {
        this.failProtocol(new WebSocketBackpressureError('Heartbeat could not be queued.'));
      }
    }
  }

  close(code, reason) {
    if (this.closed || this.closeSent) return;
    const payload = closePayload(code, reason);
    const accepted = this.enqueueFrames([encodeFrame(0x8, payload, { masked: this.maskOutgoing })]);
    this.closeSent = true;
    if (!accepted) {
      this.terminate();
      return;
    }
    this.armCloseTimer();
  }

  failProtocol(error) {
    if (this.closed) return;
    const failure = error instanceof Error ? error : new Error('WebSocket protocol failure.');
    this.emitError(failure);
    const code = Number.isInteger(failure.closeCode) ? failure.closeCode : 1002;
    this.close(code, code === 1009 ? 'message_too_large' : 'protocol_error');
  }

  armCloseTimer() {
    if (this.closeTimer !== null) return;
    this.closeTimer = setTimeout(() => this.terminate(), this.closeTimeoutMs);
    if (typeof this.closeTimer.unref === 'function') this.closeTimer.unref();
  }

  finishWriteIfNeeded() {
    if (!this.endAfterFlush || this.writeBlocked || this.outgoing.length > 0 || this.socket.destroyed === true) return;
    this.socket.end();
  }

  terminate() {
    if (this.closed) return;
    this.closed = true;
    if (this.socket && this.socket.destroyed !== true) this.socket.destroy();
    this.finalizeClose(false);
  }

  finalizeClose(hadError) {
    if (this.closeEmitted) return;
    this.closed = true;
    this.closeEmitted = true;
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.heartbeatTimer = null;
    this.closeTimer = null;
    this.outgoing = [];
    this.outgoingBytes = 0;
    this.emit('close', {
      hadError: hadError === true,
      closeSent: this.closeSent,
      closeReceived: this.closeReceived,
      code: this.receivedCloseCode,
      reason: this.receivedCloseReason
    });
  }

  emitError(error) {
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }
}

function safeHeaderValue(value, name) {
  const text = String(value || '');
  if (/[\r\n]/.test(text)) throw new Error('Invalid WebSocket ' + name + ' header.');
  return text;
}

function parseHeaders(headerText) {
  const lines = headerText.split('\r\n');
  const statusLine = lines.shift() || '';
  const match = /^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/i.exec(statusLine);
  const statusCode = match ? Number(match[1]) : 0;
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const name = line.substring(0, separator).trim().toLowerCase();
    const value = line.substring(separator + 1).trim();
    headers.set(name, headers.has(name) ? headers.get(name) + ', ' + value : value);
  }
  return { statusCode, headers };
}

function connectionTokenIncludes(value, expected) {
  return String(value || '').split(',').some((token) => token.trim().toLowerCase() === expected);
}

class RawWebSocketClient extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = new URL(String(url || ''));
    if (!['ws:', 'wss:'].includes(this.url.protocol)) throw new Error('WebSocket URL must use ws: or wss:.');
    if (this.url.username || this.url.password) throw new Error('WebSocket URL must not contain credentials.');
    const opts = options && typeof options === 'object' ? options : {};
    this.options = opts;
    this.connectTimeoutMs = boundedInteger(opts.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS, 100, 120000);
    this.handshakeTimeoutMs = boundedInteger(opts.handshakeTimeoutMs, this.connectTimeoutMs, 100, 120000);
    this.reconnectEnabled = opts.reconnect === true;
    this.reconnectMaxAttempts = boundedInteger(opts.reconnectMaxAttempts, 8, 0, 1000);
    this.reconnectMinDelayMs = boundedInteger(opts.reconnectMinDelayMs, 250, 0, 60000);
    this.reconnectMaxDelayMs = boundedInteger(opts.reconnectMaxDelayMs, 10000, this.reconnectMinDelayMs, 10 * 60 * 1000);
    this.reconnectFactor = typeof opts.reconnectFactor === 'number' && Number.isFinite(opts.reconnectFactor)
      ? Math.max(1, Math.min(10, opts.reconnectFactor))
      : 2;
    this.state = 'closed';
    this.peer = null;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.explicitClose = false;
  }

  get isOpen() {
    return this.state === 'open' && this.peer !== null && this.peer.isOpen;
  }

  get bufferedAmount() {
    return this.peer ? this.peer.bufferedAmount : 0;
  }

  connect() {
    if (this.isOpen) return Promise.resolve(this);
    if (this.connectPromise) return this.connectPromise;
    this.explicitClose = false;
    this.state = 'connecting';
    this.connectPromise = this.openSocket()
      .then((peer) => {
        this.peer = peer;
        this.state = 'open';
        this.reconnectAttempts = 0;
        this.wirePeer(peer);
        this.emit('open', this);
        return this;
      })
      .catch((error) => {
        this.state = 'closed';
        this.emitError(error);
        this.scheduleReconnect(error);
        throw error;
      })
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  openSocket() {
    return new Promise((resolve, reject) => {
      const secure = this.url.protocol === 'wss:';
      const port = this.url.port ? Number(this.url.port) : (secure ? 443 : 80);
      const urlHostname = this.url.hostname;
      const host = urlHostname.startsWith('[') && urlHostname.endsWith(']')
        ? urlHostname.substring(1, urlHostname.length - 1)
        : urlHostname;
      const connectOptions = {
        host,
        port
      };
      if (secure) {
        if (typeof this.options.servername === 'string' && this.options.servername.length > 0) {
          connectOptions.servername = this.options.servername;
        } else if (net.isIP(host) === 0) {
          connectOptions.servername = host;
        }
        connectOptions.rejectUnauthorized = this.options.rejectUnauthorized !== false;
        if (this.options.ca) connectOptions.ca = this.options.ca;
        if (this.options.cert) connectOptions.cert = this.options.cert;
        if (this.options.key) connectOptions.key = this.options.key;
      }
      const socket = secure ? tls.connect(connectOptions) : net.createConnection(connectOptions);
      let settled = false;
      let handshakeBuffer = Buffer.alloc(0);
      const key = crypto.randomBytes(16).toString('base64');
      const timeout = setTimeout(() => fail(new Error('WebSocket handshake timed out.')), this.handshakeTimeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
        socket.removeListener(secure ? 'secureConnect' : 'connect', onConnect);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (socket.destroyed !== true) socket.destroy();
        reject(error instanceof Error ? error : new Error('WebSocket connection failed.'));
      };
      const onError = (error) => fail(error);
      const onClose = () => fail(new Error('WebSocket socket closed during handshake.'));
      const onConnect = () => {
        try {
          socket.setTimeout(this.connectTimeoutMs, () => fail(new Error('WebSocket socket timed out.')));
          const path = (this.url.pathname || '/') + (this.url.search || '');
          const defaultPort = secure ? 443 : 80;
          const hostHeaderBase = host.includes(':') ? '[' + host + ']' : host;
          const hostHeader = port === defaultPort ? hostHeaderBase : hostHeaderBase + ':' + String(port);
          const headers = [
            'GET ' + safeHeaderValue(path, 'path') + ' HTTP/1.1',
            'Host: ' + safeHeaderValue(hostHeader, 'host'),
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: ' + key,
            'Sec-WebSocket-Version: 13'
          ];
          if (typeof this.options.origin === 'string' && this.options.origin.length > 0) {
            headers.push('Origin: ' + safeHeaderValue(this.options.origin, 'origin'));
          }
          const extraHeaders = this.options.headers && typeof this.options.headers === 'object'
            ? this.options.headers
            : {};
          for (const name of Object.keys(extraHeaders)) {
            if (!/^[A-Za-z0-9-]+$/.test(name)) throw new Error('Invalid WebSocket header name.');
            const lowered = name.toLowerCase();
            if (['host', 'upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version'].includes(lowered)) {
              throw new Error('Reserved WebSocket header cannot be overridden: ' + name);
            }
            headers.push(name + ': ' + safeHeaderValue(extraHeaders[name], name));
          }
          socket.write(headers.join('\r\n') + '\r\n\r\n');
        } catch (error) {
          fail(error);
        }
      };
      const onData = (chunk) => {
        if (settled) return;
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        if (handshakeBuffer.length > MAX_HANDSHAKE_BYTES) {
          fail(new Error('WebSocket handshake response is too large.'));
          return;
        }
        const marker = handshakeBuffer.indexOf('\r\n\r\n');
        if (marker < 0) return;
        try {
          const headerText = handshakeBuffer.subarray(0, marker).toString('latin1');
          const remaining = handshakeBuffer.subarray(marker + 4);
          const response = parseHeaders(headerText);
          if (response.statusCode !== 101) throw new Error('WebSocket upgrade returned HTTP ' + String(response.statusCode) + '.');
          if (String(response.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
            throw new Error('WebSocket upgrade response is missing Upgrade: websocket.');
          }
          if (!connectionTokenIncludes(response.headers.get('connection'), 'upgrade')) {
            throw new Error('WebSocket upgrade response is missing Connection: Upgrade.');
          }
          const expectedAccept = createAcceptValue(key);
          const actualAccept = String(response.headers.get('sec-websocket-accept') || '');
          const expectedBuffer = Buffer.from(expectedAccept);
          const actualBuffer = Buffer.from(actualAccept);
          if (actualBuffer.length !== expectedBuffer.length ||
              !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
            throw new Error('WebSocket upgrade response has an invalid accept value.');
          }
          settled = true;
          cleanup();
          socket.setTimeout(0);
          socket.pause();
          const peer = new WebSocketFramePeer(socket, {
            maskOutgoing: true,
            requireMaskedIncoming: false,
            maxFrameBytes: this.options.maxFrameBytes,
            maxMessageBytes: this.options.maxMessageBytes,
            maxQueuedBytes: this.options.maxQueuedBytes,
            maxQueuedFrames: this.options.maxQueuedFrames,
            maxFragments: this.options.maxFragments,
            closeTimeoutMs: this.options.closeTimeoutMs,
            heartbeatIntervalMs: this.options.heartbeatIntervalMs,
            pongTimeoutMs: this.options.pongTimeoutMs
          });
          resolve(peer);
          queueMicrotask(() => {
            if (remaining.length > 0) peer.feed(remaining);
            if (socket.destroyed !== true) socket.resume();
          });
        } catch (error) {
          fail(error);
        }
      };
      socket.once(secure ? 'secureConnect' : 'connect', onConnect);
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
    });
  }

  wirePeer(peer) {
    peer.on('message', (value, binary) => {
      this.emit('message', value, binary);
      this.emit(binary ? 'binary' : 'text', value);
    });
    peer.on('ping', (payload) => this.emit('ping', payload));
    peer.on('pong', (payload) => this.emit('pong', payload));
    peer.on('closeFrame', (details) => this.emit('closeFrame', details));
    peer.on('drain', () => this.emit('drain'));
    peer.on('backpressure', (error) => this.emit('backpressure', error));
    peer.on('error', (error) => this.emitError(error));
    peer.on('close', (details) => {
      if (this.peer !== peer) return;
      this.peer = null;
      this.state = 'closed';
      this.emit('close', details);
      this.scheduleReconnect(new Error('WebSocket connection closed.'));
    });
  }

  sendText(value) {
    return this.requirePeer().sendText(value);
  }

  sendJson(value) {
    return this.requirePeer().sendJson(value);
  }

  sendBinary(value) {
    return this.requirePeer().sendBinary(value);
  }

  sendFragmentedText(value, fragmentBytes) {
    return this.requirePeer().sendFragmentedText(value, fragmentBytes);
  }

  sendPing(value) {
    return this.requirePeer().sendPing(value);
  }

  requirePeer() {
    if (!this.isOpen || this.peer === null) throw new Error('WebSocket client is not open.');
    return this.peer;
  }

  close(code, reason) {
    this.explicitClose = true;
    this.clearReconnectTimer();
    if (this.peer) this.peer.close(code, reason);
  }

  terminate() {
    this.explicitClose = true;
    this.clearReconnectTimer();
    if (this.peer) this.peer.terminate();
  }

  scheduleReconnect(error) {
    if (this.explicitClose || !this.reconnectEnabled || this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.emit('reconnectExhausted', { attempts: this.reconnectAttempts, error });
      return;
    }
    const nextAttempt = this.reconnectAttempts + 1;
    if (typeof this.options.shouldReconnect === 'function' &&
        this.options.shouldReconnect(error, nextAttempt) === false) {
      return;
    }
    this.reconnectAttempts = nextAttempt;
    const baseDelay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectMinDelayMs * Math.pow(this.reconnectFactor, Math.max(0, nextAttempt - 1))
    );
    const jitter = baseDelay > 0 ? Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay * 0.2))) : 0;
    const delay = Math.min(this.reconnectMaxDelayMs, baseDelay + jitter);
    const details = { attempt: nextAttempt, delay, error };
    if (typeof this.options.onReconnect === 'function') {
      try {
        this.options.onReconnect(details);
      } catch (hookError) {
        this.emitError(hookError instanceof Error ? hookError : new Error('Reconnect hook failed.'));
      }
    }
    this.emit('reconnectScheduled', details);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // The failed attempt schedules the next retry.
      });
    }, delay);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  clearReconnectTimer() {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  emitError(error) {
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }
}

function connectWebSocket(url, options) {
  const client = new RawWebSocketClient(url, options);
  return client.connect();
}

function createWebSocketClient(url, handlers, options) {
  const callbacks = handlers && typeof handlers === 'object' ? handlers : {};
  const source = options && typeof options === 'object' ? options : {};
  const clientOptions = Object.assign({}, source, {
    reconnect: false
  });
  const client = new RawWebSocketClient(url, clientOptions);
  client.on('open', () => {
    if (typeof callbacks.onOpen === 'function') callbacks.onOpen();
  });
  client.on('text', (value) => {
    if (typeof callbacks.onMessage === 'function') callbacks.onMessage(value);
  });
  client.on('binary', () => {
    if (typeof callbacks.onError === 'function') {
      const error = new WebSocketProtocolError('Relay transport accepts text envelopes only.', 1003);
      error.code = 'relay_protocol_error';
      callbacks.onError(error);
    }
  });
  client.on('error', (error) => {
    if (typeof callbacks.onError === 'function') callbacks.onError(error);
  });
  client.on('close', (details) => {
    if (typeof callbacks.onClose !== 'function') return;
    const value = details && typeof details === 'object' ? details : {};
    callbacks.onClose(
      Number.isInteger(value.code) ? value.code : 1006,
      typeof value.reason === 'string' ? value.reason : ''
    );
  });
  return client;
}

module.exports = {
  RawWebSocketClient,
  WebSocketBackpressureError,
  WebSocketFramePeer,
  WebSocketProtocolError,
  connectWebSocket,
  createWebSocketClient,
  createAcceptValue,
  encodeFrame
};
