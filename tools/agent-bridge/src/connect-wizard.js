'use strict';

const crypto = require('crypto');
const net = require('net');
const path = require('path');
const readline = require('readline/promises');
const { spawn } = require('child_process');
const { loadProfile, profilePath, saveProfile } = require('./profile-store');
const { publicDeviceIdentity } = require('./device-identity');
const { scanProviders } = require('./provider-scan');
const { writeQrImageFiles } = require('./qr-code');
const { chooseDefaultAddress, listIPv4Addresses } = require('./network-address');

const STRINGS = {
  en: {
    title: 'NGF Agent Bridge connection wizard',
    repo: 'Repository',
    lanHint: 'Use a LAN IP for a real phone. 127.0.0.1 only works on this computer.',
    languagePrompt: 'Language / 语言: zh or en [en] ',
    availableIp: 'Available IPv4 addresses:',
    recommended: 'recommended',
    local: 'local',
    lan: 'LAN',
    hostQuestion: 'Phone should connect to which host/IP?',
    portQuestion: 'Bridge port',
    tokenQuestion: 'Bridge token',
    random: 'random',
    portBusy: 'Port {port} is already in use. Using {nextPort} instead.',
    scanning: 'Scanning local providers...',
    detectedProviders: 'Detected providers:',
    installed: 'installed',
    missing: 'missing',
    serverReady: 'server ready',
    allProviders: 'All detected providers',
    workspaceFromSession: 'from selected provider session',
    useLastQuestion: 'Reuse last saved connection values after refreshing provider scan?',
    profilePath: 'Profile',
    savedProfile: 'Saved startup profile',
    serverUrlQuestion: '{name} server URL',
    cliCommandQuestion: '{name} command',
    antigravityArgsQuestion: 'Antigravity args',
    appValues: 'App connection values',
    bridgeUrl: 'Bridge URL',
    token: 'Token',
    provider: 'Provider',
    workspace: 'Workspace',
    qrFiles: 'QR image files',
    qrHtml: 'Display page',
    qrSecret: 'QR payload contains the token. Do not share screenshots publicly.',
    qrUnavailable: 'QR generation failed. Agent Bridge can still start; enter the connection values manually: ',
    qrDisplayTitle: 'Agent Bridge QR',
    qrDisplayDesc: 'Scan this page from the NGF app connection settings. Keep the browser zoom at 100% if scanning is unstable.',
    terminalQr: 'Terminal QR preview:',
    openingQr: 'Opening QR display page. Scan it from the app connection settings.',
    manualCommand: 'Manual startup command:',
    startQuestion: 'Starting Agent Bridge now.',
    starting: 'Starting Agent Bridge. Press Ctrl+C in this terminal to stop it.',
    helpUsage: 'Usage:',
    helpText: 'The wizard scans all local providers, saves a startup profile, writes QR files, and can start Agent Bridge.',
    resetDone: 'Saved profile removed.'
  },
  zh: {
    title: 'NGF Agent Bridge 连接向导',
    repo: '仓库',
    lanHint: '真机请使用局域网 IP。127.0.0.1 只适用于这台电脑本机。',
    languagePrompt: '语言 / Language: zh 或 en [zh] ',
    availableIp: '可用 IPv4 地址:',
    recommended: '推荐',
    local: '本机',
    lan: '局域网',
    hostQuestion: '手机连接哪一个主机/IP?',
    portQuestion: 'Bridge 端口',
    tokenQuestion: 'Bridge Token',
    random: '随机生成',
    portBusy: '端口 {port} 已被占用，已自动改用 {nextPort}。',
    scanning: '正在扫描本机 Provider...',
    detectedProviders: '已检测到的 Provider:',
    installed: '已安装',
    missing: '未发现',
    serverReady: '服务已就绪',
    allProviders: '全部已检测 Provider',
    workspaceFromSession: '从选择的 Provider 会话同步',
    useLastQuestion: '刷新 Provider 扫描后复用上次保存的连接信息?',
    profilePath: '配置文件',
    savedProfile: '已保存启动配置',
    serverUrlQuestion: '{name} 服务地址',
    cliCommandQuestion: '{name} 命令',
    antigravityArgsQuestion: 'Antigravity 参数',
    appValues: 'App 连接信息',
    bridgeUrl: 'Bridge 地址',
    token: 'Token',
    provider: 'Provider',
    workspace: '工作区',
    qrFiles: '二维码文件',
    qrHtml: '显示页面',
    qrSecret: '二维码内容包含 Token，请不要公开分享截图。',
    qrUnavailable: '二维码生成失败。Agent Bridge 仍可启动，请手动填写连接信息：',
    qrDisplayTitle: 'Agent Bridge 二维码',
    qrDisplayDesc: '请在 NGF App 连接设置中扫描此页面。如果识别不稳定，请保持浏览器缩放为 100%。',
    terminalQr: '终端二维码预览:',
    openingQr: '正在打开二维码显示页面，请在 App 连接设置中扫码。',
    manualCommand: '手动启动命令:',
    startQuestion: '现在启动 Agent Bridge。',
    starting: '正在启动 Agent Bridge。按 Ctrl+C 可停止。',
    helpUsage: '用法:',
    helpText: '向导会扫描本机全部 Provider、保存启动配置、生成二维码，并可启动 Agent Bridge。',
    resetDone: '已删除保存的配置。'
  }
};

