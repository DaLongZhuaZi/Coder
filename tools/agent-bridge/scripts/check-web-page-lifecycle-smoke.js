'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');

assert.ok(script.includes('function restoreTransportAfterPageShow(event)'), 'Web UI must have an explicit bfcache restore handler');
assert.ok(script.includes("event.persisted !== true"), 'Only persisted pageshow events may restart transport');
assert.ok(script.includes("sessionStorage.getItem('ngf_web_endpoint')"), 'bfcache restore must reuse the bounded tab endpoint');
assert.ok(script.includes('const hasSession = state.token.length > 0 || state.ticket.length > 0'), 'bfcache restore must require an existing in-memory session');
assert.ok(script.includes("if (!savedEndpoint || !hasSession)"), 'logged-out or incomplete pages must fail closed instead of reconnecting');
assert.ok(script.includes('prepareTransportForLogin();'), 'bfcache restore must reset connection generation before reconnecting');
assert.ok(script.includes("window.addEventListener('pageshow', restoreTransportAfterPageShow)"), 'Web UI must register the persisted pageshow lifecycle hook');
assert.ok(script.includes("window.addEventListener('pagehide'"), 'Web UI must keep pagehide cleanup paired with pageshow restore');
assert.ok(!script.includes("sessionStorage.setItem('ngf_web_token'"), 'bfcache restore must not persist a bearer token');
assert.ok(!script.includes('webTicket=' + "' + state.token"), 'WebSocket URL must not carry the bearer token');

console.log('web page lifecycle smoke ok');
