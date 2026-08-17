import { describe, expect, it } from '@ohos/hypium';
import {
  AgentBridgeBrowserHostRecord,
  AgentBridgeBrowserResult
} from '../main/ets/features/agentBridge/AgentBridgeModels';
import {
  AgentHomeBrowserCapabilityPolicy,
  AgentHomeBrowserEventScopeCoordinator,
  AgentHomeBrowserRequestCoordinator,
  AgentHomeBrowserRequestMatch,
  AgentHomeBrowserRequestScope
} from '../main/ets/features/agentHome/AgentHomeBrowserRequestCoordinator';

function browserResult(
  workspaceId: string,
  hostId: string,
  instanceId: string,
  pageId: string
): AgentBridgeBrowserResult {
  const result = new AgentBridgeBrowserResult();
  result.workspaceId = workspaceId;
  result.hostId = hostId;
  result.instance.instanceId = instanceId;
  result.instance.hostId = hostId;
  result.page.pageId = pageId;
  result.page.hostId = hostId;
  result.page.instanceId = instanceId;
  return result;
}

export default function agentHomeBrowserRequestCoordinatorTest(): void {
  describe('AgentHomeBrowserRequestCoordinator', (): void => {
    it('acceptsMatchingRequestScopeAndReturnsAction', 0, (): void => {
      const coordinator = new AgentHomeBrowserRequestCoordinator();
      coordinator.begin(new AgentHomeBrowserRequestScope('request-1', 'browser.page.snapshot', 'workspace-a', 'host-a', 'instance-a', 'page-a'));
      const match: AgentHomeBrowserRequestMatch = coordinator.consume(
        'request-1', browserResult('workspace-a', 'host-a', 'instance-a', 'page-a')
      );
      expect(match.matched).assertTrue();
      expect(match.staleScope).assertFalse();
      expect(match.action).assertEqual('browser.page.snapshot');
      expect(coordinator.pendingCount()).assertEqual(0);
    });

    it('consumesAndRejectsConflictingHostScope', 0, (): void => {
      const coordinator = new AgentHomeBrowserRequestCoordinator();
      coordinator.begin(new AgentHomeBrowserRequestScope('request-2', 'browser.page.action', 'workspace-a', 'host-a', 'instance-a', 'page-a'));
      const match: AgentHomeBrowserRequestMatch = coordinator.consume(
        'request-2', browserResult('workspace-a', 'host-b', 'instance-a', 'page-a')
      );
      expect(match.matched).assertFalse();
      expect(match.staleScope).assertTrue();
      expect(match.action).assertEqual('browser.page.action');
      expect(coordinator.pendingCount()).assertEqual(0);
    });

    it('keepsPendingWhenMultipleLegacyResponsesHaveNoRequestId', 0, (): void => {
      const coordinator = new AgentHomeBrowserRequestCoordinator();
      coordinator.begin(new AgentHomeBrowserRequestScope('request-a', 'browser.host.list', 'workspace-a'));
      coordinator.begin(new AgentHomeBrowserRequestScope('request-b', 'browser.permission.get', 'workspace-a'));
      const match: AgentHomeBrowserRequestMatch = coordinator.consume('', new AgentBridgeBrowserResult());
      expect(match.matched).assertFalse();
      expect(match.staleScope).assertFalse();
      expect(coordinator.pendingCount()).assertEqual(2);
    });

    it('acceptsLegacyResultWhenOptionalScopeFieldsAreMissing', 0, (): void => {
      const coordinator = new AgentHomeBrowserRequestCoordinator();
      coordinator.begin(new AgentHomeBrowserRequestScope('request-legacy', 'browser.page.list', 'workspace-a', 'host-a'));
      const match: AgentHomeBrowserRequestMatch = coordinator.consume('request-legacy', new AgentBridgeBrowserResult());
      expect(match.matched).assertTrue();
      expect(coordinator.pendingCount()).assertEqual(0);
    });

    it('clearDropsAllPendingRequests', 0, (): void => {
      const coordinator = new AgentHomeBrowserRequestCoordinator();
      coordinator.begin(new AgentHomeBrowserRequestScope('request-a', 'browser.host.list', 'workspace-a'));
      coordinator.begin(new AgentHomeBrowserRequestScope('request-b', 'browser.page.list', 'workspace-a'));
      coordinator.clear();
      expect(coordinator.pendingCount()).assertEqual(0);
    });

    it('acceptsOnlyVisibleCurrentWorkspaceLifecycleEvents', 0, (): void => {
      const coordinator = new AgentHomeBrowserEventScopeCoordinator();
      const permission = new AgentBridgeBrowserResult();
      permission.eventKind = 'browser.permission.updated';
      permission.workspaceId = 'workspace-a';
      permission.permission.workspaceId = 'workspace-a';
      expect(coordinator.accepts(permission, true, 'workspace-a', '', '', '')).assertTrue();
      expect(coordinator.accepts(permission, true, 'workspace-b', '', '', '')).assertFalse();
      expect(coordinator.accepts(permission, false, 'workspace-a', '', '', '')).assertFalse();
    });

    it('requiresHostWorkspaceForRegisteredEvents', 0, (): void => {
      const coordinator = new AgentHomeBrowserEventScopeCoordinator();
      const registered = new AgentBridgeBrowserResult();
      registered.eventKind = 'browser.host.registered';
      registered.host.hostId = 'host-a';
      registered.host.workspaceIds.push('workspace-a');
      expect(coordinator.accepts(registered, true, 'workspace-a', '', '', '')).assertTrue();
      expect(coordinator.accepts(registered, true, 'workspace-b', '', '', '')).assertFalse();
      registered.host.workspaceIds = [];
      expect(coordinator.accepts(registered, true, 'workspace-a', '', '', '')).assertFalse();
    });

    it('rejectsStalePageAndUnselectedHostEvents', 0, (): void => {
      const coordinator = new AgentHomeBrowserEventScopeCoordinator();
      const page = browserResult('workspace-a', 'host-a', 'instance-a', 'page-a');
      page.eventKind = 'browser.page.updated';
      expect(coordinator.accepts(page, true, 'workspace-a', 'host-a', 'instance-a', 'page-a')).assertTrue();
      expect(coordinator.accepts(page, true, 'workspace-a', 'host-a', 'instance-a', 'page-b')).assertFalse();
      expect(coordinator.accepts(page, true, 'workspace-a', '', '', '')).assertFalse();

      const unregistered = new AgentBridgeBrowserResult();
      unregistered.eventKind = 'browser.host.unregistered';
      unregistered.hostId = 'host-a';
      expect(coordinator.accepts(unregistered, true, 'workspace-a', 'host-a', '', '')).assertTrue();
      expect(coordinator.accepts(unregistered, true, 'workspace-a', 'host-b', '', '')).assertFalse();
      expect(coordinator.accepts(unregistered, true, 'workspace-a', '', '', '')).assertFalse();
    });

    it('failsClosedForPlatformHostsWithoutVerifiedCapabilities', 0, (): void => {
      const platform = new AgentBridgeBrowserHostRecord();
      platform.hostKind = 'harmonyos';
      platform.capabilitySource = 'platform';
      platform.connected = true;
      platform.readiness = 'ready';
      expect(AgentHomeBrowserCapabilityPolicy.isPlatformHost(platform)).assertTrue();
      expect(AgentHomeBrowserCapabilityPolicy.isReady(platform, false, true)).assertFalse();
      expect(AgentHomeBrowserCapabilityPolicy.isReady(platform, true, false)).assertFalse();
      expect(AgentHomeBrowserCapabilityPolicy.isReady(platform, true, true)).assertTrue();

      const degraded = new AgentBridgeBrowserHostRecord();
      degraded.hostKind = 'harmonyos';
      degraded.capabilitySource = 'platform';
      degraded.connected = true;
      degraded.readiness = 'degraded';
      expect(AgentHomeBrowserCapabilityPolicy.isReady(degraded, true, true)).assertFalse();
    });

    it('keepsLegacyExternalHostCompatibleWhenMetadataIsMissing', 0, (): void => {
      const legacy = new AgentBridgeBrowserHostRecord();
      legacy.hostKind = 'cdp';
      legacy.capabilitySource = 'cdp';
      legacy.connected = true;
      expect(AgentHomeBrowserCapabilityPolicy.isPlatformHost(legacy)).assertFalse();
      expect(AgentHomeBrowserCapabilityPolicy.isReady(legacy, false, false)).assertTrue();
      expect(AgentHomeBrowserCapabilityPolicy.isReady(legacy, true, false)).assertTrue();
      legacy.readiness = 'degraded';
      expect(AgentHomeBrowserCapabilityPolicy.isReady(legacy, true, false)).assertFalse();
    });
  });
}
