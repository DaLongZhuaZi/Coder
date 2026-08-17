#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ProviderDirectoryManager,
  PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
  canonicalJson,
  sha256Text
} = require('../src/provider-directory-manager');

function createPackage(root, version) {
  const packageRoot = path.join(root, 'package-' + version);
  const entryPath = process.platform === 'win32' ? 'bin/remote-smoke.cmd' : 'bin/remote-smoke';
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  const script = process.platform === 'win32'
    ? '@echo off\r\nexit /b 0\r\n'
    : '#!/bin/sh\nexit 0\n';
  fs.writeFileSync(path.join(packageRoot, entryPath), script, 'utf8');
  const packagePath = path.join(root, 'remote-smoke-' + version + '.tgz');
  const archive = childProcess.spawnSync('tar', ['-czf', packagePath, '-C', packageRoot, '.'], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.strictEqual(archive.status, 0, archive.stderr);
  const bytes = fs.readFileSync(packagePath);
  return {
    bytes,
    entryPath,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

function signedManifest(keys, version, packageInfo) {
  const profile = {
    profileId: 'remote-smoke',
    providerId: 'remote-smoke',
    displayName: 'Remote Smoke',
    kind: 'cli',
    binary: 'remote-smoke',
    runtimeMode: 'oneshot',
    enabled: true
  };
  const manifest = {
    version: 'catalog-' + version,
    generatedAt: new Date().toISOString(),
    providers: [{
      id: 'remote-smoke',
      version,
      displayName: 'Remote Smoke',
      description: 'Signed provider directory smoke entry.',
      platforms: [process.platform],
      minimumBridgeVersion: '0.1.4',
      profileSha256: sha256Text(canonicalJson(profile)),
      profile,
      managedBinary: {
        packageUrl: 'https://catalog.example.test/remote-smoke-' + version + '.tgz',
        packageFormat: 'tgz',
        packageSha256: packageInfo.sha256,
        entryPath: packageInfo.entryPath,
        architectures: [process.arch],
        sizeBytes: packageInfo.bytes.length
      }
    }]
  };
  manifest.signature = crypto.sign(
    'sha256',
    Buffer.from(canonicalJson(manifest), 'utf8'),
    keys.privateKey
  ).toString('base64');
  return manifest;
}

function createHarness(root, keys, manifests, packages, options) {
  const profiles = new Map();
  const writes = [];
  const deletes = [];
  const tests = [];
  const fetchCount = { manifest: 0, package: 0 };
  let activeManifest = manifests[0];
  let failVersion = '';
  const manager = new ProviderDirectoryManager({
    bridgeVersion: '0.1.4',
    platform: process.platform,
    architecture: process.arch,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    homeDirectory: root,
    planTtlMs: options && options.planTtlMs,
    fetcher: async () => {
      fetchCount.manifest += 1;
      return activeManifest;
    },
    packageFetcher: async (url) => {
      fetchCount.package += 1;
      for (const version of Object.keys(packages)) {
        if (url.includes(version)) {
          return packages[version].bytes;
        }
      }
      throw new Error('Unknown smoke package URL.');
    },
    getProfile: (profileId) => profiles.get(profileId) || null,
    upsertProfile: (payload) => {
      const stored = Object.assign({}, payload);
      profiles.set(stored.profileId, stored);
      writes.push(stored);
      return { profile: stored };
    },
    deleteProfile: (payload) => {
      const profileId = payload.profileId;
      if (!profiles.has(profileId)) {
        return { code: 'provider_profile_not_found', message: 'Provider profile was not found.' };
      }
      profiles.delete(profileId);
      deletes.push(profileId);
      return { deleted: true };
    },
    testProfile: async (payload) => {
      const profile = profiles.get(payload.profileId);
      tests.push({
        profileId: payload.profileId,
        version: profile ? profile.managedVersion : '',
        runCommand: payload.runCommand === true
      });
      if (!profile) {
        return { ok: false, message: 'Profile missing.' };
      }
      if (profile.managedVersion === failVersion) {
        return { ok: false, message: 'Injected activation failure.' };
      }
      if (profile.binary && (!fs.existsSync(profile.binary) || !fs.statSync(profile.binary).isFile())) {
        return { ok: false, message: 'Managed binary missing.' };
      }
      return { ok: true };
    }
  });
  return {
    manager,
    profiles,
    writes,
    deletes,
    tests,
    fetchCount,
    setManifest(manifest) {
      activeManifest = manifest;
    },
    setFailVersion(version) {
      failVersion = version;
    }
  };
}

async function verifyLifecycle(root, keys) {
  const packageV1 = createPackage(root, '1.0.0');
  const packageV2 = createPackage(root, '2.0.0');
  const packageV3 = createPackage(root, '3.0.0');
  const manifestV1 = signedManifest(keys, '1.0.0', packageV1);
  const manifestV2 = signedManifest(keys, '2.0.0', packageV2);
  const manifestV3 = signedManifest(keys, '3.0.0', packageV3);
  const harness = createHarness(
    path.join(root, 'lifecycle'),
    keys,
    [manifestV1, manifestV2, manifestV3],
    { '1.0.0': packageV1, '2.0.0': packageV2, '3.0.0': packageV3 }
  );
  const manager = harness.manager;

  const refreshedV1 = await manager.refresh({ url: 'https://catalog.example.test/providers.json' });
  assert.strictEqual(refreshedV1.ok, true);
  assert.strictEqual(refreshedV1.providers.length, 1);
  const previewV1 = await manager.install({ providerId: 'remote-smoke', confirm: false });
  assert.strictEqual(previewV1.preview, true);
  assert.strictEqual(previewV1.planId.length >= 20, true);
  assert.strictEqual(JSON.stringify(previewV1.profile).includes('env'), true);
  assert.deepStrictEqual(previewV1.profile.env, {});
  assert.strictEqual(harness.writes.length, 0);
  const mismatchV1 = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: 'wrong' });
  assert.strictEqual(mismatchV1.failureCategory, 'install_plan_mismatch');
  const installedV1 = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: previewV1.planId });
  assert.strictEqual(installedV1.confirmed, true);
  assert.strictEqual(harness.writes.length, 1);
  assert.strictEqual(harness.writes[0].source, 'remote_directory');
  assert.strictEqual(fs.existsSync(harness.writes[0].binary), true);
  assert.strictEqual(harness.tests[harness.tests.length - 1].runCommand, true);
  const publicStatusV1 = manager.status({ providerId: 'remote-smoke' });
  assert.strictEqual(publicStatusV1.activeVersion, '1.0.0');
  const publicStatusTextV1 = JSON.stringify(publicStatusV1);
  assert.strictEqual(publicStatusTextV1.includes('entryPath'), false);
  assert.strictEqual(publicStatusTextV1.includes('"binary"'), false);
  assert.strictEqual(publicStatusTextV1.includes('"env"'), false);
  const publicListTextV1 = JSON.stringify(manager.list({ providerId: 'remote-smoke' }));
  assert.strictEqual(publicListTextV1.includes('entryPath'), false);
  assert.strictEqual(publicListTextV1.includes('"profile"'), false);
  assert.strictEqual(publicListTextV1.includes('"env"'), false);
  const repeatedV1 = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: previewV1.planId });
  assert.strictEqual(repeatedV1.failureCategory, 'install_plan_mismatch');

  const expiringHarness = createHarness(
    path.join(root, 'expiring-plan'),
    keys,
    [manifestV1],
    { '1.0.0': packageV1 },
    { planTtlMs: 1000 }
  );
  await expiringHarness.manager.refresh({ url: 'https://catalog.example.test/providers.json' });
  const expiringPreview = await expiringHarness.manager.install({ providerId: 'remote-smoke', confirm: false });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const expired = await expiringHarness.manager.install({ providerId: 'remote-smoke', confirm: true, planId: expiringPreview.planId });
  assert.strictEqual(expired.failureCategory, 'install_plan_expired');

  const stateTextV1 = fs.readFileSync(manager.statePath, 'utf8');
  const stateV1 = JSON.parse(stateTextV1);
  assert.strictEqual(stateV1.schemaVersion, PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION);
  assert.strictEqual(stateV1.generation > 0, true);
  assert.strictEqual(stateTextV1.includes('"profile"'), false, 'managed directory state must not embed a full Provider profile');
  assert.strictEqual(typeof stateV1.providers['remote-smoke'].versions['1.0.0'].directoryDigest, 'string');
  assert.strictEqual(stateV1.providers['remote-smoke'].versions['1.0.0'].directoryDigest.length, 64);

  harness.setManifest(manifestV2);
  await manager.refresh({ url: 'https://catalog.example.test/providers.json' });
  const stalePreview = await manager.install({ providerId: 'remote-smoke', confirm: false });
  manager.state.generation += 1;
  manager.saveState(false);
  const staleResult = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: stalePreview.planId });
  assert.strictEqual(staleResult.failureCategory, 'install_plan_stale');

  harness.setFailVersion('2.0.0');
  const failedPreview = await manager.install({ providerId: 'remote-smoke', confirm: false });
  const activationFailed = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: failedPreview.planId });
  assert.strictEqual(activationFailed.failureCategory, 'activation_test_failed');
  assert.strictEqual(harness.profiles.get('remote-smoke').managedVersion, '1.0.0');
  assert.strictEqual(manager.status({ providerId: 'remote-smoke' }).activeVersion, '1.0.0');
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '2.0.0')), false);

  harness.setFailVersion('');
  const previewV2 = await manager.install({ providerId: 'remote-smoke', confirm: false });
  const installedV2 = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: previewV2.planId });
  assert.strictEqual(installedV2.confirmed, true);
  assert.strictEqual(installedV2.activeVersion, '2.0.0');
  assert.strictEqual(installedV2.previousVersion, '1.0.0');
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '1.0.0')), true);
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '2.0.0')), true);

  const rollbackPreview = await manager.rollback({ providerId: 'remote-smoke', confirm: false });
  assert.strictEqual(rollbackPreview.preview, true);
  assert.strictEqual(typeof rollbackPreview.planId, 'string');
  const rollbackTargetRecord = manager.state.providers['remote-smoke'].versions['1.0.0'];
  const rollbackTargetDigest = rollbackTargetRecord.directoryDigest;
  rollbackTargetRecord.directoryDigest = 'f'.repeat(64);
  const rollbackStateChanged = await manager.rollback({
    providerId: 'remote-smoke',
    confirm: true,
    planId: rollbackPreview.planId
  });
  assert.strictEqual(rollbackStateChanged.failureCategory, 'rollback_plan_stale');
  rollbackTargetRecord.directoryDigest = rollbackTargetDigest;
  const rollbackPreviewAfterStateChange = await manager.rollback({ providerId: 'remote-smoke', confirm: false });
  const rollbackMissingPlan = await manager.rollback({ providerId: 'remote-smoke', confirm: true });
  assert.strictEqual(rollbackMissingPlan.failureCategory, 'rollback_plan_mismatch');
  harness.setFailVersion('1.0.0');
  const rollbackFailed = await manager.rollback({
    providerId: 'remote-smoke',
    confirm: true,
    planId: rollbackPreviewAfterStateChange.planId
  });
  assert.strictEqual(rollbackFailed.failureCategory, 'activation_test_failed');
  assert.strictEqual(harness.profiles.get('remote-smoke').managedVersion, '2.0.0');
  assert.strictEqual(manager.status({ providerId: 'remote-smoke' }).activeVersion, '2.0.0');

  harness.setFailVersion('');
  const rollbackPreview2 = await manager.rollback({ providerId: 'remote-smoke', confirm: false });
  const rolledBack = await manager.rollback({ providerId: 'remote-smoke', confirm: true, planId: rollbackPreview2.planId });
  assert.strictEqual(rolledBack.confirmed, true);
  assert.strictEqual(rolledBack.activeVersion, '1.0.0');
  assert.strictEqual(rolledBack.previousVersion, '2.0.0');
  assert.strictEqual(harness.profiles.get('remote-smoke').binary, fs.realpathSync(path.join(manager.providersDirectory, 'remote-smoke', '1.0.0', packageV1.entryPath)));
  const repeatedRollback = await manager.rollback({ providerId: 'remote-smoke', confirm: true, planId: rollbackPreview2.planId });
  assert.strictEqual(repeatedRollback.failureCategory, 'rollback_plan_mismatch');

  harness.setManifest(manifestV3);
  await manager.refresh({ url: 'https://catalog.example.test/providers.json' });
  const cleanupVersions = manager.cleanupVersions.bind(manager);
  manager.cleanupVersions = (providerId, versions) => {
    return cleanupVersions(providerId, versions).concat(['managed_version_cleanup_failed:injected']);
  };
  const previewV3 = await manager.install({ providerId: 'remote-smoke', confirm: false });
  const installedV3 = await manager.install({ providerId: 'remote-smoke', confirm: true, planId: previewV3.planId });
  assert.strictEqual(installedV3.confirmed, true);
  assert.strictEqual(installedV3.activeVersion, '3.0.0');
  assert.strictEqual(installedV3.previousVersion, '1.0.0');
  assert.strictEqual(installedV3.warnings.includes('managed_version_cleanup_failed:injected'), true);
  assert.strictEqual(harness.profiles.get('remote-smoke').managedVersion, '3.0.0');
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '1.0.0')), true);
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '2.0.0')), false);
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke', '3.0.0')), true);

  harness.profiles.set('custom-profile', {
    profileId: 'custom-profile',
    providerId: 'custom-profile',
    binary: process.execPath,
    managedProvider: false
  });
  const customRemove = manager.remove({ profileId: 'custom-profile', confirm: false });
  assert.strictEqual(customRemove.failureCategory, 'managed_provider_required');
  assert.strictEqual(harness.profiles.has('custom-profile'), true);

  const managedProfile = harness.profiles.get('remote-smoke');
  harness.profiles.set('remote-smoke', Object.assign({}, managedProfile, { managedProvider: false }));
  const ownershipMismatch = manager.remove({ providerId: 'remote-smoke', confirm: false });
  assert.strictEqual(ownershipMismatch.failureCategory, 'managed_provider_required');
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke')), true);
  harness.profiles.set('remote-smoke', managedProfile);

  const staleRemovePreview = manager.remove({ providerId: 'remote-smoke', confirm: false });
  assert.strictEqual(staleRemovePreview.preview, true);
  const currentInstallStatus = manager.state.providers['remote-smoke'].installStatus;
  manager.state.providers['remote-smoke'].installStatus = 'degraded';
  const staleRemove = manager.remove({
    providerId: 'remote-smoke',
    confirm: true,
    planId: staleRemovePreview.planId
  });
  assert.strictEqual(staleRemove.failureCategory, 'remove_plan_stale');
  manager.state.providers['remote-smoke'].installStatus = currentInstallStatus;
  const removePreview = manager.remove({ providerId: 'remote-smoke', confirm: false });
  const removed = manager.remove({ providerId: 'remote-smoke', confirm: true, planId: removePreview.planId });
  assert.strictEqual(removed.confirmed, true);
  assert.strictEqual(harness.profiles.has('remote-smoke'), false);
  assert.strictEqual(fs.existsSync(path.join(manager.providersDirectory, 'remote-smoke')), false);
  const repeatedRemove = manager.remove({ providerId: 'remote-smoke', confirm: true, planId: removePreview.planId });
  assert.strictEqual(repeatedRemove.failureCategory, 'managed_provider_required');

  const tampered = JSON.parse(JSON.stringify(manifestV2));
  tampered.providers[0].profile.displayName = 'Tampered';
  assert.strictEqual(manager.verifyManifest(tampered).failureCategory, 'signature_invalid');
}

