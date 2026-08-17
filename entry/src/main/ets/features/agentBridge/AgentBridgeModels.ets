import { util } from '@kit.ArkTS';
import {
  AgentBridgeTerminalRenderer,
  AgentBridgeTerminalRenderRun
} from './AgentBridgeTerminalRenderer';

const AGENT_BRIDGE_NESTED_SCAN_LIMIT: number = 120000;

export class AgentBridgeConnectionStatus {
  static readonly DISCONNECTED: string = 'disconnected';
  static readonly CONNECTING: string = 'connecting';
  static readonly CONNECTED: string = 'connected';
  static readonly ERROR: string = 'error';
}

export class AgentBridgeProviderId {
  static readonly MOCK: string = 'mock';
  static readonly OPENCODE: string = 'opencode';
  static readonly DEVECO: string = 'deveco';
  static readonly MIMO: string = 'mimo';
  static readonly CODEX: string = 'codex';
  static readonly CLAUDE: string = 'claude';
  static readonly ANTIGRAVITY: string = 'antigravity';
  static readonly OPENCLAW: string = 'openclaw';
  static readonly OPENCLAW_GATEWAY: string = 'openclaw-gateway';
  static readonly HERMES: string = 'hermes';
  static readonly HERMES_STUDIO: string = 'hermes-studio';
}

export class AgentBridgeRequestType {
  static readonly HELLO: string = 'hello';
  static readonly APP_PING: string = 'ping';
  static readonly SERVER_INFO_GET: string = 'server.info.get';
  static readonly PROVIDER_CATALOG: string = 'provider.catalog';
  static readonly PROVIDER_CATALOG_REFRESH: string = 'provider.catalog.refresh';
  static readonly AGENT_LIST: string = 'agent.list';
  static readonly AGENT_CREATE: string = 'agent.create';
  static readonly AGENT_RUN: string = 'agent.run';
  static readonly AGENT_SEND: string = 'agent.send';
  static readonly AGENT_STATUS: string = 'agent.status';
  static readonly AGENT_ATTACH: string = 'agent.attach';
  static readonly AGENT_STOP: string = 'agent.stop';
  static readonly AGENT_RESUME: string = 'agent.resume';
  static readonly AGENT_DELETE: string = 'agent.delete';
  static readonly AGENT_UPDATE: string = 'agent.update';
  static readonly AGENT_MODE_SET: string = 'agent.mode.set';
  static readonly AGENT_MODEL_SET: string = 'agent.model.set';
  static readonly AGENT_ARCHIVE: string = 'agent.archive';
  static readonly AGENT_ATTENTION_CLEAR: string = 'agent.attention.clear';
  static readonly AGENT_FORK: string = 'agent.fork';
  static readonly AGENT_DETACH: string = 'agent.detach';
  static readonly CHECKPOINT_LIST: string = 'checkpoint.list';
  static readonly CHECKPOINT_CREATE: string = 'checkpoint.create';
  static readonly CHECKPOINT_RESTORE: string = 'checkpoint.restore';
  static readonly TIMELINE_FETCH: string = 'timeline.fetch';
  static readonly TIMELINE_ACK: string = 'timeline.ack';
  static readonly WORKSPACE_REGISTRY_LIST: string = 'workspace.registry.list';
  static readonly WORKSPACE_REGISTRY_CREATE: string = 'workspace.registry.create';
  static readonly WORKSPACE_REGISTRY_IMPORT: string = 'workspace.registry.import';
  static readonly WORKSPACE_REGISTRY_UPSERT: string = 'workspace.registry.upsert';
  static readonly WORKSPACE_REGISTRY_ARCHIVE: string = 'workspace.registry.archive';
  static readonly WORKSPACE_REGISTRY_OPEN: string = 'workspace.registry.open';
  static readonly WORKSPACE_REGISTRY_SUGGESTIONS: string = 'workspace.registry.suggestions';
  static readonly WORKSPACE_REGISTRY_DOCTOR: string = 'workspace.registry.doctor';
  static readonly PROJECT_REGISTRY_LIST: string = 'project.registry.list';
  static readonly TERMINAL_LIST: string = 'terminal.list';
  static readonly TERMINAL_CREATE: string = 'terminal.create';
  static readonly TERMINAL_SUBSCRIBE: string = 'terminal.subscribe';
  static readonly TERMINAL_UNSUBSCRIBE: string = 'terminal.unsubscribe';
  static readonly TERMINAL_CAPTURE: string = 'terminal.capture';
  static readonly TERMINAL_KILL: string = 'terminal.kill';
  static readonly TERMINAL_RENAME: string = 'terminal.rename';
  static readonly TERMINAL_HOOK_INSTALL: string = 'terminal.hook.install';
  static readonly TERMINAL_HOOK_STATUS: string = 'terminal.hook.status';
  static readonly FILE_TRANSFER_DOWNLOAD: string = 'file.transfer.download';
  static readonly FILE_TRANSFER_UPLOAD: string = 'file.transfer.upload';
  static readonly FILE_TRANSFER_CANCEL: string = 'file.transfer.cancel';
  static readonly PROVIDER_PROFILE_LIST: string = 'provider.profile.list';
  static readonly PROVIDER_PROFILE_UPSERT: string = 'provider.profile.upsert';
  static readonly PROVIDER_PROFILE_DELETE: string = 'provider.profile.delete';
  static readonly PROVIDER_PROFILE_TEST: string = 'provider.profile.test';
  static readonly PROVIDER_ACP_DISCOVER: string = 'provider.acp.discover';
  static readonly PROVIDER_ACP_IMPORT: string = 'provider.acp.import';
  static readonly PROVIDER_DIRECTORY_LIST: string = 'provider.directory.list';
  static readonly PROVIDER_DIRECTORY_REFRESH: string = 'provider.directory.refresh';
  static readonly PROVIDER_DIRECTORY_INSTALL: string = 'provider.directory.install';
  static readonly PROVIDER_DIRECTORY_STATUS: string = 'provider.directory.status';
  static readonly PROVIDER_DIRECTORY_ROLLBACK: string = 'provider.directory.rollback';
  static readonly PROVIDER_DIRECTORY_REMOVE: string = 'provider.directory.remove';
  static readonly PING: string = 'bridge.ping';
  static readonly CAPABILITIES_GET: string = 'capabilities.get';
  static readonly SESSION_CREATE: string = 'session.create';
  static readonly SESSION_LIST: string = 'session.list';
  static readonly SESSION_MESSAGES: string = 'session.messages';
  static readonly SESSION_REVERT: string = 'session.revert';
  static readonly SESSION_ABORT: string = 'session.abort';
  static readonly MESSAGE_SEND: string = 'message.send';
  static readonly MESSAGE_QUEUE_LIST: string = 'message.queue.list';
  static readonly MESSAGE_QUEUE_CANCEL: string = 'message.queue.cancel';
  static readonly MESSAGE_QUEUE_RETRY: string = 'message.queue.retry';
  static readonly VOICE_STATUS: string = 'voice.status';
  static readonly VOICE_SESSION_START: string = 'voice.session.start';
  static readonly VOICE_SESSION_CHUNK: string = 'voice.session.chunk';
  static readonly VOICE_SESSION_FINISH: string = 'voice.session.finish';
  static readonly VOICE_SESSION_CANCEL: string = 'voice.session.cancel';
  static readonly VOICE_TTS_SPEAK: string = 'voice.tts.speak';
  static readonly VOICE_TTS_STOP: string = 'voice.tts.stop';
  static readonly USAGE_SUMMARY_GET: string = 'usage.summary.get';
  static readonly USAGE_EVENTS_LIST: string = 'usage.events.list';
  static readonly USAGE_BUDGET_GET: string = 'usage.budget.get';
  static readonly USAGE_BUDGET_SET: string = 'usage.budget.set';
  static readonly PROVIDER_USAGE_LIST: string = 'provider.usage.list';
  static readonly METADATA_GENERATE: string = 'metadata.generate';
  static readonly METADATA_GENERATE_CANCEL: string = 'metadata.generate.cancel';
  static readonly DIAGNOSTICS_EXPORT: string = 'diagnostics.export';
  static readonly PREVIEW_GET: string = 'preview.get';
  static readonly PERMISSION_RESPOND: string = 'permission.respond';
  static readonly REQUEST_RESPOND: string = 'request.respond';
  static readonly PLAN_RESPOND: string = 'plan.respond';
  static readonly OPENCODE_REQUEST: string = 'opencode.request';
  static readonly WORKSPACE_CHANGES_GET: string = 'workspace.changes.get';
  static readonly WORKSPACE_DIFF_GET: string = 'workspace.diff.get';
  static readonly WORKSPACE_FILES_LIST: string = 'workspace.files.list';
  static readonly WORKSPACE_FILE_GET: string = 'workspace.file.get';
  static readonly WORKSPACE_FILE_DOWNLOAD: string = 'workspace.file.download';
  static readonly ATTACHMENT_FILE_DOWNLOAD: string = 'attachment.file.download';
  static readonly WORKSPACE_GIT_STAGE: string = 'workspace.git.stage';
  static readonly WORKSPACE_GIT_UNSTAGE: string = 'workspace.git.unstage';
  static readonly WORKSPACE_GIT_DISCARD: string = 'workspace.git.discard';
  static readonly WORKSPACE_GIT_COMMIT: string = 'workspace.git.commit';
  static readonly WORKSPACE_GIT_PULL: string = 'workspace.git.pull';
  static readonly WORKSPACE_GIT_PUSH: string = 'workspace.git.push';
  static readonly WORKSPACE_GIT_BRANCH: string = 'workspace.git.branch';
  static readonly WORKSPACE_GIT_STASH: string = 'workspace.git.stash';
  static readonly WORKSPACE_GIT_MERGE: string = 'workspace.git.merge';
  static readonly WORKSPACE_GIT_SUBSCRIBE: string = 'workspace.git.subscribe';
  static readonly WORKTREE_LIST: string = 'worktree.list';
  static readonly WORKTREE_CREATE: string = 'worktree.create';
  static readonly WORKTREE_ARCHIVE: string = 'worktree.archive';
  static readonly GITHUB_PR_CREATE: string = 'github.pr.create';
  static readonly GITHUB_PR_LIST: string = 'github.pr.list';
  static readonly GITHUB_PR_UPDATE: string = 'github.pr.update';
  static readonly GITHUB_PR_REVIEWERS_UPDATE: string = 'github.pr.reviewers.update';
  static readonly GITHUB_PR_LABELS_UPDATE: string = 'github.pr.labels.update';
  static readonly GITHUB_PR_MERGE: string = 'github.pr.merge';
  static readonly GITHUB_PR_STATUS: string = 'github.pr.status';
  static readonly GITHUB_CHECKS_LIST: string = 'github.checks.list';
  static readonly GITHUB_ISSUE_SEARCH: string = 'github.issue.search';
  static readonly GITHUB_ISSUE_ATTACHMENT_LIST: string = 'github.issue.attachment.list';
  static readonly GITHUB_AUTH_DEVICE_START: string = 'github.auth.device.start';
  static readonly GITHUB_AUTH_DEVICE_POLL: string = 'github.auth.device.poll';
  static readonly GITHUB_AUTH_STATUS: string = 'github.auth.status';
  static readonly GITHUB_AUTH_LOGOUT: string = 'github.auth.logout';
  static readonly GITHUB_ACCOUNT_LIST: string = 'github.account.list';
  static readonly GITHUB_BINDING_GET: string = 'github.binding.get';
  static readonly GITHUB_BINDING_SET: string = 'github.binding.set';
  static readonly GITHUB_WATCH_START: string = 'github.watch.start';
  static readonly GITHUB_WATCH_STOP: string = 'github.watch.stop';
  static readonly GITHUB_ATTACHMENT_PREVIEW: string = 'github.attachment.preview';
  static readonly GITHUB_ATTACHMENT_UPLOAD: string = 'github.attachment.upload';
  static readonly MCP_SERVER_START: string = 'mcp.server.start';
  static readonly MCP_SERVER_STOP: string = 'mcp.server.stop';
  static readonly MCP_TOOLS_LIST: string = 'mcp.tools.list';
  static readonly NOTIFICATION_LIST: string = 'notification.list';
  static readonly NOTIFICATION_READ: string = 'notification.read';
  static readonly NOTIFICATION_ACTION: string = 'notification.action';
  static readonly NOTIFICATION_PRUNE: string = 'notification.prune';
  static readonly NOTIFICATION_PUSH_STATUS: string = 'notification.push.status';
  static readonly NOTIFICATION_PUSH_REGISTER: string = 'notification.push.register';
  static readonly NOTIFICATION_PUSH_UNREGISTER: string = 'notification.push.unregister';
  static readonly DAEMON_STATUS: string = 'daemon.status';
  static readonly DAEMON_HEALTH: string = 'daemon.health';
  static readonly DAEMON_START: string = 'daemon.start';
  static readonly DAEMON_STOP: string = 'daemon.stop';
  static readonly DAEMON_RESTART: string = 'daemon.restart';
  static readonly DAEMON_LOGS: string = 'daemon.logs';
  static readonly DAEMON_AUTOSTART_STATUS: string = 'daemon.autostart.status';
  static readonly DAEMON_AUTOSTART_PREVIEW: string = 'daemon.autostart.preview';
  static readonly DAEMON_AUTOSTART_SET: string = 'daemon.autostart.set';
  static readonly DAEMON_AUTOSTART_INSTALL: string = 'daemon.autostart.install';
  static readonly DAEMON_AUTOSTART_UNINSTALL: string = 'daemon.autostart.uninstall';
  static readonly DAEMON_UPDATE_STATUS: string = 'daemon.update.status';
  static readonly DAEMON_UPDATE_CHECK: string = 'daemon.update.check';
  static readonly DAEMON_UPDATE_PREVIEW: string = 'daemon.update.preview';
  static readonly DAEMON_UPDATE_INSTALL: string = 'daemon.update.install';
  static readonly DAEMON_UPDATE_ROLLBACK: string = 'daemon.update.rollback';
  static readonly DAEMON_CONFIG_STATUS: string = 'daemon.config.status';
  static readonly DAEMON_CONFIG_FETCH: string = 'daemon.config.fetch';
  static readonly DAEMON_CONFIG_VALIDATE: string = 'daemon.config.validate';
  static readonly DAEMON_CONFIG_PREVIEW: string = 'daemon.config.preview';
  static readonly DAEMON_CONFIG_APPLY: string = 'daemon.config.apply';
  static readonly DAEMON_CONFIG_ROLLBACK: string = 'daemon.config.rollback';
  static readonly DAEMON_INSTANCE_STATUS: string = 'daemon.instance.status';
  static readonly SCHEDULE_STATUS: string = 'schedule.status';
  static readonly SCHEDULE_LIST: string = 'schedule.list';
  static readonly SCHEDULE_GET: string = 'schedule.get';
  static readonly SCHEDULE_CREATE: string = 'schedule.create';
  static readonly SCHEDULE_UPDATE: string = 'schedule.update';
  static readonly SCHEDULE_ENABLE: string = 'schedule.enable';
  static readonly SCHEDULE_DISABLE: string = 'schedule.disable';
  static readonly SCHEDULE_RUN_NOW: string = 'schedule.run-now';
  static readonly SCHEDULE_HISTORY: string = 'schedule.history';
  static readonly SCHEDULE_REMOVE: string = 'schedule.remove';
  static readonly LOOP_STATUS: string = 'loop.status';
  static readonly LOOP_LIST: string = 'loop.list';
  static readonly LOOP_GET: string = 'loop.get';
  static readonly LOOP_CREATE: string = 'loop.create';
  static readonly LOOP_UPDATE: string = 'loop.update';
  static readonly LOOP_START: string = 'loop.start';
  static readonly LOOP_PAUSE: string = 'loop.pause';
  static readonly LOOP_RESUME: string = 'loop.resume';
  static readonly LOOP_STOP: string = 'loop.stop';
  static readonly LOOP_TAKEOVER: string = 'loop.takeover';
  static readonly LOOP_ROUNDS: string = 'loop.rounds';
  static readonly LOOP_REMOVE: string = 'loop.remove';
  static readonly CHAT_ROOM_STATUS: string = 'chat.room.status';
  static readonly CHAT_ROOM_LIST: string = 'chat.room.list';
  static readonly CHAT_ROOM_GET: string = 'chat.room.get';
  static readonly CHAT_ROOM_CREATE: string = 'chat.room.create';
  static readonly CHAT_ROOM_UPDATE: string = 'chat.room.update';
  static readonly CHAT_ROOM_ARCHIVE: string = 'chat.room.archive';
  static readonly CHAT_ROOM_MEMBER_ADD: string = 'chat.room.member.add';
  static readonly CHAT_ROOM_MEMBER_UPDATE: string = 'chat.room.member.update';
  static readonly CHAT_ROOM_MEMBER_REMOVE: string = 'chat.room.member.remove';
  static readonly CHAT_ROOM_MESSAGE_POST: string = 'chat.room.message.post';
  static readonly CHAT_ROOM_MESSAGE_LIST: string = 'chat.room.message.list';
  static readonly CHAT_ROOM_ACK: string = 'chat.room.ack';
  static readonly SECURITY_DEVICE_LIST: string = 'security.device.list';
  static readonly SECURITY_DEVICE_TRUST: string = 'security.device.trust';
  static readonly SECURITY_DEVICE_REVOKE: string = 'security.device.revoke';
  static readonly RELAY_STATUS: string = 'relay.status';
  static readonly RELAY_PAIRING_START: string = 'relay.pairing.start';
  static readonly RELAY_PAIRING_CANCEL: string = 'relay.pairing.cancel';
  static readonly RELAY_CONNECT: string = 'relay.connect';
  static readonly RELAY_DISCONNECT: string = 'relay.disconnect';
  static readonly RELAY_DEVICE_LIST: string = 'relay.device.list';
  static readonly RELAY_DEVICE_REVOKE: string = 'relay.device.revoke';
  static readonly RELAY_IDENTITY_ROTATE: string = 'relay.identity.rotate';
  static readonly WORKSPACE_SERVICE_LIST: string = 'workspace.service.list';
  static readonly WORKSPACE_SERVICE_UPSERT: string = 'workspace.service.upsert';
  static readonly WORKSPACE_SERVICE_STATUS: string = 'workspace.service.status';
  static readonly WORKSPACE_SERVICE_HEALTH: string = 'workspace.service.health';
  static readonly WORKSPACE_SERVICE_START: string = 'workspace.service.start';
  static readonly WORKSPACE_SERVICE_STOP: string = 'workspace.service.stop';
  static readonly WORKSPACE_SERVICE_LOGS: string = 'workspace.service.logs';
  static readonly WORKSPACE_SERVICE_OPEN: string = 'workspace.service.open';
  static readonly WORKSPACE_SERVICE_REMOVE: string = 'workspace.service.remove';
  static readonly BROWSER_HOST_LIST: string = 'browser.host.list';
  static readonly BROWSER_INSTANCE_LIST: string = 'browser.instance.list';
  static readonly BROWSER_INSTANCE_CREATE: string = 'browser.instance.create';
  static readonly BROWSER_INSTANCE_CLOSE: string = 'browser.instance.close';
  static readonly BROWSER_PAGE_LIST: string = 'browser.page.list';
  static readonly BROWSER_PAGE_CREATE: string = 'browser.page.create';
  static readonly BROWSER_PAGE_CLOSE: string = 'browser.page.close';
  static readonly BROWSER_PAGE_NAVIGATE: string = 'browser.page.navigate';
  static readonly BROWSER_PAGE_SNAPSHOT: string = 'browser.page.snapshot';
  static readonly BROWSER_PAGE_SCREENSHOT: string = 'browser.page.screenshot';
  static readonly BROWSER_PAGE_LOGS: string = 'browser.page.logs';
  static readonly BROWSER_PAGE_WAIT: string = 'browser.page.wait';
  static readonly BROWSER_PAGE_ACTION: string = 'browser.page.action';
  static readonly BROWSER_DOWNLOAD_LIST: string = 'browser.download.list';
  static readonly BROWSER_PERMISSION_GET: string = 'browser.permission.get';
  static readonly BROWSER_PERMISSION_SET: string = 'browser.permission.set';
}

export class AgentBridgeEnvelopeType {
  static readonly RESPONSE: string = 'response';
  static readonly EVENT: string = 'event';
  static readonly RAW: string = 'raw';
}

export class AgentBridgeEventType {
  static readonly BRIDGE_CONNECTED: string = 'bridge.connected';
  static readonly SERVER_INFO: string = 'server.info';
  static readonly AGENT_CREATED: string = 'agent.created';
  static readonly AGENT_UPDATED: string = 'agent.updated';
  static readonly AGENT_DELETED: string = 'agent.deleted';
  static readonly AGENT_RELATIONSHIP_UPDATED: string = 'agent.relationship.updated';
  static readonly AGENT_TIMELINE_UPDATED: string = 'agent.timeline.updated';
  static readonly CHECKPOINT_UPDATED: string = 'checkpoint.updated';
  static readonly PROVIDER_CATALOG_UPDATED: string = 'provider.catalog.updated';
  static readonly PROVIDER_PROFILE_UPDATED: string = 'provider.profile.updated';
  static readonly WORKSPACE_REGISTRY_UPDATED: string = 'workspace.registry.updated';
  static readonly WORKTREE_UPDATED: string = 'worktree.updated';
  static readonly TERMINAL_UPDATED: string = 'terminal.updated';
  static readonly TERMINAL_HOOK_UPDATED: string = 'terminal.hook.updated';
  static readonly TERMINAL_CAPTURE_PERSISTED: string = 'terminal.capture.persisted';
  static readonly TERMINAL_STREAM_EXIT: string = 'terminal.stream.exit';
  static readonly TERMINAL_ATTENTION: string = 'terminal.attention';
  static readonly FILE_TRANSFER_PROGRESS: string = 'file.transfer.progress';
  static readonly FILE_TRANSFER_COMPLETED: string = 'file.transfer.completed';
  static readonly FILE_TRANSFER_FAILED: string = 'file.transfer.failed';
  static readonly SESSION_CREATED: string = 'session.created';
  static readonly SESSION_UPDATED: string = 'session.updated';
  static readonly SESSION_MESSAGES: string = 'session.messages';
  static readonly MESSAGE_DELTA: string = 'message.delta';
  static readonly MESSAGE_COMPLETED: string = 'message.completed';
  static readonly MESSAGE_QUEUE_UPDATED: string = 'message.queue.updated';
  static readonly USAGE_UPDATED: string = 'usage.updated';
  static readonly USAGE_BUDGET_WARNING: string = 'usage.budget.warning';
  static readonly VOICE_TRANSCRIPT_PARTIAL: string = 'voice.transcript.partial';
  static readonly VOICE_TRANSCRIPT_FINAL: string = 'voice.transcript.final';
  static readonly VOICE_VAD_CHANGED: string = 'voice.vad.changed';
  static readonly VOICE_TTS_UPDATED: string = 'voice.tts.updated';
  static readonly VOICE_SESSION_UPDATED: string = 'voice.session.updated';
  static readonly TOOL_STARTED: string = 'tool.started';
  static readonly TOOL_OUTPUT: string = 'tool.output';
  static readonly TOOL_COMPLETED: string = 'tool.completed';
  static readonly PERMISSION_REQUESTED: string = 'permission.requested';
  static readonly QUESTION_REQUESTED: string = 'question.requested';
  static readonly PLAN_REQUESTED: string = 'plan.requested';
  static readonly PLAN_UPDATED: string = 'plan.updated';
  static readonly TODO_UPDATED: string = 'todo.updated';
  static readonly OPENCODE_EVENT: string = 'opencode.event';
  static readonly PREVIEW_UPDATED: string = 'preview.updated';
  static readonly WORKSPACE_CHANGES_UPDATED: string = 'workspace.changes.updated';
  static readonly WORKSPACE_DIFF_SUBSCRIPTION_UPDATED: string = 'workspace.diff.subscription.updated';
  static readonly WORKSPACE_FILES_UPDATED: string = 'workspace.files.updated';
  static readonly FILE_DOWNLOAD_READY: string = 'file.download.ready';
  static readonly GITHUB_PR_UPDATED: string = 'github.pr.updated';
  static readonly GITHUB_CHECKS_UPDATED: string = 'github.checks.updated';
  static readonly GITHUB_AUTH_UPDATED: string = 'github.auth.updated';
  static readonly GITHUB_BINDING_UPDATED: string = 'github.binding.updated';
  static readonly NOTIFICATION_CREATED: string = 'notification.created';
  static readonly NOTIFICATION_UPDATED: string = 'notification.updated';
  static readonly NOTIFICATION_ACTION: string = 'notification.action';
  static readonly NOTIFICATION_PUSH_UPDATED: string = 'notification.push.updated';
  static readonly DAEMON_HEALTH_UPDATED: string = 'daemon.health.updated';
  static readonly DAEMON_UPDATE_UPDATED: string = 'daemon.update.updated';
  static readonly DAEMON_CONFIG_UPDATED: string = 'daemon.config.updated';
  static readonly SCHEDULE_UPDATED: string = 'schedule.updated';
  static readonly SCHEDULE_RUN_UPDATED: string = 'schedule.run.updated';
  static readonly LOOP_UPDATED: string = 'loop.updated';
  static readonly LOOP_ROUND_UPDATED: string = 'loop.round.updated';
  static readonly CHAT_ROOM_UPDATED: string = 'chat.room.updated';
  static readonly CHAT_ROOM_MESSAGE_CREATED: string = 'chat.room.message.created';
  static readonly CHAT_ROOM_ACK_UPDATED: string = 'chat.room.ack.updated';
  static readonly RELAY_UPDATED: string = 'relay.updated';
  static readonly RELAY_DEVICE_UPDATED: string = 'relay.device.updated';
  static readonly WORKSPACE_SERVICE_UPDATED: string = 'workspace.service.updated';
  static readonly BROWSER_HOST_COMMAND: string = 'browser.host.command';
  static readonly BROWSER_UPDATED: string = 'browser.updated';
  static readonly SECURITY_WARNING: string = 'security.warning';
  static readonly ERROR: string = 'error';
}

export class AgentBridgeTimelineKind {
  static readonly STATUS: string = 'status';
  static readonly MESSAGE: string = 'message';
  static readonly TOOL: string = 'tool';
  static readonly ERROR: string = 'error';
  static readonly RAW: string = 'raw';
}

export class AgentBridgeConnectionConfig {
  endpoint: string;
  token: string;
  clientId: string;
  appNonce: string;
  hostProfileId: string;
  appVersion: string;
  relayUrl: string;
  relayId: string;
  relayOfferId: string;
  relayPairingSecret: string;
  relayPairingExpiresAt: string;
  relayBridgeIdentityPublicKeyBase64: string;
  relayBridgeIdentityPublicKeyPem: string;
  relayBridgeIdentityFingerprint: string;

  constructor(endpoint: string, token: string, clientId: string = 'harmony-coder-app', appNonce: string = '', hostProfileId: string = '', appVersion: string = '') {
    this.endpoint = endpoint;
    this.token = token;
    this.clientId = clientId;
    this.appNonce = appNonce;
    this.hostProfileId = hostProfileId;
    this.appVersion = appVersion;
    this.relayUrl = '';
    this.relayId = '';
    this.relayOfferId = '';
    this.relayPairingSecret = '';
    this.relayPairingExpiresAt = '';
    this.relayBridgeIdentityPublicKeyBase64 = '';
    this.relayBridgeIdentityPublicKeyPem = '';
    this.relayBridgeIdentityFingerprint = '';
  }
}

export class AgentBridgeTrustState {
  static readonly UNKNOWN: string = 'unknown';
  static readonly TRUSTED: string = 'trusted';
  static readonly UNTRUSTED: string = 'untrusted';
  static readonly LEGACY_LIMITED: string = 'legacy_limited';
}

export class AgentBridgeDeviceIdentity {
  physicalDeviceId: string;
  bridgeInstanceId: string;
  displayName: string;
  platform: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  keyType: string;
  signatureAlgorithm: string;

  constructor(
    physicalDeviceId: string,
    bridgeInstanceId: string,
    displayName: string,
    platform: string,
    publicKeyPem: string,
    publicKeyFingerprint: string,
    keyType: string,
    signatureAlgorithm: string
  ) {
    this.physicalDeviceId = physicalDeviceId;
    this.bridgeInstanceId = bridgeInstanceId;
    this.displayName = displayName;
    this.platform = platform;
    this.publicKeyPem = publicKeyPem;
    this.publicKeyFingerprint = publicKeyFingerprint;
    this.keyType = keyType;
    this.signatureAlgorithm = signatureAlgorithm;
  }

  static empty(): AgentBridgeDeviceIdentity {
    return new AgentBridgeDeviceIdentity('', '', '', '', '', '', '', '');
  }
}

export class AgentBridgeConnectionProof {
  algorithm: string;
  keyType: string;
  curve: string;
  encoding: string;
  verifier: string;
  material: string;
  signature: string;
  appNonce: string;
  serverNonce: string;
  issuedAt: number;

  constructor(
    algorithm: string,
    keyType: string,
    curve: string,
    encoding: string,
    verifier: string,
    material: string,
    signature: string,
    appNonce: string,
    serverNonce: string,
    issuedAt: number
  ) {
    this.algorithm = algorithm;
    this.keyType = keyType;
    this.curve = curve;
    this.encoding = encoding;
    this.verifier = verifier;
    this.material = material;
    this.signature = signature;
    this.appNonce = appNonce;
    this.serverNonce = serverNonce;
    this.issuedAt = issuedAt;
  }

  static empty(): AgentBridgeConnectionProof {
    return new AgentBridgeConnectionProof('', '', '', '', '', '', '', '', '', 0);
  }
}

export class AgentBridgeDeviceHandshake {
  identity: AgentBridgeDeviceIdentity;
  proof: AgentBridgeConnectionProof;

  constructor(identity: AgentBridgeDeviceIdentity, proof: AgentBridgeConnectionProof) {
    this.identity = identity;
    this.proof = proof;
  }
}

export class AgentBridgeTrustedDevice {
  deviceId: string;
  bridgeInstanceId: string;
  displayName: string;
  platform: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  lastEndpoint: string;
  tokenDigest: string;
  trustState: string;
  firstTrustedAt: number;
  lastSeenAt: number;

  constructor(
    deviceId: string,
    bridgeInstanceId: string,
    displayName: string,
    platform: string,
    publicKeyPem: string,
    publicKeyFingerprint: string,
    lastEndpoint: string,
    tokenDigest: string,
    trustState: string,
    firstTrustedAt: number,
    lastSeenAt: number
  ) {
    this.deviceId = deviceId;
    this.bridgeInstanceId = bridgeInstanceId;
    this.displayName = displayName;
    this.platform = platform;
    this.publicKeyPem = publicKeyPem;
    this.publicKeyFingerprint = publicKeyFingerprint;
    this.lastEndpoint = lastEndpoint;
    this.tokenDigest = tokenDigest;
    this.trustState = trustState;
    this.firstTrustedAt = firstTrustedAt;
    this.lastSeenAt = lastSeenAt;
  }
}

export class AgentBridgeServerFeatureFlags {
  protocolV2: boolean;
  deviceIdentity: boolean;
  trustedCacheNamespace: boolean;
  serverInfo: boolean;
  providerCatalog: boolean;
  agentLifecycle: boolean;
  authoritativeTimeline: boolean;
  projectWorkspaceRegistry: boolean;
  managedProcessLedger: boolean;
  terminalBinaryFrames: boolean;
  terminalActivity: boolean;
  terminalMouse: boolean;
  fileTransferBinaryFrames: boolean;
  interactiveProviderSessions: boolean;
  interactiveCliSessions: boolean;
  agentRelationships: boolean;
  checkpoints: boolean;
  fileCheckpoints: boolean;
  terminalHooks: boolean;
  terminalCapturePersistence: boolean;
  terminalSnapshotBackpressure: boolean;
  terminalSequencedRestore: boolean;
  dynamicProviderDiscovery: boolean;
  providerProfiles: boolean;
  providerSecretStorage: boolean;
  acpProviders: boolean;
  remoteProviderDirectory: boolean;
  gitAdvanced: boolean;
  gitOperationPlans: boolean;
  gitDiffSubscriptions: boolean;
  githubIntegration: boolean;
  githubOAuth: boolean;
  githubPrWorkflow: boolean;
  githubWatch: boolean;
  githubAssetUpload: boolean;
  largeDiffPagination: boolean;
  remoteDaemonConfig: boolean;
  daemonInstanceIdentity: boolean;
  daemonFleetOrchestration: boolean;
  daemonFleetTarget: boolean;
  richContentAst: boolean;
  messageQueue: boolean;
  usageEvents: boolean;
  usageBudgets: boolean;
  providerUsage: boolean;
  metadataGeneration: boolean;
  diagnosticsExport: boolean;
  adaptiveWorkbench: boolean;
  commandPalette: boolean;
  sessionWindows: boolean;
  worktrees: boolean;
  mcpHost: boolean;
  offlineNotifications: boolean;
  pushKitSubscriptions: boolean;
  pushKitDelivery: boolean;
  daemonManagement: boolean;
  daemonSupervisor: boolean;
  daemonAutostartInstaller: boolean;
  daemonSelfUpdate: boolean;
  securityDeviceTrust: boolean;
  schedules: boolean;
  loops: boolean;
  chat: boolean;
  chatRooms: boolean;
  relay: boolean;
  relayE2E: boolean;
  relayDeviceManagement: boolean;
  deviceManagement: boolean;
  voice: boolean;
  voiceAudioCapture: boolean;
  voiceAudioPlayback: boolean;
  voiceSpeechToText: boolean;
  voiceTextToSpeech: boolean;
  voiceRemoteSpeechToText: boolean;
  voiceRemoteTextToSpeech: boolean;
  voiceCapabilityMatrix: boolean;
  voicePrivacyStatus: boolean;
  voiceActivityEvents: boolean;
  voiceInterruptionHandling: boolean;
  browserAutomation: boolean;
  browserHostCapabilityMetadata: boolean;
  browserPlatformHost: boolean;
  serviceProxy: boolean;

  constructor() {
    this.protocolV2 = false;
    this.deviceIdentity = false;
    this.trustedCacheNamespace = false;
    this.serverInfo = false;
    this.providerCatalog = false;
    this.agentLifecycle = false;
    this.authoritativeTimeline = false;
    this.projectWorkspaceRegistry = false;
    this.managedProcessLedger = false;
    this.terminalBinaryFrames = false;
    this.terminalActivity = false;
    this.terminalMouse = false;
    this.fileTransferBinaryFrames = false;
    this.interactiveProviderSessions = false;
    this.interactiveCliSessions = false;
    this.agentRelationships = false;
    this.checkpoints = false;
    this.fileCheckpoints = false;
    this.terminalHooks = false;
    this.terminalCapturePersistence = false;
    this.terminalSnapshotBackpressure = false;
    this.terminalSequencedRestore = false;
    this.dynamicProviderDiscovery = false;
    this.providerProfiles = false;
    this.providerSecretStorage = false;
    this.acpProviders = false;
    this.remoteProviderDirectory = false;
    this.gitAdvanced = false;
    this.gitOperationPlans = false;
    this.gitDiffSubscriptions = false;
    this.githubIntegration = false;
    this.githubOAuth = false;
    this.githubPrWorkflow = false;
    this.githubWatch = false;
    this.githubAssetUpload = false;
    this.largeDiffPagination = false;
    this.remoteDaemonConfig = false;
    this.daemonInstanceIdentity = false;
    this.daemonFleetOrchestration = false;
    this.daemonFleetTarget = false;
    this.richContentAst = false;
    this.messageQueue = false;
    this.usageEvents = false;
    this.usageBudgets = false;
    this.providerUsage = false;
    this.metadataGeneration = false;
    this.diagnosticsExport = false;
    this.adaptiveWorkbench = false;
    this.commandPalette = false;
    this.sessionWindows = false;
    this.worktrees = false;
    this.mcpHost = false;
    this.offlineNotifications = false;
    this.pushKitSubscriptions = false;
    this.pushKitDelivery = false;
    this.daemonManagement = false;
    this.daemonSupervisor = false;
    this.daemonAutostartInstaller = false;
    this.daemonSelfUpdate = false;
    this.securityDeviceTrust = false;
    this.schedules = false;
    this.loops = false;
    this.chat = false;
    this.chatRooms = false;
    this.relay = false;
    this.relayE2E = false;
    this.relayDeviceManagement = false;
    this.deviceManagement = false;
    this.voice = false;
    this.voiceAudioCapture = false;
    this.voiceAudioPlayback = false;
    this.voiceSpeechToText = false;
    this.voiceTextToSpeech = false;
    this.voiceRemoteSpeechToText = false;
    this.voiceRemoteTextToSpeech = false;
    this.voiceCapabilityMatrix = false;
    this.voicePrivacyStatus = false;
    this.voiceActivityEvents = false;
    this.voiceInterruptionHandling = false;
    this.browserAutomation = false;
    this.browserHostCapabilityMetadata = false;
    this.browserPlatformHost = false;
    this.serviceProxy = false;
  }
}

export class AgentBridgeCompatibilityInfo {
  status: string = 'unknown';
  blocking: boolean = false;
  reason: string = '';
  minimumAppVersion: string = '';
  recommendedAppVersion: string = '';
  minimumBridgeVersion: string = '';
  recommendedBridgeVersion: string = '';
  minimumProtocolVersion: string = '';
  recommendedProtocolVersion: string = '';
  supportedProtocolVersions: Array<string> = [];
  remediation: string = '';
}

export class AgentBridgeCompatibilityStatus {
  static readonly COMPATIBLE: string = 'compatible';
  static readonly UPGRADE_RECOMMENDED: string = 'upgradeRecommended';
  static readonly APP_TOO_OLD: string = 'appTooOld';
  static readonly BRIDGE_TOO_OLD: string = 'bridgeTooOld';
  static readonly UNKNOWN: string = 'unknown';

  static normalize(value: string): string {
    if (value === AgentBridgeCompatibilityStatus.COMPATIBLE ||
      value === AgentBridgeCompatibilityStatus.UPGRADE_RECOMMENDED ||
      value === AgentBridgeCompatibilityStatus.APP_TOO_OLD ||
      value === AgentBridgeCompatibilityStatus.BRIDGE_TOO_OLD) {
      return value;
    }
    return AgentBridgeCompatibilityStatus.UNKNOWN;
  }
}

export class AgentBridgeProviderUsageAvailabilityState {
  static readonly UNSUPPORTED: string = 'unsupported';
  static readonly AVAILABLE: string = 'available';
  static readonly AVAILABLE_EMPTY: string = 'available-empty';
  static readonly FAILED: string = 'failed';
  static readonly STALE: string = 'stale';
  static readonly LOADING: string = 'loading';

  static normalize(value: string): string {
    if (value === AgentBridgeProviderUsageAvailabilityState.UNSUPPORTED ||
      value === AgentBridgeProviderUsageAvailabilityState.AVAILABLE ||
      value === AgentBridgeProviderUsageAvailabilityState.AVAILABLE_EMPTY ||
      value === AgentBridgeProviderUsageAvailabilityState.FAILED ||
      value === AgentBridgeProviderUsageAvailabilityState.STALE ||
      value === AgentBridgeProviderUsageAvailabilityState.LOADING) {
      return value;
    }
    return AgentBridgeProviderUsageAvailabilityState.UNSUPPORTED;
  }
}

export class AgentBridgeServerInfo {
  serverId: string;
  hostname: string;
  version: string;
  protocolVersion: string;
  legacyProtocolVersion: string;
  terminalStreamProtocolVersion: number;
  uptimeSec: number;
  activeConnections: number;
  keyFingerprint: string;
  features: AgentBridgeServerFeatureFlags;
  featuresJson: string;
  bridgeVersion: string;
  minimumAppVersion: string;
  recommendedAppVersion: string;
  supportedProtocolVersions: Array<string>;
  compatibilityJson: string;
  compatibility: AgentBridgeCompatibilityInfo;

  constructor(
    serverId: string,
    hostname: string,
    version: string,
    protocolVersion: string,
    legacyProtocolVersion: string,
    terminalStreamProtocolVersion: number,
    uptimeSec: number,
    activeConnections: number,
    keyFingerprint: string,
    features: AgentBridgeServerFeatureFlags,
    featuresJson: string = ''
  ) {
    this.serverId = serverId;
    this.hostname = hostname;
    this.version = version;
    this.protocolVersion = protocolVersion;
    this.legacyProtocolVersion = legacyProtocolVersion;
    this.terminalStreamProtocolVersion = terminalStreamProtocolVersion;
    this.uptimeSec = uptimeSec;
    this.activeConnections = activeConnections;
    this.keyFingerprint = keyFingerprint;
    this.features = features;
    this.featuresJson = featuresJson;
    this.bridgeVersion = version;
    this.minimumAppVersion = '';
    this.recommendedAppVersion = '';
    this.supportedProtocolVersions = [];
    this.compatibilityJson = '';
    this.compatibility = new AgentBridgeCompatibilityInfo();
  }
}

export class AgentBridgeAgentRuntimeInfo {
  runtimeMode: string;
  interactiveReady: boolean;
  sessionState: string;
  pid: number;
  startedAt: number;
  lastActivityAt: number;
  exitCode: number;
  lastError: string;
  recentOutputTail: string;
  runtimeFallbackReason: string;

  constructor() {
    this.runtimeMode = '';
    this.interactiveReady = false;
    this.sessionState = '';
    this.pid = 0;
    this.startedAt = 0;
    this.lastActivityAt = 0;
    this.exitCode = -1;
    this.lastError = '';
    this.recentOutputTail = '';
    this.runtimeFallbackReason = '';
  }
}

export class AgentBridgeAgentRecord {
  id: string;
  provider: string;
  cwd: string;
  workspaceId: string;
  rootPath: string;
  workspaceMode: string;
  worktreeId: string;
  runtimeOwnerId: string;
  ownershipStatus: string;
  executionPolicyJson: string;
  forkContextJson: string;
  lifecycleState: string;
  writeAccessRevokedAt: string;
  lastCleanupResultJson: string;
  providerSessionId: string;
  remoteSessionId: string;
  title: string;
  configJson: string;
  runtimeInfoJson: string;
  persistenceJson: string;
  featuresJson: string;
  lastStatus: string;
  lastModeId: string;
  modelId: string;
  thinkingOptionId: string;
  lastError: string;
  requiresAttention: boolean;
  attentionReason: string;
  attentionTimestamp: string;
  parentAgentId: string;
  rootAgentId: string;
  childAgentIdsJson: string;
  detached: boolean;
  forkedFromAgentId: string;
  forkedFromCheckpointId: string;
  relationshipUpdatedAt: string;
  relationshipStatus: string;
  relationshipWarningsJson: string;
  depth: number;
  isRoot: boolean;
  archivedAt: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastUserMessageAt: string;
  timelineAckJson: string;
  timelineSize: number;
  latestSeq: number;
  runtimeMode: string;
  interactiveReady: boolean;
  sessionState: string;
  runtimePid: number;
  runtimeStartedAt: number;
  runtimeLastActivityAt: number;
  runtimeExitCode: number;
  runtimeLastError: string;
  runtimeRecentOutputTail: string;
  runtimeFallbackReason: string;

  constructor() {
    this.id = '';
    this.provider = '';
    this.cwd = '';
    this.workspaceId = '';
    this.rootPath = '';
    this.workspaceMode = 'shared';
    this.worktreeId = '';
    this.runtimeOwnerId = '';
    this.ownershipStatus = '';
    this.executionPolicyJson = '';
    this.forkContextJson = '';
    this.lifecycleState = '';
    this.writeAccessRevokedAt = '';
    this.lastCleanupResultJson = '';
    this.providerSessionId = '';
    this.remoteSessionId = '';
    this.title = '';
    this.configJson = '';
    this.runtimeInfoJson = '';
    this.persistenceJson = '';
    this.featuresJson = '';
    this.lastStatus = '';
    this.lastModeId = '';
    this.modelId = '';
    this.thinkingOptionId = '';
    this.lastError = '';
    this.requiresAttention = false;
    this.attentionReason = '';
    this.attentionTimestamp = '';
    this.parentAgentId = '';
    this.rootAgentId = '';
    this.childAgentIdsJson = '';
    this.detached = false;
    this.forkedFromAgentId = '';
    this.forkedFromCheckpointId = '';
    this.relationshipUpdatedAt = '';
    this.relationshipStatus = '';
    this.relationshipWarningsJson = '';
    this.depth = 0;
    this.isRoot = false;
    this.archivedAt = '';
    this.createdAt = '';
    this.updatedAt = '';
    this.lastActivityAt = '';
    this.lastUserMessageAt = '';
    this.timelineAckJson = '';
    this.timelineSize = 0;
    this.latestSeq = 0;
    this.runtimeMode = '';
    this.interactiveReady = false;
    this.sessionState = '';
    this.runtimePid = 0;
    this.runtimeStartedAt = 0;
    this.runtimeLastActivityAt = 0;
    this.runtimeExitCode = -1;
    this.runtimeLastError = '';
    this.runtimeRecentOutputTail = '';
    this.runtimeFallbackReason = '';
  }
}

export class AgentBridgeAgentTimelineRecord {
  agentId: string;
  epoch: number;
  seq: number;
  kind: string;
  eventType: string;
  projectedJson: string;
  providerRawJson: string;
  createdAt: number;

  constructor() {
    this.agentId = '';
    this.epoch = 0;
    this.seq = 0;
    this.kind = '';
    this.eventType = '';
    this.projectedJson = '';
    this.providerRawJson = '';
    this.createdAt = 0;
  }
}

export class AgentBridgeCheckpointRecord {
  checkpointId: string;
  agentId: string;
  title: string;
  description: string;
  epoch: number;
  latestSeq: number;
  providerSessionId: string;
  remoteSessionId: string;
  workspaceId: string;
  cwd: string;
  fileSnapshotStatus: string;
  fileSnapshotId: string;
  filesScanned: number;
  filesCaptured: number;
  skippedCount: number;
  workspaceRoot: string;
  filePolicyJson: string;
  skippedReasons: Array<AgentBridgeCheckpointSkippedReason>;
  manifestVerified: boolean;
  runtimeCheckpointStatus: string;
  runtimeCheckpointKind: string;
  runtimeRestoreSupported: boolean;
  runtimeRestoreStatus: string;
  runtimeRestored: boolean;
  runtimeRestoreReason: string;
  terminalCheckpointStatus: string;
  terminalCheckpointKind: string;
  terminalRestoreSupported: boolean;
  createdAt: string;

  constructor() {
    this.checkpointId = '';
    this.agentId = '';
    this.title = '';
    this.description = '';
    this.epoch = 0;
    this.latestSeq = 0;
    this.providerSessionId = '';
    this.remoteSessionId = '';
    this.workspaceId = '';
    this.cwd = '';
    this.fileSnapshotStatus = '';
    this.fileSnapshotId = '';
    this.filesScanned = 0;
    this.filesCaptured = 0;
    this.skippedCount = 0;
    this.workspaceRoot = '';
    this.filePolicyJson = '';
    this.skippedReasons = [];
    this.manifestVerified = false;
    this.runtimeCheckpointStatus = '';
    this.runtimeCheckpointKind = '';
    this.runtimeRestoreSupported = false;
    this.runtimeRestoreStatus = '';
    this.runtimeRestored = false;
    this.runtimeRestoreReason = '';
    this.terminalCheckpointStatus = '';
    this.terminalCheckpointKind = '';
    this.terminalRestoreSupported = false;
    this.createdAt = '';
  }
}

export class AgentBridgeCheckpointSkippedReason {
  reason: string;
  count: number;

  constructor() {
    this.reason = '';
    this.count = 0;
  }
}

export class AgentBridgeCheckpointRestoreConflict {
  path: string;
  reason: string;

  constructor() {
    this.path = '';
    this.reason = '';
  }
}

export class AgentBridgeCheckpointVerifyError {
  path: string;
  reason: string;
  currentSha256: string;
  checkpointSha256: string;

  constructor() {
    this.path = '';
    this.reason = '';
    this.currentSha256 = '';
    this.checkpointSha256 = '';
  }
}

export class AgentBridgeCheckpointRestoreLayer {
  requested: boolean;
  status: string;
  restored: boolean;
  reason: string;

  constructor() {
    this.requested = false;
    this.status = '';
    this.restored = false;
    this.reason = '';
  }
}

export class AgentBridgeCheckpointRestoreResult {
  checkpoint: AgentBridgeCheckpointRecord;
  dryRun: boolean;
  restoreBlocked: boolean;
  preRestoreSnapshotId: string;
  restorePlanId: string;
  conflicts: Array<AgentBridgeCheckpointRestoreConflict>;
  manifestVerified: boolean;
  workspaceRoot: string;
  filePolicyJson: string;
  skippedReasons: Array<AgentBridgeCheckpointSkippedReason>;
  filesSkipped: number;
  filesRestored: number;
  filesVerified: number;
  verifyErrors: Array<AgentBridgeCheckpointVerifyError>;
  runtimeRestored: boolean;
  runtimeRestoreStatus: string;
  runtimeRestoreReason: string;
  restoredConversation: boolean;
  restoredFiles: boolean;
  restoredReason: string;
  filesLayer: AgentBridgeCheckpointRestoreLayer;
  timelineLayer: AgentBridgeCheckpointRestoreLayer;
  runtimeLayer: AgentBridgeCheckpointRestoreLayer;
  terminalLayer: AgentBridgeCheckpointRestoreLayer;

  constructor() {
    this.checkpoint = new AgentBridgeCheckpointRecord();
    this.dryRun = false;
    this.restoreBlocked = false;
    this.preRestoreSnapshotId = '';
    this.restorePlanId = '';
    this.conflicts = [];
    this.manifestVerified = false;
    this.workspaceRoot = '';
    this.filePolicyJson = '';
    this.skippedReasons = [];
    this.filesSkipped = 0;
    this.filesRestored = 0;
    this.filesVerified = 0;
    this.verifyErrors = [];
    this.runtimeRestored = false;
    this.runtimeRestoreStatus = '';
    this.runtimeRestoreReason = '';
    this.restoredConversation = false;
    this.restoredFiles = false;
    this.restoredReason = '';
    this.filesLayer = new AgentBridgeCheckpointRestoreLayer();
    this.timelineLayer = new AgentBridgeCheckpointRestoreLayer();
    this.runtimeLayer = new AgentBridgeCheckpointRestoreLayer();
    this.terminalLayer = new AgentBridgeCheckpointRestoreLayer();
  }
}

export class AgentBridgeProjectRecord {
  projectId: string;
  rootPath: string;
  kind: string;
  displayName: string;
  status: string;
  workspaceCount: number;
  activeWorkspaces: number;
  archivedWorkspaces: number;
  missingWorkspaces: number;
  staleWorkspaces: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string;

  constructor() {
    this.projectId = '';
    this.rootPath = '';
    this.kind = '';
    this.displayName = '';
    this.status = '';
    this.workspaceCount = 0;
    this.activeWorkspaces = 0;
    this.archivedWorkspaces = 0;
    this.missingWorkspaces = 0;
    this.staleWorkspaces = 0;
    this.createdAt = '';
    this.updatedAt = '';
    this.archivedAt = '';
  }
}

export class AgentBridgeWorkspaceRegistryValidation {
  ok: boolean;
  code: string;
  message: string;
  remediation: string;
  errorsJson: string;
  warningsJson: string;

  constructor() {
    this.ok = true;
    this.code = '';
    this.message = '';
    this.remediation = '';
    this.errorsJson = '';
    this.warningsJson = '';
  }
}

export class AgentBridgeWorkspaceRecord {
  workspaceId: string;
  projectId: string;
  cwd: string;
  workspacePath: string;
  kind: string;
  status: string;
  source: string;
  displayName: string;
  title: string;
  branch: string;
  missing: boolean;
  stale: boolean;
  sourceWorkspaceId: string;
  sourceRootPath: string;
  worktreePath: string;
  startPoint: string;
  lastOpenedAt: string;
  lastValidatedAt: string;
  lastOpenStatus: string;
  openError: string;
  validation: AgentBridgeWorkspaceRegistryValidation;
  createdAt: string;
  updatedAt: string;
  archivedAt: string;

  constructor() {
    this.workspaceId = '';
    this.projectId = '';
    this.cwd = '';
    this.workspacePath = '';
    this.kind = '';
    this.status = '';
    this.source = '';
    this.displayName = '';
    this.title = '';
    this.branch = '';
    this.missing = false;
    this.stale = false;
    this.sourceWorkspaceId = '';
    this.sourceRootPath = '';
    this.worktreePath = '';
    this.startPoint = '';
    this.lastOpenedAt = '';
    this.lastValidatedAt = '';
    this.lastOpenStatus = '';
    this.openError = '';
    this.validation = new AgentBridgeWorkspaceRegistryValidation();
    this.createdAt = '';
    this.updatedAt = '';
    this.archivedAt = '';
  }
}

export class AgentBridgeWorkspaceSuggestionRecord {
  path: string;
  displayName: string;
  source: string;
  exists: boolean;

  constructor() {
    this.path = '';
    this.displayName = '';
    this.source = '';
    this.exists = false;
  }
}

export class AgentBridgeWorkspaceRegistryDoctorCheck {
  id: string;
  status: string;
  message: string;
  remediation: string;

  constructor() {
    this.id = '';
    this.status = '';
    this.message = '';
    this.remediation = '';
  }
}

export class AgentBridgeWorkspaceRegistryResult {
  ok: boolean;
  action: string;
  preview: boolean;
  confirmed: boolean;
  validation: AgentBridgeWorkspaceRegistryValidation;
  projects: Array<AgentBridgeProjectRecord>;
  workspaces: Array<AgentBridgeWorkspaceRecord>;
  suggestions: Array<AgentBridgeWorkspaceSuggestionRecord>;
  checks: Array<AgentBridgeWorkspaceRegistryDoctorCheck>;
  workspace: AgentBridgeWorkspaceRecord;
  workspaceId: string;
  projectId: string;
  cwd: string;
  workspacePath: string;
  kind: string;
  status: string;
  duplicateOfWorkspaceId: string;
  restoredArchived: boolean;
  openStatus: string;
  openCommand: string;
  openError: string;
  message: string;
  remediation: string;
  updatedAt: number;

  constructor() {
    this.ok = false;
    this.action = '';
    this.kind = '';
    this.preview = false;
    this.confirmed = false;
    this.validation = new AgentBridgeWorkspaceRegistryValidation();
    this.projects = [];
    this.workspaces = [];
    this.suggestions = [];
    this.checks = [];
    this.workspace = new AgentBridgeWorkspaceRecord();
    this.workspaceId = '';
    this.projectId = '';
    this.cwd = '';
    this.workspacePath = '';
    this.kind = '';
    this.status = '';
    this.duplicateOfWorkspaceId = '';
    this.restoredArchived = false;
    this.openStatus = '';
    this.openCommand = '';
    this.openError = '';
    this.message = '';
    this.remediation = '';
    this.updatedAt = 0;
  }
}

export class AgentBridgeWorktreeValidation {
  ok: boolean;
  code: string;
  message: string;
  remediation: string;
  errorsJson: string;
  warningsJson: string;

  constructor() {
    this.ok = true;
    this.code = '';
    this.message = '';
    this.remediation = '';
    this.errorsJson = '';
    this.warningsJson = '';
  }
}

export class AgentBridgeWorktreeRecord {
  path: string;
  head: string;
  branch: string;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockedReason: string;
  prunable: boolean;
  prunableReason: string;
  gitRegistered: boolean;
  registryLinked: boolean;
  registryWorkspaceId: string;
  registryArchived: boolean;
  sourceWorkspaceId: string;
  sourceRootPath: string;
  startPoint: string;
  missing: boolean;
  stale: boolean;
  setupStatus: string;
  teardownStatus: string;
  setupMessage: string;
  teardownMessage: string;

  constructor() {
    this.path = '';
    this.head = '';
    this.branch = '';
    this.detached = false;
    this.bare = false;
    this.locked = false;
    this.lockedReason = '';
    this.prunable = false;
    this.prunableReason = '';
    this.gitRegistered = false;
    this.registryLinked = false;
    this.registryWorkspaceId = '';
    this.registryArchived = false;
    this.sourceWorkspaceId = '';
    this.sourceRootPath = '';
    this.startPoint = '';
    this.missing = false;
    this.stale = false;
    this.setupStatus = '';
    this.teardownStatus = '';
    this.setupMessage = '';
    this.teardownMessage = '';
  }
}

export class AgentBridgeWorktreeActionResult {
  ok: boolean;
  action: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  rootPath: string;
  worktreePath: string;
  branch: string;
  startPoint: string;
  preview: boolean;
  confirmed: boolean;
  created: boolean;
  archived: boolean;
  registryLinked: boolean;
  registryWorkspaceId: string;
  sourceWorkspaceId: string;
  sourceRootPath: string;
  setupStatus: string;
  teardownStatus: string;
  failureCategory: string;
  message: string;
  remediation: string;
  validation: AgentBridgeWorktreeValidation;

  constructor() {
    this.ok = false;
    this.action = '';
    this.command = '';
    this.cwd = '';
    this.exitCode = 0;
    this.stdout = '';
    this.stderr = '';
    this.durationMs = 0;
    this.rootPath = '';
    this.worktreePath = '';
    this.branch = '';
    this.startPoint = '';
    this.preview = false;
    this.confirmed = false;
    this.created = false;
    this.archived = false;
    this.registryLinked = false;
    this.registryWorkspaceId = '';
    this.sourceWorkspaceId = '';
    this.sourceRootPath = '';
    this.setupStatus = '';
    this.teardownStatus = '';
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.validation = new AgentBridgeWorktreeValidation();
  }
}

export class AgentBridgeTerminalState {
  terminalId: string;
  workspaceId: string;
  cwd: string;
  name: string;
  status: string;
  rows: number;
  cols: number;
  captureLength: number;
  captureBytes: number;
  capturePersisted: boolean;
  capturePath: string;
  captureStatus: string;
  captureWarning: string;
  capturePersistedBytes: number;
  capturePersistedAt: number;
  snapshotSeq: number;
  restoreSeq: number;
  snapshotMaxBytes: number;
  snapshotBytes: number;
  snapshotTruncated: boolean;
  snapshotSource: string;
  snapshotPersistedBytes: number;
  snapshotWarning: string;
  activity: string;
  requiresAttention: boolean;
  attentionReason: string;
  attentionAt: number;
  lastInputError: string;
  lastResizeError: string;
  mouseMode: string;
  lastMouseAt: number;
  lastMouseError: string;
  createdAt: number;
  updatedAt: number;
  hostname: string;

  constructor() {
    this.terminalId = '';
    this.workspaceId = '';
    this.cwd = '';
    this.name = '';
    this.status = '';
    this.rows = 0;
    this.cols = 0;
    this.captureLength = 0;
    this.captureBytes = 0;
    this.capturePersisted = false;
    this.capturePath = '';
    this.captureStatus = '';
    this.captureWarning = '';
    this.capturePersistedBytes = 0;
    this.capturePersistedAt = 0;
    this.snapshotSeq = 0;
    this.restoreSeq = 0;
    this.snapshotMaxBytes = 0;
    this.snapshotBytes = 0;
    this.snapshotTruncated = false;
    this.snapshotSource = '';
    this.snapshotPersistedBytes = 0;
    this.snapshotWarning = '';
    this.activity = '';
    this.requiresAttention = false;
    this.attentionReason = '';
    this.attentionAt = 0;
    this.lastInputError = '';
    this.lastResizeError = '';
    this.mouseMode = '';
    this.lastMouseAt = 0;
    this.lastMouseError = '';
    this.createdAt = 0;
    this.updatedAt = 0;
    this.hostname = '';
  }
}

export class AgentBridgeTerminalHookRecord {
  name: string;
  path: string;
  shell: string;
  installed: boolean;
  exists: boolean;
  source: string;
  sourceCommand: string;
  profilePath: string;
  profilePathsJson: string;
  profileInstalled: boolean;
  backupPath: string;
  needsRestart: boolean;
  confirmRequired: boolean;

  constructor() {
    this.name = '';
    this.path = '';
    this.shell = '';
    this.installed = false;
    this.exists = false;
    this.source = '';
    this.sourceCommand = '';
    this.profilePath = '';
    this.profilePathsJson = '';
    this.profileInstalled = false;
    this.backupPath = '';
    this.needsRestart = false;
    this.confirmRequired = false;
  }
}

export class AgentBridgeTerminalSession {
  terminal: AgentBridgeTerminalState;
  slot: number;
  transcript: string;
  subscribed: boolean;
  desiredSubscription: boolean;
  restoreState: string;
  lastAppliedRestoreSeq: number;
  lastAppliedSnapshotSeq: number;
  pendingOutput: string;
  renderer: AgentBridgeTerminalRenderer;
  renderedText: string;
  renderRuns: Array<AgentBridgeTerminalRenderRun>;

  constructor() {
    this.terminal = new AgentBridgeTerminalState();
    this.slot = 0;
    this.transcript = '';
    this.subscribed = false;
    this.desiredSubscription = false;
    this.restoreState = AgentBridgeTerminalRestoreState.IDLE;
    this.lastAppliedRestoreSeq = 0;
    this.lastAppliedSnapshotSeq = 0;
    this.pendingOutput = '';
    this.renderer = new AgentBridgeTerminalRenderer();
    this.renderedText = '';
    this.renderRuns = [];
  }
}

export class AgentBridgeTerminalRestoreState {
  static readonly IDLE: string = 'idle';
  static readonly AWAITING: string = 'awaiting';
  static readonly READY: string = 'ready';
}

export class AgentBridgeProviderProfileRecord {
  profileId: string;
  providerId: string;
  displayName: string;
  description: string;
  endpoint: string;
  binary: string;
  args: string;
  cwd: string;
  envJson: string;
  envMetadataJson: string;
  secretStorageState: string;
  secretStoragePlatform: string;
  runtimeMode: string;
  enabled: boolean;
  runtimeRegistered: boolean;
  runtimeProviderId: string;
  runtimeError: string;
  runtimeFailureCategory: string;
  runtimeRemediation: string;
  runtimeWarningsJson: string;
  baseProfileId: string;
  cloneFromProfileId: string;
  validationMessagesJson: string;
  createdAt: string;
  updatedAt: string;

  constructor() {
    this.profileId = '';
    this.providerId = '';
    this.displayName = '';
    this.description = '';
    this.endpoint = '';
    this.binary = '';
    this.args = '';
    this.cwd = '';
    this.envJson = '';
    this.envMetadataJson = '';
    this.secretStorageState = '';
    this.secretStoragePlatform = '';
    this.runtimeMode = 'oneshot';
    this.enabled = true;
    this.runtimeRegistered = false;
    this.runtimeProviderId = '';
    this.runtimeError = '';
    this.runtimeFailureCategory = '';
    this.runtimeRemediation = '';
    this.runtimeWarningsJson = '';
    this.baseProfileId = '';
    this.cloneFromProfileId = '';
    this.validationMessagesJson = '';
    this.createdAt = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeProviderProfileEnvObject {
}

export class AgentBridgeProviderAcpValidationEntry {
  profileId: string;
  providerId: string;
  displayName: string;
  sourcePath: string;
  reason: string;

  constructor() {
    this.profileId = '';
    this.providerId = '';
    this.displayName = '';
    this.sourcePath = '';
    this.reason = '';
  }
}

export class AgentBridgeProviderAcpValidationReport {
  ok: boolean;
  scannedJson: string;
  accepted: Array<AgentBridgeProviderAcpValidationEntry>;
  rejected: Array<AgentBridgeProviderAcpValidationEntry>;
  duplicates: Array<AgentBridgeProviderAcpValidationEntry>;
  warningsJson: string;
  errors: Array<string>;
  providerCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  warningCount: number;
  errorCount: number;

  constructor() {
    this.ok = false;
    this.scannedJson = '';
    this.accepted = [];
    this.rejected = [];
    this.duplicates = [];
    this.warningsJson = '';
    this.errors = [];
    this.providerCount = 0;
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.duplicateCount = 0;
    this.warningCount = 0;
    this.errorCount = 0;
  }
}

export class AgentBridgeProviderAcpResult {
  confirmed: boolean;
  confirmRequired: boolean;
  duplicatePolicy: string;
  imported: Array<AgentBridgeProviderProfileRecord>;
  preview: Array<AgentBridgeProviderProfileRecord>;
  skipped: Array<AgentBridgeProviderAcpValidationEntry>;
  duplicates: Array<AgentBridgeProviderAcpValidationEntry>;
  profiles: Array<AgentBridgeProviderProfileRecord>;
  scannedJson: string;
  validationReport: AgentBridgeProviderAcpValidationReport;
  catalogRefreshReason: string;
  affectedProfileIds: Array<string>;
  affectedRuntimeProviderIds: Array<string>;
  updatedAt: number;

  constructor() {
    this.confirmed = false;
    this.confirmRequired = false;
    this.duplicatePolicy = 'skip';
    this.imported = [];
    this.preview = [];
    this.skipped = [];
    this.duplicates = [];
    this.profiles = [];
    this.scannedJson = '';
    this.validationReport = new AgentBridgeProviderAcpValidationReport();
    this.catalogRefreshReason = '';
    this.affectedProfileIds = [];
    this.affectedRuntimeProviderIds = [];
    this.updatedAt = 0;
  }
}

export class AgentBridgeProviderDirectoryEntry {
  providerId: string = '';
  profileId: string = '';
  displayName: string = '';
  description: string = '';
  version: string = '';
  available: boolean = false;
  availabilityReason: string = '';
  packageFormat: string = '';
  packageSha256: string = '';
  activeVersion: string = '';
  previousVersion: string = '';
  installStatus: string = '';
  healthStatus: string = '';
  failureCategory: string = '';
  remediation: string = '';
}

export class AgentBridgeProviderDirectoryResult {
  ok: boolean = false;
  preview: boolean = false;
  confirmed: boolean = false;
  providerId: string = '';
  profileId: string = '';
  version: string = '';
  planId: string = '';
  manifestDigest: string = '';
  packageSha256: string = '';
  installStatus: string = '';
  activeVersion: string = '';
  previousVersion: string = '';
  targetVersion: string = '';
  expiresAt: string = '';
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  sourceUrl: string = '';
  warnings: Array<string> = [];
  providers: Array<AgentBridgeProviderDirectoryEntry> = [];
  updatedAt: number = 0;
}

export class AgentBridgeWorkspaceServiceHealth {
  ok: boolean = false;
  statusCode: number = 0;
  message: string = '';
  checkedAt: string = '';
}

export class AgentBridgeWorkspaceServiceAuth {
  mode: string = 'bridge';
  environmentVariable: string = '';
}

export class AgentBridgeWorkspaceServiceRecord {
  serviceId: string = '';
  name: string = '';
  workspaceId: string = '';
  ownerAgentId: string = '';
  command: string = '';
  argumentCount: number = 0;
  cwd: string = '';
  port: number = 0;
  protocol: string = 'http';
  health: AgentBridgeWorkspaceServiceHealth = new AgentBridgeWorkspaceServiceHealth();
  visibility: string = 'workspace';
  auth: AgentBridgeWorkspaceServiceAuth = new AgentBridgeWorkspaceServiceAuth();
  lifecycle: string = 'workspace';
  status: string = 'stopped';
  pid: number = 0;
  ledgerId: string = '';
  recovered: boolean = false;
  exitCode: number = 0;
  lastError: string = '';
  lastHealth: AgentBridgeWorkspaceServiceHealth = new AgentBridgeWorkspaceServiceHealth();
  createdAt: string = '';
  updatedAt: string = '';
  startedAt: string = '';
  stoppedAt: string = '';
  proxyPath: string = '';
}

export class AgentBridgeWorkspaceServiceResult {
  ok: boolean = false;
  preview: boolean = false;
  confirmed: boolean = false;
  planId: string = '';
  serviceId: string = '';
  totalCount: number = 0;
  removed: boolean = false;
  truncated: boolean = false;
  text: string = '';
  accessUrl: string = '';
  ticket: string = '';
  expiresAt: string = '';
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  warnings: Array<string> = [];
  services: Array<AgentBridgeWorkspaceServiceRecord> = [];
  service: AgentBridgeWorkspaceServiceRecord = new AgentBridgeWorkspaceServiceRecord();
  health: AgentBridgeWorkspaceServiceHealth = new AgentBridgeWorkspaceServiceHealth();
  updatedAt: string = '';
}

export class AgentBridgeBrowserHostRecord {
  hostId: string = '';
  label: string = '';
  platform: string = '';
  hostKind: string = '';
  runtime: string = '';
  capabilitySource: string = '';
  readiness: string = '';
  supportedPlatforms: Array<string> = [];
  capabilityWarnings: Array<string> = [];
  supportedCommands: Array<string> = [];
  supportedActions: Array<string> = [];
  actionCapabilitiesExplicit: boolean = false;
  workspaceIds: Array<string> = [];
  connected: boolean = false;
  registeredAt: string = '';
  lastSeenAt: string = '';
}

export class AgentBridgeBrowserInstanceRecord {
  instanceId: string = '';
  hostId: string = '';
  name: string = '';
  engine: string = '';
  connected: boolean = false;
}

export class AgentBridgeBrowserPageRecord {
  pageId: string = '';
  hostId: string = '';
  instanceId: string = '';
  title: string = '';
  url: string = '';
  type: string = 'page';
}

export class AgentBridgeBrowserLogRecord {
  method: string = '';
  type: string = '';
  text: string = '';
  requestId: string = '';
  errorText: string = '';
  encodedDataLength: number = -1;
  occurredAt: string = '';
}

export class AgentBridgeBrowserDownloadRecord {
  pageId: string = '';
  guid: string = '';
  state: string = '';
  suggestedFilename: string = '';
  totalBytes: number = -1;
  receivedBytes: number = -1;
  updatedAt: string = '';
}

export class AgentBridgeBrowserScreenshot {
  mimeType: string = '';
  dataBase64: string = '';
  bytes: number = 0;
  fullPage: boolean = false;
}

export class AgentBridgeBrowserPermissionState {
  workspaceId: string = '';
  domains: Array<string> = [];
  downloadDirectoryConfigured: boolean = false;
  updatedAt: string = '';
}

export class AgentBridgeBrowserActionTarget {
  workspaceId: string = '';
  agentId: string = '';
  hostId: string = '';
  instanceId: string = '';
  pageId: string = '';
  action: string = '';
}

export class AgentBridgeBrowserResult {
  requestId: string = '';
  eventKind: string = '';
  ok: boolean = false;
  preview: boolean = false;
  confirmed: boolean = false;
  accepted: boolean = false;
  applied: boolean = false;
  matched: boolean = false;
  reused: boolean = false;
  closed: boolean = false;
  planId: string = '';
  hostId: string = '';
  commandId: string = '';
  workspaceId: string = '';
  action: string = '';
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  updatedAt: string = '';
  expiresAt: string = '';
  domains: Array<string> = [];
  downloadDirectoryConfigured: boolean = false;
  permission: AgentBridgeBrowserPermissionState = new AgentBridgeBrowserPermissionState();
  target: AgentBridgeBrowserActionTarget = new AgentBridgeBrowserActionTarget();
  warnings: Array<string> = [];
  hosts: Array<AgentBridgeBrowserHostRecord> = [];
  host: AgentBridgeBrowserHostRecord = new AgentBridgeBrowserHostRecord();
  instances: Array<AgentBridgeBrowserInstanceRecord> = [];
  instance: AgentBridgeBrowserInstanceRecord = new AgentBridgeBrowserInstanceRecord();
  pages: Array<AgentBridgeBrowserPageRecord> = [];
  page: AgentBridgeBrowserPageRecord = new AgentBridgeBrowserPageRecord();
  closedPageIds: Array<string> = [];
  snapshotText: string = '';
  screenshot: AgentBridgeBrowserScreenshot = new AgentBridgeBrowserScreenshot();
  logs: Array<AgentBridgeBrowserLogRecord> = [];
  downloads: Array<AgentBridgeBrowserDownloadRecord> = [];
  tracking: string = '';
  logsJson: string = '';
  downloadsJson: string = '';
}

export class AgentBridgeProviderProfileTestResult {
  ok: boolean;
  profileId: string;
  profile: AgentBridgeProviderProfileRecord;
  runtimeRegistered: boolean;
  runtimeProviderId: string;
  runtimeError: string;
  runtimeFailureCategory: string;
  testStatus: string;
  validationMessagesJson: string;
  endpointChecked: boolean;
  endpointReachable: boolean;
  endpointStatusCode: number;
  endpointError: string;
  binaryResolved: boolean;
  binaryPath: string;
  commandRan: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  updatedAt: number;

  constructor() {
    this.ok = false;
    this.profileId = '';
    this.profile = new AgentBridgeProviderProfileRecord();
    this.runtimeRegistered = false;
    this.runtimeProviderId = '';
    this.runtimeError = '';
    this.runtimeFailureCategory = '';
    this.testStatus = '';
    this.validationMessagesJson = '';
    this.endpointChecked = false;
    this.endpointReachable = false;
    this.endpointStatusCode = 0;
    this.endpointError = '';
    this.binaryResolved = false;
    this.binaryPath = '';
    this.commandRan = false;
    this.exitCode = 0;
    this.stdout = '';
    this.stderr = '';
    this.durationMs = 0;
    this.timedOut = false;
    this.updatedAt = 0;
  }
}

export class AgentBridgeGitActionResult {
  ok: boolean;
  action: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  branchName: string;
  remoteName: string;
  changedFiles: number;
  changesCount: number;
  conflictSummary: AgentBridgeGitConflictSummary;
  failureCategory: string;
  message: string;
  remediation: string;
  diffSummaryJson: string;
  preview: boolean;
  confirmed: boolean;
  planId: string;
  expiresAt: string;
  affectedPaths: Array<string>;
  untrackedPaths: Array<string>;
  targetRef: string;
  ahead: number;
  behind: number;
  conflictPossible: boolean;
  forceRisk: boolean;
  overwriteRisk: boolean;
  normalizedArgs: Array<string>;
  risks: Array<AgentBridgeGitRiskRecord>;
  snapshot: AgentBridgeGitRepositorySnapshot;
  updatedAt: number;

  constructor() {
    this.ok = false;
    this.action = '';
    this.command = '';
    this.cwd = '';
    this.exitCode = 0;
    this.stdout = '';
    this.stderr = '';
    this.durationMs = 0;
    this.branchName = '';
    this.remoteName = '';
    this.changedFiles = 0;
    this.changesCount = 0;
    this.conflictSummary = new AgentBridgeGitConflictSummary();
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.diffSummaryJson = '';
    this.preview = false;
    this.confirmed = false;
    this.planId = '';
    this.expiresAt = '';
    this.affectedPaths = [];
    this.untrackedPaths = [];
    this.targetRef = '';
    this.ahead = 0;
    this.behind = 0;
    this.conflictPossible = false;
    this.forceRisk = false;
    this.overwriteRisk = false;
    this.normalizedArgs = [];
    this.risks = [];
    this.snapshot = new AgentBridgeGitRepositorySnapshot();
    this.updatedAt = 0;
  }
}

export class AgentBridgeGitRiskRecord {
  code: string;
  severity: string;
  message: string;
  remediation: string;

  constructor() {
    this.code = '';
    this.severity = '';
    this.message = '';
    this.remediation = '';
  }
}

export class AgentBridgeGitRepositorySnapshot {
  workspaceId: string;
  head: string;
  branch: string;
  upstream: string;
  upstreamHead: string;
  indexFingerprint: string;
  worktreeFingerprint: string;
  ahead: number;
  behind: number;
  dirty: boolean;

  constructor() {
    this.workspaceId = '';
    this.head = '';
    this.branch = '';
    this.upstream = '';
    this.upstreamHead = '';
    this.indexFingerprint = '';
    this.worktreeFingerprint = '';
    this.ahead = 0;
    this.behind = 0;
    this.dirty = false;
  }
}

export class AgentBridgeGitConflictSummary {
  hasConflicts: boolean;
  count: number;
  files: Array<string>;
  message: string;
  remediation: string;

  constructor() {
    this.hasConflicts = false;
    this.count = 0;
    this.files = [];
    this.message = '';
    this.remediation = '';
  }
}

export class AgentBridgeGitDiffSubscriptionStatus {
  subscriptionId: string;
  subscribed: boolean;
  status: string;
  paused: boolean;
  intervalMs: number;
  lastSuccessAt: number;
  lastFailureAt: number;
  lastError: string;
  backoffMs: number;
  lastFingerprint: string;
  changesCount: number;
  changedFiles: number;
  branchName: string;
  diffSummaryJson: string;

  constructor() {
    this.subscriptionId = '';
    this.subscribed = false;
    this.status = '';
    this.paused = false;
    this.intervalMs = 0;
    this.lastSuccessAt = 0;
    this.lastFailureAt = 0;
    this.lastError = '';
    this.backoffMs = 0;
    this.lastFingerprint = '';
    this.changesCount = 0;
    this.changedFiles = 0;
    this.branchName = '';
    this.diffSummaryJson = '';
  }
}

export class AgentBridgeGitHubChecksSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  cancelled: number;
  conclusion: string;
  failures: Array<string>;

  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.pending = 0;
    this.cancelled = 0;
    this.conclusion = '';
    this.failures = [];
  }
}

export class AgentBridgeGitHubIssueRecord {
  number: number;
  title: string;
  state: string;
  url: string;
  updatedAt: string;

  constructor() {
    this.number = 0;
    this.title = '';
    this.state = '';
    this.url = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeGitHubAttachmentRecord {
  url: string;
  source: string;

  constructor() {
    this.url = '';
    this.source = '';
  }
}

export class AgentBridgeGitHubPullRequestRecord {
  number: number;
  title: string;
  state: string;
  url: string;
  head: string;
  base: string;
  sha: string;
  draft: boolean;
  mergeable: boolean;
  reviewDecision: string;
  updatedAt: string;
  reviewers: Array<string>;
  labels: Array<string>;

  constructor() {
    this.number = 0;
    this.title = '';
    this.state = '';
    this.url = '';
    this.head = '';
    this.base = '';
    this.sha = '';
    this.draft = false;
    this.mergeable = false;
    this.reviewDecision = '';
    this.updatedAt = '';
    this.reviewers = [];
    this.labels = [];
  }
}

export class AgentBridgeGitHubResult {
  ok: boolean;
  action: string;
  repository: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
  number: number;
  url: string;
  state: string;
  title: string;
  head: string;
  base: string;
  sha: string;
  checksSummary: AgentBridgeGitHubChecksSummary;
  issues: Array<AgentBridgeGitHubIssueRecord>;
  attachments: Array<AgentBridgeGitHubAttachmentRecord>;
  failureCategory: string;
  message: string;
  remediation: string;
  rateLimitResetAt: string;
  dryRun: boolean;
  mergeable: boolean;
  draft: boolean;
  preview: boolean;
  confirmed: boolean;
  planId: string;
  authenticated: boolean;
  accountId: string;
  accountLogin: string;
  userCode: string;
  verificationUri: string;
  authSessionId: string;
  interval: number;
  page: number;
  perPage: number;
  hasNext: boolean;
  assetUrl: string;
  watching: boolean;
  watchId: string;
  pullRequests: Array<AgentBridgeGitHubPullRequestRecord>;
  reviewers: Array<string>;
  labels: Array<string>;
  reviewDecision: string;
  mergeState: string;
  conflict: boolean;
  nextPollAt: string;
  backoffMs: number;

  constructor() {
    this.ok = false;
    this.action = '';
    this.repository = '';
    this.owner = '';
    this.repo = '';
    this.apiBaseUrl = '';
    this.number = 0;
    this.url = '';
    this.state = '';
    this.title = '';
    this.head = '';
    this.base = '';
    this.sha = '';
    this.checksSummary = new AgentBridgeGitHubChecksSummary();
    this.issues = [];
    this.attachments = [];
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.rateLimitResetAt = '';
    this.dryRun = false;
    this.mergeable = false;
    this.draft = false;
    this.preview = false;
    this.confirmed = false;
    this.planId = '';
    this.authenticated = false;
    this.accountId = '';
    this.accountLogin = '';
    this.userCode = '';
    this.verificationUri = '';
    this.authSessionId = '';
    this.interval = 0;
    this.page = 1;
    this.perPage = 30;
    this.hasNext = false;
    this.assetUrl = '';
    this.watching = false;
    this.watchId = '';
    this.pullRequests = [];
    this.reviewers = [];
    this.labels = [];
    this.reviewDecision = '';
    this.mergeState = '';
    this.conflict = false;
    this.nextPollAt = '';
    this.backoffMs = 0;
  }
}

export class AgentBridgeNotificationActionRecord {
  id: string;
  label: string;
  kind: string;
  destructive: boolean;

  constructor() {
    this.id = '';
    this.label = '';
    this.kind = '';
    this.destructive = false;
  }
}

export class AgentBridgeNotificationRouteRecord {
  kind: string;
  sessionId: string;
  agentId: string;
  terminalId: string;
  workspaceId: string;
  messageId: string;
  requestId: string;
  url: string;

  constructor() {
    this.kind = '';
    this.sessionId = '';
    this.agentId = '';
    this.terminalId = '';
    this.workspaceId = '';
    this.messageId = '';
    this.requestId = '';
    this.url = '';
  }
}

export class AgentBridgeNotificationRecord {
  notificationId: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  sourceEvent: string;
  sessionId: string;
  agentId: string;
  terminalId: string;
  workspaceId: string;
  route: AgentBridgeNotificationRouteRecord;
  actions: Array<AgentBridgeNotificationActionRecord>;
  read: boolean;
  clicked: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ttlMs: number;

  constructor() {
    this.notificationId = '';
    this.kind = '';
    this.severity = '';
    this.title = '';
    this.body = '';
    this.sourceEvent = '';
    this.sessionId = '';
    this.agentId = '';
    this.terminalId = '';
    this.workspaceId = '';
    this.route = new AgentBridgeNotificationRouteRecord();
    this.actions = [];
    this.read = false;
    this.clicked = false;
    this.createdAt = '';
    this.updatedAt = '';
    this.expiresAt = '';
    this.ttlMs = 0;
  }
}

export class AgentBridgeNotificationResult {
  ok: boolean;
  action: string;
  notificationId: string;
  actionId: string;
  notification: AgentBridgeNotificationRecord | null;
  notifications: Array<AgentBridgeNotificationRecord>;
  route: AgentBridgeNotificationRouteRecord;
  totalCount: number;
  unreadCount: number;
  prunedCount: number;
  removedCount: number;
  remainingCount: number;
  failureCategory: string;
  message: string;

  constructor() {
    this.ok = false;
    this.action = '';
    this.notificationId = '';
    this.actionId = '';
    this.notification = null;
    this.notifications = [];
    this.route = new AgentBridgeNotificationRouteRecord();
    this.totalCount = 0;
    this.unreadCount = 0;
    this.prunedCount = 0;
    this.removedCount = 0;
    this.remainingCount = 0;
    this.failureCategory = '';
    this.message = '';
  }
}

export class AgentBridgePushSubscriptionRecord {
  subscriptionId: string;
  tokenFingerprint: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string;
  lastSuccessAt: string;
  lastFailureCategory: string;
  lastError: string;
  deliveryCount: number;

  constructor() {
    this.subscriptionId = '';
    this.tokenFingerprint = '';
    this.deviceId = '';
    this.platform = '';
    this.appVersion = '';
    this.enabled = false;
    this.createdAt = '';
    this.updatedAt = '';
    this.lastAttemptAt = '';
    this.lastSuccessAt = '';
    this.lastFailureCategory = '';
    this.lastError = '';
    this.deliveryCount = 0;
  }
}

export class AgentBridgePushDeliveryRecord {
  ok: boolean;
  attempted: boolean;
  deliveredCount: number;
  failureCategory: string;
  message: string;
  remediation: string;
  requestId: string;
  responseCode: string;
  statusCode: number;

  constructor() {
    this.ok = false;
    this.attempted = false;
    this.deliveredCount = 0;
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.requestId = '';
    this.responseCode = '';
    this.statusCode = 0;
  }
}

export class AgentBridgePushStatusResult {
  ok: boolean;
  action: string;
  available: boolean;
  configured: boolean;
  deliveryReady: boolean;
  authMode: string;
  projectId: string;
  apiBaseUrl: string;
  category: string;
  testMessage: boolean;
  subscriptions: Array<AgentBridgePushSubscriptionRecord>;
  subscription: AgentBridgePushSubscriptionRecord | null;
  totalCount: number;
  activeCount: number;
  notificationId: string;
  delivery: AgentBridgePushDeliveryRecord | null;
  failureCategory: string;
  message: string;
  remediation: string;

  constructor() {
    this.ok = false;
    this.action = '';
    this.available = false;
    this.configured = false;
    this.deliveryReady = false;
    this.authMode = '';
    this.projectId = '';
    this.apiBaseUrl = '';
    this.category = '';
    this.testMessage = false;
    this.subscriptions = [];
    this.subscription = null;
    this.totalCount = 0;
    this.activeCount = 0;
    this.notificationId = '';
    this.delivery = null;
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
  }
}

export class AgentBridgeDaemonStatus {
  action: string;
  status: string;
  health: string;
  pid: number;
  supervisorPid: number;
  workerPid: number;
  supervised: boolean;
  workerGeneration: number;
  workerReady: boolean;
  startedAt: string;
  workerStartedAt: string;
  workerReadyAt: string;
  lastHeartbeatAt: string;
  lastWorkerHeartbeatAt: string;
  exitCode: number;
  lastError: string;
  restartCount: number;
  consecutiveCrashes: number;
  crashWindowCount: number;
  crashLoop: boolean;
  nextRestartAt: string;
  lastRestartReason: string;
  warningsJson: string;
  failureCategory: string;
  remediation: string;
  message: string;
  serverId: string;
  uptimeSec: number;
  activeConnections: number;
  activeWebSocketConnections: number;
  managedProcessesJson: string;
  featuresJson: string;
  autostartJson: string;
  autostartPreviewJson: string;
  autostartEnabled: boolean;
  autostartConfigured: boolean;
  autostartSupported: boolean;
  autostartMethod: string;
  autostartPlatform: string;
  autostartRegistrationId: string;
  autostartTargetPath: string;
  autostartRunnerPath: string;
  autostartWarning: string;
  configPath: string;
  logPath: string;
  doctor: AgentBridgeDaemonDoctorReport;
  instanceId: string;
  hostProfileId: string;
  instanceHealth: string;
  generation: number;
  bridgeVersion: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  remoteConfigJson: string;

  constructor() {
    this.action = '';
    this.status = '';
    this.health = '';
    this.pid = 0;
    this.supervisorPid = 0;
    this.workerPid = 0;
    this.supervised = false;
    this.workerGeneration = 0;
    this.workerReady = false;
    this.startedAt = '';
    this.workerStartedAt = '';
    this.workerReadyAt = '';
    this.lastHeartbeatAt = '';
    this.lastWorkerHeartbeatAt = '';
    this.exitCode = 0;
    this.lastError = '';
    this.restartCount = 0;
    this.consecutiveCrashes = 0;
    this.crashWindowCount = 0;
    this.crashLoop = false;
    this.nextRestartAt = '';
    this.lastRestartReason = '';
    this.warningsJson = '';
    this.failureCategory = '';
    this.remediation = '';
    this.message = '';
    this.serverId = '';
    this.uptimeSec = 0;
    this.activeConnections = 0;
    this.activeWebSocketConnections = 0;
    this.managedProcessesJson = '';
    this.featuresJson = '';
    this.autostartJson = '';
    this.autostartPreviewJson = '';
    this.autostartEnabled = false;
    this.autostartConfigured = false;
    this.autostartSupported = false;
    this.autostartMethod = '';
    this.autostartPlatform = '';
    this.autostartRegistrationId = '';
    this.autostartTargetPath = '';
    this.autostartRunnerPath = '';
    this.autostartWarning = '';
    this.configPath = '';
    this.logPath = '';
    this.doctor = new AgentBridgeDaemonDoctorReport();
    this.instanceId = '';
    this.hostProfileId = '';
    this.instanceHealth = '';
    this.generation = 0;
    this.bridgeVersion = '';
    this.nodeVersion = '';
    this.platform = '';
    this.architecture = '';
    this.remoteConfigJson = '';
  }
}

export class AgentBridgeDaemonConfigResult {
  ok: boolean;
  action: string;
  preview: boolean;
  confirmed: boolean;
  planId: string;
  configVersion: string;
  activeVersion: string;
  previousVersion: string;
  fetchedVersion: string;
  manifestDigest: string;
  requiresRestart: boolean;
  degraded: boolean;
  validationOk: boolean;
  validationFailureCategory: string;
  overriddenFieldsJson: string;
  scopeKind: string;
  priority: number;
  failureCategory: string;
  message: string;
  remediation: string;
  sourceUrl: string;
  instanceId: string;
  generation: number;
  warningsJson: string;
  updatedAt: string;

  constructor() {
    this.ok = false;
    this.action = '';
    this.preview = false;
    this.confirmed = false;
    this.planId = '';
    this.configVersion = '';
    this.activeVersion = '';
    this.previousVersion = '';
    this.fetchedVersion = '';
    this.manifestDigest = '';
    this.requiresRestart = false;
    this.degraded = false;
    this.validationOk = false;
    this.validationFailureCategory = '';
    this.overriddenFieldsJson = '';
    this.scopeKind = '';
    this.priority = 0;
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.sourceUrl = '';
    this.instanceId = '';
    this.generation = 0;
    this.warningsJson = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeDaemonConfigPayload {
  url: string;
  planId: string;
  confirm: boolean;
  hostProfileId: string;

  constructor(url: string = '', planId: string = '', confirm: boolean = false, hostProfileId: string = '') {
    this.url = url;
    this.planId = planId;
    this.confirm = confirm;
    this.hostProfileId = hostProfileId;
  }
}

export class AgentBridgeDaemonTargetPayload {
  expectedInstanceId: string;
  expectedGeneration: number;
  hostProfileId: string;

  constructor(expectedInstanceId: string = '', expectedGeneration: number = 0, hostProfileId: string = '') {
    this.expectedInstanceId = expectedInstanceId;
    this.expectedGeneration = expectedGeneration;
    this.hostProfileId = hostProfileId;
  }
}

export class AgentBridgeDaemonDoctorCheck {
  id: string;
  status: string;
  message: string;
  remediation: string;

  constructor() {
    this.id = '';
    this.status = '';
    this.message = '';
    this.remediation = '';
  }
}

export class AgentBridgeDiagnosticsCheck {
  id: string = '';
  status: string = '';
  message: string = '';
  remediation: string = '';
  actionId: string = '';
}

export class AgentBridgeDiagnosticsGroup {
  id: string = '';
  title: string = '';
  status: string = '';
  checks: Array<AgentBridgeDiagnosticsCheck> = [];
}

export class AgentBridgeDiagnosticsReport {
  schemaVersion: number = 1;
  format: string = 'json';
  generatedAt: string = '';
  truncated: boolean = false;
  groups: Array<AgentBridgeDiagnosticsGroup> = [];
  text: string = '';
}

export class AgentBridgeDaemonDoctorReport {
  ok: boolean;
  errors: number;
  warnings: number;
  generatedAt: string;
  checks: Array<AgentBridgeDaemonDoctorCheck>;

  constructor() {
    this.ok = false;
    this.errors = 0;
    this.warnings = 0;
    this.generatedAt = '';
    this.checks = [];
  }
}

export class AgentBridgeDaemonLogTail {
  path: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
  warningsJson: string;
  updatedAt: number;

  constructor() {
    this.path = '';
    this.text = '';
    this.sizeBytes = 0;
    this.truncated = false;
    this.warningsJson = '';
    this.updatedAt = 0;
  }
}

export class AgentBridgeDaemonUpdateResult {
  ok: boolean;
  action: string;
  updaterAvailable: boolean;
  available: boolean;
  busy: boolean;
  activeOperation: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  installedVersion: string;
  restoredVersion: string;
  previousVersion: string;
  channel: string;
  status: string;
  installationKind: string;
  registryUrl: string;
  integrity: string;
  integrityAlgorithm: string;
  integrityVerified: boolean;
  sameVersion: boolean;
  downgrade: boolean;
  preview: boolean;
  confirmRequired: boolean;
  pendingRestart: boolean;
  restartRequired: boolean;
  rollbackAvailable: boolean;
  rollbackVerified: boolean;
  replacementScheduled: boolean;
  replacementMode: string;
  replacementPid: number;
  replacementError: string;
  statePath: string;
  stagedPath: string;
  backupPath: string;
  failureCategory: string;
  message: string;
  remediation: string;
  checkedAt: string;
  updatedAt: string;

  constructor() {
    this.ok = false;
    this.action = '';
    this.updaterAvailable = false;
    this.available = false;
    this.busy = false;
    this.activeOperation = '';
    this.packageName = '';
    this.currentVersion = '';
    this.targetVersion = '';
    this.installedVersion = '';
    this.restoredVersion = '';
    this.previousVersion = '';
    this.channel = '';
    this.status = '';
    this.installationKind = '';
    this.registryUrl = '';
    this.integrity = '';
    this.integrityAlgorithm = '';
    this.integrityVerified = false;
    this.sameVersion = false;
    this.downgrade = false;
    this.preview = false;
    this.confirmRequired = false;
    this.pendingRestart = false;
    this.restartRequired = false;
    this.rollbackAvailable = false;
    this.rollbackVerified = false;
    this.replacementScheduled = false;
    this.replacementMode = '';
    this.replacementPid = 0;
    this.replacementError = '';
    this.statePath = '';
    this.stagedPath = '';
    this.backupPath = '';
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.checkedAt = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeSecurityDeviceRecord {
  physicalDeviceId: string;
  bridgeInstanceId: string;
  displayName: string;
  platform: string;
  publicKeyFingerprint: string;
  trusted: boolean;
  trustedAt: string;
  revokedAt: string;
  updatedAt: string;

  constructor() {
    this.physicalDeviceId = '';
    this.bridgeInstanceId = '';
    this.displayName = '';
    this.platform = '';
    this.publicKeyFingerprint = '';
    this.trusted = false;
    this.trustedAt = '';
    this.revokedAt = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeRelayConnectionState {
  static readonly DISABLED: string = 'disabled';
  static readonly DISCONNECTED: string = 'disconnected';
  static readonly PAIRING: string = 'pairing';
  static readonly CONNECTING: string = 'connecting';
  static readonly CONNECTED: string = 'connected';
  static readonly DEGRADED: string = 'degraded';
  static readonly REVOKED: string = 'revoked';

  static normalize(value: string): string {
    if (value === AgentBridgeRelayConnectionState.DISABLED ||
      value === AgentBridgeRelayConnectionState.DISCONNECTED ||
      value === AgentBridgeRelayConnectionState.PAIRING ||
      value === AgentBridgeRelayConnectionState.CONNECTING ||
      value === AgentBridgeRelayConnectionState.CONNECTED ||
      value === AgentBridgeRelayConnectionState.DEGRADED ||
      value === AgentBridgeRelayConnectionState.REVOKED) {
      return value;
    }
    if (value.length === 0) {
      return AgentBridgeRelayConnectionState.DISCONNECTED;
    }
    return AgentBridgeRelayConnectionState.DEGRADED;
  }
}

export class AgentBridgeRelayDirection {
  static readonly APP_TO_BRIDGE: string = 'app_to_bridge';
  static readonly BRIDGE_TO_APP: string = 'bridge_to_app';

  static normalize(value: string): string {
    if (value === AgentBridgeRelayDirection.APP_TO_BRIDGE ||
      value === AgentBridgeRelayDirection.BRIDGE_TO_APP) {
      return value;
    }
    return '';
  }
}

export class AgentBridgeRelayFailureDetails {
  failureCategory: string;
  message: string;
  remediation: string;
  warnings: Array<string>;

  constructor() {
    this.failureCategory = '';
    this.message = '';
    this.remediation = '';
    this.warnings = [];
  }
}

export class AgentBridgeRelayDeviceRecord {
  deviceId: string;
  displayName: string;
  platform: string;
  publicKeyFingerprint: string;
  status: string;
  trusted: boolean;
  revoked: boolean;
  keyEpoch: number;
  trustedAt: string;
  pairedAt: string;
  lastSeenAt: string;
  revokedAt: string;
  updatedAt: string;

  constructor() {
    this.deviceId = '';
    this.displayName = '';
    this.platform = '';
    this.publicKeyFingerprint = '';
    this.status = '';
    this.trusted = false;
    this.revoked = false;
    this.keyEpoch = 0;
    this.trustedAt = '';
    this.pairedAt = '';
    this.lastSeenAt = '';
    this.revokedAt = '';
    this.updatedAt = '';
  }
}

export class AgentBridgeRelayStatus {
  ok: boolean;
  action: string;
  configured: boolean;
  available: boolean;
  desiredConnected: boolean;
  state: string;
  transport: string;
  relayUrl: string;
  relayId: string;
  connectionId: string;
  sessionId: string;
  deviceId: string;
  connected: boolean;
  encrypted: boolean;
  forwardSecrecy: boolean;
  keyEpoch: number;
  sendSeq: number;
  receiveSeq: number;
  reconnectAttempt: number;
  activeSessions: number;
  pairedDevices: number;
  revokedDevices: number;
  pairedDeviceCount: number;
  pairingActive: boolean;
  pairingOfferId: string;
  pairingExpiresAt: string;
  offlineQueueDepth: number;
  protocolVersion: string;
  keyAgreement: string;
  kdf: string;
  cipher: string;
  replayProtection: string;
  maxFrameBytes: number;
  connectedAt: string;
  lastHeartbeatAt: string;
  lastFrameAt: string;
  updatedAt: string;
  failure: AgentBridgeRelayFailureDetails;

  constructor() {
    this.ok = false;
    this.action = '';
    this.configured = false;
    this.available = false;
    this.desiredConnected = false;
    this.state = AgentBridgeRelayConnectionState.DISCONNECTED;
    this.transport = '';
    this.relayUrl = '';
    this.relayId = '';
    this.connectionId = '';
    this.sessionId = '';
    this.deviceId = '';
    this.connected = false;
    this.encrypted = false;
    this.forwardSecrecy = false;
    this.keyEpoch = 0;
    this.sendSeq = 0;
    this.receiveSeq = 0;
    this.reconnectAttempt = 0;
    this.activeSessions = 0;
    this.pairedDevices = 0;
    this.revokedDevices = 0;
    this.pairedDeviceCount = 0;
    this.pairingActive = false;
    this.pairingOfferId = '';
    this.pairingExpiresAt = '';
    this.offlineQueueDepth = 0;
    this.protocolVersion = '';
    this.keyAgreement = '';
    this.kdf = '';
    this.cipher = '';
    this.replayProtection = '';
    this.maxFrameBytes = 0;
    this.connectedAt = '';
    this.lastHeartbeatAt = '';
    this.lastFrameAt = '';
    this.updatedAt = '';
    this.failure = new AgentBridgeRelayFailureDetails();
  }
}

export class AgentBridgeRelayPairingOffer {
  version: number;
  protocolVersion: string;
  offerId: string;
  relayUrl: string;
  publicRelayUrl: string;
  relayId: string;
  pairingSecret: string;
  pairingUri: string;
  pairingSessionId: string;
  userCode: string;
  verificationUrl: string;
  identityPublicKeyBase64: string;
  identityFingerprintSha256: string;
  ephemeralPublicKeyBase64: string;
  challengeBase64: string;
  signatureBase64: string;
  algorithm: string;
  bridgeIdentityPublicKeyBase64: string;
  bridgeIdentityPublicKeyPem: string;
  bridgeIdentityFingerprint: string;
  bridgeIdentityGeneration: number;
  bridgeDisplayName: string;
  bridgePlatform: string;
  expiresAt: string;
  expiresAtEpochMs: number;
  device: AgentBridgeRelayDeviceRecord;

  constructor() {
    this.version = 0;
    this.protocolVersion = '';
    this.offerId = '';
    this.relayUrl = '';
    this.publicRelayUrl = '';
    this.relayId = '';
    this.pairingSecret = '';
    this.pairingUri = '';
    this.pairingSessionId = '';
    this.userCode = '';
    this.verificationUrl = '';
    this.identityPublicKeyBase64 = '';
    this.identityFingerprintSha256 = '';
    this.ephemeralPublicKeyBase64 = '';
    this.challengeBase64 = '';
    this.signatureBase64 = '';
    this.algorithm = '';
    this.bridgeIdentityPublicKeyBase64 = '';
    this.bridgeIdentityPublicKeyPem = '';
    this.bridgeIdentityFingerprint = '';
    this.bridgeIdentityGeneration = 0;
    this.bridgeDisplayName = '';
    this.bridgePlatform = '';
    this.expiresAt = '';
    this.expiresAtEpochMs = 0;
    this.device = new AgentBridgeRelayDeviceRecord();
  }
}

export class AgentBridgeRelayPairingResult {
  ok: boolean;
  preview: boolean;
  confirmed: boolean;
  paired: boolean;
  planId: string;
  pairingSessionId: string;
  sessionId: string;
  status: string;
  keyEpoch: number;
  device: AgentBridgeRelayDeviceRecord;
  failure: AgentBridgeRelayFailureDetails;
  updatedAt: string;

  constructor() {
    this.ok = false;
    this.preview = false;
    this.confirmed = false;
    this.paired = false;
    this.planId = '';
    this.pairingSessionId = '';
    this.sessionId = '';
    this.status = '';
    this.keyEpoch = 0;
    this.device = new AgentBridgeRelayDeviceRecord();
    this.failure = new AgentBridgeRelayFailureDetails();
    this.updatedAt = '';
  }
}

export class AgentBridgeRelayEncryptedEnvelope {
  version: number;
  sessionId: string;
  direction: string;
  seq: number;
  keyEpoch: number;
  contentType: string;
  nonceBase64: string;
  cipherTextBase64: string;
  authTagBase64: string;
  aadBase64: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  sentAt: string;

  constructor() {
    this.version = 0;
    this.sessionId = '';
    this.direction = '';
    this.seq = 0;
    this.keyEpoch = 0;
    this.contentType = '';
    this.nonceBase64 = '';
    this.cipherTextBase64 = '';
    this.authTagBase64 = '';
    this.aadBase64 = '';
    this.iv = '';
    this.ciphertext = '';
    this.authTag = '';
    this.sentAt = '';
  }
}

export class AgentBridgeRelayPublicEndpoint {
  relayUrl: string;
  relayId: string;
  bridgeIdentityPublicKeyBase64: string;
  bridgeIdentityPublicKeyPem: string;
  bridgeIdentityFingerprint: string;

  constructor() {
    this.relayUrl = '';
    this.relayId = '';
    this.bridgeIdentityPublicKeyBase64 = '';
    this.bridgeIdentityPublicKeyPem = '';
    this.bridgeIdentityFingerprint = '';
  }

  isValid(): boolean {
    return this.relayUrl.length > 0 && this.relayId.length > 0 &&
      this.bridgeIdentityFingerprint.length > 0 &&
      (this.bridgeIdentityPublicKeyBase64.length > 0 || this.bridgeIdentityPublicKeyPem.length > 0);
  }
}

export class AgentBridgeRelaySessionResponse {
  protocolVersion: string;
  relayId: string;
  deviceId: string;
  sessionId: string;
  bridgeIdentityPublicKeyBase64: string;
  bridgeIdentityPublicKeyPem: string;
  bridgeIdentityFingerprint: string;
  bridgeIdentityGeneration: number;
  bridgeEphemeralPublicKeyBase64: string;
  bridgeEphemeralPublicKeyPem: string;
  clientNonce: string;
  bridgeNonce: string;
  keyEpoch: number;
  issuedAt: number;
  paired: boolean;
  signature: string;

  constructor() {
    this.protocolVersion = '';
    this.relayId = '';
    this.deviceId = '';
    this.sessionId = '';
    this.bridgeIdentityPublicKeyBase64 = '';
    this.bridgeIdentityPublicKeyPem = '';
    this.bridgeIdentityFingerprint = '';
    this.bridgeIdentityGeneration = 0;
    this.bridgeEphemeralPublicKeyBase64 = '';
    this.bridgeEphemeralPublicKeyPem = '';
    this.clientNonce = '';
    this.bridgeNonce = '';
    this.keyEpoch = 0;
    this.issuedAt = 0;
    this.paired = false;
    this.signature = '';
  }
}

export class AgentBridgeRelayManagementPayload {
  relayUrl: string;
  relayId: string;
  offerId: string;
  deviceId: string;
  planId: string;
  ttlMs: number;
  includeRevoked: boolean;
  confirm: boolean;

  constructor() {
    this.relayUrl = '';
    this.relayId = '';
    this.offerId = '';
    this.deviceId = '';
    this.planId = '';
    this.ttlMs = 300000;
    this.includeRevoked = true;
    this.confirm = false;
  }
}

export class AgentBridgeRelayBrokerAttach {
  type: string;
  relayId: string;

  constructor(relayId: string) {
    this.type = 'relay.attach';
    this.relayId = relayId;
  }
}

export class AgentBridgeRelayBrokerFrame {
  type: string;
  relayId: string;
  connectionId: string;
  targetConnectionId: string | undefined;
  frameId: string;
  payload: string;

  constructor(relayId: string, connectionId: string, targetConnectionId: string, frameId: string, payload: string) {
    this.type = 'relay.frame';
    this.relayId = relayId;
    this.connectionId = connectionId;
    this.targetConnectionId = undefined;
    if (targetConnectionId.length > 0) {
      this.targetConnectionId = targetConnectionId;
    }
    this.frameId = frameId;
    this.payload = payload;
  }
}

export class AgentBridgeRelayBrokerAck {
  type: string;
  relayId: string;
  connectionId: string;
  targetConnectionId: string;
  frameId: string;

  constructor(relayId: string, connectionId: string, targetConnectionId: string, frameId: string) {
    this.type = 'relay.ack';
    this.relayId = relayId;
    this.connectionId = connectionId;
    this.targetConnectionId = targetConnectionId;
    this.frameId = frameId;
  }
}

export class AgentBridgeRelayBrokerDetach {
  type: string;
  relayId: string;
  connectionId: string;

  constructor(relayId: string, connectionId: string) {
    this.type = 'relay.detach';
    this.relayId = relayId;
    this.connectionId = connectionId;
  }
}

export class AgentBridgeRelayClientHello {
  type: string;
  protocolVersion: string;
  relayId: string;
  offerId: string;
  deviceId: string;
  displayName: string;
  platform: string;
  clientIdentityPublicKeyBase64: string;
  clientIdentityPublicKeyPem: string;
  clientIdentityFingerprint: string;
  bridgeIdentityFingerprint: string;
  sessionId: string;
  clientEphemeralPublicKeyBase64: string;
  clientEphemeralPublicKeyPem: string;
  clientNonce: string;
  issuedAt: number;
  proof: string;
  signature: string;

  constructor(type: string) {
    this.type = type;
    this.protocolVersion = 'ngf-agent-bridge.relay.v1';
    this.relayId = '';
    this.offerId = '';
    this.deviceId = '';
    this.displayName = '';
    this.platform = 'harmonyos';
    this.clientIdentityPublicKeyBase64 = '';
    this.clientIdentityPublicKeyPem = '';
    this.clientIdentityFingerprint = '';
    this.bridgeIdentityFingerprint = '';
    this.sessionId = '';
    this.clientEphemeralPublicKeyBase64 = '';
    this.clientEphemeralPublicKeyPem = '';
    this.clientNonce = '';
    this.issuedAt = 0;
    this.proof = '';
    this.signature = '';
  }
}

export class AgentBridgeRelayE2eeData {
  type: string;
  envelope: AgentBridgeRelayEncryptedEnvelope;

  constructor(envelope: AgentBridgeRelayEncryptedEnvelope) {
    this.type = 'relay.e2ee.data';
    this.envelope = envelope;
  }
}

export class AgentBridgeRelayResult {
  ok: boolean;
  action: string;
  preview: boolean;
  confirmed: boolean;
  planId: string;
  status: AgentBridgeRelayStatus;
  pairingOffer: AgentBridgeRelayPairingOffer;
  pairingResult: AgentBridgeRelayPairingResult;
  devices: Array<AgentBridgeRelayDeviceRecord>;
  envelope: AgentBridgeRelayEncryptedEnvelope;
  device: AgentBridgeRelayDeviceRecord;
  failure: AgentBridgeRelayFailureDetails;
  warnings: Array<string>;
  updatedAt: string;

  constructor() {
    this.ok = false;
    this.action = '';
    this.preview = false;
    this.confirmed = false;
    this.planId = '';
    this.status = new AgentBridgeRelayStatus();
    this.pairingOffer = new AgentBridgeRelayPairingOffer();
    this.pairingResult = new AgentBridgeRelayPairingResult();
    this.devices = [];
    this.envelope = new AgentBridgeRelayEncryptedEnvelope();
    this.device = new AgentBridgeRelayDeviceRecord();
    this.failure = new AgentBridgeRelayFailureDetails();
    this.warnings = [];
    this.updatedAt = '';
  }
}

export class AgentBridgeBinaryFrameKind {
  static readonly INVALID: string = 'invalid';
  static readonly TERMINAL: string = 'terminal';
  static readonly FILE_TRANSFER: string = 'file_transfer';
}

export class AgentBridgeTerminalFrameOpcode {
  static readonly OUTPUT: number = 0x01;
  static readonly INPUT: number = 0x02;
  static readonly RESIZE: number = 0x03;
  static readonly SNAPSHOT: number = 0x04;
  static readonly RESTORE: number = 0x05;
  static readonly MOUSE: number = 0x06;
}

export class AgentBridgeFileTransferOpcode {
  static readonly BEGIN: number = 0x10;
  static readonly CHUNK: number = 0x11;
  static readonly END: number = 0x12;
  static readonly CANCEL: number = 0x13;
}

export class AgentBridgeTerminalFrame {
  opcode: number;
  slot: number;
  payload: ArrayBuffer;

  constructor(opcode: number = 0, slot: number = 0, payload: ArrayBuffer = new ArrayBuffer(0)) {
    this.opcode = opcode;
    this.slot = slot;
    this.payload = payload;
  }
}

export class AgentBridgeTerminalSnapshotEnvelope {
  sequenced: boolean;
  restoreSeq: number;
  snapshotSeq: number;
  truncated: boolean;
  source: string;
  text: string;

  constructor() {
    this.sequenced = false;
    this.restoreSeq = 0;
    this.snapshotSeq = 0;
    this.truncated = false;
    this.source = 'memory';
    this.text = '';
  }
}

export class AgentBridgeFileTransferMetadata {
  requestId: string;
  direction: string;
  workspaceId: string;
  path: string;
  fileName: string;
  mediaType: string;
  size: number;
  sizeBytes: number;
  sha256: string;
  modifiedAt: number;
  createdAt: string;
  completedAt: string;

  constructor() {
    this.requestId = '';
    this.direction = '';
    this.workspaceId = '';
    this.path = '';
    this.fileName = '';
    this.mediaType = '';
    this.size = 0;
    this.sizeBytes = 0;
    this.sha256 = '';
    this.modifiedAt = 0;
    this.createdAt = '';
    this.completedAt = '';
  }
}

export class AgentBridgeFileTransferFrame {
  opcode: number;
  requestId: string;
  metadata: AgentBridgeFileTransferMetadata;
  payload: ArrayBuffer;

  constructor(
    opcode: number = 0,
    requestId: string = '',
    metadata: AgentBridgeFileTransferMetadata = new AgentBridgeFileTransferMetadata(),
    payload: ArrayBuffer = new ArrayBuffer(0)
  ) {
    this.opcode = opcode;
    this.requestId = requestId;
    this.metadata = metadata;
    this.payload = payload;
  }
}

export class AgentBridgeBinaryFrame {
  kind: string;
  terminalFrame: AgentBridgeTerminalFrame | null;
  fileTransferFrame: AgentBridgeFileTransferFrame | null;

  constructor() {
    this.kind = AgentBridgeBinaryFrameKind.INVALID;
    this.terminalFrame = null;
    this.fileTransferFrame = null;
  }
}

export class AgentBridgeFileTransferState {
  requestId: string;
  direction: string;
  status: string;
  path: string;
  fileName: string;
  mediaType: string;
  transferredBytes: number;
  totalBytes: number;
  sha256: string;
  localPath: string;
  errorMessage: string;
  updatedAt: number;

  constructor() {
    this.requestId = '';
    this.direction = '';
    this.status = '';
    this.path = '';
    this.fileName = '';
    this.mediaType = '';
    this.transferredBytes = 0;
    this.totalBytes = 0;
    this.sha256 = '';
    this.localPath = '';
    this.errorMessage = '';
    this.updatedAt = 0;
  }
}

export class AgentBridgeScheduleCadence {
  type: string = 'cron';
  expression: string = '';
  timezone: string = 'UTC';
}

export class AgentBridgeScheduleConcurrency {
  limit: number = 1;
  overlapPolicy: string = 'skip';
}

export class AgentBridgeScheduleRetry {
  maxAttempts: number = 1;
  initialDelayMs: number = 0;
  backoffMultiplier: number = 2;
}

export class AgentBridgeScheduleRetention {
  maxRuns: number = 50;
  maxAgeDays: number = 30;
}

export class AgentBridgeScheduleRecord {
  id: string = '';
  name: string = '';
  prompt: string = '';
  workspaceId: string = '';
  workspacePath: string = '';
  providerId: string = '';
  modelId: string = '';
  enabled: boolean = false;
  status: string = '';
  cadence: AgentBridgeScheduleCadence = new AgentBridgeScheduleCadence();
  concurrency: AgentBridgeScheduleConcurrency = new AgentBridgeScheduleConcurrency();
  retry: AgentBridgeScheduleRetry = new AgentBridgeScheduleRetry();
  retention: AgentBridgeScheduleRetention = new AgentBridgeScheduleRetention();
  missedRunPolicy: string = 'run_once';
  nextRunAt: string = '';
  lastRunAt: string = '';
  totalRuns: number = 0;
  successfulRuns: number = 0;
  failedRuns: number = 0;
  activeRuns: number = 0;
  queuedRuns: number = 0;
  revision: number = 0;
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeScheduleRunAttempt {
  attempt: number = 0;
  status: string = '';
  failureCategory: string = '';
  message: string = '';
  startedAt: string = '';
  completedAt: string = '';
}

export class AgentBridgeScheduleRunRecord {
  id: string = '';
  scheduleId: string = '';
  reason: string = '';
  scheduledFor: string = '';
  status: string = '';
  attempts: Array<AgentBridgeScheduleRunAttempt> = [];
  agentId: string = '';
  sessionId: string = '';
  failureCategory: string = '';
  message: string = '';
  startedAt: string = '';
  completedAt: string = '';
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeLoopAcceptanceCriterion {
  id: string = '';
  description: string = '';
}

export class AgentBridgeLoopBudget {
  maxTokens: number = 0;
  maxCost: number = 0;
  currency: string = '';
  maxDurationMs: number = 0;
}

export class AgentBridgeLoopUsage {
  totalTokens: number = 0;
  costByCurrencyJson: string = '';
  startedAtMs: number = 0;
}

export class AgentBridgeLoopVerificationCheck {
  criterionId: string = '';
  passed: boolean = false;
  evidence: string = '';
  remediation: string = '';
}

export class AgentBridgeLoopVerification {
  available: boolean = false;
  passed: boolean = false;
  summary: string = '';
  remediation: string = '';
  checks: Array<AgentBridgeLoopVerificationCheck> = [];
}

export class AgentBridgeLoopRoundUsage {
  totalTokens: number = 0;
  cost: number = 0;
  currency: string = '';
  estimated: boolean = false;
}

export class AgentBridgeLoopRoundRecord {
  round: number = 0;
  status: string = '';
  workerAgentId: string = '';
  verifierAgentId: string = '';
  workerOutput: string = '';
  verification: AgentBridgeLoopVerification = new AgentBridgeLoopVerification();
  workerUsage: AgentBridgeLoopRoundUsage = new AgentBridgeLoopRoundUsage();
  verifierUsage: AgentBridgeLoopRoundUsage = new AgentBridgeLoopRoundUsage();
  failureCategory: string = '';
  message: string = '';
  startedAt: string = '';
  completedAt: string = '';
}

export class AgentBridgeLoopRecord {
  id: string = '';
  name: string = '';
  prompt: string = '';
  verifyPrompt: string = '';
  acceptanceCriteria: Array<AgentBridgeLoopAcceptanceCriterion> = [];
  workspaceId: string = '';
  workspacePath: string = '';
  runtimeWorkspaceId: string = '';
  runtimeWorkspacePath: string = '';
  worktreeId: string = '';
  branch: string = '';
  sourceAgentId: string = '';
  workerProviderId: string = '';
  workerModelId: string = '';
  verifierProviderId: string = '';
  verifierModelId: string = '';
  workspaceMode: string = 'isolated';
  maxRounds: number = 0;
  budget: AgentBridgeLoopBudget = new AgentBridgeLoopBudget();
  status: string = '';
  terminationReason: string = '';
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  activeWorkerAgentId: string = '';
  activeVerifierAgentId: string = '';
  takeoverAgentId: string = '';
  generation: number = 0;
  revision: number = 0;
  running: boolean = false;
  resumeAvailable: boolean = false;
  rounds: Array<AgentBridgeLoopRoundRecord> = [];
  usage: AgentBridgeLoopUsage = new AgentBridgeLoopUsage();
  startedAt: string = '';
  completedAt: string = '';
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeChatRoomMember {
  memberId: string = '';
  type: string = 'human';
  agentId: string = '';
  displayName: string = '';
  role: string = 'member';
  active: boolean = true;
  joinedAt: string = '';
  leftAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeChatRoomDelivery {
  memberId: string = '';
  agentId: string = '';
  status: string = '';
  responseMessageId: string = '';
  failureCategory: string = '';
  message: string = '';
  updatedAt: string = '';
}

export class AgentBridgeChatRoomMessage {
  id: string = '';
  roomId: string = '';
  seq: number = 0;
  clientMessageId: string = '';
  authorMemberId: string = '';
  authorType: string = '';
  authorAgentId: string = '';
  body: string = '';
  replyToMessageId: string = '';
  threadId: string = '';
  mentionMemberIds: Array<string> = [];
  routeOriginMessageId: string = '';
  routingDepth: number = 0;
  deliveries: Array<AgentBridgeChatRoomDelivery> = [];
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeChatRoomAck {
  roomId: string = '';
  memberId: string = '';
  lastSeq: number = 0;
  updatedAt: string = '';
}

export class AgentBridgeChatRoom {
  id: string = '';
  name: string = '';
  purpose: string = '';
  workspaceId: string = '';
  sequence: number = 0;
  retentionMaxMessages: number = 0;
  members: Array<AgentBridgeChatRoomMember> = [];
  archivedAt: string = '';
  messageCount: number = 0;
  unreadCount: number = 0;
  currentMemberId: string = '';
  currentRole: string = '';
  canPost: boolean = false;
  canManage: boolean = false;
  revision: number = 0;
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeM7Result {
  ok: boolean = false;
  action: string = '';
  preview: boolean = false;
  confirmed: boolean = false;
  planId: string = '';
  available: boolean = false;
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  warnings: Array<string> = [];
  updatedAt: string = '';
  total: number = 0;
  scheduleId: string = '';
  loopId: string = '';
  roomId: string = '';
  scheduleCount: number = 0;
  enabledScheduleCount: number = 0;
  activeRunCount: number = 0;
  queuedRunCount: number = 0;
  loopCount: number = 0;
  runningLoopCount: number = 0;
  pausedLoopCount: number = 0;
  roomCount: number = 0;
  messageCount: number = 0;
  schedules: Array<AgentBridgeScheduleRecord> = [];
  schedule: AgentBridgeScheduleRecord = new AgentBridgeScheduleRecord();
  runs: Array<AgentBridgeScheduleRunRecord> = [];
  run: AgentBridgeScheduleRunRecord = new AgentBridgeScheduleRunRecord();
  nextCursor: string = '';
  loops: Array<AgentBridgeLoopRecord> = [];
  loop: AgentBridgeLoopRecord = new AgentBridgeLoopRecord();
  rounds: Array<AgentBridgeLoopRoundRecord> = [];
  nextOffset: number = 0;
  rooms: Array<AgentBridgeChatRoom> = [];
  room: AgentBridgeChatRoom = new AgentBridgeChatRoom();
  member: AgentBridgeChatRoomMember = new AgentBridgeChatRoomMember();
  messages: Array<AgentBridgeChatRoomMessage> = [];
  chatMessage: AgentBridgeChatRoomMessage = new AgentBridgeChatRoomMessage();
  ack: AgentBridgeChatRoomAck = new AgentBridgeChatRoomAck();
  firstSeq: number = 0;
  lastSeq: number = 0;
  nextBeforeSeq: number = 0;
  nextAfterSeq: number = 0;
  unreadCount: number = 0;
  dispatchedAgentCount: number = 0;
  duplicate: boolean = false;
}

export class AgentBridgeScheduleWritePayload {
  scheduleId: string;
  name: string;
  prompt: string;
  workspaceId: string;
  workspacePath: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  cadence: AgentBridgeScheduleCadence;
  concurrency: AgentBridgeScheduleConcurrency;
  retry: AgentBridgeScheduleRetry;
  retention: AgentBridgeScheduleRetention;
  missedRunPolicy: string;
  planId: string;
  confirm: boolean;

  constructor(
    scheduleId: string,
    name: string,
    prompt: string,
    workspaceId: string,
    workspacePath: string,
    providerId: string,
    modelId: string,
    enabled: boolean,
    cadence: AgentBridgeScheduleCadence,
    concurrency: AgentBridgeScheduleConcurrency,
    retry: AgentBridgeScheduleRetry,
    retention: AgentBridgeScheduleRetention,
    missedRunPolicy: string,
    planId: string = '',
    confirm: boolean = false
  ) {
    this.scheduleId = scheduleId;
    this.name = name;
    this.prompt = prompt;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.providerId = providerId;
    this.modelId = modelId;
    this.enabled = enabled;
    this.cadence = cadence;
    this.concurrency = concurrency;
    this.retry = retry;
    this.retention = retention;
    this.missedRunPolicy = missedRunPolicy;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeScheduleQueryPayload {
  scheduleId: string;
  query: string;
  enabled: boolean | undefined;
  before: string;
  limit: number;
  planId: string;
  confirm: boolean;

  constructor(scheduleId: string = '', query: string = '', limit: number = 50) {
    this.scheduleId = scheduleId;
    this.query = query;
    this.enabled = undefined;
    this.before = '';
    this.limit = limit;
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeLoopWritePayload {
  loopId: string;
  name: string;
  prompt: string;
  verifyPrompt: string;
  acceptanceCriteria: Array<AgentBridgeLoopAcceptanceCriterion>;
  workspaceId: string;
  workspacePath: string;
  sourceAgentId: string;
  workerProviderId: string;
  workerModelId: string;
  verifierProviderId: string;
  verifierModelId: string;
  workspaceMode: string;
  maxRounds: number;
  budget: AgentBridgeLoopBudget;
  planId: string;
  confirm: boolean;

  constructor(
    loopId: string,
    name: string,
    prompt: string,
    verifyPrompt: string,
    acceptanceCriteria: Array<AgentBridgeLoopAcceptanceCriterion>,
    workspaceId: string,
    workspacePath: string,
    sourceAgentId: string,
    workerProviderId: string,
    workerModelId: string,
    verifierProviderId: string,
    verifierModelId: string,
    workspaceMode: string,
    maxRounds: number,
    budget: AgentBridgeLoopBudget,
    planId: string = '',
    confirm: boolean = false
  ) {
    this.loopId = loopId;
    this.name = name;
    this.prompt = prompt;
    this.verifyPrompt = verifyPrompt;
    this.acceptanceCriteria = acceptanceCriteria;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.sourceAgentId = sourceAgentId;
    this.workerProviderId = workerProviderId;
    this.workerModelId = workerModelId;
    this.verifierProviderId = verifierProviderId;
    this.verifierModelId = verifierModelId;
    this.workspaceMode = workspaceMode;
    this.maxRounds = maxRounds;
    this.budget = budget;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeLoopQueryPayload {
  loopId: string;
  query: string;
  status: string;
  offset: number;
  limit: number;
  planId: string;
  confirm: boolean;

  constructor(loopId: string = '', query: string = '', status: string = '') {
    this.loopId = loopId;
    this.query = query;
    this.status = status;
    this.offset = 0;
    this.limit = 20;
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeChatRoomWritePayload {
  roomId: string;
  name: string;
  purpose: string;
  workspaceId: string;
  retentionMaxMessages: number;
  actorDisplayName: string;
  includeArchived: boolean;
  query: string;
  planId: string;
  confirm: boolean;

  constructor(roomId: string = '', name: string = '', purpose: string = '', workspaceId: string = '') {
    this.roomId = roomId;
    this.name = name;
    this.purpose = purpose;
    this.workspaceId = workspaceId;
    this.retentionMaxMessages = 1000;
    this.actorDisplayName = '';
    this.includeArchived = false;
    this.query = '';
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeChatRoomMemberPayload {
  roomId: string;
  memberId: string;
  role: string;
  displayName: string;
  member: AgentBridgeChatRoomMember;
  planId: string;
  confirm: boolean;

  constructor(roomId: string, member: AgentBridgeChatRoomMember = new AgentBridgeChatRoomMember()) {
    this.roomId = roomId;
    this.memberId = member.memberId;
    this.role = member.role;
    this.displayName = member.displayName;
    this.member = member;
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeChatRoomMessagePayload {
  roomId: string;
  clientMessageId: string;
  body: string;
  replyToMessageId: string;
  mentionMemberIds: Array<string>;

  constructor(
    roomId: string,
    clientMessageId: string,
    body: string,
    replyToMessageId: string = '',
    mentionMemberIds: Array<string> = []
  ) {
    this.roomId = roomId;
    this.clientMessageId = clientMessageId;
    this.body = body;
    this.replyToMessageId = replyToMessageId;
    this.mentionMemberIds = mentionMemberIds;
  }
}

export class AgentBridgeChatRoomMessageListPayload {
  roomId: string;
  afterSeq: number;
  beforeSeq: number;
  limit: number;

  constructor(roomId: string, afterSeq: number = 0, beforeSeq: number = 0, limit: number = 50) {
    this.roomId = roomId;
    this.afterSeq = afterSeq;
    this.beforeSeq = beforeSeq;
    this.limit = limit;
  }
}

export class AgentBridgeChatRoomAckPayload {
  roomId: string;
  lastSeq: number;

  constructor(roomId: string, lastSeq: number) {
    this.roomId = roomId;
    this.lastSeq = lastSeq;
  }
}

export class AgentBridgeModelOption {
  id: string;
  displayName: string;
  vendor: string;
  isDefault: boolean;
  contextWindow: number;
  source: string;
  available: boolean;
  warning: string;

  constructor(
    id: string,
    displayName: string,
    vendor: string,
    isDefault: boolean,
    contextWindow: number,
    source: string = 'fallback',
    available: boolean = true,
    warning: string = ''
  ) {
    this.id = id;
    this.displayName = displayName;
    this.vendor = vendor;
    this.isDefault = isDefault;
    this.contextWindow = contextWindow;
    this.source = source;
    this.available = available;
    this.warning = warning;
  }
}

export class AgentBridgeSpeedModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  source: string;
  available: boolean;
  warning: string;

  constructor(
    id: string,
    displayName: string,
    description: string,
    isDefault: boolean,
    source: string = 'fallback',
    available: boolean = true,
    warning: string = ''
  ) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
    this.source = source;
    this.available = available;
    this.warning = warning;
  }
}

export class AgentBridgeReasoningModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  source: string;
  available: boolean;
  warning: string;

  constructor(
    id: string,
    displayName: string,
    description: string,
    isDefault: boolean,
    source: string = 'fallback',
    available: boolean = true,
    warning: string = ''
  ) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
    this.source = source;
    this.available = available;
    this.warning = warning;
  }
}

export class AgentBridgeInteractionModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  agent: string;
  category: string;
  source: string;
  available: boolean;
  warning: string;

  constructor(
    id: string,
    displayName: string,
    description: string,
    isDefault: boolean,
    agent: string = '',
    category: string = 'run',
    source: string = 'fallback',
    available: boolean = true,
    warning: string = ''
  ) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
    this.agent = agent;
    this.category = category;
    this.source = source;
    this.available = available;
    this.warning = warning;
  }
}

export class AgentBridgeToolOption {
  id: string;
  displayName: string;
  description: string;
  risk: string;
  source: string;
  available: boolean;
  warning: string;
  slashCommand: string;
  aliases: Array<string>;
  category: string;
  requiresConfirmation: boolean;

  constructor(
    id: string,
    displayName: string,
    description: string,
    risk: string,
    source: string = 'fallback',
    available: boolean = true,
    warning: string = '',
    slashCommand: string = '',
    aliases: Array<string> = [],
    category: string = 'tool',
    requiresConfirmation: boolean = false
  ) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.risk = risk;
    this.source = source;
    this.available = available;
    this.warning = warning;
    this.slashCommand = slashCommand;
    this.aliases = aliases;
    this.category = category;
    this.requiresConfirmation = requiresConfirmation;
  }
}

export class AgentBridgeProviderOption {
  id: string;
  displayName: string;
  status: string;
  description: string;
  endpoint: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsPreviews: boolean;
  supportsPermissions: boolean;
  supportsHistory: boolean;
  supportsModelSelection: boolean;
  supportsSpeedProfiles: boolean;
  supportsWorkspace: boolean;
  supportsInteractiveSessions: boolean;
  supportsSessionAttach: boolean;
  supportsSessionAbort: boolean;
  supportsSessionResume: boolean;
  models: Array<AgentBridgeModelOption>;
  speedModes: Array<AgentBridgeSpeedModeOption>;
  reasoningModes: Array<AgentBridgeReasoningModeOption>;
  interactionModes: Array<AgentBridgeInteractionModeOption>;
  tools: Array<AgentBridgeToolOption>;
  runtimeMode: string;
  interactiveReady: boolean;
  sessionState: string;
  exitCode: number;
  lastError: string;
  capabilitySource: string;
  capabilityStatus: string;
  lastDiscoveredAt: number;
  discoveryWarnings: Array<string>;
  discoveryErrors: Array<string>;
  cacheStatus: string;
  cacheTtlMs: number;
  supportsUsageEvents: boolean;
  usageEventsCapabilityKnown: boolean;
  supportsMetadataGeneration: boolean;
  metadataGenerationCapabilityKnown: boolean;
  supportsProviderUsage: boolean;
  providerUsageCapabilityKnown: boolean;

  constructor(
    id: string,
    displayName: string,
    status: string,
    description: string,
    endpoint: string,
    supportsStreaming: boolean,
    supportsTools: boolean,
    supportsPreviews: boolean,
    supportsPermissions: boolean,
    supportsHistory: boolean,
    supportsModelSelection: boolean,
    supportsSpeedProfiles: boolean,
    supportsWorkspace: boolean,
    models: Array<AgentBridgeModelOption>,
    speedModes: Array<AgentBridgeSpeedModeOption>,
    reasoningModes: Array<AgentBridgeReasoningModeOption>,
    interactionModes: Array<AgentBridgeInteractionModeOption>,
    tools: Array<AgentBridgeToolOption>,
    runtimeMode: string = 'oneshot',
    interactiveReady: boolean = false,
    sessionState: string = '',
    exitCode: number = 0,
    lastError: string = '',
    capabilitySource: string = 'fallback',
    capabilityStatus: string = '',
    lastDiscoveredAt: number = 0,
    discoveryWarnings: Array<string> = [],
    discoveryErrors: Array<string> = [],
    cacheStatus: string = '',
    cacheTtlMs: number = 0,
    supportsInteractiveSessions: boolean = false,
    supportsSessionAttach: boolean = false,
    supportsSessionAbort: boolean = false,
    supportsSessionResume: boolean = false,
    supportsUsageEvents: boolean = false,
    supportsMetadataGeneration: boolean = false,
    supportsProviderUsage: boolean = false,
    providerUsageCapabilityKnown: boolean = false,
    usageEventsCapabilityKnown: boolean = false,
    metadataGenerationCapabilityKnown: boolean = false
  ) {
    this.id = id;
    this.displayName = displayName;
    this.status = status;
    this.description = description;
    this.endpoint = endpoint;
    this.supportsStreaming = supportsStreaming;
    this.supportsTools = supportsTools;
    this.supportsPreviews = supportsPreviews;
    this.supportsPermissions = supportsPermissions;
    this.supportsHistory = supportsHistory;
    this.supportsModelSelection = supportsModelSelection;
    this.supportsSpeedProfiles = supportsSpeedProfiles;
    this.supportsWorkspace = supportsWorkspace;
    this.supportsInteractiveSessions = supportsInteractiveSessions;
    this.supportsSessionAttach = supportsSessionAttach;
    this.supportsSessionAbort = supportsSessionAbort;
    this.supportsSessionResume = supportsSessionResume;
    this.models = models;
    this.speedModes = speedModes;
    this.reasoningModes = reasoningModes;
    this.interactionModes = interactionModes;
    this.tools = tools;
    this.runtimeMode = runtimeMode;
    this.interactiveReady = interactiveReady;
    this.sessionState = sessionState;
    this.exitCode = exitCode;
    this.lastError = lastError;
    this.capabilitySource = capabilitySource;
    this.capabilityStatus = capabilityStatus;
    this.lastDiscoveredAt = lastDiscoveredAt;
    this.discoveryWarnings = discoveryWarnings;
    this.discoveryErrors = discoveryErrors;
    this.cacheStatus = cacheStatus;
    this.cacheTtlMs = cacheTtlMs;
    this.supportsUsageEvents = supportsUsageEvents;
    this.usageEventsCapabilityKnown = usageEventsCapabilityKnown;
    this.supportsMetadataGeneration = supportsMetadataGeneration;
    this.metadataGenerationCapabilityKnown = metadataGenerationCapabilityKnown;
    this.supportsProviderUsage = supportsProviderUsage;
    this.providerUsageCapabilityKnown = providerUsageCapabilityKnown;
  }
}

export class AgentBridgeRemoteSession {
  sessionId: string;
  remoteSessionId: string;
  providerId: string;
  title: string;
  workspacePath: string;
  workspaceTitle: string;
  branchName: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  status: string;
  source: string;
  messageCount: number;
  updatedAt: number;
  deviceId: string;
  runtimeMode: string;
  interactiveReady: boolean;
  sessionState: string;
  exitCode: number;
  lastError: string;

  constructor(
    sessionId: string,
    remoteSessionId: string,
    providerId: string,
    title: string,
    workspacePath: string,
    workspaceTitle: string,
    branchName: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    status: string,
    source: string,
    messageCount: number,
    updatedAt: number,
    deviceId: string = '',
    runtimeMode: string = 'oneshot',
    interactiveReady: boolean = false,
    sessionState: string = '',
    exitCode: number = 0,
    lastError: string = ''
  ) {
    this.sessionId = sessionId;
    this.remoteSessionId = remoteSessionId;
    this.providerId = providerId;
    this.title = title;
    this.workspacePath = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.branchName = branchName;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.status = status;
    this.source = source;
    this.messageCount = messageCount;
    this.updatedAt = updatedAt;
    this.deviceId = deviceId;
    this.runtimeMode = runtimeMode;
    this.interactiveReady = interactiveReady;
    this.sessionState = sessionState;
    this.exitCode = exitCode;
    this.lastError = lastError;
  }
}

export class AgentBridgeImportedMessage {
  id: string;
  sessionId: string;
  role: string;
  title: string;
  text: string;
  createdAt: number;
  reasoningText: string;
  messageId: string;
  agentName: string;

  constructor(
    id: string,
    sessionId: string,
    role: string,
    title: string,
    text: string,
    createdAt: number,
    reasoningText: string = '',
    messageId: string = '',
    agentName: string = ''
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.role = role;
    this.title = title;
    this.text = text;
    this.createdAt = createdAt;
    this.reasoningText = reasoningText;
    this.messageId = messageId;
    this.agentName = agentName;
  }
}

export class AgentBridgeImportedToolCall {
  id: string;
  sessionId: string;
  providerId: string;
  messageId: string;
  toolCallId: string;
  name: string;
  status: string;
  inputText: string;
  outputText: string;
  errorText: string;
  rawJson: string;
  startedAt: number;
  completedAt: number;
  updatedAt: number;
  agentName: string;

  constructor(
    id: string,
    sessionId: string,
    providerId: string,
    messageId: string,
    toolCallId: string,
    name: string,
    status: string,
    inputText: string,
    outputText: string,
    errorText: string,
    rawJson: string,
    startedAt: number,
    completedAt: number,
    updatedAt: number,
    agentName: string = ''
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.providerId = providerId;
    this.messageId = messageId;
    this.toolCallId = toolCallId;
    this.name = name;
    this.status = status;
    this.inputText = inputText;
    this.outputText = outputText;
    this.errorText = errorText;
    this.rawJson = rawJson;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.updatedAt = updatedAt;
    this.agentName = agentName;
  }
}

export class AgentBridgeDefaultOptions {
  static buildProviders(): Array<AgentBridgeProviderOption> {
    const providers: Array<AgentBridgeProviderOption> = [];
    providers.push(AgentBridgeDefaultOptions.buildOpenCodeProvider());
    providers.push(AgentBridgeDefaultOptions.buildDevEcoProvider());
    providers.push(AgentBridgeDefaultOptions.buildMimoProvider());
    providers.push(AgentBridgeDefaultOptions.buildCodexProvider());
    providers.push(AgentBridgeDefaultOptions.buildClaudeProvider());
    providers.push(AgentBridgeDefaultOptions.buildAntigravityProvider());
    providers.push(AgentBridgeDefaultOptions.buildOpenClawProvider());
    providers.push(AgentBridgeDefaultOptions.buildOpenClawGatewayProvider());
    providers.push(AgentBridgeDefaultOptions.buildHermesProvider());
    providers.push(AgentBridgeDefaultOptions.buildHermesStudioProvider());
    return providers;
  }

  private static buildOpenCodeProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'opencode', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.OPENCODE,
      'OpenCode',
      'configured',
      'Connects to a local opencode serve endpoint.',
      '',
      false,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes(),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildOpenCodeInteractionModes(),
      AgentBridgeDefaultOptions.buildOpenCodeTools()
    );
  }

  private static buildDevEcoProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'deveco', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.DEVECO,
      'DevEco Code',
      'configured',
      'Connects to a DevEco Code headless server with OpenCode-compatible APIs.',
      '',
      false,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('DevEco Code'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildOpenCodeInteractionModes(),
      AgentBridgeDefaultOptions.buildOpenCodeCompatibleTools('deveco', 'DevEco Code')
    );
  }

  private static buildMimoProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'mimo', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.MIMO,
      'MiMo Code',
      'configured',
      'Connects to a configured MiMo/OpenCode-compatible server endpoint.',
      '',
      false,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('MiMo Code'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildOpenCodeInteractionModes(),
      AgentBridgeDefaultOptions.buildOpenCodeCompatibleTools('mimo', 'MiMo Code')
    );
  }

  private static buildCodexProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'codex', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.CODEX,
      'Codex CLI',
      'configured',
      'Runs Codex through the official non-interactive codex exec command.',
      '',
      true,
      false,
      false,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildCodexSpeedModes(),
      AgentBridgeDefaultOptions.buildCodexReasoningModes(),
      AgentBridgeDefaultOptions.buildCodexInteractionModes(),
      AgentBridgeDefaultOptions.buildCliTools('codex', 'Codex Exec')
    );
  }

  private static buildClaudeProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'claude', true, 0));
    models.push(new AgentBridgeModelOption('sonnet', 'Sonnet', 'claude', false, 0));
    models.push(new AgentBridgeModelOption('opus', 'Opus', 'claude', false, 0));
    models.push(new AgentBridgeModelOption('fable', 'Fable', 'claude', false, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.CLAUDE,
      'Claude Code',
      'configured',
      'Runs Claude Code through the official print mode.',
      '',
      true,
      false,
      false,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('Claude Code'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildCliTools('claude', 'Claude Print')
    );
  }

  private static buildAntigravityProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'antigravity', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.ANTIGRAVITY,
      'Antigravity CLI',
      'configured',
      'Runs a configured Antigravity-compatible CLI command.',
      '',
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('Antigravity CLI'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildCliTools('antigravity', 'Antigravity CLI')
    );
  }

  private static buildOpenClawProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'openclaw', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.OPENCLAW,
      'OpenClaw CLI',
      'configured',
      'Runs OpenClaw through the local CLI agent mode.',
      '',
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('OpenClaw CLI'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildCliTools('openclaw', 'OpenClaw CLI')
    );
  }

  private static buildOpenClawGatewayProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('openclaw/default', 'openclaw/default', 'openclaw-gateway', true, 0));
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'openclaw-gateway', false, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.OPENCLAW_GATEWAY,
      'OpenClaw Gateway',
      'configured',
      'Connects to OpenClaw Gateway through the local Responses API.',
      '',
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('OpenClaw Gateway'),
      AgentBridgeDefaultOptions.buildGatewayReasoningModes('OpenClaw Gateway'),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildGatewayTools('openclaw-gateway', 'OpenClaw Gateway')
    );
  }

  private static buildHermesProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'hermes', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.HERMES,
      'Hermes CLI',
      'configured',
      'Runs Nous Hermes Agent through the local CLI chat mode.',
      '',
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('Hermes CLI'),
      AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildCliTools('hermes', 'Hermes CLI')
    );
  }

  private static buildHermesStudioProvider(): AgentBridgeProviderOption {
    const models: Array<AgentBridgeModelOption> = [];
    models.push(new AgentBridgeModelOption('configured', 'Configured Model', 'hermes-studio', true, 0));
    return new AgentBridgeProviderOption(
      AgentBridgeProviderId.HERMES_STUDIO,
      'Hermes Studio',
      'configured',
      'Connects to Hermes Studio through chat-run Socket.IO or HTTP fallback.',
      '',
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      true,
      models,
      AgentBridgeDefaultOptions.buildOpenCodeSpeedModes('Hermes Studio'),
      AgentBridgeDefaultOptions.buildGatewayReasoningModes('Hermes Studio'),
      AgentBridgeDefaultOptions.buildDefaultInteractionModes(),
      AgentBridgeDefaultOptions.buildGatewayTools('hermes-studio', 'Hermes Studio')
    );
  }

  private static buildDefaultSpeedModes(): Array<AgentBridgeSpeedModeOption> {
    const modes: Array<AgentBridgeSpeedModeOption> = [];
    modes.push(new AgentBridgeSpeedModeOption('auto', 'Auto', 'Provider default latency and reasoning budget.', true));
    modes.push(new AgentBridgeSpeedModeOption('fast', 'Fast', 'Prefer lower latency.', false));
    modes.push(new AgentBridgeSpeedModeOption('deep', 'Deep', 'Preserve more context for complex coding work.', false));
    return modes;
  }

  private static buildOpenCodeSpeedModes(providerName: string = 'OpenCode'): Array<AgentBridgeSpeedModeOption> {
    const modes: Array<AgentBridgeSpeedModeOption> = [];
    modes.push(new AgentBridgeSpeedModeOption('auto', 'Auto', 'Use the model and runtime configured in ' + providerName + '.', true));
    return modes;
  }

  static buildCodexSpeedModes(): Array<AgentBridgeSpeedModeOption> {
    const modes: Array<AgentBridgeSpeedModeOption> = [];
    modes.push(new AgentBridgeSpeedModeOption('auto', 'Auto', 'Use the Codex configured service tier.', true));
    modes.push(new AgentBridgeSpeedModeOption('fast', 'Fast', 'Use the Codex priority service tier when available.', false));
    return modes;
  }

  static buildDefaultReasoningModes(): Array<AgentBridgeReasoningModeOption> {
    const modes: Array<AgentBridgeReasoningModeOption> = [];
    modes.push(new AgentBridgeReasoningModeOption('auto', 'Auto', 'Use the provider configured reasoning effort.', true));
    return modes;
  }

  static buildGatewayReasoningModes(providerName: string): Array<AgentBridgeReasoningModeOption> {
    const modes: Array<AgentBridgeReasoningModeOption> = [];
    modes.push(new AgentBridgeReasoningModeOption('auto', 'Auto', 'Use the reasoning effort configured in ' + providerName + '.', true));
    modes.push(new AgentBridgeReasoningModeOption('low', 'Low', 'Prefer faster replies when the provider supports it.', false));
    modes.push(new AgentBridgeReasoningModeOption('medium', 'Medium', 'Use balanced reasoning for coding work.', false));
    modes.push(new AgentBridgeReasoningModeOption('high', 'High', 'Use deeper reasoning when the provider supports it.', false));
    return modes;
  }

  static buildCodexReasoningModes(): Array<AgentBridgeReasoningModeOption> {
    const modes: Array<AgentBridgeReasoningModeOption> = [];
    modes.push(new AgentBridgeReasoningModeOption('auto', 'Auto', 'Use the Codex configured reasoning effort.', true));
    modes.push(new AgentBridgeReasoningModeOption('low', 'Low', 'Fast responses with lighter reasoning.', false));
    modes.push(new AgentBridgeReasoningModeOption('medium', 'Medium', 'Balanced reasoning for everyday coding work.', false));
    modes.push(new AgentBridgeReasoningModeOption('high', 'High', 'Greater reasoning depth for complex work.', false));
    modes.push(new AgentBridgeReasoningModeOption('xhigh', 'Extra High', 'Maximum local Codex reasoning effort when available.', false));
    return modes;
  }

  static buildDefaultInteractionModes(): Array<AgentBridgeInteractionModeOption> {
    const modes: Array<AgentBridgeInteractionModeOption> = [];
    modes.push(new AgentBridgeInteractionModeOption('goal', 'Goal', 'Run the prompt as an implementation request.', true, '', 'run'));
    modes.push(new AgentBridgeInteractionModeOption('plan', 'Plan', 'Draft a plan first and wait for approval.', false, '', 'run'));
    return modes;
  }

  static buildCodexInteractionModes(): Array<AgentBridgeInteractionModeOption> {
    const modes = AgentBridgeDefaultOptions.buildDefaultInteractionModes();
    modes.push(new AgentBridgeInteractionModeOption('codex-permissions-default', 'Default permissions', 'Use the Codex configured approval and sandbox defaults.', true, '', 'approval'));
    modes.push(new AgentBridgeInteractionModeOption('codex-permissions-auto-review', 'Auto-review', 'Use workspace-write sandboxing and let Codex request approvals when needed.', false, '', 'approval'));
    modes.push(new AgentBridgeInteractionModeOption('codex-permissions-full-access', 'Full access', 'Run Codex with danger-full-access sandboxing and no approval prompts.', false, '', 'approval'));
    return modes;
  }

  static buildOpenCodeInteractionModes(): Array<AgentBridgeInteractionModeOption> {
    const modes: Array<AgentBridgeInteractionModeOption> = [];
    modes.push(new AgentBridgeInteractionModeOption('build', 'Build', 'Use the OpenCode build agent for implementation work.', true, 'build'));
    modes.push(new AgentBridgeInteractionModeOption('plan', 'Plan', 'Use the OpenCode plan agent before implementation.', false, 'plan'));
    return modes;
  }

  private static buildOpenCodeTools(): Array<AgentBridgeToolOption> {
    return AgentBridgeDefaultOptions.buildOpenCodeCompatibleTools('opencode', 'OpenCode');
  }

  private static buildOpenCodeCompatibleTools(providerId: string, providerName: string): Array<AgentBridgeToolOption> {
    const tools: Array<AgentBridgeToolOption> = [];
    tools.push(new AgentBridgeToolOption(providerId + '.message', providerName + ' Message', 'Sends a message into a ' + providerName + ' session.', 'write'));
    tools.push(new AgentBridgeToolOption(providerId + '.diff', providerName + ' Diff', 'Reads the current session diff.', 'read'));
    tools.push(new AgentBridgeToolOption(providerId + '.file', 'File Preview', 'Reads a file through the ' + providerName + ' server.', 'read'));
    return tools;
  }

  private static buildCliTools(providerId: string, toolName: string): Array<AgentBridgeToolOption> {
    const tools: Array<AgentBridgeToolOption> = [];
    tools.push(new AgentBridgeToolOption(providerId + '.cli', toolName, 'Runs the local CLI adapter for this provider.', 'write'));
    return tools;
  }

  private static buildGatewayTools(providerId: string, toolName: string): Array<AgentBridgeToolOption> {
    const tools: Array<AgentBridgeToolOption> = [];
    tools.push(new AgentBridgeToolOption(providerId + '.message', toolName, 'Sends a message through the local gateway adapter.', 'write'));
    tools.push(new AgentBridgeToolOption(providerId + '.session', 'Session History', 'Tracks sessions and imported messages for this provider.', 'read'));
    return tools;
  }
}

export class AgentBridgeClientBinaryCapabilities {
  terminal: boolean;
  fileTransfer: boolean;

  constructor(terminal: boolean = true, fileTransfer: boolean = true) {
    this.terminal = terminal;
    this.fileTransfer = fileTransfer;
  }
}

export class AgentBridgeClientCapabilities {
  terminalBinaryFrames: boolean;
  fileTransferBinaryFrames: boolean;
  terminalStreamProtocolVersion: number;
  binaryFrames: AgentBridgeClientBinaryCapabilities;

  constructor() {
    this.terminalBinaryFrames = true;
    this.fileTransferBinaryFrames = true;
    this.terminalStreamProtocolVersion = 2;
    this.binaryFrames = new AgentBridgeClientBinaryCapabilities(true, true);
  }
}

export class AgentBridgeHelloPayload {
  clientId: string;
  clientType: string;
  protocolVersion: string;
  appVersion: string;
  endpoint: string;
  appNonce: string;
  clientCapabilities: AgentBridgeClientCapabilities;
  hostProfileId: string;

  constructor(clientId: string, endpoint: string, appNonce: string, hostProfileId: string = '', appVersion: string = '') {
    this.clientId = clientId;
    this.clientType = 'mobile';
    this.protocolVersion = 'agent-bridge.v2';
    this.appVersion = appVersion;
    this.endpoint = endpoint;
    this.appNonce = appNonce;
    this.clientCapabilities = new AgentBridgeClientCapabilities();
    this.hostProfileId = hostProfileId;
  }
}

export class AgentBridgeProviderCatalogPayload {
  scope: string;
  cwd: string;
  force: boolean;

  constructor(scope: string, cwd: string, force: boolean) {
    this.scope = scope;
    this.cwd = cwd;
    this.force = force;
  }
}

export class AgentBridgeContextItem {
  kind: string;
  path: string;
  uri: string;
  title: string;
  content: string;
  mediaType: string;

  constructor(
    kind: string,
    path: string,
    uri: string,
    title: string,
    content: string = '',
    mediaType: string = ''
  ) {
    this.kind = kind;
    this.path = path;
    this.uri = uri;
    this.title = title;
    this.content = content;
    this.mediaType = mediaType;
  }
}

export class AgentBridgeAgentListPayload {
  includeArchived: boolean;

  constructor(includeArchived: boolean = false) {
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeAgentActionPayload {
  agentId: string;
  cascade: boolean;

  constructor(agentId: string, cascade: boolean = false) {
    this.agentId = agentId;
    this.cascade = cascade;
  }
}

export class AgentBridgeAgentForkPayload {
  agentId: string;
  checkpointId: string;
  title: string;
  parentAgentId: string;
  detached: boolean;
  workspaceMode: string;
  worktreePath: string;
  branch: string;
  startPoint: string;
  setupCommand: string;
  preview: boolean;
  confirm: boolean;
  forkPlanId: string;
  boundaryMessageId: string;
  timelineEpoch: number;
  timelineSeq: number;

  constructor(
    agentId: string,
    checkpointId: string = '',
    title: string = '',
    parentAgentId: string = '',
    detached: boolean = false,
    workspaceMode: string = 'shared',
    worktreePath: string = '',
    branch: string = '',
    startPoint: string = '',
    setupCommand: string = '',
    preview: boolean = false,
    confirm: boolean = false,
    forkPlanId: string = ''
  ) {
    this.agentId = agentId;
    this.checkpointId = checkpointId;
    this.title = title;
    this.parentAgentId = parentAgentId;
    this.detached = detached;
    this.workspaceMode = workspaceMode;
    this.worktreePath = worktreePath;
    this.branch = branch;
    this.startPoint = startPoint;
    this.setupCommand = setupCommand;
    this.preview = preview;
    this.confirm = confirm;
    this.forkPlanId = forkPlanId;
    this.boundaryMessageId = '';
    this.timelineEpoch = 0;
    this.timelineSeq = 0;
  }
}

export class AgentBridgeAgentForkResult {
  ok: boolean = false;
  preview: boolean = false;
  confirmed: boolean = false;
  forkPlanId: string = '';
  workspaceMode: string = 'shared';
  boundaryMessageId: string = '';
  boundaryCursor: string = '';
  timelineEpoch: number = 0;
  timelineSeq: number = 0;
  contextItemCount: number = 0;
  contextDigest: string = '';
  expiresAt: number = 0;
  warnings: Array<string> = [];
  failureCategory: string = '';
  message: string = '';
  agentJson: string = '';
}

export class AgentBridgeAgentCreatePayload {
  providerId: string;
  workspacePath: string;
  workspaceTitle: string;
  workspaceId: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  modeId: string;
  thinkingOptionId: string;

  constructor(
    providerId: string,
    workspacePath: string,
    workspaceTitle: string,
    workspaceId: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string
  ) {
    this.providerId = providerId;
    this.workspacePath = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.workspaceId = workspaceId;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.modeId = speedMode;
    this.thinkingOptionId = reasoningMode;
  }
}

export class AgentBridgeAgentRunPayload {
  agentId: string;
  providerId: string;
  workspacePath: string;
  workspaceTitle: string;
  workspaceId: string;
  text: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  interactionMode: string;
  interactionModes: Array<string>;
  agent: string;
  contextItems: Array<AgentBridgeContextItem>;
  clientMessageId: string;
  queuePolicy: string;
  composerTokensJson: string;
  forkSourceJson: string;

  constructor(
    agentId: string,
    providerId: string,
    workspacePath: string,
    workspaceTitle: string,
    workspaceId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    interactionMode: string,
    interactionModes: Array<string>,
    agent: string,
    contextItems: Array<AgentBridgeContextItem>
  ) {
    this.agentId = agentId;
    this.providerId = providerId;
    this.workspacePath = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.workspaceId = workspaceId;
    this.text = text;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.interactionMode = interactionMode;
    this.interactionModes = interactionModes;
    this.agent = agent;
    this.contextItems = contextItems;
    this.clientMessageId = '';
    this.queuePolicy = 'queue';
    this.composerTokensJson = '';
    this.forkSourceJson = '';
  }
}

export class AgentBridgeExperiencePayload {
  hostProfileId: string;
  sessionId: string;
  agentId: string;
  providerId: string;
  queueId: string;
  clientMessageId: string;
  kind: string;
  prompt: string;
  diffSummary: string;
  tokenLimit: number | undefined;
  costLimit: number | undefined;
  warningThreshold: number | undefined;
  currency: string;
  window: string;
  anchorAt: string;
  limit: number;
  format: string;
  maxBytes: number | undefined;
  requestId: string;
  timeoutMs: number | undefined;

  constructor(sessionId: string = '', agentId: string = '') {
    this.hostProfileId = '';
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.providerId = '';
    this.queueId = '';
    this.clientMessageId = '';
    this.kind = '';
    this.prompt = '';
    this.diffSummary = '';
    this.tokenLimit = undefined;
    this.costLimit = undefined;
    this.warningThreshold = undefined;
    this.currency = '';
    this.window = 'session';
    this.anchorAt = '';
    this.limit = 200;
    this.format = 'json';
    this.maxBytes = undefined;
    this.requestId = '';
    this.timeoutMs = undefined;
  }
}

export class AgentBridgeExperienceResult {
  ok: boolean;
  action: string;
  requestId: string;
  kind: string;
  suggestion: string;
  planId: string;
  sourceProvider: string;
  estimatedUsage: boolean;
  realTokens: number;
  estimatedTokens: number;
  realCost: number;
  estimatedCost: number;
  currency: string;
  eventCount: number;
  compactions: number;
  queueItemsJson: string;
  queueItemJson: string;
  usageEventsJson: string;
  usageEventJson: string;
  budgetJson: string;
  reportJson: string;
  failureCategory: string;
  message: string;
  preview: boolean;
  confirmed: boolean;
  cancelled: boolean;
  timeoutMs: number;
  alternativesJson: string;
  alternatives: Array<string>;
  warningsJson: string;
  warnings: Array<string>;
  remediation: string;
  hostProfileId: string;
  sessionId: string;
  agentId: string;
  window: string;
  windowStartAt: string;
  windowEndAt: string;
  usageSummary: AgentBridgeUsageSummaryRecord;
  providerUsage: AgentBridgeProviderUsageResult;
  budget: AgentBridgeUsageBudgetRecord;
  budgetWarnings: Array<AgentBridgeUsageBudgetWarningRecord>;
  diagnosticsReport: AgentBridgeDiagnosticsReport;
  queueItem: AgentBridgeMessageQueueItem;
  usageEvent: AgentBridgeUsageEventRecord;

  constructor() {
    this.ok = false;
    this.action = '';
    this.requestId = '';
    this.kind = '';
    this.suggestion = '';
    this.planId = '';
    this.sourceProvider = '';
    this.estimatedUsage = false;
    this.realTokens = -1;
    this.estimatedTokens = -1;
    this.realCost = -1;
    this.estimatedCost = -1;
    this.currency = '';
    this.eventCount = 0;
    this.compactions = 0;
    this.queueItemsJson = '';
    this.queueItemJson = '';
    this.usageEventsJson = '';
    this.usageEventJson = '';
    this.budgetJson = '';
    this.reportJson = '';
    this.failureCategory = '';
    this.message = '';
    this.preview = false;
    this.confirmed = false;
    this.cancelled = false;
    this.timeoutMs = 0;
    this.alternativesJson = '';
    this.alternatives = [];
    this.warningsJson = '';
    this.warnings = [];
    this.remediation = '';
    this.hostProfileId = '';
    this.sessionId = '';
    this.agentId = '';
    this.window = 'session';
    this.windowStartAt = '';
    this.windowEndAt = '';
    this.usageSummary = new AgentBridgeUsageSummaryRecord();
    this.providerUsage = new AgentBridgeProviderUsageResult();
    this.budget = new AgentBridgeUsageBudgetRecord();
    this.budgetWarnings = [];
    this.diagnosticsReport = new AgentBridgeDiagnosticsReport();
    this.queueItem = new AgentBridgeMessageQueueItem();
    this.usageEvent = new AgentBridgeUsageEventRecord();
  }
}

export class AgentBridgeMessageQueueItem {
  queueId: string = '';
  hostProfileId: string = '';
  sessionId: string = '';
  agentId: string = '';
  clientMessageId: string = '';
  status: string = '';
  attempts: number = 0;
  attemptId: string = '';
  attemptHistory: Array<AgentBridgeMessageQueueAttempt> = [];
  textPreview: string = '';
  failureCategory: string = '';
  message: string = '';
  createdAt: string = '';
  updatedAt: string = '';
}

export class AgentBridgeMessageQueueAttempt {
  attemptId: string = '';
  attemptNumber: number = 0;
  status: string = '';
  retryOfAttemptId: string = '';
  failureCategory: string = '';
  message: string = '';
  startedAt: string = '';
  completedAt: string = '';
}

export class AgentBridgeUsageEventRecord {
  hostProfileId: string = '';
  eventId: string = '';
  sessionId: string = '';
  agentId: string = '';
  providerId: string = '';
  source: string = '';
  currency: string = '';
  window: string = '';
  inputTokens: number = -1;
  outputTokens: number = -1;
  cacheReadTokens: number = -1;
  cacheWriteTokens: number = -1;
  reasoningTokens: number = -1;
  totalTokens: number = -1;
  cost: number = -1;
  quotaRemaining: number = -1;
  quotaLimit: number = -1;
  quotaResetAt: string = '';
  quotaSource: string = '';
  estimated: boolean = false;
  kind: string = '';
  beforeTokens: number = -1;
  afterTokens: number = -1;
  reason: string = '';
  occurredAt: string = '';
}

export class AgentBridgeUsageBudgetRecord {
  hostProfileId: string = '';
  sessionId: string = '';
  agentId: string = '';
  scopeKey: string = '';
  scopeType: string = '';
  tokenLimit: number = -1;
  costLimit: number = -1;
  currency: string = '';
  window: string = 'session';
  warning: boolean = false;
  warningThreshold: number = -1;
  updatedAt: string = '';
  isSet: boolean = false;
}

export class AgentBridgeUsageTokenTotals {
  inputTokens: number = -1;
  outputTokens: number = -1;
  cacheReadTokens: number = -1;
  cacheWriteTokens: number = -1;
  reasoningTokens: number = -1;
  totalTokens: number = -1;
}

export class AgentBridgeUsageCostRecord {
  currency: string = '';
  amount: number = -1;
}

export class AgentBridgeUsageAggregateRecord {
  eventCount: number = 0;
  tokens: AgentBridgeUsageTokenTotals = new AgentBridgeUsageTokenTotals();
  costs: Array<AgentBridgeUsageCostRecord> = [];
}

export class AgentBridgeUsageQuotaRecord {
  providerId: string = '';
  source: string = '';
  window: string = '';
  remaining: number = -1;
  limit: number = -1;
  resetAt: string = '';
  occurredAt: string = '';
}

export class AgentBridgeUsageCompactionRecord {
  eventId: string = '';
  providerId: string = '';
  estimated: boolean = false;
  beforeTokens: number = -1;
  afterTokens: number = -1;
  reason: string = '';
  occurredAt: string = '';
}

export class AgentBridgeUsageSummaryRecord {
  eventCount: number = 0;
  actual: AgentBridgeUsageAggregateRecord = new AgentBridgeUsageAggregateRecord();
  estimated: AgentBridgeUsageAggregateRecord = new AgentBridgeUsageAggregateRecord();
  actualCosts: Array<AgentBridgeUsageCostRecord> = [];
  estimatedCosts: Array<AgentBridgeUsageCostRecord> = [];
  quotas: Array<AgentBridgeUsageQuotaRecord> = [];
  compactions: number = 0;
  compactionEvents: Array<AgentBridgeUsageCompactionRecord> = [];
  window: string = 'session';
  windowStartAt: string = '';
  windowEndAt: string = '';
}

export class AgentBridgeProviderUsageWindowRecord {
  name: string = '';
  label: string = '';
  status: string = '';
  unit: string = '';
  remaining: number = -1;
  limit: number = -1;
  used: number = -1;
  resetAt: string = '';
}

export class AgentBridgeProviderUsageDetailRecord {
  key: string = '';
  label: string = '';
  value: string = '';
  status: string = '';
}

export class AgentBridgeProviderUsageResult {
  ok: boolean = false;
  action: string = '';
  providerId: string = '';
  hostProfileId: string = '';
  sessionId: string = '';
  agentId: string = '';
  window: string = 'session';
  status: string = 'unavailable';
  availabilityState: string = AgentBridgeProviderUsageAvailabilityState.UNSUPPORTED;
  planLabel: string = '';
  source: string = '';
  fetchedAt: string = '';
  expiresAt: string = '';
  stale: boolean = false;
  windows: Array<AgentBridgeProviderUsageWindowRecord> = [];
  details: Array<AgentBridgeProviderUsageDetailRecord> = [];
  warnings: Array<string> = [];
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
}

export class AgentBridgeUsageBudgetWarningRecord {
  hostProfileId: string = '';
  sessionId: string = '';
  agentId: string = '';
  window: string = 'session';
  windowStartAt: string = '';
  windowEndAt: string = '';
  warningThreshold: number = -1;
  reasons: Array<string> = [];
  currency: string = '';
  actualTokens: number = -1;
  actualCost: number = -1;
  emittedAt: string = '';
  budget: AgentBridgeUsageBudgetRecord = new AgentBridgeUsageBudgetRecord();
}

export class AgentBridgeRichContentNode {
  id: string;
  kind: string;
  text: string;
  language: string;
  url: string;
  workspaceId: string;
  path: string;
  displayName: string;
  line: number;
  lineCount: number;
  truncated: boolean;
  truncationReason: string;
  toolName: string;
  toolType: string;
  todoId: string;
  status: string;
  source: string;
  tokenized: boolean;
  tokens: Array<AgentBridgeRichContentToken>;

  constructor() {
    this.id = '';
    this.kind = 'fallback';
    this.text = '';
    this.language = '';
    this.url = '';
    this.workspaceId = '';
    this.path = '';
    this.displayName = '';
    this.line = 0;
    this.lineCount = 0;
    this.truncated = false;
    this.truncationReason = '';
    this.toolName = '';
    this.toolType = 'fallback';
    this.todoId = '';
    this.status = '';
    this.source = '';
    this.tokenized = false;
    this.tokens = [];
  }
}

export class AgentBridgeRichContentToken {
  kind: string = 'plain';
  text: string = '';
}

export class AgentBridgeAgentSendPayload {
  agentId: string;
  text: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  interactionMode: string;
  interactionModes: Array<string>;
  agent: string;
  contextItems: Array<AgentBridgeContextItem>;

  constructor(
    agentId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    interactionMode: string,
    interactionModes: Array<string>,
    agent: string,
    contextItems: Array<AgentBridgeContextItem>
  ) {
    this.agentId = agentId;
    this.text = text;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.interactionMode = interactionMode;
    this.interactionModes = interactionModes;
    this.agent = agent;
    this.contextItems = contextItems;
  }
}

export class AgentBridgeAgentUpdatePayload {
  agentId: string;
  title: string;
  workspaceTitle: string;

  constructor(agentId: string, title: string, workspaceTitle: string = '') {
    this.agentId = agentId;
    this.title = title;
    this.workspaceTitle = workspaceTitle;
  }
}

export class AgentBridgeAgentModeSetPayload {
  agentId: string;
  modeId: string;
  speedMode: string;
  thinkingOptionId: string;
  reasoningMode: string;

  constructor(agentId: string, modeId: string, thinkingOptionId: string = '') {
    this.agentId = agentId;
    this.modeId = modeId;
    this.speedMode = modeId;
    this.thinkingOptionId = thinkingOptionId;
    this.reasoningMode = thinkingOptionId;
  }
}

export class AgentBridgeAgentModelSetPayload {
  agentId: string;
  modelId: string;

  constructor(agentId: string, modelId: string) {
    this.agentId = agentId;
    this.modelId = modelId;
  }
}

export class AgentBridgeTimelineFetchPayload {
  agentId: string;
  cursor: string;
  direction: string;
  limit: number;

  constructor(agentId: string, cursor: string, direction: string = 'after', limit: number = 200) {
    this.agentId = agentId;
    this.cursor = cursor;
    this.direction = direction;
    this.limit = limit;
  }
}

export class AgentBridgeTimelineAckPayload {
  agentId: string;
  latestSeq: number;

  constructor(agentId: string, latestSeq: number) {
    this.agentId = agentId;
    this.latestSeq = latestSeq;
  }
}

export class AgentBridgeWorkspaceRegistryUpsertPayload {
  action: string;
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  workspaceTitle: string;
  title: string;
  kind: string;
  branch: string;
  dedupeByCwd: boolean;
  dryRun: boolean;
  preview: boolean;
  confirm: boolean;
  includeArchived: boolean;

  constructor(
    workspaceId: string,
    workspacePath: string,
    workspaceTitle: string,
    branch: string = '',
    dedupeByCwd: boolean = true,
    action: string = '',
    dryRun: boolean = false,
    preview: boolean = false,
    confirm: boolean = true,
    includeArchived: boolean = true
  ) {
    this.action = action;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.title = workspaceTitle;
    this.kind = 'directory';
    this.branch = branch;
    this.dedupeByCwd = dedupeByCwd;
    this.dryRun = dryRun;
    this.preview = preview;
    this.confirm = confirm;
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeWorkspaceRegistryWritePayload {
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  workspaceTitle: string;
  title: string;
  branch: string;
  dedupeByCwd: boolean;
  preview: boolean;
  confirm: boolean;
  includeArchived: boolean;

  constructor(
    workspaceId: string,
    workspacePath: string,
    workspaceTitle: string,
    branch: string = '',
    dedupeByCwd: boolean = true,
    preview: boolean = true,
    confirm: boolean = false,
    includeArchived: boolean = true
  ) {
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.title = workspaceTitle;
    this.branch = branch;
    this.dedupeByCwd = dedupeByCwd;
    this.preview = preview;
    this.confirm = confirm;
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeWorkspaceRegistryListPayload {
  includeArchived: boolean;
  limit: number;

  constructor(includeArchived: boolean = false, limit: number = 12) {
    this.includeArchived = includeArchived;
    this.limit = limit;
  }
}

export class AgentBridgeWorkspaceRegistryArchivePayload {
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  preview: boolean;
  confirm: boolean;
  includeArchived: boolean;

  constructor(workspaceId: string = '', workspacePath: string = '', preview: boolean = true, confirm: boolean = false, includeArchived: boolean = true) {
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.preview = preview;
    this.confirm = confirm;
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeWorkspaceRegistryOpenPayload {
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  preview: boolean;
  confirm: boolean;
  dryRun: boolean;
  includeArchived: boolean;

  constructor(workspaceId: string = '', workspacePath: string = '', preview: boolean = true, confirm: boolean = false, includeArchived: boolean = true) {
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.preview = preview;
    this.confirm = confirm;
    this.dryRun = !confirm;
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeTerminalListPayload {
  workspaceId: string;
  cwd: string;
  agentId: string;

  constructor(workspaceId: string = '', cwd: string = '', agentId: string = '') {
    this.workspaceId = workspaceId;
    this.cwd = cwd;
    this.agentId = agentId;
  }
}

export class AgentBridgeTerminalSubscribePayload {
  terminalId: string;
  agentId: string;
  streamProtocolVersion: number;
  lastAppliedRestoreSeq: number;
  lastAppliedSnapshotSeq: number;
  preserveAttention: boolean;

  constructor(
    terminalId: string,
    agentId: string = '',
    streamProtocolVersion: number = 1,
    lastAppliedRestoreSeq: number = 0,
    lastAppliedSnapshotSeq: number = 0,
    preserveAttention: boolean = false
  ) {
    this.terminalId = terminalId;
    this.agentId = agentId;
    this.streamProtocolVersion = streamProtocolVersion;
    this.lastAppliedRestoreSeq = lastAppliedRestoreSeq;
    this.lastAppliedSnapshotSeq = lastAppliedSnapshotSeq;
    this.preserveAttention = preserveAttention;
  }
}

export class AgentBridgeTerminalCreatePayload {
  terminalId: string;
  workspaceId: string;
  cwd: string;
  workspacePath: string;
  agentId: string;
  sessionId: string;
  name: string;
  rows: number;
  cols: number;

  constructor(
    workspaceId: string,
    cwd: string,
    agentId: string = '',
    sessionId: string = '',
    name: string = '',
    rows: number = 24,
    cols: number = 80,
    terminalId: string = ''
  ) {
    this.terminalId = terminalId;
    this.workspaceId = workspaceId;
    this.cwd = cwd;
    this.workspacePath = cwd;
    this.agentId = agentId;
    this.sessionId = sessionId;
    this.name = name;
    this.rows = rows;
    this.cols = cols;
  }
}

export class AgentBridgeTerminalActionPayload {
  terminalId: string;
  agentId: string;

  constructor(terminalId: string, agentId: string = '') {
    this.terminalId = terminalId;
    this.agentId = agentId;
  }
}

export class AgentBridgeTerminalRenamePayload {
  terminalId: string;
  name: string;
  agentId: string;

  constructor(terminalId: string, name: string, agentId: string = '') {
    this.terminalId = terminalId;
    this.name = name;
    this.agentId = agentId;
  }
}

export class AgentBridgeTerminalHookInstallPayload {
  action: string;
  confirm: boolean;
  force: boolean;

  constructor(force: boolean = false, action: string = 'install', confirm: boolean = false) {
    this.action = action;
    this.confirm = confirm;
    this.force = force;
  }
}

export class AgentBridgeCheckpointListPayload {
  agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }
}

export class AgentBridgeCheckpointCreatePayload {
  agentId: string;
  title: string;
  description: string;
  includeFiles: boolean;

  constructor(agentId: string, title: string = '', description: string = '', includeFiles: boolean = false) {
    this.agentId = agentId;
    this.title = title;
    this.description = description;
    this.includeFiles = includeFiles;
  }
}

export class AgentBridgeCheckpointRestorePayload {
  agentId: string;
  checkpointId: string;
  preRestoreSnapshotId: string;
  restorePlanId: string;
  restoreFiles: boolean;
  dryRun: boolean;
  confirm: boolean;
  forceConflicts: boolean;
  restoreRuntime: boolean;
  requireRuntimeRestore: boolean;
  restoreTerminal: boolean;

  constructor(
    agentId: string,
    checkpointId: string,
    restoreFiles: boolean = false,
    dryRun: boolean = false,
    confirm: boolean = false,
    forceConflicts: boolean = false,
    preRestoreSnapshotId: string = '',
    restorePlanId: string = '',
    restoreRuntime: boolean = false,
    requireRuntimeRestore: boolean = false,
    restoreTerminal: boolean = false
  ) {
    this.agentId = agentId;
    this.checkpointId = checkpointId;
    this.preRestoreSnapshotId = preRestoreSnapshotId;
    this.restorePlanId = restorePlanId;
    this.restoreFiles = restoreFiles;
    this.dryRun = dryRun;
    this.confirm = confirm;
    this.forceConflicts = forceConflicts;
    this.restoreRuntime = restoreRuntime;
    this.requireRuntimeRestore = requireRuntimeRestore;
    this.restoreTerminal = restoreTerminal;
  }
}

export class AgentBridgeFileTransferDownloadPayload {
  requestId: string;
  sessionId: string;
  workspaceId: string;
  path: string;
  parentPath: string;

  constructor(requestId: string, sessionId: string, workspaceId: string, path: string, parentPath: string = '') {
    this.requestId = requestId;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.path = path;
    this.parentPath = parentPath;
  }
}

export class AgentBridgeFileTransferUploadPayload {
  requestId: string;
  workspaceId: string;
  path: string;
  sizeBytes: number;
  size: number;
  sha256: string;
  overwrite: boolean;

  constructor(requestId: string, workspaceId: string, path: string, sizeBytes: number, sha256: string, overwrite: boolean = true) {
    this.requestId = requestId;
    this.workspaceId = workspaceId;
    this.path = path;
    this.sizeBytes = sizeBytes;
    this.size = sizeBytes;
    this.sha256 = sha256;
    this.overwrite = overwrite;
  }
}

export class AgentBridgeFileTransferCancelPayload {
  requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
  }
}

export class AgentBridgeCreateSessionPayload {
  providerId: string;
  workspacePath: string;
  workspaceTitle: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;

  constructor(providerId: string, workspacePath: string, workspaceTitle: string, modelId: string, speedMode: string, reasoningMode: string) {
    this.providerId = providerId;
    this.workspacePath = workspacePath;
    this.workspaceTitle = workspaceTitle;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
  }
}

export class AgentBridgeSendMessagePayload {
  sessionId: string;
  text: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  interactionMode: string;
  interactionModes: Array<string>;
  agent: string;
  contextItems: Array<AgentBridgeContextItem>;
  clientMessageId: string;
  queuePolicy: string;
  composerTokensJson: string;
  forkSourceJson: string;

  constructor(
    sessionId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    interactionMode: string,
    interactionModes: Array<string>,
    agent: string,
    contextItems: Array<AgentBridgeContextItem> = []
  ) {
    this.sessionId = sessionId;
    this.text = text;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.interactionMode = interactionMode;
    this.interactionModes = interactionModes;
    this.agent = agent;
    this.contextItems = contextItems;
    this.clientMessageId = '';
    this.queuePolicy = 'queue';
    this.composerTokensJson = '';
    this.forkSourceJson = '';
  }
}

export class AgentBridgeSessionRevertPayload {
  sessionId: string;
  messageId: string;

  constructor(sessionId: string, messageId: string) {
    this.sessionId = sessionId;
    this.messageId = messageId;
  }
}

export class AgentBridgeSessionAbortPayload {
  providerId: string;
  sessionId: string;
  remoteSessionId: string;

  constructor(providerId: string, sessionId: string, remoteSessionId: string) {
    this.providerId = providerId;
    this.sessionId = sessionId;
    this.remoteSessionId = remoteSessionId;
  }
}

export class AgentBridgePreviewPayload {
  sessionId: string;
  path: string;

  constructor(sessionId: string, path: string) {
    this.sessionId = sessionId;
    this.path = path;
  }
}

export class AgentBridgeEmptyPayload {
}

export class AgentBridgeSessionListPayload {
  providerId: string;

  constructor(providerId: string) {
    this.providerId = providerId;
  }
}

export class AgentBridgeSessionMessagesPayload {
  sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }
}

export class AgentBridgePermissionRespondPayload {
  providerId: string;
  sessionId: string;
  requestId: string;
  permissionId: string;
  reply: string;
  message: string;

  constructor(providerId: string, sessionId: string, requestId: string, permissionId: string, reply: string, message: string) {
    this.providerId = providerId;
    this.sessionId = sessionId;
    this.requestId = requestId;
    this.permissionId = permissionId;
    this.reply = reply;
    this.message = message;
  }
}

export class AgentBridgeRequestRespondPayload {
  providerId: string;
  sessionId: string;
  requestId: string;
  questionId: string;
  optionId: string;
  answer: string;
  message: string;

  constructor(
    providerId: string,
    sessionId: string,
    requestId: string,
    questionId: string,
    optionId: string,
    answer: string,
    message: string
  ) {
    this.providerId = providerId;
    this.sessionId = sessionId;
    this.requestId = requestId;
    this.questionId = questionId;
    this.optionId = optionId;
    this.answer = answer;
    this.message = message;
  }
}

export class AgentBridgePlanRespondPayload {
  providerId: string;
  sessionId: string;
  planId: string;
  reply: string;
  message: string;

  constructor(providerId: string, sessionId: string, planId: string, reply: string, message: string) {
    this.providerId = providerId;
    this.sessionId = sessionId;
    this.planId = planId;
    this.reply = reply;
    this.message = message;
  }
}

export class AgentBridgeOpenCodeRequestPayload {
  providerId: string;
  method: string;
  path: string;
  query: Object;
  body: Object | null;
  accept: string;

  constructor(providerId: string, method: string, path: string, query: Object, body: Object | null, accept: string) {
    this.providerId = providerId;
    this.method = method;
    this.path = path;
    this.query = query;
    this.body = body;
    this.accept = accept;
  }
}

export class AgentBridgeWorkspaceSessionPayload {
  sessionId: string;
  workspaceId: string;
  agentId: string;

  constructor(sessionId: string, workspaceId: string, agentId: string = '') {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.agentId = agentId;
  }
}

export class AgentBridgeWorkspacePathPayload {
  sessionId: string;
  workspaceId: string;
  path: string;
  parentPath: string;
  staged: boolean;
  agentId: string;
  fileCursor: number;
  fileLimit: number;
  lineOffset: number;
  lineLimit: number;
  maxBytes: number;

  constructor(sessionId: string, workspaceId: string, path: string, parentPath: string = '', staged: boolean = false, agentId: string = '') {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.path = path;
    this.parentPath = parentPath;
    this.staged = staged;
    this.agentId = agentId;
    this.fileCursor = 0;
    this.fileLimit = 50;
    this.lineOffset = 0;
    this.lineLimit = 2000;
    this.maxBytes = 524288;
  }
}

export class AgentBridgeWorkspaceDiffResult {
  ok: boolean = false;
  action: string = 'workspace.diff.get';
  sessionId: string = '';
  workspaceId: string = '';
  path: string = '';
  kind: string = 'file';
  staged: boolean = false;
  additions: number = 0;
  deletions: number = 0;
  changedFileCount: number = 1;
  diffText: string = '';
  fileCursor: number = 0;
  fileLimit: number = 50;
  nextFileCursor: number = -1;
  lineOffset: number = 0;
  lineLimit: number = 2000;
  nextLineOffset: number = -1;
  maxBytes: number = 524288;
  truncated: boolean = false;
  truncationReason: string = '';
  totalFiles: number = 0;
  totalLines: number = 0;
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  warnings: Array<string> = [];
  updatedAt: number = 0;
}

export class AgentBridgeAttachmentDownloadPayload {
  sessionId: string;
  path: string;
  kind: string;

  constructor(sessionId: string, path: string, kind: string) {
    this.sessionId = sessionId;
    this.path = path;
    this.kind = kind;
  }
}

export class AgentBridgeWorkspaceGitPathsPayload {
  sessionId: string;
  workspaceId: string;
  paths: Array<string>;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, paths: Array<string>, agentId: string = '',
    planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.paths = paths;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitCommitPayload {
  sessionId: string;
  workspaceId: string;
  message: string;
  agentId: string;

  constructor(sessionId: string, workspaceId: string, message: string, agentId: string = '') {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.message = message;
    this.agentId = agentId;
  }
}

export class AgentBridgeWorkspaceGitPullPayload {
  sessionId: string;
  workspaceId: string;
  remote: string;
  branch: string;
  ffOnly: boolean;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, remote: string = '', branch: string = '', ffOnly: boolean = true, agentId: string = '',
    planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.remote = remote;
    this.branch = branch;
    this.ffOnly = ffOnly;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitPushPayload {
  sessionId: string;
  workspaceId: string;
  remote: string;
  branch: string;
  force: boolean;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, remote: string = '', branch: string = '', force: boolean = false, agentId: string = '',
    planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.remote = remote;
    this.branch = branch;
    this.force = force;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitBranchPayload {
  sessionId: string;
  workspaceId: string;
  action: string;
  name: string;
  startPoint: string;
  force: boolean;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, action: string = 'list', name: string = '', startPoint: string = '', force: boolean = false,
    agentId: string = '', planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.action = action;
    this.name = name;
    this.startPoint = startPoint;
    this.force = force;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitStashPayload {
  sessionId: string;
  workspaceId: string;
  action: string;
  message: string;
  ref: string;
  includeUntracked: boolean;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, action: string = 'push', message: string = '', ref: string = '',
    includeUntracked: boolean = true, agentId: string = '', planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.action = action;
    this.message = message;
    this.ref = ref;
    this.includeUntracked = includeUntracked;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitMergePayload {
  sessionId: string;
  workspaceId: string;
  ref: string;
  branch: string;
  noCommit: boolean;
  ffOnly: boolean;
  agentId: string;
  planId: string;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, ref: string, noCommit: boolean = false, ffOnly: boolean = false, agentId: string = '',
    planId: string = '', confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.ref = ref;
    this.branch = ref;
    this.noCommit = noCommit;
    this.ffOnly = ffOnly;
    this.agentId = agentId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceGitSubscribePayload {
  sessionId: string;
  workspaceId: string;
  action: string;
  subscriptionId: string;
  intervalMs: number;
  enabled: boolean;
  agentId: string;

  constructor(sessionId: string, workspaceId: string, action: string = 'subscribe', subscriptionId: string = '', intervalMs: number = 5000, enabled: boolean = true, agentId: string = '') {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.action = action;
    this.subscriptionId = subscriptionId;
    this.intervalMs = intervalMs;
    this.enabled = enabled;
    this.agentId = agentId;
  }
}

export class AgentBridgeGitHubPayload {
  sessionId: string;
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  owner: string;
  repo: string;
  repository: string;
  apiBaseUrl: string;
  tokenEnv: string;
  remote: string;
  number: number;
  head: string;
  base: string;
  title: string;
  body: string;
  draft: boolean;
  sha: string;
  ref: string;
  mergeMethod: string;
  confirm: boolean;
  dryRun: boolean;
  keyword: string;
  state: string;
  labels: Array<string>;
  reviewers: Array<string>;
  accountId: string;
  hostProfileId: string;
  authSessionId: string;
  clientId: string;
  planId: string;
  preview: boolean;
  ready: boolean;
  page: number;
  perPage: number;
  subscriberId: string;
  watchId: string;
  intervalMs: number;
  filePath: string;
  uploadEndpoint: string;

  constructor(
    sessionId: string,
    workspaceId: string,
    workspacePath: string = '',
    owner: string = '',
    repo: string = ''
  ) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.owner = owner;
    this.repo = repo;
    this.repository = owner.length > 0 && repo.length > 0 ? owner + '/' + repo : '';
    this.apiBaseUrl = '';
    this.tokenEnv = 'GITHUB_TOKEN';
    this.remote = 'origin';
    this.number = 0;
    this.head = '';
    this.base = '';
    this.title = '';
    this.body = '';
    this.draft = false;
    this.sha = '';
    this.ref = '';
    this.mergeMethod = 'merge';
    this.confirm = false;
    this.dryRun = false;
    this.keyword = '';
    this.state = '';
    this.labels = [];
    this.reviewers = [];
    this.accountId = '';
    this.hostProfileId = '';
    this.authSessionId = '';
    this.clientId = '';
    this.planId = '';
    this.preview = true;
    this.ready = false;
    this.page = 1;
    this.perPage = 30;
    this.subscriberId = '';
    this.watchId = '';
    this.intervalMs = 30000;
    this.filePath = '';
    this.uploadEndpoint = '';
  }
}

export class AgentBridgeWorktreeListPayload {
  sessionId: string;
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  includeArchived: boolean;

  constructor(sessionId: string, workspaceId: string, workspacePath: string = '', includeArchived: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.includeArchived = includeArchived;
  }
}

export class AgentBridgeWorktreeCreatePayload {
  sessionId: string;
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  worktreePath: string;
  path: string;
  branch: string;
  startPoint: string;
  title: string;
  preview: boolean;
  confirm: boolean;
  sourceWorkspaceId: string;
  sourceRootPath: string;

  constructor(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    worktreePath: string,
    branch: string = '',
    startPoint: string = '',
    title: string = '',
    preview: boolean = true,
    confirm: boolean = false,
    sourceWorkspaceId: string = '',
    sourceRootPath: string = ''
  ) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.worktreePath = worktreePath;
    this.path = worktreePath;
    this.branch = branch;
    this.startPoint = startPoint;
    this.title = title;
    this.preview = preview;
    this.confirm = confirm;
    this.sourceWorkspaceId = sourceWorkspaceId;
    this.sourceRootPath = sourceRootPath;
  }
}

export class AgentBridgeWorktreeArchivePayload {
  sessionId: string;
  workspaceId: string;
  workspacePath: string;
  cwd: string;
  worktreePath: string;
  path: string;
  force: boolean;
  preview: boolean;
  confirm: boolean;

  constructor(sessionId: string, workspaceId: string, workspacePath: string, worktreePath: string, force: boolean = false, confirm: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.workspacePath = workspacePath;
    this.cwd = workspacePath;
    this.worktreePath = worktreePath;
    this.path = worktreePath;
    this.force = force;
    this.preview = !confirm;
    this.confirm = confirm;
  }
}

export class AgentBridgeProviderProfileUpsertPayload {
  profileId: string;
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  endpoint: string;
  binary: string;
  args: string;
  cwd: string;
  runtimeMode: string;
  env: Object;
  envProvided: boolean;
  baseProfileId: string;
  cloneFromProfileId: string;
  enabled: boolean;

  constructor(
    profileId: string,
    providerId: string,
    displayName: string,
    description: string = '',
    endpoint: string = '',
    binary: string = '',
    args: string = '',
    cwd: string = '',
    runtimeMode: string = 'oneshot',
    enabled: boolean = true,
    env: Object = new AgentBridgeProviderProfileEnvObject(),
    envProvided: boolean = false,
    baseProfileId: string = '',
    cloneFromProfileId: string = ''
  ) {
    this.profileId = profileId;
    this.id = profileId;
    this.providerId = providerId;
    this.displayName = displayName;
    this.description = description;
    this.endpoint = endpoint;
    this.binary = binary;
    this.args = args;
    this.cwd = cwd;
    this.runtimeMode = runtimeMode;
    this.env = env;
    this.envProvided = envProvided;
    this.baseProfileId = baseProfileId;
    this.cloneFromProfileId = cloneFromProfileId;
    this.enabled = enabled;
  }
}

export class AgentBridgeProviderProfileClonePayload {
  profileId: string;
  id: string;
  displayName: string;
  baseProfileId: string;
  cloneFromProfileId: string;

  constructor(sourceProfileId: string, profileId: string, displayName: string = '') {
    this.profileId = profileId;
    this.id = profileId;
    this.displayName = displayName;
    this.baseProfileId = sourceProfileId;
    this.cloneFromProfileId = sourceProfileId;
  }
}

export class AgentBridgeProviderProfileDeletePayload {
  profileId: string;
  id: string;

  constructor(profileId: string) {
    this.profileId = profileId;
    this.id = profileId;
  }
}

export class AgentBridgeProviderProfileTestPayload {
  profileId: string;
  id: string;
  runCommand: boolean;
  testArgs: string;
  timeoutMs: number;

  constructor(profileId: string, runCommand: boolean = false, testArgs: string = '', timeoutMs: number = 3000) {
    this.profileId = profileId;
    this.id = profileId;
    this.runCommand = runCommand;
    this.testArgs = testArgs;
    this.timeoutMs = timeoutMs;
  }
}

export class AgentBridgeProviderAcpDiscoverPayload {
  catalogPath: string;
  directory: string;
  cwd: string;

  constructor(catalogPath: string = '', directory: string = '') {
    this.catalogPath = catalogPath;
    this.directory = directory;
    this.cwd = directory;
  }
}

export class AgentBridgeProviderAcpImportPayload {
  catalogPath: string;
  directory: string;
  cwd: string;
  profileIds: Array<string>;
  selectedProfileIds: Array<string>;
  confirm: boolean;
  duplicatePolicy: string;

  constructor(
    catalogPath: string = '',
    directory: string = '',
    profileIds: Array<string> = [],
    confirm: boolean = false,
    duplicatePolicy: string = 'skip'
  ) {
    this.catalogPath = catalogPath;
    this.directory = directory;
    this.cwd = directory;
    this.profileIds = profileIds;
    this.selectedProfileIds = profileIds;
    this.confirm = confirm;
    this.duplicatePolicy = duplicatePolicy === 'replace' ? 'replace' : 'skip';
  }
}

export class AgentBridgeProviderDirectoryListPayload {
  query: string;
  providerId: string;

  constructor(query: string = '', providerId: string = '') {
    this.query = query;
    this.providerId = providerId;
  }
}

export class AgentBridgeProviderDirectoryRefreshPayload {
  url: string;

  constructor(url: string) {
    this.url = url;
  }
}

export class AgentBridgeProviderDirectoryInstallPayload {
  providerId: string;
  planId: string;
  confirm: boolean;

  constructor(providerId: string, planId: string = '', confirm: boolean = false) {
    this.providerId = providerId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeProviderDirectoryRemovePayload {
  providerId: string;
  profileId: string;
  planId: string;
  confirm: boolean;

  constructor(
    providerId: string,
    profileId: string = '',
    planId: string = '',
    confirm: boolean = false
  ) {
    this.providerId = providerId;
    this.profileId = profileId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeProviderDirectoryStatusPayload {
  providerId: string;
  constructor(providerId: string = '') { this.providerId = providerId; }
}

export class AgentBridgeProviderDirectoryRollbackPayload {
  providerId: string;
  planId: string;
  confirm: boolean;
  constructor(providerId: string, planId: string = '', confirm: boolean = false) {
    this.providerId = providerId;
    this.planId = planId;
    this.confirm = confirm;
  }
}

export class AgentBridgeWorkspaceServiceQueryPayload {
  serviceId: string;
  workspaceId: string;
  ownerAgentId: string;
  maxBytes: number;
  planId: string;
  confirm: boolean;

  constructor(serviceId: string = '', workspaceId: string = '', ownerAgentId: string = '') {
    this.serviceId = serviceId;
    this.workspaceId = workspaceId;
    this.ownerAgentId = ownerAgentId;
    this.maxBytes = 65536;
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeWorkspaceServiceWritePayload {
  serviceId: string;
  name: string;
  workspaceId: string;
  ownerAgentId: string;
  command: string;
  args: Array<string>;
  cwd: string;
  port: number;
  protocol: string;
  healthKind: string;
  healthPath: string;
  healthTimeoutMs: number;
  visibility: string;
  authMode: string;
  authEnvironmentVariable: string;
  lifecycle: string;
  environmentNames: Array<string>;
  planId: string;
  confirm: boolean;

  constructor(service: AgentBridgeWorkspaceServiceRecord = new AgentBridgeWorkspaceServiceRecord()) {
    this.serviceId = service.serviceId;
    this.name = service.name;
    this.workspaceId = service.workspaceId;
    this.ownerAgentId = service.ownerAgentId;
    this.command = service.command;
    this.args = [];
    this.cwd = service.cwd;
    this.port = service.port;
    this.protocol = service.protocol;
    this.healthKind = service.health.ok ? 'http' : 'tcp';
    this.healthPath = '';
    this.healthTimeoutMs = 1500;
    this.visibility = service.visibility;
    this.authMode = service.auth.mode;
    this.authEnvironmentVariable = service.auth.environmentVariable;
    this.lifecycle = service.lifecycle;
    this.environmentNames = [];
    this.planId = '';
    this.confirm = false;
  }
}

export class AgentBridgeBrowserPayload {
  workspaceId: string = '';
  agentId: string = '';
  hostId: string = '';
  instanceId: string = '';
  pageId: string = '';
  profile: string = '';
  url: string = '';
  operation: string = 'navigate';
  action: string = '';
  ref: string = '';
  sourceRef: string = '';
  targetRef: string = '';
  value: string = '';
  text: string = '';
  key: string = '';
  functionSource: string = '';
  filePaths: Array<string> = [];
  domains: Array<string> = [];
  deltaX: number = 0;
  deltaY: number = 0;
  timeoutMs: number = 30000;
  maxEntries: number = 100;
  fullPage: boolean = false;
  planId: string = '';
  confirm: boolean = false;
}

export class AgentBridgeNotificationListPayload {
  includeRead: boolean;
  limit: number;

  constructor(includeRead: boolean = true, limit: number = 100) {
    this.includeRead = includeRead;
    this.limit = limit;
  }
}

export class AgentBridgeNotificationReadPayload {
  notificationId: string;
  read: boolean;

  constructor(notificationId: string, read: boolean = true) {
    this.notificationId = notificationId;
    this.read = read;
  }
}

export class AgentBridgeNotificationActionPayload {
  notificationId: string;
  actionId: string;

  constructor(notificationId: string, actionId: string = 'open') {
    this.notificationId = notificationId;
    this.actionId = actionId;
  }
}

export class AgentBridgeNotificationPrunePayload {
  includeRead: boolean;
  nowMs: number;

  constructor(includeRead: boolean = true, nowMs: number = 0) {
    this.includeRead = includeRead;
    this.nowMs = nowMs > 0 ? nowMs : Date.now();
  }
}

export class AgentBridgePushStatusPayload {
  deviceId: string;
  includeDisabled: boolean;

  constructor(deviceId: string = '', includeDisabled: boolean = true) {
    this.deviceId = deviceId;
    this.includeDisabled = includeDisabled;
  }
}

export class AgentBridgePushRegisterPayload {
  token: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  enabled: boolean;

  constructor(token: string, deviceId: string, platform: string = 'harmonyos', appVersion: string = '') {
    this.token = token;
    this.deviceId = deviceId;
    this.platform = platform;
    this.appVersion = appVersion;
    this.enabled = true;
  }
}

export class AgentBridgePushUnregisterPayload {
  subscriptionId: string;
  deviceId: string;
  tokenFingerprint: string;

  constructor(subscriptionId: string = '', deviceId: string = '', tokenFingerprint: string = '') {
    this.subscriptionId = subscriptionId;
    this.deviceId = deviceId;
    this.tokenFingerprint = tokenFingerprint;
  }
}

export class AgentBridgeDaemonLogsPayload {
  maxBytes: number;

  constructor(maxBytes: number = 65536) {
    this.maxBytes = maxBytes;
  }
}

export class AgentBridgeDaemonAutostartPayload {
  enabled: boolean;
  method: string;
  confirm: boolean;

  constructor(enabled: boolean, method: string = 'auto', confirm: boolean = false) {
    this.enabled = enabled;
    this.method = method;
    this.confirm = confirm;
  }
}

export class AgentBridgeDaemonAutostartPreviewPayload {
  method: string;

  constructor(method: string = 'auto') {
    this.method = method;
  }
}

export class AgentBridgeDaemonAutostartActionPayload {
  method: string;
  confirm: boolean;

  constructor(method: string = 'auto', confirm: boolean = false) {
    this.method = method;
    this.confirm = confirm;
  }
}

export class AgentBridgeDaemonUpdateQueryPayload {
  channel: string;
  version: string;

  constructor(channel: string = 'latest', version: string = '') {
    this.channel = channel;
    this.version = version;
  }
}

export class AgentBridgeDaemonUpdateInstallPayload {
  channel: string;
  version: string;
  confirm: boolean;
  force: boolean;
  allowLifecycleScripts: boolean;
  expectedInstanceId: string;
  expectedGeneration: number;
  hostProfileId: string;

  constructor(
    channel: string = 'latest',
    version: string = '',
    confirm: boolean = false,
    force: boolean = false
  ) {
    this.channel = channel;
    this.version = version;
    this.confirm = confirm;
    this.force = force;
    this.allowLifecycleScripts = false;
    this.expectedInstanceId = '';
    this.expectedGeneration = 0;
    this.hostProfileId = '';
  }
}

export class AgentBridgeDaemonUpdateRollbackPayload {
  confirm: boolean;
  allowLifecycleScripts: boolean;
  expectedInstanceId: string;
  expectedGeneration: number;
  hostProfileId: string;

  constructor(confirm: boolean = false) {
    this.confirm = confirm;
    this.allowLifecycleScripts = false;
    this.expectedInstanceId = '';
    this.expectedGeneration = 0;
    this.hostProfileId = '';
  }
}

export class AgentBridgeSecurityDeviceActionPayload {
  physicalDeviceId: string;
  deviceId: string;
  publicKeyFingerprint: string;
  displayName: string;

  constructor(physicalDeviceId: string = '', publicKeyFingerprint: string = '', displayName: string = '') {
    this.physicalDeviceId = physicalDeviceId;
    this.deviceId = physicalDeviceId;
    this.publicKeyFingerprint = publicKeyFingerprint;
    this.displayName = displayName;
  }
}

export class AgentBridgeVoicePayload {
  sessionId: string;
  mode: string;
  language: string;
  sequence: number;
  audioBase64: string;
  sampleRate: number;
  channels: number;
  sampleBits: number;
  text: string;
  reason: string;
  requestId: string;
  clientRequestId: string;

  constructor(
    sessionId: string = '',
    language: string = '',
    sequence: number = 0,
    audioBase64: string = '',
    text: string = '',
    reason: string = '',
    clientRequestId: string = ''
  ) {
    this.sessionId = sessionId;
    this.mode = '';
    this.language = language;
    this.sequence = sequence;
    this.audioBase64 = audioBase64;
    this.sampleRate = 16000;
    this.channels = 1;
    this.sampleBits = 16;
    this.text = text;
    this.reason = reason;
    this.requestId = '';
    this.clientRequestId = clientRequestId;
  }
}

export class AgentBridgeVoiceRetentionPolicy {
  policy: string = 'unknown';
  source: string = 'unknown';
  durationSeconds: number = 0;
  hasDuration: boolean = false;
}

export class AgentBridgeVoiceDataFlow {
  dataForwarded: boolean = false;
  retention: AgentBridgeVoiceRetentionPolicy = new AgentBridgeVoiceRetentionPolicy();
}

export class AgentBridgeVoicePrivacyRecord {
  status: string = 'unknown';
  userNoticeRequired: boolean = false;
  speechToText: AgentBridgeVoiceDataFlow = new AgentBridgeVoiceDataFlow();
  textToSpeech: AgentBridgeVoiceDataFlow = new AgentBridgeVoiceDataFlow();
}

export class AgentBridgeVoiceCapabilityRecord {
  recording: boolean = false;
  transcription: boolean = false;
  textToSpeech: boolean = false;
  vad: boolean = false;
  audioCapture: boolean = false;
  audioPlayback: boolean = false;
  remoteSpeechToText: boolean = false;
  remoteTextToSpeech: boolean = false;
  interruptionHandling: boolean = false;
}

export class AgentBridgeVoiceResult {
  action: string = '';
  ok: boolean = false;
  sessionId: string = '';
  mode: string = '';
  provider: string = '';
  state: string = '';
  sequence: number = 0;
  transcript: string = '';
  isFinal: boolean = false;
  isLast: boolean = false;
  vadActive: boolean = false;
  ttsState: string = '';
  ttsRequestId: string = '';
  clientRequestId: string = '';
  audioBase64: string = '';
  audioBytes: number = 0;
  mimeType: string = '';
  format: string = '';
  sampleRate: number = 0;
  channels: number = 0;
  sampleBits: number = 0;
  durationMs: number = 0;
  failureCategory: string = '';
  message: string = '';
  remediation: string = '';
  warnings: Array<string> = [];
  updatedAt: string = '';
  capabilities: AgentBridgeVoiceCapabilityRecord = new AgentBridgeVoiceCapabilityRecord();
  privacyStatusAvailable: boolean = false;
  privacy: AgentBridgeVoicePrivacyRecord = new AgentBridgeVoicePrivacyRecord();
}

export class AgentBridgeRequestEnvelope {
  id: string;
  type: string;
  payload: Object;

  constructor(id: string, type: string, payload: Object) {
    this.id = id;
    this.type = type;
    this.payload = payload;
  }
}

export class AgentBridgeTimelineItem {
  id: string;
  kind: string;
  title: string;
  text: string;
  createdAt: number;

  constructor(id: string, kind: string, title: string, text: string, createdAt: number) {
    this.id = id;
    this.kind = kind;
    this.title = title;
    this.text = text;
    this.createdAt = createdAt;
  }
}

export class AgentBridgeBinaryFrameCodec {
  static decode(frame: ArrayBuffer): AgentBridgeBinaryFrame {
    const result = new AgentBridgeBinaryFrame();
    const bytes = new Uint8Array(frame);
    if (bytes.length <= 0) {
      return result;
    }
    const opcode = bytes[0];
    if (AgentBridgeBinaryFrameCodec.isTerminalOpcode(opcode)) {
      const terminalFrame = AgentBridgeBinaryFrameCodec.decodeTerminalFrame(bytes);
      if (terminalFrame !== null) {
        result.kind = AgentBridgeBinaryFrameKind.TERMINAL;
        result.terminalFrame = terminalFrame;
      }
      return result;
    }
    if (AgentBridgeBinaryFrameCodec.isFileTransferOpcode(opcode)) {
      const fileFrame = AgentBridgeBinaryFrameCodec.decodeFileTransferFrame(bytes);
      if (fileFrame !== null) {
        result.kind = AgentBridgeBinaryFrameKind.FILE_TRANSFER;
        result.fileTransferFrame = fileFrame;
      }
      return result;
    }
    return result;
  }

  static encodeTerminalTextFrame(opcode: number, slot: number, text: string): ArrayBuffer {
    return AgentBridgeBinaryFrameCodec.encodeTerminalFrame(opcode, slot, AgentBridgeBinaryFrameCodec.encodeUtf8(text));
  }

  static encodeTerminalFrame(opcode: number, slot: number, payload: ArrayBuffer): ArrayBuffer {
    if (!AgentBridgeBinaryFrameCodec.isTerminalOpcode(opcode) || slot < 0 || slot > 255) {
      return new ArrayBuffer(0);
    }
    const payloadBytes = new Uint8Array(payload);
    const output = new Uint8Array(2 + payloadBytes.length);
    output[0] = opcode;
    output[1] = slot;
    output.set(payloadBytes, 2);
    return AgentBridgeBinaryFrameCodec.copyBytesToBuffer(output);
  }

  static encodeFileBeginFrame(requestId: string, metadata: AgentBridgeFileTransferMetadata): ArrayBuffer {
    const requestBytes = AgentBridgeBinaryFrameCodec.encodeUtf8(requestId);
    if (requestBytes.byteLength <= 0 || requestBytes.byteLength > 255) {
      return new ArrayBuffer(0);
    }
    const metadataText = JSON.stringify(metadata);
    const metadataBytes = AgentBridgeBinaryFrameCodec.encodeUtf8(metadataText);
    if (metadataBytes.byteLength > 65535) {
      return new ArrayBuffer(0);
    }
    const requestView = new Uint8Array(requestBytes);
    const metadataView = new Uint8Array(metadataBytes);
    const output = new Uint8Array(4 + requestView.length + metadataView.length);
    output[0] = AgentBridgeFileTransferOpcode.BEGIN;
    output[1] = requestView.length;
    output.set(requestView, 2);
    const metadataLengthOffset = 2 + requestView.length;
    output[metadataLengthOffset] = Math.floor(metadataView.length / 256);
    output[metadataLengthOffset + 1] = metadataView.length % 256;
    output.set(metadataView, metadataLengthOffset + 2);
    return AgentBridgeBinaryFrameCodec.copyBytesToBuffer(output);
  }

  static encodeFileChunkFrame(requestId: string, payload: ArrayBuffer): ArrayBuffer {
    return AgentBridgeBinaryFrameCodec.encodeFilePayloadFrame(AgentBridgeFileTransferOpcode.CHUNK, requestId, payload);
  }

  static encodeFileEndFrame(requestId: string): ArrayBuffer {
    return AgentBridgeBinaryFrameCodec.encodeFilePayloadFrame(AgentBridgeFileTransferOpcode.END, requestId, new ArrayBuffer(0));
  }

  static encodeFileCancelFrame(requestId: string, message: string): ArrayBuffer {
    return AgentBridgeBinaryFrameCodec.encodeFilePayloadFrame(
      AgentBridgeFileTransferOpcode.CANCEL,
      requestId,
      AgentBridgeBinaryFrameCodec.encodeUtf8(message)
    );
  }

  static terminalFrameText(frame: AgentBridgeTerminalFrame): string {
    return AgentBridgeBinaryFrameCodec.decodeUtf8(frame.payload);
  }

  static decodeTerminalSnapshotEnvelope(frame: AgentBridgeTerminalFrame): AgentBridgeTerminalSnapshotEnvelope {
    const result = new AgentBridgeTerminalSnapshotEnvelope();
    const bytes = new Uint8Array(frame.payload);
    if (
      bytes.length < 13 || bytes[0] !== 78 || bytes[1] !== 71 ||
        bytes[2] !== 70 || bytes[3] !== 50
    ) {
      result.text = AgentBridgeBinaryFrameCodec.decodeUtf8(frame.payload);
      return result;
    }
    result.sequenced = true;
    result.restoreSeq = AgentBridgeBinaryFrameCodec.readUint32(bytes, 4);
    result.snapshotSeq = AgentBridgeBinaryFrameCodec.readUint32(bytes, 8);
    const flags = bytes[12];
    result.truncated = flags % 2 === 1;
    result.source = Math.floor(flags / 2) % 2 === 1 ? 'persisted' : 'memory';
    result.text = AgentBridgeBinaryFrameCodec.decodeUtf8(
      AgentBridgeBinaryFrameCodec.copyRangeToBuffer(bytes, 13, bytes.length - 13)
    );
    return result;
  }

  static fileFrameText(frame: AgentBridgeFileTransferFrame): string {
    return AgentBridgeBinaryFrameCodec.decodeUtf8(frame.payload);
  }

  static encodeUtf8(text: string): ArrayBuffer {
    const encoder: util.TextEncoder = new util.TextEncoder();
    const bytes: Uint8Array = encoder.encodeInto(text);
    return AgentBridgeBinaryFrameCodec.copyBytesToBuffer(bytes);
  }

  static decodeUtf8(buffer: ArrayBuffer): string {
    if (buffer.byteLength <= 0) {
      return '';
    }
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    return decoder.decodeToString(new Uint8Array(buffer));
  }

  private static encodeFilePayloadFrame(opcode: number, requestId: string, payload: ArrayBuffer): ArrayBuffer {
    const requestBytes = AgentBridgeBinaryFrameCodec.encodeUtf8(requestId);
    if (requestBytes.byteLength <= 0 || requestBytes.byteLength > 255) {
      return new ArrayBuffer(0);
    }
    const requestView = new Uint8Array(requestBytes);
    const payloadView = new Uint8Array(payload);
    const output = new Uint8Array(2 + requestView.length + payloadView.length);
    output[0] = opcode;
    output[1] = requestView.length;
    output.set(requestView, 2);
    output.set(payloadView, 2 + requestView.length);
    return AgentBridgeBinaryFrameCodec.copyBytesToBuffer(output);
  }

  private static decodeTerminalFrame(bytes: Uint8Array): AgentBridgeTerminalFrame | null {
    if (bytes.length < 2) {
      return null;
    }
    const payload = AgentBridgeBinaryFrameCodec.copyRangeToBuffer(bytes, 2, bytes.length - 2);
    return new AgentBridgeTerminalFrame(bytes[0], bytes[1], payload);
  }

  private static readUint32(bytes: Uint8Array, offset: number): number {
    if (offset < 0 || offset + 4 > bytes.length) {
      return 0;
    }
    return bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
  }

  private static decodeFileTransferFrame(bytes: Uint8Array): AgentBridgeFileTransferFrame | null {
    if (bytes.length < 2) {
      return null;
    }
    const opcode = bytes[0];
    const requestIdLength = bytes[1];
    if (requestIdLength <= 0 || bytes.length < 2 + requestIdLength) {
      return null;
    }
    const requestId = AgentBridgeBinaryFrameCodec.decodeUtf8(
      AgentBridgeBinaryFrameCodec.copyRangeToBuffer(bytes, 2, requestIdLength)
    );
    const bodyStart = 2 + requestIdLength;
    if (opcode === AgentBridgeFileTransferOpcode.BEGIN) {
      if (bytes.length < bodyStart + 2) {
        return null;
      }
      const metadataLength = bytes[bodyStart] * 256 + bytes[bodyStart + 1];
      if (bytes.length !== bodyStart + 2 + metadataLength) {
        return null;
      }
      const metadataJson = AgentBridgeBinaryFrameCodec.decodeUtf8(
        AgentBridgeBinaryFrameCodec.copyRangeToBuffer(bytes, bodyStart + 2, metadataLength)
      );
      return new AgentBridgeFileTransferFrame(
        opcode,
        requestId,
        AgentBridgeIncomingParser.parseFileTransferMetadata(metadataJson),
        new ArrayBuffer(0)
      );
    }
    if (opcode === AgentBridgeFileTransferOpcode.END && bytes.length !== bodyStart) {
      return null;
    }
    const payload = AgentBridgeBinaryFrameCodec.copyRangeToBuffer(bytes, bodyStart, bytes.length - bodyStart);
    return new AgentBridgeFileTransferFrame(opcode, requestId, new AgentBridgeFileTransferMetadata(), payload);
  }

  private static isTerminalOpcode(opcode: number): boolean {
    return opcode === AgentBridgeTerminalFrameOpcode.OUTPUT ||
      opcode === AgentBridgeTerminalFrameOpcode.INPUT ||
      opcode === AgentBridgeTerminalFrameOpcode.RESIZE ||
      opcode === AgentBridgeTerminalFrameOpcode.SNAPSHOT ||
      opcode === AgentBridgeTerminalFrameOpcode.RESTORE ||
      opcode === AgentBridgeTerminalFrameOpcode.MOUSE;
  }

  private static isFileTransferOpcode(opcode: number): boolean {
    return opcode === AgentBridgeFileTransferOpcode.BEGIN ||
      opcode === AgentBridgeFileTransferOpcode.CHUNK ||
      opcode === AgentBridgeFileTransferOpcode.END ||
      opcode === AgentBridgeFileTransferOpcode.CANCEL;
  }

  private static copyRangeToBuffer(source: Uint8Array, start: number, length: number): ArrayBuffer {
    if (length <= 0) {
      return new ArrayBuffer(0);
    }
    const output = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
      output[index] = source[start + index];
    }
    return AgentBridgeBinaryFrameCodec.copyBytesToBuffer(output);
  }

  private static copyBytesToBuffer(source: Uint8Array): ArrayBuffer {
    const output = new ArrayBuffer(source.length);
    const target = new Uint8Array(output);
    target.set(source);
    return output;
  }
}

export class AgentBridgeParsedMessage {
  envelopeType: string = AgentBridgeEnvelopeType.RAW;
  eventType: string = '';
  sessionId: string = '';
  role: string = '';
  text: string = '';
  reasoningText: string = '';
  contentKind: string = '';
  messageId: string = '';
  partId: string = '';
  agentName: string = '';
  contentNodesJson: string = '';
  timelineEpoch: number = 0;
  timelineSeq: number = 0;
  durableMessageId: boolean = false;
  toolCallId: string = '';
  toolName: string = '';
  toolStatus: string = '';
  toolInputText: string = '';
  toolOutputText: string = '';
  toolErrorText: string = '';
  rawJson: string = '';
  previewPath: string = '';
  previewMediaType: string = '';
  previewContent: string = '';
  downloadPath: string = '';
  downloadToken: string = '';
  downloadFilePath: string = '';
  fileName: string = '';
  sizeBytes: number = 0;
  requestId: string = '';
  requestKind: string = '';
  requestTitle: string = '';
  requestPrompt: string = '';
  requestStatus: string = '';
  requestAnswer: string = '';
  requestOptionId: string = '';
  planId: string = '';
  planTitle: string = '';
  planContent: string = '';
  planStatus: string = '';
  planMessage: string = '';
  errorMessage: string = '';
  isOk: boolean = true;
}

export class AgentBridgeIncomingParser {
  static parse(source: string): AgentBridgeParsedMessage {
    const parsed = new AgentBridgeParsedMessage();
    const propertyIndex = AgentBridgeIncomingParser.collectPropertyValueStarts(source);
    parsed.envelopeType = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'type');
    if (parsed.envelopeType.length === 0) {
      parsed.envelopeType = AgentBridgeEnvelopeType.RAW;
    }
    parsed.requestId = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'id');
    parsed.eventType = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'event');
    parsed.sessionId = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'sessionId');
    const payloadObject = AgentBridgeIncomingParser.shouldUseNestedObjectScan(source)
      ? AgentBridgeIncomingParser.extractObjectProperty(source, 'payload')
      : '';
    parsed.role = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'role');
    parsed.text = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'text')
    );
    parsed.reasoningText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'reasoningText')
    );
    parsed.contentKind = AgentBridgeIncomingParser.extractContentKind(source);
    parsed.messageId = AgentBridgeIncomingParser.extractMessageId(source);
    parsed.partId = AgentBridgeIncomingParser.extractPartId(source);
    parsed.agentName = AgentBridgeIncomingParser.extractIndexedAgentNameValue(source, propertyIndex);
    parsed.contentNodesJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'contentNodes');
    parsed.timelineEpoch = AgentBridgeIncomingParser.extractIndexedNumberProperty(
      source,
      propertyIndex,
      'timelineEpoch',
      0
    );
    parsed.timelineSeq = AgentBridgeIncomingParser.extractIndexedNumberProperty(source, propertyIndex, 'timelineSeq', 0);
    parsed.durableMessageId = AgentBridgeIncomingParser.extractBooleanProperty(source, 'durableMessageId');
    parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'toolCallId');
    if (parsed.toolCallId.length === 0) {
      parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'tool_call_id');
    }
    if (parsed.toolCallId.length === 0) {
      parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'toolUseId');
    }
    if (parsed.toolCallId.length === 0) {
      parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'tool_use_id');
    }
    if (parsed.toolCallId.length === 0) {
      parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'call_id');
    }
    if (parsed.toolCallId.length === 0) {
      parsed.toolCallId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'callID');
    }
    parsed.toolName = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'name');
    if (parsed.toolName.length === 0) {
      parsed.toolName = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'toolName');
    }
    parsed.toolStatus = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'status');
    parsed.toolInputText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstPairStringProperty(payloadObject, source, propertyIndex, 'inputText', 'input')
    );
    parsed.toolOutputText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstPairStringProperty(payloadObject, source, propertyIndex, 'outputText', 'output')
    );
    parsed.toolErrorText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstPairStringProperty(payloadObject, source, propertyIndex, 'errorText', 'error')
    );
    parsed.rawJson = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'rawJson')
    );
    const previewObject = payloadObject.length > 0
      ? AgentBridgeIncomingParser.extractObjectProperty(payloadObject, 'preview')
      : (AgentBridgeIncomingParser.shouldUseNestedObjectScan(source)
        ? AgentBridgeIncomingParser.extractObjectProperty(source, 'preview')
        : '');
    parsed.previewPath = AgentBridgeIncomingParser.extractStringProperty(previewObject, 'path');
    parsed.previewMediaType = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(previewObject, source, propertyIndex, 'mediaType');
    parsed.previewContent = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(previewObject, source, propertyIndex, 'content')
    );
    parsed.downloadPath = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'downloadPath');
    parsed.downloadToken = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'token');
    parsed.downloadFilePath = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'path');
    parsed.fileName = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'fileName');
    parsed.sizeBytes = AgentBridgeIncomingParser.extractIndexedNumberProperty(source, propertyIndex, 'sizeBytes', 0);
    if (parsed.requestId.length === 0) {
      parsed.requestId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'requestId');
    }
    parsed.requestKind = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'kind');
    parsed.requestTitle = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'title');
    parsed.requestPrompt = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'prompt')
    );
    parsed.requestStatus = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'status');
    parsed.requestAnswer = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'answer')
    );
    parsed.requestOptionId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'optionId');
    parsed.planId = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'planId');
    if (parsed.planId.length === 0 && payloadObject.length > 0) {
      parsed.planId = AgentBridgeIncomingParser.extractStringProperty(payloadObject, 'id');
    }
    parsed.planTitle = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'title');
    parsed.planContent = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'content')
    );
    parsed.planStatus = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'status');
    parsed.planMessage = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(payloadObject, source, propertyIndex, 'message')
    );
    parsed.errorMessage = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'message');
    parsed.isOk = source.indexOf('"ok":false') < 0;
    return parsed;
  }

  static parseProviders(source: string): Array<AgentBridgeProviderOption> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'providers');
    const providers: Array<AgentBridgeProviderOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const provider = AgentBridgeIncomingParser.parseProviderObject(objects[index]);
      if (provider.id !== AgentBridgeProviderId.MOCK) {
        providers.push(provider);
      }
    }
    if (providers.length === 0) {
      return AgentBridgeDefaultOptions.buildProviders();
    }
    return providers;
  }

  static parseRemoteSessions(source: string): Array<AgentBridgeRemoteSession> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'sessions');
    const sessions: Array<AgentBridgeRemoteSession> = [];
    for (let index = 0; index < objects.length; index++) {
      const session = AgentBridgeIncomingParser.parseRemoteSessionObject(objects[index]);
      if (session.sessionId.length > 0) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  static parseFirstRemoteSession(source: string): AgentBridgeRemoteSession {
    const sessionObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'session');
    return AgentBridgeIncomingParser.parseRemoteSessionObject(sessionObject);
  }

  static parseDeviceHandshake(source: string): AgentBridgeDeviceHandshake {
    const identityObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'deviceIdentity');
    const proofObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'connectionProof');
    return new AgentBridgeDeviceHandshake(
      AgentBridgeIncomingParser.parseDeviceIdentityObject(identityObject),
      AgentBridgeIncomingParser.parseConnectionProofObject(proofObject)
    );
  }

  static parseServerInfo(source: string): AgentBridgeServerInfo {
    let serverInfoObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'serverInfo');
    if (serverInfoObject.length === 0) {
      serverInfoObject = source;
    }
    const featuresObject = AgentBridgeIncomingParser.extractObjectProperty(serverInfoObject, 'features');
    const item = new AgentBridgeServerInfo(
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'serverId'),
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'hostname'),
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'version'),
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'protocolVersion'),
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'legacyProtocolVersion'),
      AgentBridgeIncomingParser.extractNumberProperty(serverInfoObject, 'terminalStreamProtocolVersion', 1),
      AgentBridgeIncomingParser.extractNumberProperty(serverInfoObject, 'uptimeSec', 0),
      AgentBridgeIncomingParser.extractNumberProperty(serverInfoObject, 'activeConnections', 0),
      AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'keyFingerprint'),
      AgentBridgeIncomingParser.parseServerFeatureFlags(featuresObject),
      featuresObject
    );
    item.bridgeVersion = AgentBridgeIncomingParser.extractFirstStringProperty(serverInfoObject, 'bridgeVersion', 'version');
    item.minimumAppVersion = AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'minimumAppVersion');
    item.recommendedAppVersion = AgentBridgeIncomingParser.extractStringProperty(serverInfoObject, 'recommendedAppVersion');
    item.supportedProtocolVersions = AgentBridgeIncomingParser.extractStringArrayProperty(
      serverInfoObject, 'supportedProtocolVersions'
    );
    item.compatibilityJson = AgentBridgeIncomingParser.extractObjectProperty(serverInfoObject, 'compatibility');
    item.compatibility = AgentBridgeIncomingParser.parseCompatibilityInfo(item.compatibilityJson);
    if (item.compatibility.supportedProtocolVersions.length === 0) {
      item.compatibility.supportedProtocolVersions = item.supportedProtocolVersions.slice();
    }
    return item;
  }

  static parseCompatibilityInfo(source: string): AgentBridgeCompatibilityInfo {
    const item = new AgentBridgeCompatibilityInfo();
    if (source.length === 0) {
      return item;
    }
    item.status = AgentBridgeCompatibilityStatus.normalize(
      AgentBridgeIncomingParser.extractStringProperty(source, 'status')
    );
    const requestedBlocking = AgentBridgeIncomingParser.extractBooleanProperty(source, 'blocking');
    item.blocking = requestedBlocking && (item.status === AgentBridgeCompatibilityStatus.APP_TOO_OLD ||
      item.status === AgentBridgeCompatibilityStatus.BRIDGE_TOO_OLD);
    item.reason = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'reason'));
    item.minimumAppVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'minimumAppVersion');
    item.recommendedAppVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'recommendedAppVersion');
    item.minimumBridgeVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'minimumBridgeVersion');
    item.recommendedBridgeVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'recommendedBridgeVersion');
    item.minimumProtocolVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'minimumProtocolVersion');
    item.recommendedProtocolVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'recommendedProtocolVersion');
    item.supportedProtocolVersions = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'supportedProtocolVersions');
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    return item;
  }

  static parseAgentForkResult(source: string): AgentBridgeAgentForkResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeAgentForkResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.forkPlanId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'forkPlanId');
    const workspaceMode = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'workspaceMode');
    item.workspaceMode = workspaceMode === 'isolated' ? 'isolated' : 'shared';
    item.boundaryMessageId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'boundaryMessageId');
    item.boundaryCursor = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'boundaryCursor');
    item.timelineEpoch = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'timelineEpoch', 0);
    item.timelineSeq = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'timelineSeq', 0);
    item.contextItemCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'contextItemCount', 0);
    item.contextDigest = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'contextDigest');
    item.expiresAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'expiresAt', 0);
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    item.failureCategory = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'failureCategory', 'code');
    item.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    item.agentJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'agent');
    return item;
  }

  static parseAgentRecords(source: string): Array<AgentBridgeAgentRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'agents');
    const agents: Array<AgentBridgeAgentRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const agent = AgentBridgeIncomingParser.parseAgentRecordObject(objects[index]);
      if (agent.id.length > 0) {
        agents.push(agent);
      }
    }
    return agents;
  }

  static parseFirstAgentRecord(source: string): AgentBridgeAgentRecord {
    const agentObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'agent');
    if (agentObject.length > 0) {
      return AgentBridgeIncomingParser.parseAgentRecordObject(agentObject);
    }
    const agents = AgentBridgeIncomingParser.parseAgentRecords(source);
    if (agents.length > 0) {
      return agents[0];
    }
    return new AgentBridgeAgentRecord();
  }

  static parseAgentTimelineRecords(source: string): Array<AgentBridgeAgentTimelineRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'items');
    const items: Array<AgentBridgeAgentTimelineRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseTimelineRecordObject(objects[index]);
      if (item.agentId.length > 0 && item.seq > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseCheckpointRecords(source: string): Array<AgentBridgeCheckpointRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'checkpoints');
    const items: Array<AgentBridgeCheckpointRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseCheckpointRecordObject(objects[index]);
      if (item.checkpointId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseFirstCheckpointRecord(source: string): AgentBridgeCheckpointRecord {
    const checkpointObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'checkpoint');
    if (checkpointObject.length > 0) {
      return AgentBridgeIncomingParser.parseCheckpointRecordObject(checkpointObject);
    }
    const checkpoints = AgentBridgeIncomingParser.parseCheckpointRecords(source);
    if (checkpoints.length > 0) {
      return checkpoints[0];
    }
    return new AgentBridgeCheckpointRecord();
  }

  static parseCheckpointRestoreResult(source: string): AgentBridgeCheckpointRestoreResult {
    const result = new AgentBridgeCheckpointRestoreResult();
    result.checkpoint = AgentBridgeIncomingParser.parseFirstCheckpointRecord(source);
    result.dryRun = AgentBridgeIncomingParser.extractBooleanProperty(source, 'dryRun');
    result.restoreBlocked = AgentBridgeIncomingParser.extractBooleanProperty(source, 'restoreBlocked');
    result.preRestoreSnapshotId = AgentBridgeIncomingParser.extractStringProperty(source, 'preRestoreSnapshotId');
    result.restorePlanId = AgentBridgeIncomingParser.extractStringProperty(source, 'restorePlanId');
    result.manifestVerified = AgentBridgeIncomingParser.extractBooleanProperty(source, 'manifestVerified');
    result.workspaceRoot = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceRoot');
    result.filePolicyJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'filePolicy');
    result.filesSkipped = AgentBridgeIncomingParser.extractNumberProperty(source, 'filesSkipped', 0);
    result.filesRestored = AgentBridgeIncomingParser.extractNumberProperty(source, 'filesRestored', 0);
    result.filesVerified = AgentBridgeIncomingParser.extractNumberProperty(source, 'filesVerified', 0);
    const conflictObjects = AgentBridgeIncomingParser.extractObjectArray(source, 'conflicts');
    const conflicts: Array<AgentBridgeCheckpointRestoreConflict> = [];
    for (let index = 0; index < conflictObjects.length; index++) {
      const conflict = new AgentBridgeCheckpointRestoreConflict();
      conflict.path = AgentBridgeIncomingParser.extractStringProperty(conflictObjects[index], 'path');
      conflict.reason = AgentBridgeIncomingParser.extractStringProperty(conflictObjects[index], 'reason');
      if (conflict.path.length > 0 || conflict.reason.length > 0) {
        conflicts.push(conflict);
      }
    }
    result.conflicts = conflicts;
    const verifyErrorObjects = AgentBridgeIncomingParser.extractObjectArray(source, 'verifyErrors');
    const verifyErrors: Array<AgentBridgeCheckpointVerifyError> = [];
    for (let index = 0; index < verifyErrorObjects.length; index++) {
      const verifyError = new AgentBridgeCheckpointVerifyError();
      verifyError.path = AgentBridgeIncomingParser.extractStringProperty(verifyErrorObjects[index], 'path');
      verifyError.reason = AgentBridgeIncomingParser.extractStringProperty(verifyErrorObjects[index], 'reason');
      verifyError.currentSha256 = AgentBridgeIncomingParser.extractStringProperty(verifyErrorObjects[index], 'currentSha256');
      verifyError.checkpointSha256 = AgentBridgeIncomingParser.extractStringProperty(verifyErrorObjects[index], 'checkpointSha256');
      if (verifyError.path.length > 0 || verifyError.reason.length > 0) {
        verifyErrors.push(verifyError);
      }
    }
    result.verifyErrors = verifyErrors;
    result.skippedReasons = AgentBridgeIncomingParser.parseCheckpointSkippedReasons(source);
    result.runtimeRestored = AgentBridgeIncomingParser.extractBooleanProperty(source, 'runtimeRestored');
    result.runtimeRestoreStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeRestoreStatus');
    result.runtimeRestoreReason = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeRestoreReason');
    const restoredObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'restored');
    result.restoredConversation = AgentBridgeIncomingParser.extractBooleanProperty(restoredObject, 'conversation');
    result.restoredFiles = AgentBridgeIncomingParser.extractBooleanProperty(restoredObject, 'files');
    result.restoredReason = AgentBridgeIncomingParser.extractStringProperty(restoredObject, 'reason');
    const layersObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'layers');
    result.filesLayer = AgentBridgeIncomingParser.parseCheckpointRestoreLayer(layersObject, 'files');
    result.timelineLayer = AgentBridgeIncomingParser.parseCheckpointRestoreLayer(layersObject, 'timeline');
    result.runtimeLayer = AgentBridgeIncomingParser.parseCheckpointRestoreLayer(layersObject, 'runtime');
    result.terminalLayer = AgentBridgeIncomingParser.parseCheckpointRestoreLayer(layersObject, 'terminal');
    return result;
  }

  private static parseCheckpointRestoreLayer(source: string, propertyName: string): AgentBridgeCheckpointRestoreLayer {
    const result = new AgentBridgeCheckpointRestoreLayer();
    const layerObject = AgentBridgeIncomingParser.extractObjectProperty(source, propertyName);
    result.requested = AgentBridgeIncomingParser.extractBooleanProperty(layerObject, 'requested');
    result.status = AgentBridgeIncomingParser.extractStringProperty(layerObject, 'status');
    result.restored = AgentBridgeIncomingParser.extractBooleanProperty(layerObject, 'restored');
    result.reason = AgentBridgeIncomingParser.extractStringProperty(layerObject, 'reason');
    return result;
  }

  static parseProjectRecords(source: string): Array<AgentBridgeProjectRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'projects');
    const items: Array<AgentBridgeProjectRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseProjectRecordObject(objects[index]);
      if (item.projectId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseWorkspaceRecords(source: string): Array<AgentBridgeWorkspaceRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'workspaces');
    const items: Array<AgentBridgeWorkspaceRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseWorkspaceRecordObject(objects[index]);
      if (item.workspaceId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseWorkspaceRegistryResult(source: string): AgentBridgeWorkspaceRegistryResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeWorkspaceRegistryResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.kind = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'kind');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.projects = AgentBridgeIncomingParser.parseProjectRecords(sourceObject);
    item.workspaces = AgentBridgeIncomingParser.parseWorkspaceRecords(sourceObject);
    item.suggestions = AgentBridgeIncomingParser.parseWorkspaceSuggestions(sourceObject);
    item.checks = AgentBridgeIncomingParser.parseWorkspaceDoctorChecks(sourceObject);
    const workspaceObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'workspace');
    if (workspaceObject.length > 0) {
      item.workspace = AgentBridgeIncomingParser.parseWorkspaceRecordObject(workspaceObject);
    }
    const validationObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'validation');
    item.validation = AgentBridgeIncomingParser.parseWorkspaceRegistryValidation(validationObject);
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'workspaceId');
    item.projectId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'projectId');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'cwd');
    item.workspacePath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'workspacePath');
    item.kind = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'kind');
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    item.duplicateOfWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'duplicateOfWorkspaceId');
    item.restoredArchived = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'restoredArchived');
    item.openStatus = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'openStatus');
    item.openCommand = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'openCommand');
    item.openError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'openError'));
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'updatedAt', 0);
    return item;
  }

  static parseWorkspaceDiffResult(source: string): AgentBridgeWorkspaceDiffResult {
    const payload = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const value = payload.length > 0 ? payload : source;
    const result = new AgentBridgeWorkspaceDiffResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(value, 'ok');
    if (!result.ok && AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok')) {
      result.ok = true;
    }
    result.action = AgentBridgeIncomingParser.extractStringProperty(value, 'action');
    if (result.action.length === 0) {
      result.action = 'workspace.diff.get';
    }
    result.sessionId = AgentBridgeIncomingParser.extractStringProperty(value, 'sessionId');
    result.workspaceId = AgentBridgeIncomingParser.extractStringProperty(value, 'workspaceId');
    result.path = AgentBridgeIncomingParser.extractFirstStringProperty(value, 'path', 'filePath');
    if (result.path.length === 0) {
      result.path = AgentBridgeIncomingParser.extractStringProperty(value, 'relativePath');
    }
    result.kind = AgentBridgeIncomingParser.extractStringProperty(value, 'kind');
    if (result.kind.length === 0) {
      result.kind = 'file';
    }
    result.staged = AgentBridgeIncomingParser.extractBooleanProperty(value, 'staged');
    result.additions = AgentBridgeIncomingParser.extractNumberProperty(value, 'additions', 0);
    result.deletions = AgentBridgeIncomingParser.extractNumberProperty(value, 'deletions', 0);
    result.changedFileCount = AgentBridgeIncomingParser.extractNumberProperty(value, 'changedFileCount', 1);
    if (result.changedFileCount <= 0) {
      result.changedFileCount = 1;
    }
    result.diffText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractFirstStringProperty(value, 'diffText', 'diff')
    );
    if (result.diffText.length === 0) {
      result.diffText = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(value, 'patch', 'content')
      );
    }
    result.fileCursor = AgentBridgeIncomingParser.extractNumberProperty(value, 'fileCursor', 0);
    result.fileLimit = AgentBridgeIncomingParser.extractNumberProperty(value, 'fileLimit', 50);
    result.nextFileCursor = AgentBridgeIncomingParser.extractNumberProperty(value, 'nextFileCursor', -1);
    result.lineOffset = AgentBridgeIncomingParser.extractNumberProperty(value, 'lineOffset', 0);
    result.lineLimit = AgentBridgeIncomingParser.extractNumberProperty(value, 'lineLimit', 2000);
    result.nextLineOffset = AgentBridgeIncomingParser.extractNumberProperty(value, 'nextLineOffset', -1);
    result.maxBytes = AgentBridgeIncomingParser.extractNumberProperty(value, 'maxBytes', 524288);
    result.truncated = AgentBridgeIncomingParser.extractBooleanProperty(value, 'truncated');
    result.truncationReason = AgentBridgeIncomingParser.extractStringProperty(value, 'truncationReason');
    result.totalFiles = AgentBridgeIncomingParser.extractNumberProperty(value, 'totalFiles', 0);
    result.totalLines = AgentBridgeIncomingParser.extractNumberProperty(value, 'totalLines', 0);
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(value, 'failureCategory');
    result.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(value, 'message')
    );
    result.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(value, 'remediation')
    );
    result.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'warnings');
    result.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(value, 'updatedAt', 0);
    return result;
  }

  static parseWorkspaceSuggestions(source: string): Array<AgentBridgeWorkspaceSuggestionRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'suggestions');
    const items: Array<AgentBridgeWorkspaceSuggestionRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseWorkspaceSuggestionObject(objects[index]);
      if (item.path.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseWorkspaceDoctorChecks(source: string): Array<AgentBridgeWorkspaceRegistryDoctorCheck> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'checks');
    const items: Array<AgentBridgeWorkspaceRegistryDoctorCheck> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseWorkspaceDoctorCheckObject(objects[index]);
      if (item.id.length > 0 || item.message.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseWorktreeRecords(source: string): Array<AgentBridgeWorktreeRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'worktrees');
    const items: Array<AgentBridgeWorktreeRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseWorktreeRecordObject(objects[index]);
      if (item.path.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseTerminalStates(source: string): Array<AgentBridgeTerminalState> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'terminals');
    const items: Array<AgentBridgeTerminalState> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseTerminalStateObject(objects[index]);
      if (item.terminalId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseFirstTerminalState(source: string): AgentBridgeTerminalState {
    const terminalObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'terminal');
    if (terminalObject.length > 0) {
      return AgentBridgeIncomingParser.parseTerminalStateObject(terminalObject);
    }
    const terminals = AgentBridgeIncomingParser.parseTerminalStates(source);
    if (terminals.length > 0) {
      return terminals[0];
    }
    return new AgentBridgeTerminalState();
  }

  static parseTerminalHookRecords(source: string): Array<AgentBridgeTerminalHookRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'hooks');
    const items: Array<AgentBridgeTerminalHookRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseTerminalHookRecordObject(objects[index]);
      if (item.path.length > 0 || item.name.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseTerminalSlot(source: string): number {
    return AgentBridgeIncomingParser.extractNumberProperty(source, 'slot', 0);
  }

  static parseTerminalCaptureText(source: string): string {
    return AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'text'));
  }

  static parseFileTransferMetadata(source: string): AgentBridgeFileTransferMetadata {
    const item = new AgentBridgeFileTransferMetadata();
    item.requestId = AgentBridgeIncomingParser.extractStringProperty(source, 'requestId');
    item.direction = AgentBridgeIncomingParser.extractStringProperty(source, 'direction');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.path = AgentBridgeIncomingParser.extractStringProperty(source, 'path');
    item.fileName = AgentBridgeIncomingParser.extractStringProperty(source, 'fileName');
    item.mediaType = AgentBridgeIncomingParser.extractStringProperty(source, 'mediaType');
    item.size = AgentBridgeIncomingParser.extractNumberProperty(source, 'size', 0);
    item.sizeBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'sizeBytes', item.size);
    item.sha256 = AgentBridgeIncomingParser.extractStringProperty(source, 'sha256');
    item.modifiedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'modifiedAt', 0);
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.completedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'completedAt');
    return item;
  }

  static parseFileTransferState(source: string): AgentBridgeFileTransferState {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const metadataObject = AgentBridgeIncomingParser.extractObjectProperty(payloadObject, 'metadata');
    const metadata = metadataObject.length > 0
      ? AgentBridgeIncomingParser.parseFileTransferMetadata(metadataObject)
      : AgentBridgeIncomingParser.parseFileTransferMetadata(source);
    const item = new AgentBridgeFileTransferState();
    item.requestId = AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'requestId');
    if (item.requestId.length === 0) {
      item.requestId = metadata.requestId;
    }
    item.direction = AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'direction');
    if (item.direction.length === 0) {
      item.direction = metadata.direction;
    }
    item.path = metadata.path;
    item.fileName = metadata.fileName;
    item.mediaType = metadata.mediaType;
    item.totalBytes = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'totalBytes', metadata.sizeBytes);
    item.transferredBytes = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'transferredBytes', metadata.sizeBytes);
    item.sha256 = metadata.sha256;
    item.errorMessage = AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'message');
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'updatedAt', 0);
    return item;
  }

  static parseProviderProfileRecords(source: string): Array<AgentBridgeProviderProfileRecord> {
    return AgentBridgeIncomingParser.parseProviderProfileArray(source, 'profiles');
  }

  static parseProviderAcpResult(source: string): AgentBridgeProviderAcpResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeProviderAcpResult();
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.confirmRequired = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmRequired');
    item.duplicatePolicy = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'duplicatePolicy');
    if (item.duplicatePolicy.length === 0) {
      item.duplicatePolicy = 'skip';
    }
    item.imported = AgentBridgeIncomingParser.parseProviderProfileArray(sourceObject, 'imported');
    item.preview = AgentBridgeIncomingParser.parseProviderProfileArray(sourceObject, 'preview');
    if (item.preview.length === 0 && !item.confirmed) {
      item.preview = AgentBridgeIncomingParser.parseProviderProfileArray(sourceObject, 'providers');
    }
    item.profiles = AgentBridgeIncomingParser.parseProviderProfileArray(sourceObject, 'profiles');
    item.skipped = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(sourceObject, 'skipped');
    item.duplicates = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(sourceObject, 'duplicates');
    item.scannedJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'scanned');
    item.catalogRefreshReason = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'catalogRefreshReason');
    item.affectedProfileIds = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'affectedProfileIds');
    item.affectedRuntimeProviderIds = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'affectedRuntimeProviderIds');
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'updatedAt', 0);
    const validationReportObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'validationReport');
    if (validationReportObject.length > 0) {
      item.validationReport = AgentBridgeIncomingParser.parseProviderAcpValidationReport(validationReportObject);
      if (item.scannedJson.length === 0) {
        item.scannedJson = item.validationReport.scannedJson;
      }
    }
    return item;
  }

  static parseProviderDirectoryResult(source: string): AgentBridgeProviderDirectoryResult {
    const payload = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const value = payload.length > 0 ? payload : source;
    const result = new AgentBridgeProviderDirectoryResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(value, 'ok');
    result.preview = AgentBridgeIncomingParser.extractBooleanProperty(value, 'preview');
    result.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(value, 'confirmed');
    result.providerId = AgentBridgeIncomingParser.extractStringProperty(value, 'providerId');
    result.profileId = AgentBridgeIncomingParser.extractStringProperty(value, 'profileId');
    result.version = AgentBridgeIncomingParser.extractStringProperty(value, 'version');
    result.planId = AgentBridgeIncomingParser.extractStringProperty(value, 'planId');
    result.manifestDigest = AgentBridgeIncomingParser.extractStringProperty(value, 'manifestDigest');
    result.packageSha256 = AgentBridgeIncomingParser.extractStringProperty(value, 'packageSha256');
    result.installStatus = AgentBridgeIncomingParser.extractStringProperty(value, 'installStatus');
    result.activeVersion = AgentBridgeIncomingParser.extractStringProperty(value, 'activeVersion');
    result.previousVersion = AgentBridgeIncomingParser.extractStringProperty(value, 'previousVersion');
    result.targetVersion = AgentBridgeIncomingParser.extractStringProperty(value, 'targetVersion');
    result.expiresAt = AgentBridgeIncomingParser.extractStringProperty(value, 'expiresAt');
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(value, 'failureCategory');
    result.message = AgentBridgeIncomingParser.extractStringProperty(value, 'message');
    result.remediation = AgentBridgeIncomingParser.extractStringProperty(value, 'remediation');
    result.sourceUrl = AgentBridgeIncomingParser.extractStringProperty(value, 'sourceUrl');
    result.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'warnings');
    result.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(value, 'updatedAt', 0);
    const entries = AgentBridgeIncomingParser.extractObjectArray(value, 'providers');
    for (let index = 0; index < entries.length; index++) {
      const entry = new AgentBridgeProviderDirectoryEntry();
      entry.providerId = AgentBridgeIncomingParser.extractFirstStringProperty(entries[index], 'id', 'providerId');
      entry.profileId = AgentBridgeIncomingParser.extractStringProperty(entries[index], 'profileId');
      entry.displayName = AgentBridgeIncomingParser.extractStringProperty(entries[index], 'displayName');
      entry.description = AgentBridgeIncomingParser.extractStringProperty(entries[index], 'description');
      entry.version = AgentBridgeIncomingParser.extractStringProperty(entries[index], 'version');
      entry.available = AgentBridgeIncomingParser.extractBooleanProperty(entries[index], 'available');
      entry.availabilityReason = AgentBridgeIncomingParser.extractStringProperty(entries[index], 'availabilityReason');
      const binary = AgentBridgeIncomingParser.extractObjectProperty(entries[index], 'managedBinary');
      entry.packageFormat = AgentBridgeIncomingParser.extractStringProperty(binary, 'packageFormat');
      entry.packageSha256 = AgentBridgeIncomingParser.extractStringProperty(binary, 'packageSha256');
      const state = AgentBridgeIncomingParser.extractObjectProperty(entries[index], 'installState');
      const stateSource: string = state.length > 0 ? state : entries[index];
      if (entry.profileId.length === 0) {
        entry.profileId = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'profileId');
      }
      entry.activeVersion = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'activeVersion');
      entry.previousVersion = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'previousVersion');
      entry.installStatus = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'installStatus');
      entry.healthStatus = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'healthStatus');
      entry.failureCategory = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'failureCategory');
      entry.remediation = AgentBridgeIncomingParser.extractStringProperty(stateSource, 'remediation');
      if (entry.providerId.length > 0) { result.providers.push(entry); }
    }
    return result;
  }

  static parseWorkspaceServiceResult(source: string): AgentBridgeWorkspaceServiceResult {
    const payload = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const value = payload.length > 0 ? payload : source;
    const result = new AgentBridgeWorkspaceServiceResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(value, 'ok');
    result.preview = AgentBridgeIncomingParser.extractBooleanProperty(value, 'preview');
    result.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(value, 'confirmed');
    result.planId = AgentBridgeIncomingParser.extractStringProperty(value, 'planId');
    result.serviceId = AgentBridgeIncomingParser.extractStringProperty(value, 'serviceId');
    result.totalCount = AgentBridgeIncomingParser.extractNumberProperty(value, 'totalCount', 0);
    result.removed = AgentBridgeIncomingParser.extractBooleanProperty(value, 'removed');
    result.truncated = AgentBridgeIncomingParser.extractBooleanProperty(value, 'truncated');
    result.text = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(value, 'text'));
    result.accessUrl = AgentBridgeIncomingParser.extractStringProperty(value, 'accessUrl');
    result.ticket = AgentBridgeIncomingParser.extractStringProperty(value, 'ticket');
    result.expiresAt = AgentBridgeIncomingParser.extractStringProperty(value, 'expiresAt');
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(value, 'failureCategory');
    result.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(value, 'message'));
    result.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(value, 'remediation'));
    result.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'warnings');
    result.updatedAt = AgentBridgeIncomingParser.extractStringProperty(value, 'updatedAt');
    const serviceObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'service');
    if (serviceObject.length > 0) {
      result.service = AgentBridgeIncomingParser.parseWorkspaceServiceObject(serviceObject);
      if (result.serviceId.length === 0) result.serviceId = result.service.serviceId;
    }
    const healthObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'health');
    result.health = AgentBridgeIncomingParser.parseWorkspaceServiceHealth(healthObject);
    const objects = AgentBridgeIncomingParser.extractObjectArray(value, 'services');
    for (let index = 0; index < objects.length; index++) {
      const service = AgentBridgeIncomingParser.parseWorkspaceServiceObject(objects[index]);
      if (service.serviceId.length > 0) result.services.push(service);
    }
    if (result.totalCount === 0) result.totalCount = result.services.length;
    return result;
  }

  static parseBrowserResult(source: string): AgentBridgeBrowserResult {
    const payload = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const value = payload.length > 0 ? payload : source;
    const result = new AgentBridgeBrowserResult();
    result.requestId = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    if (result.requestId.length === 0) {
      result.requestId = AgentBridgeIncomingParser.extractStringProperty(value, 'requestId');
    }
    result.eventKind = AgentBridgeIncomingParser.extractStringProperty(value, 'kind');
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(value, 'ok');
    result.preview = AgentBridgeIncomingParser.extractBooleanProperty(value, 'preview');
    result.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(value, 'confirmed');
    result.accepted = AgentBridgeIncomingParser.extractBooleanProperty(value, 'accepted');
    result.applied = AgentBridgeIncomingParser.extractBooleanProperty(value, 'applied');
    result.matched = AgentBridgeIncomingParser.extractBooleanProperty(value, 'matched');
    result.reused = AgentBridgeIncomingParser.extractBooleanProperty(value, 'reused');
    result.closed = AgentBridgeIncomingParser.extractBooleanProperty(value, 'closed');
    result.planId = AgentBridgeIncomingParser.extractStringProperty(value, 'planId');
    result.hostId = AgentBridgeIncomingParser.extractStringProperty(value, 'hostId');
    result.commandId = AgentBridgeIncomingParser.extractStringProperty(value, 'commandId');
    result.workspaceId = AgentBridgeIncomingParser.extractStringProperty(value, 'workspaceId');
    result.action = AgentBridgeIncomingParser.extractStringProperty(value, 'action');
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(value, 'failureCategory');
    result.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(value, 'message'));
    result.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(value, 'remediation'));
    result.updatedAt = AgentBridgeIncomingParser.extractStringProperty(value, 'updatedAt');
    result.expiresAt = AgentBridgeIncomingParser.extractStringProperty(value, 'expiresAt');
    const targetObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'target');
    const targetSource: string = targetObject.length > 0 ? targetObject : value;
    result.target.workspaceId = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'workspaceId');
    result.target.agentId = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'agentId');
    result.target.hostId = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'hostId');
    result.target.instanceId = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'instanceId');
    result.target.pageId = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'pageId');
    result.target.action = AgentBridgeIncomingParser.extractStringProperty(targetSource, 'action');
    if (result.target.workspaceId.length === 0) result.target.workspaceId = result.workspaceId;
    if (result.target.hostId.length === 0) result.target.hostId = result.hostId;
    if (result.target.action.length === 0) result.target.action = result.action;
    result.domains = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'domains');
    const permissionObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'permission');
    const permissionSource: string = permissionObject.length > 0 ? permissionObject : value;
    const permissionDomains: Array<string> = AgentBridgeIncomingParser.extractStringArrayProperty(permissionSource, 'domains');
    if (permissionDomains.length > 0 || permissionSource.indexOf('"domains":[]') >= 0) {
      result.domains = permissionDomains;
    }
    result.downloadDirectoryConfigured = AgentBridgeIncomingParser.extractBooleanProperty(
      permissionSource,
      'downloadDirectoryConfigured'
    );
    if (!result.downloadDirectoryConfigured &&
      AgentBridgeIncomingParser.extractStringProperty(permissionSource, 'downloadDirectory').length > 0) {
      result.downloadDirectoryConfigured = true;
    }
    result.permission.workspaceId = AgentBridgeIncomingParser.extractStringProperty(permissionSource, 'workspaceId');
    if (result.permission.workspaceId.length === 0) result.permission.workspaceId = result.workspaceId;
    result.permission.domains = result.domains;
    result.permission.downloadDirectoryConfigured = result.downloadDirectoryConfigured;
    result.permission.updatedAt = AgentBridgeIncomingParser.extractStringProperty(permissionSource, 'updatedAt');
    if (result.permission.updatedAt.length === 0) result.permission.updatedAt = result.updatedAt;
    result.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'warnings');
    const hostObjects = AgentBridgeIncomingParser.extractObjectArray(value, 'hosts');
    for (let index = 0; index < hostObjects.length; index++) {
      const host = AgentBridgeIncomingParser.parseBrowserHost(hostObjects[index]);
      if (host.hostId.length > 0) result.hosts.push(host);
    }
    const hostObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'host');
    if (hostObject.length > 0) {
      result.host = AgentBridgeIncomingParser.parseBrowserHost(hostObject);
      if (result.host.hostId.length > 0) result.hosts.push(result.host);
    }
    const instanceObjects = AgentBridgeIncomingParser.extractObjectArray(value, 'instances');
    for (let index = 0; index < instanceObjects.length; index++) {
      const instance = AgentBridgeIncomingParser.parseBrowserInstance(instanceObjects[index]);
      if (instance.instanceId.length > 0) result.instances.push(instance);
    }
    const instanceObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'instance');
    if (instanceObject.length > 0) result.instance = AgentBridgeIncomingParser.parseBrowserInstance(instanceObject);
    if (result.target.instanceId.length === 0) result.target.instanceId = result.instance.instanceId;
    const pageObjects = AgentBridgeIncomingParser.extractObjectArray(value, 'pages');
    for (let index = 0; index < pageObjects.length; index++) {
      const page = AgentBridgeIncomingParser.parseBrowserPage(pageObjects[index]);
      if (page.pageId.length > 0) result.pages.push(page);
    }
    const pageObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'page');
    if (pageObject.length > 0) result.page = AgentBridgeIncomingParser.parseBrowserPage(pageObject);
    if (result.target.pageId.length === 0) result.target.pageId = result.page.pageId;
    result.closedPageIds = AgentBridgeIncomingParser.extractStringArrayProperty(value, 'closedPageIds');
    const snapshotObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'snapshot');
    result.snapshotText = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(snapshotObject, 'text'));
    const screenshotObject = AgentBridgeIncomingParser.extractObjectProperty(value, 'screenshot');
    result.screenshot.mimeType = AgentBridgeIncomingParser.extractStringProperty(screenshotObject, 'mimeType');
    result.screenshot.dataBase64 = AgentBridgeIncomingParser.extractStringProperty(screenshotObject, 'dataBase64');
    result.screenshot.bytes = AgentBridgeIncomingParser.extractNumberProperty(screenshotObject, 'bytes', 0);
    result.screenshot.fullPage = AgentBridgeIncomingParser.extractBooleanProperty(screenshotObject, 'fullPage');
    result.logsJson = AgentBridgeIncomingParser.extractArrayProperty(value, 'logs');
    result.downloadsJson = AgentBridgeIncomingParser.extractArrayProperty(value, 'downloads');
    result.tracking = AgentBridgeIncomingParser.extractStringProperty(value, 'tracking');
    const logObjects = AgentBridgeIncomingParser.extractObjectArray(value, 'logs');
    for (let index = 0; index < logObjects.length && index < 200; index++) {
      result.logs.push(AgentBridgeIncomingParser.parseBrowserLog(logObjects[index]));
    }
    const downloadObjects = AgentBridgeIncomingParser.extractObjectArray(value, 'downloads');
    for (let index = 0; index < downloadObjects.length && index < 500; index++) {
      result.downloads.push(AgentBridgeIncomingParser.parseBrowserDownload(downloadObjects[index]));
    }
    return result;
  }

  private static parseBrowserHost(source: string): AgentBridgeBrowserHostRecord {
    const item = new AgentBridgeBrowserHostRecord();
    item.hostId = AgentBridgeIncomingParser.extractStringProperty(source, 'hostId');
    item.label = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'label'));
    item.platform = AgentBridgeIncomingParser.extractStringProperty(source, 'platform');
    item.hostKind = AgentBridgeIncomingParser.extractStringProperty(source, 'hostKind');
    item.runtime = AgentBridgeIncomingParser.extractStringProperty(source, 'runtime');
    item.capabilitySource = AgentBridgeIncomingParser.extractStringProperty(source, 'capabilitySource');
    item.readiness = AgentBridgeIncomingParser.extractStringProperty(source, 'readiness');
    item.supportedPlatforms = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'supportedPlatforms');
    item.capabilityWarnings = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'capabilityWarnings');
    item.supportedCommands = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'supportedCommands');
    item.supportedActions = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'supportedActions');
    item.actionCapabilitiesExplicit = AgentBridgeIncomingParser.extractBooleanProperty(source, 'actionCapabilitiesExplicit');
    item.workspaceIds = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'workspaceIds');
    item.connected = AgentBridgeIncomingParser.extractBooleanProperty(source, 'connected');
    item.registeredAt = AgentBridgeIncomingParser.extractStringProperty(source, 'registeredAt');
    item.lastSeenAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastSeenAt');
    return item;
  }

  private static parseBrowserInstance(source: string): AgentBridgeBrowserInstanceRecord {
    const item = new AgentBridgeBrowserInstanceRecord();
    item.instanceId = AgentBridgeIncomingParser.extractStringProperty(source, 'instanceId');
    item.hostId = AgentBridgeIncomingParser.extractStringProperty(source, 'hostId');
    item.name = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'name'));
    item.engine = AgentBridgeIncomingParser.extractStringProperty(source, 'engine');
    item.connected = AgentBridgeIncomingParser.extractBooleanProperty(source, 'connected');
    return item;
  }

  private static parseBrowserPage(source: string): AgentBridgeBrowserPageRecord {
    const item = new AgentBridgeBrowserPageRecord();
    item.pageId = AgentBridgeIncomingParser.extractStringProperty(source, 'pageId');
    item.hostId = AgentBridgeIncomingParser.extractStringProperty(source, 'hostId');
    item.instanceId = AgentBridgeIncomingParser.extractStringProperty(source, 'instanceId');
    item.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'title'));
    item.url = AgentBridgeIncomingParser.extractStringProperty(source, 'url');
    item.type = AgentBridgeIncomingParser.extractStringProperty(source, 'type');
    if (item.type.length === 0) item.type = 'page';
    return item;
  }

  private static parseBrowserLog(source: string): AgentBridgeBrowserLogRecord {
    const item = new AgentBridgeBrowserLogRecord();
    item.method = AgentBridgeIncomingParser.extractStringProperty(source, 'method');
    item.type = AgentBridgeIncomingParser.extractStringProperty(source, 'type');
    item.text = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'text'));
    item.requestId = AgentBridgeIncomingParser.extractStringProperty(source, 'requestId');
    item.errorText = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'errorText'));
    item.encodedDataLength = AgentBridgeIncomingParser.extractNumberProperty(source, 'encodedDataLength', -1);
    item.occurredAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'occurredAt');
    return item;
  }

  private static parseBrowserDownload(source: string): AgentBridgeBrowserDownloadRecord {
    const item = new AgentBridgeBrowserDownloadRecord();
    item.pageId = AgentBridgeIncomingParser.extractStringProperty(source, 'pageId');
    item.guid = AgentBridgeIncomingParser.extractStringProperty(source, 'guid');
    item.state = AgentBridgeIncomingParser.extractStringProperty(source, 'state');
    item.suggestedFilename = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'suggestedFilename')
    );
    item.totalBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'totalBytes', -1);
    item.receivedBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'receivedBytes', -1);
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseWorkspaceServiceHealth(source: string): AgentBridgeWorkspaceServiceHealth {
    const item = new AgentBridgeWorkspaceServiceHealth();
    if (source.length === 0) return item;
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.statusCode = AgentBridgeIncomingParser.extractNumberProperty(source, 'statusCode', 0);
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.checkedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'checkedAt');
    return item;
  }

  private static parseWorkspaceServiceObject(source: string): AgentBridgeWorkspaceServiceRecord {
    const item = new AgentBridgeWorkspaceServiceRecord();
    item.serviceId = AgentBridgeIncomingParser.extractStringProperty(source, 'serviceId');
    item.name = AgentBridgeIncomingParser.extractStringProperty(source, 'name');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.ownerAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'ownerAgentId');
    item.command = AgentBridgeIncomingParser.extractStringProperty(source, 'command');
    item.argumentCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'argumentCount', 0);
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.port = AgentBridgeIncomingParser.extractNumberProperty(source, 'port', 0);
    item.protocol = AgentBridgeIncomingParser.extractStringProperty(source, 'protocol');
    if (item.protocol.length === 0) item.protocol = 'http';
    item.health = AgentBridgeIncomingParser.parseWorkspaceServiceHealth(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'health')
    );
    item.visibility = AgentBridgeIncomingParser.extractStringProperty(source, 'visibility');
    if (item.visibility.length === 0) item.visibility = 'workspace';
    const auth = AgentBridgeIncomingParser.extractObjectProperty(source, 'auth');
    item.auth.mode = AgentBridgeIncomingParser.extractStringProperty(auth, 'mode');
    if (item.auth.mode.length === 0) item.auth.mode = 'bridge';
    item.auth.environmentVariable = AgentBridgeIncomingParser.extractStringProperty(auth, 'environmentVariable');
    item.lifecycle = AgentBridgeIncomingParser.extractStringProperty(source, 'lifecycle');
    if (item.lifecycle.length === 0) item.lifecycle = 'workspace';
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    if (item.status.length === 0) item.status = 'stopped';
    item.pid = AgentBridgeIncomingParser.extractNumberProperty(source, 'pid', 0);
    item.ledgerId = AgentBridgeIncomingParser.extractStringProperty(source, 'ledgerId');
    item.recovered = AgentBridgeIncomingParser.extractBooleanProperty(source, 'recovered');
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(source, 'exitCode', 0);
    item.lastError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastError'));
    item.lastHealth = AgentBridgeIncomingParser.parseWorkspaceServiceHealth(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'lastHealth')
    );
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.startedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'startedAt');
    item.stoppedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'stoppedAt');
    item.proxyPath = AgentBridgeIncomingParser.extractStringProperty(source, 'proxyPath');
    return item;
  }

  private static parseProviderProfileArray(source: string, key: string): Array<AgentBridgeProviderProfileRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, key);
    const items: Array<AgentBridgeProviderProfileRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseProviderProfileRecordObject(objects[index]);
      if (item.profileId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseProviderAcpValidationEntryObject(source: string): AgentBridgeProviderAcpValidationEntry {
    const item = new AgentBridgeProviderAcpValidationEntry();
    item.profileId = AgentBridgeIncomingParser.extractStringProperty(source, 'profileId');
    item.providerId = AgentBridgeIncomingParser.extractStringProperty(source, 'providerId');
    item.displayName = AgentBridgeIncomingParser.extractStringProperty(source, 'displayName');
    item.sourcePath = AgentBridgeIncomingParser.extractStringProperty(source, 'sourcePath');
    item.reason = AgentBridgeIncomingParser.extractStringProperty(source, 'reason');
    return item;
  }

  private static parseProviderAcpValidationEntries(source: string, key: string): Array<AgentBridgeProviderAcpValidationEntry> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, key);
    const items: Array<AgentBridgeProviderAcpValidationEntry> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseProviderAcpValidationEntryObject(objects[index]);
      if (item.profileId.length > 0 || item.reason.length > 0 || item.sourcePath.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseProviderAcpValidationReport(source: string): AgentBridgeProviderAcpValidationReport {
    const item = new AgentBridgeProviderAcpValidationReport();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.scannedJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'scanned');
    item.accepted = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(source, 'accepted');
    item.rejected = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(source, 'rejected');
    if (item.rejected.length === 0) {
      item.rejected = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(source, 'invalid');
    }
    item.duplicates = AgentBridgeIncomingParser.parseProviderAcpValidationEntries(source, 'duplicates');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'warnings');
    item.errors = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'errors');
    item.providerCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'providerCount', 0);
    item.acceptedCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'acceptedCount', item.accepted.length);
    item.rejectedCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'rejectedCount', item.rejected.length);
    item.duplicateCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'duplicateCount', item.duplicates.length);
    item.warningCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'warningCount', 0);
    item.errorCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'errorCount', item.errors.length);
    return item;
  }

  static parseProviderProfileTestResult(source: string): AgentBridgeProviderProfileTestResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeProviderProfileTestResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.profileId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'profileId');
    const profileObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'profile');
    if (profileObject.length > 0) {
      item.profile = AgentBridgeIncomingParser.parseProviderProfileRecordObject(profileObject);
      if (item.profileId.length === 0) {
        item.profileId = item.profile.profileId;
      }
    }
    item.runtimeRegistered = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'runtimeRegistered');
    item.runtimeProviderId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'runtimeProviderId');
    item.runtimeError = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'runtimeError');
    item.runtimeFailureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'runtimeFailureCategory');
    item.testStatus = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'testStatus');
    item.validationMessagesJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'validationMessages');
    item.endpointChecked = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'endpointChecked');
    item.endpointReachable = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'endpointReachable');
    item.endpointStatusCode = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'endpointStatusCode', 0);
    item.endpointError = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'endpointError');
    item.binaryResolved = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'binaryResolved');
    item.binaryPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'binaryPath');
    item.commandRan = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'commandRan');
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'exitCode', 0);
    item.stdout = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stdout'));
    item.stderr = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stderr'));
    item.durationMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'durationMs', 0);
    item.timedOut = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'timedOut');
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'updatedAt', 0);
    return item;
  }

  static parseGitActionResult(source: string): AgentBridgeGitActionResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeGitActionResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.command = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'command');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'cwd');
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'exitCode', 0);
    item.stdout = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stdout'));
    item.stderr = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stderr'));
    item.durationMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'durationMs', 0);
    item.branchName = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'branchName');
    item.remoteName = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remoteName');
    item.changedFiles = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'changedFiles', 0);
    item.changesCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'changesCount', 0);
    if (item.changesCount <= 0) {
      item.changesCount = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'changes').length;
    }
    const conflictObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'conflictSummary');
    item.conflictSummary = AgentBridgeIncomingParser.parseGitConflictSummary(conflictObject);
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    item.diffSummaryJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'diffSummary');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.expiresAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'expiresAt');
    item.affectedPaths = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'affectedPaths');
    item.untrackedPaths = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'untrackedPaths');
    item.targetRef = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'targetRef');
    item.ahead = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'ahead', 0);
    item.behind = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'behind', 0);
    item.conflictPossible = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'conflictPossible');
    item.forceRisk = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'forceRisk');
    item.overwriteRisk = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'overwriteRisk');
    item.normalizedArgs = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'normalizedArgs');
    item.risks = AgentBridgeIncomingParser.parseGitRiskRecords(sourceObject);
    item.snapshot = AgentBridgeIncomingParser.parseGitRepositorySnapshot(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'snapshot')
    );
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'updatedAt', 0);
    return item;
  }

  static parseGitRiskRecords(source: string): Array<AgentBridgeGitRiskRecord> {
    const records: Array<AgentBridgeGitRiskRecord> = [];
    const values: Array<string> = AgentBridgeIncomingParser.extractObjectArray(source, 'risks');
    for (let index = 0; index < values.length; index++) {
      const item = new AgentBridgeGitRiskRecord();
      item.code = AgentBridgeIncomingParser.extractStringProperty(values[index], 'code');
      item.severity = AgentBridgeIncomingParser.extractStringProperty(values[index], 'severity');
      item.message = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(values[index], 'message')
      );
      item.remediation = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(values[index], 'remediation')
      );
      records.push(item);
    }
    return records;
  }

  static parseGitRepositorySnapshot(source: string): AgentBridgeGitRepositorySnapshot {
    const item = new AgentBridgeGitRepositorySnapshot();
    if (source.length === 0) {
      return item;
    }
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.head = AgentBridgeIncomingParser.extractStringProperty(source, 'head');
    item.branch = AgentBridgeIncomingParser.extractStringProperty(source, 'branch');
    item.upstream = AgentBridgeIncomingParser.extractStringProperty(source, 'upstream');
    item.upstreamHead = AgentBridgeIncomingParser.extractStringProperty(source, 'upstreamHead');
    item.indexFingerprint = AgentBridgeIncomingParser.extractStringProperty(source, 'indexFingerprint');
    item.worktreeFingerprint = AgentBridgeIncomingParser.extractStringProperty(source, 'worktreeFingerprint');
    item.ahead = AgentBridgeIncomingParser.extractNumberProperty(source, 'ahead', 0);
    item.behind = AgentBridgeIncomingParser.extractNumberProperty(source, 'behind', 0);
    item.dirty = AgentBridgeIncomingParser.extractBooleanProperty(source, 'dirty');
    return item;
  }

  static parseGitConflictSummary(source: string): AgentBridgeGitConflictSummary {
    const item = new AgentBridgeGitConflictSummary();
    if (source.length === 0) {
      return item;
    }
    item.hasConflicts = AgentBridgeIncomingParser.extractBooleanProperty(source, 'hasConflicts');
    item.count = AgentBridgeIncomingParser.extractNumberProperty(source, 'count', 0);
    item.files = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'files');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    return item;
  }

  static parseGitDiffSubscriptionStatus(source: string): AgentBridgeGitDiffSubscriptionStatus {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeGitDiffSubscriptionStatus();
    item.subscriptionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'subscriptionId');
    item.subscribed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'subscribed');
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    item.paused = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'paused');
    item.intervalMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'intervalMs', 0);
    item.lastSuccessAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'lastSuccessAt', 0);
    item.lastFailureAt = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'lastFailureAt', 0);
    item.lastError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastError'));
    item.backoffMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'backoffMs', 0);
    item.lastFingerprint = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastFingerprint');
    item.changesCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'changesCount', 0);
    item.changedFiles = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'changedFiles', 0);
    item.branchName = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'branchName');
    item.diffSummaryJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'diffSummary');
    if (item.diffSummaryJson.length > 0) {
      const summaryChanges = AgentBridgeIncomingParser.extractNumberProperty(item.diffSummaryJson, 'changesCount', item.changesCount);
      const summaryFiles = AgentBridgeIncomingParser.extractNumberProperty(item.diffSummaryJson, 'changedFiles', item.changedFiles);
      item.changesCount = summaryChanges;
      item.changedFiles = summaryFiles;
    }
    return item;
  }

  static parseGitHubResult(source: string): AgentBridgeGitHubResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeGitHubResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.repository = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'repository');
    item.owner = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'owner');
    item.repo = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'repo');
    item.apiBaseUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'apiBaseUrl');
    item.number = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'number', 0);
    item.url = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'url');
    item.state = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'state');
    item.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'title'));
    item.head = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'head');
    item.base = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'base');
    item.sha = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sha');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    item.rateLimitResetAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'rateLimitResetAt');
    item.dryRun = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'dryRun');
    item.mergeable = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'mergeable');
    item.draft = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'draft');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.authenticated = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'authenticated');
    item.userCode = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'userCode');
    item.verificationUri = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'verificationUri');
    item.authSessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.interval = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'interval', 0);
    item.assetUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'assetUrl');
    item.watching = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'watching');
    item.watchId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'watchId');
    item.reviewers = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'reviewers');
    item.labels = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'labels');
    item.reviewDecision = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'reviewDecision');
    item.mergeState = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'mergeState');
    item.conflict = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'conflict');
    item.nextPollAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'nextPollAt');
    item.backoffMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'backoffMs', 0);
    const accountObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'account');
    item.accountId = AgentBridgeIncomingParser.extractStringProperty(accountObject, 'id');
    item.accountLogin = AgentBridgeIncomingParser.extractStringProperty(accountObject, 'login');
    const paginationObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'pagination');
    item.page = AgentBridgeIncomingParser.extractNumberProperty(paginationObject, 'page', 1);
    item.perPage = AgentBridgeIncomingParser.extractNumberProperty(paginationObject, 'perPage', 30);
    item.hasNext = AgentBridgeIncomingParser.extractBooleanProperty(paginationObject, 'hasNext');
    item.checksSummary = AgentBridgeIncomingParser.parseGitHubChecksSummary(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'checksSummary')
    );
    item.issues = AgentBridgeIncomingParser.parseGitHubIssueRecords(sourceObject);
    item.attachments = AgentBridgeIncomingParser.parseGitHubAttachmentRecords(sourceObject);
    item.pullRequests = AgentBridgeIncomingParser.parseGitHubPullRequestRecords(sourceObject);
    return item;
  }

  static parseGitHubChecksSummary(source: string): AgentBridgeGitHubChecksSummary {
    const item = new AgentBridgeGitHubChecksSummary();
    if (source.length === 0) {
      return item;
    }
    item.total = AgentBridgeIncomingParser.extractNumberProperty(source, 'total', 0);
    item.passed = AgentBridgeIncomingParser.extractNumberProperty(source, 'passed', 0);
    item.failed = AgentBridgeIncomingParser.extractNumberProperty(source, 'failed', 0);
    item.pending = AgentBridgeIncomingParser.extractNumberProperty(source, 'pending', 0);
    item.cancelled = AgentBridgeIncomingParser.extractNumberProperty(source, 'cancelled', 0);
    item.conclusion = AgentBridgeIncomingParser.extractStringProperty(source, 'conclusion');
    item.failures = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'failures');
    return item;
  }

  static parseGitHubIssueRecords(source: string): Array<AgentBridgeGitHubIssueRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'issues');
    const items: Array<AgentBridgeGitHubIssueRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = new AgentBridgeGitHubIssueRecord();
      item.number = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'number', 0);
      item.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objects[index], 'title'));
      item.state = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'state');
      item.url = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'url');
      item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'updatedAt');
      if (item.number > 0 || item.title.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseGitHubAttachmentRecords(source: string): Array<AgentBridgeGitHubAttachmentRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'attachments');
    const items: Array<AgentBridgeGitHubAttachmentRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = new AgentBridgeGitHubAttachmentRecord();
      item.url = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'url');
      item.source = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'source');
      if (item.url.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseGitHubPullRequestRecords(source: string): Array<AgentBridgeGitHubPullRequestRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'pullRequests');
    const items: Array<AgentBridgeGitHubPullRequestRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = new AgentBridgeGitHubPullRequestRecord();
      item.number = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'number', 0);
      item.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objects[index], 'title'));
      item.state = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'state');
      item.url = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'url');
      item.head = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'head');
      item.base = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'base');
      item.sha = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'sha');
      item.draft = AgentBridgeIncomingParser.extractBooleanProperty(objects[index], 'draft');
      item.mergeable = AgentBridgeIncomingParser.extractBooleanProperty(objects[index], 'mergeable');
      item.reviewDecision = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'reviewDecision');
      item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'updatedAt');
      item.reviewers = AgentBridgeIncomingParser.extractStringArrayProperty(objects[index], 'reviewers');
      item.labels = AgentBridgeIncomingParser.extractStringArrayProperty(objects[index], 'labels');
      if (item.number > 0) items.push(item);
    }
    return items;
  }

  static parseNotificationResult(source: string): AgentBridgeNotificationResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const result = new AgentBridgeNotificationResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    result.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    result.notificationId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'notificationId');
    result.actionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'actionId');
    result.notifications = AgentBridgeIncomingParser.parseNotificationRecords(sourceObject);
    const notificationObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'notification');
    if (notificationObject.length > 0) {
      result.notification = AgentBridgeIncomingParser.parseNotificationRecordObject(notificationObject);
    }
    const routeObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'route');
    if (routeObject.length > 0) {
      result.route = AgentBridgeIncomingParser.parseNotificationRouteObject(routeObject);
    } else if (result.notification !== null) {
      result.route = result.notification.route;
    }
    result.totalCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'totalCount', result.notifications.length);
    result.unreadCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'unreadCount', 0);
    result.prunedCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'prunedCount', 0);
    result.removedCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'removedCount', 0);
    result.remainingCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'remainingCount', 0);
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    result.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    if (!result.ok && (result.notification !== null || result.notifications.length > 0)) {
      result.ok = true;
    }
    return result;
  }

  static parseNotificationRecords(source: string): Array<AgentBridgeNotificationRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'notifications');
    const items: Array<AgentBridgeNotificationRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseNotificationRecordObject(objects[index]);
      if (item.notificationId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parsePushStatusResult(source: string): AgentBridgePushStatusResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const result = new AgentBridgePushStatusResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    result.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    result.available = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'available');
    result.configured = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'configured');
    result.deliveryReady = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'deliveryReady');
    result.authMode = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'authMode');
    result.projectId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'projectId');
    result.apiBaseUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'apiBaseUrl');
    result.category = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'category');
    result.testMessage = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'testMessage');
    const subscriptionObjects = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'subscriptions');
    for (let index = 0; index < subscriptionObjects.length; index++) {
      result.subscriptions.push(AgentBridgeIncomingParser.parsePushSubscriptionRecordObject(subscriptionObjects[index]));
    }
    const subscriptionObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'subscription');
    if (subscriptionObject.length > 0) {
      result.subscription = AgentBridgeIncomingParser.parsePushSubscriptionRecordObject(subscriptionObject);
    }
    result.totalCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'totalCount', result.subscriptions.length);
    result.activeCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'activeCount', 0);
    result.notificationId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'notificationId');
    const deliveryObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'delivery');
    if (deliveryObject.length > 0) {
      result.delivery = AgentBridgeIncomingParser.parsePushDeliveryRecordObject(deliveryObject);
    }
    result.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    result.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    result.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    return result;
  }

  private static parsePushSubscriptionRecordObject(source: string): AgentBridgePushSubscriptionRecord {
    const item = new AgentBridgePushSubscriptionRecord();
    item.subscriptionId = AgentBridgeIncomingParser.extractStringProperty(source, 'subscriptionId');
    item.tokenFingerprint = AgentBridgeIncomingParser.extractStringProperty(source, 'tokenFingerprint');
    item.deviceId = AgentBridgeIncomingParser.extractStringProperty(source, 'deviceId');
    item.platform = AgentBridgeIncomingParser.extractStringProperty(source, 'platform');
    item.appVersion = AgentBridgeIncomingParser.extractStringProperty(source, 'appVersion');
    item.enabled = AgentBridgeIncomingParser.extractBooleanProperty(source, 'enabled');
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.lastAttemptAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastAttemptAt');
    item.lastSuccessAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastSuccessAt');
    item.lastFailureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'lastFailureCategory');
    item.lastError = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(source, 'lastError')
    );
    item.deliveryCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'deliveryCount', 0);
    return item;
  }

  private static parsePushDeliveryRecordObject(source: string): AgentBridgePushDeliveryRecord {
    const item = new AgentBridgePushDeliveryRecord();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.attempted = AgentBridgeIncomingParser.extractBooleanProperty(source, 'attempted');
    item.deliveredCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'deliveredCount', 0);
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    item.requestId = AgentBridgeIncomingParser.extractStringProperty(source, 'requestId');
    item.responseCode = AgentBridgeIncomingParser.extractStringProperty(source, 'responseCode');
    item.statusCode = AgentBridgeIncomingParser.extractNumberProperty(source, 'statusCode', 0);
    return item;
  }

  private static parseNotificationRecordObject(source: string): AgentBridgeNotificationRecord {
    const item = new AgentBridgeNotificationRecord();
    item.notificationId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'notificationId', 'id');
    item.kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    item.severity = AgentBridgeIncomingParser.extractStringProperty(source, 'severity');
    item.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'title'));
    item.body = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'body'));
    item.sourceEvent = AgentBridgeIncomingParser.extractStringProperty(source, 'sourceEvent');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.terminalId = AgentBridgeIncomingParser.extractStringProperty(source, 'terminalId');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.read = AgentBridgeIncomingParser.extractBooleanProperty(source, 'read');
    item.clicked = AgentBridgeIncomingParser.extractBooleanProperty(source, 'clicked');
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.expiresAt = AgentBridgeIncomingParser.extractStringProperty(source, 'expiresAt');
    item.ttlMs = AgentBridgeIncomingParser.extractNumberProperty(source, 'ttlMs', 0);
    const routeObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'route');
    if (routeObject.length > 0) {
      item.route = AgentBridgeIncomingParser.parseNotificationRouteObject(routeObject);
    }
    const actionObjects = AgentBridgeIncomingParser.extractObjectArray(source, 'actions');
    const actions: Array<AgentBridgeNotificationActionRecord> = [];
    for (let index = 0; index < actionObjects.length; index++) {
      const action = new AgentBridgeNotificationActionRecord();
      action.id = AgentBridgeIncomingParser.extractFirstStringProperty(actionObjects[index], 'id', 'actionId');
      action.label = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(actionObjects[index], 'label')
      );
      action.kind = AgentBridgeIncomingParser.extractStringProperty(actionObjects[index], 'kind');
      action.destructive = AgentBridgeIncomingParser.extractBooleanProperty(actionObjects[index], 'destructive');
      if (action.id.length > 0) {
        actions.push(action);
      }
    }
    item.actions = actions;
    return item;
  }

  private static parseNotificationRouteObject(source: string): AgentBridgeNotificationRouteRecord {
    const item = new AgentBridgeNotificationRouteRecord();
    item.kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.terminalId = AgentBridgeIncomingParser.extractStringProperty(source, 'terminalId');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.messageId = AgentBridgeIncomingParser.extractStringProperty(source, 'messageId');
    item.requestId = AgentBridgeIncomingParser.extractStringProperty(source, 'requestId');
    item.url = AgentBridgeIncomingParser.extractStringProperty(source, 'url');
    return item;
  }

  static parseSecurityDeviceRecords(source: string): Array<AgentBridgeSecurityDeviceRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'devices');
    const items: Array<AgentBridgeSecurityDeviceRecord> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseSecurityDeviceRecordObject(objects[index]);
      if (item.physicalDeviceId.length > 0 || item.publicKeyFingerprint.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseRelayResult(source: string): AgentBridgeRelayResult {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject: string = payloadObject.length > 0 ? payloadObject : source;
    const result: AgentBridgeRelayResult = new AgentBridgeRelayResult();
    result.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    result.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    result.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    result.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    result.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    result.status = AgentBridgeIncomingParser.parseRelayStatus(sourceObject);
    result.pairingOffer = AgentBridgeIncomingParser.parseRelayPairingOffer(sourceObject);
    result.pairingResult = AgentBridgeIncomingParser.parseRelayPairingResult(sourceObject);
    result.devices = AgentBridgeIncomingParser.parseRelayDeviceRecords(sourceObject);
    result.envelope = AgentBridgeIncomingParser.parseRelayEncryptedEnvelope(sourceObject);
    result.device = AgentBridgeIncomingParser.parseRelayDeviceRecord(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'device')
    );
    result.failure = AgentBridgeIncomingParser.parseRelayFailureDetails(sourceObject);
    result.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    result.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    return result;
  }

  static parseRelayStatus(source: string): AgentBridgeRelayStatus {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const scopedSource: string = payloadObject.length > 0 ? payloadObject : source;
    let statusObject: string = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'status');
    if (statusObject.length === 0) {
      statusObject = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'relay');
    }
    const sourceObject: string = statusObject.length > 0 ? statusObject : scopedSource;
    const item: AgentBridgeRelayStatus = new AgentBridgeRelayStatus();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(scopedSource, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(scopedSource, 'action');
    item.configured = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'configured');
    item.available = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'available');
    item.desiredConnected = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'desiredConnected');
    let stateValue: string = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'state',
      'connectionState'
    );
    if (stateValue.length === 0) {
      stateValue = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'transportStatus');
    }
    item.state = AgentBridgeRelayConnectionState.normalize(stateValue);
    item.transport = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'transport', 'transportStatus');
    item.relayUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'relayUrl');
    item.relayId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'relayId');
    item.connectionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'connectionId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.deviceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'deviceId');
    item.connected = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'connected');
    item.encrypted = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'encrypted');
    item.forwardSecrecy = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'forwardSecrecy');
    item.keyEpoch = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'keyEpoch');
    item.sendSeq = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'sendSeq');
    item.receiveSeq = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'receiveSeq');
    item.reconnectAttempt = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'reconnectAttempt');
    item.activeSessions = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'activeSessions');
    item.pairedDevices = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'pairedDevices');
    item.revokedDevices = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'revokedDevices');
    item.pairedDeviceCount = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'pairedDeviceCount');
    if (item.pairedDeviceCount === 0) {
      item.pairedDeviceCount = item.pairedDevices;
    }
    const pairingObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'pairing');
    item.pairingActive = AgentBridgeIncomingParser.extractBooleanProperty(pairingObject, 'active');
    item.pairingOfferId = AgentBridgeIncomingParser.extractStringProperty(pairingObject, 'offerId');
    item.pairingExpiresAt = AgentBridgeIncomingParser.parseIsoDateProperty(pairingObject, 'expiresAt');
    item.offlineQueueDepth = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'offlineQueueDepth');
    const e2eeObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'e2ee');
    item.protocolVersion = AgentBridgeIncomingParser.extractStringProperty(e2eeObject, 'protocolVersion');
    item.keyAgreement = AgentBridgeIncomingParser.extractStringProperty(e2eeObject, 'keyAgreement');
    item.kdf = AgentBridgeIncomingParser.extractStringProperty(e2eeObject, 'kdf');
    item.cipher = AgentBridgeIncomingParser.extractStringProperty(e2eeObject, 'cipher');
    item.replayProtection = AgentBridgeIncomingParser.extractStringProperty(e2eeObject, 'replayProtection');
    const queueObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'queue');
    item.maxFrameBytes = AgentBridgeIncomingParser.parseRelayCounter(queueObject, 'maxFrameBytes');
    if (item.reconnectAttempt === 0) {
      item.reconnectAttempt = AgentBridgeIncomingParser.parseRelayCounter(queueObject, 'reconnectAttempt');
    }
    item.connectedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'connectedAt');
    item.lastHeartbeatAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'lastHeartbeatAt');
    item.lastFrameAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'lastFrameAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    item.failure = AgentBridgeIncomingParser.parseRelayFailureDetails(scopedSource);
    return item;
  }

  static parseRelayPairingOffer(source: string): AgentBridgeRelayPairingOffer {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const scopedSource: string = payloadObject.length > 0 ? payloadObject : source;
    let offerObject: string = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'pairingOffer');
    if (offerObject.length === 0) {
      offerObject = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'offer');
    }
    const sourceObject: string = offerObject.length > 0 ? offerObject : scopedSource;
    const item: AgentBridgeRelayPairingOffer = new AgentBridgeRelayPairingOffer();
    item.version = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'version');
    item.protocolVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'protocolVersion');
    item.offerId = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'offerId', 'id');
    item.relayUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'relayUrl');
    item.publicRelayUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'publicRelayUrl');
    if (item.relayUrl.length === 0) {
      item.relayUrl = item.publicRelayUrl;
    }
    item.relayId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'relayId');
    item.pairingSecret = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'pairingSecret');
    item.pairingUri = AgentBridgeIncomingParser.extractStringProperty(scopedSource, 'pairingUri');
    item.pairingSessionId = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'pairingSessionId',
      'sessionId'
    );
    item.userCode = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'userCode', 'pairingCode')
    );
    const verificationUrl: string = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'verificationUrl',
      'verificationUri'
    );
    item.verificationUrl = verificationUrl.toLowerCase().startsWith('https://') ? verificationUrl : '';
    item.identityPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      sourceObject,
      'identityPublicKeyBase64',
      8192
    );
    item.identityFingerprintSha256 = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'identityFingerprintSha256',
      'publicKeyFingerprint'
    );
    item.ephemeralPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      sourceObject,
      'ephemeralPublicKeyBase64',
      8192
    );
    item.challengeBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'challengeBase64', 8192);
    item.signatureBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'signatureBase64', 8192);
    item.algorithm = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'algorithm');
    const bridgeIdentityObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'bridgeIdentity');
    item.bridgeIdentityPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      bridgeIdentityObject,
      'publicKeyBase64',
      8192
    );
    item.bridgeIdentityPublicKeyPem = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(bridgeIdentityObject, 'publicKeyPem')
    );
    item.bridgeIdentityFingerprint = AgentBridgeIncomingParser.extractFirstStringProperty(
      bridgeIdentityObject,
      'publicKeyFingerprint',
      'fingerprint'
    );
    item.bridgeIdentityGeneration = AgentBridgeIncomingParser.parseRelayCounter(bridgeIdentityObject, 'generation');
    item.bridgeDisplayName = AgentBridgeIncomingParser.extractStringProperty(bridgeIdentityObject, 'displayName');
    item.bridgePlatform = AgentBridgeIncomingParser.extractStringProperty(bridgeIdentityObject, 'platform');
    if (item.bridgeIdentityPublicKeyBase64.length === 0) {
      item.bridgeIdentityPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
        sourceObject,
        'bridgeIdentityPublicKeyBase64',
        8192
      );
    }
    if (item.bridgeIdentityPublicKeyPem.length === 0) {
      item.bridgeIdentityPublicKeyPem = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'bridgeIdentityPublicKeyPem')
      );
    }
    if (item.bridgeIdentityFingerprint.length === 0) {
      item.bridgeIdentityFingerprint = AgentBridgeIncomingParser.extractStringProperty(
        sourceObject,
        'bridgeIdentityFingerprint'
      );
    }
    item.expiresAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'expiresAt');
    item.expiresAtEpochMs = AgentBridgeIncomingParser.parseRelayTimestamp(sourceObject, 'expiresAt');
    const deviceObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'device');
    item.device = AgentBridgeIncomingParser.parseRelayDeviceRecord(deviceObject);
    return item;
  }

  static parseRelayPairingResult(source: string): AgentBridgeRelayPairingResult {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const scopedSource: string = payloadObject.length > 0 ? payloadObject : source;
    const resultObject: string = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'pairingResult');
    const sourceObject: string = resultObject.length > 0 ? resultObject : scopedSource;
    const item: AgentBridgeRelayPairingResult = new AgentBridgeRelayPairingResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.paired = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'paired');
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.pairingSessionId = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'pairingSessionId',
      'pairingId'
    );
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    item.keyEpoch = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'keyEpoch');
    const deviceObject: string = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'device');
    item.device = AgentBridgeIncomingParser.parseRelayDeviceRecord(deviceObject);
    item.failure = AgentBridgeIncomingParser.parseRelayFailureDetails(sourceObject);
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    return item;
  }

  static parseRelayDeviceRecords(source: string): Array<AgentBridgeRelayDeviceRecord> {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject: string = payloadObject.length > 0 ? payloadObject : source;
    const objects: Array<string> = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'devices');
    const items: Array<AgentBridgeRelayDeviceRecord> = [];
    for (let index: number = 0; index < objects.length; index++) {
      const item: AgentBridgeRelayDeviceRecord = AgentBridgeIncomingParser.parseRelayDeviceRecord(objects[index]);
      if (item.deviceId.length > 0 || item.publicKeyFingerprint.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  static parseRelayDeviceRecord(source: string): AgentBridgeRelayDeviceRecord {
    const item: AgentBridgeRelayDeviceRecord = new AgentBridgeRelayDeviceRecord();
    if (source.length === 0) {
      return item;
    }
    item.deviceId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'deviceId', 'id');
    item.displayName = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'displayName', 'name');
    item.platform = AgentBridgeIncomingParser.extractStringProperty(source, 'platform');
    item.publicKeyFingerprint = AgentBridgeIncomingParser.extractFirstStringProperty(
      source,
      'publicKeyFingerprint',
      'keyFingerprint'
    );
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.trusted = AgentBridgeIncomingParser.extractBooleanProperty(source, 'trusted');
    item.revoked = AgentBridgeIncomingParser.extractBooleanProperty(source, 'revoked');
    item.keyEpoch = AgentBridgeIncomingParser.parseRelayCounter(source, 'keyEpoch');
    item.trustedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'trustedAt');
    item.pairedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'pairedAt');
    item.lastSeenAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'lastSeenAt');
    item.revokedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'revokedAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  static parseRelayEncryptedEnvelope(source: string): AgentBridgeRelayEncryptedEnvelope {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const scopedSource: string = payloadObject.length > 0 ? payloadObject : source;
    const envelopeObject: string = AgentBridgeIncomingParser.extractObjectProperty(scopedSource, 'envelope');
    const sourceObject: string = envelopeObject.length > 0 ? envelopeObject : scopedSource;
    const item: AgentBridgeRelayEncryptedEnvelope = new AgentBridgeRelayEncryptedEnvelope();
    item.version = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'version');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.direction = AgentBridgeRelayDirection.normalize(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'direction')
    );
    item.seq = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'seq');
    item.keyEpoch = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'keyEpoch');
    item.contentType = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'contentType');
    item.nonceBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'nonceBase64', 128);
    if (item.nonceBase64.length === 0) {
      item.nonceBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'iv', 128);
    }
    item.cipherTextBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      sourceObject,
      'cipherTextBase64',
      1500000
    );
    if (item.cipherTextBase64.length === 0) {
      item.cipherTextBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'ciphertext', 1500000);
    }
    item.authTagBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'authTagBase64', 128);
    if (item.authTagBase64.length === 0) {
      item.authTagBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'authTag', 128);
    }
    item.aadBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'aadBase64', 4096);
    item.iv = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'iv', 128);
    item.ciphertext = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'ciphertext', 1500000);
    item.authTag = AgentBridgeIncomingParser.parseRelayEncodedField(sourceObject, 'authTag', 128);
    item.sentAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'sentAt');
    return item;
  }

  static parseRelaySessionResponse(source: string): AgentBridgeRelaySessionResponse {
    const payloadObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject: string = payloadObject.length > 0 ? payloadObject : source;
    const item: AgentBridgeRelaySessionResponse = new AgentBridgeRelaySessionResponse();
    item.protocolVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'protocolVersion');
    item.relayId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'relayId');
    item.deviceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'deviceId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.bridgeIdentityPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      sourceObject,
      'bridgeIdentityPublicKeyBase64',
      8192
    );
    item.bridgeIdentityPublicKeyPem = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'bridgeIdentityPublicKeyPem')
    );
    item.bridgeIdentityFingerprint = AgentBridgeIncomingParser.extractStringProperty(
      sourceObject,
      'bridgeIdentityFingerprint'
    );
    item.bridgeIdentityGeneration = AgentBridgeIncomingParser.parseRelayCounter(
      sourceObject,
      'bridgeIdentityGeneration'
    );
    item.bridgeEphemeralPublicKeyBase64 = AgentBridgeIncomingParser.parseRelayEncodedField(
      sourceObject,
      'bridgeEphemeralPublicKeyBase64',
      8192
    );
    item.bridgeEphemeralPublicKeyPem = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'bridgeEphemeralPublicKeyPem')
    );
    item.clientNonce = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'clientNonce');
    item.bridgeNonce = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'bridgeNonce');
    item.keyEpoch = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'keyEpoch');
    item.issuedAt = AgentBridgeIncomingParser.parseRelayCounter(sourceObject, 'issuedAt');
    item.paired = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'paired');
    item.signature = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'signature');
    return item;
  }

  static parseRelayPairingUri(uri: string): AgentBridgeRelayPairingOffer {
    const empty: AgentBridgeRelayPairingOffer = new AgentBridgeRelayPairingOffer();
    if (uri.length === 0 || uri.length > 32768 ||
      !uri.toLowerCase().startsWith('ngf-agent-bridge://relay#offer=')) {
      return empty;
    }
    const marker: string = '#offer=';
    const markerIndex: number = uri.indexOf(marker);
    if (markerIndex < 0) {
      return empty;
    }
    let encoded: string = uri.substring(markerIndex + marker.length);
    const separatorIndex: number = encoded.indexOf('&');
    if (separatorIndex >= 0) {
      encoded = encoded.substring(0, separatorIndex);
    }
    try {
      encoded = decodeURIComponent(encoded);
      if (!AgentBridgeIncomingParser.isRelayBase64Url(encoded, 30000)) {
        return empty;
      }
      while (encoded.length % 4 !== 0) {
        encoded += '=';
      }
      const helper: util.Base64Helper = new util.Base64Helper();
      const decoded: Uint8Array = helper.decodeSync(encoded, util.Type.BASIC_URL_SAFE);
      const decoder: util.TextDecoder = new util.TextDecoder('utf-8');
      const json: string = decoder.decodeToString(decoded);
      const offer: AgentBridgeRelayPairingOffer = AgentBridgeIncomingParser.parseRelayPairingOffer(json);
      offer.pairingUri = uri;
      if (!AgentBridgeIncomingParser.isUsableRelayPairingOffer(offer)) {
        return empty;
      }
      return offer;
    } catch (error) {
      return empty;
    }
  }

  static parseRelayPublicEndpoint(endpoint: string): AgentBridgeRelayPublicEndpoint {
    const item: AgentBridgeRelayPublicEndpoint = new AgentBridgeRelayPublicEndpoint();
    if (endpoint.length === 0 || endpoint.length > 32768 ||
      !endpoint.toLowerCase().startsWith('ngf-agent-bridge://relay?')) {
      return item;
    }
    item.relayUrl = AgentBridgeIncomingParser.extractRelayQueryValue(endpoint, 'relayUrl');
    item.relayId = AgentBridgeIncomingParser.extractRelayQueryValue(endpoint, 'relayId');
    item.bridgeIdentityPublicKeyBase64 = AgentBridgeIncomingParser.extractRelayQueryValue(
      endpoint,
      'bridgeIdentityPublicKeyBase64'
    );
    item.bridgeIdentityPublicKeyPem = AgentBridgeIncomingParser.extractRelayQueryValue(
      endpoint,
      'bridgeIdentityPublicKeyPem'
    );
    item.bridgeIdentityFingerprint = AgentBridgeIncomingParser.extractRelayQueryValue(
      endpoint,
      'bridgeIdentityFingerprint'
    );
    if (!AgentBridgeIncomingParser.isSafeRelayUrl(item.relayUrl) ||
      !AgentBridgeIncomingParser.isSafeRelayIdentifier(item.relayId, 32, 128) ||
      !AgentBridgeIncomingParser.isSafeRelayFingerprint(item.bridgeIdentityFingerprint) ||
      (item.bridgeIdentityPublicKeyBase64.length === 0 && item.bridgeIdentityPublicKeyPem.length === 0)) {
      return new AgentBridgeRelayPublicEndpoint();
    }
    return item;
  }

  static buildRelayPublicEndpoint(offer: AgentBridgeRelayPairingOffer): string {
    if (!AgentBridgeIncomingParser.isUsableRelayPairingOffer(offer)) {
      return '';
    }
    let endpoint: string = 'ngf-agent-bridge://relay?relayUrl=' + encodeURIComponent(offer.relayUrl) +
      '&relayId=' + encodeURIComponent(offer.relayId);
    if (offer.bridgeIdentityPublicKeyBase64.length > 0) {
      endpoint += '&bridgeIdentityPublicKeyBase64=' + encodeURIComponent(offer.bridgeIdentityPublicKeyBase64);
    } else {
      endpoint += '&bridgeIdentityPublicKeyPem=' + encodeURIComponent(offer.bridgeIdentityPublicKeyPem);
    }
    endpoint += '&bridgeIdentityFingerprint=' + encodeURIComponent(offer.bridgeIdentityFingerprint);
    return endpoint;
  }

  private static parseRelayFailureDetails(source: string): AgentBridgeRelayFailureDetails {
    const failureObject: string = AgentBridgeIncomingParser.extractObjectProperty(source, 'failure');
    const sourceObject: string = failureObject.length > 0 ? failureObject : source;
    const item: AgentBridgeRelayFailureDetails = new AgentBridgeRelayFailureDetails();
    item.failureCategory = AgentBridgeIncomingParser.extractFirstStringProperty(
      sourceObject,
      'failureCategory',
      'code'
    );
    item.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    return item;
  }

  private static parseRelayCounter(source: string, propertyName: string): number {
    const value: number = AgentBridgeIncomingParser.extractNumberProperty(source, propertyName, 0);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 9007199254740991) {
      return 0;
    }
    return value;
  }

  private static parseRelayTimestamp(source: string, propertyName: string): number {
    const numericValue: number = AgentBridgeIncomingParser.extractNumberProperty(source, propertyName, 0);
    if (Number.isFinite(numericValue) && Number.isInteger(numericValue) && numericValue > 0) {
      return numericValue;
    }
    const textValue: string = AgentBridgeIncomingParser.extractStringProperty(source, propertyName);
    if (textValue.length === 0) {
      return 0;
    }
    const parsed: number = Date.parse(textValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private static parseRelayEncodedField(source: string, propertyName: string, maxLength: number): string {
    const value: string = AgentBridgeIncomingParser.extractStringProperty(source, propertyName);
    if (value.length === 0 || value.length > maxLength) {
      return '';
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!alphaNumeric && code !== 43 && code !== 47 && code !== 61 && code !== 45 && code !== 95) {
        return '';
      }
    }
    return value;
  }

  private static extractRelayQueryValue(endpoint: string, name: string): string {
    const queryIndex: number = endpoint.indexOf('?');
    if (queryIndex < 0) {
      return '';
    }
    const fragmentIndex: number = endpoint.indexOf('#', queryIndex + 1);
    const query: string = fragmentIndex >= 0 ? endpoint.substring(queryIndex + 1, fragmentIndex) :
      endpoint.substring(queryIndex + 1);
    const parts: Array<string> = query.split('&');
    const prefix: string = name + '=';
    for (let index: number = 0; index < parts.length; index++) {
      if (parts[index].startsWith(prefix)) {
        try {
          return decodeURIComponent(parts[index].substring(prefix.length));
        } catch (error) {
          return '';
        }
      }
    }
    return '';
  }

  private static isUsableRelayPairingOffer(offer: AgentBridgeRelayPairingOffer): boolean {
    return AgentBridgeIncomingParser.isSafeRelayUrl(offer.relayUrl) &&
      AgentBridgeIncomingParser.isSafeRelayIdentifier(offer.relayId, 32, 128) &&
      AgentBridgeIncomingParser.isSafeRelayIdentifier(offer.offerId, 12, 160) &&
      AgentBridgeIncomingParser.isRelayBase64Url(offer.pairingSecret, 512) &&
      AgentBridgeIncomingParser.isSafeRelayFingerprint(offer.bridgeIdentityFingerprint) &&
      (offer.bridgeIdentityPublicKeyBase64.length > 0 || offer.bridgeIdentityPublicKeyPem.length > 0);
  }

  private static isSafeRelayUrl(value: string): boolean {
    const lower: string = value.toLowerCase();
    if ((!lower.startsWith('wss://') && !lower.startsWith('ws://')) || value.indexOf('@') >= 0 ||
      value.indexOf('#') >= 0 || value.indexOf('?') >= 0 || value.indexOf('\\') >= 0 ||
      value.indexOf(' ') >= 0 || value.indexOf('\t') >= 0 || value.indexOf('\r') >= 0 ||
      value.indexOf('\n') >= 0) {
      return false;
    }
    const schemeLength: number = lower.startsWith('wss://') ? 6 : 5;
    const remainder: string = value.substring(schemeLength);
    const slashIndex: number = remainder.indexOf('/');
    const authority: string = slashIndex >= 0 ? remainder.substring(0, slashIndex) : remainder;
    if (authority.length === 0) {
      return false;
    }
    if (lower.startsWith('wss://')) {
      return true;
    }
    const lowerAuthority: string = authority.toLowerCase();
    if (lowerAuthority.startsWith('[::1]')) {
      return AgentBridgeIncomingParser.isSafeRelayPortSuffix(lowerAuthority.substring(5));
    }
    const colonIndex: number = lowerAuthority.lastIndexOf(':');
    const host: string = colonIndex >= 0 ? lowerAuthority.substring(0, colonIndex) : lowerAuthority;
    const portSuffix: string = colonIndex >= 0 ? lowerAuthority.substring(colonIndex) : '';
    return (host === 'localhost' || host === '127.0.0.1') &&
      AgentBridgeIncomingParser.isSafeRelayPortSuffix(portSuffix);
  }

  private static isSafeRelayPortSuffix(value: string): boolean {
    if (value.length === 0) {
      return true;
    }
    if (!value.startsWith(':') || value.length < 2 || value.length > 6) {
      return false;
    }
    for (let index: number = 1; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      if (code < 48 || code > 57) {
        return false;
      }
    }
    const port: number = Number(value.substring(1));
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  private static isSafeRelayIdentifier(value: string, minLength: number, maxLength: number): boolean {
    if (value.length < minLength || value.length > maxLength) {
      return false;
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!alphaNumeric && code !== 45 && code !== 95) {
        return false;
      }
    }
    return true;
  }

  private static isSafeRelayFingerprint(value: string): boolean {
    if (value.length !== 64) {
      return false;
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const digit: boolean = code >= 48 && code <= 57;
      const lowerHex: boolean = code >= 97 && code <= 102;
      const upperHex: boolean = code >= 65 && code <= 70;
      if (!digit && !lowerHex && !upperHex) {
        return false;
      }
    }
    return true;
  }

  private static isRelayBase64Url(value: string, maxLength: number): boolean {
    if (value.length === 0 || value.length > maxLength) {
      return false;
    }
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      const alphaNumeric: boolean = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
      if (!alphaNumeric && code !== 45 && code !== 95 && code !== 61) {
        return false;
      }
    }
    return true;
  }

  static parseDaemonStatus(source: string): AgentBridgeDaemonStatus {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeDaemonStatus();
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    item.health = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'health');
    item.pid = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'pid', 0);
    item.supervisorPid = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'supervisorPid', 0);
    item.workerPid = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'workerPid', 0);
    item.supervised = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'supervised');
    item.workerGeneration = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'workerGeneration', 0);
    item.workerReady = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'workerReady');
    item.startedAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'startedAt');
    item.workerStartedAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'workerStartedAt');
    item.workerReadyAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'workerReadyAt');
    item.lastHeartbeatAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastHeartbeatAt');
    item.lastWorkerHeartbeatAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastWorkerHeartbeatAt');
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'exitCode', 0);
    item.lastError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastError'));
    item.restartCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'restartCount', 0);
    item.consecutiveCrashes = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'consecutiveCrashes', 0);
    item.crashWindowCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'crashWindowCount', 0);
    item.crashLoop = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'crashLoop');
    item.nextRestartAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'nextRestartAt');
    item.lastRestartReason = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'lastRestartReason');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'warnings');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.serverId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'serverId');
    item.uptimeSec = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'uptimeSec', 0);
    item.activeConnections = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'activeConnections', 0);
    item.activeWebSocketConnections = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'activeWebSocketConnections', 0);
    item.managedProcessesJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'managedProcesses');
    item.featuresJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'features');
    item.autostartJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'autostart');
    item.autostartPreviewJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'preview');
    item.autostartEnabled = AgentBridgeIncomingParser.extractBooleanProperty(item.autostartJson, 'enabled');
    item.autostartConfigured = AgentBridgeIncomingParser.extractBooleanProperty(item.autostartJson, 'configured');
    item.autostartSupported = AgentBridgeIncomingParser.extractBooleanProperty(item.autostartJson, 'supported');
    item.autostartMethod = AgentBridgeIncomingParser.extractStringProperty(item.autostartJson, 'method');
    item.autostartPlatform = AgentBridgeIncomingParser.extractStringProperty(item.autostartJson, 'platform');
    item.autostartRegistrationId = AgentBridgeIncomingParser.extractStringProperty(item.autostartJson, 'registrationId');
    item.autostartTargetPath = AgentBridgeIncomingParser.extractStringProperty(item.autostartJson, 'targetPath');
    item.autostartRunnerPath = AgentBridgeIncomingParser.extractStringProperty(item.autostartJson, 'runnerPath');
    item.autostartWarning = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractFirstStringProperty(item.autostartJson, 'warning', 'lastError')
    );
    item.configPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'configPath');
    item.logPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'logPath');
    item.instanceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'instanceId');
    item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'hostProfileId');
    item.instanceHealth = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'instanceHealth');
    item.generation = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'generation', item.workerGeneration);
    item.bridgeVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'bridgeVersion');
    item.nodeVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'nodeVersion');
    item.platform = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'platform');
    item.architecture = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'architecture');
    item.remoteConfigJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'remoteConfig');
    const doctorObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'doctor');
    item.doctor = AgentBridgeIncomingParser.parseDaemonDoctorReport(doctorObject);
    return item;
  }

  static parseDaemonConfigResult(source: string): AgentBridgeDaemonConfigResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeDaemonConfigResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.configVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'configVersion');
    item.activeVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'activeVersion');
    item.previousVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'previousVersion');
    item.fetchedVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'fetchedVersion');
    item.manifestDigest = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'manifestDigest');
    item.requiresRestart = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'requiresRestart');
    item.degraded = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'degraded');
    const validationObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'validation');
    item.validationOk = AgentBridgeIncomingParser.extractBooleanProperty(validationObject, 'ok');
    item.validationFailureCategory = AgentBridgeIncomingParser.extractStringProperty(validationObject, 'failureCategory');
    item.overriddenFieldsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'overriddenFields');
    const scopeObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'scope');
    item.scopeKind = AgentBridgeIncomingParser.extractStringProperty(scopeObject, 'kind');
    item.priority = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'priority', 0);
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    item.sourceUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sourceUrl');
    item.instanceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'instanceId');
    item.generation = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'generation', 0);
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'warnings');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    return item;
  }

  static parseM7Result(source: string): AgentBridgeM7Result {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeM7Result();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.available = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'available');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    item.total = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'total', 0);
    item.scheduleId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'scheduleId');
    item.loopId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'loopId');
    item.roomId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'roomId');
    item.scheduleCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'schedules', 0);
    item.enabledScheduleCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'enabledSchedules', 0);
    item.activeRunCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'activeRuns', 0);
    item.queuedRunCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'queuedRuns', 0);
    item.loopCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'loops', 0);
    item.runningLoopCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'running', 0);
    item.pausedLoopCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'paused', 0);
    item.roomCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'rooms', 0);
    item.messageCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'messages', 0);
    item.schedules = AgentBridgeIncomingParser.parseScheduleRecords(sourceObject, 'schedules');
    item.schedule = AgentBridgeIncomingParser.parseScheduleRecord(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'schedule')
    );
    item.runs = AgentBridgeIncomingParser.parseScheduleRunRecords(sourceObject, 'runs');
    item.run = AgentBridgeIncomingParser.parseScheduleRunRecord(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'run')
    );
    item.nextCursor = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'nextCursor');
    item.loops = AgentBridgeIncomingParser.parseLoopRecords(sourceObject, 'loops');
    item.loop = AgentBridgeIncomingParser.parseLoopRecord(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'loop')
    );
    item.rounds = AgentBridgeIncomingParser.parseLoopRoundRecords(sourceObject, 'rounds');
    item.nextOffset = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'nextOffset', 0);
    item.rooms = AgentBridgeIncomingParser.parseChatRoomRecords(sourceObject, 'rooms');
    item.room = AgentBridgeIncomingParser.parseChatRoomRecord(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'room')
    );
    item.member = AgentBridgeIncomingParser.parseChatRoomMember(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'member')
    );
    item.messages = AgentBridgeIncomingParser.parseChatRoomMessages(sourceObject, 'messages');
    item.chatMessage = AgentBridgeIncomingParser.parseChatRoomMessage(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'message')
    );
    item.ack = AgentBridgeIncomingParser.parseChatRoomAck(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'ack')
    );
    item.firstSeq = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'firstSeq', 0);
    item.lastSeq = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'lastSeq', 0);
    item.nextBeforeSeq = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'nextBeforeSeq', 0);
    item.nextAfterSeq = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'nextAfterSeq', 0);
    item.unreadCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'unreadCount', 0);
    item.dispatchedAgentCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'dispatchedAgentCount', 0);
    item.duplicate = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'duplicate');
    return item;
  }

  private static parseScheduleRecords(source: string, propertyName: string): Array<AgentBridgeScheduleRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeScheduleRecord> = [];
    for (let index = 0; index < objects.length && index < 500; index++) {
      const item = AgentBridgeIncomingParser.parseScheduleRecord(objects[index]);
      if (item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseScheduleRecord(source: string): AgentBridgeScheduleRecord {
    const item = new AgentBridgeScheduleRecord();
    if (source.length === 0) {
      return item;
    }
    item.id = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'id', 'scheduleId');
    item.name = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'name'));
    item.prompt = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'prompt'));
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.workspacePath = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'workspacePath', 'cwd');
    item.providerId = AgentBridgeIncomingParser.extractStringProperty(source, 'providerId');
    item.modelId = AgentBridgeIncomingParser.extractStringProperty(source, 'modelId');
    item.enabled = AgentBridgeIncomingParser.extractBooleanProperty(source, 'enabled');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.cadence = AgentBridgeIncomingParser.parseScheduleCadence(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'cadence')
    );
    item.concurrency = AgentBridgeIncomingParser.parseScheduleConcurrency(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'concurrency')
    );
    item.retry = AgentBridgeIncomingParser.parseScheduleRetry(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'retry')
    );
    item.retention = AgentBridgeIncomingParser.parseScheduleRetention(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'retention')
    );
    item.missedRunPolicy = AgentBridgeIncomingParser.extractStringProperty(source, 'missedRunPolicy');
    item.nextRunAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'nextRunAt');
    item.lastRunAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'lastRunAt');
    item.totalRuns = AgentBridgeIncomingParser.extractNumberProperty(source, 'totalRuns', 0);
    item.successfulRuns = AgentBridgeIncomingParser.extractNumberProperty(source, 'successfulRuns', 0);
    item.failedRuns = AgentBridgeIncomingParser.extractNumberProperty(source, 'failedRuns', 0);
    item.activeRuns = AgentBridgeIncomingParser.extractNumberProperty(source, 'activeRuns', 0);
    item.queuedRuns = AgentBridgeIncomingParser.extractNumberProperty(source, 'queuedRuns', 0);
    item.revision = AgentBridgeIncomingParser.extractNumberProperty(source, 'revision', 0);
    item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseScheduleCadence(source: string): AgentBridgeScheduleCadence {
    const item = new AgentBridgeScheduleCadence();
    item.type = AgentBridgeIncomingParser.extractStringProperty(source, 'type');
    if (item.type.length === 0) {
      item.type = 'cron';
    }
    item.expression = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'expression', 'cron');
    item.timezone = AgentBridgeIncomingParser.extractStringProperty(source, 'timezone');
    if (item.timezone.length === 0) {
      item.timezone = 'UTC';
    }
    return item;
  }

  private static parseScheduleConcurrency(source: string): AgentBridgeScheduleConcurrency {
    const item = new AgentBridgeScheduleConcurrency();
    item.limit = Math.max(1, AgentBridgeIncomingParser.extractNumberProperty(source, 'limit', 1));
    item.overlapPolicy = AgentBridgeIncomingParser.extractStringProperty(source, 'overlapPolicy');
    if (item.overlapPolicy.length === 0) {
      item.overlapPolicy = 'skip';
    }
    return item;
  }

  private static parseScheduleRetry(source: string): AgentBridgeScheduleRetry {
    const item = new AgentBridgeScheduleRetry();
    item.maxAttempts = Math.max(1, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxAttempts', 1));
    item.initialDelayMs = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'initialDelayMs', 0));
    item.backoffMultiplier = Math.max(1, AgentBridgeIncomingParser.extractNumberProperty(source, 'backoffMultiplier', 2));
    return item;
  }

  private static parseScheduleRetention(source: string): AgentBridgeScheduleRetention {
    const item = new AgentBridgeScheduleRetention();
    item.maxRuns = Math.max(1, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxRuns', 50));
    item.maxAgeDays = Math.max(1, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxAgeDays', 30));
    return item;
  }

  private static parseScheduleRunRecords(source: string, propertyName: string): Array<AgentBridgeScheduleRunRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeScheduleRunRecord> = [];
    for (let index = 0; index < objects.length && index < 500; index++) {
      const item = AgentBridgeIncomingParser.parseScheduleRunRecord(objects[index]);
      if (item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseScheduleRunRecord(source: string): AgentBridgeScheduleRunRecord {
    const item = new AgentBridgeScheduleRunRecord();
    if (source.length === 0) {
      return item;
    }
    item.id = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'id', 'runId');
    item.scheduleId = AgentBridgeIncomingParser.extractStringProperty(source, 'scheduleId');
    item.reason = AgentBridgeIncomingParser.extractStringProperty(source, 'reason');
    item.scheduledFor = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'scheduledFor');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    const attempts = AgentBridgeIncomingParser.extractObjectArray(source, 'attempts');
    for (let index = 0; index < attempts.length && index < 20; index++) {
      const attempt = new AgentBridgeScheduleRunAttempt();
      attempt.attempt = AgentBridgeIncomingParser.extractNumberProperty(attempts[index], 'attempt', 0);
      attempt.status = AgentBridgeIncomingParser.extractStringProperty(attempts[index], 'status');
      attempt.failureCategory = AgentBridgeIncomingParser.extractStringProperty(attempts[index], 'failureCategory');
      attempt.message = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(attempts[index], 'message')
      );
      attempt.startedAt = AgentBridgeIncomingParser.parseIsoDateProperty(attempts[index], 'startedAt');
      attempt.completedAt = AgentBridgeIncomingParser.parseIsoDateProperty(attempts[index], 'completedAt');
      item.attempts.push(attempt);
    }
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.startedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'startedAt');
    item.completedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'completedAt');
    item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseLoopRecords(source: string, propertyName: string): Array<AgentBridgeLoopRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeLoopRecord> = [];
    for (let index = 0; index < objects.length && index < 500; index++) {
      const item = AgentBridgeIncomingParser.parseLoopRecord(objects[index]);
      if (item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseLoopRecord(source: string): AgentBridgeLoopRecord {
    const item = new AgentBridgeLoopRecord();
    if (source.length === 0) {
      return item;
    }
    item.id = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'id', 'loopId');
    item.name = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'name'));
    item.prompt = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'prompt'));
    item.verifyPrompt = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'verifyPrompt'));
    item.acceptanceCriteria = AgentBridgeIncomingParser.parseLoopCriteria(source);
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.workspacePath = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'workspacePath', 'cwd');
    item.runtimeWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeWorkspaceId');
    item.runtimeWorkspacePath = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeWorkspacePath');
    item.worktreeId = AgentBridgeIncomingParser.extractStringProperty(source, 'worktreeId');
    item.branch = AgentBridgeIncomingParser.extractStringProperty(source, 'branch');
    item.sourceAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'sourceAgentId');
    item.workerProviderId = AgentBridgeIncomingParser.extractStringProperty(source, 'workerProviderId');
    item.workerModelId = AgentBridgeIncomingParser.extractStringProperty(source, 'workerModelId');
    item.verifierProviderId = AgentBridgeIncomingParser.extractStringProperty(source, 'verifierProviderId');
    item.verifierModelId = AgentBridgeIncomingParser.extractStringProperty(source, 'verifierModelId');
    item.workspaceMode = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceMode');
    item.maxRounds = AgentBridgeIncomingParser.extractNumberProperty(source, 'maxRounds', 0);
    item.budget = AgentBridgeIncomingParser.parseLoopBudget(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'budget')
    );
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.terminationReason = AgentBridgeIncomingParser.extractStringProperty(source, 'terminationReason');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    item.activeWorkerAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'activeWorkerAgentId');
    item.activeVerifierAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'activeVerifierAgentId');
    item.takeoverAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'takeoverAgentId');
    item.generation = AgentBridgeIncomingParser.extractNumberProperty(source, 'generation', 0);
    item.revision = AgentBridgeIncomingParser.extractNumberProperty(source, 'revision', 0);
    item.running = AgentBridgeIncomingParser.extractBooleanProperty(source, 'running');
    item.resumeAvailable = AgentBridgeIncomingParser.extractBooleanProperty(source, 'resumeAvailable');
    item.rounds = AgentBridgeIncomingParser.parseLoopRoundRecords(source, 'rounds');
    item.usage = AgentBridgeIncomingParser.parseLoopUsage(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'usage')
    );
    item.startedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'startedAt');
    item.completedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'completedAt');
    item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseLoopCriteria(source: string): Array<AgentBridgeLoopAcceptanceCriterion> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'acceptanceCriteria');
    const items: Array<AgentBridgeLoopAcceptanceCriterion> = [];
    for (let index = 0; index < objects.length && index < 20; index++) {
      const item = new AgentBridgeLoopAcceptanceCriterion();
      item.id = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'id');
      item.description = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(objects[index], 'description', 'text')
      );
      if (item.id.length > 0 && item.description.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseLoopBudget(source: string): AgentBridgeLoopBudget {
    const item = new AgentBridgeLoopBudget();
    item.maxTokens = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxTokens', 0));
    item.maxCost = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxCost', 0));
    item.currency = AgentBridgeIncomingParser.extractStringProperty(source, 'currency');
    item.maxDurationMs = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'maxDurationMs', 0));
    return item;
  }

  private static parseLoopUsage(source: string): AgentBridgeLoopUsage {
    const item = new AgentBridgeLoopUsage();
    item.totalTokens = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'totalTokens', 0));
    item.costByCurrencyJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'costByCurrency');
    item.startedAtMs = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'startedAtMs', 0));
    return item;
  }

  private static parseLoopRoundRecords(source: string, propertyName: string): Array<AgentBridgeLoopRoundRecord> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeLoopRoundRecord> = [];
    for (let index = 0; index < objects.length && index < 100; index++) {
      const item = AgentBridgeIncomingParser.parseLoopRoundRecord(objects[index]);
      if (item.round > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseLoopRoundRecord(source: string): AgentBridgeLoopRoundRecord {
    const item = new AgentBridgeLoopRoundRecord();
    if (source.length === 0) {
      return item;
    }
    item.round = AgentBridgeIncomingParser.extractNumberProperty(source, 'round', 0);
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.workerAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'workerAgentId');
    item.verifierAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'verifierAgentId');
    item.workerOutput = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'workerOutput'));
    item.verification = AgentBridgeIncomingParser.parseLoopVerification(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'verification')
    );
    const usage = AgentBridgeIncomingParser.extractObjectProperty(source, 'usage');
    item.workerUsage = AgentBridgeIncomingParser.parseLoopRoundUsage(
      AgentBridgeIncomingParser.extractObjectProperty(usage, 'worker')
    );
    item.verifierUsage = AgentBridgeIncomingParser.parseLoopRoundUsage(
      AgentBridgeIncomingParser.extractObjectProperty(usage, 'verifier')
    );
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.startedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'startedAt');
    item.completedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'completedAt');
    return item;
  }

  private static parseLoopRoundUsage(source: string): AgentBridgeLoopRoundUsage {
    const item = new AgentBridgeLoopRoundUsage();
    item.totalTokens = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'totalTokens', 0));
    item.cost = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(source, 'cost', 0));
    item.currency = AgentBridgeIncomingParser.extractStringProperty(source, 'currency');
    item.estimated = AgentBridgeIncomingParser.extractBooleanProperty(source, 'estimated');
    return item;
  }

  private static parseLoopVerification(source: string): AgentBridgeLoopVerification {
    const item = new AgentBridgeLoopVerification();
    if (source.length === 0) {
      return item;
    }
    item.available = true;
    item.passed = AgentBridgeIncomingParser.extractBooleanProperty(source, 'passed');
    item.summary = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'summary'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'checks');
    for (let index = 0; index < objects.length && index < 20; index++) {
      const check = new AgentBridgeLoopVerificationCheck();
      check.criterionId = AgentBridgeIncomingParser.extractFirstStringProperty(objects[index], 'criterionId', 'id');
      check.passed = AgentBridgeIncomingParser.extractBooleanProperty(objects[index], 'passed');
      check.evidence = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objects[index], 'evidence'));
      check.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objects[index], 'remediation'));
      if (check.criterionId.length > 0) {
        item.checks.push(check);
      }
    }
    return item;
  }

  private static parseChatRoomRecords(source: string, propertyName: string): Array<AgentBridgeChatRoom> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeChatRoom> = [];
    for (let index = 0; index < objects.length && index < 500; index++) {
      const item = AgentBridgeIncomingParser.parseChatRoomRecord(objects[index]);
      if (item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseChatRoomRecord(source: string): AgentBridgeChatRoom {
    const item = new AgentBridgeChatRoom();
    if (source.length === 0) {
      return item;
    }
    item.id = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'id', 'roomId');
    item.name = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'name'));
    item.purpose = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'purpose'));
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.sequence = AgentBridgeIncomingParser.extractNumberProperty(source, 'sequence', 0);
    item.retentionMaxMessages = AgentBridgeIncomingParser.extractNumberProperty(source, 'retentionMaxMessages', 0);
    item.members = AgentBridgeIncomingParser.parseChatRoomMembers(source);
    item.archivedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'archivedAt');
    item.messageCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'messageCount', 0);
    item.unreadCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'unreadCount', 0);
    item.currentMemberId = AgentBridgeIncomingParser.extractStringProperty(source, 'currentMemberId');
    item.currentRole = AgentBridgeIncomingParser.extractStringProperty(source, 'currentRole');
    item.canPost = AgentBridgeIncomingParser.extractBooleanProperty(source, 'canPost');
    item.canManage = AgentBridgeIncomingParser.extractBooleanProperty(source, 'canManage');
    item.revision = AgentBridgeIncomingParser.extractNumberProperty(source, 'revision', 0);
    item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseChatRoomMembers(source: string): Array<AgentBridgeChatRoomMember> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'members');
    const items: Array<AgentBridgeChatRoomMember> = [];
    for (let index = 0; index < objects.length && index < 100; index++) {
      const item = AgentBridgeIncomingParser.parseChatRoomMember(objects[index]);
      if (item.memberId.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseChatRoomMember(source: string): AgentBridgeChatRoomMember {
    const item = new AgentBridgeChatRoomMember();
    if (source.length === 0) {
      item.active = false;
      return item;
    }
    item.memberId = AgentBridgeIncomingParser.extractStringProperty(source, 'memberId');
    item.type = AgentBridgeIncomingParser.extractStringProperty(source, 'type');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.displayName = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'displayName'));
    item.role = AgentBridgeIncomingParser.extractStringProperty(source, 'role');
    item.active = source.indexOf('"active"') >= 0 ? AgentBridgeIncomingParser.extractBooleanProperty(source, 'active') : true;
    item.joinedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'joinedAt');
    item.leftAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'leftAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseChatRoomMessages(source: string, propertyName: string): Array<AgentBridgeChatRoomMessage> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, propertyName);
    const items: Array<AgentBridgeChatRoomMessage> = [];
    for (let index = 0; index < objects.length && index < 200; index++) {
      const item = AgentBridgeIncomingParser.parseChatRoomMessage(objects[index]);
      if (item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseChatRoomMessage(source: string): AgentBridgeChatRoomMessage {
    const item = new AgentBridgeChatRoomMessage();
    if (source.length === 0) {
      return item;
    }
    item.id = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'id', 'messageId');
    item.roomId = AgentBridgeIncomingParser.extractStringProperty(source, 'roomId');
    item.seq = AgentBridgeIncomingParser.extractNumberProperty(source, 'seq', 0);
    item.clientMessageId = AgentBridgeIncomingParser.extractStringProperty(source, 'clientMessageId');
    item.authorMemberId = AgentBridgeIncomingParser.extractStringProperty(source, 'authorMemberId');
    item.authorType = AgentBridgeIncomingParser.extractStringProperty(source, 'authorType');
    item.authorAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'authorAgentId');
    item.body = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractFirstStringProperty(source, 'body', 'text'));
    item.replyToMessageId = AgentBridgeIncomingParser.extractStringProperty(source, 'replyToMessageId');
    item.threadId = AgentBridgeIncomingParser.extractStringProperty(source, 'threadId');
    item.mentionMemberIds = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'mentionMemberIds');
    item.routeOriginMessageId = AgentBridgeIncomingParser.extractStringProperty(source, 'routeOriginMessageId');
    item.routingDepth = AgentBridgeIncomingParser.extractNumberProperty(source, 'routingDepth', 0);
    const deliveries = AgentBridgeIncomingParser.extractObjectArray(source, 'deliveries');
    for (let index = 0; index < deliveries.length && index < 20; index++) {
      const delivery = new AgentBridgeChatRoomDelivery();
      delivery.memberId = AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'memberId');
      delivery.agentId = AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'agentId');
      delivery.status = AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'status');
      delivery.responseMessageId = AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'responseMessageId');
      delivery.failureCategory = AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'failureCategory');
      delivery.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(deliveries[index], 'message'));
      delivery.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(deliveries[index], 'updatedAt');
      item.deliveries.push(delivery);
    }
    item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  private static parseChatRoomAck(source: string): AgentBridgeChatRoomAck {
    const item = new AgentBridgeChatRoomAck();
    item.roomId = AgentBridgeIncomingParser.extractStringProperty(source, 'roomId');
    item.memberId = AgentBridgeIncomingParser.extractStringProperty(source, 'memberId');
    item.lastSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'lastSeq', 0);
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'updatedAt');
    return item;
  }

  static parseExperienceResult(source: string): AgentBridgeExperienceResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeExperienceResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.requestId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'requestId');
    item.kind = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'kind');
    item.suggestion = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'suggestion'));
    item.planId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'planId');
    item.sourceProvider = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sourceProvider');
    item.estimatedUsage = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'estimatedUsage');
    const summary = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'summary');
    item.usageSummary = AgentBridgeIncomingParser.parseUsageSummary(summary);
    item.providerUsage = AgentBridgeIncomingParser.parseProviderUsageResult(sourceObject);
    item.realTokens = AgentBridgeIncomingParser.extractNumberProperty(summary, 'realTokens', -1);
    item.estimatedTokens = AgentBridgeIncomingParser.extractNumberProperty(summary, 'estimatedTokens', -1);
    item.realCost = AgentBridgeIncomingParser.extractNumberProperty(summary, 'realCost', -1);
    item.estimatedCost = AgentBridgeIncomingParser.extractNumberProperty(summary, 'estimatedCost', -1);
    if (item.realTokens < 0) {
      item.realTokens = item.usageSummary.actual.tokens.totalTokens;
    }
    if (item.estimatedTokens < 0) {
      item.estimatedTokens = item.usageSummary.estimated.tokens.totalTokens;
    }
    item.currency = AgentBridgeIncomingParser.extractStringProperty(summary, 'currency');
    item.eventCount = AgentBridgeIncomingParser.extractNumberProperty(summary, 'eventCount', 0);
    item.compactions = AgentBridgeIncomingParser.extractNumberProperty(summary, 'compactions', 0);
    item.queueItemsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'items');
    item.queueItemJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'item');
    item.usageEventsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'events');
    item.usageEventJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'usage');
    item.budgetJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'budget');
    item.reportJson = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'report');
    item.budget = AgentBridgeIncomingParser.parseUsageBudget(item.budgetJson);
    item.diagnosticsReport = AgentBridgeIncomingParser.parseDiagnosticsReport(item.reportJson);
    item.queueItem = AgentBridgeIncomingParser.parseMessageQueueItem(item.queueItemJson);
    item.usageEvent = AgentBridgeIncomingParser.parseUsageEvent(item.usageEventJson);
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.cancelled = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'cancelled');
    item.timeoutMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'timeoutMs', 0);
    item.alternativesJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'alternatives');
    item.alternatives = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'alternatives');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'warnings');
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    item.budgetWarnings = AgentBridgeIncomingParser.parseUsageBudgetWarnings(item.warningsJson);
    if (item.action === AgentBridgeEventType.USAGE_BUDGET_WARNING) {
      item.budgetWarnings.push(AgentBridgeIncomingParser.parseUsageBudgetWarning(sourceObject));
    }
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'hostProfileId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'agentId');
    item.window = AgentBridgeIncomingParser.normalizeUsageWindow(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'window'),
      item.usageSummary.window
    );
    item.windowStartAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'windowStartAt');
    item.windowEndAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'windowEndAt');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    return item;
  }

  static parseVoiceRetentionPolicy(source: string): AgentBridgeVoiceRetentionPolicy {
    const item = new AgentBridgeVoiceRetentionPolicy();
    if (source.length === 0) {
      return item;
    }
    const requestedPolicy = AgentBridgeIncomingParser.extractStringProperty(source, 'policy');
    if (requestedPolicy === 'not_retained' || requestedPolicy === 'ephemeral' || requestedPolicy === 'retained') {
      item.policy = requestedPolicy;
    }
    const requestedSource = AgentBridgeIncomingParser.extractStringProperty(source, 'source');
    if (requestedSource === 'provider_declared' || requestedSource === 'operator_declared') {
      item.source = requestedSource;
    }
    if (source.indexOf('"durationSeconds"') >= 0) {
      const durationSeconds = AgentBridgeIncomingParser.extractNumberProperty(source, 'durationSeconds', 0);
      if (Number.isInteger(durationSeconds) && durationSeconds >= 0) {
        item.durationSeconds = durationSeconds;
        item.hasDuration = true;
      }
    }
    if (item.policy === 'unknown') {
      item.source = 'unknown';
      item.hasDuration = false;
      item.durationSeconds = 0;
    }
    return item;
  }

  static parseVoiceDataFlow(source: string): AgentBridgeVoiceDataFlow {
    const item = new AgentBridgeVoiceDataFlow();
    if (source.length === 0) {
      return item;
    }
    item.dataForwarded = AgentBridgeIncomingParser.extractBooleanProperty(source, 'dataForwarded');
    const retentionObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'retention');
    item.retention = AgentBridgeIncomingParser.parseVoiceRetentionPolicy(retentionObject);
    return item;
  }

  static parseVoiceResult(source: string): AgentBridgeVoiceResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeVoiceResult();
    item.action = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'action', 'event');
    if (item.action.length === 0) {
      item.action = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'action', 'event');
    }
    item.ok = sourceObject.indexOf('"ok"') >= 0 ?
      AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok') : true;
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    const sessionObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'session');
    if (item.sessionId.length === 0 && sessionObject.length > 0) {
      item.sessionId = AgentBridgeIncomingParser.extractFirstStringProperty(sessionObject, 'id', 'sessionId');
    }
    item.mode = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'mode', 'providerMode');
    item.provider = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'provider');
    item.state = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'state', 'status');
    if (item.state.length === 0 && sessionObject.length > 0) {
      item.state = AgentBridgeIncomingParser.extractFirstStringProperty(sessionObject, 'status', 'state');
    }
    item.sequence = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'sequence', 0);
    item.transcript = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'transcript', 'text')
    );
    item.isFinal = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'isFinal') ||
      AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'final');
    item.isLast = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'isLast');
    item.vadActive = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'vadActive');
    item.ttsState = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'ttsState');
    item.ttsRequestId = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'ttsRequestId', 'requestId');
    item.clientRequestId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'clientRequestId');
    const encodedAudio: string = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'audioBase64');
    item.audioBase64 = encodedAudio.length <= 24 * 1024 * 1024 ? encodedAudio : '';
    item.audioBytes = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'audioBytes', 0);
    item.mimeType = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'mimeType', 'format');
    item.format = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'format');
    item.sampleRate = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'sampleRate', 0);
    item.channels = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'channels', 0);
    item.sampleBits = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'sampleBits', 0);
    item.durationMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'durationMs', 0);
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message')
    );
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'updatedAt');
    const capabilitiesObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'capabilities');
    if (capabilitiesObject.length > 0) {
      item.capabilities.recording = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'recording');
      item.capabilities.transcription = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'transcription');
      item.capabilities.textToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'textToSpeech');
      item.capabilities.vad = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'vad');
      item.capabilities.audioCapture = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'audioCapture');
      item.capabilities.audioPlayback = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'audioPlayback');
      item.capabilities.remoteSpeechToText = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'remoteSpeechToText');
      item.capabilities.remoteTextToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'remoteTextToSpeech');
      item.capabilities.interruptionHandling = AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesObject, 'interruptionHandling');
    } else {
      item.capabilities.recording = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'streamingUpload');
      item.capabilities.transcription = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'speechRecognition');
      item.capabilities.textToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'textToSpeech');
      item.capabilities.audioCapture = item.capabilities.recording;
      item.capabilities.audioPlayback = item.capabilities.textToSpeech;
      item.capabilities.remoteSpeechToText = item.capabilities.transcription;
      item.capabilities.remoteTextToSpeech = item.capabilities.textToSpeech;
    }
    const privacyObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'privacy');
    if (privacyObject.length > 0) {
      item.privacyStatusAvailable = true;
      const privacyStatus = AgentBridgeIncomingParser.extractStringProperty(privacyObject, 'status');
      if (privacyStatus === 'declared' || privacyStatus === 'unknown' || privacyStatus === 'not_applicable') {
        item.privacy.status = privacyStatus;
      }
      item.privacy.userNoticeRequired = AgentBridgeIncomingParser.extractBooleanProperty(
        privacyObject,
        'userNoticeRequired'
      );
      item.privacy.speechToText = AgentBridgeIncomingParser.parseVoiceDataFlow(
        AgentBridgeIncomingParser.extractObjectProperty(privacyObject, 'speechToText')
      );
      item.privacy.textToSpeech = AgentBridgeIncomingParser.parseVoiceDataFlow(
        AgentBridgeIncomingParser.extractObjectProperty(privacyObject, 'textToSpeech')
      );
    }
    return item;
  }

  static parseRichContentNodes(source: string): Array<AgentBridgeRichContentNode> {
    const nodes: Array<AgentBridgeRichContentNode> = [];
    if (source.length === 0) {
      return nodes;
    }
    const trimmedSource = source.trim();
    const nodeArray = trimmedSource.startsWith('[') ? trimmedSource :
      AgentBridgeIncomingParser.extractArrayProperty(source, 'contentNodes');
    if (nodeArray.length === 0) {
      return nodes;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"nodes":' + nodeArray + '}', 'nodes');
    for (let index = 0; index < objects.length && index < 160; index++) {
      const objectText = objects[index];
      const node = new AgentBridgeRichContentNode();
      node.id = AgentBridgeIncomingParser.extractStringProperty(objectText, 'id');
      node.kind = AgentBridgeIncomingParser.normalizeRichContentKind(
        AgentBridgeIncomingParser.extractStringProperty(objectText, 'kind')
      );
      node.text = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'text', 'content')
      );
      node.language = AgentBridgeIncomingParser.extractStringProperty(objectText, 'language');
      node.url = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'url', 'href');
      node.workspaceId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'workspaceId');
      node.path = AgentBridgeIncomingParser.extractStringProperty(objectText, 'path');
      node.displayName = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'displayName', 'title');
      node.line = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'line', 0);
      node.lineCount = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(objectText, 'lineCount', 0));
      node.truncated = AgentBridgeIncomingParser.extractBooleanProperty(objectText, 'truncated');
      node.truncationReason = AgentBridgeIncomingParser.extractStringProperty(objectText, 'truncationReason');
      if (node.kind === 'tool') {
        node.toolName = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'toolName', 'name');
        node.toolType = AgentBridgeIncomingParser.extractStringProperty(objectText, 'toolType');
        if (node.toolType.length === 0) {
          node.toolType = 'fallback';
        }
      } else if (node.kind === 'todo') {
        node.todoId = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'todoId', 'id');
      }
      node.status = AgentBridgeIncomingParser.extractStringProperty(objectText, 'status');
      node.source = AgentBridgeIncomingParser.extractStringProperty(objectText, 'source');
      node.tokenized = AgentBridgeIncomingParser.extractBooleanProperty(objectText, 'tokenized');
      node.tokens = AgentBridgeIncomingParser.parseRichContentTokens(
        AgentBridgeIncomingParser.extractArrayProperty(objectText, 'tokens')
      );
      if (node.kind === 'file' && !AgentBridgeIncomingParser.isSafeRichContentRelativePath(node.path)) {
        node.kind = 'fallback';
        node.source = 'unsafe_file_reference';
        node.path = '';
      } else if (node.kind === 'link' && !AgentBridgeIncomingParser.isSafeRichContentLink(node.url)) {
        node.kind = 'fallback';
        node.source = 'unsafe_link';
        node.url = '';
      }
      nodes.push(node);
    }
    return nodes;
  }

  private static parseRichContentTokens(source: string): Array<AgentBridgeRichContentToken> {
    const items: Array<AgentBridgeRichContentToken> = [];
    if (source.length === 0) {
      return items;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"items":' + source + '}', 'items');
    for (let index = 0; index < objects.length && index < 4096; index++) {
      const item = new AgentBridgeRichContentToken();
      const kind = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'kind');
      if (kind === 'whitespace' || kind === 'header' || kind === 'addition' || kind === 'deletion' ||
        kind === 'context' || kind === 'comment' || kind === 'string' || kind === 'keyword' ||
        kind === 'number' || kind === 'punctuation' || kind === 'variable') {
        item.kind = kind;
      }
      item.text = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(objects[index], 'text')
      );
      items.push(item);
    }
    return items;
  }

  static parseMessageQueueItems(source: string): Array<AgentBridgeMessageQueueItem> {
    const items: Array<AgentBridgeMessageQueueItem> = [];
    const trimmedSource = source.trim();
    const itemsSource = trimmedSource.startsWith('[') ? trimmedSource :
      AgentBridgeIncomingParser.extractArrayProperty(source, 'items');
    const objects = AgentBridgeIncomingParser.extractObjectArray(
      '{"items":' + (itemsSource.length > 0 ? itemsSource : '[]') + '}',
      'items'
    );
    for (let index = 0; index < objects.length && index < 200; index++) {
      const objectText = objects[index];
      const item = new AgentBridgeMessageQueueItem();
      item.queueId = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'queueId', 'id');
      item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'hostProfileId');
      item.sessionId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'sessionId');
      item.agentId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'agentId');
      item.clientMessageId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'clientMessageId');
      item.status = AgentBridgeIncomingParser.extractStringProperty(objectText, 'status');
      item.attempts = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(objectText, 'attempts', 0));
      item.attemptId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'attemptId');
      const attemptHistorySource = AgentBridgeIncomingParser.extractArrayProperty(objectText, 'attemptHistory');
      const attemptObjects = AgentBridgeIncomingParser.extractObjectArray(
        '{"items":' + (attemptHistorySource.length > 0 ? attemptHistorySource : '[]') + '}',
        'items'
      );
      for (let attemptIndex = 0; attemptIndex < attemptObjects.length && attemptIndex < 20; attemptIndex++) {
        const attempt = new AgentBridgeMessageQueueAttempt();
        const attemptObject = attemptObjects[attemptIndex];
        attempt.attemptId = AgentBridgeIncomingParser.extractFirstStringProperty(attemptObject, 'attemptId', 'id');
        attempt.attemptNumber = Math.max(0, AgentBridgeIncomingParser.extractNumberProperty(attemptObject, 'attemptNumber', 0));
        attempt.status = AgentBridgeIncomingParser.extractStringProperty(attemptObject, 'status');
        attempt.retryOfAttemptId = AgentBridgeIncomingParser.extractStringProperty(attemptObject, 'retryOfAttemptId');
        attempt.failureCategory = AgentBridgeIncomingParser.extractStringProperty(attemptObject, 'failureCategory');
        attempt.message = AgentBridgeIncomingParser.cleanJsonText(
          AgentBridgeIncomingParser.extractStringProperty(attemptObject, 'message')
        );
        attempt.startedAt = AgentBridgeIncomingParser.parseIsoDateProperty(attemptObject, 'startedAt');
        attempt.completedAt = AgentBridgeIncomingParser.parseIsoDateProperty(attemptObject, 'completedAt');
        if (attempt.attemptId.length > 0) {
          item.attemptHistory.push(attempt);
        }
      }
      item.textPreview = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'textPreview', 'text')
      );
      item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(objectText, 'failureCategory');
      item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objectText, 'message'));
      item.createdAt = AgentBridgeIncomingParser.parseIsoDateProperty(objectText, 'createdAt');
      item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(objectText, 'updatedAt');
      items.push(item);
    }
    return items;
  }

  static parseMessageQueueItem(source: string): AgentBridgeMessageQueueItem {
    const itemObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'item');
    const sourceObject = itemObject.length > 0 ? itemObject : source;
    const items = AgentBridgeIncomingParser.parseMessageQueueItems('[' + sourceObject + ']');
    return items.length > 0 ? items[0] : new AgentBridgeMessageQueueItem();
  }

  static parseUsageEvents(source: string): Array<AgentBridgeUsageEventRecord> {
    const items: Array<AgentBridgeUsageEventRecord> = [];
    const trimmedSource = source.trim();
    const eventsSource = trimmedSource.startsWith('[') ? trimmedSource :
      AgentBridgeIncomingParser.extractArrayProperty(source, 'events');
    const objects = AgentBridgeIncomingParser.extractObjectArray(
      '{"events":' + (eventsSource.length > 0 ? eventsSource : '[]') + '}',
      'events'
    );
    for (let index = 0; index < objects.length && index < 500; index++) {
      const objectText = objects[index];
      const item = new AgentBridgeUsageEventRecord();
      item.eventId = AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'eventId', 'id');
      item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'hostProfileId');
      item.sessionId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'sessionId');
      item.agentId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'agentId');
      item.providerId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'providerId');
      item.source = AgentBridgeIncomingParser.extractStringProperty(objectText, 'source');
      item.currency = AgentBridgeIncomingParser.extractStringProperty(objectText, 'currency').trim().toUpperCase();
      item.inputTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'inputTokens', -1);
      item.outputTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'outputTokens', -1);
      item.cacheReadTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'cacheReadTokens', -1);
      item.cacheWriteTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'cacheWriteTokens', -1);
      item.reasoningTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'reasoningTokens', -1);
      item.totalTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'totalTokens', -1);
      item.cost = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'cost', -1);
      item.quotaRemaining = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'quotaRemaining', -1);
      item.quotaLimit = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'quotaLimit', -1);
      item.quotaResetAt = AgentBridgeIncomingParser.parseIsoDateProperty(objectText, 'quotaResetAt');
      item.quotaSource = AgentBridgeIncomingParser.extractStringProperty(objectText, 'quotaSource');
      item.estimated = AgentBridgeIncomingParser.extractBooleanProperty(objectText, 'estimated');
      item.kind = AgentBridgeIncomingParser.extractStringProperty(objectText, 'kind');
      item.beforeTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'beforeTokens', -1);
      item.afterTokens = AgentBridgeIncomingParser.extractNumberProperty(objectText, 'afterTokens', -1);
      item.reason = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(objectText, 'reason'));
      item.occurredAt = AgentBridgeIncomingParser.parseIsoDateProperty(objectText, 'occurredAt');
      const rawWindow: string = AgentBridgeIncomingParser.extractStringProperty(objectText, 'window');
      const hasQuotaEvidence: boolean = item.kind === 'quota' ||
        AgentBridgeIncomingParser.hasProperty(objectText, 'quotaRemaining') ||
        AgentBridgeIncomingParser.hasProperty(objectText, 'quotaLimit') ||
        AgentBridgeIncomingParser.hasProperty(objectText, 'quotaResetAt') ||
        AgentBridgeIncomingParser.hasProperty(objectText, 'quotaSource');
      item.window = hasQuotaEvidence ? AgentBridgeIncomingParser.normalizeQuotaWindow(rawWindow, '') :
        AgentBridgeIncomingParser.normalizeUsageWindow(rawWindow, '');
      items.push(item);
    }
    return items;
  }

  static parseUsageEvent(source: string): AgentBridgeUsageEventRecord {
    const usageObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'usage');
    const sourceObject = usageObject.length > 0 ? usageObject : source;
    const items = AgentBridgeIncomingParser.parseUsageEvents('[' + sourceObject + ']');
    return items.length > 0 ? items[0] : new AgentBridgeUsageEventRecord();
  }

  static parseUsageBudget(source: string): AgentBridgeUsageBudgetRecord {
    const budgetObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'budget');
    const sourceObject = budgetObject.length > 0 ? budgetObject : source;
    const item = new AgentBridgeUsageBudgetRecord();
    item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'hostProfileId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'agentId');
    item.scopeKey = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'scopeKey');
    item.scopeType = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'scopeType');
    item.tokenLimit = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'tokenLimit', -1);
    item.costLimit = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'costLimit', -1);
    item.currency = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'currency').trim().toUpperCase();
    item.window = AgentBridgeIncomingParser.normalizeUsageWindow(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'window'),
      'session'
    );
    item.warning = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'warning');
    item.warningThreshold = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'warningThreshold', -1);
    item.updatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'updatedAt');
    item.isSet = sourceObject.length > 0 && (item.tokenLimit >= 0 || item.costLimit >= 0);
    return item;
  }

  static parseUsageSummary(source: string): AgentBridgeUsageSummaryRecord {
    const item = new AgentBridgeUsageSummaryRecord();
    if (source.length === 0) {
      return item;
    }
    const summaryObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'summary');
    const sourceObject = summaryObject.length > 0 ? summaryObject : source;
    item.eventCount = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'eventCount', 0);
    item.compactions = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'compactions', 0);
    item.window = AgentBridgeIncomingParser.normalizeUsageWindow(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'window'),
      'session'
    );
    item.windowStartAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'windowStartAt');
    item.windowEndAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'windowEndAt');
    item.actual = AgentBridgeIncomingParser.parseUsageAggregate(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'actual')
    );
    item.estimated = AgentBridgeIncomingParser.parseUsageAggregate(
      AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'estimated')
    );
    const costsObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'costs');
    const actualCostsSource = AgentBridgeIncomingParser.extractArrayProperty(costsObject, 'actual');
    const estimatedCostsSource = AgentBridgeIncomingParser.extractArrayProperty(costsObject, 'estimated');
    item.actualCosts = actualCostsSource.length > 0 ?
      AgentBridgeIncomingParser.parseUsageCosts(actualCostsSource) : item.actual.costs;
    item.estimatedCosts = estimatedCostsSource.length > 0 ?
      AgentBridgeIncomingParser.parseUsageCosts(estimatedCostsSource) : item.estimated.costs;
    item.quotas = AgentBridgeIncomingParser.parseUsageQuotas(
      AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'quotas')
    );
    item.compactionEvents = AgentBridgeIncomingParser.parseUsageCompactions(
      AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'compactionEvents')
    );
    return item;
  }

  static parseProviderUsageResult(source: string): AgentBridgeProviderUsageResult {
    const item = new AgentBridgeProviderUsageResult();
    if (source.length === 0) {
      return item;
    }
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    item.ok = sourceObject.indexOf('"ok"') >= 0 && AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.providerId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'providerId');
    item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'hostProfileId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'agentId');
    item.window = AgentBridgeIncomingParser.normalizeUsageWindow(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'window'),
      'session'
    );
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    if (item.status.length === 0) {
      item.status = item.ok ? 'available' : 'unavailable';
    }
    const rawAvailabilityState = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'availabilityState');
    item.planLabel = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'planLabel', 'plan');
    item.source = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'source');
    item.fetchedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'fetchedAt');
    item.expiresAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'expiresAt');
    item.stale = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'stale');
    const windows = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'windows');
    for (let index = 0; index < windows.length && index < 32; index++) {
      const window = new AgentBridgeProviderUsageWindowRecord();
      window.name = AgentBridgeIncomingParser.extractFirstStringProperty(windows[index], 'name', 'window');
      window.label = AgentBridgeIncomingParser.extractStringProperty(windows[index], 'label');
      window.status = AgentBridgeIncomingParser.extractStringProperty(windows[index], 'status');
      window.unit = AgentBridgeIncomingParser.extractStringProperty(windows[index], 'unit');
      window.remaining = AgentBridgeIncomingParser.extractNumberProperty(windows[index], 'remaining', -1);
      window.limit = AgentBridgeIncomingParser.extractNumberProperty(windows[index], 'limit', -1);
      window.used = AgentBridgeIncomingParser.extractNumberProperty(windows[index], 'used', -1);
      window.resetAt = AgentBridgeIncomingParser.parseIsoDateProperty(windows[index], 'resetAt');
      item.windows.push(window);
    }
    const details = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'details');
    for (let index = 0; index < details.length && index < 64; index++) {
      const detail = new AgentBridgeProviderUsageDetailRecord();
      detail.key = AgentBridgeIncomingParser.extractStringProperty(details[index], 'key');
      detail.label = AgentBridgeIncomingParser.extractStringProperty(details[index], 'label');
      detail.value = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(details[index], 'value'));
      detail.status = AgentBridgeIncomingParser.extractStringProperty(details[index], 'status');
      item.details.push(detail);
    }
    item.warnings = AgentBridgeIncomingParser.extractStringArrayProperty(sourceObject, 'warnings');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    if (rawAvailabilityState.length > 0) {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.normalize(rawAvailabilityState);
    } else if (item.stale) {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.STALE;
    } else if (item.failureCategory === 'capability_unavailable') {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.UNSUPPORTED;
    } else if (!item.ok || item.status === 'unavailable' || item.status === 'error' || item.status === 'failed') {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.FAILED;
    } else if (item.windows.length === 0 && item.details.length === 0 && item.planLabel.length === 0) {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.AVAILABLE_EMPTY;
    } else {
      item.availabilityState = AgentBridgeProviderUsageAvailabilityState.AVAILABLE;
    }
    return item;
  }

  static parseUsageBudgetWarnings(source: string): Array<AgentBridgeUsageBudgetWarningRecord> {
    const items: Array<AgentBridgeUsageBudgetWarningRecord> = [];
    if (source.length === 0) {
      return items;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"items":' + source + '}', 'items');
    for (let index = 0; index < objects.length && index < 20; index++) {
      const objectText = objects[index];
      const action = AgentBridgeIncomingParser.extractStringProperty(objectText, 'action');
      if (action !== AgentBridgeEventType.USAGE_BUDGET_WARNING) {
        continue;
      }
      items.push(AgentBridgeIncomingParser.parseUsageBudgetWarning(objectText));
    }
    return items;
  }

  static parseUsageBudgetWarning(source: string): AgentBridgeUsageBudgetWarningRecord {
    const item = new AgentBridgeUsageBudgetWarningRecord();
    item.hostProfileId = AgentBridgeIncomingParser.extractStringProperty(source, 'hostProfileId');
    item.sessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.window = AgentBridgeIncomingParser.normalizeUsageWindow(
      AgentBridgeIncomingParser.extractStringProperty(source, 'window'),
      'session'
    );
    item.windowStartAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'windowStartAt');
    item.windowEndAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'windowEndAt');
    item.warningThreshold = AgentBridgeIncomingParser.extractNumberProperty(source, 'warningThreshold', -1);
    item.reasons = AgentBridgeIncomingParser.extractStringArrayProperty(source, 'reasons');
    item.currency = AgentBridgeIncomingParser.extractStringProperty(source, 'currency').trim().toUpperCase();
    item.actualTokens = AgentBridgeIncomingParser.extractNumberProperty(source, 'actualTokens', -1);
    item.actualCost = AgentBridgeIncomingParser.extractNumberProperty(source, 'actualCost', -1);
    item.emittedAt = AgentBridgeIncomingParser.parseIsoDateProperty(source, 'emittedAt');
    item.budget = AgentBridgeIncomingParser.parseUsageBudget(
      AgentBridgeIncomingParser.extractObjectProperty(source, 'budget')
    );
    return item;
  }

  private static parseUsageAggregate(source: string): AgentBridgeUsageAggregateRecord {
    const item = new AgentBridgeUsageAggregateRecord();
    if (source.length === 0) {
      return item;
    }
    item.eventCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'eventCount', 0);
    const tokensSource = AgentBridgeIncomingParser.extractObjectProperty(source, 'tokens');
    item.tokens.inputTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'inputTokens', -1);
    item.tokens.outputTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'outputTokens', -1);
    item.tokens.cacheReadTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'cacheReadTokens', -1);
    item.tokens.cacheWriteTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'cacheWriteTokens', -1);
    item.tokens.reasoningTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'reasoningTokens', -1);
    item.tokens.totalTokens = AgentBridgeIncomingParser.extractNumberProperty(tokensSource, 'totalTokens', -1);
    item.costs = AgentBridgeIncomingParser.parseUsageCosts(
      AgentBridgeIncomingParser.extractArrayProperty(source, 'costs')
    );
    return item;
  }

  private static parseUsageCosts(source: string): Array<AgentBridgeUsageCostRecord> {
    const items: Array<AgentBridgeUsageCostRecord> = [];
    if (source.length === 0) {
      return items;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"items":' + source + '}', 'items');
    for (let index = 0; index < objects.length && index < 32; index++) {
      const item = new AgentBridgeUsageCostRecord();
      item.currency = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'currency').trim().toUpperCase();
      item.amount = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'amount', -1);
      if (item.currency.length > 0 && item.amount >= 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseUsageQuotas(source: string): Array<AgentBridgeUsageQuotaRecord> {
    const items: Array<AgentBridgeUsageQuotaRecord> = [];
    if (source.length === 0) {
      return items;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"items":' + source + '}', 'items');
    for (let index = 0; index < objects.length && index < 64; index++) {
      const item = new AgentBridgeUsageQuotaRecord();
      item.providerId = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'providerId');
      item.source = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'source');
      item.window = AgentBridgeIncomingParser.normalizeQuotaWindow(
        AgentBridgeIncomingParser.extractStringProperty(objects[index], 'window'),
        ''
      );
      item.remaining = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'remaining', -1);
      item.limit = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'limit', -1);
      item.resetAt = AgentBridgeIncomingParser.parseIsoDateProperty(objects[index], 'resetAt');
      item.occurredAt = AgentBridgeIncomingParser.parseIsoDateProperty(objects[index], 'occurredAt');
      items.push(item);
    }
    return items;
  }

  private static parseUsageCompactions(source: string): Array<AgentBridgeUsageCompactionRecord> {
    const items: Array<AgentBridgeUsageCompactionRecord> = [];
    if (source.length === 0) {
      return items;
    }
    const objects = AgentBridgeIncomingParser.extractObjectArray('{"items":' + source + '}', 'items');
    for (let index = 0; index < objects.length && index < 200; index++) {
      const item = new AgentBridgeUsageCompactionRecord();
      item.eventId = AgentBridgeIncomingParser.extractFirstStringProperty(objects[index], 'eventId', 'id');
      item.providerId = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'providerId');
      item.estimated = AgentBridgeIncomingParser.extractBooleanProperty(objects[index], 'estimated');
      item.beforeTokens = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'beforeTokens', -1);
      item.afterTokens = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'afterTokens', -1);
      item.reason = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(objects[index], 'reason')
      );
      item.occurredAt = AgentBridgeIncomingParser.parseIsoDateProperty(objects[index], 'occurredAt');
      items.push(item);
    }
    return items;
  }

  private static normalizeRichContentKind(value: string): string {
    if (value === 'text' || value === 'code' || value === 'link' || value === 'file' ||
      value === 'tool' || value === 'todo' || value === 'diff' || value === 'warning' ||
      value === 'fallback') {
      return value;
    }
    return 'fallback';
  }

  private static normalizeUsageWindow(value: string, fallback: string): string {
    if (value === 'session' || value === 'day' || value === 'month') {
      return value;
    }
    return fallback;
  }

  private static normalizeQuotaWindow(value: string, fallback: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return fallback;
    }
    if (normalized === 'session' || normalized === 'day' || normalized === 'month') {
      return normalized;
    }
    if (normalized.length > 64 || normalized === '.' || normalized === '..') {
      return fallback;
    }
    for (let index = 0; index < normalized.length; index++) {
      const code: number = normalized.charCodeAt(index);
      const character: string = normalized.charAt(index);
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 ||
        character === '/' || character === '\\') {
        return fallback;
      }
    }
    return normalized;
  }

  private static isSafeRichContentRelativePath(value: string): boolean {
    const normalized = value.trim().split('\\').join('/');
    if (normalized.length === 0 || normalized.startsWith('/') || normalized.indexOf('://') >= 0 ||
      (normalized.length > 1 && normalized.charAt(1) === ':')) {
      return false;
    }
    const segments: Array<string> = normalized.split('/');
    for (let index = 0; index < segments.length; index++) {
      if (segments[index].length === 0 || segments[index] === '..') {
        return false;
      }
    }
    return true;
  }

  private static isSafeRichContentLink(value: string): boolean {
    const normalized = value.trim();
    const lowerValue = normalized.toLowerCase();
    let authorityStart = 0;
    if (lowerValue.startsWith('https://')) {
      authorityStart = 8;
    } else if (lowerValue.startsWith('http://')) {
      authorityStart = 7;
    } else {
      return false;
    }
    if (normalized.indexOf(' ') >= 0 || normalized.indexOf('\t') >= 0 || normalized.indexOf('\r') >= 0 ||
      normalized.indexOf('\n') >= 0) {
      return false;
    }
    const authorityEndCandidate = normalized.indexOf('/', authorityStart);
    const authorityEnd = authorityEndCandidate >= 0 ? authorityEndCandidate : normalized.length;
    const authority = normalized.substring(authorityStart, authorityEnd);
    return authority.length > 0 && authority.indexOf('@') < 0;
  }

  private static parseIsoDateProperty(source: string, propertyName: string): string {
    const textValue = AgentBridgeIncomingParser.extractStringProperty(source, propertyName);
    if (textValue.length > 0) {
      const timestamp = Date.parse(textValue);
      if (Number.isFinite(timestamp)) {
        return new Date(timestamp).toISOString();
      }
      return '';
    }
    const numberValue = AgentBridgeIncomingParser.extractNumberProperty(source, propertyName, 0);
    if (numberValue > 0 && Number.isFinite(numberValue)) {
      return new Date(numberValue).toISOString();
    }
    return '';
  }

  static parseDiagnosticsReport(source: string): AgentBridgeDiagnosticsReport {
    const item = new AgentBridgeDiagnosticsReport();
    if (source.length === 0) {
      return item;
    }
    const reportObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'report');
    const sourceObject = reportObject.length > 0 ? reportObject : source;
    item.schemaVersion = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'schemaVersion', 1);
    item.format = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'format');
    if (item.format !== 'text') {
      item.format = 'json';
    }
    item.generatedAt = AgentBridgeIncomingParser.parseIsoDateProperty(sourceObject, 'generatedAt');
    item.truncated = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'truncated');
    item.text = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'text'));
    const groupObjects = AgentBridgeIncomingParser.extractObjectArray(sourceObject, 'groups');
    const groups: Array<AgentBridgeDiagnosticsGroup> = [];
    for (let groupIndex = 0; groupIndex < groupObjects.length && groupIndex < 16; groupIndex++) {
      const groupSource = groupObjects[groupIndex];
      const group = new AgentBridgeDiagnosticsGroup();
      group.id = AgentBridgeIncomingParser.extractStringProperty(groupSource, 'id');
      group.title = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(groupSource, 'title'));
      group.status = AgentBridgeIncomingParser.extractStringProperty(groupSource, 'status');
      const checkObjects = AgentBridgeIncomingParser.extractObjectArray(groupSource, 'checks');
      const checks: Array<AgentBridgeDiagnosticsCheck> = [];
      for (let checkIndex = 0; checkIndex < checkObjects.length && checkIndex < 100; checkIndex++) {
        const checkSource = checkObjects[checkIndex];
        const check = new AgentBridgeDiagnosticsCheck();
        check.id = AgentBridgeIncomingParser.extractStringProperty(checkSource, 'id');
        check.status = AgentBridgeIncomingParser.extractStringProperty(checkSource, 'status');
        check.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(checkSource, 'message'));
        check.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(checkSource, 'remediation'));
        check.actionId = AgentBridgeIncomingParser.extractStringProperty(checkSource, 'actionId');
        checks.push(check);
      }
      group.checks = checks;
      groups.push(group);
    }
    item.groups = groups;
    return item;
  }

  static parseDaemonDoctorReport(source: string): AgentBridgeDaemonDoctorReport {
    const item = new AgentBridgeDaemonDoctorReport();
    if (source.length === 0) {
      return item;
    }
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.errors = AgentBridgeIncomingParser.extractNumberProperty(source, 'errors', 0);
    item.warnings = AgentBridgeIncomingParser.extractNumberProperty(source, 'warnings', 0);
    item.generatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'generatedAt');
    const checkObjects = AgentBridgeIncomingParser.extractObjectArray(source, 'checks');
    const checks: Array<AgentBridgeDaemonDoctorCheck> = [];
    for (let index = 0; index < checkObjects.length; index++) {
      const check = new AgentBridgeDaemonDoctorCheck();
      check.id = AgentBridgeIncomingParser.extractStringProperty(checkObjects[index], 'id');
      check.status = AgentBridgeIncomingParser.extractStringProperty(checkObjects[index], 'status');
      check.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(checkObjects[index], 'message'));
      check.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(checkObjects[index], 'remediation'));
      if (check.id.length > 0 || check.message.length > 0) {
        checks.push(check);
      }
    }
    item.checks = checks;
    return item;
  }

  static parseDaemonLogTail(source: string): AgentBridgeDaemonLogTail {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeDaemonLogTail();
    item.path = AgentBridgeIncomingParser.extractFirstStringProperty(sourceObject, 'logPath', 'path');
    item.text = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'text'));
    item.sizeBytes = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'sizeBytes', 0);
    item.truncated = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'truncated');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(sourceObject, 'warnings');
    item.updatedAt = Date.now();
    return item;
  }

  static parseDaemonUpdateResult(source: string): AgentBridgeDaemonUpdateResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const payloadSource = payloadObject.length > 0 ? payloadObject : source;
    const nestedUpdate = AgentBridgeIncomingParser.extractObjectProperty(payloadSource, 'update');
    const sourceObject = nestedUpdate.length > 0 &&
      AgentBridgeIncomingParser.extractStringProperty(payloadSource, 'action').indexOf('daemon.update.') < 0 ? nestedUpdate : payloadSource;
    const savedState = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'update');
    const item = new AgentBridgeDaemonUpdateResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.updaterAvailable = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'updaterAvailable');
    item.available = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'available');
    item.busy = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'busy');
    item.activeOperation = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'activeOperation');
    item.packageName = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'packageName');
    item.currentVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'currentVersion');
    item.targetVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'targetVersion');
    if (item.targetVersion.length === 0) {
      item.targetVersion = AgentBridgeIncomingParser.extractStringProperty(savedState, 'targetVersion');
    }
    item.installedVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'installedVersion');
    if (item.installedVersion.length === 0) {
      item.installedVersion = AgentBridgeIncomingParser.extractStringProperty(savedState, 'installedVersion');
    }
    item.restoredVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'restoredVersion');
    if (item.restoredVersion.length === 0) {
      item.restoredVersion = AgentBridgeIncomingParser.extractStringProperty(savedState, 'restoredVersion');
    }
    item.previousVersion = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'previousVersion');
    if (item.previousVersion.length === 0) {
      item.previousVersion = AgentBridgeIncomingParser.extractStringProperty(savedState, 'previousVersion');
    }
    item.channel = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'channel');
    item.status = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'status');
    if (item.status.length === 0) {
      item.status = AgentBridgeIncomingParser.extractStringProperty(savedState, 'status');
    }
    item.installationKind = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'installationKind');
    item.registryUrl = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'registryUrl');
    item.integrity = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'integrity');
    if (item.integrity.length === 0) {
      item.integrity = AgentBridgeIncomingParser.extractStringProperty(savedState, 'integrity');
    }
    item.integrityAlgorithm = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'integrityAlgorithm');
    item.integrityVerified = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'integrityVerified') ||
      AgentBridgeIncomingParser.extractBooleanProperty(savedState, 'integrityVerified');
    item.sameVersion = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'sameVersion');
    item.downgrade = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'downgrade');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmRequired = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmRequired');
    item.pendingRestart = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'pendingRestart') ||
      AgentBridgeIncomingParser.extractBooleanProperty(savedState, 'pendingRestart');
    item.restartRequired = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'restartRequired');
    item.rollbackAvailable = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'rollbackAvailable');
    item.rollbackVerified = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'rollbackVerified');
    item.replacementScheduled = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'replacementScheduled');
    item.replacementMode = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'replacementMode');
    item.replacementPid = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'replacementPid', 0);
    item.replacementError = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'replacementError')
    );
    item.statePath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'statePath');
    item.stagedPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stagedPath');
    if (item.stagedPath.length === 0) {
      item.stagedPath = AgentBridgeIncomingParser.extractStringProperty(savedState, 'stagedPath');
    }
    item.backupPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'backupPath');
    if (item.backupPath.length === 0) {
      item.backupPath = AgentBridgeIncomingParser.extractStringProperty(savedState, 'backupPath');
    }
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    if (item.failureCategory.length === 0) {
      item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(savedState, 'failureCategory');
    }
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation')
    );
    item.checkedAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'checkedAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'updatedAt');
    return item;
  }

  static parseImportedMessages(source: string): Array<AgentBridgeImportedMessage> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'messages');
    const messages: Array<AgentBridgeImportedMessage> = [];
    for (let index = 0; index < objects.length; index++) {
      const message = AgentBridgeIncomingParser.parseImportedMessageObject(objects[index]);
      if (message.text.length > 0 || message.reasoningText.length > 0) {
        messages.push(message);
      }
    }
    return messages;
  }

  static parseImportedToolCalls(source: string): Array<AgentBridgeImportedToolCall> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'toolCalls');
    const items: Array<AgentBridgeImportedToolCall> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = AgentBridgeIncomingParser.parseImportedToolCallObject(objects[index]);
      if (item.toolCallId.length > 0 || item.id.length > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseProviderObject(source: string): AgentBridgeProviderOption {
    const id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    const displayName = AgentBridgeIncomingParser.extractStringProperty(source, 'displayName');
    const models = AgentBridgeIncomingParser.parseModels(source);
    const speedModes = AgentBridgeIncomingParser.parseSpeedModes(source);
    const reasoningModes = AgentBridgeIncomingParser.parseReasoningModes(source);
    const interactionModes = AgentBridgeIncomingParser.parseInteractionModes(source);
    const tools = AgentBridgeIncomingParser.parseTools(source);
    const capabilitiesSource = AgentBridgeIncomingParser.extractObjectProperty(source, 'capabilities');
    const sessionFeaturesSource = AgentBridgeIncomingParser.extractObjectProperty(source, 'sessionFeatures');
    return new AgentBridgeProviderOption(
      id,
      displayName.length > 0 ? displayName : id,
      AgentBridgeIncomingParser.extractStringProperty(source, 'status'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'description'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'endpoint'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'streaming'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'tools'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'previews'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'permissions'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'history'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'modelSelection'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'speedProfiles'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'workspaceAware'),
      models,
      speedModes,
      reasoningModes.length > 0 ? reasoningModes : AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      interactionModes.length > 0 ? interactionModes : AgentBridgeIncomingParser.defaultInteractionModesForProvider(id),
      tools,
      AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeMode'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'interactiveReady'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'sessionState'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'exitCode', 0),
      AgentBridgeIncomingParser.extractStringProperty(source, 'lastError'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'capabilitySource'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'capabilityStatus'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'lastDiscoveredAt', 0),
      AgentBridgeIncomingParser.extractStringArrayProperty(source, 'discoveryWarnings'),
      AgentBridgeIncomingParser.extractStringArrayProperty(source, 'discoveryErrors'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'cacheStatus'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'cacheTtlMs', 0),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'interactiveSessions'),
      AgentBridgeIncomingParser.extractBooleanProperty(sessionFeaturesSource, 'attach'),
      AgentBridgeIncomingParser.extractBooleanProperty(sessionFeaturesSource, 'abort'),
      AgentBridgeIncomingParser.extractBooleanProperty(sessionFeaturesSource, 'resume'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'usageEvents'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'metadataGeneration'),
      AgentBridgeIncomingParser.extractBooleanProperty(capabilitiesSource, 'providerUsage'),
      capabilitiesSource.indexOf('"providerUsage"') >= 0,
      capabilitiesSource.indexOf('"usageEvents"') >= 0,
      capabilitiesSource.indexOf('"metadataGeneration"') >= 0
    );
  }

  private static parseServerFeatureFlags(source: string): AgentBridgeServerFeatureFlags {
    const flags = new AgentBridgeServerFeatureFlags();
    flags.protocolV2 = AgentBridgeIncomingParser.extractBooleanProperty(source, 'protocolV2');
    flags.deviceIdentity = AgentBridgeIncomingParser.extractBooleanProperty(source, 'deviceIdentity');
    flags.trustedCacheNamespace = AgentBridgeIncomingParser.extractBooleanProperty(source, 'trustedCacheNamespace');
    flags.serverInfo = AgentBridgeIncomingParser.extractBooleanProperty(source, 'serverInfo');
    flags.providerCatalog = AgentBridgeIncomingParser.extractBooleanProperty(source, 'providerCatalog');
    flags.agentLifecycle = AgentBridgeIncomingParser.extractBooleanProperty(source, 'agentLifecycle');
    flags.authoritativeTimeline = AgentBridgeIncomingParser.extractBooleanProperty(source, 'authoritativeTimeline');
    flags.projectWorkspaceRegistry = AgentBridgeIncomingParser.extractBooleanProperty(source, 'projectWorkspaceRegistry');
    flags.managedProcessLedger = AgentBridgeIncomingParser.extractBooleanProperty(source, 'managedProcessLedger');
    flags.terminalBinaryFrames = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalBinaryFrames');
    flags.terminalActivity = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalActivity');
    flags.terminalMouse = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalMouse');
    flags.fileTransferBinaryFrames = AgentBridgeIncomingParser.extractBooleanProperty(source, 'fileTransferBinaryFrames');
    flags.interactiveProviderSessions = AgentBridgeIncomingParser.extractBooleanProperty(source, 'interactiveProviderSessions');
    flags.interactiveCliSessions = AgentBridgeIncomingParser.extractBooleanProperty(source, 'interactiveCliSessions');
    flags.agentRelationships = AgentBridgeIncomingParser.extractBooleanProperty(source, 'agentRelationships');
    flags.checkpoints = AgentBridgeIncomingParser.extractBooleanProperty(source, 'checkpoints');
    flags.fileCheckpoints = AgentBridgeIncomingParser.extractBooleanProperty(source, 'fileCheckpoints');
    flags.terminalHooks = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalHooks');
    flags.terminalCapturePersistence = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalCapturePersistence');
    flags.terminalSnapshotBackpressure = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalSnapshotBackpressure');
    flags.terminalSequencedRestore = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalSequencedRestore');
    flags.dynamicProviderDiscovery = AgentBridgeIncomingParser.extractBooleanProperty(source, 'dynamicProviderDiscovery');
    flags.providerProfiles = AgentBridgeIncomingParser.extractBooleanProperty(source, 'providerProfiles');
    flags.providerSecretStorage = AgentBridgeIncomingParser.extractBooleanProperty(source, 'providerSecretStorage');
    flags.acpProviders = AgentBridgeIncomingParser.extractBooleanProperty(source, 'acpProviders');
    flags.remoteProviderDirectory = AgentBridgeIncomingParser.extractBooleanProperty(source, 'remoteProviderDirectory');
    flags.gitAdvanced = AgentBridgeIncomingParser.extractBooleanProperty(source, 'gitAdvanced');
    flags.gitOperationPlans = AgentBridgeIncomingParser.extractBooleanProperty(source, 'gitOperationPlans');
    flags.gitDiffSubscriptions = AgentBridgeIncomingParser.extractBooleanProperty(source, 'gitDiffSubscriptions');
    flags.githubIntegration = AgentBridgeIncomingParser.extractBooleanProperty(source, 'githubIntegration');
    flags.githubOAuth = AgentBridgeIncomingParser.extractBooleanProperty(source, 'githubOAuth');
    flags.githubPrWorkflow = AgentBridgeIncomingParser.extractBooleanProperty(source, 'githubPrWorkflow');
    flags.githubWatch = AgentBridgeIncomingParser.extractBooleanProperty(source, 'githubWatch');
    flags.githubAssetUpload = AgentBridgeIncomingParser.extractBooleanProperty(source, 'githubAssetUpload');
    flags.largeDiffPagination = AgentBridgeIncomingParser.extractBooleanProperty(source, 'largeDiffPagination');
    flags.remoteDaemonConfig = AgentBridgeIncomingParser.extractBooleanProperty(source, 'remoteDaemonConfig');
    flags.daemonInstanceIdentity = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonInstanceIdentity');
    flags.daemonFleetOrchestration = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonFleetOrchestration');
    flags.daemonFleetTarget = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonFleetTarget');
    flags.richContentAst = AgentBridgeIncomingParser.extractBooleanProperty(source, 'richContentAst');
    flags.messageQueue = AgentBridgeIncomingParser.extractBooleanProperty(source, 'messageQueue');
    flags.usageEvents = AgentBridgeIncomingParser.extractBooleanProperty(source, 'usageEvents');
    flags.usageBudgets = AgentBridgeIncomingParser.extractBooleanProperty(source, 'usageBudgets');
    flags.providerUsage = AgentBridgeIncomingParser.extractBooleanProperty(source, 'providerUsage');
    flags.metadataGeneration = AgentBridgeIncomingParser.extractBooleanProperty(source, 'metadataGeneration');
    flags.diagnosticsExport = AgentBridgeIncomingParser.extractBooleanProperty(source, 'diagnosticsExport');
    flags.adaptiveWorkbench = AgentBridgeIncomingParser.extractBooleanProperty(source, 'adaptiveWorkbench');
    flags.commandPalette = AgentBridgeIncomingParser.extractBooleanProperty(source, 'commandPalette');
    flags.sessionWindows = AgentBridgeIncomingParser.extractBooleanProperty(source, 'sessionWindows');
    flags.worktrees = AgentBridgeIncomingParser.extractBooleanProperty(source, 'worktrees');
    flags.mcpHost = AgentBridgeIncomingParser.extractBooleanProperty(source, 'mcpHost');
    flags.offlineNotifications = AgentBridgeIncomingParser.extractBooleanProperty(source, 'offlineNotifications');
    flags.pushKitSubscriptions = AgentBridgeIncomingParser.extractBooleanProperty(source, 'pushKitSubscriptions');
    flags.pushKitDelivery = AgentBridgeIncomingParser.extractBooleanProperty(source, 'pushKitDelivery');
    flags.daemonManagement = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonManagement');
    flags.daemonSupervisor = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonSupervisor');
    flags.daemonAutostartInstaller = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonAutostartInstaller');
    flags.daemonSelfUpdate = AgentBridgeIncomingParser.extractBooleanProperty(source, 'daemonSelfUpdate');
    flags.securityDeviceTrust = AgentBridgeIncomingParser.extractBooleanProperty(source, 'securityDeviceTrust');
    flags.schedules = AgentBridgeIncomingParser.extractBooleanProperty(source, 'schedules');
    flags.loops = AgentBridgeIncomingParser.extractBooleanProperty(source, 'loops');
    flags.chat = AgentBridgeIncomingParser.extractBooleanProperty(source, 'chat');
    flags.chatRooms = AgentBridgeIncomingParser.extractBooleanProperty(source, 'chatRooms');
    flags.relay = AgentBridgeIncomingParser.extractBooleanProperty(source, 'relay');
    flags.relayE2E = AgentBridgeIncomingParser.extractBooleanProperty(source, 'relayE2E');
    flags.relayDeviceManagement = AgentBridgeIncomingParser.extractBooleanProperty(source, 'relayDeviceManagement');
    flags.deviceManagement = flags.relayDeviceManagement ||
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'deviceManagement');
    flags.voice = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voice');
    flags.voiceAudioCapture = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceAudioCapture');
    flags.voiceAudioPlayback = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceAudioPlayback');
    flags.voiceSpeechToText = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceSpeechToText');
    flags.voiceTextToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceTextToSpeech');
    flags.voiceRemoteSpeechToText = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceRemoteSpeechToText');
    flags.voiceRemoteTextToSpeech = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceRemoteTextToSpeech');
    flags.voiceCapabilityMatrix = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceCapabilityMatrix');
    flags.voicePrivacyStatus = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voicePrivacyStatus');
    flags.voiceActivityEvents = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceActivityEvents');
    flags.voiceInterruptionHandling = AgentBridgeIncomingParser.extractBooleanProperty(source, 'voiceInterruptionHandling');
    flags.browserAutomation = AgentBridgeIncomingParser.extractBooleanProperty(source, 'browserAutomation');
    flags.browserHostCapabilityMetadata = AgentBridgeIncomingParser.extractBooleanProperty(source, 'browserHostCapabilityMetadata');
    flags.browserPlatformHost = AgentBridgeIncomingParser.extractBooleanProperty(source, 'browserPlatformHost');
    flags.serviceProxy = AgentBridgeIncomingParser.extractBooleanProperty(source, 'serviceProxy');
    return flags;
  }

  static parseAgentRuntimeInfo(source: string): AgentBridgeAgentRuntimeInfo {
    const item = new AgentBridgeAgentRuntimeInfo();
    if (source.length === 0) {
      return item;
    }
    item.runtimeMode = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeMode');
    item.interactiveReady = AgentBridgeIncomingParser.extractBooleanProperty(source, 'interactiveReady');
    item.sessionState = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionState');
    item.pid = AgentBridgeIncomingParser.extractNumberProperty(source, 'pid', 0);
    item.startedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'startedAt', 0);
    item.lastActivityAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'lastActivityAt', 0);
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(source, 'exitCode', -1);
    item.lastError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastError'));
    item.recentOutputTail = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'recentOutputTail'));
    item.runtimeFallbackReason = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeFallbackReason'));
    return item;
  }

  private static parseAgentRecordObject(source: string): AgentBridgeAgentRecord {
    const item = new AgentBridgeAgentRecord();
    item.id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    item.provider = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'provider', 'providerId');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.rootPath = AgentBridgeIncomingParser.extractStringProperty(source, 'rootPath');
    item.workspaceMode = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceMode');
    item.worktreeId = AgentBridgeIncomingParser.extractStringProperty(source, 'worktreeId');
    item.runtimeOwnerId = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeOwnerId');
    item.ownershipStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'ownershipStatus');
    item.executionPolicyJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'executionPolicy');
    item.forkContextJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'forkContext');
    item.lifecycleState = AgentBridgeIncomingParser.extractStringProperty(source, 'lifecycleState');
    item.writeAccessRevokedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'writeAccessRevokedAt');
    item.lastCleanupResultJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'lastCleanupResult');
    item.providerSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'providerSessionId');
    item.remoteSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'remoteSessionId');
    item.title = AgentBridgeIncomingParser.extractStringProperty(source, 'title');
    item.configJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'config');
    item.runtimeInfoJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'runtimeInfo');
    const runtimeInfo = AgentBridgeIncomingParser.parseAgentRuntimeInfo(item.runtimeInfoJson.length > 0 ? item.runtimeInfoJson : source);
    item.runtimeMode = runtimeInfo.runtimeMode;
    item.interactiveReady = runtimeInfo.interactiveReady;
    item.sessionState = runtimeInfo.sessionState;
    item.runtimePid = runtimeInfo.pid;
    item.runtimeStartedAt = runtimeInfo.startedAt;
    item.runtimeLastActivityAt = runtimeInfo.lastActivityAt;
    item.runtimeExitCode = runtimeInfo.exitCode;
    item.runtimeLastError = runtimeInfo.lastError;
    item.runtimeRecentOutputTail = runtimeInfo.recentOutputTail;
    item.runtimeFallbackReason = runtimeInfo.runtimeFallbackReason;
    item.persistenceJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'persistence');
    item.featuresJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'features');
    item.lastStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'lastStatus');
    item.lastModeId = AgentBridgeIncomingParser.extractStringProperty(source, 'lastModeId');
    item.modelId = AgentBridgeIncomingParser.extractStringProperty(source, 'modelId');
    item.thinkingOptionId = AgentBridgeIncomingParser.extractStringProperty(source, 'thinkingOptionId');
    item.lastError = AgentBridgeIncomingParser.extractStringProperty(source, 'lastError');
    item.requiresAttention = AgentBridgeIncomingParser.extractBooleanProperty(source, 'requiresAttention');
    item.attentionReason = AgentBridgeIncomingParser.extractStringProperty(source, 'attentionReason');
    item.attentionTimestamp = AgentBridgeIncomingParser.extractStringProperty(source, 'attentionTimestamp');
    item.parentAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'parentAgentId');
    item.rootAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'rootAgentId');
    item.childAgentIdsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'childAgentIds');
    item.detached = AgentBridgeIncomingParser.extractBooleanProperty(source, 'detached');
    item.forkedFromAgentId = AgentBridgeIncomingParser.extractStringProperty(source, 'forkedFromAgentId');
    item.forkedFromCheckpointId = AgentBridgeIncomingParser.extractStringProperty(source, 'forkedFromCheckpointId');
    item.relationshipUpdatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'relationshipUpdatedAt');
    item.relationshipStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'relationshipStatus');
    item.relationshipWarningsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'relationshipWarnings');
    item.depth = AgentBridgeIncomingParser.extractNumberProperty(source, 'depth', 0);
    item.isRoot = AgentBridgeIncomingParser.extractBooleanProperty(source, 'isRoot');
    item.archivedAt = AgentBridgeIncomingParser.nullableStringProperty(source, 'archivedAt');
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.lastActivityAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastActivityAt');
    item.lastUserMessageAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastUserMessageAt');
    item.timelineAckJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'timelineAck');
    item.timelineSize = AgentBridgeIncomingParser.extractNumberProperty(source, 'timelineSize', 0);
    item.latestSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'latestSeq', 0);
    return item;
  }

  private static parseTimelineRecordObject(source: string): AgentBridgeAgentTimelineRecord {
    const item = new AgentBridgeAgentTimelineRecord();
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.epoch = AgentBridgeIncomingParser.extractNumberProperty(source, 'epoch', 0);
    item.seq = AgentBridgeIncomingParser.extractNumberProperty(source, 'seq', 0);
    item.kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    item.eventType = AgentBridgeIncomingParser.extractStringProperty(source, 'eventType');
    item.projectedJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'projectedItem');
    item.providerRawJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'providerRaw');
    item.createdAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'createdAt', 0);
    return item;
  }

  private static parseCheckpointRecordObject(source: string): AgentBridgeCheckpointRecord {
    const item = new AgentBridgeCheckpointRecord();
    item.checkpointId = AgentBridgeIncomingParser.extractStringProperty(source, 'checkpointId');
    item.agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    item.title = AgentBridgeIncomingParser.extractStringProperty(source, 'title');
    item.description = AgentBridgeIncomingParser.extractStringProperty(source, 'description');
    item.epoch = AgentBridgeIncomingParser.extractNumberProperty(source, 'epoch', 0);
    item.latestSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'latestSeq', 0);
    item.providerSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'providerSessionId');
    item.remoteSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'remoteSessionId');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.fileSnapshotStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'fileSnapshotStatus');
    item.fileSnapshotId = AgentBridgeIncomingParser.extractStringProperty(source, 'fileSnapshotId');
    item.filesScanned = AgentBridgeIncomingParser.extractNumberProperty(source, 'filesScanned', 0);
    item.filesCaptured = AgentBridgeIncomingParser.extractNumberProperty(source, 'filesCaptured', 0);
    item.skippedCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'skippedCount', 0);
    item.workspaceRoot = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceRoot');
    item.filePolicyJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'filePolicy');
    item.skippedReasons = AgentBridgeIncomingParser.parseCheckpointSkippedReasons(source);
    item.manifestVerified = AgentBridgeIncomingParser.extractBooleanProperty(source, 'manifestVerified');
    item.runtimeCheckpointStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeCheckpointStatus');
    item.runtimeCheckpointKind = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeCheckpointKind');
    item.runtimeRestoreSupported = AgentBridgeIncomingParser.extractBooleanProperty(source, 'runtimeRestoreSupported');
    item.runtimeRestoreStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeRestoreStatus');
    item.runtimeRestored = AgentBridgeIncomingParser.extractBooleanProperty(source, 'runtimeRestored');
    item.runtimeRestoreReason = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeRestoreReason');
    item.terminalCheckpointStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'terminalCheckpointStatus');
    item.terminalCheckpointKind = AgentBridgeIncomingParser.extractStringProperty(source, 'terminalCheckpointKind');
    item.terminalRestoreSupported = AgentBridgeIncomingParser.extractBooleanProperty(source, 'terminalRestoreSupported');
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    return item;
  }

  private static parseCheckpointSkippedReasons(source: string): Array<AgentBridgeCheckpointSkippedReason> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'skippedReasons');
    const items: Array<AgentBridgeCheckpointSkippedReason> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = new AgentBridgeCheckpointSkippedReason();
      item.reason = AgentBridgeIncomingParser.extractStringProperty(objects[index], 'reason');
      item.count = AgentBridgeIncomingParser.extractNumberProperty(objects[index], 'count', 0);
      if (item.reason.length > 0 && item.count > 0) {
        items.push(item);
      }
    }
    return items;
  }

  private static parseProjectRecordObject(source: string): AgentBridgeProjectRecord {
    const item = new AgentBridgeProjectRecord();
    item.projectId = AgentBridgeIncomingParser.extractStringProperty(source, 'projectId');
    item.rootPath = AgentBridgeIncomingParser.extractStringProperty(source, 'rootPath');
    item.kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    item.displayName = AgentBridgeIncomingParser.extractStringProperty(source, 'displayName');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.workspaceCount = AgentBridgeIncomingParser.extractNumberProperty(source, 'workspaceCount', 0);
    item.activeWorkspaces = AgentBridgeIncomingParser.extractNumberProperty(source, 'activeWorkspaces', 0);
    item.archivedWorkspaces = AgentBridgeIncomingParser.extractNumberProperty(source, 'archivedWorkspaces', 0);
    item.missingWorkspaces = AgentBridgeIncomingParser.extractNumberProperty(source, 'missingWorkspaces', 0);
    item.staleWorkspaces = AgentBridgeIncomingParser.extractNumberProperty(source, 'staleWorkspaces', 0);
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.archivedAt = AgentBridgeIncomingParser.nullableStringProperty(source, 'archivedAt');
    return item;
  }

  private static parseWorkspaceRecordObject(source: string): AgentBridgeWorkspaceRecord {
    const item = new AgentBridgeWorkspaceRecord();
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.projectId = AgentBridgeIncomingParser.extractStringProperty(source, 'projectId');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.workspacePath = AgentBridgeIncomingParser.extractStringProperty(source, 'workspacePath');
    if (item.workspacePath.length === 0) {
      item.workspacePath = item.cwd;
    }
    item.kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.source = AgentBridgeIncomingParser.extractStringProperty(source, 'source');
    item.displayName = AgentBridgeIncomingParser.extractStringProperty(source, 'displayName');
    item.title = AgentBridgeIncomingParser.nullableStringProperty(source, 'title');
    item.branch = AgentBridgeIncomingParser.nullableStringProperty(source, 'branch');
    item.missing = AgentBridgeIncomingParser.extractBooleanProperty(source, 'missing');
    item.stale = AgentBridgeIncomingParser.extractBooleanProperty(source, 'stale');
    item.sourceWorkspaceId = AgentBridgeIncomingParser.nullableStringProperty(source, 'sourceWorkspaceId');
    item.sourceRootPath = AgentBridgeIncomingParser.nullableStringProperty(source, 'sourceRootPath');
    item.worktreePath = AgentBridgeIncomingParser.nullableStringProperty(source, 'worktreePath');
    item.startPoint = AgentBridgeIncomingParser.nullableStringProperty(source, 'startPoint');
    item.lastOpenedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastOpenedAt');
    item.lastValidatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'lastValidatedAt');
    item.lastOpenStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'lastOpenStatus');
    item.openError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'openError'));
    const validationObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'validation');
    item.validation = AgentBridgeIncomingParser.parseWorkspaceRegistryValidation(validationObject);
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    item.archivedAt = AgentBridgeIncomingParser.nullableStringProperty(source, 'archivedAt');
    return item;
  }

  private static parseWorkspaceRegistryValidation(source: string): AgentBridgeWorkspaceRegistryValidation {
    const item = new AgentBridgeWorkspaceRegistryValidation();
    if (source.length === 0) {
      return item;
    }
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.code = AgentBridgeIncomingParser.extractStringProperty(source, 'code');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    item.errorsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'errors');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'warnings');
    return item;
  }

  private static parseWorkspaceSuggestionObject(source: string): AgentBridgeWorkspaceSuggestionRecord {
    const item = new AgentBridgeWorkspaceSuggestionRecord();
    item.path = AgentBridgeIncomingParser.extractStringProperty(source, 'path');
    item.displayName = AgentBridgeIncomingParser.extractStringProperty(source, 'displayName');
    item.source = AgentBridgeIncomingParser.extractStringProperty(source, 'source');
    item.exists = AgentBridgeIncomingParser.extractBooleanProperty(source, 'exists');
    return item;
  }

  private static parseWorkspaceDoctorCheckObject(source: string): AgentBridgeWorkspaceRegistryDoctorCheck {
    const item = new AgentBridgeWorkspaceRegistryDoctorCheck();
    item.id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    return item;
  }

  private static parseWorktreeRecordObject(source: string): AgentBridgeWorktreeRecord {
    const item = new AgentBridgeWorktreeRecord();
    item.path = AgentBridgeIncomingParser.extractStringProperty(source, 'path');
    item.head = AgentBridgeIncomingParser.extractStringProperty(source, 'head');
    item.branch = AgentBridgeIncomingParser.extractStringProperty(source, 'branch');
    item.detached = AgentBridgeIncomingParser.extractBooleanProperty(source, 'detached');
    item.bare = AgentBridgeIncomingParser.extractBooleanProperty(source, 'bare');
    item.locked = AgentBridgeIncomingParser.extractBooleanProperty(source, 'locked');
    item.lockedReason = AgentBridgeIncomingParser.extractStringProperty(source, 'lockedReason');
    item.prunable = AgentBridgeIncomingParser.extractBooleanProperty(source, 'prunable');
    item.prunableReason = AgentBridgeIncomingParser.extractStringProperty(source, 'prunableReason');
    item.gitRegistered = AgentBridgeIncomingParser.extractBooleanProperty(source, 'gitRegistered');
    item.registryLinked = AgentBridgeIncomingParser.extractBooleanProperty(source, 'registryLinked');
    item.registryWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'registryWorkspaceId');
    item.registryArchived = AgentBridgeIncomingParser.extractBooleanProperty(source, 'registryArchived');
    item.sourceWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'sourceWorkspaceId');
    item.sourceRootPath = AgentBridgeIncomingParser.extractStringProperty(source, 'sourceRootPath');
    item.startPoint = AgentBridgeIncomingParser.extractStringProperty(source, 'startPoint');
    item.missing = AgentBridgeIncomingParser.extractBooleanProperty(source, 'missing');
    item.stale = AgentBridgeIncomingParser.extractBooleanProperty(source, 'stale');
    item.setupStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'setupStatus');
    item.teardownStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'teardownStatus');
    item.setupMessage = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'setupMessage'));
    item.teardownMessage = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'teardownMessage'));
    return item;
  }

  static parseWorktreeActionResult(source: string): AgentBridgeWorktreeActionResult {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const sourceObject = payloadObject.length > 0 ? payloadObject : source;
    const item = new AgentBridgeWorktreeActionResult();
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'ok');
    item.action = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'action');
    item.command = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'command');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'cwd');
    item.exitCode = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'exitCode', 0);
    item.stdout = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stdout'));
    item.stderr = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'stderr'));
    item.durationMs = AgentBridgeIncomingParser.extractNumberProperty(sourceObject, 'durationMs', 0);
    item.rootPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'rootPath');
    item.worktreePath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'worktreePath');
    item.branch = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'branch');
    item.startPoint = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'startPoint');
    item.preview = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'preview');
    item.confirmed = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'confirmed');
    item.created = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'created');
    item.archived = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'archived');
    item.registryLinked = AgentBridgeIncomingParser.extractBooleanProperty(sourceObject, 'registryLinked');
    item.registryWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'registryWorkspaceId');
    item.sourceWorkspaceId = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sourceWorkspaceId');
    item.sourceRootPath = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'sourceRootPath');
    item.setupStatus = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'setupStatus');
    item.teardownStatus = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'teardownStatus');
    item.failureCategory = AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'failureCategory');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(sourceObject, 'remediation'));
    const validationObject = AgentBridgeIncomingParser.extractObjectProperty(sourceObject, 'validation');
    item.validation = AgentBridgeIncomingParser.parseWorktreeValidation(validationObject);
    return item;
  }

  private static parseWorktreeValidation(source: string): AgentBridgeWorktreeValidation {
    const item = new AgentBridgeWorktreeValidation();
    if (source.length === 0) {
      return item;
    }
    item.ok = AgentBridgeIncomingParser.extractBooleanProperty(source, 'ok');
    item.code = AgentBridgeIncomingParser.extractStringProperty(source, 'code');
    item.message = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    item.remediation = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'remediation'));
    item.errorsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'errors');
    item.warningsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'warnings');
    return item;
  }

  private static parseTerminalStateObject(source: string): AgentBridgeTerminalState {
    const item = new AgentBridgeTerminalState();
    item.terminalId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'terminalId', 'id');
    item.workspaceId = AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceId');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.name = AgentBridgeIncomingParser.extractStringProperty(source, 'name');
    item.status = AgentBridgeIncomingParser.extractStringProperty(source, 'status');
    item.rows = AgentBridgeIncomingParser.extractNumberProperty(source, 'rows', 0);
    item.cols = AgentBridgeIncomingParser.extractNumberProperty(source, 'cols', 0);
    item.captureLength = AgentBridgeIncomingParser.extractNumberProperty(source, 'captureLength', 0);
    item.captureBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'captureBytes', 0);
    item.capturePersisted = AgentBridgeIncomingParser.extractBooleanProperty(source, 'capturePersisted');
    item.capturePath = AgentBridgeIncomingParser.extractStringProperty(source, 'capturePath');
    item.captureStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'captureStatus');
    item.captureWarning = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'captureWarning'));
    item.capturePersistedBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'capturePersistedBytes', 0);
    item.capturePersistedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'capturePersistedAt', 0);
    item.snapshotSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotSeq', 0);
    item.restoreSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'restoreSeq', 0);
    item.snapshotMaxBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotMaxBytes', 0);
    item.snapshotBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotBytes', 0);
    item.snapshotTruncated = AgentBridgeIncomingParser.extractBooleanProperty(source, 'snapshotTruncated');
    item.snapshotSource = AgentBridgeIncomingParser.extractStringProperty(source, 'snapshotSource');
    item.snapshotPersistedBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotPersistedBytes', 0);
    item.snapshotWarning = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'snapshotWarning'));
    item.activity = AgentBridgeIncomingParser.extractStringProperty(source, 'activity');
    item.requiresAttention = AgentBridgeIncomingParser.extractBooleanProperty(source, 'requiresAttention');
    item.attentionReason = AgentBridgeIncomingParser.extractStringProperty(source, 'attentionReason');
    item.attentionAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'attentionAt', 0);
    item.lastInputError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastInputError'));
    item.lastResizeError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastResizeError'));
    item.mouseMode = AgentBridgeIncomingParser.extractStringProperty(source, 'mouseMode');
    item.lastMouseAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'lastMouseAt', 0);
    item.lastMouseError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastMouseError'));
    item.createdAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'createdAt', 0);
    item.updatedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', 0);
    item.hostname = AgentBridgeIncomingParser.extractStringProperty(source, 'hostname');
    return item;
  }

  private static parseTerminalHookRecordObject(source: string): AgentBridgeTerminalHookRecord {
    const item = new AgentBridgeTerminalHookRecord();
    item.name = AgentBridgeIncomingParser.extractStringProperty(source, 'name');
    item.path = AgentBridgeIncomingParser.extractStringProperty(source, 'path');
    item.shell = AgentBridgeIncomingParser.extractStringProperty(source, 'shell');
    item.exists = AgentBridgeIncomingParser.extractBooleanProperty(source, 'exists');
    item.installed = AgentBridgeIncomingParser.extractBooleanProperty(source, 'installed') || item.exists;
    item.sourceCommand = AgentBridgeIncomingParser.extractStringProperty(source, 'sourceCommand');
    item.source = AgentBridgeIncomingParser.extractStringProperty(source, 'source');
    if (item.source.length === 0) {
      item.source = item.sourceCommand;
    }
    item.profilePath = AgentBridgeIncomingParser.extractStringProperty(source, 'profilePath');
    item.profilePathsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'profilePaths');
    item.profileInstalled = AgentBridgeIncomingParser.extractBooleanProperty(source, 'profileInstalled');
    item.backupPath = AgentBridgeIncomingParser.extractStringProperty(source, 'backupPath');
    item.needsRestart = AgentBridgeIncomingParser.extractBooleanProperty(source, 'needsRestart');
    item.confirmRequired = AgentBridgeIncomingParser.extractBooleanProperty(source, 'confirmRequired');
    return item;
  }

  private static parseProviderProfileRecordObject(source: string): AgentBridgeProviderProfileRecord {
    const item = new AgentBridgeProviderProfileRecord();
    item.profileId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'profileId', 'id');
    item.providerId = AgentBridgeIncomingParser.extractStringProperty(source, 'providerId');
    item.displayName = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'displayName', 'name');
    item.description = AgentBridgeIncomingParser.extractStringProperty(source, 'description');
    item.endpoint = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'endpoint', 'baseUrl');
    item.binary = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'binary', 'command');
    item.args = AgentBridgeIncomingParser.extractStringProperty(source, 'args');
    item.cwd = AgentBridgeIncomingParser.extractStringProperty(source, 'cwd');
    item.envJson = AgentBridgeIncomingParser.extractObjectProperty(source, 'env');
    item.envMetadataJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'envMetadata');
    item.secretStorageState = AgentBridgeIncomingParser.extractStringProperty(source, 'secretStorageState');
    item.secretStoragePlatform = AgentBridgeIncomingParser.extractStringProperty(source, 'secretStoragePlatform');
    item.runtimeMode = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeMode');
    if (item.runtimeMode.length === 0) {
      item.runtimeMode = 'oneshot';
    }
    item.enabled = source.indexOf('"enabled"') >= 0 ? AgentBridgeIncomingParser.extractBooleanProperty(source, 'enabled') : true;
    item.runtimeRegistered = AgentBridgeIncomingParser.extractBooleanProperty(source, 'runtimeRegistered');
    item.runtimeProviderId = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeProviderId');
    item.runtimeError = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeError');
    item.runtimeFailureCategory = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeFailureCategory');
    item.runtimeRemediation = AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeRemediation');
    item.runtimeWarningsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'runtimeWarnings');
    item.baseProfileId = AgentBridgeIncomingParser.extractStringProperty(source, 'baseProfileId');
    item.cloneFromProfileId = AgentBridgeIncomingParser.extractStringProperty(source, 'cloneFromProfileId');
    item.validationMessagesJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'validationMessages');
    item.createdAt = AgentBridgeIncomingParser.extractStringProperty(source, 'createdAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    return item;
  }

  private static parseSecurityDeviceRecordObject(source: string): AgentBridgeSecurityDeviceRecord {
    const item = new AgentBridgeSecurityDeviceRecord();
    item.physicalDeviceId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'physicalDeviceId', 'deviceId');
    item.bridgeInstanceId = AgentBridgeIncomingParser.extractStringProperty(source, 'bridgeInstanceId');
    item.displayName = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'displayName', 'name');
    item.platform = AgentBridgeIncomingParser.extractStringProperty(source, 'platform');
    item.publicKeyFingerprint = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'publicKeyFingerprint', 'keyFingerprint');
    item.trusted = AgentBridgeIncomingParser.extractBooleanProperty(source, 'trusted');
    item.trustedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'trustedAt');
    item.revokedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'revokedAt');
    item.updatedAt = AgentBridgeIncomingParser.extractStringProperty(source, 'updatedAt');
    return item;
  }

  private static parseDeviceIdentityObject(source: string): AgentBridgeDeviceIdentity {
    if (source.length === 0) {
      return AgentBridgeDeviceIdentity.empty();
    }
    return new AgentBridgeDeviceIdentity(
      AgentBridgeIncomingParser.extractStringProperty(source, 'physicalDeviceId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'bridgeInstanceId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'displayName'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'platform'),
      AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'publicKeyPem')),
      AgentBridgeIncomingParser.extractStringProperty(source, 'publicKeyFingerprint'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'keyType'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'signatureAlgorithm')
    );
  }

  private static parseConnectionProofObject(source: string): AgentBridgeConnectionProof {
    if (source.length === 0) {
      return AgentBridgeConnectionProof.empty();
    }
    return new AgentBridgeConnectionProof(
      AgentBridgeIncomingParser.extractStringProperty(source, 'algorithm'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'keyType'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'curve'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'encoding'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'verifier'),
      AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'material')),
      AgentBridgeIncomingParser.extractStringProperty(source, 'signature'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'appNonce'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'serverNonce'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'issuedAt', 0)
    );
  }

  private static defaultInteractionModesForProvider(providerId: string): Array<AgentBridgeInteractionModeOption> {
    if (
      providerId === AgentBridgeProviderId.OPENCODE ||
        providerId === AgentBridgeProviderId.DEVECO ||
        providerId === AgentBridgeProviderId.MIMO
    ) {
      return AgentBridgeDefaultOptions.buildOpenCodeInteractionModes();
    }
    if (providerId === AgentBridgeProviderId.CODEX) {
      return AgentBridgeDefaultOptions.buildCodexInteractionModes();
    }
    return AgentBridgeDefaultOptions.buildDefaultInteractionModes();
  }

  private static parseModels(source: string): Array<AgentBridgeModelOption> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'models');
    const models: Array<AgentBridgeModelOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = objects[index];
      const id = AgentBridgeIncomingParser.extractStringProperty(item, 'id');
      const displayName = AgentBridgeIncomingParser.extractStringProperty(item, 'displayName');
      models.push(new AgentBridgeModelOption(
        id,
        displayName.length > 0 ? displayName : id,
        AgentBridgeIncomingParser.extractStringProperty(item, 'vendor'),
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault'),
        AgentBridgeIncomingParser.extractNumberProperty(item, 'contextWindow', 0),
        AgentBridgeIncomingParser.extractStringProperty(item, 'source'),
        AgentBridgeIncomingParser.optionAvailable(item),
        AgentBridgeIncomingParser.extractStringProperty(item, 'warning')
      ));
    }
    return models;
  }

  private static parseSpeedModes(source: string): Array<AgentBridgeSpeedModeOption> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'speedModes');
    const modes: Array<AgentBridgeSpeedModeOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = objects[index];
      const id = AgentBridgeIncomingParser.extractStringProperty(item, 'id');
      const displayName = AgentBridgeIncomingParser.extractStringProperty(item, 'displayName');
      modes.push(new AgentBridgeSpeedModeOption(
        id,
        displayName.length > 0 ? displayName : id,
        AgentBridgeIncomingParser.extractStringProperty(item, 'description'),
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'source'),
        AgentBridgeIncomingParser.optionAvailable(item),
        AgentBridgeIncomingParser.extractStringProperty(item, 'warning')
      ));
    }
    return modes;
  }

  private static parseReasoningModes(source: string): Array<AgentBridgeReasoningModeOption> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'reasoningModes');
    const modes: Array<AgentBridgeReasoningModeOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = objects[index];
      const id = AgentBridgeIncomingParser.extractStringProperty(item, 'id');
      const displayName = AgentBridgeIncomingParser.extractStringProperty(item, 'displayName');
      modes.push(new AgentBridgeReasoningModeOption(
        id,
        displayName.length > 0 ? displayName : id,
        AgentBridgeIncomingParser.extractStringProperty(item, 'description'),
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'source'),
        AgentBridgeIncomingParser.optionAvailable(item),
        AgentBridgeIncomingParser.extractStringProperty(item, 'warning')
      ));
    }
    return modes;
  }

  private static parseInteractionModes(source: string): Array<AgentBridgeInteractionModeOption> {
    let objects = AgentBridgeIncomingParser.extractObjectArray(source, 'interactionModes');
    if (objects.length === 0) {
      objects = AgentBridgeIncomingParser.extractObjectArray(source, 'runModes');
    }
    if (objects.length === 0) {
      objects = AgentBridgeIncomingParser.extractObjectArray(source, 'modes');
    }
    const modes: Array<AgentBridgeInteractionModeOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = objects[index];
      const id = AgentBridgeIncomingParser.extractStringProperty(item, 'id');
      const displayName = AgentBridgeIncomingParser.extractFirstStringProperty(item, 'displayName', 'name');
      if (id.length === 0 && displayName.length === 0) {
        continue;
      }
      const modeId = id.length > 0 ? id : displayName;
      const category = AgentBridgeIncomingParser.extractStringProperty(item, 'category');
      modes.push(new AgentBridgeInteractionModeOption(
        modeId,
        displayName.length > 0 ? displayName : modeId,
        AgentBridgeIncomingParser.extractStringProperty(item, 'description'),
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'agent'),
        category.length > 0 ? category : 'run',
        AgentBridgeIncomingParser.extractStringProperty(item, 'source'),
        AgentBridgeIncomingParser.optionAvailable(item),
        AgentBridgeIncomingParser.extractStringProperty(item, 'warning')
      ));
    }
    return modes;
  }

  private static parseTools(source: string): Array<AgentBridgeToolOption> {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'tools');
    const tools: Array<AgentBridgeToolOption> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = objects[index];
      const id = AgentBridgeIncomingParser.extractStringProperty(item, 'id');
      const displayName = AgentBridgeIncomingParser.extractStringProperty(item, 'displayName');
      tools.push(new AgentBridgeToolOption(
        id,
        displayName.length > 0 ? displayName : id,
        AgentBridgeIncomingParser.extractStringProperty(item, 'description'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'risk'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'source'),
        AgentBridgeIncomingParser.optionAvailable(item),
        AgentBridgeIncomingParser.extractStringProperty(item, 'warning'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'slashCommand'),
        AgentBridgeIncomingParser.extractStringArrayProperty(item, 'aliases'),
        AgentBridgeIncomingParser.extractStringProperty(item, 'category'),
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'requiresConfirmation')
      ));
    }
    return tools;
  }

  private static parseRemoteSessionObject(source: string): AgentBridgeRemoteSession {
    return new AgentBridgeRemoteSession(
      AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'remoteSessionId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'providerId'),
      AgentBridgeIncomingParser.extractRemoteSessionTitle(source),
      AgentBridgeIncomingParser.extractStringProperty(source, 'workspacePath'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'workspaceTitle'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'branchName'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'modelId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'speedMode'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'reasoningMode'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'status'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'source'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'messageCount', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', 0),
      '',
      AgentBridgeIncomingParser.extractStringProperty(source, 'runtimeMode'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'interactiveReady'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'sessionState'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'exitCode', 0),
      AgentBridgeIncomingParser.extractStringProperty(source, 'lastError')
    );
  }

  private static extractRemoteSessionTitle(source: string): string {
    let title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'title', 'displayTitle');
    if (title.length === 0) {
      title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'threadName', 'thread_name');
    }
    if (title.length === 0) {
      title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'conversationTitle', 'conversation_title');
    }
    if (title.length === 0) {
      title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'name', 'summary');
    }
    if (title.length === 0) {
      title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'initialPrompt', 'prompt');
    }
    if (title.length === 0) {
      title = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'firstMessage', 'message');
    }
    return AgentBridgeIncomingParser.cleanJsonText(title).trim();
  }

  private static parseImportedMessageObject(source: string): AgentBridgeImportedMessage {
    const id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    const messageId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'messageId', 'messageID');
    return new AgentBridgeImportedMessage(
      id,
      AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'role'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'title'),
      AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'text')),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'createdAt', Date.now()),
      AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'reasoningText')),
      messageId.length > 0 ? messageId : id,
      AgentBridgeIncomingParser.extractAgentName(source)
    );
  }

  private static parseImportedToolCallObject(source: string): AgentBridgeImportedToolCall {
    const id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    let toolCallId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'toolCallId', 'tool_call_id');
    if (toolCallId.length === 0) {
      toolCallId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'callId', 'call_id');
    }
    if (toolCallId.length === 0) {
      toolCallId = AgentBridgeIncomingParser.extractStringProperty(source, 'callID');
    }
    const name = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'name', 'toolName');
    const rawJson = AgentBridgeIncomingParser.extractStringProperty(source, 'rawJson');
    let outputText = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'outputText', 'output');
    if (outputText.length === 0) {
      outputText = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'text', 'stdout');
    }
    let errorText = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'errorText', 'error');
    if (errorText.length === 0) {
      errorText = AgentBridgeIncomingParser.extractStringProperty(source, 'stderr');
    }
    return new AgentBridgeImportedToolCall(
      id.length > 0 ? id : toolCallId,
      AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'providerId'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'messageId'),
      toolCallId,
      name.length > 0 ? name : toolCallId,
      AgentBridgeIncomingParser.extractStringProperty(source, 'status'),
      AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(source, 'inputText', 'input')
      ),
      AgentBridgeIncomingParser.cleanJsonText(outputText),
      AgentBridgeIncomingParser.cleanJsonText(errorText),
      rawJson.length > 0 ? AgentBridgeIncomingParser.cleanJsonText(rawJson) : source,
      AgentBridgeIncomingParser.extractNumberProperty(source, 'startedAt', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'completedAt', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', 0),
      AgentBridgeIncomingParser.extractAgentName(source)
    );
  }

  private static extractAgentName(source: string): string {
    const directAgent = AgentBridgeIncomingParser.extractAgentNameValue(source);
    if (directAgent.length > 0) {
      return directAgent;
    }
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const payloadAgent = AgentBridgeIncomingParser.extractAgentNameValue(payloadObject);
    if (payloadAgent.length > 0) {
      return payloadAgent;
    }
    const partObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'part');
    const partAgent = AgentBridgeIncomingParser.extractAgentNameValue(partObject);
    if (partAgent.length > 0) {
      return partAgent;
    }
    const messageObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'message');
    const messageAgent = AgentBridgeIncomingParser.extractAgentNameValue(messageObject);
    if (messageAgent.length > 0) {
      return messageAgent;
    }
    const infoObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'info');
    return AgentBridgeIncomingParser.extractAgentNameValue(infoObject);
  }

  private static extractAgentNameValue(source: string): string {
    const directAgent = AgentBridgeIncomingParser.extractStringProperty(source, 'agent');
    if (directAgent.length > 0) {
      return directAgent;
    }
    const agentName = AgentBridgeIncomingParser.extractStringProperty(source, 'agentName');
    if (agentName.length > 0) {
      return agentName;
    }
    const subagent = AgentBridgeIncomingParser.extractStringProperty(source, 'subagent');
    if (subagent.length > 0) {
      return subagent;
    }
    const subAgent = AgentBridgeIncomingParser.extractStringProperty(source, 'subAgent');
    if (subAgent.length > 0) {
      return subAgent;
    }
    const agentId = AgentBridgeIncomingParser.extractStringProperty(source, 'agentId');
    if (agentId.length > 0) {
      return agentId;
    }
    return AgentBridgeIncomingParser.extractStringProperty(source, 'agentID');
  }

  private static extractContentKind(source: string): string {
    const directKind = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'contentKind', 'partType');
    if (directKind.length > 0) {
      return directKind;
    }
    const partObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'part');
    if (partObject.length === 0) {
      return '';
    }
    return AgentBridgeIncomingParser.extractStringProperty(partObject, 'type');
  }

  private static extractMessageId(source: string): string {
    const directMessageId = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'messageID', 'messageId');
    if (directMessageId.length > 0) {
      return directMessageId;
    }
    const partObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'part');
    const partMessageId = AgentBridgeIncomingParser.extractFirstStringProperty(partObject, 'messageID', 'messageId');
    if (partMessageId.length > 0) {
      return partMessageId;
    }

    const messageObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'message');
    const messageId = AgentBridgeIncomingParser.extractFirstStringProperty(messageObject, 'id', 'messageID');
    if (messageId.length > 0) {
      return messageId;
    }
    const messageIdFallback = AgentBridgeIncomingParser.extractStringProperty(messageObject, 'messageId');
    if (messageIdFallback.length > 0) {
      return messageIdFallback;
    }

    const infoObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'info');
    const infoMessageId = AgentBridgeIncomingParser.extractFirstStringProperty(infoObject, 'id', 'messageID');
    if (infoMessageId.length > 0) {
      return infoMessageId;
    }
    const infoMessageIdFallback = AgentBridgeIncomingParser.extractStringProperty(infoObject, 'messageId');
    if (infoMessageIdFallback.length > 0) {
      return infoMessageIdFallback;
    }

    return '';
  }

  private static extractPartId(source: string): string {
    const directPartId = AgentBridgeIncomingParser.extractStringProperty(source, 'partId');
    if (directPartId.length > 0) {
      return directPartId;
    }
    const partObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'part');
    if (partObject.length === 0) {
      return '';
    }
    return AgentBridgeIncomingParser.extractStringProperty(partObject, 'id');
  }

  static extractFirstStringProperty(source: string, firstKey: string, secondKey: string): string {
    const firstValue = AgentBridgeIncomingParser.extractStringProperty(source, firstKey);
    if (firstValue.length > 0) {
      return firstValue;
    }
    return AgentBridgeIncomingParser.extractStringProperty(source, secondKey);
  }

  static extractPayloadFirstStringProperty(payload: string, source: string, key: string): string {
    const payloadValue = AgentBridgeIncomingParser.extractStringProperty(payload, key);
    if (payloadValue.length > 0) {
      return payloadValue;
    }
    return AgentBridgeIncomingParser.extractStringProperty(source, key);
  }

  static extractPayloadFirstPairStringProperty(payload: string, source: string, firstKey: string, secondKey: string): string {
    const payloadValue = AgentBridgeIncomingParser.extractFirstStringProperty(payload, firstKey, secondKey);
    if (payloadValue.length > 0) {
      return payloadValue;
    }
    return AgentBridgeIncomingParser.extractFirstStringProperty(source, firstKey, secondKey);
  }

  private static extractIndexedPayloadFirstStringProperty(
    payload: string,
    source: string,
    propertyIndex: Map<string, number>,
    key: string
  ): string {
    const payloadValue = AgentBridgeIncomingParser.extractStringProperty(payload, key);
    if (payloadValue.length > 0) {
      return payloadValue;
    }
    return AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, key);
  }

  private static extractIndexedPayloadFirstPairStringProperty(
    payload: string,
    source: string,
    propertyIndex: Map<string, number>,
    firstKey: string,
    secondKey: string
  ): string {
    const payloadValue = AgentBridgeIncomingParser.extractFirstStringProperty(payload, firstKey, secondKey);
    if (payloadValue.length > 0) {
      return payloadValue;
    }
    const firstValue = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, firstKey);
    if (firstValue.length > 0) {
      return firstValue;
    }
    return AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, secondKey);
  }

  private static extractIndexedStringProperty(source: string, propertyIndex: Map<string, number>, key: string): string {
    const valueStart = AgentBridgeIncomingParser.indexedPropertyValueStart(propertyIndex, key);
    if (valueStart < 0 || valueStart >= source.length || source.charAt(valueStart) !== '"') {
      return '';
    }
    return AgentBridgeIncomingParser.extractStringValueAt(source, valueStart);
  }

  private static extractIndexedNumberProperty(
    source: string,
    propertyIndex: Map<string, number>,
    key: string,
    fallbackValue: number
  ): number {
    const valueStart = AgentBridgeIncomingParser.indexedPropertyValueStart(propertyIndex, key);
    if (valueStart < 0) {
      return fallbackValue;
    }
    return AgentBridgeIncomingParser.extractNumberValueAt(source, valueStart, fallbackValue);
  }

  private static extractIndexedAgentNameValue(source: string, propertyIndex: Map<string, number>): string {
    const directAgent = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'agent');
    if (directAgent.length > 0) {
      return directAgent;
    }
    const agentName = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'agentName');
    if (agentName.length > 0) {
      return agentName;
    }
    const subagent = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'subagent');
    if (subagent.length > 0) {
      return subagent;
    }
    const subAgent = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'subAgent');
    if (subAgent.length > 0) {
      return subAgent;
    }
    const agentId = AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'agentId');
    if (agentId.length > 0) {
      return agentId;
    }
    return AgentBridgeIncomingParser.extractIndexedStringProperty(source, propertyIndex, 'agentID');
  }

  private static indexedPropertyValueStart(propertyIndex: Map<string, number>, key: string): number {
    if (!propertyIndex.has(key)) {
      return -1;
    }
    const value = propertyIndex.get(key);
    if (value === undefined) {
      return -1;
    }
    return value;
  }

  static extractStringProperty(source: string, key: string): string {
    const valueStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (valueStart < 0 || valueStart >= source.length || source.charAt(valueStart) !== '"') {
      return '';
    }
    return AgentBridgeIncomingParser.extractStringValueAt(source, valueStart);
  }

  static nullableStringProperty(source: string, key: string): string {
    const valueStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (valueStart < 0 || valueStart >= source.length) {
      return '';
    }
    if (source.substring(valueStart, valueStart + 4) === 'null') {
      return '';
    }
    if (source.charAt(valueStart) !== '"') {
      return '';
    }
    return AgentBridgeIncomingParser.extractStringValueAt(source, valueStart);
  }

  static hasProperty(source: string, key: string): boolean {
    return AgentBridgeIncomingParser.findPropertyValueStart(source, key) >= 0;
  }

  private static extractStringValueAt(source: string, valueStart: number): string {
    const contentStart = valueStart + 1;
    let valueEnd = contentStart;
    let isEscaped = false;
    while (valueEnd < source.length) {
      const current = source.charAt(valueEnd);
      if (current === '\\' && !isEscaped) {
        isEscaped = true;
        valueEnd = valueEnd + 1;
        continue;
      }
      if (current === '"' && !isEscaped) {
        break;
      }
      isEscaped = false;
      valueEnd = valueEnd + 1;
    }
    if (valueEnd <= contentStart) {
      return '';
    }
    return source.substring(contentStart, valueEnd);
  }

  static extractBooleanProperty(source: string, key: string): boolean {
    const valueStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (valueStart < 0) {
      return false;
    }
    return source.substring(valueStart, valueStart + 4) === 'true';
  }

  private static optionAvailable(source: string): boolean {
    const valueStart = AgentBridgeIncomingParser.findPropertyValueStart(source, 'available');
    if (valueStart < 0) {
      return true;
    }
    return source.substring(valueStart, valueStart + 5) !== 'false';
  }

  static extractNumberProperty(source: string, key: string, fallbackValue: number): number {
    const valueStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (valueStart < 0) {
      return fallbackValue;
    }
    return AgentBridgeIncomingParser.extractNumberValueAt(source, valueStart, fallbackValue);
  }

  private static extractNumberValueAt(source: string, valueStart: number, fallbackValue: number): number {
    let valueEnd = valueStart;
    while (valueEnd < source.length) {
      const current = source.charAt(valueEnd);
      if (
        (current >= '0' && current <= '9') ||
          current === '.' ||
          current === '-' ||
          current === '+' ||
          current === 'e' ||
          current === 'E'
      ) {
        valueEnd = valueEnd + 1;
        continue;
      }
      break;
    }
    const raw = source.substring(valueStart, valueEnd);
    if (raw.length === 0) {
      return fallbackValue;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return fallbackValue;
    }
    return parsed;
  }

  static extractObjectProperty(source: string, key: string): string {
    const objectStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (objectStart < 0) {
      return '';
    }
    if (objectStart >= source.length || source.charAt(objectStart) !== '{') {
      return '';
    }
    return AgentBridgeIncomingParser.scanObject(source, objectStart);
  }

  static shouldUseNestedObjectScan(source: string): boolean {
    return source.length <= AGENT_BRIDGE_NESTED_SCAN_LIMIT;
  }

  private static collectPropertyValueStarts(source: string): Map<string, number> {
    const positions: Map<string, number> = new Map<string, number>();
    let index = 0;
    let isEscaped = false;
    let inString = false;
    let stringStart = -1;
    while (index < source.length) {
      const current = source.charAt(index);
      if (inString) {
        if (current === '\\' && !isEscaped) {
          isEscaped = true;
          index = index + 1;
          continue;
        }
        if (current === '"' && !isEscaped) {
          const key = source.substring(stringStart + 1, index);
          let valueStart = index + 1;
          while (valueStart < source.length && AgentBridgeIncomingParser.isJsonWhitespace(source.charAt(valueStart))) {
            valueStart = valueStart + 1;
          }
          if (valueStart < source.length && source.charAt(valueStart) === ':') {
            valueStart = valueStart + 1;
            while (valueStart < source.length && AgentBridgeIncomingParser.isJsonWhitespace(source.charAt(valueStart))) {
              valueStart = valueStart + 1;
            }
            if (!positions.has(key)) {
              positions.set(key, valueStart);
            }
          }
          inString = false;
          stringStart = -1;
        }
        isEscaped = false;
        index = index + 1;
        continue;
      }
      if (current === '"') {
        inString = true;
        isEscaped = false;
        stringStart = index;
      }
      index = index + 1;
    }
    return positions;
  }

  private static findPropertyValueStart(source: string, key: string): number {
    const marker = '"' + key + '"';
    let searchStart = 0;
    while (searchStart < source.length) {
      const nameStart = source.indexOf(marker, searchStart);
      if (nameStart < 0) {
        return -1;
      }
      let valueStart = nameStart + marker.length;
      while (valueStart < source.length && AgentBridgeIncomingParser.isJsonWhitespace(source.charAt(valueStart))) {
        valueStart = valueStart + 1;
      }
      if (valueStart < source.length && source.charAt(valueStart) === ':') {
        valueStart = valueStart + 1;
        while (valueStart < source.length && AgentBridgeIncomingParser.isJsonWhitespace(source.charAt(valueStart))) {
          valueStart = valueStart + 1;
        }
        return valueStart;
      }
      searchStart = nameStart + marker.length;
    }
    return -1;
  }

  private static isJsonWhitespace(value: string): boolean {
    return value === ' ' || value === '\n' || value === '\r' || value === '\t';
  }

  static extractObjectArray(source: string, key: string): Array<string> {
    const objects: Array<string> = [];
    const arrayStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (arrayStart < 0 || arrayStart >= source.length || source.charAt(arrayStart) !== '[') {
      return objects;
    }
    let index = arrayStart + 1;
    while (index < source.length) {
      const current = source.charAt(index);
      if (current === ']') {
        break;
      }
      if (current === '{') {
        const objectText = AgentBridgeIncomingParser.scanObject(source, index);
        if (objectText.length > 0) {
          objects.push(objectText);
          index = index + objectText.length;
          continue;
        }
      }
      index = index + 1;
    }
    return objects;
  }

  static extractArrayProperty(source: string, key: string): string {
    const arrayStart = AgentBridgeIncomingParser.findPropertyValueStart(source, key);
    if (arrayStart < 0 || arrayStart >= source.length || source.charAt(arrayStart) !== '[') {
      return '';
    }
    return AgentBridgeIncomingParser.scanArray(source, arrayStart);
  }

  static extractStringArrayProperty(source: string, key: string): Array<string> {
    const arrayText = AgentBridgeIncomingParser.extractArrayProperty(source, key);
    const items: Array<string> = [];
    if (arrayText.length === 0) {
      return items;
    }
    let index = 1;
    while (index < arrayText.length - 1) {
      const current = arrayText.charAt(index);
      if (current === '"') {
        const rawValue = AgentBridgeIncomingParser.extractStringValueAt(arrayText, index);
        const value = AgentBridgeIncomingParser.cleanJsonText(rawValue);
        if (value.length > 0) {
          items.push(value);
        }
        const valueEnd = AgentBridgeIncomingParser.stringValueEnd(arrayText, index);
        if (valueEnd > index) {
          index = valueEnd + 1;
          continue;
        }
      }
      index = index + 1;
    }
    return items;
  }

  private static stringValueEnd(source: string, valueStart: number): number {
    let index = valueStart + 1;
    let isEscaped = false;
    while (index < source.length) {
      const current = source.charAt(index);
      if (current === '\\' && !isEscaped) {
        isEscaped = true;
        index = index + 1;
        continue;
      }
      if (current === '"' && !isEscaped) {
        return index;
      }
      isEscaped = false;
      index = index + 1;
    }
    return valueStart;
  }

  private static scanArray(source: string, arrayStart: number): string {
    let depth = 0;
    let index = arrayStart;
    let isEscaped = false;
    let inString = false;
    while (index < source.length) {
      const current = source.charAt(index);
      if (inString) {
        if (current === '\\' && !isEscaped) {
          isEscaped = true;
          index = index + 1;
          continue;
        }
        if (current === '"' && !isEscaped) {
          inString = false;
        }
        isEscaped = false;
        index = index + 1;
        continue;
      }
      if (current === '"') {
        inString = true;
      } else if (current === '[') {
        depth = depth + 1;
      } else if (current === ']') {
        depth = depth - 1;
        if (depth === 0) {
          return source.substring(arrayStart, index + 1);
        }
      }
      index = index + 1;
    }
    return '';
  }

  private static scanObject(source: string, objectStart: number): string {
    let depth = 0;
    let index = objectStart;
    let isEscaped = false;
    let inString = false;
    while (index < source.length) {
      const current = source.charAt(index);
      if (inString) {
        if (current === '\\' && !isEscaped) {
          isEscaped = true;
          index = index + 1;
          continue;
        }
        if (current === '"' && !isEscaped) {
          inString = false;
        }
        isEscaped = false;
        index = index + 1;
        continue;
      }
      if (current === '"') {
        inString = true;
      } else if (current === '{') {
        depth = depth + 1;
      } else if (current === '}') {
        depth = depth - 1;
        if (depth === 0) {
          return source.substring(objectStart, index + 1);
        }
      }
      index = index + 1;
    }
    return '';
  }

  static cleanJsonText(text: string): string {
    if (text.length === 0) {
      return '';
    }
    let index = text.indexOf('\\');
    if (index < 0) {
      return text;
    }

    const parts: Array<string> = [];
    let copiedStart = 0;
    while (index >= 0 && index < text.length) {
      if (index + 1 >= text.length) {
        break;
      }

      const next = text.charAt(index + 1);
      let replacement = '';
      let consumedLength = 2;
      let matched = true;
      if (next === 'n') {
        replacement = '\n';
      } else if (next === 'r') {
        replacement = '\r';
      } else if (next === 't') {
        replacement = '\t';
      } else if (next === 'b') {
        replacement = '\b';
      } else if (next === 'f') {
        replacement = '\f';
      } else if (next === '"') {
        replacement = '"';
      } else if (next === '\\') {
        replacement = '\\';
      } else if (next === '/') {
        replacement = '/';
      } else if (next === 'u') {
        const code = AgentBridgeIncomingParser.readJsonUnicodeCode(text, index + 2);
        if (code >= 0) {
          replacement = String.fromCharCode(code);
          consumedLength = 6;
        } else {
          matched = false;
        }
      } else {
        matched = false;
      }

      if (matched) {
        if (index > copiedStart) {
          parts.push(text.substring(copiedStart, index));
        }
        parts.push(replacement);
        index = index + consumedLength;
        copiedStart = index;
      } else {
        index = index + 1;
      }
      index = text.indexOf('\\', index);
    }

    if (parts.length === 0) {
      return text;
    }
    if (copiedStart < text.length) {
      parts.push(text.substring(copiedStart));
    }
    return parts.join('');
  }

  private static readJsonUnicodeCode(source: string, start: number): number {
    if (start + 4 > source.length) {
      return -1;
    }
    let value = 0;
    for (let offset = 0; offset < 4; offset++) {
      const hexValue = AgentBridgeIncomingParser.jsonHexValue(source.charAt(start + offset));
      if (hexValue < 0) {
        return -1;
      }
      value = value * 16 + hexValue;
    }
    return value;
  }

  private static jsonHexValue(source: string): number {
    if (source.length === 0) {
      return -1;
    }
    const code = source.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      return code - 48;
    }
    if (code >= 65 && code <= 70) {
      return code - 55;
    }
    if (code >= 97 && code <= 102) {
      return code - 87;
    }
    return -1;
  }
}
