import { window } from '@kit.ArkUI';
import { logger, securityToolkit } from 'ngf_framework';
import { AgentBridgeClient } from '../agentBridge/AgentBridgeClient';
import {
  AgentBridgeBinaryFrameCodec,
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeEventType,
  AgentBridgeExperienceResult,
  AgentBridgeImportedMessage,
  AgentBridgeIncomingParser,
  AgentBridgeMessageQueueItem,
  AgentBridgeParsedMessage,
  AgentBridgeTerminalFrame,
  AgentBridgeTerminalFrameOpcode,
  AgentBridgeTerminalSnapshotEnvelope,
  AgentBridgeTerminalState,
  AgentBridgeUsageBudgetRecord,
  AgentBridgeUsageEventRecord
} from '../agentBridge/AgentBridgeModels';
import { AgentBridgeTerminalRenderer } from '../agentBridge/AgentBridgeTerminalRenderer';
import { agentHomeHostCredentialStore } from './AgentHomeHostCredentialStore';
import {
  AgentHomeChatItem,
  AgentHomeHostProfile,
  AgentHomeHostSnapshot,
  AgentHomeSessionItem
} from './AgentHomeModels';
import { AgentHomePersistenceRepository } from './AgentHomePersistenceRepository';
import { AgentHomeSessionWindowTarget } from './AgentHomeSessionWindowCoordinator';

const TAG: string = 'AgentHomeSessionWindowController';
const SESSION_WINDOW_CLIENT_ID: string = 'harmony-coder-session-window';
const SESSION_WINDOW_TERMINAL_LIMIT: number = 64000;

export class AgentHomeSessionWindowStorageKey {
  static readonly HOST_PROFILE_ID: string = 'agent_home_session_window_host_profile_id';
  static readonly WORKSPACE_ID: string = 'agent_home_session_window_workspace_id';
  static readonly AGENT_ID: string = 'agent_home_session_window_agent_id';
  static readonly SESSION_ID: string = 'agent_home_session_window_session_id';
  static readonly INSTANCE_ID: string = 'agent_home_session_window_instance_id';
}

export class AgentHomeSessionWindowFailureCategory {
  static readonly NONE: string = '';
  static readonly INVALID_SCOPE: string = 'invalid_scope';
  static readonly HOST_NOT_FOUND: string = 'host_not_found';
  static readonly SESSION_NOT_FOUND: string = 'session_not_found';
  static readonly WORKSPACE_MISMATCH: string = 'workspace_mismatch';
  static readonly CREDENTIAL_MISSING: string = 'credential_missing';
  static readonly BRIDGE_SESSION_MISSING: string = 'bridge_session_missing';
  static readonly BRIDGE_ERROR: string = 'bridge_error';
}

export class AgentHomeSessionWindowScope {
  hostProfileId: string;
  workspaceId: string;
  agentId: string;
  sessionId: string;
  instanceId: string;

  constructor(
    hostProfileId: string = '',
    workspaceId: string = '',
    agentId: string = '',
    sessionId: string = '',
    instanceId: string = ''
  ) {
    this.hostProfileId = hostProfileId;
    this.workspaceId = workspaceId;
    this.agentId = agentId;
    this.sessionId = sessionId;
    this.instanceId = instanceId;
  }

  isValid(): boolean {
    return this.hostProfileId.length > 0 && this.sessionId.length > 0 && this.instanceId.length > 0;
  }

  identityKey(): string {
    return this.hostProfileId + ':' + this.sessionId + ':' + this.instanceId;
  }

  copy(): AgentHomeSessionWindowScope {
    return new AgentHomeSessionWindowScope(
      this.hostProfileId,
      this.workspaceId,
      this.agentId,
      this.sessionId,
      this.instanceId
    );
  }
}

export class AgentHomeSessionWindowMessage {
  id: string;
  messageId: string;
  role: string;
  title: string;
  text: string;
  createdAt: number;
  streaming: boolean;

  constructor(
    id: string,
    messageId: string,
    role: string,
    title: string,
    text: string,
    createdAt: number,
    streaming: boolean = false
  ) {
    this.id = id;
    this.messageId = messageId;
    this.role = role;
    this.title = title;
    this.text = text;
    this.createdAt = createdAt;
    this.streaming = streaming;
  }

  copy(): AgentHomeSessionWindowMessage {
    return new AgentHomeSessionWindowMessage(
      this.id,
      this.messageId,
      this.role,
      this.title,
      this.text,
      this.createdAt,
      this.streaming
    );
  }
}

export class AgentHomeSessionWindowQueueItem {
  queueId: string;
  clientMessageId: string;
  status: string;
  textPreview: string;
  failureCategory: string;

