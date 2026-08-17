import { AgentHomeHostSwitchStatus } from './AgentHomeModels';

export class AgentHomeHostSwitchPlan {
  targetHostProfileId: string;
  requiresConfirmation: boolean;
  noOp: boolean;

  constructor(targetHostProfileId: string, requiresConfirmation: boolean, noOp: boolean) {
    this.targetHostProfileId = targetHostProfileId;
    this.requiresConfirmation = requiresConfirmation;
    this.noOp = noOp;
  }
}

export class AgentHomeHostSwitchCoordinator {
  private activeHostProfileId: string = '';
  private targetHostProfileId: string = '';
  private epoch: number = 0;
  private state: string = AgentHomeHostSwitchStatus.IDLE;
  private mutationBlocked: boolean = false;

  plan(targetHostProfileId: string, connectionStatus: string): AgentHomeHostSwitchPlan {
    const noOp = targetHostProfileId.length === 0 || targetHostProfileId === this.activeHostProfileId;
    const requiresConfirmation = !noOp && connectionStatus === 'connected';
    this.targetHostProfileId = noOp ? '' : targetHostProfileId;
    this.state = requiresConfirmation ? AgentHomeHostSwitchStatus.AWAITING_CONFIRMATION : AgentHomeHostSwitchStatus.IDLE;
    return new AgentHomeHostSwitchPlan(targetHostProfileId, requiresConfirmation, noOp);
  }

  begin(targetHostProfileId: string): number {
    this.targetHostProfileId = targetHostProfileId;
    this.epoch = this.epoch + 1;
    this.mutationBlocked = true;
    this.state = AgentHomeHostSwitchStatus.QUIESCING;
    return this.epoch;
  }

  markLoading(): void {
    this.state = AgentHomeHostSwitchStatus.LOADING;
  }

  markConnecting(): void {
    this.state = AgentHomeHostSwitchStatus.CONNECTING;
  }

  markReady(hostProfileId: string): void {
    this.activeHostProfileId = hostProfileId;
    this.targetHostProfileId = '';
    this.mutationBlocked = false;
    this.state = AgentHomeHostSwitchStatus.READY;
  }

  markFailed(): void {
    this.mutationBlocked = false;
    this.state = AgentHomeHostSwitchStatus.FAILED;
  }

  cancel(): void {
    this.targetHostProfileId = '';
    this.mutationBlocked = false;
    this.state = AgentHomeHostSwitchStatus.IDLE;
  }

  setInitialHost(hostProfileId: string): void {
    this.activeHostProfileId = hostProfileId;
  }

  accepts(hostProfileId: string, epoch: number): boolean {
    return hostProfileId.length > 0 && hostProfileId === this.activeHostProfileId && epoch === this.epoch;
  }

  currentEpoch(): number {
    return this.epoch;
  }

  currentState(): string {
    return this.state;
  }

  isMutationBlocked(): boolean {
    return this.mutationBlocked;
  }
}
