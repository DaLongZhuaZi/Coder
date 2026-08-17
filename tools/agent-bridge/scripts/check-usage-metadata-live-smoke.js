'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { RawWebSocketClient } = require('../src/websocket-client');

const BRIDGE_TOKEN = 'r28-usage-metadata-token';

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
  throw new Error('Bridge did not become healthy for usage metadata smoke.');
}

async function connectBridgeWebSocket(port, clientId, hostProfileId) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(BRIDGE_TOKEN) +
    '&clientId=' + encodeURIComponent(clientId) + '&appNonce=' + encodeURIComponent(nonce);
  const client = new RawWebSocketClient(url, { reconnect: false });
  client.on('error', () => {
    // A close is intentional during cleanup.
  });
  await client.connect();
  await wsRpc(client, 'hello-' + clientId, 'hello', { hostProfileId, appName: 'R28 usage metadata smoke' });
  return client;
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

async function waitForObserved(observed, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (observed.some(predicate)) return;
    await delay(25);
  }
  throw new Error('Timed out waiting for expected usage lifecycle event. Observed: ' + observed.map((event) => event.event).join(','));
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r28-usage-metadata-'));
  const port = 20800 + (process.pid % 600);
  const serverPath = path.resolve(__dirname, '../src/server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: BRIDGE_TOKEN,
      AGENT_BRIDGE_MOCK_METADATA_DELAY_MS: '0',
      AGENT_BRIDGE_MOCK_USAGE_EVENTS: '1'
    }),
    stdio: 'ignore'
  });
  let client = null;
  let isolatedClient = null;
  let reconnectClient = null;
  try {
    await waitForHealth(port);
    const observed = [];
    client = await connectBridgeWebSocket(port, 'r28-primary', 'host-r28');
    client.on('text', (text) => {
      try {
        const message = JSON.parse(text);
        if (message && message.type === 'event') observed.push(message);
      } catch (_error) {
        // Response parsing is handled by wsRpc; malformed unsolicited text is ignored.
      }
    });

    const created = await wsRpc(client, 'session-r28', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R28 usage metadata smoke'
    });
    assert.ok(created.session && created.session.sessionId);
    assert.ok(created.agent && created.agent.id);
    const scope = {
      hostProfileId: 'host-r28',
      sessionId: created.session.sessionId,
      agentId: created.agent.id,
      providerId: 'mock'
    };

    const budget = await wsRpc(client, 'budget-r28', 'usage.budget.set', Object.assign({}, scope, {
      tokenLimit: 10,
      warningThreshold: 0.5,
      window: 'session'
    }));
    assert.strictEqual(budget.ok, true);
    assert.strictEqual(budget.budget.tokenLimit, 10);

    const sent = await wsRpc(client, 'message-r28', 'message.send', Object.assign({}, scope, {
      text: 'exercise usage and compaction lifecycle',
      clientMessageId: 'client-r28-usage'
    }));
    assert.strictEqual(sent.accepted, true);
    await waitForObserved(observed, (event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.estimated === false, 5000);
    await waitForObserved(observed, (event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.estimated === true, 5000);
    await waitForObserved(observed, (event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.kind === 'compaction', 5000);
    await waitForObserved(observed, (event) => event.event === 'usage.budget.warning', 5000);

    const summary = await wsRpc(client, 'summary-r28', 'usage.summary.get', scope);
    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.summary.actual.tokens.inputTokens, 10);
    assert.strictEqual(summary.summary.actual.tokens.outputTokens, 5);
    assert.strictEqual(summary.summary.actual.tokens.totalTokens, 15);
    assert.strictEqual(summary.summary.estimated.tokens.totalTokens, 20);
    assert.strictEqual(summary.summary.actual.costs[0].currency, 'USD');
    assert.strictEqual(summary.summary.actual.costs[0].amount, 0.15);
    assert.strictEqual(summary.summary.quotas[0].remaining, 90);
    assert.strictEqual(summary.summary.quotas[0].limit, 100);
    assert.strictEqual(summary.summary.compactionEvents.length, 1);
    assert.strictEqual(summary.summary.compactionEvents[0].afterTokens, 80);

    for (const usageWindow of ['day', 'month']) {
      const scopedSummary = await wsRpc(client, 'summary-r28-' + usageWindow, 'usage.summary.get', Object.assign({}, scope, { window: usageWindow }));
      assert.strictEqual(scopedSummary.ok, true);
      assert.strictEqual(scopedSummary.summary.window, usageWindow, 'Bridge must preserve usage window ' + usageWindow);
    }

    const events = await wsRpc(client, 'events-r28', 'usage.events.list', Object.assign({}, scope, { limit: 20 }));
    assert.strictEqual(events.totalCount, 3);
    assert.strictEqual(events.events.filter((event) => event.estimated === true).length, 1);

    const metadataKinds = [
      ['sessionTitle', 'R28 session title'],
      ['branchName', 'feature/r28-usage'],
      ['commitMessage', 'Add R28 usage lifecycle'],
      ['pullRequest', 'R28 usage and metadata lifecycle']
    ];
    for (const entry of metadataKinds) {
      const result = await wsRpc(client, 'metadata-r28-' + entry[0], 'metadata.generate', Object.assign({}, scope, {
        kind: entry[0],
        prompt: entry[1],
        timeoutMs: 2000
      }));
      assert.strictEqual(result.ok, true, entry[0] + ' metadata should succeed');
      assert.strictEqual(result.kind, entry[0]);
      assert.strictEqual(result.suggestion, entry[1]);
      assert.strictEqual(result.requestId, 'metadata-r28-' + entry[0]);
    }

    isolatedClient = await connectBridgeWebSocket(port, 'r28-isolated', 'host-r28-other');
    const isolated = await wsRpc(isolatedClient, 'summary-r28-isolated', 'usage.summary.get', scope);
    assert.strictEqual(isolated.ok, true);
    assert.strictEqual(isolated.summary.eventCount, 0, 'usage must remain isolated by hostProfileId');
    isolatedClient.terminate();
    await waitForSocketClose(isolatedClient, 1000);
    isolatedClient = null;

    client.terminate();
    await waitForSocketClose(client, 1000);
    client = null;
    reconnectClient = await connectBridgeWebSocket(port, 'r28-reconnect', 'host-r28');
    const restored = await wsRpc(reconnectClient, 'summary-r28-restored', 'usage.summary.get', scope);
    assert.strictEqual(restored.summary.actual.tokens.totalTokens, 15, 'usage should survive reconnect');
    const restoredBudget = await wsRpc(reconnectClient, 'budget-r28-restored', 'usage.budget.get', scope);
    assert.strictEqual(restoredBudget.budget.tokenLimit, 10, 'budget should survive reconnect');

    console.log('usage metadata live smoke ok');
  } finally {
    if (client) {
      client.terminate();
      await waitForSocketClose(client, 1000);
    }
    if (isolatedClient) {
      isolatedClient.terminate();
      await waitForSocketClose(isolatedClient, 1000);
    }
    if (reconnectClient) {
      reconnectClient.terminate();
      await waitForSocketClose(reconnectClient, 1000);
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
