'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomId, writeJsonFileAtomic } = require('./daemon-store');

const STATE_SCHEMA_VERSION = 1;
const PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_ROOMS = 500;
const MAX_MEMBERS = 100;
const MAX_AGENT_FANOUT = 5;
const MAX_MESSAGE_BYTES = 128 * 1024;
const DEFAULT_RETENTION_MESSAGES = 5000;
const MAX_PAGE_LIMIT = 200;

const RoomRole = Object.freeze({
  OWNER: 'owner',
  MODERATOR: 'moderator',
  MEMBER: 'member',
  VIEWER: 'viewer',
  AGENT: 'agent'
});

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function numberValue(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function booleanValue(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function boundedInteger(value, fallbackValue, minimum, maximum) {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallbackValue;
  return Math.min(Math.max(candidate, minimum), maximum);
}

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function truncateUtf8(value, maximumBytes) {
  const source = typeof value === 'string' ? value : '';
  const buffer = Buffer.from(source, 'utf8');
  if (buffer.length <= maximumBytes) return source;
  let end = maximumBytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString('utf8');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalValue(item)).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalValue(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalValue(value), 'utf8').digest('hex');
}

function failure(action, category, message, remediation) {
  return {
    ok: false,
    action,
    failureCategory: category,
    message,
    remediation: typeof remediation === 'string' ? remediation : '',
    updatedAt: new Date().toISOString()
  };
}

function normalizeActorId(value) {
  const actorId = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9._:@-]{1,160}$/.test(actorId)) {
    throw Object.assign(new Error('Chat actor identity is invalid.'), { code: 'chat_actor_invalid' });
  }
  return actorId;
}

function normalizeRoomRole(value, memberType) {
  const role = typeof value === 'string' && value.length > 0 ? value : (memberType === 'agent' ? RoomRole.AGENT : RoomRole.MEMBER);
  if (!Object.values(RoomRole).includes(role)) throw Object.assign(new Error('Chat member role is invalid.'), { code: 'chat_role_invalid' });
  if (memberType === 'agent' && role !== RoomRole.AGENT && role !== RoomRole.VIEWER) {
    throw Object.assign(new Error('Agent members may only use agent or viewer role.'), { code: 'chat_role_invalid' });
  }
  if (memberType !== 'agent' && role === RoomRole.AGENT) throw Object.assign(new Error('Human members cannot use agent role.'), { code: 'chat_role_invalid' });
  return role;
}

function normalizeMember(source, nowMs) {
  const value = objectValue(source);
  const type = text(value, 'type', text(value, 'agentId', '').length > 0 ? 'agent' : 'human');
  if (type !== 'human' && type !== 'agent' && type !== 'system') throw Object.assign(new Error('Chat member type is invalid.'), { code: 'chat_member_invalid' });
  const agentId = type === 'agent' ? text(value, 'agentId', '').trim() : '';
  if (type === 'agent' && agentId.length === 0) throw Object.assign(new Error('Agent member requires agentId.'), { code: 'chat_agent_required' });
  const memberId = text(value, 'memberId', type === 'agent' ? 'agent:' + agentId : '').trim();
  if (!/^[A-Za-z0-9._:@-]{1,160}$/.test(memberId)) throw Object.assign(new Error('Chat memberId is invalid.'), { code: 'chat_member_invalid' });
  return {
    memberId,
    type,
    agentId,
    displayName: truncateUtf8(text(value, 'displayName', memberId).trim() || memberId, 512),
    role: normalizeRoomRole(text(value, 'role', ''), type),
    active: booleanValue(value, 'active', true),
    joinedAt: text(value, 'joinedAt', nowIso(nowMs)),
    leftAt: text(value, 'leftAt', ''),
    updatedAt: text(value, 'updatedAt', nowIso(nowMs))
  };
}

