export class AgentHomeSessionWindowStatus {
  static readonly OPENING: string = 'opening';
  static readonly OPEN: string = 'open';
  static readonly CLOSING: string = 'closing';
  static readonly FAILED: string = 'failed';
}

export class AgentHomeSessionWindowOpenAction {
  static readonly CREATE: string = 'create';
  static readonly FOCUS: string = 'focus';
  static readonly WAIT: string = 'wait';
  static readonly REJECT: string = 'reject';
}

export class AgentHomeSessionWindowTarget {
  hostProfileId: string;
  workspaceId: string;
  agentId: string;
  sessionId: string;
  instanceId: string;

  constructor(
    hostProfileId: string,
    workspaceId: string,
    agentId: string,
    sessionId: string,
    instanceId: string = ''
  ) {
    this.hostProfileId = hostProfileId;
    this.workspaceId = workspaceId;
    this.agentId = agentId;
    this.sessionId = sessionId;
    this.instanceId = instanceId;
  }

  copy(): AgentHomeSessionWindowTarget {
    return new AgentHomeSessionWindowTarget(
      this.hostProfileId,
      this.workspaceId,
      this.agentId,
      this.sessionId,
      this.instanceId
    );
  }
}

export class AgentHomeSessionWindowRecord {
  target: AgentHomeSessionWindowTarget;
  windowName: string;
  status: string;
  lastError: string;

  constructor(target: AgentHomeSessionWindowTarget, windowName: string, status: string) {
    this.target = target;
    this.windowName = windowName;
    this.status = status;
    this.lastError = '';
  }

  copy(): AgentHomeSessionWindowRecord {
    const record = new AgentHomeSessionWindowRecord(this.target.copy(), this.windowName, this.status);
    record.lastError = this.lastError;
    return record;
  }
}

export class AgentHomeSessionWindowOpenPlan {
  action: string;
  target: AgentHomeSessionWindowTarget;
  windowName: string;
  reason: string;

  constructor(action: string, target: AgentHomeSessionWindowTarget, windowName: string, reason: string = '') {
    this.action = action;
    this.target = target;
    this.windowName = windowName;
    this.reason = reason;
  }
}

export class AgentHomeSessionWindowClosePlan {
  shouldClose: boolean;
  windowName: string;
  instanceId: string;
  reason: string;

  constructor(shouldClose: boolean, windowName: string = '', instanceId: string = '', reason: string = '') {
    this.shouldClose = shouldClose;
    this.windowName = windowName;
    this.instanceId = instanceId;
    this.reason = reason;
  }
}

export class AgentHomeSessionWindowCoordinator {
  private records: Array<AgentHomeSessionWindowRecord> = [];
  private nextInstanceSequence: number = 0;

  planOpen(target: AgentHomeSessionWindowTarget): AgentHomeSessionWindowOpenPlan {
    if (target.hostProfileId.length === 0 || target.sessionId.length === 0) {
      return new AgentHomeSessionWindowOpenPlan(
        AgentHomeSessionWindowOpenAction.REJECT,
        target.copy(),
        '',
        'invalid_target'
      );
    }
    const existingIndex = this.indexOfScope(target.hostProfileId, target.sessionId);
    if (existingIndex >= 0) {
      const existing = this.records[existingIndex];
      if (existing.status === AgentHomeSessionWindowStatus.OPEN) {
        return new AgentHomeSessionWindowOpenPlan(
          AgentHomeSessionWindowOpenAction.FOCUS,
          existing.target.copy(),
          existing.windowName
        );
      }
      if (existing.status === AgentHomeSessionWindowStatus.OPENING ||
        existing.status === AgentHomeSessionWindowStatus.CLOSING) {
        return new AgentHomeSessionWindowOpenPlan(
          AgentHomeSessionWindowOpenAction.WAIT,
          existing.target.copy(),
          existing.windowName,
          existing.status
        );
      }
      this.records.splice(existingIndex, 1);
    }
    this.nextInstanceSequence = this.nextInstanceSequence + 1;
    const instanceId = target.instanceId.length > 0 ? target.instanceId :
      'session_window_' + this.nextInstanceSequence.toString();
    const normalizedTarget = new AgentHomeSessionWindowTarget(
      target.hostProfileId,
      target.workspaceId,
      target.agentId,
      target.sessionId,
      instanceId
    );
    const windowName = this.buildWindowName(
      normalizedTarget.hostProfileId,
      normalizedTarget.sessionId,
      normalizedTarget.instanceId
    );
    this.records.push(new AgentHomeSessionWindowRecord(
      normalizedTarget,
      windowName,
      AgentHomeSessionWindowStatus.OPENING
    ));
    return new AgentHomeSessionWindowOpenPlan(
      AgentHomeSessionWindowOpenAction.CREATE,
      normalizedTarget.copy(),
      windowName
    );
  }

  markOpened(plan: AgentHomeSessionWindowOpenPlan): boolean {
    const index = this.indexOfIdentity(plan.windowName, plan.target.instanceId);
    if (index < 0 || this.records[index].status !== AgentHomeSessionWindowStatus.OPENING) {
      return false;
    }
    this.records[index].status = AgentHomeSessionWindowStatus.OPEN;
    this.records[index].lastError = '';
    return true;
  }

