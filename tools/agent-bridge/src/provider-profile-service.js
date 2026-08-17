'use strict';

const crypto = require('crypto');
const { secretAlias, secretFingerprint } = require('./provider-secret-store');

const PROVIDER_PROFILE_SCHEMA_VERSION = 2;
const ENVIRONMENT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(source, key, fallbackValue) {
  if (!isObject(source) || typeof source[key] !== 'string') {
    return fallbackValue;
  }
  return source[key];
}

function readBoolean(source, key, fallbackValue) {
  if (!isObject(source) || typeof source[key] !== 'boolean') {
    return fallbackValue;
  }
  return source[key];
}

function readObject(source, key) {
  if (!isObject(source) || !isObject(source[key])) {
    return {};
  }
  return source[key];
}

function readStringArray(source, key) {
  if (!isObject(source) || !Array.isArray(source[key])) {
    return [];
  }
  return source[key].filter((item) => typeof item === 'string');
}

function containsOwnKey(source, key) {
  return isObject(source) && Object.keys(source).includes(key);
}

function cloneStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function normalizedRuntimeMode(value) {
  return value === 'stdio' ? 'stdio' : 'oneshot';
}

function newProfileId() {
  return 'prv_' + crypto.randomBytes(12).toString('base64url');
}

function validEnvironmentKey(value) {
  return typeof value === 'string' && ENVIRONMENT_KEY_PATTERN.test(value);
}

function emptyEnvironment() {
  return {};
}

function environmentValues(value) {
  const source = isObject(value) ? value : {};
  const result = {};
  for (const key of Object.keys(source)) {
    if (!validEnvironmentKey(key) || typeof source[key] !== 'string') {
      continue;
    }
    result[key] = source[key];
  }
  return result;
}

function normalizeEnvironmentReferences(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  const keys = new Set();
  for (const item of value) {
    if (!isObject(item)) {
      continue;
    }
    const key = readString(item, 'key', '').trim();
    const source = readString(item, 'source', '').trim();
    if (!validEnvironmentKey(key) || keys.has(key)) {
      continue;
    }
    if (source !== 'secure_store' && source !== 'process_environment') {
      continue;
    }
    const ref = {
      key,
      source,
      alias: '',
      environmentVariable: '',
      fingerprint: readString(item, 'fingerprint', '').trim(),
      configured: readBoolean(item, 'configured', true)
    };
    if (source === 'secure_store') {
      const alias = readString(item, 'alias', '').trim();
      if (alias.length === 0) {
        continue;
      }
      ref.alias = alias;
    } else {
      const environmentVariable = readString(item, 'environmentVariable', key).trim();
      if (!validEnvironmentKey(environmentVariable)) {
        continue;
      }
      ref.environmentVariable = environmentVariable;
    }
    keys.add(key);
    result.push(ref);
  }
  return result;
}

function copyEnvironmentReferences(references) {
  const copied = [];
  for (const reference of references) {
    copied.push({
      key: reference.key,
      source: reference.source,
      alias: reference.alias,
      environmentVariable: reference.environmentVariable,
      fingerprint: reference.fingerprint,
      configured: reference.configured
    });
  }
  return copied;
}

function publicEnvironmentMetadata(profile) {
  const references = normalizeEnvironmentReferences(profile.envRefs);
  const metadata = [];
  for (const reference of references) {
    metadata.push({
      key: reference.key,
      source: reference.source,
      configured: reference.configured,
      fingerprint: reference.fingerprint,
      environmentVariable: reference.source === 'process_environment' ? reference.environmentVariable : ''
    });
  }
  if (metadata.length === 0) {
    const legacy = environmentValues(profile.env);
    for (const key of Object.keys(legacy)) {
      metadata.push({
        key,
        source: 'legacy_unmigrated',
        configured: false,
        fingerprint: '',
        environmentVariable: ''
      });
    }
  }
  return metadata;
}

function copyAcp(source) {
  const acp = isObject(source) ? source : {};
  const result = {};
  for (const key of Object.keys(acp)) {
    if (key === 'env' || key === 'token' || key === 'secret') {
      continue;
    }
    result[key] = acp[key];
  }
  return result;
}