async function verifyReconcile(root, keys) {
  const packageInfo = createPackage(root, '3.0.0');
  const manifest = signedManifest(keys, '3.0.0', packageInfo);
  const harness = createHarness(
    path.join(root, 'reconcile'),
    keys,
    [manifest],
    { '3.0.0': packageInfo }
  );
  await harness.manager.refresh({ url: 'https://catalog.example.test/providers.json' });
  const preview = await harness.manager.install({ providerId: 'remote-smoke', confirm: false });
  const installed = await harness.manager.install({ providerId: 'remote-smoke', confirm: true, planId: preview.planId });
  assert.strictEqual(installed.ok, true);
  const planBeforeRestart = await harness.manager.rollback({ providerId: 'remote-smoke', confirm: false });
  assert.strictEqual(planBeforeRestart.failureCategory, 'rollback_unavailable');

  const binaryPath = harness.profiles.get('remote-smoke').binary;
  fs.appendFileSync(binaryPath, '\nmodified', 'utf8');
  const manifestFetchesBefore = harness.fetchCount.manifest;
  const restarted = new ProviderDirectoryManager({
    bridgeVersion: '0.1.4',
    platform: process.platform,
    architecture: process.arch,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    homeDirectory: harness.manager.homeDirectory,
    fetcher: async () => {
      throw new Error('reconcile must not fetch');
    },
    packageFetcher: async () => {
      throw new Error('reconcile must not download');
    },
    getProfile: (profileId) => harness.profiles.get(profileId) || null,
    upsertProfile: (payload) => {
      harness.profiles.set(payload.profileId, Object.assign({}, payload));
      return { profile: payload };
    },
    deleteProfile: (payload) => {
      harness.profiles.delete(payload.profileId);
      return { deleted: true };
    },
    testProfile: async () => ({ ok: true })
  });
  const reconciled = await restarted.reconcile();
  assert.strictEqual(reconciled.ok, true);
  assert.strictEqual(restarted.status({ providerId: 'remote-smoke' }).installStatus, 'degraded');
  assert.strictEqual(restarted.status({ providerId: 'remote-smoke' }).state.failureCategory, 'managed_digest_mismatch');
  assert.strictEqual(harness.fetchCount.manifest, manifestFetchesBefore);

  const oldPreview = await harness.manager.install({ providerId: 'remote-smoke', confirm: false });
  const restartedConfirm = await restarted.install({ providerId: 'remote-smoke', confirm: true, planId: oldPreview.planId });
  assert.strictEqual(restartedConfirm.failureCategory, 'install_plan_mismatch');
}

