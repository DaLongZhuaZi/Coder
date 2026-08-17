'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { profileDirectory } = require('./profile-store');

const STORE_VERSION = 1;

function bridgeHomeDirectory(explicitDirectory) {
  if (typeof explicitDirectory === 'string' && explicitDirectory.length > 0) {
    return explicitDirectory;
  }
  if (process.env.AGENT_BRIDGE_HOME && process.env.AGENT_BRIDGE_HOME.length > 0) {
    return process.env.AGENT_BRIDGE_HOME;
  }
  return profileDirectory();
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallbackValue;
  }
}

const ATOMIC_RENAME_MAX_ATTEMPTS = 4;
const RETRYABLE_RENAME_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function isRetryableRenameError(error) {
  return Boolean(error && typeof error.code === 'string' && RETRYABLE_RENAME_ERROR_CODES.has(error.code));
}

function renameFileWithRetry(tempPath, filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < ATOMIC_RENAME_MAX_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableRenameError(error) || attempt === ATOMIC_RENAME_MAX_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error('Atomic rename failed without an error.');
}

function writeJsonFileAtomic(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempPath = filePath + '.tmp-' + process.pid + '-' + Date.now() + '-' + randomSuffix;
  let renamed = false;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    renameFileWithRetry(tempPath, filePath);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_error) {
        // The original write error is more useful than cleanup failure.
      }
    }
  }
}

function randomId(prefix) {
  return prefix + '_' + crypto.randomBytes(12).toString('base64url');
}

function loadOrCreateTextId(filePath, prefix) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8').trim();
    if (existing.length > 0) {
      return existing;
    }
  }
  const value = randomId(prefix);
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, value + '\n', 'utf8');
  return value;
}

function safeSegment(value) {
  const source = typeof value === 'string' && value.length > 0 ? value : 'unknown';
  const withoutRoot = source.replace(/^[a-zA-Z]:[\\/]/, '').replace(/^[/\\]+/, '');
  const normalized = withoutRoot.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (normalized.length === 0) {
    return 'unknown';
  }
  if (normalized.length > 120) {
    return normalized.substring(0, 80) + '-' + crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  }
  return normalized;
}

