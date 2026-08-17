'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const childProcess = require('child_process');
const { profileDirectory } = require('./profile-store');

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 20000;
const MAX_REDIRECTS = 3;
const PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION = 2;
const DEFAULT_PLAN_TTL_MS = 5 * 60 * 1000;
const BUILTIN_PROVIDER_CATALOG_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAstG7EB//353Jf0uIRruR\n' +
  'SKZ55qFuYsKeCFbNInUCGDFGmkUaHSrr3TnjxIYhswjdD64wvaOOCkHzGSzVubc+\n' +
  'AQQAwNXRcQCFkTxDLBqLSZSGzwA4YkeXUoZWh0meC+uvslNbnhh4RaxOrp6XZ2vs\n' +
  'L8bEnZISFnKpLqNHdCsUlFSpIHUfKixhLt79GB6B7hGHNRx1SFyry2pTuOGIEQ6A\n' +
  '/1puNNl3XtBdO6eqCkCwao0ooiolLNxUb+q7+ijx3sC8dzAmW4LtsFgYEHDizZXA\n' +
  'y3SjlSHtbeB6d58DMMYIr3VUWp/hmTkvDfKsY+krYNR5uz1gT99q/HikY0cSa/IITQIDAQAB\n' +
  '-----END PUBLIC KEY-----\n';

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  return typeof source[key] === 'string' ? source[key] : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  return typeof source[key] === 'boolean' ? source[key] : fallbackValue;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = [];
  for (const key of keys) {
    if (key === 'signature') {
      continue;
    }
    entries.push(JSON.stringify(key) + ':' + canonicalJson(value[key]));
  }
  return '{' + entries.join(',') + '}';
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest('hex');
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function pathInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative.length === 0 || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function archiveEntrySafe(entry) {
  const normalized = String(entry || '').replace(/\\/g, '/');
  if (normalized.length === 0 || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split('/').includes('..');
}

function archiveTool() {
  return process.env.AGENT_BRIDGE_ARCHIVE_TOOL === 'bsdtar' ? 'bsdtar' : 'tar';
}

function listArchive(archivePath) {
  const result = childProcess.spawnSync(archiveTool(), ['-tf', archivePath], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error('Archive listing failed: ' + String(result.stderr || result.stdout || '').trim());
  }
  const entries = String(result.stdout || '').split(/\r?\n/).filter((item) => item.length > 0);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Archive contains too many entries.');
  }
  for (const entry of entries) {
    if (!archiveEntrySafe(entry)) {
      throw new Error('Archive contains an unsafe path: ' + entry);
    }
  }
  const verbose = childProcess.spawnSync(archiveTool(), ['-tvf', archivePath], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (verbose.status !== 0) {
    throw new Error('Archive metadata listing failed.');
  }
  for (const line of String(verbose.stdout || '').split(/\r?\n/)) {
    const type = line.charAt(0);
    if (type === 'l' || type === 'h' || type === 'b' || type === 'c' || type === 'p') {
      throw new Error('Archive contains unsupported link or device entries.');
    }
  }
  return entries;
}

function directorySizeAndValidate(rootPath) {
  let totalBytes = 0;
  let count = 0;
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const name of fs.readdirSync(current)) {
      const candidate = path.join(current, name);
      if (!pathInside(rootPath, candidate)) {
        throw new Error('Extracted path escaped the provider directory.');
      }
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink()) {
        throw new Error('Extracted archive contains a symbolic link.');
      }
      count += 1;
      if (count > MAX_ARCHIVE_ENTRIES) {
        throw new Error('Extracted archive contains too many entries.');
      }
      if (stat.isDirectory()) {
        pending.push(candidate);
      } else if (stat.isFile()) {
        totalBytes += stat.size;
        if (totalBytes > MAX_EXTRACTED_BYTES) {
          throw new Error('Extracted archive exceeds the size limit.');
        }
      } else {
        throw new Error('Extracted archive contains an unsupported file type.');
      }
    }
  }
  return { totalBytes, count };
}

function fetchBuffer(urlText, timeoutMs, maxBytes, redirects) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlText); } catch (_error) { reject(new Error('Package URL is invalid.')); return; }
    if (parsed.protocol !== 'https:') { reject(new Error('Package URL must use HTTPS.')); return; }
    const request = https.get(parsed, { headers: { accept: 'application/octet-stream', 'user-agent': 'ngf-agent-bridge-provider-directory/1' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && typeof response.headers.location === 'string') {
        response.resume();
        if (redirects >= MAX_REDIRECTS) { reject(new Error('Package download exceeded the redirect limit.')); return; }
        const redirected = new URL(response.headers.location, parsed).toString();
        fetchBuffer(redirected, timeoutMs, maxBytes, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); reject(new Error('Package download returned HTTP ' + String(response.statusCode) + '.')); return; }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => { bytes += chunk.length; if (bytes > maxBytes) { request.destroy(new Error('Package exceeds the download size limit.')); return; } chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Package download timed out.')));
    request.on('error', reject);
  });
}

function fetchJson(urlText, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlText);
    } catch (error) {
      reject(new Error('Provider directory URL is invalid.'));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('Provider directory URL must use HTTPS.'));
      return;
    }
    const request = https.get(parsed, {
      headers: {
        accept: 'application/json',
        'user-agent': 'ngf-agent-bridge-provider-directory/1'
      }
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error('Provider directory returned HTTP ' + String(response.statusCode) + '.'));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_MANIFEST_BYTES) {
          request.destroy(new Error('Provider directory manifest exceeds the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(new Error('Provider directory returned invalid JSON.'));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Provider directory request timed out.')));
    request.on('error', reject);
  });
}

function normalizeEntry(source) {
  const profile = source && source.profile && typeof source.profile === 'object' && !Array.isArray(source.profile)
    ? source.profile
    : {};
  return {
    id: readString(source, 'id', readString(profile, 'profileId', '')),
    version: readString(source, 'version', '0.0.0'),
    displayName: readString(source, 'displayName', readString(profile, 'displayName', '')),
    description: readString(source, 'description', readString(profile, 'description', '')),
    platforms: Array.isArray(source.platforms) ? source.platforms.filter((item) => typeof item === 'string') : [],
    minimumBridgeVersion: readString(source, 'minimumBridgeVersion', ''),
    profileSha256: readString(source, 'profileSha256', ''),
    managedBinary: source.managedBinary && typeof source.managedBinary === 'object' && !Array.isArray(source.managedBinary) ? source.managedBinary : (
      readString(source, 'packageUrl', '').length > 0 ? {
        packageUrl: readString(source, 'packageUrl', ''), packageFormat: readString(source, 'packageFormat', ''),
        packageSha256: readString(source, 'packageSha256', ''), entryPath: readString(source, 'entryPath', ''),
        sizeBytes: typeof source.sizeBytes === 'number' ? source.sizeBytes : 0,
        architectures: Array.isArray(source.architectures) ? source.architectures.filter((item) => typeof item === 'string') : []
      } : null
    ),
    profile
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value, fallbackValue) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallbackValue;
}

