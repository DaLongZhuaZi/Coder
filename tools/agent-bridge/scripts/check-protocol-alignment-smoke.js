'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { AgentManager } = require('../src/agent-manager');
const { mcpToolDefinitions, toolRequestType } = require('../src/mcp-host');
const { RequestType, EventType } = require('../src/protocol');

const bridgeRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(bridgeRoot, '..', '..');

const M7_REQUESTS = Object.freeze([
  { name: 'SCHEDULE_STATUS', value: 'schedule.status', tool: 'schedule_status' },
  { name: 'SCHEDULE_LIST', value: 'schedule.list', tool: 'schedule_list' },
  { name: 'SCHEDULE_GET', value: 'schedule.get', tool: 'schedule_get' },
  { name: 'SCHEDULE_CREATE', value: 'schedule.create', tool: 'schedule_create' },
  { name: 'SCHEDULE_UPDATE', value: 'schedule.update', tool: 'schedule_update' },
  { name: 'SCHEDULE_ENABLE', value: 'schedule.enable', tool: 'schedule_enable' },
  { name: 'SCHEDULE_DISABLE', value: 'schedule.disable', tool: 'schedule_disable' },
  { name: 'SCHEDULE_RUN_NOW', value: 'schedule.run-now', tool: 'schedule_run_now' },
  { name: 'SCHEDULE_HISTORY', value: 'schedule.history', tool: 'schedule_history' },
  { name: 'SCHEDULE_REMOVE', value: 'schedule.remove', tool: 'schedule_remove' },
  { name: 'LOOP_STATUS', value: 'loop.status', tool: 'loop_status' },
  { name: 'LOOP_LIST', value: 'loop.list', tool: 'loop_list' },
  { name: 'LOOP_GET', value: 'loop.get', tool: 'loop_get' },
  { name: 'LOOP_CREATE', value: 'loop.create', tool: 'loop_create' },
  { name: 'LOOP_UPDATE', value: 'loop.update', tool: 'loop_update' },
  { name: 'LOOP_START', value: 'loop.start', tool: 'loop_start' },
  { name: 'LOOP_PAUSE', value: 'loop.pause', tool: 'loop_pause' },
  { name: 'LOOP_RESUME', value: 'loop.resume', tool: 'loop_resume' },
  { name: 'LOOP_STOP', value: 'loop.stop', tool: 'loop_stop' },
  { name: 'LOOP_TAKEOVER', value: 'loop.takeover', tool: 'loop_takeover' },
  { name: 'LOOP_ROUNDS', value: 'loop.rounds', tool: 'loop_rounds' },
  { name: 'LOOP_REMOVE', value: 'loop.remove', tool: 'loop_remove' },
  { name: 'CHAT_ROOM_STATUS', value: 'chat.room.status', tool: 'chat_room_status' },
  { name: 'CHAT_ROOM_LIST', value: 'chat.room.list', tool: 'chat_room_list' },
  { name: 'CHAT_ROOM_GET', value: 'chat.room.get', tool: 'chat_room_get' },
  { name: 'CHAT_ROOM_CREATE', value: 'chat.room.create', tool: 'chat_room_create' },
  { name: 'CHAT_ROOM_UPDATE', value: 'chat.room.update', tool: 'chat_room_update' },
  { name: 'CHAT_ROOM_ARCHIVE', value: 'chat.room.archive', tool: 'chat_room_archive' },
  { name: 'CHAT_ROOM_MEMBER_ADD', value: 'chat.room.member.add', tool: 'chat_room_member_add' },
  { name: 'CHAT_ROOM_MEMBER_UPDATE', value: 'chat.room.member.update', tool: 'chat_room_member_update' },
  { name: 'CHAT_ROOM_MEMBER_REMOVE', value: 'chat.room.member.remove', tool: 'chat_room_member_remove' },
  { name: 'CHAT_ROOM_MESSAGE_POST', value: 'chat.room.message.post', tool: 'chat_room_message_post' },
  { name: 'CHAT_ROOM_MESSAGE_LIST', value: 'chat.room.message.list', tool: 'chat_room_message_list' },
  { name: 'CHAT_ROOM_ACK', value: 'chat.room.ack', tool: 'chat_room_ack' }
]);

const M7_EVENTS = Object.freeze([
  { name: 'SCHEDULE_UPDATED', value: 'schedule.updated' },
  { name: 'SCHEDULE_RUN_UPDATED', value: 'schedule.run.updated' },
  { name: 'LOOP_UPDATED', value: 'loop.updated' },
  { name: 'LOOP_ROUND_UPDATED', value: 'loop.round.updated' },
  { name: 'CHAT_ROOM_UPDATED', value: 'chat.room.updated' },
  { name: 'CHAT_ROOM_MESSAGE_CREATED', value: 'chat.room.message.created' },
  { name: 'CHAT_ROOM_ACK_UPDATED', value: 'chat.room.ack.updated' }
]);

const M8_REQUESTS = Object.freeze([
  { name: 'VOICE_STATUS', value: 'voice.status', tool: 'voice_status' },
  { name: 'VOICE_SESSION_START', value: 'voice.session.start', tool: 'voice_session_start' },
  { name: 'VOICE_SESSION_CHUNK', value: 'voice.session.chunk', tool: 'voice_session_chunk' },
  { name: 'VOICE_SESSION_FINISH', value: 'voice.session.finish', tool: 'voice_session_finish' },
  { name: 'VOICE_SESSION_CANCEL', value: 'voice.session.cancel', tool: 'voice_session_cancel' },
  { name: 'VOICE_TTS_SPEAK', value: 'voice.tts.speak', tool: 'voice_tts_speak' },
  { name: 'VOICE_TTS_STOP', value: 'voice.tts.stop', tool: 'voice_tts_stop' }
]);

