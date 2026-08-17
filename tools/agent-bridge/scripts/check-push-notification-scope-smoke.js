'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-push-scope-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const { PushNotificationManager, tokenFingerprint } = require('../src/push-notification-manager');

async function main() {
  const deliveries = [];
  const client = {
    status: () => ({
      configured: true,
      authMode: 'test',
      projectId: 'scope-project',
      apiBaseUrl: 'https://push.example.test',
      category: 'WORK',
      testMessage: true,
      failureCategory: '',
      message: 'configured',
      remediation: ''
    }),
    send: async (_notification, tokens) => {
      deliveries.push(tokens.slice());
      return {
        ok: true,
        attempted: true,
        deliveredCount: tokens.length,
        failureCategory: '',
        message: 'accepted',
        remediation: '',
        requestId: 'scope-request',
        responseCode: '80000000',
        statusCode: 200
      };
    }
  };
  const manager = new PushNotificationManager(createDaemonStore(tempHome), {}, { client });

  const registeredA = manager.register({
    token: 'push-token-host-a',
    deviceId: 'device-a',
    platform: 'harmonyos'
  }, 'host-a');
  const registeredB = manager.register({
    token: 'push-token-host-b',
    deviceId: 'device-b',
    platform: 'harmonyos'
  }, 'host-b');
  assert.strictEqual(registeredA.ok, true);
  assert.strictEqual(registeredB.ok, true);
  assert.strictEqual(registeredA.subscription.hostProfileId, 'host-a');
  assert.strictEqual(registeredB.subscription.hostProfileId, 'host-b');

  const statusA = manager.status({}, 'host-a');
  const statusB = manager.status({}, 'host-b');
  assert.strictEqual(statusA.totalCount, 1);
  assert.strictEqual(statusB.totalCount, 1);
  assert.strictEqual(statusA.subscriptions[0].tokenFingerprint, tokenFingerprint('push-token-host-a'));
  assert.strictEqual(statusB.subscriptions[0].tokenFingerprint, tokenFingerprint('push-token-host-b'));

  const crossHostUnregister = manager.unregister({ subscriptionId: registeredB.subscription.subscriptionId }, 'host-a');
  assert.strictEqual(crossHostUnregister.ok, false);
  assert.strictEqual(manager.status({}, 'host-b').totalCount, 1);

  const deliveredA = await manager.deliver({ notificationId: 'notification-a', hostProfileId: 'host-a', title: 'A' });
  assert.strictEqual(deliveredA.ok, true);
  assert.deepStrictEqual(deliveries[0], ['push-token-host-a']);
  assert.strictEqual(manager.status({}, 'host-a').subscriptions[0].deliveryCount, 1);
  assert.strictEqual(manager.status({}, 'host-b').subscriptions[0].deliveryCount, 0);

  const deliveredLegacy = await manager.deliver({ notificationId: 'notification-legacy', title: 'Legacy' });
  assert.strictEqual(deliveredLegacy.ok, true);
  assert.deepStrictEqual(deliveries[1].sort(), ['push-token-host-a', 'push-token-host-b'].sort());

  const removedA = manager.unregister({ subscriptionId: registeredA.subscription.subscriptionId }, 'host-a');
  assert.strictEqual(removedA.ok, true);
  assert.strictEqual(manager.status({}, 'host-a').totalCount, 0);
  assert.strictEqual(manager.status({}, 'host-b').totalCount, 1);

  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('push notification scope smoke ok');
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
