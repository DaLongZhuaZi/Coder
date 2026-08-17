'use strict';

const crypto = require('crypto');
const path = require('path');
const { randomId } = require('./daemon-store');
const { normalizeRichContentNodes, truncateText } = require('./agent-experience-manager');
const { EventType, readNumber, readString } = require('./protocol');

const AgentStatus = Object.freeze({
  INITIALIZING: 'initializing',
  IDLE: 'idle',
  RUNNING: 'running',
  ERROR: 'error',
  CLOSED: 'closed'
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeRootPath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return path.resolve(value);
}

function normalizeExecutionPolicy(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    permissionPolicyId: readString(value, 'permissionPolicyId', ''),
    sandboxPolicyId: readString(value, 'sandboxPolicyId', '')
  };
}

function normalizeCleanupResult(source) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    status: readString(value, 'status', ''),
    reason: readString(value, 'reason', ''),
    completedAt: readString(value, 'completedAt', ''),
    steps: Array.isArray(value.steps) ? value.steps : []
  };
}

function epochMsFromIso(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeTimelineLimit(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 200;
  }
  if (value > 500) {
    return 500;
  }
  return Math.floor(value);
}

function parseCursor(cursor) {
  if (typeof cursor === 'number' && Number.isFinite(cursor)) {
    return Math.floor(cursor);
  }
  if (typeof cursor !== 'string' || cursor.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readObject(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return null;
}

function readObjectValue(source, key) {
  const value = readObject(source, key);
  return value || {};
}

function readSkippedReasons(source, key) {
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source[key] : null;
  const result = [];
  if (!Array.isArray(value)) {
    return result;
  }
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const reason = readString(item, 'reason', '');
    const count = readNumber(item, 'count', 0);
    if (reason.length > 0 && count > 0) {
      result.push({
        reason,
        count
      });
    }
  }
  return result;
}

function readStringArray(value) {
  const result = [];
  if (!Array.isArray(value)) {
    return result;
  }
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) {
      result.push(item);
    }
  }
  return result;
}

