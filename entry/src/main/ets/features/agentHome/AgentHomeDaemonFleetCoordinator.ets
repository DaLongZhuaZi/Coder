export class AgentHomeDaemonInstanceSnapshot {
  hostProfileId: string;
  instanceId: string;
  generation: number;
  health: string;
  bridgeVersion: string;
  configVersion: string;
  isolated: boolean;
  lastHeartbeatAt: string;
  rollingEligible: boolean;
  fleetTargetSupported: boolean;
  warningCount: number;

  constructor(hostProfileId: string, instanceId: string, generation: number, health: string,
    bridgeVersion: string, configVersion: string, isolated: boolean = false, lastHeartbeatAt: string = '',
    rollingEligible: boolean = true, fleetTargetSupported: boolean = true, warningCount: number = 0) {
    this.hostProfileId = hostProfileId;
    this.instanceId = instanceId;
    this.generation = generation;
    this.health = health;
    this.bridgeVersion = bridgeVersion;
    this.configVersion = configVersion;
    this.isolated = isolated;
    this.lastHeartbeatAt = lastHeartbeatAt;
    this.rollingEligible = rollingEligible;
    this.fleetTargetSupported = fleetTargetSupported;
    this.warningCount = warningCount;
  }
}

export function cloneDaemonFleetSnapshot(source: AgentHomeDaemonInstanceSnapshot,
  isolated: boolean): AgentHomeDaemonInstanceSnapshot {
  return new AgentHomeDaemonInstanceSnapshot(
    source.hostProfileId,
    source.instanceId,
    source.generation,
    source.health,
    source.bridgeVersion,
    source.configVersion,
    isolated,
    source.lastHeartbeatAt,
    source.rollingEligible,
    source.fleetTargetSupported,
    source.warningCount
  );
}

export class AgentHomeDaemonRollingStep {
  hostProfileId: string;
  instanceId: string;
  expectedGeneration: number;
  operation: string;
  expectedBridgeVersion: string;
  expectedConfigVersion: string;
  targetBridgeVersion: string;
  targetConfigVersion: string;
  status: string;
  failureCategory: string;
  message: string;

  constructor(snapshot: AgentHomeDaemonInstanceSnapshot, operation: string = 'restart',
    targetBridgeVersion: string = '', targetConfigVersion: string = '') {
    this.hostProfileId = snapshot.hostProfileId;
    this.instanceId = snapshot.instanceId;
    this.expectedGeneration = snapshot.generation;
    this.operation = operation;
    this.expectedBridgeVersion = snapshot.bridgeVersion;
    this.expectedConfigVersion = snapshot.configVersion;
    this.targetBridgeVersion = targetBridgeVersion;
    this.targetConfigVersion = targetConfigVersion;
    this.status = snapshot.isolated ? 'isolated' : 'pending';
    this.failureCategory = '';
    if (!snapshot.rollingEligible && !snapshot.isolated) {
      this.status = 'incompatible';
    }
    this.message = '';
  }
}

export class AgentHomeDaemonRollingResult {
  status: string;
  operation: string;
  targetBridgeVersion: string;
  targetConfigVersion: string;
  interruptionReason: string;
  completed: Array<AgentHomeDaemonRollingStep>;
  failed: Array<AgentHomeDaemonRollingStep>;
  pending: Array<AgentHomeDaemonRollingStep>;
  excluded: Array<AgentHomeDaemonRollingStep>;

  constructor() {
    this.status = 'preview';
    this.operation = 'restart';
    this.targetBridgeVersion = '';
    this.targetConfigVersion = '';
    this.interruptionReason = '';
    this.completed = [];
    this.failed = [];
    this.pending = [];
    this.excluded = [];
  }
}

export class AgentHomeDaemonFleetRunControl {
  private cancelled: boolean = false;
  private cancelReason: string = '';

  cancel(reason: string = 'host_lifecycle'): void {
    this.cancelled = true;
    this.cancelReason = reason;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  reason(): string {
    return this.cancelReason.length > 0 ? this.cancelReason : 'host_lifecycle';
  }
}

export class AgentHomeDaemonStepExecutionResult {
  ok: boolean;
  generation: number;
  health: string;
  message: string;
  failureCategory: string;
  hostProfileId: string;
  instanceId: string;
  bridgeVersion: string;
  configVersion: string;

  constructor(ok: boolean, generation: number, health: string, message: string = '',
    hostProfileId: string = '', instanceId: string = '', bridgeVersion: string = '', configVersion: string = '',
    failureCategory: string = '') {
    this.ok = ok;
    this.generation = generation;
    this.health = health;
    this.message = message;
    this.failureCategory = failureCategory;
    this.hostProfileId = hostProfileId;
    this.instanceId = instanceId;
    this.bridgeVersion = bridgeVersion;
    this.configVersion = configVersion;
  }
}

export type AgentHomeDaemonStepExecutor = (step: AgentHomeDaemonRollingStep) => Promise<AgentHomeDaemonStepExecutionResult>;

export class AgentHomeDaemonFleetCoordinator {
  buildPreview(snapshots: Array<AgentHomeDaemonInstanceSnapshot>, operation: string = 'restart',
    targetBridgeVersion: string = '', targetConfigVersion: string = ''): AgentHomeDaemonRollingResult {
    const result = new AgentHomeDaemonRollingResult();
    result.operation = operation;
    result.targetBridgeVersion = targetBridgeVersion;
    result.targetConfigVersion = targetConfigVersion;
    for (let index = 0; index < snapshots.length; index++) {
      const step = new AgentHomeDaemonRollingStep(snapshots[index], operation, targetBridgeVersion, targetConfigVersion);
      if (snapshots[index].isolated || !snapshots[index].rollingEligible) {
        result.excluded.push(step);
      } else {
        result.pending.push(step);
      }
    }
    return result;
  }

