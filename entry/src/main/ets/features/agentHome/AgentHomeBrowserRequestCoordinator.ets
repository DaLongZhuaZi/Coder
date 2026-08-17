import {
  AgentBridgeBrowserHostRecord,
  AgentBridgeBrowserResult
} from '../agentBridge/AgentBridgeModels';

/**
 * Keeps platform Browser hosts fail-closed while preserving legacy external
 * host behavior when an older Bridge has no capability metadata.
 */
export class AgentHomeBrowserCapabilityPolicy {
  static isPlatformHost(host: AgentBridgeBrowserHostRecord): boolean {
    const hostKind: string = host.hostKind.trim().toLowerCase();
    const capabilitySource: string = host.capabilitySource.trim().toLowerCase();
    return hostKind === 'harmonyos' || capabilitySource === 'platform';
  }

  static requiresVerifiedCapability(host: AgentBridgeBrowserHostRecord): boolean {
    return AgentHomeBrowserCapabilityPolicy.isPlatformHost(host);
  }

  static isReady(
    host: AgentBridgeBrowserHostRecord,
    capabilityMetadataEnabled: boolean,
    platformHostEnabled: boolean
  ): boolean {
    if (!host.connected) return false;
    if (AgentHomeBrowserCapabilityPolicy.isPlatformHost(host)) {
      if (!capabilityMetadataEnabled || !platformHostEnabled) return false;
      return host.readiness === 'ready';
    }
    if (!capabilityMetadataEnabled || host.readiness.length === 0) return true;
    return host.readiness === 'ready';
  }
}

export class AgentHomeBrowserRequestScope {
  requestId: string;
  action: string;
  workspaceId: string;
  hostId: string;
  instanceId: string;
  pageId: string;

  constructor(
    requestId: string,
    action: string,
    workspaceId: string,
    hostId: string = '',
    instanceId: string = '',
    pageId: string = ''
  ) {
    this.requestId = requestId;
    this.action = action;
    this.workspaceId = workspaceId;
    this.hostId = hostId;
    this.instanceId = instanceId;
    this.pageId = pageId;
  }
}

export class AgentHomeBrowserRequestMatch {
  matched: boolean;
  staleScope: boolean;
  action: string;
  requestId: string;

  constructor(
    matched: boolean = false,
    staleScope: boolean = false,
    action: string = '',
    requestId: string = ''
  ) {
    this.matched = matched;
    this.staleScope = staleScope;
    this.action = action;
    this.requestId = requestId;
  }
}

/**
 * Applies the same fail-closed scope rules to unsolicited Browser lifecycle
 * events that request responses already use. Events are accepted only while
 * the page is visible and only when their explicit workspace/host/page scope
 * belongs to the currently displayed Browser surface.
 */
export class AgentHomeBrowserEventScopeCoordinator {
  accepts(
    result: AgentBridgeBrowserResult,
    pageVisible: boolean,
    currentWorkspaceId: string,
    selectedHostId: string,
    selectedInstanceId: string,
    selectedPageId: string
  ): boolean {
    if (!pageVisible || currentWorkspaceId.length === 0) {
      return false;
    }
    if (result.eventKind === 'browser.host.unregistered') {
      return selectedHostId.length > 0 && result.hostId.length > 0 && result.hostId === selectedHostId;
    }
    if (result.eventKind === 'browser.host.registered') {
      return this.matchesWorkspace(result, currentWorkspaceId, true) && result.host.hostId.length > 0;
    }
    if (!this.matchesWorkspace(result, currentWorkspaceId, false)) {
      return false;
    }
    if (!this.matchesHost(result, selectedHostId)) {
      return false;
    }
    if (!this.matchesInstance(result, selectedInstanceId)) {
      return false;
    }
    if (!this.matchesPage(result, selectedPageId)) {
      return false;
    }
    return this.hasExplicitScope(result);
  }

  private matchesWorkspace(
    result: AgentBridgeBrowserResult,
    currentWorkspaceId: string,
    requireWorkspace: boolean
  ): boolean {
    let hasScope = false;
    let matches = false;
    if (result.workspaceId.length > 0) {
      hasScope = true;
      if (result.workspaceId !== currentWorkspaceId) return false;
      matches = true;
    }
    if (result.permission.workspaceId.length > 0) {
      hasScope = true;
      if (result.permission.workspaceId !== currentWorkspaceId) return false;
      matches = true;
    }
    if (result.target.workspaceId.length > 0) {
      hasScope = true;
      if (result.target.workspaceId !== currentWorkspaceId) return false;
      matches = true;
    }
    for (let index = 0; index < result.hosts.length; index++) {
      const workspaceIds: Array<string> = result.hosts[index].workspaceIds;
      if (workspaceIds.length === 0) continue;
      hasScope = true;
      if (workspaceIds.includes(currentWorkspaceId)) matches = true;
    }
    if (result.host.workspaceIds.length > 0) {
      hasScope = true;
      if (result.host.workspaceIds.includes(currentWorkspaceId)) matches = true;
    }
    if (!hasScope) return !requireWorkspace;
    return matches;
  }

  private matchesHost(result: AgentBridgeBrowserResult, selectedHostId: string): boolean {
    if (selectedHostId.length === 0) return true;
    if (result.hostId.length > 0 && result.hostId !== selectedHostId) return false;
    if (result.target.hostId.length > 0 && result.target.hostId !== selectedHostId) return false;
    if (result.host.hostId.length > 0 && result.host.hostId !== selectedHostId) return false;
    if (result.instance.hostId.length > 0 && result.instance.hostId !== selectedHostId) return false;
    if (result.page.hostId.length > 0 && result.page.hostId !== selectedHostId) return false;
    return true;
  }

