'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const packageInfo = require('../package.json');
const { writeJsonFileAtomic } = require('./daemon-store');

const DEFAULT_PACKAGE_NAME = '@dlzz/agent-bridge';
const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_METADATA_LIMIT_BYTES = 4 * 1024 * 1024;
const DEFAULT_TARBALL_LIMIT_BYTES = 128 * 1024 * 1024;

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

function safeVersionSegment(value) {
  const source = typeof value === 'string' ? value : '';
  const normalized = source.replace(/^v/i, '').replace(/[^0-9A-Za-z._-]+/g, '-');
  return normalized.length > 0 ? normalized.substring(0, 120) : 'unknown';
}

function parseSemver(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(source);
  if (!match) {
    return null;
  }
  return {
    raw: source.replace(/^v/i, ''),
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }
  if (left.length === 0) {
    return 1;
  }
  if (right.length === 0) {
    return -1;
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (typeof left[index] === 'undefined') {
      return -1;
    }
    if (typeof right[index] === 'undefined') {
      return 1;
    }
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number.parseInt(left[index], 10) - Number.parseInt(right[index], 10);
      if (difference !== 0) {
        return difference > 0 ? 1 : -1;
      }
      continue;
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    if (left[index] !== right[index]) {
      return left[index] > right[index] ? 1 : -1;
    }
  }
  return 0;
}

function compareVersions(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  if (!left || !right) {
    return null;
  }
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] > right[key] ? 1 : -1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function loopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function validateUpdateUrl(value, purpose) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    return {
      ok: false,
      code: 'update_url_invalid',
      message: 'Invalid ' + purpose + ' URL.'
    };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return {
      ok: false,
      code: 'update_url_credentials_rejected',
      message: purpose + ' URL must not contain credentials.'
    };
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopbackHostname(parsed.hostname))) {
    return {
      ok: false,
      code: 'update_url_insecure',
      message: purpose + ' URL must use HTTPS; HTTP is allowed only for loopback smoke servers.'
    };
  }
  return { ok: true, url: parsed };
}

function requestBuffer(urlValue, options) {
  const config = options && typeof options === 'object' ? options : {};
  const timeoutMs = typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBytes = typeof config.maxBytes === 'number' && config.maxBytes > 0 ? config.maxBytes : DEFAULT_METADATA_LIMIT_BYTES;
  const redirectsRemaining = typeof config.redirectsRemaining === 'number' ? config.redirectsRemaining : 5;
  const validation = validateUpdateUrl(urlValue, readString(config, 'purpose', 'update'));
  if (!validation.ok) {
    return Promise.reject(Object.assign(new Error(validation.message), { code: validation.code }));
  }
  const parsed = validation.url;
  const transport = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(parsed, {
      method: 'GET',
      headers: {
        accept: readString(config, 'accept', 'application/json'),
        'user-agent': 'ngf-agent-bridge-updater/' + String(packageInfo.version || '0.0.0')
      }
    }, (response) => {
      const statusCode = response.statusCode || 0;
      if (statusCode >= 300 && statusCode < 400 && typeof response.headers.location === 'string') {
        response.resume();
        if (redirectsRemaining <= 0) {
          reject(Object.assign(new Error('Update download exceeded redirect limit.'), { code: 'update_redirect_limit' }));
          return;
        }
        const redirectUrl = new URL(response.headers.location, parsed).toString();
        requestBuffer(redirectUrl, Object.assign({}, config, {
          redirectsRemaining: redirectsRemaining - 1
        })).then(resolve, reject);
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        const error = new Error('Update request returned HTTP ' + String(statusCode) + '.');
        error.code = statusCode === 404 ? 'update_not_found' : (statusCode === 429 ? 'update_rate_limited' : 'update_registry_error');
        error.statusCode = statusCode;
        reject(error);
        return;
      }
      const chunks = [];
      let totalBytes = 0;
      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          request.destroy(Object.assign(new Error('Update response exceeded size limit.'), { code: 'update_size_limit' }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
    request.on('error', reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(Object.assign(new Error('Update request timed out.'), { code: 'update_timeout' }));
    });
    request.end();
  });
}

async function fetchJson(urlValue, options) {
  const buffer = await requestBuffer(urlValue, Object.assign({}, options, {
    accept: 'application/json',
    maxBytes: options && options.maxBytes ? options.maxBytes : DEFAULT_METADATA_LIMIT_BYTES
  }));
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    const nextError = new Error('Update registry returned invalid JSON: ' + (error instanceof Error ? error.message : String(error)));
    nextError.code = 'update_registry_invalid_json';
    throw nextError;
  }
}

