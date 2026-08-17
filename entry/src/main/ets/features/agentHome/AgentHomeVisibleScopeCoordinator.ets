import { AgentHomeWorkbenchMode } from './AgentHomeWorkbenchCoordinator';

export class AgentHomeVisibleMainPage {
  static readonly WORKSPACES: number = 0;
  static readonly CHAT: number = 1;
  static readonly WORKSPACE_BROWSER: number = 2;
}

export class AgentHomeVisibleWorkspaceTab {
  static readonly CHANGES: number = 0;
  static readonly FILES: number = 1;
}

export class AgentHomeVisibleSheet {
  static readonly NONE: string = 'none';
  static readonly RUNTIME: string = 'runtime';
  static readonly DOCTOR: string = 'doctor';
  static readonly DIAGNOSTICS: string = 'diagnostics';
  static readonly SESSION_DETAILS: string = 'session_details';
  static readonly TOOL_DETAIL: string = 'tool_detail';
  static readonly REQUEST_DETAIL: string = 'request_detail';
  static readonly PLAN_DETAIL: string = 'plan_detail';
  static readonly WORKSPACE_BROWSER: string = 'workspace_browser';
  static readonly WORKSPACE_DIFF_DETAIL: string = 'workspace_diff_detail';
  static readonly WORKSPACE_CONTENT_PREVIEW: string = 'workspace_content_preview';
}

export class AgentHomeVisibleRightPane {
  static readonly NONE: string = 'none';
  static readonly TERMINAL: string = 'terminal';
  static readonly DOCTOR: string = 'doctor';
  static readonly DETAILS: string = 'details';
}

export class AgentHomeVisibleRefreshScope {
  static readonly NONE: string = 'none';
  static readonly CHAT: string = 'chat';
  static readonly WORKSPACE: string = 'workspace';
  static readonly FILES: string = 'files';
  static readonly CHANGES: string = 'changes';
  static readonly TERMINAL: string = 'terminal';
  static readonly DOCTOR: string = 'doctor';
  static readonly DETAILS: string = 'details';
}

export class AgentHomeVisibleRefreshOperation {
  static readonly HISTORY: string = 'history';
  static readonly MESSAGE_QUEUE: string = 'message_queue';
  static readonly USAGE_SUMMARY: string = 'usage_summary';
  static readonly USAGE_EVENTS: string = 'usage_events';
  static readonly HOST_WORKSPACES: string = 'host_workspaces';
  static readonly WORKSPACE_SESSIONS: string = 'workspace_sessions';
  static readonly WORKSPACE_FILES: string = 'workspace_files';
  static readonly GIT_STATUS: string = 'git_status';
  static readonly WORKSPACE_DIFF: string = 'workspace_diff';
  static readonly TERMINAL_LIST: string = 'terminal_list';
  static readonly ACTIVE_TERMINAL: string = 'active_terminal';
  static readonly DAEMON_STATUS: string = 'daemon_status';
  static readonly DIAGNOSTICS: string = 'diagnostics';
  static readonly SESSION_STATUS: string = 'session_status';
  static readonly AGENT_STATUS: string = 'agent_status';
}

export class AgentHomeVisibleScopeInput {
  layoutMode: string;
  mainPageIndex: number;
  activeSheetKey: string;
  workspaceTabIndex: number;
  rightPaneTab: string;

  constructor(
    layoutMode: string,
    mainPageIndex: number,
    activeSheetKey: string = AgentHomeVisibleSheet.NONE,
    workspaceTabIndex: number = AgentHomeVisibleWorkspaceTab.CHANGES,
    rightPaneTab: string = AgentHomeVisibleRightPane.NONE
  ) {
    this.layoutMode = layoutMode;
    this.mainPageIndex = mainPageIndex;
    this.activeSheetKey = activeSheetKey;
    this.workspaceTabIndex = workspaceTabIndex;
    this.rightPaneTab = rightPaneTab;
  }
}

export class AgentHomeVisibleRefreshPlan {
  scope: string;
  operations: Array<string>;

  constructor(scope: string, operations: Array<string>) {
    this.scope = scope;
    this.operations = operations;
  }

  copy(): AgentHomeVisibleRefreshPlan {
    const operationCopies: Array<string> = [];
    for (let index = 0; index < this.operations.length; index++) {
      operationCopies.push(this.operations[index]);
    }
    return new AgentHomeVisibleRefreshPlan(this.scope, operationCopies);
  }
}

export class AgentHomeVisibleRefreshTicket {
  ticketId: string;
  scope: string;
  hostProfileId: string;
  hostEpoch: number;

  constructor(ticketId: string, scope: string, hostProfileId: string, hostEpoch: number) {
    this.ticketId = ticketId;
    this.scope = scope;
    this.hostProfileId = hostProfileId;
    this.hostEpoch = hostEpoch;
  }

