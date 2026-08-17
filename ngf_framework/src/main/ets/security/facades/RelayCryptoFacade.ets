import { asset } from '@kit.AssetStoreKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { logger } from '../../utils/Logger';

const TAG: string = 'RelayCryptoFacade';

export enum RelayCryptoDirection {
  APP_TO_BRIDGE = 'app_to_bridge',
  BRIDGE_TO_APP = 'bridge_to_app'
}

export enum RelayCryptoRole {
  INITIATOR = 'initiator',
  RESPONDER = 'responder'
}

export class RelayCryptoFailureCategory {
  static readonly INVALID_ARGUMENT: string = 'invalid_argument';
  static readonly SECRET_STORE_UNAVAILABLE: string = 'secret_store_unavailable';
  static readonly IDENTITY_CORRUPTED: string = 'identity_corrupted';
  static readonly HANDSHAKE_EXPIRED: string = 'handshake_expired';
  static readonly HANDSHAKE_NOT_FOUND: string = 'handshake_not_found';
  static readonly REPLAY_DETECTED: string = 'replay_detected';
  static readonly SEQUENCE_GAP: string = 'sequence_gap';
  static readonly AUTHENTICATION_FAILED: string = 'authentication_failed';
  static readonly CRYPTO_OPERATION_FAILED: string = 'crypto_operation_failed';
  static readonly SESSION_CLOSED: string = 'session_closed';
}

export class RelayCryptoError extends Error {
  readonly failureCategory: string;

  constructor(failureCategory: string, message: string) {
    super(message);
    this.name = 'RelayCryptoError';
    this.failureCategory = failureCategory;
  }
}

export interface IRelaySecretStore {
  getStorageKind(): string;
  loadSecret(alias: string): Promise<Uint8Array | null>;
  saveSecret(alias: string, secret: Uint8Array): Promise<void>;
  removeSecret(alias: string): Promise<void>;
}

/** AssetStore-backed binary secret storage. It never serializes key material to JSON. */
export class RelayAssetSecretStore implements IRelaySecretStore {
  getStorageKind(): string {
    return 'asset_store';
  }

  async loadSecret(alias: string): Promise<Uint8Array | null> {
    RelayCryptoProtocol.requireSafeAlias(alias);
    try {
      const query: asset.AssetMap = new Map();
      query.set(asset.Tag.ALIAS, RelayCryptoProtocol.encodeUtf8(alias));
      query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
      const results: Array<asset.AssetMap> = await asset.query(query);
      if (results.length === 0) {
        return null;
      }
      const value: asset.Value | undefined = results[0].get(asset.Tag.SECRET);
      if (value instanceof Uint8Array) {
        const copy: Uint8Array = new Uint8Array(value);
        value.fill(0);
        return copy;
      }
      return null;
    } catch (error) {
      const message: string = RelayCryptoProtocol.errorMessage(error);
      if (message.indexOf('24000002') >= 0) {
        return null;
      }
      throw new RelayCryptoError(RelayCryptoFailureCategory.SECRET_STORE_UNAVAILABLE,
        'AssetStore query failed: ' + message);
    }
  }

  async saveSecret(alias: string, secret: Uint8Array): Promise<void> {
    RelayCryptoProtocol.requireSafeAlias(alias);
    if (secret.length === 0) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Secret must not be empty');
    }
    const secretCopy: Uint8Array = new Uint8Array(secret);
    try {
      const attributes: asset.AssetMap = new Map();
      attributes.set(asset.Tag.ALIAS, RelayCryptoProtocol.encodeUtf8(alias));
      attributes.set(asset.Tag.SECRET, secretCopy);
      attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
      attributes.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
      attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
      attributes.set(asset.Tag.REQUIRE_ATTR_ENCRYPTED, true);
      await asset.add(attributes);
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.SECRET_STORE_UNAVAILABLE,
        'AssetStore write failed: ' + RelayCryptoProtocol.errorMessage(error));
    } finally {
      secretCopy.fill(0);
    }
  }

  async removeSecret(alias: string): Promise<void> {
    RelayCryptoProtocol.requireSafeAlias(alias);
    try {
      const query: asset.AssetMap = new Map();
      query.set(asset.Tag.ALIAS, RelayCryptoProtocol.encodeUtf8(alias));
      await asset.remove(query);
    } catch (error) {
      const message: string = RelayCryptoProtocol.errorMessage(error);
      if (message.indexOf('24000002') < 0) {
        logger.warn(TAG, 'AssetStore remove failed for relay identity alias: ' + message);
      }
    }
  }
}

export class RelayIdentityInfo {
  readonly alias: string;
  readonly publicKeyBase64: string;
  readonly fingerprintSha256: string;
  readonly keyType: string;
  readonly signatureAlgorithm: string;
  readonly storage: string;

  constructor(alias: string, publicKeyBase64: string, fingerprintSha256: string, storage: string) {
    this.alias = alias;
    this.publicKeyBase64 = publicKeyBase64;
    this.fingerprintSha256 = fingerprintSha256;
    this.keyType = 'P-256';
    this.signatureAlgorithm = 'ECDSA_P256_SHA256';
    this.storage = storage;
  }
}

export class RelayHandshakeOffer {
  readonly handle: string;
  readonly sessionId: string;
  readonly role: RelayCryptoRole;
  readonly ephemeralPublicKeyBase64: string;
  readonly algorithm: string;
  readonly expiresAt: number;

