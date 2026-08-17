#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { AgentManager } = require('./agent-manager');
const { hashPassword } = require('./auth');
const { AutostartManager } = require('./autostart-manager');
const { DaemonUpdateManager } = require('./daemon-update-manager');
const { connectionEndpoint, connectionPayload } = require('./connect-wizard');
const { createDaemonStore, randomId } = require('./daemon-store');
const { publicDeviceIdentity } = require('./device-identity');
const { buildDaemonDoctorReport } = require('./diagnostics');
const { FileCheckpointStore } = require('./file-checkpoint-store');
const { GitHubClient } = require('./github-client');
const { McpHostManager, httpBridgeUrl } = require('./mcp-host');
const { ManagedProcessLedger, processIsAlive } = require('./managed-process-ledger');
const {
  NetworkAddressTracker,
  chooseDefaultAddress,
  isLoopbackHost,
  listIPv4Addresses,
  resolveBindHost,
  resolveConnectHost
} = require('./network-address');
const { NotificationManager } = require('./notification-manager');
const { resolveLanguage, t } = require('./i18n');
const { openFile, openFileCommandForPlatform } = require('./open-file');
const { loadProfile, profileDirectory, profilePath, saveProfile } = require('./profile-store');
const { RequestType } = require('./protocol');
const { ProviderSecretStore } = require('./provider-secret-store');
const { scanProviders } = require('./provider-scan');
const {
  SecurityAuditLog,
  bearerTokenStatus,
  bcryptStatus,
  hostAllowlistStatus,
  rotateBearerToken,
  setAuthPreference,
  setHostAllowlist,
  setTlsPreference,
  tlsStatus
} = require('./security-audit');
const { renderTerminalQr, writeQrImageFiles } = require('./qr-code');
const { TerminalManager } = require('./terminal-manager');
const { createTerminalLogger } = require('./terminal-log');
const { WorkspaceRegistry } = require('./workspace-registry');
const { WorkspaceService } = require('./workspace-service');

const COLOR_ENABLED = process.env.NO_COLOR !== '1' && process.env.NO_COLOR !== 'true' && process.stdout.isTTY !== false;
const SPINNER_FRAMES = ['-', '\\', '|', '/'];
const NETWORK_ADDRESS_POLL_MS = 5000;
const NETWORK_ADDRESS_STABLE_OBSERVATIONS = 2;

function color(code, value) {
  if (!COLOR_ENABLED) {
    return value;
  }
  return '\x1b[' + code + 'm' + value + '\x1b[0m';
}

function bold(value) {
  return color('1', value);
}

function dim(value) {
  return color('2', value);
}

function green(value) {
  return color('32', value);
}

function yellow(value) {
  return color('33', value);
}

function red(value) {
  return color('31', value);
}

function cyan(value) {
  return color('36', value);
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(value) {
  const text = stripAnsi(value);
  let width = 0;
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index);
    if (codePoint > 0xffff) {
      index++;
    }
    width += isFullWidthCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

function isFullWidthCodePoint(codePoint) {
  return (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6);
}

function padRight(value, width) {
  const text = String(value);
  const diff = width - visibleLength(text);
  if (diff <= 0) {
    return text;
  }
  return text + ' '.repeat(diff);
}

function resolveRepoRoot() {
  return process.cwd();
}

function printBanner(language) {
  const platform = process.platform + ' ' + process.arch;
  const title = t(language, 'productName');
  const tagline = t(language, 'tagline');
  const runtime = 'Node ' + process.version + ' / ' + platform;
  const contentWidth = Math.max(56, visibleLength(title), visibleLength(tagline), visibleLength(runtime));
  console.log('');
  console.log(cyan('+' + '-'.repeat(contentWidth + 2) + '+'));
  console.log(cyan('|') + ' ' + bold(title) + padRight('', contentWidth - visibleLength(title)) + ' ' + cyan('|'));
  console.log(cyan('|') + ' ' + dim(tagline) + padRight('', contentWidth - visibleLength(tagline)) + ' ' + cyan('|'));
  console.log(cyan('|') + ' ' + dim(runtime) + padRight('', contentWidth - visibleLength(runtime)) + ' ' + cyan('|'));
  console.log(cyan('+' + '-'.repeat(contentWidth + 2) + '+'));
  console.log('');
}

function parseArgs(argv) {
  const args = {
    help: false,
    setup: false,
    doctor: false,
    noOpenQr: false,
    terminalQr: false,
    noStartProviders: false,
    forceStartIds: [],
    host: '',
    daemonUrl: '',
    connectHost: '',
    bindHost: '',
    port: 0,
    token: '',
    passwordEnv: '',
    language: ''
  };

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      args.help = true;
    } else if (value === '--setup') {
      args.setup = true;
    } else if (value === '--doctor') {
      args.doctor = true;
    } else if (value === '--no-open-qr') {
      args.noOpenQr = true;
    } else if (value === '--terminal-qr') {
      args.terminalQr = true;
    } else if (value === '--no-start-providers') {
      args.noStartProviders = true;
    } else if (value === '--start' && index + 1 < argv.length) {
      appendProviderIds(args.forceStartIds, argv[index + 1]);
      index++;
    } else if (value.startsWith('--start=')) {
      appendProviderIds(args.forceStartIds, value.substring('--start='.length));
    } else if (value === '--daemon-url' && index + 1 < argv.length) {
      args.daemonUrl = argv[index + 1];
      index++;
    } else if (value.startsWith('--daemon-url=')) {
      args.daemonUrl = value.substring('--daemon-url='.length);
    } else if (value === '--host' && index + 1 < argv.length) {
      args.host = argv[index + 1];
      index++;
    } else if (value.startsWith('--host=')) {
      args.host = value.substring('--host='.length);
    } else if (value === '--connect-host' && index + 1 < argv.length) {
      args.connectHost = argv[index + 1];
      index++;
    } else if (value.startsWith('--connect-host=')) {
      args.connectHost = value.substring('--connect-host='.length);
    } else if (value === '--bind-host' && index + 1 < argv.length) {
      args.bindHost = argv[index + 1];
      index++;
    } else if (value.startsWith('--bind-host=')) {
      args.bindHost = value.substring('--bind-host='.length);
    } else if (value === '--port' && index + 1 < argv.length) {
      args.port = parsePort(argv[index + 1], 0);
      index++;
    } else if (value.startsWith('--port=')) {
      args.port = parsePort(value.substring('--port='.length), 0);
    } else if (value === '--token' && index + 1 < argv.length) {
      args.token = argv[index + 1];
      index++;
    } else if (value.startsWith('--token=')) {
      args.token = value.substring('--token='.length);
    } else if (value === '--password-env' && index + 1 < argv.length) {
      args.passwordEnv = argv[index + 1];
      index++;
    } else if (value.startsWith('--password-env=')) {
      args.passwordEnv = value.substring('--password-env='.length);
    } else if ((value === '--language' || value === '--lang') && index + 1 < argv.length) {
      args.language = argv[index + 1];
      index++;
    } else if (value.startsWith('--language=')) {
      args.language = value.substring('--language='.length);
    } else if (value.startsWith('--lang=')) {
      args.language = value.substring('--lang='.length);
    }
  }

  return args;
}

function appendProviderIds(target, value) {
  const parts = String(value || '').split(',');
  for (const part of parts) {
    const id = part.trim().toLowerCase();
    if ((id === 'opencode' || id === 'deveco' || id === 'mimo' || id === 'openclaw-gateway' || id === 'hermes-studio') && !target.includes(id)) {
      target.push(id);
    }
  }
}

function parsePort(value, fallbackValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallbackValue;
  }
  return parsed;
}

function readString(profile, key, fallbackValue) {
  if (!profile || typeof profile !== 'object') {
    return fallbackValue;
  }
  const value = profile[key];
  return typeof value === 'string' && value.length > 0 ? value : fallbackValue;
}

function readBoolean(profile, key, fallbackValue) {
  if (!profile || typeof profile !== 'object') {
    return fallbackValue;
  }
  const value = profile[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function findScanResult(scanResults, providerId) {
  for (const item of scanResults) {
    if (item.id === providerId) {
      return item;
    }
  }
  return null;
}

function scannedCommand(scanResults, providerId, fallbackValue) {
  const item = findScanResult(scanResults, providerId);
  if (item && item.command.length > 0) {
    return item.command;
  }
  return fallbackValue;
}

function shouldStartProvider(args, scanResults, providerId) {
  const scan = findScanResult(scanResults, providerId);
  if (!scan || !scan.canStartServer || scan.serverHealthy) {
    return false;
  }
  if (args.noStartProviders) {
    return false;
  }
  if (args.forceStartIds.includes(providerId)) {
    return scan.installed;
  }
  return scan.installed;
}

function buildOptions(args, savedProfile, scanResults, language) {
  const addresses = listIPv4Addresses();
  const defaultConnectHost = chooseDefaultAddress(addresses, '');
  const profileConnectHost = readString(savedProfile, 'connectHost', defaultConnectHost);
  const hostSelection = resolveConnectHost(addresses, args.connectHost, profileConnectHost);
  const connectHost = hostSelection.connectHost;
  const profileBindHost = readString(savedProfile, 'bindHost', '');
  const bindHost = resolveBindHost(addresses, args.bindHost, profileBindHost, hostSelection);
  const port = args.port > 0 ? args.port : parsePort(readString(savedProfile, 'port', ''), savedProfile && savedProfile.port ? savedProfile.port : 8787);
  const token = args.token.length > 0 ? args.token : readString(savedProfile, 'token', crypto.randomBytes(24).toString('hex'));

  const openCodeCommand = scannedCommand(scanResults, 'opencode', readString(savedProfile, 'openCodeCommand', 'opencode'));
  const devEcoCommand = scannedCommand(scanResults, 'deveco', readString(savedProfile, 'devEcoCommand', 'deveco'));
  const mimoCodeCommand = scannedCommand(scanResults, 'mimo', readString(savedProfile, 'mimoCodeCommand', 'mimo'));
  const openClawCommand = scannedCommand(scanResults, 'openclaw', readString(savedProfile, 'openClawCommand', 'openclaw'));
  const hermesCommand = scannedCommand(scanResults, 'hermes', readString(savedProfile, 'hermesCommand', 'hermes'));
  const hermesStudioCommand = scannedCommand(scanResults, 'hermes-studio', readString(savedProfile, 'hermesStudioCommand', 'hermes-web-ui'));

  return {
    repoRoot: resolveRepoRoot(),
    language,
    connectHost,
    bindHost,
    networkHostSelection: hostSelection,
    port,
    token,
    providerId: '',
    workspacePath: '',
    workspaceTitle: '',
    openCodeCommand,
    devEcoCommand,
    mimoCodeCommand,
    openCodeUrl: readString(savedProfile, 'openCodeUrl', 'http://127.0.0.1:4096'),
    devEcoUrl: readString(savedProfile, 'devEcoUrl', 'http://127.0.0.1:4097'),
    mimoCodeUrl: readString(savedProfile, 'mimoCodeUrl', 'http://127.0.0.1:4098'),
    openClawGatewayUrl: readString(savedProfile, 'openClawGatewayUrl', 'http://127.0.0.1:18789'),
    openClawGatewayModel: readString(savedProfile, 'openClawGatewayModel', 'openclaw/default'),
    hermesStudioUrl: readString(savedProfile, 'hermesStudioUrl', 'http://127.0.0.1:8648'),
    hermesStudioProfile: readString(savedProfile, 'hermesStudioProfile', 'default'),
    hermesStudioProvider: readString(savedProfile, 'hermesStudioProvider', ''),
    hermesStudioModel: readString(savedProfile, 'hermesStudioModel', ''),
    startOpenCode: shouldStartProvider(args, scanResults, 'opencode'),
    startDevEco: shouldStartProvider(args, scanResults, 'deveco'),
    startMimoCode: shouldStartProvider(args, scanResults, 'mimo'),
    startOpenClawGateway: shouldStartProvider(args, scanResults, 'openclaw-gateway'),
    startHermesStudio: shouldStartProvider(args, scanResults, 'hermes-studio'),
    codexCommand: scannedCommand(scanResults, 'codex', readString(savedProfile, 'codexCommand', 'codex')),
    claudeCommand: scannedCommand(scanResults, 'claude', readString(savedProfile, 'claudeCommand', 'claude')),
    antigravityCommand: scannedCommand(scanResults, 'antigravity', readString(savedProfile, 'antigravityCommand', 'antigravity')),
    antigravityArgs: readString(savedProfile, 'antigravityArgs', ''),
    openClawCommand,
    openClawArgs: readString(savedProfile, 'openClawArgs', 'agent --message'),
    hermesCommand,
    hermesArgs: readString(savedProfile, 'hermesArgs', 'chat --quiet -q'),
    hermesStudioCommand,
    hermesStudioArgs: readString(savedProfile, 'hermesStudioArgs', 'start --no-open')
  };
}

function saveOptions(options) {
  return saveProfile({
    language: options.language,
    connectHost: options.connectHost,
    bindHost: options.bindHost,
    port: options.port,
    token: options.token,
    providerId: '',
    workspacePath: '',
    workspaceTitle: '',
    openCodeCommand: options.openCodeCommand,
    devEcoCommand: options.devEcoCommand,
    mimoCodeCommand: options.mimoCodeCommand,
    openCodeUrl: options.openCodeUrl,
    devEcoUrl: options.devEcoUrl,
    mimoCodeUrl: options.mimoCodeUrl,
    startOpenCode: options.startOpenCode,
    startDevEco: options.startDevEco,
    startMimoCode: options.startMimoCode,
    codexCommand: options.codexCommand,
    claudeCommand: options.claudeCommand,
    antigravityCommand: options.antigravityCommand,
    antigravityArgs: options.antigravityArgs,
    openClawCommand: options.openClawCommand,
    openClawArgs: options.openClawArgs,
    openClawGatewayUrl: options.openClawGatewayUrl,
    openClawGatewayModel: options.openClawGatewayModel,
    startOpenClawGateway: options.startOpenClawGateway,
    hermesCommand: options.hermesCommand,
    hermesArgs: options.hermesArgs,
    hermesStudioCommand: options.hermesStudioCommand,
    hermesStudioArgs: options.hermesStudioArgs,
    hermesStudioUrl: options.hermesStudioUrl,
    hermesStudioProfile: options.hermesStudioProfile,
    hermesStudioProvider: options.hermesStudioProvider,
    hermesStudioModel: options.hermesStudioModel,
    startHermesStudio: options.startHermesStudio
  });
}

function launcherAuthenticationError(code, message, remediation) {
  const error = new Error(message);
  error.code = code;
  error.remediation = remediation;
  return error;
}

function prepareLauncherAuthentication(args, savedProfile, options, store, environment) {
  const auth = bcryptStatus(store);
  if (auth.authReady !== true) {
    throw launcherAuthenticationError(
      auth.failureCategory || 'auth_config_invalid',
      auth.message || 'Bridge authentication configuration is invalid.',
      auth.remediation || 'Recover authentication locally before starting Bridge.'
    );
  }
  options.authMode = auth.activeMode;
  options.connectionCredential = options.token;
  options.credentialSource = options.token.length > 0 ? 'bearer' : 'none';
  options.credentialEphemeral = false;
  options.passwordEnvName = '';
  if (auth.activeMode !== 'bcrypt') {
    return options;
  }
  if (args.token.length > 0) {
    throw launcherAuthenticationError(
      'bcrypt_password_argument_rejected',
      'Do not pass a bcrypt password through --token because command-line arguments can be inspected by other processes.',
      'Put the password in a dedicated environment variable and pass its name with --password-env.'
    );
  }
  const passwordEnvName = args.passwordEnv.length > 0 ? args.passwordEnv : 'AGENT_BRIDGE_PASSWORD';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(passwordEnvName)) {
    throw launcherAuthenticationError(
      'password_env_name_invalid',
      'Password environment variable name is invalid.',
      'Use an environment variable name containing letters, digits, and underscores.'
    );
  }
  const password = typeof environment[passwordEnvName] === 'string' ? environment[passwordEnvName] : '';
  if (password.length === 0) {
    throw launcherAuthenticationError(
      'password_env_empty',
      'Bcrypt mode requires a non-empty password in ' + passwordEnvName + '.',
      'Set the environment variable for this launcher invocation, or use daemon start when no connection QR is needed.'
    );
  }
  if (password.length > 4096) {
    throw launcherAuthenticationError(
      'password_too_long',
      'Bcrypt password exceeds the 4096 character safety limit.',
      'Use a shorter password.'
    );
  }
  const persistedBearerToken = readString(savedProfile, 'token', '');
  options.token = persistedBearerToken.length > 0 ? persistedBearerToken : crypto.randomBytes(24).toString('hex');
  options.connectionCredential = password;
  options.credentialSource = 'env:' + passwordEnvName;
  options.credentialEphemeral = true;
  options.passwordEnvName = passwordEnvName;
  delete environment[passwordEnvName];
  return options;
}

function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function chooseAvailablePort(host, requestedPort) {
  let port = requestedPort;
  while (port <= 65535) {
    if (await isPortAvailable(host, port)) {
      return port;
    }
    port++;
  }
  return requestedPort;
}

function healthUrlForBridge(options) {
  const host = options.bindHost === '0.0.0.0' || options.bindHost === '::' ? '127.0.0.1' : options.bindHost;
  return 'http://' + host + ':' + String(options.port) + '/health';
}

function waitHttpOk(urlText, timeoutMs, signal) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    let retryTimer = null;
    let currentRequest = null;

    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abort);
      }
      resolve(value);
    }

    function abort() {
      const request = currentRequest;
      finish(false);
      if (request && !request.destroyed) {
        request.destroy();
      }
    }

    function attempt() {
      retryTimer = null;
      if (settled || (signal && signal.aborted)) {
        finish(false);
        return;
      }
      let attemptFinished = false;
      const req = http.request(urlText, { method: 'GET', timeout: 1600 }, (res) => {
        if (attemptFinished || settled) {
          res.resume();
          return;
        }
        attemptFinished = true;
        currentRequest = null;
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          finish(true);
          return;
        }
        retry();
      });
      currentRequest = req;
      req.on('timeout', () => {
        req.destroy();
      });
      req.on('error', () => {
        if (attemptFinished || settled) {
          return;
        }
        attemptFinished = true;
        currentRequest = null;
        retry();
      });
      req.end();
    }

    function retry() {
      if (settled || (signal && signal.aborted) || Date.now() >= deadline) {
        finish(false);
        return;
      }
      if (!retryTimer) {
        retryTimer = setTimeout(attempt, 500);
      }
    }

    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) {
        finish(false);
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }

    attempt();
  });
}

function readBridgeHealth(urlText, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let sizeBytes = 0;
    const chunks = [];

    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    }

    const req = http.request(urlText, { method: 'GET', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        finish(null);
        return;
      }
      res.on('data', (chunk) => {
        if (settled) {
          return;
        }
        sizeBytes += chunk.length;
        if (sizeBytes > 1024 * 1024) {
          res.destroy();
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) {
          return;
        }
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const protocolVersion = value && typeof value.protocolVersion === 'string' ? value.protocolVersion : '';
          const serverId = value && typeof value.serverId === 'string' ? value.serverId : '';
          if (value && value.ok === true && protocolVersion.startsWith('agent-bridge.') && serverId.length > 0) {
            finish(value);
            return;
          }
        } catch (_error) {
          // A non-Bridge service may own the port.
        }
        finish(null);
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => finish(null));
    req.end();
  });
}

function bridgeHealthDeviceIdentity(health) {
  if (health && health.deviceIdentity && typeof health.deviceIdentity === 'object') {
    return health.deviceIdentity;
  }
  if (health && health.serverInfo && typeof health.serverInfo === 'object' &&
    health.serverInfo.deviceIdentity && typeof health.serverInfo.deviceIdentity === 'object') {
    return health.serverInfo.deviceIdentity;
  }
  return null;
}

function bridgeHealthMatchesProfile(health, savedProfile) {
  if (!health || !savedProfile) {
    return false;
  }
  const remoteIdentity = bridgeHealthDeviceIdentity(health);
  if (!remoteIdentity) {
    return false;
  }
  const localIdentity = publicDeviceIdentity(savedProfile);
  return remoteIdentity.physicalDeviceId === localIdentity.physicalDeviceId &&
    remoteIdentity.publicKeyFingerprint === localIdentity.publicKeyFingerprint;
}

async function inspectExistingLocalBridge(store, options, savedProfile) {
  const healthUrl = healthUrlForBridge(options);
  const health = await readBridgeHealth(healthUrl, 1800);
  const savedToken = readString(savedProfile, 'token', '');
  const credentialMatches = options.authMode === 'bcrypt' || savedToken.length === 0 || options.token === savedToken;
  if (credentialMatches && bridgeHealthMatchesProfile(health, savedProfile)) {
    return {
      kind: 'reusable',
      healthUrl,
      supervisorPid: 0
    };
  }
  const localStatus = buildLocalDaemonHealthForCli(store, 'launcher.preflight', '', '');
  const supervisorPid = localStatus && typeof localStatus.supervisorPid === 'number' ? localStatus.supervisorPid : 0;
  if (supervisorPid > 0 && processIsAlive(supervisorPid)) {
    return {
      kind: 'busy',
      healthUrl,
      supervisorPid
    };
  }
  return {
    kind: 'none',
    healthUrl,
    supervisorPid: 0
  };
}

async function withSpinner(language, label, task) {
  if (!process.stdout.isTTY) {
    console.log(label + '...');
    const value = await task;
    console.log(label + ' ' + green(t(language, 'spinnerDone')));
    return value;
  }
  let index = 0;
  process.stdout.write(dim(SPINNER_FRAMES[index] + ' ' + label));
  const timer = setInterval(() => {
    index = (index + 1) % SPINNER_FRAMES.length;
    process.stdout.write('\r' + dim(SPINNER_FRAMES[index] + ' ' + label));
  }, 90);
  try {
    const value = await task;
    clearInterval(timer);
    process.stdout.write('\r' + green(t(language, 'spinnerOk')) + ' ' + label + '\n');
    return value;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write('\r' + red(t(language, 'spinnerError')) + ' ' + label + '\n');
    throw error;
  }
}

function providerStatus(language, scanResult) {
  if (!scanResult) {
    return red(t(language, 'statusMissing'));
  }
  if (scanResult.serverHealthy) {
    return green(t(language, 'statusServerReady'));
  }
  if (scanResult.installed) {
    return yellow(t(language, 'statusInstalled'));
  }
  if (scanResult.id === 'mock') {
    return green(t(language, 'statusBuiltIn'));
  }
  return red(t(language, 'statusMissing'));
}

function printProviderTable(language, scanResults, startPlan) {
  const rows = [];
  for (const item of scanResults) {
    let action = t(language, 'actionAvailable');
    if (item.canStartServer) {
      if (item.serverHealthy) {
        action = t(language, 'actionReuseRunning');
      } else if (startPlan.includes(item.id)) {
        action = t(language, 'actionStartLocal');
      } else if (item.installed) {
        action = t(language, 'actionManualStart');
      } else {
        action = t(language, 'actionNotInstalled');
      }
    } else if (!item.installed) {
      action = item.id === 'mock' ? t(language, 'actionTestFallback') : t(language, 'actionInstallCli');
    }
    rows.push([
      item.displayName,
      item.command.length > 0 ? item.command : '-',
      providerStatus(language, item),
      providerDetail(language, item),
      action
    ]);
  }
  printTable([
    t(language, 'providerHeader'),
    t(language, 'commandHeader'),
    t(language, 'statusHeader'),
    t(language, 'detailHeader'),
    t(language, 'nextStepHeader')
  ], rows);
}

function providerDetail(language, item) {
  if (!item) {
    return '-';
  }
  const parts = [];
  if (typeof item.version === 'string' && item.version.length > 0) {
    parts.push(item.version);
  }
  if (typeof item.modelCount === 'number' && item.modelCount > 0) {
    parts.push(t(language, 'providerModels', { count: item.modelCount }));
  }
  if (typeof item.sessionCount === 'number' && item.sessionCount > 0) {
    parts.push(t(language, 'providerSessions', { count: item.sessionCount }));
  }
  if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
    parts.push(item.capabilities.join(','));
  }
  if (typeof item.detail === 'string' && item.detail.length > 0) {
    parts.push(item.detail);
  }
  return parts.length > 0 ? parts.join(' · ') : '-';
}

function printTable(headers, rows) {
  const widths = headers.map((header) => visibleLength(header));
  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      widths[index] = Math.max(widths[index], visibleLength(row[index]));
    }
  }
  const divider = '+' + widths.map((width) => '-'.repeat(width + 2)).join('+') + '+';
  console.log(cyan(divider));
  console.log(cyan('|') + headers.map((header, index) => ' ' + bold(padRight(header, widths[index])) + ' ').join(cyan('|')) + cyan('|'));
  console.log(cyan(divider));
  for (const row of rows) {
    console.log(cyan('|') + row.map((cell, index) => ' ' + padRight(cell, widths[index]) + ' ').join(cyan('|')) + cyan('|'));
  }
  console.log(cyan(divider));
}

function providerUrl(options, providerId) {
  if (providerId === 'opencode') {
    return options.openCodeUrl;
  }
  if (providerId === 'deveco') {
    return options.devEcoUrl;
  }
  if (providerId === 'openclaw-gateway') {
    return options.openClawGatewayUrl;
  }
  if (providerId === 'hermes-studio') {
    return options.hermesStudioUrl;
  }
  return options.mimoCodeUrl;
}

function providerCommand(options, providerId) {
  if (providerId === 'opencode') {
    return options.openCodeCommand;
  }
  if (providerId === 'deveco') {
    return options.devEcoCommand;
  }
  if (providerId === 'openclaw-gateway') {
    return options.openClawCommand;
  }
  if (providerId === 'hermes-studio') {
    return options.hermesStudioCommand;
  }
  return options.mimoCodeCommand;
}

function providerLabel(providerId) {
  if (providerId === 'opencode') {
    return 'OpenCode';
  }
  if (providerId === 'deveco') {
    return 'DevEco Code';
  }
  if (providerId === 'openclaw-gateway') {
    return 'OpenClaw Gateway';
  }
  if (providerId === 'hermes-studio') {
    return 'Hermes Studio';
  }
  return 'MiMo Code';
}

function parseServerAddress(urlText, fallbackPort) {
  const parsed = new URL(urlText);
  const host = parsed.hostname && parsed.hostname.length > 0 ? parsed.hostname : '127.0.0.1';
  const port = parsed.port && parsed.port.length > 0 ? parsed.port : String(fallbackPort);
  return { host, port };
}

function attachOutput(child, label, options) {
  attachStream(child.stdout, label, options);
  attachStream(child.stderr, label, options);
}

function attachStream(stream, label, options) {
  if (!stream) {
    return;
  }
  const passthrough = options && options.passthrough === true;
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim().length > 0) {
        if (passthrough) {
          console.log(line);
        } else {
          console.log(dim('[' + label + '] ') + line);
        }
      }
    }
  });
}

async function startCompatibleServer(language, options, providerId, children, signal) {
  const label = providerLabel(providerId);
  const serverUrl = providerUrl(options, providerId);
  const command = providerCommand(options, providerId);
  const defaultPort = providerId === 'opencode' ? 4096 : (providerId === 'deveco' ? 4097 : (providerId === 'openclaw-gateway' ? 18789 : (providerId === 'hermes-studio' ? 8648 : 4098)));
  const address = parseServerAddress(serverUrl, defaultPort);
  const args = startArgsForProvider(options, providerId, address);
  const child = spawn(command, args, {
    cwd: options.repoRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.ngfTerminateProcessTree = process.platform === 'win32';
  children.push(child);
  attachOutput(child, label);
  child.on('error', (error) => {
    console.log(red(t(language, 'errorPrefix')) + ' ' + t(language, 'providerStartFailed', { label, message: error.message }));
  });
  const ok = await withSpinner(
    language,
    t(language, 'waitingProvider', { label, url: serverUrl }),
    waitHttpOk(providerHealthUrl(serverUrl, providerId), 30000, signal)
  );
  if (signal && signal.aborted) {
    return;
  }
  if (!ok) {
    console.log(yellow(t(language, 'warnPrefix')) + ' ' + t(language, 'providerNotHealthy', { label }));
  }
}

function startArgsForProvider(options, providerId, address) {
  if (providerId === 'openclaw-gateway') {
    return ['gateway', '--port', address.port, '--verbose'];
  }
  if (providerId === 'hermes-studio') {
    return splitArgs(options.hermesStudioArgs);
  }
  return ['serve', '--hostname', address.host, '--port', address.port];
}

function providerHealthUrl(serverUrl, providerId) {
  if (providerId === 'openclaw-gateway') {
    return serverUrl + '/v1/models';
  }
  if (providerId === 'hermes-studio') {
    return serverUrl + '/api/health';
  }
  return serverUrl + '/global/health';
}

function splitArgs(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote.length > 0) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

async function startProviderServers(language, options, scanResults, children, signal) {
  const startIds = [];
  if (options.startOpenCode) {
    startIds.push('opencode');
  }
  if (options.startDevEco) {
    startIds.push('deveco');
  }
  if (options.startMimoCode) {
    startIds.push('mimo');
  }
  if (options.startOpenClawGateway) {
    startIds.push('openclaw-gateway');
  }
  if (options.startHermesStudio) {
    startIds.push('hermes-studio');
  }

  for (const providerId of startIds) {
    if (signal && signal.aborted) {
      return;
    }
    const scan = findScanResult(scanResults, providerId);
    if (!scan || scan.serverHealthy || !scan.installed) {
      continue;
    }
    await startCompatibleServer(language, options, providerId, children, signal);
  }
}

function writeConnectionQr(language, options) {
  const endpoint = connectionEndpoint(options.connectHost, options.port);
  const savedProfile = loadProfile();
  const deviceIdentity = savedProfile ? publicDeviceIdentity(savedProfile) : null;
  const credential = typeof options.connectionCredential === 'string' ? options.connectionCredential : options.token;
  const payload = connectionPayload(endpoint, credential, options.providerId, options.workspacePath, options.workspaceTitle, deviceIdentity);
  if (options.authMode === 'bcrypt') {
    removePersistedConnectionQrFiles();
    return {
      endpoint,
      payload,
      qrFiles: null,
      ephemeral: true
    };
  }
  try {
    const qrFiles = writeQrImageFiles(payload, profileDirectory(), 'agent-bridge-connection', {
      targetSize: 720,
      quietZone: 6,
      title: t(language, 'qrTitle'),
      description: t(language, 'qrDescription'),
      warning: t(language, 'qrWarning'),
      fields: [
        { label: t(language, 'bridgeUrl'), value: endpoint },
        { label: 'Device', value: deviceIdentity ? deviceIdentity.displayName : '' },
        { label: t(language, 'token'), value: options.token }
      ]
    });
    return { endpoint, payload, qrFiles, qrError: '', ephemeral: false };
  } catch (error) {
    removePersistedConnectionQrFiles();
    return {
      endpoint,
      payload,
      qrFiles: null,
      qrError: error instanceof Error ? error.message : String(error),
      ephemeral: false
    };
  }
}

function removePersistedConnectionQrFiles() {
  const directory = profileDirectory();
  const names = [
    'agent-bridge-connection.png',
    'agent-bridge-connection.svg',
    'agent-bridge-connection.html'
  ];
  for (const name of names) {
    const filePath = path.join(directory, name);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw launcherAuthenticationError(
        'stale_connection_qr_cleanup_failed',
        'Failed to remove stale persisted connection QR file: ' + filePath + '. ' + (error instanceof Error ? error.message : String(error)),
        'Remove the managed agent-bridge-connection QR files manually, then retry.'
      );
    }
  }
}

function printConnectionPanel(language, options, qrInfo) {
  const rows = [
    [t(language, 'bridgeUrl'), qrInfo.endpoint],
    [t(language, 'httpHealth'), healthUrlForBridge(options)]
  ];
  if (options.authMode === 'bcrypt') {
    rows.push(['Authentication', 'bcrypt']);
    rows.push(['Credential source', options.credentialSource]);
    rows.push(['Credential storage', 'memory only']);
  } else {
    rows.push([t(language, 'token'), options.token]);
  }
  if (qrInfo.qrFiles) {
    rows.push([t(language, 'qrPage'), qrInfo.qrFiles.htmlPath]);
  }
  rows.push([t(language, 'profile'), profilePath()]);
  printTable([t(language, 'fieldHeader'), t(language, 'valueHeader')], rows);
}

function printInitialNetworkHostNotice(language, options, launcherLogger) {
  const selection = options.networkHostSelection;
  if (!selection || selection.changed !== true) {
    return;
  }
  console.log('');
  console.log(yellow(t(language, 'networkHostRecovered', {
    previousHost: selection.previousHost,
    nextHost: selection.connectHost
  })));
  launcherLogger.warn('network.connect_host_recovered', {
    previousHost: selection.previousHost,
    nextHost: selection.connectHost,
    reason: selection.reason
  });
}

function startNetworkAddressMonitor(options, onChanged) {
  const selection = options.networkHostSelection;
  if (!selection || selection.explicit === true || net.isIP(options.connectHost) !== 4 || isLoopbackHost(options.connectHost)) {
    return () => {};
  }
  const tracker = new NetworkAddressTracker(options.connectHost, NETWORK_ADDRESS_STABLE_OBSERVATIONS);
  const timer = setInterval(() => {
    const addresses = listIPv4Addresses();
    const change = tracker.observe(addresses);
    if (!change) {
      return;
    }
    options.connectHost = change.nextHost;
    options.networkHostSelection = {
      connectHost: change.nextHost,
      previousHost: change.previousHost,
      changed: true,
      explicit: false,
      reason: change.reason
    };
    saveOptions(options);
    onChanged(change.previousHost, change.nextHost);
  }, NETWORK_ADDRESS_POLL_MS);
  return () => clearInterval(timer);
}

function bridgeEnvironment(options) {
  const env = {};
  for (const key of Object.keys(process.env)) {
    env[key] = process.env[key];
  }
  env.AGENT_BRIDGE_HOST = options.bindHost;
  env.AGENT_BRIDGE_PORT = String(options.port);
  env.AGENT_BRIDGE_TOKEN = options.token;
  env.AGENT_BRIDGE_OPENCODE_URL = options.openCodeUrl;
  env.AGENT_BRIDGE_DEVECO_URL = options.devEcoUrl;
  env.AGENT_BRIDGE_MIMO_CODE_URL = options.mimoCodeUrl;
  env.AGENT_BRIDGE_OPENCLAW_COMMAND = options.openClawCommand;
  env.AGENT_BRIDGE_OPENCLAW_ARGS = options.openClawArgs;
  env.AGENT_BRIDGE_OPENCLAW_GATEWAY_URL = options.openClawGatewayUrl;
  env.AGENT_BRIDGE_OPENCLAW_GATEWAY_MODEL = options.openClawGatewayModel;
  env.AGENT_BRIDGE_HERMES_COMMAND = options.hermesCommand;
  env.AGENT_BRIDGE_HERMES_ARGS = options.hermesArgs;
  env.AGENT_BRIDGE_HERMES_STUDIO_URL = options.hermesStudioUrl;
  env.AGENT_BRIDGE_HERMES_STUDIO_PROFILE = options.hermesStudioProfile;
  env.AGENT_BRIDGE_HERMES_STUDIO_PROVIDER = options.hermesStudioProvider;
  env.AGENT_BRIDGE_HERMES_STUDIO_MODEL = options.hermesStudioModel;
  if (!env.AGENT_BRIDGE_OPENCODE_LIGHT_CAPABILITIES) {
    env.AGENT_BRIDGE_OPENCODE_LIGHT_CAPABILITIES = '1';
  }
  if (!env.AGENT_BRIDGE_DEVECO_LIGHT_CAPABILITIES) {
    env.AGENT_BRIDGE_DEVECO_LIGHT_CAPABILITIES = '1';
  }
  if (!env.AGENT_BRIDGE_MIMO_CODE_LIGHT_CAPABILITIES) {
    env.AGENT_BRIDGE_MIMO_CODE_LIGHT_CAPABILITIES = '1';
  }
  env.AGENT_BRIDGE_CODEX_COMMAND = options.codexCommand;
  env.AGENT_BRIDGE_CLAUDE_COMMAND = options.claudeCommand;
  env.AGENT_BRIDGE_ANTIGRAVITY_COMMAND = options.antigravityCommand;
  env.AGENT_BRIDGE_ANTIGRAVITY_ARGS = options.antigravityArgs;
  return env;
}

async function waitForBridgeStartup(child, healthUrl, timeoutMs, signal) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }
  try {
    const result = await Promise.race([
      waitHttpOk(healthUrl, timeoutMs, controller.signal).then((ready) => {
        return { ready, exited: false, code: 0 };
      }),
      waitForExit(child).then((code) => {
        return { ready: false, exited: true, code };
      })
    ]);
    controller.abort();
    return result;
  } finally {
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', forwardAbort);
    }
  }
}