function resolveRepoRoot() {
  return process.cwd();
}

function tr(language, key) {
  const table = language === 'zh' ? STRINGS.zh : STRINGS.en;
  return table[key] || STRINGS.en[key] || key;
}

function formatPortBusy(value, port, nextPort) {
  return value.split('{port}').join(String(port)).split('{nextPort}').join(String(nextPort));
}

function normalizeLanguage(value, fallbackValue) {
  const trimmed = String(value || '').trim().toLowerCase();
  if (trimmed === 'zh' || trimmed === 'cn' || trimmed === 'chinese' || trimmed === '中文') {
    return 'zh';
  }
  if (trimmed === 'en' || trimmed === 'english') {
    return 'en';
  }
  return fallbackValue === 'zh' || fallbackValue === 'en' ? fallbackValue : 'en';
}

function parseArgs(argv) {
  const result = {
    terminalQr: argv.includes('--terminal-qr'),
    reuseLast: argv.includes('--reuse-last') || argv.includes('--last'),
    reset: argv.includes('--reset'),
    language: ''
  };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--language' || value === '--lang') {
      result.language = index + 1 < argv.length ? argv[index + 1] : '';
    } else if (value.startsWith('--language=')) {
      result.language = value.substring('--language='.length);
    } else if (value.startsWith('--lang=')) {
      result.language = value.substring('--lang='.length);
    }
  }
  return result;
}

function parsePort(value, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallbackValue;
  }
  return parsed;
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
    port = port + 1;
  }
  return requestedPort;
}

function yes(value, fallbackValue) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return fallbackValue;
  }
  return trimmed === 'y' || trimmed === 'yes' || trimmed === 'true' || trimmed === '1' || trimmed === '是' || trimmed === '好';
}

function connectionEndpoint(host, port) {
  return 'ws://' + host + ':' + String(port) + '/ws';
}

function connectionUri(endpoint, token, providerId, workspacePath, workspaceTitle, deviceIdentity) {
  const params = [];
  params.push('endpoint=' + encodeURIComponent(endpoint));
  params.push('token=' + encodeURIComponent(token));
  if (deviceIdentity && typeof deviceIdentity.physicalDeviceId === 'string' && deviceIdentity.physicalDeviceId.length > 0) {
    params.push('physicalDeviceId=' + encodeURIComponent(deviceIdentity.physicalDeviceId));
    params.push('bridgeInstanceId=' + encodeURIComponent(deviceIdentity.bridgeInstanceId || ''));
    params.push('deviceName=' + encodeURIComponent(deviceIdentity.displayName || ''));
    params.push('devicePlatform=' + encodeURIComponent(deviceIdentity.platform || ''));
    params.push('publicKeyFingerprint=' + encodeURIComponent(deviceIdentity.publicKeyFingerprint || ''));
  }
  if (providerId.length > 0) {
    params.push('providerId=' + encodeURIComponent(providerId));
  }
  if (workspacePath.length > 0) {
    params.push('workspacePath=' + encodeURIComponent(workspacePath));
  }
  if (workspaceTitle.length > 0) {
    params.push('workspaceTitle=' + encodeURIComponent(workspaceTitle));
  }
  return 'ngf-agent-bridge://connect?' + params.join('&');
}

