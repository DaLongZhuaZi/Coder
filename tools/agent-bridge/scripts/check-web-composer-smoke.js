'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const compatibility = require(path.join(root, 'src', 'web', 'compatibility'));
const app = fs.readFileSync(path.join(root, 'src', 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'web', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');

function expectIncludes(source, value, label) {
  assert.ok(source.includes(value), label + ' is missing: ' + value);
}

const unknown = compatibility.normalizeComposerToken({
  id: 'unknown',
  kind: 'untrusted-kind',
  label: 'fallback',
  value: 'plain text'
});
assert.equal(unknown.kind, 'text', 'unknown composer kinds must degrade to text');
assert.equal(unknown.hostProfileId, '', 'missing host scope must use an empty compatibility default');

const tokenInput = [];
for (let index = 0; index < 101; index += 1) {
  tokenInput.push({ id: 'token-' + String(index), kind: index === 0 ? 'file' : 'agent', label: 'item', value: 'item-' + String(index) });
}
const normalizedTokens = compatibility.normalizeComposerTokens(tokenInput);
assert.equal(normalizedTokens.length, 100, 'composer token parser must enforce its count limit');
assert.equal(normalizedTokens[0].kind, 'file', 'known token kinds must be preserved');

expectIncludes(html, 'id="composer-token-list"', 'composer token list');
expectIncludes(html, 'id="composer-mention-menu"', 'composer mention menu');
expectIncludes(html, 'aria-autocomplete="list"', 'composer autocomplete semantics');
expectIncludes(html, 'aria-controls="composer-mention-menu"', 'composer menu relationship');

expectIncludes(app, 'function safeComposerFilePath', 'composer path validator');
expectIncludes(app, "normalized.startsWith('/')", 'absolute composer path guard');
expectIncludes(app, "normalized.includes(':')", 'drive-style composer path guard');
expectIncludes(app, "part === '..'", 'parent traversal composer path guard');
expectIncludes(app, "event.key === 'ArrowDown'", 'mention ArrowDown handling');
expectIncludes(app, "event.key === 'ArrowUp'", 'mention ArrowUp handling');
expectIncludes(app, "event.key === 'Enter' || event.key === 'Tab'", 'mention confirmation handling');
expectIncludes(app, "event.key === 'Escape'", 'mention dismissal handling');
expectIncludes(app, "send('message.send'", 'current message RPC');
expectIncludes(app, 'composerTokensJson: tokens', 'composer token payload');
expectIncludes(app, "queuePolicy: 'queue'", 'queue policy payload');
expectIncludes(app, "send('agent.send'", 'legacy message RPC fallback');
assert.doesNotMatch(app, /\binnerHTML\b/, 'Web composer must not use innerHTML');
assert.doesNotMatch(app, /\beval\s*\(/, 'Web composer must not evaluate arbitrary JavaScript');

const agentSendMarker = 'if (message.type === RequestType.AGENT_SEND)';
const agentSendIndex = server.indexOf(agentSendMarker);
assert.ok(agentSendIndex >= 0, 'Bridge legacy agent.send handler must remain present');
const sanitizerIndex = server.indexOf('sanitizeComposerTokens(payload)', agentSendIndex);
assert.ok(sanitizerIndex > agentSendIndex, 'legacy agent.send must validate composer tokens');
const assignmentIndex = server.indexOf('payload.composerTokens = composerValidation.tokens', sanitizerIndex);
assert.ok(assignmentIndex > sanitizerIndex, 'validated composer tokens must reach the provider payload');

console.log('Web composer smoke passed.');
