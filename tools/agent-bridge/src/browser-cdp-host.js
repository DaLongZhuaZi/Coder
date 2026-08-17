'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const { RawWebSocketClient } = require('./websocket-client');

const CDP_HTTP_TIMEOUT_MS = 10000;
const CDP_COMMAND_TIMEOUT_MS = 15000;
const CDP_MAX_HTTP_BYTES = 4 * 1024 * 1024;
const CDP_MAX_SCREENSHOT_BASE64 = 16 * 1024 * 1024;
const CDP_MAX_SNAPSHOT_NODES = 5000;
const CDP_MAX_LOG_ENTRIES = 1000;
const CDP_ELEMENT_STABILITY_DELAY_MS = 25;
const CDP_ELEMENT_STABILITY_ATTEMPTS = 3;
const CDP_MAX_PUBLIC_DOWNLOAD_URL_LENGTH = 4096;
const CDP_DOWNLOAD_DIRECTORY_MARKER = '.agent-bridge-downloads';

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function sanitizePublicDownloadUrl(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (source.length === 0 || /[\r\n\0]/.test(source)) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch (_error) {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  parsed.username = '';
  parsed.password = '';
  const normalized = parsed.toString();
  return Buffer.byteLength(normalized, 'utf8') <= CDP_MAX_PUBLIC_DOWNLOAD_URL_LENGTH ? normalized : '';
}

function failure(code, message, remediation) {
  return { ok: false, error: { code, message, remediation: remediation || '' } };
}

function isLoopbackHost(value) {
  const host = String(value || '').trim().toLowerCase();
  return host === 'localhost' || host === '::1' || net.isIP(host) === 4 && host.startsWith('127.');
}

function effectivePort(parsed) {
  if (parsed.port) return parsed.port;
  return parsed.protocol === 'http:' || parsed.protocol === 'ws:' ? '80' : '443';
}

function validateCdpBaseUrl(value, allowRemote) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error('CDP endpoint must be a valid HTTP(S) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('CDP endpoint must use HTTP(S).');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('CDP endpoint must not contain credentials, query, or fragment.');
  const host = parsed.hostname.toLowerCase();
  const loopback = isLoopbackHost(host);
  if (!loopback && allowRemote !== true) throw new Error('Remote CDP endpoints are disabled; use a loopback debugging endpoint.');
  if (!loopback && parsed.protocol !== 'https:') throw new Error('Remote CDP endpoints require HTTPS.');
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed;
}

function validateDebuggerWebSocketUrl(baseEndpoint, debuggerUrl, allowRemote) {
  const baseText = baseEndpoint instanceof URL ? baseEndpoint.toString() : String(baseEndpoint || '');
  const base = validateCdpBaseUrl(baseText, allowRemote);
  let parsed;
  try {
    parsed = new URL(String(debuggerUrl || ''));
  } catch (_error) {
    throw new Error('CDP debugger URL must be a valid WebSocket URL.');
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('CDP debugger URL must use WS(S).');
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error('CDP debugger URL must not contain credentials or a fragment.');
  }
  const baseHost = base.hostname.toLowerCase();
  const debuggerHost = parsed.hostname.toLowerCase();
  const debuggerLoopback = isLoopbackHost(debuggerHost);
  if (!debuggerLoopback && allowRemote !== true) {
    throw new Error('Remote CDP debugger targets are disabled.');
  }
  if (debuggerHost !== baseHost) {
    throw new Error('CDP debugger URL host does not match the verified endpoint.');
  }
  if (effectivePort(parsed) !== effectivePort(base)) {
    throw new Error('CDP debugger URL port does not match the verified endpoint.');
  }
  if (base.protocol === 'https:' && parsed.protocol !== 'wss:') {
    throw new Error('HTTPS CDP endpoints require secure WSS debugger URLs.');
  }
  if (!debuggerLoopback && parsed.protocol !== 'wss:') {
    throw new Error('Remote CDP debugger targets require WSS.');
  }
  return parsed;
}

function httpJson(baseUrl, method, pathname, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const client = target.protocol === 'https:' ? https : http;
    const request = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method,
      timeout: timeoutMs || CDP_HTTP_TIMEOUT_MS,
      headers: { Accept: 'application/json', Connection: 'close' },
      rejectUnauthorized: true
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > CDP_MAX_HTTP_BYTES) {
          request.destroy(new Error('CDP HTTP response exceeded the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error('CDP HTTP request returned ' + String(response.statusCode || 0) + '.'));
          return;
        }
        try {
          resolve(text.length > 0 ? JSON.parse(text) : {});
        } catch (_error) {
          reject(new Error('CDP HTTP response was not valid JSON.'));
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('CDP HTTP request timed out.')));
    request.once('error', reject);
    request.end();
  });
}

