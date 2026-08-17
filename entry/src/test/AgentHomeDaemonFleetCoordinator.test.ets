import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeDaemonFleetCoordinator,
  AgentHomeDaemonInstanceSnapshot,
  AgentHomeDaemonRollingStep,
  AgentHomeDaemonFleetRunControl,
  AgentHomeDaemonStepExecutionResult,
  cloneDaemonFleetSnapshot
} from '../main/ets/features/agentHome/AgentHomeDaemonFleetCoordinator';

export default function agentHomeDaemonFleetCoordinatorTest(): void {
  describe('AgentHomeDaemonFleetCoordinator', (): void => {
    it('stops after the first failed instance', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 1, 'healthy', '1.0.0', '1'),
        new AgentHomeDaemonInstanceSnapshot('host-b', 'instance-b', 2, 'healthy', '1.0.0', '1'),
        new AgentHomeDaemonInstanceSnapshot('host-c', 'instance-c', 3, 'healthy', '1.0.0', '1')
      ];
      let calls = 0;
      const result = await coordinator.run(coordinator.buildPreview(snapshots), async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        calls += 1;
        return step.instanceId === 'instance-b' ?
          new AgentHomeDaemonStepExecutionResult(false, step.expectedGeneration, 'degraded', 'failed') :
          new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy');
      });
      expect(calls).assertEqual(2);
      expect(result.completed.length).assertEqual(1);
      expect(result.failed.length).assertEqual(1);
      expect(result.pending.length).assertEqual(1);
      expect(result.excluded.length).assertEqual(0);
    });

    it('normalizes executor exceptions and keeps later targets pending', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 1, 'healthy', '1.0.0', '1'),
        new AgentHomeDaemonInstanceSnapshot('host-b', 'instance-b', 2, 'healthy', '1.0.0', '1')
      ];
      let calls = 0;
      const result = await coordinator.run(coordinator.buildPreview(snapshots), async (_step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        calls += 1;
        throw new Error('transport failure must not escape coordinator');
      });
      expect(calls).assertEqual(1);
      expect(result.status).assertEqual('failed');
      expect(result.completed.length).assertEqual(0);
      expect(result.failed.length).assertEqual(1);
      expect(result.failed[0].message).assertEqual('Daemon rolling operation failed before completion.');
      expect(result.pending.length).assertEqual(1);
      expect(result.pending[0].instanceId).assertEqual('instance-b');
    });

    it('excludes legacy instances from rolling targets', 0, (): void => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 1, 'healthy', '1.0.0', '1'),
        new AgentHomeDaemonInstanceSnapshot('host-b', 'legacy:host-b', 0, 'incompatible', '', '', false, '', false)
      ];
      const result = coordinator.buildPreview(snapshots);
      expect(result.pending.length).assertEqual(1);
      expect(result.excluded.length).assertEqual(1);
      expect(result.excluded[0].status).assertEqual('incompatible');
    });

    it('copies Fleet capability and warning metadata into preview snapshots', 0, (): void => {
      const source = new AgentHomeDaemonInstanceSnapshot('host-copy', 'instance-copy', 4,
        'healthy', '1.2.0', 'cfg-3', false, '2026-08-10T00:00:00.000Z', false, false, 3);
      const copy = cloneDaemonFleetSnapshot(source, true);
      expect(copy.hostProfileId).assertEqual('host-copy');
      expect(copy.instanceId).assertEqual('instance-copy');
      expect(copy.rollingEligible).assertEqual(false);
      expect(copy.fleetTargetSupported).assertEqual(false);
      expect(copy.warningCount).assertEqual(3);
      expect(copy.isolated).assertEqual(true);
    });

    it('keeps isolated targets excluded during execution', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 4, 'healthy', '1.0.0', '1', true),
        new AgentHomeDaemonInstanceSnapshot('host-b', 'instance-b', 6, 'healthy', '1.0.0', '1')
      ];
      const result = await coordinator.run(
        coordinator.buildPreview(snapshots),
        async (_step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
          return new AgentHomeDaemonStepExecutionResult(true, 7, 'healthy');
        }
      );
      expect(result.status).assertEqual('completed');
      expect(result.completed.length).assertEqual(1);
      expect(result.excluded.length).assertEqual(1);
      expect(result.excluded[0].status).assertEqual('isolated');
    });

    it('requires a healthy replacement from the same target instance', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshot = new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 4, 'healthy', '1.0.0', '1');
      const preview = coordinator.buildPreview([snapshot]);
      const result = await coordinator.run(preview, async (_step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        return new AgentHomeDaemonStepExecutionResult(true, 5, 'healthy', '', 'host-a', 'instance-b');
      });
      expect(result.status).assertEqual('failed');
      expect(result.completed.length).assertEqual(0);
      expect(result.failed.length).assertEqual(1);
      expect(result.failed[0].message).assertEqual('Daemon target identity changed during the rolling operation.');
    });

    it('stops on a generation-stalled target and keeps later targets pending', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-a', 'instance-a', 4, 'healthy', '1.0.0', '1'),
        new AgentHomeDaemonInstanceSnapshot('host-b', 'instance-b', 5, 'healthy', '1.0.0', '1')
      ];
      const preview = coordinator.buildPreview(snapshots);
      let calls = 0;
      const result = await coordinator.run(preview, async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        calls += 1;
        return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration, 'healthy', 'generation did not advance');
      });
      expect(calls).assertEqual(1);
      expect(result.status).assertEqual('failed');
      expect(result.failed.length).assertEqual(1);
      expect(result.pending.length).assertEqual(1);
    });

    it('preserves cancellation and leaves later targets pending', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-cancel-a', 'instance-cancel-a', 4, 'healthy', '1.0.0', 'cfg-1'),
        new AgentHomeDaemonInstanceSnapshot('host-cancel-b', 'instance-cancel-b', 5, 'healthy', '1.0.0', 'cfg-1')
      ];
      const result = await coordinator.run(coordinator.buildPreview(snapshots),
        async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
          return new AgentHomeDaemonStepExecutionResult(false, step.expectedGeneration, 'degraded',
            'Daemon operation was cancelled by the host lifecycle.', step.hostProfileId, step.instanceId,
            '', '', 'cancelled');
        });
      expect(result.status).assertEqual('cancelled');
      expect(result.failed.length).assertEqual(1);
      expect(result.failed[0].failureCategory).assertEqual('cancelled');
      expect(result.pending.length).assertEqual(1);
      expect(result.pending[0].instanceId).assertEqual('instance-cancel-b');
    });

    it('interrupts between steps after lifecycle cancellation', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const control = new AgentHomeDaemonFleetRunControl();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-interrupt-a', 'instance-interrupt-a', 1, 'healthy', '1.0.0', 'cfg-1'),
        new AgentHomeDaemonInstanceSnapshot('host-interrupt-b', 'instance-interrupt-b', 2, 'healthy', '1.0.0', 'cfg-1')
      ];
      let calls = 0;
      const result = await coordinator.run(coordinator.buildPreview(snapshots),
        async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
          calls += 1;
          control.cancel('page_disappear');
          return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy', '',
            step.hostProfileId, step.instanceId, '1.0.0', 'cfg-1');
        }, control);
      expect(calls).assertEqual(1);
      expect(result.status).assertEqual('interrupted');
      expect(result.interruptionReason).assertEqual('page_disappear');
      expect(result.completed.length).assertEqual(1);
      expect(result.pending.length).assertEqual(1);
      expect(result.pending[0].instanceId).assertEqual('instance-interrupt-b');
    });

    it('accepts restart only when reported versions match the preview', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshot = new AgentHomeDaemonInstanceSnapshot('host-version', 'instance-version', 4, 'healthy', '1.2.0', 'cfg-7');
      const preview = coordinator.buildPreview([snapshot], 'restart');
      const result = await coordinator.run(preview, async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy', '',
          step.hostProfileId, step.instanceId, '1.2.0', 'cfg-7');
      });
      expect(result.status).assertEqual('completed');
      expect(result.completed.length).assertEqual(1);
    });

    it('rejects a restart when the Bridge version changes unexpectedly', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshot = new AgentHomeDaemonInstanceSnapshot('host-version-change', 'instance-version-change', 4,
        'healthy', '1.2.0', 'cfg-7');
      const result = await coordinator.run(coordinator.buildPreview([snapshot], 'restart'),
        async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
          return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy', '',
            step.hostProfileId, step.instanceId, '1.3.0', 'cfg-7');
        });
      expect(result.status).assertEqual('failed');
      expect(result.failed.length).assertEqual(1);
      expect(result.failed[0].failureCategory).assertEqual('daemon_version_mismatch');
    });

    it('allows an update target version and rejects a config drift', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshot = new AgentHomeDaemonInstanceSnapshot('host-update', 'instance-update', 8,
        'healthy', '1.2.0', 'cfg-7');
      const preview = coordinator.buildPreview([snapshot], 'update', '1.3.0');
      const result = await coordinator.run(preview, async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy', '',
          step.hostProfileId, step.instanceId, '1.3.0', 'cfg-7');
      });
      expect(result.status).assertEqual('completed');
      expect(result.completed.length).assertEqual(1);

      const driftResult = await coordinator.run(coordinator.buildPreview([snapshot], 'restart'),
        async (step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
          return new AgentHomeDaemonStepExecutionResult(true, step.expectedGeneration + 1, 'healthy', '',
            step.hostProfileId, step.instanceId, '1.2.0', 'cfg-8');
        });
      expect(driftResult.status).assertEqual('failed');
      expect(driftResult.failed[0].failureCategory).assertEqual('daemon_config_version_mismatch');
    });

    it('completes a preview with only excluded targets', 0, async (): Promise<void> => {
      const coordinator = new AgentHomeDaemonFleetCoordinator();
      const snapshots: Array<AgentHomeDaemonInstanceSnapshot> = [
        new AgentHomeDaemonInstanceSnapshot('host-isolated', 'instance-isolated', 2, 'isolated', '1.0.0', 'cfg', true),
        new AgentHomeDaemonInstanceSnapshot('host-old', 'legacy:host-old', 0, 'incompatible', '', '', false, '', false)
      ];
      const preview = coordinator.buildPreview(snapshots);
      const result = await coordinator.run(preview, async (_step: AgentHomeDaemonRollingStep): Promise<AgentHomeDaemonStepExecutionResult> => {
        return new AgentHomeDaemonStepExecutionResult(true, 1, 'healthy');
      });
      expect(preview.pending.length).assertEqual(0);
      expect(preview.excluded.length).assertEqual(2);
      expect(result.status).assertEqual('completed');
      expect(result.excluded.length).assertEqual(2);
    });
  });
}
