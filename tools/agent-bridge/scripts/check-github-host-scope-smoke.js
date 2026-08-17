'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-github-scope-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const { GitHubClient } = require('../src/github-client');

async function main() {
  const store = createDaemonStore(tempHome);
  const client = new GitHubClient({ store });

  const bindingA = await client.bindingSet({
    hostProfileId: 'host-a',
    workspaceId: 'workspace-1',
    accountId: 'account-a',
    owner: 'octo',
    repo: 'alpha',
    confirm: true
  });
  const bindingB = await client.bindingSet({
    hostProfileId: 'host-b',
    workspaceId: 'workspace-1',
    accountId: 'account-b',
    owner: 'octo',
    repo: 'beta',
    confirm: true
  });
  assert.strictEqual(bindingA.ok, true);
  assert.strictEqual(bindingB.ok, true);
  assert.strictEqual((await client.bindingGet({ hostProfileId: 'host-a', workspaceId: 'workspace-1' })).binding.repo, 'alpha');
  assert.strictEqual((await client.bindingGet({ hostProfileId: 'host-b', workspaceId: 'workspace-1' })).binding.repo, 'beta');

  const context = { owner: 'octo', repo: 'alpha', repository: 'octo/alpha', apiBaseUrl: 'https://api.github.com', token: '' };
  const planId = client.createPlan('github.pr.update', context, {
    number: 7,
    hostProfileId: 'host-a'
  });
  assert.strictEqual(client.consumePlan(planId, 'github.pr.update', context, 7, 'host-b'), null);
  assert.ok(client.consumePlan(planId, 'github.pr.update', context, 7, 'host-a'));

  client.deviceSessions.set('device-session-a', {
    sessionId: 'device-session-a',
    hostProfileId: 'host-a',
    expiresAt: Date.now() + 60000,
    polling: false,
    nextPollAt: Date.now(),
    oauthBaseUrl: 'https://github.com',
    clientId: 'client-id',
    deviceCode: 'device-code',
    interval: 5,
    apiBaseUrl: 'https://api.github.com'
  });
  const mismatchedPoll = await client.devicePoll({ sessionId: 'device-session-a', hostProfileId: 'host-b' });
  assert.strictEqual(mismatchedPoll.failureCategory, 'host_scope_mismatch');

  client.deviceSessions.set('expired-session', {
    sessionId: 'expired-session',
    hostProfileId: 'host-a',
    expiresAt: Date.now() - 1,
    oauthBaseUrl: 'https://github.com'
  });
  const expiredPoll = await client.devicePoll({ sessionId: 'expired-session', hostProfileId: 'host-a' });
  assert.strictEqual(expiredPoll.failureCategory, 'authorization_expired');
  assert.strictEqual(client.deviceSessions.has('expired-session'), false);

  const oauthMock = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/login/oauth/access_token') {
      response.end(JSON.stringify({ error: 'access_denied', error_description: 'Smoke denial' }));
      return;
    }
    response.end(JSON.stringify({}));
  });
  await new Promise((resolve) => oauthMock.listen(0, '127.0.0.1', resolve));
  const oauthAddress = oauthMock.address();
  const oauthBaseUrl = 'http://127.0.0.1:' + String(oauthAddress.port);
  client.deviceSessions.set('denied-session', {
    sessionId: 'denied-session',
    hostProfileId: 'host-a',
    expiresAt: Date.now() + 60000,
    polling: false,
    nextPollAt: Date.now(),
    oauthBaseUrl,
    clientId: 'client-id',
    deviceCode: 'device-code',
    interval: 5,
    apiBaseUrl: oauthBaseUrl
  });
  const deniedPoll = await client.devicePoll({ sessionId: 'denied-session', hostProfileId: 'host-a' });
  assert.strictEqual(deniedPoll.failureCategory, 'access_denied');
  assert.strictEqual(client.deviceSessions.has('denied-session'), false);
  await new Promise((resolve) => oauthMock.close(resolve));

  const watcher = {
    subscribers: new Map([['subscriber-a', () => {}]]),
    subscriberOwners: new Map([['subscriber-a', 'connection-a']]),
    timer: setTimeout(() => {}, 60000)
  };
  watcher.timer.unref();
  client.watchers.set('watch-a', watcher);
  assert.strictEqual(client.stopWatchersForConnection('connection-b'), 0);
  assert.strictEqual(client.watchers.has('watch-a'), true);
  assert.strictEqual(client.stopWatchersForConnection('connection-a'), 1);
  assert.strictEqual(client.watchers.has('watch-a'), false);

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(serverSource.includes('const githubPayload = githubPayloadForConnection(payload, connection);'));
  assert.ok(serverSource.includes('githubClient.bindingGet(githubPayload)'));
  assert.ok(serverSource.includes('githubClient.watchStart(githubPayload'));

  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('github host scope smoke ok');
}

main().catch((error) => {
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Ignore cleanup errors.
  }
  console.error(error);
  process.exitCode = 1;
});
