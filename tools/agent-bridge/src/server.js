'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const {
  authenticateCredential,
  hostAllowed,
  normalizeHostHeader,
  validateAndRememberNonce
} = require('./auth');
const { createConfig } = require('./config');
const { AgentManager } = require('./agent-manager');
const { AgentForkCoordinator } = require('./agent-fork-coordinator');
const { AgentLifecycleCoordinator } = require('./agent-lifecycle-coordinator');
const { AutostartManager } = require('./autostart-manager');
const { DaemonUpdateManager } = require('./daemon-update-manager');
const { DaemonRemoteConfigManager } = require('./daemon-remote-config-manager');
const { validateDaemonTarget } = require('./daemon-target-guard');
const { createDaemonStore } = require('./daemon-store');
const { FileCheckpointStore } = require('./file-checkpoint-store');
const { signConnectionChallenge } = require('./device-identity');
const { ManagedProcessLedger, processIsAlive } = require('./managed-process-ledger');
const { ProviderCatalog } = require('./provider-catalog');
const { ProviderRegistry } = require('./provider-registry');
const { MockProvider } = require('./providers/mock-provider');
const { OpenCodeProvider } = require('./providers/opencode-provider');
const {
  CliProvider,
  createOpenClawProvider,
  createHermesProvider,
  createClaudeProvider,
  createAntigravityProvider
} = require('./providers/cli-provider');
const { createCodexAppServerProvider } = require('./providers/codex-app-server-provider');
const {
  OpenClawGatewayProvider,
  HermesStudioProvider
} = require('./providers/gateway-provider');
const {
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_V2,
  RequestType,
  EventType,
  makeResponse,
  makeErrorResponse,
  makeEvent,
  parseClientMessage,
  readString,
  readNumber
} = require('./protocol');
const { acceptWebSocket } = require('./websocket');
const { createWebSocketClient } = require('./websocket-client');
const { RelayManager } = require('./relay-manager');
const { WorkspaceService } = require('./workspace-service');
const { WorkspaceRegistry } = require('./workspace-registry');
const { createTerminalLogger } = require('./terminal-log');
const { decodeBinaryFrame, TERMINAL_STREAM_PROTOCOL_VERSION } = require('./binary-frames');
const { FileTransferManager } = require('./file-transfer-manager');
const { TerminalManager } = require('./terminal-manager');
const { GitHubClient } = require('./github-client');
const { McpHostManager } = require('./mcp-host');
const { NotificationManager } = require('./notification-manager');
const { PushNotificationManager } = require('./push-notification-manager');
const { ProviderDirectoryManager } = require('./provider-directory-manager');
const { ProviderSecretStore } = require('./provider-secret-store');
const { ProviderProfileService } = require('./provider-profile-service');
const { ProviderUsageService, providerUsageQuotaEvents } = require('./provider-usage-service');
const { MessageQueueManager, UsageManager, normalizeRichContentNodes, sanitizeComposerTokens } = require('./agent-experience-manager');
const { validateMetadataScope, normalizeMetadataResult } = require('./metadata-scope');
const { sendScopedUsageEvent } = require('./usage-event-router');
const { sendScopedVoiceEvent } = require('./voice-event-router');
const { sendScopedBrowserEvent } = require('./browser-event-router');
const { sendScopedServiceEvent } = require('./service-event-router');
const { sendScopedFileTransferEvent } = require('./file-transfer-event-router');
const {
  isScopedTerminalEvent,
  publicTerminalEvent,
  selectScopedTerminalConnections
} = require('./terminal-event-router');
const {
  rememberAutomationResult,
  sendScopedAutomationEvent,
  sendScopedAutomationRuntimeEvent,
  clearAutomationEventScopes,
  runtimeEventWorkspaceId
} = require('./automation-event-router');
const { ScheduleManager } = require('./schedule-manager');
const { LoopManager } = require('./loop-manager');
const { ChatRoomManager } = require('./chat-room-manager');
const { VoiceManager } = require('./voice-manager');
const { BrowserAutomationManager } = require('./browser-automation-manager');
const { createBrowserPlatformHostAdapter } = require('./browser-platform-host');
const { ServiceProxyManager } = require('./service-manager');
const {
  SERVICE_SESSION_COOKIE,
  ServiceAccessTicketManager,
  normalizeAccessHost,
  readCookieValue,
  serviceSessionCookie
} = require('./service-access-ticket-manager');
const { resolveServiceProxyRoute, serviceProxyOriginAllowed } = require('./service-proxy-router');
const { buildDaemonDoctorReport, buildDiagnosticsExportReport, buildCompatibilityInfo, redactDiagnosticText } = require('./diagnostics');
const { openFile, openFileCommandForPlatform } = require('./open-file');
const {
  SecurityAuditLog,
  bearerTokenStatus,
  bcryptStatus,
  hostAllowlistStatus,
  rotateBearerToken,
  setAuthPreference,
  setHostAllowlist,
  setTlsPreference,
  tlsStatus
} = require('./security-audit');

const config = createConfig();
const WEB_ROOT = path.join(__dirname, 'web');
const webAuthTickets = new Map();
const WEB_TICKET_TTL_MS = 60 * 1000;
const webAuthSessions = new Map();
const WEB_SESSION_COOKIE = 'ngf_web_session';
const WEB_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const registry = new ProviderRegistry();
registry.register(new MockProvider());
registry.register(new OpenCodeProvider(config.openCode));
registry.register(new OpenCodeProvider(config.devEco));
registry.register(new OpenCodeProvider(config.mimoCode));
registry.register(createCodexAppServerProvider(config.codex));
registry.register(createClaudeProvider(config.claude));
registry.register(createAntigravityProvider(config.antigravity));
registry.register(createOpenClawProvider(config.openClaw));
registry.register(new OpenClawGatewayProvider(config.openClawGateway));
registry.register(createHermesProvider(config.hermes));
registry.register(new HermesStudioProvider(config.hermesStudio));
const daemonStore = createDaemonStore();
const providerSecretStore = new ProviderSecretStore({ homeDirectory: daemonStore.baseDirectory });
const providerProfileService = new ProviderProfileService({ store: daemonStore, secretStore: providerSecretStore });
providerProfileService.migrateLegacyProfiles();
const autostartManager = new AutostartManager(daemonStore);
const daemonUpdateManager = new DaemonUpdateManager(daemonStore);
const workspaceRegistry = new WorkspaceRegistry(daemonStore);
const workspaceService = new WorkspaceService(registry, workspaceRegistry);
const agentManager = new AgentManager({ store: daemonStore, workspaceRegistry });
workspaceService.setAgentManager(agentManager);
const agentForkCoordinator = new AgentForkCoordinator({ agentManager, workspaceService, workspaceRegistry });
const providerCatalog = new ProviderCatalog(registry);
const providerUsageService = new ProviderUsageService(registry);
const fileCheckpointStore = new FileCheckpointStore(daemonStore);
const managedProcessLedger = new ManagedProcessLedger(daemonStore);
const githubClient = new GitHubClient({ store: daemonStore });
const mcpHost = new McpHostManager({ store: daemonStore, config });
const notificationManager = new NotificationManager(daemonStore);
const pushNotificationManager = new PushNotificationManager(daemonStore, config.push);
const securityAudit = new SecurityAuditLog(daemonStore);
const relayManager = new RelayManager({
  store: daemonStore,
  legacyProfile: config.profile,
  clientFactory: (url, handlers) => createWebSocketClient(url, handlers),
  onSessionOpen: (connection) => registerBridgeClientConnection(connection),
  onSessionText: (text, connection) => { void handleClientMessage(text, connection); },
  onSessionBinary: (payload, connection) => handleClientBinaryMessage(payload, connection),
  onSessionClose: (connection, reason) => unregisterBridgeClientConnection(connection, reason),
  onUpdated: (status, devicesChanged) => {
    broadcastToClients(makeEvent(EventType.RELAY_UPDATED, '', status));
    if (devicesChanged) {
      broadcastToClients(makeEvent(EventType.RELAY_DEVICE_UPDATED, '', relayManager.devices({ includeRevoked: true })));
    }
  },
  audit: (event) => recordSecurityAudit(event)
});
const messageQueueManager = new MessageQueueManager(daemonStore);
const usageManager = new UsageManager(daemonStore, {
  onBudgetWarning: (warning, sourceConnection) => sendScopedUsageEvent(
    activeWsConnections,
    readString(warning, 'hostProfileId', ''),
    sourceConnection,
    makeEvent(EventType.USAGE_BUDGET_WARNING, warning.sessionId || '', warning)
  )
});
const scheduleManager = new ScheduleManager({
  store: daemonStore,
  execute: (input) => executeScheduleAutomation(input),
  onUpdated: (event) => sendScopedAutomationEvent(
    activeWsConnections,
    'schedule',
    makeEvent(
      String(event.kind || '').startsWith('run.') ? EventType.SCHEDULE_RUN_UPDATED : EventType.SCHEDULE_UPDATED,
      '',
      event
    )
  )
});
const loopManager = new LoopManager({
  store: daemonStore,
  executeWorker: (input) => executeLoopWorker(input),
  executeVerifier: (input) => executeLoopVerifier(input),
  cancelAgent: (agentId, reason) => cancelAutomationAgent(agentId, reason),
  onUpdated: (event) => sendScopedAutomationEvent(
    activeWsConnections,
    'loop',
    makeEvent(
      String(event.kind || '').includes('round') || String(event.kind || '').includes('worker') || String(event.kind || '').includes('verifier')
        ? EventType.LOOP_ROUND_UPDATED
        : EventType.LOOP_UPDATED,
      '',
      event
    )
  )
});
const chatRoomManager = new ChatRoomManager({
  store: daemonStore,
  resolveAgent: (agentId) => agentManager.find(agentId),
  dispatchAgent: (input) => dispatchChatRoomAgent(input),
  onUpdated: (event) => sendScopedAutomationEvent(
    activeWsConnections,
    'chatRoom',
    makeEvent(
      event.kind === 'message.created' ? EventType.CHAT_ROOM_MESSAGE_CREATED
        : (event.kind === 'ack.updated' ? EventType.CHAT_ROOM_ACK_UPDATED : EventType.CHAT_ROOM_UPDATED),
      '',
      event
    )
  )
});
const voiceManager = new VoiceManager({
  onUpdated: (event) => {
    const kind = String(event.kind || '');
    const eventType = kind === 'transcript.final' ? EventType.VOICE_TRANSCRIPT_FINAL
      : (kind === 'transcript.partial' ? EventType.VOICE_TRANSCRIPT_PARTIAL
        : (kind === 'vad.changed' ? EventType.VOICE_VAD_CHANGED
          : (kind.startsWith('tts.') ? EventType.VOICE_TTS_UPDATED : EventType.VOICE_SESSION_UPDATED)));
    const ownerId = readString(event, 'ownerId', '');
    const publicEvent = Object.assign({}, event);
    delete publicEvent.ownerId;
    sendScopedVoiceEvent(
      activeWsConnections,
      ownerId,
      makeEvent(eventType, readString(publicEvent, 'sessionId', ''), publicEvent)
    );
  }
});
const serverLogger = createTerminalLogger('bridge.server');
const wsLogger = createTerminalLogger('bridge.ws');
const requestLogger = createTerminalLogger('bridge.request');
let activeConnections = 0;
let serverShuttingDown = false;
const serverStartedAt = new Date().toISOString();
const serverStartDelayMs = Number.parseInt(process.env.AGENT_BRIDGE_START_DELAY_MS || '0', 10);
const supervisedWorker = process.env.AGENT_BRIDGE_SUPERVISED === '1' && typeof process.send === 'function';
const supervisorPid = Number.parseInt(process.env.AGENT_BRIDGE_SUPERVISOR_PID || '0', 10);
const workerGeneration = Number.parseInt(process.env.AGENT_BRIDGE_WORKER_GENERATION || '0', 10);
const daemonRemoteConfigManager = new DaemonRemoteConfigManager(daemonStore, {
  bridgeVersion: require('../package.json').version,
  instanceId: daemonStore.instanceId,
  generation: () => Number.isFinite(workerGeneration) ? workerGeneration : 0
});
let supervisorHeartbeatTimer = null;
const activeClientConnections = new Map();
const activeWsConnections = new Set();
const tlsRuntimeState = {
  enabled: false,
  active: false,
  port: 0,
  bindUrl: '',
  startedAt: '',
  lastError: ''
};
let tlsServer = null;
const WS_HEARTBEAT_INTERVAL_MS = 15000;
const WS_IDLE_TIMEOUT_MS = 45000;
const GIT_DIFF_SUBSCRIPTION_DEFAULT_MS = 5000;
const GIT_DIFF_SUBSCRIPTION_MIN_MS = 1000;
const GIT_DIFF_SUBSCRIPTION_MAX_MS = 60000;
const NONCE_REPLAY_TTL_MS = 10 * 60 * 1000;
const nonceReplayCache = new Map();
const profileRuntimeProviderIds = new Map();
const pendingMetadataRequests = new Map();
const METADATA_DEFAULT_TIMEOUT_MS = 30000;
const METADATA_MIN_TIMEOUT_MS = 1000;
const METADATA_MAX_TIMEOUT_MS = 120000;

function metadataRequestKey(connection, requestId) {
  const connectionId = connection && typeof connection.connectionId === 'string' && connection.connectionId.length > 0
    ? connection.connectionId : 'http-rpc';
  return connectionId + ':' + requestId;
}

function metadataRequestError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function metadataTimeoutForPayload(payload) {
  const requested = readNumber(payload, 'timeoutMs', METADATA_DEFAULT_TIMEOUT_MS);
  return Math.max(METADATA_MIN_TIMEOUT_MS, Math.min(METADATA_MAX_TIMEOUT_MS, Math.floor(requested)));
}

function invokeMetadataCleanup(state, reason) {
  if (!state || state.cleanupStarted === true) return;
  state.cleanupStarted = true;
  if (typeof state.cleanup !== 'function') return;
  try {
    Promise.resolve(state.cleanup(reason)).catch((error) => {
      wsLogger.warn('metadata.provider_cleanup_failed', {
        requestId: state.requestId,
        providerId: state.providerId,
        reason,
        failureCategory: error && typeof error.code === 'string' ? error.code : 'provider_cleanup_failed'
      });
    });
  } catch (error) {
    wsLogger.warn('metadata.provider_cleanup_failed', {
      requestId: state.requestId,
      providerId: state.providerId,
      reason,
      failureCategory: error && typeof error.code === 'string' ? error.code : 'provider_cleanup_failed'
    });
  }
}

function cancelPendingMetadataForConnection(connection) {
  for (const [key, state] of pendingMetadataRequests.entries()) {
    if (!state || state.connection !== connection) continue;
    state.detached = true;
    state.cancelled = true;
    invokeMetadataCleanup(state, 'connection_closed');
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (typeof state.reject === 'function') {
      state.reject(metadataRequestError('metadata_cancelled', 'Metadata generation was cancelled because the connection closed.'));
    }
    state.reject = null;
    pendingMetadataRequests.delete(key);
  }
}

function cancelMetadataRequest(connection, payload) {
  const requestId = readString(payload, 'requestId', '');
  if (requestId.length === 0) {
    return {
      ok: false,
      action: RequestType.METADATA_GENERATE_CANCEL,
      failureCategory: 'metadata_request_id_required',
      message: 'A metadata request id is required.',
      remediation: 'Cancel the active metadata request using its request id.'
    };
  }
  const key = metadataRequestKey(connection, requestId);
  const state = pendingMetadataRequests.get(key);
  if (!state || state.completed === true || state.timedOut === true) {
    return {
      ok: false,
      action: RequestType.METADATA_GENERATE_CANCEL,
      requestId,
      failureCategory: 'metadata_request_not_found',
      message: 'The metadata request is no longer active.',
      remediation: 'Refresh the metadata preview before retrying.'
    };
  }
  const requestedSessionId = readString(payload, 'sessionId', '');
  const requestedAgentId = readString(payload, 'agentId', '');
  const requestedHostProfileId = readString(payload, 'hostProfileId', '');
  if ((requestedSessionId.length > 0 && requestedSessionId !== state.sessionId) ||
      (requestedAgentId.length > 0 && requestedAgentId !== state.agentId) ||
      (requestedHostProfileId.length > 0 && requestedHostProfileId !== state.hostProfileId)) {
    return {
      ok: false,
      action: RequestType.METADATA_GENERATE_CANCEL,
      requestId,
      failureCategory: 'metadata_scope_mismatch',
      message: 'The cancel request belongs to another metadata scope.',
      remediation: 'Use the active session and Agent scope.'
    };
  }
  state.cancelled = true;
  invokeMetadataCleanup(state, 'cancelled');
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  pendingMetadataRequests.delete(key);
  if (typeof state.reject === 'function') {
    state.reject(metadataRequestError('metadata_cancelled', 'Metadata generation was cancelled.'));
  }
  state.reject = null;
  if (!state.responseSent) {
    state.responseSent = true;
    state.connection.sendJson(makeResponse(state.requestId, {
      ok: false,
      action: RequestType.METADATA_GENERATE,
      cancelled: true,
      requestId: state.requestId,
      hostProfileId: state.hostProfileId,
      sessionId: state.sessionId,
      agentId: state.agentId,
      failureCategory: 'metadata_cancelled',
      message: 'Metadata generation was cancelled.',
      remediation: 'Retry the metadata preview when the Provider is ready.',
      updatedAt: new Date().toISOString()
    }));
  }
  return {
    ok: true,
    action: RequestType.METADATA_GENERATE_CANCEL,
    requestId,
    cancelled: true,
    updatedAt: new Date().toISOString()
  };
}

managedProcessLedger.reconcile();

function hostProfileIdForConnection(connection) {
  const clientHello = connection && connection.clientHello && typeof connection.clientHello === 'object'
    ? connection.clientHello
    : {};
  const value = readString(clientHello, 'hostProfileId', '');
  return value.trim();
}

function internalAutomationConnection(connection) {
  return connection && connection.internalAutomation === true;
}

function groupConnectionsByHost(connections) {
  const groups = new Map();
  if (!connections || typeof connections[Symbol.iterator] !== 'function') {
    return groups;
  }
  for (const connection of connections) {
    if (!connection || typeof connection.sendJson !== 'function') {
      continue;
    }
    const hostProfileId = hostProfileIdForConnection(connection);
    const existing = groups.get(hostProfileId);
    if (existing) {
      existing.push(connection);
    } else {
      groups.set(hostProfileId, [connection]);
    }
  }
  return groups;
}

function notificationEventForConnection(connection, sessionId, notification) {
  if (!notification) {
    return null;
  }
  const hostProfileId = hostProfileIdForConnection(connection);
  return makeEvent(EventType.NOTIFICATION_CREATED, sessionId || '', {
    notification,
    unreadCount: notificationManager.list({ includeRead: false }, hostProfileId).unreadCount
  });
}

function sendAutomationScopedNotification(event, agent) {
  const agentWorkspaceId = agent && typeof agent.workspaceId === 'string' ? agent.workspaceId.trim() : '';
  const workspaceId = agentWorkspaceId.length > 0
    ? agentWorkspaceId
    : runtimeEventWorkspaceId(event, (agentId, sessionId) => {
      const resolvedAgent = agentId.length > 0 ? agentManager.find(agentId) :
        (sessionId.length > 0 ? agentManager.findBySessionId(sessionId) : null);
      return resolvedAgent && typeof resolvedAgent.workspaceId === 'string' ? resolvedAgent.workspaceId : '';
    });
  if (workspaceId.length === 0) {
    return 0;
  }
  const targets = [];
  for (const connection of activeWsConnections.values()) {
    const scopes = connection && connection.automationEventScopes;
    if (!scopes || !(scopes.workspaces instanceof Set) || !scopes.workspaces.has(workspaceId)) {
      continue;
    }
    targets.push(connection);
  }
  const groups = groupConnectionsByHost(targets);
  let delivered = 0;
  for (const [hostProfileId, connections] of groups.entries()) {
    const notification = notificationManager.createFromBridgeEvent(event, agent, hostProfileId);
    if (!notification) {
      continue;
    }
    for (const connection of connections) {
      try {
        const notificationEvent = notificationEventForConnection(connection, event.sessionId || '', notification);
        if (notificationEvent) {
          connection.sendJson(notificationEvent);
          delivered += 1;
        }
      } catch (_error) {
        // Connection cleanup remains authoritative.
      }
    }
    schedulePushNotification(notification);
  }
  return delivered;
}

function broadcastToClients(message) {
  if (isScopedTerminalEvent(message)) {
    broadcastScopedTerminalEvent(message);
    return;
  }
  const groups = groupConnectionsByHost(activeWsConnections);
  for (const [hostProfileId, connections] of groups.entries()) {
    const notification = notificationManager.createFromTerminalEvent(message, hostProfileId);
    for (const connection of connections) {
      try {
        connection.sendJson(message);
        const notificationEvent = notificationEventForConnection(connection, message.sessionId || '', notification);
        if (notificationEvent) {
          connection.sendJson(notificationEvent);
        }
      } catch (_error) {
        // Close handling will clean up dead connections.
      }
    }
    schedulePushNotification(notification);
  }
}

function broadcastScopedTerminalEvent(message) {
  const publicEvent = publicTerminalEvent(message);
  const targets = selectScopedTerminalConnections(activeWsConnections, message);
  if (targets.length === 0) {
    return 0;
  }
  const groups = groupConnectionsByHost(targets);
  for (const [hostProfileId, connections] of groups.entries()) {
    const notification = notificationManager.createFromTerminalEvent(publicEvent, hostProfileId);
    for (const connection of connections) {
      try {
        connection.sendJson(publicEvent);
        const notificationEvent = notificationEventForConnection(connection, publicEvent.sessionId || '', notification);
        if (notificationEvent) {
          connection.sendJson(notificationEvent);
        }
      } catch (_error) {
        // Close handling remains authoritative for dead connections.
      }
    }
    schedulePushNotification(notification);
  }
  return targets.length;
}

function invalidateAuthenticatedWebSockets(reason) {
  const connections = Array.from(activeWsConnections.values());
  if (connections.length === 0) {
    return 0;
  }
  setTimeout(() => {
    for (const connection of connections) {
      try {
        connection.sendJson(makeErrorResponse('', 'authentication_changed', 'Bridge authentication changed; reconnect with current credentials.'));
      } catch (_error) {
        // Closing the connection is the authoritative invalidation step.
      }
      connection.close();
    }
  }, 25);
  recordSecurityAudit({
    category: 'auth',
    action: 'security.connections.invalidate',
    severity: 'info',
    status: 'scheduled',
    reason: typeof reason === 'string' ? reason : 'authentication_changed',
    message: 'Scheduled ' + String(connections.length) + ' authenticated WebSocket connection(s) for reauthentication.'
  });
  return connections.length;
}

function broadcastPushStatus(result, sessionId, hostProfileId) {
  const event = makeEvent(EventType.NOTIFICATION_PUSH_UPDATED, sessionId || '', result);
  const scope = typeof hostProfileId === 'string' ? hostProfileId.trim() : '';
  for (const connection of activeWsConnections.values()) {
    if (scope.length > 0 && hostProfileIdForConnection(connection) !== scope) {
      continue;
    }
    try {
      connection.sendJson(event);
    } catch (_error) {
      // Close handling will clean up dead connections.
    }
  }
}

function schedulePushNotification(notification) {
  const hostProfileId = notification && typeof notification.hostProfileId === 'string'
    ? notification.hostProfileId.trim()
    : '';
  if (!notification || !pushNotificationManager.isConfigured() || !pushNotificationManager.hasActiveSubscriptions(hostProfileId)) {
    return;
  }
  pushNotificationManager.enqueue(notification)
    .then((result) => {
      broadcastPushStatus(result, notification.sessionId || '', hostProfileId);
    })
    .catch((error) => {
      requestLogger.error('notification.push.failed', {
        notificationId: notification.notificationId || '',
        error: error instanceof Error ? error.message : String(error)
      });
    });
}

const terminalManager = new TerminalManager({
  workspaceRegistry,
  agentManager,
  managedProcessLedger,
  daemonStore,
  broadcast: broadcastToClients
});
const serviceManager = new ServiceProxyManager({
  store: daemonStore,
  workspaceRegistry,
  agentManager,
  managedProcessLedger,
  proxyTimeoutMs: Number(process.env.AGENT_BRIDGE_SERVICE_PROXY_TIMEOUT_MS) || undefined,
  broadcast: (event) => {
    const ownerId = readString(event, 'ownerId', '');
    const publicEvent = Object.assign({}, event);
    delete publicEvent.ownerId;
    sendScopedServiceEvent(
      activeWsConnections,
      ownerId,
      makeEvent(EventType.WORKSPACE_SERVICE_UPDATED, '', publicEvent)
    );
  }
});
const serviceAccessTicketManager = new ServiceAccessTicketManager({ serviceManager });
const browserPlatformHostAdapter = createBrowserPlatformHostAdapter();
const browserAutomationManager = new BrowserAutomationManager({
  store: daemonStore,
  workspaceRegistry,
  agentManager,
  platformHostAdapter: browserPlatformHostAdapter,
  broadcast: (event) => {
    const ownerId = readString(event, 'ownerId', '');
    const publicEvent = Object.assign({}, event);
    delete publicEvent.ownerId;
    sendScopedBrowserEvent(
      activeWsConnections,
      ownerId,
      makeEvent(EventType.BROWSER_UPDATED, '', publicEvent)
    );
  },
  commandTimeoutMs: Number(process.env.AGENT_BRIDGE_BROWSER_COMMAND_TIMEOUT_MS) || undefined
});
void serviceManager.reconcile().catch((error) => {
  serverLogger.warn('workspace_service.reconcile_failed', {
    error: error instanceof Error ? error.message : String(error)
  });
});
const lifecycleCoordinator = new AgentLifecycleCoordinator({
  agentManager,
  registry,
  terminalManager,
  workspaceRegistry,
  managedProcessLedger,
  notificationManager,
  serviceManager
});
const fileTransferManager = new FileTransferManager({
  registry,
  workspaceRegistry,
  agentManager,
  broadcast: (event) => {
    const ownerId = readString(event, 'ownerId', '');
    const publicEvent = Object.assign({}, event);
    delete publicEvent.ownerId;
    sendScopedFileTransferEvent(
      activeWsConnections,
      ownerId,
      makeEvent(readString(publicEvent, 'event', ''), readString(publicEvent, 'sessionId', ''), publicEvent.payload)
    );
  }
});
const providerDirectoryManager = new ProviderDirectoryManager({
  bridgeVersion: config.version,
  platform: process.platform,
  homeDirectory: daemonStore.baseDirectory,
  upsertProfile: (payload) => upsertProviderProfile(payload),
  deleteProfile: (payload) => deleteProviderProfile(payload),
  testProfile: (payload) => testProviderProfile(payload),
  getProfile: (profileId) => findProviderProfileById(profileId)
});
registerProviderProfilesFromStore();
void providerDirectoryManager.reconcile().catch((error) => {
  serverLogger.warn('provider_directory.reconcile_failed', {
    error: error instanceof Error ? error.message : String(error)
  });
});

function buildFeatureFlags() {
  const terminalAvailable = terminalManager.isAvailable();
  const fileTransferAvailable = fileTransferManager.isAvailable();
  const interactiveProviderSessions = registry.hasInteractiveSessions();
  const voiceStatus = voiceManager.status();
  const voiceCapabilities = voiceStatus && voiceStatus.capabilities && typeof voiceStatus.capabilities === 'object'
    ? voiceStatus.capabilities : {};
  return {
    protocolV2: true,
    deviceIdentity: true,
    trustedCacheNamespace: true,
    serverInfo: true,
    providerCatalog: true,
    agentLifecycle: true,
    authoritativeTimeline: true,
    projectWorkspaceRegistry: true,
    workspaceFiles: true,
    managedProcessLedger: true,
    terminalBinaryFrames: terminalAvailable,
    terminalActivity: terminalAvailable,
    terminalMouse: terminalAvailable,
    fileTransferBinaryFrames: fileTransferAvailable,
    interactiveProviderSessions,
    interactiveCliSessions: interactiveProviderSessions,
    agentRelationships: true,
    checkpoints: true,
    fileCheckpoints: fileCheckpointStore.isAvailable(),
    terminalHooks: terminalAvailable && terminalManager.supportsHooks(),
    terminalCapturePersistence: terminalAvailable && terminalManager.hasCapturePersistence(),
    terminalSnapshotBackpressure: terminalAvailable && terminalManager.hasSnapshotBackpressure(),
    terminalSequencedRestore: terminalAvailable,
    dynamicProviderDiscovery: true,
    providerProfiles: true,
    providerSecretStorage: providerProfileService.secretStoreStatus().available,
    acpProviders: true,
    remoteProviderDirectory: providerDirectoryManager.isAvailable(),
    gitAdvanced: true,
    gitOperationPlans: true,
    gitDiffSubscriptions: true,
    githubIntegration: true,
    githubOAuth: true,
    githubPrWorkflow: true,
    githubWatch: true,
    githubAssetUpload: typeof process.env.AGENT_BRIDGE_GITHUB_ASSET_UPLOAD_URL === 'string' && process.env.AGENT_BRIDGE_GITHUB_ASSET_UPLOAD_URL.startsWith('https://'),
    largeDiffPagination: true,
    remoteDaemonConfig: true,
    daemonInstanceIdentity: true,
    daemonFleetOrchestration: false,
    daemonFleetTarget: true,
    richContentAst: true,
    messageQueue: true,
    usageEvents: registry.hasUsageEvents(),
    usageBudgets: true,
    providerUsage: providerUsageService.anyAvailable(),
    metadataGeneration: registry.hasMetadataGeneration(),
    diagnosticsExport: true,
    adaptiveWorkbench: true,
    commandPalette: true,
    sessionWindows: true,
    serviceProxy: true,
    workspaceServices: true,
    worktrees: true,
    mcpHost: mcpHost.isAvailable(),
    offlineNotifications: notificationManager.isAvailable(),
    pushKitSubscriptions: pushNotificationManager.isAvailable(),
    pushKitDelivery: pushNotificationManager.isConfigured(),
    daemonManagement: true,
    daemonSupervisor: true,
    daemonAutostartInstaller: autostartManager.plan({ method: 'auto' }).supported,
    daemonSelfUpdate: config.containerMode !== true && daemonUpdateManager.isAvailable(),
    securityDeviceTrust: true,
    securityAudit: securityAudit.isAvailable(),
    tlsListener: tlsRuntimeState.active === true,
    schedules: scheduleManager.isAvailable(),
    loops: loopManager.isAvailable(),
    chat: chatRoomManager.isAvailable(),
    chatRooms: chatRoomManager.isAvailable(),
    relay: relayManager.isAvailable(),
    relayE2E: relayManager.isAvailable(),
    relayDeviceManagement: relayManager.isAvailable(),
    voice: voiceManager.isAvailable(),
    voiceAudioCapture: voiceCapabilities.audioCapture === true,
    voiceAudioPlayback: voiceCapabilities.audioPlayback === true,
    voiceSpeechToText: voiceCapabilities.speechToText === true,
    voiceTextToSpeech: voiceCapabilities.textToSpeech === true,
    voiceRemoteSpeechToText: voiceCapabilities.remoteSpeechToText === true,
    voiceRemoteTextToSpeech: voiceCapabilities.remoteTextToSpeech === true,
    // New clients may trust the two remote Voice flags independently. Older
    // clients keep using the legacy aggregate `voice` capability.
    voiceCapabilityMatrix: true,
    voicePrivacyStatus: true,
    voiceActivityEvents: voiceCapabilities.voiceActivityEvents === true,
    voiceInterruptionHandling: voiceCapabilities.interruptionHandling === true,
    browserAutomation: true,
    browserHostCapabilityMetadata: true,
    browserPlatformHost: browserPlatformHostAdapter.isAvailable()
  };
}

const UNSUPPORTED_REQUEST_TYPES = new Set([]);

function recordSecurityAudit(event) {
  return securityAudit.record(event);
}

function recordBrowserAutomationAudit(connection, requestType, payload, result) {
  recordSecurityAudit({
    category: 'browser_automation',
    action: requestType,
    severity: result && result.ok === false ? 'warning' : 'info',
    status: result && result.ok === false ? 'rejected' : 'accepted',
    reason: result && typeof result.failureCategory === 'string' && result.failureCategory.length > 0
      ? result.failureCategory
      : 'browser_request_completed',
    message: result && typeof result.message === 'string' && result.message.length > 0
      ? result.message
      : 'Browser automation request completed.',
    remoteAddress: connection && typeof connection.remoteAddress === 'string' ? connection.remoteAddress : '',
    workspaceId: readString(payload, 'workspaceId', ''),
    agentId: readString(payload, 'agentId', ''),
    hostId: readString(payload, 'hostId', ''),
    pageId: readString(payload, 'pageId', '')
  });
}

function sendUnsupportedResponse(connection, id, requestType) {
  connection.sendJson(makeErrorResponse(
    id,
    'UNSUPPORTED',
    'Request type is declared in Bridge V2 but is not implemented in this build: ' + requestType
  ));
}

