'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { createConfig } = require('./config');
const { ProviderRegistry } = require('./provider-registry');
const { MockProvider } = require('./providers/mock-provider');
const { OpenCodeProvider } = require('./providers/opencode-provider');
const {
  createCodexProvider,
  createClaudeProvider,
  createAntigravityProvider
} = require('./providers/cli-provider');
const {
  PROTOCOL_VERSION,
  RequestType,
  EventType,
  makeResponse,
  makeErrorResponse,
  makeEvent,
  parseClientMessage,
  readString
} = require('./protocol');
const { acceptWebSocket } = require('./websocket');
const { WorkspaceService } = require('./workspace-service');
const { createTerminalLogger } = require('./terminal-log');

const config = createConfig();
const registry = new ProviderRegistry();
registry.register(new MockProvider());
registry.register(new OpenCodeProvider(config.openCode));
registry.register(new OpenCodeProvider(config.devEco));
registry.register(new OpenCodeProvider(config.mimoCode));
registry.register(createCodexProvider(config.codex));
registry.register(createClaudeProvider(config.claude));
registry.register(createAntigravityProvider(config.antigravity));
const workspaceService = new WorkspaceService(registry);
const serverLogger = createTerminalLogger('bridge.server');
const wsLogger = createTerminalLogger('bridge.ws');
const requestLogger = createTerminalLogger('bridge.request');
let activeConnections = 0;
let serverShuttingDown = false;

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function remoteAddressFromSocket(socket) {
  if (!socket) {
    return '';
  }
  const address = typeof socket.remoteAddress === 'string' ? socket.remoteAddress : '';
  const port = typeof socket.remotePort === 'number' && socket.remotePort > 0 ? ':' + String(socket.remotePort) : '';
  return address + port;
}

function remoteAddressFromRequest(req) {
  return remoteAddressFromSocket(req && req.socket ? req.socket : null);
}

function sendFileDownload(res, item) {
  const stat = require('fs').statSync(item.absolutePath);
  const fileName = require('path').basename(item.path);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fileName) + '"'
  });
  require('fs').createReadStream(item.absolutePath).pipe(res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) {
        resolve(null);
        return;
      }
      const contentType = req.headers['content-type'] || '';
      if (typeof contentType === 'string' && contentType.indexOf('application/json') >= 0) {
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error('Invalid JSON body: ' + (error instanceof Error ? error.message : String(error))));
        }
        return;
      }
      resolve(text);
    });
    req.on('error', reject);
  });
}

function queryObjectFromUrl(reqUrl) {
  const query = {};
  for (const key of reqUrl.searchParams.keys()) {
    if (key === 'token') {
      continue;
    }
    const values = reqUrl.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] || '');
  }
  return query;
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (typeof header !== 'string') {
    return '';
  }
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return '';
  }
  return header.slice(prefix.length);
}

function isAuthorized(req, reqUrl) {
  const bearerToken = readBearerToken(req);
  const queryToken = reqUrl.searchParams.get('token') || '';
  const candidate = bearerToken.length > 0 ? bearerToken : queryToken;
  if (candidate.length === 0) {
    return false;
  }
  return timingSafeEquals(candidate, config.token);
}

async function buildCapabilities() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    providers: await registry.listCapabilities(),
    requestTypes: Object.values(RequestType),
    eventTypes: Object.values(EventType)
  };
}

