'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { createDaemonStore } = require('../src/daemon-store');
const {
  DaemonSupervisor,
  acquireOwnerLock,
  parseWorkerMessage,
  releaseOwnerLock,
  restartDelayMs
} = require('../src/daemon-supervisor');

class FakeStream extends EventEmitter {
}

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.connected = true;
    this.stdout = new FakeStream();
    this.stderr = new FakeStream();
    this.signals = [];
    this.sent = [];
  }

  send(message) {
    this.sent.push(message);
    return true;
  }

  kill(signal) {
    this.signals.push(signal);
    return true;
  }

  ready(listen) {
    this.emit('message', { type: 'ngf:ready', listen });
  }

  heartbeat(timestamp) {
    this.emit('message', { type: 'ngf:worker-heartbeat', timestamp });
  }

  close(code, signal) {
    this.connected = false;
    this.emit('close', code, signal || null);
  }
}

class FakeTimers {
  constructor() {
    this.nextId = 1;
    this.timeouts = [];
    this.intervals = [];
  }

  setTimeout(callback, delayMs) {
    const timer = { id: this.nextId++, callback, delayMs, cleared: false };
    this.timeouts.push(timer);
    return timer;
  }

  clearTimeout(timer) {
    if (timer) {
      timer.cleared = true;
    }
  }

  setInterval(callback, delayMs) {
    const timer = {
      id: this.nextId++,
      callback,
      delayMs,
      cleared: false,
      unref() {}
    };
    this.intervals.push(timer);
    return timer;
  }

  clearInterval(timer) {
    if (timer) {
      timer.cleared = true;
    }
  }

  runNextTimeout() {
    const timer = this.timeouts.find((item) => !item.cleared);
    assert.ok(timer, 'expected a pending timeout');
    timer.cleared = true;
    timer.callback();
    return timer;
  }

  runIntervals() {
    for (const timer of this.intervals) {
      if (!timer.cleared) {
        timer.callback();
      }
    }
  }
}

function createHarness(root, policyOverrides) {
  const store = createDaemonStore(root);
  const timers = new FakeTimers();
  const children = [];
  const exitCodes = [];
  let now = 1000000;
  const policy = Object.assign({
    restartOnCrash: true,
    restartBaseDelayMs: 100,
    restartMaxDelayMs: 800,
    crashWindowMs: 5000,
    maxCrashesInWindow: 3,
    stableResetMs: 1000,
    heartbeatIntervalMs: 100,
    heartbeatTimeoutMs: 500,
    startupTimeoutMs: 300,
    shutdownTimeoutMs: 200
  }, policyOverrides || {});
  const supervisor = new DaemonSupervisor(store, {
    ownerPid: process.pid,
    workerEntry: path.join(root, 'worker.js'),
    workerCwd: root,
    workerEnv: {},
    policy,
    now: () => now,
    setTimer: (callback, delayMs) => timers.setTimeout(callback, delayMs),
    clearTimer: (timer) => timers.clearTimeout(timer),
    setRepeatingTimer: (callback, delayMs) => timers.setInterval(callback, delayMs),
    clearRepeatingTimer: (timer) => timers.clearInterval(timer),
    spawnWorker: () => {
      const child = new FakeChild(4100 + children.length);
      children.push(child);
      return child;
    },
    exitProcess: (code) => exitCodes.push(code)
  });
  return {
    store,
    timers,
    children,
    exitCodes,
    supervisor,
    now: () => now,
    advance(ms) {
      now += ms;
    }
  };
}