function dedupeStringArray(values) {
  const result = [];
  const seen = new Set();
  const source = Array.isArray(values) ? values : [];
  for (const item of source) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

function appendUniqueString(values, value) {
  const result = dedupeStringArray(values);
  if (typeof value === 'string' && value.length > 0 && !result.includes(value)) {
    result.push(value);
  }
  return result;
}

function publicRelationshipWarning(code, message, remediation) {
  return {
    code,
    message,
    remediation
  };
}

function runtimeInfoFromSession(session, record) {
  const existing = record && record.runtimeInfo && typeof record.runtimeInfo === 'object' && !Array.isArray(record.runtimeInfo)
    ? record.runtimeInfo
    : {};
  const source = session && typeof session === 'object' && !Array.isArray(session) ? session : {};
  const exitCode = typeof source.exitCode === 'number' && Number.isFinite(source.exitCode) ? source.exitCode : null;
  return Object.assign({}, existing, {
    provider: record ? record.provider : readString(source, 'providerId', ''),
    sessionId: readString(source, 'sessionId', record ? record.providerSessionId : ''),
    remoteSessionId: readString(source, 'remoteSessionId', record ? record.remoteSessionId : ''),
    runtimeMode: readString(source, 'runtimeMode', readString(existing, 'runtimeMode', 'oneshot')),
    interactiveReady: source.interactiveReady === true,
    sessionState: readString(source, 'sessionState', readString(existing, 'sessionState', '')),
    pid: readNumber(source, 'pid', readNumber(existing, 'pid', 0)),
    startedAt: readNumber(source, 'startedAt', readNumber(existing, 'startedAt', 0)),
    lastActivityAt: readNumber(source, 'lastActivityAt', readNumber(existing, 'lastActivityAt', 0)),
    exitCode,
    lastError: readString(source, 'lastError', readString(existing, 'lastError', '')),
    recentOutputTail: readString(source, 'recentOutputTail', readString(existing, 'recentOutputTail', ''))
  });
}

function eventKind(eventType) {
  if (eventType === EventType.MESSAGE_DELTA || eventType === EventType.MESSAGE_COMPLETED || eventType === EventType.SESSION_MESSAGES) {
    return 'message';
  }
  if (eventType === EventType.TOOL_STARTED || eventType === EventType.TOOL_OUTPUT || eventType === EventType.TOOL_COMPLETED) {
    return 'tool';
  }
  if (eventType === EventType.ERROR) {
    return 'error';
  }
  if (eventType === EventType.PERMISSION_REQUESTED || eventType === EventType.QUESTION_REQUESTED || eventType === EventType.PLAN_REQUESTED) {
    return 'permission';
  }
  return 'status';
}

function statusForEvent(eventType, payload) {
  if (eventType === EventType.ERROR) {
    return AgentStatus.ERROR;
  }
  if (eventType === EventType.MESSAGE_DELTA || eventType === EventType.TOOL_STARTED || eventType === EventType.TOOL_OUTPUT) {
    return AgentStatus.RUNNING;
  }
  if (eventType === EventType.MESSAGE_COMPLETED || eventType === EventType.TOOL_COMPLETED) {
    return AgentStatus.IDLE;
  }
  if (eventType === EventType.SESSION_UPDATED && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const session = payload.session && typeof payload.session === 'object' && !Array.isArray(payload.session) ? payload.session : null;
    const status = session && typeof session.status === 'string' ? session.status : '';
    if (status === 'running') {
      return AgentStatus.RUNNING;
    }
    if (status === 'error') {
      return AgentStatus.ERROR;
    }
    if (status === 'closed') {
      return AgentStatus.CLOSED;
    }
    if (status.length > 0) {
      return AgentStatus.IDLE;
    }
  }
  return '';
}

function requiresAttentionForEvent(eventType) {
  return eventType === EventType.ERROR ||
    eventType === EventType.PERMISSION_REQUESTED ||
    eventType === EventType.QUESTION_REQUESTED ||
    eventType === EventType.PLAN_REQUESTED;
}

function attentionReasonForEvent(eventType) {
  if (eventType === EventType.ERROR) {
    return 'error';
  }
  if (eventType === EventType.PERMISSION_REQUESTED || eventType === EventType.QUESTION_REQUESTED || eventType === EventType.PLAN_REQUESTED) {
    return 'permission';
  }
  return '';
}

class AgentManager {
  constructor(options) {
    this.store = options.store;
    this.workspaceRegistry = options.workspaceRegistry;
    this.records = new Map();
    this.sessionToAgent = new Map();
    this.loadRecords();
  }

  loadRecords() {
    const records = this.store.listAgentRecords();
    for (const record of records) {
      const normalized = this.normalizeRecord(record);
      this.records.set(normalized.id, normalized);
      if (normalized.providerSessionId.length > 0) {
        this.sessionToAgent.set(normalized.providerSessionId, normalized.id);
      }
      if (normalized.remoteSessionId.length > 0) {
        this.sessionToAgent.set(normalized.remoteSessionId, normalized.id);
      }
    }
    this.migrateRelationships();
  }

  normalizeRecord(source) {
    const timeline = Array.isArray(source.timeline) ? source.timeline : [];
    const providerSessionId = typeof source.providerSessionId === 'string' ? source.providerSessionId : '';
    const remoteSessionId = typeof source.remoteSessionId === 'string' ? source.remoteSessionId : '';
    const cwd = normalizeRootPath(typeof source.cwd === 'string' ? source.cwd : '');
    const workspace = this.workspaceForRecord(source, cwd);
    const rootPath = normalizeRootPath(typeof source.rootPath === 'string' && source.rootPath.length > 0
      ? source.rootPath
      : (workspace && typeof workspace.cwd === 'string' ? workspace.cwd : cwd));
    const workspaceKind = workspace && typeof workspace.kind === 'string' ? workspace.kind : '';
    const workspaceMode = source.workspaceMode === 'isolated' || workspaceKind === 'worktree' ? 'isolated' : 'shared';
    const createdAt = typeof source.createdAt === 'string' ? source.createdAt : nowIso();
    const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : createdAt;
    return {
      schemaVersion: 2,
      id: typeof source.id === 'string' && source.id.length > 0 ? source.id : randomId('agt'),
      provider: typeof source.provider === 'string' ? source.provider : '',
      cwd,
      workspaceId: typeof source.workspaceId === 'string' ? source.workspaceId : '',
      rootPath,
      workspaceMode,
      worktreeId: typeof source.worktreeId === 'string'
        ? source.worktreeId
        : (workspaceMode === 'isolated' && typeof source.workspaceId === 'string' ? source.workspaceId : ''),
      runtimeOwnerId: typeof source.runtimeOwnerId === 'string' && source.runtimeOwnerId.length > 0
        ? source.runtimeOwnerId
        : (typeof source.id === 'string' ? source.id : ''),
      ownershipStatus: source.ownershipStatus === 'unresolved' || source.ownershipStatus === 'archived'
        ? source.ownershipStatus
        : (rootPath.length > 0 ? 'valid' : 'unresolved'),
      executionPolicy: normalizeExecutionPolicy(source.executionPolicy),
      forkContext: source.forkContext && typeof source.forkContext === 'object' && !Array.isArray(source.forkContext)
        ? source.forkContext
        : null,
      pendingForkContext: source.pendingForkContext && typeof source.pendingForkContext === 'object' && !Array.isArray(source.pendingForkContext)
        ? source.pendingForkContext
        : null,
      lifecycleState: source.lifecycleState === 'closing' || source.lifecycleState === 'disconnected' || source.lifecycleState === 'archived'
        ? source.lifecycleState
        : 'active',
      writeAccessRevokedAt: typeof source.writeAccessRevokedAt === 'string' ? source.writeAccessRevokedAt : '',
      lastCleanupResult: normalizeCleanupResult(source.lastCleanupResult),
      migrationNotes: dedupeStringArray(source.migrationNotes),
      providerSessionId,
      remoteSessionId,
      title: typeof source.title === 'string' ? source.title : '',
      labels: source.labels && typeof source.labels === 'object' && !Array.isArray(source.labels) ? source.labels : {},
      config: source.config && typeof source.config === 'object' && !Array.isArray(source.config) ? source.config : {},
      lastStatus: typeof source.lastStatus === 'string' ? source.lastStatus : AgentStatus.IDLE,
      lastModeId: typeof source.lastModeId === 'string' ? source.lastModeId : '',
      modelId: typeof source.modelId === 'string' ? source.modelId : '',
      thinkingOptionId: typeof source.thinkingOptionId === 'string' ? source.thinkingOptionId : '',
      features: Array.isArray(source.features) ? source.features : [],
      persistence: source.persistence && typeof source.persistence === 'object' && !Array.isArray(source.persistence) ? source.persistence : null,
      runtimeInfo: source.runtimeInfo && typeof source.runtimeInfo === 'object' && !Array.isArray(source.runtimeInfo) ? source.runtimeInfo : null,
      lastError: typeof source.lastError === 'string' ? source.lastError : '',
      requiresAttention: typeof source.requiresAttention === 'boolean' ? source.requiresAttention : false,
      attentionReason: typeof source.attentionReason === 'string' ? source.attentionReason : '',
      attentionTimestamp: typeof source.attentionTimestamp === 'string' ? source.attentionTimestamp : '',
      parentAgentId: typeof source.parentAgentId === 'string' ? source.parentAgentId : '',
      rootAgentId: typeof source.rootAgentId === 'string' ? source.rootAgentId : '',
      childAgentIds: dedupeStringArray(source.childAgentIds),
      detached: typeof source.detached === 'boolean' ? source.detached : false,
      forkedFromAgentId: typeof source.forkedFromAgentId === 'string' ? source.forkedFromAgentId : '',
      forkedFromCheckpointId: typeof source.forkedFromCheckpointId === 'string' ? source.forkedFromCheckpointId : '',
      relationshipUpdatedAt: typeof source.relationshipUpdatedAt === 'string' ? source.relationshipUpdatedAt : '',
      checkpoints: Array.isArray(source.checkpoints) ? source.checkpoints : [],
      internal: typeof source.internal === 'boolean' ? source.internal : false,
      archivedAt: typeof source.archivedAt === 'string' ? source.archivedAt : '',
      createdAt,
      updatedAt,
      lastActivityAt: typeof source.lastActivityAt === 'string' ? source.lastActivityAt : updatedAt,
      lastUserMessageAt: typeof source.lastUserMessageAt === 'string' ? source.lastUserMessageAt : '',
      timelineAck: source.timelineAck && typeof source.timelineAck === 'object' && !Array.isArray(source.timelineAck) ? source.timelineAck : {},
      nextSeq: typeof source.nextSeq === 'number' && Number.isFinite(source.nextSeq) ? source.nextSeq : this.nextSeqFromTimeline(timeline),
      currentEpoch: typeof source.currentEpoch === 'number' && Number.isFinite(source.currentEpoch) ? source.currentEpoch : 1,
      timeline
    };
  }

  workspaceForRecord(source, cwd) {
    if (!this.workspaceRegistry || typeof this.workspaceRegistry.listWorkspaces !== 'function') {
      return null;
    }
    const workspaceId = typeof source.workspaceId === 'string' ? source.workspaceId : '';
    const workspaces = this.workspaceRegistry.listWorkspaces({ includeArchived: true, validate: false });
    for (const workspace of workspaces) {
      if (!workspace) {
        continue;
      }
      if (workspaceId.length > 0 && workspace.workspaceId === workspaceId) {
        return workspace;
      }
      if (workspaceId.length === 0 && cwd.length > 0 && normalizeRootPath(workspace.cwd) === cwd) {
        return workspace;
      }
    }
    return null;
  }

  migrateRelationships() {
    const ordered = Array.from(this.records.values()).sort((left, right) => {
      return epochMsFromIso(left.createdAt) - epochMsFromIso(right.createdAt);
    });
    for (const record of ordered) {
      record.runtimeOwnerId = record.id;
      if (record.archivedAt.length > 0) {
        record.lifecycleState = 'archived';
        record.ownershipStatus = 'archived';
        if (record.writeAccessRevokedAt.length === 0) {
          record.writeAccessRevokedAt = record.archivedAt;
        }
      }
      record.childAgentIds = [];
      if (!record.forkContext && record.forkedFromAgentId.length > 0) {
        record.forkContext = this.buildForkContextFromLegacy(record);
        record.migrationNotes = appendUniqueString(record.migrationNotes, 'schema_v1_fork_context_migrated');
      }
    }
    for (const record of ordered) {
      if (record.detached || record.parentAgentId.length === 0) {
        record.parentAgentId = '';
        record.rootAgentId = record.id;
        continue;
      }
      const parent = this.records.get(record.parentAgentId);
      if (!parent || this.relationshipPathContains(parent, record.id)) {
        record.parentAgentId = '';
        record.rootAgentId = record.id;
        record.detached = true;
        record.migrationNotes = appendUniqueString(record.migrationNotes, parent ? 'schema_v1_cycle_detached' : 'schema_v1_orphan_detached');
        continue;
      }
      parent.childAgentIds = appendUniqueString(parent.childAgentIds, record.id);
      record.rootAgentId = parent.rootAgentId.length > 0 ? parent.rootAgentId : parent.id;
    }
    for (const record of ordered) {
      this.store.writeAgentRecord(record);
    }
  }

  relationshipPathContains(record, targetId) {
    const seen = new Set();
    let cursor = record;
    while (cursor && cursor.parentAgentId.length > 0 && !seen.has(cursor.id)) {
      if (cursor.id === targetId || cursor.parentAgentId === targetId) {
        return true;
      }
      seen.add(cursor.id);
      cursor = this.records.get(cursor.parentAgentId) || null;
    }
    return false;
  }

  buildForkContextFromLegacy(record) {
    return {
      sourceAgentId: record.forkedFromAgentId,
      checkpointId: record.forkedFromCheckpointId,
      timelineEpoch: record.currentEpoch,
      timelineSeq: 0,
      providerId: record.provider,
      modelId: record.modelId,
      modeId: record.lastModeId,
      thinkingOptionId: record.thinkingOptionId,
      executionPolicy: normalizeExecutionPolicy(record.executionPolicy),
      runtimeInherited: false,
      runtimeInheritanceReason: 'provider_fork_unsupported'
    };
  }

  nextSeqFromTimeline(timeline) {
    let maxSeq = 0;
    for (const item of timeline) {
      if (item && typeof item.seq === 'number' && item.seq > maxSeq) {
        maxSeq = item.seq;
      }
    }
    return maxSeq + 1;
  }

  persist(record) {
    record.updatedAt = nowIso();
    this.records.set(record.id, record);
    if (record.providerSessionId.length > 0) {
      this.sessionToAgent.set(record.providerSessionId, record.id);
    }
    if (record.remoteSessionId.length > 0) {
      this.sessionToAgent.set(record.remoteSessionId, record.id);
    }
    this.store.writeAgentRecord(record);
  }

  upsertFromSession(session, payload) {
    const providerSessionId = typeof session.sessionId === 'string' ? session.sessionId : '';
    const remoteSessionId = typeof session.remoteSessionId === 'string' ? session.remoteSessionId : providerSessionId;
    const existing = this.findBySessionId(providerSessionId) || this.findBySessionId(remoteSessionId);
    const workspacePath = readString(payload, 'workspacePath', typeof session.workspacePath === 'string' ? session.workspacePath : '');
    const workspaceTitle = readString(payload, 'workspaceTitle', typeof session.workspaceTitle === 'string' ? session.workspaceTitle : '');
    const workspace = this.workspaceRegistry ? this.workspaceRegistry.upsertWorkspace(Object.assign({}, payload || {}, {
      workspacePath,
      cwd: workspacePath,
      workspaceTitle,
      title: workspaceTitle
    })) : null;
    const record = existing || this.normalizeRecord({
      id: randomId('agt'),
      provider: typeof session.providerId === 'string' ? session.providerId : readString(payload, 'providerId', ''),
      cwd: workspacePath,
      workspaceId: workspace ? workspace.workspaceId : '',
      providerSessionId,
      remoteSessionId,
      title: typeof session.title === 'string' ? session.title : workspaceTitle,
      lastStatus: AgentStatus.INITIALIZING,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      timeline: []
    });
    record.provider = typeof session.providerId === 'string' ? session.providerId : record.provider;
    record.cwd = workspacePath.length > 0 ? workspacePath : record.cwd;
    record.workspaceId = workspace ? workspace.workspaceId : record.workspaceId;
    record.rootPath = normalizeRootPath(record.cwd);
    record.workspaceMode = workspace && workspace.kind === 'worktree' ? 'isolated' : record.workspaceMode;
    record.worktreeId = record.workspaceMode === 'isolated' ? record.workspaceId : '';
    record.runtimeOwnerId = record.id;
    record.ownershipStatus = record.rootPath.length > 0 ? 'valid' : 'unresolved';
    record.lifecycleState = 'active';
    record.providerSessionId = providerSessionId.length > 0 ? providerSessionId : record.providerSessionId;
    record.remoteSessionId = remoteSessionId.length > 0 ? remoteSessionId : record.remoteSessionId;
    record.title = typeof session.title === 'string' && session.title.length > 0 ? session.title : record.title;
    record.modelId = typeof session.modelId === 'string' ? session.modelId : record.modelId;
    record.lastModeId = typeof session.speedMode === 'string' ? session.speedMode : record.lastModeId;
    record.thinkingOptionId = typeof session.reasoningMode === 'string' ? session.reasoningMode : record.thinkingOptionId;
    record.lastStatus = session.status === 'running' ? AgentStatus.RUNNING : AgentStatus.IDLE;
    record.config = {
      providerId: record.provider,
      modelId: record.modelId,
      modeId: record.lastModeId,
      thinkingOptionId: record.thinkingOptionId,
      workspaceId: record.workspaceId,
      cwd: record.rootPath,
      rootPath: record.rootPath,
      workspaceMode: record.workspaceMode,
      worktreeId: record.worktreeId,
      runtimeOwnerId: record.runtimeOwnerId,
      parentAgentId: record.parentAgentId,
      rootAgentId: record.rootAgentId
    };
    record.runtimeInfo = {
      provider: record.provider,
      sessionId: record.providerSessionId,
      model: record.modelId,
      modeId: record.lastModeId,
      remoteSessionId: record.remoteSessionId,
      runtimeMode: typeof session.runtimeMode === 'string' ? session.runtimeMode : 'oneshot',
      interactiveReady: session.interactiveReady === true,
      sessionState: typeof session.sessionState === 'string' ? session.sessionState : '',
      pid: typeof session.pid === 'number' ? session.pid : 0,
      startedAt: typeof session.startedAt === 'number' ? session.startedAt : 0,
      lastActivityAt: typeof session.lastActivityAt === 'number' ? session.lastActivityAt : 0,
      exitCode: typeof session.exitCode === 'number' ? session.exitCode : null,
      lastError: typeof session.lastError === 'string' ? session.lastError : '',
      recentOutputTail: typeof session.recentOutputTail === 'string' ? session.recentOutputTail : ''
    };
    this.appendTimeline(record, 'status', EventType.SESSION_CREATED, {
      session
    }, {
      type: EventType.SESSION_CREATED,
      payload: {
        session
      }
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  bindSession(agentId, session) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const providerSessionId = readString(session, 'sessionId', '');
    const remoteSessionId = readString(session, 'remoteSessionId', providerSessionId);
    record.providerSessionId = providerSessionId;
    record.remoteSessionId = remoteSessionId;
    record.runtimeOwnerId = record.id;
    record.lifecycleState = 'active';
    record.lastStatus = session.status === 'running' ? AgentStatus.RUNNING : AgentStatus.IDLE;
    record.runtimeInfo = runtimeInfoFromSession(session, record);
    record.runtimeInfo.runtimeInherited = false;
    record.runtimeInfo.runtimeInheritanceReason = 'provider_fork_unsupported';
    record.config = Object.assign({}, record.config || {}, {
      providerId: record.provider,
      workspaceId: record.workspaceId,
      cwd: record.rootPath,
      rootPath: record.rootPath,
      runtimeOwnerId: record.runtimeOwnerId
    });
    this.appendTimeline(record, 'status', EventType.SESSION_CREATED, { session }, {
      type: EventType.SESSION_CREATED,
      payload: { session }
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  createPlaceholder(payload) {
    const providerId = readString(payload, 'providerId', 'mock');
    const workspacePath = readString(payload, 'workspacePath', readString(payload, 'cwd', ''));
    const workspaceTitle = readString(payload, 'workspaceTitle', readString(payload, 'title', ''));
    const workspace = this.workspaceRegistry ? this.workspaceRegistry.upsertWorkspace(payload) : null;
    const now = nowIso();
    const record = this.normalizeRecord({
      id: randomId('agt'),
      provider: providerId,
      cwd: workspacePath,
      workspaceId: workspace ? workspace.workspaceId : readString(payload, 'workspaceId', ''),
      rootPath: workspacePath,
      workspaceMode: readString(payload, 'workspaceMode', workspace && workspace.kind === 'worktree' ? 'isolated' : 'shared'),
      worktreeId: workspace && workspace.kind === 'worktree' ? workspace.workspaceId : '',
      providerSessionId: '',
      remoteSessionId: '',
      title: workspaceTitle,
      lastStatus: AgentStatus.INITIALIZING,
      lastModeId: readString(payload, 'modeId', readString(payload, 'speedMode', '')),
      modelId: readString(payload, 'modelId', ''),
      thinkingOptionId: readString(payload, 'thinkingOptionId', readString(payload, 'reasoningMode', '')),
      executionPolicy: {
        permissionPolicyId: readString(payload, 'permissionPolicyId', ''),
        sandboxPolicyId: readString(payload, 'sandboxPolicyId', '')
      },
      parentAgentId: readString(payload, 'parentAgentId', ''),
      rootAgentId: readString(payload, 'rootAgentId', ''),
      detached: readBoolean(payload, 'detached', false),
      forkedFromAgentId: readString(payload, 'forkedFromAgentId', ''),
      forkedFromCheckpointId: readString(payload, 'forkedFromCheckpointId', ''),
      features: readStringArray(payload.features),
      createdAt: now,
      updatedAt: now,
      timeline: []
    });
    this.normalizeNewRelationship(record);
    record.runtimeOwnerId = record.id;
    record.config = {
      providerId: record.provider,
      modelId: record.modelId,
      modeId: record.lastModeId,
      thinkingOptionId: record.thinkingOptionId,
      workspaceId: record.workspaceId,
      cwd: record.rootPath,
      rootPath: record.rootPath,
      workspaceMode: record.workspaceMode,
      worktreeId: record.worktreeId,
      runtimeOwnerId: record.runtimeOwnerId,
      parentAgentId: record.parentAgentId,
      rootAgentId: record.rootAgentId
    };
    record.persistence = {
      strategy: 'daemon-store',
      serverOwned: true
    };
    record.runtimeInfo = {
      provider: record.provider,
      sessionId: '',
      remoteSessionId: ''
    };
    this.appendTimeline(record, 'status', 'agent.created', {
      agentId: record.id,
      providerId,
      workspaceId: record.workspaceId
    }, {
      type: 'agent.created',
      payload
    });
    this.persist(record);
    this.linkParent(record);
    return this.publicRecord(record);
  }

  normalizeNewRelationship(record) {
    if (!record) {
      return;
    }
    if (record.detached || record.parentAgentId.length === 0) {
      record.parentAgentId = record.detached ? '' : record.parentAgentId;
      record.rootAgentId = record.id;
      record.relationshipUpdatedAt = nowIso();
      return;
    }
    const parent = this.find(record.parentAgentId);
    if (!parent) {
      if (record.rootAgentId.length === 0) {
        record.rootAgentId = record.id;
      }
      record.relationshipUpdatedAt = nowIso();
      return;
    }
    record.rootAgentId = parent.rootAgentId.length > 0 ? parent.rootAgentId : parent.id;
    record.relationshipUpdatedAt = nowIso();
  }

  linkParent(record) {
    if (!record || typeof record.parentAgentId !== 'string' || record.parentAgentId.length === 0 || record.detached) {
      return;
    }
    const parent = this.find(record.parentAgentId);
    if (!parent) {
      return;
    }
    parent.childAgentIds = appendUniqueString(parent.childAgentIds, record.id);
    parent.relationshipUpdatedAt = nowIso();
    record.rootAgentId = parent.rootAgentId.length > 0 ? parent.rootAgentId : parent.id;
    record.relationshipUpdatedAt = nowIso();
    this.persist(record);
    this.persist(parent);
  }

  unlinkParent(record) {
    if (!record || typeof record.parentAgentId !== 'string' || record.parentAgentId.length === 0) {
      return;
    }
    const parent = this.find(record.parentAgentId);
    if (!parent) {
      return;
    }
    const nextChildren = [];
    for (const childId of parent.childAgentIds) {
      if (childId !== record.id) {
        nextChildren.push(childId);
      }
    }
    parent.childAgentIds = nextChildren;
    parent.relationshipUpdatedAt = nowIso();
    this.persist(parent);
  }

  findBySessionId(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return null;
    }
    const agentId = this.sessionToAgent.get(sessionId);
    if (!agentId) {
      return null;
    }
    return this.records.get(agentId) || null;
  }

  find(agentId) {
    if (typeof agentId !== 'string' || agentId.length === 0) {
      return null;
    }
    return this.records.get(agentId) || null;
  }

  relationshipRecords(payload) {
    const includeArchived = payload && typeof payload === 'object' && !Array.isArray(payload) &&
      typeof payload.includeArchived === 'boolean' ? payload.includeArchived : false;
    const records = [];
    for (const record of this.records.values()) {
      if (!includeArchived && record.archivedAt.length > 0) {
        continue;
      }
      records.push(record);
    }
    records.sort((left, right) => epochMsFromIso(right.updatedAt) - epochMsFromIso(left.updatedAt));
    return records;
  }

  list(payload) {
    const result = [];
    for (const record of this.relationshipRecords(payload)) {
      result.push(this.publicRecord(record));
    }
    return result;
  }

  listResult(payload) {
    return {
      agents: this.list(payload),
      relationshipTree: this.relationshipTree(payload),
      relationshipDoctor: this.relationshipDoctor(payload)
    };
  }

  isRootAgent(record) {
    if (!record) {
      return false;
    }
    return record.parentAgentId.length === 0 || record.detached || record.rootAgentId === record.id;
  }

  relationshipDepth(record) {
    if (!record || record.parentAgentId.length === 0 || record.detached) {
      return 0;
    }
    let depth = 0;
    let cursor = record;
    const seen = new Set();
    while (cursor && cursor.parentAgentId.length > 0 && !cursor.detached) {
      if (seen.has(cursor.id)) {
        return depth;
      }
      seen.add(cursor.id);
      const parent = this.find(cursor.parentAgentId);
      if (!parent) {
        return depth + 1;
      }
      depth += 1;
      cursor = parent;
      if (depth > 100) {
        return depth;
      }
    }
    return depth;
  }

  hasRelationshipCycle(record) {
    if (!record) {
      return false;
    }
    const seen = new Set();
    let cursor = record;
    while (cursor && cursor.parentAgentId.length > 0) {
      if (seen.has(cursor.id)) {
        return true;
      }
      seen.add(cursor.id);
      const parent = this.find(cursor.parentAgentId);
      if (!parent) {
        return false;
      }
      cursor = parent;
    }
    return false;
  }

  relationshipWarningsForRecord(record) {
    const warnings = [];
    if (!record) {
      return warnings;
    }
    if (this.hasRelationshipCycle(record)) {
      warnings.push(publicRelationshipWarning(
        'relationship_cycle',
        'Agent relationship contains a parent cycle.',
        'Detach one agent or repair parentAgentId in the bridge store.'
      ));
    }
    if (record.detached && record.parentAgentId.length > 0) {
      warnings.push(publicRelationshipWarning(
        'detached_has_parent',
        'Detached agent still points to a parent.',
        'Detach the agent again or clear parentAgentId in the bridge store.'
      ));
    }
    if (!record.detached && record.parentAgentId.length > 0) {
      const parent = this.find(record.parentAgentId);
      if (!parent) {
        warnings.push(publicRelationshipWarning(
          'parent_missing',
          'Parent agent is missing from the bridge store.',
          'Detach this agent or restore the missing parent record.'
        ));
      } else {
        if (!Array.isArray(parent.childAgentIds) || !parent.childAgentIds.includes(record.id)) {
          warnings.push(publicRelationshipWarning(
            'parent_missing_child_link',
            'Parent does not list this agent as a child.',
            'Run a relationship repair or detach and reattach the child.'
          ));
        }
        const expectedRootAgentId = parent.rootAgentId.length > 0 ? parent.rootAgentId : parent.id;
        if (record.rootAgentId.length > 0 && record.rootAgentId !== expectedRootAgentId) {
          warnings.push(publicRelationshipWarning(
            'root_mismatch',
            'Agent root does not match its parent tree root.',
            'Detach and fork from the expected root, or repair rootAgentId.'
          ));
        }
      }
    }
    if (record.rootAgentId.length > 0 && record.rootAgentId !== record.id && !this.find(record.rootAgentId)) {
      warnings.push(publicRelationshipWarning(
        'root_missing',
        'Root agent is missing from the bridge store.',
        'Restore the root record or detach this agent into a new root.'
      ));
    }
    for (const childId of record.childAgentIds) {
      const child = this.find(childId);
      if (!child) {
        warnings.push(publicRelationshipWarning(
          'child_missing',
          'A listed child agent is missing from the bridge store.',
          'Remove the stale child id or restore the child record.'
        ));
        continue;
      }
      if (!child.detached && child.parentAgentId !== record.id) {
        warnings.push(publicRelationshipWarning(
          'child_parent_mismatch',
          'A listed child points at a different parent.',
          'Repair the child parentAgentId or unlink it from this parent.'
        ));
      }
      if (record.archivedAt.length > 0 && child.archivedAt.length === 0) {
        warnings.push(publicRelationshipWarning(
          'archived_with_active_child',
          'Archived agent still has an active child.',
          'Use cascade archive when the child should be closed too.'
        ));
      }
    }
    return warnings;
  }

  relationshipStatus(record) {
    const warnings = this.relationshipWarningsForRecord(record);
    if (warnings.length > 0) {
      return 'warning';
    }
    if (!record) {
      return 'unknown';
    }
    if (record.detached) {
      return 'detached';
    }
    if (this.isRootAgent(record)) {
      return 'root';
    }
    return 'child';
  }

  relationshipTree(payload) {
    const includeArchived = payload && typeof payload === 'object' && !Array.isArray(payload) &&
      typeof payload.includeArchived === 'boolean' ? payload.includeArchived : false;
    const roots = [];
    const visited = new Set();
    for (const record of this.records.values()) {
      if (!includeArchived && record.archivedAt.length > 0) {
        continue;
      }
      const parent = record.parentAgentId.length > 0 ? this.find(record.parentAgentId) : null;
      const visibleParent = parent && (includeArchived || parent.archivedAt.length === 0) ? parent : null;
      if (record.detached || record.parentAgentId.length === 0 || !visibleParent) {
        roots.push(this.relationshipTreeNode(record, includeArchived, visited));
      }
    }
    roots.sort((left, right) => {
      if (left.updatedAt === right.updatedAt) {
        return left.agentId.localeCompare(right.agentId);
      }
      return epochMsFromIso(right.updatedAt) - epochMsFromIso(left.updatedAt);
    });
    return roots;
  }

  relationshipTreeNode(record, includeArchived, visited) {
    const node = {
      agentId: record.id,
      title: record.title,
      provider: record.provider,
      parentAgentId: record.parentAgentId,
      rootAgentId: record.rootAgentId,
      detached: record.detached,
      forkedFromAgentId: record.forkedFromAgentId,
      forkedFromCheckpointId: record.forkedFromCheckpointId,
      archived: record.archivedAt.length > 0,
      updatedAt: record.updatedAt,
      relationshipStatus: this.relationshipStatus(record),
      relationshipWarnings: this.relationshipWarningsForRecord(record),
      depth: this.relationshipDepth(record),
      children: []
    };
    if (visited.has(record.id)) {
      node.relationshipWarnings = node.relationshipWarnings.concat([publicRelationshipWarning(
        'tree_cycle_skipped',
        'Tree rendering skipped a repeated agent.',
        'Run agent doctor and repair the relationship cycle.'
      )]);
      node.relationshipStatus = 'warning';
      return node;
    }
    visited.add(record.id);
    const children = [];
    for (const childId of record.childAgentIds) {
      const child = this.find(childId);
      if (!child || child.detached) {
        continue;
      }
      if (!includeArchived && child.archivedAt.length > 0) {
        continue;
      }
      children.push(child);
    }
    children.sort((left, right) => epochMsFromIso(right.updatedAt) - epochMsFromIso(left.updatedAt));
    for (const child of children) {
      node.children.push(this.relationshipTreeNode(child, includeArchived, visited));
    }
    visited.delete(record.id);
    return node;
  }

  relationshipDoctor(payload) {
    const checks = [];
    let warningCount = 0;
    const records = this.relationshipRecords(Object.assign({}, payload || {}, {
      includeArchived: true
    }));
    for (const record of records) {
      const warnings = this.relationshipWarningsForRecord(record);
      for (const warning of warnings) {
        warningCount += 1;
        checks.push({
          id: 'agent_relationship_' + record.id + '_' + warning.code,
          status: 'warning',
          agentId: record.id,
          code: warning.code,
          message: warning.message,
          remediation: warning.remediation
        });
      }
    }
    if (checks.length === 0) {
      checks.push({
        id: 'agent_relationship_integrity',
        status: 'ok',
        agentId: '',
        code: 'ok',
        message: 'Agent relationship graph is internally consistent.',
        remediation: ''
      });
    }
    return {
      status: warningCount === 0 ? 'ok' : 'warning',
      totalAgents: records.length,
      warnings: warningCount,
      checks
    };
  }

  appendUserMessage(sessionId, payload) {
    const record = this.findBySessionId(sessionId);
    if (!record) {
      return null;
    }
    this.assertCanSend(record);
    return this.appendUserMessageToRecord(record, payload);
  }

  appendUserMessageByAgent(agentId, payload) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    this.assertCanSend(record);
    return this.appendUserMessageToRecord(record, payload);
  }

  appendUserMessageToRecord(record, payload) {
    const text = readString(payload, 'text', '');
    const now = nowIso();
    record.lastStatus = AgentStatus.RUNNING;
    record.lastActivityAt = now;
    record.lastUserMessageAt = now;
    this.appendTimeline(record, 'message', 'user.message', {
      role: 'user',
      text
    }, {
      type: 'user.message',
      payload
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  assertCanSend(record) {
    if (record.lastStatus === AgentStatus.CLOSED || record.archivedAt.length > 0 || record.lifecycleState === 'closing' || record.writeAccessRevokedAt.length > 0) {
      throw new Error('Agent is closed: ' + record.id);
    }
  }

  resourceScope(agentId, options) {
    const record = this.find(agentId);
    if (!record) {
      return { ok: false, code: 'agent_not_found', message: 'Agent not found.' };
    }
    const write = options && options.write === true;
    if (write && (record.lifecycleState === 'closing' || record.lifecycleState === 'archived' || record.writeAccessRevokedAt.length > 0 || record.archivedAt.length > 0)) {
      return { ok: false, code: 'agent_write_access_revoked', message: 'Agent workspace write access has been revoked.' };
    }
    if (record.ownershipStatus !== 'valid' || record.rootPath.length === 0) {
      return { ok: false, code: 'agent_ownership_unresolved', message: 'Agent workspace ownership is unresolved.' };
    }
    return {
      ok: true,
      agentId: record.id,
      workspaceId: record.workspaceId,
      rootPath: record.rootPath,
      worktreeId: record.worktreeId,
      runtimeOwnerId: record.runtimeOwnerId,
      workspaceMode: record.workspaceMode,
      providerSessionId: record.providerSessionId,
      remoteSessionId: record.remoteSessionId,
      lifecycleState: record.lifecycleState
    };
  }

  validateResourceScope(agentId, payload, options) {
    const scope = this.resourceScope(agentId, options);
    if (!scope.ok) {
      return scope;
    }
    const requestedWorkspaceId = readString(payload, 'workspaceId', '');
    const requestedSessionId = readString(payload, 'sessionId', '');
    const requestedPath = normalizeRootPath(readString(payload, 'workspacePath', readString(payload, 'cwd', '')));
    const sessionMatches = requestedSessionId.length === 0 || requestedSessionId === scope.providerSessionId || requestedSessionId === scope.remoteSessionId;
    const workspaceMatches = requestedWorkspaceId.length === 0 || requestedWorkspaceId === scope.workspaceId;
    const pathMatches = requestedPath.length === 0 || requestedPath === scope.rootPath;
    if (!sessionMatches || !workspaceMatches || !pathMatches) {
      return {
        ok: false,
        code: 'agent_resource_scope_mismatch',
        message: 'Requested resource does not belong to the Agent workspace scope.',
        scope
      };
    }
    return scope;
  }

  providerPayloadForAgent(agentId, payload) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const nextPayload = Object.assign({}, payload || {});
    nextPayload.agentId = record.id;
    nextPayload.providerId = record.provider;
    nextPayload.sessionId = record.providerSessionId;
    nextPayload.remoteSessionId = record.remoteSessionId;
    nextPayload.workspaceId = record.workspaceId;
    nextPayload.workspacePath = record.rootPath;
    nextPayload.cwd = record.rootPath;
    nextPayload.rootPath = record.rootPath;
    nextPayload.worktreeId = record.worktreeId;
    nextPayload.runtimeOwnerId = record.runtimeOwnerId;
    // Normalize the legacy `message` alias to `text` so every provider send path
    // (agent.run / agent.send / message.send / message.queue.retry) behaves the
    // same way the agent.run handler does (server.js readString(text, message)).
    nextPayload.text = readString(nextPayload, 'text', readString(nextPayload, 'message', ''));
    if (readString(nextPayload, 'modelId', '').length === 0 && record.modelId.length > 0) {
      nextPayload.modelId = record.modelId;
    }
    if (readString(nextPayload, 'speedMode', '').length === 0 && record.lastModeId.length > 0) {
      nextPayload.speedMode = record.lastModeId;
      nextPayload.modeId = record.lastModeId;
    }
    if (readString(nextPayload, 'reasoningMode', '').length === 0 && record.thinkingOptionId.length > 0) {
      nextPayload.reasoningMode = record.thinkingOptionId;
      nextPayload.thinkingOptionId = record.thinkingOptionId;
    }
    return {
      agent: record,
      payload: nextPayload
    };
  }

  providerMessagePayloadForAgent(agentId, payload) {
    const routed = this.providerPayloadForAgent(agentId, payload);
    if (!routed) {
      return null;
    }
    this.injectPendingForkContext(routed.agent, routed.payload, true);
    return routed;
  }

  providerMessagePayloadForSession(sessionId, payload) {
    const record = this.findBySessionId(sessionId);
    if (!record) {
      const nextPayload = Object.assign({}, payload || {});
      nextPayload.text = readString(nextPayload, 'text', readString(nextPayload, 'message', ''));
      return nextPayload;
    }
    const nextPayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    nextPayload.text = readString(nextPayload, 'text', readString(nextPayload, 'message', ''));
    this.injectPendingForkContext(record, nextPayload, false);
    return nextPayload;
  }

  markPendingForkContextConsumedForSession(sessionId, payload) {
    const record = this.findBySessionId(sessionId);
    const pending = record && record.pendingForkContext && typeof record.pendingForkContext === 'object' && !Array.isArray(record.pendingForkContext)
      ? record.pendingForkContext
      : null;
    if (!pending || (typeof pending.consumedAt === 'string' && pending.consumedAt.length > 0)) return false;
    const attachment = pending.attachment && typeof pending.attachment === 'object' && !Array.isArray(pending.attachment)
      ? pending.attachment
      : null;
    const items = payload && Array.isArray(payload.contextItems) ? payload.contextItems : [];
    const attached = !attachment || items.some((item) => item && typeof item === 'object' && item.kind === 'chat-history' && item.digest === attachment.digest);
    if (!attached) return false;
    pending.consumedAt = nowIso();
    pending.consumedMessageId = readString(payload, 'clientMessageId', '');
    this.persist(record);
    return true;
  }

  injectPendingForkContext(record, payload, consumeImmediately) {
    const pending = record && record.pendingForkContext && typeof record.pendingForkContext === 'object' && !Array.isArray(record.pendingForkContext)
      ? record.pendingForkContext
      : null;
    if (!pending || (typeof pending.consumedAt === 'string' && pending.consumedAt.length > 0)) {
      return false;
    }
    const attachment = pending.attachment && typeof pending.attachment === 'object' && !Array.isArray(pending.attachment)
      ? pending.attachment
      : null;
    if (!attachment) {
      if (consumeImmediately) {
        pending.consumedAt = nowIso();
        pending.consumedMessageId = readString(payload, 'clientMessageId', '');
        this.persist(record);
      }
      return false;
    }
    const contextItems = Array.isArray(payload.contextItems) ? payload.contextItems.slice(0, 31) : [];
    const alreadyAttached = contextItems.some((item) => item && typeof item === 'object' && item.kind === 'chat-history' && item.digest === attachment.digest);
    if (!alreadyAttached) contextItems.push(Object.assign({}, attachment));
    payload.contextItems = contextItems;
    if (consumeImmediately) {
      pending.consumedAt = nowIso();
      pending.consumedMessageId = readString(payload, 'clientMessageId', '');
      this.persist(record);
    }
    return true;
  }

  observeBridgeEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return null;
    }
    const sessionId = typeof event.sessionId === 'string' ? event.sessionId : '';
    const eventType = typeof event.event === 'string' ? event.event : '';
    const record = this.findBySessionId(sessionId);
    if (!record || eventType.length === 0) {
      return null;
    }
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {};
    const nextStatus = statusForEvent(eventType, payload);
    if (nextStatus.length > 0) {
      record.lastStatus = nextStatus;
    }
    record.lastActivityAt = nowIso();
    if (requiresAttentionForEvent(eventType)) {
      record.requiresAttention = true;
      record.attentionReason = attentionReasonForEvent(eventType);
      record.attentionTimestamp = record.lastActivityAt;
      if (eventType === EventType.ERROR) {
        record.lastError = readString(payload, 'message', readString(payload, 'error', 'Agent error'));
      }
    }
    if (eventType === EventType.SESSION_UPDATED) {
      const session = readObject(payload, 'session');
      if (session) {
        record.runtimeInfo = runtimeInfoFromSession(session, record);
        const runtimeError = readString(record.runtimeInfo, 'lastError', '');
        if (runtimeError.length > 0) {
          record.lastError = runtimeError;
        }
      }
    }
    const timelineItem = this.appendTimeline(record, eventKind(eventType), eventType, payload, event);
    if (eventType === EventType.MESSAGE_COMPLETED && timelineItem && timelineItem.projectedItem) {
      const canonical = timelineItem.projectedItem;
      event.payload = Object.assign({}, payload, {
        messageId: canonical.messageId,
        text: canonical.text,
        contentNodes: canonical.contentNodes,
        timelineEpoch: canonical.timelineEpoch,
        timelineSeq: canonical.timelineSeq,
        durableMessageId: canonical.durableMessageId
      });
    }
    this.persist(record);
    return this.publicRecord(record);
  }

  updateRuntimeInfo(agentId, runtimeInfo) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const source = runtimeInfo && typeof runtimeInfo === 'object' && !Array.isArray(runtimeInfo) ? runtimeInfo : {};
    record.runtimeInfo = Object.assign({}, record.runtimeInfo || {}, source);
    const runtimeError = readString(record.runtimeInfo, 'lastError', '');
    if (runtimeError.length > 0) {
      record.lastError = runtimeError;
    }
    record.lastActivityAt = nowIso();
    this.persist(record);
    return this.publicRecord(record);
  }

  appendTimeline(record, kind, eventType, projectedItem, providerRaw) {
    const seq = record.nextSeq;
    record.nextSeq = record.nextSeq + 1;
    const timelineItem = {
      agentId: record.id,
      epoch: record.currentEpoch,
      seq,
      kind,
      eventType,
      projectedItem: this.projectTimelineItem(record, kind, eventType, projectedItem, seq),
      providerRaw,
      createdAt: Date.now()
    };
    record.timeline.push(timelineItem);
    if (record.timeline.length > 5000) {
      record.timeline = record.timeline.slice(record.timeline.length - 5000);
    }
    return timelineItem;
  }

  projectTimelineItem(record, kind, eventType, projectedItem, seq) {
    const source = projectedItem && typeof projectedItem === 'object' && !Array.isArray(projectedItem) ? projectedItem : {};
    if (kind === 'message') {
      return this.projectMessageTimelineItem(record, eventType, source, seq);
    }
    if (kind === 'tool') {
      return this.projectToolTimelineItem(record, eventType, source, seq);
    }
    if (kind === 'permission') {
      const requestId = readString(source, 'requestId', readString(source, 'id', String(seq)));
      return Object.assign({}, source, {
        projectionId: 'permission:' + requestId,
        status: readString(source, 'status', eventType === EventType.PLAN_REQUESTED ? 'pending' : 'requested')
      });
    }
    return Object.assign({}, source, {
      projectionId: kind + ':' + String(seq)
    });
  }

  projectMessageTimelineItem(record, eventType, source, seq) {
    const explicitMessageId = readString(source, 'messageId', readString(source, 'id', ''));
    const contentKind = readString(source, 'contentKind', 'text');
    const activeMessage = explicitMessageId.length === 0
      ? this.findLatestStreamingMessage(record, readString(source, 'role', 'assistant'), contentKind)
      : null;
    const messageId = explicitMessageId.length > 0
      ? explicitMessageId
      : (activeMessage ? activeMessage.projectedItem.messageId : record.id + ':message:' + String(seq));
    const projectionId = 'message:' + messageId;
    const previous = this.findLatestTimelineProjection(record, projectionId);
    const previousItem = previous && previous.projectedItem && typeof previous.projectedItem === 'object' ? previous.projectedItem : {};
    const incomingText = readString(source, 'text', readString(source, 'content', ''));
    const previousText = readString(previousItem, 'text', '');
    const text = eventType === EventType.MESSAGE_DELTA ? previousText + incomingText : (incomingText.length > 0 ? incomingText : previousText);
    const completed = eventType === EventType.MESSAGE_COMPLETED;
    const result = Object.assign({}, source, {
      projectionId,
      messageId,
      role: readString(source, 'role', readString(previousItem, 'role', eventType === 'user.message' ? 'user' : 'assistant')),
      text,
      contentKind: readString(source, 'contentKind', readString(previousItem, 'contentKind', 'text')),
      status: completed ? 'completed' : (eventType === EventType.MESSAGE_DELTA ? 'streaming' : 'created'),
      durableMessageId: explicitMessageId.length > 0 || previousItem.durableMessageId === true,
      timelineEpoch: record.currentEpoch,
      timelineSeq: seq
    });
    if (completed) {
      result.contentNodes = normalizeRichContentNodes(source.contentNodes, text, { workspaceId: record.workspaceId, requireFullTextCoverage: true });
    } else {
      delete result.contentNodes;
    }
    return result;
  }

  findLatestStreamingMessage(record, role, contentKind) {
    for (let index = record.timeline.length - 1; index >= 0; index -= 1) {
      const item = record.timeline[index];
      const projected = item && item.projectedItem && typeof item.projectedItem === 'object' ? item.projectedItem : null;
      if (!projected || item.kind !== 'message') {
        continue;
      }
      if (readString(projected, 'status', '') !== 'streaming') {
        return null;
      }
      if (readString(projected, 'role', 'assistant') === role && readString(projected, 'contentKind', 'text') === contentKind) {
        return item;
      }
    }
    return null;
  }

  projectToolTimelineItem(record, eventType, source, seq) {
    const toolCallId = readString(source, 'toolCallId',
      readString(source, 'tool_use_id',
        readString(source, 'toolUseId',
          readString(source, 'id', String(seq)))));
    const projectionId = 'tool:' + toolCallId;
    const previous = this.findLatestTimelineProjection(record, projectionId);
    const previousItem = previous && previous.projectedItem && typeof previous.projectedItem === 'object' ? previous.projectedItem : {};
    const incomingOutput = readString(source, 'outputText', readString(source, 'output', readString(source, 'text', '')));
    const previousOutput = readString(previousItem, 'outputText', '');
    let status = readString(source, 'status', readString(previousItem, 'status', 'running'));
    if (eventType === EventType.TOOL_STARTED) {
      status = 'started';
    } else if (eventType === EventType.TOOL_OUTPUT) {
      status = 'running';
    } else if (eventType === EventType.TOOL_COMPLETED) {
      status = 'completed';
    }
    return Object.assign({}, previousItem, source, {
      projectionId,
      toolCallId,
      name: readString(source, 'name', readString(source, 'toolName', readString(previousItem, 'name', ''))),
      status,
      outputText: eventType === EventType.TOOL_OUTPUT ? previousOutput + incomingOutput : (incomingOutput.length > 0 ? incomingOutput : previousOutput),
      errorText: readString(source, 'errorText', readString(source, 'error', readString(previousItem, 'errorText', '')))
    });
  }

  findLatestTimelineProjection(record, projectionId) {
    if (typeof projectionId !== 'string' || projectionId.length === 0) {
      return null;
    }
    for (let index = record.timeline.length - 1; index >= 0; index -= 1) {
      const item = record.timeline[index];
      if (!item || !item.projectedItem || typeof item.projectedItem !== 'object') {
        continue;
      }
      if (item.projectedItem.projectionId === projectionId) {
        return item;
      }
    }
    return null;
  }

  publicTimelineItem(item, includeProviderRaw) {
    const result = {
      agentId: item.agentId,
      epoch: item.epoch,
      seq: item.seq,
      kind: item.kind,
      eventType: item.eventType,
      projectedItem: item.projectedItem || {},
      createdAt: item.createdAt
    };
    if (includeProviderRaw) {
      result.providerRaw = item.providerRaw || null;
    }
    return result;
  }

  fetchTimeline(payload) {
    const agentId = readString(payload, 'agentId', '');
    const direction = readString(payload, 'direction', 'after');
    const cursor = parseCursor(readString(payload, 'cursor', ''));
    const limit = normalizeTimelineLimit(readNumber(payload, 'limit', 200));
    const includeProviderRaw = readBoolean(payload, 'debugRaw', false);
    const record = this.find(agentId);
    if (!record) {
      return {
        agentId,
        items: [],
        startCursor: '',
        endCursor: '',
        hasOlder: false,
        hasNewer: false,
        error: 'agent_not_found'
      };
    }

    let filtered = [];
    if (direction === 'before' && cursor > 0) {
      for (const item of record.timeline) {
        if (item.seq < cursor) {
          filtered.push(item);
        }
      }
      if (filtered.length > limit) {
        filtered = filtered.slice(filtered.length - limit);
      }
    } else if (cursor > 0) {
      for (const item of record.timeline) {
        if (item.seq > cursor) {
          filtered.push(item);
        }
      }
      if (filtered.length > limit) {
        filtered = filtered.slice(0, limit);
      }
    } else {
      filtered = record.timeline.length > limit ? record.timeline.slice(record.timeline.length - limit) : record.timeline.slice();
    }

    const first = filtered.length > 0 ? filtered[0] : null;
    const last = filtered.length > 0 ? filtered[filtered.length - 1] : null;
    return {
      agentId,
      items: filtered.map((item) => this.publicTimelineItem(item, includeProviderRaw)),
      startCursor: first ? String(first.seq) : '',
      endCursor: last ? String(last.seq) : '',
      hasOlder: first ? first.seq > 1 : false,
      hasNewer: last ? last.seq < record.nextSeq - 1 : false,
      latestSeq: record.nextSeq - 1
    };
  }

  resume(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    if (record.archivedAt.length > 0 || record.lifecycleState === 'archived' || record.writeAccessRevokedAt.length > 0) {
      return null;
    }
    record.lastStatus = AgentStatus.IDLE;
    record.lastActivityAt = nowIso();
    this.appendTimeline(record, 'status', 'agent.resumed', {
      agentId
    }, {
      type: 'agent.resumed',
      agentId
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  stop(agentId, abortResult) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    if (record.lastStatus !== AgentStatus.CLOSED) {
      record.lastStatus = AgentStatus.IDLE;
    }
    record.lastActivityAt = nowIso();
    this.appendTimeline(record, 'status', 'turn_canceled', {
      agentId,
      status: 'canceled',
      result: abortResult || null
    }, {
      type: 'turn_canceled',
      agentId,
      result: abortResult || null
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  update(agentId, payload) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const title = readString(payload, 'title', '');
    if (title.length > 0) {
      record.title = title;
    }
    const workspaceTitle = readString(payload, 'workspaceTitle', '');
    if (workspaceTitle.length > 0 && record.title.length === 0) {
      record.title = workspaceTitle;
    }
    const config = readObject(payload, 'config');
    if (config) {
      record.config = Object.assign({}, record.config || {}, config);
    }
    const runtimeInfo = readObject(payload, 'runtimeInfo');
    if (runtimeInfo) {
      record.runtimeInfo = Object.assign({}, record.runtimeInfo || {}, runtimeInfo);
    }
    const features = payload && typeof payload === 'object' ? readStringArray(payload.features) : [];
    if (features.length > 0) {
      record.features = features;
    }
    record.lastActivityAt = nowIso();
    this.appendTimeline(record, 'status', 'agent.updated', {
      agentId,
      title: record.title,
      config: record.config,
      runtimeInfo: record.runtimeInfo,
      features: record.features
    }, {
      type: 'agent.updated',
      payload
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  setMode(agentId, modeId, thinkingOptionId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    record.lastModeId = modeId;
    if (typeof thinkingOptionId === 'string' && thinkingOptionId.length > 0) {
      record.thinkingOptionId = thinkingOptionId;
    }
    record.config = Object.assign({}, record.config || {}, {
      modeId: record.lastModeId,
      thinkingOptionId: record.thinkingOptionId
    });
    this.appendTimeline(record, 'status', 'agent.mode.set', {
      agentId,
      modeId: record.lastModeId,
      thinkingOptionId: record.thinkingOptionId
    }, {
      type: 'agent.mode.set',
      agentId
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  setModel(agentId, modelId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    record.modelId = modelId;
    record.config = Object.assign({}, record.config || {}, {
      modelId: record.modelId
    });
    this.appendTimeline(record, 'status', 'agent.model.set', {
      agentId,
      modelId: record.modelId
    }, {
      type: 'agent.model.set',
      agentId
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  resolveForkBoundary(agentId, payload) {
    const source = this.find(agentId);
    if (!source) {
      return { ok: false, code: 'agent_not_found', message: 'Agent not found.' };
    }
    if (source.archivedAt.length > 0 || source.lifecycleState === 'archived') {
      return { ok: false, code: 'fork_source_archived', message: 'Archived Agents cannot be forked from a message boundary.' };
    }
    const boundaryMessageId = readString(payload, 'boundaryMessageId', '');
    if (boundaryMessageId.length === 0) {
      return { ok: false, code: 'fork_boundary_required', message: 'A durable completed message id is required.' };
    }
    let boundary = null;
    for (let index = source.timeline.length - 1; index >= 0; index -= 1) {
      const item = source.timeline[index];
      const projected = item && item.projectedItem && typeof item.projectedItem === 'object' && !Array.isArray(item.projectedItem)
        ? item.projectedItem
        : null;
      if (!projected || item.kind !== 'message' || projected.messageId !== boundaryMessageId) {
        continue;
      }
      if (projected.status === 'completed' && projected.role === 'assistant') {
        boundary = item;
        break;
      }
    }
    if (!boundary) {
      return { ok: false, code: 'fork_boundary_not_found', message: 'The completed assistant message boundary was not found.' };
    }
    if (boundary.epoch !== source.currentEpoch) {
      return { ok: false, code: 'fork_boundary_stale_epoch', message: 'The message belongs to an older timeline epoch.' };
    }
    if (boundary.projectedItem.durableMessageId !== true) {
      return { ok: false, code: 'fork_boundary_not_durable', message: 'The selected message does not have a durable Provider message id.' };
    }
    const requestedEpoch = readNumber(payload, 'timelineEpoch', 0);
    const requestedSeq = readNumber(payload, 'timelineSeq', 0);
    if (requestedEpoch > 0 && requestedEpoch !== boundary.epoch) {
      return { ok: false, code: 'fork_boundary_epoch_mismatch', message: 'The timeline epoch changed after the message was selected.' };
    }
    if (requestedSeq > 0 && requestedSeq !== boundary.seq) {
      return { ok: false, code: 'fork_boundary_seq_mismatch', message: 'The timeline cursor changed after the message was selected.' };
    }
    const checkpointId = readString(payload, 'checkpointId', '');
    const checkpoint = checkpointId.length > 0 ? this.findCheckpoint(agentId, checkpointId) : null;
    if (checkpointId.length > 0 && !checkpoint) {
      return { ok: false, code: 'checkpoint_not_found', message: 'Fork checkpoint does not belong to the source Agent.' };
    }
    if (checkpoint && (checkpoint.epoch !== boundary.epoch || checkpoint.latestSeq > boundary.seq)) {
      return { ok: false, code: 'fork_checkpoint_boundary_mismatch', message: 'The checkpoint is newer than, or outside, the selected message boundary.' };
    }
    const history = this.buildForkHistoryAttachment(source, boundary);
    return {
      ok: true,
      sourceAgentId: source.id,
      boundaryMessageId,
      timelineEpoch: boundary.epoch,
      timelineSeq: boundary.seq,
      boundaryCursor: String(boundary.seq),
      checkpointId,
      contextItemCount: history.contextItemCount,
      contextDigest: history.contextDigest,
      attachment: history.attachment,
      warnings: history.warnings
    };
  }

  buildForkHistoryAttachment(source, boundary) {
    const projections = new Map();
    for (const item of source.timeline) {
      if (!item || item.epoch !== boundary.epoch || item.seq > boundary.seq) {
        continue;
      }
      const projected = item.projectedItem && typeof item.projectedItem === 'object' && !Array.isArray(item.projectedItem)
        ? item.projectedItem
        : null;
      if (!projected || (item.kind !== 'message' && item.kind !== 'tool')) {
        continue;
      }
      const projectionId = readString(projected, 'projectionId', '');
      if (projectionId.length === 0) {
        continue;
      }
      projections.set(projectionId, { seq: item.seq, kind: item.kind, projected });
    }
    const ordered = Array.from(projections.values()).sort((left, right) => left.seq - right.seq);
    const lines = ['<agent_bridge_fork_history>'];
    let contextItemCount = 0;
    let truncated = false;
    for (const item of ordered) {
      if (item.kind === 'message') {
        const role = readString(item.projected, 'role', '');
        const status = readString(item.projected, 'status', '');
        const contentKind = readString(item.projected, 'contentKind', 'text');
        if ((role !== 'user' && role !== 'assistant') || contentKind === 'reasoning' || (role === 'assistant' && status !== 'completed')) {
          continue;
        }
        const limited = truncateText(this.redactForkHistoryText(readString(item.projected, 'text', '')), 16 * 1024, 240);
        if (limited.text.length === 0) {
          continue;
        }
        truncated = truncated || limited.truncated;
        lines.push('');
        lines.push(role === 'user' ? 'User:' : 'Assistant:');
        lines.push(limited.text);
        contextItemCount += 1;
      } else {
        const name = this.redactForkHistoryText(readString(item.projected, 'name', 'tool'));
        const status = this.redactForkHistoryText(readString(item.projected, 'status', 'completed'));
        lines.push('');
        lines.push('Tool summary: ' + name.substring(0, 160) + ' [' + status.substring(0, 64) + ']');
        contextItemCount += 1;
      }
      if (contextItemCount >= 200 || Buffer.byteLength(lines.join('\n'), 'utf8') > 96 * 1024) {
        truncated = true;
        break;
      }
    }
    lines.push('</agent_bridge_fork_history>');
    const limitedHistory = truncateText(lines.join('\n'), 96 * 1024, 1600);
    truncated = truncated || limitedHistory.truncated;
    const contextDigest = crypto.createHash('sha256')
      .update(source.id + ':' + String(boundary.epoch) + ':' + String(boundary.seq) + ':' + limitedHistory.text)
      .digest('hex');
    return {
      contextItemCount,
      contextDigest,
      attachment: {
        kind: 'chat-history',
        path: '',
        uri: '',
        title: 'Forked conversation context',
        content: limitedHistory.text,
        mediaType: 'text/plain',
        digest: contextDigest
      },
      warnings: truncated ? ['fork_context_truncated'] : []
    };
  }

  redactForkHistoryText(value) {
    return String(value || '')
      .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/gi, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED]')
      .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED]')
      .replace(/\b(token|password|secret|credential|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
      .replace(/\bhttps?:\/\/[^\s<>"']+/gi, (candidate) => {
        const authorityMatch = candidate.match(/^(https?:\/\/)([^/?#\s]+)([\s\S]*)$/i);
        if (!authorityMatch) return candidate;
        const authority = authorityMatch[2];
        const atIndex = authority.lastIndexOf('@');
        if (atIndex < 0) return candidate;
        return authorityMatch[1] + '[REDACTED]@' + authority.substring(atIndex + 1) + authorityMatch[3];
      })
      .replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|client_secret|secret|password|credential)=)[^&#\s]*/gi, '$1[REDACTED]');
  }

  fork(agentId, payload, validatedBoundary) {
    const source = this.find(agentId);
    if (!source) {
      return null;
    }
    const now = nowIso();
    const checkpointId = readString(payload, 'checkpointId', '');
    const checkpoint = checkpointId.length > 0 ? this.findCheckpoint(agentId, checkpointId) : null;
    if (checkpointId.length > 0 && !checkpoint) {
      return {
        code: 'checkpoint_not_found',
        message: 'Fork checkpoint does not belong to the source Agent.'
      };
    }
    const title = readString(payload, 'title', source.title.length > 0 ? source.title + ' fork' : 'Forked agent');
    const detached = readBoolean(payload, 'detached', false);
    const requestedParentAgentId = readString(payload, 'parentAgentId', source.id);
    const workspaceMode = readString(payload, 'workspaceMode', source.workspaceMode === 'isolated' ? 'shared' : 'shared') === 'isolated' ? 'isolated' : 'shared';
    const rootPath = normalizeRootPath(readString(payload, 'rootPath', readString(payload, 'workspacePath', source.rootPath)));
    const workspaceId = readString(payload, 'workspaceId', source.workspaceId);
    const boundary = validatedBoundary && validatedBoundary.ok === true ? validatedBoundary : null;
    const timelineEpoch = boundary ? boundary.timelineEpoch : (checkpoint ? checkpoint.epoch : source.currentEpoch);
    const timelineSeq = boundary ? boundary.timelineSeq : (checkpoint ? checkpoint.latestSeq : source.nextSeq - 1);
    const executionPolicy = normalizeExecutionPolicy(readObject(payload, 'executionPolicy') || source.executionPolicy);
    const forkContext = {
      sourceAgentId: source.id,
      checkpointId,
      boundaryMessageId: boundary ? boundary.boundaryMessageId : '',
      timelineEpoch,
      timelineSeq,
      contextDigest: boundary ? boundary.contextDigest : '',
      providerId: source.provider,
      modelId: source.modelId,
      modeId: source.lastModeId,
      thinkingOptionId: source.thinkingOptionId,
      executionPolicy,
      runtimeInherited: false,
      runtimeInheritanceReason: 'provider_fork_unsupported'
    };
    const fork = this.normalizeRecord({
      id: randomId('agt'),
      provider: source.provider,
      cwd: rootPath,
      rootPath,
      workspaceId,
      workspaceMode,
      worktreeId: workspaceMode === 'isolated' ? workspaceId : '',
      providerSessionId: '',
      remoteSessionId: '',
      title,
      lastStatus: AgentStatus.IDLE,
      lastModeId: source.lastModeId,
      modelId: source.modelId,
      thinkingOptionId: source.thinkingOptionId,
      executionPolicy,
      forkContext,
      pendingForkContext: boundary ? {
        attachment: boundary.attachment,
        contextDigest: boundary.contextDigest,
        boundaryMessageId: boundary.boundaryMessageId,
        timelineEpoch: boundary.timelineEpoch,
        timelineSeq: boundary.timelineSeq,
        consumedAt: '',
        consumedMessageId: ''
      } : null,
      labels: Object.assign({}, source.labels || {}),
      config: Object.assign({}, source.config || {}),
      features: source.features.slice(),
      parentAgentId: detached ? '' : requestedParentAgentId,
      rootAgentId: source.rootAgentId.length > 0 ? source.rootAgentId : source.id,
      detached,
      forkedFromAgentId: source.id,
      forkedFromCheckpointId: checkpointId,
      createdAt: now,
      updatedAt: now,
      timeline: []
    });
    this.normalizeNewRelationship(fork);
    fork.runtimeOwnerId = fork.id;
    fork.runtimeInfo = {
      provider: fork.provider,
      sessionId: '',
      remoteSessionId: '',
      sessionState: 'not_started',
      runtimeInherited: false,
      runtimeInheritanceReason: 'provider_fork_unsupported'
    };
    fork.config = Object.assign({}, fork.config || {}, {
      parentAgentId: fork.parentAgentId,
      rootAgentId: fork.rootAgentId,
      forkedFromAgentId: source.id,
      forkedFromCheckpointId: checkpointId,
      workspaceId: fork.workspaceId,
      cwd: fork.rootPath,
      rootPath: fork.rootPath,
      workspaceMode: fork.workspaceMode,
      worktreeId: fork.worktreeId,
      runtimeOwnerId: fork.runtimeOwnerId,
      executionPolicy: fork.executionPolicy,
      forkContext
    });
    this.appendTimeline(fork, 'status', 'agent.forked', {
      agentId: fork.id,
      parentAgentId: fork.parentAgentId,
      rootAgentId: fork.rootAgentId,
      forkedFromAgentId: source.id,
      forkedFromCheckpointId: checkpointId,
      workspaceMode: fork.workspaceMode,
      workspaceId: fork.workspaceId,
      rootPath: fork.rootPath,
      forkContext
    }, {
      type: 'agent.forked',
      payload
    });
    this.persist(fork);
    this.linkParent(fork);
    source.relationshipUpdatedAt = nowIso();
    this.appendTimeline(source, 'status', 'agent.child.created', {
      agentId: source.id,
      childAgentId: fork.id
    }, {
      type: 'agent.child.created',
      childAgentId: fork.id
    });
    this.persist(source);
    return {
      agent: this.publicRecord(fork),
      parent: this.publicRecord(source),
      relationshipTree: this.relationshipTree({ includeArchived: false }),
      relationshipDoctor: this.relationshipDoctor({ includeArchived: true })
    };
  }

  detach(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const previousParentAgentId = record.parentAgentId;
    this.unlinkParent(record);
    record.parentAgentId = '';
    record.detached = true;
    record.rootAgentId = record.id;
    record.relationshipUpdatedAt = nowIso();
    this.appendTimeline(record, 'status', 'agent.detached', {
      agentId,
      previousParentAgentId
    }, {
      type: 'agent.detached',
      agentId,
      previousParentAgentId
    });
    this.persist(record);
    const updatedDescendants = this.updateDescendantRoots(record, record.id);
    const publicAgent = this.publicRecord(record);
    return Object.assign({}, publicAgent, {
      agent: publicAgent,
      previousParentAgentId,
      updatedDescendants,
      relationshipTree: this.relationshipTree({ includeArchived: false }),
      relationshipDoctor: this.relationshipDoctor({ includeArchived: true })
    });
  }

  updateDescendantRoots(record, rootAgentId) {
    const updated = [];
    const seen = new Set();
    seen.add(record.id);
    const descendants = this.collectChildRecords(record, seen);
    for (const child of descendants) {
      if (!child || child.detached) {
        continue;
      }
      child.rootAgentId = rootAgentId;
      child.relationshipUpdatedAt = nowIso();
      this.persist(child);
      updated.push(this.publicRecord(child));
    }
    return updated;
  }

  normalizeCheckpoint(source, record) {
    const createdAt = typeof source.createdAt === 'string' ? source.createdAt : nowIso();
    const latestSeq = typeof source.latestSeq === 'number' && Number.isFinite(source.latestSeq) ? Math.floor(source.latestSeq) : record.nextSeq - 1;
    return {
      checkpointId: typeof source.checkpointId === 'string' && source.checkpointId.length > 0 ? source.checkpointId : randomId('chk'),
      agentId: record.id,
      title: typeof source.title === 'string' ? source.title : '',
      description: typeof source.description === 'string' ? source.description : '',
      epoch: typeof source.epoch === 'number' && Number.isFinite(source.epoch) ? Math.floor(source.epoch) : record.currentEpoch,
      latestSeq,
      providerSessionId: record.providerSessionId,
      remoteSessionId: record.remoteSessionId,
      workspaceId: record.workspaceId,
      cwd: record.cwd,
      fileSnapshotStatus: typeof source.fileSnapshotStatus === 'string' ? source.fileSnapshotStatus : 'not_captured',
      fileSnapshotId: typeof source.fileSnapshotId === 'string' ? source.fileSnapshotId : '',
      filesScanned: typeof source.filesScanned === 'number' && Number.isFinite(source.filesScanned) ? Math.floor(source.filesScanned) : 0,
      filesCaptured: typeof source.filesCaptured === 'number' && Number.isFinite(source.filesCaptured) ? Math.floor(source.filesCaptured) : 0,
      skippedCount: typeof source.skippedCount === 'number' && Number.isFinite(source.skippedCount) ? Math.floor(source.skippedCount) : 0,
      workspaceRoot: typeof source.workspaceRoot === 'string' ? source.workspaceRoot : record.cwd,
      filePolicy: readObjectValue(source, 'filePolicy'),
      skippedReasons: readSkippedReasons(source, 'skippedReasons'),
      manifestVerified: typeof source.manifestVerified === 'boolean' ? source.manifestVerified : false,
      runtimeCheckpointStatus: typeof source.runtimeCheckpointStatus === 'string' ? source.runtimeCheckpointStatus : 'not_requested',
      runtimeCheckpointKind: typeof source.runtimeCheckpointKind === 'string' ? source.runtimeCheckpointKind : '',
      runtimeRestoreSupported: source.runtimeRestoreSupported === true,
      runtimeCheckpoint: source.runtimeCheckpoint && typeof source.runtimeCheckpoint === 'object' && !Array.isArray(source.runtimeCheckpoint) ? source.runtimeCheckpoint : null,
      runtimeRestoreStatus: typeof source.runtimeRestoreStatus === 'string' ? source.runtimeRestoreStatus : 'not_requested',
      runtimeRestored: source.runtimeRestored === true,
      runtimeRestoreReason: typeof source.runtimeRestoreReason === 'string' && source.runtimeRestoreReason.length > 0
        ? source.runtimeRestoreReason
        : 'provider_runtime_state_is_recorded_not_rewound',
      terminalCheckpointStatus: typeof source.terminalCheckpointStatus === 'string' ? source.terminalCheckpointStatus : 'not_requested',
      terminalCheckpointKind: typeof source.terminalCheckpointKind === 'string' ? source.terminalCheckpointKind : '',
      terminalRestoreSupported: source.terminalRestoreSupported === true,
      terminalCheckpoint: source.terminalCheckpoint && typeof source.terminalCheckpoint === 'object' && !Array.isArray(source.terminalCheckpoint)
        ? source.terminalCheckpoint
        : null,
      createdAt
    };
  }

  publicCheckpoint(checkpoint) {
    return {
      checkpointId: checkpoint.checkpointId,
      agentId: checkpoint.agentId,
      title: checkpoint.title,
      description: checkpoint.description,
      epoch: checkpoint.epoch,
      latestSeq: checkpoint.latestSeq,
      providerSessionId: checkpoint.providerSessionId,
      remoteSessionId: checkpoint.remoteSessionId,
      workspaceId: checkpoint.workspaceId,
      cwd: checkpoint.cwd,
      fileSnapshotStatus: checkpoint.fileSnapshotStatus,
      fileSnapshotId: checkpoint.fileSnapshotId,
      filesScanned: checkpoint.filesScanned,
      filesCaptured: checkpoint.filesCaptured,
      skippedCount: checkpoint.skippedCount,
      workspaceRoot: checkpoint.workspaceRoot,
      filePolicy: checkpoint.filePolicy,
      skippedReasons: checkpoint.skippedReasons,
      manifestVerified: checkpoint.manifestVerified,
      runtimeCheckpointStatus: checkpoint.runtimeCheckpointStatus,
      runtimeCheckpointKind: checkpoint.runtimeCheckpointKind,
      runtimeRestoreSupported: checkpoint.runtimeRestoreSupported,
      runtimeRestoreStatus: checkpoint.runtimeRestoreStatus,
      runtimeRestored: checkpoint.runtimeRestored === true,
      runtimeRestoreReason: checkpoint.runtimeRestoreReason,
      terminalCheckpointStatus: checkpoint.terminalCheckpointStatus,
      terminalCheckpointKind: checkpoint.terminalCheckpointKind,
      terminalRestoreSupported: checkpoint.terminalRestoreSupported,
      createdAt: checkpoint.createdAt
    };
  }

  findCheckpoint(agentId, checkpointId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    for (const item of record.checkpoints) {
      const normalized = this.normalizeCheckpoint(item, record);
      if (normalized.checkpointId === checkpointId) {
        return normalized;
      }
    }
    return null;
  }

  listCheckpoints(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const checkpoints = [];
    for (const checkpoint of record.checkpoints) {
      checkpoints.push(this.publicCheckpoint(this.normalizeCheckpoint(checkpoint, record)));
    }
    checkpoints.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return {
      agentId,
      checkpoints
    };
  }

  createCheckpoint(agentId, payload) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const checkpoint = this.normalizeCheckpoint({
      checkpointId: randomId('chk'),
      title: readString(payload, 'title', ''),
      description: readString(payload, 'description', ''),
      latestSeq: record.nextSeq - 1,
      fileSnapshotStatus: readString(payload, 'fileSnapshotStatus', 'not_captured'),
      fileSnapshotId: readString(payload, 'fileSnapshotId', ''),
      filesScanned: readNumber(payload, 'filesScanned', 0),
      filesCaptured: readNumber(payload, 'filesCaptured', 0),
      skippedCount: readNumber(payload, 'skippedCount', 0),
      workspaceRoot: readString(payload, 'workspaceRoot', record.cwd),
      filePolicy: readObjectValue(payload, 'filePolicy'),
      skippedReasons: readSkippedReasons(payload, 'skippedReasons'),
      manifestVerified: readBoolean(payload, 'manifestVerified', false),
      runtimeCheckpointStatus: readString(payload, 'runtimeCheckpointStatus', 'not_requested'),
      runtimeCheckpointKind: readString(payload, 'runtimeCheckpointKind', ''),
      runtimeRestoreSupported: readBoolean(payload, 'runtimeRestoreSupported', false),
      runtimeCheckpoint: readObject(payload, 'runtimeCheckpoint'),
      runtimeRestoreStatus: 'not_requested',
      runtimeRestoreReason: readString(payload, 'runtimeRestoreReason', 'runtime_restore_not_requested'),
      terminalCheckpointStatus: readString(payload, 'terminalCheckpointStatus', 'not_requested'),
      terminalCheckpointKind: readString(payload, 'terminalCheckpointKind', ''),
      terminalRestoreSupported: readBoolean(payload, 'terminalRestoreSupported', false),
      terminalCheckpoint: readObject(payload, 'terminalCheckpoint'),
      createdAt: nowIso()
    }, record);
    record.checkpoints = [checkpoint].concat(record.checkpoints || []);
    if (record.checkpoints.length > 100) {
      record.checkpoints = record.checkpoints.slice(0, 100);
    }
    this.appendTimeline(record, 'status', 'checkpoint.created', {
      agentId,
      checkpoint: this.publicCheckpoint(checkpoint)
    }, {
      type: 'checkpoint.created',
      checkpoint: this.publicCheckpoint(checkpoint)
    });
    this.persist(record);
    return {
      agent: this.publicRecord(record),
      checkpoint: this.publicCheckpoint(checkpoint)
    };
  }

  restoreCheckpoint(agentId, checkpointId, options) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    let checkpoint = null;
    for (const item of record.checkpoints) {
      const normalized = this.normalizeCheckpoint(item, record);
      if (normalized.checkpointId === checkpointId) {
        checkpoint = normalized;
        break;
      }
    }
    if (!checkpoint) {
      return {
        code: 'checkpoint_not_found',
        message: 'Checkpoint not found.'
      };
    }
    const restoreOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const fileRestore = restoreOptions.fileRestore && typeof restoreOptions.fileRestore === 'object' && !Array.isArray(restoreOptions.fileRestore)
      ? restoreOptions.fileRestore
      : null;
    const dryRun = restoreOptions.dryRun === true;
    const restoreFiles = restoreOptions.restoreFiles === true;
    const filesRestored = fileRestore && typeof fileRestore.files === 'boolean' ? fileRestore.files : false;
    const fileRestoreStatus = fileRestore && typeof fileRestore.status === 'string' ? fileRestore.status : '';
    const conflicts = fileRestore && Array.isArray(fileRestore.conflicts) ? fileRestore.conflicts : [];
    const restoreBlocked = fileRestore && fileRestore.restoreBlocked === true;
    const preRestoreSnapshotId = fileRestore && typeof fileRestore.preRestoreSnapshotId === 'string' ? fileRestore.preRestoreSnapshotId : '';
    const restorePlanId = fileRestore && typeof fileRestore.restorePlanId === 'string' ? fileRestore.restorePlanId : '';
    const manifestVerified = fileRestore && typeof fileRestore.manifestVerified === 'boolean' ? fileRestore.manifestVerified : false;
    const filesSkipped = fileRestore && typeof fileRestore.filesSkipped === 'number' ? fileRestore.filesSkipped : 0;
    const filesRestoredCount = fileRestore && typeof fileRestore.filesRestored === 'number' ? fileRestore.filesRestored : 0;
    const filesVerified = fileRestore && typeof fileRestore.filesVerified === 'number' ? fileRestore.filesVerified : 0;
    const verifyErrors = fileRestore && Array.isArray(fileRestore.verifyErrors) ? fileRestore.verifyErrors : [];
    const workspaceRoot = fileRestore && typeof fileRestore.workspaceRoot === 'string' && fileRestore.workspaceRoot.length > 0 ? fileRestore.workspaceRoot : checkpoint.workspaceRoot;
    const filePolicy = fileRestore && fileRestore.filePolicy && typeof fileRestore.filePolicy === 'object' && !Array.isArray(fileRestore.filePolicy) ? fileRestore.filePolicy : checkpoint.filePolicy;
    const skippedReasons = fileRestore && Array.isArray(fileRestore.skippedReasons) ? fileRestore.skippedReasons : checkpoint.skippedReasons;
    const runtimeRestore = restoreOptions.runtimeRestore && typeof restoreOptions.runtimeRestore === 'object' && !Array.isArray(restoreOptions.runtimeRestore)
      ? restoreOptions.runtimeRestore
      : {};
    const runtimeRestored = runtimeRestore.restored === true;
    const runtimeRestoreStatus = readString(runtimeRestore, 'status', 'not_requested');
    const runtimeRestoreReason = readString(runtimeRestore, 'reason', runtimeRestoreStatus === 'not_requested' ? 'runtime_restore_not_requested' : checkpoint.runtimeRestoreReason);
    const terminalRestore = restoreOptions.terminalRestore && typeof restoreOptions.terminalRestore === 'object' && !Array.isArray(restoreOptions.terminalRestore)
      ? restoreOptions.terminalRestore
      : {};
    const terminalRestored = terminalRestore.restored === true;
    const terminalRestoreStatus = readString(terminalRestore, 'status', 'not_requested');
    const terminalRestoreReason = readString(terminalRestore, 'reason', terminalRestoreStatus === 'not_requested' ? 'terminal_restore_not_requested' : 'terminal_restore_unavailable');
    const buildRestoreLayers = (timelineRestored) => ({
      files: {
        requested: restoreFiles,
        status: fileRestoreStatus.length > 0 ? fileRestoreStatus : (restoreFiles ? 'unavailable' : 'not_requested'),
        restored: filesRestored,
        reason: fileRestoreStatus.length > 0 ? fileRestoreStatus : (restoreFiles ? 'file_snapshot_unavailable' : 'file_restore_not_requested')
      },
      timeline: {
        requested: true,
        status: dryRun ? 'ready' : (timelineRestored ? 'restored' : 'not_restored'),
        restored: timelineRestored,
        reason: dryRun ? 'timeline_restore_ready' : (timelineRestored ? 'timeline_restored_to_checkpoint' : 'timeline_not_restored')
      },
      runtime: {
        requested: runtimeRestoreStatus !== 'not_requested',
        status: runtimeRestoreStatus,
        restored: runtimeRestored,
        reason: runtimeRestoreReason
      },
      terminal: {
        requested: terminalRestoreStatus !== 'not_requested',
        status: terminalRestoreStatus,
        restored: terminalRestored,
        reason: terminalRestoreReason
      }
    });
    if (dryRun) {
      return {
        agent: this.publicRecord(record),
        checkpoint: this.publicCheckpoint(checkpoint),
        dryRun: true,
        fileSnapshotStatus: checkpoint.fileSnapshotStatus,
        fileSnapshotId: checkpoint.fileSnapshotId,
        filesScanned: checkpoint.filesScanned,
        filesCaptured: checkpoint.filesCaptured,
        conflicts,
        restoreBlocked,
        preRestoreSnapshotId,
        restorePlanId,
        manifestVerified,
        filesSkipped,
        filesRestored: filesRestoredCount,
        filesVerified,
        verifyErrors,
        workspaceRoot,
        filePolicy,
        skippedReasons,
        runtimeRestoreStatus,
        runtimeRestored,
        runtimeRestoreReason,
        layers: buildRestoreLayers(false),
        fileRestore,
        restored: {
          conversation: false,
          files: filesRestored,
          reason: fileRestoreStatus.length > 0 ? fileRestoreStatus : 'dry_run'
        }
      };
    }
    const nextTimeline = [];
    for (const item of record.timeline) {
      if (item && typeof item.seq === 'number' && item.seq <= checkpoint.latestSeq) {
        nextTimeline.push(item);
      }
    }
    record.timeline = nextTimeline;
    record.nextSeq = this.nextSeqFromTimeline(record.timeline);
    record.currentEpoch = record.currentEpoch + 1;
    record.lastActivityAt = nowIso();
    this.appendTimeline(record, 'status', 'checkpoint.restored', {
      agentId,
      checkpointId,
      restoredToSeq: checkpoint.latestSeq,
      fileSnapshotStatus: checkpoint.fileSnapshotStatus,
      fileRestoreStatus
    }, {
      type: 'checkpoint.restored',
      checkpoint: this.publicCheckpoint(checkpoint)
    });
    this.persist(record);
    return {
      agent: this.publicRecord(record),
      checkpoint: this.publicCheckpoint(checkpoint),
      dryRun: false,
      fileSnapshotStatus: checkpoint.fileSnapshotStatus,
      fileSnapshotId: checkpoint.fileSnapshotId,
      filesScanned: checkpoint.filesScanned,
      filesCaptured: checkpoint.filesCaptured,
      conflicts,
      restoreBlocked,
      preRestoreSnapshotId,
      restorePlanId,
      manifestVerified,
      filesSkipped,
      filesRestored: filesRestoredCount,
      filesVerified,
      verifyErrors,
      workspaceRoot,
      filePolicy,
      skippedReasons,
      runtimeRestoreStatus,
      runtimeRestored,
      runtimeRestoreReason,
      layers: buildRestoreLayers(true),
      fileRestore,
      restored: {
        conversation: true,
        files: filesRestored,
        reason: fileRestoreStatus.length > 0 ? fileRestoreStatus : (checkpoint.fileSnapshotStatus === 'captured' ? 'file_restore_not_requested' : 'file_snapshot_not_captured')
      }
    };
  }

  delete(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    record.archivedAt = nowIso();
    record.lastStatus = AgentStatus.CLOSED;
    record.requiresAttention = false;
    record.attentionReason = '';
    record.attentionTimestamp = '';
    this.appendTimeline(record, 'status', 'agent.deleted', {
      agentId
    }, {
      type: 'agent.deleted',
      agentId
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  ackTimeline(agentId, latestSeq) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const seq = typeof latestSeq === 'number' && Number.isFinite(latestSeq) ? Math.max(0, Math.floor(latestSeq)) : 0;
    record.timelineAck = {
      latestSeq: seq,
      updatedAt: nowIso()
    };
    this.persist(record);
    return {
      agentId,
      latestSeq: seq,
      serverLatestSeq: record.nextSeq - 1
    };
  }

  archiveRecord(record, reason) {
    record.archivedAt = nowIso();
    record.lifecycleState = 'archived';
    record.ownershipStatus = 'archived';
    record.writeAccessRevokedAt = record.writeAccessRevokedAt.length > 0 ? record.writeAccessRevokedAt : record.archivedAt;
    record.lastStatus = AgentStatus.CLOSED;
    record.requiresAttention = false;
    record.attentionReason = '';
    record.attentionTimestamp = '';
    this.appendTimeline(record, 'status', 'agent.archived', {
      agentId: record.id,
      reason
    }, {
      type: 'agent.archived',
      agentId: record.id,
      reason
    });
    this.persist(record);
    return this.publicRecord(record);
  }

  beginClosing(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    if (record.lifecycleState !== 'archived') {
      record.lifecycleState = 'closing';
      record.writeAccessRevokedAt = record.writeAccessRevokedAt.length > 0 ? record.writeAccessRevokedAt : nowIso();
      this.persist(record);
    }
    return this.publicRecord(record);
  }

  finalizeArchive(agentId, reason, cleanupResult) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    record.lastCleanupResult = normalizeCleanupResult(cleanupResult);
    return this.archiveRecord(record, reason);
  }

  markAllDisconnected(reason) {
    const updated = [];
    for (const record of this.records.values()) {
      if (record.archivedAt.length > 0 || record.lifecycleState === 'archived') {
        continue;
      }
      record.lifecycleState = 'disconnected';
      record.runtimeInfo = Object.assign({}, record.runtimeInfo || {}, {
        sessionState: 'disconnected',
        lastError: typeof reason === 'string' ? reason : ''
      });
      this.persist(record);
      updated.push(this.publicRecord(record));
    }
    return updated;
  }

  activeOwnersForWorkspace(workspaceId, excludedAgentIds) {
    const excluded = excludedAgentIds instanceof Set ? excludedAgentIds : new Set();
    const owners = [];
    for (const record of this.records.values()) {
      if (record.workspaceId !== workspaceId || excluded.has(record.id)) {
        continue;
      }
      if (record.archivedAt.length === 0 && record.lifecycleState !== 'archived') {
        owners.push(record.id);
      }
    }
    return owners;
  }

  collectChildRecords(record, seen) {
    const items = [];
    if (!record || !Array.isArray(record.childAgentIds)) {
      return items;
    }
    for (const childId of record.childAgentIds) {
      if (typeof childId !== 'string' || childId.length === 0 || seen.has(childId)) {
        continue;
      }
      seen.add(childId);
      const child = this.find(childId);
      if (!child) {
        continue;
      }
      items.push(child);
      const descendants = this.collectChildRecords(child, seen);
      for (const descendant of descendants) {
        items.push(descendant);
      }
    }
    return items;
  }

  archive(agentId, options) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    const cascade = readBoolean(options, 'cascade', false);
    const archivedAgents = [];
    archivedAgents.push(this.archiveRecord(record, cascade ? 'cascade_root' : 'single'));
    record.relationshipUpdatedAt = nowIso();
    this.persist(record);
    archivedAgents[0] = this.publicRecord(record);
    if (cascade) {
      const seen = new Set();
      seen.add(record.id);
      const children = this.collectChildRecords(record, seen);
      for (const child of children) {
        archivedAgents.push(this.archiveRecord(child, 'cascade_child'));
      }
      record.relationshipUpdatedAt = nowIso();
      this.persist(record);
      archivedAgents[0] = this.publicRecord(record);
    }
    return {
      agent: archivedAgents[0],
      archivedAgents,
      cascade,
      relationshipTree: this.relationshipTree({ includeArchived: false }),
      relationshipDoctor: this.relationshipDoctor({ includeArchived: true })
    };
  }

  clearAttention(agentId) {
    const record = this.find(agentId);
    if (!record) {
      return null;
    }
    record.requiresAttention = false;
    record.attentionReason = '';
    record.attentionTimestamp = '';
    this.persist(record);
    return this.publicRecord(record);
  }

  publicRecord(record) {
    const relationshipWarnings = this.relationshipWarningsForRecord(record);
    return {
      id: record.id,
      provider: record.provider,
      cwd: record.cwd,
      workspaceId: record.workspaceId,
      rootPath: record.rootPath,
      workspaceMode: record.workspaceMode,
      worktreeId: record.worktreeId,
      runtimeOwnerId: record.runtimeOwnerId,
      ownershipStatus: record.ownershipStatus,
      executionPolicy: record.executionPolicy,
      forkContext: record.forkContext,
      lifecycleState: record.lifecycleState,
      writeAccessRevokedAt: record.writeAccessRevokedAt,
      lastCleanupResult: record.lastCleanupResult,
      migrationNotes: record.migrationNotes,
      providerSessionId: record.providerSessionId,
      remoteSessionId: record.remoteSessionId,
      title: record.title,
      labels: record.labels,
      config: record.config,
      lastStatus: record.lastStatus,
      lastModeId: record.lastModeId,
      modelId: record.modelId,
      thinkingOptionId: record.thinkingOptionId,
      features: record.features,
      persistence: record.persistence,
      runtimeInfo: record.runtimeInfo,
      lastError: record.lastError,
      requiresAttention: record.requiresAttention,
      attentionReason: record.attentionReason,
      attentionTimestamp: record.attentionTimestamp,
      parentAgentId: record.parentAgentId,
      rootAgentId: record.rootAgentId,
      childAgentIds: record.childAgentIds,
      detached: record.detached,
      forkedFromAgentId: record.forkedFromAgentId,
      forkedFromCheckpointId: record.forkedFromCheckpointId,
      relationshipUpdatedAt: record.relationshipUpdatedAt,
      relationshipStatus: this.relationshipStatus(record),
      relationshipWarnings,
      depth: this.relationshipDepth(record),
      isRoot: this.isRootAgent(record),
      internal: record.internal,
      archivedAt: record.archivedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastActivityAt: record.lastActivityAt,
      lastUserMessageAt: record.lastUserMessageAt,
      timelineAck: record.timelineAck,
      timelineSize: record.timeline.length,
      latestSeq: record.nextSeq - 1
    };
  }
}

module.exports = {
  AgentManager,
  AgentStatus
};