class CdpSession {
  constructor(webSocketUrl, pageId) {
    this.webSocketUrl = webSocketUrl;
    this.pageId = pageId;
    this.client = null;
    this.nextId = 1;
    this.pending = new Map();
    this.logs = [];
    this.refs = new Map();
    this.downloads = new Map();
    this.dialogs = [];
  }

  async connect() {
    if (this.client && this.client.isOpen) return this;
    const client = new RawWebSocketClient(this.webSocketUrl, { reconnect: false, maxMessageBytes: 32 * 1024 * 1024 });
    client.on('text', (text) => this.handleText(text));
    client.on('close', () => this.rejectAll(new Error('CDP page connection closed.')));
    client.on('error', (error) => this.rejectAll(error));
    await client.connect();
    this.client = client;
    await Promise.all([
      this.send('Runtime.enable', {}).catch(() => ({})),
      this.send('Log.enable', {}).catch(() => ({})),
      this.send('Network.enable', {}).catch(() => ({})),
      this.send('Page.enable', {}).catch(() => ({})),
      this.send('DOM.enable', {}).catch(() => ({}))
    ]);
    return this;
  }

  handleText(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (_error) {
      return;
    }
    if (Number.isInteger(message.id)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(readString(message.error, 'message', 'CDP command failed.')));
      else pending.resolve(message.result || {});
      return;
    }
    if (typeof message.method === 'string') this.captureEvent(message.method, message.params || {});
  }

  captureEvent(method, params) {
    if (method === 'Page.javascriptDialogOpening') {
      const type = readString(params, 'type', 'alert');
      const dialog = {
        type,
        message: readString(params, 'message', '').slice(0, 1024),
        defaultPrompt: readString(params, 'defaultPrompt', '').slice(0, 1024),
        handledAt: new Date().toISOString(),
        accepted: type === 'alert'
      };
      this.dialogs.push(dialog);
      if (this.dialogs.length > 100) this.dialogs.shift();
      this.send('Page.handleJavaScriptDialog', { accept: dialog.accepted, promptText: '' }).catch(() => ({}));
      return;
    }
    if (method === 'Browser.downloadWillBegin') {
      const guid = readString(params, 'guid', '');
      if (guid) this.downloads.set(guid, {
        guid,
        url: readString(params, 'url', ''),
        suggestedFilename: readString(params, 'suggestedFilename', ''),
        state: 'in_progress',
        totalBytes: 0,
        receivedBytes: 0,
        filePath: '',
        updatedAt: new Date().toISOString()
      });
      return;
    }
    if (method === 'Browser.downloadProgress') {
      const guid = readString(params, 'guid', '');
      const existing = this.downloads.get(guid) || { guid, url: '', suggestedFilename: '', state: '', totalBytes: 0, receivedBytes: 0, filePath: '', updatedAt: '' };
      existing.state = readString(params, 'state', existing.state);
      existing.totalBytes = Number.isFinite(params.totalBytes) ? params.totalBytes : existing.totalBytes;
      existing.receivedBytes = Number.isFinite(params.receivedBytes) ? params.receivedBytes : existing.receivedBytes;
      existing.filePath = readString(params, 'filePath', existing.filePath);
      existing.updatedAt = new Date().toISOString();
      if (guid) this.downloads.set(guid, existing);
      return;
    }
    if (method !== 'Runtime.consoleAPICalled' && method !== 'Log.entryAdded' && method !== 'Network.loadingFinished' && method !== 'Network.loadingFailed') return;
    const entry = { method, occurredAt: new Date().toISOString() };
    if (method === 'Runtime.consoleAPICalled') {
      entry.type = readString(params, 'type', 'log');
      entry.text = Array.isArray(params.args) ? params.args.map((item) => readString(item, 'value', readString(item, 'description', ''))).join(' ').slice(0, 4096) : '';
    } else if (method === 'Log.entryAdded') {
      entry.type = params.entry ? readString(params.entry, 'level', 'log') : 'log';
      entry.text = params.entry ? readString(params.entry, 'text', '').slice(0, 4096) : '';
    } else {
      entry.requestId = readString(params, 'requestId', '');
      entry.encodedDataLength = Number.isFinite(params.encodedDataLength) ? params.encodedDataLength : 0;
      entry.errorText = readString(params, 'errorText', '');
    }
    this.logs.push(entry);
    if (this.logs.length > CDP_MAX_LOG_ENTRIES) this.logs.splice(0, this.logs.length - CDP_MAX_LOG_ENTRIES);
  }

  send(method, params, timeoutMs) {
    if (!this.client || !this.client.isOpen) return Promise.reject(new Error('CDP page is not connected.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP command timed out: ' + method));
      }, timeoutMs || CDP_COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.client.sendJson({ id, method, params: params || {} });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error instanceof Error ? error : new Error('CDP connection failed.'));
    }
    this.pending.clear();
  }

  close() {
    if (this.client) this.client.close(1000, 'cdp session closed');
    this.client = null;
    this.rejectAll(new Error('CDP session closed.'));
  }

  takeDialogs() {
    const items = this.dialogs.slice();
    this.dialogs = [];
    return items;
  }
}