function connectionPayload(endpoint, token, providerId, workspacePath, workspaceTitle, deviceIdentity) {
  const value = {
    endpoint,
    token
  };
  if (deviceIdentity && typeof deviceIdentity.physicalDeviceId === 'string' && deviceIdentity.physicalDeviceId.length > 0) {
    value.deviceIdentity = deviceIdentity;
  }
  if (providerId.length > 0) {
    value.providerId = providerId;
  }
  if (workspacePath.length > 0) {
    value.workspacePath = workspacePath;
  }
  if (workspaceTitle.length > 0) {
    value.workspaceTitle = workspaceTitle;
  }
  return JSON.stringify(value);
}

function qrOutputDirectory() {
  return path.join(os.homedir(), '.ngf-agent-bridge');
}

function startCommandHint() {
  const lifecycleEvent = process.env.npm_lifecycle_event || '';
  if (lifecycleEvent.startsWith('agent-bridge')) {
    return 'npm run agent-bridge:start';
  }
  if (lifecycleEvent === 'setup' || lifecycleEvent === 'start') {
    return 'npm start';
  }
  return 'ngf-agent-bridge';
}

function printScanResults(language, scanResults) {
  console.log('');
  console.log(tr(language, 'detectedProviders'));
  for (let index = 0; index < scanResults.length; index++) {
    const item = scanResults[index];
    const statusParts = [];
    statusParts.push(item.installed ? tr(language, 'installed') : tr(language, 'missing'));
    if (item.serverHealthy) {
      statusParts.push(tr(language, 'serverReady'));
    }
    console.log('  ' + String(index + 1) + '. ' + item.displayName + '  ' + statusParts.join(' / '));
  }
}

function findScanResult(scanResults, providerId) {
  for (const item of scanResults) {
    if (item.id === providerId) {
      return item;
    }
  }
  return null;
}

async function askAddress(rl, language, addresses, lastAddress) {
  const defaultAddress = chooseDefaultAddress(addresses, lastAddress);
  console.log('');
  console.log(tr(language, 'availableIp'));
  for (let i = 0; i < addresses.length; i++) {
    const marker = addresses[i].address === defaultAddress ? ' (' + tr(language, 'recommended') + ')' : '';
    const scope = addresses[i].internal ? tr(language, 'local') : tr(language, 'lan');
    console.log('  ' + String(i + 1) + '. ' + addresses[i].address + '  ' + addresses[i].name + '  ' + scope + marker);
  }
  if (addresses.length === 0) {
    console.log('  1. 127.0.0.1  loopback  ' + tr(language, 'local'));
  }
  const answer = await rl.question(tr(language, 'hostQuestion') + ' [' + defaultAddress + '] ');
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return defaultAddress;
  }
  const selected = Number.parseInt(trimmed, 10);
  if (Number.isFinite(selected) && selected >= 1 && selected <= addresses.length) {
    return addresses[selected - 1].address;
  }
  return trimmed;
}

async function askLanguage(rl, args, savedProfile) {
  if (args.language.length > 0) {
    return normalizeLanguage(args.language, 'en');
  }
  if (savedProfile && savedProfile.language.length > 0) {
    return normalizeLanguage(savedProfile.language, 'en');
  }
  const defaultLanguage = 'zh';
  const answer = await rl.question(STRINGS.zh.languagePrompt);
  return normalizeLanguage(answer, defaultLanguage);
}

