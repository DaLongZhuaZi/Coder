'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  rememberAutomationResult,
  runtimeEventWorkspaceId,
  sendScopedAutomationRuntimeEvent
} = require('../src/automation-event-router');

function connection(connectionId) {
  return {
    connectionId,
    messages: [],
    sendJson(message) {
      this.messages.push(message);
    }
  };
}

function main() {
  const workspaceA = connection('automation-a');
  const workspaceB = connection('automation-b');
  const noScope = connection('automation-none');
  rememberAutomationResult(workspaceA, 'schedule', {
    ok: true,
    schedule: { scheduleId: 'schedule-a', workspaceId: 'workspace-a' }
  });
  rememberAutomationResult(workspaceB, 'loop', {
    ok: true,
    loop: { loopId: 'loop-b', workspaceId: 'workspace-b' }
  });

  const eventA = {
    type: 'event',
    event: 'message.delta',
    sessionId: 'session-a',
    payload: { agentId: 'agent-a' }
  };
  assert.strictEqual(runtimeEventWorkspaceId(eventA, (agentId) => agentId === 'agent-a' ? 'workspace-a' : ''), 'workspace-a', 'runtime event should resolve workspace from agent');
  assert.strictEqual(sendScopedAutomationRuntimeEvent(new Set([workspaceA, workspaceB, noScope]), eventA, (agentId) => agentId === 'agent-a' ? 'workspace-a' : ''), 1, 'runtime event should route only to matching workspace');
  assert.strictEqual(workspaceA.messages.length, 1, 'matching workspace should receive runtime event');
  assert.strictEqual(workspaceB.messages.length, 0, 'other workspace must not receive runtime event');
  assert.strictEqual(noScope.messages.length, 0, 'unsubscribed connection must not receive runtime event');

  const eventB = {
    type: 'event',
    event: 'session.created',
    payload: { session: { sessionId: 'session-b', workspaceId: 'workspace-b' } }
  };
  assert.strictEqual(sendScopedAutomationRuntimeEvent(new Set([workspaceA, workspaceB]), eventB), 1, 'nested session workspace should route');
  assert.strictEqual(workspaceB.messages.length, 1, 'workspace B should receive its runtime event');
  assert.strictEqual(sendScopedAutomationRuntimeEvent(new Set([workspaceA, workspaceB]), {
    type: 'event',
    event: 'message.delta',
    payload: { text: 'missing scope' }
  }), 0, 'runtime event without workspace or resolvable agent must be dropped');

  const routerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'automation-event-router.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(routerSource.includes('sendScopedAutomationRuntimeEvent'), 'automation router should export runtime event scope');
  assert.ok(serverSource.includes('sendScopedAutomationRuntimeEvent'), 'server should scope automation runtime messages');
  assert.ok(serverSource.includes('function sendAutomationClientMessage'), 'server should retain automation callback boundary');
  assert.ok(serverSource.includes('sendScopedAutomationRuntimeEvent(activeWsConnections, message'), 'automation callback must use scoped runtime router');
  console.log('automation runtime event scope smoke ok');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