  async run(preview: AgentHomeDaemonRollingResult, executor: AgentHomeDaemonStepExecutor,
    control: AgentHomeDaemonFleetRunControl | null = null): Promise<AgentHomeDaemonRollingResult> {
    const result = new AgentHomeDaemonRollingResult();
    result.status = 'running';
    result.operation = preview.operation;
    result.targetBridgeVersion = preview.targetBridgeVersion;
    result.targetConfigVersion = preview.targetConfigVersion;
    for (let excludedIndex = 0; excludedIndex < preview.excluded.length; excludedIndex++) {
      result.excluded.push(preview.excluded[excludedIndex]);
    }
    for (let index = 0; index < preview.pending.length; index++) {
      if (control !== null && control.isCancelled()) {
        this.appendPendingSteps(result, preview.pending, index);
        result.status = 'interrupted';
        result.interruptionReason = control.reason();
        return result;
      }
      const step = preview.pending[index];
      let execution: AgentHomeDaemonStepExecutionResult;
      try {
        execution = await executor(step);
      } catch (_error) {
        step.status = 'failed';
        step.failureCategory = 'executor_error';
        step.message = 'Daemon rolling operation failed before completion.';
        result.failed.push(step);
        this.appendPendingSteps(result, preview.pending, index + 1);
        result.status = control !== null && control.isCancelled() ? 'interrupted' : 'failed';
        result.interruptionReason = control !== null && control.isCancelled() ? control.reason() : '';
        return result;
      }
      const hostMatches = execution.hostProfileId.length === 0 || execution.hostProfileId === step.hostProfileId;
      const instanceMatches = execution.instanceId.length === 0 || execution.instanceId === step.instanceId;
      const versionValidation = this.validateVersions(step, execution);
      if (execution.ok && hostMatches && instanceMatches && execution.health === 'healthy' &&
        execution.generation > step.expectedGeneration && versionValidation.ok) {
        step.status = 'completed';
        result.completed.push(step);
        continue;
      }
      step.status = 'failed';
      if (!hostMatches || !instanceMatches) {
        step.failureCategory = 'daemon_target_changed';
        step.message = 'Daemon target identity changed during the rolling operation.';
      } else if (!versionValidation.ok) {
        step.failureCategory = versionValidation.failureCategory;
        step.message = versionValidation.message;
      } else {
        step.failureCategory = execution.failureCategory.length > 0 ? execution.failureCategory : 'daemon_operation_failed';
        step.message = execution.message;
      }
      result.failed.push(step);
      this.appendPendingSteps(result, preview.pending, index + 1);
      if (step.failureCategory === 'cancelled') {
        result.status = control !== null && control.isCancelled() ? 'interrupted' : 'cancelled';
        result.interruptionReason = control !== null && control.isCancelled() ? control.reason() : '';
      } else {
        result.status = 'failed';
      }
      return result;
    }
    if (control !== null && control.isCancelled()) {
      result.status = 'interrupted';
      result.interruptionReason = control.reason();
    } else {
      result.status = 'completed';
    }
    return result;
  }

  private appendPendingSteps(result: AgentHomeDaemonRollingResult,
    steps: Array<AgentHomeDaemonRollingStep>, startIndex: number): void {
    for (let index = startIndex; index < steps.length; index++) {
      result.pending.push(steps[index]);
    }
  }

  private validateVersions(step: AgentHomeDaemonRollingStep, execution: AgentHomeDaemonStepExecutionResult): AgentHomeDaemonVersionValidation {
    const expectedBridgeVersion = step.targetBridgeVersion.length > 0 ? step.targetBridgeVersion :
      (step.operation === 'restart' ? step.expectedBridgeVersion : '');
    const expectedConfigVersion = step.targetConfigVersion.length > 0 ? step.targetConfigVersion : step.expectedConfigVersion;
    if (expectedBridgeVersion.length > 0 && execution.bridgeVersion.length > 0 &&
      execution.bridgeVersion !== expectedBridgeVersion) {
      return new AgentHomeDaemonVersionValidation(false, 'daemon_version_mismatch',
        'Daemon Bridge version did not match the rolling plan.');
    }
    if (expectedConfigVersion.length > 0 && execution.configVersion.length > 0 &&
      execution.configVersion !== expectedConfigVersion) {
      return new AgentHomeDaemonVersionValidation(false, 'daemon_config_version_mismatch',
        'Daemon config version did not match the rolling plan.');
    }
    return new AgentHomeDaemonVersionValidation(true, '', '');
  }
}

class AgentHomeDaemonVersionValidation {
  ok: boolean;
  failureCategory: string;
  message: string;

  constructor(ok: boolean, failureCategory: string, message: string) {
    this.ok = ok;
    this.failureCategory = failureCategory;
    this.message = message;
  }
}
