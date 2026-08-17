'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const {
  WebSocketFramePeer,
  createAcceptValue
} = require('./websocket-client');

const RELAY_TYPES = new Set([
  'relay.register',
  'relay.attach',
  'relay.frame',
  'relay.detach',
  'relay.ack'
]);
const RELAY_ENVELOPE_KEYS = new Set([
  'type',
  'relayId',
  'connectionId',
  'targetConnectionId',
  'frameId',
  'payload'
]);
const DEFAULT_RELAY_PATH = '/relay';
const DEFAULT_MAX_ENVELOPE_BYTES = 256 * 1024;

function boundedInteger(value, fallback, minimum, maximum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function isLoopbackHost(value) {
  const host = String(value || '').trim().toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

function relayIdEntropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return { entropy, uniqueCharacters: counts.size };
}

function validateRelayId(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 128) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const estimate = relayIdEntropy(value);
  return estimate.uniqueCharacters >= 8 && estimate.entropy >= 3;
}

function validateFrameId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function validateConnectionId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function relayIdFingerprint(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function randomConnectionId() {
  return crypto.randomBytes(18).toString('base64url');
}

function parseEnvelope(text, maxBytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxBytes) {
    return { ok: false, reason: 'envelope_too_large', closeCode: 1009 };
  }
  let source;
  try {
    source = JSON.parse(text);
  } catch (_error) {
    return { ok: false, reason: 'invalid_json', closeCode: 1007 };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ok: false, reason: 'invalid_envelope', closeCode: 1008 };
  }
  const keys = Object.keys(source);
  if (keys.some((key) => !RELAY_ENVELOPE_KEYS.has(key))) {
    return { ok: false, reason: 'unknown_envelope_field', closeCode: 1008 };
  }
  if (!RELAY_TYPES.has(source.type) || !validateRelayId(source.relayId)) {
    return { ok: false, reason: 'invalid_relay_envelope', closeCode: 1008 };
  }
  if (source.connectionId !== undefined && !validateConnectionId(source.connectionId)) {
    return { ok: false, reason: 'invalid_connection_id', closeCode: 1008 };
  }
  if (source.targetConnectionId !== undefined && !validateConnectionId(source.targetConnectionId)) {
    return { ok: false, reason: 'invalid_target_connection_id', closeCode: 1008 };
  }
  if (source.frameId !== undefined && !validateFrameId(source.frameId)) {
    return { ok: false, reason: 'invalid_frame_id', closeCode: 1008 };
  }
  return { ok: true, envelope: source, keys };
}

function websocketKeyValid(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 32) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 16 && decoded.toString('base64') === value;
  } catch (_error) {
    return false;
  }
}

function headerContainsToken(value, expected) {
  return String(value || '').split(',').some((token) => token.trim().toLowerCase() === expected);
}

function requestPath(req) {
  try {
    return new URL(req.url || '/', 'http://relay.invalid').pathname;
  } catch (_error) {
    return '';
  }
}

function rejectUpgrade(socket, statusCode, statusText) {
  if (!socket || socket.destroyed === true) return;
  const body = statusText + '\n';
  socket.write(
    'HTTP/1.1 ' + String(statusCode) + ' ' + statusText + '\r\n' +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Length: ' + String(Buffer.byteLength(body)) + '\r\n' +
    '\r\n' +
    body
  );
  socket.destroy();
}

class RelayBroker {
  constructor(options) {
    const opts = options && typeof options === 'object' ? options : {};
    this.maxEnvelopeBytes = boundedInteger(
      opts.maxEnvelopeBytes,
      DEFAULT_MAX_ENVELOPE_BYTES,
      1024,
      16 * 1024 * 1024
    );
    this.maxConnectionsPerRelay = boundedInteger(opts.maxConnectionsPerRelay, 8, 2, 1024);
    this.maxRelays = boundedInteger(opts.maxRelays, 10000, 1, 1000000);
    this.relayTtlMs = boundedInteger(opts.relayTtlMs, 15 * 60 * 1000, 100, 24 * 60 * 60 * 1000);
    this.registrationTimeoutMs = boundedInteger(opts.registrationTimeoutMs, 15000, 100, 5 * 60 * 1000);
    this.dedupTtlMs = boundedInteger(opts.dedupTtlMs, 5 * 60 * 1000, 100, 60 * 60 * 1000);
    this.maxDedupEntries = boundedInteger(opts.maxDedupEntries, 10000, 16, 1000000);
    this.sweepIntervalMs = boundedInteger(
      opts.sweepIntervalMs,
      Math.min(5000, Math.max(100, Math.floor(this.relayTtlMs / 4))),
      50,
      60000
    );
    this.onAudit = typeof opts.onAudit === 'function' ? opts.onAudit : null;
    this.relays = new Map();
    this.connections = new Map();
    this.nextInternalId = 1;
    this.closed = false;
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    if (typeof this.sweepTimer.unref === 'function') this.sweepTimer.unref();
  }

