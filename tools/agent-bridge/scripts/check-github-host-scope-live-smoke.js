'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
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

function startHttpServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      resolve({ server, port, baseUrl: 'http://127.0.0.1:' + String(port) });
    });
  });
}

function jsonResponse(response, statusCode, body, headers) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  for (const key of Object.keys(headers || {})) response.setHeader(key, headers[key]);
  response.end(JSON.stringify(body));
}

function startGitHubApiMock() {
  return startHttpServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (request.headers.authorization !== 'Bearer live-github-token') {
        jsonResponse(response, 401, { message: 'Bad credentials' });
        return;
      }
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = requestUrl.pathname;
      const pullRequest = {
        number: 7,
        html_url: 'https://github.example/octo/alpha/pull/7',
        state: 'open',
        title: 'Live scope PR',
        head: { ref: 'feature/live', sha: 'live-sha-1' },
        base: { ref: 'main' },
        mergeable: true,
        mergeable_state: 'clean',
        draft: false
      };
      if (request.method === 'GET' && pathname === '/repos/octo/alpha/pulls/7') {
        jsonResponse(response, 200, pullRequest, { etag: '"live-pr-1"' });
        return;
      }
      if (request.method === 'GET' && pathname === '/repos/octo/alpha/pulls/7/reviews') {
        jsonResponse(response, 200, []);
        return;
      }
      if (request.method === 'GET' && pathname === '/repos/octo/alpha/commits/live-sha-1/check-runs') {
        jsonResponse(response, 200, { check_runs: [{ name: 'build', status: 'completed', conclusion: 'success' }] });
        return;
      }
      if (request.method === 'GET' && pathname === '/repos/octo/alpha/commits/live-sha-1/status') {
        jsonResponse(response, 200, { statuses: [] });
        return;
      }
      if (request.method === 'PATCH' && pathname === '/repos/octo/alpha/pulls/7') {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        jsonResponse(response, 200, Object.assign({}, pullRequest, { title: body.title || pullRequest.title }));
        return;
      }
      jsonResponse(response, 404, { message: 'Not Found' });
    });
  });
}

function startOAuthMock() {
  return startHttpServer((request, response) => {
    if (request.method === 'POST' && request.url === '/login/device/code') {
      jsonResponse(response, 200, {
        device_code: 'live-device-code',
        user_code: 'LIVE-CODE',
        verification_uri: 'https://github.example/login/device',
        interval: 5,
        expires_in: 600
      });
      return;
    }
    jsonResponse(response, 400, { error: 'invalid_request' });
  });
}