  constructor(
    queueId: string,
    clientMessageId: string,
    status: string,
    textPreview: string,
    failureCategory: string
  ) {
    this.queueId = queueId;
    this.clientMessageId = clientMessageId;
    this.status = status;
    this.textPreview = textPreview;
    this.failureCategory = failureCategory;
  }

  copy(): AgentHomeSessionWindowQueueItem {
    return new AgentHomeSessionWindowQueueItem(
      this.queueId,
      this.clientMessageId,
      this.status,
      this.textPreview,
      this.failureCategory
    );
  }
}

export class AgentHomeSessionWindowTerminal {
  terminalId: string;
  name: string;
  cwd: string;
  status: string;
  slot: number;
  selected: boolean;

  constructor(terminalId: string, name: string, cwd: string, status: string, slot: number = 0) {
    this.terminalId = terminalId;
    this.name = name;
    this.cwd = cwd;
    this.status = status;
    this.slot = slot;
    this.selected = false;
  }

  copy(): AgentHomeSessionWindowTerminal {
    const item = new AgentHomeSessionWindowTerminal(this.terminalId, this.name, this.cwd, this.status, this.slot);
    item.selected = this.selected;
    return item;
  }
}

export class AgentHomeSessionWindowSnapshot {
  scope: AgentHomeSessionWindowScope;
  hostDisplayName: string;
  sessionTitle: string;
  connectionStatus: string;
  failureCategory: string;
  messages: Array<AgentHomeSessionWindowMessage>;
  queueItems: Array<AgentHomeSessionWindowQueueItem>;
  usageEvents: Array<AgentBridgeUsageEventRecord>;
  usageBudget: AgentBridgeUsageBudgetRecord;
  actualTokens: number;
  estimatedTokens: number;
  actualCost: number;
  estimatedCost: number;
  currency: string;
  budgetWarning: boolean;
  terminals: Array<AgentHomeSessionWindowTerminal>;
  selectedTerminalId: string;
  terminalText: string;
  updatedAt: number;

  constructor(scope: AgentHomeSessionWindowScope = new AgentHomeSessionWindowScope()) {
    this.scope = scope.copy();
    this.hostDisplayName = '';
    this.sessionTitle = '';
    this.connectionStatus = AgentBridgeConnectionStatus.DISCONNECTED;
    this.failureCategory = AgentHomeSessionWindowFailureCategory.NONE;
    this.messages = [];
    this.queueItems = [];
    this.usageEvents = [];
    this.usageBudget = new AgentBridgeUsageBudgetRecord();
    this.actualTokens = -1;
    this.estimatedTokens = -1;
    this.actualCost = -1;
    this.estimatedCost = -1;
    this.currency = '';
    this.budgetWarning = false;
    this.terminals = [];
    this.selectedTerminalId = '';
    this.terminalText = '';
    this.updatedAt = Date.now();
  }

  copy(): AgentHomeSessionWindowSnapshot {
    const snapshot = new AgentHomeSessionWindowSnapshot(this.scope);
    snapshot.hostDisplayName = this.hostDisplayName;
    snapshot.sessionTitle = this.sessionTitle;
    snapshot.connectionStatus = this.connectionStatus;
    snapshot.failureCategory = this.failureCategory;
    snapshot.messages = AgentHomeSessionWindowStateReducer.copyMessages(this.messages);
    snapshot.queueItems = AgentHomeSessionWindowStateReducer.copyQueueItems(this.queueItems);
    snapshot.usageEvents = AgentHomeSessionWindowStateReducer.copyUsageEvents(this.usageEvents);
    snapshot.usageBudget = AgentHomeSessionWindowStateReducer.copyUsageBudget(this.usageBudget);
    snapshot.actualTokens = this.actualTokens;
    snapshot.estimatedTokens = this.estimatedTokens;
    snapshot.actualCost = this.actualCost;
    snapshot.estimatedCost = this.estimatedCost;
    snapshot.currency = this.currency;
    snapshot.budgetWarning = this.budgetWarning;
    const terminalCopies: Array<AgentHomeSessionWindowTerminal> = [];
    for (let index = 0; index < this.terminals.length; index++) {
      terminalCopies.push(this.terminals[index].copy());
    }
    snapshot.terminals = terminalCopies;
    snapshot.selectedTerminalId = this.selectedTerminalId;
    snapshot.terminalText = this.terminalText;
    snapshot.updatedAt = this.updatedAt;
    return snapshot;
  }
}

