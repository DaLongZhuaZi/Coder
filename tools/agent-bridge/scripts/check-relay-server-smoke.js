'use strict';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const { EventEmitter } = require('events');
const {
  RelayBroker,
  createRelayServer,
  parseEnvelope,
  validateRelayId
} = require('../src/relay-server');
const {
  RawWebSocketClient,
  WebSocketFramePeer,
  createAcceptValue,
  encodeFrame
} = require('../src/websocket-client');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function relayId() {
  return crypto.randomBytes(32).toString('base64url');
}

function frameId(prefix) {
  return String(prefix || 'frame') + '_' + crypto.randomBytes(12).toString('base64url');
}

function waitForEvent(emitter, eventName, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for ' + eventName + '.'));
    }, Number.isFinite(timeoutMs) ? timeoutMs : 3000);
    const handler = (...args) => {
      try {
        if (typeof predicate === 'function' && !predicate(...args)) return;
        cleanup();
        resolve(args.length <= 1 ? args[0] : args);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      emitter.removeListener(eventName, handler);
    };
    emitter.on(eventName, handler);
  });
}

function waitForEnvelope(client, predicate, timeoutMs) {
  return waitForEvent(client, 'text', (text) => {
    let value;
    try {
      value = JSON.parse(text);
    } catch (_error) {
      return false;
    }
    return predicate(value);
  }, timeoutMs).then((text) => JSON.parse(text));
}

function waitUntil(predicate, timeoutMs) {
  return new Promise(async (resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) {
        resolve();
        return;
      }
      await delay(10);
    }
    reject(new Error('Condition was not reached before timeout.'));
  });
}

async function connectClient(url, options) {
  const client = new RawWebSocketClient(url, options || {});
  client.on('error', () => {
    // Tests assert close/reconnect behavior explicitly.
  });
  await client.connect();
  return client;
}

async function closeClient(client) {
  if (!client) return;
  if (!client.peer && client.state === 'closed') return;
  const closed = waitForEvent(client, 'close', null, 1000).catch(() => null);
  client.close(1000, 'test_complete');
  await closed;
  if (client.peer) client.terminate();
}

async function register(client, id) {
  const ack = waitForEnvelope(
    client,
    (value) => value.type === 'relay.ack' && value.relayId === id &&
      typeof value.connectionId === 'string' && !value.frameId,
    3000
  );
  assert.strictEqual(client.sendJson({ type: 'relay.register', relayId: id }), true);
  return ack;
}

async function attach(client, id) {
  const ack = waitForEnvelope(
    client,
    (value) => value.type === 'relay.ack' && value.relayId === id &&
      typeof value.connectionId === 'string' && !value.frameId,
    3000
  );
  assert.strictEqual(client.sendJson({ type: 'relay.attach', relayId: id }), true);
  return ack;
}

class FakePeer extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
    this.sent = [];
    this.rejectFrames = false;
    this.closeCode = 0;
    this.closeReason = '';
  }

  sendText(text) {
    const envelope = JSON.parse(text);
    if (this.rejectFrames && envelope.type === 'relay.frame') return false;
    this.sent.push(envelope);
    return true;
  }

  close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.emit('close', { code, reason });
  }
}

class SlowSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writableLength = 0;
  }

  setNoDelay() {
  }

  write(buffer) {
    this.writableLength += buffer.length;
    return false;
  }

  end() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('close', false);
  }
}