function waitForBridgeHealth(port, child, output) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
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
    const retry = () => {
      attempts += 1;
      if (attempts >= 80) {
        reject(new Error('Bridge health check timed out: ' + output.join('')));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function openBridgeConnection(port, token, hostProfileId, suffix) {
  const clientId = 'github-live-' + hostProfileId + '-' + suffix;
  const appNonce = 'nonce-' + hostProfileId + '-' + suffix;
  const url = 'ws://127.0.0.1:' + String(port) + '/ws?token=' + encodeURIComponent(token) +
    '&clientId=' + encodeURIComponent(clientId) + '&appNonce=' + encodeURIComponent(appNonce);
  const pending = new Map();
  const events = [];
  const client = createWebSocketClient(url, {
    onMessage(rawText) {
      let message;
      try {
        message = JSON.parse(rawText);
      } catch (_error) {
        return;
      }
      if (message && message.type === 'response' && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timer);
        entry.resolve(message);
        return;
      }
      events.push(message);
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
    const id = 'github-live-rpc-' + String(Date.now()) + '-' + Math.random().toString(16).slice(2);
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
  }).then((envelope) => {
    assert.strictEqual(envelope.type, 'response');
    return envelope.payload || {};
  });

  const hello = await rpc(RequestType.HELLO, {
    hostProfileId,
    clientId,
    appNonce,
    endpoint: url,
    appName: 'GitHub host scope live smoke'
  });
  assert.strictEqual(hello.accepted, true);
  return {
    client,
    events,
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
  const bridgePort = await reservePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-github-host-live-'));
  const apiMock = await startGitHubApiMock();
  const oauthMock = await startOAuthMock();
  const token = 'github-host-live-bridge-token-' + String(Date.now());
  const bridgeRoot = path.resolve(__dirname, '..');
  const bridgeOutput = [];
  const bridge = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: bridgeRoot,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(bridgePort),
      AGENT_BRIDGE_TOKEN: token,
      GITHUB_TOKEN: 'live-github-token',
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  bridge.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
  bridge.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
  let connectionA = null;
  let connectionB = null;
  let connectionA2 = null;
  try {
    await waitForBridgeHealth(bridgePort, bridge, bridgeOutput);
    connectionA = await openBridgeConnection(bridgePort, token, 'host-a', 'a1');
    connectionB = await openBridgeConnection(bridgePort, token, 'host-b', 'b1');

    const bindingA = await connectionA.rpc(RequestType.GITHUB_BINDING_SET, {
      hostProfileId: 'host-b',
      workspaceId: 'workspace-1',
      accountId: 'account-a',
      owner: 'octo',
      repo: 'alpha',
      confirm: true
    });
    assert.strictEqual(bindingA.ok, true);
    assert.strictEqual(bindingA.binding.hostProfileId, 'host-a');
    const bindingB = await connectionB.rpc(RequestType.GITHUB_BINDING_SET, {
      hostProfileId: 'host-a',
      workspaceId: 'workspace-1',
      accountId: 'account-b',
      owner: 'octo',
      repo: 'beta',
      confirm: true
    });
    assert.strictEqual(bindingB.ok, true);
    assert.strictEqual(bindingB.binding.hostProfileId, 'host-b');

    const readA = await connectionA.rpc(RequestType.GITHUB_BINDING_GET, { hostProfileId: 'host-b', workspaceId: 'workspace-1' });
    const readB = await connectionB.rpc(RequestType.GITHUB_BINDING_GET, { hostProfileId: 'host-a', workspaceId: 'workspace-1' });
    assert.strictEqual(readA.binding.repo, 'alpha');
    assert.strictEqual(readB.binding.repo, 'beta');

    const authStart = await connectionA.rpc(RequestType.GITHUB_AUTH_DEVICE_START, {
      clientId: 'live-oauth-client',
      oauthBaseUrl: oauthMock.baseUrl,
      apiBaseUrl: apiMock.baseUrl
    });
    assert.strictEqual(authStart.ok, true);
    const mismatchedPoll = await connectionB.rpc(RequestType.GITHUB_AUTH_DEVICE_POLL, {
      sessionId: authStart.sessionId,
      hostProfileId: 'host-a'
    });
    assert.strictEqual(mismatchedPoll.failureCategory, 'host_scope_mismatch');

    const preview = await connectionA.rpc(RequestType.GITHUB_PR_UPDATE, {
      hostProfileId: 'host-b',
      owner: 'octo',
      repo: 'alpha',
      number: 7,
      title: 'Updated from host A',
      apiBaseUrl: apiMock.baseUrl,
      tokenEnv: 'GITHUB_TOKEN'
    });
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.preview, true);
    const crossHostConfirm = await connectionB.rpc(RequestType.GITHUB_PR_UPDATE, {
      hostProfileId: 'host-a',
      owner: 'octo',
      repo: 'alpha',
      number: 7,
      title: 'Must be blocked',
      apiBaseUrl: apiMock.baseUrl,
      tokenEnv: 'GITHUB_TOKEN',
      planId: preview.planId,
      confirm: true
    });
    assert.strictEqual(crossHostConfirm.failureCategory, 'plan_expired', JSON.stringify(crossHostConfirm));
    const confirmed = await connectionA.rpc(RequestType.GITHUB_PR_UPDATE, {
      owner: 'octo',
      repo: 'alpha',
      number: 7,
      apiBaseUrl: apiMock.baseUrl,
      tokenEnv: 'GITHUB_TOKEN',
      planId: preview.planId,
      confirm: true
    });
    assert.strictEqual(confirmed.ok, true);
    assert.strictEqual(confirmed.confirmed, true);

    const watch = await connectionA.rpc(RequestType.GITHUB_WATCH_START, {
      hostProfileId: 'host-b',
      workspaceId: 'workspace-1',
      subscriberId: 'watch-a',
      number: 7,
      owner: 'octo',
      repo: 'alpha',
      apiBaseUrl: apiMock.baseUrl,
      tokenEnv: 'GITHUB_TOKEN',
      intervalMs: 15000
    });
    assert.strictEqual(watch.ok, true);
    assert.strictEqual(watch.subscriberCount, 1);
    const crossHostStop = await connectionB.rpc(RequestType.GITHUB_WATCH_STOP, {
      hostProfileId: 'host-a',
      watchId: watch.watchId,
      subscriberId: 'watch-a'
    });
    assert.strictEqual(crossHostStop.failureCategory, 'host_scope_mismatch');

    connectionA.close();
    connectionA = null;
    await new Promise((resolve) => setTimeout(resolve, 250));
    connectionA2 = await openBridgeConnection(bridgePort, token, 'host-a', 'a2');
    const restartedWatch = await connectionA2.rpc(RequestType.GITHUB_WATCH_START, {
      workspaceId: 'workspace-1',
      subscriberId: 'watch-a2',
      number: 7,
      owner: 'octo',
      repo: 'alpha',
      apiBaseUrl: apiMock.baseUrl,
      tokenEnv: 'GITHUB_TOKEN',
      intervalMs: 15000
    });
    assert.strictEqual(restartedWatch.ok, true);
    assert.strictEqual(restartedWatch.subscriberCount, 1, 'disconnect must remove the previous host watch subscriber');

    console.log('github host scope live smoke ok');
  } finally {
    if (connectionA) connectionA.close();
    if (connectionA2) connectionA2.close();
    if (connectionB) connectionB.close();
    if (bridge.exitCode === null) bridge.kill('SIGTERM');
    await waitForExit(bridge, 5000);
    if (bridge.exitCode === null) bridge.kill();
    await new Promise((resolve) => apiMock.server.close(resolve));
    await new Promise((resolve) => oauthMock.server.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
