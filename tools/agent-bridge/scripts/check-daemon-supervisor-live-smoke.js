'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { processIsAlive } = require('../src/managed-process-ledger');
const { saveProfile } = require('../src/profile-store');
const {
  readBridgeHealth: readLauncherBridgeHealth,
  waitForExit: waitForLauncherExit,
  waitHttpOk: waitForLauncherHttpOk
} = require('../src/desktop-launcher');

const bridgeRoot = path.resolve(__dirname, '..');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-supervisor-live-smoke-'));
const smokeToken = 'daemon-supervisor-live-smoke-token';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function listenServer(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address && typeof address === 'object' ? address.port : 0);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : '';
    const requestOptions = Object.assign({}, options, {
      headers: Object.assign({}, options.headers || {}, payload.length > 0 ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      } : {})
    });
    const request = http.request(requestOptions, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(text)
          });
        } catch (error) {
          reject(new Error('Invalid JSON response: ' + text + ' (' + (error instanceof Error ? error.message : String(error)) + ')'));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error('HTTP request timed out'));
    });
    if (payload.length > 0) {
      request.write(payload);
    }
    request.end();
  });
}

function getHealth(port) {
  return requestJson({
    host: '127.0.0.1',
    port,
    path: '/health',
    method: 'GET'
  }, '');
}

function rpc(port, type) {
  return requestJson({
    host: '127.0.0.1',
    port,
    path: '/rpc',
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + smokeToken
    }
  }, JSON.stringify({
    id: 'supervisor_live_' + type,
    type,
    payload: {}
  }));
}