function verifyHelpers(root) {
  assert.strictEqual(restartDelayMs(1, { restartBaseDelayMs: 100, restartMaxDelayMs: 1000 }), 100);
  assert.strictEqual(restartDelayMs(4, { restartBaseDelayMs: 100, restartMaxDelayMs: 1000 }), 800);
  assert.strictEqual(restartDelayMs(8, { restartBaseDelayMs: 100, restartMaxDelayMs: 1000 }), 1000);
  assert.deepStrictEqual(parseWorkerMessage({ type: 'ngf:ready', listen: '127.0.0.1:8787' }), {
    type: 'ngf:ready',
    listen: '127.0.0.1:8787'
  });
  assert.deepStrictEqual(parseWorkerMessage({
    type: 'ngf:replace',
    reason: 'smoke_replace',
    supervisorEntry: path.join(root, 'replacement', 'supervisor-entrypoint.js'),
    workerEntry: path.join(root, 'replacement', 'server.js'),
    startDelayMs: 500,
    lockWaitMs: 5000
  }), {
    type: 'ngf:replace',
    reason: 'smoke_replace',
    supervisorEntry: path.join(root, 'replacement', 'supervisor-entrypoint.js'),
    workerEntry: path.join(root, 'replacement', 'server.js'),
    startDelayMs: 500,
    lockWaitMs: 5000
  });
  assert.strictEqual(parseWorkerMessage({ type: 'invalid' }), null);

  const lockPath = path.join(root, 'lock-test', 'supervisor.lock');
  const acquired = acquireOwnerLock(lockPath, process.pid);
  assert.strictEqual(acquired.acquired, true);
  const blocked = acquireOwnerLock(lockPath, process.pid);
  assert.strictEqual(blocked.acquired, false);
  assert.strictEqual(blocked.code, 'supervisor_already_running');
  assert.strictEqual(releaseOwnerLock(lockPath, process.pid + 1), false);
  assert.strictEqual(releaseOwnerLock(lockPath, process.pid), true);

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ ownerPid: 99999999 }), 'utf8');
  const staleRecovered = acquireOwnerLock(lockPath, process.pid);
  assert.strictEqual(staleRecovered.acquired, true);
  assert.strictEqual(releaseOwnerLock(lockPath, process.pid), true);

  const initializingLockPath = path.join(root, 'lock-test', 'initializing.lock');
  fs.mkdirSync(path.dirname(initializingLockPath), { recursive: true });
  const initializingDescriptor = fs.openSync(initializingLockPath, 'wx');
  try {
    const initializing = acquireOwnerLock(initializingLockPath, process.pid + 1);
    assert.strictEqual(initializing.acquired, false);
    assert.strictEqual(initializing.code, 'supervisor_already_running');
    assert.strictEqual(fs.existsSync(initializingLockPath), true);
  } finally {
    fs.closeSync(initializingDescriptor);
    fs.unlinkSync(initializingLockPath);
  }

  const invalidStaleLockPath = path.join(root, 'lock-test', 'invalid-stale.lock');
  fs.writeFileSync(invalidStaleLockPath, '', 'utf8');
  const staleTime = new Date(Date.now() - 10000);
  fs.utimesSync(invalidStaleLockPath, staleTime, staleTime);
  const staleInvalidRecovered = acquireOwnerLock(invalidStaleLockPath, process.pid);
  assert.strictEqual(staleInvalidRecovered.acquired, true);
  assert.strictEqual(releaseOwnerLock(invalidStaleLockPath, process.pid), true);

  const nestedLockPath = path.join(root, 'lock-test', 'nested.lock');
  const originalWriteFileSync = fs.writeFileSync;
  let nestedAcquire = null;
  let interceptOwnerWrite = true;
  fs.writeFileSync = function patchedWriteFileSync(file, data, options) {
    if (interceptOwnerWrite && typeof file === 'number') {
      interceptOwnerWrite = false;
      nestedAcquire = acquireOwnerLock(nestedLockPath, process.pid + 1);
    }
    return originalWriteFileSync.call(fs, file, data, options);
  };
  let outerAcquire;
  try {
    outerAcquire = acquireOwnerLock(nestedLockPath, process.pid);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  assert.strictEqual(outerAcquire.acquired, true);
  assert.ok(nestedAcquire);
  assert.strictEqual(nestedAcquire.acquired, false);
  assert.strictEqual(nestedAcquire.code, 'supervisor_already_running');
  assert.strictEqual(releaseOwnerLock(nestedLockPath, process.pid), true);
}

