'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AutostartManager, MANAGED_MARKER } = require('../src/autostart-manager');
const { createDaemonStore } = require('../src/daemon-store');

function mockRunner(commands, state) {
  return async (command, args) => {
    commands.push({ command, args: args.slice() });
    if (command === 'schtasks.exe' && args[0] === '/Create') {
      if (args.includes('/XML')) {
        state.windowsTaskXml = fs.readFileSync(args[args.indexOf('/XML') + 1], 'utf8');
        state.windowsTask = true;
        return { exitCode: 0, stdout: 'RESTORED', stderr: '' };
      }
      if (state.failWindowsCreateOnce === true) {
        state.failWindowsCreateOnce = false;
        state.windowsTask = false;
        return { exitCode: 1, stdout: '', stderr: 'Create failed after replacement started' };
      }
      state.windowsTask = true;
      const taskCommand = args[args.indexOf('/TR') + 1];
      state.windowsTaskXml = '<Task><Actions><Exec><Command>' + taskCommand + '</Command></Exec></Actions></Task>';
      return { exitCode: 0, stdout: 'SUCCESS', stderr: '' };
    }
    if (command === 'schtasks.exe' && args[0] === '/Query') {
      return state.windowsTask
        ? { exitCode: 0, stdout: args.includes('/XML') ? state.windowsTaskXml : 'Ready', stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'Task not found' };
    }
    if (command === 'schtasks.exe' && args[0] === '/Delete') {
      if (state.failWindowsDeleteOnce === true) {
        state.failWindowsDeleteOnce = false;
        return { exitCode: 1, stdout: '', stderr: 'Delete denied' };
      }
      state.windowsTask = false;
      return { exitCode: 0, stdout: 'SUCCESS', stderr: '' };
    }
    if (command === 'systemctl' && args.includes('is-enabled')) {
      return state.systemdEnabled
        ? { exitCode: 0, stdout: 'enabled\n', stderr: '' }
        : { exitCode: 1, stdout: 'disabled\n', stderr: '' };
    }
    if (command === 'systemctl' && args.includes('enable')) {
      state.systemdEnabled = true;
    }
    if (command === 'systemctl' && args.includes('disable')) {
      if (state.failSystemdDisableOnce === true) {
        state.failSystemdDisableOnce = false;
        return { exitCode: 1, stdout: '', stderr: 'Disable failed' };
      }
      state.systemdEnabled = false;
    }
    if (command === 'launchctl' && args[0] === 'print') {
      return state.launchdLoaded
        ? { exitCode: 0, stdout: 'service loaded', stderr: '' }
        : { exitCode: 3, stdout: '', stderr: 'service not found' };
    }
    if (command === 'launchctl' && args[0] === 'bootout') {
      if (state.failLaunchdBootoutOnce === true) {
        state.failLaunchdBootoutOnce = false;
        return { exitCode: 5, stdout: '', stderr: 'bootout failed' };
      }
      const wasLoaded = state.launchdLoaded;
      state.launchdLoaded = false;
      return wasLoaded
        ? { exitCode: 0, stdout: '', stderr: '' }
        : { exitCode: 3, stdout: '', stderr: 'service not found' };
    }
    if (command === 'launchctl' && args[0] === 'bootstrap') {
      if (state.failLaunchdBootstrapOnce === true) {
        state.failLaunchdBootstrapOnce = false;
        return { exitCode: 5, stdout: '', stderr: 'bootstrap failed' };
      }
      state.launchdLoaded = true;
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
}

function createState() {
  return {
    windowsTask: false,
    windowsTaskXml: '',
    systemdEnabled: false,
    launchdLoaded: false,
    failWindowsCreateOnce: false,
    failWindowsDeleteOnce: false,
    failSystemdDisableOnce: false,
    failLaunchdBootstrapOnce: false,
    failLaunchdBootoutOnce: false
  };
}

async function verifyWindows(root, runtimePath, serverPath) {
  const home = path.join(root, 'windows-home');
  const store = createDaemonStore(home);
  const commands = [];
  const state = createState();
  const manager = new AutostartManager(store, {
    platform: 'win32',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    commandRunner: mockRunner(commands, state)
  });
  const preview = manager.preview({ method: 'auto' });
  assert.strictEqual(preview.preview.method, 'windows_task');
  assert.strictEqual(preview.preview.supported, true);
  assert.strictEqual(preview.preview.confirmRequired, true);
  assert.strictEqual(fs.existsSync(preview.preview.runnerPath), false);
  assert.strictEqual(commands.length, 0);

  const blocked = await manager.install({ method: 'auto', confirm: false });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.failureCategory, 'confirmation_required');
  assert.strictEqual(fs.existsSync(preview.preview.runnerPath), false);

  const installed = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(installed.ok, true);
  assert.strictEqual(installed.autostart.configured, true);
  assert.strictEqual(state.windowsTask, true);
  assert.strictEqual(fs.readFileSync(installed.autostart.runnerPath, 'utf8').includes(MANAGED_MARKER), true);
  assert.strictEqual(commands.some((item) => item.command === 'schtasks.exe' && item.args[0] === '/Create'), true);

  const status = await manager.status({ method: 'auto' });
  assert.strictEqual(status.autostart.configured, true);
  assert.strictEqual(status.autostart.registrationId.startsWith('NGF-Agent-Bridge-'), true);

  const previousTaskXml = state.windowsTaskXml;
  const previousRunner = fs.readFileSync(installed.autostart.runnerPath, 'utf8');
  state.failWindowsCreateOnce = true;
  const failedReplacement = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(failedReplacement.ok, false);
  assert.strictEqual(failedReplacement.failureCategory, 'autostart_command_failed');
  assert.strictEqual(state.windowsTask, true);
  assert.strictEqual(state.windowsTaskXml, previousTaskXml);
  assert.strictEqual(fs.readFileSync(installed.autostart.runnerPath, 'utf8'), previousRunner);
  assert.strictEqual(commands.some((item) => item.command === 'schtasks.exe' && item.args.includes('/XML') && item.args[0] === '/Create'), true);

  const blockedRemoval = await manager.uninstall({ method: 'auto', confirm: false });
  assert.strictEqual(blockedRemoval.failureCategory, 'confirmation_required');
  assert.strictEqual(state.windowsTask, true);

  state.failWindowsDeleteOnce = true;
  const failedRemoval = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(failedRemoval.ok, false);
  assert.strictEqual(failedRemoval.failureCategory, 'autostart_command_failed');
  assert.strictEqual(state.windowsTask, true);
  assert.strictEqual(fs.existsSync(preview.preview.runnerPath), true);

  const removed = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(removed.autostart.configured, false);
  assert.strictEqual(state.windowsTask, false);
  assert.strictEqual(fs.existsSync(preview.preview.runnerPath), false);
}

async function verifySystemd(root, runtimePath, serverPath) {
  const home = path.join(root, 'linux-user');
  const store = createDaemonStore(path.join(root, 'linux-store'));
  const commands = [];
  const state = createState();
  const manager = new AutostartManager(store, {
    platform: 'linux',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    commandRunner: mockRunner(commands, state)
  });
  const installed = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(installed.ok, true);
  assert.strictEqual(installed.autostart.method, 'systemd_user');
  const unit = fs.readFileSync(installed.autostart.targetPath, 'utf8');
  assert.strictEqual(unit.includes(MANAGED_MARKER), true);
  assert.strictEqual(unit.includes('Restart=on-failure'), true);
  assert.strictEqual(state.systemdEnabled, true);
  const status = await manager.status({ method: 'auto' });
  assert.strictEqual(status.autostart.configured, true);
  state.failSystemdDisableOnce = true;
  const failedRemoval = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(failedRemoval.ok, false);
  assert.strictEqual(state.systemdEnabled, true);
  assert.strictEqual(fs.existsSync(installed.autostart.targetPath), true);
  const removed = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(fs.existsSync(installed.autostart.targetPath), false);
}

async function verifyLaunchd(root, runtimePath, serverPath) {
  const home = path.join(root, 'mac-user');
  const store = createDaemonStore(path.join(root, 'mac-store'));
  const commands = [];
  const state = createState();
  const manager = new AutostartManager(store, {
    platform: 'darwin',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    uid: 501,
    commandRunner: mockRunner(commands, state)
  });
  const installed = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(installed.ok, true);
  assert.strictEqual(installed.autostart.method, 'launchd');
  const plist = fs.readFileSync(installed.autostart.targetPath, 'utf8');
  assert.strictEqual(plist.includes(MANAGED_MARKER), true);
  assert.strictEqual(plist.includes('<key>RunAtLoad</key>'), true);
  assert.strictEqual(plist.includes('<key>KeepAlive</key>'), true);
  assert.strictEqual(state.launchdLoaded, true);
  assert.strictEqual(commands.some((item) => item.command === 'launchctl' && item.args[0] === 'bootstrap'), true);
  const status = await manager.status({ method: 'auto' });
  assert.strictEqual(status.autostart.configured, true);

  const replacementServerPath = path.join(root, 'replacement-server.js');
  fs.writeFileSync(replacementServerPath, "'use strict';\n", 'utf8');
  const previousRunner = fs.readFileSync(installed.autostart.runnerPath, 'utf8');
  const previousPlist = fs.readFileSync(installed.autostart.targetPath, 'utf8');
  const replacementManager = new AutostartManager(store, {
    platform: 'darwin',
    execPath: runtimePath,
    serverPath: replacementServerPath,
    userHome: home,
    uid: 501,
    commandRunner: mockRunner(commands, state)
  });
  state.failLaunchdBootstrapOnce = true;
  const failedReplacement = await replacementManager.install({ method: 'auto', confirm: true });
  assert.strictEqual(failedReplacement.ok, false);
  assert.strictEqual(failedReplacement.failureCategory, 'autostart_command_failed');
  assert.strictEqual(state.launchdLoaded, true);
  assert.strictEqual(fs.readFileSync(installed.autostart.runnerPath, 'utf8'), previousRunner);
  assert.strictEqual(fs.readFileSync(installed.autostart.targetPath, 'utf8'), previousPlist);

  state.failLaunchdBootoutOnce = true;
  const failedRemoval = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(failedRemoval.ok, false);
  assert.strictEqual(failedRemoval.failureCategory, 'autostart_command_failed');
  assert.strictEqual(state.launchdLoaded, true);
  assert.strictEqual(fs.existsSync(installed.autostart.targetPath), true);

  const removed = await manager.uninstall({ method: 'auto', confirm: true });
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(state.launchdLoaded, false);
}

async function verifyOwnershipGuard(root, runtimePath, serverPath) {
  const home = path.join(root, 'ownership-user');
  const store = createDaemonStore(path.join(root, 'ownership-store'));
  const manager = new AutostartManager(store, {
    platform: 'linux',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    commandRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' })
  });
  const preview = manager.preview({ method: 'auto' });
  fs.mkdirSync(path.dirname(preview.preview.targetPath), { recursive: true });
  fs.writeFileSync(preview.preview.targetPath, 'user-owned service\n', 'utf8');
  const result = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failureCategory, 'autostart_target_not_managed');
  assert.strictEqual(fs.readFileSync(preview.preview.targetPath, 'utf8'), 'user-owned service\n');
}

