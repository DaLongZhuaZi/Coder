'use strict';

const fs = require('fs');
const path = require('path');
const { processIsAlive } = require('./managed-process-ledger');
const { bcryptStatus, tlsStatus } = require('./security-audit');

function checkWritableDirectory(directoryPath) {
  if (typeof directoryPath !== 'string' || directoryPath.length === 0) {
    return false;
  }
  try {
    fs.mkdirSync(directoryPath, { recursive: true });
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function checkWritableFileParent(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return false;
  }
  return checkWritableDirectory(path.dirname(filePath));
}

function readArray(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function addCheck(checks, id, status, message, remediation) {
  checks.push({
    id,
    status,
    message,
    remediation: typeof remediation === 'string' ? remediation : ''
  });
}

function summarizeChecks(checks) {
  let errors = 0;
  let warnings = 0;
  for (const check of checks) {
    if (!check || typeof check.status !== 'string') {
      continue;
    }
    if (check.status === 'error') {
      errors += 1;
    } else if (check.status === 'warning') {
      warnings += 1;
    }
  }
  return {
    ok: errors === 0,
    errors,
    warnings
  };
}

function providerSecretStorageStatus(options) {
  const source = options && typeof options === 'object' && !Array.isArray(options)
    ? options.providerSecretStorage
    : null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      available: false,
      platform: 'unavailable',
      remediation: 'Configure secure Provider secret storage before saving Provider credentials.'
    };
  }
  return {
    available: source.available === true,
    platform: typeof source.platform === 'string' && source.platform.length > 0 ? source.platform : 'unavailable',
    remediation: typeof source.remediation === 'string' ? source.remediation : ''
  };
}

