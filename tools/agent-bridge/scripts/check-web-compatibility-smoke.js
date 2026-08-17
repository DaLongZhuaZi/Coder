'use strict';

const assert = require('assert');
const compatibility = require('../src/web/compatibility');

const modern = compatibility.normalizeBridgeCapabilities({
  features: { workspaceFiles: true, browserAutomation: false, diagnosticsExport: true },
  serverInfo: {
    version: '0.1.4',
    features: { workspaceFiles: true, browserAutomation: false, diagnosticsExport: true },
    compatibility: { status: 'compatible', blocking: false }
  }
});
assert.strictEqual(modern.legacy, false, 'modern Bridge should advertise capabilities');
assert.strictEqual(compatibility.featureEnabled(modern, 'workspaceFiles'), true, 'advertised true feature should be enabled');
assert.strictEqual(compatibility.featureEnabled(modern, 'browserAutomation'), false, 'advertised false feature should remain disabled');
assert.strictEqual(modern.compatibility.status, 'compatible', 'compatibility status should be normalized');

const providerCapabilities = compatibility.normalizeProviderCapabilities({
  providers: [
    { id: 'codex', name: 'Codex', capabilities: { usageEvents: true, metadataGeneration: false, providerUsage: true } },
    { providerId: 'legacy', capabilities: { usageEvents: false } }
  ]
});
assert.strictEqual(providerCapabilities.advertised, true, 'provider capability envelope should be recognized');
assert.strictEqual(providerCapabilities.providers[0].providerId, 'codex', 'provider id should normalize from descriptor id');
assert.strictEqual(compatibility.providerCapabilityEnabled(providerCapabilities.providers, 'codex', 'usageEvents'), true, 'provider usage capability should be enabled from descriptor');
assert.strictEqual(compatibility.providerCapabilityEnabled(providerCapabilities.providers, 'codex', 'metadataGeneration'), false, 'provider metadata capability should remain disabled');
assert.strictEqual(compatibility.providerCapabilityEnabled(providerCapabilities.providers, 'missing', 'usageEvents'), false, 'unknown provider capability must fail closed');
const emptyProviderCapabilities = compatibility.normalizeProviderCapabilities({ providers: [] });
assert.strictEqual(emptyProviderCapabilities.advertised, true, 'empty provider list is still an explicit advertisement');

const legacy = compatibility.normalizeBridgeCapabilities({ version: 'legacy', serverInfo: { version: 'legacy' } });
assert.strictEqual(legacy.legacy, true, 'missing feature advertisement should be treated as legacy');
assert.strictEqual(compatibility.featureEnabled(legacy, 'workspaceFiles'), false, 'legacy Bridge must hide enhanced features');
assert.strictEqual(legacy.core.agentAttach, true, 'legacy core attach path remains available');

const directAgents = compatibility.normalizeResponse('agent.list', [{ id: 'agent-1' }]);
assert.strictEqual(directAgents.agents.length, 1, 'array agent response should be normalized');
const agentEnvelope = compatibility.normalizeResponse('agent.list', { agents: [{ id: 'agent-2' }] });
assert.strictEqual(agentEnvelope.agents[0].id, 'agent-2', 'agent envelope should be normalized');

const timeline = compatibility.normalizeResponse('session.messages', { timeline: [{ role: 'assistant', text: 'legacy' }] });
assert.strictEqual(timeline.messages.length, 1, 'legacy timeline should remain renderable');
assert.strictEqual(timeline.warning, 'legacy_timeline_source', 'legacy timeline should be labeled');
const unsupported = compatibility.normalizeResponse('session.messages', { sessionId: 's-1' });
assert.strictEqual(unsupported.supported, false, 'missing message fields should be marked unsupported');

const registry = compatibility.normalizeResponse('workspace.registry.list', { workspaces: [{ workspaceId: 'w-1' }] });
assert.strictEqual(registry.supported, true, 'workspace registry envelope should be supported');
const legacyFailure = compatibility.normalizeOptionalFailure('workspace.registry.list', new Error('Unknown request type'));
assert.strictEqual(legacyFailure.code, 'legacy_rpc_unsupported', 'unsupported optional RPC should have stable code');
const ordinaryFailure = compatibility.normalizeOptionalFailure('session.messages', new Error('Bridge is disconnected.'));
assert.strictEqual(ordinaryFailure.code, 'rpc_failed', 'transport failure should not be mislabeled as legacy');

const event = compatibility.normalizeEvent({ type: 'event', event: 'session.messages', sessionId: 's-1', payload: { workspaceId: 'w-1', agentId: 'a-1' } });
assert.strictEqual(event.known, true, 'known event should be recognized');
assert.strictEqual(compatibility.eventMatchesScope(event, { workspaceId: 'w-1', agentId: 'a-1', sessionId: 's-1' }), true, 'matching event scope should be accepted');
assert.strictEqual(compatibility.eventMatchesScope(event, { workspaceId: 'w-2' }), false, 'mismatched event scope should be rejected');
assert.strictEqual(compatibility.normalizeEvent({ type: 'event', event: 'future.event', payload: {} }).known, false, 'unknown event should be ignored by default');

console.log('web compatibility smoke ok');
