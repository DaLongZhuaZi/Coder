#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { connectionEndpoint, connectionPayload, listIPv4Addresses } = require('./connect-wizard');
const { resolveLanguage, t } = require('./i18n');
const { openFile } = require('./open-file');
const { loadProfile, profileDirectory, profilePath, saveProfile } = require('./profile-store');
const { scanProviders } = require('./provider-scan');
const { renderTerminalQr, writeQrImageFiles } = require('./qr-code');
const { createTerminalLogger } = require('./terminal-log');

const COLOR_ENABLED = process.env.NO_COLOR !== '1' && process.env.NO_COLOR !== 'true' && process.stdout.isTTY !== false;
const SPINNER_FRAMES = ['-', '\\', '|', '/'];

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
    connectHost: '',
    bindHost: '',
    port: 0,
    token: '',
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
    if ((id === 'opencode' || id === 'deveco' || id === 'mimo') && !target.includes(id)) {
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

function chooseDefaultAddress(addresses) {
  for (const item of addresses) {
    if (!item.internal && !item.address.startsWith('169.254.')) {
      return item.address;
    }
  }
  return '127.0.0.1';
}

function bindHostForConnectHost(connectHost) {
  if (connectHost === '127.0.0.1' || connectHost === 'localhost') {
    return '127.0.0.1';
  }
  return '0.0.0.0';
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
  const defaultConnectHost = chooseDefaultAddress(addresses);
  const profileConnectHost = readString(savedProfile, 'connectHost', defaultConnectHost);
  const connectHost = args.connectHost.length > 0 ? args.connectHost : profileConnectHost;
  const bindHost = args.bindHost.length > 0 ? args.bindHost : readString(savedProfile, 'bindHost', bindHostForConnectHost(connectHost));
  const port = args.port > 0 ? args.port : parsePort(readString(savedProfile, 'port', ''), savedProfile && savedProfile.port ? savedProfile.port : 8787);
  const token = args.token.length > 0 ? args.token : readString(savedProfile, 'token', crypto.randomBytes(24).toString('hex'));

  const openCodeCommand = scannedCommand(scanResults, 'opencode', readString(savedProfile, 'openCodeCommand', 'opencode'));
  const devEcoCommand = scannedCommand(scanResults, 'deveco', readString(savedProfile, 'devEcoCommand', 'deveco'));
  const mimoCodeCommand = scannedCommand(scanResults, 'mimo', readString(savedProfile, 'mimoCodeCommand', 'mimo'));

  return {
    repoRoot: resolveRepoRoot(),
    language,
    connectHost,
    bindHost,
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
    startOpenCode: shouldStartProvider(args, scanResults, 'opencode'),
    startDevEco: shouldStartProvider(args, scanResults, 'deveco'),
    startMimoCode: shouldStartProvider(args, scanResults, 'mimo'),
    codexCommand: scannedCommand(scanResults, 'codex', readString(savedProfile, 'codexCommand', 'codex')),
    claudeCommand: scannedCommand(scanResults, 'claude', readString(savedProfile, 'claudeCommand', 'claude')),
    antigravityCommand: scannedCommand(scanResults, 'antigravity', readString(savedProfile, 'antigravityCommand', 'antigravity')),
    antigravityArgs: readString(savedProfile, 'antigravityArgs', '')
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
    antigravityArgs: options.antigravityArgs
  });
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

function waitHttpOk(urlText, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const req = http.request(urlText, { method: 'GET', timeout: 1600 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
          return;
        }
        retry();
      });
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.on('error', retry);
      req.end();
    }

    function retry() {
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(attempt, 500);
    }

    attempt();
  });
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
  return options.mimoCodeUrl;
}

