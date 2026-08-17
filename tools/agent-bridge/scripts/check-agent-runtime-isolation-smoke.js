'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { AgentManager } = require('../src/agent-manager');
const { AgentForkCoordinator } = require('../src/agent-fork-coordinator');
const { MessageQueueManager } = require('../src/agent-experience-manager');
const { createDaemonStore } = require('../src/daemon-store');
const { WorkspaceRegistry } = require('../src/workspace-registry');
const { WorkspaceService } = require('../src/workspace-service');
const { ProviderRegistry } = require('../src/provider-registry');
const { MockProvider } = require('../src/providers/mock-provider');
const { EventType, makeEvent } = require('../src/protocol');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
}

function deterministicChunks(value, seed) {
  const chunks = [];
  let cursor = 0;
  let state = seed;
  while (cursor < value.length) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const width = 1 + (state % 11);
    chunks.push(value.substring(cursor, Math.min(value.length, cursor + width)));
    cursor += width;
  }
  return chunks;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-runtime-isolation-'));
  try {
    const repository = path.join(root, 'repository');
    fs.mkdirSync(repository, { recursive: true });
    run('git', ['init'], repository);
    run('git', ['config', 'user.email', 'smoke@example.invalid'], repository);
    run('git', ['config', 'user.name', 'Smoke'], repository);
    fs.writeFileSync(path.join(repository, 'owned.txt'), 'parent\n', 'utf8');
    run('git', ['add', 'owned.txt'], repository);
    run('git', ['commit', '-m', 'initial'], repository);

    const store = createDaemonStore(path.join(root, 'bridge-home'));
    const workspaceRegistry = new WorkspaceRegistry(store);
    const registry = new ProviderRegistry();
    const provider = new MockProvider();
    registry.register(provider);
    const workspaceService = new WorkspaceService(registry, workspaceRegistry);
    const manager = new AgentManager({ store, workspaceRegistry });
    workspaceService.setAgentManager(manager);
    const coordinator = new AgentForkCoordinator({ agentManager: manager, workspaceService, workspaceRegistry });
    const parent = manager.createPlaceholder({ providerId: 'mock', workspacePath: repository, workspaceTitle: 'Parent' });

    const parentSession = provider.createSession({ workspacePath: parent.rootPath, workspaceTitle: parent.title });
    manager.bindSession(parent.id, parentSession);
    manager.appendUserMessageByAgent(parent.id, { text: 'Use token=super-secret-value and https://user:pass@example.test/history?access_token=history-secret to inspect the queue.' });
    manager.observeBridgeEvent(makeEvent(EventType.TOOL_STARTED, parentSession.sessionId, {
      toolCallId: 'fork_tool',
      name: 'shell.exec',
      input: { credential: 'must-not-leak' }
    }));
    manager.observeBridgeEvent(makeEvent(EventType.TOOL_COMPLETED, parentSession.sessionId, {
      toolCallId: 'fork_tool',
      name: 'shell.exec',
      output: 'must-not-leak',
      status: 'completed'
    }));
    const messageId = parentSession.sessionId + ':assistant:durable';
    manager.observeBridgeEvent(makeEvent(EventType.MESSAGE_DELTA, parentSession.sessionId, {
      role: 'assistant',
      messageId,
      text: 'Complete answer.\n```js\nconst ',
      contentNodes: [{ kind: 'code', language: 'js', text: 'const ' }]
    }));
    manager.observeBridgeEvent(makeEvent(EventType.MESSAGE_DELTA, parentSession.sessionId, {
      role: 'assistant',
      messageId,
      text: 'value = 1;\n```'
    }));
    const completedEvent = makeEvent(EventType.MESSAGE_COMPLETED, parentSession.sessionId, {
      role: 'assistant',
      messageId,
      contentNodes: [{ kind: 'text', text: 'single completion fragment' }]
    });
    manager.observeBridgeEvent(completedEvent);
    assert(Array.isArray(completedEvent.payload.contentNodes), 'completed event should expose canonical rich content nodes');
    assert(completedEvent.payload.contentNodes.some((node) => node.kind === 'code' && node.text.includes('const value = 1;')), 'canonical AST should use the full merged message');
    const parentTimeline = manager.fetchTimeline({ agentId: parent.id, limit: 100 });
    const deltaItems = parentTimeline.items.filter((item) => item.eventType === EventType.MESSAGE_DELTA && item.projectedItem.messageId === messageId);
    assert(deltaItems.every((item) => !Array.isArray(item.projectedItem.contentNodes)), 'streaming deltas must never persist fragment AST state');
    const boundaryItem = parentTimeline.items.find((item) => item.eventType === EventType.MESSAGE_COMPLETED && item.projectedItem.messageId === messageId);
    assert(boundaryItem && boundaryItem.projectedItem.durableMessageId === true, 'completed message should expose a durable boundary cursor');
    const framedText = '随机分帧 keeps one canonical body.\n```ts\nconst label = "完整";\n```\nDone.';
    for (let seed = 1; seed <= 8; seed += 1) {
      const framedMessageId = parentSession.sessionId + ':framed:' + String(seed);
      for (const chunk of deterministicChunks(framedText, seed)) {
        manager.observeBridgeEvent(makeEvent(EventType.MESSAGE_DELTA, parentSession.sessionId, { role: 'assistant', messageId: framedMessageId, text: chunk, contentNodes: [{ kind: 'text', text: chunk }] }));
      }
      const framedCompleted = makeEvent(EventType.MESSAGE_COMPLETED, parentSession.sessionId, { role: 'assistant', messageId: framedMessageId });
      manager.observeBridgeEvent(framedCompleted);
      assert(framedCompleted.payload.text === framedText, 'randomized frame boundaries must preserve the completed canonical body');
      assert(framedCompleted.payload.contentNodes.some((node) => node.kind === 'code' && node.text.includes('const label')), 'randomized frame boundaries must produce the same complete AST');
    }

    const wrongCursor = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      timelineEpoch: boundaryItem.epoch,
      timelineSeq: boundaryItem.seq + 1,
      workspaceMode: 'shared'
    });
    assert(wrongCursor.code === 'fork_boundary_seq_mismatch', 'stale message sequence should be rejected before preview');
    const boundaryPreview = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      timelineEpoch: boundaryItem.epoch,
      timelineSeq: boundaryItem.seq,
      workspaceMode: 'shared',
      title: 'Boundary child'
    });
    assert(boundaryPreview.preview === true && boundaryPreview.workspaceMode === 'shared', 'message fork should preview shared workspace mode');
    assert(boundaryPreview.contextItemCount >= 3 && boundaryPreview.contextDigest.length === 64, 'message fork preview should bind a sanitized context digest');
    const boundaryConfirmed = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      workspaceMode: 'shared',
      forkPlanId: boundaryPreview.forkPlanId,
      confirm: true
    });
    assert(boundaryConfirmed.confirmed === true, 'message fork should confirm after preview');
    assert(boundaryConfirmed.agent.forkContext.boundaryMessageId === messageId, 'child should retain the authoritative message boundary');
    assert(!Object.keys(boundaryConfirmed.agent).includes('pendingForkContext'), 'public Agent records must not expose pending history content');
    const childRecord = manager.find(boundaryConfirmed.agent.id);
    assert(childRecord.pendingForkContext.attachment.content.includes('token=[REDACTED]'), 'fork history should redact secret assignments');
    assert(childRecord.pendingForkContext.attachment.content.includes('https://[REDACTED]@example.test/history?access_token=[REDACTED]'), 'fork history should redact URL credentials');
    assert(!childRecord.pendingForkContext.attachment.content.includes('history-secret'), 'fork history should not expose URL query secrets');
    assert(!childRecord.pendingForkContext.attachment.content.includes('must-not-leak'), 'fork history should exclude raw tool input and output');
    const firstChildPayload = manager.providerMessagePayloadForAgent(boundaryConfirmed.agent.id, { text: 'Continue', clientMessageId: 'fork-first' });
    assert(firstChildPayload.payload.contextItems.some((item) => item.kind === 'chat-history'), 'first child send should inject the fork history attachment');
    const repeatedChildPayload = manager.providerMessagePayloadForAgent(boundaryConfirmed.agent.id, { text: 'Retry', clientMessageId: 'fork-first' });
    assert(!Array.isArray(repeatedChildPayload.payload.contextItems) || !repeatedChildPayload.payload.contextItems.some((item) => item.kind === 'chat-history'), 'retry must not inject fork history twice');
    const repeatedBoundaryConfirm = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      forkPlanId: boundaryPreview.forkPlanId,
      confirm: true
    });
    assert(repeatedBoundaryConfirm.idempotent === true && repeatedBoundaryConfirm.agent.id === boundaryConfirmed.agent.id, 'repeated message fork confirmation should be idempotent');
    const foreignSource = manager.createPlaceholder({ providerId: 'mock', workspacePath: repository, workspaceTitle: 'Foreign source' });
    const foreignPlanReplay = await coordinator.fork(foreignSource.id, { forkPlanId: boundaryPreview.forkPlanId, confirm: true });
    assert(foreignPlanReplay.code === 'fork_plan_source_mismatch', 'consumed fork plans must remain bound to their source Agent');

    const expiredBoundaryPreview = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      timelineEpoch: boundaryItem.epoch,
      timelineSeq: boundaryItem.seq,
      workspaceMode: 'shared'
    });
    coordinator.plans.get(expiredBoundaryPreview.forkPlanId).expiresAt = Date.now() - 1;
    const expiredBoundary = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      forkPlanId: expiredBoundaryPreview.forkPlanId,
      confirm: true
    });
    assert(expiredBoundary.code === 'fork_plan_expired', 'expired message fork plan should be rejected');
    const mismatchPreview = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      timelineEpoch: boundaryItem.epoch,
      timelineSeq: boundaryItem.seq,
      workspaceMode: 'shared'
    });
    const bindingMismatch = await coordinator.fork(parent.id, {
      boundaryMessageId: 'another-message',
      forkPlanId: mismatchPreview.forkPlanId,
      confirm: true
    });
    assert(bindingMismatch.code === 'fork_plan_binding_mismatch', 'confirmation fields must remain bound to the previewed boundary');

    const shared = await coordinator.fork(parent.id, { workspaceMode: 'shared', title: 'Shared child' });
    assert(shared.agent.workspaceMode === 'shared', 'shared fork should remain shared');
    assert(shared.agent.rootPath === parent.rootPath, 'shared fork should reuse parent root');
    assert(shared.agent.runtimeOwnerId !== parent.runtimeOwnerId, 'shared child should own a distinct runtime');

    const preview = await coordinator.fork(parent.id, { workspaceMode: 'isolated', title: 'Isolated child' });
    assert(preview.preview === true && preview.forkPlanId.length > 0, 'isolated fork should return a preview plan');
    assert(!fs.existsSync(preview.worktree.worktreePath), 'preview must not create a worktree');
    const customPath = path.join(root, 'custom-worktree');
    const customPreview = await coordinator.fork(parent.id, {
      workspaceMode: 'isolated',
      worktreePath: customPath,
      branch: 'ngf/custom-isolation',
      title: 'Custom isolated child'
    });
    assert(customPreview.worktree.worktreePath === path.resolve(customPath), 'isolated fork should preserve a custom worktree path');
    const expiredPlan = coordinator.plans.get(customPreview.forkPlanId);
    expiredPlan.expiresAt = Date.now() - 1;
    const expired = await coordinator.fork(parent.id, { workspaceMode: 'isolated', forkPlanId: customPreview.forkPlanId, confirm: true });
    assert(expired.code === 'fork_plan_expired', 'expired isolated fork plan should be rejected');
    const confirmed = await coordinator.fork(parent.id, { workspaceMode: 'isolated', forkPlanId: preview.forkPlanId, confirm: true });
    assert(confirmed.confirmed === true, 'isolated fork should confirm');
    assert(confirmed.agent.workspaceMode === 'isolated', 'isolated child should record workspace mode');
    assert(confirmed.agent.rootPath === path.resolve(preview.worktree.worktreePath), 'isolated child should own worktree root');
    assert(confirmed.agent.worktreeId === confirmed.agent.workspaceId, 'isolated child should use workspace id as worktree id');
    assert(fs.existsSync(path.join(confirmed.agent.rootPath, 'owned.txt')), 'isolated worktree should contain repository files');

    const repeated = await coordinator.fork(parent.id, { workspaceMode: 'isolated', forkPlanId: preview.forkPlanId, confirm: true });
    assert(repeated.idempotent === true, 'repeated confirmation should be idempotent');
    assert(repeated.agent.id === confirmed.agent.id, 'repeated confirmation should return the same child');

    const mismatch = manager.validateResourceScope(confirmed.agent.id, { workspaceId: parent.workspaceId, workspacePath: parent.rootPath }, { write: true });
    assert(mismatch.code === 'agent_resource_scope_mismatch', 'cross-workspace access should be rejected');

    const session = provider.createSession({ workspacePath: confirmed.agent.rootPath, workspaceTitle: confirmed.agent.title });
    manager.bindSession(confirmed.agent.id, session);
    const sessionMismatch = manager.validateResourceScope(confirmed.agent.id, { sessionId: 'foreign-session' }, { write: true });
    assert(sessionMismatch.code === 'agent_resource_scope_mismatch', 'foreign provider session should be rejected');
    assert(manager.find(confirmed.agent.id).providerSessionId !== manager.find(parent.id).providerSessionId, 'parent and child provider sessions must differ');

    const boundaryIsolatedPreview = await coordinator.fork(parent.id, {
      boundaryMessageId: messageId,
      timelineEpoch: boundaryItem.epoch,
      timelineSeq: boundaryItem.seq,
      workspaceMode: 'isolated',
      title: 'Boundary isolated child'
    });
    assert(boundaryIsolatedPreview.preview === true && boundaryIsolatedPreview.worktree.ok === true, 'message fork should preview isolated worktree creation');
    const boundaryIsolated = await coordinator.fork(parent.id, {
      forkPlanId: boundaryIsolatedPreview.forkPlanId,
      confirm: true
    });
    assert(boundaryIsolated.confirmed === true && boundaryIsolated.agent.workspaceMode === 'isolated', 'message fork should confirm isolated worktree mode');

    const boundarySession = provider.createSession({ workspacePath: boundaryIsolated.agent.rootPath, workspaceTitle: boundaryIsolated.agent.title });
    manager.bindSession(boundaryIsolated.agent.id, boundarySession);
    const queue = new MessageQueueManager(store);
    const queued = queue.enqueue({ sessionId: boundarySession.sessionId, text: 'Continue from the fork boundary.' });
    const initialQueuedPayload = queue.state().items.find((item) => item.id === queued.item.id).payload;
    const preparedPayload = manager.providerMessagePayloadForSession(boundarySession.sessionId, initialQueuedPayload);
    assert(preparedPayload.contextItems.filter((item) => item.kind === 'chat-history').length === 1, 'queued first send should inject exactly one history attachment');
    assert(preparedPayload.clientMessageId.length > 0, 'generated clientMessageId must be persisted into the queue payload');
    queue.persistPayload(preparedPayload);
    assert(queue.state().items.find((item) => item.id === queued.item.id).payload.contextItems.some((item) => item.kind === 'chat-history'), 'internal queue state must retain the attachment for a failed retry');
    const publicQueuedItem = queue.list({ sessionId: boundarySession.sessionId }).items.find((item) => item.id === queued.item.id);
    assert(!Array.isArray(publicQueuedItem.payload.contextItems) || !publicQueuedItem.payload.contextItems.some((item) => item.kind === 'chat-history'), 'public queue results must not expose internal fork history content');
    manager.markPendingForkContextConsumedForSession(boundarySession.sessionId, preparedPayload);
    queue.update(queue.state().items.find((item) => item.id === queued.item.id), 'failed', 'provider_error', 'simulated failure');
    queue.retry({ queueId: queued.item.id });
    const retryPayload = queue.state().items.find((item) => item.id === queued.item.id).payload;
    const preparedRetryPayload = manager.providerMessagePayloadForSession(boundarySession.sessionId, retryPayload);
    assert(preparedRetryPayload.contextItems.filter((item) => item.kind === 'chat-history').length === 1, 'failed retry must retain, but never duplicate, the persisted history attachment');
    queue.update(queue.state().items.find((item) => item.id === queued.item.id), 'accepted');
    const acceptedPayload = queue.state().items.find((item) => item.id === queued.item.id).payload;
    assert(!Array.isArray(acceptedPayload.contextItems) || !acceptedPayload.contextItems.some((item) => item.kind === 'chat-history'), 'accepted queue entries must clean up persisted fork history content');

    const reloadedManager = new AgentManager({ store: createDaemonStore(path.join(root, 'bridge-home')), workspaceRegistry });
    const reloadedPayload = reloadedManager.providerMessagePayloadForAgent(boundaryConfirmed.agent.id, { text: 'After restart', clientMessageId: 'fork-second' });
    assert(!Array.isArray(reloadedPayload.payload.contextItems) || !reloadedPayload.payload.contextItems.some((item) => item.kind === 'chat-history'), 'consumed fork context must remain consumed after daemon reload');
    const reloadedTimeline = reloadedManager.fetchTimeline({ agentId: parent.id, cursor: String(boundaryItem.seq - 1), direction: 'after', limit: 2 });
    const reloadedBoundary = reloadedTimeline.items.find((item) => item.eventType === EventType.MESSAGE_COMPLETED && item.projectedItem.messageId === messageId);
    assert(reloadedBoundary.projectedItem.contentNodes.some((node) => node.kind === 'code' && node.text.includes('const value = 1;')), 'canonical completed AST must survive timeline persistence and reload');

    manager.archive(confirmed.agent.id, { cascade: false });
    const archivedScope = manager.resourceScope(confirmed.agent.id, { write: true });
    assert(archivedScope.code === 'agent_write_access_revoked', 'archived Agent write access should be revoked');
    console.log('agent runtime isolation smoke ok');
  } finally {
    const resolved = path.resolve(root);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