function directoryDigest(rootPath) {
  const records = [];
  const pending = [{ absolutePath: rootPath, relativePath: '' }];
  while (pending.length > 0) {
    const current = pending.pop();
    const names = fs.readdirSync(current.absolutePath).sort();
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const name = names[index];
      const absolutePath = path.join(current.absolutePath, name);
      const relativePath = current.relativePath.length > 0
        ? current.relativePath + '/' + name
        : name;
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error('Managed Provider directory contains a symbolic link.');
      }
      if (stat.isDirectory()) {
        records.push('directory\0' + relativePath);
        pending.push({ absolutePath, relativePath });
      } else if (stat.isFile()) {
        records.push('file\0' + relativePath + '\0' + String(stat.size) + '\0' + sha256File(absolutePath));
      } else {
        throw new Error('Managed Provider directory contains an unsupported file type.');
      }
    }
  }
  records.sort();
  return sha256Text(records.join('\n'));
}

function publicProfilePreview(profile) {
  const source = isObject(profile) ? profile : {};
  return {
    profileId: readString(source, 'profileId', ''),
    providerId: readString(source, 'providerId', ''),
    displayName: readString(source, 'displayName', ''),
    description: readString(source, 'description', ''),
    endpoint: readString(source, 'endpoint', ''),
    binary: readString(source, 'binary', ''),
    runtimeMode: readString(source, 'runtimeMode', 'oneshot'),
    kind: readString(source, 'kind', 'custom'),
    enabled: readBoolean(source, 'enabled', true),
    source: readString(source, 'source', ''),
    sourceVersion: readString(source, 'sourceVersion', ''),
    managedProvider: readBoolean(source, 'managedProvider', false),
    managedProviderId: readString(source, 'managedProviderId', ''),
    managedVersion: readString(source, 'managedVersion', ''),
    env: {}
  };
}

class ProviderDirectoryManager {
  constructor(options) {
    const source = options && typeof options === 'object' ? options : {};
    this.bridgeVersion = readString(source, 'bridgeVersion', '0.0.0');
    this.platform = readString(source, 'platform', process.platform);
    this.architecture = readString(source, 'architecture', process.arch);
    this.homeDirectory = readString(source, 'homeDirectory', profileDirectory());
    this.providersDirectory = path.join(this.homeDirectory, 'providers');
    this.statePath = path.join(this.providersDirectory, 'provider-directory-state.json');
    this.publicKeyPem = readString(source, 'publicKeyPem', process.env.AGENT_BRIDGE_PROVIDER_CATALOG_PUBLIC_KEY || BUILTIN_PROVIDER_CATALOG_PUBLIC_KEY);
    this.fetcher = typeof source.fetcher === 'function' ? source.fetcher : fetchJson;
    this.upsertProfile = typeof source.upsertProfile === 'function' ? source.upsertProfile : null;
    this.deleteProfile = typeof source.deleteProfile === 'function' ? source.deleteProfile : null;
    this.testProfile = typeof source.testProfile === 'function' ? source.testProfile : null;
    this.getProfile = typeof source.getProfile === 'function' ? source.getProfile : null;
    this.packageFetcher = typeof source.packageFetcher === 'function' ? source.packageFetcher : fetchBuffer;
    this.planTtlMs = Math.max(1000, Math.min(15 * 60 * 1000, safeInteger(source.planTtlMs, DEFAULT_PLAN_TTL_MS)));
    this.cached = null;
    this.cachedUrl = '';
    this.plans = new Map();
    this.managerHealth = {
      status: 'ready',
      failureCategory: '',
      message: '',
      remediation: ''
    };
    this.trustRootValid = false;
    try {
      crypto.createPublicKey(this.publicKeyPem);
      this.trustRootValid = this.publicKeyPem.length > 0;
    } catch (_error) {
      this.managerHealth = {
        status: 'unavailable',
        failureCategory: 'provider_directory_trust_root_invalid',
        message: 'Provider directory trust root is invalid.',
        remediation: 'Install a Bridge build with a valid catalog public key or fix the process-level override.'
      };
    }
    const loaded = this.loadState();
    this.state = loaded.state;
    if (loaded.migrated) {
      try {
        this.saveState(true);
      } catch (_error) {
        // saveState records the manager health state.
      }
    }
  }

  loadState() {
    if (!fs.existsSync(this.statePath)) {
      return {
        state: {
          schemaVersion: PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
          generation: 0,
          providers: {}
        },
        migrated: false
      };
    }
    try {
      const value = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return this.normalizeState(value);
    } catch (_error) {
      this.managerHealth = {
        status: 'degraded',
        failureCategory: 'provider_directory_state_corrupt',
        message: 'Provider directory state could not be read.',
        remediation: 'Inspect the managed Provider state file and restore it from a known-good backup.'
      };
      return {
        state: {
          schemaVersion: PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
          generation: 0,
          providers: {}
        },
        migrated: false
      };
    }
  }