  private matchesInstance(result: AgentBridgeBrowserResult, selectedInstanceId: string): boolean {
    if (selectedInstanceId.length === 0) {
      return result.target.instanceId.length === 0 && result.instance.instanceId.length === 0 && result.page.instanceId.length === 0;
    }
    if (result.target.instanceId.length > 0 && result.target.instanceId !== selectedInstanceId) return false;
    if (result.instance.instanceId.length > 0 && result.instance.instanceId !== selectedInstanceId) return false;
    if (result.page.instanceId.length > 0 && result.page.instanceId !== selectedInstanceId) return false;
    return true;
  }

  private matchesPage(result: AgentBridgeBrowserResult, selectedPageId: string): boolean {
    if (selectedPageId.length === 0) {
      return result.target.pageId.length === 0 && result.page.pageId.length === 0;
    }
    if (result.target.pageId.length > 0 && result.target.pageId !== selectedPageId) return false;
    if (result.page.pageId.length > 0 && result.page.pageId !== selectedPageId) return false;
    return true;
  }

  private hasExplicitScope(result: AgentBridgeBrowserResult): boolean {
    return result.workspaceId.length > 0 ||
      result.permission.workspaceId.length > 0 ||
      result.target.workspaceId.length > 0 ||
      result.hostId.length > 0 ||
      result.host.hostId.length > 0 ||
      result.instance.instanceId.length > 0 ||
      result.page.pageId.length > 0;
  }
}

/**
 * Correlates Browser responses with the exact host/instance/page scope that
 * was visible when the request was sent. Missing optional scope fields remain
 * compatible with older Bridge responses, while conflicting fields consume
 * the request and are rejected as stale.
 */
export class AgentHomeBrowserRequestCoordinator {
  private pending: Array<AgentHomeBrowserRequestScope> = [];

  begin(scope: AgentHomeBrowserRequestScope): boolean {
    if (scope.requestId.length === 0) {
      return false;
    }
    if (this.findIndex(scope.requestId) >= 0) {
      return false;
    }
    this.pending.push(scope);
    return true;
  }

  consume(requestId: string, result: AgentBridgeBrowserResult): AgentHomeBrowserRequestMatch {
    let index = -1;
    if (requestId.length > 0) {
      index = this.findIndex(requestId);
    } else if (this.pending.length === 1) {
      index = 0;
    }
    if (index < 0) {
      return new AgentHomeBrowserRequestMatch(false, false, '', requestId);
    }
    const scope = this.pending[index];
    this.removeAt(index);
    if (!this.matchesScope(scope, result)) {
      return new AgentHomeBrowserRequestMatch(false, true, scope.action, scope.requestId);
    }
    return new AgentHomeBrowserRequestMatch(true, false, scope.action, scope.requestId);
  }

  clear(): void {
    this.pending = [];
  }

  pendingCount(): number {
    return this.pending.length;
  }

  private findIndex(requestId: string): number {
    for (let index = 0; index < this.pending.length; index++) {
      if (this.pending[index].requestId === requestId) {
        return index;
      }
    }
    return -1;
  }

  private removeAt(index: number): void {
    const next: Array<AgentHomeBrowserRequestScope> = [];
    for (let itemIndex = 0; itemIndex < this.pending.length; itemIndex++) {
      if (itemIndex !== index) {
        next.push(this.pending[itemIndex]);
      }
    }
    this.pending = next;
  }

  private matchesScope(scope: AgentHomeBrowserRequestScope, result: AgentBridgeBrowserResult): boolean {
    if (result.workspaceId.length > 0 && result.workspaceId !== scope.workspaceId) {
      return false;
    }
    if (scope.hostId.length > 0 && result.hostId.length > 0 && result.hostId !== scope.hostId) {
      return false;
    }
    if (!this.matchesInstance(scope, result) || !this.matchesPage(scope, result)) {
      return false;
    }
    for (let index = 0; index < result.instances.length; index++) {
      const instance = result.instances[index];
      if (instance.instanceId === scope.instanceId && scope.hostId.length > 0 &&
        instance.hostId.length > 0 && instance.hostId !== scope.hostId) {
        return false;
      }
    }
    for (let index = 0; index < result.pages.length; index++) {
      const page = result.pages[index];
      if (page.pageId === scope.pageId) {
        if (scope.hostId.length > 0 && page.hostId.length > 0 && page.hostId !== scope.hostId) {
          return false;
        }
        if (scope.instanceId.length > 0 && page.instanceId.length > 0 && page.instanceId !== scope.instanceId) {
          return false;
        }
      }
    }
    return true;
  }

  private matchesInstance(scope: AgentHomeBrowserRequestScope, result: AgentBridgeBrowserResult): boolean {
    const instance = result.instance;
    if (scope.instanceId.length > 0 && instance.instanceId.length > 0 && instance.instanceId !== scope.instanceId) {
      return false;
    }
    if (scope.hostId.length > 0 && instance.hostId.length > 0 && instance.hostId !== scope.hostId) {
      return false;
    }
    return true;
  }

  private matchesPage(scope: AgentHomeBrowserRequestScope, result: AgentBridgeBrowserResult): boolean {
    const page = result.page;
    if (scope.pageId.length > 0 && page.pageId.length > 0 && page.pageId !== scope.pageId) {
      return false;
    }
    if (scope.hostId.length > 0 && page.hostId.length > 0 && page.hostId !== scope.hostId) {
      return false;
    }
    if (scope.instanceId.length > 0 && page.instanceId.length > 0 && page.instanceId !== scope.instanceId) {
      return false;
    }
    return true;
  }
}
