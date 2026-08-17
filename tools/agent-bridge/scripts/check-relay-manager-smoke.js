'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RelayRole,
  createEncryptedSession,
  createPairingProof,
  generateEphemeralKeyPair,
  signHandshake,
  verifyHandshake
} = require('../src/relay-crypto');
const { publicKeyFingerprint } = require('../src/relay-identity-store');
const {
  HANDSHAKE_MAX_AGE_MS,
  RELAY_PROTOCOL_VERSION,
  RelayManager,
  canonicalPairingTranscript,
  canonicalSessionHelloTranscript,
  canonicalSessionResponseTranscript
} = require('../src/relay-manager');
const { createRelayServer } = require('../src/relay-server');
const { createWebSocketClient } = require('../src/websocket-client');

class MemoryStore {
  constructor(baseDirectory) {
    this.baseDirectory = baseDirectory;
    this.config = { version: 1, daemon: { relay: {} }, features: {} };
  }

  writeConfig(config) {
    this.config = config;
    return config;
  }
}

class FakeRelayClient {
  constructor(_url, handlers) {
    this.handlers = handlers;
    this.sent = [];
    this.connectionId = 'bridge-connection';
    this.closed = false;
  }

  async connect() {
    this.handlers.onOpen();
  }

  sendJson(value) {
    this.sent.push(JSON.parse(JSON.stringify(value)));
    if (value.type === 'relay.register') {
      this.handlers.onMessage(JSON.stringify({
        type: 'relay.ack',
        relayId: value.relayId,
        connectionId: this.connectionId
      }));
    }
  }

  close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose(code || 1000, reason || 'closed');
  }
}

function generateIdentity() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

function publicKeyBase64(publicKeyPem) {
  return crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }).toString('base64');
}

function latestPeerPayload(client, expectedType) {
  for (let index = client.sent.length - 1; index >= 0; index -= 1) {
    const frame = client.sent[index];
    if (frame.type !== 'relay.frame') continue;
    const payload = JSON.parse(frame.payload);
    if (!expectedType || payload.type === expectedType) return payload;
  }
  return null;
}

function signedSessionHello(relayId, bridgeFingerprint, deviceId, identity, ephemeral, sessionId) {
  const value = {
    type: 'relay.session.hello',
    protocolVersion: RELAY_PROTOCOL_VERSION,
    relayId,
    deviceId,
    clientIdentityPublicKeyBase64: publicKeyBase64(identity.publicKey),
    clientIdentityPublicKeyPem: identity.publicKey,
    clientIdentityFingerprint: publicKeyFingerprint(identity.publicKey),
    bridgeIdentityFingerprint: bridgeFingerprint,
    sessionId,
    clientEphemeralPublicKeyBase64: ephemeral.publicKeyBase64,
    clientEphemeralPublicKeyPem: ephemeral.publicKeyPem,
    clientNonce: crypto.randomBytes(24).toString('base64url'),
    issuedAt: Date.now()
  };
  value.signature = signHandshake(identity.privateKey, canonicalSessionHelloTranscript(value));
  return value;
}

async function waitFor(condition, message, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function latestForwardedPayload(messages, expectedType) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const frame = messages[index];
    if (!frame || frame.type !== 'relay.frame' || typeof frame.payload !== 'string') continue;
    const payload = JSON.parse(frame.payload);
    if (!expectedType || payload.type === expectedType) return payload;
  }
  return null;
}

function sendRelayFrame(client, relayId, connectionId, frameId, payload, targetConnectionId) {
  const frame = {
    type: 'relay.frame',
    relayId,
    connectionId,
    frameId,
    payload: JSON.stringify(payload)
  };
  if (targetConnectionId) frame.targetConnectionId = targetConnectionId;
  assert.strictEqual(client.sendJson(frame), true);
}