  accept(peer) {
    if (this.closed) {
      peer.close(1012, 'relay_unavailable');
      return null;
    }
    const record = {
      internalId: this.nextInternalId,
      peer,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      relayId: '',
      connectionId: '',
      role: '',
      closed: false
    };
    this.nextInternalId += 1;
    this.connections.set(peer, record);
    peer.on('message', (value, binary) => {
      if (binary) {
        this.rejectRecord(record, 1003, 'binary_not_supported');
        return;
      }
      this.handleText(record, value);
    });
    peer.on('backpressure', () => this.dropConnection(record, 'backpressure', 1013));
    peer.on('close', () => this.dropConnection(record, 'socket_closed', 1001, true));
    peer.on('error', () => {
      // WebSocketFramePeer handles the close handshake. Never log frame contents.
    });
    this.audit('connection_opened', record);
    return record;
  }

  handleText(record, text) {
    if (record.closed || this.closed) return;
    record.lastActivityAt = Date.now();
    const parsed = parseEnvelope(text, this.maxEnvelopeBytes);
    if (!parsed.ok) {
      this.rejectRecord(record, parsed.closeCode, parsed.reason);
      return;
    }
    const envelope = parsed.envelope;
    if (record.relayId.length > 0) {
      if (envelope.relayId !== record.relayId || envelope.connectionId !== record.connectionId) {
        this.rejectRecord(record, 1008, 'connection_scope_mismatch');
        return;
      }
    } else if (envelope.connectionId !== undefined) {
      this.rejectRecord(record, 1008, 'connection_not_registered');
      return;
    }
    if (envelope.type === 'relay.register') {
      this.handleRegister(record, envelope, parsed.keys);
    } else if (envelope.type === 'relay.attach') {
      this.handleAttach(record, envelope, parsed.keys);
    } else if (envelope.type === 'relay.frame') {
      this.handleFrame(record, envelope, parsed.keys);
    } else if (envelope.type === 'relay.ack') {
      this.handleAck(record, envelope, parsed.keys);
    } else if (envelope.type === 'relay.detach') {
      this.handleDetach(record, envelope, parsed.keys);
    }
  }

  handleRegister(record, envelope, keys) {
    if (record.relayId || keys.includes('targetConnectionId') || keys.includes('frameId') || keys.includes('payload')) {
      this.rejectRecord(record, 1008, 'invalid_register');
      return;
    }
    if (this.relays.has(envelope.relayId)) {
      this.rejectRecord(record, 1008, 'relay_already_registered');
      return;
    }
    if (this.relays.size >= this.maxRelays) {
      this.rejectRecord(record, 1013, 'relay_capacity_exceeded');
      return;
    }
    const now = Date.now();
    const relay = {
      relayId: envelope.relayId,
      owner: record,
      connections: new Map(),
      dedup: new Map(),
      createdAt: now,
      lastActivityAt: now
    };
    this.bindRecord(record, relay, 'owner');
    this.relays.set(relay.relayId, relay);
    this.sendEnvelope(record, {
      type: 'relay.ack',
      relayId: relay.relayId,
      connectionId: record.connectionId
    });
    this.audit('relay_registered', record);
  }

  handleAttach(record, envelope, keys) {
    if (record.relayId || keys.includes('targetConnectionId') || keys.includes('frameId') || keys.includes('payload')) {
      this.rejectRecord(record, 1008, 'invalid_attach');
      return;
    }
    const relay = this.relays.get(envelope.relayId);
    if (!relay || Date.now() - relay.lastActivityAt >= this.relayTtlMs) {
      this.rejectRecord(record, 1008, 'relay_not_found');
      return;
    }
    if (relay.connections.size >= this.maxConnectionsPerRelay) {
      this.rejectRecord(record, 1013, 'relay_connection_limit');
      return;
    }
    this.bindRecord(record, relay, 'attached');
    this.touchRelay(relay);
    this.sendEnvelope(record, {
      type: 'relay.ack',
      relayId: relay.relayId,
      connectionId: record.connectionId
    });
    this.audit('relay_attached', record);
  }