function verifySupervisorReplacement(root) {
  const replacementRoot = path.join(root, 'replacement-package');
  const replacementSupervisor = path.join(replacementRoot, 'src', 'supervisor-entrypoint.js');
  const replacementWorker = path.join(replacementRoot, 'src', 'server.js');
  fs.mkdirSync(path.dirname(replacementSupervisor), { recursive: true });
  fs.writeFileSync(replacementSupervisor, "'use strict';\n", 'utf8');
  fs.writeFileSync(replacementWorker, "'use strict';\n", 'utf8');
  const harness = createHarness(path.join(root, 'replacement'));
  const replacements = [];
  harness.supervisor.spawnSupervisor = (supervisorEntry, workerEntry, options) => {
    replacements.push({ supervisorEntry, workerEntry, options });
    return 7301;
  };
  harness.supervisor.start();
  const worker = harness.children[0];
  worker.ready('127.0.0.1:8787');
  worker.emit('message', {
    type: 'ngf:replace',
    reason: 'smoke_update',
    supervisorEntry: replacementSupervisor,
    workerEntry: replacementWorker,
    startDelayMs: 400,
    lockWaitMs: 6000
  });
  assert.strictEqual(replacements.length, 1);
  assert.strictEqual(replacements[0].supervisorEntry, replacementSupervisor);
  assert.strictEqual(replacements[0].workerEntry, replacementWorker);
  assert.strictEqual(replacements[0].options.startDelayMs, 400);
  assert.strictEqual(replacements[0].options.lockWaitMs, 6000);
  assert.deepStrictEqual(worker.signals, ['SIGTERM']);
  let state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'stopping');
  assert.strictEqual(state.replacementPid, 7301);
  assert.strictEqual(state.replacementEntry, replacementSupervisor);
  worker.close(0, null);
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'stopped');
  assert.strictEqual(fs.existsSync(harness.store.paths.daemonSupervisorLock), false);
}

function verifyReadyRestartShutdown(root) {
  const harness = createHarness(path.join(root, 'ready-restart'));
  const start = harness.supervisor.start();
  assert.strictEqual(start.acquired, true);
  assert.strictEqual(harness.children.length, 1);
  const first = harness.children[0];
  first.ready('127.0.0.1:8787');
  first.heartbeat(harness.now());
  let state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'running');
  assert.strictEqual(state.workerPid, first.pid);
  assert.strictEqual(state.supervisorPid, process.pid);
  assert.strictEqual(state.workerReady, true);

  assert.strictEqual(harness.supervisor.requestRestart('smoke_restart'), true);
  assert.deepStrictEqual(first.signals, ['SIGTERM']);
  first.close(0, null);
  harness.timers.runNextTimeout();
  assert.strictEqual(harness.children.length, 2);
  const second = harness.children[1];
  second.ready('127.0.0.1:8787');
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.restartCount, 1);
  assert.strictEqual(state.workerGeneration, 2);
  assert.strictEqual(state.workerPid, second.pid);

  assert.strictEqual(harness.supervisor.requestShutdown('smoke_shutdown'), true);
  assert.deepStrictEqual(second.signals, ['SIGTERM']);
  second.close(0, null);
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'stopped');
  assert.deepStrictEqual(harness.exitCodes, [0]);
  assert.strictEqual(fs.existsSync(harness.store.paths.daemonSupervisorLock), false);
}

function verifyCrashBackoffAndStableReset(root) {
  const harness = createHarness(path.join(root, 'crash-backoff'));
  harness.supervisor.start();
  const first = harness.children[0];
  first.ready('127.0.0.1:8787');
  first.close(1, null);
  let state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'backoff');
  assert.strictEqual(state.restartCount, 1);
  assert.strictEqual(harness.timers.timeouts[harness.timers.timeouts.length - 1].delayMs, 100);
  harness.timers.runNextTimeout();

  const second = harness.children[1];
  second.ready('127.0.0.1:8787');
  second.close(2, null);
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.restartCount, 2);
  assert.strictEqual(harness.timers.timeouts[harness.timers.timeouts.length - 1].delayMs, 200);
  harness.timers.runNextTimeout();

  const third = harness.children[2];
  third.ready('127.0.0.1:8787');
  harness.advance(1500);
  third.heartbeat(harness.now());
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.consecutiveCrashes, 0);
  assert.strictEqual(state.crashWindowCount, 0);
  third.close(3, null);
  state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.consecutiveCrashes, 1);
  assert.strictEqual(harness.timers.timeouts[harness.timers.timeouts.length - 1].delayMs, 100);
}

