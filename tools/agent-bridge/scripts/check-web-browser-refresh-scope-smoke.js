'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');

assert.ok(script.includes('refreshToken: 0'), 'Browser state must carry a refresh token');
assert.ok(script.includes('const refreshToken = state.browser.refreshToken + 1'), 'Each Browser refresh must invalidate the previous request chain');
assert.ok(script.includes('const refreshGeneration = state.connectionGeneration'), 'Browser refresh must bind to the connection generation');
assert.ok(script.includes('const refreshWorkspaceId = currentWorkspaceId()'), 'Browser refresh must bind to the active workspace');
assert.ok(script.includes('const refreshIsCurrent = () =>'), 'Browser refresh must have a single scope gate');
assert.ok(script.includes('state.browser.refreshToken === refreshToken'), 'Late Browser refreshes must be rejected by token');
assert.ok(script.includes('state.connectionGeneration === refreshGeneration'), 'Late Browser refreshes must be rejected by generation');
assert.ok(script.includes('currentWorkspaceId() === refreshWorkspaceId'), 'Late Browser refreshes must be rejected after workspace changes');
assert.ok(script.includes("if (!refreshIsCurrent()) return;"), 'Host list results must not update stale Browser state');
assert.ok(script.includes("if (!refreshIsCurrent() || state.browser.selectedHostId !== hostId) return;"), 'Instance/page results must not cross a changed host');
assert.ok(script.includes("state.browser.hosts = [];"), 'Capability-off or no-workspace refresh must clear stale hosts');
console.log('web browser refresh scope smoke ok');
