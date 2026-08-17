import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeDaemonFleetConnectionPool,
  AgentHomeDaemonFleetActionResult,
  AgentHomeDaemonFleetQueryResult,
  summarizeDaemonFleetResults,
  createDaemonFleetSnapshot
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetConnectionPool';
import { AgentHomeHostProfile } from '../main/ets/features/agentHome/AgentHomeModels';
import { AgentBridgeDaemonStatus } from '../main/ets/features/agentBridge/AgentBridgeModels';
import { AgentHomeDaemonInstanceSnapshot } from '../main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator';

export default function agentHomeDaemonFleetConnectionPoolTest(): void {
  describe('AgentHomeDaemonFleetConnectionPool', (): void => {
    it('returns ordered structured failures for invalid profiles', 0, async (): Promise<void> => {
      const first = AgentHomeHostProfile.empty();
      first.hostProfileId = 'host-a';
      const second = AgentHomeHostProfile.empty();
      second.hostProfileId = 'host-b';
      const pool = new AgentHomeDaemonFleetConnectionPool();
      const results = await pool.collect([first, second], 'test', 2, 1000);
      expect(results.length).assertEqual(2);
      expect(results[0].hostProfileId).assertEqual('host-a');
      expect(results[0].failureCategory).assertEqual('host_profile_invalid');
      expect(results[1].hostProfileId).assertEqual('host-b');
      expect(results[1].failureCategory).assertEqual('host_profile_invalid');
      pool.stop();
    });

    it('rejects unsupported lifecycle operations before opening a connection', 0, async (): Promise<void> => {
      const profile = AgentHomeHostProfile.empty();
      profile.hostProfileId = 'host-invalid-operation';
      profile.endpoint = 'ws://127.0.0.1:1';
      const pool = new AgentHomeDaemonFleetConnectionPool();
      const result: AgentHomeDaemonFleetActionResult = await pool.execute(profile, 'unsupported', 1);
      expect(result.ok).assertEqual(false);
      expect(result.failureCategory).assertEqual('operation_invalid');
      pool.stop();
    });

    it('reports missing credentials without leaking profile data', 0, async (): Promise<void> => {
      const profile = AgentHomeHostProfile.empty();
      profile.hostProfileId = 'host-missing-credential';
      profile.endpoint = 'ws://127.0.0.1:8765';
      profile.credentialAlias = 'missing-alias';
      const pool = new AgentHomeDaemonFleetConnectionPool();
      const result: AgentHomeDaemonFleetActionResult = await pool.execute(profile, 'restart', 1);
      expect(result.ok).assertEqual(false);
      expect(result.failureCategory).assertEqual('credential_missing');
      expect(result.message.indexOf('missing-alias')).assertEqual(-1);
      pool.stop();
    });

    it('summarizes health, versions, warnings and heartbeat gaps', 0, (): void => {
      const healthyStatus = new AgentBridgeDaemonStatus();
      const degradedStatus = new AgentBridgeDaemonStatus();
      const healthy = new AgentHomeDaemonFleetQueryResult(
        'host-summary-a', true, '', '', healthyStatus,
        new AgentHomeDaemonInstanceSnapshot('host-summary-a', 'instance-a', 3, 'healthy', '1.2.0', 'cfg-4', false, '2026-08-09T10:00:00.000Z', true)
      );
      const degraded = new AgentHomeDaemonFleetQueryResult(
        'host-summary-b', true, '', 'stale heartbeat', degradedStatus,
        new AgentHomeDaemonInstanceSnapshot('host-summary-b', 'instance-b', 1, 'degraded', '1.2.0', '', false, '', true)
      );
      const unavailable = new AgentHomeDaemonFleetQueryResult(
        'host-summary-c', false, 'unreachable', 'offline', new AgentBridgeDaemonStatus(),
        new AgentHomeDaemonInstanceSnapshot('host-summary-c', 'unavailable:host-summary-c', 0, 'unreachable', '', '', false, '', false)
      );
      const summary = summarizeDaemonFleetResults([healthy, degraded, unavailable]);
      expect(summary.total).assertEqual(3);
      expect(summary.healthy).assertEqual(1);
      expect(summary.degraded).assertEqual(1);
      expect(summary.unreachable).assertEqual(1);
      expect(summary.warningCount).assertEqual(2);
      expect(summary.missingHeartbeat).assertEqual(2);
      expect(summary.bridgeVersions.length).assertEqual(2);
      expect(summary.bridgeVersions[0].value).assertEqual('1.2.0');
      expect(summary.bridgeVersions[0].count).assertEqual(2);
      expect(summary.configVersions.length).assertEqual(2);
      expect(summary.configVersions[0].value).assertEqual('cfg-4');
      expect(summary.configVersions[1].value).assertEqual('unavailable');
    });

    it('fails closed when a Bridge does not advertise the Fleet target capability', 0, (): void => {
      const status = new AgentBridgeDaemonStatus();
      status.instanceId = 'instance-capability-gated';
      status.generation = 7;
      status.status = 'running';
      status.instanceHealth = 'healthy';
      status.featuresJson = '{"daemonFleetTarget":false}';
      const snapshot = createDaemonFleetSnapshot('host-capability-gated', status);
      expect(snapshot.fleetTargetSupported).assertEqual(false);
      expect(snapshot.rollingEligible).assertEqual(false);

      status.featuresJson = '{"daemonFleetTarget":true}';
      const supported = createDaemonFleetSnapshot('host-capability-supported', status);
      expect(supported.fleetTargetSupported).assertEqual(true);
      expect(supported.rollingEligible).assertEqual(true);
    });

    it('counts sanitized warning records without exposing their contents', 0, (): void => {
      const status = new AgentBridgeDaemonStatus();
      status.instanceId = 'instance-warning-count';
      status.status = 'running';
      status.instanceHealth = 'healthy';
      status.featuresJson = '{"daemonFleetTarget":true}';
      status.warningsJson = '[{"code":"heartbeat_stale","message":"redacted"},{"code":"config_degraded"}]';
      const snapshot = createDaemonFleetSnapshot('host-warning-count', status);
      expect(snapshot.warningCount).assertEqual(2);
    });
  });
}
