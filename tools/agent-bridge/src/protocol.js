'use strict';

const PROTOCOL_VERSION = 'agent-bridge.v1';

const RequestType = Object.freeze({
  CAPABILITIES_GET: 'capabilities.get',
  SESSION_CREATE: 'session.create',
  SESSION_LIST: 'session.list',
  SESSION_MESSAGES: 'session.messages',
  SESSION_REVERT: 'session.revert',
  MESSAGE_SEND: 'message.send',
  PREVIEW_GET: 'preview.get',
  PERMISSION_RESPOND: 'permission.respond',
  REQUEST_RESPOND: 'request.respond',
  PLAN_RESPOND: 'plan.respond',
  OPENCODE_REQUEST: 'opencode.request',
  WORKSPACE_CHANGES_GET: 'workspace.changes.get',
  WORKSPACE_DIFF_GET: 'workspace.diff.get',
  WORKSPACE_FILES_LIST: 'workspace.files.list',
  WORKSPACE_FILE_GET: 'workspace.file.get',
  WORKSPACE_FILE_DOWNLOAD: 'workspace.file.download',
  WORKSPACE_GIT_STAGE: 'workspace.git.stage',
  WORKSPACE_GIT_UNSTAGE: 'workspace.git.unstage',
  WORKSPACE_GIT_DISCARD: 'workspace.git.discard',
  WORKSPACE_GIT_COMMIT: 'workspace.git.commit'
});

const EventType = Object.freeze({
  BRIDGE_CONNECTED: 'bridge.connected',
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_MESSAGES: 'session.messages',
  MESSAGE_DELTA: 'message.delta',
  MESSAGE_COMPLETED: 'message.completed',
  TOOL_STARTED: 'tool.started',
  TOOL_OUTPUT: 'tool.output',
  TOOL_COMPLETED: 'tool.completed',
  PERMISSION_REQUESTED: 'permission.requested',
  QUESTION_REQUESTED: 'question.requested',
  PLAN_REQUESTED: 'plan.requested',
  PLAN_UPDATED: 'plan.updated',
  TODO_UPDATED: 'todo.updated',
  OPENCODE_EVENT: 'opencode.event',
  PREVIEW_UPDATED: 'preview.updated',
  WORKSPACE_CHANGES_UPDATED: 'workspace.changes.updated',
  WORKSPACE_FILES_UPDATED: 'workspace.files.updated',
  FILE_DOWNLOAD_READY: 'file.download.ready',
  ERROR: 'error'
});

function makeResponse(id, payload) {
  return {
    id,
    type: 'response',
    ok: true,
    payload: payload || {},
    createdAt: Date.now()
  };
}

function makeErrorResponse(id, code, message) {
  return {
    id: id || '',
    type: 'response',
    ok: false,
    error: {
      code,
      message
    },
    createdAt: Date.now()
  };
}

function makeEvent(event, sessionId, payload) {
  return {
    type: 'event',
    event,
    sessionId: sessionId || '',
    payload: payload || {},
    createdAt: Date.now()
  };
}

function parseClientMessage(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Message must be a JSON object' };
    }
    if (typeof parsed.type !== 'string' || parsed.type.length === 0) {
      return { ok: false, error: 'Message type is required' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'string') {
    return value;
  }
  return fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallbackValue;
}

module.exports = {
  PROTOCOL_VERSION,
  RequestType,
  EventType,
  makeResponse,
  makeErrorResponse,
  makeEvent,
  parseClientMessage,
  readString,
  readNumber
};
