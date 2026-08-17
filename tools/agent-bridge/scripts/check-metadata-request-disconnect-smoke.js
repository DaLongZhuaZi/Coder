'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');

const BRIDGE_TOKEN = 'r27-metadata-disconnect-token';

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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await httpRequest(port, 'GET', '/health', null);
      if (response.statusCode === 200) return;
    } catch (_error) {
      // The child may still be binding its listener.
    }
    await delay(50);
  }
  throw new Error('Bridge did not become healthy for metadata disconnect smoke.');
}

function waitForSocketClose(client, timeoutMs) {
  if (!client || client.state === 'closed') return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    client.once('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function connectBridgeWebSocket(port, clientId) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
    '&clientId=' + encodeURIComponent(clientId) + '&appNonce=' + encodeURIComponent(nonce);
  const client = new RawWebSocketClient(url, { reconnect: false });
  client.on('error', () => {
    // Disconnect is intentional in this smoke.
  });
  await client.connect();
  return client;
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
  const response = waitForResponse(client, id, 8000);
  assert.strictEqual(client.sendJson({ id, type, payload }), true);
  return await response;
}

async function httpRpc(port, id, type, payload) {
  const response = await httpRequest(port, 'POST', '/rpc', { id, type, payload });
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
  assert.ok(response.body.response, 'RPC response envelope should be present.');
  return response.body.response.payload || {};
}

async function waitForActiveWebSocketCount(port, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await httpRpc(port, 'daemon-status-r27-' + String(Date.now()), 'daemon.status', {});
    if (status.activeWebSocketConnections === expected) return status;
    await delay(50);
  }
  return await httpRpc(port, 'daemon-status-r27-final', 'daemon.status', {});
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r27-metadata-disconnect-'));
  const port = 19800 + (process.pid % 800);
  const serverPath = path.resolve(__dirname, '../src/server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
      AGENT_BRIDGE_MOCK_METADATA_DELAY_MS: '1500'
    }),
    stdio: 'ignore'
  });
  let firstClient = null;
  let secondClient = null;

  try {
    await waitForHealth(port);
    firstClient = await connectBridgeWebSocket(port, 'r27-disconnect-client');
    const created = await wsRpc(firstClient, 'session-r27', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R27 metadata disconnect smoke'
    });
    assert.ok(created.session && created.session.sessionId);
    assert.ok(created.agent && created.agent.id);
    const scope = {
      sessionId: created.session.sessionId,
      agentId: created.agent.id,
      hostProfileId: 'host-r27'
    };

    assert.strictEqual(firstClient.sendJson({
      id: 'metadata-disconnect-r27',
      type: 'metadata.generate',
      payload: Object.assign({}, scope, {
        kind: 'sessionTitle',
        prompt: 'disconnect before provider result',
        timeoutMs: 5000
      })
    }), true);
    await delay(120);
    const closed = waitForSocketClose(firstClient, 3000);
    firstClient.terminate();
    assert.strictEqual(await closed, true, 'WebSocket should close intentionally.');
    firstClient = null;

    const disconnectedStatus = await waitForActiveWebSocketCount(port, 0, 3000);
    assert.strictEqual(disconnectedStatus.activeWebSocketConnections, 0, 'Disconnected WebSocket must be unregistered.');

    // Allow the delayed Provider turn to settle after the old socket is gone.
    await delay(1700);
    secondClient = await connectBridgeWebSocket(port, 'r27-disconnect-client');
    const retried = await wsRpc(secondClient, 'metadata-disconnect-r27', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'same request id on a new connection',
      timeoutMs: 3000
    }));
    assert.strictEqual(retried.ok, true, 'A new connection must be able to reuse the request id.');
    assert.strictEqual(retried.requestId, 'metadata-disconnect-r27');
    assert.strictEqual(retried.suggestion, 'same request id on a new connection');

    console.log('metadata request disconnect smoke ok');
  } finally {
    if (firstClient) {
      firstClient.terminate();
      await waitForSocketClose(firstClient, 1000);
    }
    if (secondClient) {
      secondClient.terminate();
      await waitForSocketClose(secondClient, 1000);
    }
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
