import {
  AgentBridgeProjectRecord,
  AgentBridgeTrustedDevice,
  AgentBridgeWorkspaceRecord
} from '../agentBridge/AgentBridgeModels';

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

export class AgentHomeComposerToken {
  id: string;
  kind: string;
  label: string;
  value: string;
  hostProfileId: string;
  workspaceId: string;

  constructor(id: string, kind: string, label: string, value: string, hostProfileId: string, workspaceId: string) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.value = value;
    this.hostProfileId = hostProfileId;
    this.workspaceId = workspaceId;
  }
}

export class AgentHomeComposerTokenKind {
  static readonly TEXT: string = 'text';
  static readonly SLASH: string = 'slash';
  static readonly WORKSPACE: string = 'workspace';
  static readonly FILE: string = 'file';
  static readonly AGENT: string = 'agent';
  static readonly ATTACHMENT: string = 'attachment';

  static isTrustedMention(value: string): boolean {
    return value === AgentHomeComposerTokenKind.WORKSPACE || value === AgentHomeComposerTokenKind.FILE ||
      value === AgentHomeComposerTokenKind.AGENT;
  }

  static normalize(value: string): string {
    if (value === AgentHomeComposerTokenKind.TEXT || value === AgentHomeComposerTokenKind.SLASH ||
      value === AgentHomeComposerTokenKind.WORKSPACE || value === AgentHomeComposerTokenKind.FILE ||
      value === AgentHomeComposerTokenKind.AGENT || value === AgentHomeComposerTokenKind.ATTACHMENT) {
      return value;
    }
    return AgentHomeComposerTokenKind.TEXT;
  }
}

export class AgentHomeDisplayPreferences {
  chatFontSize: number;
  codeFontSize: number;
  lineHeight: number;
  compactDensity: boolean;
  keyboardShortcutsEnabled: boolean;

  constructor(chatFontSize: number = 14, codeFontSize: number = 13, lineHeight: number = 21,
    compactDensity: boolean = false, keyboardShortcutsEnabled: boolean = true) {
    this.chatFontSize = AgentHomeDisplayPreferences.clamp(chatFontSize, 12, 22, 14);
    this.codeFontSize = AgentHomeDisplayPreferences.clamp(codeFontSize, 11, 20, 13);
    this.lineHeight = AgentHomeDisplayPreferences.clamp(lineHeight, 18, 32, 21);
    this.compactDensity = compactDensity;
    this.keyboardShortcutsEnabled = keyboardShortcutsEnabled;
  }

  private static clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(minimum, Math.min(maximum, value));
  }
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
  contentNodesJson: string;
  timelineEpoch: number;
  timelineSeq: number;

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
    agentName: string = '',
    contentNodesJson: string = '',
    timelineEpoch: number = 0,
    timelineSeq: number = 0
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
    this.contentNodesJson = contentNodesJson;
    this.timelineEpoch = timelineEpoch;
    this.timelineSeq = timelineSeq;
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
  diffTruncated: boolean;
  diffTruncationReason: string;
  diffFileCursor: number;
  diffFileLimit: number;
  nextDiffFileCursor: number;
  diffLineOffset: number;
  diffLineLimit: number;
  diffMaxBytes: number;
  nextDiffLineOffset: number;

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
    changedFileCount: number = 1,
    diffTruncated: boolean = false,
    diffTruncationReason: string = '',
    nextDiffLineOffset: number = -1,
    diffFileCursor: number = 0,
    diffFileLimit: number = 50,
    nextDiffFileCursor: number = -1,
    diffLineOffset: number = 0,
    diffLineLimit: number = 2000,
    diffMaxBytes: number = 524288
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
    this.diffTruncated = diffTruncated;
    this.diffTruncationReason = diffTruncationReason;
    this.diffFileCursor = diffFileCursor >= 0 ? diffFileCursor : 0;
    this.diffFileLimit = diffFileLimit > 0 ? diffFileLimit : 50;
    this.nextDiffFileCursor = nextDiffFileCursor;
    this.diffLineOffset = diffLineOffset >= 0 ? diffLineOffset : 0;
    this.diffLineLimit = diffLineLimit > 0 ? diffLineLimit : 2000;
    this.diffMaxBytes = diffMaxBytes > 0 ? diffMaxBytes : 524288;
    this.nextDiffLineOffset = nextDiffLineOffset;
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
  activeDeviceId: string;
  lastDeviceId: string;

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
    updatedAt: number,
    activeDeviceId: string = '',
    lastDeviceId: string = ''
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
    this.activeDeviceId = activeDeviceId;
    this.lastDeviceId = lastDeviceId;
  }
}

