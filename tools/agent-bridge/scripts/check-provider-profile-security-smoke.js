#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createDaemonStore } = require('../src/daemon-store');
const { buildDaemonDoctorReport, buildDiagnosticsExportReport } = require('../src/diagnostics');
const { mcpToolDefinitions, toolConfirmationFailure, toolRequestType } = require('../src/mcp-host');
const { ProviderProfileService } = require('../src/provider-profile-service');
const { ProviderSecretStore } = require('../src/provider-secret-store');
const { RequestType } = require('../src/protocol');

class MemorySecretStore {
  constructor(available, failWriteAt) {
    this.available = available !== false;
    this.failWriteAt = typeof failWriteAt === 'number' ? failWriteAt : 0;
    this.writeCount = 0;
    this.values = new Map();
    this.removed = [];
  }

  status() {
    return {
      available: this.available,
      platform: this.available ? 'memory-secure-store' : 'memory-unavailable',
      remediation: this.available ? '' : 'Enable the test secure store.'
    };
  }

  write(alias, value) {
    this.writeCount += 1;
    if (!this.available) {
      return {
        ok: false,
        failureCategory: 'provider_secret_store_unavailable',
        remediation: 'Enable the test secure store.'
      };
    }
    if (this.failWriteAt > 0 && this.writeCount === this.failWriteAt) {
      return {
        ok: false,
        failureCategory: 'provider_secret_write_failed'
      };
    }
    this.values.set(alias, value);
    return {
      ok: true,
      alias,
      fingerprint: crypto.createHash('sha256').update(value, 'utf8').digest('hex').substring(0, 24)
    };
  }

  read(alias) {
    if (!this.available) {
      return {
        ok: false,
        failureCategory: 'provider_secret_store_unavailable',
        remediation: 'Enable the test secure store.'
      };
    }
    if (!this.values.has(alias)) {
      return {
        ok: false,
        failureCategory: 'provider_secret_missing'
      };
    }
    return {
      ok: true,
      alias,
      value: this.values.get(alias)
    };
  }

  remove(alias) {
    this.removed.push(alias);
    this.values.delete(alias);
    return { ok: true, alias };
  }

  copy(sourceAlias, targetAlias) {
    const source = this.read(sourceAlias);
    if (!source.ok) {
      return source;
    }
    return this.write(targetAlias, source.value);
  }
}

function writeLegacyProfiles(store, profiles) {
  fs.writeFileSync(store.providerProfilesPath(), JSON.stringify(profiles, null, 2), 'utf8');
}

function assertNoLeak(value, secrets, label) {
  const text = JSON.stringify(value);
  for (const secret of secrets) {
    assert.strictEqual(text.includes(secret), false, label + ' leaked a Provider secret');
  }
  assert.strictEqual(text.includes('provider:legacy-profile:'), false, label + ' leaked a Provider secret alias');
}

