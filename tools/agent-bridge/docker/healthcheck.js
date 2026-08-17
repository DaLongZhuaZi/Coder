'use strict';

const http = require('http');

const rawPort = process.env.AGENT_BRIDGE_PORT || '8787';
const port = Number.parseInt(rawPort, 10);
const request = http.get({
  hostname: '127.0.0.1',
  port: Number.isFinite(port) ? port : 8787,
  path: '/health',
  timeout: 4000,
  headers: { host: '127.0.0.1' }
}, (response) => {
  response.resume();
  process.exit(response.statusCode === 200 ? 0 : 1);
});

request.on('timeout', () => request.destroy(new Error('healthcheck_timeout')));
request.on('error', () => process.exit(1));

