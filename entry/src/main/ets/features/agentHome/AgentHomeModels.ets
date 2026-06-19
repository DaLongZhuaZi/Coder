export class AgentHomeWorkspaceItem {
  id: string;
  title: string;
  subtitle: string;
  initial: string;
  accentColor: string;
  branchName: string;
  isOnline: boolean;

  constructor(
    id: string,
    title: string,
    subtitle: string,
    initial: string,
    accentColor: string,
    branchName: string,
    isOnline: boolean
  ) {
    this.id = id;
    this.title = title;
    this.subtitle = subtitle;
    this.initial = initial;
    this.accentColor = accentColor;
    this.branchName = branchName;
    this.isOnline = isOnline;
  }
}

export class AgentHomeSessionItem {
  id: string;
  workspaceId: string;
  title: string;
  branchName: string;
  providerId: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  bridgeSessionId: string;
  updatedAt: number;

  constructor(
    id: string,
    workspaceId: string,
    title: string,
    branchName: string,
    providerId: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    bridgeSessionId: string,
    updatedAt: number
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.title = title;
    this.branchName = branchName;
    this.providerId = providerId;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.bridgeSessionId = bridgeSessionId;
    this.updatedAt = updatedAt;
  }
}

export class AgentHomeMessageRole {
  static readonly USER: string = 'user';
  static readonly ASSISTANT: string = 'assistant';
  static readonly STATUS: string = 'status';
  static readonly TOOL: string = 'tool';
}

export class AgentHomeChatItem {
  id: string;
  sessionId: string;
  role: string;
  title: string;
  text: string;
  durationText: string;
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
    durationText: string,
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
    this.durationText = durationText;
    this.createdAt = createdAt;
    this.reasoningText = reasoningText;
    this.messageId = messageId;
    this.agentName = agentName;
  }
}

export class AgentHomePreviewItem {
  id: string;
  sessionId: string;
  path: string;
  mediaType: string;
  content: string;
  updatedAt: number;

  constructor(
    id: string,
    sessionId: string,
    path: string,
    mediaType: string,
    content: string,
    updatedAt: number
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.path = path;
    this.mediaType = mediaType;
    this.content = content;
    this.updatedAt = updatedAt;
  }
}

export class AgentHomeToolCallStatus {
  static readonly RUNNING: string = 'running';
  static readonly COMPLETED: string = 'completed';
  static readonly ERROR: string = 'error';
}

export class AgentHomeToolCallItem {
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

export class AgentHomeWorkspaceChangeItem {
  id: string;
  sessionId: string;
  workspaceId: string;
  providerId: string;
  path: string;
  oldPath: string;
  status: string;
  staged: boolean;
  additions: number;
  deletions: number;
  diffText: string;
  updatedAt: number;
  kind: string;
  changedFileCount: number;

  constructor(
    id: string,
    sessionId: string,
    workspaceId: string,
    providerId: string,
    path: string,
    oldPath: string,
    status: string,
    staged: boolean,
    additions: number,
    deletions: number,
    diffText: string,
    updatedAt: number,
    kind: string = 'file',
    changedFileCount: number = 1
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.providerId = providerId;
    this.path = path;
    this.oldPath = oldPath;
    this.status = status;
    this.staged = staged;
    this.additions = additions;
    this.deletions = deletions;
    this.diffText = diffText;
    this.updatedAt = updatedAt;
    this.kind = kind.length > 0 ? kind : this.inferKindFromPath(path);
    this.changedFileCount = changedFileCount > 0 ? changedFileCount : 1;
  }

  private inferKindFromPath(path: string): string {
    const slashIndex = path.lastIndexOf('/');
    const name = slashIndex >= 0 ? path.substring(slashIndex + 1) : path;
    if (slashIndex >= 0 && name.indexOf('.') < 0) {
      return 'directory';
    }
    return 'file';
  }
}

export class AgentHomeWorkspaceFileItem {
  id: string;
  workspaceId: string;
  path: string;
  parentPath: string;
  name: string;
  kind: string;
  depth: number;
  sizeBytes: number;
  modifiedAt: number;
  isHidden: boolean;
  updatedAt: number;

  constructor(
    id: string,
    workspaceId: string,
    path: string,
    parentPath: string,
    name: string,
    kind: string,
    depth: number,
    sizeBytes: number,
    modifiedAt: number,
    isHidden: boolean,
    updatedAt: number
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.path = path;
    this.parentPath = parentPath;
    this.name = name;
    this.kind = kind;
    this.depth = depth;
    this.sizeBytes = sizeBytes;
    this.modifiedAt = modifiedAt;
    this.isHidden = isHidden;
    this.updatedAt = updatedAt;
  }
}

export class AgentHomeGitCommitItem {
  id: string;
  sessionId: string;
  workspaceId: string;
  providerId: string;
  hash: string;
  message: string;
  author: string;
  committedAt: number;
  updatedAt: number;

  constructor(
    id: string,
    sessionId: string,
    workspaceId: string,
    providerId: string,
    hash: string,
    message: string,
    author: string,
    committedAt: number,
    updatedAt: number
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.providerId = providerId;
    this.hash = hash;
    this.message = message;
    this.author = author;
    this.committedAt = committedAt;
    this.updatedAt = updatedAt;
  }
}

export class AgentHomeInteractionStatus {
  static readonly PENDING: string = 'pending';
  static readonly ANSWERED: string = 'answered';
  static readonly DISMISSED: string = 'dismissed';
  static readonly REJECTED: string = 'rejected';
  static readonly IMPLEMENTING: string = 'implementing';
  static readonly IMPLEMENTED: string = 'implemented';
  static readonly ERROR: string = 'error';
}

export class AgentHomeUserRequestItem {
  id: string;
  sessionId: string;
  providerId: string;
  requestId: string;
  kind: string;
  title: string;
  prompt: string;
  optionsJson: string;
  allowFreeText: boolean;
  status: string;
  answer: string;
  selectedOptionId: string;
  rawJson: string;
  createdAt: number;
  updatedAt: number;
  agentName: string;

