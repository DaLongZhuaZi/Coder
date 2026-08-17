import { securityToolkit } from 'ngf_framework';
import { AgentBridgeClient } from '../agentBridge/AgentBridgeClient';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeDaemonStatus,
  AgentBridgeIncomingParser
} from '../agentBridge/AgentBridgeModels';
import { AgentHomeHostProfile } from './AgentHomeModels';
import { agentHomeHostCredentialStore } from './AgentHomeHostCredentialStore';
import { AgentHomeDaemonInstanceSnapshot } from './AgentHomeDaemonFleetCoordinator';

const DEFAULT_FLEET_QUERY_TIMEOUT_MS: number = 8000;
const DEFAULT_FLEET_MAX_CONCURRENCY: number = 3;

export class AgentHomeDaemonFleetQueryResult {
  hostProfileId: string;
  ok: boolean;
  failureCategory: string;
  message: string;
  daemonStatus: AgentBridgeDaemonStatus;
  snapshot: AgentHomeDaemonInstanceSnapshot;

  constructor(hostProfileId: string, ok: boolean, failureCategory: string, message: string,
    daemonStatus: AgentBridgeDaemonStatus, snapshot: AgentHomeDaemonInstanceSnapshot) {
    this.hostProfileId = hostProfileId;
    this.ok = ok;
    this.failureCategory = failureCategory;
    this.message = message;
    this.daemonStatus = daemonStatus;
    this.snapshot = snapshot;
  }
}

export class AgentHomeDaemonFleetDistribution {
  value: string;
  count: number;

  constructor(value: string = '', count: number = 0) {
    this.value = value;
    this.count = count;
  }
}

export class AgentHomeDaemonFleetSummary {
  total: number;
  healthy: number;
  degraded: number;
  unreachable: number;
  incompatible: number;
  updating: number;
  isolated: number;
  unknown: number;
  warningCount: number;
  missingHeartbeat: number;
  bridgeVersions: Array<AgentHomeDaemonFleetDistribution>;
  configVersions: Array<AgentHomeDaemonFleetDistribution>;

  constructor() {
    this.total = 0;
    this.healthy = 0;
    this.degraded = 0;
    this.unreachable = 0;
    this.incompatible = 0;
    this.updating = 0;
    this.isolated = 0;
    this.unknown = 0;
    this.warningCount = 0;
    this.missingHeartbeat = 0;
    this.bridgeVersions = [];
    this.configVersions = [];
  }
}

function incrementFleetDistribution(items: Array<AgentHomeDaemonFleetDistribution>, rawValue: string): void {
  const value = rawValue.length > 0 ? rawValue : 'unavailable';
  for (let index = 0; index < items.length; index++) {
    if (items[index].value === value) {
      items[index].count += 1;
      return;
    }
  }
  items.push(new AgentHomeDaemonFleetDistribution(value, 1));
}

export function summarizeDaemonFleetResults(
  results: Array<AgentHomeDaemonFleetQueryResult>
): AgentHomeDaemonFleetSummary {
  const summary = new AgentHomeDaemonFleetSummary();
  summary.total = results.length;
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const health = result.snapshot.health;
    if (health === 'healthy') {
      summary.healthy += 1;
    } else if (health === 'degraded') {
      summary.degraded += 1;
    } else if (health === 'unreachable') {
      summary.unreachable += 1;
    } else if (health === 'incompatible') {
      summary.incompatible += 1;
    } else if (health === 'updating') {
      summary.updating += 1;
    } else if (health === 'isolated') {
      summary.isolated += 1;
    } else {
      summary.unknown += 1;
    }
    if (!result.ok || result.message.length > 0 || health !== 'healthy' || result.snapshot.warningCount > 0) {
      summary.warningCount += 1;
    }
    if (result.snapshot.lastHeartbeatAt.length === 0) {
      summary.missingHeartbeat += 1;
    }
    incrementFleetDistribution(summary.bridgeVersions, result.snapshot.bridgeVersion);
    incrementFleetDistribution(summary.configVersions, result.snapshot.configVersion);
  }
  return summary;
}