async function checkValidationAndBackpressure() {
  const validId = relayId();
  assert.strictEqual(validateRelayId(validId), true, 'random relay id should satisfy entropy policy');
  assert.strictEqual(validateRelayId('short'), false, 'short relay id should be rejected');
  assert.strictEqual(validateRelayId('A'.repeat(64)), false, 'low-entropy relay id should be rejected');
  const opaque = { nested: { secret: 'never-inspect-this' }, bytes: 'AAECAw==' };
  const parsed = parseEnvelope(JSON.stringify({
    type: 'relay.frame',
    relayId: validId,
    connectionId: crypto.randomBytes(18).toString('base64url'),
    frameId: frameId('opaque'),
    payload: opaque
  }), 65536);
  assert.strictEqual(parsed.ok, true, 'valid opaque envelope should parse');
  assert.deepStrictEqual(parsed.envelope.payload, opaque, 'parser should preserve opaque payload unchanged');
  assert.strictEqual(parseEnvelope(JSON.stringify({
    type: 'relay.frame',
    relayId: validId,
    frameId: frameId('bad'),
    payload: opaque,
    unexpected: true
  }), 65536).ok, false, 'unknown outer fields should be rejected');

  const audits = [];
  const broker = new RelayBroker({
    onAudit: (entry) => audits.push(entry),
    sweepIntervalMs: 1000
  });
  const owner = new FakePeer();
  const target = new FakePeer();
  broker.accept(owner);
  broker.accept(target);
  owner.emit('message', JSON.stringify({ type: 'relay.register', relayId: validId }), false);
  const ownerAck = owner.sent.find((item) => item.type === 'relay.ack');
  target.emit('message', JSON.stringify({ type: 'relay.attach', relayId: validId }), false);
  const targetAck = target.sent.find((item) => item.type === 'relay.ack');
  assert(ownerAck && targetAck, 'fake peers should register and attach');
  target.rejectFrames = true;
  owner.emit('message', JSON.stringify({
    type: 'relay.frame',
    relayId: validId,
    connectionId: ownerAck.connectionId,
    targetConnectionId: targetAck.connectionId,
    frameId: frameId('slow'),
    payload: { secret: 'payload-must-not-reach-audit' }
  }), false);
  assert.strictEqual(target.closed, true, 'slow target should be disconnected on relay backpressure');
  assert.strictEqual(target.closeCode, 1013, 'slow target should receive retry-later close code');
  assert.strictEqual(broker.stats().boundConnections, 1, 'backpressured target should be removed from relay');
  assert(!JSON.stringify(audits).includes('payload-must-not-reach-audit'), 'audit records must not include payload');
  broker.close();

  const slowSocket = new SlowSocket();
  const peer = new WebSocketFramePeer(slowSocket, {
    maskOutgoing: true,
    requireMaskedIncoming: false,
    maxFrameBytes: 1024,
    maxMessageBytes: 2048,
    maxQueuedBytes: 1024,
    maxQueuedFrames: 4
  });
  let backpressureSeen = false;
  peer.on('backpressure', () => {
    backpressureSeen = true;
  });
  assert.strictEqual(peer.sendText('x'.repeat(700)), true, 'first slow-socket frame should enter socket buffer');
  assert.strictEqual(peer.sendText('y'.repeat(700)), false, 'per-connection byte limit should reject more output');
  assert.strictEqual(backpressureSeen, true, 'peer should expose a backpressure event');
  peer.terminate();
}

function startFrameTestServer(handler) {
  const server = http.createServer();
  let connectionCount = 0;
  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
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
      maxFrameBytes: 8192,
      maxMessageBytes: 16384
    });
    peer.on('error', () => {
    });
    if (head && head.length > 0) peer.feed(head);
    connectionCount += 1;
    handler(peer, connectionCount);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: 'ws://127.0.0.1:' + String(address.port) + '/test'
      });
    });
  });
}

function stopHttpServer(server) {
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
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
}

async function checkRawClientFramesAndReconnect() {
  let pongSeen = false;
  const fixture = await startFrameTestServer((peer) => {
    peer.on('pong', (payload) => {
      if (payload.toString('utf8') === 'probe') pongSeen = true;
    });
    setTimeout(() => {
      peer.enqueueFrames([
        encodeFrame(0x1, Buffer.from('hello ', 'utf8'), { fin: false }),
        encodeFrame(0x9, Buffer.from('probe', 'utf8')),
        encodeFrame(0x0, Buffer.from('world', 'utf8'), { fin: true })
      ]);
    }, 10);
  });
  const client = await connectClient(fixture.url);
  const message = await waitForEvent(client, 'text', (value) => value === 'hello world', 3000);
  assert.strictEqual(message, 'hello world', 'raw client should assemble fragmented text around a ping');
  await waitUntil(() => pongSeen, 1000);
  await closeClient(client);
  await stopHttpServer(fixture.server);

  let reconnectHooks = 0;
  const reconnectFixture = await startFrameTestServer((peer, count) => {
    if (count === 1) {
      setTimeout(() => peer.terminate(), 20);
      return;
    }
    setTimeout(() => peer.sendText('reconnected'), 20);
  });
  const reconnecting = await connectClient(reconnectFixture.url, {
    reconnect: true,
    reconnectMaxAttempts: 3,
    reconnectMinDelayMs: 10,
    reconnectMaxDelayMs: 20,
    onReconnect: () => {
      reconnectHooks += 1;
    }
  });
  const reconnected = await waitForEvent(
    reconnecting,
    'text',
    (value) => value === 'reconnected',
    3000
  );
  assert.strictEqual(reconnected, 'reconnected', 'raw client should reconnect after an unexpected close');
  assert(reconnectHooks >= 1, 'raw client should invoke reconnect hook');
  await closeClient(reconnecting);
  await stopHttpServer(reconnectFixture.server);

  const stalledServer = net.createServer(() => {
    // Keep the TCP connection open without answering the HTTP upgrade.
  });
  await new Promise((resolve, reject) => {
    stalledServer.once('error', reject);
    stalledServer.listen(0, '127.0.0.1', resolve);
  });
  const stalledAddress = stalledServer.address();
  const timedClient = new RawWebSocketClient(
    'ws://127.0.0.1:' + String(stalledAddress.port) + '/stalled',
    { handshakeTimeoutMs: 100, connectTimeoutMs: 100 }
  );
  let timeoutError = null;
  try {
    await timedClient.connect();
  } catch (error) {
    timeoutError = error;
  }
  assert(timeoutError instanceof Error && timeoutError.message.includes('timed out'),
    'raw client should enforce handshake timeout');
  timedClient.terminate();
  await stopHttpServer(stalledServer);
}

