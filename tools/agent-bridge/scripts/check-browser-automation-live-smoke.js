'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { RawWebSocketClient } = require('../src/websocket-client');

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
    const outgoing = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: Object.assign({ Host: '127.0.0.1:' + String(port), Connection: 'close' }, headers || {})
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.once('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

async function rpc(port, token, type, payload) {
  const id = 'browser-live-' + Math.random().toString(16).slice(2);
  const body = JSON.stringify({ id, type, payload: payload || {} });
  const response = await request(port, 'POST', '/rpc', {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body))
  }, body);
  assert.strictEqual(response.status, 200, response.body);
  const parsed = JSON.parse(response.body);
  assert(parsed.response && parsed.response.id === id, response.body);
  return parsed.response.payload || {};
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBridge(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await request(port, 'GET', '/health');
      if (health.status === 200) return;
    } catch (_error) {
      // The daemon may still be starting.
    }
    await wait(100);
  }
  throw new Error('Bridge did not become healthy.');
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_error) {}
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function runCli(root, args) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, ['src/desktop-launcher.js'].concat(args), {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: typeof code === 'number' ? code : 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
  });
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-browser-live-'));
  const home = path.join(tempRoot, 'home');
  const workspacePath = path.join(tempRoot, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const store = createDaemonStore(home);
  const now = new Date().toISOString();
  store.writeWorkspaceRegistry([{
    workspaceId: 'wks-browser-live',
    projectId: 'project-browser-live',
    cwd: workspacePath,
    workspacePath,
    kind: 'directory',
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  }]);
  const port = await reservePort();
  const token = 'browser-live-token-' + String(Date.now());
  const bridge = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: token,
      AGENT_BRIDGE_BROWSER_COMMAND_TIMEOUT_MS: '1000',
      NO_COLOR: '1'
    }),
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
  let host = null;
  try {
    await waitForBridge(port);
    const wsUrl = 'ws://127.0.0.1:' + String(port) + '/ws?clientId=browser-live-host&appNonce=' +
      encodeURIComponent('browser-live-' + String(Date.now()) + '-' + Math.random().toString(16).slice(2));
    host = new RawWebSocketClient(wsUrl, {
      reconnect: false,
      origin: 'http://127.0.0.1:' + String(port),
      headers: { Authorization: 'Bearer ' + token }
    });
    const received = [];
    let registeredResolve;
    const registeredPromise = new Promise((resolve) => { registeredResolve = resolve; });
    host.on('text', (text) => {
      const message = JSON.parse(text);
      received.push(message);
      if (message.type === 'response' && message.id === 'register-browser-host') registeredResolve(message.payload);
      if (message.type !== 'browser.host.command' || !message.payload) return;
      const command = message.payload;
      let result = { echoedCommand: command.command };
      if (command.command === 'page.create') result = { page: { pageId: 'page-live', url: command.payload.url, title: 'Live Page' } };
      if (command.command === 'page.snapshot') result = { snapshot: { text: 'button "Continue" [ref=@e1]', refs: ['@e1'] } };
      if (command.command === 'page.action') {
        result = { action: command.payload.action, applied: true };
        if (command.payload.action === 'download') {
          result.url = 'https://download-user:download-pass@example.com/file.zip';
          result.filePath = path.join(workspacePath, '.agent-bridge-downloads', 'file.zip');
        }
      }
      if (command.command === 'download.list') {
        result = { downloads: [{ guid: 'download-live', url: 'https://download-user:download-pass@example.com/file.zip', filePath: path.join(workspacePath, '.agent-bridge-downloads', 'file.zip'), state: 'completed' }] };
      }
      host.sendJson({
        id: 'result-' + command.commandId,
        type: 'browser.host.result',
        payload: { commandId: command.commandId, ok: true, result }
      });
    });
    await host.connect();
    host.sendJson({
      id: 'register-browser-host',
      type: 'browser.host.register',
      payload: {
        hostId: 'browser-live-host',
        label: 'Browser Live Host',
        platform: 'smoke',
        workspaceIds: ['wks-browser-live'],
        supportedCommands: ['page.create', 'page.snapshot', 'page.action', 'download.list'],
        supportedActions: ['click', 'download']
      }
    });
    const registered = await Promise.race([registeredPromise, wait(3000).then(() => null)]);
    assert(registered && registered.ok === true);

    const hosts = await rpc(port, token, 'browser.host.list', { workspaceId: 'wks-browser-live' });
    assert.strictEqual(hosts.totalCount, 1);
    const cli = await runCli(root, ['browser', 'host', 'list', '--workspace-id', 'wks-browser-live', '--daemon-url', 'http://127.0.0.1:' + String(port), '--token', token, '--json']);
    assert.strictEqual(cli.code, 0, cli.stderr + cli.stdout);
    assert(cli.stdout.includes('browser-live-host'));
    const blocked = await rpc(port, token, 'browser.page.create', { workspaceId: 'wks-browser-live', url: 'https://example.com' });
    assert.strictEqual(blocked.failureCategory, 'browser_domain_not_allowed');
    const permissionPreview = await rpc(port, token, 'browser.permission.set', { workspaceId: 'wks-browser-live', domains: ['example.com'] });
    assert.strictEqual(permissionPreview.preview, true);
    const permission = await rpc(port, token, 'browser.permission.set', { workspaceId: 'wks-browser-live', domains: ['example.com'], planId: permissionPreview.planId, confirm: true });
    assert.strictEqual(permission.confirmed, true);
    const permissionStatus = await rpc(port, token, 'browser.permission.get', { workspaceId: 'wks-browser-live' });
    assert.strictEqual(permissionStatus.downloadDirectory, '.agent-bridge-downloads');
    assert.strictEqual(permissionStatus.downloadDirectory.includes(workspacePath), false);
    assert.strictEqual(permissionStatus.permission.downloadDirectory, undefined);
    const created = await rpc(port, token, 'browser.page.create', { workspaceId: 'wks-browser-live', url: 'https://example.com/start' });
    assert.strictEqual(created.page.pageId, 'page-live');
    const snapshot = await rpc(port, token, 'browser.page.snapshot', { workspaceId: 'wks-browser-live', pageId: 'page-live' });
    assert(snapshot.snapshot.text.includes('@e1'));
    const actionPreview = await rpc(port, token, 'browser.page.action', { workspaceId: 'wks-browser-live', pageId: 'page-live', action: 'click', ref: '@e1' });
    assert.strictEqual(actionPreview.preview, true);
    assert.strictEqual(actionPreview.target.workspaceId, 'wks-browser-live');
    assert.strictEqual(actionPreview.target.hostId, 'browser-live-host');
    assert.strictEqual(actionPreview.target.pageId, 'page-live');
    assert.strictEqual(actionPreview.target.action, 'click');
    const action = await rpc(port, token, 'browser.page.action', { workspaceId: 'wks-browser-live', pageId: 'page-live', action: 'click', ref: '@e1', planId: actionPreview.planId, confirm: true });
    assert.strictEqual(action.applied, true);
    assert.strictEqual(action.target.workspaceId, 'wks-browser-live');
    assert.strictEqual(action.target.hostId, 'browser-live-host');
    assert.strictEqual(action.target.pageId, 'page-live');
    assert.strictEqual(action.target.action, 'click');
    const downloadPreview = await rpc(port, token, 'browser.page.action', { workspaceId: 'wks-browser-live', pageId: 'page-live', action: 'download', ref: '@e1' });
    assert.strictEqual(downloadPreview.preview, true);
    const download = await rpc(port, token, 'browser.page.action', { workspaceId: 'wks-browser-live', pageId: 'page-live', action: 'download', ref: '@e1', planId: downloadPreview.planId, confirm: true });
    assert.strictEqual(download.url, 'https://example.com/file.zip');
    assert.strictEqual(download.url.includes('@'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(download, 'filePath'), false);
    const downloads = await rpc(port, token, 'browser.download.list', { workspaceId: 'wks-browser-live', pageId: 'page-live' });
    assert.strictEqual(downloads.downloads[0].url, 'https://example.com/file.zip');
    assert.strictEqual(downloads.downloads[0].url.includes('@'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(downloads.downloads[0], 'filePath'), false);
    const dragUnavailable = await rpc(port, token, 'browser.page.action', { workspaceId: 'wks-browser-live', pageId: 'page-live', action: 'drag', sourceRef: '@e1', targetX: 20, targetY: 20 });
    assert.strictEqual(dragUnavailable.failureCategory, 'browser_action_unavailable');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(dragUnavailable, 'planId'), false);
    assert(received.some((message) => message.type === 'browser.host.command'));

    host.close(1000, 'smoke complete');
    await wait(100);
    const noHost = await rpc(port, token, 'browser.page.snapshot', { workspaceId: 'wks-browser-live', pageId: 'page-live' });
    assert.strictEqual(noHost.failureCategory, 'browser_no_host');
    console.log('browser automation live smoke ok');
  } finally {
    if (host) host.close(1000, 'cleanup');
    await stopChild(bridge);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
