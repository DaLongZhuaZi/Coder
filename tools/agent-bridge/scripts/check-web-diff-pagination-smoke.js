'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/web/index.html'), 'utf8');

for (const marker of [
  'loadedPages',
  'pageKey',
  'request.loadedPages.includes(pageKey)',
  'nextLineOffset',
  'nextFileCursor',
  'truncationReason',
  'state.diffRequest.truncated',
  'state.diffCache.set'
]) {
  assert.ok(app.includes(marker), 'Web diff pagination must include ' + marker);
}
assert.ok(html.includes('id="diff-status"'), 'Web diff UI must expose a truncation status region');
assert.ok(html.includes('id="diff-more-button"'), 'Web diff UI must expose a continue button');
assert.ok(!app.includes('state.diffText = state.diffText + separator + page + page'), 'Web diff must not duplicate a page by concatenation');

console.log('web diff pagination smoke ok');