const M8_EVENTS = Object.freeze([
  { name: 'VOICE_TRANSCRIPT_PARTIAL', value: 'voice.transcript.partial' },
  { name: 'VOICE_TRANSCRIPT_FINAL', value: 'voice.transcript.final' },
  { name: 'VOICE_VAD_CHANGED', value: 'voice.vad.changed' },
  { name: 'VOICE_TTS_UPDATED', value: 'voice.tts.updated' },
  { name: 'VOICE_SESSION_UPDATED', value: 'voice.session.updated' }
]);

const M11_REQUESTS = Object.freeze([
  { name: 'WORKSPACE_SERVICE_LIST', value: 'workspace.service.list', tool: 'workspace_service_list' },
  { name: 'WORKSPACE_SERVICE_UPSERT', value: 'workspace.service.upsert', tool: 'workspace_service_upsert' },
  { name: 'WORKSPACE_SERVICE_STATUS', value: 'workspace.service.status', tool: 'workspace_service_status' },
  { name: 'WORKSPACE_SERVICE_HEALTH', value: 'workspace.service.health', tool: 'workspace_service_health' },
  { name: 'WORKSPACE_SERVICE_OPEN', value: 'workspace.service.open', tool: 'workspace_service_open' },
  { name: 'WORKSPACE_SERVICE_START', value: 'workspace.service.start', tool: 'workspace_service_start' },
  { name: 'WORKSPACE_SERVICE_STOP', value: 'workspace.service.stop', tool: 'workspace_service_stop' },
  { name: 'WORKSPACE_SERVICE_LOGS', value: 'workspace.service.logs', tool: 'workspace_service_logs' },
  { name: 'WORKSPACE_SERVICE_REMOVE', value: 'workspace.service.remove', tool: 'workspace_service_remove' }
]);

const M12_REQUESTS = Object.freeze([
  { name: 'BROWSER_HOST_LIST', value: 'browser.host.list', tool: 'browser_host_list' },
  { name: 'BROWSER_INSTANCE_LIST', value: 'browser.instance.list', tool: 'browser_instance_list' },
  { name: 'BROWSER_INSTANCE_CREATE', value: 'browser.instance.create', tool: 'browser_instance_create' },
  { name: 'BROWSER_INSTANCE_CLOSE', value: 'browser.instance.close', tool: 'browser_instance_close' },
  { name: 'BROWSER_PAGE_LIST', value: 'browser.page.list', tool: 'browser_page_list' },
  { name: 'BROWSER_PAGE_CREATE', value: 'browser.page.create', tool: 'browser_page_create' },
  { name: 'BROWSER_PAGE_CLOSE', value: 'browser.page.close', tool: 'browser_page_close' },
  { name: 'BROWSER_PAGE_NAVIGATE', value: 'browser.page.navigate', tool: 'browser_page_navigate' },
  { name: 'BROWSER_PAGE_SNAPSHOT', value: 'browser.page.snapshot', tool: 'browser_page_snapshot' },
  { name: 'BROWSER_PAGE_SCREENSHOT', value: 'browser.page.screenshot', tool: 'browser_page_screenshot' },
  { name: 'BROWSER_PAGE_LOGS', value: 'browser.page.logs', tool: 'browser_page_logs' },
  { name: 'BROWSER_PAGE_WAIT', value: 'browser.page.wait', tool: 'browser_page_wait' },
  { name: 'BROWSER_PAGE_ACTION', value: 'browser.page.action', tool: 'browser_page_action' },
  { name: 'BROWSER_DOWNLOAD_LIST', value: 'browser.download.list', tool: 'browser_download_list' },
  { name: 'BROWSER_PERMISSION_GET', value: 'browser.permission.get', tool: 'browser_permission_get' },
  { name: 'BROWSER_PERMISSION_SET', value: 'browser.permission.set', tool: 'browser_permission_set' }
]);

const R1_PROVIDER_DIRECTORY_REQUESTS = Object.freeze([
  { name: 'PROVIDER_DIRECTORY_LIST', value: 'provider.directory.list', tool: 'provider_directory_list' },
  { name: 'PROVIDER_DIRECTORY_REFRESH', value: 'provider.directory.refresh', tool: 'provider_directory_refresh' },
  { name: 'PROVIDER_DIRECTORY_INSTALL', value: 'provider.directory.install', tool: 'provider_directory_install' },
  { name: 'PROVIDER_DIRECTORY_STATUS', value: 'provider.directory.status', tool: 'provider_directory_status' },
  { name: 'PROVIDER_DIRECTORY_ROLLBACK', value: 'provider.directory.rollback', tool: 'provider_directory_rollback' },
  { name: 'PROVIDER_DIRECTORY_REMOVE', value: 'provider.directory.remove', tool: 'provider_directory_remove' }
]);

const R4_PROVIDER_USAGE_REQUESTS = Object.freeze([
  { name: 'PROVIDER_USAGE_LIST', value: 'provider.usage.list', tool: 'provider_usage_list' }
]);

