import { describe, expect, it } from '@ohos/hypium';
import { AgentBridgeDaemonStatus } from '../main/ets/features/agentBridge/AgentBridgeModels';
import {
  AgentHomeDaemonStatusCoordinator,
  AgentHomeDaemonStatusUpdate
} from '../main/ets/features/agentHome/AgentHomeDaemonStatusCoordinator';

function daemonStatus(instanceId: string, generation: number, hostProfileId: string = 'host-a'): AgentBridgeDaemonStatus {
  const status = new AgentBridgeDaemonStatus();
  status.instanceId = instanceId;
  status.generation = generation;
  status.workerGeneration = generation;
  status.hostProfileId = hostProfileId;
  status.instanceHealth = 'healthy';
  return status;
}

export default function agentHomeDaemonStatusCoordinatorTest(): void {
  describe('AgentHomeDaemonStatusCoordinator', (): void => {
    it('acceptsOnlyTheActiveHostEpoch', 0, (): void => {
      const coordinator = new AgentHomeDaemonStatusCoordinator();
      coordinator.reset('host-a', 4);
      const status = daemonStatus('instance-a', 1);
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate('host-a', 3, '', status))).assertFalse();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate('host-b', 4, '', status))).assertFalse();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate('host-a', 4, '', status))).assertTrue();
    });

    it('requiresTheLatestRequestIdForResponseSnapshots', 0, (): void => {
      const coordinator = new AgentHomeDaemonStatusCoordinator();
      coordinator.reset('host-a', 1);
      coordinator.beginRequest('request-new', 'host-a', 1);
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, 'request-old', daemonStatus('instance-a', 1), true
      ))).assertFalse();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, 'request-new', daemonStatus('instance-a', 1), true
      ))).assertTrue();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, 'request-new', daemonStatus('instance-a', 1), true
      ))).assertFalse();
    });

    it('rejectsInstanceChangesAndGenerationRegression', 0, (): void => {
      const coordinator = new AgentHomeDaemonStatusCoordinator();
      coordinator.reset('host-a', 1);
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, '', daemonStatus('instance-a', 8)
      ))).assertTrue();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, '', daemonStatus('instance-a', 7)
      ))).assertFalse();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate(
        'host-a', 1, '', daemonStatus('instance-b', 9)
      ))).assertFalse();
      expect(coordinator.currentInstanceId()).assertEqual('instance-a');
      expect(coordinator.currentGeneration()).assertEqual(8);
    });

    it('acceptsLegacySnapshotsUntilIdentityIsKnown', 0, (): void => {
      const coordinator = new AgentHomeDaemonStatusCoordinator();
      coordinator.reset('host-a', 1);
      const legacy = daemonStatus('', 0);
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate('host-a', 1, '', legacy))).assertTrue();
      expect(coordinator.accept(new AgentHomeDaemonStatusUpdate('host-a', 1, '', legacy))).assertTrue();
      expect(coordinator.hasActiveSnapshot()).assertTrue();
    });
  });
}
