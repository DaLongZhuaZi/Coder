import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeDaemonFleetRunCodec,
  AgentHomeDaemonFleetRunRecord
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetRunStore';
import {
  AgentHomeDaemonInstanceSnapshot,
  AgentHomeDaemonRollingResult,
  AgentHomeDaemonRollingStep
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator';

export default function agentHomeDaemonFleetRunStoreTest(): void {
  describe('AgentHomeDaemonFleetRunStore', (): void => {
    it('restores a running record as interrupted without resuming it', 0, (): void => {
      const result = new AgentHomeDaemonRollingResult();
      result.status = 'running';
      result.operation = 'update';
      result.targetBridgeVersion = '2.0.0';
      const snapshot = new AgentHomeDaemonInstanceSnapshot(
        'host-a', 'instance-a', 4, 'healthy', '1.0.0', 'cfg-1'
      );
      const step = new AgentHomeDaemonRollingStep(snapshot, 'update', '2.0.0', 'cfg-1');
      result.pending.push(step);

      const record = new AgentHomeDaemonFleetRunRecord();
      record.runId = 'run-1';
      record.status = 'running';
      record.resultJson = JSON.stringify(result);
      record.updatedAt = 42;
      const restored = AgentHomeDaemonFleetRunCodec.decode(AgentHomeDaemonFleetRunCodec.encode(record));
      expect(restored !== null).assertTrue();
      if (restored !== null) {
        expect(restored.runId).assertEqual('run-1');
        expect(restored.result.status).assertEqual('interrupted');
        expect(restored.interruptionReason).assertEqual('app_restarted');
        expect(restored.result.pending.length).assertEqual(1);
        expect(restored.result.pending[0].instanceId).assertEqual('instance-a');
      }
    });

    it('rejects unknown schema and malformed steps', 0, (): void => {
      const invalidSchema = '{"schemaVersion":2,"status":"running"}';
      expect(AgentHomeDaemonFleetRunCodec.decode(invalidSchema) === null).assertTrue();
      const record = new AgentHomeDaemonFleetRunRecord();
      record.resultJson = '{"status":"running","pending":[{"status":"pending"}]}';
      expect(AgentHomeDaemonFleetRunCodec.decode(AgentHomeDaemonFleetRunCodec.encode(record)) === null).assertTrue();
    });
  });
}