const R26_METADATA_REQUESTS = Object.freeze([
  { name: 'METADATA_GENERATE', value: 'metadata.generate', tool: 'metadata_generate' },
  { name: 'METADATA_GENERATE_CANCEL', value: 'metadata.generate.cancel', tool: 'metadata_generate_cancel' }
]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function assertSourceIncludes(source, expected, label) {
  assert.ok(source.includes(expected), label + ' should include ' + expected);
}

class MemoryStore {
  constructor() {
    this.records = new Map();
  }

  listAgentRecords() {
    return Array.from(this.records.values()).map((item) => JSON.parse(JSON.stringify(item)));
  }

  writeAgentRecord(record) {
    this.records.set(record.id, JSON.parse(JSON.stringify(record)));
  }
}

class MemoryWorkspaceRegistry {
  upsertWorkspace(payload) {
    const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : payload.workspacePath;
    return {
      workspaceId: 'wks-memory',
      cwd,
      title: typeof payload.workspaceTitle === 'string' ? payload.workspaceTitle : ''
    };
  }
}

function assertProtocolSurface() {
  assert.strictEqual(RequestType.AGENT_FORK, 'agent.fork');
  assert.strictEqual(RequestType.AGENT_DETACH, 'agent.detach');
  assert.strictEqual(RequestType.CHECKPOINT_CREATE, 'checkpoint.create');
  assert.strictEqual(RequestType.PROVIDER_ACP_IMPORT, 'provider.acp.import');
  assert.strictEqual(RequestType.WORKTREE_CREATE, 'worktree.create');
  assert.strictEqual(RequestType.GITHUB_PR_CREATE, 'github.pr.create');
  assert.strictEqual(RequestType.MESSAGE_QUEUE_LIST, 'message.queue.list');
  assert.strictEqual(RequestType.USAGE_SUMMARY_GET, 'usage.summary.get');
  assert.strictEqual(RequestType.PROVIDER_USAGE_LIST, 'provider.usage.list');
  assert.strictEqual(RequestType.METADATA_GENERATE, 'metadata.generate');
  assert.strictEqual(RequestType.DIAGNOSTICS_EXPORT, 'diagnostics.export');
  assert.strictEqual(RequestType.RELAY_STATUS, 'relay.status');
  assert.strictEqual(RequestType.RELAY_PAIRING_START, 'relay.pairing.start');
  assert.strictEqual(RequestType.RELAY_PAIRING_CANCEL, 'relay.pairing.cancel');
  assert.strictEqual(RequestType.RELAY_CONNECT, 'relay.connect');
  assert.strictEqual(RequestType.RELAY_DISCONNECT, 'relay.disconnect');
  assert.strictEqual(RequestType.RELAY_DEVICE_LIST, 'relay.device.list');
  assert.strictEqual(RequestType.RELAY_DEVICE_REVOKE, 'relay.device.revoke');
  assert.strictEqual(RequestType.RELAY_IDENTITY_ROTATE, 'relay.identity.rotate');
  assert.strictEqual(RequestType.GITHUB_PR_LIST, 'github.pr.list');
  assert.strictEqual(RequestType.GITHUB_PR_UPDATE, 'github.pr.update');
  assert.strictEqual(RequestType.GITHUB_AUTH_DEVICE_START, 'github.auth.device.start');
  assert.strictEqual(RequestType.GITHUB_BINDING_SET, 'github.binding.set');
  assert.strictEqual(RequestType.GITHUB_WATCH_START, 'github.watch.start');
  assert.strictEqual(RequestType.GITHUB_ATTACHMENT_UPLOAD, 'github.attachment.upload');
  assert.strictEqual(RequestType.MCP_SERVER_START, 'mcp.server.start');
  assert.strictEqual(RequestType.PERMISSION_LIST, 'permission.list');
  assert.strictEqual(RequestType.PERMISSION_RESPOND, 'permission.respond');
  assert.strictEqual(RequestType.NOTIFICATION_LIST, 'notification.list');
  assert.strictEqual(RequestType.NOTIFICATION_ACTION, 'notification.action');
  assert.strictEqual(RequestType.NOTIFICATION_PRUNE, 'notification.prune');
  assert.strictEqual(RequestType.NOTIFICATION_PUSH_STATUS, 'notification.push.status');
  assert.strictEqual(RequestType.NOTIFICATION_PUSH_REGISTER, 'notification.push.register');
  assert.strictEqual(RequestType.NOTIFICATION_PUSH_UNREGISTER, 'notification.push.unregister');
  assert.strictEqual(RequestType.DAEMON_AUTOSTART_INSTALL, 'daemon.autostart.install');
  assert.strictEqual(RequestType.DAEMON_AUTOSTART_UNINSTALL, 'daemon.autostart.uninstall');
  assert.strictEqual(RequestType.DAEMON_UPDATE_STATUS, 'daemon.update.status');
  assert.strictEqual(RequestType.DAEMON_UPDATE_CHECK, 'daemon.update.check');
  assert.strictEqual(RequestType.DAEMON_UPDATE_PREVIEW, 'daemon.update.preview');
  assert.strictEqual(RequestType.DAEMON_UPDATE_INSTALL, 'daemon.update.install');
  assert.strictEqual(RequestType.DAEMON_UPDATE_ROLLBACK, 'daemon.update.rollback');
  assert.strictEqual(RequestType.DAEMON_CONFIG_STATUS, 'daemon.config.status');
  assert.strictEqual(RequestType.DAEMON_CONFIG_APPLY, 'daemon.config.apply');
  assert.strictEqual(RequestType.DAEMON_INSTANCE_STATUS, 'daemon.instance.status');
  for (const request of M7_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'M7 request ' + request.name + ' should remain stable');
  }
  for (const request of M8_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'M8 request ' + request.name + ' should remain stable');
  }
  assert.strictEqual(EventType.AGENT_RELATIONSHIP_UPDATED, 'agent.relationship.updated');
  assert.strictEqual(EventType.CHECKPOINT_UPDATED, 'checkpoint.updated');
  assert.strictEqual(EventType.NOTIFICATION_CREATED, 'notification.created');
  assert.strictEqual(EventType.NOTIFICATION_UPDATED, 'notification.updated');
  assert.strictEqual(EventType.NOTIFICATION_PUSH_UPDATED, 'notification.push.updated');
  assert.strictEqual(EventType.DAEMON_UPDATE_UPDATED, 'daemon.update.updated');
  assert.strictEqual(EventType.DAEMON_CONFIG_UPDATED, 'daemon.config.updated');
  assert.strictEqual(EventType.GITHUB_AUTH_UPDATED, 'github.auth.updated');
  assert.strictEqual(EventType.MESSAGE_QUEUE_UPDATED, 'message.queue.updated');
  assert.strictEqual(EventType.USAGE_UPDATED, 'usage.updated');
  assert.strictEqual(EventType.RELAY_UPDATED, 'relay.updated');
  assert.strictEqual(EventType.RELAY_DEVICE_UPDATED, 'relay.device.updated');
  assert.strictEqual(EventType.GITHUB_BINDING_UPDATED, 'github.binding.updated');
  for (const event of M7_EVENTS) {
    assert.strictEqual(EventType[event.name], event.value, 'M7 event ' + event.name + ' should remain stable');
  }
  for (const event of M8_EVENTS) {
    assert.strictEqual(EventType[event.name], event.value, 'M8 event ' + event.name + ' should remain stable');
  }
}

