'use strict';

function readString(value, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  return typeof value[key] === 'string' ? value[key].trim() : '';
}

function readExpectedGeneration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.expectedGeneration === undefined || value.expectedGeneration === null || value.expectedGeneration === '') {
    return { present: false, value: 0 };
  }
  const parsed = Number(value.expectedGeneration);
  return {
    present: true,
    value: Number.isInteger(parsed) && parsed >= 0 ? parsed : -1
  };
}

function failure(action, category, message, remediation, current) {
  return {
    ok: false,
    action,
    failureCategory: category,
    code: category,
    message,
    remediation,
    instanceId: current.instanceId,
    generation: current.generation
  };
}

function validateDaemonTarget(payload, currentTarget, connectionHostProfileId) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const current = currentTarget && typeof currentTarget === 'object' && !Array.isArray(currentTarget)
    ? currentTarget
    : { instanceId: '', generation: 0 };
  const action = readString(source, 'action') || 'daemon.lifecycle';
  const expectedInstanceId = readString(source, 'expectedInstanceId');
  const expectedHostProfileId = readString(source, 'hostProfileId');
  const expectedGenerationResult = readExpectedGeneration(source);
  const expectedGeneration = expectedGenerationResult.value;
  const expectedGenerationProvided = expectedGenerationResult.present;
  const connectedHostProfileId = typeof connectionHostProfileId === 'string' ? connectionHostProfileId.trim() : '';
  const currentInstanceId = typeof current.instanceId === 'string' ? current.instanceId : '';
  const currentGeneration = Number.isInteger(current.generation) && current.generation >= 0 ? current.generation : 0;

  if (expectedGeneration < 0) {
    return failure(action, 'daemon_generation_invalid', 'Expected daemon generation is invalid.', 'Refresh daemon status and retry with the current generation.', {
      instanceId: currentInstanceId,
      generation: currentGeneration
    });
  }
  if (expectedHostProfileId.length > 0 && expectedHostProfileId !== connectedHostProfileId) {
    return failure(action, 'host_profile_mismatch', 'The request host profile does not match the authenticated connection.', 'Reconnect using the selected host profile and preview the operation again.', {
      instanceId: currentInstanceId,
      generation: currentGeneration
    });
  }
  if (expectedInstanceId.length > 0 && expectedInstanceId !== currentInstanceId) {
    return failure(action, 'daemon_instance_changed', 'The daemon instance changed after the operation was previewed.', 'Refresh daemon status and create a new preview.', {
      instanceId: currentInstanceId,
      generation: currentGeneration
    });
  }
  if (expectedGenerationProvided && currentGeneration !== expectedGeneration) {
    return failure(action, 'daemon_generation_stale', 'The daemon generation changed after the operation was previewed.', 'Refresh daemon status and create a new preview.', {
      instanceId: currentInstanceId,
      generation: currentGeneration
    });
  }
  return {
    ok: true,
    action,
    expectedInstanceId,
    expectedHostProfileId,
    expectedGeneration,
    expectedGenerationProvided,
    instanceId: currentInstanceId,
    generation: currentGeneration
  };
}

module.exports = {
  validateDaemonTarget
};