// Public daemon DTOs intentionally expose stable markers instead of the Bridge
// home path. The real paths remain available to internal file readers and
// lifecycle managers, but are never sent over RPC.
const PUBLIC_DAEMON_CONFIG_PATH = '.agent-bridge/config.json';
const PUBLIC_DAEMON_LOG_PATH = '.agent-bridge/logs/daemon.log';
const PUBLIC_DAEMON_UPDATE_STATE_PATH = '.agent-bridge/runtime/update-state.json';
const PUBLIC_DAEMON_UPDATE_STAGED_PATH = '.agent-bridge/runtime/update-staged';
const PUBLIC_DAEMON_UPDATE_BACKUP_PATH = '.agent-bridge/runtime/update-backups';

function publicIdentifier(value, fallback) {
  const source = typeof value === 'string' ? value : '';
  if (source.length === 0) {
    return fallback || '';
  }
  const normalized = source.replace(/[^a-zA-Z0-9._:-]/g, '_');
  if (normalized.length === 0) {
    return fallback || '';
  }
  return normalized.length > 120 ? normalized.substring(0, 96) : normalized;
}

function publicManagedProcessRecords() {
  return managedProcessLedger.list().map((record) => {
    const identity = record && record.identity && typeof record.identity === 'object' && !Array.isArray(record.identity)
      ? record.identity
      : {};
    let ownerType = 'runtime';
    let ownerId = '';
    if (typeof identity.serviceId === 'string' && identity.serviceId.length > 0) {
      ownerType = 'service';
      ownerId = identity.serviceId;
    } else if (typeof identity.terminalId === 'string' && identity.terminalId.length > 0) {
      ownerType = 'terminal';
      ownerId = identity.terminalId;
    } else if (typeof identity.agentId === 'string' && identity.agentId.length > 0) {
      ownerType = 'agent';
      ownerId = identity.agentId;
    } else if (typeof identity.runtimeOwnerId === 'string' && identity.runtimeOwnerId.length > 0) {
      ownerType = 'runtime-owner';
      ownerId = identity.runtimeOwnerId;
    } else if (typeof identity.role === 'string' && identity.role.length > 0) {
      ownerType = identity.role;
      ownerId = identity.role;
    }
    return {
      id: publicIdentifier(record && record.id, 'managed-process'),
      providerId: publicIdentifier(record && record.providerId, ''),
      kind: publicIdentifier(record && record.kind, 'provider-helper'),
      pid: record && typeof record.pid === 'number' && record.pid > 0 ? Math.floor(record.pid) : 0,
      alive: record && typeof record.pid === 'number' ? processIsAlive(record.pid) : false,
      owner: {
        type: publicIdentifier(ownerType, 'runtime'),
        id: publicIdentifier(ownerId, '')
      },
      createdAt: record && typeof record.createdAt === 'string' ? record.createdAt : '',
      updatedAt: record && typeof record.updatedAt === 'string' ? record.updatedAt : ''
    };
  });
}

