'use strict';

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'zh']);

const STRINGS = Object.freeze({
  en: Object.freeze({
    productName: 'NGF Agent Bridge Desktop',
    tagline: 'Rich local connector for Windows, macOS, and Linux',
    usage: 'Usage:',
    options: 'Options:',
    helpSetup: 'Run the interactive first-time connection setup.',
    helpDoctor: 'Scan providers and exit.',
    helpStart: 'Force-start opencode,deveco,mimo,openclaw-gateway,hermes-studio servers.',
    helpNoStartProviders: 'Do not launch compatible servers.',
    helpConnectHost: 'Host/IP written into the app connection QR.',
    helpBindHost: 'Host/IP the Bridge listens on.',
    helpPort: 'Bridge port.',
    helpToken: 'Bridge token.',
    helpLang: 'Display language: zh or en.',
    helpTerminalQr: 'Also print an ANSI terminal QR preview.',
    helpNoOpenQr: 'Generate QR files without opening the browser page.',
    scanProviders: 'Scanning local agent providers',
    spinnerOk: '[OK]',
    spinnerError: '[ERR]',
    spinnerDone: '[done]',
    providerHeader: 'Provider',
    commandHeader: 'Command',
    statusHeader: 'Status',
    detailHeader: 'Details',
    nextStepHeader: 'Next step',
    statusMissing: 'missing',
    statusServerReady: 'server ready',
    statusInstalled: 'installed',
    statusBuiltIn: 'built in',
    actionAvailable: 'available in Bridge',
    actionReuseRunning: 'reuse running server',
    actionStartLocal: 'start local server',
    actionManualStart: 'manual server start',
    actionNotInstalled: 'not installed',
    actionTestFallback: 'test fallback',
    actionInstallCli: 'install CLI to enable',
    providerModels: '{count} models',
    providerSessions: '{count} sessions',
    waitingProvider: 'Waiting for {label} at {url}',
    providerStartFailed: '{label} failed to start: {message}',
    providerNotHealthy: '{label} did not become healthy. Bridge will still start.',
    portBusy: 'Port {port} is busy. Using {nextPort} instead.',
    networkHostUpdated: 'Network change detected. Bridge address updated from {previousHost} to {nextHost}. The profile and QR were refreshed; rescan the QR in the app.',
    networkHostRecovered: 'Saved Bridge address {previousHost} is not active on this computer. Using the detected address {nextHost}.',
    bridgeUrl: 'Bridge URL',
    httpHealth: 'HTTP health',
    token: 'Token',
    qrPage: 'QR page',
    profile: 'Profile',
    fieldHeader: 'Field',
    valueHeader: 'Value',
    qrTitle: 'Agent Bridge QR',
    qrDescription: 'Bridge is ready. Scan this page from the NGF app connection settings. Use the manual values below if the camera cannot scan.',
    qrWarning: 'This QR contains the bridge token. Keep it private.',
    qrUnavailable: 'QR generation failed, but Agent Bridge is still running. Enter the connection values manually: {message}',
    terminalQrPreview: 'Terminal QR preview',
    bridgeOutputLabel: 'Bridge',
    bridgeStartFailed: 'Bridge failed to start: {message}',
    waitingBridge: 'Waiting for Bridge at {url}',
    bridgeNotHealthy: 'Bridge did not become healthy within the timeout. Restart ngf-agent-bridge on the desktop and try again. If it keeps happening, run ngf-agent-bridge --doctor.',
    existingBridgeReused: 'Agent Bridge is already running at {url}. Reusing the existing supervised instance; no second Bridge was started.',
    existingBridgeControlHint: 'This command did not take process ownership and has exited successfully. Use "node src/desktop-launcher.js daemon stop" or "daemon restart" before starting a foreground session.',
    existingBridgeSupervisorBusy: 'An Agent Bridge supervisor is already running (PID {pid}), but {url} is not a healthy matching Bridge. To avoid changing ports or configuration, this start was cancelled. Run "node src/desktop-launcher.js daemon health" and then "daemon restart" or "daemon stop".',
    openingQrAfterReady: 'Bridge is ready. Opening the QR page now; scan it from the app connection settings.',
    stopping: 'Stopping Agent Bridge desktop session...',
    ready: 'Agent Bridge is running. Press Ctrl+C to stop this desktop session.',
    bridgeExited: 'Bridge exited with code {code}',
    setupExited: 'Setup exited with code {code}',
    doctorProfile: 'Profile',
    suggestedBridgeUrl: 'Suggested Bridge URL',
    errorPrefix: '[ERR]',
    warnPrefix: '[WARN]',
    readyPrefix: '[READY]'
  }),
  zh: Object.freeze({
    productName: 'NGF Agent Bridge 桌面连接器',
    tagline: '适用于 Windows、macOS 和 Linux 的本机 Agent 连接体验',
    usage: '用法:',
    options: '参数:',
    helpSetup: '运行首次连接交互配置。',
    helpDoctor: '只扫描 Provider 并退出。',
    helpStart: '强制启动 opencode、deveco、mimo、openclaw-gateway、hermes-studio 服务。',
    helpNoStartProviders: '不自动拉起本机 Agent 服务。',
    helpConnectHost: '写入二维码和 App 连接信息的主机/IP。',
    helpBindHost: 'Bridge 实际监听的主机/IP。',
    helpPort: 'Bridge 端口。',
    helpToken: 'Bridge Token。',
    helpLang: '显示语言：zh 或 en。',
    helpTerminalQr: '额外输出 ANSI 终端二维码预览。',
    helpNoOpenQr: '只生成二维码文件，不自动打开浏览器页面。',
    scanProviders: '正在扫描本机 Agent Provider',
    spinnerOk: '[完成]',
    spinnerError: '[错误]',
    spinnerDone: '[完成]',
    providerHeader: 'Provider',
    commandHeader: '命令',
    statusHeader: '状态',
    detailHeader: '详情',
    nextStepHeader: '下一步',
    statusMissing: '未发现',
    statusServerReady: '服务已就绪',
    statusInstalled: '已安装',
    statusBuiltIn: '内置',
    actionAvailable: 'Bridge 可用',
    actionReuseRunning: '复用运行中的服务',
    actionStartLocal: '启动本机服务',
    actionManualStart: '需要手动启动服务',
    actionNotInstalled: '未安装',
    actionTestFallback: '测试兜底',
    actionInstallCli: '安装 CLI 后启用',
    providerModels: '{count} 个模型',
    providerSessions: '{count} 个会话',
    waitingProvider: '等待 {label} 就绪: {url}',
    providerStartFailed: '{label} 启动失败: {message}',
    providerNotHealthy: '{label} 未在超时时间内就绪。Bridge 仍会继续启动。',
    portBusy: '端口 {port} 已被占用，改用 {nextPort}。',
    networkHostUpdated: '检测到网络环境变化，Bridge 地址已从 {previousHost} 自动切换为 {nextHost}。配置和二维码已刷新，请在 App 中重新扫码。',
    networkHostRecovered: '保存的 Bridge 地址 {previousHost} 已不属于当前网卡，已自动使用检测到的地址 {nextHost}。',
    bridgeUrl: 'Bridge 地址',
    httpHealth: 'HTTP 健康检查',
    token: 'Token',
    qrPage: '二维码页面',
    profile: '配置文件',
    fieldHeader: '字段',
    valueHeader: '值',
    qrTitle: 'Agent Bridge 二维码',
    qrDescription: 'Bridge 已就绪。请在 NGF App 连接设置中扫描此页面。如果相机无法识别，可以手动填写下方连接信息。',
    qrWarning: '二维码包含 Bridge Token，请勿公开分享。',
    qrUnavailable: '二维码生成失败，但 Agent Bridge 仍在运行。请手动填写连接信息：{message}',
    terminalQrPreview: '终端二维码预览',
    bridgeOutputLabel: 'Bridge',
    bridgeStartFailed: 'Bridge 启动失败: {message}',
    waitingBridge: '等待 Bridge 就绪: {url}',
    bridgeNotHealthy: 'Bridge 未在超时时间内就绪。请重新启动电脑端 ngf-agent-bridge 后再扫码；如果反复出现，请运行 ngf-agent-bridge --doctor。',
    existingBridgeReused: 'Agent Bridge 已在 {url} 运行。已复用现有受管实例，没有启动第二个 Bridge。',
    existingBridgeControlHint: '当前命令未取得进程所有权，现已正常退出。需要前台控制时，请先执行 "node src/desktop-launcher.js daemon stop" 或 "daemon restart"。',
    existingBridgeSupervisorBusy: '检测到已有 Agent Bridge supervisor（PID {pid}），但 {url} 不是健康且身份匹配的 Bridge。为避免修改端口或配置，本次启动已取消；请先执行 "node src/desktop-launcher.js daemon health"，再执行 "daemon restart" 或 "daemon stop"。',
    openingQrAfterReady: 'Bridge 已就绪。现在打开二维码页面，请在 App 连接设置中扫码。',
    stopping: '正在停止 Agent Bridge 桌面会话...',
    ready: 'Agent Bridge 正在运行。按 Ctrl+C 停止本次桌面会话。',
    bridgeExited: 'Bridge 已退出，退出码 {code}',
    setupExited: '配置向导已退出，退出码 {code}',
    doctorProfile: '配置文件',
    suggestedBridgeUrl: '建议 Bridge 地址',
    errorPrefix: '[错误]',
    warnPrefix: '[警告]',
    readyPrefix: '[就绪]'
  })
});

