import { ngfSettingsStoreFacade } from 'ngf_framework';
import { AgentBridgeIncomingParser } from '../agentBridge/AgentBridgeModels';
import {
  AgentHomeDaemonInstanceSnapshot,
  AgentHomeDaemonRollingResult,
  AgentHomeDaemonRollingStep
} from './AgentHomeDaemonFleetCoordinator';

const STORE_KEY: string = 'agent_home_daemon_fleet_run_v1';
const STORE_SCHEMA_VERSION: number = 1;
const MAX_STATE_LENGTH: number = 160000;
const APP_RESTARTED_REASON: string = 'app_restarted';

export class AgentHomeDaemonFleetRestoredState {
  runId: string;
  status: string;
  interruptionReason: string;
  updatedAt: number;
  result: AgentHomeDaemonRollingResult;

  constructor(result: AgentHomeDaemonRollingResult) {
    this.runId = '';
    this.status = 'interrupted';
    this.interruptionReason = APP_RESTARTED_REASON;
    this.updatedAt = 0;
    this.result = result;
  }
}

export class AgentHomeDaemonFleetRunRecord {
  schemaVersion: number;
  runId: string;
  status: string;
  interruptionReason: string;
  resultJson: string;
  updatedAt: number;

  constructor() {
    this.schemaVersion = STORE_SCHEMA_VERSION;
    this.runId = '';
    this.status = 'running';
    this.interruptionReason = '';
    this.resultJson = '';
    this.updatedAt = 0;
  }
}

export class AgentHomeDaemonFleetRunCodec {
  static encode(record: AgentHomeDaemonFleetRunRecord): string {
    return JSON.stringify(record);
  }

  static decode(source: string): AgentHomeDaemonFleetRestoredState | null {
    if (source.trim().length === 0 || source.length > MAX_STATE_LENGTH) {
      return null;
    }
    const schemaVersion = AgentBridgeIncomingParser.extractNumberProperty(source, 'schemaVersion', 0);
    if (schemaVersion !== STORE_SCHEMA_VERSION) {
      return null;
    }
    const resultJson = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'resultJson')
    );
    const result = AgentHomeDaemonFleetRunCodec.decodeResult(resultJson);
    if (result === null) {
      return null;
    }
    const restored = new AgentHomeDaemonFleetRestoredState(result);
    restored.runId = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'runId')
    );
    restored.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    restored.interruptionReason = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'interruptionReason')
    );
    restored.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', 0);
    if (restored.status === 'running') {
      restored.status = 'interrupted';
      restored.interruptionReason = APP_RESTARTED_REASON;
    }
    if (restored.status !== 'interrupted') {
      return null;
    }
    if (restored.interruptionReason.length === 0) {
      restored.interruptionReason = APP_RESTARTED_REASON;
    }
    restored.result.status = 'interrupted';
    restored.result.interruptionReason = restored.interruptionReason;
    return restored;
  }

  private static decodeResult(source: string): AgentHomeDaemonRollingResult | null {
    if (source.trim().length === 0 || source.length > MAX_STATE_LENGTH) {
      return null;
    }
    const result = new AgentHomeDaemonRollingResult();
    result.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    result.operation = AgentBridgeIncomingParser.extractStringProperty(source, 'operation');
    result.targetBridgeVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'targetBridgeVersion');
    result.targetConfigVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'targetConfigVersion');
    result.interruptionReason = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'interruptionReason')
    );
    if (result.operation.length === 0) {
      result.operation = 'restart';
    }
    if (!AgentHomeDaemonFleetRunCodec.isKnownResultStatus(result.status)) {
      return null;
    }
    const completedSources = AgentBridgeIncomingParser.extractObjectArray(source, 'completed');
    const failedSources = AgentBridgeIncomingParser.extractObjectArray(source, 'failed');
    const pendingSources = AgentBridgeIncomingParser.extractObjectArray(source, 'pending');
    const excludedSources = AgentBridgeIncomingParser.extractObjectArray(source, 'excluded');
    if (!AgentHomeDaemonFleetRunCodec.appendSteps(result.completed, completedSources) ||
      !AgentHomeDaemonFleetRunCodec.appendSteps(result.failed, failedSources) ||
      !AgentHomeDaemonFleetRunCodec.appendSteps(result.pending, pendingSources) ||
      !AgentHomeDaemonFleetRunCodec.appendSteps(result.excluded, excludedSources)) {
      return null;
    }
    return result;
  }

  private static isKnownResultStatus(value: string): boolean {
    return value === 'preview' || value === 'running' || value === 'interrupted' ||
      value === 'completed' || value === 'failed' || value === 'cancelled';
  }

  private static appendSteps(target: Array<AgentHomeDaemonRollingStep>, sources: Array<string>): boolean {
    let parsedCount = 0;
    for (let index = 0; index < sources.length; index++) {
      const step = AgentHomeDaemonFleetRunCodec.decodeStep(sources[index]);
      if (step !== null) {
        target.push(step);
        parsedCount = parsedCount + 1;
      }
    }
    return parsedCount === sources.length;
  }

  private static decodeStep(source: string): AgentHomeDaemonRollingStep | null {
    const hostProfileId = AgentHomeDaemonFleetRunCodec.clean(source, 'hostProfileId');
    const instanceId = AgentHomeDaemonFleetRunCodec.clean(source, 'instanceId');
    if (hostProfileId.length === 0 || instanceId.length === 0) {
      return null;
    }
    const status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    const operationValue = AgentHomeDaemonFleetRunCodec.clean(source, 'operation');
    const snapshot = new AgentHomeDaemonInstanceSnapshot(
      hostProfileId,
      instanceId,
      AgentBridgeIncomingParser.extractNumberProperty(source, 'expectedGeneration', 0),
      status === 'isolated' ? 'isolated' : 'healthy',
      AgentHomeDaemonFleetRunCodec.clean(source, 'expectedBridgeVersion'),
      AgentHomeDaemonFleetRunCodec.clean(source, 'expectedConfigVersion'),
      status === 'isolated',
      '',
      status !== 'incompatible'
    );
    const step = new AgentHomeDaemonRollingStep(
      snapshot,
      operationValue.length > 0 ? operationValue : 'restart',
      AgentHomeDaemonFleetRunCodec.clean(source, 'targetBridgeVersion'),
      AgentHomeDaemonFleetRunCodec.clean(source, 'targetConfigVersion')
    );
    step.expectedGeneration = AgentBridgeIncomingParser.extractNumberProperty(source, 'expectedGeneration', 0);
    step.status = status.length > 0 ? status : 'pending';
    step.failureCategory = AgentHomeDaemonFleetRunCodec.clean(source, 'failureCategory');
    step.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'message')
    );
    return step;
  }

  private static clean(source: string, key: string): string {
    return AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, key)
    );
  }
}