function sanitizeDaemonUpdateObject(value, depth) {
  const level = typeof depth === 'number' && depth >= 0 ? depth : 0;
  if (Array.isArray(value)) {
    return level > 2 ? [] : value.map((item) => sanitizeDaemonUpdateObject(item, level + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (level > 2) {
    return {};
  }
  const result = {};
  for (const key of Object.keys(value)) {
    if (/(?:path|cwd|command|args|environment|env)$/i.test(key) ||
      /(?:token|password|credential|secret|privatekey)/i.test(key)) {
      continue;
    }
    result[key] = sanitizeDaemonUpdateObject(value[key], level + 1);
  }
  return result;
}

function publicDaemonUpdateStatus() {
  const source = daemonUpdateManager.status();
  const sourceUpdate = source && source.update && typeof source.update === 'object' && !Array.isArray(source.update)
    ? source.update
    : {};
  const result = sanitizeDaemonUpdateObject(source, 0);
  result.developmentRoot = typeof source.developmentRoot === 'string' && source.developmentRoot.length > 0
    ? '.agent-bridge/development'
    : '';
  result.statePath = PUBLIC_DAEMON_UPDATE_STATE_PATH;
  result.stagedPath = typeof source.stagedPath === 'string' && source.stagedPath.length > 0
    ? PUBLIC_DAEMON_UPDATE_STAGED_PATH
    : (typeof sourceUpdate.stagedPath === 'string' && sourceUpdate.stagedPath.length > 0 ? PUBLIC_DAEMON_UPDATE_STAGED_PATH : '');
  result.backupPath = typeof source.backupPath === 'string' && source.backupPath.length > 0
    ? PUBLIC_DAEMON_UPDATE_BACKUP_PATH
    : (typeof sourceUpdate.backupPath === 'string' && sourceUpdate.backupPath.length > 0 ? PUBLIC_DAEMON_UPDATE_BACKUP_PATH : '');
  result.update = sanitizeDaemonUpdateObject(sourceUpdate, 0);
  return result;
}

function readDaemonLogTail(maxBytes) {
  const logPath = daemonStore.paths.daemonLog;
  const limit = typeof maxBytes === 'number' && Number.isFinite(maxBytes) && maxBytes > 0 ? Math.min(Math.floor(maxBytes), 1024 * 1024) : 64 * 1024;
  if (!fs.existsSync(logPath)) {
    return {
      logPath: PUBLIC_DAEMON_LOG_PATH,
      path: PUBLIC_DAEMON_LOG_PATH,
      text: '',
      truncated: false,
      sizeBytes: 0,
      warnings: [
        {
          code: 'daemon_log_missing',
          message: 'Daemon log file does not exist yet.'
        }
      ],
      updatedAt: Date.now()
    };
  }
  try {
    const stat = fs.statSync(logPath);
    const start = stat.size > limit ? stat.size - limit : 0;
    const fd = fs.openSync(logPath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return {
        logPath: PUBLIC_DAEMON_LOG_PATH,
        path: PUBLIC_DAEMON_LOG_PATH,
        text: buffer.toString('utf8'),
        truncated: start > 0,
        sizeBytes: stat.size,
        warnings: [],
        updatedAt: Date.now()
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return {
      logPath: PUBLIC_DAEMON_LOG_PATH,
      path: PUBLIC_DAEMON_LOG_PATH,
      text: '',
      truncated: false,
      sizeBytes: 0,
      warnings: [
        {
          code: 'daemon_log_read_failed',
          message: 'Daemon log could not be read.'
        }
      ],
      updatedAt: Date.now()
    };
  }
}

function buildDaemonHealthPayload(action) {
  const now = new Date().toISOString();
  const supervisorState = daemonStore.readDaemonSupervisorState();
  const supervisorRunning = supervisorState && supervisorState.supervised === true &&
    typeof supervisorState.supervisorPid === 'number' &&
    supervisorState.supervisorPid > 0 &&
    processIsAlive(supervisorState.supervisorPid);
  const resolvedSupervisorPid = supervisorRunning ? supervisorState.supervisorPid : (supervisedWorker ? supervisorPid : 0);
  const resolvedRestartCount = supervisorState && typeof supervisorState.restartCount === 'number'
    ? supervisorState.restartCount
    : 0;
  const doctor = buildDaemonDoctorReport(daemonStore, {
    nonceReplayCache,
    securityAuditSummary: securityAudit.summary(),
    tlsRuntimeState,
    providerSecretStorage: providerProfileService.secretStoreStatus()
  });
  return {
    ok: true,
    action: action || 'daemon.health',
    status: serverShuttingDown ? 'stopping' : 'running',
    health: serverShuttingDown ? 'stale' : 'running',
    instanceHealth: serverShuttingDown ? 'degraded' : 'healthy',
    instanceId: daemonStore.instanceId,
    pid: resolvedSupervisorPid > 0 ? resolvedSupervisorPid : process.pid,
    supervisorPid: resolvedSupervisorPid,
    workerPid: process.pid,
    supervised: supervisedWorker,
    workerGeneration: Number.isFinite(workerGeneration) ? workerGeneration : 0,
    generation: Number.isFinite(workerGeneration) ? workerGeneration : 0,
    workerReady: true,
    startedAt: supervisorState && typeof supervisorState.startedAt === 'string' ? supervisorState.startedAt : serverStartedAt,
    workerStartedAt: serverStartedAt,
    workerReadyAt: supervisorState && typeof supervisorState.workerReadyAt === 'string' ? supervisorState.workerReadyAt : serverStartedAt,
    lastHeartbeatAt: supervisorState && typeof supervisorState.lastHeartbeatAt === 'string' ? supervisorState.lastHeartbeatAt : now,
    lastWorkerHeartbeatAt: supervisorState && typeof supervisorState.lastWorkerHeartbeatAt === 'string' ? supervisorState.lastWorkerHeartbeatAt : now,
    uptimeSec: Math.floor(process.uptime()),
    exitCode: 0,
    lastError: '',
    restartCount: resolvedRestartCount,
    consecutiveCrashes: supervisorState && typeof supervisorState.consecutiveCrashes === 'number' ? supervisorState.consecutiveCrashes : 0,
    crashWindowCount: supervisorState && typeof supervisorState.crashWindowCount === 'number' ? supervisorState.crashWindowCount : 0,
    crashLoop: supervisorState ? supervisorState.crashLoop === true : false,
    nextRestartAt: supervisorState && typeof supervisorState.nextRestartAt === 'string' ? supervisorState.nextRestartAt : '',
    lastRestartReason: supervisorState && typeof supervisorState.lastRestartReason === 'string' ? supervisorState.lastRestartReason : '',
    logPath: PUBLIC_DAEMON_LOG_PATH,
    configPath: PUBLIC_DAEMON_CONFIG_PATH,
    update: publicDaemonUpdateStatus(),
    remoteConfig: daemonRemoteConfigManager.status(),
    bridgeVersion: require('../package.json').version,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    warnings: [],
    failureCategory: '',
    remediation: '',
    tls: tlsStatus(daemonStore, tlsRuntimeState),
    managedProcesses: publicManagedProcessRecords(),
    checks: doctor.checks,
    doctor
  };
}

function buildDaemonStatusPayload(payload) {
  const health = buildDaemonHealthPayload('daemon.status');
  return {
    ok: true,
    action: 'daemon.status',
    status: health.status,
    health: health.health,
    instanceHealth: health.instanceHealth,
    instanceId: daemonStore.instanceId,
    hostProfileId: payload && typeof payload.hostProfileId === 'string' ? payload.hostProfileId : '',
    generation: health.generation,
    bridgeVersion: health.bridgeVersion,
    nodeVersion: health.nodeVersion,
    platform: health.platform,
    architecture: health.architecture,
    remoteConfig: health.remoteConfig,
    pid: health.pid,
    supervisorPid: health.supervisorPid,
    workerPid: health.workerPid,
    supervised: health.supervised,
    workerGeneration: health.workerGeneration,
    workerReady: health.workerReady,
    startedAt: health.startedAt,
    lastHeartbeatAt: health.lastHeartbeatAt,
    exitCode: health.exitCode,
    lastError: health.lastError,
    restartCount: health.restartCount,
    consecutiveCrashes: health.consecutiveCrashes,
    crashWindowCount: health.crashWindowCount,
    crashLoop: health.crashLoop,
    nextRestartAt: health.nextRestartAt,
    lastRestartReason: health.lastRestartReason,
    serverId: daemonStore.serverId,
    uptimeSec: Math.floor(process.uptime()),
    activeConnections,
    activeWebSocketConnections: activeWsConnections.size,
    managedProcesses: publicManagedProcessRecords(),
    features: buildFeatureFlags(),
    tls: tlsStatus(daemonStore, tlsRuntimeState),
    autostart: daemonStore.config.daemon.autostart,
    configPath: PUBLIC_DAEMON_CONFIG_PATH,
    logPath: PUBLIC_DAEMON_LOG_PATH,
    update: publicDaemonUpdateStatus(),
    doctor: buildDaemonDoctorReport(daemonStore, {
      nonceReplayCache,
      securityAuditSummary: securityAudit.summary(),
      tlsRuntimeState,
      providerSecretStorage: providerProfileService.secretStoreStatus()
    })
  };
}

function validateDaemonLifecycleTarget(action, payload, connection) {
  const source = Object.assign({}, payload && typeof payload === 'object' ? payload : {}, { action });
  const clientHello = connection && connection.clientHello && typeof connection.clientHello === 'object'
    ? connection.clientHello : {};
  return validateDaemonTarget(
    source,
    {
      instanceId: daemonStore.instanceId,
      generation: Number.isFinite(workerGeneration) ? workerGeneration : 0
    },
    readString(clientHello, 'hostProfileId', '')
  );
}

function buildDaemonLifecycleResult(action, status, extra) {
  const detail = extra && typeof extra === 'object' ? extra : {};
  return Object.assign(buildDaemonHealthPayload(action), {
    status,
    health: status === 'stopping' ? 'stale' : status,
    scheduled: detail.scheduled === true,
    alreadyRunning: detail.alreadyRunning === true,
    replacementStarted: detail.replacementStarted === true,
    replacementPid: typeof detail.replacementPid === 'number' ? detail.replacementPid : 0,
    message: typeof detail.message === 'string' ? detail.message : ''
  });
}

function launchDetachedBridgeReplacement(delayMs) {
  const env = Object.assign({}, process.env, {
    AGENT_BRIDGE_START_DELAY_MS: String(delayMs > 0 ? delayMs : 1000)
  });
  const child = spawn(process.execPath, [path.join(__dirname, 'supervisor-entrypoint.js')], {
    cwd: process.cwd(),
    env,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return child.pid || 0;
}

function installedSupervisorPaths(result) {
  const packagePath = result && typeof result.installedPackagePath === 'string'
    ? path.resolve(result.installedPackagePath)
    : '';
  if (packagePath.length === 0) {
    return null;
  }
  const supervisorEntry = path.join(packagePath, 'src', 'supervisor-entrypoint.js');
  const workerEntry = path.join(packagePath, 'src', 'server.js');
  if (!fs.existsSync(supervisorEntry) || !fs.existsSync(workerEntry)) {
    return null;
  }
  return { supervisorEntry, workerEntry };
}

function scheduleInstalledSupervisorReplacement(result, reason) {
  const entries = installedSupervisorPaths(result);
  if (!entries) {
    return {
      replacementScheduled: false,
      replacementMode: '',
      replacementPid: 0,
      replacementError: 'Installed package does not contain the supervisor entrypoint.'
    };
  }
  if (supervisedWorker) {
    setTimeout(() => {
      sendSupervisorMessage({
        type: 'ngf:replace',
        reason,
        supervisorEntry: entries.supervisorEntry,
        workerEntry: entries.workerEntry,
        startDelayMs: 750,
        lockWaitMs: 20000
      });
    }, 250);
    return {
      replacementScheduled: true,
      replacementMode: 'supervisor_ipc',
      replacementPid: 0,
      replacementError: ''
    };
  }
  let replacementPid = 0;
  try {
    const env = Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: daemonStore.baseDirectory,
      AGENT_BRIDGE_START_DELAY_MS: '1000',
      AGENT_BRIDGE_LOCK_WAIT_MS: '20000',
      AGENT_BRIDGE_SUPERVISOR_WORKER_ENTRY: entries.workerEntry
    });
    delete env.AGENT_BRIDGE_SUPERVISED;
    delete env.AGENT_BRIDGE_SUPERVISOR_PID;
    delete env.AGENT_BRIDGE_WORKER_GENERATION;
    const child = spawn(process.execPath, [entries.supervisorEntry], {
      cwd: path.dirname(entries.workerEntry),
      env,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    replacementPid = child.pid || 0;
  } catch (error) {
    return {
      replacementScheduled: false,
      replacementMode: 'detached',
      replacementPid: 0,
      replacementError: error instanceof Error ? error.message : String(error)
    };
  }
  if (replacementPid > 0) {
    scheduleDaemonShutdown(reason, 250);
  }
  return {
    replacementScheduled: replacementPid > 0,
    replacementMode: 'detached',
    replacementPid,
    replacementError: replacementPid > 0 ? '' : 'Replacement supervisor pid is unavailable.'
  };
}

function sendSupervisorMessage(message) {
  if (!supervisedWorker || typeof process.send !== 'function') {
    return false;
  }
  try {
    process.send(message);
    return true;
  } catch (error) {
    serverLogger.warn('supervisor.message_failed', {
      type: message && typeof message.type === 'string' ? message.type : '',
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function startSupervisorHeartbeat() {
  if (!supervisedWorker || supervisorHeartbeatTimer) {
    return;
  }
  supervisorHeartbeatTimer = setInterval(() => {
    sendSupervisorMessage({
      type: 'ngf:worker-heartbeat',
      timestamp: Date.now()
    });
  }, 1000);
  if (typeof supervisorHeartbeatTimer.unref === 'function') {
    supervisorHeartbeatTimer.unref();
  }
}

function stopSupervisorHeartbeat() {
  if (supervisorHeartbeatTimer) {
    clearInterval(supervisorHeartbeatTimer);
    supervisorHeartbeatTimer = null;
  }
}

function scheduleDaemonShutdown(reason, delayMs) {
  setTimeout(() => {
    if (supervisedWorker && sendSupervisorMessage({ type: 'ngf:shutdown', reason })) {
      return;
    }
    requestServerShutdown(reason);
  }, delayMs > 0 ? delayMs : 80);
}

function setDaemonAutostart(payload) {
  return autostartManager.setPreference(payload);
}

function deviceKeyFromPayload(payload) {
  const device = readObjectValue(payload, 'device');
  const source = Object.keys(device).length > 0 ? device : payload;
  const physicalDeviceId = readString(source, 'physicalDeviceId', readString(source, 'deviceId', ''));
  const bridgeInstanceId = readString(source, 'bridgeInstanceId', '');
  const fingerprint = readString(source, 'publicKeyFingerprint', readString(source, 'keyFingerprint', ''));
  const key = physicalDeviceId.length > 0 ? physicalDeviceId : fingerprint;
  return {
    source,
    key,
    physicalDeviceId,
    bridgeInstanceId,
    fingerprint
  };
}

function listSecurityDevices() {
  return {
    currentDevice: config.deviceIdentity,
    devices: daemonStore.readTrustedDevices(),
    storePath: daemonStore.paths.trustedDevices,
    trustScope: 'management_audit',
    transportAuthentication: 'bridge_credential',
    clientProofRequired: false,
    message: 'Trusted device records are management and audit metadata; they do not replace Bridge credential authentication.'
  };
}

function trustSecurityDevice(payload) {
  const parsed = deviceKeyFromPayload(payload);
  if (parsed.key.length === 0) {
    return {
      code: 'security_device_invalid',
      message: 'A physicalDeviceId or publicKeyFingerprint is required.'
    };
  }
  const now = new Date().toISOString();
  const devices = daemonStore.readTrustedDevices();
  let saved = null;
  for (const device of devices) {
    if (!device) {
      continue;
    }
    const samePhysical = parsed.physicalDeviceId.length > 0 && device.physicalDeviceId === parsed.physicalDeviceId;
    const sameFingerprint = parsed.fingerprint.length > 0 && device.publicKeyFingerprint === parsed.fingerprint;
    if (samePhysical || sameFingerprint) {
      device.displayName = readString(parsed.source, 'displayName', readString(device, 'displayName', 'Trusted device'));
      device.platform = readString(parsed.source, 'platform', readString(device, 'platform', ''));
      device.bridgeInstanceId = parsed.bridgeInstanceId.length > 0 ? parsed.bridgeInstanceId : readString(device, 'bridgeInstanceId', '');
      device.publicKeyFingerprint = parsed.fingerprint.length > 0 ? parsed.fingerprint : readString(device, 'publicKeyFingerprint', '');
      device.trusted = true;
      device.trustedAt = readString(device, 'trustedAt', now);
      device.revokedAt = '';
      device.updatedAt = now;
      saved = device;
      break;
    }
  }
  if (!saved) {
    saved = {
      physicalDeviceId: parsed.physicalDeviceId,
      bridgeInstanceId: parsed.bridgeInstanceId,
      displayName: readString(parsed.source, 'displayName', 'Trusted device'),
      platform: readString(parsed.source, 'platform', ''),
      publicKeyFingerprint: parsed.fingerprint,
      trusted: true,
      trustedAt: now,
      revokedAt: '',
      updatedAt: now
    };
    devices.push(saved);
  }
  daemonStore.writeTrustedDevices(devices);
  return {
    device: saved,
    devices,
    trustScope: 'management_audit',
    transportAuthentication: 'bridge_credential'
  };
}

function revokeSecurityDevice(payload) {
  const parsed = deviceKeyFromPayload(payload);
  if (parsed.key.length === 0) {
    return {
      code: 'security_device_invalid',
      message: 'A physicalDeviceId or publicKeyFingerprint is required.'
    };
  }
  const now = new Date().toISOString();
  const devices = daemonStore.readTrustedDevices();
  let revoked = null;
  for (const device of devices) {
    if (!device) {
      continue;
    }
    const samePhysical = parsed.physicalDeviceId.length > 0 && device.physicalDeviceId === parsed.physicalDeviceId;
    const sameFingerprint = parsed.fingerprint.length > 0 && device.publicKeyFingerprint === parsed.fingerprint;
    if (samePhysical || sameFingerprint) {
      device.trusted = false;
      device.revokedAt = now;
      device.updatedAt = now;
      revoked = device;
      break;
    }
  }
  daemonStore.writeTrustedDevices(devices);
  return {
    revoked: revoked !== null,
    device: revoked,
    devices,
    trustScope: 'management_audit',
    transportAuthentication: 'bridge_credential'
  };
}

function readBooleanValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readObjectValue(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function readArrayValue(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function readStringArrayValue(source, key) {
  const values = readArrayValue(source, key);
  return values.filter((item) => typeof item === 'string' && item.length > 0);
}

function safeReadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function safeSegment(value) {
  const source = typeof value === 'string' && value.length > 0 ? value : 'unknown';
  const normalized = source.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized.substring(0, 120) : 'unknown';
}

function acpCatalogCandidateFiles(payload) {
  const candidates = [];
  const explicitFiles = [
    readString(payload, 'catalogPath', ''),
    readString(payload, 'filePath', ''),
    readString(payload, 'path', '')
  ];
  for (const filePath of explicitFiles) {
    if (filePath.length > 0) {
      candidates.push(path.resolve(filePath));
    }
  }
  const directories = readStringArrayValue(payload, 'directories');
  const directory = readString(payload, 'directory', readString(payload, 'cwd', ''));
  if (directory.length > 0) {
    directories.push(directory);
  }
  const knownNames = [
    'acp-providers.json',
    'agent-bridge-acp.json',
    'providers.acp.json',
    'provider.json'
  ];
  for (const item of directories) {
    const directoryPath = path.resolve(item);
    for (const name of knownNames) {
      candidates.push(path.join(directoryPath, name));
    }
    candidates.push(path.join(directoryPath, '.acp', 'providers.json'));
  }
  const unique = [];
  for (const item of candidates) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique;
}

function providersFromAcpCatalog(catalog, sourcePath) {
  if (Array.isArray(catalog)) {
    return catalog.map((item) => normalizeAcpProviderProfile(item, sourcePath)).filter(Boolean);
  }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return [];
  }
  if (Array.isArray(catalog.providers)) {
    return catalog.providers.map((item) => normalizeAcpProviderProfile(item, sourcePath)).filter(Boolean);
  }
  if (catalog.provider && typeof catalog.provider === 'object' && !Array.isArray(catalog.provider)) {
    return [normalizeAcpProviderProfile(catalog.provider, sourcePath)].filter(Boolean);
  }
  return [normalizeAcpProviderProfile(catalog, sourcePath)].filter(Boolean);
}

function normalizeAcpProviderProfile(source, sourcePath) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const rawId = readString(source, 'profileId', readString(source, 'id', readString(source, 'name', '')));
  const profileId = readString(source, 'profileId', rawId.length > 0 ? 'acp_' + safeSegment(rawId) : 'acp_' + crypto.randomBytes(8).toString('base64url'));
  const providerId = readString(source, 'providerId', rawId.length > 0 ? rawId : profileId);
  const displayName = readString(source, 'displayName', readString(source, 'name', providerId));
  const argsValue = source.args;
  const args = typeof argsValue === 'string' ? argsValue : (Array.isArray(argsValue) ? argsValue.filter((item) => typeof item === 'string').join(' ') : '');
  const endpoint = readString(source, 'endpoint', readString(source, 'baseUrl', readString(source, 'url', '')));
  const binary = readString(source, 'binary', readString(source, 'command', ''));
  const rawRuntimeMode = readString(source, 'runtimeMode', 'oneshot');
  const validationMessages = [];
  if (profileId.length === 0 || providerId.length === 0) {
    validationMessages.push('missing_provider_id');
  }
  if (endpoint.length === 0 && binary.length === 0) {
    validationMessages.push('missing_endpoint_or_binary');
  }
  if (rawRuntimeMode.length > 0 && rawRuntimeMode !== 'oneshot' && rawRuntimeMode !== 'stdio') {
    validationMessages.push('invalid_runtime_mode');
  }
  if (Object.keys(source).includes('env')) {
    const envValue = source.env;
    if (!envValue || typeof envValue !== 'object' || Array.isArray(envValue)) {
      validationMessages.push('invalid_env');
    }
  }
  return {
    profileId,
    providerId,
    displayName,
    description: readString(source, 'description', ''),
    endpoint,
    binary,
    args,
    cwd: readString(source, 'cwd', ''),
    runtimeMode: rawRuntimeMode === 'stdio' ? 'stdio' : 'oneshot',
    env: readObjectValue(source, 'env'),
    enabled: readBooleanValue(source, 'enabled', true),
    validationMessages,
    kind: 'acp',
    sourcePath,
    acp: {
      protocol: readString(source, 'protocol', 'acp'),
      catalogPath: sourcePath,
      extends: readString(source, 'extends', 'acp')
    }
  };
}

function providerProfileValidationEntry(profile, reason) {
  return {
    profileId: readString(profile, 'profileId', ''),
    providerId: readString(profile, 'providerId', ''),
    displayName: readString(profile, 'displayName', ''),
    sourcePath: readString(profile, 'sourcePath', ''),
    reason
  };
}

function buildAcpValidationReport(providers, scanned, rejected, scanWarnings) {
  const existingIds = new Set();
  for (const profile of daemonStore.readProviderProfiles()) {
    if (profile && typeof profile.profileId === 'string' && profile.profileId.length > 0) {
      existingIds.add(profile.profileId);
    }
  }
  const seenIds = new Set();
  const accepted = [];
  const duplicates = [];
  const warnings = Array.isArray(scanWarnings) ? scanWarnings.slice() : [];
  const errors = [];
  for (const profile of providers) {
    const profileId = readString(profile, 'profileId', '');
    const validationMessages = readStringArrayValue(profile, 'validationMessages');
    if (validationMessages.length > 0) {
      for (const reason of validationMessages) {
        rejected.push(providerProfileValidationEntry(profile, reason));
        errors.push(profileId + ': ' + reason);
      }
      continue;
    }
    if (seenIds.has(profileId) || existingIds.has(profileId)) {
      const duplicate = providerProfileValidationEntry(profile, seenIds.has(profileId) ? 'duplicate_in_catalog' : 'duplicate_existing_profile');
      duplicates.push(duplicate);
      warnings.push(duplicate);
    }
    seenIds.add(profileId);
    accepted.push(providerProfileValidationEntry(profile, 'accepted'));
  }
  return {
    ok: rejected.length === 0,
    scanned,
    accepted,
    rejected,
    duplicates,
    invalid: rejected,
    warnings,
    errors,
    providerCount: providers.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    duplicateCount: duplicates.length,
    warningCount: warnings.length,
    errorCount: errors.length
  };
}

function discoverAcpProvidersRaw(payload) {
  const providers = [];
  const allProviders = [];
  const scanned = [];
  const rejected = [];
  const warnings = [];
  const inlineProviders = readArrayValue(payload, 'providers');
  for (const item of inlineProviders) {
    const profile = normalizeAcpProviderProfile(item, 'inline');
    if (profile) {
      allProviders.push(profile);
    } else {
      rejected.push({
        sourcePath: 'inline',
        reason: 'invalid_provider'
      });
    }
  }
  const inlineProfile = readObjectValue(payload, 'profile');
  if (Object.keys(inlineProfile).length > 0) {
    const profile = normalizeAcpProviderProfile(inlineProfile, 'inline');
    if (profile) {
      allProviders.push(profile);
    } else {
      rejected.push({
        sourcePath: 'inline',
        reason: 'invalid_profile'
      });
    }
  }
  for (const filePath of acpCatalogCandidateFiles(payload)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      continue;
    }
    const catalog = safeReadJsonFile(filePath);
    scanned.push(filePath);
    if (!catalog) {
      rejected.push({
        sourcePath: filePath,
        reason: 'invalid_json'
      });
      continue;
    }
    const fileProviders = providersFromAcpCatalog(catalog, filePath);
    if (fileProviders.length === 0) {
      warnings.push({
        sourcePath: filePath,
        reason: 'no_providers'
      });
    }
    for (const profile of fileProviders) {
      allProviders.push(profile);
    }
  }
  const validationReport = buildAcpValidationReport(allProviders, scanned, rejected, warnings);
  const rejectedIds = new Set();
  for (const item of validationReport.rejected) {
    const profileId = readString(item, 'profileId', '');
    if (profileId.length > 0) {
      rejectedIds.add(profileId);
    }
  }
  for (const profile of allProviders) {
    if (!rejectedIds.has(readString(profile, 'profileId', ''))) {
      providers.push(profile);
    }
  }
  return {
    providers,
    allProviders,
    scanned,
    validationReport,
    updatedAt: Date.now()
  };
}

function publicAcpDiscovery(discovery) {
  const source = discovery && typeof discovery === 'object' && !Array.isArray(discovery) ? discovery : {};
  const decorate = (profile) => decorateProviderProfileRuntime(profile, buildProviderProfileRuntime(profile));
  return {
    providers: Array.isArray(source.providers) ? source.providers.map(decorate) : [],
    allProviders: Array.isArray(source.allProviders) ? source.allProviders.map(decorate) : [],
    scanned: Array.isArray(source.scanned) ? source.scanned.slice() : [],
    validationReport: source.validationReport && typeof source.validationReport === 'object' ? source.validationReport : {},
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now()
  };
}

function discoverAcpProviders(payload) {
  return publicAcpDiscovery(discoverAcpProvidersRaw(payload));
}

function splitCommandArgs(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (escaped) {
      current = current + char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote.length > 0) {
      if (char === quote) {
        quote = '';
      } else {
        current = current + char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current = current + char;
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function normalizeProfileEnv(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === 'string') {
      result[key] = item;
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      result[key] = String(item);
    }
  }
  return result;
}

function runtimeProviderIdForProfile(profile) {
  return 'profile.' + safeSegment(readString(profile, 'profileId', readString(profile, 'providerId', 'custom')));
}

function classifyProviderRuntimeFailure(message) {
  if (typeof message !== 'string' || message.length === 0) {
    return '';
  }
  const lower = message.toLowerCase();
  if (lower.indexOf('disabled') >= 0) {
    return 'disabled';
  }
  if (lower.indexOf('not executable') >= 0) {
    return 'binary_not_executable';
  }
  if (lower.indexOf('binary') >= 0 || lower.indexOf('command') >= 0 || lower.indexOf('not found') >= 0) {
    return 'binary_missing';
  }
  if (lower.indexOf('timeout') >= 0 || lower.indexOf('timed out') >= 0) {
    return 'startup_timeout';
  }
  if (lower.indexOf('endpoint') >= 0 || lower.indexOf('reachable') >= 0) {
    return 'endpoint_unreachable';
  }
  if (lower.indexOf('no local endpoint') >= 0 || lower.indexOf('no reachable') >= 0) {
    return 'config_invalid';
  }
  if (lower.indexOf('invalid') >= 0) {
    return 'config_invalid';
  }
  return 'runtime_error';
}

function buildProviderProfileRuntime(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return {
      provider: null,
      runtimeRegistered: false,
      runtimeProviderId: '',
      runtimeError: 'Invalid provider profile.'
    };
  }
  const resolved = providerProfileService.resolveRuntimeProfile(profile);
  if (resolved.ok !== true) {
    return {
      provider: null,
      runtimeRegistered: false,
      runtimeProviderId: runtimeProviderIdForProfile(profile),
      runtimeError: readString(resolved, 'message', 'Provider secret resolution failed.'),
      runtimeFailureCategory: readString(resolved, 'failureCategory', 'provider_secret_unavailable'),
      runtimeRemediation: readString(resolved, 'remediation', ''),
      runtimeWarnings: readStringArrayValue(resolved, 'warnings')
    };
  }
  profile = resolved.profile;
  const enabled = readBooleanValue(profile, 'enabled', true);
  const runtimeProviderId = runtimeProviderIdForProfile(profile);
  if (!enabled) {
    return {
      provider: null,
      runtimeRegistered: false,
      runtimeProviderId,
      runtimeError: 'Provider profile is disabled.'
    };
  }
  const displayName = readString(profile, 'displayName', readString(profile, 'providerId', runtimeProviderId));
  const description = readString(profile, 'description', 'Provider profile runtime.');
  const endpoint = readString(profile, 'endpoint', '');
  const binary = readString(profile, 'binary', readString(profile, 'command', ''));
  const runtimeMode = readString(profile, 'runtimeMode', 'oneshot') === 'stdio' ? 'stdio' : 'oneshot';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return {
      provider: new OpenCodeProvider({
        id: runtimeProviderId,
        displayName,
        description,
        baseUrl: endpoint,
        usageEndpoint: readString(profile, 'usageEndpoint', ''),
        usageEndpointEnv: readString(profile, 'usageEndpointEnv', ''),
        usageEndpointTokenEnv: readString(profile, 'usageEndpointTokenEnv', ''),
        lightCapabilities: true
      }),
      runtimeRegistered: true,
      runtimeProviderId,
      runtimeError: ''
    };
  }
  if (binary.length > 0) {
    const resolvedBinary = resolveBinaryForProfile(binary, readString(profile, 'cwd', ''));
    if (resolvedBinary.length === 0) {
      return {
        provider: null,
        runtimeRegistered: false,
        runtimeProviderId,
        runtimeError: 'Provider profile binary was not found.'
      };
    }
    if (fs.existsSync(resolvedBinary) && fs.statSync(resolvedBinary).isDirectory()) {
      return {
        provider: null,
        runtimeRegistered: false,
        runtimeProviderId,
        runtimeError: 'Provider profile binary is not executable.'
      };
    }
    return {
      provider: new CliProvider({
        id: runtimeProviderId,
        displayName,
        description,
        command: binary,
        commandArgs: splitCommandArgs(readString(profile, 'args', '')),
        promptMode: readString(profile, 'promptMode', 'stdin'),
        runtimeMode,
        defaultWorkspacePath: readString(profile, 'cwd', ''),
        modelFlag: readString(profile, 'modelFlag', ''),
        cwdFlag: readString(profile, 'cwdFlag', ''),
        usageEndpoint: readString(profile, 'usageEndpoint', ''),
        usageEndpointEnv: readString(profile, 'usageEndpointEnv', ''),
        usageEndpointTokenEnv: readString(profile, 'usageEndpointTokenEnv', ''),
        env: normalizeProfileEnv(readObjectValue(profile, 'env')),
        capabilitySource: 'profile',
        supportsGoalMode: true,
        supportsPlanMode: false,
        models: readArrayValue(profile, 'models'),
        speedModes: readArrayValue(profile, 'speedModes'),
        reasoningModes: readArrayValue(profile, 'reasoningModes'),
        interactionModes: readArrayValue(profile, 'interactionModes'),
        tools: readArrayValue(profile, 'tools')
      }),
      runtimeRegistered: true,
      runtimeProviderId,
      runtimeError: ''
    };
  }
  return {
    provider: null,
    runtimeRegistered: false,
    runtimeProviderId,
    runtimeError: 'Provider profile has no local endpoint or binary.'
  };
}

function unregisterProviderProfileRuntime(profileId) {
  const previous = profileRuntimeProviderIds.get(profileId);
  if (typeof previous === 'string' && previous.length > 0) {
    registry.unregister(previous);
    profileRuntimeProviderIds.delete(profileId);
    providerCatalog.clear();
  }
}

function registerProviderProfileRuntime(profile) {
  const profileId = readString(profile, 'profileId', readString(profile, 'id', ''));
  if (profileId.length === 0) {
    return {
      runtimeRegistered: false,
      runtimeProviderId: '',
      runtimeError: 'Provider profile id is required.'
    };
  }
  unregisterProviderProfileRuntime(profileId);
  const runtime = buildProviderProfileRuntime(profile);
  if (runtime.provider) {
    registry.register(runtime.provider);
    profileRuntimeProviderIds.set(profileId, runtime.runtimeProviderId);
    providerCatalog.clear();
  }
  return {
    runtimeRegistered: runtime.runtimeRegistered,
    runtimeProviderId: runtime.runtimeProviderId,
    runtimeError: runtime.runtimeError,
    runtimeFailureCategory: readString(runtime, 'runtimeFailureCategory', classifyProviderRuntimeFailure(readString(runtime, 'runtimeError', ''))),
    runtimeRemediation: readString(runtime, 'runtimeRemediation', ''),
    runtimeWarnings: readStringArrayValue(runtime, 'runtimeWarnings')
  };
}

function decorateProviderProfileRuntime(profile, runtimeInfo) {
  const runtime = runtimeInfo && typeof runtimeInfo === 'object' && !Array.isArray(runtimeInfo)
    ? runtimeInfo
    : (profileRuntimeProviderIds.has(readString(profile, 'profileId', ''))
      ? {
          runtimeRegistered: true,
          runtimeProviderId: profileRuntimeProviderIds.get(readString(profile, 'profileId', '')) || runtimeProviderIdForProfile(profile),
          runtimeError: '',
          runtimeFailureCategory: '',
          runtimeRemediation: '',
          runtimeWarnings: []
        }
      : buildProviderProfileRuntime(profile));
  return providerProfileService.toPublicProfile(profile, {
    runtimeRegistered: runtime.runtimeRegistered === true,
    runtimeProviderId: readString(runtime, 'runtimeProviderId', ''),
    runtimeError: readString(runtime, 'runtimeError', ''),
    runtimeFailureCategory: readString(runtime, 'runtimeFailureCategory', classifyProviderRuntimeFailure(readString(runtime, 'runtimeError', ''))),
    runtimeRemediation: readString(runtime, 'runtimeRemediation', ''),
    runtimeWarnings: readStringArrayValue(runtime, 'runtimeWarnings')
  });
}

function providerCatalogMutationMeta(reason, profileIds, runtimeProviderIds) {
  return {
    catalogRefreshReason: reason,
    affectedProfileIds: Array.isArray(profileIds) ? profileIds.filter((item) => typeof item === 'string' && item.length > 0) : [],
    affectedRuntimeProviderIds: Array.isArray(runtimeProviderIds) ? runtimeProviderIds.filter((item) => typeof item === 'string' && item.length > 0) : [],
    updatedAt: Date.now()
  };
}

function registerProviderProfilesFromStore() {
  providerProfileService.migrateLegacyProfiles();
  const profiles = daemonStore.readProviderProfiles();
  for (const profile of profiles) {
    registerProviderProfileRuntime(profile);
  }
}

function importAcpProviders(payload) {
  const discovered = discoverAcpProvidersRaw(payload);
  const selectedIds = readStringArrayValue(payload, 'selectedProfileIds').concat(readStringArrayValue(payload, 'profileIds'));
  const confirm = readBooleanValue(payload, 'confirm', false);
  const duplicatePolicy = readString(payload, 'duplicatePolicy', '') === 'replace' ? 'replace' : 'skip';
  const imported = [];
  const preview = [];
  const skipped = [];
  const duplicates = [];
  const affectedProfileIds = [];
  const affectedRuntimeProviderIds = [];
  let profiles = daemonStore.readProviderProfiles();
  const existingIds = new Set();
  const importedCatalogIds = new Set();
  for (const profile of profiles) {
    if (profile && typeof profile.profileId === 'string' && profile.profileId.length > 0) {
      existingIds.add(profile.profileId);
    }
  }
  for (const provider of discovered.providers) {
    if (selectedIds.length > 0 && !selectedIds.includes(provider.profileId) && !selectedIds.includes(provider.providerId)) {
      continue;
    }
    const duplicate = existingIds.has(provider.profileId) || importedCatalogIds.has(provider.profileId);
    if (duplicate) {
      duplicates.push(providerProfileValidationEntry(provider, existingIds.has(provider.profileId) ? 'duplicate_existing_profile' : 'duplicate_in_catalog'));
      if (duplicatePolicy !== 'replace') {
        skipped.push(providerProfileValidationEntry(provider, 'duplicate_skipped'));
        continue;
      }
    }
    if (!confirm) {
      preview.push(decorateProviderProfileRuntime(provider, buildProviderProfileRuntime(provider)));
      importedCatalogIds.add(provider.profileId);
      continue;
    }
    const result = upsertProviderProfile(provider);
    profiles = result.profiles;
    imported.push(result.profile);
    affectedProfileIds.push(result.profile.profileId);
    if (result.runtimeProviderId.length > 0) {
      affectedRuntimeProviderIds.push(result.runtimeProviderId);
    }
    importedCatalogIds.add(provider.profileId);
  }
  const meta = providerCatalogMutationMeta('provider_acp_import', affectedProfileIds, affectedRuntimeProviderIds);
  return {
    confirmed: confirm,
    confirmRequired: !confirm,
    duplicatePolicy,
    imported,
    preview,
    skipped,
    duplicates,
    profiles: confirm ? profiles : listProviderProfiles().profiles,
    scanned: discovered.scanned,
    validationReport: discovered.validationReport,
    catalogRefreshReason: meta.catalogRefreshReason,
    affectedProfileIds: meta.affectedProfileIds,
    affectedRuntimeProviderIds: meta.affectedRuntimeProviderIds,
    updatedAt: meta.updatedAt
  };
}

function providerProfileIdFromPayload(payload) {
  const profileId = readString(payload, 'profileId', readString(payload, 'id', ''));
  return profileId.length > 0 ? profileId : 'prv_' + crypto.randomBytes(12).toString('base64url');
}

function normalizeProviderProfile(payload, existing) {
  const now = new Date().toISOString();
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const profileId = providerProfileIdFromPayload(payload);
  const providerId = readString(payload, 'providerId', readString(base, 'providerId', 'custom'));
  const displayName = readString(payload, 'displayName', readString(payload, 'name', readString(base, 'displayName', providerId)));
  const acpPayload = readObjectValue(payload, 'acp');
  const acpBase = base.acp && typeof base.acp === 'object' && !Array.isArray(base.acp) ? base.acp : {};
  const envPayload = readObjectValue(payload, 'env');
  const envBase = readObjectValue(base, 'env');
  const hasEnvPayload = readBooleanValue(payload, 'envProvided', false) || (Object.keys(source).includes('env') && Object.keys(envPayload).length > 0);
  return {
    profileId,
    providerId,
    displayName,
    description: readString(payload, 'description', readString(base, 'description', '')),
    endpoint: readString(payload, 'endpoint', readString(payload, 'baseUrl', readString(base, 'endpoint', ''))),
    binary: readString(payload, 'binary', readString(payload, 'command', readString(base, 'binary', ''))),
    args: readString(payload, 'args', readString(base, 'args', '')),
    cwd: readString(payload, 'cwd', readString(base, 'cwd', '')),
    promptMode: readString(payload, 'promptMode', readString(base, 'promptMode', 'stdin')),
    modelFlag: readString(payload, 'modelFlag', readString(base, 'modelFlag', '')),
    cwdFlag: readString(payload, 'cwdFlag', readString(base, 'cwdFlag', '')),
    runtimeMode: readString(payload, 'runtimeMode', readString(base, 'runtimeMode', 'oneshot')) === 'stdio' ? 'stdio' : 'oneshot',
    env: hasEnvPayload ? normalizeProfileEnv(envPayload) : normalizeProfileEnv(envBase),
    models: readArrayValue(payload, 'models').length > 0 ? readArrayValue(payload, 'models') : readArrayValue(base, 'models'),
    speedModes: readArrayValue(payload, 'speedModes').length > 0 ? readArrayValue(payload, 'speedModes') : readArrayValue(base, 'speedModes'),
    reasoningModes: readArrayValue(payload, 'reasoningModes').length > 0 ? readArrayValue(payload, 'reasoningModes') : readArrayValue(base, 'reasoningModes'),
    interactionModes: readArrayValue(payload, 'interactionModes').length > 0 ? readArrayValue(payload, 'interactionModes') : readArrayValue(base, 'interactionModes'),
    tools: readArrayValue(payload, 'tools').length > 0 ? readArrayValue(payload, 'tools') : readArrayValue(base, 'tools'),
    baseProfileId: readString(payload, 'baseProfileId', readString(base, 'baseProfileId', '')),
    cloneFromProfileId: readString(payload, 'cloneFromProfileId', readString(base, 'cloneFromProfileId', '')),
    validationMessages: readStringArrayValue(payload, 'validationMessages').length > 0
      ? readStringArrayValue(payload, 'validationMessages')
      : readStringArrayValue(base, 'validationMessages'),
    kind: readString(payload, 'kind', readString(base, 'kind', 'custom')),
    sourcePath: readString(payload, 'sourcePath', readString(base, 'sourcePath', '')),
    acp: Object.keys(acpPayload).length > 0 ? acpPayload : acpBase,
    enabled: readBooleanValue(payload, 'enabled', readBooleanValue(base, 'enabled', true)),
    createdAt: readString(base, 'createdAt', now),
    updatedAt: now
  };
}

function listProviderProfiles() {
  const profiles = daemonStore.readProviderProfiles();
  const decorated = [];
  for (const profile of profiles) {
    decorated.push(decorateProviderProfileRuntime(profile, null));
  }
  return {
    profiles: decorated
  };
}

function findProviderProfileById(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) {
    return null;
  }
  return providerProfileService.find(profileId);
}

function upsertProviderProfile(payload) {
  const result = providerProfileService.upsert(payload);
  if (result.ok !== true || !result.storedProfile) {
    return {
      code: readString(result, 'failureCategory', 'provider_profile_write_failed'),
      message: readString(result, 'message', 'Provider profile could not be saved.'),
      remediation: readString(result, 'remediation', ''),
      warnings: readStringArrayValue(result, 'warnings')
    };
  }
  const storedProfile = result.storedProfile;
  const runtime = registerProviderProfileRuntime(storedProfile);
  const profile = decorateProviderProfileRuntime(storedProfile, runtime);
  const cloneFromProfileId = readString(payload, 'cloneFromProfileId', '');
  return {
    profile,
    profiles: listProviderProfiles().profiles,
    runtimeRegistered: runtime.runtimeRegistered,
    runtimeProviderId: runtime.runtimeProviderId,
    runtimeError: runtime.runtimeError,
    runtimeFailureCategory: readString(runtime, 'runtimeFailureCategory', classifyProviderRuntimeFailure(readString(runtime, 'runtimeError', ''))),
    remediation: readString(runtime, 'runtimeRemediation', ''),
    warnings: readStringArrayValue(result, 'warnings').concat(readStringArrayValue(runtime, 'runtimeWarnings')),
    catalogRefreshReason: cloneFromProfileId.length > 0 ? 'provider_profile_clone' : 'provider_profile_upsert',
    affectedProfileIds: [storedProfile.profileId],
    affectedRuntimeProviderIds: runtime.runtimeProviderId.length > 0 ? [runtime.runtimeProviderId] : []
  };
}

function deleteProviderProfile(payload) {
  const profileId = readString(payload, 'profileId', readString(payload, 'id', '')).trim();
  if (profileId.length === 0) {
    return { code: 'provider_profile_id_missing', message: 'Provider profile id is required.' };
  }
  const existing = providerProfileService.find(profileId);
  if (!existing) {
    return { code: 'provider_profile_not_found', message: 'Provider profile was not found.' };
  }
  const result = providerProfileService.remove(profileId);
  if (result.ok !== true) {
    return {
      code: readString(result, 'failureCategory', 'provider_profile_delete_failed'),
      message: readString(result, 'message', 'Provider profile could not be deleted.'),
      remediation: readString(result, 'remediation', ''),
      warnings: readStringArrayValue(result, 'warnings')
    };
  }
  const runtimeProviderId = runtimeProviderIdForProfile(existing);
  unregisterProviderProfileRuntime(profileId);
  return {
    deleted: true,
    profileId,
    profiles: listProviderProfiles().profiles,
    warnings: readStringArrayValue(result, 'warnings'),
    catalogRefreshReason: 'provider_profile_delete',
    affectedProfileIds: [profileId],
    affectedRuntimeProviderIds: runtimeProviderId.length > 0 ? [runtimeProviderId] : []
  };
}

function providerProfileForTest(payload) {
  const profileId = readString(payload, 'profileId', readString(payload, 'id', ''));
  if (profileId.length > 0) {
    const profiles = daemonStore.readProviderProfiles();
    for (const profile of profiles) {
      if (profile && profile.profileId === profileId) {
        return profile;
      }
    }
  }
  return normalizeProviderProfile(payload, null);
}

function commandHasPathSeparator(command) {
  return command.indexOf('/') >= 0 || command.indexOf('\\') >= 0 || path.isAbsolute(command);
}

function executableExtensions() {
  if (process.platform !== 'win32') {
    return [''];
  }
  const value = typeof process.env.PATHEXT === 'string' && process.env.PATHEXT.length > 0
    ? process.env.PATHEXT
    : '.EXE;.CMD;.BAT;.COM';
  return value.split(';').filter((item) => item.length > 0);
}

function resolveBinaryForProfile(command, cwd) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return '';
  }
  const value = command.trim();
  const extensions = executableExtensions();
  if (commandHasPathSeparator(value)) {
    const resolved = path.isAbsolute(value) ? value : path.resolve(cwd.length > 0 ? cwd : process.cwd(), value);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    for (const extension of extensions) {
      if (extension.length > 0 && fs.existsSync(resolved + extension)) {
        return resolved + extension;
      }
    }
    return '';
  }
  const pathValue = typeof process.env.PATH === 'string' ? process.env.PATH : '';
  const directories = pathValue.split(path.delimiter);
  for (const directory of directories) {
    if (directory.length === 0) {
      continue;
    }
    const candidate = path.join(directory, value);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    for (const extension of extensions) {
      if (extension.length > 0 && fs.existsSync(candidate + extension)) {
        return candidate + extension;
      }
    }
  }
  return '';
}

function probeProviderEndpoint(endpoint, timeoutMs) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch (error) {
      resolve({
        checked: true,
        reachable: false,
        statusCode: 0,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    const client = url.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const request = client.request(url, {
      method: 'GET',
      timeout: timeoutMs
    }, (response) => {
      response.resume();
      resolve({
        checked: true,
        reachable: response.statusCode >= 200 && response.statusCode < 500,
        statusCode: response.statusCode || 0,
        error: '',
        durationMs: Date.now() - startedAt
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('Endpoint probe timed out.'));
    });
    request.on('error', (error) => {
      resolve({
        checked: true,
        reachable: false,
        statusCode: 0,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt
      });
    });
    request.end();
  });
}

function runProviderProfileCommand(profile, binaryPath, payload, timeoutMs) {
  return new Promise((resolve) => {
    const testArgs = splitCommandArgs(readString(payload, 'testArgs', '--version'));
    const cwd = readString(profile, 'cwd', '');
    const env = Object.assign({}, process.env, normalizeProfileEnv(readObjectValue(profile, 'env')));
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let completed = false;
    const child = spawn(binaryPath, testArgs, {
      cwd: cwd.length > 0 && fs.existsSync(cwd) ? cwd : process.cwd(),
      env,
      windowsHide: true
    });
    const timer = setTimeout(() => {
      if (!completed) {
        child.kill();
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 65536) {
        stdout += chunk.toString('utf8');
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 65536) {
        stderr += chunk.toString('utf8');
      }
    });
    child.on('error', (error) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      resolve({
        commandRan: true,
        exitCode: 1,
        stdout,
        stderr: stderr.length > 0 ? stderr : (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
    });
    child.on('exit', (code, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timer);
      resolve({
        commandRan: true,
        exitCode: code === null ? 1 : code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut: signal !== null
      });
    });
  });
}

async function testProviderProfile(payload) {
  const timeoutMs = Math.max(500, Math.min(10000, readNumber(payload, 'timeoutMs', 3000)));
  const runCommand = readBooleanValue(payload, 'runCommand', false);
  const profile = providerProfileForTest(payload);
  const resolvedRuntimeProfile = providerProfileService.resolveRuntimeProfile(profile);
  const runtime = registerProviderProfileRuntime(profile);
  const decoratedProfile = decorateProviderProfileRuntime(profile, runtime);
  const endpoint = readString(profile, 'endpoint', '');
  const binary = readString(profile, 'binary', readString(profile, 'command', ''));
  const cwd = readString(profile, 'cwd', '');
  const binaryPath = resolveBinaryForProfile(binary, cwd);
  const hasEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://');
  const hasBinary = binary.length > 0;
  const validationMessages = [];
  let endpointProbe = {
    checked: false,
    reachable: false,
    statusCode: 0,
    error: '',
    durationMs: 0
  };
  let commandResult = {
    commandRan: false,
    exitCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 0,
    timedOut: false
  };
  let runtimeResolutionFailureCategory = resolvedRuntimeProfile.ok === true
    ? ''
    : readString(resolvedRuntimeProfile, 'failureCategory', 'provider_secret_unavailable');
  const runtimeResolutionWarnings = readStringArrayValue(resolvedRuntimeProfile, 'warnings');
  if (resolvedRuntimeProfile.ok !== true) {
    validationMessages.push(
      readString(
        resolvedRuntimeProfile,
        'message',
        'Provider profile runtime secrets could not be resolved.'
      )
    );
  }
  for (const warning of runtimeResolutionWarnings) {
    if (warning.startsWith('environment_variable_missing:')) {
      validationMessages.push('A required Provider process environment variable is unavailable.');
      runtimeResolutionFailureCategory = 'provider_environment_variable_missing';
    }
  }
  if (!hasEndpoint && !hasBinary) {
    validationMessages.push('Provider profile needs an endpoint or binary.');
  }
  if (hasBinary && binaryPath.length === 0) {
    validationMessages.push('Provider profile binary was not found.');
  }
  if (runtime.runtimeError.length > 0) {
    validationMessages.push(runtime.runtimeError);
  }
  if (hasEndpoint) {
    endpointProbe = await probeProviderEndpoint(endpoint, timeoutMs);
    if (!endpointProbe.reachable) {
      validationMessages.push(endpointProbe.error.length > 0 ? endpointProbe.error : 'Provider profile endpoint is not reachable.');
    }
  }
  if (runCommand && binaryPath.length > 0 && resolvedRuntimeProfile.ok === true) {
    commandResult = await runProviderProfileCommand(resolvedRuntimeProfile.profile, binaryPath, payload, timeoutMs);
    if (commandResult.exitCode !== 0) {
      validationMessages.push(commandResult.timedOut ? 'Provider profile startup timed out.' : 'Provider profile test command exited with code ' + String(commandResult.exitCode) + '.');
    }
  }
  const resolvedEnvironment = resolvedRuntimeProfile.ok === true
    ? readObjectValue(resolvedRuntimeProfile.profile, 'env')
    : {};
  const redactProviderOutput = (value) => {
    let output = typeof value === 'string' ? value : '';
    const secretValues = [];
    for (const key of Object.keys(resolvedEnvironment)) {
      const secretValue = readString(resolvedEnvironment, key, '');
      if (secretValue.length > 0 && !secretValues.includes(secretValue)) {
        secretValues.push(secretValue);
      }
    }
    secretValues.sort((left, right) => right.length - left.length);
    for (const secretValue of secretValues) {
      output = output.split(secretValue).join('[redacted]');
    }
    return redactDiagnosticText(output);
  };
  const ok = validationMessages.length === 0 && runtime.runtimeRegistered === true;
  const runtimeFailureCategory = ok
    ? ''
    : (runtimeResolutionFailureCategory.length > 0
      ? runtimeResolutionFailureCategory
      : classifyProviderRuntimeFailure(validationMessages.join(' ')));
  return {
    ok,
    profile: decoratedProfile,
    profileId: decoratedProfile.profileId,
    runtimeRegistered: runtime.runtimeRegistered,
    runtimeProviderId: runtime.runtimeProviderId,
    runtimeError: runtime.runtimeError,
    runtimeFailureCategory,
    remediation: resolvedRuntimeProfile.ok === true ? '' : readString(resolvedRuntimeProfile, 'remediation', ''),
    warnings: runtimeResolutionWarnings,
    testStatus: ok ? 'ok' : 'failed',
    validationMessages,
    hasEndpoint,
    endpointChecked: endpointProbe.checked,
    endpointReachable: endpointProbe.reachable,
    endpointStatusCode: endpointProbe.statusCode,
    endpointError: endpointProbe.error,
    hasBinary,
    binaryResolved: binaryPath.length > 0,
    binaryPath,
    commandRan: commandResult.commandRan,
    exitCode: commandResult.exitCode,
    stdout: redactProviderOutput(commandResult.stdout),
    stderr: redactProviderOutput(commandResult.stderr),
    durationMs: Math.max(endpointProbe.durationMs || 0, commandResult.durationMs || 0),
    timedOut: commandResult.timedOut === true,
    updatedAt: Date.now()
  };
}

function buildServerInfoPayload(proof, clientInfo) {
  const processRecords = managedProcessLedger.list();
  const terminalAvailable = terminalManager.isAvailable();
  const fileTransferAvailable = fileTransferManager.isAvailable();
  const client = clientInfo && typeof clientInfo === 'object' ? clientInfo : {};
  const minimumAppVersion = process.env.AGENT_BRIDGE_MINIMUM_APP_VERSION || '1.0.0';
  const recommendedAppVersion = process.env.AGENT_BRIDGE_RECOMMENDED_APP_VERSION || minimumAppVersion;
  const minimumBridgeVersion = process.env.AGENT_BRIDGE_MINIMUM_BRIDGE_VERSION || config.version;
  const recommendedBridgeVersion = process.env.AGENT_BRIDGE_RECOMMENDED_BRIDGE_VERSION || config.version;
  const compatibility = buildCompatibilityInfo({
    appVersion: readString(client, 'appVersion', ''),
    bridgeVersion: config.version,
    minimumAppVersion,
    recommendedAppVersion,
    minimumBridgeVersion,
    recommendedBridgeVersion,
    clientProtocolVersion: readString(client, 'protocolVersion', ''),
    minimumProtocolVersion: PROTOCOL_VERSION,
    supportedProtocolVersions: config.supportedProtocolVersions,
    recommendedProtocolVersion: PROTOCOL_VERSION_V2
  });
  return {
    serverId: daemonStore.serverId,
    hostname: os.hostname(),
    version: config.version,
    bridgeVersion: config.version,
    minimumAppVersion,
    recommendedAppVersion,
    compatibility: Object.assign({}, compatibility, { minimumProtocolVersion: PROTOCOL_VERSION, recommendedProtocolVersion: PROTOCOL_VERSION_V2 }),
    protocolVersion: PROTOCOL_VERSION_V2,
    legacyProtocolVersion: PROTOCOL_VERSION,
    supportedProtocolVersions: config.supportedProtocolVersions,
    terminalStreamProtocolVersion: terminalAvailable ? TERMINAL_STREAM_PROTOCOL_VERSION : 1,
    uptimeSec: Math.floor(process.uptime()),
    activeConnections,
    deviceIdentity: proof.deviceIdentity,
    keyFingerprint: proof.deviceIdentity.publicKeyFingerprint,
    connectionProof: proof.signature,
    features: buildFeatureFlags(),
    providerSecretStorage: providerProfileService.secretStoreStatus(),
    capabilities: {
      requestTypes: Object.values(RequestType),
      eventTypes: Object.values(EventType),
      binaryFrames: {
        terminal: terminalAvailable,
        fileTransfer: fileTransferAvailable
      }
    },
    managedProcesses: {
      count: processRecords.length
    }
  };
}

function permissionStatusIsPending(status) {
  if (typeof status !== 'string' || status.length === 0) {
    return true;
  }
  const normalized = status.toLowerCase();
  return normalized === 'requested' ||
    normalized === 'pending' ||
    normalized === 'waiting' ||
    normalized === 'needs_input' ||
    normalized === 'needs_approval' ||
    normalized === 'review';
}

function permissionKindForEvent(eventType) {
  if (eventType === EventType.PLAN_REQUESTED) {
    return 'plan';
  }
  if (eventType === EventType.QUESTION_REQUESTED) {
    return 'question';
  }
  return 'permission';
}

function permissionRequestId(projectedItem) {
  return readString(projectedItem, 'requestId',
    readString(projectedItem, 'permissionId',
      readString(projectedItem, 'planId',
        readString(projectedItem, 'id', ''))));
}

function listPermissionRequests(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const agentId = readString(source, 'agentId', '');
  const includeResolved = source.includeResolved === true;
  const includeArchived = source.includeArchived === true;
  const limitRaw = typeof source.limit === 'number' && Number.isFinite(source.limit) ? source.limit : 100;
  const limit = Math.max(1, Math.min(Math.floor(limitRaw), 500));
  const requests = [];
  const agents = agentManager.list({
    includeArchived
  });
  for (const agent of agents) {
    if (!agent || (agentId.length > 0 && agent.id !== agentId)) {
      continue;
    }
    const timeline = agentManager.fetchTimeline({
      agentId: agent.id,
      limit: 500
    });
    for (const item of timeline.items) {
      if (!item || item.kind !== 'permission') {
        continue;
      }
      const projected = item.projectedItem && typeof item.projectedItem === 'object' && !Array.isArray(item.projectedItem) ? item.projectedItem : {};
      const status = readString(projected, 'status', '');
      if (!includeResolved && !permissionStatusIsPending(status)) {
        continue;
      }
      requests.push({
        agentId: agent.id,
        agentTitle: readString(agent, 'title', ''),
        providerId: readString(projected, 'providerId', readString(agent, 'provider', '')),
        sessionId: readString(projected, 'sessionId', readString(agent, 'providerSessionId', '')),
        seq: typeof item.seq === 'number' ? item.seq : 0,
        eventType: readString(item, 'eventType', ''),
        kind: permissionKindForEvent(readString(item, 'eventType', '')),
        requestId: permissionRequestId(projected),
        permissionId: readString(projected, 'permissionId', ''),
        planId: readString(projected, 'planId', ''),
        title: readString(projected, 'title', ''),
        prompt: readString(projected, 'prompt', readString(projected, 'message', '')),
        status: status.length > 0 ? status : 'pending',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0
      });
    }
  }
  requests.sort((left, right) => right.createdAt - left.createdAt);
  let pendingCount = 0;
  for (const request of requests) {
    if (permissionStatusIsPending(request.status)) {
      pendingCount += 1;
    }
  }
  return {
    ok: true,
    action: 'permission.list',
    agentId,
    requests: requests.slice(0, limit),
    totalCount: requests.length,
    pendingCount,
    includeResolved,
    includeArchived
  };
}

function sendManagerResponse(connection, id, result) {
  if (result && typeof result.code === 'string' && result.code.length > 0) {
    connection.sendJson(makeErrorResponse(id, result.code, readString(result, 'message', 'Request failed.')));
    return;
  }
  connection.sendJson(makeResponse(id, result));
}

function sendJson(res, statusCode, value, extraHeaders) {
  const body = JSON.stringify(value, null, 2);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  }, extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {});
  res.writeHead(statusCode, headers);
  res.end(body);
}

function securityHeaders(contentType, cacheControl) {
  return {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function sendStaticFile(res, filePath, contentType, cacheControl) {
  try {
    const body = fs.readFileSync(filePath);
    const headers = securityHeaders(contentType, cacheControl);
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
  } catch (_error) {
    sendJson(res, 404, { ok: false, error: { code: 'web_asset_not_found', message: 'Web asset was not found.' } });
  }
}

function webAssetPath(pathname) {
  const relative = pathname === '/' || pathname === '/app' || pathname === '/app/' ? 'index.html' : pathname.substring('/app/'.length);
  if (relative.length === 0 || relative.includes('\\') || relative.includes('\0')) return '';
  const normalized = path.normalize(relative);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return '';
  const candidate = path.resolve(WEB_ROOT, normalized);
  return candidate.startsWith(path.resolve(WEB_ROOT) + path.sep) ? candidate : '';
}

function webContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function webOriginAllowed(req) {
  const origin = req && req.headers ? req.headers.origin : '';
  if (typeof origin !== 'string' || origin.length === 0) return true;
  try {
    const parsed = new URL(origin);
    const host = normalizeHostHeader(req.headers.host || '');
    return parsed.hostname.toLowerCase() === host.toLowerCase() && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch (_error) {
    return false;
  }
}

function issueWebAuthTicket(req) {
  const ticket = crypto.randomBytes(32).toString('base64url');
  webAuthTickets.set(ticket, {
    expiresAt: Date.now() + WEB_TICKET_TTL_MS,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : '',
    host: normalizeHostHeader(req.headers.host || '')
  });
  return ticket;
}

function issueWebAuthSession(req) {
  const session = crypto.randomBytes(32).toString('base64url');
  webAuthSessions.set(session, {
    expiresAt: Date.now() + WEB_SESSION_TTL_MS,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : '',
    host: normalizeHostHeader(req.headers.host || '')
  });
  return session;
}

function webAuthSessionCookie(value, maxAgeMs, req) {
  const secure = req && req.socket && req.socket.encrypted === true ? '; Secure' : '';
  return WEB_SESSION_COOKIE + '=' + encodeURIComponent(value) + '; Max-Age=' + String(Math.max(0, Math.floor(maxAgeMs / 1000))) + '; Path=/web; HttpOnly; SameSite=Strict' + secure;
}

function webAuthSessionAuthorized(req) {
  const cookie = readCookieValue(req && req.headers ? req.headers.cookie : '', WEB_SESSION_COOKIE);
  if (cookie.length === 0) return false;
  const record = webAuthSessions.get(cookie);
  if (!record || record.expiresAt < Date.now()) {
    webAuthSessions.delete(cookie);
    return false;
  }
  if (record.host !== normalizeHostHeader(req.headers.host || '')) return false;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  return origin.length === 0 || record.origin === origin;
}

function revokeWebAuthSession(req) {
  const cookie = readCookieValue(req && req.headers ? req.headers.cookie : '', WEB_SESSION_COOKIE);
  if (cookie.length > 0) webAuthSessions.delete(cookie);
  return webAuthSessionCookie('', 0, req);
}

function consumeWebAuthTicket(req, ticket) {
  if (typeof ticket !== 'string' || ticket.length < 32) return false;
  const record = webAuthTickets.get(ticket);
  webAuthTickets.delete(ticket);
  if (!record || record.expiresAt < Date.now()) return false;
  if (record.host !== normalizeHostHeader(req.headers.host || '')) return false;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  return record.origin === origin;
}

function remoteAddressFromSocket(socket) {
  if (!socket) {
    return '';
  }
  const address = typeof socket.remoteAddress === 'string' ? socket.remoteAddress : '';
  const port = typeof socket.remotePort === 'number' && socket.remotePort > 0 ? ':' + String(socket.remotePort) : '';
  return address + port;
}

function remoteAddressFromRequest(req) {
  return remoteAddressFromSocket(req && req.socket ? req.socket : null);
}

function sendFileDownload(res, item) {
  const stat = require('fs').statSync(item.absolutePath);
  const fileName = require('path').basename(item.path);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fileName) + '"'
  });
  require('fs').createReadStream(item.absolutePath).pipe(res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) {
        resolve(null);
        return;
      }
      const contentType = req.headers['content-type'] || '';
      if (typeof contentType === 'string' && contentType.indexOf('application/json') >= 0) {
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error('Invalid JSON body: ' + (error instanceof Error ? error.message : String(error))));
        }
        return;
      }
      resolve(text);
    });
    req.on('error', reject);
  });
}

