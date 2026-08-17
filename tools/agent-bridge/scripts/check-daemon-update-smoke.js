'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { createDaemonStore } = require('../src/daemon-store');
const {
  DaemonUpdateManager,
  compareVersions,
  inspectNpmTarball,
  validateUpdateUrl,
  verifyIntegrity
} = require('../src/daemon-update-manager');

function tarOctal(value, length) {
  const text = value.toString(8).padStart(length - 1, '0') + '\0';
  return Buffer.from(text, 'ascii');
}

function createTarEntry(name, content, typeFlag) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const header = Buffer.alloc(512, 0);
  Buffer.from(name, 'utf8').copy(header, 0, 0, 100);
  tarOctal(0o644, 8).copy(header, 100);
  tarOctal(0, 8).copy(header, 108);
  tarOctal(0, 8).copy(header, 116);
  tarOctal(body.length, 12).copy(header, 124);
  tarOctal(Math.floor(Date.now() / 1000), 12).copy(header, 136);
  Buffer.from('        ', 'ascii').copy(header, 148);
  Buffer.from(typeFlag || '0', 'ascii').copy(header, 156);
  Buffer.from('ustar\0', 'ascii').copy(header, 257);
  Buffer.from('00', 'ascii').copy(header, 263);
  let checksum = 0;
  for (let index = 0; index < header.length; index++) {
    checksum += header[index];
  }
  const checksumText = checksum.toString(8).padStart(6, '0') + '\0 ';
  Buffer.from(checksumText, 'ascii').copy(header, 148);
  const padding = Buffer.alloc((512 - body.length % 512) % 512, 0);
  return Buffer.concat([header, body, padding]);
}

function createPackageTarball(name, version, extraEntries) {
  const entries = [createTarEntry('package/package.json', JSON.stringify({ name, version }, null, 2), '0')];
  const extras = Array.isArray(extraEntries) ? extraEntries : [];
  for (const extra of extras) {
    entries.push(createTarEntry(extra.name, extra.content || '', extra.typeFlag || '0'));
  }
  entries.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(entries));
}

function integrityFor(buffer) {
  return 'sha512-' + crypto.createHash('sha512').update(buffer).digest('base64');
}

function startRegistry(targetTarball, metadataFactory) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/tarballs/agent-bridge.tgz') {
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': targetTarball.length
        });
        response.end(targetTarball);
        return;
      }
      if (request.url === '/%40dlzz%2Fagent-bridge' || request.url === '/@dlzz%2Fagent-bridge') {
        const metadata = metadataFactory(server.address().port);
        const text = JSON.stringify(metadata);
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(text)
        });
        response.end(text);
        return;
      }
      response.writeHead(404);
      response.end('{}');
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function ensurePackageRoot(root, version, withGit) {
  const packageRoot = path.join(root, 'package-root');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@dlzz/agent-bridge',
    version
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(packageRoot, 'README.md'), 'smoke package\n', 'utf8');
  if (withGit) {
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  }
  return packageRoot;
}

function writeInstalledPackage(globalRoot, version) {
  const packagePath = path.join(globalRoot, '@dlzz', 'agent-bridge');
  fs.mkdirSync(packagePath, { recursive: true });
  fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify({
    name: '@dlzz/agent-bridge',
    version
  }, null, 2), 'utf8');
}