function buildStoredProfile(payload, base, profileId, references) {
  const source = isObject(payload) ? payload : {};
  const existing = isObject(base) ? base : {};
  const now = new Date().toISOString();
  return {
    schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
    profileId,
    providerId: readString(source, 'providerId', readString(existing, 'providerId', 'custom')),
    displayName: readString(source, 'displayName', readString(source, 'name', readString(existing, 'displayName', readString(existing, 'providerId', 'custom')))),
    description: readString(source, 'description', readString(existing, 'description', '')),
    endpoint: readString(source, 'endpoint', readString(source, 'baseUrl', readString(existing, 'endpoint', ''))),
    binary: readString(source, 'binary', readString(source, 'command', readString(existing, 'binary', ''))),
    args: readString(source, 'args', readString(existing, 'args', '')),
    cwd: readString(source, 'cwd', readString(existing, 'cwd', '')),
    promptMode: readString(source, 'promptMode', readString(existing, 'promptMode', 'stdin')),
    modelFlag: readString(source, 'modelFlag', readString(existing, 'modelFlag', '')),
    cwdFlag: readString(source, 'cwdFlag', readString(existing, 'cwdFlag', '')),
    runtimeMode: normalizedRuntimeMode(readString(source, 'runtimeMode', readString(existing, 'runtimeMode', 'oneshot'))),
    envRefs: copyEnvironmentReferences(references),
    models: readStringArray(source, 'models').length > 0 ? readStringArray(source, 'models') : cloneStringArray(existing.models),
    speedModes: readStringArray(source, 'speedModes').length > 0 ? readStringArray(source, 'speedModes') : cloneStringArray(existing.speedModes),
    reasoningModes: readStringArray(source, 'reasoningModes').length > 0 ? readStringArray(source, 'reasoningModes') : cloneStringArray(existing.reasoningModes),
    interactionModes: readStringArray(source, 'interactionModes').length > 0 ? readStringArray(source, 'interactionModes') : cloneStringArray(existing.interactionModes),
    tools: readStringArray(source, 'tools').length > 0 ? readStringArray(source, 'tools') : cloneStringArray(existing.tools),
    baseProfileId: readString(source, 'baseProfileId', readString(existing, 'baseProfileId', '')),
    cloneFromProfileId: readString(source, 'cloneFromProfileId', readString(existing, 'cloneFromProfileId', '')),
    validationMessages: readStringArray(source, 'validationMessages').length > 0 ? readStringArray(source, 'validationMessages') : cloneStringArray(existing.validationMessages),
    kind: readString(source, 'kind', readString(existing, 'kind', 'custom')),
    sourcePath: readString(source, 'sourcePath', readString(existing, 'sourcePath', '')),
    acp: Object.keys(readObject(source, 'acp')).length > 0 ? copyAcp(readObject(source, 'acp')) : copyAcp(readObject(existing, 'acp')),
    enabled: readBoolean(source, 'enabled', readBoolean(existing, 'enabled', true)),
    source: readString(source, 'source', readString(existing, 'source', '')),
    sourceUrl: readString(source, 'sourceUrl', readString(existing, 'sourceUrl', '')),
    sourceVersion: readString(source, 'sourceVersion', readString(existing, 'sourceVersion', '')),
    sourceDigest: readString(source, 'sourceDigest', readString(existing, 'sourceDigest', '')),
    managedProvider: readBoolean(source, 'managedProvider', readBoolean(existing, 'managedProvider', false)),
    managedProviderId: readString(source, 'managedProviderId', readString(existing, 'managedProviderId', '')),
    managedVersion: readString(source, 'managedVersion', readString(existing, 'managedVersion', '')),
    managedPackageSha256: readString(source, 'managedPackageSha256', readString(existing, 'managedPackageSha256', '')),
    managedInstalledAt: readString(source, 'managedInstalledAt', readString(existing, 'managedInstalledAt', '')),
    secretStorageState: 'ready',
    createdAt: readString(existing, 'createdAt', now),
    updatedAt: now
  };
}

class ProviderProfileService {
  constructor(options) {
    const source = isObject(options) ? options : {};
    this.store = source.store || null;
    this.secretStore = source.secretStore || null;
    this.lastMigration = {
      migratedProfileIds: [],
      degradedProfileIds: [],
      warnings: []
    };
  }

