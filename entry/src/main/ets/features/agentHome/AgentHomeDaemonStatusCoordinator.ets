import {
  AgentBridgeDaemonStatus
} from '../agentBridge/AgentBridgeModels';

export class AgentHomeDaemonStatusUpdate {
  hostProfileId: string;
  hostEpoch: number;
  requestId: string;
  isResponse: boolean;
  status: AgentBridgeDaemonStatus;

  constructor(
    hostProfileId: string,
    hostEpoch: number,
    requestId: string,
    status: AgentBridgeDaemonStatus,
    isResponse: boolean = false
  ) {
    this.hostProfileId = hostProfileId;
    this.hostEpoch = hostEpoch;
    this.requestId = requestId;
    this.status = status;
    this.isResponse = isResponse;
  }
}

/**
 * Keeps daemon snapshots monotonic inside one host connection epoch. The Bridge
 * protocol remains optional-field compatible, so legacy snapshots without an
 * instance or generation are accepted until a newer identity is established.
 */
export class AgentHomeDaemonStatusCoordinator {
  private activeHostProfileId: string = '';
  private activeHostEpoch: number = 0;
  private activeInstanceId: string = '';
  private activeGeneration: number = 0;
  private hasSnapshot: boolean = false;
  private pendingRequestId: string = '';

  reset(hostProfileId: string, hostEpoch: number): void {
    this.activeHostProfileId = hostProfileId;
    this.activeHostEpoch = hostEpoch;
    this.activeInstanceId = '';
    this.activeGeneration = 0;
    this.hasSnapshot = false;
    this.pendingRequestId = '';
  }

  beginRequest(requestId: string, hostProfileId: string, hostEpoch: number): void {
    if (hostProfileId !== this.activeHostProfileId || hostEpoch !== this.activeHostEpoch) {
      this.reset(hostProfileId, hostEpoch);
    }
    this.pendingRequestId = requestId;
  }

  clearRequest(requestId: string): void {
    if (requestId.length > 0 && requestId === this.pendingRequestId) {
      this.pendingRequestId = '';
    }
  }

  accept(update: AgentHomeDaemonStatusUpdate): boolean {
    if (update.hostProfileId.length === 0 || update.hostProfileId !== this.activeHostProfileId ||
      update.hostEpoch !== this.activeHostEpoch) {
      return false;
    }
    const status = update.status;
    if (status.hostProfileId.length > 0 && status.hostProfileId !== this.activeHostProfileId) {
      return false;
    }
    if (update.requestId.length > 0) {
      if (this.pendingRequestId.length === 0 || update.requestId !== this.pendingRequestId) {
        return false;
      }
      this.pendingRequestId = '';
    }
    const incomingInstanceId = status.instanceId;
    if (this.hasSnapshot && this.activeInstanceId.length > 0 && incomingInstanceId.length === 0) {
      return false;
    }
    if (this.hasSnapshot && this.activeInstanceId.length > 0 && incomingInstanceId.length > 0 &&
      incomingInstanceId !== this.activeInstanceId) {
      return false;
    }
    const incomingGeneration = this.generationOf(status);
    if (this.hasSnapshot && incomingGeneration > 0 && this.activeGeneration > 0 &&
      incomingGeneration < this.activeGeneration) {
      return false;
    }
    if (incomingInstanceId.length > 0) {
      this.activeInstanceId = incomingInstanceId;
    }
    if (incomingGeneration > 0) {
      this.activeGeneration = incomingGeneration;
    }
    this.hasSnapshot = true;
    return true;
  }

  currentInstanceId(): string {
    return this.activeInstanceId;
  }

  currentGeneration(): number {
    return this.activeGeneration;
  }

  hasActiveSnapshot(): boolean {
    return this.hasSnapshot;
  }

  private generationOf(status: AgentBridgeDaemonStatus): number {
    if (status.generation > 0) {
      return status.generation;
    }
    if (status.workerGeneration > 0) {
      return status.workerGeneration;
    }
    return 0;
  }
}
