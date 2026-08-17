import {
  AgentBridgeRelayDirection,
  AgentBridgeRelayEncryptedEnvelope
} from './AgentBridgeModels';

export class AgentBridgeRelayPolicyFailureCategory {
  static readonly NONE: string = '';
  static readonly INVALID_ENVELOPE: string = 'invalid_envelope';
  static readonly INCOMPATIBLE_VERSION: string = 'incompatible_version';
  static readonly SESSION_MISMATCH: string = 'session_mismatch';
  static readonly DIRECTION_MISMATCH: string = 'direction_mismatch';
  static readonly KEY_EPOCH_MISMATCH: string = 'key_epoch_mismatch';
  static readonly REPLAY_DETECTED: string = 'replay_detected';
  static readonly SEQUENCE_GAP: string = 'sequence_gap';
}

export class AgentBridgeRelayRemediationAction {
  static readonly NONE: string = '';
  static readonly RECONNECT: string = 'relay_reconnect';
  static readonly REPAIR: string = 'relay_pair_again';
  static readonly REQUEST_RETRANSMIT: string = 'relay_request_retransmit';
  static readonly DISCARD_ENVELOPE: string = 'relay_discard_envelope';
}

export class AgentBridgeRelayPolicyDecision {
  readonly accepted: boolean;
  readonly failureCategory: string;
  readonly remediation: string;
  readonly expectedSeq: number;

  constructor(accepted: boolean, failureCategory: string, remediation: string, expectedSeq: number) {
    this.accepted = accepted;
    this.failureCategory = failureCategory;
    this.remediation = remediation;
    this.expectedSeq = expectedSeq;
  }
}

/** Invalidates every async continuation created by an older Relay transport attempt. */
export class AgentBridgeRelayAttemptGuard {
  private currentEpoch: number = 0;

  beginNextEpoch(): number {
    this.currentEpoch = this.currentEpoch >= 2147483647 ? 1 : this.currentEpoch + 1;
    return this.currentEpoch;
  }

  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  isCurrent(epoch: number): boolean {
    return Number.isInteger(epoch) && epoch === this.currentEpoch;
  }
}

export class AgentBridgeRelayEnvelopePolicy {
  static readonly VERSION: number = 1;
  static readonly FIRST_SEQUENCE: number = 1;
  static readonly MAX_SEQUENCE: number = 9007199254740991;

  static buildAadText(envelope: AgentBridgeRelayEncryptedEnvelope): string {
    if (!AgentBridgeRelayEnvelopePolicy.hasSafeToken(envelope.sessionId, 160) ||
      AgentBridgeRelayDirection.normalize(envelope.direction).length === 0 ||
      !AgentBridgeRelayEnvelopePolicy.isPositiveInteger(envelope.seq) ||
      !AgentBridgeRelayEnvelopePolicy.isPositiveInteger(envelope.keyEpoch) ||
      !AgentBridgeRelayEnvelopePolicy.hasSafeToken(envelope.contentType, 128)) {
      return '';
    }
    return 'ngf-relay-v1\n' +
      AgentBridgeRelayEnvelopePolicy.lengthPrefixed(envelope.sessionId) + '\n' +
      AgentBridgeRelayEnvelopePolicy.lengthPrefixed(envelope.direction) + '\n' +
      envelope.seq.toString() + '\n' + envelope.keyEpoch.toString() + '\n' +
      AgentBridgeRelayEnvelopePolicy.lengthPrefixed(envelope.contentType);
  }