  readProfiles() {
    if (!this.store || typeof this.store.readProviderProfiles !== 'function') {
      return [];
    }
    const profiles = this.store.readProviderProfiles();
    return Array.isArray(profiles) ? profiles.filter((profile) => isObject(profile)) : [];
  }

  writeProfiles(profiles) {
    if (!this.store || typeof this.store.writeProviderProfiles !== 'function') {
      return { ok: false, failureCategory: 'provider_profile_store_unavailable', message: 'Provider profile storage is unavailable.' };
    }
    try {
      this.store.writeProviderProfiles(profiles);
      return { ok: true };
    } catch (_error) {
      return { ok: false, failureCategory: 'provider_profile_write_failed', message: 'Provider profile storage could not be updated.' };
    }
  }

  secretStoreStatus() {
    if (!this.secretStore || typeof this.secretStore.status !== 'function') {
      return {
        available: false,
        platform: 'unavailable',
        remediation: 'Secure Provider secret storage is unavailable.'
      };
    }
    const status = this.secretStore.status();
    return isObject(status)
      ? {
          available: status.available === true,
          platform: readString(status, 'platform', 'unavailable'),
          remediation: readString(status, 'remediation', '')
        }
      : { available: false, platform: 'unavailable', remediation: 'Secure Provider secret storage is unavailable.' };
  }

  find(profileId) {
    const target = readString({ profileId }, 'profileId', '').trim();
    if (target.length === 0) {
      return null;
    }
    for (const profile of this.readProfiles()) {
      if (readString(profile, 'profileId', '') === target) {
        return profile;
      }
    }
    return null;
  }

  migrateLegacyProfiles() {
    const profiles = this.readProfiles();
    const nextProfiles = [];
    const migratedProfileIds = [];
    const degradedProfileIds = [];
    const warnings = [];
    let changed = false;
    for (const profile of profiles) {
      const legacyValues = environmentValues(profile.env);
      if (Object.keys(legacyValues).length === 0) {
        nextProfiles.push(profile);
        continue;
      }
      const profileId = readString(profile, 'profileId', '').trim();
      const availability = this.secretStoreStatus();
      if (profileId.length === 0 || !availability.available || !this.secretStore || typeof this.secretStore.write !== 'function') {
        const degraded = Object.assign({}, profile, {
          secretStorageState: 'needs_secret_migration'
        });
        nextProfiles.push(degraded);
        degradedProfileIds.push(profileId);
        warnings.push('Provider profile ' + (profileId || 'unknown') + ' needs secure secret migration.');
        if (degraded.secretStorageState !== profile.secretStorageState) {
          changed = true;
        }
        continue;
      }
      const references = [];
      const writtenAliases = [];
      let migrationFailed = false;
      for (const key of Object.keys(legacyValues)) {
        const alias = secretAlias(profileId, key);
        const stored = this.secretStore.write(alias, legacyValues[key]);
        if (!stored || stored.ok !== true) {
          migrationFailed = true;
          break;
        }
        writtenAliases.push(alias);
        references.push({
          key,
          source: 'secure_store',
          alias,
          environmentVariable: '',
          fingerprint: readString(stored, 'fingerprint', secretFingerprint(legacyValues[key])),
          configured: true
        });
      }
      if (migrationFailed) {
        if (this.secretStore && typeof this.secretStore.remove === 'function') {
          for (const alias of writtenAliases) {
            this.secretStore.remove(alias);
          }
        }
        const degraded = Object.assign({}, profile, {
          secretStorageState: 'needs_secret_migration'
        });
        nextProfiles.push(degraded);
        degradedProfileIds.push(profileId);
        warnings.push('Provider profile ' + profileId + ' could not migrate secrets into secure storage.');
        if (degraded.secretStorageState !== profile.secretStorageState) {
          changed = true;
        }
        continue;
      }
      const migrated = Object.assign({}, profile, {
        schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
        envRefs: references,
        secretStorageState: 'ready'
      });
      delete migrated.env;
      nextProfiles.push(migrated);
      migratedProfileIds.push(profileId);
      changed = true;
    }
    if (changed) {
      const saved = this.writeProfiles(nextProfiles);
      if (!saved.ok) {
        warnings.push(saved.message);
      }
    }
    this.lastMigration = { migratedProfileIds, degradedProfileIds, warnings };
    return this.lastMigration;
  }

