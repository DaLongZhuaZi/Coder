'use strict';
const { createWebSocketClient } = require('../src/websocket-client');
const TOKEN = '123456';
const NONCE = 'r168b-nonce-' + Date.now();
const WS_URL = 'ws://127.0.0.1:8788/ws?token=' + TOKEN + '&clientId=r168b&appNonce=' + NONCE;

class Rpc {
  constructor(conn) { this.conn = conn; this.seq = 0; this.pending = new Map(); }
  call(type, payload) {
    const id = 'r168b_' + String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.conn.sendJson({ id, type, payload: payload || {} });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + type)); } }, 15000);
    });
  }
}

async function main() {
  const client = createWebSocketClient(WS_URL, {
    onOpen() {},
    onMessage(t) {
      try {
        const m = JSON.parse(t);
        if (m.type === 'response' && m.id && rpc.pending.has(m.id)) {
          const p = rpc.pending.get(m.id); rpc.pending.delete(m.id);
          if (m.ok) p.resolve(m.payload); else p.reject(new Error(m.error ? m.error.code : 'rpc'));
        }
      } catch {}
    },
    onError(e) { console.error('ws err', e && e.message); }
  }, { maxFrameBytes: 16 * 1024 * 1024 });
  const conn = await client.connect();
  const rpc = new Rpc(conn);
  await rpc.call('hello', { endpoint: 'ws://127.0.0.1:8788/ws', clientId: 'r168b', appNonce: NONCE, appVersion: '1.0.0' });

  const GONE = 'codex:nonexistent-' + Date.now();
  let t0 = Date.now();
  try {
    const r1 = await rpc.call('session.messages', { sessionId: GONE });
    console.log('first (missing) in', Date.now() - t0, 'ms ->', JSON.stringify(r1).slice(0, 150));
  } catch (e) {
    console.log('first (missing) in', Date.now() - t0, 'ms ERROR:', e.message);
  }
  t0 = Date.now();
  try {
    const r2 = await rpc.call('session.messages', { sessionId: GONE });
    console.log('second (cooldown) in', Date.now() - t0, 'ms ->', JSON.stringify(r2).slice(0, 150));
  } catch (e) {
    console.log('second (cooldown) in', Date.now() - t0, 'ms ERROR:', e.message);
  }
  conn.close(1000, 'done');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
