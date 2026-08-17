'use strict';

const assert = require('assert');
const { buildDiagnosticsExportReport, buildCompatibilityInfo, redactDiagnosticText } = require('../src/diagnostics');

const reportResult = buildDiagnosticsExportReport(null, {
  format: 'json',
  maxBytes: 16 * 1024,
  doctor: {
    checks: [
      {
        id: 'provider_secret_store',
        status: 'warning',
        message: 'Credential store is unavailable.',
        remediation: 'Install Secret Service before storing credentials.'
      }
    ]
  },
  health: { instanceHealth: 'healthy' },
  provider: { count: 1, availableCount: 1 },
  terminal: { available: true, activeCount: 0 },
  queue: { count: 2, failedCount: 1 },
  usage: { eventCount: 3, budgetCount: 1, degraded: false },
  secureStorage: { credentialStoreAvailable: false, providerSecretStorage: { available: false, platform: 'unavailable' } },
  remoteConfig: { activeVersion: 'v1', degraded: false },
  persistence: { usageVersion: 1, queueVersion: 1 }
});

assert.strictEqual(reportResult.ok, true, 'diagnostics export should succeed');
assert.deepStrictEqual(reportResult.report.groups.map((group) => group.id), ['daemon', 'provider', 'terminal', 'queue', 'usage', 'secureStorage', 'remoteConfig', 'persistence']);
const secureStorage = reportResult.report.groups.find((group) => group.id === 'secureStorage');
assert.ok(secureStorage && secureStorage.checks.some((check) => check.actionId === 'open_secure_storage_help'), 'secure storage checks should expose a controlled action id');
assert.ok(secureStorage.checks.every((check) => !check.message.includes('Secret Service before')), 'diagnostic messages should not leak remediation text into message field');
assert.ok(secureStorage.checks.some((check) => check.remediation.includes('Install Secret Service')), 'diagnostic remediation should be preserved separately');

const textResult = buildDiagnosticsExportReport(null, { format: 'text', maxBytes: 4096, doctor: { checks: [] } });
assert.strictEqual(textResult.format, 'text');
assert.ok(textResult.report.text && textResult.report.text.includes('Agent Bridge diagnostics'), 'text export should contain a bounded report');

const compatibility = buildCompatibilityInfo({
  appVersion: '2.0.0',
  bridgeVersion: '2.0.0',
  minimumAppVersion: '1.0.0',
  recommendedAppVersion: '2.0.0',
  minimumBridgeVersion: '1.0.0',
  recommendedBridgeVersion: '2.0.0',
  minimumProtocolVersion: '1',
  supportedProtocolVersions: ['1', '2'],
  clientProtocolVersion: '2',
  recommendedProtocolVersion: '2'
});
assert.strictEqual(compatibility.status, 'compatible');
assert.strictEqual(compatibility.minimumProtocolVersion, '1');
assert.strictEqual(compatibility.recommendedProtocolVersion, '2');
assert.deepStrictEqual(compatibility.supportedProtocolVersions, ['1', '2']);

const redactedUrls = redactDiagnosticText('wss://user:password@example.com/private?token=secret ws://example.com/session file:///C:/Users/demo/private/key.pem ssh://git:private@example.com/repo ftp://example.com/archive');
assert.ok(!redactedUrls.includes('password'), 'diagnostics must redact credentials embedded in websocket URLs');
assert.ok(!redactedUrls.includes('token=secret'), 'diagnostics must redact websocket query values');
assert.ok(!redactedUrls.includes('/private?'), 'diagnostics must redact websocket URL paths and queries');
assert.ok(!redactedUrls.includes('C:/Users/demo/private/key.pem'), 'diagnostics must redact file URLs and private paths');
assert.ok(redactedUrls.includes('wss://example.com/[redacted]'), 'diagnostics should retain a safe websocket origin marker');
assert.ok(redactedUrls.includes('[redacted-file-url]'), 'diagnostics should redact file URLs with a stable marker');
assert.ok(!redactedUrls.includes('private@example.com'), 'diagnostics must redact unsupported URL credentials');
assert.ok(!redactedUrls.includes('ftp://example.com/archive'), 'diagnostics must redact unsupported URL schemes');
assert.ok(redactedUrls.includes('[redacted-url]'), 'diagnostics should use a stable marker for unsupported URL schemes');

const bearer = redactDiagnosticText('Authorization: Bearer abc.def.ghi; apiKey=super-secret; cookie=session-secret');
assert.ok(!bearer.includes('abc.def.ghi'), 'diagnostics must redact bearer values');
assert.ok(!bearer.includes('super-secret'), 'diagnostics must redact api keys');
assert.ok(!bearer.includes('session-secret'), 'diagnostics must redact cookie values');

console.log('diagnostics smoke ok');
