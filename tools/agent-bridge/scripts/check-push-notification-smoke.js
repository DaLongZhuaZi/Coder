'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-push-notification-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const { PushNotificationManager, tokenFingerprint } = require('../src/push-notification-manager');

function startMockServer() {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = JSON.parse(bodyText);
      requests.push({
        url: request.url,
        headers: request.headers,
        body
      });
      if (body.payload.notification.title === 'Rate limited') {
        response.writeHead(429, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: '80300007', msg: 'rate limited', requestId: 'req-rate' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: '80000000', msg: 'Success', requestId: 'req-success' }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      const address = server.address();
      resolve({
        server,
        requests,
        baseUrl: 'http://127.0.0.1:' + address.port
      });
    });
  });
}

function verifyJwt(jwt, publicKey) {
  const parts = jwt.split('.');
  assert.strictEqual(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.strictEqual(header.alg, 'PS256');
  assert.strictEqual(header.kid, 'key-smoke');
  assert.strictEqual(payload.iss, 'sub-smoke');
  assert.strictEqual(payload.aud, 'https://oauth.example/token');
  assert.strictEqual(payload.exp > payload.iat, true);
  assert.strictEqual(crypto.verify(
    'sha256',
    Buffer.from(parts[0] + '.' + parts[1], 'utf8'),
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    },
    Buffer.from(parts[2], 'base64url')
  ), true);
}

async function main() {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const serviceAccountPath = path.join(tempHome, 'service-account.json');
  fs.writeFileSync(serviceAccountPath, JSON.stringify({
    project_id: 'project-smoke',
    key_id: 'key-smoke',
    private_key: privateKey,
    sub_account: 'sub-smoke',
    token_uri: 'https://oauth.example/token'
  }, null, 2), 'utf8');

  const mock = await startMockServer();
  const store = createDaemonStore(tempHome);
  const manager = new PushNotificationManager(store, {
    apiBaseUrl: mock.baseUrl,
    serviceAccountPath,
    category: 'WORK',
    testMessage: true,
    requestTimeoutMs: 5000
  });

  const initialStatus = manager.status({});
  assert.strictEqual(initialStatus.available, true);
  assert.strictEqual(initialStatus.configured, true);
  assert.strictEqual(initialStatus.deliveryReady, false);
  assert.strictEqual(initialStatus.authMode, 'service_account');

  const registered = manager.register({
    token: 'push-token-smoke-one',
    deviceId: 'device-smoke',
    platform: 'harmonyos',
    appVersion: '1.0.0'
  });
  assert.strictEqual(registered.ok, true);
  assert.strictEqual(registered.deliveryReady, true);
  assert.strictEqual(registered.subscription.deviceId, 'device-smoke');
  assert.strictEqual(registered.subscription.tokenFingerprint, tokenFingerprint('push-token-smoke-one'));
  assert.strictEqual(JSON.stringify(registered).includes('push-token-smoke-one'), false);

  const replaced = manager.register({
    token: 'push-token-smoke-two',
    deviceId: 'device-smoke',
    platform: 'harmonyos',
    appVersion: '1.0.1'
  });
  assert.strictEqual(replaced.totalCount, 1);
  assert.strictEqual(replaced.subscription.subscriptionId, registered.subscription.subscriptionId);
  assert.strictEqual(replaced.subscription.tokenFingerprint, tokenFingerprint('push-token-smoke-two'));

  const delivered = await manager.deliver({
    notificationId: 'ntf-smoke',
    kind: 'permission',
    title: 'Permission requested',
    body: 'Approve command?',
    sessionId: 'session-smoke',
    ttlMs: 60000,
    route: {
      kind: 'permission',
      sessionId: 'session-smoke',
      requestId: 'request-smoke'
    }
  });
  assert.strictEqual(delivered.ok, true);
  assert.strictEqual(delivered.delivery.deliveredCount, 1);
  assert.strictEqual(delivered.subscriptions[0].deliveryCount, 1);
  assert.strictEqual(mock.requests.length, 1);
  assert.strictEqual(mock.requests[0].url, '/v3/project-smoke/messages:send');
  assert.strictEqual(mock.requests[0].headers['push-type'], '0');
  assert.strictEqual(mock.requests[0].body.target.token[0], 'push-token-smoke-two');
  assert.strictEqual(mock.requests[0].body.payload.notification.category, 'WORK');
  assert.strictEqual(mock.requests[0].body.payload.notification.clickAction.data.ngfNotificationTapAction, 'agent_home.open_request');
  const routePayload = JSON.parse(mock.requests[0].body.payload.notification.clickAction.data.ngfNotificationTapPayloadJson);
  assert.strictEqual(routePayload.sessionId, 'session-smoke');
  assert.strictEqual(routePayload.requestId, 'request-smoke');
  const authorization = mock.requests[0].headers.authorization;
  assert.strictEqual(authorization.startsWith('Bearer '), true);
  verifyJwt(authorization.substring('Bearer '.length), publicKey);

  const limited = await manager.deliver({
    notificationId: 'ntf-rate',
    kind: 'completed',
    title: 'Rate limited',
    body: 'Retry later.',
    route: {
      kind: 'agent',
      sessionId: 'session-smoke'
    }
  });
  assert.strictEqual(limited.ok, false);
  assert.strictEqual(limited.failureCategory, 'rate_limited');
  assert.strictEqual(limited.subscriptions[0].lastFailureCategory, 'rate_limited');

  const unregistered = manager.unregister({
    subscriptionId: registered.subscription.subscriptionId
  });
  assert.strictEqual(unregistered.ok, true);
  assert.strictEqual(unregistered.totalCount, 0);
  assert.strictEqual(unregistered.subscription, null);
  assert.strictEqual(unregistered.removedSubscriptionId, registered.subscription.subscriptionId);
  assert.strictEqual(unregistered.removedTokenFingerprint, replaced.subscription.tokenFingerprint);

  const unconfigured = new PushNotificationManager(store, {});
  const missingStatus = unconfigured.status({});
  assert.strictEqual(missingStatus.configured, false);
  assert.strictEqual(missingStatus.failureCategory, 'config_missing');

  await new Promise((resolve) => mock.server.close(resolve));
  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('push notification smoke ok');
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