  constructor(
    handle: string,
    sessionId: string,
    role: RelayCryptoRole,
    ephemeralPublicKeyBase64: string,
    expiresAt: number
  ) {
    this.handle = handle;
    this.sessionId = sessionId;
    this.role = role;
    this.ephemeralPublicKeyBase64 = ephemeralPublicKeyBase64;
    this.algorithm = 'P-256_ECDH_HKDF_SHA256';
    this.expiresAt = expiresAt;
  }
}

export class RelayIdentityProof {
  readonly identityPublicKeyBase64: string;
  readonly identityFingerprintSha256: string;
  readonly signatureBase64: string;
  readonly signatureAlgorithm: string;

  constructor(publicKeyBase64: string, fingerprintSha256: string, signatureBase64: string) {
    this.identityPublicKeyBase64 = publicKeyBase64;
    this.identityFingerprintSha256 = fingerprintSha256;
    this.signatureBase64 = signatureBase64;
    this.signatureAlgorithm = 'ECDSA_P256_SHA256';
  }
}

export class RelayEncryptedEnvelope {
  readonly version: number;
  readonly sessionId: string;
  readonly direction: RelayCryptoDirection;
  readonly seq: number;
  readonly keyEpoch: number;
  readonly contentType: string;
  readonly nonceBase64: string;
  readonly cipherTextBase64: string;
  readonly authTagBase64: string;
  readonly aadBase64: string;

  constructor(
    sessionId: string,
    direction: RelayCryptoDirection,
    seq: number,
    keyEpoch: number,
    contentType: string,
    nonceBase64: string,
    cipherTextBase64: string,
    authTagBase64: string,
    aadBase64: string
  ) {
    this.version = 1;
    this.sessionId = sessionId;
    this.direction = direction;
    this.seq = seq;
    this.keyEpoch = keyEpoch;
    this.contentType = contentType;
    this.nonceBase64 = nonceBase64;
    this.cipherTextBase64 = cipherTextBase64;
    this.authTagBase64 = authTagBase64;
    this.aadBase64 = aadBase64;
  }
}

export class RelayCryptoProtocol {
  static readonly RELAY_PROTOCOL_VERSION: string = 'ngf-agent-bridge.relay.v1';
  static readonly VERSION: number = 1;
  static readonly FIRST_SEQUENCE: number = 1;
  static readonly MAX_SEQUENCE: number = 9007199254740991;
  static readonly MAX_CONTENT_BYTES: number = 1048576;

  static buildAadText(
    sessionId: string,
    direction: string,
    seq: number,
    keyEpoch: number,
    contentType: string
  ): string {
    RelayCryptoProtocol.requireSafeToken(sessionId, 'sessionId', 160);
    RelayCryptoProtocol.requireDirection(direction);
    RelayCryptoProtocol.requireSequence(seq);
    RelayCryptoProtocol.requirePositiveInteger(keyEpoch, 'keyEpoch');
    RelayCryptoProtocol.requireSafeToken(contentType, 'contentType', 128);
    return 'ngf-relay-v1\n' +
      RelayCryptoProtocol.lengthPrefixed(sessionId) + '\n' +
      RelayCryptoProtocol.lengthPrefixed(direction) + '\n' +
      seq.toString() + '\n' + keyEpoch.toString() + '\n' +
      RelayCryptoProtocol.lengthPrefixed(contentType);
  }

  static buildKdfSaltText(relayId: string, clientNonce: string, bridgeNonce: string): string {
    RelayCryptoProtocol.requireSafeToken(relayId, 'relayId', 256);
    RelayCryptoProtocol.requireSafeToken(clientNonce, 'clientNonce', 256);
    RelayCryptoProtocol.requireSafeToken(bridgeNonce, 'bridgeNonce', 256);
    return 'ngf-relay-hkdf-salt-v1\n' + relayId + '\n' + clientNonce + '\n' + bridgeNonce;
  }

  static buildKdfInfoText(
    sessionId: string,
    clientIdentityFingerprint: string,
    bridgeIdentityFingerprint: string,
    keyEpoch: number
  ): string {
    RelayCryptoProtocol.requireSafeToken(sessionId, 'sessionId', 160);
    RelayCryptoProtocol.requireSafeToken(clientIdentityFingerprint, 'clientIdentityFingerprint', 256);
    RelayCryptoProtocol.requireSafeToken(bridgeIdentityFingerprint, 'bridgeIdentityFingerprint', 256);
    RelayCryptoProtocol.requirePositiveInteger(keyEpoch, 'keyEpoch');
    return 'ngf-relay-session-v1\n' + sessionId + '\n' + clientIdentityFingerprint + '\n' +
      bridgeIdentityFingerprint + '\n' + keyEpoch.toString();
  }

  static buildIdentityProofText(offer: RelayHandshakeOffer, challengeBase64: string): string {
    RelayCryptoProtocol.requireSafeToken(offer.sessionId, 'sessionId', 160);
    RelayCryptoProtocol.requireSafeBase64(challengeBase64, 'challenge');
    RelayCryptoProtocol.requireSafeBase64(offer.ephemeralPublicKeyBase64, 'ephemeralPublicKey');
    return 'ngf-relay-proof-v1\n' +
      RelayCryptoProtocol.lengthPrefixed(offer.sessionId) + '\n' +
      RelayCryptoProtocol.lengthPrefixed(offer.role) + '\n' +
      RelayCryptoProtocol.lengthPrefixed(offer.ephemeralPublicKeyBase64) + '\n' +
      RelayCryptoProtocol.lengthPrefixed(challengeBase64) + '\n' + offer.expiresAt.toString();
  }

