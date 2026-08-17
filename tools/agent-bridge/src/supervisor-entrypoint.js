#!/usr/bin/env node
'use strict';

const path = require('path');
const { createDaemonStore } = require('./daemon-store');
const { DaemonSupervisor, policyFromEnvironment } = require('./daemon-supervisor');

function resolveWorkerEntry() {
  const configured = process.env.AGENT_BRIDGE_SUPERVISOR_WORKER_ENTRY || '';
  return configured.length > 0 ? path.resolve(configured) : path.join(__dirname, 'server.js');
}

function positiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallbackValue;
}

function installSignalHandlers(supervisor) {
  process.on('SIGINT', () => supervisor.requestShutdown('supervisor_received_SIGINT'));
  process.on('SIGTERM', () => supervisor.requestShutdown('supervisor_received_SIGTERM'));
  process.on('SIGHUP', () => supervisor.requestRestart('supervisor_received_SIGHUP'));
}

function startWithLockRetry(supervisor, startedAt, waitMs) {
  const result = supervisor.start();
  if (result.acquired) {
    installSignalHandlers(supervisor);
    return;
  }
  if (result.code === 'supervisor_already_running' && Date.now() - startedAt < waitMs) {
    setTimeout(() => startWithLockRetry(supervisor, startedAt, waitMs), 100);
    return;
  }
  process.stderr.write((result.message || result.code || 'Unable to start daemon supervisor.') + '\n');
  process.exitCode = 1;
}

function main() {
  process.title = 'NGF Agent Bridge Supervisor';
  const store = createDaemonStore();
  const supervisor = new DaemonSupervisor(store, {
    ownerPid: process.pid,
    workerEntry: resolveWorkerEntry(),
    workerArgs: process.argv.slice(2),
    workerCwd: process.cwd(),
    workerEnv: process.env,
    policy: policyFromEnvironment(process.env)
  });
  const startDelayMs = positiveInteger(process.env.AGENT_BRIDGE_START_DELAY_MS, 0);
  const lockWaitMs = positiveInteger(process.env.AGENT_BRIDGE_LOCK_WAIT_MS, startDelayMs > 0 ? 20000 : 0);
  const startedAt = Date.now();
  if (startDelayMs > 0) {
    setTimeout(() => startWithLockRetry(supervisor, startedAt, lockWaitMs), startDelayMs);
    return;
  }
  startWithLockRetry(supervisor, startedAt, lockWaitMs);
}

main();
