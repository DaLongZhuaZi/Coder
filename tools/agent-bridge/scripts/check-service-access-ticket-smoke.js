'use strict';

const assert = require('assert');
const {
  SERVICE_SESSION_COOKIE,
  ServiceAccessTicketManager,
  normalizeAccessHost,
  readCookieValue,
  serviceSessionCookie
} = require('../src/service-access-ticket-manager');

function main() {
  let now = Date.parse('2026-07-16T00:00:00.000Z');
  const ownerService = {
    serviceId: 'svc-owner',
    workspaceId: 'wks-1',
    ownerAgentId: 'agent-1',
    visibility: 'owner',
    status: 'running',
    pid: 4242,
    startedAt: '2026-07-16T00:00:00.000Z'
  };
  const workspaceService = {
    serviceId: 'svc-workspace',
    workspaceId: 'wks-1',
    ownerAgentId: '',
    visibility: 'workspace',
    status: 'running',
    pid: 4243,
    startedAt: '2026-07-16T00:00:00.000Z'
  };
  const services = new Map([[ownerService.serviceId, ownerService], [workspaceService.serviceId, workspaceService]]);
  const serviceManager = {
    find(serviceId) { return services.get(serviceId) || null; },
    publicService(service) { return { serviceId: service.serviceId, visibility: service.visibility, ownerAgentId: service.ownerAgentId }; },
    resolveProxyTarget(serviceId, _path, ownerAgentId, allowOwner) {
      const service = services.get(serviceId);
      if (!service) return { ok: false, failureCategory: 'service_not_found' };
      if (service.status !== 'running') return { ok: false, failureCategory: 'service_not_running' };
      if (service.visibility === 'owner' && (allowOwner !== true || ownerAgentId !== service.ownerAgentId)) {
        return { ok: false, failureCategory: 'service_owner_scope_required' };
      }
      return { ok: true, service };
    }
  };
  const manager = new ServiceAccessTicketManager({
    serviceManager,
    now: () => now,
    planTtlMs: 2000,
    ticketTtlMs: 1000,
    sessionTtlMs: 5000
  });
  const context = { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787' };

  assert.strictEqual(normalizeAccessHost('127.0.0.1:8787'), '127.0.0.1:8787');
  assert.strictEqual(normalizeAccessHost('evil.test/path'), '');
  assert.strictEqual(manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-other' }, context).failureCategory, 'service_owner_scope_required');

  const preview = manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-1' }, context);
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.preview, true);
  assert.strictEqual(preview.confirmed, false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(preview, 'accessUrl'), false);

  const stale = manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-1', confirm: true, planId: 'missing' }, context);
  assert.strictEqual(stale.failureCategory, 'service_access_plan_stale');
  const confirmed = manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-1', confirm: true, planId: preview.planId }, context);
  assert.strictEqual(confirmed.ok, true);
  assert.strictEqual(confirmed.confirmed, true);
  assert.strictEqual(confirmed.singleUse, true);
  assert(confirmed.accessUrl.startsWith('http://127.0.0.1:8787/service/svc-owner/?accessTicket='));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(confirmed, 'ticket'), false);
  assert.strictEqual(confirmed.accessUrl.includes('Bearer'), false);

  const parsed = new URL(confirmed.accessUrl);
  const ticket = parsed.searchParams.get('accessTicket');
  const exchanged = manager.exchangeTicket(ticket, { serviceId: 'svc-owner', host: '127.0.0.1:8787' });
  assert.strictEqual(exchanged.ok, true);
  assert.strictEqual(exchanged.ownerAgentId, 'agent-1');
  assert.strictEqual(manager.exchangeTicket(ticket, { serviceId: 'svc-owner', host: '127.0.0.1:8787' }).failureCategory, 'service_access_ticket_invalid');
  assert.strictEqual(manager.authorizeSession(exchanged.sessionId, { serviceId: 'svc-owner', host: 'evil.test:8787' }).failureCategory, 'service_access_scope_mismatch');
  assert.strictEqual(manager.authorizeSession(exchanged.sessionId, { serviceId: 'svc-owner', host: '127.0.0.1:8787' }).failureCategory, 'service_access_session_invalid');

  const workspacePreview = manager.open({ serviceId: 'svc-workspace' }, context);
  const workspaceOpen = manager.open({ serviceId: 'svc-workspace', confirm: true, planId: workspacePreview.planId }, context);
  const workspaceTicket = new URL(workspaceOpen.accessUrl).searchParams.get('accessTicket');
  const workspaceExchange = manager.exchangeTicket(workspaceTicket, { serviceId: 'svc-workspace', host: context.host });
  assert.strictEqual(workspaceExchange.ok, true);
  assert.strictEqual(manager.authorizeSession(workspaceExchange.sessionId, { serviceId: 'svc-workspace', host: context.host }).ok, true);
  workspaceService.pid = 5000;
  assert.strictEqual(manager.authorizeSession(workspaceExchange.sessionId, { serviceId: 'svc-workspace', host: context.host }).failureCategory, 'service_access_stale');

  const expiringPreview = manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-1' }, context);
  now += 2001;
  assert.strictEqual(manager.open({ serviceId: 'svc-owner', ownerAgentId: 'agent-1', confirm: true, planId: expiringPreview.planId }, context).failureCategory, 'service_access_plan_stale');

  const cookie = serviceSessionCookie('a'.repeat(43), 'svc-owner', 300, true);
  assert(cookie.includes('HttpOnly'));
  assert(cookie.includes('SameSite=Strict'));
  assert(cookie.includes('Secure'));
  assert(cookie.includes('Path=/service/svc-owner/'));
  assert.strictEqual(readCookieValue('other=1; ' + cookie, SERVICE_SESSION_COOKIE), 'a'.repeat(43));
  assert.strictEqual(readCookieValue('ngf_service_access=bad value', SERVICE_SESSION_COOKIE), '');

  console.log('Service access ticket smoke passed.');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
