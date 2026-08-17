'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventType } = require('./protocol');

const MAX_NOTIFICATIONS = 500;

function nowIso() {
  return new Date().toISOString();
}

function isoFromTimeMs(value) {
  return new Date(value).toISOString();
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readObject(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeHostProfileId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallbackValue;
  }
}

function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function randomId() {
  return 'ntf_' + crypto.randomBytes(12).toString('base64url');
}

function normalizeAction(action) {
  const source = action && typeof action === 'object' && !Array.isArray(action) ? action : {};
  const id = readString(source, 'id', readString(source, 'actionId', 'open'));
  return {
    id,
    label: readString(source, 'label', id),
    kind: readString(source, 'kind', id),
    destructive: readBoolean(source, 'destructive', false)
  };
}

function normalizeRoute(route) {
  const source = route && typeof route === 'object' && !Array.isArray(route) ? route : {};
  return {
    kind: readString(source, 'kind', 'agent'),
    sessionId: readString(source, 'sessionId', ''),
    agentId: readString(source, 'agentId', ''),
    terminalId: readString(source, 'terminalId', ''),
    workspaceId: readString(source, 'workspaceId', ''),
    messageId: readString(source, 'messageId', ''),
    requestId: readString(source, 'requestId', ''),
    url: readString(source, 'url', '')
  };
}

function normalizeNotification(source) {
  const item = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const createdAt = readString(item, 'createdAt', nowIso());
  const ttlMs = readNumber(item, 'ttlMs', 0);
  const explicitExpiresAt = readString(item, 'expiresAt', '');
  const createdTime = Date.parse(createdAt);
  const expiresAt = explicitExpiresAt.length > 0 ? explicitExpiresAt : (ttlMs > 0 && Number.isFinite(createdTime) ? isoFromTimeMs(createdTime + ttlMs) : '');
  const actions = Array.isArray(item.actions) ? item.actions.map(normalizeAction) : [normalizeAction({ id: 'open', label: 'Open', kind: 'open' })];
  return {
    notificationId: readString(item, 'notificationId', readString(item, 'id', randomId())),
    kind: readString(item, 'kind', 'info'),
    severity: readString(item, 'severity', 'info'),
    title: readString(item, 'title', 'Agent Bridge'),
    body: readString(item, 'body', ''),
    sourceEvent: readString(item, 'sourceEvent', ''),
    sessionId: readString(item, 'sessionId', ''),
    agentId: readString(item, 'agentId', ''),
    terminalId: readString(item, 'terminalId', ''),
    workspaceId: readString(item, 'workspaceId', ''),
    hostProfileId: normalizeHostProfileId(readString(item, 'hostProfileId', '')),
    route: normalizeRoute(item.route),
    actions,
    read: readBoolean(item, 'read', false),
    clicked: readBoolean(item, 'clicked', false),
    createdAt,
    updatedAt: readString(item, 'updatedAt', createdAt),
    expiresAt,
    ttlMs
  };
}

function notificationExpired(item, nowMs) {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const expiresAt = typeof item.expiresAt === 'string' ? item.expiresAt : '';
  if (expiresAt.length === 0) {
    return false;
  }
  const expiresTime = Date.parse(expiresAt);
  if (!Number.isFinite(expiresTime)) {
    return false;
  }
  return expiresTime <= nowMs;
}

