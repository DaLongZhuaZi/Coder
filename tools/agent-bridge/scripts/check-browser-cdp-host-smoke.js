'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { acceptWebSocket } = require('../src/websocket');
const {
  BrowserCdpHost,
  validateCdpBaseUrl,
  validateDebuggerWebSocketUrl
} = require('../src/browser-cdp-host');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const cdpSource = fs.readFileSync(path.resolve(__dirname, '../src/browser-cdp-host.js'), 'utf8');
  assert.ok(cdpSource.includes("hostKind: 'cdp'"), 'CDP host must identify its host kind');
  assert.ok(cdpSource.includes("capabilitySource: 'cdp'"), 'CDP host must identify its capability source');
  assert.ok(cdpSource.includes("readiness: 'ready'"), 'CDP host must publish verified readiness after endpoint validation');
  assert.strictEqual(validateCdpBaseUrl('http://127.0.0.1:9222', false).hostname, '127.0.0.1');
  assert.throws(() => validateCdpBaseUrl('http://example.com:9222', false), /Remote CDP endpoints are disabled/);
  assert.throws(() => validateCdpBaseUrl('http://example.com:9222', true), /require HTTPS/);
  assert.strictEqual(validateCdpBaseUrl('https://example.com:9222', true).hostname, 'example.com');
  assert.strictEqual(
    validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'ws://127.0.0.1:9222/devtools/page/page-1',
      false
    ).protocol,
    'ws:'
  );
  assert.strictEqual(
    validateDebuggerWebSocketUrl(
      'https://debug.example.com:9222',
      'wss://debug.example.com:9222/devtools/page/page-1',
      true
    ).protocol,
    'wss:'
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'ws://user:password@127.0.0.1:9222/devtools/page/page-1',
      false
    ),
    /credentials/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'http://127.0.0.1:9222/devtools/page/page-1',
      false
    ),
    /WS\(S\)/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'ws://localhost:9222/devtools/page/page-1',
      false
    ),
    /host does not match/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'ws://127.0.0.1:9333/devtools/page/page-1',
      false
    ),
    /port does not match/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'http://127.0.0.1:9222',
      'wss://debug.example.com:9222/devtools/page/page-1',
      false
    ),
    /Remote CDP debugger targets are disabled/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'https://debug.example.com:9222',
      'ws://debug.example.com:9222/devtools/page/page-1',
      true
    ),
    /require secure WSS/
  );
  assert.throws(
    () => validateDebuggerWebSocketUrl(
      'https://debug.example.com:9222',
      'wss://127.0.0.1:9222/devtools/page/page-1',
      true
    ),
    /host does not match/
  );
  const state = { port: 0, commands: [], elementReady: { visible: true, enabled: true } };
  const server = http.createServer((req, res) => {
    const origin = 'http://127.0.0.1:' + String(state.port);
    if (req.url === '/json/version') {
      const body = JSON.stringify({ Browser: 'Fake Chromium', webSocketDebuggerUrl: 'ws://127.0.0.1:' + String(state.port) + '/devtools/browser/fake' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (req.url === '/json/list') {
      const body = JSON.stringify([
        { id: 'page-1', type: 'page', title: 'Fake Page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:' + String(state.port) + '/devtools/page/page-1' },
        { id: 'page-evil', type: 'page', title: 'Escaped Page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:' + String(state.port + 1) + '/devtools/page/page-evil' }
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (req.method === 'PUT' && req.url.startsWith('/json/new?')) {
      const body = JSON.stringify({ id: 'page-2', type: 'page', title: 'New Page', url: decodeURIComponent(req.url.substring('/json/new?'.length)), webSocketDebuggerUrl: 'ws://127.0.0.1:' + String(state.port) + '/devtools/page/page-2' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (req.url.startsWith('/json/close/')) {
      const body = JSON.stringify({ closed: true, origin });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on('upgrade', (req, socket, head) => {
    acceptWebSocket(req, socket, head, {
      onOpen() {},
      onMessage(text, connection) {
        const message = JSON.parse(text);
        state.commands.push(message.method);
        let result = {};
        if (message.method === 'Accessibility.getFullAXTree') {
          result = { nodes: [{ role: { value: 'button' }, name: { value: 'Continue' }, backendDOMNodeId: 42 }] };
        } else if (message.method === 'Page.captureScreenshot') {
          result = { data: Buffer.from('fake-png').toString('base64') };
        } else if (message.method === 'DOM.getBoxModel') {
          result = { model: { content: [10, 10, 30, 10, 30, 30, 10, 30] } };
        } else if (message.method === 'DOM.resolveNode') {
          result = { object: { objectId: 'object-42' } };
        } else if (message.method === 'Runtime.callFunctionOn') {
          result = { result: { value: state.elementReady } };
        } else if (message.method === 'Runtime.evaluate') {
          result = { result: { value: true } };
        }
        connection.sendJson({ id: message.id, result });
        if (message.method === 'Page.enable') {
          connection.sendJson({ method: 'Page.javascriptDialogOpening', params: { type: 'alert', message: 'Hello' } });
        }
        if (message.method === 'Browser.setDownloadBehavior') {
          connection.sendJson({ method: 'Browser.downloadWillBegin', params: { guid: 'download-1', url: 'https://download-user:download-pass@example.com/file.zip', suggestedFilename: 'file.zip' } });
          connection.sendJson({ method: 'Browser.downloadProgress', params: { guid: 'download-1', state: 'completed', totalBytes: 10, receivedBytes: 10, filePath: 'file.zip' } });
        }
      },
      onBinary() {},
      onClose() {}
    });
  });
  state.port = await listen(server);
  const host = new BrowserCdpHost({
    bridgeUrl: 'http://127.0.0.1:8787',
    bridgeToken: 'unused',
    cdpUrl: 'http://127.0.0.1:' + String(state.port),
    workspaceIds: ['wks-cdp']
  });
  try {
    const pages = await host.execute('page.list', {});
    assert.strictEqual(pages.pages[0].pageId, 'page-1');
    await assert.rejects(
      host.execute('page.snapshot', { pageId: 'page-evil' }),
      /port does not match/
    );
    const created = await host.execute('page.create', { url: 'https://example.com/new' });
    assert.strictEqual(created.page.pageId, 'page-2');
    const snapshot = await host.execute('page.snapshot', { pageId: 'page-1' });
    assert(snapshot.snapshot.text.includes('button "Continue" [ref=@e1]'));
    const screenshot = await host.execute('page.screenshot', { pageId: 'page-1', fullPage: false });
    assert.strictEqual(Buffer.from(screenshot.screenshot.dataBase64, 'base64').toString('utf8'), 'fake-png');
    const clicked = await host.execute('page.action', { pageId: 'page-1', action: 'click', ref: '@e1' });
    assert.strictEqual(clicked.applied, true);
    assert.strictEqual(clicked.dialogs[0].type, 'alert');
    await host.execute('page.snapshot', { pageId: 'page-1' });
    const dragged = await host.execute('page.action', {
      pageId: 'page-1',
      action: 'drag',
      sourceRef: '@e1',
      targetX: 80,
      targetY: 80,
      steps: 3
    });
    assert.strictEqual(dragged.applied, true);
    assert.strictEqual(dragged.steps, 3);
    state.elementReady = { visible: false, enabled: true };
    await host.execute('page.snapshot', { pageId: 'page-1' });
    await assert.rejects(
      host.execute('page.action', { pageId: 'page-1', action: 'click', ref: '@e1' }),
      /not visible/
    );
    state.elementReady = { visible: true, enabled: true };
    await host.execute('page.snapshot', { pageId: 'page-1' });
    const downloaded = await host.execute('page.action', { pageId: 'page-1', action: 'download', ref: '@e1', downloadDirectory: 'C:\\tmp' });
    assert.strictEqual(downloaded.applied, true);
    assert.strictEqual(downloaded.downloadDirectory, '.agent-bridge-downloads');
    assert.strictEqual(downloaded.downloadDirectoryConfigured, true);
    assert.strictEqual(downloaded.downloadDirectory.includes('C:\\tmp'), false);
    const downloads = await host.execute('download.list', {});
    assert.strictEqual(downloads.downloads[0].state, 'completed');
    assert.strictEqual(downloads.downloads[0].url, 'https://example.com/file.zip');
    assert.strictEqual(downloads.downloads[0].url.includes('@'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(downloads.downloads[0], 'filePath'), false);
    const waited = await host.execute('page.wait', { pageId: 'page-1', text: 'Continue', timeoutMs: 500 });
    assert.strictEqual(waited.matched, true);
    await host.execute('page.navigate', { pageId: 'page-1', operation: 'navigate', url: 'https://example.com/next' });
    assert(state.commands.includes('Accessibility.getFullAXTree'));
    assert(state.commands.includes('Page.captureScreenshot'));
    assert(state.commands.includes('Input.dispatchMouseEvent'));
    assert(state.commands.includes('Page.navigate'));
    const closedInstance = await host.execute('instance.close', { instanceId: host.hostId });
    assert.strictEqual(closedInstance.closed, true);
    assert.strictEqual(closedInstance.browserProcessUnchanged, true);
    console.log('browser CDP host smoke ok');
  } finally {
    host.stop();
    await close(server);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