function normalizeRoom(source, nowMs) {
  const value = objectValue(source);
  const members = [];
  const memberIds = new Set();
  for (const item of Array.isArray(value.members) ? value.members.slice(0, MAX_MEMBERS) : []) {
    const member = normalizeMember(item, nowMs);
    if (!memberIds.has(member.memberId)) {
      members.push(member);
      memberIds.add(member.memberId);
    }
  }
  return {
    id: text(value, 'id', randomId('room')),
    name: truncateUtf8(text(value, 'name', 'Room').trim() || 'Room', 512),
    purpose: truncateUtf8(text(value, 'purpose', '').trim(), 8192),
    workspaceId: text(value, 'workspaceId', ''),
    sequence: boundedInteger(numberValue(value, 'sequence', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    retentionMaxMessages: boundedInteger(numberValue(value, 'retentionMaxMessages', DEFAULT_RETENTION_MESSAGES), DEFAULT_RETENTION_MESSAGES, 100, 50000),
    members,
    archivedAt: text(value, 'archivedAt', ''),
    createdAt: text(value, 'createdAt', nowIso(nowMs)),
    updatedAt: text(value, 'updatedAt', nowIso(nowMs)),
    revision: boundedInteger(numberValue(value, 'revision', 1), 1, 1, Number.MAX_SAFE_INTEGER)
  };
}

function normalizeDelivery(source, nowMs) {
  const value = objectValue(source);
  const status = text(value, 'status', 'failed');
  return {
    memberId: text(value, 'memberId', ''),
    agentId: text(value, 'agentId', ''),
    status: status === 'running' || status === 'pending' ? 'interrupted' : status,
    responseMessageId: text(value, 'responseMessageId', ''),
    failureCategory: status === 'running' || status === 'pending' ? 'daemon_restart' : text(value, 'failureCategory', ''),
    message: status === 'running' || status === 'pending' ? 'Agent mention dispatch was interrupted by daemon restart.' : text(value, 'message', ''),
    updatedAt: text(value, 'updatedAt', nowIso(nowMs))
  };
}

function normalizeMessage(source, nowMs) {
  const value = objectValue(source);
  return {
    id: text(value, 'id', randomId('msg')),
    roomId: text(value, 'roomId', ''),
    seq: boundedInteger(numberValue(value, 'seq', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    clientMessageId: text(value, 'clientMessageId', ''),
    authorMemberId: text(value, 'authorMemberId', ''),
    authorType: text(value, 'authorType', 'human'),
    authorAgentId: text(value, 'authorAgentId', ''),
    body: truncateUtf8(text(value, 'body', ''), MAX_MESSAGE_BYTES),
    replyToMessageId: text(value, 'replyToMessageId', ''),
    threadId: text(value, 'threadId', ''),
    mentionMemberIds: Array.isArray(value.mentionMemberIds) ? value.mentionMemberIds.filter((item) => typeof item === 'string').slice(0, MAX_AGENT_FANOUT) : [],
    routeOriginMessageId: text(value, 'routeOriginMessageId', ''),
    routingDepth: boundedInteger(numberValue(value, 'routingDepth', 0), 0, 0, 1),
    deliveries: Array.isArray(value.deliveries) ? value.deliveries.map((item) => normalizeDelivery(item, nowMs)) : [],
    createdAt: text(value, 'createdAt', nowIso(nowMs)),
    updatedAt: text(value, 'updatedAt', nowIso(nowMs))
  };
}

class ChatRoomManager {
  constructor(options) {
    const source = objectValue(options);
    this.store = source.store || null;
    this.directory = this.store && this.store.paths ? this.store.paths.chat : path.join(process.cwd(), '.agent-bridge-chat');
    this.statePath = path.join(this.directory, 'state.json');
    this.dispatchAgent = typeof source.dispatchAgent === 'function' ? source.dispatchAgent : null;
    this.resolveAgent = typeof source.resolveAgent === 'function' ? source.resolveAgent : () => null;
    this.onUpdated = typeof source.onUpdated === 'function' ? source.onUpdated : () => {};
    this.clock = typeof source.clock === 'function' ? source.clock : () => Date.now();
    this.rooms = new Map();
    this.messagesByRoom = new Map();
    this.acksByRoom = new Map();
    this.pendingDispatches = new Map();
    this.plans = new Map();
    this.loadWarnings = [];
    fs.mkdirSync(this.directory, { recursive: true });
    this.load();
  }

  isAvailable() {
    return this.dispatchAgent !== null;
  }

  load() {
    if (!fs.existsSync(this.statePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const source = objectValue(parsed);
      for (const item of Array.isArray(source.rooms) ? source.rooms.slice(0, MAX_ROOMS) : []) {
        const room = normalizeRoom(item, this.clock());
        this.rooms.set(room.id, room);
        this.messagesByRoom.set(room.id, []);
        this.acksByRoom.set(room.id, new Map());
      }
      for (const item of Array.isArray(source.messages) ? source.messages : []) {
        const message = normalizeMessage(item, this.clock());
        if (!this.rooms.has(message.roomId)) continue;
        this.messagesByRoom.get(message.roomId).push(message);
        const room = this.rooms.get(message.roomId);
        room.sequence = Math.max(room.sequence, message.seq);
      }
      for (const item of Array.isArray(source.acks) ? source.acks : []) {
        const value = objectValue(item);
        const roomId = text(value, 'roomId', '');
        const memberId = text(value, 'memberId', '');
        if (this.acksByRoom.has(roomId) && memberId.length > 0) {
          this.acksByRoom.get(roomId).set(memberId, {
            roomId,
            memberId,
            lastSeq: boundedInteger(numberValue(value, 'lastSeq', 0), 0, 0, Number.MAX_SAFE_INTEGER),
            updatedAt: text(value, 'updatedAt', nowIso(this.clock()))
          });
        }
      }
      for (const room of this.rooms.values()) this.pruneRoomMessages(room);
      this.persist();
    } catch (_error) {
      this.rooms.clear();
      this.messagesByRoom.clear();
      this.acksByRoom.clear();
      this.loadWarnings.push('Chat room state was corrupt and was ignored.');
    }
  }

  persist() {
    const messages = [];
    const acks = [];
    for (const items of this.messagesByRoom.values()) messages.push(...items);
    for (const roomAcks of this.acksByRoom.values()) for (const item of roomAcks.values()) acks.push(item);
    writeJsonFileAtomic(this.statePath, {
      schemaVersion: STATE_SCHEMA_VERSION,
      rooms: Array.from(this.rooms.values()),
      messages,
      acks,
      updatedAt: nowIso(this.clock())
    });
  }

  status() {
    let messages = 0;
    for (const items of this.messagesByRoom.values()) messages += items.length;
    return {
      ok: true,
      action: 'chat.room.status',
      available: this.isAvailable(),
      rooms: this.rooms.size,
      activeRooms: Array.from(this.rooms.values()).filter((item) => item.archivedAt.length === 0).length,
      messages,
      pendingDispatches: this.pendingDispatches.size,
      warnings: this.loadWarnings.slice(),
      updatedAt: nowIso(this.clock())
    };
  }

  list(payload) {
    const actor = this.actor(payload);
    if (!actor.ok) return actor;
    const includeArchived = booleanValue(payload, 'includeArchived', false);
    const query = text(payload, 'query', '').trim().toLowerCase();
    const rooms = Array.from(this.rooms.values())
      .filter((room) => includeArchived || room.archivedAt.length === 0)
      .filter((room) => this.activeMember(room, actor.actorId) !== null)
      .filter((room) => query.length === 0 || room.name.toLowerCase().includes(query) || room.purpose.toLowerCase().includes(query))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((room) => this.publicRoom(room, actor.actorId));
    return { ok: true, action: 'chat.room.list', rooms, total: rooms.length, updatedAt: nowIso(this.clock()) };
  }

  get(payload) {
    const access = this.roomAccess(payload, 'read');
    if (!access.ok) return access;
    return { ok: true, action: 'chat.room.get', room: this.publicRoom(access.room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  create(payload) {
    const action = 'chat.room.create';
    const actor = this.actor(payload);
    if (!actor.ok) return actor;
    if (booleanValue(payload, 'confirm', false)) {
      const consumed = this.consumePlan(action, text(payload, 'planId', ''), '');
      if (!consumed.ok) return consumed;
      if (this.rooms.size >= MAX_ROOMS) return failure(action, 'chat_room_limit_reached', 'Chat Room storage limit was reached.');
      const planned = consumed.plan.binding.room;
      if (!planned.members.some((member) => member.memberId === actor.actorId)) return failure(action, 'plan_stale', 'Chat Room create plan belongs to another actor.', 'Preview the operation again.');
      if (Array.from(this.rooms.values()).some((room) => room.archivedAt.length === 0 && room.name.toLowerCase() === planned.name.toLowerCase())) return failure(action, 'chat_room_name_taken', 'An active Chat Room already uses this name.');
      this.rooms.set(planned.id, planned);
      this.messagesByRoom.set(planned.id, []);
      this.acksByRoom.set(planned.id, new Map());
      this.persist();
      this.emit('room.created', planned, { room: this.publicRoom(planned, actor.actorId) });
      return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, room: this.publicRoom(planned, actor.actorId), updatedAt: nowIso(this.clock()) };
    }
    const name = truncateUtf8(text(payload, 'name', '').trim(), 512);
    if (name.length === 0) return failure(action, 'chat_room_name_required', 'Chat room name is required.');
    if (Array.from(this.rooms.values()).some((room) => room.archivedAt.length === 0 && room.name.toLowerCase() === name.toLowerCase())) return failure(action, 'chat_room_name_taken', 'An active Chat Room already uses this name.');
    const room = normalizeRoom({
      id: randomId('room'),
      name,
      purpose: text(payload, 'purpose', ''),
      workspaceId: text(payload, 'workspaceId', ''),
      retentionMaxMessages: numberValue(payload, 'retentionMaxMessages', DEFAULT_RETENTION_MESSAGES),
      members: [{ memberId: actor.actorId, type: 'human', displayName: text(payload, 'actorDisplayName', actor.actorId), role: RoomRole.OWNER }]
    }, this.clock());
    const plan = this.createPlan(action, room.id, { room });
    return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, room: this.publicRoom(room, actor.actorId), updatedAt: nowIso(this.clock()) };
  }

  update(payload) {
    const action = 'chat.room.update';
    const access = this.roomAccess(payload, 'manage');
    if (!access.ok) return access;
    const room = access.room;
    const nextName = truncateUtf8(text(payload, 'name', room.name).trim(), 512);
    if (nextName.length === 0) return failure(action, 'chat_room_name_required', 'Chat room name is required.');
    if (Array.from(this.rooms.values()).some((item) => item.id !== room.id && item.archivedAt.length === 0 && item.name.toLowerCase() === nextName.toLowerCase())) return failure(action, 'chat_room_name_taken', 'An active Chat Room already uses this name.');
    const changes = {
      name: nextName,
      purpose: truncateUtf8(text(payload, 'purpose', room.purpose), 8192),
      retentionMaxMessages: boundedInteger(numberValue(payload, 'retentionMaxMessages', room.retentionMaxMessages), room.retentionMaxMessages, 100, 50000),
      expectedRevision: room.revision
    };
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, room.id, changes);
      const previewRoom = Object.assign({}, room, changes);
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, room: this.publicRoom(previewRoom, access.actorId), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), room.id);
    if (!consumed.ok) return consumed;
    if (room.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Chat Room changed after preview.', 'Preview the update again.');
    room.name = consumed.plan.binding.name;
    room.purpose = consumed.plan.binding.purpose;
    room.retentionMaxMessages = consumed.plan.binding.retentionMaxMessages;
    this.touchRoom(room);
    this.pruneRoomMessages(room);
    this.persist();
    this.emit('room.updated', room, { room: this.publicRoom(room, access.actorId) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  archive(payload) {
    const action = 'chat.room.archive';
    const access = this.roomAccess(payload, 'owner');
    if (!access.ok) return access;
    const room = access.room;
    if (room.archivedAt.length > 0) return { ok: true, action, preview: false, confirmed: true, room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, room.id, { expectedRevision: room.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), room.id);
    if (!consumed.ok) return consumed;
    if (room.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Chat Room changed after preview.', 'Preview archive again.');
    room.archivedAt = nowIso(this.clock());
    this.touchRoom(room);
    this.persist();
    this.emit('room.archived', room, { room: this.publicRoom(room, access.actorId) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  memberAdd(payload) {
    const action = 'chat.room.member.add';
    const access = this.roomAccess(payload, 'manage');
    if (!access.ok) return access;
    const room = access.room;
    if (room.archivedAt.length > 0) return failure(action, 'chat_room_archived', 'Archived Chat Rooms cannot change members.');
    let member;
    try {
      member = normalizeMember(objectValue(payload.member), this.clock());
    } catch (error) {
      return this.failureFromError(action, error);
    }
    if (member.type === 'agent' && !this.resolveAgent(member.agentId)) return failure(action, 'chat_agent_not_found', 'Agent member was not found.');
    if (room.members.some((item) => item.memberId === member.memberId && item.active)) return failure(action, 'chat_member_exists', 'Chat member is already active.');
    if (room.members.filter((item) => item.active).length >= MAX_MEMBERS) return failure(action, 'chat_member_limit_reached', 'Chat Room member limit was reached.');
    if (member.role === RoomRole.OWNER && this.roleFor(room, access.actorId) !== RoomRole.OWNER) return failure(action, 'chat_permission_denied', 'Only an owner can add another owner.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, room.id, { expectedRevision: room.revision, member });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, member, room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), room.id);
    if (!consumed.ok) return consumed;
    if (room.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Chat Room changed after preview.', 'Preview member addition again.');
    const planned = consumed.plan.binding.member;
    const existing = room.members.find((item) => item.memberId === planned.memberId);
    if (existing) Object.assign(existing, planned, { active: true, leftAt: '', updatedAt: nowIso(this.clock()) });
    else room.members.push(planned);
    this.touchRoom(room);
    this.persist();
    this.emit('member.updated', room, { member: cloneJson(planned) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, member: cloneJson(planned), room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  memberUpdate(payload) {
    const action = 'chat.room.member.update';
    const access = this.roomAccess(payload, 'manage');
    if (!access.ok) return access;
    const room = access.room;
    const memberId = text(payload, 'memberId', '');
    const member = room.members.find((item) => item.memberId === memberId && item.active);
    if (!member) return failure(action, 'chat_member_not_found', 'Chat member was not found.');
    let role;
    try {
      role = normalizeRoomRole(text(payload, 'role', member.role), member.type);
    } catch (error) {
      return this.failureFromError(action, error);
    }
    if ((member.role === RoomRole.OWNER || role === RoomRole.OWNER) && this.roleFor(room, access.actorId) !== RoomRole.OWNER) return failure(action, 'chat_permission_denied', 'Only an owner can change owner membership.');
    if (member.role === RoomRole.OWNER && role !== RoomRole.OWNER && this.activeOwnerCount(room) <= 1) return failure(action, 'chat_owner_required', 'A Chat Room must retain at least one owner.');
    const binding = { expectedRevision: room.revision, memberId, role, displayName: truncateUtf8(text(payload, 'displayName', member.displayName), 512) };
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, room.id, binding);
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, member: Object.assign({}, member, binding), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), room.id);
    if (!consumed.ok) return consumed;
    if (room.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Chat Room changed after preview.', 'Preview member update again.');
    member.role = consumed.plan.binding.role;
    member.displayName = consumed.plan.binding.displayName;
    member.updatedAt = nowIso(this.clock());
    this.touchRoom(room);
    this.persist();
    this.emit('member.updated', room, { member: cloneJson(member) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, member: cloneJson(member), room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  memberRemove(payload) {
    const action = 'chat.room.member.remove';
    const access = this.roomAccess(payload, 'manage');
    if (!access.ok) return access;
    const room = access.room;
    const memberId = text(payload, 'memberId', '');
    const member = room.members.find((item) => item.memberId === memberId && item.active);
    if (!member) return failure(action, 'chat_member_not_found', 'Chat member was not found.');
    if (member.role === RoomRole.OWNER && this.roleFor(room, access.actorId) !== RoomRole.OWNER) return failure(action, 'chat_permission_denied', 'Only an owner can remove an owner.');
    if (member.role === RoomRole.OWNER && this.activeOwnerCount(room) <= 1) return failure(action, 'chat_owner_required', 'A Chat Room must retain at least one owner.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, room.id, { expectedRevision: room.revision, memberId });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, member: cloneJson(member), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), room.id);
    if (!consumed.ok) return consumed;
    if (room.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Chat Room changed after preview.', 'Preview member removal again.');
    member.active = false;
    member.leftAt = nowIso(this.clock());
    member.updatedAt = member.leftAt;
    this.touchRoom(room);
    this.persist();
    this.emit('member.updated', room, { member: cloneJson(member) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, member: cloneJson(member), room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
  }

  messagePost(payload) {
    const action = 'chat.room.message.post';
    const access = this.roomAccess(payload, 'post');
    if (!access.ok) return access;
    const room = access.room;
    if (room.archivedAt.length > 0) return failure(action, 'chat_room_archived', 'Archived Chat Rooms are read-only.');
    const body = truncateUtf8(text(payload, 'body', text(payload, 'text', '')).trim(), MAX_MESSAGE_BYTES);
    if (body.length === 0) return failure(action, 'chat_message_required', 'Chat message body is required.');
    const clientMessageId = text(payload, 'clientMessageId', '').trim();
    if (clientMessageId.length === 0 || clientMessageId.length > 200) return failure(action, 'chat_client_message_id_required', 'clientMessageId is required for idempotent room messaging.');
    const messages = this.messagesByRoom.get(room.id);
    const duplicate = messages.find((item) => item.clientMessageId === clientMessageId && item.authorMemberId === access.actorId);
    if (duplicate) return { ok: true, action, duplicate: true, message: this.publicMessage(duplicate), room: this.publicRoom(room, access.actorId), updatedAt: nowIso(this.clock()) };
    const replyToMessageId = text(payload, 'replyToMessageId', '');
    const reply = replyToMessageId.length > 0 ? messages.find((item) => item.id === replyToMessageId) : null;
    if (replyToMessageId.length > 0 && !reply) return failure(action, 'chat_reply_not_found', 'Reply target message was not found.');
    const mentionSource = Array.isArray(payload.mentionMemberIds) ? payload.mentionMemberIds : (Array.isArray(payload.mentions) ? payload.mentions : []);
    const mentionMemberIds = [];
    const seen = new Set();
    for (const item of mentionSource) {
      if (typeof item !== 'string' || seen.has(item)) continue;
      seen.add(item);
      mentionMemberIds.push(item);
    }
    if (mentionMemberIds.length > MAX_AGENT_FANOUT) return failure(action, 'chat_mention_fanout_limit', 'Chat message mentions too many Agents.', 'Mention no more than ' + String(MAX_AGENT_FANOUT) + ' Agent members.');
    const author = this.activeMember(room, access.actorId);
    if (author.type === 'agent' && mentionMemberIds.length > 0) return failure(action, 'chat_agent_loop_blocked', 'Agent-authored messages cannot automatically fan out to other Agents.');
    const targets = [];
    for (const memberId of mentionMemberIds) {
      const target = this.activeMember(room, memberId);
      if (!target || target.type !== 'agent' || target.role !== RoomRole.AGENT) return failure(action, 'chat_mention_invalid', 'Mention target must be an active Agent member.');
      if (target.memberId === author.memberId) continue;
      targets.push(target);
    }
    room.sequence += 1;
    const message = normalizeMessage({
      id: randomId('msg'),
      roomId: room.id,
      seq: room.sequence,
      clientMessageId,
      authorMemberId: author.memberId,
      authorType: author.type,
      authorAgentId: author.agentId,
      body,
      replyToMessageId,
      threadId: reply ? (reply.threadId || reply.id) : '',
      mentionMemberIds: targets.map((item) => item.memberId),
      routingDepth: 0,
      deliveries: targets.map((item) => ({ memberId: item.memberId, agentId: item.agentId, status: 'pending' }))
    }, this.clock());
    messages.push(message);
    this.touchRoom(room);
    this.pruneRoomMessages(room);
    this.persist();
    this.emit('message.created', room, { message: this.publicMessage(message) });
    for (const target of targets) this.startAgentDispatch(room, message, target);
    return { ok: true, action, duplicate: false, message: this.publicMessage(message), room: this.publicRoom(room, access.actorId), dispatchedAgentCount: targets.length, updatedAt: nowIso(this.clock()) };
  }

  messageList(payload) {
    const action = 'chat.room.message.list';
    const access = this.roomAccess(payload, 'read');
    if (!access.ok) return access;
    const items = this.messagesByRoom.get(access.room.id).slice().sort((left, right) => left.seq - right.seq);
    const limit = boundedInteger(numberValue(payload, 'limit', 50), 50, 1, MAX_PAGE_LIMIT);
    const afterSeq = boundedInteger(numberValue(payload, 'afterSeq', 0), 0, 0, Number.MAX_SAFE_INTEGER);
    const beforeSeq = boundedInteger(numberValue(payload, 'beforeSeq', 0), 0, 0, Number.MAX_SAFE_INTEGER);
    let filtered;
    if (beforeSeq > 0) filtered = items.filter((item) => item.seq < beforeSeq).slice(-limit);
    else filtered = items.filter((item) => item.seq > afterSeq).slice(0, limit);
    const firstSeq = filtered.length > 0 ? filtered[0].seq : 0;
    const lastSeq = filtered.length > 0 ? filtered[filtered.length - 1].seq : 0;
    return {
      ok: true,
      action,
      room: this.publicRoom(access.room, access.actorId),
      messages: filtered.map((item) => this.publicMessage(item)),
      firstSeq,
      lastSeq,
      nextBeforeSeq: firstSeq > 0 && items.some((item) => item.seq < firstSeq) ? firstSeq : 0,
      nextAfterSeq: lastSeq > 0 && items.some((item) => item.seq > lastSeq) ? lastSeq : 0,
      updatedAt: nowIso(this.clock())
    };
  }

  ack(payload) {
    const action = 'chat.room.ack';
    const access = this.roomAccess(payload, 'read');
    if (!access.ok) return access;
    const requested = boundedInteger(numberValue(payload, 'lastSeq', access.room.sequence), access.room.sequence, 0, access.room.sequence);
    const roomAcks = this.acksByRoom.get(access.room.id);
    const current = roomAcks.get(access.actorId);
    const ack = {
      roomId: access.room.id,
      memberId: access.actorId,
      lastSeq: Math.max(current ? current.lastSeq : 0, requested),
      updatedAt: nowIso(this.clock())
    };
    roomAcks.set(access.actorId, ack);
    this.persist();
    this.emit('ack.updated', access.room, { ack: cloneJson(ack) });
    return { ok: true, action, ack, unreadCount: Math.max(0, access.room.sequence - ack.lastSeq), updatedAt: nowIso(this.clock()) };
  }

  startAgentDispatch(room, sourceMessage, target) {
    if (!this.dispatchAgent) return;
    const key = room.id + ':' + sourceMessage.id + ':' + target.memberId;
    if (this.pendingDispatches.has(key)) return;
    const delivery = sourceMessage.deliveries.find((item) => item.memberId === target.memberId);
    if (!delivery) return;
    delivery.status = 'running';
    delivery.updatedAt = nowIso(this.clock());
    this.persist();
    const promise = Promise.resolve(this.dispatchAgent({
      room: this.publicRoom(room, target.memberId),
      message: this.publicMessage(sourceMessage),
      member: cloneJson(target),
      agentId: target.agentId,
      routingDepth: 0
    })).then((result) => {
      if (!result || result.ok === false) {
        delivery.status = 'failed';
        delivery.failureCategory = text(result, 'failureCategory', 'chat_agent_dispatch_failed');
        delivery.message = text(result, 'message', 'Agent mention dispatch failed.');
        delivery.updatedAt = nowIso(this.clock());
        this.persistAndEmit('message.delivery.updated', room, { message: this.publicMessage(sourceMessage), delivery: cloneJson(delivery) });
        return;
      }
      const responseBody = truncateUtf8(text(result, 'output', text(result, 'message', '')).trim(), MAX_MESSAGE_BYTES);
      if (responseBody.length === 0) {
        delivery.status = 'succeeded';
        delivery.updatedAt = nowIso(this.clock());
        this.persistAndEmit('message.delivery.updated', room, { message: this.publicMessage(sourceMessage), delivery: cloneJson(delivery) });
        return;
      }
      room.sequence += 1;
      const response = normalizeMessage({
        id: randomId('msg'),
        roomId: room.id,
        seq: room.sequence,
        clientMessageId: 'agent-response:' + sourceMessage.id + ':' + target.memberId,
        authorMemberId: target.memberId,
        authorType: 'agent',
        authorAgentId: target.agentId,
        body: responseBody,
        replyToMessageId: sourceMessage.id,
        threadId: sourceMessage.threadId || sourceMessage.id,
        mentionMemberIds: [],
        routeOriginMessageId: sourceMessage.id,
        routingDepth: 1,
        deliveries: []
      }, this.clock());
      this.messagesByRoom.get(room.id).push(response);
      delivery.status = 'succeeded';
      delivery.responseMessageId = response.id;
      delivery.updatedAt = nowIso(this.clock());
      this.touchRoom(room);
      this.pruneRoomMessages(room);
      this.persist();
      this.emit('message.created', room, { message: this.publicMessage(response), sourceMessageId: sourceMessage.id });
      this.emit('message.delivery.updated', room, { message: this.publicMessage(sourceMessage), delivery: cloneJson(delivery) });
    }).catch((error) => {
      delivery.status = 'failed';
      delivery.failureCategory = error && typeof error.code === 'string' ? error.code : 'chat_agent_dispatch_failed';
      delivery.message = error instanceof Error ? error.message : String(error);
      delivery.updatedAt = nowIso(this.clock());
      this.persistAndEmit('message.delivery.updated', room, { message: this.publicMessage(sourceMessage), delivery: cloneJson(delivery) });
    }).finally(() => {
      this.pendingDispatches.delete(key);
    });
    this.pendingDispatches.set(key, promise);
  }

  pruneRoomMessages(room) {
    const items = this.messagesByRoom.get(room.id) || [];
    if (items.length > room.retentionMaxMessages) items.splice(0, items.length - room.retentionMaxMessages);
  }

  touchRoom(room) {
    room.updatedAt = nowIso(this.clock());
    room.revision += 1;
  }

  actor(payload) {
    try {
      return { ok: true, actorId: normalizeActorId(text(payload, '_actorId', text(payload, 'actorId', ''))) };
    } catch (error) {
      return this.failureFromError('chat.room.access', error);
    }
  }

  roomAccess(payload, required) {
    const actor = this.actor(payload);
    if (!actor.ok) return actor;
    const roomId = text(payload, 'roomId', text(payload, 'id', ''));
    const room = this.rooms.get(roomId);
    if (!room) return failure('chat.room.access', 'chat_room_not_found', 'Chat Room was not found.');
    const member = this.activeMember(room, actor.actorId);
    if (!member) return failure('chat.room.access', 'chat_permission_denied', 'Actor is not an active room member.');
    const role = member.role;
    let allowed = false;
    if (required === 'read') allowed = true;
    else if (required === 'post') allowed = [RoomRole.OWNER, RoomRole.MODERATOR, RoomRole.MEMBER, RoomRole.AGENT].includes(role);
    else if (required === 'manage') allowed = [RoomRole.OWNER, RoomRole.MODERATOR].includes(role);
    else if (required === 'owner') allowed = role === RoomRole.OWNER;
    if (!allowed) return failure('chat.room.access', 'chat_permission_denied', 'Room role does not allow this operation.');
    return { ok: true, room, member, actorId: actor.actorId };
  }

  activeMember(room, memberId) {
    return room.members.find((item) => item.memberId === memberId && item.active) || null;
  }

  roleFor(room, memberId) {
    const member = this.activeMember(room, memberId);
    return member ? member.role : '';
  }

  activeOwnerCount(room) {
    return room.members.filter((item) => item.active && item.role === RoomRole.OWNER).length;
  }

  publicRoom(room, actorId) {
    const value = cloneJson(room);
    const ack = this.acksByRoom.has(room.id) ? this.acksByRoom.get(room.id).get(actorId) : null;
    value.messageCount = (this.messagesByRoom.get(room.id) || []).length;
    value.unreadCount = Math.max(0, room.sequence - (ack ? ack.lastSeq : 0));
    value.currentMemberId = actorId;
    value.currentRole = this.roleFor(room, actorId);
    value.canPost = [RoomRole.OWNER, RoomRole.MODERATOR, RoomRole.MEMBER, RoomRole.AGENT].includes(value.currentRole) && room.archivedAt.length === 0;
    value.canManage = [RoomRole.OWNER, RoomRole.MODERATOR].includes(value.currentRole) && room.archivedAt.length === 0;
    return value;
  }

  publicMessage(message) {
    return cloneJson(message);
  }

  persistAndEmit(kind, room, payload) {
    this.persist();
    this.emit(kind, room, payload);
  }

  emit(kind, room, payload) {
    try {
      this.onUpdated(Object.assign({
        kind,
        roomId: room.id,
        workspaceId: text(room, 'workspaceId', ''),
        updatedAt: nowIso(this.clock())
      }, payload || {}));
    } catch (_error) {
      // Persisted state remains authoritative.
    }
  }

  createPlan(action, targetId, binding) {
    this.cleanupPlans();
    const plan = {
      planId: randomId('chat_plan'),
      action,
      targetId,
      digest: sha256(binding),
      binding: cloneJson(binding),
      expiresAt: this.clock() + PLAN_TTL_MS
    };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  consumePlan(action, planId, targetId) {
    this.cleanupPlans();
    if (planId.length === 0) return failure(action, 'confirmation_required', 'A preview planId is required.', 'Preview the operation first.');
    const plan = this.plans.get(planId);
    if (!plan) return failure(action, 'plan_expired', 'Chat operation plan is missing or expired.', 'Preview the operation again.');
    if (plan.action !== action || (targetId.length > 0 && plan.targetId !== targetId) || plan.digest !== sha256(plan.binding)) return failure(action, 'plan_stale', 'Chat operation plan does not match current state.', 'Preview the operation again.');
    this.plans.delete(planId);
    return { ok: true, plan };
  }

  cleanupPlans() {
    const nowMs = this.clock();
    for (const [id, plan] of this.plans.entries()) if (plan.expiresAt <= nowMs) this.plans.delete(id);
  }

  failureFromError(action, error) {
    return failure(action, error && typeof error.code === 'string' ? error.code : 'chat_invalid', error instanceof Error ? error.message : String(error));
  }
}

module.exports = {
  ChatRoomManager,
  RoomRole
};