function buildDaemonDoctorReport(store, options = {}) {
  const checks = [];
  const paths = store && store.paths && typeof store.paths === 'object' ? store.paths : {};
  const config = store && store.config && typeof store.config === 'object' ? store.config : {};
  const daemon = config.daemon && typeof config.daemon === 'object' && !Array.isArray(config.daemon)
    ? config.daemon
    : {};
  const trustedDevices = store && typeof store.readTrustedDevices === 'function'
    ? store.readTrustedDevices()
    : [];
  const hostnames = readArray(daemon, 'hostnames');
  const nonceReplayCacheSize = options && options.nonceReplayCache && typeof options.nonceReplayCache.size === 'number'
    ? options.nonceReplayCache.size
    : 0;
  const securityAuditSummary = options && options.securityAuditSummary && typeof options.securityAuditSummary === 'object'
    ? options.securityAuditSummary
    : null;
  const tls = tlsStatus(store, options && options.tlsRuntimeState ? options.tlsRuntimeState : null);
  const auth = bcryptStatus(store);
  const supervisorState = store && typeof store.readDaemonSupervisorState === 'function'
    ? store.readDaemonSupervisorState()
    : null;
  const supervisorPid = supervisorState && typeof supervisorState.supervisorPid === 'number'
    ? supervisorState.supervisorPid
    : 0;
  const workerPid = supervisorState && typeof supervisorState.workerPid === 'number'
    ? supervisorState.workerPid
    : 0;
  const supervisorAlive = processIsAlive(supervisorPid);
  const workerAlive = processIsAlive(workerPid);
  const supervisorStatus = supervisorState && typeof supervisorState.status === 'string'
    ? supervisorState.status
    : '';
  const crashLoop = supervisorState ? supervisorState.crashLoop === true : false;
  const providerSecretStorage = providerSecretStorageStatus(options);

  addCheck(
    checks,
    'config_path',
    paths.config && fs.existsSync(paths.config) ? 'ok' : 'warning',
    paths.config && fs.existsSync(paths.config) ? 'Daemon config is present.' : 'Daemon config has not been created yet.',
    'Start the bridge once to initialize the daemon config.'
  );
  addCheck(
    checks,
    'daemon_log_path',
    checkWritableFileParent(paths.daemonLog) ? 'ok' : 'error',
    checkWritableFileParent(paths.daemonLog) ? 'Daemon log directory is writable.' : 'Daemon log directory is not writable.',
    'Check filesystem permissions for the Bridge home directory.'
  );
  addCheck(
    checks,
    'managed_process_ledger_path',
    checkWritableDirectory(paths.managedProcesses) ? 'ok' : 'error',
    checkWritableDirectory(paths.managedProcesses) ? 'Managed process ledger directory is writable.' : 'Managed process ledger directory is not writable.',
    'Check filesystem permissions for the Bridge runtime directory.'
  );
  addCheck(
    checks,
    'daemon_supervisor_state_path',
    checkWritableFileParent(paths.daemonSupervisorState) ? 'ok' : 'error',
    checkWritableFileParent(paths.daemonSupervisorState) ? 'Daemon supervisor state path is writable.' : 'Daemon supervisor state path is not writable.',
    'Check filesystem permissions for the Bridge runtime directory.'
  );
  addCheck(
    checks,
    'daemon_supervisor_runtime',
    crashLoop ? 'error' : (supervisorAlive ? (workerAlive && supervisorStatus === 'running' ? 'ok' : 'warning') : 'info'),
    crashLoop
      ? 'Daemon supervisor stopped after repeated worker crashes.'
      : (supervisorAlive
          ? (workerAlive ? 'Daemon supervisor and worker are running.' : 'Daemon supervisor is running without a live worker.')
          : 'Daemon supervisor is not running.'),
    crashLoop
      ? 'Inspect daemon logs, fix the worker failure, then run daemon start.'
      : (supervisorAlive && !workerAlive ? 'Inspect daemon logs and supervisor restart state.' : '')
  );
  addCheck(
    checks,
    'provider_profile_store',
    checkWritableDirectory(paths.providerProfiles) ? 'ok' : 'error',
    checkWritableDirectory(paths.providerProfiles) ? 'Provider profile store is writable.' : 'Provider profile store is not writable.',
    'Check filesystem permissions for the provider profile directory.'
  );
  addCheck(
    checks,
    'provider_secret_store',
    providerSecretStorage.available ? 'ok' : 'warning',
    providerSecretStorage.available
      ? 'Provider secret storage is available through ' + providerSecretStorage.platform + '.'
      : 'Provider secret storage is unavailable on ' + providerSecretStorage.platform + '.',
    providerSecretStorage.available ? '' : providerSecretStorage.remediation
  );
  addCheck(
    checks,
    'workspace_registry_store',
    checkWritableDirectory(paths.projects) ? 'ok' : 'error',
    checkWritableDirectory(paths.projects) ? 'Workspace registry store is writable.' : 'Workspace registry store is not writable.',
    'Check filesystem permissions for the workspace registry directory.'
  );
  addCheck(
    checks,
    'terminal_capture_path',
    checkWritableDirectory(paths.terminalCaptures) ? 'ok' : 'error',
    checkWritableDirectory(paths.terminalCaptures) ? 'Terminal capture directory is writable.' : 'Terminal capture directory is not writable.',
    'Check filesystem permissions for the terminal capture directory.'
  );
  addCheck(
    checks,
    'terminal_hook_path',
    checkWritableDirectory(paths.terminalHooks) ? 'ok' : 'error',
    checkWritableDirectory(paths.terminalHooks) ? 'Terminal hook directory is writable.' : 'Terminal hook directory is not writable.',
    'Check filesystem permissions for the terminal hook directory.'
  );
  addCheck(
    checks,
    'trusted_devices_path',
    checkWritableFileParent(paths.trustedDevices) ? 'ok' : 'error',
    checkWritableFileParent(paths.trustedDevices) ? 'Trusted device store is writable.' : 'Trusted device store is not writable.',
    'Check filesystem permissions for the security directory.'
  );
  addCheck(
    checks,
    'security_audit_path',
    checkWritableFileParent(paths.securityAudit) ? 'ok' : 'error',
    checkWritableFileParent(paths.securityAudit) ? 'Security audit log path is writable.' : 'Security audit log path is not writable.',
    'Check filesystem permissions for the security directory.'
  );
  addCheck(
    checks,
    'security_audit_recent',
    securityAuditSummary && securityAuditSummary.totalCount > 0 ? 'ok' : 'info',
    securityAuditSummary && securityAuditSummary.totalCount > 0 ?
      'Security audit log has ' + String(securityAuditSummary.totalCount) + ' recorded event(s).' :
      'Security audit log has no recorded events yet.',
    'Security events are recorded when Bridge rejects hosts, tokens, nonce replays, or device trust changes.'
  );
  addCheck(
    checks,
    'host_allowlist',
    'ok',
    hostnames.length > 0 ? 'Daemon host allowlist has ' + String(hostnames.length) + ' configured host(s).' : 'Daemon uses the secure default Host policy: localhost names and IP literals only.',
    hostnames.length > 0 ? '' : 'Add explicit daemon.hostnames before serving through trusted DNS names.'
  );
  addCheck(
    checks,
    'nonce_replay_cache',
    'ok',
    'Nonce replay cache is active with ' + String(nonceReplayCacheSize) + ' recent nonce(s).',
    ''
  );
  addCheck(
    checks,
    'trusted_devices',
    trustedDevices.length > 0 ? 'ok' : 'info',
    trustedDevices.length > 0 ? 'Trusted device audit list has ' + String(trustedDevices.length) + ' entrie(s).' : 'No trusted device audit entries have been recorded yet.',
    'This registry is for management and audit; transport authentication still relies on the configured Bridge credential and TLS where enabled.'
  );
  addCheck(
    checks,
    'tls_config',
    tls.enabled ? (tls.active ? 'ok' : 'warning') : 'info',
    tls.enabled ? tls.message : 'TLS listener is not enabled; Bridge currently serves HTTP.',
    tls.remediation
  );
  addCheck(
    checks,
    'bcrypt_auth',
    auth.authReady !== true ? 'error' : (auth.bcryptActive ? 'ok' : (auth.failureCategory ? 'warning' : 'info')),
    auth.message,
    auth.remediation
  );
  addCheck(
    checks,
    'autostart_config',
    daemon.autostart && daemon.autostart.enabled === true ? 'ok' : 'info',
    daemon.autostart && daemon.autostart.enabled === true ? 'Autostart preference is enabled.' : 'Autostart preference is disabled or manual.',
    'Use daemon autostart preview/install to manage the current-user OS registration.'
  );

  const summary = summarizeChecks(checks);
  return {
    ok: summary.ok,
    errors: summary.errors,
    warnings: summary.warnings,
    generatedAt: new Date().toISOString(),
    checks
  };
}