async function startBridge(language, options, children, signal) {
  const supervisorPath = path.join(__dirname, 'supervisor-entrypoint.js');
  const env = bridgeEnvironment(options);
  env.AGENT_BRIDGE_SUPERVISOR_FOREGROUND = '1';
  const child = spawn(process.execPath, [supervisorPath], {
    cwd: options.repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  attachOutput(child, t(language, 'bridgeOutputLabel'), { passthrough: true });
  child.on('error', (error) => {
    console.log(red(t(language, 'errorPrefix')) + ' ' + t(language, 'bridgeStartFailed', { message: error.message }));
  });
  const healthUrl = healthUrlForBridge(options);
  const startupTask = waitForBridgeStartup(child, healthUrl, 12000, signal).then((result) => {
    if (signal && signal.aborted) {
      return result;
    }
    if (result.exited) {
      throw new Error(t(language, 'bridgeExited', { code: result.code }));
    }
    if (!result.ready) {
      throw new Error(t(language, 'bridgeNotHealthy'));
    }
    return result;
  });
  await withSpinner(language, t(language, 'waitingBridge', { url: healthUrl }), startupTask);
  if (signal && signal.aborted) {
    return null;
  }
  return child;
}

function printHelp(language) {
  console.log(t(language, 'productName'));
  console.log('');
  console.log(t(language, 'usage'));
  console.log('  npm install -g @dlzz/agent-bridge');
  console.log('  ngf-agent-bridge');
  console.log('  ngf-agent-bridge --setup');
  console.log('  ngf-agent-bridge --doctor');
  console.log('  npm run agent-bridge');
  console.log('  npm run agent-bridge:start');
  console.log('  npm run agent-bridge:setup');
  console.log('  npm run agent-bridge:doctor');
  console.log('  node tools/agent-bridge/src/desktop-launcher.js --start opencode,openclaw-gateway,hermes-studio');
  console.log('  ngf-agent-bridge agent list');
  console.log('  ngf-agent-bridge agent list --tree');
  console.log('  ngf-agent-bridge agent doctor');
  console.log('  ngf-agent-bridge agent run "task" [--provider-id mock]');
  console.log('  ngf-agent-bridge agent attach <id> [--status-only]');
  console.log('  ngf-agent-bridge agent send <id> "follow-up task"');
  console.log('  ngf-agent-bridge agent status <id>');
  console.log('  ngf-agent-bridge agent stop|resume|delete <id>');
  console.log('  ngf-agent-bridge agent mode|model <id> <value>');
  console.log('  ngf-agent-bridge agent logs <id> [--limit 100]');
  console.log('  ngf-agent-bridge agent logs <id> --follow [--timeout-ms 30000]');
  console.log('  ngf-agent-bridge agent wait <id> [--status idle] [--timeout-ms 30000]');
  console.log('  ngf-agent-bridge agent fork|detach|archive <id>');
  console.log('  ngf-agent-bridge agent checkpoint list|create|inspect|restore <id>');
  console.log('  ngf-agent-bridge terminal list');
  console.log('  ngf-agent-bridge terminal create [--cwd <path>] [--rows 24] [--cols 80]');
  console.log('  ngf-agent-bridge terminal capture|rename|kill <id>');
  console.log('  ngf-agent-bridge terminal hook status');
  console.log('  ngf-agent-bridge terminal logs <id> [--max-bytes 65536]');
  console.log('  ngf-agent-bridge terminal follow <id> [--timeout-ms 30000]');
  console.log('  ngf-agent-bridge provider list');
  console.log('  ngf-agent-bridge provider capabilities|refresh');
  console.log('  ngf-agent-bridge provider discover|import <path> [--confirm] [--replace]');
  console.log('  ngf-agent-bridge provider directory refresh --url <https-url>');
  console.log('  ngf-agent-bridge provider directory list|status|install|rollback|remove [provider-id] [--confirm]');
  console.log('  ngf-agent-bridge provider usage [provider-id] [--session-id <id>] [--agent-id <id>] [--window session|day|month]');
  console.log('  ngf-agent-bridge provider upsert|clone|env|delete <profile-id>');
  console.log('  ngf-agent-bridge provider test --profile-id <id>');
  console.log('  ngf-agent-bridge metadata sessionTitle|branchName|commitMessage|pullRequest --session-id <id> [--timeout-ms <ms>]');
  console.log('  ngf-agent-bridge metadata cancel --request-id <id> [--session-id <id>]');
  console.log('  ngf-agent-bridge workspace list');
  console.log('  ngf-agent-bridge worktree list --cwd <repo>');
  console.log('  ngf-agent-bridge worktree create --cwd <repo> --path <path> --branch <branch> --confirm [--setup-command <cmd>]');
  console.log('  ngf-agent-bridge worktree archive --cwd <repo> --path <path> --confirm [--teardown-command <cmd>]');
  console.log('  ngf-agent-bridge git status --cwd <repo>');
  console.log('  ngf-agent-bridge git discard --cwd <repo> --file <path> --preview');
  console.log('  ngf-agent-bridge git pull --cwd <repo> --preview');
  console.log('  ngf-agent-bridge git push --cwd <repo> --force --preview');
  console.log('  ngf-agent-bridge git branch delete --name <branch> --cwd <repo> --preview');
  console.log('  ngf-agent-bridge git stash pop|drop --cwd <repo> --preview');
  console.log('  ngf-agent-bridge git merge <ref> --cwd <repo> --preview');
  console.log('  High-risk Git confirm: repeat the command with --plan-id <id> --confirm');
  console.log('  ngf-agent-bridge github pr status --owner <owner> --repo <repo> --number <number>');
  console.log('  ngf-agent-bridge github checks list --owner <owner> --repo <repo> --sha <sha>');
  console.log('  ngf-agent-bridge mcp tools');
  console.log('  ngf-agent-bridge mcp server start');
  console.log('  ngf-agent-bridge mcp stdio');
  console.log('  ngf-agent-bridge permit list');
  console.log('  ngf-agent-bridge permit wait [--agent-id <id>] [--kind permission] [--timeout-ms 30000]');
  console.log('  ngf-agent-bridge permit approve --agent-id <id> --request-id <id>');
  console.log('  ngf-agent-bridge permit deny|respond [--request-id <id>] [--all]');
  console.log('  ngf-agent-bridge notification list');
  console.log('  ngf-agent-bridge notification wait [--kind permission] [--timeout-ms 30000]');
  console.log('  ngf-agent-bridge notification prune');
  console.log('  ngf-agent-bridge daemon status');
  console.log('  ngf-agent-bridge daemon health');
  console.log('  ngf-agent-bridge daemon start');
  console.log('  ngf-agent-bridge daemon stop');
  console.log('  ngf-agent-bridge daemon restart');
  console.log('  ngf-agent-bridge daemon autostart preview');
  console.log('  ngf-agent-bridge daemon autostart install --confirm');
  console.log('  ngf-agent-bridge daemon autostart uninstall --confirm');
  console.log('  ngf-agent-bridge daemon update status');
  console.log('  ngf-agent-bridge daemon update check [--channel latest] [--version <version>]');
  console.log('  ngf-agent-bridge daemon update preview [--channel latest] [--version <version>]');
  console.log('  ngf-agent-bridge daemon update install --confirm [--force]');
  console.log('  ngf-agent-bridge daemon update rollback --confirm');
  console.log('  ngf-agent-bridge security devices');
  console.log('  ngf-agent-bridge security audit [--limit 100] [--severity warning]');
  console.log('  ngf-agent-bridge security hosts status');
  console.log('  ngf-agent-bridge security hosts add localhost 127.0.0.1');
  console.log('  ngf-agent-bridge security token status');
  console.log('  ngf-agent-bridge security token rotate');
  console.log('  ngf-agent-bridge security tls status');
  console.log('  ngf-agent-bridge security tls set --enabled on --cert <path> --key <path>');
  console.log('  ngf-agent-bridge security auth status');
  console.log('  ngf-agent-bridge security auth set --mode bcrypt --password-env <ENV_NAME> [--local]');
  console.log('  ngf-agent-bridge security auth set --mode bearer --local');
  console.log('  ngf-agent-bridge relay status');
  console.log('  ngf-agent-bridge relay pairing start --url <wss-url> --confirm');
  console.log('  ngf-agent-bridge relay pairing cancel --confirm');
  console.log('  ngf-agent-bridge relay connect --url <wss-url> --relay-id <id> --confirm');
  console.log('  ngf-agent-bridge relay disconnect --confirm');
  console.log('  ngf-agent-bridge relay devices [--include-revoked]');
  console.log('  ngf-agent-bridge relay revoke <device-id> [--plan-id <id>] --confirm');
  console.log('  ngf-agent-bridge relay identity rotate [--plan-id <id>] --confirm');
  console.log('  ngf-agent-bridge schedule list|status|history [--id <id>]');
  console.log('  ngf-agent-bridge schedule create --name <name> --prompt <text> --cwd <path> --provider <id> --cron <expr> [--timezone <iana>]');
  console.log('  ngf-agent-bridge schedule create --plan-id <id> --confirm');
  console.log('  ngf-agent-bridge schedule update|enable|disable|run-now|remove --id <id> [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge loop create --prompt <text> --verify-prompt <text> --criterion <text> --cwd <path> [--max-rounds <n>]');
  console.log('  ngf-agent-bridge loop start|pause|resume|stop|takeover|rounds|remove --id <id> [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge chat create|list|get|update|archive [--room-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge chat member add|update|remove --room-id <id> --member-id <id> [--agent-id <id>] [--role <role>]');
  console.log('  ngf-agent-bridge chat message post|list --room-id <id> [--body <text>] [--mention <member-id>]');
  console.log('  ngf-agent-bridge chat ack --room-id <id> --last-seq <seq>');
  console.log('  ngf-agent-bridge service list|status|health|logs [--service-id <id>]');
  console.log('  ngf-agent-bridge service open --service-id <id> [--owner-agent-id <id>] [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge service upsert --workspace-id <id> --command <binary> --port <port> [--arg <value>] [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge service start|stop|remove --service-id <id> [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge browser host list --workspace-id <id>');
  console.log('  ngf-agent-bridge browser permission get|set --workspace-id <id> [--domain <host>] [--plan-id <id>] [--confirm]');
  console.log('  ngf-agent-bridge browser instance list|create|close --workspace-id <id> [--instance-id <id>]');
  console.log('  ngf-agent-bridge browser page list|create|close|navigate|back|forward|reload|snapshot|screenshot|logs|wait --workspace-id <id> [--page-id <id>] [--url <https-url>]');
  console.log('  ngf-agent-bridge browser action <kind> --workspace-id <id> --page-id <id> [--ref <ref>] [--file <path>] [--plan-id <id>] [--confirm]');
  console.log('');
  console.log(t(language, 'options'));
  printOption('--setup', t(language, 'helpSetup'));
  printOption('--doctor', t(language, 'helpDoctor'));
  printOption('--daemon-url <http(s)://host:port>', 'Manage an explicit local-network or remote Bridge target.');
  printOption('--host <http(s)://host:port>', 'Alias for --daemon-url except in security hosts commands.');
  printOption('--start <ids>', t(language, 'helpStart'));
  printOption('--no-start-providers', t(language, 'helpNoStartProviders'));
  printOption('--connect-host <host>', t(language, 'helpConnectHost'));
  printOption('--bind-host <host>', t(language, 'helpBindHost'));
  printOption('--port <port>', t(language, 'helpPort'));
  printOption('--token <token>', t(language, 'helpToken'));
  printOption('--credential-env <name>', 'Read the current Bridge credential from this environment variable for management RPC.');
  printOption('--password-env <name>', 'Read an active bcrypt password from this environment variable without persisting it.');
  printOption('--lang <zh|en>', t(language, 'helpLang'));
  printOption('--terminal-qr', t(language, 'helpTerminalQr'));
  printOption('--no-open-qr', t(language, 'helpNoOpenQr'));
}

function printOption(name, description) {
  console.log('  ' + padRight(name, 26) + description);
}

function shutdownChildren(children) {
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index];
    if (!child || child.ngfTerminationRequested === true) {
      continue;
    }
    child.ngfTerminationRequested = true;
    if (process.platform === 'win32' && child.ngfTerminateProcessTree === true && child.pid) {
      try {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true
        });
        killer.on('error', () => {
          try {
            child.kill();
          } catch (_error) {
            // The provider process may already be gone.
          }
        });
        killer.unref();
        continue;
      } catch (_error) {
        // Fall through to the direct child signal.
      }
    }
    try {
      child.kill();
    } catch (_error) {
      // The child process may already be gone.
    }
  }
}

function waitForExit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    const code = child && typeof child.exitCode === 'number' ? child.exitCode : 0;
    return Promise.resolve(code);
  }
  return new Promise((resolve) => {
    let settled = false;
    function finish(code) {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(code === null ? 0 : code);
    }
    function onExit(code) {
      finish(code);
    }
    function onError() {
      finish(-1);
    }
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function runSetup(args) {
  const auth = bcryptStatus(createDaemonStore());
  if (auth.authReady !== true) {
    throw launcherAuthenticationError(
      auth.failureCategory || 'auth_config_invalid',
      auth.message || 'Bridge authentication configuration is invalid.',
      auth.remediation || 'Recover authentication locally before running setup.'
    );
  }
  if (auth.bcryptActive) {
    throw launcherAuthenticationError(
      'bcrypt_setup_unsupported',
      'The interactive setup wizard persists bearer connection QR files and is disabled while bcrypt authentication is active.',
      'Start Bridge with --password-env and enter the password manually in App, or explicitly request --terminal-qr for an ephemeral QR.'
    );
  }
  const wizardArgs = [];
  if (args.language.length > 0) {
    wizardArgs.push('--lang', args.language);
  }
  if (args.terminalQr) {
    wizardArgs.push('--terminal-qr');
  }
  const child = spawn(process.execPath, [path.join(__dirname, 'connect-wizard.js')].concat(wizardArgs), {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  const code = await waitForExit(child);
  if (code !== 0) {
    throw new Error(t(resolveLanguage(args.language, ''), 'setupExited', { code }));
  }
}

async function runDoctor(args) {
  const savedProfile = loadProfile();
  const language = resolveLanguage(args.language, readString(savedProfile, 'language', ''));
  printBanner(language);
  const scanResults = await withSpinner(language, t(language, 'scanProviders'), scanProviders(savedProfile || {}, { deep: true }));
  const options = buildOptions(args, savedProfile, scanResults, language);
  if (options.networkHostSelection && options.networkHostSelection.changed === true) {
    console.log('');
    console.log(yellow(t(language, 'networkHostRecovered', {
      previousHost: options.networkHostSelection.previousHost,
      nextHost: options.networkHostSelection.connectHost
    })));
  }
  const startPlan = [];
  if (options.startOpenCode) {
    startPlan.push('opencode');
  }
  if (options.startDevEco) {
    startPlan.push('deveco');
  }
  if (options.startMimoCode) {
    startPlan.push('mimo');
  }
  if (options.startOpenClawGateway) {
    startPlan.push('openclaw-gateway');
  }
  if (options.startHermesStudio) {
    startPlan.push('hermes-studio');
  }
  printProviderTable(language, scanResults, startPlan);
  console.log('');
  console.log(t(language, 'doctorProfile') + ': ' + profilePath());
  console.log(t(language, 'suggestedBridgeUrl') + ': ' + connectionEndpoint(options.connectHost, options.port));
}

function hasCliFlag(argv, name) {
  return argv.includes(name);
}

function cliOptionValue(argv, name, fallbackValue) {
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === name && index + 1 < argv.length) {
      return argv[index + 1];
    }
    const prefix = name + '=';
    if (value.startsWith(prefix)) {
      return value.substring(prefix.length);
    }
  }
  return fallbackValue;
}

function cliOptionValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === name && index + 1 < argv.length) {
      values.push(argv[index + 1]);
    }
    const prefix = name + '=';
    if (value.startsWith(prefix)) {
      values.push(value.substring(prefix.length));
    }
  }
  return values;
}

function cliPositionalValue(argv, index, fallbackValue) {
  if (index < 0 || index >= argv.length) {
    return fallbackValue;
  }
  const value = argv[index];
  return typeof value === 'string' && value.length > 0 && !value.startsWith('-') ? value : fallbackValue;
}

function printManagementResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function explicitRemoteCli(argv) {
  if (
    argv.length > 1 &&
    argv[0] === 'security' &&
    argv[1] === 'auth' &&
    hasCliFlag(argv, '--local')
  ) {
    return false;
  }
  const args = parseArgs(argv);
  return cliExplicitTarget(argv, args).value.length > 0;
}

function remoteFailureForCli(rpcPayload, action) {
  return Object.assign({
    ok: false,
    action,
    failureCategory: rpcPayload && typeof rpcPayload.code === 'string' ? rpcPayload.code : 'rpc_unavailable',
    remediation: rpcPayload && typeof rpcPayload.remediation === 'string' && rpcPayload.remediation.length > 0
      ? rpcPayload.remediation
      : 'Check the explicit Bridge target, token, firewall, TLS trust, and daemon health.'
  }, rpcPayload || {});
}

function liveOrLocalCliResult(argv, rpcPayload, action, localFactory) {
  if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
    return rpcPayload;
  }
  if (explicitRemoteCli(argv)) {
    return remoteFailureForCli(rpcPayload, action);
  }
  return localFactory();
}

function liveRpcHostFromArgs(args, savedProfile) {
  const explicitHost = args.connectHost.length > 0 ? args.connectHost : args.bindHost;
  if (explicitHost.length > 0) {
    if (explicitHost === '0.0.0.0' || explicitHost === '::') {
      return '127.0.0.1';
    }
    return explicitHost;
  }
  const profileHost = readString(savedProfile, 'bindHost', '127.0.0.1');
  if (profileHost === '0.0.0.0' || profileHost === '::') {
    return '127.0.0.1';
  }
  return profileHost;
}

function cliEnvironmentHost() {
  if (typeof process.env.AGENT_BRIDGE_CLI_HOST === 'string' && process.env.AGENT_BRIDGE_CLI_HOST.trim().length > 0) {
    return process.env.AGENT_BRIDGE_CLI_HOST.trim();
  }
  return '';
}

function cliExplicitTarget(argv, args) {
  const fromDaemonUrl = cliOptionValue(argv, '--daemon-url', args.daemonUrl || '').trim();
  if (fromDaemonUrl.length > 0) {
    return { value: fromDaemonUrl, source: 'option' };
  }
  const securityHostsCommand = argv.length > 1 && argv[0] === 'security' && argv[1] === 'hosts';
  const fromOption = securityHostsCommand ? '' : cliOptionValue(argv, '--host', args.host || '').trim();
  if (fromOption.length > 0) {
    return { value: fromOption, source: 'option' };
  }
  const fromEnvironment = cliEnvironmentHost();
  if (fromEnvironment.length > 0) {
    return { value: fromEnvironment, source: 'environment' };
  }
  return { value: '', source: '' };
}

function normalizeCliBridgeTarget(value, fallbackPort) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.length === 0) {
    return null;
  }
  if (raw.indexOf('#offer=') >= 0 || raw.startsWith('unix:') || raw.startsWith('pipe:') || raw.startsWith('\\\\.\\pipe\\')) {
    return {
      ok: false,
      code: 'remote_target_unsupported',
      message: 'This Bridge CLI build supports HTTP(S) daemon targets only. Relay offers, Unix sockets, and Windows pipes are not implemented.',
      remediation: 'Use an http:// or https:// Bridge URL. Relay offer URLs belong to the Relay/E2E feature.'
    };
  }
  let parsed;
  try {
    parsed = new URL(raw.indexOf('://') >= 0 ? raw : 'http://' + raw);
  } catch (error) {
    return {
      ok: false,
      code: 'remote_target_invalid',
      message: error instanceof Error ? error.message : String(error),
      remediation: 'Use --host http://hostname:port or --host https://hostname:port.'
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: 'remote_target_protocol_unsupported',
      message: 'Bridge CLI target protocol must be http or https.',
      remediation: 'Use an HTTP(S) Bridge endpoint.'
    };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return {
      ok: false,
      code: 'remote_target_credentials_rejected',
      message: 'Credentials must not be embedded in the Bridge target URL.',
      remediation: 'Pass the Bridge bearer token through --token or AGENT_BRIDGE_TOKEN.'
    };
  }
  if (parsed.pathname !== '/' && parsed.pathname.length > 0) {
    return {
      ok: false,
      code: 'remote_target_path_unsupported',
      message: 'Bridge target URL must not contain an application path.',
      remediation: 'Use the Bridge origin, for example https://host:8787.'
    };
  }
  const defaultPort = parsed.protocol === 'https:' ? 443 : (fallbackPort > 0 ? fallbackPort : 8787);
  const port = parsePort(parsed.port, defaultPort);
  const hostname = parsed.hostname;
  if (hostname.length === 0) {
    return {
      ok: false,
      code: 'remote_target_host_missing',
      message: 'Bridge target hostname is missing.',
      remediation: 'Use --host http://hostname:port.'
    };
  }
  const displayHost = hostname.indexOf(':') >= 0 ? '[' + hostname + ']' : hostname;
  const defaultProtocolPort = parsed.protocol === 'https:' ? 443 : 80;
  return {
    ok: true,
    protocol: parsed.protocol,
    hostname,
    port,
    target: parsed.protocol + '//' + displayHost + (port === defaultProtocolPort ? '' : ':' + String(port))
  };
}

function liveRpcConfig(argv) {
  const args = parseArgs(argv);
  const savedProfile = loadProfile() || {};
  const credentialEnvName = cliOptionValue(argv, '--credential-env', '');
  if (credentialEnvName.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(credentialEnvName)) {
    return {
      ok: false,
      code: 'credential_env_name_invalid',
      message: 'Credential environment variable name is invalid.',
      remediation: 'Use an environment variable name containing letters, digits, and underscores.'
    };
  }
  const explicitCredential = credentialEnvName.length > 0 && typeof process.env[credentialEnvName] === 'string'
    ? process.env[credentialEnvName]
    : '';
  if (credentialEnvName.length > 0 && explicitCredential.length === 0) {
    return {
      ok: false,
      code: 'credential_env_empty',
      message: 'Bridge credential environment variable ' + credentialEnvName + ' is empty or missing.',
      remediation: 'Set the named environment variable locally, then retry.'
    };
  }
  const environmentToken = typeof process.env.AGENT_BRIDGE_TOKEN === 'string' ? process.env.AGENT_BRIDGE_TOKEN : '';
  const token = explicitCredential.length > 0
    ? explicitCredential
    : (args.token.length > 0 ? args.token : (environmentToken.length > 0 ? environmentToken : readString(savedProfile, 'token', '')));
  const explicitTarget = cliExplicitTarget(argv, args);
  const savedPort = parsePort(readString(savedProfile, 'port', ''), savedProfile && savedProfile.port ? savedProfile.port : 8787);
  if (explicitTarget.value.length > 0) {
    const normalized = normalizeCliBridgeTarget(explicitTarget.value, args.port > 0 ? args.port : savedPort);
    if (!normalized || normalized.ok !== true) {
      return Object.assign({
        remoteExplicit: true,
        targetSource: explicitTarget.source,
        token
      }, normalized || {
        ok: false,
        code: 'remote_target_invalid',
        message: 'Bridge target is invalid.'
      });
    }
    return {
      ok: true,
      protocol: normalized.protocol,
      host: normalized.hostname,
      port: args.port > 0 ? args.port : normalized.port,
      token,
      target: normalized.target,
      remoteExplicit: true,
      targetSource: explicitTarget.source
    };
  }
  const host = liveRpcHostFromArgs(args, savedProfile);
  const port = args.port > 0 ? args.port : savedPort;
  return {
    ok: true,
    protocol: 'http:',
    host,
    port,
    token,
    target: 'http://' + host + ':' + String(port),
    remoteExplicit: false,
    targetSource: 'profile'
  };
}

function liveRpcRequest(argv, type, payload) {
  const rpcConfig = liveRpcConfig(argv);
  if (rpcConfig.ok !== true) {
    return Promise.resolve({
      rpcUnavailable: false,
      rpcError: true,
      remoteExplicit: true,
      code: rpcConfig.code || 'remote_target_invalid',
      message: rpcConfig.message || 'Bridge target is invalid.',
      remediation: rpcConfig.remediation || '',
      target: ''
    });
  }
  if (rpcConfig.token.length === 0) {
    return Promise.resolve({
      rpcUnavailable: rpcConfig.remoteExplicit !== true,
      rpcError: rpcConfig.remoteExplicit === true,
      remoteExplicit: rpcConfig.remoteExplicit === true,
      code: 'rpc_token_missing',
      message: 'Bridge credential is not configured.',
      remediation: 'Pass --token for bearer mode, or --credential-env <ENV_NAME> for a bcrypt password.',
      target: rpcConfig.target
    });
  }
  const body = JSON.stringify({
    id: 'cli_' + crypto.randomBytes(8).toString('hex'),
    type,
    payload: payload || {}
  });
  const options = {
    host: rpcConfig.host,
    port: rpcConfig.port,
    path: '/rpc',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      authorization: 'Bearer ' + rpcConfig.token
    },
    timeout: 10 * 60 * 1000
  };
  return new Promise((resolve) => {
    const client = rpcConfig.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object') {
            resolve({
              rpcUnavailable: true,
              code: 'rpc_invalid_response',
              message: 'Bridge RPC returned an invalid response.'
            });
            return;
          }
          if (parsed && parsed.ok === false && parsed.error && typeof parsed.error === 'object' && !parsed.response) {
            resolve({
              rpcUnavailable: false,
              rpcError: true,
              remoteExplicit: rpcConfig.remoteExplicit === true,
              code: typeof parsed.error.code === 'string' ? parsed.error.code : 'rpc_request_failed',
              message: typeof parsed.error.message === 'string' ? parsed.error.message : 'Bridge RPC request failed.',
              httpStatus: res.statusCode || 0,
              target: rpcConfig.target
            });
            return;
          }
          parsed.remoteExplicit = rpcConfig.remoteExplicit === true;
          parsed.target = rpcConfig.target;
          parsed.httpStatus = res.statusCode || 0;
          resolve(parsed);
        } catch (error) {
          resolve({
            rpcUnavailable: rpcConfig.remoteExplicit !== true,
            rpcError: rpcConfig.remoteExplicit === true,
            remoteExplicit: rpcConfig.remoteExplicit === true,
            code: 'rpc_invalid_json',
            message: error instanceof Error ? error.message : String(error),
            target: rpcConfig.target
          });
        }
      });
    });
    req.on('error', (error) => {
      resolve({
        rpcUnavailable: rpcConfig.remoteExplicit !== true,
        rpcError: rpcConfig.remoteExplicit === true,
        remoteExplicit: rpcConfig.remoteExplicit === true,
        code: 'rpc_unavailable',
        message: error instanceof Error ? error.message : String(error),
        remediation: rpcConfig.remoteExplicit === true ? 'Check the remote Bridge URL, firewall, TLS trust, and daemon health.' : '',
        target: rpcConfig.target
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        rpcUnavailable: rpcConfig.remoteExplicit !== true,
        rpcError: rpcConfig.remoteExplicit === true,
        remoteExplicit: rpcConfig.remoteExplicit === true,
        code: 'rpc_timeout',
        message: 'Bridge RPC timed out.',
        target: rpcConfig.target
      });
    });
    req.write(body);
    req.end();
  });
}

function liveRpcPayloadOrUnavailable(rpcResult) {
  if (!rpcResult || rpcResult.rpcUnavailable === true) {
    return rpcResult;
  }
  if (rpcResult.rpcError === true) {
    return {
      ok: false,
      code: typeof rpcResult.code === 'string' ? rpcResult.code : 'rpc_request_failed',
      failureCategory: typeof rpcResult.code === 'string' ? rpcResult.code : 'rpc_request_failed',
      message: typeof rpcResult.message === 'string' ? rpcResult.message : 'Bridge RPC request failed.',
      remediation: typeof rpcResult.remediation === 'string' ? rpcResult.remediation : '',
      remote: rpcResult.remoteExplicit === true,
      target: typeof rpcResult.target === 'string' ? rpcResult.target : '',
      httpStatus: typeof rpcResult.httpStatus === 'number' ? rpcResult.httpStatus : 0
    };
  }
  const response = rpcResult.response && typeof rpcResult.response === 'object' ? rpcResult.response : null;
  if (!response) {
    return {
      code: 'rpc_missing_response',
      message: 'Bridge RPC did not include a response.'
    };
  }
  if (response.ok === true) {
    return response.payload || {};
  }
  const error = response.error && typeof response.error === 'object' ? response.error : {};
  return {
    code: typeof error.code === 'string' ? error.code : 'rpc_request_failed',
    failureCategory: typeof error.code === 'string' ? error.code : 'rpc_request_failed',
    message: typeof error.message === 'string' ? error.message : 'Bridge RPC request failed.',
    remote: rpcResult.remoteExplicit === true,
    target: typeof rpcResult.target === 'string' ? rpcResult.target : '',
    httpStatus: typeof rpcResult.httpStatus === 'number' ? rpcResult.httpStatus : 0
  };
}

function readDaemonLogTailForCli(store, maxBytes) {
  const logPath = store.paths.daemonLog;
  const tail = readFileTailForCli(logPath, maxBytes, 'daemon_log');
  if (tail.ok === false) {
    return {
      logPath,
      path: logPath,
      text: '',
      truncated: false,
      sizeBytes: tail.sizeBytes || 0,
      warnings: [
        {
          code: tail.code,
          message: tail.code === 'daemon_log_missing' ? 'Daemon log file does not exist yet.' : tail.message
        }
      ],
      updatedAt: tail.updatedAt
    };
  }
  return Object.assign(tail, {
    logPath,
    warnings: []
  });
}

function readFileTailForCli(filePath, maxBytes, codePrefix) {
  const limit = maxBytes > 0 ? Math.min(maxBytes, 1024 * 1024) : 64 * 1024;
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      code: codePrefix + '_missing',
      path: filePath,
      text: '',
      truncated: false,
      sizeBytes: 0,
      message: 'File does not exist yet.',
      updatedAt: Date.now()
    };
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return {
        ok: false,
        code: codePrefix + '_not_file',
        path: filePath,
        text: '',
        truncated: false,
        sizeBytes: stat.size,
        message: 'Path is not a file.',
        updatedAt: Date.now()
      };
    }
    const start = stat.size > limit ? stat.size - limit : 0;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return {
        ok: true,
        path: filePath,
        text: buffer.toString('utf8'),
        truncated: start > 0,
        sizeBytes: stat.size,
        updatedAt: Date.now()
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return {
      ok: false,
      code: codePrefix + '_read_failed',
      path: filePath,
      text: '',
      truncated: false,
      sizeBytes: 0,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now()
    };
  }
}

function readTerminalCaptureTailForCli(store, argv) {
  const terminalId = cliOptionValue(argv, '--terminal-id', cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''));
  if (terminalId.length === 0) {
    return {
      ok: false,
      code: 'terminal_id_required',
      action: 'terminal.logs',
      terminalId,
      message: 'terminal logs requires a terminal id.'
    };
  }
  const maxBytes = Number.parseInt(cliOptionValue(argv, '--max-bytes', '65536'), 10);
  const capturePath = store.terminalCaptureFilePath(terminalId);
  const tail = readFileTailForCli(capturePath, maxBytes, 'terminal_capture');
  return Object.assign({
    action: 'terminal.logs',
    terminalId,
    capturePath,
    source: 'persisted'
  }, tail, {
    capturePersisted: tail.ok === true,
    warning: tail.ok === true ? '' : tail.message,
    remediation: tail.ok === true ? '' : 'Ensure the terminal has capture persistence enabled and has produced output.'
  });
}

function buildLocalDaemonHealthForCli(store, action, status, message) {
  const records = store.listManagedProcessRecords();
  const supervisorState = store.readDaemonSupervisorState();
  let daemonRecord = null;
  for (const record of records) {
    if (record && record.kind === 'daemon-supervisor') {
      daemonRecord = record;
      break;
    }
  }
  if (!daemonRecord) {
    for (const record of records) {
      if (record && record.kind === 'daemon') {
        daemonRecord = record;
        break;
      }
    }
  }
  const stateOwnerPid = supervisorState && typeof supervisorState.supervisorPid === 'number'
    ? supervisorState.supervisorPid
    : 0;
  const recordPid = daemonRecord && typeof daemonRecord.pid === 'number' ? daemonRecord.pid : 0;
  const pid = stateOwnerPid > 0 ? stateOwnerPid : recordPid;
  const alive = processIsAlive(pid);
  const persistedStatus = supervisorState && typeof supervisorState.status === 'string'
    ? supervisorState.status
    : '';
  const resolvedStatus = typeof status === 'string' && status.length > 0
    ? status
    : (alive ? (persistedStatus.length > 0 ? persistedStatus : 'running') : (persistedStatus === 'crash_loop' ? 'crash_loop' : 'stopped'));
  const workerPid = supervisorState && typeof supervisorState.workerPid === 'number' ? supervisorState.workerPid : 0;
  const workerAlive = processIsAlive(workerPid);
  const crashLoop = supervisorState ? supervisorState.crashLoop === true : false;
  return {
    ok: resolvedStatus !== 'crashed' && resolvedStatus !== 'crash_loop' && resolvedStatus !== 'failed',
    action,
    status: resolvedStatus,
    health: supervisorState && typeof supervisorState.health === 'string'
      ? supervisorState.health
      : (alive ? 'running' : resolvedStatus),
    pid,
    supervisorPid: stateOwnerPid,
    workerPid,
    supervised: supervisorState ? supervisorState.supervised === true : false,
    workerGeneration: supervisorState && typeof supervisorState.workerGeneration === 'number' ? supervisorState.workerGeneration : 0,
    workerReady: supervisorState ? supervisorState.workerReady === true && workerAlive : false,
    startedAt: supervisorState && typeof supervisorState.startedAt === 'string'
      ? supervisorState.startedAt
      : (daemonRecord && typeof daemonRecord.createdAt === 'string' ? daemonRecord.createdAt : ''),
    workerStartedAt: supervisorState && typeof supervisorState.workerStartedAt === 'string' ? supervisorState.workerStartedAt : '',
    workerReadyAt: supervisorState && typeof supervisorState.workerReadyAt === 'string' ? supervisorState.workerReadyAt : '',
    lastHeartbeatAt: supervisorState && typeof supervisorState.lastHeartbeatAt === 'string' ? supervisorState.lastHeartbeatAt : '',
    lastWorkerHeartbeatAt: supervisorState && typeof supervisorState.lastWorkerHeartbeatAt === 'string' ? supervisorState.lastWorkerHeartbeatAt : '',
    exitCode: supervisorState && typeof supervisorState.lastExitCode === 'number' ? supervisorState.lastExitCode : (alive ? 0 : -1),
    lastError: supervisorState && typeof supervisorState.lastError === 'string' ? supervisorState.lastError : '',
    restartCount: supervisorState && typeof supervisorState.restartCount === 'number' ? supervisorState.restartCount : 0,
    consecutiveCrashes: supervisorState && typeof supervisorState.consecutiveCrashes === 'number' ? supervisorState.consecutiveCrashes : 0,
    crashWindowCount: supervisorState && typeof supervisorState.crashWindowCount === 'number' ? supervisorState.crashWindowCount : 0,
    crashLoop,
    nextRestartAt: supervisorState && typeof supervisorState.nextRestartAt === 'string' ? supervisorState.nextRestartAt : '',
    lastRestartReason: supervisorState && typeof supervisorState.lastRestartReason === 'string' ? supervisorState.lastRestartReason : '',
    supervisorStatePath: store.paths.daemonSupervisorState,
    supervisorLockPath: store.paths.daemonSupervisorLock,
    logPath: store.paths.daemonLog,
    configPath: store.paths.config,
    managedProcesses: records,
    warnings: alive && !crashLoop ? [] : [
      {
        code: crashLoop ? 'supervisor_crash_loop' : 'daemon_not_running',
        message: crashLoop
          ? 'Bridge daemon supervisor stopped after repeated worker crashes.'
          : 'No running Bridge daemon supervisor was found from local runtime state.'
      }
    ],
    failureCategory: crashLoop ? 'supervisor_crash_loop' : (alive ? '' : 'stopped'),
    remediation: crashLoop
      ? 'Inspect daemon logs and fix the worker failure before starting the daemon again.'
      : (alive ? '' : 'Run daemon start to launch a supervised local Bridge daemon.'),
    message: typeof message === 'string' ? message : ''
  };
}

