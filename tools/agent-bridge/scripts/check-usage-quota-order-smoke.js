'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDaemonStore } = require('../src/daemon-store');
const { UsageManager } = require('../src/agent-experience-manager');

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-usage-quota-order-'));
  try {
    const manager = new UsageManager(createDaemonStore(home));
    const newer = manager.record({
      eventId: 'quota-newer',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      kind: 'quota',
      window: 'hour',
      quotaSource: 'provider',
      quotaRemaining: 90,
      quotaLimit: 100,
      quotaResetAt: '2026-08-09T13:00:00Z',
      occurredAt: '2026-08-09T12:00:00Z'
    });
    const lateOlder = manager.record({
      eventId: 'quota-older-arrived-late',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      kind: 'quota',
      window: 'hour',
      quotaSource: 'provider',
      quotaRemaining: 10,
      quotaLimit: 100,
      quotaResetAt: '2026-08-09T12:30:00Z',
      occurredAt: '2026-08-09T11:00:00Z'
    });
    const otherWindow = manager.record({
      eventId: 'quota-day',
      hostProfileId: 'host-a',
      sessionId: 'session-a',
      providerId: 'provider-a',
      kind: 'quota',
      window: 'day',
      quotaSource: 'provider',
      quotaRemaining: 500,
      quotaLimit: 1000,
      occurredAt: '2026-08-09T11:30:00Z'
    });
    assert(newer);
    assert(lateOlder);
    assert(otherWindow);

    const summary = manager.summary({ hostProfileId: 'host-a', sessionId: 'session-a' });
    assert.strictEqual(summary.summary.quotas.length, 2);
    const hour = summary.summary.quotas.find((item) => item.window === 'hour');
    assert(hour);
    assert.strictEqual(hour.remaining, 90, 'late older snapshot must not regress the summary');
    assert.strictEqual(hour.occurredAt, '2026-08-09T12:00:00.000Z');
    const restored = new UsageManager(createDaemonStore(home));
    const restoredHour = restored.summary({ hostProfileId: 'host-a', sessionId: 'session-a' }).summary.quotas.find((item) => item.window === 'hour');
    assert(restoredHour);
    assert.strictEqual(restoredHour.remaining, 90);
    console.log('usage quota order smoke ok');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