const DIAGNOSTICS_SCHEMA_VERSION = 1;
const DIAGNOSTICS_GROUP_IDS = Object.freeze([
  'daemon',
  'provider',
  'terminal',
  'queue',
  'usage',
  'secureStorage',
  'remoteConfig',
  'persistence'
]);

const DIAGNOSTICS_ACTION_IDS = Object.freeze(new Set([
  'open_daemon_settings',
  'open_provider_settings',
  'open_terminal_settings',
  'review_message_queue',
  'open_usage_settings',
  'open_secure_storage_help',
  'refresh_remote_config',
  'repair_persistence'
]));

function safeCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function redactDiagnosticUrl(value) {
  const source = typeof value === 'string' ? value : '';
  const trailingMatch = source.match(/[),.;!?\]}]+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const candidate = trailing.length > 0 ? source.slice(0, -trailing.length) : source;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'file:') return '[redacted-file-url]' + trailing;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      const host = parsed.host;
      return (host.length > 0 ? parsed.protocol + '//' + host : '[redacted-url]') + '/[redacted]' + trailing;
    }
  } catch (_error) {
    return '[redacted-url]' + trailing;
  }
  return '[redacted-url]' + trailing;
}

function redactDiagnosticText(value) {
  let output = typeof value === 'string' ? value : '';
  output = output.replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/gi, '[redacted]');
  output = output.replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted]');
  output = output.replace(/["']?\b(?:bearer|token|access[_ -]?token|refresh[_ -]?token|password|credential|secret|private[_ -]?key|api[_ -]?key|client[_ -]?secret|authorization|cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted]');
  output = output.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, (match) => redactDiagnosticUrl(match));
  output = output.replace(/(?:[A-Za-z]:\\|\/)[^\r\n,;]*(?:private[^\\/\s]*|id_(?:rsa|ecdsa|ed25519)|[^\\/\s]+\.(?:key|pem|p12))\b/gi, '[redacted-path]');
  return output.length > 1000 ? output.slice(0, 1000) + '...' : output;
}