  environmentReferences(profile) {
    const references = normalizeEnvironmentReferences(profile.envRefs);
    if (references.length > 0) {
      return references;
    }
    const legacyValues = environmentValues(profile.env);
    const legacy = [];
    for (const key of Object.keys(legacyValues)) {
      legacy.push({
        key,
        source: 'legacy_unmigrated',
        alias: '',
        environmentVariable: '',
        fingerprint: '',
        configured: false
      });
    }
    return legacy;
  }

  toPublicProfile(profile, runtimeInfo) {
    const source = isObject(profile) ? profile : {};
    const runtime = isObject(runtimeInfo) ? runtimeInfo : {};
    const secretStatus = this.secretStoreStatus();
    const references = normalizeEnvironmentReferences(source.envRefs);
    const legacyValues = environmentValues(source.env);
    const declaredStorageState = readString(source, 'secretStorageState', '');
    const needsMigration = Object.keys(legacyValues).length > 0 || declaredStorageState === 'needs_secret_migration';
    const secureStoreRequired = references.some((reference) => reference.source === 'secure_store');
    const secretStorageState = needsMigration
      ? 'needs_secret_migration'
      : (secureStoreRequired && !secretStatus.available ? 'unavailable' : 'ready');
    return {
      schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
      profileId: readString(source, 'profileId', ''),
      providerId: readString(source, 'providerId', ''),
      displayName: readString(source, 'displayName', ''),
      description: readString(source, 'description', ''),
      endpoint: readString(source, 'endpoint', ''),
      binary: readString(source, 'binary', ''),
      args: readString(source, 'args', ''),
      cwd: readString(source, 'cwd', ''),
      promptMode: readString(source, 'promptMode', 'stdin'),
      modelFlag: readString(source, 'modelFlag', ''),
      cwdFlag: readString(source, 'cwdFlag', ''),
      runtimeMode: normalizedRuntimeMode(readString(source, 'runtimeMode', 'oneshot')),
      env: emptyEnvironment(),
      envMetadata: publicEnvironmentMetadata(source),
      secretStorageState,
      secretStoragePlatform: secretStatus.platform,
      models: cloneStringArray(source.models),
      speedModes: cloneStringArray(source.speedModes),
      reasoningModes: cloneStringArray(source.reasoningModes),
      interactionModes: cloneStringArray(source.interactionModes),
      tools: cloneStringArray(source.tools),
      baseProfileId: readString(source, 'baseProfileId', ''),
      cloneFromProfileId: readString(source, 'cloneFromProfileId', ''),
      validationMessages: cloneStringArray(source.validationMessages),
      kind: readString(source, 'kind', 'custom'),
      sourcePath: readString(source, 'sourcePath', ''),
      acp: emptyEnvironment(),
      enabled: readBoolean(source, 'enabled', true),
      source: readString(source, 'source', ''),
      sourceUrl: readString(source, 'sourceUrl', ''),
      sourceVersion: readString(source, 'sourceVersion', ''),
      sourceDigest: readString(source, 'sourceDigest', ''),
      managedProvider: readBoolean(source, 'managedProvider', false),
      managedProviderId: readString(source, 'managedProviderId', ''),
      managedVersion: readString(source, 'managedVersion', ''),
      managedPackageSha256: readString(source, 'managedPackageSha256', ''),
      managedInstalledAt: readString(source, 'managedInstalledAt', ''),
      createdAt: readString(source, 'createdAt', ''),
      updatedAt: readString(source, 'updatedAt', ''),
      runtimeRegistered: readBoolean(runtime, 'runtimeRegistered', false),
      runtimeProviderId: readString(runtime, 'runtimeProviderId', ''),
      runtimeError: readString(runtime, 'runtimeError', ''),
      runtimeFailureCategory: readString(runtime, 'runtimeFailureCategory', ''),
      runtimeRemediation: readString(runtime, 'runtimeRemediation', ''),
      runtimeWarnings: readStringArray(runtime, 'runtimeWarnings')
    };
  }

