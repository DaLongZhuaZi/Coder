import { webSocket } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import {
  logger,
  ngfRelayCryptoFacade,
  RelayCryptoDirection,
  RelayCryptoError,
  RelayCryptoProtocol,
  RelayCryptoRole,
  RelayCryptoSession,
  RelayEncryptedEnvelope,
  RelayHandshakeOffer,
  RelayIdentityInfo
} from 'ngf_framework';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeContextItem,
  AgentBridgeAttachmentDownloadPayload,
  AgentBridgeAgentActionPayload,
  AgentBridgeAgentCreatePayload,
  AgentBridgeAgentForkPayload,
  AgentBridgeAgentListPayload,
  AgentBridgeAgentModeSetPayload,
  AgentBridgeAgentModelSetPayload,
  AgentBridgeAgentRunPayload,
  AgentBridgeAgentSendPayload,
  AgentBridgeAgentUpdatePayload,
  AgentBridgeCheckpointCreatePayload,
  AgentBridgeCheckpointListPayload,
  AgentBridgeCheckpointRestorePayload,
  AgentBridgeCreateSessionPayload,
  AgentBridgeDaemonAutostartPayload,
  AgentBridgeDaemonAutostartPreviewPayload,
  AgentBridgeDaemonAutostartActionPayload,
  AgentBridgeDaemonLogsPayload,
  AgentBridgeDaemonTargetPayload,
  AgentBridgeDaemonUpdateInstallPayload,
  AgentBridgeDaemonUpdateQueryPayload,
  AgentBridgeDaemonUpdateRollbackPayload,
  AgentBridgeDaemonConfigPayload,
  AgentBridgeExperiencePayload,
  AgentBridgeBinaryFrame,
  AgentBridgeBinaryFrameCodec,
  AgentBridgeBinaryFrameKind,
  AgentBridgeEmptyPayload,
  AgentBridgeFileTransferCancelPayload,
  AgentBridgeFileTransferDownloadPayload,
  AgentBridgeFileTransferFrame,
  AgentBridgeFileTransferMetadata,
  AgentBridgeFileTransferUploadPayload,
  AgentBridgeHelloPayload,
  AgentBridgeIncomingParser,
  AgentBridgeNotificationActionPayload,
  AgentBridgeNotificationListPayload,
  AgentBridgeNotificationPrunePayload,
  AgentBridgeNotificationReadPayload,
  AgentBridgePushRegisterPayload,
  AgentBridgePushStatusPayload,
  AgentBridgePushUnregisterPayload,
  AgentBridgeOpenCodeRequestPayload,
  AgentBridgePlanRespondPayload,
  AgentBridgePermissionRespondPayload,
  AgentBridgePreviewPayload,
  AgentBridgeProviderCatalogPayload,
  AgentBridgeProviderAcpDiscoverPayload,
  AgentBridgeProviderAcpImportPayload,
  AgentBridgeProviderDirectoryInstallPayload,
  AgentBridgeProviderDirectoryListPayload,
  AgentBridgeProviderDirectoryRefreshPayload,
  AgentBridgeProviderDirectoryRemovePayload,
  AgentBridgeProviderDirectoryRollbackPayload,
  AgentBridgeProviderDirectoryStatusPayload,
  AgentBridgeProviderId,
  AgentBridgeProviderProfileEnvObject,
  AgentBridgeProviderProfileClonePayload,
  AgentBridgeProviderProfileDeletePayload,
  AgentBridgeProviderProfileTestPayload,
  AgentBridgeProviderProfileUpsertPayload,
  AgentBridgeRequestEnvelope,
  AgentBridgeRequestRespondPayload,
  AgentBridgeRequestType,
  AgentBridgeRelayBrokerAck,
  AgentBridgeRelayBrokerAttach,
  AgentBridgeRelayBrokerDetach,
  AgentBridgeRelayBrokerFrame,
  AgentBridgeRelayClientHello,
  AgentBridgeRelayDirection,
  AgentBridgeRelayE2eeData,
  AgentBridgeRelayEncryptedEnvelope,
  AgentBridgeRelayManagementPayload,
  AgentBridgeRelayPairingOffer,
  AgentBridgeRelayPublicEndpoint,
  AgentBridgeRelaySessionResponse,
  AgentBridgeScheduleQueryPayload,
  AgentBridgeScheduleRecord,
  AgentBridgeScheduleWritePayload,
  AgentBridgeLoopQueryPayload,
  AgentBridgeLoopRecord,
  AgentBridgeLoopWritePayload,
  AgentBridgeChatRoom,
  AgentBridgeChatRoomAckPayload,
  AgentBridgeChatRoomMember,
  AgentBridgeChatRoomMemberPayload,
  AgentBridgeChatRoomMessageListPayload,
  AgentBridgeChatRoomMessagePayload,
  AgentBridgeChatRoomWritePayload,
  AgentBridgeSecurityDeviceActionPayload,
  AgentBridgeSendMessagePayload,
  AgentBridgeSessionAbortPayload,
  AgentBridgeSessionMessagesPayload,
  AgentBridgeSessionRevertPayload,
  AgentBridgeSessionListPayload,
  AgentBridgeTerminalActionPayload,
  AgentBridgeTerminalCreatePayload,
  AgentBridgeTerminalFrame,
  AgentBridgeTerminalFrameOpcode,
  AgentBridgeTerminalHookInstallPayload,
  AgentBridgeTerminalListPayload,
  AgentBridgeTerminalRenamePayload,
  AgentBridgeVoicePayload,
  AgentBridgeTerminalSubscribePayload,
  AgentBridgeTimelineAckPayload,
  AgentBridgeTimelineFetchPayload,
  AgentBridgeWorkspaceGitCommitPayload,
  AgentBridgeWorkspaceGitBranchPayload,
  AgentBridgeWorkspaceGitMergePayload,
  AgentBridgeGitHubPayload,
  AgentBridgeWorkspaceGitPathsPayload,
  AgentBridgeWorkspaceGitPullPayload,
  AgentBridgeWorkspaceGitPushPayload,
  AgentBridgeWorkspaceGitStashPayload,
  AgentBridgeWorkspaceGitSubscribePayload,
  AgentBridgeWorkspacePathPayload,
  AgentBridgeWorkspaceRegistryArchivePayload,
  AgentBridgeWorkspaceRegistryListPayload,
  AgentBridgeWorkspaceRegistryOpenPayload,
  AgentBridgeWorkspaceRegistryUpsertPayload,
  AgentBridgeWorkspaceRegistryWritePayload,
  AgentBridgeWorkspaceSessionPayload,
  AgentBridgeWorkspaceServiceQueryPayload,
  AgentBridgeWorkspaceServiceWritePayload,
  AgentBridgeWorkspaceServiceRecord,
  AgentBridgeBrowserPayload,
  AgentBridgeWorktreeArchivePayload,
  AgentBridgeWorktreeCreatePayload,
  AgentBridgeWorktreeListPayload
} from './AgentBridgeModels';
import {
  AgentBridgeRelayAttemptGuard,
  AgentBridgeRelayTranscriptPolicy
} from './AgentBridgeRelayPolicy';

const TAG: string = 'AgentBridgeClient';
const AGENT_BRIDGE_HEARTBEAT_INTERVAL_MS: number = 20000;
const AGENT_BRIDGE_RECONNECT_BASE_DELAY_MS: number = 1200;
const AGENT_BRIDGE_RECONNECT_MAX_DELAY_MS: number = 15000;
const AGENT_BRIDGE_RELAY_HANDSHAKE_MAX_AGE_MS: number = 120000;
const AGENT_BRIDGE_RELAY_MAX_PENDING_FRAMES: number = 64;
const AGENT_BRIDGE_RELAY_MAX_PAYLOAD_BYTES: number = 1048576;
const AGENT_BRIDGE_RELAY_PONG_TIMEOUT_MS: number = 60000;

export type AgentBridgeStatusHandler = (status: string, detail: string) => void;
export type AgentBridgeTextHandler = (text: string) => void;
export type AgentBridgeSessionHandler = (sessionId: string) => void;
export type AgentBridgeTerminalFrameHandler = (frame: AgentBridgeTerminalFrame) => void;
export type AgentBridgeFileTransferFrameHandler = (frame: AgentBridgeFileTransferFrame) => void;

class AgentBridgeRelayOutboundItem {
  readonly contentType: string;
  readonly bytes: Uint8Array;

  constructor(contentType: string, bytes: Uint8Array) {
    this.contentType = contentType;
    this.bytes = new Uint8Array(bytes);
  }
}

class AgentBridgeRelayTransportError extends Error {
  readonly failureCategory: string;

  constructor(failureCategory: string, message: string) {
    super(message);
    this.name = 'AgentBridgeRelayTransportError';
    this.failureCategory = failureCategory;
  }
}

export class AgentBridgeClient {
  private socket: webSocket.WebSocket | null = null;
  private requestSequence: number = 0;
  private currentStatus: string = AgentBridgeConnectionStatus.DISCONNECTED;
  private statusHandler: AgentBridgeStatusHandler | null = null;
  private textHandler: AgentBridgeTextHandler | null = null;
  private errorHandler: AgentBridgeTextHandler | null = null;
  private sessionHandler: AgentBridgeSessionHandler | null = null;
  private terminalFrameHandler: AgentBridgeTerminalFrameHandler | null = null;
  private fileTransferFrameHandler: AgentBridgeFileTransferFrameHandler | null = null;
  private desiredConfig: AgentBridgeConnectionConfig | null = null;
  private appNonceRefresher: (() => string) | null = null;
  private manualDisconnect: boolean = true;
  private reconnectTimer: number = -1;
  private reconnectAttempt: number = 0;
  private heartbeatTimer: number = -1;
  private relayMode: boolean = false;
  private relayAttachAcknowledged: boolean = false;
  private relayReady: boolean = false;
  private relayOwnConnectionId: string = '';
  private relayPeerConnectionId: string = '';
  private relayIdentityAlias: string = '';
  private relayDeviceId: string = '';
  private relaySessionId: string = '';
  private relayClientNonce: string = '';
  private relayIdentity: RelayIdentityInfo | null = null;
  private relayHandshake: RelayHandshakeOffer | null = null;
  private relayHandshakeUsedPairing: boolean = false;
  private relayCryptoSession: RelayCryptoSession | null = null;
  private relayInboundQueue: Array<string> = [];
  private relayInboundBusy: boolean = false;
  private relayOutboundQueue: Array<AgentBridgeRelayOutboundItem> = [];
  private relayOutboundBusy: boolean = false;
  private relayPendingFrameIds: Map<string, number> = new Map();
  private relayLastPongAt: number = 0;
  private readonly relayAttemptGuard: AgentBridgeRelayAttemptGuard = new AgentBridgeRelayAttemptGuard();

  setAppNonceRefresher(refresher: (() => string) | null): void {
    this.appNonceRefresher = refresher;
  }

  setHandlers(
    statusHandler: AgentBridgeStatusHandler,
    textHandler: AgentBridgeTextHandler,
    errorHandler: AgentBridgeTextHandler,
    sessionHandler: AgentBridgeSessionHandler
  ): void {
    this.statusHandler = statusHandler;
    this.textHandler = textHandler;
    this.errorHandler = errorHandler;
    this.sessionHandler = sessionHandler;
  }

  clearHandlers(): void {
    this.statusHandler = null;
    this.textHandler = null;
    this.errorHandler = null;
    this.sessionHandler = null;
    this.terminalFrameHandler = null;
    this.fileTransferFrameHandler = null;
    this.appNonceRefresher = null;
  }

  setBinaryHandlers(
    terminalFrameHandler: AgentBridgeTerminalFrameHandler | null,
    fileTransferFrameHandler: AgentBridgeFileTransferFrameHandler | null
  ): void {
    this.terminalFrameHandler = terminalFrameHandler;
    this.fileTransferFrameHandler = fileTransferFrameHandler;
  }

  static isRelayEndpoint(input: string): boolean {
    const normalized: string = input.trim().toLowerCase();
    return normalized.startsWith('ngf-agent-bridge://relay?') ||
      normalized.startsWith('ngf-agent-bridge://relay#offer=');
  }

  static parseRelayPairingUri(uri: string): AgentBridgeRelayPairingOffer {
    return AgentBridgeIncomingParser.parseRelayPairingUri(uri.trim());
  }

  static buildRelayPublicEndpoint(offer: AgentBridgeRelayPairingOffer): string {
    return AgentBridgeIncomingParser.buildRelayPublicEndpoint(offer);
  }

  connectRelayPairingUri(uri: string, baseConfig: AgentBridgeConnectionConfig | null = null): boolean {
    const offer: AgentBridgeRelayPairingOffer = AgentBridgeClient.parseRelayPairingUri(uri);
    const publicEndpoint: string = AgentBridgeClient.buildRelayPublicEndpoint(offer);
    if (publicEndpoint.length === 0) {
      this.emitError('relay pairing offer is invalid');
      return false;
    }
    const clientId: string = baseConfig !== null ? baseConfig.clientId : 'harmony-coder-app';
    const appNonce: string = baseConfig !== null ? baseConfig.appNonce : '';
    const hostProfileId: string = baseConfig !== null ? baseConfig.hostProfileId : '';
    const appVersion: string = baseConfig !== null ? baseConfig.appVersion : '';
    const config: AgentBridgeConnectionConfig = new AgentBridgeConnectionConfig(
      publicEndpoint,
      '',
      clientId,
      appNonce,
      hostProfileId,
      appVersion
    );
    config.relayUrl = offer.relayUrl;
    config.relayId = offer.relayId;
    config.relayOfferId = offer.offerId;
    config.relayPairingSecret = offer.pairingSecret;
    config.relayPairingExpiresAt = offer.expiresAt;
    config.relayBridgeIdentityPublicKeyBase64 = offer.bridgeIdentityPublicKeyBase64;
    config.relayBridgeIdentityPublicKeyPem = offer.bridgeIdentityPublicKeyPem;
    config.relayBridgeIdentityFingerprint = offer.bridgeIdentityFingerprint;
    this.connectRelay(config);
    return true;
  }

