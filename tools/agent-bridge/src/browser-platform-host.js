'use strict';

const PLATFORM_BROWSER_HOST_KINDS = Object.freeze(['harmonyos']);

function readHostMetadata(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isPlatformHostRegistration(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return false;
  const hostKind = readHostMetadata(descriptor.hostKind);
  const capabilitySource = readHostMetadata(descriptor.capabilitySource);
  return PLATFORM_BROWSER_HOST_KINDS.includes(hostKind) || capabilitySource === 'platform';
}

function platformHostUnavailable() {
  return {
    ok: false,
    failureCategory: 'browser_platform_host_unavailable',
    message: 'No supported platform browser host adapter is available in this Bridge.',
    remediation: 'Use a supported desktop browser host or install a Bridge build with a platform browser adapter.',
    warnings: []
  };
}

function platformHostRejected() {
  return {
    ok: false,
    failureCategory: 'browser_platform_host_rejected',
    message: 'The platform browser host adapter rejected this registration.',
    remediation: 'Use the platform adapter capability contract and advertise only supported commands.',
    warnings: []
  };
}

function createBrowserPlatformHostAdapter(source) {
  const candidate = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const available = typeof candidate.isAvailable === 'function'
    ? () => {
      try {
        return candidate.isAvailable() === true;
      } catch (_error) {
        return false;
      }
    }
    : () => false;
  const validate = typeof candidate.validateRegistration === 'function'
    ? (descriptor) => candidate.validateRegistration(descriptor)
    : (_descriptor) => ({ ok: true });
  return {
    isAvailable: available,
    validateRegistration: validate
  };
}

function validateBrowserPlatformHost(adapter, descriptor) {
  if (!isPlatformHostRegistration(descriptor)) return { ok: true };
  let available = false;
  try {
    available = Boolean(adapter && typeof adapter.isAvailable === 'function' && adapter.isAvailable() === true);
  } catch (_error) {
    available = false;
  }
  if (!available) {
    return platformHostUnavailable();
  }
  if (typeof adapter.validateRegistration !== 'function') return platformHostRejected();
  let result;
  try {
    result = adapter.validateRegistration(descriptor);
  } catch (_error) {
    return platformHostRejected();
  }
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) {
    return platformHostRejected();
  }
  return { ok: true };
}

module.exports = {
  PLATFORM_BROWSER_HOST_KINDS,
  createBrowserPlatformHostAdapter,
  isPlatformHostRegistration,
  validateBrowserPlatformHost
};