  resolveRuntimeProfile(profile) {
    const source = isObject(profile) ? profile : {};
    const runtimeProfile = Object.assign({}, source);
    const legacy = environmentValues(source.env);
    if (Object.keys(legacy).length > 0) {
      runtimeProfile.env = emptyEnvironment();
      return {
        ok: false,
        profile: runtimeProfile,
        failureCategory: 'provider_secret_migration_required',
        message: 'Provider profile has legacy plaintext environment values and must be migrated into secure storage.',
        remediation: this.secretStoreStatus().remediation,
        warnings: ['provider_secret_migration_required']
      };
    }
    const environment = emptyEnvironment();
    const warnings = [];
    for (const reference of normalizeEnvironmentReferences(source.envRefs)) {
      if (reference.source === 'process_environment') {
        if (Object.keys(process.env).includes(reference.environmentVariable)) {
          environment[reference.key] = readString(process.env[reference.environmentVariable], '');
          continue;
        }
        warnings.push('environment_variable_missing:' + reference.key);
        continue;
      }
      if (!this.secretStore || typeof this.secretStore.read !== 'function') {
        runtimeProfile.env = emptyEnvironment();
        return {
          ok: false,
          profile: runtimeProfile,
          failureCategory: 'provider_secret_store_unavailable',
          message: 'Secure Provider secret storage is unavailable.',
          remediation: this.secretStoreStatus().remediation,
          warnings
        };
      }
      const secret = this.secretStore.read(reference.alias);
      if (!secret || secret.ok !== true) {
        runtimeProfile.env = emptyEnvironment();
        return {
          ok: false,
          profile: runtimeProfile,
          failureCategory: secret && typeof secret.failureCategory === 'string' ? secret.failureCategory : 'provider_secret_missing',
          message: 'A required Provider secret is unavailable.',
          remediation: secret && typeof secret.remediation === 'string' ? secret.remediation : 'Configure the Provider secret and retry.',
          warnings
        };
      }
      environment[reference.key] = readString(secret, 'value', '');
    }
    runtimeProfile.env = environment;
    return { ok: true, profile: runtimeProfile, warnings };
  }

  replaceEnvironment(profileId, previousReferences, values) {
    const availability = this.secretStoreStatus();
    if (!availability.available || !this.secretStore || typeof this.secretStore.write !== 'function') {
      return {
        ok: false,
        failureCategory: 'provider_secret_store_unavailable',
        message: 'Secure Provider secret storage is unavailable.',
        remediation: availability.remediation
      };
    }
    const references = [];
    for (const key of Object.keys(values)) {
      const alias = secretAlias(profileId, key);
      const written = this.secretStore.write(alias, values[key]);
      if (!written || written.ok !== true) {
        return {
          ok: false,
          failureCategory: written && typeof written.failureCategory === 'string' ? written.failureCategory : 'provider_secret_write_failed',
          message: written && typeof written.message === 'string' ? written.message : 'Provider secret could not be stored.',
          remediation: written && typeof written.remediation === 'string' ? written.remediation : availability.remediation
        };
      }
      references.push({
        key,
        source: 'secure_store',
        alias,
        environmentVariable: '',
        fingerprint: readString(written, 'fingerprint', secretFingerprint(values[key])),
        configured: true
      });
    }
    return { ok: true, references, previousReferences: copyEnvironmentReferences(previousReferences) };
  }