function diagnosticCheck(id, status, message, actionId, remediation) {
  const normalizedAction = DIAGNOSTICS_ACTION_IDS.has(actionId) ? actionId : '';
  return {
    id: typeof id === 'string' ? id : '',
    status: ['ok', 'info', 'warning', 'error'].includes(status) ? status : 'info',
    message: redactDiagnosticText(message),
    remediation: redactDiagnosticText(remediation),
    actionId: normalizedAction
  };
}

function groupStatus(checks) {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  if (checks.some((check) => check.status === 'info')) return 'info';
  return 'ok';
}

function doctorGroup(checkId) {
  if (checkId === 'provider_profile_store') return 'provider';
  if (checkId === 'terminal_capture_path' || checkId === 'terminal_hook_path') return 'terminal';
  if (checkId === 'provider_secret_store' || checkId === 'trusted_devices_path' || checkId === 'security_audit_path' || checkId === 'security_audit_recent' || checkId === 'tls_config' || checkId === 'bcrypt_auth') return 'secureStorage';
  if (checkId === 'workspace_registry_store') return 'persistence';
  return 'daemon';
}

function doctorAction(groupId) {
  if (groupId === 'provider') return 'open_provider_settings';
  if (groupId === 'terminal') return 'open_terminal_settings';
  if (groupId === 'secureStorage') return 'open_secure_storage_help';
  if (groupId === 'persistence') return 'repair_persistence';
  return 'open_daemon_settings';
}

function truncateUtf8(value, maxBytes) {
  const source = Buffer.from(String(value || ''), 'utf8');
  if (source.length <= maxBytes) return { value: source.toString('utf8'), truncated: false };
  let end = Math.max(0, maxBytes);
  while (end > 0 && (source[end] & 0xC0) === 0x80) end -= 1;
  return { value: source.subarray(0, end).toString('utf8'), truncated: true };
}

function buildDiagnosticsText(report) {
  const lines = [
    'Agent Bridge diagnostics',
    'Generated: ' + report.generatedAt,
    'Schema: ' + String(report.schemaVersion)
  ];
  for (const group of report.groups) {
    lines.push('', '[' + group.id + '] ' + group.status);
    for (const check of group.checks) {
      lines.push('- ' + check.id + ': ' + check.status + ' - ' + check.message + (check.actionId ? ' [' + check.actionId + ']' : ''));
    }
  }
  return lines.join('\n');
}

function diagnosticsReportSize(report) {
  return Buffer.byteLength(JSON.stringify(report), 'utf8');
}

function compactDiagnosticsReport(report, maxBytes) {
  if (diagnosticsReportSize(report) <= maxBytes) return;
  report.truncated = true;
  for (const group of report.groups) {
    group.checks = group.checks.slice(0, 8);
    for (const check of group.checks) check.message = truncateUtf8(check.message, 160).value;
    group.status = groupStatus(group.checks);
  }
  while (diagnosticsReportSize(report) > maxBytes) {
    let largest = null;
    for (const group of report.groups) {
      if (group.checks.length > 1 && (!largest || group.checks.length > largest.checks.length)) largest = group;
    }
    if (!largest) break;
    largest.checks.pop();
    largest.status = groupStatus(largest.checks);
  }
  if (diagnosticsReportSize(report) > maxBytes) {
    for (const group of report.groups) {
      for (const check of group.checks) check.message = truncateUtf8(check.message, 64).value;
    }
  }
  while (diagnosticsReportSize(report) > maxBytes) {
    const group = report.groups.find((item) => item.checks.length > 0);
    if (!group) break;
    group.checks.pop();
    group.status = groupStatus(group.checks);
  }
}