  constructor(
    id: string,
    sessionId: string,
    providerId: string,
    requestId: string,
    kind: string,
    title: string,
    prompt: string,
    optionsJson: string,
    allowFreeText: boolean,
    status: string,
    answer: string,
    selectedOptionId: string,
    rawJson: string,
    createdAt: number,
    updatedAt: number,
    agentName: string = ''
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.providerId = providerId;
    this.requestId = requestId;
    this.kind = kind;
    this.title = title;
    this.prompt = prompt;
    this.optionsJson = optionsJson;
    this.allowFreeText = allowFreeText;
    this.status = status;
    this.answer = answer;
    this.selectedOptionId = selectedOptionId;
    this.rawJson = rawJson;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.agentName = agentName;
  }
}

export class AgentHomePlanItem {
  id: string;
  sessionId: string;
  workspaceId: string;
  providerId: string;
  planId: string;
  title: string;
  content: string;
  status: string;
  rawJson: string;
  createdAt: number;
  updatedAt: number;
  agentName: string;

  constructor(
    id: string,
    sessionId: string,
    workspaceId: string,
    providerId: string,
    planId: string,
    title: string,
    content: string,
    status: string,
    rawJson: string,
    createdAt: number,
    updatedAt: number,
    agentName: string = ''
  ) {
    this.id = id;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.providerId = providerId;
    this.planId = planId;
    this.title = title;
    this.content = content;
    this.status = status;
    this.rawJson = rawJson;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.agentName = agentName;
  }
}

export class AgentHomeProfile {
  endpoint: string;
  token: string;
  providerId: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  activeWorkspaceId: string;
  activeSessionId: string;
  previewPath: string;
  updatedAt: number;

  constructor(
    endpoint: string,
    token: string,
    providerId: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    activeWorkspaceId: string,
    activeSessionId: string,
    previewPath: string,
    updatedAt: number
  ) {
    this.endpoint = endpoint;
    this.token = token;
    this.providerId = providerId;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.activeWorkspaceId = activeWorkspaceId;
    this.activeSessionId = activeSessionId;
    this.previewPath = previewPath;
    this.updatedAt = updatedAt;
  }
}

export class AgentHomeBootstrapState {
  profile: AgentHomeProfile;
  workspaces: Array<AgentHomeWorkspaceItem>;
  sessions: Array<AgentHomeSessionItem>;

  constructor(
    profile: AgentHomeProfile,
    workspaces: Array<AgentHomeWorkspaceItem>,
    sessions: Array<AgentHomeSessionItem>
  ) {
    this.profile = profile;
    this.workspaces = workspaces;
    this.sessions = sessions;
  }
}

export class AgentHomeStateSnapshot {
  profile: AgentHomeProfile;
  workspaces: Array<AgentHomeWorkspaceItem>;
  sessions: Array<AgentHomeSessionItem>;
  messages: Array<AgentHomeChatItem>;
  previews: Array<AgentHomePreviewItem>;
  toolCalls: Array<AgentHomeToolCallItem>;
  changes: Array<AgentHomeWorkspaceChangeItem>;
  files: Array<AgentHomeWorkspaceFileItem>;
  commits: Array<AgentHomeGitCommitItem>;
  userRequests: Array<AgentHomeUserRequestItem>;
  plans: Array<AgentHomePlanItem>;

  constructor(
    profile: AgentHomeProfile,
    workspaces: Array<AgentHomeWorkspaceItem>,
    sessions: Array<AgentHomeSessionItem>,
    messages: Array<AgentHomeChatItem>,
    previews: Array<AgentHomePreviewItem>,
    toolCalls: Array<AgentHomeToolCallItem> = [],
    changes: Array<AgentHomeWorkspaceChangeItem> = [],
    files: Array<AgentHomeWorkspaceFileItem> = [],
    commits: Array<AgentHomeGitCommitItem> = [],
    userRequests: Array<AgentHomeUserRequestItem> = [],
    plans: Array<AgentHomePlanItem> = []
  ) {
    this.profile = profile;
    this.workspaces = workspaces;
    this.sessions = sessions;
    this.messages = messages;
    this.previews = previews;
    this.toolCalls = toolCalls;
    this.changes = changes;
    this.files = files;
    this.commits = commits;
    this.userRequests = userRequests;
    this.plans = plans;
  }
}

export class AgentHomeSeedFactory {
  static buildDefaultWorkspace(
    title: string,
    workspacePath: string,
    branchName: string
  ): AgentHomeWorkspaceItem {
    const initial = title.length > 0 ? title.substring(0, 1) : 'W';
    return new AgentHomeWorkspaceItem(
      'workspace_default',
      title,
      workspacePath,
      initial,
      '#4F7DE8',
      branchName,
      true
    );
  }

  static buildDefaultSession(
    workspaceId: string,
    branchName: string,
    providerId: string,
    title: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string
  ): AgentHomeSessionItem {
    return new AgentHomeSessionItem(
      'session_default',
      workspaceId,
      title,
      branchName,
      providerId,
      modelId,
      speedMode,
      reasoningMode,
      '',
      Date.now()
    );
  }
}
