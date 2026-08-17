'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChatRoomManager, RoomRole } = require('../src/chat-room-manager');

function temporaryDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-' + name + '-'));
}

function storeFor(directory) {
  const chat = path.join(directory, 'chat');
  fs.mkdirSync(chat, { recursive: true });
  return { paths: { chat } };
}

function confirm(manager, method, payload) {
  const preview = manager[method](payload);
  assert.strictEqual(preview.ok, true, method + ' preview failed');
  assert.strictEqual(preview.preview, true, method + ' should preview');
  const confirmedPayload = Object.assign({}, payload, { confirm: true, planId: preview.planId });
  const result = manager[method](confirmedPayload);
  assert.strictEqual(result.ok, true, method + ' confirm failed');
  assert.strictEqual(result.confirmed, true);
  return result;
}

function createRoom(manager, actorId, name) {
  const preview = manager.create({ _actorId: actorId, actorDisplayName: actorId, name, purpose: 'Coordinate implementation.' });
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.preview, true);
  assert.strictEqual(manager.list({ _actorId: actorId }).rooms.length, 0, 'room preview must not persist');
  const result = manager.create({ _actorId: actorId, confirm: true, planId: preview.planId });
  assert.strictEqual(result.ok, true);
  return result.room;
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for Chat Room state.');
}

async function checkMembersPermissionsAndRouting() {
  const directory = temporaryDirectory('chat-room');
  const dispatches = [];
  const events = [];
  const manager = new ChatRoomManager({
    store: storeFor(directory),
    resolveAgent: (agentId) => agentId.startsWith('agt_') ? { id: agentId } : null,
    dispatchAgent: async (input) => {
      dispatches.push(input);
      return { ok: true, agentId: input.agentId, output: 'Agent response for ' + input.message.body };
    },
    onUpdated: (event) => events.push(event)
  });
  const ownerId = 'human:owner';
  const room = createRoom(manager, ownerId, 'M7 Room');
  assert.strictEqual(room.currentRole, RoomRole.OWNER);

  const viewer = { memberId: 'human:viewer', type: 'human', displayName: 'Viewer', role: RoomRole.VIEWER };
  confirm(manager, 'memberAdd', { _actorId: ownerId, roomId: room.id, member: viewer });
  const deniedPost = manager.messagePost({ _actorId: viewer.memberId, roomId: room.id, clientMessageId: 'viewer-1', body: 'blocked' });
  assert.strictEqual(deniedPost.failureCategory, 'chat_permission_denied');
  confirm(manager, 'memberUpdate', { _actorId: ownerId, roomId: room.id, memberId: viewer.memberId, role: RoomRole.MEMBER });

  const agentMember = { memberId: 'agent:agt_one', type: 'agent', agentId: 'agt_one', displayName: 'Agent One', role: RoomRole.AGENT };
  confirm(manager, 'memberAdd', { _actorId: ownerId, roomId: room.id, member: agentMember });
  const missingAgent = manager.memberAdd({ _actorId: ownerId, roomId: room.id, member: { memberId: 'agent:missing', type: 'agent', agentId: 'missing' } });
  assert.strictEqual(missingAgent.failureCategory, 'chat_agent_not_found');

  const posted = manager.messagePost({
    _actorId: viewer.memberId,
    roomId: room.id,
    clientMessageId: 'message-1',
    body: 'Please inspect this.',
    mentionMemberIds: [agentMember.memberId]
  });
  assert.strictEqual(posted.ok, true);
  assert.strictEqual(posted.dispatchedAgentCount, 1);
  const duplicate = manager.messagePost({
    _actorId: viewer.memberId,
    roomId: room.id,
    clientMessageId: 'message-1',
    body: 'This replacement must be ignored.',
    mentionMemberIds: [agentMember.memberId]
  });
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual(duplicate.message.id, posted.message.id);

  await waitFor(() => manager.messageList({ _actorId: ownerId, roomId: room.id, limit: 20 }).messages.length === 2, 1000);
  const messages = manager.messageList({ _actorId: ownerId, roomId: room.id, limit: 20 }).messages;
  assert.strictEqual(messages[0].seq, 1);
  assert.strictEqual(messages[1].seq, 2);
  assert.strictEqual(messages[1].authorType, 'agent');
  assert.strictEqual(messages[1].routeOriginMessageId, messages[0].id);
  assert.deepStrictEqual(messages[1].mentionMemberIds, [], 'Agent response must not fan out recursively');
  assert.strictEqual(dispatches.length, 1);

  const blockedLoop = manager.messagePost({
    _actorId: agentMember.memberId,
    roomId: room.id,
    clientMessageId: 'agent-loop-1',
    body: 'Agent tries to mention itself.',
    mentionMemberIds: [agentMember.memberId]
  });
  assert.strictEqual(blockedLoop.failureCategory, 'chat_agent_loop_blocked');
  assert.strictEqual(events.some((item) => item.kind === 'message.created'), true);

  const ack = manager.ack({ _actorId: ownerId, roomId: room.id, lastSeq: 1 });
  assert.strictEqual(ack.unreadCount, 1);
  const monotonic = manager.ack({ _actorId: ownerId, roomId: room.id, lastSeq: 0 });
  assert.strictEqual(monotonic.ack.lastSeq, 1);

  const moderator = { memberId: 'human:moderator', type: 'human', displayName: 'Moderator', role: RoomRole.MODERATOR };
  confirm(manager, 'memberAdd', { _actorId: ownerId, roomId: room.id, member: moderator });
  const promoteDenied = manager.memberUpdate({ _actorId: moderator.memberId, roomId: room.id, memberId: viewer.memberId, role: RoomRole.OWNER });
  assert.strictEqual(promoteDenied.failureCategory, 'chat_permission_denied');
  const lastOwnerDenied = manager.memberRemove({ _actorId: ownerId, roomId: room.id, memberId: ownerId });
  assert.strictEqual(lastOwnerDenied.failureCategory, 'chat_owner_required');

  confirm(manager, 'memberRemove', { _actorId: ownerId, roomId: room.id, memberId: viewer.memberId });
  assert.strictEqual(manager.get({ _actorId: viewer.memberId, roomId: room.id }).failureCategory, 'chat_permission_denied');
  fs.rmSync(directory, { recursive: true, force: true });
}