  static encodeUtf8(value: string): Uint8Array {
    const encoder: util.TextEncoder = new util.TextEncoder();
    return encoder.encodeInto(value);
  }

  static encodeBase64Url(value: Uint8Array): string {
    const helper: util.Base64Helper = new util.Base64Helper();
    const basic: string = helper.encodeToStringSync(value);
    let output: string = '';
    for (let index: number = 0; index < basic.length; index++) {
      const current: string = basic.charAt(index);
      if (current === '=') {
        continue;
      }
      if (current === '+') {
        output += '-';
      } else if (current === '/') {
        output += '_';
      } else {
        output += current;
      }
    }
    return output;
  }

  static encodeBase64(value: Uint8Array): string {
    const helper: util.Base64Helper = new util.Base64Helper();
    return helper.encodeToStringSync(value);
  }

  static decodeBase64Flexible(value: string): Uint8Array {
    if (value.indexOf('-') >= 0 || value.indexOf('_') >= 0) {
      return RelayCryptoProtocol.decodeBase64Url(value);
    }
    RelayCryptoProtocol.requireSafeBase64(value, 'base64');
    const helper: util.Base64Helper = new util.Base64Helper();
    return helper.decodeSync(value);
  }

  static decodeBase64Url(value: string): Uint8Array {
    if (value.length === 0 || value.length > 32768) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Base64URL value is invalid');
    }
    let basic: string = '';
    for (let index: number = 0; index < value.length; index++) {
      const current: string = value.charAt(index);
      if (current === '-') {
        basic += '+';
      } else if (current === '_') {
        basic += '/';
      } else {
        const code: number = value.charCodeAt(index);
        const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122);
        if (!alphaNumeric) {
          throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Base64URL value is invalid');
        }
        basic += current;
      }
    }
    while (basic.length % 4 !== 0) {
      basic += '=';
    }
    const helper: util.Base64Helper = new util.Base64Helper();
    return helper.decodeSync(basic);
  }

  static errorMessage(error: Object): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  static requireSafeAlias(alias: string): void {
    RelayCryptoProtocol.requireSafeToken(alias, 'alias', 160);
  }

  static requireSafeToken(value: string, fieldName: string, maxLength: number): void {
    if (value.length === 0 || value.length > maxLength) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT,
        fieldName + ' length is invalid');
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      const punctuation: boolean = code === 45 || code === 46 || code === 47 || code === 58 || code === 95 ||
        code === 43;
      if (!alphaNumeric && !punctuation) {
        throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT,
          fieldName + ' contains an unsupported character');
      }
    }
  }

  static requireDirection(direction: string): void {
    if (direction !== RelayCryptoDirection.APP_TO_BRIDGE && direction !== RelayCryptoDirection.BRIDGE_TO_APP) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay direction is invalid');
    }
  }

  static requireSequence(seq: number): void {
    if (!Number.isFinite(seq) || !Number.isInteger(seq) || seq < RelayCryptoProtocol.FIRST_SEQUENCE ||
      seq > RelayCryptoProtocol.MAX_SEQUENCE) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay sequence is invalid');
    }
  }

  static requirePositiveInteger(value: number, fieldName: string): void {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 ||
      value > RelayCryptoProtocol.MAX_SEQUENCE) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, fieldName + ' is invalid');
    }
  }

  static requireSafeBase64(value: string, fieldName: string): void {
    if (value.length === 0 || value.length > 8192) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, fieldName + ' is invalid');
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!alphaNumeric && code !== 43 && code !== 47 && code !== 61) {
        throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, fieldName + ' is invalid');
      }
    }
  }

  private static lengthPrefixed(value: string): string {
    return value.length.toString() + ':' + value;
  }
}

class RelayPendingHandshake {
  readonly offer: RelayHandshakeOffer;
  readonly keyPair: cryptoFramework.KeyPair;

  constructor(offer: RelayHandshakeOffer, keyPair: cryptoFramework.KeyPair) {
    this.offer = offer;
    this.keyPair = keyPair;
  }
}

export class RelayCryptoSession {
  readonly sessionId: string;
  readonly sendDirection: RelayCryptoDirection;
  readonly receiveDirection: RelayCryptoDirection;
  readonly keyEpoch: number;
  private readonly base64Helper: util.Base64Helper = new util.Base64Helper();
  private readonly sendKey: cryptoFramework.SymKey;
  private readonly receiveKey: cryptoFramework.SymKey;
  private nextSendSeq: number = RelayCryptoProtocol.FIRST_SEQUENCE;
  private nextReceiveSeq: number = RelayCryptoProtocol.FIRST_SEQUENCE;
  private closed: boolean = false;

  constructor(
    sessionId: string,
    sendDirection: RelayCryptoDirection,
    receiveDirection: RelayCryptoDirection,
    keyEpoch: number,
    sendKey: cryptoFramework.SymKey,
    receiveKey: cryptoFramework.SymKey
  ) {
    this.sessionId = sessionId;
    this.sendDirection = sendDirection;
    this.receiveDirection = receiveDirection;
    this.keyEpoch = keyEpoch;
    this.sendKey = sendKey;
    this.receiveKey = receiveKey;
  }

  getNextSendSequence(): number {
    return this.nextSendSeq;
  }

  getNextReceiveSequence(): number {
    return this.nextReceiveSeq;
  }

