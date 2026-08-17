'use strict';

const crypto = require('crypto');
const { randomId } = require('./daemon-store');
const { digestValue } = require('./service-manager');

const ACCESS_PLAN_TTL_MS = 2 * 60 * 1000;
const ACCESS_TICKET_TTL_MS = 60 * 1000;
const ACCESS_SESSION_TTL_MS = 5 * 60 * 1000;
const SERVICE_SESSION_COOKIE = 'ngf_service_access';

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackValue;
  return typeof source[key] === 'boolean' ? source[key] : fallbackValue;
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

function normalizeAccessHost(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim().toLowerCase();
  if (input.length === 0 || input.length > 512 || /[\r\n\0\s/@]/.test(input)) return '';
  try {
    const parsed = new URL('http://' + input);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.host.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function normalizeAccessOrigin(value, expectedHost) {
  if (typeof value !== 'string' || value.length === 0) return '';
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) return '';
    if (normalizeAccessHost(parsed.host) !== expectedHost) return '';
    return parsed.protocol + '//' + parsed.host;
  } catch (_error) {
    return '';
  }
}

function readCookieValue(header, name) {
  if (typeof header !== 'string' || header.length === 0 || header.length > 16384) return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.substring(0, separator).trim() !== name) continue;
    const value = part.substring(separator + 1).trim();
    return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : '';
  }
  return '';
}

