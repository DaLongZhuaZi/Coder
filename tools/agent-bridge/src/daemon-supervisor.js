'use strict';

const fs = require('fs');
const path = require('path');
const { fork, spawn } = require('child_process');
const { processIsAlive } = require('./managed-process-ledger');
const { writeJsonFileAtomic } = require('./daemon-store');

const SUPERVISOR_RECORD_ID = 'daemon-supervisor';
const HEARTBEAT_STATE_WRITE_MIN_INTERVAL_MS = 250;
const OWNER_LOCK_INITIALIZATION_GRACE_MS = 5000;
const DEFAULT_POLICY = Object.freeze({
  restartOnCrash: true,
  restartBaseDelayMs: 250,
  restartMaxDelayMs: 10000,
  crashWindowMs: 60000,
  maxCrashesInWindow: 5,
  stableResetMs: 30000,
  heartbeatIntervalMs: 1000,
  heartbeatTimeoutMs: 15000,
  startupTimeoutMs: 30000,
  shutdownTimeoutMs: 10000
});

function nowIso(now) {
  return new Date(typeof now === 'number' ? now : Date.now()).toISOString();
}

function positiveInteger(value, fallbackValue) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function readBoolean(value, fallbackValue) {
  return typeof value === 'boolean' ? value : fallbackValue;
}

function policyFromEnvironment(env) {
  const source = env && typeof env === 'object' ? env : process.env;
  return {
    restartOnCrash: source.AGENT_BRIDGE_SUPERVISOR_RESTART_ON_CRASH === 'false'
      ? false
      : DEFAULT_POLICY.restartOnCrash,
    restartBaseDelayMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_RESTART_BASE_MS, DEFAULT_POLICY.restartBaseDelayMs),
    restartMaxDelayMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_RESTART_MAX_MS, DEFAULT_POLICY.restartMaxDelayMs),
    crashWindowMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_CRASH_WINDOW_MS, DEFAULT_POLICY.crashWindowMs),
    maxCrashesInWindow: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_MAX_CRASHES, DEFAULT_POLICY.maxCrashesInWindow),
    stableResetMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_STABLE_RESET_MS, DEFAULT_POLICY.stableResetMs),
    heartbeatIntervalMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_HEARTBEAT_MS, DEFAULT_POLICY.heartbeatIntervalMs),
    heartbeatTimeoutMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_HEARTBEAT_TIMEOUT_MS, DEFAULT_POLICY.heartbeatTimeoutMs),
    startupTimeoutMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_STARTUP_TIMEOUT_MS, DEFAULT_POLICY.startupTimeoutMs),
    shutdownTimeoutMs: positiveInteger(source.AGENT_BRIDGE_SUPERVISOR_SHUTDOWN_TIMEOUT_MS, DEFAULT_POLICY.shutdownTimeoutMs)
  };
}

function normalizePolicy(source) {
  const policy = source && typeof source === 'object' ? source : {};
  const restartBaseDelayMs = positiveInteger(policy.restartBaseDelayMs, DEFAULT_POLICY.restartBaseDelayMs);
  return {
    restartOnCrash: readBoolean(policy.restartOnCrash, DEFAULT_POLICY.restartOnCrash),
    restartBaseDelayMs,
    restartMaxDelayMs: Math.max(restartBaseDelayMs, positiveInteger(policy.restartMaxDelayMs, DEFAULT_POLICY.restartMaxDelayMs)),
    crashWindowMs: positiveInteger(policy.crashWindowMs, DEFAULT_POLICY.crashWindowMs),
    maxCrashesInWindow: positiveInteger(policy.maxCrashesInWindow, DEFAULT_POLICY.maxCrashesInWindow),
    stableResetMs: positiveInteger(policy.stableResetMs, DEFAULT_POLICY.stableResetMs),
    heartbeatIntervalMs: positiveInteger(policy.heartbeatIntervalMs, DEFAULT_POLICY.heartbeatIntervalMs),
    heartbeatTimeoutMs: positiveInteger(policy.heartbeatTimeoutMs, DEFAULT_POLICY.heartbeatTimeoutMs),
    startupTimeoutMs: positiveInteger(policy.startupTimeoutMs, DEFAULT_POLICY.startupTimeoutMs),
    shutdownTimeoutMs: positiveInteger(policy.shutdownTimeoutMs, DEFAULT_POLICY.shutdownTimeoutMs)
  };
}