async function buildOptionsForDaemonCli(argv) {
  const args = parseArgs(argv);
  const savedProfile = loadProfile() || {};
  const language = resolveLanguage(args.language, readString(savedProfile, 'language', ''));
  const scanResults = await scanProviders(savedProfile, { deep: false });
  return buildOptions(args, savedProfile, scanResults, language);
}

async function startDaemonForCli(store, argv) {
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_HEALTH, {}));
  if (rpcPayload && rpcPayload.rpcUnavailable !== true && (!rpcPayload.code || rpcPayload.code.length === 0)) {
    return Object.assign({}, rpcPayload, {
      action: 'daemon.start',
      alreadyRunning: true,
      message: 'Bridge daemon is already running.'
    });
  }
  if (rpcPayload && rpcPayload.rpcUnavailable !== true) {
    return Object.assign({}, rpcPayload, {
      action: 'daemon.start',
      alreadyRunning: false
    });
  }
  const options = await buildOptionsForDaemonCli(argv);
  const auth = bcryptStatus(store);
  if (auth.authReady !== true) {
    return Object.assign({}, auth, {
      code: auth.failureCategory || 'auth_config_invalid',
      action: 'daemon.start'
    });
  }
  const supervisorPath = path.join(__dirname, 'supervisor-entrypoint.js');
  const child = spawn(process.execPath, [supervisorPath], {
    cwd: options.repoRoot,
    env: bridgeEnvironment(options),
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  const ok = await waitHttpOk(healthUrlForBridge(options), 8000);
  const runtimeState = store.readDaemonSupervisorState();
  return Object.assign(buildLocalDaemonHealthForCli(store, 'daemon.start', ok ? 'running' : 'stale', ok ? 'Bridge daemon started.' : 'Bridge daemon process was launched but health check did not become ready.'), {
    pid: runtimeState && typeof runtimeState.supervisorPid === 'number' ? runtimeState.supervisorPid : (child.pid || 0),
    supervisorPid: runtimeState && typeof runtimeState.supervisorPid === 'number' ? runtimeState.supervisorPid : (child.pid || 0),
    workerPid: runtimeState && typeof runtimeState.workerPid === 'number' ? runtimeState.workerPid : 0,
    supervised: true,
    supervisorEntry: supervisorPath,
    healthUrl: healthUrlForBridge(options)
  });
}

function cliSafeSegment(value) {
  const source = typeof value === 'string' && value.length > 0 ? value : 'provider';
  const normalized = source.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized.substring(0, 120) : 'provider';
}

function readCliObject(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function readCliArray(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function normalizeCliProviderProfile(source, sourcePath) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const rawId = readString(source, 'profileId', readString(source, 'id', readString(source, 'name', '')));
  const profileId = readString(source, 'profileId', rawId.length > 0 ? 'acp_' + cliSafeSegment(rawId) : 'acp_' + crypto.randomBytes(8).toString('base64url'));
  const providerId = readString(source, 'providerId', rawId.length > 0 ? rawId : profileId);
  const endpoint = readString(source, 'endpoint', readString(source, 'baseUrl', readString(source, 'url', '')));
  const binary = readString(source, 'binary', readString(source, 'command', ''));
  const runtimeMode = readString(source, 'runtimeMode', 'oneshot');
  const argsValue = source.args;
  const args = typeof argsValue === 'string' ? argsValue : (Array.isArray(argsValue) ? argsValue.filter((item) => typeof item === 'string').join(' ') : '');
  const validationMessages = [];
  if (endpoint.length === 0 && binary.length === 0) {
    validationMessages.push('missing_endpoint_or_binary');
  }
  if (runtimeMode.length > 0 && runtimeMode !== 'oneshot' && runtimeMode !== 'stdio') {
    validationMessages.push('invalid_runtime_mode');
  }
  if (Object.keys(source).includes('env')) {
    const envValue = source.env;
    if (!envValue || typeof envValue !== 'object' || Array.isArray(envValue)) {
      validationMessages.push('invalid_env');
    }
  }
  return {
    profileId,
    providerId,
    displayName: readString(source, 'displayName', readString(source, 'name', providerId)),
    description: readString(source, 'description', ''),
    endpoint,
    binary,
    args,
    cwd: readString(source, 'cwd', ''),
    runtimeMode: runtimeMode === 'stdio' ? 'stdio' : 'oneshot',
    env: readCliObject(source, 'env'),
    models: readCliArray(source, 'models'),
    speedModes: readCliArray(source, 'speedModes'),
    reasoningModes: readCliArray(source, 'reasoningModes'),
    interactionModes: readCliArray(source, 'interactionModes'),
    tools: readCliArray(source, 'tools'),
    enabled: readBoolean(source, 'enabled', true),
    validationMessages,
    kind: readString(source, 'kind', 'acp'),
    sourcePath,
    acp: {
      protocol: readString(source, 'protocol', 'acp'),
      catalogPath: sourcePath,
      extends: readString(source, 'extends', 'acp')
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function providerProfilesFromCliCatalog(catalog, sourcePath) {
  const profiles = [];
  if (Array.isArray(catalog)) {
    for (const item of catalog) {
      const profile = normalizeCliProviderProfile(item, sourcePath);
      if (profile) {
        profiles.push(profile);
      }
    }
    return profiles;
  }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return profiles;
  }
  const catalogProviders = Array.isArray(catalog.providers) ? catalog.providers : [];
  if (catalogProviders.length > 0) {
    for (const item of catalogProviders) {
      const profile = normalizeCliProviderProfile(item, sourcePath);
      if (profile) {
        profiles.push(profile);
      }
    }
    return profiles;
  }
  const single = normalizeCliProviderProfile(catalog.provider || catalog, sourcePath);
  if (single) {
    profiles.push(single);
  }
  return profiles;
}

function cliCatalogCandidateFiles(catalogPath) {
  const candidates = [];
  if (typeof catalogPath === 'string' && catalogPath.length > 0) {
    const resolved = path.resolve(catalogPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const names = ['acp-providers.json', 'agent-bridge-acp.json', 'providers.acp.json', 'provider.json'];
      for (const name of names) {
        candidates.push(path.join(resolved, name));
      }
      candidates.push(path.join(resolved, '.acp', 'providers.json'));
    } else {
      candidates.push(resolved);
    }
  }
  return candidates;
}

function providerProfileValidationEntryForCli(profile, reason) {
  return {
    profileId: readString(profile, 'profileId', ''),
    providerId: readString(profile, 'providerId', ''),
    displayName: readString(profile, 'displayName', ''),
    sourcePath: readString(profile, 'sourcePath', ''),
    reason
  };
}

function readStringArrayForCli(source, key) {
  const values = readCliArray(source, key);
  return values.filter((item) => typeof item === 'string' && item.length > 0);
}

function buildCliAcpValidationReport(store, providers, scanned, rejected, scanWarnings) {
  const existingIds = new Set();
  for (const profile of store.readProviderProfiles()) {
    if (profile && typeof profile.profileId === 'string' && profile.profileId.length > 0) {
      existingIds.add(profile.profileId);
    }
  }
  const seenIds = new Set();
  const accepted = [];
  const duplicates = [];
  const warnings = Array.isArray(scanWarnings) ? scanWarnings.slice() : [];
  const errors = [];
  for (const profile of providers) {
    const profileId = readString(profile, 'profileId', '');
    const validationMessages = readStringArrayForCli(profile, 'validationMessages');
    if (validationMessages.length > 0) {
      for (const reason of validationMessages) {
        rejected.push(providerProfileValidationEntryForCli(profile, reason));
        errors.push(profileId + ': ' + reason);
      }
      continue;
    }
    if (seenIds.has(profileId) || existingIds.has(profileId)) {
      const duplicate = providerProfileValidationEntryForCli(profile, seenIds.has(profileId) ? 'duplicate_in_catalog' : 'duplicate_existing_profile');
      duplicates.push(duplicate);
      warnings.push(duplicate);
    }
    seenIds.add(profileId);
    accepted.push(providerProfileValidationEntryForCli(profile, 'accepted'));
  }
  return {
    ok: rejected.length === 0,
    scanned,
    accepted,
    rejected,
    duplicates,
    invalid: rejected,
    warnings,
    errors,
    providerCount: providers.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    duplicateCount: duplicates.length,
    warningCount: warnings.length,
    errorCount: errors.length
  };
}

function discoverProviderProfilesFromCliCatalog(store, catalogPath) {
  const providers = [];
  const allProviders = [];
  const scanned = [];
  const rejected = [];
  const warnings = [];
  for (const filePath of cliCatalogCandidateFiles(catalogPath)) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue;
    }
    scanned.push(filePath);
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      rejected.push({
        sourcePath: filePath,
        reason: 'invalid_json'
      });
      continue;
    }
    const catalogProfiles = providerProfilesFromCliCatalog(parsed, filePath);
    if (catalogProfiles.length === 0) {
      warnings.push({
        sourcePath: filePath,
        reason: 'no_providers'
      });
    }
    for (const profile of catalogProfiles) {
      allProviders.push(profile);
    }
  }
  const validationReport = buildCliAcpValidationReport(store, allProviders, scanned, rejected, warnings);
  const rejectedIds = new Set();
  for (const item of validationReport.rejected) {
    const profileId = readString(item, 'profileId', '');
    if (profileId.length > 0) {
      rejectedIds.add(profileId);
    }
  }
  for (const profile of allProviders) {
    if (!rejectedIds.has(readString(profile, 'profileId', ''))) {
      providers.push(profile);
    }
  }
  return {
    providers,
    allProviders,
    scanned,
    validationReport,
    updatedAt: Date.now()
  };
}

function importProviderProfilesFromCliCatalog(store, catalogPath, argv) {
  const discovered = discoverProviderProfilesFromCliCatalog(store, catalogPath);
  const confirm = hasCliFlag(argv, '--confirm');
  const duplicatePolicy = hasCliFlag(argv, '--replace') || cliOptionValue(argv, '--duplicate-policy', '') === 'replace' ? 'replace' : 'skip';
  const selectedIds = cliOptionValues(argv, '--profile-id').concat(cliOptionValues(argv, '--provider-id'));
  const imported = [];
  const preview = [];
  const skipped = [];
  const duplicates = [];
  let profiles = store.readProviderProfiles();
  const existingIds = new Set();
  const importedCatalogIds = new Set();
  for (const profile of profiles) {
    if (profile && typeof profile.profileId === 'string' && profile.profileId.length > 0) {
      existingIds.add(profile.profileId);
    }
  }
  for (const profile of discovered.providers) {
    if (selectedIds.length > 0 && !selectedIds.includes(profile.profileId) && !selectedIds.includes(profile.providerId)) {
      continue;
    }
    const duplicate = existingIds.has(profile.profileId) || importedCatalogIds.has(profile.profileId);
    if (duplicate) {
      duplicates.push(providerProfileValidationEntryForCli(profile, existingIds.has(profile.profileId) ? 'duplicate_existing_profile' : 'duplicate_in_catalog'));
      if (duplicatePolicy !== 'replace') {
        skipped.push(providerProfileValidationEntryForCli(profile, 'duplicate_skipped'));
        continue;
      }
    }
    if (!confirm) {
      preview.push(decorateProviderProfileForCli(profile));
      importedCatalogIds.add(profile.profileId);
      continue;
    }
    let replaced = false;
    const nextProfiles = [];
    for (const existing of profiles) {
      if (existing && existing.profileId === profile.profileId) {
        const merged = Object.assign({}, existing, profile, {
          createdAt: readString(existing, 'createdAt', profile.createdAt),
          updatedAt: new Date().toISOString()
        });
        nextProfiles.push(merged);
        imported.push(merged);
        replaced = true;
      } else {
        nextProfiles.push(existing);
      }
    }
    if (!replaced) {
      nextProfiles.push(profile);
      imported.push(profile);
    }
    importedCatalogIds.add(profile.profileId);
    profiles = nextProfiles;
  }
  if (confirm) {
    store.writeProviderProfiles(profiles);
  }
  const decoratedProfiles = profiles.map(decorateProviderProfileForCli);
  const decoratedImported = imported.map(decorateProviderProfileForCli);
  return {
    confirmed: confirm,
    confirmRequired: !confirm,
    duplicatePolicy,
    imported: decoratedImported,
    preview,
    skipped,
    duplicates,
    profiles: decoratedProfiles,
    scanned: discovered.scanned,
    validationReport: discovered.validationReport,
    catalogRefreshReason: 'provider_acp_import',
    affectedProfileIds: decoratedImported.map((profile) => profile.profileId),
    affectedRuntimeProviderIds: decoratedImported.map((profile) => profile.runtimeProviderId).filter((item) => item.length > 0),
    updatedAt: Date.now()
  };
}

function saveDaemonDoctorReportForCli(store, report) {
  const diagnosticsDirectory = path.join(store.baseDirectory, 'diagnostics');
  fs.mkdirSync(diagnosticsDirectory, { recursive: true });
  const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(diagnosticsDirectory, 'daemon-doctor-' + safeStamp + '.json');
  const savedReport = Object.assign({}, report, {
    reportPath
  });
  fs.writeFileSync(reportPath, JSON.stringify(savedReport, null, 2), 'utf8');
  return savedReport;
}

function trustDeviceForCli(store, argv) {
  const physicalDeviceId = cliOptionValue(argv, '--device-id', cliOptionValue(argv, '--physical-device-id', ''));
  const publicKeyFingerprint = cliOptionValue(argv, '--fingerprint', cliOptionValue(argv, '--key-fingerprint', ''));
  const displayName = cliOptionValue(argv, '--name', 'Trusted device');
  if (physicalDeviceId.length === 0 && publicKeyFingerprint.length === 0) {
    return {
      code: 'security_device_invalid',
      message: 'Use --device-id or --fingerprint.'
    };
  }
  const now = new Date().toISOString();
  const devices = store.readTrustedDevices();
  let saved = null;
  for (const device of devices) {
    if (!device) {
      continue;
    }
    const samePhysical = physicalDeviceId.length > 0 && device.physicalDeviceId === physicalDeviceId;
    const sameFingerprint = publicKeyFingerprint.length > 0 && device.publicKeyFingerprint === publicKeyFingerprint;
    if (samePhysical || sameFingerprint) {
      device.displayName = displayName;
      device.publicKeyFingerprint = publicKeyFingerprint.length > 0 ? publicKeyFingerprint : readString(device, 'publicKeyFingerprint', '');
      device.trusted = true;
      device.revokedAt = '';
      device.updatedAt = now;
      saved = device;
      break;
    }
  }
  if (!saved) {
    saved = {
      physicalDeviceId,
      bridgeInstanceId: '',
      displayName,
      platform: '',
      publicKeyFingerprint,
      trusted: true,
      trustedAt: now,
      revokedAt: '',
      updatedAt: now
    };
    devices.push(saved);
  }
  store.writeTrustedDevices(devices);
  return {
    device: saved,
    devices
  };
}

function revokeDeviceForCli(store, argv) {
  const physicalDeviceId = cliOptionValue(argv, '--device-id', cliOptionValue(argv, '--physical-device-id', ''));
  const publicKeyFingerprint = cliOptionValue(argv, '--fingerprint', cliOptionValue(argv, '--key-fingerprint', ''));
  if (physicalDeviceId.length === 0 && publicKeyFingerprint.length === 0) {
    return {
      code: 'security_device_invalid',
      message: 'Use --device-id or --fingerprint.'
    };
  }
  const now = new Date().toISOString();
  const devices = store.readTrustedDevices();
  let revoked = null;
  for (const device of devices) {
    if (!device) {
      continue;
    }
    const samePhysical = physicalDeviceId.length > 0 && device.physicalDeviceId === physicalDeviceId;
    const sameFingerprint = publicKeyFingerprint.length > 0 && device.publicKeyFingerprint === publicKeyFingerprint;
    if (samePhysical || sameFingerprint) {
      device.trusted = false;
      device.revokedAt = now;
      device.updatedAt = now;
      revoked = device;
      break;
    }
  }
  store.writeTrustedDevices(devices);
  return {
    revoked: revoked !== null,
    device: revoked,
    devices
  };
}

function cliBooleanOption(argv, name, fallbackValue) {
  const raw = cliOptionValue(argv, name, '');
  if (raw.length === 0) {
    return fallbackValue;
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'on' || normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'off' || normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallbackValue;
}

function securityDoctorForCli(store, securityAudit) {
  const providerSecretStore = new ProviderSecretStore({
    homeDirectory: store.baseDirectory
  });
  return buildDaemonDoctorReport(store, {
    securityAuditSummary: securityAudit.summary(),
    providerSecretStorage: providerSecretStore.status()
  });
}

function recordCliSecurityAudit(securityAudit, event) {
  if (securityAudit && typeof securityAudit.record === 'function') {
    securityAudit.record(event);
  }
}

function securityTokenConfigForCli() {
  const profile = loadProfile() || {};
  const envToken = process.env.AGENT_BRIDGE_TOKEN || '';
  const profileToken = readString(profile, 'token', '');
  return {
    profile,
    token: envToken.length > 0 ? envToken : profileToken,
    tokenGenerated: false
  };
}

function securityTlsSetPayloadForCli(store, argv) {
  const current = tlsStatus(store);
  return {
    enabled: hasCliFlag(argv, '--enable') ? true : hasCliFlag(argv, '--disable') ? false : cliBooleanOption(argv, '--enabled', current.enabled),
    certPath: cliOptionValue(argv, '--cert', cliOptionValue(argv, '--cert-path', current.certPath)),
    keyPath: cliOptionValue(argv, '--key', cliOptionValue(argv, '--key-path', current.keyPath)),
    caPath: cliOptionValue(argv, '--ca', cliOptionValue(argv, '--ca-path', ''))
  };
}

async function securityAuthSetPayloadForCli(store, argv) {
  const current = bcryptStatus(store);
  const mode = cliOptionValue(argv, '--mode', current.mode);
  const passwordEnv = cliOptionValue(argv, '--password-env', '');
  if (passwordEnv.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(passwordEnv)) {
    const error = new Error('Password environment variable name is invalid.');
    error.code = 'password_env_name_invalid';
    throw error;
  }
  let bcryptHash = cliOptionValue(argv, '--bcrypt-hash', cliOptionValue(argv, '--password-hash', ''));
  if (passwordEnv.length > 0) {
    const password = typeof process.env[passwordEnv] === 'string' ? process.env[passwordEnv] : '';
    try {
      bcryptHash = await hashPassword(password);
    } catch (error) {
      const wrapped = new Error(error instanceof Error ? error.message : String(error));
      wrapped.code = error && typeof error.code === 'string' ? error.code : 'password_hash_failed';
      throw wrapped;
    }
  }
  return {
    mode,
    bcryptHash
  };
}

function securityAuthCliFailure(error) {
  const code = error && typeof error.code === 'string' && error.code.length > 0
    ? error.code
    : 'password_hash_failed';
  return {
    ok: false,
    code,
    action: 'security.auth.set',
    failureCategory: code,
    message: error instanceof Error ? error.message : String(error),
    remediation: 'Set the named password environment variable locally, then retry. The plaintext password is never sent to Bridge.'
  };
}

function securityHostValuesForCli(argv) {
  const values = cliOptionValues(argv, '--host')
    .concat(cliOptionValues(argv, '--hostname'))
    .concat(cliOptionValues(argv, '--allow'));
  const positionalStart = argv.length > 2 ? 3 : 2;
  for (let index = positionalStart; index < argv.length; index++) {
    const value = argv[index];
    if (typeof value === 'string' && value.length > 0 && !value.startsWith('--')) {
      const previous = index > 0 ? argv[index - 1] : '';
      if (previous.startsWith('--')) {
        continue;
      }
      values.push(value);
    }
  }
  return values;
}

function securityHostsPayloadForCli(argv, action) {
  const operation = action === 'add' || action === 'remove' || action === 'reset' ? action : 'set';
  return {
    operation,
    hostnames: operation === 'reset' ? [] : securityHostValuesForCli(argv)
  };
}

async function securityCommandForCli(store, securityAudit, argv) {
  const command = argv.length > 1 ? argv[1] : 'devices';
  if (command === 'devices') {
    return {
      devices: store.readTrustedDevices(),
      storePath: store.paths.trustedDevices,
      trustScope: 'management_audit',
      transportAuthentication: 'bridge_credential',
      clientProofRequired: false,
      message: 'Trusted device records are management and audit metadata; they do not replace Bridge credential authentication.'
    };
  }
  if (command === 'trust') {
    const result = trustDeviceForCli(store, argv);
    recordCliSecurityAudit(securityAudit, {
      category: 'device',
      action: 'security.device.trust',
      severity: result && result.code ? 'warning' : 'info',
      status: result && result.code ? 'rejected' : 'updated',
      reason: result && result.code ? result.code : 'device_trusted',
      message: result && result.code ? result.message : 'Trusted device list updated by CLI.',
      deviceId: result && result.device ? readString(result.device, 'physicalDeviceId', '') : '',
      fingerprint: result && result.device ? readString(result.device, 'publicKeyFingerprint', '') : ''
    });
    return result;
  }
  if (command === 'revoke') {
    const result = revokeDeviceForCli(store, argv);
    recordCliSecurityAudit(securityAudit, {
      category: 'device',
      action: 'security.device.revoke',
      severity: result && result.code ? 'warning' : 'info',
      status: result && result.code ? 'rejected' : 'updated',
      reason: result && result.code ? result.code : 'device_revoked',
      message: result && result.code ? result.message : 'Trusted device revocation processed by CLI.',
      deviceId: result && result.device ? readString(result.device, 'physicalDeviceId', '') : '',
      fingerprint: result && result.device ? readString(result.device, 'publicKeyFingerprint', '') : ''
    });
    return result;
  }
  if (command === 'audit') {
    const payload = {
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10),
      severity: cliOptionValue(argv, '--severity', '')
    };
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_AUDIT_LIST, payload));
    return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : securityAudit.list(payload);
  }
  if (command === 'tls') {
    const action = argv.length > 2 ? argv[2] : 'status';
    if (action === 'status') {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_TLS_STATUS, {}));
      return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : tlsStatus(store);
    }
    if (action === 'set') {
      const payload = securityTlsSetPayloadForCli(store, argv);
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_TLS_SET, payload));
      if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
        return rpcPayload;
      }
      const result = setTlsPreference(store, payload);
      recordCliSecurityAudit(securityAudit, {
        category: 'config',
        action: 'security.tls.set',
        severity: 'info',
        status: 'updated',
        reason: result.enabled ? 'tls_preference_enabled' : 'tls_preference_disabled',
        message: result.message
      });
      return result;
    }
  }
  if (command === 'hosts' || command === 'host') {
    const action = argv.length > 2 ? argv[2] : 'status';
    if (action === 'status' || action === 'list') {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_HOSTS_STATUS, {}));
      return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : hostAllowlistStatus(store);
    }
    if (action === 'set' || action === 'add' || action === 'remove' || action === 'reset') {
      const payload = securityHostsPayloadForCli(argv, action);
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_HOSTS_SET, payload));
      if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
        return rpcPayload;
      }
      const result = setHostAllowlist(store, payload);
      recordCliSecurityAudit(securityAudit, {
        category: 'config',
        action: 'security.hosts.set',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'host_allowlist_updated',
        message: result.message
      });
      return result;
    }
  }
  if (command === 'token') {
    const action = argv.length > 2 ? argv[2] : 'status';
    if (action === 'status') {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_TOKEN_STATUS, {}));
      return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : bearerTokenStatus(securityTokenConfigForCli());
    }
    if (action === 'rotate') {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_TOKEN_ROTATE, {}));
      if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
        return rpcPayload;
      }
      const result = rotateBearerToken(securityTokenConfigForCli());
      recordCliSecurityAudit(securityAudit, {
        category: 'auth',
        action: 'security.token.rotate',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'token_rotated',
        message: result.message
      });
      return result;
    }
  }
  if (command === 'auth') {
    const action = argv.length > 2 ? argv[2] : 'status';
    if (action === 'status') {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_AUTH_STATUS, {}));
      return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : bcryptStatus(store);
    }
    if (action === 'set') {
      let payload = null;
      try {
        payload = await securityAuthSetPayloadForCli(store, argv);
      } catch (error) {
        return securityAuthCliFailure(error);
      }
      if (!hasCliFlag(argv, '--local')) {
        const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.SECURITY_AUTH_SET, payload));
        if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
          return rpcPayload;
        }
      }
      const result = setAuthPreference(store, payload);
      recordCliSecurityAudit(securityAudit, {
        category: 'config',
        action: 'security.auth.set',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'authentication_mode_changed',
        message: result.message
      });
      return Object.assign({}, result, {
        localRecovery: hasCliFlag(argv, '--local'),
        restartRequired: hasCliFlag(argv, '--local')
      });
    }
  }
  if (command === 'doctor') {
    const result = securityDoctorForCli(store, securityAudit);
    if (hasCliFlag(argv, '--save')) {
      return saveDaemonDoctorReportForCli(store, result);
    }
    return result;
  }
  throw new Error('Unsupported security command: ' + argv.join(' '));
}

function readJsonFileForCli(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return {};
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('JSON file not found: ' + resolved);
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON file must contain an object: ' + resolved);
  }
  return parsed;
}

function cliObjectFromArgs(argv) {
  const filePath = cliOptionValue(argv, '--file', '');
  const source = filePath.length > 0 ? readJsonFileForCli(filePath) : {};
  const next = Object.assign({}, source);
  const profileId = cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', ''));
  const providerId = cliOptionValue(argv, '--provider-id', '');
  const displayName = cliOptionValue(argv, '--name', cliOptionValue(argv, '--display-name', ''));
  const endpoint = cliOptionValue(argv, '--endpoint', cliOptionValue(argv, '--base-url', ''));
  const binary = cliOptionValue(argv, '--binary', cliOptionValue(argv, '--command', ''));
  const args = cliOptionValue(argv, '--args', '');
  const cwd = cliOptionValue(argv, '--cwd', '');
  const runtimeMode = cliOptionValue(argv, '--runtime-mode', '');
  if (profileId.length > 0) {
    next.profileId = profileId;
    next.id = profileId;
  }
  if (providerId.length > 0) {
    next.providerId = providerId;
  }
  if (displayName.length > 0) {
    next.displayName = displayName;
  }
  if (endpoint.length > 0) {
    next.endpoint = endpoint;
  }
  if (binary.length > 0) {
    next.binary = binary;
  }
  if (args.length > 0) {
    next.args = args;
  }
  if (cwd.length > 0) {
    next.cwd = cwd;
  }
  if (runtimeMode.length > 0) {
    next.runtimeMode = runtimeMode;
  }
  if (hasCliFlag(argv, '--disabled')) {
    next.enabled = false;
  }
  if (hasCliFlag(argv, '--enabled')) {
    next.enabled = true;
  }
  return next;
}

function normalizeProviderProfileForCli(payload, existing) {
  const now = new Date().toISOString();
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const profileId = readString(payload, 'profileId', readString(payload, 'id', readString(base, 'profileId', 'prv_' + crypto.randomBytes(12).toString('base64url'))));
  const providerId = readString(payload, 'providerId', readString(base, 'providerId', profileId));
  const displayName = readString(payload, 'displayName', readString(payload, 'name', readString(base, 'displayName', providerId)));
  const hasEnvPayload = Object.keys(source).includes('env');
  return {
    profileId,
    providerId,
    displayName,
    description: readString(payload, 'description', readString(base, 'description', '')),
    endpoint: readString(payload, 'endpoint', readString(payload, 'baseUrl', readString(base, 'endpoint', ''))),
    binary: readString(payload, 'binary', readString(payload, 'command', readString(base, 'binary', ''))),
    args: readString(payload, 'args', readString(base, 'args', '')),
    cwd: readString(payload, 'cwd', readString(base, 'cwd', '')),
    runtimeMode: readString(payload, 'runtimeMode', readString(base, 'runtimeMode', 'oneshot')) === 'stdio' ? 'stdio' : 'oneshot',
    env: hasEnvPayload ? readCliObject(payload, 'env') : readCliObject(base, 'env'),
    baseProfileId: readString(payload, 'baseProfileId', readString(base, 'baseProfileId', '')),
    cloneFromProfileId: readString(payload, 'cloneFromProfileId', readString(base, 'cloneFromProfileId', '')),
    validationMessages: Array.isArray(payload.validationMessages)
      ? payload.validationMessages.filter((item) => typeof item === 'string')
      : (Array.isArray(base.validationMessages) ? base.validationMessages.filter((item) => typeof item === 'string') : []),
    enabled: readBoolean(payload, 'enabled', readBoolean(base, 'enabled', true)),
    kind: readString(payload, 'kind', readString(base, 'kind', 'custom')),
    sourcePath: readString(payload, 'sourcePath', readString(base, 'sourcePath', '')),
    createdAt: readString(base, 'createdAt', now),
    updatedAt: now
  };
}

function commandHasPathSeparatorForCli(command) {
  return command.indexOf('/') >= 0 || command.indexOf('\\') >= 0 || path.isAbsolute(command);
}

function executableExtensionsForCli() {
  if (process.platform !== 'win32') {
    return [''];
  }
  const value = typeof process.env.PATHEXT === 'string' && process.env.PATHEXT.length > 0
    ? process.env.PATHEXT
    : '.EXE;.CMD;.BAT;.COM';
  return value.split(';').filter((item) => item.length > 0);
}

function resolveBinaryForCli(command, cwd) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return '';
  }
  const value = command.trim();
  const extensions = executableExtensionsForCli();
  if (commandHasPathSeparatorForCli(value)) {
    const resolved = path.isAbsolute(value) ? value : path.resolve(cwd.length > 0 ? cwd : process.cwd(), value);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    for (const extension of extensions) {
      if (extension.length > 0 && fs.existsSync(resolved + extension)) {
        return resolved + extension;
      }
    }
    return '';
  }
  const pathValue = typeof process.env.PATH === 'string' ? process.env.PATH : '';
  for (const directory of pathValue.split(path.delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    const candidate = path.join(directory, value);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    for (const extension of extensions) {
      if (extension.length > 0 && fs.existsSync(candidate + extension)) {
        return candidate + extension;
      }
    }
  }
  return '';
}

function splitCliArgs(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote.length > 0) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function classifyProviderRuntimeFailureForCli(message) {
  if (typeof message !== 'string' || message.length === 0) {
    return '';
  }
  const lower = message.toLowerCase();
  if (lower.indexOf('disabled') >= 0) {
    return 'disabled';
  }
  if (lower.indexOf('not executable') >= 0) {
    return 'binary_not_executable';
  }
  if (lower.indexOf('binary') >= 0 || lower.indexOf('command') >= 0 || lower.indexOf('not found') >= 0) {
    return 'binary_missing';
  }
  if (lower.indexOf('timeout') >= 0 || lower.indexOf('timed out') >= 0) {
    return 'startup_timeout';
  }
  if (lower.indexOf('endpoint') >= 0 || lower.indexOf('reachable') >= 0) {
    return 'endpoint_unreachable';
  }
  if (lower.indexOf('invalid') >= 0) {
    return 'config_invalid';
  }
  return 'runtime_error';
}

function decorateProviderProfileForCli(profile) {
  const endpoint = readString(profile, 'endpoint', '');
  const binary = readString(profile, 'binary', '');
  const binaryPath = resolveBinaryForCli(binary, readString(profile, 'cwd', ''));
  const endpointRuntime = endpoint.startsWith('http://') || endpoint.startsWith('https://');
  const binaryRuntime = binary.length > 0 && binaryPath.length > 0 && !fs.statSync(binaryPath).isDirectory();
  const enabled = readBoolean(profile, 'enabled', true);
  const runtimeRegistered = enabled && (endpointRuntime || binaryRuntime);
  let runtimeError = '';
  if (!runtimeRegistered) {
    if (!enabled) {
      runtimeError = 'Provider profile is disabled.';
    } else if (binary.length > 0 && binaryPath.length === 0) {
      runtimeError = 'Provider profile binary was not found.';
    } else if (binary.length > 0 && binaryPath.length > 0 && fs.statSync(binaryPath).isDirectory()) {
      runtimeError = 'Provider profile binary is not executable.';
    } else {
      runtimeError = 'Provider profile has no reachable local endpoint or binary.';
    }
  }
  return Object.assign({}, profile, {
    runtimeRegistered,
    runtimeProviderId: 'profile.' + cliSafeSegment(readString(profile, 'profileId', readString(profile, 'providerId', 'custom'))),
    runtimeError,
    runtimeFailureCategory: runtimeRegistered ? '' : classifyProviderRuntimeFailureForCli(runtimeError),
    binaryPath
  });
}

function upsertProviderProfileForCli(store, argv) {
  const payload = cliObjectFromArgs(argv);
  const profileId = readString(payload, 'profileId', readString(payload, 'id', ''));
  const profiles = store.readProviderProfiles();
  const nextProfiles = [];
  let savedProfile = null;
  let replaced = false;
  for (const profile of profiles) {
    if (profileId.length > 0 && profile && profile.profileId === profileId) {
      savedProfile = normalizeProviderProfileForCli(Object.assign({}, payload, { profileId }), profile);
      nextProfiles.push(savedProfile);
      replaced = true;
    } else {
      nextProfiles.push(profile);
    }
  }
  if (!replaced) {
    savedProfile = normalizeProviderProfileForCli(payload, null);
    nextProfiles.push(savedProfile);
  }
  store.writeProviderProfiles(nextProfiles);
  return {
    profile: decorateProviderProfileForCli(savedProfile),
    profiles: nextProfiles.map(decorateProviderProfileForCli)
  };
}

function deleteProviderProfileForCli(store, argv) {
  const profileId = cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''));
  if (profileId.length === 0) {
    throw new Error('provider delete requires --profile-id.');
  }
  const profiles = store.readProviderProfiles();
  const nextProfiles = [];
  let deleted = null;
  for (const profile of profiles) {
    if (profile && profile.profileId === profileId) {
      deleted = profile;
    } else {
      nextProfiles.push(profile);
    }
  }
  store.writeProviderProfiles(nextProfiles);
  return {
    deleted: deleted !== null,
    profileId,
    profiles: nextProfiles.map(decorateProviderProfileForCli)
  };
}

function cloneProviderProfileForCli(store, argv) {
  const sourceProfileId = cliOptionValue(argv, '--from', cliOptionValue(argv, '--source-profile-id', argv.length > 2 ? argv[2] : ''));
  if (sourceProfileId.length === 0) {
    throw new Error('provider clone requires --from.');
  }
  const profiles = store.readProviderProfiles();
  let sourceProfile = null;
  for (const profile of profiles) {
    if (profile && profile.profileId === sourceProfileId) {
      sourceProfile = profile;
      break;
    }
  }
  if (!sourceProfile) {
    throw new Error('Provider profile not found: ' + sourceProfileId);
  }
  const payload = cliObjectFromArgs(argv);
  const targetProfileId = readString(payload, 'profileId', '');
  const profileId = targetProfileId.length > 0 ? targetProfileId : sourceProfileId + '-copy';
  const savedProfile = normalizeProviderProfileForCli(Object.assign({}, sourceProfile, payload, {
    profileId,
    id: profileId,
    baseProfileId: readString(payload, 'baseProfileId', sourceProfileId),
    cloneFromProfileId: sourceProfileId
  }), null);
  const nextProfiles = [];
  let replaced = false;
  for (const profile of profiles) {
    if (profile && profile.profileId === profileId) {
      nextProfiles.push(savedProfile);
      replaced = true;
    } else {
      nextProfiles.push(profile);
    }
  }
  if (!replaced) {
    nextProfiles.push(savedProfile);
  }
  store.writeProviderProfiles(nextProfiles);
  return {
    profile: decorateProviderProfileForCli(savedProfile),
    profiles: nextProfiles.map(decorateProviderProfileForCli)
  };
}