class BrowserCdpHost {
  constructor(options) {
    const source = options && typeof options === 'object' ? options : {};
    this.bridgeUrl = new URL(readString(source, 'bridgeUrl', 'http://127.0.0.1:8787'));
    this.bridgeToken = readString(source, 'bridgeToken', '');
    this.hostId = readString(source, 'hostId', 'cdp-' + crypto.randomBytes(8).toString('hex'));
    this.label = readString(source, 'label', 'Chromium CDP');
    this.workspaceIds = Array.isArray(source.workspaceIds) ? source.workspaceIds.filter((item) => typeof item === 'string' && item.length > 0) : [];
    this.allowRemoteCdp = source.allowRemoteCdp === true;
    this.cdpBaseUrl = validateCdpBaseUrl(readString(source, 'cdpUrl', 'http://127.0.0.1:9222'), this.allowRemoteCdp);
    this.bridgeClient = null;
    this.sessions = new Map();
    this.stopped = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  supportedCommands() {
    return [
      'instance.list', 'instance.create', 'instance.close', 'page.list', 'page.create', 'page.close',
      'page.navigate', 'page.snapshot', 'page.screenshot', 'page.logs', 'page.wait', 'page.action', 'download.list'
    ];
  }

  supportedActions() {
    return ['click', 'fill', 'type', 'keypress', 'hover', 'select', 'drag', 'upload', 'scroll', 'download', 'evaluate'];
  }

  bridgeWebSocketUrl() {
    const protocol = this.bridgeUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(this.bridgeUrl.toString());
    url.protocol = protocol;
    url.pathname = '/ws';
    url.search = '';
    url.searchParams.set('clientId', this.hostId);
    url.searchParams.set('appNonce', crypto.randomBytes(24).toString('base64url'));
    return url.toString();
  }

  async start() {
    if (this.workspaceIds.length === 0) throw new Error('At least one workspace id is required for the CDP browser host.');
    if (!this.bridgeToken) throw new Error('Bridge token is required for the CDP browser host.');
    await httpJson(this.cdpBaseUrl, 'GET', '/json/version', CDP_HTTP_TIMEOUT_MS);
    await this.connectBridge();
    return this;
  }

  // Each connection attempt builds a fresh WebSocket URL with a new appNonce.
  // Reusing a URL across reconnects would be rejected as nonce_replay for the
  // replay TTL (the same class of defect the App had before the R161 fix).
  async connectBridge() {
    if (this.stopped) return null;
    const client = new RawWebSocketClient(this.bridgeWebSocketUrl(), {
      reconnect: false,
      origin: this.bridgeUrl.origin,
      headers: { Authorization: 'Bearer ' + this.bridgeToken }
    });
    client.on('open', () => {
      this.reconnectAttempts = 0;
      this.register();
    });
    client.on('text', (text) => this.handleBridgeText(text));
    client.on('close', () => this.scheduleBridgeReconnect());
    client.on('error', (error) => {
      if (!this.stopped) process.stderr.write('Browser CDP host connection error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    });
    this.bridgeClient = client;
    try {
      await client.connect();
    } catch (_error) {
      this.scheduleBridgeReconnect();
      return null;
    }
    return client;
  }

  scheduleBridgeReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.reconnectAttempts += 1;
    const base = Math.min(10000, 250 * Math.pow(2, Math.min(6, this.reconnectAttempts - 1)));
    const jitter = base > 0 ? Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.2))) : 0;
    const delay = Math.min(10000, base + jitter);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectBridge().catch(() => { /* scheduleBridgeReconnect inside */ });
    }, delay);
    // The timer is intentionally kept referenced: this is a long-running CLI
    // process and an unref'd retry timer would let the event loop drain while
    // the Bridge is temporarily unavailable.
  }

  register() {
    if (!this.bridgeClient || !this.bridgeClient.isOpen) return;
    this.bridgeClient.sendJson({
      id: 'browser-host-register-' + String(Date.now()),
      type: 'browser.host.register',
      payload: {
        hostId: this.hostId,
        label: this.label,
        platform: process.platform + '-cdp',
        hostKind: 'cdp',
        runtime: 'chromium',
        capabilitySource: 'cdp',
        readiness: 'ready',
        supportedPlatforms: [process.platform],
        workspaceIds: this.workspaceIds,
        supportedCommands: this.supportedCommands(),
        supportedActions: this.supportedActions()
      }
    });
  }

  async handleBridgeText(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (_error) {
      return;
    }
    if (message.type !== 'browser.host.command' || !message.payload) return;
    const command = message.payload;
    let response;
    try {
      const result = await this.execute(command.command, command.payload || {});
      response = { commandId: command.commandId, ok: true, result };
    } catch (error) {
      response = {
        commandId: command.commandId,
        ok: false,
        error: {
          code: error && typeof error.code === 'string' ? error.code : 'browser_cdp_failed',
          message: error instanceof Error ? error.message : String(error),
          remediation: 'Check the Chromium remote debugging endpoint and page state.'
        }
      };
    }
    if (this.bridgeClient && this.bridgeClient.isOpen) {
      this.bridgeClient.sendJson({ id: 'browser-host-result-' + command.commandId, type: 'browser.host.result', payload: response });
    }
  }

  async targets() {
    const targets = await httpJson(this.cdpBaseUrl, 'GET', '/json/list', CDP_HTTP_TIMEOUT_MS);
    return Array.isArray(targets) ? targets.filter((target) => target && target.type === 'page') : [];
  }

  publicPage(target) {
    return {
      pageId: readString(target, 'id', ''),
      title: readString(target, 'title', ''),
      url: readString(target, 'url', ''),
      type: readString(target, 'type', 'page')
    };
  }

  async session(pageId) {
    const existing = this.sessions.get(pageId);
    if (existing) return existing.connect();
    const target = (await this.targets()).find((item) => readString(item, 'id', '') === pageId);
    const debuggerUrl = target ? readString(target, 'webSocketDebuggerUrl', '') : '';
    if (!target || debuggerUrl.length === 0) throw new Error('Browser page was not found.');
    const validatedDebuggerUrl = validateDebuggerWebSocketUrl(
      this.cdpBaseUrl,
      debuggerUrl,
      this.allowRemoteCdp
    );
    const session = new CdpSession(validatedDebuggerUrl.toString(), pageId);
    this.sessions.set(pageId, session);
    return session.connect();
  }

  async createPage(url) {
    const target = await httpJson(this.cdpBaseUrl, 'PUT', '/json/new?' + encodeURIComponent(url || 'about:blank'), CDP_HTTP_TIMEOUT_MS);
    return this.publicPage(target);
  }

  async closePage(pageId) {
    const session = this.sessions.get(pageId);
    if (session) session.close();
    this.sessions.delete(pageId);
    await httpJson(this.cdpBaseUrl, 'GET', '/json/close/' + encodeURIComponent(pageId), CDP_HTTP_TIMEOUT_MS);
    return { pageId, closed: true };
  }

  async snapshot(pageId) {
    const session = await this.session(pageId);
    const result = await session.send('Accessibility.getFullAXTree', {});
    const nodes = Array.isArray(result.nodes) ? result.nodes.slice(0, CDP_MAX_SNAPSHOT_NODES) : [];
    session.refs.clear();
    const lines = [];
    let refIndex = 0;
    for (const node of nodes) {
      const role = node.role && typeof node.role.value === 'string' ? node.role.value : 'node';
      const name = node.name && typeof node.name.value === 'string' ? node.name.value.replace(/[\r\n]+/g, ' ').slice(0, 512) : '';
      const backendNodeId = Number.isInteger(node.backendDOMNodeId) ? node.backendDOMNodeId : 0;
      let ref = '';
      if (backendNodeId > 0) {
        refIndex += 1;
        ref = '@e' + String(refIndex);
        session.refs.set(ref, backendNodeId);
      }
      lines.push(role + (name ? ' "' + name.replace(/"/g, '\\"') + '"' : '') + (ref ? ' [ref=' + ref + ']' : ''));
    }
    return { snapshot: { text: lines.join('\n'), nodeCount: nodes.length, truncated: Array.isArray(result.nodes) && result.nodes.length > nodes.length } };
  }

  backendNodeId(session, ref) {
    const id = session.refs.get(ref);
    if (!Number.isInteger(id)) {
      const error = new Error('Browser element ref is stale or unknown; take a new snapshot.');
      error.code = 'browser_stale_ref';
      throw error;
    }
    return id;
  }

  async elementReadiness(session, backendNodeId) {
    let resolved;
    try {
      resolved = await session.send('DOM.resolveNode', { backendNodeId });
    } catch (error) {
      const readinessError = error instanceof Error ? error : new Error('Browser element could not be resolved.');
      readinessError.code = 'browser_stale_ref';
      throw readinessError;
    }
    const objectId = resolved.object && typeof resolved.object.objectId === 'string' ? resolved.object.objectId : '';
    if (!objectId) {
      const error = new Error('Browser element ref is stale or unknown; take a new snapshot.');
      error.code = 'browser_stale_ref';
      throw error;
    }
    let evaluated;
    try {
      evaluated = await session.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: "function(){var r=this.getBoundingClientRect();var s=window.getComputedStyle(this);var hidden=s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0;var disabled=!!this.disabled||this.getAttribute('aria-disabled')==='true';return {visible:!hidden&&r.width>0&&r.height>0,enabled:!disabled};}",
        returnByValue: true
      });
    } catch (error) {
      const readinessError = error instanceof Error ? error : new Error('Browser element readiness could not be verified.');
      readinessError.code = 'browser_element_not_ready';
      throw readinessError;
    }
    const value = evaluated.result && evaluated.result.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { visible: true, enabled: true };
    return {
      visible: value.visible !== false,
      enabled: value.enabled !== false
    };
  }

  async elementBox(session, ref) {
    const backendNodeId = this.backendNodeId(session, ref);
    let previous = null;
    for (let attempt = 0; attempt < CDP_ELEMENT_STABILITY_ATTEMPTS; attempt += 1) {
      const result = await session.send('DOM.getBoxModel', { backendNodeId });
      const quad = result.model && Array.isArray(result.model.content) ? result.model.content : [];
      if (quad.length < 8 || quad.some((value) => !Number.isFinite(value))) {
        const error = new Error('Browser element has no actionable box.');
        error.code = 'browser_element_not_visible';
        throw error;
      }
      const box = {
        x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
        y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
        width: Math.max(Math.abs(quad[2] - quad[0]), Math.abs(quad[4] - quad[6])),
        height: Math.max(Math.abs(quad[5] - quad[1]), Math.abs(quad[7] - quad[3])),
        backendNodeId
      };
      const readiness = await this.elementReadiness(session, backendNodeId);
      if (!readiness.visible) {
        const error = new Error('Browser element is not visible.');
        error.code = 'browser_element_not_visible';
        throw error;
      }
      if (!readiness.enabled) {
        const error = new Error('Browser element is disabled.');
        error.code = 'browser_element_disabled';
        throw error;
      }
      if (previous && Math.abs(previous.x - box.x) <= 0.5 && Math.abs(previous.y - box.y) <= 0.5 && Math.abs(previous.width - box.width) <= 0.5 && Math.abs(previous.height - box.height) <= 0.5) return box;
      previous = box;
      await new Promise((resolve) => setTimeout(resolve, CDP_ELEMENT_STABILITY_DELAY_MS));
    }
    const error = new Error('Browser element layout is still changing.');
    error.code = 'browser_element_unstable';
    throw error;
  }

  async elementCenter(session, ref) {
    return this.elementBox(session, ref);
  }

  async focusRef(session, ref) {
    const box = await this.elementBox(session, ref);
    const backendNodeId = box.backendNodeId;
    await session.send('DOM.focus', { backendNodeId });
    return backendNodeId;
  }

  async pageAction(payload) {
    const pageId = readString(payload, 'pageId', '');
    const action = readString(payload, 'action', '');
    const ref = readString(payload, 'ref', '');
    const session = await this.session(pageId);
    if (action === 'click' || action === 'hover') {
      const point = await this.elementCenter(session, ref);
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' });
      if (action === 'click') {
        await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        session.refs.clear();
      }
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'drag') {
      const sourceRef = readString(payload, 'sourceRef', ref);
      if (!sourceRef) {
        const error = new Error('Browser drag requires a source element ref.');
        error.code = 'browser_drag_source_required';
        throw error;
      }
      const source = await this.elementBox(session, sourceRef);
      const targetRef = readString(payload, 'targetRef', '');
      let target;
      if (targetRef) {
        target = await this.elementBox(session, targetRef);
      } else {
        const targetX = Number(payload.targetX === undefined ? payload.toX : payload.targetX);
        const targetY = Number(payload.targetY === undefined ? payload.toY : payload.targetY);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || targetX < 0 || targetY < 0 || targetX > 100000 || targetY > 100000) {
          const error = new Error('Browser drag requires a bounded target ref or coordinates.');
          error.code = 'browser_drag_target_invalid';
          throw error;
        }
        target = { x: targetX, y: targetY };
      }
      const steps = Math.max(2, Math.min(20, Math.floor(Number(payload.steps) || 8)));
      let pressed = false;
      let lastPoint = { x: source.x, y: source.y };
      try {
        await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.x, y: source.y, button: 'none', buttons: 0 });
        await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: source.x, y: source.y, button: 'left', buttons: 1, clickCount: 1 });
        pressed = true;
        for (let index = 1; index <= steps; index += 1) {
          const progress = index / steps;
          lastPoint = { x: source.x + (target.x - source.x) * progress, y: source.y + (target.y - source.y) * progress };
          await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: lastPoint.x, y: lastPoint.y, button: 'left', buttons: 1 });
        }
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1 });
        pressed = false;
      } finally {
        if (pressed) await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lastPoint.x, y: lastPoint.y, button: 'left', buttons: 0, clickCount: 1 }).catch(() => ({}));
        session.refs.clear();
      }
      return { action, applied: true, sourceRef, targetRef, target: { x: target.x, y: target.y }, steps, dialogs: session.takeDialogs() };
    }
    if (action === 'scroll') {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaX: Number(payload.deltaX) || 0, deltaY: Number(payload.deltaY) || 0 });
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'type') {
      if (ref) await this.focusRef(session, ref);
      await session.send('Input.insertText', { text: readString(payload, 'text', '') });
      session.refs.clear();
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'keypress') {
      if (ref) await this.focusRef(session, ref);
      const key = readString(payload, 'key', '');
      await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
      session.refs.clear();
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'upload') {
      const box = await this.elementBox(session, ref);
      const backendNodeId = box.backendNodeId;
      await session.send('DOM.setFileInputFiles', { backendNodeId, files: Array.isArray(payload.filePaths) ? payload.filePaths : [] });
      session.refs.clear();
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'fill' || action === 'select') {
      const box = await this.elementBox(session, ref);
      const backendNodeId = box.backendNodeId;
      const resolved = await session.send('DOM.resolveNode', { backendNodeId });
      const objectId = resolved.object && resolved.object.objectId;
      if (!objectId) throw new Error('Browser element could not be resolved.');
      const functionDeclaration = action === 'select'
        ? "function(value){this.value=value;this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return this.value;}"
        : "function(value){this.focus();this.value=value;this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return this.value;}";
      await session.send('Runtime.callFunctionOn', { objectId, functionDeclaration, arguments: [{ value: readString(payload, 'value', readString(payload, 'text', '')) }], returnByValue: true });
      session.refs.clear();
      return { action, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'evaluate') {
      const source = readString(payload, 'function', '');
      const evaluated = await session.send('Runtime.evaluate', { expression: '(' + source + ')()', returnByValue: true, awaitPromise: true, userGesture: true });
      session.refs.clear();
      return { action, value: evaluated.result ? evaluated.result.value : null, applied: true, dialogs: session.takeDialogs() };
    }
    if (action === 'download') {
      const directory = readString(payload, 'downloadDirectory', '');
      await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true }).catch(() => session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory }));
      const point = await this.elementCenter(session, ref);
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      session.refs.clear();
      return {
        action,
        applied: true,
        downloadDirectoryConfigured: directory.length > 0,
        // The Bridge supplies an absolute path internally; expose only its managed relative marker.
        downloadDirectory: CDP_DOWNLOAD_DIRECTORY_MARKER,
        dialogs: session.takeDialogs()
      };
    }
    const error = new Error('Browser CDP host does not support action: ' + action);
    error.code = 'browser_command_unsupported';
    throw error;
  }

  async execute(command, payload) {
    if (command === 'instance.list') return { instances: [{ instanceId: this.hostId, name: this.label, engine: 'chromium-cdp', connected: true }] };
    if (command === 'instance.create') return { instance: { instanceId: this.hostId, name: this.label, engine: 'chromium-cdp', connected: true }, reused: true };
    if (command === 'instance.close') {
      const targets = await this.targets();
      const closedPageIds = [];
      for (const target of targets) {
        const pageId = readString(target, 'id', '');
        if (!pageId) continue;
        try {
          await this.closePage(pageId);
          closedPageIds.push(pageId);
        } catch (_error) {
          // Continue cleaning the remaining pages; the result reports partial cleanup.
        }
      }
      for (const session of this.sessions.values()) session.close();
      this.sessions.clear();
      return { instanceId: readString(payload, 'instanceId', this.hostId), closed: closedPageIds.length === targets.length, closedPageIds, browserProcessUnchanged: true };
    }
    if (command === 'page.list') return { pages: (await this.targets()).map((target) => this.publicPage(target)) };
    if (command === 'page.create') return { page: await this.createPage(readString(payload, 'url', 'about:blank')) };
    if (command === 'page.close') return this.closePage(readString(payload, 'pageId', ''));
    if (command === 'page.navigate') {
      const session = await this.session(readString(payload, 'pageId', ''));
      session.refs.clear();
      const operation = readString(payload, 'operation', 'navigate');
      if (operation === 'navigate') await session.send('Page.navigate', { url: readString(payload, 'url', '') });
      else if (operation === 'reload') await session.send('Page.reload', { ignoreCache: false });
      else {
        const history = await session.send('Page.getNavigationHistory', {});
        const entries = Array.isArray(history.entries) ? history.entries : [];
        const offset = operation === 'back' ? -1 : 1;
        const target = entries[Number(history.currentIndex) + offset];
        if (!target) throw new Error('Browser navigation history does not contain a ' + operation + ' entry.');
        await session.send('Page.navigateToHistoryEntry', { entryId: target.id });
      }
      return { pageId: readString(payload, 'pageId', ''), operation, accepted: true };
    }
    if (command === 'page.snapshot') return this.snapshot(readString(payload, 'pageId', ''));
    if (command === 'page.screenshot') {
      const session = await this.session(readString(payload, 'pageId', ''));
      const options = { format: 'png', fromSurface: true, captureBeyondViewport: payload.fullPage === true };
      const screenshot = await session.send('Page.captureScreenshot', options, 30000);
      const data = readString(screenshot, 'data', '');
      if (data.length > CDP_MAX_SCREENSHOT_BASE64) throw new Error('Browser screenshot exceeded the host size limit.');
      return { screenshot: { mimeType: 'image/png', dataBase64: data, bytes: Math.floor(data.length * 0.75), fullPage: payload.fullPage === true } };
    }
    if (command === 'page.logs') {
      const session = await this.session(readString(payload, 'pageId', ''));
      const maxEntries = Math.max(1, Math.min(CDP_MAX_LOG_ENTRIES, Math.floor(Number(payload.maxEntries) || 100)));
      return { logs: session.logs.slice(Math.max(0, session.logs.length - maxEntries)) };
    }
    if (command === 'page.wait') {
      const session = await this.session(readString(payload, 'pageId', ''));
      const text = readString(payload, 'text', '');
      const url = readString(payload, 'url', '');
      if ((!text && !url) || (text && url)) throw new Error('Browser wait requires exactly one text or URL condition.');
      const deadline = Date.now() + Math.max(100, Math.min(120000, Math.floor(Number(payload.timeoutMs) || 30000)));
      while (Date.now() < deadline) {
        const expression = text
          ? 'document.body && document.body.innerText.includes(' + JSON.stringify(text) + ')'
          : 'location.href.includes(' + JSON.stringify(url) + ')';
        const result = await session.send('Runtime.evaluate', { expression, returnByValue: true });
        if (result.result && result.result.value === true) return { matched: true, condition: text ? 'text' : 'url' };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const error = new Error('Browser wait timed out.');
      error.code = 'browser_timeout';
      throw error;
    }
    if (command === 'page.action') return this.pageAction(payload);
    if (command === 'download.list') {
      const downloads = [];
      for (const session of this.sessions.values()) {
        for (const item of session.downloads.values()) {
          const publicItem = Object.assign({ pageId: session.pageId }, item);
          delete publicItem.filePath;
          delete publicItem.path;
          delete publicItem.downloadPath;
          delete publicItem.downloadDirectory;
          delete publicItem.filePaths;
          const publicUrl = sanitizePublicDownloadUrl(publicItem.url);
          if (publicUrl.length > 0) publicItem.url = publicUrl;
          else delete publicItem.url;
          downloads.push(publicItem);
        }
      }
      downloads.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
      return { downloads: downloads.slice(0, 500), tracking: 'cdp-events' };
    }
    const error = new Error('Unsupported CDP browser command: ' + command);
    error.code = 'browser_command_unsupported';
    throw error;
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
    if (this.bridgeClient) this.bridgeClient.close(1000, 'browser host stopped');
    this.bridgeClient = null;
  }
}

