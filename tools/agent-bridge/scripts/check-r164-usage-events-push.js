'use strict';
// R164: verify usage.updated event push over real WebSocket + mock provider
const http = require('http');
const { connectWebSocket } = require('../src/websocket-client');

const TOKEN = '123456';
const NONCE = 'r164-nonce-' + Date.now();
const WS_URL = 'ws://127.0.0.1:8788/ws?token=' + TOKEN + '&clientId=r164-events&appNonce=' + NONCE;

function rpcHttp(type, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type, id: 'r164_' + Date.now(), payload: payload || {} });
    const req = http.request({ host: '127.0.0.1', port: 8788, path: '/rpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + TOKEN } },
      (res) => {
        let t = '';
        res.on('data', (c) => { t += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) }));
      });
    req.on('error', reject);
    req.end(body);
  });
}

async function main() {
  const created = await rpcHttp('session.create', { providerId: 'mock', title: 'R164 Events', workspacePath: 'F:\\DevEcoStudioProject\\Coder' });
  const session = created.json.response.payload.session;
  console.log('session:', session.sessionId);
  const agent = created.json.response.payload.agent;
  console.log('agent:', agent.id);

  const usageEvents = [];
  const conn = await connectWebSocket(WS_URL, {
    onOpen() { console.log('ws open'); },
    onMessage(t) {
      try {
        const m = JSON.parse(t);
        if (m.type === 'event' && m.event === 'usage.updated') usageEvents.push(m.payload);
      } catch {}
    },
    onError(e) { console.error('ws error', e && e.message); }
  }, {});
  conn.sendJson({ id: 'r164_hello', type: 'hello', payload: { endpoint: 'ws://127.0.0.1:8788/ws', clientId: 'r164-events', appNonce: NONCE, hostProfileId: 'r164-host', appVersion: '1.0.0' } });

  const sent = await rpcHttp('message.send', { sessionId: session.sessionId, agentId: agent.id, message: 'produce usage events' });
  console.log('message.send ok:', sent.json.response.ok);

  await new Promise((r) => setTimeout(r, 5000));
  console.log('usage.updated events received:', usageEvents.length);
  for (const e of usageEvents.slice(0, 5)) {
    const u = e && e.usage ? e.usage : e;
    console.log('  event:', u.kind, 'tokens:', u.totalTokens, 'cost:', u.cost, u.currency || '', 'quota:', (u.quotaRemaining + '/' + u.quotaLimit));
  }
  conn.close(1000, 'done');
  process.exit(usageEvents.length >= 3 ? 0 : 2);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