function verifyStateMigration(root, keys) {
  const home = path.join(root, 'state-migration');
  const providerRoot = path.join(home, 'providers', 'legacy-provider', '1.0.0', 'bin');
  fs.mkdirSync(providerRoot, { recursive: true });
  const binaryPath = path.join(providerRoot, process.platform === 'win32' ? 'legacy.cmd' : 'legacy');
  fs.writeFileSync(binaryPath, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
  const statePath = path.join(home, 'providers', 'provider-directory-state.json');
  const secret = 'legacy-state-secret';
  fs.writeFileSync(statePath, JSON.stringify({
    providers: {
      'legacy-provider': {
        providerId: 'legacy-provider',
        profileId: 'legacy-profile',
        installStatus: 'installed',
        activeVersion: '1.0.0',
        previousVersion: '',
        versions: ['1.0.0'],
        profile: {
          profileId: 'legacy-profile',
          binary: binaryPath,
          managedPackageSha256: 'a'.repeat(64),
          env: { TOKEN: secret }
        }
      }
    }
  }, null, 2), 'utf8');
  const manager = new ProviderDirectoryManager({
    homeDirectory: home,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  });
  const migratedText = fs.readFileSync(statePath, 'utf8');
  const migrated = JSON.parse(migratedText);
  assert.strictEqual(migrated.schemaVersion, PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION);
  assert.strictEqual(migrated.generation > 0, true);
  assert.strictEqual(migratedText.includes(secret), false);
  assert.strictEqual(migratedText.includes('"profile"'), false);
  assert.strictEqual(migrated.providers['legacy-provider'].versions['1.0.0'].entryPath.replace(/\\/g, '/'), process.platform === 'win32' ? 'bin/legacy.cmd' : 'bin/legacy');
  const publicStatus = manager.status({ providerId: 'legacy-provider' });
  assert.strictEqual(publicStatus.state.versions.length, 1);
  assert.strictEqual(JSON.stringify(publicStatus).includes('entryPath'), false);
}

function verifySymlinkOwnership(root, keys) {
  const home = path.join(root, 'symlink');
  const outside = path.join(root, 'outside-owned-root');
  const providerRoot = path.join(home, 'providers', 'linked-provider');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'keep', 'utf8');
  fs.mkdirSync(path.dirname(providerRoot), { recursive: true });
  try {
    fs.symlinkSync(outside, providerRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
      return;
    }
    throw error;
  }
  const statePath = path.join(home, 'providers', 'provider-directory-state.json');
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
    generation: 1,
    providers: {
      'linked-provider': {
        providerId: 'linked-provider',
        profileId: 'linked-profile',
        installStatus: 'installed',
        activeVersion: '1.0.0',
        previousVersion: '',
        versions: {},
        healthStatus: 'healthy',
        failureCategory: '',
        remediation: '',
        warnings: [],
        updatedAt: Date.now()
      }
    }
  }, null, 2), 'utf8');
  const profiles = new Map([['linked-profile', {
    profileId: 'linked-profile',
    providerId: 'linked-provider',
    managedProvider: true,
    managedProviderId: 'linked-provider'
  }]]);
  const manager = new ProviderDirectoryManager({
    homeDirectory: home,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    getProfile: (profileId) => profiles.get(profileId) || null,
    deleteProfile: (payload) => {
      profiles.delete(payload.profileId);
      return { deleted: true };
    }
  });
  const removal = manager.remove({ providerId: 'linked-provider', confirm: false });
  assert.strictEqual(removal.failureCategory, 'managed_path_invalid');
  assert.strictEqual(profiles.has('linked-profile'), true);
  assert.strictEqual(fs.existsSync(path.join(outside, 'sentinel.txt')), true);
}