function notificationFromBridgeEvent(event, agent, hostProfileId) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {};
  const sessionId = readString(event, 'sessionId', readString(payload, 'sessionId', ''));
  const agentId = agent ? agent.id : readString(payload, 'agentId', '');
  if (event.event === EventType.QUESTION_REQUESTED || event.event === EventType.PLAN_REQUESTED || event.event === EventType.PERMISSION_REQUESTED) {
    const kind = event.event === EventType.PERMISSION_REQUESTED ? 'permission' : (event.event === EventType.PLAN_REQUESTED ? 'plan' : 'question');
    const requestId = readString(payload, 'requestId', readString(payload, 'permissionId', readString(payload, 'planId', '')));
    return {
      kind,
      severity: 'warning',
      title: kind === 'permission' ? 'Permission requested' : (kind === 'plan' ? 'Plan review requested' : 'Input requested'),
      body: readString(payload, 'title', readString(payload, 'prompt', 'Agent is waiting for your response.')),
      sourceEvent: event.event,
      sessionId,
      agentId,
      hostProfileId: normalizeHostProfileId(hostProfileId),
      route: {
        kind,
        sessionId,
        agentId,
        requestId
      },
      actions: [
        { id: 'open', label: 'Open', kind: 'open' },
        { id: 'mark_read', label: 'Mark Read', kind: 'mark_read' }
      ]
    };
  }
  if (event.event === EventType.MESSAGE_COMPLETED && readString(payload, 'role', '') !== 'user') {
    return {
      kind: 'completed',
      severity: 'success',
      title: 'Agent completed',
      body: 'Assistant response completed.',
      sourceEvent: event.event,
      sessionId,
      agentId,
      hostProfileId: normalizeHostProfileId(hostProfileId),
      route: {
        kind: 'agent',
        sessionId,
        agentId,
        messageId: readString(payload, 'messageId', '')
      },
      actions: [
        { id: 'open', label: 'Open', kind: 'open' },
        { id: 'mark_read', label: 'Mark Read', kind: 'mark_read' }
      ]
    };
  }
  return null;
}

function notificationFromTerminalAttention(event, hostProfileId) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || event.event !== EventType.TERMINAL_ATTENTION) {
    return null;
  }
  const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {};
  const terminal = readObject(payload, 'terminal');
  const terminalId = readString(payload, 'terminalId', readString(terminal, 'terminalId', ''));
  const reason = readString(payload, 'reason', readString(terminal, 'attentionReason', ''));
  return {
    kind: 'terminal_attention',
    severity: reason === 'needs_input' ? 'warning' : 'info',
    title: 'Terminal needs attention',
    body: reason.length > 0 ? reason : 'Terminal activity changed.',
    sourceEvent: event.event,
    terminalId,
    workspaceId: readString(terminal, 'workspaceId', ''),
    hostProfileId: normalizeHostProfileId(hostProfileId),
    route: {
      kind: 'terminal',
      terminalId,
      workspaceId: readString(terminal, 'workspaceId', '')
    },
    actions: [
      { id: 'open', label: 'Open', kind: 'open' },
      { id: 'mark_read', label: 'Mark Read', kind: 'mark_read' }
    ]
  };
}

class NotificationManager {
  constructor(store) {
    this.store = store;
    this.filePath = store && store.paths ? store.paths.notifications : '';
  }

  isAvailable() {
    return this.filePath.length > 0;
  }

  readAll() {
    const raw = readJsonFile(this.filePath, []);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map(normalizeNotification);
  }

  writeAll(items) {
    const normalized = Array.isArray(items) ? items.map(normalizeNotification) : [];
    normalized.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    writeJsonFileAtomic(this.filePath, normalized.slice(0, MAX_NOTIFICATIONS));
    return normalized.slice(0, MAX_NOTIFICATIONS);
  }

