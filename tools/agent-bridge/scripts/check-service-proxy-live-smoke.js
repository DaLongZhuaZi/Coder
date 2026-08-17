'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
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
    const requestHeaders = Object.assign({ Host: '127.0.0.1:' + String(port), Connection: 'close' }, headers || {});
    const outgoing = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers: requestHeaders }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    outgoing.once('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

async function rpc(port, token, type, payload) {
  const id = 'live-' + String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  const body = JSON.stringify({ id, type, payload: payload || {} });
  const response = await request(port, 'POST', '/rpc', {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body))
  }, body);
  assert.strictEqual(response.status, 200, response.body);
  const parsed = JSON.parse(response.body);
  assert(parsed.response, response.body);
  assert.strictEqual(parsed.response.id, id);
  return parsed.response.payload || {};
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBridge(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await request(port, 'GET', '/health');
      if (response.status === 200) return;
    } catch (_error) {
      // The child may still be starting.
    }
    await wait(100);
  }
  throw new Error('Bridge did not become healthy.');
}

async function waitForService(port, token, serviceId, expectedStatus) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await rpc(port, token, 'workspace.service.status', { serviceId });
    if (result.service && result.service.status === expectedStatus) return result.service;
    await wait(100);
  }
  throw new Error('Service did not reach ' + expectedStatus + '.');
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_error) {}
    }, 8000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function startBridge(root, home, port, token) {
  return childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: token,
      AGENT_BRIDGE_SERVICE_PROXY_TIMEOUT_MS: '200',
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
}

