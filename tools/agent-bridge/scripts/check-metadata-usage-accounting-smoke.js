#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');
const { normalizeMetadataResult } = require('../src/metadata-scope');

const TOKEN = 'r81-metadata-usage-token';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function httpRequest(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'GET', path: route }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode || 0));
    });
    request.on('error', reject);
    request.end();
  });
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if (await httpRequest(port, '/health') === 200) return;
    } catch (_error) {
      // The child may not have bound its listener yet.
    }
    await delay(50);
  }
  throw new Error('Bridge did not become healthy for metadata usage smoke.');
}

function waitForResponse(client, id) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(() => reject(new Error('Timed out waiting for ' + id))), 10000);
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
      try { message = JSON.parse(text); } catch (_error) { return; }
      if (!message || message.type !== 'response' || message.id !== id) return;
      finish(() => resolve(message.payload && typeof message.payload === 'object' ? message.payload : {}));
    };
    const onClose = () => finish(() => reject(new Error('Bridge closed before ' + id)));
    client.on('text', onText);
    client.once('close', onClose);
  });
}

async function rpc(client, id, type, payload) {
  const response = waitForResponse(client, id);
  assert.strictEqual(client.sendJson({ id, type, payload }), true);
  return await response;
}

async function connect(port) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(TOKEN) +
    '&clientId=r81-metadata-usage&appNonce=' + encodeURIComponent(nonce);
  const client = new RawWebSocketClient(url, { reconnect: false });
  client.on('error', () => {});
  await client.connect();
  await rpc(client, 'hello-r81', 'hello', { hostProfileId: 'host-r81', appName: 'R81 metadata usage smoke' });
  return client;
}

async function waitForMetadataUsage(observed) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (observed.some((event) => event.event === 'usage.updated' && event.payload && event.payload.usage &&
      event.payload.usage.kind === 'metadata')) return;
    await delay(25);
  }
  throw new Error('Metadata usage.updated event was not observed.');
}

async function main() {
  const normalized = normalizeMetadataResult('sessionTitle', {
    suggestion: 'R81 metadata',
    usage: { inputTokens: 4, outputTokens: 3, cost: 0.02, currency: 'usd' }
  });
  assert.strictEqual(normalized.usage.totalTokens, 7);
  assert.strictEqual(normalized.usage.currency, 'USD');
  const invalidUsage = normalizeMetadataResult('sessionTitle', {
    suggestion: 'R81 metadata',
    usage: { inputTokens: -1, cost: -0.1 }
  });
  assert.strictEqual(Object.keys(invalidUsage).includes('usage'), false);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r81-metadata-usage-'));
  const port = 21400 + (process.pid % 400);
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/server.js')], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: TOKEN,
      AGENT_BRIDGE_MOCK_METADATA_USAGE: '1'
    }),
    stdio: 'ignore'
  });
  let client = null;
  try {
    await waitForHealth(port);
    client = await connect(port);
    const observed = [];
    client.on('text', (text) => {
      try {
        const message = JSON.parse(text);
        if (message && message.type === 'event') observed.push(message);
      } catch (_error) {
        // RPC parsing handles responses; malformed unsolicited data is ignored.
      }
    });
    const created = await rpc(client, 'session-r81', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R81 metadata usage smoke'
    });
    assert.ok(created.session && created.session.sessionId);
    assert.ok(created.agent && created.agent.id);
    const scope = {
      hostProfileId: 'host-r81',
      sessionId: created.session.sessionId,
      agentId: created.agent.id,
      providerId: 'mock'
    };
    const first = await rpc(client, 'metadata-r81', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'R81 metadata usage',
      timeoutMs: 2000
    }));
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.usageEventsRecorded, 1);
    await waitForMetadataUsage(observed);
    const summary = await rpc(client, 'summary-r81', 'usage.summary.get', scope);
    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.summary.eventCount, 1);
    assert.strictEqual(summary.summary.actual.tokens.totalTokens, 7);
    assert.strictEqual(summary.summary.actual.costs[0].currency, 'USD');
    assert.strictEqual(summary.summary.actual.costs[0].amount, 0.02);
    const duplicate = await rpc(client, 'metadata-r81-duplicate', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'R81 metadata usage retry',
      timeoutMs: 2000
    }));
    assert.strictEqual(duplicate.ok, true);
    assert.strictEqual(duplicate.usageEventsRecorded, 0, 'same Provider usage event must be idempotent');
    const afterDuplicate = await rpc(client, 'summary-r81-after-duplicate', 'usage.summary.get', scope);
    assert.strictEqual(afterDuplicate.summary.eventCount, 1);
    console.log('metadata usage accounting smoke ok');
  } finally {
    if (client) {
      client.terminate();
      await delay(50);
    }
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
