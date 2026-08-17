'use strict';

function connectionHostProfileId(connection) {
  if (!connection || !connection.clientHello || typeof connection.clientHello !== 'object') {
    return '';
  }
  return typeof connection.clientHello.hostProfileId === 'string'
    ? connection.clientHello.hostProfileId.trim()
    : '';
}

function usageConnectionMatches(connection, hostProfileId, sourceConnection) {
  if (connection === sourceConnection) {
    return true;
  }
  const targetHostProfileId = typeof hostProfileId === 'string' ? hostProfileId.trim() : '';
  if (targetHostProfileId.length === 0) {
    return false;
  }
  return connectionHostProfileId(connection) === targetHostProfileId;
}

function sendScopedUsageEvent(connections, hostProfileId, sourceConnection, message) {
  if (!connections || typeof connections[Symbol.iterator] !== 'function') {
    return 0;
  }
  let delivered = 0;
  for (const connection of connections) {
    if (!connection || typeof connection.sendJson !== 'function' ||
      !usageConnectionMatches(connection, hostProfileId, sourceConnection)) {
      continue;
    }
    try {
      connection.sendJson(message);
      delivered += 1;
    } catch (_error) {
      // Connection cleanup remains the authoritative lifecycle operation.
    }
  }
  return delivered;
}

module.exports = {
  connectionHostProfileId,
  usageConnectionMatches,
  sendScopedUsageEvent
};
