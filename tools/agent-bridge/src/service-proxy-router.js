'use strict';

const net = require('net');
const tls = require('tls');

const DEFAULT_UPGRADE_TIMEOUT_MS = 30000;

function normalizeRequestHost(value) {
  if (typeof value !== 'string') return '';
  let host = value.trim().toLowerCase();
  if (host.length === 0 || /[\r\n\0/@\\]/.test(host)) return '';
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end < 0) return '';
    const remainder = host.substring(end + 1);
    if (remainder.length > 0 && (!/^:[0-9]+$/.test(remainder) || Number(remainder.substring(1)) > 65535)) return '';
    host = host.substring(1, end);
  } else {
    const firstColon = host.indexOf(':');
    const lastColon = host.lastIndexOf(':');
    if (firstColon >= 0 && firstColon === lastColon) {
      const port = host.substring(firstColon + 1);
      if (!/^[0-9]+$/.test(port) || Number(port) > 65535) return '';
      host = host.substring(0, firstColon);
    }
  }
  while (host.endsWith('.')) host = host.substring(0, host.length - 1);
  return host;
}

function normalizeServiceDomain(value) {
  const domain = normalizeRequestHost(value);
  if (domain.length === 0) return '';
  if (domain.length > 253 || net.isIP(domain) !== 0 || domain.indexOf('.') < 1) return '';
  const labels = domain.split('.');
  if (labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return '';
  return domain;
}

function normalizeRequestAuthority(value, protocol) {
  if (typeof value !== 'string' || value.trim().length === 0 || /[\r\n\0/@\\]/.test(value)) return '';
  const scheme = protocol === 'https:' ? 'https:' : 'http:';
  try {
    const parsed = new URL(scheme + '//' + value.trim());
    const hostname = normalizeRequestHost(parsed.hostname);
    if (hostname.length === 0) return '';
    const displayHost = net.isIP(hostname) === 6 ? '[' + hostname + ']' : hostname;
    const port = parsed.port.length > 0 ? parsed.port : (scheme === 'https:' ? '443' : '80');
    return displayHost + ':' + port;
  } catch (_error) {
    return '';
  }
}

function serviceProxyOriginAllowed(req) {
  const origin = req && req.headers && typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin.length === 0) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_error) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const expectedProtocol = req && req.socket && req.socket.encrypted === true ? 'https:' : 'http:';
  if (parsed.protocol !== expectedProtocol) return false;
  const requestAuthority = normalizeRequestAuthority(req && req.headers ? req.headers.host : '', expectedProtocol);
  const originAuthority = normalizeRequestAuthority(parsed.host, parsed.protocol);
  return requestAuthority.length > 0 && originAuthority === requestAuthority;
}

function sanitizedUpstreamPath(reqUrl, pathname) {
  const search = new URLSearchParams(reqUrl.searchParams);
  search.delete('token');
  search.delete('ownerAgentId');
  search.delete('accessTicket');
  search.delete('serviceTicket');
  return pathname + (search.toString().length > 0 ? '?' + search.toString() : '');
}

function resolveServiceProxyRoute(reqUrl, hostHeader, serviceManager) {
  const domainRoute = serviceManager.resolveProxyDomain(hostHeader);
  if (domainRoute.matched) {
    const pathname = reqUrl.pathname.startsWith('/') && !reqUrl.pathname.startsWith('//') ? reqUrl.pathname : '/';
    return {
      matched: true,
      domainRoute: true,
      serviceId: domainRoute.serviceId,
      ownerAgentId: '',
      upstreamPath: sanitizedUpstreamPath(reqUrl, pathname),
      host: domainRoute.host
    };
  }
  if (reqUrl.pathname !== '/service' && !reqUrl.pathname.startsWith('/service/')) return { matched: false, domainRoute: false };
  const relative = reqUrl.pathname === '/service' ? '' : reqUrl.pathname.substring('/service/'.length);
  const separator = relative.indexOf('/');
  const encodedServiceId = separator >= 0 ? relative.substring(0, separator) : relative;
  let serviceId = '';
  try {
    serviceId = decodeURIComponent(encodedServiceId);
  } catch (_error) {
    return { matched: true, domainRoute: false, ok: false, failureCategory: 'service_id_invalid', message: 'Service id is invalid.' };
  }
  if (serviceId.length === 0 || /[\r\n\0]/.test(serviceId)) {
    return { matched: true, domainRoute: false, ok: false, failureCategory: 'service_id_invalid', message: 'Service id is required.' };
  }
  const suffix = separator >= 0 ? relative.substring(separator) : '/';
  return {
    matched: true,
    domainRoute: false,
    ok: true,
    serviceId,
    ownerAgentId: reqUrl.searchParams.get('ownerAgentId') || '',
    upstreamPath: sanitizedUpstreamPath(reqUrl, suffix),
    host: normalizeRequestHost(hostHeader)
  };
}

function safeHeaderValue(value) {
  return typeof value === 'string' && value.length <= 8192 && !/[\r\n\0]/.test(value) ? value : '';
}

