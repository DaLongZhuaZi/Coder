'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createDaemonStore } = require('../src/daemon-store');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');

const bridgeRoot = path.resolve(__dirname, '..');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-daemon-public-surface-'));
const token = 'daemon-public-surface-smoke-token';

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

function requestJson(port, requestType) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: requestType === 'health' ? '/health' : '/rpc',
      method: requestType === 'health' ? 'GET' : 'POST',
      headers: requestType === 'health' ? {} : {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json'
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ statusCode: response.statusCode || 0, body: JSON.parse(bodyText) });
        } catch (error) {
          reject(new Error('Invalid JSON response: ' + bodyText + ' (' + (error instanceof Error ? error.message : String(error)) + ')'));
        }
      });
    });
    request.once('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('Request timed out.')));
    if (requestType !== 'health') {
      request.write(JSON.stringify({
        id: 'daemon-public-' + requestType,
        type: requestType === 'daemon.logs' ? 'daemon.logs' : requestType,
        payload: {}
      }));
    }
    request.end();
  });
}

async function waitForHealth(port, child, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Bridge exited before health was ready: ' + output.join(''));
    }
    try {
      const response = await requestJson(port, 'health');
      if (response.statusCode === 200 && response.body && response.body.ok === true) {
        return response.body;
      }
    } catch (_error) {
      // Expected while the listener is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for daemon health: ' + output.join(''));
}

function payloadFromRpc(response) {
  assert.strictEqual(response.statusCode, 200);
  assert.ok(response.body && response.body.response && response.body.response.payload);
  return response.body.response.payload;
}

function assertPublicProcessRecord(record, privateValues) {
  assert.ok(record && typeof record === 'object');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'command'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'args'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'cwd'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'identity'), false);
  assert.ok(record.owner && typeof record.owner.type === 'string');
  assert.ok(record.owner && typeof record.owner.id === 'string');
  const serialized = JSON.stringify(record);
  for (const privateValue of privateValues) {
    assert.strictEqual(serialized.includes(privateValue), false, 'public process record leaked private value: ' + privateValue);
  }
}

async function main() {
  const privateCommand = path.join(tempHome, 'private-provider.exe');
  const privateCwd = path.join(tempHome, 'private-workspace');
  fs.mkdirSync(privateCwd, { recursive: true });
  const store = createDaemonStore(tempHome);
  store.writeDaemonUpdateState({
    status: 'staged',
    pendingRestart: true,
    backupPath: privateCommand,
    stagedPath: privateCwd,
    installedPackagePath: privateCommand,
    command: privateCommand,
    args: ['--private-update-arg']
  });
  const ledger = new ManagedProcessLedger(store);
  ledger.record({
    id: 'proc-public-surface',
    providerId: 'provider-private',
    kind: 'workspace-service',
    pid: process.pid,
    command: privateCommand,
    args: ['--secret-arg', privateCommand],
    cwd: privateCwd,
    identity: {
      serviceId: 'service-private',
      workspaceId: 'workspace-private',
      agentId: 'agent-private'
    }
  });

  const port = await reservePort();
  const output = [];
  const child = spawn(process.execPath, [path.join(bridgeRoot, 'src', 'server.js')], {
    cwd: bridgeRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: tempHome,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: token,
      AGENT_BRIDGE_NO_START_PROVIDERS: '1'
    })
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  try {
    await waitForHealth(port, child, output);
    const privateValues = [tempHome, privateCommand, privateCwd, '--secret-arg'];
    const health = payloadFromRpc(await requestJson(port, 'daemon.health'));
    assert.strictEqual(health.configPath, '.agent-bridge/config.json');
    assert.strictEqual(health.logPath, '.agent-bridge/logs/daemon.log');
    assert.ok(Array.isArray(health.managedProcesses));
    assertPublicProcessRecord(health.managedProcesses[0], privateValues);
    assert.strictEqual(JSON.stringify(health.update).includes(tempHome), false);
    assert.strictEqual(health.update.statePath, '.agent-bridge/runtime/update-state.json');
    assert.strictEqual(health.update.update.backupPath, undefined);

    const status = payloadFromRpc(await requestJson(port, 'daemon.status'));
    assert.strictEqual(status.configPath, '.agent-bridge/config.json');
    assert.strictEqual(status.logPath, '.agent-bridge/logs/daemon.log');
    assert.ok(Array.isArray(status.managedProcesses));
    assertPublicProcessRecord(status.managedProcesses[0], privateValues);
    assert.strictEqual(JSON.stringify(status.update).includes(tempHome), false);

    const update = payloadFromRpc(await requestJson(port, 'daemon.update.status'));
    assert.strictEqual(update.statePath, '.agent-bridge/runtime/update-state.json');
    assert.strictEqual(update.backupPath, '.agent-bridge/runtime/update-backups');
    assert.strictEqual(update.stagedPath, '.agent-bridge/runtime/update-staged');
    assert.strictEqual(JSON.stringify(update).includes(tempHome), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(update.update, 'installedPackagePath'), false);

    const logs = payloadFromRpc(await requestJson(port, 'daemon.logs'));
    assert.strictEqual(logs.logPath, '.agent-bridge/logs/daemon.log');
    assert.strictEqual(logs.path, '.agent-bridge/logs/daemon.log');
    assert.strictEqual(logs.logPath.includes(tempHome), false);
    assert.strictEqual(logs.path.includes(tempHome), false);
    console.log('daemon public surface smoke passed');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  fs.rmSync(tempHome, { recursive: true, force: true });
  process.exitCode = 1;
});
