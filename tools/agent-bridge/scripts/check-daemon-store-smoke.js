'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore, writeJsonFileAtomic } = require('../src/daemon-store');

function injectedRenameError(code) {
  const error = new Error('injected rename failure: ' + code);
  error.code = code;
  return error;
}

function listAtomicTemps(filePath) {
  const directory = path.dirname(filePath);
  const prefix = path.basename(filePath) + '.tmp-';
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory).filter((name) => name.startsWith(prefix));
}

function withPatchedRename(targetPath, replacement) {
  const originalRenameSync = fs.renameSync;
  fs.renameSync = function patchedRenameSync(sourcePath, destinationPath) {
    if (path.resolve(destinationPath) === path.resolve(targetPath)) {
      return replacement(originalRenameSync, sourcePath, destinationPath);
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  };
  return () => {
    fs.renameSync = originalRenameSync;
  };
}

function verifyRetryAndCleanup(root) {
  const filePath = path.join(root, 'retry', 'state.json');
  writeJsonFileAtomic(filePath, { version: 1 });
  let attempts = 0;
  const restoreRename = withPatchedRename(filePath, (originalRenameSync, sourcePath, destinationPath) => {
    attempts += 1;
    if (attempts <= 2) {
      throw injectedRenameError('EPERM');
    }
    return originalRenameSync.call(fs, sourcePath, destinationPath);
  });
  try {
    writeJsonFileAtomic(filePath, { version: 2 });
  } finally {
    restoreRename();
  }
  assert.strictEqual(attempts, 3);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { version: 2 });
  assert.deepStrictEqual(listAtomicTemps(filePath), []);
}

function verifyPersistentLockPreservesTarget(root) {
  const filePath = path.join(root, 'persistent', 'state.json');
  writeJsonFileAtomic(filePath, { version: 1 });
  let attempts = 0;
  const restoreRename = withPatchedRename(filePath, () => {
    attempts += 1;
    throw injectedRenameError('EPERM');
  });
  try {
    assert.throws(() => writeJsonFileAtomic(filePath, { version: 2 }), (error) => error && error.code === 'EPERM');
  } finally {
    restoreRename();
  }
  assert.strictEqual(attempts, 4);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { version: 1 });
  assert.deepStrictEqual(listAtomicTemps(filePath), []);
}

function verifyNonRetryableError(root) {
  const filePath = path.join(root, 'non-retryable', 'state.json');
  writeJsonFileAtomic(filePath, { version: 1 });
  let attempts = 0;
  const restoreRename = withPatchedRename(filePath, () => {
    attempts += 1;
    throw injectedRenameError('ENOSPC');
  });
  try {
    assert.throws(() => writeJsonFileAtomic(filePath, { version: 2 }), (error) => error && error.code === 'ENOSPC');
  } finally {
    restoreRename();
  }
  assert.strictEqual(attempts, 1);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { version: 1 });
  assert.deepStrictEqual(listAtomicTemps(filePath), []);
}

function verifyManagedProcessOwnership(root) {
  const store = createDaemonStore(path.join(root, 'managed-processes'));
  store.writeManagedProcessRecord({ id: 'daemon-supervisor', pid: 1001 });
  assert.strictEqual(store.removeManagedProcessRecord('daemon-supervisor', 1002), false);
  assert.strictEqual(fs.existsSync(store.managedProcessFilePath('daemon-supervisor')), true);
  assert.strictEqual(store.removeManagedProcessRecord('daemon-supervisor', 1001), true);
  assert.strictEqual(fs.existsSync(store.managedProcessFilePath('daemon-supervisor')), false);
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-daemon-store-smoke-'));
  try {
    verifyRetryAndCleanup(root);
    verifyPersistentLockPreservesTarget(root);
    verifyNonRetryableError(root);
    verifyManagedProcessOwnership(root);
    console.log('daemon store smoke ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