async function checkRelayIntegration() {
  const relay = createRelayServer({
    host: '127.0.0.1',
    port: 0,
    maxEnvelopeBytes: 64 * 1024,
    maxFrameBytes: 64 * 1024,
    maxConnectionsPerRelay: 2,
    maxQueuedBytes: 256 * 1024,
    maxQueuedFrames: 128,
    relayTtlMs: 5000,
    heartbeatIntervalMs: 50,
    pongTimeoutMs: 500,
    sweepIntervalMs: 50
  });
  const address = await relay.start();
  const clients = [];
  try {
    const owner = await connectClient(address.url, {
      maxFrameBytes: 64 * 1024,
      maxMessageBytes: 64 * 1024
    });
    const attached = await connectClient(address.url, {
      maxFrameBytes: 64 * 1024,
      maxMessageBytes: 64 * 1024
    });
    clients.push(owner, attached);
    const id = relayId();
    const ownerAck = await register(owner, id);
    const attachedAck = await attach(attached, id);

    const opaquePayload = {
      ciphertext: crypto.randomBytes(128).toString('base64'),
      nonce: crypto.randomBytes(24).toString('base64'),
      nested: { contentType: 'application/octet-stream', sequence: 7 }
    };
    const opaqueFrameId = frameId('opaque');
    const receivedOpaque = waitForEnvelope(
      attached,
      (value) => value.type === 'relay.frame' && value.frameId === opaqueFrameId,
      3000
    );
    const routedAck = waitForEnvelope(
      owner,
      (value) => value.type === 'relay.ack' && value.frameId === opaqueFrameId,
      3000
    );
    owner.sendJson({
      type: 'relay.frame',
      relayId: id,
      connectionId: ownerAck.connectionId,
      targetConnectionId: attachedAck.connectionId,
      frameId: opaqueFrameId,
      payload: opaquePayload
    });
    const routed = await receivedOpaque;
    await routedAck;
    assert.deepStrictEqual(routed.payload, opaquePayload, 'relay should preserve opaque payload exactly');
    assert.strictEqual(routed.connectionId, ownerAck.connectionId, 'relay should identify the sending connection');
    assert.strictEqual(routed.targetConnectionId, attachedAck.connectionId, 'relay should target one connection');

    const endpointAckPayload = { encryptedReceipt: crypto.randomBytes(24).toString('base64') };
    const endpointAck = waitForEnvelope(
      owner,
      (value) => value.type === 'relay.ack' && value.frameId === opaqueFrameId &&
        value.connectionId === attachedAck.connectionId && value.payload,
      3000
    );
    attached.sendJson({
      type: 'relay.ack',
      relayId: id,
      connectionId: attachedAck.connectionId,
      targetConnectionId: ownerAck.connectionId,
      frameId: opaqueFrameId,
      payload: endpointAckPayload
    });
    assert.deepStrictEqual((await endpointAck).payload, endpointAckPayload, 'endpoint ack payload should remain opaque');

    const duplicateId = frameId('duplicate');
    let duplicateDeliveries = 0;
    const duplicateHandler = (text) => {
      const value = JSON.parse(text);
      if (value.type === 'relay.frame' && value.frameId === duplicateId) duplicateDeliveries += 1;
    };
    attached.on('text', duplicateHandler);
    const firstDelivery = waitForEnvelope(
      attached,
      (value) => value.type === 'relay.frame' && value.frameId === duplicateId,
      3000
    );
    const duplicateEnvelope = {
      type: 'relay.frame',
      relayId: id,
      connectionId: ownerAck.connectionId,
      targetConnectionId: attachedAck.connectionId,
      frameId: duplicateId,
      payload: { once: true }
    };
    owner.sendJson(duplicateEnvelope);
    await firstDelivery;
    owner.sendJson(duplicateEnvelope);
    await delay(100);
    attached.removeListener('text', duplicateHandler);
    assert.strictEqual(duplicateDeliveries, 1, 'duplicate frameId should not be delivered twice');

    const semanticOrder = [9, 2, 7, 1];
    const orderedIds = semanticOrder.map((value) => frameId('order_' + String(value)));
    const receivedOrder = [];
    const orderDone = new Promise((resolve) => {
      const handler = (text) => {
        const value = JSON.parse(text);
        const index = orderedIds.indexOf(value.frameId);
        if (value.type !== 'relay.frame' || index < 0) return;
        receivedOrder.push(value.payload.sequence);
        if (receivedOrder.length === orderedIds.length) {
          attached.removeListener('text', handler);
          resolve();
        }
      };
      attached.on('text', handler);
    });
    for (let index = 0; index < semanticOrder.length; index += 1) {
      owner.sendJson({
        type: 'relay.frame',
        relayId: id,
        connectionId: ownerAck.connectionId,
        targetConnectionId: attachedAck.connectionId,
        frameId: orderedIds[index],
        payload: { sequence: semanticOrder[index] }
      });
    }
    await Promise.race([
      orderDone,
      delay(3000).then(() => {
        throw new Error('Ordered frames were not delivered.');
      })
    ]);
    assert.deepStrictEqual(receivedOrder, semanticOrder, 'relay should preserve arrival order without interpreting sequence');

    const fragmentedId = frameId('fragmented');
    const fragmentedResult = waitForEnvelope(
      attached,
      (value) => value.type === 'relay.frame' && value.frameId === fragmentedId,
      3000
    );
    owner.sendFragmentedText(JSON.stringify({
      type: 'relay.frame',
      relayId: id,
      connectionId: ownerAck.connectionId,
      targetConnectionId: attachedAck.connectionId,
      frameId: fragmentedId,
      payload: { fragmented: true }
    }), 13);
    assert.strictEqual((await fragmentedResult).payload.fragmented, true, 'relay should accept fragmented client messages');

    const streamCount = 64;
    const streamPrefix = 'stream_' + crypto.randomBytes(4).toString('hex') + '_';
    const streamSequences = [];
    const streamDone = new Promise((resolve) => {
      const handler = (text) => {
        const value = JSON.parse(text);
        if (value.type !== 'relay.frame' || !String(value.frameId || '').startsWith(streamPrefix)) return;
        streamSequences.push(value.payload.index);
        if (streamSequences.length === streamCount) {
          attached.removeListener('text', handler);
          resolve();
        }
      };
      attached.on('text', handler);
    });
    for (let index = 0; index < streamCount; index += 1) {
      const accepted = owner.sendJson({
        type: 'relay.frame',
        relayId: id,
        connectionId: ownerAck.connectionId,
        targetConnectionId: attachedAck.connectionId,
        frameId: streamPrefix + String(index).padStart(8, '0'),
        payload: { index, ciphertext: 'x'.repeat(256) }
      });
      assert.strictEqual(accepted, true, 'long stream frame should fit queue limits');
    }
    await Promise.race([
      streamDone,
      delay(5000).then(() => {
        throw new Error('Long relay stream did not complete.');
      })
    ]);
    assert.deepStrictEqual(
      streamSequences,
      Array.from({ length: streamCount }, (_value, index) => index),
      'long relay stream should preserve frame order'
    );

    const weakClient = await connectClient(address.url);
    clients.push(weakClient);
    const weakClose = waitForEvent(weakClient, 'closeFrame', null, 3000);
    weakClient.sendJson({ type: 'relay.register', relayId: 'A'.repeat(64) });
    assert.strictEqual((await weakClose).code, 1008, 'low-entropy registration should close with policy violation');

    const duplicateOwner = await connectClient(address.url);
    clients.push(duplicateOwner);
    const duplicateClose = waitForEvent(duplicateOwner, 'closeFrame', null, 3000);
    duplicateOwner.sendJson({ type: 'relay.register', relayId: id });
    assert.strictEqual((await duplicateClose).code, 1008, 'duplicate relay registration should be rejected');

    const overCapacity = await connectClient(address.url);
    clients.push(overCapacity);
    const capacityClose = waitForEvent(overCapacity, 'closeFrame', null, 3000);
    overCapacity.sendJson({ type: 'relay.attach', relayId: id });
    assert.strictEqual((await capacityClose).code, 1013, 'per-relay connection cap should be enforced');

    const attachedDisconnected = waitForEnvelope(
      owner,
      (value) => value.type === 'relay.detach' && value.connectionId === attachedAck.connectionId,
      3000
    );
    attached.terminate();
    await attachedDisconnected;
    await waitUntil(() => relay.broker.stats().boundConnections === 1, 1000);

    const replacement = await connectClient(address.url);
    clients.push(replacement);
    const replacementAck = await attach(replacement, id);
    const explicitDetachNotice = waitForEnvelope(
      owner,
      (value) => value.type === 'relay.detach' && value.connectionId === replacementAck.connectionId,
      3000
    );
    const explicitDetachAck = waitForEnvelope(
      replacement,
      (value) => value.type === 'relay.ack' && value.connectionId === replacementAck.connectionId && !value.frameId,
      3000
    );
    replacement.sendJson({
      type: 'relay.detach',
      relayId: id,
      connectionId: replacementAck.connectionId
    });
    await explicitDetachAck;
    await explicitDetachNotice;
    await waitUntil(() => relay.broker.stats().boundConnections === 1, 1000);

    const finalAttached = await connectClient(address.url);
    clients.push(finalAttached);
    const finalAttachedAck = await attach(finalAttached, id);
    const ownerDisconnected = waitForEnvelope(
      finalAttached,
      (value) => value.type === 'relay.detach' && value.connectionId === ownerAck.connectionId &&
        value.targetConnectionId === finalAttachedAck.connectionId,
      3000
    );
    owner.terminate();
    await ownerDisconnected;
    await waitUntil(() => relay.broker.stats().activeRelays === 0, 1000);
  } finally {
    for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
      const client = clients[clientIndex];
      try {
        await closeClient(client);
      } catch (_error) {
        client.terminate();
      }
    }
    await relay.stop();
  }
}

