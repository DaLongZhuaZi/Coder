'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { randomId } = require('./daemon-store');
const { processIsAlive } = require('./managed-process-ledger');
const {
  normalizeRequestHost,
  normalizeServiceDomain,
  proxyWebSocketUpgrade,
  serviceProxyOriginAllowed,
  validateWebSocketUpgradeRequest
} = require('./service-proxy-router');

const SERVICE_STATE_VERSION = 1;
const PLAN_TTL_MS = 5 * 60 * 1000;
const LOG_MAX_BYTES = 1024 * 1024;
const START_TIMEOUT_MS = 12 * 1000;
const STOP_TIMEOUT_MS = 5 * 1000;

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function normalizeEventOwnerId(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.connectionId === 'string') return value.connectionId.trim();
  return '';
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalValue(value[key]);
  return result;
}

function digestValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function failure(category, message, remediation) {
  return {
    ok: false,
    failureCategory: category,
    message,
    remediation: remediation || '',
    warnings: [],
    updatedAt: new Date().toISOString()
  };
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function realPathIfAvailable(value) {
  try {
    return fs.realpathSync(value);
  } catch (_error) {
    return path.resolve(value);
  }
}

function safeEnvironment(environmentNames, port) {
  const result = {};
  const inheritedNames = process.platform === 'win32'
    ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE']
    : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL'];
  for (const name of inheritedNames.concat(environmentNames)) {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (typeof process.env[name] === 'string') result[name] = process.env[name];
  }
  result.PORT = String(port);
  result.HOST = '127.0.0.1';
  return result;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

function tcpHealth(port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, statusCode: 0, message });
    };
    socket.setTimeout(timeoutMs, () => finish(false, 'Health connection timed out.'));
    socket.once('connect', () => finish(true, 'TCP health check passed.'));
    socket.once('error', (error) => finish(false, error instanceof Error ? error.message : String(error)));
  });
}

function httpHealth(port, healthPath, timeoutMs, protocol) {
  return new Promise((resolve) => {
    const client = protocol === 'https' ? https : http;
    const request = client.request({
      host: '127.0.0.1',
      port,
      path: healthPath,
      method: 'GET',
      timeout: timeoutMs,
      headers: { Host: '127.0.0.1:' + String(port), Connection: 'close' },
      rejectUnauthorized: true
    }, (response) => {
      response.resume();
      const statusCode = typeof response.statusCode === 'number' ? response.statusCode : 0;
      resolve({
        ok: statusCode >= 200 && statusCode < 400,
        statusCode,
        message: statusCode >= 200 && statusCode < 400 ? 'HTTP health check passed.' : 'HTTP health check returned ' + String(statusCode) + '.'
      });
    });
    request.once('timeout', () => request.destroy(new Error('Health request timed out.')));
    request.once('error', (error) => resolve({ ok: false, statusCode: 0, message: error instanceof Error ? error.message : String(error) }));
    request.end();
  });
}

class ServiceProxyManager {
  constructor(options) {
    this.store = options.store;
    this.workspaceRegistry = options.workspaceRegistry;
    this.agentManager = options.agentManager || null;
    this.managedProcessLedger = options.managedProcessLedger;
    this.broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
    this.proxyTimeoutMs = Math.max(100, Math.min(120000, Math.floor(readNumber(options, 'proxyTimeoutMs', 30000))));
    this.children = new Map();
    this.proxyConnections = new Map();
    this.plans = new Map();
    this.eventOwners = new Map();
    this.state = this.normalizeState(this.store.readWorkspaceServiceState());
    this.persist();
  }

  rememberEventOwner(serviceId, ownerId) {
    const normalizedOwnerId = normalizeEventOwnerId(ownerId);
    if (typeof serviceId !== 'string' || serviceId.length === 0 || normalizedOwnerId.length === 0) return;
    this.eventOwners.set(serviceId, normalizedOwnerId);
  }

  detachConnection(ownerId) {
    const normalizedOwnerId = normalizeEventOwnerId(ownerId);
    if (normalizedOwnerId.length === 0) return 0;
    let removed = 0;
    for (const [serviceId, serviceOwnerId] of this.eventOwners.entries()) {
      if (serviceOwnerId !== normalizedOwnerId) continue;
      this.eventOwners.delete(serviceId);
      removed += 1;
    }
    return removed;
  }

