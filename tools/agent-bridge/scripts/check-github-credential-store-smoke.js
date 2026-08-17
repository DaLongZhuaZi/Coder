'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'src', 'github-credential-store.js');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.strictEqual(source.includes("require('child_process').execFile"), false, 'credential store must not use an unbounded execFile helper');
assert.strictEqual(source.includes('child.stdin'), false, 'credential store must use explicit command input');
assert.ok(source.includes('COMMAND_TIMEOUT_MS'), 'credential store commands need a timeout');
assert.ok(source.includes('spawnSync'), 'credential store must use bounded process execution');

const originalSpawnSync = childProcess.spawnSync;
const calls = [];
childProcess.spawnSync = (command, args, options) => {
  calls.push({
    command,
    args: Array.isArray(args) ? args.slice() : [],
    input: options && typeof options.input === 'string' ? options.input : ''
  });
  if (command === 'powershell.exe') {
    return { status: 0, stdout: 'encrypted-ciphertext', stderr: '', error: null };
  }
  return { status: 0, stdout: command === 'secret-tool' || command === 'security' ? 'mock-token' : '', stderr: '', error: null };
};

async function main() {
  delete require.cache[require.resolve('../src/github-credential-store')];
  const { GitHubCredentialStore } = require('../src/github-credential-store');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-github-credential-smoke-'));
  const store = new GitHubCredentialStore({ home, service: 'smoke-service' });
  const secret = 'github-oauth-secret-smoke';
  try {
    assert.strictEqual(store.credentialPath('../escape'), '', 'account ids must not escape the credential directory');
    const callCount = calls.length;
    assert.strictEqual(await store.write('../escape', secret), false);
    assert.strictEqual(await store.read('../escape'), '');
    assert.strictEqual(await store.remove('../escape'), false);
    assert.strictEqual(calls.length, callCount, 'invalid account ids must not invoke external credential tools');

    assert.strictEqual(await store.available(), true);
    assert.strictEqual(await store.write('account-smoke', secret), true);
    const writeCall = calls.find((item) => item.input === secret);
    assert(writeCall, 'secret must be sent through process input');
    assert.strictEqual(writeCall.args.includes(secret), false, 'secret must not be present in command args');
    assert.strictEqual(JSON.stringify(writeCall.args).includes(secret), false, 'secret must not be serialized into command args');

    const expectedRead = process.platform === 'win32' ? 'encrypted-ciphertext' : 'mock-token';
    assert.strictEqual(await store.read('account-smoke'), expectedRead);
    assert.strictEqual(await store.remove('account-smoke'), true);
    if (process.platform === 'win32') {
      const filePath = store.credentialPath('account-smoke');
      assert.strictEqual(fs.existsSync(filePath), false, 'remove must delete the DPAPI file');
      assert.strictEqual(fs.readFileSync(sourcePath, 'utf8').includes(secret), false, 'source must not contain the test secret');
    }
    console.log('github credential store smoke ok');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    childProcess.spawnSync = originalSpawnSync;
  }
}

main().catch((error) => {
  childProcess.spawnSync = originalSpawnSync;
  console.error(error);
  process.exitCode = 1;
});