function buildDiagnosticsExportReport(store, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const format = opts.format === 'text' ? 'text' : 'json';
  const maxBytes = Math.max(4096, Math.min(1024 * 1024, safeCount(opts.maxBytes) || 256 * 1024));
  const groups = new Map();
  for (const id of DIAGNOSTICS_GROUP_IDS) groups.set(id, { id, title: id, status: 'ok', checks: [] });
  const doctor = opts.doctor && typeof opts.doctor === 'object' ? opts.doctor : buildDaemonDoctorReport(store, opts);
  const doctorChecks = Array.isArray(doctor.checks) ? doctor.checks : [];
  for (const source of doctorChecks) {
    if (!source || typeof source !== 'object') continue;
    const id = typeof source.id === 'string' ? source.id : 'doctor_check';
    const groupId = doctorGroup(id);
    groups.get(groupId).checks.push(diagnosticCheck(
      id,
      source.status,
      source.message,
      source.status === 'ok' || source.status === 'info' ? '' : doctorAction(groupId),
      source.remediation
    ));
  }

  const health = opts.health && typeof opts.health === 'object' ? opts.health : {};
  groups.get('daemon').checks.push(diagnosticCheck(
    'daemon_runtime',
    health.instanceHealth === 'degraded' ? 'warning' : (health.instanceHealth === 'healthy' ? 'ok' : 'info'),
    health.instanceHealth === 'healthy' ? 'Bridge runtime is healthy.' : (health.instanceHealth === 'degraded' ? 'Bridge runtime is degraded.' : 'Bridge runtime health is unavailable.'),
    health.instanceHealth === 'degraded' ? 'open_daemon_settings' : ''
  ));

  const provider = opts.provider && typeof opts.provider === 'object' ? opts.provider : {};
  const providerCount = safeCount(provider.count);
  const providerAvailable = safeCount(provider.availableCount);
  groups.get('provider').checks.push(diagnosticCheck(
    'provider_runtime_summary',
    providerCount === 0 ? 'warning' : (providerAvailable > 0 ? 'ok' : 'warning'),
    providerCount === 0 ? 'No Provider runtimes are registered.' : String(providerAvailable) + ' of ' + String(providerCount) + ' Provider runtime(s) report availability.',
    providerCount === 0 || providerAvailable === 0 ? 'open_provider_settings' : ''
  ));

  const terminal = opts.terminal && typeof opts.terminal === 'object' ? opts.terminal : {};
  groups.get('terminal').checks.push(diagnosticCheck(
    'terminal_runtime',
    terminal.available === true ? 'ok' : 'warning',
    terminal.available === true ? 'Terminal runtime is available with ' + String(safeCount(terminal.activeCount)) + ' active terminal(s).' : 'Terminal runtime is unavailable.',
    terminal.available === true ? '' : 'open_terminal_settings'
  ));

  const queue = opts.queue && typeof opts.queue === 'object' ? opts.queue : {};
  const failedQueueCount = safeCount(queue.failedCount);
  groups.get('queue').checks.push(diagnosticCheck(
    'message_queue_state',
    failedQueueCount > 0 ? 'warning' : 'ok',
    'Message queue contains ' + String(safeCount(queue.count)) + ' item(s), including ' + String(failedQueueCount) + ' failed item(s).',
    failedQueueCount > 0 ? 'review_message_queue' : ''
  ));

  const usage = opts.usage && typeof opts.usage === 'object' ? opts.usage : {};
  groups.get('usage').checks.push(diagnosticCheck(
    'usage_store_state',
    usage.degraded === true ? 'warning' : 'ok',
    'Usage store contains ' + String(safeCount(usage.eventCount)) + ' event(s) and ' + String(safeCount(usage.budgetCount)) + ' budget(s).',
    usage.degraded === true ? 'open_usage_settings' : ''
  ));

  const secureStorage = opts.secureStorage && typeof opts.secureStorage === 'object' ? opts.secureStorage : {};
  const providerSecretStorage = providerSecretStorageStatus({
    providerSecretStorage: opts.providerSecretStorage && typeof opts.providerSecretStorage === 'object'
      ? opts.providerSecretStorage
      : secureStorage.providerSecretStorage
  });
  const credentialStoreAvailable = secureStorage.credentialStoreAvailable === true || secureStorage.available === true;
  const allCredentialStoresAvailable = credentialStoreAvailable && providerSecretStorage.available;
  groups.get('secureStorage').checks.push(diagnosticCheck(
    'credential_store_runtime',
    allCredentialStoresAvailable ? 'ok' : 'warning',
    'GitHub credential storage is ' + (credentialStoreAvailable ? 'available' : 'unavailable') +
      '; Provider secret storage is ' + (providerSecretStorage.available ? 'available' : 'unavailable') +
      ' through ' + providerSecretStorage.platform + '.',
    allCredentialStoresAvailable ? '' : 'open_secure_storage_help'
  ));

  const remoteConfig = opts.remoteConfig && typeof opts.remoteConfig === 'object' ? opts.remoteConfig : {};
  groups.get('remoteConfig').checks.push(diagnosticCheck(
    'remote_config_state',
    remoteConfig.degraded === true ? 'warning' : 'ok',
    remoteConfig.activeVersion ? 'Remote config version ' + redactDiagnosticText(remoteConfig.activeVersion) + ' is active.' : 'No remote config is active; built-in and local defaults are in use.',
    remoteConfig.degraded === true ? 'refresh_remote_config' : ''
  ));

  const persistence = opts.persistence && typeof opts.persistence === 'object' ? opts.persistence : {};
  const usageVersion = safeCount(persistence.usageVersion);
  const queueVersion = safeCount(persistence.queueVersion);
  groups.get('persistence').checks.push(diagnosticCheck(
    'experience_store_versions',
    usageVersion > 0 && queueVersion > 0 ? 'ok' : 'warning',
    'Message queue schema version is ' + String(queueVersion) + '; usage schema version is ' + String(usageVersion) + '.',
    usageVersion > 0 && queueVersion > 0 ? '' : 'repair_persistence'
  ));

  const report = {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    format,
    generatedAt: new Date().toISOString(),
    truncated: false,
    groups: Array.from(groups.values())
  };
  for (const group of report.groups) group.status = groupStatus(group.checks);
  compactDiagnosticsReport(report, format === 'text' ? Math.max(2048, Math.floor(maxBytes * 0.55)) : maxBytes);
  if (format === 'text') {
    const availableBytes = Math.max(0, maxBytes - diagnosticsReportSize(report) - 64);
    const limited = truncateUtf8(buildDiagnosticsText(report), availableBytes);
    report.text = limited.value;
    if (limited.truncated) report.truncated = true;
    while (diagnosticsReportSize(report) > maxBytes && report.text.length > 0) {
      const overflow = diagnosticsReportSize(report) - maxBytes;
      const currentBytes = Buffer.byteLength(report.text, 'utf8');
      const nextBytes = Math.max(0, currentBytes - overflow - 32);
      report.text = truncateUtf8(report.text, nextBytes).value;
      report.truncated = true;
    }
  }
  compactDiagnosticsReport(report, maxBytes);
  return {
    ok: true,
    action: 'diagnostics.export',
    format,
    report,
    sizeBytes: diagnosticsReportSize(report),
    truncated: report.truncated
  };
}