  connectRelay(config: AgentBridgeConnectionConfig): void {
    const prepared: AgentBridgeConnectionConfig | null = this.prepareRelayConfig(config);
    if (prepared === null) {
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, 'relay endpoint is invalid');
      this.emitError('relay endpoint is invalid');
      return;
    }
    this.beginConnection(prepared, true);
  }

  private prepareRelayConfig(config: AgentBridgeConnectionConfig): AgentBridgeConnectionConfig | null {
    let publicEndpoint: AgentBridgeRelayPublicEndpoint = new AgentBridgeRelayPublicEndpoint();
    if (config.endpoint.toLowerCase().startsWith('ngf-agent-bridge://relay?')) {
      publicEndpoint = AgentBridgeIncomingParser.parseRelayPublicEndpoint(config.endpoint);
    } else if (config.relayUrl.length > 0 && config.relayId.length > 0) {
      let descriptor: string = 'ngf-agent-bridge://relay?relayUrl=' + encodeURIComponent(config.relayUrl) +
        '&relayId=' + encodeURIComponent(config.relayId);
      if (config.relayBridgeIdentityPublicKeyBase64.length > 0) {
        descriptor += '&bridgeIdentityPublicKeyBase64=' +
          encodeURIComponent(config.relayBridgeIdentityPublicKeyBase64);
      } else if (config.relayBridgeIdentityPublicKeyPem.length > 0) {
        descriptor += '&bridgeIdentityPublicKeyPem=' + encodeURIComponent(config.relayBridgeIdentityPublicKeyPem);
      }
      descriptor += '&bridgeIdentityFingerprint=' +
        encodeURIComponent(config.relayBridgeIdentityFingerprint);
      publicEndpoint = AgentBridgeIncomingParser.parseRelayPublicEndpoint(descriptor);
    }
    if (!publicEndpoint.isValid()) {
      return null;
    }
    if (config.relayUrl.length > 0 && config.relayUrl !== publicEndpoint.relayUrl) {
      return null;
    }
    if (config.relayId.length > 0 && config.relayId !== publicEndpoint.relayId) {
      return null;
    }
    if (config.relayBridgeIdentityFingerprint.length > 0 &&
      !AgentBridgeClient.constantTimeTextEquals(
        config.relayBridgeIdentityFingerprint.toLowerCase(),
        publicEndpoint.bridgeIdentityFingerprint.toLowerCase()
      )) {
      return null;
    }
    if (config.relayPairingSecret.length > 0) {
      const expiresAt: number = Date.parse(config.relayPairingExpiresAt);
      if (!AgentBridgeClient.isSafeRelayIdentifier(config.relayOfferId, 12, 160) ||
        !AgentBridgeClient.isSafeRelayBase64Url(config.relayPairingSecret, 512) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        config.relayPairingSecret = '';
        config.relayOfferId = '';
        config.relayPairingExpiresAt = '';
        return null;
      }
    } else {
      config.relayOfferId = '';
      config.relayPairingExpiresAt = '';
    }
    config.endpoint = publicEndpoint.relayUrl;
    config.token = '';
    config.relayUrl = publicEndpoint.relayUrl;
    config.relayId = publicEndpoint.relayId;
    config.relayBridgeIdentityPublicKeyBase64 = publicEndpoint.bridgeIdentityPublicKeyBase64;
    config.relayBridgeIdentityPublicKeyPem = publicEndpoint.bridgeIdentityPublicKeyPem;
    config.relayBridgeIdentityFingerprint = publicEndpoint.bridgeIdentityFingerprint.toLowerCase();
    return config;
  }

  connect(config: AgentBridgeConnectionConfig): void {
    if (config.endpoint.toLowerCase().startsWith('ngf-agent-bridge://relay#offer=')) {
      this.connectRelayPairingUri(config.endpoint, config);
      return;
    }
    if (AgentBridgeClient.isRelayEndpoint(config.endpoint) ||
      (config.relayUrl.length > 0 && config.relayId.length > 0)) {
      this.connectRelay(config);
      return;
    }
    this.beginConnection(config, false);
  }

  private beginConnection(config: AgentBridgeConnectionConfig, relayMode: boolean): void {
    const previousRelayMode: boolean = this.relayMode;
    if (previousRelayMode) {
      this.resetRelayAttempt();
    }
    this.relayMode = relayMode;
    this.desiredConfig = config;
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.closeCurrentSocket(false);
    this.openSocket(config);
  }

  private openSocket(config: AgentBridgeConnectionConfig): void {
    const url = this.buildWebSocketUrl(config);
    if (url.length === 0) {
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, 'bridge endpoint is required');
      this.emitError('bridge endpoint is required');
      return;
    }
    const safeUrl = this.safeUrlForLog(url);
    this.emitStatus(AgentBridgeConnectionStatus.CONNECTING, safeUrl);

    const client = webSocket.createWebSocket();
    this.socket = client;

    client.on('open', (err: BusinessError, _value: Object): void => {
      if (this.socket !== client) {
        return;
      }
      if (err) {
        const message = this.businessErrorToString(err);
        logger.warn(TAG, 'bridge websocket open failed: ' + message);
        this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
        this.emitError(message);
        this.closeCurrentSocket(false);
        this.scheduleReconnect();
        return;
      }
      logger.info(TAG, 'bridge websocket opened');
      this.reconnectAttempt = 0;
      if (this.relayMode) {
        this.resetRelayAttempt();
        this.emitStatus(AgentBridgeConnectionStatus.CONNECTING, 'relay attaching');
        this.sendRelayAttach(config);
        return;
      }
      this.emitStatus(AgentBridgeConnectionStatus.CONNECTED, safeUrl);
      this.startHeartbeat();
      this.sendHelloRequest(config, url);
      this.sendCapabilitiesRequest();
    });

    client.on('message', (err: BusinessError, value: string | ArrayBuffer): void => {
      if (this.socket !== client) {
        return;
      }
      if (err) {
        const message = this.businessErrorToString(err);
        logger.warn(TAG, 'bridge websocket message failed: ' + message);
        this.emitError(message);
        return;
      }
      if (typeof value === 'string') {
        logger.info(TAG, 'bridge websocket text message received: bytes=' + value.length.toString());
        if (this.relayMode) {
          this.handleRelayBrokerText(value, config);
        } else {
          this.handleIncomingText(value);
        }
      } else {
        if (this.relayMode) {
          this.failRelayAttempt('relay_protocol_error', 'Relay broker sent an unexpected binary frame');
        } else {
          logger.info(TAG, 'bridge websocket binary message received');
          this.handleIncomingBinary(value);
        }
      }
    });

    client.on('close', (err: BusinessError, _value: Object): void => {
      if (this.socket !== client) {
        return;
      }
      this.socket = null;
      this.stopHeartbeat();
      this.resetRelayAttempt();
      if (err) {
        logger.warn(TAG, 'bridge websocket close with error: ' + this.businessErrorToString(err));
      }
      logger.info(TAG, 'bridge websocket closed');
      if (this.manualDisconnect) {
        this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed');
        return;
      }
      this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed; reconnecting');
      this.scheduleReconnect();
    });

    client.on('error', (err: BusinessError): void => {
      if (this.socket !== client) {
        return;
      }
      const message = this.businessErrorToString(err);
      logger.warn(TAG, 'bridge websocket error: ' + message);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
      this.closeCurrentSocket(false);
      this.scheduleReconnect();
    });

    try {
      client.connect(url, (err: BusinessError, _value: Object): void => {
        if (this.socket !== client) {
          return;
        }
        if (err) {
          const message = this.businessErrorToString(err);
          logger.warn(TAG, 'bridge websocket connect failed: ' + message);
          this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
          this.emitError(message);
          this.closeCurrentSocket(false);
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      const message = this.errorToString(error);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
      this.closeCurrentSocket(false);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.relayMode && this.socket !== null && this.relayAttachAcknowledged) {
      this.sendRelayDetach();
    }
    this.desiredConfig = null;
    this.resetRelayAttempt();
    this.relayMode = false;
    this.closeCurrentSocket(false);
    this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed');
  }

  createSession(providerId: string, workspacePath: string, workspaceTitle: string, modelId: string, speedMode: string, reasoningMode: string = 'auto'): void {
    const payload = new AgentBridgeCreateSessionPayload(providerId, workspacePath, workspaceTitle, modelId, speedMode, reasoningMode);
    this.sendRequest(AgentBridgeRequestType.SESSION_CREATE, payload);
  }

  createAgent(
    providerId: string,
    workspacePath: string,
    workspaceTitle: string,
    workspaceId: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string = 'auto'
  ): string {
    const payload = new AgentBridgeAgentCreatePayload(providerId, workspacePath, workspaceTitle, workspaceId, modelId, speedMode, reasoningMode);
    return this.sendRequest(AgentBridgeRequestType.AGENT_CREATE, payload);
  }

  runAgent(
    agentId: string,
    providerId: string,
    workspacePath: string,
    workspaceTitle: string,
    workspaceId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string = 'auto',
    interactionMode: string = '',
    interactionModes: Array<string> = [],
    agent: string = '',
    contextItems: Array<AgentBridgeContextItem> = [],
    clientMessageId: string = '',
    composerTokensJson: string = '',
    queuePolicy: string = 'queue',
    forkSourceJson: string = ''
  ): string {
    const selectedModes: Array<string> = [];
    for (let index = 0; index < interactionModes.length; index++) {
      selectedModes.push(interactionModes[index]);
    }
    const selectedContextItems: Array<AgentBridgeContextItem> = [];
    for (let index = 0; index < contextItems.length; index++) {
      selectedContextItems.push(contextItems[index]);
    }
    const payload = new AgentBridgeAgentRunPayload(
      agentId,
      providerId,
      workspacePath,
      workspaceTitle,
      workspaceId,
      text,
      modelId,
      speedMode,
      reasoningMode,
      interactionMode,
      selectedModes,
      agent,
      selectedContextItems
    );
    return this.sendRequest(AgentBridgeRequestType.AGENT_RUN, payload);
  }

  sendAgentMessage(
    agentId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string = 'auto',
    interactionMode: string = '',
    interactionModes: Array<string> = [],
    agent: string = '',
    contextItems: Array<AgentBridgeContextItem> = [],
    clientMessageId: string = '',
    composerTokensJson: string = '',
    queuePolicy: string = 'queue',
    forkSourceJson: string = ''
  ): string {
    const selectedModes: Array<string> = [];
    for (let index = 0; index < interactionModes.length; index++) {
      selectedModes.push(interactionModes[index]);
    }
    const selectedContextItems: Array<AgentBridgeContextItem> = [];
    for (let index = 0; index < contextItems.length; index++) {
      selectedContextItems.push(contextItems[index]);
    }
    const payload = new AgentBridgeAgentSendPayload(
      agentId,
      text,
      modelId,
      speedMode,
      reasoningMode,
      interactionMode,
      selectedModes,
      agent,
      selectedContextItems
    );
    return this.sendRequest(AgentBridgeRequestType.AGENT_SEND, payload);
  }

  requestAgentStatus(agentId: string): string {
    return this.sendRequest(AgentBridgeRequestType.AGENT_STATUS, new AgentBridgeAgentActionPayload(agentId));
  }

  attachAgentSession(agentId: string): string {
    return this.sendRequest(AgentBridgeRequestType.AGENT_ATTACH, new AgentBridgeAgentActionPayload(agentId));
  }

  sendMessage(
    sessionId: string,
    text: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string = 'auto',
    interactionMode: string = '',
    interactionModes: Array<string> = [],
    agent: string = '',
    contextItems: Array<AgentBridgeContextItem> = [],
    clientMessageId: string = '',
    composerTokensJson: string = '',
    queuePolicy: string = 'queue',
    forkSourceJson: string = ''
  ): void {
    const selectedModes: Array<string> = [];
    for (let index = 0; index < interactionModes.length; index++) {
      selectedModes.push(interactionModes[index]);
    }
    const selectedContextItems: Array<AgentBridgeContextItem> = [];
    for (let index = 0; index < contextItems.length; index++) {
      selectedContextItems.push(contextItems[index]);
    }
    const payload = new AgentBridgeSendMessagePayload(
      sessionId,
      text,
      modelId,
      speedMode,
      reasoningMode,
      interactionMode,
      selectedModes,
      agent,
      selectedContextItems
    );
    payload.clientMessageId = clientMessageId;
    payload.composerTokensJson = composerTokensJson;
    payload.queuePolicy = queuePolicy;
    payload.forkSourceJson = forkSourceJson;
    this.sendRequest(AgentBridgeRequestType.MESSAGE_SEND, payload);
  }

  requestMessageQueue(sessionId: string): string {
    return this.sendRequest(AgentBridgeRequestType.MESSAGE_QUEUE_LIST, new AgentBridgeExperiencePayload(sessionId));
  }

  cancelQueuedMessage(sessionId: string, queueId: string): string {
    const payload = new AgentBridgeExperiencePayload(sessionId); payload.queueId = queueId;
    return this.sendRequest(AgentBridgeRequestType.MESSAGE_QUEUE_CANCEL, payload);
  }

  retryQueuedMessage(sessionId: string, queueId: string): string {
    const payload = new AgentBridgeExperiencePayload(sessionId); payload.queueId = queueId;
    return this.sendRequest(AgentBridgeRequestType.MESSAGE_QUEUE_RETRY, payload);
  }

  requestUsageSummary(sessionId: string, agentId: string = '', windowName: string = 'session', anchorAt: string = ''): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.window = windowName;
    payload.anchorAt = anchorAt;
    return this.sendRequest(AgentBridgeRequestType.USAGE_SUMMARY_GET, payload);
  }

  requestProviderUsage(providerId: string, sessionId: string = '', agentId: string = '', windowName: string = 'session'): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.providerId = providerId;
    payload.window = windowName;
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_USAGE_LIST, payload);
  }

  requestUsageEvents(sessionId: string, agentId: string = '', windowName: string = 'session', limit: number = 200): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.window = windowName;
    payload.limit = Math.max(1, Math.min(1000, limit));
    return this.sendRequest(AgentBridgeRequestType.USAGE_EVENTS_LIST, payload);
  }

  requestUsageBudget(sessionId: string, agentId: string = '', windowName: string = 'session'): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.window = windowName;
    return this.sendRequest(AgentBridgeRequestType.USAGE_BUDGET_GET, payload);
  }

  setUsageBudget(
    sessionId: string,
    tokenLimit: number,
    costLimit: number,
    currency: string,
    windowName: string,
    warningThreshold: number = 0.8,
    agentId: string = ''
  ): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    if (tokenLimit >= 0) {
      payload.tokenLimit = tokenLimit;
    }
    if (costLimit >= 0) {
      payload.costLimit = costLimit;
    }
    payload.currency = currency;
    payload.window = windowName;
    if (warningThreshold > 0 && warningThreshold <= 1) {
      payload.warningThreshold = warningThreshold;
    }
    return this.sendRequest(AgentBridgeRequestType.USAGE_BUDGET_SET, payload);
  }

  clearUsageBudget(sessionId: string, agentId: string = '', windowName: string = 'session'): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.window = windowName;
    return this.sendRequest(AgentBridgeRequestType.USAGE_BUDGET_SET, payload);
  }

  generateMetadata(sessionId: string, agentId: string, kind: string, prompt: string, diffSummary: string = '', timeoutMs: number = 0): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId); payload.kind = kind; payload.prompt = prompt; payload.diffSummary = diffSummary;
    if (timeoutMs > 0) {
      payload.timeoutMs = Math.max(1000, Math.min(120000, Math.floor(timeoutMs)));
    }
    return this.sendRequest(AgentBridgeRequestType.METADATA_GENERATE, payload);
  }

  cancelMetadataGeneration(requestId: string, sessionId: string = '', agentId: string = '', hostProfileId: string = ''): string {
    const payload = new AgentBridgeExperiencePayload(sessionId, agentId);
    payload.requestId = requestId;
    if (hostProfileId.length > 0) {
      payload.hostProfileId = hostProfileId;
    }
    return this.sendRequest(AgentBridgeRequestType.METADATA_GENERATE_CANCEL, payload);
  }

  exportDiagnostics(format: string = 'json', maxBytes: number = 262144): string {
    const payload = new AgentBridgeExperiencePayload(); payload.format = format;
    payload.maxBytes = Math.max(4096, Math.min(1048576, maxBytes));
    return this.sendRequest(AgentBridgeRequestType.DIAGNOSTICS_EXPORT, payload);
  }

  requestSessions(providerId: string): string {
    return this.sendRequest(AgentBridgeRequestType.SESSION_LIST, new AgentBridgeSessionListPayload(providerId));
  }

  requestProviderCatalog(scope: string, cwd: string, force: boolean): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_CATALOG, new AgentBridgeProviderCatalogPayload(scope, cwd, force));
  }

  refreshProviderCatalog(scope: string, cwd: string): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_CATALOG_REFRESH, new AgentBridgeProviderCatalogPayload(scope, cwd, true));
  }

  requestServerInfo(): string {
    return this.sendRequest(AgentBridgeRequestType.SERVER_INFO_GET, new AgentBridgeEmptyPayload());
  }

  requestVoiceStatus(sessionId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.VOICE_STATUS, new AgentBridgeVoicePayload(sessionId));
  }

  startVoiceSession(sessionId: string, language: string = 'zh-CN'): string {
    const payload = new AgentBridgeVoicePayload(sessionId, language);
    payload.mode = 'remote_stt';
    return this.sendRequest(
      AgentBridgeRequestType.VOICE_SESSION_START,
      payload
    );
  }

  sendVoiceChunk(sessionId: string, sequence: number, audioBase64: string): string {
    return this.sendRequest(
      AgentBridgeRequestType.VOICE_SESSION_CHUNK,
      new AgentBridgeVoicePayload(sessionId, '', sequence, audioBase64)
    );
  }

  finishVoiceSession(sessionId: string): string {
    return this.sendRequest(AgentBridgeRequestType.VOICE_SESSION_FINISH, new AgentBridgeVoicePayload(sessionId));
  }

  cancelVoiceSession(sessionId: string, reason: string = 'user_cancelled'): string {
    return this.sendRequest(
      AgentBridgeRequestType.VOICE_SESSION_CANCEL,
      new AgentBridgeVoicePayload(sessionId, '', 0, '', '', reason)
    );
  }

  speakVoiceText(sessionId: string, text: string, language: string = 'zh-CN', clientRequestId: string = ''): string {
    const payload = new AgentBridgeVoicePayload(sessionId, language, 0, '', text);
    payload.clientRequestId = clientRequestId;
    return this.sendRequest(
      AgentBridgeRequestType.VOICE_TTS_SPEAK,
      payload
    );
  }

  stopVoiceSpeech(requestId: string, reason: string = 'user_interrupt', clientRequestId: string = ''): string {
    const payload = new AgentBridgeVoicePayload('', '', 0, '', '', reason);
    payload.requestId = requestId;
    payload.clientRequestId = clientRequestId;
    return this.sendRequest(
      AgentBridgeRequestType.VOICE_TTS_STOP,
      payload
    );
  }

  requestAgents(includeArchived: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.AGENT_LIST, new AgentBridgeAgentListPayload(includeArchived));
  }

  requestAgentTimeline(agentId: string, cursor: string, direction: string = 'after', limit: number = 200): string {
    return this.sendRequest(AgentBridgeRequestType.TIMELINE_FETCH, new AgentBridgeTimelineFetchPayload(agentId, cursor, direction, limit));
  }

  acknowledgeAgentTimeline(agentId: string, latestSeq: number): string {
    return this.sendRequest(AgentBridgeRequestType.TIMELINE_ACK, new AgentBridgeTimelineAckPayload(agentId, latestSeq));
  }

  stopAgent(agentId: string): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_STOP, new AgentBridgeAgentActionPayload(agentId));
  }

  resumeAgent(agentId: string): string {
    return this.sendRequest(AgentBridgeRequestType.AGENT_RESUME, new AgentBridgeAgentActionPayload(agentId));
  }

  deleteAgent(agentId: string): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_DELETE, new AgentBridgeAgentActionPayload(agentId));
  }

  updateAgent(agentId: string, title: string, workspaceTitle: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_UPDATE, new AgentBridgeAgentUpdatePayload(agentId, title, workspaceTitle));
  }

  setAgentMode(agentId: string, modeId: string, thinkingOptionId: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_MODE_SET, new AgentBridgeAgentModeSetPayload(agentId, modeId, thinkingOptionId));
  }

  setAgentModel(agentId: string, modelId: string): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_MODEL_SET, new AgentBridgeAgentModelSetPayload(agentId, modelId));
  }

  archiveAgent(agentId: string, cascade: boolean = false): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_ARCHIVE, new AgentBridgeAgentActionPayload(agentId, cascade));
  }

  clearAgentAttention(agentId: string): void {
    this.sendRequest(AgentBridgeRequestType.AGENT_ATTENTION_CLEAR, new AgentBridgeAgentActionPayload(agentId));
  }

  forkAgent(
    agentId: string,
    checkpointId: string = '',
    title: string = '',
    parentAgentId: string = '',
    detached: boolean = false,
    workspaceMode: string = 'shared',
    forkPlanId: string = '',
    confirm: boolean = false,
    boundaryMessageId: string = '',
    timelineEpoch: number = 0,
    timelineSeq: number = 0
  ): string {
    const payload = new AgentBridgeAgentForkPayload(
      agentId, checkpointId, title, parentAgentId, detached, workspaceMode, '', '', '', '', !confirm, confirm, forkPlanId
    );
    payload.boundaryMessageId = boundaryMessageId;
    payload.timelineEpoch = timelineEpoch;
    payload.timelineSeq = timelineSeq;
    return this.sendRequest(
      AgentBridgeRequestType.AGENT_FORK,
      payload
    );
  }

  detachAgent(agentId: string): string {
    return this.sendRequest(AgentBridgeRequestType.AGENT_DETACH, new AgentBridgeAgentActionPayload(agentId));
  }

  requestCheckpoints(agentId: string): string {
    return this.sendRequest(AgentBridgeRequestType.CHECKPOINT_LIST, new AgentBridgeCheckpointListPayload(agentId));
  }

  createCheckpoint(agentId: string, title: string = '', description: string = '', includeFiles: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.CHECKPOINT_CREATE, new AgentBridgeCheckpointCreatePayload(agentId, title, description, includeFiles));
  }

  restoreCheckpoint(
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
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.CHECKPOINT_RESTORE,
      new AgentBridgeCheckpointRestorePayload(
        agentId,
        checkpointId,
        restoreFiles,
        dryRun,
        confirm,
        forceConflicts,
        preRestoreSnapshotId,
        restorePlanId,
        restoreRuntime,
        requireRuntimeRestore,
        restoreTerminal
      )
    );
  }

  restorePreRestoreSnapshot(agentId: string, preRestoreSnapshotId: string, dryRun: boolean = true, confirm: boolean = false, forceConflicts: boolean = false): string {
    return this.restoreCheckpoint(agentId, '', true, dryRun, confirm, forceConflicts, preRestoreSnapshotId);
  }

  requestSessionMessages(sessionId: string): void {
    this.sendRequest(AgentBridgeRequestType.SESSION_MESSAGES, new AgentBridgeSessionMessagesPayload(sessionId));
  }

  requestWorkspaceRegistry(includeArchived: boolean = false, limit: number = 12): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_LIST, new AgentBridgeWorkspaceRegistryListPayload(includeArchived, limit));
  }

  upsertWorkspaceRegistry(workspaceId: string, workspacePath: string, workspaceTitle: string, branch: string = '', dedupeByCwd: boolean = true): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_REGISTRY_UPSERT,
      new AgentBridgeWorkspaceRegistryUpsertPayload(workspaceId, workspacePath, workspaceTitle, branch, dedupeByCwd)
    );
  }

  createWorkspaceRegistry(workspaceId: string, workspacePath: string, workspaceTitle: string, preview: boolean = true, confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_REGISTRY_CREATE,
      new AgentBridgeWorkspaceRegistryWritePayload(workspaceId, workspacePath, workspaceTitle, '', true, preview, confirm)
    );
  }

  importWorkspaceRegistry(workspaceId: string, workspacePath: string, workspaceTitle: string, preview: boolean = true, confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_REGISTRY_IMPORT,
      new AgentBridgeWorkspaceRegistryWritePayload(workspaceId, workspacePath, workspaceTitle, '', true, preview, confirm)
    );
  }

  openWorkspaceRegistry(workspaceId: string = '', workspacePath: string = '', dryRun: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_REGISTRY_OPEN,
      new AgentBridgeWorkspaceRegistryOpenPayload(workspaceId, workspacePath, dryRun, !dryRun)
    );
  }

  previewOpenWorkspaceRegistry(workspaceId: string = '', workspacePath: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_OPEN, new AgentBridgeWorkspaceRegistryOpenPayload(workspaceId, workspacePath, true, false));
  }

  confirmOpenWorkspaceRegistry(workspaceId: string = '', workspacePath: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_OPEN, new AgentBridgeWorkspaceRegistryOpenPayload(workspaceId, workspacePath, false, true));
  }

  archiveWorkspaceRegistry(workspaceId: string = '', workspacePath: string = '', preview: boolean = true, confirm: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_ARCHIVE, new AgentBridgeWorkspaceRegistryArchivePayload(workspaceId, workspacePath, preview, confirm));
  }

  requestWorkspaceSuggestions(limit: number = 12): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_SUGGESTIONS, new AgentBridgeWorkspaceRegistryListPayload(false, limit));
  }

  requestWorkspaceRegistryDoctor(includeArchived: boolean = true): string {
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_REGISTRY_DOCTOR, new AgentBridgeWorkspaceRegistryListPayload(includeArchived, 12));
  }

  requestProjectRegistry(): string {
    return this.sendRequest(AgentBridgeRequestType.PROJECT_REGISTRY_LIST, new AgentBridgeEmptyPayload());
  }

  requestTerminals(workspaceId: string = '', cwd: string = '', agentId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_LIST, new AgentBridgeTerminalListPayload(workspaceId, cwd, agentId));
  }

  createTerminal(
    workspaceId: string,
    cwd: string,
    agentId: string = '',
    sessionId: string = '',
    name: string = '',
    rows: number = 24,
    cols: number = 80
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.TERMINAL_CREATE,
      new AgentBridgeTerminalCreatePayload(workspaceId, cwd, agentId, sessionId, name, rows, cols)
    );
  }

  subscribeTerminal(
    terminalId: string,
    agentId: string = '',
    streamProtocolVersion: number = 1,
    lastAppliedRestoreSeq: number = 0,
    lastAppliedSnapshotSeq: number = 0,
    preserveAttention: boolean = false
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.TERMINAL_SUBSCRIBE,
      new AgentBridgeTerminalSubscribePayload(
        terminalId,
        agentId,
        streamProtocolVersion,
        lastAppliedRestoreSeq,
        lastAppliedSnapshotSeq,
        preserveAttention
      )
    );
  }

  unsubscribeTerminal(terminalId: string): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_UNSUBSCRIBE, new AgentBridgeTerminalActionPayload(terminalId));
  }

  captureTerminal(terminalId: string, agentId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_CAPTURE, new AgentBridgeTerminalActionPayload(terminalId, agentId));
  }

  killTerminal(terminalId: string, agentId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_KILL, new AgentBridgeTerminalActionPayload(terminalId, agentId));
  }

  renameTerminal(terminalId: string, name: string, agentId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_RENAME, new AgentBridgeTerminalRenamePayload(terminalId, name, agentId));
  }

  requestTerminalHookStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_HOOK_STATUS, new AgentBridgeEmptyPayload());
  }

  installTerminalHook(force: boolean = false, action: string = 'install', confirm: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.TERMINAL_HOOK_INSTALL, new AgentBridgeTerminalHookInstallPayload(force, action, confirm));
  }

  previewTerminalHook(): string {
    return this.installTerminalHook(false, 'preview', false);
  }

  uninstallTerminalHook(confirm: boolean = false): string {
    return this.installTerminalHook(false, 'uninstall', confirm);
  }

  sendTerminalInput(slot: number, text: string): boolean {
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeTerminalTextFrame(AgentBridgeTerminalFrameOpcode.INPUT, slot, text));
  }

  sendTerminalMouse(slot: number, text: string): boolean {
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeTerminalTextFrame(AgentBridgeTerminalFrameOpcode.MOUSE, slot, text));
  }

  sendTerminalResize(slot: number, rows: number, cols: number): boolean {
    const resizeText = '{"rows":' + String(rows) + ',"cols":' + String(cols) + '}';
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeTerminalTextFrame(AgentBridgeTerminalFrameOpcode.RESIZE, slot, resizeText));
  }

  requestBinaryFileDownload(requestId: string, sessionId: string, workspaceId: string, path: string, parentPath: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.FILE_TRANSFER_DOWNLOAD,
      new AgentBridgeFileTransferDownloadPayload(requestId, sessionId, workspaceId, path, parentPath)
    );
  }

  prepareBinaryFileUpload(
    requestId: string,
    workspaceId: string,
    path: string,
    sizeBytes: number,
    sha256: string,
    overwrite: boolean = true
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.FILE_TRANSFER_UPLOAD,
      new AgentBridgeFileTransferUploadPayload(requestId, workspaceId, path, sizeBytes, sha256, overwrite)
    );
  }

  sendFileUploadBegin(metadata: AgentBridgeFileTransferMetadata): boolean {
    if (metadata.requestId.length === 0) {
      this.emitError('file transfer request id is required');
      return false;
    }
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeFileBeginFrame(metadata.requestId, metadata));
  }

  sendFileUploadChunk(requestId: string, payload: ArrayBuffer): boolean {
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeFileChunkFrame(requestId, payload));
  }

  sendFileUploadEnd(requestId: string): boolean {
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeFileEndFrame(requestId));
  }

  sendFileTransferCancelFrame(requestId: string, message: string): boolean {
    return this.sendBinaryFrame(AgentBridgeBinaryFrameCodec.encodeFileCancelFrame(requestId, message));
  }

  cancelFileTransfer(requestId: string): string {
    return this.sendRequest(AgentBridgeRequestType.FILE_TRANSFER_CANCEL, new AgentBridgeFileTransferCancelPayload(requestId));
  }

  revertSession(sessionId: string, messageId: string): void {
    this.sendRequest(AgentBridgeRequestType.SESSION_REVERT, new AgentBridgeSessionRevertPayload(sessionId, messageId));
  }

  abortSession(providerId: string, sessionId: string, remoteSessionId: string): void {
    if (sessionId.length === 0 && remoteSessionId.length === 0) {
      this.emitError('session id is required');
      return;
    }
    this.sendRequest(
      AgentBridgeRequestType.SESSION_ABORT,
      new AgentBridgeSessionAbortPayload(providerId, sessionId, remoteSessionId)
    );
  }

  requestPreview(sessionId: string, path: string): void {
    const payload = new AgentBridgePreviewPayload(sessionId, path);
    this.sendRequest(AgentBridgeRequestType.PREVIEW_GET, payload);
  }

  requestWorkspaceChanges(sessionId: string, workspaceId: string, agentId: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_CHANGES_GET, new AgentBridgeWorkspaceSessionPayload(sessionId, workspaceId, agentId));
  }

  requestWorkspaceFiles(sessionId: string, workspaceId: string, parentPath: string, agentId: string = ''): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILES_LIST,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, parentPath, parentPath, false, agentId)
    );
  }

  requestWorkspaceDiff(
    sessionId: string,
    workspaceId: string,
    path: string,
    staged: boolean,
    agentId: string = '',
    lineOffset: number = 0,
    fileCursor: number = 0,
    fileLimit: number = 50,
    lineLimit: number = 2000,
    maxBytes: number = 524288
  ): void {
    const payload = new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, '', staged, agentId);
    payload.fileCursor = Math.max(0, Math.floor(fileCursor));
    payload.fileLimit = Math.max(1, Math.min(200, Math.floor(fileLimit)));
    payload.lineOffset = Math.max(0, Math.floor(lineOffset));
    payload.lineLimit = Math.max(1, Math.min(10000, Math.floor(lineLimit)));
    payload.maxBytes = Math.max(1024, Math.min(4 * 1024 * 1024, Math.floor(maxBytes)));
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_DIFF_GET,
      payload
    );
  }

  requestWorkspaceFile(sessionId: string, workspaceId: string, path: string, parentPath: string = '', agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_GET,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, parentPath, false, agentId)
    );
  }

  requestWorkspaceFileDownload(sessionId: string, workspaceId: string, path: string, parentPath: string = '', agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_DOWNLOAD,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, parentPath, false, agentId)
    );
  }

  requestAttachmentFileDownload(sessionId: string, path: string, kind: string): void {
    this.sendRequest(
      AgentBridgeRequestType.ATTACHMENT_FILE_DOWNLOAD,
      new AgentBridgeAttachmentDownloadPayload(sessionId, path, kind)
    );
  }

  stageWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>, agentId: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_STAGE, new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths, agentId));
  }

  unstageWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>, agentId: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_UNSTAGE, new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths, agentId));
  }

  discardWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>, agentId: string = '',
    planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_DISCARD,
      new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths, agentId, planId, confirm)
    );
  }

  commitWorkspaceChanges(sessionId: string, workspaceId: string, message: string, agentId: string = ''): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_COMMIT, new AgentBridgeWorkspaceGitCommitPayload(sessionId, workspaceId, message, agentId));
  }

  gitPull(sessionId: string, workspaceId: string, remote: string = '', branch: string = '', ffOnly: boolean = true,
    agentId: string = '', planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_PULL,
      new AgentBridgeWorkspaceGitPullPayload(sessionId, workspaceId, remote, branch, ffOnly, agentId, planId, confirm)
    );
  }

  gitPush(sessionId: string, workspaceId: string, remote: string = '', branch: string = '', force: boolean = false,
    agentId: string = '', planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_PUSH,
      new AgentBridgeWorkspaceGitPushPayload(sessionId, workspaceId, remote, branch, force, agentId, planId, confirm)
    );
  }

  gitBranch(sessionId: string, workspaceId: string, action: string = 'list', name: string = '', startPoint: string = '',
    force: boolean = false, agentId: string = '', planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_BRANCH,
      new AgentBridgeWorkspaceGitBranchPayload(sessionId, workspaceId, action, name, startPoint, force, agentId, planId, confirm)
    );
  }

  gitStash(sessionId: string, workspaceId: string, action: string = 'push', message: string = '', ref: string = '',
    includeUntracked: boolean = true, agentId: string = '', planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_STASH,
      new AgentBridgeWorkspaceGitStashPayload(
        sessionId,
        workspaceId,
        action,
        message,
        ref,
        includeUntracked,
        agentId,
        planId,
        confirm
      )
    );
  }

  gitMerge(sessionId: string, workspaceId: string, ref: string, noCommit: boolean = false, ffOnly: boolean = false,
    agentId: string = '', planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_MERGE,
      new AgentBridgeWorkspaceGitMergePayload(sessionId, workspaceId, ref, noCommit, ffOnly, agentId, planId, confirm)
    );
  }

  subscribeGitDiff(sessionId: string, workspaceId: string, subscriptionId: string = '', intervalMs: number = 5000, agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_SUBSCRIBE,
      new AgentBridgeWorkspaceGitSubscribePayload(sessionId, workspaceId, 'subscribe', subscriptionId, intervalMs, true, agentId)
    );
  }

  unsubscribeGitDiff(sessionId: string, workspaceId: string, subscriptionId: string, agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_SUBSCRIBE,
      new AgentBridgeWorkspaceGitSubscribePayload(sessionId, workspaceId, 'unsubscribe', subscriptionId, 5000, false, agentId)
    );
  }

  pauseGitDiffSubscription(sessionId: string, workspaceId: string, subscriptionId: string, agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_SUBSCRIBE,
      new AgentBridgeWorkspaceGitSubscribePayload(sessionId, workspaceId, 'pause', subscriptionId, 5000, true, agentId)
    );
  }

  resumeGitDiffSubscription(sessionId: string, workspaceId: string, subscriptionId: string, agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_SUBSCRIBE,
      new AgentBridgeWorkspaceGitSubscribePayload(sessionId, workspaceId, 'resume', subscriptionId, 5000, true, agentId)
    );
  }

  requestGitDiffSubscriptionStatus(sessionId: string, workspaceId: string, subscriptionId: string, agentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_GIT_SUBSCRIBE,
      new AgentBridgeWorkspaceGitSubscribePayload(sessionId, workspaceId, 'status', subscriptionId, 5000, true, agentId)
    );
  }

  createGitHubPullRequest(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    head: string,
    base: string,
    title: string,
    body: string = '',
    draft: boolean = false,
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.head = head;
    payload.base = base;
    payload.title = title;
    payload.body = body;
    payload.draft = draft;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_CREATE, payload);
  }

  startGitHubDeviceAuthorization(clientId: string = ''): string {
    const payload = new AgentBridgeGitHubPayload('', '');
    payload.clientId = clientId;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_AUTH_DEVICE_START, payload);
  }

  pollGitHubDeviceAuthorization(authSessionId: string): string {
    const payload = new AgentBridgeGitHubPayload('', '');
    payload.authSessionId = authSessionId;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_AUTH_DEVICE_POLL, payload);
  }

  requestGitHubAuthStatus(accountId: string = ''): string {
    const payload = new AgentBridgeGitHubPayload('', '');
    payload.accountId = accountId;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_AUTH_STATUS, payload);
  }

  logoutGitHub(accountId: string = ''): string {
    const payload = new AgentBridgeGitHubPayload('', '');
    payload.accountId = accountId;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_AUTH_LOGOUT, payload);
  }

  setGitHubRepositoryBinding(hostProfileId: string, workspaceId: string, accountId: string,
    owner: string, repo: string, confirm: boolean = true): string {
    const payload = new AgentBridgeGitHubPayload('', workspaceId, '', owner, repo);
    payload.hostProfileId = hostProfileId;
    payload.accountId = accountId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_BINDING_SET, payload);
  }

  updateGitHubPullRequestReviewers(sessionId: string, workspaceId: string, workspacePath: string,
    number: number, reviewers: Array<string>, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.number = number;
    payload.reviewers = reviewers;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_REVIEWERS_UPDATE, payload);
  }

  updateGitHubPullRequestLabels(sessionId: string, workspaceId: string, workspacePath: string,
    number: number, labels: Array<string>, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.number = number;
    payload.labels = labels;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_LABELS_UPDATE, payload);
  }

  listGitHubPullRequests(sessionId: string, workspaceId: string, workspacePath: string, page: number = 1): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.page = page;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_LIST, payload);
  }

  updateGitHubPullRequest(sessionId: string, workspaceId: string, workspacePath: string, number: number,
    title: string, ready: boolean, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.number = number;
    payload.title = title;
    payload.ready = ready;
    payload.planId = planId;
    payload.confirm = confirm;
    payload.preview = !confirm;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_UPDATE, payload);
  }

  setGitHubWatch(sessionId: string, workspaceId: string, workspacePath: string, number: number,
    subscriberId: string, enabled: boolean, watchId: string = ''): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.number = number;
    payload.subscriberId = subscriberId;
    payload.watchId = watchId;
    return this.sendRequest(enabled ? AgentBridgeRequestType.GITHUB_WATCH_START : AgentBridgeRequestType.GITHUB_WATCH_STOP, payload);
  }

  previewGitHubAttachment(sessionId: string, workspaceId: string, workspacePath: string, number: number,
    filePath: string): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.number = number;
    payload.filePath = filePath;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_ATTACHMENT_PREVIEW, payload);
  }

  uploadGitHubAttachment(sessionId: string, workspaceId: string, workspacePath: string, planId: string): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath);
    payload.planId = planId;
    payload.confirm = true;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_ATTACHMENT_UPLOAD, payload);
  }

  requestGitHubPullRequestStatus(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    number: number,
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.number = number;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_STATUS, payload);
  }

  mergeGitHubPullRequest(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    number: number,
    mergeMethod: string = 'merge',
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.number = number;
    payload.mergeMethod = mergeMethod;
    payload.confirm = true;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_PR_MERGE, payload);
  }

  requestGitHubChecks(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    sha: string,
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.sha = sha;
    payload.ref = sha;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_CHECKS_LIST, payload);
  }

  searchGitHubIssues(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    keyword: string,
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.keyword = keyword;
    payload.state = 'open';
    return this.sendRequest(AgentBridgeRequestType.GITHUB_ISSUE_SEARCH, payload);
  }

  listGitHubIssueAttachments(
    sessionId: string,
    workspaceId: string,
    workspacePath: string,
    number: number,
    owner: string = '',
    repo: string = ''
  ): string {
    const payload = new AgentBridgeGitHubPayload(sessionId, workspaceId, workspacePath, owner, repo);
    payload.number = number;
    return this.sendRequest(AgentBridgeRequestType.GITHUB_ISSUE_ATTACHMENT_LIST, payload);
  }

  listWorktrees(sessionId: string, workspaceId: string, workspacePath: string = '', includeArchived: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.WORKTREE_LIST, new AgentBridgeWorktreeListPayload(sessionId, workspaceId, workspacePath, includeArchived));
  }

  createWorktree(
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
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKTREE_CREATE,
      new AgentBridgeWorktreeCreatePayload(sessionId, workspaceId, workspacePath, worktreePath, branch, startPoint, title, preview, confirm, sourceWorkspaceId, sourceRootPath)
    );
  }

  archiveWorktree(sessionId: string, workspaceId: string, workspacePath: string, worktreePath: string, force: boolean = false, confirm: boolean = false): string {
    return this.sendRequest(AgentBridgeRequestType.WORKTREE_ARCHIVE, new AgentBridgeWorktreeArchivePayload(sessionId, workspaceId, workspacePath, worktreePath, force, confirm));
  }

  listProviderProfiles(): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_PROFILE_LIST, new AgentBridgeEmptyPayload());
  }

  upsertProviderProfile(
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
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_PROFILE_UPSERT,
      new AgentBridgeProviderProfileUpsertPayload(profileId, providerId, displayName, description, endpoint, binary, args, cwd, runtimeMode, enabled, env, envProvided, baseProfileId, cloneFromProfileId)
    );
  }

  cloneProviderProfile(sourceProfileId: string, profileId: string, displayName: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_PROFILE_UPSERT, new AgentBridgeProviderProfileClonePayload(sourceProfileId, profileId, displayName));
  }

  deleteProviderProfile(profileId: string): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_PROFILE_DELETE, new AgentBridgeProviderProfileDeletePayload(profileId));
  }

  testProviderProfile(profileId: string, runCommand: boolean = false, testArgs: string = '', timeoutMs: number = 3000): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_PROFILE_TEST, new AgentBridgeProviderProfileTestPayload(profileId, runCommand, testArgs, timeoutMs));
  }

  discoverAcpProviders(catalogPath: string = '', directory: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_ACP_DISCOVER, new AgentBridgeProviderAcpDiscoverPayload(catalogPath, directory));
  }

  importAcpProviders(
    catalogPath: string = '',
    directory: string = '',
    profileIds: Array<string> = [],
    confirm: boolean = false,
    duplicatePolicy: string = 'skip'
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_ACP_IMPORT,
      new AgentBridgeProviderAcpImportPayload(catalogPath, directory, profileIds, confirm, duplicatePolicy)
    );
  }

  listRemoteProviderDirectory(query: string = '', providerId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_DIRECTORY_LIST,
      new AgentBridgeProviderDirectoryListPayload(query, providerId)
    );
  }

  refreshRemoteProviderDirectory(url: string): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_DIRECTORY_REFRESH,
      new AgentBridgeProviderDirectoryRefreshPayload(url)
    );
  }

  installRemoteProvider(providerId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_DIRECTORY_INSTALL,
      new AgentBridgeProviderDirectoryInstallPayload(providerId, planId, confirm)
    );
  }

  removeRemoteProvider(
    providerId: string,
    profileId: string = '',
    planId: string = '',
    confirm: boolean = false
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_DIRECTORY_REMOVE,
      new AgentBridgeProviderDirectoryRemovePayload(providerId, profileId, planId, confirm)
    );
  }

  requestRemoteProviderStatus(providerId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.PROVIDER_DIRECTORY_STATUS, new AgentBridgeProviderDirectoryStatusPayload(providerId));
  }

  rollbackRemoteProvider(providerId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.PROVIDER_DIRECTORY_ROLLBACK,
      new AgentBridgeProviderDirectoryRollbackPayload(providerId, planId, confirm)
    );
  }

  requestNotifications(includeRead: boolean = true, limit: number = 100): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_LIST,
      new AgentBridgeNotificationListPayload(includeRead, limit)
    );
  }

  markNotificationRead(notificationId: string, read: boolean = true): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_READ,
      new AgentBridgeNotificationReadPayload(notificationId, read)
    );
  }

  actOnNotification(notificationId: string, actionId: string = 'open'): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_ACTION,
      new AgentBridgeNotificationActionPayload(notificationId, actionId)
    );
  }

  pruneNotifications(includeRead: boolean = true, nowMs: number = 0): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_PRUNE,
      new AgentBridgeNotificationPrunePayload(includeRead, nowMs)
    );
  }

  requestPushStatus(deviceId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_PUSH_STATUS,
      new AgentBridgePushStatusPayload(deviceId, true)
    );
  }

  registerPushToken(token: string, deviceId: string, appVersion: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_PUSH_REGISTER,
      new AgentBridgePushRegisterPayload(token, deviceId, 'harmonyos', appVersion)
    );
  }

  unregisterPushToken(subscriptionId: string, deviceId: string = '', tokenFingerprint: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.NOTIFICATION_PUSH_UNREGISTER,
      new AgentBridgePushUnregisterPayload(subscriptionId, deviceId, tokenFingerprint)
    );
  }

  requestDaemonStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_STATUS, new AgentBridgeEmptyPayload());
  }

  requestDaemonInstanceStatus(hostProfileId: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_INSTANCE_STATUS, new AgentBridgeDaemonConfigPayload('', '', false, hostProfileId));
  }

  requestDaemonConfigStatus(hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_STATUS,
      new AgentBridgeDaemonConfigPayload('', '', false, hostProfileId)
    );
  }

  listWorkspaceServices(workspaceId: string = '', ownerAgentId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_SERVICE_LIST,
      new AgentBridgeWorkspaceServiceQueryPayload('', workspaceId, ownerAgentId)
    );
  }

  upsertWorkspaceService(service: AgentBridgeWorkspaceServiceRecord, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeWorkspaceServiceWritePayload(service);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_UPSERT, payload);
  }

  requestWorkspaceServiceStatus(serviceId: string): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_SERVICE_STATUS,
      new AgentBridgeWorkspaceServiceQueryPayload(serviceId)
    );
  }

  requestWorkspaceServiceHealth(serviceId: string): string {
    return this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_SERVICE_HEALTH,
      new AgentBridgeWorkspaceServiceQueryPayload(serviceId)
    );
  }

  startWorkspaceService(serviceId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeWorkspaceServiceQueryPayload(serviceId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_START, payload);
  }

  stopWorkspaceService(serviceId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeWorkspaceServiceQueryPayload(serviceId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_STOP, payload);
  }

  requestWorkspaceServiceLogs(serviceId: string, maxBytes: number = 65536): string {
    const payload = new AgentBridgeWorkspaceServiceQueryPayload(serviceId);
    payload.maxBytes = Math.max(1024, Math.min(1048576, maxBytes));
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_LOGS, payload);
  }

  openWorkspaceService(
    serviceId: string,
    ownerAgentId: string = '',
    planId: string = '',
    confirm: boolean = false
  ): string {
    const payload = new AgentBridgeWorkspaceServiceQueryPayload(serviceId, '', ownerAgentId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_OPEN, payload);
  }

  removeWorkspaceService(serviceId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeWorkspaceServiceQueryPayload(serviceId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.WORKSPACE_SERVICE_REMOVE, payload);
  }

  listBrowserHosts(workspaceId: string): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_HOST_LIST, payload);
  }

  listBrowserInstances(workspaceId: string, agentId: string = '', hostId: string = ''): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_INSTANCE_LIST, payload);
  }

  createBrowserInstance(
    workspaceId: string,
    agentId: string = '',
    hostId: string = '',
    profile: string = ''
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.profile = profile;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_INSTANCE_CREATE, payload);
  }

  closeBrowserInstance(
    workspaceId: string,
    instanceId: string,
    hostId: string = '',
    agentId: string = '',
    planId: string = '',
    confirm: boolean = false
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_INSTANCE_CLOSE, payload);
  }

  listBrowserPages(workspaceId: string, agentId: string = '', hostId: string = '', instanceId: string = ''): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_LIST, payload);
  }

  createBrowserPage(workspaceId: string, url: string, agentId: string = '', hostId: string = '', instanceId: string = ''): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.url = url;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_CREATE, payload);
  }

  closeBrowserPage(
    workspaceId: string,
    pageId: string,
    agentId: string = '',
    hostId: string = '',
    instanceId: string = '',
    planId: string = '',
    confirm: boolean = false
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.pageId = pageId;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_CLOSE, payload);
  }

  navigateBrowserPage(
    workspaceId: string,
    pageId: string,
    operation: string,
    url: string = '',
    hostId: string = '',
    agentId: string = '',
    instanceId: string = ''
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.pageId = pageId;
    payload.operation = operation;
    payload.url = url;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_NAVIGATE, payload);
  }

  requestBrowserSnapshot(workspaceId: string, pageId: string, hostId: string = ''): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.hostId = hostId;
    payload.pageId = pageId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_SNAPSHOT, payload);
  }

  requestBrowserScreenshot(workspaceId: string, pageId: string, fullPage: boolean = false, hostId: string = ''): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.hostId = hostId;
    payload.pageId = pageId;
    payload.fullPage = fullPage;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_SCREENSHOT, payload);
  }

  requestBrowserLogs(
    workspaceId: string,
    pageId: string,
    maxEntries: number = 100,
    hostId: string = '',
    agentId: string = '',
    instanceId: string = ''
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.pageId = pageId;
    payload.maxEntries = Math.max(1, Math.min(500, Math.floor(maxEntries)));
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_LOGS, payload);
  }

  waitBrowserPage(
    workspaceId: string,
    pageId: string,
    text: string = '',
    url: string = '',
    timeoutMs: number = 30000,
    hostId: string = '',
    agentId: string = '',
    instanceId: string = ''
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.pageId = pageId;
    payload.text = text;
    payload.url = url;
    payload.timeoutMs = Math.max(100, Math.min(120000, Math.floor(timeoutMs)));
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_WAIT, payload);
  }

  listBrowserDownloads(
    workspaceId: string,
    pageId: string = '',
    hostId: string = '',
    agentId: string = '',
    instanceId: string = ''
  ): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.agentId = agentId;
    payload.hostId = hostId;
    payload.instanceId = instanceId;
    payload.pageId = pageId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_DOWNLOAD_LIST, payload);
  }

  requestBrowserPermission(workspaceId: string): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PERMISSION_GET, payload);
  }

  setBrowserPermission(workspaceId: string, domains: Array<string>, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeBrowserPayload();
    payload.workspaceId = workspaceId;
    payload.domains = domains;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PERMISSION_SET, payload);
  }

  runBrowserAction(payload: AgentBridgeBrowserPayload): string {
    return this.sendRequest(AgentBridgeRequestType.BROWSER_PAGE_ACTION, payload);
  }

  fetchDaemonConfig(url: string, hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_FETCH,
      new AgentBridgeDaemonConfigPayload(url, '', false, hostProfileId)
    );
  }

  validateDaemonConfig(hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_VALIDATE,
      new AgentBridgeDaemonConfigPayload('', '', false, hostProfileId)
    );
  }

  previewDaemonConfig(hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_PREVIEW,
      new AgentBridgeDaemonConfigPayload('', '', false, hostProfileId)
    );
  }

  applyDaemonConfig(planId: string, confirm: boolean = true, hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_APPLY,
      new AgentBridgeDaemonConfigPayload('', planId, confirm, hostProfileId)
    );
  }

  rollbackDaemonConfig(planId: string = '', confirm: boolean = false, hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_CONFIG_ROLLBACK,
      new AgentBridgeDaemonConfigPayload('', planId, confirm, hostProfileId)
    );
  }

  requestScheduleStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_STATUS, new AgentBridgeEmptyPayload());
  }

  listSchedules(query: string = '', enabled: boolean | undefined = undefined): string {
    const payload = new AgentBridgeScheduleQueryPayload('', query);
    payload.enabled = enabled;
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_LIST, payload);
  }

  getSchedule(scheduleId: string): string {
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_GET, new AgentBridgeScheduleQueryPayload(scheduleId));
  }

  saveSchedule(schedule: AgentBridgeScheduleRecord, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeScheduleWritePayload(
      schedule.id,
      schedule.name,
      schedule.prompt,
      schedule.workspaceId,
      schedule.workspacePath,
      schedule.providerId,
      schedule.modelId,
      schedule.enabled,
      schedule.cadence,
      schedule.concurrency,
      schedule.retry,
      schedule.retention,
      schedule.missedRunPolicy,
      planId,
      confirm
    );
    const requestType = schedule.id.length > 0 ? AgentBridgeRequestType.SCHEDULE_UPDATE : AgentBridgeRequestType.SCHEDULE_CREATE;
    return this.sendRequest(requestType, payload);
  }

  setScheduleEnabled(scheduleId: string, enabled: boolean, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeScheduleQueryPayload(scheduleId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(
      enabled ? AgentBridgeRequestType.SCHEDULE_ENABLE : AgentBridgeRequestType.SCHEDULE_DISABLE,
      payload
    );
  }

  runScheduleNow(scheduleId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeScheduleQueryPayload(scheduleId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_RUN_NOW, payload);
  }

  requestScheduleHistory(scheduleId: string, before: string = '', limit: number = 50): string {
    const payload = new AgentBridgeScheduleQueryPayload(scheduleId, '', Math.max(1, Math.min(200, limit)));
    payload.before = before;
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_HISTORY, payload);
  }

  removeSchedule(scheduleId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeScheduleQueryPayload(scheduleId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.SCHEDULE_REMOVE, payload);
  }

  requestLoopStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.LOOP_STATUS, new AgentBridgeEmptyPayload());
  }

  listLoops(query: string = '', status: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.LOOP_LIST, new AgentBridgeLoopQueryPayload('', query, status));
  }

  getLoop(loopId: string): string {
    return this.sendRequest(AgentBridgeRequestType.LOOP_GET, new AgentBridgeLoopQueryPayload(loopId));
  }

  saveLoop(loop: AgentBridgeLoopRecord, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeLoopWritePayload(
      loop.id,
      loop.name,
      loop.prompt,
      loop.verifyPrompt,
      loop.acceptanceCriteria,
      loop.workspaceId,
      loop.workspacePath,
      loop.sourceAgentId,
      loop.workerProviderId,
      loop.workerModelId,
      loop.verifierProviderId,
      loop.verifierModelId,
      loop.workspaceMode,
      loop.maxRounds,
      loop.budget,
      planId,
      confirm
    );
    const requestType = loop.id.length > 0 ? AgentBridgeRequestType.LOOP_UPDATE : AgentBridgeRequestType.LOOP_CREATE;
    return this.sendRequest(requestType, payload);
  }

  startLoop(loopId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendLoopAction(AgentBridgeRequestType.LOOP_START, loopId, planId, confirm);
  }

  pauseLoop(loopId: string): string {
    return this.sendRequest(AgentBridgeRequestType.LOOP_PAUSE, new AgentBridgeLoopQueryPayload(loopId));
  }

  resumeLoop(loopId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendLoopAction(AgentBridgeRequestType.LOOP_RESUME, loopId, planId, confirm);
  }

  stopLoop(loopId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendLoopAction(AgentBridgeRequestType.LOOP_STOP, loopId, planId, confirm);
  }

  takeoverLoop(loopId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendLoopAction(AgentBridgeRequestType.LOOP_TAKEOVER, loopId, planId, confirm);
  }

  requestLoopRounds(loopId: string, offset: number = 0, limit: number = 20): string {
    const payload = new AgentBridgeLoopQueryPayload(loopId);
    payload.offset = Math.max(0, offset);
    payload.limit = Math.max(1, Math.min(100, limit));
    return this.sendRequest(AgentBridgeRequestType.LOOP_ROUNDS, payload);
  }

  removeLoop(loopId: string, planId: string = '', confirm: boolean = false): string {
    return this.sendLoopAction(AgentBridgeRequestType.LOOP_REMOVE, loopId, planId, confirm);
  }

  requestChatRoomStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_STATUS, new AgentBridgeEmptyPayload());
  }

  listChatRooms(query: string = '', includeArchived: boolean = false): string {
    const payload = new AgentBridgeChatRoomWritePayload();
    payload.query = query;
    payload.includeArchived = includeArchived;
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_LIST, payload);
  }

  getChatRoom(roomId: string): string {
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_GET, new AgentBridgeChatRoomWritePayload(roomId));
  }

  saveChatRoom(room: AgentBridgeChatRoom, actorDisplayName: string = '', planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeChatRoomWritePayload(room.id, room.name, room.purpose, room.workspaceId);
    payload.retentionMaxMessages = room.retentionMaxMessages > 0 ? room.retentionMaxMessages : 1000;
    payload.actorDisplayName = actorDisplayName;
    payload.planId = planId;
    payload.confirm = confirm;
    const requestType = room.id.length > 0 ? AgentBridgeRequestType.CHAT_ROOM_UPDATE : AgentBridgeRequestType.CHAT_ROOM_CREATE;
    return this.sendRequest(requestType, payload);
  }

  archiveChatRoom(roomId: string, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeChatRoomWritePayload(roomId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_ARCHIVE, payload);
  }

  addChatRoomMember(roomId: string, member: AgentBridgeChatRoomMember, planId: string = '', confirm: boolean = false): string {
    const payload = new AgentBridgeChatRoomMemberPayload(roomId, member);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_MEMBER_ADD, payload);
  }

  updateChatRoomMember(
    roomId: string,
    memberId: string,
    role: string,
    displayName: string,
    planId: string = '',
    confirm: boolean = false
  ): string {
    const member = new AgentBridgeChatRoomMember();
    member.memberId = memberId;
    member.role = role;
    member.displayName = displayName;
    const payload = new AgentBridgeChatRoomMemberPayload(roomId, member);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_MEMBER_UPDATE, payload);
  }

  removeChatRoomMember(roomId: string, memberId: string, planId: string = '', confirm: boolean = false): string {
    const member = new AgentBridgeChatRoomMember();
    member.memberId = memberId;
    const payload = new AgentBridgeChatRoomMemberPayload(roomId, member);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_MEMBER_REMOVE, payload);
  }

  postChatRoomMessage(
    roomId: string,
    clientMessageId: string,
    body: string,
    replyToMessageId: string = '',
    mentionMemberIds: Array<string> = []
  ): string {
    return this.sendRequest(
      AgentBridgeRequestType.CHAT_ROOM_MESSAGE_POST,
      new AgentBridgeChatRoomMessagePayload(roomId, clientMessageId, body, replyToMessageId, mentionMemberIds)
    );
  }

  requestChatRoomMessages(roomId: string, afterSeq: number = 0, beforeSeq: number = 0, limit: number = 50): string {
    return this.sendRequest(
      AgentBridgeRequestType.CHAT_ROOM_MESSAGE_LIST,
      new AgentBridgeChatRoomMessageListPayload(roomId, afterSeq, beforeSeq, Math.max(1, Math.min(200, limit)))
    );
  }

  acknowledgeChatRoom(roomId: string, lastSeq: number): string {
    return this.sendRequest(AgentBridgeRequestType.CHAT_ROOM_ACK, new AgentBridgeChatRoomAckPayload(roomId, lastSeq));
  }

  private sendLoopAction(requestType: string, loopId: string, planId: string, confirm: boolean): string {
    const payload = new AgentBridgeLoopQueryPayload(loopId);
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(requestType, payload);
  }

  requestDaemonHealth(): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_HEALTH, new AgentBridgeEmptyPayload());
  }

  startDaemon(): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_START, new AgentBridgeEmptyPayload());
  }

  stopDaemon(): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_STOP, new AgentBridgeEmptyPayload());
  }

  restartDaemon(expectedInstanceId: string = '', expectedGeneration: number = 0, hostProfileId: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_RESTART,
      new AgentBridgeDaemonTargetPayload(expectedInstanceId, expectedGeneration, hostProfileId)
    );
  }

  requestDaemonLogs(maxBytes: number = 65536): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_LOGS, new AgentBridgeDaemonLogsPayload(maxBytes));
  }

  requestDaemonAutostartStatus(): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_AUTOSTART_STATUS,
      new AgentBridgeDaemonAutostartPreviewPayload('auto')
    );
  }

  previewDaemonAutostart(method: string = 'auto'): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_AUTOSTART_PREVIEW, new AgentBridgeDaemonAutostartPreviewPayload(method));
  }

  setDaemonAutostart(enabled: boolean, method: string = 'auto'): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_AUTOSTART_SET, new AgentBridgeDaemonAutostartPayload(enabled, method));
  }

  installDaemonAutostart(method: string = 'auto', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_AUTOSTART_INSTALL,
      new AgentBridgeDaemonAutostartActionPayload(method, confirm)
    );
  }

  uninstallDaemonAutostart(method: string = 'auto', confirm: boolean = false): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_AUTOSTART_UNINSTALL,
      new AgentBridgeDaemonAutostartActionPayload(method, confirm)
    );
  }

  requestDaemonUpdateStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.DAEMON_UPDATE_STATUS, new AgentBridgeEmptyPayload());
  }

  checkDaemonUpdate(channel: string = 'latest', version: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_UPDATE_CHECK,
      new AgentBridgeDaemonUpdateQueryPayload(channel, version)
    );
  }

  previewDaemonUpdate(channel: string = 'latest', version: string = ''): string {
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_UPDATE_PREVIEW,
      new AgentBridgeDaemonUpdateQueryPayload(channel, version)
    );
  }

  installDaemonUpdate(channel: string = 'latest', version: string = '', confirm: boolean = false, force: boolean = false,
    expectedInstanceId: string = '', expectedGeneration: number = 0, hostProfileId: string = ''): string {
    const payload = new AgentBridgeDaemonUpdateInstallPayload(channel, version, confirm, force);
    payload.expectedInstanceId = expectedInstanceId;
    payload.expectedGeneration = expectedGeneration;
    payload.hostProfileId = hostProfileId;
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_UPDATE_INSTALL,
      payload
    );
  }

  rollbackDaemonUpdate(confirm: boolean = false, expectedInstanceId: string = '', expectedGeneration: number = 0,
    hostProfileId: string = ''): string {
    const payload = new AgentBridgeDaemonUpdateRollbackPayload(confirm);
    payload.expectedInstanceId = expectedInstanceId;
    payload.expectedGeneration = expectedGeneration;
    payload.hostProfileId = hostProfileId;
    return this.sendRequest(
      AgentBridgeRequestType.DAEMON_UPDATE_ROLLBACK,
      payload
    );
  }

  listSecurityDevices(): string {
    return this.sendRequest(AgentBridgeRequestType.SECURITY_DEVICE_LIST, new AgentBridgeEmptyPayload());
  }

  trustSecurityDevice(physicalDeviceId: string = '', publicKeyFingerprint: string = '', displayName: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.SECURITY_DEVICE_TRUST, new AgentBridgeSecurityDeviceActionPayload(physicalDeviceId, publicKeyFingerprint, displayName));
  }

  revokeSecurityDevice(physicalDeviceId: string = '', publicKeyFingerprint: string = ''): string {
    return this.sendRequest(AgentBridgeRequestType.SECURITY_DEVICE_REVOKE, new AgentBridgeSecurityDeviceActionPayload(physicalDeviceId, publicKeyFingerprint, ''));
  }

  requestRelayStatus(): string {
    return this.sendRequest(AgentBridgeRequestType.RELAY_STATUS, new AgentBridgeRelayManagementPayload());
  }

  startRelayPairing(
    relayUrl: string,
    relayId: string = '',
    ttlMs: number = 300000,
    confirm: boolean = false
  ): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.relayUrl = relayUrl;
    payload.relayId = relayId;
    payload.ttlMs = ttlMs;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_PAIRING_START, payload);
  }

  cancelRelayPairing(offerId: string = '', confirm: boolean = false): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.offerId = offerId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_PAIRING_CANCEL, payload);
  }

  connectBridgeRelay(relayUrl: string, relayId: string, confirm: boolean = false): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.relayUrl = relayUrl;
    payload.relayId = relayId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_CONNECT, payload);
  }

  disconnectBridgeRelay(confirm: boolean = false): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_DISCONNECT, payload);
  }

  listRelayDevices(includeRevoked: boolean = true): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.includeRevoked = includeRevoked;
    return this.sendRequest(AgentBridgeRequestType.RELAY_DEVICE_LIST, payload);
  }

  revokeRelayDevice(deviceId: string, planId: string = '', confirm: boolean = false): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.deviceId = deviceId;
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_DEVICE_REVOKE, payload);
  }

  rotateRelayIdentity(planId: string = '', confirm: boolean = false): string {
    const payload: AgentBridgeRelayManagementPayload = new AgentBridgeRelayManagementPayload();
    payload.planId = planId;
    payload.confirm = confirm;
    return this.sendRequest(AgentBridgeRequestType.RELAY_IDENTITY_ROTATE, payload);
  }

  respondPermission(
    providerId: string,
    sessionId: string,
    requestId: string,
    permissionId: string,
    reply: string,
    message: string
  ): void {
    const payload = new AgentBridgePermissionRespondPayload(
      providerId,
      sessionId,
      requestId,
      permissionId,
      reply,
      message
    );
    this.sendRequest(AgentBridgeRequestType.PERMISSION_RESPOND, payload);
  }

  respondRequest(
    providerId: string,
    sessionId: string,
    requestId: string,
    questionId: string,
    optionId: string,
    answer: string,
    message: string
  ): void {
    const payload = new AgentBridgeRequestRespondPayload(
      providerId,
      sessionId,
      requestId,
      questionId,
      optionId,
      answer,
      message
    );
    this.sendRequest(AgentBridgeRequestType.REQUEST_RESPOND, payload);
  }

  respondPlan(providerId: string, sessionId: string, planId: string, reply: string, message: string): void {
    const payload = new AgentBridgePlanRespondPayload(providerId, sessionId, planId, reply, message);
    this.sendRequest(AgentBridgeRequestType.PLAN_RESPOND, payload);
  }

  requestOpenCode(method: string, path: string, query: Object, body: Object | null, accept: string): void {
    const payload = new AgentBridgeOpenCodeRequestPayload(AgentBridgeProviderId.OPENCODE, method, path, query, body, accept);
    this.sendRequest(AgentBridgeRequestType.OPENCODE_REQUEST, payload);
  }

  requestOpenCodeProvider(providerId: string, method: string, path: string, query: Object, body: Object | null, accept: string): void {
    const payload = new AgentBridgeOpenCodeRequestPayload(providerId, method, path, query, body, accept);
    this.sendRequest(AgentBridgeRequestType.OPENCODE_REQUEST, payload);
  }

  abortOpenCodeSession(providerId: string, remoteSessionId: string): void {
    if (remoteSessionId.length === 0) {
      this.emitError('opencode session id is required');
      return;
    }
    this.requestOpenCodeProvider(
      providerId.length > 0 ? providerId : AgentBridgeProviderId.OPENCODE,
      'POST',
      '/session/' + encodeURIComponent(remoteSessionId) + '/abort',
      new AgentBridgeEmptyPayload(),
      null,
      'application/json'
    );
  }

  private sendCapabilitiesRequest(): void {
    this.sendRequest(AgentBridgeRequestType.CAPABILITIES_GET, new AgentBridgeEmptyPayload());
  }

  private sendHelloRequest(config: AgentBridgeConnectionConfig, endpoint: string): void {
    const safeEndpoint = this.safeUrlForLog(endpoint);
    this.sendRequest(AgentBridgeRequestType.HELLO, new AgentBridgeHelloPayload(
      config.clientId, safeEndpoint, config.appNonce, config.hostProfileId, config.appVersion
    ));
  }

  private sendHeartbeat(): void {
    if (this.currentStatus !== AgentBridgeConnectionStatus.CONNECTED || !this.socket) {
      return;
    }
    if (this.relayMode) {
      if (this.relayLastPongAt > 0 && Date.now() - this.relayLastPongAt > AGENT_BRIDGE_RELAY_PONG_TIMEOUT_MS) {
        this.failRelayAttempt('relay_heartbeat_timeout', 'Relay encrypted heartbeat timed out');
        return;
      }
      const ping: string = '{"type":"relay.ping","at":' + Date.now().toString() + '}';
      if (!this.enqueueRelayBytes('control', RelayCryptoProtocol.encodeUtf8(ping), false)) {
        this.failRelayAttempt('relay_backpressure', 'Relay encrypted heartbeat queue is full');
        return;
      }
    }
    this.sendRequest(AgentBridgeRequestType.PING, new AgentBridgeEmptyPayload());
  }

  private sendRequest(type: string, payload: Object): string {
    if (!this.socket) {
      this.emitError('bridge is not connected');
      return '';
    }
    const requestId = this.nextRequestId();
    const envelope = new AgentBridgeRequestEnvelope(requestId, type, payload);
    const text = JSON.stringify(envelope);
    if (this.relayMode) {
      if (!this.relayReady || this.relayCryptoSession === null) {
        this.emitError('relay encrypted session is not ready');
        return '';
      }
      if (!this.enqueueRelayBytes('json', RelayCryptoProtocol.encodeUtf8(text), false)) {
        return '';
      }
      return requestId;
    }
    try {
      this.socket.send(text, (err: BusinessError, _value: Object): void => {
        if (err) {
          const message = this.businessErrorToString(err);
          logger.warn(TAG, 'bridge websocket send failed: ' + message);
          this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
          this.emitError(message);
          this.closeCurrentSocket(false);
          this.scheduleReconnect();
        }
      });
      return requestId;
    } catch (error) {
      const message = this.errorToString(error);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
      this.closeCurrentSocket(false);
      this.scheduleReconnect();
      return '';
    }
  }

  private sendBinaryFrame(frame: ArrayBuffer): boolean {
    if (!this.socket) {
      this.emitError('bridge is not connected');
      return false;
    }
    if (frame.byteLength <= 0) {
      this.emitError('binary frame is empty');
      return false;
    }
    if (this.relayMode) {
      if (!this.relayReady || this.relayCryptoSession === null) {
        this.emitError('relay encrypted session is not ready');
        return false;
      }
      return this.enqueueRelayBytes('binary', new Uint8Array(frame), false);
    }
    try {
      this.socket.send(frame, (err: BusinessError, _value: Object): void => {
        if (err) {
          const message = this.businessErrorToString(err);
          logger.warn(TAG, 'bridge websocket binary send failed: ' + message);
          this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
          this.emitError(message);
          this.closeCurrentSocket(false);
          this.scheduleReconnect();
        }
      });
      return true;
    } catch (error) {
      const message = this.errorToString(error);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
      this.closeCurrentSocket(false);
      this.scheduleReconnect();
      return false;
    }
  }

  private sendRelayAttach(config: AgentBridgeConnectionConfig): void {
    const attach: AgentBridgeRelayBrokerAttach = new AgentBridgeRelayBrokerAttach(config.relayId);
    if (!this.sendRawSocketText(JSON.stringify(attach))) {
      this.failRelayAttempt('relay_unreachable', 'Relay attach could not be sent');
    }
  }

  private handleRelayBrokerText(text: string, config: AgentBridgeConnectionConfig): void {
    if (text.length === 0 || text.length > AGENT_BRIDGE_RELAY_MAX_PAYLOAD_BYTES + 65536) {
      this.failRelayAttempt('relay_backpressure', 'Relay broker message exceeded the limit');
      return;
    }
    const type: string = AgentBridgeIncomingParser.extractStringProperty(text, 'type');
    if (type === 'relay.ack') {
      const relayId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'relayId');
      const connectionId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'connectionId');
      const frameId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'frameId');
      if (frameId.length > 0) {
        const targetConnectionId: string = AgentBridgeIncomingParser.extractStringProperty(
          text,
          'targetConnectionId'
        );
        if (relayId !== config.relayId || connectionId !== this.relayOwnConnectionId) {
          this.failRelayAttempt('relay_protocol_error', 'Relay frame acknowledgement scope is invalid');
          return;
        }
        if (targetConnectionId.length > 0) {
          if (this.relayPeerConnectionId.length > 0 && targetConnectionId !== this.relayPeerConnectionId) {
            this.failRelayAttempt('relay_protocol_error', 'Relay frame acknowledgement peer changed');
            return;
          }
          this.relayPeerConnectionId = targetConnectionId;
        }
        this.relayPendingFrameIds.delete(frameId);
        return;
      }
      if (this.relayAttachAcknowledged) {
        return;
      }
      if (relayId !== config.relayId || connectionId.length === 0) {
        this.failRelayAttempt('relay_protocol_error', 'Relay attach acknowledgement is invalid');
        return;
      }
      this.relayAttachAcknowledged = true;
      this.relayOwnConnectionId = connectionId;
      const attemptEpoch: number = this.relayAttemptGuard.getCurrentEpoch();
      this.beginRelayHandshake(config, attemptEpoch).then((): void => {
      }).catch((error: Error): void => {
        if (this.isCurrentRelayAttempt(attemptEpoch, config)) {
          const category: string = AgentBridgeClient.relayFailureCategory(error, 'relay_handshake_failed');
          this.failRelayAttempt(category, error.message);
        }
      });
      return;
    }
    if (type === 'relay.frame') {
      const relayId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'relayId');
      const frameId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'frameId');
      const targetConnectionId: string = AgentBridgeIncomingParser.extractStringProperty(
        text,
        'targetConnectionId'
      );
      if (relayId !== config.relayId || frameId.length === 0 ||
        (targetConnectionId.length > 0 && targetConnectionId !== this.relayOwnConnectionId)) {
        this.failRelayAttempt('relay_protocol_error', 'Relay frame scope is invalid');
        return;
      }
      const peerConnectionId: string = AgentBridgeIncomingParser.extractFirstStringProperty(
        text,
        'connectionId',
        'sourceConnectionId'
      );
      if (peerConnectionId.length === 0 ||
        (this.relayPeerConnectionId.length > 0 && peerConnectionId !== this.relayPeerConnectionId)) {
        this.failRelayAttempt('relay_protocol_error', 'Relay peer connection is invalid');
        return;
      }
      this.relayPeerConnectionId = peerConnectionId;
      const ack: AgentBridgeRelayBrokerAck = new AgentBridgeRelayBrokerAck(
        config.relayId,
        this.relayOwnConnectionId,
        peerConnectionId,
        frameId
      );
      if (!this.sendRawSocketText(JSON.stringify(ack))) {
        this.failRelayAttempt('relay_unreachable', 'Relay frame acknowledgement could not be sent');
        return;
      }
      let payload: string = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(text, 'payload')
      );
      if (payload.length === 0) {
        payload = AgentBridgeIncomingParser.extractObjectProperty(text, 'payload');
      }
      if (payload.length === 0 || payload.length > AGENT_BRIDGE_RELAY_MAX_PAYLOAD_BYTES + 32768) {
        this.failRelayAttempt('relay_protocol_error', 'Relay peer payload is invalid');
        return;
      }
      const attemptEpoch: number = this.relayAttemptGuard.getCurrentEpoch();
      const inFlightCount: number = this.relayInboundBusy ? 1 : 0;
      if (this.relayInboundQueue.length + inFlightCount >= AGENT_BRIDGE_RELAY_MAX_PENDING_FRAMES) {
        this.failRelayAttempt('relay_backpressure', 'Relay inbound queue reached the 64 frame limit');
        return;
      }
      this.relayInboundQueue.push(payload);
      this.drainRelayInboundQueue(config, attemptEpoch);
      return;
    }
    if (type === 'relay.detach' || type === 'relay.peer.detached') {
      const relayId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'relayId');
      const connectionId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'connectionId');
      const targetConnectionId: string = AgentBridgeIncomingParser.extractStringProperty(
        text,
        'targetConnectionId'
      );
      if (relayId !== config.relayId ||
        (targetConnectionId.length > 0 && targetConnectionId !== this.relayOwnConnectionId) ||
        (this.relayPeerConnectionId.length > 0 && connectionId !== this.relayPeerConnectionId)) {
        this.failRelayAttempt('relay_protocol_error', 'Relay detach scope is invalid');
        return;
      }
      this.failRelayAttempt('relay_detached', 'Relay peer detached');
      return;
    }
    if (type === 'relay.error') {
      const category: string = AgentBridgeIncomingParser.extractFirstStringProperty(
        text,
        'failureCategory',
        'code'
      );
      const message: string = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(text, 'message')
      );
      this.failRelayAttempt(category.length > 0 ? category : 'relay_protocol_error',
        message.length > 0 ? message : 'Relay rejected the request');
      return;
    }
    this.failRelayAttempt('relay_protocol_error', 'Relay broker message type is unsupported');
  }

  private async beginRelayHandshake(config: AgentBridgeConnectionConfig, attemptEpoch: number): Promise<void> {
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      throw new Error('Relay attach is no longer active');
    }
    const hostScope: string = config.hostProfileId.length > 0 ? config.hostProfileId : 'default-host';
    const identityAlias: string = await ngfRelayCryptoFacade.buildIdentityAlias(hostScope, config.relayId);
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      return;
    }
    const identity: RelayIdentityInfo = await ngfRelayCryptoFacade.getOrCreateIdentity(identityAlias);
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      return;
    }
    const deviceId: string = 'app_' + identity.fingerprintSha256.substring(0, 32);
    const sessionId: string = 'session_' + ngfRelayCryptoFacade.generateRandomBase64Url(24);
    const clientNonce: string = ngfRelayCryptoFacade.generateRandomBase64Url(24);
    const handshake: RelayHandshakeOffer = await ngfRelayCryptoFacade.createHandshake(
      sessionId,
      RelayCryptoRole.INITIATOR
    );
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      ngfRelayCryptoFacade.cancelHandshake(handshake.handle);
      return;
    }
    try {
      const bridgePublicKeyBase64: string = await this.resolveBridgePublicKeyBase64(config);
      const bridgeFingerprint: string = await ngfRelayCryptoFacade.fingerprintPublicKeyBase64(
        bridgePublicKeyBase64
      );
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        ngfRelayCryptoFacade.cancelHandshake(handshake.handle);
        return;
      }
      if (!AgentBridgeClient.constantTimeTextEquals(
        bridgeFingerprint.toLowerCase(),
        config.relayBridgeIdentityFingerprint.toLowerCase()
      )) {
        throw new AgentBridgeRelayTransportError(
          'identity_mismatch',
          'Bridge Relay identity fingerprint does not match the saved endpoint'
        );
      }
      const identityPem: string = await ngfRelayCryptoFacade.publicKeyBase64ToPem(identity.publicKeyBase64);
      const ephemeralPem: string = await ngfRelayCryptoFacade.publicKeyBase64ToPem(
        handshake.ephemeralPublicKeyBase64
      );
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        ngfRelayCryptoFacade.cancelHandshake(handshake.handle);
        return;
      }
      const usedPairing: boolean = config.relayPairingSecret.length > 0;
      const helloType: string = usedPairing ? 'relay.pairing.hello' : 'relay.session.hello';
      const hello: AgentBridgeRelayClientHello = new AgentBridgeRelayClientHello(helloType);
      hello.relayId = config.relayId;
      hello.offerId = config.relayOfferId;
      hello.deviceId = deviceId;
      hello.displayName = config.clientId;
      hello.clientIdentityPublicKeyBase64 = identity.publicKeyBase64;
      hello.clientIdentityPublicKeyPem = identityPem;
      hello.clientIdentityFingerprint = identity.fingerprintSha256;
      hello.bridgeIdentityFingerprint = bridgeFingerprint;
      hello.sessionId = sessionId;
      hello.clientEphemeralPublicKeyBase64 = handshake.ephemeralPublicKeyBase64;
      hello.clientEphemeralPublicKeyPem = ephemeralPem;
      hello.clientNonce = clientNonce;
      hello.issuedAt = Date.now();
      if (usedPairing) {
        const expiresAt: number = Date.parse(config.relayPairingExpiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new AgentBridgeRelayTransportError('pairing_expired', 'Relay pairing offer has expired');
        }
        const transcript: string = AgentBridgeRelayTranscriptPolicy.buildPairingHello(
          hello.relayId,
          hello.offerId,
          hello.deviceId,
          hello.clientIdentityPublicKeyBase64,
          hello.clientIdentityFingerprint,
          hello.bridgeIdentityFingerprint,
          hello.sessionId,
          hello.clientEphemeralPublicKeyBase64,
          hello.clientNonce,
          hello.issuedAt
        );
        if (transcript.length === 0) {
          throw new Error('Relay pairing transcript is invalid');
        }
        hello.proof = await ngfRelayCryptoFacade.createPairingProof(config.relayPairingSecret, transcript);
      } else {
        const transcript: string = AgentBridgeRelayTranscriptPolicy.buildSessionHello(
          hello.relayId,
          hello.deviceId,
          hello.clientIdentityFingerprint,
          hello.bridgeIdentityFingerprint,
          hello.sessionId,
          hello.clientEphemeralPublicKeyBase64,
          hello.clientNonce,
          hello.issuedAt
        );
        if (transcript.length === 0) {
          throw new Error('Relay session transcript is invalid');
        }
        hello.signature = await ngfRelayCryptoFacade.signIdentityTranscript(identityAlias, transcript);
      }
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        ngfRelayCryptoFacade.cancelHandshake(handshake.handle);
        return;
      }
      this.relayIdentityAlias = identityAlias;
      this.relayIdentity = identity;
      this.relayDeviceId = deviceId;
      this.relaySessionId = sessionId;
      this.relayClientNonce = clientNonce;
      this.relayHandshake = handshake;
      this.relayHandshakeUsedPairing = usedPairing;
      config.relayBridgeIdentityPublicKeyBase64 = bridgePublicKeyBase64;
      if (!this.sendRelayPeerPayload(JSON.stringify(hello), config)) {
        throw new Error('Relay handshake frame could not be sent');
      }
    } catch (error) {
      if (this.relayHandshake !== handshake) {
        ngfRelayCryptoFacade.cancelHandshake(handshake.handle);
      }
      const relayError: Error = error instanceof Error ? error : new Error(this.errorToString(error));
      throw relayError;
    }
  }

  private async handleRelayPeerPayload(
    payload: string,
    config: AgentBridgeConnectionConfig,
    attemptEpoch: number
  ): Promise<void> {
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      return;
    }
    const type: string = AgentBridgeIncomingParser.extractStringProperty(payload, 'type');
    if (type === 'relay.session.response') {
      await this.handleRelaySessionResponse(payload, config, attemptEpoch);
      return;
    }
    if (type === 'relay.e2ee.data') {
      await this.handleRelayEncryptedData(payload, config, attemptEpoch);
      return;
    }
    if (type === 'relay.error') {
      const category: string = AgentBridgeIncomingParser.extractFirstStringProperty(
        payload,
        'failureCategory',
        'code'
      );
      const message: string = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(payload, 'message')
      );
      throw new AgentBridgeRelayTransportError(
        category.length > 0 ? category : 'relay_protocol_error',
        message.length > 0 ? message : 'Relay peer rejected the handshake'
      );
    }
    throw new Error('Relay peer payload type is unsupported');
  }

  private drainRelayInboundQueue(config: AgentBridgeConnectionConfig, attemptEpoch: number): void {
    if (this.relayInboundBusy || !this.isCurrentRelayAttempt(attemptEpoch, config)) {
      return;
    }
    this.relayInboundBusy = true;
    this.processRelayInboundQueue(config, attemptEpoch).then((): void => {
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        return;
      }
      this.relayInboundBusy = false;
      if (this.relayInboundQueue.length > 0) {
        this.drainRelayInboundQueue(config, attemptEpoch);
      }
    }).catch((error: Error): void => {
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        return;
      }
      this.relayInboundBusy = false;
      const category: string = AgentBridgeClient.relayFailureCategory(error, 'relay_protocol_error');
      this.failRelayAttempt(category, error.message);
    });
  }

  private async processRelayInboundQueue(
    config: AgentBridgeConnectionConfig,
    attemptEpoch: number
  ): Promise<void> {
    while (this.relayInboundQueue.length > 0) {
      if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
        return;
      }
      const payload: string | undefined = this.relayInboundQueue.shift();
      if (payload === undefined) {
        return;
      }
      await this.handleRelayPeerPayload(payload, config, attemptEpoch);
    }
  }

  private async handleRelaySessionResponse(
    payload: string,
    config: AgentBridgeConnectionConfig,
    attemptEpoch: number
  ): Promise<void> {
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayHandshake === null ||
      this.relayIdentity === null || this.relayCryptoSession !== null) {
      throw new Error('Relay session response is not expected');
    }
    const handshake: RelayHandshakeOffer = this.relayHandshake;
    const identity: RelayIdentityInfo = this.relayIdentity;
    const usedPairing: boolean = this.relayHandshakeUsedPairing;
    const response: AgentBridgeRelaySessionResponse = AgentBridgeIncomingParser.parseRelaySessionResponse(payload);
    if (response.protocolVersion !== AgentBridgeRelayTranscriptPolicy.PROTOCOL_VERSION ||
      response.relayId !== config.relayId || response.deviceId !== this.relayDeviceId ||
      response.sessionId !== this.relaySessionId || response.clientNonce !== this.relayClientNonce ||
      response.keyEpoch !== 1) {
      throw new Error('Relay session response scope is invalid');
    }
    if (!Number.isInteger(response.issuedAt) ||
      Math.abs(Date.now() - response.issuedAt) > AGENT_BRIDGE_RELAY_HANDSHAKE_MAX_AGE_MS) {
      throw new Error('Relay session response has expired');
    }
    let bridgeIdentityPublicKeyBase64: string = response.bridgeIdentityPublicKeyBase64;
    if (bridgeIdentityPublicKeyBase64.length === 0 && response.bridgeIdentityPublicKeyPem.length > 0) {
      bridgeIdentityPublicKeyBase64 = await ngfRelayCryptoFacade.publicKeyPemToBase64(
        response.bridgeIdentityPublicKeyPem
      );
    }
    if (bridgeIdentityPublicKeyBase64.length === 0) {
      bridgeIdentityPublicKeyBase64 = config.relayBridgeIdentityPublicKeyBase64;
    }
    const bridgeFingerprint: string = await ngfRelayCryptoFacade.fingerprintPublicKeyBase64(
      bridgeIdentityPublicKeyBase64
    );
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayHandshake !== handshake) {
      return;
    }
    if (!AgentBridgeClient.constantTimeTextEquals(
      bridgeFingerprint.toLowerCase(),
      config.relayBridgeIdentityFingerprint.toLowerCase()
    ) || !AgentBridgeClient.constantTimeTextEquals(
      bridgeFingerprint.toLowerCase(),
      response.bridgeIdentityFingerprint.toLowerCase()
    )) {
      throw new AgentBridgeRelayTransportError('identity_mismatch', 'Bridge Relay identity changed');
    }
    let bridgeEphemeralPublicKeyBase64: string = response.bridgeEphemeralPublicKeyBase64;
    if (bridgeEphemeralPublicKeyBase64.length === 0 && response.bridgeEphemeralPublicKeyPem.length > 0) {
      bridgeEphemeralPublicKeyBase64 = await ngfRelayCryptoFacade.publicKeyPemToBase64(
        response.bridgeEphemeralPublicKeyPem
      );
    }
    if (bridgeEphemeralPublicKeyBase64.length === 0 || response.bridgeNonce.length === 0) {
      throw new Error('Relay session response key material is missing');
    }
    const transcript: string = AgentBridgeRelayTranscriptPolicy.buildSessionResponse(
      response.relayId,
      response.deviceId,
      identity.fingerprintSha256,
      bridgeFingerprint,
      response.sessionId,
      handshake.ephemeralPublicKeyBase64,
      bridgeEphemeralPublicKeyBase64,
      response.clientNonce,
      response.bridgeNonce,
      response.issuedAt
    );
    const verified: boolean = await ngfRelayCryptoFacade.verifyIdentityTranscript(
      bridgeIdentityPublicKeyBase64,
      transcript,
      response.signature
    );
    if (!verified) {
      throw new Error('Bridge Relay session signature is invalid');
    }
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayHandshake !== handshake) {
      return;
    }
    const cryptoSession: RelayCryptoSession = await ngfRelayCryptoFacade.completeHandshake(
      handshake.handle,
      bridgeEphemeralPublicKeyBase64,
      config.relayId,
      this.relayClientNonce,
      response.bridgeNonce,
      identity.fingerprintSha256,
      bridgeFingerprint,
      1
    );
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayHandshake !== handshake) {
      cryptoSession.close();
      return;
    }
    this.relayCryptoSession = cryptoSession;
    this.relayHandshake = null;
    this.relayHandshakeUsedPairing = false;
    if (usedPairing) {
      config.relayPairingSecret = '';
      config.relayOfferId = '';
      config.relayPairingExpiresAt = '';
    }
    const ready: string = '{"type":"relay.session.ready","sessionId":' +
      JSON.stringify(this.relaySessionId) + '}';
    if (!this.enqueueRelayBytes('control', RelayCryptoProtocol.encodeUtf8(ready), true)) {
      throw new Error('Relay session ready frame could not be queued');
    }
  }

  private async handleRelayEncryptedData(
    payload: string,
    config: AgentBridgeConnectionConfig,
    attemptEpoch: number
  ): Promise<void> {
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayCryptoSession === null) {
      throw new Error('Relay encrypted session is unavailable');
    }
    const cryptoSession: RelayCryptoSession = this.relayCryptoSession;
    const model: AgentBridgeRelayEncryptedEnvelope = AgentBridgeIncomingParser.parseRelayEncryptedEnvelope(payload);
    if (model.version !== 1 || model.keyEpoch !== 1 || model.sessionId !== this.relaySessionId ||
      model.direction !== AgentBridgeRelayDirection.BRIDGE_TO_APP) {
      throw new Error('Relay encrypted envelope scope is invalid');
    }
    const envelope: RelayEncryptedEnvelope = new RelayEncryptedEnvelope(
      model.sessionId,
      RelayCryptoDirection.BRIDGE_TO_APP,
      model.seq,
      model.keyEpoch,
      model.contentType,
      RelayCryptoProtocol.encodeBase64(RelayCryptoProtocol.decodeBase64Flexible(model.nonceBase64)),
      RelayCryptoProtocol.encodeBase64(RelayCryptoProtocol.decodeBase64Flexible(model.cipherTextBase64)),
      RelayCryptoProtocol.encodeBase64(RelayCryptoProtocol.decodeBase64Flexible(model.authTagBase64)),
      model.aadBase64.length > 0 ?
        RelayCryptoProtocol.encodeBase64(RelayCryptoProtocol.decodeBase64Flexible(model.aadBase64)) : ''
    );
    const plainBytes: Uint8Array = await cryptoSession.decrypt(envelope);
    if (!this.isCurrentRelayAttempt(attemptEpoch, config) || this.relayCryptoSession !== cryptoSession) {
      plainBytes.fill(0);
      return;
    }
    this.relayLastPongAt = Date.now();
    if (model.contentType === 'binary') {
      if (!this.relayReady) {
        plainBytes.fill(0);
        throw new Error('Relay binary data arrived before session ready');
      }
      const binaryFrame: ArrayBuffer = AgentBridgeClient.copyBytesToArrayBuffer(plainBytes);
      plainBytes.fill(0);
      this.handleIncomingBinary(binaryFrame);
      return;
    }
    const decoder: util.TextDecoder = new util.TextDecoder('utf-8');
    const text: string = decoder.decodeToString(plainBytes);
    plainBytes.fill(0);
    if (model.contentType === 'control') {
      this.handleRelayControl(text, config, attemptEpoch);
      return;
    }
    if (model.contentType === 'json' && this.relayReady) {
      this.handleIncomingText(text);
      return;
    }
    throw new Error('Relay encrypted content type is invalid');
  }

  private handleRelayControl(text: string, config: AgentBridgeConnectionConfig, attemptEpoch: number): void {
    if (!this.isCurrentRelayAttempt(attemptEpoch, config)) {
      return;
    }
    const type: string = AgentBridgeIncomingParser.extractStringProperty(text, 'type');
    if (type === 'relay.session.ready') {
      const accepted: boolean = AgentBridgeIncomingParser.extractBooleanProperty(text, 'accepted');
      const sessionId: string = AgentBridgeIncomingParser.extractStringProperty(text, 'sessionId');
      if (!accepted || sessionId !== this.relaySessionId || this.relayReady) {
        throw new Error('Relay session ready acknowledgement is invalid');
      }
      this.relayReady = true;
      this.relayLastPongAt = Date.now();
      this.emitStatus(AgentBridgeConnectionStatus.CONNECTED, this.safeUrlForLog(config.relayUrl));
      this.startHeartbeat();
      this.sendHelloRequest(config, config.endpoint);
      this.sendCapabilitiesRequest();
      return;
    }
    if (type === 'relay.ping') {
      const at: number = AgentBridgeIncomingParser.extractNumberProperty(text, 'at', Date.now());
      const pong: string = '{"type":"relay.pong","at":' + at.toString() + '}';
      this.enqueueRelayBytes('control', RelayCryptoProtocol.encodeUtf8(pong), true);
      return;
    }
    if (type === 'relay.pong') {
      this.relayLastPongAt = Date.now();
      return;
    }
    throw new Error('Relay control message is unsupported');
  }

  private enqueueRelayBytes(contentType: string, bytes: Uint8Array, allowBeforeReady: boolean): boolean {
    const inFlightCount: number = this.relayOutboundBusy ? 1 : 0;
    if (this.relayCryptoSession === null || (!allowBeforeReady && !this.relayReady) ||
      bytes.length > AGENT_BRIDGE_RELAY_MAX_PAYLOAD_BYTES ||
      this.relayOutboundQueue.length + this.relayPendingFrameIds.size + inFlightCount >=
      AGENT_BRIDGE_RELAY_MAX_PENDING_FRAMES) {
      return false;
    }
    this.relayOutboundQueue.push(new AgentBridgeRelayOutboundItem(contentType, bytes));
    this.drainRelayOutboundQueue();
    return true;
  }

  private drainRelayOutboundQueue(): void {
    if (this.relayOutboundBusy) {
      return;
    }
    const cryptoSession: RelayCryptoSession | null = this.relayCryptoSession;
    if (cryptoSession === null) {
      return;
    }
    const attemptEpoch: number = this.relayAttemptGuard.getCurrentEpoch();
    this.relayOutboundBusy = true;
    this.processRelayOutboundQueue(attemptEpoch, cryptoSession).then((): void => {
      if (!this.isCurrentRelayCryptoSession(attemptEpoch, cryptoSession)) {
        return;
      }
      this.relayOutboundBusy = false;
      if (this.relayOutboundQueue.length > 0) {
        this.drainRelayOutboundQueue();
      }
    }).catch((error: Error): void => {
      if (!this.isCurrentRelayCryptoSession(attemptEpoch, cryptoSession)) {
        return;
      }
      this.relayOutboundBusy = false;
      this.failRelayAttempt(AgentBridgeClient.relayFailureCategory(error, 'relay_encryption_failed'), error.message);
    });
  }

  private async processRelayOutboundQueue(
    attemptEpoch: number,
    cryptoSession: RelayCryptoSession
  ): Promise<void> {
    while (this.relayOutboundQueue.length > 0) {
      if (!this.isCurrentRelayCryptoSession(attemptEpoch, cryptoSession)) {
        return;
      }
      const item: AgentBridgeRelayOutboundItem | undefined = this.relayOutboundQueue.shift();
      if (item === undefined) {
        return;
      }
      try {
        const encrypted: RelayEncryptedEnvelope = await cryptoSession.encrypt(item.bytes, item.contentType);
        if (!this.isCurrentRelayCryptoSession(attemptEpoch, cryptoSession)) {
          return;
        }
        const model: AgentBridgeRelayEncryptedEnvelope = new AgentBridgeRelayEncryptedEnvelope();
        model.version = encrypted.version;
        model.sessionId = encrypted.sessionId;
        model.direction = encrypted.direction;
        model.seq = encrypted.seq;
        model.keyEpoch = encrypted.keyEpoch;
        model.contentType = encrypted.contentType;
        model.nonceBase64 = encrypted.nonceBase64;
        model.cipherTextBase64 = encrypted.cipherTextBase64;
        model.authTagBase64 = encrypted.authTagBase64;
        model.aadBase64 = encrypted.aadBase64;
        model.iv = RelayCryptoProtocol.encodeBase64Url(
          RelayCryptoProtocol.decodeBase64Flexible(encrypted.nonceBase64)
        );
        model.ciphertext = RelayCryptoProtocol.encodeBase64Url(
          RelayCryptoProtocol.decodeBase64Flexible(encrypted.cipherTextBase64)
        );
        model.authTag = RelayCryptoProtocol.encodeBase64Url(
          RelayCryptoProtocol.decodeBase64Flexible(encrypted.authTagBase64)
        );
        const inner: AgentBridgeRelayE2eeData = new AgentBridgeRelayE2eeData(model);
        const config: AgentBridgeConnectionConfig | null = this.desiredConfig;
        if (config === null || !this.isCurrentRelayAttempt(attemptEpoch, config) ||
          !this.sendRelayPeerPayload(JSON.stringify(inner), config)) {
          throw new Error('Relay encrypted frame could not be sent');
        }
      } finally {
        item.bytes.fill(0);
      }
    }
  }

  private sendRelayPeerPayload(payload: string, config: AgentBridgeConnectionConfig): boolean {
    if (!this.relayAttachAcknowledged || this.socket === null ||
      this.relayPendingFrameIds.size >= AGENT_BRIDGE_RELAY_MAX_PENDING_FRAMES) {
      return false;
    }
    const frameId: string = 'frame_' + ngfRelayCryptoFacade.generateRandomBase64Url(12);
    const frame: AgentBridgeRelayBrokerFrame = new AgentBridgeRelayBrokerFrame(
      config.relayId,
      this.relayOwnConnectionId,
      this.relayPeerConnectionId,
      frameId,
      payload
    );
    if (!this.sendRawSocketText(JSON.stringify(frame))) {
      return false;
    }
    this.relayPendingFrameIds.set(frameId, Date.now());
    return true;
  }

  private sendRelayDetach(): void {
    const config: AgentBridgeConnectionConfig | null = this.desiredConfig;
    if (config === null || this.relayOwnConnectionId.length === 0) {
      return;
    }
    const detach: AgentBridgeRelayBrokerDetach = new AgentBridgeRelayBrokerDetach(
      config.relayId,
      this.relayOwnConnectionId
    );
    this.sendRawSocketText(JSON.stringify(detach));
  }

  private sendRawSocketText(text: string): boolean {
    const activeSocket: webSocket.WebSocket | null = this.socket;
    if (activeSocket === null) {
      return false;
    }
    try {
      activeSocket.send(text, (err: BusinessError, _value: Object): void => {
        if (err && this.socket === activeSocket) {
          this.failRelayAttempt('relay_unreachable', this.businessErrorToString(err));
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  private async resolveBridgePublicKeyBase64(config: AgentBridgeConnectionConfig): Promise<string> {
    if (config.relayBridgeIdentityPublicKeyBase64.length > 0) {
      return config.relayBridgeIdentityPublicKeyBase64;
    }
    if (config.relayBridgeIdentityPublicKeyPem.length > 0) {
      return await ngfRelayCryptoFacade.publicKeyPemToBase64(config.relayBridgeIdentityPublicKeyPem);
    }
    throw new Error('Bridge Relay identity public key is missing');
  }

  private failRelayAttempt(failureCategory: string, message: string): void {
    logger.warn(TAG, 'relay transport failed: category=' + failureCategory);
    if (AgentBridgeClient.isFatalRelayFailure(failureCategory)) {
      this.manualDisconnect = true;
    }
    this.emitStatus(AgentBridgeConnectionStatus.ERROR, failureCategory);
    this.emitError(message);
    this.closeCurrentSocket(false);
    this.scheduleReconnect();
  }

  private isCurrentRelayAttempt(attemptEpoch: number, config: AgentBridgeConnectionConfig): boolean {
    return this.relayAttemptGuard.isCurrent(attemptEpoch) && this.relayMode && this.desiredConfig === config &&
      this.socket !== null && this.relayAttachAcknowledged;
  }

  private isCurrentRelayCryptoSession(attemptEpoch: number, cryptoSession: RelayCryptoSession): boolean {
    return this.relayAttemptGuard.isCurrent(attemptEpoch) && this.relayMode && this.socket !== null &&
      this.relayCryptoSession === cryptoSession;
  }

  private resetRelayAttempt(): void {
    this.relayAttemptGuard.beginNextEpoch();
    if (this.relayHandshake !== null) {
      ngfRelayCryptoFacade.cancelHandshake(this.relayHandshake.handle);
    }
    if (this.relayCryptoSession !== null) {
      this.relayCryptoSession.close();
    }
    for (let index: number = 0; index < this.relayOutboundQueue.length; index++) {
      this.relayOutboundQueue[index].bytes.fill(0);
    }
    this.relayAttachAcknowledged = false;
    this.relayReady = false;
    this.relayOwnConnectionId = '';
    this.relayPeerConnectionId = '';
    this.relayIdentityAlias = '';
    this.relayDeviceId = '';
    this.relaySessionId = '';
    this.relayClientNonce = '';
    this.relayIdentity = null;
    this.relayHandshake = null;
    this.relayHandshakeUsedPairing = false;
    this.relayCryptoSession = null;
    this.relayInboundQueue = [];
    this.relayInboundBusy = false;
    this.relayOutboundQueue = [];
    this.relayOutboundBusy = false;
    this.relayPendingFrameIds.clear();
    this.relayLastPongAt = 0;
  }

  private static copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const output: ArrayBuffer = new ArrayBuffer(bytes.length);
    const target: Uint8Array = new Uint8Array(output);
    target.set(bytes);
    return output;
  }

  private static constantTimeTextEquals(first: string, second: string): boolean {
    let difference: number = first.length ^ second.length;
    const length: number = first.length > second.length ? first.length : second.length;
    for (let index: number = 0; index < length; index++) {
      const left: number = index < first.length ? first.charCodeAt(index) : 0;
      const right: number = index < second.length ? second.charCodeAt(index) : 0;
      difference |= left ^ right;
    }
    return difference === 0;
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

  private static isSafeRelayBase64Url(value: string, maxLength: number): boolean {
    if (value.length === 0 || value.length > maxLength) {
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

  private static isFatalRelayFailure(failureCategory: string): boolean {
    return failureCategory === 'device_revoked' || failureCategory === 'identity_mismatch' ||
      failureCategory === 'pairing_required' || failureCategory === 'pairing_consumed' ||
      failureCategory === 'pairing_expired' || failureCategory === 'pairing_proof_invalid' ||
      failureCategory === 'handshake_signature_invalid';
  }

  private static relayFailureCategory(error: Error, fallbackValue: string): string {
    if (error instanceof AgentBridgeRelayTransportError) {
      return error.failureCategory;
    }
    if (error instanceof RelayCryptoError) {
      return error.failureCategory;
    }
    return fallbackValue;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval((): void => {
      this.sendHeartbeat();
    }, AGENT_BRIDGE_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer >= 0) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = -1;
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.desiredConfig === null) {
      return;
    }
    this.clearReconnectTimer();
    this.reconnectAttempt = this.reconnectAttempt + 1;
    let delay = AGENT_BRIDGE_RECONNECT_BASE_DELAY_MS * this.reconnectAttempt;
    if (delay > AGENT_BRIDGE_RECONNECT_MAX_DELAY_MS) {
      delay = AGENT_BRIDGE_RECONNECT_MAX_DELAY_MS;
    }
    logger.info(TAG, 'schedule bridge reconnect: delayMs=' + String(delay) + ', attempt=' + String(this.reconnectAttempt));
    this.emitStatus(AgentBridgeConnectionStatus.CONNECTING, 'reconnecting in ' + String(Math.floor(delay / 1000)) + 's');
    this.reconnectTimer = setTimeout((): void => {
      this.reconnectTimer = -1;
      if (this.manualDisconnect || this.desiredConfig === null) {
        return;
      }
      if (!this.relayMode && this.appNonceRefresher !== null) {
        const refreshed = this.appNonceRefresher();
        if (refreshed.length > 0 && refreshed !== this.desiredConfig.appNonce) {
          this.desiredConfig.appNonce = refreshed;
          logger.info(TAG, 'bridge reconnect refreshed appNonce');
        }
      }
      this.openSocket(this.desiredConfig);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer >= 0) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = -1;
    }
  }

  private closeCurrentSocket(emitDisconnected: boolean): void {
    const activeSocket = this.socket;
    if (!activeSocket) {
      return;
    }
    this.socket = null;
    this.stopHeartbeat();
    if (this.relayMode) {
      this.resetRelayAttempt();
    }
    try {
      activeSocket.close();
    } catch (error) {
      logger.warn(TAG, 'bridge websocket close failed: ' + this.errorToString(error));
    }
    if (emitDisconnected) {
      this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed');
    }
  }

  private handleIncomingText(text: string): void {
    if (this.textHandler) {
      this.textHandler(text);
    }
    const sessionId = AgentBridgeIncomingParser.extractStringProperty(text, 'sessionId');
    if (sessionId.length > 0 && this.sessionHandler) {
      this.sessionHandler(sessionId);
    }
  }

  private handleIncomingBinary(value: ArrayBuffer): void {
    const decoded: AgentBridgeBinaryFrame = AgentBridgeBinaryFrameCodec.decode(value);
    if (decoded.kind === AgentBridgeBinaryFrameKind.TERMINAL && decoded.terminalFrame !== null) {
      if (this.terminalFrameHandler !== null) {
        this.terminalFrameHandler(decoded.terminalFrame);
      }
      return;
    }
    if (decoded.kind === AgentBridgeBinaryFrameKind.FILE_TRANSFER && decoded.fileTransferFrame !== null) {
      if (this.fileTransferFrameHandler !== null) {
        this.fileTransferFrameHandler(decoded.fileTransferFrame);
      }
      return;
    }
    logger.warn(TAG, 'bridge websocket binary frame ignored: bytes=' + String(value.byteLength));
  }

  private nextRequestId(): string {
    this.requestSequence = this.requestSequence + 1;
    return 'app_req_' + String(this.requestSequence);
  }

  static normalizeEndpointInput(input: string): string {
    let endpoint = input.trim();
    if (endpoint.length === 0) {
      return '';
    }
    const lower = endpoint.toLowerCase();
    if (lower.startsWith('http://')) {
      endpoint = 'ws://' + endpoint.substring(7);
    } else if (lower.startsWith('https://')) {
      endpoint = 'wss://' + endpoint.substring(8);
    } else if (!lower.startsWith('ws://') && !lower.startsWith('wss://')) {
      endpoint = 'ws://' + endpoint;
    }
    if (endpoint.endsWith('/')) {
      endpoint = endpoint.substring(0, endpoint.length - 1);
    }
    if (!endpoint.toLowerCase().endsWith('/ws') && endpoint.indexOf('?') < 0) {
      endpoint = endpoint + '/ws';
    }
    return endpoint;
  }

  private buildWebSocketUrl(config: AgentBridgeConnectionConfig): string {
    if (this.relayMode) {
      return config.relayUrl;
    }
    const endpoint = AgentBridgeClient.normalizeEndpointInput(config.endpoint);
    if (endpoint.length === 0) {
      return '';
    }
    if (config.token.length > 0) {
      const separator = endpoint.indexOf('?') >= 0 ? '&' : '?';
      return endpoint + separator + 'token=' + encodeURIComponent(config.token) +
        '&clientId=' + encodeURIComponent(config.clientId) +
        '&appNonce=' + encodeURIComponent(config.appNonce) +
        '&endpoint=' + encodeURIComponent(endpoint);
    }
    const separator = endpoint.indexOf('?') >= 0 ? '&' : '?';
    return endpoint + separator + 'clientId=' + encodeURIComponent(config.clientId) +
      '&appNonce=' + encodeURIComponent(config.appNonce) +
      '&endpoint=' + encodeURIComponent(endpoint);
  }

  private safeUrlForLog(url: string): string {
    const queryStart = url.indexOf('?');
    if (queryStart >= 0) {
      return url.substring(0, queryStart);
    }
    return url;
  }

  private businessErrorToString(error: BusinessError): string {
    return 'code=' + String(error.code) + ', message=' + error.message;
  }

  private emitStatus(status: string, detail: string): void {
    this.currentStatus = status;
    if (this.statusHandler) {
      this.statusHandler(status, detail);
    }
  }

  private emitError(message: string): void {
    if (this.errorHandler) {
      this.errorHandler(message);
    }
  }

  private errorToString(error: Object | string | number | boolean | null | undefined): string {
    if (error === null || error === undefined) {
      return 'unclassified error';
    }
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'number' || typeof error === 'boolean') {
      return String(error);
    }
    if (error instanceof Error) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch (jsonError) {
      logger.warn(TAG, 'stringify bridge error failed: ' + String(jsonError));
    }
    return String(error);
  }
}