function websocketProbe(port, token) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let received = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('WebSocket proxy probe timed out.')), 4000);
    const finish = (error) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(received.toString('utf8'));
    };
    socket.once('error', finish);
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      const text = received.toString('utf8');
      if (text.includes('101 Switching Protocols') && !text.includes('live-ws-probe')) {
        socket.write('live-ws-probe');
      } else if (text.includes('live-ws-probe')) {
        finish(null);
      }
    });
    socket.once('connect', () => {
      socket.write(
        'GET /service/svc-live/socket?token=query-secret HTTP/1.1\r\n' +
        'Host: 127.0.0.1:' + String(port) + '\r\n' +
        'Origin: http://127.0.0.1:' + String(port) + '\r\n' +
        'Authorization: Bearer ' + token + '\r\n' +
        'Cookie: bridge-cookie=must-not-forward\r\n' +
        'Proxy-Authorization: Basic must-not-forward\r\n' +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
  });
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-service-live-'));
  const home = path.join(tempRoot, 'bridge-home');
  const workspacePath = path.join(tempRoot, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const bridgePort = await reservePort();
  const servicePort = await reservePort();
  const ownerPort = await reservePort();
  const token = 'service-live-token-' + String(Date.now());
  const serviceScript = [
    "const http=require('http');",
    "const server=http.createServer((req,res)=>{",
    "if(req.url.startsWith('/health')){res.writeHead(200);res.end('ok');return;}",
    "if(req.url.startsWith('/slow')){setTimeout(()=>{res.writeHead(200);res.end('late');},1500);return;}",
    "if(req.url.startsWith('/exit')){res.writeHead(200);res.end('bye');setTimeout(()=>process.exit(0),25);return;}",
    "const body=JSON.stringify({host:req.headers.host||'',authorization:req.headers.authorization||'',cookie:req.headers.cookie||'',proxyAuthorization:req.headers['proxy-authorization']||'',url:req.url});",
    "res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(body)});res.end(body);",
    "});",
    "server.on('upgrade',(req,socket,head)=>{socket.write('HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\n\\r\\n');if(head.length>0)socket.write(head);socket.on('data',(chunk)=>socket.write(chunk));});",
    "server.listen(Number(process.env.PORT),'127.0.0.1');"
  ].join('');
  const now = new Date().toISOString();
  const store = createDaemonStore(home);
  store.writeWorkspaceRegistry([{
    workspaceId: 'wks-live',
    projectId: 'project-live',
    cwd: workspacePath,
    workspacePath,
    kind: 'directory',
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  }]);
  function service(serviceId, port, visibility, ownerAgentId, domain) {
    return {
      serviceId,
      name: serviceId,
      workspaceId: 'wks-live',
      ownerAgentId,
      command: process.execPath,
      args: ['-e', serviceScript],
      cwd: workspacePath,
      port,
      protocol: 'http',
      domain,
      health: { kind: 'http', path: '/health', timeoutMs: 500 },
      visibility,
      auth: { mode: 'bridge', environmentVariable: '' },
      lifecycle: ownerAgentId ? 'owner' : 'workspace',
      environmentNames: [],
      desiredState: 'running',
      status: 'stopped',
      pid: 0,
      ledgerId: '',
      recovered: false,
      createdAt: now,
      updatedAt: now,
      startedAt: '',
      stoppedAt: now
    };
  }
  store.writeWorkspaceServiceState({
    version: 1,
    services: [
      service('svc-live', servicePort, 'workspace', '', 'app.workspace.localhost'),
      service('svc-owner', ownerPort, 'owner', 'agent-live', '')
    ]
  });

  let bridge = startBridge(root, home, bridgePort, token);
  try {
    await waitForBridge(bridgePort);
    const first = await waitForService(bridgePort, token, 'svc-live', 'running');
    await waitForService(bridgePort, token, 'svc-owner', 'running');
    const firstPid = first.pid;
    assert(firstPid > 0);

    const missing = await request(bridgePort, 'GET', '/service/svc-live/inspect');
    assert.strictEqual(missing.status, 401);
    const wrong = await request(bridgePort, 'GET', '/service/svc-live/inspect', { Authorization: 'Bearer wrong' });
    assert.strictEqual(wrong.status, 401);
    const evilHost = await request(bridgePort, 'GET', '/service/svc-live/inspect', { Host: 'evil.example', Authorization: 'Bearer ' + token });
    assert.strictEqual(evilHost.status, 403);

    const proxied = await request(bridgePort, 'GET', '/service/svc-live/inspect?token=query-secret&keep=1', {
      Authorization: 'Bearer ' + token,
      Cookie: 'bridge-cookie=must-not-forward',
      'Proxy-Authorization': 'Basic must-not-forward'
    });
    assert.strictEqual(proxied.status, 200, proxied.body);
    const observed = JSON.parse(proxied.body);
    assert.strictEqual(observed.host, '127.0.0.1:' + String(servicePort));
    assert.strictEqual(observed.authorization, '');
    assert.strictEqual(observed.cookie, '');
    assert.strictEqual(observed.proxyAuthorization, '');
    assert.strictEqual(observed.url, '/inspect?keep=1');

    const ownerBypass = await request(bridgePort, 'GET', '/service/svc-owner/?ownerAgentId=agent-live', { Authorization: 'Bearer ' + token });
    assert.strictEqual(ownerBypass.status, 403);

    const preview = await rpc(bridgePort, token, 'workspace.service.open', { serviceId: 'svc-live' });
    assert.strictEqual(preview.preview, true);
    const opened = await rpc(bridgePort, token, 'workspace.service.open', { serviceId: 'svc-live', planId: preview.planId, confirm: true });
    assert.strictEqual(opened.confirmed, true);
    const accessUrl = new URL(opened.accessUrl);
    const exchanged = await request(bridgePort, 'GET', accessUrl.pathname + accessUrl.search);
    assert.strictEqual(exchanged.status, 303, exchanged.body);
    assert(!String(exchanged.headers.location).includes('accessTicket'));
    const cookieHeader = Array.isArray(exchanged.headers['set-cookie']) ? exchanged.headers['set-cookie'][0] : String(exchanged.headers['set-cookie'] || '');
    assert(cookieHeader.includes('HttpOnly'));
    assert(cookieHeader.includes('SameSite=Strict'));
    assert(!cookieHeader.includes(token));
    const cookie = cookieHeader.split(';')[0];
    const sessionRequest = await request(bridgePort, 'GET', exchanged.headers.location, { Cookie: cookie });
    assert.strictEqual(sessionRequest.status, 200, sessionRequest.body);
    const replay = await request(bridgePort, 'GET', accessUrl.pathname + accessUrl.search);
    assert.strictEqual(replay.status, 401);

    const domainProxy = await request(bridgePort, 'GET', '/domain-check', { Host: 'app.workspace.localhost', Authorization: 'Bearer ' + token });
    assert.strictEqual(domainProxy.status, 200, domainProxy.body);
    const unknownDomain = await request(bridgePort, 'GET', '/health', { Host: 'unknown.workspace.localhost', Authorization: 'Bearer ' + token });
    assert.strictEqual(unknownDomain.status, 404);

    const timeout = await request(bridgePort, 'GET', '/service/svc-live/slow', { Authorization: 'Bearer ' + token });
    assert.strictEqual(timeout.status, 504, timeout.body);
    assert.strictEqual(JSON.parse(timeout.body).error.code, 'service_proxy_timeout');

    const wsResult = await websocketProbe(bridgePort, token);
    assert(wsResult.includes('101 Switching Protocols'));
    assert(wsResult.includes('live-ws-probe'));

    await stopChild(bridge);
    bridge = startBridge(root, home, bridgePort, token);
    await waitForBridge(bridgePort);
    const restarted = await waitForService(bridgePort, token, 'svc-live', 'running');
    assert(restarted.pid > 0);
    assert.notStrictEqual(restarted.pid, firstPid);

    const exit = await request(bridgePort, 'GET', '/service/svc-live/exit', { Authorization: 'Bearer ' + token });
    assert.strictEqual(exit.status, 200);
    await waitForService(bridgePort, token, 'svc-live', 'failed');
    const afterExit = await request(bridgePort, 'GET', '/service/svc-live/', { Authorization: 'Bearer ' + token });
    assert.strictEqual(afterExit.status, 409);

    console.log('Service proxy live smoke passed.');
  } finally {
    await stopChild(bridge);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
