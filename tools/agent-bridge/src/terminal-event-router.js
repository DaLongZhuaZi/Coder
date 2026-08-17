'use strict';

const SCOPED_TERMINAL_EVENTS = new Set([
  'terminal.updated',
  'terminal.attention',
  'terminal.capture.persisted',
  'terminal.stream.exit'
]);

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(source, key) {
  const value = objectValue(source)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(source, key) {
  const value = objectValue(source)[key];
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (normalized.length > 0 && !result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function terminalPayload(message) {
  const payload = objectValue(message && message.payload);
  const terminal = objectValue(payload.terminal);
  return {
    terminalId: stringValue(payload, 'terminalId') || stringValue(terminal, 'terminalId') || stringValue(terminal, 'id'),
    workspaceId: stringValue(payload, 'workspaceId') || stringValue(terminal, 'workspaceId'),
    ownerAgentId: stringValue(payload, 'agentId') || stringValue(payload, 'ownerAgentId') || stringValue(terminal, 'ownerAgentId')
  };
}

function isScopedTerminalEvent(message) {
  return SCOPED_TERMINAL_EVENTS.has(stringValue(message, 'event'));
}

function withTerminalScope(message, session) {
  const source = objectValue(message);
  const scoped = Object.assign({}, source);
  const ownerId = stringValue(session, 'ownerConnectionId');
  const subscriberIds = [];
  const subscribers = session && session.subscribers instanceof Map ? session.subscribers.values() : [];
  for (const subscriber of subscribers) {
    const connectionId = stringValue(subscriber && subscriber.connection, 'connectionId');
    if (connectionId.length > 0 && !subscriberIds.includes(connectionId)) subscriberIds.push(connectionId);
  }
  if (ownerId.length > 0) scoped.ownerId = ownerId;
  if (subscriberIds.length > 0) scoped.subscriberIds = subscriberIds;
  return scoped;
}

function publicTerminalEvent(message) {
  const source = objectValue(message);
  const publicEvent = Object.assign({}, source);
  delete publicEvent.ownerId;
  delete publicEvent.subscriberIds;
  return publicEvent;
}

function connectionIsSubscribed(connection, terminalId) {
  return terminalId.length > 0 && connection && connection.terminalSubscriptions instanceof Map &&
    connection.terminalSubscriptions.has(terminalId);
}

function selectScopedTerminalConnections(connections, message) {
  if (!isScopedTerminalEvent(message) || !connections || typeof connections[Symbol.iterator] !== 'function') return [];
  const ownerId = stringValue(message, 'ownerId');
  const subscriberIds = new Set(stringList(message, 'subscriberIds'));
  const scope = terminalPayload(message);
  const selected = [];
  for (const connection of connections) {
    if (!connection || typeof connection.sendJson !== 'function') continue;
    const connectionId = stringValue(connection, 'connectionId');
    if ((ownerId.length > 0 && connectionId === ownerId) || subscriberIds.has(connectionId) || connectionIsSubscribed(connection, scope.terminalId)) {
      selected.push(connection);
    }
  }
  return selected;
}

function sendScopedTerminalEvent(connections, message) {
  const publicEvent = publicTerminalEvent(message);
  let delivered = 0;
  for (const connection of selectScopedTerminalConnections(connections, message)) {
    try {
      connection.sendJson(publicEvent);
      delivered += 1;
    } catch (_error) {
      // Connection cleanup remains authoritative.
    }
  }
  return delivered;
}

module.exports = {
  SCOPED_TERMINAL_EVENTS,
  isScopedTerminalEvent,
  withTerminalScope,
  publicTerminalEvent,
  selectScopedTerminalConnections,
  sendScopedTerminalEvent
};