function providerEnvEditsFromCli(argv) {
  const setValues = cliOptionValues(argv, '--set')
    .concat(cliOptionValues(argv, '--set-env'))
    .concat(cliOptionValues(argv, '--env'));
  const unsetValues = cliOptionValues(argv, '--unset').concat(cliOptionValues(argv, '--unset-env'));
  return {
    setValues,
    unsetValues
  };
}

function editProviderProfileEnvForCli(store, argv) {
  const profileId = cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''));
  if (profileId.length === 0) {
    throw new Error('provider env requires --profile-id.');
  }
  const profiles = store.readProviderProfiles();
  const edits = providerEnvEditsFromCli(argv);
  const nextProfiles = [];
  let savedProfile = null;
  for (const profile of profiles) {
    if (profile && profile.profileId === profileId) {
      const env = Object.assign({}, readCliObject(profile, 'env'));
      for (const item of edits.setValues) {
        const splitAt = item.indexOf('=');
        if (splitAt > 0) {
          env[item.substring(0, splitAt)] = item.substring(splitAt + 1);
        }
      }
      for (const item of edits.unsetValues) {
        if (item.length > 0) {
          delete env[item];
        }
      }
      savedProfile = normalizeProviderProfileForCli(Object.assign({}, profile, {
        env
      }), profile);
      nextProfiles.push(savedProfile);
    } else {
      nextProfiles.push(profile);
    }
  }
  if (!savedProfile) {
    throw new Error('Provider profile not found: ' + profileId);
  }
  store.writeProviderProfiles(nextProfiles);
  return {
    profile: decorateProviderProfileForCli(savedProfile),
    env: savedProfile.env,
    edited: edits.setValues.length > 0 || edits.unsetValues.length > 0,
    profiles: nextProfiles.map(decorateProviderProfileForCli)
  };
}

function findProviderProfileForCli(store, argv) {
  const profileId = cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''));
  if (profileId.length > 0) {
    for (const profile of store.readProviderProfiles()) {
      if (profile && profile.profileId === profileId) {
        return normalizeProviderProfileForCli(profile, profile);
      }
    }
    throw new Error('Provider profile not found: ' + profileId);
  }
  return normalizeProviderProfileForCli(cliObjectFromArgs(argv), null);
}

function probeEndpointForCli(endpoint, timeoutMs) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch (error) {
      resolve({
        checked: true,
        reachable: false,
        statusCode: 0,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    const client = url.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const request = client.request(url, { method: 'GET', timeout: timeoutMs }, (response) => {
      response.resume();
      resolve({
        checked: true,
        reachable: response.statusCode >= 200 && response.statusCode < 500,
        statusCode: response.statusCode || 0,
        error: '',
        durationMs: Date.now() - startedAt
      });
    });
    request.on('timeout', () => request.destroy(new Error('Endpoint probe timed out.')));
    request.on('error', (error) => {
      resolve({
        checked: true,
        reachable: false,
        statusCode: 0,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt
      });
    });
    request.end();
  });
}

function runProviderProfileCommandForCli(profile, binaryPath, argv, timeoutMs) {
  return new Promise((resolve) => {
    const testArgs = splitCliArgs(cliOptionValue(argv, '--test-args', '--version'));
    const cwd = readString(profile, 'cwd', '');
    const env = Object.assign({}, process.env, readCliObject(profile, 'env'));
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let completed = false;
    const child = spawn(binaryPath, testArgs, {
      cwd: cwd.length > 0 && fs.existsSync(cwd) ? cwd : process.cwd(),
      env,
      windowsHide: true
    });
    const timer = setTimeout(() => {
      if (!completed) {
        child.kill();
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 65536) {
        stdout += chunk.toString('utf8');
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 65536) {
        stderr += chunk.toString('utf8');
      }
    });
    child.on('error', (error) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      resolve({
        commandRan: true,
        exitCode: 1,
        stdout,
        stderr: stderr.length > 0 ? stderr : (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
    });
    child.on('exit', (code, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      resolve({
        commandRan: true,
        exitCode: code === null ? 1 : code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: signal !== null
      });
    });
  });
}

async function testProviderProfileForCli(store, argv) {
  const timeoutMs = Math.max(500, Math.min(10000, Number.parseInt(cliOptionValue(argv, '--timeout-ms', '3000'), 10) || 3000));
  const profile = findProviderProfileForCli(store, argv);
  const decoratedProfile = decorateProviderProfileForCli(profile);
  const endpoint = readString(profile, 'endpoint', '');
  const binary = readString(profile, 'binary', '');
  const binaryPath = resolveBinaryForCli(binary, readString(profile, 'cwd', ''));
  const validationMessages = [];
  let endpointProbe = { checked: false, reachable: false, statusCode: 0, error: '', durationMs: 0 };
  let commandResult = { commandRan: false, exitCode: 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
  if (endpoint.length === 0 && binary.length === 0) {
    validationMessages.push('Provider profile needs an endpoint or binary.');
  }
  if (binary.length > 0 && binaryPath.length === 0) {
    validationMessages.push('Provider profile binary was not found.');
  }
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    endpointProbe = await probeEndpointForCli(endpoint, timeoutMs);
    if (!endpointProbe.reachable) {
      validationMessages.push(endpointProbe.error.length > 0 ? endpointProbe.error : 'Provider profile endpoint is not reachable.');
    }
  }
  if (hasCliFlag(argv, '--run') && binaryPath.length > 0) {
    commandResult = await runProviderProfileCommandForCli(profile, binaryPath, argv, timeoutMs);
    if (commandResult.exitCode !== 0) {
      validationMessages.push('Provider profile test command exited with code ' + String(commandResult.exitCode) + '.');
    }
  }
  const ok = validationMessages.length === 0 && decoratedProfile.runtimeRegistered === true;
  return {
    ok,
    profile: decoratedProfile,
    profileId: decoratedProfile.profileId,
    runtimeRegistered: decoratedProfile.runtimeRegistered,
    runtimeProviderId: decoratedProfile.runtimeProviderId,
    runtimeError: decoratedProfile.runtimeError,
    runtimeFailureCategory: classifyProviderRuntimeFailureForCli(decoratedProfile.runtimeError),
    testStatus: ok ? 'ok' : 'failed',
    validationMessages,
    endpointChecked: endpointProbe.checked,
    endpointReachable: endpointProbe.reachable,
    endpointStatusCode: endpointProbe.statusCode,
    endpointError: endpointProbe.error,
    binaryResolved: binaryPath.length > 0,
    binaryPath,
    commandRan: commandResult.commandRan,
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    durationMs: Math.max(endpointProbe.durationMs || 0, commandResult.durationMs || 0),
    timedOut: commandResult.timedOut === true,
    updatedAt: Date.now()
  };
}

function cliAgentId(argv, fallbackIndex) {
  return cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', argv.length > fallbackIndex ? argv[fallbackIndex] : ''));
}

function timelinePayloadForCli(argv, fallbackIndex) {
  return {
    agentId: cliAgentId(argv, fallbackIndex),
    cursor: cliOptionValue(argv, '--cursor', ''),
    direction: cliOptionValue(argv, '--direction', 'after'),
    limit: Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10),
    debugRaw: hasCliFlag(argv, '--debug-raw')
  };
}

async function agentLogsForCli(agentManager, argv) {
  if (hasCliFlag(argv, '--follow') || hasCliFlag(argv, '-f')) {
    return await agentTimelineFollowForCli(agentManager, argv);
  }
  const payload = timelinePayloadForCli(argv, 2);
  if (payload.agentId.length === 0) {
    throw new Error('agent logs requires an agent id.');
  }
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.TIMELINE_FETCH, payload));
  if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0 && explicitRemoteCli(argv)) {
    return remoteFailureForCli(rpcPayload, 'agent.logs');
  }
  if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
    return {
      ok: !rpcPayload || !rpcPayload.code,
      action: 'agent.logs',
      source: 'live',
      agentId: payload.agentId,
      timeline: rpcPayload || {},
      items: rpcPayload && Array.isArray(rpcPayload.items) ? rpcPayload.items : [],
      latestSeq: rpcPayload && typeof rpcPayload.latestSeq === 'number' ? rpcPayload.latestSeq : 0
    };
  }
  const record = agentManager.find(payload.agentId);
  const timeline = agentManager.fetchTimeline(payload);
  if (!record) {
    return {
      code: 'agent_not_found',
      action: 'agent.logs',
      source: 'offline',
      agentId: payload.agentId,
      message: 'Agent not found.'
    };
  }
  return {
    ok: true,
    action: 'agent.logs',
    source: 'offline',
    agent: agentManager.publicRecord(record),
    agentId: payload.agentId,
    timeline,
    items: timeline.items,
    totalCount: Array.isArray(timeline.items) ? timeline.items.length : 0,
    latestSeq: typeof timeline.latestSeq === 'number' ? timeline.latestSeq : 0,
    rpcUnavailable: true,
    rpcFailureCategory: rpcPayload.code || 'rpc_unavailable'
  };
}

function parseCliPositiveInteger(argv, name, fallbackValue, maxValue) {
  const parsed = Number.parseInt(cliOptionValue(argv, name, String(fallbackValue)), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }
  if (typeof maxValue === 'number' && parsed > maxValue) {
    return maxValue;
  }
  return parsed;
}

function followOptionsForCli(argv) {
  return {
    intervalMs: Math.max(100, parseCliPositiveInteger(argv, '--interval-ms', 500, 30000)),
    timeoutMs: parseCliPositiveInteger(argv, '--timeout-ms', 0, 24 * 60 * 60 * 1000),
    maxPolls: parseCliPositiveInteger(argv, '--max-polls', 0, 1000000),
    maxOutputBytes: Math.max(1024, parseCliPositiveInteger(argv, '--max-output-bytes', 1024 * 1024, 16 * 1024 * 1024)),
    json: hasCliFlag(argv, '--json'),
    fromEnd: hasCliFlag(argv, '--from-end'),
    includeTools: hasCliFlag(argv, '--include-tools'),
    rawEvents: hasCliFlag(argv, '--raw-events')
  };
}

function createFollowInterrupt() {
  const state = { interrupted: false };
  const handler = () => {
    state.interrupted = true;
  };
  process.on('SIGINT', handler);
  return {
    state,
    close() {
      process.removeListener('SIGINT', handler);
    }
  };
}

function boundedFollowAppend(state, text, maxBytes) {
  if (typeof text !== 'string' || text.length === 0) {
    return;
  }
  state.bytesWritten += Buffer.byteLength(text);
  if (!state.json) {
    process.stdout.write(text);
    return;
  }
  state.text += text;
  if (Buffer.byteLength(state.text) <= maxBytes) {
    return;
  }
  const buffer = Buffer.from(state.text, 'utf8');
  state.text = buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString('utf8');
  state.outputTruncated = true;
}

function prefixFunctionForText(value) {
  const prefix = new Array(value.length).fill(0);
  for (let index = 1; index < value.length; index += 1) {
    let matched = prefix[index - 1];
    while (matched > 0 && value.charAt(index) !== value.charAt(matched)) {
      matched = prefix[matched - 1];
    }
    if (value.charAt(index) === value.charAt(matched)) {
      matched += 1;
    }
    prefix[index] = matched;
  }
  return prefix;
}

function terminalTextDelta(previousText, currentText) {
  const previous = typeof previousText === 'string' ? previousText : '';
  const current = typeof currentText === 'string' ? currentText : '';
  if (current.length === 0 || current === previous || previous.endsWith(current)) {
    return { text: '', overlap: Math.min(previous.length, current.length), reset: false };
  }
  if (previous.length === 0) {
    return { text: current, overlap: 0, reset: false };
  }
  if (current.startsWith(previous)) {
    return { text: current.substring(previous.length), overlap: previous.length, reset: false };
  }
  const maxOverlap = Math.min(previous.length, current.length, 64 * 1024);
  const pattern = current.substring(0, maxOverlap);
  const prefix = prefixFunctionForText(pattern);
  const tail = previous.substring(previous.length - maxOverlap);
  let matched = 0;
  for (let index = 0; index < tail.length; index += 1) {
    const char = tail.charAt(index);
    while (matched > 0 && char !== pattern.charAt(matched)) {
      matched = prefix[matched - 1];
    }
    if (char === pattern.charAt(matched)) {
      matched += 1;
      if (matched === pattern.length && index + 1 < tail.length) {
        matched = prefix[matched - 1];
      }
    }
  }
  return {
    text: current.substring(matched),
    overlap: matched,
    reset: matched === 0
  };
}

function followTimelineItemText(item, projections, options) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return '';
  }
  if (options.rawEvents) {
    return JSON.stringify(item) + '\n';
  }
  const projected = item.projectedItem && typeof item.projectedItem === 'object' && !Array.isArray(item.projectedItem)
    ? item.projectedItem
    : {};
  const kind = readString(item, 'kind', '');
  const eventType = readString(item, 'eventType', '');
  const projectionId = readString(projected, 'projectionId', kind + ':' + String(item.seq || 0));
  if (kind === 'message') {
    const current = readString(projected, 'text', '');
    const previous = projections.has(projectionId) ? projections.get(projectionId) : '';
    projections.set(projectionId, current);
    const delta = terminalTextDelta(previous, current).text;
    if (eventType === 'message.completed' && delta.length === 0 && previous.length > 0 && !previous.endsWith('\n')) {
      return '\n';
    }
    return delta;
  }
  if (kind === 'tool' && options.includeTools) {
    const current = readString(projected, 'outputText', '');
    const previous = projections.has(projectionId) ? projections.get(projectionId) : '';
    projections.set(projectionId, current);
    const delta = terminalTextDelta(previous, current).text;
    const name = readString(projected, 'name', 'tool');
    if (delta.length > 0) {
      return '[' + name + '] ' + delta + (delta.endsWith('\n') ? '' : '\n');
    }
    if (eventType === 'tool.started') {
      return '[' + name + '] started\n';
    }
    return '';
  }
  if (kind === 'permission') {
    const prompt = readString(projected, 'prompt', readString(projected, 'message', ''));
    return '[' + eventType + ']' + (prompt.length > 0 ? ' ' + prompt : '') + '\n';
  }
  return '';
}

async function agentTimelineFollowForCli(agentManager, argv) {
  const agentId = cliAgentId(argv, 2);
  if (agentId.length === 0) {
    throw new Error('agent logs --follow requires an agent id.');
  }
  const options = followOptionsForCli(argv);
  const output = { json: options.json, text: '', bytesWritten: 0, outputTruncated: false };
  const interrupt = createFollowInterrupt();
  const projections = new Map();
  const startedAt = Date.now();
  let cursor = cliOptionValue(argv, '--cursor', '');
  let polls = 0;
  let source = 'live';
  let lastError = '';
  let latestSeq = 0;
  let timedOut = false;
  try {
    while (!interrupt.state.interrupted) {
      polls += 1;
      const payload = {
        agentId,
        cursor,
        direction: 'after',
        limit: parseCliPositiveInteger(argv, '--limit', 200, 500),
        debugRaw: hasCliFlag(argv, '--debug-raw')
      };
      let timeline = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.TIMELINE_FETCH, payload));
      if (timeline && timeline.rpcUnavailable === true) {
        if (explicitRemoteCli(argv)) {
          return remoteFailureForCli(timeline, 'agent.logs.follow');
        }
        source = 'offline';
        const offlineManager = new AgentManager({
          store: agentManager.store,
          workspaceRegistry: agentManager.workspaceRegistry
        });
        timeline = offlineManager.fetchTimeline(payload);
      } else if (timeline && typeof timeline.code === 'string' && timeline.code.length > 0) {
        return remoteFailureForCli(timeline, 'agent.logs.follow');
      }
      if (!timeline || timeline.error === 'agent_not_found') {
        return {
          ok: false,
          code: 'agent_not_found',
          action: 'agent.logs.follow',
          agentId,
          source,
          message: 'Agent not found.'
        };
      }
      const items = Array.isArray(timeline.items) ? timeline.items : [];
      for (const item of items) {
        const text = followTimelineItemText(item, projections, options);
        if (!(options.fromEnd && polls === 1)) {
          boundedFollowAppend(output, text, options.maxOutputBytes);
        }
      }
      if (typeof timeline.latestSeq === 'number') {
        latestSeq = timeline.latestSeq;
      }
      if (typeof timeline.endCursor === 'string' && timeline.endCursor.length > 0) {
        cursor = timeline.endCursor;
      } else if (latestSeq > 0) {
        cursor = String(latestSeq);
      }
      if (options.maxPolls > 0 && polls >= options.maxPolls) {
        break;
      }
      if (options.timeoutMs > 0 && Date.now() - startedAt >= options.timeoutMs) {
        timedOut = true;
        break;
      }
      await delay(options.intervalMs);
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  } finally {
    interrupt.close();
  }
  if (lastError.length > 0) {
    return {
      ok: false,
      code: 'agent_follow_failed',
      action: 'agent.logs.follow',
      agentId,
      source,
      polls,
      lastError,
      message: lastError
    };
  }
  return {
    ok: true,
    action: 'agent.logs.follow',
    agentId,
    source,
    streamed: true,
    interrupted: interrupt.state.interrupted,
    timedOut,
    polls,
    latestSeq,
    cursor,
    bytesWritten: output.bytesWritten,
    outputTruncated: output.outputTruncated,
    text: output.text,
    durationMs: Date.now() - startedAt
  };
}

async function terminalFollowForCli(store, argv) {
  const terminalId = cliOptionValue(argv, '--terminal-id', cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''));
  if (terminalId.length === 0) {
    throw new Error('terminal follow requires a terminal id.');
  }
  const options = followOptionsForCli(argv);
  const output = { json: options.json, text: '', bytesWritten: 0, outputTruncated: false };
  const interrupt = createFollowInterrupt();
  const startedAt = Date.now();
  let previousText = '';
  let polls = 0;
  let source = 'live';
  let lastSnapshotSeq = 0;
  let lastRestoreSeq = 0;
  let resets = 0;
  let timedOut = false;
  let closed = false;
  try {
    while (!interrupt.state.interrupted) {
      polls += 1;
      let capture = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.TERMINAL_CAPTURE, { terminalId }));
      if (capture && capture.rpcUnavailable === true) {
        if (explicitRemoteCli(argv)) {
          return remoteFailureForCli(capture, 'terminal.follow');
        }
        source = 'offline';
        capture = readTerminalCaptureTailForCli(store, ['terminal', 'logs', terminalId, '--max-bytes', String(options.maxOutputBytes)]);
      } else if (capture && typeof capture.code === 'string' && capture.code.length > 0) {
        return remoteFailureForCli(capture, 'terminal.follow');
      }
      const currentText = capture && typeof capture.text === 'string' ? capture.text : '';
      const delta = terminalTextDelta(previousText, currentText);
      if (delta.reset && previousText.length > 0) {
        resets += 1;
      }
      if (!(options.fromEnd && polls === 1)) {
        boundedFollowAppend(output, delta.text, options.maxOutputBytes);
      }
      previousText = currentText;
      const terminal = capture && capture.terminal && typeof capture.terminal === 'object' && !Array.isArray(capture.terminal)
        ? capture.terminal
        : null;
      const snapshot = capture && capture.snapshot && typeof capture.snapshot === 'object' && !Array.isArray(capture.snapshot)
        ? capture.snapshot
        : null;
      lastSnapshotSeq = snapshot && typeof snapshot.seq === 'number'
        ? snapshot.seq
        : (terminal && typeof terminal.snapshotSeq === 'number' ? terminal.snapshotSeq : lastSnapshotSeq);
      lastRestoreSeq = capture && typeof capture.restoreSeq === 'number' ? capture.restoreSeq : lastRestoreSeq;
      closed = terminal !== null && readString(terminal, 'status', '') === 'closed';
      if (closed && !hasCliFlag(argv, '--keep-open')) {
        break;
      }
      if (options.maxPolls > 0 && polls >= options.maxPolls) {
        break;
      }
      if (options.timeoutMs > 0 && Date.now() - startedAt >= options.timeoutMs) {
        timedOut = true;
        break;
      }
      await delay(options.intervalMs);
    }
  } finally {
    interrupt.close();
  }
  return {
    ok: true,
    action: 'terminal.follow',
    terminalId,
    source,
    streamed: true,
    interrupted: interrupt.state.interrupted,
    timedOut,
    closed,
    polls,
    snapshotSeq: lastSnapshotSeq,
    restoreSeq: lastRestoreSeq,
    resets,
    bytesWritten: output.bytesWritten,
    outputTruncated: output.outputTruncated,
    text: output.text,
    durationMs: Date.now() - startedAt
  };
}

function agentWaitTargetForCli(argv) {
  const status = cliOptionValue(argv, '--status', cliOptionValue(argv, '--until', 'idle'));
  return {
    status,
    latestSeq: parseCliPositiveInteger(argv, '--seq', 0, Number.MAX_SAFE_INTEGER),
    attention: hasCliFlag(argv, '--attention'),
    noAttention: hasCliFlag(argv, '--no-attention')
  };
}

function agentPublicFromStatusPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const agent = payload.agent && typeof payload.agent === 'object' && !Array.isArray(payload.agent) ? payload.agent : null;
  return agent;
}

function agentStatusMatchesTarget(agent, target) {
  if (!agent) {
    return false;
  }
  const lastStatus = readString(agent, 'lastStatus', '');
  const latestSeq = typeof agent.latestSeq === 'number' && Number.isFinite(agent.latestSeq) ? agent.latestSeq : 0;
  const requiresAttention = agent.requiresAttention === true;
  if (target.latestSeq > 0 && latestSeq < target.latestSeq) {
    return false;
  }
  if (target.attention && !requiresAttention) {
    return false;
  }
  if (target.noAttention && requiresAttention) {
    return false;
  }
  if (target.status.length === 0 || target.status === 'any') {
    return true;
  }
  if (target.status === 'not-running') {
    return lastStatus !== 'running' && lastStatus !== 'initializing';
  }
  if (target.status === 'done' || target.status === 'completed') {
    return lastStatus === 'idle' || lastStatus === 'closed' || lastStatus === 'error';
  }
  return lastStatus === target.status;
}

async function liveAgentStatusForCli(argv, agentId) {
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.AGENT_STATUS, {
    agentId
  }));
  if (rpcPayload && rpcPayload.rpcUnavailable === true) {
    return {
      source: 'offline',
      rpcPayload,
      agent: null
    };
  }
  if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
    return {
      source: 'error',
      rpcPayload,
      agent: null
    };
  }
  if (rpcPayload && typeof rpcPayload === 'object' && !Array.isArray(rpcPayload)) {
    return {
      source: 'live',
      rpcPayload,
      agent: agentPublicFromStatusPayload(rpcPayload)
    };
  }
  return {
    source: 'error',
    rpcPayload: {
      code: 'rpc_empty_response',
      failureCategory: 'rpc_empty_response',
      message: 'Bridge RPC returned no agent status payload.'
    },
    agent: null
  };
}

function offlineAgentStatusForCli(store, workspaceRegistry, agentId) {
  const freshManager = new AgentManager({
    store,
    workspaceRegistry
  });
  const record = freshManager.find(agentId);
  return {
    source: 'offline',
    manager: freshManager,
    agent: record ? freshManager.publicRecord(record) : null
  };
}

async function agentWaitForCli(store, workspaceRegistry, argv) {
  const agentId = cliAgentId(argv, 2);
  if (agentId.length === 0) {
    throw new Error('agent wait requires an agent id.');
  }
  const target = agentWaitTargetForCli(argv);
  const timeoutMs = parseCliPositiveInteger(argv, '--timeout-ms', 30000, 10 * 60 * 1000);
  const intervalMs = Math.max(100, parseCliPositiveInteger(argv, '--interval-ms', 500, 10000));
  const startedAt = Date.now();
  let attempts = 0;
  let lastSource = 'offline';
  let lastRpcFailureCategory = '';
  let lastAgent = null;
  do {
    attempts += 1;
    const live = await liveAgentStatusForCli(argv, agentId);
    if (live.source === 'error') {
      return Object.assign(remoteFailureForCli(live.rpcPayload, 'agent.wait'), {
        agentId,
        target,
        source: 'live',
        attempts,
        durationMs: Date.now() - startedAt
      });
    }
    if (live.source === 'live') {
      lastSource = 'live';
      lastAgent = live.agent;
    } else {
      lastSource = 'offline';
      lastRpcFailureCategory = live.rpcPayload && typeof live.rpcPayload.code === 'string' ? live.rpcPayload.code : 'rpc_unavailable';
      const offline = offlineAgentStatusForCli(store, workspaceRegistry, agentId);
      lastAgent = offline.agent;
    }
    if (!lastAgent) {
      return {
        code: 'agent_not_found',
        action: 'agent.wait',
        agentId,
        target,
        source: lastSource,
        rpcFailureCategory: lastRpcFailureCategory,
        attempts,
        durationMs: Date.now() - startedAt,
        message: 'Agent not found.'
      };
    }
    if (agentStatusMatchesTarget(lastAgent, target)) {
      return {
        ok: true,
        action: 'agent.wait',
        matched: true,
        timedOut: false,
        agentId,
        target,
        source: lastSource,
        rpcFailureCategory: lastRpcFailureCategory,
        attempts,
        durationMs: Date.now() - startedAt,
        agent: lastAgent
      };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      break;
    }
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  } while (Date.now() - startedAt <= timeoutMs);
  return {
    code: 'agent_wait_timeout',
    action: 'agent.wait',
    matched: false,
    timedOut: true,
    agentId,
    target,
    source: lastSource,
    rpcFailureCategory: lastRpcFailureCategory,
    attempts,
    durationMs: Date.now() - startedAt,
    agent: lastAgent,
    message: 'Timed out waiting for agent status.'
  };
}

function permitStatusIsPending(status) {
  if (typeof status !== 'string' || status.length === 0) {
    return true;
  }
  const normalized = status.toLowerCase();
  return normalized === 'requested' ||
    normalized === 'pending' ||
    normalized === 'waiting' ||
    normalized === 'needs_input' ||
    normalized === 'needs_approval' ||
    normalized === 'review';
}

function permitKindForEvent(eventType) {
  if (eventType === 'plan.requested') {
    return 'plan';
  }
  if (eventType === 'question.requested') {
    return 'question';
  }
  return 'permission';
}

function permitRequestId(projectedItem) {
  return readString(projectedItem, 'requestId', readString(projectedItem, 'permissionId', readString(projectedItem, 'planId', readString(projectedItem, 'id', ''))));
}

function listPermitsForCli(agentManager, argv) {
  const agentId = cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', ''));
  const includeResolved = hasCliFlag(argv, '--include-resolved');
  const limit = Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10);
  const maxItems = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const permits = [];
  const agents = agentManager.list({
    includeArchived: hasCliFlag(argv, '--include-archived')
  });
  for (const agent of agents) {
    if (agentId.length > 0 && agent.id !== agentId) {
      continue;
    }
    const timeline = agentManager.fetchTimeline({
      agentId: agent.id,
      limit: 500
    });
    for (const item of timeline.items) {
      if (!item || item.kind !== 'permission') {
        continue;
      }
      const projected = item.projectedItem && typeof item.projectedItem === 'object' && !Array.isArray(item.projectedItem) ? item.projectedItem : {};
      const status = readString(projected, 'status', '');
      if (!includeResolved && !permitStatusIsPending(status)) {
        continue;
      }
      permits.push({
        agentId: agent.id,
        agentTitle: readString(agent, 'title', ''),
        providerId: readString(projected, 'providerId', readString(agent, 'provider', '')),
        sessionId: readString(projected, 'sessionId', readString(agent, 'providerSessionId', '')),
        seq: item.seq,
        eventType: item.eventType,
        kind: permitKindForEvent(item.eventType),
        requestId: permitRequestId(projected),
        permissionId: readString(projected, 'permissionId', ''),
        planId: readString(projected, 'planId', ''),
        title: readString(projected, 'title', ''),
        prompt: readString(projected, 'prompt', readString(projected, 'message', '')),
        status: status.length > 0 ? status : 'pending',
        createdAt: item.createdAt
      });
    }
  }
  permits.sort((left, right) => {
    const leftCreated = typeof left.createdAt === 'number' ? left.createdAt : 0;
    const rightCreated = typeof right.createdAt === 'number' ? right.createdAt : 0;
    return rightCreated - leftCreated;
  });
  let pendingCount = 0;
  for (const item of permits) {
    if (permitStatusIsPending(item.status)) {
      pendingCount++;
    }
  }
  return {
    ok: true,
    action: 'permit.list',
    agentId,
    permits: permits.slice(0, maxItems),
    totalCount: permits.length,
    pendingCount,
    includeResolved,
    message: permits.length > 0 ? 'Permission requests are available.' : 'No permission requests found in local agent timelines.'
  };
}

function normalizedRemotePermitList(payload, argv) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const requests = Array.isArray(source.requests) ? source.requests : (Array.isArray(source.permits) ? source.permits : []);
  return {
    ok: source.ok !== false,
    action: 'permit.list',
    source: 'live',
    agentId: cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', '')),
    permits: requests,
    totalCount: typeof source.totalCount === 'number' ? source.totalCount : requests.length,
    pendingCount: typeof source.pendingCount === 'number' ? source.pendingCount : requests.length,
    includeResolved: hasCliFlag(argv, '--include-resolved'),
    message: requests.length > 0 ? 'Permission requests are available.' : 'No permission requests found on the Bridge daemon.'
  };
}

async function listPermitsLiveOrLocalForCli(agentManager, argv) {
  const payload = {
    agentId: cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', '')),
    includeResolved: hasCliFlag(argv, '--include-resolved'),
    includeArchived: hasCliFlag(argv, '--include-archived'),
    limit: parseCliPositiveInteger(argv, '--limit', 100, 500)
  };
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.PERMISSION_LIST, payload));
  if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
    if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
      return remoteFailureForCli(rpcPayload, 'permit.list');
    }
    return normalizedRemotePermitList(rpcPayload, argv);
  }
  if (explicitRemoteCli(argv)) {
    return remoteFailureForCli(rpcPayload, 'permit.list');
  }
  return Object.assign({ source: 'offline' }, listPermitsForCli(agentManager, argv));
}

function permitWaitTargetForCli(argv) {
  const requestId = cliOptionValue(argv, '--request-id', cliOptionValue(argv, '--permission-id', cliOptionValue(argv, '--plan-id', '')));
  return {
    agentId: cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', '')),
    kind: cliOptionValue(argv, '--kind', ''),
    requestId,
    includeResolved: hasCliFlag(argv, '--include-resolved')
  };
}

function permitMatchesWaitTarget(permit, target) {
  if (!permit || !target) {
    return false;
  }
  if (target.agentId.length > 0 && permit.agentId !== target.agentId) {
    return false;
  }
  if (target.kind.length > 0 && permit.kind !== target.kind) {
    return false;
  }
  if (target.requestId.length > 0) {
    const permissionId = typeof permit.permissionId === 'string' ? permit.permissionId : '';
    const planId = typeof permit.planId === 'string' ? permit.planId : '';
    const requestId = typeof permit.requestId === 'string' ? permit.requestId : '';
    if (requestId !== target.requestId && permissionId !== target.requestId && planId !== target.requestId) {
      return false;
    }
  }
  if (!target.includeResolved && !permitStatusIsPending(permit.status)) {
    return false;
  }
  return true;
}

async function permitWaitForCli(agentManager, argv) {
  const target = permitWaitTargetForCli(argv);
  const timeoutMs = parseCliPositiveInteger(argv, '--timeout-ms', 30000, 10 * 60 * 1000);
  const intervalMs = Math.max(100, parseCliPositiveInteger(argv, '--interval-ms', 500, 10000));
  const startedAt = Date.now();
  let attempts = 0;
  let lastList = null;
  do {
    attempts += 1;
    lastList = await listPermitsLiveOrLocalForCli(agentManager, argv);
    if (lastList && typeof lastList.code === 'string' && lastList.code.length > 0) {
      return Object.assign({}, lastList, { action: 'permit.wait' });
    }
    const matchedPermits = [];
    for (const permit of lastList.permits) {
      if (permitMatchesWaitTarget(permit, target)) {
        matchedPermits.push(permit);
      }
    }
    if (matchedPermits.length > 0) {
      return {
        ok: true,
        action: 'permit.wait',
        matched: true,
        timedOut: false,
        target,
        attempts,
        durationMs: Date.now() - startedAt,
        permits: matchedPermits,
        totalCount: lastList.totalCount,
        pendingCount: lastList.pendingCount,
        message: 'Permission request matched.'
      };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      break;
    }
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  } while (Date.now() - startedAt <= timeoutMs);
  return {
    code: 'permit_wait_timeout',
    action: 'permit.wait',
    matched: false,
    timedOut: true,
    target,
    attempts,
    durationMs: Date.now() - startedAt,
    permits: [],
    totalCount: lastList && typeof lastList.totalCount === 'number' ? lastList.totalCount : 0,
    pendingCount: lastList && typeof lastList.pendingCount === 'number' ? lastList.pendingCount : 0,
    message: 'Timed out waiting for a permission request.'
  };
}

function permitReplyForCli(command, argv) {
  const explicitReply = cliOptionValue(argv, '--reply', '');
  if (explicitReply.length > 0) {
    return explicitReply;
  }
  const decision = cliOptionValue(argv, '--decision', command);
  const normalized = decision.toLowerCase();
  if (command === 'deny' || normalized === 'deny' || normalized === 'reject' || normalized === 'rejected' || normalized === 'no') {
    return 'reject';
  }
  return 'once';
}

function permitResponsePayloadForCli(agentManager, argv, command) {
  const agentId = cliOptionValue(argv, '--agent-id', '');
  const agent = agentId.length > 0 ? agentManager.find(agentId) : null;
  const requestId = cliOptionValue(argv, '--request-id', cliOptionValue(argv, '--permission-id', cliPositionalValue(argv, 2, '')));
  const permissionId = cliOptionValue(argv, '--permission-id', requestId);
  return {
    agentId,
    providerId: cliOptionValue(argv, '--provider-id', agent ? agent.provider : ''),
    sessionId: cliOptionValue(argv, '--session-id', agent ? agent.providerSessionId : ''),
    requestId,
    permissionId,
    reply: permitReplyForCli(command, argv),
    message: cliOptionValue(argv, '--message', '')
  };
}

function permitMatchesResponseTarget(permit, argv) {
  const agentId = cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', ''));
  const kind = cliOptionValue(argv, '--kind', '');
  const requestId = cliOptionValue(argv, '--request-id', cliOptionValue(argv, '--permission-id', cliOptionValue(argv, '--plan-id', cliPositionalValue(argv, 2, ''))));
  return permitMatchesWaitTarget(permit, {
    agentId,
    kind,
    requestId,
    includeResolved: false
  });
}

function permitSelectionLabel(permit, index) {
  const requestId = permitRequestId(permit);
  const kind = readString(permit, 'kind', 'permission');
  const title = readString(permit, 'title', readString(permit, 'prompt', ''));
  const agentTitle = readString(permit, 'agentTitle', readString(permit, 'agentId', ''));
  return String(index + 1) + '. [' + kind + '] ' + requestId + (agentTitle.length > 0 ? ' / ' + agentTitle : '') + (title.length > 0 ? ' / ' + title : '');
}

function promptPermitSelectionForCli(permits) {
  return new Promise((resolve) => {
    const input = readline.createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write('Select a pending request:\n');
    for (let index = 0; index < permits.length; index += 1) {
      process.stderr.write(permitSelectionLabel(permits[index], index) + '\n');
    }
    input.question('Selection (1-' + String(permits.length) + ', empty to cancel): ', (answer) => {
      input.close();
      const selected = Number.parseInt(String(answer || '').trim(), 10);
      if (!Number.isFinite(selected) || selected < 1 || selected > permits.length) {
        resolve(null);
        return;
      }
      resolve(permits[selected - 1]);
    });
  });
}

async function permitsForResponseForCli(agentManager, argv) {
  const listed = await listPermitsLiveOrLocalForCli(agentManager, argv);
  if (listed && typeof listed.code === 'string' && listed.code.length > 0) {
    return { error: listed, permits: [] };
  }
  const candidates = [];
  const permits = listed && Array.isArray(listed.permits) ? listed.permits : [];
  for (const permit of permits) {
    if (permitMatchesResponseTarget(permit, argv)) {
      candidates.push(permit);
    }
  }
  return { error: null, permits: candidates };
}