export class AgentHomeDaemonFleetActionResult {
  action: string;
  ok: boolean;
  failureCategory: string;
  message: string;
  generation: number;
  health: string;
  bridgeVersion: string;
  hostProfileId: string;
  instanceId: string;
  configVersion: string;

  constructor(action: string = '') {
    this.action = action;
    this.ok = false;
    this.failureCategory = '';
    this.message = '';
    this.generation = 0;
    this.health = '';
    this.bridgeVersion = '';
    this.hostProfileId = '';
    this.instanceId = '';
    this.configVersion = '';
  }
}

class AgentHomeDaemonFleetWorkCursor {
  private nextIndex: number = 0;

  take(limit: number): number {
    if (this.nextIndex >= limit) {
      return -1;
    }
    const result = this.nextIndex;
    this.nextIndex += 1;
    return result;
  }
}

export class AgentHomeDaemonFleetConnectionPool {
  private readonly clients: Map<string, AgentBridgeClient> = new Map<string, AgentBridgeClient>();
  private collectionEpoch: number = 0;

  async collect(profiles: Array<AgentHomeHostProfile>, appVersion: string = '',
    maxConcurrency: number = DEFAULT_FLEET_MAX_CONCURRENCY,
    timeoutMs: number = DEFAULT_FLEET_QUERY_TIMEOUT_MS): Promise<Array<AgentHomeDaemonFleetQueryResult>> {
    const epoch = this.collectionEpoch + 1;
    this.collectionEpoch = epoch;
    const results: Array<AgentHomeDaemonFleetQueryResult> = [];
    for (let index = 0; index < profiles.length; index++) {
      results.push(this.createUnavailableResult(profiles[index].hostProfileId, 'not_started', 'Not queried'));
    }
    if (profiles.length === 0) {
      return results;
    }
    const cursor = new AgentHomeDaemonFleetWorkCursor();
    const workerCount = Math.max(1, Math.min(Math.max(1, maxConcurrency), profiles.length));
    const workers: Array<Promise<void>> = [];
    const worker = async (): Promise<void> => {
      while (this.collectionEpoch === epoch) {
        const profileIndex = cursor.take(profiles.length);
        if (profileIndex < 0) {
          return;
        }
        results[profileIndex] = await this.queryProfile(profiles[profileIndex], appVersion, timeoutMs, epoch);
      }
    };
    for (let index = 0; index < workerCount; index++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return results;
  }

  stop(): void {
    this.collectionEpoch += 1;
    const hostIds: Array<string> = [];
    this.clients.forEach((_client: AgentBridgeClient, hostProfileId: string): void => {
      hostIds.push(hostProfileId);
    });
    for (let index = 0; index < hostIds.length; index++) {
      const client = this.clients.get(hostIds[index]);
      if (client !== undefined) {
        client.disconnect();
      }
    }
    this.clients.clear();
  }

  async execute(
    profile: AgentHomeHostProfile,
    operation: string,
    expectedGeneration: number,
    targetVersion: string = '',
    appVersion: string = '',
    timeoutMs: number = 30000,
    expectedInstanceId: string = ''
  ): Promise<AgentHomeDaemonFleetActionResult> {
    const actionEpoch = this.collectionEpoch;
    const accepted = await this.sendLifecycleAction(
      profile, operation, targetVersion, appVersion, timeoutMs, expectedInstanceId, expectedGeneration
    );
    if (!accepted.ok) {
      return accepted;
    }
    const deadline = Date.now() + Math.max(5000, timeoutMs);
    let latest = accepted;
    while (this.collectionEpoch === actionEpoch && Date.now() < deadline) {
      await this.delay(600);
      const remaining = Math.max(1000, deadline - Date.now());
      const query = await this.queryProfile(profile, appVersion, Math.min(8000, remaining), this.collectionEpoch);
      if (query.ok && expectedInstanceId.length > 0 && query.snapshot.instanceId !== expectedInstanceId) {
        latest.ok = false;
        latest.failureCategory = 'daemon_instance_changed';
        latest.message = 'The daemon instance changed during the rolling operation.';
        latest.hostProfileId = profile.hostProfileId;
        latest.instanceId = query.snapshot.instanceId;
        latest.generation = query.snapshot.generation;
        latest.health = query.snapshot.health;
        latest.bridgeVersion = query.snapshot.bridgeVersion;
        latest.configVersion = query.snapshot.configVersion;
        return latest;
      }
      if (query.ok && query.snapshot.generation > expectedGeneration && query.snapshot.health === 'healthy') {
        const result = new AgentHomeDaemonFleetActionResult(operation);
        result.ok = true;
        result.hostProfileId = profile.hostProfileId;
        result.instanceId = query.snapshot.instanceId;
        result.generation = query.snapshot.generation;
        result.health = query.snapshot.health;
        result.bridgeVersion = query.snapshot.bridgeVersion;
        result.configVersion = query.snapshot.configVersion;
        result.message = 'Daemon operation completed and the replacement is healthy.';
        return result;
      }
      if (!query.ok) {
        latest.failureCategory = query.failureCategory;
        latest.message = query.message;
      } else {
        latest.hostProfileId = profile.hostProfileId;
        latest.instanceId = query.snapshot.instanceId;
        latest.generation = query.snapshot.generation;
        latest.health = query.snapshot.health;
        latest.bridgeVersion = query.snapshot.bridgeVersion;
        latest.configVersion = query.snapshot.configVersion;
        latest.message = 'Waiting for the daemon replacement to become healthy.';
      }
    }
    if (this.collectionEpoch !== actionEpoch) {
      latest.ok = false;
      latest.failureCategory = 'cancelled';
      latest.message = 'Daemon operation was cancelled by the host lifecycle.';
      return latest;
    }
    latest.ok = false;
    if (latest.failureCategory.length === 0) {
      latest.failureCategory = 'generation_timeout';
    }
    if (latest.message.length === 0) {
      latest.message = 'Daemon replacement did not become healthy before the timeout.';
    }
    return latest;
  }

  private async queryProfile(profile: AgentHomeHostProfile, appVersion: string, timeoutMs: number,
    epoch: number): Promise<AgentHomeDaemonFleetQueryResult> {
    if (profile.hostProfileId.length === 0 || profile.endpoint.length === 0) {
      return this.createUnavailableResult(profile.hostProfileId, 'host_profile_invalid', 'Host profile is incomplete');
    }
    let credential: string = '';
    if (!AgentBridgeClient.isRelayEndpoint(profile.endpoint)) {
      const storedCredential = await agentHomeHostCredentialStore.read(profile.credentialAlias);
      if (storedCredential === null || storedCredential.length === 0) {
        return this.createUnavailableResult(profile.hostProfileId, 'credential_missing', 'Host credential is unavailable');
      }
      credential = storedCredential;
    }
    if (this.collectionEpoch !== epoch) {
      return this.createUnavailableResult(profile.hostProfileId, 'cancelled', 'Fleet query was cancelled');
    }
    return new Promise<AgentHomeDaemonFleetQueryResult>((resolve: (result: AgentHomeDaemonFleetQueryResult) => void): void => {
      const client = new AgentBridgeClient();
      let requestId: string = '';
      let timer: number = -1;
      let settled: boolean = false;
      const finish = (result: AgentHomeDaemonFleetQueryResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer >= 0) {
          clearTimeout(timer);
          timer = -1;
        }
        const activeClient = this.clients.get(profile.hostProfileId);
        if (activeClient === client) {
          this.clients.delete(profile.hostProfileId);
        }
        client.disconnect();
        resolve(result);
      };
      const fail = (failureCategory: string, message: string): void => {
        finish(this.createUnavailableResult(profile.hostProfileId, failureCategory, message));
      };
      client.setHandlers(
        (status: string, _detail: string): void => {
          if (this.collectionEpoch !== epoch) {
            fail('cancelled', 'Fleet query was cancelled');
            return;
          }
          if (status === AgentBridgeConnectionStatus.CONNECTED && requestId.length === 0) {
            requestId = client.requestDaemonInstanceStatus(profile.hostProfileId);
            if (requestId.length === 0) {
              fail('request_unavailable', 'Daemon status request could not be sent');
            }
            return;
          }
          if (status === AgentBridgeConnectionStatus.ERROR) {
            fail('unreachable', 'Bridge connection failed');
          } else if (status === AgentBridgeConnectionStatus.DISCONNECTED && requestId.length === 0) {
            fail('unreachable', 'Bridge disconnected before daemon status');
          }
        },
        (text: string): void => {
          if (requestId.length === 0) {
            return;
          }
          const parsed = AgentBridgeIncomingParser.parse(text);
          if (parsed.requestId !== requestId) {
            return;
          }
          const status = AgentBridgeIncomingParser.parseDaemonStatus(text);
          if (!parsed.isOk || status.failureCategory.length > 0) {
            const category = status.failureCategory.length > 0 ? status.failureCategory : 'bridge_request_failed';
            const message = status.message.length > 0 ? status.message : 'Daemon status request failed';
            fail(category, message);
            return;
          }
          finish(this.createStatusResult(profile.hostProfileId, status));
        },
        (_message: string): void => {
          fail('unreachable', 'Bridge connection failed');
        },
        (_sessionId: string): void => {
        }
      );
      client.setBinaryHandlers(null, null);
      this.clients.set(profile.hostProfileId, client);
      timer = setTimeout((): void => {
        fail('timeout', 'Daemon status request timed out');
      }, Math.max(1000, timeoutMs));
      const appNonce = this.createAppNonce();
      const config = new AgentBridgeConnectionConfig(
        profile.endpoint,
        credential,
        'harmony-coder-fleet',
        appNonce,
        profile.hostProfileId,
        appVersion
      );
      client.connect(config);
    });
  }