async function handleRpcHttpRequest(req, reqUrl, res) {
  const authorization = await authorizeRequest(req, reqUrl);
  if (!authorization.ok) {
    recordSecurityAudit({
      category: 'auth',
      action: 'rpc.unauthorized',
      severity: 'warning',
      status: 'rejected',
      reason: authorization.failureCategory || 'unauthorized',
      message: 'HTTP RPC request rejected because its authentication credential was missing or invalid.',
      remoteAddress: remoteAddressFromRequest(req),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    sendJson(res, 401, {
      ok: false,
      error: {
        code: 'unauthorized',
        message: authorization.message || 'A valid Bridge credential is required.'
      }
    });
    return;
  }
  try {
    const body = await readRequestBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, {
        ok: false,
        error: {
          code: 'invalid_rpc_body',
          message: 'RPC body must be a JSON object.'
        }
      });
      return;
    }
    const requestId = readString(body, 'id', crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'));
    body.id = requestId;
    const messages = [];
    const rpcConnection = {
      requestedEndpoint: endpointForRequest(req, reqUrl),
      requestHost: req && req.headers ? req.headers.host || '' : '',
      requestProtocol: req && req.socket && req.socket.encrypted === true ? 'https:' : 'http:',
      clientId: 'cli-rpc',
      appNonce: '',
      sendJson(value) {
        messages.push(value);
      },
      close() {}
    };
    await handleClientMessage(JSON.stringify(body), rpcConnection);
    let response = null;
    for (const item of messages) {
      if (item && typeof item === 'object' && item.type === 'response' && item.id === requestId) {
        response = item;
      }
    }
    sendJson(res, 200, {
      ok: response ? response.ok === true : true,
      response,
      messages
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: {
        code: 'rpc_failed',
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

function queryObjectFromUrl(reqUrl) {
  const query = {};
  for (const key of reqUrl.searchParams.keys()) {
    if (key === 'token') {
      continue;
    }
    const values = reqUrl.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] || '');
  }
  return query;
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (typeof header !== 'string') {
    return '';
  }
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return '';
  }
  return header.slice(prefix.length);
}

async function authorizeRequest(req, reqUrl) {
  const bearerToken = readBearerToken(req);
  const queryToken = reqUrl.searchParams.get('token') || '';
  const candidate = bearerToken.length > 0 ? bearerToken : queryToken;
  return await authenticateCredential(candidate, daemonStore, config.token);
}

function configuredHostAllowlist() {
  const values = [];
  const daemonHostnames = daemonStore.config &&
    daemonStore.config.daemon &&
    Array.isArray(daemonStore.config.daemon.hostnames)
    ? daemonStore.config.daemon.hostnames
    : [];
  for (const item of daemonHostnames) {
    if (typeof item === 'string' && item.length > 0) {
      values.push(item.toLowerCase());
    }
  }
  return values;
}

function isHostAllowed(req) {
  return hostAllowed(req && req.headers ? req.headers.host : '', configuredHostAllowlist()).allowed;
}

function endpointForRequest(req, reqUrl) {
  const requestedEndpoint = reqUrl.searchParams.get('endpoint') || '';
  if (requestedEndpoint.length > 0) {
    return requestedEndpoint;
  }
  return 'ws://' + (req.headers.host || config.host) + '/ws';
}

async function buildCapabilities(endpoint, clientId, appNonce, clientInfo) {
  const proof = signConnectionChallenge(config.profile, endpoint || '', clientId || '', appNonce || '');
  const serverInfo = buildServerInfoPayload(proof, clientInfo);
  return {
    protocolVersion: PROTOCOL_VERSION,
    preferredProtocolVersion: PROTOCOL_VERSION_V2,
    supportedProtocolVersions: config.supportedProtocolVersions,
    serverInfo,
    features: serverInfo.features,
    deviceIdentity: proof.deviceIdentity,
    keyFingerprint: proof.deviceIdentity.publicKeyFingerprint,
    connectionProof: proof.signature,
    providers: await registry.listCapabilities(),
    requestTypes: Object.values(RequestType),
    eventTypes: Object.values(EventType)
  };
}

function usagePayloadForConnection(payload, connection) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const clientHello = connection && connection.clientHello && typeof connection.clientHello === 'object' ? connection.clientHello : {};
  const result = Object.assign({}, source);
  const connectionHostProfileId = readString(clientHello, 'hostProfileId', '');
  if (connectionHostProfileId) result.hostProfileId = connectionHostProfileId;
  return result;
}

function chatPayloadForConnection(payload, connection) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const clientHello = connection && connection.clientHello && typeof connection.clientHello === 'object' ? connection.clientHello : {};
  const stableIdentity = readString(clientHello, 'hostProfileId', '') || (connection && typeof connection.clientId === 'string' ? connection.clientId : '') || 'bridge-user';
  const actorHash = crypto.createHash('sha256').update(stableIdentity, 'utf8').digest('hex').slice(0, 24);
  return Object.assign({}, source, {
    _actorId: 'human:' + actorHash,
    actorDisplayName: readString(clientHello, 'appName', readString(clientHello, 'deviceName', 'Bridge User'))
  });
}

function githubPayloadForConnection(payload, connection) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const result = Object.assign({}, source);
  const hostProfileId = hostProfileIdForConnection(connection);
  if (hostProfileId.length > 0) {
    result.hostProfileId = hostProfileId;
  }
  if (connection && typeof connection.connectionId === 'string' && connection.connectionId.length > 0) {
    result._connectionId = connection.connectionId;
  }
  return result;
}

function daemonConfigPayloadForConnection(payload, connection) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const result = Object.assign({}, source);
  const hostProfileId = hostProfileIdForConnection(connection);
  if (hostProfileId.length > 0) result.hostProfileId = hostProfileId;
  return result;
}

function sendObservedEvent(connection, event) {
  if (event && event.payload && typeof event.payload === 'object') {
    if (event.event === EventType.MESSAGE_DELTA) {
      delete event.payload.contentNodes;
    }
    if (event.payload.usage && typeof event.payload.usage === 'object') {
      const sessionMatch = event.sessionId ? registry.findSession(event.sessionId) : null;
      const providerId = readString(event, 'providerId', '') ||
        (sessionMatch && sessionMatch.provider ? readString(sessionMatch.provider, 'id', '') : '') ||
        readString(event.payload.usage, 'providerId', '');
      const agentRecord = event.sessionId ? agentManager.findBySessionId(event.sessionId) : null;
      const agentId = readString(event.payload.usage, 'agentId', '') ||
        (agentRecord && typeof agentRecord.id === 'string' ? agentRecord.id : '');
      const usage = usageManager.record(
        usagePayloadForConnection(Object.assign({}, event.payload.usage, {
          sessionId: event.sessionId || '',
          providerId,
          agentId
        }), connection),
        connection
      );
      if (usage) {
        sendScopedUsageEvent(
          activeWsConnections,
          readString(usage, 'hostProfileId', ''),
          connection,
          makeEvent(EventType.USAGE_UPDATED, event.sessionId || '', { usage })
        );
      }
    }
  }
  const agent = agentManager.observeBridgeEvent(event);
  if (event && event.event === EventType.MESSAGE_COMPLETED && event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload.contentNodes)) {
    const bodyText = typeof event.payload.text === 'string' ? event.payload.text : (typeof event.payload.content === 'string' ? event.payload.content : '');
    event.payload.contentNodes = normalizeRichContentNodes([], bodyText, { workspaceId: agent ? agent.workspaceId : '' });
  }
  connection.sendJson(event);
  if (internalAutomationConnection(connection)) {
    sendAutomationScopedNotification(event, agent);
  } else {
    const hostProfileId = hostProfileIdForConnection(connection);
    const notification = notificationManager.createFromBridgeEvent(event, agent, hostProfileId);
    if (notification) {
      const notificationEvent = notificationEventForConnection(connection, event.sessionId || '', notification);
      if (notificationEvent) {
        connection.sendJson(notificationEvent);
      }
      schedulePushNotification(notification);
    }
  }
  if (agent) {
    connection.sendJson(makeEvent(EventType.AGENT_UPDATED, event.sessionId || '', { agent }));
    connection.sendJson(makeEvent(EventType.AGENT_TIMELINE_UPDATED, event.sessionId || '', {
      agentId: agent.id,
      latestSeq: agent.latestSeq
    }));
  }
}

function sendAgentLifecycleEvents(connection, sessionId, agent, created) {
  if (!agent) {
    return;
  }
  if (created) {
    connection.sendJson(makeEvent(EventType.AGENT_CREATED, sessionId || '', { agent }));
  }
  connection.sendJson(makeEvent(EventType.AGENT_UPDATED, sessionId || '', { agent }));
  connection.sendJson(makeEvent(EventType.AGENT_TIMELINE_UPDATED, sessionId || '', {
    agentId: agent.id,
    latestSeq: agent.latestSeq
  }));
}

function sendAutomationResponse(connection, id, family, result) {
  if (result && result.ok === true) {
    rememberAutomationResult(connection, family, result);
  }
  connection.sendJson(makeResponse(id, result));
}

function sendAutomationClientMessage(message) {
  sendScopedAutomationRuntimeEvent(activeWsConnections, message, (agentId, sessionId) => {
    const agent = agentId.length > 0 ? agentManager.find(agentId) :
      (sessionId.length > 0 ? agentManager.findBySessionId(sessionId) : null);
    return agent && typeof agent.workspaceId === 'string' ? agent.workspaceId : '';
  });
}

function automationConnection() {
  return {
    connectionId: 'bridge_automation',
    clientId: 'bridge_automation',
    clientHello: { hostProfileId: 'bridge-automation' },
    internalAutomation: true,
    sendJson: (message) => sendAutomationClientMessage(message),
    sendBinary: () => {},
    close: () => {}
  };
}

function latestCompletedAssistantOutput(agentId, afterSeq) {
  const timeline = agentManager.fetchTimeline({
    agentId,
    direction: 'after',
    cursor: afterSeq > 0 ? String(afterSeq) : '',
    limit: 500
  });
  const items = Array.isArray(timeline.items) ? timeline.items : [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const projected = items[index] && items[index].projectedItem && typeof items[index].projectedItem === 'object'
      ? items[index].projectedItem
      : null;
    if (!projected || readString(projected, 'role', '') !== 'assistant' || readString(projected, 'status', '') !== 'completed') continue;
    const contentKind = readString(projected, 'contentKind', 'text');
    if (contentKind === 'reasoning') continue;
    const output = readString(projected, 'text', readString(projected, 'content', ''));
    if (output.length > 0) return output;
  }
  return '';
}

function automationUsageEvents(sessionId) {
  const result = usageManager.events({
    hostProfileId: 'bridge-automation',
    sessionId,
    window: 'session',
    limit: 1000
  });
  return Array.isArray(result.events) ? result.events : [];
}

function automationUsageDelta(beforeEvents, afterEvents) {
  const beforeIds = new Set(beforeEvents.map((item) => readString(item, 'eventId', '')));
  const costs = new Map();
  let totalTokens = 0;
  let estimated = true;
  let count = 0;
  for (const event of afterEvents) {
    const eventId = readString(event, 'eventId', '');
    if (eventId.length > 0 && beforeIds.has(eventId)) continue;
    count += 1;
    totalTokens += Math.max(0, readNumber(event, 'totalTokens', 0));
    if (event.estimated !== true) estimated = false;
    const cost = Math.max(0, readNumber(event, 'cost', 0));
    const currency = readString(event, 'currency', '').toUpperCase();
    if (cost > 0 && currency.length > 0) costs.set(currency, (costs.get(currency) || 0) + cost);
  }
  const currencies = Array.from(costs.keys());
  return {
    totalTokens,
    cost: currencies.length === 1 ? costs.get(currencies[0]) : 0,
    currency: currencies.length === 1 ? currencies[0] : '',
    costByCurrency: Object.fromEntries(costs.entries()),
    estimated: count > 0 && estimated
  };
}

function createAutomationSourceAgent(input, workspace) {
  const requestedSourceId = readString(input, 'sourceAgentId', '');
  const existing = requestedSourceId.length > 0 ? agentManager.find(requestedSourceId) : null;
  if (existing && existing.archivedAt.length === 0 && existing.rootPath === workspace.workspacePath) return agentManager.publicRecord(existing);
  const source = agentManager.createPlaceholder({
    providerId: readString(input, 'providerId', 'mock'),
    workspacePath: workspace.workspacePath,
    cwd: workspace.workspacePath,
    workspaceId: workspace.workspaceId,
    workspaceTitle: readString(input, 'sourceTitle', 'Automation controller'),
    title: readString(input, 'sourceTitle', 'Automation controller'),
    workspaceMode: workspace.workspaceMode,
    features: ['automation-controller']
  });
  sendAgentLifecycleEvents(automationConnection(), '', source, true);
  return source;
}

async function createAutomationAgent(input, workspace) {
  const source = input && input.createSource === false ? null : createAutomationSourceAgent(input, workspace);
  const payload = {
    providerId: readString(input, 'providerId', 'mock'),
    modelId: readString(input, 'modelId', ''),
    workspacePath: workspace.workspacePath,
    cwd: workspace.workspacePath,
    workspaceId: workspace.workspaceId,
    workspaceTitle: readString(input, 'title', 'Automation Agent'),
    title: readString(input, 'title', 'Automation Agent'),
    workspaceMode: workspace.workspaceMode,
    worktreeId: workspace.worktreeId,
    features: ['automation-worker']
  };
  if (source) {
    payload.parentAgentId = source.id;
    payload.rootAgentId = source.rootAgentId || source.id;
  }
  const created = await createProviderSessionForAgent(payload);
  const connection = automationConnection();
  connection.sendJson(makeEvent(EventType.SESSION_CREATED, created.session.sessionId, { session: created.session }));
  sendAgentLifecycleEvents(connection, created.session.sessionId, created.agent, true);
  if (typeof input.onAgentStarted === 'function') input.onAgentStarted(created.agent.id);
  return { sourceAgent: source, created, connection };
}

async function sendAutomationPrompt(agentId, prompt, connection) {
  const record = agentManager.find(agentId);
  if (!record) return { ok: false, failureCategory: 'agent_not_found', message: 'Automation Agent was not found.' };
  const baselineSeq = record.nextSeq - 1;
  const beforeUsage = automationUsageEvents(record.providerSessionId);
  const sent = await sendMessageToAgent(agentId, {
    text: prompt,
    clientMessageId: randomAutomationMessageId(),
    queuePolicy: 'immediate',
    source: 'bridge-automation'
  }, connection);
  if (!sent.ok) return { ok: false, failureCategory: sent.code || 'agent_execution_failed', message: sent.message || 'Automation Agent request failed.' };
  const current = agentManager.find(agentId);
  const sessionId = current ? current.providerSessionId : record.providerSessionId;
  return {
    ok: true,
    agentId,
    sessionId,
    output: latestCompletedAssistantOutput(agentId, baselineSeq),
    usage: automationUsageDelta(beforeUsage, automationUsageEvents(sessionId))
  };
}

function randomAutomationMessageId() {
  return 'automation_' + crypto.randomBytes(12).toString('base64url');
}