function verifyLegacyMigration(root) {
  const store = createDaemonStore(path.join(root, 'migration'));
  const secretStore = new MemorySecretStore(true);
  const service = new ProviderProfileService({ store, secretStore });
  const secrets = ['migration-token-value', 'migration-password-value'];
  writeLegacyProfiles(store, [{
    profileId: 'legacy-profile',
    providerId: 'legacy',
    displayName: 'Legacy Provider',
    binary: process.execPath,
    env: {
      API_TOKEN: secrets[0],
      API_PASSWORD: secrets[1]
    }
  }]);

  const migration = service.migrateLegacyProfiles();
  assert.deepStrictEqual(migration.migratedProfileIds, ['legacy-profile']);
  const rawText = fs.readFileSync(store.providerProfilesPath(), 'utf8');
  const rawState = JSON.parse(rawText);
  assert.strictEqual(rawState.schemaVersion, 2);
  assert.strictEqual(Array.isArray(rawState.profiles), true);
  assert.strictEqual(rawText.includes(secrets[0]), false);
  assert.strictEqual(rawText.includes(secrets[1]), false);

  const publicProfile = service.listPublic()[0];
  assert.deepStrictEqual(publicProfile.env, {});
  assert.strictEqual(publicProfile.secretStorageState, 'ready');
  assert.strictEqual(publicProfile.secretStoragePlatform, 'memory-secure-store');
  assert.deepStrictEqual(publicProfile.envMetadata.map((item) => item.key).sort(), ['API_PASSWORD', 'API_TOKEN']);
  assertNoLeak(publicProfile, secrets, 'public profile');

  const runtime = service.resolveRuntimeProfile(service.find('legacy-profile'));
  assert.strictEqual(runtime.ok, true);
  assert.strictEqual(runtime.profile.env.API_TOKEN, secrets[0]);
  assert.strictEqual(runtime.profile.env.API_PASSWORD, secrets[1]);

  const doctor = buildDaemonDoctorReport(store, {
    providerSecretStorage: service.secretStoreStatus()
  });
  const secretCheck = doctor.checks.find((check) => check.id === 'provider_secret_store');
  assert(secretCheck, 'doctor must include Provider secret store state');
  assert.strictEqual(secretCheck.status, 'ok');
  assertNoLeak(doctor, secrets, 'doctor');

  const diagnostics = buildDiagnosticsExportReport(store, {
    doctor,
    providerSecretStorage: service.secretStoreStatus(),
    secureStorage: {
      credentialStoreAvailable: true,
      providerSecretStorage: service.secretStoreStatus()
    }
  });
  const secureGroup = diagnostics.report.groups.find((group) => group.id === 'secureStorage');
  assert(secureGroup, 'diagnostics must include the secureStorage group');
  assert(secureGroup.checks.some((check) => check.id === 'provider_secret_store'));
  assert(secureGroup.checks.some((check) => check.id === 'credential_store_runtime' && check.status === 'ok'));
  assertNoLeak(diagnostics, secrets, 'diagnostics');
}

function verifyUnavailableMigration(root) {
  const store = createDaemonStore(path.join(root, 'unavailable'));
  const secretStore = new MemorySecretStore(false);
  const service = new ProviderProfileService({ store, secretStore });
  const secret = 'unavailable-legacy-token';
  writeLegacyProfiles(store, [{
    profileId: 'legacy-profile',
    providerId: 'legacy',
    binary: process.execPath,
    env: {
      API_TOKEN: secret
    }
  }]);

  const migration = service.migrateLegacyProfiles();
  assert.deepStrictEqual(migration.degradedProfileIds, ['legacy-profile']);
  assert(fs.readFileSync(store.providerProfilesPath(), 'utf8').includes(secret), 'unmigrated plaintext must remain available for a later secure migration');
  const publicProfile = service.listPublic()[0];
  assert.strictEqual(publicProfile.secretStorageState, 'needs_secret_migration');
  assert.deepStrictEqual(publicProfile.env, {});
  assertNoLeak(publicProfile, [secret], 'degraded public profile');

  const runtime = service.resolveRuntimeProfile(service.find('legacy-profile'));
  assert.strictEqual(runtime.ok, false);
  assert.strictEqual(runtime.failureCategory, 'provider_secret_migration_required');
  assertNoLeak(runtime, [secret], 'degraded runtime failure');

  const doctor = buildDaemonDoctorReport(store, {
    providerSecretStorage: service.secretStoreStatus()
  });
  const secretCheck = doctor.checks.find((check) => check.id === 'provider_secret_store');
  assert.strictEqual(secretCheck.status, 'warning');
  assertNoLeak(doctor, [secret], 'degraded doctor');
}

