'use strict';

const assert = require('assert');
const http = require('http');
const { EventEmitter } = require('events');
const { HermesStudioProvider, OpenClawGatewayProvider } = require('../src/providers/gateway-provider');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function sendJson(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text)
  });
  res.end(text);
}

async function startMockServer() {
  const observedSessionIds = [];
  let responseCounter = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      sendJson(res, 200, { data: [{ id: 'openclaw/default' }] });
      return;
    }
    if (req.url === '/api/health' || req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.url === '/v1/responses') {
      const text = await readBody(req);
      const body = JSON.parse(text);
      observedSessionIds.push(String(req.headers['x-openclaw-session-key'] || ''));
      if (String(req.headers.authorization || '').includes('bad-token')) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (String(body.input).includes('slow')) {
        setTimeout(() => {
          if (!res.destroyed) {
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.end('data: [DONE]\n\n');
          }
        }, 250);
        return;
      }
      if (String(body.input).includes('plain-json')) {
        sendJson(res, 200, { output: [{ type: 'output_text', text: 'plain response' }] });
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: response.output_text.delta\n');
      res.write('data: {"type":"response.output_text.delta","delta":"hello "}\n\n');
      res.write('data: {"type":"response.output_text.delta","delta":"gateway"}\n\n');
      responseCounter += 1;
      res.end('data: {"type":"response.completed","response":{"id":"response-' + String(responseCounter) + '","usage":{"input_tokens":12,"output_tokens":8,"reasoning_tokens":2,"total_tokens":22,"input_tokens_details":{"cached_tokens":3},"cost":0.25,"currency":"USD"}}}\n\n');
      return;
    }
    if (req.url === '/api/chat-run/runs') {
      const text = await readBody(req);
      const body = JSON.parse(text);
      observedSessionIds.push(String(body.session_id || ''));
      sendJson(res, 200, { status: 'completed', output: 'hermes http', usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9, cost: 0.1, currency: 'USD' } });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: 'http://127.0.0.1:' + String(address.port),
    observedSessionIds
  };
}

class FakeSocket extends EventEmitter {
  constructor(fail, wait) {
    super();
    this.fail = fail;
    this.disconnected = false;
    this.wait = wait === true;
    setImmediate(() => super.emit(fail ? 'connect_error' : 'connect', fail ? new Error('fake connect failed') : undefined));
  }

  emit(name, value) {
    if (name === 'run') {
      if (this.wait) {
        return true;
      }
      setImmediate(() => {
        super.emit('message.delta', { delta: 'hermes ' });
        super.emit('run.completed', { output: 'hermes socket', session_id: value.session_id, id: 'hermes-response-1', usage: { input_tokens: 6, output_tokens: 5, total_tokens: 11, cost: 0.11, currency: 'USD' } });
      });
      return true;
    }
    return super.emit(name, value);
  }

  disconnect() {
    this.disconnected = true;
  }
}

