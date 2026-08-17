'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECRET_SERVICE_NAME = 'ngf-agent-bridge-provider';
const COMMAND_TIMEOUT_MS = 15000;

function readString(value, fallbackValue) {
  return typeof value === 'string' ? value : fallbackValue;
}

function secretAlias(profileId, key) {
  const profile = readString(profileId, '').trim();
  const variable = readString(key, '').trim();
  if (profile.length === 0 || variable.length === 0) {
    return '';
  }
  return 'provider:' + profile + ':' + variable;
}

function secretFingerprint(value) {
  const text = readString(value, '');
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').substring(0, 24);
}

function encodedAlias(alias) {
  return encodeURIComponent(alias).replace(/%/g, '_');
}

function execute(command, args, input) {
  const result = spawnSync(command, args, {
    input: readString(input, ''),
    encoding: 'utf8',
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024
  });
  const error = result && result.error instanceof Error
    ? result.error.message
    : (result && typeof result.stderr === 'string' ? result.stderr.trim() : '');
  return {
    ok: Boolean(result) && !result.error && result.status === 0,
    stdout: result && typeof result.stdout === 'string' ? result.stdout.trim() : '',
    error
  };
}

function writeTextAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  let completed = false;
  try {
    fs.writeFileSync(temporaryPath, value, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    completed = true;
  } finally {
    if (!completed) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch (_error) {
        // Keep the original write error.
      }
    }
  }
}

class ProviderSecretStore {
  constructor(options) {
    const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    this.homeDirectory = readString(source.homeDirectory, '');
    this.service = readString(source.service, SECRET_SERVICE_NAME);
  }

  credentialPath(alias) {
    if (this.homeDirectory.length === 0 || alias.length === 0) {
      return '';
    }
    return path.join(this.homeDirectory, 'credentials', 'provider-' + encodedAlias(alias) + '.dpapi');
  }

  status() {
    if (process.platform === 'win32') {
      return {
        available: this.homeDirectory.length > 0,
        platform: 'windows-dpapi',
        remediation: this.homeDirectory.length > 0 ? '' : 'Configure a writable Bridge home directory before storing Provider secrets.'
      };
    }
    if (process.platform === 'darwin') {
      const probe = execute('security', ['help'], '');
      return {
        available: probe.ok,
        platform: 'macos-keychain',
        remediation: probe.ok ? '' : 'Enable macOS Keychain access before storing Provider secrets.'
      };
    }
    const probe = execute('secret-tool', ['--help'], '');
    return {
      available: probe.ok,
      platform: 'linux-secret-service',
      remediation: probe.ok ? '' : 'Install and unlock a Secret Service implementation, or use process environment references only.'
    };
  }

  write(alias, value) {
    const resolvedAlias = readString(alias, '').trim();
    const secret = readString(value, '');
    if (resolvedAlias.length === 0) {
      return { ok: false, failureCategory: 'provider_secret_alias_invalid', message: 'Provider secret alias is required.' };
    }
    const availability = this.status();
    if (!availability.available) {
      return {
        ok: false,
        failureCategory: 'provider_secret_store_unavailable',
        message: 'Secure Provider secret storage is unavailable.',
        remediation: availability.remediation
      };
    }
    if (process.platform === 'win32') {
      const protectScript = "Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($s);$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($e)";
      const protectedValue = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', protectScript], secret);
      if (!protectedValue.ok || protectedValue.stdout.length === 0) {
        return { ok: false, failureCategory: 'provider_secret_write_failed', message: 'Windows DPAPI could not protect the Provider secret.' };
      }
      const filePath = this.credentialPath(resolvedAlias);
      try {
        writeTextAtomic(filePath, protectedValue.stdout);
        return { ok: true, alias: resolvedAlias, fingerprint: secretFingerprint(secret) };
      } catch (_error) {
        return { ok: false, failureCategory: 'provider_secret_write_failed', message: 'Provider secret file could not be written.' };
      }
    }
    if (process.platform === 'darwin') {
      execute('security', ['delete-generic-password', '-s', this.service, '-a', resolvedAlias], '');
      const stored = execute('security', ['add-generic-password', '-U', '-s', this.service, '-a', resolvedAlias, '-w'], secret);
      return stored.ok
        ? { ok: true, alias: resolvedAlias, fingerprint: secretFingerprint(secret) }
        : { ok: false, failureCategory: 'provider_secret_write_failed', message: 'macOS Keychain could not store the Provider secret.' };
    }
    const stored = execute('secret-tool', ['store', '--label=NGF Provider Secret', 'service', this.service, 'alias', resolvedAlias], secret);
    return stored.ok
      ? { ok: true, alias: resolvedAlias, fingerprint: secretFingerprint(secret) }
      : { ok: false, failureCategory: 'provider_secret_write_failed', message: 'Secret Service could not store the Provider secret.' };
  }

