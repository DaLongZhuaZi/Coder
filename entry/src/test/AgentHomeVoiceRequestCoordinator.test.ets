import { describe, expect, it } from '@ohos/hypium';
import { AgentBridgeEventType, AgentBridgeRequestType, AgentBridgeVoiceResult } from '../main/ets/features/agentBridge/AgentBridgeModels';
import { AgentHomeVoiceRequestCoordinator, AgentHomeVoiceRequestMatch } from '../main/ets/features/agentHome/AgentHomeVoiceRequestCoordinator';

function result(action: string, sessionId: string, ok: boolean = true): AgentBridgeVoiceResult {
  const item = new AgentBridgeVoiceResult();
  item.action = action;
  item.sessionId = sessionId;
  item.ok = ok;
  return item;
}

export default function agentHomeVoiceRequestCoordinatorTest(): void {
  describe('AgentHomeVoiceRequestCoordinator', (): void => {
    it('acceptsMatchingStartAndBindsSession', 0, (): void => {
      const coordinator = new AgentHomeVoiceRequestCoordinator();
      coordinator.reset('host-a', 4);
      coordinator.beginRemoteStart('req-start', 'host-a', 4);
      const match: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeRequestType.VOICE_SESSION_START, 'voice-a'), 'req-start', true, 'host-a', 4
      );
      expect(match.accepted).assertTrue();
      expect(match.stale).assertFalse();
      expect(coordinator.currentSessionId()).assertEqual('voice-a');
    });

    it('rejectsOldStartAfterCancel', 0, (): void => {
      const coordinator = new AgentHomeVoiceRequestCoordinator();
      coordinator.reset('host-a', 4);
      coordinator.beginRemoteStart('req-start', 'host-a', 4);
      coordinator.beginRemoteCancel('req-cancel', '');
      const match: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeRequestType.VOICE_SESSION_START, 'voice-old'), '', false, 'host-a', 4
      );
      expect(match.accepted).assertFalse();
      expect(match.stale).assertTrue();
    });

    it('rejectsForeignSessionEvents', 0, (): void => {
      const coordinator = new AgentHomeVoiceRequestCoordinator();
      coordinator.reset('host-a', 4);
      coordinator.beginRemoteStart('req-start', 'host-a', 4);
      coordinator.accept(result(AgentBridgeRequestType.VOICE_SESSION_START, 'voice-a'), 'req-start', true, 'host-a', 4);
      const match: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeEventType.VOICE_TRANSCRIPT_PARTIAL, 'voice-b'), '', false, 'host-a', 4
      );
      expect(match.accepted).assertFalse();
      expect(match.stale).assertTrue();
    });

    it('rejectsFinishResponseFromAnotherRequest', 0, (): void => {
      const coordinator = new AgentHomeVoiceRequestCoordinator();
      coordinator.reset('host-a', 4);
      coordinator.beginRemoteStart('req-start', 'host-a', 4);
      coordinator.accept(result(AgentBridgeRequestType.VOICE_SESSION_START, 'voice-a'), 'req-start', true, 'host-a', 4);
      coordinator.beginRemoteFinish('req-finish', 'voice-a');
      const match: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeRequestType.VOICE_SESSION_FINISH, 'voice-a'), 'req-old', true, 'host-a', 4
      );
      expect(match.accepted).assertFalse();
      expect(match.stale).assertTrue();
    });

    it('rejectsOldHostEpochAndClearsOnCompletion', 0, (): void => {
      const coordinator = new AgentHomeVoiceRequestCoordinator();
      coordinator.reset('host-a', 4);
      coordinator.beginRemoteStart('req-start', 'host-a', 4);
      const stale: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeRequestType.VOICE_SESSION_START, 'voice-a'), 'req-start', true, 'host-a', 5
      );
      expect(stale.accepted).assertFalse();
      expect(stale.stale).assertTrue();
      coordinator.completeRemoteSession();
      expect(coordinator.currentSessionId()).assertEqual('');
      const late: AgentHomeVoiceRequestMatch = coordinator.accept(
        result(AgentBridgeEventType.VOICE_TRANSCRIPT_FINAL, 'voice-a'), '', false, 'host-a', 4
      );
      expect(late.accepted).assertFalse();
    });
  });
}