function restartDelayMs(consecutiveCrashes, policy) {
  const exponent = Math.max(0, positiveInteger(consecutiveCrashes, 1) - 1);
  return Math.min(policy.restartMaxDelayMs, policy.restartBaseDelayMs * Math.pow(2, exponent));
}

function pruneCrashTimes(crashTimes, now, windowMs) {
  const source = Array.isArray(crashTimes) ? crashTimes : [];
  return source.filter((value) => typeof value === 'number' && value >= now - windowMs && value <= now);
}

function parseWorkerMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null;
  }
  const type = typeof message.type === 'string' ? message.type : '';
  if (type === 'ngf:ready') {
    return {
      type,
      listen: typeof message.listen === 'string' ? message.listen : ''
    };
  }
  if (type === 'ngf:restart' || type === 'ngf:shutdown') {
    return {
      type,
      reason: typeof message.reason === 'string' && message.reason.length > 0
        ? message.reason
        : (type === 'ngf:restart' ? 'worker_requested_restart' : 'worker_requested_shutdown')
    };
  }
  if (type === 'ngf:replace') {
    return {
      type,
      reason: typeof message.reason === 'string' && message.reason.length > 0
        ? message.reason
        : 'worker_requested_supervisor_replacement',
      supervisorEntry: typeof message.supervisorEntry === 'string' ? message.supervisorEntry : '',
      workerEntry: typeof message.workerEntry === 'string' ? message.workerEntry : '',
      startDelayMs: positiveInteger(message.startDelayMs, 750),
      lockWaitMs: positiveInteger(message.lockWaitMs, 20000)
    };
  }
  if (type === 'ngf:worker-heartbeat') {
    return {
      type,
      timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now()
    };
  }
  return null;
}

function readOwnerLock(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  try {
    const value = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function acquireOwnerLock(lockPath, ownerPid) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      try {
        fs.writeFileSync(descriptor, JSON.stringify({
          ownerPid,
          createdAt: nowIso()
        }, null, 2), 'utf8');
      } finally {
        fs.closeSync(descriptor);
      }
      return {
        acquired: true,
        ownerPid,
        staleOwnerPid: 0,
        code: ''
      };
    } catch (error) {
      if (!error || error.code !== 'EEXIST') {
        return {
          acquired: false,
          ownerPid: 0,
          staleOwnerPid: 0,
          code: 'supervisor_lock_failed',
          message: error instanceof Error ? error.message : String(error)
        };
      }
      const existing = readOwnerLock(lockPath);
      if (!existing) {
        let lockAgeMs = 0;
        try {
          lockAgeMs = Math.max(0, Date.now() - fs.statSync(lockPath).mtimeMs);
        } catch (statError) {
          if (statError && statError.code === 'ENOENT') {
            continue;
          }
          return {
            acquired: false,
            ownerPid: 0,
            staleOwnerPid: 0,
            code: 'supervisor_lock_failed',
            message: statError instanceof Error ? statError.message : String(statError)
          };
        }
        if (lockAgeMs < OWNER_LOCK_INITIALIZATION_GRACE_MS) {
          return {
            acquired: false,
            ownerPid: 0,
            staleOwnerPid: 0,
            code: 'supervisor_already_running',
            message: 'A Bridge daemon supervisor is acquiring the owner lock.'
          };
        }
      }
      const existingPid = existing && typeof existing.ownerPid === 'number' ? existing.ownerPid : 0;
      if (processIsAlive(existingPid)) {
        return {
          acquired: false,
          ownerPid: existingPid,
          staleOwnerPid: 0,
          code: 'supervisor_already_running',
          message: 'A Bridge daemon supervisor is already running.'
        };
      }
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (unlinkError && unlinkError.code === 'ENOENT') {
          continue;
        }
        return {
          acquired: false,
          ownerPid: existingPid,
          staleOwnerPid: existingPid,
          code: 'supervisor_stale_lock_remove_failed',
          message: unlinkError instanceof Error ? unlinkError.message : String(unlinkError)
        };
      }
    }
  }
  return {
    acquired: false,
    ownerPid: 0,
    staleOwnerPid: 0,
    code: 'supervisor_lock_failed',
    message: 'Unable to acquire the Bridge daemon supervisor lock.'
  };
}

