'use strict';

const assert = require('assert');
const { normalizeCodexUsage } = require('../src/providers/codex-app-server-provider');
const { normalizeOpenCodeUsagePart } = require('../src/providers/opencode-provider');
const { normalizeGatewayUsage } = require('../src/providers/gateway-provider');

function assertMissing(source, key) {
  assert(!Object.keys(source).includes(key), 'unexpected ' + key + ' field');
}

function main() {
  const codexInputOnly = normalizeCodexUsage(
    { tokenUsage: { last: { inputTokens: 12 } } },
    'codex-thread',
    'codex-turn'
  );
  assert(codexInputOnly);
  assert.strictEqual(codexInputOnly.inputTokens, 12);
  assertMissing(codexInputOnly, 'totalTokens');

  const openCodeOutputOnly = normalizeOpenCodeUsagePart(
    { tokens: { output: 8 }, cost: 0.25 },
    'opencode-session',
    'opencode-event'
  );
  assert(openCodeOutputOnly);
  assert.strictEqual(openCodeOutputOnly.outputTokens, 8);
  assertMissing(openCodeOutputOnly, 'totalTokens');
  assert.strictEqual(openCodeOutputOnly.cost, 0.25);
  assertMissing(openCodeOutputOnly, 'currency');

  const gatewayReasoningAndCache = normalizeGatewayUsage(
    { usage: { reasoning_tokens: 4, cached_tokens: 2 } },
    'gateway-session',
    'gateway-event'
  );
  assert(gatewayReasoningAndCache);
  assert.strictEqual(gatewayReasoningAndCache.reasoningTokens, 4);
  assert.strictEqual(gatewayReasoningAndCache.cacheReadTokens, 2);
  assertMissing(gatewayReasoningAndCache, 'totalTokens');

  const codexMissingCurrency = normalizeCodexUsage(
    { usage: { inputTokens: 3, outputTokens: 2, cost: 1.5 } },
    'codex-thread',
    'codex-turn-2'
  );
  assert(codexMissingCurrency);
  assert.strictEqual(codexMissingCurrency.totalTokens, 5);
  assert.strictEqual(codexMissingCurrency.cost, 1.5);
  assertMissing(codexMissingCurrency, 'currency');

  const openCodeMultiCurrency = normalizeOpenCodeUsagePart(
    { tokens: { input: 7, output: 5 }, cost: 2.5, currency: 'jpy' },
    'opencode-session',
    'opencode-event-2'
  );
  assert(openCodeMultiCurrency);
  assert.strictEqual(openCodeMultiCurrency.totalTokens, 12);
  assert.strictEqual(openCodeMultiCurrency.currency, 'JPY');

  const gatewayMultiCurrency = normalizeGatewayUsage(
    { usage: { input_tokens: 1, output_tokens: 2, cost: 0.4, currency: 'gbp' } },
    'gateway-session',
    'gateway-event-2'
  );
  assert(gatewayMultiCurrency);
  assert.strictEqual(gatewayMultiCurrency.totalTokens, 3);
  assert.strictEqual(gatewayMultiCurrency.currency, 'GBP');

  const codexNegative = normalizeCodexUsage(
    { usage: { inputTokens: -1, outputTokens: 2, cost: -0.5 } },
    'codex-thread',
    'codex-negative'
  );
  assert(codexNegative);
  assertMissing(codexNegative, 'inputTokens');
  assert.strictEqual(codexNegative.outputTokens, 2);
  assertMissing(codexNegative, 'cost');

  const openCodeNegative = normalizeOpenCodeUsagePart(
    { tokens: { input: -1, output: 2 }, cost: -0.5 },
    'opencode-session',
    'opencode-negative'
  );
  assert(openCodeNegative);
  assertMissing(openCodeNegative, 'inputTokens');
  assert.strictEqual(openCodeNegative.outputTokens, 2);
  assertMissing(openCodeNegative, 'cost');
  assertMissing(openCodeNegative, 'totalTokens');

  const openCodeFractional = normalizeOpenCodeUsagePart(
    { tokens: { input: 1.5, output: 2 }, cost: 0.5 },
    'opencode-session',
    'opencode-fractional'
  );
  assert(openCodeFractional);
  assertMissing(openCodeFractional, 'inputTokens');
  assert.strictEqual(openCodeFractional.outputTokens, 2);
  assertMissing(openCodeFractional, 'totalTokens');

  const gatewayNegative = normalizeGatewayUsage(
    { usage: { input_tokens: -1, output_tokens: 2, cost: -0.5 } },
    'gateway-session',
    'gateway-negative'
  );
  assert(gatewayNegative);
  assertMissing(gatewayNegative, 'inputTokens');
  assert.strictEqual(gatewayNegative.outputTokens, 2);
  assertMissing(gatewayNegative, 'cost');
  assertMissing(gatewayNegative, 'totalTokens');

  const gatewayFractional = normalizeGatewayUsage(
    { usage: { input_tokens: 1.5, output_tokens: 2, cost: 0.5 } },
    'gateway-session',
    'gateway-fractional'
  );
  assert(gatewayFractional);
  assertMissing(gatewayFractional, 'inputTokens');
  assert.strictEqual(gatewayFractional.outputTokens, 2);
  assertMissing(gatewayFractional, 'totalTokens');

  const codexOnlyInvalid = normalizeCodexUsage(
    { usage: { inputTokens: -1, cost: -0.5 } },
    'codex-thread',
    'codex-invalid'
  );
  assert.strictEqual(codexOnlyInvalid, null);

  const openCodeOnlyInvalid = normalizeOpenCodeUsagePart(
    { tokens: { input: -1 }, cost: -0.5 },
    'opencode-session',
    'opencode-invalid'
  );
  assert.strictEqual(openCodeOnlyInvalid, null);

  const gatewayOnlyInvalid = normalizeGatewayUsage(
    { usage: { input_tokens: -1, cost: -0.5 } },
    'gateway-session',
    'gateway-invalid'
  );
  assert.strictEqual(gatewayOnlyInvalid, null);

  console.log('provider usage producer integrity smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
