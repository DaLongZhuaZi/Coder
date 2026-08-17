#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const facadePath = path.join(
  repositoryRoot,
  'ngf_framework',
  'src',
  'main',
  'ets',
  'data',
  'facades',
  'EncryptedSettingsStoreFacade.ets'
);
const source = fs.readFileSync(facadePath, 'utf8');

assert(source.includes("import { ngfKeyStoreManagerFacade } from '../../security';"),
  'encrypted settings must use the framework secure store');
assert(source.includes('MASTER_KEY_ALIAS'), 'encrypted settings must use a stable secure alias');
assert(source.includes('ngfKeyStoreManagerFacade.querySecret'),
  'encrypted settings must load the key from secure storage');
assert(source.includes('ngfKeyStoreManagerFacade.addSecret'),
  'encrypted settings must persist generated and migrated keys securely');
assert(source.includes('clearLegacyMasterKey'),
  'legacy AppStorage key must be cleared after migration');
assert(source.includes("secure_storage_unavailable"),
  'secure storage failure must have a stable category');
assert(source.includes('getStatus'), 'secure storage readiness must be observable');
assert(!source.includes('FALLBACK_STATIC_KEY'),
  'fixed fallback key must not be present');
assert(!source.includes('TkdGRW5jcnlwdGVkIQ=='),
  'historical static key must not be present');

console.log('encrypted settings store smoke: ok');