export class AgentHomeSessionWindowStateReducer {
  static persistedMessages(
    items: Array<AgentHomeChatItem>,
    localSessionId: string
  ): Array<AgentHomeSessionWindowMessage> {
    const messages: Array<AgentHomeSessionWindowMessage> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.sessionId !== localSessionId) {
        continue;
      }
      messages.push(new AgentHomeSessionWindowMessage(
        item.id,
        item.messageId,
        item.role,
        item.title,
        item.text,
        item.createdAt,
        false
      ));
    }
    return messages;
  }

  static importedMessages(items: Array<AgentBridgeImportedMessage>): Array<AgentHomeSessionWindowMessage> {
    const messages: Array<AgentHomeSessionWindowMessage> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const stableId = item.id.length > 0 ? item.id :
        (item.messageId.length > 0 ? item.messageId : 'imported_' + index.toString());
      messages.push(new AgentHomeSessionWindowMessage(
        stableId,
        item.messageId,
        item.role,
        item.title,
        item.text,
        item.createdAt,
        false
      ));
    }
    return messages;
  }

  static queueItems(
    items: Array<AgentBridgeMessageQueueItem>,
    bridgeSessionId: string
  ): Array<AgentHomeSessionWindowQueueItem> {
    const queueItems: Array<AgentHomeSessionWindowQueueItem> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.sessionId.length > 0 && item.sessionId !== bridgeSessionId) {
        continue;
      }
      queueItems.push(new AgentHomeSessionWindowQueueItem(
        item.queueId,
        item.clientMessageId,
        item.status,
        item.textPreview,
        item.failureCategory
      ));
    }
    return queueItems;
  }

  static copyMessages(items: Array<AgentHomeSessionWindowMessage>): Array<AgentHomeSessionWindowMessage> {
    const copies: Array<AgentHomeSessionWindowMessage> = [];
    for (let index = 0; index < items.length; index++) {
      copies.push(items[index].copy());
    }
    return copies;
  }

  static copyQueueItems(items: Array<AgentHomeSessionWindowQueueItem>): Array<AgentHomeSessionWindowQueueItem> {
    const copies: Array<AgentHomeSessionWindowQueueItem> = [];
    for (let index = 0; index < items.length; index++) {
      copies.push(items[index].copy());
    }
    return copies;
  }

  static copyUsageEvents(items: Array<AgentBridgeUsageEventRecord>): Array<AgentBridgeUsageEventRecord> {
    const copies: Array<AgentBridgeUsageEventRecord> = [];
    for (let index = 0; index < items.length; index++) {
      copies.push(AgentHomeSessionWindowStateReducer.copyUsageEvent(items[index]));
    }
    return copies;
  }

  static copyUsageBudget(source: AgentBridgeUsageBudgetRecord): AgentBridgeUsageBudgetRecord {
    const item = new AgentBridgeUsageBudgetRecord();
    item.hostProfileId = source.hostProfileId;
    item.sessionId = source.sessionId;
    item.agentId = source.agentId;
    item.scopeKey = source.scopeKey;
    item.scopeType = source.scopeType;
    item.tokenLimit = source.tokenLimit;
    item.costLimit = source.costLimit;
    item.currency = source.currency;
    item.window = source.window;
    item.warning = source.warning;
    item.warningThreshold = source.warningThreshold;
    item.updatedAt = source.updatedAt;
    item.isSet = source.isSet;
    return item;
  }

  private static copyUsageEvent(source: AgentBridgeUsageEventRecord): AgentBridgeUsageEventRecord {
    const item = new AgentBridgeUsageEventRecord();
    item.eventId = source.eventId;
    item.sessionId = source.sessionId;
    item.agentId = source.agentId;
    item.providerId = source.providerId;
    item.source = source.source;
    item.currency = source.currency;
    item.window = source.window;
    item.inputTokens = source.inputTokens;
    item.outputTokens = source.outputTokens;
    item.cacheReadTokens = source.cacheReadTokens;
    item.cacheWriteTokens = source.cacheWriteTokens;
    item.reasoningTokens = source.reasoningTokens;
    item.totalTokens = source.totalTokens;
    item.cost = source.cost;
    item.quotaRemaining = source.quotaRemaining;
    item.quotaLimit = source.quotaLimit;
    item.quotaResetAt = source.quotaResetAt;
    item.quotaSource = source.quotaSource;
    item.estimated = source.estimated;
    item.kind = source.kind;
    item.beforeTokens = source.beforeTokens;
    item.afterTokens = source.afterTokens;
    item.reason = source.reason;
    item.occurredAt = source.occurredAt;
    return item;
  }
}

export type AgentHomeSessionWindowSnapshotHandler = (snapshot: AgentHomeSessionWindowSnapshot) => void;

export class AgentHomeSessionWindowRuntimeRegistry {
  private windowNames: Map<string, string> = new Map<string, string>();

  register(instanceId: string, windowName: string): void {
    if (instanceId.length > 0 && windowName.length > 0) {
      this.windowNames.set(instanceId, windowName);
    }
  }