function providerCommand(options, providerId) {
  if (providerId === 'opencode') {
    return options.openCodeCommand;
  }
  if (providerId === 'deveco') {
    return options.devEcoCommand;
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

async function startCompatibleServer(language, options, providerId, children) {
  const label = providerLabel(providerId);
  const serverUrl = providerUrl(options, providerId);
  const command = providerCommand(options, providerId);
  const defaultPort = providerId === 'opencode' ? 4096 : (providerId === 'deveco' ? 4097 : 4098);
  const address = parseServerAddress(serverUrl, defaultPort);
  const child = spawn(command, ['serve', '--hostname', address.host, '--port', address.port], {
    cwd: options.repoRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  attachOutput(child, label);
  child.on('error', (error) => {
    console.log(red(t(language, 'errorPrefix')) + ' ' + t(language, 'providerStartFailed', { label, message: error.message }));
  });
  const ok = await withSpinner(language, t(language, 'waitingProvider', { label, url: serverUrl }), waitHttpOk(serverUrl + '/global/health', 30000));
  if (!ok) {
    console.log(yellow(t(language, 'warnPrefix')) + ' ' + t(language, 'providerNotHealthy', { label }));
  }
}

async function startProviderServers(language, options, scanResults, children) {
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

  for (const providerId of startIds) {
    const scan = findScanResult(scanResults, providerId);
    if (!scan || scan.serverHealthy || !scan.installed) {
      continue;
    }
    await startCompatibleServer(language, options, providerId, children);
  }
}

function writeConnectionQr(language, options) {
  const endpoint = connectionEndpoint(options.connectHost, options.port);
  const payload = connectionPayload(endpoint, options.token, options.providerId, options.workspacePath, options.workspaceTitle);
  const qrFiles = writeQrImageFiles(payload, profileDirectory(), 'agent-bridge-connection', {
    targetSize: 720,
    quietZone: 6,
    title: t(language, 'qrTitle'),
    description: t(language, 'qrDescription'),
    warning: t(language, 'qrWarning'),
    fields: [
      { label: t(language, 'bridgeUrl'), value: endpoint },
      { label: t(language, 'token'), value: options.token }
    ]
  });
  return { endpoint, payload, qrFiles };
}

function printConnectionPanel(language, options, qrInfo) {
  const rows = [
    [t(language, 'bridgeUrl'), qrInfo.endpoint],
    [t(language, 'httpHealth'), healthUrlForBridge(options)],
    [t(language, 'token'), options.token],
    [t(language, 'qrPage'), qrInfo.qrFiles.htmlPath],
    [t(language, 'profile'), profilePath()]
  ];
  printTable([t(language, 'fieldHeader'), t(language, 'valueHeader')], rows);
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

async function startBridge(language, options, children) {
  const serverPath = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: options.repoRoot,
    env: bridgeEnvironment(options),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  attachOutput(child, t(language, 'bridgeOutputLabel'), { passthrough: true });
  child.on('error', (error) => {
    console.log(red(t(language, 'errorPrefix')) + ' ' + t(language, 'bridgeStartFailed', { message: error.message }));
  });
  const ok = await withSpinner(language, t(language, 'waitingBridge', { url: healthUrlForBridge(options) }), waitHttpOk(healthUrlForBridge(options), 12000));
  if (!ok) {
    throw new Error(t(language, 'bridgeNotHealthy'));
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
  console.log('  node tools/agent-bridge/src/desktop-launcher.js --start opencode');
  console.log('');
  console.log(t(language, 'options'));
  printOption('--setup', t(language, 'helpSetup'));
  printOption('--doctor', t(language, 'helpDoctor'));
  printOption('--start <ids>', t(language, 'helpStart'));
  printOption('--no-start-providers', t(language, 'helpNoStartProviders'));
  printOption('--connect-host <host>', t(language, 'helpConnectHost'));
  printOption('--bind-host <host>', t(language, 'helpBindHost'));
  printOption('--port <port>', t(language, 'helpPort'));
  printOption('--token <token>', t(language, 'helpToken'));
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
    if (child && !child.killed) {
      child.kill();
    }
  }
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code === null ? 0 : code));
  });
}

async function runSetup(args) {
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
  printProviderTable(language, scanResults, startPlan);
  console.log('');
  console.log(t(language, 'doctorProfile') + ': ' + profilePath());
  console.log(t(language, 'suggestedBridgeUrl') + ': ' + connectionEndpoint(options.connectHost, options.port));
}

async function runLauncher(args) {
  const children = [];
  const savedProfile = loadProfile();
  const language = resolveLanguage(args.language, readString(savedProfile, 'language', ''));
  const launcherLogger = createTerminalLogger('desktop.launcher');
  printBanner(language);
  const scanResults = await withSpinner(language, t(language, 'scanProviders'), scanProviders(savedProfile || {}, { deep: false }));
  let options = buildOptions(args, savedProfile, scanResults, language);
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

  saveOptions(options);

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

  printProviderTable(language, scanResults, startPlan);
  console.log('');

  let bridgeChild = null;
  let shuttingDown = false;
  function requestShutdown(signalName) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
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
    await startProviderServers(language, options, scanResults, children);
    bridgeChild = await startBridge(language, options, children);
    const qrInfo = writeConnectionQr(language, options);
    printConnectionPanel(language, options, qrInfo);
    if (args.terminalQr) {
      console.log('');
      console.log(bold(t(language, 'terminalQrPreview')));
      console.log(renderTerminalQr(qrInfo.payload, 4));
    }
    if (!args.noOpenQr) {
      console.log('');
      console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'openingQrAfterReady'));
      openFile(qrInfo.qrFiles.htmlPath);
    }
    launcherLogger.ready('bridge.ready', {
      healthUrl: healthUrlForBridge(options),
      qrPage: qrInfo.qrFiles.htmlPath
    });
    console.log('');
    console.log(green(t(language, 'readyPrefix')) + ' ' + t(language, 'ready'));
    console.log('');
    const code = await waitForExit(bridgeChild);
    if (!shuttingDown && code !== 0) {
      throw new Error(t(language, 'bridgeExited', { code }));
    }
  } finally {
    shutdownChildren(children);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
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
