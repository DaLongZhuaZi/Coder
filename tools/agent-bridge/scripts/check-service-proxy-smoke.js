'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { ManagedProcessLedger } = require('../src/managed-process-ledger');
const { WorkspaceRegistry } = require('../src/workspace-registry');
const { ServiceProxyManager } = require('../src/service-manager');

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-service-proxy-'));
  const workspacePath = path.join(root, 'workspace');
  fs.mkdirSync(workspacePath, { recursive: true });
  const store = createDaemonStore(path.join(root, 'bridge-home'));
  store.writeWorkspaceRegistry([{
    workspaceId: 'wks-service',
    projectId: 'project-service',
    cwd: workspacePath,
    workspacePath,
    kind: 'directory',
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]);
  const workspaceRegistry = new WorkspaceRegistry(store);
  const agentManager = {
    find(agentId) {
      return agentId === 'agent-service' ? { id: agentId, workspaceId: 'wks-service', archivedAt: '' } : null;
    }
  };
  const ledger = new ManagedProcessLedger(store);
  const events = [];
  const manager = new ServiceProxyManager({
    store,
    workspaceRegistry,
    agentManager,
    managedProcessLedger: ledger,
    broadcast: (event) => events.push(event)
  });
  let blocker = null;
  let activeManager = manager;
  try {
    const definition = {
      serviceId: 'svc-test',
      name: 'Test service',
      workspaceId: 'wks-service',
      ownerAgentId: 'agent-service',
      command: process.execPath,
      args: ['-e', "const http=require('http'); console.log('ready-log'); http.createServer((q,s)=>{if(q.url.startsWith('/health')){s.writeHead(200);s.end('ok');return;}s.writeHead(200,{'content-type':'text/plain'});s.end('proxied');}).listen(Number(process.env.PORT),'127.0.0.1');"],
      cwd: workspacePath,
      port: 43129,
      protocol: 'http',
      health: { kind: 'http', path: '/health', timeoutMs: 1000 },
      visibility: 'owner',
      lifecycle: 'owner'
    };
    const preview = manager.upsert(definition);
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.preview, true);
    const confirmed = manager.upsert(Object.assign({}, definition, { confirm: true, planId: preview.planId }));
    assert.strictEqual(confirmed.ok, true);
    assert.strictEqual(confirmed.confirmed, true);
    assert.strictEqual(store.readWorkspaceServiceState().version, 1);

    const startPreview = await manager.start({ serviceId: 'svc-test' });
    assert.strictEqual(startPreview.preview, true);
    const started = await manager.start({ serviceId: 'svc-test', confirm: true, planId: startPreview.planId });
    assert.strictEqual(started.ok, true, JSON.stringify(started));
    assert.strictEqual(started.service.status, 'running');
    assert(ledger.list().some((item) => item.identity && item.identity.serviceId === 'svc-test'));

    const health = await manager.health({ serviceId: 'svc-test' });
    assert.strictEqual(health.health.ok, true);
    const logs = manager.logs({ serviceId: 'svc-test' });
    assert(logs.text.includes('ready-log'));
    assert.strictEqual(manager.resolveProxyTarget('svc-test', '/hello', '').failureCategory, 'service_owner_scope_required');
    const target = manager.resolveProxyTarget('svc-test', '/hello', 'agent-service');
    assert.strictEqual(target.ok, true);
    assert.strictEqual(target.target.hostname, '127.0.0.1');
    assert.strictEqual(target.target.port, 43129);

    const recoveredManager = new ServiceProxyManager({ store, workspaceRegistry, agentManager, managedProcessLedger: ledger, broadcast: () => {} });
    const recovered = await recoveredManager.reconcile();
    assert.strictEqual(recovered.results[0].recovered, true);
    activeManager = recoveredManager;

    blocker = net.createServer();
    await listen(blocker, 43130);
    const conflictDefinition = Object.assign({}, definition, { serviceId: 'svc-conflict', ownerAgentId: '', port: 43130, lifecycle: 'workspace' });
    const conflictPreview = recoveredManager.upsert(conflictDefinition);
    recoveredManager.upsert(Object.assign({}, conflictDefinition, { confirm: true, planId: conflictPreview.planId }));
    const conflictStartPreview = await recoveredManager.start({ serviceId: 'svc-conflict' });
    const conflict = await recoveredManager.start({ serviceId: 'svc-conflict', confirm: true, planId: conflictStartPreview.planId });
    assert.strictEqual(conflict.failureCategory, 'service_port_conflict');

    const cleanup = await recoveredManager.cleanupByOwner('agent-service', 'agent_archived');
    assert.strictEqual(cleanup.stopped.length, 1);
    assert.strictEqual(recoveredManager.status({ serviceId: 'svc-test' }).service.status, 'stopped');
    assert(events.some((event) => event.kind === 'service.started'));

    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    assert(serverSource.includes('resolveServiceProxyRoute(reqUrl'));
    assert(serverSource.includes('handlePathServiceHttpRequest'));
    assert(serverSource.includes('serviceAccessTicketManager.exchangeTicket'));
    assert(serverSource.includes('serviceSessionCookie'));
    assert(serverSource.includes('EventType.WORKSPACE_SERVICE_UPDATED'));
    console.log('Service proxy smoke passed.');
  } finally {
    if (blocker) await close(blocker);
    const service = activeManager.find('svc-test');
    if (service && service.pid > 0) await activeManager.stopServiceProcess(service, 'smoke_cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
