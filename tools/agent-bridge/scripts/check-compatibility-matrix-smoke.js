'use strict';

const assert = require('assert');
const { buildCompatibilityInfo } = require('../src/diagnostics');

const base = {
  appVersion: '2.0.0',
  bridgeVersion: '2.0.0',
  minimumAppVersion: '1.0.0',
  recommendedAppVersion: '2.0.0',
  minimumBridgeVersion: '1.0.0',
  recommendedBridgeVersion: '2.0.0'
};

const exactProtocol = buildCompatibilityInfo(Object.assign({}, base, {
  minimumProtocolVersion: 'agent-bridge.v1',
  recommendedProtocolVersion: 'agent-bridge.v2',
  clientProtocolVersion: 'agent-bridge.v1'
}));
assert.strictEqual(exactProtocol.status, 'upgradeRecommended', 'minimum-only protocol metadata should support protocol family comparison');

const oldProtocol = buildCompatibilityInfo(Object.assign({}, base, {
  minimumProtocolVersion: 'agent-bridge.v2',
  clientProtocolVersion: 'agent-bridge.v1'
}));
assert.strictEqual(oldProtocol.status, 'appTooOld', 'protocol below minimum should be blocking when the supported list is absent');
assert.strictEqual(oldProtocol.blocking, true);

const missingProtocol = buildCompatibilityInfo(Object.assign({}, base, {
  minimumProtocolVersion: 'agent-bridge.v1'
}));
assert.strictEqual(missingProtocol.status, 'unknown', 'missing client protocol must not be treated as compatible');

const invalidFamily = buildCompatibilityInfo(Object.assign({}, base, {
  minimumProtocolVersion: 'agent-bridge.v1',
  clientProtocolVersion: 'other-protocol.v2'
}));
assert.strictEqual(invalidFamily.status, 'unknown', 'different protocol families should degrade to unknown');

const listedProtocol = buildCompatibilityInfo(Object.assign({}, base, {
  minimumProtocolVersion: 'agent-bridge.v1',
  recommendedProtocolVersion: 'agent-bridge.v2',
  supportedProtocolVersions: ['agent-bridge.v1', 'agent-bridge.v2'],
  clientProtocolVersion: 'agent-bridge.v2'
}));
assert.strictEqual(listedProtocol.status, 'compatible', 'explicit supported protocol list should remain authoritative');

console.log('compatibility matrix smoke ok');