  private async sendLifecycleAction(
    profile: AgentHomeHostProfile,
    operation: string,
    targetVersion: string,
    appVersion: string,
    timeoutMs: number,
    expectedInstanceId: string,
    expectedGeneration: number
  ): Promise<AgentHomeDaemonFleetActionResult> {
    const result = new AgentHomeDaemonFleetActionResult(operation);
    if (operation !== 'restart' && operation !== 'update' && operation !== 'rollback') {
      result.failureCategory = 'operation_invalid';
      result.message = 'Unsupported daemon fleet operation.';
      return result;
    }
    if (profile.hostProfileId.length === 0 || profile.endpoint.length === 0) {
      result.failureCategory = 'host_profile_invalid';
      result.message = 'Host profile is incomplete.';
      return result;
    }
    let credential: string = '';
    if (!AgentBridgeClient.isRelayEndpoint(profile.endpoint)) {
      const storedCredential = await agentHomeHostCredentialStore.read(profile.credentialAlias);
      if (storedCredential === null || storedCredential.length === 0) {
        result.failureCategory = 'credential_missing';
        result.message = 'Host credential is unavailable.';
        return result;
      }
      credential = storedCredential;
    }
    return new Promise<AgentHomeDaemonFleetActionResult>((resolve: (value: AgentHomeDaemonFleetActionResult) => void): void => {
      const client = new AgentBridgeClient();
      let requestId: string = '';
      let timer: number = -1;
      let settled: boolean = false;
      const finish = (value: AgentHomeDaemonFleetActionResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer >= 0) {
          clearTimeout(timer);
          timer = -1;
        }
        const activeClient = this.clients.get(profile.hostProfileId);
        if (activeClient === client) {
          this.clients.delete(profile.hostProfileId);
        }
        client.disconnect();
        resolve(value);
      };
      const fail = (category: string, message: string): void => {
        const failed = new AgentHomeDaemonFleetActionResult(operation);
        failed.failureCategory = category;
        failed.message = message;
        finish(failed);
      };
      client.setHandlers(
        (status: string, _detail: string): void => {
          if (status === AgentBridgeConnectionStatus.CONNECTED && requestId.length === 0) {
            if (operation === 'restart') {
              requestId = client.restartDaemon(expectedInstanceId, expectedGeneration, profile.hostProfileId);
            } else if (operation === 'update') {
              requestId = client.installDaemonUpdate(
                'latest', targetVersion, true, false, expectedInstanceId, expectedGeneration, profile.hostProfileId
              );
            } else {
              requestId = client.rollbackDaemonUpdate(true, expectedInstanceId, expectedGeneration, profile.hostProfileId);
            }
            if (requestId.length === 0) {
              fail('request_unavailable', 'Daemon lifecycle request could not be sent.');
            }
            return;
          }
          if (status === AgentBridgeConnectionStatus.ERROR) {
            fail('unreachable', 'Bridge connection failed while executing the daemon operation.');
          } else if (status === AgentBridgeConnectionStatus.DISCONNECTED && !settled) {
            fail(requestId.length === 0 ? 'unreachable' : 'connection_lost',
              requestId.length === 0 ? 'Bridge disconnected before the daemon operation was accepted.' :
                'Bridge disconnected before the daemon operation was acknowledged.');
          }
        },
        (text: string): void => {
          if (requestId.length === 0) {
            return;
          }
          const parsed = AgentBridgeIncomingParser.parse(text);
          if (parsed.requestId !== requestId) {
            return;
          }
          if (!parsed.isOk) {
            fail('bridge_request_failed', parsed.errorMessage.length > 0 ? parsed.errorMessage : 'Daemon operation failed.');
            return;
          }
          const actionResult = new AgentHomeDaemonFleetActionResult(operation);
          actionResult.ok = true;
          if (operation === 'restart') {
            const statusResult = AgentBridgeIncomingParser.parseDaemonStatus(text);
            actionResult.failureCategory = statusResult.failureCategory;
            actionResult.message = statusResult.message;
            actionResult.generation = statusResult.generation;
            actionResult.health = statusResult.instanceHealth.length > 0 ? statusResult.instanceHealth : statusResult.health;
            actionResult.bridgeVersion = statusResult.bridgeVersion;
            actionResult.configVersion = AgentBridgeIncomingParser.extractStringProperty(
              statusResult.remoteConfigJson, 'activeVersion'
            );
            actionResult.hostProfileId = profile.hostProfileId;
            actionResult.instanceId = statusResult.instanceId;
            if (statusResult.failureCategory.length > 0) {
              actionResult.ok = false;
            }
          } else {
            const updateResult = AgentBridgeIncomingParser.parseDaemonUpdateResult(text);
            actionResult.failureCategory = updateResult.failureCategory;
            actionResult.message = updateResult.message;
            if (updateResult.failureCategory.length > 0 || updateResult.ok === false) {
              actionResult.ok = false;
            }
            actionResult.hostProfileId = profile.hostProfileId;
          }
          if (!actionResult.ok) {
            fail(actionResult.failureCategory.length > 0 ? actionResult.failureCategory : 'daemon_operation_failed',
              actionResult.message.length > 0 ? actionResult.message : 'Daemon operation failed.');
            return;
          }
          finish(actionResult);
        },
        (_message: string): void => {
          fail('unreachable', 'Bridge connection failed while executing the daemon operation.');
        },
        (_sessionId: string): void => {
        }
      );
      client.setBinaryHandlers(null, null);
      this.clients.set(profile.hostProfileId, client);
      timer = setTimeout((): void => {
        fail('timeout', 'Daemon operation timed out before acknowledgement.');
      }, Math.max(2000, timeoutMs));
      const config = new AgentBridgeConnectionConfig(
        profile.endpoint,
        credential,
        'harmony-coder-fleet-action',
        this.createAppNonce(),
        profile.hostProfileId,
        appVersion
      );
      client.connect(config);
    });
  }

  private delay(durationMs: number): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
      setTimeout((): void => {
        resolve();
      }, durationMs);
    });
  }

  private createStatusResult(hostProfileId: string, status: AgentBridgeDaemonStatus): AgentHomeDaemonFleetQueryResult {
    const snapshot = createDaemonFleetSnapshot(hostProfileId, status);
    return new AgentHomeDaemonFleetQueryResult(hostProfileId, true, '', '', status, snapshot);
  }

  private createUnavailableResult(hostProfileId: string, failureCategory: string,
    message: string): AgentHomeDaemonFleetQueryResult {
    const status = new AgentBridgeDaemonStatus();
    status.hostProfileId = hostProfileId;
    const snapshot = new AgentHomeDaemonInstanceSnapshot(
      hostProfileId,
      hostProfileId.length > 0 ? 'unavailable:' + hostProfileId : 'unavailable',
      0,
      failureCategory === 'incompatible' ? 'incompatible' : 'unreachable',
      '',
      '',
      false,
      '',
      false,
      false,
      0
    );
    return new AgentHomeDaemonFleetQueryResult(hostProfileId, false, failureCategory, message, status, snapshot);
  }

  private createAppNonce(): string {
    const generated = securityToolkit.generateRandomBase64(18);
    return generated.length > 0 ? generated : 'fleet_' + String(Date.now());
  }
}