function normalizeLanguage(value, fallbackValue) {
  const fallback = fallbackValue === '' ? '' : (SUPPORTED_LANGUAGES.includes(fallbackValue) ? fallbackValue : 'en');
  const text = String(value || '').trim().toLowerCase();
  if (text.length === 0) {
    return fallback;
  }
  if (text === 'zh' || text === 'cn' || text === 'zh-cn' || text === 'zh_hans' || text === 'zh-hans' || text === 'chinese' || text === '中文') {
    return 'zh';
  }
  if (text.startsWith('zh_') || text.startsWith('zh-')) {
    return 'zh';
  }
  if (text === 'en' || text === 'en-us' || text === 'en_us' || text === 'english') {
    return 'en';
  }
  if (text.startsWith('en_') || text.startsWith('en-')) {
    return 'en';
  }
  return fallback;
}

function systemLanguage() {
  const candidates = [
    process.env.AGENT_BRIDGE_LANG,
    process.env.LANGUAGE,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale
  ];
  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate, '');
    if (SUPPORTED_LANGUAGES.includes(language)) {
      return language;
    }
  }
  return 'en';
}

function resolveLanguage() {
  for (let index = 0; index < arguments.length; index++) {
    const language = normalizeLanguage(arguments[index], '');
    if (SUPPORTED_LANGUAGES.includes(language)) {
      return language;
    }
  }
  return systemLanguage();
}

function t(language, key, params) {
  const normalized = normalizeLanguage(language, 'en');
  const table = STRINGS[normalized] || STRINGS.en;
  let value = table[key] || STRINGS.en[key] || key;
  if (!params || typeof params !== 'object') {
    return value;
  }
  for (const name of Object.keys(params)) {
    value = value.split('{' + name + '}').join(String(params[name]));
  }
  return value;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  resolveLanguage,
  systemLanguage,
  t
};