  applyEnvironmentMutations(profileId, references, payload, cloneSource) {
    const source = isObject(payload) ? payload : {};
    const existing = copyEnvironmentReferences(references);
    const legacyValues = environmentValues(source.env);
    const hasLegacyInput = (containsOwnKey(source, 'env') && Object.keys(legacyValues).length > 0) || readBoolean(source, 'envProvided', false);
    if (hasLegacyInput) {
      return this.replaceEnvironment(profileId, existing, legacyValues);
    }
    if (!Array.isArray(source.envMutations) || source.envMutations.length === 0) {
      if (!cloneSource) {
        return { ok: true, references: existing, previousReferences: [] };
      }
      const copied = [];
      for (const reference of existing) {
        if (reference.source === 'process_environment') {
          copied.push({
            key: reference.key,
            source: reference.source,
            alias: '',
            environmentVariable: reference.environmentVariable,
            fingerprint: reference.fingerprint,
            configured: reference.configured
          });
          continue;
        }
        const targetAlias = secretAlias(profileId, reference.key);
        if (!this.secretStore || typeof this.secretStore.copy !== 'function') {
          return { ok: false, failureCategory: 'provider_secret_store_unavailable', message: 'Secure Provider secret storage is unavailable.', remediation: this.secretStoreStatus().remediation };
        }
        const copiedSecret = this.secretStore.copy(reference.alias, targetAlias);
        if (!copiedSecret || copiedSecret.ok !== true) {
          return { ok: false, failureCategory: copiedSecret && typeof copiedSecret.failureCategory === 'string' ? copiedSecret.failureCategory : 'provider_secret_copy_failed', message: 'Provider secret could not be copied for the cloned profile.' };
        }
        copied.push({
          key: reference.key,
          source: 'secure_store',
          alias: targetAlias,
          environmentVariable: '',
          fingerprint: readString(copiedSecret, 'fingerprint', reference.fingerprint),
          configured: true
        });
      }
      return { ok: true, references: copied, previousReferences: [] };
    }
    const next = copyEnvironmentReferences(existing);
    const removed = [];
    for (const mutation of source.envMutations) {
      if (!isObject(mutation)) {
        return { ok: false, failureCategory: 'provider_env_mutation_invalid', message: 'Provider environment mutation must be an object.' };
      }
      const operation = readString(mutation, 'operation', readString(mutation, 'op', '')).trim();
      const key = readString(mutation, 'key', '').trim();
      if (!validEnvironmentKey(key) || !['keep', 'set', 'remove'].includes(operation)) {
        return { ok: false, failureCategory: 'provider_env_mutation_invalid', message: 'Provider environment mutation is invalid.' };
      }
      const index = next.findIndex((reference) => reference.key === key);
      if (operation === 'keep') {
        continue;
      }
      if (operation === 'remove') {
        if (index >= 0) {
          removed.push(next[index]);
          next.splice(index, 1);
        }
        continue;
      }
      const sourceKind = readString(mutation, 'source', 'secure_store').trim();
      if (index >= 0) {
        removed.push(next[index]);
        next.splice(index, 1);
      }
      if (sourceKind === 'process_environment') {
        const environmentVariable = readString(mutation, 'environmentVariable', key).trim();
        if (!validEnvironmentKey(environmentVariable)) {
          return { ok: false, failureCategory: 'provider_env_mutation_invalid', message: 'Provider process environment variable name is invalid.' };
        }
        next.push({ key, source: 'process_environment', alias: '', environmentVariable, fingerprint: '', configured: Object.keys(process.env).includes(environmentVariable) });
        continue;
      }
      const value = readString(mutation, 'value', '');
      const availability = this.secretStoreStatus();
      if (!availability.available || !this.secretStore || typeof this.secretStore.write !== 'function') {
        return { ok: false, failureCategory: 'provider_secret_store_unavailable', message: 'Secure Provider secret storage is unavailable.', remediation: availability.remediation };
      }
      const alias = secretAlias(profileId, key);
      const written = this.secretStore.write(alias, value);
      if (!written || written.ok !== true) {
        return { ok: false, failureCategory: written && typeof written.failureCategory === 'string' ? written.failureCategory : 'provider_secret_write_failed', message: 'Provider secret could not be stored.' };
      }
      next.push({ key, source: 'secure_store', alias, environmentVariable: '', fingerprint: readString(written, 'fingerprint', secretFingerprint(value)), configured: true });
    }
    return { ok: true, references: next, previousReferences: removed };
  }

