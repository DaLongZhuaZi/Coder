'use strict';
const { createWebSocketClient } = require('../src/websocket-client');

const TOKEN = '123456';
const NONCE = 'r164b-nonce-' + Date.now();
const HOST = 'r164b-host';
const WS_URL = 'ws://127.0.0.1:8788/ws?token=' + TOKEN + '&clientId=r164b&appNonce=' + NONCE;

class Rpc {
  constructor(conn) {
    this.conn = conn;
    this.seq = 0;
    this.pending = new Map();
  }
  call(type, payload) {
    const id = 'r164b_' + String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.conn.sendJson({ id, type, payload: payload || {} });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + type)); } }, 15000);
    });
  }
}

async function main() {
  const events = [];
  const client = createWebSocketClient(WS_URL, {
    onOpen() { console.log('ws open'); },
    onMessage(t) {
      try {
        const m = JSON.parse(t);
        if (m.type === 'response' && m.id && rpc.pending.has(m.id)) {
          const p = rpc.pending.get(m.id); rpc.pending.delete(m.id);
          if (m.ok) p.resolve(m.payload); else p.reject(new Error(m.error ? m.error.code : 'rpc'));
        } else if (m.type === 'event' && m.event === 'usage.updated') {
          events.push(m.payload);
        }
      } catch {}
    },
    onError(e) { console.error('ws error', e && e.message); }
  }, {});
  const conn = await client.connect();
  const rpc = new Rpc(conn);

  const hello = await rpc.call('hello', { endpoint: 'ws://127.0.0.1:8788/ws', clientId: 'r164b', appNonce: NONCE, hostProfileId: HOST, appVersion: '1.0.0' });
  console.log('hello:', hello.accepted);

  const created = await rpc.call('session.create', { providerId: 'mock', title: 'R164b Events', workspacePath: 'F:\\DevEcoStudioProject\\Coder' });
  const sessionId = created.session.sessionId;
  const agentId = created.agent.id;
  console.log('session:', sessionId);

  const sent = await rpc.call('message.send', { sessionId, agentId, message: 'produce usage events' });
  console.log('send accepted:', sent.accepted);

  await new Promise((r) => setTimeout(r, 5000));
  console.log('usage.updated events:', events.length);
  for (const e of events.slice(0, 5)) {
    const u = e && e.usage ? e.usage : e;
    console.log('  ', u.kind, 'tokens:', u.totalTokens, 'cost:', u.cost + (u.currency || ''), 'quota:', (u.quotaRemaining !== undefined ? u.quotaRemaining + '/' + u.quotaLimit : 'n/a'));
  }
  conn.close(1000, 'done');
  process.exit(events.length >= 3 ? 0 : 2);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