async function verifyStatePathEscape(root, keys) {
  const home = path.join(root, 'state-path-escape');
  const outside = path.join(root, 'state-path-escape-outside');
  fs.mkdirSync(outside, { recursive: true });
  const sentinelPath = path.join(outside, 'sentinel.txt');
  fs.writeFileSync(sentinelPath, 'keep', 'utf8');
  const statePath = path.join(home, 'providers', 'provider-directory-state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
    generation: 1,
    providers: {
      'escaped-provider': {
        providerId: 'escaped-provider',
        profileId: 'escaped-profile',
        installStatus: 'installed',
        activeVersion: '2.0.0',
        previousVersion: '1.0.0',
        versions: {
          '1.0.0': {
            version: '1.0.0',
            entryPath: '../state-path-escape-outside/sentinel.txt',
            packageSha256: 'a'.repeat(64),
            directoryDigest: '',
            profileDigest: 'b'.repeat(64),
            installedAt: new Date().toISOString()
          },
          '2.0.0': {
            version: '2.0.0',
            entryPath: 'bin/provider',
            packageSha256: 'c'.repeat(64),
            directoryDigest: '',
            profileDigest: 'd'.repeat(64),
            installedAt: new Date().toISOString()
          }
        },
        healthStatus: 'healthy',
        failureCategory: '',
        remediation: '',
        warnings: [],
        updatedAt: Date.now()
      }
    }
  }, null, 2), 'utf8');
  const profile = {
    profileId: 'escaped-profile',
    providerId: 'escaped-provider',
    managedProvider: true,
    managedProviderId: 'escaped-provider',
    managedVersion: '2.0.0',
    binary: process.execPath
  };
  const manager = new ProviderDirectoryManager({
    homeDirectory: home,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    getProfile: () => profile,
    upsertProfile: () => ({ profile }),
    testProfile: async () => ({ ok: true })
  });
  const preview = await manager.rollback({ providerId: 'escaped-provider', confirm: false });
  assert.strictEqual(preview.preview, true);
  const rollback = await manager.rollback({
    providerId: 'escaped-provider',
    confirm: true,
    planId: preview.planId
  });
  assert.strictEqual(rollback.failureCategory, 'managed_path_invalid');
  assert.strictEqual(fs.readFileSync(sentinelPath, 'utf8'), 'keep');
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-provider-directory-'));
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  try {
    await verifyLifecycle(root, keys);
    await verifyReconcile(root, keys);
    verifyStateMigration(root, keys);
    verifySymlinkOwnership(root, keys);
    await verifyStatePathEscape(root, keys);
    console.log('provider directory smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
