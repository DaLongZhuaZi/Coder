'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MANAGED_MARKER = 'NGF_AGENT_BRIDGE_AUTOSTART_MANAGED';
const AUTOSTART_DIRECTORY_NAME = 'autostart';

function nowIso() {
  return new Date().toISOString();
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

function safeHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
}

function normalizeMethod(method, platform) {
  const requested = typeof method === 'string' && method.length > 0 ? method.trim().toLowerCase() : 'auto';
  if (requested !== 'auto' && requested !== 'manual') {
    return requested;
  }
  if (requested === 'manual') {
    return 'manual';
  }
  if (platform === 'win32') {
    return 'windows_task';
  }
  if (platform === 'darwin') {
    return 'launchd';
  }
  if (platform === 'linux') {
    return 'systemd_user';
  }
  return 'unsupported';
}

function methodSupported(method, platform) {
  return (method === 'windows_task' && platform === 'win32') ||
    (method === 'launchd' && platform === 'darwin') ||
    (method === 'systemd_user' && platform === 'linux');
}

function quoteWindowsCommand(value) {
  const text = String(value || '');
  return '"' + text.replace(/"/g, '\\"') + '"';
}

function systemdQuote(value) {
  return '"' + String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%') + '"';
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function commandDisplay(command) {
  return command.command + (command.args.length > 0 ? ' ' + command.args.map((item) => JSON.stringify(item)).join(' ') : '');
}

function summarizedCommandResult(result, successMessage) {
  return Object.assign({}, result, {
    stdout: result.exitCode === 0 ? successMessage : ''
  });
}

function windowsTaskReferencesRunner(taskXml, runnerPath) {
  if (typeof taskXml !== 'string' || taskXml.length === 0) {
    return false;
  }
  const normalizedXml = taskXml.replace(/&quot;/g, '"').replace(/&amp;/g, '&').toLowerCase();
  return normalizedXml.includes(String(runnerPath || '').toLowerCase());
}

function defaultCommandRunner(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options && options.cwd ? options.cwd : process.cwd(),
      env: options && options.env ? options.env : process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      resolve({
        exitCode: -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: error instanceof Error ? error.message : String(error)
      });
    });
    child.on('close', (code) => {
      resolve({
        exitCode: typeof code === 'number' ? code : -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

function runnerSource(bridgeHome, serverPath) {
  return [
    "'use strict';",
    '// ' + MANAGED_MARKER,
    'process.env.AGENT_BRIDGE_HOME = ' + JSON.stringify(bridgeHome) + ';',
    'require(' + JSON.stringify(serverPath) + ');',
    ''
  ].join('\n');
}

function systemdUnitSource(plan) {
  return [
    '# ' + MANAGED_MARKER,
    '[Unit]',
    'Description=NGF Agent Bridge',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'ExecStart=' + systemdQuote(plan.execPath) + ' ' + systemdQuote(plan.runnerPath),
    'Environment=' + systemdQuote('AGENT_BRIDGE_HOME=' + plan.bridgeHome),
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    ''
  ].join('\n');
}

function launchdPlistSource(plan) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- ' + MANAGED_MARKER + ' -->',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    '  <string>' + xmlEscape(plan.registrationId) + '</string>',
    '  <key>ProgramArguments</key>',
    '  <array>',
    '    <string>' + xmlEscape(plan.execPath) + '</string>',
    '    <string>' + xmlEscape(plan.runnerPath) + '</string>',
    '  </array>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>AGENT_BRIDGE_HOME</key>',
    '    <string>' + xmlEscape(plan.bridgeHome) + '</string>',
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <dict><key>SuccessfulExit</key><false/></dict>',
    '  <key>StandardOutPath</key>',
    '  <string>' + xmlEscape(plan.logPath) + '</string>',
    '  <key>StandardErrorPath</key>',
    '  <string>' + xmlEscape(plan.logPath) + '</string>',
    '</dict>',
    '</plist>',
    ''
  ].join('\n');
}

function managedFileState(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 || !fs.existsSync(filePath)) {
    return { exists: false, managed: false };
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return { exists: true, managed: text.includes(MANAGED_MARKER) };
  } catch (_error) {
    return { exists: true, managed: false };
  }
}

function writeManagedFile(filePath, content) {
  const state = managedFileState(filePath);
  if (state.exists && !state.managed) {
    const error = new Error('Refusing to overwrite an autostart file not owned by Agent Bridge: ' + filePath);
    error.code = 'autostart_target_not_managed';
    throw error;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let backupPath = '';
  if (state.exists) {
    backupPath = filePath + '.bak-' + Date.now();
    fs.copyFileSync(filePath, backupPath);
  }
  const tempPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
  return backupPath;
}

function restoreManagedFile(filePath, backupPath) {
  try {
    if (backupPath.length > 0 && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
    } else if (fs.existsSync(filePath) && managedFileState(filePath).managed) {
      fs.unlinkSync(filePath);
    }
  } catch (_error) {
    // The original operation error remains the actionable failure.
  }
}

function removeManagedFile(filePath) {
  const state = managedFileState(filePath);
  if (!state.exists) {
    return { removed: false, backupPath: '' };
  }
  if (!state.managed) {
    const error = new Error('Refusing to remove an autostart file not owned by Agent Bridge: ' + filePath);
    error.code = 'autostart_target_not_managed';
    throw error;
  }
  const backupPath = filePath + '.bak-' + Date.now();
  fs.copyFileSync(filePath, backupPath);
  fs.unlinkSync(filePath);
  return { removed: true, backupPath };
}

class AutostartManager {
  constructor(store, options) {
    const config = options && typeof options === 'object' ? options : {};
    this.store = store;
    this.platform = readString(config, 'platform', process.platform);
    this.execPath = readString(config, 'execPath', process.execPath);
    this.serverPath = readString(config, 'serverPath', path.join(__dirname, 'supervisor-entrypoint.js'));
    this.userHome = readString(config, 'userHome', os.homedir());
    this.uid = typeof config.uid === 'number' ? config.uid : (typeof process.getuid === 'function' ? process.getuid() : 0);
    this.commandRunner = typeof config.commandRunner === 'function' ? config.commandRunner : defaultCommandRunner;
  }

  storedAutostart() {
    const daemon = this.store && this.store.config && this.store.config.daemon ? this.store.config.daemon : {};
    return daemon.autostart && typeof daemon.autostart === 'object' && !Array.isArray(daemon.autostart)
      ? daemon.autostart
      : {};
  }

  plan(payload) {
    const stored = this.storedAutostart();
    const requestedMethod = readString(payload, 'method', readString(stored, 'method', 'auto'));
    const method = normalizeMethod(requestedMethod, this.platform);
    const bridgeHome = path.resolve(this.store.baseDirectory);
    const idHash = safeHash(bridgeHome);
    const runnerPath = path.join(bridgeHome, AUTOSTART_DIRECTORY_NAME, 'daemon-autostart.js');
    const plan = {
      enabled: readBoolean(stored, 'enabled', false),
      configured: readBoolean(stored, 'configured', false),
      supported: methodSupported(method, this.platform),
      platform: this.platform,
      method,
      registrationId: '',
      targetPath: '',
      runnerPath,
      bridgeHome,
      execPath: this.execPath,
      serverPath: this.serverPath,
      logPath: this.store.paths.daemonLog,
      plannedCommand: '',
      installCommands: [],
      uninstallCommands: [],
      confirmRequired: true,
      note: '',
      failureCategory: '',
      remediation: '',
      updatedAt: nowIso()
    };
    if (!plan.supported) {
      plan.failureCategory = method === 'manual' ? 'manual_only' : 'platform_unsupported';
      plan.note = method === 'manual'
        ? 'Manual preference does not install an OS autostart entry.'
        : 'No supported autostart installer is available for this platform/method.';
      plan.remediation = 'Use method=auto or a method supported by the current operating system.';
      return plan;
    }
    if (method === 'windows_task') {
      plan.registrationId = 'NGF-Agent-Bridge-' + idHash;
      plan.targetPath = 'Task Scheduler/' + plan.registrationId;
      plan.plannedCommand = quoteWindowsCommand(this.execPath) + ' ' + quoteWindowsCommand(runnerPath);
      plan.installCommands.push({
        command: 'schtasks.exe',
        args: ['/Create', '/TN', plan.registrationId, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TR', plan.plannedCommand, '/F']
      });
      plan.uninstallCommands.push({
        command: 'schtasks.exe',
        args: ['/Delete', '/TN', plan.registrationId, '/F'],
        allowFailure: true
      });
      plan.note = 'Installs a current-user Task Scheduler entry that starts Bridge at logon.';
    } else if (method === 'systemd_user') {
      const unitName = 'ngf-agent-bridge-' + idHash + '.service';
      plan.registrationId = unitName;
      plan.targetPath = path.join(this.userHome, '.config', 'systemd', 'user', unitName);
      plan.plannedCommand = this.execPath + ' ' + JSON.stringify(runnerPath);
      plan.installCommands.push({ command: 'systemctl', args: ['--user', 'daemon-reload'] });
      plan.installCommands.push({ command: 'systemctl', args: ['--user', 'enable', unitName] });
      plan.uninstallCommands.push({ command: 'systemctl', args: ['--user', 'disable', '--now', unitName], allowFailure: true });
      plan.note = 'Installs and enables a systemd user service with restart-on-failure.';
    } else if (method === 'launchd') {
      plan.registrationId = 'com.dlzz.ngf-agent-bridge.' + idHash;
      plan.targetPath = path.join(this.userHome, 'Library', 'LaunchAgents', plan.registrationId + '.plist');
      plan.plannedCommand = this.execPath + ' ' + JSON.stringify(runnerPath);
      plan.installCommands.push({
        command: 'launchctl',
        args: ['bootout', 'gui/' + String(this.uid) + '/' + plan.registrationId],
        allowFailure: true
      });
      plan.installCommands.push({
        command: 'launchctl',
        args: ['bootstrap', 'gui/' + String(this.uid), plan.targetPath]
      });
      plan.uninstallCommands.push({
        command: 'launchctl',
        args: ['bootout', 'gui/' + String(this.uid) + '/' + plan.registrationId],
        allowFailure: true
      });
      plan.note = 'Installs and immediately loads a per-user LaunchAgent with restart-on-failure.';
    }
    return plan;
  }

  preview(payload) {
    return {
      ok: true,
      action: 'daemon.autostart.preview',
      autostart: this.storedAutostart(),
      configPath: this.store.paths.config,
      preview: this.publicPlan(this.plan(payload))
    };
  }

  async status(payload) {
    const plan = this.plan(payload);
    let configured = false;
    let warning = '';
    if (plan.supported) {
      if (plan.method === 'windows_task') {
        const query = await this.runCommand({
          command: 'schtasks.exe',
          args: ['/Query', '/TN', plan.registrationId, '/XML'],
          allowFailure: true
        });
        const runnerManaged = managedFileState(plan.runnerPath).managed;
        const taskManaged = query.exitCode === 0 && windowsTaskReferencesRunner(query.stdout, plan.runnerPath);
        configured = taskManaged && runnerManaged;
        if (query.exitCode === 0 && !configured) {
          warning = 'Task Scheduler entry exists but its managed runner could not be verified.';
        }
        if (query.exitCode !== 0 && readBoolean(this.storedAutostart(), 'configured', false)) {
          warning = query.stderr.length > 0 ? query.stderr : 'Task Scheduler entry was not found.';
        }
      } else if (plan.method === 'systemd_user') {
        const query = await this.runCommand({
          command: 'systemctl',
          args: ['--user', 'is-enabled', plan.registrationId],
          allowFailure: true
        });
        configured = query.exitCode === 0 &&
          query.stdout.trim() === 'enabled' &&
          managedFileState(plan.runnerPath).managed &&
          managedFileState(plan.targetPath).managed;
        if (query.exitCode !== 0 && readBoolean(this.storedAutostart(), 'configured', false)) {
          warning = query.stderr.length > 0 ? query.stderr : 'systemd user service is not enabled.';
        }
      } else {
        const query = await this.runCommand({
          command: 'launchctl',
          args: ['print', 'gui/' + String(this.uid) + '/' + plan.registrationId],
          allowFailure: true
        });
        configured = query.exitCode === 0 &&
          managedFileState(plan.runnerPath).managed &&
          managedFileState(plan.targetPath).managed;
        if (query.exitCode !== 0 && readBoolean(this.storedAutostart(), 'configured', false)) {
          warning = query.stderr.length > 0 ? query.stderr : 'LaunchAgent is not loaded.';
        }
      }
    }
    const stored = this.storedAutostart();
    const autostart = Object.assign({}, stored, {
      configured,
      supported: plan.supported,
      platform: plan.platform,
      method: plan.method,
      registrationId: plan.registrationId,
      targetPath: plan.targetPath,
      runnerPath: plan.runnerPath,
      warning,
      checkedAt: nowIso()
    });
    return {
      ok: true,
      action: 'daemon.autostart.status',
      autostart,
      configPath: this.store.paths.config,
      preview: this.publicPlan(plan),
      warning
    };
  }

  setPreference(payload) {
    const enabled = readBoolean(payload, 'enabled', false);
    const plan = this.plan(payload);
    const autostart = this.writeAutostart(Object.assign({}, this.storedAutostart(), {
      enabled,
      method: plan.method,
      supported: plan.supported,
      plannedCommand: plan.plannedCommand,
      targetPath: plan.targetPath,
      runnerPath: plan.runnerPath,
      note: plan.note,
      updatedAt: nowIso()
    }));
    return {
      ok: true,
      action: 'daemon.autostart.set',
      autostart,
      configPath: this.store.paths.config,
      preview: this.publicPlan(plan)
    };
  }

  async install(payload) {
    const plan = this.plan(payload);
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failureResult('daemon.autostart.install', plan, 'confirmation_required', 'Autostart installation requires confirm=true.', 'Review preview and confirm the OS-level change.');
    }
    if (!plan.supported) {
      return this.failureResult('daemon.autostart.install', plan, plan.failureCategory, plan.note, plan.remediation);
    }
    if (!fs.existsSync(plan.execPath) || !fs.existsSync(plan.serverPath)) {
      return this.failureResult('daemon.autostart.install', plan, 'runtime_missing', 'Node.js runtime or Bridge supervisor entry was not found.', 'Reinstall Agent Bridge and retry from the installed package.');
    }
    let runnerBackup = '';
    let targetBackup = '';
    const commandResults = [];
    let installCommandAttempted = false;
    let windowsExistingTaskXml = '';
    let launchdWasLoaded = false;
    let runnerWritten = false;
    let targetWritten = false;
    try {
      if (plan.method === 'windows_task') {
        const existingTask = await this.runCommand({
          command: 'schtasks.exe',
          args: ['/Query', '/TN', plan.registrationId, '/XML'],
          allowFailure: true
        });
        commandResults.push(summarizedCommandResult(existingTask, 'Existing managed task definition captured for rollback.'));
        if (existingTask.exitCode === 0) {
          if (!managedFileState(plan.runnerPath).managed ||
            !windowsTaskReferencesRunner(existingTask.stdout, plan.runnerPath)) {
            const error = new Error('Refusing to replace an existing Task Scheduler entry not owned by Agent Bridge.');
            error.code = 'autostart_target_not_managed';
            throw error;
          }
          windowsExistingTaskXml = existingTask.stdout;
        }
      } else if (plan.method === 'launchd') {
        const existingService = await this.runCommand({
          command: 'launchctl',
          args: ['print', 'gui/' + String(this.uid) + '/' + plan.registrationId],
          allowFailure: true
        });
        launchdWasLoaded = existingService.exitCode === 0;
        commandResults.push(summarizedCommandResult(existingService, 'Existing LaunchAgent state captured for rollback.'));
        if (launchdWasLoaded && !managedFileState(plan.targetPath).managed) {
          const error = new Error('Refusing to replace a loaded LaunchAgent not owned by Agent Bridge.');
          error.code = 'autostart_target_not_managed';
          throw error;
        }
      }
      runnerBackup = writeManagedFile(plan.runnerPath, runnerSource(plan.bridgeHome, plan.serverPath));
      runnerWritten = true;
      if (plan.method === 'systemd_user') {
        targetBackup = writeManagedFile(plan.targetPath, systemdUnitSource(plan));
        targetWritten = true;
      } else if (plan.method === 'launchd') {
        targetBackup = writeManagedFile(plan.targetPath, launchdPlistSource(plan));
        targetWritten = true;
      }
      for (const command of plan.installCommands) {
        installCommandAttempted = true;
        const result = await this.runCommand(command);
        commandResults.push(result);
        if (result.exitCode !== 0 && command.allowFailure !== true) {
          const error = new Error(result.stderr.length > 0 ? result.stderr : 'Autostart command failed: ' + commandDisplay(command));
          error.code = 'autostart_command_failed';
          throw error;
        }
      }
      const installedAt = nowIso();
      const autostart = this.writeAutostart({
        enabled: true,
        configured: true,
        supported: true,
        platform: plan.platform,
        method: plan.method,
        registrationId: plan.registrationId,
        targetPath: plan.targetPath,
        runnerPath: plan.runnerPath,
        plannedCommand: plan.plannedCommand,
        note: plan.note,
        installedAt,
        updatedAt: installedAt,
        lastError: ''
      });
      return {
        ok: true,
        action: 'daemon.autostart.install',
        autostart,
        configPath: this.store.paths.config,
        preview: this.publicPlan(plan),
        commandResults,
        backupPaths: [runnerBackup, targetBackup].filter((item) => item.length > 0),
        message: plan.method === 'launchd'
          ? 'Daemon autostart installed and loaded.'
          : 'Daemon autostart installed. It will apply at the next user login.',
        failureCategory: '',
        remediation: ''
      };
    } catch (error) {
      if (plan.method === 'windows_task') {
        if (runnerWritten) {
          restoreManagedFile(plan.runnerPath, runnerBackup);
        }
        if (installCommandAttempted && windowsExistingTaskXml.length > 0) {
          const restorePath = plan.runnerPath + '.restore-task-' + process.pid + '-' + Date.now() + '.xml';
          try {
            fs.writeFileSync(restorePath, windowsExistingTaskXml, 'utf8');
            const restoreResult = await this.runCommand({
              command: 'schtasks.exe',
              args: ['/Create', '/TN', plan.registrationId, '/XML', restorePath, '/F']
            });
            commandResults.push(summarizedCommandResult(restoreResult, 'Previous managed task definition restored.'));
          } finally {
            if (fs.existsSync(restorePath)) {
              fs.unlinkSync(restorePath);
            }
          }
        } else if (installCommandAttempted) {
          for (let index = plan.uninstallCommands.length - 1; index >= 0; index--) {
            const rollbackResult = await this.runCommand(plan.uninstallCommands[index]);
            commandResults.push(rollbackResult);
          }
        }
      } else if (plan.method === 'launchd') {
        if (installCommandAttempted) {
          for (let index = plan.uninstallCommands.length - 1; index >= 0; index--) {
            const rollbackResult = await this.runCommand(plan.uninstallCommands[index]);
            commandResults.push(rollbackResult);
          }
        }
        if (runnerWritten) {
          restoreManagedFile(plan.runnerPath, runnerBackup);
        }
        if (targetWritten) {
          restoreManagedFile(plan.targetPath, targetBackup);
        }
        if (installCommandAttempted && launchdWasLoaded && targetBackup.length > 0) {
          const restoreResult = await this.runCommand({
            command: 'launchctl',
            args: ['bootstrap', 'gui/' + String(this.uid), plan.targetPath]
          });
          commandResults.push(restoreResult);
        }
      } else if (installCommandAttempted) {
        for (let index = plan.uninstallCommands.length - 1; index >= 0; index--) {
          const rollbackResult = await this.runCommand(plan.uninstallCommands[index]);
          commandResults.push(rollbackResult);
        }
        if (runnerWritten) {
          restoreManagedFile(plan.runnerPath, runnerBackup);
        }
        if (targetWritten) {
          restoreManagedFile(plan.targetPath, targetBackup);
        }
      } else {
        if (runnerWritten) {
          restoreManagedFile(plan.runnerPath, runnerBackup);
        }
        if (targetWritten) {
          restoreManagedFile(plan.targetPath, targetBackup);
        }
      }
      return this.failureResult(
        'daemon.autostart.install',
        plan,
        error && typeof error.code === 'string' ? error.code : 'autostart_install_failed',
        error instanceof Error ? error.message : String(error),
        'Check user-level service permissions and retry after previewing the target.'
      , commandResults);
    }
  }

  async uninstall(payload) {
    const stored = this.storedAutostart();
    const requestedMethod = readString(payload, 'method', readString(stored, 'method', 'auto'));
    const plan = this.plan({ method: requestedMethod === 'manual' ? 'auto' : requestedMethod });
    if (!readBoolean(payload, 'confirm', false)) {
      return this.failureResult('daemon.autostart.uninstall', plan, 'confirmation_required', 'Autostart removal requires confirm=true.', 'Review status and confirm removal of the managed OS entry.');
    }
    if (!plan.supported) {
      return this.failureResult('daemon.autostart.uninstall', plan, plan.failureCategory, plan.note, plan.remediation);
    }
    const commandResults = [];
    const removedFiles = [];
    let registrationPresent = false;
    let registrationRemoved = false;
    let windowsTaskXml = '';
    try {
      const runnerState = managedFileState(plan.runnerPath);
      const targetState = plan.method === 'windows_task'
        ? { exists: false, managed: false }
        : managedFileState(plan.targetPath);
      if ((runnerState.exists && !runnerState.managed) || (targetState.exists && !targetState.managed)) {
        const error = new Error('Autostart ownership could not be verified; refusing to remove the OS registration.');
        error.code = 'autostart_target_not_managed';
        throw error;
      }

      if (plan.method === 'windows_task') {
        const query = await this.runCommand({
          command: 'schtasks.exe',
          args: ['/Query', '/TN', plan.registrationId, '/XML'],
          allowFailure: true
        });
        commandResults.push(summarizedCommandResult(query, 'Managed task definition verified before removal.'));
        registrationPresent = query.exitCode === 0;
        if (registrationPresent) {
          if (!runnerState.managed || !windowsTaskReferencesRunner(query.stdout, plan.runnerPath)) {
            const error = new Error('Task Scheduler entry does not reference the managed Bridge runner.');
            error.code = 'autostart_target_not_managed';
            throw error;
          }
          windowsTaskXml = query.stdout;
        } else if (readBoolean(stored, 'configured', false)) {
          const error = new Error(query.stderr.length > 0 ? query.stderr : 'Task Scheduler entry could not be verified before removal.');
          error.code = 'autostart_registration_unverified';
          throw error;
        }
      } else if (plan.method === 'systemd_user') {
        const query = await this.runCommand({
          command: 'systemctl',
          args: ['--user', 'is-enabled', plan.registrationId],
          allowFailure: true
        });
        commandResults.push(query);
        registrationPresent = query.exitCode === 0 && query.stdout.trim() === 'enabled';
        if (registrationPresent && !targetState.managed) {
          const error = new Error('Enabled systemd user service is not backed by a managed Bridge unit.');
          error.code = 'autostart_target_not_managed';
          throw error;
        }
      } else {
        const query = await this.runCommand({
          command: 'launchctl',
          args: ['print', 'gui/' + String(this.uid) + '/' + plan.registrationId],
          allowFailure: true
        });
        commandResults.push(summarizedCommandResult(query, 'Managed LaunchAgent verified before removal.'));
        registrationPresent = query.exitCode === 0;
        if (registrationPresent && !targetState.managed) {
          const error = new Error('Loaded LaunchAgent is not backed by a managed Bridge plist.');
          error.code = 'autostart_target_not_managed';
          throw error;
        }
      }

      if (registrationPresent) {
        const unregisterCommand = plan.uninstallCommands[0];
        const unregisterResult = await this.runCommand(unregisterCommand);
        commandResults.push(unregisterResult);
        if (unregisterResult.exitCode !== 0) {
          const error = new Error(unregisterResult.stderr.length > 0
            ? unregisterResult.stderr
            : 'Autostart removal command failed: ' + commandDisplay(unregisterCommand));
          error.code = 'autostart_command_failed';
          throw error;
        }
        registrationRemoved = true;
      }

      const backupPaths = [];
      if (plan.method !== 'windows_task') {
        const targetResult = removeManagedFile(plan.targetPath);
        if (targetResult.backupPath.length > 0) {
          backupPaths.push(targetResult.backupPath);
          removedFiles.push({ filePath: plan.targetPath, backupPath: targetResult.backupPath });
        }
        if (plan.method === 'systemd_user') {
          const reloadResult = await this.runCommand({ command: 'systemctl', args: ['--user', 'daemon-reload'], allowFailure: true });
          commandResults.push(reloadResult);
        }
      }
      const runnerResult = removeManagedFile(plan.runnerPath);
      if (runnerResult.backupPath.length > 0) {
        backupPaths.push(runnerResult.backupPath);
        removedFiles.push({ filePath: plan.runnerPath, backupPath: runnerResult.backupPath });
      }
      const uninstalledAt = nowIso();
      const autostart = this.writeAutostart({
        enabled: false,
        configured: false,
        supported: true,
        platform: plan.platform,
        method: plan.method,
        registrationId: plan.registrationId,
        targetPath: plan.targetPath,
        runnerPath: plan.runnerPath,
        plannedCommand: plan.plannedCommand,
        note: plan.note,
        uninstalledAt,
        updatedAt: uninstalledAt,
        lastError: ''
      });
      return {
        ok: true,
        action: 'daemon.autostart.uninstall',
        autostart,
        configPath: this.store.paths.config,
        preview: this.publicPlan(plan),
        commandResults,
        backupPaths,
        message: 'Daemon autostart removed.',
        failureCategory: '',
        remediation: ''
      };
    } catch (error) {
      for (let index = removedFiles.length - 1; index >= 0; index--) {
        restoreManagedFile(removedFiles[index].filePath, removedFiles[index].backupPath);
      }
      if (registrationRemoved) {
        if (plan.method === 'windows_task' && windowsTaskXml.length > 0) {
          const restorePath = plan.runnerPath + '.restore-task-' + process.pid + '-' + Date.now() + '.xml';
          try {
            fs.mkdirSync(path.dirname(restorePath), { recursive: true });
            fs.writeFileSync(restorePath, windowsTaskXml, 'utf8');
            const restoreResult = await this.runCommand({
              command: 'schtasks.exe',
              args: ['/Create', '/TN', plan.registrationId, '/XML', restorePath, '/F']
            });
            commandResults.push(summarizedCommandResult(restoreResult, 'Previous managed task definition restored after uninstall failure.'));
          } finally {
            if (fs.existsSync(restorePath)) {
              fs.unlinkSync(restorePath);
            }
          }
        } else if (plan.method === 'systemd_user') {
          const reloadResult = await this.runCommand({ command: 'systemctl', args: ['--user', 'daemon-reload'] });
          const enableResult = await this.runCommand({ command: 'systemctl', args: ['--user', 'enable', plan.registrationId] });
          commandResults.push(reloadResult, enableResult);
        } else if (plan.method === 'launchd') {
          const restoreResult = await this.runCommand({
            command: 'launchctl',
            args: ['bootstrap', 'gui/' + String(this.uid), plan.targetPath]
          });
          commandResults.push(restoreResult);
        }
      }
      return this.failureResult(
        'daemon.autostart.uninstall',
        plan,
        error && typeof error.code === 'string' ? error.code : 'autostart_uninstall_failed',
        error instanceof Error ? error.message : String(error),
        'Only managed autostart files can be removed; inspect status and permissions before retrying.'
      , commandResults);
    }
  }

  publicPlan(plan) {
    return {
      enabled: plan.enabled,
      configured: plan.configured,
      supported: plan.supported,
      platform: plan.platform,
      method: plan.method,
      registrationId: plan.registrationId,
      targetPath: plan.targetPath,
      runnerPath: plan.runnerPath,
      plannedCommand: plan.plannedCommand,
      installCommands: plan.installCommands.map(commandDisplay),
      uninstallCommands: plan.uninstallCommands.map(commandDisplay),
      confirmRequired: true,
      note: plan.note,
      failureCategory: plan.failureCategory,
      remediation: plan.remediation,
      updatedAt: plan.updatedAt
    };
  }

  failureResult(action, plan, category, message, remediation, commandResults) {
    return {
      ok: false,
      action,
      autostart: this.storedAutostart(),
      configPath: this.store.paths.config,
      preview: this.publicPlan(plan),
      commandResults: Array.isArray(commandResults) ? commandResults : [],
      backupPaths: [],
      code: category,
      failureCategory: category,
      message,
      remediation
    };
  }

  writeAutostart(autostart) {
    const nextConfig = Object.assign({}, this.store.config, {
      daemon: Object.assign({}, this.store.config.daemon, { autostart })
    });
    return this.store.writeConfig(nextConfig).daemon.autostart;
  }

  async runCommand(command) {
    const result = await this.commandRunner(command.command, command.args, {
      cwd: this.store.baseDirectory,
      env: process.env
    });
    return {
      command: commandDisplay(command),
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : -1,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : ''
    };
  }
}

module.exports = {
  AutostartManager,
  MANAGED_MARKER,
  defaultCommandRunner,
  launchdPlistSource,
  normalizeMethod,
  runnerSource,
  systemdUnitSource
};
