'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { AgentManager } = require('../src/agent-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { NotificationManager } = require('../src/notification-manager');
const { EventType } = require('../src/protocol');
const { WorkspaceRegistry } = require('../src/workspace-registry');

const bridgeRoot = path.resolve(__dirname, '..');
const launcherPath = path.join(bridgeRoot, 'src', 'desktop-launcher.js');
const serverPath = path.join(bridgeRoot, 'src', 'server.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-management-cli-live-'));
const remoteHome = path.join(root, 'remote');
const localHome = path.join(root, 'local');
const gitRepo = path.join(root, 'git-repo');
const token = 'management-cli-live-token';

function runGit(cwd, args) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

async function waitForHealth(url, child, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Bridge exited before health check: ' + output.join(''));
    }
    try {
      const response = await requestJson(url);
      if (response.statusCode === 200 && response.body && response.body.ok === true) {
        return response.body;
      }
    } catch (_error) {
      // Listener startup is asynchronous.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Bridge health: ' + output.join(''));
}

function runCli(home, args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcherPath].concat(args), {
      cwd: bridgeRoot,
      windowsHide: true,
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_HOME: home,
        AGENT_BRIDGE_HOOK_HOME: home,
        NO_COLOR: '1'
      }, extraEnv || {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
    child.once('error', reject);
    child.once('exit', (code) => {
      const text = stdout.join('').trim();
      let payload = null;
      if (text.length > 0) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          reject(new Error('CLI returned invalid JSON. stdout=' + text + ' stderr=' + stderr.join('') + ' error=' + String(error)));
          return;
        }
      }
      resolve({
        exitCode: code === null ? 1 : code,
        payload,
        stdout: text,
        stderr: stderr.join('')
      });
    });
  });
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await waitForExit(child, 5000);
  if (child.exitCode === null) {
    child.kill();
    await waitForExit(child, 2000);
  }
}

function seedRemoteAgent() {
  const store = createDaemonStore(remoteHome);
  const workspaceRegistry = new WorkspaceRegistry(store);
  const agentManager = new AgentManager({ store, workspaceRegistry });
  const publicAgent = agentManager.createPlaceholder({
    providerId: 'mock',
    workspacePath: remoteHome,
    cwd: remoteHome,
    title: 'Remote CLI Smoke Agent'
  });
  const record = agentManager.find(publicAgent.id);
  agentManager.appendTimeline(record, 'message', EventType.MESSAGE_DELTA, {
    providerId: 'mock',
    messageId: 'remote-message',
    role: 'assistant',
    text: 'remote timeline smoke\n'
  }, {
    event: EventType.MESSAGE_DELTA
  });
  const requests = [
    {
      eventType: EventType.PERMISSION_REQUESTED,
      requestId: 'permission-live',
      permissionId: 'permission-live',
      title: 'Remote permission',
      prompt: 'Allow remote permission?'
    },
    {
      eventType: EventType.QUESTION_REQUESTED,
      requestId: 'question-live',
      permissionId: '',
      title: 'Remote question',
      prompt: 'Answer remote question?'
    },
    {
      eventType: EventType.PLAN_REQUESTED,
      requestId: 'plan-live',
      permissionId: '',
      title: 'Remote plan',
      prompt: 'Approve remote plan?'
    }
  ];
  for (const request of requests) {
    agentManager.appendTimeline(record, 'permission', request.eventType, {
      providerId: 'mock',
      sessionId: '',
      requestId: request.requestId,
      permissionId: request.permissionId,
      planId: request.eventType === EventType.PLAN_REQUESTED ? request.requestId : '',
      title: request.title,
      prompt: request.prompt,
      status: 'pending'
    }, {
      event: request.eventType,
      payload: request
    });
  }
  agentManager.persist(record);
  const notificationManager = new NotificationManager(store);
  const notification = notificationManager.create({
    kind: 'permission',
    severity: 'warning',
    title: 'Remote CLI notification',
    body: 'Remote notification wait smoke.',
    agentId: publicAgent.id,
    route: {
      kind: 'permission',
      agentId: publicAgent.id,
      requestId: 'permission-live'
    }
  });
  assert(notification && notification.notificationId.length > 0, 'remote smoke notification should be persisted');
  return {
    store,
    agentId: publicAgent.id,
    notificationId: notification.notificationId
  };
}