function verifyMigrationCleanup(root) {
  const store = createDaemonStore(path.join(root, 'migration-cleanup'));
  const secretStore = new MemorySecretStore(true, 2);
  const service = new ProviderProfileService({ store, secretStore });
  writeLegacyProfiles(store, [{
    profileId: 'legacy-profile',
    providerId: 'legacy',
    env: {
      FIRST_TOKEN: 'first-secret',
      SECOND_TOKEN: 'second-secret'
    }
  }]);
  const migration = service.migrateLegacyProfiles();
  assert.deepStrictEqual(migration.degradedProfileIds, ['legacy-profile']);
  assert.strictEqual(secretStore.values.size, 0, 'partial migration must clean aliases already written');
}

function verifyMutationsCloneAndDelete(root) {
  const store = createDaemonStore(path.join(root, 'mutations'));
  const secretStore = new MemorySecretStore(true);
  const service = new ProviderProfileService({ store, secretStore });
  const originalSecrets = ['alpha-secret', 'beta-secret', 'gamma-secret'];
  const created = service.upsert({
    profileId: 'source-profile',
    providerId: 'source',
    displayName: 'Source',
    binary: process.execPath,
    envMutations: [
      { operation: 'set', key: 'ALPHA_TOKEN', source: 'secure_store', value: originalSecrets[0] },
      { operation: 'set', key: 'BETA_TOKEN', source: 'secure_store', value: originalSecrets[1] },
      { operation: 'set', key: 'GAMMA_TOKEN', source: 'secure_store', value: originalSecrets[2] }
    ]
  });
  assert.strictEqual(created.ok, true);
  assertNoLeak(created.profile, originalSecrets, 'upsert result');

  const publicRoundTrip = service.upsert({
    profileId: 'source-profile',
    displayName: 'Source renamed',
    env: {},
    envProvided: false
  });
  assert.strictEqual(publicRoundTrip.ok, true);
  const afterRoundTrip = service.resolveRuntimeProfile(service.find('source-profile'));
  assert.strictEqual(afterRoundTrip.profile.env.ALPHA_TOKEN, originalSecrets[0]);
  assert.strictEqual(afterRoundTrip.profile.env.BETA_TOKEN, originalSecrets[1]);
  assert.strictEqual(afterRoundTrip.profile.env.GAMMA_TOKEN, originalSecrets[2]);

  const changedSecret = 'beta-secret-updated';
  const mutated = service.upsert({
    profileId: 'source-profile',
    envMutations: [
      { operation: 'keep', key: 'ALPHA_TOKEN' },
      { operation: 'set', key: 'BETA_TOKEN', source: 'secure_store', value: changedSecret },
      { operation: 'remove', key: 'GAMMA_TOKEN' }
    ]
  });
  assert.strictEqual(mutated.ok, true);
  const mutatedRuntime = service.resolveRuntimeProfile(service.find('source-profile'));
  assert.deepStrictEqual(mutatedRuntime.profile.env, {
    ALPHA_TOKEN: originalSecrets[0],
    BETA_TOKEN: changedSecret
  });
  assertNoLeak(mutated.profile, originalSecrets.concat([changedSecret]), 'mutation result');

  const sourceStored = service.find('source-profile');
  const sourceAliases = sourceStored.envRefs.map((reference) => reference.alias);
  const cloned = service.upsert({
    profileId: 'clone-profile',
    cloneFromProfileId: 'source-profile',
    displayName: 'Clone'
  });
  assert.strictEqual(cloned.ok, true);
  const cloneStored = service.find('clone-profile');
  const cloneAliases = cloneStored.envRefs.map((reference) => reference.alias);
  assert.strictEqual(cloneAliases.length, sourceAliases.length);
  for (const alias of cloneAliases) {
    assert.strictEqual(sourceAliases.includes(alias), false, 'cloned secrets must use independent aliases');
  }
  const cloneRuntime = service.resolveRuntimeProfile(cloneStored);
  assert.deepStrictEqual(cloneRuntime.profile.env, mutatedRuntime.profile.env);

  const removedAliases = cloneAliases.slice();
  const removed = service.remove('clone-profile');
  assert.strictEqual(removed.ok, true);
  for (const alias of removedAliases) {
    assert.strictEqual(secretStore.values.has(alias), false, 'delete must remove cloned secret aliases');
  }
  for (const alias of sourceAliases) {
    assert.strictEqual(secretStore.values.has(alias), true, 'delete must preserve source profile secrets');
  }

  const cleared = service.upsert({
    profileId: 'source-profile',
    env: {},
    envProvided: true
  });
  assert.strictEqual(cleared.ok, true);
  assert.deepStrictEqual(service.resolveRuntimeProfile(service.find('source-profile')).profile.env, {});
}

