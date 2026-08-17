'use strict';

const crypto = require('crypto');
const { URL } = require('url');
const {
  RelayCryptoError,
  RelayRole,
  createEncryptedSession,
  createPairingSecret,
  generateEphemeralKeyPair,
  signHandshake,
  verifyHandshake,
  verifyPairingProof
} = require('./relay-crypto');
const { createRelayIdentityStore, publicKeyFingerprint } = require('./relay-identity-store');

const RELAY_PROTOCOL_VERSION = 'ngf-agent-bridge.relay.v1';
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;
const MAX_PAIRING_TTL_MS = 15 * 60 * 1000;
const HANDSHAKE_MAX_AGE_MS = 2 * 60 * 1000;
const SESSION_READY_TIMEOUT_MS = 30 * 1000;
const HELLO_REPLAY_TTL_MS = HANDSHAKE_MAX_AGE_MS * 2;
const MAX_HELLO_REPLAY_ENTRIES = 2048;
const PLAN_TTL_MS = 2 * 60 * 1000;
const RECONNECT_MAX_DELAY_MS = 30 * 1000;
const MAX_INNER_PAYLOAD_BYTES = 1024 * 1024;
const MAX_ACTIVE_SESSIONS = 16;

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix, bytes) {
  return prefix + '_' + crypto.randomBytes(bytes || 18).toString('base64url');
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function safeErrorCode(error, fallbackValue) {
  if (error && typeof error.code === 'string' && error.code.length > 0) return error.code;
  return fallbackValue;
}

function safeMessage(error, fallbackValue) {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return fallbackValue;
}

function constantTimeTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function canonicalPublicKey(valueBase64, valuePem) {
  let fromBase64 = null;
  let fromPem = null;
  try {
    if (typeof valueBase64 === 'string' && valueBase64.length > 0) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(valueBase64)) {
        throw new Error('base64');
      }
      const der = Buffer.from(valueBase64, 'base64');
      if (der.toString('base64') !== valueBase64) throw new Error('base64');
      fromBase64 = crypto.createPublicKey({ key: der, type: 'spki', format: 'der' });
    }
    if (typeof valuePem === 'string' && valuePem.length > 0) fromPem = crypto.createPublicKey(valuePem);
    const key = fromBase64 || fromPem;
    if (!key) throw new Error('missing');
    const details = key.asymmetricKeyDetails || {};
    if (key.asymmetricKeyType !== 'ec' || details.namedCurve !== 'prime256v1') throw new Error('curve');
    const der = key.export({ type: 'spki', format: 'der' });
    if (fromBase64 && fromPem) {
      const pemDer = fromPem.export({ type: 'spki', format: 'der' });
      if (der.length !== pemDer.length || !crypto.timingSafeEqual(der, pemDer)) throw new Error('mismatch');
    }
    return {
      key,
      publicKeyBase64: der.toString('base64'),
      publicKeyPem: key.export({ type: 'spki', format: 'pem' }),
      fingerprint: crypto.createHash('sha256').update(der).digest('hex')
    };
  } catch (_error) {
    return null;
  }
}

function transcriptPublicKey(value, base64Field, pemField) {
  const key = canonicalPublicKey(readString(value, base64Field, ''), readString(value, pemField, ''));
  if (!key) throw new Error('Relay transcript public key is invalid.');
  return key.publicKeyBase64;
}

function identityRelayFingerprint(identity) {
  const stored = readString(identity, 'relayPublicKeyFingerprint', '');
  if (stored.length > 0) return stored;
  return publicKeyFingerprint(readString(identity, 'devicePublicKeyPem', ''));
}

function relayIdFingerprint(relayId) {
  return typeof relayId === 'string' && relayId.length > 0
    ? crypto.createHash('sha256').update(relayId, 'utf8').digest('hex').substring(0, 16)
    : '';
}

function canonicalPairingTranscript(value) {
  return JSON.stringify([
    RELAY_PROTOCOL_VERSION,
    'pairing.hello',
    value.relayId,
    value.offerId,
    value.deviceId,
    transcriptPublicKey(value, 'clientIdentityPublicKeyBase64', 'clientIdentityPublicKeyPem'),
    value.clientIdentityFingerprint,
    value.bridgeIdentityFingerprint,
    value.sessionId,
    transcriptPublicKey(value, 'clientEphemeralPublicKeyBase64', 'clientEphemeralPublicKeyPem'),
    value.clientNonce,
    value.issuedAt
  ]);
}

function canonicalSessionHelloTranscript(value) {
  return JSON.stringify([
    RELAY_PROTOCOL_VERSION,
    'session.hello',
    value.relayId,
    value.deviceId,
    value.clientIdentityFingerprint,
    value.bridgeIdentityFingerprint,
    value.sessionId,
    transcriptPublicKey(value, 'clientEphemeralPublicKeyBase64', 'clientEphemeralPublicKeyPem'),
    value.clientNonce,
    value.issuedAt
  ]);
}

function canonicalSessionResponseTranscript(value) {
  return JSON.stringify([
    RELAY_PROTOCOL_VERSION,
    'session.response',
    value.relayId,
    value.deviceId,
    value.clientIdentityFingerprint,
    value.bridgeIdentityFingerprint,
    value.sessionId,
    transcriptPublicKey(value, 'clientEphemeralPublicKeyBase64', 'clientEphemeralPublicKeyPem'),
    transcriptPublicKey(value, 'bridgeEphemeralPublicKeyBase64', 'bridgeEphemeralPublicKeyPem'),
    value.clientNonce,
    value.bridgeNonce,
    value.issuedAt
  ]);
}

function safeRelayUrl(input, allowInsecureLoopback) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch (_error) {
    return { ok: false, failureCategory: 'relay_url_invalid', message: 'Relay URL is invalid.' };
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === '127.0.0.1' || hostname === '::1' || hostname === 'localhost';
  if (parsed.protocol !== 'wss:' && !(allowInsecureLoopback && loopback && parsed.protocol === 'ws:')) {
    return {
      ok: false,
      failureCategory: 'relay_url_invalid',
      message: 'Relay URL must use WSS.',
      remediation: 'Use a wss:// endpoint. Plain ws:// is accepted only for an explicitly enabled loopback test Relay.'
    };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0 || parsed.hash.length > 0 || parsed.search.length > 0) {
    return {
      ok: false,
      failureCategory: 'relay_url_invalid',
      message: 'Relay URL must not contain credentials, a query, or a fragment.'
    };
  }
  return { ok: true, url: parsed.toString(), publicUrl: parsed.origin + parsed.pathname };
}

function isFreshTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0 && Math.abs(Date.now() - value) <= HANDSHAKE_MAX_AGE_MS;
}

function publicDeviceRecord(device) {
  return {
    deviceId: readString(device, 'physicalDeviceId', ''),
    displayName: readString(device, 'displayName', ''),
    platform: readString(device, 'platform', ''),
    publicKeyFingerprint: readString(device, 'publicKeyFingerprint', ''),
    trusted: readBoolean(device, 'trusted', false),
    trustedAt: readString(device, 'trustedAt', ''),
    revokedAt: readString(device, 'revokedAt', ''),
    updatedAt: readString(device, 'updatedAt', '')
  };
}

class RelayManager {
  constructor(options) {
    const source = options && typeof options === 'object' ? options : {};
    this.store = source.store || null;
    this.identityStore = source.identityStore || createRelayIdentityStore({
      baseDirectory: this.store && typeof this.store.baseDirectory === 'string' ? this.store.baseDirectory : ''
    });
    this.clientFactory = typeof source.clientFactory === 'function' ? source.clientFactory : null;
    this.onSessionOpen = typeof source.onSessionOpen === 'function' ? source.onSessionOpen : () => {};
    this.onSessionText = typeof source.onSessionText === 'function' ? source.onSessionText : () => {};
    this.onSessionBinary = typeof source.onSessionBinary === 'function' ? source.onSessionBinary : () => {};
    this.onSessionClose = typeof source.onSessionClose === 'function' ? source.onSessionClose : () => {};
    this.onUpdated = typeof source.onUpdated === 'function' ? source.onUpdated : () => {};
    this.audit = typeof source.audit === 'function' ? source.audit : () => {};
    this.allowInsecureLoopback = source.allowInsecureLoopback === true || process.env.AGENT_BRIDGE_RELAY_ALLOW_INSECURE_LOOPBACK === '1';
    this.client = null;
    this.transportStatus = 'disconnected';
    this.desiredConnected = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.transportEpoch = 0;
    this.connectionId = '';
    this.lastError = '';
    this.lastFailureCategory = '';
    this.connectedAt = '';
    this.lastFrameAt = '';
    this.sessions = new Map();
    this.helloReplayCache = new Map();
    this.activeOffer = null;
    this.plans = new Map();
    this.config = this.readPersistedConfig();
    this.identity = this.identityStore.identity({ legacyProfile: source.legacyProfile || null });
  }

  isAvailable() {
    return this.clientFactory !== null;
  }

  status() {
    this.expireOfferIfNeeded();
    const devices = this.identityStore.deviceList();
    let pairedDevices = 0;
    let revokedDevices = 0;
    for (const device of devices) {
      if (device.trusted === false || readString(device, 'revokedAt', '').length > 0) revokedDevices += 1;
      else pairedDevices += 1;
    }
    let keyEpoch = 0;
    let sendSeq = 0;
    let receiveSeq = 0;
    let readySessions = 0;
    for (const session of this.sessions.values()) {
      if (!session || !session.cipher || typeof session.cipher.status !== 'function') continue;
      if (session.ready === true) readySessions += 1;
      const cipherStatus = session.cipher.status();
      keyEpoch = Math.max(keyEpoch, readNumber(cipherStatus, 'keyEpoch', 0));
      sendSeq = Math.max(sendSeq, readNumber(cipherStatus, 'outboundSeq', 0));
      receiveSeq = Math.max(receiveSeq, readNumber(cipherStatus, 'inboundSeq', 0));
    }
    const state = this.publicConnectionState();
    return {
      ok: true,
      action: 'relay.status',
      configured: this.config.relayUrl.length > 0 && this.config.relayId.length > 0,
      available: this.isAvailable(),
      connected: this.transportStatus === 'connected',
      desiredConnected: this.desiredConnected,
      state,
      transport: 'websocket',
      transportStatus: this.transportStatus,
      relayUrl: this.config.publicRelayUrl,
      relayId: this.config.relayId,
      connectionId: this.connectionId,
      activeSessions: this.sessions.size,
      pairedDevices,
      pairedDeviceCount: pairedDevices,
      revokedDevices,
      encrypted: readySessions > 0,
      forwardSecrecy: readySessions > 0,
      keyEpoch,
      sendSeq,
      receiveSeq,
      reconnectAttempt: this.reconnectAttempt,
      offlineQueueDepth: 0,
      pairing: {
        active: this.activeOffer !== null,
        offerId: this.activeOffer ? this.activeOffer.offerId : '',
        expiresAt: this.activeOffer ? new Date(this.activeOffer.expiresAt).toISOString() : ''
      },
      identity: {
        generation: this.identity.generation,
        publicKeyFingerprint: identityRelayFingerprint(this.identity)
      },
      e2ee: {
        enabled: true,
        protocolVersion: RELAY_PROTOCOL_VERSION,
        keyAgreement: 'ECDH-P256',
        kdf: 'HKDF-SHA256',
        cipher: 'AES-256-GCM',
        replayProtection: 'strict_sequence'
      },
      queue: {
        maxFrameBytes: MAX_INNER_PAYLOAD_BYTES,
        reconnectAttempt: this.reconnectAttempt
      },
      failureCategory: this.lastFailureCategory,
      message: this.lastError,
      connectedAt: this.connectedAt,
      lastHeartbeatAt: this.lastFrameAt,
      lastFrameAt: this.lastFrameAt,
      updatedAt: nowIso()
    };
  }

  publicConnectionState() {
    if (this.transportStatus === 'connected') return 'connected';
    if (this.transportStatus === 'connecting' || this.transportStatus === 'registering') return 'connecting';
    if (this.transportStatus === 'reconnecting' || this.transportStatus === 'error') return 'degraded';
    if (this.activeOffer !== null) return 'pairing';
    return 'disconnected';
  }

  devices(payload) {
    const includeRevoked = readBoolean(payload, 'includeRevoked', false);
    const result = [];
    for (const device of this.identityStore.deviceList()) {
      const isRevoked = device.trusted === false || readString(device, 'revokedAt', '').length > 0;
      if (!includeRevoked && isRevoked) continue;
      result.push(publicDeviceRecord(device));
    }
    return { ok: true, action: 'relay.device.list', devices: result, updatedAt: nowIso() };
  }

