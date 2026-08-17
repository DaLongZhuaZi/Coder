import { describe, expect, it } from '@ohos/hypium';
import {
  AgentBridgeImportedMessage,
  AgentBridgeMessageQueueItem
} from '../main/ets/features/agentBridge/AgentBridgeModels';
import { AgentHomeChatItem } from '../main/ets/features/agentHome/AgentHomeModels';
import {
  AgentHomeSessionWindowScope,
  AgentHomeSessionWindowStateReducer
} from '../main/ets/features/agentHome/AgentHomeSessionWindowController';

export default function agentHomeSessionWindowControllerTest(): void {
  describe('AgentHomeSessionWindowController', (): void => {
    it('validatesStableNonSecretWindowScope', 0, (): void => {
      const scope = new AgentHomeSessionWindowScope(
        'host-a',
        'workspace-a',
        'agent-a',
        'session-a',
        'window-a'
      );
      const invalid = new AgentHomeSessionWindowScope('host-a', '', '', '', 'window-a');

      expect(scope.isValid()).assertTrue();
      expect(scope.identityKey()).assertEqual('host-a:session-a:window-a');
      expect(invalid.isValid()).assertFalse();
    });

    it('keepsPersistedMessagesInsideTargetSession', 0, (): void => {
      const messages: Array<AgentHomeChatItem> = [];
      messages.push(new AgentHomeChatItem('m-a', 'session-a', 'user', '', 'alpha', '', 1));
      messages.push(new AgentHomeChatItem('m-b', 'session-b', 'assistant', '', 'beta', '', 2));

      const scoped = AgentHomeSessionWindowStateReducer.persistedMessages(messages, 'session-a');

      expect(scoped.length).assertEqual(1);
      expect(scoped[0].id).assertEqual('m-a');
      expect(scoped[0].text).assertEqual('alpha');
    });

    it('normalizesImportedMessagesAndFiltersQueueByBridgeSession', 0, (): void => {
      const imported: Array<AgentBridgeImportedMessage> = [];
      imported.push(new AgentBridgeImportedMessage('', 'remote-a', 'assistant', '', 'reply', 3, '', 'message-a'));
      const queueItems: Array<AgentBridgeMessageQueueItem> = [];
      const accepted = new AgentBridgeMessageQueueItem();
      accepted.queueId = 'queue-a';
      accepted.sessionId = 'remote-a';
      accepted.status = 'queued';
      queueItems.push(accepted);
      const rejected = new AgentBridgeMessageQueueItem();
      rejected.queueId = 'queue-b';
      rejected.sessionId = 'remote-b';
      rejected.status = 'queued';
      queueItems.push(rejected);

      const messages = AgentHomeSessionWindowStateReducer.importedMessages(imported);
      const scopedQueue = AgentHomeSessionWindowStateReducer.queueItems(queueItems, 'remote-a');

      expect(messages.length).assertEqual(1);
      expect(messages[0].id).assertEqual('message-a');
      expect(scopedQueue.length).assertEqual(1);
      expect(scopedQueue[0].queueId).assertEqual('queue-a');
    });
  });
}