function verifyCrashLoop(root) {
  const harness = createHarness(path.join(root, 'crash-loop'), {
    maxCrashesInWindow: 2
  });
  harness.supervisor.start();
  harness.children[0].close(1, null);
  harness.timers.runNextTimeout();
  harness.children[1].close(1, null);
  harness.timers.runNextTimeout();
  harness.children[2].close(1, null);
  const state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.status, 'crash_loop');
  assert.strictEqual(state.crashLoop, true);
  assert.strictEqual(state.failureCategory, 'supervisor_crash_loop');
  assert.deepStrictEqual(harness.exitCodes, [0]);
  assert.strictEqual(fs.existsSync(harness.store.paths.daemonSupervisorLock), false);
}

function verifyWatchdogs(root) {
  const startup = createHarness(path.join(root, 'startup-watchdog'));
  startup.supervisor.start();
  startup.advance(301);
  startup.timers.runIntervals();
  assert.deepStrictEqual(startup.children[0].signals, ['SIGTERM']);
  let state = startup.store.readDaemonSupervisorState();
  assert.strictEqual(state.lastRestartReason, 'worker_startup_timeout');

  const heartbeat = createHarness(path.join(root, 'heartbeat-watchdog'));
  heartbeat.supervisor.start();
  heartbeat.children[0].ready('127.0.0.1:8787');
  heartbeat.advance(501);
  heartbeat.timers.runIntervals();
  assert.deepStrictEqual(heartbeat.children[0].signals, ['SIGTERM']);
  state = heartbeat.store.readDaemonSupervisorState();
  assert.strictEqual(state.lastRestartReason, 'worker_heartbeat_timeout');
}