async function main() {
  const mock = await startMockServer();
  try {
    const events = [];
    const emit = (event) => events.push(event);
    const openClaw = new OpenClawGatewayProvider({ baseUrl: mock.baseUrl, requestTimeoutMs: 100 });
    const descriptor = await openClaw.describe();
    assert.strictEqual(descriptor.runtimeMode, 'service');
    assert.strictEqual(descriptor.capabilities.interactiveSessions, true);
    assert.strictEqual(descriptor.sessionFeatures.attach, true);
    assert.strictEqual(descriptor.sessionFeatures.abort, true);
    assert.strictEqual(descriptor.sessionFeatures.resume, true);
    assert.strictEqual(descriptor.capabilities.usageEvents, true);

    const session = await openClaw.createSession({ workspacePath: process.cwd() });
    await openClaw.sendMessage({ sessionId: session.sessionId, text: 'first' }, emit);
    await openClaw.sendMessage({ sessionId: session.sessionId, text: 'second' }, emit);
    assert(events.some((event) => event.event === 'message.completed' && event.payload.text === 'hello gateway'));
    const gatewayUsageEvents = events.filter((event) => event.event === 'usage.updated');
    assert.strictEqual(gatewayUsageEvents.length, 2);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.inputTokens, 12);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.outputTokens, 8);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.reasoningTokens, 2);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.cacheReadTokens, 3);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.totalTokens, 22);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.cost, 0.25);
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.currency, 'USD');
    assert.strictEqual(gatewayUsageEvents[0].payload.usage.estimated, false);
    assert.strictEqual(mock.observedSessionIds[0], session.remoteSessionId);
    assert.strictEqual(mock.observedSessionIds[1], session.remoteSessionId);
    const jsonEvents = [];
    await openClaw.sendMessage({ sessionId: session.sessionId, text: 'plain-json' }, (event) => jsonEvents.push(event));
    assert(jsonEvents.some((event) => event.event === 'message.completed' && event.payload.text === 'plain response'));

    const restored = new OpenClawGatewayProvider({ baseUrl: mock.baseUrl });
    const attached = await restored.attachSession({
      sessionId: session.sessionId,
      remoteSessionId: session.remoteSessionId,
      workspacePath: session.workspacePath
    }, () => {});
    assert.strictEqual(attached.remoteSessionId, session.remoteSessionId);

    const authEvents = [];
    const unauthorized = new OpenClawGatewayProvider({ baseUrl: mock.baseUrl, token: 'bad-token', requestTimeoutMs: 100 });
    const unauthorizedSession = await unauthorized.createSession({ workspacePath: process.cwd() });
    await unauthorized.sendMessage({ sessionId: unauthorizedSession.sessionId, text: 'auth' }, (event) => authEvents.push(event));
    assert(authEvents.some((event) => event.event === 'error' && event.payload.failureCategory === 'auth_failed'));

    const slowEvents = [];
    const slowSession = await openClaw.createSession({ workspacePath: process.cwd() });
    const slowRun = openClaw.sendMessage({ sessionId: slowSession.sessionId, text: 'slow' }, (event) => slowEvents.push(event));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const abortResult = await openClaw.abortSession({ sessionId: slowSession.sessionId }, () => {});
    assert.strictEqual(abortResult.status, 'aborted');
    await slowRun;
    assert(slowEvents.some((event) => event.event === 'error' && event.payload.failureCategory === 'aborted'));
    assert.strictEqual(openClaw.inFlight.size, 0);

    const timeoutEvents = [];
    const timeoutProvider = new OpenClawGatewayProvider({ baseUrl: mock.baseUrl, requestTimeoutMs: 30 });
    const timeoutSession = await timeoutProvider.createSession({ workspacePath: process.cwd() });
    await timeoutProvider.sendMessage({ sessionId: timeoutSession.sessionId, text: 'slow timeout' }, (event) => timeoutEvents.push(event));
    assert(timeoutEvents.some((event) => event.event === 'error' && event.payload.failureCategory === 'timeout'));
    assert.strictEqual(timeoutProvider.inFlight.size, 0);

    const sockets = [];
    const hermes = new HermesStudioProvider({
      baseUrl: mock.baseUrl,
      socketFactory: () => {
        const socket = new FakeSocket(false);
        sockets.push(socket);
        return socket;
      }
    });
    const hermesEvents = [];
    const hermesSession = await hermes.createSession({ workspacePath: process.cwd() });
    const hermesDescriptor = await hermes.describe();
    assert.strictEqual(hermesDescriptor.capabilities.usageEvents, true);
    await hermes.sendMessage({ sessionId: hermesSession.sessionId, text: 'socket' }, (event) => hermesEvents.push(event));
    assert(hermesEvents.some((event) => event.event === 'message.completed' && event.payload.text === 'hermes socket'));
    assert.strictEqual(hermesEvents.filter((event) => event.event === 'usage.updated').length, 1);
    assert.strictEqual(hermesEvents.find((event) => event.event === 'usage.updated').payload.usage.totalTokens, 11);
    assert(sockets.every((socket) => socket.disconnected));

    const fallback = new HermesStudioProvider({
      baseUrl: mock.baseUrl,
      socketFactory: () => new FakeSocket(true)
    });
    const fallbackEvents = [];
    const fallbackSession = await fallback.createSession({ workspacePath: process.cwd() });
    await fallback.sendMessage({ sessionId: fallbackSession.sessionId, text: 'fallback' }, (event) => fallbackEvents.push(event));
    assert(fallbackEvents.some((event) => event.event === 'message.completed' && event.payload.text === 'hermes http'));
    assert.strictEqual(fallbackEvents.filter((event) => event.event === 'usage.updated').length, 1);
    assert.strictEqual(mock.observedSessionIds[mock.observedSessionIds.length - 1], fallbackSession.remoteSessionId);
    assert.strictEqual(fallback.inFlight.size, 0);

    const abortHermes = new HermesStudioProvider({
      baseUrl: mock.baseUrl,
      socketFactory: () => new FakeSocket(false, true)
    });
    const abortHermesEvents = [];
    const abortHermesSession = await abortHermes.createSession({ workspacePath: process.cwd() });
    const observedBeforeAbort = mock.observedSessionIds.length;
    const abortHermesRun = abortHermes.sendMessage({ sessionId: abortHermesSession.sessionId, text: 'socket-abort' }, (event) => abortHermesEvents.push(event));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const abortHermesResult = await abortHermes.abortSession({ sessionId: abortHermesSession.sessionId }, () => {});
    assert.strictEqual(abortHermesResult.status, 'aborted');
    await abortHermesRun;
    assert(abortHermesEvents.some((event) => event.event === 'error' && event.payload.failureCategory === 'aborted'));
    assert.strictEqual(mock.observedSessionIds.length, observedBeforeAbort);
    console.log('gateway provider smoke ok');
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