function optionsFromProfile(repoRoot, profile) {
  const connectHost = profile.connectHost.length > 0 ? profile.connectHost : '127.0.0.1';
  const bindHost = profile.bindHost.length > 0 ? profile.bindHost : (connectHost === '127.0.0.1' || connectHost === 'localhost' ? '127.0.0.1' : '0.0.0.0');
  return {
    repoRoot,
    language: profile.language.length > 0 ? profile.language : 'en',
    connectHost,
    bindHost,
    port: profile.port > 0 ? profile.port : 8787,
    token: profile.token.length > 0 ? profile.token : crypto.randomBytes(18).toString('hex'),
    providerId: '',
    startOpenCode: profile.startOpenCode,
    startDevEco: profile.startDevEco,
    startMimoCode: profile.startMimoCode,
    workspacePath: '',
    workspaceTitle: '',
    openCodeCommand: profile.openCodeCommand.length > 0 ? profile.openCodeCommand : 'opencode',
    devEcoCommand: profile.devEcoCommand.length > 0 ? profile.devEcoCommand : 'deveco',
    mimoCodeCommand: profile.mimoCodeCommand.length > 0 ? profile.mimoCodeCommand : 'mimo',
    openCodeUrl: profile.openCodeUrl.length > 0 ? profile.openCodeUrl : 'http://127.0.0.1:4096',
    devEcoUrl: profile.devEcoUrl.length > 0 ? profile.devEcoUrl : 'http://127.0.0.1:4097',
    mimoCodeUrl: profile.mimoCodeUrl.length > 0 ? profile.mimoCodeUrl : 'http://127.0.0.1:4098',
    codexCommand: profile.codexCommand.length > 0 ? profile.codexCommand : 'codex',
    claudeCommand: profile.claudeCommand.length > 0 ? profile.claudeCommand : 'claude',
    antigravityCommand: profile.antigravityCommand.length > 0 ? profile.antigravityCommand : 'antigravity',
    antigravityArgs: profile.antigravityArgs,
    openClawCommand: profile.openClawCommand.length > 0 ? profile.openClawCommand : 'openclaw',
    openClawArgs: profile.openClawArgs.length > 0 ? profile.openClawArgs : 'agent --message',
    openClawGatewayUrl: profile.openClawGatewayUrl.length > 0 ? profile.openClawGatewayUrl : 'http://127.0.0.1:18789',
    openClawGatewayModel: profile.openClawGatewayModel.length > 0 ? profile.openClawGatewayModel : 'openclaw/default',
    startOpenClawGateway: profile.startOpenClawGateway,
    hermesCommand: profile.hermesCommand.length > 0 ? profile.hermesCommand : 'hermes',
    hermesArgs: profile.hermesArgs.length > 0 ? profile.hermesArgs : 'chat --quiet -q',
    hermesStudioCommand: profile.hermesStudioCommand.length > 0 ? profile.hermesStudioCommand : 'hermes-web-ui',
    hermesStudioArgs: profile.hermesStudioArgs.length > 0 ? profile.hermesStudioArgs : 'start --no-open',
    hermesStudioUrl: profile.hermesStudioUrl.length > 0 ? profile.hermesStudioUrl : 'http://127.0.0.1:8648',
    hermesStudioProfile: profile.hermesStudioProfile.length > 0 ? profile.hermesStudioProfile : 'default',
    hermesStudioProvider: profile.hermesStudioProvider,
    hermesStudioModel: profile.hermesStudioModel,
    startHermesStudio: profile.startHermesStudio
  };
}

function applyScanToOptions(options, scanResults) {
  const openCodeScan = findScanResult(scanResults, 'opencode');
  const devEcoScan = findScanResult(scanResults, 'deveco');
  const mimoScan = findScanResult(scanResults, 'mimo');
  const codexScan = findScanResult(scanResults, 'codex');
  const claudeScan = findScanResult(scanResults, 'claude');
  const antigravityScan = findScanResult(scanResults, 'antigravity');
  const openClawScan = findScanResult(scanResults, 'openclaw');
  const openClawGatewayScan = findScanResult(scanResults, 'openclaw-gateway');
  const hermesScan = findScanResult(scanResults, 'hermes');
  const hermesStudioScan = findScanResult(scanResults, 'hermes-studio');
  return {
    repoRoot: options.repoRoot,
    language: options.language,
    connectHost: options.connectHost,
    bindHost: options.bindHost,
    port: options.port,
    token: options.token,
    providerId: '',
    startOpenCode: shouldStartCompatibleServer(openCodeScan, options.startOpenCode),
    startDevEco: shouldStartCompatibleServer(devEcoScan, options.startDevEco),
    startMimoCode: shouldStartCompatibleServer(mimoScan, options.startMimoCode),
    workspacePath: options.workspacePath,
    workspaceTitle: options.workspaceTitle,
    openCodeCommand: scannedCommand(openCodeScan, options.openCodeCommand),
    devEcoCommand: scannedCommand(devEcoScan, options.devEcoCommand),
    mimoCodeCommand: scannedCommand(mimoScan, options.mimoCodeCommand),
    openCodeUrl: options.openCodeUrl,
    devEcoUrl: options.devEcoUrl,
    mimoCodeUrl: options.mimoCodeUrl,
    codexCommand: scannedCommand(codexScan, options.codexCommand),
    claudeCommand: scannedCommand(claudeScan, options.claudeCommand),
    antigravityCommand: scannedCommand(antigravityScan, options.antigravityCommand),
    antigravityArgs: options.antigravityArgs,
    openClawCommand: scannedCommand(openClawScan, options.openClawCommand),
    openClawArgs: options.openClawArgs,
    openClawGatewayUrl: options.openClawGatewayUrl,
    openClawGatewayModel: options.openClawGatewayModel,
    startOpenClawGateway: shouldStartCompatibleServer(openClawGatewayScan, options.startOpenClawGateway),
    hermesCommand: scannedCommand(hermesScan, options.hermesCommand),
    hermesArgs: options.hermesArgs,
    hermesStudioCommand: scannedCommand(hermesStudioScan, options.hermesStudioCommand),
    hermesStudioArgs: options.hermesStudioArgs,
    hermesStudioUrl: options.hermesStudioUrl,
    hermesStudioProfile: options.hermesStudioProfile,
    hermesStudioProvider: options.hermesStudioProvider,
    hermesStudioModel: options.hermesStudioModel,
    startHermesStudio: shouldStartCompatibleServer(hermesStudioScan, options.startHermesStudio)
  };
}