  read(alias) {
    const resolvedAlias = readString(alias, '').trim();
    if (resolvedAlias.length === 0) {
      return { ok: false, failureCategory: 'provider_secret_alias_invalid', message: 'Provider secret alias is required.' };
    }
    const availability = this.status();
    if (!availability.available) {
      return {
        ok: false,
        failureCategory: 'provider_secret_store_unavailable',
        message: 'Secure Provider secret storage is unavailable.',
        remediation: availability.remediation
      };
    }
    if (process.platform === 'win32') {
      const filePath = this.credentialPath(resolvedAlias);
      if (filePath.length === 0 || !fs.existsSync(filePath)) {
        return { ok: false, failureCategory: 'provider_secret_missing', message: 'Provider secret is not configured.' };
      }
      let encrypted = '';
      try {
        encrypted = fs.readFileSync(filePath, 'utf8').trim();
      } catch (_error) {
        return { ok: false, failureCategory: 'provider_secret_read_failed', message: 'Provider secret file could not be read.' };
      }
      const unprotectScript = "Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($s);$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($d)";
      const unprotected = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', unprotectScript], encrypted);
      return unprotected.ok
        ? { ok: true, alias: resolvedAlias, value: unprotected.stdout, fingerprint: secretFingerprint(unprotected.stdout) }
        : { ok: false, failureCategory: 'provider_secret_read_failed', message: 'Windows DPAPI could not read the Provider secret.' };
    }
    if (process.platform === 'darwin') {
      const found = execute('security', ['find-generic-password', '-s', this.service, '-a', resolvedAlias, '-w'], '');
      return found.ok && found.stdout.length > 0
        ? { ok: true, alias: resolvedAlias, value: found.stdout, fingerprint: secretFingerprint(found.stdout) }
        : { ok: false, failureCategory: 'provider_secret_missing', message: 'Provider secret is not configured.' };
    }
    const found = execute('secret-tool', ['lookup', 'service', this.service, 'alias', resolvedAlias], '');
    return found.ok && found.stdout.length > 0
      ? { ok: true, alias: resolvedAlias, value: found.stdout, fingerprint: secretFingerprint(found.stdout) }
      : { ok: false, failureCategory: 'provider_secret_missing', message: 'Provider secret is not configured.' };
  }

  remove(alias) {
    const resolvedAlias = readString(alias, '').trim();
    if (resolvedAlias.length === 0) {
      return { ok: false, failureCategory: 'provider_secret_alias_invalid', message: 'Provider secret alias is required.' };
    }
    if (process.platform === 'win32') {
      const filePath = this.credentialPath(resolvedAlias);
      try {
        if (filePath.length > 0 && fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
        }
        return { ok: true, alias: resolvedAlias };
      } catch (_error) {
        return { ok: false, failureCategory: 'provider_secret_remove_failed', message: 'Provider secret file could not be removed.' };
      }
    }
    if (process.platform === 'darwin') {
      const removed = execute('security', ['delete-generic-password', '-s', this.service, '-a', resolvedAlias], '');
      return removed.ok || removed.error.toLowerCase().indexOf('could not be found') >= 0
        ? { ok: true, alias: resolvedAlias }
        : { ok: false, failureCategory: 'provider_secret_remove_failed', message: 'macOS Keychain could not remove the Provider secret.' };
    }
    const removed = execute('secret-tool', ['clear', 'service', this.service, 'alias', resolvedAlias], '');
    return removed.ok
      ? { ok: true, alias: resolvedAlias }
      : { ok: false, failureCategory: 'provider_secret_remove_failed', message: 'Secret Service could not remove the Provider secret.' };
  }

  copy(sourceAlias, targetAlias) {
    const source = this.read(sourceAlias);
    if (!source.ok) {
      return source;
    }
    const written = this.write(targetAlias, source.value);
    if (!written.ok) {
      return written;
    }
    return { ok: true, alias: targetAlias, fingerprint: written.fingerprint };
  }
}

module.exports = {
  ProviderSecretStore,
  secretAlias,
  secretFingerprint
};