  normalizeState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const services = Array.isArray(source.services) ? source.services.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => Object.assign({}, item, { desiredState: item.desiredState === 'running' ? 'running' : 'stopped' })) : [];
    const claimedDomains = new Set();
    for (const service of services) {
      const domain = normalizeServiceDomain(service.domain);
      service.domain = domain.length > 0 && !claimedDomains.has(domain) ? domain : '';
      if (service.domain.length > 0) claimedDomains.add(service.domain);
    }
    return { version: SERVICE_STATE_VERSION, services };
  }

  persist() {
    this.store.writeWorkspaceServiceState(this.state);
  }

  find(serviceId) {
    return this.state.services.find((item) => item.serviceId === serviceId) || null;
  }

  serviceWorkspace(service) {
    return service ? this.workspaceRegistry.findWorkspaceById(service.workspaceId) : null;
  }

  publicService(service) {
    if (!service) return null;
    return {
      serviceId: service.serviceId,
      name: service.name,
      workspaceId: service.workspaceId,
      ownerAgentId: service.ownerAgentId,
      command: path.basename(service.command || ''),
      argumentCount: Array.isArray(service.args) ? service.args.length : 0,
      cwd: service.cwd,
      port: service.port,
      protocol: service.protocol,
      domain: normalizeServiceDomain(service.domain),
      health: service.health,
      visibility: service.visibility,
      auth: {
        mode: service.auth && service.auth.mode === 'environment' ? 'environment' : 'bridge',
        environmentVariable: service.auth && typeof service.auth.environmentVariable === 'string' ? service.auth.environmentVariable : ''
      },
      lifecycle: service.lifecycle,
      desiredState: service.desiredState,
      status: service.status,
      pid: service.pid,
      ledgerId: service.ledgerId,
      recovered: service.recovered === true,
      exitCode: service.exitCode,
      lastError: service.lastError,
      lastHealth: service.lastHealth,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      startedAt: service.startedAt,
      stoppedAt: service.stoppedAt,
      proxyPath: '/service/' + encodeURIComponent(service.serviceId) + '/'
    };
  }

  list(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const ownerAgentId = readString(payload, 'ownerAgentId', readString(payload, 'agentId', ''));
    const services = this.state.services.filter((item) => {
      if (workspaceId && item.workspaceId !== workspaceId) return false;
      if (ownerAgentId && item.ownerAgentId !== ownerAgentId) return false;
      return true;
    }).map((item) => this.publicService(item));
    return { ok: true, services, totalCount: services.length, updatedAt: new Date().toISOString() };
  }

  status(payload) {
    const service = this.find(readString(payload, 'serviceId', ''));
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list and choose an existing service.');
    return { ok: true, service: this.publicService(service), updatedAt: new Date().toISOString() };
  }

  validateDefinition(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const workspace = this.workspaceRegistry.findWorkspaceById(workspaceId);
    if (!workspace || (typeof workspace.archivedAt === 'string' && workspace.archivedAt.length > 0)) {
      return failure('workspace_not_found', 'An active registered workspace is required.', 'Register or restore the workspace before defining a service.');
    }
    const workspacePath = realPathIfAvailable(readString(workspace, 'cwd', readString(workspace, 'workspacePath', '')));
    const requestedCwd = readString(payload, 'cwd', workspacePath);
    if (!path.isAbsolute(requestedCwd) || !fs.existsSync(requestedCwd) || !fs.statSync(requestedCwd).isDirectory()) {
      return failure('service_cwd_invalid', 'Service cwd must be an existing absolute directory.', 'Choose a directory inside the registered workspace.');
    }
    const cwd = realPathIfAvailable(requestedCwd);
    if (!isPathInside(workspacePath, cwd)) {
      return failure('service_cwd_outside_workspace', 'Service cwd escapes the registered workspace.', 'Choose the workspace root or one of its real subdirectories.');
    }
    const ownerAgentId = readString(payload, 'ownerAgentId', readString(payload, 'agentId', ''));
    if (ownerAgentId && this.agentManager) {
      const agent = this.agentManager.find(ownerAgentId);
      if (!agent || agent.workspaceId !== workspaceId || (typeof agent.archivedAt === 'string' && agent.archivedAt.length > 0)) {
        return failure('service_owner_invalid', 'Service owner is not an active Agent in this workspace.', 'Choose an active Agent from the same workspace or omit ownerAgentId.');
      }
    }
    const command = readString(payload, 'command', '').trim();
    if (!command || /[\r\n\0]/.test(command)) {
      return failure('service_command_invalid', 'Service command is required and must not contain control characters.', 'Provide an executable name or absolute executable path; shell commands are not supported.');
    }
    const args = Array.isArray(payload.args) && payload.args.every((item) => typeof item === 'string' && item.length <= 4096 && !/[\0]/.test(item)) ? payload.args.slice(0, 128) : [];
    const port = Math.floor(readNumber(payload, 'port', 0));
    if (port < 1024 || port > 65535) {
      return failure('service_port_invalid', 'Service port must be between 1024 and 65535.', 'Choose an unprivileged loopback port.');
    }
    const protocol = readString(payload, 'protocol', 'http') === 'https' ? 'https' : 'http';
    const healthSource = payload.health && typeof payload.health === 'object' && !Array.isArray(payload.health) ? payload.health : {};
    const healthKind = readString(healthSource, 'kind', 'tcp') === 'http' ? 'http' : 'tcp';
    const healthPath = readString(healthSource, 'path', '/health');
    if (healthKind === 'http' && (!healthPath.startsWith('/') || healthPath.startsWith('//') || /[\r\n\0]/.test(healthPath))) {
      return failure('service_health_invalid', 'HTTP health path is invalid.', 'Use an absolute path such as /health.');
    }
    const authSource = payload.auth && typeof payload.auth === 'object' && !Array.isArray(payload.auth) ? payload.auth : {};
    const authMode = readString(authSource, 'mode', 'bridge') === 'environment' ? 'environment' : 'bridge';
    const environmentVariable = readString(authSource, 'environmentVariable', '');
    if (authMode === 'environment' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentVariable)) {
      return failure('service_auth_invalid', 'Environment-backed upstream auth requires a valid environment variable name.', 'Configure the secret in the Bridge process environment and reference only its variable name.');
    }
    const environmentNames = Array.isArray(payload.environmentNames)
      ? payload.environmentNames.filter((item) => typeof item === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(item)).slice(0, 64)
      : [];
    const serviceId = readString(payload, 'serviceId', randomId('svc'));
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(serviceId)) {
      return failure('service_id_invalid', 'Service id contains unsupported characters.', 'Use 1 to 128 letters, numbers, dots, underscores, or hyphens.');
    }
    const requestedDomain = readString(payload, 'domain', '').trim();
    const domain = normalizeServiceDomain(requestedDomain);
    if (requestedDomain.length > 0 && (domain.length === 0 || /[:/@\\]/.test(requestedDomain))) {
      return failure('service_domain_invalid', 'Service domain must be a valid lower-ASCII hostname with at least two labels.', 'Use a dedicated hostname such as app.workspace.localhost without a scheme, port, path, wildcard, or IP address.');
    }
    const conflictingDomain = domain.length > 0
      ? this.state.services.find((item) => item.serviceId !== serviceId && normalizeServiceDomain(item.domain) === domain)
      : null;
    if (conflictingDomain) {
      return failure('service_domain_conflict', 'Service domain is already assigned to another workspace service.', 'Choose a unique domain or remove it from the other service definition.');
    }
    return {
      ok: true,
      definition: {
        serviceId,
        name: readString(payload, 'name', path.basename(command)).slice(0, 128),
        workspaceId,
        ownerAgentId,
        command,
        args,
        cwd,
        port,
        protocol,
        domain,
        health: { kind: healthKind, path: healthKind === 'http' ? healthPath : '', timeoutMs: Math.max(250, Math.min(10000, Math.floor(readNumber(healthSource, 'timeoutMs', 1500)))) },
        visibility: readString(payload, 'visibility', 'workspace') === 'owner' ? 'owner' : 'workspace',
        auth: { mode: authMode, environmentVariable },
        lifecycle: readString(payload, 'lifecycle', 'workspace') === 'owner' ? 'owner' : 'workspace',
        environmentNames
      }
    };
  }

  createPlan(action, serviceId, value) {
    this.prunePlans();
    const planId = randomId('svcplan');
    const plan = { planId, action, serviceId, value, digest: digestValue(value), expiresAt: Date.now() + PLAN_TTL_MS };
    this.plans.set(planId, plan);
    return plan;
  }

  consumePlan(payload, action, serviceId) {
    const planId = readString(payload, 'planId', '');
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    if (!plan || plan.action !== action || plan.serviceId !== serviceId || plan.expiresAt < Date.now()) {
      return null;
    }
    return plan;
  }

  prunePlans() {
    const now = Date.now();
    for (const item of this.plans.values()) if (item.expiresAt < now) this.plans.delete(item.planId);
  }

  upsert(payload, ownerId) {
    const validated = this.validateDefinition(payload);
    if (!validated.ok) return validated;
    const definition = validated.definition;
    const existing = this.find(definition.serviceId);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return failure('service_running', 'A running service cannot be reconfigured.', 'Stop the service before changing its definition.');
    }
    const confirm = readBoolean(payload, 'confirm', false);
    if (!confirm) {
      const plan = this.createPlan('upsert', definition.serviceId, definition);
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, definition: this.publicService(Object.assign({}, definition, { status: 'stopped', pid: 0, ledgerId: '', createdAt: '', updatedAt: '' })), updatedAt: new Date().toISOString() };
    }
    const plan = this.consumePlan(payload, 'upsert', definition.serviceId);
    if (!plan || plan.digest !== digestValue(definition)) return failure('service_plan_stale', 'Service definition plan is missing, expired, or changed.', 'Request a fresh preview before confirming.');
    const now = new Date().toISOString();
    const service = Object.assign({}, definition, {
      status: 'stopped', desiredState: 'stopped', pid: 0, ledgerId: '', recovered: false, exitCode: null, lastError: '', lastHealth: null,
      createdAt: existing && existing.createdAt ? existing.createdAt : now, updatedAt: now, startedAt: '', stoppedAt: now
    });
    if (existing) this.state.services.splice(this.state.services.indexOf(existing), 1, service);
    else this.state.services.push(service);
    this.rememberEventOwner(service.serviceId, ownerId);
    this.persist();
    this.emit('service.upserted', service);
    return { ok: true, preview: false, confirmed: true, service: this.publicService(service), updatedAt: now };
  }

  async start(payload, internal, ownerId) {
    const serviceId = readString(payload, 'serviceId', '');
    const service = this.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Create the service definition first.');
    this.rememberEventOwner(serviceId, ownerId);
    if (service.status === 'running' && processIsAlive(service.pid)) return { ok: true, preview: false, confirmed: true, service: this.publicService(service), warnings: ['Service is already running.'], updatedAt: new Date().toISOString() };
    if (!internal && !readBoolean(payload, 'confirm', false)) {
      const plan = this.createPlan('start', serviceId, { serviceId, definitionDigest: digestValue(this.definitionForDigest(service)) });
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, service: this.publicService(service), updatedAt: new Date().toISOString() };
    }
    if (!internal) {
      const plan = this.consumePlan(payload, 'start', serviceId);
      const expected = { serviceId, definitionDigest: digestValue(this.definitionForDigest(service)) };
      if (!plan || plan.digest !== digestValue(expected)) return failure('service_plan_stale', 'Service start plan is missing, expired, or changed.', 'Request a fresh start preview before confirming.');
    }
    if (!(await portIsAvailable(service.port))) return failure('service_port_conflict', 'The configured loopback port is already in use.', 'Stop the conflicting process or choose another port.');
    service.desiredState = 'running';
    service.status = 'starting';
    service.lastError = '';
    service.updatedAt = new Date().toISOString();
    this.persist();
    let child;
    try {
      child = spawn(service.command, service.args, {
        cwd: service.cwd,
        env: safeEnvironment(service.environmentNames, service.port),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      return this.markFailed(service, 'service_spawn_failed', error instanceof Error ? error.message : String(error));
    }
    const ledger = this.managedProcessLedger.record({
      kind: 'workspace-service', pid: child.pid || 0, command: service.command, args: service.args, cwd: service.cwd,
      identity: { serviceId, workspaceId: service.workspaceId, agentId: service.ownerAgentId, runtimeOwnerId: service.ownerAgentId }
    });
    service.pid = child.pid || 0;
    service.ledgerId = ledger.id;
    service.startedAt = new Date().toISOString();
    service.updatedAt = service.startedAt;
    service.recovered = false;
    this.children.set(serviceId, child);
    this.attachChild(service, child);
    this.persist();
    const deadline = Date.now() + START_TIMEOUT_MS;
    let health = { ok: false, statusCode: 0, message: 'Service did not become healthy.' };
    while (Date.now() < deadline && processIsAlive(service.pid)) {
      health = await this.checkHealth(service);
      if (health.ok) break;
      await wait(150);
    }
    if (!health.ok) {
      await this.stopServiceProcess(service, 'activation_failed');
      return this.markFailed(service, 'service_activation_failed', health.message);
    }
    service.status = 'running';
    service.lastHealth = Object.assign({}, health, { checkedAt: new Date().toISOString() });
    service.updatedAt = new Date().toISOString();
    this.persist();
    this.emit('service.started', service);
    return { ok: true, preview: false, confirmed: true, service: this.publicService(service), updatedAt: service.updatedAt };
  }

  definitionForDigest(service) {
    return { workspaceId: service.workspaceId, ownerAgentId: service.ownerAgentId, command: service.command, args: service.args, cwd: service.cwd, port: service.port, protocol: service.protocol, domain: normalizeServiceDomain(service.domain), health: service.health, visibility: service.visibility, auth: service.auth, lifecycle: service.lifecycle, environmentNames: service.environmentNames };
  }

  attachChild(service, child) {
    if (child.stdout) child.stdout.on('data', (chunk) => this.appendLog(service, 'stdout', chunk));
    if (child.stderr) child.stderr.on('data', (chunk) => this.appendLog(service, 'stderr', chunk));
    child.once('error', (error) => {
      service.lastError = error instanceof Error ? error.message : String(error);
      service.updatedAt = new Date().toISOString();
      this.persist();
      this.emit('service.error', service);
    });
    child.once('exit', (code, signal) => {
      this.children.delete(service.serviceId);
      this.closeProxyConnections(service.serviceId);
      if (service.ledgerId) this.managedProcessLedger.remove(service.ledgerId);
      service.status = service.status === 'stopping' ? 'stopped' : 'failed';
      service.exitCode = typeof code === 'number' ? code : null;
      service.lastError = signal ? 'Process exited with signal ' + String(signal) + '.' : service.lastError;
      service.pid = 0;
      service.ledgerId = '';
      service.stoppedAt = new Date().toISOString();
      service.updatedAt = service.stoppedAt;
      this.persist();
      this.emit('service.exited', service);
    });
  }

  markFailed(service, category, message) {
    service.status = 'failed';
    service.lastError = message;
    service.pid = 0;
    service.ledgerId = '';
    service.updatedAt = new Date().toISOString();
    this.persist();
    this.emit('service.failed', service);
    return Object.assign(failure(category, message, 'Review the service command, logs, port, and health configuration.'), { service: this.publicService(service) });
  }

  appendLog(service, stream, chunk) {
    const text = Buffer.from(chunk).toString('utf8');
    const line = '[' + new Date().toISOString() + '] [' + stream + '] ' + text;
    const filePath = this.store.workspaceServiceLogFilePath(service.serviceId);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, line, 'utf8');
      const stat = fs.statSync(filePath);
      if (stat.size > LOG_MAX_BYTES) {
        const buffer = fs.readFileSync(filePath);
        fs.writeFileSync(filePath, buffer.subarray(Math.max(0, buffer.length - Math.floor(LOG_MAX_BYTES * 0.75))));
      }
    } catch (_error) {
      // Service output persistence is best effort and never changes process state.
    }
  }

  logs(payload) {
    const service = this.find(readString(payload, 'serviceId', ''));
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    const maxBytes = Math.max(1024, Math.min(LOG_MAX_BYTES, Math.floor(readNumber(payload, 'maxBytes', 64 * 1024))));
    const filePath = this.store.workspaceServiceLogFilePath(service.serviceId);
    if (!fs.existsSync(filePath)) return { ok: true, serviceId: service.serviceId, text: '', truncated: false, updatedAt: new Date().toISOString() };
    const buffer = fs.readFileSync(filePath);
    const truncated = buffer.length > maxBytes;
    return { ok: true, serviceId: service.serviceId, text: buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString('utf8'), truncated, updatedAt: new Date().toISOString() };
  }

  async health(payload, ownerId) {
    const service = this.find(readString(payload, 'serviceId', ''));
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    this.rememberEventOwner(service.serviceId, ownerId);
    const health = await this.checkHealth(service);
    service.lastHealth = Object.assign({}, health, { checkedAt: new Date().toISOString() });
    if (service.status === 'running' && !health.ok) service.status = processIsAlive(service.pid) ? 'degraded' : 'stopped';
    if (service.status === 'degraded' && health.ok) service.status = 'running';
    service.updatedAt = new Date().toISOString();
    this.persist();
    this.emit('service.health', service);
    return { ok: true, service: this.publicService(service), health: service.lastHealth, updatedAt: service.updatedAt };
  }

  checkHealth(service) {
    if (service.health && service.health.kind === 'http') return httpHealth(service.port, service.health.path, service.health.timeoutMs, service.protocol);
    return tcpHealth(service.port, service.health && service.health.timeoutMs ? service.health.timeoutMs : 1500);
  }

  async stop(payload, internal, ownerId) {
    const serviceId = readString(payload, 'serviceId', '');
    const service = this.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    this.rememberEventOwner(serviceId, ownerId);
    if (!internal && !readBoolean(payload, 'confirm', false)) {
      const plan = this.createPlan('stop', serviceId, { serviceId, pid: service.pid, startedAt: service.startedAt });
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, service: this.publicService(service), updatedAt: new Date().toISOString() };
    }
    if (!internal) {
      const plan = this.consumePlan(payload, 'stop', serviceId);
      const expected = { serviceId, pid: service.pid, startedAt: service.startedAt };
      if (!plan || plan.digest !== digestValue(expected)) return failure('service_plan_stale', 'Service stop plan is missing, expired, or the process changed.', 'Request a fresh stop preview before confirming.');
    }
    service.desiredState = 'stopped';
    await this.stopServiceProcess(service, readString(payload, 'reason', 'user_stop'));
    return { ok: true, preview: false, confirmed: true, service: this.publicService(service), updatedAt: service.updatedAt };
  }

  async stopServiceProcess(service, reason) {
    if (service) this.closeProxyConnections(service.serviceId);
    if (!service || !processIsAlive(service.pid)) {
      if (service && service.ledgerId) this.managedProcessLedger.remove(service.ledgerId);
      if (service) {
        service.status = 'stopped'; service.pid = 0; service.ledgerId = ''; service.stoppedAt = new Date().toISOString(); service.updatedAt = service.stoppedAt;
        this.persist(); this.emit('service.stopped', service);
      }
      return;
    }
    service.status = 'stopping';
    service.updatedAt = new Date().toISOString();
    this.persist();
    const child = this.children.get(service.serviceId);
    try {
      if (child) child.kill();
      else process.kill(service.pid, 'SIGTERM');
    } catch (_error) {
    }
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (Date.now() < deadline && processIsAlive(service.pid)) await wait(100);
    if (processIsAlive(service.pid)) {
      try { process.kill(service.pid, 'SIGKILL'); } catch (_error) {}
    }
    this.children.delete(service.serviceId);
    if (service.ledgerId) this.managedProcessLedger.remove(service.ledgerId);
    service.status = 'stopped'; service.pid = 0; service.ledgerId = ''; service.lastError = reason === 'activation_failed' ? service.lastError : '';
    service.stoppedAt = new Date().toISOString(); service.updatedAt = service.stoppedAt;
    this.persist(); this.emit('service.stopped', service);
  }

  async remove(payload, ownerId) {
    const serviceId = readString(payload, 'serviceId', '');
    const service = this.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    this.rememberEventOwner(serviceId, ownerId);
    if (!readBoolean(payload, 'confirm', false)) {
      const plan = this.createPlan('remove', serviceId, { serviceId, definitionDigest: digestValue(this.definitionForDigest(service)) });
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, service: this.publicService(service), updatedAt: new Date().toISOString() };
    }
    const plan = this.consumePlan(payload, 'remove', serviceId);
    const expected = { serviceId, definitionDigest: digestValue(this.definitionForDigest(service)) };
    if (!plan || plan.digest !== digestValue(expected)) return failure('service_plan_stale', 'Service removal plan is missing, expired, or changed.', 'Request a fresh removal preview before confirming.');
    await this.stopServiceProcess(service, 'service_removed');
    this.state.services = this.state.services.filter((item) => item.serviceId !== serviceId);
    this.persist();
    try { fs.unlinkSync(this.store.workspaceServiceLogFilePath(serviceId)); } catch (_error) {}
    this.emit('service.removed', service);
    this.eventOwners.delete(serviceId);
    return { ok: true, preview: false, confirmed: true, serviceId, removed: true, updatedAt: new Date().toISOString() };
  }

  async reconcile() {
    const results = [];
    const ledgers = this.managedProcessLedger.list();
    for (const service of this.state.services) {
      const ledger = ledgers.find((item) => item.id === service.ledgerId && item.pid === service.pid && item.identity && item.identity.serviceId === service.serviceId);
      if (service.pid > 0 && ledger && processIsAlive(service.pid)) {
        service.recovered = true;
        const health = await this.checkHealth(service);
        service.lastHealth = Object.assign({}, health, { checkedAt: new Date().toISOString() });
        service.status = health.ok ? 'running' : 'degraded';
        results.push({ serviceId: service.serviceId, status: service.status, recovered: true });
      } else if (service.desiredState === 'running') {
        if (service.ledgerId) this.managedProcessLedger.remove(service.ledgerId);
        service.pid = 0; service.ledgerId = ''; service.recovered = false; service.status = 'stopped';
        const restarted = await this.start({ serviceId: service.serviceId }, true);
        results.push({ serviceId: service.serviceId, status: restarted.ok ? 'running' : 'failed', recovered: restarted.ok, restarted: true, failureCategory: restarted.failureCategory || '' });
      } else {
        if (service.ledgerId) this.managedProcessLedger.remove(service.ledgerId);
        service.pid = 0; service.ledgerId = ''; service.recovered = false;
        if (service.status === 'running' || service.status === 'starting' || service.status === 'stopping' || service.status === 'degraded') service.status = 'stopped';
        results.push({ serviceId: service.serviceId, status: service.status, recovered: false });
      }
      service.updatedAt = new Date().toISOString();
    }
    this.persist();
    return { ok: true, results, updatedAt: new Date().toISOString() };
  }

  async cleanupByOwner(agentId, reason) {
    const stopped = [];
    for (const service of this.state.services) {
      if (service.ownerAgentId !== agentId || service.lifecycle !== 'owner') continue;
      service.desiredState = 'stopped';
      await this.stopServiceProcess(service, reason || 'owner_archived');
      stopped.push(this.publicService(service));
    }
    return { status: 'completed', stopped };
  }

  async cleanupByWorkspace(workspaceId, reason) {
    const stopped = [];
    for (const service of this.state.services) {
      if (service.workspaceId !== workspaceId) continue;
      service.desiredState = 'stopped';
      await this.stopServiceProcess(service, reason || 'workspace_archived');
      stopped.push(this.publicService(service));
    }
    return { status: 'completed', stopped };
  }

  async shutdownAll(reason) {
    const stopped = [];
    for (const service of this.state.services) {
      if (service.status === 'running' || service.status === 'starting' || service.status === 'degraded' || processIsAlive(service.pid)) {
        // Daemon shutdown is a process lifecycle event, not a user stop. Keep
        // desiredState=running so the next daemon instance can reconcile it.
        await this.stopServiceProcess(service, reason || 'daemon_shutdown');
        stopped.push(this.publicService(service));
      }
    }
    return { status: 'completed', stopped };
  }

  resolveProxyDomain(hostHeader) {
    const host = normalizeRequestHost(hostHeader);
    if (host.length === 0) return { matched: false, host: '' };
    const service = this.state.services.find((item) => normalizeServiceDomain(item.domain) === host) || null;
    return service
      ? { matched: true, host, serviceId: service.serviceId, service: this.publicService(service) }
      : { matched: false, host };
  }

  isServiceDomainCandidate(hostHeader) {
    const host = normalizeRequestHost(hostHeader);
    if (host.length === 0) return false;
    for (const service of this.state.services) {
      const domain = normalizeServiceDomain(service.domain);
      if (domain.length === 0) continue;
      if (host === domain) return true;
      const separator = domain.indexOf('.');
      const namespace = separator >= 0 ? domain.substring(separator + 1) : '';
      if (namespace.length > 0 && host.endsWith('.' + namespace)) return true;
    }
    return false;
  }

  trackProxyConnection(serviceId, clientSocket, upstreamSocket, close) {
    let entries = this.proxyConnections.get(serviceId);
    if (!entries) {
      entries = new Set();
      this.proxyConnections.set(serviceId, entries);
    }
    const entry = { clientSocket, upstreamSocket, close };
    entries.add(entry);
    return entry;
  }

  untrackProxyConnection(serviceId, clientSocket, upstreamSocket) {
    const entries = this.proxyConnections.get(serviceId);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.clientSocket === clientSocket && entry.upstreamSocket === upstreamSocket) entries.delete(entry);
    }
    if (entries.size === 0) this.proxyConnections.delete(serviceId);
  }

  closeProxyConnections(serviceId) {
    const entries = this.proxyConnections.get(serviceId);
    if (!entries) return 0;
    const active = Array.from(entries);
    this.proxyConnections.delete(serviceId);
    for (const entry of active) {
      try { entry.close(); } catch (_error) {}
    }
    return active.length;
  }

  resolveProxyTarget(serviceId, requestPath, ownerAgentId, allowOwner = true) {
    const service = this.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    const workspace = this.serviceWorkspace(service);
    if (!workspace || (typeof workspace.archivedAt === 'string' && workspace.archivedAt.length > 0)) return failure('service_workspace_inactive', 'Workspace service scope is no longer active.', 'Restore the workspace or remove the service definition.');
    if (service.status !== 'running' && service.status !== 'degraded') return failure('service_not_running', 'Workspace service is not running.', 'Start the service before opening its proxy.');
    if (!processIsAlive(service.pid)) return failure('service_process_missing', 'Workspace service process is no longer running.', 'Refresh status and start the service again.');
    if (service.visibility === 'owner' && (allowOwner !== true || service.ownerAgentId !== ownerAgentId)) return failure('service_owner_scope_required', 'Owner-only services require a scoped access ticket.', 'Use the Bridge service access flow instead of passing an owner id in the URL.');
    const rawPath = typeof requestPath === 'string' && requestPath.startsWith('/') ? requestPath : '/';
    if (/\r|\n|\0/.test(rawPath) || rawPath.startsWith('//')) return failure('service_proxy_path_invalid', 'Proxy path is invalid.', 'Use a normal absolute HTTP path.');
    return {
      ok: true,
      service,
      target: { protocol: service.protocol, hostname: '127.0.0.1', port: service.port, path: rawPath },
      upstreamAuthorization: service.auth && service.auth.mode === 'environment' ? (process.env[service.auth.environmentVariable] || '') : ''
    };
  }

  proxy(req, res, serviceId, requestPath, ownerAgentId, allowOwner = false) {
    const resolved = this.resolveProxyTarget(serviceId, requestPath, ownerAgentId, allowOwner);
    if (!resolved.ok) return resolved;
    const service = resolved.service;
    const headers = {};
    const allowedRequestHeaders = ['accept', 'accept-language', 'content-type', 'content-length', 'if-none-match', 'if-modified-since', 'range', 'user-agent'];
    for (const name of allowedRequestHeaders) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    headers.host = '127.0.0.1:' + String(service.port);
    headers.connection = 'close';
    if (resolved.upstreamAuthorization) headers.authorization = 'Bearer ' + resolved.upstreamAuthorization;
    const client = service.protocol === 'https' ? https : http;
    const upstream = client.request({ hostname: '127.0.0.1', port: service.port, path: resolved.target.path, method: req.method || 'GET', headers, timeout: this.proxyTimeoutMs, rejectUnauthorized: true }, (upstreamResponse) => {
      const responseHeaders = {};
      const allowedResponseHeaders = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'content-encoding', 'accept-ranges', 'content-range'];
      for (const name of allowedResponseHeaders) if (upstreamResponse.headers[name] !== undefined) responseHeaders[name] = upstreamResponse.headers[name];
      responseHeaders['x-content-type-options'] = 'nosniff';
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    });
    upstream.once('timeout', () => { const timeoutError = new Error('Service proxy request timed out.'); timeoutError.code = 'service_proxy_timeout'; upstream.destroy(timeoutError); });
    upstream.once('error', (error) => {
      if (!res.headersSent) {
        const code = error && error.code === 'service_proxy_timeout' ? 'service_proxy_timeout' : 'service_proxy_failed';
        const body = JSON.stringify({ ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } });
        res.writeHead(code === 'service_proxy_timeout' ? 504 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
      } else {
        res.destroy();
      }
    });
    req.pipe(upstream);
    return { ok: true, service: this.publicService(service) };
  }

  proxyWebSocket(req, socket, head, serviceId, requestPath, ownerAgentId, allowOwner = false) {
    if (!serviceProxyOriginAllowed(req)) return failure('service_origin_not_allowed', 'WebSocket origin does not match the service proxy host.', 'Open the service from its Bridge-issued URL and retry from the same origin.');
    if (!validateWebSocketUpgradeRequest(req)) return failure('service_websocket_handshake_invalid', 'Service proxy requires a valid WebSocket version 13 upgrade request.', 'Retry with a standards-compliant WebSocket client.');
    const resolved = this.resolveProxyTarget(serviceId, requestPath, ownerAgentId, allowOwner);
    if (!resolved.ok) return resolved;
    const service = resolved.service;
    proxyWebSocketUpgrade(req, socket, head, resolved, {
      timeoutMs: this.proxyTimeoutMs,
      onOpen: (clientSocket, upstreamSocket, close) => this.trackProxyConnection(serviceId, clientSocket, upstreamSocket, close),
      onClose: (clientSocket, upstreamSocket) => this.untrackProxyConnection(serviceId, clientSocket, upstreamSocket)
    });
    return { ok: true, service: this.publicService(service) };
  }

  emit(kind, service, ownerId) {
    const explicitOwnerId = normalizeEventOwnerId(ownerId);
    const rememberedOwnerId = service && typeof service.serviceId === 'string' ? this.eventOwners.get(service.serviceId) || '' : '';
    this.broadcast({
      kind,
      ownerId: explicitOwnerId || rememberedOwnerId,
      service: this.publicService(service),
      updatedAt: new Date().toISOString()
    });
  }
}

module.exports = {
  LOG_MAX_BYTES,
  SERVICE_STATE_VERSION,
  ServiceProxyManager,
  digestValue,
  portIsAvailable
};
