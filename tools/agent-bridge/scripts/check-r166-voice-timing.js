'use strict';
const { createWebSocketClient } = require('../src/websocket-client');
const TOKEN = '123456';
const NONCE = 'r166-nonce-' + Date.now();
const WS_URL = 'ws://127.0.0.1:8788/ws?token=' + TOKEN + '&clientId=r166-vs&appNonce=' + NONCE;

class Rpc {
  constructor(conn) { this.conn = conn; this.seq = 0; this.pending = new Map(); }
  call(type, payload) {
    const id = 'r166_' + String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.conn.sendJson({ id, type, payload: payload || {} });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + type)); } }, 20000);
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
  }, {});
  const conn = await client.connect();
  const rpc = new Rpc(conn);
  await rpc.call('hello', { endpoint: 'ws://127.0.0.1:8788/ws', clientId: 'r166-vs', appNonce: NONCE, appVersion: '1.0.0' });

  let t0 = Date.now();
  const vs = await rpc.call('voice.status', {});
  console.log('voice.status in', Date.now() - t0, 'ms available=', vs.available);

  t0 = Date.now();
  const tts = await rpc.call('voice.tts.speak', { sessionId: 'test', text: 'hi', voiceId: 'default', format: 'wav' });
  console.log('voice.tts.speak in', Date.now() - t0, 'ms:', JSON.stringify(tts).slice(0, 300));

  t0 = Date.now();
  const ss = await rpc.call('voice.session.start', { sessionId: 'test' });
  console.log('voice.session.start in', Date.now() - t0, 'ms:', JSON.stringify(ss).slice(0, 200));

  conn.close(1000, 'done');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