async function handleHttpRequest(req, res) {
  const reqUrl = new URL(req.url || '/', 'http://' + (req.headers.host || config.host));

  if (req.method === 'GET' && reqUrl.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      uptimeSec: Math.floor(process.uptime())
    });
    return;
  }

  if (!isAuthorized(req, reqUrl)) {
    requestLogger.warn('http.unauthorized', {
      method: req.method || 'GET',
      path: reqUrl.pathname,
      remote: remoteAddressFromRequest(req)
    });
    sendJson(res, 401, {
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'A valid bearer token is required.'
      }
    });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/capabilities') {
    sendJson(res, 200, await buildCapabilities());
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/sessions') {
    const providerId = reqUrl.searchParams.get('providerId') || '';
    sendJson(res, 200, {
      protocolVersion: PROTOCOL_VERSION,
      sessions: await registry.listSessions(providerId)
    });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/session-messages') {
    const sessionId = reqUrl.searchParams.get('sessionId') || '';
    try {
      const messages = await registry.listSessionMessages(sessionId);
      const toolCalls = await registry.listSessionToolCalls(sessionId);
      sendJson(res, 200, {
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        messages,
        toolCalls
      });
    } catch (error) {
      sendJson(res, 404, {
        ok: false,
        error: {
          code: 'session_not_found',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/preview') {
    const sessionId = reqUrl.searchParams.get('sessionId') || '';
    const path = reqUrl.searchParams.get('path') || '';
    try {
      const match = registry.findSession(sessionId);
      if (!match) {
        sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found.' } });
        return;
      }
      const preview = await match.provider.getPreview({ sessionId, path });
      sendJson(res, 200, preview);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'preview_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname.startsWith('/download/')) {
    const token = decodeURIComponent(reqUrl.pathname.substring('/download/'.length));
    const item = workspaceService.consumeDownloadToken(token);
    if (!item) {
      sendJson(res, 404, {
        ok: false,
        error: {
          code: 'download_not_found',
          message: 'Download token is invalid or expired.'
        }
      });
      return;
    }
    try {
      sendFileDownload(res, item);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'download_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (reqUrl.pathname === '/opencode' || reqUrl.pathname.startsWith('/opencode/')) {
    const path = reqUrl.pathname === '/opencode' ? '/' : reqUrl.pathname.substring('/opencode'.length);
    try {
      const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readRequestBody(req);
      const result = await registry.proxyOpenCodeRequest({
        method: req.method || 'GET',
        path,
        query: queryObjectFromUrl(reqUrl),
        body,
        accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json'
      });
      sendJson(res, 200, {
        protocolVersion: PROTOCOL_VERSION,
        providerId: 'opencode',
        result
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: {
          code: 'opencode_request_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: {
      code: 'not_found',
      message: 'Route not found.'
    }
  });
}

async function handleClientMessage(rawText, connection) {
  const parsed = parseClientMessage(rawText);
  if (!parsed.ok) {
    connection.sendJson(makeErrorResponse('', 'invalid_json', parsed.error));
    return;
  }

  const message = parsed.value;
  const id = typeof message.id === 'string' ? message.id : '';
  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};

  try {
    if (message.type === RequestType.CAPABILITIES_GET) {
      connection.sendJson(makeResponse(id, await buildCapabilities()));
      return;
    }

    if (message.type === RequestType.SESSION_CREATE) {
      const providerId = readString(payload, 'providerId', 'mock');
      const provider = registry.resolve(providerId);
      const session = await provider.createSession(payload);
      requestLogger.info('session.created', {
        requestId: id,
        providerId,
        sessionId: session.sessionId,
        workspacePath: readString(payload, 'workspacePath', ''),
        workspaceTitle: readString(payload, 'workspaceTitle', '')
      });
      connection.sendJson(makeResponse(id, { session }));
      connection.sendJson(makeEvent(EventType.SESSION_CREATED, session.sessionId, { session }));
      return;
    }

    if (message.type === RequestType.SESSION_LIST) {
      const providerId = readString(payload, 'providerId', '');
      connection.sendJson(makeResponse(id, {
        providerId,
        sessions: await registry.listSessions(providerId)
      }));
      return;
    }

    if (message.type === RequestType.SESSION_MESSAGES) {
      const sessionId = readString(payload, 'sessionId', '');
      const messages = await registry.listSessionMessages(sessionId);
      const toolCalls = await registry.listSessionToolCalls(sessionId);
      const match = registry.findSession(sessionId);
      requestLogger.info('session.messages.loaded', {
        requestId: id,
        sessionId,
        providerId: match ? match.provider.id : '',
        messageCount: messages.length,
        toolCallCount: toolCalls.length
      });
      connection.sendJson(makeResponse(id, { sessionId, messages, toolCalls }));
      connection.sendJson(makeEvent(EventType.SESSION_MESSAGES, sessionId, { sessionId, messages, toolCalls }));
      return;
    }

    if (message.type === RequestType.SESSION_REVERT) {
      const sessionId = readString(payload, 'sessionId', '');
      const result = await registry.revertSession(payload, (event) => connection.sendJson(event));
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.MESSAGE_SEND) {
      const sessionId = readString(payload, 'sessionId', '');
      const match = registry.findSession(sessionId);
      if (!match) {
        connection.sendJson(makeErrorResponse(id, 'session_not_found', 'Session not found.'));
        return;
      }
      requestLogger.info('message.accepted', {
        requestId: id,
        sessionId,
        providerId: match.provider.id,
        modelId: readString(payload, 'modelId', ''),
        interactionMode: readString(payload, 'interactionMode', readString(payload, 'runMode', ''))
      });
      connection.sendJson(makeResponse(id, { accepted: true }));
      await match.provider.sendMessage(payload, (event) => connection.sendJson(event));
      requestLogger.info('message.completed', {
        requestId: id,
        sessionId,
        providerId: match.provider.id
      });
      return;
    }

    if (message.type === RequestType.PREVIEW_GET) {
      const sessionId = readString(payload, 'sessionId', '');
      const match = registry.findSession(sessionId);
      if (!match) {
        connection.sendJson(makeErrorResponse(id, 'session_not_found', 'Session not found.'));
        return;
      }
      const preview = await match.provider.getPreview(payload);
      connection.sendJson(makeResponse(id, { preview }));
      connection.sendJson(makeEvent(EventType.PREVIEW_UPDATED, sessionId, { preview }));
      return;
    }

    if (message.type === RequestType.PERMISSION_RESPOND) {
      const result = await registry.respondPermission(payload);
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.REQUEST_RESPOND) {
      const result = await registry.respondRequest(payload, (event) => connection.sendJson(event));
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.PLAN_RESPOND) {
      const result = await registry.respondPlan(payload, (event) => connection.sendJson(event));
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.OPENCODE_REQUEST) {
      const result = await registry.proxyOpenCodeRequest(payload);
      const providerId = readString(payload, 'providerId', 'opencode');
      connection.sendJson(makeResponse(id, { providerId, result }));
      return;
    }

    if (message.type === RequestType.WORKSPACE_CHANGES_GET) {
      const result = await workspaceService.getChanges(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_DIFF_GET) {
      const result = await workspaceService.getDiff(payload);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILES_LIST) {
      const result = await workspaceService.listFiles(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_FILES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILE_GET) {
      const result = await workspaceService.getFile(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, { preview: result }));
      connection.sendJson(makeEvent(EventType.PREVIEW_UPDATED, sessionId, { preview: result }));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILE_DOWNLOAD) {
      const result = await workspaceService.prepareDownload(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.FILE_DOWNLOAD_READY, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_STAGE) {
      const result = await workspaceService.stage(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_UNSTAGE) {
      const result = await workspaceService.unstage(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_DISCARD) {
      const result = await workspaceService.discard(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_COMMIT) {
      const result = await workspaceService.commit(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    connection.sendJson(makeErrorResponse(id, 'unsupported_type', 'Unsupported message type: ' + message.type));
  } catch (error) {
    requestLogger.error('request.failed', {
      requestId: id,
      type: message.type,
      error: error instanceof Error ? error.message : String(error)
    });
    connection.sendJson(makeErrorResponse(id, 'request_failed', error instanceof Error ? error.message : String(error)));
  }
}

function handleUpgrade(req, socket, head) {
  const reqUrl = new URL(req.url || '/', 'http://' + (req.headers.host || config.host));
  if (reqUrl.pathname !== '/ws') {
    wsLogger.warn('upgrade.rejected', {
      reason: 'invalid_path',
      path: reqUrl.pathname,
      remote: remoteAddressFromSocket(socket)
    });
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!isAuthorized(req, reqUrl)) {
    wsLogger.warn('upgrade.rejected', {
      reason: 'unauthorized',
      path: reqUrl.pathname,
      remote: remoteAddressFromSocket(socket)
    });
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  acceptWebSocket(req, socket, head, {
    onOpen(connection) {
      const connectionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      activeConnections += 1;
      connection.connectionId = connectionId;
      connection.remoteAddress = remoteAddressFromRequest(req);
      connection.connectedAt = Date.now();
      wsLogger.ready('client.connected', {
        connectionId,
        remote: connection.remoteAddress,
        activeConnections
      });
      connection.providerCleanup = registry.subscribeEvents(connectionId, (event) => {
        connection.sendJson(event);
      });
      buildCapabilities()
        .then((capabilities) => {
          connection.sendJson(makeEvent(EventType.BRIDGE_CONNECTED, '', capabilities));
          wsLogger.info('bridge.connected', {
            connectionId,
            providers: Array.isArray(capabilities.providers) ? capabilities.providers.length : 0,
            protocolVersion: capabilities.protocolVersion
          });
        })
        .catch((error) => {
          wsLogger.error('bridge.connected_failed', {
            connectionId,
            error: error instanceof Error ? error.message : String(error)
          });
          connection.sendJson(makeErrorResponse('', 'capabilities_failed', error instanceof Error ? error.message : String(error)));
        });
    },
    onMessage(rawText, connection) {
      void handleClientMessage(rawText, connection);
    },
    onClose(connection) {
      if (connection && typeof connection.providerCleanup === 'function') {
        connection.providerCleanup();
        connection.providerCleanup = null;
      }
      if (activeConnections > 0) {
        activeConnections -= 1;
      }
      wsLogger.info('client.disconnected', {
        connectionId: connection && connection.connectionId ? connection.connectionId : '',
        remote: connection && connection.remoteAddress ? connection.remoteAddress : '',
        activeConnections,
        durationMs: connection && typeof connection.connectedAt === 'number' ? Date.now() - connection.connectedAt : ''
      });
    }
  });
}

const server = http.createServer(handleHttpRequest);
server.on('upgrade', handleUpgrade);
server.on('close', () => {
  serverLogger.info('shutdown.complete', {
    activeConnections
  });
});

function requestServerShutdown(signalName) {
  if (serverShuttingDown) {
    return;
  }
  serverShuttingDown = true;
  serverLogger.warn('shutdown.requested', {
    signal: signalName,
    activeConnections
  });
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  requestServerShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  requestServerShutdown('SIGTERM');
});

server.listen(config.port, config.host, () => {
  serverLogger.ready('listening', {
    bindUrl: 'http://' + config.host + ':' + config.port,
    protocolVersion: config.protocolVersion,
    providers: registry.providers.size
  });
  if (config.tokenGenerated) {
    serverLogger.warn('token.generated', {
      envName: 'AGENT_BRIDGE_TOKEN',
      token: config.token
    });
  }
});