function verifyHeartbeatStateWritesAreCoalesced(root) {
  const harness = createHarness(path.join(root, 'heartbeat-state-coalesce'));
  harness.supervisor.start();
  const worker = harness.children[0];
  worker.ready('127.0.0.1:8787');
  const statePath = harness.store.paths.daemonSupervisorState;
  const originalRenameSync = fs.renameSync;
  let stateWriteCount = 0;
  fs.renameSync = function patchedRenameSync(sourcePath, destinationPath) {
    if (path.resolve(destinationPath) === path.resolve(statePath)) {
      stateWriteCount += 1;
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  try {
    harness.advance(10);
    worker.heartbeat(harness.now());
    harness.advance(10);
    harness.timers.runIntervals();
    assert.strictEqual(stateWriteCount, 0);

    harness.advance(230);
    worker.heartbeat(harness.now());
    harness.timers.runIntervals();
    assert.strictEqual(stateWriteCount, 1);
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.strictEqual(harness.supervisor.requestShutdown('heartbeat_coalesce_shutdown'), true);
  worker.close(0, null);
  assert.deepStrictEqual(harness.exitCodes, [0]);
}

function verifyProcessRecordFailuresAreNonFatal(root) {
  const harness = createHarness(path.join(root, 'process-record-failure'));
  const originalWrite = harness.store.writeManagedProcessRecord;
  const writeError = new Error('injected process record write failure');
  writeError.code = 'EPERM';
  harness.store.writeManagedProcessRecord = () => {
    throw writeError;
  };
  assert.doesNotThrow(() => harness.supervisor.start());
  harness.store.writeManagedProcessRecord = originalWrite;

  const worker = harness.children[0];
  worker.ready('127.0.0.1:8787');
  const originalRemove = harness.store.removeManagedProcessRecord;
  const removeError = new Error('injected process record remove failure');
  removeError.code = 'EPERM';
  harness.store.removeManagedProcessRecord = () => {
    throw removeError;
  };
  try {
    assert.doesNotThrow(() => harness.supervisor.requestShutdown('process_record_smoke_shutdown'));
    assert.doesNotThrow(() => worker.close(0, null));
  } finally {
    harness.store.removeManagedProcessRecord = originalRemove;
  }
  assert.deepStrictEqual(harness.exitCodes, [0]);
  assert.strictEqual(fs.existsSync(harness.store.paths.daemonSupervisorLock), false);
  const log = fs.readFileSync(harness.store.paths.daemonLog, 'utf8');
  assert.strictEqual((log.match(/supervisor\.process_record_write_failed/g) || []).length, 1);
  assert.strictEqual((log.match(/supervisor\.process_record_remove_failed/g) || []).length, 1);
}

function verifyExitPreservesReplacementRecord(root) {
  const harness = createHarness(path.join(root, 'process-record-handoff'));
  harness.supervisor.start();
  const worker = harness.children[0];
  worker.ready('127.0.0.1:8787');
  assert.strictEqual(harness.supervisor.requestShutdown('process_record_handoff_shutdown'), true);

  const lockPath = harness.store.paths.daemonSupervisorLock;
  const originalUnlinkSync = fs.unlinkSync;
  let replacementWritten = false;
  fs.unlinkSync = function patchedUnlinkSync(filePath) {
    const result = originalUnlinkSync.call(fs, filePath);
    if (path.resolve(filePath) === path.resolve(lockPath)) {
      harness.store.writeManagedProcessRecord({
        id: 'daemon-supervisor',
        pid: harness.supervisor.ownerPid + 1
      });
      replacementWritten = true;
    }
    return result;
  };
  try {
    assert.doesNotThrow(() => worker.close(0, null));
  } finally {
    fs.unlinkSync = originalUnlinkSync;
  }
  assert.strictEqual(replacementWritten, true);
  const record = harness.store.listManagedProcessRecords().find((item) => item.id === 'daemon-supervisor');
  assert.ok(record);
  assert.strictEqual(record.pid, harness.supervisor.ownerPid + 1);
  assert.deepStrictEqual(harness.exitCodes, [0]);
}

function verifyStateWriteFailureDoesNotExit(root) {
  const harness = createHarness(path.join(root, 'state-write-failure'));
  harness.supervisor.start();
  const worker = harness.children[0];
  worker.ready('127.0.0.1:8787');
  const statePath = harness.store.paths.daemonSupervisorState;
  const tempPrefix = path.basename(statePath) + '.tmp-';
  const originalRenameSync = fs.renameSync;
  let renameAttempts = 0;
  fs.renameSync = function patchedRenameSync(sourcePath, destinationPath) {
    if (path.resolve(destinationPath) === path.resolve(statePath)) {
      renameAttempts += 1;
      const error = new Error('injected supervisor state lock');
      error.code = 'EPERM';
      throw error;
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  try {
    harness.advance(300);
    assert.doesNotThrow(() => worker.heartbeat(harness.now()));
    harness.advance(10);
    assert.doesNotThrow(() => worker.heartbeat(harness.now()));
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.strictEqual(renameAttempts, 8);
  assert.strictEqual(harness.supervisor.stateWriteFailureCount, 2);
  assert.deepStrictEqual(worker.signals, []);
  assert.deepStrictEqual(harness.exitCodes, []);
  assert.deepStrictEqual(
    fs.readdirSync(path.dirname(statePath)).filter((name) => name.startsWith(tempPrefix)),
    []
  );

  harness.advance(10);
  worker.heartbeat(harness.now());
  const state = harness.store.readDaemonSupervisorState();
  assert.strictEqual(state.lastWorkerHeartbeatAt, new Date(harness.now()).toISOString());
  assert.strictEqual(harness.supervisor.stateWriteFailureCount, 0);
  const log = fs.readFileSync(harness.store.paths.daemonLog, 'utf8');
  assert.strictEqual((log.match(/supervisor\.state_write_failed/g) || []).length, 1);
  assert.strictEqual((log.match(/supervisor\.state_write_recovered/g) || []).length, 1);

  assert.strictEqual(harness.supervisor.requestShutdown('state_write_smoke_shutdown'), true);
  worker.close(0, null);
  assert.deepStrictEqual(harness.exitCodes, [0]);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-daemon-supervisor-smoke-'));
  try {
    verifyHelpers(root);
    verifyReadyRestartShutdown(root);
    verifySupervisorReplacement(root);
    verifyCrashBackoffAndStableReset(root);
    verifyCrashLoop(root);
    verifyWatchdogs(root);
    verifyHeartbeatStateWritesAreCoalesced(root);
    verifyProcessRecordFailuresAreNonFatal(root);
    verifyExitPreservesReplacementRecord(root);
    verifyStateWriteFailureDoesNotExit(root);
    console.log('daemon supervisor smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
