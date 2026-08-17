'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMMAND_TIMEOUT_MS = 15000;

function readString(value, fallbackValue) {
  return typeof value === 'string' ? value : fallbackValue;
}

function execute(command, args, input) {
  const result = spawnSync(command, args, {
    input: readString(input, ''),
    encoding: 'utf8',
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024
  });
  return {
    ok: Boolean(result) && !result.error && result.status === 0,
    stdout: result && typeof result.stdout === 'string' ? result.stdout.trim() : '',
    stderr: result && typeof result.stderr === 'string' ? result.stderr.trim() : ''
  };
}

function accountKey(accountId) {
  const value = readString(accountId, '').trim();
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(value)) return '';
  return encodeURIComponent(value);
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

class GitHubCredentialStore {
  constructor(options) {
    const opts = options && typeof options === 'object' ? options : {};
    this.service = typeof opts.service === 'string' ? opts.service : 'ngf-agent-bridge-github';
    this.home = typeof opts.home === 'string' ? opts.home : '';
  }

  credentialPath(accountId) {
    const key = accountKey(accountId);
    if (!key || !this.home) return '';
    return path.join(this.home, 'credentials', 'github-' + key + '.dpapi');
  }

  async available() {
    if (process.platform === 'win32') return this.home.length > 0;
    if (process.platform === 'darwin') return execute('security', ['help'], '').ok;
    return execute('secret-tool', ['--help'], '').ok;
  }

  async write(accountId, token) {
    const key = accountKey(accountId);
    if (!key || !token) return false;
    if (process.platform === 'win32') {
      const script = "Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($s);$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($e)";
      const encrypted = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], token);
      if (!encrypted.ok || encrypted.stdout.length === 0) return false;
      const filePath = this.credentialPath(accountId);
      if (!filePath) return false;
      try {
        writeTextAtomic(filePath, encrypted.stdout);
        return true;
      } catch (_error) {
        return false;
      }
    }
    if (process.platform === 'darwin') {
      execute('security', ['delete-generic-password', '-s', this.service, '-a', accountId], '');
      return execute('security', ['add-generic-password', '-U', '-s', this.service, '-a', accountId, '-w'], token).ok;
    }
    return execute('secret-tool', ['store', '--label=NGF GitHub OAuth', 'service', this.service, 'account', accountId], token).ok;
  }

  async read(accountId) {
    const key = accountKey(accountId);
    if (!key) return '';
    if (process.platform === 'win32') {
      const filePath = this.credentialPath(accountId);
      if (!filePath) return '';
      const encrypted = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
      if (!encrypted) return '';
      const script = "Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($s);$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($d)";
      const decrypted = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], encrypted);
      return decrypted.ok ? decrypted.stdout : '';
    }
    if (process.platform === 'darwin') {
      const found = execute('security', ['find-generic-password', '-s', this.service, '-a', accountId, '-w'], '');
      return found.ok ? found.stdout : '';
    }
    const found = execute('secret-tool', ['lookup', 'service', this.service, 'account', accountId], '');
    return found.ok ? found.stdout : '';
  }

  async remove(accountId) {
    const key = accountKey(accountId);
    if (!key) return false;
    if (process.platform === 'win32') {
      const filePath = this.credentialPath(accountId);
      if (!filePath) return false;
      try {
        if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
        return true;
      } catch (_error) {
        return false;
      }
    }
    if (process.platform === 'darwin') {
      const removed = execute('security', ['delete-generic-password', '-s', this.service, '-a', accountId], '');
      return removed.ok || removed.stderr.toLowerCase().includes('could not be found');
    }
    return execute('secret-tool', ['clear', 'service', this.service, 'account', accountId], '').ok;
  }
}

module.exports = { GitHubCredentialStore };
