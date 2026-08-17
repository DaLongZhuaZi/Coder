'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { defaultProfile, loadProfile, saveProfile } = require('./profile-store');
const { publicDeviceIdentity } = require('./device-identity');
const { PROTOCOL_VERSION, PROTOCOL_VERSION_V2 } = require('./protocol');
const packageInfo = require('../package.json');

const DEFAULT_CLI_TIMEOUT_MS = 10 * 60 * 1000;

function readPort(profile) {
  const raw = process.env.AGENT_BRIDGE_PORT;
  if (!raw) {
    if (profile && typeof profile.port === 'number' && profile.port > 0 && profile.port <= 65535) {
      return profile.port;
    }
    return 8787;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return 8787;
  }
  return parsed;
}

function readPositiveNumber(name, fallbackValue) {
  const raw = process.env[name];
  if (!raw) {
    return fallbackValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

function readBoolean(name, fallbackValue) {
  const raw = process.env[name];
  if (!raw) {
    return fallbackValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return fallbackValue;
}

function readSecretFile(name) {
  const filePath = process.env[name];
  if (typeof filePath !== 'string' || filePath.length === 0) return '';
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 64 * 1024) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_error) {
    return '';
  }
}

function createConfig() {
  const loadedProfile = loadProfile();
  const profile = loadedProfile || saveProfile(defaultProfile());
  const envToken = process.env.AGENT_BRIDGE_TOKEN || readSecretFile('AGENT_BRIDGE_TOKEN_FILE');
  const profileToken = profile && profile.token ? profile.token : '';
  const tokenGenerated = envToken.length === 0 && profileToken.length === 0;
  const openCodeUrl = process.env.AGENT_BRIDGE_OPENCODE_URL || process.env.OPENCODE_BASE_URL || readProfileString(profile, 'openCodeUrl', 'http://127.0.0.1:4096');
  const openCodeUsername = process.env.AGENT_BRIDGE_OPENCODE_USERNAME || process.env.OPENCODE_SERVER_USERNAME || '';
  const openCodePassword = process.env.AGENT_BRIDGE_OPENCODE_PASSWORD || process.env.OPENCODE_SERVER_PASSWORD || '';
  const devEcoUrl = process.env.AGENT_BRIDGE_DEVECO_URL || process.env.DEVECO_CODE_BASE_URL || readProfileString(profile, 'devEcoUrl', 'http://127.0.0.1:4097');
  const devEcoUsername = process.env.AGENT_BRIDGE_DEVECO_USERNAME || '';
  const devEcoPassword = process.env.AGENT_BRIDGE_DEVECO_PASSWORD || '';
  const mimoCodeUrl = process.env.AGENT_BRIDGE_MIMO_CODE_URL || process.env.MIMO_CODE_BASE_URL || readProfileString(profile, 'mimoCodeUrl', 'http://127.0.0.1:4098');
  const mimoCodeUsername = process.env.AGENT_BRIDGE_MIMO_CODE_USERNAME || '';
  const mimoCodePassword = process.env.AGENT_BRIDGE_MIMO_CODE_PASSWORD || '';
  return {
    protocolVersion: PROTOCOL_VERSION,
    preferredProtocolVersion: PROTOCOL_VERSION_V2,
    supportedProtocolVersions: [PROTOCOL_VERSION, PROTOCOL_VERSION_V2],
    version: typeof packageInfo.version === 'string' ? packageInfo.version : '0.0.0',
    containerMode: readBoolean('AGENT_BRIDGE_CONTAINER', false),
    profile,
    deviceIdentity: publicDeviceIdentity(profile),
    host: process.env.AGENT_BRIDGE_HOST || readProfileString(profile, 'bindHost', '127.0.0.1'),
    port: readPort(profile),
    token: tokenGenerated ? crypto.randomBytes(24).toString('hex') : (envToken.length > 0 ? envToken : profileToken),
    tokenGenerated,
    push: {
      apiBaseUrl: process.env.AGENT_BRIDGE_HUAWEI_PUSH_API_BASE_URL || 'https://push-api.cloud.huawei.com',
      serviceAccountPath: process.env.AGENT_BRIDGE_HUAWEI_PUSH_SERVICE_ACCOUNT || '',
      bearerToken: process.env.AGENT_BRIDGE_HUAWEI_PUSH_BEARER_TOKEN || '',
      projectId: process.env.AGENT_BRIDGE_HUAWEI_PUSH_PROJECT_ID || '',
      category: process.env.AGENT_BRIDGE_HUAWEI_PUSH_CATEGORY || 'MARKETING',
      testMessage: readBoolean('AGENT_BRIDGE_HUAWEI_PUSH_TEST_MESSAGE', false),
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_HUAWEI_PUSH_TIMEOUT_MS', 15000)
    },
    openCode: {
      baseUrl: openCodeUrl,
      username: openCodeUsername,
      password: openCodePassword,
      usageEndpoint: process.env.AGENT_BRIDGE_OPENCODE_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_OPENCODE_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_OPENCODE_USAGE_TOKEN_ENV || '',
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_OPENCODE_TIMEOUT_MS', 30000),
      lightCapabilities: readBoolean('AGENT_BRIDGE_OPENCODE_LIGHT_CAPABILITIES', true)
    },
    devEco: {
      id: 'deveco',
      displayName: 'DevEco Code',
      description: 'Connects to a local DevEco Code headless server. DevEco Code documents OpenCode-compatible terminal, provider, MCP, skill, and plugin capabilities.',
      healthName: 'DevEco Code',
      baseUrl: devEcoUrl,
      username: devEcoUsername,
      password: devEcoPassword,
      usageEndpoint: process.env.AGENT_BRIDGE_DEVECO_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_DEVECO_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_DEVECO_USAGE_TOKEN_ENV || '',
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_DEVECO_TIMEOUT_MS', 30000),
      lightCapabilities: readBoolean('AGENT_BRIDGE_DEVECO_LIGHT_CAPABILITIES', true)
    },
    mimoCode: {
      id: 'mimo',
      displayName: 'MiMo Code',
      description: 'Connects to a configured MiMo/OpenCode-compatible headless server endpoint.',
      healthName: 'MiMo Code',
      baseUrl: mimoCodeUrl,
      username: mimoCodeUsername,
      password: mimoCodePassword,
      usageEndpoint: process.env.AGENT_BRIDGE_MIMO_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_MIMO_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_MIMO_USAGE_TOKEN_ENV || '',
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_MIMO_CODE_TIMEOUT_MS', 30000),
      lightCapabilities: readBoolean('AGENT_BRIDGE_MIMO_CODE_LIGHT_CAPABILITIES', true)
    },
    codex: {
      command: process.env.AGENT_BRIDGE_CODEX_COMMAND || readProfileString(profile, 'codexCommand', 'codex'),
      args: process.env.AGENT_BRIDGE_CODEX_ARGS || 'exec --json',
      runtime: process.env.AGENT_BRIDGE_CODEX_RUNTIME || 'auto',
      appServerArgs: ['app-server'],
      usageEndpoint: process.env.AGENT_BRIDGE_CODEX_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_CODEX_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_CODEX_USAGE_TOKEN_ENV || '',
      timeoutMs: readPositiveNumber('AGENT_BRIDGE_CODEX_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS)
    },
    claude: {
      command: process.env.AGENT_BRIDGE_CLAUDE_COMMAND || readProfileString(profile, 'claudeCommand', 'claude'),
      args: process.env.AGENT_BRIDGE_CLAUDE_ARGS || '-p --verbose --output-format stream-json --include-partial-messages',
      timeoutMs: readPositiveNumber('AGENT_BRIDGE_CLAUDE_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS)
    },
    antigravity: {
      command: process.env.AGENT_BRIDGE_ANTIGRAVITY_COMMAND || readProfileString(profile, 'antigravityCommand', 'antigravity'),
      args: process.env.AGENT_BRIDGE_ANTIGRAVITY_ARGS || readProfileString(profile, 'antigravityArgs', ''),
      promptMode: process.env.AGENT_BRIDGE_ANTIGRAVITY_PROMPT_MODE || 'arg',
      modelFlag: process.env.AGENT_BRIDGE_ANTIGRAVITY_MODEL_FLAG || '',
      cwdFlag: process.env.AGENT_BRIDGE_ANTIGRAVITY_CWD_FLAG || '',
      jsonMode: process.env.AGENT_BRIDGE_ANTIGRAVITY_JSON_MODE || 'none',
      timeoutMs: readPositiveNumber('AGENT_BRIDGE_ANTIGRAVITY_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS)
    },
    openClaw: {
      command: process.env.AGENT_BRIDGE_OPENCLAW_COMMAND || readProfileString(profile, 'openClawCommand', 'openclaw'),
      args: process.env.AGENT_BRIDGE_OPENCLAW_ARGS || readProfileString(profile, 'openClawArgs', 'agent --message'),
      timeoutMs: readPositiveNumber('AGENT_BRIDGE_OPENCLAW_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS)
    },
    openClawGateway: {
      baseUrl: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_URL || readProfileString(profile, 'openClawGatewayUrl', 'http://127.0.0.1:18789'),
      token: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '',
      usageEndpoint: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_USAGE_TOKEN_ENV || '',
      model: process.env.AGENT_BRIDGE_OPENCLAW_GATEWAY_MODEL || readProfileString(profile, 'openClawGatewayModel', 'openclaw/default'),
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_OPENCLAW_GATEWAY_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS),
      healthTimeoutMs: readPositiveNumber('AGENT_BRIDGE_OPENCLAW_GATEWAY_HEALTH_TIMEOUT_MS', 30000)
    },
    hermes: {
      command: process.env.AGENT_BRIDGE_HERMES_COMMAND || readProfileString(profile, 'hermesCommand', 'hermes'),
      args: process.env.AGENT_BRIDGE_HERMES_ARGS || readProfileString(profile, 'hermesArgs', 'chat --quiet -q'),
      timeoutMs: readPositiveNumber('AGENT_BRIDGE_HERMES_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS)
    },
    hermesStudio: {
      baseUrl: process.env.AGENT_BRIDGE_HERMES_STUDIO_URL || readProfileString(profile, 'hermesStudioUrl', 'http://127.0.0.1:8648'),
      token: process.env.AGENT_BRIDGE_HERMES_STUDIO_TOKEN || process.env.HERMES_STUDIO_TOKEN || process.env.AUTH_TOKEN || '',
      usageEndpoint: process.env.AGENT_BRIDGE_HERMES_STUDIO_USAGE_URL || '',
      usageEndpointEnv: process.env.AGENT_BRIDGE_HERMES_STUDIO_USAGE_URL_ENV || '',
      usageEndpointTokenEnv: process.env.AGENT_BRIDGE_HERMES_STUDIO_USAGE_TOKEN_ENV || '',
      profile: process.env.AGENT_BRIDGE_HERMES_STUDIO_PROFILE || readProfileString(profile, 'hermesStudioProfile', 'default'),
      provider: process.env.AGENT_BRIDGE_HERMES_STUDIO_PROVIDER || readProfileString(profile, 'hermesStudioProvider', ''),
      model: process.env.AGENT_BRIDGE_HERMES_STUDIO_MODEL || readProfileString(profile, 'hermesStudioModel', ''),
      requestTimeoutMs: readPositiveNumber('AGENT_BRIDGE_HERMES_STUDIO_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS),
      healthTimeoutMs: readPositiveNumber('AGENT_BRIDGE_HERMES_STUDIO_HEALTH_TIMEOUT_MS', 30000)
    }
  };
}

function readProfileString(profile, key, fallbackValue) {
  if (!profile || typeof profile !== 'object') {
    return fallbackValue;
  }
  const value = profile[key];
  return typeof value === 'string' && value.length > 0 ? value : fallbackValue;
}

module.exports = {
  createConfig
};
