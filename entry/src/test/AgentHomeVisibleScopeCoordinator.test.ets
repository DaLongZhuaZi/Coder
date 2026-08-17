import { describe, expect, it } from '@ohos/hypium';
import { AgentHomeWorkbenchMode } from '../main/ets/features/agentHome/AgentHomeWorkbenchCoordinator';
import {
  AgentHomeVisibleMainPage,
  AgentHomeVisibleRefreshOperation,
  AgentHomeVisibleRefreshPlan,
  AgentHomeVisibleRefreshScope,
  AgentHomeVisibleRefreshStart,
  AgentHomeVisibleRightPane,
  AgentHomeVisibleScopeCoordinator,
  AgentHomeVisibleScopeInput,
  AgentHomeVisibleSheet,
  AgentHomeVisibleWorkspaceTab
} from '../main/ets/features/agentHome/AgentHomeVisibleScopeCoordinator';

export default function agentHomeVisibleScopeCoordinatorTest(): void {
  describe('AgentHomeVisibleScopeCoordinator', (): void => {
    it('resolvesSheetAndExpandedRightPaneBeforeMainPage', 0, (): void => {
      const coordinator = new AgentHomeVisibleScopeCoordinator();
      const runtimeInput = new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.COMPACT,
        AgentHomeVisibleMainPage.CHAT,
        AgentHomeVisibleSheet.RUNTIME
      );
      const runtimePlan: AgentHomeVisibleRefreshPlan = coordinator.resolve(runtimeInput);
      const rightPaneInput = new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.EXPANDED,
        AgentHomeVisibleMainPage.CHAT,
        AgentHomeVisibleSheet.NONE,
        AgentHomeVisibleWorkspaceTab.CHANGES,
        AgentHomeVisibleRightPane.DOCTOR
      );
      const doctorPlan: AgentHomeVisibleRefreshPlan = coordinator.resolve(rightPaneInput);

      expect(runtimePlan.scope).assertEqual(AgentHomeVisibleRefreshScope.TERMINAL);
      expect(runtimePlan.operations[0]).assertEqual(AgentHomeVisibleRefreshOperation.TERMINAL_LIST);
      expect(doctorPlan.scope).assertEqual(AgentHomeVisibleRefreshScope.DOCTOR);
      expect(doctorPlan.operations[1]).assertEqual(AgentHomeVisibleRefreshOperation.DIAGNOSTICS);
    });

    it('mapsMainPagesToPreciseRefreshOperations', 0, (): void => {
      const coordinator = new AgentHomeVisibleScopeCoordinator();
      const chatPlan = coordinator.resolve(new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.MEDIUM,
        AgentHomeVisibleMainPage.CHAT
      ));
      const filePlan = coordinator.resolve(new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.MEDIUM,
        AgentHomeVisibleMainPage.WORKSPACE_BROWSER,
        AgentHomeVisibleSheet.NONE,
        AgentHomeVisibleWorkspaceTab.FILES
      ));
      const workspacePlan = coordinator.resolve(new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.COMPACT,
        AgentHomeVisibleMainPage.WORKSPACES
      ));

      expect(chatPlan.scope).assertEqual(AgentHomeVisibleRefreshScope.CHAT);
      expect(chatPlan.operations.length).assertEqual(4);
      expect(filePlan.scope).assertEqual(AgentHomeVisibleRefreshScope.FILES);
      expect(filePlan.operations.length).assertEqual(1);
      expect(workspacePlan.scope).assertEqual(AgentHomeVisibleRefreshScope.WORKSPACE);
      expect(workspacePlan.operations.length).assertEqual(2);
    });

    it('mergesInflightScopeAndRejectsOldHostEpoch', 0, (): void => {
      const coordinator = new AgentHomeVisibleScopeCoordinator();
      const plan = coordinator.resolve(new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.COMPACT,
        AgentHomeVisibleMainPage.CHAT
      ));
      const first: AgentHomeVisibleRefreshStart = coordinator.begin(plan, 'host-a', 1);
      const merged: AgentHomeVisibleRefreshStart = coordinator.begin(plan, 'host-a', 1);

      expect(first.shouldStart).assertTrue();
      expect(merged.shouldStart).assertFalse();
      expect(merged.merged).assertTrue();
      expect(merged.ticket.ticketId).assertEqual(first.ticket.ticketId);
      expect(coordinator.complete(first.ticket, 'host-a', 2)).assertFalse();
      expect(coordinator.inFlightCount()).assertEqual(0);

      const next: AgentHomeVisibleRefreshStart = coordinator.begin(plan, 'host-a', 2);
      expect(next.shouldStart).assertTrue();
      expect(coordinator.fail(next.ticket)).assertTrue();
      expect(coordinator.inFlightCount()).assertEqual(0);
    });

    it('clearsOnlyTheSelectedHostRequests', 0, (): void => {
      const coordinator = new AgentHomeVisibleScopeCoordinator();
      const plan = coordinator.resolve(new AgentHomeVisibleScopeInput(
        AgentHomeWorkbenchMode.COMPACT,
        AgentHomeVisibleMainPage.CHAT
      ));
      coordinator.begin(plan, 'host-a', 1);
      coordinator.begin(plan, 'host-b', 1);

      coordinator.clearHost('host-a');

      expect(coordinator.inFlightCount()).assertEqual(1);
    });
  });
}
