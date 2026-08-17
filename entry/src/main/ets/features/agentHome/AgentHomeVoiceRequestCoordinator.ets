import {
  AgentBridgeEventType,
  AgentBridgeRequestType,
  AgentBridgeVoiceResult
} from '../agentBridge/AgentBridgeModels';

/**
 * Keeps remote STT responses attached to the request/session that created them.
 * TTS has its own client-request correlation in the page and is deliberately
 * left outside this coordinator.
 */
export class AgentHomeVoiceRequestMatch {
  accepted: boolean;
  stale: boolean;
  action: string;
  sessionId: string;

  constructor(accepted: boolean, stale: boolean, action: string, sessionId: string) {
    this.accepted = accepted;
    this.stale = stale;
    this.action = action;
    this.sessionId = sessionId;
  }
}

export class AgentHomeVoiceRequestCoordinator {
  private hostProfileId: string = '';
  private connectionEpoch: number = 0;
  private generation: number = 0;
  private pendingStartRequestId: string = '';
  private pendingFinishRequestId: string = '';
  private pendingCancelRequestId: string = '';
  private remoteSessionId: string = '';
  private cancelRequested: boolean = false;

  reset(hostProfileId: string, connectionEpoch: number): void {
    this.hostProfileId = hostProfileId;
    this.connectionEpoch = connectionEpoch;
    this.generation = this.generation + 1;
    this.pendingStartRequestId = '';
    this.pendingFinishRequestId = '';
    this.pendingCancelRequestId = '';
    this.remoteSessionId = '';
    this.cancelRequested = false;
  }

  beginRemoteStart(requestId: string, hostProfileId: string, connectionEpoch: number): number {
    this.hostProfileId = hostProfileId;
    this.connectionEpoch = connectionEpoch;
    this.generation = this.generation + 1;
    this.pendingStartRequestId = requestId;
    this.pendingFinishRequestId = '';
    this.pendingCancelRequestId = '';
    this.remoteSessionId = '';
    this.cancelRequested = false;
    return this.generation;
  }

  beginRemoteFinish(requestId: string, sessionId: string): void {
    if (sessionId.length === 0 || sessionId !== this.remoteSessionId || this.cancelRequested) {
      return;
    }
    this.pendingFinishRequestId = requestId;
  }

  beginRemoteCancel(requestId: string, sessionId: string): void {
    if (sessionId.length === 0 || sessionId !== this.remoteSessionId) {
      this.pendingStartRequestId = '';
      this.pendingFinishRequestId = '';
      this.pendingCancelRequestId = requestId;
      this.cancelRequested = true;
      return;
    }
    this.pendingStartRequestId = '';
    this.pendingFinishRequestId = '';
    this.pendingCancelRequestId = requestId;
    this.cancelRequested = true;
  }

  accept(
    result: AgentBridgeVoiceResult,
    envelopeRequestId: string,
    isResponse: boolean,
    hostProfileId: string,
    connectionEpoch: number
  ): AgentHomeVoiceRequestMatch {
    if (hostProfileId !== this.hostProfileId || connectionEpoch !== this.connectionEpoch) {
      return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
    }
    if (!this.isRemoteSessionAction(result.action)) {
      return new AgentHomeVoiceRequestMatch(true, false, result.action, result.sessionId);
    }
    if (result.action === AgentBridgeRequestType.VOICE_SESSION_START) {
      return this.acceptStart(result, envelopeRequestId, isResponse);
    }
    if (this.remoteSessionId.length === 0) {
      return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
    }
    if (result.sessionId.length > 0 && result.sessionId !== this.remoteSessionId) {
      return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
    }
    if (this.cancelRequested && result.action !== AgentBridgeRequestType.VOICE_SESSION_CANCEL) {
      return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
    }
    if (result.action === AgentBridgeRequestType.VOICE_SESSION_FINISH) {
      if (!this.matchesPendingRequest(this.pendingFinishRequestId, envelopeRequestId, isResponse)) {
        return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
      }
      return new AgentHomeVoiceRequestMatch(true, false, result.action, this.remoteSessionId);
    }
    if (result.action === AgentBridgeRequestType.VOICE_SESSION_CANCEL) {
      if (!this.matchesPendingRequest(this.pendingCancelRequestId, envelopeRequestId, isResponse)) {
        return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
      }
      return new AgentHomeVoiceRequestMatch(true, false, result.action, this.remoteSessionId);
    }
    return new AgentHomeVoiceRequestMatch(true, false, result.action, this.remoteSessionId);
  }

  completeRemoteSession(): void {
    this.pendingStartRequestId = '';
    this.pendingFinishRequestId = '';
    this.pendingCancelRequestId = '';
    this.remoteSessionId = '';
    this.cancelRequested = false;
    this.generation = this.generation + 1;
  }

  currentSessionId(): string {
    return this.remoteSessionId;
  }

  currentGeneration(): number {
    return this.generation;
  }

  private acceptStart(
    result: AgentBridgeVoiceResult,
    envelopeRequestId: string,
    isResponse: boolean
  ): AgentHomeVoiceRequestMatch {
    if (this.pendingStartRequestId.length === 0 ||
      !this.matchesPendingRequest(this.pendingStartRequestId, envelopeRequestId, isResponse)) {
      return new AgentHomeVoiceRequestMatch(false, true, result.action, result.sessionId);
    }
    if (!result.ok || result.sessionId.length === 0) {
      return new AgentHomeVoiceRequestMatch(true, false, result.action, result.sessionId);
    }
    this.remoteSessionId = result.sessionId;
    this.pendingStartRequestId = '';
    this.cancelRequested = false;
    return new AgentHomeVoiceRequestMatch(true, false, result.action, this.remoteSessionId);
  }

  private matchesPendingRequest(expectedRequestId: string, actualRequestId: string, isResponse: boolean): boolean {
    if (!isResponse) {
      return true;
    }
    if (expectedRequestId.length === 0) {
      return false;
    }
    return actualRequestId.length === 0 || actualRequestId === expectedRequestId;
  }

  private isRemoteSessionAction(action: string): boolean {
    return action === AgentBridgeRequestType.VOICE_SESSION_START ||
      action === AgentBridgeRequestType.VOICE_SESSION_CHUNK ||
      action === AgentBridgeRequestType.VOICE_SESSION_FINISH ||
      action === AgentBridgeRequestType.VOICE_SESSION_CANCEL ||
      action === AgentBridgeEventType.VOICE_TRANSCRIPT_PARTIAL ||
      action === AgentBridgeEventType.VOICE_TRANSCRIPT_FINAL ||
      action === AgentBridgeEventType.VOICE_VAD_CHANGED ||
      action === AgentBridgeEventType.VOICE_SESSION_UPDATED;
  }
}