  async encrypt(plainText: Uint8Array, contentType: string): Promise<RelayEncryptedEnvelope> {
    this.requireOpen();
    if (plainText.length > RelayCryptoProtocol.MAX_CONTENT_BYTES) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay content exceeds the limit');
    }
    const seq: number = this.nextSendSeq;
    RelayCryptoProtocol.requireSequence(seq);
    const aadText: string = RelayCryptoProtocol.buildAadText(
      this.sessionId,
      this.sendDirection,
      seq,
      this.keyEpoch,
      contentType
    );
    const aadBytes: Uint8Array = RelayCryptoProtocol.encodeUtf8(aadText);
    const nonce: Uint8Array = cryptoFramework.createRandom().generateRandomSync(12).data;
    const emptyTag: cryptoFramework.DataBlob = { data: new Uint8Array(16) };
    const params: cryptoFramework.GcmParamsSpec = {
      algName: 'GcmParamsSpec',
      iv: { data: nonce },
      aad: { data: aadBytes },
      authTag: emptyTag
    };
    try {
      const cipher: cryptoFramework.Cipher = cryptoFramework.createCipher('AES256|GCM');
      await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, this.sendKey, params);
      const input: cryptoFramework.DataBlob = { data: new Uint8Array(plainText) };
      const encrypted: cryptoFramework.DataBlob = await cipher.update(input);
      const tag: cryptoFramework.DataBlob = await cipher.doFinal(null);
      const envelope: RelayEncryptedEnvelope = new RelayEncryptedEnvelope(
        this.sessionId,
        this.sendDirection,
        seq,
        this.keyEpoch,
        contentType,
        this.base64Helper.encodeToStringSync(nonce),
        this.base64Helper.encodeToStringSync(encrypted.data),
        this.base64Helper.encodeToStringSync(tag.data),
        this.base64Helper.encodeToStringSync(aadBytes)
      );
      this.nextSendSeq += 1;
      return envelope;
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.CRYPTO_OPERATION_FAILED,
        'Relay encryption failed: ' + RelayCryptoProtocol.errorMessage(error));
    }
  }

  async decrypt(envelope: RelayEncryptedEnvelope): Promise<Uint8Array> {
    this.requireOpen();
    this.requireExpectedEnvelope(envelope);
    const aadText: string = RelayCryptoProtocol.buildAadText(
      envelope.sessionId,
      envelope.direction,
      envelope.seq,
      envelope.keyEpoch,
      envelope.contentType
    );
    const aadBytes: Uint8Array = RelayCryptoProtocol.encodeUtf8(aadText);
    let encodedAad: Uint8Array = new Uint8Array(0);
    let nonce: Uint8Array;
    let cipherText: Uint8Array;
    let authTag: Uint8Array;
    try {
      if (envelope.aadBase64.length > 0) {
        encodedAad = this.base64Helper.decodeSync(envelope.aadBase64);
      }
      nonce = this.base64Helper.decodeSync(envelope.nonceBase64);
      cipherText = this.base64Helper.decodeSync(envelope.cipherTextBase64);
      authTag = this.base64Helper.decodeSync(envelope.authTagBase64);
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.AUTHENTICATION_FAILED,
        'Relay envelope encoding is invalid');
    }
    if ((encodedAad.length > 0 && !RelayCryptoFacade.constantTimeEquals(aadBytes, encodedAad)) ||
      nonce.length !== 12 || authTag.length !== 16 ||
      cipherText.length > RelayCryptoProtocol.MAX_CONTENT_BYTES + 64) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.AUTHENTICATION_FAILED,
        'Relay envelope authentication metadata is invalid');
    }
    const params: cryptoFramework.GcmParamsSpec = {
      algName: 'GcmParamsSpec',
      iv: { data: nonce },
      aad: { data: aadBytes },
      authTag: { data: authTag }
    };
    try {
      const cipher: cryptoFramework.Cipher = cryptoFramework.createCipher('AES256|GCM');
      await cipher.init(cryptoFramework.CryptoMode.DECRYPT_MODE, this.receiveKey, params);
      const input: cryptoFramework.DataBlob = { data: cipherText };
      const plain: cryptoFramework.DataBlob = await cipher.update(input);
      await cipher.doFinal(null);
      this.nextReceiveSeq += 1;
      return new Uint8Array(plain.data);
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.AUTHENTICATION_FAILED,
        'Relay envelope authentication failed');
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.sendKey.clearMem();
    this.receiveKey.clearMem();
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.SESSION_CLOSED, 'Relay crypto session is closed');
    }
  }

  private requireExpectedEnvelope(envelope: RelayEncryptedEnvelope): void {
    if (envelope.version !== RelayCryptoProtocol.VERSION || envelope.sessionId !== this.sessionId ||
      envelope.direction !== this.receiveDirection || envelope.keyEpoch !== this.keyEpoch) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.AUTHENTICATION_FAILED,
        'Relay envelope scope does not match the session');
    }
    RelayCryptoProtocol.requireSequence(envelope.seq);
    if (envelope.seq < this.nextReceiveSeq) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.REPLAY_DETECTED, 'Relay envelope sequence was already used');
    }
    if (envelope.seq > this.nextReceiveSeq) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.SEQUENCE_GAP, 'Relay envelope sequence is not contiguous');
    }
  }
}

export class RelayCryptoFacade {
  private static readonly HANDSHAKE_TTL_MS: number = 300000;
  private static readonly MAX_PENDING_HANDSHAKES: number = 32;
  private static readonly PRIVATE_SUFFIX: string = '.identity.private';
  private static readonly PUBLIC_SUFFIX: string = '.identity.public';
  private readonly base64Helper: util.Base64Helper = new util.Base64Helper();
  private readonly secretStore: IRelaySecretStore;
  private readonly pendingHandshakes: Map<string, RelayPendingHandshake> = new Map();