async function checkRelayLimitsAndTtl() {
  const limitedRelay = createRelayServer({
    host: '127.0.0.1',
    port: 0,
    maxEnvelopeBytes: 2048,
    maxFrameBytes: 2048,
    heartbeatIntervalMs: 0,
    relayTtlMs: 5000
  });
  const limitedAddress = await limitedRelay.start();
  const oversizedClient = await connectClient(limitedAddress.url, {
    maxFrameBytes: 8192,
    maxMessageBytes: 8192
  });
  try {
    const id = relayId();
    const ack = await register(oversizedClient, id);
    const tooLarge = waitForEvent(oversizedClient, 'closeFrame', null, 3000);
    oversizedClient.sendJson({
      type: 'relay.frame',
      relayId: id,
      connectionId: ack.connectionId,
      frameId: frameId('oversized'),
      payload: { ciphertext: 'z'.repeat(4096) }
    });
    assert.strictEqual((await tooLarge).code, 1009, 'oversized WebSocket frame should close with message-too-large');
  } finally {
    await closeClient(oversizedClient);
    await limitedRelay.stop();
  }

  const ttlRelay = createRelayServer({
    host: '127.0.0.1',
    port: 0,
    relayTtlMs: 150,
    sweepIntervalMs: 50,
    heartbeatIntervalMs: 0
  });
  const ttlAddress = await ttlRelay.start();
  const ttlClient = await connectClient(ttlAddress.url);
  try {
    await register(ttlClient, relayId());
    const expired = await waitForEvent(ttlClient, 'closeFrame', null, 3000);
    assert.strictEqual(expired.code, 1001, 'idle relay should expire and close its connection');
    await waitUntil(() => ttlRelay.broker.stats().activeRelays === 0, 1000);
  } finally {
    await closeClient(ttlClient);
    await ttlRelay.stop();
  }
}

async function main() {
  await checkValidationAndBackpressure();
  await checkRawClientFramesAndReconnect();
  await checkRelayIntegration();
  await checkRelayLimitsAndTtl();
  console.log('relay server smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
