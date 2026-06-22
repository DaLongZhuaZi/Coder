import { webSocket } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { logger } from 'ngf_framework';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeContextItem,
  AgentBridgeAttachmentDownloadPayload,
  AgentBridgeCreateSessionPayload,
  AgentBridgeEmptyPayload,
  AgentBridgeIncomingParser,
  AgentBridgeOpenCodeRequestPayload,
  AgentBridgePlanRespondPayload,
  AgentBridgePermissionRespondPayload,
  AgentBridgePreviewPayload,
  AgentBridgeProviderId,
  AgentBridgeRequestEnvelope,
  AgentBridgeRequestRespondPayload,
  AgentBridgeRequestType,
  AgentBridgeSendMessagePayload,
  AgentBridgeSessionAbortPayload,
  AgentBridgeSessionMessagesPayload,
  AgentBridgeSessionRevertPayload,
  AgentBridgeSessionListPayload,
  AgentBridgeWorkspaceGitCommitPayload,
  AgentBridgeWorkspaceGitPathsPayload,
  AgentBridgeWorkspacePathPayload,
  AgentBridgeWorkspaceSessionPayload
} from './AgentBridgeModels';

const TAG: string = 'AgentBridgeClient';
const AGENT_BRIDGE_HEARTBEAT_INTERVAL_MS: number = 20000;
const AGENT_BRIDGE_RECONNECT_BASE_DELAY_MS: number = 1200;
const AGENT_BRIDGE_RECONNECT_MAX_DELAY_MS: number = 15000;

export type AgentBridgeStatusHandler = (status: string, detail: string) => void;
export type AgentBridgeTextHandler = (text: string) => void;
export type AgentBridgeSessionHandler = (sessionId: string) => void;

export class AgentBridgeClient {
  private socket: webSocket.WebSocket | null = null;
  private requestSequence: number = 0;
  private currentStatus: string = AgentBridgeConnectionStatus.DISCONNECTED;
  private statusHandler: AgentBridgeStatusHandler | null = null;
  private textHandler: AgentBridgeTextHandler | null = null;
  private errorHandler: AgentBridgeTextHandler | null = null;
  private sessionHandler: AgentBridgeSessionHandler | null = null;
  private desiredConfig: AgentBridgeConnectionConfig | null = null;
  private manualDisconnect: boolean = true;
  private reconnectTimer: number = -1;
  private reconnectAttempt: number = 0;
  private heartbeatTimer: number = -1;

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
  }

  connect(config: AgentBridgeConnectionConfig): void {
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
        return;
      }
      logger.info(TAG, 'bridge websocket opened');
      this.reconnectAttempt = 0;
      this.emitStatus(AgentBridgeConnectionStatus.CONNECTED, safeUrl);
      this.startHeartbeat();
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
        logger.info(TAG, 'bridge websocket message received: ' + this.compactForLog(value));
        this.handleIncomingText(value);
      } else {
        logger.info(TAG, 'bridge websocket binary message received');
        this.handleIncomingText('[binary message]');
      }
    });

    client.on('close', (err: BusinessError, _value: Object): void => {
      if (this.socket !== client) {
        return;
      }
      this.socket = null;
      this.stopHeartbeat();
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
          this.socket = null;
          this.stopHeartbeat();
          this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
          this.emitError(message);
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      const message = this.errorToString(error);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.desiredConfig = null;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.closeCurrentSocket(false);
    this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed');
  }

  createSession(providerId: string, workspacePath: string, workspaceTitle: string, modelId: string, speedMode: string, reasoningMode: string = 'auto'): void {
    const payload = new AgentBridgeCreateSessionPayload(providerId, workspacePath, workspaceTitle, modelId, speedMode, reasoningMode);
    this.sendRequest(AgentBridgeRequestType.SESSION_CREATE, payload);
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
    contextItems: Array<AgentBridgeContextItem> = []
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
    this.sendRequest(AgentBridgeRequestType.MESSAGE_SEND, payload);
  }

  requestSessions(providerId: string): string {
    return this.sendRequest(AgentBridgeRequestType.SESSION_LIST, new AgentBridgeSessionListPayload(providerId));
  }

  requestSessionMessages(sessionId: string): void {
    this.sendRequest(AgentBridgeRequestType.SESSION_MESSAGES, new AgentBridgeSessionMessagesPayload(sessionId));
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

  requestWorkspaceChanges(sessionId: string, workspaceId: string): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_CHANGES_GET, new AgentBridgeWorkspaceSessionPayload(sessionId, workspaceId));
  }

  requestWorkspaceFiles(sessionId: string, workspaceId: string, parentPath: string): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILES_LIST,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, parentPath, parentPath)
    );
  }

  requestWorkspaceDiff(sessionId: string, workspaceId: string, path: string, staged: boolean): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_DIFF_GET,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, '', staged)
    );
  }

  requestWorkspaceFile(sessionId: string, workspaceId: string, path: string, parentPath: string = ''): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_GET,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, parentPath)
    );
  }

  requestWorkspaceFileDownload(sessionId: string, workspaceId: string, path: string, parentPath: string = ''): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_DOWNLOAD,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path, parentPath)
    );
  }

  requestAttachmentFileDownload(sessionId: string, path: string, kind: string): void {
    this.sendRequest(
      AgentBridgeRequestType.ATTACHMENT_FILE_DOWNLOAD,
      new AgentBridgeAttachmentDownloadPayload(sessionId, path, kind)
    );
  }

  stageWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_STAGE, new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths));
  }

  unstageWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_UNSTAGE, new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths));
  }

  discardWorkspacePaths(sessionId: string, workspaceId: string, paths: Array<string>): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_DISCARD, new AgentBridgeWorkspaceGitPathsPayload(sessionId, workspaceId, paths));
  }

  commitWorkspaceChanges(sessionId: string, workspaceId: string, message: string): void {
    this.sendRequest(AgentBridgeRequestType.WORKSPACE_GIT_COMMIT, new AgentBridgeWorkspaceGitCommitPayload(sessionId, workspaceId, message));
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
    optionId: string,
    answer: string,
    message: string
  ): void {
    const payload = new AgentBridgeRequestRespondPayload(providerId, sessionId, requestId, optionId, answer, message);
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

  private sendHeartbeat(): void {
    if (this.currentStatus !== AgentBridgeConnectionStatus.CONNECTED || !this.socket) {
      return;
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

  private compactForLog(text: string): string {
    if (text.length <= 360) {
      return text;
    }
    return text.substring(0, 360) + '...';
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
    const endpoint = AgentBridgeClient.normalizeEndpointInput(config.endpoint);
    if (endpoint.length === 0) {
      return '';
    }
    if (config.token.length > 0) {
      const separator = endpoint.indexOf('?') >= 0 ? '&' : '?';
      return endpoint + separator + 'token=' + encodeURIComponent(config.token) +
        '&clientId=' + encodeURIComponent(config.clientId);
    }
    const separator = endpoint.indexOf('?') >= 0 ? '&' : '?';
    return endpoint + separator + 'clientId=' + encodeURIComponent(config.clientId);
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
