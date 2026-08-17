'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHILD_TIMEOUT_MS = 12000;
const RUN_COUNT = 3;

async function main() {
  if (process.argv.includes('--child')) {
    await runChild();
    return;
  }
  if (process.platform !== 'win32') {
    console.log('windows pty smoke skipped: non-Windows platform');
    return;
  }
  for (let index = 0; index < RUN_COUNT; index += 1) {
    const result = await runIsolatedChild(index + 1);
    assert(result.code === 0, 'Windows PTY child run ' + String(index + 1) + ' failed: ' + result.stderr);
    assert(result.stderr.trim().length === 0, 'Windows PTY child emitted stderr: ' + result.stderr.trim());
    assert(result.stdout.includes('windows pty child passed'), 'Windows PTY child did not report completion.');
  }
  console.log('windows pty smoke passed: ' + String(RUN_COUNT) + ' consecutive runs');
}

function runIsolatedChild(runNumber) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [__filename, '--child', String(runNumber)], {
      cwd: path.resolve(__dirname, '..'),
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND: 'conpty-dll'
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Windows PTY child timed out after ' + String(CHILD_TIMEOUT_MS) + 'ms.'));
    }, CHILD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code: typeof code === 'number' ? code : 1,
        signal: signal || '',
        stdout,
        stderr
      });
    });
  });
}

async function runChild() {
  const originalFork = childProcess.fork;
  let helperForkCount = 0;
  childProcess.fork = function monitoredFork(modulePath, args, options) {
    if (String(modulePath).includes('conpty_console_list_agent')) {
      helperForkCount += 1;
    }
    return originalFork.call(childProcess, modulePath, args, options);
  };

  const { AgentManager } = require('../src/agent-manager');
  const { TerminalStreamOpcode } = require('../src/binary-frames');
  const { createDaemonStore } = require('../src/daemon-store');
  const { ManagedProcessLedger } = require('../src/managed-process-ledger');
  const { TerminalManager } = require('../src/terminal-manager');
  const { WorkspaceRegistry } = require('../src/workspace-registry');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-windows-pty-smoke-'));
  try {
    const store = createDaemonStore(path.join(tempRoot, 'bridge-home'));
    const workspaceRoot = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const workspaceRegistry = new WorkspaceRegistry(store);
    const workspace = workspaceRegistry.upsertWorkspace({
      cwd: workspaceRoot,
      title: 'Windows PTY Smoke',
      dedupeByCwd: true
    });
    const agentManager = new AgentManager({ store, workspaceRegistry });
    const ledger = new ManagedProcessLedger(store);
    const manager = new TerminalManager({
      workspaceRegistry,
      agentManager,
      managedProcessLedger: ledger,
      daemonStore: store,
      broadcast() {}
    });
    assert(manager.isAvailable(), 'node-pty with conpty-dll backend must be available on Windows.');
    const created = manager.create({ workspaceId: workspace.workspaceId, rows: 12, cols: 80 });
    assert(created.terminal && created.terminal.terminalId.length > 0, 'Windows PTY was not created.');
    assert(created.terminal.backend === 'conpty-dll', 'Windows PTY did not use conpty-dll backend.');
    const terminalId = created.terminal.terminalId;
    const connection = createFakeConnection();
    const subscribed = manager.subscribe(connection, { terminalId });
    assert(subscribed.slot > 0, 'Windows PTY subscription did not allocate a slot.');
    const inputHandled = manager.handleBinaryFrame(connection, {
      opcode: TerminalStreamOpcode.INPUT,
      slot: subscribed.slot,
      payload: Buffer.from('echo NGF_PTY_READY\r', 'utf8')
    });
    assert(inputHandled, 'Windows PTY input was rejected.');
    const outputReady = await waitForCondition(() => {
      const terminal = manager.terminals.get(terminalId);
      return !!terminal && terminal.captureText.includes('NGF_PTY_READY');
    }, 5000);
    assert(outputReady, 'Windows PTY did not produce the sentinel output.');
    const resizeHandled = manager.handleBinaryFrame(connection, {
      opcode: TerminalStreamOpcode.RESIZE,
      slot: subscribed.slot,
      payload: Buffer.from('{"rows":20,"cols":100}', 'utf8')
    });
    assert(resizeHandled, 'Windows PTY resize was rejected.');
    const killed = manager.kill({ terminalId });
    assert(killed.killed === true, 'Windows PTY kill was rejected.');
    const exited = await waitForCondition(() => {
      const terminal = manager.terminals.get(terminalId);
      return !!terminal && terminal.processExitedAt > 0;
    }, 5000);
    assert(exited, 'Windows PTY did not report process exit.');
    manager.detachConnection(connection);
    const session = manager.terminals.get(terminalId);
    assert(session.subscribers.size === 0, 'Windows PTY left a terminal subscriber.');
    assert(session.flushTimer === null && session.idleTimer === null, 'Windows PTY left an active timer.');
    assert(ledger.list().length === 0, 'Windows PTY left a managed process record.');
    assert(helperForkCount === 0, 'conpty_console_list_agent must not be forked by conpty-dll backend.');
    console.log('windows pty child passed');
  } finally {
    childProcess.fork = originalFork;
    await removeTempDirectory(tempRoot);
  }
}

function createFakeConnection() {
  return {
    connectionId: 'windows-pty-smoke',
    terminalSlots: new Map(),
    terminalSubscriptions: new Map(),
    sendBinary() {},
    sendJson() {}
  };
}

function waitForCondition(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve(false);
      }
    }, 20);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function removeTempDirectory(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp + path.sep)) {
    throw new Error('refusing to remove path outside temp directory: ' + resolvedTarget);
  }
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50 + attempt * 25));
    }
  }
  throw lastError;
}

main().then(() => {
  if (process.argv.includes('--child')) {
    process.exit(0);
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