function assertM8ConsumerAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const appPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const voiceCoordinator = readUtf8('entry/src/main/ets/features/agentHome/AgentHomeVoiceRequestCoordinator.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const voiceManagerSource = readUtf8('tools/agent-bridge/src/voice-manager.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const mcpDefinitions = new Map(mcpToolDefinitions().map((definition) => [definition.name, definition]));

  for (const request of M8_REQUESTS) {
    assertSourceIncludes(appModels, "static readonly " + request.name + ": string = '" + request.value + "';", 'App M8 request constants');
    assertSourceIncludes(appClient, 'AgentBridgeRequestType.' + request.name, 'App M8 client mapping');
    assertSourceIncludes(serverSource, 'message.type === RequestType.' + request.name, 'Bridge M8 request handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'Management CLI M8 mapping');
    assert.ok(mcpDefinitions.get(request.tool), 'MCP should define ' + request.tool);
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP tool ' + request.tool + ' should map to ' + request.value);
  }
  for (const event of M8_EVENTS) {
    assertSourceIncludes(appModels, "static readonly " + event.name + ": string = '" + event.value + "';", 'App M8 event constants');
    assertSourceIncludes(serverSource, 'EventType.' + event.name, 'Bridge M8 event publisher');
  }
  assertSourceIncludes(appModels, 'static parseVoiceResult(', 'App M8 parser');
  assertSourceIncludes(appModels, 'clientRequestId: string;', 'App Voice client request correlation field');
  assertSourceIncludes(appModels, "item.clientRequestId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'clientRequestId');", 'App Voice client request parser');
  assertSourceIncludes(appModels, 'voice: boolean;', 'App Voice feature flag');
  assertSourceIncludes(appModels, 'this.voice = false;', 'App Voice safe default');
  assertSourceIncludes(appModels, "flags.voice = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voice');", 'App Voice feature parser');
  assertSourceIncludes(appModels, "flags.voiceRemoteSpeechToText = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceRemoteSpeechToText');", 'App remote STT feature parser');
  assertSourceIncludes(appModels, "flags.voiceRemoteTextToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceRemoteTextToSpeech');", 'App remote TTS feature parser');
  assertSourceIncludes(appModels, 'voiceCapabilityMatrix: boolean;', 'App independent Voice capability marker');
  assertSourceIncludes(appModels, "flags.voiceCapabilityMatrix = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceCapabilityMatrix');", 'App Voice capability matrix parser');
  assertSourceIncludes(appModels, 'voicePrivacyStatus: boolean;', 'App Voice privacy capability flag');
  assertSourceIncludes(appModels, "flags.voicePrivacyStatus = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voicePrivacyStatus');", 'App Voice privacy capability parser');
  assertSourceIncludes(appModels, 'AgentBridgeVoicePrivacyRecord', 'App Voice privacy status model');
  assertSourceIncludes(appModels, 'parseVoiceRetentionPolicy', 'App Voice retention policy parser');
  assertSourceIncludes(serverSource, 'voice: voiceManager.isAvailable()', 'Bridge Voice feature flag');
  assertSourceIncludes(serverSource, 'voiceRemoteSpeechToText: voiceCapabilities.remoteSpeechToText === true', 'Bridge remote STT capability flag');
  assertSourceIncludes(serverSource, 'voiceRemoteTextToSpeech: voiceCapabilities.remoteTextToSpeech === true', 'Bridge remote TTS capability flag');
  assertSourceIncludes(serverSource, 'voiceCapabilityMatrix: true', 'Bridge independent Voice capability marker');
  assertSourceIncludes(serverSource, 'voicePrivacyStatus: true', 'Bridge Voice privacy capability marker');
  assertSourceIncludes(cliSource, "if (group === 'voice')", 'Management CLI Voice command group');
  assertSourceIncludes(appPage, 'private supportsVoiceInput(): boolean', 'App Voice input capability gate');
  assertSourceIncludes(appPage, 'private supportsVoicePlayback(): boolean', 'App Voice playback capability gate');
  assertSourceIncludes(appPage, 'this.client.requestVoiceStatus()', 'App Voice privacy status request');
  assertSourceIncludes(appPage, 'private voiceRetentionRiskText(): string', 'App Voice retention risk warning');
  assertSourceIncludes(appPage, 'if (features.voiceCapabilityMatrix)', 'App Voice independent capability gate');
  assertSourceIncludes(appPage, 'if (this.supportsVoiceInput())', 'App Voice input UI gate');
  assertSourceIncludes(appPage, 'if (this.supportsVoicePlayback() && this.latestAssistantVoiceText().length > 0)', 'App Voice playback UI gate');
  assertSourceIncludes(appPage, 'if (!this.supportsVoiceInput() || this.voiceOperationPending)', 'App Voice recording gate');
  assertSourceIncludes(appPage, 'if (text.length === 0 || !this.supportsVoicePlayback())', 'App Voice playback gate');
  assertSourceIncludes(appPage, 'nextVoiceTtsClientRequestId()', 'App Voice local request correlation');
  assertSourceIncludes(appPage, 'isCurrentVoiceTtsResult(', 'App Voice stale result gate');
  assertSourceIncludes(voiceCoordinator, 'beginRemoteStart(', 'App Voice remote STT start correlation');
  assertSourceIncludes(voiceCoordinator, 'beginRemoteFinish(', 'App Voice remote STT finish correlation');
  assertSourceIncludes(voiceCoordinator, 'beginRemoteCancel(', 'App Voice remote STT cancel correlation');
  assertSourceIncludes(voiceCoordinator, 'matchesPendingRequest(', 'App Voice request id validation');
  assertSourceIncludes(appPage, 'this.voiceRequestCoordinator.accept(', 'App Voice session result scope gate');
  assertSourceIncludes(appPage, 'this.voiceRequestCoordinator.completeRemoteSession()', 'App Voice session cleanup gate');
  assertSourceIncludes(appClient, 'payload.clientRequestId = clientRequestId;', 'App Voice client request payload');
  assertSourceIncludes(voiceManagerSource, 'normalizeVoiceClientRequestId', 'Bridge Voice client request validation');
  assertSourceIncludes(voiceManagerSource, 'candidate.clientRequestId === requestedClientRequestId', 'Bridge Voice client request stop lookup');
  assertSourceIncludes(serverSource, 'voiceManager.stop(payload, connection.connectionId || \'\')', 'Bridge Voice stop handler');
}

function assertM7ConsumerAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const mcpDefinitions = new Map(mcpToolDefinitions().map((definition) => [definition.name, definition]));

  for (const request of M7_REQUESTS) {
    assertSourceIncludes(
      appModels,
      "static readonly " + request.name + ": string = '" + request.value + "';",
      'App M7 request constants'
    );
    assertSourceIncludes(appClient, 'AgentBridgeRequestType.' + request.name, 'App M7 client mapping');
    assertSourceIncludes(serverSource, 'message.type === RequestType.' + request.name, 'Bridge M7 request handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'Management CLI M7 mapping');

    const definition = mcpDefinitions.get(request.tool);
    assert.ok(definition, 'MCP should define ' + request.tool);
    const mapped = toolRequestType(request.tool, {});
    assert.strictEqual(mapped.type, request.value, 'MCP tool ' + request.tool + ' should map to ' + request.value);
  }

  for (const event of M7_EVENTS) {
    assertSourceIncludes(
      appModels,
      "static readonly " + event.name + ": string = '" + event.value + "';",
      'App M7 event constants'
    );
    assertSourceIncludes(serverSource, 'EventType.' + event.name, 'Bridge M7 event publisher');
  }

  const appClientMethods = [
    'requestScheduleStatus()',
    'listSchedules(',
    'getSchedule(',
    'saveSchedule(',
    'setScheduleEnabled(',
    'runScheduleNow(',
    'requestScheduleHistory(',
    'removeSchedule(',
    'requestLoopStatus()',
    'listLoops(',
    'getLoop(',
    'saveLoop(',
    'startLoop(',
    'pauseLoop(',
    'resumeLoop(',
    'stopLoop(',
    'takeoverLoop(',
    'requestLoopRounds(',
    'removeLoop(',
    'requestChatRoomStatus()',
    'listChatRooms(',
    'getChatRoom(',
    'saveChatRoom(',
    'archiveChatRoom(',
    'addChatRoomMember(',
    'updateChatRoomMember(',
    'removeChatRoomMember(',
    'postChatRoomMessage(',
    'requestChatRoomMessages(',
    'acknowledgeChatRoom('
  ];
  for (const method of appClientMethods) {
    assertSourceIncludes(appClient, method, 'App M7 client');
  }

  const appParserMethods = [
    'static parseM7Result(',
    'parseScheduleRecords(',
    'parseScheduleRunRecords(',
    'parseLoopRecords(',
    'parseLoopRoundRecords(',
    'parseLoopVerification(',
    'parseChatRoomRecords(',
    'parseChatRoomMembers(',
    'parseChatRoomMessages(',
    'parseChatRoomAck('
  ];
  for (const method of appParserMethods) {
    assertSourceIncludes(appModels, method, 'App M7 parser');
  }

  assertSourceIncludes(cliSource, "if (group === 'schedule')", 'Management CLI schedule command group');
  assertSourceIncludes(cliSource, "if (group === 'loop')", 'Management CLI loop command group');
  assertSourceIncludes(cliSource, "if (group === 'chat')", 'Management CLI chat command group');
  assertSourceIncludes(serverSource, 'schedules: scheduleManager.isAvailable()', 'Bridge schedule feature flag');
  assertSourceIncludes(serverSource, 'loops: loopManager.isAvailable()', 'Bridge loop feature flag');
  assertSourceIncludes(serverSource, 'chatRooms: chatRoomManager.isAvailable()', 'Bridge Chat Rooms feature flag');
  assertSourceIncludes(appModels, 'schedules: boolean;', 'App schedule feature flag');
  assertSourceIncludes(appModels, 'loops: boolean;', 'App loop feature flag');
  assertSourceIncludes(appModels, 'chatRooms: boolean;', 'App Chat Rooms feature flag');
  assertSourceIncludes(appModels, 'this.chatRooms = false;', 'App Chat Rooms safe default');
  assertSourceIncludes(
    appModels,
    "flags.chatRooms = AgentBridgeIncomingParser.extractBooleanProperty(source, 'chatRooms');",
    'App Chat Rooms feature parser'
  );
}

function assertM11BridgeAlignment() {
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const definitions = mcpToolDefinitions();
  for (const request of M11_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'M11 request should remain stable');
    assertSourceIncludes(serverSource, 'message.type === RequestType.' + request.name, 'Bridge M11 request handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'Management CLI M11 mapping');
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP M11 mapping');
    assert(definitions.some((item) => item.name === request.tool), 'MCP M11 definition should exist');
  }
  assert.strictEqual(EventType.WORKSPACE_SERVICE_UPDATED, 'workspace.service.updated');
  assertSourceIncludes(serverSource, 'serviceProxy: true', 'Bridge Service Proxy feature flag');
  assertSourceIncludes(serverSource, 'resolveServiceProxyRoute(reqUrl', 'Bridge Service Proxy route');
  assertSourceIncludes(serverSource, 'handlePathServiceHttpRequest(req, reqUrl, res, pathServiceRoute)', 'Bridge authenticated Service Proxy HTTP route');
  assertSourceIncludes(serverSource, 'handleServiceUpgradeRequest(req, socket, head, reqUrl, serviceRoute)', 'Bridge authenticated Service Proxy WebSocket route');
  assertSourceIncludes(serverSource, 'serviceAccessTicketManager.exchangeTicket', 'Bridge one-time Service access exchange');
  assertSourceIncludes(serverSource, 'serviceSessionCookie', 'Bridge scoped Service session cookie');
  assertSourceIncludes(cliSource, "group === 'service'", 'Management CLI Service command group');
}

function assertM12BridgeAlignment() {
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const appPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const browserManager = readUtf8('tools/agent-bridge/src/browser-automation-manager.js');
  const browserPlatformHost = readUtf8('tools/agent-bridge/src/browser-platform-host.js');
  const browserCdpHost = readUtf8('tools/agent-bridge/src/browser-cdp-host.js');
  const definitions = mcpToolDefinitions();
  for (const request of M12_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'M12 request should remain stable');
    assertSourceIncludes(serverSource, 'RequestType.' + request.name, 'Bridge M12 request handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'Management CLI M12 mapping');
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP M12 mapping');
    assert(definitions.some((item) => item.name === request.tool), 'MCP M12 definition should exist');
    assertSourceIncludes(appModels, 'static readonly ' + request.name + ': string', 'App M12 request constant');
  }
  assert.strictEqual(RequestType.BROWSER_HOST_REGISTER, 'browser.host.register');
  assert.strictEqual(RequestType.BROWSER_HOST_UNREGISTER, 'browser.host.unregister');
  assert.strictEqual(RequestType.BROWSER_HOST_RESULT, 'browser.host.result');
  assert.strictEqual(EventType.BROWSER_HOST_COMMAND, 'browser.host.command');
  assert.strictEqual(EventType.BROWSER_UPDATED, 'browser.updated');
  assertSourceIncludes(serverSource, 'browserAutomation: true', 'Bridge Browser Automation feature flag');
  assertSourceIncludes(serverSource, 'browserHostCapabilityMetadata: true', 'Bridge Browser host capability metadata feature flag');
  assertSourceIncludes(serverSource, 'browserPlatformHost: browserPlatformHostAdapter.isAvailable()', 'Bridge must derive platform Browser host capability from an adapter');
  assertSourceIncludes(serverSource, "createBrowserPlatformHostAdapter()", 'Bridge must construct the platform Browser host adapter explicitly');
  assertSourceIncludes(serverSource, 'browserAutomationManager.registerHost', 'Bridge Browser host registration');
  assertSourceIncludes(serverSource, 'browserAutomationManager.handleHostResult', 'Bridge Browser host result handler');
  assertSourceIncludes(cliSource, "group === 'browser'", 'Management CLI Browser command group');
  assertSourceIncludes(appModels, 'parseBrowserResult(source: string)', 'App Browser result parser');
  assertSourceIncludes(appModels, 'class AgentBridgeBrowserPermissionState', 'App Browser permission state model');
  assertSourceIncludes(appModels, 'class AgentBridgeBrowserActionTarget', 'App Browser action target model');
  assertSourceIncludes(appModels, 'target: AgentBridgeBrowserActionTarget', 'App Browser action target result field');
  assertSourceIncludes(appClient, 'listBrowserHosts(workspaceId: string)', 'App Browser client');
  assertSourceIncludes(appPage, 'pendingBrowserActionPayload', 'App Browser action preview target snapshot');
  assertSourceIncludes(appPage, 'payload.workspaceId = source.workspaceId', 'App Browser action confirm target reuse');
  assertSourceIncludes(appPage, 'browserActionTargetSummary', 'App Browser action target confirmation summary');
  assertSourceIncludes(appPage, 'agent_home_browser_action_target_summary', 'App Browser action target localized summary');
  assertSourceIncludes(appPage, 'browserPermissionDomainsSummary()', 'App Browser permission status rendering');
  assertSourceIncludes(appPage, 'applyBrowserPermissionState', 'App Browser permission event/response state update');
  assertSourceIncludes(browserManager, 'SUPPORTED_BROWSER_ACTIONS', 'Browser action capability contract');
  assertSourceIncludes(browserManager, 'publicPermissionState', 'Bridge Browser permission public DTO');
  assertSourceIncludes(browserManager, 'sanitizeDownloadHostResult', 'Bridge Browser download result path redaction');
  assertSourceIncludes(browserManager, 'sanitizeDownloadListHostResult', 'Bridge Browser download list path redaction');
  assertSourceIncludes(browserManager, 'sanitizePublicDownloadUrl', 'Bridge Browser download URL credential redaction');
  assertSourceIncludes(browserManager, "BROWSER_DOWNLOAD_DIRECTORY_MARKER = '.agent-bridge-downloads'", 'Bridge Browser managed download marker');
  assertSourceIncludes(browserCdpHost, 'CDP_DOWNLOAD_DIRECTORY_MARKER', 'CDP host download result path redaction');
  assertSourceIncludes(browserCdpHost, 'sanitizePublicDownloadUrl', 'CDP download URL credential redaction');
  assertSourceIncludes(browserManager, 'browser_action_unavailable', 'Browser action capability gate');
  assertSourceIncludes(browserManager, 'publicBrowserActionTarget', 'Bridge Browser action target summary');
  assertSourceIncludes(browserManager, 'browser_host_capability_unverified', 'Browser platform host capability source gate');
  assertSourceIncludes(browserPlatformHost, 'browser_platform_host_unavailable', 'Browser platform host adapter availability gate');
  assertSourceIncludes(browserManager, 'validateBrowserPlatformHost', 'Browser platform host adapter validation');
  assertSourceIncludes(browserManager, 'browser_host_not_ready', 'Browser host readiness gate');
  assertSourceIncludes(browserCdpHost, "action === 'drag'", 'CDP drag action');
  assertSourceIncludes(browserCdpHost, 'supportedActions()', 'CDP action capability registration');
}

function assertR1ProviderDirectoryAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const appPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const definitions = new Map(mcpToolDefinitions().map((definition) => [definition.name, definition]));

  for (const request of R1_PROVIDER_DIRECTORY_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'R1 Provider directory request should remain stable');
    assertSourceIncludes(appModels, 'static readonly ' + request.name + ': string', 'App R1 Provider directory request constant');
    assertSourceIncludes(appClient, 'AgentBridgeRequestType.' + request.name, 'App R1 Provider directory client');
    assertSourceIncludes(serverSource, 'RequestType.' + request.name, 'Bridge R1 Provider directory handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'CLI R1 Provider directory mapping');
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP R1 Provider directory mapping');
    assert.ok(definitions.get(request.tool), 'MCP should define ' + request.tool);
  }

  assert.strictEqual(EventType.PROVIDER_DIRECTORY_UPDATED, 'provider.directory.updated');
  assertSourceIncludes(appModels, 'planId: string;', 'App Provider directory plan payloads');
  assertSourceIncludes(appModels, "result.targetVersion = AgentBridgeIncomingParser.extractStringProperty(value, 'targetVersion');", 'App Provider directory target version parser');
  assertSourceIncludes(appModels, "entry.profileId = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'profileId');", 'App Provider directory managed profile parser');
  assertSourceIncludes(appClient, 'new AgentBridgeProviderDirectoryRemovePayload(providerId, profileId, planId, confirm)', 'App Provider directory remove plan forwarding');
  assertSourceIncludes(appClient, 'new AgentBridgeProviderDirectoryRollbackPayload(providerId, planId, confirm)', 'App Provider directory rollback plan forwarding');
  assertSourceIncludes(appPage, "result.installStatus === 'remove_preview'", 'App Provider directory remove preview routing');
  assertSourceIncludes(appPage, 'this.client.removeRemoteProvider(result.providerId, result.profileId, result.planId, true);', 'App Provider directory remove confirmation');
  assertSourceIncludes(appPage, 'this.client.rollbackRemoteProvider(result.providerId, result.planId, true);', 'App Provider directory rollback confirmation');

  const installDefinition = definitions.get('provider_directory_install');
  const rollbackDefinition = definitions.get('provider_directory_rollback');
  const removeDefinition = definitions.get('provider_directory_remove');
  assert.ok(installDefinition.inputSchema.properties.planId, 'MCP install should expose planId');
  assert.ok(rollbackDefinition.inputSchema.properties.planId, 'MCP rollback should expose planId');
  assert.ok(removeDefinition.inputSchema.properties.planId, 'MCP remove should expose planId');
}