function validateWebSocketUpgradeRequest(req) {
  if (!req || req.method !== 'GET' || !req.headers) return false;
  const upgrade = safeHeaderValue(req.headers.upgrade).toLowerCase();
  const connection = safeHeaderValue(req.headers.connection).toLowerCase().split(',').map((item) => item.trim());
  const version = safeHeaderValue(req.headers['sec-websocket-version']).trim();
  const key = safeHeaderValue(req.headers['sec-websocket-key']).trim();
  if (upgrade !== 'websocket' || !connection.includes('upgrade') || version !== '13' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return false;
  try {
    return Buffer.from(key, 'base64').length === 16;
  } catch (_error) {
    return false;
  }
}

function websocketUpstreamHeaders(req, resolved) {
  const service = resolved.service;
  const headers = {
    Host: '127.0.0.1:' + String(service.port),
    Connection: 'Upgrade',
    Upgrade: 'websocket'
  };
  const forwarded = [
    ['sec-websocket-key', 'Sec-WebSocket-Key'],
    ['sec-websocket-version', 'Sec-WebSocket-Version'],
    ['sec-websocket-protocol', 'Sec-WebSocket-Protocol'],
    ['sec-websocket-extensions', 'Sec-WebSocket-Extensions'],
    ['user-agent', 'User-Agent'],
    ['accept-language', 'Accept-Language']
  ];
  for (const item of forwarded) {
    const value = safeHeaderValue(req && req.headers ? req.headers[item[0]] : '');
    if (value.length > 0) headers[item[1]] = value;
  }
  const upstreamScheme = service.protocol === 'https' ? 'https://' : 'http://';
  headers.Origin = upstreamScheme + '127.0.0.1:' + String(service.port);
  const upstreamAuthorization = safeHeaderValue(resolved.upstreamAuthorization);
  if (upstreamAuthorization.length > 0) headers.Authorization = 'Bearer ' + upstreamAuthorization;
  return headers;
}

function serializeUpgradeRequest(req, requestPath, headers) {
  const method = req && req.method === 'GET' ? 'GET' : 'GET';
  const lines = [method + ' ' + requestPath + ' HTTP/1.1'];
  for (const name of Object.keys(headers)) lines.push(name + ': ' + headers[name]);
  lines.push('', '');
  return lines.join('\r\n');
}

function writeSocketError(socket, status, code, message) {
  if (!socket || socket.destroyed) return;
  const body = JSON.stringify({ ok: false, error: { code, message } });
  socket.write(
    'HTTP/1.1 ' + status + '\r\n' +
    'Content-Type: application/json; charset=utf-8\r\n' +
    'Content-Length: ' + String(Buffer.byteLength(body)) + '\r\n' +
    'Connection: close\r\n\r\n' + body
  );
  socket.destroy();
}

function openUpstreamSocket(service, timeoutMs) {
  const options = {
    host: '127.0.0.1',
    port: service.port
  };
  const socket = service.protocol === 'https'
    ? tls.connect(Object.assign({}, options, { rejectUnauthorized: true }))
    : net.createConnection(options);
  socket.setTimeout(timeoutMs);
  return socket;
}

function proxyWebSocketUpgrade(req, clientSocket, head, resolved, options) {
  const config = options && typeof options === 'object' ? options : {};
  const timeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(100, Math.min(120000, Math.floor(config.timeoutMs)))
    : DEFAULT_UPGRADE_TIMEOUT_MS;
  const upstreamSocket = openUpstreamSocket(resolved.service, timeoutMs);
  let connected = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clientSocket.destroy();
    upstreamSocket.destroy();
    if (typeof config.onClose === 'function') config.onClose(clientSocket, upstreamSocket);
  };
  if (typeof config.onOpen === 'function') config.onOpen(clientSocket, upstreamSocket, close);
  clientSocket.once('error', close);
  clientSocket.once('close', close);
  upstreamSocket.once('timeout', () => {
    if (!connected) writeSocketError(clientSocket, '504 Gateway Timeout', 'service_proxy_timeout', 'Service WebSocket proxy timed out.');
    close();
  });
  upstreamSocket.once('error', (error) => {
    if (!connected) writeSocketError(clientSocket, '502 Bad Gateway', 'service_proxy_failed', error instanceof Error ? error.message : String(error));
    close();
  });
  upstreamSocket.once('close', close);
  const connectEvent = resolved.service.protocol === 'https' ? 'secureConnect' : 'connect';
  upstreamSocket.once(connectEvent, () => {
    if (closed || clientSocket.destroyed) {
      close();
      return;
    }
    connected = true;
    upstreamSocket.setTimeout(0);
    upstreamSocket.write(serializeUpgradeRequest(req, resolved.target.path, websocketUpstreamHeaders(req, resolved)));
    if (Buffer.isBuffer(head) && head.length > 0) upstreamSocket.write(head);
    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);
  });
  return { ok: true, upstreamSocket, close };
}

module.exports = {
  DEFAULT_UPGRADE_TIMEOUT_MS,
  normalizeRequestHost,
  normalizeRequestAuthority,
  normalizeServiceDomain,
  proxyWebSocketUpgrade,
  resolveServiceProxyRoute,
  sanitizedUpstreamPath,
  serviceProxyOriginAllowed,
  validateWebSocketUpgradeRequest,
  websocketUpstreamHeaders
};