function defaultCommandRunner(command, args, options) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options && options.cwd ? options.cwd : process.cwd(),
      env: options && options.env ? options.env : process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timeoutMs = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : 5 * 60 * 1000;
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill('SIGTERM');
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: Buffer.concat(stdout).toString('utf8').substring(0, 256 * 1024),
        stderr: (error instanceof Error ? error.message : String(error)).substring(0, 256 * 1024),
        durationMs: Date.now() - startedAt
      });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: typeof code === 'number' ? code : -1,
        stdout: Buffer.concat(stdout).toString('utf8').substring(0, 256 * 1024),
        stderr: Buffer.concat(stderr).toString('utf8').substring(0, 256 * 1024),
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function npmCommandSpec(options) {
  const config = options && typeof options === 'object' ? options : {};
  if (typeof config.npmCommand === 'string' && config.npmCommand.length > 0) {
    return { command: config.npmCommand, prefixArgs: [] };
  }
  if (typeof process.env.npm_execpath === 'string' && process.env.npm_execpath.length > 0 && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, prefixArgs: [process.env.npm_execpath] };
  }
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: []
  };
}

function parseTarOctal(buffer, start, length) {
  const text = buffer.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
  if (text.length === 0) {
    return 0;
  }
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

function readTarString(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
}

function inspectNpmTarball(buffer) {
  let tar;
  try {
    tar = zlib.gunzipSync(buffer);
  } catch (error) {
    const nextError = new Error('Update package is not a valid gzip tarball: ' + (error instanceof Error ? error.message : String(error)));
    nextError.code = 'update_tarball_invalid';
    throw nextError;
  }
  let offset = 0;
  let packageManifest = null;
  while (offset + 512 <= tar.length) {
    const name = readTarString(tar, offset, 100);
    const prefix = readTarString(tar, offset + 345, 155);
    const fullName = prefix.length > 0 ? prefix + '/' + name : name;
    const normalizedName = fullName.replace(/\\/g, '/');
    const typeFlag = readTarString(tar, offset + 156, 1);
    if (normalizedName.startsWith('/') || /^[A-Za-z]:\//.test(normalizedName) ||
      normalizedName.split('/').includes('..') ||
      (normalizedName.length > 0 && normalizedName !== 'package' && !normalizedName.startsWith('package/'))) {
      const error = new Error('Update tarball contains an unsafe package path: ' + normalizedName);
      error.code = 'update_tarball_unsafe_path';
      throw error;
    }
    if (typeFlag === '1' || typeFlag === '2') {
      const error = new Error('Update tarball contains a link entry that is not accepted: ' + normalizedName);
      error.code = 'update_tarball_link_rejected';
      throw error;
    }
    const size = parseTarOctal(tar, offset + 124, 12);
    if (size < 0 || offset + 512 + size > tar.length) {
      const error = new Error('Update tarball contains an invalid entry size.');
      error.code = 'update_tarball_invalid';
      throw error;
    }
    if (normalizedName === 'package/package.json') {
      const text = tar.subarray(offset + 512, offset + 512 + size).toString('utf8');
      try {
        const parsed = JSON.parse(text);
        packageManifest = {
          name: typeof parsed.name === 'string' ? parsed.name : '',
          version: typeof parsed.version === 'string' ? parsed.version : '',
          packageJson: parsed
        };
      } catch (error) {
        const nextError = new Error('Update tarball package.json is invalid: ' + (error instanceof Error ? error.message : String(error)));
        nextError.code = 'update_package_manifest_invalid';
        throw nextError;
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (packageManifest) {
    return packageManifest;
  }
  const error = new Error('Update tarball does not contain package/package.json.');
  error.code = 'update_package_manifest_missing';
  throw error;
}

function verifyIntegrity(buffer, integrity) {
  const tokens = typeof integrity === 'string' ? integrity.trim().split(/\s+/).filter(Boolean) : [];
  const supported = ['sha512', 'sha384', 'sha256', 'sha1'];
  for (const algorithm of supported) {
    const token = tokens.find((item) => item.startsWith(algorithm + '-'));
    if (!token) {
      continue;
    }
    const expectedText = token.substring(algorithm.length + 1).split('?')[0];
    let expected;
    try {
      expected = Buffer.from(expectedText, 'base64');
    } catch (_error) {
      return { ok: false, algorithm, code: 'update_integrity_invalid' };
    }
    const actual = crypto.createHash(algorithm).update(buffer).digest();
    return {
      ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual),
      algorithm,
      expected: expectedText,
      actual: actual.toString('base64'),
      code: 'update_integrity_mismatch'
    };
  }
  return {
    ok: false,
    algorithm: '',
    code: 'update_integrity_missing'
  };
}

function findGitAncestor(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return '';
    }
    current = parent;
  }
}

function sanitizeCommandResult(result, command, args) {
  return {
    command: command + ' ' + args.map((item) => JSON.stringify(item)).join(' '),
    exitCode: result && typeof result.exitCode === 'number' ? result.exitCode : -1,
    stdout: result && typeof result.stdout === 'string' ? result.stdout : '',
    stderr: result && typeof result.stderr === 'string' ? result.stderr : '',
    durationMs: result && typeof result.durationMs === 'number' ? result.durationMs : 0
  };
}

function failure(action, category, message, remediation, extra) {
  return Object.assign({
    ok: false,
    action,
    failureCategory: category,
    code: category,
    message,
    remediation: typeof remediation === 'string' ? remediation : '',
    updatedAt: nowIso()
  }, extra && typeof extra === 'object' ? extra : {});
}

class DaemonUpdateManager {
  constructor(store, options) {
    const config = options && typeof options === 'object' ? options : {};
    this.store = store;
    this.packageName = readString(config, 'packageName', DEFAULT_PACKAGE_NAME);
    this.packageRoot = path.resolve(readString(config, 'packageRoot', path.join(__dirname, '..')));
    this.currentVersion = readString(config, 'currentVersion', String(packageInfo.version || '0.0.0'));
    this.registryUrl = readString(config, 'registryUrl', process.env.AGENT_BRIDGE_UPDATE_REGISTRY_URL || DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
    this.requestTimeoutMs = typeof config.requestTimeoutMs === 'number' ? config.requestTimeoutMs : DEFAULT_TIMEOUT_MS;
    this.fetchJson = typeof config.fetchJson === 'function' ? config.fetchJson : fetchJson;
    this.downloadBuffer = typeof config.downloadBuffer === 'function' ? config.downloadBuffer : requestBuffer;
    this.commandRunner = typeof config.commandRunner === 'function' ? config.commandRunner : defaultCommandRunner;
    this.npm = npmCommandSpec(config);
    this.globalRoot = readString(config, 'globalRoot', '');
    this.developmentRoot = findGitAncestor(this.packageRoot);
    this.activeOperation = '';
  }

  isAvailable() {
    return parseSemver(this.currentVersion) !== null && validateUpdateUrl(this.registryUrl, 'registry').ok;
  }

  installationKind() {
    return this.developmentRoot.length > 0 ? 'development' : 'npm_global';
  }

  status() {
    let saved = this.store.readDaemonUpdateState();
    if (saved && saved.pendingRestart === true) {
      const desiredVersion = saved.status === 'rolled_back'
        ? readString(saved, 'rollbackInstalledVersion', readString(saved, 'previousVersion', ''))
        : readString(saved, 'installedVersion', readString(saved, 'targetVersion', ''));
      if (desiredVersion.length > 0 && desiredVersion === this.currentVersion) {
        saved = Object.assign({}, saved, {
          status: saved.status === 'rolled_back' ? 'rollback_active' : 'active',
          pendingRestart: false,
          activatedVersion: this.currentVersion,
          activatedAt: nowIso(),
          updatedAt: nowIso()
        });
        this.store.writeDaemonUpdateState(saved);
      }
    }
    return {
      ok: true,
      action: 'daemon.update.status',
      updaterAvailable: this.isAvailable(),
      available: saved ? saved.available === true : false,
      packageName: this.packageName,
      currentVersion: this.currentVersion,
      registryUrl: this.registryUrl,
      installationKind: this.installationKind(),
      developmentRoot: this.developmentRoot,
      statePath: this.store.paths.daemonUpdateState,
      update: saved || {},
      pendingRestart: saved ? saved.pendingRestart === true : false,
      rollbackAvailable: saved
        ? typeof saved.backupPath === 'string' && fs.existsSync(saved.backupPath) &&
          typeof saved.backupIntegrity === 'string' && saved.backupIntegrity.startsWith('sha512-')
        : false,
      busy: this.activeOperation.length > 0,
      activeOperation: this.activeOperation,
      updatedAt: nowIso()
    };
  }

  async runExclusive(operation, callback) {
    if (this.activeOperation.length > 0) {
      return failure(
        'daemon.update.' + operation,
        'update_busy',
        'Another Bridge update operation is already running.',
        'Wait for ' + this.activeOperation + ' to finish, then retry.',
        { activeOperation: this.activeOperation }
      );
    }
    this.activeOperation = operation;
    try {
      return await callback();
    } finally {
      this.activeOperation = '';
    }
  }

  async check(payload) {
    const action = 'daemon.update.check';
    const registryValidation = validateUpdateUrl(this.registryUrl, 'registry');
    if (!registryValidation.ok) {
      return failure(action, registryValidation.code, registryValidation.message, 'Use an HTTPS npm registry URL.');
    }
    const requestedChannel = readString(payload, 'channel', 'latest').trim() || 'latest';
    const requestedVersion = readString(payload, 'version', '').trim().replace(/^v/i, '');
    if (!/^[0-9A-Za-z._-]+$/.test(requestedChannel)) {
      return failure(action, 'update_channel_invalid', 'Update channel contains unsupported characters.', 'Use a registry dist-tag such as latest, next, or beta.');
    }
    if (requestedVersion.length > 0 && parseSemver(requestedVersion) === null) {
      return failure(action, 'update_version_invalid', 'Requested update version is not valid semantic version text.', 'Use an exact version such as 1.2.3.');
    }
    const metadataUrl = this.registryUrl + '/' + encodeURIComponent(this.packageName);
    let metadata;
    try {
      metadata = await this.fetchJson(metadataUrl, {
        purpose: 'registry metadata',
        timeoutMs: this.requestTimeoutMs,
        maxBytes: DEFAULT_METADATA_LIMIT_BYTES
      });
    } catch (error) {
      return failure(
        action,
        error && typeof error.code === 'string' ? error.code : 'update_registry_unavailable',
        error instanceof Error ? error.message : String(error),
        'Check registry connectivity and retry.'
      );
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.name !== this.packageName) {
      return failure(action, 'update_registry_package_mismatch', 'Registry metadata does not match the fixed Bridge package name.', 'Verify the configured npm registry.');
    }
    const distTags = metadata['dist-tags'] && typeof metadata['dist-tags'] === 'object' && !Array.isArray(metadata['dist-tags'])
      ? metadata['dist-tags']
      : {};
    const targetVersion = requestedVersion.length > 0
      ? requestedVersion
      : (typeof distTags[requestedChannel] === 'string' ? distTags[requestedChannel] : '');
    if (targetVersion.length === 0 || parseSemver(targetVersion) === null) {
      return failure(action, 'update_target_missing', 'Registry does not expose a valid target version for the requested channel.', 'Choose another channel or exact version.');
    }
    const versions = metadata.versions && typeof metadata.versions === 'object' && !Array.isArray(metadata.versions)
      ? metadata.versions
      : {};
    const target = versions[targetVersion];
    if (!target || typeof target !== 'object' || Array.isArray(target) || target.name !== this.packageName || target.version !== targetVersion) {
      return failure(action, 'update_target_invalid', 'Target package metadata is missing or mismatched.', 'Retry after the registry metadata is consistent.');
    }
    const dist = target.dist && typeof target.dist === 'object' && !Array.isArray(target.dist) ? target.dist : {};
    const tarballUrl = readString(dist, 'tarball', '');
    const integrity = readString(dist, 'integrity', '');
    const tarballValidation = validateUpdateUrl(tarballUrl, 'tarball');
    if (!tarballValidation.ok) {
      return failure(action, tarballValidation.code, tarballValidation.message, 'Use a registry that publishes HTTPS tarball URLs.');
    }
    if (integrity.length === 0) {
      return failure(action, 'update_integrity_missing', 'Target package metadata does not include npm integrity.', 'Publish the package with integrity metadata before updating.');
    }
    const comparison = compareVersions(targetVersion, this.currentVersion);
    const result = {
      ok: true,
      action,
      available: comparison !== null && comparison > 0,
      sameVersion: comparison === 0,
      downgrade: comparison !== null && comparison < 0,
      packageName: this.packageName,
      currentVersion: this.currentVersion,
      targetVersion,
      channel: requestedChannel,
      registryUrl: this.registryUrl,
      metadataUrl,
      tarballUrl,
      integrity,
      integrityAlgorithm: integrity.split('-')[0],
      installationKind: this.installationKind(),
      publishedAt: metadata.time && typeof metadata.time[targetVersion] === 'string' ? metadata.time[targetVersion] : '',
      checkedAt: nowIso(),
      confirmRequired: true,
      failureCategory: '',
      message: comparison > 0 ? 'A Bridge update is available.' : (comparison === 0 ? 'Bridge is already on the selected version.' : 'The selected target is older than the current version.'),
      remediation: ''
    };
    if (this.activeOperation.length === 0) {
      const previousState = this.store.readDaemonUpdateState() || {};
      this.store.writeDaemonUpdateState(Object.assign({}, previousState, result, {
        status: previousState.pendingRestart === true ? readString(previousState, 'status', 'installed') : 'checked',
        pendingRestart: previousState.pendingRestart === true,
        updatedAt: nowIso()
      }));
    }
    return result;
  }

  async preview(payload) {
    const checked = await this.check(payload);
    if (!checked.ok) {
      return Object.assign({}, checked, { action: 'daemon.update.preview' });
    }
    const allowLifecycleScripts = readBoolean(payload, 'allowLifecycleScripts', false);
    return Object.assign({}, checked, {
      action: 'daemon.update.preview',
      preview: true,
      confirmRequired: true,
      allowLifecycleScripts,
      plannedDownloadPath: path.join(this.store.paths.daemonUpdateStaged, this.packageName.replace(/[^A-Za-z0-9._-]+/g, '-') + '-' + safeVersionSegment(checked.targetVersion) + '.tgz'),
      plannedBackupDirectory: this.store.paths.daemonUpdateBackups,
      plannedInstall: 'npm install --global <verified-tarball> --no-audit --no-fund' + (allowLifecycleScripts ? '' : ' --ignore-scripts'),
      writesPerformed: false
    });
  }

  async stageUpdate(checked) {
    let buffer;
    try {
      buffer = await this.downloadBuffer(checked.tarballUrl, {
        purpose: 'tarball',
        accept: 'application/octet-stream',
        timeoutMs: this.requestTimeoutMs,
        maxBytes: DEFAULT_TARBALL_LIMIT_BYTES
      });
    } catch (error) {
      throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), {
        code: error && typeof error.code === 'string' ? error.code : 'update_download_failed'
      });
    }
    const integrity = verifyIntegrity(buffer, checked.integrity);
    if (!integrity.ok) {
      throw Object.assign(new Error('Downloaded update failed npm integrity verification.'), {
        code: integrity.code,
        integrity
      });
    }
    const manifest = inspectNpmTarball(buffer);
    if (manifest.name !== this.packageName || manifest.version !== checked.targetVersion) {
      throw Object.assign(new Error('Downloaded update package name/version does not match registry metadata.'), {
        code: 'update_tarball_package_mismatch'
      });
    }
    fs.mkdirSync(this.store.paths.daemonUpdateStaged, { recursive: true });
    const stagedPath = path.join(
      this.store.paths.daemonUpdateStaged,
      this.packageName.replace(/[^A-Za-z0-9._-]+/g, '-') + '-' + safeVersionSegment(checked.targetVersion) + '.tgz'
    );
    const tempPath = stagedPath + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, stagedPath);
    return {
      stagedPath,
      sizeBytes: buffer.length,
      integrityVerified: true,
      integrityAlgorithm: integrity.algorithm,
      packageName: manifest.name,
      packageVersion: manifest.version
    };
  }

  async runNpm(args) {
    const fullArgs = this.npm.prefixArgs.concat(args);
    const raw = await this.commandRunner(this.npm.command, fullArgs, {
      cwd: this.packageRoot,
      env: process.env,
      timeoutMs: 10 * 60 * 1000
    });
    return sanitizeCommandResult(raw, this.npm.command, fullArgs);
  }

  async createBackup() {
    fs.mkdirSync(this.store.paths.daemonUpdateBackups, { recursive: true });
    const result = await this.runNpm([
      'pack',
      this.packageRoot,
      '--pack-destination',
      this.store.paths.daemonUpdateBackups,
      '--ignore-scripts',
      '--json'
    ]);
    if (result.exitCode !== 0) {
      throw Object.assign(new Error(result.stderr.length > 0 ? result.stderr : 'npm pack failed while creating update rollback backup.'), {
        code: 'update_backup_failed',
        commandResult: result
      });
    }
    let filename = '';
    try {
      const parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].filename === 'string') {
        filename = parsed[0].filename;
      }
    } catch (_error) {
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      filename = lines.length > 0 ? lines[lines.length - 1].trim() : '';
    }
    const backupPath = path.isAbsolute(filename) ? filename : path.join(this.store.paths.daemonUpdateBackups, filename);
    if (filename.length === 0 || !fs.existsSync(backupPath)) {
      throw Object.assign(new Error('npm pack did not produce a readable rollback tarball.'), {
        code: 'update_backup_missing',
        commandResult: result
      });
    }
    const backupBuffer = fs.readFileSync(backupPath);
    const manifest = inspectNpmTarball(backupBuffer);
    if (manifest.name !== this.packageName || manifest.version !== this.currentVersion) {
      throw Object.assign(new Error('Rollback backup package metadata does not match the running Bridge package.'), {
        code: 'update_backup_mismatch',
        commandResult: result
      });
    }
    return {
      backupPath,
      backupIntegrity: 'sha512-' + crypto.createHash('sha512').update(backupBuffer).digest('base64'),
      commandResult: result,
      packageName: manifest.name,
      packageVersion: manifest.version
    };
  }

  async resolveGlobalRoot() {
    if (this.globalRoot.length > 0) {
      return this.globalRoot;
    }
    const result = await this.runNpm(['root', '--global']);
    if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
      throw Object.assign(new Error(result.stderr.length > 0 ? result.stderr : 'Unable to resolve npm global root.'), {
        code: 'update_global_root_failed',
        commandResult: result
      });
    }
    return result.stdout.trim().split(/\r?\n/)[0];
  }

  async installedVersion() {
    const globalRoot = await this.resolveGlobalRoot();
    const packagePath = path.join(globalRoot, ...this.packageName.split('/'));
    const packageJsonPath = path.join(packagePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        version: '',
        packagePath,
        packageJsonPath
      };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return {
        version: typeof parsed.version === 'string' ? parsed.version : '',
        packagePath,
        packageJsonPath
      };
    } catch (_error) {
      return {
        version: '',
        packagePath,
        packageJsonPath
      };
    }
  }

  installArgs(packagePath, allowLifecycleScripts) {
    const args = ['install', '--global', packagePath, '--no-audit', '--no-fund'];
    if (!allowLifecycleScripts) {
      args.push('--ignore-scripts');
    }
    return args;
  }

  async restoreBackup(backupPath, allowLifecycleScripts, expectedVersion, expectedIntegrity) {
    const rejectedCommandResult = {
      command: '',
      exitCode: -1,
      stdout: '',
      stderr: '',
      durationMs: 0
    };
    let backupBuffer;
    try {
      backupBuffer = fs.readFileSync(backupPath);
    } catch (error) {
      return {
        ok: false,
        commandResult: Object.assign({}, rejectedCommandResult, {
          stderr: error instanceof Error ? error.message : String(error)
        }),
        verified: false,
        backupVerified: false,
        failureCategory: 'update_backup_unreadable',
        installedVersion: '',
        installedPackagePath: ''
      };
    }
    const integrity = verifyIntegrity(backupBuffer, expectedIntegrity);
    if (!integrity.ok) {
      return {
        ok: false,
        commandResult: Object.assign({}, rejectedCommandResult, {
          stderr: 'Rollback backup failed integrity verification.'
        }),
        verified: false,
        backupVerified: false,
        failureCategory: integrity.code === 'update_integrity_missing'
          ? 'update_backup_integrity_missing'
          : 'update_backup_integrity_mismatch',
        installedVersion: '',
        installedPackagePath: ''
      };
    }
    let manifest;
    try {
      manifest = inspectNpmTarball(backupBuffer);
    } catch (error) {
      return {
        ok: false,
        commandResult: Object.assign({}, rejectedCommandResult, {
          stderr: error instanceof Error ? error.message : String(error)
        }),
        verified: false,
        backupVerified: false,
        failureCategory: 'update_backup_invalid',
        installedVersion: '',
        installedPackagePath: ''
      };
    }
    if (manifest.name !== this.packageName || manifest.version !== expectedVersion) {
      return {
        ok: false,
        commandResult: Object.assign({}, rejectedCommandResult, {
          stderr: 'Rollback backup package identity does not match the expected Bridge version.'
        }),
        verified: false,
        backupVerified: false,
        failureCategory: 'update_backup_mismatch',
        installedVersion: '',
        installedPackagePath: ''
      };
    }
    const commandResult = await this.runNpm(this.installArgs(backupPath, allowLifecycleScripts));
    let verified = false;
    let installed = { version: '', packagePath: '', packageJsonPath: '' };
    if (commandResult.exitCode === 0) {
      installed = await this.installedVersion();
      verified = installed.version === expectedVersion;
    }
    return {
      ok: commandResult.exitCode === 0 && verified,
      commandResult,
      verified,
      backupVerified: true,
      failureCategory: commandResult.exitCode === 0 && verified ? '' : 'update_rollback_failed',
      installedVersion: installed.version,
      installedPackagePath: installed.packagePath
    };
  }

  async install(payload) {
    return this.runExclusive('install', () => this.performInstall(payload));
  }

  async performInstall(payload) {
    const action = 'daemon.update.install';
    if (!readBoolean(payload, 'confirm', false)) {
      return failure(action, 'confirmation_required', 'Bridge update installation requires confirm=true.', 'Run update preview, review the exact version and integrity, then confirm.');
    }
    const allowDevelopmentInstall = readBoolean(payload, 'allowDevelopmentInstall', false);
    if (this.installationKind() === 'development' && !allowDevelopmentInstall) {
      return failure(action, 'development_checkout', 'Self-update is disabled while Bridge runs from a development checkout.', 'Update the checkout through source control, or use the explicitly confirmed CLI development override for isolated testing.');
    }
    const checked = await this.check(payload);
    if (!checked.ok) {
      return Object.assign({}, checked, { action });
    }
    const force = readBoolean(payload, 'force', false);
    if ((checked.sameVersion || checked.downgrade) && !force) {
      return failure(action, checked.sameVersion ? 'already_current' : 'downgrade_requires_force', checked.message, checked.sameVersion ? 'No update is required.' : 'Use an explicit exact version and force=true only after reviewing the downgrade.');
    }
    const allowLifecycleScripts = readBoolean(payload, 'allowLifecycleScripts', false);
    const commandResults = [];
    let staged;
    let backup;
    try {
      staged = await this.stageUpdate(checked);
      backup = await this.createBackup();
      commandResults.push(backup.commandResult);
    } catch (error) {
      return failure(
        action,
        error && typeof error.code === 'string' ? error.code : 'update_staging_failed',
        error instanceof Error ? error.message : String(error),
        'No package installation was performed. Check update metadata, disk permissions, and npm availability.',
        {
          commandResults: error && error.commandResult ? [error.commandResult] : [],
          integrityVerified: error && error.integrity ? error.integrity.ok === true : false
        }
      );
    }
    const installingState = {
      status: 'installing',
      packageName: this.packageName,
      previousVersion: this.currentVersion,
      targetVersion: checked.targetVersion,
      channel: checked.channel,
      registryUrl: this.registryUrl,
      integrity: checked.integrity,
      integrityVerified: true,
      stagedPath: staged.stagedPath,
      backupPath: backup.backupPath,
      backupIntegrity: backup.backupIntegrity,
      allowLifecycleScripts,
      pendingRestart: false,
      startedAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.writeDaemonUpdateState(installingState);
    const installResult = await this.runNpm(this.installArgs(staged.stagedPath, allowLifecycleScripts));
    commandResults.push(installResult);
    let installed = { version: '', packagePath: '', packageJsonPath: '' };
    let verifyError = null;
    if (installResult.exitCode === 0) {
      try {
        installed = await this.installedVersion();
      } catch (error) {
        verifyError = error;
      }
    }
    const verified = installResult.exitCode === 0 && !verifyError && installed.version === checked.targetVersion;
    if (!verified) {
      const rollback = await this.restoreBackup(
        backup.backupPath,
        allowLifecycleScripts,
        this.currentVersion,
        backup.backupIntegrity
      );
      commandResults.push(rollback.commandResult);
      const state = Object.assign({}, installingState, {
        status: rollback.ok ? 'rolled_back' : 'rollback_failed',
        pendingRestart: false,
        installedVersion: installed.version,
        rollbackVerified: rollback.verified,
        rollbackInstalledVersion: rollback.installedVersion,
        failureCategory: rollback.ok ? 'update_install_failed_rolled_back' : 'update_rollback_failed',
        lastError: verifyError instanceof Error
          ? verifyError.message
          : (installResult.stderr.length > 0 ? installResult.stderr : 'Installed package version did not match target.'),
        updatedAt: nowIso()
      });
      this.store.writeDaemonUpdateState(state);
      return failure(
        action,
        state.failureCategory,
        rollback.ok ? 'Bridge update failed and the previous package was restored.' : 'Bridge update failed and automatic rollback could not be verified.',
        rollback.ok ? 'Inspect command results and retry after resolving npm or permission errors.' : 'Reinstall ' + this.packageName + '@' + this.currentVersion + ' manually before restarting Bridge.',
        {
          currentVersion: this.currentVersion,
          targetVersion: checked.targetVersion,
          installedVersion: installed.version,
          stagedPath: staged.stagedPath,
          backupPath: backup.backupPath,
          rollback,
          commandResults,
          statePath: this.store.paths.daemonUpdateState
        }
      );
    }
    const completedAt = nowIso();
    const state = Object.assign({}, installingState, {
      status: 'installed',
      installedVersion: installed.version,
      installedPackagePath: installed.packagePath,
      pendingRestart: true,
      installedAt: completedAt,
      updatedAt: completedAt,
      failureCategory: '',
      lastError: ''
    });
    this.store.writeDaemonUpdateState(state);
    return {
      ok: true,
      action,
      packageName: this.packageName,
      previousVersion: this.currentVersion,
      targetVersion: checked.targetVersion,
      installedVersion: installed.version,
      installedPackagePath: installed.packagePath,
      stagedPath: staged.stagedPath,
      backupPath: backup.backupPath,
      integrityVerified: true,
      integrityAlgorithm: staged.integrityAlgorithm,
      allowLifecycleScripts,
      pendingRestart: true,
      restartRequired: true,
      rollbackAvailable: true,
      statePath: this.store.paths.daemonUpdateState,
      commandResults,
      failureCategory: '',
      message: 'Bridge update installed and verified. Supervisor replacement is required to load the new version.',
      remediation: '',
      updatedAt: completedAt
    };
  }

  async rollback(payload) {
    return this.runExclusive('rollback', () => this.performRollback(payload));
  }

  async performRollback(payload) {
    const action = 'daemon.update.rollback';
    if (!readBoolean(payload, 'confirm', false)) {
      return failure(action, 'confirmation_required', 'Bridge update rollback requires confirm=true.', 'Review update status and backup path before confirming rollback.');
    }
    const allowDevelopmentInstall = readBoolean(payload, 'allowDevelopmentInstall', false);
    if (this.installationKind() === 'development' && !allowDevelopmentInstall) {
      return failure(action, 'development_checkout', 'Self-update rollback is disabled while Bridge runs from a development checkout.', 'Restore the checkout through source control, or use the explicitly confirmed CLI development override for isolated testing.');
    }
    const state = this.store.readDaemonUpdateState();
    const backupPath = state && typeof state.backupPath === 'string' ? state.backupPath : '';
    const previousVersion = state && typeof state.previousVersion === 'string' ? state.previousVersion : '';
    const backupIntegrity = state && typeof state.backupIntegrity === 'string' ? state.backupIntegrity : '';
    if (backupPath.length === 0 || previousVersion.length === 0 || !fs.existsSync(backupPath)) {
      return failure(action, 'update_backup_missing', 'No verified Bridge update backup is available.', 'Reinstall the required Bridge version through npm.');
    }
    const allowLifecycleScripts = readBoolean(payload, 'allowLifecycleScripts', state.allowLifecycleScripts === true);
    const restored = await this.restoreBackup(backupPath, allowLifecycleScripts, previousVersion, backupIntegrity);
    const completedAt = nowIso();
    const nextState = Object.assign({}, state, {
      status: restored.ok ? 'rolled_back' : 'rollback_failed',
      pendingRestart: restored.ok,
      rollbackVerified: restored.verified,
      rollbackInstalledVersion: restored.installedVersion,
      rollbackAt: completedAt,
      updatedAt: completedAt,
      failureCategory: restored.ok ? '' : (restored.failureCategory || 'update_rollback_failed'),
      lastError: restored.ok ? '' : restored.commandResult.stderr
    });
    this.store.writeDaemonUpdateState(nextState);
    if (!restored.ok) {
      return failure(action, restored.failureCategory || 'update_rollback_failed', 'Bridge update rollback could not be verified.', 'Reinstall ' + this.packageName + '@' + previousVersion + ' manually.', {
        backupPath,
        previousVersion,
        restored,
        statePath: this.store.paths.daemonUpdateState
      });
    }
    return {
      ok: true,
      action,
      packageName: this.packageName,
      restoredVersion: previousVersion,
      installedVersion: restored.installedVersion,
      installedPackagePath: restored.installedPackagePath,
      backupPath,
      pendingRestart: true,
      restartRequired: true,
      rollbackVerified: true,
      commandResults: [restored.commandResult],
      statePath: this.store.paths.daemonUpdateState,
      failureCategory: '',
      message: 'Bridge package rollback completed and verified. Supervisor replacement is required.',
      remediation: '',
      updatedAt: completedAt
    };
  }
}

module.exports = {
  DEFAULT_PACKAGE_NAME,
  DEFAULT_REGISTRY_URL,
  DaemonUpdateManager,
  compareVersions,
  defaultCommandRunner,
  fetchJson,
  inspectNpmTarball,
  parseSemver,
  requestBuffer,
  validateUpdateUrl,
  verifyIntegrity
};
