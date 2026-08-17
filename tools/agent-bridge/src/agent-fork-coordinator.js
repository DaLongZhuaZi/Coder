'use strict';

const path = require('path');
const { randomId } = require('./daemon-store');
const { readString } = require('./protocol');

const FORK_PLAN_TTL_MS = 15 * 60 * 1000;

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  return typeof source[key] === 'boolean' ? source[key] : fallbackValue;
}

function defaultWorktreePath(rootPath, shortId) {
  const repositoryName = path.basename(rootPath) || 'workspace';
  return path.join(path.dirname(rootPath), '.ngf-worktrees', repositoryName + '-' + shortId);
}

class AgentForkCoordinator {
  constructor(options) {
    this.agentManager = options.agentManager;
    this.workspaceService = options.workspaceService;
    this.workspaceRegistry = options.workspaceRegistry;
    this.plans = new Map();
  }

  async fork(agentId, payload) {
    const source = this.agentManager.find(agentId);
    if (!source) {
      return null;
    }
    const requestedPlan = this.plans.get(readString(payload, 'forkPlanId', ''));
    if (readString(payload, 'boundaryMessageId', '').length > 0 || (requestedPlan && requestedPlan.kind === 'message_boundary')) {
      return await this.forkFromMessageBoundary(source, payload);
    }
    const workspaceMode = readString(payload, 'workspaceMode', 'shared') === 'isolated' ? 'isolated' : 'shared';
    if (workspaceMode === 'shared') {
      return this.agentManager.fork(agentId, Object.assign({}, payload, {
        workspaceMode: 'shared',
        rootPath: source.rootPath,
        workspaceId: source.workspaceId
      }));
    }
    return await this.forkIsolated(source, payload);
  }

