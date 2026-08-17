'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { AgentManager } = require('../src/agent-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { NotificationManager } = require('../src/notification-manager');
const { WorkspaceRegistry } = require('../src/workspace-registry');

function runCli(home, args, extraEnv) {
  const output = execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'desktop-launcher.js')].concat(args), {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: home,
      AGENT_BRIDGE_HOOK_HOME: home,
      NO_COLOR: '1'
    }, extraEnv || {}),
    encoding: 'utf8',
    windowsHide: true
  });
  return JSON.parse(output);
}

function runCliResult(home, args) {
  try {
    return {
      exitCode: 0,
      payload: runCli(home, args)
    };
  } catch (error) {
    const stdout = error && typeof error.stdout === 'string' ? error.stdout : '';
    let payload = {};
    if (stdout.length > 0) {
      payload = JSON.parse(stdout);
    }
    return {
      exitCode: error && typeof error.status === 'number' ? error.status : 1,
      payload
    };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertProviderCommandRequiresBridge(home, args, message) {
  const result = runCliResult(home, args);
  assert(result.exitCode !== 0, message + ' should fail without a live Bridge');
  assert(result.payload.failureCategory === 'live_bridge_required', message + ' should return live_bridge_required');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-management-cli-'));
const store = createDaemonStore(root);
const workspaceRegistry = new WorkspaceRegistry(store);
const agentManager = new AgentManager({
  store,
  workspaceRegistry
});
const smokeAgent = agentManager.createPlaceholder({
  providerId: 'mock',
  workspacePath: root,
  cwd: root,
  title: 'Smoke Agent'
});
const smokeAgentRecord = agentManager.find(smokeAgent.id);
agentManager.appendTimeline(smokeAgentRecord, 'permission', 'permission.requested', {
  providerId: 'mock',
  sessionId: 'session-smoke',
  requestId: 'perm-smoke',
  permissionId: 'perm-smoke',
  title: 'Smoke permission',
  prompt: 'Allow smoke permission?',
  status: 'pending'
}, {
  event: 'permission.requested',
  sessionId: 'session-smoke',
  payload: {
    providerId: 'mock',
    requestId: 'perm-smoke',
    permissionId: 'perm-smoke',
    status: 'pending'
  }
});
agentManager.persist(smokeAgentRecord);
const notificationManager = new NotificationManager(store);
const smokeNotification = notificationManager.create({
  kind: 'permission',
  severity: 'warning',
  title: 'Smoke notification',
  body: 'Permission notification for CLI wait.',
  agentId: smokeAgent.id,
  route: {
    kind: 'permission',
    agentId: smokeAgent.id,
    requestId: 'perm-smoke'
  }
});
assert(smokeNotification && smokeNotification.notificationId.length > 0, 'smoke notification should be persisted');
const catalogPath = path.join(root, 'acp-providers.json');
fs.writeFileSync(catalogPath, JSON.stringify({
  providers: [
    {
      id: 'smoke-provider',
      displayName: 'Smoke Provider',
      binary: process.execPath,
      args: '--version',
      models: [
        { id: 'smoke-model', displayName: 'Smoke Model' }
      ],
      tools: [
        { id: 'smoke.run', displayName: 'Smoke Run', slashCommand: '/smoke', available: true }
      ]
    }
  ]
}, null, 2), 'utf8');

const daemonStatus = runCli(root, ['daemon', 'status']);
assert(daemonStatus.serverId.length > 0, 'daemon status should expose server id');
assert(typeof daemonStatus.status === 'string', 'daemon status should expose lifecycle status');
assert(daemonStatus.doctor && Array.isArray(daemonStatus.doctor.checks), 'daemon status should expose doctor checks');

const relayStatusWithoutBridge = runCliResult(root, ['relay', 'status']);
assert(relayStatusWithoutBridge.exitCode !== 0, 'relay status should require a live Bridge');
assert(relayStatusWithoutBridge.payload.failureCategory === 'live_bridge_required',
  'relay status must not bypass the live Bridge to read local Relay state');

const relayDevicesWithoutBridge = runCliResult(root, ['relay', 'devices']);
assert(relayDevicesWithoutBridge.exitCode !== 0, 'relay device list should require a live Bridge');
assert(relayDevicesWithoutBridge.payload.failureCategory === 'live_bridge_required',
  'relay device list must not bypass the live Bridge identity store');

const daemonHealth = runCli(root, ['daemon', 'health']);
assert(daemonHealth.action === 'daemon.health', 'daemon health should expose action');
assert(typeof daemonHealth.status === 'string', 'daemon health should expose status');
assert(typeof daemonHealth.logPath === 'string' && daemonHealth.logPath.length > 0, 'daemon health should expose log path');

const daemonLogs = runCli(root, ['daemon', 'logs', '--max-bytes', '1024']);
assert(typeof daemonLogs.logPath === 'string' && daemonLogs.logPath.length > 0, 'daemon logs should expose log path');
assert(Array.isArray(daemonLogs.warnings), 'daemon logs should expose structured warnings');

const daemonAutostartStatus = runCli(root, ['daemon', 'autostart', 'status']);
assert(daemonAutostartStatus.action === 'daemon.autostart.status', 'daemon autostart status should expose action');
assert(daemonAutostartStatus.preview && typeof daemonAutostartStatus.preview.plannedCommand === 'string', 'daemon autostart status should expose preview command');

const daemonAutostartPreview = runCli(root, ['daemon', 'autostart', 'preview']);
assert(daemonAutostartPreview.action === 'daemon.autostart.preview', 'daemon autostart preview should expose action');
assert(daemonAutostartPreview.preview.confirmRequired === true, 'daemon autostart preview should require explicit confirmation outside Bridge');
assert(daemonAutostartPreview.preview.supported === true, 'daemon autostart preview should expose a supported current-platform installer');

const daemonAutostartInstallBlocked = runCliResult(root, ['daemon', 'autostart', 'install']);
assert(daemonAutostartInstallBlocked.exitCode !== 0, 'daemon autostart install should require --confirm');
assert(daemonAutostartInstallBlocked.payload.failureCategory === 'confirmation_required', 'daemon autostart install should expose confirmation_required');

const daemonAutostartUninstallBlocked = runCliResult(root, ['daemon', 'autostart', 'uninstall']);
assert(daemonAutostartUninstallBlocked.exitCode !== 0, 'daemon autostart uninstall should require --confirm');
assert(daemonAutostartUninstallBlocked.payload.failureCategory === 'confirmation_required', 'daemon autostart uninstall should expose confirmation_required');

const daemonUpdateStatus = runCli(root, ['daemon', 'update', 'status']);
assert(daemonUpdateStatus.action === 'daemon.update.status', 'daemon update status should expose action');
assert(daemonUpdateStatus.packageName === '@dlzz/agent-bridge', 'daemon update status should expose fixed package identity');
assert(typeof daemonUpdateStatus.currentVersion === 'string' && daemonUpdateStatus.currentVersion.length > 0, 'daemon update status should expose current version');

const daemonUpdateInstallBlocked = runCliResult(root, ['daemon', 'update', 'install']);
assert(daemonUpdateInstallBlocked.exitCode !== 0, 'daemon update install should require --confirm');
assert(daemonUpdateInstallBlocked.payload.failureCategory === 'confirmation_required', 'daemon update install should expose confirmation_required before network access');

const daemonUpdateRollbackBlocked = runCliResult(root, ['daemon', 'update', 'rollback']);
assert(daemonUpdateRollbackBlocked.exitCode !== 0, 'daemon update rollback should require --confirm');
assert(daemonUpdateRollbackBlocked.payload.failureCategory === 'confirmation_required', 'daemon update rollback should expose confirmation_required before npm access');

const daemonDoctor = runCli(root, ['daemon', 'doctor']);
assert(Array.isArray(daemonDoctor.checks) && daemonDoctor.checks.length > 0, 'daemon doctor should expose checks');
assert(daemonDoctor.checks.some((check) => check.id === 'managed_process_ledger_path'), 'daemon doctor should check managed process ledger');
assert(daemonDoctor.checks.some((check) => check.id === 'provider_profile_store'), 'daemon doctor should check provider profile store');
assert(daemonDoctor.checks.some((check) => check.id === 'provider_secret_store'), 'daemon doctor should check Provider secret storage');
assert(daemonDoctor.checks.some((check) => check.id === 'workspace_registry_store'), 'daemon doctor should check workspace registry store');
assert(daemonDoctor.checks.some((check) => check.id === 'security_audit_path'), 'daemon doctor should check security audit path');
assert(daemonDoctor.checks.some((check) => check.id === 'tls_config'), 'daemon doctor should check TLS config');
assert(daemonDoctor.checks.some((check) => check.id === 'bcrypt_auth'), 'daemon doctor should check bcrypt auth');

const daemonDoctorSaved = runCli(root, ['daemon', 'doctor', '--save']);
assert(fs.existsSync(daemonDoctorSaved.reportPath), 'daemon doctor --save should write a report file');

const terminalCapturePath = store.terminalCaptureFilePath('term-cli-smoke');
fs.writeFileSync(terminalCapturePath, 'first terminal line\nsecond terminal line\n', 'utf8');
const terminalLogs = runCli(root, ['terminal', 'logs', 'term-cli-smoke', '--max-bytes', '32']);
assert(terminalLogs.action === 'terminal.logs', 'terminal logs should expose action');
assert(terminalLogs.terminalId === 'term-cli-smoke', 'terminal logs should expose terminal id');
assert(terminalLogs.capturePersisted === true, 'terminal logs should report persisted capture');
assert(terminalLogs.truncated === true, 'terminal logs should expose truncation when max bytes clips capture');
assert(terminalLogs.text.indexOf('second terminal line') >= 0, 'terminal logs should return persisted capture tail');

const terminalLogsMissing = runCliResult(root, ['terminal', 'logs', 'missing-terminal']);
assert(terminalLogsMissing.exitCode !== 0, 'terminal logs missing capture should exit non-zero');
assert(terminalLogsMissing.payload.action === 'terminal.logs', 'terminal logs missing capture should expose action');
assert(terminalLogsMissing.payload.code === 'terminal_capture_missing', 'terminal logs missing capture should expose structured code');
assert(terminalLogsMissing.payload.capturePersisted === false, 'terminal logs missing capture should report no persisted capture');

const hookStatus = runCli(root, ['terminal', 'hook', 'status']);
assert(Array.isArray(hookStatus.hooks), 'terminal hook status should expose hooks');

const hookPreview = runCli(root, ['terminal', 'hook', 'preview']);
assert(hookPreview.confirmRequired === false, 'terminal hook preview should not require confirm');
assert(Array.isArray(hookPreview.plannedProfileEdits), 'terminal hook preview should expose planned profile edits');

const hookInstall = runCli(root, ['terminal', 'hook', 'install']);
assert(Array.isArray(hookInstall.hooks), 'terminal hook install should expose hooks');
assert(hookInstall.confirmRequired === true, 'terminal hook install without confirm should require confirm for profile changes');

const hookInstallConfirmed = runCli(root, ['terminal', 'hook', 'install', '--confirm']);
assert(hookInstallConfirmed.profileInstalled === true, 'terminal hook confirmed install should mark profile installed');
assert(hookInstallConfirmed.backupPath.length > 0, 'terminal hook confirmed install should create backup');

const hookUninstallConfirmed = runCli(root, ['terminal', 'hook', 'uninstall', '--confirm']);
assert(hookUninstallConfirmed.profileInstalled === false, 'terminal hook uninstall should remove profile block');
assert(hookUninstallConfirmed.backupPath.length > 0, 'terminal hook uninstall should create backup');

assertProviderCommandRequiresBridge(root, ['provider', 'directory', 'list'], 'provider directory list');
assertProviderCommandRequiresBridge(root, ['provider', 'usage', 'codex', '--session-id', 'session-smoke', '--agent-id', 'agent-smoke', '--window', 'day'], 'provider usage list');
assertProviderCommandRequiresBridge(root, ['provider', 'list'], 'provider profile list');
assertProviderCommandRequiresBridge(root, ['provider', 'discover', catalogPath], 'provider ACP discovery');
assertProviderCommandRequiresBridge(root, ['provider', 'import', catalogPath, '--confirm'], 'provider ACP import');
assertProviderCommandRequiresBridge(root, ['provider', 'upsert', '--profile-id', 'cli-provider-smoke'], 'provider profile upsert');
assertProviderCommandRequiresBridge(root, ['provider', 'clone', '--from', 'cli-provider-smoke', '--profile-id', 'cli-provider-smoke-copy'], 'provider profile clone');
assertProviderCommandRequiresBridge(root, ['provider', 'env', '--profile-id', 'cli-provider-smoke', '--set', 'SMOKE_ENV=ok'], 'provider env mutation');
assertProviderCommandRequiresBridge(root, ['provider', 'delete', '--profile-id', 'cli-provider-smoke'], 'provider profile delete');
assertProviderCommandRequiresBridge(root, ['provider', 'test', '--profile-id', 'cli-provider-smoke'], 'provider profile test');
assertProviderCommandRequiresBridge(root, ['metadata', 'sessionTitle', '--session-id', 'session-smoke', '--timeout-ms', '1000'], 'metadata generation');
assertProviderCommandRequiresBridge(root, ['metadata', 'cancel', '--request-id', 'metadata-smoke'], 'metadata cancellation');
assert(store.readProviderProfiles().length === 0, 'blocked Provider CLI commands must not mutate the local profile store');

store.writeProviderProfiles([{
  schemaVersion: 2,
  profileId: 'acp_smoke-provider',
  providerId: 'smoke-provider',
  displayName: 'Smoke Provider',
  binary: process.execPath,
  args: '--version',
  enabled: true,
  envRefs: [],
  models: [
    { id: 'smoke-model', displayName: 'Smoke Model' }
  ],
  tools: [
    { id: 'smoke.run', displayName: 'Smoke Run', slashCommand: '/smoke', available: true }
  ]
}]);

const providerCapabilities = runCli(root, ['provider', 'capabilities']);
assert(Array.isArray(providerCapabilities.providers), 'provider capabilities should expose providers');
assert(providerCapabilities.rpcUnavailable === true, 'provider capabilities should fall back to offline mode without live token');
let smokeCapability = null;
for (const provider of providerCapabilities.providers) {
  if (provider.id === 'profile.acp_smoke-provider') {
    smokeCapability = provider;
  }
}
assert(smokeCapability !== null, 'provider capabilities should include imported profile runtime');
assert(smokeCapability.capabilitySource === 'profile', 'provider capabilities should mark declared profile source');
assert(smokeCapability.counts.models === 1, 'provider capabilities should count declared profile models');
assert(smokeCapability.counts.tools === 1, 'provider capabilities should count declared profile tools');

const providerRefresh = runCli(root, ['provider', 'refresh']);
assert(providerRefresh.mode === 'refresh', 'provider refresh should report refresh mode');

const trusted = runCli(root, ['security', 'trust', '--device-id', 'device-smoke', '--name', 'Smoke Device']);
assert(Array.isArray(trusted.devices) && trusted.devices.length === 1, 'security trust should persist device');

const revoked = runCli(root, ['security', 'revoke', '--device-id', 'device-smoke']);
assert(revoked.revoked === true, 'security revoke should mark device revoked');

const securityAudit = runCli(root, ['security', 'audit']);
assert(securityAudit.action === 'security.audit.list', 'security audit should expose action');
assert(Array.isArray(securityAudit.events), 'security audit should expose events');
assert(securityAudit.events.length >= 2, 'security audit should record trust and revoke events');
assert(typeof securityAudit.storePath === 'string' && securityAudit.storePath.length > 0, 'security audit should expose store path');

const hostsDefault = runCli(root, ['security', 'hosts', 'status']);
assert(hostsDefault.action === 'security.hosts.status', 'security hosts status should expose action');
assert(hostsDefault.emptyAllowsAll === false, 'security hosts should never treat an empty allowlist as allow-all');
assert(hostsDefault.effectivePolicy === 'localhost_or_ip_literal', 'security hosts should expose secure default policy');

const hostsAdded = runCli(root, ['security', 'hosts', 'add', 'LOCALHOST:8787', '--host', '127.0.0.1']);
assert(hostsAdded.action === 'security.hosts.set', 'security hosts add should expose set action');
assert(hostsAdded.hostnames.includes('localhost'), 'security hosts add should normalize hostname');
assert(hostsAdded.hostnames.includes('127.0.0.1'), 'security hosts add should keep IPv4 literal');

const hostsDuplicateSet = runCli(root, ['security', 'hosts', 'set', '--host', 'localhost', '--host', 'localhost']);
assert(hostsDuplicateSet.hostnames.length === 1 && hostsDuplicateSet.hostnames[0] === 'localhost', 'security hosts set should de-duplicate hostnames');

const hostsInvalidResult = runCliResult(root, ['security', 'hosts', 'add', '*']);
assert(hostsInvalidResult.exitCode !== 0, 'security hosts invalid input should exit non-zero');
assert(hostsInvalidResult.payload && hostsInvalidResult.payload.ok === false, 'security hosts should reject wildcard host');
assert(hostsInvalidResult.payload.failureCategory === 'host_allowlist_invalid', 'security hosts invalid input should expose failure category');

const hostsRemoved = runCli(root, ['security', 'hosts', 'remove', 'localhost']);
assert(Array.isArray(hostsRemoved.hostnames) && hostsRemoved.hostnames.length === 0, 'security hosts remove should remove hostname');

const hostsReset = runCli(root, ['security', 'hosts', 'reset']);
assert(hostsReset.emptyAllowsAll === false, 'security hosts reset should restore secure default policy');
assert(hostsReset.defaultPolicyActive === true, 'security hosts reset should activate default host policy');

const tokenDefault = runCli(root, ['security', 'token', 'status']);
assert(tokenDefault.action === 'security.token.status', 'security token status should expose action');
assert(tokenDefault.tokenPresent === false, 'security token should default to no persisted token in smoke home');
assert(typeof tokenDefault.tokenFingerprint === 'string', 'security token status should expose fingerprint field');
assert(!Object.prototype.hasOwnProperty.call(tokenDefault, 'token'), 'security token status must not expose token plaintext');

const tokenRotated = runCli(root, ['security', 'token', 'rotate']);
assert(tokenRotated.action === 'security.token.rotate', 'security token rotate should expose action');
assert(tokenRotated.rotated === true, 'security token rotate should rotate profile token');
assert(tokenRotated.tokenSource === 'profile', 'security token rotate should persist profile token');
assert(tokenRotated.tokenPresent === true, 'security token rotate should leave token present');
assert(tokenRotated.tokenFingerprint.length > 0, 'security token rotate should expose new fingerprint');
assert(!Object.prototype.hasOwnProperty.call(tokenRotated, 'token'), 'security token rotate must not expose token plaintext');

const tokenAfterRotate = runCli(root, ['security', 'token', 'status']);
assert(tokenAfterRotate.tokenSource === 'profile', 'security token status should read rotated profile token');
assert(tokenAfterRotate.tokenFingerprint === tokenRotated.tokenFingerprint, 'security token status should report rotated token fingerprint');

const tlsDefault = runCli(root, ['security', 'tls', 'status']);
assert(tlsDefault.action === 'security.tls.status', 'security tls status should expose action');
assert(tlsDefault.active === false, 'security tls status should be honest about inactive TLS listener');

const tlsSet = runCli(root, ['security', 'tls', 'set', '--enabled', 'on', '--cert', path.join(root, 'missing-cert.pem'), '--key', path.join(root, 'missing-key.pem')]);
assert(tlsSet.enabled === true, 'security tls set should persist enabled preference');
assert(tlsSet.active === false, 'security tls set should not claim an active TLS listener');
assert(tlsSet.failureCategory === 'tls_material_missing', 'security tls set should expose missing TLS material');

const authDefault = runCli(root, ['security', 'auth', 'status']);
assert(authDefault.action === 'security.auth.status', 'security auth status should expose action');
assert(authDefault.activeMode === 'bearer', 'security auth should keep bearer token as active mode');

const authInvalid = runCliResult(root, ['security', 'auth', 'set', '--local', '--mode', 'bcrypt', '--bcrypt-hash', '$2b$smoke']);
assert(authInvalid.exitCode !== 0, 'security auth set should reject invalid bcrypt hash');
assert(authInvalid.payload.failureCategory === 'bcrypt_hash_invalid', 'security auth set should classify invalid bcrypt hash');

const authSet = runCli(root, ['security', 'auth', 'set', '--local', '--mode', 'bcrypt', '--password-env', 'NGF_SMOKE_PASSWORD'], {
  NGF_SMOKE_PASSWORD: 'management-smoke-password'
});
assert(authSet.mode === 'bcrypt', 'security auth set should persist bcrypt preference');
assert(authSet.bcryptActive === true, 'security auth set should activate bcrypt verification');
assert(authSet.bcryptCost === 12, 'security auth set should use bcrypt cost 12');
assert(authSet.localRecovery === true, 'security auth local mode should expose recovery scope');
assert(!Object.prototype.hasOwnProperty.call(authSet, 'bcryptHash'), 'security auth result must not expose bcrypt hash');

const securityWarningAudit = runCli(root, ['security', 'audit', '--severity', 'warning']);
assert(Array.isArray(securityWarningAudit.events), 'security audit severity filter should expose events array');
assert(securityWarningAudit.events.some((event) => event.action === 'security.hosts.set'), 'security audit should record rejected host allowlist updates');

const securityDoctor = runCli(root, ['security', 'doctor']);
assert(Array.isArray(securityDoctor.checks) && securityDoctor.checks.length > 0, 'security doctor should expose checks');
assert(securityDoctor.checks.some((check) => check.id === 'security_audit_recent' && check.status === 'ok'), 'security doctor should see recent audit events');
assert(securityDoctor.checks.some((check) => check.id === 'host_allowlist' && check.status === 'ok'), 'security doctor should accept secure default host policy');
assert(securityDoctor.checks.some((check) => check.id === 'tls_config' && check.status === 'warning'), 'security doctor should warn on stored TLS preference without active listener');
assert(securityDoctor.checks.some((check) => check.id === 'bcrypt_auth' && check.status === 'ok'), 'security doctor should verify active bcrypt authentication');

const workspaceList = runCli(root, ['workspace', 'list']);
assert(Array.isArray(workspaceList.workspaces), 'workspace list should expose workspaces array');
assert(Array.isArray(workspaceList.suggestions), 'workspace list should expose suggestions array');
assert(Array.isArray(workspaceList.projects), 'workspace list should expose grouped projects');

const workspaceUpsert = runCli(root, ['workspace', 'upsert', '--path', root, '--title', 'Smoke Workspace']);
assert(workspaceUpsert.workspace.cwd === root, 'workspace upsert should persist workspace path');
assert(workspaceUpsert.confirmed === true, 'workspace upsert should confirm immediately for compatibility');

const importPath = path.join(root, 'imported-workspace');
fs.mkdirSync(importPath, { recursive: true });
const workspaceImportPreview = runCli(root, ['workspace', 'import', '--path', importPath, '--title', 'Imported Workspace']);
assert(workspaceImportPreview.preview === true && workspaceImportPreview.confirmed === false, 'workspace import should preview by default');
let previewFound = false;
for (const item of workspaceImportPreview.workspaces) {
  if (item.cwd === importPath) {
    previewFound = true;
  }
}
assert(previewFound === false, 'workspace import preview should not write registry records');

const workspaceImported = runCli(root, ['workspace', 'import', '--path', importPath, '--title', 'Imported Workspace', '--confirm']);
assert(workspaceImported.confirmed === true && workspaceImported.workspace.cwd === importPath, 'workspace import --confirm should write registry records');
assert(workspaceImported.validation.ok === true, 'workspace import should expose validation');

const duplicateImport = runCli(root, ['workspace', 'import', '--path', importPath, '--title', 'Imported Workspace Again', '--confirm']);
assert(duplicateImport.duplicateOfWorkspaceId === workspaceImported.workspace.workspaceId, 'duplicate workspace import should update existing record');

const workspaceCreatePreview = runCli(root, ['workspace', 'create', '--path', importPath, '--title', 'Create Preview']);
assert(workspaceCreatePreview.preview === true && workspaceCreatePreview.confirmed === false, 'workspace create should preview by default');

const workspaceSuggestions = runCli(root, ['workspace', 'suggestions']);
assert(Array.isArray(workspaceSuggestions.suggestions), 'workspace suggestions should expose suggestions array');

const workspaceOpenDryRun = runCli(root, ['workspace', 'open', '--path', root, '--dry-run']);
assert(workspaceOpenDryRun.preview === true && workspaceOpenDryRun.openStatus === 'preview', 'workspace open --dry-run should not open');

const workspaceArchivePreview = runCli(root, ['workspace', 'archive', '--id', workspaceImported.workspace.workspaceId]);
assert(workspaceArchivePreview.preview === true && workspaceArchivePreview.confirmed === false, 'workspace archive should preview by default');
const stillListedAfterPreview = runCli(root, ['workspace', 'list']);
let stillActive = false;
for (const item of stillListedAfterPreview.workspaces) {
  if (item.workspaceId === workspaceImported.workspace.workspaceId) {
    stillActive = true;
  }
}
assert(stillActive === true, 'workspace archive preview should not archive registry records');

const workspaceArchived = runCli(root, ['workspace', 'archive', '--id', workspaceImported.workspace.workspaceId, '--confirm']);
assert(workspaceArchived.confirmed === true && workspaceArchived.workspace.status === 'archived', 'workspace archive --confirm should soft archive registry records');
assert(fs.existsSync(importPath), 'workspace archive should not delete local directory');

const restoredImport = runCli(root, ['workspace', 'import', '--path', importPath, '--title', 'Restored Workspace', '--confirm']);
assert(restoredImport.restoredArchived === true, 'workspace import should restore archived duplicate records');
assert(restoredImport.workspace.workspaceId === workspaceImported.workspace.workspaceId, 'workspace import should reuse archived workspace id');

const missingPath = path.join(root, 'missing-workspace');
const missingWorkspace = workspaceRegistry.upsertWorkspace({
  workspacePath: missingPath,
  cwd: missingPath,
  workspaceTitle: 'Missing Workspace',
  title: 'Missing Workspace',
  dedupeByCwd: true
});
assert(missingWorkspace !== null, 'test should seed missing workspace record');
const workspaceDoctor = runCli(root, ['workspace', 'doctor']);
let missingCheckFound = false;
for (const check of workspaceDoctor.checks) {
  if (typeof check.id === 'string' && check.id.indexOf('missing:') === 0) {
    missingCheckFound = true;
  }
}
assert(missingCheckFound === true, 'workspace doctor should report missing workspace records');

const gitSubscribeStatus = runCli(root, ['git', 'subscribe', 'status', '--subscription-id', 'smoke']);
assert(gitSubscribeStatus.status === 'cli_stateless', 'git subscribe status should expose CLI stateless status');

const agentList = runCli(root, ['agent', 'list']);
assert(Array.isArray(agentList.agents) && agentList.agents.length >= 1, 'agent list should expose persisted agents');

const agentTree = runCli(root, ['agent', 'list', '--tree']);
assert(Array.isArray(agentTree.agents), 'agent list --tree should expose agents');
assert(Array.isArray(agentTree.relationshipTree), 'agent list --tree should expose relationship tree');
assert(agentTree.relationshipDoctor && Array.isArray(agentTree.relationshipDoctor.checks), 'agent list --tree should expose relationship doctor');

const agentDoctor = runCli(root, ['agent', 'doctor']);
assert(Array.isArray(agentDoctor.checks) && agentDoctor.checks.length > 0, 'agent doctor should expose relationship checks');

const agentLogs = runCli(root, ['agent', 'logs', smokeAgent.id, '--limit', '10']);
assert(agentLogs.action === 'agent.logs', 'agent logs should expose action');
assert(agentLogs.source === 'offline', 'agent logs should fall back to offline timeline without live token');
assert(Array.isArray(agentLogs.items) && agentLogs.items.length >= 1, 'agent logs should expose timeline items');
assert(agentLogs.latestSeq >= 1, 'agent logs should expose latest seq');

const agentWaitMatched = runCli(root, ['agent', 'wait', smokeAgent.id, '--status', 'initializing', '--timeout-ms', '1000']);
assert(agentWaitMatched.action === 'agent.wait', 'agent wait should expose action');
assert(agentWaitMatched.matched === true, 'agent wait should match current local status');
assert(agentWaitMatched.agent.id === smokeAgent.id, 'agent wait should return agent record');

const agentWaitTimedOut = runCliResult(root, ['agent', 'wait', smokeAgent.id, '--status', 'closed', '--timeout-ms', '0']);
assert(agentWaitTimedOut.exitCode !== 0, 'agent wait timeout should exit non-zero');
assert(agentWaitTimedOut.payload.action === 'agent.wait', 'agent wait timeout should expose action');
assert(agentWaitTimedOut.payload.code === 'agent_wait_timeout', 'agent wait timeout should expose structured code');
assert(agentWaitTimedOut.payload.timedOut === true, 'agent wait timeout should mark timedOut');

const permitList = runCli(root, ['permit', 'list']);
assert(Array.isArray(permitList.permits) && permitList.permits.length === 1, 'permit list should expose pending permissions');
assert(permitList.pendingCount === 1, 'permit list should count pending permissions');
assert(permitList.permits[0].requestId === 'perm-smoke', 'permit list should expose request id');
assert(permitList.permits[0].agentId === smokeAgent.id, 'permit list should expose agent id');

const permitWaitMatched = runCli(root, ['permit', 'wait', '--agent-id', smokeAgent.id, '--kind', 'permission', '--timeout-ms', '1000']);
assert(permitWaitMatched.action === 'permit.wait', 'permit wait should expose action');
assert(permitWaitMatched.matched === true, 'permit wait should match existing pending permission');
assert(Array.isArray(permitWaitMatched.permits) && permitWaitMatched.permits.length === 1, 'permit wait should return matching permits');
assert(permitWaitMatched.permits[0].requestId === 'perm-smoke', 'permit wait should expose request id');
assert(permitWaitMatched.target.agentId === smokeAgent.id, 'permit wait should echo target agent id');

const permitWaitTimedOut = runCliResult(root, ['permit', 'wait', '--request-id', 'missing-permit', '--timeout-ms', '0']);
assert(permitWaitTimedOut.exitCode !== 0, 'permit wait timeout should exit non-zero');
assert(permitWaitTimedOut.payload.action === 'permit.wait', 'permit wait timeout should expose action');
assert(permitWaitTimedOut.payload.code === 'permit_wait_timeout', 'permit wait timeout should expose structured code');
assert(permitWaitTimedOut.payload.timedOut === true, 'permit wait timeout should mark timedOut');

const notificationWaitMatched = runCli(root, ['notification', 'wait', '--kind', 'permission', '--agent-id', smokeAgent.id, '--request-id', 'perm-smoke', '--timeout-ms', '1000']);
assert(notificationWaitMatched.action === 'notification.wait', 'notification wait should expose action');
assert(notificationWaitMatched.matched === true, 'notification wait should match existing unread notification');
assert(Array.isArray(notificationWaitMatched.notifications) && notificationWaitMatched.notifications.length === 1, 'notification wait should return matching notifications');
assert(notificationWaitMatched.notifications[0].notificationId === smokeNotification.notificationId, 'notification wait should return the persisted notification');
assert(notificationWaitMatched.target.agentId === smokeAgent.id, 'notification wait should echo target agent id');

const notificationWaitTimedOut = runCliResult(root, ['notification', 'wait', '--kind', 'completed', '--timeout-ms', '0']);
assert(notificationWaitTimedOut.exitCode !== 0, 'notification wait timeout should exit non-zero');
assert(notificationWaitTimedOut.payload.action === 'notification.wait', 'notification wait timeout should expose action');
assert(notificationWaitTimedOut.payload.code === 'notification_wait_timeout', 'notification wait timeout should expose structured code');
assert(notificationWaitTimedOut.payload.timedOut === true, 'notification wait timeout should mark timedOut');

notificationManager.create({
  kind: 'info',
  severity: 'info',
  title: 'Expired CLI notification',
  body: 'Prune me.',
  createdAt: '2020-01-01T00:00:00.000Z',
  ttlMs: 1
});
const notificationPrune = runCli(root, ['notification', 'prune']);
assert(notificationPrune.action === 'notification.prune', 'notification prune should expose action');
assert(notificationPrune.removedCount === 1, 'notification prune should remove expired notifications');
assert(notificationPrune.remainingCount >= 1, 'notification prune should retain active notifications');

const permitApproveWithoutRpc = runCliResult(root, ['permit', 'approve', '--agent-id', smokeAgent.id, '--request-id', 'perm-smoke']);
assert(permitApproveWithoutRpc.exitCode !== 0, 'permit approve without live token should fail clearly');
assert(permitApproveWithoutRpc.payload.action === 'permit.approve', 'permit approve failure should expose action');
assert(permitApproveWithoutRpc.payload.rpcUnavailable === true, 'permit approve without live token should report rpc unavailable');
assert(
  permitApproveWithoutRpc.payload.failureCategory === 'rpc_token_missing' ||
  permitApproveWithoutRpc.payload.failureCategory === 'rpc_unavailable',
  'permit approve without live bridge should expose failure category'
);

const agentStatus = runCli(root, ['agent', 'status', smokeAgent.id]);
assert(agentStatus.agent.id === smokeAgent.id, 'agent status should expose agent record');

const agentAttach = runCli(root, ['agent', 'attach', smokeAgent.id, '--status-only']);
assert(agentAttach.attached === false, 'agent attach should report detached placeholder sessions');

const checkpointCreated = runCli(root, ['agent', 'checkpoint', 'create', smokeAgent.id, '--title', 'Smoke Checkpoint']);
assert(checkpointCreated.checkpoint.checkpointId.length > 0, 'agent checkpoint create should return checkpoint');

const checkpointList = runCli(root, ['agent', 'checkpoint', 'list', smokeAgent.id]);
assert(Array.isArray(checkpointList.checkpoints) && checkpointList.checkpoints.length >= 1, 'agent checkpoint list should return checkpoints');

const forked = runCli(root, ['agent', 'fork', smokeAgent.id, '--title', 'Smoke Fork']);
assert(forked.agent.forkedFromAgentId === smokeAgent.id, 'agent fork should link source agent');
assert(Array.isArray(forked.relationshipTree), 'agent fork should return relationship tree');

const detached = runCli(root, ['agent', 'detach', forked.agent.id]);
assert(detached.agent.detached === true, 'agent detach should mark agent detached');
assert(detached.agent.rootAgentId === forked.agent.id, 'agent detach should make agent its own root');

const archived = runCli(root, ['agent', 'archive', smokeAgent.id, '--cascade']);
assert(archived.cascade === true, 'agent archive should support cascade');

console.log('management cli smoke ok');