  handleFrame(record, envelope, keys) {
    if (!record.relayId || !keys.includes('frameId') || !keys.includes('payload')) {
      this.rejectRecord(record, 1008, 'invalid_frame');
      return;
    }
    const relay = this.relays.get(record.relayId);
    if (!relay) {
      this.rejectRecord(record, 1008, 'relay_not_found');
      return;
    }
    this.pruneDedup(relay);
    const dedupKey = record.connectionId + ':' + envelope.frameId;
    if (relay.dedup.has(dedupKey)) {
      this.sendFrameAck(record, envelope);
      this.audit('frame_duplicate', record);
      return;
    }
    const targets = this.resolveTargets(relay, record, envelope.targetConnectionId);
    if (envelope.targetConnectionId && targets.length === 0) {
      this.sendEnvelope(record, {
        type: 'relay.detach',
        relayId: relay.relayId,
        connectionId: record.connectionId,
        targetConnectionId: envelope.targetConnectionId,
        frameId: envelope.frameId
      });
      return;
    }
    relay.dedup.set(dedupKey, Date.now());
    while (relay.dedup.size > this.maxDedupEntries) {
      const oldest = relay.dedup.keys().next();
      if (oldest.done) break;
      relay.dedup.delete(oldest.value);
    }
    for (const target of targets) {
      const forwarded = {
        type: 'relay.frame',
        relayId: relay.relayId,
        connectionId: record.connectionId,
        targetConnectionId: target.connectionId,
        frameId: envelope.frameId,
        payload: envelope.payload
      };
      this.sendEnvelope(target, forwarded);
    }
    this.touchRelay(relay);
    this.sendFrameAck(record, envelope, targets.length === 1 ? targets[0].connectionId : '');
    this.audit('frame_routed', record, { targetCount: targets.length });
  }

  handleAck(record, envelope, keys) {
    if (!record.relayId || !keys.includes('frameId') || !keys.includes('targetConnectionId')) {
      this.rejectRecord(record, 1008, 'invalid_ack');
      return;
    }
    const relay = this.relays.get(record.relayId);
    const target = relay ? relay.connections.get(envelope.targetConnectionId) : null;
    if (!relay || !target || target === record) {
      this.rejectRecord(record, 1008, 'ack_target_not_found');
      return;
    }
    const forwarded = {
      type: 'relay.ack',
      relayId: relay.relayId,
      connectionId: record.connectionId,
      targetConnectionId: target.connectionId,
      frameId: envelope.frameId
    };
    if (keys.includes('payload')) forwarded.payload = envelope.payload;
    this.sendEnvelope(target, forwarded);
    this.touchRelay(relay);
    this.audit('ack_routed', record);
  }

  handleDetach(record, envelope, keys) {
    if (!record.relayId || keys.includes('targetConnectionId') || keys.includes('frameId') || keys.includes('payload')) {
      this.rejectRecord(record, 1008, 'invalid_detach');
      return;
    }
    const relayId = record.relayId;
    const connectionId = record.connectionId;
    this.sendEnvelope(record, {
      type: 'relay.ack',
      relayId,
      connectionId
    });
    this.detachBinding(record, 'client_detach');
    this.audit('relay_detached', record, {
      relayFingerprint: relayIdFingerprint(relayId),
      detachedConnectionId: connectionId
    });
  }

  bindRecord(record, relay, role) {
    let connectionId = randomConnectionId();
    while (relay.connections.has(connectionId)) connectionId = randomConnectionId();
    record.relayId = relay.relayId;
    record.connectionId = connectionId;
    record.role = role;
    record.lastActivityAt = Date.now();
    relay.connections.set(connectionId, record);
  }

  resolveTargets(relay, source, targetConnectionId) {
    if (targetConnectionId) {
      const target = relay.connections.get(targetConnectionId);
      return target && target !== source && !target.closed ? [target] : [];
    }
    const targets = [];
    for (const target of relay.connections.values()) {
      if (target !== source && !target.closed) targets.push(target);
    }
    return targets;
  }