  windowNameFor(instanceId: string): string {
    const value = this.windowNames.get(instanceId);
    return value === undefined ? '' : value;
  }

  release(instanceId: string): void {
    this.windowNames.delete(instanceId);
  }
}

export const agentHomeSessionWindowRuntimeRegistry: AgentHomeSessionWindowRuntimeRegistry =
  new AgentHomeSessionWindowRuntimeRegistry();

export class AgentHomeSessionWindowContentLoader {
  static readonly PAGE_PATH: string = 'pages/ngf/NGFAgentSessionWindowPage';

  static async load(
    subWindow: window.Window,
    windowName: string,
    target: AgentHomeSessionWindowTarget
  ): Promise<void> {
    agentHomeSessionWindowRuntimeRegistry.register(target.instanceId, windowName);
    try {
      await subWindow.setUIContent(AgentHomeSessionWindowContentLoader.PAGE_PATH);
      const storage: LocalStorage | undefined = subWindow.getUIContext().getSharedLocalStorage();
      if (storage === undefined) {
        throw new Error('session window LocalStorage is unavailable');
      }
      storage.setOrCreate<string>(AgentHomeSessionWindowStorageKey.HOST_PROFILE_ID, target.hostProfileId);
      storage.setOrCreate<string>(AgentHomeSessionWindowStorageKey.WORKSPACE_ID, target.workspaceId);
      storage.setOrCreate<string>(AgentHomeSessionWindowStorageKey.AGENT_ID, target.agentId);
      storage.setOrCreate<string>(AgentHomeSessionWindowStorageKey.SESSION_ID, target.sessionId);
      storage.setOrCreate<string>(AgentHomeSessionWindowStorageKey.INSTANCE_ID, target.instanceId);
      await subWindow.showWindow();
    } catch (error) {
      agentHomeSessionWindowRuntimeRegistry.release(target.instanceId);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }
}

export class AgentHomeSessionWindowController {
  private readonly client: AgentBridgeClient = new AgentBridgeClient();
  private readonly persistence: AgentHomePersistenceRepository = new AgentHomePersistenceRepository();
  private observer: AgentHomeSessionWindowSnapshotHandler | null = null;
  private snapshot: AgentHomeSessionWindowSnapshot = new AgentHomeSessionWindowSnapshot();
  private session: AgentHomeSessionItem | null = null;
  private bridgeSessionId: string = '';
  private generation: number = 0;
  private refreshTimer: number = -1;
  private selectedTerminalSlot: number = 0;
  private terminalProtocolVersion: number = 1;
  private terminalRestorePending: boolean = false;
  private terminalLastRestoreSeq: number = 0;
  private terminalPendingOutput: string = '';
  private readonly terminalRenderer: AgentBridgeTerminalRenderer = new AgentBridgeTerminalRenderer();

  setObserver(observer: AgentHomeSessionWindowSnapshotHandler | null): void {
    this.observer = observer;
    if (observer !== null) {
      observer(this.snapshot.copy());
    }
  }

  start(scope: AgentHomeSessionWindowScope, appVersion: string): void {
    this.stop();
    this.generation = this.generation + 1;
    const generation = this.generation;
    this.snapshot = new AgentHomeSessionWindowSnapshot(scope);
    if (!scope.isValid()) {
      this.fail(AgentHomeSessionWindowFailureCategory.INVALID_SCOPE);
      return;
    }
    this.snapshot.connectionStatus = AgentBridgeConnectionStatus.CONNECTING;
    this.publish();
    this.initialize(scope.copy(), appVersion, generation).catch((error: Error): void => {
      if (generation !== this.generation) {
        return;
      }
      logger.error(TAG, 'initialize session window failed: ' + error.message);
      this.fail(AgentHomeSessionWindowFailureCategory.BRIDGE_ERROR);
    });
  }

  stop(): void {
    this.generation = this.generation + 1;
    this.clearRefreshTimer();
    if (this.snapshot.selectedTerminalId.length > 0 && this.selectedTerminalSlot > 0) {
      this.client.unsubscribeTerminal(this.snapshot.selectedTerminalId);
    }
    this.client.clearHandlers();
    this.client.disconnect();
    this.session = null;
    this.bridgeSessionId = '';
    this.selectedTerminalSlot = 0;
    this.terminalRestorePending = false;
    this.terminalPendingOutput = '';
  }

