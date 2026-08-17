'use strict';

const { randomId } = require('./daemon-store');

function processIsAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

class ManagedProcessLedger {
  constructor(store) {
    this.store = store;
  }

  list() {
    return this.store.listManagedProcessRecords();
  }

  record(input) {
    const now = new Date().toISOString();
    const record = {
      id: typeof input.id === 'string' && input.id.length > 0 ? input.id : randomId('proc'),
      providerId: typeof input.providerId === 'string' ? input.providerId : '',
      kind: typeof input.kind === 'string' ? input.kind : 'provider-helper',
      pid: typeof input.pid === 'number' ? input.pid : 0,
      command: typeof input.command === 'string' ? input.command : '',
      args: Array.isArray(input.args) ? input.args : [],
      cwd: typeof input.cwd === 'string' ? input.cwd : '',
      identity: input.identity && typeof input.identity === 'object' && !Array.isArray(input.identity) ? input.identity : {},
      createdAt: typeof input.createdAt === 'string' && input.createdAt.length > 0 ? input.createdAt : now,
      updatedAt: now
    };
    this.store.writeManagedProcessRecord(record);
    return record;
  }

  remove(recordId) {
    this.store.removeManagedProcessRecord(recordId);
  }

  listByOwner(agentId) {
    return this.list().filter((record) => {
      const identity = record && record.identity && typeof record.identity === 'object' ? record.identity : {};
      return identity.agentId === agentId || identity.runtimeOwnerId === agentId;
    });
  }

  removeByOwner(agentId) {
    const removed = this.listByOwner(agentId);
    for (const record of removed) {
      this.remove(record.id);
    }
    return removed;
  }

  reconcile() {
    const records = this.list();
    const retained = [];
    const removed = [];
    for (const record of records) {
      if (processIsAlive(record.pid)) {
        retained.push(record);
      } else {
        this.remove(record.id);
        removed.push(record);
      }
    }
    return {
      retained,
      removed,
      checkedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  ManagedProcessLedger,
  processIsAlive
};