  sendFrameAck(record, envelope, resolvedTargetId) {
    const ack = {
      type: 'relay.ack',
      relayId: record.relayId,
      connectionId: record.connectionId,
      frameId: envelope.frameId
    };
    const target = resolvedTargetId || envelope.targetConnectionId;
    if (target) ack.targetConnectionId = target;
    this.sendEnvelope(record, ack);
  }

  sendEnvelope(record, envelope) {
    if (!record || record.closed || !record.peer || record.peer.closed) return false;
    let serialized;
    try {
      serialized = JSON.stringify(envelope);
    } catch (_error) {
      this.rejectRecord(record, 1007, 'envelope_serialization_failed');
      return false;
    }
    if (Buffer.byteLength(serialized, 'utf8') > this.maxEnvelopeBytes) {
      this.rejectRecord(record, 1009, 'envelope_too_large');
      return false;
    }
    const accepted = record.peer.sendText(serialized);
    if (!accepted) {
      this.dropConnection(record, 'backpressure', 1013);
      return false;
    }
    return true;
  }

  rejectRecord(record, code, reason) {
    if (!record || record.closed) return;
    this.audit('connection_rejected', record, { reason });
    this.dropConnection(record, reason, code);
  }

  dropConnection(record, reason, code, peerAlreadyClosed) {
    if (!record || record.closed) return;
    record.closed = true;
    this.connections.delete(record.peer);
    this.detachBinding(record, reason);
    this.audit('connection_closed', record, { reason });
    if (!peerAlreadyClosed && record.peer && !record.peer.closed) {
      record.peer.close(Number.isInteger(code) ? code : 1001, reason);
    }
  }

  detachBinding(record, reason) {
    if (!record || !record.relayId) return;
    const relayId = record.relayId;
    const connectionId = record.connectionId;
    const role = record.role;
    const relay = this.relays.get(relayId);
    record.relayId = '';
    record.connectionId = '';
    record.role = '';
    record.createdAt = Date.now();
    if (!relay) return;

    if (role === 'owner' || relay.owner === record) {
      this.relays.delete(relayId);
      const members = Array.from(relay.connections.values());
      relay.connections.clear();
      relay.dedup.clear();
      for (const member of members) {
        const memberConnectionId = member.connectionId;
        member.relayId = '';
        member.connectionId = '';
        member.role = '';
        member.createdAt = Date.now();
        if (member === record || member.closed) continue;
        this.sendEnvelope(member, {
          type: 'relay.detach',
          relayId,
          connectionId,
          targetConnectionId: memberConnectionId
        });
      }
      this.audit('relay_removed', record, {
        relayFingerprint: relayIdFingerprint(relayId),
        reason
      });
      return;
    }

    relay.connections.delete(connectionId);
    for (const member of Array.from(relay.connections.values())) {
      if (member.closed) continue;
      this.sendEnvelope(member, {
        type: 'relay.detach',
        relayId,
        connectionId,
        targetConnectionId: member.connectionId
      });
    }
    this.touchRelay(relay);
  }

  touchRelay(relay) {
    if (relay) relay.lastActivityAt = Date.now();
  }

  pruneDedup(relay) {
    const cutoff = Date.now() - this.dedupTtlMs;
    for (const [key, timestamp] of relay.dedup.entries()) {
      if (timestamp >= cutoff) break;
      relay.dedup.delete(key);
    }
  }

  sweep() {
    if (this.closed) return;
    const now = Date.now();
    for (const record of Array.from(this.connections.values())) {
      if (!record.relayId && now - record.createdAt >= this.registrationTimeoutMs) {
        this.rejectRecord(record, 1008, 'registration_timeout');
      }
    }
    for (const relay of Array.from(this.relays.values())) {
      this.pruneDedup(relay);
      if (now - relay.lastActivityAt >= this.relayTtlMs) this.expireRelay(relay);
    }
  }

  expireRelay(relay) {
    if (!relay || !this.relays.has(relay.relayId)) return;
    const members = Array.from(relay.connections.values());
    this.relays.delete(relay.relayId);
    relay.connections.clear();
    relay.dedup.clear();
    for (const member of members) {
      member.relayId = '';
      member.connectionId = '';
      member.role = '';
      if (!member.closed && member.peer && !member.peer.closed) member.peer.close(1001, 'relay_expired');
    }
    this.audit('relay_expired', relay.owner, {
      relayFingerprint: relayIdFingerprint(relay.relayId)
    });
  }