function assertR4ProviderUsageAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const appPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const mcpDefinitions = new Map(mcpToolDefinitions().map((definition) => [definition.name, definition]));

  for (const request of R4_PROVIDER_USAGE_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'R4 Provider usage request should remain stable');
    assertSourceIncludes(appModels, 'static readonly ' + request.name + ': string', 'App R4 Provider usage request constant');
    assertSourceIncludes(appClient, 'AgentBridgeRequestType.' + request.name, 'App R4 Provider usage client');
    assertSourceIncludes(serverSource, 'RequestType.' + request.name, 'Bridge R4 Provider usage handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'CLI R4 Provider usage mapping');
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP R4 Provider usage mapping');
    assert.ok(mcpDefinitions.get(request.tool), 'MCP should define ' + request.tool);
  }
  assertSourceIncludes(appModels, 'providerUsage: boolean;', 'App Provider usage feature flag');
  assertSourceIncludes(appModels, 'this.providerUsage = false;', 'App Provider usage safe default');
  assertSourceIncludes(appModels, "flags.providerUsage = AgentBridgeIncomingParser.extractBooleanProperty(source, 'providerUsage');", 'App Provider usage feature parser');
  assertSourceIncludes(appModels, 'static parseProviderUsageResult(', 'App Provider usage parser');
  assertSourceIncludes(appPage, 'this.client.requestProviderUsage(', 'App Provider usage App request');
  assertSourceIncludes(appPage, 'buildProviderUsageDetails()', 'App Provider usage visible details');
  assertSourceIncludes(serverSource, 'providerUsage: providerUsageService.anyAvailable()', 'Bridge Provider usage capability');
}