  static validate(
    envelope: AgentBridgeRelayEncryptedEnvelope,
    expectedSessionId: string,
    expectedDirection: string,
    expectedSeq: number,
    expectedKeyEpoch: number
  ): AgentBridgeRelayPolicyDecision {
    if (envelope.version !== AgentBridgeRelayEnvelopePolicy.VERSION) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.INCOMPATIBLE_VERSION,
        AgentBridgeRelayRemediationAction.RECONNECT,
        expectedSeq
      );
    }
    if (!AgentBridgeRelayEnvelopePolicy.hasSafeToken(expectedSessionId, 160) ||
      envelope.sessionId !== expectedSessionId) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.SESSION_MISMATCH,
        AgentBridgeRelayRemediationAction.REPAIR,
        expectedSeq
      );
    }
    const normalizedDirection: string = AgentBridgeRelayDirection.normalize(envelope.direction);
    if (normalizedDirection.length === 0 || normalizedDirection !== expectedDirection) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.DIRECTION_MISMATCH,
        AgentBridgeRelayRemediationAction.DISCARD_ENVELOPE,
        expectedSeq
      );
    }
    if (!AgentBridgeRelayEnvelopePolicy.isPositiveInteger(envelope.keyEpoch) ||
      envelope.keyEpoch !== expectedKeyEpoch) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.KEY_EPOCH_MISMATCH,
        AgentBridgeRelayRemediationAction.RECONNECT,
        expectedSeq
      );
    }
    if (!AgentBridgeRelayEnvelopePolicy.isPositiveInteger(envelope.seq) ||
      !AgentBridgeRelayEnvelopePolicy.isPositiveInteger(expectedSeq)) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.INVALID_ENVELOPE,
        AgentBridgeRelayRemediationAction.DISCARD_ENVELOPE,
        expectedSeq
      );
    }
    if (envelope.seq < expectedSeq) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.REPLAY_DETECTED,
        AgentBridgeRelayRemediationAction.DISCARD_ENVELOPE,
        expectedSeq
      );
    }
    if (envelope.seq > expectedSeq) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.SEQUENCE_GAP,
        AgentBridgeRelayRemediationAction.RECONNECT,
        expectedSeq
      );
    }
    if (AgentBridgeRelayEnvelopePolicy.buildAadText(envelope).length === 0 ||
      !AgentBridgeRelayEnvelopePolicy.isBase64(envelope.nonceBase64, 128) ||
      !AgentBridgeRelayEnvelopePolicy.isBase64(envelope.authTagBase64, 128) ||
      (envelope.aadBase64.length > 0 && !AgentBridgeRelayEnvelopePolicy.isBase64(envelope.aadBase64, 4096)) ||
      !AgentBridgeRelayEnvelopePolicy.isBase64(envelope.cipherTextBase64, 1500000)) {
      return new AgentBridgeRelayPolicyDecision(
        false,
        AgentBridgeRelayPolicyFailureCategory.INVALID_ENVELOPE,
        AgentBridgeRelayRemediationAction.DISCARD_ENVELOPE,
        expectedSeq
      );
    }
    return new AgentBridgeRelayPolicyDecision(
      true,
      AgentBridgeRelayPolicyFailureCategory.NONE,
      AgentBridgeRelayRemediationAction.NONE,
      expectedSeq
    );
  }

  private static isPositiveInteger(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value) && value >= AgentBridgeRelayEnvelopePolicy.FIRST_SEQUENCE &&
      value <= AgentBridgeRelayEnvelopePolicy.MAX_SEQUENCE;
  }

  private static hasSafeToken(value: string, maxLength: number): boolean {
    if (value.length === 0 || value.length > maxLength) {
      return false;
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      const punctuation: boolean = code === 45 || code === 46 || code === 47 || code === 58 || code === 95 ||
        code === 43;
      if (!alphaNumeric && !punctuation) {
        return false;
      }
    }
    return true;
  }

  private static isBase64(value: string, maxLength: number): boolean {
    if (value.length === 0 || value.length > maxLength || value.length % 4 !== 0) {
      return false;
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!alphaNumeric && code !== 43 && code !== 47 && code !== 61) {
        return false;
      }
    }
    return true;
  }

  private static lengthPrefixed(value: string): string {
    return value.length.toString() + ':' + value;
  }
}

export class AgentBridgeRelayTranscriptPolicy {
  static readonly PROTOCOL_VERSION: string = 'ngf-agent-bridge.relay.v1';