function startCaptureFixture(port) {
  let captureCall = 0;
  const snapshots = [
    { text: 'alpha\n', status: 'running', seq: 1, restoreSeq: 1 },
    { text: 'alpha\nbeta\n', status: 'running', seq: 2, restoreSeq: 2 },
    { text: 'alpha\nbeta\n', status: 'closed', seq: 2, restoreSeq: 3 }
  ];
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/rpc') {
      response.writeHead(404);
      response.end();
      return;
    }
    const auth = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
    if (auth !== 'Bearer fixture-token') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'fixture token required' } }));
      return;
    }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.strictEqual(body.type, 'terminal.capture');
      const snapshot = snapshots[Math.min(captureCall, snapshots.length - 1)];
      captureCall += 1;
      const payload = {
        terminal: {
          terminalId: 'fixture-terminal',
          status: snapshot.status,
          snapshotSeq: snapshot.seq
        },
        text: snapshot.text,
        source: 'memory',
        restoreSeq: snapshot.restoreSeq,
        snapshot: {
          seq: snapshot.seq,
          restoreSeq: snapshot.restoreSeq,
          source: 'memory'
        }
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        ok: true,
        response: {
          id: body.id,
          type: 'response',
          ok: true,
          payload
        },
        messages: []
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, getCaptureCalls: () => captureCall }));
  });
}