function assertR26MetadataAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const cliSource = readUtf8('tools/agent-bridge/src/desktop-launcher.js');
  const definitions = new Map(mcpToolDefinitions().map((definition) => [definition.name, definition]));
  for (const request of R26_METADATA_REQUESTS) {
    assert.strictEqual(RequestType[request.name], request.value, 'R26 metadata request should remain stable');
    assertSourceIncludes(appModels, 'static readonly ' + request.name + ': string', 'App R26 metadata request constant');
    assertSourceIncludes(appClient, 'AgentBridgeRequestType.' + request.name, 'App R26 metadata request mapping');
    assertSourceIncludes(serverSource, 'message.type === RequestType.' + request.name, 'Bridge R26 metadata request handler');
    assertSourceIncludes(cliSource, 'RequestType.' + request.name, 'CLI R26 metadata request mapping');
    assert.ok(definitions.get(request.tool), 'MCP R26 metadata tool should exist');
    assert.strictEqual(toolRequestType(request.tool, {}).type, request.value, 'MCP R26 metadata request mapping');
  }
  const cancelDefinition = definitions.get('metadata_generate_cancel');
  assert.strictEqual(cancelDefinition.inputSchema.required.includes('requestId'), true);
  assert.strictEqual(cancelDefinition.annotations.destructiveHint, false);
  assert.strictEqual(cancelDefinition.annotations.readOnlyHint, false);
  assertSourceIncludes(serverSource, 'Promise.race([Promise.resolve(providerPromise), cancellationPromise, timeoutPromise])', 'Metadata timeout/cancel race');
  assertSourceIncludes(serverSource, 'state.detached = true;', 'Metadata disconnect cleanup');
  assert.strictEqual(serverSource.includes('? await match.provider.generateMetadataResult(scope.providerPayload)'), false, 'Provider call must not be awaited before timeout race');
}

