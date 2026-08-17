#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { DaemonRemoteConfigManager, canonicalJson, normalizeRemoteConfigUrl } = require('../src/daemon-remote-config-manager');

function signedDocument(privateKey, version, values) {
  const document = {
    schemaVersion: 1,
    configVersion: version,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    minimumBridgeVersion: '0.1.0',
    scope: { kind: 'daemon' },
    priority: 10,
    values,
    digest: ''
  };
  document.signature = crypto.sign('RSA-SHA256', Buffer.from(canonicalJson(document), 'utf8'), privateKey).toString('base64');
  return document;
}

async function main() {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-remote-config-'));
  try {
    assert.strictEqual(normalizeRemoteConfigUrl('http://config.example/bridge.json'), null);
    assert.strictEqual(normalizeRemoteConfigUrl('https://user:password@config.example/bridge.json'), null);
    assert.strictEqual(normalizeRemoteConfigUrl('https://config.example/bridge.json#secret'), null);
    assert.strictEqual(normalizeRemoteConfigUrl('https://config.example/bridge.json'), 'https://config.example/bridge.json');
    const store = createDaemonStore(home); let generation = 3;
    let document = signedDocument(keys.privateKey, '2026.07.1', { features: { browser: false }, diagnostics: { level: 'standard' } });
    const manager = new DaemonRemoteConfigManager(store, { bridgeVersion: '0.1.4', publicKey, generation: () => generation, fetchDocument: async () => document });
    const fetched = await manager.fetch({ url: 'https://config.example/bridge.json' });
    assert.strictEqual(fetched.ok, true);
    assert.strictEqual((await manager.fetch({ url: 'https://user:password@config.example/bridge.json' })).failureCategory, 'https_url_invalid');
    assert.strictEqual(manager.validate().ok, true);
    const preview = manager.preview({ hostProfileId: 'host-a' }); assert.strictEqual(preview.preview, true);
    assert.strictEqual(manager.apply({ planId: preview.planId, confirm: true, hostProfileId: 'host-b' }).failureCategory, 'host_scope_mismatch');
    generation += 1;
    assert.strictEqual(manager.apply({ planId: preview.planId, confirm: true, hostProfileId: 'host-a' }).failureCategory, 'plan_expired');
    generation -= 1;
    const fresh = manager.preview({ hostProfileId: 'host-a' });
    assert.strictEqual(manager.apply({ planId: fresh.planId, confirm: true, hostProfileId: 'host-a' }).confirmed, true);
    const staleVersionPlan = manager.preview({ hostProfileId: 'host-a' });
    document = signedDocument(keys.privateKey, '2026.07.2', { features: { browser: true } });
    await manager.fetch({ url: 'https://config.example/bridge.json' });
    assert.strictEqual(manager.apply({ planId: staleVersionPlan.planId, confirm: true, hostProfileId: 'host-a' }).failureCategory, 'plan_expired');
    const second = manager.preview({ hostProfileId: 'host-a' });
    assert.strictEqual(manager.apply({ planId: second.planId, confirm: true, hostProfileId: 'host-a' }).confirmed, true);
    const staleSourcePlan = manager.preview({ hostProfileId: 'host-a' });
    await manager.fetch({ url: 'https://config.example/changed.json' });
    assert.strictEqual(manager.apply({ planId: staleSourcePlan.planId, confirm: true, hostProfileId: 'host-a' }).failureCategory, 'plan_expired');
    await manager.fetch({ url: 'https://config.example/bridge.json' });
    const rollbackPreview = manager.rollback({ hostProfileId: 'host-a' });
    assert.strictEqual(rollbackPreview.previousVersion, '2026.07.1');
    assert.strictEqual(manager.rollback({ planId: rollbackPreview.planId, confirm: true, hostProfileId: 'host-b' }).failureCategory, 'host_scope_mismatch');
    assert.strictEqual(manager.rollback({ planId: rollbackPreview.planId, confirm: true, hostProfileId: 'host-a' }).activeVersion, '2026.07.1');
    const forbidden = signedDocument(keys.privateKey, '2026.07.3', { bearerToken: 'secret' });
    assert.strictEqual(manager.validateDocument(forbidden).failureCategory, 'secret_field_rejected');
    const invalidSignature = signedDocument(keys.privateKey, '2026.07.4', { diagnostics: { level: 'standard' } });
    invalidSignature.signature = 'broken';
    assert.strictEqual(manager.validateDocument(invalidSignature).failureCategory, 'signature_invalid');
    const unknownField = signedDocument(keys.privateKey, '2026.07.5', { diagnostics: { level: 'standard' } });
    unknownField.futureValue = 'ignored';
    assert.strictEqual(manager.validateDocument(unknownField).warnings.includes('unknown_fields_ignored'), true);
    const invalidSchema = signedDocument(keys.privateKey, '2026.07.6', { diagnostics: { level: 'standard' } });
    invalidSchema.priority = 1001;
    assert.strictEqual(manager.validateDocument(invalidSchema).failureCategory, 'schema_invalid');

    const state = store.readDaemonRemoteConfigState();
    state.previous.document.signature = 'broken';
    store.writeDaemonRemoteConfigState(state);
    const reconciled = new DaemonRemoteConfigManager(store, { bridgeVersion: '0.1.4', publicKey, generation: () => generation, fetchDocument: async () => document });
    assert.strictEqual(reconciled.status().degraded, true);
    assert.strictEqual(reconciled.rollback({}).failureCategory, 'signature_invalid');
    const statusState = store.readDaemonRemoteConfigState();
    statusState.active.configVersion = { leaked: true };
    statusState.active.sourceUrl = { leaked: true };
    statusState.active.digest = 'not-a-digest';
    store.writeDaemonRemoteConfigState(statusState);
    const sanitizedStatus = new DaemonRemoteConfigManager(store, { bridgeVersion: '0.1.4', publicKey, generation: () => generation, fetchDocument: async () => document }).status();
    assert.strictEqual(sanitizedStatus.activeVersion, '');
    assert.strictEqual(sanitizedStatus.sourceUrl, '');
    assert.strictEqual(sanitizedStatus.manifestDigest, '');

    const failingStore = createDaemonStore(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-remote-config-failing-')));
    try {
      const failingManager = new DaemonRemoteConfigManager(failingStore, { bridgeVersion: '0.1.4', publicKey, generation: () => 1, fetchDocument: async () => document });
      assert.strictEqual((await failingManager.fetch({ url: 'https://config.example/bridge.json' })).ok, true);
      const failingPreview = failingManager.preview({});
      failingStore.writeDaemonRemoteConfigState = () => { throw new Error('disk_full'); };
      assert.strictEqual(failingManager.apply({ planId: failingPreview.planId, confirm: true }).failureCategory, 'state_persist_failed');
    } finally {
      fs.rmSync(failingStore.baseDirectory, { recursive: true, force: true });
    }
    assert.strictEqual(store.instanceId, createDaemonStore(home).instanceId);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
  console.log('daemon remote config smoke ok');
}

main().catch((error) => { console.error(error); process.exit(1); });