async function closeServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  fs.mkdirSync(remoteHome, { recursive: true });
  fs.mkdirSync(localHome, { recursive: true });
  fs.mkdirSync(gitRepo, { recursive: true });
  runGit(gitRepo, ['init']);
  runGit(gitRepo, ['config', 'user.email', 'bridge@example.test']);
  runGit(gitRepo, ['config', 'user.name', 'Bridge CLI Live']);
  fs.writeFileSync(path.join(gitRepo, 'tracked.txt'), 'base\n', 'utf8');
  runGit(gitRepo, ['add', 'tracked.txt']);
  runGit(gitRepo, ['commit', '-m', 'initial']);
  fs.writeFileSync(path.join(gitRepo, 'tracked.txt'), 'changed\n', 'utf8');
  const seeded = seedRemoteAgent();
  const localStore = createDaemonStore(localHome);
  assert.notStrictEqual(seeded.store.serverId, localStore.serverId);
  const bridgePort = await reservePort();
  const capturePort = await reservePort();
  const bridgeOutput = [];
  let bridgeChild = null;
  let captureFixture = null;
  try {
    bridgeChild = spawn(process.execPath, [serverPath], {
      cwd: bridgeRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_HOME: remoteHome,
        AGENT_BRIDGE_HOST: '127.0.0.1',
        AGENT_BRIDGE_PORT: String(bridgePort),
        AGENT_BRIDGE_TOKEN: token
      })
    });
    bridgeChild.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
    bridgeChild.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
    const bridgeUrl = 'http://127.0.0.1:' + String(bridgePort);
    await waitForHealth(bridgeUrl + '/health', bridgeChild, bridgeOutput);

    const remoteStatus = await runCli(localHome, [
      'daemon', 'status', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(remoteStatus.exitCode, 0);
    assert.strictEqual(remoteStatus.payload.serverId, seeded.store.serverId);

    const daemonConfigStatus = await runCli(localHome, [
      'daemon', 'config', 'status', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(daemonConfigStatus.exitCode, 0);
    assert.strictEqual(daemonConfigStatus.payload.action, 'daemon.config.status');
    assert.strictEqual(daemonConfigStatus.payload.ok, true);

    const daemonConfigPreview = await runCli(localHome, [
      'daemon', 'config', 'preview', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.notStrictEqual(daemonConfigPreview.exitCode, 0);
    assert.strictEqual(daemonConfigPreview.payload.action, 'daemon.config.preview');
    assert.strictEqual(daemonConfigPreview.payload.failureCategory, 'config_missing');

    const daemonConfigOffline = await runCli(localHome, [
      'daemon', 'config', 'status', '--connect-host', '127.0.0.1', '--port', String(capturePort), '--token', token
    ]);
    assert.notStrictEqual(daemonConfigOffline.exitCode, 0);
    assert.strictEqual(daemonConfigOffline.payload.failureCategory, 'live_bridge_required');

    const relayStatus = await runCli(localHome, [
      'relay', 'status', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(relayStatus.exitCode, 0);
    assert.strictEqual(relayStatus.payload.action, 'relay.status');
    assert.strictEqual(relayStatus.payload.e2ee.protocolVersion, 'ngf-agent-bridge.relay.v1');
    assert.strictEqual(typeof relayStatus.payload.identity.publicKeyFingerprint, 'string');

    const relayDevices = await runCli(localHome, [
      'relay', 'devices', '--include-revoked', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(relayDevices.exitCode, 0);
    assert.strictEqual(relayDevices.payload.action, 'relay.device.list');
    assert.ok(Array.isArray(relayDevices.payload.devices));

    const schedulePreview = await runCli(localHome, [
      'schedule', 'create', '--name', 'CLI schedule', '--prompt', 'Report status', '--cwd', root,
      '--provider', 'mock', '--cron', '0 0 * * *', '--timezone', 'UTC', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(schedulePreview.exitCode, 0);
    assert.strictEqual(schedulePreview.payload.preview, true);
    const scheduleCreate = await runCli(localHome, [
      'schedule', 'create', '--plan-id', schedulePreview.payload.planId, '--confirm', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(scheduleCreate.payload.confirmed, true);
    const scheduleId = scheduleCreate.payload.schedule.id;
    const runPreview = await runCli(localHome, [
      'schedule', 'run-now', '--id', scheduleId, '--daemon-url', bridgeUrl, '--token', token
    ]);
    const runConfirmed = await runCli(localHome, [
      'schedule', 'run-now', '--id', scheduleId, '--plan-id', runPreview.payload.planId, '--confirm', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(runConfirmed.payload.confirmed, true);
    await delay(100);
    const scheduleHistory = await runCli(localHome, [
      'schedule', 'history', '--id', scheduleId, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(scheduleHistory.payload.runs.length, 1);
    assert.ok(['running', 'succeeded'].includes(scheduleHistory.payload.runs[0].status));

    const loopPreview = await runCli(localHome, [
      'loop', 'create', '--name', 'CLI loop', '--prompt', 'Do one task', '--verify-prompt', 'Return JSON',
      '--criterion', 'The task is complete', '--cwd', root, '--provider', 'mock', '--workspace-mode', 'shared',
      '--max-rounds', '1', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(loopPreview.payload.preview, true);
    const loopCreate = await runCli(localHome, [
      'loop', 'create', '--plan-id', loopPreview.payload.planId, '--confirm', '--daemon-url', bridgeUrl, '--token', token
    ]);
    const loopId = loopCreate.payload.loop.id;
    const loopStartPreview = await runCli(localHome, ['loop', 'start', '--id', loopId, '--daemon-url', bridgeUrl, '--token', token]);
    const loopStart = await runCli(localHome, [
      'loop', 'start', '--id', loopId, '--plan-id', loopStartPreview.payload.planId, '--confirm', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(loopStart.payload.confirmed, true);
    await delay(100);
    const loopGet = await runCli(localHome, ['loop', 'get', '--id', loopId, '--daemon-url', bridgeUrl, '--token', token]);
    assert.ok(['running', 'failed'].includes(loopGet.payload.loop.status));
    assert.strictEqual(loopGet.payload.loop.rounds.length, 1);

    const roomPreview = await runCli(localHome, [
      'chat', 'create', '--name', 'CLI room', '--purpose', 'Live mapping', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(roomPreview.payload.preview, true);
    const roomCreate = await runCli(localHome, [
      'chat', 'create', '--plan-id', roomPreview.payload.planId, '--confirm', '--daemon-url', bridgeUrl, '--token', token
    ]);
    const roomId = roomCreate.payload.room.id;
    const roomPost = await runCli(localHome, [
      'chat', 'message', 'post', '--room-id', roomId, '--body', 'Hello from CLI', '--client-message-id', 'cli-live-message',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(roomPost.payload.message.seq, 1);
    const roomMessages = await runCli(localHome, [
      'chat', 'message', 'list', '--room-id', roomId, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(roomMessages.payload.messages.length, 1);
    assert.strictEqual(roomMessages.payload.messages[0].body, 'Hello from CLI');

    const aliasStatus = await runCli(localHome, [
      'daemon', 'status', '--host', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(aliasStatus.payload.serverId, seeded.store.serverId);

    const environmentStatus = await runCli(localHome, ['daemon', 'status'], {
      AGENT_BRIDGE_CLI_HOST: bridgeUrl,
      AGENT_BRIDGE_TOKEN: token
    });
    assert.strictEqual(environmentStatus.payload.serverId, seeded.store.serverId);

    const unauthorized = await runCli(localHome, [
      'daemon', 'status', '--daemon-url', bridgeUrl, '--token', 'wrong-token'
    ]);
    assert.notStrictEqual(unauthorized.exitCode, 0);
    assert.strictEqual(unauthorized.payload.code, 'unauthorized');
    assert.strictEqual(unauthorized.payload.remote, true);
    assert.strictEqual(unauthorized.payload.serverId, undefined);

    const relayRejected = await runCli(localHome, [
      'daemon', 'status', '--daemon-url', 'https://app.paseo.sh/#offer=smoke', '--token', token
    ]);
    assert.notStrictEqual(relayRejected.exitCode, 0);
    assert.strictEqual(relayRejected.payload.code, 'remote_target_unsupported');

    const unauthorizedAgentWait = await runCli(localHome, [
      'agent', 'wait', seeded.agentId, '--status', 'any', '--timeout-ms', '1000',
      '--daemon-url', bridgeUrl, '--token', 'wrong-token'
    ]);
    assert.notStrictEqual(unauthorizedAgentWait.exitCode, 0);
    assert.strictEqual(unauthorizedAgentWait.payload.code, 'unauthorized');
    assert.strictEqual(unauthorizedAgentWait.payload.action, 'agent.wait');

    const unauthorizedCapabilities = await runCli(localHome, [
      'provider', 'capabilities', '--daemon-url', bridgeUrl, '--token', 'wrong-token'
    ]);
    assert.notStrictEqual(unauthorizedCapabilities.exitCode, 0);
    assert.strictEqual(unauthorizedCapabilities.payload.code, 'unauthorized');
    assert.strictEqual(unauthorizedCapabilities.payload.action, 'provider.capabilities');

    const remoteWait = await runCli(localHome, [
      'agent', 'wait', seeded.agentId, '--status', 'any', '--timeout-ms', '1000',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(remoteWait.exitCode, 0);
    assert.strictEqual(remoteWait.payload.matched, true);
    assert.strictEqual(remoteWait.payload.source, 'live');

    const positionalRun = await runCli(localHome, [
      'agent', 'run', 'remote positional prompt', '--provider-id', 'mock', '--cwd', remoteHome,
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(positionalRun.exitCode, 0);
    assert.strictEqual(positionalRun.payload.accepted, true);
    assert.strictEqual(positionalRun.payload.created, true);
    assert.ok(positionalRun.payload.agent && positionalRun.payload.agent.id !== 'remote positional prompt');

    const attachedAgent = await runCli(localHome, [
      'agent', 'attach', positionalRun.payload.agent.id, '--json', '--max-polls', '1',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(attachedAgent.exitCode, 0);
    assert.strictEqual(attachedAgent.payload.action, 'agent.attach');
    assert.strictEqual(attachedAgent.payload.attached, true);
    assert.strictEqual(attachedAgent.payload.source, 'live');
    assert.ok(attachedAgent.payload.text.indexOf('remote positional prompt') >= 0);

    const configuredLocalRun = await runCli(localHome, [
      'agent', 'run', 'configured local target prompt', '--provider-id', 'mock', '--cwd', remoteHome,
      '--connect-host', '127.0.0.1', '--port', String(bridgePort), '--token', token
    ]);
    assert.strictEqual(configuredLocalRun.exitCode, 0);
    assert.strictEqual(configuredLocalRun.payload.accepted, true);
    assert.strictEqual(configuredLocalRun.payload.action, 'agent.run');

    const localAgentCountBeforeUnavailableRun = localStore.listAgentRecords().length;
    const unavailableLocalRun = await runCli(localHome, [
      'agent', 'run', 'must not become an offline placeholder', '--provider-id', 'mock',
      '--connect-host', '127.0.0.1', '--port', String(capturePort), '--token', token
    ]);
    assert.notStrictEqual(unavailableLocalRun.exitCode, 0);
    assert.strictEqual(unavailableLocalRun.payload.code, 'live_bridge_required');
    assert.strictEqual(unavailableLocalRun.payload.rpcFailureCategory, 'rpc_unavailable');
    assert.strictEqual(localStore.listAgentRecords().length, localAgentCountBeforeUnavailableRun);

    const followedAgent = await runCli(localHome, [
      'agent', 'logs', seeded.agentId, '--follow', '--json', '--max-polls', '1',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(followedAgent.exitCode, 0);
    assert.strictEqual(followedAgent.payload.action, 'agent.logs.follow');
    assert.strictEqual(followedAgent.payload.source, 'live');
    assert.ok(followedAgent.payload.text.indexOf('remote timeline smoke') >= 0);

    const listedAgents = await runCli(localHome, [
      'agent', 'list', '--tree', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(listedAgents.exitCode, 0);
    assert.ok(Array.isArray(listedAgents.payload.agents));
    assert.ok(listedAgents.payload.agents.some((agent) => agent.id === seeded.agentId));

    const checkpointCreated = await runCli(localHome, [
      'agent', 'checkpoint', 'create', seeded.agentId, '--title', 'Remote Checkpoint',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(checkpointCreated.exitCode, 0);
    assert.ok(checkpointCreated.payload.checkpoint.checkpointId.length > 0);

    const checkpointListed = await runCli(localHome, [
      'agent', 'checkpoint', 'list', seeded.agentId, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.ok(checkpointListed.payload.checkpoints.some((checkpoint) => checkpoint.checkpointId === checkpointCreated.payload.checkpoint.checkpointId));

    const forkedAgent = await runCli(localHome, [
      'agent', 'fork', seeded.agentId, '--title', 'Remote Fork', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(forkedAgent.exitCode, 0);
    assert.strictEqual(forkedAgent.payload.agent.forkedFromAgentId, seeded.agentId);

    const detachedAgent = await runCli(localHome, [
      'agent', 'detach', forkedAgent.payload.agent.id, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(detachedAgent.exitCode, 0);
    assert.strictEqual(detachedAgent.payload.agent.detached, true);

    const archivedAgent = await runCli(localHome, [
      'agent', 'archive', forkedAgent.payload.agent.id, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(archivedAgent.exitCode, 0);
    assert.ok(archivedAgent.payload.agent.archivedAt.length > 0);

    const providerProfiles = await runCli(localHome, [
      'provider', 'list', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(providerProfiles.exitCode, 0);
    assert.ok(Array.isArray(providerProfiles.payload.profiles));

    const providerSaved = await runCli(localHome, [
      'provider', 'upsert', '--profile-id', 'remote-smoke-profile', '--provider-id', 'remote-smoke',
      '--name', 'Remote Smoke', '--binary', process.execPath, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(providerSaved.exitCode, 0);
    assert.strictEqual(providerSaved.payload.profile.profileId, 'remote-smoke-profile');

    const providerSecret = 'remote-provider-secret-smoke';
    const providerEnv = await runCli(localHome, [
      'provider', 'env', '--profile-id', 'remote-smoke-profile', '--set', 'R1_SECRET=' + providerSecret,
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(providerEnv.exitCode, 0, JSON.stringify(providerEnv.payload));
    assert.deepStrictEqual(providerEnv.payload.profile.env, {});
    assert.strictEqual(JSON.stringify(providerEnv.payload).includes(providerSecret), false);
    assert.ok(providerEnv.payload.profile.envMetadata.some((item) => item.key === 'R1_SECRET' && item.configured === true));

    const providerListedAfterSecret = await runCli(localHome, [
      'provider', 'list', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(providerListedAfterSecret.exitCode, 0);
    assert.strictEqual(JSON.stringify(providerListedAfterSecret.payload).includes(providerSecret), false);

    const providerTest = await runCli(localHome, [
      'provider', 'test', '--profile-id', 'remote-smoke-profile', '--run',
      '--test-args', '-e "process.stdout.write(process.env.R1_SECRET || \'\')"',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(providerTest.exitCode, 0);
    assert.strictEqual(providerTest.payload.commandRan, true);
    assert.strictEqual(providerTest.payload.stdout.includes(providerSecret), false);
    assert.ok(providerTest.payload.stdout.includes('[redacted]'));

    const workspaceImported = await runCli(localHome, [
      'workspace', 'import', '--path', remoteHome, '--title', 'Remote Workspace', '--confirm',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(workspaceImported.exitCode, 0);
    assert.strictEqual(workspaceImported.payload.confirmed, true);
    assert.strictEqual(workspaceImported.payload.workspace.cwd, path.resolve(remoteHome));

    const workspaceListed = await runCli(localHome, [
      'workspace', 'list', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.ok(workspaceListed.payload.workspaces.some((workspace) => workspace.cwd === path.resolve(remoteHome)));

    const workspaceArchivePreview = await runCli(localHome, [
      'workspace', 'archive', workspaceImported.payload.workspace.workspaceId,
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(workspaceArchivePreview.exitCode, 0);
    assert.strictEqual(workspaceArchivePreview.payload.preview, true);
    assert.strictEqual(workspaceArchivePreview.payload.confirmed, false);
    assert.strictEqual(workspaceArchivePreview.payload.workspace.workspaceId, workspaceImported.payload.workspace.workspaceId);

    const gitStatus = await runCli(localHome, [
      'git', 'status', '--cwd', gitRepo, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(gitStatus.exitCode, 0);
    assert.ok(Array.isArray(gitStatus.payload.changes));
    assert.ok(gitStatus.payload.changes.some((change) => change.path === 'tracked.txt'));

    const unguardedDiscard = await runCli(localHome, [
      'git', 'discard', '--cwd', gitRepo, '--file', 'tracked.txt',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.notStrictEqual(unguardedDiscard.exitCode, 0);
    assert.strictEqual(unguardedDiscard.payload.failureCategory, 'git_plan_required');
    assert.strictEqual(fs.readFileSync(path.join(gitRepo, 'tracked.txt'), 'utf8'), 'changed\n');

    const discardPreview = await runCli(localHome, [
      'git', 'discard', '--cwd', gitRepo, '--file', 'tracked.txt', '--preview',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(discardPreview.exitCode, 0);
    assert.strictEqual(discardPreview.payload.preview, true);
    assert.strictEqual(discardPreview.payload.confirmed, false);
    assert.ok(discardPreview.payload.planId.length > 0);
    assert.strictEqual(fs.readFileSync(path.join(gitRepo, 'tracked.txt'), 'utf8'), 'changed\n');

    const discardConfirmed = await runCli(localHome, [
      'git', 'discard', '--cwd', gitRepo, '--file', 'tracked.txt',
      '--plan-id', discardPreview.payload.planId, '--confirm',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(discardConfirmed.exitCode, 0);
    assert.strictEqual(discardConfirmed.payload.confirmed, true);
    assert.strictEqual(fs.readFileSync(path.join(gitRepo, 'tracked.txt'), 'utf8').replace(/\r\n/g, '\n'), 'base\n');

    const notifications = await runCli(localHome, [
      'notification', 'list', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(notifications.exitCode, 0);
    assert.ok(Array.isArray(notifications.payload.notifications));

    const waitedNotification = await runCli(localHome, [
      'notification', 'wait', '--notification-id', seeded.notificationId, '--timeout-ms', '1000',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(waitedNotification.exitCode, 0);
    assert.strictEqual(waitedNotification.payload.matched, true);
    assert.strictEqual(waitedNotification.payload.source, 'live');
    assert.strictEqual(waitedNotification.payload.notifications[0].notificationId, seeded.notificationId);

    const unauthorizedNotificationWait = await runCli(localHome, [
      'notification', 'wait', '--notification-id', seeded.notificationId, '--timeout-ms', '1000',
      '--daemon-url', bridgeUrl, '--token', 'wrong-token'
    ]);
    assert.notStrictEqual(unauthorizedNotificationWait.exitCode, 0);
    assert.strictEqual(unauthorizedNotificationWait.payload.code, 'unauthorized');
    assert.strictEqual(unauthorizedNotificationWait.payload.action, 'notification.wait');

    const securityHosts = await runCli(localHome, [
      'security', 'hosts', 'status', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(securityHosts.exitCode, 0);
    assert.ok(Array.isArray(securityHosts.payload.hostnames));

    const terminalList = await runCli(localHome, [
      'terminal', 'list', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(terminalList.exitCode, 0);
    assert.ok(Array.isArray(terminalList.payload.terminals));

    const remoteSubscription = await runCli(localHome, [
      'git', 'subscribe', 'status', '--cwd', remoteHome, '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.notStrictEqual(remoteSubscription.exitCode, 0);
    assert.strictEqual(remoteSubscription.payload.code, 'remote_stream_transport_required');

    const ambiguousPermit = await runCli(localHome, [
      'permit', 'approve', '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.notStrictEqual(ambiguousPermit.exitCode, 0);
    assert.strictEqual(ambiguousPermit.payload.code, 'permit_selection_required');
    assert.strictEqual(ambiguousPermit.payload.candidateCount, 3);

    const approvedPermission = await runCli(localHome, [
      'permit', 'approve', '--kind', 'permission', '--agent-id', seeded.agentId,
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(approvedPermission.exitCode, 0);
    assert.strictEqual(approvedPermission.payload.requestType, 'permission.respond');
    assert.strictEqual(approvedPermission.payload.result.requestId, 'permission-live');

    const answeredQuestion = await runCli(localHome, [
      'permit', 'respond', '--kind', 'question', '--request-id', 'question-live', '--answer', 'yes',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(answeredQuestion.exitCode, 0);
    assert.strictEqual(answeredQuestion.payload.requestType, 'request.respond');
    assert.strictEqual(answeredQuestion.payload.result.answer, 'yes');

    const approvedPlan = await runCli(localHome, [
      'permit', 'approve', '--kind', 'plan', '--request-id', 'plan-live',
      '--daemon-url', bridgeUrl, '--token', token
    ]);
    assert.strictEqual(approvedPlan.exitCode, 0);
    assert.strictEqual(approvedPlan.payload.requestType, 'plan.respond');
    assert.strictEqual(approvedPlan.payload.result.planId, 'plan-live');

    captureFixture = await startCaptureFixture(capturePort);
    const followedTerminal = await runCli(localHome, [
      'terminal', 'follow', 'fixture-terminal', '--json', '--max-polls', '3', '--interval-ms', '100',
      '--daemon-url', 'http://127.0.0.1:' + String(capturePort), '--token', 'fixture-token'
    ]);
    assert.strictEqual(followedTerminal.exitCode, 0);
    assert.strictEqual(followedTerminal.payload.action, 'terminal.follow');
    assert.strictEqual(followedTerminal.payload.text, 'alpha\nbeta\n');
    assert.strictEqual(followedTerminal.payload.polls, 3);
    assert.strictEqual(followedTerminal.payload.closed, true);
    assert.strictEqual(captureFixture.getCaptureCalls(), 3);

    console.log('management cli live smoke ok');
  } finally {
    await closeServer(captureFixture ? captureFixture.server : null);
    await stopChild(bridgeChild);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Ignore cleanup errors on the failure path.
  }
  console.error(error);
  process.exitCode = 1;
});
