#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { canonicalJson, digestDocument } = require('../src/daemon-remote-config-manager');
const { createWebSocketClient } = require('../src/websocket-client');
const { RequestType } = require('../src/protocol');

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function signedDocument(privateKey, version, values) {
  const document = {
    schemaVersion: 1,
    configVersion: version,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    minimumBridgeVersion: '0.1.0',
    scope: { kind: 'daemon' },
    priority: 10,
    values,
    digest: ''
  };
  document.signature = crypto.sign('RSA-SHA256', Buffer.from(canonicalJson(document), 'utf8'), privateKey).toString('base64');
  return document;
}

function fetchedState(document, sourceUrl) {
  const digest = digestDocument(document);
  return {
    document,
    sourceUrl,
    digest,
    validation: { ok: true, digest, warnings: [] },
    fetchedAt: new Date().toISOString()
  };
}

function waitForBridgeHealth(port, child, output) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      if (attempts >= 80) {
        reject(new Error('Bridge health check timed out: ' + output.join('')));
        return;
      }
      setTimeout(check, 100);
    };
    const check = () => {
      if (child.exitCode !== null) {
        reject(new Error('Bridge exited before health check: ' + output.join('')));
        return;
      }
      const request = http.get({ hostname: '127.0.0.1', port, path: '/health' }, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      request.once('error', retry);
    };
    check();
  });
}

async function openBridgeConnection(port, token, hostProfileId, suffix) {
  const clientId = 'remote-config-live-' + hostProfileId + '-' + suffix;
  const appNonce = 'remote-config-nonce-' + hostProfileId + '-' + suffix;
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(token) +
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
      const error = new Error('WebSocket connection closed.');
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    }
  });
  await client.connect();

  const rpc = (type, payload) => new Promise((resolve, reject) => {
    const id = 'remote-config-rpc-' + String(Date.now()) + '-' + Math.random().toString(16).slice(2);
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
    endpoint: url,
    appName: 'Daemon remote config host scope live smoke'
  });
  assert.strictEqual(hello.accepted, true);
  return {
    client,
    rpc,
    close: () => {
      if (client.isOpen) client.close();
    }
  };
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-remote-config-host-live-'));
  const bridgePort = await reservePort();
  const token = 'remote-config-live-token-' + String(Date.now());
  const initialDocument = signedDocument(keys.privateKey, '2026.08.1', { features: { browser: false } });
  const initialStore = createDaemonStore(home);
  initialStore.writeDaemonRemoteConfigState({
    version: 1,
    active: null,
    previous: null,
    fetched: fetchedState(initialDocument, 'https://config.example/bridge.json'),
    degraded: false
  });
  const bridgeOutput = [];
  const bridge = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(bridgePort),
      AGENT_BRIDGE_TOKEN: token,
      AGENT_BRIDGE_REMOTE_CONFIG_PUBLIC_KEY: publicKey,
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  bridge.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
  bridge.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
  let connectionA = null;
  let connectionB = null;
  try {
    await waitForBridgeHealth(bridgePort, bridge, bridgeOutput);
    connectionA = await openBridgeConnection(bridgePort, token, 'host-a', 'a1');
    connectionB = await openBridgeConnection(bridgePort, token, 'host-b', 'b1');

    const statusA = await connectionA.rpc(RequestType.DAEMON_CONFIG_STATUS, { hostProfileId: 'host-b' });
    assert.strictEqual(statusA.ok, true);
    assert.strictEqual(statusA.hostProfileId, 'host-a');
    assert.strictEqual(statusA.fetchedVersion, '2026.08.1');

    const previewA = await connectionA.rpc(RequestType.DAEMON_CONFIG_PREVIEW, { hostProfileId: 'host-b' });
    assert.strictEqual(previewA.ok, true);
    assert.strictEqual(previewA.preview, true);
    assert.strictEqual(previewA.hostProfileId, 'host-a');
    assert.ok(previewA.planId);
    const crossHostApply = await connectionB.rpc(RequestType.DAEMON_CONFIG_APPLY, {
      hostProfileId: 'host-a',
      planId: previewA.planId,
      confirm: true
    });
    assert.strictEqual(crossHostApply.failureCategory, 'host_scope_mismatch');

    const appliedA = await connectionA.rpc(RequestType.DAEMON_CONFIG_APPLY, {
      planId: previewA.planId,
      confirm: true
    });
    assert.strictEqual(appliedA.ok, true);
    assert.strictEqual(appliedA.confirmed, true);
    assert.strictEqual(appliedA.hostProfileId, 'host-a');

    const stalePlan = await connectionA.rpc(RequestType.DAEMON_CONFIG_PREVIEW, {});
    const nextDocument = signedDocument(keys.privateKey, '2026.08.2', { features: { browser: true } });
    const storeAfterApply = createDaemonStore(home);
    storeAfterApply.writeDaemonRemoteConfigState({
      version: 1,
      active: storeAfterApply.readDaemonRemoteConfigState().active,
      previous: storeAfterApply.readDaemonRemoteConfigState().previous,
      fetched: fetchedState(nextDocument, 'https://config.example/changed.json'),
      degraded: false
    });
    const staleApply = await connectionA.rpc(RequestType.DAEMON_CONFIG_APPLY, { planId: stalePlan.planId, confirm: true });
    assert.strictEqual(staleApply.failureCategory, 'plan_expired');

    const freshPreview = await connectionA.rpc(RequestType.DAEMON_CONFIG_PREVIEW, {});
    const freshApply = await connectionA.rpc(RequestType.DAEMON_CONFIG_APPLY, { planId: freshPreview.planId, confirm: true });
    assert.strictEqual(freshApply.ok, true);
    assert.strictEqual(freshApply.activeVersion, '2026.08.2');
    assert.strictEqual(freshApply.previousVersion, '2026.08.1');

    const rollbackPreview = await connectionA.rpc(RequestType.DAEMON_CONFIG_ROLLBACK, {});
    assert.strictEqual(rollbackPreview.ok, true);
    assert.strictEqual(rollbackPreview.preview, true);
    const crossHostRollback = await connectionB.rpc(RequestType.DAEMON_CONFIG_ROLLBACK, { planId: rollbackPreview.planId, confirm: true });
    assert.strictEqual(crossHostRollback.failureCategory, 'host_scope_mismatch');
    const rolledBack = await connectionA.rpc(RequestType.DAEMON_CONFIG_ROLLBACK, { planId: rollbackPreview.planId, confirm: true });
    assert.strictEqual(rolledBack.ok, true);
    assert.strictEqual(rolledBack.confirmed, true);
    assert.strictEqual(rolledBack.activeVersion, '2026.08.1');

    console.log('daemon remote config host scope live smoke ok');
  } finally {
    if (connectionA) connectionA.close();
    if (connectionB) connectionB.close();
    if (bridge.exitCode === null) bridge.kill('SIGTERM');
    await waitForExit(bridge, 5000);
    if (bridge.exitCode === null) bridge.kill();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});

