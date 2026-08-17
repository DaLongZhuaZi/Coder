import { describe, it, expect } from '@ohos/hypium';
import {
  AgentHomeWorkspacePreviewRequestMatch,
  AgentHomeWorkspacePreviewRequestTracker
} from '../main/ets/features/agentHome/AgentHomeWorkspacePreviewRequestTracker';

export default function agentHomeWorkspacePreviewRequestTrackerTest() {
  describe('AgentHomeWorkspacePreviewRequestTracker', () => {
    it('matchesOnlyTheCurrentPreviewRequest', 0, () => {
      const tracker = new AgentHomeWorkspacePreviewRequestTracker();
      tracker.track('request-a', 'profile.json');
      tracker.track('request-b', 'entry/src/main/ets/Index.ets');

      const staleMatch: AgentHomeWorkspacePreviewRequestMatch = tracker.consume('request-a');
      expect(staleMatch.matched).assertFalse();
      expect(tracker.currentRequestId()).assertEqual('request-b');

      const activeMatch: AgentHomeWorkspacePreviewRequestMatch = tracker.consume('request-b');
      expect(activeMatch.matched).assertTrue();
      expect(activeMatch.path).assertEqual('entry/src/main/ets/Index.ets');
      expect(tracker.currentRequestId()).assertEqual('');
    });

    it('clearsRequestsThatCouldNotBeSent', 0, () => {
      const tracker = new AgentHomeWorkspacePreviewRequestTracker();
      tracker.track('', 'profile.json');

      expect(tracker.currentRequestId()).assertEqual('');
      expect(tracker.currentPath()).assertEqual('');
      expect(tracker.consume('').matched).assertFalse();
    });
  });
}
