#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateMetadataScope, normalizeMetadataResult } = require('../src/metadata-scope');

function connection(hostProfileId) {
  return { clientHello: { hostProfileId } };
}

function main() {
  const rootPath = path.resolve('/tmp/metadata-scope-workspace');
  const record = {
    id: 'agent-a',
    provider: 'fixture',
    providerSessionId: 'fixture:session-a',
    remoteSessionId: 'remote-a',
    workspaceId: 'workspace-a',
    rootPath,
    modelId: 'model-a'
  };
  const match = {
    provider: { id: 'fixture', generateMetadata: async () => 'ignored' },
    session: { sessionId: 'fixture:session-a', workspacePath: rootPath }
  };
  const agentManager = { findBySessionId: (sessionId) => sessionId === record.providerSessionId ? record : null };
  const valid = validateMetadataScope({
    sessionId: record.providerSessionId,
    agentId: record.id,
    providerId: record.provider,
    providerSessionId: record.providerSessionId,
    workspaceId: record.workspaceId,
    hostProfileId: 'host-a',
    workspacePath: '/attacker/another-workspace',
    prompt: 'title this session',
    timelineSummary: 'Authorization: Bearer secret-value\npassword=plain-secret\nhttps://user:password@example.test/timeline?access_token=timeline-secret\nkeep this summary',
    diffSummary: 'diff summary https://name:pass@example.test/diff?client_secret=diff-secret',
    credential: 'must not be forwarded',
    token: 'must not be forwarded'
  }, { agentManager, connection: connection('host-a'), match });
  assert.strictEqual(valid.ok, true);
  assert.strictEqual(valid.providerPayload.workspacePath, rootPath);
  assert.strictEqual(valid.providerPayload.workspaceId, record.workspaceId);
  assert.strictEqual(valid.providerPayload.agentId, record.id);
  assert.strictEqual(Object.keys(valid.providerPayload).includes('credential'), false);
  assert.strictEqual(Object.keys(valid.providerPayload).includes('token'), false);
  assert.strictEqual(valid.providerPayload.timelineSummary.includes('secret-value'), false);
  assert.strictEqual(valid.providerPayload.timelineSummary.includes('plain-secret'), false);
  assert.ok(valid.providerPayload.timelineSummary.includes('https://[redacted]@example.test/timeline?access_token=[redacted]'));
  assert.ok(valid.providerPayload.diffSummary.includes('https://[redacted]@example.test/diff?client_secret=[redacted]'));
  assert.strictEqual(valid.providerPayload.diffSummary.includes('diff-secret'), false);

  const mismatches = [
    [{ agentId: 'agent-b' }, 'agentId'],
    [{ workspaceId: 'workspace-b' }, 'workspaceId'],
    [{ providerId: 'other' }, 'providerId'],
    [{ providerSessionId: 'other:session' }, 'providerSessionId']
  ];
  for (const item of mismatches) {
    const result = validateMetadataScope(Object.assign({ sessionId: record.providerSessionId }, item[0]), {
      agentManager, connection: connection('host-a'), match
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failureCategory, 'metadata_scope_mismatch');
    assert.strictEqual(result.scopeField, item[1]);
  }
  const hostMismatch = validateMetadataScope({ sessionId: record.providerSessionId, hostProfileId: 'host-b' }, {
    agentManager, connection: connection('host-a'), match
  });
  assert.strictEqual(hostMismatch.failureCategory, 'metadata_scope_mismatch');
  assert.strictEqual(hostMismatch.scopeField, 'hostProfileId');

  const legacy = validateMetadataScope({ sessionId: 'legacy-session', prompt: 'legacy' }, {
    agentManager, connection: connection(''), match: {
      provider: { id: 'fixture' },
      session: { sessionId: 'legacy-session', workspacePath: rootPath }
    }
  });
  assert.strictEqual(legacy.ok, true);
  assert.strictEqual(legacy.warnings.includes('agent_scope_unavailable_legacy_session'), true);
  assert.strictEqual(legacy.warnings.includes('host_scope_unverified_legacy_client'), true);
  assert.strictEqual(legacy.providerPayload.workspacePath, rootPath);

  const invalidKind = validateMetadataScope({ sessionId: record.providerSessionId, kind: 'unknownKind' }, {
    agentManager, connection: connection('host-a'), match
  });
  assert.strictEqual(invalidKind.ok, false);
  assert.strictEqual(invalidKind.failureCategory, 'metadata_kind_invalid');

  const normalizedResult = normalizeMetadataResult('branchName', {
    suggestion: ' feature/r25-usage\u0000 ',
    alternatives: ['feature/r25-usage', 'feature/r25-safe\n' + 'x'.repeat(2048)],
    warnings: ['warning\u0000value'],
    estimatedUsage: true
  });
  assert.strictEqual(normalizedResult.ok, true);
  assert.strictEqual(normalizedResult.suggestion, 'feature/r25-usage');
  assert.strictEqual(normalizedResult.alternatives.length, 1);
  assert.strictEqual(normalizedResult.estimatedUsage, true);
  assert.strictEqual(normalizedResult.warnings.includes('metadata_result_truncated'), true);
  const invalidResult = normalizeMetadataResult('unknownKind', 'suggestion');
  assert.strictEqual(invalidResult.ok, false);
  assert.strictEqual(invalidResult.failureCategory, 'metadata_kind_invalid');

  const source = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  assert.strictEqual(source.includes("validateMetadataScope(payload, { agentManager, connection, match })"), true);
  assert.strictEqual(source.includes('match.provider.generateMetadata(scope.providerPayload)'), true);
  assert.strictEqual(source.includes('normalizeMetadataResult(scope.providerPayload.kind, generated)'), true);
  console.log('metadata scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