  constructor(secretStore: IRelaySecretStore = new RelayAssetSecretStore()) {
    this.secretStore = secretStore;
  }

  async getOrCreateIdentity(alias: string): Promise<RelayIdentityInfo> {
    RelayCryptoProtocol.requireSafeAlias(alias);
    const storedKeyPair: cryptoFramework.KeyPair | null = await this.loadIdentityKeyPair(alias);
    let keyPair: cryptoFramework.KeyPair;
    let created: boolean = false;
    if (storedKeyPair === null) {
      keyPair = await cryptoFramework.createAsyKeyGenerator('ECC256').generateKeyPair();
      created = true;
    } else {
      keyPair = storedKeyPair;
    }
    try {
      if (created) {
        await this.persistIdentityKeyPair(alias, keyPair);
      }
      return await this.buildIdentityInfo(alias, keyPair.pubKey.getEncoded().data);
    } finally {
      keyPair.priKey.clearMem();
    }
  }

  async deleteIdentity(alias: string): Promise<void> {
    RelayCryptoProtocol.requireSafeAlias(alias);
    await this.secretStore.removeSecret(alias + RelayCryptoFacade.PRIVATE_SUFFIX);
    await this.secretStore.removeSecret(alias + RelayCryptoFacade.PUBLIC_SUFFIX);
  }

