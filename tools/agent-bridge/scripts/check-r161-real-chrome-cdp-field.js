'use strict';
// R161 real Chrome CDP field verification against the running Bridge.
const { connectWebSocket } = require('../src/websocket-client');

const TOKEN = '123456';
const FIELD_NONCE = 'r161-nonce-' + Date.now();
const BRIDGE_WS = 'ws://127.0.0.1:8788/ws?token=' + TOKEN + '&clientId=r161-field&appNonce=' + FIELD_NONCE;
const CDP_BASE = 'http://127.0.0.1:9224';

class Rpc {
  constructor(conn) {
    this.conn = conn;
    this.seq = 0;
    this.pending = new Map();
  }
  call(type, payload) {
    const id = 'r161_' + String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.conn.sendJson({ id, type, payload: payload || {} });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('timeout waiting for ' + type));
        }
      }, 20000);
    });
  }
}

async function main() {
  const conn = await connectWebSocket(BRIDGE_WS, {
    onOpen() { console.log('ws open'); },
    onMessage() {},
    onError(e) { console.error('ws error', e && e.message); }
  }, {});
  const rpc = new Rpc(conn);
  conn.on('text', (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.type === 'response' && msg.id && rpc.pending.has(msg.id)) {
      const p = rpc.pending.get(msg.id);
      rpc.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.payload);
      else p.reject(new Error(msg.error ? msg.error.code + ': ' + msg.error.message : 'rpc error'));
    }
  });
  conn.on('error', (e) => console.error('ws error', e && e.message));

  const hello = await rpc.call('hello', {
    endpoint: 'ws://127.0.0.1:8788/ws', clientId: 'r161-field', appNonce: FIELD_NONCE, appVersion: '1.0.0'
  });
  console.log('hello ok:', hello.accepted === true);

  // resolve a real registered workspace id
  let workspaceId = 'wks-r161';
  try {
    const wl = await rpc.call('workspace.registry.list', {});
    const list = wl.workspaces || wl.items || [];
    if (list.length > 0) {
      workspaceId = list[0].workspaceId || list[0].id || workspaceId;
      console.log('using workspace:', workspaceId, '|', list[0].title || '');
    } else {
      console.log('no registered workspaces; trying to create one');
      const created = await rpc.call('workspace.registry.create', { title: 'R161 Field', path: 'F:\\DevEcoStudioProject\\Coder', kind: 'folder' });
      if (created && (created.workspaceId || created.id)) workspaceId = created.workspaceId || created.id;
      console.log('created workspace:', workspaceId);
    }
  } catch (e) { console.log('workspace resolve fallback:', e.message); }

  const reg = await rpc.call('browser.host.register', {
    hostId: 'chrome-cdp-9224',
    label: 'Real Chrome CDP 9224',
    hostKind: 'cdp',
    capabilitySource: 'cdp',
    runtime: 'chromium',
    readiness: 'ready',
    platform: 'windows',
    endpoint: CDP_BASE,
    supportedPlatforms: ['windows'],
    workspaceIds: [workspaceId],
    supportedCommands: ['page.create', 'page.close', 'page.navigate', 'page.snapshot', 'page.screenshot', 'page.logs', 'page.wait', 'page.action', 'download.list'],
    supportedActions: ['click', 'fill', 'type', 'keypress', 'hover', 'select', 'drag', 'upload', 'scroll', 'evaluate', 'download']
  });
  console.log('host.register:', JSON.stringify(reg).slice(0, 400));
  if (!reg || reg.ok !== true) throw new Error('host register failed: ' + JSON.stringify(reg));

  const hosts = await rpc.call('browser.host.list', { workspaceId });
  console.log('host.list total:', hosts.totalCount, 'hosts:', (hosts.hosts || []).map((h) => h.hostId + '/' + h.readiness).join(','));

  // domain allowlist: example.com is blocked by default (browser_domain_not_allowed) - grant via preview/confirm
  const permPreview = await rpc.call('browser.permission.set', { workspaceId, domains: ['example.com', 'example.org'] });
  console.log('permission preview:', JSON.stringify(permPreview).slice(0, 200));
  if (permPreview && permPreview.preview === true && permPreview.planId) {
    const permConfirm = await rpc.call('browser.permission.set', { workspaceId, domains: ['example.com', 'example.org'], planId: permPreview.planId, confirm: true });
    console.log('permission confirm:', JSON.stringify(permConfirm).slice(0, 200));
  }
  const permStatus = await rpc.call('browser.permission.get', { workspaceId });
  console.log('permission status domains:', JSON.stringify(permStatus.permission && permStatus.permission.domains || permStatus.domains || []).slice(0, 200));

  const created = await rpc.call('browser.page.create', {
    workspaceId, url: 'https://example.com/', pageId: ''
  });
  console.log('page.create:', JSON.stringify(created).slice(0, 300));
  const pageId = created.page && created.page.pageId ? created.page.pageId : '';
  if (!pageId) throw new Error('no pageId from create');

  const snap = await rpc.call('browser.page.snapshot', { workspaceId, pageId });
  console.log('page.snapshot:', JSON.stringify(snap).slice(0, 300));

  const refs = snap && snap.snapshot && Array.isArray(snap.snapshot.refs) ? snap.snapshot.refs : [];
  console.log('snapshot refs count:', refs.length);
  if (refs.length > 0) {
    const preview = await rpc.call('browser.page.action', {
      workspaceId, pageId, action: 'click', ref: refs[0]
    });
    console.log('action preview:', JSON.stringify(preview).slice(0, 250));
    if (preview && preview.preview === true && preview.planId) {
      const confirmed = await rpc.call('browser.page.action', {
        workspaceId, pageId, action: 'click', ref: refs[0], planId: preview.planId, confirm: true
      });
      console.log('action confirm:', JSON.stringify(confirmed).slice(0, 250));
    }
  }

  const shot = await rpc.call('browser.page.screenshot', { workspaceId, pageId });
  console.log('page.screenshot ok:', shot && shot.screenshot ? (shot.screenshot.mediaType || 'png') + ' len=' + String(shot.screenshot.dataBase64 || '').length : 'none');

  const nav = await rpc.call('browser.page.navigate', { workspaceId, pageId, url: 'https://example.org/' });
  console.log('page.navigate:', JSON.stringify(nav).slice(0, 200));

  console.log('R161 REAL CHROME CDP FIELD VERIFICATION OK');
  conn.close(1000, 'done');
  process.exit(0);
}

main().catch((e) => {
  console.error('R161 FIELD FAILED:', e.message);
  process.exit(1);
});
