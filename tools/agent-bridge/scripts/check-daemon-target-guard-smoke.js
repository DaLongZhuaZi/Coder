'use strict';

const assert = require('assert');
const { validateDaemonTarget } = require('../src/daemon-target-guard');

function target() {
  return { instanceId: 'instance-a', generation: 7 };
}

function verifyLegacyPayloadRemainsCompatible() {
  const result = validateDaemonTarget({}, target(), 'host-a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.instanceId, 'instance-a');
  assert.strictEqual(result.generation, 7);
}

function verifyMatchingTarget() {
  const result = validateDaemonTarget({
    action: 'daemon.restart',
    expectedInstanceId: 'instance-a',
    expectedGeneration: 7,
    hostProfileId: 'host-a'
  }, target(), 'host-a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.expectedInstanceId, 'instance-a');
  assert.strictEqual(result.expectedGeneration, 7);
  assert.strictEqual(result.expectedGenerationProvided, true);
}

function verifyTargetFailures() {
  const instanceChanged = validateDaemonTarget({
    action: 'daemon.restart',
    expectedInstanceId: 'instance-old',
    expectedGeneration: 7,
    hostProfileId: 'host-a'
  }, target(), 'host-a');
  assert.strictEqual(instanceChanged.failureCategory, 'daemon_instance_changed');
  assert.strictEqual(instanceChanged.instanceId, 'instance-a');

  const generationStale = validateDaemonTarget({
    action: 'daemon.update.install',
    expectedInstanceId: 'instance-a',
    expectedGeneration: 6,
    hostProfileId: 'host-a'
  }, target(), 'host-a');
  assert.strictEqual(generationStale.failureCategory, 'daemon_generation_stale');

  const hostMismatch = validateDaemonTarget({
    action: 'daemon.update.rollback',
    expectedInstanceId: 'instance-a',
    expectedGeneration: 7,
    hostProfileId: 'host-b'
  }, target(), 'host-a');
  assert.strictEqual(hostMismatch.failureCategory, 'host_profile_mismatch');

  const invalidGeneration = validateDaemonTarget({
    action: 'daemon.restart',
    expectedInstanceId: 'instance-a',
    expectedGeneration: -1
  }, target(), '');
  assert.strictEqual(invalidGeneration.failureCategory, 'daemon_generation_invalid');

  const missingInstance = validateDaemonTarget({
    action: 'daemon.restart',
    expectedInstanceId: 'instance-a',
    expectedGeneration: 7
  }, { instanceId: '', generation: 7 }, '');
  assert.strictEqual(missingInstance.failureCategory, 'daemon_instance_changed');

  const missingHost = validateDaemonTarget({
    action: 'daemon.restart',
    hostProfileId: 'host-a'
  }, target(), '');
  assert.strictEqual(missingHost.failureCategory, 'host_profile_mismatch');

  const explicitZeroStale = validateDaemonTarget({
    action: 'daemon.restart',
    expectedGeneration: 0
  }, { instanceId: 'instance-a', generation: 1 }, '');
  assert.strictEqual(explicitZeroStale.failureCategory, 'daemon_generation_stale');

  const explicitZeroMatch = validateDaemonTarget({
    action: 'daemon.restart',
    expectedGeneration: 0
  }, { instanceId: 'instance-a', generation: 0 }, '');
  assert.strictEqual(explicitZeroMatch.ok, true);
  assert.strictEqual(explicitZeroMatch.expectedGenerationProvided, true);
}

function main() {
  verifyLegacyPayloadRemainsCompatible();
  verifyMatchingTarget();
  verifyTargetFailures();
  console.log('daemon target guard smoke ok');
}

main();