  async createHandshake(sessionId: string, role: RelayCryptoRole): Promise<RelayHandshakeOffer> {
    RelayCryptoProtocol.requireSafeToken(sessionId, 'sessionId', 160);
    if (role !== RelayCryptoRole.INITIATOR && role !== RelayCryptoRole.RESPONDER) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay handshake role is invalid');
    }
    this.removeExpiredHandshakes();
    if (this.pendingHandshakes.size >= RelayCryptoFacade.MAX_PENDING_HANDSHAKES) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT,
        'Too many pending relay handshakes');
    }
    const keyPair: cryptoFramework.KeyPair = await cryptoFramework.createAsyKeyGenerator('ECC256').generateKeyPair();
    try {
      const handle: string = this.base64Helper.encodeToStringSync(
        cryptoFramework.createRandom().generateRandomSync(18).data
      );
      const expiresAt: number = Date.now() + RelayCryptoFacade.HANDSHAKE_TTL_MS;
      const publicKeyBase64: string = this.base64Helper.encodeToStringSync(keyPair.pubKey.getEncoded().data);
      const offer: RelayHandshakeOffer = new RelayHandshakeOffer(handle, sessionId, role, publicKeyBase64, expiresAt);
      this.pendingHandshakes.set(handle, new RelayPendingHandshake(offer, keyPair));
      return offer;
    } catch (error) {
      keyPair.priKey.clearMem();
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(RelayCryptoProtocol.errorMessage(error));
    }
  }

  generateHandshakeSaltBase64(): string {
    return this.base64Helper.encodeToStringSync(cryptoFramework.createRandom().generateRandomSync(32).data);
  }

  generateRandomBase64Url(byteLength: number): string {
    if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 128) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Random byte length is invalid');
    }
    return RelayCryptoProtocol.encodeBase64Url(
      cryptoFramework.createRandom().generateRandomSync(byteLength).data
    );
  }

  async buildIdentityAlias(hostProfileId: string, relayId: string): Promise<string> {
    if (hostProfileId.length === 0 || hostProfileId.length > 512) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Host profile scope is invalid');
    }
    RelayCryptoProtocol.requireSafeToken(relayId, 'relayId', 160);
    const digest: Uint8Array = await this.sha256Bytes(
      RelayCryptoProtocol.encodeUtf8('ngf-relay-identity-alias-v1\n' + hostProfileId + '\n' + relayId)
    );
    return 'ngf.relay.' + RelayCryptoFacade.toHex(digest);
  }

  async publicKeyPemToBase64(publicKeyPem: string): Promise<string> {
    if (publicKeyPem.length === 0 || publicKeyPem.length > 8192) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay public key PEM is invalid');
    }
    try {
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const pair: cryptoFramework.KeyPair = await generator.convertPemKey(publicKeyPem, null);
      return this.base64Helper.encodeToStringSync(pair.pubKey.getEncoded().data);
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay public key PEM is invalid');
    }
  }

  async publicKeyBase64ToPem(publicKeyBase64: string): Promise<string> {
    try {
      RelayCryptoProtocol.requireSafeBase64(publicKeyBase64, 'publicKey');
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const publicBlob: cryptoFramework.DataBlob = { data: this.base64Helper.decodeSync(publicKeyBase64) };
      const pair: cryptoFramework.KeyPair = await generator.convertKey(publicBlob, null);
      return pair.pubKey.getEncodedPem('X509');
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay public key DER is invalid');
    }
  }

  async fingerprintPublicKeyBase64(publicKeyBase64: string): Promise<string> {
    RelayCryptoProtocol.requireSafeBase64(publicKeyBase64, 'publicKey');
    const publicBytes: Uint8Array = this.base64Helper.decodeSync(publicKeyBase64);
    const digest: Uint8Array = await this.sha256Bytes(publicBytes);
    return RelayCryptoFacade.toHex(digest);
  }

  async createPairingProof(pairingSecret: string, transcript: string): Promise<string> {
    const secretBytes: Uint8Array = RelayCryptoProtocol.encodeUtf8(pairingSecret);
    if (secretBytes.length < 16 || secretBytes.length > 4096 || transcript.length === 0 || transcript.length > 32768) {
      secretBytes.fill(0);
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay pairing proof input is invalid');
    }
    let key: cryptoFramework.SymKey | null = null;
    try {
      const keyGenerator: cryptoFramework.SymKeyGenerator = cryptoFramework.createSymKeyGenerator('HMAC');
      key = await keyGenerator.convertKey({ data: secretBytes });
      const mac: cryptoFramework.Mac = cryptoFramework.createMac('SHA256');
      await mac.init(key);
      await mac.update({ data: RelayCryptoProtocol.encodeUtf8(transcript) });
      const proof: cryptoFramework.DataBlob = await mac.doFinal();
      return RelayCryptoProtocol.encodeBase64Url(proof.data);
    } catch (error) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.CRYPTO_OPERATION_FAILED,
        'Relay pairing proof generation failed');
    } finally {
      secretBytes.fill(0);
      if (key !== null) {
        key.clearMem();
      }
    }
  }

  async signIdentityTranscript(identityAlias: string, transcript: string): Promise<string> {
    if (transcript.length === 0 || transcript.length > 32768) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.INVALID_ARGUMENT, 'Relay transcript is invalid');
    }
    await this.getOrCreateIdentity(identityAlias);
    const keyPair: cryptoFramework.KeyPair | null = await this.loadIdentityKeyPair(identityAlias);
    if (keyPair === null) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.IDENTITY_CORRUPTED, 'Relay identity is unavailable');
    }
    try {
      const signer: cryptoFramework.Sign = cryptoFramework.createSign('ECC256|SHA256');
      await signer.init(keyPair.priKey);
      const signature: cryptoFramework.DataBlob = await signer.sign({
        data: RelayCryptoProtocol.encodeUtf8(transcript)
      });
      return RelayCryptoProtocol.encodeBase64Url(signature.data);
    } finally {
      keyPair.priKey.clearMem();
    }
  }

  async verifyIdentityTranscript(
    publicKeyBase64: string,
    transcript: string,
    signatureBase64Url: string
  ): Promise<boolean> {
    if (transcript.length === 0 || transcript.length > 32768) {
      return false;
    }
    try {
      RelayCryptoProtocol.requireSafeBase64(publicKeyBase64, 'publicKey');
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const publicBlob: cryptoFramework.DataBlob = { data: this.base64Helper.decodeSync(publicKeyBase64) };
      const pair: cryptoFramework.KeyPair = await generator.convertKey(publicBlob, null);
      const verifier: cryptoFramework.Verify = cryptoFramework.createVerify('ECC256|SHA256');
      await verifier.init(pair.pubKey);
      return await verifier.verify(
        { data: RelayCryptoProtocol.encodeUtf8(transcript) },
        { data: RelayCryptoProtocol.decodeBase64Url(signatureBase64Url) }
      );
    } catch (error) {
      return false;
    }
  }

  async createIdentityProof(
    identityAlias: string,
    offer: RelayHandshakeOffer,
    challengeBase64: string
  ): Promise<RelayIdentityProof> {
    await this.getOrCreateIdentity(identityAlias);
    const signingKeyPair: cryptoFramework.KeyPair | null = await this.loadIdentityKeyPair(identityAlias);
    if (signingKeyPair === null) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.IDENTITY_CORRUPTED,
        'Relay identity could not be loaded after creation');
    }
    try {
      const proofText: string = RelayCryptoProtocol.buildIdentityProofText(offer, challengeBase64);
      const signer: cryptoFramework.Sign = cryptoFramework.createSign('ECC256|SHA256');
      await signer.init(signingKeyPair.priKey);
      const material: cryptoFramework.DataBlob = { data: RelayCryptoProtocol.encodeUtf8(proofText) };
      const signature: cryptoFramework.DataBlob = await signer.sign(material);
      const identity: RelayIdentityInfo = await this.buildIdentityInfo(
        identityAlias,
        signingKeyPair.pubKey.getEncoded().data
      );
      return new RelayIdentityProof(
        identity.publicKeyBase64,
        identity.fingerprintSha256,
        this.base64Helper.encodeToStringSync(signature.data)
      );
    } finally {
      signingKeyPair.priKey.clearMem();
    }
  }

  async verifyIdentityProof(
    offer: RelayHandshakeOffer,
    challengeBase64: string,
    proof: RelayIdentityProof
  ): Promise<boolean> {
    try {
      RelayCryptoProtocol.requireSafeBase64(proof.identityPublicKeyBase64, 'identityPublicKey');
      RelayCryptoProtocol.requireSafeBase64(proof.signatureBase64, 'signature');
      const publicBytes: Uint8Array = this.base64Helper.decodeSync(proof.identityPublicKeyBase64);
      const expectedIdentity: RelayIdentityInfo = await this.buildIdentityInfo('', publicBytes);
      if (expectedIdentity.fingerprintSha256 !== proof.identityFingerprintSha256) {
        return false;
      }
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const publicBlob: cryptoFramework.DataBlob = { data: publicBytes };
      const pair: cryptoFramework.KeyPair = await generator.convertKey(publicBlob, null);
      const verifier: cryptoFramework.Verify = cryptoFramework.createVerify('ECC256|SHA256');
      await verifier.init(pair.pubKey);
      const proofText: string = RelayCryptoProtocol.buildIdentityProofText(offer, challengeBase64);
      const material: cryptoFramework.DataBlob = { data: RelayCryptoProtocol.encodeUtf8(proofText) };
      const signature: cryptoFramework.DataBlob = { data: this.base64Helper.decodeSync(proof.signatureBase64) };
      return await verifier.verify(material, signature);
    } catch (error) {
      logger.warn(TAG, 'Relay identity proof validation failed: ' + RelayCryptoProtocol.errorMessage(error));
      return false;
    }
  }

  async completeHandshake(
    handle: string,
    peerPublicKeyBase64: string,
    relayId: string,
    clientNonce: string,
    bridgeNonce: string,
    clientIdentityFingerprint: string,
    bridgeIdentityFingerprint: string,
    keyEpoch: number = 1
  ): Promise<RelayCryptoSession> {
    this.removeExpiredHandshakes();
    const pending: RelayPendingHandshake | undefined = this.pendingHandshakes.get(handle);
    if (pending === undefined) {
      throw new RelayCryptoError(RelayCryptoFailureCategory.HANDSHAKE_NOT_FOUND,
        'Relay handshake does not exist or has expired');
    }
    this.pendingHandshakes.delete(handle);
    if (pending.offer.expiresAt < Date.now()) {
      pending.keyPair.priKey.clearMem();
      throw new RelayCryptoError(RelayCryptoFailureCategory.HANDSHAKE_EXPIRED, 'Relay handshake has expired');
    }
    let sharedSecret: Uint8Array = new Uint8Array(0);
    let derived: Uint8Array = new Uint8Array(0);
    try {
      RelayCryptoProtocol.requireSafeBase64(peerPublicKeyBase64, 'peerPublicKey');
      RelayCryptoProtocol.requireSafeToken(relayId, 'relayId', 160);
      RelayCryptoProtocol.requireSafeToken(clientNonce, 'clientNonce', 256);
      RelayCryptoProtocol.requireSafeToken(bridgeNonce, 'bridgeNonce', 256);
      RelayCryptoProtocol.requireSafeToken(clientIdentityFingerprint, 'clientIdentityFingerprint', 256);
      RelayCryptoProtocol.requireSafeToken(bridgeIdentityFingerprint, 'bridgeIdentityFingerprint', 256);
      RelayCryptoProtocol.requirePositiveInteger(keyEpoch, 'keyEpoch');
      const peerBytes: Uint8Array = this.base64Helper.decodeSync(peerPublicKeyBase64);
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const peerBlob: cryptoFramework.DataBlob = { data: peerBytes };
      const peerPair: cryptoFramework.KeyPair = await generator.convertKey(peerBlob, null);
      const agreement: cryptoFramework.KeyAgreement = cryptoFramework.createKeyAgreement('ECC256');
      const secretBlob: cryptoFramework.DataBlob = await agreement.generateSecret(
        pending.keyPair.priKey,
        peerPair.pubKey
      );
      sharedSecret = new Uint8Array(secretBlob.data);
      secretBlob.data.fill(0);
      const saltText: string = RelayCryptoProtocol.buildKdfSaltText(relayId, clientNonce, bridgeNonce);
      const salt: Uint8Array = await this.sha256Bytes(RelayCryptoProtocol.encodeUtf8(saltText));
      const infoText: string = RelayCryptoProtocol.buildKdfInfoText(
        pending.offer.sessionId,
        clientIdentityFingerprint,
        bridgeIdentityFingerprint,
        keyEpoch
      );
      const spec: cryptoFramework.HKDFSpec = {
        algName: 'HKDF|SHA256',
        key: sharedSecret,
        salt: salt,
        info: RelayCryptoProtocol.encodeUtf8(infoText),
        keySize: 64
      };
      const derivedBlob: cryptoFramework.DataBlob = await cryptoFramework.createKdf('HKDF|SHA256')
        .generateSecret(spec);
      derived = new Uint8Array(derivedBlob.data);
      derivedBlob.data.fill(0);
      if (derived.length !== 64) {
        throw new RelayCryptoError(RelayCryptoFailureCategory.CRYPTO_OPERATION_FAILED,
          'Relay session key derivation returned an invalid length');
      }
      const appToBridgeKeyBytes: Uint8Array = derived.slice(0, 32);
      const bridgeToAppKeyBytes: Uint8Array = derived.slice(32, 64);
      const symmetricGenerator: cryptoFramework.SymKeyGenerator = cryptoFramework.createSymKeyGenerator('AES256');
      let appToBridgeKey: cryptoFramework.SymKey | null = null;
      let bridgeToAppKey: cryptoFramework.SymKey | null = null;
      try {
        appToBridgeKey = await symmetricGenerator.convertKey({ data: appToBridgeKeyBytes });
        bridgeToAppKey = await symmetricGenerator.convertKey({ data: bridgeToAppKeyBytes });
      } catch (error) {
        if (appToBridgeKey !== null) {
          appToBridgeKey.clearMem();
        }
        if (bridgeToAppKey !== null) {
          bridgeToAppKey.clearMem();
        }
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(RelayCryptoProtocol.errorMessage(error));
      } finally {
        appToBridgeKeyBytes.fill(0);
        bridgeToAppKeyBytes.fill(0);
      }
      if (appToBridgeKey === null || bridgeToAppKey === null) {
        throw new RelayCryptoError(RelayCryptoFailureCategory.CRYPTO_OPERATION_FAILED,
          'Relay symmetric key conversion failed');
      }
      if (pending.offer.role === RelayCryptoRole.INITIATOR) {
        return new RelayCryptoSession(
          pending.offer.sessionId,
          RelayCryptoDirection.APP_TO_BRIDGE,
          RelayCryptoDirection.BRIDGE_TO_APP,
          keyEpoch,
          appToBridgeKey,
          bridgeToAppKey
        );
      }
      return new RelayCryptoSession(
        pending.offer.sessionId,
        RelayCryptoDirection.BRIDGE_TO_APP,
        RelayCryptoDirection.APP_TO_BRIDGE,
        keyEpoch,
        bridgeToAppKey,
        appToBridgeKey
      );
    } catch (error) {
      if (error instanceof RelayCryptoError) {
        throw error;
      }
      throw new RelayCryptoError(RelayCryptoFailureCategory.CRYPTO_OPERATION_FAILED,
        'Relay handshake failed: ' + RelayCryptoProtocol.errorMessage(error));
    } finally {
      pending.keyPair.priKey.clearMem();
      sharedSecret.fill(0);
      derived.fill(0);
    }
  }

  cancelHandshake(handle: string): void {
    const pending: RelayPendingHandshake | undefined = this.pendingHandshakes.get(handle);
    if (pending !== undefined) {
      pending.keyPair.priKey.clearMem();
      this.pendingHandshakes.delete(handle);
    }
  }

  static constantTimeEquals(first: Uint8Array, second: Uint8Array): boolean {
    let difference: number = first.length ^ second.length;
    const length: number = first.length > second.length ? first.length : second.length;
    for (let index: number = 0; index < length; index++) {
      const left: number = index < first.length ? first[index] : 0;
      const right: number = index < second.length ? second[index] : 0;
      difference |= left ^ right;
    }
    return difference === 0;
  }

  private async loadIdentityKeyPair(alias: string): Promise<cryptoFramework.KeyPair | null> {
    const privateBytes: Uint8Array | null = await this.secretStore.loadSecret(
      alias + RelayCryptoFacade.PRIVATE_SUFFIX
    );
    const publicBytes: Uint8Array | null = await this.secretStore.loadSecret(
      alias + RelayCryptoFacade.PUBLIC_SUFFIX
    );
    if (privateBytes === null && publicBytes === null) {
      return null;
    }
    if (privateBytes === null || publicBytes === null) {
      await this.deleteIdentity(alias);
      return null;
    }
    try {
      const generator: cryptoFramework.AsyKeyGenerator = cryptoFramework.createAsyKeyGenerator('ECC256');
      const publicBlob: cryptoFramework.DataBlob = { data: publicBytes };
      const privateBlob: cryptoFramework.DataBlob = { data: privateBytes };
      return await generator.convertKey(publicBlob, privateBlob);
    } catch (error) {
      privateBytes.fill(0);
      await this.deleteIdentity(alias);
      logger.warn(TAG, 'Stored relay identity was invalid and has been removed');
      return null;
    } finally {
      privateBytes.fill(0);
    }
  }

  private async persistIdentityKeyPair(alias: string, keyPair: cryptoFramework.KeyPair): Promise<void> {
    const privateBlob: cryptoFramework.DataBlob = keyPair.priKey.getEncoded();
    const privateBytes: Uint8Array = new Uint8Array(privateBlob.data);
    privateBlob.data.fill(0);
    const publicBytes: Uint8Array = new Uint8Array(keyPair.pubKey.getEncoded().data);
    try {
      await this.secretStore.saveSecret(alias + RelayCryptoFacade.PRIVATE_SUFFIX, privateBytes);
      await this.secretStore.saveSecret(alias + RelayCryptoFacade.PUBLIC_SUFFIX, publicBytes);
    } catch (error) {
      await this.secretStore.removeSecret(alias + RelayCryptoFacade.PRIVATE_SUFFIX);
      await this.secretStore.removeSecret(alias + RelayCryptoFacade.PUBLIC_SUFFIX);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(RelayCryptoProtocol.errorMessage(error));
    } finally {
      privateBytes.fill(0);
    }
  }

  private async buildIdentityInfo(alias: string, publicKeyBytes: Uint8Array): Promise<RelayIdentityInfo> {
    const fingerprint: Uint8Array = await this.sha256Bytes(publicKeyBytes);
    return new RelayIdentityInfo(
      alias,
      this.base64Helper.encodeToStringSync(publicKeyBytes),
      RelayCryptoFacade.toHex(fingerprint),
      this.secretStore.getStorageKind()
    );
  }

  private async sha256Bytes(value: Uint8Array): Promise<Uint8Array> {
    const digest: cryptoFramework.Md = cryptoFramework.createMd('SHA256');
    await digest.update({ data: value });
    const result: cryptoFramework.DataBlob = await digest.digest();
    return new Uint8Array(result.data);
  }

  private removeExpiredHandshakes(): void {
    const now: number = Date.now();
    const expiredHandles: Array<string> = [];
    this.pendingHandshakes.forEach((pending: RelayPendingHandshake, handle: string) => {
      if (pending.offer.expiresAt < now) {
        expiredHandles.push(handle);
      }
    });
    for (let index: number = 0; index < expiredHandles.length; index++) {
      this.cancelHandshake(expiredHandles[index]);
    }
  }

  private static toHex(bytes: Uint8Array): string {
    let output: string = '';
    for (let index: number = 0; index < bytes.length; index++) {
      const value: string = bytes[index].toString(16);
      output += value.length === 1 ? '0' + value : value;
    }
    return output;
  }
}

export const ngfRelayCryptoFacade: RelayCryptoFacade = new RelayCryptoFacade();