function permitRequestTypeForKind(kind) {
  if (kind === 'question') {
    return RequestType.REQUEST_RESPOND;
  }
  if (kind === 'plan') {
    return RequestType.PLAN_RESPOND;
  }
  return RequestType.PERMISSION_RESPOND;
}

function permitPayloadForSelectedItem(agentManager, argv, command, permit) {
  const fallback = permitResponsePayloadForCli(agentManager, argv, command);
  const kind = readString(permit, 'kind', cliOptionValue(argv, '--kind', 'permission'));
  const requestId = permitRequestId(permit);
  const agentId = readString(permit, 'agentId', fallback.agentId);
  const providerId = readString(permit, 'providerId', fallback.providerId);
  const sessionId = readString(permit, 'sessionId', fallback.sessionId);
  const message = cliOptionValue(argv, '--message', cliOptionValue(argv, '--answer', ''));
  if (kind === 'question') {
    return {
      kind,
      requestType: RequestType.REQUEST_RESPOND,
      payload: {
        agentId,
        providerId,
        sessionId,
        requestId,
        optionId: command === 'deny' || command === 'reject'
          ? 'dismissed'
          : cliOptionValue(argv, '--option-id', cliOptionValue(argv, '--choice', '')),
        answer: command === 'deny' || command === 'reject' ? '' : cliOptionValue(argv, '--answer', message),
        message
      }
    };
  }
  if (kind === 'plan') {
    return {
      kind,
      requestType: RequestType.PLAN_RESPOND,
      payload: {
        agentId,
        providerId,
        sessionId,
        requestId,
        planId: readString(permit, 'planId', requestId),
        reply: command === 'deny' || command === 'reject'
          ? 'reject'
          : cliOptionValue(argv, '--reply', 'implement'),
        message
      }
    };
  }
  return {
    kind: 'permission',
    requestType: RequestType.PERMISSION_RESPOND,
    payload: {
      agentId,
      providerId,
      sessionId,
      requestId,
      permissionId: readString(permit, 'permissionId', requestId),
      reply: permitReplyForCli(command, argv),
      message
    }
  };
}

async function respondToPermitForCli(agentManager, argv, command, permit) {
  const routed = permitPayloadForSelectedItem(agentManager, argv, command, permit);
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, routed.requestType, routed.payload));
  const requestId = readString(routed.payload, 'requestId', readString(routed.payload, 'permissionId', readString(routed.payload, 'planId', '')));
  if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
    return Object.assign({
      ok: !rpcPayload || !rpcPayload.code,
      action: 'permit.' + command,
      kind: routed.kind,
      requestType: routed.requestType,
      agentId: readString(routed.payload, 'agentId', ''),
      requestId,
      reply: readString(routed.payload, 'reply', readString(routed.payload, 'optionId', readString(routed.payload, 'answer', '')))
    }, rpcPayload || {});
  }
  return Object.assign({
    ok: false,
    action: 'permit.' + command,
    kind: routed.kind,
    requestType: routed.requestType,
    requestId,
    failureCategory: rpcPayload.code || 'rpc_unavailable',
    remediation: 'Start the Bridge daemon or pass --host and --token/AGENT_BRIDGE_TOKEN so the CLI can reach the live provider session.'
  }, rpcPayload);
}

async function permitCommandForCli(agentManager, argv) {
  const command = argv.length > 1 ? argv[1] : 'list';
  if (command === 'list' || command === 'pending') {
    return await listPermitsLiveOrLocalForCli(agentManager, argv);
  }
  if (command === 'wait') {
    return await permitWaitForCli(agentManager, argv);
  }
  if (command === 'approve' || command === 'allow' || command === 'deny' || command === 'reject' || command === 'respond') {
    const normalizedCommand = command === 'allow' ? 'approve' : (command === 'reject' ? 'deny' : command);
    const selection = await permitsForResponseForCli(agentManager, argv);
    if (selection.error) {
      return Object.assign({}, selection.error, { action: 'permit.' + normalizedCommand });
    }
    let permits = selection.permits;
    if (permits.length === 0) {
      const directRequestId = cliOptionValue(argv, '--request-id', cliOptionValue(argv, '--permission-id', cliOptionValue(argv, '--plan-id', cliPositionalValue(argv, 2, ''))));
      if (directRequestId.length > 0) {
        const directKind = cliOptionValue(argv, '--kind', cliOptionValue(argv, '--plan-id', '').length > 0 ? 'plan' : 'permission');
        permits = [{
          agentId: cliOptionValue(argv, '--agent-id', ''),
          providerId: cliOptionValue(argv, '--provider-id', ''),
          sessionId: cliOptionValue(argv, '--session-id', ''),
          requestId: directRequestId,
          permissionId: cliOptionValue(argv, '--permission-id', directKind === 'permission' ? directRequestId : ''),
          planId: cliOptionValue(argv, '--plan-id', directKind === 'plan' ? directRequestId : ''),
          kind: directKind,
          status: 'pending'
        }];
      }
    }
    if (permits.length === 0) {
      return {
        ok: false,
        code: 'permit_not_found',
        failureCategory: 'permit_not_found',
        action: 'permit.' + normalizedCommand,
        message: 'No pending request matches the supplied agent, kind, or request id.',
        remediation: 'Run permit list to inspect pending requests.'
      };
    }
    if (!hasCliFlag(argv, '--all') && permits.length > 1) {
      if (process.stdin.isTTY && process.stderr.isTTY && !hasCliFlag(argv, '--no-interactive')) {
        const selected = await promptPermitSelectionForCli(permits);
        if (!selected) {
          return {
            ok: false,
            code: 'permit_selection_cancelled',
            failureCategory: 'permit_selection_cancelled',
            action: 'permit.' + normalizedCommand,
            message: 'Permission selection was cancelled.'
          };
        }
        permits = [selected];
      } else {
        return {
          ok: false,
          code: 'permit_selection_required',
          failureCategory: 'permit_selection_required',
          action: 'permit.' + normalizedCommand,
          candidates: permits,
          candidateCount: permits.length,
          message: 'Multiple pending requests match in non-interactive mode.',
          remediation: 'Pass --request-id, narrow with --agent-id/--kind, or explicitly use --all.'
        };
      }
    }
    const results = [];
    for (const permit of permits) {
      results.push(await respondToPermitForCli(agentManager, argv, normalizedCommand, permit));
    }
    if (results.length === 1) {
      return results[0];
    }
    let succeeded = 0;
    for (const item of results) {
      if (item && item.ok === true && !(typeof item.code === 'string' && item.code.length > 0)) {
        succeeded += 1;
      }
    }
    return {
      ok: succeeded === results.length,
      action: 'permit.' + normalizedCommand,
      all: true,
      attempted: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
      code: succeeded === results.length ? '' : 'permit_batch_partial_failure',
      failureCategory: succeeded === results.length ? '' : 'permit_batch_partial_failure'
    };
  }
  throw new Error('Unsupported permit command: ' + command);
}

function notificationWaitTargetForCli(argv) {
  return {
    notificationId: cliOptionValue(argv, '--notification-id', cliOptionValue(argv, '--id', '')),
    kind: cliOptionValue(argv, '--kind', ''),
    severity: cliOptionValue(argv, '--severity', ''),
    agentId: cliOptionValue(argv, '--agent-id', ''),
    terminalId: cliOptionValue(argv, '--terminal-id', ''),
    workspaceId: cliOptionValue(argv, '--workspace-id', ''),
    requestId: cliOptionValue(argv, '--request-id', ''),
    includeRead: hasCliFlag(argv, '--include-read')
  };
}

function notificationMatchesWaitTarget(notification, target) {
  if (!notification || !target) {
    return false;
  }
  if (!target.includeRead && notification.read === true) {
    return false;
  }
  if (target.notificationId.length > 0 && notification.notificationId !== target.notificationId) {
    return false;
  }
  if (target.kind.length > 0 && notification.kind !== target.kind) {
    return false;
  }
  if (target.severity.length > 0 && notification.severity !== target.severity) {
    return false;
  }
  if (target.agentId.length > 0 && notification.agentId !== target.agentId) {
    return false;
  }
  if (target.terminalId.length > 0 && notification.terminalId !== target.terminalId) {
    return false;
  }
  if (target.workspaceId.length > 0 && notification.workspaceId !== target.workspaceId) {
    return false;
  }
  if (target.requestId.length > 0) {
    const route = notification.route && typeof notification.route === 'object' && !Array.isArray(notification.route) ? notification.route : {};
    const routeRequestId = typeof route.requestId === 'string' ? route.requestId : '';
    if (routeRequestId !== target.requestId) {
      return false;
    }
  }
  return true;
}

async function notificationWaitForCli(notificationManager, argv) {
  const target = notificationWaitTargetForCli(argv);
  const timeoutMs = parseCliPositiveInteger(argv, '--timeout-ms', 30000, 10 * 60 * 1000);
  const intervalMs = Math.max(100, parseCliPositiveInteger(argv, '--interval-ms', 500, 10000));
  const startedAt = Date.now();
  let attempts = 0;
  let lastList = null;
  let lastSource = 'offline';
  let lastRpcFailureCategory = '';
  do {
    attempts += 1;
    const listPayload = {
      includeRead: target.includeRead,
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10)
    };
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.NOTIFICATION_LIST, listPayload));
    if (rpcPayload && rpcPayload.rpcUnavailable === true) {
      if (explicitRemoteCli(argv)) {
        return Object.assign(remoteFailureForCli(rpcPayload, 'notification.wait'), {
          target,
          attempts,
          durationMs: Date.now() - startedAt
        });
      }
      lastSource = 'offline';
      lastRpcFailureCategory = typeof rpcPayload.code === 'string' ? rpcPayload.code : 'rpc_unavailable';
      lastList = notificationManager.list(listPayload);
    } else if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
      return Object.assign(remoteFailureForCli(rpcPayload, 'notification.wait'), {
        target,
        attempts,
        durationMs: Date.now() - startedAt
      });
    } else if (rpcPayload && Array.isArray(rpcPayload.notifications)) {
      lastSource = 'live';
      lastRpcFailureCategory = '';
      lastList = rpcPayload;
    } else {
      return {
        ok: false,
        code: 'notification_list_invalid',
        failureCategory: 'notification_list_invalid',
        action: 'notification.wait',
        target,
        source: 'live',
        attempts,
        durationMs: Date.now() - startedAt,
        message: 'Bridge RPC returned an invalid notification list.'
      };
    }
    const matchedNotifications = [];
    for (const notification of lastList.notifications) {
      if (notificationMatchesWaitTarget(notification, target)) {
        matchedNotifications.push(notification);
      }
    }
    if (matchedNotifications.length > 0) {
      return {
        ok: true,
        action: 'notification.wait',
        matched: true,
        timedOut: false,
        target,
        source: lastSource,
        rpcFailureCategory: lastRpcFailureCategory,
        attempts,
        durationMs: Date.now() - startedAt,
        notifications: matchedNotifications,
        totalCount: lastList.totalCount,
        unreadCount: lastList.unreadCount,
        storePath: lastList.storePath,
        message: 'Notification matched.'
      };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      break;
    }
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  } while (Date.now() - startedAt <= timeoutMs);
  return {
    code: 'notification_wait_timeout',
    action: 'notification.wait',
    matched: false,
    timedOut: true,
    target,
    source: lastSource,
    rpcFailureCategory: lastRpcFailureCategory,
    attempts,
    durationMs: Date.now() - startedAt,
    notifications: [],
    totalCount: lastList && typeof lastList.totalCount === 'number' ? lastList.totalCount : 0,
    unreadCount: lastList && typeof lastList.unreadCount === 'number' ? lastList.unreadCount : 0,
    storePath: lastList && typeof lastList.storePath === 'string' ? lastList.storePath : '',
    message: 'Timed out waiting for a notification.'
  };
}

function gitPayloadFromCli(argv) {
  const cwd = path.resolve(cliOptionValue(argv, '--cwd', cliOptionValue(argv, '--path', process.cwd())));
  return {
    workspacePath: cwd,
    cwd,
    workspaceId: cliOptionValue(argv, '--workspace-id', '')
  };
}

function servicePayloadFromCli(argv, extra) {
  return Object.assign(gitPayloadFromCli(argv), extra || {});
}

function gitPlanControlFromCli(argv) {
  return {
    preview: hasCliFlag(argv, '--preview'),
    planId: cliOptionValue(argv, '--plan-id', ''),
    confirm: hasCliFlag(argv, '--confirm')
  };
}

function protectedGitOperationFromCli(command, payload) {
  if (command === 'discard' || command === 'pull' || command === 'merge') {
    return command;
  }
  if (command === 'push' && payload && payload.force === true) {
    return 'push.force';
  }
  const action = payload && typeof payload.action === 'string' ? payload.action : '';
  if (command === 'branch' && action === 'delete') {
    return 'branch.delete';
  }
  if (command === 'stash' && (action === 'pop' || action === 'drop')) {
    return 'stash.' + action;
  }
  return '';
}

function gitPlanCliFailure(argv, command, payload) {
  const operation = protectedGitOperationFromCli(command, payload);
  if (operation.length === 0) {
    return null;
  }
  const preview = hasCliFlag(argv, '--preview');
  const confirm = hasCliFlag(argv, '--confirm');
  const planId = cliOptionValue(argv, '--plan-id', '');
  if ((!confirm && preview) || (confirm && planId.length > 0)) {
    return null;
  }
  return {
    ok: false,
    code: 'git_plan_required',
    failureCategory: 'git_plan_required',
    action: 'git.' + operation,
    preview: false,
    confirmed: false,
    message: confirm
      ? 'Confirming this high-risk Git operation requires the plan id returned by preview.'
      : 'This high-risk Git operation must be previewed before it can be confirmed.',
    remediation: confirm
      ? 'Run the same command with --preview, review the result, then retry with --plan-id <id> --confirm.'
      : 'Retry with --preview. After reviewing the risks, retry with --plan-id <id> --confirm.'
  };
}

function githubPayloadFromCli(argv, extra) {
  return Object.assign(gitPayloadFromCli(argv), {
    owner: cliOptionValue(argv, '--owner', ''),
    repo: cliOptionValue(argv, '--repo', ''),
    repository: cliOptionValue(argv, '--repository', ''),
    apiBaseUrl: cliOptionValue(argv, '--api-base-url', ''),
    tokenEnv: cliOptionValue(argv, '--token-env', 'GITHUB_TOKEN'),
    remote: cliOptionValue(argv, '--remote', 'origin')
  }, extra || {});
}

async function githubCommandForCli(store, argv) {
  const area = argv.length > 1 ? argv[1] : '';
  const action = argv.length > 2 ? argv[2] : '';
  const client = new GitHubClient({ store });
  if (area === 'pr' && action === 'create') {
    return await client.createPullRequest(githubPayloadFromCli(argv, {
      head: cliOptionValue(argv, '--head', ''),
      base: cliOptionValue(argv, '--base', ''),
      title: cliOptionValue(argv, '--title', ''),
      body: cliOptionValue(argv, '--body', ''),
      draft: hasCliFlag(argv, '--draft'),
      dryRun: hasCliFlag(argv, '--dry-run')
    }));
  }
  if (area === 'pr' && action === 'status') {
    return await client.pullRequestStatus(githubPayloadFromCli(argv, {
      number: Number.parseInt(cliOptionValue(argv, '--number', argv.length > 3 ? argv[3] : '0'), 10)
    }));
  }
  if (area === 'pr' && action === 'merge') {
    return await client.mergePullRequest(githubPayloadFromCli(argv, {
      number: Number.parseInt(cliOptionValue(argv, '--number', argv.length > 3 ? argv[3] : '0'), 10),
      mergeMethod: cliOptionValue(argv, '--merge-method', 'merge'),
      commitTitle: cliOptionValue(argv, '--commit-title', ''),
      commitMessage: cliOptionValue(argv, '--commit-message', ''),
      confirm: hasCliFlag(argv, '--confirm'),
      dryRun: hasCliFlag(argv, '--dry-run')
    }));
  }
  if (area === 'checks' && action === 'list') {
    return await client.checksList(githubPayloadFromCli(argv, {
      sha: cliOptionValue(argv, '--sha', cliOptionValue(argv, '--ref', 'HEAD')),
      ref: cliOptionValue(argv, '--ref', '')
    }));
  }
  if (area === 'issue' && action === 'search') {
    return await client.issueSearch(githubPayloadFromCli(argv, {
      keyword: cliOptionValue(argv, '--keyword', cliOptionValue(argv, '--query', '')),
      state: cliOptionValue(argv, '--state', ''),
      labels: cliOptionValues(argv, '--label')
    }));
  }
  if (area === 'issue' && (action === 'attachments' || action === 'attachment-list')) {
    return await client.issueAttachmentList(githubPayloadFromCli(argv, {
      number: Number.parseInt(cliOptionValue(argv, '--number', argv.length > 3 ? argv[3] : '0'), 10)
    }));
  }
  throw new Error('Unsupported github command: ' + argv.join(' '));
}

function mcpConfigForCli(argv) {
  const savedProfile = loadProfile() || {};
  const host = cliOptionValue(argv, '--host', readString(savedProfile, 'bindHost', '127.0.0.1'));
  const port = parsePort(cliOptionValue(argv, '--port', ''), savedProfile && savedProfile.port ? savedProfile.port : 8787);
  const token = process.env.AGENT_BRIDGE_TOKEN || readString(savedProfile, 'token', '');
  return {
    host,
    port,
    token
  };
}

async function mcpCommandForCli(store, argv) {
  const command = argv.length > 1 ? argv[1] : '';
  const mode = argv.length > 2 ? argv[2] : '';
  const manager = new McpHostManager({
    store,
    config: mcpConfigForCli(argv)
  });
  if (command === 'tools') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.MCP_TOOLS_LIST, {}));
    return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : manager.listTools();
  }
  if (command === 'server' && mode === 'start') {
    const bridgeUrl = cliOptionValue(argv, '--bridge-url', httpBridgeUrl(mcpConfigForCli(argv)));
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.MCP_SERVER_START, {
      bridgeUrl
    }));
    return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : manager.start({
      bridgeUrl
    });
  }
  if (command === 'server' && mode === 'stop') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.MCP_SERVER_STOP, {}));
    return !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : manager.stop({});
  }
  if (command === 'server' && (mode === 'status' || mode.length === 0)) {
    return manager.status();
  }
  throw new Error('Unsupported mcp command: ' + argv.join(' '));
}

function workspaceOpenForCli(workspaceRegistry, argv) {
  const target = cliOptionValue(argv, '--id', cliOptionValue(argv, '--workspace-id', cliOptionValue(argv, '--path', argv.length > 2 ? argv[2] : '')));
  if (target.length === 0) {
    throw new Error('workspace open requires --path or --workspace-id.');
  }
  const targetIsPath = path.isAbsolute(target) || target.indexOf(':') >= 0 || hasCliFlag(argv, '--path');
  return workspaceRegistry.openWorkspace({
    workspaceId: targetIsPath ? '' : target,
    workspacePath: targetIsPath ? target : '',
    dryRun: hasCliFlag(argv, '--dry-run') || !hasCliFlag(argv, '--confirm'),
    preview: !hasCliFlag(argv, '--confirm'),
    confirm: hasCliFlag(argv, '--confirm'),
    includeArchived: hasCliFlag(argv, '--include-archived')
  }, {
    commandForPath: (workspacePath) => openFileCommandForPlatform(workspacePath, process.platform),
    openPath: (workspacePath) => openFile(workspacePath)
  });
}

function checkpointCaptureForCli(fileCheckpointStore, agentManager, agentId, argv) {
  if (!hasCliFlag(argv, '--include-files')) {
    return {};
  }
  const record = agentManager.find(agentId);
  if (!record) {
    return {};
  }
  return fileCheckpointStore.capture(record, {
    reason: 'cli_checkpoint'
  });
}

function restoreFileSnapshotForCli(fileCheckpointStore, snapshotId, argv) {
  const dryRun = hasCliFlag(argv, '--dry-run');
  const confirm = hasCliFlag(argv, '--confirm');
  const forceConflicts = hasCliFlag(argv, '--force-conflicts');
  if (dryRun || !confirm) {
    return fileCheckpointStore.restore(snapshotId, {
      dryRun,
      confirm,
      forceConflicts
    });
  }
  const plan = fileCheckpointStore.restore(snapshotId, {
    dryRun: true,
    confirm: false,
    forceConflicts
  });
  return fileCheckpointStore.restore(snapshotId, {
    dryRun: false,
    confirm: true,
    forceConflicts,
    restorePlanId: plan.restorePlanId || ''
  });
}

function restoreCheckpointForCli(fileCheckpointStore, agentManager, agentId, checkpointId, argv) {
  const preRestoreSnapshotId = cliOptionValue(argv, '--pre-restore', cliOptionValue(argv, '--pre-restore-snapshot-id', ''));
  if (preRestoreSnapshotId.length > 0) {
    const record = agentManager.find(agentId);
    if (!record) {
      return {
        code: 'agent_not_found',
        message: 'Agent not found.'
      };
    }
    const fileRestore = restoreFileSnapshotForCli(fileCheckpointStore, preRestoreSnapshotId, argv);
    return {
      agent: agentManager.publicRecord(record),
      checkpoint: null,
      dryRun: hasCliFlag(argv, '--dry-run') || !hasCliFlag(argv, '--confirm') || fileRestore.restoreBlocked === true,
      fileSnapshotStatus: preRestoreSnapshotId.length > 0 ? 'captured' : 'not_found',
      fileSnapshotId: preRestoreSnapshotId,
      conflicts: Array.isArray(fileRestore.conflicts) ? fileRestore.conflicts : [],
      restoreBlocked: fileRestore.restoreBlocked === true,
      preRestoreSnapshotId: fileRestore.preRestoreSnapshotId || '',
      restorePlanId: fileRestore.restorePlanId || '',
      manifestVerified: fileRestore.manifestVerified === true,
      filesSkipped: typeof fileRestore.filesSkipped === 'number' ? fileRestore.filesSkipped : 0,
      filesRestored: typeof fileRestore.filesRestored === 'number' ? fileRestore.filesRestored : 0,
      filesVerified: typeof fileRestore.filesVerified === 'number' ? fileRestore.filesVerified : 0,
      verifyErrors: Array.isArray(fileRestore.verifyErrors) ? fileRestore.verifyErrors : [],
      workspaceRoot: readString(fileRestore, 'workspaceRoot', ''),
      filePolicy: fileRestore.filePolicy && typeof fileRestore.filePolicy === 'object' && !Array.isArray(fileRestore.filePolicy) ? fileRestore.filePolicy : {},
      skippedReasons: Array.isArray(fileRestore.skippedReasons) ? fileRestore.skippedReasons : [],
      runtimeRestored: false,
      runtimeRestoreReason: readString(fileRestore, 'runtimeRestoreReason', 'provider_runtime_state_is_recorded_not_rewound'),
      fileRestore,
      restored: {
        conversation: false,
        files: fileRestore.files === true,
        reason: typeof fileRestore.status === 'string' ? fileRestore.status : 'file_restore'
      }
    };
  }
  const checkpoint = agentManager.findCheckpoint(agentId, checkpointId);
  if (!checkpoint) {
    return {
      code: 'checkpoint_not_found',
      message: 'Checkpoint not found.'
    };
  }
  const restoreFiles = hasCliFlag(argv, '--restore-files');
  let fileRestore = null;
  if (restoreFiles && checkpoint.fileSnapshotId.length > 0) {
    fileRestore = restoreFileSnapshotForCli(fileCheckpointStore, checkpoint.fileSnapshotId, argv);
  }
  return agentManager.restoreCheckpoint(agentId, checkpointId, {
    dryRun: hasCliFlag(argv, '--dry-run') || (restoreFiles && (!hasCliFlag(argv, '--confirm') || (fileRestore && fileRestore.restoreBlocked === true))),
    fileRestore
  });
}

function optionCountFromProfile(profile, key) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return 0;
  }
  const value = profile[key];
  return Array.isArray(value) ? value.length : 0;
}

function providerCapabilityCounts(provider) {
  const source = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {};
  return {
    models: Array.isArray(source.models) ? source.models.length : 0,
    speedModes: Array.isArray(source.speedModes) ? source.speedModes.length : 0,
    reasoningModes: Array.isArray(source.reasoningModes) ? source.reasoningModes.length : 0,
    interactionModes: Array.isArray(source.interactionModes) ? source.interactionModes.length : 0,
    tools: Array.isArray(source.tools) ? source.tools.length : 0
  };
}

function providerCapabilitiesSummary(catalog, mode, rpcUnavailable) {
  const source = catalog && typeof catalog === 'object' && !Array.isArray(catalog) ? catalog : {};
  const providers = Array.isArray(source.providers) ? source.providers : [];
  const summaries = [];
  for (const provider of providers) {
    const item = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {};
    summaries.push({
      id: readString(item, 'id', ''),
      displayName: readString(item, 'displayName', readString(item, 'id', '')),
      status: readString(item, 'status', ''),
      capabilitySource: readString(item, 'capabilitySource', ''),
      capabilityStatus: readString(item, 'capabilityStatus', ''),
      lastDiscoveredAt: typeof item.lastDiscoveredAt === 'number' ? item.lastDiscoveredAt : 0,
      warnings: Array.isArray(item.discoveryWarnings) ? item.discoveryWarnings : [],
      errors: Array.isArray(item.discoveryErrors) ? item.discoveryErrors : [],
      counts: providerCapabilityCounts(item)
    });
  }
  return {
    mode,
    rpcUnavailable: rpcUnavailable === true,
    scope: readString(source, 'scope', 'global'),
    cwd: readString(source, 'cwd', ''),
    cacheStatus: readString(source, 'cacheStatus', ''),
    cacheTtlMs: typeof source.cacheTtlMs === 'number' ? source.cacheTtlMs : 0,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
    degradedProviders: typeof source.degradedProviders === 'number' ? source.degradedProviders : 0,
    discoveryWarnings: Array.isArray(source.discoveryWarnings) ? source.discoveryWarnings : [],
    discoveryErrors: Array.isArray(source.discoveryErrors) ? source.discoveryErrors : [],
    providers: summaries
  };
}

function offlineProviderCapabilitiesForCli(store, argv, mode) {
  const savedProfile = loadProfile();
  return scanProviders(savedProfile || {}, { deep: hasCliFlag(argv, '--deep') }).then((scanResults) => {
    const providers = [];
    for (const scan of scanResults) {
      providers.push({
        id: scan.id,
        displayName: scan.displayName,
        status: scan.installed || scan.serverHealthy ? 'available' : 'unavailable',
        capabilitySource: scan.installed || scan.serverHealthy ? 'runtime' : 'fallback',
        capabilityStatus: scan.installed || scan.serverHealthy ? 'ready' : 'degraded',
        lastDiscoveredAt: Date.now(),
        discoveryWarnings: scan.installed || scan.serverHealthy ? [] : ['Provider command or server was not discovered by offline scan.'],
        discoveryErrors: [],
        models: [],
        speedModes: [],
        reasoningModes: [],
        interactionModes: [],
        tools: []
      });
    }
    for (const profile of store.readProviderProfiles()) {
      const runtimeProviderId = 'profile.' + cliSafeSegment(readString(profile, 'profileId', readString(profile, 'providerId', 'custom')));
      providers.push({
        id: runtimeProviderId,
        displayName: readString(profile, 'displayName', runtimeProviderId),
        status: readBoolean(profile, 'enabled', true) ? 'configured' : 'disabled',
        capabilitySource: optionCountFromProfile(profile, 'models') > 0 ||
          optionCountFromProfile(profile, 'tools') > 0 ||
          optionCountFromProfile(profile, 'speedModes') > 0 ||
          optionCountFromProfile(profile, 'reasoningModes') > 0 ||
          optionCountFromProfile(profile, 'interactionModes') > 0 ? 'profile' : 'fallback',
        capabilityStatus: readBoolean(profile, 'enabled', true) ? 'ready' : 'degraded',
        lastDiscoveredAt: Date.now(),
        discoveryWarnings: readBoolean(profile, 'enabled', true) ? [] : ['Provider profile is disabled.'],
        discoveryErrors: [],
        models: Array.isArray(profile.models) ? profile.models : [],
        speedModes: Array.isArray(profile.speedModes) ? profile.speedModes : [],
        reasoningModes: Array.isArray(profile.reasoningModes) ? profile.reasoningModes : [],
        interactionModes: Array.isArray(profile.interactionModes) ? profile.interactionModes : [],
        tools: Array.isArray(profile.tools) ? profile.tools : []
      });
    }
    return providerCapabilitiesSummary({
      scope: 'offline',
      cwd: '',
      cacheStatus: mode === 'refresh' ? 'offline-refresh' : 'offline',
      cacheTtlMs: 0,
      updatedAt: Date.now(),
      degradedProviders: 0,
      discoveryWarnings: [],
      discoveryErrors: [],
      providers
    }, mode, true);
  });
}

async function providerCapabilitiesForCli(store, argv, mode) {
  const requestType = mode === 'refresh' ? RequestType.PROVIDER_CATALOG_REFRESH : RequestType.PROVIDER_CATALOG;
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, requestType, {
    scope: cliOptionValue(argv, '--scope', 'global'),
    cwd: cliOptionValue(argv, '--cwd', ''),
    force: mode === 'refresh' || hasCliFlag(argv, '--force')
  }));
  const action = mode === 'refresh' ? 'provider.refresh' : 'provider.capabilities';
  if (rpcPayload && rpcPayload.rpcUnavailable === true) {
    if (explicitRemoteCli(argv)) {
      return remoteFailureForCli(rpcPayload, action);
    }
    return await offlineProviderCapabilitiesForCli(store, argv, mode);
  }
  if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
    return remoteFailureForCli(rpcPayload, action);
  }
  if (rpcPayload && typeof rpcPayload === 'object' && !Array.isArray(rpcPayload)) {
    return providerCapabilitiesSummary(rpcPayload, mode, false);
  }
  return {
    ok: false,
    code: 'provider_catalog_invalid',
    failureCategory: 'provider_catalog_invalid',
    action,
    message: 'Bridge RPC returned an invalid provider catalog.'
  };
}

function remoteWorkspacePayloadFromCli(argv, extra) {
  const cwd = cliOptionValue(argv, '--cwd', cliOptionValue(argv, '--path', ''));
  return Object.assign({
    workspacePath: cwd,
    cwd,
    workspaceId: cliOptionValue(argv, '--workspace-id', ''),
    sessionId: cliOptionValue(argv, '--session-id', '')
  }, extra || {});
}

function remoteGithubPayloadFromCli(argv, extra) {
  return Object.assign(remoteWorkspacePayloadFromCli(argv), {
    owner: cliOptionValue(argv, '--owner', ''),
    repo: cliOptionValue(argv, '--repo', ''),
    repository: cliOptionValue(argv, '--repository', ''),
    apiBaseUrl: cliOptionValue(argv, '--api-base-url', ''),
    tokenEnv: cliOptionValue(argv, '--token-env', 'GITHUB_TOKEN'),
    remote: cliOptionValue(argv, '--remote', 'origin')
  }, extra || {});
}

function relayCommandForCli(argv) {
  const command = cliPositionalValue(argv, 1, 'status');
  const action = cliPositionalValue(argv, 2, '');
  let requestType = '';
  const payload = {
    relayUrl: cliOptionValue(argv, '--url', cliOptionValue(argv, '--relay-url', '')),
    relayId: cliOptionValue(argv, '--relay-id', ''),
    offerId: cliOptionValue(argv, '--offer-id', ''),
    deviceId: cliOptionValue(argv, '--device-id', command === 'revoke' ? cliPositionalValue(argv, 2, '') : ''),
    reason: cliOptionValue(argv, '--reason', ''),
    planId: cliOptionValue(argv, '--plan-id', ''),
    ttlMs: parseCliPositiveInteger(argv, '--ttl-ms', 300000, 900000),
    includeRevoked: hasCliFlag(argv, '--include-revoked'),
    confirm: hasCliFlag(argv, '--confirm')
  };
  let operation = command;
  if (command === 'status') {
    requestType = RequestType.RELAY_STATUS;
  } else if (command === 'pairing' && action === 'start') {
    requestType = RequestType.RELAY_PAIRING_START;
    operation = 'pairing.start';
  } else if (command === 'pairing' && action === 'cancel') {
    requestType = RequestType.RELAY_PAIRING_CANCEL;
    operation = 'pairing.cancel';
  } else if (command === 'connect') {
    requestType = RequestType.RELAY_CONNECT;
  } else if (command === 'disconnect') {
    requestType = RequestType.RELAY_DISCONNECT;
  } else if (command === 'devices') {
    requestType = RequestType.RELAY_DEVICE_LIST;
  } else if (command === 'revoke') {
    requestType = RequestType.RELAY_DEVICE_REVOKE;
  } else if (command === 'identity' && action === 'rotate') {
    requestType = RequestType.RELAY_IDENTITY_ROTATE;
    operation = 'identity.rotate';
  }
  return { requestType, payload, operation };
}

