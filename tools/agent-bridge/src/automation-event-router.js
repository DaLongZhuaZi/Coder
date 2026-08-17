'use strict';

const FAMILY_KEYS = Object.freeze({
  schedule: 'schedules',
  loop: 'loops',
  chatRoom: 'rooms'
});

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(source, key) {
  const value = objectValue(source)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function scopeState(connection) {
  if (!connection || typeof connection !== 'object') return null;
  const current = connection.automationEventScopes;
  if (current && current.schedules instanceof Set && current.loops instanceof Set && current.rooms instanceof Set && current.workspaces instanceof Set) {
    return current;
  }
  const created = {
    schedules: new Set(),
    loops: new Set(),
    rooms: new Set(),
    workspaces: new Set()
  };
  connection.automationEventScopes = created;
  return created;
}

function addEntityScope(state, family, entity) {
  const key = FAMILY_KEYS[family];
  if (!state || !key) return;
  const source = objectValue(entity);
  const entityId = family === 'schedule'
    ? stringValue(source, 'scheduleId') || stringValue(source, 'id')
    : (family === 'loop'
      ? stringValue(source, 'loopId') || stringValue(source, 'id')
      : stringValue(source, 'roomId') || stringValue(source, 'id'));
  const workspaceId = stringValue(source, 'workspaceId');
  if (entityId.length > 0) state[key].add(entityId);
  if (workspaceId.length > 0) state.workspaces.add(workspaceId);
}

function rememberAutomationResult(connection, family, result) {
  const state = scopeState(connection);
  const source = objectValue(result);
  if (!state || !FAMILY_KEYS[family] || source.ok !== true) return 0;
  const candidates = [];
  if (family === 'schedule') {
    candidates.push(source.schedule, source.run);
    if (Array.isArray(source.schedules)) candidates.push(...source.schedules);
    if (Array.isArray(source.runs)) candidates.push(...source.runs);
  } else if (family === 'loop') {
    candidates.push(source.loop, source.round);
    if (Array.isArray(source.loops)) candidates.push(...source.loops);
    if (Array.isArray(source.rounds)) candidates.push(...source.rounds);
  } else {
    candidates.push(source.room, source.message);
    if (Array.isArray(source.rooms)) candidates.push(...source.rooms);
    if (Array.isArray(source.messages)) candidates.push(...source.messages);
  }
  addEntityScope(state, family, source);
  for (const candidate of candidates) addEntityScope(state, family, candidate);
  return candidates.length;
}

function eventScope(family, event) {
  const source = objectValue(event);
  const entity = family === 'schedule' ? objectValue(source.schedule)
    : (family === 'loop' ? objectValue(source.loop) : objectValue(source.room));
  const entityId = family === 'schedule'
    ? stringValue(source, 'scheduleId') || stringValue(entity, 'scheduleId') || stringValue(entity, 'id')
    : (family === 'loop'
      ? stringValue(source, 'loopId') || stringValue(entity, 'loopId') || stringValue(entity, 'id')
      : stringValue(source, 'roomId') || stringValue(entity, 'roomId') || stringValue(entity, 'id'));
  const workspaceId = stringValue(source, 'workspaceId') || stringValue(entity, 'workspaceId');
  return { entityId, workspaceId };
}

function matches(state, family, scope) {
  const key = FAMILY_KEYS[family];
  if (!state || !key || !scope) return false;
  if (scope.entityId.length > 0 && state[key].has(scope.entityId)) return true;
  return scope.workspaceId.length > 0 && state.workspaces.has(scope.workspaceId);
}

function sendScopedAutomationEvent(connections, family, message) {
  if (!FAMILY_KEYS[family] || !connections || typeof connections[Symbol.iterator] !== 'function') return 0;
  const event = objectValue(message.payload);
  const scope = eventScope(family, event);
  if (scope.entityId.length === 0 && scope.workspaceId.length === 0) return 0;
  let delivered = 0;
  for (const connection of connections) {
    const state = connection && connection.automationEventScopes;
    if (!matches(state, family, scope) || typeof connection.sendJson !== 'function') continue;
    try {
      connection.sendJson(message);
      delivered += 1;
    } catch (_error) {
      // Connection cleanup remains authoritative.
    }
  }
  return delivered;
}

function clearAutomationEventScopes(connection) {
  if (!connection || typeof connection !== 'object') return;
  const state = connection.automationEventScopes;
  if (!state) return;
  state.schedules.clear();
  state.loops.clear();
  state.rooms.clear();
  state.workspaces.clear();
  delete connection.automationEventScopes;
}

function runtimeEventWorkspaceId(message, resolveWorkspace) {
  const source = objectValue(message);
  const payload = objectValue(source.payload);
  const nestedAgent = objectValue(payload.agent);
  const nestedSession = objectValue(payload.session);
  const directWorkspaceId = stringValue(payload, 'workspaceId') || stringValue(source, 'workspaceId') ||
    stringValue(nestedAgent, 'workspaceId') || stringValue(nestedSession, 'workspaceId');
  if (directWorkspaceId.length > 0) return directWorkspaceId;
  if (typeof resolveWorkspace !== 'function') return '';
  const agentId = stringValue(payload, 'agentId') || stringValue(source, 'agentId') || stringValue(nestedAgent, 'id') || stringValue(nestedAgent, 'agentId');
  const sessionId = stringValue(source, 'sessionId') || stringValue(payload, 'sessionId') || stringValue(nestedSession, 'sessionId') || stringValue(nestedSession, 'id');
  const resolved = resolveWorkspace(agentId, sessionId);
  return typeof resolved === 'string' ? resolved.trim() : '';
}

function sendScopedAutomationRuntimeEvent(connections, message, resolveWorkspace) {
  if (!connections || typeof connections[Symbol.iterator] !== 'function') return 0;
  const workspaceId = runtimeEventWorkspaceId(message, resolveWorkspace);
  if (workspaceId.length === 0) return 0;
  let delivered = 0;
  for (const connection of connections) {
    const state = connection && connection.automationEventScopes;
    if (!state || !(state.workspaces instanceof Set) || !state.workspaces.has(workspaceId) || typeof connection.sendJson !== 'function') continue;
    try {
      connection.sendJson(message);
      delivered += 1;
    } catch (_error) {
      // Connection cleanup remains authoritative.
    }
  }
  return delivered;
}

module.exports = {
  rememberAutomationResult,
  sendScopedAutomationEvent,
  clearAutomationEventScopes,
  runtimeEventWorkspaceId,
  sendScopedAutomationRuntimeEvent
};