  stats() {
    let boundConnections = 0;
    for (const record of this.connections.values()) {
      if (record.relayId) boundConnections += 1;
    }
    return {
      activeRelays: this.relays.size,
      websocketConnections: this.connections.size,
      boundConnections
    };
  }

  audit(event, record, extra) {
    if (!this.onAudit) return;
    const details = {
      event,
      connectionId: record && record.connectionId ? record.connectionId : '',
      relayFingerprint: record && record.relayId ? relayIdFingerprint(record.relayId) : ''
    };
    if (extra && Number.isFinite(extra.targetCount)) details.targetCount = extra.targetCount;
    if (extra && typeof extra.reason === 'string') details.reason = extra.reason;
    if (extra && typeof extra.relayFingerprint === 'string') details.relayFingerprint = extra.relayFingerprint;
    if (extra && typeof extra.detachedConnectionId === 'string') {
      details.detachedConnectionId = extra.detachedConnectionId;
    }
    try {
      this.onAudit(details);
    } catch (_error) {
      // Audit consumers cannot affect routing.
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.sweepTimer);
    for (const record of Array.from(this.connections.values())) {
      record.closed = true;
      if (record.peer && !record.peer.closed) record.peer.close(1001, 'relay_shutdown');
    }
    this.connections.clear();
    this.relays.clear();
  }
}

class RelayServer extends EventEmitter {
  constructor(options) {
    super();
    const opts = options && typeof options === 'object' ? options : {};
    this.options = opts;
    this.host = typeof opts.host === 'string' && opts.host.length > 0 ? opts.host : '127.0.0.1';
    this.port = boundedInteger(opts.port, 0, 0, 65535);
    this.path = typeof opts.path === 'string' && opts.path.startsWith('/') ? opts.path : DEFAULT_RELAY_PATH;
    this.allowedOrigins = Array.isArray(opts.allowedOrigins)
      ? opts.allowedOrigins.filter((value) => typeof value === 'string' && value.length > 0)
      : [];
    this.maxEnvelopeBytes = boundedInteger(
      opts.maxEnvelopeBytes,
      DEFAULT_MAX_ENVELOPE_BYTES,
      1024,
      16 * 1024 * 1024
    );
    this.maxFrameBytes = boundedInteger(
      opts.maxFrameBytes,
      this.maxEnvelopeBytes,
      1024,
      this.maxEnvelopeBytes
    );
    this.maxQueuedBytes = boundedInteger(opts.maxQueuedBytes, 1024 * 1024, 1024, 128 * 1024 * 1024);
    this.maxQueuedFrames = boundedInteger(opts.maxQueuedFrames, 256, 1, 65536);
    this.heartbeatIntervalMs = boundedInteger(opts.heartbeatIntervalMs, 30000, 0, 10 * 60 * 1000);
    this.pongTimeoutMs = boundedInteger(opts.pongTimeoutMs, 15000, 100, 10 * 60 * 1000);
    this.broker = new RelayBroker(opts);
    this.server = null;
    this.secure = false;
    this.sockets = new Set();
  }

  start() {
    if (this.server) return Promise.resolve(this.address());
    const tlsOptions = this.resolveTlsOptions();
    this.secure = tlsOptions !== null;
    if (!this.secure && !isLoopbackHost(this.host)) {
      return Promise.reject(new Error('Plain ws relay is restricted to loopback; configure TLS for non-loopback hosts.'));
    }
    const requestHandler = (req, res) => this.handleHttp(req, res);
    this.server = this.secure
      ? https.createServer(tlsOptions, requestHandler)
      : http.createServer(requestHandler);
    this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    this.server.on('clientError', (_error, socket) => {
      if (socket && socket.destroyed !== true) socket.destroy();
    });
    this.server.on('error', (error) => this.emitError(error));
    return new Promise((resolve, reject) => {
      const server = this.server;
      const onError = (error) => {
        server.removeListener('listening', onListening);
        this.server = null;
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(this.address());
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.port, this.host);
    });
  }