async function checkPaginationFanoutArchiveAndRecovery() {
  const directory = temporaryDirectory('chat-pages');
  const store = storeFor(directory);
  const manager = new ChatRoomManager({
    store,
    resolveAgent: (agentId) => ({ id: agentId }),
    dispatchAgent: async (input) => ({ ok: true, output: 'response from ' + input.agentId })
  });
  const ownerId = 'human:owner2';
  const room = createRoom(manager, ownerId, 'Paging Room');
  const agentMembers = [];
  for (let index = 0; index < 6; index += 1) {
    const member = { memberId: 'agent:agt_' + String(index), type: 'agent', agentId: 'agt_' + String(index), role: RoomRole.AGENT };
    agentMembers.push(member);
    confirm(manager, 'memberAdd', { _actorId: ownerId, roomId: room.id, member });
  }
  const fanout = manager.messagePost({
    _actorId: ownerId,
    roomId: room.id,
    clientMessageId: 'fanout',
    body: 'too broad',
    mentionMemberIds: agentMembers.map((item) => item.memberId)
  });
  assert.strictEqual(fanout.failureCategory, 'chat_mention_fanout_limit');

  for (let index = 0; index < 5; index += 1) {
    const result = manager.messagePost({ _actorId: ownerId, roomId: room.id, clientMessageId: 'plain-' + String(index), body: 'Message ' + String(index) });
    assert.strictEqual(result.ok, true);
  }
  const firstPage = manager.messageList({ _actorId: ownerId, roomId: room.id, afterSeq: 0, limit: 2 });
  assert.deepStrictEqual(firstPage.messages.map((item) => item.seq), [1, 2]);
  assert.strictEqual(firstPage.nextAfterSeq, 2);
  const secondPage = manager.messageList({ _actorId: ownerId, roomId: room.id, afterSeq: firstPage.nextAfterSeq, limit: 2 });
  assert.deepStrictEqual(secondPage.messages.map((item) => item.seq), [3, 4]);
  const backwards = manager.messageList({ _actorId: ownerId, roomId: room.id, beforeSeq: 5, limit: 2 });
  assert.deepStrictEqual(backwards.messages.map((item) => item.seq), [3, 4]);

  const archive = confirm(manager, 'archive', { _actorId: ownerId, roomId: room.id });
  assert.strictEqual(archive.room.archivedAt.length > 0, true);
  assert.strictEqual(manager.messagePost({ _actorId: ownerId, roomId: room.id, clientMessageId: 'after-archive', body: 'blocked' }).failureCategory, 'chat_room_archived');
  assert.strictEqual(manager.messageList({ _actorId: ownerId, roomId: room.id, limit: 20 }).messages.length, 5);

  const reloaded = new ChatRoomManager({ store, resolveAgent: () => null, dispatchAgent: async () => ({ ok: true }) });
  assert.strictEqual(reloaded.list({ _actorId: ownerId, includeArchived: true }).rooms.length, 1);
  assert.strictEqual(reloaded.messageList({ _actorId: ownerId, roomId: room.id, limit: 20 }).messages.length, 5);

  const statePath = path.join(store.paths.chat, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.messages[0].deliveries = [{ memberId: 'agent:agt_0', agentId: 'agt_0', status: 'running' }];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  const recovered = new ChatRoomManager({ store, resolveAgent: () => null, dispatchAgent: async () => ({ ok: true }) });
  const recoveredMessage = recovered.messageList({ _actorId: ownerId, roomId: room.id, limit: 20 }).messages[0];
  assert.strictEqual(recoveredMessage.deliveries[0].status, 'interrupted');
  assert.strictEqual(recoveredMessage.deliveries[0].failureCategory, 'daemon_restart');
  fs.rmSync(directory, { recursive: true, force: true });
}

async function main() {
  await checkMembersPermissionsAndRouting();
  await checkPaginationFanoutArchiveAndRecovery();
  console.log('chat room manager smoke passed: roles=true idempotency=true sequence=true ack=true pagination=true fanout=true archive=true recovery=true');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
