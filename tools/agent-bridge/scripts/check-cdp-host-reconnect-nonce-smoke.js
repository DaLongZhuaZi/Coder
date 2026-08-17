'use strict';

// R173 regression: the CDP browser host must reconnect to the Bridge with a
// FRESH appNonce after the Bridge restarts. Before the fix the host reused one
// URL (one nonce) across built-in reconnects, so every retry after a Bridge
// restart was rejected as nonce_replay for the 10-minute replay TTL and the
// host stayed offline.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');
const { BrowserCdpHost } = require('../src/browser-cdp-host');

const BRIDGE_TOKEN = 'r173-cdp-reconnect-token';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest(port, method, route, body) {
  return new Promise((resolve, reject) => {
    const requestBody = body ? JSON.stringify(body) : '';
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: route,
      headers: {
        Authorization: 'Bearer ' + BRIDGE_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        let parsed = {};
        try {
          parsed = text.length > 0 ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
        }
        resolve({ statusCode: response.statusCode || 0, body: parsed });
      });
    });
    request.on('error', reject);
    request.end(requestBody);
  });
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await httpRequest(port, 'GET', '/health', null);
      if (response.statusCode === 200) return;
    } catch (_error) {
      // The child may still be binding its listener.
    }
    await delay(50);
  }
  throw new Error('Bridge did not become healthy for CDP host reconnect smoke.');
}

function waitForResponse(client, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeListener('text', onText);
      client.removeListener('close', onClose);
      reject(new Error('Timed out waiting for WebSocket response ' + id + '.'));
    }, timeoutMs);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeListener('text', onText);
      client.removeListener('close', onClose);
      callback();
    };
    const onText = (text) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch (_error) {
        return;
      }
      if (!message || message.type !== 'response' || message.id !== id) return;
      finish(() => resolve(message.payload && typeof message.payload === 'object' ? message.payload : {}));
    };
    const onClose = () => finish(() => reject(new Error('WebSocket closed before response ' + id + '.')));
    client.on('text', onText);
    client.once('close', onClose);
  });
}

async function wsRpc(client, id, type, payload) {
  const response = waitForResponse(client, id, 10000);
  assert.strictEqual(client.sendJson({ id, type, payload }), true);
  return await response;
}

function startBridge(port, home) {
  const serverPath = path.resolve(__dirname, '../src/server.js');
  return spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN
    }),
    stdio: 'ignore'
  });
}

function startFakeCdp() {
  const server = http.createServer((req, res) => {
    if (req.url === '/json/version') {
      const body = JSON.stringify({ Browser: 'Fake Chromium', webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/fake' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (req.url === '/json/list') {
      const body = JSON.stringify([]);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function hostRegistered(client, hostId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await wsRpc(client, 'host-list-' + Date.now(), 'browser.host.list', {});
    const hosts = result.hosts || [];
    if (hosts.some((host) => host.hostId === hostId)) return true;
    await delay(250);
  }
  return false;
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r173-cdp-reconnect-'));
  const port = 21900 + (process.pid % 400);
  const fakeCdp = await startFakeCdp();
  const fakeCdpPort = fakeCdp.address().port;
  let bridgeA = null;
  let bridgeB = null;
  let client = null;
  let host = null;
  try {
    bridgeA = startBridge(port, home);
    await waitForHealth(port);
    const nonce = crypto.randomBytes(18).toString('base64url');
    const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
      '&clientId=r173-observer&appNonce=' + encodeURIComponent(nonce);
    client = new RawWebSocketClient(url, { reconnect: false });
    client.on('error', () => {});
    await client.connect();
    await wsRpc(client, 'hello-r173', 'hello', { hostProfileId: 'host-r173', appName: 'R173 CDP reconnect smoke' });

    // A browser host may only register for ACTIVE registered workspaces;
    // session.create registers the workspace for the given path.
    const created = await wsRpc(client, 'session-r173', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R173 CDP reconnect smoke'
    });
    assert.ok(created.agent && created.agent.workspaceId);
    host = new BrowserCdpHost({
      bridgeUrl: 'http://127.0.0.1:' + String(port),
      bridgeToken: BRIDGE_TOKEN,
      cdpUrl: 'http://127.0.0.1:' + String(fakeCdpPort),
      hostId: 'r173-cdp-host',
      workspaceIds: [created.agent.workspaceId]
    });
    await host.start();
    assert.strictEqual(await hostRegistered(client, 'r173-cdp-host', 10000), true, 'Host must register on first connect.');

    // Simulate a Bridge restart: kill A, start B on the same port.
    bridgeA.kill('SIGTERM');
    bridgeA = null;
    await delay(300);
    bridgeB = startBridge(port, home);
    await waitForHealth(port);

    // The observer's own socket also died with bridge A; reconnect it with a
    // fresh nonce before polling for the host re-registration.
    if (!client.isOpen) {
      try { client.close(); } catch (_error) { /* already closed */ }
      const nonce2 = crypto.randomBytes(18).toString('base64url');
      const url2 = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
        '&clientId=r173-observer&appNonce=' + encodeURIComponent(nonce2);
      client = new RawWebSocketClient(url2, { reconnect: false });
      client.on('error', () => {});
      await client.connect();
      await wsRpc(client, 'hello-r173-b', 'hello', { hostProfileId: 'host-r173', appName: 'R173 CDP reconnect smoke' });
    }

    // The host must reconnect with a fresh appNonce and re-register.
    assert.strictEqual(await hostRegistered(client, 'r173-cdp-host', 20000), true,
      'Host must re-register after Bridge restart without nonce_replay lockout.');
    assert.ok(host.bridgeClient && host.bridgeClient.isOpen, 'Host bridge client must be open after reconnect.');
    console.log('CDP host reconnect nonce smoke ok (fresh appNonce per reconnect)');
  } finally {
    if (host) host.stop();
    if (client) {
      try { client.close(); } catch (_error) { /* already closed */ }
    }
    if (bridgeA) bridgeA.kill('SIGTERM');
    if (bridgeB) bridgeB.kill('SIGTERM');
    await new Promise((resolve) => fakeCdp.close(resolve));
    await delay(200);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
