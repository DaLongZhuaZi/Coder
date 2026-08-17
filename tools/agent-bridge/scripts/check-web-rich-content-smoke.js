'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const compatibility = require('../src/web/compatibility');

const app = fs.readFileSync(path.join(__dirname, '../src/web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/web/index.html'), 'utf8');
const style = fs.readFileSync(path.join(__dirname, '../src/web/rich-content.css'), 'utf8');
assert.ok(app.includes('appendRichContent'), 'Web message renderer must consume normalized content nodes');
assert.ok(html.includes('/app/rich-content.css'), 'Web UI must load the rich content stylesheet from same origin');
assert.ok(style.includes('.rich-block'), 'rich content stylesheet must style bounded code/diff blocks');

const rawNodes = [
  { kind: 'text', text: 'plain text' },
  { kind: 'code', language: 'typescript', text: 'const value = 1;' },
  { kind: 'link', url: 'https://example.com/docs?token=secret&tab=api', label: 'Docs' },
  { kind: 'file', workspaceId: 'workspace-1', relativePath: 'src/main.ts', line: 12, displayName: 'main.ts' },
  { kind: 'tool', toolName: 'terminal', title: 'Terminal', status: 'completed', text: 'exit 0' },
  { kind: 'todo', id: 'todo-1', status: 'in_progress', source: 'provider', title: 'Review changes' },
  { kind: 'diff', path: 'src/main.ts', text: '+const value = 1;', truncated: false },
  { kind: 'warning', code: 'provider_busy', text: 'Provider is busy.' },
  { kind: 'unknown', text: 'unknown node' },
  { kind: 'tool', toolName: 'unregistered-tool', text: 'unknown tool' },
  { kind: 'link', url: 'javascript:alert(1)', label: 'unsafe' },
  { kind: 'file', workspaceId: 'workspace-1', relativePath: '../secret.txt', displayName: 'secret' }
];

const nodes = compatibility.normalizeRichContentNodes(rawNodes);
assert.strictEqual(nodes[0].kind, 'text');
assert.strictEqual(nodes[1].kind, 'code');
assert.strictEqual(nodes[2].kind, 'link');
assert.strictEqual(nodes[2].url, 'https://example.com/docs?tab=api');
assert.strictEqual(nodes[3].kind, 'file');
assert.strictEqual(nodes[3].line, 12);
assert.strictEqual(nodes[4].kind, 'tool');
assert.strictEqual(nodes[5].kind, 'todo');
assert.strictEqual(nodes[6].kind, 'diff');
assert.strictEqual(nodes[7].kind, 'warning');
assert.strictEqual(nodes[8].kind, 'fallback');
assert.strictEqual(nodes[8].reason, 'unknown_kind');
assert.strictEqual(nodes[9].kind, 'fallback');
assert.strictEqual(nodes[9].reason, 'unknown_tool');
assert.strictEqual(nodes[10].kind, 'fallback');
assert.strictEqual(nodes[10].reason, 'unsafe_link');
assert.strictEqual(nodes[11].kind, 'fallback');
assert.strictEqual(nodes[11].reason, 'unsafe_file_scope');

const longCode = compatibility.normalizeRichContentNode({ kind: 'code', language: 'shell', text: Array.from({ length: 2200 }, () => 'echo x').join('\n') });
assert.strictEqual(longCode.kind, 'code');
assert.strictEqual(longCode.truncated, true);
assert.ok(longCode.lineCount > 2000);

const capped = compatibility.normalizeRichContentNodes(Array.from({ length: 100 }, () => ({ kind: 'text', text: 'x' })));
assert.strictEqual(capped.length, 64);
assert.strictEqual(capped[63].kind, 'fallback');
assert.strictEqual(capped[63].reason, 'node_limit');
assert.ok(compatibility.KNOWN_FEATURES.includes('richContentAst'), 'rich content AST must be capability gated');
assert.ok(app.includes("featureEnabled(state.capabilities, 'richContentAst')"), 'Web renderer must gate AST on capability');

const session = compatibility.normalizeResponse('session.messages', {
  messages: [{ role: 'assistant', text: 'fallback text', contentNodes: [{ kind: 'code', language: 'json', text: '{"ok":true}' }] }]
});
assert.strictEqual(session.messages[0].contentNodes[0].kind, 'code');
assert.strictEqual(session.messages[0].text, 'fallback text');

console.log('web rich content smoke ok');