  refresh(): void {
    if (this.snapshot.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      return;
    }
    if (this.bridgeSessionId.length > 0) {
      this.client.requestSessionMessages(this.bridgeSessionId);
      this.client.requestMessageQueue(this.bridgeSessionId);
      this.client.requestUsageSummary(this.bridgeSessionId, this.snapshot.scope.agentId);
      this.client.requestUsageEvents(this.bridgeSessionId);
      this.client.requestUsageBudget(this.bridgeSessionId);
    }
    this.client.requestTerminals(
      this.snapshot.scope.workspaceId,
      '',
      this.snapshot.scope.agentId
    );
  }

  sendMessage(text: string): boolean {
    const normalized = text.trim();
    const session = this.session;
    if (normalized.length === 0 || session === null || this.bridgeSessionId.length === 0 ||
      this.snapshot.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      return false;
    }
    const clientMessageId = this.snapshot.scope.instanceId + '_' + Date.now().toString();
    this.client.sendMessage(
      this.bridgeSessionId,
      normalized,
      session.modelId,
      session.speedMode,
      session.reasoningMode,
      '',
      [],
      '',
      [],
      clientMessageId,
      '',
      'queue',
      ''
    );
    const messages = AgentHomeSessionWindowStateReducer.copyMessages(this.snapshot.messages);
    messages.push(new AgentHomeSessionWindowMessage(
      clientMessageId,
      '',
      'user',
      '',
      normalized,
      Date.now(),
      false
    ));
    this.snapshot.messages = messages;
    this.publish();
    return true;
  }

  cancelQueueItem(queueId: string): void {
    if (queueId.length > 0 && this.bridgeSessionId.length > 0) {
      this.client.cancelQueuedMessage(this.bridgeSessionId, queueId);
    }
  }

  retryQueueItem(queueId: string): void {
    if (queueId.length > 0 && this.bridgeSessionId.length > 0) {
      this.client.retryQueuedMessage(this.bridgeSessionId, queueId);
    }
  }

  selectTerminal(terminalId: string): void {
    if (terminalId.length === 0 || terminalId === this.snapshot.selectedTerminalId && this.selectedTerminalSlot > 0) {
      return;
    }
    if (this.snapshot.selectedTerminalId.length > 0 && this.selectedTerminalSlot > 0) {
      this.client.unsubscribeTerminal(this.snapshot.selectedTerminalId);
    }
    this.snapshot.selectedTerminalId = terminalId;
    this.selectedTerminalSlot = 0;
    this.terminalRestorePending = true;
    this.terminalLastRestoreSeq = 0;
    this.terminalPendingOutput = '';
    this.terminalRenderer.replace('');
    this.snapshot.terminalText = '';
    this.markSelectedTerminal(terminalId);
    this.client.subscribeTerminal(terminalId, this.snapshot.scope.agentId, this.terminalProtocolVersion);
    this.publish();
  }

  private async initialize(
    scope: AgentHomeSessionWindowScope,
    appVersion: string,
    generation: number
  ): Promise<void> {
    await this.persistence.initialize();
    const profiles = await this.persistence.loadHostProfiles();
    if (generation !== this.generation) {
      return;
    }
    const profile = this.findHostProfile(profiles, scope.hostProfileId);
    if (profile === null) {
      this.fail(AgentHomeSessionWindowFailureCategory.HOST_NOT_FOUND);
      return;
    }
    const hostSnapshot = await this.persistence.loadHostSnapshot(profile);
    if (generation !== this.generation) {
      return;
    }
    const session = this.findSession(hostSnapshot, scope.sessionId);
    if (session === null) {
      this.fail(AgentHomeSessionWindowFailureCategory.SESSION_NOT_FOUND);
      return;
    }
    if (scope.workspaceId.length > 0 && session.workspaceId !== scope.workspaceId) {
      this.fail(AgentHomeSessionWindowFailureCategory.WORKSPACE_MISMATCH);
      return;
    }
    this.session = session;
    this.bridgeSessionId = session.bridgeSessionId;
    this.snapshot.hostDisplayName = profile.displayName;
    this.snapshot.sessionTitle = session.title;
    this.snapshot.messages = AgentHomeSessionWindowStateReducer.persistedMessages(
      hostSnapshot.messages,
      scope.sessionId
    );
    this.publish();
    if (this.bridgeSessionId.length === 0) {
      this.fail(AgentHomeSessionWindowFailureCategory.BRIDGE_SESSION_MISSING);
      return;
    }
    const credential = await agentHomeHostCredentialStore.read(profile.credentialAlias);
    if (generation !== this.generation) {
      return;
    }
    if (credential === null || credential.length === 0) {
      this.fail(AgentHomeSessionWindowFailureCategory.CREDENTIAL_MISSING);
      return;
    }
    const endpoint = AgentBridgeClient.normalizeEndpointInput(profile.endpoint);
    if (endpoint.length === 0) {
      this.fail(AgentHomeSessionWindowFailureCategory.HOST_NOT_FOUND);
      return;
    }
    this.bindClientHandlers(generation);
    const nonce = securityToolkit.generateRandomBase64(18);
    this.client.connect(new AgentBridgeConnectionConfig(
      endpoint,
      credential,
      SESSION_WINDOW_CLIENT_ID,
      nonce,
      scope.hostProfileId,
      appVersion
    ));
  }