  async forkFromMessageBoundary(source, payload) {
    const confirm = readBoolean(payload, 'confirm', false);
    if (!confirm) {
      return await this.createBoundaryPlan(source, payload);
    }
    const requestedPlanId = readString(payload, 'forkPlanId', '');
    const plan = this.plans.get(requestedPlanId);
    if (!plan || plan.kind !== 'message_boundary') {
      return { code: 'fork_plan_required', message: 'A valid message fork preview plan is required.' };
    }
    if (plan.sourceAgentId !== source.id) {
      return { code: 'fork_plan_source_mismatch', message: 'The fork plan belongs to another source Agent.' };
    }
    const requestedBoundaryMessageId = readString(payload, 'boundaryMessageId', '');
    const requestedEpoch = Number.isFinite(payload.timelineEpoch) ? Math.floor(payload.timelineEpoch) : 0;
    const requestedSeq = Number.isFinite(payload.timelineSeq) ? Math.floor(payload.timelineSeq) : 0;
    const requestedCheckpointId = readString(payload, 'checkpointId', '');
    const hasWorkspaceMode = Object.prototype.hasOwnProperty.call(payload, 'workspaceMode');
    const requestedWorkspaceMode = readString(payload, 'workspaceMode', 'shared') === 'isolated' ? 'isolated' : 'shared';
    if ((requestedBoundaryMessageId && requestedBoundaryMessageId !== plan.boundaryMessageId) ||
        (requestedEpoch > 0 && requestedEpoch !== plan.timelineEpoch) ||
        (requestedSeq > 0 && requestedSeq !== plan.timelineSeq) ||
        (requestedCheckpointId && requestedCheckpointId !== plan.boundaryRequest.checkpointId) ||
        (hasWorkspaceMode && requestedWorkspaceMode !== plan.workspaceMode)) {
      return { code: 'fork_plan_binding_mismatch', message: 'The fork confirmation no longer matches the previewed message boundary.' };
    }
    if (plan.childAgentId.length > 0) {
      const existing = this.agentManager.find(plan.childAgentId);
      if (existing) {
        return Object.assign({}, plan.result || {}, {
          agent: this.agentManager.publicRecord(existing),
          idempotent: true,
          forkPlanId: plan.forkPlanId
        });
      }
    }
    if (Date.now() > plan.expiresAt) {
      this.plans.delete(plan.forkPlanId);
      return { code: 'fork_plan_expired', message: 'The message fork preview plan has expired.' };
    }
    const boundary = this.agentManager.resolveForkBoundary(source.id, plan.boundaryRequest);
    if (!boundary.ok) {
      return boundary;
    }
    if (boundary.contextDigest !== plan.contextDigest || boundary.timelineEpoch !== plan.timelineEpoch || boundary.timelineSeq !== plan.timelineSeq) {
      return { code: 'fork_plan_stale', message: 'The selected timeline boundary changed after preview.' };
    }
    let workspace = null;
    let worktree = null;
    try {
      if (plan.workspaceMode === 'isolated') {
        worktree = await this.workspaceService.createWorktree({
          workspacePath: source.rootPath,
          sourceRootPath: source.rootPath,
          sourceWorkspaceId: source.workspaceId,
          worktreePath: plan.worktreePath,
          branch: plan.branch,
          startPoint: plan.startPoint,
          setupCommand: plan.setupCommand,
          createParent: true,
          confirm: true,
          preview: false
        });
        if (!worktree || worktree.ok !== true || worktree.created !== true) {
          return Object.assign({ code: 'isolated_worktree_create_failed' }, worktree || {});
        }
        workspace = this.workspaceRegistry.upsertWorkspace({
          workspacePath: plan.worktreePath,
          cwd: plan.worktreePath,
          workspaceTitle: plan.title,
          title: plan.title,
          branch: plan.branch,
          kind: 'worktree',
          sourceWorkspaceId: source.workspaceId,
          sourceRootPath: source.rootPath,
          worktreePath: plan.worktreePath,
          startPoint: plan.startPoint,
          dedupeByCwd: true
        });
        if (!workspace) {
          throw new Error('Worktree registry linkage failed.');
        }
      }
      const forkPayload = Object.assign({}, plan.payload, {
        workspaceMode: plan.workspaceMode,
        rootPath: plan.workspaceMode === 'isolated' ? plan.worktreePath : source.rootPath,
        workspacePath: plan.workspaceMode === 'isolated' ? plan.worktreePath : source.rootPath,
        workspaceId: plan.workspaceMode === 'isolated' ? workspace.workspaceId : source.workspaceId
      });
      const result = this.agentManager.fork(source.id, forkPayload, boundary);
      if (!result || result.code) {
        throw new Error(result && result.message ? result.message : 'Child Agent persistence failed.');
      }
      plan.childAgentId = result.agent.id;
      plan.consumedAt = Date.now();
      plan.result = Object.assign({}, result, {
        ok: true,
        action: 'agent.fork',
        forkPlanId: plan.forkPlanId,
        preview: false,
        confirmed: true,
        workspaceMode: plan.workspaceMode,
        boundaryMessageId: plan.boundaryMessageId,
        boundaryCursor: String(plan.timelineSeq),
        timelineEpoch: plan.timelineEpoch,
        timelineSeq: plan.timelineSeq,
        contextItemCount: plan.contextItemCount,
        contextDigest: plan.contextDigest,
        warnings: plan.warnings,
        worktree,
        workspace
      });
      return plan.result;
    } catch (error) {
      if (workspace) {
        this.workspaceRegistry.archiveWorkspace({ workspaceId: workspace.workspaceId });
      }
      if (worktree && worktree.created === true) {
        await this.rollbackCreatedWorktree(source, plan);
      }
      return {
        code: plan.workspaceMode === 'isolated' ? 'isolated_fork_commit_failed' : 'message_fork_commit_failed',
        message: error instanceof Error ? error.message : String(error),
        forkPlanId: plan.forkPlanId
      };
    }
  }

