'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function request(port, token, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/rpc',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Host: '127.0.0.1:' + String(port) }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject);
    request.end(JSON.stringify(body));
  });
}

async function rpc(port, token, type, payload) {
  const response = await request(port, token, { id: 'web-experience-' + type.replace(/[^a-z0-9]/gi, '_'), type, payload: payload || {} });
  assert.strictEqual(response.status, 200, type + ' RPC should return HTTP 200');
  const body = JSON.parse(response.body);
  assert.ok(body.response && body.response.type === 'response', type + ' RPC should include a response');
  return body.response.payload || body.response;
}

async function main() {
  const port = await reservePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-web-experience-'));
  const root = path.resolve(__dirname, '..');
  const token = 'web-experience-token-' + String(Date.now());
  const child = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: token,
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await new Promise((resolve, reject) => {
          const req = http.request({ hostname: '127.0.0.1', port, method: 'GET', path: '/health', headers: { Host: '127.0.0.1:' + String(port) } }, (res) => {
            res.resume();
            res.once('end', () => resolve(res.statusCode || 0));
          });
          req.once('error', reject);
          req.end();
        });
        if (response === 200) { healthy = true; break; }
      } catch (_error) { /* wait for Bridge startup */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(healthy, 'Bridge should become healthy');
    const scope = { hostProfileId: 'web-experience-host', workspaceId: 'workspace-1', agentId: 'agent-1', sessionId: 'session-1', window: 'session' };
    const queue = await rpc(port, token, 'message.queue.list', scope);
    assert.strictEqual(queue.ok, true, 'queue list should be a read-only success for an empty scope');
    assert.deepStrictEqual(queue.items, [], 'empty queue should be explicit');
    const summary = await rpc(port, token, 'usage.summary.get', scope);
    assert.strictEqual(summary.ok, true, 'usage summary should be available for an empty scope');
    assert.strictEqual(summary.summary.actual.tokens.totalTokens, undefined, 'empty usage must not invent total tokens');
    const events = await rpc(port, token, 'usage.events.list', Object.assign({}, scope, { limit: 10 }));
    assert.strictEqual(events.ok, true, 'usage events should be queryable');
    assert.deepStrictEqual(events.events, [], 'empty usage events should be explicit');
    const budget = await rpc(port, token, 'usage.budget.get', scope);
    assert.strictEqual(budget.ok, true, 'budget status should be queryable');
    assert.strictEqual(budget.budget, null, 'unset budget should remain null');
    const metadata = await rpc(port, token, 'metadata.generate', { hostProfileId: scope.hostProfileId, workspaceId: scope.workspaceId, agentId: scope.agentId, sessionId: 'missing-session', kind: 'sessionTitle' });
    assert.strictEqual(metadata.ok, false, 'metadata without an active session must fail safely');
    assert.strictEqual(metadata.failureCategory, 'session_not_found', 'metadata failure must be structured');
    console.log('web session experience live smoke ok');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
