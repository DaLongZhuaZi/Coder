'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDeviceIdentity } = require('./device-identity');

const PROFILE_VERSION = 1;

function profileDirectory() {
  if (process.env.AGENT_BRIDGE_HOME && process.env.AGENT_BRIDGE_HOME.length > 0) {
    return process.env.AGENT_BRIDGE_HOME;
  }
  return path.join(os.homedir(), '.ngf-agent-bridge');
}

function profilePath() {
  return path.join(profileDirectory(), 'profile.json');
}

function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    language: '',
    connectHost: '',
    bindHost: '',
    port: 8787,
    token: '',
    providerId: '',
    workspacePath: '',
    workspaceTitle: '',
    openCodeCommand: 'opencode',
    devEcoCommand: 'deveco',
    mimoCodeCommand: 'mimo',
    openCodeUrl: 'http://127.0.0.1:4096',
    devEcoUrl: 'http://127.0.0.1:4097',
    mimoCodeUrl: 'http://127.0.0.1:4098',
    startOpenCode: false,
    startDevEco: false,
    startMimoCode: false,
    codexCommand: 'codex',
    claudeCommand: 'claude',
    antigravityCommand: 'antigravity',
    antigravityArgs: '',
    openClawCommand: 'openclaw',
    openClawArgs: 'agent --message',
    openClawGatewayUrl: 'http://127.0.0.1:18789',
    openClawGatewayModel: 'openclaw/default',
    startOpenClawGateway: false,
    hermesCommand: 'hermes',
    hermesArgs: 'chat --quiet -q',
    hermesStudioCommand: 'hermes-web-ui',
    hermesStudioArgs: 'start --no-open',
    hermesStudioUrl: 'http://127.0.0.1:8648',
    hermesStudioProfile: 'default',
    hermesStudioProvider: '',
    hermesStudioModel: '',
    startHermesStudio: false,
    physicalDeviceId: '',
    bridgeInstanceId: '',
    deviceDisplayName: '',
    devicePlatform: '',
    devicePublicKeyPem: '',
    deviceKeyFingerprint: '',
    updatedAt: 0
  };
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function normalizeProfile(source) {
  const defaults = defaultProfile();
  const normalized = {
    version: PROFILE_VERSION,
    language: readString(source, 'language', defaults.language),
    connectHost: readString(source, 'connectHost', defaults.connectHost),
    bindHost: readString(source, 'bindHost', defaults.bindHost),
    port: readNumber(source, 'port', defaults.port),
    token: readString(source, 'token', defaults.token),
    providerId: readString(source, 'providerId', defaults.providerId),
    workspacePath: readString(source, 'workspacePath', defaults.workspacePath),
    workspaceTitle: readString(source, 'workspaceTitle', defaults.workspaceTitle),
    openCodeCommand: readString(source, 'openCodeCommand', defaults.openCodeCommand),
    devEcoCommand: readString(source, 'devEcoCommand', defaults.devEcoCommand),
    mimoCodeCommand: readString(source, 'mimoCodeCommand', defaults.mimoCodeCommand),
    openCodeUrl: readString(source, 'openCodeUrl', defaults.openCodeUrl),
    devEcoUrl: readString(source, 'devEcoUrl', defaults.devEcoUrl),
    mimoCodeUrl: readString(source, 'mimoCodeUrl', defaults.mimoCodeUrl),
    startOpenCode: readBoolean(source, 'startOpenCode', defaults.startOpenCode),
    startDevEco: readBoolean(source, 'startDevEco', defaults.startDevEco),
    startMimoCode: readBoolean(source, 'startMimoCode', defaults.startMimoCode),
    codexCommand: readString(source, 'codexCommand', defaults.codexCommand),
    claudeCommand: readString(source, 'claudeCommand', defaults.claudeCommand),
    antigravityCommand: readString(source, 'antigravityCommand', defaults.antigravityCommand),
    antigravityArgs: readString(source, 'antigravityArgs', defaults.antigravityArgs),
    openClawCommand: readString(source, 'openClawCommand', defaults.openClawCommand),
    openClawArgs: readString(source, 'openClawArgs', defaults.openClawArgs),
    openClawGatewayUrl: readString(source, 'openClawGatewayUrl', defaults.openClawGatewayUrl),
    openClawGatewayModel: readString(source, 'openClawGatewayModel', defaults.openClawGatewayModel),
    startOpenClawGateway: readBoolean(source, 'startOpenClawGateway', defaults.startOpenClawGateway),
    hermesCommand: readString(source, 'hermesCommand', defaults.hermesCommand),
    hermesArgs: readString(source, 'hermesArgs', defaults.hermesArgs),
    hermesStudioCommand: readString(source, 'hermesStudioCommand', defaults.hermesStudioCommand),
    hermesStudioArgs: readString(source, 'hermesStudioArgs', defaults.hermesStudioArgs),
    hermesStudioUrl: readString(source, 'hermesStudioUrl', defaults.hermesStudioUrl),
    hermesStudioProfile: readString(source, 'hermesStudioProfile', defaults.hermesStudioProfile),
    hermesStudioProvider: readString(source, 'hermesStudioProvider', defaults.hermesStudioProvider),
    hermesStudioModel: readString(source, 'hermesStudioModel', defaults.hermesStudioModel),
    startHermesStudio: readBoolean(source, 'startHermesStudio', defaults.startHermesStudio),
    physicalDeviceId: readString(source, 'physicalDeviceId', defaults.physicalDeviceId),
    bridgeInstanceId: readString(source, 'bridgeInstanceId', defaults.bridgeInstanceId),
    deviceDisplayName: readString(source, 'deviceDisplayName', defaults.deviceDisplayName),
    devicePlatform: readString(source, 'devicePlatform', defaults.devicePlatform),
    devicePublicKeyPem: readString(source, 'devicePublicKeyPem', defaults.devicePublicKeyPem),
    deviceKeyFingerprint: readString(source, 'deviceKeyFingerprint', defaults.deviceKeyFingerprint),
    updatedAt: readNumber(source, 'updatedAt', defaults.updatedAt)
  };
  return ensureDeviceIdentity(normalized, { legacyProfile: source });
}