export class AgentHomeDaemonFleetRunStore {
  private activeRunId: string = '';

  begin(result: AgentHomeDaemonRollingResult): void {
    this.activeRunId = 'fleet-' + String(Date.now());
    this.write(this.activeRunId, 'running', '', result);
  }

  markInterrupted(result: AgentHomeDaemonRollingResult, reason: string): void {
    if (this.activeRunId.length === 0) {
      this.activeRunId = 'fleet-' + String(Date.now());
    }
    const normalizedReason = reason.length > 0 ? reason : 'host_lifecycle';
    this.write(this.activeRunId, 'interrupted', normalizedReason, result);
  }

  finish(result: AgentHomeDaemonRollingResult): void {
    if (result.status === 'interrupted') {
      this.markInterrupted(result, result.interruptionReason);
      return;
    }
    this.clear();
  }

  restore(): AgentHomeDaemonRollingResult | null {
    const source = ngfSettingsStoreFacade.getString(STORE_KEY, '');
    const restored = AgentHomeDaemonFleetRunCodec.decode(source);
    if (restored === null) {
      return null;
    }
    this.activeRunId = restored.runId;
    if (restored.status === 'interrupted') {
      return restored.result;
    }
    return null;
  }

  clear(): void {
    this.activeRunId = '';
    ngfSettingsStoreFacade.setString(STORE_KEY, '');
  }

  private write(runId: string, status: string, interruptionReason: string,
    result: AgentHomeDaemonRollingResult): void {
    const record = new AgentHomeDaemonFleetRunRecord();
    record.runId = runId;
    record.status = status;
    record.interruptionReason = interruptionReason;
    record.resultJson = JSON.stringify(result);
    record.updatedAt = Date.now();
    const serialized = AgentHomeDaemonFleetRunCodec.encode(record);
    if (serialized.length <= MAX_STATE_LENGTH) {
      ngfSettingsStoreFacade.setString(STORE_KEY, serialized);
    }
  }
}

export const agentHomeDaemonFleetRunStore: AgentHomeDaemonFleetRunStore = new AgentHomeDaemonFleetRunStore();
