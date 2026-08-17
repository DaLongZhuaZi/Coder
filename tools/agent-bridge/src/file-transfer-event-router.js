'use strict';

function sendScopedFileTransferEvent(connections, ownerId, message) {
  const targetOwnerId = typeof ownerId === 'string' ? ownerId.trim() : '';
  if (targetOwnerId.length === 0 || !connections || typeof connections[Symbol.iterator] !== 'function') {
    return 0;
  }
  let delivered = 0;
  for (const connection of connections) {
    if (!connection || typeof connection.sendJson !== 'function' || connection.connectionId !== targetOwnerId) {
      continue;
    }
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
  sendScopedFileTransferEvent
};
