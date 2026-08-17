'use strict';
// R162 Web UI ticket WebSocket verification: obtain web auth ticket, open WS,
// then query core workbench data via HTTP RPC with session cookie flow.
const http = require('http');

const BRIDGE = '127.0.0.1';
const PORT = 8788;
const TOKEN = '123456';

function httpPost(path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({
      host: BRIDGE, port: PORT, path, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': data.length, Origin: 'http://127.0.0.1:8788' }, headers || {})
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function main() {
  const auth = await httpPost('/web/auth/session', {}, { Authorization: 'Bearer ' + TOKEN });
  console.log('auth status:', auth.status);
  const ticket = JSON.parse(auth.text).ticket;
  console.log('ticket:', ticket ? ticket.slice(0, 20) + '...' : 'NONE');
  const cookie = auth.headers['set-cookie'] ? auth.headers['set-cookie'][0].split(';')[0] : '';
  console.log('cookie:', cookie ? cookie.slice(0, 40) + '...' : 'NONE');

  const rpc = await httpPost('/rpc', { type: 'server.info.get', id: 'r162_web1', payload: {} }, { Cookie: cookie });
  console.log('rpc server.info status:', rpc.status);
  const rj = JSON.parse(rpc.text);
  console.log('rpc ok:', rj.ok, '| serverId:', rj.response && rj.response.payload && rj.response.payload.serverInfo ? rj.response.payload.serverInfo.serverId : 'n/a');

  const rpc2 = await httpPost('/rpc', { type: 'agent.list', id: 'r162_web2', payload: { workspaceId: 'wks_zaj5-VK2zd3LSfbb' } }, { Cookie: cookie });
  console.log('agent.list status:', rpc2.status, 'ok:', JSON.parse(rpc2.text).ok);

  const rpc3 = await httpPost('/rpc', { type: 'provider.catalog', id: 'r162_web3', payload: {} }, { Cookie: cookie });
  const cj = JSON.parse(rpc3.text);
  console.log('provider.catalog ok:', cj.ok, '| providers:', cj.response && cj.response.payload ? cj.response.payload.totalCount : 'n/a');

  console.log('R162 WEB UI TICKET + RPC FIELD OK');
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