function readState() {
  const statePath = path.join(tempHome, 'runtime', 'daemon-supervisor.json');
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

async function waitForRunning(port, supervisor, output, previousWorkerPid) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (supervisor.exitCode !== null) {
      throw new Error('Supervisor exited before Bridge became healthy. Output: ' + output.join(''));
    }
    const state = readState();
    try {
      const health = await getHealth(port);
      if (health.statusCode === 200 && health.body && health.body.ok === true && state &&
        state.status === 'running' && state.workerReady === true && state.workerPid > 0 &&
        (typeof previousWorkerPid !== 'number' || state.workerPid !== previousWorkerPid)) {
        return { health: health.body, state };
      }
    } catch (_error) {
      // Expected while the worker is starting or restarting.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for supervised Bridge. State: ' + JSON.stringify(readState()) + ' Output: ' + output.join(''));
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stopProcess(child, workerPid) {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const exited = await waitForExit(child, 5000);
    if (!exited && child.exitCode === null) {
      child.kill('SIGKILL');
      await waitForExit(child, 2000);
    }
  }
  if (typeof workerPid === 'number' && workerPid > 0 && processIsAlive(workerPid)) {
    try {
      process.kill(workerPid, 'SIGTERM');
    } catch (_error) {
      // Best-effort failure cleanup.
    }
  }
}

async function main() {
  const foreignServer = http.createServer((_request, response) => {
    response.statusCode = 404;
    response.end('{}');
  });
  const foreignPort = await listenServer(foreignServer);
  assert.strictEqual(
    await readLauncherBridgeHealth('http://127.0.0.1:' + String(foreignPort) + '/health', 1000),
    null,
    'a foreign HTTP response must not be treated as Bridge health'
  );
  await closeServer(foreignServer);

  const hangingServer = http.createServer(() => {});
  const hangingPort = await listenServer(hangingServer);
  const abortController = new AbortController();
  const abortStartedAt = Date.now();
  const hangingWait = waitForLauncherHttpOk(
    'http://127.0.0.1:' + String(hangingPort) + '/health',
    5000,
    abortController.signal
  );
  setTimeout(() => abortController.abort(), 50);
  assert.strictEqual(await hangingWait, false);
  assert(Date.now() - abortStartedAt < 1000, 'aborting a health wait should settle promptly');
  await closeServer(hangingServer);

  const exitedChild = spawn(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' });
  assert.strictEqual(await waitForExit(exitedChild, 5000), true);
  assert.strictEqual(await waitForLauncherExit(exitedChild), 7, 'late exit observers should receive the recorded exit code');

  const port = await reservePort();
  assert.ok(port > 0, 'supervisor live smoke requires an available port');
  const output = [];
  let supervisor = null;
  let duplicateLauncher = null;
  let latestWorkerPid = 0;
  try {
    const previousHome = process.env.AGENT_BRIDGE_HOME;
    process.env.AGENT_BRIDGE_HOME = tempHome;
    const savedProfile = saveProfile({
      language: 'en',
      connectHost: '127.0.0.1',
      bindHost: '127.0.0.1',
      port,
      token: smokeToken,
      startOpenCode: false,
      startDevEco: false,
      startMimoCode: false
    });
    if (typeof previousHome === 'string') {
      process.env.AGENT_BRIDGE_HOME = previousHome;
    } else {
      delete process.env.AGENT_BRIDGE_HOME;
    }
    supervisor = spawn(process.execPath, [path.join(bridgeRoot, 'src', 'supervisor-entrypoint.js')], {
      cwd: bridgeRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_HOME: tempHome,
        AGENT_BRIDGE_HOST: '127.0.0.1',
        AGENT_BRIDGE_PORT: String(port),
        AGENT_BRIDGE_TOKEN: smokeToken,
        AGENT_BRIDGE_SUPERVISOR_RESTART_BASE_MS: '50',
        AGENT_BRIDGE_SUPERVISOR_RESTART_MAX_MS: '200',
        AGENT_BRIDGE_SUPERVISOR_HEARTBEAT_TIMEOUT_MS: '3000',
        AGENT_BRIDGE_SUPERVISOR_STARTUP_TIMEOUT_MS: '10000'
      })
    });
    supervisor.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
    supervisor.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));

    const first = await waitForRunning(port, supervisor, output);
    const firstStatusResponse = await rpc(port, 'daemon.status');
    const firstStatus = firstStatusResponse.body.response.payload;
    assert.strictEqual(first.state.supervisorPid, supervisor.pid);
    assert.strictEqual(firstStatus.supervised, true);
    assert.strictEqual(firstStatus.supervisorPid, supervisor.pid);
    assert.strictEqual(firstStatus.workerPid, first.state.workerPid);
    assert.notStrictEqual(first.state.workerPid, supervisor.pid);
    latestWorkerPid = first.state.workerPid;

    const duplicateOutput = [];
    const duplicateStartedAt = Date.now();
    duplicateLauncher = spawn(process.execPath, [
      path.join(bridgeRoot, 'src', 'desktop-launcher.js'),
      '--bind-host', '127.0.0.1',
      '--connect-host', '127.0.0.1',
      '--port', String(port),
      '--token', smokeToken,
      '--no-start-providers',
      '--no-open-qr',
      '--lang', 'en'
    ], {
      cwd: bridgeRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_HOME: tempHome,
        NO_COLOR: '1'
      })
    });
    duplicateLauncher.stdout.on('data', (chunk) => duplicateOutput.push(chunk.toString('utf8')));
    duplicateLauncher.stderr.on('data', (chunk) => duplicateOutput.push(chunk.toString('utf8')));
    assert.strictEqual(await waitForExit(duplicateLauncher, 15000), true, 'duplicate launcher should exit without waiting for a second port');
    const duplicateElapsedMs = Date.now() - duplicateStartedAt;
    const duplicateText = duplicateOutput.join('');
    assert.strictEqual(duplicateLauncher.exitCode, 0, 'duplicate launcher should treat an existing matching Bridge as success');
    assert(duplicateElapsedMs < 8000, 'duplicate launcher should reuse the existing Bridge promptly');
    assert(duplicateText.includes('already running') && duplicateText.includes('Reusing'), 'duplicate launcher should explain that it reused the existing Bridge');
    assert(!duplicateText.includes('Using ' + String(port + 1) + ' instead'), 'duplicate launcher must not reassign the Bridge port');
    assert(!duplicateText.includes('did not become healthy'), 'duplicate launcher must not wait on a port it cannot own');

    const afterDuplicateState = readState();
    assert(afterDuplicateState);
    assert.strictEqual(afterDuplicateState.supervisorPid, first.state.supervisorPid);
    assert.strictEqual(afterDuplicateState.workerPid, first.state.workerPid);
    assert.strictEqual(afterDuplicateState.workerGeneration, first.state.workerGeneration);
    const afterDuplicateHealth = await getHealth(port);
    assert.strictEqual(afterDuplicateHealth.body.serverId, first.health.serverId);
    const afterDuplicateProfile = JSON.parse(fs.readFileSync(path.join(tempHome, 'profile.json'), 'utf8'));
    assert.strictEqual(afterDuplicateProfile.port, port, 'duplicate launcher must not persist a fallback port');
    assert.strictEqual(afterDuplicateProfile.deviceKeyFingerprint, savedProfile.deviceKeyFingerprint, 'duplicate launcher must not rotate or replace device identity');

    const updateStatusResponse = await rpc(port, 'daemon.update.status');
    const updateStatus = updateStatusResponse.body.response.payload;
    assert.strictEqual(updateStatusResponse.statusCode, 200);
    assert.strictEqual(updateStatus.action, 'daemon.update.status');
    assert.strictEqual(updateStatus.packageName, '@dlzz/agent-bridge');
    assert.strictEqual(typeof updateStatus.currentVersion, 'string');

    const restart = await rpc(port, 'daemon.restart');
    assert.strictEqual(restart.statusCode, 200);
    assert.strictEqual(restart.body.ok, true);
    assert.strictEqual(restart.body.response.payload.status, 'restarting');
    assert.strictEqual(restart.body.response.payload.replacementStarted, true);

    const second = await waitForRunning(port, supervisor, output, first.state.workerPid);
    assert.strictEqual(second.state.supervisorPid, supervisor.pid);
    assert.notStrictEqual(second.state.workerPid, first.state.workerPid);
    assert.ok(second.state.restartCount >= 1);
    assert.strictEqual(supervisor.exitCode, null);
    latestWorkerPid = second.state.workerPid;

    const stop = await rpc(port, 'daemon.stop');
    assert.strictEqual(stop.statusCode, 200);
    assert.strictEqual(stop.body.ok, true);
    assert.strictEqual(stop.body.response.payload.status, 'stopping');
    assert.strictEqual(await waitForExit(supervisor, 10000), true);

    const finalState = readState();
    assert.ok(finalState);
    assert.strictEqual(finalState.status, 'stopped');
    assert.strictEqual(finalState.workerPid, 0);
    assert.strictEqual(processIsAlive(latestWorkerPid), false);
    assert.strictEqual(fs.existsSync(path.join(tempHome, 'runtime', 'daemon-supervisor.lock')), false);
    console.log('daemon supervisor live smoke ok');
  } finally {
    if (duplicateLauncher && duplicateLauncher.exitCode === null) {
      duplicateLauncher.kill('SIGTERM');
      await waitForExit(duplicateLauncher, 2000);
    }
    await stopProcess(supervisor, latestWorkerPid);
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