  private bindClientHandlers(generation: number): void {
    this.client.setHandlers(
      (status: string, _detail: string): void => {
        if (generation === this.generation) {
          this.handleStatus(status);
        }
      },
      (text: string): void => {
        if (generation === this.generation) {
          this.handleText(text);
        }
      },
      (_message: string): void => {
        if (generation === this.generation) {
          this.fail(AgentHomeSessionWindowFailureCategory.BRIDGE_ERROR);
        }
      },
      (_sessionId: string): void => {}
    );
    this.client.setBinaryHandlers(
      (frame: AgentBridgeTerminalFrame): void => {
        if (generation === this.generation) {
          this.handleTerminalFrame(frame);
        }
      },
      null
    );
  }

  private handleStatus(status: string): void {
    this.snapshot.connectionStatus = status;
    if (status === AgentBridgeConnectionStatus.CONNECTED) {
      this.snapshot.failureCategory = AgentHomeSessionWindowFailureCategory.NONE;
      this.scheduleRefresh();
    }
    this.publish();
  }

  private handleText(text: string): void {
    const parsed = AgentBridgeIncomingParser.parse(text);
    if (!parsed.isOk) {
      this.snapshot.failureCategory = AgentHomeSessionWindowFailureCategory.BRIDGE_ERROR;
      this.publish();
      return;
    }
    if (text.indexOf('"serverInfo":{') >= 0 || parsed.eventType === AgentBridgeEventType.SERVER_INFO) {
      const info = AgentBridgeIncomingParser.parseServerInfo(text);
      this.terminalProtocolVersion = info.terminalStreamProtocolVersion >= 2 ? 2 : 1;
    }
    if (text.indexOf('"messages":[') >= 0) {
      this.snapshot.messages = AgentHomeSessionWindowStateReducer.importedMessages(
        AgentBridgeIncomingParser.parseImportedMessages(text)
      );
      this.publish();
    }
    if (parsed.eventType === AgentBridgeEventType.MESSAGE_DELTA ||
      parsed.eventType === AgentBridgeEventType.MESSAGE_COMPLETED) {
      this.applyLiveMessage(parsed, parsed.eventType === AgentBridgeEventType.MESSAGE_COMPLETED);
    }
    if (parsed.eventType === AgentBridgeEventType.MESSAGE_QUEUE_UPDATED) {
      this.client.requestMessageQueue(this.bridgeSessionId);
    }
    if (parsed.eventType === AgentBridgeEventType.USAGE_UPDATED ||
      parsed.eventType === AgentBridgeEventType.USAGE_BUDGET_WARNING) {
      if (parsed.eventType === AgentBridgeEventType.USAGE_BUDGET_WARNING) {
        this.snapshot.budgetWarning = true;
      }
      this.client.requestUsageSummary(this.bridgeSessionId, this.snapshot.scope.agentId);
      this.client.requestUsageEvents(this.bridgeSessionId);
      this.client.requestUsageBudget(this.bridgeSessionId);
      this.publish();
    }
    if (text.indexOf('"action":"message.queue.') >= 0 ||
      text.indexOf('"action":"usage.') >= 0) {
      this.applyExperienceResult(AgentBridgeIncomingParser.parseExperienceResult(text));
    }
    if (text.indexOf('"terminals":[') >= 0) {
      this.applyTerminalList(AgentBridgeIncomingParser.parseTerminalStates(text));
    }
    if (text.indexOf('"terminal":{') >= 0) {
      this.applyTerminalState(
        AgentBridgeIncomingParser.parseFirstTerminalState(text),
        AgentBridgeIncomingParser.parseTerminalSlot(text),
        AgentBridgeIncomingParser.parseTerminalCaptureText(text)
      );
    }
    if (parsed.eventType === AgentBridgeEventType.TERMINAL_STREAM_EXIT) {
      this.markTerminalClosed(AgentBridgeIncomingParser.extractStringProperty(text, 'terminalId'));
    }
  }

