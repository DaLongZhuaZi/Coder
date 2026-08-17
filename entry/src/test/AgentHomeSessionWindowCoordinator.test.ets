import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeSessionWindowClosePlan,
  AgentHomeSessionWindowCoordinator,
  AgentHomeSessionWindowOpenAction,
  AgentHomeSessionWindowOpenPlan,
  AgentHomeSessionWindowRecord,
  AgentHomeSessionWindowTarget
} from '../main/ets/features/agentHome/AgentHomeSessionWindowCoordinator';

export default function agentHomeSessionWindowCoordinatorTest(): void {
  describe('AgentHomeSessionWindowCoordinator', (): void => {
    it('reusesSameSessionAndKeepsDifferentSessionsSeparate', 0, (): void => {
      const coordinator = new AgentHomeSessionWindowCoordinator();
      const first: AgentHomeSessionWindowOpenPlan = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );
      const openingAgain: AgentHomeSessionWindowOpenPlan = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );

      expect(first.action).assertEqual(AgentHomeSessionWindowOpenAction.CREATE);
      expect(openingAgain.action).assertEqual(AgentHomeSessionWindowOpenAction.WAIT);
      expect(coordinator.markOpened(first)).assertTrue();

      const focus: AgentHomeSessionWindowOpenPlan = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );
      const second: AgentHomeSessionWindowOpenPlan = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-b')
      );

      expect(focus.action).assertEqual(AgentHomeSessionWindowOpenAction.FOCUS);
      expect(focus.target.instanceId).assertEqual(first.target.instanceId);
      expect(second.action).assertEqual(AgentHomeSessionWindowOpenAction.CREATE);
      expect(coordinator.activeRecords().length).assertEqual(2);
    });

    it('invalidatesHostWithoutAcceptingStaleCloseEvents', 0, (): void => {
      const coordinator = new AgentHomeSessionWindowCoordinator();
      const first = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );
      coordinator.markOpened(first);
      const closePlans: Array<AgentHomeSessionWindowClosePlan> = coordinator.invalidateHost('host-a');

      expect(closePlans.length).assertEqual(1);
      expect(closePlans[0].shouldClose).assertTrue();
      expect(coordinator.markClosed(closePlans[0].windowName, closePlans[0].instanceId)).assertTrue();

      const reopened = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );
      expect(reopened.action).assertEqual(AgentHomeSessionWindowOpenAction.CREATE);
      expect(reopened.target.instanceId === first.target.instanceId).assertFalse();
      expect(coordinator.markClosed(first.windowName, first.target.instanceId)).assertFalse();
      expect(coordinator.activeRecords().length).assertEqual(1);
    });

    it('rejectsInvalidTargetsAndRecoversFailedOpen', 0, (): void => {
      const coordinator = new AgentHomeSessionWindowCoordinator();
      const rejected = coordinator.planOpen(new AgentHomeSessionWindowTarget('', '', '', ''));
      expect(rejected.action).assertEqual(AgentHomeSessionWindowOpenAction.REJECT);

      const failed = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host/a', 'workspace-a', 'agent-a', 'session:a')
      );
      expect(failed.windowName.indexOf('/')).assertEqual(-1);
      expect(failed.windowName.indexOf(':')).assertEqual(-1);
      expect(coordinator.markOpenFailed(failed, 'create_failed')).assertTrue();

      const retry = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host/a', 'workspace-a', 'agent-a', 'session:a')
      );
      const record: AgentHomeSessionWindowRecord | null = coordinator.recordFor('host/a', 'session:a');
      expect(retry.action).assertEqual(AgentHomeSessionWindowOpenAction.CREATE);
      expect(retry.target.instanceId === failed.target.instanceId).assertFalse();
      expect(record === null).assertFalse();
    });

    it('invalidatesWorkspaceAndAcceptsDirectWindowClose', 0, (): void => {
      const coordinator = new AgentHomeSessionWindowCoordinator();
      const first = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-a', 'agent-a', 'session-a')
      );
      const second = coordinator.planOpen(
        new AgentHomeSessionWindowTarget('host-a', 'workspace-b', 'agent-b', 'session-b')
      );
      coordinator.markOpened(first);
      coordinator.markOpened(second);

      const closePlans: Array<AgentHomeSessionWindowClosePlan> =
        coordinator.invalidateWorkspace('host-a', 'workspace-a');
      const record: AgentHomeSessionWindowRecord | null = coordinator.recordForWindow(first.windowName);

      expect(closePlans.length).assertEqual(1);
      expect(closePlans[0].windowName).assertEqual(first.windowName);
      expect(record === null).assertFalse();
      if (record !== null) {
        expect(record.target.sessionId).assertEqual('session-a');
      }
      expect(coordinator.markClosedWindow(first.windowName)).assertTrue();
      expect(coordinator.recordForWindow(first.windowName)).assertNull();
      expect(coordinator.activeRecords().length).assertEqual(1);
    });
  });
}