function shouldStartCompatibleServer(scanResult, previousValue) {
  if (!scanResult) {
    return previousValue === true;
  }
  if (!scanResult.canStartServer || !scanResult.installed || scanResult.serverHealthy) {
    return false;
  }
  return true;
}

function scannedCommand(scanResult, fallbackValue) {
  if (scanResult && scanResult.command.length > 0) {
    return scanResult.command;
  }
  return fallbackValue;
}

async function askConfiguration(rl, language, repoRoot, addresses, savedProfile, scanResults) {
  const previous = savedProfile || {};
  const connectHost = await askAddress(rl, language, addresses, previous.connectHost || '');
  const bindHost = connectHost === '127.0.0.1' || connectHost === 'localhost' ? '127.0.0.1' : '0.0.0.0';
  const defaultPort = previous.port || 8787;
  const portAnswer = await rl.question(tr(language, 'portQuestion') + ' [' + String(defaultPort) + '] ');
  const requestedPort = parsePort(portAnswer.trim(), defaultPort);
  const availablePort = await chooseAvailablePort(bindHost, requestedPort);
  if (availablePort !== requestedPort) {
    console.log(formatPortBusy(tr(language, 'portBusy'), requestedPort, availablePort));
  }
  const port = availablePort;
  const tokenDefault = previous.token || tr(language, 'random');
  const tokenAnswer = await rl.question(tr(language, 'tokenQuestion') + ' [' + tokenDefault + '] ');
  const token = tokenAnswer.trim().length > 0 ? tokenAnswer.trim() : (previous.token || crypto.randomBytes(18).toString('hex'));

  let openCodeUrl = previous.openCodeUrl || 'http://127.0.0.1:4096';
  let devEcoUrl = previous.devEcoUrl || 'http://127.0.0.1:4097';
  let mimoCodeUrl = previous.mimoCodeUrl || 'http://127.0.0.1:4098';
  let openCodeCommand = previous.openCodeCommand || commandForScan(scanResults, 'opencode', 'opencode');
  let devEcoCommand = previous.devEcoCommand || commandForScan(scanResults, 'deveco', 'deveco');
  let mimoCodeCommand = previous.mimoCodeCommand || commandForScan(scanResults, 'mimo', 'mimo');
  let codexCommand = previous.codexCommand || commandForScan(scanResults, 'codex', 'codex');
  let claudeCommand = previous.claudeCommand || commandForScan(scanResults, 'claude', 'claude');
  let antigravityCommand = previous.antigravityCommand || commandForScan(scanResults, 'antigravity', 'antigravity');
  let antigravityArgs = previous.antigravityArgs || '';
  let openClawCommand = previous.openClawCommand || commandForScan(scanResults, 'openclaw', 'openclaw');
  let openClawArgs = previous.openClawArgs || 'agent --message';
  let openClawGatewayUrl = previous.openClawGatewayUrl || 'http://127.0.0.1:18789';
  let openClawGatewayModel = previous.openClawGatewayModel || 'openclaw/default';
  let hermesCommand = previous.hermesCommand || commandForScan(scanResults, 'hermes', 'hermes');
  let hermesArgs = previous.hermesArgs || 'chat --quiet -q';
  let hermesStudioCommand = previous.hermesStudioCommand || commandForScan(scanResults, 'hermes-studio', 'hermes-web-ui');
  let hermesStudioArgs = previous.hermesStudioArgs || 'start --no-open';
  let hermesStudioUrl = previous.hermesStudioUrl || 'http://127.0.0.1:8648';
  let hermesStudioProfile = previous.hermesStudioProfile || 'default';
  let hermesStudioProvider = previous.hermesStudioProvider || '';
  let hermesStudioModel = previous.hermesStudioModel || '';
  const openCodeScan = findScanResult(scanResults, 'opencode');
  const devEcoScan = findScanResult(scanResults, 'deveco');
  const mimoScan = findScanResult(scanResults, 'mimo');
  const openClawGatewayScan = findScanResult(scanResults, 'openclaw-gateway');
  const hermesStudioScan = findScanResult(scanResults, 'hermes-studio');
  let startOpenCode = openCodeScan ? openCodeScan.installed && !openCodeScan.serverHealthy : false;
  let startDevEco = devEcoScan ? devEcoScan.installed && !devEcoScan.serverHealthy : false;
  let startMimoCode = mimoScan ? mimoScan.installed && !mimoScan.serverHealthy : false;
  let startOpenClawGateway = openClawGatewayScan ? openClawGatewayScan.installed && !openClawGatewayScan.serverHealthy : false;
  let startHermesStudio = hermesStudioScan ? hermesStudioScan.installed && !hermesStudioScan.serverHealthy : false;
  return {
    repoRoot,
    language,
    connectHost,
    bindHost,
    port,
    token,
    providerId: '',
    startOpenCode,
    startDevEco,
    startMimoCode,
    startOpenClawGateway,
    startHermesStudio,
    workspacePath: '',
    workspaceTitle: '',
    openCodeCommand,
    devEcoCommand,
    mimoCodeCommand,
    openCodeUrl,
    devEcoUrl,
    mimoCodeUrl,
    codexCommand,
    claudeCommand,
    antigravityCommand,
    antigravityArgs,
    openClawCommand,
    openClawArgs,
    openClawGatewayUrl,
    openClawGatewayModel,
    hermesCommand,
    hermesArgs,
    hermesStudioCommand,
    hermesStudioArgs,
    hermesStudioUrl,
    hermesStudioProfile,
    hermesStudioProvider,
    hermesStudioModel
  };
}