function optionValue(argv, name, fallbackValue) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallbackValue;
}

async function runCli() {
  const argv = process.argv.slice(2);
  const bridgeTokenEnvironment = optionValue(argv, '--token-env', 'AGENT_BRIDGE_TOKEN');
  const token = process.env[bridgeTokenEnvironment] || '';
  const workspaceIds = optionValue(argv, '--workspace-ids', '').split(',').map((item) => item.trim()).filter(Boolean);
  const host = new BrowserCdpHost({
    bridgeUrl: optionValue(argv, '--bridge-url', 'http://127.0.0.1:8787'),
    bridgeToken: token,
    cdpUrl: optionValue(argv, '--cdp-url', 'http://127.0.0.1:9222'),
    hostId: optionValue(argv, '--host-id', ''),
    label: optionValue(argv, '--label', 'Chromium CDP'),
    workspaceIds,
    allowRemoteCdp: argv.includes('--allow-remote-cdp')
  });
  await host.start();
  process.stdout.write('Browser CDP host connected as ' + host.hostId + '.\n');
  const stop = () => {
    host.stop();
    process.exitCode = 0;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  runCli().catch((error) => {
    process.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  CDP_DOWNLOAD_DIRECTORY_MARKER,
  BrowserCdpHost,
  CdpSession,
  validateCdpBaseUrl,
  validateDebuggerWebSocketUrl
};