  async createBoundaryPlan(source, payload) {
    const boundary = this.agentManager.resolveForkBoundary(source.id, payload);
    if (!boundary.ok) {
      return boundary;
    }
    const workspaceMode = readString(payload, 'workspaceMode', 'shared') === 'isolated' ? 'isolated' : 'shared';
    const forkPlanId = randomId('fkp');
    const shortId = forkPlanId.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toLowerCase();
    const worktreePath = workspaceMode === 'isolated'
      ? path.resolve(readString(payload, 'worktreePath', defaultWorktreePath(source.rootPath, shortId)))
      : source.rootPath;
    const branch = readString(payload, 'branch', 'ngf/agent-' + shortId);
    const startPoint = readString(payload, 'startPoint', 'HEAD');
    const setupCommand = readString(payload, 'setupCommand', '');
    let worktree = null;
    if (workspaceMode === 'isolated') {
      worktree = await this.workspaceService.createWorktree({
        workspacePath: source.rootPath,
        sourceRootPath: source.rootPath,
        sourceWorkspaceId: source.workspaceId,
        worktreePath,
        branch,
        startPoint,
        setupCommand,
        createParent: true,
        confirm: false,
        preview: true
      });
      if (!worktree || worktree.ok !== true) {
        return Object.assign({ code: 'isolated_fork_preview_failed' }, worktree || {});
      }
    }
    const now = Date.now();
    const plan = {
      kind: 'message_boundary',
      forkPlanId,
      sourceAgentId: source.id,
      workspaceMode,
      boundaryMessageId: boundary.boundaryMessageId,
      timelineEpoch: boundary.timelineEpoch,
      timelineSeq: boundary.timelineSeq,
      contextItemCount: boundary.contextItemCount,
      contextDigest: boundary.contextDigest,
      warnings: boundary.warnings,
      boundaryRequest: {
        boundaryMessageId: boundary.boundaryMessageId,
        timelineEpoch: boundary.timelineEpoch,
        timelineSeq: boundary.timelineSeq,
        checkpointId: boundary.checkpointId
      },
      worktreePath,
      branch,
      startPoint,
      setupCommand,
      title: readString(payload, 'title', source.title + ' fork'),
      payload: Object.assign({}, payload),
      createdAt: now,
      expiresAt: now + FORK_PLAN_TTL_MS,
      consumedAt: 0,
      childAgentId: '',
      result: null
    };
    this.plans.set(forkPlanId, plan);
    return {
      ok: true,
      action: 'agent.fork',
      workspaceMode,
      forkPlanId,
      preview: true,
      confirmed: false,
      expiresAt: plan.expiresAt,
      boundaryMessageId: boundary.boundaryMessageId,
      boundaryCursor: boundary.boundaryCursor,
      timelineEpoch: boundary.timelineEpoch,
      timelineSeq: boundary.timelineSeq,
      contextItemCount: boundary.contextItemCount,
      contextDigest: boundary.contextDigest,
      warnings: boundary.warnings,
      worktree
    };
  }