async function executeScheduleAutomation(input) {
  const schedule = input && input.schedule && typeof input.schedule === 'object' ? input.schedule : {};
  const workspace = {
    workspaceId: readString(schedule, 'workspaceId', ''),
    workspacePath: readString(schedule, 'workspacePath', ''),
    workspaceMode: 'shared',
    worktreeId: ''
  };
  try {
    const runtime = await createAutomationAgent({
      providerId: readString(schedule, 'providerId', 'mock'),
      modelId: readString(schedule, 'modelId', ''),
      title: readString(schedule, 'name', 'Scheduled Agent') + ' run',
      sourceTitle: readString(schedule, 'name', 'Scheduled Agent') + ' controller',
      createSource: false
    }, workspace);
    const result = await sendAutomationPrompt(runtime.created.agent.id, readString(schedule, 'prompt', ''), runtime.connection);
    return result;
  } catch (error) {
    return {
      ok: false,
      failureCategory: error && typeof error.code === 'string' ? error.code : 'schedule_agent_failed',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function ensureLoopWorkspace(loop) {
  const originalPath = readString(loop, 'workspacePath', '');
  const originalId = readString(loop, 'workspaceId', '');
  if (readString(loop, 'workspaceMode', 'shared') !== 'isolated') {
    return { workspaceId: originalId, workspacePath: originalPath, workspaceMode: 'shared', worktreeId: '', branch: '' };
  }
  const existingPath = readString(loop, 'runtimeWorkspacePath', '');
  const existingId = readString(loop, 'runtimeWorkspaceId', '');
  if (existingPath.length > 0 && fs.existsSync(existingPath)) {
    return {
      workspaceId: existingId,
      workspacePath: existingPath,
      workspaceMode: 'isolated',
      worktreeId: readString(loop, 'worktreeId', existingId),
      branch: readString(loop, 'branch', '')
    };
  }
  const shortId = readString(loop, 'id', 'loop').replace(/[^A-Za-z0-9]/g, '').slice(-12).toLowerCase();
  const branch = 'ngf/loop-' + shortId;
  const worktreePath = path.join(path.dirname(originalPath), '.ngf-worktrees', (path.basename(originalPath) || 'workspace') + '-loop-' + shortId);
  const preview = await workspaceService.createWorktree({
    workspacePath: originalPath,
    sourceRootPath: originalPath,
    sourceWorkspaceId: originalId,
    worktreePath,
    branch,
    startPoint: 'HEAD',
    setupCommand: '',
    createParent: true,
    confirm: false,
    preview: true
  });
  if (!preview || preview.ok !== true) {
    const error = new Error(preview && preview.message ? preview.message : 'Loop worktree preview failed.');
    error.code = preview && preview.failureCategory ? preview.failureCategory : 'loop_workspace_preview_failed';
    throw error;
  }
  const created = await workspaceService.createWorktree({
    workspacePath: originalPath,
    sourceRootPath: originalPath,
    sourceWorkspaceId: originalId,
    worktreePath,
    branch,
    startPoint: 'HEAD',
    setupCommand: '',
    createParent: true,
    confirm: true,
    preview: false
  });
  if (!created || created.ok !== true || created.created !== true) {
    const error = new Error(created && created.message ? created.message : 'Loop worktree creation failed.');
    error.code = created && created.failureCategory ? created.failureCategory : 'loop_workspace_create_failed';
    throw error;
  }
  const workspace = workspaceRegistry.upsertWorkspace({
    workspacePath: worktreePath,
    cwd: worktreePath,
    workspaceTitle: readString(loop, 'name', 'Loop') + ' workspace',
    title: readString(loop, 'name', 'Loop') + ' workspace',
    branch,
    kind: 'worktree',
    sourceWorkspaceId: originalId,
    sourceRootPath: originalPath,
    worktreePath,
    startPoint: 'HEAD',
    dedupeByCwd: true
  });
  if (!workspace) throw Object.assign(new Error('Loop worktree registry linkage failed.'), { code: 'loop_workspace_registry_failed' });
  return { workspaceId: workspace.workspaceId, workspacePath: worktreePath, workspaceMode: 'isolated', worktreeId: workspace.workspaceId, branch };
}

async function executeLoopWorker(input) {
  const loop = input && input.loop && typeof input.loop === 'object' ? input.loop : {};
  try {
    const workspace = await ensureLoopWorkspace(loop);
    const runtime = await createAutomationAgent({
      providerId: readString(loop, 'workerProviderId', 'mock'),
      modelId: readString(loop, 'workerModelId', ''),
      title: readString(loop, 'name', 'Loop') + ' round ' + String(input.round) + ' worker',
      sourceTitle: readString(loop, 'name', 'Loop') + ' controller',
      sourceAgentId: readString(loop, 'sourceAgentId', ''),
      onAgentStarted: input.onAgentStarted
    }, workspace);
    const remediation = readString(input, 'remediation', '');
    const prompt = readString(input, 'prompt', '') + (remediation.length > 0 ? '\n\nVerifier remediation from the previous round:\n' + remediation : '');
    const result = await sendAutomationPrompt(runtime.created.agent.id, prompt, runtime.connection);
    return Object.assign(result, {
      sourceAgentId: runtime.sourceAgent.id,
      runtimeWorkspaceId: workspace.workspaceId,
      runtimeWorkspacePath: workspace.workspacePath,
      worktreeId: workspace.worktreeId,
      branch: workspace.branch
    });
  } catch (error) {
    return { ok: false, failureCategory: error && typeof error.code === 'string' ? error.code : 'loop_worker_failed', message: error instanceof Error ? error.message : String(error) };
  }
}

async function executeLoopVerifier(input) {
  const loop = input && input.loop && typeof input.loop === 'object' ? input.loop : {};
  try {
    const workspace = await ensureLoopWorkspace(loop);
    const runtime = await createAutomationAgent({
      providerId: readString(loop, 'verifierProviderId', 'mock'),
      modelId: readString(loop, 'verifierModelId', ''),
      title: readString(loop, 'name', 'Loop') + ' round ' + String(input.round) + ' verifier',
      sourceTitle: readString(loop, 'name', 'Loop') + ' controller',
      sourceAgentId: readString(loop, 'sourceAgentId', ''),
      onAgentStarted: input.onAgentStarted
    }, workspace);
    const criteria = Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : [];
    const prompt = [
      readString(input, 'verifyPrompt', 'Verify the worker result.'),
      '',
      'Acceptance criteria JSON:',
      JSON.stringify(criteria),
      '',
      'Worker output:',
      readString(input, 'workerOutput', ''),
      '',
      'Return exactly one JSON object with: passed (boolean), summary (string), remediation (string), and checks (array of criterionId, passed, evidence, remediation). Do not use Markdown fences.'
    ].join('\n');
    const result = await sendAutomationPrompt(runtime.created.agent.id, prompt, runtime.connection);
    if (!result.ok) return result;
    let verification;
    try {
      verification = JSON.parse(result.output.trim());
    } catch (_error) {
      return { ok: false, failureCategory: 'loop_verifier_invalid_json', message: 'Loop verifier did not return a plain JSON object.', agentId: result.agentId, usage: result.usage };
    }
    if (!verification || typeof verification !== 'object' || Array.isArray(verification)) return { ok: false, failureCategory: 'loop_verifier_invalid_json', message: 'Loop verifier result must be a JSON object.', agentId: result.agentId, usage: result.usage };
    return Object.assign(result, {
      verification,
      sourceAgentId: runtime.sourceAgent.id,
      runtimeWorkspaceId: workspace.workspaceId,
      runtimeWorkspacePath: workspace.workspacePath,
      worktreeId: workspace.worktreeId,
      branch: workspace.branch
    });
  } catch (error) {
    return { ok: false, failureCategory: error && typeof error.code === 'string' ? error.code : 'loop_verifier_failed', message: error instanceof Error ? error.message : String(error) };
  }
}

async function cancelAutomationAgent(agentId, reason) {
  const routed = agentManager.providerPayloadForAgent(agentId, { reason });
  if (!routed) return { ok: false, failureCategory: 'agent_not_found', message: 'Automation Agent was not found.' };
  let result = null;
  try {
    result = await registry.abortSession(routed.payload, (event) => sendObservedEvent(automationConnection(), event));
  } catch (error) {
    return { ok: false, failureCategory: error && typeof error.code === 'string' ? error.code : 'agent_cancel_failed', message: error instanceof Error ? error.message : String(error) };
  }
  const agent = agentManager.stop(agentId, result);
  if (agent) sendAgentLifecycleEvents(automationConnection(), agent.providerSessionId, agent, false);
  return { ok: true, agent, result };
}

async function dispatchChatRoomAgent(input) {
  const agentId = readString(input, 'agentId', '');
  const record = agentManager.find(agentId);
  if (!record || record.archivedAt.length > 0) return { ok: false, failureCategory: 'chat_agent_unavailable', message: 'Mentioned Agent is unavailable.' };
  const room = input && input.room && typeof input.room === 'object' ? input.room : {};
  const message = input && input.message && typeof input.message === 'object' ? input.message : {};
  const prompt = [
    'You were explicitly mentioned in Agent Bridge Chat Room "' + readString(room, 'name', readString(room, 'id', 'room')) + '".',
    'Respond to this room message only. Do not mention or route another Agent.',
    '',
    readString(message, 'body', '')
  ].join('\n');
  return await sendAutomationPrompt(agentId, prompt, automationConnection());
}

function buildAgentRuntimeInfo(record, diagnostics) {
  const existing = record && record.runtimeInfo && typeof record.runtimeInfo === 'object' && !Array.isArray(record.runtimeInfo)
    ? record.runtimeInfo
    : {};
  const source = diagnostics && typeof diagnostics === 'object' && !Array.isArray(diagnostics) ? diagnostics : {};
  const exitCode = typeof source.exitCode === 'number' ? source.exitCode : null;
  return Object.assign({}, existing, {
    provider: record ? record.provider : readString(source, 'providerId', ''),
    sessionId: record ? record.providerSessionId : readString(source, 'sessionId', ''),
    remoteSessionId: record ? record.remoteSessionId : readString(source, 'remoteSessionId', ''),
    runtimeMode: readString(source, 'runtimeMode', readString(existing, 'runtimeMode', 'oneshot')),
    interactiveReady: source.interactiveReady === true,
    sessionState: readString(source, 'sessionState', readString(existing, 'sessionState', '')),
    pid: typeof source.pid === 'number' ? source.pid : readNumber(existing, 'pid', 0),
    startedAt: typeof source.startedAt === 'number' ? source.startedAt : readNumber(existing, 'startedAt', 0),
    lastActivityAt: typeof source.lastActivityAt === 'number' ? source.lastActivityAt : readNumber(existing, 'lastActivityAt', 0),
    exitCode,
    lastError: readString(source, 'lastError', readString(existing, 'lastError', '')),
    recentOutputTail: readString(source, 'recentOutputTail', readString(existing, 'recentOutputTail', '')),
    runtimeFallbackReason: readString(source, 'runtimeFallbackReason', readString(existing, 'runtimeFallbackReason', ''))
  });
}

function refreshAgentRuntimeInfo(agentId, diagnostics) {
  const record = agentManager.find(agentId);
  if (!record) {
    return null;
  }
  let runtimeDiagnostics = diagnostics || null;
  if (!runtimeDiagnostics && record.providerSessionId.length > 0) {
    runtimeDiagnostics = registry.sessionRuntimeDiagnostics(record.providerSessionId, record.provider);
  }
  const runtimeInfo = buildAgentRuntimeInfo(record, runtimeDiagnostics);
  return agentManager.updateRuntimeInfo(agentId, runtimeInfo);
}

async function agentRuntimeStatusResult(agentId, attach, connection) {
  let record = agentManager.find(agentId);
  if (!record) {
    return {
      ok: false,
      code: 'agent_not_found',
      message: 'Agent not found.'
    };
  }
  if (attach) {
    const ensured = await ensureProviderSessionForAgent(agentId);
    if (!ensured.ok) {
      return ensured;
    }
    record = agentManager.find(agentId);
  }
  let diagnostics = null;
  if (record.providerSessionId.length > 0) {
    diagnostics = attach
      ? await registry.startInteractiveSession({
        providerId: record.provider,
        sessionId: record.providerSessionId,
        remoteSessionId: record.remoteSessionId,
        workspacePath: record.rootPath,
        cwd: record.rootPath,
        modelId: record.modelId
      }, (event) => sendObservedEvent(connection, event))
      : registry.sessionRuntimeDiagnostics(record.providerSessionId, record.provider);
  }
  const agent = refreshAgentRuntimeInfo(agentId, diagnostics) || agentManager.publicRecord(record);
  return {
    ok: true,
    agent,
    attached: record.providerSessionId.length > 0,
    runtime: buildAgentRuntimeInfo(record, diagnostics),
    recentOutputTail: diagnostics && typeof diagnostics.recentOutputTail === 'string' ? diagnostics.recentOutputTail : ''
  };
}

function resolveWorkspaceOpenTarget(payload) {
  const workspaceId = readString(payload, 'workspaceId', readString(payload, 'id', ''));
  const explicitPath = readString(payload, 'workspacePath', readString(payload, 'cwd', readString(payload, 'path', '')));
  if (explicitPath.length > 0) {
    return path.resolve(explicitPath);
  }
  if (workspaceId.length > 0) {
    const workspaces = workspaceRegistry.listWorkspaces({
      includeArchived: true
    });
    for (const workspace of workspaces) {
      if (workspace && workspace.workspaceId === workspaceId) {
        return path.resolve(readString(workspace, 'cwd', readString(workspace, 'workspacePath', '')));
      }
    }
  }
  return '';
}

function openWorkspaceFromPayload(payload) {
  const workspacePath = resolveWorkspaceOpenTarget(payload);
  if (workspacePath.length === 0) {
    return {
      code: 'workspace_open_invalid',
      message: 'Workspace id or path is required.'
    };
  }
  if (!fs.existsSync(workspacePath)) {
    return {
      code: 'workspace_open_missing',
      message: 'Workspace path does not exist.'
    };
  }
  const launcher = openFileCommandForPlatform(workspacePath, process.platform);
  const dryRun = readBooleanValue(payload, 'dryRun', false);
  if (!dryRun) {
    openFile(workspacePath);
  }
  return {
    workspacePath,
    dryRun,
    opened: !dryRun,
    command: launcher ? launcher.command : '',
    args: launcher ? launcher.args : [],
    updatedAt: Date.now()
  };
}

function gitDiffFingerprint(result) {
  if (!result || !Array.isArray(result.changes)) {
    return '';
  }
  const parts = [result.branchName || ''];
  for (const change of result.changes) {
    if (!change) {
      continue;
    }
    parts.push([
      change.path || '',
      change.oldPath || '',
      change.status || '',
      change.staged === true ? '1' : '0',
      String(change.additions || 0),
      String(change.deletions || 0)
    ].join(':'));
  }
  return parts.join('|');
}

function emptyGitDiffSummary() {
  return {
    branchName: '',
    changesCount: 0,
    changedFiles: 0,
    stagedCount: 0,
    unstagedCount: 0,
    additions: 0,
    deletions: 0,
    paths: []
  };
}

function gitDiffSummaryForResult(result) {
  if (result && result.diffSummary && typeof result.diffSummary === 'object' && !Array.isArray(result.diffSummary)) {
    return result.diffSummary;
  }
  if (!result || !Array.isArray(result.changes)) {
    return emptyGitDiffSummary();
  }
  const paths = [];
  let additions = 0;
  let deletions = 0;
  let stagedCount = 0;
  let unstagedCount = 0;
  let changedFiles = 0;
  for (const change of result.changes) {
    if (!change || typeof change !== 'object') {
      continue;
    }
    if (paths.length < 20 && typeof change.path === 'string' && change.path.length > 0) {
      paths.push(change.path);
    }
    additions += typeof change.additions === 'number' ? change.additions : 0;
    deletions += typeof change.deletions === 'number' ? change.deletions : 0;
    changedFiles += typeof change.changedFileCount === 'number' && change.changedFileCount > 0 ? Math.floor(change.changedFileCount) : 1;
    if (change.staged === true) {
      stagedCount += 1;
    } else {
      unstagedCount += 1;
    }
  }
  return {
    branchName: readString(result, 'branchName', ''),
    changesCount: result.changes.length,
    changedFiles,
    stagedCount,
    unstagedCount,
    additions,
    deletions,
    paths
  };
}

function gitDiffSubscriptionPayload(subscription, result) {
  const diffSummary = result ? gitDiffSummaryForResult(result) : (subscription.lastDiffSummary || emptyGitDiffSummary());
  return {
    subscriptionId: subscription.subscriptionId,
    sessionId: subscription.sessionId,
    workspaceId: subscription.workspaceId,
    workspacePath: result ? readString(result, 'workspacePath', '') : '',
    branchName: result ? readString(result, 'branchName', diffSummary.branchName || '') : (diffSummary.branchName || ''),
    changes: result && Array.isArray(result.changes) ? result.changes : [],
    commits: result && Array.isArray(result.commits) ? result.commits : [],
    status: subscription.status || (subscription.paused === true ? 'paused' : 'active'),
    subscribed: subscription.status !== 'removed',
    paused: subscription.paused === true,
    intervalMs: subscription.intervalMs || 0,
    lastSuccessAt: subscription.lastSuccessAt || 0,
    lastFailureAt: subscription.lastFailureAt || 0,
    lastError: subscription.lastError || '',
    backoffMs: subscription.backoffMs || 0,
    lastFingerprint: subscription.lastFingerprint || '',
    changesCount: diffSummary.changesCount || 0,
    changedFiles: diffSummary.changedFiles || 0,
    diffSummary,
    updatedAt: Date.now()
  };
}

async function sendGitDiffSubscriptionUpdate(connection, subscription, force) {
  if (subscription.paused === true) {
    subscription.status = 'paused';
    return null;
  }
  if (!force && subscription.nextPollAt && Date.now() < subscription.nextPollAt) {
    return null;
  }
  try {
    const result = await workspaceService.getChanges(subscription.payload);
    const fingerprint = gitDiffFingerprint(result);
    const now = Date.now();
    subscription.status = 'active';
    subscription.lastSuccessAt = now;
    subscription.lastError = '';
    subscription.backoffMs = 0;
    subscription.nextPollAt = 0;
    subscription.lastDiffSummary = gitDiffSummaryForResult(result);
    if (!force && fingerprint === subscription.lastFingerprint) {
      return result;
    }
    subscription.lastFingerprint = fingerprint;
    const payload = gitDiffSubscriptionPayload(subscription, result);
    connection.sendJson(makeEvent(EventType.WORKSPACE_DIFF_SUBSCRIPTION_UPDATED, subscription.sessionId, payload));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    subscription.status = 'error';
    subscription.lastError = message;
    subscription.backoffMs = subscription.backoffMs > 0
      ? Math.min(subscription.backoffMs * 2, GIT_DIFF_SUBSCRIPTION_MAX_MS)
      : GIT_DIFF_SUBSCRIPTION_MIN_MS;
    subscription.lastFailureAt = now;
    subscription.nextPollAt = now + subscription.backoffMs;
    requestLogger.warn('git.diff_subscription.failed', {
      subscriptionId: subscription.subscriptionId,
      sessionId: subscription.sessionId,
      error: message,
      backoffMs: subscription.backoffMs
    });
    connection.sendJson(makeEvent(EventType.WORKSPACE_DIFF_SUBSCRIPTION_UPDATED, subscription.sessionId, gitDiffSubscriptionPayload(subscription, null)));
    return null;
  }
  return null;
}

function clearGitDiffSubscription(connection, subscriptionId) {
  if (!connection || !connection.gitDiffSubscriptions) {
    return false;
  }
  const subscription = connection.gitDiffSubscriptions.get(subscriptionId);
  if (!subscription) {
    return false;
  }
  clearInterval(subscription.timer);
  connection.gitDiffSubscriptions.delete(subscriptionId);
  return true;
}

function publicGitDiffSubscription(subscription) {
  if (!subscription) {
    return {
      subscriptionId: '',
      subscribed: false,
      status: 'missing',
      paused: false,
      lastSuccessAt: 0,
      lastError: '',
      backoffMs: 0,
      lastFingerprint: '',
      changesCount: 0,
      diffSummary: emptyGitDiffSummary()
    };
  }
  return Object.assign(gitDiffSubscriptionPayload(subscription, null), {
    subscriptionId: subscription.subscriptionId,
    sessionId: subscription.sessionId,
    workspaceId: subscription.workspaceId,
    subscribed: true,
    status: subscription.status || (subscription.paused === true ? 'paused' : 'active'),
    paused: subscription.paused === true,
    intervalMs: subscription.intervalMs,
    lastSuccessAt: subscription.lastSuccessAt || 0,
    lastFailureAt: subscription.lastFailureAt || 0,
    lastError: subscription.lastError || '',
    backoffMs: subscription.backoffMs || 0
  });
}

function clearGitDiffSubscriptions(connection) {
  if (!connection || !connection.gitDiffSubscriptions) {
    return;
  }
  const subscriptionIds = Array.from(connection.gitDiffSubscriptions.keys());
  for (const subscriptionId of subscriptionIds) {
    clearGitDiffSubscription(connection, subscriptionId);
  }
}

async function subscribeWorkspaceGit(connection, payload) {
  const action = readString(payload, 'action', 'subscribe');
  const subscriptionId = readString(payload, 'subscriptionId', readString(payload, 'id', 'gds_' + crypto.randomBytes(8).toString('base64url')));
  const existing = connection && connection.gitDiffSubscriptions ? connection.gitDiffSubscriptions.get(subscriptionId) : null;
  if (action === 'unsubscribe' || readBooleanValue(payload, 'enabled', true) === false) {
    return {
      subscriptionId,
      subscribed: false,
      removed: clearGitDiffSubscription(connection, subscriptionId),
      status: 'removed',
      paused: false,
      lastSuccessAt: existing ? existing.lastSuccessAt || 0 : 0,
      lastError: existing ? existing.lastError || '' : '',
      backoffMs: existing ? existing.backoffMs || 0 : 0,
      lastFingerprint: existing ? existing.lastFingerprint || '' : '',
      changesCount: existing && existing.lastDiffSummary ? existing.lastDiffSummary.changesCount || 0 : 0,
      diffSummary: existing && existing.lastDiffSummary ? existing.lastDiffSummary : emptyGitDiffSummary()
    };
  }
  if (action === 'status') {
    const status = publicGitDiffSubscription(existing);
    status.subscriptionId = subscriptionId;
    return status;
  }
  if (action === 'pause' || action === 'resume') {
    if (!existing) {
      return {
        subscriptionId,
        subscribed: false,
        status: 'missing',
        paused: false,
        lastSuccessAt: 0,
        lastError: '',
        backoffMs: 0
      };
    }
    existing.paused = action === 'pause';
    existing.status = existing.paused ? 'paused' : 'active';
    if (!existing.paused) {
      existing.lastError = '';
      existing.nextPollAt = 0;
    }
    const status = publicGitDiffSubscription(existing);
    connection.sendJson(makeEvent(EventType.WORKSPACE_DIFF_SUBSCRIPTION_UPDATED, existing.sessionId, status));
    return status;
  }
  const sessionId = readString(payload, 'sessionId', '');
  if (sessionId.length === 0) {
    return {
      code: 'workspace_git_subscription_invalid',
      message: 'sessionId is required for git diff subscriptions.'
    };
  }
  const intervalMs = Math.max(
    GIT_DIFF_SUBSCRIPTION_MIN_MS,
    Math.min(GIT_DIFF_SUBSCRIPTION_MAX_MS, Math.floor(readNumber(payload, 'intervalMs', GIT_DIFF_SUBSCRIPTION_DEFAULT_MS)))
  );
  if (!connection.gitDiffSubscriptions) {
    connection.gitDiffSubscriptions = new Map();
  }
  clearGitDiffSubscription(connection, subscriptionId);
  const subscription = {
    subscriptionId,
    sessionId,
    workspaceId: readString(payload, 'workspaceId', ''),
    payload: Object.assign({}, payload),
    intervalMs,
    lastFingerprint: '',
    status: 'active',
    paused: false,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastError: '',
    backoffMs: 0,
    nextPollAt: 0,
    lastDiffSummary: emptyGitDiffSummary(),
    timer: null
  };
  subscription.timer = setInterval(() => {
    sendGitDiffSubscriptionUpdate(connection, subscription, false).catch((_error) => {});
  }, intervalMs);
  connection.gitDiffSubscriptions.set(subscriptionId, subscription);
  const initial = await sendGitDiffSubscriptionUpdate(connection, subscription, true);
  return Object.assign(publicGitDiffSubscription(subscription), {
    subscriptionId,
    subscribed: true,
    intervalMs,
    changes: initial ? initial.changes : [],
    branchName: initial ? initial.branchName : '',
    commits: initial ? initial.commits : [],
    diffSummary: initial ? gitDiffSummaryForResult(initial) : subscription.lastDiffSummary,
    changesCount: initial ? gitDiffSummaryForResult(initial).changesCount : 0,
    lastFingerprint: subscription.lastFingerprint || ''
  });
}

function fileOnlyCheckpointRestoreResult(record, checkpoint, fileSnapshotId, dryRun, fileRestore) {
  const restore = fileRestore && typeof fileRestore === 'object' && !Array.isArray(fileRestore) ? fileRestore : {};
  const filesRestored = typeof restore.files === 'boolean' ? restore.files : false;
  const fileRestoreStatus = readString(restore, 'status', dryRun ? 'dry_run' : '');
  const result = {
    agent: agentManager.publicRecord(record),
    checkpoint: checkpoint ? agentManager.publicCheckpoint(checkpoint) : null,
    dryRun,
    fileSnapshotStatus: fileSnapshotId.length > 0 ? 'captured' : 'not_found',
    fileSnapshotId,
    filesScanned: 0,
    filesCaptured: typeof restore.filesCaptured === 'number' ? restore.filesCaptured : 0,
    conflicts: Array.isArray(restore.conflicts) ? restore.conflicts : [],
    restoreBlocked: restore.restoreBlocked === true,
    preRestoreSnapshotId: readString(restore, 'preRestoreSnapshotId', fileSnapshotId),
    restorePlanId: readString(restore, 'restorePlanId', ''),
    manifestVerified: typeof restore.manifestVerified === 'boolean' ? restore.manifestVerified : false,
    filesSkipped: typeof restore.filesSkipped === 'number' ? restore.filesSkipped : 0,
    filesRestored: typeof restore.filesRestored === 'number' ? restore.filesRestored : 0,
    filesVerified: typeof restore.filesVerified === 'number' ? restore.filesVerified : 0,
    verifyErrors: Array.isArray(restore.verifyErrors) ? restore.verifyErrors : [],
    workspaceRoot: readString(restore, 'workspaceRoot', checkpoint ? checkpoint.workspaceRoot : ''),
    filePolicy: restore.filePolicy && typeof restore.filePolicy === 'object' && !Array.isArray(restore.filePolicy) ? restore.filePolicy : {},
    skippedReasons: Array.isArray(restore.skippedReasons) ? restore.skippedReasons : [],
    runtimeRestored: false,
    runtimeRestoreReason: readString(restore, 'runtimeRestoreReason', 'provider_runtime_state_is_recorded_not_rewound'),
    fileRestore: restore,
    restored: {
      conversation: false,
      files: filesRestored,
      reason: fileRestoreStatus.length > 0 ? fileRestoreStatus : 'file_restore'
    }
  };
  result.layers = {
    files: {
      requested: true,
      status: fileRestoreStatus.length > 0 ? fileRestoreStatus : (dryRun ? 'ready' : 'unavailable'),
      restored: filesRestored,
      reason: fileRestoreStatus.length > 0 ? fileRestoreStatus : 'pre_restore_file_snapshot'
    },
    timeline: {
      requested: false,
      status: 'not_requested',
      restored: false,
      reason: 'pre_restore_snapshot_contains_files_only'
    },
    runtime: {
      requested: false,
      status: 'not_requested',
      restored: false,
      reason: 'pre_restore_snapshot_contains_files_only'
    },
    terminal: {
      requested: false,
      status: 'not_captured',
      restored: false,
      reason: 'terminal_process_state_is_not_checkpointed'
    }
  };
  return result;
}

async function createProviderSessionForAgent(payload) {
  const providerId = readString(payload, 'providerId', 'mock');
  const provider = registry.resolve(providerId);
  const session = await provider.createSession(payload);
  const agent = agentManager.upsertFromSession(session, payload);
  requestLogger.info('agent.created', {
    providerId,
    agentId: agent.id,
    sessionId: session.sessionId,
    workspacePath: readString(payload, 'workspacePath', readString(payload, 'cwd', '')),
    workspaceId: agent.workspaceId
  });
  return { provider, session, agent };
}

async function ensureProviderSessionForAgent(agentId) {
  const record = agentManager.find(agentId);
  if (!record) {
    return { ok: false, code: 'agent_not_found', message: 'Agent not found.' };
  }
  const scope = agentManager.resourceScope(agentId, { write: true });
  if (!scope.ok) {
    return scope;
  }
  if (record.providerSessionId.length > 0) {
    let existing = registry.findSession(record.providerSessionId);
    if (!existing) {
      // The agent record survived a Bridge restart but the provider runtime
      // session did not (in-memory providers). Rehydrate it with the persisted
      // id instead of leaving message.send/session.messages with session_not_found.
      try {
        const provider = registry.resolve(record.provider);
        if (provider && typeof provider.ensureSession === 'function') {
          existing = provider.ensureSession({
            sessionId: record.providerSessionId,
            remoteSessionId: record.remoteSessionId,
            workspacePath: record.rootPath,
            workspaceTitle: record.title,
            modelId: record.modelId,
            speedMode: record.lastModeId,
            reasoningMode: record.thinkingOptionId
          });
        }
      } catch (_error) {
        existing = null;
      }
    }
    return { ok: true, created: false, agent: agentManager.publicRecord(record), session: existing };
  }
  const provider = registry.resolve(record.provider);
  const payload = {
    agentId: record.id,
    providerId: record.provider,
    workspacePath: record.rootPath,
    cwd: record.rootPath,
    workspaceId: record.workspaceId,
    workspaceTitle: record.title,
    modelId: record.modelId,
    speedMode: record.lastModeId,
    modeId: record.lastModeId,
    reasoningMode: record.thinkingOptionId,
    thinkingOptionId: record.thinkingOptionId,
    permissionPolicyId: readString(record.executionPolicy, 'permissionPolicyId', ''),
    sandboxPolicyId: readString(record.executionPolicy, 'sandboxPolicyId', ''),
    runtimeOwnerId: record.runtimeOwnerId,
    forkContext: record.forkContext
  };
  const session = await provider.createSession(payload);
  const actualWorkspacePath = path.resolve(readString(session, 'workspacePath', record.rootPath));
  if (actualWorkspacePath !== record.rootPath) {
    try {
      await registry.archiveSession({
        providerId: record.provider,
        sessionId: readString(session, 'sessionId', ''),
        remoteSessionId: readString(session, 'remoteSessionId', ''),
        agentId: record.id
      }, () => {});
    } catch (_error) {
      // The workspace mismatch is authoritative even if provider cleanup fails.
    }
    return { ok: false, code: 'provider_workspace_mismatch', message: 'Provider session workspace does not match the Agent resource scope.' };
  }
  const agent = agentManager.bindSession(agentId, session);
  return { ok: true, created: true, provider, session, agent };
}

async function sendMessageToAgent(agentId, payload, connection) {
  let routed = agentManager.providerPayloadForAgent(agentId, payload);
  if (!routed) {
    return { ok: false, code: 'agent_not_found', message: 'Agent not found.' };
  }
  if (routed.agent.providerSessionId.length === 0) {
    const ensured = await ensureProviderSessionForAgent(agentId);
    if (!ensured.ok) {
      return ensured;
    }
  }
  routed = agentManager.providerMessagePayloadForAgent(agentId, payload);
  if (routed.agent.lastStatus === 'closed' || routed.agent.archivedAt.length > 0) {
    return { ok: false, code: 'agent_closed', message: 'Agent is closed.' };
  }
  const match = registry.findSession(routed.agent.providerSessionId);
  const provider = match ? match.provider : registry.resolve(routed.agent.provider);
  const agent = agentManager.appendUserMessageByAgent(agentId, routed.payload);
  if (agent) {
    sendAgentLifecycleEvents(connection, routed.agent.providerSessionId, agent, false);
  }
  try {
    await provider.sendMessage(routed.payload, (event) => sendObservedEvent(connection, event));
  } catch (error) {
    const code = error && typeof error.code === 'string' && error.code.length > 0 ? error.code : 'request_failed';
    const message = error instanceof Error ? error.message : String(error);
    const runtimeDiagnostics = registry.sessionRuntimeDiagnostics(routed.agent.providerSessionId, routed.agent.provider);
    const updatedAgent = refreshAgentRuntimeInfo(agentId, runtimeDiagnostics) || agent;
    return { ok: false, code, message, agent: updatedAgent };
  }
  const runtimeDiagnostics = registry.sessionRuntimeDiagnostics(routed.agent.providerSessionId, routed.agent.provider);
  const updatedAgent = refreshAgentRuntimeInfo(agentId, runtimeDiagnostics) || agent;
  return { ok: true, agent: updatedAgent };
}

function serviceProxyFailureStatus(category) {
  if (category === 'service_not_found') return 404;
  if (category === 'service_id_invalid' || category === 'service_proxy_path_invalid' || category === 'service_websocket_handshake_invalid') return 400;
  if (category === 'service_origin_not_allowed' || category === 'service_owner_scope_required') return 403;
  if (category === 'service_proxy_timeout') return 504;
  if (category === 'service_proxy_failed') return 502;
  return 409;
}

function auditServiceProxy(req, route, result, transport) {
  recordSecurityAudit({
    category: 'service_proxy',
    action: transport === 'websocket' ? 'workspace.service.proxy_websocket' : 'workspace.service.proxy',
    severity: result.ok ? 'info' : 'warning',
    status: result.ok ? 'accepted' : 'rejected',
    reason: result.ok ? 'service_proxy_started' : (result.failureCategory || 'service_proxy_rejected'),
    message: result.ok ? 'Authenticated workspace service proxy request accepted.' : (result.message || 'Service proxy request was rejected.'),
    remoteAddress: remoteAddressFromRequest(req),
    host: normalizeHostHeader(req && req.headers ? req.headers.host : ''),
    serviceId: route && typeof route.serviceId === 'string' ? route.serviceId : ''
  });
}

function serviceAccessContextForConnection(connection) {
  const source = connection && typeof connection === 'object' ? connection : {};
  let host = normalizeAccessHost(readString(source, 'requestHost', ''));
  let protocol = readString(source, 'requestProtocol', '');
  const requestedEndpoint = readString(source, 'requestedEndpoint', '');
  if (requestedEndpoint.length > 0) {
    try {
      const parsed = new URL(requestedEndpoint);
      const endpointHost = normalizeAccessHost(parsed.host);
      if (!host) host = endpointHost;
      if (host === endpointHost && !protocol) {
        if (parsed.protocol === 'wss:' || parsed.protocol === 'https:') protocol = 'https:';
        else if (parsed.protocol === 'ws:' || parsed.protocol === 'http:') protocol = 'http:';
      }
    } catch (_error) {
      // The caller receives service_access_host_invalid from the manager.
    }
  }
  if (protocol !== 'https:' && protocol !== 'http:') protocol = '';
  return { host, origin: protocol && host ? protocol + '//' + host : '' };
}

function serviceAccessOriginAllowed(req) {
  const origin = req && req.headers && typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin.length === 0) return true;
  try {
    const parsed = new URL(origin);
    const expectedProtocol = req && req.socket && req.socket.encrypted === true ? 'https:' : 'http:';
    return parsed.protocol === expectedProtocol && normalizeAccessHost(parsed.host) === normalizeAccessHost(req.headers.host || '');
  } catch (_error) {
    return false;
  }
}

async function authorizeServiceProxyRequest(req, reqUrl, route) {
  const sessionId = readCookieValue(req && req.headers ? req.headers.cookie : '', SERVICE_SESSION_COOKIE);
  const sessionAuthorization = serviceAccessTicketManager.authorizeSession(sessionId, {
    serviceId: route && typeof route.serviceId === 'string' ? route.serviceId : '',
    host: req && req.headers ? req.headers.host : ''
  });
  if (sessionAuthorization.ok) {
    if (!serviceAccessOriginAllowed(req)) {
      return {
        ok: false,
        failureCategory: 'service_origin_not_allowed',
        message: 'Request origin does not exactly match the Service proxy origin.',
        ownerAgentId: '',
        allowOwner: false
      };
    }
    return {
      ok: true,
      failureCategory: '',
      message: '',
      ownerAgentId: sessionAuthorization.ownerAgentId,
      allowOwner: true
    };
  }
  const authorization = await authorizeRequest(req, reqUrl);
  return {
    ok: authorization.ok === true,
    failureCategory: authorization.ok === true ? '' : (sessionId ? sessionAuthorization.failureCategory : (authorization.failureCategory || 'unauthorized')),
    message: authorization.ok === true ? '' : (sessionId ? sessionAuthorization.message : (authorization.message || 'A valid Bridge credential is required.')),
    ownerAgentId: route && typeof route.ownerAgentId === 'string' ? route.ownerAgentId : '',
    allowOwner: false
  };
}

function serviceAccessRedirectLocation(reqUrl) {
  const search = new URLSearchParams(reqUrl.searchParams);
  search.delete('accessTicket');
  search.delete('serviceTicket');
  search.delete('token');
  search.delete('ownerAgentId');
  return reqUrl.pathname + (search.toString().length > 0 ? '?' + search.toString() : '');
}

async function handlePathServiceHttpRequest(req, reqUrl, res, route) {
  if (route.ok === false) {
    const rejected = { ok: false, failureCategory: route.failureCategory, message: route.message };
    auditServiceProxy(req, route, rejected, 'http');
    sendJson(res, serviceProxyFailureStatus(rejected.failureCategory), { ok: false, error: { code: rejected.failureCategory, message: rejected.message } });
    return;
  }
  if (!serviceAccessOriginAllowed(req)) {
    const rejected = { ok: false, failureCategory: 'service_origin_not_allowed', message: 'Request origin does not match the service proxy Host.' };
    auditServiceProxy(req, route, rejected, 'http');
    sendJson(res, 403, { ok: false, error: { code: rejected.failureCategory, message: rejected.message } });
    return;
  }
  const accessTicket = reqUrl.searchParams.get('accessTicket') || '';
  if (accessTicket.length > 0) {
    const exchanged = serviceAccessTicketManager.exchangeTicket(accessTicket, {
      serviceId: route.serviceId,
      host: req && req.headers ? req.headers.host : ''
    });
    auditServiceProxy(req, route, exchanged, 'http');
    if (!exchanged.ok) {
      const status = exchanged.failureCategory === 'service_access_scope_mismatch' ? 403 : 401;
      sendJson(res, status, { ok: false, error: { code: exchanged.failureCategory, message: exchanged.message } });
      return;
    }
    const cookie = serviceSessionCookie(
      exchanged.sessionId,
      route.serviceId,
      exchanged.maxAgeSec,
      req && req.socket && req.socket.encrypted === true
    );
    res.writeHead(303, {
      Location: serviceAccessRedirectLocation(reqUrl),
      'Set-Cookie': cookie,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': '0'
    });
    res.end();
    return;
  }
  const authorization = await authorizeServiceProxyRequest(req, reqUrl, route);
  if (!authorization.ok) {
    auditServiceProxy(req, route, authorization, 'http');
    sendJson(res, 401, { ok: false, error: { code: 'unauthorized', message: authorization.message } });
    return;
  }
  const proxyResult = serviceManager.proxy(
    req,
    res,
    route.serviceId,
    route.upstreamPath,
    authorization.ownerAgentId,
    authorization.allowOwner
  );
  auditServiceProxy(req, route, proxyResult, 'http');
  if (!proxyResult.ok) {
    sendJson(res, serviceProxyFailureStatus(proxyResult.failureCategory), {
      ok: false,
      error: {
        code: proxyResult.failureCategory || 'service_proxy_rejected',
        message: proxyResult.message || 'Service proxy request was rejected.'
      }
    });
  }
}

async function handleDomainServiceHttpRequest(req, reqUrl, res, route) {
  if (!serviceProxyOriginAllowed(req)) {
    const rejected = { ok: false, failureCategory: 'service_origin_not_allowed', message: 'Request origin does not match the service domain.' };
    auditServiceProxy(req, route, rejected, 'http');
    sendJson(res, 403, { ok: false, error: { code: rejected.failureCategory, message: rejected.message } });
    return;
  }
  const authorization = await authorizeServiceProxyRequest(req, reqUrl, route);
  if (!authorization.ok) {
    auditServiceProxy(req, route, authorization, 'http');
    sendJson(res, 401, { ok: false, error: { code: 'unauthorized', message: authorization.message } });
    return;
  }
  const proxyResult = serviceManager.proxy(
    req,
    res,
    route.serviceId,
    route.upstreamPath,
    authorization.ownerAgentId,
    authorization.allowOwner
  );
  auditServiceProxy(req, route, proxyResult, 'http');
  if (!proxyResult.ok) {
    sendJson(res, serviceProxyFailureStatus(proxyResult.failureCategory), {
      ok: false,
      error: {
        code: proxyResult.failureCategory || 'service_proxy_rejected',
        message: proxyResult.message || 'Service proxy request was rejected.'
      }
    });
  }
}

async function handleHttpRequest(req, res) {
  const reqUrl = new URL(req.url || '/', 'http://bridge.invalid');
  const domainResolution = serviceManager.resolveProxyDomain(req && req.headers ? req.headers.host : '');
  if (domainResolution.matched) {
    const domainRoute = resolveServiceProxyRoute(reqUrl, req.headers.host || '', serviceManager);
    await handleDomainServiceHttpRequest(req, reqUrl, res, domainRoute);
    return;
  }
  if (serviceManager.isServiceDomainCandidate(req && req.headers ? req.headers.host : '')) {
    sendJson(res, 404, { ok: false, error: { code: 'service_domain_not_found', message: 'Workspace service domain was not found.' } });
    return;
  }
  if (!isHostAllowed(req)) {
    recordSecurityAudit({
      category: 'host',
      action: 'http.host_rejected',
      severity: 'warning',
      status: 'rejected',
      reason: 'host_not_allowed',
      message: 'HTTP request host is not in the Bridge allowlist.',
      remoteAddress: remoteAddressFromRequest(req),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    sendJson(res, 403, {
      ok: false,
      error: {
        code: 'host_not_allowed',
        message: 'Request host is not in the Bridge allowlist.'
      }
    });
    return;
  }

  const pathServiceRoute = resolveServiceProxyRoute(reqUrl, req && req.headers ? req.headers.host : '', serviceManager);
  if (pathServiceRoute.matched) {
    await handlePathServiceHttpRequest(req, reqUrl, res, pathServiceRoute);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const asset = webAssetPath(reqUrl.pathname);
    if (asset.length > 0 && fs.existsSync(asset)) {
      sendStaticFile(res, asset, webContentType(asset), path.basename(asset) === 'index.html' ? 'no-store' : 'public, max-age=300');
      return;
    }
  }

  if (req.method === 'POST' && reqUrl.pathname === '/web/auth/session') {
    if (!webOriginAllowed(req)) {
      sendJson(res, 403, { ok: false, error: { code: 'web_origin_not_allowed', message: 'Browser origin is not allowed.' } });
      return;
    }
    const authorization = webAuthSessionAuthorized(req) ? { ok: true } : await authorizeRequest(req, reqUrl);
    if (!authorization.ok) {
      sendJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'A valid Bridge credential is required.' } });
      return;
    }
    const session = issueWebAuthSession(req);
    sendJson(res, 200, { ok: true, ticket: issueWebAuthTicket(req), expiresInMs: WEB_TICKET_TTL_MS, sessionExpiresInMs: WEB_SESSION_TTL_MS }, { 'Set-Cookie': webAuthSessionCookie(session, WEB_SESSION_TTL_MS, req) });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/web/auth/logout') {
    if (!webOriginAllowed(req)) {
      sendJson(res, 403, { ok: false, error: { code: 'web_origin_not_allowed', message: 'Browser origin is not allowed.' } });
      return;
    }
    sendJson(res, 200, { ok: true, loggedOut: true }, { 'Set-Cookie': revokeWebAuthSession(req) });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/health') {
    const proof = signConnectionChallenge(config.profile, endpointForRequest(req, reqUrl), '', '');
    sendJson(res, 200, {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      preferredProtocolVersion: PROTOCOL_VERSION_V2,
      supportedProtocolVersions: config.supportedProtocolVersions,
      serverId: daemonStore.serverId,
      hostname: os.hostname(),
      version: config.version,
      features: buildFeatureFlags(),
      deviceIdentity: config.deviceIdentity,
      keyFingerprint: config.deviceIdentity.publicKeyFingerprint,
      serverInfo: buildServerInfoPayload(proof),
      uptimeSec: Math.floor(process.uptime())
    });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/rpc') {
    await handleRpcHttpRequest(req, reqUrl, res);
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/terminal-activity') {
    // Hook-style activity reports from processes running inside bridge
    // terminals (e.g. agent CLIs). Accepts either the scoped activity token
    // injected into terminal environments or the configured Bridge credential.
    const activityHeader = typeof req.headers['x-activity-token'] === 'string' ? req.headers['x-activity-token'] : '';
    const activityTokenAuthorized = terminalManager.isActivityTokenValid(activityHeader);
    const activityAuthorization = activityTokenAuthorized
      ? { ok: true, failureCategory: '', message: '' }
      : await authorizeRequest(req, reqUrl);
    if (!activityAuthorization.ok) {
      recordSecurityAudit({
        category: 'auth',
        action: 'terminal_activity.unauthorized',
        severity: 'warning',
        status: 'rejected',
        reason: activityAuthorization.failureCategory || 'unauthorized',
        message: 'Terminal activity request rejected because its Bridge/activity credential was invalid.',
        remoteAddress: remoteAddressFromRequest(req),
        host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
      });
      sendJson(res, 401, {
        ok: false,
        error: {
          code: 'unauthorized',
          message: activityAuthorization.message || 'A valid Bridge or activity credential is required.'
        }
      });
      return;
    }
    try {
      const body = await readRequestBody(req);
      const result = terminalManager.reportActivity(body && typeof body === 'object' ? body : {});
      if (result && typeof result.code === 'string' && result.code.length > 0) {
        sendJson(res, 404, {
          ok: false,
          error: {
            code: result.code,
            message: typeof result.message === 'string' ? result.message : 'Terminal not found.'
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        terminal: result.terminal
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  const authorization = await authorizeRequest(req, reqUrl);
  if (!authorization.ok) {
    requestLogger.warn('http.unauthorized', {
      method: req.method || 'GET',
      path: reqUrl.pathname,
      remote: remoteAddressFromRequest(req)
    });
    recordSecurityAudit({
      category: 'auth',
      action: 'http.unauthorized',
      severity: 'warning',
      status: 'rejected',
      reason: authorization.failureCategory || 'unauthorized',
      message: 'HTTP request rejected because its Bridge credential was missing or invalid.',
      remoteAddress: remoteAddressFromRequest(req),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    sendJson(res, 401, {
      ok: false,
      error: {
        code: 'unauthorized',
        message: authorization.message || 'A valid Bridge credential is required.'
      }
    });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/capabilities') {
    sendJson(
      res,
      200,
      await buildCapabilities(
        endpointForRequest(req, reqUrl),
        reqUrl.searchParams.get('clientId') || '',
        reqUrl.searchParams.get('appNonce') || '',
        {
          appVersion: reqUrl.searchParams.get('appVersion') || '',
          protocolVersion: reqUrl.searchParams.get('protocolVersion') || ''
        }
      )
    );
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/server-info') {
    const proof = signConnectionChallenge(
      config.profile,
      endpointForRequest(req, reqUrl),
      reqUrl.searchParams.get('clientId') || '',
      reqUrl.searchParams.get('appNonce') || ''
    );
    sendJson(res, 200, {
      protocolVersion: PROTOCOL_VERSION_V2,
      serverInfo: buildServerInfoPayload(proof, {
        appVersion: reqUrl.searchParams.get('appVersion') || '',
        protocolVersion: reqUrl.searchParams.get('protocolVersion') || ''
      })
    });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/sessions') {
    const providerId = reqUrl.searchParams.get('providerId') || '';
    sendJson(res, 200, {
      protocolVersion: PROTOCOL_VERSION,
      sessions: await registry.listSessions(providerId)
    });
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/session-messages') {
    const sessionId = reqUrl.searchParams.get('sessionId') || '';
    try {
      const messages = await registry.listSessionMessages(sessionId);
      const toolCalls = await registry.listSessionToolCalls(sessionId);
      sendJson(res, 200, {
        protocolVersion: PROTOCOL_VERSION,
        sessionId,
        messages,
        toolCalls
      });
    } catch (error) {
      sendJson(res, 404, {
        ok: false,
        error: {
          code: 'session_not_found',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/preview') {
    const sessionId = reqUrl.searchParams.get('sessionId') || '';
    const path = reqUrl.searchParams.get('path') || '';
    try {
      const match = registry.findSession(sessionId);
      if (!match) {
        sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found.' } });
        return;
      }
      const preview = await match.provider.getPreview({ sessionId, path });
      sendJson(res, 200, preview);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'preview_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname.startsWith('/download/')) {
    const token = decodeURIComponent(reqUrl.pathname.substring('/download/'.length));
    const item = workspaceService.consumeDownloadToken(token);
    if (!item) {
      sendJson(res, 404, {
        ok: false,
        error: {
          code: 'download_not_found',
          message: 'Download token is invalid or expired.'
        }
      });
      return;
    }
    try {
      sendFileDownload(res, item);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'download_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  if (reqUrl.pathname === '/opencode' || reqUrl.pathname.startsWith('/opencode/')) {
    const path = reqUrl.pathname === '/opencode' ? '/' : reqUrl.pathname.substring('/opencode'.length);
    try {
      const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readRequestBody(req);
      const result = await registry.proxyOpenCodeRequest({
        method: req.method || 'GET',
        path,
        query: queryObjectFromUrl(reqUrl),
        body,
        accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json'
      });
      sendJson(res, 200, {
        protocolVersion: PROTOCOL_VERSION,
        providerId: 'opencode',
        result
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: {
          code: 'opencode_request_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: {
      code: 'not_found',
      message: 'Route not found.'
    }
  });
}

async function handleClientMessage(rawText, connection) {
  const parsed = parseClientMessage(rawText);
  if (!parsed.ok) {
    connection.sendJson(makeErrorResponse('', 'invalid_json', parsed.error));
    return;
  }

  const message = parsed.value;
  const id = typeof message.id === 'string' ? message.id : '';
  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};

  try {
    if (message.type === RequestType.HELLO) {
      const endpoint = readString(payload, 'endpoint', connection.requestedEndpoint || '');
      const clientId = readString(payload, 'clientId', connection.clientId || '');
      const appNonce = readString(payload, 'appNonce', connection.appNonce || '');
      connection.clientHello = payload;
      const capabilities = await buildCapabilities(endpoint, clientId, appNonce, payload);
      connection.sendJson(makeResponse(id, {
        accepted: true,
        serverInfo: capabilities.serverInfo
      }));
      connection.sendJson(makeEvent(EventType.SERVER_INFO, '', {
        serverInfo: capabilities.serverInfo
      }));
      return;
    }

    if (message.type === RequestType.APP_PING) {
      connection.sendJson({
        id,
        type: 'pong',
        ok: true,
        payload: {
          now: Date.now(),
          serverId: daemonStore.serverId
        },
        createdAt: Date.now()
      });
      return;
    }

    if (message.type === RequestType.CAPABILITIES_GET) {
      connection.sendJson(makeResponse(id, await buildCapabilities(
        connection.requestedEndpoint || '',
        connection.clientId || '',
        connection.appNonce || '',
        connection.clientHello || {}
      )));
      return;
    }

    if (message.type === RequestType.SERVER_INFO_GET) {
      const endpoint = readString(payload, 'endpoint', connection.requestedEndpoint || '');
      const clientId = readString(payload, 'clientId', connection.clientId || '');
      const appNonce = readString(payload, 'appNonce', connection.appNonce || '');
      const capabilities = await buildCapabilities(endpoint, clientId, appNonce, Object.assign({}, connection.clientHello || {}, payload));
      connection.sendJson(makeResponse(id, {
        serverInfo: capabilities.serverInfo
      }));
      return;
    }

    if (message.type === RequestType.PROVIDER_CATALOG) {
      connection.sendJson(makeResponse(id, await providerCatalog.fetch(payload)));
      return;
    }

    if (message.type === RequestType.PROVIDER_CATALOG_REFRESH) {
      const catalog = await providerCatalog.refresh(payload);
      connection.sendJson(makeResponse(id, catalog));
      connection.sendJson(makeEvent(EventType.PROVIDER_CATALOG_UPDATED, '', catalog));
      return;
    }

    if (message.type === RequestType.PROVIDER_PROFILE_LIST) {
      connection.sendJson(makeResponse(id, listProviderProfiles()));
      return;
    }

    if (message.type === RequestType.PROVIDER_PROFILE_UPSERT) {
      const result = upsertProviderProfile(payload);
      if (result.code) {
        sendManagerResponse(connection, id, result);
        return;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
      connection.sendJson(makeEvent(EventType.PROVIDER_CATALOG_UPDATED, '', {
        cacheStatus: 'invalidated',
        reason: result.catalogRefreshReason,
        catalogRefreshReason: result.catalogRefreshReason,
        affectedProfileIds: result.affectedProfileIds,
        affectedRuntimeProviderIds: result.affectedRuntimeProviderIds,
        updatedAt: Date.now()
      }));
      return;
    }

    if (message.type === RequestType.PROVIDER_PROFILE_DELETE) {
      const result = deleteProviderProfile(payload);
      if (result.code) {
        sendManagerResponse(connection, id, result);
        return;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
      connection.sendJson(makeEvent(EventType.PROVIDER_CATALOG_UPDATED, '', {
        cacheStatus: 'invalidated',
        reason: result.catalogRefreshReason,
        catalogRefreshReason: result.catalogRefreshReason,
        affectedProfileIds: result.affectedProfileIds,
        affectedRuntimeProviderIds: result.affectedRuntimeProviderIds,
        updatedAt: Date.now()
      }));
      return;
    }

    if (message.type === RequestType.PROVIDER_PROFILE_TEST) {
      connection.sendJson(makeResponse(id, await testProviderProfile(payload)));
      return;
    }

    if (message.type === RequestType.PROVIDER_ACP_DISCOVER) {
      connection.sendJson(makeResponse(id, discoverAcpProviders(payload)));
      return;
    }

    if (message.type === RequestType.PROVIDER_ACP_IMPORT) {
      const result = importAcpProviders(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
        connection.sendJson(makeEvent(EventType.PROVIDER_CATALOG_UPDATED, '', {
          cacheStatus: 'invalidated',
          reason: result.catalogRefreshReason,
          catalogRefreshReason: result.catalogRefreshReason,
          affectedProfileIds: result.affectedProfileIds,
          affectedRuntimeProviderIds: result.affectedRuntimeProviderIds,
          validationReport: result.validationReport,
          updatedAt: Date.now()
        }));
      }
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_LIST) {
      connection.sendJson(makeResponse(id, providerDirectoryManager.list(payload)));
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_STATUS) {
      connection.sendJson(makeResponse(id, providerDirectoryManager.status(payload)));
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_REFRESH) {
      const result = await providerDirectoryManager.refresh(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true) {
        connection.sendJson(makeEvent(EventType.PROVIDER_DIRECTORY_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_INSTALL) {
      const result = await providerDirectoryManager.install(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true && result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.PROVIDER_DIRECTORY_UPDATED, '', result));
        connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_ROLLBACK) {
      const result = await providerDirectoryManager.rollback(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true && result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.PROVIDER_DIRECTORY_UPDATED, '', result));
        connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.PROVIDER_DIRECTORY_REMOVE) {
      const result = providerDirectoryManager.remove(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true && result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.PROVIDER_DIRECTORY_UPDATED, '', result));
        connection.sendJson(makeEvent(EventType.PROVIDER_PROFILE_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.AGENT_LIST) {
      connection.sendJson(makeResponse(id, agentManager.listResult(payload)));
      return;
    }

    if (message.type === RequestType.AGENT_CREATE) {
      const result = await createProviderSessionForAgent(payload);
      connection.sendJson(makeResponse(id, {
        session: result.session,
        agent: result.agent
      }));
      connection.sendJson(makeEvent(EventType.SESSION_CREATED, result.session.sessionId, { session: result.session }));
      sendAgentLifecycleEvents(connection, result.session.sessionId, result.agent, true);
      return;
    }

    if (message.type === RequestType.AGENT_RUN) {
      let agentId = readString(payload, 'agentId', '');
      let session = null;
      let created = false;
      if (agentId.length === 0) {
        const result = await createProviderSessionForAgent(payload);
        agentId = result.agent.id;
        session = result.session;
        created = true;
        connection.sendJson(makeEvent(EventType.SESSION_CREATED, result.session.sessionId, { session: result.session }));
        sendAgentLifecycleEvents(connection, result.session.sessionId, result.agent, true);
      }
      const text = readString(payload, 'text', readString(payload, 'message', ''));
      if (text.length === 0) {
        let agent = agentId.length > 0 ? agentManager.resume(agentId) : null;
        if (!agent) {
          connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
          return;
        }
        if (session) {
          const statusResult = await agentRuntimeStatusResult(agentId, true, connection);
          if (statusResult.ok) {
            agent = statusResult.agent;
          }
        }
        connection.sendJson(makeResponse(id, { accepted: true, agent, session, created }));
        sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
        return;
      }
      const sendResult = await sendMessageToAgent(agentId, Object.assign({}, payload, { text }), connection);
      if (!sendResult.ok) {
        connection.sendJson(makeErrorResponse(id, sendResult.code, sendResult.message));
        return;
      }
      connection.sendJson(makeResponse(id, { accepted: true, agentId, session, created, agent: sendResult.agent }));
      return;
    }

    if (message.type === RequestType.AGENT_STATUS || message.type === RequestType.AGENT_ATTACH) {
      const agentId = readString(payload, 'agentId', '');
      const statusResult = await agentRuntimeStatusResult(agentId, message.type === RequestType.AGENT_ATTACH, connection);
      if (!statusResult.ok) {
        connection.sendJson(makeErrorResponse(id, statusResult.code, statusResult.message));
        return;
      }
      connection.sendJson(makeResponse(id, {
        agent: statusResult.agent,
        attached: statusResult.attached,
        runtime: statusResult.runtime,
        recentOutputTail: statusResult.recentOutputTail
      }));
      sendAgentLifecycleEvents(connection, statusResult.agent.providerSessionId, statusResult.agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_SEND) {
      const agentId = readString(payload, 'agentId', '');
      const connectionHostProfileId = readString(connection.clientHello || {}, 'hostProfileId', '');
      if (connectionHostProfileId) payload.hostProfileId = connectionHostProfileId;
      const composerValidation = sanitizeComposerTokens(payload);
      if (!composerValidation.ok) {
        connection.sendJson(makeErrorResponse(id, composerValidation.failureCategory, composerValidation.message));
        return;
      }
      payload.composerTokens = composerValidation.tokens;
      const sendResult = await sendMessageToAgent(agentId, payload, connection);
      if (!sendResult.ok) {
        connection.sendJson(makeErrorResponse(id, sendResult.code, sendResult.message));
        return;
      }
      connection.sendJson(makeResponse(id, { accepted: true, agent: sendResult.agent }));
      return;
    }

    if (message.type === RequestType.AGENT_STOP) {
      const agentId = readString(payload, 'agentId', '');
      const routed = agentManager.providerPayloadForAgent(agentId, payload);
      if (!routed) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      let abortResult = {
        status: 'not_requested',
        agentId
      };
      if (routed.agent.providerSessionId.length > 0) {
        abortResult = await registry.abortSession(routed.payload, (event) => sendObservedEvent(connection, event));
      }
      const agent = agentManager.stop(agentId, abortResult);
      connection.sendJson(makeResponse(id, { accepted: true, result: abortResult, agent }));
      sendAgentLifecycleEvents(connection, routed.agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_RESUME) {
      const agentId = readString(payload, 'agentId', '');
      const agent = agentManager.resume(agentId);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      const timeline = agentManager.fetchTimeline({
        agentId,
        cursor: readString(payload, 'cursor', ''),
        direction: 'after',
        limit: 200
      });
      connection.sendJson(makeResponse(id, { agent, timeline }));
      sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_DELETE) {
      const agentId = readString(payload, 'agentId', '');
      const agent = agentManager.delete(agentId);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, { agent }));
      connection.sendJson(makeEvent(EventType.AGENT_DELETED, agent.providerSessionId, { agentId, agent }));
      sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_UPDATE) {
      const agentId = readString(payload, 'agentId', '');
      const agent = agentManager.update(agentId, payload);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, { agent }));
      sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_MODE_SET) {
      const agentId = readString(payload, 'agentId', '');
      const modeId = readString(payload, 'modeId', readString(payload, 'speedMode', ''));
      const thinkingOptionId = readString(payload, 'thinkingOptionId', readString(payload, 'reasoningMode', ''));
      const agent = agentManager.setMode(agentId, modeId, thinkingOptionId);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, { agent }));
      sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.AGENT_MODEL_SET) {
      const agentId = readString(payload, 'agentId', '');
      const modelId = readString(payload, 'modelId', '');
      const agent = agentManager.setModel(agentId, modelId);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, { agent }));
      sendAgentLifecycleEvents(connection, agent.providerSessionId, agent, false);
      return;
    }

    if (message.type === RequestType.TIMELINE_FETCH) {
      connection.sendJson(makeResponse(id, agentManager.fetchTimeline(payload)));
      return;
    }

    if (message.type === RequestType.TIMELINE_ACK) {
      const agentId = readString(payload, 'agentId', '');
      const latestSeqValue = payload && typeof payload.latestSeq === 'number' ? payload.latestSeq : 0;
      const ack = agentManager.ackTimeline(agentId, latestSeqValue);
      if (!ack) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, ack));
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_LIST) {
      connection.sendJson(makeResponse(id, workspaceRegistry.listResult(payload)));
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_CREATE) {
      const result = workspaceRegistry.createWorkspace(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_REGISTRY_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_IMPORT) {
      const result = workspaceRegistry.importWorkspace(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_REGISTRY_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_UPSERT) {
      if (readString(payload, 'action', '') === 'open') {
        sendManagerResponse(connection, id, workspaceRegistry.openWorkspace(Object.assign({}, payload, {
          confirm: !readBooleanValue(payload, 'dryRun', false),
          preview: readBooleanValue(payload, 'dryRun', false)
        }), {
          commandForPath: (workspacePath) => openFileCommandForPlatform(workspacePath, process.platform),
          openPath: (workspacePath) => openFile(workspacePath)
        }));
        return;
      }
      const result = workspaceRegistry.writeWorkspaceWithPreview(Object.assign({}, payload, {
        confirm: true,
        preview: false
      }), 'workspace.registry.upsert', 'upsert');
      if (result.ok !== true) {
        connection.sendJson(makeErrorResponse(id, 'workspace_invalid', result.message || 'Workspace path is invalid.'));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_REGISTRY_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_ARCHIVE) {
      const result = workspaceRegistry.archiveWorkspaceWithPreview(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_REGISTRY_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_OPEN) {
      const result = workspaceRegistry.openWorkspace(payload, {
        commandForPath: (workspacePath) => openFileCommandForPlatform(workspacePath, process.platform),
        openPath: (workspacePath) => openFile(workspacePath)
      });
      connection.sendJson(makeResponse(id, result));
      if (result.confirmed === true && result.openStatus === 'opened') {
        connection.sendJson(makeEvent(EventType.WORKSPACE_REGISTRY_UPDATED, '', result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_SUGGESTIONS) {
      connection.sendJson(makeResponse(id, workspaceRegistry.suggestionsResult(payload)));
      return;
    }

    if (message.type === RequestType.WORKSPACE_REGISTRY_DOCTOR) {
      connection.sendJson(makeResponse(id, workspaceRegistry.doctor(payload)));
      return;
    }

    if (message.type === RequestType.PROJECT_REGISTRY_LIST) {
      connection.sendJson(makeResponse(id, {
        projects: workspaceRegistry.listProjects()
      }));
      return;
    }

    if (message.type === RequestType.TERMINAL_LIST) {
      connection.sendJson(makeResponse(id, terminalManager.list(payload)));
      return;
    }

    if (message.type === RequestType.TERMINAL_CREATE) {
      sendManagerResponse(connection, id, terminalManager.create(payload, connection));
      return;
    }

    if (message.type === RequestType.TERMINAL_SUBSCRIBE) {
      const result = terminalManager.subscribe(connection, payload);
      sendManagerResponse(connection, id, result);
      if (!result.code && result.terminal && typeof result.terminal.terminalId === 'string') {
        terminalManager.sendRestore(connection, result.terminal.terminalId);
      }
      return;
    }

    if (message.type === RequestType.TERMINAL_UNSUBSCRIBE) {
      connection.sendJson(makeResponse(id, terminalManager.unsubscribe(connection, payload)));
      return;
    }

    if (message.type === RequestType.TERMINAL_CAPTURE) {
      sendManagerResponse(connection, id, terminalManager.capture(payload));
      return;
    }

    if (message.type === RequestType.TERMINAL_KILL) {
      sendManagerResponse(connection, id, terminalManager.kill(payload));
      return;
    }

    if (message.type === RequestType.TERMINAL_RENAME) {
      sendManagerResponse(connection, id, terminalManager.rename(payload));
      return;
    }

    if (message.type === RequestType.TERMINAL_HOOK_STATUS) {
      sendManagerResponse(connection, id, terminalManager.hookStatus(payload));
      return;
    }

    if (message.type === RequestType.TERMINAL_HOOK_INSTALL) {
      sendManagerResponse(connection, id, terminalManager.installHook(payload));
      return;
    }

    if (message.type === RequestType.FILE_TRANSFER_DOWNLOAD) {
      sendManagerResponse(connection, id, await fileTransferManager.download(connection, payload));
      return;
    }

    if (message.type === RequestType.FILE_TRANSFER_UPLOAD) {
      sendManagerResponse(connection, id, fileTransferManager.upload(connection, payload));
      return;
    }

    if (message.type === RequestType.FILE_TRANSFER_CANCEL) {
      sendManagerResponse(connection, id, fileTransferManager.cancel(payload));
      return;
    }

    if (message.type === RequestType.AGENT_ARCHIVE) {
      const agentId = readString(payload, 'agentId', '');
      const cascade = readBooleanValue(payload, 'cascade', false);
      const result = await lifecycleCoordinator.archive(agentId, { cascade }, (event) => sendObservedEvent(connection, event));
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      const archivedAgents = Array.isArray(result.archivedAgents) ? result.archivedAgents : [result.agent];
      connection.sendJson(makeResponse(id, result));
      for (const archivedAgent of archivedAgents) {
        if (archivedAgent) {
          connection.sendJson(makeEvent(EventType.AGENT_UPDATED, archivedAgent.providerSessionId || '', { agent: archivedAgent }));
        }
      }
      connection.sendJson(makeEvent(EventType.AGENT_RELATIONSHIP_UPDATED, result.agent.providerSessionId || '', result));
      return;
    }

    if (message.type === RequestType.AGENT_ATTENTION_CLEAR) {
      const agentId = readString(payload, 'agentId', '');
      const agent = agentManager.clearAttention(agentId);
      if (!agent) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, { agent }));
      connection.sendJson(makeEvent(EventType.AGENT_UPDATED, '', { agent }));
      return;
    }

    if (message.type === RequestType.AGENT_FORK) {
      const agentId = readString(payload, 'agentId', '');
      const result = await agentForkCoordinator.fork(agentId, payload);
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      if (result.code) {
        connection.sendJson(makeErrorResponse(id, result.code, result.message || 'Agent fork failed.'));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      if (result.parent) {
        connection.sendJson(makeEvent(EventType.AGENT_RELATIONSHIP_UPDATED, result.parent.providerSessionId, result));
      }
      return;
    }

    if (message.type === RequestType.AGENT_DETACH) {
      const agentId = readString(payload, 'agentId', '');
      const result = lifecycleCoordinator.detach(agentId);
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.AGENT_RELATIONSHIP_UPDATED, result.agent.providerSessionId, result));
      return;
    }

    if (message.type === RequestType.PING) {
      connection.sendJson(makeResponse(id, { pong: true, now: Date.now() }));
      return;
    }

    if (message.type === RequestType.CHECKPOINT_LIST) {
      const agentId = readString(payload, 'agentId', '');
      const result = agentManager.listCheckpoints(agentId);
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.CHECKPOINT_CREATE) {
      const agentId = readString(payload, 'agentId', '');
      const record = agentManager.find(agentId);
      if (!record) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      const includeFiles = readBooleanValue(payload, 'includeFiles', false);
      const fileSnapshot = includeFiles
        ? fileCheckpointStore.capture(record, payload)
        : {
            fileSnapshotStatus: 'not_requested',
            fileSnapshotId: '',
            filesScanned: 0,
            filesCaptured: 0,
            skippedCount: 0
          };
      let runtimeCheckpoint = {
        runtimeCheckpointStatus: 'not_requested',
        runtimeCheckpointKind: '',
        runtimeRestoreSupported: false,
        runtimeCheckpoint: null,
        runtimeRestoreReason: 'runtime_session_unavailable'
      };
      const terminalCheckpointCapture = terminalManager.captureCheckpoint(record.id);
      const terminalCheckpoint = {
        terminalCheckpointStatus: readString(terminalCheckpointCapture, 'status', 'not_available'),
        terminalCheckpointKind: readString(terminalCheckpointCapture, 'kind', ''),
        terminalRestoreSupported: terminalCheckpointCapture.restoreSupported === true,
        terminalCheckpoint: terminalCheckpointCapture.token && typeof terminalCheckpointCapture.token === 'object'
          ? terminalCheckpointCapture.token
          : null
      };
      if (record.providerSessionId.length > 0) {
        try {
          const captured = await registry.captureRuntimeCheckpoint({
            providerId: record.provider,
            sessionId: record.providerSessionId,
            remoteSessionId: record.remoteSessionId,
            agentId: record.id
          });
          runtimeCheckpoint = {
            runtimeCheckpointStatus: readString(captured, 'status', 'unavailable'),
            runtimeCheckpointKind: readString(captured, 'kind', ''),
            runtimeRestoreSupported: captured.status === 'captured',
            runtimeCheckpoint: captured.token && typeof captured.token === 'object' ? captured.token : null,
            runtimeRestoreReason: readString(captured, 'reason', captured.status === 'captured' ? 'runtime_checkpoint_captured' : 'runtime_checkpoint_unavailable')
          };
        } catch (error) {
          runtimeCheckpoint.runtimeCheckpointStatus = 'failed';
          runtimeCheckpoint.runtimeRestoreReason = error instanceof Error ? error.message : String(error);
        }
      }
      const result = agentManager.createCheckpoint(agentId, Object.assign({}, payload, fileSnapshot, runtimeCheckpoint, terminalCheckpoint));
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.CHECKPOINT_UPDATED, result.agent.providerSessionId, result));
      return;
    }

    if (message.type === RequestType.CHECKPOINT_RESTORE) {
      const agentId = readString(payload, 'agentId', '');
      const checkpointId = readString(payload, 'checkpointId', '');
      const preRestoreSnapshotId = readString(payload, 'preRestoreSnapshotId', '');
      const record = agentManager.find(agentId);
      const checkpoint = checkpointId.length > 0 ? agentManager.findCheckpoint(agentId, checkpointId) : null;
      if (!checkpoint) {
        if (!record || preRestoreSnapshotId.length === 0) {
          connection.sendJson(makeErrorResponse(id, record ? 'checkpoint_not_found' : 'agent_not_found', record ? 'Checkpoint not found.' : 'Agent not found.'));
          return;
        }
      }
      const restoreFiles = readBooleanValue(payload, 'restoreFiles', false);
      const restoreRuntime = readBooleanValue(payload, 'restoreRuntime', false);
      const requireRuntimeRestore = readBooleanValue(payload, 'requireRuntimeRestore', false);
      const restoreTerminal = readBooleanValue(payload, 'restoreTerminal', false);
      const dryRun = readBooleanValue(payload, 'dryRun', false);
      const confirm = readBooleanValue(payload, 'confirm', false);
      const effectiveDryRun = dryRun || ((restoreFiles || restoreTerminal) && !confirm);
      const forceConflicts = readBooleanValue(payload, 'forceConflicts', false);
      const restorePlanId = readString(payload, 'restorePlanId', '');
      let runtimeRestoreResult = {
        status: restoreRuntime ? 'unsupported' : 'not_requested',
        restored: false,
        reason: restoreRuntime ? 'provider_checkpoint_restore_unsupported' : 'runtime_restore_not_requested'
      };
      let preRuntimeCheckpoint = null;
      if (restoreRuntime && !checkpoint) {
        runtimeRestoreResult = { status: 'not_requested', restored: false, reason: 'pre_restore_file_snapshot_only' };
        if (requireRuntimeRestore) {
          connection.sendJson(makeErrorResponse(id, 'runtime_restore_required_unavailable', runtimeRestoreResult.reason));
          return;
        }
      } else if (restoreRuntime) {
        if (!checkpoint.runtimeRestoreSupported || !checkpoint.runtimeCheckpoint) {
          runtimeRestoreResult = {
            status: 'unavailable',
            restored: false,
            reason: checkpoint.runtimeRestoreReason || 'runtime_checkpoint_unavailable'
          };
          if (requireRuntimeRestore) {
            connection.sendJson(makeErrorResponse(id, 'runtime_restore_required_unavailable', runtimeRestoreResult.reason));
            return;
          }
        } else if (effectiveDryRun) {
          runtimeRestoreResult = { status: 'ready', restored: false, reason: 'runtime_restore_ready' };
        } else {
          try {
            preRuntimeCheckpoint = await registry.captureRuntimeCheckpoint({
              providerId: record.provider,
              sessionId: record.providerSessionId,
              remoteSessionId: record.remoteSessionId,
              agentId: record.id
            });
            runtimeRestoreResult = await registry.restoreRuntimeCheckpoint({
              providerId: record.provider,
              sessionId: record.providerSessionId,
              remoteSessionId: record.remoteSessionId,
              agentId: record.id,
              runtimeToken: checkpoint.runtimeCheckpoint
            }, (event) => sendObservedEvent(connection, event));
          } catch (error) {
            runtimeRestoreResult = {
              status: 'failed',
              restored: false,
              reason: error instanceof Error ? error.message : String(error)
            };
            if (requireRuntimeRestore) {
              connection.sendJson(makeErrorResponse(id, 'runtime_restore_failed', runtimeRestoreResult.reason));
              return;
            }
          }
        }
      }
      let terminalRestoreResult = {
        status: restoreTerminal ? 'unavailable' : 'not_requested',
        restored: false,
        reason: restoreTerminal ? 'terminal_checkpoint_unavailable' : 'terminal_restore_not_requested'
      };
      if (restoreTerminal && checkpoint) {
        if (!checkpoint.terminalRestoreSupported || !checkpoint.terminalCheckpoint) {
          terminalRestoreResult = {
            status: 'unavailable',
            restored: false,
            reason: 'terminal_checkpoint_unavailable'
          };
        } else if (effectiveDryRun) {
          terminalRestoreResult = {
            status: 'ready',
            restored: false,
            reason: 'terminal_restore_ready'
          };
        } else {
          terminalRestoreResult = terminalManager.restoreCheckpoint(record.id, checkpoint.terminalCheckpoint);
        }
      }
      let fileRestore = null;
      if (restoreFiles || preRestoreSnapshotId.length > 0) {
        const snapshotId = preRestoreSnapshotId.length > 0 ? preRestoreSnapshotId : checkpoint.fileSnapshotId;
        fileRestore = fileCheckpointStore.restore(snapshotId, {
          dryRun,
          confirm,
          forceConflicts,
          restorePlanId
        });
      }
      if (runtimeRestoreResult.restored === true && fileRestore && fileRestore.restoreBlocked === true && preRuntimeCheckpoint && preRuntimeCheckpoint.token) {
        try {
          await registry.restoreRuntimeCheckpoint({
            providerId: record.provider,
            sessionId: record.providerSessionId,
            remoteSessionId: record.remoteSessionId,
            agentId: record.id,
            runtimeToken: preRuntimeCheckpoint.token
          }, (event) => sendObservedEvent(connection, event));
          runtimeRestoreResult = { status: 'rolled_back', restored: false, reason: 'file_restore_blocked' };
        } catch (error) {
          runtimeRestoreResult = {
            status: 'rollback_failed',
            restored: false,
            reason: error instanceof Error ? error.message : String(error)
          };
        }
      }
      if (preRestoreSnapshotId.length > 0) {
        const result = fileOnlyCheckpointRestoreResult(record, checkpoint, preRestoreSnapshotId, dryRun || !confirm || (fileRestore && fileRestore.restoreBlocked === true), fileRestore);
        connection.sendJson(makeResponse(id, result));
        if (result.dryRun !== true && result.restoreBlocked !== true) {
          connection.sendJson(makeEvent(EventType.CHECKPOINT_UPDATED, record.providerSessionId, result));
        }
        return;
      }
      const restoreBlocked = fileRestore && fileRestore.restoreBlocked === true;
      const conversationDryRun = effectiveDryRun || (restoreFiles && restoreBlocked);
      const result = agentManager.restoreCheckpoint(agentId, checkpointId, {
        dryRun: conversationDryRun,
        restoreFiles,
        confirm,
        forceConflicts,
        fileRestore,
        runtimeRestore: runtimeRestoreResult,
        terminalRestore: terminalRestoreResult
      });
      if (!result) {
        connection.sendJson(makeErrorResponse(id, 'agent_not_found', 'Agent not found.'));
        return;
      }
      if (result.code) {
        connection.sendJson(makeErrorResponse(id, result.code, result.message));
        return;
      }
      connection.sendJson(makeResponse(id, result));
      if (result.dryRun !== true) {
        connection.sendJson(makeEvent(EventType.CHECKPOINT_UPDATED, result.agent.providerSessionId, result));
      }
      return;
    }

    if (message.type === RequestType.DAEMON_STATUS) {
      connection.sendJson(makeResponse(id, buildDaemonStatusPayload(payload)));
      return;
    }

    if (message.type === RequestType.DAEMON_INSTANCE_STATUS) {
      const status = buildDaemonStatusPayload(payload);
      status.action = 'daemon.instance.status';
      connection.sendJson(makeResponse(id, status));
      return;
    }

    const daemonConfigPayload = daemonConfigPayloadForConnection(payload, connection);
    if (message.type === RequestType.DAEMON_CONFIG_STATUS) { connection.sendJson(makeResponse(id, daemonRemoteConfigManager.status(daemonConfigPayload))); return; }
    if (message.type === RequestType.DAEMON_CONFIG_FETCH) {
      const result = await daemonRemoteConfigManager.fetch(daemonConfigPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.DAEMON_CONFIG_UPDATED, '', result)); return;
    }
    if (message.type === RequestType.DAEMON_CONFIG_VALIDATE) { connection.sendJson(makeResponse(id, daemonRemoteConfigManager.validate(daemonConfigPayload))); return; }
    if (message.type === RequestType.DAEMON_CONFIG_PREVIEW) { connection.sendJson(makeResponse(id, daemonRemoteConfigManager.preview(daemonConfigPayload))); return; }
    if (message.type === RequestType.DAEMON_CONFIG_APPLY) {
      const result = daemonRemoteConfigManager.apply(daemonConfigPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.DAEMON_CONFIG_UPDATED, '', result)); return;
    }
    if (message.type === RequestType.DAEMON_CONFIG_ROLLBACK) {
      const result = daemonRemoteConfigManager.rollback(daemonConfigPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.DAEMON_CONFIG_UPDATED, '', result)); return;
    }

    if (message.type === RequestType.DAEMON_HEALTH) {
      connection.sendJson(makeResponse(id, buildDaemonHealthPayload('daemon.health')));
      return;
    }

    if (message.type === RequestType.DAEMON_START) {
      connection.sendJson(makeResponse(id, buildDaemonLifecycleResult('daemon.start', 'running', {
        alreadyRunning: true,
        message: 'Bridge daemon is already running in this process.'
      })));
      return;
    }

    if (message.type === RequestType.DAEMON_LOGS) {
      connection.sendJson(makeResponse(id, readDaemonLogTail(readNumber(payload, 'maxBytes', 64 * 1024))));
      return;
    }

    if (message.type === RequestType.DAEMON_AUTOSTART_STATUS) {
      connection.sendJson(makeResponse(id, await autostartManager.status(payload)));
      return;
    }

    if (message.type === RequestType.DAEMON_AUTOSTART_PREVIEW) {
      connection.sendJson(makeResponse(id, autostartManager.preview(payload)));
      return;
    }

    if (message.type === RequestType.DAEMON_AUTOSTART_SET) {
      const result = setDaemonAutostart(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_HEALTH_UPDATED, '', {
        autostart: result.autostart
      }));
      return;
    }

    if (message.type === RequestType.DAEMON_AUTOSTART_INSTALL) {
      const result = await autostartManager.install(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_HEALTH_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.DAEMON_AUTOSTART_UNINSTALL) {
      const result = await autostartManager.uninstall(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_HEALTH_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.DAEMON_UPDATE_STATUS) {
      connection.sendJson(makeResponse(id, publicDaemonUpdateStatus()));
      return;
    }

    if (message.type === RequestType.DAEMON_UPDATE_CHECK) {
      const result = await daemonUpdateManager.check(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_UPDATE_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.DAEMON_UPDATE_PREVIEW) {
      connection.sendJson(makeResponse(id, await daemonUpdateManager.preview(payload)));
      return;
    }

    if (message.type === RequestType.DAEMON_UPDATE_INSTALL) {
      const targetValidation = validateDaemonLifecycleTarget('daemon.update.install', payload, connection);
      if (!targetValidation.ok) {
        connection.sendJson(makeResponse(id, targetValidation));
        return;
      }
      if (config.containerMode === true) {
        connection.sendJson(makeResponse(id, {
          ok: false,
          action: 'daemon.update.install',
          failureCategory: 'container_image_update_required',
          message: 'In-place daemon updates are disabled in container mode.',
          remediation: 'Back up /data, deploy a pinned newer image, and recreate the container.'
        }));
        return;
      }
      const installed = await daemonUpdateManager.install(payload);
      const replacement = installed.ok === true
        ? scheduleInstalledSupervisorReplacement(installed, 'daemon.update.install')
        : {
            replacementScheduled: false,
            replacementMode: '',
            replacementPid: 0,
            replacementError: ''
          };
      const result = Object.assign({}, installed, replacement);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_UPDATE_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.DAEMON_UPDATE_ROLLBACK) {
      const targetValidation = validateDaemonLifecycleTarget('daemon.update.rollback', payload, connection);
      if (!targetValidation.ok) {
        connection.sendJson(makeResponse(id, targetValidation));
        return;
      }
      if (config.containerMode === true) {
        connection.sendJson(makeResponse(id, {
          ok: false,
          action: 'daemon.update.rollback',
          failureCategory: 'container_image_rollback_required',
          message: 'In-place daemon rollback is disabled in container mode.',
          remediation: 'Restore the matching /data snapshot and recreate the container with the previous pinned image.'
        }));
        return;
      }
      const rolledBack = await daemonUpdateManager.rollback(payload);
      const replacement = rolledBack.ok === true
        ? scheduleInstalledSupervisorReplacement(rolledBack, 'daemon.update.rollback')
        : {
            replacementScheduled: false,
            replacementMode: '',
            replacementPid: 0,
            replacementError: ''
          };
      const result = Object.assign({}, rolledBack, replacement);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_UPDATE_UPDATED, '', result));
      return;
    }

    if (message.type === RequestType.DAEMON_STOP) {
      const result = buildDaemonLifecycleResult('daemon.stop', 'stopping', {
        scheduled: true,
        message: 'Bridge daemon stop has been scheduled.'
      });
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_HEALTH_UPDATED, '', result));
      scheduleDaemonShutdown('daemon.stop', 120);
      return;
    }

    if (message.type === RequestType.DAEMON_RESTART) {
      const targetValidation = validateDaemonLifecycleTarget('daemon.restart', payload, connection);
      if (!targetValidation.ok) {
        connection.sendJson(makeResponse(id, targetValidation));
        return;
      }
      const supervisorRequested = supervisedWorker;
      const replacementPid = supervisorRequested ? 0 : launchDetachedBridgeReplacement(1200);
      const result = buildDaemonLifecycleResult('daemon.restart', 'restarting', {
        scheduled: true,
        replacementStarted: supervisorRequested || replacementPid > 0,
        replacementPid,
        message: supervisorRequested
          ? 'Bridge daemon worker restart has been scheduled through the supervisor.'
          : (replacementPid > 0 ? 'Bridge daemon restart has been scheduled.' : 'Bridge daemon shutdown has been scheduled, but replacement pid is unavailable.')
      });
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.DAEMON_HEALTH_UPDATED, '', result));
      if (supervisorRequested) {
        setTimeout(() => {
          sendSupervisorMessage({
            type: 'ngf:restart',
            reason: 'daemon.restart'
          });
        }, 120);
      } else {
        scheduleDaemonShutdown('daemon.restart', 120);
      }
      return;
    }

    if (message.type === RequestType.SECURITY_DEVICE_LIST) {
      connection.sendJson(makeResponse(id, listSecurityDevices()));
      return;
    }

    if (message.type === RequestType.SECURITY_AUDIT_LIST) {
      connection.sendJson(makeResponse(id, securityAudit.list(payload)));
      return;
    }

    if (message.type === RequestType.SECURITY_TLS_STATUS) {
      connection.sendJson(makeResponse(id, tlsStatus(daemonStore, tlsRuntimeState)));
      return;
    }

    if (message.type === RequestType.SECURITY_TLS_SET) {
      setTlsPreference(daemonStore, payload);
      refreshTlsServer();
      const result = tlsStatus(daemonStore, tlsRuntimeState);
      recordSecurityAudit({
        category: 'config',
        action: 'security.tls.set',
        severity: 'info',
        status: 'updated',
        reason: result.enabled ? 'tls_preference_enabled' : 'tls_preference_disabled',
        message: result.message,
        clientId: connection && connection.clientId ? connection.clientId : ''
      });
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.SECURITY_WARNING, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.SECURITY_HOSTS_STATUS) {
      connection.sendJson(makeResponse(id, hostAllowlistStatus(daemonStore)));
      return;
    }

    if (message.type === RequestType.SECURITY_HOSTS_SET) {
      const result = setHostAllowlist(daemonStore, payload);
      recordSecurityAudit({
        category: 'config',
        action: 'security.hosts.set',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'host_allowlist_updated',
        message: result.message,
        clientId: connection && connection.clientId ? connection.clientId : ''
      });
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.SECURITY_WARNING, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.SECURITY_TOKEN_STATUS) {
      connection.sendJson(makeResponse(id, bearerTokenStatus(config)));
      return;
    }

    if (message.type === RequestType.SECURITY_TOKEN_ROTATE) {
      const result = rotateBearerToken(config);
      const connectionsInvalidated = result.rotated === true
        ? invalidateAuthenticatedWebSockets('bearer_token_rotated')
        : 0;
      recordSecurityAudit({
        category: 'auth',
        action: 'security.token.rotate',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'token_rotated',
        message: result.message,
        clientId: connection && connection.clientId ? connection.clientId : ''
      });
      const responseResult = Object.assign({}, result, { connectionsInvalidated });
      connection.sendJson(makeResponse(id, responseResult));
      connection.sendJson(makeEvent(EventType.SECURITY_WARNING, readString(payload, 'sessionId', ''), responseResult));
      return;
    }

    if (message.type === RequestType.SECURITY_AUTH_STATUS) {
      connection.sendJson(makeResponse(id, bcryptStatus(daemonStore)));
      return;
    }

    if (message.type === RequestType.SECURITY_AUTH_SET) {
      const result = setAuthPreference(daemonStore, payload);
      const connectionsInvalidated = result.ok !== false && result.authenticationChanged === true
        ? invalidateAuthenticatedWebSockets('authentication_mode_changed')
        : 0;
      recordSecurityAudit({
        category: 'config',
        action: 'security.auth.set',
        severity: result.ok === false ? 'warning' : 'info',
        status: result.ok === false ? 'rejected' : 'updated',
        reason: result.failureCategory || 'authentication_mode_changed',
        message: result.message,
        clientId: connection && connection.clientId ? connection.clientId : ''
      });
      const responseResult = Object.assign({}, result, { connectionsInvalidated });
      connection.sendJson(makeResponse(id, responseResult));
      connection.sendJson(makeEvent(EventType.SECURITY_WARNING, readString(payload, 'sessionId', ''), responseResult));
      return;
    }

    if (message.type === RequestType.SECURITY_DEVICE_TRUST) {
      const result = trustSecurityDevice(payload);
      recordSecurityAudit({
        category: 'device',
        action: 'security.device.trust',
        severity: result && result.code ? 'warning' : 'info',
        status: result && result.code ? 'rejected' : 'updated',
        reason: result && result.code ? result.code : 'device_trusted',
        message: result && result.code ? result.message : 'Trusted device list updated.',
        clientId: connection && connection.clientId ? connection.clientId : '',
        deviceId: result && result.device ? readString(result.device, 'physicalDeviceId', '') : '',
        fingerprint: result && result.device ? readString(result.device, 'publicKeyFingerprint', '') : ''
      });
      sendManagerResponse(connection, id, result);
      return;
    }

    if (message.type === RequestType.SECURITY_DEVICE_REVOKE) {
      const result = revokeSecurityDevice(payload);
      recordSecurityAudit({
        category: 'device',
        action: 'security.device.revoke',
        severity: result && result.code ? 'warning' : 'info',
        status: result && result.code ? 'rejected' : 'updated',
        reason: result && result.code ? result.code : 'device_revoked',
        message: result && result.code ? result.message : 'Trusted device revocation processed.',
        clientId: connection && connection.clientId ? connection.clientId : '',
        deviceId: result && result.device ? readString(result.device, 'physicalDeviceId', '') : '',
        fingerprint: result && result.device ? readString(result.device, 'publicKeyFingerprint', '') : ''
      });
      sendManagerResponse(connection, id, result);
      return;
    }

    if (message.type === RequestType.SESSION_CREATE) {
      const providerId = readString(payload, 'providerId', 'mock');
      const provider = registry.resolve(providerId);
      const session = await provider.createSession(payload);
      requestLogger.info('session.created', {
        requestId: id,
        providerId,
        sessionId: session.sessionId,
        workspacePath: readString(payload, 'workspacePath', ''),
        workspaceTitle: readString(payload, 'workspaceTitle', '')
      });
      const agent = agentManager.upsertFromSession(session, payload);
      connection.sendJson(makeResponse(id, { session, agent }));
      connection.sendJson(makeEvent(EventType.SESSION_CREATED, session.sessionId, { session }));
      connection.sendJson(makeEvent(EventType.AGENT_UPDATED, session.sessionId, { agent }));
      return;
    }

    if (message.type === RequestType.SESSION_LIST) {
      const providerId = readString(payload, 'providerId', '');
      connection.sendJson(makeResponse(id, {
        providerId,
        sessions: await registry.listSessions(providerId)
      }));
      return;
    }

    if (message.type === RequestType.SESSION_MESSAGES) {
      const sessionId = readString(payload, 'sessionId', '');
      if (!registry.findSession(sessionId)) {
        const sessionAgent = agentManager.findBySessionId(sessionId);
        if (sessionAgent) {
          const ensured = await ensureProviderSessionForAgent(sessionAgent.id);
          if (!ensured.ok) {
            connection.sendJson(makeErrorResponse(id, ensured.code, ensured.message));
            return;
          }
        }
      }
      const messages = await registry.listSessionMessages(sessionId);
      const toolCalls = await registry.listSessionToolCalls(sessionId);
      const match = registry.findSession(sessionId);
      requestLogger.info('session.messages.loaded', {
        requestId: id,
        sessionId,
        providerId: match ? match.provider.id : '',
        messageCount: messages.length,
        toolCallCount: toolCalls.length
      });
      connection.sendJson(makeResponse(id, { sessionId, messages, toolCalls }));
      connection.sendJson(makeEvent(EventType.SESSION_MESSAGES, sessionId, { sessionId, messages, toolCalls }));
      return;
    }

    if (message.type === RequestType.SESSION_REVERT) {
      const sessionId = readString(payload, 'sessionId', '');
      const result = await registry.revertSession(payload, (event) => sendObservedEvent(connection, event));
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.SESSION_ABORT) {
      const result = await registry.abortSession(payload, (event) => sendObservedEvent(connection, event));
      const sessionId = readString(payload, 'sessionId', '');
      const agentRecord = agentManager.findBySessionId(sessionId);
      const agent = agentRecord ? agentManager.stop(agentRecord.id, result) : null;
      connection.sendJson(makeResponse(id, { accepted: true, result, agent }));
      if (agent) {
        sendAgentLifecycleEvents(connection, sessionId, agent, false);
      }
      return;
    }

    if (message.type === RequestType.MESSAGE_SEND) {
      const sessionId = readString(payload, 'sessionId', '');
      let match = registry.findSession(sessionId);
      if (!match) {
        const sessionAgent = agentManager.findBySessionId(sessionId);
        if (sessionAgent) {
          const ensured = await ensureProviderSessionForAgent(sessionAgent.id);
          if (ensured.ok) {
            match = registry.findSession(sessionId);
          }
        }
      }
      if (!match) {
        connection.sendJson(makeErrorResponse(id, 'session_not_found', 'Session not found.'));
        return;
      }
      const connectionHostProfileId = readString(connection.clientHello || {}, 'hostProfileId', '');
      if (connectionHostProfileId) payload.hostProfileId = connectionHostProfileId;
      const composerValidation = sanitizeComposerTokens(payload);
      if (!composerValidation.ok) {
        connection.sendJson(makeErrorResponse(id, composerValidation.failureCategory, composerValidation.message));
        return;
      }
      payload.composerTokens = composerValidation.tokens;
      requestLogger.info('message.accepted', {
        requestId: id,
        sessionId,
        providerId: match.provider.id,
        modelId: readString(payload, 'modelId', ''),
        interactionMode: readString(payload, 'interactionMode', readString(payload, 'runMode', ''))
      });
      const queued = messageQueueManager.enqueue(payload);
      const agent = queued.duplicate ? null : agentManager.appendUserMessage(sessionId, Object.assign({}, payload, { clientMessageId: queued.item.clientMessageId, queueStatus: queued.item.status }));
      connection.sendJson(makeResponse(id, { accepted: true, queued: true, queueItem: queued.item }));
      if (agent) {
        connection.sendJson(makeEvent(EventType.AGENT_UPDATED, sessionId, { agent }));
      }
      connection.sendJson(makeEvent(EventType.MESSAGE_QUEUE_UPDATED, sessionId, { item: queued.item }));
      await messageQueueManager.drain(sessionId, async (queuedPayload) => {
        const providerPayload = agentManager.providerMessagePayloadForSession(sessionId, queuedPayload);
        messageQueueManager.persistPayload(providerPayload);
        agentManager.markPendingForkContextConsumedForSession(sessionId, providerPayload);
        await match.provider.sendMessage(providerPayload, (event) => sendObservedEvent(connection, event));
      }, (item) => connection.sendJson(makeEvent(EventType.MESSAGE_QUEUE_UPDATED, sessionId, { item })), readString(payload, 'hostProfileId', ''));
      requestLogger.info('message.completed', {
        requestId: id,
        sessionId,
        providerId: match.provider.id
      });
      return;
    }

    if (message.type === RequestType.MESSAGE_QUEUE_LIST) { connection.sendJson(makeResponse(id, messageQueueManager.list(usagePayloadForConnection(payload, connection)))); return; }
    if (message.type === RequestType.MESSAGE_QUEUE_CANCEL) { const scopedPayload = usagePayloadForConnection(payload, connection); const result = messageQueueManager.cancel(scopedPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.MESSAGE_QUEUE_UPDATED, readString(scopedPayload, 'sessionId', ''), result)); return; }
    if (message.type === RequestType.MESSAGE_QUEUE_RETRY) {
      const scopedPayload = usagePayloadForConnection(payload, connection); const result = messageQueueManager.retry(scopedPayload); connection.sendJson(makeResponse(id, result));
      const sessionId = result.item ? result.item.sessionId : readString(scopedPayload, 'sessionId', ''); const match = registry.findSession(sessionId);
      if (result.ok && match) await messageQueueManager.drain(sessionId, async (queuedPayload) => {
        const providerPayload = agentManager.providerMessagePayloadForSession(sessionId, queuedPayload);
        messageQueueManager.persistPayload(providerPayload);
        agentManager.markPendingForkContextConsumedForSession(sessionId, providerPayload);
        return match.provider.sendMessage(providerPayload, (event) => sendObservedEvent(connection, event));
      }, (item) => connection.sendJson(makeEvent(EventType.MESSAGE_QUEUE_UPDATED, sessionId, { item })), readString(scopedPayload, 'hostProfileId', ''));
      return;
    }
    if (message.type === RequestType.USAGE_SUMMARY_GET) { connection.sendJson(makeResponse(id, usageManager.summary(usagePayloadForConnection(payload, connection)))); return; }
    if (message.type === RequestType.USAGE_EVENTS_LIST) { connection.sendJson(makeResponse(id, usageManager.events(usagePayloadForConnection(payload, connection)))); return; }
    if (message.type === RequestType.USAGE_BUDGET_GET) { connection.sendJson(makeResponse(id, usageManager.budgetGet(usagePayloadForConnection(payload, connection)))); return; }
    if (message.type === RequestType.USAGE_BUDGET_SET) { const scopedPayload = usagePayloadForConnection(payload, connection); const result = usageManager.budgetSet(scopedPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.USAGE_UPDATED, readString(scopedPayload, 'sessionId', ''), result)); return; }
    if (message.type === RequestType.PROVIDER_USAGE_LIST) {
      const providerPayload = usagePayloadForConnection(payload, connection);
      const result = await providerUsageService.list(providerPayload);
      const quotaEvents = providerUsageQuotaEvents(result, providerPayload);
      let recordedQuotaEvents = 0;
      for (const quotaEvent of quotaEvents) {
        const usage = usageManager.record(quotaEvent, connection);
        if (!usage) continue;
        recordedQuotaEvents += 1;
        sendScopedUsageEvent(
          activeWsConnections,
          readString(usage, 'hostProfileId', ''),
          connection,
          makeEvent(EventType.USAGE_UPDATED, readString(usage, 'sessionId', ''), { usage })
        );
      }
      if (recordedQuotaEvents > 0 && result && typeof result === 'object') {
        result.usageEventsRecorded = recordedQuotaEvents;
        result.usageSnapshotAt = new Date().toISOString();
      }
      connection.sendJson(makeResponse(id, result));
      return;
    }
    if (message.type === RequestType.METADATA_GENERATE_CANCEL) {
      connection.sendJson(makeResponse(id, cancelMetadataRequest(connection, payload)));
      return;
    }
    if (message.type === RequestType.METADATA_GENERATE) {
      const sessionId = readString(payload, 'sessionId', ''); const match = registry.findSession(sessionId);
      const scope = validateMetadataScope(payload, { agentManager, connection, match });
      if (!scope.ok) { connection.sendJson(makeResponse(id, scope)); return; }
      const requestKey = metadataRequestKey(connection, id);
      if (pendingMetadataRequests.has(requestKey)) {
        connection.sendJson(makeResponse(id, {
          ok: false,
          action: RequestType.METADATA_GENERATE,
          requestId: id,
          failureCategory: 'metadata_request_in_flight',
          message: 'A metadata request with this id is already running.',
          remediation: 'Wait for the active request or cancel it before retrying.'
        }));
        return;
      }
      const requestState = {
        connection,
        requestId: id,
        providerId: match.provider.id,
        hostProfileId: scope.hostProfileId,
        sessionId: scope.sessionId,
        agentId: scope.agentId,
        timer: null,
        reject: null,
        cancelled: false,
        timedOut: false,
        completed: false,
        responseSent: false,
        detached: false,
        cleanup: null,
        cleanupStarted: false
      };
      scope.providerPayload.metadataRequestId = id;
      if (typeof match.provider.cancelMetadata === 'function') {
        requestState.cleanup = (reason) => match.provider.cancelMetadata({ requestId: id, reason });
      }
      pendingMetadataRequests.set(requestKey, requestState);
      const timeoutMs = metadataTimeoutForPayload(payload);
      let rejectCancellation;
      const cancellationPromise = new Promise((resolve, reject) => {
        rejectCancellation = reject;
      });
      requestState.reject = rejectCancellation;
      const timeoutPromise = new Promise((_resolve, reject) => {
        requestState.timer = setTimeout(() => {
          requestState.timedOut = true;
          invokeMetadataCleanup(requestState, 'timeout');
          reject(metadataRequestError('metadata_timeout', 'Metadata generation timed out.'));
        }, timeoutMs);
        if (requestState.timer && typeof requestState.timer.unref === 'function') requestState.timer.unref();
      });
      let metadataResult = { suggestion: '', alternatives: [], warnings: [], estimatedUsage: false };
      const source = 'provider';
      let metadataUsageRecorded = 0;
      if (typeof match.provider.generateMetadata !== 'function' && typeof match.provider.generateMetadataResult !== 'function') {
        clearTimeout(requestState.timer);
        requestState.timer = null;
        requestState.reject = null;
        requestState.completed = true;
        pendingMetadataRequests.delete(requestKey);
        connection.sendJson(makeResponse(id, {
          ok: false,
          action: 'metadata.generate',
          failureCategory: 'capability_unavailable',
          message: 'The current provider does not support metadata generation.',
          remediation: 'Select a provider that exposes metadata generation for this session.'
        }));
        return;
      }
      try {
        const providerPromise = typeof match.provider.generateMetadataResult === 'function'
          ? match.provider.generateMetadataResult(scope.providerPayload)
          : match.provider.generateMetadata(scope.providerPayload);
        const generated = await Promise.race([Promise.resolve(providerPromise), cancellationPromise, timeoutPromise]);
        metadataResult = normalizeMetadataResult(scope.providerPayload.kind, generated);
        if (!metadataResult.ok) {
          const metadataError = new Error(metadataResult.message);
          metadataError.code = metadataResult.failureCategory;
          throw metadataError;
        }
        if (metadataResult.usage && typeof metadataResult.usage === 'object' && !Array.isArray(metadataResult.usage)) {
          const usagePayload = Object.assign({}, metadataResult.usage, {
            eventId: readString(metadataResult.usage, 'eventId', '') ||
              'metadata:' + match.provider.id + ':' + scope.sessionId + ':' + id,
            hostProfileId: scope.hostProfileId,
            sessionId: scope.sessionId,
            agentId: scope.agentId,
            providerId: match.provider.id,
            source: 'provider',
            kind: 'metadata',
            window: 'session'
          });
          const usage = usageManager.record(usagePayloadForConnection(usagePayload, connection), connection);
          if (usage) {
            metadataUsageRecorded = 1;
            sendScopedUsageEvent(
              activeWsConnections,
              readString(usage, 'hostProfileId', ''),
              connection,
              makeEvent(EventType.USAGE_UPDATED, scope.sessionId, { usage })
            );
          }
        }
      } catch (error) {
        if (requestState.responseSent || requestState.detached) {
          return;
        }
        requestState.responseSent = true;
        const failureCategory = error && (error.code === 'metadata_empty' || error.code === 'metadata_kind_invalid')
          ? error.code
          : error && error.code === 'metadata_timeout'
            ? 'metadata_timeout'
            : error && error.code === 'metadata_cancelled'
              ? 'metadata_cancelled'
              : 'metadata_generation_failed';
        const failureMessage = failureCategory === 'metadata_empty'
          ? 'Metadata Provider returned an empty suggestion.'
          : failureCategory === 'metadata_kind_invalid'
            ? 'Metadata kind is not supported.'
            : failureCategory === 'metadata_timeout'
              ? 'Metadata Provider request timed out.'
              : failureCategory === 'metadata_cancelled'
                ? 'Metadata generation was cancelled.'
                : 'Metadata Provider request failed.';
        connection.sendJson(makeResponse(id, {
          ok: false,
          action: 'metadata.generate',
          requestId: id,
          failureCategory,
          message: failureMessage,
          remediation: failureCategory === 'metadata_timeout'
            ? 'Retry with a healthy Provider or a larger timeout.'
            : failureCategory === 'metadata_cancelled'
              ? 'Retry the metadata preview when the Provider is ready.'
              : 'Retry the metadata preview or inspect the current Provider diagnostics.',
          warnings: scope.warnings
        }));
        return;
      } finally {
        clearTimeout(requestState.timer);
        requestState.timer = null;
        requestState.reject = null;
        requestState.completed = true;
        pendingMetadataRequests.delete(requestKey);
      }
      if (requestState.cancelled || requestState.timedOut || requestState.detached || requestState.responseSent) return;
      requestState.completed = true;
      requestState.responseSent = true;
      connection.sendJson(makeResponse(id, {
        ok: true,
        action: 'metadata.generate',
        preview: true,
        confirmed: false,
        planId: crypto.randomBytes(18).toString('base64url'),
        kind: scope.providerPayload.kind,
        suggestion: metadataResult.suggestion,
        alternatives: metadataResult.alternatives,
        sourceProvider: match.provider.id,
        source,
        estimatedUsage: metadataResult.estimatedUsage,
        usageEventsRecorded: metadataUsageRecorded,
        requestId: id,
        timeoutMs,
        hostProfileId: scope.hostProfileId,
        agentId: scope.agentId,
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        warnings: scope.warnings.concat(metadataResult.warnings),
        updatedAt: new Date().toISOString()
      })); return;
    }
    if (message.type === RequestType.DIAGNOSTICS_EXPORT) {
      const health = buildDaemonHealthPayload('diagnostics.export');
      const queueState = messageQueueManager.state();
      const usageState = usageManager.state();
      const providerCapabilities = await registry.listCapabilities();
      const report = buildDiagnosticsExportReport(daemonStore, {
        format: readString(payload, 'format', 'json'),
        maxBytes: readNumber(payload, 'maxBytes', 256 * 1024),
        doctor: health.doctor,
        health,
        provider: {
          count: providerCapabilities.length,
          availableCount: providerCapabilities.filter((item) => item && item.available === true).length
        },
        terminal: {
          available: terminalManager.isAvailable(),
          activeCount: terminalManager.list({}).terminals.length
        },
        queue: {
          count: queueState.items.length,
          failedCount: queueState.items.filter((item) => item.status === 'failed').length
        },
        usage: {
          eventCount: usageState.events.length,
          budgetCount: Object.keys(usageState.budgets || {}).length,
          degraded: false
        },
        providerSecretStorage: providerProfileService.secretStoreStatus(),
        secureStorage: {
          credentialStoreAvailable: githubClient.credentialStoreAvailable ? githubClient.credentialStoreAvailable() : false,
          providerSecretStorage: providerProfileService.secretStoreStatus()
        },
        remoteConfig: daemonRemoteConfigManager.status(),
        persistence: { usageVersion: usageState.version || usageState.schemaVersion || 0, queueVersion: queueState.version || queueState.schemaVersion || 0 }
      });
      connection.sendJson(makeResponse(id, report)); return;
    }

    if (message.type === RequestType.RELAY_STATUS) {
      connection.sendJson(makeResponse(id, relayManager.status()));
      return;
    }
    if (message.type === RequestType.RELAY_DEVICE_LIST) {
      connection.sendJson(makeResponse(id, relayManager.devices(payload)));
      return;
    }
    if (message.type === RequestType.RELAY_PAIRING_START) {
      const result = await relayManager.startPairing(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      return;
    }
    if (message.type === RequestType.RELAY_PAIRING_CANCEL) {
      const result = relayManager.cancelPairing(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      return;
    }
    if (message.type === RequestType.RELAY_CONNECT) {
      const result = await relayManager.connect(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      return;
    }
    if (message.type === RequestType.RELAY_DISCONNECT) {
      const result = relayManager.disconnect(payload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      return;
    }
    if (message.type === RequestType.RELAY_DEVICE_REVOKE) {
      const result = relayManager.revoke(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true && result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.RELAY_DEVICE_UPDATED, '', relayManager.devices({ includeRevoked: true })));
        connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      }
      return;
    }
    if (message.type === RequestType.RELAY_IDENTITY_ROTATE) {
      const result = relayManager.rotateIdentity(payload);
      connection.sendJson(makeResponse(id, result));
      if (result.ok === true && result.confirmed === true) {
        connection.sendJson(makeEvent(EventType.RELAY_DEVICE_UPDATED, '', relayManager.devices({ includeRevoked: true })));
        connection.sendJson(makeEvent(EventType.RELAY_UPDATED, '', relayManager.status()));
      }
      return;
    }

    if (message.type === RequestType.SCHEDULE_STATUS) { connection.sendJson(makeResponse(id, scheduleManager.status())); return; }
    if (message.type === RequestType.SCHEDULE_LIST) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.list(payload)); return; }
    if (message.type === RequestType.SCHEDULE_GET) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.get(payload)); return; }
    if (message.type === RequestType.SCHEDULE_CREATE) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.create(payload)); return; }
    if (message.type === RequestType.SCHEDULE_UPDATE) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.update(payload)); return; }
    if (message.type === RequestType.SCHEDULE_ENABLE) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.setEnabled(payload, true)); return; }
    if (message.type === RequestType.SCHEDULE_DISABLE) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.setEnabled(payload, false)); return; }
    if (message.type === RequestType.SCHEDULE_RUN_NOW) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.runNow(payload)); return; }
    if (message.type === RequestType.SCHEDULE_HISTORY) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.history(payload)); return; }
    if (message.type === RequestType.SCHEDULE_REMOVE) { sendAutomationResponse(connection, id, 'schedule', scheduleManager.remove(payload)); return; }

    if (message.type === RequestType.LOOP_STATUS) { connection.sendJson(makeResponse(id, loopManager.status())); return; }
    if (message.type === RequestType.LOOP_LIST) { sendAutomationResponse(connection, id, 'loop', loopManager.list(payload)); return; }
    if (message.type === RequestType.LOOP_GET) { sendAutomationResponse(connection, id, 'loop', loopManager.get(payload)); return; }
    if (message.type === RequestType.LOOP_CREATE) { sendAutomationResponse(connection, id, 'loop', loopManager.create(payload)); return; }
    if (message.type === RequestType.LOOP_UPDATE) { sendAutomationResponse(connection, id, 'loop', loopManager.update(payload)); return; }
    if (message.type === RequestType.LOOP_START) { sendAutomationResponse(connection, id, 'loop', loopManager.start(payload)); return; }
    if (message.type === RequestType.LOOP_PAUSE) { sendAutomationResponse(connection, id, 'loop', loopManager.pause(payload)); return; }
    if (message.type === RequestType.LOOP_RESUME) { sendAutomationResponse(connection, id, 'loop', loopManager.resume(payload)); return; }
    if (message.type === RequestType.LOOP_STOP) { sendAutomationResponse(connection, id, 'loop', loopManager.stop(payload)); return; }
    if (message.type === RequestType.LOOP_TAKEOVER) { sendAutomationResponse(connection, id, 'loop', loopManager.takeover(payload)); return; }
    if (message.type === RequestType.LOOP_ROUNDS) { sendAutomationResponse(connection, id, 'loop', loopManager.rounds(payload)); return; }
    if (message.type === RequestType.LOOP_REMOVE) { sendAutomationResponse(connection, id, 'loop', loopManager.remove(payload)); return; }

    if (message.type === RequestType.CHAT_ROOM_STATUS) { connection.sendJson(makeResponse(id, chatRoomManager.status())); return; }
    if (message.type === RequestType.CHAT_ROOM_LIST) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.list(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_GET) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.get(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_CREATE) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.create(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_UPDATE) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.update(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_ARCHIVE) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.archive(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_MEMBER_ADD) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.memberAdd(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_MEMBER_UPDATE) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.memberUpdate(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_MEMBER_REMOVE) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.memberRemove(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_MESSAGE_POST) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.messagePost(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_MESSAGE_LIST) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.messageList(chatPayloadForConnection(payload, connection))); return; }
    if (message.type === RequestType.CHAT_ROOM_ACK) { sendAutomationResponse(connection, id, 'chatRoom', chatRoomManager.ack(chatPayloadForConnection(payload, connection))); return; }

    if (message.type === RequestType.VOICE_STATUS) { connection.sendJson(makeResponse(id, voiceManager.status())); return; }
    if (message.type === RequestType.VOICE_SESSION_START) { connection.sendJson(makeResponse(id, voiceManager.start(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.VOICE_SESSION_CHUNK) { connection.sendJson(makeResponse(id, voiceManager.chunk(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.VOICE_SESSION_FINISH) { connection.sendJson(makeResponse(id, await voiceManager.finish(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.VOICE_SESSION_CANCEL) { connection.sendJson(makeResponse(id, voiceManager.cancel(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.VOICE_TTS_SPEAK) { connection.sendJson(makeResponse(id, await voiceManager.speak(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.VOICE_TTS_STOP) { connection.sendJson(makeResponse(id, voiceManager.stop(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_LIST) { connection.sendJson(makeResponse(id, serviceManager.list(payload))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_UPSERT) { connection.sendJson(makeResponse(id, serviceManager.upsert(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_STATUS) { connection.sendJson(makeResponse(id, serviceManager.status(payload))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_HEALTH) { connection.sendJson(makeResponse(id, await serviceManager.health(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_OPEN) {
      connection.sendJson(makeResponse(id, serviceAccessTicketManager.open(payload, serviceAccessContextForConnection(connection))));
      return;
    }
    if (message.type === RequestType.WORKSPACE_SERVICE_START) { connection.sendJson(makeResponse(id, await serviceManager.start(payload, false, connection.connectionId || ''))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_STOP) { connection.sendJson(makeResponse(id, await serviceManager.stop(payload, false, connection.connectionId || ''))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_LOGS) { connection.sendJson(makeResponse(id, serviceManager.logs(payload))); return; }
    if (message.type === RequestType.WORKSPACE_SERVICE_REMOVE) { connection.sendJson(makeResponse(id, await serviceManager.remove(payload, connection.connectionId || ''))); return; }
    if (message.type === RequestType.BROWSER_HOST_REGISTER) {
      const result = browserAutomationManager.registerHost(payload, connection);
      recordBrowserAutomationAudit(connection, message.type, payload, result);
      connection.sendJson(makeResponse(id, result));
      return;
    }
    if (message.type === RequestType.BROWSER_HOST_UNREGISTER) {
      const result = browserAutomationManager.unregisterHost(payload, connection);
      recordBrowserAutomationAudit(connection, message.type, payload, result);
      connection.sendJson(makeResponse(id, result));
      return;
    }
    if (message.type === RequestType.BROWSER_HOST_RESULT) { connection.sendJson(makeResponse(id, browserAutomationManager.handleHostResult(payload, connection))); return; }
    if (message.type === RequestType.BROWSER_HOST_LIST ||
      message.type === RequestType.BROWSER_INSTANCE_LIST ||
      message.type === RequestType.BROWSER_INSTANCE_CREATE ||
      message.type === RequestType.BROWSER_INSTANCE_CLOSE ||
      message.type === RequestType.BROWSER_PAGE_LIST ||
      message.type === RequestType.BROWSER_PAGE_CREATE ||
      message.type === RequestType.BROWSER_PAGE_CLOSE ||
      message.type === RequestType.BROWSER_PAGE_NAVIGATE ||
      message.type === RequestType.BROWSER_PAGE_SNAPSHOT ||
      message.type === RequestType.BROWSER_PAGE_SCREENSHOT ||
      message.type === RequestType.BROWSER_PAGE_LOGS ||
      message.type === RequestType.BROWSER_PAGE_WAIT ||
      message.type === RequestType.BROWSER_PAGE_ACTION ||
      message.type === RequestType.BROWSER_DOWNLOAD_LIST ||
      message.type === RequestType.BROWSER_PERMISSION_GET ||
      message.type === RequestType.BROWSER_PERMISSION_SET) {
      const result = await browserAutomationManager.execute(message.type, payload, connection.connectionId || '');
      recordBrowserAutomationAudit(connection, message.type, payload, result);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.PREVIEW_GET) {
      const sessionId = readString(payload, 'sessionId', '');
      const match = registry.findSession(sessionId);
      if (!match) {
        connection.sendJson(makeErrorResponse(id, 'session_not_found', 'Session not found.'));
        return;
      }
      const preview = await match.provider.getPreview(payload);
      connection.sendJson(makeResponse(id, { preview }));
      connection.sendJson(makeEvent(EventType.PREVIEW_UPDATED, sessionId, { preview }));
      return;
    }

    if (message.type === RequestType.PERMISSION_LIST) {
      connection.sendJson(makeResponse(id, listPermissionRequests(payload)));
      return;
    }

    if (message.type === RequestType.PERMISSION_RESPOND) {
      const result = await registry.respondPermission(payload, (event) => sendObservedEvent(connection, event));
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.REQUEST_RESPOND) {
      const result = await registry.respondRequest(payload, (event) => sendObservedEvent(connection, event));
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.PLAN_RESPOND) {
      const result = await registry.respondPlan(payload, (event) => sendObservedEvent(connection, event));
      connection.sendJson(makeResponse(id, { accepted: true, result }));
      return;
    }

    if (message.type === RequestType.OPENCODE_REQUEST) {
      const result = await registry.proxyOpenCodeRequest(payload);
      const providerId = readString(payload, 'providerId', 'opencode');
      connection.sendJson(makeResponse(id, { providerId, result }));
      return;
    }

    if (message.type === RequestType.WORKSPACE_CHANGES_GET) {
      const result = await workspaceService.getChanges(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_DIFF_GET) {
      const result = await workspaceService.getDiff(payload);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILES_LIST) {
      const result = await workspaceService.listFiles(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_FILES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILE_GET) {
      const result = await workspaceService.getFile(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, { preview: result }));
      connection.sendJson(makeEvent(EventType.PREVIEW_UPDATED, sessionId, { preview: result }));
      return;
    }

    if (message.type === RequestType.WORKSPACE_FILE_DOWNLOAD) {
      const result = await workspaceService.prepareDownload(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.FILE_DOWNLOAD_READY, sessionId, result));
      return;
    }

    if (message.type === RequestType.ATTACHMENT_FILE_DOWNLOAD) {
      const result = await workspaceService.prepareAttachmentDownload(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.FILE_DOWNLOAD_READY, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_STAGE) {
      const result = await workspaceService.stage(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_UNSTAGE) {
      const result = await workspaceService.unstage(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_DISCARD) {
      const result = await workspaceService.discard(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_COMMIT) {
      const result = await workspaceService.commit(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_PULL) {
      const result = await workspaceService.pull(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_PUSH) {
      const result = await workspaceService.push(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_BRANCH) {
      const result = await workspaceService.branch(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_STASH) {
      const result = await workspaceService.stash(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_MERGE) {
      const result = await workspaceService.merge(payload);
      const sessionId = readString(payload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      if (result.preview !== true) {
        connection.sendJson(makeEvent(EventType.WORKSPACE_CHANGES_UPDATED, sessionId, result));
      }
      return;
    }

    if (message.type === RequestType.WORKSPACE_GIT_SUBSCRIBE) {
      sendManagerResponse(connection, id, await subscribeWorkspaceGit(connection, payload));
      return;
    }

    if (message.type === RequestType.WORKTREE_LIST) {
      const result = await workspaceService.listWorktrees(payload);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.WORKTREE_CREATE) {
      const result = await workspaceService.createWorktree(payload);
      if (result.created === true && result.worktreePath.length > 0) {
        const workspace = workspaceRegistry.upsertWorkspace({
          workspacePath: result.worktreePath,
          cwd: result.worktreePath,
          workspaceTitle: readString(payload, 'title', ''),
          title: readString(payload, 'title', ''),
          branch: result.branch,
          kind: 'worktree',
          sourceWorkspaceId: result.sourceWorkspaceId,
          sourceRootPath: result.sourceRootPath,
          worktreePath: result.worktreePath,
          startPoint: result.startPoint
        });
        result.registryLinked = workspace !== null;
        result.registryWorkspaceId = workspace && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
        result.worktrees = (await workspaceService.listWorktrees(payload)).worktrees;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKTREE_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.WORKTREE_ARCHIVE) {
      const result = await workspaceService.archiveWorktree(payload);
      if (result && result.archived === true && typeof result.worktreePath === 'string' && result.worktreePath.length > 0) {
        const workspace = workspaceRegistry.archiveWorkspace({
          cwd: result.worktreePath
        });
        result.registryLinked = workspace !== null;
        result.registryWorkspaceId = workspace && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
        result.worktrees = (await workspaceService.listWorktrees(payload)).worktrees;
      }
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.WORKTREE_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    const githubPayload = githubPayloadForConnection(payload, connection);
    if (message.type === RequestType.GITHUB_AUTH_DEVICE_START) {
      connection.sendJson(makeResponse(id, await githubClient.deviceStart(githubPayload)));
      return;
    }
    if (message.type === RequestType.GITHUB_AUTH_DEVICE_POLL) {
      const result = await githubClient.devicePoll(githubPayload);
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.GITHUB_AUTH_UPDATED, '', result));
      return;
    }
    if (message.type === RequestType.GITHUB_AUTH_STATUS) { connection.sendJson(makeResponse(id, await githubClient.authStatus(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_AUTH_LOGOUT) {
      const result = await githubClient.logout(githubPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.GITHUB_AUTH_UPDATED, '', result)); return;
    }
    if (message.type === RequestType.GITHUB_ACCOUNT_LIST) { connection.sendJson(makeResponse(id, await githubClient.accountList(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_BINDING_GET) { connection.sendJson(makeResponse(id, await githubClient.bindingGet(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_BINDING_SET) {
      const result = await githubClient.bindingSet(githubPayload); connection.sendJson(makeResponse(id, result)); connection.sendJson(makeEvent(EventType.GITHUB_BINDING_UPDATED, readString(githubPayload, 'sessionId', ''), result)); return;
    }
    if (message.type === RequestType.GITHUB_PR_LIST) { connection.sendJson(makeResponse(id, await githubClient.pullRequestList(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_PR_UPDATE) { connection.sendJson(makeResponse(id, await githubClient.updatePullRequest(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_PR_REVIEWERS_UPDATE) { connection.sendJson(makeResponse(id, await githubClient.updatePullRequestCollection(githubPayload, 'reviewers'))); return; }
    if (message.type === RequestType.GITHUB_PR_LABELS_UPDATE) { connection.sendJson(makeResponse(id, await githubClient.updatePullRequestCollection(githubPayload, 'labels'))); return; }
    if (message.type === RequestType.GITHUB_WATCH_START) {
      const result = await githubClient.watchStart(githubPayload, (update) => connection.sendJson(makeEvent(EventType.GITHUB_PR_UPDATED, readString(githubPayload, 'sessionId', ''), update)));
      connection.sendJson(makeResponse(id, result)); return;
    }
    if (message.type === RequestType.GITHUB_WATCH_STOP) { connection.sendJson(makeResponse(id, await githubClient.watchStop(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_ATTACHMENT_PREVIEW) { connection.sendJson(makeResponse(id, await githubClient.attachmentPreview(githubPayload))); return; }
    if (message.type === RequestType.GITHUB_ATTACHMENT_UPLOAD) { connection.sendJson(makeResponse(id, await githubClient.attachmentUpload(githubPayload))); return; }

    if (message.type === RequestType.GITHUB_PR_CREATE) {
      const result = await githubClient.createPullRequest(githubPayload);
      const sessionId = readString(githubPayload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.GITHUB_PR_UPDATED, sessionId, Object.assign({
        refreshReason: 'create'
      }, result)));
      return;
    }

    if (message.type === RequestType.GITHUB_PR_STATUS) {
      const result = await githubClient.pullRequestStatus(githubPayload);
      const sessionId = readString(githubPayload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.GITHUB_PR_UPDATED, sessionId, Object.assign({
        refreshReason: 'status'
      }, result)));
      return;
    }

    if (message.type === RequestType.GITHUB_PR_MERGE) {
      const result = await githubClient.mergePullRequest(githubPayload);
      const sessionId = readString(githubPayload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.GITHUB_PR_UPDATED, sessionId, Object.assign({
        refreshReason: 'merge'
      }, result)));
      return;
    }

    if (message.type === RequestType.GITHUB_CHECKS_LIST) {
      const result = await githubClient.checksList(githubPayload);
      const sessionId = readString(githubPayload, 'sessionId', '');
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.GITHUB_CHECKS_UPDATED, sessionId, Object.assign({
        refreshReason: 'checks'
      }, result)));
      return;
    }

    if (message.type === RequestType.GITHUB_ISSUE_SEARCH) {
      const result = await githubClient.issueSearch(githubPayload);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.GITHUB_ISSUE_ATTACHMENT_LIST) {
      const result = await githubClient.issueAttachmentList(githubPayload);
      connection.sendJson(makeResponse(id, result));
      return;
    }

    if (message.type === RequestType.MCP_TOOLS_LIST) {
      connection.sendJson(makeResponse(id, mcpHost.listTools(payload)));
      return;
    }

    if (message.type === RequestType.MCP_SERVER_START) {
      connection.sendJson(makeResponse(id, mcpHost.start(payload)));
      return;
    }

    if (message.type === RequestType.MCP_SERVER_STOP) {
      connection.sendJson(makeResponse(id, mcpHost.stop(payload)));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_LIST) {
      connection.sendJson(makeResponse(id, notificationManager.list(payload, hostProfileIdForConnection(connection))));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_READ) {
      const result = notificationManager.markRead(payload, hostProfileIdForConnection(connection));
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.NOTIFICATION_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_ACTION) {
      const result = notificationManager.handleAction(payload, hostProfileIdForConnection(connection));
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.NOTIFICATION_ACTION, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_PRUNE) {
      const result = notificationManager.prune(payload, hostProfileIdForConnection(connection));
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.NOTIFICATION_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_PUSH_STATUS) {
      connection.sendJson(makeResponse(id, pushNotificationManager.status(payload, hostProfileIdForConnection(connection))));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_PUSH_REGISTER) {
      const result = pushNotificationManager.register(payload, hostProfileIdForConnection(connection));
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.NOTIFICATION_PUSH_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (message.type === RequestType.NOTIFICATION_PUSH_UNREGISTER) {
      const result = pushNotificationManager.unregister(payload, hostProfileIdForConnection(connection));
      connection.sendJson(makeResponse(id, result));
      connection.sendJson(makeEvent(EventType.NOTIFICATION_PUSH_UPDATED, readString(payload, 'sessionId', ''), result));
      return;
    }

    if (UNSUPPORTED_REQUEST_TYPES.has(message.type)) {
      sendUnsupportedResponse(connection, id, message.type);
      return;
    }

    connection.sendJson(makeErrorResponse(id, 'unsupported_type', 'Unsupported message type: ' + message.type));
  } catch (error) {
    requestLogger.error('request.failed', {
      requestId: id,
      type: message.type,
      error: error instanceof Error ? error.message : String(error)
    });
    connection.sendJson(makeErrorResponse(id, 'request_failed', error instanceof Error ? error.message : String(error)));
  }
}

function handleClientBinaryMessage(payload, connection) {
  const decoded = decodeBinaryFrame(payload);
  if (!decoded) {
    wsLogger.warn('binary.invalid', {
      connectionId: connection && connection.connectionId ? connection.connectionId : '',
      bytes: payload && typeof payload.length === 'number' ? payload.length : 0
    });
    return;
  }
  let handled = false;
  if (decoded.kind === 'terminal') {
    handled = terminalManager.handleBinaryFrame(connection, decoded.frame);
  } else if (decoded.kind === 'file_transfer') {
    handled = fileTransferManager.handleBinaryFrame(connection, decoded.frame);
  }
  if (!handled) {
    wsLogger.warn('binary.unhandled', {
      connectionId: connection && connection.connectionId ? connection.connectionId : '',
      kind: decoded.kind
    });
  }
}

function registerBridgeClientConnection(connection, metadata) {
  if (!connection || activeWsConnections.has(connection)) {
    return connection;
  }
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const connectionId = connection.connectionId || source.connectionId ||
    (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const clientId = connection.clientId || source.clientId || '';
  const appNonce = connection.appNonce || source.appNonce || '';
  const requestedEndpoint = connection.requestedEndpoint || source.requestedEndpoint || '';
  const requestHost = connection.requestHost || source.requestHost || '';
  const requestProtocol = connection.requestProtocol || source.requestProtocol || '';
  connection.connectionId = connectionId;
  connection.clientId = clientId;
  connection.appNonce = appNonce;
  connection.requestedEndpoint = requestedEndpoint;
  connection.requestHost = requestHost;
  connection.requestProtocol = requestProtocol;
  connection.remoteAddress = connection.remoteAddress || source.remoteAddress || '';
  connection.connectedAt = typeof connection.connectedAt === 'number' ? connection.connectedAt : Date.now();
  connection.lastSeenAt = typeof connection.lastSeenAt === 'number' ? connection.lastSeenAt : Date.now();
  activeConnections += 1;
  activeWsConnections.add(connection);
  if (clientId.length > 0) {
    const previousConnection = activeClientConnections.get(clientId);
    if (previousConnection && previousConnection !== connection) {
      wsLogger.warn('client.superseded', {
        clientId,
        previousConnectionId: previousConnection.connectionId || '',
        connectionId
      });
      previousConnection.close();
    }
    activeClientConnections.set(clientId, connection);
  }
  connection.heartbeatTimer = setInterval(() => {
    if (Date.now() - connection.lastSeenAt > WS_IDLE_TIMEOUT_MS) {
      wsLogger.warn('client.idle_timeout', {
        connectionId,
        clientId,
        remote: connection.remoteAddress,
        idleMs: Date.now() - connection.lastSeenAt
      });
      connection.close();
      return;
    }
    connection.sendPing();
  }, WS_HEARTBEAT_INTERVAL_MS);
  if (connection.heartbeatTimer && typeof connection.heartbeatTimer.unref === 'function') {
    connection.heartbeatTimer.unref();
  }
  wsLogger.ready('client.connected', {
    connectionId,
    clientId,
    remote: connection.remoteAddress,
    transport: connection.relaySessionId ? 'relay' : 'direct',
    activeConnections
  });
  connection.providerCleanup = registry.subscribeEvents(connectionId, (event) => {
    sendObservedEvent(connection, event);
  });
  buildCapabilities(requestedEndpoint, clientId, appNonce)
    .then((capabilities) => {
      connection.sendJson(makeEvent(EventType.BRIDGE_CONNECTED, '', capabilities));
      connection.sendJson(makeEvent(EventType.SERVER_INFO, '', {
        serverInfo: capabilities.serverInfo
      }));
      wsLogger.info('bridge.connected', {
        connectionId,
        providers: Array.isArray(capabilities.providers) ? capabilities.providers.length : 0,
        protocolVersion: capabilities.protocolVersion,
        transport: connection.relaySessionId ? 'relay' : 'direct'
      });
    })
    .catch((error) => {
      wsLogger.error('bridge.connected_failed', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
      connection.sendJson(makeErrorResponse('', 'capabilities_failed', error instanceof Error ? error.message : String(error)));
    });
  return connection;
}

function unregisterBridgeClientConnection(connection, reason) {
  if (!connection || !activeWsConnections.has(connection)) {
    return false;
  }
  cancelPendingMetadataForConnection(connection);
  terminalManager.detachConnection(connection);
  serviceManager.detachConnection(connection.connectionId || '');
  voiceManager.detachOwner(connection.connectionId || '');
  browserAutomationManager.detachConnection(connection);
  fileTransferManager.detachConnection(connection);
  clearGitDiffSubscriptions(connection);
  clearAutomationEventScopes(connection);
  githubClient.stopWatchersForConnection(connection.connectionId || '');
  activeWsConnections.delete(connection);
  if (typeof connection.providerCleanup === 'function') {
    connection.providerCleanup();
    connection.providerCleanup = null;
  }
  if (connection.heartbeatTimer) {
    clearInterval(connection.heartbeatTimer);
    connection.heartbeatTimer = null;
  }
  if (connection.clientId && activeClientConnections.get(connection.clientId) === connection) {
    activeClientConnections.delete(connection.clientId);
  }
  if (activeConnections > 0) activeConnections -= 1;
  wsLogger.info('client.disconnected', {
    connectionId: connection.connectionId || '',
    clientId: connection.clientId || '',
    remote: connection.remoteAddress || '',
    transport: connection.relaySessionId ? 'relay' : 'direct',
    reason: typeof reason === 'string' ? reason : '',
    activeConnections,
    durationMs: typeof connection.connectedAt === 'number' ? Date.now() - connection.connectedAt : ''
  });
  return true;
}

function writeUpgradeError(socket, status, code, message) {
  if (!socket || socket.destroyed) return;
  const body = JSON.stringify({ ok: false, error: { code, message } });
  socket.write(
    'HTTP/1.1 ' + status + '\r\n' +
    'Content-Type: application/json; charset=utf-8\r\n' +
    'Content-Length: ' + String(Buffer.byteLength(body)) + '\r\n' +
    'Connection: close\r\n\r\n' + body
  );
  socket.destroy();
}

async function handleServiceUpgradeRequest(req, socket, head, reqUrl, route) {
  if (route.ok === false) {
    const rejected = { ok: false, failureCategory: route.failureCategory, message: route.message };
    auditServiceProxy(req, route, rejected, 'websocket');
    writeUpgradeError(socket, '400 Bad Request', rejected.failureCategory, rejected.message);
    return;
  }
  if (!route.domainRoute && !isHostAllowed(req)) {
    const rejected = { ok: false, failureCategory: 'host_not_allowed', message: 'Request host is not in the Bridge allowlist.' };
    auditServiceProxy(req, route, rejected, 'websocket');
    writeUpgradeError(socket, '403 Forbidden', rejected.failureCategory, rejected.message);
    return;
  }
  if (!serviceProxyOriginAllowed(req)) {
    const rejected = { ok: false, failureCategory: 'service_origin_not_allowed', message: 'WebSocket origin does not match the service proxy host.' };
    auditServiceProxy(req, route, rejected, 'websocket');
    writeUpgradeError(socket, '403 Forbidden', rejected.failureCategory, rejected.message);
    return;
  }
  const authorization = await authorizeServiceProxyRequest(req, reqUrl, route);
  if (!authorization.ok) {
    auditServiceProxy(req, route, authorization, 'websocket');
    writeUpgradeError(socket, '401 Unauthorized', 'unauthorized', authorization.message);
    return;
  }
  const proxyResult = serviceManager.proxyWebSocket(
    req,
    socket,
    head,
    route.serviceId,
    route.upstreamPath,
    authorization.ownerAgentId,
    authorization.allowOwner
  );
  auditServiceProxy(req, route, proxyResult, 'websocket');
  if (!proxyResult.ok) {
    const statusCode = serviceProxyFailureStatus(proxyResult.failureCategory);
    const statusText = statusCode === 404 ? '404 Not Found'
      : statusCode === 403 ? '403 Forbidden'
        : statusCode === 400 ? '400 Bad Request'
          : statusCode === 504 ? '504 Gateway Timeout'
            : statusCode === 502 ? '502 Bad Gateway'
              : '409 Conflict';
    writeUpgradeError(socket, statusText, proxyResult.failureCategory || 'service_proxy_rejected', proxyResult.message || 'Service proxy request was rejected.');
  }
}

async function handleUpgradeRequest(req, socket, head) {
  const reqUrl = new URL(req.url || '/', 'http://bridge.invalid');
  const domainResolution = serviceManager.resolveProxyDomain(req && req.headers ? req.headers.host : '');
  if (!domainResolution.matched && serviceManager.isServiceDomainCandidate(req && req.headers ? req.headers.host : '')) {
    writeUpgradeError(socket, '404 Not Found', 'service_domain_not_found', 'Workspace service domain was not found.');
    return;
  }
  const serviceRoute = resolveServiceProxyRoute(reqUrl, req && req.headers ? req.headers.host : '', serviceManager);
  if (serviceRoute.matched) {
    await handleServiceUpgradeRequest(req, socket, head, reqUrl, serviceRoute);
    return;
  }
  if (!isHostAllowed(req)) {
    wsLogger.warn('upgrade.rejected', {
      reason: 'host_not_allowed',
      host: req.headers.host || '',
      remote: remoteAddressFromSocket(socket)
    });
    recordSecurityAudit({
      category: 'host',
      action: 'ws.host_rejected',
      severity: 'warning',
      status: 'rejected',
      reason: 'host_not_allowed',
      message: 'WebSocket upgrade host is not in the Bridge allowlist.',
      remoteAddress: remoteAddressFromSocket(socket),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (reqUrl.pathname !== '/ws') {
    wsLogger.warn('upgrade.rejected', {
      reason: 'invalid_path',
      path: reqUrl.pathname,
      remote: remoteAddressFromSocket(socket)
    });
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!webOriginAllowed(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  const webTicket = reqUrl.searchParams.get('webTicket') || '';
  const ticketAuthorized = consumeWebAuthTicket(req, webTicket);
  const authorization = ticketAuthorized ? { ok: true } : await authorizeRequest(req, reqUrl);
  if (!authorization.ok) {
    wsLogger.warn('upgrade.rejected', {
      reason: authorization.failureCategory || 'unauthorized',
      path: reqUrl.pathname,
      remote: remoteAddressFromSocket(socket)
    });
    recordSecurityAudit({
      category: 'auth',
      action: 'ws.unauthorized',
      severity: 'warning',
      status: 'rejected',
      reason: 'unauthorized',
      message: 'WebSocket upgrade rejected because its Bridge credential was missing or invalid.',
      remoteAddress: remoteAddressFromSocket(socket),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const clientId = reqUrl.searchParams.get('clientId') || '';
  const appNonce = reqUrl.searchParams.get('appNonce') || '';
  const nonceValidation = validateAndRememberNonce(
    nonceReplayCache,
    clientId,
    appNonce,
    NONCE_REPLAY_TTL_MS
  );
  if (!nonceValidation.ok) {
    wsLogger.warn('upgrade.rejected', {
      reason: nonceValidation.code,
      clientId,
      remote: remoteAddressFromSocket(socket)
    });
    recordSecurityAudit({
      category: 'nonce',
      action: nonceValidation.code === 'nonce_replay' ? 'ws.nonce_replay' : 'ws.nonce_invalid',
      severity: 'warning',
      status: 'rejected',
      reason: nonceValidation.code,
      message: nonceValidation.message,
      remoteAddress: remoteAddressFromSocket(socket),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : ''),
      clientId
    });
    const status = nonceValidation.code === 'nonce_replay' ? '409 Conflict' : '400 Bad Request';
    socket.write('HTTP/1.1 ' + status + '\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n' + JSON.stringify({
      ok: false,
      error: {
        code: nonceValidation.code,
        message: nonceValidation.message,
        remediation: nonceValidation.remediation
      }
    }));
    socket.destroy();
    return;
  }

  acceptWebSocket(req, socket, head, {
    onOpen(connection) {
      const connectionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const requestedEndpoint = endpointForRequest(req, reqUrl);
      registerBridgeClientConnection(connection, {
        connectionId,
        clientId,
        appNonce,
        requestedEndpoint,
        requestHost: req && req.headers ? req.headers.host || '' : '',
        requestProtocol: req && req.socket && req.socket.encrypted === true ? 'https:' : 'http:',
        remoteAddress: remoteAddressFromRequest(req)
      });
    },
    onMessage(rawText, connection) {
      void handleClientMessage(rawText, connection);
    },
    onBinary(payload, connection) {
      handleClientBinaryMessage(payload, connection);
    },
    onClose(connection) {
      unregisterBridgeClientConnection(connection, 'socket_closed');
    }
  });
}

function handleUpgrade(req, socket, head) {
  void handleUpgradeRequest(req, socket, head).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    wsLogger.error('upgrade.failed', {
      reason: 'upgrade_internal_error',
      remote: remoteAddressFromSocket(socket),
      error: message
    });
    recordSecurityAudit({
      category: 'auth',
      action: 'ws.upgrade_failed',
      severity: 'error',
      status: 'rejected',
      reason: 'upgrade_internal_error',
      message,
      remoteAddress: remoteAddressFromSocket(socket),
      host: normalizeHostHeader(req && req.headers ? req.headers.host : '')
    });
    if (!socket.destroyed) {
      socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });
}

const server = http.createServer(handleHttpRequest);
server.on('upgrade', handleUpgrade);
server.on('close', () => {
  serverLogger.info('shutdown.complete', {
    activeConnections
  });
});

function tlsConfigForServer() {
  const daemon = daemonStore.config && daemonStore.config.daemon && typeof daemonStore.config.daemon === 'object'
    ? daemonStore.config.daemon
    : {};
  const tls = daemon.tls && typeof daemon.tls === 'object' && !Array.isArray(daemon.tls) ? daemon.tls : {};
  return {
    enabled: tls.enabled === true,
    certPath: readString(tls, 'certPath', ''),
    keyPath: readString(tls, 'keyPath', ''),
    caPath: readString(tls, 'caPath', ''),
    port: readNumber(tls, 'port', 0)
  };
}

function setTlsRuntimeInactive(enabled, port, lastError) {
  tlsRuntimeState.enabled = enabled === true;
  tlsRuntimeState.active = false;
  tlsRuntimeState.port = typeof port === 'number' && Number.isFinite(port) ? port : 0;
  tlsRuntimeState.bindUrl = '';
  tlsRuntimeState.startedAt = '';
  tlsRuntimeState.lastError = typeof lastError === 'string' ? lastError : '';
}

function closeTlsServer(callback) {
  const currentServer = tlsServer;
  tlsServer = null;
  if (!currentServer) {
    if (typeof callback === 'function') {
      callback();
    }
    return;
  }
  currentServer.close(() => {
    if (typeof callback === 'function') {
      callback();
    }
  });
}

function readTlsServerOptions(tls) {
  if (!tls.enabled) {
    return null;
  }
  if (tls.certPath.length === 0 || tls.keyPath.length === 0) {
    throw new Error('TLS is enabled, but certificate and key paths are not both configured.');
  }
  if (!fs.existsSync(tls.certPath) || !fs.existsSync(tls.keyPath)) {
    throw new Error('TLS is enabled, but the configured certificate or key file does not exist.');
  }
  const options = {
    cert: fs.readFileSync(tls.certPath),
    key: fs.readFileSync(tls.keyPath)
  };
  if (tls.caPath.length > 0) {
    if (!fs.existsSync(tls.caPath)) {
      throw new Error('TLS is enabled, but the configured CA file does not exist.');
    }
    options.ca = fs.readFileSync(tls.caPath);
  }
  return options;
}

function recordTlsRuntimeWarning(reason, message) {
  recordSecurityAudit({
    category: 'config',
    action: 'security.tls.listener',
    severity: 'warning',
    status: 'failed',
    reason,
    message
  });
}

function startTlsServer() {
  const tls = tlsConfigForServer();
  if (!tls.enabled) {
    setTlsRuntimeInactive(false, 0, '');
    return;
  }
  const tlsPort = tls.port > 0 ? tls.port : config.port + 1;
  tlsRuntimeState.enabled = true;
  tlsRuntimeState.port = tlsPort;
  tlsRuntimeState.lastError = '';
  let options = null;
  try {
    options = readTlsServerOptions(tls);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setTlsRuntimeInactive(true, tlsPort, message);
    serverLogger.warn('tls.disabled', {
      reason: 'tls_material_unavailable',
      message
    });
    recordTlsRuntimeWarning('tls_material_unavailable', message);
    return;
  }
  let nextServer = null;
  try {
    nextServer = https.createServer(options, handleHttpRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setTlsRuntimeInactive(true, tlsPort, message);
    serverLogger.warn('tls.create_failed', {
      bindUrl: 'https://' + config.host + ':' + tlsPort,
      error: message
    });
    recordTlsRuntimeWarning('tls_listener_failed', message);
    return;
  }
  nextServer.on('upgrade', handleUpgrade);
  nextServer.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (tlsServer === nextServer) {
      closeTlsServer();
    }
    setTlsRuntimeInactive(true, tlsPort, message);
    serverLogger.warn('tls.listen_failed', {
      bindUrl: 'https://' + config.host + ':' + tlsPort,
      error: message
    });
    recordTlsRuntimeWarning('tls_listener_failed', message);
  });
  try {
    nextServer.listen(tlsPort, config.host, () => {
      tlsServer = nextServer;
      tlsRuntimeState.enabled = true;
      tlsRuntimeState.active = true;
      tlsRuntimeState.port = tlsPort;
      tlsRuntimeState.bindUrl = 'https://' + config.host + ':' + tlsPort;
      tlsRuntimeState.startedAt = new Date().toISOString();
      tlsRuntimeState.lastError = '';
      serverLogger.ready('tls.listening', {
        bindUrl: tlsRuntimeState.bindUrl
      });
      recordSecurityAudit({
        category: 'config',
        action: 'security.tls.listener',
        severity: 'info',
        status: 'started',
        reason: 'tls_listener_started',
        message: 'TLS listener started at ' + tlsRuntimeState.bindUrl + '.'
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setTlsRuntimeInactive(true, tlsPort, message);
    serverLogger.warn('tls.listen_failed', {
      bindUrl: 'https://' + config.host + ':' + tlsPort,
      error: message
    });
    recordTlsRuntimeWarning('tls_listener_failed', message);
  }
}

function refreshTlsServer() {
  const tls = tlsConfigForServer();
  const tlsPort = tls.enabled ? (tls.port > 0 ? tls.port : config.port + 1) : 0;
  setTlsRuntimeInactive(tls.enabled, tlsPort, '');
  closeTlsServer(() => {
    startTlsServer();
  });
}

async function requestServerShutdown(signalName) {
  if (serverShuttingDown) {
    return;
  }
  serverShuttingDown = true;
  stopSupervisorHeartbeat();
  serverLogger.warn('shutdown.requested', {
    signal: signalName,
    activeConnections
  });
  try {
    await lifecycleCoordinator.shutdown(signalName);
  } catch (error) {
    serverLogger.warn('shutdown.cleanup_failed', {
      signal: signalName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  relayManager.shutdown();
  voiceManager.shutdown();
  scheduleManager.shutdown();
  for (const connection of activeWsConnections.values()) {
    clearGitDiffSubscriptions(connection);
    terminalManager.detachConnection(connection);
    try {
      connection.close();
    } catch (_error) {
      // Server close below remains the final transport cleanup path.
    }
  }
  closeTlsServer();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  requestServerShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  requestServerShutdown('SIGTERM');
});

function startHttpServer() {
  server.listen(config.port, config.host, () => {
    terminalManager.setActivityBaseUrl('http://127.0.0.1:' + config.port);
    serverLogger.ready('listening', {
      bindUrl: 'http://' + config.host + ':' + config.port,
      protocolVersion: config.protocolVersion,
      providers: registry.providers.size
    });
    if (config.tokenGenerated) {
      serverLogger.warn('token.generated', {
        envName: 'AGENT_BRIDGE_TOKEN',
        token: config.token
      });
    }
    startSupervisorHeartbeat();
    const scheduleStatus = scheduleManager.start();
    if (!scheduleStatus.leader && scheduleStatus.available) {
      serverLogger.warn('schedule.runner.passive', {
        warnings: scheduleStatus.warnings
      });
    }
    sendSupervisorMessage({
      type: 'ngf:ready',
      listen: config.host + ':' + String(config.port)
    });
    startTlsServer();
  });
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return;
  }
  if (message.type === 'ngf:supervisor-heartbeat') {
    sendSupervisorMessage({
      type: 'ngf:worker-heartbeat',
      timestamp: Date.now()
    });
  }
});

if (Number.isFinite(serverStartDelayMs) && serverStartDelayMs > 0) {
  setTimeout(startHttpServer, serverStartDelayMs);
} else {
  startHttpServer();
}