  static buildPairingHello(
    relayId: string,
    offerId: string,
    deviceId: string,
    clientIdentityPublicKeyBase64: string,
    clientIdentityFingerprint: string,
    bridgeIdentityFingerprint: string,
    sessionId: string,
    clientEphemeralPublicKeyBase64: string,
    clientNonce: string,
    issuedAt: number
  ): string {
    if (!AgentBridgeRelayTranscriptPolicy.isFreshShape(issuedAt) || relayId.length === 0 || offerId.length === 0 ||
      deviceId.length === 0 || clientIdentityPublicKeyBase64.length === 0 ||
      clientIdentityFingerprint.length === 0 || bridgeIdentityFingerprint.length === 0 || sessionId.length === 0 ||
      clientEphemeralPublicKeyBase64.length === 0 || clientNonce.length === 0) {
      return '';
    }
    return AgentBridgeRelayTranscriptPolicy.jsonArrayPrefix('pairing.hello') +
      AgentBridgeRelayTranscriptPolicy.quote(relayId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(offerId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(deviceId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientIdentityPublicKeyBase64) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(bridgeIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(sessionId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientEphemeralPublicKeyBase64) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientNonce) + ',' + issuedAt.toString() + ']';
  }

  static buildSessionHello(
    relayId: string,
    deviceId: string,
    clientIdentityFingerprint: string,
    bridgeIdentityFingerprint: string,
    sessionId: string,
    clientEphemeralPublicKeyBase64: string,
    clientNonce: string,
    issuedAt: number
  ): string {
    if (!AgentBridgeRelayTranscriptPolicy.isFreshShape(issuedAt) || relayId.length === 0 || deviceId.length === 0 ||
      clientIdentityFingerprint.length === 0 || bridgeIdentityFingerprint.length === 0 || sessionId.length === 0 ||
      clientEphemeralPublicKeyBase64.length === 0 || clientNonce.length === 0) {
      return '';
    }
    return AgentBridgeRelayTranscriptPolicy.jsonArrayPrefix('session.hello') +
      AgentBridgeRelayTranscriptPolicy.quote(relayId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(deviceId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(bridgeIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(sessionId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientEphemeralPublicKeyBase64) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientNonce) + ',' + issuedAt.toString() + ']';
  }

  static buildSessionResponse(
    relayId: string,
    deviceId: string,
    clientIdentityFingerprint: string,
    bridgeIdentityFingerprint: string,
    sessionId: string,
    clientEphemeralPublicKeyBase64: string,
    bridgeEphemeralPublicKeyBase64: string,
    clientNonce: string,
    bridgeNonce: string,
    issuedAt: number
  ): string {
    if (!AgentBridgeRelayTranscriptPolicy.isFreshShape(issuedAt) || relayId.length === 0 || deviceId.length === 0 ||
      clientIdentityFingerprint.length === 0 || bridgeIdentityFingerprint.length === 0 || sessionId.length === 0 ||
      clientEphemeralPublicKeyBase64.length === 0 || bridgeEphemeralPublicKeyBase64.length === 0 ||
      clientNonce.length === 0 || bridgeNonce.length === 0) {
      return '';
    }
    return AgentBridgeRelayTranscriptPolicy.jsonArrayPrefix('session.response') +
      AgentBridgeRelayTranscriptPolicy.quote(relayId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(deviceId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(bridgeIdentityFingerprint) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(sessionId) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientEphemeralPublicKeyBase64) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(bridgeEphemeralPublicKeyBase64) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(clientNonce) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(bridgeNonce) + ',' + issuedAt.toString() + ']';
  }

  private static jsonArrayPrefix(kind: string): string {
    return '[' + AgentBridgeRelayTranscriptPolicy.quote(AgentBridgeRelayTranscriptPolicy.PROTOCOL_VERSION) + ',' +
      AgentBridgeRelayTranscriptPolicy.quote(kind) + ',';
  }

  private static quote(value: string): string {
    return JSON.stringify(value);
  }

  private static isFreshShape(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value) && value > 0 &&
      value <= AgentBridgeRelayEnvelopePolicy.MAX_SEQUENCE;
  }
}

/** Sequence state advances only after the caller confirms AES-GCM authentication succeeded. */
export class AgentBridgeRelayReceiveSequencer {
  private expectedSeq: number;

  constructor(initialExpectedSeq: number = AgentBridgeRelayEnvelopePolicy.FIRST_SEQUENCE) {
    this.expectedSeq = Number.isInteger(initialExpectedSeq) && initialExpectedSeq > 0 ?
      initialExpectedSeq : AgentBridgeRelayEnvelopePolicy.FIRST_SEQUENCE;
  }

  getExpectedSequence(): number {
    return this.expectedSeq;
  }

  validate(
    envelope: AgentBridgeRelayEncryptedEnvelope,
    expectedSessionId: string,
    expectedDirection: string,
    expectedKeyEpoch: number
  ): AgentBridgeRelayPolicyDecision {
    return AgentBridgeRelayEnvelopePolicy.validate(
      envelope,
      expectedSessionId,
      expectedDirection,
      this.expectedSeq,
      expectedKeyEpoch
    );
  }

  commitAuthenticated(envelope: AgentBridgeRelayEncryptedEnvelope): boolean {
    if (envelope.seq !== this.expectedSeq || this.expectedSeq >= AgentBridgeRelayEnvelopePolicy.MAX_SEQUENCE) {
      return false;
    }
    this.expectedSeq += 1;
    return true;
  }

  resetAfterKeyRotation(nextExpectedSeq: number = AgentBridgeRelayEnvelopePolicy.FIRST_SEQUENCE): void {
    this.expectedSeq = Number.isInteger(nextExpectedSeq) && nextExpectedSeq > 0 ?
      nextExpectedSeq : AgentBridgeRelayEnvelopePolicy.FIRST_SEQUENCE;
  }
}