  normalizeState(value) {
    const source = isObject(value) ? value : {};
    const rawProviders = isObject(source.providers) ? source.providers : {};
    const providers = {};
    let migrated = safeInteger(source.schemaVersion, 1) !== PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION;
    for (const providerId of Object.keys(rawProviders)) {
      const rawState = isObject(rawProviders[providerId]) ? rawProviders[providerId] : {};
      const normalizedProviderId = readString(rawState, 'providerId', providerId);
      const profileId = readString(rawState, 'profileId', '');
      if (normalizedProviderId.length === 0 || profileId.length === 0) {
        migrated = true;
        continue;
      }
      const activeVersion = readString(rawState, 'activeVersion', '');
      const previousVersion = readString(rawState, 'previousVersion', '');
      const rawVersions = isObject(rawState.versions) ? rawState.versions : {};
      const legacyVersions = Array.isArray(rawState.versions)
        ? rawState.versions.filter((item) => typeof item === 'string')
        : [];
      const legacyProfile = isObject(rawState.profile) ? rawState.profile : {};
      const versions = {};
      const versionNames = new Set(Object.keys(rawVersions));
      for (const version of legacyVersions) {
        versionNames.add(version);
      }
      if (activeVersion.length > 0) {
        versionNames.add(activeVersion);
      }
      if (previousVersion.length > 0) {
        versionNames.add(previousVersion);
      }
      for (const version of versionNames) {
        const rawVersion = isObject(rawVersions[version]) ? rawVersions[version] : {};
        let entryPath = readString(rawVersion, 'entryPath', '');
        if (entryPath.length === 0 && Object.keys(legacyProfile).length > 0) {
          const binary = readString(legacyProfile, 'binary', '');
          const versionRoot = path.join(this.providersDirectory, safeSegment(normalizedProviderId), safeSegment(version));
          if (binary.length > 0 && pathInside(versionRoot, binary)) {
            entryPath = path.relative(versionRoot, binary).replace(/\\/g, '/');
          }
        }
        versions[version] = {
          version,
          entryPath: archiveEntrySafe(entryPath) ? entryPath.replace(/\\/g, '/') : '',
          packageSha256: readString(rawVersion, 'packageSha256', readString(legacyProfile, 'managedPackageSha256', '')),
          directoryDigest: readString(rawVersion, 'directoryDigest', ''),
          profileDigest: readString(rawVersion, 'profileDigest', readString(legacyProfile, 'sourceDigest', '')),
          installedAt: readString(rawVersion, 'installedAt', readString(legacyProfile, 'managedInstalledAt', ''))
        };
      }
      if (Object.keys(legacyProfile).length > 0 || Array.isArray(rawState.versions)) {
        migrated = true;
      }
      providers[normalizedProviderId] = {
        providerId: normalizedProviderId,
        profileId,
        installStatus: readString(rawState, 'installStatus', 'installed'),
        activeVersion,
        previousVersion,
        versions,
        healthStatus: readString(rawState, 'healthStatus', 'unknown'),
        failureCategory: readString(rawState, 'failureCategory', ''),
        remediation: readString(rawState, 'remediation', ''),
        warnings: Array.isArray(rawState.warnings) ? rawState.warnings.filter((item) => typeof item === 'string') : [],
        updatedAt: safeInteger(rawState.updatedAt, Date.now())
      };
    }
    return {
      state: {
        schemaVersion: PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
        generation: safeInteger(source.generation, 0),
        providers
      },
      migrated
    };
  }

  saveState(bumpGeneration) {
    if (bumpGeneration !== false) {
      this.state.generation = safeInteger(this.state.generation, 0) + 1;
    }
    this.state.schemaVersion = PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION;
    try {
      writeJsonAtomic(this.statePath, this.state);
      if (this.managerHealth.status !== 'unavailable' && this.trustRootValid) {
        this.managerHealth = {
          status: 'ready',
          failureCategory: '',
          message: '',
          remediation: ''
        };
      }
    } catch (error) {
      this.managerHealth = {
        status: 'unavailable',
        failureCategory: 'provider_directory_state_write_failed',
        message: 'Provider directory state could not be written.',
        remediation: 'Check filesystem permissions for the Bridge Provider directory.'
      };
      throw error;
    }
  }

  providerState(providerId) {
    return isObject(this.state.providers) && isObject(this.state.providers[providerId])
      ? this.state.providers[providerId]
      : null;
  }

  publicState(state) {
    if (!isObject(state)) {
      return null;
    }
    const versions = [];
    const sourceVersions = isObject(state.versions) ? state.versions : {};
    for (const version of Object.keys(sourceVersions)) {
      const record = sourceVersions[version];
      versions.push({
        version,
        packageSha256: readString(record, 'packageSha256', ''),
        directoryDigest: readString(record, 'directoryDigest', ''),
        profileDigest: readString(record, 'profileDigest', ''),
        installedAt: readString(record, 'installedAt', '')
      });
    }
    return {
      providerId: readString(state, 'providerId', ''),
      profileId: readString(state, 'profileId', ''),
      installStatus: readString(state, 'installStatus', 'not_installed'),
      activeVersion: readString(state, 'activeVersion', ''),
      previousVersion: readString(state, 'previousVersion', ''),
      versions,
      healthStatus: readString(state, 'healthStatus', 'unknown'),
      failureCategory: readString(state, 'failureCategory', ''),
      remediation: readString(state, 'remediation', ''),
      warnings: Array.isArray(state.warnings) ? state.warnings.slice() : [],
      updatedAt: safeInteger(state.updatedAt, 0)
    };
  }

  status(payload) {
    const providerId = readString(payload, 'providerId', readString(payload, 'profileId', ''));
    if (providerId.length > 0) {
      const state = this.providerState(providerId);
      return {
        ok: true,
        providerId,
        schemaVersion: this.state.schemaVersion,
        generation: this.state.generation,
        installStatus: state ? state.installStatus : 'not_installed',
        activeVersion: state ? state.activeVersion : '',
        previousVersion: state ? state.previousVersion : '',
        state: this.publicState(state),
        managerHealth: Object.assign({}, this.managerHealth),
        updatedAt: Date.now()
      };
    }
    return {
      ok: true,
      schemaVersion: this.state.schemaVersion,
      generation: this.state.generation,
      providers: Object.values(this.state.providers || {}).map((state) => this.publicState(state)),
      managerHealth: Object.assign({}, this.managerHealth),
      updatedAt: Date.now()
    };
  }

  isAvailable() {
    return this.trustRootValid && this.managerHealth.status !== 'unavailable';
  }

  prunePlans() {
    const now = Date.now();
    for (const pair of this.plans.entries()) {
      if (!pair[1] || pair[1].expiresAt <= now) {
        this.plans.delete(pair[0]);
      }
    }
  }

  createPlan(operation, detail) {
    this.prunePlans();
    const planId = crypto.randomBytes(18).toString('base64url');
    const now = Date.now();
    const plan = Object.assign({}, detail, {
      planId,
      operation,
      stateGeneration: safeInteger(this.state.generation, 0),
      platform: this.platform,
      architecture: this.architecture,
      createdAt: now,
      expiresAt: now + this.planTtlMs
    });
    this.plans.set(planId, plan);
    return plan;
  }

  consumePlan(payload, operation, providerId) {
    const planId = readString(payload, 'planId', '');
    const prefix = operation === 'install' ? 'install' : (operation === 'rollback' ? 'rollback' : 'remove');
    if (planId.length === 0 || !this.plans.has(planId)) {
      return {
        ok: false,
        failureCategory: prefix + '_plan_mismatch',
        message: 'Refresh the ' + operation + ' preview before confirming.'
      };
    }
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    this.prunePlans();
    if (!plan || plan.operation !== operation || plan.providerId !== providerId || plan.platform !== this.platform || plan.architecture !== this.architecture) {
      return {
        ok: false,
        failureCategory: prefix + '_plan_mismatch',
        message: 'The ' + operation + ' plan does not match this Provider or Bridge platform.'
      };
    }
    if (plan.expiresAt <= Date.now()) {
      return {
        ok: false,
        failureCategory: prefix + '_plan_expired',
        message: 'The ' + operation + ' plan expired.',
        remediation: 'Preview the operation again.'
      };
    }
    if (plan.stateGeneration !== safeInteger(this.state.generation, 0)) {
      return {
        ok: false,
        failureCategory: prefix + '_plan_stale',
        message: 'Managed Provider state changed after preview.',
        remediation: 'Refresh status and preview the operation again.'
      };
    }
    return { ok: true, plan };
  }

  verifyManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return { ok: false, failureCategory: 'manifest_invalid', message: 'Provider directory manifest must be an object.' };
    }
    const signature = readString(manifest, 'signature', '');
    if (signature.length === 0 || this.publicKeyPem.length === 0) {
      return { ok: false, failureCategory: 'signature_missing', message: 'Provider directory signature or trusted public key is missing.' };
    }
    let verified = false;
    try {
      verified = crypto.verify(
        'sha256',
        Buffer.from(canonicalJson(manifest), 'utf8'),
        this.publicKeyPem,
        Buffer.from(signature, 'base64')
      );
    } catch (error) {
      return { ok: false, failureCategory: 'signature_invalid', message: error instanceof Error ? error.message : String(error) };
    }
    if (!verified) {
      return { ok: false, failureCategory: 'signature_invalid', message: 'Provider directory signature verification failed.' };
    }
    const entries = Array.isArray(manifest.providers) ? manifest.providers.map(normalizeEntry) : [];
    const errors = [];
    for (const entry of entries) {
      if (entry.id.length === 0 || entry.displayName.length === 0) {
        errors.push('Provider entries require id and displayName.');
        continue;
      }
      const digest = sha256Text(canonicalJson(entry.profile));
      if (entry.profileSha256.length === 0 || digest.toLowerCase() !== entry.profileSha256.toLowerCase()) {
        errors.push('Provider ' + entry.id + ' profile SHA-256 does not match.');
      }
    }
    if (errors.length > 0) {
      return { ok: false, failureCategory: 'profile_digest_invalid', message: errors.join(' '), errors };
    }
    return {
      ok: true,
      manifestVersion: readString(manifest, 'version', ''),
      generatedAt: readString(manifest, 'generatedAt', ''),
      entries,
      digest: sha256Text(canonicalJson(manifest))
    };
  }

  async refresh(payload) {
    const url = readString(payload, 'url', readString(payload, 'catalogUrl', this.cachedUrl));
    if (url.length === 0) {
      return { ok: false, failureCategory: 'catalog_url_missing', message: 'Provider directory URL is required.' };
    }
    try {
      const manifest = await this.fetcher(url, DEFAULT_TIMEOUT_MS);
      const verification = this.verifyManifest(manifest);
      if (!verification.ok) {
        return verification;
      }
      this.cached = verification;
      this.cachedUrl = url;
      return this.list(payload);
    } catch (error) {
      return {
        ok: false,
        failureCategory: 'catalog_fetch_failed',
        message: error instanceof Error ? error.message : String(error),
        url
      };
    }
  }

  list(payload) {
    if (!this.cached) {
      return { ok: false, failureCategory: 'catalog_not_loaded', message: 'Refresh the provider directory first.', providers: [] };
    }
    const query = readString(payload, 'query', '').trim().toLowerCase();
    const providerId = readString(payload, 'providerId', '');
    const providers = [];
    for (const entry of this.cached.entries) {
      const platformSupported = entry.platforms.length === 0 || entry.platforms.includes(this.platform);
      const architectureSupported = !entry.managedBinary || !Array.isArray(entry.managedBinary.architectures) || entry.managedBinary.architectures.length === 0 || entry.managedBinary.architectures.includes(this.architecture);
      if (providerId.length > 0 && entry.id !== providerId) {
        continue;
      }
      if (query.length > 0 && entry.id.toLowerCase().indexOf(query) < 0 && entry.displayName.toLowerCase().indexOf(query) < 0 && entry.description.toLowerCase().indexOf(query) < 0) {
        continue;
      }
      const managedBinary = entry.managedBinary ? {
        packageFormat: readString(entry.managedBinary, 'packageFormat', ''),
        packageSha256: readString(entry.managedBinary, 'packageSha256', ''),
        architectures: Array.isArray(entry.managedBinary.architectures) ? entry.managedBinary.architectures.slice() : [],
        sizeBytes: safeInteger(entry.managedBinary.sizeBytes, 0)
      } : null;
      providers.push({
        id: entry.id,
        providerId: entry.id,
        displayName: entry.displayName,
        description: entry.description,
        version: entry.version,
        platforms: entry.platforms.slice(),
        minimumBridgeVersion: entry.minimumBridgeVersion,
        profileSha256: entry.profileSha256,
        managedBinary,
        available: platformSupported && architectureSupported,
        availabilityReason: !platformSupported ? 'platform_not_supported' : (!architectureSupported ? 'architecture_not_supported' : ''),
        installState: this.publicState(this.providerState(entry.id)),
        sourceUrl: this.cachedUrl
      });
    }
    return {
      ok: true,
      sourceUrl: this.cachedUrl,
      manifestVersion: this.cached.manifestVersion,
      manifestDigest: this.cached.digest,
      generatedAt: this.cached.generatedAt,
      providers,
      updatedAt: Date.now()
    };
  }

  async install(payload) {
    const providerId = readString(payload, 'providerId', '');
    if (!this.cached) {
      if (readBoolean(payload, 'confirm', false)) {
        return this.consumePlan(payload, 'install', providerId);
      }
      return { ok: false, failureCategory: 'catalog_not_loaded', message: 'Refresh the provider directory first.' };
    }
    const entry = this.cached.entries.find((item) => item.id === providerId);
    if (!entry) {
      return { ok: false, failureCategory: 'provider_not_found', message: 'Provider directory entry was not found.' };
    }
    if (entry.platforms.length > 0 && !entry.platforms.includes(this.platform)) {
      return { ok: false, failureCategory: 'platform_not_supported', message: 'Provider does not support this platform.' };
    }
    if (entry.managedBinary && Array.isArray(entry.managedBinary.architectures) && entry.managedBinary.architectures.length > 0 && !entry.managedBinary.architectures.includes(this.architecture)) {
      return { ok: false, failureCategory: 'architecture_not_supported', message: 'Provider package does not support this architecture.' };
    }
    const profileId = readString(entry.profile, 'profileId', entry.id);
    const existingProfile = this.getProfile ? this.getProfile(profileId) : null;
    if (existingProfile && (
      readBoolean(existingProfile, 'managedProvider', false) !== true ||
      readString(existingProfile, 'managedProviderId', '') !== entry.id
    )) {
      return {
        ok: false,
        failureCategory: 'managed_profile_conflict',
        message: 'A non-managed Provider profile already uses this profile id.',
        remediation: 'Choose a different profile id or remove the conflicting custom profile explicitly.'
      };
    }
    if (!readBoolean(payload, 'confirm', false)) {
      const current = this.providerState(entry.id);
      const plan = this.createPlan('install', {
        providerId: entry.id,
        profileId,
        version: entry.version,
        activeVersion: current ? current.activeVersion : '',
        previousVersion: current ? current.previousVersion : '',
        manifestDigest: this.cached.digest,
        packageSha256: entry.managedBinary ? readString(entry.managedBinary, 'packageSha256', '') : '',
        targetPath: path.join(this.providersDirectory, safeSegment(entry.id), safeSegment(entry.version)),
        profileDigest: entry.profileSha256,
        profile: Object.assign({}, entry.profile, {
          profileId,
          source: 'remote_directory',
          sourceUrl: this.cachedUrl,
          sourceVersion: entry.version,
          sourceDigest: entry.profileSha256
        })
      });
      return {
        ok: true,
        preview: true,
        confirmed: false,
        planId: plan.planId,
        expiresAt: new Date(plan.expiresAt).toISOString(),
        providerId: entry.id,
        profileId,
        version: entry.version,
        activeVersion: current ? current.activeVersion : '',
        previousVersion: current ? current.previousVersion : '',
        manifestDigest: this.cached.digest,
        packageSha256: plan.packageSha256,
        targetPath: plan.targetPath,
        installStatus: 'preview',
        profile: publicProfilePreview(plan.profile),
        warnings: [],
        updatedAt: Date.now()
      };
    }
    const consumed = this.consumePlan(payload, 'install', entry.id);
    if (!consumed.ok) {
      return consumed;
    }
    const plan = consumed.plan;
    if (!this.upsertProfile) {
      return { ok: false, failureCategory: 'profile_store_unavailable', message: 'Provider profile store is unavailable.' };
    }
    if (
      this.cached.digest !== plan.manifestDigest ||
      entry.version !== plan.version ||
      entry.profileSha256 !== plan.profileDigest ||
      (entry.managedBinary ? readString(entry.managedBinary, 'packageSha256', '') : '') !== plan.packageSha256
    ) {
      return { ok: false, failureCategory: 'manifest_changed', message: 'Provider directory changed after preview.', remediation: 'Refresh and preview the install again.' };
    }
    let temporaryDirectory = '';
    let installedDirectory = '';
    let backupDirectory = '';
    const previousState = this.providerState(entry.id);
    const previousProfile = this.getProfile ? this.getProfile(plan.profileId) : null;
    let managedEntryPath = '';
    const restoreInstalledFiles = () => {
      if (installedDirectory.length > 0 && fs.existsSync(installedDirectory)) {
        fs.rmSync(installedDirectory, { recursive: true, force: true });
      }
      if (backupDirectory.length > 0 && fs.existsSync(backupDirectory) && !fs.existsSync(plan.targetPath)) {
        fs.renameSync(backupDirectory, plan.targetPath);
      }
    };
    try {
      if (entry.managedBinary) {
        const packageUrl = readString(entry.managedBinary, 'packageUrl', '');
        const packageFormat = readString(entry.managedBinary, 'packageFormat', '').toLowerCase();
        const packageSha256 = readString(entry.managedBinary, 'packageSha256', '').toLowerCase();
        const entryPath = readString(entry.managedBinary, 'entryPath', '');
        if (!['zip', 'tgz'].includes(packageFormat) || packageUrl.length === 0 || packageSha256.length !== 64 || !archiveEntrySafe(entryPath)) {
          throw new Error('Managed package metadata is invalid.');
        }
        fs.mkdirSync(path.dirname(plan.targetPath), { recursive: true });
        temporaryDirectory = plan.targetPath + '.tmp-' + process.pid + '-' + Date.now();
        fs.mkdirSync(temporaryDirectory, { recursive: true });
        const packageBuffer = await this.packageFetcher(packageUrl, DEFAULT_TIMEOUT_MS, MAX_PACKAGE_BYTES, 0);
        const archivePath = path.join(temporaryDirectory, 'package.' + packageFormat);
        fs.writeFileSync(archivePath, packageBuffer);
        if (sha256File(archivePath).toLowerCase() !== packageSha256) { throw new Error('Managed package SHA-256 does not match.'); }
        listArchive(archivePath);
        const extractPath = path.join(temporaryDirectory, 'content');
        fs.mkdirSync(extractPath, { recursive: true });
        const extracted = childProcess.spawnSync(archiveTool(), ['-xf', archivePath, '-C', extractPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
        if (extracted.status !== 0) { throw new Error('Managed package extraction failed: ' + String(extracted.stderr || '').trim()); }
        directorySizeAndValidate(extractPath);
        const entryAbsolutePath = path.resolve(extractPath, entryPath);
        if (!pathInside(extractPath, entryAbsolutePath) || !fs.existsSync(entryAbsolutePath) || !fs.statSync(entryAbsolutePath).isFile()) { throw new Error('Managed package entry file is missing.'); }
        if (process.platform !== 'win32') { fs.chmodSync(entryAbsolutePath, fs.statSync(entryAbsolutePath).mode | 0o100); }
        if (fs.existsSync(plan.targetPath)) {
          backupDirectory = plan.targetPath + '.backup-' + crypto.randomBytes(8).toString('hex');
          fs.renameSync(plan.targetPath, backupDirectory);
        }
        fs.renameSync(extractPath, plan.targetPath);
        installedDirectory = plan.targetPath;
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
        temporaryDirectory = '';
        plan.profile.binary = path.join(plan.targetPath, entryPath);
        managedEntryPath = entryPath.replace(/\\/g, '/');
      }
      plan.profile.managedProvider = true;
      plan.profile.managedProviderId = entry.id;
      plan.profile.managedVersion = entry.version;
      plan.profile.managedPackageSha256 = plan.packageSha256;
      plan.profile.managedInstalledAt = new Date().toISOString();
    } catch (error) {
      if (temporaryDirectory.length > 0) { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
      restoreInstalledFiles();
      return { ok: false, failureCategory: 'managed_install_failed', message: error instanceof Error ? error.message : String(error), remediation: 'Verify the signed catalog package metadata and retry.', providerId: entry.id, version: entry.version, updatedAt: Date.now() };
    }
    const result = this.upsertProfile(plan.profile);
    if (result && result.code) {
      restoreInstalledFiles();
      return Object.assign({ ok: false, failureCategory: result.code }, result);
    }
    if (this.testProfile) {
      const test = await this.testProfile({ profileId: plan.profile.profileId, runCommand: Boolean(entry.managedBinary), timeoutMs: 3000 });
      if (!test || test.ok !== true) {
        if (previousProfile) { this.upsertProfile(previousProfile); } else { this.deleteProfile({ profileId: plan.profile.profileId }); }
        restoreInstalledFiles();
        return { ok: false, failureCategory: 'activation_test_failed', message: test && test.message ? test.message : 'Provider runtime activation test failed.', remediation: 'Keep the previous version and inspect Provider diagnostics.', providerId: entry.id, version: entry.version, updatedAt: Date.now() };
      }
    }
    let installedDigest = '';
    if (installedDirectory.length > 0) {
      installedDigest = directoryDigest(installedDirectory);
    }
    const previousVersion = previousState && previousState.activeVersion && previousState.activeVersion !== entry.version
      ? previousState.activeVersion
      : (previousState ? previousState.previousVersion : '');
    const versions = {};
    versions[entry.version] = {
      version: entry.version,
      entryPath: managedEntryPath,
      packageSha256: plan.packageSha256,
      directoryDigest: installedDigest,
      profileDigest: entry.profileSha256,
      installedAt: plan.profile.managedInstalledAt
    };
    if (previousVersion.length > 0 && previousState && isObject(previousState.versions) && isObject(previousState.versions[previousVersion])) {
      versions[previousVersion] = previousState.versions[previousVersion];
    }
    const state = {
      providerId: entry.id,
      profileId: plan.profile.profileId,
      installStatus: 'installed',
      activeVersion: entry.version,
      previousVersion,
      versions,
      healthStatus: 'healthy',
      failureCategory: '',
      remediation: '',
      warnings: [],
      updatedAt: Date.now()
    };
    const previousDirectoryState = JSON.parse(JSON.stringify(this.state));
    this.state.providers[entry.id] = state;
    try {
      this.saveState(true);
    } catch (_error) {
      this.state = previousDirectoryState;
      if (previousProfile) { this.upsertProfile(previousProfile); } else if (this.deleteProfile) { this.deleteProfile({ profileId: plan.profile.profileId }); }
      restoreInstalledFiles();
      return { ok: false, failureCategory: 'provider_directory_state_write_failed', message: 'Managed Provider state could not be saved.', remediation: this.managerHealth.remediation };
    }
    if (backupDirectory.length > 0 && fs.existsSync(backupDirectory)) {
      fs.rmSync(backupDirectory, { recursive: true, force: true });
    }
    const cleanupWarnings = this.cleanupVersions(entry.id, Object.keys(versions));
    return { ok: true, preview: false, confirmed: true, planId: plan.planId, providerId: entry.id, profileId: plan.profile.profileId, version: entry.version, activeVersion: state.activeVersion, previousVersion: state.previousVersion, manifestDigest: this.cached.digest, packageSha256: plan.packageSha256, installStatus: state.installStatus, warnings: cleanupWarnings, result, updatedAt: Date.now() };
  }

  cleanupVersions(providerId, versions) {
    const root = path.join(this.providersDirectory, safeSegment(providerId));
    const warnings = [];
    if (!fs.existsSync(root)) { return warnings; }
    try {
      const providersRealPath = fs.realpathSync(this.providersDirectory);
      const rootRealPath = fs.realpathSync(root);
      if (!pathInside(providersRealPath, rootRealPath) || rootRealPath === providersRealPath) {
        return ['managed_path_invalid'];
      }
    } catch (_error) {
      return ['managed_path_invalid'];
    }
    for (const name of fs.readdirSync(root)) {
      if (versions.includes(name)) { continue; }
      try {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
      } catch (_error) {
        warnings.push('managed_version_cleanup_failed:' + name);
      }
    }
    return warnings;
  }

  async rollback(payload) {
    const providerId = readString(payload, 'providerId', '');
    const state = this.providerState(providerId);
    if (!state || !state.previousVersion) { return { ok: false, failureCategory: 'rollback_unavailable', message: 'No previous managed Provider version is available.' }; }
    const ownership = this.validateOwnership(state);
    if (!ownership.ok) {
      return ownership;
    }
    const targetRecord = isObject(state.versions) ? state.versions[state.previousVersion] : null;
    if (!isObject(targetRecord)) {
      return { ok: false, failureCategory: 'rollback_files_missing', message: 'Previous Provider version metadata is missing.' };
    }
    if (!readBoolean(payload, 'confirm', false)) {
      const plan = this.createPlan('rollback', {
        providerId,
        profileId: state.profileId,
        activeVersion: state.activeVersion,
        targetVersion: state.previousVersion,
        packageSha256: readString(targetRecord, 'packageSha256', ''),
        directoryDigest: readString(targetRecord, 'directoryDigest', ''),
        entryPath: readString(targetRecord, 'entryPath', ''),
        stateDigest: sha256Text(canonicalJson(state))
      });
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, expiresAt: new Date(plan.expiresAt).toISOString(), providerId, profileId: state.profileId, activeVersion: state.activeVersion, previousVersion: state.previousVersion, targetVersion: state.previousVersion, installStatus: 'rollback_preview', updatedAt: Date.now() };
    }
    const consumed = this.consumePlan(payload, 'rollback', providerId);
    if (!consumed.ok) {
      return consumed;
    }
    const plan = consumed.plan;
    if (
      plan.profileId !== state.profileId ||
      plan.activeVersion !== state.activeVersion ||
      plan.targetVersion !== state.previousVersion ||
      plan.packageSha256 !== readString(targetRecord, 'packageSha256', '') ||
      plan.directoryDigest !== readString(targetRecord, 'directoryDigest', '') ||
      plan.entryPath !== readString(targetRecord, 'entryPath', '') ||
      plan.stateDigest !== sha256Text(canonicalJson(state))
    ) {
      return { ok: false, failureCategory: 'rollback_plan_stale', message: 'Managed Provider versions changed after preview.', remediation: 'Refresh status and preview rollback again.' };
    }
    const validated = this.validateVersionEntry(providerId, state.previousVersion, targetRecord);
    if (!validated.ok) {
      return validated;
    }
    if (!this.upsertProfile || !this.testProfile) {
      return { ok: false, failureCategory: 'profile_store_unavailable', message: 'Provider profile runtime test is unavailable.' };
    }
    const currentVersion = state.activeVersion;
    const currentProfile = ownership.profile;
    const nextProfile = Object.assign({}, currentProfile, {
      binary: validated.entryAbsolutePath,
      managedVersion: state.previousVersion,
      managedPackageSha256: readString(targetRecord, 'packageSha256', ''),
      sourceVersion: state.previousVersion,
      sourceDigest: readString(targetRecord, 'profileDigest', '')
    });
    const result = this.upsertProfile(nextProfile);
    if (result && result.code) { return Object.assign({ ok: false, failureCategory: result.code }, result); }
    const test = await this.testProfile({ profileId: state.profileId, runCommand: true, timeoutMs: 3000 });
    if (!test || test.ok !== true) {
      this.upsertProfile(currentProfile);
      return {
        ok: false,
        failureCategory: 'activation_test_failed',
        message: test && typeof test.message === 'string' ? test.message : 'Previous Provider version failed the runtime activation test.',
        remediation: 'The current version was restored; inspect Provider diagnostics before retrying.'
      };
    }
    const previousDirectoryState = JSON.parse(JSON.stringify(this.state));
    state.activeVersion = state.previousVersion;
    state.previousVersion = currentVersion;
    state.installStatus = 'rolled_back';
    state.healthStatus = 'healthy';
    state.failureCategory = '';
    state.remediation = '';
    state.warnings = [];
    state.updatedAt = Date.now();
    try {
      this.saveState(true);
    } catch (_error) {
      this.state = previousDirectoryState;
      this.upsertProfile(currentProfile);
      return { ok: false, failureCategory: 'provider_directory_state_write_failed', message: 'Managed Provider rollback state could not be saved.', remediation: this.managerHealth.remediation };
    }
    return { ok: true, preview: false, confirmed: true, planId: plan.planId, providerId, profileId: state.profileId, activeVersion: state.activeVersion, previousVersion: state.previousVersion, installStatus: 'rolled_back', result, updatedAt: Date.now() };
  }

  remove(payload) {
    const requestedProfileId = readString(payload, 'profileId', '');
    const requestedProviderId = readString(payload, 'providerId', '');
    let state = requestedProviderId.length > 0 ? this.providerState(requestedProviderId) : null;
    if (!state && requestedProfileId.length > 0) {
      for (const providerId of Object.keys(this.state.providers || {})) {
        if (readString(this.state.providers[providerId], 'profileId', '') === requestedProfileId) {
          state = this.state.providers[providerId];
          break;
        }
      }
    }
    if (!state) {
      return { ok: false, failureCategory: 'managed_provider_required', message: 'Only a Provider registered in managed directory state can be removed through this operation.' };
    }
    const providerId = state.providerId;
    const profileId = state.profileId;
    if (profileId.length === 0) {
      return { ok: false, failureCategory: 'profile_id_missing', message: 'Provider profile id is required.' };
    }
    const ownership = this.validateOwnership(state);
    if (!ownership.ok) {
      return ownership;
    }
    const removalRoot = this.validateProviderRootForRemoval(providerId);
    if (!removalRoot.ok) {
      return removalRoot;
    }
    if (!readBoolean(payload, 'confirm', false)) {
      const plan = this.createPlan('remove', {
        providerId,
        profileId,
        activeVersion: state.activeVersion,
        previousVersion: state.previousVersion,
        stateDigest: sha256Text(canonicalJson(state))
      });
      return { ok: true, preview: true, confirmed: false, planId: plan.planId, expiresAt: new Date(plan.expiresAt).toISOString(), providerId, profileId, activeVersion: state.activeVersion, previousVersion: state.previousVersion, installStatus: 'remove_preview', updatedAt: Date.now() };
    }
    const consumed = this.consumePlan(payload, 'remove', providerId);
    if (!consumed.ok) {
      return consumed;
    }
    const plan = consumed.plan;
    if (
      plan.profileId !== profileId ||
      plan.activeVersion !== state.activeVersion ||
      plan.previousVersion !== state.previousVersion ||
      plan.stateDigest !== sha256Text(canonicalJson(state))
    ) {
      return { ok: false, failureCategory: 'remove_plan_stale', message: 'Managed Provider state changed after preview.', remediation: 'Refresh status and preview removal again.' };
    }
    if (!this.deleteProfile) {
      return { ok: false, failureCategory: 'profile_store_unavailable', message: 'Provider profile store is unavailable.' };
    }
    const result = this.deleteProfile({ profileId });
    if (result && result.code) {
      return Object.assign({ ok: false, failureCategory: result.code }, result);
    }
    const previousDirectoryState = JSON.parse(JSON.stringify(this.state));
    delete this.state.providers[providerId];
    try {
      this.saveState(true);
    } catch (_error) {
      this.state = previousDirectoryState;
      if (this.upsertProfile) {
        this.upsertProfile(ownership.profile);
      }
      return { ok: false, failureCategory: 'provider_directory_state_write_failed', message: 'Managed Provider removal state could not be saved.', remediation: this.managerHealth.remediation };
    }
    const warnings = [];
    if (removalRoot.exists) {
      try {
        fs.rmSync(removalRoot.providerRoot, { recursive: true, force: true });
      } catch (_error) {
        warnings.push('managed_provider_directory_cleanup_failed');
      }
    }
    return Object.assign({ ok: true, preview: false, confirmed: true, planId: plan.planId, providerId, profileId, installStatus: 'removed', warnings, updatedAt: Date.now() }, result);
  }

  validateOwnership(state) {
    if (!isObject(state) || !this.getProfile) {
      return { ok: false, failureCategory: 'profile_store_unavailable', message: 'Provider profile storage is unavailable.' };
    }
    const profile = this.getProfile(state.profileId);
    if (
      !profile ||
      readBoolean(profile, 'managedProvider', false) !== true ||
      readString(profile, 'managedProviderId', '') !== state.providerId ||
      readString(profile, 'profileId', '') !== state.profileId
    ) {
      return {
        ok: false,
        failureCategory: 'managed_provider_required',
        message: 'Provider profile ownership does not match managed directory state.'
      };
    }
    return { ok: true, profile };
  }

  validateVersionEntry(providerId, version, record) {
    const entryPath = readString(record, 'entryPath', '');
    if (!archiveEntrySafe(entryPath)) {
      return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider entry path is invalid.' };
    }
    const providerRoot = path.join(this.providersDirectory, safeSegment(providerId));
    const versionRoot = path.join(providerRoot, safeSegment(version));
    if (!fs.existsSync(providerRoot) || !fs.existsSync(versionRoot)) {
      return { ok: false, failureCategory: 'rollback_files_missing', message: 'Managed Provider version files are missing.' };
    }
    try {
      const providersRealPath = fs.realpathSync(this.providersDirectory);
      const providerRealPath = fs.realpathSync(providerRoot);
      const versionRealPath = fs.realpathSync(versionRoot);
      if (!pathInside(providersRealPath, providerRealPath) || providerRealPath === providersRealPath || !pathInside(providerRealPath, versionRealPath)) {
        return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider version directory escaped its ownership root.' };
      }
      const entryCandidate = path.resolve(versionRoot, entryPath);
      if (!fs.existsSync(entryCandidate) || !fs.statSync(entryCandidate).isFile()) {
        return { ok: false, failureCategory: 'rollback_files_missing', message: 'Managed Provider entry file is missing.' };
      }
      const entryRealPath = fs.realpathSync(entryCandidate);
      if (!pathInside(versionRealPath, entryRealPath)) {
        return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider entry file escaped its version directory.' };
      }
      const expectedDigest = readString(record, 'directoryDigest', '');
      if (expectedDigest.length > 0 && directoryDigest(versionRealPath) !== expectedDigest) {
        return { ok: false, failureCategory: 'managed_digest_mismatch', message: 'Managed Provider directory digest does not match installed state.' };
      }
      return {
        ok: true,
        providerRoot: providerRealPath,
        versionRoot: versionRealPath,
        entryAbsolutePath: entryRealPath
      };
    } catch (_error) {
      return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider path could not be validated.' };
    }
  }

  validateProviderRootForRemoval(providerId) {
    const providerRoot = path.join(this.providersDirectory, safeSegment(providerId));
    if (!pathInside(this.providersDirectory, providerRoot) || path.resolve(providerRoot) === path.resolve(this.providersDirectory)) {
      return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider root is invalid.' };
    }
    if (!fs.existsSync(providerRoot)) {
      return { ok: true, exists: false, providerRoot };
    }
    try {
      const providersRealPath = fs.realpathSync(this.providersDirectory);
      const providerRealPath = fs.realpathSync(providerRoot);
      if (!pathInside(providersRealPath, providerRealPath) || providerRealPath === providersRealPath) {
        return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider root escaped the Bridge Provider directory.' };
      }
      return { ok: true, exists: true, providerRoot };
    } catch (_error) {
      return { ok: false, failureCategory: 'managed_path_invalid', message: 'Managed Provider root could not be validated.' };
    }
  }

  async reconcile() {
    const providerIds = Object.keys(this.state.providers || {});
    let changed = false;
    const results = [];
    for (const providerId of providerIds) {
      const state = this.state.providers[providerId];
      const warnings = [];
      let failureCategory = '';
      let remediation = '';
      const ownership = this.validateOwnership(state);
      if (!ownership.ok) {
        failureCategory = ownership.failureCategory;
        remediation = 'Restore the managed profile or remove the stale directory state after review.';
      } else {
        const activeRecord = isObject(state.versions) ? state.versions[state.activeVersion] : null;
        if (!isObject(activeRecord)) {
          failureCategory = 'managed_version_state_missing';
          remediation = 'Reinstall the managed Provider from a verified catalog.';
        } else if (readString(activeRecord, 'entryPath', '').length > 0) {
          const activeValidation = this.validateVersionEntry(providerId, state.activeVersion, activeRecord);
          if (!activeValidation.ok) {
            failureCategory = activeValidation.failureCategory;
            remediation = 'Reinstall or rollback the managed Provider after reviewing the directory state.';
          } else {
            const profileBinary = readString(ownership.profile, 'binary', '');
            try {
              if (profileBinary.length === 0 || fs.realpathSync(profileBinary) !== activeValidation.entryAbsolutePath) {
                failureCategory = 'managed_profile_entry_mismatch';
                remediation = 'Restore the managed profile entry path from a verified install.';
              }
            } catch (_error) {
              failureCategory = 'managed_profile_entry_mismatch';
              remediation = 'Restore the managed profile entry path from a verified install.';
            }
          }
        }
        if (failureCategory.length === 0 && this.testProfile) {
          const test = await this.testProfile({ profileId: state.profileId, runCommand: false, timeoutMs: 3000 });
          if (!test || test.ok !== true) {
            failureCategory = test
              ? readString(test, 'failureCategory', readString(test, 'runtimeFailureCategory', 'managed_runtime_degraded'))
              : 'managed_runtime_degraded';
            remediation = test
              ? readString(test, 'remediation', 'Inspect Provider runtime diagnostics and repair the managed installation.')
              : 'Inspect Provider runtime diagnostics and repair the managed installation.';
            if (test && Array.isArray(test.warnings)) {
              for (const warning of test.warnings) {
                if (typeof warning === 'string' && !warnings.includes(warning)) {
                  warnings.push(warning);
                }
              }
            }
          }
        }
        if (state.previousVersion.length > 0) {
          const previousRecord = isObject(state.versions) ? state.versions[state.previousVersion] : null;
          if (!isObject(previousRecord)) {
            warnings.push('previous_version_state_missing');
          } else if (readString(previousRecord, 'entryPath', '').length > 0) {
            const previousValidation = this.validateVersionEntry(providerId, state.previousVersion, previousRecord);
            if (!previousValidation.ok) {
              warnings.push('previous_version_invalid:' + previousValidation.failureCategory);
            }
          }
        }
      }
      const nextStatus = failureCategory.length > 0 ? 'degraded' : 'healthy';
      const nextInstallStatus = failureCategory.length > 0 ? 'degraded' : 'installed';
      if (
        state.healthStatus !== nextStatus ||
        state.installStatus !== nextInstallStatus ||
        state.failureCategory !== failureCategory ||
        state.remediation !== remediation ||
        JSON.stringify(state.warnings || []) !== JSON.stringify(warnings)
      ) {
        state.healthStatus = nextStatus;
        state.installStatus = nextInstallStatus;
        state.failureCategory = failureCategory;
        state.remediation = remediation;
        state.warnings = warnings;
        state.updatedAt = Date.now();
        changed = true;
      }
      results.push({
        providerId,
        profileId: state.profileId,
        healthStatus: nextStatus,
        failureCategory,
        warnings
      });
    }
    if (changed) {
      try {
        this.saveState(true);
      } catch (_error) {
        return {
          ok: false,
          failureCategory: 'provider_directory_state_write_failed',
          message: this.managerHealth.message,
          remediation: this.managerHealth.remediation,
          providers: results
        };
      }
    }
    return {
      ok: true,
      reconciled: providerIds.length,
      generation: this.state.generation,
      providers: results,
      updatedAt: Date.now()
    };
  }
}

module.exports = {
  ProviderDirectoryManager,
  canonicalJson,
  fetchJson,
  sha256Text,
  directoryDigest,
  PROVIDER_DIRECTORY_STATE_SCHEMA_VERSION,
  BUILTIN_PROVIDER_CATALOG_PUBLIC_KEY
};