  cleanupRemovedReferences(references, activeReferences) {
    if (!this.secretStore || typeof this.secretStore.remove !== 'function') {
      return ['provider_secret_cleanup_unavailable'];
    }
    const activeAliases = new Set();
    for (const reference of activeReferences) {
      if (reference.source === 'secure_store') {
        activeAliases.add(reference.alias);
      }
    }
    const warnings = [];
    for (const reference of references) {
      if (reference.source !== 'secure_store' || activeAliases.has(reference.alias)) {
        continue;
      }
      const removed = this.secretStore.remove(reference.alias);
      if (!removed || removed.ok !== true) {
        warnings.push('provider_secret_cleanup_failed:' + reference.key);
      }
    }
    return warnings;
  }

  upsert(payload) {
    this.migrateLegacyProfiles();
    const source = isObject(payload) ? payload : {};
    const requestedProfileId = readString(source, 'profileId', readString(source, 'id', '')).trim();
    const cloneFromProfileId = readString(source, 'cloneFromProfileId', '').trim();
    const existing = requestedProfileId.length > 0 ? this.find(requestedProfileId) : null;
    const cloneSource = cloneFromProfileId.length > 0 ? this.find(cloneFromProfileId) : null;
    if (cloneFromProfileId.length > 0 && !cloneSource) {
      return { ok: false, failureCategory: 'provider_profile_not_found', message: 'Provider profile to clone was not found.' };
    }
    const profileId = requestedProfileId.length > 0 ? requestedProfileId : newProfileId();
    const base = cloneSource || existing || {};
    const references = this.environmentReferences(base);
    const environment = this.applyEnvironmentMutations(profileId, references, source, cloneSource !== null && existing === null);
    if (!environment.ok) {
      return environment;
    }
    const storedProfile = buildStoredProfile(source, base, profileId, environment.references);
    if (cloneSource && existing === null) {
      storedProfile.cloneFromProfileId = cloneFromProfileId;
      if (storedProfile.baseProfileId.length === 0) {
        storedProfile.baseProfileId = cloneFromProfileId;
      }
    }
    const profiles = this.readProfiles();
    const nextProfiles = [];
    let replaced = false;
    for (const profile of profiles) {
      if (readString(profile, 'profileId', '') === profileId) {
        nextProfiles.push(storedProfile);
        replaced = true;
      } else {
        nextProfiles.push(profile);
      }
    }
    if (!replaced) {
      nextProfiles.push(storedProfile);
    }
    const saved = this.writeProfiles(nextProfiles);
    if (!saved.ok) {
      return saved;
    }
    const warnings = this.cleanupRemovedReferences(environment.previousReferences, environment.references);
    return {
      ok: true,
      storedProfile,
      profile: this.toPublicProfile(storedProfile, {}),
      profiles: nextProfiles.map((profile) => this.toPublicProfile(profile, {})),
      warnings
    };
  }

  remove(profileId) {
    const target = readString({ profileId }, 'profileId', '').trim();
    if (target.length === 0) {
      return { ok: false, failureCategory: 'provider_profile_id_missing', message: 'Provider profile id is required.' };
    }
    this.migrateLegacyProfiles();
    const profiles = this.readProfiles();
    const nextProfiles = [];
    let deleted = null;
    for (const profile of profiles) {
      if (readString(profile, 'profileId', '') === target) {
        deleted = profile;
      } else {
        nextProfiles.push(profile);
      }
    }
    if (!deleted) {
      return { ok: false, failureCategory: 'provider_profile_not_found', message: 'Provider profile was not found.' };
    }
    const saved = this.writeProfiles(nextProfiles);
    if (!saved.ok) {
      return saved;
    }
    const warnings = this.cleanupRemovedReferences(this.environmentReferences(deleted), []);
    return {
      ok: true,
      deleted: true,
      profileId: target,
      profiles: nextProfiles.map((profile) => this.toPublicProfile(profile, {})),
      warnings
    };
  }

  listPublic(runtimeResolver) {
    this.migrateLegacyProfiles();
    const profiles = [];
    for (const profile of this.readProfiles()) {
      const runtime = typeof runtimeResolver === 'function' ? runtimeResolver(profile) : {};
      profiles.push(this.toPublicProfile(profile, runtime));
    }
    return profiles;
  }
}

module.exports = {
  PROVIDER_PROFILE_SCHEMA_VERSION,
  ProviderProfileService,
  normalizeEnvironmentReferences,
  publicEnvironmentMetadata
};