function commandForScan(scanResults, providerId, fallbackValue) {
  const item = findScanResult(scanResults, providerId);
  if (item && item.command.length > 0) {
    return item.command;
  }
  return fallbackValue;
}

function saveOptions(options) {
  return saveProfile({
    language: options.language,
    connectHost: options.connectHost,
    bindHost: options.bindHost,
    port: options.port,
    token: options.token,
    providerId: '',
    workspacePath: options.workspacePath,
    workspaceTitle: options.workspaceTitle,
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

function printConnectionSummary(language, options, qrFiles, qrError) {
  const endpoint = connectionEndpoint(options.connectHost, options.port);
  console.log('');
  console.log(tr(language, 'appValues'));
  console.log('  ' + tr(language, 'bridgeUrl') + ':  ' + endpoint);
  console.log('  ' + tr(language, 'token') + ':       ' + options.token);
  console.log('  ' + tr(language, 'provider') + ':    ' + tr(language, 'allProviders'));
  console.log('  ' + tr(language, 'workspace') + ':   ' + tr(language, 'workspaceFromSession'));
  console.log('');
  if (qrFiles) {
    console.log(tr(language, 'qrFiles'));
    console.log('  ' + tr(language, 'qrHtml') + ':  ' + qrFiles.htmlPath);
    console.log('  PNG:         ' + qrFiles.pngPath);
    console.log('  SVG:         ' + qrFiles.svgPath);
    console.log('  Size:        ' + String(qrFiles.imageSize) + 'px, QR version ' + String(qrFiles.version));
    console.log(tr(language, 'qrSecret'));
  } else {
    console.warn(tr(language, 'qrUnavailable') + qrError);
  }
}

async function maybeStartBridge(rl, language, options, args) {
  console.log('');
  console.log(tr(language, 'manualCommand'));
  console.log(startCommandHint());
  console.log('');
  console.log(tr(language, 'startQuestion'));
  console.log('');
  console.log(tr(language, 'starting'));
  const launcherArgs = [path.join(__dirname, 'desktop-launcher.js')];
  if (args.terminalQr) {
    launcherArgs.push('--terminal-qr');
  }
  const child = spawn(process.execPath, launcherArgs, {
    cwd: options.repoRoot,
    stdio: 'inherit'
  });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error('Agent Bridge exited with code ' + String(code)));
    });
  });
}

