import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeAgentForkResult,
  AgentBridgeCompatibilityInfo,
  AgentBridgeCompatibilityStatus,
  AgentBridgeProviderUsageAvailabilityState,
  AgentBridgeDiagnosticsReport,
  AgentBridgeExperienceResult,
  AgentBridgeIncomingParser,
  AgentBridgeParsedMessage,
  AgentBridgeRichContentNode,
  AgentBridgeServerInfo,
  AgentBridgeUsageBudgetRecord,
  AgentBridgeUsageEventRecord,
  AgentBridgeUsageSummaryRecord,
  AgentBridgeProviderUsageResult
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function agentBridgeM5ParserTest() {
  describe('AgentBridgeM5Parser', () => {
    it('normalizesCompatibilityToAuthoritativeKnownStates', 0, () => {
      const compatible: AgentBridgeCompatibilityInfo = AgentBridgeIncomingParser.parseCompatibilityInfo(
        '{"status":"compatible","blocking":false,"minimumAppVersion":"1.0.0"}'
      );
      const unsupported: AgentBridgeCompatibilityInfo = AgentBridgeIncomingParser.parseCompatibilityInfo(
        '{"status":"execute_remote_command","blocking":true}'
      );
      const appTooOld: AgentBridgeCompatibilityInfo = AgentBridgeIncomingParser.parseCompatibilityInfo(
        '{"status":"appTooOld","blocking":true,"reason":"upgrade required"}'
      );
      const recommended: AgentBridgeCompatibilityInfo = AgentBridgeIncomingParser.parseCompatibilityInfo(
        '{"status":"upgradeRecommended","blocking":true}'
      );
      expect(compatible.status).assertEqual(AgentBridgeCompatibilityStatus.COMPATIBLE);
      expect(unsupported.status).assertEqual(AgentBridgeCompatibilityStatus.UNKNOWN);
      expect(unsupported.blocking).assertFalse();
      expect(appTooOld.blocking).assertTrue();
      expect(recommended.blocking).assertFalse();
    });

    it('preservesCompatibilityProtocolSummary', 0, () => {
      const info: AgentBridgeCompatibilityInfo = AgentBridgeIncomingParser.parseCompatibilityInfo(
        '{"status":"upgradeRecommended","blocking":false,"minimumProtocolVersion":"1","recommendedProtocolVersion":"2","supportedProtocolVersions":["1","2"]}'
      );
      expect(info.minimumProtocolVersion).assertEqual('1');
      expect(info.recommendedProtocolVersion).assertEqual('2');
      expect(info.supportedProtocolVersions.length).assertEqual(2);
      expect(info.supportedProtocolVersions[1]).assertEqual('2');

      const server: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"serverId":"bridge-1","version":"0.1.4","protocolVersion":"2","supportedProtocolVersions":["1","2"],"compatibility":{"status":"compatible"}}}'
      );
      expect(server.supportedProtocolVersions.length).assertEqual(2);
      expect(server.compatibility.supportedProtocolVersions[0]).assertEqual('1');
    });

    it('parsesVersionedDiagnosticsFromFullResponse', 0, () => {
      const report: AgentBridgeDiagnosticsReport = AgentBridgeIncomingParser.parseDiagnosticsReport(
        '{"ok":true,"report":{"schemaVersion":1,"format":"text","generatedAt":"2026-07-14T01:02:03.000Z","truncated":true,"groups":[{"id":"queue","status":"warning","checks":[{"id":"message_queue_state","status":"warning","message":"2 failed","actionId":"review_message_queue"}]}],"text":"Agent Bridge diagnostics"}}'
      );
      expect(report.schemaVersion).assertEqual(1);
      expect(report.format).assertEqual('text');
      expect(report.truncated).assertTrue();
      expect(report.groups.length).assertEqual(1);
      expect(report.groups[0].checks[0].actionId).assertEqual('review_message_queue');
      expect(report.generatedAt).assertEqual('2026-07-14T01:02:03.000Z');
    });

    it('keepsMissingUsageNumbersUnavailableAndNormalizesDates', 0, () => {
      const events: Array<AgentBridgeUsageEventRecord> = AgentBridgeIncomingParser.parseUsageEvents(
        '[{"eventId":"u1","hostProfileId":"host-a","sessionId":"s1","providerId":"codex","inputTokens":10,"occurredAt":1710000000000},{"eventId":"u2","kind":"compaction","beforeTokens":100,"afterTokens":40,"occurredAt":"2026-07-14T01:02:03Z"}]'
      );
      expect(events[0].hostProfileId).assertEqual('host-a');
      expect(events[0].outputTokens).assertEqual(-1);
      expect(events[0].cost).assertEqual(-1);
      expect(events[0].occurredAt.length > 0).assertTrue();
      expect(events[1].occurredAt).assertEqual('2026-07-14T01:02:03.000Z');
    });

    it('preservesSafeQuotaWindowsInUsageEvents', 0, () => {
      const events: Array<AgentBridgeUsageEventRecord> = AgentBridgeIncomingParser.parseUsageEvents(
        '[{"eventId":"quota-hour","kind":"quota","window":"hour","quotaRemaining":90,"quotaLimit":100},' +
        '{"eventId":"quota-rolling","quotaSource":"provider-api","window":"rolling-7d","quotaRemaining":7},' +
        '{"eventId":"turn-custom","kind":"turn","window":"rolling-7d","inputTokens":4},' +
        '{"eventId":"quota-unsafe","kind":"quota","window":"../secret","quotaLimit":100}]'
      );
      expect(events[0].window).assertEqual('hour');
      expect(events[1].window).assertEqual('rolling-7d');
      expect(events[2].window).assertEqual('');
      expect(events[3].window).assertEqual('');
    });

    it('parsesActualEstimatedMulticurrencyQuotaAndCompactionSummary', 0, () => {
      const summary: AgentBridgeUsageSummaryRecord = AgentBridgeIncomingParser.parseUsageSummary(
        '{"eventCount":3,"actual":{"eventCount":2,"tokens":{"inputTokens":10,"outputTokens":5,"totalTokens":15},"costs":[{"currency":"USD","amount":0.1},{"currency":"CNY","amount":0.7}]},"estimated":{"eventCount":1,"tokens":{"totalTokens":4},"costs":[{"currency":"USD","amount":0.02}]},"costs":{"actual":[{"currency":"USD","amount":0.1},{"currency":"CNY","amount":0.7}],"estimated":[{"currency":"USD","amount":0.02}]},"quotas":[{"providerId":"codex","source":"provider","window":"day","remaining":900,"limit":1000,"resetAt":"2026-07-15T00:00:00Z"}],"compactions":1,"compactionEvents":[{"eventId":"c1","beforeTokens":100,"afterTokens":40,"occurredAt":"2026-07-14T01:00:00Z"}],"window":"day","windowStartAt":"2026-07-14T00:00:00Z","windowEndAt":"2026-07-15T00:00:00Z"}'
      );
      expect(summary.actual.tokens.totalTokens).assertEqual(15);
      expect(summary.actual.tokens.cacheReadTokens).assertEqual(-1);
      expect(summary.actualCosts.length).assertEqual(2);
      expect(summary.estimatedCosts[0].amount).assertEqual(0.02);
      expect(summary.quotas[0].remaining).assertEqual(900);
      expect(summary.quotas[0].window).assertEqual('day');
      expect(summary.compactionEvents[0].afterTokens).assertEqual(40);
      expect(summary.window).assertEqual('day');
    });

    it('preservesSafeProviderQuotaWindowsAndRejectsUnsafeNames', 0, () => {
      const longWindow: string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const summary: AgentBridgeUsageSummaryRecord = AgentBridgeIncomingParser.parseUsageSummary(
        '{"quotas":[{"window":"hour"},{"window":"rolling-7d"},{"window":"../secret"},{"window":"one\\two"},{"window":"' +
        longWindow +
        '"},{"window":"bad\\u0001name"}]}'
      );
      expect(summary.quotas.length).assertEqual(6);
      expect(summary.quotas[0].window).assertEqual('hour');
      expect(summary.quotas[1].window).assertEqual('rolling-7d');
      expect(summary.quotas[2].window).assertEqual('');
      expect(summary.quotas[3].window).assertEqual('');
      expect(summary.quotas[4].window).assertEqual('');
      expect(summary.quotas[5].window).assertEqual('');
    });

    it('keepsUsageCostsUnavailableWithoutCurrencyAndNormalizesCurrency', 0, () => {
      const summary: AgentBridgeUsageSummaryRecord = AgentBridgeIncomingParser.parseUsageSummary(
        '{"actual":{"costs":[{"currency":" usd ","amount":1.25},{"amount":9.99},{"currency":"","amount":4}]},"estimated":{"costs":[{"currency":" cny ","amount":2}]}}'
      );
      expect(summary.actualCosts.length).assertEqual(1);
      expect(summary.actualCosts[0].currency).assertEqual('USD');
      expect(summary.actualCosts[0].amount).assertEqual(1.25);
      expect(summary.estimatedCosts.length).assertEqual(1);
      expect(summary.estimatedCosts[0].currency).assertEqual('CNY');

      const event: AgentBridgeUsageEventRecord = AgentBridgeIncomingParser.parseUsageEvent(
        '{"usage":{"currency":" eur ","cost":0.5}}'
      );
      expect(event.currency).assertEqual('EUR');

      const budget: AgentBridgeUsageBudgetRecord = AgentBridgeIncomingParser.parseUsageBudget(
        '{"budget":{"currency":" gbp ","costLimit":4}}'
      );
      expect(budget.currency).assertEqual('GBP');

      const unavailableCurrencyBudget: AgentBridgeUsageBudgetRecord = AgentBridgeIncomingParser.parseUsageBudget(
        '{"budget":{"costLimit":4}}'
      );
      expect(unavailableCurrencyBudget.currency).assertEqual('');
    });

    it('parsesProviderUsageScopeAndWindows', 0, () => {
      const result: AgentBridgeExperienceResult = AgentBridgeIncomingParser.parseExperienceResult(
        '{"payload":{"ok":true,"action":"provider.usage.list","providerId":"codex","hostProfileId":"host-a","sessionId":"s1","agentId":"a1","window":"day","status":"available","planLabel":"Pro","source":"codex-api","fetchedAt":"2026-08-07T01:00:00Z","expiresAt":"2026-08-07T02:00:00Z","stale":true,"windows":[{"name":"session","label":"Session","status":"available","unit":"credits","remaining":90,"limit":100,"used":10,"resetAt":"2026-08-08T00:00:00Z"}],"details":[{"key":"account","label":"Account","value":"workspace-user","status":"info"}]}}'
      );
      const usage: AgentBridgeProviderUsageResult = result.providerUsage;
      expect(result.action).assertEqual('provider.usage.list');
      expect(usage.providerId).assertEqual('codex');
      expect(usage.hostProfileId).assertEqual('host-a');
      expect(usage.sessionId).assertEqual('s1');
      expect(usage.agentId).assertEqual('a1');
      expect(usage.window).assertEqual('day');
      expect(usage.planLabel).assertEqual('Pro');
      expect(usage.stale).assertTrue();
      expect(usage.windows.length).assertEqual(1);
      expect(usage.windows[0].remaining).assertEqual(90);
      expect(usage.windows[0].resetAt).assertEqual('2026-08-08T00:00:00.000Z');
      expect(usage.details.length).assertEqual(1);
      expect(usage.details[0].key).assertEqual('account');
      expect(usage.details[0].label).assertEqual('Account');
      expect(usage.details[0].value).assertEqual('workspace-user');
    });

    it('keepsProviderUsageUnavailableFieldsSafe', 0, () => {
      const usage: AgentBridgeProviderUsageResult = AgentBridgeIncomingParser.parseProviderUsageResult(
        '{"ok":false,"action":"provider.usage.list","providerId":"codex","failureCategory":"capability_unavailable","message":"No usage endpoint"}'
      );
      expect(usage.ok).assertFalse();
      expect(usage.status).assertEqual('unavailable');
      expect(usage.failureCategory).assertEqual('capability_unavailable');
      expect(usage.windows.length).assertEqual(0);
      expect(usage.planLabel).assertEqual('');
      expect(usage.availabilityState).assertEqual(AgentBridgeProviderUsageAvailabilityState.UNSUPPORTED);
    });

    it('parsesProviderUsageAvailabilityStatesAndLegacyFallbacks', 0, () => {
      const empty: AgentBridgeProviderUsageResult = AgentBridgeIncomingParser.parseProviderUsageResult(
        '{"ok":true,"action":"provider.usage.list","status":"available","availabilityState":"available-empty"}'
      );
      expect(empty.ok).assertTrue();
      expect(empty.availabilityState).assertEqual(AgentBridgeProviderUsageAvailabilityState.AVAILABLE_EMPTY);

      const failed: AgentBridgeProviderUsageResult = AgentBridgeIncomingParser.parseProviderUsageResult(
        '{"ok":false,"action":"provider.usage.list","status":"unavailable","failureCategory":"timeout"}'
      );
      expect(failed.availabilityState).assertEqual(AgentBridgeProviderUsageAvailabilityState.FAILED);

      const stale: AgentBridgeProviderUsageResult = AgentBridgeIncomingParser.parseProviderUsageResult(
        '{"ok":true,"action":"provider.usage.list","status":"available","stale":true,"windows":[{"name":"day","remaining":1}]}'
      );
      expect(stale.availabilityState).assertEqual(AgentBridgeProviderUsageAvailabilityState.STALE);

      const legacyEmpty: AgentBridgeProviderUsageResult = AgentBridgeIncomingParser.parseProviderUsageResult(
        '{"ok":true,"action":"provider.usage.list","status":"available"}'
      );
      expect(legacyEmpty.availabilityState).assertEqual(AgentBridgeProviderUsageAvailabilityState.AVAILABLE_EMPTY);
    });

    it('parsesScopedBudgetAndThresholdWarning', 0, () => {
      const result: AgentBridgeExperienceResult = AgentBridgeIncomingParser.parseExperienceResult(
        '{"payload":{"ok":true,"action":"usage.budget.set","hostProfileId":"host-a","sessionId":"s1","window":"month","budget":{"scopeKey":"scope-a","hostProfileId":"host-a","sessionId":"s1","scopeType":"session","window":"month","tokenLimit":1000,"currency":"USD","warningThreshold":0.8,"updatedAt":"2026-07-14T01:00:00Z"},"warnings":[{"action":"usage.budget.warning","hostProfileId":"host-a","sessionId":"s1","window":"month","warningThreshold":0.8,"reasons":["token"],"actualTokens":850,"emittedAt":"2026-07-14T01:01:00Z","budget":{"hostProfileId":"host-a","sessionId":"s1","window":"month","tokenLimit":1000,"warningThreshold":0.8}}]}}'
      );
      const budget: AgentBridgeUsageBudgetRecord = result.budget;
      expect(budget.isSet).assertTrue();
      expect(budget.hostProfileId).assertEqual('host-a');
      expect(budget.warningThreshold).assertEqual(0.8);
      expect(result.budgetWarnings.length).assertEqual(1);
      expect(result.budgetWarnings[0].actualTokens).assertEqual(850);
      expect(result.budgetWarnings[0].reasons[0]).assertEqual('token');
    });

    it('parsesBudgetWarningEventPayloadDirectly', 0, () => {
      const result: AgentBridgeExperienceResult = AgentBridgeIncomingParser.parseExperienceResult(
        '{"type":"event","event":"usage.budget.warning","payload":{"action":"usage.budget.warning","hostProfileId":"host-a","sessionId":"s1","window":"day","warningThreshold":0.9,"reasons":["cost"],"currency":"USD","actualCost":3.5,"emittedAt":"2026-07-14T02:00:00Z","budget":{"hostProfileId":"host-a","sessionId":"s1","window":"day","costLimit":4,"currency":"USD","warningThreshold":0.9}}}'
      );
      expect(result.budgetWarnings.length).assertEqual(1);
      expect(result.budgetWarnings[0].actualTokens).assertEqual(-1);
      expect(result.budgetWarnings[0].actualCost).assertEqual(3.5);
      expect(result.budgetWarnings[0].budget.costLimit).assertEqual(4);
    });

    it('parsesSingleQueueAndUsageUpdatePayloads', 0, () => {
      const queue: AgentBridgeExperienceResult = AgentBridgeIncomingParser.parseExperienceResult(
        '{"type":"event","event":"message.queue.updated","payload":{"item":{"queueId":"q1","hostProfileId":"host-a","sessionId":"s1","agentId":"a1","clientMessageId":"c1","status":"queued","attempts":2,"attemptId":"attempt-2","attemptHistory":[{"attemptId":"attempt-1","attemptNumber":1,"status":"failed","failureCategory":"provider_error","completedAt":"2026-07-14T01:59:00Z"},{"attemptId":"attempt-2","attemptNumber":2,"status":"queued","retryOfAttemptId":"attempt-1"}],"createdAt":"2026-07-14T01:59:00Z","updatedAt":"2026-07-14T02:00:00Z"}}}'
      );
      const usage: AgentBridgeExperienceResult = AgentBridgeIncomingParser.parseExperienceResult(
        '{"type":"event","event":"usage.updated","payload":{"usage":{"eventId":"u1","hostProfileId":"host-a","sessionId":"s1","totalTokens":8,"estimated":false,"occurredAt":"2026-07-14T02:00:00Z"}}}'
      );
      expect(queue.queueItem.queueId).assertEqual('q1');
      expect(queue.queueItem.status).assertEqual('queued');
      expect(queue.queueItem.hostProfileId).assertEqual('host-a');
      expect(queue.queueItem.attempts).assertEqual(2);
      expect(queue.queueItem.attemptId).assertEqual('attempt-2');
      expect(queue.queueItem.attemptHistory.length).assertEqual(2);
      expect(queue.queueItem.attemptHistory[0].status).assertEqual('failed');
      expect(queue.queueItem.attemptHistory[1].retryOfAttemptId).assertEqual('attempt-1');
      expect(queue.queueItem.updatedAt).assertEqual('2026-07-14T02:00:00.000Z');
      expect(usage.usageEvent.eventId).assertEqual('u1');
      expect(usage.usageEvent.totalTokens).assertEqual(8);
      expect(usage.usageEvent.outputTokens).assertEqual(-1);
    });

    it('parsesMessageForkBoundaryPreviewAsTypedResult', 0, () => {
      const result: AgentBridgeAgentForkResult = AgentBridgeIncomingParser.parseAgentForkResult(
        '{"payload":{"ok":true,"preview":true,"confirmed":false,"forkPlanId":"fkp-1","workspaceMode":"isolated","boundaryMessageId":"m1","boundaryCursor":"18","timelineEpoch":2,"timelineSeq":18,"contextItemCount":7,"contextDigest":"sha256:abc","warnings":["tool_summary_redacted"]}}'
      );
      expect(result.preview).assertTrue();
      expect(result.workspaceMode).assertEqual('isolated');
      expect(result.timelineEpoch).assertEqual(2);
      expect(result.timelineSeq).assertEqual(18);
      expect(result.contextItemCount).assertEqual(7);
      expect(result.warnings[0]).assertEqual('tool_summary_redacted');
    });

    it('downgradesUnknownRichNodesToFallback', 0, () => {
      const nodes: Array<AgentBridgeRichContentNode> = AgentBridgeIncomingParser.parseRichContentNodes(
        '{"contentNodes":[{"kind":"remote_command","text":"unsafe"},{"kind":"todo","todoId":"todo-1","status":"pending"},{"kind":"code","language":"arkts","tokenized":true,"tokens":[{"kind":"keyword","text":"const"},{"kind":"whitespace","text":" "}]},{"kind":"file","workspaceId":"w1","path":"../secret.txt"},{"kind":"link","url":"javascript:alert(1)"}]}'
      );
      expect(nodes.length).assertEqual(5);
      expect(nodes[0].kind).assertEqual('fallback');
      expect(nodes[1].kind).assertEqual('todo');
      expect(nodes[1].todoId).assertEqual('todo-1');
      expect(nodes[2].tokenized).assertTrue();
      expect(nodes[2].tokens[0].kind).assertEqual('keyword');
      expect(nodes[3].kind).assertEqual('fallback');
      expect(nodes[3].path).assertEqual('');
      expect(nodes[4].kind).assertEqual('fallback');
      expect(nodes[4].url).assertEqual('');
    });

    it('exposesDurableCompletionCursorWithoutApplyingDeltaAst', 0, () => {
      const parsed: AgentBridgeParsedMessage = AgentBridgeIncomingParser.parse(
        '{"type":"event","event":"message.completed","sessionId":"s1","payload":{"messageId":"m1","text":"done","timelineEpoch":4,"timelineSeq":27,"durableMessageId":true,"contentNodes":[{"kind":"text","text":"done"}]}}'
      );
      expect(parsed.messageId).assertEqual('m1');
      expect(parsed.timelineEpoch).assertEqual(4);
      expect(parsed.timelineSeq).assertEqual(27);
      expect(parsed.durableMessageId).assertTrue();
      expect(parsed.contentNodesJson.length > 0).assertTrue();
    });

    it('parsesProviderCapabilityFlagsWithoutChangingLegacyDefaults', 0, () => {
      const providerText: string = '{"providers":[{"id":"codex","displayName":"Codex","capabilities":{"usageEvents":true,"metadataGeneration":true},"sessionFeatures":{"attach":true}}]}';
      const providers = AgentBridgeIncomingParser.parseProviders(providerText);
      expect(providers.length).assertEqual(1);
      expect(providers[0].supportsUsageEvents).assertTrue();
      expect(providers[0].usageEventsCapabilityKnown).assertTrue();
      expect(providers[0].supportsMetadataGeneration).assertTrue();
      expect(providers[0].metadataGenerationCapabilityKnown).assertTrue();
      const explicitFalseProviders = AgentBridgeIncomingParser.parseProviders(
        '{"providers":[{"id":"codex","capabilities":{"metadataGeneration":false,"usageEvents":false}}]}'
      );
      expect(explicitFalseProviders.length).assertEqual(1);
      expect(explicitFalseProviders[0].supportsMetadataGeneration).assertFalse();
      expect(explicitFalseProviders[0].metadataGenerationCapabilityKnown).assertTrue();
      expect(explicitFalseProviders[0].supportsUsageEvents).assertFalse();
      expect(explicitFalseProviders[0].usageEventsCapabilityKnown).assertTrue();
      const legacyProviders = AgentBridgeIncomingParser.parseProviders('{"providers":[{"id":"legacy"}]}');
      expect(legacyProviders.length).assertEqual(1);
      expect(legacyProviders[0].supportsUsageEvents).assertFalse();
      expect(legacyProviders[0].usageEventsCapabilityKnown).assertFalse();
      expect(legacyProviders[0].supportsMetadataGeneration).assertFalse();
      expect(legacyProviders[0].metadataGenerationCapabilityKnown).assertFalse();
      expect(legacyProviders[0].supportsProviderUsage).assertFalse();
      expect(legacyProviders[0].providerUsageCapabilityKnown).assertFalse();
    });

    it('gatesProviderUsageOnlyWhenTheDescriptorPublishesAnExplicitCapability', 0, () => {
      const providers = AgentBridgeIncomingParser.parseProviders(
        '{"providers":[{"id":"codex","capabilities":{"providerUsage":true}},{"id":"custom","capabilities":{"providerUsage":false}}]}'
      );
      expect(providers.length).assertEqual(2);
      expect(providers[0].supportsProviderUsage).assertTrue();
      expect(providers[0].providerUsageCapabilityKnown).assertTrue();
      expect(providers[1].supportsProviderUsage).assertFalse();
      expect(providers[1].providerUsageCapabilityKnown).assertTrue();
    });
  });
}
