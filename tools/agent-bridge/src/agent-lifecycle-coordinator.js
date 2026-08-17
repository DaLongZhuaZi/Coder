'use strict';

class AgentLifecycleCoordinator {
  constructor(options) {
    this.agentManager = options.agentManager;
    this.registry = options.registry;
    this.terminalManager = options.terminalManager;
    this.workspaceRegistry = options.workspaceRegistry;
    this.managedProcessLedger = options.managedProcessLedger;
    this.notificationManager = options.notificationManager;
    this.serviceManager = options.serviceManager || null;
  }

  childRecords(record, seen) {
    const result = [];
    const visited = seen || new Set();
    if (!record || !Array.isArray(record.childAgentIds)) {
      return result;
    }
    for (const childId of record.childAgentIds) {
      if (visited.has(childId)) {
        continue;
      }
      visited.add(childId);
      const child = this.agentManager.find(childId);
      if (!child || child.detached) {
        continue;
      }
      result.push.apply(result, this.childRecords(child, visited));
      result.push(child);
    }
    return result;
  }

  async archive(agentId, options, emit) {
    const record = this.agentManager.find(agentId);
    if (!record) {
      return null;
    }
    const cascade = options && options.cascade === true;
    const records = cascade ? this.childRecords(record).concat([record]) : [record];
    const archivedAgents = [];
    for (const target of records) {
      const closing = this.agentManager.beginClosing(target.id);
      if (!closing) {
        continue;
      }
      const steps = [];
      let remoteArchiveFailed = false;
      if (target.providerSessionId.length > 0) {
        try {
          await this.registry.archiveSession({
            providerId: target.provider,
            sessionId: target.providerSessionId,
            remoteSessionId: target.remoteSessionId,
            agentId: target.id
          }, emit);
          steps.push({ name: 'provider', status: 'completed' });
        } catch (error) {
          remoteArchiveFailed = true;
          steps.push({ name: 'provider', status: 'failed', reason: error instanceof Error ? error.message : String(error) });
        }
      } else {
        steps.push({ name: 'provider', status: 'not_applicable' });
      }
      const terminalResult = this.terminalManager ? this.terminalManager.closeByAgent(target.id) : { status: 'not_applicable' };
      steps.push({ name: 'terminal', status: terminalResult.status || 'completed', count: Array.isArray(terminalResult.closed) ? terminalResult.closed.length : 0 });
      const notificationResult = this.notificationManager
        ? this.notificationManager.deactivateRoutesForAgent(target.id, 'agent_archived')
        : { status: 'not_applicable' };
      steps.push({ name: 'notification', status: notificationResult.status || 'completed' });
      const serviceResult = this.serviceManager
        ? await this.serviceManager.cleanupByOwner(target.id, 'agent_archived')
        : { status: 'not_applicable', stopped: [] };
      steps.push({ name: 'workspace_service', status: serviceResult.status || 'completed', count: Array.isArray(serviceResult.stopped) ? serviceResult.stopped.length : 0 });
      const removedProcesses = this.managedProcessLedger ? this.managedProcessLedger.removeByOwner(target.id) : [];
      steps.push({ name: 'process_ledger', status: 'completed', count: removedProcesses.length });
      if (target.workspaceMode === 'isolated' && this.agentManager.activeOwnersForWorkspace(target.workspaceId, new Set([target.id])).length === 0) {
        if (this.serviceManager) {
          const workspaceServices = await this.serviceManager.cleanupByWorkspace(target.workspaceId, 'workspace_archived');
          steps.push({ name: 'workspace_services', status: workspaceServices.status || 'completed', count: Array.isArray(workspaceServices.stopped) ? workspaceServices.stopped.length : 0 });
        }
        const archivedWorkspace = this.workspaceRegistry.archiveWorkspace({ workspaceId: target.workspaceId });
        steps.push({ name: 'workspace', status: archivedWorkspace ? 'completed' : 'not_applicable' });
      } else {
        steps.push({ name: 'workspace', status: 'not_applicable' });
      }
      const cleanupResult = {
        status: remoteArchiveFailed ? 'completed_with_warning' : 'completed',
        reason: remoteArchiveFailed ? 'remote_cleanup_failed' : '',
        completedAt: new Date().toISOString(),
        steps
      };
      archivedAgents.push(this.agentManager.finalizeArchive(target.id, 'lifecycle_archive', cleanupResult));
    }
    const parent = this.agentManager.find(agentId);
    return {
      agent: parent ? this.agentManager.publicRecord(parent) : null,
      archivedAgents,
      cascade,
      cleanupStatus: 'completed',
      relationshipTree: this.agentManager.relationshipTree({ includeArchived: false }),
      relationshipDoctor: this.agentManager.relationshipDoctor({ includeArchived: true })
    };
  }

  detach(agentId) {
    return this.agentManager.detach(agentId);
  }

  async shutdown(reason) {
    const terminal = this.terminalManager ? this.terminalManager.shutdownAll() : { status: 'not_applicable' };
    const services = this.serviceManager && typeof this.serviceManager.shutdownAll === 'function'
      ? await this.serviceManager.shutdownAll(reason || 'daemon_restart')
      : { status: 'not_applicable', stopped: [] };
    let providers = { status: 'not_applicable' };
    if (this.registry && typeof this.registry.shutdown === 'function') {
      providers = await this.registry.shutdown(reason || 'daemon_restart');
    }
    const reconciled = this.managedProcessLedger ? this.managedProcessLedger.reconcile() : { retained: [], removed: [] };
    const disconnected = this.agentManager.markAllDisconnected(reason || 'daemon_restart');
    return { status: 'completed', terminal, services, providers, reconciled, disconnectedCount: disconnected.length };
  }
}

module.exports = {
  AgentLifecycleCoordinator
};