async function run() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-relay-manager-'));
  const store = new MemoryStore(home);
  let activeClient = null;
  let openedConnection = null;
  let receivedText = '';
  let closeReason = '';
  const auditReasons = [];
  const manager = new RelayManager({
    store,
    allowInsecureLoopback: true,
    clientFactory: (url, handlers) => {
      activeClient = new FakeRelayClient(url, handlers);
      return activeClient;
    },
    onSessionOpen: (connection) => { openedConnection = connection; },
    onSessionText: (text) => { receivedText = text; },
    onSessionClose: (_connection, reason) => { closeReason = reason; },
    audit: (event) => { auditReasons.push(event.reason); }
  });

  try {
    const offerResult = await manager.startPairing({
      relayUrl: 'ws://127.0.0.1:9876/relay',
      ttlMs: 60000,
      confirm: true
    });
    assert.strictEqual(offerResult.ok, true);
    assert.strictEqual(offerResult.action, 'relay.pairing.start');
    assert.strictEqual(offerResult.status.action, 'relay.status');
    assert.strictEqual(offerResult.relay.connectionId, offerResult.status.connectionId);
    assert.ok(offerResult.pairingOffer.pairingSecret.length >= 32);
    assert.strictEqual(manager.status().connected, true);
    assert.strictEqual(manager.status().state, 'connected');
    assert.strictEqual(manager.status().transport, 'websocket');
    assert.strictEqual(manager.status().encrypted, false);
    assert.strictEqual(manager.status().forwardSecrecy, false);
    assert.strictEqual(manager.status().pairedDeviceCount, 0);
    assert.strictEqual(manager.status().offlineQueueDepth, 0);
    assert.strictEqual(JSON.stringify(manager.status()).includes(offerResult.pairingOffer.pairingSecret), false);
    assert.strictEqual(JSON.stringify(manager.status()).includes('BEGIN PUBLIC KEY'), false);
    assert.strictEqual(JSON.stringify(store.config).includes('pairingSecret'), false);
    assert.strictEqual(JSON.stringify(store.config).includes('PRIVATE KEY'), false);
    assert.ok(activeClient);
    const offerSecretBuffer = manager.activeOffer.pairingSecretKey;
    assert.ok(Buffer.isBuffer(offerSecretBuffer));

    const clientIdentity = generateIdentity();
    const clientIdentityFingerprint = publicKeyFingerprint(clientIdentity.publicKey);
    const clientEphemeral = generateEphemeralKeyPair();
    const hello = {
      type: 'relay.pairing.hello',
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayId: offerResult.pairingOffer.relayId,
      offerId: offerResult.pairingOffer.offerId,
      deviceId: 'app-device-smoke',
      displayName: 'Smoke App',
      platform: 'harmonyos',
      clientIdentityPublicKeyBase64: publicKeyBase64(clientIdentity.publicKey),
      clientIdentityPublicKeyPem: clientIdentity.publicKey,
      clientIdentityFingerprint,
      bridgeIdentityFingerprint: offerResult.pairingOffer.bridgeIdentity.publicKeyFingerprint,
      sessionId: 'session_smoke_0123456789',
      clientEphemeralPublicKeyBase64: clientEphemeral.publicKeyBase64,
      clientEphemeralPublicKeyPem: clientEphemeral.publicKeyPem,
      clientNonce: crypto.randomBytes(24).toString('base64url'),
      issuedAt: Date.now(),
      proof: ''
    };
    hello.proof = createPairingProof(offerResult.pairingOffer.pairingSecret, canonicalPairingTranscript({
      relayId: hello.relayId,
      offerId: hello.offerId,
      deviceId: hello.deviceId,
      clientIdentityPublicKeyBase64: hello.clientIdentityPublicKeyBase64,
      clientIdentityPublicKeyPem: hello.clientIdentityPublicKeyPem,
      clientIdentityFingerprint: hello.clientIdentityFingerprint,
      bridgeIdentityFingerprint: hello.bridgeIdentityFingerprint,
      sessionId: hello.sessionId,
      clientEphemeralPublicKeyBase64: hello.clientEphemeralPublicKeyBase64,
      clientEphemeralPublicKeyPem: hello.clientEphemeralPublicKeyPem,
      clientNonce: hello.clientNonce,
      issuedAt: hello.issuedAt
    }));
    const wrongProofHello = JSON.parse(JSON.stringify(hello));
    wrongProofHello.proof = 'invalid-proof';
    manager.handlePeerPayload('app-invalid-hmac', JSON.stringify(wrongProofHello));
    assert.strictEqual(latestPeerPayload(activeClient, 'relay.error').failureCategory, 'pairing_proof_invalid');
    assert.ok(manager.activeOffer && manager.activeOffer.consumed === false);

    const expiredHello = JSON.parse(JSON.stringify(hello));
    expiredHello.issuedAt = Date.now() - HANDSHAKE_MAX_AGE_MS - 1000;
    expiredHello.proof = createPairingProof(
      offerResult.pairingOffer.pairingSecret,
      canonicalPairingTranscript(expiredHello)
    );
    manager.handlePeerPayload('app-expired-hello', JSON.stringify(expiredHello));
    assert.strictEqual(latestPeerPayload(activeClient, 'relay.error').failureCategory, 'handshake_expired');
    assert.ok(manager.activeOffer && manager.activeOffer.consumed === false);

    manager.handlePeerPayload('app-connection', JSON.stringify(hello));

    const response = latestPeerPayload(activeClient, 'relay.session.response');
    assert.ok(response);
    const responseTranscript = canonicalSessionResponseTranscript({
      relayId: hello.relayId,
      deviceId: hello.deviceId,
      clientIdentityFingerprint,
      bridgeIdentityFingerprint: response.bridgeIdentityFingerprint,
      sessionId: hello.sessionId,
      clientEphemeralPublicKeyBase64: hello.clientEphemeralPublicKeyBase64,
      clientEphemeralPublicKeyPem: hello.clientEphemeralPublicKeyPem,
      bridgeEphemeralPublicKeyBase64: response.bridgeEphemeralPublicKeyBase64,
      bridgeEphemeralPublicKeyPem: response.bridgeEphemeralPublicKeyPem,
      clientNonce: hello.clientNonce,
      bridgeNonce: response.bridgeNonce,
      issuedAt: response.issuedAt
    });
    assert.strictEqual(verifyHandshake(response.bridgeIdentityPublicKeyPem, responseTranscript, response.signature), true);
    assert.ok(offerSecretBuffer.every((value) => value === 0));

    const appCipher = createEncryptedSession({
      role: RelayRole.APP,
      sessionId: hello.sessionId,
      localPrivateKey: clientEphemeral.privateKey,
      peerPublicKey: response.bridgeEphemeralPublicKeyPem,
      relayId: hello.relayId,
      clientNonce: hello.clientNonce,
      bridgeNonce: response.bridgeNonce,
      clientIdentityFingerprint,
      bridgeIdentityFingerprint: response.bridgeIdentityFingerprint
    });
    const readyEnvelope = appCipher.encrypt('control', JSON.stringify({
      type: 'relay.session.ready',
      sessionId: hello.sessionId
    }));
    manager.handlePeerPayload('app-connection', JSON.stringify({ type: 'relay.e2ee.data', envelope: readyEnvelope }));
    assert.ok(openedConnection);
    assert.strictEqual(manager.status().encrypted, true);
    assert.strictEqual(manager.status().forwardSecrecy, true);
    const readyAck = latestPeerPayload(activeClient, 'relay.e2ee.data');
    const openedReady = appCipher.decrypt(readyAck.envelope);
    assert.strictEqual(JSON.parse(openedReady.plaintext.toString('utf8')).accepted, true);

    const requestEnvelope = appCipher.encrypt('json', JSON.stringify({ id: 'req-smoke', type: 'bridge.ping', payload: {} }));
    manager.handlePeerPayload('app-connection', JSON.stringify({ type: 'relay.e2ee.data', envelope: requestEnvelope }));
    assert.strictEqual(JSON.parse(receivedText).type, 'bridge.ping');

    openedConnection.sendJson({ id: 'req-smoke', type: 'response', ok: true, payload: { pong: true } });
    const responseData = latestPeerPayload(activeClient, 'relay.e2ee.data');
    const openedResponse = appCipher.decrypt(responseData.envelope);
    assert.strictEqual(JSON.parse(openedResponse.plaintext.toString('utf8')).payload.pong, true);

    const pingEnvelope = appCipher.encrypt('control', JSON.stringify({ type: 'relay.ping', at: 123456 }));
    manager.handlePeerPayload('app-connection', JSON.stringify({ type: 'relay.e2ee.data', envelope: pingEnvelope }));
    const pongData = latestPeerPayload(activeClient, 'relay.e2ee.data');
    const pongResponse = appCipher.decrypt(pongData.envelope);
    assert.deepStrictEqual(JSON.parse(pongResponse.plaintext.toString('utf8')), {
      type: 'relay.pong',
      at: 123456
    });
    assert.ok(manager.status().lastHeartbeatAt.length > 0);
    assert.strictEqual(manager.status().keyEpoch, 1);
    assert.ok(manager.status().sendSeq >= 3);
    assert.ok(manager.status().receiveSeq >= 3);
    assert.strictEqual(manager.status().pairedDeviceCount, 1);

    manager.handlePeerPayload('app-connection', JSON.stringify({ type: 'relay.e2ee.data', envelope: requestEnvelope }));
    assert.ok(closeReason === 'relay_replay_detected' || closeReason === 'replay_detected');
    assert.strictEqual(manager.status().activeSessions, 0);

    const mismatchEphemeral = generateEphemeralKeyPair();
    const mismatchHello = signedSessionHello(
      hello.relayId,
      manager.status().identity.publicKeyFingerprint,
      hello.deviceId,
      clientIdentity,
      mismatchEphemeral,
      'session_context_mismatch_01'
    );
    manager.handlePeerPayload('app-context-mismatch', JSON.stringify(mismatchHello));
    const mismatchResponse = latestPeerPayload(activeClient, 'relay.session.response');
    assert.ok(mismatchResponse);
    const wrongContextCipher = createEncryptedSession({
      role: RelayRole.APP,
      sessionId: mismatchHello.sessionId,
      localPrivateKey: mismatchEphemeral.privateKey,
      peerPublicKey: mismatchResponse.bridgeEphemeralPublicKeyPem,
      relayId: mismatchHello.relayId,
      clientNonce: mismatchHello.clientNonce,
      bridgeNonce: mismatchResponse.bridgeNonce + '_wrong',
      clientIdentityFingerprint,
      bridgeIdentityFingerprint: mismatchResponse.bridgeIdentityFingerprint,
      keyEpoch: 1
    });
    const wrongReady = wrongContextCipher.encrypt('control', JSON.stringify({
      type: 'relay.session.ready',
      sessionId: mismatchHello.sessionId
    }));
    manager.handlePeerPayload('app-context-mismatch', JSON.stringify({ type: 'relay.e2ee.data', envelope: wrongReady }));
    assert.strictEqual(manager.status().activeSessions, 0);
    assert.ok(auditReasons.includes('relay_authentication_failed'));

    const beforeDisconnectEphemeral = generateEphemeralKeyPair();
    const beforeDisconnectHello = signedSessionHello(
      hello.relayId,
      manager.status().identity.publicKeyFingerprint,
      hello.deviceId,
      clientIdentity,
      beforeDisconnectEphemeral,
      'session_before_disconnect_01'
    );
    manager.handlePeerPayload('app-before-disconnect', JSON.stringify(beforeDisconnectHello));
    const beforeDisconnectResponse = latestPeerPayload(activeClient, 'relay.session.response');
    assert.ok(beforeDisconnectResponse);
    const disconnected = manager.disconnect({ confirm: true });
    assert.strictEqual(disconnected.ok, true);
    assert.strictEqual(manager.status().activeSessions, 0);
    const reconnected = await manager.connect({
      relayUrl: offerResult.pairingOffer.relayUrl,
      relayId: offerResult.pairingOffer.relayId,
      confirm: true
    });
    assert.strictEqual(reconnected.ok, true);
    const afterReconnectEphemeral = generateEphemeralKeyPair();
    const afterReconnectHello = signedSessionHello(
      hello.relayId,
      manager.status().identity.publicKeyFingerprint,
      hello.deviceId,
      clientIdentity,
      afterReconnectEphemeral,
      'session_after_reconnect_01'
    );
    manager.handlePeerPayload('app-after-reconnect', JSON.stringify(afterReconnectHello));
    const afterReconnectResponse = latestPeerPayload(activeClient, 'relay.session.response');
    assert.ok(afterReconnectResponse);
    assert.notStrictEqual(afterReconnectResponse.bridgeNonce, beforeDisconnectResponse.bridgeNonce);
    assert.notStrictEqual(afterReconnectResponse.bridgeEphemeralPublicKeyBase64, beforeDisconnectResponse.bridgeEphemeralPublicKeyBase64);

    const staleRevokePreview = manager.revoke({ deviceId: hello.deviceId });
    assert.strictEqual(staleRevokePreview.preview, true);
    assert.strictEqual(staleRevokePreview.action, 'relay.device.revoke');
    await new Promise((resolve) => setTimeout(resolve, 2));
    manager.identityStore.trustDevice({
      physicalDeviceId: hello.deviceId,
      displayName: 'Smoke App Renamed',
      platform: 'harmonyos',
      publicKeyPem: clientIdentity.publicKey,
      publicKeyFingerprint: clientIdentityFingerprint
    });
    const staleRevoke = manager.revoke({ deviceId: hello.deviceId, planId: staleRevokePreview.planId, confirm: true });
    assert.strictEqual(staleRevoke.failureCategory, 'plan_stale');
    const revokePreview = manager.revoke({ deviceId: hello.deviceId });
    const revoked = manager.revoke({ deviceId: hello.deviceId, planId: revokePreview.planId, confirm: true });
    assert.strictEqual(revoked.confirmed, true);
    assert.strictEqual(manager.revoke({ deviceId: hello.deviceId, planId: revokePreview.planId, confirm: true }).failureCategory, 'plan_expired');
    assert.strictEqual(manager.devices({ includeRevoked: true }).devices[0].trusted, false);
    assert.strictEqual(JSON.stringify(manager.devices({ includeRevoked: true })).includes('BEGIN PUBLIC KEY'), false);

    const staleRotatePreview = manager.rotateIdentity({});
    const secondDeviceIdentity = generateIdentity();
    manager.identityStore.trustDevice({
      physicalDeviceId: 'second-device-smoke',
      displayName: 'Second Device',
      publicKeyPem: secondDeviceIdentity.publicKey,
      publicKeyFingerprint: publicKeyFingerprint(secondDeviceIdentity.publicKey)
    });
    const staleRotate = manager.rotateIdentity({ planId: staleRotatePreview.planId, confirm: true });
    assert.strictEqual(staleRotate.failureCategory, 'plan_stale');
    const rotatePreview = manager.rotateIdentity({});
    assert.strictEqual(rotatePreview.preview, true);
    assert.strictEqual(rotatePreview.action, 'relay.identity.rotate');
    const rotated = manager.rotateIdentity({ planId: rotatePreview.planId, confirm: true });
    assert.strictEqual(rotated.confirmed, true);
    assert.ok(rotated.identity.generation > 1);
    assert.strictEqual(rotated.revokedDeviceCount, 2);
    assert.strictEqual(manager.devices({ includeRevoked: true }).devices.length, 0);
    assert.strictEqual(manager.rotateIdentity({ planId: rotatePreview.planId, confirm: true }).failureCategory, 'plan_expired');

    const pairedSessionIdentity = generateIdentity();
    const rejectedEphemeral = generateEphemeralKeyPair();
    const invalidSessionHello = {
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayId: offerResult.pairingOffer.relayId,
      deviceId: hello.deviceId,
      clientIdentityPublicKeyBase64: publicKeyBase64(pairedSessionIdentity.publicKey),
      clientIdentityPublicKeyPem: pairedSessionIdentity.publicKey,
      clientIdentityFingerprint: publicKeyFingerprint(pairedSessionIdentity.publicKey),
      bridgeIdentityFingerprint: rotated.identity.publicKeyFingerprint,
      sessionId: 'session_rejected_012345',
      clientEphemeralPublicKeyBase64: rejectedEphemeral.publicKeyBase64,
      clientEphemeralPublicKeyPem: rejectedEphemeral.publicKeyPem,
      clientNonce: crypto.randomBytes(24).toString('base64url'),
      issuedAt: Date.now()
    };
    invalidSessionHello.signature = signHandshake(pairedSessionIdentity.privateKey, canonicalSessionHelloTranscript(invalidSessionHello));
    manager.handlePeerPayload('app-rejected', JSON.stringify(Object.assign({ type: 'relay.session.hello' }, invalidSessionHello)));
    const rejected = latestPeerPayload(activeClient, 'relay.error');
    assert.strictEqual(rejected.failureCategory, 'pairing_required');

    const repairOffer = await manager.startPairing({
      relayUrl: offerResult.pairingOffer.relayUrl,
      relayId: offerResult.pairingOffer.relayId,
      ttlMs: 60000,
      confirm: true
    });
    assert.strictEqual(repairOffer.ok, true);
    const repairEphemeral = generateEphemeralKeyPair();
    const repairHello = {
      type: 'relay.pairing.hello',
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayId: repairOffer.pairingOffer.relayId,
      offerId: repairOffer.pairingOffer.offerId,
      deviceId: hello.deviceId,
      displayName: 'Smoke App Repaired',
      platform: 'harmonyos',
      clientIdentityPublicKeyBase64: publicKeyBase64(clientIdentity.publicKey),
      clientIdentityPublicKeyPem: clientIdentity.publicKey,
      clientIdentityFingerprint,
      bridgeIdentityFingerprint: rotated.identity.publicKeyFingerprint,
      sessionId: 'session_repaired_012345',
      clientEphemeralPublicKeyBase64: repairEphemeral.publicKeyBase64,
      clientEphemeralPublicKeyPem: repairEphemeral.publicKeyPem,
      clientNonce: crypto.randomBytes(24).toString('base64url'),
      issuedAt: Date.now(),
      proof: ''
    };
    repairHello.proof = createPairingProof(
      repairOffer.pairingOffer.pairingSecret,
      canonicalPairingTranscript(repairHello)
    );
    manager.handlePeerPayload('app-repaired', JSON.stringify(repairHello));
    const repairedResponse = latestPeerPayload(activeClient, 'relay.session.response');
    assert.ok(repairedResponse);
    assert.strictEqual(repairedResponse.paired, true);
    assert.strictEqual(manager.devices({ includeRevoked: true }).devices[0].deviceId, hello.deviceId);

  } finally {
    manager.shutdown();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function runRealRelayIntegration() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-relay-integration-'));
  const relay = createRelayServer({
    host: '127.0.0.1',
    port: 0,
    heartbeatIntervalMs: 0,
    registrationTimeoutMs: 3000
  });
  let manager = null;
  let appClient = null;
  try {
    const address = await relay.start();
    const store = new MemoryStore(home);
    let openedCount = 0;
    let closedCount = 0;
    manager = new RelayManager({
      store,
      allowInsecureLoopback: true,
      clientFactory: (url, handlers) => createWebSocketClient(url, handlers, {
        maxFrameBytes: 2 * 1024 * 1024,
        maxMessageBytes: 2 * 1024 * 1024,
        heartbeatIntervalMs: 0
      }),
      onSessionOpen: () => { openedCount += 1; },
      onSessionClose: () => { closedCount += 1; }
    });
    const offer = await manager.startPairing({ relayUrl: address.url, confirm: true, ttlMs: 60000 });
    assert.strictEqual(offer.ok, true);
    await waitFor(() => manager.status().connected, 'manager did not accept real relay.ack');

    const appMessages = [];
    const appErrors = [];
    appClient = createWebSocketClient(address.url, {
      onMessage: (text) => { appMessages.push(JSON.parse(text)); },
      onError: (error) => { appErrors.push(error); }
    }, {
      maxFrameBytes: 2 * 1024 * 1024,
      maxMessageBytes: 2 * 1024 * 1024,
      heartbeatIntervalMs: 0
    });
    await appClient.connect();
    assert.strictEqual(appClient.sendJson({ type: 'relay.attach', relayId: offer.pairingOffer.relayId }), true);
    const firstAttach = await waitFor(
      () => appMessages.find((message) => message.type === 'relay.ack' && !message.frameId),
      'App did not receive relay.attach acknowledgement'
    );
    assert.ok(firstAttach.connectionId);

    const appIdentity = generateIdentity();
    const appIdentityFingerprint = publicKeyFingerprint(appIdentity.publicKey);
    const appEphemeral = generateEphemeralKeyPair();
    const pairingHello = {
      type: 'relay.pairing.hello',
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayId: offer.pairingOffer.relayId,
      offerId: offer.pairingOffer.offerId,
      deviceId: 'real-app-device-01',
      displayName: 'Real Relay App',
      platform: 'test',
      clientIdentityPublicKeyBase64: publicKeyBase64(appIdentity.publicKey),
      clientIdentityFingerprint: appIdentityFingerprint,
      bridgeIdentityFingerprint: offer.pairingOffer.bridgeIdentity.publicKeyFingerprint,
      sessionId: 'real_pairing_session_01',
      clientEphemeralPublicKeyBase64: appEphemeral.publicKeyBase64,
      clientNonce: crypto.randomBytes(24).toString('base64url'),
      issuedAt: Date.now()
    };
    pairingHello.proof = createPairingProof(
      offer.pairingOffer.pairingSecret,
      canonicalPairingTranscript(pairingHello)
    );
    sendRelayFrame(appClient, pairingHello.relayId, firstAttach.connectionId, 'frame-pairing-01', pairingHello);
    const firstResponse = await waitFor(
      () => latestForwardedPayload(appMessages, 'relay.session.response'),
      'Real broker did not route pairing response'
    );
    const firstCipher = createEncryptedSession({
      role: RelayRole.APP,
      sessionId: pairingHello.sessionId,
      localPrivateKey: appEphemeral.privateKey,
      peerPublicKey: firstResponse.bridgeEphemeralPublicKeyPem,
      relayId: pairingHello.relayId,
      clientNonce: pairingHello.clientNonce,
      bridgeNonce: firstResponse.bridgeNonce,
      clientIdentityFingerprint: appIdentityFingerprint,
      bridgeIdentityFingerprint: firstResponse.bridgeIdentityFingerprint,
      keyEpoch: firstResponse.keyEpoch
    });
    sendRelayFrame(appClient, pairingHello.relayId, firstAttach.connectionId, 'frame-ready-01', {
      type: 'relay.e2ee.data',
      envelope: firstCipher.encrypt('control', JSON.stringify({
        type: 'relay.session.ready',
        sessionId: pairingHello.sessionId
      }))
    });
    await waitFor(() => openedCount === 1, 'Real broker E2E session did not become ready');

    const disconnected = manager.disconnect({ confirm: true });
    assert.strictEqual(disconnected.ok, true);
    await waitFor(
      () => appMessages.some((message) => message.type === 'relay.detach'),
      'Real broker did not detach App after Bridge disconnect'
    );
    assert.strictEqual(manager.status().activeSessions, 0);
    assert.strictEqual(closedCount, 1);

    const reconnected = await manager.connect({
      relayUrl: address.url,
      relayId: offer.pairingOffer.relayId,
      confirm: true
    });
    assert.strictEqual(reconnected.ok, true);
    await waitFor(() => manager.status().connected, 'Manager did not register after reconnect');
    const ackCount = appMessages.filter((message) => message.type === 'relay.ack' && !message.frameId).length;
    assert.strictEqual(appClient.sendJson({ type: 'relay.attach', relayId: offer.pairingOffer.relayId }), true);
    const secondAttach = await waitFor(
      () => appMessages.filter((message) => message.type === 'relay.ack' && !message.frameId).length > ackCount,
      'App did not reattach after Bridge reconnect'
    );
    const currentAttach = appMessages.filter((message) => message.type === 'relay.ack' && !message.frameId).slice(-1)[0];
    assert.ok(secondAttach && currentAttach.connectionId);

    const reconnectEphemeral = generateEphemeralKeyPair();
    const reconnectHello = signedSessionHello(
      offer.pairingOffer.relayId,
      manager.status().identity.publicKeyFingerprint,
      pairingHello.deviceId,
      appIdentity,
      reconnectEphemeral,
      'real_reconnect_session_02'
    );
    sendRelayFrame(appClient, reconnectHello.relayId, currentAttach.connectionId, 'frame-session-02', reconnectHello);
    const reconnectResponse = await waitFor(() => {
      const payload = latestForwardedPayload(appMessages, 'relay.session.response');
      return payload && payload.sessionId === reconnectHello.sessionId ? payload : null;
    }, 'Real broker did not route reconnect handshake');
    assert.notStrictEqual(reconnectResponse.bridgeNonce, firstResponse.bridgeNonce);
    assert.notStrictEqual(reconnectResponse.bridgeEphemeralPublicKeyBase64, firstResponse.bridgeEphemeralPublicKeyBase64);
    const reconnectCipher = createEncryptedSession({
      role: RelayRole.APP,
      sessionId: reconnectHello.sessionId,
      localPrivateKey: reconnectEphemeral.privateKey,
      peerPublicKey: reconnectResponse.bridgeEphemeralPublicKeyPem,
      relayId: reconnectHello.relayId,
      clientNonce: reconnectHello.clientNonce,
      bridgeNonce: reconnectResponse.bridgeNonce,
      clientIdentityFingerprint: reconnectHello.clientIdentityFingerprint,
      bridgeIdentityFingerprint: reconnectResponse.bridgeIdentityFingerprint,
      keyEpoch: reconnectResponse.keyEpoch
    });
    sendRelayFrame(appClient, reconnectHello.relayId, currentAttach.connectionId, 'frame-ready-02', {
      type: 'relay.e2ee.data',
      envelope: reconnectCipher.encrypt('control', JSON.stringify({
        type: 'relay.session.ready',
        sessionId: reconnectHello.sessionId
      }))
    });
    await waitFor(() => openedCount === 2, 'Reconnect E2E session did not become ready');
    assert.strictEqual(appErrors.length, 0);
  } finally {
    if (manager) manager.shutdown();
    if (appClient) appClient.close(1000, 'smoke_complete');
    await relay.stop();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function runAll() {
  await run();
  await runRealRelayIntegration();
  console.log('relay manager smoke ok: fake=true realBroker=true reconnectKeysFresh=true');
}

runAll().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
