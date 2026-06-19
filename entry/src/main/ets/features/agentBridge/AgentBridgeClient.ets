import { webSocket } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { logger } from 'ngf_framework';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
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
  AgentBridgeSessionMessagesPayload,
  AgentBridgeSessionRevertPayload,
  AgentBridgeSessionListPayload,
  AgentBridgeWorkspaceGitCommitPayload,
  AgentBridgeWorkspaceGitPathsPayload,
  AgentBridgeWorkspacePathPayload,
  AgentBridgeWorkspaceSessionPayload
} from './AgentBridgeModels';

const TAG: string = 'AgentBridgeClient';

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

  connect(config: AgentBridgeConnectionConfig): void {
    this.disconnect();

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
      this.emitStatus(AgentBridgeConnectionStatus.CONNECTED, safeUrl);
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
      if (err) {
        logger.warn(TAG, 'bridge websocket close with error: ' + this.businessErrorToString(err));
      }
      logger.info(TAG, 'bridge websocket closed');
      if (this.currentStatus === AgentBridgeConnectionStatus.ERROR) {
        return;
      }
      this.emitStatus(AgentBridgeConnectionStatus.DISCONNECTED, 'closed');
    });

    client.on('error', (err: BusinessError): void => {
      if (this.socket !== client) {
        return;
      }
      const message = this.businessErrorToString(err);
      logger.warn(TAG, 'bridge websocket error: ' + message);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
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
          this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
          this.emitError(message);
        }
      });
    } catch (error) {
      const message = this.errorToString(error);
      this.emitStatus(AgentBridgeConnectionStatus.ERROR, message);
      this.emitError(message);
    }
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.close();
    } catch (error) {
      logger.warn(TAG, 'bridge websocket close failed: ' + this.errorToString(error));
    }
    this.socket = null;
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
    interactionMode: string = 'goal',
    interactionModes: Array<string> = [],
    agent: string = ''
  ): void {
    const selectedModes: Array<string> = [];
    for (let index = 0; index < interactionModes.length; index++) {
      selectedModes.push(interactionModes[index]);
    }
    const payload = new AgentBridgeSendMessagePayload(sessionId, text, modelId, speedMode, reasoningMode, interactionMode, selectedModes, agent);
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

  requestWorkspaceFile(sessionId: string, workspaceId: string, path: string): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_GET,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path)
    );
  }

  requestWorkspaceFileDownload(sessionId: string, workspaceId: string, path: string): void {
    this.sendRequest(
      AgentBridgeRequestType.WORKSPACE_FILE_DOWNLOAD,
      new AgentBridgeWorkspacePathPayload(sessionId, workspaceId, path)
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
          this.emitError(message);
        }
      });
      return requestId;
    } catch (error) {
      this.emitError(this.errorToString(error));
      return '';
    }
  }

  private handleIncomingText(text: string): void {
    if (this.textHandler) {
      this.textHandler(text);
    }
    const parsed = AgentBridgeIncomingParser.parse(text);
    if (parsed.sessionId.length > 0 && this.sessionHandler) {
      this.sessionHandler(parsed.sessionId);
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
      return endpoint + separator + 'token=' + encodeURIComponent(config.token);
    }
    return endpoint;
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