function serviceSessionCookie(sessionId, serviceId, maxAgeSec, secure) {
  const attributes = [
    SERVICE_SESSION_COOKIE + '=' + sessionId,
    'Path=/service/' + encodeURIComponent(serviceId) + '/',
    'Max-Age=' + String(Math.max(0, Math.floor(maxAgeSec))),
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (secure === true) attributes.push('Secure');
  return attributes.join('; ');
}

class ServiceAccessTicketManager {
  constructor(options) {
    this.serviceManager = options.serviceManager;
    this.planTtlMs = Math.max(1000, Math.min(10 * 60 * 1000, Number(options.planTtlMs) || ACCESS_PLAN_TTL_MS));
    this.ticketTtlMs = Math.max(1000, Math.min(5 * 60 * 1000, Number(options.ticketTtlMs) || ACCESS_TICKET_TTL_MS));
    this.sessionTtlMs = Math.max(1000, Math.min(30 * 60 * 1000, Number(options.sessionTtlMs) || ACCESS_SESSION_TTL_MS));
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.plans = new Map();
    this.tickets = new Map();
    this.sessions = new Map();
  }

  serviceSnapshot(service, host) {
    return {
      serviceId: service.serviceId,
      workspaceId: service.workspaceId,
      ownerAgentId: service.ownerAgentId || '',
      visibility: service.visibility === 'owner' ? 'owner' : 'workspace',
      host,
      pid: Number.isFinite(service.pid) ? service.pid : 0,
      startedAt: typeof service.startedAt === 'string' ? service.startedAt : ''
    };
  }

  prune() {
    const now = this.now();
    for (const [id, record] of this.plans.entries()) if (record.expiresAt <= now) this.plans.delete(id);
    for (const [id, record] of this.tickets.entries()) if (record.expiresAt <= now) this.tickets.delete(id);
    for (const [id, record] of this.sessions.entries()) if (record.expiresAt <= now) this.sessions.delete(id);
  }

  open(payload, context) {
    this.prune();
    const serviceId = readString(payload, 'serviceId', '');
    const service = this.serviceManager.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list and choose an existing service.');
    const host = normalizeAccessHost(readString(context, 'host', ''));
    const origin = normalizeAccessOrigin(readString(context, 'origin', ''), host);
    if (!host || !origin) {
      return failure('service_access_host_invalid', 'A trusted Bridge request Host is required to open a service.', 'Reconnect directly to the Bridge and request a new access preview.');
    }
    const requestedOwnerAgentId = readString(payload, 'ownerAgentId', readString(payload, 'agentId', ''));
    if (service.visibility === 'owner' && (!requestedOwnerAgentId || requestedOwnerAgentId !== service.ownerAgentId)) {
      return failure('service_owner_scope_required', 'Owner-only services require the matching Agent scope.', 'Select the owning Agent and request a fresh access preview.');
    }
    const resolved = this.serviceManager.resolveProxyTarget(serviceId, '/', service.ownerAgentId || '', true);
    if (!resolved.ok) return resolved;
    const snapshot = this.serviceSnapshot(service, host);
    if (!readBoolean(payload, 'confirm', false)) {
      const planId = randomId('svcopen');
      const expiresAtMs = this.now() + this.planTtlMs;
      this.plans.set(planId, { planId, snapshot, digest: digestValue(snapshot), origin, expiresAt: expiresAtMs });
      return {
        ok: true,
        preview: true,
        confirmed: false,
        planId,
        service: this.serviceManager.publicService(service),
        accessHost: host,
        expiresAt: new Date(expiresAtMs).toISOString(),
        warnings: ['Confirming creates a short-lived, single-use service access URL.'],
        updatedAt: new Date().toISOString()
      };
    }
    const planId = readString(payload, 'planId', '');
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    const currentSnapshot = this.serviceSnapshot(service, host);
    if (!plan || plan.expiresAt <= this.now() || plan.digest !== digestValue(currentSnapshot) || plan.origin !== origin) {
      return failure('service_access_plan_stale', 'Service access plan is missing, expired, or no longer matches the service.', 'Request a fresh service access preview before confirming.');
    }
    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAtMs = this.now() + this.ticketTtlMs;
    this.tickets.set(ticket, {
      snapshot: currentSnapshot,
      digest: digestValue(currentSnapshot),
      expiresAt: expiresAtMs
    });
    const accessUrl = origin + '/service/' + encodeURIComponent(serviceId) + '/?accessTicket=' + encodeURIComponent(ticket);
    return {
      ok: true,
      preview: false,
      confirmed: true,
      planId,
      service: this.serviceManager.publicService(service),
      accessUrl,
      expiresAt: new Date(expiresAtMs).toISOString(),
      singleUse: true,
      warnings: [],
      updatedAt: new Date().toISOString()
    };
  }

  validateRecord(record, serviceId, host) {
    if (!record || record.expiresAt <= this.now()) return failure('service_access_expired', 'Service access authorization expired.', 'Request a new service access URL.');
    if (record.snapshot.serviceId !== serviceId || record.snapshot.host !== host) {
      return failure('service_access_scope_mismatch', 'Service access authorization does not match this service or Host.', 'Request a new service access URL from this Bridge endpoint.');
    }
    const service = this.serviceManager.find(serviceId);
    if (!service) return failure('service_not_found', 'Workspace service was not found.', 'Refresh the service list.');
    const current = this.serviceSnapshot(service, host);
    if (record.digest !== digestValue(current)) {
      return failure('service_access_stale', 'Service access authorization no longer matches the running service.', 'Request a new service access URL after the service change.');
    }
    const resolved = this.serviceManager.resolveProxyTarget(serviceId, '/', current.ownerAgentId, true);
    if (!resolved.ok) return resolved;
    return { ok: true, service, snapshot: current };
  }

  exchangeTicket(ticket, context) {
    this.prune();
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) {
      return failure('service_access_ticket_invalid', 'Service access ticket is invalid.', 'Request a new service access URL.');
    }
    const record = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!record) return failure('service_access_ticket_invalid', 'Service access ticket is missing, expired, or already used.', 'Request a new service access URL.');
    const serviceId = readString(context, 'serviceId', '');
    const host = normalizeAccessHost(readString(context, 'host', ''));
    const validated = this.validateRecord(record, serviceId, host);
    if (!validated.ok) return validated;
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const expiresAtMs = this.now() + this.sessionTtlMs;
    this.sessions.set(sessionId, {
      snapshot: validated.snapshot,
      digest: digestValue(validated.snapshot),
      expiresAt: expiresAtMs
    });
    return {
      ok: true,
      sessionId,
      serviceId,
      ownerAgentId: validated.snapshot.ownerAgentId,
      visibility: validated.snapshot.visibility,
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxAgeSec: Math.max(1, Math.floor(this.sessionTtlMs / 1000))
    };
  }

  authorizeSession(sessionId, context) {
    this.prune();
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionId)) {
      return failure('service_access_session_invalid', 'Service access session is invalid.', 'Open the service again.');
    }
    const record = this.sessions.get(sessionId);
    if (!record) return failure('service_access_session_invalid', 'Service access session is missing or expired.', 'Open the service again.');
    const serviceId = readString(context, 'serviceId', '');
    const host = normalizeAccessHost(readString(context, 'host', ''));
    const validated = this.validateRecord(record, serviceId, host);
    if (!validated.ok) {
      this.sessions.delete(sessionId);
      return validated;
    }
    return {
      ok: true,
      serviceId,
      ownerAgentId: validated.snapshot.ownerAgentId,
      visibility: validated.snapshot.visibility,
      expiresAt: new Date(record.expiresAt).toISOString()
    };
  }
}

module.exports = {
  ACCESS_PLAN_TTL_MS,
  ACCESS_SESSION_TTL_MS,
  ACCESS_TICKET_TTL_MS,
  SERVICE_SESSION_COOKIE,
  ServiceAccessTicketManager,
  normalizeAccessHost,
  readCookieValue,
  serviceSessionCookie
};