  private applyExperienceResult(result: AgentBridgeExperienceResult): void {
    if (result.action === 'message.queue.list' || result.queueItemsJson.length > 0) {
      this.snapshot.queueItems = AgentHomeSessionWindowStateReducer.queueItems(
        AgentBridgeIncomingParser.parseMessageQueueItems(result.queueItemsJson),
        this.bridgeSessionId
      );
    }
    if (result.action === 'usage.summary.get') {
      this.snapshot.actualTokens = result.realTokens;
      this.snapshot.estimatedTokens = result.estimatedTokens;
      this.snapshot.actualCost = result.realCost;
      this.snapshot.estimatedCost = result.estimatedCost;
      this.snapshot.currency = result.currency;
    }
    if (result.usageEventsJson.length > 0 || result.action === 'usage.events.list') {
      this.snapshot.usageEvents = AgentBridgeIncomingParser.parseUsageEvents(result.usageEventsJson);
    }
    if (result.budgetJson.length > 0) {
      this.snapshot.usageBudget = AgentBridgeIncomingParser.parseUsageBudget(result.budgetJson);
      this.snapshot.budgetWarning = this.snapshot.usageBudget.warning;
    }
    this.publish();
  }

  private applyLiveMessage(parsed: AgentBridgeParsedMessage, completed: boolean): void {
    if (parsed.sessionId.length > 0 && parsed.sessionId !== this.bridgeSessionId) {
      return;
    }
    if (parsed.text.length === 0 && parsed.reasoningText.length === 0) {
      return;
    }
    const key = parsed.messageId.length > 0 ? parsed.messageId :
      (parsed.partId.length > 0 ? parsed.partId : 'streaming_assistant');
    const messages = AgentHomeSessionWindowStateReducer.copyMessages(this.snapshot.messages);
    let foundIndex = -1;
    for (let index = 0; index < messages.length; index++) {
      if (messages[index].messageId === key || messages[index].id === key) {
        foundIndex = index;
        break;
      }
    }
    if (foundIndex < 0) {
      messages.push(new AgentHomeSessionWindowMessage(
        key,
        parsed.messageId,
        parsed.role.length > 0 ? parsed.role : 'assistant',
        '',
        parsed.text,
        Date.now(),
        !completed
      ));
    } else {
      const existing = messages[foundIndex];
      existing.text = completed && parsed.text.length > 0 ? parsed.text : existing.text + parsed.text;
      existing.streaming = !completed;
      if (parsed.messageId.length > 0) {
        existing.messageId = parsed.messageId;
      }
    }
    this.snapshot.messages = messages;
    this.publish();
  }

  private applyTerminalList(states: Array<AgentBridgeTerminalState>): void {
    const terminals: Array<AgentHomeSessionWindowTerminal> = [];
    for (let index = 0; index < states.length; index++) {
      const state = states[index];
      if (this.snapshot.scope.workspaceId.length > 0 && state.workspaceId.length > 0 &&
        state.workspaceId !== this.snapshot.scope.workspaceId) {
        continue;
      }
      const existing = this.findTerminal(state.terminalId);
      const terminal = new AgentHomeSessionWindowTerminal(
        state.terminalId,
        state.name,
        state.cwd,
        state.status,
        existing === null ? 0 : existing.slot
      );
      terminal.selected = state.terminalId === this.snapshot.selectedTerminalId;
      terminals.push(terminal);
    }
    this.snapshot.terminals = terminals;
    const selectedStillExists = this.findTerminal(this.snapshot.selectedTerminalId) !== null;
    if (!selectedStillExists) {
      this.snapshot.selectedTerminalId = '';
      this.selectedTerminalSlot = 0;
      this.snapshot.terminalText = '';
    }
    this.publish();
    if (this.snapshot.selectedTerminalId.length === 0 && terminals.length > 0) {
      this.selectTerminal(terminals[0].terminalId);
    }
  }

  private applyTerminalState(state: AgentBridgeTerminalState, slot: number, captureText: string): void {
    if (state.terminalId.length === 0) {
      return;
    }
    const terminals: Array<AgentHomeSessionWindowTerminal> = [];
    let replaced = false;
    for (let index = 0; index < this.snapshot.terminals.length; index++) {
      const existing = this.snapshot.terminals[index];
      if (existing.terminalId !== state.terminalId) {
        terminals.push(existing.copy());
        continue;
      }
      const terminal = new AgentHomeSessionWindowTerminal(
        state.terminalId,
        state.name,
        state.cwd,
        state.status,
        slot > 0 ? slot : existing.slot
      );
      terminal.selected = state.terminalId === this.snapshot.selectedTerminalId;
      terminals.push(terminal);
      replaced = true;
    }
    if (!replaced) {
      const terminal = new AgentHomeSessionWindowTerminal(state.terminalId, state.name, state.cwd, state.status, slot);
      terminal.selected = state.terminalId === this.snapshot.selectedTerminalId;
      terminals.push(terminal);
    }
    this.snapshot.terminals = terminals;
    if (state.terminalId === this.snapshot.selectedTerminalId && slot > 0) {
      this.selectedTerminalSlot = slot;
    }
    if (state.terminalId === this.snapshot.selectedTerminalId && captureText.length > 0) {
      this.terminalRenderer.replace(captureText);
      this.snapshot.terminalText = this.terminalRenderer.plainText();
      this.terminalRestorePending = false;
    }
    this.publish();
  }