function verifyMcpContract() {
  const definition = mcpToolDefinitions().find((tool) => tool.name === 'provider_profile_upsert');
  assert(definition, 'MCP must expose provider_profile_upsert');
  assert(definition.inputSchema.properties.envMutations, 'MCP upsert schema must expose envMutations');
  assert.strictEqual(toolConfirmationFailure('provider_profile_upsert', {}).failureCategory, 'confirmation_required');
  assert.strictEqual(toolConfirmationFailure('provider_profile_upsert', { confirm: true }), null);
  const request = toolRequestType('provider_profile_upsert', {
    profileId: 'mcp-profile',
    confirm: true,
    envMutations: [
      { operation: 'set', key: 'API_TOKEN', source: 'secure_store', value: 'mcp-secret-value' }
    ]
  });
  assert.strictEqual(request.type, RequestType.PROVIDER_PROFILE_UPSERT);
  assert.strictEqual(request.payload.envMutations[0].operation, 'set');
}

function verifyPlatformSecretStore(root) {
  const store = new ProviderSecretStore({
    homeDirectory: path.join(root, 'platform-secret-store')
  });
  const status = store.status();
  assert.strictEqual(typeof status.platform, 'string');
  assert.strictEqual(typeof status.available, 'boolean');
  if (process.platform !== 'win32') {
    return;
  }
  const alias = 'provider:platform-probe:API_TOKEN';
  const secret = 'platform-secret-smoke';
  const written = store.write(alias, secret);
  assert.strictEqual(written.ok, true);
  const credentialPath = store.credentialPath(alias);
  assert.strictEqual(fs.readFileSync(credentialPath, 'utf8').includes(secret), false, 'DPAPI file must not contain plaintext');
  const read = store.read(alias);
  assert.strictEqual(read.ok, true);
  assert.strictEqual(read.value, secret);
  const removed = store.remove(alias);
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(fs.existsSync(credentialPath), false);
}

function verifyCliRequiresLiveBridge(root) {
  const secret = 'cli-output-secret-value';
  const launcherPath = path.join(__dirname, '..', 'src', 'desktop-launcher.js');
  const result = spawnSync(process.execPath, [
    launcherPath,
    'provider',
    'env',
    '--profile-id',
    'missing-profile',
    '--set',
    'API_TOKEN=' + secret
  ], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: path.join(root, 'cli'),
      AGENT_BRIDGE_HOOK_HOME: path.join(root, 'cli'),
      NO_COLOR: '1'
    }),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000
  });
  const output = String(result.stdout || '') + String(result.stderr || '');
  assert.notStrictEqual(result.status, 0);
  assert(output.includes('live_bridge_required'), 'Provider mutation without a live Bridge must return live_bridge_required');
  assert.strictEqual(output.includes(secret), false, 'CLI failure output must not echo the Provider secret');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-profile-security-'));
  try {
    verifyLegacyMigration(root);
    verifyUnavailableMigration(root);
    verifyMigrationCleanup(root);
    verifyMutationsCloneAndDelete(root);
    verifyMcpContract();
    verifyPlatformSecretStore(root);
    verifyCliRequiresLiveBridge(root);
    console.log('provider profile security smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