  create(input) {
    if (!this.isAvailable()) {
      return null;
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const item = normalizeNotification(input);
    const items = this.readAll();
    items.unshift(item);
    this.writeAll(items);
    return item;
  }

  prune(payload, hostProfileId) {
    const includeRead = readBoolean(payload, 'includeRead', true);
    const nowMs = readNumber(payload, 'nowMs', Date.now());
    const scope = normalizeHostProfileId(hostProfileId);
    const items = this.readAll();
    const kept = [];
    const removed = [];
    for (const item of items) {
      if (scope.length > 0 && item.hostProfileId !== scope) {
        kept.push(item);
        continue;
      }
      const expired = notificationExpired(item, nowMs);
      const removable = expired && (includeRead || item.read !== true);
      if (removable) {
        removed.push(item);
      } else {
        kept.push(item);
      }
    }
    if (removed.length > 0) {
      this.writeAll(kept);
    }
    const visible = scope.length > 0 ? kept.filter((item) => item.hostProfileId === scope) : kept;
    return {
      ok: true,
      action: 'notification.prune',
      removedCount: removed.length,
      remainingCount: visible.length,
      unreadCount: visible.filter((item) => !item.read).length,
      removedNotifications: removed,
      storePath: this.filePath,
      nowMs
    };
  }

  createFromBridgeEvent(event, agent, hostProfileId) {
    return this.create(notificationFromBridgeEvent(event, agent, hostProfileId));
  }

  createFromTerminalEvent(event, hostProfileId) {
    return this.create(notificationFromTerminalAttention(event, hostProfileId));
  }

  list(payload, hostProfileId) {
    const includeRead = readBoolean(payload, 'includeRead', true);
    const limit = Math.max(1, Math.min(readNumber(payload, 'limit', 100), 500));
    const scope = normalizeHostProfileId(hostProfileId);
    const pruneResult = this.prune({
      includeRead: true,
      nowMs: readNumber(payload, 'nowMs', Date.now())
    }, scope);
    let items = this.readAll().filter((item) => scope.length === 0 || item.hostProfileId === scope);
    if (!includeRead) {
      items = items.filter((item) => !item.read);
    }
    return {
      ok: true,
      action: 'notification.list',
      notifications: items.slice(0, limit),
      totalCount: items.length,
      unreadCount: items.filter((item) => !item.read).length,
      prunedCount: pruneResult.removedCount,
      storePath: this.filePath
    };
  }

  markRead(payload, hostProfileId) {
    const notificationId = readString(payload, 'notificationId', readString(payload, 'id', ''));
    const read = readBoolean(payload, 'read', true);
    const scope = normalizeHostProfileId(hostProfileId);
    const items = this.readAll();
    let notification = null;
    const updatedAt = nowIso();
    for (const item of items) {
      if (item.notificationId === notificationId && (scope.length === 0 || item.hostProfileId === scope)) {
        item.read = read;
        item.updatedAt = updatedAt;
        notification = item;
        break;
      }
    }
    this.writeAll(items);
    return {
      ok: notification !== null,
      action: 'notification.read',
      notificationId,
      notification,
      notifications: items.filter((item) => scope.length === 0 || item.hostProfileId === scope),
      unreadCount: items.filter((item) => (scope.length === 0 || item.hostProfileId === scope) && !item.read).length,
      failureCategory: notification ? '' : 'not_found',
      message: notification ? 'Notification updated.' : 'Notification not found.'
    };
  }

  deactivateRoutesForAgent(agentId, reason) {
    const items = this.readAll();
    let updated = 0;
    for (const item of items) {
      if (item.agentId !== agentId && (!item.route || item.route.agentId !== agentId)) {
        continue;
      }
      item.routeActive = false;
      item.routeInactiveReason = typeof reason === 'string' ? reason : 'agent_archived';
      item.updatedAt = nowIso();
      updated += 1;
    }
    if (updated > 0) {
      this.writeAll(items);
    }
    return { status: 'completed', updated };
  }

  handleAction(payload, hostProfileId) {
    const notificationId = readString(payload, 'notificationId', readString(payload, 'id', ''));
    const actionId = readString(payload, 'actionId', 'open');
    const scope = normalizeHostProfileId(hostProfileId);
    const items = this.readAll();
    let notification = null;
    const updatedAt = nowIso();
    for (const item of items) {
      if (item.notificationId === notificationId && (scope.length === 0 || item.hostProfileId === scope)) {
        item.clicked = true;
        item.read = true;
        item.updatedAt = updatedAt;
        notification = item;
        break;
      }
    }
    this.writeAll(items);
    if (notification && notification.routeActive === false) {
      return {
        ok: false,
        action: 'notification.action',
        notificationId,
        actionId,
        notification,
        route: normalizeRoute({}),
        notifications: items.filter((item) => scope.length === 0 || item.hostProfileId === scope),
        unreadCount: items.filter((item) => (scope.length === 0 || item.hostProfileId === scope) && !item.read).length,
        failureCategory: 'route_inactive',
        message: notification.routeInactiveReason || 'Notification route is inactive.'
      };
    }
    return {
      ok: notification !== null,
      action: 'notification.action',
      notificationId,
      actionId,
      notification,
      route: notification ? notification.route : normalizeRoute({}),
      notifications: items.filter((item) => scope.length === 0 || item.hostProfileId === scope),
      unreadCount: items.filter((item) => (scope.length === 0 || item.hostProfileId === scope) && !item.read).length,
      failureCategory: notification ? '' : 'not_found',
      message: notification ? 'Notification action recorded.' : 'Notification not found.'
    };
  }
}

module.exports = {
  NotificationManager,
  notificationFromBridgeEvent,
  notificationFromTerminalAttention
};
