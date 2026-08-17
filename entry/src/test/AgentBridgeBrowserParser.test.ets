import { describe, it, expect } from '@ohos/hypium';
import {
  AgentBridgeBrowserResult,
  AgentBridgeIncomingParser,
  AgentBridgeServerInfo
} from '../main/ets/features/agentBridge/AgentBridgeModels';

export default function agentBridgeBrowserParserTest() {
  describe('AgentBridgeBrowserParser', () => {
    it('parsesHostsPagesSnapshotAndScreenshot', 0, () => {
      const result: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"id":"req-browser-1","payload":{"ok":true,"hostId":"host-1","hosts":[{"hostId":"host-1","label":"Chromium","platform":"windows-cdp","hostKind":"cdp","runtime":"chromium","capabilitySource":"cdp","readiness":"ready","supportedPlatforms":["windows"],"capabilityWarnings":[],"supportedCommands":["page.list","page.snapshot"],"workspaceIds":["wks-1"],"connected":true}],"instances":[{"instanceId":"instance-1","name":"Chromium","engine":"chromium-cdp","connected":true}],"pages":[{"pageId":"page-1","title":"Example","url":"https://example.com","type":"page"}],"page":{"pageId":"page-1","title":"Example","url":"https://example.com"},"snapshot":{"text":"button \\"Continue\\" [ref=@e1]","nodeCount":1},"screenshot":{"mimeType":"image/png","dataBase64":"ZmFrZQ==","bytes":4,"fullPage":true}}}'
      );
      expect(result.requestId).assertEqual('req-browser-1');
      expect(result.ok).assertTrue();
      expect(result.hosts[0].supportedCommands[0]).assertEqual('page.list');
      expect(result.hosts[0].hostKind).assertEqual('cdp');
      expect(result.hosts[0].runtime).assertEqual('chromium');
      expect(result.hosts[0].capabilitySource).assertEqual('cdp');
      expect(result.hosts[0].readiness).assertEqual('ready');
      expect(result.hosts[0].supportedPlatforms[0]).assertEqual('windows');
      expect(result.instances[0].engine).assertEqual('chromium-cdp');
      expect(result.pages[0].pageId).assertEqual('page-1');
      expect(result.snapshotText.indexOf('@e1') >= 0).assertTrue();
      expect(result.screenshot.mimeType).assertEqual('image/png');
      expect(result.screenshot.bytes).assertEqual(4);
      expect(result.screenshot.fullPage).assertTrue();
    });

    it('parsesPermissionPreviewAndSafeDefaults', 0, () => {
      const preview: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"payload":{"ok":true,"preview":true,"confirmed":false,"planId":"plan-1","workspaceId":"wks-1","domains":["example.com"],"permission":{"workspaceId":"wks-1","domains":["example.com"],"downloadDirectoryConfigured":true,"updatedAt":"2026-07-16T00:00:00Z"},"downloadDirectory":"C:/private/workspace/.agent-bridge-downloads","expiresAt":"2026-07-16T00:02:00Z"}}'
      );
      const empty: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult('{"payload":{"failureCategory":"browser_no_host"}}');
      const serverInfo: AgentBridgeServerInfo = AgentBridgeIncomingParser.parseServerInfo(
        '{"serverInfo":{"features":{"browserAutomation":true,"browserHostCapabilityMetadata":true,"browserPlatformHost":false}}}'
      );
      expect(preview.preview).assertTrue();
      expect(preview.planId).assertEqual('plan-1');
      expect(preview.domains[0]).assertEqual('example.com');
      expect(preview.permission.workspaceId).assertEqual('wks-1');
      expect(preview.permission.downloadDirectoryConfigured).assertTrue();
      expect(preview.permission.updatedAt).assertEqual('2026-07-16T00:00:00Z');
      expect(empty.hosts.length).assertEqual(0);
      expect(empty.pages.length).assertEqual(0);
      expect(empty.failureCategory).assertEqual('browser_no_host');
      expect(serverInfo.features.browserAutomation).assertTrue();
      expect(serverInfo.features.browserHostCapabilityMetadata).assertTrue();
      expect(serverInfo.features.browserPlatformHost).assertFalse();
    });

    it('parsesPayloadRequestIdWhenEnvelopeIdIsMissing', 0, () => {
      const result: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"payload":{"ok":true,"requestId":"req-browser-payload","hostId":"host-1"}}'
      );
      expect(result.requestId).assertEqual('req-browser-payload');
      expect(result.hostId).assertEqual('host-1');
    });

    it('parsesLifecycleEventKindAndHostWorkspaceScope', 0, () => {
      const result: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"event":"browser.updated","payload":{"kind":"browser.host.registered","host":{"hostId":"host-event","workspaceIds":["workspace-event"],"connected":true}}}'
      );
      expect(result.eventKind).assertEqual('browser.host.registered');
      expect(result.host.hostId).assertEqual('host-event');
      expect(result.host.workspaceIds[0]).assertEqual('workspace-event');
      expect(result.hosts.length).assertEqual(1);
    });

    it('parsesLifecycleActionsLogsAndDownloads', 0, () => {
      const result: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"payload":{"ok":true,"accepted":true,"applied":true,"hostId":"host-2","target":{"workspaceId":"wks-2","agentId":"agent-2","hostId":"host-2","instanceId":"instance-2","pageId":"page-2","action":"click"},"instance":{"instanceId":"instance-2","hostId":"host-2","name":"Chromium","engine":"chromium-cdp","connected":true},"hosts":[{"hostId":"host-2","label":"CDP","platform":"linux-cdp","hostKind":"cdp","runtime":"chromium","capabilitySource":"cdp","readiness":"degraded","supportedPlatforms":["linux"],"capabilityWarnings":["browser_host_warning"],"supportedCommands":["instance.close","page.action","page.logs","page.wait","download.list"],"supportedActions":["click","upload"],"actionCapabilitiesExplicit":true,"connected":true}],"pages":[{"pageId":"page-2","hostId":"host-2","instanceId":"instance-2","title":"Docs","url":"https://example.com/docs"}],"logs":[{"method":"Log.entryAdded","type":"warning","text":"bounded warning","occurredAt":"2026-08-08T00:00:00Z"}],"downloads":[{"pageId":"page-2","guid":"download-1","state":"completed","suggestedFilename":"report.txt","totalBytes":12,"receivedBytes":12,"updatedAt":"2026-08-08T00:00:01Z"}],"tracking":"cdp-events"}}'
      );
      expect(result.accepted).assertTrue();
      expect(result.applied).assertTrue();
      expect(result.target.workspaceId).assertEqual('wks-2');
      expect(result.target.agentId).assertEqual('agent-2');
      expect(result.target.hostId).assertEqual('host-2');
      expect(result.target.instanceId).assertEqual('instance-2');
      expect(result.target.pageId).assertEqual('page-2');
      expect(result.target.action).assertEqual('click');
      expect(result.instance.hostId).assertEqual('host-2');
      expect(result.hosts[0].supportedActions[0]).assertEqual('click');
      expect(result.hosts[0].actionCapabilitiesExplicit).assertTrue();
      expect(result.hosts[0].readiness).assertEqual('degraded');
      expect(result.hosts[0].capabilityWarnings[0]).assertEqual('browser_host_warning');
      expect(result.pages[0].instanceId).assertEqual('instance-2');
      expect(result.logs[0].text).assertEqual('bounded warning');
      expect(result.downloads[0].receivedBytes).assertEqual(12);
      expect(result.tracking).assertEqual('cdp-events');
    });

    it('keepsSensitiveAndUnknownBrowserFieldsSafe', 0, () => {
      const result: AgentBridgeBrowserResult = AgentBridgeIncomingParser.parseBrowserResult(
        '{"payload":{"ok":false,"failureCategory":"browser_plan_stale","message":"Request a fresh preview.","warnings":["Do not expose internal paths."],"logs":[{"requestId":"req-1","errorText":"network failed","encodedDataLength":0}]}}'
      );
      expect(result.failureCategory).assertEqual('browser_plan_stale');
      expect(result.warnings.length).assertEqual(1);
      expect(result.target.workspaceId).assertEqual('');
      expect(result.target.hostId).assertEqual('');
      expect(result.target.action).assertEqual('');
      expect(result.logs[0].requestId).assertEqual('req-1');
      expect(result.logs[0].encodedDataLength).assertEqual(0);
      expect(result.downloads.length).assertEqual(0);
    });
  });
}
