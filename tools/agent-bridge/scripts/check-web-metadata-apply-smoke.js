'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');
const workspaceService = fs.readFileSync(path.join(root, 'src/workspace-service.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/web/index.html'), 'utf8');

for (const kind of ['sessionTitle', 'branchName', 'commitMessage', 'pullRequest']) {
  assert.ok(app.includes("'" + kind + "'"), 'metadata apply must recognize ' + kind);
}
assert.ok(app.includes('state.metadata.applying'), 'metadata apply must expose an in-flight guard');
assert.ok(app.includes("workspace.git.branch"), 'branch metadata must use the workspace Git RPC');
assert.ok(app.includes("workspace.git.commit"), 'commit metadata must use the workspace Git RPC');
assert.ok(app.includes('requireConfirm: true'), 'commit metadata must explicitly request the Git plan gate');
assert.ok(app.includes("github.pr.create"), 'pull request metadata must use the GitHub PR RPC');
assert.ok(app.includes('dryRun: true'), 'pull request metadata must preview before confirmation');
assert.ok(app.includes('confirm: true'), 'metadata writes must send explicit confirmation');
assert.ok(html.includes('metadata-apply-button'), 'Web UI must expose the metadata apply control');

assert.ok(workspaceService.includes("operation === 'commit'"), 'WorkspaceService must model commit plans');
assert.ok(workspaceService.includes('git_nothing_to_commit'), 'commit preview must reject an empty index');
assert.ok(workspaceService.includes("readBooleanValue(payload, 'requireConfirm', false)"), 'commit plan gate must be opt-in for legacy clients');
assert.ok(workspaceService.includes('this.gitPlanManager'), 'commit plan gate must use the existing plan manager');

console.log('web metadata apply smoke ok');