function preserveStoredDeviceIdentity(source) {
  const next = source && typeof source === 'object' && !Array.isArray(source)
    ? Object.assign({}, source)
    : {};
  const filePath = profilePath();
  if (!fs.existsSync(filePath)) {
    return next;
  }
  try {
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return next;
    }
    const credentialFields = [
      'physicalDeviceId',
      'bridgeInstanceId',
      'devicePublicKeyPem'
    ];
    const storedHasCompleteCredentials = credentialFields.every((field) => {
      return typeof stored[field] === 'string' && stored[field].length > 0;
    });
    const nextHasCompleteCredentials = credentialFields.every((field) => {
      return typeof next[field] === 'string' && next[field].length > 0;
    });
    if (storedHasCompleteCredentials && !nextHasCompleteCredentials) {
      for (const field of credentialFields) {
        next[field] = stored[field];
      }
      next.deviceKeyFingerprint = stored.deviceKeyFingerprint;
    }
    const metadataFields = ['deviceDisplayName', 'devicePlatform'];
    for (const field of metadataFields) {
      const nextValue = next[field];
      const storedValue = stored[field];
      if (
        (typeof nextValue !== 'string' || nextValue.length === 0) &&
        typeof storedValue === 'string' &&
        storedValue.length > 0
      ) {
        next[field] = storedValue;
      }
    }
  } catch (error) {
    return next;
  }
  return next;
}

function loadProfile() {
  const filePath = profilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const normalized = normalizeProfile(parsed);
    if (
      typeof parsed.physicalDeviceId !== 'string' ||
      parsed.physicalDeviceId.length === 0 ||
      typeof parsed.bridgeInstanceId !== 'string' ||
      parsed.bridgeInstanceId.length === 0 ||
      typeof parsed.devicePublicKeyPem !== 'string' ||
      parsed.devicePublicKeyPem.length === 0 ||
      typeof parsed.deviceKeyFingerprint !== 'string' ||
      parsed.deviceKeyFingerprint.length === 0
    ) {
      saveProfile(normalized);
    }
    return normalized;
  } catch (error) {
    return null;
  }
}

function saveProfile(profile) {
  const normalized = normalizeProfile(preserveStoredDeviceIdentity(profile));
  normalized.updatedAt = Date.now();
  fs.mkdirSync(profileDirectory(), { recursive: true });
  fs.writeFileSync(profilePath(), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

module.exports = {
  PROFILE_VERSION,
  defaultProfile,
  loadProfile,
  normalizeProfile,
  profileDirectory,
  profilePath,
  saveProfile
};