function normalizeConfig(source) {
  const config = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const daemon = config.daemon && typeof config.daemon === 'object' && !Array.isArray(config.daemon) ? config.daemon : {};
  const features = config.features && typeof config.features === 'object' && !Array.isArray(config.features) ? config.features : {};
  return {
    version: STORE_VERSION,
    daemon: {
      hostnames: Array.isArray(daemon.hostnames) ? daemon.hostnames : [],
      hostnamesUpdatedAt: typeof daemon.hostnamesUpdatedAt === 'string' ? daemon.hostnamesUpdatedAt : '',
      trustedProxies: Array.isArray(daemon.trustedProxies) ? daemon.trustedProxies : ['loopback'],
      auth: daemon.auth && typeof daemon.auth === 'object' && !Array.isArray(daemon.auth) ? daemon.auth : {},
      tls: daemon.tls && typeof daemon.tls === 'object' && !Array.isArray(daemon.tls) ? daemon.tls : {
        enabled: false,
        certPath: '',
        keyPath: '',
        caPath: '',
        updatedAt: ''
      },
      relay: daemon.relay && typeof daemon.relay === 'object' && !Array.isArray(daemon.relay) ? daemon.relay : {},
      mcp: daemon.mcp && typeof daemon.mcp === 'object' && !Array.isArray(daemon.mcp) ? daemon.mcp : {},
      autostart: daemon.autostart && typeof daemon.autostart === 'object' && !Array.isArray(daemon.autostart)
        ? daemon.autostart
        : {
            enabled: false,
            method: 'manual',
            updatedAt: ''
          }
    },
    features: {
      terminal: readBoolean(features, 'terminal', false),
      fileTransfer: readBoolean(features, 'fileTransfer', false),
      schedules: readBoolean(features, 'schedules', false),
      loops: readBoolean(features, 'loops', false),
      chat: readBoolean(features, 'chat', false),
      relay: readBoolean(features, 'relay', false),
      voice: readBoolean(features, 'voice', false),
      browser: readBoolean(features, 'browser', false)
    }
  };
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

class DaemonStore {
  constructor(baseDirectory) {
    this.baseDirectory = bridgeHomeDirectory(baseDirectory);
    this.paths = {
      config: path.join(this.baseDirectory, 'config.json'),
      serverId: path.join(this.baseDirectory, 'server-id'),
      instanceId: path.join(this.baseDirectory, 'instance-id'),
      daemonLog: path.join(this.baseDirectory, 'daemon.log'),
      agents: path.join(this.baseDirectory, 'agents'),
      projects: path.join(this.baseDirectory, 'projects'),
      providerProfiles: path.join(this.baseDirectory, 'providers'),
      fileCheckpoints: path.join(this.baseDirectory, 'checkpoints', 'files'),
      schedules: path.join(this.baseDirectory, 'schedules'),
      chat: path.join(this.baseDirectory, 'chat'),
      loops: path.join(this.baseDirectory, 'loops'),
      terminalCaptures: path.join(this.baseDirectory, 'runtime', 'terminal-captures'),
      terminalHooks: path.join(this.baseDirectory, 'runtime', 'terminal-hooks'),
      notifications: path.join(this.baseDirectory, 'runtime', 'notifications.json'),
      pushSubscriptions: path.join(this.baseDirectory, 'runtime', 'push-subscriptions.json'),
      trustedDevices: path.join(this.baseDirectory, 'security', 'trusted-devices.json'),
      securityAudit: path.join(this.baseDirectory, 'security', 'audit-log.json'),
      managedProcesses: path.join(this.baseDirectory, 'runtime', 'managed-processes'),
      daemonSupervisorState: path.join(this.baseDirectory, 'runtime', 'daemon-supervisor.json'),
      daemonSupervisorLock: path.join(this.baseDirectory, 'runtime', 'daemon-supervisor.lock'),
      daemonUpdateDirectory: path.join(this.baseDirectory, 'updates'),
      daemonUpdateState: path.join(this.baseDirectory, 'updates', 'update-state.json'),
      daemonUpdateStaged: path.join(this.baseDirectory, 'updates', 'staged'),
      daemonUpdateBackups: path.join(this.baseDirectory, 'updates', 'backups')
      ,githubState: path.join(this.baseDirectory, 'github', 'state.json'),
      daemonRemoteConfigState: path.join(this.baseDirectory, 'remote-config', 'state.json')
      ,messageQueueState: path.join(this.baseDirectory, 'runtime', 'message-queue.json'),
      usageState: path.join(this.baseDirectory, 'runtime', 'usage.json'),
      browserAutomationState: path.join(this.baseDirectory, 'browser', 'state.json'),
      workspaceServiceState: path.join(this.baseDirectory, 'services', 'state.json'),
      workspaceServiceLogs: path.join(this.baseDirectory, 'services', 'logs')
    };
    this.ensureLayout();
    this.serverId = loadOrCreateTextId(this.paths.serverId, 'srv');
    this.instanceId = loadOrCreateTextId(this.paths.instanceId, 'ins');
    this.config = this.loadConfig();
  }

  ensureLayout() {
    ensureDirectory(this.baseDirectory);
    ensureDirectory(this.paths.agents);
    ensureDirectory(this.paths.projects);
    ensureDirectory(this.paths.providerProfiles);
    ensureDirectory(this.paths.fileCheckpoints);
    ensureDirectory(this.paths.schedules);
    ensureDirectory(this.paths.chat);
    ensureDirectory(this.paths.loops);
    ensureDirectory(this.paths.terminalCaptures);
    ensureDirectory(this.paths.terminalHooks);
    ensureDirectory(path.dirname(this.paths.notifications));
    ensureDirectory(path.dirname(this.paths.pushSubscriptions));
    ensureDirectory(path.dirname(this.paths.trustedDevices));
    ensureDirectory(path.dirname(this.paths.securityAudit));
    ensureDirectory(this.paths.managedProcesses);
    ensureDirectory(this.paths.daemonUpdateStaged);
    ensureDirectory(this.paths.daemonUpdateBackups);
    ensureDirectory(path.dirname(this.paths.githubState));
    ensureDirectory(path.dirname(this.paths.daemonRemoteConfigState));
    ensureDirectory(path.dirname(this.paths.messageQueueState));
    ensureDirectory(path.dirname(this.paths.browserAutomationState));
    ensureDirectory(path.dirname(this.paths.workspaceServiceState));
    ensureDirectory(this.paths.workspaceServiceLogs);
  }

  loadConfig() {
    const config = normalizeConfig(readJsonFile(this.paths.config, null));
    writeJsonFileAtomic(this.paths.config, config);
    return config;
  }

  writeConfig(config) {
    this.config = normalizeConfig(config);
    writeJsonFileAtomic(this.paths.config, this.config);
    return this.config;
  }

  readGitHubState() {
    const value = readJsonFile(this.paths.githubState, null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { version: 1, accounts: [], bindings: [] };
  }

  writeGitHubState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) ? state : { version: 1, accounts: [], bindings: [] };
    writeJsonFileAtomic(this.paths.githubState, value);
  }

  readDaemonRemoteConfigState() {
    const value = readJsonFile(this.paths.daemonRemoteConfigState, null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { version: 1, active: null, previous: null, fetched: null, degraded: false };
  }

  writeDaemonRemoteConfigState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) ? state : { version: 1, active: null, previous: null, fetched: null, degraded: true };
    writeJsonFileAtomic(this.paths.daemonRemoteConfigState, value);
    return value;
  }

  readMessageQueueState() {
    const value = readJsonFile(this.paths.messageQueueState, null);
    return value && typeof value === 'object' && Array.isArray(value.items) ? value : { version: 1, items: [] };
  }

  writeMessageQueueState(state) { writeJsonFileAtomic(this.paths.messageQueueState, state && typeof state === 'object' ? state : { version: 1, items: [] }); }

  readUsageState() {
    const value = readJsonFile(this.paths.usageState, null);
    return value && typeof value === 'object' && Array.isArray(value.events) ? value : { version: 1, events: [], budgets: {} };
  }

  writeUsageState(state) { writeJsonFileAtomic(this.paths.usageState, state && typeof state === 'object' ? state : { version: 1, events: [], budgets: {} }); }

  readBrowserAutomationState() {
    const value = readJsonFile(this.paths.browserAutomationState, null);
    return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.permissions)
      ? value
      : { version: 1, permissions: [] };
  }

  writeBrowserAutomationState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) && Array.isArray(state.permissions)
      ? state
      : { version: 1, permissions: [] };
    writeJsonFileAtomic(this.paths.browserAutomationState, value);
    return value;
  }

  readWorkspaceServiceState() {
    const value = readJsonFile(this.paths.workspaceServiceState, null);
    return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.services)
      ? value
      : { version: 1, services: [] };
  }

  writeWorkspaceServiceState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) && Array.isArray(state.services)
      ? state
      : { version: 1, services: [] };
    writeJsonFileAtomic(this.paths.workspaceServiceState, value);
    return value;
  }

  workspaceServiceLogFilePath(serviceId) {
    return path.join(this.paths.workspaceServiceLogs, safeSegment(serviceId) + '.log');
  }

  agentDirectoryForCwd(cwd) {
    return path.join(this.paths.agents, safeSegment(cwd));
  }

  agentFilePath(cwd, agentId) {
    return path.join(this.agentDirectoryForCwd(cwd), safeSegment(agentId) + '.json');
  }

  writeAgentRecord(record) {
    writeJsonFileAtomic(this.agentFilePath(record.cwd, record.id), record);
  }

  readAgentRecord(cwd, agentId) {
    return readJsonFile(this.agentFilePath(cwd, agentId), null);
  }

  listAgentRecords() {
    const records = [];
    if (!fs.existsSync(this.paths.agents)) {
      return records;
    }
    const groups = fs.readdirSync(this.paths.agents, { withFileTypes: true });
    for (const group of groups) {
      if (!group.isDirectory()) {
        continue;
      }
      const directoryPath = path.join(this.paths.agents, group.name);
      const files = fs.readdirSync(directoryPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) {
          continue;
        }
        const parsed = readJsonFile(path.join(directoryPath, file.name), null);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.id === 'string') {
          records.push(parsed);
        }
      }
    }
    return records;
  }

  projectRegistryPath() {
    return path.join(this.paths.projects, 'projects.json');
  }

  workspaceRegistryPath() {
    return path.join(this.paths.projects, 'workspaces.json');
  }

  readProjectRegistry() {
    const value = readJsonFile(this.projectRegistryPath(), []);
    return Array.isArray(value) ? value : [];
  }

  writeProjectRegistry(projects) {
    writeJsonFileAtomic(this.projectRegistryPath(), Array.isArray(projects) ? projects : []);
  }

  readWorkspaceRegistry() {
    const value = readJsonFile(this.workspaceRegistryPath(), []);
    return Array.isArray(value) ? value : [];
  }

  writeWorkspaceRegistry(workspaces) {
    writeJsonFileAtomic(this.workspaceRegistryPath(), Array.isArray(workspaces) ? workspaces : []);
  }

  providerProfilesPath() {
    return path.join(this.paths.providerProfiles, 'profiles.json');
  }

  readProviderProfilesState() {
    const value = readJsonFile(this.providerProfilesPath(), null);
    if (Array.isArray(value)) {
      return {
        schemaVersion: 1,
        profiles: value
      };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.profiles)) {
      return {
        schemaVersion: typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)
          ? Math.max(1, Math.floor(value.schemaVersion))
          : 1,
        profiles: value.profiles
      };
    }
    return {
      schemaVersion: 2,
      profiles: []
    };
  }

  readProviderProfiles() {
    return this.readProviderProfilesState().profiles;
  }

  writeProviderProfiles(profiles) {
    writeJsonFileAtomic(this.providerProfilesPath(), {
      schemaVersion: 2,
      profiles: Array.isArray(profiles) ? profiles : []
    });
  }

  fileCheckpointPath(snapshotId) {
    return path.join(this.paths.fileCheckpoints, safeSegment(snapshotId) + '.json');
  }

  readTrustedDevices() {
    const value = readJsonFile(this.paths.trustedDevices, []);
    return Array.isArray(value) ? value : [];
  }

  writeTrustedDevices(devices) {
    writeJsonFileAtomic(this.paths.trustedDevices, Array.isArray(devices) ? devices : []);
  }

  terminalCaptureFilePath(terminalId) {
    return path.join(this.paths.terminalCaptures, safeSegment(terminalId) + '.log');
  }

  terminalHookFilePath(fileName) {
    return path.join(this.paths.terminalHooks, safeSegment(fileName));
  }

  managedProcessFilePath(recordId) {
    return path.join(this.paths.managedProcesses, safeSegment(recordId) + '.json');
  }

  writeManagedProcessRecord(record) {
    writeJsonFileAtomic(this.managedProcessFilePath(record.id), record);
  }

  removeManagedProcessRecord(recordId, expectedPid) {
    const filePath = this.managedProcessFilePath(recordId);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    if (typeof expectedPid === 'number' && expectedPid > 0) {
      const record = readJsonFile(filePath, null);
      if (!record || typeof record !== 'object' || Array.isArray(record) || record.pid !== expectedPid) {
        return false;
      }
    }
    fs.unlinkSync(filePath);
    return true;
  }

  listManagedProcessRecords() {
    const records = [];
    if (!fs.existsSync(this.paths.managedProcesses)) {
      return records;
    }
    const files = fs.readdirSync(this.paths.managedProcesses, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }
      const parsed = readJsonFile(path.join(this.paths.managedProcesses, file.name), null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.id === 'string') {
        records.push(parsed);
      }
    }
    return records;
  }

  readDaemonSupervisorState() {
    const value = readJsonFile(this.paths.daemonSupervisorState, null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  writeDaemonSupervisorState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    writeJsonFileAtomic(this.paths.daemonSupervisorState, value);
    return value;
  }

  readDaemonUpdateState() {
    const value = readJsonFile(this.paths.daemonUpdateState, null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  writeDaemonUpdateState(state) {
    const value = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    writeJsonFileAtomic(this.paths.daemonUpdateState, value);
    return value;
  }
}

function createDaemonStore(baseDirectory) {
  return new DaemonStore(baseDirectory);
}

module.exports = {
  DaemonStore,
  createDaemonStore,
  randomId,
  safeSegment,
  writeJsonFileAtomic
};
