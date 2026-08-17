import { describe, expect, it } from '@ohos/hypium';
import { AgentHomeVoicePlaybackCoordinator } from '../main/ets/features/agentHome/AgentHomeVoicePlaybackCoordinator';

export default function agentHomeVoicePlaybackCoordinatorTest(): void {
  describe('AgentHomeVoicePlaybackCoordinator', (): void => {
    it('acceptsOnlyTheActiveGenerationAndScope', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const generation: number = coordinator.begin('host-a', 4);
      expect(coordinator.isCurrent(generation, 'host-a', 4)).assertTrue();
      expect(coordinator.isCurrent(generation, 'host-b', 4)).assertFalse();
      expect(coordinator.isCurrent(generation, 'host-a', 5)).assertFalse();
    });

    it('invalidatesCallbacksAfterUserInterrupt', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const generation: number = coordinator.begin('host-a', 4);
      coordinator.invalidate();
      expect(coordinator.isCurrent(generation, 'host-a', 4)).assertFalse();
      expect(coordinator.isActive()).assertFalse();
    });

    it('invalidatesOlderGenerationWhenASecondPlaybackBegins', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const first: number = coordinator.begin('host-a', 4);
      const second: number = coordinator.begin('host-a', 4);
      expect(second > first).assertTrue();
      expect(coordinator.isCurrent(first, 'host-a', 4)).assertFalse();
      expect(coordinator.isCurrent(second, 'host-a', 4)).assertTrue();
    });

    it('tracksPendingRequestAndCompletesOnlyTheCurrentPlayback', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const generation: number = coordinator.begin('host-a', 4);
      expect(coordinator.isActive()).assertTrue();
      expect(coordinator.isPlaybackStarted()).assertFalse();
      expect(coordinator.markPlaybackStarted(generation, 'host-a', 4, 'client-request-a')).assertTrue();
      expect(coordinator.isPlaybackStarted()).assertTrue();
      expect(coordinator.currentPlaybackIdentity()).assertEqual('client-request-a');
      expect(coordinator.complete(generation, 'host-b', 4)).assertFalse();
      expect(coordinator.isPlaybackStarted()).assertTrue();
      expect(coordinator.complete(generation, 'host-a', 4)).assertTrue();
      expect(coordinator.isActive()).assertFalse();
      expect(coordinator.isPlaybackStarted()).assertFalse();
      expect(coordinator.isCurrent(generation, 'host-a', 4)).assertFalse();
    });

    it('resetLeavesNoActivePlaybackAfterHostLifecycleChange', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const oldGeneration: number = coordinator.begin('host-a', 4);
      const resetGeneration: number = coordinator.reset('host-b', 5);
      expect(resetGeneration > oldGeneration).assertTrue();
      expect(coordinator.isCurrent(oldGeneration, 'host-a', 4)).assertFalse();
      expect(coordinator.isCurrent(resetGeneration, 'host-b', 5)).assertFalse();
      expect(coordinator.isActive()).assertFalse();
    });

    it('consumesOnlyOneNonEmptyIdentityPerGeneration', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const firstGeneration: number = coordinator.begin('host-a', 4);
      expect(coordinator.markPlaybackStarted(firstGeneration, 'host-a', 4, '')).assertFalse();
      expect(coordinator.markPlaybackStarted(firstGeneration, 'host-a', 4, '   ')).assertFalse();
      expect(coordinator.isPlaybackStarted()).assertFalse();
      expect(coordinator.markPlaybackStarted(firstGeneration, 'host-a', 4, 'client-request-a')).assertTrue();
      expect(coordinator.markPlaybackStarted(firstGeneration, 'host-a', 4, 'client-request-a')).assertFalse();
      expect(coordinator.markPlaybackStarted(firstGeneration, 'host-a', 4, 'tts-request-a')).assertFalse();

      const secondGeneration: number = coordinator.begin('host-a', 4);
      expect(secondGeneration > firstGeneration).assertTrue();
      expect(coordinator.markPlaybackStarted(secondGeneration, 'host-a', 4, 'client-request-a')).assertTrue();
      expect(coordinator.currentPlaybackIdentity()).assertEqual('client-request-a');
    });

    it('doesNotConsumeIdentityFromAnotherHostOrEpoch', 0, (): void => {
      const coordinator = new AgentHomeVoicePlaybackCoordinator();
      const generation: number = coordinator.begin('host-a', 4);
      expect(coordinator.markPlaybackStarted(generation, 'host-b', 4, 'client-request-a')).assertFalse();
      expect(coordinator.markPlaybackStarted(generation, 'host-a', 5, 'client-request-a')).assertFalse();
      expect(coordinator.isPlaybackStarted()).assertFalse();
      expect(coordinator.currentPlaybackIdentity()).assertEqual('');
      expect(coordinator.markPlaybackStarted(generation, 'host-a', 4, 'client-request-a')).assertTrue();
    });
  });
}