  copy(): AgentHomeVisibleRefreshTicket {
    return new AgentHomeVisibleRefreshTicket(this.ticketId, this.scope, this.hostProfileId, this.hostEpoch);
  }
}

export class AgentHomeVisibleRefreshStart {
  shouldStart: boolean;
  merged: boolean;
  ticket: AgentHomeVisibleRefreshTicket;

  constructor(shouldStart: boolean, merged: boolean, ticket: AgentHomeVisibleRefreshTicket) {
    this.shouldStart = shouldStart;
    this.merged = merged;
    this.ticket = ticket;
  }
}

export class AgentHomeVisibleScopeCoordinator {
  private inFlight: Array<AgentHomeVisibleRefreshTicket> = [];
  private nextTicketSequence: number = 0;

  resolve(input: AgentHomeVisibleScopeInput): AgentHomeVisibleRefreshPlan {
    const sheetScope = this.scopeForSheet(input.activeSheetKey, input.workspaceTabIndex);
    if (sheetScope !== AgentHomeVisibleRefreshScope.NONE) {
      return this.planForScope(sheetScope);
    }
    if (input.layoutMode === AgentHomeWorkbenchMode.EXPANDED) {
      const rightPaneScope = this.scopeForRightPane(input.rightPaneTab);
      if (rightPaneScope !== AgentHomeVisibleRefreshScope.NONE) {
        return this.planForScope(rightPaneScope);
      }
    }
    if (input.mainPageIndex === AgentHomeVisibleMainPage.CHAT) {
      return this.planForScope(AgentHomeVisibleRefreshScope.CHAT);
    }
    if (input.mainPageIndex === AgentHomeVisibleMainPage.WORKSPACE_BROWSER) {
      if (input.workspaceTabIndex === AgentHomeVisibleWorkspaceTab.FILES) {
        return this.planForScope(AgentHomeVisibleRefreshScope.FILES);
      }
      return this.planForScope(AgentHomeVisibleRefreshScope.CHANGES);
    }
    if (input.mainPageIndex === AgentHomeVisibleMainPage.WORKSPACES) {
      return this.planForScope(AgentHomeVisibleRefreshScope.WORKSPACE);
    }
    return this.planForScope(AgentHomeVisibleRefreshScope.NONE);
  }

  begin(plan: AgentHomeVisibleRefreshPlan, hostProfileId: string, hostEpoch: number): AgentHomeVisibleRefreshStart {
    if (plan.scope === AgentHomeVisibleRefreshScope.NONE || hostProfileId.length === 0) {
      return new AgentHomeVisibleRefreshStart(
        false,
        false,
        new AgentHomeVisibleRefreshTicket('', plan.scope, hostProfileId, hostEpoch)
      );
    }
    for (let index = this.inFlight.length - 1; index >= 0; index--) {
      const ticket = this.inFlight[index];
      if (ticket.scope === plan.scope && ticket.hostProfileId === hostProfileId && ticket.hostEpoch !== hostEpoch) {
        this.inFlight.splice(index, 1);
      }
    }
    for (let index = 0; index < this.inFlight.length; index++) {
      const ticket = this.inFlight[index];
      if (ticket.scope === plan.scope && ticket.hostProfileId === hostProfileId && ticket.hostEpoch === hostEpoch) {
        return new AgentHomeVisibleRefreshStart(false, true, ticket.copy());
      }
    }
    this.nextTicketSequence = this.nextTicketSequence + 1;
    const ticketId = 'visible_refresh_' + this.nextTicketSequence.toString();
    const ticket = new AgentHomeVisibleRefreshTicket(ticketId, plan.scope, hostProfileId, hostEpoch);
    this.inFlight.push(ticket);
    return new AgentHomeVisibleRefreshStart(true, false, ticket.copy());
  }

  complete(ticket: AgentHomeVisibleRefreshTicket, currentHostProfileId: string, currentHostEpoch: number): boolean {
    const index = this.indexOfTicket(ticket.ticketId);
    if (index < 0) {
      return false;
    }
    const tracked = this.inFlight[index];
    this.inFlight.splice(index, 1);
    return tracked.hostProfileId === currentHostProfileId && tracked.hostEpoch === currentHostEpoch &&
      ticket.hostProfileId === tracked.hostProfileId && ticket.hostEpoch === tracked.hostEpoch;
  }

  fail(ticket: AgentHomeVisibleRefreshTicket): boolean {
    const index = this.indexOfTicket(ticket.ticketId);
    if (index < 0) {
      return false;
    }
    this.inFlight.splice(index, 1);
    return true;
  }

  clearHost(hostProfileId: string): void {
    for (let index = this.inFlight.length - 1; index >= 0; index--) {
      if (this.inFlight[index].hostProfileId === hostProfileId) {
        this.inFlight.splice(index, 1);
      }
    }
  }

