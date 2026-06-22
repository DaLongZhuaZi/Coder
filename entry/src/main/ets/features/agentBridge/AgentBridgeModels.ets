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
}

export class AgentBridgeRequestType {
  static readonly PING: string = 'bridge.ping';
  static readonly CAPABILITIES_GET: string = 'capabilities.get';
  static readonly SESSION_CREATE: string = 'session.create';
  static readonly SESSION_LIST: string = 'session.list';
  static readonly SESSION_MESSAGES: string = 'session.messages';
  static readonly SESSION_REVERT: string = 'session.revert';
  static readonly SESSION_ABORT: string = 'session.abort';
  static readonly MESSAGE_SEND: string = 'message.send';
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
}

export class AgentBridgeEnvelopeType {
  static readonly RESPONSE: string = 'response';
  static readonly EVENT: string = 'event';
  static readonly RAW: string = 'raw';
}

export class AgentBridgeEventType {
  static readonly BRIDGE_CONNECTED: string = 'bridge.connected';
  static readonly SESSION_CREATED: string = 'session.created';
  static readonly SESSION_UPDATED: string = 'session.updated';
  static readonly SESSION_MESSAGES: string = 'session.messages';
  static readonly MESSAGE_DELTA: string = 'message.delta';
  static readonly MESSAGE_COMPLETED: string = 'message.completed';
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
  static readonly WORKSPACE_FILES_UPDATED: string = 'workspace.files.updated';
  static readonly FILE_DOWNLOAD_READY: string = 'file.download.ready';
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

  constructor(endpoint: string, token: string, clientId: string = 'harmony-coder-app') {
    this.endpoint = endpoint;
    this.token = token;
    this.clientId = clientId;
  }
}

export class AgentBridgeModelOption {
  id: string;
  displayName: string;
  vendor: string;
  isDefault: boolean;
  contextWindow: number;

  constructor(id: string, displayName: string, vendor: string, isDefault: boolean, contextWindow: number) {
    this.id = id;
    this.displayName = displayName;
    this.vendor = vendor;
    this.isDefault = isDefault;
    this.contextWindow = contextWindow;
  }
}

export class AgentBridgeSpeedModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;

  constructor(id: string, displayName: string, description: string, isDefault: boolean) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
  }
}

export class AgentBridgeReasoningModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;

  constructor(id: string, displayName: string, description: string, isDefault: boolean) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
  }
}

export class AgentBridgeInteractionModeOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  agent: string;
  category: string;

  constructor(id: string, displayName: string, description: string, isDefault: boolean, agent: string = '', category: string = 'run') {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.isDefault = isDefault;
    this.agent = agent;
    this.category = category;
  }
}

export class AgentBridgeToolOption {
  id: string;
  displayName: string;
  description: string;
  risk: string;

  constructor(id: string, displayName: string, description: string, risk: string) {
    this.id = id;
    this.displayName = displayName;
    this.description = description;
    this.risk = risk;
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
  models: Array<AgentBridgeModelOption>;
  speedModes: Array<AgentBridgeSpeedModeOption>;
  reasoningModes: Array<AgentBridgeReasoningModeOption>;
  interactionModes: Array<AgentBridgeInteractionModeOption>;
  tools: Array<AgentBridgeToolOption>;

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
    tools: Array<AgentBridgeToolOption>
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
    this.models = models;
    this.speedModes = speedModes;
    this.reasoningModes = reasoningModes;
    this.interactionModes = interactionModes;
    this.tools = tools;
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
    updatedAt: number
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
  optionId: string;
  answer: string;
  message: string;

  constructor(providerId: string, sessionId: string, requestId: string, optionId: string, answer: string, message: string) {
    this.providerId = providerId;
    this.sessionId = sessionId;
    this.requestId = requestId;
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

  constructor(sessionId: string, workspaceId: string) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
  }
}

export class AgentBridgeWorkspacePathPayload {
  sessionId: string;
  workspaceId: string;
  path: string;
  parentPath: string;
  staged: boolean;

  constructor(sessionId: string, workspaceId: string, path: string, parentPath: string = '', staged: boolean = false) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.path = path;
    this.parentPath = parentPath;
    this.staged = staged;
  }
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

  constructor(sessionId: string, workspaceId: string, paths: Array<string>) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.paths = paths;
  }
}

export class AgentBridgeWorkspaceGitCommitPayload {
  sessionId: string;
  workspaceId: string;
  message: string;

  constructor(sessionId: string, workspaceId: string, message: string) {
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.message = message;
  }
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
    parsed.previewPath = AgentBridgeIncomingParser.extractIndexedPayloadFirstStringProperty(previewObject, source, propertyIndex, 'path');
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
    return new AgentBridgeProviderOption(
      id,
      displayName.length > 0 ? displayName : id,
      AgentBridgeIncomingParser.extractStringProperty(source, 'status'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'description'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'endpoint'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'streaming'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'tools'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'previews'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'permissions'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'history'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'modelSelection'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'speedProfiles'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'workspaceAware'),
      models,
      speedModes,
      reasoningModes.length > 0 ? reasoningModes : AgentBridgeDefaultOptions.buildDefaultReasoningModes(),
      interactionModes.length > 0 ? interactionModes : AgentBridgeIncomingParser.defaultInteractionModesForProvider(id),
      tools
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
        AgentBridgeIncomingParser.extractNumberProperty(item, 'contextWindow', 0)
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
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault')
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
        AgentBridgeIncomingParser.extractBooleanProperty(item, 'isDefault')
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
        category.length > 0 ? category : 'run'
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
        AgentBridgeIncomingParser.extractStringProperty(item, 'risk')
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
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', 0)
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