  private handleTerminalFrame(frame: AgentBridgeTerminalFrame): void {
    if (frame.slot <= 0 || frame.slot !== this.selectedTerminalSlot) {
      return;
    }
    if (frame.opcode === AgentBridgeTerminalFrameOpcode.RESTORE ||
      frame.opcode === AgentBridgeTerminalFrameOpcode.SNAPSHOT) {
      let envelope = new AgentBridgeTerminalSnapshotEnvelope();
      if (this.terminalProtocolVersion >= 2) {
        envelope = AgentBridgeBinaryFrameCodec.decodeTerminalSnapshotEnvelope(frame);
      } else {
        envelope.text = AgentBridgeBinaryFrameCodec.terminalFrameText(frame);
      }
      if (envelope.sequenced && envelope.restoreSeq <= this.terminalLastRestoreSeq) {
        return;
      }
      if (envelope.sequenced) {
        this.terminalLastRestoreSeq = envelope.restoreSeq;
      }
      this.terminalRenderer.replace(envelope.text + this.terminalPendingOutput);
      this.terminalPendingOutput = '';
      this.terminalRestorePending = false;
      this.snapshot.terminalText = this.terminalRenderer.plainText();
      this.publish();
      return;
    }
    if (frame.opcode === AgentBridgeTerminalFrameOpcode.OUTPUT) {
      const output = AgentBridgeBinaryFrameCodec.terminalFrameText(frame);
      if (this.terminalRestorePending) {
        this.terminalPendingOutput = this.limitTerminalText(this.terminalPendingOutput + output);
      } else {
        this.terminalRenderer.feed(output);
        this.snapshot.terminalText = this.terminalRenderer.plainText();
      }
      this.publish();
    }
  }

  private markTerminalClosed(terminalId: string): void {
    if (terminalId.length === 0) {
      return;
    }
    const terminals: Array<AgentHomeSessionWindowTerminal> = [];
    for (let index = 0; index < this.snapshot.terminals.length; index++) {
      const terminal = this.snapshot.terminals[index].copy();
      if (terminal.terminalId === terminalId) {
        terminal.status = 'closed';
      }
      terminals.push(terminal);
    }
    this.snapshot.terminals = terminals;
    this.publish();
  }

  private markSelectedTerminal(terminalId: string): void {
    const terminals: Array<AgentHomeSessionWindowTerminal> = [];
    for (let index = 0; index < this.snapshot.terminals.length; index++) {
      const terminal = this.snapshot.terminals[index].copy();
      terminal.selected = terminal.terminalId === terminalId;
      terminals.push(terminal);
    }
    this.snapshot.terminals = terminals;
  }

  private findHostProfile(items: Array<AgentHomeHostProfile>, hostProfileId: string): AgentHomeHostProfile | null {
    for (let index = 0; index < items.length; index++) {
      if (items[index].hostProfileId === hostProfileId) {
        return items[index];
      }
    }
    return null;
  }

  private findSession(snapshot: AgentHomeHostSnapshot, sessionId: string): AgentHomeSessionItem | null {
    for (let index = 0; index < snapshot.sessions.length; index++) {
      if (snapshot.sessions[index].id === sessionId) {
        return snapshot.sessions[index];
      }
    }
    return null;
  }

  private findTerminal(terminalId: string): AgentHomeSessionWindowTerminal | null {
    if (terminalId.length === 0) {
      return null;
    }
    for (let index = 0; index < this.snapshot.terminals.length; index++) {
      if (this.snapshot.terminals[index].terminalId === terminalId) {
        return this.snapshot.terminals[index];
      }
    }
    return null;
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    this.refreshTimer = setTimeout((): void => {
      this.refreshTimer = -1;
      this.refresh();
    }, 0);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer >= 0) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = -1;
    }
  }

  private fail(category: string): void {
    this.snapshot.failureCategory = category;
    this.snapshot.connectionStatus = AgentBridgeConnectionStatus.ERROR;
    this.publish();
  }

  private publish(): void {
    this.snapshot.updatedAt = Date.now();
    const observer = this.observer;
    if (observer !== null) {
      observer(this.snapshot.copy());
    }
  }

  private limitTerminalText(text: string): string {
    if (text.length <= SESSION_WINDOW_TERMINAL_LIMIT) {
      return text;
    }
    return text.substring(text.length - SESSION_WINDOW_TERMINAL_LIMIT);
  }
}
