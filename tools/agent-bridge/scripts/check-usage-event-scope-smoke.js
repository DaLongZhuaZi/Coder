'use strict';

const assert = require('assert');
const { sendScopedUsageEvent } = require('../src/usage-event-router');

function fakeConnection(hostProfileId) {
  return {
    clientHello: { hostProfileId },
    messages: [],
    sendJson(message) {
      this.messages.push(message);
    }
  };
}

function main() {
  const hostA = fakeConnection('host-a');
  const hostASecond = fakeConnection('host-a');
  const hostB = fakeConnection('host-b');
  const event = { type: 'event', event: 'usage.updated', sessionId: 'session-a' };
  const connections = new Set([hostA, hostASecond, hostB]);

  assert.strictEqual(sendScopedUsageEvent(connections, 'host-a', hostA, event), 2);
  assert.strictEqual(hostA.messages.length, 1);
  assert.strictEqual(hostASecond.messages.length, 1);
  assert.strictEqual(hostB.messages.length, 0);

  const legacy = fakeConnection('');
  const otherLegacy = fakeConnection('');
  assert.strictEqual(sendScopedUsageEvent(new Set([legacy, otherLegacy]), '', legacy, event), 1);
  assert.strictEqual(legacy.messages.length, 1);
  assert.strictEqual(otherLegacy.messages.length, 0);
  console.log('usage event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