  async startPairing(payload) {
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failure('confirmation_required', 'Creating a Relay pairing offer requires explicit confirmation.', 'Review the Relay endpoint and retry with confirm=true.');
    }
    const relayUrl = readString(payload, 'relayUrl', this.config.relayUrl);
    const validation = safeRelayUrl(relayUrl, this.allowInsecureLoopback);
    if (!validation.ok) return this.failure(validation.failureCategory, validation.message, validation.remediation || '');
    this.cancelPairingInternal('replaced');
    const ttlMs = Math.min(Math.max(Math.floor(readNumber(payload, 'ttlMs', DEFAULT_PAIRING_TTL_MS)), 30000), MAX_PAIRING_TTL_MS);
    const relayId = readString(payload, 'relayId', randomId('rly', 24));
    if (!/^[A-Za-z0-9_-]{24,160}$/.test(relayId)) {
      return this.failure('relay_id_invalid', 'Relay rendezvous id is invalid.');
    }
    this.config = {
      relayUrl: validation.url,
      publicRelayUrl: validation.publicUrl,
      relayId
    };
    this.persistConfig();
    const pairingSecret = createPairingSecret();
    const offer = {
      offerId: randomId('offer', 18),
      relayId,
      relayUrl: validation.url,
      publicRelayUrl: validation.publicUrl,
      pairingSecretKey: Buffer.from(pairingSecret, 'utf8'),
      expiresAt: Date.now() + ttlMs,
      consumed: false
    };
    this.activeOffer = offer;
    const connected = await this.connect({ relayUrl: validation.url, relayId, confirm: true });
    if (!connected.ok) {
      this.cancelPairingInternal('connect_failed');
      return connected;
    }
    const bridgeIdentityKey = canonicalPublicKey('', this.identity.devicePublicKeyPem);
    if (!bridgeIdentityKey) {
      this.cancelPairingInternal('identity_invalid');
      return this.failure('identity_invalid', 'Bridge Relay identity is invalid.');
    }
    const pairingOffer = {
      version: 1,
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayUrl: validation.url,
      relayId,
      offerId: offer.offerId,
      pairingSecret,
      expiresAt: new Date(offer.expiresAt).toISOString(),
      bridgeIdentity: {
        publicKeyPem: this.identity.devicePublicKeyPem,
        publicKeyBase64: bridgeIdentityKey.publicKeyBase64,
        publicKeyFingerprint: identityRelayFingerprint(this.identity),
        generation: this.identity.generation,
        displayName: this.identity.deviceDisplayName,
        platform: this.identity.devicePlatform
      }
    };
    const encoded = Buffer.from(JSON.stringify(pairingOffer), 'utf8').toString('base64url');
    this.auditEvent('relay.pairing.created', 'created', 'info', 'pairing_offer_created');
    this.emitUpdated();
    const status = this.status();
    return {
      ok: true,
      action: 'relay.pairing.start',
      confirmed: true,
      pairing: {
        active: true,
        offerId: offer.offerId,
        expiresAt: pairingOffer.expiresAt
      },
      pairingOffer,
      pairingUri: 'ngf-agent-bridge://relay#offer=' + encoded,
      status,
      relay: status,
      warnings: ['pairing_offer_sensitive'],
      updatedAt: nowIso()
    };
  }

  cancelPairing(payload) {
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failure('confirmation_required', 'Cancelling a Relay pairing offer requires explicit confirmation.');
    }
    const requestedOfferId = readString(payload, 'offerId', '');
    if (this.activeOffer && requestedOfferId.length > 0 && !constantTimeTextEqual(requestedOfferId, this.activeOffer.offerId)) {
      return this.failure('pairing_offer_mismatch', 'Pairing offer id does not match the active offer.');
    }
    const cancelled = this.cancelPairingInternal('cancelled');
    this.emitUpdated();
    const status = this.status();
    return {
      ok: true,
      action: 'relay.pairing.cancel',
      confirmed: true,
      cancelled,
      status,
      relay: status,
      updatedAt: nowIso()
    };
  }

  async connect(payload) {
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failure('confirmation_required', 'Connecting to Relay requires explicit confirmation.');
    }
    if (!this.isAvailable()) {
      return this.failure('capability_unavailable', 'This Bridge build does not include a Relay WebSocket client.');
    }
    const relayUrl = readString(payload, 'relayUrl', this.config.relayUrl);
    const relayId = readString(payload, 'relayId', this.config.relayId);
    const validation = safeRelayUrl(relayUrl, this.allowInsecureLoopback);
    if (!validation.ok) return this.failure(validation.failureCategory, validation.message, validation.remediation || '');
    if (!/^[A-Za-z0-9_-]{24,160}$/.test(relayId)) return this.failure('relay_id_invalid', 'Relay rendezvous id is invalid.');
    if (this.activeOffer && (
      !constantTimeTextEqual(this.activeOffer.relayId, relayId) ||
      this.activeOffer.relayUrl !== validation.url
    )) {
      this.cancelPairingInternal('relay_configuration_changed');
    }
    this.config = { relayUrl: validation.url, publicRelayUrl: validation.publicUrl, relayId };
    this.persistConfig();
    this.desiredConnected = true;
    this.clearReconnectTimer();
    if (this.client) this.closeTransport('replaced');
    this.transportStatus = 'connecting';
    this.lastError = '';
    this.lastFailureCategory = '';
    this.emitUpdated();
    const epoch = this.transportEpoch + 1;
    this.transportEpoch = epoch;
    try {
      const handlers = {
        onOpen: () => this.handleTransportOpen(epoch),
        onMessage: (text) => this.handleTransportMessage(text, epoch),
        onClose: (code, reason) => this.handleTransportClose(code, reason, epoch),
        onError: (error) => this.handleTransportError(error, epoch)
      };
      const client = this.clientFactory(validation.url, handlers);
      if (!client || typeof client.connect !== 'function') {
        throw new Error('Relay WebSocket client factory returned an invalid client.');
      }
      this.client = client;
      await client.connect();
      if (epoch !== this.transportEpoch || this.client !== client) {
        return this.failure('relay_connection_superseded', 'Relay connection was replaced before it became active.');
      }
      const status = this.status();
      return {
        ok: true,
        action: 'relay.connect',
        confirmed: true,
        status,
        relay: status,
        updatedAt: nowIso()
      };
    } catch (error) {
      if (epoch !== this.transportEpoch) {
        return this.failure('relay_connection_superseded', 'Relay connection was replaced before it became active.');
      }
      this.transportStatus = 'error';
      this.lastFailureCategory = safeErrorCode(error, 'relay_unreachable');
      this.lastError = safeMessage(error, 'Relay connection failed.');
      this.scheduleReconnect();
      this.emitUpdated();
      return this.failure(this.lastFailureCategory, this.lastError, 'Verify the WSS Relay endpoint and network connectivity.');
    }
  }

  disconnect(payload) {
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failure('confirmation_required', 'Disconnecting Relay requires explicit confirmation.');
    }
    this.desiredConnected = false;
    this.clearReconnectTimer();
    this.cancelPairingInternal('user_disconnect');
    this.closeTransport('user_disconnect');
    this.emitUpdated();
    const status = this.status();
    return {
      ok: true,
      action: 'relay.disconnect',
      confirmed: true,
      status,
      relay: status,
      updatedAt: nowIso()
    };
  }

  revoke(payload) {
    const deviceId = readString(payload, 'deviceId', '');
    if (deviceId.length === 0) return this.failure('device_id_required', 'Relay device id is required.');
    const current = this.findDevice(deviceId);
    if (!current) return this.failure('device_not_found', 'Relay device was not found.');
    const digest = this.devicePlanDigest(current, 'revoke');
    if (!readBoolean(payload, 'confirm', false)) {
      const planId = this.createPlan('revoke', deviceId, digest);
      return {
        ok: true,
        action: 'relay.device.revoke',
        preview: true,
        confirmed: false,
        planId,
        device: publicDeviceRecord(current),
        effects: ['close_active_sessions', 'reject_future_handshakes'],
        warnings: ['device_access_will_be_revoked'],
        updatedAt: nowIso()
      };
    }
    const plan = this.consumePlan(readString(payload, 'planId', ''), 'revoke', deviceId, digest);
    if (!plan.ok) return plan;
    const revoked = this.identityStore.revokeDevice(deviceId);
    if (!revoked) return this.failure('device_not_found', 'Relay device was not found.');
    this.closeDeviceSessions(deviceId, 'device_revoked');
    this.auditEvent('relay.device.revoked', 'confirmed', 'warning', 'device_revoked');
    this.emitUpdated(true);
    return {
      ok: true,
      action: 'relay.device.revoke',
      preview: false,
      confirmed: true,
      device: publicDeviceRecord(revoked),
      status: this.status(),
      updatedAt: nowIso()
    };
  }

  rotateIdentity(payload) {
    const digest = this.identityPlanDigest();
    if (!readBoolean(payload, 'confirm', false)) {
      const planId = this.createPlan('rotate', '', digest);
      return {
        ok: true,
        action: 'relay.identity.rotate',
        preview: true,
        confirmed: false,
        planId,
        currentGeneration: this.identity.generation,
        currentFingerprint: identityRelayFingerprint(this.identity),
        effects: ['close_all_sessions', 'revoke_all_devices', 'require_pairing'],
        warnings: ['all_relay_devices_must_pair_again'],
        updatedAt: nowIso()
      };
    }
    const plan = this.consumePlan(readString(payload, 'planId', ''), 'rotate', '', digest);
    if (!plan.ok) return plan;
    const devices = this.identityStore.deviceList();
    for (const device of devices) {
      const deviceId = readString(device, 'physicalDeviceId', '');
      if (deviceId.length > 0) this.identityStore.revokeDevice(deviceId);
    }
    this.closeAllSessions('identity_rotated');
    this.cancelPairingInternal('identity_rotated');
    this.identity = this.identityStore.rotate({ clearTrustedDevices: true });
    this.helloReplayCache.clear();
    this.auditEvent('relay.identity.rotated', 'confirmed', 'warning', 'identity_rotated');
    this.emitUpdated(true);
    return {
      ok: true,
      action: 'relay.identity.rotate',
      preview: false,
      confirmed: true,
      identity: {
        generation: this.identity.generation,
        publicKeyFingerprint: identityRelayFingerprint(this.identity)
      },
      revokedDeviceCount: devices.length,
      status: this.status(),
      updatedAt: nowIso()
    };
  }

  shutdown() {
    this.desiredConnected = false;
    this.clearReconnectTimer();
    this.cancelPairingInternal('shutdown');
    this.closeTransport('shutdown');
    this.plans.clear();
    this.helloReplayCache.clear();
  }

  handleTransportOpen(epoch) {
    if (!this.transportEventIsCurrent(epoch) || !this.client) return;
    this.transportStatus = 'registering';
    this.reconnectAttempt = 0;
    this.sendTransport({
      type: 'relay.register',
      relayId: this.config.relayId
    });
    this.emitUpdated();
  }

  handleTransportMessage(rawText, epoch) {
    if (!this.transportEventIsCurrent(epoch)) return;
    if (typeof rawText !== 'string' || Buffer.byteLength(rawText, 'utf8') > MAX_INNER_PAYLOAD_BYTES + 65536) {
      this.handleTransportError(Object.assign(new Error('Relay message exceeded the configured limit.'), { code: 'relay_backpressure' }), epoch);
      return;
    }
    let message;
    try {
      message = JSON.parse(rawText);
    } catch (_error) {
      this.handleTransportError(Object.assign(new Error('Relay returned invalid JSON.'), { code: 'relay_protocol_error' }), epoch);
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    this.lastFrameAt = nowIso();
    const relayId = readString(message, 'relayId', '');
    if (relayId.length > 0 && !constantTimeTextEqual(relayId, this.config.relayId)) {
      this.handleTransportError(Object.assign(new Error('Relay response used the wrong rendezvous id.'), { code: 'relay_protocol_error' }), epoch);
      return;
    }
    const registrationAck = message.type === 'relay.registered' || (
      message.type === 'relay.ack' && readString(message, 'frameId', '').length === 0 && this.transportStatus === 'registering'
    );
    if (registrationAck) {
      const connectionId = readString(message, 'connectionId', '');
      if (connectionId.length === 0) {
        this.handleTransportError(Object.assign(new Error('Relay registration acknowledgement is invalid.'), { code: 'relay_protocol_error' }), epoch);
        return;
      }
      this.connectionId = connectionId;
      this.transportStatus = 'connected';
      this.connectedAt = nowIso();
      this.lastError = '';
      this.lastFailureCategory = '';
      this.auditEvent('relay.connected', 'connected', 'info', 'relay_registered');
      this.emitUpdated();
      return;
    }
    if (message.type === 'relay.frame') {
      const peerId = readString(message, 'sourceConnectionId', readString(message, 'connectionId', ''));
      this.handlePeerPayload(peerId, message.payload);
      return;
    }
    if (message.type === 'relay.peer.detached' || message.type === 'relay.detach') {
      this.closePeerSession(readString(message, 'connectionId', ''), 'peer_detached');
      return;
    }
    if (message.type === 'relay.error') {
      this.lastFailureCategory = readString(message, 'failureCategory', 'relay_protocol_error');
      this.lastError = readString(message, 'message', 'Relay rejected the request.');
      this.emitUpdated();
    }
  }

  handleTransportClose(_code, reason, epoch) {
    if (!this.transportEventIsCurrent(epoch)) return;
    const expected = !this.desiredConnected;
    this.client = null;
    this.connectionId = '';
    this.transportStatus = expected ? 'disconnected' : 'reconnecting';
    if (!expected) {
      this.lastFailureCategory = 'relay_unreachable';
      this.lastError = typeof reason === 'string' && reason.length > 0 ? reason : 'Relay connection closed.';
    }
    this.closeAllSessions('transport_closed');
    if (!expected) this.scheduleReconnect();
    this.emitUpdated();
  }

  handleTransportError(error, epoch) {
    if (!this.transportEventIsCurrent(epoch)) return;
    this.lastFailureCategory = safeErrorCode(error, 'relay_protocol_error');
    this.lastError = safeMessage(error, 'Relay transport failed.');
    this.auditEvent('relay.transport.error', 'failed', 'warning', this.lastFailureCategory);
    if (this.client && typeof this.client.close === 'function') this.client.close(1011, 'relay_transport_error');
    else this.handleTransportClose(1011, 'relay_transport_error', epoch);
  }

  transportEventIsCurrent(epoch) {
    return typeof epoch === 'undefined' || epoch === this.transportEpoch;
  }

  handlePeerPayload(peerId, payload) {
    if (peerId.length === 0) return;
    let inner = payload;
    if (typeof payload === 'string') {
      if (Buffer.byteLength(payload, 'utf8') > MAX_INNER_PAYLOAD_BYTES) {
        this.closePeerSession(peerId, 'relay_backpressure');
        return;
      }
      try {
        inner = JSON.parse(payload);
      } catch (_error) {
        this.closePeerSession(peerId, 'relay_protocol_error');
        return;
      }
    }
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return;
    const type = readString(inner, 'type', '');
    if (type === 'relay.pairing.hello') {
      this.handlePairingHello(peerId, inner);
    } else if (type === 'relay.session.hello') {
      this.handleSessionHello(peerId, inner);
    } else if (type === 'relay.e2ee.data') {
      this.handleEncryptedData(peerId, inner);
    } else {
      this.closePeerSession(peerId, 'relay_protocol_error');
    }
  }

  handlePairingHello(peerId, message) {
    this.expireOfferIfNeeded();
    if (!this.activeOffer) {
      this.sendPeerError(peerId, 'pairing_required', 'No active pairing offer exists.');
      return;
    }
    if (this.activeOffer.consumed || !constantTimeTextEqual(readString(message, 'offerId', ''), this.activeOffer.offerId)) {
      this.sendPeerError(peerId, 'pairing_consumed', 'Pairing offer is invalid or already consumed.');
      return;
    }
    const values = this.validateClientHello(message, true);
    if (!values.ok) {
      this.sendPeerError(peerId, values.failureCategory, values.message);
      return;
    }
    const transcript = canonicalPairingTranscript(values);
    if (!verifyPairingProof(this.activeOffer.pairingSecretKey, transcript, readString(message, 'proof', ''))) {
      this.auditEvent('relay.pairing.rejected', 'rejected', 'warning', 'pairing_proof_invalid');
      this.sendPeerError(peerId, 'pairing_proof_invalid', 'Pairing proof is invalid.');
      return;
    }
    if (!this.rememberHello('pairing', transcript)) {
      this.sendPeerError(peerId, 'handshake_replay', 'Relay pairing handshake was already used.');
      return;
    }
    if (this.identityStore.isRevoked(values.deviceId)) {
      this.sendPeerError(peerId, 'device_revoked', 'This Relay device was revoked.');
      return;
    }
    this.identityStore.trustDevice({
      physicalDeviceId: values.deviceId,
      displayName: readString(message, 'displayName', 'Relay device'),
      platform: readString(message, 'platform', ''),
      publicKeyPem: values.clientIdentityPublicKeyPem,
      publicKeyFingerprint: values.clientIdentityFingerprint
    });
    this.activeOffer.consumed = true;
    this.createPendingSession(peerId, values, true);
    this.clearOfferSecret();
    this.emitUpdated(true);
  }

  handleSessionHello(peerId, message) {
    const values = this.validateClientHello(message, false);
    if (!values.ok) {
      this.sendPeerError(peerId, values.failureCategory, values.message);
      return;
    }
    const device = this.findDevice(values.deviceId);
    if (!device || device.trusted === false || readString(device, 'revokedAt', '').length > 0) {
      this.sendPeerError(peerId, device ? 'device_revoked' : 'pairing_required', device ? 'This Relay device was revoked.' : 'This Relay device must pair first.');
      return;
    }
    if (!constantTimeTextEqual(values.clientIdentityFingerprint, readString(device, 'publicKeyFingerprint', ''))) {
      this.sendPeerError(peerId, 'identity_mismatch', 'Relay device identity does not match the paired device.');
      return;
    }
    const transcript = canonicalSessionHelloTranscript(values);
    if (!verifyHandshake(readString(device, 'publicKeyPem', ''), transcript, readString(message, 'signature', ''))) {
      this.auditEvent('relay.handshake.rejected', 'rejected', 'warning', 'handshake_signature_invalid');
      this.sendPeerError(peerId, 'handshake_signature_invalid', 'Relay client handshake signature is invalid.');
      return;
    }
    if (!this.rememberHello('session', transcript)) {
      this.auditEvent('relay.handshake.rejected', 'rejected', 'warning', 'handshake_replay');
      this.sendPeerError(peerId, 'handshake_replay', 'Relay session handshake was already used.');
      return;
    }
    this.createPendingSession(peerId, values, false);
  }

  validateClientHello(message, pairing) {
    const values = {
      ok: false,
      failureCategory: '',
      message: '',
      protocolVersion: readString(message, 'protocolVersion', ''),
      relayId: readString(message, 'relayId', ''),
      offerId: readString(message, 'offerId', ''),
      deviceId: readString(message, 'deviceId', ''),
      clientIdentityPublicKeyBase64: readString(message, 'clientIdentityPublicKeyBase64', ''),
      clientIdentityPublicKeyPem: readString(message, 'clientIdentityPublicKeyPem', ''),
      clientIdentityFingerprint: readString(message, 'clientIdentityFingerprint', ''),
      bridgeIdentityFingerprint: readString(message, 'bridgeIdentityFingerprint', ''),
      sessionId: readString(message, 'sessionId', ''),
      clientEphemeralPublicKeyBase64: readString(message, 'clientEphemeralPublicKeyBase64', ''),
      clientEphemeralPublicKeyPem: readString(message, 'clientEphemeralPublicKeyPem', ''),
      clientNonce: readString(message, 'clientNonce', ''),
      issuedAt: readNumber(message, 'issuedAt', 0)
    };
    if (values.protocolVersion !== RELAY_PROTOCOL_VERSION) return Object.assign(values, { failureCategory: 'relay_protocol_error', message: 'Relay handshake protocol version is invalid.' });
    if (!constantTimeTextEqual(values.relayId, this.config.relayId)) return Object.assign(values, { failureCategory: 'identity_mismatch', message: 'Relay rendezvous id does not match.' });
    if (!isFreshTimestamp(values.issuedAt)) return Object.assign(values, { failureCategory: 'handshake_expired', message: 'Relay handshake timestamp expired.' });
    if (!/^[A-Za-z0-9_-]{12,160}$/.test(values.deviceId) || !/^[A-Za-z0-9_-]{16,160}$/.test(values.sessionId) || !/^[A-Za-z0-9_-]{16,256}$/.test(values.clientNonce)) {
      return Object.assign(values, { failureCategory: 'relay_protocol_error', message: 'Relay handshake identifiers are invalid.' });
    }
    if (!/^[a-f0-9]{64}$/.test(values.clientIdentityFingerprint) || !/^[a-f0-9]{64}$/.test(values.bridgeIdentityFingerprint)) {
      return Object.assign(values, { failureCategory: 'identity_mismatch', message: 'Relay identity fingerprint is invalid.' });
    }
    const identityKey = canonicalPublicKey(values.clientIdentityPublicKeyBase64, values.clientIdentityPublicKeyPem);
    const ephemeralKey = canonicalPublicKey(values.clientEphemeralPublicKeyBase64, values.clientEphemeralPublicKeyPem);
    if (!identityKey || !ephemeralKey || !constantTimeTextEqual(identityKey.fingerprint, values.clientIdentityFingerprint)) {
      return Object.assign(values, { failureCategory: 'identity_mismatch', message: 'Relay client key material is invalid.' });
    }
    values.clientIdentityPublicKeyBase64 = identityKey.publicKeyBase64;
    values.clientIdentityPublicKeyPem = identityKey.publicKeyPem;
    values.clientEphemeralPublicKeyBase64 = ephemeralKey.publicKeyBase64;
    values.clientEphemeralPublicKeyPem = ephemeralKey.publicKeyPem;
    if (!constantTimeTextEqual(values.bridgeIdentityFingerprint, identityRelayFingerprint(this.identity))) {
      return Object.assign(values, { failureCategory: 'identity_mismatch', message: 'Bridge Relay identity changed and must be confirmed again.' });
    }
    values.ok = true;
    return values;
  }

  createPendingSession(peerId, values, pairedNow) {
    this.closeDeviceSessions(values.deviceId, 'session_replaced');
    for (const current of Array.from(this.sessions.values())) {
      if (current.sessionId === values.sessionId) this.closePeerSession(current.peerId, 'session_replaced');
    }
    if (this.sessions.size >= MAX_ACTIVE_SESSIONS && !this.sessions.has(peerId)) {
      this.sendPeerError(peerId, 'relay_backpressure', 'Bridge Relay session limit was reached.');
      return false;
    }
    this.closePeerSession(peerId, 'session_replaced');
    const ephemeral = generateEphemeralKeyPair();
    const bridgeNonce = crypto.randomBytes(24).toString('base64url');
    let cipher;
    try {
      cipher = createEncryptedSession({
        role: RelayRole.BRIDGE,
        sessionId: values.sessionId,
        localPrivateKey: ephemeral.privateKey,
        peerPublicKey: values.clientEphemeralPublicKeyPem,
        relayId: this.config.relayId,
        clientNonce: values.clientNonce,
        bridgeNonce,
        clientIdentityFingerprint: values.clientIdentityFingerprint,
        bridgeIdentityFingerprint: identityRelayFingerprint(this.identity),
        keyEpoch: 1
      });
    } catch (error) {
      this.sendPeerError(peerId, safeErrorCode(error, 'key_agreement_failed'), 'Relay key agreement failed.');
      return false;
    }
    const responseValues = {
      relayId: this.config.relayId,
      deviceId: values.deviceId,
      clientIdentityFingerprint: values.clientIdentityFingerprint,
      bridgeIdentityFingerprint: identityRelayFingerprint(this.identity),
      sessionId: values.sessionId,
      clientEphemeralPublicKeyBase64: values.clientEphemeralPublicKeyBase64,
      clientEphemeralPublicKeyPem: values.clientEphemeralPublicKeyPem,
      bridgeEphemeralPublicKeyBase64: ephemeral.publicKeyBase64,
      bridgeEphemeralPublicKeyPem: ephemeral.publicKeyPem,
      clientNonce: values.clientNonce,
      bridgeNonce,
      issuedAt: Date.now()
    };
    const responseTranscript = canonicalSessionResponseTranscript(responseValues);
    const response = {
      type: 'relay.session.response',
      protocolVersion: RELAY_PROTOCOL_VERSION,
      relayId: this.config.relayId,
      deviceId: values.deviceId,
      sessionId: values.sessionId,
      bridgeIdentityPublicKeyPem: this.identity.devicePublicKeyPem,
      bridgeIdentityPublicKeyBase64: canonicalPublicKey('', this.identity.devicePublicKeyPem).publicKeyBase64,
      bridgeIdentityFingerprint: identityRelayFingerprint(this.identity),
      bridgeIdentityGeneration: this.identity.generation,
      bridgeEphemeralPublicKeyBase64: ephemeral.publicKeyBase64,
      bridgeEphemeralPublicKeyPem: ephemeral.publicKeyPem,
      clientNonce: values.clientNonce,
      bridgeNonce,
      keyEpoch: 1,
      issuedAt: responseValues.issuedAt,
      paired: pairedNow,
      signature: signHandshake(this.identity.privateKeyPem, responseTranscript)
    };
    const api = this.createSessionApi(peerId, values.deviceId, values.sessionId);
    const session = {
      peerId,
      deviceId: values.deviceId,
      sessionId: values.sessionId,
      cipher,
      api,
      ready: false,
      createdAt: Date.now(),
      clientIdentityFingerprint: values.clientIdentityFingerprint,
      readyTimer: null
    };
    session.readyTimer = setTimeout(() => {
      const current = this.sessions.get(peerId);
      if (current === session && !session.ready) this.closePeerSession(peerId, 'handshake_timeout');
    }, SESSION_READY_TIMEOUT_MS);
    if (session.readyTimer && typeof session.readyTimer.unref === 'function') session.readyTimer.unref();
    this.sessions.set(peerId, session);
    try {
      this.sendPeerPayload(peerId, response);
      return true;
    } catch (_error) {
      this.closePeerSession(peerId, 'relay_unreachable');
      return false;
    }
  }

  handleEncryptedData(peerId, message) {
    const session = this.sessions.get(peerId);
    if (!session) {
      this.sendPeerError(peerId, 'pairing_required', 'Relay E2E session was not established.');
      return;
    }
    try {
      const opened = session.cipher.decrypt(message.envelope);
      if (!session.ready) {
        if (opened.contentType !== 'control') throw new Error('ready_required');
        const ready = JSON.parse(opened.plaintext.toString('utf8'));
        if (!ready || ready.type !== 'relay.session.ready' || ready.sessionId !== session.sessionId) throw new Error('ready_invalid');
        session.ready = true;
        if (session.readyTimer) clearTimeout(session.readyTimer);
        session.readyTimer = null;
        this.onSessionOpen(session.api);
        this.sendEncrypted(session, 'control', JSON.stringify({ type: 'relay.session.ready', sessionId: session.sessionId, accepted: true }));
        this.auditEvent('relay.session.opened', 'connected', 'info', 'e2ee_ready');
        this.emitUpdated();
        return;
      }
      if (opened.contentType === 'json') {
        this.onSessionText(opened.plaintext.toString('utf8'), session.api);
      } else if (opened.contentType === 'binary') {
        this.onSessionBinary(opened.plaintext, session.api);
      } else if (opened.contentType === 'control') {
        this.handleControlMessage(session, opened.plaintext.toString('utf8'));
      } else {
        throw new Error('content_type_invalid');
      }
      session.api.lastSeenAt = Date.now();
    } catch (error) {
      const category = error instanceof RelayCryptoError ? error.code : 'relay_protocol_error';
      this.auditEvent('relay.session.rejected', 'closed', 'warning', category);
      this.closePeerSession(peerId, category);
    }
  }

  handleControlMessage(session, text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (_error) {
      throw new Error('control_invalid');
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('control_invalid');
    const type = readString(message, 'type', '');
    if (type === 'relay.ping') {
      const at = readNumber(message, 'at', Date.now());
      this.lastFrameAt = nowIso();
      this.sendEncrypted(session, 'control', JSON.stringify({ type: 'relay.pong', at }));
      return;
    }
    if (type === 'relay.pong') {
      this.lastFrameAt = nowIso();
      return;
    }
    throw new Error('control_type_invalid');
  }

  createSessionApi(peerId, deviceId, sessionId) {
    const api = {
      connectionId: 'relay_' + sessionId,
      clientId: 'relay_device_' + deviceId,
      appNonce: sessionId,
      requestedEndpoint: this.config.publicRelayUrl,
      remoteAddress: 'relay:' + peerId,
      relayDeviceId: deviceId,
      relaySessionId: sessionId,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      sendJson: (value) => {
        const session = this.sessions.get(peerId);
        if (session && session.ready) this.sendEncrypted(session, 'json', JSON.stringify(value));
      },
      sendBinary: (value) => {
        const session = this.sessions.get(peerId);
        if (session && session.ready) this.sendEncrypted(session, 'binary', Buffer.from(value));
      },
      sendPing: () => {
        const session = this.sessions.get(peerId);
        if (session && session.ready) this.sendEncrypted(session, 'control', JSON.stringify({ type: 'relay.ping', at: Date.now() }));
      },
      close: () => this.closePeerSession(peerId, 'bridge_closed')
    };
    return api;
  }

  sendEncrypted(session, contentType, plaintext) {
    try {
      const envelope = session.cipher.encrypt(contentType, plaintext);
      this.sendPeerPayload(session.peerId, { type: 'relay.e2ee.data', envelope });
    } catch (_error) {
      this.closePeerSession(session.peerId, 'ciphertext_invalid');
    }
  }

  sendPeerPayload(peerId, payload) {
    this.sendTransport({
      type: 'relay.frame',
      relayId: this.config.relayId,
      connectionId: this.connectionId,
      targetConnectionId: peerId,
      frameId: randomId('frame', 12),
      payload: JSON.stringify(payload)
    });
  }

  sendPeerError(peerId, failureCategory, message) {
    this.sendPeerPayload(peerId, {
      type: 'relay.error',
      failureCategory,
      message,
      remediation: failureCategory === 'pairing_required' ? 'Create and scan a new pairing offer.' : ''
    });
  }

  sendTransport(value) {
    if (!this.client || typeof this.client.sendJson !== 'function') throw Object.assign(new Error('Relay transport is not connected.'), { code: 'relay_unreachable' });
    const accepted = this.client.sendJson(value);
    if (accepted === false) {
      throw Object.assign(new Error('Relay transport outgoing queue is full.'), { code: 'relay_backpressure' });
    }
  }

  closePeerSession(peerId, reason) {
    const session = this.sessions.get(peerId);
    if (!session) return false;
    this.sessions.delete(peerId);
    if (session.readyTimer) clearTimeout(session.readyTimer);
    session.readyTimer = null;
    try {
      session.cipher.destroy();
    } catch (_error) {
      // Session removal is authoritative.
    }
    if (session.ready) {
      try {
        this.onSessionClose(session.api, reason);
      } catch (_error) {
        // Virtual connection cleanup remains authoritative.
      }
    }
    return true;
  }

  closeDeviceSessions(deviceId, reason) {
    for (const session of Array.from(this.sessions.values())) {
      if (session.deviceId === deviceId) this.closePeerSession(session.peerId, reason);
    }
  }

  closeAllSessions(reason) {
    for (const peerId of Array.from(this.sessions.keys())) this.closePeerSession(peerId, reason);
  }

  closeTransport(reason) {
    const client = this.client;
    this.transportEpoch += 1;
    this.client = null;
    this.connectionId = '';
    this.closeAllSessions(reason);
    if (client && typeof client.close === 'function') {
      try {
        client.close(1000, reason);
      } catch (_error) {
        // State cleanup is authoritative.
      }
    }
    this.transportStatus = 'disconnected';
    this.connectedAt = '';
  }

  scheduleReconnect() {
    if (!this.desiredConnected || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.reconnectAttempt - 1, 5)), RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.desiredConnected) return;
      void this.connect({ relayUrl: this.config.relayUrl, relayId: this.config.relayId, confirm: true });
    }, delay);
    if (this.reconnectTimer && typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  cancelPairingInternal(reason) {
    if (!this.activeOffer) return false;
    this.clearOfferSecret();
    this.activeOffer = null;
    this.auditEvent('relay.pairing.closed', reason, 'info', reason);
    return true;
  }

  clearOfferSecret() {
    if (!this.activeOffer) return;
    if (Buffer.isBuffer(this.activeOffer.pairingSecretKey)) this.activeOffer.pairingSecretKey.fill(0);
    this.activeOffer.pairingSecretKey = null;
  }

  expireOfferIfNeeded() {
    if (this.activeOffer && (this.activeOffer.consumed || Date.now() >= this.activeOffer.expiresAt)) {
      this.cancelPairingInternal(this.activeOffer.consumed ? 'consumed' : 'expired');
    }
  }

  rememberHello(kind, transcript) {
    this.pruneHelloReplayCache();
    const digest = crypto.createHash('sha256').update(kind + '\n' + transcript, 'utf8').digest('hex');
    if (this.helloReplayCache.has(digest)) return false;
    this.helloReplayCache.set(digest, Date.now() + HELLO_REPLAY_TTL_MS);
    while (this.helloReplayCache.size > MAX_HELLO_REPLAY_ENTRIES) {
      const oldest = this.helloReplayCache.keys().next();
      if (oldest.done) break;
      this.helloReplayCache.delete(oldest.value);
    }
    return true;
  }

  pruneHelloReplayCache() {
    const now = Date.now();
    for (const entry of this.helloReplayCache.entries()) {
      if (entry[1] <= now) this.helloReplayCache.delete(entry[0]);
    }
  }

  findDevice(deviceId) {
    for (const device of this.identityStore.deviceList()) {
      if (readString(device, 'physicalDeviceId', '') === deviceId) return device;
    }
    return null;
  }

  devicePlanDigest(device, action) {
    return crypto.createHash('sha256').update(JSON.stringify([
      action,
      readString(device, 'physicalDeviceId', ''),
      readString(device, 'publicKeyFingerprint', ''),
      readBoolean(device, 'trusted', false),
      readString(device, 'updatedAt', '')
    ])).digest('hex');
  }

  identityPlanDigest() {
    const devices = this.identityStore.deviceList().map((device) => {
      return [
        readString(device, 'physicalDeviceId', ''),
        readString(device, 'publicKeyFingerprint', ''),
        readBoolean(device, 'trusted', false),
        readString(device, 'updatedAt', '')
      ];
    });
    devices.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return crypto.createHash('sha256').update(JSON.stringify([
      this.identity.generation,
      identityRelayFingerprint(this.identity),
      devices
    ])).digest('hex');
  }

  createPlan(action, targetId, digest) {
    this.prunePlans();
    const planId = randomId('relay_plan', 18);
    this.plans.set(planId, { action, targetId, digest, expiresAt: Date.now() + PLAN_TTL_MS, consumed: false });
    return planId;
  }

  consumePlan(planId, action, targetId, digest) {
    this.prunePlans();
    const plan = this.plans.get(planId);
    if (!plan || plan.consumed || plan.expiresAt <= Date.now()) return this.failure('plan_expired', 'Relay operation plan is missing or expired.', 'Preview the operation again.');
    if (plan.action !== action || plan.targetId !== targetId || !constantTimeTextEqual(plan.digest, digest)) return this.failure('plan_stale', 'Relay operation state changed after preview.', 'Refresh status and preview the operation again.');
    plan.consumed = true;
    this.plans.delete(planId);
    return { ok: true };
  }

  prunePlans() {
    const now = Date.now();
    for (const entry of this.plans.entries()) {
      const plan = entry[1];
      if (plan.consumed || plan.expiresAt <= now) this.plans.delete(entry[0]);
    }
  }

  readPersistedConfig() {
    const daemon = this.store && this.store.config && this.store.config.daemon && typeof this.store.config.daemon === 'object'
      ? this.store.config.daemon
      : {};
    const relay = daemon.relay && typeof daemon.relay === 'object' && !Array.isArray(daemon.relay) ? daemon.relay : {};
    const relayUrl = readString(relay, 'url', process.env.AGENT_BRIDGE_RELAY_URL || '');
    const relayId = readString(relay, 'relayId', '');
    const validation = relayUrl.length > 0 ? safeRelayUrl(relayUrl, this.allowInsecureLoopback) : { ok: false };
    return {
      relayUrl: validation.ok ? validation.url : '',
      publicRelayUrl: validation.ok ? validation.publicUrl : '',
      relayId: /^[A-Za-z0-9_-]{24,160}$/.test(relayId) ? relayId : ''
    };
  }

  persistConfig() {
    if (!this.store || typeof this.store.writeConfig !== 'function') return;
    const source = this.store.config && typeof this.store.config === 'object' ? this.store.config : {};
    const daemon = source.daemon && typeof source.daemon === 'object' ? Object.assign({}, source.daemon) : {};
    daemon.relay = {
      url: this.config.relayUrl,
      relayId: this.config.relayId,
      updatedAt: nowIso()
    };
    const next = Object.assign({}, source, { daemon });
    this.store.writeConfig(next);
  }

  emitUpdated(devicesChanged) {
    try {
      this.onUpdated(this.status(), devicesChanged === true);
    } catch (_error) {
      // UI notification failure must not alter Relay state.
    }
  }

  auditEvent(action, status, severity, reason) {
    try {
      this.audit({
        category: 'relay',
        action,
        status,
        severity,
        reason,
        message: 'Relay security state changed.',
        relayFingerprint: relayIdFingerprint(this.config.relayId),
        connectionId: this.connectionId
      });
    } catch (_error) {
      // Audit persistence is independent from protocol state.
    }
  }

  failure(failureCategory, message, remediation) {
    return {
      ok: false,
      failureCategory,
      message,
      remediation: remediation || '',
      warnings: [],
      updatedAt: nowIso()
    };
  }
}

module.exports = {
  HANDSHAKE_MAX_AGE_MS,
  MAX_ACTIVE_SESSIONS,
  MAX_INNER_PAYLOAD_BYTES,
  RELAY_PROTOCOL_VERSION,
  RelayManager,
  canonicalPairingTranscript,
  canonicalSessionHelloTranscript,
  canonicalSessionResponseTranscript,
  safeRelayUrl
};