function createMockCommandRunner(options) {
  const config = options || {};
  const calls = [];
  let targetInstallAttempts = 0;
  const runner = async (_command, args) => {
    calls.push(args.slice());
    if (args[0] === 'pack') {
      const destination = args[args.indexOf('--pack-destination') + 1];
      fs.mkdirSync(destination, { recursive: true });
      const filename = 'dlzz-agent-bridge-' + config.currentVersion + '.tgz';
      fs.writeFileSync(path.join(destination, filename), createPackageTarball('@dlzz/agent-bridge', config.currentVersion));
      return {
        exitCode: 0,
        stdout: JSON.stringify([{ filename }]),
        stderr: '',
        durationMs: 5
      };
    }
    if (args[0] === 'install') {
      const packagePath = args[2];
      const manifest = inspectNpmTarball(fs.readFileSync(packagePath));
      if (manifest.version === config.targetVersion) {
        targetInstallAttempts += 1;
        if (config.failTargetInstall === true) {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'mock target install failed',
            durationMs: 7
          };
        }
      }
      writeInstalledPackage(config.globalRoot, manifest.version);
      return {
        exitCode: 0,
        stdout: 'installed ' + manifest.version,
        stderr: '',
        durationMs: 8
      };
    }
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'unexpected npm command: ' + args.join(' '),
      durationMs: 1
    };
  };
  runner.calls = calls;
  runner.targetInstallAttempts = () => targetInstallAttempts;
  return runner;
}

function metadataFor(port, tarball, targetVersion, integrityOverride, nameOverride) {
  const packageName = nameOverride || '@dlzz/agent-bridge';
  const integrity = typeof integrityOverride === 'string' ? integrityOverride : integrityFor(tarball);
  return {
    name: packageName,
    'dist-tags': {
      latest: targetVersion
    },
    versions: {
      [targetVersion]: {
        name: packageName,
        version: targetVersion,
        dist: {
          tarball: 'http://127.0.0.1:' + String(port) + '/tarballs/agent-bridge.tgz',
          integrity
        }
      }
    },
    time: {
      [targetVersion]: '2026-07-10T00:00:00.000Z'
    }
  };
}

