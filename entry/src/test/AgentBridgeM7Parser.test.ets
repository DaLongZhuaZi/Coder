import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeIncomingParser,
  AgentBridgeM7Result,
  AgentBridgeServerInfo
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function agentBridgeM7ParserTest() {
  describe('AgentBridgeM7Parser', () => {
    it('parsesScheduleConfigurationAndRunHistory', 0, () => {
      const result: AgentBridgeM7Result = AgentBridgeIncomingParser.parseM7Result(
        '{"payload":{"ok":true,"action":"schedule.history","schedule":{"id":"sch-1","name":"Review","prompt":"Inspect changes","workspaceId":"ws-1","providerId":"codex","enabled":true,"status":"enabled","cadence":{"type":"cron","expression":"0 9 * * *","timezone":"Asia/Hong_Kong"},"concurrency":{"limit":2,"overlapPolicy":"queue"},"retry":{"maxAttempts":3,"initialDelayMs":1000,"backoffMultiplier":2},"retention":{"maxRuns":20,"maxAgeDays":14},"missedRunPolicy":"run_once","nextRunAt":"2026-07-16T01:00:00Z"},"runs":[{"id":"run-1","scheduleId":"sch-1","status":"succeeded","agentId":"agt-1","attempts":[{"attempt":1,"status":"succeeded","startedAt":"2026-07-15T01:00:00Z"}]}],"nextCursor":"cursor-1"}}'
      );
      expect(result.ok).assertTrue();
      expect(result.schedule.id).assertEqual('sch-1');
      expect(result.schedule.cadence.timezone).assertEqual('Asia/Hong_Kong');
      expect(result.schedule.concurrency.limit).assertEqual(2);
      expect(result.schedule.retry.maxAttempts).assertEqual(3);
      expect(result.runs[0].attempts[0].status).assertEqual('succeeded');
      expect(result.nextCursor).assertEqual('cursor-1');
    });

    it('parsesLoopRoundsAndStructuredVerification', 0, () => {
      const result: AgentBridgeM7Result = AgentBridgeIncomingParser.parseM7Result(
        '{"payload":{"ok":true,"action":"loop.get","loop":{"id":"loop-1","name":"Verify","prompt":"Implement","verifyPrompt":"Check","workspaceMode":"isolated","maxRounds":4,"status":"succeeded","terminationReason":"accepted","acceptanceCriteria":[{"id":"tests","description":"Tests pass"}],"budget":{"maxTokens":1000,"maxCost":2,"currency":"USD","maxDurationMs":60000},"usage":{"totalTokens":45,"costByCurrency":{"USD":0.4}},"rounds":[{"round":1,"status":"succeeded","workerAgentId":"worker-1","verification":{"passed":true,"summary":"accepted","checks":[{"criterionId":"tests","passed":true,"evidence":"smoke"}]},"usage":{"worker":{"totalTokens":30,"cost":0.3,"currency":"USD"},"verifier":{"totalTokens":15,"cost":0.1,"currency":"USD"}}}]}}}'
      );
      expect(result.loop.id).assertEqual('loop-1');
      expect(result.loop.acceptanceCriteria[0].id).assertEqual('tests');
      expect(result.loop.budget.currency).assertEqual('USD');
      expect(result.loop.rounds[0].verification.available).assertTrue();
      expect(result.loop.rounds[0].verification.passed).assertTrue();
      expect(result.loop.rounds[0].workerUsage.totalTokens).assertEqual(30);
      expect(result.loop.usage.costByCurrencyJson.length > 0).assertTrue();
    });

    it('parsesChatMembersMessagesDeliveriesAndAck', 0, () => {
      const result: AgentBridgeM7Result = AgentBridgeIncomingParser.parseM7Result(
        '{"payload":{"ok":true,"action":"chat.room.message.list","room":{"id":"room-1","name":"Coordination","sequence":4,"currentRole":"owner","canPost":true,"canManage":true,"members":[{"memberId":"human:owner","type":"human","displayName":"Owner","role":"owner","active":true},{"memberId":"agent:agt-1","type":"agent","agentId":"agt-1","displayName":"Agent","role":"agent","active":true}]},"messages":[{"id":"msg-4","roomId":"room-1","seq":4,"clientMessageId":"client-4","authorMemberId":"human:owner","authorType":"human","body":"Please check","mentionMemberIds":["agent:agt-1"],"deliveries":[{"memberId":"agent:agt-1","agentId":"agt-1","status":"running"}]}],"ack":{"roomId":"room-1","memberId":"human:owner","lastSeq":3},"firstSeq":4,"lastSeq":4,"unreadCount":1}}'
      );
      expect(result.room.members.length).assertEqual(2);
      expect(result.room.canManage).assertTrue();
      expect(result.messages[0].clientMessageId).assertEqual('client-4');
      expect(result.messages[0].mentionMemberIds[0]).assertEqual('agent:agt-1');
      expect(result.messages[0].deliveries[0].status).assertEqual('running');
      expect(result.ack.lastSeq).assertEqual(3);
    });

    it('parsesGitHubAuthLogoutResultAndAccount', 0, () => {
      const result = AgentBridgeIncomingParser.parseGitHubResult(
        '{"ok":true,"action":"github.auth.logout","account":{"id":"gh-account-1","login":"ngf-user"}}'
      );
      expect(result.ok).assertTrue();
      expect(result.action).assertEqual('github.auth.logout');
      expect(result.accountId).assertEqual('gh-account-1');
      expect(result.accountLogin).assertEqual('ngf-user');
    });

    it('keepsMissingM7FieldsAndFeatureFlagsSafe', 0, () => {
      const empty: AgentBridgeM7Result = AgentBridgeIncomingParser.parseM7Result(
        '{"payload":{"ok":false,"action":"loop.get","failureCategory":"loop_not_found"}}'
      );
      const serverInfo: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"features":{"schedules":true,"loops":true,"chat":true}}}'
      );
      expect(empty.loops.length).assertEqual(0);
      expect(empty.loop.id).assertEqual('');
      expect(empty.failureCategory).assertEqual('loop_not_found');
      expect(serverInfo.features.chatRooms).assertFalse();
      expect(serverInfo.features.voice).assertFalse();
    });
  });
}