function assertBridgeDownloadCredentialBoundary() {
  const appPage = readUtf8('entry/src/main/ets/pages/ngf/NGFAgentHomePage.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const workspaceServiceSource = readUtf8('tools/agent-bridge/src/workspace-service.js');
  assertSourceIncludes(
    appPage,
    'private buildBridgeDownloadUrl(downloadPath: string, endpoint: string): string',
    'App download URL must not accept Bridge credential'
  );
  assertSourceIncludes(
    appPage,
    'private isSafeBridgeDownloadPath(downloadPath: string): boolean',
    'App download URL must validate server-issued path'
  );
  assertSourceIncludes(
    appPage,
    "!normalizedPath.startsWith('/download/')",
    'App download URL must require the Bridge download route'
  );
  assertSourceIncludes(
    appPage,
    "normalizedPath.indexOf('://') >= 0",
    'App download URL must reject external schemes'
  );
  assertSourceIncludes(
    appPage,
    "normalizedPath.indexOf('?') >= 0",
    'App download URL must reject query injection'
  );
  assertSourceIncludes(
    appPage,
    "normalizedPath.indexOf('%') >= 0",
    'App download URL must reject encoded path injection'
  );
  assertSourceIncludes(
    appPage,
    "throw new Error('download path is invalid')",
    'App download URL must fail closed before HTTP request'
  );
  assert.strictEqual(
    appPage.includes("'token=' + encodeURIComponent(credential)"),
    false,
    'App download URL must not append Bridge credential query parameter'
  );
  assert.strictEqual(
    appPage.includes('buildBridgeDownloadUrl(parsed.downloadPath, this.bridgeEndpoint, this.activeBridgeCredential)'),
    false,
    'App download call sites must not pass Bridge credential'
  );
  assertSourceIncludes(
    serverSource,
    'const item = workspaceService.consumeDownloadToken(token);',
    'Bridge download route must consume path token'
  );
  assertSourceIncludes(
    workspaceServiceSource,
    "downloadPath: '/download/' + encodeURIComponent(token)",
    'Workspace download payload must expose one-time path token'
  );
}

function assertRelayConsumerAlignment() {
  const appModels = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeModels.ets');
  const appClient = readUtf8('entry/src/main/ets/features/agentBridge/AgentBridgeClient.ets');
  const serverSource = readUtf8('tools/agent-bridge/src/server.js');
  const requestNames = [
    'RELAY_STATUS',
    'RELAY_PAIRING_START',
    'RELAY_PAIRING_CANCEL',
    'RELAY_CONNECT',
    'RELAY_DISCONNECT',
    'RELAY_DEVICE_LIST',
    'RELAY_DEVICE_REVOKE',
    'RELAY_IDENTITY_ROTATE'
  ];
  for (const name of requestNames) {
    assertSourceIncludes(appModels, 'static readonly ' + name + ': string', 'App request constants');
    assertSourceIncludes(serverSource, 'RequestType.' + name, 'Bridge request handler');
  }
  assertSourceIncludes(appModels, 'static readonly RELAY_UPDATED: string', 'App event constants');
  assertSourceIncludes(appModels, 'static readonly RELAY_DEVICE_UPDATED: string', 'App event constants');
  assertSourceIncludes(appModels, 'relayDeviceManagement: boolean', 'App feature flags');
  assertSourceIncludes(appModels, 'static parseRelayResult(', 'App Relay parser');
  assertSourceIncludes(appModels, 'static parseRelayPairingUri(', 'App Relay pairing parser');
  const clientMethods = [
    'requestRelayStatus()',
    'startRelayPairing(',
    'cancelRelayPairing(',
    'connectBridgeRelay(',
    'disconnectBridgeRelay(',
    'listRelayDevices(',
    'revokeRelayDevice(',
    'rotateRelayIdentity('
  ];
  for (const method of clientMethods) {
    assertSourceIncludes(appClient, method, 'App Relay client');
  }
  assertSourceIncludes(appClient, 'connectRelayPairingUri(', 'App Relay transport');
  assertSourceIncludes(appClient, 'handleRelayEncryptedData(', 'App Relay transport');
}

function assertAgentRelationshipsAndCheckpoints() {
  const manager = new AgentManager({
    store: new MemoryStore(),
    workspaceRegistry: new MemoryWorkspaceRegistry()
  });
  const parent = manager.createPlaceholder({
    providerId: 'mock',
    cwd: process.cwd(),
    workspaceTitle: 'Memory Workspace',
    title: 'Parent'
  });
  assert.ok(parent.id.length > 0);

  const checkpointResult = manager.createCheckpoint(parent.id, {
    title: 'Before fork'
  });
  assert.ok(checkpointResult.checkpoint.checkpointId.startsWith('chk_'));
  assert.strictEqual(checkpointResult.restored, undefined);

  const forkResult = manager.fork(parent.id, {
    checkpointId: checkpointResult.checkpoint.checkpointId,
    title: 'Child'
  });
  assert.strictEqual(forkResult.agent.parentAgentId, parent.id);
  assert.strictEqual(forkResult.agent.forkedFromAgentId, parent.id);
  assert.strictEqual(forkResult.agent.forkedFromCheckpointId, checkpointResult.checkpoint.checkpointId);
  assert.ok(forkResult.parent.childAgentIds.includes(forkResult.agent.id));

  const detached = manager.detach(forkResult.agent.id);
  assert.strictEqual(detached.parentAgentId, '');
  assert.strictEqual(detached.detached, true);

  const listResult = manager.listCheckpoints(parent.id);
  assert.strictEqual(listResult.checkpoints.length, 1);
  assert.strictEqual(listResult.checkpoints[0].checkpointId, checkpointResult.checkpoint.checkpointId);

  const restored = manager.restoreCheckpoint(parent.id, checkpointResult.checkpoint.checkpointId);
  assert.strictEqual(restored.restored.conversation, true);
  assert.strictEqual(restored.restored.files, false);
}

assertProtocolSurface();
assertRelayConsumerAlignment();
assertM7ConsumerAlignment();
assertM8ConsumerAlignment();
assertM11BridgeAlignment();
assertM12BridgeAlignment();
assertR1ProviderDirectoryAlignment();
assertR4ProviderUsageAlignment();
assertR26MetadataAlignment();
assertBridgeDownloadCredentialBoundary();
assertAgentRelationshipsAndCheckpoints();
console.log('protocol alignment smoke ok');