function m7CommandForCli(group, argv) {
  const command = cliPositionalValue(argv, 1, 'status');
  const subcommand = cliPositionalValue(argv, 2, '');
  const targetId = cliOptionValue(argv, '--id', cliOptionValue(argv, '--' + group + '-id', subcommand));
  const common = {
    planId: cliOptionValue(argv, '--plan-id', ''),
    confirm: hasCliFlag(argv, '--confirm'),
    query: cliOptionValue(argv, '--query', ''),
    limit: parseCliPositiveInteger(argv, '--limit', 50, 500)
  };
  const optionPresent = (name) => argv.includes(name);
  if (group === 'schedule') {
    const cadence = {
      type: 'cron',
      expression: cliOptionValue(argv, '--cron', ''),
      timezone: cliOptionValue(argv, '--timezone', 'UTC')
    };
    const payload = Object.assign({}, common, {
      scheduleId: targetId,
      name: cliOptionValue(argv, '--name', ''),
      prompt: cliOptionValue(argv, '--prompt', ''),
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      workspacePath: cliOptionValue(argv, '--workspace-path', cliOptionValue(argv, '--cwd', '')),
      providerId: cliOptionValue(argv, '--provider-id', cliOptionValue(argv, '--provider', '')),
      modelId: cliOptionValue(argv, '--model-id', cliOptionValue(argv, '--model', '')),
      enabled: !hasCliFlag(argv, '--disabled'),
      cadence,
      concurrency: {
        limit: parseCliPositiveInteger(argv, '--concurrency', 1, 20),
        overlapPolicy: cliOptionValue(argv, '--overlap-policy', 'skip')
      },
      retry: {
        maxAttempts: parseCliPositiveInteger(argv, '--max-attempts', 1, 10),
        initialDelayMs: parseCliPositiveInteger(argv, '--retry-delay-ms', 1000, 3600000),
        backoffMultiplier: Number.parseFloat(cliOptionValue(argv, '--retry-multiplier', '2'))
      },
      retention: {
        maxRuns: parseCliPositiveInteger(argv, '--retain-runs', 100, 5000),
        maxAgeDays: parseCliPositiveInteger(argv, '--retain-days', 30, 3650)
      },
      missedRunPolicy: cliOptionValue(argv, '--missed-run-policy', 'run_once'),
      before: cliOptionValue(argv, '--before', '')
    });
    if (command !== 'create') {
      if (!optionPresent('--name')) delete payload.name;
      if (!optionPresent('--prompt')) delete payload.prompt;
      if (!optionPresent('--workspace-id')) delete payload.workspaceId;
      if (!optionPresent('--workspace-path') && !optionPresent('--cwd')) delete payload.workspacePath;
      if (!optionPresent('--provider-id') && !optionPresent('--provider')) delete payload.providerId;
      if (!optionPresent('--model-id') && !optionPresent('--model')) delete payload.modelId;
      if (!optionPresent('--disabled')) delete payload.enabled;
      if (!optionPresent('--cron')) delete payload.cadence;
      if (!optionPresent('--concurrency') && !optionPresent('--overlap-policy')) delete payload.concurrency;
      if (!optionPresent('--max-attempts') && !optionPresent('--retry-delay-ms') && !optionPresent('--retry-multiplier')) delete payload.retry;
      if (!optionPresent('--retain-runs') && !optionPresent('--retain-days')) delete payload.retention;
      if (!optionPresent('--missed-run-policy')) delete payload.missedRunPolicy;
    }
    const mappings = {
      status: RequestType.SCHEDULE_STATUS,
      list: RequestType.SCHEDULE_LIST,
      get: RequestType.SCHEDULE_GET,
      create: RequestType.SCHEDULE_CREATE,
      update: RequestType.SCHEDULE_UPDATE,
      enable: RequestType.SCHEDULE_ENABLE,
      disable: RequestType.SCHEDULE_DISABLE,
      'run-now': RequestType.SCHEDULE_RUN_NOW,
      history: RequestType.SCHEDULE_HISTORY,
      remove: RequestType.SCHEDULE_REMOVE
    };
    return { requestType: mappings[command] || '', payload, operation: command };
  }
  if (group === 'loop') {
    const criteria = cliOptionValues(argv, '--criterion').map((description, index) => ({ id: 'criterion_' + String(index + 1), description }));
    const payload = Object.assign({}, common, {
      loopId: targetId,
      name: cliOptionValue(argv, '--name', ''),
      prompt: cliOptionValue(argv, '--prompt', ''),
      verifyPrompt: cliOptionValue(argv, '--verify-prompt', ''),
      acceptanceCriteria: criteria,
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      workspacePath: cliOptionValue(argv, '--workspace-path', cliOptionValue(argv, '--cwd', '')),
      sourceAgentId: cliOptionValue(argv, '--source-agent-id', ''),
      workerProviderId: cliOptionValue(argv, '--worker-provider', cliOptionValue(argv, '--provider', '')),
      workerModelId: cliOptionValue(argv, '--worker-model', ''),
      verifierProviderId: cliOptionValue(argv, '--verifier-provider', cliOptionValue(argv, '--provider', '')),
      verifierModelId: cliOptionValue(argv, '--verifier-model', ''),
      workspaceMode: cliOptionValue(argv, '--workspace-mode', 'isolated'),
      maxRounds: parseCliPositiveInteger(argv, '--max-rounds', 5, 100),
      budget: {
        maxTokens: Number.parseInt(cliOptionValue(argv, '--max-tokens', '0'), 10),
        maxCost: Number.parseFloat(cliOptionValue(argv, '--max-cost', '0')),
        currency: cliOptionValue(argv, '--currency', ''),
        maxDurationMs: Number.parseInt(cliOptionValue(argv, '--max-duration-ms', '0'), 10)
      },
      offset: Number.parseInt(cliOptionValue(argv, '--offset', '0'), 10)
    });
    if (command === 'update') {
      if (!optionPresent('--name')) delete payload.name;
      if (!optionPresent('--prompt')) delete payload.prompt;
      if (!optionPresent('--verify-prompt')) delete payload.verifyPrompt;
      if (!optionPresent('--criterion')) delete payload.acceptanceCriteria;
      if (!optionPresent('--workspace-id')) delete payload.workspaceId;
      if (!optionPresent('--workspace-path') && !optionPresent('--cwd')) delete payload.workspacePath;
      if (!optionPresent('--source-agent-id')) delete payload.sourceAgentId;
      if (!optionPresent('--worker-provider') && !optionPresent('--provider')) delete payload.workerProviderId;
      if (!optionPresent('--worker-model')) delete payload.workerModelId;
      if (!optionPresent('--verifier-provider') && !optionPresent('--provider')) delete payload.verifierProviderId;
      if (!optionPresent('--verifier-model')) delete payload.verifierModelId;
      if (!optionPresent('--workspace-mode')) delete payload.workspaceMode;
      if (!optionPresent('--max-rounds')) delete payload.maxRounds;
      if (!optionPresent('--max-tokens') && !optionPresent('--max-cost') && !optionPresent('--currency') && !optionPresent('--max-duration-ms')) delete payload.budget;
    }
    const mappings = {
      status: RequestType.LOOP_STATUS,
      list: RequestType.LOOP_LIST,
      get: RequestType.LOOP_GET,
      create: RequestType.LOOP_CREATE,
      update: RequestType.LOOP_UPDATE,
      start: RequestType.LOOP_START,
      pause: RequestType.LOOP_PAUSE,
      resume: RequestType.LOOP_RESUME,
      stop: RequestType.LOOP_STOP,
      takeover: RequestType.LOOP_TAKEOVER,
      rounds: RequestType.LOOP_ROUNDS,
      remove: RequestType.LOOP_REMOVE
    };
    return { requestType: mappings[command] || '', payload, operation: command };
  }
  if (group === 'chat') {
    let operation = command;
    let requestType = '';
    const roomId = cliOptionValue(argv, '--room-id', command === 'room' ? cliPositionalValue(argv, 3, '') : targetId);
    const memberAction = command === 'member' ? subcommand : '';
    const messageAction = command === 'message' ? subcommand : '';
    const payload = Object.assign({}, common, {
      roomId,
      name: cliOptionValue(argv, '--name', ''),
      purpose: cliOptionValue(argv, '--purpose', ''),
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      includeArchived: hasCliFlag(argv, '--include-archived'),
      memberId: cliOptionValue(argv, '--member-id', cliPositionalValue(argv, 3, '')),
      role: cliOptionValue(argv, '--role', ''),
      member: {
        memberId: cliOptionValue(argv, '--member-id', cliPositionalValue(argv, 3, '')),
        type: cliOptionValue(argv, '--member-type', cliOptionValue(argv, '--agent-id', '').length > 0 ? 'agent' : 'human'),
        agentId: cliOptionValue(argv, '--agent-id', ''),
        displayName: cliOptionValue(argv, '--display-name', ''),
        role: cliOptionValue(argv, '--role', '')
      },
      clientMessageId: cliOptionValue(argv, '--client-message-id', randomId('cli_chat')),
      body: cliOptionValue(argv, '--body', cliOptionValue(argv, '--message', '')),
      replyToMessageId: cliOptionValue(argv, '--reply-to', ''),
      mentionMemberIds: cliOptionValues(argv, '--mention'),
      afterSeq: Number.parseInt(cliOptionValue(argv, '--after-seq', '0'), 10),
      beforeSeq: Number.parseInt(cliOptionValue(argv, '--before-seq', '0'), 10),
      lastSeq: Number.parseInt(cliOptionValue(argv, '--last-seq', '0'), 10)
    });
    if (command === 'status') requestType = RequestType.CHAT_ROOM_STATUS;
    else if (command === 'list') requestType = RequestType.CHAT_ROOM_LIST;
    else if (command === 'get') requestType = RequestType.CHAT_ROOM_GET;
    else if (command === 'create') requestType = RequestType.CHAT_ROOM_CREATE;
    else if (command === 'update') requestType = RequestType.CHAT_ROOM_UPDATE;
    else if (command === 'archive') requestType = RequestType.CHAT_ROOM_ARCHIVE;
    else if (command === 'member' && memberAction === 'add') { requestType = RequestType.CHAT_ROOM_MEMBER_ADD; operation = 'member.add'; }
    else if (command === 'member' && memberAction === 'update') { requestType = RequestType.CHAT_ROOM_MEMBER_UPDATE; operation = 'member.update'; }
    else if (command === 'member' && memberAction === 'remove') { requestType = RequestType.CHAT_ROOM_MEMBER_REMOVE; operation = 'member.remove'; }
    else if (command === 'message' && messageAction === 'post') { requestType = RequestType.CHAT_ROOM_MESSAGE_POST; operation = 'message.post'; }
    else if (command === 'message' && messageAction === 'list') { requestType = RequestType.CHAT_ROOM_MESSAGE_LIST; operation = 'message.list'; }
    else if (command === 'ack') requestType = RequestType.CHAT_ROOM_ACK;
    return { requestType, payload, operation };
  }
  return { requestType: '', payload: common, operation: command };
}

function voiceCommandForCli(argv) {
  const command = cliPositionalValue(argv, 1, 'status');
  const subcommand = cliPositionalValue(argv, 2, '');
  const payload = {
    sessionId: cliOptionValue(argv, '--session-id', ''),
    requestId: cliOptionValue(argv, '--request-id', ''),
    sequence: Number.parseInt(cliOptionValue(argv, '--sequence', '0'), 10),
    audioBase64: cliOptionValue(argv, '--audio-base64', ''),
    text: cliOptionValue(argv, '--text', ''),
    mimeType: cliOptionValue(argv, '--mime-type', 'audio/pcm'),
    language: cliOptionValue(argv, '--language', ''),
    voiceId: cliOptionValue(argv, '--voice-id', ''),
    format: cliOptionValue(argv, '--format', 'audio/mpeg'),
    sampleRate: Number.parseInt(cliOptionValue(argv, '--sample-rate', '16000'), 10),
    channels: Number.parseInt(cliOptionValue(argv, '--channels', '1'), 10),
    confirm: hasCliFlag(argv, '--confirm')
  };
  let requestType = RequestType.VOICE_STATUS;
  let operation = command;
  if (command === 'session' && subcommand === 'start') { requestType = RequestType.VOICE_SESSION_START; operation = 'session.start'; }
  else if (command === 'session' && subcommand === 'chunk') { requestType = RequestType.VOICE_SESSION_CHUNK; operation = 'session.chunk'; }
  else if (command === 'session' && (subcommand === 'finish' || subcommand === 'finalize')) { requestType = RequestType.VOICE_SESSION_FINISH; operation = 'session.finish'; }
  else if (command === 'session' && subcommand === 'cancel') { requestType = RequestType.VOICE_SESSION_CANCEL; operation = 'session.cancel'; }
  else if (command === 'tts' && (subcommand === 'speak' || subcommand === 'start')) { requestType = RequestType.VOICE_TTS_SPEAK; operation = 'tts.speak'; }
  else if (command === 'tts' && (subcommand === 'stop' || subcommand === 'cancel')) { requestType = RequestType.VOICE_TTS_STOP; operation = 'tts.stop'; }
  return { requestType, payload, operation };
}

function workspaceServiceCommandForCli(argv) {
  const command = cliPositionalValue(argv, 1, 'list');
  const serviceId = cliOptionValue(argv, '--service-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')));
  const mappings = {
    list: RequestType.WORKSPACE_SERVICE_LIST,
    upsert: RequestType.WORKSPACE_SERVICE_UPSERT,
    status: RequestType.WORKSPACE_SERVICE_STATUS,
    health: RequestType.WORKSPACE_SERVICE_HEALTH,
    open: RequestType.WORKSPACE_SERVICE_OPEN,
    start: RequestType.WORKSPACE_SERVICE_START,
    stop: RequestType.WORKSPACE_SERVICE_STOP,
    logs: RequestType.WORKSPACE_SERVICE_LOGS,
    remove: RequestType.WORKSPACE_SERVICE_REMOVE
  };
  return {
    requestType: mappings[command] || '',
    operation: command,
    payload: {
      serviceId,
      name: cliOptionValue(argv, '--name', ''),
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      ownerAgentId: cliOptionValue(argv, '--owner-agent-id', cliOptionValue(argv, '--agent-id', '')),
      command: cliOptionValue(argv, '--command', ''),
      args: cliOptionValues(argv, '--arg'),
      cwd: cliOptionValue(argv, '--cwd', ''),
      port: Number.parseInt(cliOptionValue(argv, '--port', '0'), 10),
      protocol: cliOptionValue(argv, '--protocol', 'http'),
      health: { kind: cliOptionValue(argv, '--health-kind', 'tcp'), path: cliOptionValue(argv, '--health-path', '/health'), timeoutMs: Number.parseInt(cliOptionValue(argv, '--health-timeout-ms', '1500'), 10) },
      visibility: cliOptionValue(argv, '--visibility', 'workspace'),
      lifecycle: cliOptionValue(argv, '--lifecycle', 'workspace'),
      environmentNames: cliOptionValues(argv, '--env-name'),
      planId: cliOptionValue(argv, '--plan-id', ''),
      confirm: hasCliFlag(argv, '--confirm'),
      maxBytes: parseCliPositiveInteger(argv, '--max-bytes', 65536, 1024 * 1024)
    }
  };
}

function browserCommandForCli(argv) {
  const area = cliPositionalValue(argv, 1, 'host');
  const operation = cliPositionalValue(argv, 2, 'list');
  let requestType = '';
  if (area === 'host' && operation === 'list') requestType = RequestType.BROWSER_HOST_LIST;
  else if (area === 'instance' && operation === 'list') requestType = RequestType.BROWSER_INSTANCE_LIST;
  else if (area === 'instance' && operation === 'create') requestType = RequestType.BROWSER_INSTANCE_CREATE;
  else if (area === 'instance' && operation === 'close') requestType = RequestType.BROWSER_INSTANCE_CLOSE;
  else if (area === 'page' && operation === 'list') requestType = RequestType.BROWSER_PAGE_LIST;
  else if (area === 'page' && operation === 'create') requestType = RequestType.BROWSER_PAGE_CREATE;
  else if (area === 'page' && operation === 'close') requestType = RequestType.BROWSER_PAGE_CLOSE;
  else if (area === 'page' && ['navigate', 'back', 'forward', 'reload'].includes(operation)) requestType = RequestType.BROWSER_PAGE_NAVIGATE;
  else if (area === 'page' && operation === 'snapshot') requestType = RequestType.BROWSER_PAGE_SNAPSHOT;
  else if (area === 'page' && operation === 'screenshot') requestType = RequestType.BROWSER_PAGE_SCREENSHOT;
  else if (area === 'page' && operation === 'logs') requestType = RequestType.BROWSER_PAGE_LOGS;
  else if (area === 'page' && operation === 'wait') requestType = RequestType.BROWSER_PAGE_WAIT;
  else if (area === 'page' && operation === 'action') requestType = RequestType.BROWSER_PAGE_ACTION;
  else if (area === 'action') requestType = RequestType.BROWSER_PAGE_ACTION;
  else if (area === 'download' && operation === 'list') requestType = RequestType.BROWSER_DOWNLOAD_LIST;
  else if (area === 'permission' && (operation === 'get' || operation === 'status')) requestType = RequestType.BROWSER_PERMISSION_GET;
  else if (area === 'permission' && operation === 'set') requestType = RequestType.BROWSER_PERMISSION_SET;
  const actionKind = area === 'action' ? operation : cliOptionValue(argv, '--action', '');
  const navigationOperation = area === 'page' && ['back', 'forward', 'reload'].includes(operation) ? operation : cliOptionValue(argv, '--operation', 'navigate');
  return {
    requestType,
    operation: area + '.' + operation,
    payload: {
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      agentId: cliOptionValue(argv, '--agent-id', ''),
      hostId: cliOptionValue(argv, '--host-id', ''),
      instanceId: cliOptionValue(argv, '--instance-id', ''),
      pageId: cliOptionValue(argv, '--page-id', ''),
      profile: cliOptionValue(argv, '--profile', ''),
      url: cliOptionValue(argv, '--url', ''),
      operation: navigationOperation,
      action: actionKind,
      ref: cliOptionValue(argv, '--ref', ''),
      sourceRef: cliOptionValue(argv, '--source-ref', ''),
      targetRef: cliOptionValue(argv, '--target-ref', ''),
      value: cliOptionValue(argv, '--value', ''),
      text: cliOptionValue(argv, '--text', ''),
      key: cliOptionValue(argv, '--key', ''),
      function: cliOptionValue(argv, '--function', ''),
      filePaths: cliOptionValues(argv, '--file'),
      domains: cliOptionValues(argv, '--domain'),
      deltaX: Number.parseFloat(cliOptionValue(argv, '--delta-x', '0')),
      deltaY: Number.parseFloat(cliOptionValue(argv, '--delta-y', '0')),
      timeoutMs: parseCliPositiveInteger(argv, '--timeout-ms', 30000, 120000),
      maxEntries: parseCliPositiveInteger(argv, '--max-entries', 100, 1000),
      fullPage: hasCliFlag(argv, '--full-page'),
      planId: cliOptionValue(argv, '--plan-id', ''),
      confirm: hasCliFlag(argv, '--confirm')
    }
  };
}

async function explicitRemoteRpcForCli(argv, requestType, payload, action) {
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, requestType, payload));
  if (rpcPayload && rpcPayload.rpcUnavailable === true) {
    return remoteFailureForCli(rpcPayload, action);
  }
  if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
    return remoteFailureForCli(rpcPayload, action);
  }
  if (rpcPayload && typeof rpcPayload === 'object' && !Array.isArray(rpcPayload)) {
    return Object.assign({ action }, rpcPayload);
  }
  return {
    ok: false,
    code: 'rpc_empty_response',
    failureCategory: 'rpc_empty_response',
    action,
    message: 'Remote Bridge RPC returned no payload.'
  };
}

function remoteAgentPayloadForCli(argv, fallbackIndex) {
  const fallbackAgentId = typeof fallbackIndex === 'number' && fallbackIndex >= 0
    ? cliPositionalValue(argv, fallbackIndex, '')
    : '';
  return {
    agentId: cliOptionValue(argv, '--agent-id', cliOptionValue(argv, '--id', fallbackAgentId)),
    providerId: cliOptionValue(argv, '--provider-id', cliOptionValue(argv, '--provider', '')),
    workspaceId: cliOptionValue(argv, '--workspace-id', ''),
    workspacePath: cliOptionValue(argv, '--workspace-path', cliOptionValue(argv, '--cwd', '')),
    cwd: cliOptionValue(argv, '--cwd', cliOptionValue(argv, '--workspace-path', '')),
    title: cliOptionValue(argv, '--title', cliOptionValue(argv, '--name', '')),
    modelId: cliOptionValue(argv, '--model-id', cliOptionValue(argv, '--model', '')),
    speedMode: cliOptionValue(argv, '--mode-id', cliOptionValue(argv, '--mode', '')),
    modeId: cliOptionValue(argv, '--mode-id', cliOptionValue(argv, '--mode', '')),
    reasoningMode: cliOptionValue(argv, '--thinking', cliOptionValue(argv, '--reasoning-mode', '')),
    thinkingOptionId: cliOptionValue(argv, '--thinking', cliOptionValue(argv, '--reasoning-mode', '')),
    parentAgentId: cliOptionValue(argv, '--parent-agent-id', ''),
    detached: hasCliFlag(argv, '--detached')
  };
}

async function liveManagementRpcForCli(argv, requestType, payload, action) {
  const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, requestType, payload));
  if (rpcPayload && rpcPayload.rpcUnavailable === true) {
    return {
      ok: false,
      code: 'live_bridge_required',
      failureCategory: 'live_bridge_required',
      rpcFailureCategory: typeof rpcPayload.code === 'string' ? rpcPayload.code : 'rpc_unavailable',
      action,
      target: typeof rpcPayload.target === 'string' ? rpcPayload.target : '',
      message: 'This command requires a running Bridge daemon because it controls live runtime state.',
      remediation: 'Start ngf-agent-bridge, configure its token, and retry the command.'
    };
  }
  if (rpcPayload && typeof rpcPayload.code === 'string' && rpcPayload.code.length > 0) {
    return remoteFailureForCli(rpcPayload, action);
  }
  if (rpcPayload && typeof rpcPayload === 'object' && !Array.isArray(rpcPayload)) {
    return Object.assign({ action }, rpcPayload);
  }
  return {
    ok: false,
    code: 'rpc_empty_response',
    failureCategory: 'rpc_empty_response',
    action,
    message: 'Bridge RPC returned no payload.'
  };
}

async function remoteCheckpointCommandForCli(argv) {
  const action = argv.length > 2 ? argv[2] : 'list';
  const agentId = cliAgentId(argv, 3);
  if (agentId.length === 0) {
    return {
      ok: false,
      code: 'agent_id_required',
      failureCategory: 'agent_id_required',
      action: 'checkpoint.' + action,
      message: 'agent checkpoint requires an agent id.'
    };
  }
  if (action === 'list' || action === 'inspect') {
    const listed = await explicitRemoteRpcForCli(argv, RequestType.CHECKPOINT_LIST, { agentId }, 'checkpoint.list');
    if (action !== 'inspect' || listed.code) {
      return listed;
    }
    const checkpointId = cliOptionValue(argv, '--checkpoint-id', cliPositionalValue(argv, 4, ''));
    const checkpoints = Array.isArray(listed.checkpoints) ? listed.checkpoints : [];
    for (const checkpoint of checkpoints) {
      if (checkpoint && checkpoint.checkpointId === checkpointId) {
        return {
          ok: true,
          action: 'checkpoint.inspect',
          checkpoint,
          fileSnapshotInspectable: false,
          message: 'Checkpoint metadata is available; file manifest details are included when the Bridge checkpoint record exposes them.'
        };
      }
    }
    return {
      ok: false,
      code: 'checkpoint_not_found',
      failureCategory: 'checkpoint_not_found',
      action: 'checkpoint.inspect',
      checkpointId,
      message: 'Checkpoint not found.'
    };
  }
  if (action === 'create') {
    return await explicitRemoteRpcForCli(argv, RequestType.CHECKPOINT_CREATE, {
      agentId,
      title: cliOptionValue(argv, '--title', ''),
      description: cliOptionValue(argv, '--description', ''),
      includeFiles: hasCliFlag(argv, '--include-files')
    }, 'checkpoint.create');
  }
  if (action === 'restore') {
    const checkpointId = cliOptionValue(argv, '--checkpoint-id', cliPositionalValue(argv, 4, ''));
    const preRestoreSnapshotId = cliOptionValue(argv, '--pre-restore', cliOptionValue(argv, '--pre-restore-snapshot-id', ''));
    const restoreFiles = hasCliFlag(argv, '--restore-files') || preRestoreSnapshotId.length > 0;
    const confirm = hasCliFlag(argv, '--confirm');
    const forceConflicts = hasCliFlag(argv, '--force-conflicts');
    const basePayload = {
      agentId,
      checkpointId,
      preRestoreSnapshotId,
      restoreFiles,
      restoreRuntime: hasCliFlag(argv, '--restore-runtime'),
      requireRuntimeRestore: hasCliFlag(argv, '--require-runtime-restore'),
      forceConflicts,
      restorePlanId: cliOptionValue(argv, '--restore-plan-id', '')
    };
    if (!confirm || hasCliFlag(argv, '--dry-run')) {
      return await explicitRemoteRpcForCli(argv, RequestType.CHECKPOINT_RESTORE, Object.assign({}, basePayload, {
        dryRun: true,
        confirm: false
      }), 'checkpoint.restore');
    }
    if (restoreFiles && basePayload.restorePlanId.length === 0) {
      const preview = await explicitRemoteRpcForCli(argv, RequestType.CHECKPOINT_RESTORE, Object.assign({}, basePayload, {
        dryRun: true,
        confirm: false
      }), 'checkpoint.restore.preview');
      if (preview.code) {
        return preview;
      }
      if (preview.restoreBlocked === true && !forceConflicts) {
        return preview;
      }
      basePayload.restorePlanId = readString(preview, 'restorePlanId', '');
    }
    return await explicitRemoteRpcForCli(argv, RequestType.CHECKPOINT_RESTORE, Object.assign({}, basePayload, {
      dryRun: false,
      confirm: true
    }), 'checkpoint.restore');
  }
  return null;
}

async function remoteProviderEnvForCli(argv) {
  const profileId = cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')));
  if (profileId.length === 0) {
    return {
      ok: false,
      code: 'provider_profile_id_missing',
      failureCategory: 'provider_profile_id_missing',
      action: 'provider.env',
      message: 'provider env requires --profile-id.'
    };
  }
  const edits = providerEnvEditsFromCli(argv);
  const envMutations = [];
  for (const item of edits.setValues) {
    const splitAt = item.indexOf('=');
    if (splitAt > 0) {
      envMutations.push({
        operation: 'set',
        key: item.substring(0, splitAt),
        source: 'secure_store',
        value: item.substring(splitAt + 1)
      });
    }
  }
  for (const key of edits.unsetValues) {
    if (key.length > 0) {
      envMutations.push({ operation: 'remove', key });
    }
  }
  return await explicitRemoteRpcForCli(argv, RequestType.PROVIDER_PROFILE_UPSERT, {
    profileId,
    envMutations
  }, 'provider.env');
}

async function remoteSecurityCommandForCli(argv) {
  const command = argv.length > 1 ? argv[1] : 'devices';
  const action = argv.length > 2 ? argv[2] : 'status';
  if (command === 'devices' || command === 'list') {
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_DEVICE_LIST, {}, 'security.devices');
  }
  if (command === 'trust') {
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_DEVICE_TRUST, {
      physicalDeviceId: cliOptionValue(argv, '--device-id', cliOptionValue(argv, '--physical-device-id', '')),
      publicKeyFingerprint: cliOptionValue(argv, '--fingerprint', cliOptionValue(argv, '--key-fingerprint', '')),
      displayName: cliOptionValue(argv, '--name', 'Trusted device')
    }, 'security.device.trust');
  }
  if (command === 'revoke') {
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_DEVICE_REVOKE, {
      physicalDeviceId: cliOptionValue(argv, '--device-id', cliOptionValue(argv, '--physical-device-id', '')),
      publicKeyFingerprint: cliOptionValue(argv, '--fingerprint', cliOptionValue(argv, '--key-fingerprint', ''))
    }, 'security.device.revoke');
  }
  if (command === 'audit') {
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_AUDIT_LIST, {
      limit: parseCliPositiveInteger(argv, '--limit', 100, 1000),
      severity: cliOptionValue(argv, '--severity', ''),
      category: cliOptionValue(argv, '--category', '')
    }, 'security.audit');
  }
  if (command === 'hosts') {
    if (action === 'status' || action.length === 0) {
      return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_HOSTS_STATUS, {}, 'security.hosts.status');
    }
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_HOSTS_SET, securityHostsPayloadForCli(argv, action), 'security.hosts.' + action);
  }
  if (command === 'token') {
    return await explicitRemoteRpcForCli(argv, action === 'rotate' ? RequestType.SECURITY_TOKEN_ROTATE : RequestType.SECURITY_TOKEN_STATUS, {}, 'security.token.' + action);
  }
  if (command === 'tls') {
    if (action !== 'set') {
      return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_TLS_STATUS, {}, 'security.tls.status');
    }
    const current = await explicitRemoteRpcForCli(argv, RequestType.SECURITY_TLS_STATUS, {}, 'security.tls.status');
    if (current.code) {
      return current;
    }
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_TLS_SET, {
      enabled: hasCliFlag(argv, '--enable') ? true : (hasCliFlag(argv, '--disable') ? false : cliBooleanOption(argv, '--enabled', current.enabled === true)),
      certPath: cliOptionValue(argv, '--cert', cliOptionValue(argv, '--cert-path', readString(current, 'certPath', ''))),
      keyPath: cliOptionValue(argv, '--key', cliOptionValue(argv, '--key-path', readString(current, 'keyPath', ''))),
      caPath: cliOptionValue(argv, '--ca', cliOptionValue(argv, '--ca-path', readString(current, 'caPath', '')))
    }, 'security.tls.set');
  }
  if (command === 'auth') {
    if (action !== 'set') {
      return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_AUTH_STATUS, {}, 'security.auth.status');
    }
    const current = await explicitRemoteRpcForCli(argv, RequestType.SECURITY_AUTH_STATUS, {}, 'security.auth.status');
    if (current.code) {
      return current;
    }
    const localStore = createDaemonStore();
    let authPayload = null;
    try {
      authPayload = await securityAuthSetPayloadForCli(localStore, argv);
    } catch (error) {
      return securityAuthCliFailure(error);
    }
    if (!hasCliFlag(argv, '--mode')) {
      authPayload.mode = readString(current, 'mode', 'bearer');
    }
    return await explicitRemoteRpcForCli(argv, RequestType.SECURITY_AUTH_SET, authPayload, 'security.auth.set');
  }
  if (command === 'doctor') {
    return await explicitRemoteRpcForCli(argv, RequestType.DAEMON_HEALTH, {}, 'security.doctor');
  }
  return null;
}

function deferredExplicitRemoteCommand(group, command, argv) {
  if (group === 'permit') {
    return true;
  }
  if (group === 'agent' && (command === 'logs' || command === 'wait' || command === 'status' || command === 'attach' || command === 'send')) {
    return true;
  }
  if (group === 'terminal' && (command === 'logs' || command === 'follow' || command === 'list')) {
    return true;
  }
  if (group === 'provider' && (command === 'capabilities' || command === 'refresh')) {
    return true;
  }
  if (group === 'notification' && command === 'wait') {
    return true;
  }
  return false;
}

