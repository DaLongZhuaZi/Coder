'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE_VERSION = 1;

function profileDirectory() {
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
  return {
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
    updatedAt: readNumber(source, 'updatedAt', defaults.updatedAt)
  };
}

function loadProfile() {
  const filePath = profilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeProfile(parsed);
  } catch (error) {
    return null;
  }
}

function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
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