async function runWizard() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const savedProfile = loadProfile();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    if (args.reset) {
      const fs = require('fs');
      if (fs.existsSync(profilePath())) {
        fs.unlinkSync(profilePath());
      }
      console.log(STRINGS.en.resetDone);
      return;
    }

    const language = await askLanguage(rl, args, savedProfile);
    console.log('');
    console.log(tr(language, 'title'));
    console.log(tr(language, 'repo') + ': ' + repoRoot);
    console.log(tr(language, 'lanHint'));
    console.log(tr(language, 'profilePath') + ': ' + profilePath());

    console.log('');
    console.log(tr(language, 'scanning'));
    const scanResults = await scanProviders(savedProfile || {});
    printScanResults(language, scanResults);

    let options = null;
    if (savedProfile && (args.reuseLast || yes(await rl.question(tr(language, 'useLastQuestion') + ' [Y/n] '), true))) {
      options = optionsFromProfile(repoRoot, savedProfile);
      options.language = language;
      options = applyScanToOptions(options, scanResults);
    }

    if (!options) {
      options = await askConfiguration(rl, language, repoRoot, listIPv4Addresses(), savedProfile, scanResults);
    }

    const availablePort = await chooseAvailablePort(options.bindHost, options.port);
    if (availablePort !== options.port) {
      console.log(formatPortBusy(tr(language, 'portBusy'), options.port, availablePort));
      options.port = availablePort;
    }

    const saved = saveOptions(options);
    console.log(tr(language, 'savedProfile') + ': ' + profilePath());
    options = optionsFromProfile(repoRoot, saved);
    options.language = language;

    const endpoint = connectionEndpoint(options.connectHost, options.port);
    const savedProfile = loadProfile();
    const deviceIdentity = savedProfile ? publicDeviceIdentity(savedProfile) : null;
    const payload = connectionPayload(endpoint, options.token, options.providerId, options.workspacePath, options.workspaceTitle, deviceIdentity);
    let qrFiles = null;
    let qrError = '';
    try {
      qrFiles = writeQrImageFiles(payload, qrOutputDirectory(), 'agent-bridge-connection', {
        targetSize: 640,
        quietZone: 6,
        title: tr(language, 'qrDisplayTitle'),
        description: tr(language, 'qrDisplayDesc'),
        warning: tr(language, 'qrSecret'),
        fields: [
          { label: tr(language, 'bridgeUrl'), value: endpoint },
          { label: tr(language, 'token'), value: options.token }
        ]
      });
    } catch (error) {
      qrError = error instanceof Error ? error.message : String(error);
    }
    printConnectionSummary(language, options, qrFiles, qrError);

    await maybeStartBridge(rl, language, options, args);
  } finally {
    rl.close();
  }
}

function printHelp() {
  console.log(STRINGS.en.title);
  console.log('');
  console.log(STRINGS.en.helpUsage);
  console.log('  npm install -g @dlzz/agent-bridge');
  console.log('  ngf-agent-bridge --setup');
  console.log('  ngf-agent-bridge');
  console.log('  npm run agent-bridge:setup');
  console.log('  npm run agent-bridge:start');
  console.log('  ngf-agent-bridge --setup --lang zh');
  console.log('  node tools/agent-bridge/src/connect-wizard.js --reuse-last');
  console.log('');
  console.log(STRINGS.en.helpText);
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exitCode = 0;
  } else {
    runWizard().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}

module.exports = {
  connectionPayload,
  connectionUri,
  connectionEndpoint,
  listIPv4Addresses
};
