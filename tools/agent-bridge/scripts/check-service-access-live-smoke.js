'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { RequestType } = require('../src/protocol');
const { WorkspaceRegistry } = require('../src/workspace-registry');

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

function request(port, method, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: Object.assign({ Host: '127.0.0.1:' + String(port) }, headers || {})
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function rpc(port, token, type, payload) {
  const body = JSON.stringify({ id: 'live_' + String(Date.now()) + '_' + Math.random().toString(16).slice(2), type, payload });
  const response = await request(port, 'POST', '/rpc', {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }, body);
  assert.strictEqual(response.status, 200, response.body);
  const envelope = JSON.parse(response.body);
  assert(envelope.response && envelope.response.ok === true, response.body);
  return envelope.response.payload;
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const bridgePort = await reservePort();
  const servicePort = await reservePort();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-service-access-live-'));
  const home = path.join(root, 'home');
  const workspacePath = path.join(root, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const store = createDaemonStore(home);
  const workspaceRegistry = new WorkspaceRegistry(store);
  const workspace = workspaceRegistry.upsertWorkspaceForPath(workspacePath, 'Service access live');
  const agentManager = new AgentManager({ store, workspaceRegistry });
  const agent = agentManager.createPlaceholder({ providerId: 'mock', workspacePath, cwd: workspacePath, workspaceId: workspace.workspaceId, title: 'Service owner' });
  const bridgeRoot = path.resolve(__dirname, '..');
  const token = 'service-access-live-' + String(Date.now());
  const bridge = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: bridgeRoot,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(bridgePort),
      AGENT_BRIDGE_TOKEN: token,
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const output = [];
  bridge.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  bridge.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (bridge.exitCode !== null) throw new Error('Bridge exited before health check: ' + output.join(''));
      try {
        const health = await request(bridgePort, 'GET', '/health');
        if (health.status === 200) { healthy = true; break; }
      } catch (_error) {
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.strictEqual(healthy, true, output.join(''));

    const serviceDefinition = {
      serviceId: 'svc-owner-live',
      name: 'Owner live service',
      workspaceId: workspace.workspaceId,
      ownerAgentId: agent.id,
      command: process.execPath,
      args: ['-e', "const http=require('http');http.createServer((q,s)=>{if(q.url==='/health'){s.end('ok');return;}s.setHeader('content-type','application/json');s.end(JSON.stringify({host:q.headers.host||'',authorization:q.headers.authorization||'',cookie:q.headers.cookie||'',url:q.url}));}).listen(Number(process.env.PORT),'127.0.0.1');"],
      cwd: workspacePath,
      port: servicePort,
      protocol: 'http',
      health: { kind: 'http', path: '/health', timeoutMs: 1000 },
      visibility: 'owner',
      lifecycle: 'owner'
    };
    const upsertPreview = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_UPSERT, serviceDefinition);
    const upserted = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_UPSERT, Object.assign({}, serviceDefinition, { confirm: true, planId: upsertPreview.planId }));
    assert.strictEqual(upserted.ok, true);
    const startPreview = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_START, { serviceId: serviceDefinition.serviceId });
    const started = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_START, { serviceId: serviceDefinition.serviceId, confirm: true, planId: startPreview.planId });
    assert.strictEqual(started.ok, true, JSON.stringify(started));

    const unauthenticated = await request(bridgePort, 'GET', '/service/svc-owner-live/inspect');
    assert.strictEqual(unauthenticated.status, 401);
    const bearerOnly = await request(bridgePort, 'GET', '/service/svc-owner-live/inspect', { Authorization: 'Bearer ' + token });
    assert.strictEqual(bearerOnly.status, 403, 'long-lived bearer must not bypass owner scope');

    const openPreview = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_OPEN, { serviceId: serviceDefinition.serviceId, ownerAgentId: agent.id });
    assert.strictEqual(openPreview.preview, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(openPreview, 'accessUrl'), false);
    const opened = await rpc(bridgePort, token, RequestType.WORKSPACE_SERVICE_OPEN, { serviceId: serviceDefinition.serviceId, ownerAgentId: agent.id, confirm: true, planId: openPreview.planId });
    assert.strictEqual(opened.confirmed, true);
    assert.strictEqual(opened.accessUrl.includes(token), false);
    const accessUrl = new URL(opened.accessUrl);
    const exchange = await request(bridgePort, 'GET', accessUrl.pathname + accessUrl.search);
    assert.strictEqual(exchange.status, 303, exchange.body);
    assert.strictEqual(String(exchange.headers.location).includes('accessTicket'), false);
    assert.strictEqual(String(exchange.headers['set-cookie']).includes('HttpOnly'), true);
    assert.strictEqual(String(exchange.headers['set-cookie']).includes('SameSite=Strict'), true);
    const cookie = Array.isArray(exchange.headers['set-cookie']) ? exchange.headers['set-cookie'][0].split(';')[0] : String(exchange.headers['set-cookie']).split(';')[0];

    const replay = await request(bridgePort, 'GET', accessUrl.pathname + accessUrl.search);
    assert.strictEqual(replay.status, 401, 'one-time ticket must not be replayable');
    const crossPortOrigin = await request(bridgePort, 'GET', '/service/svc-owner-live/inspect', {
      Cookie: cookie,
      Origin: 'http://127.0.0.1:' + String(servicePort)
    });
    assert.strictEqual(crossPortOrigin.status, 403, 'service session must reject a same-host origin on another port');
    const proxied = await request(bridgePort, 'GET', '/service/svc-owner-live/inspect', { Cookie: cookie });
    assert.strictEqual(proxied.status, 200, proxied.body);
    const upstream = JSON.parse(proxied.body);
    assert.strictEqual(upstream.host, '127.0.0.1:' + String(servicePort));
    assert.strictEqual(upstream.authorization, '');
    assert.strictEqual(upstream.cookie, '');
    assert.strictEqual(upstream.url, '/inspect');
    const wrongHost = await request(bridgePort, 'GET', '/service/svc-owner-live/inspect', { Host: 'localhost:' + String(bridgePort), Cookie: cookie });
    assert.strictEqual(wrongHost.status, 401, 'service session must remain bound to its issuing Host');

    console.log('Service access live smoke passed.');
  } finally {
    if (bridge.exitCode === null) bridge.kill('SIGTERM');
    await waitForExit(bridge, 5000);
    if (bridge.exitCode === null) bridge.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