export class AgentHomeHostIdentityStatus {
  static readonly UNBOUND: string = 'unbound';
  static readonly VERIFIED: string = 'verified';
  static readonly MISMATCH: string = 'mismatch';
  static readonly CREDENTIAL_MISSING: string = 'credential_missing';
}

export class AgentHomeHostSwitchStatus {
  static readonly IDLE: string = 'idle';
  static readonly AWAITING_CONFIRMATION: string = 'awaiting_confirmation';
  static readonly QUIESCING: string = 'quiescing';
  static readonly LOADING: string = 'loading';
  static readonly CONNECTING: string = 'connecting';
  static readonly READY: string = 'ready';
  static readonly FAILED: string = 'failed';
}

export class AgentHomeHostProfile {
  hostProfileId: string;
  displayName: string;
  endpoint: string;
  credentialAlias: string;
  credentialDigest: string;
  providerId: string;
  modelId: string;
  speedMode: string;
  reasoningMode: string;
  activeWorkspaceId: string;
  activeSessionId: string;
  previewPath: string;
  lastDeviceId: string;
  lastServerId: string;
  autoConnectOnLaunch: boolean;
  identityStatus: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;

  constructor(
    hostProfileId: string,
    displayName: string,
    endpoint: string,
    credentialAlias: string,
    credentialDigest: string,
    providerId: string,
    modelId: string,
    speedMode: string,
    reasoningMode: string,
    activeWorkspaceId: string,
    activeSessionId: string,
    previewPath: string,
    lastDeviceId: string,
    lastServerId: string,
    autoConnectOnLaunch: boolean,
    identityStatus: string,
    createdAt: number,
    updatedAt: number,
    lastUsedAt: number
  ) {
    this.hostProfileId = hostProfileId;
    this.displayName = displayName;
    this.endpoint = endpoint;
    this.credentialAlias = credentialAlias;
    this.credentialDigest = credentialDigest;
    this.providerId = providerId;
    this.modelId = modelId;
    this.speedMode = speedMode;
    this.reasoningMode = reasoningMode;
    this.activeWorkspaceId = activeWorkspaceId;
    this.activeSessionId = activeSessionId;
    this.previewPath = previewPath;
    this.lastDeviceId = lastDeviceId;
    this.lastServerId = lastServerId;
    this.autoConnectOnLaunch = autoConnectOnLaunch;
    this.identityStatus = identityStatus;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.lastUsedAt = lastUsedAt;
  }

  static empty(): AgentHomeHostProfile {
    return new AgentHomeHostProfile(
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', true,
      AgentHomeHostIdentityStatus.UNBOUND, 0, 0, 0
    );
  }
}

export class AgentHomeHostSnapshot {
  hostProfile: AgentHomeHostProfile;
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

  constructor(hostProfile: AgentHomeHostProfile) {
    this.hostProfile = hostProfile;
    this.workspaces = [];
    this.sessions = [];
    this.messages = [];
    this.previews = [];
    this.toolCalls = [];
    this.changes = [];
    this.files = [];
    this.commits = [];
    this.userRequests = [];
    this.plans = [];
  }
}

export class AgentHomeHostWorkspaceGroup {
  hostProfileId: string;
  hostDisplayName: string;
  active: boolean;
  connected: boolean;
  lastUpdatedAt: number;
  projects: Array<AgentBridgeProjectRecord>;
  workspaces: Array<AgentBridgeWorkspaceRecord>;

  constructor(hostProfileId: string, hostDisplayName: string) {
    this.hostProfileId = hostProfileId;
    this.hostDisplayName = hostDisplayName;
    this.active = false;
    this.connected = false;
    this.lastUpdatedAt = 0;
    this.projects = [];
    this.workspaces = [];
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
  trustedDevices: Array<AgentBridgeTrustedDevice>;

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
    plans: Array<AgentHomePlanItem> = [],
    trustedDevices: Array<AgentBridgeTrustedDevice> = []
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
    this.trustedDevices = trustedDevices;
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
