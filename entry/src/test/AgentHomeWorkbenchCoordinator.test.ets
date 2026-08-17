import { describe, expect, it } from '@ohos/hypium';
import {
  AgentHomeWorkbenchCoordinator,
  AgentHomeWorkbenchLayoutSnapshot,
  AgentHomeWorkbenchMode
} from '../main/ets/features/agentHome/AgentHomeWorkbenchCoordinator';

export default function agentHomeWorkbenchCoordinatorTest(): void {
  describe('AgentHomeWorkbenchCoordinator', (): void => {
    it('resolvesExactLayoutBreakpoints', 0, (): void => {
      const coordinator = new AgentHomeWorkbenchCoordinator();
      const compact: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(719, true);
      const mediumStart: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(720, true);
      const mediumEnd: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(1199, true);
      const expanded: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(1200, true);

      expect(compact.mode).assertEqual(AgentHomeWorkbenchMode.COMPACT);
      expect(compact.columnCount).assertEqual(1);
      expect(mediumStart.mode).assertEqual(AgentHomeWorkbenchMode.MEDIUM);
      expect(mediumStart.columnCount).assertEqual(2);
      expect(mediumStart.scopePaneWidth).assertEqual(280);
      expect(mediumStart.conversationMinWidth).assertEqual(440);
      expect(mediumEnd.mode).assertEqual(AgentHomeWorkbenchMode.MEDIUM);
      expect(expanded.mode).assertEqual(AgentHomeWorkbenchMode.EXPANDED);
      expect(expanded.columnCount).assertEqual(3);
      expect(expanded.scopePaneWidth).assertEqual(300);
      expect(expanded.conversationMinWidth).assertEqual(480);
      expect(expanded.detailPaneWidth).assertEqual(420);
    });

    it('keepsLegacyNavigationWhenCapabilityIsDisabled', 0, (): void => {
      const coordinator = new AgentHomeWorkbenchCoordinator();
      const legacy: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(1600, false);
      const emptyCompact: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(-20, true);

      expect(legacy.mode).assertEqual(AgentHomeWorkbenchMode.LEGACY);
      expect(legacy.usesLegacyNavigation).assertTrue();
      expect(legacy.columnCount).assertEqual(1);
      expect(emptyCompact.mode).assertEqual(AgentHomeWorkbenchMode.COMPACT);
      expect(emptyCompact.widthVp).assertEqual(0);
    });

    it('clampsExpandedDetailWidth', 0, (): void => {
      const coordinator = new AgentHomeWorkbenchCoordinator();
      const expanded: AgentHomeWorkbenchLayoutSnapshot = coordinator.resolve(1800, true);

      expect(expanded.detailPaneWidth).assertEqual(420);
      expect(expanded.widthVp).assertEqual(1800);
    });
  });
}
