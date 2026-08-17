#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { createWebSocketClient } = require('../src/websocket-client');
const { processIsAlive } = require('../src/managed-process-ledger');
const { RequestType } = require('../src/protocol');

const bridgeRoot = path.resolve(__dirname, '..');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const text = typeof body === 'string' ? body : '';
    const requestOptions = Object.assign({}, options, {
      headers: Object.assign({}, options.headers || {}, text.length > 0 ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(text)
      } : {})
    });
    const request = http.request(requestOptions, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(responseText)
          });
        } catch (error) {
          reject(new Error('Invalid JSON response: ' + responseText + ' (' + (error instanceof Error ? error.message : String(error)) + ')'));
        }
      });
    });
    request.once('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('HTTP request timed out')));
    if (text.length > 0) request.write(text);
    request.end();
  });
}

function readSupervisorState(home) {
  const filePath = path.join(home, 'runtime', 'daemon-supervisor.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function readHealth(port) {
  return requestJson({
    host: '127.0.0.1',
    port,
    path: '/health',
    method: 'GET'
  }, '');
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitForRunning(target, previousWorkerPid) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (target.process.exitCode !== null) {
      throw new Error(target.label + ' supervisor exited: ' + target.output.join(''));
    }
    const state = readSupervisorState(target.home);
    try {
      const health = await readHealth(target.port);
      const body = health.body;
      if (health.statusCode === 200 && body && body.ok === true && state &&
        state.status === 'running' && state.workerReady === true && state.workerPid > 0 &&
        (typeof previousWorkerPid !== 'number' || state.workerPid !== previousWorkerPid)) {
        return { health: body, state };
      }
    } catch (_error) {
      // The supervisor may be between worker generations.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for ' + target.label + ': ' + JSON.stringify(readSupervisorState(target.home)));
}

function spawnTarget(label, home, port, token) {
  const output = [];
  const child = childProcess.spawn(process.execPath, ['src/supervisor-entrypoint.js'], {
    cwd: bridgeRoot,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: token,
      AGENT_BRIDGE_SUPERVISOR_RESTART_BASE_MS: '50',
      AGENT_BRIDGE_SUPERVISOR_RESTART_MAX_MS: '200',
      AGENT_BRIDGE_SUPERVISOR_HEARTBEAT_TIMEOUT_MS: '3000',
      AGENT_BRIDGE_SUPERVISOR_STARTUP_TIMEOUT_MS: '10000',
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  return { label, home, port, token, process: child, output };
}

async function stopTarget(target) {
  const state = readSupervisorState(target.home);
  if (target.process && target.process.exitCode === null) {
    target.process.kill('SIGTERM');
    const exited = await waitForExit(target.process, 5000);
    if (!exited && target.process.exitCode === null) {
      target.process.kill('SIGKILL');
      await waitForExit(target.process, 2000);
    }
  }
  if (state && typeof state.workerPid === 'number' && state.workerPid > 0 && processIsAlive(state.workerPid)) {
    try {
      process.kill(state.workerPid, 'SIGTERM');
    } catch (_error) {
      // Best-effort cleanup after the supervisor exits.
    }
  }
}

async function openConnection(target, hostProfileId, suffix) {
  const clientId = 'daemon-fleet-live-' + hostProfileId + '-' + suffix;
  const appNonce = 'daemon-fleet-live-nonce-' + hostProfileId + '-' + suffix;
  const endpoint = 'ws://127.0.0.1:' + String(target.port) + '/ws';
  const url = endpoint + '?token=' + encodeURIComponent(target.token) +
    '&clientId=' + encodeURIComponent(clientId) + '&appNonce=' + encodeURIComponent(appNonce);
  const pending = new Map();
  const client = createWebSocketClient(url, {
    onMessage(rawText) {
      let message;
      try {
        message = JSON.parse(rawText);
      } catch (_error) {
        return;
      }
      if (!message || message.type !== 'response' || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve(message.payload || {});
    },
    onError(error) {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
      pending.clear();
    },
    onClose() {
      const error = new Error('Bridge WebSocket closed.');
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    }
  });
  await client.connect();
  const rpc = (type, payload) => new Promise((resolve, reject) => {
    const id = 'daemon-fleet-rpc-' + String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timed out waiting for ' + type));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    try {
      client.sendJson({ id, type, payload: payload || {} });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
  const hello = await rpc(RequestType.HELLO, {
    hostProfileId,
    clientId,
    appNonce,
    endpoint,
    appName: 'Daemon fleet live smoke'
  });
  assert.strictEqual(hello.accepted, true, 'Bridge should accept the fleet smoke connection.');
  return {
    client,
    rpc,
    close() {
      if (client.isOpen) client.close();
    }
  };
}

async function instanceStatus(connection, hostProfileId) {
  const status = await connection.rpc(RequestType.DAEMON_INSTANCE_STATUS, { hostProfileId });
  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.action, 'daemon.instance.status');
  assert.strictEqual(status.hostProfileId, hostProfileId);
  assert.ok(typeof status.instanceId === 'string' && status.instanceId.length > 0);
  assert.ok(Number.isInteger(status.generation) && status.generation >= 0);
  assert.ok(typeof status.instanceHealth === 'string' && status.instanceHealth.length > 0);
  assert.ok(status.features && status.features.daemonFleetTarget === true,
    'A live rolling target must explicitly advertise daemonFleetTarget.');
  return status;
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-daemon-fleet-live-'));
  const homeA = path.join(tempRoot, 'bridge-a');
  const homeB = path.join(tempRoot, 'bridge-b');
  fs.mkdirSync(homeA, { recursive: true });
  fs.mkdirSync(homeB, { recursive: true });
  const targetA = {
    label: 'Bridge A',
    home: homeA,
    port: await reservePort(),
    token: 'daemon-fleet-live-token-a-' + String(Date.now())
  };
  const targetB = {
    label: 'Bridge B',
    home: homeB,
    port: await reservePort(),
    token: 'daemon-fleet-live-token-b-' + String(Date.now())
  };
  targetA.process = null;
  targetB.process = null;
  targetA.output = [];
  targetB.output = [];
  let connectionA = null;
  let connectionB = null;
  let connectionAAfterRestart = null;
  let connectionBAfterRestart = null;
  try {
    const spawnedA = spawnTarget(targetA.label, targetA.home, targetA.port, targetA.token);
    targetA.process = spawnedA.process;
    targetA.output = spawnedA.output;
    const spawnedB = spawnTarget(targetB.label, targetB.home, targetB.port, targetB.token);
    targetB.process = spawnedB.process;
    targetB.output = spawnedB.output;

    const firstA = await waitForRunning(targetA);
    const firstB = await waitForRunning(targetB);
    connectionA = await openConnection(targetA, 'fleet-host-a', 'initial');
    connectionB = await openConnection(targetB, 'fleet-host-b', 'initial');

    const statusA = await instanceStatus(connectionA, 'fleet-host-a');
    const statusB = await instanceStatus(connectionB, 'fleet-host-b');
    assert.notStrictEqual(statusA.instanceId, statusB.instanceId, 'Independent Bridge homes must have different instance ids.');
    assert.strictEqual(statusA.workerGeneration, firstA.state.workerGeneration);
    assert.strictEqual(statusB.workerGeneration, firstB.state.workerGeneration);
    const repeatA = await instanceStatus(connectionA, 'fleet-host-a');
    assert.strictEqual(repeatA.instanceId, statusA.instanceId, 'Bridge A instance id must remain stable.');
    assert.strictEqual(repeatA.generation, statusA.generation);

    const crossHost = await connectionA.rpc(RequestType.DAEMON_RESTART, {
      expectedInstanceId: statusA.instanceId,
      expectedGeneration: statusA.generation,
      hostProfileId: 'fleet-host-b'
    });
    assert.strictEqual(crossHost.failureCategory, 'host_profile_mismatch');

    const restartA = await connectionA.rpc(RequestType.DAEMON_RESTART, {
      expectedInstanceId: statusA.instanceId,
      expectedGeneration: statusA.generation,
      hostProfileId: 'fleet-host-a'
    });
    assert.strictEqual(restartA.ok, true);
    assert.strictEqual(restartA.replacementStarted, true);
    const afterRestartA = await waitForRunning(targetA, firstA.state.workerPid);
    assert.ok(afterRestartA.state.workerGeneration > firstA.state.workerGeneration);
    connectionA.close();
    connectionA = null;
    connectionAAfterRestart = await openConnection(targetA, 'fleet-host-a', 'after-a-restart');
    const statusA2 = await instanceStatus(connectionAAfterRestart, 'fleet-host-a');
    assert.strictEqual(statusA2.instanceId, statusA.instanceId);
    assert.ok(statusA2.generation > statusA.generation);

    const staleA = await connectionAAfterRestart.rpc(RequestType.DAEMON_RESTART, {
      expectedInstanceId: statusA.instanceId,
      expectedGeneration: statusA.generation,
      hostProfileId: 'fleet-host-a'
    });
    assert.strictEqual(staleA.failureCategory, 'daemon_generation_stale');

    const restartB = await connectionB.rpc(RequestType.DAEMON_RESTART, {
      expectedInstanceId: statusB.instanceId,
      expectedGeneration: statusB.generation,
      hostProfileId: 'fleet-host-b'
    });
    assert.strictEqual(restartB.ok, true);
    const afterRestartB = await waitForRunning(targetB, firstB.state.workerPid);
    assert.ok(afterRestartB.state.workerGeneration > firstB.state.workerGeneration);
    connectionB.close();
    connectionB = null;
    connectionBAfterRestart = await openConnection(targetB, 'fleet-host-b', 'after-b-restart');
    const statusB2 = await instanceStatus(connectionBAfterRestart, 'fleet-host-b');
    assert.strictEqual(statusB2.instanceId, statusB.instanceId);
    assert.ok(statusB2.generation > statusB.generation);

    const wrongInstance = await connectionAAfterRestart.rpc(RequestType.DAEMON_RESTART, {
      expectedInstanceId: statusB2.instanceId,
      expectedGeneration: statusB2.generation,
      hostProfileId: 'fleet-host-a'
    });
    assert.strictEqual(wrongInstance.failureCategory, 'daemon_instance_changed');

    const statusA3 = await instanceStatus(connectionAAfterRestart, 'fleet-host-a');
    assert.strictEqual(statusA3.instanceId, statusA.instanceId);
    assert.ok(statusA3.generation > statusA.generation);
    assert.notStrictEqual(statusA3.instanceId, statusB2.instanceId);
    console.log('daemon fleet live smoke ok');
  } finally {
    if (connectionA) connectionA.close();
    if (connectionB) connectionB.close();
    if (connectionAAfterRestart) connectionAAfterRestart.close();
    if (connectionBAfterRestart) connectionBAfterRestart.close();
    await stopTarget(targetA);
    await stopTarget(targetB);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