function parseVersion(value) {
  const match = typeof value === 'string' ? value.trim().match(/^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?/) : null;
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

function parseProtocolVersion(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return null;
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 0) return null;
  return { prefix: match[1], number };
}

function compareProtocolVersions(left, right) {
  const leftText = typeof left === 'string' ? left.trim() : '';
  const rightText = typeof right === 'string' ? right.trim() : '';
  if (leftText.length === 0 || rightText.length === 0) return null;
  if (leftText === rightText) return 0;
  const leftParts = parseProtocolVersion(leftText);
  const rightParts = parseProtocolVersion(rightText);
  if (!leftParts || !rightParts || leftParts.prefix !== rightParts.prefix) return null;
  return leftParts.number < rightParts.number ? -1 : (leftParts.number > rightParts.number ? 1 : 0);
}

function buildCompatibilityInfo(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const appVersion = typeof opts.appVersion === 'string' ? opts.appVersion : '';
  const bridgeVersion = typeof opts.bridgeVersion === 'string' ? opts.bridgeVersion : '';
  const minimumAppVersion = typeof opts.minimumAppVersion === 'string' ? opts.minimumAppVersion : '';
  const recommendedAppVersion = typeof opts.recommendedAppVersion === 'string' ? opts.recommendedAppVersion : minimumAppVersion;
  const minimumBridgeVersion = typeof opts.minimumBridgeVersion === 'string' ? opts.minimumBridgeVersion : bridgeVersion;
  const recommendedBridgeVersion = typeof opts.recommendedBridgeVersion === 'string' ? opts.recommendedBridgeVersion : minimumBridgeVersion;
  const minimumProtocolVersion = typeof opts.minimumProtocolVersion === 'string' ? opts.minimumProtocolVersion : '';
  const recommendedProtocolVersion = typeof opts.recommendedProtocolVersion === 'string' ? opts.recommendedProtocolVersion : '';
  const supportedProtocolVersions = Array.isArray(opts.supportedProtocolVersions)
    ? opts.supportedProtocolVersions.filter((value) => typeof value === 'string' && value.length > 0)
    : [];
  const base = {
    status: 'unknown',
    blocking: false,
    reason: 'Client version was not provided.',
    minimumAppVersion,
    recommendedAppVersion,
    minimumBridgeVersion,
    recommendedBridgeVersion,
    minimumProtocolVersion,
    recommendedProtocolVersion,
    supportedProtocolVersions,
    remediation: 'Reconnect with an App version that reports build metadata.'
  };
  const bridgeComparison = compareVersions(bridgeVersion, minimumBridgeVersion);
  if (bridgeComparison === null) return Object.assign(base, { reason: 'Bridge version metadata is unavailable or invalid.', remediation: 'Repair or upgrade Agent Bridge before relying on compatibility-gated features.' });
  if (bridgeComparison !== null && bridgeComparison < 0) return Object.assign(base, { status: 'bridgeTooOld', blocking: true, reason: 'Bridge version is below the supported minimum.', remediation: 'Upgrade Agent Bridge before using this App.' });
  const appComparison = compareVersions(appVersion, minimumAppVersion);
  if (appComparison === null) return base;
  if (appComparison < 0) return Object.assign(base, { status: 'appTooOld', blocking: true, reason: 'App version is below the supported minimum.', remediation: 'Upgrade the App before using this Bridge.' });
  const supportedProtocols = supportedProtocolVersions;
  const clientProtocolVersion = typeof opts.clientProtocolVersion === 'string' ? opts.clientProtocolVersion : '';
  const hasMinimumProtocol = minimumProtocolVersion.length > 0;
  if (!clientProtocolVersion && (supportedProtocols.length > 0 || hasMinimumProtocol)) return Object.assign(base, { reason: 'Client protocol version was not provided.', remediation: 'Reconnect with an App version that reports protocol metadata.' });
  if (clientProtocolVersion && supportedProtocols.length > 0 && !supportedProtocols.includes(clientProtocolVersion)) return Object.assign(base, { status: 'appTooOld', blocking: true, reason: 'App protocol version is not supported by this Bridge.', remediation: 'Upgrade the App to a compatible protocol version.' });
  if (clientProtocolVersion && supportedProtocols.length === 0 && hasMinimumProtocol) {
    const minimumProtocolComparison = compareProtocolVersions(clientProtocolVersion, minimumProtocolVersion);
    if (minimumProtocolComparison === null) return Object.assign(base, { reason: 'Protocol version metadata is unavailable or invalid.', remediation: 'Reconnect with a Bridge and App that report compatible protocol metadata.' });
    if (minimumProtocolComparison < 0) return Object.assign(base, { status: 'appTooOld', blocking: true, reason: 'App protocol version is below the supported minimum.', remediation: 'Upgrade the App to a compatible protocol version.' });
  }
  const recommendedComparison = compareVersions(appVersion, recommendedAppVersion);
  const recommendedBridgeComparison = compareVersions(bridgeVersion, recommendedBridgeVersion);
  const recommendedProtocolComparison = clientProtocolVersion && recommendedProtocolVersion
    ? compareProtocolVersions(clientProtocolVersion, recommendedProtocolVersion)
    : null;
  const protocolUpgrade = recommendedProtocolComparison !== null && recommendedProtocolComparison < 0;
  if ((recommendedComparison !== null && recommendedComparison < 0) || (recommendedBridgeComparison !== null && recommendedBridgeComparison < 0) || protocolUpgrade) return Object.assign(base, { status: 'upgradeRecommended', blocking: false, reason: 'A newer compatible App, Bridge, or protocol version is recommended.', remediation: 'Upgrade when convenient to receive all Bridge capabilities.' });
  return Object.assign(base, { status: 'compatible', blocking: false, reason: 'App and Bridge versions are compatible.', remediation: '' });
}

module.exports = {
  buildDaemonDoctorReport,
  buildDiagnosticsExportReport,
  buildCompatibilityInfo,
  redactDiagnosticText
};