/**
 * Converts the optional daemon status payload into a fail-closed Fleet snapshot.
 * Instance identity alone is not enough to authorize rolling operations: the
 * target must explicitly advertise daemonFleetTarget in its own feature set.
 */
export function createDaemonFleetSnapshot(
  hostProfileId: string,
  status: AgentBridgeDaemonStatus
): AgentHomeDaemonInstanceSnapshot {
  const hasInstanceId = status.instanceId.length > 0;
  const instanceId = hasInstanceId ? status.instanceId : 'legacy:' + hostProfileId;
  const health = normalizeDaemonFleetHealth(status, hasInstanceId);
  const fleetTargetSupported = hasInstanceId &&
    AgentBridgeIncomingParser.extractBooleanProperty(status.featuresJson, 'daemonFleetTarget');
  const configVersion = AgentBridgeIncomingParser.extractStringProperty(status.remoteConfigJson, 'activeVersion');
  const warningCount = countDaemonStatusWarnings(status.warningsJson);
  return new AgentHomeDaemonInstanceSnapshot(
    hostProfileId,
    instanceId,
    status.generation > 0 ? status.generation : status.workerGeneration,
    health,
    status.bridgeVersion,
    configVersion,
    false,
    status.lastHeartbeatAt,
    fleetTargetSupported && health !== 'incompatible',
    fleetTargetSupported,
    warningCount
  );
}

function normalizeDaemonFleetHealth(status: AgentBridgeDaemonStatus, hasInstanceId: boolean): string {
  if (!hasInstanceId) {
    return 'incompatible';
  }
  const raw = status.instanceHealth.length > 0 ? status.instanceHealth : status.health;
  if (raw === 'healthy' || raw === 'degraded' || raw === 'unreachable' || raw === 'incompatible' ||
    raw === 'updating' || raw === 'isolated') {
    return raw;
  }
  if (status.status === 'running' || status.workerReady) {
    return 'healthy';
  }
  return 'degraded';
}

function countDaemonStatusWarnings(warningsJson: string): number {
  if (warningsJson.trim().length === 0) {
    return 0;
  }
  const objectCount = AgentBridgeIncomingParser.extractObjectArray(
    '{"items":' + warningsJson + '}', 'items'
  ).length;
  if (objectCount > 0) {
    return objectCount;
  }
  return AgentBridgeIncomingParser.extractStringArrayProperty(
    '{"items":' + warningsJson + '}', 'items'
  ).length;
}
