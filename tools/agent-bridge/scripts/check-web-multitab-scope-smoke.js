'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src/web/app.js'), 'utf8');

assert.ok(script.includes('function tabScopeMatches(message)'), 'Web tabs must validate endpoint and host scope');
assert.ok(script.includes("endpoint: endpoint()"), 'tab events must carry their endpoint scope');
assert.ok(script.includes("hostProfileId: state.hostProfileId"), 'tab events must carry their host profile scope');
assert.ok(script.includes("if (!tabScopeMatches(message)) return;"), 'out-of-scope tab events must be ignored');
assert.ok(script.includes("eventType === 'scope.changed'"), 'scope changes must have an explicit event type');
assert.ok(script.includes('refreshWorkspaces().then(() =>'), 'workspace changes must use a bounded workspace refresh');
assert.ok(script.includes('const selectionChanged = previousWorkspace !== state.selectedWorkspace || previousAgent !== state.selectedAgent'), 'workspace refresh must reconcile changed active selection');
assert.ok(script.includes('renderAgents();'), 'workspace changes must redraw the Agent scope after registry reconciliation');
assert.ok(script.includes("eventType === 'session.changed'"), 'session changes must have an explicit event type');
assert.ok(script.includes('(sessionId.length === 0 || sessionId === state.sessionId)'), 'session events must be filtered to the active session');
assert.ok(script.includes('(agentId.length === 0 || agentId === state.selectedAgent)'), 'session/scope events must be filtered to the active agent');
assert.ok(script.includes('function experienceTabScope(extra)'), 'experience tab events must use an explicit scope payload');
assert.ok(script.includes("broadcastTabEvent('experience.changed'"), 'experience changes must have a dedicated tab event');
assert.ok(script.includes('function tabExperienceScopeMatches(payload)'), 'experience tab events must require the full active scope');
assert.ok(script.includes('if (hostProfileId !== current.hostProfileId) return false;'), 'experience events must reject mixed empty/non-empty host scopes');
assert.ok(script.includes("eventType === 'experience.changed'"), 'experience changes must have an explicit event type');
assert.ok(script.includes("broadcastExperienceChanged('queue.cancelled'"), 'queue cancellation must notify sibling tabs');
assert.ok(script.includes("broadcastExperienceChanged('queue.retried'"), 'queue retry must notify sibling tabs');
assert.ok(script.includes("broadcastExperienceChanged('budget.updated'"), 'budget updates must notify sibling tabs');
assert.ok(script.includes("broadcastExperienceChanged('budget.cleared'"), 'budget clears must notify sibling tabs');
assert.ok(script.includes("broadcastExperienceChanged('provider-usage.updated'"), 'Provider usage refresh must notify sibling tabs');
assert.ok(script.includes("if (state.socket && state.socket.readyState === WebSocket.OPEN) refreshExperience().catch(() => {});"), 'experience events must refresh only the current experience scope');
assert.ok(script.includes("eventType === 'logout'"), 'logout propagation must remain supported');

console.log('web multitab scope smoke ok');