  inFlightCount(): number {
    return this.inFlight.length;
  }

  private scopeForSheet(sheetKey: string, workspaceTabIndex: number): string {
    if (sheetKey === AgentHomeVisibleSheet.RUNTIME) {
      return AgentHomeVisibleRefreshScope.TERMINAL;
    }
    if (sheetKey === AgentHomeVisibleSheet.DOCTOR || sheetKey === AgentHomeVisibleSheet.DIAGNOSTICS) {
      return AgentHomeVisibleRefreshScope.DOCTOR;
    }
    if (sheetKey === AgentHomeVisibleSheet.SESSION_DETAILS || sheetKey === AgentHomeVisibleSheet.TOOL_DETAIL ||
      sheetKey === AgentHomeVisibleSheet.REQUEST_DETAIL || sheetKey === AgentHomeVisibleSheet.PLAN_DETAIL) {
      return AgentHomeVisibleRefreshScope.DETAILS;
    }
    if (sheetKey === AgentHomeVisibleSheet.WORKSPACE_DIFF_DETAIL) {
      return AgentHomeVisibleRefreshScope.CHANGES;
    }
    if (sheetKey === AgentHomeVisibleSheet.WORKSPACE_CONTENT_PREVIEW) {
      return AgentHomeVisibleRefreshScope.FILES;
    }
    if (sheetKey === AgentHomeVisibleSheet.WORKSPACE_BROWSER) {
      return workspaceTabIndex === AgentHomeVisibleWorkspaceTab.FILES ?
        AgentHomeVisibleRefreshScope.FILES : AgentHomeVisibleRefreshScope.CHANGES;
    }
    return AgentHomeVisibleRefreshScope.NONE;
  }

  private scopeForRightPane(rightPaneTab: string): string {
    if (rightPaneTab === AgentHomeVisibleRightPane.TERMINAL) {
      return AgentHomeVisibleRefreshScope.TERMINAL;
    }
    if (rightPaneTab === AgentHomeVisibleRightPane.DOCTOR) {
      return AgentHomeVisibleRefreshScope.DOCTOR;
    }
    if (rightPaneTab === AgentHomeVisibleRightPane.DETAILS) {
      return AgentHomeVisibleRefreshScope.DETAILS;
    }
    return AgentHomeVisibleRefreshScope.NONE;
  }

  private planForScope(scope: string): AgentHomeVisibleRefreshPlan {
    const operations: Array<string> = [];
    if (scope === AgentHomeVisibleRefreshScope.CHAT) {
      operations.push(AgentHomeVisibleRefreshOperation.HISTORY);
      operations.push(AgentHomeVisibleRefreshOperation.MESSAGE_QUEUE);
      operations.push(AgentHomeVisibleRefreshOperation.USAGE_SUMMARY);
      operations.push(AgentHomeVisibleRefreshOperation.USAGE_EVENTS);
    } else if (scope === AgentHomeVisibleRefreshScope.WORKSPACE) {
      operations.push(AgentHomeVisibleRefreshOperation.HOST_WORKSPACES);
      operations.push(AgentHomeVisibleRefreshOperation.WORKSPACE_SESSIONS);
    } else if (scope === AgentHomeVisibleRefreshScope.FILES) {
      operations.push(AgentHomeVisibleRefreshOperation.WORKSPACE_FILES);
    } else if (scope === AgentHomeVisibleRefreshScope.CHANGES) {
      operations.push(AgentHomeVisibleRefreshOperation.GIT_STATUS);
      operations.push(AgentHomeVisibleRefreshOperation.WORKSPACE_DIFF);
    } else if (scope === AgentHomeVisibleRefreshScope.TERMINAL) {
      operations.push(AgentHomeVisibleRefreshOperation.TERMINAL_LIST);
      operations.push(AgentHomeVisibleRefreshOperation.ACTIVE_TERMINAL);
    } else if (scope === AgentHomeVisibleRefreshScope.DOCTOR) {
      operations.push(AgentHomeVisibleRefreshOperation.DAEMON_STATUS);
      operations.push(AgentHomeVisibleRefreshOperation.DIAGNOSTICS);
    } else if (scope === AgentHomeVisibleRefreshScope.DETAILS) {
      operations.push(AgentHomeVisibleRefreshOperation.SESSION_STATUS);
      operations.push(AgentHomeVisibleRefreshOperation.AGENT_STATUS);
    }
    return new AgentHomeVisibleRefreshPlan(scope, operations);
  }

  private indexOfTicket(ticketId: string): number {
    if (ticketId.length === 0) {
      return -1;
    }
    for (let index = 0; index < this.inFlight.length; index++) {
      if (this.inFlight[index].ticketId === ticketId) {
        return index;
      }
    }
    return -1;
  }
}