  markOpenFailed(plan: AgentHomeSessionWindowOpenPlan, message: string): boolean {
    const index = this.indexOfIdentity(plan.windowName, plan.target.instanceId);
    if (index < 0) {
      return false;
    }
    this.records[index].status = AgentHomeSessionWindowStatus.FAILED;
    this.records[index].lastError = message;
    return true;
  }

  planClose(hostProfileId: string, sessionId: string, reason: string): AgentHomeSessionWindowClosePlan {
    const index = this.indexOfScope(hostProfileId, sessionId);
    if (index < 0) {
      return new AgentHomeSessionWindowClosePlan(false, '', '', reason);
    }
    return this.beginCloseAt(index, reason);
  }

  planCloseWindow(windowName: string, reason: string): AgentHomeSessionWindowClosePlan {
    const index = this.indexOfWindowName(windowName);
    if (index < 0) {
      return new AgentHomeSessionWindowClosePlan(false, '', '', reason);
    }
    return this.beginCloseAt(index, reason);
  }

  invalidateHost(hostProfileId: string, reason: string = 'host_invalidated'): Array<AgentHomeSessionWindowClosePlan> {
    const plans: Array<AgentHomeSessionWindowClosePlan> = [];
    for (let index = 0; index < this.records.length; index++) {
      if (this.records[index].target.hostProfileId === hostProfileId) {
        plans.push(this.beginCloseAt(index, reason));
      }
    }
    return plans;
  }

  invalidateSession(
    hostProfileId: string,
    sessionId: string,
    reason: string = 'session_invalidated'
  ): AgentHomeSessionWindowClosePlan {
    return this.planClose(hostProfileId, sessionId, reason);
  }

  invalidateWorkspace(
    hostProfileId: string,
    workspaceId: string,
    reason: string = 'workspace_invalidated'
  ): Array<AgentHomeSessionWindowClosePlan> {
    const plans: Array<AgentHomeSessionWindowClosePlan> = [];
    for (let index = 0; index < this.records.length; index++) {
      const record = this.records[index];
      if (record.target.hostProfileId === hostProfileId && record.target.workspaceId === workspaceId) {
        plans.push(this.beginCloseAt(index, reason));
      }
    }
    return plans;
  }

  markClosed(windowName: string, instanceId: string): boolean {
    const index = this.indexOfIdentity(windowName, instanceId);
    if (index < 0) {
      return false;
    }
    this.records.splice(index, 1);
    return true;
  }

  markClosedWindow(windowName: string): boolean {
    const index = this.indexOfWindowName(windowName);
    if (index < 0) {
      return false;
    }
    this.records.splice(index, 1);
    return true;
  }

  acceptsEvent(windowName: string, instanceId: string): boolean {
    const index = this.indexOfIdentity(windowName, instanceId);
    if (index < 0) {
      return false;
    }
    return this.records[index].status === AgentHomeSessionWindowStatus.OPENING ||
      this.records[index].status === AgentHomeSessionWindowStatus.OPEN;
  }

  activeRecords(): Array<AgentHomeSessionWindowRecord> {
    const copies: Array<AgentHomeSessionWindowRecord> = [];
    for (let index = 0; index < this.records.length; index++) {
      copies.push(this.records[index].copy());
    }
    return copies;
  }

  recordFor(hostProfileId: string, sessionId: string): AgentHomeSessionWindowRecord | null {
    const index = this.indexOfScope(hostProfileId, sessionId);
    return index >= 0 ? this.records[index].copy() : null;
  }

  recordForWindow(windowName: string): AgentHomeSessionWindowRecord | null {
    const index = this.indexOfWindowName(windowName);
    return index >= 0 ? this.records[index].copy() : null;
  }

  private beginCloseAt(index: number, reason: string): AgentHomeSessionWindowClosePlan {
    const record = this.records[index];
    record.status = AgentHomeSessionWindowStatus.CLOSING;
    return new AgentHomeSessionWindowClosePlan(
      true,
      record.windowName,
      record.target.instanceId,
      reason
    );
  }

  private buildWindowName(hostProfileId: string, sessionId: string, instanceId: string): string {
    return 'agent_session_' + this.safeIdPart(hostProfileId) + '_' + this.safeIdPart(sessionId) + '_' +
      this.safeIdPart(instanceId);
  }

  private safeIdPart(value: string): string {
    const normalized = value.replace(/[^A-Za-z0-9_-]/g, '_');
    if (normalized.length <= 48) {
      return normalized;
    }
    return normalized.substring(0, 48);
  }

  private indexOfScope(hostProfileId: string, sessionId: string): number {
    for (let index = 0; index < this.records.length; index++) {
      if (this.records[index].target.hostProfileId === hostProfileId &&
        this.records[index].target.sessionId === sessionId) {
        return index;
      }
    }
    return -1;
  }

  private indexOfWindowName(windowName: string): number {
    for (let index = 0; index < this.records.length; index++) {
      if (this.records[index].windowName === windowName) {
        return index;
      }
    }
    return -1;
  }

  private indexOfIdentity(windowName: string, instanceId: string): number {
    for (let index = 0; index < this.records.length; index++) {
      if (this.records[index].windowName === windowName &&
        this.records[index].target.instanceId === instanceId) {
        return index;
      }
    }
    return -1;
  }
}