  resolveTlsOptions() {
    const tlsOptions = this.options.tls && typeof this.options.tls === 'object'
      ? Object.assign({}, this.options.tls)
      : {};
    if (this.options.key) tlsOptions.key = this.options.key;
    if (this.options.cert) tlsOptions.cert = this.options.cert;
    const hasKey = tlsOptions.key !== undefined && tlsOptions.key !== null;
    const hasCert = tlsOptions.cert !== undefined && tlsOptions.cert !== null;
    if (hasKey !== hasCert) throw new Error('Relay TLS requires both key and cert.');
    return hasKey && hasCert ? tlsOptions : null;
  }

  handleHttp(req, res) {
    if (req.method === 'GET' && requestPath(req) === '/health') {
      const body = JSON.stringify({
        ok: true,
        service: 'agent-bridge-relay',
        secure: this.secure,
        stats: this.broker.stats()
      });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
      });
      res.end(body);
      return;
    }
    res.writeHead(426, {
      connection: 'close',
      upgrade: 'websocket',
      'content-type': 'text/plain; charset=utf-8'
    });
    res.end('WebSocket upgrade required.\n');
  }

  handleUpgrade(req, socket, head) {
    if (requestPath(req) !== this.path) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' ||
        !headerContainsToken(req.headers.connection, 'upgrade') ||
        String(req.headers['sec-websocket-version'] || '') !== '13') {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!websocketKeyValid(key)) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (origin && this.allowedOrigins.length > 0 && !this.allowedOrigins.includes(origin)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    if (typeof this.options.authorizeUpgrade === 'function') {
      let authorized = false;
      try {
        authorized = this.options.authorizeUpgrade(req) === true;
      } catch (_error) {
        authorized = false;
      }
      if (!authorized) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + createAcceptValue(key) + '\r\n' +
      '\r\n'
    );
    const peer = new WebSocketFramePeer(socket, {
      maskOutgoing: false,
      requireMaskedIncoming: true,
      maxFrameBytes: this.maxFrameBytes,
      maxMessageBytes: this.maxEnvelopeBytes,
      maxQueuedBytes: this.maxQueuedBytes,
      maxQueuedFrames: this.maxQueuedFrames,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      pongTimeoutMs: this.pongTimeoutMs
    });
    this.broker.accept(peer);
    if (head && head.length > 0) peer.feed(head);
  }

  address() {
    if (!this.server) return null;
    const address = this.server.address();
    if (!address || typeof address !== 'object') return null;
    const displayHost = address.address.includes(':') ? '[' + address.address + ']' : address.address;
    return {
      host: address.address,
      port: address.port,
      family: address.family,
      secure: this.secure,
      url: (this.secure ? 'wss://' : 'ws://') + displayHost + ':' + String(address.port) + this.path
    };
  }

  stop() {
    this.broker.close();
    if (!this.server) return Promise.resolve();
    const server = this.server;
    this.server = null;
    return new Promise((resolve) => {
      let settled = false;
      let fallback = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (fallback !== null) clearTimeout(fallback);
        resolve();
      };
      fallback = setTimeout(finish, 1000);
      server.close(finish);
      for (const socket of Array.from(this.sockets)) {
        if (socket.destroyed !== true) socket.destroy();
      }
      this.sockets.clear();
    });
  }

  emitError(error) {
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }
}

function createRelayServer(options) {
  return new RelayServer(options);
}

async function runStandalone() {
  const keyPath = process.env.AGENT_BRIDGE_RELAY_TLS_KEY_FILE || '';
  const certPath = process.env.AGENT_BRIDGE_RELAY_TLS_CERT_FILE || '';
  if ((keyPath && !certPath) || (!keyPath && certPath)) {
    throw new Error('Both AGENT_BRIDGE_RELAY_TLS_KEY_FILE and AGENT_BRIDGE_RELAY_TLS_CERT_FILE are required.');
  }
  const options = {
    host: process.env.AGENT_BRIDGE_RELAY_HOST || '127.0.0.1',
    port: Number(process.env.AGENT_BRIDGE_RELAY_PORT || 8788)
  };
  if (keyPath && certPath) {
    options.key = fs.readFileSync(keyPath);
    options.cert = fs.readFileSync(certPath);
  }
  const relay = createRelayServer(options);
  const address = await relay.start();
  process.stdout.write('Agent Bridge Relay listening on ' + address.url + '\n');
  const shutdown = () => {
    relay.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  runStandalone().catch((error) => {
    process.stderr.write('Relay startup failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  RelayBroker,
  RelayServer,
  createRelayServer,
  parseEnvelope,
  relayIdFingerprint,
  validateRelayId
};
