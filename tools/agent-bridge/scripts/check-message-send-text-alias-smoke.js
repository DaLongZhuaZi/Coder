'use strict';

// R172 regression: `message.send` must normalize the legacy `message` alias to
// `text` before delivering to the provider (same semantics as `agent.run`).
// Before the fix, a payload with only `message` reached the mock provider with
// an empty `text`, so the user message content was silently dropped from the
// session history and the assistant replied "(empty message)".

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');

const BRIDGE_TOKEN = 'r172-text-alias-token';

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
  throw new Error('Bridge did not become healthy for message text alias smoke.');
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

function messageText(messages, expected) {
  return (messages || []).some((item) => item && item.role === 'user' && String(item.text || '') === expected);
}

async function waitForMessageText(client, sessionId, expectedText, expectedTotal, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await wsRpc(client, 'poll-' + Date.now(), 'session.messages', { sessionId });
    const messages = result.messages || [];
    if (messages.length >= expectedTotal && messageText(messages, expectedText)) return messages;
    await delay(150);
  }
  throw new Error('Timed out waiting for user message text: ' + expectedText + ' (total >= ' + expectedTotal + ')');
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r172-text-alias-'));
  const port = 21700 + (process.pid % 500);
  const serverPath = path.resolve(__dirname, '../src/server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN
    }),
    stdio: 'ignore'
  });
  let client = null;
  try {
    await waitForHealth(port);
    const nonce = crypto.randomBytes(18).toString('base64url');
    const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
      '&clientId=r172-primary&appNonce=' + encodeURIComponent(nonce);
    client = new RawWebSocketClient(url, { reconnect: false });
    client.on('error', () => {});
    await client.connect();
    await wsRpc(client, 'hello-r172', 'hello', { hostProfileId: 'host-r172', appName: 'R172 text alias smoke' });

    const created = await wsRpc(client, 'session-r172', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R172 text alias smoke'
    });
    assert.ok(created.session && created.session.sessionId);
    assert.ok(created.agent && created.agent.id);
    const sessionId = created.session.sessionId;
    const agentId = created.agent.id;

    const legacy = await wsRpc(client, 'send-r172-legacy', 'message.send', {
      sessionId,
      agentId,
      message: 'R172 legacy message alias payload'
    });
    assert.strictEqual(legacy.accepted, true);
    await waitForMessageText(client, sessionId, 'R172 legacy message alias payload', 2, 15000);

    const canonical = await wsRpc(client, 'send-r172-text', 'message.send', {
      sessionId,
      agentId,
      text: 'R172 canonical text field payload'
    });
    assert.strictEqual(canonical.accepted, true);
    const messages = await waitForMessageText(client, sessionId, 'R172 canonical text field payload', 4, 15000);
    assert.strictEqual(messages.length, 4, 'Two user/assistant pairs must be persisted.');
    const assistantReplies = messages.filter((item) => item.role === 'assistant');
    assert.ok(assistantReplies.some((item) => String(item.text || '').indexOf('R172 legacy message alias payload') >= 0),
      'Mock provider must echo the legacy alias text.');
    assert.ok(assistantReplies.some((item) => String(item.text || '').indexOf('R172 canonical text field payload') >= 0),
      'Mock provider must echo the canonical text.');

    const queued = await wsRpc(client, 'send-r172-queue', 'message.send', {
      sessionId,
      agentId,
      message: 'R172 queued alias payload',
      queuePolicy: 'queue'
    });
    assert.strictEqual(queued.accepted, true);
    const queuedMessages = await waitForMessageText(client, sessionId, 'R172 queued alias payload', 6, 15000);
    assert.strictEqual(queuedMessages.length, 6, 'Third pair must also be persisted.');

    console.log('message.send text alias smoke ok (legacy message + canonical text + queued alias)');
  } finally {
    if (client) {
      try { client.close(); } catch (_error) { /* already closed */ }
    }
    child.kill('SIGTERM');
    await delay(200);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
