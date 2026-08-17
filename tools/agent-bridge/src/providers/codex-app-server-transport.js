'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');

class CodexAppServerError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'CodexAppServerError';
    this.code = code;
    this.data = data;
  }
}

class CodexAppServerTransport extends EventEmitter {
  constructor(config) {
    super();
    this.command = config && typeof config.command === 'string' && config.command.length > 0 ? config.command : 'codex';
    this.args = config && Array.isArray(config.appServerArgs) ? config.appServerArgs : ['app-server'];
    this.cwd = config && typeof config.cwd === 'string' ? config.cwd : '';
    this.env = config && config.env && typeof config.env === 'object' ? config.env : {};
    this.requestTimeoutMs = config && typeof config.requestTimeoutMs === 'number' ? config.requestTimeoutMs : 30000;
    this.spawnFactory = config && typeof config.spawnFactory === 'function' ? config.spawnFactory : spawn;
    this.child = null;
    this.startPromise = null;
    this.buffer = '';
    this.nextRequestId = 1;
    this.pending = new Map();
    this.serverRequests = new Map();
    this.startedAt = 0;
    this.lastActivityAt = 0;
    this.lastError = '';
    this.generation = 0;
  }

  get pid() {
    return this.child && typeof this.child.pid === 'number' ? this.child.pid : 0;
  }

  async start() {
    if (this.child) {
      return;
    }
    if (this.startPromise) {
      return await this.startPromise;
    }
    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startInternal() {
    const child = this.spawnFactory(this.command, this.args.slice(), {
      cwd: this.cwd.length > 0 ? this.cwd : process.cwd(),
      env: Object.assign({}, process.env, this.env),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && !path.isAbsolute(this.command),
      windowsHide: true
    });
    this.child = child;
    this.startedAt = Date.now();
    this.lastActivityAt = this.startedAt;
    this.buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.handleData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text.length > 0) {
        this.lastError = text;
        this.emit('stderr', text);
      }
    });
    child.on('error', (error) => this.handleExit(error, null, null));
    child.on('exit', (code, signal) => this.handleExit(null, code, signal));
    await this.request('initialize', {
      clientInfo: {
        name: 'ngf-agent-bridge',
        title: 'NGF Agent Bridge',
        version: '0.1.4'
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.notify('initialized', {});
    this.generation += 1;
  }

  handleData(chunk) {
    this.lastActivityAt = Date.now();
    this.buffer += String(chunk);
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const text = line.trim();
      if (text.length === 0) {
        continue;
      }
      let message = null;
      try {
        message = JSON.parse(text);
      } catch (error) {
        this.emit('protocolError', new CodexAppServerError('INVALID_JSON', 'Invalid Codex App Server JSONL: ' + text, null));
        continue;
      }
      this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (message && Object.prototype.hasOwnProperty.call(message, 'id') && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(String(message.id));
      if (message.error) {
        pending.reject(new CodexAppServerError(
          String(message.error.code || 'APP_SERVER_ERROR'),
          String(message.error.message || 'Codex App Server request failed.'),
          message.error.data || null
        ));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }
    if (message && message.method && Object.prototype.hasOwnProperty.call(message, 'id')) {
      const key = String(message.id);
      this.serverRequests.set(key, message);
      this.emit('request', message);
      return;
    }
    if (message && message.method) {
      this.emit('notification', message);
    }
  }

  write(message) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw new CodexAppServerError('APP_SERVER_DISCONNECTED', 'Codex App Server is not connected.', null);
    }
    this.lastActivityAt = Date.now();
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  async request(method, params) {
    if (method !== 'initialize') {
      await this.start();
    }
    const id = String(this.nextRequestId++);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError('APP_SERVER_TIMEOUT', method + ' timed out after ' + String(this.requestTimeoutMs) + 'ms.', null));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.write({ id, method, params: params || {} });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.write({ method, params: params || {} });
  }

  respondServerRequest(requestId, result) {
    const key = String(requestId);
    if (!this.serverRequests.has(key)) {
      throw new CodexAppServerError('REQUEST_NOT_FOUND', 'Codex App Server request not found: ' + key, null);
    }
    this.serverRequests.delete(key);
    this.write({ id: requestId, result: result || {} });
  }

  rejectServerRequest(requestId, code, message) {
    const key = String(requestId);
    this.serverRequests.delete(key);
    this.write({ id: requestId, error: { code, message } });
  }

  handleExit(error, code, signal) {
    if (!this.child && this.pending.size === 0 && this.serverRequests.size === 0) {
      return;
    }
    const message = error instanceof Error ? error.message : 'Codex App Server exited' + (code === null ? '' : ' with code ' + String(code)) + (signal ? ' (' + signal + ')' : '') + '.';
    this.lastError = message;
    const failure = new CodexAppServerError('APP_SERVER_EXITED', message, { code, signal });
    this.child = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.pending.clear();
    this.serverRequests.clear();
    this.emit('exit', failure);
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.stdin.end();
      } catch (_error) {
        // kill below is the final cleanup path.
      }
      child.kill();
    }
  }
}

module.exports = {
  CodexAppServerError,
  CodexAppServerTransport
};
