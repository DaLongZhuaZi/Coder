'use strict';

// R182 regression: after a Bridge restart, persisted agent records keep their
// providerSessionId while in-memory provider runtime sessions are gone (the
// mock provider stores sessions in memory). Before the fix, message.send and
// session.messages returned session_not_found for a session the agent record
// still advertised. ensureProviderSessionForAgent now rehydrates the provider
// session through the optional provider.ensureSession contract before failing.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');

const BRIDGE_TOKEN = 'r182-rehydrate-token';

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
  throw new Error('Bridge did not become healthy for session rehydrate smoke.');
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
      finish(() => resolve(message));
    };
    const onClose = () => finish(() => reject(new Error('WebSocket closed before response ' + id + '.')));
    client.on('text', onText);
    client.once('close', onClose);
  });
}

async function wsRpc(client, id, type, payload) {
  const response = waitForResponse(client, id, 15000);
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

async function connectClient(port, clientId, nonce) {
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
    '&clientId=' + encodeURIComponent(clientId) + '&appNonce=' + encodeURIComponent(nonce);
  const client = new RawWebSocketClient(url, { reconnect: false });
  client.on('error', () => {});
  await client.connect();
  await wsRpc(client, 'hello-' + clientId, 'hello', { hostProfileId: 'host-r182', appName: 'R182 rehydrate smoke' });
  return client;
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r182-rehydrate-'));
  const port = 23100 + (process.pid % 400);
  let bridge = null;
  let client = null;
  try {
    bridge = startBridge(port, home);
    await waitForHealth(port);
    client = await connectClient(port, 'r182-client-a', 'nonce-a-' + String(Date.now()));

    const created = await wsRpc(client, 'create-a', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R182 rehydrate smoke'
    });
    assert.ok(created.payload && created.payload.ok !== false, 'session.create must succeed');
    const agent = created.payload && created.payload.agent ? created.payload.agent : null;
    assert.ok(agent && agent.id, 'session.create must return an agent');
    const sessionId = typeof agent.providerSessionId === 'string' && agent.providerSessionId.length > 0
      ? agent.providerSessionId
      : (typeof agent.remoteSessionId === 'string' ? agent.remoteSessionId : '');
    assert.ok(sessionId.length > 0, 'agent must expose a provider session id');

    const sentBefore = await wsRpc(client, 'send-a', 'message.send', { sessionId, text: 'before restart' });
    assert.ok(sentBefore.payload && sentBefore.payload.ok !== false, 'message.send must work while the session is live');
    const messagesBefore = await wsRpc(client, 'messages-a', 'session.messages', { sessionId });
    assert.ok(messagesBefore.payload && typeof messagesBefore.payload.messages === 'object', 'session.messages must work while the session is live');

    // Simulate a Bridge restart on the same persisted home.
    client.close();
    client = null;
    bridge.kill('SIGTERM');
    bridge = null;
    await delay(500);
    bridge = startBridge(port, home);
    await waitForHealth(port);
    client = await connectClient(port, 'r182-client-b', 'nonce-b-' + String(Date.now()));

    const listed = await wsRpc(client, 'list-b', 'agent.list', {});
    const agents = listed.payload && Array.isArray(listed.payload.agents) ? listed.payload.agents : [];
    assert.ok(agents.some((item) => item.id === agent.id), 'the agent record must survive the restart');

    const sentAfter = await wsRpc(client, 'send-b', 'message.send', { sessionId, text: 'after restart' });
    assert.ok(sentAfter.ok !== false, 'message.send must rehydrate the provider session after restart, got: ' +
      (sentAfter.error ? JSON.stringify(sentAfter.error) : 'ok'));
    const messagesAfter = await wsRpc(client, 'messages-b', 'session.messages', { sessionId });
    assert.ok(messagesAfter.ok !== false && messagesAfter.payload && typeof messagesAfter.payload.messages === 'object',
      'session.messages must rehydrate the provider session after restart');

    console.log('session rehydrate smoke ok');
  } finally {
    try {
      if (client) client.close();
    } catch (_error) {}
    if (bridge) {
      try {
        bridge.kill('SIGTERM');
      } catch (_error) {}
    }
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch (_error) {}
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
