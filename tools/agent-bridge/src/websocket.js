'use strict';

const crypto = require('crypto');

function createAcceptValue(key) {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

class WebSocketConnection {
  constructor(socket, handlers) {
    this.socket = socket;
    this.handlers = handlers;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.closeHandled = false;
    this.lastSeenAt = Date.now();

    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('close', () => this.handleClose());
    socket.on('error', () => this.handleClose());
  }

  handleData(chunk) {
    if (this.closed) {
      return;
    }
    this.lastSeenAt = Date.now();
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const frame = this.readFrame();
      if (!frame) {
        return;
      }
      if (frame.opcode === 0x1) {
        this.handlers.onMessage(frame.payload.toString('utf8'), this);
      } else if (frame.opcode === 0x2) {
        if (this.handlers && typeof this.handlers.onBinary === 'function') {
          this.handlers.onBinary(frame.payload, this);
        }
      } else if (frame.opcode === 0x8) {
        this.close();
        return;
      } else if (frame.opcode === 0x9) {
        this.sendFrame(0xA, frame.payload);
      } else if (frame.opcode === 0xA) {
        this.lastSeenAt = Date.now();
        if (this.handlers && typeof this.handlers.onPong === 'function') {
          this.handlers.onPong(this);
        }
      }
    }
  }

  readFrame() {
    if (this.buffer.length < 2) {
      return null;
    }
    const first = this.buffer[0];
    const second = this.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (this.buffer.length < offset + 2) {
        return null;
      }
      length = this.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (this.buffer.length < offset + 8) {
        return null;
      }
      const bigLength = this.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        this.close();
        return null;
      }
      length = Number(bigLength);
      offset += 8;
    }

    let mask = null;
    if (masked) {
      if (this.buffer.length < offset + 4) {
        return null;
      }
      mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (this.buffer.length < offset + length) {
      return null;
    }

    const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
    this.buffer = this.buffer.subarray(offset + length);

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = payload[index] ^ mask[index % 4];
      }
    }

    return { opcode, payload };
  }

  sendJson(value) {
    this.sendText(JSON.stringify(value));
  }

  sendText(text) {
    this.sendFrame(0x1, Buffer.from(text, 'utf8'));
  }

  sendBinary(payload) {
    this.sendFrame(0x2, Buffer.from(payload));
  }

  sendPing() {
    this.sendFrame(0x9, Buffer.alloc(0));
  }

  sendFrame(opcode, payload) {
    if (this.closed) {
      return;
    }
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    header[0] = 0x80 | opcode;
    this.socket.write(Buffer.concat([header, payload]));
  }

  close() {
    if (this.closed) {
      return;
    }
    try {
      this.sendFrame(0x8, Buffer.alloc(0));
    } catch (_error) {
      // Ignore close write failures.
    }
    this.closed = true;
    this.socket.destroy();
    this.handleClose();
  }

  handleClose() {
    if (this.closeHandled) {
      return;
    }
    this.closeHandled = true;
    if (this.handlers && typeof this.handlers.onClose === 'function') {
      this.handlers.onClose(this);
    }
  }
}

function acceptWebSocket(req, socket, head, handlers) {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || key.length === 0) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return null;
  }

  const acceptValue = createAcceptValue(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptValue + '\r\n' +
    '\r\n'
  );

  const connection = new WebSocketConnection(socket, handlers);
  if (head && head.length > 0) {
    connection.handleData(head);
  }
  if (handlers && typeof handlers.onOpen === 'function') {
    handlers.onOpen(connection);
  }
  return connection;
}

module.exports = {
  acceptWebSocket,
  WebSocketConnection
};