async function explicitRemoteManagementCommandForCli(argv) {
  const group = argv[0];
  const command = argv.length > 1 ? argv[1] : '';
  if (deferredExplicitRemoteCommand(group, command, argv)) {
    return { deferred: true, result: null };
  }
  let requestType = '';
  let payload = {};
  let action = group + '.' + command;
  if (group === 'agent') {
    const agentPayload = remoteAgentPayloadForCli(argv, command === 'run' || command === 'create' ? -1 : 2);
    if (command === 'list' || command === 'doctor') {
      const listed = await explicitRemoteRpcForCli(argv, RequestType.AGENT_LIST, {
        includeArchived: command === 'doctor' || hasCliFlag(argv, '--include-archived')
      }, 'agent.' + command);
      return {
        deferred: false,
        result: command === 'doctor' && !listed.code
          ? Object.assign({ action: 'agent.doctor' }, listed.relationshipDoctor || { checks: [], status: 'unknown' })
          : listed
      };
    }
    if (command === 'run' || command === 'create') {
      requestType = command === 'run' ? RequestType.AGENT_RUN : RequestType.AGENT_CREATE;
      payload = Object.assign(agentPayload, {
        text: cliOptionValue(argv, '--text', cliOptionValue(argv, '--message', cliPositionalValue(argv, 2, '')))
      });
    } else if (command === 'stop') {
      requestType = RequestType.AGENT_STOP;
      payload = agentPayload;
    } else if (command === 'resume') {
      requestType = RequestType.AGENT_RESUME;
      payload = agentPayload;
    } else if (command === 'delete') {
      requestType = RequestType.AGENT_DELETE;
      payload = agentPayload;
    } else if (command === 'update' || command === 'rename') {
      requestType = RequestType.AGENT_UPDATE;
      payload = agentPayload;
    } else if (command === 'mode') {
      requestType = RequestType.AGENT_MODE_SET;
      payload = Object.assign(agentPayload, {
        modeId: cliOptionValue(argv, '--mode-id', cliPositionalValue(argv, 3, '')),
        thinkingOptionId: cliOptionValue(argv, '--thinking', '')
      });
    } else if (command === 'model') {
      requestType = RequestType.AGENT_MODEL_SET;
      payload = Object.assign(agentPayload, {
        modelId: cliOptionValue(argv, '--model-id', cliPositionalValue(argv, 3, ''))
      });
    } else if (command === 'attention-clear' || (command === 'attention' && cliPositionalValue(argv, 2, '') === 'clear')) {
      requestType = RequestType.AGENT_ATTENTION_CLEAR;
      payload = { agentId: cliOptionValue(argv, '--agent-id', command === 'attention' ? cliPositionalValue(argv, 3, '') : cliPositionalValue(argv, 2, '')) };
    } else if (command === 'archive') {
      requestType = RequestType.AGENT_ARCHIVE;
      payload = Object.assign(agentPayload, { cascade: hasCliFlag(argv, '--cascade') });
    } else if (command === 'fork') {
      requestType = RequestType.AGENT_FORK;
      payload = Object.assign(agentPayload, {
        checkpointId: cliOptionValue(argv, '--checkpoint-id', ''),
        boundaryMessageId: cliOptionValue(argv, '--boundary-message-id', ''),
        timelineEpoch: parseCliPositiveInteger(argv, '--timeline-epoch', 0, 2147483647),
        timelineSeq: parseCliPositiveInteger(argv, '--timeline-seq', 0, Number.MAX_SAFE_INTEGER),
        workspaceMode: cliOptionValue(argv, '--workspace-mode', hasCliFlag(argv, '--isolated') ? 'isolated' : 'shared'),
        worktreePath: cliOptionValue(argv, '--worktree-path', ''),
        branch: cliOptionValue(argv, '--branch', ''),
        startPoint: cliOptionValue(argv, '--start-point', ''),
        setupCommand: cliOptionValue(argv, '--setup-command', ''),
        preview: hasCliFlag(argv, '--preview'),
        confirm: hasCliFlag(argv, '--confirm'),
        forkPlanId: cliOptionValue(argv, '--fork-plan-id', '')
      });
    } else if (command === 'detach') {
      requestType = RequestType.AGENT_DETACH;
      payload = agentPayload;
    } else if (command === 'checkpoint') {
      return { deferred: false, result: await remoteCheckpointCommandForCli(argv) };
    }
  } else if (group === 'terminal') {
    const terminalId = cliOptionValue(argv, '--terminal-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')));
    if (command === 'create') {
      requestType = RequestType.TERMINAL_CREATE;
      payload = {
        terminalId: cliOptionValue(argv, '--terminal-id', ''),
        workspaceId: cliOptionValue(argv, '--workspace-id', ''),
        cwd: cliOptionValue(argv, '--cwd', ''),
        name: cliOptionValue(argv, '--name', ''),
        rows: parseCliPositiveInteger(argv, '--rows', 24, 80),
        cols: parseCliPositiveInteger(argv, '--cols', 80, 240)
      };
    } else if (command === 'capture') {
      requestType = RequestType.TERMINAL_CAPTURE;
      payload = { terminalId };
    } else if (command === 'rename') {
      requestType = RequestType.TERMINAL_RENAME;
      payload = { terminalId, name: cliOptionValue(argv, '--name', cliPositionalValue(argv, 3, '')) };
    } else if (command === 'kill') {
      requestType = RequestType.TERMINAL_KILL;
      payload = { terminalId };
    } else if (command === 'hook') {
      const hookAction = argv.length > 2 ? argv[2] : 'status';
      requestType = hookAction === 'status' ? RequestType.TERMINAL_HOOK_STATUS : RequestType.TERMINAL_HOOK_INSTALL;
      payload = {
        action: hookAction,
        confirm: hasCliFlag(argv, '--confirm'),
        shell: cliOptionValue(argv, '--shell', ''),
        profilePath: cliOptionValue(argv, '--profile-path', '')
      };
      action = 'terminal.hook.' + hookAction;
    }
  } else if (group === 'provider') {
    if (command === 'directory') {
      const directoryAction = cliPositionalValue(argv, 2, 'list');
      const providerId = cliOptionValue(argv, '--provider-id', cliOptionValue(argv, '--profile-id', cliPositionalValue(argv, 3, '')));
      if (directoryAction === 'refresh') {
        requestType = RequestType.PROVIDER_DIRECTORY_REFRESH;
        payload = { url: cliOptionValue(argv, '--url', '') };
      } else if (directoryAction === 'status') {
        requestType = RequestType.PROVIDER_DIRECTORY_STATUS;
        payload = { providerId };
      } else if (directoryAction === 'install') {
        requestType = RequestType.PROVIDER_DIRECTORY_INSTALL;
        payload = { providerId, planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') };
      } else if (directoryAction === 'rollback') {
        requestType = RequestType.PROVIDER_DIRECTORY_ROLLBACK;
        payload = { providerId, planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') };
      } else if (directoryAction === 'remove') {
        requestType = RequestType.PROVIDER_DIRECTORY_REMOVE;
        payload = { providerId, profileId: providerId, planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') };
      } else {
        requestType = RequestType.PROVIDER_DIRECTORY_LIST;
        payload = { query: cliOptionValue(argv, '--query', ''), providerId };
      }
      action = 'provider.directory.' + directoryAction;
    } else if (command === 'usage') {
      requestType = RequestType.PROVIDER_USAGE_LIST;
      payload = {
        providerId: cliOptionValue(argv, '--provider-id', cliPositionalValue(argv, 2, '')),
        sessionId: cliOptionValue(argv, '--session-id', ''),
        agentId: cliOptionValue(argv, '--agent-id', ''),
        window: cliOptionValue(argv, '--window', 'session')
      };
      action = 'provider.usage.list';
    } else if (command === 'list') {
      requestType = RequestType.PROVIDER_PROFILE_LIST;
      action = 'provider.profile.list';
    } else if (command === 'discover' || command === 'import') {
      const catalogPath = cliOptionValue(argv, '--path', cliPositionalValue(argv, 2, ''));
      requestType = command === 'discover' ? RequestType.PROVIDER_ACP_DISCOVER : RequestType.PROVIDER_ACP_IMPORT;
      payload = {
        catalogPath,
        confirm: command === 'import' && hasCliFlag(argv, '--confirm'),
        duplicatePolicy: hasCliFlag(argv, '--replace') ? 'replace' : cliOptionValue(argv, '--duplicate-policy', 'skip'),
        selectedProfileIds: cliOptionValues(argv, '--profile-id').concat(cliOptionValues(argv, '--provider-id'))
      };
      action = 'provider.acp.' + command;
    } else if (command === 'upsert') {
      requestType = RequestType.PROVIDER_PROFILE_UPSERT;
      payload = cliObjectFromArgs(argv);
      action = 'provider.profile.upsert';
    } else if (command === 'clone') {
      requestType = RequestType.PROVIDER_PROFILE_UPSERT;
      payload = Object.assign(cliObjectFromArgs(argv), {
        cloneFromProfileId: cliOptionValue(argv, '--from', cliOptionValue(argv, '--source-profile-id', cliPositionalValue(argv, 2, ''))),
        baseProfileId: cliOptionValue(argv, '--base-profile-id', '')
      });
      action = 'provider.profile.clone';
    } else if (command === 'env') {
      return { deferred: false, result: await remoteProviderEnvForCli(argv) };
    } else if (command === 'delete') {
      requestType = RequestType.PROVIDER_PROFILE_DELETE;
      payload = { profileId: cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, ''))) };
      action = 'provider.profile.delete';
    } else if (command === 'test') {
      requestType = RequestType.PROVIDER_PROFILE_TEST;
      payload = Object.assign(cliObjectFromArgs(argv), {
        profileId: cliOptionValue(argv, '--profile-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, ''))),
        runCommand: hasCliFlag(argv, '--run'),
        testArgs: cliOptionValue(argv, '--test-args', '--version'),
        timeoutMs: parseCliPositiveInteger(argv, '--timeout-ms', 3000, 10000)
      });
      action = 'provider.profile.test';
    }
  } else if (group === 'workspace') {
    if (command === 'list') {
      requestType = RequestType.WORKSPACE_REGISTRY_LIST;
      payload = { includeArchived: hasCliFlag(argv, '--include-archived'), limit: parseCliPositiveInteger(argv, '--limit', 12, 500) };
    } else if (command === 'create' || command === 'import' || command === 'upsert') {
      requestType = command === 'create'
        ? RequestType.WORKSPACE_REGISTRY_CREATE
        : (command === 'import' ? RequestType.WORKSPACE_REGISTRY_IMPORT : RequestType.WORKSPACE_REGISTRY_UPSERT);
      const workspacePath = cliOptionValue(argv, '--path', cliOptionValue(argv, '--cwd', cliPositionalValue(argv, 2, '')));
      payload = {
        workspacePath,
        cwd: workspacePath,
        workspaceId: cliOptionValue(argv, '--workspace-id', ''),
        workspaceTitle: cliOptionValue(argv, '--title', ''),
        title: cliOptionValue(argv, '--title', ''),
        kind: cliOptionValue(argv, '--kind', 'directory'),
        branch: cliOptionValue(argv, '--branch', ''),
        dedupeByCwd: !hasCliFlag(argv, '--no-dedupe'),
        preview: command === 'upsert' ? false : !hasCliFlag(argv, '--confirm'),
        confirm: command === 'upsert' ? true : hasCliFlag(argv, '--confirm')
      };
    } else if (command === 'archive') {
      requestType = RequestType.WORKSPACE_REGISTRY_ARCHIVE;
      const explicitWorkspaceId = cliOptionValue(argv, '--workspace-id', cliOptionValue(argv, '--id', ''));
      const explicitWorkspacePath = cliOptionValue(argv, '--path', '');
      const positionalWorkspaceId = explicitWorkspaceId.length === 0 && explicitWorkspacePath.length === 0
        ? cliPositionalValue(argv, 2, '')
        : '';
      payload = {
        workspaceId: explicitWorkspaceId.length > 0 ? explicitWorkspaceId : positionalWorkspaceId,
        workspacePath: explicitWorkspacePath,
        cwd: explicitWorkspacePath,
        preview: !hasCliFlag(argv, '--confirm'),
        confirm: hasCliFlag(argv, '--confirm'),
        includeArchived: true
      };
    } else if (command === 'suggestions') {
      requestType = RequestType.WORKSPACE_REGISTRY_SUGGESTIONS;
      payload = { limit: parseCliPositiveInteger(argv, '--limit', 12, 500) };
    } else if (command === 'open') {
      requestType = RequestType.WORKSPACE_REGISTRY_OPEN;
      payload = {
        workspaceId: cliOptionValue(argv, '--workspace-id', cliOptionValue(argv, '--id', '')),
        workspacePath: cliOptionValue(argv, '--path', cliPositionalValue(argv, 2, '')),
        preview: !hasCliFlag(argv, '--confirm'),
        confirm: hasCliFlag(argv, '--confirm'),
        dryRun: hasCliFlag(argv, '--dry-run') || !hasCliFlag(argv, '--confirm')
      };
    } else if (command === 'doctor') {
      requestType = RequestType.WORKSPACE_REGISTRY_DOCTOR;
      payload = { includeArchived: true };
    }
  } else if (group === 'worktree') {
    const worktreePath = cliOptionValue(argv, '--worktree-path', cliOptionValue(argv, '--path', cliPositionalValue(argv, 2, '')));
    if (command === 'list') {
      requestType = RequestType.WORKTREE_LIST;
      payload = remoteWorkspacePayloadFromCli(argv, { includeArchived: hasCliFlag(argv, '--include-archived') });
    } else if (command === 'create') {
      requestType = RequestType.WORKTREE_CREATE;
      payload = remoteWorkspacePayloadFromCli(argv, {
        worktreePath,
        path: worktreePath,
        branch: cliOptionValue(argv, '--branch', ''),
        startPoint: cliOptionValue(argv, '--start-point', ''),
        title: cliOptionValue(argv, '--title', ''),
        setupCommand: cliOptionValue(argv, '--setup-command', ''),
        preview: !hasCliFlag(argv, '--confirm'),
        confirm: hasCliFlag(argv, '--confirm'),
        sourceWorkspaceId: cliOptionValue(argv, '--source-workspace-id', cliOptionValue(argv, '--workspace-id', '')),
        sourceRootPath: cliOptionValue(argv, '--source-root-path', cliOptionValue(argv, '--cwd', ''))
      });
    } else if (command === 'archive') {
      requestType = RequestType.WORKTREE_ARCHIVE;
      payload = remoteWorkspacePayloadFromCli(argv, {
        worktreePath,
        path: worktreePath,
        force: hasCliFlag(argv, '--force'),
        teardownCommand: cliOptionValue(argv, '--teardown-command', ''),
        preview: !hasCliFlag(argv, '--confirm'),
        confirm: hasCliFlag(argv, '--confirm')
      });
    }
  } else if (group === 'git') {
    if (command === 'status') {
      requestType = RequestType.WORKSPACE_CHANGES_GET;
      payload = remoteWorkspacePayloadFromCli(argv);
      action = 'git.status';
    } else if (command === 'stage' || command === 'unstage' || command === 'discard') {
      requestType = command === 'stage'
        ? RequestType.WORKSPACE_GIT_STAGE
        : (command === 'unstage' ? RequestType.WORKSPACE_GIT_UNSTAGE : RequestType.WORKSPACE_GIT_DISCARD);
      payload = remoteWorkspacePayloadFromCli(argv, {
        paths: cliOptionValues(argv, '--file').concat(cliOptionValues(argv, '--path-spec')),
        path: cliOptionValue(argv, '--file', cliOptionValue(argv, '--path-spec', '')),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'commit') {
      requestType = RequestType.WORKSPACE_GIT_COMMIT;
      payload = remoteWorkspacePayloadFromCli(argv, {
        message: cliOptionValue(argv, '--message', cliOptionValue(argv, '-m', cliPositionalValue(argv, 2, ''))),
        amend: hasCliFlag(argv, '--amend')
      });
    } else if (command === 'pull') {
      requestType = RequestType.WORKSPACE_GIT_PULL;
      payload = remoteWorkspacePayloadFromCli(argv, {
        remote: cliOptionValue(argv, '--remote', ''),
        branch: cliOptionValue(argv, '--branch', ''),
        ffOnly: !hasCliFlag(argv, '--no-ff-only'),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'push') {
      requestType = RequestType.WORKSPACE_GIT_PUSH;
      payload = remoteWorkspacePayloadFromCli(argv, {
        remote: cliOptionValue(argv, '--remote', ''),
        branch: cliOptionValue(argv, '--branch', ''),
        force: hasCliFlag(argv, '--force'),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'branch') {
      requestType = RequestType.WORKSPACE_GIT_BRANCH;
      payload = remoteWorkspacePayloadFromCli(argv, {
        action: cliPositionalValue(argv, 2, cliOptionValue(argv, '--action', 'list')),
        name: cliOptionValue(argv, '--name', cliPositionalValue(argv, 3, '')),
        startPoint: cliOptionValue(argv, '--start-point', ''),
        force: hasCliFlag(argv, '--force'),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'stash') {
      requestType = RequestType.WORKSPACE_GIT_STASH;
      payload = remoteWorkspacePayloadFromCli(argv, {
        action: cliPositionalValue(argv, 2, cliOptionValue(argv, '--action', 'list')),
        message: cliOptionValue(argv, '--message', ''),
        ref: cliOptionValue(argv, '--ref', cliPositionalValue(argv, 3, '')),
        includeUntracked: !hasCliFlag(argv, '--no-include-untracked'),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'merge') {
      requestType = RequestType.WORKSPACE_GIT_MERGE;
      payload = remoteWorkspacePayloadFromCli(argv, {
        ref: cliOptionValue(argv, '--ref', cliOptionValue(argv, '--branch', cliPositionalValue(argv, 2, ''))),
        noCommit: hasCliFlag(argv, '--no-commit'),
        ffOnly: hasCliFlag(argv, '--ff-only'),
        preview: hasCliFlag(argv, '--preview'),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (command === 'subscribe') {
      return {
        deferred: false,
        result: {
          ok: false,
          code: 'remote_stream_transport_required',
          failureCategory: 'remote_stream_transport_required',
          action: 'git.subscribe',
          message: 'Git subscriptions require a persistent WebSocket connection; one-shot HTTP CLI RPC cannot retain subscription state.',
          remediation: 'Use the App, an MCP client with persistent transport, or a future CLI watch transport.'
        }
      };
    }
    const planFailure = gitPlanCliFailure(argv, command, payload);
    if (planFailure) {
      return { deferred: false, result: planFailure };
    }
  } else if (group === 'github') {
    const area = argv.length > 1 ? argv[1] : '';
    const githubAction = argv.length > 2 ? argv[2] : '';
    if (area === 'auth' && githubAction === 'start') {
      requestType = RequestType.GITHUB_AUTH_DEVICE_START;
      payload = { clientId: cliOptionValue(argv, '--client-id', '') };
    } else if (area === 'auth' && githubAction === 'poll') {
      requestType = RequestType.GITHUB_AUTH_DEVICE_POLL;
      payload = { authSessionId: cliOptionValue(argv, '--session-id', cliPositionalValue(argv, 3, '')) };
    } else if (area === 'auth' && githubAction === 'status') {
      requestType = RequestType.GITHUB_AUTH_STATUS;
      payload = { accountId: cliOptionValue(argv, '--account-id', '') };
    } else if (area === 'auth' && githubAction === 'logout') {
      requestType = RequestType.GITHUB_AUTH_LOGOUT;
      payload = { accountId: cliOptionValue(argv, '--account-id', '') };
    } else if (area === 'account' && githubAction === 'list') {
      requestType = RequestType.GITHUB_ACCOUNT_LIST;
      payload = {};
    } else if (area === 'binding' && githubAction === 'get') {
      requestType = RequestType.GITHUB_BINDING_GET;
      payload = remoteGithubPayloadFromCli(argv, { hostProfileId: cliOptionValue(argv, '--host-profile-id', '') });
    } else if (area === 'binding' && githubAction === 'set') {
      requestType = RequestType.GITHUB_BINDING_SET;
      payload = remoteGithubPayloadFromCli(argv, { hostProfileId: cliOptionValue(argv, '--host-profile-id', ''), accountId: cliOptionValue(argv, '--account-id', ''), confirm: hasCliFlag(argv, '--confirm') });
    } else if (area === 'pr' && githubAction === 'list') {
      requestType = RequestType.GITHUB_PR_LIST;
      payload = remoteGithubPayloadFromCli(argv, { state: cliOptionValue(argv, '--state', 'open'), page: Number.parseInt(cliOptionValue(argv, '--page', '1'), 10), perPage: Number.parseInt(cliOptionValue(argv, '--per-page', '30'), 10) });
    } else if (area === 'pr' && githubAction === 'update') {
      requestType = RequestType.GITHUB_PR_UPDATE;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', '0'), 10), title: cliOptionValue(argv, '--title', ''), body: cliOptionValue(argv, '--body', ''), state: cliOptionValue(argv, '--state', ''), ready: hasCliFlag(argv, '--ready'), planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') });
    } else if (area === 'pr' && githubAction === 'reviewers') {
      requestType = RequestType.GITHUB_PR_REVIEWERS_UPDATE;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', '0'), 10), reviewers: cliOptionValues(argv, '--reviewer'), planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') });
    } else if (area === 'pr' && githubAction === 'labels') {
      requestType = RequestType.GITHUB_PR_LABELS_UPDATE;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', '0'), 10), labels: cliOptionValues(argv, '--label'), planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') });
    } else if (area === 'pr' && githubAction === 'create') {
      requestType = RequestType.GITHUB_PR_CREATE;
      payload = remoteGithubPayloadFromCli(argv, {
        head: cliOptionValue(argv, '--head', ''),
        base: cliOptionValue(argv, '--base', ''),
        title: cliOptionValue(argv, '--title', ''),
        body: cliOptionValue(argv, '--body', ''),
        draft: hasCliFlag(argv, '--draft'),
        dryRun: hasCliFlag(argv, '--dry-run')
      });
    } else if (area === 'pr' && githubAction === 'status') {
      requestType = RequestType.GITHUB_PR_STATUS;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', cliPositionalValue(argv, 3, '0')), 10) });
    } else if (area === 'pr' && githubAction === 'merge') {
      requestType = RequestType.GITHUB_PR_MERGE;
      payload = remoteGithubPayloadFromCli(argv, {
        number: Number.parseInt(cliOptionValue(argv, '--number', cliPositionalValue(argv, 3, '0')), 10),
        mergeMethod: cliOptionValue(argv, '--merge-method', 'merge'),
        commitTitle: cliOptionValue(argv, '--commit-title', ''),
        commitMessage: cliOptionValue(argv, '--commit-message', ''),
        confirm: hasCliFlag(argv, '--confirm'),
        dryRun: hasCliFlag(argv, '--dry-run')
      });
    } else if (area === 'checks' && githubAction === 'list') {
      requestType = RequestType.GITHUB_CHECKS_LIST;
      payload = remoteGithubPayloadFromCli(argv, { sha: cliOptionValue(argv, '--sha', cliOptionValue(argv, '--ref', 'HEAD')), ref: cliOptionValue(argv, '--ref', '') });
    } else if (area === 'issue' && githubAction === 'search') {
      requestType = RequestType.GITHUB_ISSUE_SEARCH;
      payload = remoteGithubPayloadFromCli(argv, {
        keyword: cliOptionValue(argv, '--keyword', cliOptionValue(argv, '--query', '')),
        state: cliOptionValue(argv, '--state', ''),
        labels: cliOptionValues(argv, '--label')
      });
    } else if (area === 'issue' && (githubAction === 'attachments' || githubAction === 'attachment-list')) {
      requestType = RequestType.GITHUB_ISSUE_ATTACHMENT_LIST;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', cliPositionalValue(argv, 3, '0')), 10) });
    } else if (area === 'attachment' && githubAction === 'preview') {
      requestType = RequestType.GITHUB_ATTACHMENT_PREVIEW;
      payload = remoteGithubPayloadFromCli(argv, { number: Number.parseInt(cliOptionValue(argv, '--number', '0'), 10), filePath: cliOptionValue(argv, '--file', '') });
    } else if (area === 'attachment' && githubAction === 'upload') {
      requestType = RequestType.GITHUB_ATTACHMENT_UPLOAD;
      payload = remoteGithubPayloadFromCli(argv, { planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') });
    }
    action = 'github.' + area + '.' + githubAction;
  } else if (group === 'service') {
    const service = workspaceServiceCommandForCli(argv);
    if (service.requestType.length === 0) {
      return { deferred: false, result: { ok: false, code: 'service_command_invalid', failureCategory: 'service_command_invalid', action: 'workspace.service.' + service.operation, message: 'Unsupported workspace service command.' } };
    }
    requestType = service.requestType;
    payload = service.payload;
    action = 'workspace.service.' + service.operation;
  } else if (group === 'browser') {
    const browser = browserCommandForCli(argv);
    if (browser.requestType.length === 0) {
      return { deferred: false, result: { ok: false, code: 'browser_command_invalid', failureCategory: 'browser_command_invalid', action: 'browser.' + browser.operation, message: 'Unsupported browser automation command.' } };
    }
    requestType = browser.requestType;
    payload = browser.payload;
    action = 'browser.' + browser.operation;
  } else if (group === 'relay') {
    const relay = relayCommandForCli(argv);
    requestType = relay.requestType;
    payload = relay.payload;
    action = 'relay.' + relay.operation;
  } else if (group === 'voice') {
    const voice = voiceCommandForCli(argv);
    requestType = voice.requestType;
    payload = voice.payload;
    action = 'voice.' + voice.operation;
  } else if (group === 'schedule' || group === 'loop' || group === 'chat') {
    const automation = m7CommandForCli(group, argv);
    requestType = automation.requestType;
    payload = automation.payload;
    action = group + '.' + automation.operation;
  } else if (group === 'mcp') {
    const mode = argv.length > 2 ? argv[2] : '';
    if (command === 'tools') {
      requestType = RequestType.MCP_TOOLS_LIST;
    } else if (command === 'server' && mode === 'start') {
      requestType = RequestType.MCP_SERVER_START;
      payload = { bridgeUrl: liveRpcConfig(argv).target };
    } else if (command === 'server' && mode === 'stop') {
      requestType = RequestType.MCP_SERVER_STOP;
    }
  } else if (group === 'service') {
    const service = workspaceServiceCommandForCli(argv);
    requestType = service.requestType;
    payload = service.payload;
    action = 'workspace.service.' + service.operation;
  } else if (group === 'notification') {
    if (command === 'list') {
      requestType = RequestType.NOTIFICATION_LIST;
      payload = { includeRead: !hasCliFlag(argv, '--unread'), limit: parseCliPositiveInteger(argv, '--limit', 100, 500) };
    } else if (command === 'prune') {
      requestType = RequestType.NOTIFICATION_PRUNE;
      payload = { includeRead: !hasCliFlag(argv, '--unread-only') };
    } else if (command === 'read') {
      requestType = RequestType.NOTIFICATION_READ;
      payload = { notificationId: cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')), read: !hasCliFlag(argv, '--unread') };
    } else if (command === 'action') {
      requestType = RequestType.NOTIFICATION_ACTION;
      payload = { notificationId: cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')), actionId: cliOptionValue(argv, '--action-id', cliPositionalValue(argv, 3, 'open')) };
    }
  } else if (group === 'usage') {
    requestType = command === 'events' ? RequestType.USAGE_EVENTS_LIST : (command === 'budget' && argv.length > 2 && argv[2] === 'set' ? RequestType.USAGE_BUDGET_SET : (command === 'budget' ? RequestType.USAGE_BUDGET_GET : RequestType.USAGE_SUMMARY_GET));
    payload = { sessionId: cliOptionValue(argv, '--session-id', ''), agentId: cliOptionValue(argv, '--agent-id', ''), tokenLimit: Number.parseInt(cliOptionValue(argv, '--token-limit', '0'), 10), costLimit: Number.parseFloat(cliOptionValue(argv, '--cost-limit', '0')), currency: cliOptionValue(argv, '--currency', ''), window: cliOptionValue(argv, '--window', 'session') };
  } else if (group === 'metadata') {
    if (command === 'cancel') {
      requestType = RequestType.METADATA_GENERATE_CANCEL;
      payload = {
        requestId: cliOptionValue(argv, '--request-id', cliPositionalValue(argv, 2, '')),
        sessionId: cliOptionValue(argv, '--session-id', ''),
        agentId: cliOptionValue(argv, '--agent-id', ''),
        hostProfileId: cliOptionValue(argv, '--host-profile-id', '')
      };
      action = 'metadata.generate.cancel';
    } else {
      requestType = RequestType.METADATA_GENERATE;
      payload = {
        sessionId: cliOptionValue(argv, '--session-id', ''),
        agentId: cliOptionValue(argv, '--agent-id', ''),
        kind: command || 'sessionTitle',
        prompt: cliOptionValue(argv, '--prompt', ''),
        diffSummary: cliOptionValue(argv, '--diff-summary', ''),
        timeoutMs: parseCliPositiveInteger(argv, '--timeout-ms', 0, 120000)
      };
    }
  } else if (group === 'diagnostics' && command === 'export') {
    requestType = RequestType.DIAGNOSTICS_EXPORT; payload = { format: cliOptionValue(argv, '--format', 'json') };
  } else if (group === 'message' && command === 'queue') {
    const mode = argv.length > 2 ? argv[2] : 'list'; requestType = mode === 'cancel' ? RequestType.MESSAGE_QUEUE_CANCEL : (mode === 'retry' ? RequestType.MESSAGE_QUEUE_RETRY : RequestType.MESSAGE_QUEUE_LIST);
    payload = { sessionId: cliOptionValue(argv, '--session-id', ''), queueId: cliOptionValue(argv, '--queue-id', '') };
  } else if (group === 'daemon') {
    if (command === 'instance' && argv.length > 2 && argv[2] === 'status') {
      requestType = RequestType.DAEMON_INSTANCE_STATUS;
      payload = { hostProfileId: cliOptionValue(argv, '--host-profile-id', '') };
    } else if (command === 'config') {
      const mode = argv.length > 2 ? argv[2] : 'status';
      requestType = mode === 'status' ? RequestType.DAEMON_CONFIG_STATUS
        : (mode === 'fetch' ? RequestType.DAEMON_CONFIG_FETCH
          : (mode === 'validate' ? RequestType.DAEMON_CONFIG_VALIDATE
            : (mode === 'preview' ? RequestType.DAEMON_CONFIG_PREVIEW
              : (mode === 'apply' ? RequestType.DAEMON_CONFIG_APPLY : RequestType.DAEMON_CONFIG_ROLLBACK))));
      payload = { url: cliOptionValue(argv, '--url', ''), planId: cliOptionValue(argv, '--plan-id', ''), confirm: hasCliFlag(argv, '--confirm') };
      action = 'daemon.config.' + mode;
    } else if (command === 'status') {
      requestType = RequestType.DAEMON_STATUS;
    } else if (command === 'health' || command === 'doctor') {
      requestType = RequestType.DAEMON_HEALTH;
    } else if (command === 'start') {
      requestType = RequestType.DAEMON_START;
    } else if (command === 'stop') {
      requestType = RequestType.DAEMON_STOP;
    } else if (command === 'restart') {
      requestType = RequestType.DAEMON_RESTART;
    } else if (command === 'logs') {
      requestType = RequestType.DAEMON_LOGS;
      payload = { maxBytes: parseCliPositiveInteger(argv, '--max-bytes', 65536, 1024 * 1024) };
    } else if (command === 'autostart') {
      const mode = argv.length > 2 ? argv[2] : 'status';
      requestType = mode === 'status'
        ? RequestType.DAEMON_AUTOSTART_STATUS
        : (mode === 'preview' ? RequestType.DAEMON_AUTOSTART_PREVIEW
          : (mode === 'install' ? RequestType.DAEMON_AUTOSTART_INSTALL
            : (mode === 'uninstall' ? RequestType.DAEMON_AUTOSTART_UNINSTALL : RequestType.DAEMON_AUTOSTART_SET)));
      payload = {
        method: cliOptionValue(argv, '--method', 'auto'),
        confirm: hasCliFlag(argv, '--confirm'),
        enabled: mode === 'set' ? cliBooleanOption(argv, '--enabled', false) : (mode === 'on' || mode === 'true')
      };
      action = 'daemon.autostart.' + mode;
    } else if (command === 'update') {
      const mode = argv.length > 2 ? argv[2] : 'status';
      requestType = mode === 'status'
        ? RequestType.DAEMON_UPDATE_STATUS
        : (mode === 'check' ? RequestType.DAEMON_UPDATE_CHECK
          : (mode === 'preview' ? RequestType.DAEMON_UPDATE_PREVIEW
            : (mode === 'install' ? RequestType.DAEMON_UPDATE_INSTALL : RequestType.DAEMON_UPDATE_ROLLBACK)));
      payload = {
        channel: cliOptionValue(argv, '--channel', 'latest'),
        version: cliOptionValue(argv, '--version', ''),
        confirm: hasCliFlag(argv, '--confirm'),
        force: hasCliFlag(argv, '--force')
      };
      action = 'daemon.update.' + mode;
    }
  } else if (group === 'security') {
    return { deferred: false, result: await remoteSecurityCommandForCli(argv) };
  }
  if (requestType.length === 0) {
    return {
      deferred: false,
      result: {
        ok: false,
        code: 'remote_command_unsupported',
        failureCategory: 'remote_command_unsupported',
        action,
        message: 'This management command does not have a safe remote HTTP RPC mapping.',
        remediation: 'Run it against the local Bridge host or use an App/MCP persistent transport where supported.'
      }
    };
  }
  return {
    deferred: false,
    result: await explicitRemoteRpcForCli(argv, requestType, payload, action)
  };
}

function printAndFinalizeManagementResult(argv, result) {
  const streamedWithoutJson = result && result.streamed === true && !hasCliFlag(argv, '--json');
  if (!streamedWithoutJson || (result && typeof result.code === 'string' && result.code.length > 0)) {
    printManagementResult(result);
  } else if (hasCliFlag(argv, '--summary')) {
    process.stderr.write(JSON.stringify(result, null, 2) + '\n');
  }
  if (result && ((typeof result.code === 'string' && result.code.length > 0) ||
      (result.ok === false && typeof result.failureCategory === 'string' && result.failureCategory.length > 0))) {
    process.exitCode = 1;
  }
}

async function runManagementCommand(argv) {
  if (argv.length === 0) {
    return false;
  }
  const group = argv[0];
  if (group === 'mcp' && argv.length > 1 && argv[1] === 'stdio') {
    require('./mcp-stdio-server');
    return true;
  }
  if (!['agent', 'terminal', 'permit', 'provider', 'workspace', 'worktree', 'git', 'github', 'metadata', 'mcp', 'notification', 'daemon', 'security', 'relay', 'schedule', 'loop', 'chat', 'voice', 'service', 'browser'].includes(group)) {
    return false;
  }
  if (explicitRemoteCli(argv)) {
    const remote = await explicitRemoteManagementCommandForCli(argv);
    if (!remote.deferred) {
      printAndFinalizeManagementResult(argv, remote.result);
      return true;
    }
  }
  const providerBridgeCommands = new Set(['directory', 'usage', 'list', 'discover', 'import', 'upsert', 'clone', 'env', 'delete', 'test']);
  const providerCommand = argv.length > 1 ? argv[1] : '';
  if (group === 'provider' && providerBridgeCommands.has(providerCommand)) {
    const remote = await explicitRemoteManagementCommandForCli(argv);
    if (!remote.deferred) {
      let remoteResult = remote.result;
      if (remoteResult && remoteResult.rpcUnavailable === true) {
        remoteResult = {
          ok: false,
          code: 'live_bridge_required',
          failureCategory: 'live_bridge_required',
          rpcFailureCategory: typeof remoteResult.code === 'string' ? remoteResult.code : 'rpc_unavailable',
          action: typeof remoteResult.action === 'string' ? remoteResult.action : 'provider.' + providerCommand,
          message: 'Provider profile management requires a running Bridge daemon.',
          remediation: 'Start ngf-agent-bridge, configure its token, and retry the command.'
        };
      }
      printAndFinalizeManagementResult(argv, remoteResult);
      return true;
    }
  }
  const store = createDaemonStore();
  const workspaceRegistry = new WorkspaceRegistry(store);
  const agentManager = new AgentManager({
    store,
    workspaceRegistry
  });
  const workspaceService = new WorkspaceService(workspaceRegistry, workspaceRegistry);
  const fileCheckpointStore = new FileCheckpointStore(store);
  const notificationManager = new NotificationManager(store);
  const securityAudit = new SecurityAuditLog(store);
  const autostartManager = new AutostartManager(store);
  const daemonUpdateManager = new DaemonUpdateManager(store);
  const command = argv.length > 1 ? argv[1] : '';
  let result = null;
  const agentAttentionClear = group === 'agent' && command === 'attention' && cliPositionalValue(argv, 2, '') === 'clear';
  const liveAgentCommand = group === 'agent' && (
    command === 'run' ||
    command === 'create' ||
    command === 'stop' ||
    command === 'resume' ||
    command === 'delete' ||
    command === 'update' ||
    command === 'rename' ||
    command === 'mode' ||
    command === 'model' ||
    command === 'attention-clear' ||
    agentAttentionClear
  );

  if (liveAgentCommand) {
    const createsAgent = command === 'run' || command === 'create';
    const agentIdIndex = createsAgent ? -1 : (agentAttentionClear ? 3 : 2);
    let requestType = '';
    let action = 'agent.' + command;
    let payload = remoteAgentPayloadForCli(argv, agentIdIndex);
    if (command === 'run' || command === 'create') {
      requestType = command === 'run' ? RequestType.AGENT_RUN : RequestType.AGENT_CREATE;
      payload = Object.assign(payload, {
        text: cliOptionValue(argv, '--text', cliOptionValue(argv, '--message', cliPositionalValue(argv, 2, '')))
      });
    } else if (command === 'stop') {
      requestType = RequestType.AGENT_STOP;
    } else if (command === 'resume') {
      requestType = RequestType.AGENT_RESUME;
    } else if (command === 'delete') {
      requestType = RequestType.AGENT_DELETE;
    } else if (command === 'update' || command === 'rename') {
      requestType = RequestType.AGENT_UPDATE;
      payload.title = cliOptionValue(argv, '--title', cliOptionValue(argv, '--name', cliPositionalValue(argv, 3, '')));
    } else if (command === 'mode') {
      requestType = RequestType.AGENT_MODE_SET;
      payload.modeId = cliOptionValue(argv, '--mode-id', cliPositionalValue(argv, 3, ''));
      payload.thinkingOptionId = cliOptionValue(argv, '--thinking', '');
    } else if (command === 'model') {
      requestType = RequestType.AGENT_MODEL_SET;
      payload.modelId = cliOptionValue(argv, '--model-id', cliPositionalValue(argv, 3, ''));
    } else {
      requestType = RequestType.AGENT_ATTENTION_CLEAR;
      action = 'agent.attention-clear';
    }
    result = await liveManagementRpcForCli(argv, requestType, payload, action);
  } else if (group === 'agent' && command === 'list') {
    const listPayload = {
      includeArchived: hasCliFlag(argv, '--include-archived')
    };
    result = hasCliFlag(argv, '--tree') ? agentManager.listResult(listPayload) : {
      agents: agentManager.list(listPayload)
    };
  } else if (group === 'agent' && command === 'doctor') {
    result = agentManager.relationshipDoctor({
      includeArchived: true
    });
  } else if (group === 'agent' && command === 'logs') {
    result = await agentLogsForCli(agentManager, argv);
  } else if (group === 'agent' && command === 'wait') {
    result = await agentWaitForCli(store, workspaceRegistry, argv);
  } else if (group === 'agent' && command === 'status') {
    const agentId = cliAgentId(argv, 2);
    if (agentId.length === 0) {
      throw new Error('agent status requires an agent id.');
    }
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.AGENT_STATUS, {
      agentId
    }));
    if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
      result = rpcPayload;
    }
    const record = agentManager.find(agentId);
    if (result !== null) {
      // Live daemon status wins when available.
    } else if (!record) {
      result = {
        code: 'agent_not_found',
        message: 'Agent not found.'
      };
    } else {
      result = {
        agent: agentManager.publicRecord(record),
        runtimeMode: readString(record.runtimeInfo, 'runtimeMode', readString(record, 'runtimeMode', '')),
        interactiveReady: record.runtimeInfo && record.runtimeInfo.interactiveReady === true,
        sessionState: readString(record.runtimeInfo, 'sessionState', record.providerSessionId.length > 0 ? 'attached' : 'detached'),
        pid: readString(record.runtimeInfo, 'pid', ''),
        startedAt: readString(record.runtimeInfo, 'startedAt', ''),
        lastActivityAt: readString(record.runtimeInfo, 'lastActivityAt', ''),
        exitCode: readString(record.runtimeInfo, 'exitCode', ''),
        lastError: readString(record.runtimeInfo, 'lastError', ''),
        recentOutputTail: readString(record.runtimeInfo, 'recentOutputTail', ''),
        providerSessionId: record.providerSessionId
      };
    }
  } else if (group === 'agent' && command === 'attach') {
    const agentId = cliAgentId(argv, 2);
    if (agentId.length === 0) {
      throw new Error('agent attach requires an agent id.');
    }
    if (!hasCliFlag(argv, '--status-only')) {
      const attached = await liveManagementRpcForCli(argv, RequestType.AGENT_ATTACH, { agentId }, 'agent.attach');
      if (attached && typeof attached.code === 'string' && attached.code.length > 0) {
        result = attached;
      } else {
        const followed = await agentTimelineFollowForCli(agentManager, argv);
        result = Object.assign({}, followed, {
          action: 'agent.attach',
          attached: attached && attached.attached === true,
          runtime: attached && attached.runtime && typeof attached.runtime === 'object' ? attached.runtime : null,
          attach: attached
        });
      }
    } else {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.AGENT_ATTACH, {
        agentId
      }));
      if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
        result = rpcPayload;
      }
      const record = agentManager.find(agentId);
      if (result !== null) {
        // Live daemon attach wins when available.
      } else if (!record) {
        result = {
          code: 'agent_not_found',
          message: 'Agent not found.'
        };
      } else {
        result = {
          agent: agentManager.publicRecord(record),
          attached: record.providerSessionId.length > 0,
          providerSessionId: record.providerSessionId,
          sessionState: readString(record.runtimeInfo, 'sessionState', record.providerSessionId.length > 0 ? 'attached' : 'detached'),
          pid: readString(record.runtimeInfo, 'pid', ''),
          startedAt: readString(record.runtimeInfo, 'startedAt', ''),
          lastActivityAt: readString(record.runtimeInfo, 'lastActivityAt', ''),
          lastError: readString(record.runtimeInfo, 'lastError', ''),
          recentOutputTail: readString(record.runtimeInfo, 'recentOutputTail', ''),
          message: record.providerSessionId.length > 0 ? 'Agent has an attached provider session.' : 'Agent has no active provider session to attach.'
        };
      }
    }
  } else if (group === 'agent' && command === 'send') {
    const agentId = cliAgentId(argv, 2);
    const text = cliOptionValue(argv, '--text', argv.length > 3 ? argv.slice(3).join(' ') : '');
    if (agentId.length === 0) {
      throw new Error('agent send requires an agent id.');
    }
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.AGENT_SEND, {
      agentId,
      text
    }));
    if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
      result = rpcPayload;
    }
    const record = agentManager.find(agentId);
    if (result !== null) {
      // Live daemon send wins when available.
    } else if (!record) {
      result = {
        code: 'agent_not_found',
        message: 'Agent not found.'
      };
    } else if (record.providerSessionId.length === 0) {
      result = {
        code: 'agent_send_unavailable',
        message: 'Agent has no active provider session. Start the agent through Bridge before using agent send.',
        agent: agentManager.publicRecord(record),
        accepted: false,
        text
      };
    } else {
      result = {
        code: 'agent_send_unavailable',
        message: 'CLI send requires a live Bridge server connection and is not available in offline management mode.',
        agent: agentManager.publicRecord(record),
        providerSessionId: record.providerSessionId,
        accepted: false,
        text
      };
    }
  } else if (group === 'agent' && command === 'archive') {
    const agentId = cliAgentId(argv, 2);
    if (agentId.length === 0) {
      throw new Error('agent archive requires an agent id.');
    }
    result = agentManager.archive(agentId, {
      cascade: hasCliFlag(argv, '--cascade')
    });
  } else if (group === 'agent' && command === 'fork') {
    const agentId = cliAgentId(argv, 2);
    if (agentId.length === 0) {
      throw new Error('agent fork requires an agent id.');
    }
    const workspaceMode = cliOptionValue(argv, '--workspace-mode', hasCliFlag(argv, '--isolated') ? 'isolated' : 'shared');
    const boundaryMessageId = cliOptionValue(argv, '--boundary-message-id', '');
    if (workspaceMode === 'isolated' || boundaryMessageId.length > 0) {
      result = {
        code: 'live_bridge_required',
        message: boundaryMessageId.length > 0
          ? 'Message-boundary Agent fork requires the live Bridge preview coordinator.'
          : 'Isolated Agent fork requires the live Bridge worktree coordinator.'
      };
    } else {
      result = agentManager.fork(agentId, {
        title: cliOptionValue(argv, '--title', ''),
        checkpointId: cliOptionValue(argv, '--checkpoint-id', ''),
        parentAgentId: cliOptionValue(argv, '--parent-agent-id', ''),
        detached: hasCliFlag(argv, '--detached'),
        workspaceMode: 'shared'
      });
    }
  } else if (group === 'agent' && command === 'detach') {
    const agentId = cliAgentId(argv, 2);
    if (agentId.length === 0) {
      throw new Error('agent detach requires an agent id.');
    }
    result = agentManager.detach(agentId);
  } else if (group === 'agent' && command === 'checkpoint') {
    const action = argv.length > 2 ? argv[2] : 'list';
    const agentId = cliAgentId(argv, 3);
    if (agentId.length === 0) {
      throw new Error('agent checkpoint requires an agent id.');
    }
    if (action === 'list') {
      result = agentManager.listCheckpoints(agentId);
    } else if (action === 'inspect') {
      const checkpointId = cliOptionValue(argv, '--checkpoint-id', argv.length > 4 ? argv[4] : '');
      const checkpoint = agentManager.findCheckpoint(agentId, checkpointId);
      if (!checkpoint) {
        result = {
          code: 'checkpoint_not_found',
          message: 'Checkpoint not found.'
        };
      } else {
        result = {
          checkpoint: agentManager.publicCheckpoint(checkpoint),
          snapshot: checkpoint.fileSnapshotId.length > 0 ? fileCheckpointStore.inspect(checkpoint.fileSnapshotId) : null
        };
      }
    } else if (action === 'create') {
      const capture = checkpointCaptureForCli(fileCheckpointStore, agentManager, agentId, argv);
      result = agentManager.createCheckpoint(agentId, Object.assign({
        title: cliOptionValue(argv, '--title', ''),
        description: cliOptionValue(argv, '--description', '')
      }, capture));
    } else if (action === 'restore') {
      const checkpointId = cliOptionValue(argv, '--checkpoint-id', argv.length > 4 ? argv[4] : '');
      const preRestoreSnapshotId = cliOptionValue(argv, '--pre-restore', cliOptionValue(argv, '--pre-restore-snapshot-id', ''));
      if (checkpointId.length === 0 && preRestoreSnapshotId.length === 0) {
        throw new Error('agent checkpoint restore requires a checkpoint id or --pre-restore.');
      }
      result = restoreCheckpointForCli(fileCheckpointStore, agentManager, agentId, checkpointId, argv);
    }
  } else if (group === 'permit') {
    result = await permitCommandForCli(agentManager, argv);
  } else if (group === 'terminal' && (command === 'create' || command === 'capture' || command === 'rename' || command === 'kill')) {
    const terminalId = cliOptionValue(argv, '--terminal-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')));
    let requestType = '';
    let payload = {};
    if (command === 'create') {
      requestType = RequestType.TERMINAL_CREATE;
      payload = {
        terminalId: cliOptionValue(argv, '--terminal-id', ''),
        workspaceId: cliOptionValue(argv, '--workspace-id', ''),
        cwd: cliOptionValue(argv, '--cwd', ''),
        name: cliOptionValue(argv, '--name', ''),
        rows: parseCliPositiveInteger(argv, '--rows', 24, 80),
        cols: parseCliPositiveInteger(argv, '--cols', 80, 240)
      };
    } else if (command === 'capture') {
      requestType = RequestType.TERMINAL_CAPTURE;
      payload = { terminalId };
    } else if (command === 'rename') {
      requestType = RequestType.TERMINAL_RENAME;
      payload = {
        terminalId,
        name: cliOptionValue(argv, '--name', cliPositionalValue(argv, 3, ''))
      };
    } else {
      requestType = RequestType.TERMINAL_KILL;
      payload = { terminalId };
    }
    result = await liveManagementRpcForCli(argv, requestType, payload, 'terminal.' + command);
  } else if (group === 'terminal' && command === 'logs') {
    if (hasCliFlag(argv, '--follow') || hasCliFlag(argv, '-f')) {
      result = await terminalFollowForCli(store, ['terminal', 'follow'].concat(argv.slice(2)));
    } else {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.TERMINAL_CAPTURE, {
        terminalId: cliOptionValue(argv, '--terminal-id', cliOptionValue(argv, '--id', cliPositionalValue(argv, 2, '')))
      }));
      result = liveOrLocalCliResult(argv, rpcPayload, 'terminal.logs', () => readTerminalCaptureTailForCli(store, argv));
    }
  } else if (group === 'terminal' && command === 'follow') {
    result = await terminalFollowForCli(store, argv);
  } else if (group === 'terminal' && command === 'list') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.TERMINAL_LIST, {
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      cwd: cliOptionValue(argv, '--cwd', '')
    }));
    result = liveOrLocalCliResult(argv, rpcPayload, 'terminal.list', () => {
      const manager = new TerminalManager({
        workspaceRegistry,
        agentManager,
        managedProcessLedger: null,
        daemonStore: store,
        broadcast: () => {}
      });
      return manager.list({});
    });
  } else if (group === 'terminal' && command === 'hook') {
    const action = argv.length > 2 ? argv[2] : 'status';
    const manager = new TerminalManager({
      workspaceRegistry,
      agentManager,
      managedProcessLedger: null,
      daemonStore: store,
      broadcast: () => {}
    });
    if (action === 'status') {
      result = manager.hookStatus({});
    } else if (action === 'install' || action === 'preview' || action === 'uninstall') {
      result = manager.installHook({
        action: action === 'preview' ? 'preview' : action,
        confirm: hasCliFlag(argv, '--confirm')
      });
    }
  } else if (group === 'provider' && (command === 'capabilities' || command === 'refresh')) {
    result = await providerCapabilitiesForCli(store, argv, command === 'refresh' ? 'refresh' : 'capabilities');
  } else if (group === 'provider' && command === 'list') {
    result = {
      profiles: store.readProviderProfiles().map(decorateProviderProfileForCli)
    };
  } else if (group === 'provider' && command === 'import') {
    const catalogPath = argv.length > 2 ? argv[2] : cliOptionValue(argv, '--path', '');
    if (catalogPath.length === 0) {
      throw new Error('provider import requires a catalog file or directory path.');
    }
    result = importProviderProfilesFromCliCatalog(store, catalogPath, argv);
  } else if (group === 'provider' && command === 'upsert') {
    result = upsertProviderProfileForCli(store, argv);
  } else if (group === 'provider' && command === 'clone') {
    result = cloneProviderProfileForCli(store, argv);
  } else if (group === 'provider' && command === 'env') {
    result = editProviderProfileEnvForCli(store, argv);
  } else if (group === 'provider' && command === 'delete') {
    result = deleteProviderProfileForCli(store, argv);
  } else if (group === 'provider' && command === 'test') {
    result = await testProviderProfileForCli(store, argv);
  } else if (group === 'workspace' && command === 'list') {
    result = workspaceRegistry.listResult({
      includeArchived: hasCliFlag(argv, '--include-archived'),
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '12'), 10)
    });
  } else if (group === 'workspace' && (command === 'upsert' || command === 'create' || command === 'import')) {
    const workspacePath = cliOptionValue(argv, '--path', cliOptionValue(argv, '--cwd', argv.length > 2 ? argv[2] : ''));
    if (workspacePath.length === 0) {
      throw new Error('workspace ' + command + ' requires --path.');
    }
    const payload = {
      workspacePath,
      cwd: workspacePath,
      workspaceId: cliOptionValue(argv, '--workspace-id', ''),
      workspaceTitle: cliOptionValue(argv, '--title', ''),
      title: cliOptionValue(argv, '--title', ''),
      kind: cliOptionValue(argv, '--kind', 'directory'),
      branch: cliOptionValue(argv, '--branch', ''),
      dedupeByCwd: !hasCliFlag(argv, '--no-dedupe'),
      preview: command === 'upsert' ? false : !hasCliFlag(argv, '--confirm'),
      confirm: command === 'upsert' ? true : hasCliFlag(argv, '--confirm'),
      includeArchived: true,
      limit: 12
    };
    if (command === 'import') {
      result = workspaceRegistry.importWorkspace(payload);
    } else if (command === 'create') {
      result = workspaceRegistry.createWorkspace(payload);
    } else {
      result = workspaceRegistry.writeWorkspaceWithPreview(payload, 'workspace.registry.upsert', 'upsert');
    }
  } else if (group === 'workspace' && command === 'archive') {
    const target = cliOptionValue(argv, '--id', cliOptionValue(argv, '--path', argv.length > 2 ? argv[2] : ''));
    const payload = target.indexOf(':') >= 0 || path.isAbsolute(target)
      ? { workspacePath: target, cwd: target, confirm: hasCliFlag(argv, '--confirm'), preview: !hasCliFlag(argv, '--confirm'), includeArchived: true }
      : { workspaceId: target, confirm: hasCliFlag(argv, '--confirm'), preview: !hasCliFlag(argv, '--confirm'), includeArchived: true };
    result = workspaceRegistry.archiveWorkspaceWithPreview(payload);
  } else if (group === 'workspace' && command === 'suggestions') {
    result = workspaceRegistry.suggestionsResult({
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '12'), 10)
    });
  } else if (group === 'workspace' && command === 'open') {
    result = workspaceOpenForCli(workspaceRegistry, argv);
  } else if (group === 'workspace' && command === 'doctor') {
    result = workspaceRegistry.doctor({
      includeArchived: true
    });
  } else if (group === 'worktree' && command === 'list') {
    result = await workspaceService.listWorktrees(Object.assign(gitPayloadFromCli(argv), {
      includeArchived: hasCliFlag(argv, '--include-archived')
    }));
  } else if (group === 'worktree' && command === 'create') {
    const worktreePath = cliOptionValue(argv, '--worktree-path', cliOptionValue(argv, '--path', argv.length > 2 ? argv[2] : ''));
    if (worktreePath.length === 0) {
      throw new Error('worktree create requires --worktree-path.');
    }
    result = await workspaceService.createWorktree(servicePayloadFromCli(argv, {
      worktreePath,
      path: worktreePath,
      branch: cliOptionValue(argv, '--branch', ''),
      startPoint: cliOptionValue(argv, '--start-point', ''),
      title: cliOptionValue(argv, '--title', ''),
      setupCommand: cliOptionValue(argv, '--setup-command', ''),
      preview: !hasCliFlag(argv, '--confirm'),
      confirm: hasCliFlag(argv, '--confirm'),
      sourceWorkspaceId: cliOptionValue(argv, '--source-workspace-id', cliOptionValue(argv, '--workspace-id', '')),
      sourceRootPath: cliOptionValue(argv, '--source-root-path', cliOptionValue(argv, '--cwd', process.cwd()))
    }));
    if (result && result.created === true && result.worktreePath.length > 0) {
      const workspace = workspaceRegistry.upsertWorkspace({
        workspacePath: result.worktreePath,
        cwd: result.worktreePath,
        workspaceTitle: cliOptionValue(argv, '--title', ''),
        title: cliOptionValue(argv, '--title', ''),
        branch: result.branch,
        kind: 'worktree',
        sourceWorkspaceId: result.sourceWorkspaceId,
        sourceRootPath: result.sourceRootPath,
        worktreePath: result.worktreePath,
        startPoint: result.startPoint
      });
      result.registryLinked = workspace !== null;
      result.registryWorkspaceId = workspace && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
      result.worktrees = (await workspaceService.listWorktrees(servicePayloadFromCli(argv, { includeArchived: true }))).worktrees;
    }
  } else if (group === 'worktree' && command === 'archive') {
    const worktreePath = cliOptionValue(argv, '--worktree-path', cliOptionValue(argv, '--path', argv.length > 2 ? argv[2] : ''));
    if (worktreePath.length === 0) {
      throw new Error('worktree archive requires --worktree-path.');
    }
    result = await workspaceService.archiveWorktree(servicePayloadFromCli(argv, {
      worktreePath,
      path: worktreePath,
      force: hasCliFlag(argv, '--force'),
      teardownCommand: cliOptionValue(argv, '--teardown-command', ''),
      preview: !hasCliFlag(argv, '--confirm'),
      confirm: hasCliFlag(argv, '--confirm')
    }));
    if (result && result.archived) {
      const workspace = workspaceRegistry.archiveWorkspace({
        cwd: result.worktreePath
      });
      result.registryLinked = workspace !== null;
      result.registryWorkspaceId = workspace && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
      result.worktrees = (await workspaceService.listWorktrees(servicePayloadFromCli(argv, { includeArchived: true }))).worktrees;
    }
  } else if (group === 'git' && (command === 'stage' || command === 'unstage' || command === 'discard')) {
    const payload = servicePayloadFromCli(argv, Object.assign({
      paths: cliOptionValues(argv, '--file').concat(cliOptionValues(argv, '--path-spec')),
      path: cliOptionValue(argv, '--file', cliOptionValue(argv, '--path-spec', ''))
    }, gitPlanControlFromCli(argv)));
    const planFailure = gitPlanCliFailure(argv, command, payload);
    if (planFailure) {
      result = planFailure;
    } else if (command === 'stage') {
      result = await workspaceService.stage(payload);
    } else if (command === 'unstage') {
      result = await workspaceService.unstage(payload);
    } else {
      result = await workspaceService.discard(payload);
    }
  } else if (group === 'git' && command === 'commit') {
    result = await workspaceService.commit(servicePayloadFromCli(argv, {
      message: cliOptionValue(argv, '--message', cliOptionValue(argv, '-m', cliPositionalValue(argv, 2, ''))),
      amend: hasCliFlag(argv, '--amend')
    }));
  } else if (group === 'git' && command === 'status') {
    result = await workspaceService.status(gitPayloadFromCli(argv));
  } else if (group === 'git' && command === 'subscribe') {
    const action = argv.length > 2 ? argv[2] : cliOptionValue(argv, '--action', 'status');
    result = {
      action,
      subscriptionId: cliOptionValue(argv, '--subscription-id', cliOptionValue(argv, '--id', '')),
      status: 'cli_stateless',
      subscribed: false,
      paused: action === 'pause',
      lastSuccessAt: 0,
      lastError: '',
      backoffMs: 0,
      message: 'Git diff subscriptions are held by active Bridge websocket connections; CLI exposes status metadata only.'
    };
  } else if (group === 'git' && command === 'pull') {
    const payload = servicePayloadFromCli(argv, Object.assign({
      remote: cliOptionValue(argv, '--remote', ''),
      branch: cliOptionValue(argv, '--branch', ''),
      ffOnly: !hasCliFlag(argv, '--no-ff-only')
    }, gitPlanControlFromCli(argv)));
    result = gitPlanCliFailure(argv, command, payload) || await workspaceService.pull(payload);
  } else if (group === 'git' && command === 'push') {
    const payload = servicePayloadFromCli(argv, Object.assign({
      remote: cliOptionValue(argv, '--remote', ''),
      branch: cliOptionValue(argv, '--branch', ''),
      force: hasCliFlag(argv, '--force')
    }, gitPlanControlFromCli(argv)));
    result = gitPlanCliFailure(argv, command, payload) || await workspaceService.push(payload);
  } else if (group === 'git' && command === 'branch') {
    const payload = servicePayloadFromCli(argv, Object.assign({
      action: argv.length > 2 ? argv[2] : cliOptionValue(argv, '--action', 'list'),
      name: cliOptionValue(argv, '--name', argv.length > 3 ? argv[3] : ''),
      startPoint: cliOptionValue(argv, '--start-point', ''),
      force: hasCliFlag(argv, '--force')
    }, gitPlanControlFromCli(argv)));
    result = gitPlanCliFailure(argv, command, payload) || await workspaceService.branch(payload);
  } else if (group === 'git' && command === 'stash') {
    const payload = servicePayloadFromCli(argv, Object.assign({
      action: argv.length > 2 ? argv[2] : cliOptionValue(argv, '--action', 'list'),
      message: cliOptionValue(argv, '--message', ''),
      ref: cliOptionValue(argv, '--ref', argv.length > 3 ? argv[3] : ''),
      includeUntracked: !hasCliFlag(argv, '--no-include-untracked')
    }, gitPlanControlFromCli(argv)));
    result = gitPlanCliFailure(argv, command, payload) || await workspaceService.stash(payload);
  } else if (group === 'git' && command === 'merge') {
    const payload = servicePayloadFromCli(argv, Object.assign({
      ref: cliOptionValue(argv, '--ref', cliOptionValue(argv, '--branch', argv.length > 2 ? argv[2] : '')),
      noCommit: hasCliFlag(argv, '--no-commit'),
      ffOnly: hasCliFlag(argv, '--ff-only')
    }, gitPlanControlFromCli(argv)));
    result = gitPlanCliFailure(argv, command, payload) || await workspaceService.merge(payload);
  } else if (group === 'relay') {
    const relay = relayCommandForCli(argv);
    if (relay.requestType.length === 0) {
      result = {
        ok: false,
        code: 'relay_command_invalid',
        failureCategory: 'relay_command_invalid',
        action: 'relay.' + relay.operation,
        message: 'Unsupported relay command: ' + argv.join(' '),
        remediation: 'Use relay status, pairing start/cancel, connect, disconnect, devices, revoke, or identity rotate.'
      };
    } else {
      result = await liveManagementRpcForCli(argv, relay.requestType, relay.payload, 'relay.' + relay.operation);
    }
  } else if (group === 'voice') {
    const voice = voiceCommandForCli(argv);
    if (voice.requestType.length === 0) {
      result = { ok: false, code: 'voice_command_invalid', failureCategory: 'voice_command_invalid', action: 'voice.' + voice.operation, message: 'Unsupported voice command.' };
    } else {
      result = await liveManagementRpcForCli(argv, voice.requestType, voice.payload, 'voice.' + voice.operation);
    }
  } else if (group === 'schedule' || group === 'loop' || group === 'chat') {
    const automation = m7CommandForCli(group, argv);
    if (automation.requestType.length === 0) {
      result = {
        ok: false,
        code: group + '_command_invalid',
        failureCategory: group + '_command_invalid',
        action: group + '.' + automation.operation,
        message: 'Unsupported ' + group + ' command: ' + argv.join(' ')
      };
    } else {
      result = await liveManagementRpcForCli(argv, automation.requestType, automation.payload, group + '.' + automation.operation);
    }
  } else if (group === 'github') {
    result = await githubCommandForCli(store, argv);
  } else if (group === 'mcp') {
    result = await mcpCommandForCli(store, argv);
  } else if (group === 'metadata') {
    const metadataCommand = command === 'cancel' ? RequestType.METADATA_GENERATE_CANCEL : RequestType.METADATA_GENERATE;
    const metadataPayload = command === 'cancel'
      ? {
          requestId: cliOptionValue(argv, '--request-id', cliPositionalValue(argv, 2, '')),
          sessionId: cliOptionValue(argv, '--session-id', ''),
          agentId: cliOptionValue(argv, '--agent-id', ''),
          hostProfileId: cliOptionValue(argv, '--host-profile-id', '')
        }
      : {
          sessionId: cliOptionValue(argv, '--session-id', ''),
          agentId: cliOptionValue(argv, '--agent-id', ''),
          kind: command || 'sessionTitle',
          prompt: cliOptionValue(argv, '--prompt', ''),
          diffSummary: cliOptionValue(argv, '--diff-summary', ''),
          timeoutMs: parseCliPositiveInteger(argv, '--timeout-ms', 0, 120000)
        };
    result = await liveManagementRpcForCli(argv, metadataCommand, metadataPayload,
      command === 'cancel' ? 'metadata.generate.cancel' : 'metadata.generate');
  } else if (group === 'notification' && command === 'list') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.NOTIFICATION_LIST, {
      includeRead: !hasCliFlag(argv, '--unread'),
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10)
    }));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : notificationManager.list({
      includeRead: !hasCliFlag(argv, '--unread'),
      limit: Number.parseInt(cliOptionValue(argv, '--limit', '100'), 10)
    });
  } else if (group === 'notification' && command === 'wait') {
    result = await notificationWaitForCli(notificationManager, argv);
  } else if (group === 'notification' && command === 'prune') {
    const payload = {
      includeRead: !hasCliFlag(argv, '--unread-only')
    };
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.NOTIFICATION_PRUNE, payload));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : notificationManager.prune(payload);
  } else if (group === 'notification' && command === 'read') {
    const payload = {
      notificationId: cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''),
      read: !hasCliFlag(argv, '--unread')
    };
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.NOTIFICATION_READ, payload));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : notificationManager.markRead(payload);
  } else if (group === 'notification' && command === 'action') {
    const payload = {
      notificationId: cliOptionValue(argv, '--id', argv.length > 2 ? argv[2] : ''),
      actionId: cliOptionValue(argv, '--action-id', argv.length > 3 ? argv[3] : 'open')
    };
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.NOTIFICATION_ACTION, payload));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : notificationManager.handleAction(payload);
  } else if (group === 'daemon' && command === 'status') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_STATUS, {}));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : Object.assign(buildLocalDaemonHealthForCli(store, 'daemon.status', '', ''), {
      serverId: store.serverId,
      autostart: store.config.daemon.autostart,
      doctor: securityDoctorForCli(store, securityAudit)
    });
  } else if (group === 'daemon' && command === 'health') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_HEALTH, {}));
    result = !rpcPayload || rpcPayload.rpcUnavailable !== true ? rpcPayload : buildLocalDaemonHealthForCli(store, 'daemon.health', '', '');
  } else if (group === 'daemon' && command === 'start') {
    result = await startDaemonForCli(store, argv);
  } else if (group === 'daemon' && command === 'stop') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_STOP, {}));
    if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
      result = rpcPayload;
    } else {
      const localHealth = buildLocalDaemonHealthForCli(store, 'daemon.stop', '', '');
      if (localHealth.pid > 0 && processIsAlive(localHealth.pid)) {
        process.kill(localHealth.pid, 'SIGTERM');
        result = Object.assign(localHealth, {
          status: 'stopping',
          health: 'stale',
          scheduled: true,
          message: 'Sent SIGTERM to daemon process from local ledger.'
        });
      } else {
        result = Object.assign(localHealth, {
          status: 'stopped',
          health: 'stopped',
          alreadyStopped: true,
          message: 'Bridge daemon is already stopped.'
        });
      }
    }
  } else if (group === 'daemon' && command === 'restart') {
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_RESTART, {}));
    if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
      result = rpcPayload;
    } else {
      const localHealth = buildLocalDaemonHealthForCli(store, 'daemon.restart', '', '');
      if (localHealth.supervised === true && localHealth.pid > 0 && processIsAlive(localHealth.pid)) {
        process.kill(localHealth.pid, 'SIGHUP');
        result = Object.assign(localHealth, {
          status: 'restarting',
          health: 'restarting',
          scheduled: true,
          message: 'Sent SIGHUP to the Bridge daemon supervisor.'
        });
      } else {
        result = await startDaemonForCli(store, argv);
      }
    }
  } else if (group === 'daemon' && command === 'logs') {
    const maxBytes = Number.parseInt(cliOptionValue(argv, '--max-bytes', '65536'), 10);
    const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, RequestType.DAEMON_LOGS, { maxBytes }));
    result = liveOrLocalCliResult(argv, rpcPayload, 'daemon.logs', () => readDaemonLogTailForCli(store, maxBytes));
  } else if (group === 'daemon' && command === 'config') {
    const mode = argv.length > 2 ? argv[2] : 'status';
    const requestType = mode === 'status' ? RequestType.DAEMON_CONFIG_STATUS
      : (mode === 'fetch' ? RequestType.DAEMON_CONFIG_FETCH
        : (mode === 'validate' ? RequestType.DAEMON_CONFIG_VALIDATE
          : (mode === 'preview' ? RequestType.DAEMON_CONFIG_PREVIEW
            : (mode === 'apply' ? RequestType.DAEMON_CONFIG_APPLY
              : (mode === 'rollback' ? RequestType.DAEMON_CONFIG_ROLLBACK : '')))));
    const action = 'daemon.config.' + mode;
    if (requestType.length === 0) {
      result = {
        ok: false,
        code: 'daemon_config_command_invalid',
        failureCategory: 'daemon_config_command_invalid',
        action,
        message: 'Unsupported daemon config command: ' + mode,
        remediation: 'Use daemon config status, fetch, validate, preview, apply, or rollback.'
      };
    } else {
      const payload = {
        url: cliOptionValue(argv, '--url', ''),
        planId: cliOptionValue(argv, '--plan-id', ''),
        confirm: hasCliFlag(argv, '--confirm'),
        hostProfileId: cliOptionValue(argv, '--host-profile-id', '')
      };
      result = await liveManagementRpcForCli(argv, requestType, payload, action);
    }
  } else if (group === 'daemon' && command === 'autostart') {
    const mode = argv.length > 2 ? argv[2] : 'status';
    if (mode === 'status') {
      result = await autostartManager.status({ method: cliOptionValue(argv, '--method', 'auto') });
    } else if (mode === 'preview') {
      result = autostartManager.preview({ method: cliOptionValue(argv, '--method', 'auto') });
    } else if (mode === 'install') {
      result = await autostartManager.install({
        method: cliOptionValue(argv, '--method', 'auto'),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else if (mode === 'uninstall') {
      result = await autostartManager.uninstall({
        method: cliOptionValue(argv, '--method', 'auto'),
        confirm: hasCliFlag(argv, '--confirm')
      });
    } else {
      const state = mode === 'set' ? cliOptionValue(argv, '--enabled', 'off') : mode;
      result = autostartManager.setPreference({
        enabled: state === 'on' || state === 'true' || state === '1',
        method: cliOptionValue(argv, '--method', 'auto')
      });
    }
  } else if (group === 'daemon' && command === 'update') {
    const mode = argv.length > 2 ? argv[2] : 'status';
    const payload = {
      channel: cliOptionValue(argv, '--channel', 'latest'),
      version: cliOptionValue(argv, '--version', ''),
      confirm: hasCliFlag(argv, '--confirm'),
      force: hasCliFlag(argv, '--force'),
      allowLifecycleScripts: hasCliFlag(argv, '--allow-scripts'),
      allowDevelopmentInstall: hasCliFlag(argv, '--allow-development-install')
    };
    let requestType = '';
    if (mode === 'status') {
      requestType = RequestType.DAEMON_UPDATE_STATUS;
    } else if (mode === 'check') {
      requestType = RequestType.DAEMON_UPDATE_CHECK;
    } else if (mode === 'preview') {
      requestType = RequestType.DAEMON_UPDATE_PREVIEW;
    } else if (mode === 'install') {
      requestType = RequestType.DAEMON_UPDATE_INSTALL;
    } else if (mode === 'rollback') {
      requestType = RequestType.DAEMON_UPDATE_ROLLBACK;
    }
    if (requestType.length === 0) {
      result = {
        code: 'update_command_invalid',
        failureCategory: 'update_command_invalid',
        message: 'Unsupported daemon update command: ' + mode
      };
    } else {
      const rpcPayload = liveRpcPayloadOrUnavailable(await liveRpcRequest(argv, requestType, payload));
      if (!rpcPayload || rpcPayload.rpcUnavailable !== true) {
        result = rpcPayload;
      } else if (mode === 'status') {
        result = daemonUpdateManager.status();
      } else if (mode === 'check') {
        result = await daemonUpdateManager.check(payload);
      } else if (mode === 'preview') {
        result = await daemonUpdateManager.preview(payload);
      } else if (mode === 'install') {
        result = await daemonUpdateManager.install(payload);
      } else {
        result = await daemonUpdateManager.rollback(payload);
      }
    }
  } else if (group === 'daemon' && command === 'doctor') {
    result = securityDoctorForCli(store, securityAudit);
    if (hasCliFlag(argv, '--save')) {
      result = saveDaemonDoctorReportForCli(store, result);
    }
  } else if (group === 'security') {
    result = await securityCommandForCli(store, securityAudit, argv);
  }

  if (result === null) {
    throw new Error('Unsupported management command: ' + argv.join(' '));
  }
  printAndFinalizeManagementResult(argv, result);
  return true;
}

async function runLauncher(args) {
  const children = [];
  const savedProfile = loadProfile();
  const language = resolveLanguage(args.language, readString(savedProfile, 'language', ''));
  const launcherLogger = createTerminalLogger('desktop.launcher');
  printBanner(language);
  const scanResults = await withSpinner(language, t(language, 'scanProviders'), scanProviders(savedProfile || {}, { deep: false }));
  let options = buildOptions(args, savedProfile, scanResults, language);
  const daemonStore = createDaemonStore();
  options = prepareLauncherAuthentication(args, savedProfile || {}, options, daemonStore, process.env);
  printInitialNetworkHostNotice(language, options, launcherLogger);
  const existingBridge = await inspectExistingLocalBridge(daemonStore, options, savedProfile);
  if (existingBridge.kind === 'reusable') {
    printProviderTable(language, scanResults, []);
    console.log('');
    const qrInfo = writeConnectionQr(language, options);
    printConnectionPanel(language, options, qrInfo);
    if (qrInfo.qrError) {
      console.log('');
      console.log(yellow(t(language, 'qrUnavailable', { message: qrInfo.qrError })));
      launcherLogger.warn('qr.generation_failed', {
        message: qrInfo.qrError,
        payloadBytes: Buffer.byteLength(qrInfo.payload, 'utf8')
      });
    }
    if (args.terminalQr) {
      try {
        console.log('');
        console.log(bold(t(language, 'terminalQrPreview')));
        console.log(renderTerminalQr(qrInfo.payload, 4));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(yellow(t(language, 'qrUnavailable', { message })));
      }
    }
    if (options.authMode === 'bcrypt' && !args.terminalQr) {
      console.log('');
      console.log(yellow('Bcrypt credentials are memory-only. Enter the endpoint and password manually in App, or restart with --terminal-qr.'));
    }
    if (!args.noOpenQr && qrInfo.qrFiles) {
      console.log('');
      console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'openingQrAfterReady'));
      openFile(qrInfo.qrFiles.htmlPath);
    }
    launcherLogger.ready('bridge.reused', {
      healthUrl: existingBridge.healthUrl,
      qrPage: qrInfo.qrFiles ? qrInfo.qrFiles.htmlPath : '',
      authMode: options.authMode
    });
    console.log('');
    console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'existingBridgeReused', {
      url: existingBridge.healthUrl
    }));
    console.log(dim(t(language, 'existingBridgeControlHint')));
    return;
  }
  if (existingBridge.kind === 'busy') {
    throw new Error(t(language, 'existingBridgeSupervisorBusy', {
      pid: existingBridge.supervisorPid,
      url: existingBridge.healthUrl
    }));
  }
  const availablePort = await chooseAvailablePort(options.bindHost, options.port);
  if (availablePort !== options.port) {
    console.log(yellow(t(language, 'warnPrefix')) + ' ' + t(language, 'portBusy', { port: options.port, nextPort: availablePort }));
    launcherLogger.warn('port.reassigned', {
      requestedPort: options.port,
      selectedPort: availablePort,
      bindHost: options.bindHost
    });
    options.port = availablePort;
  }

  const startPlan = [];
  if (options.startOpenCode) {
    startPlan.push('opencode');
  }
  if (options.startDevEco) {
    startPlan.push('deveco');
  }
  if (options.startMimoCode) {
    startPlan.push('mimo');
  }
  if (options.startOpenClawGateway) {
    startPlan.push('openclaw-gateway');
  }
  if (options.startHermesStudio) {
    startPlan.push('hermes-studio');
  }

  printProviderTable(language, scanResults, startPlan);
  console.log('');

  let bridgeChild = null;
  let stopNetworkAddressMonitor = () => {};
  let shuttingDown = false;
  const shutdownController = new AbortController();
  function requestShutdown(signalName) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    shutdownController.abort();
    stopNetworkAddressMonitor();
    launcherLogger.warn('shutdown.requested', {
      signal: signalName
    });
    console.log('');
    console.log(dim(t(language, 'stopping')));
    shutdownChildren(children);
  }
  process.once('SIGINT', () => requestShutdown('SIGINT'));
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));

  try {
    await startProviderServers(language, options, scanResults, children, shutdownController.signal);
    if (shuttingDown) {
      return;
    }
    bridgeChild = await startBridge(language, options, children, shutdownController.signal);
    if (!bridgeChild || shuttingDown) {
      return;
    }
    saveOptions(options);
    const qrInfo = writeConnectionQr(language, options);
    printConnectionPanel(language, options, qrInfo);
    if (qrInfo.qrError) {
      console.log('');
      console.log(yellow(t(language, 'qrUnavailable', { message: qrInfo.qrError })));
      launcherLogger.warn('qr.generation_failed', {
        message: qrInfo.qrError,
        payloadBytes: Buffer.byteLength(qrInfo.payload, 'utf8')
      });
    }
    if (args.terminalQr) {
      try {
        console.log('');
        console.log(bold(t(language, 'terminalQrPreview')));
        console.log(renderTerminalQr(qrInfo.payload, 4));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(yellow(t(language, 'qrUnavailable', { message })));
        launcherLogger.warn('qr.terminal_generation_failed', {
          message,
          payloadBytes: Buffer.byteLength(qrInfo.payload, 'utf8')
        });
      }
    }
    if (options.authMode === 'bcrypt' && !args.terminalQr) {
      console.log('');
      console.log(yellow('Bcrypt credentials are memory-only. Enter the endpoint and password manually in App, or restart with --terminal-qr.'));
    }
    if (!args.noOpenQr && qrInfo.qrFiles) {
      console.log('');
      console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'openingQrAfterReady'));
      openFile(qrInfo.qrFiles.htmlPath);
    }
    launcherLogger.ready('bridge.ready', {
      healthUrl: healthUrlForBridge(options),
      qrPage: qrInfo.qrFiles ? qrInfo.qrFiles.htmlPath : '',
      authMode: options.authMode
    });
    console.log('');
    console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'ready'));
    console.log('');
    stopNetworkAddressMonitor = startNetworkAddressMonitor(options, (previousHost, nextHost) => {
      if (shuttingDown) {
        return;
      }
      console.log('');
      console.log(yellow(t(language, 'networkHostUpdated', { previousHost, nextHost })));
      launcherLogger.warn('network.connect_host_changed', {
        previousHost,
        nextHost,
        bindHost: options.bindHost
      });
      const refreshedQrInfo = writeConnectionQr(language, options);
      printConnectionPanel(language, options, refreshedQrInfo);
      if (refreshedQrInfo.qrError) {
        console.log(yellow(t(language, 'qrUnavailable', { message: refreshedQrInfo.qrError })));
      } else if (!args.noOpenQr && refreshedQrInfo.qrFiles) {
        openFile(refreshedQrInfo.qrFiles.htmlPath);
      }
    });
    const code = await waitForExit(bridgeChild);
    if (!shuttingDown && code !== 0) {
      throw new Error(t(language, 'bridgeExited', { code }));
    }
  } finally {
    stopNetworkAddressMonitor();
    shutdownChildren(children);
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (await runManagementCommand(rawArgs)) {
    return;
  }
  const args = parseArgs(rawArgs);
  if (args.help) {
    const savedProfile = loadProfile();
    printHelp(resolveLanguage(args.language, readString(savedProfile, 'language', '')));
    return;
  }
  if (args.setup) {
    await runSetup(args);
    return;
  }
  if (args.doctor) {
    await runDoctor(args);
    return;
  }
  await runLauncher(args);
}

if (require.main === module) {
  main().catch((error) => {
    const args = parseArgs(process.argv.slice(2));
    const savedProfile = loadProfile();
    const language = resolveLanguage(args.language, readString(savedProfile, 'language', ''));
    console.error(red(t(language, 'errorPrefix')) + ' ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}

module.exports = {
  prepareLauncherAuthentication,
  readBridgeHealth,
  removePersistedConnectionQrFiles,
  waitForExit,
  waitHttpOk
};
