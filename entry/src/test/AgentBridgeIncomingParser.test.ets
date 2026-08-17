import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeCheckpointRestoreResult,
  AgentBridgeIncomingParser,
  AgentBridgeProviderDirectoryRemovePayload,
  AgentBridgeProviderDirectoryResult,
  AgentBridgeProviderDirectoryRollbackPayload,
  AgentBridgeParsedMessage,
  AgentBridgeGitActionResult,
  AgentBridgeServerInfo,
  AgentBridgeRichContentNode,
  AgentBridgeMessageQueueItem,
  AgentBridgeUsageEventRecord,
  AgentBridgeDaemonConfigResult,
  AgentBridgeWorkspaceDiffResult,
  AgentBridgeWorkspacePathPayload
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function agentBridgeIncomingParserTest() {
  describe('AgentBridgeIncomingParser', () => {
    it('doesNotTreatAttachmentDownloadPathAsPreviewPath', 0, () => {
      const source = '{"id":"download-1","type":"response","ok":true,"payload":{"sessionId":"session-1","path":"C:/Users/13359/.codex/attachments/image.png","kind":"attachment.preview","token":"attachment-token","downloadPath":"/download/attachment-token","fileName":"image.png","mediaType":"image/png","sizeBytes":128}}';
      const parsed: AgentBridgeParsedMessage = AgentBridgeIncomingParser.parse(source);

      expect(parsed.previewPath).assertEqual('');
      expect(parsed.downloadFilePath).assertEqual('C:/Users/13359/.codex/attachments/image.png');
      expect(parsed.downloadToken).assertEqual('attachment-token');
      expect(parsed.downloadPath).assertEqual('/download/attachment-token');
    });

    it('readsPreviewPathFromNestedPreviewObject', 0, () => {
      const source = '{"id":"preview-1","type":"response","ok":true,"payload":{"preview":{"path":"entry/src/main/ets/Index.ets","mediaType":"text/plain","content":"preview content"}}}';
      const parsed: AgentBridgeParsedMessage = AgentBridgeIncomingParser.parse(source);

      expect(parsed.previewPath).assertEqual('entry/src/main/ets/Index.ets');
      expect(parsed.previewMediaType).assertEqual('text/plain');
      expect(parsed.previewContent).assertEqual('preview content');
    });

    it('parsesLayeredCheckpointRestoreResult', 0, () => {
      const source = '{"checkpoint":{"checkpointId":"checkpoint-1"},"runtimeRestored":true,"layers":{"files":{"requested":true,"status":"restored","restored":true,"reason":"files_restored"},"timeline":{"requested":true,"status":"restored","restored":true,"reason":"timeline_restored_to_checkpoint"},"runtime":{"requested":true,"status":"restored","restored":true,"reason":"runtime_restored"},"terminal":{"requested":false,"status":"not_captured","restored":false,"reason":"terminal_process_state_is_not_checkpointed"}}}';
      const result: AgentBridgeCheckpointRestoreResult = AgentBridgeIncomingParser.parseCheckpointRestoreResult(source);

      expect(result.filesLayer.restored).assertTrue();
      expect(result.timelineLayer.status).assertEqual('restored');
      expect(result.runtimeLayer.restored).assertTrue();
      expect(result.terminalLayer.status).assertEqual('not_captured');
    });

    it('parsesTypedRichContentNodesWithSafeDefaults', 0, () => {
      const source = '[{"id":"code-1","kind":"code","language":"arkts","text":"const value: number = 1;","lineCount":1},{"kind":"file","workspaceId":"workspace-1","path":"entry/src/main/ets/Index.ets","line":12,"truncated":true,"truncationReason":"line_limit"}]';
      const nodes: Array<AgentBridgeRichContentNode> = AgentBridgeIncomingParser.parseRichContentNodes(source);

      expect(nodes.length).assertEqual(2);
      expect(nodes[0].language).assertEqual('arkts');
      expect(nodes[1].workspaceId).assertEqual('workspace-1');
      expect(nodes[1].truncated).assertTrue();
    });

    it('parsesQueueAndUsageExperienceRecords', 0, () => {
      const queueItems: Array<AgentBridgeMessageQueueItem> = AgentBridgeIncomingParser.parseMessageQueueItems(
        '[{"id":"queue-1","sessionId":"s1","clientMessageId":"c1","status":"failed","failureCategory":"provider_busy"}]'
      );
      const usageItems: Array<AgentBridgeUsageEventRecord> = AgentBridgeIncomingParser.parseUsageEvents(
        '[{"eventId":"u1","sessionId":"s1","totalTokens":20,"estimated":true},{"eventId":"u2","kind":"compaction","beforeTokens":100,"afterTokens":40}]'
      );
      expect(queueItems[0].queueId).assertEqual('queue-1');
      expect(queueItems[0].failureCategory).assertEqual('provider_busy');
      expect(usageItems[0].estimated).assertTrue();
      expect(usageItems[1].afterTokens).assertEqual(40);
    });

    it('parsesManagedProviderDirectoryPlansAndPublicState', 0, () => {
      const source = '{"id":"directory-remove","type":"response","payload":{"ok":true,"preview":true,"providerId":"provider-1","profileId":"profile-1","planId":"remove-plan-1","installStatus":"remove_preview","expiresAt":"2026-07-30T12:00:00.000Z","providers":[{"providerId":"provider-1","profileId":"profile-1","activeVersion":"2.0.0","previousVersion":"1.0.0","installStatus":"installed","healthStatus":"healthy"}]}}';
      const result: AgentBridgeProviderDirectoryResult =
        AgentBridgeIncomingParser.parseProviderDirectoryResult(source);
      const removePayload: AgentBridgeProviderDirectoryRemovePayload =
        new AgentBridgeProviderDirectoryRemovePayload('provider-1', 'profile-1', result.planId, true);
      const rollbackPayload: AgentBridgeProviderDirectoryRollbackPayload =
        new AgentBridgeProviderDirectoryRollbackPayload('provider-1', 'rollback-plan-1', true);

      expect(result.planId).assertEqual('remove-plan-1');
      expect(result.expiresAt).assertEqual('2026-07-30T12:00:00.000Z');
      expect(result.providers[0].profileId).assertEqual('profile-1');
      expect(result.providers[0].activeVersion).assertEqual('2.0.0');
      expect(result.providers[0].healthStatus).assertEqual('healthy');
      expect(removePayload.planId).assertEqual('remove-plan-1');
      expect(removePayload.confirm).assertTrue();
      expect(rollbackPayload.planId).assertEqual('rollback-plan-1');
      expect(rollbackPayload.confirm).assertTrue();
    });

    it('parsesGitPreviewPlanRisksAndSnapshot', 0, () => {
      const source = '{"id":"git-preview-1","type":"response","ok":true,"payload":{"ok":true,"action":"merge","preview":true,"confirmed":false,"planId":"plan-1","expiresAt":"2026-07-30T12:02:00.000Z","affectedPaths":["src/a.ts"],"untrackedPaths":["tmp.txt"],"targetRef":"origin/main","remoteName":"origin","ahead":2,"behind":1,"conflictPossible":true,"forceRisk":false,"overwriteRisk":true,"risks":[{"code":"conflict_possible","severity":"high","message":"Review changed paths.","remediation":"Resolve conflicts before confirming."}],"snapshot":{"workspaceId":"workspace-1","head":"abc123","branch":"feature","upstream":"origin/feature","ahead":2,"behind":1,"dirty":true}}}';
      const result: AgentBridgeGitActionResult = AgentBridgeIncomingParser.parseGitActionResult(source);

      expect(result.preview).assertTrue();
      expect(result.confirmed).assertFalse();
      expect(result.planId).assertEqual('plan-1');
      expect(result.expiresAt).assertEqual('2026-07-30T12:02:00.000Z');
      expect(result.affectedPaths[0]).assertEqual('src/a.ts');
      expect(result.untrackedPaths[0]).assertEqual('tmp.txt');
      expect(result.targetRef).assertEqual('origin/main');
      expect(result.conflictPossible).assertTrue();
      expect(result.risks[0].severity).assertEqual('high');
      expect(result.snapshot.branch).assertEqual('feature');
    });

    it('keepsGitPlanDefaultsForLegacyResponse', 0, () => {
      const result: AgentBridgeGitActionResult = AgentBridgeIncomingParser.parseGitActionResult(
        '{"ok":true,"action":"status","command":"git status"}'
      );

      expect(result.preview).assertFalse();
      expect(result.confirmed).assertFalse();
      expect(result.planId).assertEqual('');
      expect(result.expiresAt).assertEqual('');
      expect(result.risks.length).assertEqual(0);
      expect(result.snapshot.workspaceId).assertEqual('');
    });

    it('parsesConfirmedAndStaleGitPlanResults', 0, () => {
      const confirmed: AgentBridgeGitActionResult = AgentBridgeIncomingParser.parseGitActionResult(
        '{"ok":true,"action":"discard","preview":false,"confirmed":true,"planId":"plan-2"}'
      );
      const stale: AgentBridgeGitActionResult = AgentBridgeIncomingParser.parseGitActionResult(
        '{"ok":false,"action":"discard","confirmed":false,"planId":"plan-2","failureCategory":"git_plan_stale","message":"Refresh required."}'
      );

      expect(confirmed.confirmed).assertTrue();
      expect(confirmed.preview).assertFalse();
      expect(confirmed.planId).assertEqual('plan-2');
      expect(stale.ok).assertFalse();
      expect(stale.failureCategory).assertEqual('git_plan_stale');
    });

    it('parsesGitOperationPlanCapabilityWithLegacyDefault', 0, () => {
      const enabled: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"serverId":"bridge-1","features":{"gitAdvanced":true,"gitOperationPlans":true}}}'
      );
      const legacy: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"serverId":"bridge-legacy","features":{"gitAdvanced":true}}}'
      );

      expect(enabled.features.gitOperationPlans).assertTrue();
      expect(legacy.features.gitOperationPlans).assertFalse();
    });

    it('parsesDaemonConfigStatusAndPreviewFieldsWithLegacyDefaults', 0, () => {
      const status: AgentBridgeDaemonConfigResult = AgentBridgeIncomingParser.parseDaemonConfigResult(
        '{"type":"response","payload":{"ok":true,"action":"daemon.config.status","activeVersion":"2.0.0","previousVersion":"1.0.0","fetchedVersion":"2.0.0","manifestDigest":"abc123","degraded":false,"validation":{"ok":true},"sourceUrl":"https://config.example.test/bridge.json","updatedAt":"2026-08-09T01:02:03.000Z"}}'
      );
      const preview: AgentBridgeDaemonConfigResult = AgentBridgeIncomingParser.parseDaemonConfigResult(
        '{"type":"response","payload":{"ok":true,"action":"daemon.config.preview","preview":true,"planId":"plan-1","configVersion":"3.0.0","scope":{"kind":"workspace"},"priority":10,"overriddenFields":["daemon.port"],"requiresRestart":true}}'
      );
      const legacy: AgentBridgeDaemonConfigResult = AgentBridgeIncomingParser.parseDaemonConfigResult(
        '{"ok":true,"action":"daemon.config.status"}'
      );

      expect(status.activeVersion).assertEqual('2.0.0');
      expect(status.previousVersion).assertEqual('1.0.0');
      expect(status.fetchedVersion).assertEqual('2.0.0');
      expect(status.manifestDigest).assertEqual('abc123');
      expect(status.validationOk).assertTrue();
      expect(status.sourceUrl).assertEqual('https://config.example.test/bridge.json');
      expect(status.updatedAt).assertEqual('2026-08-09T01:02:03.000Z');
      expect(preview.preview).assertTrue();
      expect(preview.planId).assertEqual('plan-1');
      expect(preview.scopeKind).assertEqual('workspace');
      expect(preview.priority).assertEqual(10);
      expect(preview.overriddenFieldsJson).assertEqual('["daemon.port"]');
      expect(preview.requiresRestart).assertTrue();
      expect(legacy.activeVersion).assertEqual('');
      expect(legacy.degraded).assertFalse();
      expect(legacy.validationOk).assertFalse();
    });

    it('parsesWorkspaceDiffPaginationAndKeepsLegacyDefaults', 0, () => {
      const paged: AgentBridgeWorkspaceDiffResult = AgentBridgeIncomingParser.parseWorkspaceDiffResult(
        '{"type":"response","payload":{"ok":true,"action":"workspace.diff.get","sessionId":"s1","workspaceId":"w1","path":"src/a.ts","kind":"file","diffText":"@@ -1 +1 @@\\n-old\\n+new","fileCursor":20,"fileLimit":10,"nextFileCursor":30,"lineOffset":200,"lineLimit":200,"nextLineOffset":400,"maxBytes":65536,"truncated":true,"truncationReason":"line_limit","totalFiles":40,"totalLines":900}}'
      );
      const legacy: AgentBridgeWorkspaceDiffResult = AgentBridgeIncomingParser.parseWorkspaceDiffResult(
        '{"ok":true,"path":"src/legacy.ts","diffText":"legacy"}'
      );
      const payload: AgentBridgeWorkspacePathPayload = new AgentBridgeWorkspacePathPayload('s1', 'w1', 'src/a.ts');
      payload.fileCursor = 20;
      payload.fileLimit = 10;
      payload.lineOffset = 200;
      payload.lineLimit = 200;
      payload.maxBytes = 65536;

      expect(paged.ok).assertTrue();
      expect(paged.fileCursor).assertEqual(20);
      expect(paged.nextFileCursor).assertEqual(30);
      expect(paged.lineOffset).assertEqual(200);
      expect(paged.nextLineOffset).assertEqual(400);
      expect(paged.truncated).assertTrue();
      expect(paged.truncationReason).assertEqual('line_limit');
      expect(legacy.fileCursor).assertEqual(0);
      expect(legacy.nextFileCursor).assertEqual(-1);
      expect(legacy.nextLineOffset).assertEqual(-1);
      expect(payload.fileCursor).assertEqual(20);
      expect(payload.fileLimit).assertEqual(10);
      expect(payload.maxBytes).assertEqual(65536);
    });
  });
}
