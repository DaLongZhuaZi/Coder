'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const compatibility = require('../src/web/compatibility');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/web/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/web/styles.css'), 'utf8');
const payload = (mimeType, dataBase64, fullPage = false) => ({
  ok: true,
  screenshot: { mimeType, dataBase64, bytes: 999999, fullPage }
});

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff]);
const webpBytes = Buffer.from('RIFF0000WEBP', 'ascii');
const validPngBase64 = pngBytes.toString('base64');
const validPng = compatibility.normalizeResponse('browser.page.screenshot', payload('IMAGE/PNG', validPngBase64)).result;
assert.strictEqual(validPng.screenshot.valid, true, 'PNG screenshot should be accepted case-insensitively');
assert.strictEqual(validPng.screenshot.mimeType, 'image/png', 'PNG MIME should be normalized');
assert.strictEqual(validPng.screenshot.bytes, pngBytes.length, 'decoded screenshot bytes should be calculated');
const fullPage = compatibility.normalizeBrowserScreenshot(payload('image/png', validPngBase64, true));
assert.strictEqual(fullPage.screenshot.fullPage, true, 'full-page screenshot response should be preserved');

for (const fixture of [['image/jpeg', jpegBytes], ['image/webp', webpBytes]]) {
  const normalized = compatibility.normalizeBrowserScreenshot(payload(fixture[0], fixture[1].toString('base64')));
  assert.strictEqual(normalized.screenshot.valid, true, fixture[0] + ' screenshot should be accepted');
}

assert.strictEqual(compatibility.normalizeBrowserScreenshot(payload('image/png', Buffer.from('fake-png', 'utf8').toString('base64'))).screenshot.valid, false, 'PNG signature must be checked');
assert.strictEqual(compatibility.normalizeBrowserScreenshot(payload('image/jpeg', validPngBase64)).screenshot.valid, false, 'JPEG signature must match MIME');
assert.strictEqual(compatibility.normalizeBrowserScreenshot(payload('image/webp', validPngBase64)).screenshot.valid, false, 'WebP signature must match MIME');

const badMime = compatibility.normalizeBrowserScreenshot(payload('image/svg+xml', validPngBase64));
assert.strictEqual(badMime.screenshot.valid, false, 'SVG screenshot must be rejected');
assert.strictEqual(badMime.failureCategory, 'browser_screenshot_invalid', 'invalid MIME should have a stable failure category');
const badBase64 = compatibility.normalizeBrowserScreenshot(payload('image/png', 'not-base64'));
assert.strictEqual(badBase64.screenshot.valid, false, 'invalid base64 must be rejected');
const oversized = compatibility.normalizeBrowserScreenshot(payload('image/png', 'A'.repeat(8 * 1024 * 1024 + 4)));
assert.strictEqual(oversized.screenshot.valid, false, 'oversized base64 must be rejected');
const missing = compatibility.normalizeBrowserScreenshot({ ok: true, screenshot: { mimeType: 'image/png' } });
assert.strictEqual(missing.screenshot.valid, false, 'missing image payload must be rejected');
const failed = compatibility.normalizeBrowserScreenshot({ ok: false, failureCategory: 'browser_timeout', screenshot: {} });
assert.strictEqual(failed.ok, false, 'failed screenshot responses must preserve the failure state');

for (const marker of ['normalizeBrowserScreenshot', 'BROWSER_SCREENSHOT_MAX_BASE64_BYTES', 'BROWSER_SCREENSHOT_MIME_TYPES']) {
  assert.ok(compatibility && (typeof compatibility[marker] === 'function' || Object.prototype.hasOwnProperty.call(compatibility, marker)), marker + ' must be exposed by Web compatibility');
}
for (const marker of ['clearBrowserScreenshot', 'setBrowserSelectedPage', 'renderBrowserScreenshot', 'normalizeBrowserScreenshot', 'requestGeneration', 'requestHostId', 'requestPageId', 'browser.page.screenshot', 'browserScreenshotFullPage', 'screenshotFullPage', 'fullPage: browserScreenshotFullPage()', 'data:' ]) {
  assert.ok(app.includes(marker), 'Web app must implement screenshot preview marker ' + marker);
}
for (const id of ['browser-screenshot-preview', 'browser-screenshot-image', 'browser-screenshot-status', 'browser-screenshot-full-page']) {
  assert.ok(html.includes(id), 'Web UI must contain screenshot preview element ' + id);
}
assert.ok(html.includes('type="checkbox"'), 'Web UI must expose a full-page screenshot checkbox');
assert.ok(!app.includes("browserPayload(page, { fullPage: false })"), 'Web UI must not hard-code fullPage=false');
assert.ok(styles.includes('.browser-screenshot'), 'Web UI must style bounded screenshot preview');
assert.ok(!app.includes('innerHTML'), 'Web screenshot preview must not use unsafe HTML injection');

console.log('web browser screenshot smoke ok');