function releaseOwnerLock(lockPath, ownerPid) {
  const existing = readOwnerLock(lockPath);
  if (!existing || existing.ownerPid !== ownerPid) {
    return false;
  }
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (_error) {
    return false;
  }
}

function appendSupervisorLog(logPath, event, fields) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const payload = Object.assign({
      time: nowIso(),
      source: 'daemon-supervisor',
      event
    }, fields && typeof fields === 'object' ? fields : {});
    fs.appendFileSync(logPath, JSON.stringify(payload) + '\n', 'utf8');
  } catch (_error) {
    // Runtime state remains the primary diagnostic channel when logging fails.
  }
}

function defaultSpawnWorker(workerEntry, workerArgs, options) {
  return fork(workerEntry, workerArgs, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
}

function defaultSpawnSupervisor(supervisorEntry, workerEntry, options) {
  const env = Object.assign({}, options.env, {
    AGENT_BRIDGE_HOME: options.home,
    AGENT_BRIDGE_START_DELAY_MS: String(options.startDelayMs),
    AGENT_BRIDGE_LOCK_WAIT_MS: String(options.lockWaitMs),
    AGENT_BRIDGE_SUPERVISOR_WORKER_ENTRY: workerEntry
  });
  delete env.AGENT_BRIDGE_SUPERVISED;
  delete env.AGENT_BRIDGE_SUPERVISOR_PID;
  delete env.AGENT_BRIDGE_WORKER_GENERATION;
  const child = spawn(process.execPath, [supervisorEntry], {
    cwd: options.cwd,
    env,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return child.pid || 0;
}

class DaemonSupervisor {
  constructor(store, options) {
    const config = options && typeof options === 'object' ? options : {};
    this.store = store;
    this.ownerPid = positiveInteger(config.ownerPid, process.pid);
    this.workerEntry = typeof config.workerEntry === 'string' && config.workerEntry.length > 0
      ? path.resolve(config.workerEntry)
      : path.join(__dirname, 'server.js');
    this.workerArgs = Array.isArray(config.workerArgs) ? config.workerArgs.slice() : [];
    this.workerCwd = typeof config.workerCwd === 'string' && config.workerCwd.length > 0
      ? path.resolve(config.workerCwd)
      : process.cwd();
    this.workerEnv = Object.assign({}, process.env, config.workerEnv && typeof config.workerEnv === 'object' ? config.workerEnv : {}, {
      AGENT_BRIDGE_HOME: store.baseDirectory,
      AGENT_BRIDGE_SUPERVISED: '1',
      AGENT_BRIDGE_SUPERVISOR_PID: String(this.ownerPid)
    });
    this.policy = normalizePolicy(config.policy || policyFromEnvironment(this.workerEnv));
    this.spawnWorker = typeof config.spawnWorker === 'function' ? config.spawnWorker : defaultSpawnWorker;
    this.spawnSupervisor = typeof config.spawnSupervisor === 'function' ? config.spawnSupervisor : defaultSpawnSupervisor;
    this.exitProcess = typeof config.exitProcess === 'function' ? config.exitProcess : (code) => process.exit(code);
    this.now = typeof config.now === 'function' ? config.now : Date.now;
    this.setTimer = typeof config.setTimer === 'function' ? config.setTimer : setTimeout;
    this.clearTimer = typeof config.clearTimer === 'function' ? config.clearTimer : clearTimeout;
    this.setRepeatingTimer = typeof config.setRepeatingTimer === 'function' ? config.setRepeatingTimer : setInterval;
    this.clearRepeatingTimer = typeof config.clearRepeatingTimer === 'function' ? config.clearRepeatingTimer : clearInterval;
    this.child = null;
    this.workerGeneration = 0;
    this.restartCount = 0;
    this.consecutiveCrashes = 0;
    this.crashTimes = [];
    this.workerStartedAtMs = 0;
    this.workerReadyAtMs = 0;
    this.workerHeartbeatAtMs = 0;
    this.restarting = false;
    this.shuttingDown = false;
    this.exiting = false;
    this.restartReason = '';
    this.shutdownReason = '';
    this.replacementPid = 0;
    this.replacementEntry = '';
    this.restartTimer = null;
    this.watchdogTimer = null;
    this.shutdownTimer = null;
    this.lockAcquired = false;
    this.stateWriteFailureCount = 0;
    this.lastStateWriteWarningAtMs = 0;
    this.lastStateWriteAtMs = 0;
    this.state = this.initialState();
  }

  initialState() {
    return {
      version: 1,
      status: 'starting',
      health: 'starting',
      supervised: true,
      ownerPid: this.ownerPid,
      supervisorPid: this.ownerPid,
      workerPid: 0,
      workerGeneration: 0,
      workerReady: false,
      listen: '',
      startedAt: nowIso(this.now()),
      workerStartedAt: '',
      workerReadyAt: '',
      lastHeartbeatAt: nowIso(this.now()),
      lastWorkerHeartbeatAt: '',
      restartCount: 0,
      consecutiveCrashes: 0,
      crashWindowCount: 0,
      crashLoop: false,
      nextRestartAt: '',
      lastExitCode: 0,
      lastSignal: '',
      lastError: '',
      lastRestartReason: '',
      shutdownReason: '',
      replacementPid: 0,
      replacementEntry: '',
      workerEntry: this.workerEntry,
      logPath: this.store.paths.daemonLog,
      lockPath: this.store.paths.daemonSupervisorLock,
      statePath: this.store.paths.daemonSupervisorState,
      policy: this.policy,
      updatedAt: nowIso(this.now())
    };
  }

  updateState(patch, options) {
    const now = this.now();
    this.state = Object.assign({}, this.state, patch && typeof patch === 'object' ? patch : {}, {
      updatedAt: nowIso(now)
    });
    const coalesce = Boolean(options && options.coalesce === true);
    const coalesceIntervalMs = Math.max(HEARTBEAT_STATE_WRITE_MIN_INTERVAL_MS, this.policy.heartbeatIntervalMs);
    if (coalesce && this.stateWriteFailureCount === 0 && this.lastStateWriteAtMs > 0 &&
      now >= this.lastStateWriteAtMs && now - this.lastStateWriteAtMs < coalesceIntervalMs) {
      return this.state;
    }
    try {
      writeJsonFileAtomic(this.store.paths.daemonSupervisorState, this.state);
      this.lastStateWriteAtMs = now;
      if (this.stateWriteFailureCount > 0) {
        this.log('supervisor.state_write_recovered', {
          consecutiveFailures: this.stateWriteFailureCount
        });
        this.stateWriteFailureCount = 0;
        this.lastStateWriteWarningAtMs = 0;
      }
    } catch (error) {
      // The next watchdog or worker heartbeat retries without blocking the supervisor.
      this.stateWriteFailureCount += 1;
      const failureTime = this.now();
      if (this.stateWriteFailureCount === 1 || failureTime - this.lastStateWriteWarningAtMs >= 30000) {
        this.lastStateWriteWarningAtMs = failureTime;
        this.log('supervisor.state_write_failed', {
          path: this.store.paths.daemonSupervisorState,
          code: error && typeof error.code === 'string' ? error.code : '',
          error: error instanceof Error ? error.message : String(error),
          consecutiveFailures: this.stateWriteFailureCount
        });
      }
    }
    return this.state;
  }

  log(event, fields) {
    appendSupervisorLog(this.store.paths.daemonLog, event, Object.assign({
      ownerPid: this.ownerPid,
      workerPid: this.child && typeof this.child.pid === 'number' ? this.child.pid : 0
    }, fields && typeof fields === 'object' ? fields : {}));
  }

  writeManagedProcessRecord(record) {
    try {
      this.store.writeManagedProcessRecord(record);
    } catch (error) {
      this.log('supervisor.process_record_write_failed', {
        code: error && typeof error.code === 'string' ? error.code : '',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  removeManagedProcessRecord() {
    try {
      this.store.removeManagedProcessRecord(SUPERVISOR_RECORD_ID, this.ownerPid);
    } catch (error) {
      this.log('supervisor.process_record_remove_failed', {
        code: error && typeof error.code === 'string' ? error.code : '',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  start() {
    const lockResult = acquireOwnerLock(this.store.paths.daemonSupervisorLock, this.ownerPid);
    if (!lockResult.acquired) {
      return lockResult;
    }
    this.lockAcquired = true;
    this.writeManagedProcessRecord({
      id: SUPERVISOR_RECORD_ID,
      providerId: 'bridge',
      kind: 'daemon-supervisor',
      pid: this.ownerPid,
      command: process.execPath,
      args: [path.join(__dirname, 'supervisor-entrypoint.js')],
      cwd: this.workerCwd,
      identity: {
        role: 'supervisor',
        workerEntry: this.workerEntry
      },
      createdAt: this.state.startedAt,
      updatedAt: nowIso(this.now())
    });
    this.updateState({
      status: 'starting',
      health: 'starting',
      failureCategory: '',
      lastError: ''
    });
    this.log('supervisor.started', { workerEntry: this.workerEntry });
    this.startWatchdog();
    this.spawnNextWorker('initial_start');
    return lockResult;
  }

  startWatchdog() {
    this.watchdogTimer = this.setRepeatingTimer(() => {
      if (this.exiting) {
        return;
      }
      const now = this.now();
      this.updateState({
        lastHeartbeatAt: nowIso(now)
      }, { coalesce: true });
      const child = this.child;
      if (!child || this.shuttingDown || this.restarting) {
        return;
      }
      if (child.connected && typeof child.send === 'function') {
        try {
          child.send({ type: 'ngf:supervisor-heartbeat', timestamp: now });
        } catch (error) {
          this.log('worker.heartbeat_send_failed', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      const reference = this.workerReadyAtMs > 0
        ? (this.workerHeartbeatAtMs > 0 ? this.workerHeartbeatAtMs : this.workerReadyAtMs)
        : this.workerStartedAtMs;
      const timeout = this.workerReadyAtMs > 0 ? this.policy.heartbeatTimeoutMs : this.policy.startupTimeoutMs;
      if (reference > 0 && now - reference > timeout) {
        const reason = this.workerReadyAtMs > 0 ? 'worker_heartbeat_timeout' : 'worker_startup_timeout';
        this.updateState({
          health: 'unresponsive',
          lastError: reason
        });
        this.requestRestart(reason);
      }
    }, this.policy.heartbeatIntervalMs);
    if (this.watchdogTimer && typeof this.watchdogTimer.unref === 'function') {
      this.watchdogTimer.unref();
    }
  }

  spawnNextWorker(reason) {
    if (this.shuttingDown || this.exiting) {
      return;
    }
    this.workerGeneration += 1;
    this.workerStartedAtMs = this.now();
    this.workerReadyAtMs = 0;
    this.workerHeartbeatAtMs = this.workerStartedAtMs;
    this.restarting = false;
    this.restartReason = '';
    const env = Object.assign({}, this.workerEnv, {
      AGENT_BRIDGE_WORKER_GENERATION: String(this.workerGeneration)
    });
    let child;
    try {
      child = this.spawnWorker(this.workerEntry, this.workerArgs, {
        cwd: this.workerCwd,
        env
      });
    } catch (error) {
      this.handleSpawnFailure(error, reason);
      return;
    }
    this.child = child;
    const workerPid = child && typeof child.pid === 'number' ? child.pid : 0;
    this.updateState({
      status: 'starting',
      health: 'starting',
      workerPid,
      workerGeneration: this.workerGeneration,
      workerReady: false,
      workerStartedAt: nowIso(this.workerStartedAtMs),
      workerReadyAt: '',
      lastWorkerHeartbeatAt: nowIso(this.workerHeartbeatAtMs),
      nextRestartAt: '',
      lastRestartReason: reason,
      lastError: ''
    });
    this.log('worker.spawned', {
      reason,
      workerPid,
      generation: this.workerGeneration
    });
    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk) => {
        this.writeWorkerOutput(chunk, false);
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk) => {
        this.writeWorkerOutput(chunk, true);
      });
    }
    if (typeof child.on === 'function') {
      child.on('message', (message) => this.handleWorkerMessage(message, child));
      child.on('error', (error) => {
        this.updateState({
          lastError: error instanceof Error ? error.message : String(error)
        });
        this.log('worker.error', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
      child.on('close', (code, signal) => this.handleWorkerClose(child, code, signal));
    }
  }

  writeWorkerOutput(chunk, stderr) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    try {
      fs.mkdirSync(path.dirname(this.store.paths.daemonLog), { recursive: true });
      fs.appendFileSync(this.store.paths.daemonLog, buffer);
    } catch (_error) {
      return;
    }
    if (process.env.AGENT_BRIDGE_SUPERVISOR_FOREGROUND === '1') {
      const stream = stderr ? process.stderr : process.stdout;
      stream.write(buffer);
    }
  }

  handleWorkerMessage(message, sourceChild) {
    if (sourceChild !== this.child) {
      return;
    }
    const parsed = parseWorkerMessage(message);
    if (!parsed) {
      return;
    }
    if (parsed.type === 'ngf:ready') {
      this.workerReadyAtMs = this.now();
      this.workerHeartbeatAtMs = this.workerReadyAtMs;
      this.updateState({
        status: 'running',
        health: 'running',
        workerReady: true,
        listen: parsed.listen,
        workerReadyAt: nowIso(this.workerReadyAtMs),
        lastWorkerHeartbeatAt: nowIso(this.workerHeartbeatAtMs),
        lastError: '',
        crashLoop: false
      });
      this.log('worker.ready', { listen: parsed.listen });
      return;
    }
    if (parsed.type === 'ngf:worker-heartbeat') {
      this.workerHeartbeatAtMs = this.now();
      if (this.workerReadyAtMs > 0 && this.workerHeartbeatAtMs - this.workerReadyAtMs >= this.policy.stableResetMs) {
        this.consecutiveCrashes = 0;
        this.crashTimes = [];
      }
      this.updateState({
        lastWorkerHeartbeatAt: nowIso(this.workerHeartbeatAtMs),
        consecutiveCrashes: this.consecutiveCrashes,
        crashWindowCount: this.crashTimes.length
      }, { coalesce: true });
      return;
    }
    if (parsed.type === 'ngf:restart') {
      this.requestRestart(parsed.reason);
      return;
    }
    if (parsed.type === 'ngf:replace') {
      this.requestReplacement(parsed);
      return;
    }
    this.requestShutdown(parsed.reason);
  }

  requestReplacement(request) {
    if (this.shuttingDown || this.exiting || this.replacementPid > 0) {
      return false;
    }
    const requestedSupervisorEntry = request && typeof request.supervisorEntry === 'string'
      ? request.supervisorEntry
      : '';
    const requestedWorkerEntry = request && typeof request.workerEntry === 'string'
      ? request.workerEntry
      : '';
    const supervisorEntry = path.isAbsolute(requestedSupervisorEntry) ? path.resolve(requestedSupervisorEntry) : '';
    const workerEntry = path.isAbsolute(requestedWorkerEntry) ? path.resolve(requestedWorkerEntry) : '';
    if (supervisorEntry.length === 0 || workerEntry.length === 0 ||
      !fs.existsSync(supervisorEntry) || !fs.existsSync(workerEntry)) {
      this.updateState({
        lastError: 'supervisor_replacement_entry_invalid',
        failureCategory: 'supervisor_replacement_entry_invalid'
      });
      this.log('supervisor.replacement_rejected', {
        supervisorEntry,
        workerEntry
      });
      return false;
    }
    let replacementPid = 0;
    try {
      replacementPid = this.spawnSupervisor(supervisorEntry, workerEntry, {
        cwd: path.dirname(path.dirname(supervisorEntry)),
        env: this.workerEnv,
        home: this.store.baseDirectory,
        startDelayMs: positiveInteger(request.startDelayMs, 750),
        lockWaitMs: positiveInteger(request.lockWaitMs, 20000)
      });
    } catch (error) {
      this.updateState({
        lastError: error instanceof Error ? error.message : String(error),
        failureCategory: 'supervisor_replacement_spawn_failed'
      });
      this.log('supervisor.replacement_spawn_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
    if (replacementPid <= 0) {
      this.updateState({
        lastError: 'Replacement supervisor pid is unavailable.',
        failureCategory: 'supervisor_replacement_spawn_failed'
      });
      return false;
    }
    this.replacementPid = replacementPid;
    this.replacementEntry = supervisorEntry;
    this.updateState({
      status: 'replacing',
      health: 'restarting',
      replacementPid,
      replacementEntry: supervisorEntry,
      lastRestartReason: request.reason,
      failureCategory: '',
      lastError: ''
    });
    this.log('supervisor.replacement_started', {
      reason: request.reason,
      replacementPid,
      replacementEntry: supervisorEntry,
      workerEntry
    });
    return this.requestShutdown(request.reason || 'supervisor_replacement');
  }

  handleSpawnFailure(error, reason) {
    const message = error instanceof Error ? error.message : String(error);
    this.log('worker.spawn_failed', { reason, error: message });
    this.handleCrash(1, '', message);
  }

  handleWorkerClose(sourceChild, code, signal) {
    if (sourceChild !== this.child) {
      return;
    }
    this.child = null;
    if (this.shutdownTimer) {
      this.clearTimer(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    const runtimeMs = Math.max(0, this.now() - this.workerStartedAtMs);
    const exitCode = typeof code === 'number' ? code : -1;
    const signalName = typeof signal === 'string' ? signal : '';
    this.updateState({
      workerPid: 0,
      workerReady: false,
      lastExitCode: exitCode,
      lastSignal: signalName
    });
    this.log('worker.exited', {
      exitCode,
      signal: signalName,
      runtimeMs,
      restarting: this.restarting,
      shuttingDown: this.shuttingDown
    });
    if (this.shuttingDown) {
      this.finishExit(0, this.shutdownReason || 'supervisor_shutdown');
      return;
    }
    if (this.restarting) {
      const reason = this.restartReason || 'worker_requested_restart';
      this.restartCount += 1;
      this.scheduleRestart(reason, 0, false);
      return;
    }
    const crashed = exitCode !== 0 || (signalName.length > 0 && signalName !== 'SIGTERM');
    if (crashed && this.policy.restartOnCrash) {
      this.handleCrash(exitCode, signalName, signalName.length > 0 ? signalName : 'exit_' + String(exitCode));
      return;
    }
    this.finishExit(exitCode >= 0 ? exitCode : 1, 'worker_exited');
  }

  handleCrash(exitCode, signalName, errorMessage) {
    const now = this.now();
    if (this.workerReadyAtMs > 0 && now - this.workerReadyAtMs >= this.policy.stableResetMs) {
      this.consecutiveCrashes = 0;
      this.crashTimes = [];
    }
    this.consecutiveCrashes += 1;
    this.restartCount += 1;
    this.crashTimes = pruneCrashTimes(this.crashTimes.concat([now]), now, this.policy.crashWindowMs);
    if (this.crashTimes.length > this.policy.maxCrashesInWindow) {
      this.updateState({
        status: 'crash_loop',
        health: 'failed',
        crashLoop: true,
        restartCount: this.restartCount,
        consecutiveCrashes: this.consecutiveCrashes,
        crashWindowCount: this.crashTimes.length,
        lastExitCode: exitCode,
        lastSignal: signalName,
        lastError: errorMessage,
        failureCategory: 'supervisor_crash_loop',
        nextRestartAt: ''
      });
      this.log('supervisor.crash_loop', {
        restartCount: this.restartCount,
        crashWindowCount: this.crashTimes.length,
        lastError: errorMessage
      });
      this.finishExit(0, 'supervisor_crash_loop', true);
      return;
    }
    const delayMs = restartDelayMs(this.consecutiveCrashes, this.policy);
    this.scheduleRestart('worker_crashed', delayMs, true, {
      exitCode,
      signalName,
      errorMessage
    });
  }

  scheduleRestart(reason, delayMs, crashed, details) {
    if (this.shuttingDown || this.exiting) {
      return;
    }
    const nextRestartAt = this.now() + Math.max(0, delayMs);
    const extra = details && typeof details === 'object' ? details : {};
    this.updateState({
      status: delayMs > 0 ? 'backoff' : 'restarting',
      health: crashed ? 'degraded' : 'restarting',
      restartCount: this.restartCount,
      consecutiveCrashes: this.consecutiveCrashes,
      crashWindowCount: this.crashTimes.length,
      crashLoop: false,
      nextRestartAt: nowIso(nextRestartAt),
      lastRestartReason: reason,
      lastExitCode: typeof extra.exitCode === 'number' ? extra.exitCode : this.state.lastExitCode,
      lastSignal: typeof extra.signalName === 'string' ? extra.signalName : this.state.lastSignal,
      lastError: typeof extra.errorMessage === 'string' ? extra.errorMessage : ''
    });
    this.log('worker.restart_scheduled', {
      reason,
      delayMs,
      restartCount: this.restartCount,
      consecutiveCrashes: this.consecutiveCrashes
    });
    this.restartTimer = this.setTimer(() => {
      this.restartTimer = null;
      this.spawnNextWorker(reason);
    }, Math.max(0, delayMs));
  }

  requestRestart(reason) {
    if (this.shuttingDown || this.exiting || this.restarting) {
      return false;
    }
    this.restarting = true;
    this.restartReason = typeof reason === 'string' && reason.length > 0 ? reason : 'restart_requested';
    this.updateState({
      status: 'restarting',
      health: 'restarting',
      lastRestartReason: this.restartReason
    });
    this.log('worker.restart_requested', { reason: this.restartReason });
    if (!this.child) {
      this.restartCount += 1;
      this.scheduleRestart(this.restartReason, 0, false);
      return true;
    }
    this.signalWorker('SIGTERM');
    this.armShutdownTimeout('restart_timeout');
    return true;
  }

  requestShutdown(reason) {
    if (this.shuttingDown || this.exiting) {
      return false;
    }
    this.shuttingDown = true;
    this.restarting = false;
    this.shutdownReason = typeof reason === 'string' && reason.length > 0 ? reason : 'shutdown_requested';
    if (this.restartTimer) {
      this.clearTimer(this.restartTimer);
      this.restartTimer = null;
    }
      this.updateState({
        status: 'stopping',
      health: 'stopping',
      nextRestartAt: '',
        shutdownReason: this.shutdownReason
      });
    this.log('supervisor.shutdown_requested', { reason: this.shutdownReason });
    if (!this.child) {
      this.finishExit(0, this.shutdownReason);
      return true;
    }
    this.signalWorker('SIGTERM');
    this.armShutdownTimeout('shutdown_timeout');
    return true;
  }

  signalWorker(signal) {
    if (!this.child || typeof this.child.kill !== 'function') {
      return false;
    }
    try {
      return this.child.kill(signal);
    } catch (error) {
      this.log('worker.signal_failed', {
        signal,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  armShutdownTimeout(reason) {
    if (this.shutdownTimer) {
      this.clearTimer(this.shutdownTimer);
    }
    this.shutdownTimer = this.setTimer(() => {
      this.shutdownTimer = null;
      if (!this.child) {
        return;
      }
      this.log('worker.force_kill', { reason });
      this.signalWorker('SIGKILL');
    }, this.policy.shutdownTimeoutMs);
  }

  finishExit(code, reason, preserveFailureState) {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    if (this.watchdogTimer) {
      this.clearRepeatingTimer(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.restartTimer) {
      this.clearTimer(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.shutdownTimer) {
      this.clearTimer(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    if (!preserveFailureState) {
      this.updateState({
        status: code === 0 ? 'stopped' : 'failed',
        health: code === 0 ? 'stopped' : 'failed',
        workerPid: 0,
        workerReady: false,
        nextRestartAt: '',
        shutdownReason: reason,
        exitCode: code,
        stoppedAt: nowIso(this.now())
      });
    }
    this.log('supervisor.exited', { code, reason });
    this.removeManagedProcessRecord();
    if (this.lockAcquired) {
      releaseOwnerLock(this.store.paths.daemonSupervisorLock, this.ownerPid);
      this.lockAcquired = false;
    }
    this.exitProcess(code);
  }
}

module.exports = {
  DEFAULT_POLICY,
  DaemonSupervisor,
  SUPERVISOR_RECORD_ID,
  acquireOwnerLock,
  parseWorkerMessage,
  policyFromEnvironment,
  pruneCrashTimes,
  releaseOwnerLock,
  restartDelayMs
};
