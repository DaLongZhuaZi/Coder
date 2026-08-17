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

function request(port, method, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers: Object.assign({ Host: '127.0.0.1:' + String(port) }, headers || {}) }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function rpc(port, token, type, payload) {
  const response = await request(port, 'POST', '/rpc', {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  }, JSON.stringify({ id: 'web-live-' + type.replace(/[^a-z0-9]/gi, '_'), type, payload: payload || {} }));
  assert.strictEqual(response.status, 200, type + ' RPC should return HTTP 200');
  const body = JSON.parse(response.body);
  assert.ok(body.response && body.response.type === 'response', type + ' RPC should include a response');
  return body.response.payload || body.response;
}

async function main() {
  const port = await reservePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-web-live-'));
  const importedWorkspacePath = path.join(home, 'imported-workspace');
  fs.mkdirSync(importedWorkspacePath, { recursive: true });
  const root = path.resolve(__dirname, '..');
  const token = 'web-live-token-' + String(Date.now());
  const child = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, { AGENT_BRIDGE_HOME: home, AGENT_BRIDGE_HOST: '127.0.0.1', AGENT_BRIDGE_PORT: String(port), AGENT_BRIDGE_TOKEN: token, NO_COLOR: '1' }),
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
  try {
    let health = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { health = await request(port, 'GET', '/health'); if (health.status === 200) break; } catch (_error) { /* wait */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(health && health.status === 200, 'Bridge should become healthy');
    const capabilities = await request(port, 'GET', '/capabilities', { Authorization: 'Bearer ' + token });
    assert.strictEqual(capabilities.status, 200, 'capabilities endpoint should be available to the authenticated Web UI');
    const capabilitiesPayload = JSON.parse(capabilities.body);
    assert.ok(Array.isArray(capabilitiesPayload.providers), 'capabilities endpoint should expose a provider descriptor list');
    const html = await request(port, 'GET', '/');
    assert.strictEqual(html.status, 200, 'root should serve Web UI');
    assert.ok(String(html.headers['content-security-policy']).includes("script-src 'self'"), 'HTML should include CSP');
    assert.ok(String(html.headers['x-content-type-options']).includes('nosniff'), 'HTML should include nosniff');
    assert.ok(!html.body.includes(token), 'HTML must not contain the Bridge token');
    const compatibilityAsset = await request(port, 'GET', '/app/compatibility.js');
    assert.strictEqual(compatibilityAsset.status, 200, 'Web compatibility asset should be served');
    assert.ok(String(compatibilityAsset.headers['content-type']).includes('text/javascript'), 'Web compatibility asset should have JavaScript content type');
    assert.ok(compatibilityAsset.body.includes('normalizeBridgeCapabilities'), 'Web compatibility asset should contain the normalizer');
    const rejected = await request(port, 'GET', '/', { Host: 'evil.example' });
    assert.strictEqual(rejected.status, 403, 'unlisted Host must be rejected');
    const ticket = await request(port, 'POST', '/web/auth/session', { Authorization: 'Bearer ' + token, Origin: 'http://127.0.0.1:' + String(port) });
    assert.strictEqual(ticket.status, 200, 'valid browser credential should issue a ticket');
    const ticketPayload = JSON.parse(ticket.body);
    assert.ok(typeof ticketPayload.ticket === 'string' && ticketPayload.ticket.length >= 32, 'ticket should be opaque and bounded');
    assert.ok(Array.isArray(ticket.headers['set-cookie']) && ticket.headers['set-cookie'][0].includes('HttpOnly') && ticket.headers['set-cookie'][0].includes('SameSite=Strict'), 'Web auth should issue an HttpOnly same-site session cookie');
    const cookie = ticket.headers['set-cookie'][0].split(';')[0];
    const restored = await request(port, 'POST', '/web/auth/session', { Cookie: cookie, Origin: 'http://127.0.0.1:' + String(port) });
    assert.strictEqual(restored.status, 200, 'Web session cookie should restore authentication without a bearer token');
    const loggedOut = await request(port, 'POST', '/web/auth/logout', { Cookie: cookie, Origin: 'http://127.0.0.1:' + String(port) });
    assert.strictEqual(loggedOut.status, 200, 'Web session logout should succeed');
    assert.ok(Array.isArray(loggedOut.headers['set-cookie']) && loggedOut.headers['set-cookie'][0].includes('Max-Age=0'), 'Web logout should clear the session cookie');
    const badOrigin = await request(port, 'POST', '/web/auth/session', { Authorization: 'Bearer ' + token, Origin: 'http://evil.example' });
    assert.strictEqual(badOrigin.status, 403, 'cross-origin ticket request must be rejected');
    const daemonStatus = await rpc(port, token, 'daemon.status', { hostProfileId: 'web-live-host' });
    assert.ok(typeof daemonStatus.instanceId === 'string' && daemonStatus.instanceId.length > 0, 'daemon status should expose instance identity');
    const daemonHealth = await rpc(port, token, 'daemon.health', {});
    assert.ok(typeof daemonHealth.instanceHealth === 'string', 'daemon health should expose a normalized health state');
    const workspaceDoctor = await rpc(port, token, 'workspace.registry.doctor', { includeArchived: true });
    assert.ok(Array.isArray(workspaceDoctor.checks), 'workspace doctor should return checks');
    const diagnostics = await rpc(port, token, 'diagnostics.export', { format: 'json', maxBytes: 64 * 1024 });
    assert.ok(diagnostics.report && Array.isArray(diagnostics.report.groups), 'diagnostics export should return grouped report');
    assert.deepStrictEqual(diagnostics.report.groups.map((group) => group.id), ['daemon', 'provider', 'terminal', 'queue', 'usage', 'secureStorage', 'remoteConfig', 'persistence'], 'diagnostics should preserve the eight stable groups');
    const importPreview = await rpc(port, token, 'workspace.registry.import', { workspacePath: importedWorkspacePath, workspaceTitle: 'Web live imported workspace', preview: true, confirm: false });
    assert.strictEqual(importPreview.ok, true, 'workspace import preview should validate the temporary directory');
    assert.strictEqual(importPreview.preview, true, 'workspace import should preview before writing');
    assert.strictEqual(importPreview.confirmed, false, 'workspace import preview must not be confirmed');
    const importResult = await rpc(port, token, 'workspace.registry.import', { workspacePath: importedWorkspacePath, workspaceTitle: 'Web live imported workspace', preview: false, confirm: true });
    assert.strictEqual(importResult.ok, true, 'workspace import confirmation should update the registry');
    assert.strictEqual(importResult.confirmed, true, 'workspace import confirmation should be marked confirmed');
    const importedWorkspaceId = typeof importResult.workspaceId === 'string' ? importResult.workspaceId : '';
    assert.ok(importedWorkspaceId.length > 0, 'workspace import should return a workspace id');
    const activeAfterImport = await rpc(port, token, 'workspace.registry.list', { includeArchived: false });
    assert.ok(activeAfterImport.workspaces.some((item) => item.workspaceId === importedWorkspaceId), 'imported workspace should be listed as active');
    const openPreview = await rpc(port, token, 'workspace.registry.open', { workspaceId: importedWorkspaceId, preview: true, confirm: false, dryRun: true });
    assert.strictEqual(openPreview.ok, true, 'workspace open preview should validate the registry entry');
    assert.strictEqual(openPreview.preview, true, 'workspace open smoke must stop at preview');
    const archivePreview = await rpc(port, token, 'workspace.registry.archive', { workspaceId: importedWorkspaceId, preview: true, confirm: false });
    assert.strictEqual(archivePreview.ok, true, 'workspace archive preview should find the registry entry');
    assert.strictEqual(archivePreview.preview, true, 'workspace archive should preview before writing');
    const archiveResult = await rpc(port, token, 'workspace.registry.archive', { workspaceId: importedWorkspaceId, preview: false, confirm: true });
    assert.strictEqual(archiveResult.ok, true, 'workspace archive confirmation should update the registry');
    assert.strictEqual(archiveResult.status, 'archived', 'workspace archive confirmation should report archived status');
    const activeAfterArchive = await rpc(port, token, 'workspace.registry.list', { includeArchived: false });
    assert.ok(!activeAfterArchive.workspaces.some((item) => item.workspaceId === importedWorkspaceId), 'archived workspace should leave the active list');
    const allAfterArchive = await rpc(port, token, 'workspace.registry.list', { includeArchived: true });
    const archivedWorkspace = allAfterArchive.workspaces.find((item) => item.workspaceId === importedWorkspaceId);
    assert.ok(archivedWorkspace && archivedWorkspace.status === 'archived', 'includeArchived should retain archived workspace records');
    console.log('web UI live smoke ok');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