function verifyHelpers() {
  assert.strictEqual(compareVersions('1.2.0', '1.1.9'), 1);
  assert.strictEqual(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
  assert.strictEqual(compareVersions('invalid', '1.0.0'), null);
  assert.strictEqual(validateUpdateUrl('https://registry.npmjs.org', 'registry').ok, true);
  assert.strictEqual(validateUpdateUrl('http://127.0.0.1:8787', 'registry').ok, true);
  assert.strictEqual(validateUpdateUrl('http://example.com', 'registry').code, 'update_url_insecure');
  assert.strictEqual(validateUpdateUrl('https://user:pass@example.com', 'registry').code, 'update_url_credentials_rejected');
  const tarball = createPackageTarball('@dlzz/agent-bridge', '1.2.3');
  assert.strictEqual(verifyIntegrity(tarball, integrityFor(tarball)).ok, true);
  assert.strictEqual(verifyIntegrity(Buffer.from('changed'), integrityFor(tarball)).ok, false);
  assert.strictEqual(inspectNpmTarball(tarball).version, '1.2.3');
  assert.throws(
    () => inspectNpmTarball(createPackageTarball('@dlzz/agent-bridge', '1.2.3', [{ name: '../escape.txt', content: 'bad' }])),
    (error) => error && error.code === 'update_tarball_unsafe_path'
  );
  assert.throws(
    () => inspectNpmTarball(createPackageTarball('@dlzz/agent-bridge', '1.2.3', [{ name: 'package/link', typeFlag: '2' }])),
    (error) => error && error.code === 'update_tarball_link_rejected'
  );
}

async function verifyCheckPreviewAndDevelopmentGuard(root) {
  const targetVersion = '0.1.5';
  const tarball = createPackageTarball('@dlzz/agent-bridge', targetVersion);
  const server = await startRegistry(tarball, (port) => metadataFor(port, tarball, targetVersion));
  try {
    const store = createDaemonStore(path.join(root, 'preview-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'preview-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'preview-global');
    const runner = createMockCommandRunner({
      currentVersion: '0.1.4',
      targetVersion,
      globalRoot
    });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(server.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const initialStatus = manager.status();
    assert.strictEqual(initialStatus.updaterAvailable, true);
    assert.strictEqual(initialStatus.available, false);
    const checked = await manager.check({ channel: 'latest' });
    assert.strictEqual(checked.ok, true);
    assert.strictEqual(checked.available, true);
    assert.strictEqual(checked.targetVersion, targetVersion);
    assert.strictEqual(manager.status().available, true);
    const preview = await manager.preview({ channel: 'latest' });
    assert.strictEqual(preview.writesPerformed, false);
    assert.strictEqual(fs.readdirSync(store.paths.daemonUpdateStaged).length, 0);
    assert.strictEqual(fs.readdirSync(store.paths.daemonUpdateBackups).length, 0);
    assert.strictEqual(runner.calls.length, 0);
    const blocked = await manager.install({ channel: 'latest' });
    assert.strictEqual(blocked.failureCategory, 'confirmation_required');

    const devStore = createDaemonStore(path.join(root, 'dev-store'));
    const devRoot = path.join(root, 'dev-source');
    const devPackageRoot = ensurePackageRoot(devRoot, '0.1.4', true);
    const devManager = new DaemonUpdateManager(devStore, {
      currentVersion: '0.1.4',
      packageRoot: devPackageRoot,
      registryUrl: 'http://127.0.0.1:' + String(server.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const developmentBlocked = await devManager.install({ channel: 'latest', confirm: true });
    assert.strictEqual(developmentBlocked.failureCategory, 'development_checkout');
    const developmentRollbackBlocked = await devManager.rollback({ confirm: true });
    assert.strictEqual(developmentRollbackBlocked.failureCategory, 'development_checkout');
  } finally {
    await closeServer(server);
  }
}

async function verifyIntegrityAndManifestRejection(root) {
  const targetVersion = '0.1.5';
  const tarball = createPackageTarball('@dlzz/agent-bridge', targetVersion);
  const badIntegrityServer = await startRegistry(tarball, (port) => metadataFor(port, tarball, targetVersion, integrityFor(Buffer.from('wrong'))));
  try {
    const store = createDaemonStore(path.join(root, 'integrity-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'integrity-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'integrity-global');
    const runner = createMockCommandRunner({ currentVersion: '0.1.4', targetVersion, globalRoot });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(badIntegrityServer.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const result = await manager.install({ confirm: true });
    assert.strictEqual(result.failureCategory, 'update_integrity_mismatch');
    assert.strictEqual(runner.calls.length, 0);
  } finally {
    await closeServer(badIntegrityServer);
  }

  const wrongPackageTarball = createPackageTarball('@example/not-bridge', targetVersion);
  const wrongPackageServer = await startRegistry(wrongPackageTarball, (port) => metadataFor(port, wrongPackageTarball, targetVersion));
  try {
    const store = createDaemonStore(path.join(root, 'manifest-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'manifest-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'manifest-global');
    const runner = createMockCommandRunner({ currentVersion: '0.1.4', targetVersion, globalRoot });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(wrongPackageServer.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const result = await manager.install({ confirm: true });
    assert.strictEqual(result.failureCategory, 'update_tarball_package_mismatch');
    assert.strictEqual(runner.calls.length, 0);
  } finally {
    await closeServer(wrongPackageServer);
  }
}

async function verifySuccessfulInstallAndRollback(root) {
  const targetVersion = '0.1.5';
  const tarball = createPackageTarball('@dlzz/agent-bridge', targetVersion);
  const server = await startRegistry(tarball, (port) => metadataFor(port, tarball, targetVersion));
  try {
    const store = createDaemonStore(path.join(root, 'success-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'success-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'success-global');
    writeInstalledPackage(globalRoot, '0.1.4');
    const runner = createMockCommandRunner({ currentVersion: '0.1.4', targetVersion, globalRoot });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(server.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const installed = await manager.install({ confirm: true });
    assert.strictEqual(installed.ok, true);
    assert.strictEqual(installed.installedVersion, targetVersion);
    assert.strictEqual(installed.integrityVerified, true);
    assert.strictEqual(installed.pendingRestart, true);
    assert.strictEqual(fs.existsSync(installed.stagedPath), true);
    assert.strictEqual(fs.existsSync(installed.backupPath), true);
    assert.strictEqual(store.readDaemonUpdateState().status, 'installed');
    assert.strictEqual(typeof store.readDaemonUpdateState().backupIntegrity, 'string');
    assert.strictEqual(store.readDaemonUpdateState().backupIntegrity.startsWith('sha512-'), true);
    assert.strictEqual(runner.calls.some((args) => args.includes('--ignore-scripts')), true);

    const rolledBack = await manager.rollback({ confirm: true });
    assert.strictEqual(rolledBack.ok, true);
    assert.strictEqual(rolledBack.installedVersion, '0.1.4');
    assert.strictEqual(rolledBack.pendingRestart, true);
    assert.strictEqual(store.readDaemonUpdateState().status, 'rolled_back');
  } finally {
    await closeServer(server);
  }
}

async function verifyTamperedBackupRejected(root) {
  const targetVersion = '0.1.5';
  const tarball = createPackageTarball('@dlzz/agent-bridge', targetVersion);
  const server = await startRegistry(tarball, (port) => metadataFor(port, tarball, targetVersion));
  try {
    const store = createDaemonStore(path.join(root, 'tamper-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'tamper-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'tamper-global');
    writeInstalledPackage(globalRoot, '0.1.4');
    const runner = createMockCommandRunner({ currentVersion: '0.1.4', targetVersion, globalRoot });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(server.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const installed = await manager.install({ confirm: true });
    assert.strictEqual(installed.ok, true);
    const callsBeforeRollback = runner.calls.length;
    fs.appendFileSync(installed.backupPath, Buffer.from('tampered'));
    const rollback = await manager.rollback({ confirm: true });
    assert.strictEqual(rollback.ok, false);
    assert.strictEqual(rollback.failureCategory, 'update_backup_integrity_mismatch');
    assert.strictEqual(runner.calls.length, callsBeforeRollback);
    const installedPackage = JSON.parse(fs.readFileSync(path.join(globalRoot, '@dlzz', 'agent-bridge', 'package.json'), 'utf8'));
    assert.strictEqual(installedPackage.version, targetVersion);
  } finally {
    await closeServer(server);
  }
}

async function verifyAutomaticRollback(root) {
  const targetVersion = '0.1.5';
  const tarball = createPackageTarball('@dlzz/agent-bridge', targetVersion);
  const server = await startRegistry(tarball, (port) => metadataFor(port, tarball, targetVersion));
  try {
    const store = createDaemonStore(path.join(root, 'failure-store'));
    const packageRoot = ensurePackageRoot(path.join(root, 'failure-source'), '0.1.4', false);
    const globalRoot = path.join(root, 'failure-global');
    writeInstalledPackage(globalRoot, '0.1.4');
    const runner = createMockCommandRunner({
      currentVersion: '0.1.4',
      targetVersion,
      globalRoot,
      failTargetInstall: true
    });
    const manager = new DaemonUpdateManager(store, {
      currentVersion: '0.1.4',
      packageRoot,
      registryUrl: 'http://127.0.0.1:' + String(server.address().port),
      globalRoot,
      commandRunner: runner,
      npmCommand: 'npm-smoke'
    });
    const result = await manager.install({ confirm: true });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failureCategory, 'update_install_failed_rolled_back');
    assert.strictEqual(result.rollback.ok, true);
    assert.strictEqual(store.readDaemonUpdateState().status, 'rolled_back');
    const installedPackage = JSON.parse(fs.readFileSync(path.join(globalRoot, '@dlzz', 'agent-bridge', 'package.json'), 'utf8'));
    assert.strictEqual(installedPackage.version, '0.1.4');
  } finally {
    await closeServer(server);
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-daemon-update-smoke-'));
  try {
    verifyHelpers();
    await verifyCheckPreviewAndDevelopmentGuard(root);
    await verifyIntegrityAndManifestRejection(root);
    await verifySuccessfulInstallAndRollback(root);
    await verifyTamperedBackupRejected(root);
    await verifyAutomaticRollback(root);
    console.log('daemon update smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});

require('./check-daemon-remote-config-smoke');
require('./check-agent-experience-smoke');