  async forkIsolated(source, payload) {
    const requestedPlanId = readString(payload, 'forkPlanId', '');
    const confirm = readBoolean(payload, 'confirm', false);
    if (!confirm) {
      return await this.createPlan(source, payload);
    }
    const plan = this.plans.get(requestedPlanId);
    if (!plan) {
      return { code: 'fork_plan_required', message: 'A valid isolated fork preview plan is required.' };
    }
    if (plan.sourceAgentId !== source.id) {
      return { code: 'fork_plan_source_mismatch', message: 'The fork plan belongs to another source Agent.' };
    }
    if (plan.childAgentId.length > 0) {
      const existing = this.agentManager.find(plan.childAgentId);
      if (existing) {
        return Object.assign({}, plan.result || {}, {
          agent: this.agentManager.publicRecord(existing),
          idempotent: true,
          forkPlanId: plan.forkPlanId
        });
      }
    }
    if (Date.now() > plan.expiresAt) {
      this.plans.delete(plan.forkPlanId);
      return { code: 'fork_plan_expired', message: 'The isolated fork preview plan has expired.' };
    }
    const createResult = await this.workspaceService.createWorktree({
      workspacePath: source.rootPath,
      sourceRootPath: source.rootPath,
      sourceWorkspaceId: source.workspaceId,
      worktreePath: plan.worktreePath,
      branch: plan.branch,
      startPoint: plan.startPoint,
      setupCommand: plan.setupCommand,
      createParent: true,
      confirm: true,
      preview: false
    });
    if (!createResult || createResult.ok !== true || createResult.created !== true) {
      if (createResult && createResult.created === true) {
        await this.rollbackCreatedWorktree(source, plan);
      }
      return Object.assign({ code: 'isolated_worktree_create_failed' }, createResult || {});
    }
    let workspace = null;
    try {
      workspace = this.workspaceRegistry.upsertWorkspace({
        workspacePath: plan.worktreePath,
        cwd: plan.worktreePath,
        workspaceTitle: plan.title,
        title: plan.title,
        branch: plan.branch,
        kind: 'worktree',
        sourceWorkspaceId: source.workspaceId,
        sourceRootPath: source.rootPath,
        worktreePath: plan.worktreePath,
        startPoint: plan.startPoint,
        dedupeByCwd: true
      });
      if (!workspace) {
        throw new Error('Worktree registry linkage failed.');
      }
      const result = this.agentManager.fork(source.id, Object.assign({}, plan.payload, {
        workspaceMode: 'isolated',
        rootPath: plan.worktreePath,
        workspacePath: plan.worktreePath,
        workspaceId: workspace.workspaceId
      }));
      if (!result || result.code) {
        throw new Error(result && result.message ? result.message : 'Child Agent persistence failed.');
      }
      plan.childAgentId = result.agent.id;
      plan.consumedAt = Date.now();
      plan.result = Object.assign({}, result, {
        forkPlanId: plan.forkPlanId,
        preview: false,
        confirmed: true,
        worktree: createResult,
        workspace
      });
      return plan.result;
    } catch (error) {
      if (workspace) {
        this.workspaceRegistry.archiveWorkspace({ workspaceId: workspace.workspaceId });
      }
      await this.rollbackCreatedWorktree(source, plan);
      return {
        code: 'isolated_fork_commit_failed',
        message: error instanceof Error ? error.message : String(error),
        forkPlanId: plan.forkPlanId
      };
    }
  }

  async createPlan(source, payload) {
    const forkPlanId = randomId('fkp');
    const shortId = forkPlanId.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toLowerCase();
    const worktreePath = path.resolve(readString(payload, 'worktreePath', defaultWorktreePath(source.rootPath, shortId)));
    const branch = readString(payload, 'branch', 'ngf/agent-' + shortId);
    const startPoint = readString(payload, 'startPoint', 'HEAD');
    const setupCommand = readString(payload, 'setupCommand', '');
    const preview = await this.workspaceService.createWorktree({
      workspacePath: source.rootPath,
      sourceRootPath: source.rootPath,
      sourceWorkspaceId: source.workspaceId,
      worktreePath,
      branch,
      startPoint,
      setupCommand,
      createParent: true,
      confirm: false,
      preview: true
    });
    if (!preview || preview.ok !== true) {
      return Object.assign({ code: 'isolated_fork_preview_failed' }, preview || {});
    }
    const now = Date.now();
    const plan = {
      kind: 'workspace_isolation',
      forkPlanId,
      sourceAgentId: source.id,
      worktreePath,
      branch,
      startPoint,
      setupCommand,
      title: readString(payload, 'title', source.title + ' fork'),
      payload: Object.assign({}, payload),
      createdAt: now,
      expiresAt: now + FORK_PLAN_TTL_MS,
      consumedAt: 0,
      childAgentId: '',
      result: null
    };
    this.plans.set(forkPlanId, plan);
    return {
      ok: true,
      action: 'agent.fork',
      workspaceMode: 'isolated',
      forkPlanId,
      preview: true,
      confirmed: false,
      expiresAt: plan.expiresAt,
      worktree: preview
    };
  }

  async rollbackCreatedWorktree(source, plan) {
    return await this.workspaceService.archiveWorktree({
      workspacePath: source.rootPath,
      sourceRootPath: source.rootPath,
      worktreePath: plan.worktreePath,
      confirm: true,
      force: true,
      teardownCommand: ''
    });
  }
}

module.exports = {
  AgentForkCoordinator,
  FORK_PLAN_TTL_MS
};
