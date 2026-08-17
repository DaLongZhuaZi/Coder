'use strict';

const assert = require('assert');
const { MockProvider } = require('../src/providers/mock-provider');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const previousDelay = process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS;
  process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS = '5000';
  const provider = new MockProvider();
  try {
    const pending = provider.generateMetadataResult({
      metadataRequestId: 'r144-cancel',
      kind: 'sessionTitle',
      prompt: 'cancelled metadata'
    });
    await delay(25);
    const cancelled = provider.cancelMetadata({ requestId: 'r144-cancel', reason: 'timeout' });
    assert.strictEqual(cancelled.ok, true);
    assert.strictEqual(cancelled.cancelled, true);
    await assert.rejects(pending, (error) => error && error.code === 'metadata_cancelled');
    assert.strictEqual(provider.metadataRequests.size, 0, 'cancelled metadata request must be removed');

    process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS = '0';
    const completed = await provider.generateMetadataResult({
      metadataRequestId: 'r144-complete',
      kind: 'commitMessage',
      prompt: 'completed metadata'
    });
    assert.strictEqual(completed.suggestion, 'completed metadata');
    assert.strictEqual(provider.metadataRequests.size, 0, 'completed metadata request must be removed');
    process.stdout.write('metadata provider cleanup smoke ok\n');
  } finally {
    if (previousDelay === undefined) {
      delete process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS;
    } else {
      process.env.AGENT_BRIDGE_MOCK_METADATA_DELAY_MS = previousDelay;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
