'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BRIDGE_TOKEN = 'r26-metadata-smoke-token';

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
  throw new Error('Bridge did not become healthy for metadata request smoke.');
}

async function rpc(port, id, type, payload) {
  const response = await httpRequest(port, 'POST', '/rpc', { id, type, payload });
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.body));
  assert.ok(response.body.response, 'RPC response envelope should be present.');
  return response.body.response.payload || {};
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-r26-metadata-'));
  const port = 18900 + (process.pid % 900);
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

  try {
    await waitForHealth(port);
    const created = await rpc(port, 'session-r26', 'session.create', {
      providerId: 'mock',
      workspacePath: process.cwd(),
      workspaceTitle: 'R26 metadata smoke'
    });
    assert.ok(created.session && created.session.sessionId);
    assert.ok(created.agent && created.agent.id);
    const scope = {
      sessionId: created.session.sessionId,
      agentId: created.agent.id,
      hostProfileId: 'host-r26'
    };

    const timeoutResult = await rpc(port, 'metadata-timeout-r26', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'timeout',
      timeoutMs: 1000
    }));
    assert.strictEqual(timeoutResult.ok, false);
    assert.strictEqual(timeoutResult.failureCategory, 'metadata_timeout');

    const cancelRequest = rpc(port, 'metadata-cancel-r26', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'cancel',
      timeoutMs: 5000
    }));
    await delay(100);
    const cancelResult = await rpc(port, 'metadata-cancel-control-r26', 'metadata.generate.cancel', Object.assign({}, scope, {
      requestId: 'metadata-cancel-r26'
    }));
    assert.strictEqual(cancelResult.ok, true);
    assert.strictEqual(cancelResult.cancelled, true);
    const cancelledResponse = await cancelRequest;
    assert.strictEqual(cancelledResponse.ok, false);
    assert.strictEqual(cancelledResponse.failureCategory, 'metadata_cancelled');

    const duplicateRequest = rpc(port, 'metadata-duplicate-r26', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'duplicate',
      timeoutMs: 1000
    }));
    await delay(100);
    const duplicateResult = await rpc(port, 'metadata-duplicate-r26', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'duplicate-again',
      timeoutMs: 1000
    }));
    assert.strictEqual(duplicateResult.ok, false);
    assert.strictEqual(duplicateResult.failureCategory, 'metadata_request_in_flight');
    const duplicateTimeout = await duplicateRequest;
    assert.strictEqual(duplicateTimeout.failureCategory, 'metadata_timeout');

    const scopeRequest = rpc(port, 'metadata-scope-r26', 'metadata.generate', Object.assign({}, scope, {
      kind: 'sessionTitle',
      prompt: 'scope',
      timeoutMs: 1000
    }));
    await delay(100);
    const scopeCancel = await rpc(port, 'metadata-scope-control-r26', 'metadata.generate.cancel', {
      requestId: 'metadata-scope-r26',
      sessionId: 'different-session',
      hostProfileId: scope.hostProfileId
    });
    assert.strictEqual(scopeCancel.ok, false);
    assert.strictEqual(scopeCancel.failureCategory, 'metadata_scope_mismatch');
    const scopeTimeout = await scopeRequest;
    assert.strictEqual(scopeTimeout.failureCategory, 'metadata_timeout');

    console.log('metadata request smoke ok (timeout/cancel/duplicate/scope)');
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