async function verifyLoadedLaunchdOwnershipGuard(root, runtimePath, serverPath) {
  const home = path.join(root, 'loaded-launchd-user');
  const store = createDaemonStore(path.join(root, 'loaded-launchd-store'));
  const commands = [];
  const state = createState();
  state.launchdLoaded = true;
  const manager = new AutostartManager(store, {
    platform: 'darwin',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    uid: 501,
    commandRunner: mockRunner(commands, state)
  });
  const preview = manager.preview({ method: 'auto' });
  const result = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failureCategory, 'autostart_target_not_managed');
  assert.strictEqual(state.launchdLoaded, true);
  assert.strictEqual(fs.existsSync(preview.preview.targetPath), false);
}

async function verifyPreWriteOwnershipFailurePreservesManagedTarget(root, runtimePath, serverPath) {
  const home = path.join(root, 'prewrite-ownership-user');
  const store = createDaemonStore(path.join(root, 'prewrite-ownership-store'));
  const commands = [];
  const state = createState();
  state.launchdLoaded = true;
  const manager = new AutostartManager(store, {
    platform: 'darwin',
    execPath: runtimePath,
    serverPath,
    userHome: home,
    uid: 501,
    commandRunner: mockRunner(commands, state)
  });
  const preview = manager.preview({ method: 'auto' });
  fs.mkdirSync(path.dirname(preview.preview.targetPath), { recursive: true });
  const managedPlist = '<!-- ' + MANAGED_MARKER + ' -->\n<plist></plist>\n';
  fs.writeFileSync(preview.preview.targetPath, managedPlist, 'utf8');
  fs.mkdirSync(path.dirname(preview.preview.runnerPath), { recursive: true });
  fs.writeFileSync(preview.preview.runnerPath, 'user-owned runner\n', 'utf8');

  const result = await manager.install({ method: 'auto', confirm: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failureCategory, 'autostart_target_not_managed');
  assert.strictEqual(fs.readFileSync(preview.preview.targetPath, 'utf8'), managedPlist);
  assert.strictEqual(fs.readFileSync(preview.preview.runnerPath, 'utf8'), 'user-owned runner\n');
  assert.strictEqual(state.launchdLoaded, true);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-autostart-smoke-'));
  const runtimePath = path.join(root, 'node-runtime');
  const serverPath = path.join(root, 'server.js');
  fs.writeFileSync(runtimePath, 'runtime', 'utf8');
  fs.writeFileSync(serverPath, "'use strict';\n", 'utf8');
  try {
    await verifyWindows(root, runtimePath, serverPath);
    await verifySystemd(root, runtimePath, serverPath);
    await verifyLaunchd(root, runtimePath, serverPath);
    await verifyOwnershipGuard(root, runtimePath, serverPath);
    await verifyLoadedLaunchdOwnershipGuard(root, runtimePath, serverPath);
    await verifyPreWriteOwnershipFailurePreservesManagedTarget(root, runtimePath, serverPath);
    console.log('autostart manager smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
