'use strict';

const assert = require('assert');
const net = require('net');
const { ServiceProxyManager } = require('../src/service-manager');
const {
  normalizeServiceDomain,
  resolveServiceProxyRoute,
  serviceProxyOriginAllowed,
  websocketUpstreamHeaders
} = require('../src/service-proxy-router');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForSocketData(socket, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let value = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('Timed out waiting for socket data.')), timeoutMs);
    const finish = (error) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      value = Buffer.concat([value, chunk]);
      if (predicate(value)) finish(null);
    };
    const onError = (error) => finish(error);
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

function requestFromHeaderBlock(headerBlock) {
  const lines = headerBlock.split('\r\n');
  const requestLine = lines.shift().split(' ');
  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    headers[line.substring(0, separator).trim().toLowerCase()] = line.substring(separator + 1).trim();
  }
  return { method: requestLine[0], url: requestLine[1], headers };
}

async function main() {
  assert.strictEqual(normalizeServiceDomain('App.Workspace.Localhost'), 'app.workspace.localhost');
  assert.strictEqual(normalizeServiceDomain('localhost'), '');
  assert.strictEqual(normalizeServiceDomain('127.0.0.1'), '');
  assert.strictEqual(normalizeServiceDomain('bad_domain.localhost'), '');

  let persisted = {
    version: 1,
    services: []
  };
  const store = {
    readWorkspaceServiceState: () => persisted,
    writeWorkspaceServiceState: (value) => { persisted = value; },
    workspaceServiceLogFilePath: () => ''
  };
  const workspaceRegistry = {
    findWorkspaceById: (workspaceId) => workspaceId === 'workspace-routing' ? { workspaceId, cwd: process.cwd(), archivedAt: '' } : null
  };
  const managedProcessLedger = {
    list: () => [],
    remove: () => {},
    record: () => ({ id: 'unused-ledger' })
  };

  const upstreamState = { headerBlock: '', tunnelData: '' };
  const upstreamServer = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    let upgraded = false;
    socket.on('data', (chunk) => {
      if (upgraded) {
        upstreamState.tunnelData += chunk.toString('utf8');
        socket.write(chunk);
        return;
      }
      pending = Buffer.concat([pending, chunk]);
      const boundary = pending.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      upstreamState.headerBlock = pending.subarray(0, boundary).toString('utf8');
      const remainder = pending.subarray(boundary + 4);
      upgraded = true;
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      if (remainder.length > 0) {
        upstreamState.tunnelData += remainder.toString('utf8');
        socket.write(remainder);
      }
    });
  });
  const upstreamPort = await listen(upstreamServer);
  persisted.services.push({
    serviceId: 'svc-routing',
    name: 'Routing smoke',
    workspaceId: 'workspace-routing',
    ownerAgentId: '',
    command: process.execPath,
    args: [],
    cwd: process.cwd(),
    port: upstreamPort,
    protocol: 'http',
    domain: 'app.workspace.localhost',
    health: { kind: 'tcp', path: '', timeoutMs: 500 },
    visibility: 'workspace',
    auth: { mode: 'bridge', environmentVariable: '' },
    lifecycle: 'workspace',
    environmentNames: [],
    desiredState: 'running',
    status: 'running',
    pid: process.pid,
    ledgerId: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const manager = new ServiceProxyManager({ store, workspaceRegistry, managedProcessLedger });
  assert.strictEqual(manager.resolveProxyDomain('APP.WORKSPACE.LOCALHOST:9910').serviceId, 'svc-routing');
  assert.strictEqual(manager.isServiceDomainCandidate('unknown.workspace.localhost'), true);
  assert.strictEqual(manager.isServiceDomainCandidate('bridge.other.localhost'), false);

  const domainUrl = new URL('/socket?token=bridge-secret&accessTicket=single-use&keep=1', 'http://bridge.invalid');
  const domainRoute = resolveServiceProxyRoute(domainUrl, 'app.workspace.localhost', manager);
  assert.strictEqual(domainRoute.domainRoute, true);
  assert.strictEqual(domainRoute.upstreamPath, '/socket?keep=1');
  const pathUrl = new URL('/service/svc-routing/socket?token=bridge-secret&ownerAgentId=fake&keep=1', 'http://bridge.invalid');
  const pathRoute = resolveServiceProxyRoute(pathUrl, 'bridge.localhost', manager);
  assert.strictEqual(pathRoute.domainRoute, false);
  assert.strictEqual(pathRoute.upstreamPath, '/socket?keep=1');

  const safeRequest = {
    headers: {
      host: 'bridge.localhost:9910',
      origin: 'http://bridge.localhost:9910',
      authorization: 'Bearer bridge-secret',
      cookie: 'ngf_service_session=session-secret',
      'proxy-authorization': 'Basic proxy-secret',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13'
    }
  };
  assert.strictEqual(serviceProxyOriginAllowed(safeRequest), true);
  assert.strictEqual(serviceProxyOriginAllowed({ headers: { host: 'bridge.localhost', origin: 'https://evil.example' } }), false);
  assert.strictEqual(serviceProxyOriginAllowed({ headers: { host: 'bridge.localhost:9910', origin: 'http://bridge.localhost:9911' } }), false);
  assert.strictEqual(serviceProxyOriginAllowed({ socket: { encrypted: true }, headers: { host: 'bridge.localhost:443', origin: 'http://bridge.localhost' } }), false);
  assert.strictEqual(serviceProxyOriginAllowed({ socket: { encrypted: true }, headers: { host: 'bridge.localhost:443', origin: 'https://bridge.localhost' } }), true);
  const resolved = manager.resolveProxyTarget('svc-routing', pathRoute.upstreamPath, '', false);
  const upstreamHeaders = websocketUpstreamHeaders(safeRequest, resolved);
  assert.strictEqual(upstreamHeaders.Host, '127.0.0.1:' + String(upstreamPort));
  assert.strictEqual(upstreamHeaders.Origin, 'http://127.0.0.1:' + String(upstreamPort));
  assert.strictEqual(upstreamHeaders.Authorization, undefined);
  assert.strictEqual(upstreamHeaders.Cookie, undefined);
  assert.strictEqual(upstreamHeaders['Proxy-Authorization'], undefined);

  const bridgeServer = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    const onData = (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const boundary = pending.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      socket.off('data', onData);
      const headerBlock = pending.subarray(0, boundary).toString('utf8');
      const head = pending.subarray(boundary + 4);
      const req = requestFromHeaderBlock(headerBlock);
      const reqUrl = new URL(req.url, 'http://bridge.invalid');
      const route = resolveServiceProxyRoute(reqUrl, req.headers.host, manager);
      const result = manager.proxyWebSocket(req, socket, head, route.serviceId, route.upstreamPath, '', false);
      assert.strictEqual(result.ok, true, JSON.stringify(result));
    };
    socket.on('data', onData);
  });
  const bridgePort = await listen(bridgeServer);
  const client = net.createConnection({ host: '127.0.0.1', port: bridgePort });
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  client.write(
    'GET /service/svc-routing/socket?token=bridge-secret&keep=1 HTTP/1.1\r\n' +
    'Host: bridge.localhost:' + String(bridgePort) + '\r\n' +
    'Origin: http://bridge.localhost:' + String(bridgePort) + '\r\n' +
    'Authorization: Bearer bridge-secret\r\n' +
    'Cookie: ngf_service_session=session-secret\r\n' +
    'Proxy-Authorization: Basic proxy-secret\r\n' +
    'Connection: Upgrade\r\n' +
    'Upgrade: websocket\r\n' +
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
    'Sec-WebSocket-Version: 13\r\n\r\n'
  );
  await waitForSocketData(client, (value) => value.includes(Buffer.from('\r\n\r\n')), 3000);
  assert(upstreamState.headerBlock.startsWith('GET /socket?keep=1 HTTP/1.1'));
  assert(upstreamState.headerBlock.includes('Host: 127.0.0.1:' + String(upstreamPort)));
  assert(!upstreamState.headerBlock.toLowerCase().includes('bridge-secret'));
  assert(!upstreamState.headerBlock.toLowerCase().includes('session-secret'));
  assert(!upstreamState.headerBlock.toLowerCase().includes('proxy-secret'));

  client.write('tunnel-probe');
  await waitForSocketData(client, (value) => value.includes(Buffer.from('tunnel-probe')), 3000);
  assert(upstreamState.tunnelData.includes('tunnel-probe'));
  assert.strictEqual(manager.proxyConnections.get('svc-routing').size, 1);
  assert.strictEqual(manager.closeProxyConnections('svc-routing'), 1);
  await new Promise((resolve) => client.once('close', resolve));

  const originRejected = manager.proxyWebSocket(
    { method: 'GET', headers: { host: 'bridge.localhost', origin: 'https://evil.example' } },
    null,
    Buffer.alloc(0),
    'svc-routing',
    '/socket',
    '',
    false
  );
  assert.strictEqual(originRejected.failureCategory, 'service_origin_not_allowed');
  const handshakeRejected = manager.proxyWebSocket(
    { method: 'GET', headers: { host: 'bridge.localhost', origin: 'http://bridge.localhost', upgrade: 'websocket' } },
    null,
    Buffer.alloc(0),
    'svc-routing',
    '/socket',
    '',
    false
  );
  assert.strictEqual(handshakeRejected.failureCategory, 'service_websocket_handshake_invalid');

  await close(bridgeServer);
  await close(upstreamServer);
  console.log('Service proxy routing smoke passed.');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
