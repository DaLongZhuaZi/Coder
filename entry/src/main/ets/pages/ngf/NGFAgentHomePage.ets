import window from '@ohos.window';
import { ConfigurationConstant, common } from '@kit.AbilityKit';
import { BusinessError, pasteboard } from '@kit.BasicServicesKit';
import { image } from '@kit.ImageKit';
import { util } from '@kit.ArkTS';
import { http } from '@kit.NetworkKit';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import {
  hdsMaterial,
  HdsNavigation,
  HdsNavigationAttribute,
  HdsNavigationTitleMode,
  HdsSceneController,
  HdsSceneType,
  HdsVisualComponent
} from '@kit.UIDesignKit';
import { uiContextManager } from 'ngf_framework';
import { FileUtils, NGFFileEntry } from 'ngf_framework';
import {
  NGFHdsEffectPresetFactory,
  NGFHdsInteractiveEffectPreset,
  NGFHdsMaterialSurfacePreset,
  NGFHdsSceneFlowPreset
} from 'ngf_framework';
import { NGFHdsTitleBarMenuAction, NGFHdsTitleBarOptionsFactory } from 'ngf_framework';
import { NGFRichContentKind, NGFRichContentRenderer } from 'ngf_framework';
import { NGFThemeMode } from 'ngf_framework';
import { logger } from 'ngf_framework';
import { ngfMediaPickerFacade } from 'ngf_framework';
import { ngfThemeManagerFacade } from 'ngf_framework';
import { ngfI18nManagerFacade } from 'ngf_framework';
import { NGFNotificationRequest, NGFNotificationType, ngfBackgroundTaskManager, ngfSystemNotificationManager } from 'ngf_framework';
import { resolveResourceString } from 'ngf_framework';
import { AgentBridgeClient } from '../../features/agentBridge/AgentBridgeClient';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeContextItem,
  AgentBridgeDefaultOptions,
  AgentBridgeEnvelopeType,
  AgentBridgeEventType,
  AgentBridgeImportedMessage,
  AgentBridgeImportedToolCall,
  AgentBridgeIncomingParser,
  AgentBridgeInteractionModeOption,
  AgentBridgeModelOption,
  AgentBridgeParsedMessage,
  AgentBridgeProviderId,
  AgentBridgeProviderOption,
  AgentBridgeReasoningModeOption,
  AgentBridgeRemoteSession,
  AgentBridgeSpeedModeOption,
  AgentBridgeToolOption
} from '../../features/agentBridge/AgentBridgeModels';
import {
  AgentHomeBootstrapState,
  AgentHomeChatItem,
  AgentHomeGitCommitItem,
  AgentHomeInteractionStatus,
  AgentHomeMessageRole,
  AgentHomePlanItem,
  AgentHomePreviewItem,
  AgentHomeProfile,
  AgentHomeSeedFactory,
  AgentHomeSessionItem,
  AgentHomeStateSnapshot,
  AgentHomeToolCallItem,
  AgentHomeToolCallStatus,
  AgentHomeUserRequestItem,
  AgentHomeWorkspaceChangeItem,
  AgentHomeWorkspaceFileItem,
  AgentHomeWorkspaceItem
} from '../../features/agentHome/AgentHomeModels';
import { AgentHomePersistenceRepository } from '../../features/agentHome/AgentHomePersistenceRepository';
import {
  AgentHomeSlashCommandCatalog,
  AgentHomeSlashCommandOption
} from '../../features/agentHome/AgentHomeSlashCommandCatalog';
import { NGFPageWindowName, NGFPageWindowSupport } from './NGFPageWindowSupport';

const TAG: string = 'NGFAgentHomePage';
const AGENT_HOME_DEFAULT_STATUS_INSET: number = 24;
const AGENT_HOME_REASONING_COLLAPSED_HEIGHT: number = 76;
const AGENT_HOME_REASONING_EXPANDED_HEIGHT: number = 220;
const AGENT_HOME_CONVERSATION_BOTTOM_BUTTON_THRESHOLD: number = 96;
const AGENT_HOME_CONVERSATION_SCROLL_GUARD_MS: number = 180;
const AGENT_HOME_REPLY_STALL_CHECK_MS: number = 5000;
const AGENT_HOME_REPLY_STALL_TIMEOUT_MS: number = 300000;
const AGENT_HOME_AGENT_FILTER_BAR_HEIGHT: number = 44;
const AGENT_HOME_COMPACT_COMPOSER_HEIGHT: number = 88;
const AGENT_HOME_BASE_COMPOSER_HEIGHT: number = 172;
const AGENT_HOME_COMPOSER_EXPANSION_DRAG_DISTANCE: number = 112;
const AGENT_HOME_COMPOSER_EXPANSION_SNAP_THRESHOLD: number = 0.46;
const AGENT_HOME_COMPOSER_EXPANSION_VELOCITY_THRESHOLD: number = 360;
const AGENT_HOME_COMPOSER_SETTLE_FRAME_MS: number = 16;
const AGENT_HOME_COMPOSER_SETTLE_DURATION_MS: number = 220;
const AGENT_HOME_CONVERSATION_RENDER_SETTLE_MS: number = 220;
const AGENT_HOME_CONVERSATION_RENDER_FADE_MS: number = 180;
const AGENT_HOME_CONVERSATION_RENDER_TIMEOUT_MS: number = 8000;
const AGENT_HOME_STARTUP_HISTORY_SYNC_TIMEOUT_MS: number = 45000;
const AGENT_HOME_DESKTOP_SETUP_COMMAND: string = 'npm install -g @dlzz/agent-bridge\nngf-agent-bridge --setup';
const AGENT_HOME_DIFF_LARGE_LINE_THRESHOLD: number = 18;
const AGENT_HOME_DIFF_TABLE_MAX_LINES: number = 600;
const AGENT_HOME_DIFF_TABLE_MAX_LINE_CHARS: number = 420;
const AGENT_HOME_RICH_HEIGHT_ESTIMATE_MAX_CHARS: number = 60000;
const AGENT_HOME_DEFERRED_RICH_RENDER_CHARS: number = 6000;
const AGENT_HOME_DEFERRED_RICH_RENDER_DELAY_MS: number = 48;
const AGENT_HOME_ONBOARDING_RICH_RENDER_DELAY_MS: number = 120;
const AGENT_HOME_ONBOARDING_PROBE_ADVANCE_DELAY_MS: number = 900;
const AGENT_HOME_ONBOARDING_WEB_PROBE_HEIGHT: number = 64;
const AGENT_HOME_ONBOARDING_RICH_RENDER_HEIGHT: number = 360;
const AGENT_HOME_ONBOARDING_PROBE_NATIVE_STAGE: number = 0;
const AGENT_HOME_ONBOARDING_PROBE_INLINE_WEB_STAGE: number = 1;
const AGENT_HOME_ONBOARDING_PROBE_LOAD_DATA_STAGE: number = 2;
const AGENT_HOME_ONBOARDING_PROBE_MARKDOWN_STAGE: number = 3;
const AGENT_HOME_AGENT_TASK_NOTIFICATION_ID: number = 32001;
const AGENT_HOME_AGENT_REQUEST_NOTIFICATION_ID: number = 32002;
const AGENT_HOME_NOTIFICATION_TEXT_LIMIT: number = 180;
const AGENT_HOME_PREVIEW_CACHE_DIR: string = 'agent-previews';
const AGENT_HOME_ATTACHMENT_PREVIEW_CACHE_DIR: string = 'agent-attachment-previews';
const AGENT_HOME_ATTACHMENT_PREVIEW_DOWNLOAD_KIND: string = 'attachment.preview';
const AGENT_HOME_AFDIAN_URL: string = 'https://afdian.com/a/dalongzz';
const AGENT_HOME_APP_GALLERY_MANXIA_URL: string =
  'https://appgallery.huawei.com/app/detail?id=com.dlzz.manxia&channelId=SHARE&source=appshare';
const AGENT_HOME_APP_GALLERY_LUMABLOOM_URL: string =
  'https://appgallery.huawei.com/app/detail?id=com.dlzz.lumabloom&channelId=SHARE&source=appshare';
const AGENT_HOME_APP_GALLERY_SHUMAI_URL: string =
  'https://appgallery.huawei.com/app/detail?id=com.dlzz.ebookparser&channelId=SHARE&source=appshare';
const AGENT_HOME_MAIN_DESTINATION_NAME: string = 'agent_home_main_content';

class AgentHomeActionKey {
  static readonly OPEN_WORKSPACES: string = 'open_workspaces';
  static readonly OPEN_SESSIONS: string = 'open_sessions';
  static readonly OPEN_SETTINGS: string = 'open_settings';
  static readonly OPEN_MODELS: string = 'open_models';
  static readonly OPEN_RUNTIME: string = 'open_runtime';
  static readonly OPEN_PREVIEW: string = 'open_preview';
  static readonly OPEN_WORKSPACE_BROWSER: string = 'open_workspace_browser';
  static readonly NEW_SESSION: string = 'new_session';
  static readonly NEW_WORKSPACE: string = 'new_workspace';
  static readonly PICK_ATTACHMENT: string = 'pick_attachment';
  static readonly PICK_IMAGE: string = 'pick_image';
  static readonly PICK_DOCUMENT: string = 'pick_document';
  static readonly CLEAR_ATTACHMENTS: string = 'clear_attachments';
  static readonly SEND_MESSAGE: string = 'send_message';
  static readonly REQUEST_PREVIEW: string = 'request_preview';
  static readonly REFRESH_WORKSPACE_CHANGES: string = 'refresh_workspace_changes';
  static readonly REFRESH_WORKSPACE_FILES: string = 'refresh_workspace_files';
  static readonly COMMIT_WORKSPACE_CHANGES: string = 'commit_workspace_changes';
  static readonly SET_GOAL_MODE: string = 'set_goal_mode';
  static readonly SET_PLAN_MODE: string = 'set_plan_mode';
  static readonly OPEN_HOME: string = 'open_home';
  static readonly REFRESH_REMOTE_SESSIONS: string = 'refresh_remote_sessions';
  static readonly RENAME_WORKSPACE: string = 'rename_workspace';
  static readonly DELETE_WORKSPACE: string = 'delete_workspace';
  static readonly RENAME_SESSION: string = 'rename_session';
  static readonly DELETE_SESSION: string = 'delete_session';
  static readonly COPY_SESSION_ID: string = 'copy_session_id';
  static readonly COPY_DESKTOP_COMMAND: string = 'copy_desktop_command';
  static readonly SCAN_BRIDGE_QR: string = 'scan_bridge_qr';
  static readonly OPEN_GLOBAL_SETTINGS: string = 'open_global_settings';
}

class AgentHomeSheetKey {
  static readonly NONE: string = 'none';
  static readonly WORKSPACES: string = 'workspaces';
  static readonly SESSIONS: string = 'sessions';
  static readonly SETTINGS: string = 'settings';
  static readonly GLOBAL_SETTINGS: string = 'global_settings';
  static readonly DEVELOPER_APPS: string = 'developer_apps';
  static readonly SUPPORT_PROJECT: string = 'support_project';
  static readonly MODELS: string = 'models';
  static readonly RUNTIME: string = 'runtime';
  static readonly ATTACHMENTS: string = 'attachments';
  static readonly PREVIEW: string = 'preview';
  static readonly SESSION_DETAILS: string = 'session_details';
  static readonly WORKSPACE_BROWSER: string = 'workspace_browser';
  static readonly TOOL_DETAIL: string = 'tool_detail';
  static readonly REQUEST_DETAIL: string = 'request_detail';
  static readonly PLAN_DETAIL: string = 'plan_detail';
  static readonly WORKSPACE_DIFF_DETAIL: string = 'workspace_diff_detail';
  static readonly WORKSPACE_CONTENT_PREVIEW: string = 'workspace_content_preview';
  static readonly WORKSPACE_ACTIONS: string = 'workspace_actions';
  static readonly SESSION_ACTIONS: string = 'session_actions';
  static readonly RENAME_WORKSPACE: string = 'rename_workspace';
  static readonly RENAME_SESSION: string = 'rename_session';
}

class AgentHomeWorkspacePanelTab {
  static readonly CHANGES: number = 0;
  static readonly FILES: number = 1;
}

class AgentHomeSettingsTabIndex {
  static readonly CONNECTION: number = 0;
  static readonly WORKSPACE: number = 1;
  static readonly DATA: number = 2;
}

class AgentHomeAttachmentKind {
  static readonly IMAGE: string = 'image';
  static readonly DOCUMENT: string = 'document';
}

class AgentHomeReplyState {
  static readonly IDLE: string = 'idle';
  static readonly RESPONDING: string = 'responding';
  static readonly TOOL_RUNNING: string = 'tool_running';
}

class AgentHomeSessionVisualStatus {
  static readonly COMPLETED: string = 'completed';
  static readonly RUNNING: string = 'running';
  static readonly ERROR: string = 'error';
  static readonly WARNING: string = 'warning';
}

class AgentHomeRunMode {
  static readonly GOAL: string = 'goal';
  static readonly BUILD: string = 'build';
  static readonly PLAN: string = 'plan';
}

class AgentHomeUserRequestKind {
  static readonly REQUEST: string = 'request';
  static readonly PERMISSION: string = 'permission';
}

class AgentHomePermissionReply {
  static readonly ONCE: string = 'once';
  static readonly REJECT: string = 'reject';
}

class AgentHomePermissionStatus {
  static readonly ALLOWED: string = 'allowed';
}

class AgentHomeMainPageIndex {
  static readonly WORKSPACES: number = 0;
  static readonly CHAT: number = 1;
  static readonly WORKSPACE_BROWSER: number = 2;
}

class AgentHomeNavPayload {
  createdAt: number;

  constructor() {
    this.createdAt = Date.now();
  }
}

class AgentHomeConversationItemKind {
  static readonly MESSAGE: string = 'message';
  static readonly TOOL_CALL: string = 'tool_call';
  static readonly USER_REQUEST: string = 'user_request';
  static readonly PLAN: string = 'plan';
}

class AgentHomeAgentFilter {
  static readonly ALL: string = 'all';
  static readonly MAIN: string = 'main';
  static readonly SUBAGENT_PREFIX: string = 'subagent:';
}

class AgentHomeRemoteWorkspaceFilter {
  static readonly ALL: string = 'all';
}

class AgentHomeGlobalSettingGroup {
  static readonly THEME: string = 'theme';
  static readonly LANGUAGE: string = 'language';
}

class AgentHomeDeveloperAppItem {
  id: string;
  title: ResourceStr;
  description: ResourceStr;
  icon: Resource;
  appGalleryUrl: string;
  isAvailable: boolean;

  constructor(id: string, title: ResourceStr, description: ResourceStr, icon: Resource, appGalleryUrl: string, isAvailable: boolean) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.icon = icon;
    this.appGalleryUrl = appGalleryUrl;
    this.isAvailable = isAvailable;
  }
}

class AgentHomeAgentFilterOption {
  id: string;
  label: string;
  agentName: string;
  isMain: boolean;

  constructor(id: string, label: string, agentName: string, isMain: boolean) {
    this.id = id;
    this.label = label;
    this.agentName = agentName;
    this.isMain = isMain;
  }
}

class AgentHomeRichBlockKind {
  static readonly PARAGRAPH: string = 'paragraph';
  static readonly BULLET: string = 'bullet';
  static readonly ORDERED: string = 'ordered';
  static readonly CODE: string = 'code';
  static readonly HEADING: string = 'heading';
  static readonly QUOTE: string = 'quote';
  static readonly IMAGE: string = 'image';
  static readonly TABLE: string = 'table';
}

class AgentHomeRichInlineKind {
  static readonly PLAIN: string = 'plain';
  static readonly STRONG: string = 'strong';
  static readonly EMPHASIS: string = 'emphasis';
  static readonly CODE: string = 'code';
  static readonly LINK: string = 'link';
}

class AgentHomeRichInlineRun {
  id: string;
  kind: string;
  text: string;
  target: string;

  constructor(id: string, kind: string, text: string, target: string = '') {
    this.id = id;
    this.kind = kind;
    this.text = text;
    this.target = target;
  }
}

class AgentHomeRichBlock {
  id: string;
  kind: string;
  text: string;
  marker: string;
  meta: string;
  level: number;

  constructor(id: string, kind: string, text: string, marker: string = '', meta: string = '', level: number = 0) {
    this.id = id;
    this.kind = kind;
    this.text = text;
    this.marker = marker;
    this.meta = meta;
    this.level = level;
  }
}

class AgentHomeMarkdownTableRow {
  id: string;
  cells: Array<AgentHomeMarkdownTableCell>;
  isHeader: boolean;

  constructor(id: string, cells: Array<AgentHomeMarkdownTableCell>, isHeader: boolean) {
    this.id = id;
    this.cells = cells;
    this.isHeader = isHeader;
  }
}

class AgentHomeMarkdownTableCell {
  id: string;
  text: string;

  constructor(id: string, text: string) {
    this.id = id;
    this.text = text;
  }
}

class AgentHomeDiffLineKind {
  static readonly HUNK: string = 'hunk';
  static readonly META: string = 'meta';
  static readonly ADDITION: string = 'addition';
  static readonly DELETION: string = 'deletion';
  static readonly CONTEXT: string = 'context';
}

class AgentHomeDiffLine {
  id: string;
  kind: string;
  text: string;
  oldLineNumber: number;
  newLineNumber: number;

  constructor(id: string, kind: string, text: string, oldLineNumber: number, newLineNumber: number) {
    this.id = id;
    this.kind = kind;
    this.text = text;
    this.oldLineNumber = oldLineNumber;
    this.newLineNumber = newLineNumber;
  }
}

class AgentHomeCodeLine {
  id: string;
  lineNumber: number;
  text: string;

  constructor(id: string, lineNumber: number, text: string) {
    this.id = id;
    this.lineNumber = lineNumber;
    this.text = text;
  }
}

class AgentHomePlanStep {
  id: string;
  index: number;
  title: string;
  status: string;

  constructor(id: string, index: number, title: string, status: string) {
    this.id = id;
    this.index = index;
    this.title = title;
    this.status = status;
  }
}

class AgentHomeConversationItem {
  id: string;
  kind: string;
  createdAt: number;
  message: AgentHomeChatItem | null;
  toolCall: AgentHomeToolCallItem | null;
  userRequest: AgentHomeUserRequestItem | null;
  plan: AgentHomePlanItem | null;

  constructor(
    id: string,
    kind: string,
    createdAt: number,
    message: AgentHomeChatItem | null,
    toolCall: AgentHomeToolCallItem | null,
    userRequest: AgentHomeUserRequestItem | null,
    plan: AgentHomePlanItem | null
  ) {
    this.id = id;
    this.kind = kind;
    this.createdAt = createdAt;
    this.message = message;
    this.toolCall = toolCall;
    this.userRequest = userRequest;
    this.plan = plan;
  }
}

class AgentHomeAttachmentItem {
  id: string;
  uri: string;
  displayName: string;
  extensionName: string;
  kind: string;

  constructor(id: string, uri: string, displayName: string, extensionName: string, kind: string) {
    this.id = id;
    this.uri = uri;
    this.displayName = displayName;
    this.extensionName = extensionName;
    this.kind = kind;
  }
}

class AgentHomeMessageAttachmentItem {
  id: string;
  kind: string;
  displayName: string;
  path: string;

  constructor(id: string, kind: string, displayName: string, path: string) {
    this.id = id;
    this.kind = kind;
    this.displayName = displayName;
    this.path = path;
  }
}

class AgentHomeMessageAttachmentParseResult {
  bodyText: string;
  attachments: Array<AgentHomeMessageAttachmentItem>;

  constructor(bodyText: string, attachments: Array<AgentHomeMessageAttachmentItem>) {
    this.bodyText = bodyText;
    this.attachments = attachments;
  }
}

class AgentHomeMessageAttachmentImageCache {
  path: string;
  content: string;

  constructor(path: string, content: string) {
    this.path = path;
    this.content = content;
  }
}

class AgentBridgeQrPayload {
  endpoint: string;
  token: string;
  providerId: string;
  workspacePath: string;
  workspaceTitle: string;

  constructor(endpoint: string, token: string, providerId: string, workspacePath: string, workspaceTitle: string) {
    this.endpoint = endpoint;
    this.token = token;
    this.providerId = providerId;
    this.workspacePath = workspacePath;
    this.workspaceTitle = workspaceTitle;
  }
}

class AgentHomeRequestOptionItem {
  id: string;
  label: string;
  description: string;

  constructor(id: string, label: string, description: string) {
    this.id = id;
    this.label = label;
    this.description = description;
  }
}

class AgentHomeRemoteWorkspaceFilterOption {
  id: string;
  title: string;
  path: string;
  count: number;

  constructor(id: string, title: string, path: string, count: number) {
    this.id = id;
    this.title = title;
    this.path = path;
    this.count = count;
  }
}

class AgentHomeRemoteSessionSection {
  id: string;
  title: string;
  path: string;
  count: number;
  updatedAt: number;
  sessions: Array<AgentBridgeRemoteSession>;

  constructor(id: string, title: string, path: string, count: number, updatedAt: number, sessions: Array<AgentBridgeRemoteSession>) {
    this.id = id;
    this.title = title;
    this.path = path;
    this.count = count;
    this.updatedAt = updatedAt;
    this.sessions = sessions;
  }
}

@Entry
@Component
struct NGFAgentHomePage {
  @StorageProp('ngf_visual_effects_effective_material_level')
  private effectiveMaterialLevel: number = hdsMaterial.MaterialLevel.GENTLE;
  @StorageProp('ngf_current_theme')
  private currentTheme: string = NGFThemeMode.AUTO;
  @StorageProp('ngf_system_color_mode')
  private systemColorMode: number = ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
  @StorageProp('ngf_is_dark_mode')
  private isDarkMode: boolean = false;
  @State private statusInsetVp: number = AGENT_HOME_DEFAULT_STATUS_INSET;
  @State private bottomInsetVp: number = 12;
  @State private pathStack: NavPathStack = new NavPathStack();
  @State private workspaces: Array<AgentHomeWorkspaceItem> = [];
  @State private sessions: Array<AgentHomeSessionItem> = [];
  @State private messages: Array<AgentHomeChatItem> = [];
  @State private previews: Array<AgentHomePreviewItem> = [];
  @State private toolCalls: Array<AgentHomeToolCallItem> = [];
  @State private workspaceChanges: Array<AgentHomeWorkspaceChangeItem> = [];
  @State private workspaceFiles: Array<AgentHomeWorkspaceFileItem> = [];
  @State private gitCommits: Array<AgentHomeGitCommitItem> = [];
  @State private userRequests: Array<AgentHomeUserRequestItem> = [];
  @State private plans: Array<AgentHomePlanItem> = [];
  @State private expandedReasoningMessageIds: Array<string> = [];
  @State private expandedWorkspaceDiffIds: Array<string> = [];
  @State private expandedWorkspaceDirs: Array<string> = [];
  @State private loadingWorkspaceDiffIds: Array<string> = [];
  @State private loadingWorkspaceFileParentPaths: Array<string> = [];
  @State private loadingWorkspaceChanges: boolean = false;
  @State private loadingWorkspaceFiles: boolean = false;
  @State private activeWorkspaceId: string = '';
  @State private activeSessionId: string = '';
  @State private activeToolCallId: string = '';
  @State private activeRequestId: string = '';
  @State private activePlanId: string = '';
  @State private activeWorkspaceChangeId: string = '';
  @State private selectedWorkspaceFilePath: string = '';
  @State private activeWorkspacePreviewSurfaceDark: boolean = false;
  @State private selectedRequestOptionId: string = '';
  @State private requestAnswerDraft: string = '';
  @State private workspacePanelTabIndex: number = AgentHomeWorkspacePanelTab.CHANGES;
  @State private globalSettingsThemeSelection: string = NGFThemeMode.AUTO;
  @State private globalSettingsLocaleSelection: string = '';
  @State private commitMessageDraft: string = '';
  @State private draftText: string = '';
  @State private agentRunMode: string = '';
  @State private selectedInteractionModeIds: Array<string> = [];
  @State private previewPath: string = '';
  @State private bridgeEndpoint: string = '';
  @State private bridgeToken: string = '';
  @State private workspaceTitleDraft: string = '';
  @State private workspacePathDraft: string = '';
  @State private selectedProviderId: string = AgentBridgeProviderId.CODEX;
  @State private selectedModelId: string = 'configured';
  @State private selectedSpeedMode: string = 'auto';
  @State private selectedReasoningMode: string = 'auto';
  @State private providerOptions: Array<AgentBridgeProviderOption> = AgentBridgeDefaultOptions.buildProviders();
  @State private remoteSessions: Array<AgentBridgeRemoteSession> = [];
  @State private loadingRemoteSessions: boolean = false;
  @State private sessionImportProviderId: string = AgentBridgeProviderId.CODEX;
  @State private sessionSheetSearchText: string = '';
  @State private remoteWorkspaceFilterId: string = AgentHomeRemoteWorkspaceFilter.ALL;
  @State private newSessionProviderId: string = AgentBridgeProviderId.CODEX;
  @State private newSessionModelId: string = 'configured';
  @State private newSessionSpeedMode: string = 'auto';
  @State private newSessionReasoningMode: string = 'auto';
  @State private pendingBridgeCreateLocalSessionId: string = '';
  @State private pendingBridgeCreateProviderId: string = '';
  @State private stoppedBridgeSessionId: string = '';
  @State private attachments: Array<AgentHomeAttachmentItem> = [];
  @State private messageAttachmentImageCache: Array<AgentHomeMessageAttachmentImageCache> = [];
  @State private connectionStatus: string = AgentBridgeConnectionStatus.DISCONNECTED;
  @State private bridgeConnectionReasonText: string = '';
  @State private replyState: string = AgentHomeReplyState.IDLE;
  @State private activeToolName: string = '';
  @State private activeSubagentName: string = '';
  @State private selectedAgentFilterId: string = AgentHomeAgentFilter.ALL;
  @State private activeTurnElapsedText: string = '';
  @State private activeTurnTimerVisible: boolean = false;
  @State private richContentReadyMessageIds: Array<string> = [];
  @State private onboardingRichContentReady: boolean = false;
  @State private onboardingRichContentProbeStage: number = AGENT_HOME_ONBOARDING_PROBE_NATIVE_STAGE;
  @State private onboardingRichContentImageDataUrl: string = '';
  @State private isLargeScreenNavigation: boolean = false;
  @State private pressedHomeActionKey: string = '';
  @State private isContextCompacting: boolean = false;
  @State private showConversationBottomButton: boolean = false;
  @State private isCompactComposerMode: boolean = true;
  @State private composerExpansionProgress: number = 0;
  @State private composerDragStartProgress: number = 0;
  @State private isComposerDragging: boolean = false;
  @State private isComposerPlanPanelExpanded: boolean = false;
  @State private transientStatusText: string = '';
  @State private transientStatusVisible: boolean = false;
  @State private transientStatusOpacity: number = 0;
  @State private sessionStatusPulseValue: number = 0;
  @State private isPersistentStateLoading: boolean = true;
  @State private isConversationRenderPending: boolean = false;
  @State private conversationRenderOverlayOpacity: number = 0;
  @State private mainPageIndex: number = AgentHomeMainPageIndex.CHAT;
  @State private isWorkspaceSheetOpen: boolean = false;
  @State private isSessionSheetOpen: boolean = false;
  @State private isSettingsSheetOpen: boolean = false;
  @State private isGlobalSettingsSheetOpen: boolean = false;
  @State private isDeveloperAppsSheetOpen: boolean = false;
  @State private isSupportProjectSheetOpen: boolean = false;
  @State private isModelSheetOpen: boolean = false;
  @State private isRuntimeSheetOpen: boolean = false;
  @State private isAttachmentSheetOpen: boolean = false;
  @State private isPreviewSheetOpen: boolean = false;
  @State private isPermissionModePopupOpen: boolean = false;
  @State private isRemoteWorkspaceFilterPopupOpen: boolean = false;
  @State private isSessionDetailsSheetOpen: boolean = false;
  @State private isWorkspaceBrowserSheetOpen: boolean = false;
  @State private isToolDetailSheetOpen: boolean = false;
  @State private isRequestDetailSheetOpen: boolean = false;
  @State private isPlanDetailSheetOpen: boolean = false;
  @State private isWorkspaceDiffDetailSheetOpen: boolean = false;
  @State private isWorkspaceContentPreviewSheetOpen: boolean = false;
  @State private isWorkspaceActionsSheetOpen: boolean = false;
  @State private isSessionActionsSheetOpen: boolean = false;
  @State private isRenameWorkspaceSheetOpen: boolean = false;
  @State private isRenameSessionSheetOpen: boolean = false;
  @State private activeWorkspaceActionId: string = '';
  @State private activeSessionActionId: string = '';
  @State private activeWorkspacePreviewPath: string = '';
  @State private activeWorkspacePreviewErrorText: string = '';
  @State private activeWorkspacePreviewPixelMap: PixelMap | null = null;
  @State private activeWorkspacePreviewPixelMapPath: string = '';
  @State private pendingWorkspacePreviewImagePath: string = '';
  @State private renameWorkspaceDraft: string = '';
  @State private renameSessionDraft: string = '';
  @State private activeSheetKey: string = AgentHomeSheetKey.NONE;
  @State private settingsTabIndex: number = AgentHomeSettingsTabIndex.CONNECTION;
  private readonly client: AgentBridgeClient = new AgentBridgeClient();
  private readonly persistence: AgentHomePersistenceRepository = new AgentHomePersistenceRepository();
  private readonly developerAppItems: Array<AgentHomeDeveloperAppItem> = [
    new AgentHomeDeveloperAppItem(
      'manxia',
      $r('app.string.agent_home_developer_app_manxia_name'),
      $r('app.string.agent_home_developer_app_manxia_desc'),
      $r('app.media.developer_app_manxia_icon'),
      AGENT_HOME_APP_GALLERY_MANXIA_URL,
      true
    ),
    new AgentHomeDeveloperAppItem(
      'lumabloom',
      $r('app.string.agent_home_developer_app_lumabloom_name'),
      $r('app.string.agent_home_developer_app_lumabloom_desc'),
      $r('app.media.developer_app_lumabloom_icon'),
      AGENT_HOME_APP_GALLERY_LUMABLOOM_URL,
      true
    ),
    new AgentHomeDeveloperAppItem(
      'shumai',
      $r('app.string.agent_home_developer_app_shumai_name'),
      $r('app.string.agent_home_developer_app_shumai_desc'),
      $r('app.media.developer_app_shumai_icon'),
      AGENT_HOME_APP_GALLERY_SHUMAI_URL,
      true
    )
  ];
  private readonly mainTabsController: TabsController = new TabsController();
  private readonly conversationScroller: Scroller = new Scroller();
  private messageSequence: number = 0;
  private sessionSequence: number = 0;
  private previewSequence: number = 0;
  private toolCallSequence: number = 0;
  private pendingFirstMessage: string = '';
  private pendingHistoryImportSessionId: string = '';
  private startupHistoryImportSessionId: string = '';
  private persistentStateLoadingTimeoutTimer: number = -1;
  private transientStatusTimer: number = -1;
  private transientStatusSequence: number = 0;
  private composerSettleTimer: number = -1;
  private composerSettleSequence: number = 0;
  private conversationAutoScrollTimer: number = -1;
  private conversationAwayFromBottomDistance: number = 0;
  private conversationScrollGuardTimer: number = -1;
  private isConversationProgrammaticScroll: boolean = false;
  private activeTurnStartedAt: number = 0;
  private assistantResponseStartedAt: number = 0;
  private activeTurnTimer: number = -1;
  private activeTurnWatchdogTimer: number = -1;
  private activeTurnLastActivityAt: number = 0;
  private sessionStatusPulseTimer: number = -1;
  private activeAssistantStreamKey: string = '';
  private activeAssistantLocalMessageId: string = '';
  private handledBridgeDownloadPaths: Array<string> = [];
  private pendingMessageAttachmentImagePaths: Array<string> = [];
  private pendingRemoteSessionsRequestPairs: Array<string> = [];
  private pendingOpenSessionsSheetAfterBridgeQrConnect: boolean = false;
  private pendingWorkspaceFilesParentPath: string = '';
  private conversationRenderSessionId: string = '';
  private conversationRenderSequence: number = 0;
  private conversationRenderSettleTimer: number = -1;
  private conversationRenderTimeoutTimer: number = -1;
  private richContentRenderTimer: number = -1;
  private richContentPendingMessageIds: Array<string> = [];
  private onboardingRichContentRenderTimer: number = -1;
  private onboardingRichContentProbeTimer: number = -1;
  private onboardingRichContentIconLoadRequested: boolean = false;
  private agentNotificationPermissionChecked: boolean = false;
  private agentNotificationPermissionEnabled: boolean = false;
  private agentNotificationPermissionPending: Promise<boolean> | null = null;
  private agentTaskNotificationActive: boolean = false;
  private agentTaskNotificationKey: string = '';
  private activeRequestNotificationKey: string = '';
  private agentContinuousTaskActive: boolean = false;
  private agentContinuousTaskPending: boolean = false;
  private agentContinuousTaskStopRequested: boolean = false;
  private agentContinuousTaskId: string = '';
  private pendingFirstContextItems: Array<AgentBridgeContextItem> = [];
  private readonly permissionRequestFlowLightController: HdsSceneController = new HdsSceneController();
  private permissionRequestFlowLightActive: boolean = false;
  private permissionRequestFlowLightStopping: boolean = false;

  aboutToAppear(): void {
    const uiContext = this.getUIContext();
    if (uiContext) {
      uiContextManager.bindUIContext(uiContext);
    }
    NGFPageWindowSupport.apply(NGFPageWindowName.AGENT_HOME);
    this.readInsets();
    this.isPersistentStateLoading = this.workspaces.length === 0 && this.sessions.length === 0 && this.messages.length === 0;
    this.initializeDefaults();
    this.loadOnboardingRichContentIconDataUrl();
    this.scheduleOnboardingRichContentRender();
    this.startSessionStatusPulse();
    this.syncPermissionRequestFlowLight();
    this.client.setHandlers(
      (status: string, detail: string): void => {
        this.handleBridgeStatus(status, detail);
      },
      (text: string): void => {
        this.handleBridgeText(text);
      },
      (message: string): void => {
        this.handleBridgeError(message);
      },
      (sessionId: string): void => {
        this.handleBridgeSession(sessionId);
      }
    );
    this.loadPersistentState().catch((error: Error): void => {
      logger.error(TAG, 'load persistent state task failed: ' + this.errorToString(error));
    });
  }

  aboutToDisappear(): void {
    this.clearTransientStatusTimer();
    this.clearComposerSettleTimer();
    this.clearConversationAutoScrollTimer();
    this.clearConversationScrollGuardTimer();
    this.clearConversationRenderTimers();
    this.clearRichContentRenderTimer();
    this.clearOnboardingRichContentRenderTimer();
    this.clearOnboardingRichContentProbeTimer();
    this.clearSessionStatusPulse();
    this.stopPermissionRequestFlowLight();
    this.finishPersistentStateLoading();
    this.isConversationRenderPending = false;
    this.conversationRenderOverlayOpacity = 0;
    this.conversationRenderSessionId = '';
    this.publishAgentTaskInterruptedNotification(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_notification_interrupted_content'))
    );
    this.cancelAgentRequestNotification();
    this.stopAgentContinuousTask();
    this.stopActiveTurnTimer();
    this.client.clearHandlers();
    uiContextManager.clearUIContext();
  }

  build() {
    HdsNavigation(this.pathStack) {
      this.buildRootNavigationContent()
    }
    .titleBar(this.shouldUseWorkspaceTitleBarContrast()
      ? NGFHdsTitleBarOptionsFactory.buildTransparentWhiteSurfaceWithMenu(
        $r('app.string.agent_home_app_title'),
        this.agentHomeTitleSubtitle(),
        this.normalizedHdsMaterialLevel(),
        this.agentHomeTitleBarMenuActions(),
        3,
        true,
        false
      )
      : NGFHdsTitleBarOptionsFactory.buildTransparentSurfaceWithMenu(
        $r('app.string.agent_home_app_title'),
        this.agentHomeTitleSubtitle(),
        this.normalizedHdsMaterialLevel(),
        this.agentHomeTitleBarMenuActions(),
        3,
        true,
        false
      ))
    .titleMode(HdsNavigationTitleMode.MINI)
    .mode(NavigationMode.Auto)
    .navBarWidth(328)
    .navBarWidthRange({ minWidth: 296, maxWidth: 380 })
    .minContentWidth(560)
    .navDestination(this.buildAgentHomeNavDestination)
    .onNavigationModeChange((mode: NavigationMode): void => {
      this.handleNavigationModeChange(mode);
    })
    .hideBackButton(true)
    .bindToScrollable([this.conversationScroller])
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }

  @Builder
  private buildRootNavigationContent(): void {
    if (this.isLargeScreenNavigation) {
      this.buildLargeScreenNavigationPane()
    } else {
      this.buildAgentHomeMainSurface()
    }
  }

  @Builder
  private buildAgentHomeNavDestination(name: string, pageInfos: Object): void {
    if (name === AGENT_HOME_MAIN_DESTINATION_NAME) {
      NavDestination() {
        this.buildAgentHomeMainSurface()
      }
      .hideTitleBar(true)
      .onBackPressed((): boolean => {
        return this.isLargeScreenNavigation;
      })
    }
  }

  @Builder
  private buildAgentHomeMainSurface(): void {
    Stack() {
      this.buildMainPager()
      this.buildAgentHomeSheetHosts()
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }

  @Builder
  private buildAgentHomeSheetHosts(): void {
    this.buildWorkspaceSheetHost()
    this.buildSessionSheetHost()
    this.buildSettingsSheetHost()
    this.buildGlobalSettingsSheetHost()
    this.buildDeveloperAppsSheetHost()
    this.buildSupportProjectSheetHost()
    this.buildModelSheetHost()
    this.buildRuntimeSheetHost()
    this.buildAttachmentSheetHost()
    this.buildPreviewSheetHost()
    this.buildSessionDetailsSheetHost()
    this.buildWorkspaceBrowserSheetHost()
    this.buildToolDetailSheetHost()
    this.buildRequestDetailSheetHost()
    this.buildPlanDetailSheetHost()
    this.buildWorkspaceDiffDetailSheetHost()
    this.buildWorkspaceContentPreviewSheetHost()
    this.buildWorkspaceActionsSheetHost()
    this.buildSessionActionsSheetHost()
    this.buildRenameWorkspaceSheetHost()
    this.buildRenameSessionSheetHost()
  }

  @Builder
  private buildLargeScreenNavigationPane(): void {
    Column({ space: 14 }) {
      Blank()
        .height(this.agentHomeMainPageTitleBarSpacerHeight())
        .hitTestBehavior(HitTestMode.None)

      this.buildLargeScreenStatusCard()

      Column({ space: 8 }) {
        this.buildLargeScreenNavItem(
          $r('sys.symbol.message'),
          $r('app.string.agent_home_sessions_title'),
          this.currentSessionTitle(),
          AgentHomeMainPageIndex.CHAT
        )
        this.buildLargeScreenNavItem(
          $r('sys.symbol.folder'),
          $r('app.string.agent_home_workspaces_title'),
          this.largeScreenWorkspaceSubtitle(),
          AgentHomeMainPageIndex.WORKSPACES
        )
        this.buildLargeScreenNavItem(
          $r('sys.symbol.doc_plaintext'),
          $r('app.string.agent_home_workspace_tab_files'),
          this.largeScreenFilesSubtitle(),
          AgentHomeMainPageIndex.WORKSPACE_BROWSER
        )
      }
      .width('100%')

      Blank()
        .layoutWeight(1)
        .hitTestBehavior(HitTestMode.None)

      Row({ space: 10 }) {
        this.buildLargeScreenNavIconButton($r('sys.symbol.house'), AgentHomeActionKey.OPEN_HOME)
        this.buildLargeScreenNavIconButton($r('sys.symbol.plus'), AgentHomeActionKey.NEW_SESSION)
        this.buildLargeScreenNavIconButton($r('sys.symbol.ellipsis_message'), AgentHomeActionKey.OPEN_SESSIONS)
        this.buildLargeScreenNavIconButton($r('sys.symbol.control'), AgentHomeActionKey.OPEN_GLOBAL_SETTINGS)
        this.buildLargeScreenNavIconButton($r('sys.symbol.gearshape'), AgentHomeActionKey.OPEN_SETTINGS)
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 14, right: 14, bottom: this.bottomInsetVp + 14 })
    .backgroundColor($r('app.color.background_primary'))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildLargeScreenStatusCard(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        SymbolGlyph(this.resolveConnectionStatusSymbol())
          .fontSize(19)
          .fontColor([this.resolveConnectionStatusColor()])
        Text(this.resolveConnectionStatusPlainText())
          .layoutWeight(1)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')

      Text(this.agentHomeTitleSubtitle())
        .width('100%')
        .fontSize(12)
        .lineHeight(17)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 14, right: 14, top: 13, bottom: 13 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildLargeScreenNavItem(symbol: Resource, title: ResourceStr, subtitle: string, pageIndex: number): void {
    Button() {
      Row({ space: 12 }) {
        SymbolGlyph(symbol)
          .fontSize(22)
          .fontColor([this.mainPageIndex === pageIndex ? this.agentHomeControlIconColor(true) : this.agentHomeReadableSecondaryColor()])
        Column({ space: 4 }) {
          Text(title)
            .width('100%')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.resolveDetailValue(subtitle))
            .width('100%')
            .fontSize(11)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
    }
    .width('100%')
    .height(62)
    .padding({ left: 14, right: 14 })
    .backgroundColor(this.mainPageIndex === pageIndex ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .border({
      width: this.mainPageIndex === pageIndex ? 1.3 : this.agentHomeSurfaceBorderWidth(),
      color: this.mainPageIndex === pageIndex ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.mainPageIndex === pageIndex ? this.agentHomeSurfaceShadowOptions() : {
      radius: 0,
      color: '#00000000',
      offsetX: 0,
      offsetY: 0
    })
    .clip(true)
    .onClick((): void => {
      this.showMainPage(pageIndex);
      this.ensureLargeScreenMainDestination();
    })
  }

  @Builder
  private buildLargeScreenNavIconButton(symbol: Resource, actionKey: string): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(22)
        .fontColor([this.agentHomeReadableSecondaryColor()])
    }
    .width(44)
    .height(44)
    .borderRadius(22)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.handleAction(actionKey);
      this.ensureLargeScreenMainDestination();
    })
  }

  private largeScreenWorkspaceSubtitle(): string {
    const workspaceTitle = this.currentWorkspaceTitle();
    const changeCount = this.visibleWorkspaceChanges().length;
    if (this.loadingWorkspaceChanges && changeCount === 0) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_loading'));
    }
    if (workspaceTitle.length > 0 && workspaceTitle !== '-') {
      if (changeCount > 0) {
        return workspaceTitle + ' / ' + this.workspaceChangeCountText(changeCount);
      }
      return workspaceTitle + ' / ' + this.currentBranchName();
    }
    return this.currentWorkspacePathForDisplay();
  }

  private largeScreenFilesSubtitle(): string {
    const fileCount = this.visibleWorkspaceFileCount();
    const changeCount = this.visibleWorkspaceChanges().length;
    if ((this.loadingWorkspaceFiles || this.isWorkspaceDirLoading('')) && fileCount === 0 && changeCount === 0) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_loading'));
    }
    if (fileCount > 0) {
      if (changeCount > 0) {
        return this.workspaceFileCountText(fileCount) + ' / ' + this.workspaceChangeCountText(changeCount);
      }
      return this.workspaceFileCountText(fileCount);
    }
    if (changeCount > 0) {
      return this.workspaceChangeCountText(changeCount);
    }
    return this.currentWorkspacePathForDisplay();
  }

  private visibleWorkspaceFileCount(): number {
    const files = this.visibleWorkspaceFiles();
    let count = 0;
    for (let index = 0; index < files.length; index++) {
      if (files[index].kind === 'file') {
        count = count + 1;
      }
    }
    return count;
  }

  private workspaceChangeCountText(count: number): string {
    const unit = resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_tab_changes'));
    return String(count) + ' ' + unit;
  }

  private workspaceFileCountText(count: number): string {
    const hostContext = this.getUIContext().getHostContext();
    let unit = '';
    if (count === 1) {
      unit = resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_file_singular'));
    } else {
      unit = resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_file_plural'));
    }
    return String(count) + ' ' + unit;
  }

  @Builder
  private buildMainPager(): void {
    Tabs({ barPosition: BarPosition.End, index: this.mainPageIndex, controller: this.mainTabsController }) {
      TabContent() {
        this.buildWorkspacePage(true)
      }
      .tabBar('')
      .opacity(this.mainPageOpacity(AgentHomeMainPageIndex.WORKSPACES))
      .translate({ x: this.mainPageTranslateX(AgentHomeMainPageIndex.WORKSPACES), y: 0 })
      .scale({
        x: this.mainPageScale(AgentHomeMainPageIndex.WORKSPACES),
        y: this.mainPageScale(AgentHomeMainPageIndex.WORKSPACES)
      })
      .animation({ duration: 260, curve: Curve.FastOutSlowIn })

      TabContent() {
        this.buildChatPage()
      }
      .tabBar('')
      .opacity(this.mainPageOpacity(AgentHomeMainPageIndex.CHAT))
      .translate({ x: this.mainPageTranslateX(AgentHomeMainPageIndex.CHAT), y: 0 })
      .scale({
        x: this.mainPageScale(AgentHomeMainPageIndex.CHAT),
        y: this.mainPageScale(AgentHomeMainPageIndex.CHAT)
      })
      .animation({ duration: 260, curve: Curve.FastOutSlowIn })

      TabContent() {
        this.buildWorkspaceBrowserPage(true)
      }
      .tabBar('')
      .opacity(this.mainPageOpacity(AgentHomeMainPageIndex.WORKSPACE_BROWSER))
      .translate({ x: this.mainPageTranslateX(AgentHomeMainPageIndex.WORKSPACE_BROWSER), y: 0 })
      .scale({
        x: this.mainPageScale(AgentHomeMainPageIndex.WORKSPACE_BROWSER),
        y: this.mainPageScale(AgentHomeMainPageIndex.WORKSPACE_BROWSER)
      })
      .animation({ duration: 260, curve: Curve.FastOutSlowIn })
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
    .barHeight(0)
    .barMode(BarMode.Fixed)
    .animationDuration(220)
    .onChange((index: number): void => {
      this.animateMainPageIndex(index);
      if (index === AgentHomeMainPageIndex.WORKSPACE_BROWSER) {
        this.refreshWorkspaceBrowserRoot();
      } else if (index === AgentHomeMainPageIndex.WORKSPACES && this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
        this.requestRemoteSessions();
      }
    })
  }

  @Builder
  private buildChatPage(): void {
    Stack({ alignContent: Alignment.TopStart }) {
      this.buildChatBackdrop()
      this.buildConversationPane()

      Column({ space: 0 }) {
        Blank()
          .hitTestBehavior(HitTestMode.None)
        this.buildTransientStatusTicker()
        this.buildComposer()
      }
      .width('100%')
      .height('100%')
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }

  @Builder
  private buildChatBackdrop(): void {
    Column() {
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildWorkspaceSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isWorkspaceSheetOpen, this.buildWorkspaceSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.WORKSPACES);
      }
    })
  }

  @Builder
  private buildSessionSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isSessionSheetOpen, this.buildSessionSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.SESSIONS);
      }
    })
  }

  @Builder
  private buildSettingsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isSettingsSheetOpen, this.buildSettingsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.SETTINGS);
      }
    })
  }

  @Builder
  private buildGlobalSettingsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isGlobalSettingsSheetOpen, this.buildGlobalSettingsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.GLOBAL_SETTINGS);
      }
    })
  }

  @Builder
  private buildDeveloperAppsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isDeveloperAppsSheetOpen, this.buildDeveloperAppsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.DEVELOPER_APPS);
      }
    })
  }

  @Builder
  private buildSupportProjectSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isSupportProjectSheetOpen, this.buildSupportProjectSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.SUPPORT_PROJECT);
      }
    })
  }

  @Builder
  private buildModelSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isModelSheetOpen, this.buildModelSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.MODELS);
      }
    })
  }

  @Builder
  private buildRuntimeSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isRuntimeSheetOpen, this.buildRuntimeSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.RUNTIME);
      }
    })
  }

  @Builder
  private buildAttachmentSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isAttachmentSheetOpen, this.buildAttachmentSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.ATTACHMENTS);
      }
    })
  }

  @Builder
  private buildPreviewSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isPreviewSheetOpen, this.buildPreviewSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.PREVIEW);
      }
    })
  }

  @Builder
  private buildSessionDetailsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isSessionDetailsSheetOpen, this.buildSessionDetailsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.SESSION_DETAILS);
      }
    })
  }

  @Builder
  private buildWorkspaceBrowserSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isWorkspaceBrowserSheetOpen, this.buildWorkspaceBrowserSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.WORKSPACE_BROWSER);
      }
    })
  }

  @Builder
  private buildToolDetailSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isToolDetailSheetOpen, this.buildToolDetailSheet(), {
      preferType: SheetType.BOTTOM,
      detents: this.toolDetailSheetDetents(),
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.TOOL_DETAIL);
      }
    })
  }

  @Builder
  private buildRequestDetailSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isRequestDetailSheetOpen, this.buildRequestDetailSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.REQUEST_DETAIL);
      }
    })
  }

  @Builder
  private buildPlanDetailSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isPlanDetailSheetOpen, this.buildPlanDetailSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM, SheetSize.LARGE],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.PLAN_DETAIL);
      }
    })
  }

  @Builder
  private buildWorkspaceDiffDetailSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isWorkspaceDiffDetailSheetOpen, this.buildWorkspaceDiffDetailSheet(), {
      preferType: SheetType.BOTTOM,
      detents: this.workspaceDiffDetailSheetDetents(),
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.WORKSPACE_DIFF_DETAIL);
      }
    })
  }

  @Builder
  private buildWorkspaceContentPreviewSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isWorkspaceContentPreviewSheetOpen, this.buildWorkspaceContentPreviewSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.LARGE, SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.WORKSPACE_CONTENT_PREVIEW);
      }
    })
  }

  @Builder
  private buildWorkspaceActionsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isWorkspaceActionsSheetOpen, this.buildWorkspaceActionsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.WORKSPACE_ACTIONS);
      }
    })
  }

  @Builder
  private buildSessionActionsSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isSessionActionsSheetOpen, this.buildSessionActionsSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.SESSION_ACTIONS);
      }
    })
  }

  @Builder
  private buildRenameWorkspaceSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isRenameWorkspaceSheetOpen, this.buildRenameWorkspaceSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.RENAME_WORKSPACE);
      }
    })
  }

  @Builder
  private buildRenameSessionSheetHost(): void {
    Column() {
    }
    .width(1)
    .height(1)
    .opacity(0)
    .bindSheet($$this.isRenameSessionSheetOpen, this.buildRenameSessionSheet(), {
      preferType: SheetType.BOTTOM,
      detents: [SheetSize.MEDIUM],
      dragBar: true,
      showClose: false,
      backgroundColor: '#00000000',
      maskColor: '#00000000',
      blurStyle: BlurStyle.NONE,
      keyboardAvoidMode: SheetKeyboardAvoidMode.RESIZE_ONLY,
      onDisappear: (): void => {
        this.handleSheetDisappear(AgentHomeSheetKey.RENAME_SESSION);
      }
    })
  }

  @Builder
  private buildConversationPane(): void {
    Column() {
      Stack({ alignContent: Alignment.BottomEnd }) {
        if (this.isPersistentStateLoading) {
          Column() {
            this.buildStartupStateLoading()
          }
          .width('100%')
          .height('100%')
          .padding({ top: this.conversationContentTopPadding(), bottom: this.conversationContentBottomPadding() })
          .justifyContent(FlexAlign.Center)
        } else if (this.visibleConversationItems().length === 0 && !this.shouldShowConversationInlineStatus()) {
          Column() {
            this.buildEmptyHomeActions()
          }
          .width('100%')
          .height('100%')
          .padding({ top: this.conversationContentTopPadding(), bottom: 0 })
          .justifyContent(FlexAlign.Center)
        } else {
          Scroll(this.conversationScroller) {
            Column({ space: 0 }) {
              ForEach(this.visibleConversationItems(), (item: AgentHomeConversationItem) => {
                this.buildConversationItem(item)
              }, (item: AgentHomeConversationItem): string => item.id)
              if (this.shouldShowContextCompactingDivider()) {
                this.buildContextCompactingDivider()
              }
              if (this.shouldShowActiveTurnTimerRow()) {
                this.buildActiveTurnTimerRow()
              }
            }
            .width('100%')
            .padding({
              left: 22,
              right: 22,
              top: this.conversationContentTopPadding(),
              bottom: this.conversationContentBottomPadding()
            })
          }
          .width('100%')
          .height('100%')
          .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
          .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
          .scrollBar(BarState.Off)
          .edgeEffect(EdgeEffect.Spring)
          .onDidScroll((xOffset: number, yOffset: number): void => {
            this.handleConversationScroll(yOffset);
          })
          .onReachEnd((): void => {
            this.resetConversationBottomButtonState();
          })
        }
        if (this.isConversationRenderPending) {
          this.buildConversationRenderOverlay()
        }
      }
      .width('100%')
      .layoutWeight(1)
    }
    .width('100%')
    .layoutWeight(1)
    .height('100%')
    .backgroundColor(Color.Transparent)
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP])
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildConversationRenderOverlay(): void {
    Row({ space: 8 }) {
      LoadingProgress()
        .width(16)
        .height(16)
        .color($r('app.color.text_secondary'))
        .enableLoading(this.isConversationRenderPending)
      Text($r('app.string.agent_home_conversation_rendering'))
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .height(38)
    .padding({ left: 12, right: 12 })
    .margin({ right: 18, bottom: this.conversationContentBottomPadding() })
    .justifyContent(FlexAlign.Center)
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.conversationRenderOverlayColor())
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .borderRadius(19)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .opacity(this.conversationRenderOverlayOpacity)
    .animation({ duration: AGENT_HOME_CONVERSATION_RENDER_FADE_MS, curve: Curve.EaseOut })
  }

  @Builder
  private buildStartupStateLoading(): void {
    Column({ space: 12 }) {
      LoadingProgress()
        .width(24)
        .height(24)
        .color(this.agentHomeReadableSecondaryColor())
        .enableLoading(this.isPersistentStateLoading)
      Text($r('app.string.agent_home_conversation_rendering'))
        .fontSize(14)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 22, right: 22 })
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  private buildAgentFilterBar(): void {
    Scroll() {
      Row({ space: 8 }) {
        ForEach(this.agentFilterOptions(), (item: AgentHomeAgentFilterOption) => {
          this.buildAgentFilterPill(item)
        }, (item: AgentHomeAgentFilterOption): string => item.id)
      }
      .height(34)
      .padding({ left: 18, right: 18 })
    }
    .width('100%')
    .height(AGENT_HOME_AGENT_FILTER_BAR_HEIGHT)
    .padding({ top: 0, bottom: 10 })
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .edgeEffect(EdgeEffect.Spring)
    .hitTestBehavior(HitTestMode.Transparent)
  }

  @Builder
  private buildAgentFilterPill(item: AgentHomeAgentFilterOption): void {
    Row({ space: 6 }) {
      SymbolGlyph(item.isMain ? $r('sys.symbol.message') : $r('sys.symbol.AI_search'))
        .fontSize(13)
        .fontColor([this.agentHomeControlIconColor(this.isAgentFilterSelected(item.id))])
      Text(item.label)
        .fontSize(12)
        .fontWeight(this.isAgentFilterSelected(item.id) ? FontWeight.Medium : FontWeight.Regular)
        .fontColor(this.agentHomeControlTextColor(this.isAgentFilterSelected(item.id)))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .height(30)
    .padding({ left: 10, right: 10 })
    .constraintSize({ minWidth: 58, maxWidth: 160 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .borderRadius(15)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
    .translate(this.buildAgentHomeSurfacePreset().translateOptions)
    .animation({ duration: 160, curve: Curve.EaseOut })
    .onClick((): void => {
      this.switchAgentFilter(item.id);
    })
  }

  @Builder
  private buildAgentNameBadge(agentName: string): void {
    if (this.visibleAgentNameForProvider(this.currentSessionProviderId(), agentName).length > 0) {
      Row({ space: 4 }) {
        SymbolGlyph($r('sys.symbol.AI_search'))
          .fontSize(11)
          .fontColor([$r('app.color.text_secondary')])
        Text(this.visibleAgentNameForProvider(this.currentSessionProviderId(), agentName))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .height(22)
      .constraintSize({ maxWidth: 120 })
      .padding({ left: 7, right: 7 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .borderRadius(11)
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)
    }
  }

  @Builder
  private buildEmptyHomeActions(): void {
    Scroll() {
      Column({ space: 14 }) {
        Blank()
          .height(this.agentHomeMainPageTitleBarSpacerHeight())
        this.buildOnboardingHeroCard()
        this.buildOnboardingCommandCard()
        this.buildOnboardingStepCard(
          $r('sys.symbol.desktop'),
          '1',
          $r('app.string.agent_home_onboarding_step_bridge_title'),
          $r('app.string.agent_home_onboarding_step_bridge_desc'),
          $r('app.string.agent_home_onboarding_step_bridge_action'),
          AgentHomeActionKey.COPY_DESKTOP_COMMAND,
          this.isOnboardingBridgeStepComplete(),
          this.isOnboardingStepActive('bridge')
        )
        this.buildOnboardingStepCard(
          $r('sys.symbol.qrcode'),
          '2',
          $r('app.string.agent_home_onboarding_step_scan_title'),
          $r('app.string.agent_home_onboarding_step_scan_desc'),
          $r('app.string.agent_home_onboarding_step_scan_action'),
          AgentHomeActionKey.SCAN_BRIDGE_QR,
          this.isOnboardingConnectionStepComplete(),
          this.isOnboardingStepActive('connection')
        )
        this.buildOnboardingStepCard(
          $r('sys.symbol.ellipsis_message'),
          '3',
          $r('app.string.agent_home_onboarding_step_session_title'),
          $r('app.string.agent_home_onboarding_step_session_desc'),
          $r('app.string.agent_home_onboarding_step_session_action'),
          AgentHomeActionKey.REFRESH_REMOTE_SESSIONS,
          this.isOnboardingSessionStepComplete(),
          this.isOnboardingStepActive('session')
        )
        this.buildOnboardingStatusPanel()
        this.buildOnboardingMarkdownDemoPanel()
      }
      .width('100%')
      .padding({ left: 22, right: 22, top: 0, bottom: this.conversationContentBottomPadding() })
    }
    .width('100%')
    .height('100%')
    .scrollBar(BarState.Off)
    .edgeEffect(EdgeEffect.Spring)
  }

  @Builder
  private buildOnboardingHeroCard(): void {
    Column({ space: 10 }) {
      Row({ space: 12 }) {
        SymbolGlyph($r('sys.symbol.AI_search'))
          .fontSize(34)
          .fontColor([$r('app.color.tag_blue')])
        Column({ space: 5 }) {
          Text($r('app.string.agent_home_onboarding_title'))
            .width('100%')
            .fontSize(25)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text($r('app.string.agent_home_onboarding_subtitle'))
            .width('100%')
            .fontSize(13)
            .lineHeight(19)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(5)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 18, bottom: 18 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.agentHomeSelectedBorderColor(true)
    })
    .borderRadius(18)
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .clip(true)
  }

  @Builder
  private buildOnboardingCommandCard(): void {
    Column({ space: 10 }) {
      Row() {
        Text($r('app.string.agent_home_onboarding_command_label'))
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
        Button($r('app.string.agent_home_onboarding_copy_command'))
          .height(32)
          .padding({ left: 12, right: 12 })
          .fontSize(12)
          .fontColor(this.agentHomeControlTextColor(true))
          .backgroundColor(Color.Transparent)
          .borderRadius(16)
          .buttonStyle(ButtonStyleMode.NORMAL)
          .onClick((): void => {
            this.copyDesktopSetupCommand();
          })
      }
      .width('100%')

      Text(AGENT_HOME_DESKTOP_SETUP_COMMAND)
        .width('100%')
        .fontSize(15)
        .fontColor(this.agentHomeReadableTextColor())
        .fontWeight(FontWeight.Medium)
        .copyOption(CopyOptions.LocalDevice)
        .padding({ left: 12, right: 12, top: 11, bottom: 11 })
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(12)

      Text($r('app.string.agent_home_onboarding_command_desc'))
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor(this.agentHomeReadableSecondaryColor())
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 15, bottom: 15 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildOnboardingStepCard(
    symbol: Resource,
    step: string,
    title: ResourceStr,
    subtitle: ResourceStr,
    actionLabel: ResourceStr,
    actionKey: string,
    completed: boolean,
    active: boolean
  ): void {
    Button() {
      Row({ space: 12 }) {
        this.buildOnboardingStepMarker(step, completed, active)
        SymbolGlyph(symbol)
          .fontSize(22)
          .fontColor([active ? this.agentHomeControlIconColor(true) : this.agentHomeReadableSecondaryColor()])
        Column({ space: 5 }) {
          Text(title)
            .width('100%')
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(subtitle)
            .width('100%')
            .fontSize(12)
            .lineHeight(17)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(3)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Row({ space: 5 }) {
            Text(actionLabel)
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(active ? this.agentHomeControlTextColor(true) : this.agentHomeReadableTextColor())
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            SymbolGlyph($r('sys.symbol.chevron_right'))
              .fontSize(11)
              .fontColor([active ? this.agentHomeControlIconColor(true) : this.agentHomeReadableSecondaryColor()])
          }
          .width('100%')
          .justifyContent(FlexAlign.Start)
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 15, right: 15, top: 13, bottom: 13 })
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: active ? 1.5 : this.agentHomeSurfaceBorderWidth(),
      color: active ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow({
      radius: active ? 18 : 8,
      color: active ? '#33005DFF' : '#00000000',
      offsetX: 0,
      offsetY: active ? 6 : 2
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.handleHomeAction(actionKey);
    })
  }

  @Builder
  private buildOnboardingStepMarker(step: string, completed: boolean, active: boolean): void {
    Stack({ alignContent: Alignment.Center }) {
      if (completed) {
        SymbolGlyph($r('sys.symbol.checkmark'))
          .fontSize(14)
          .fontColor([active ? this.agentHomeControlIconColor(true) : $r('app.color.tag_green')])
      } else {
        Text(step)
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeControlTextColor(active))
          .textAlign(TextAlign.Center)
      }
    }
    .width(25)
    .height(25)
    .backgroundColor(active ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
    .border({
      width: active ? 1.4 : this.agentHomeSurfaceBorderWidth(),
      color: active ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(8)
  }

  @Builder
  private buildOnboardingStatusPanel(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.info_circle'))
          .fontSize(17)
          .fontColor([this.resolveConnectionStatusColor()])
        Text($r('app.string.agent_home_onboarding_status_title'))
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      Text($r('app.string.agent_home_onboarding_status_hint'))
        .width('100%')
        .fontSize(12)
        .lineHeight(17)
        .fontColor(this.agentHomeReadableSecondaryColor())

      Column({ space: 8 }) {
        this.buildOnboardingStatusRow($r('app.string.agent_home_detail_connection_status'), this.resolveConnectionStatusPlainText())
        this.buildOnboardingStatusRow($r('app.string.agent_home_detail_endpoint'), this.resolveDetailValue(this.bridgeEndpoint))
        this.buildOnboardingStatusRow($r('app.string.agent_home_detail_provider'), this.currentProviderOption().displayName)
        this.buildOnboardingStatusRow($r('app.string.agent_home_detail_workspace_title'), this.currentWorkspaceTitle())
        this.buildOnboardingStatusRow($r('app.string.agent_home_detail_model'), this.currentModelDisplayText())
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 15, right: 15, top: 14, bottom: 14 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildOnboardingMarkdownDemoPanel(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.info_circle'))
          .fontSize(17)
          .fontColor([this.agentHomeReadableSecondaryColor()])
        Text($r('app.string.agent_home_onboarding_md_demo_label'))
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')

      if (this.onboardingRichContentReady) {
        this.buildOnboardingProbeLabel($r('app.string.agent_home_onboarding_md_native_probe'), true)

        if (this.onboardingRichContentProbeStage >= AGENT_HOME_ONBOARDING_PROBE_INLINE_WEB_STAGE) {
          this.buildOnboardingProbeLabel(
            $r('app.string.agent_home_onboarding_md_web_probe'),
            this.onboardingRichContentProbeStage === AGENT_HOME_ONBOARDING_PROBE_INLINE_WEB_STAGE
          )
        }

        if (this.onboardingRichContentProbeStage === AGENT_HOME_ONBOARDING_PROBE_INLINE_WEB_STAGE) {
          this.buildOnboardingWebProbeRenderer(
            this.onboardingWebProbeHtml($r('app.string.agent_home_onboarding_md_web_probe')),
            false
          )
        }

        if (this.onboardingRichContentProbeStage >= AGENT_HOME_ONBOARDING_PROBE_LOAD_DATA_STAGE) {
          this.buildOnboardingProbeLabel(
            $r('app.string.agent_home_onboarding_md_load_data_probe'),
            this.onboardingRichContentProbeStage === AGENT_HOME_ONBOARDING_PROBE_LOAD_DATA_STAGE
          )
        }

        if (this.onboardingRichContentProbeStage === AGENT_HOME_ONBOARDING_PROBE_LOAD_DATA_STAGE) {
          this.buildOnboardingWebProbeRenderer(
            this.onboardingWebProbeHtml($r('app.string.agent_home_onboarding_md_load_data_probe')),
            true
          )
        }

        if (this.onboardingRichContentProbeStage >= AGENT_HOME_ONBOARDING_PROBE_MARKDOWN_STAGE) {
          this.buildOnboardingMarkdownProbeRenderer()
        }
      } else {
        this.buildOnboardingMarkdownDemoLoading()
      }
    }
    .width('100%')
    .padding({ left: 15, right: 15, top: 14, bottom: 14 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildOnboardingProbeLabel(label: ResourceStr, active: boolean): void {
    Row({ space: 7 }) {
      SymbolGlyph(active ? $r('sys.symbol.circle') : $r('sys.symbol.checkmark_circle'))
        .fontSize(12)
        .fontColor([active ? this.agentHomeSolidControlBackgroundColor() : this.agentHomeReadableMutedColor()])
      Text(label)
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor(active ? this.agentHomeReadableTextColor() : this.agentHomeReadableSecondaryColor())
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }

  @Builder
  private buildOnboardingWebProbeRenderer(content: string, forceLoadData: boolean): void {
    NGFRichContentRenderer({
      content: content,
      contentKind: NGFRichContentKind.HTML,
      isDarkMode: this.conversationRichContentDarkMode(),
      bottomPadding: 0,
      forceLoadData: forceLoadData,
      diagnosticSurface: true,
      onLinkClick: (url: string): boolean => {
        return this.handleAssistantAnswerLinkClick(url);
      }
    })
      .width('100%')
      .height(AGENT_HOME_ONBOARDING_WEB_PROBE_HEIGHT)
      .backgroundColor(this.isDarkMode ? '#101826' : '#FFFFFF')
      .borderRadius(10)
      .border({
        width: 1,
        color: this.agentHomeSurfaceBorderColor()
      })
  }

  @Builder
  private buildOnboardingMarkdownProbeRenderer(): void {
    Column({ space: 8 }) {
      this.buildAssistantNativeRichContent('onboarding_markdown_demo', this.onboardingMarkdownDemoContent())
    }
      .width('100%')
      .padding(10)
      .backgroundColor(this.codeBlockBackgroundColor())
      .borderRadius(10)
      .border({
        width: 1,
        color: this.codeBlockBorderColor()
      })
  }

  @Builder
  private buildOnboardingMarkdownDemoLoading(): void {
    Column({ space: 9 }) {
      LoadingProgress()
        .width(22)
        .height(22)
        .color(this.agentHomeReadableMutedColor())
        .enableLoading(true)
      Text($r('app.string.agent_home_onboarding_md_demo_loading'))
        .fontSize(12)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(AGENT_HOME_ONBOARDING_RICH_RENDER_HEIGHT)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  private buildOnboardingStatusRow(label: ResourceStr, value: string): void {
    Row({ space: 10 }) {
      Text(label)
        .fontSize(12)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .width(102)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(value)
        .fontSize(13)
        .fontColor(this.agentHomeReadableTextColor())
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.End)
    }
    .width('100%')
  }

  @Builder
  private buildHomeActionCard(symbol: Resource, title: ResourceStr, subtitle: ResourceStr, actionKey: string, emphasized: boolean): void {
    Button() {
      Row({ space: 16 }) {
        SymbolGlyph(symbol)
          .fontSize(30)
          .fontColor([emphasized ? $r('app.color.tag_green_dark') : this.agentHomeControlIconColor(false)])
        Column({ space: 5 }) {
          Text(title)
            .fontSize(19)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
          Text(subtitle)
            .fontSize(13)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 17, bottom: 17 })
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.buildHomeActionSurfacePreset(actionKey).backgroundEffect)
    .borderRadius(12)
    .border({
      width: this.buildHomeActionSurfacePreset(actionKey).borderWidth,
      color: this.buildHomeActionSurfacePreset(actionKey).borderColor
    })
    .shadow(this.buildHomeActionSurfacePreset(actionKey).shadowOptions)
    .visualEffect(this.buildHomeActionSurfacePreset(actionKey).buildVisualEffect())
    .scale(this.buildHomeActionSurfacePreset(actionKey).scaleOptions)
    .translate(this.buildHomeActionSurfacePreset(actionKey).translateOptions)
    .clip(true)
    .onTouch((event: TouchEvent): void => {
      if (event.type === TouchType.Down) {
        this.pressedHomeActionKey = actionKey;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressedHomeActionKey = '';
      }
    })
    .onClick((): void => {
      this.pressedHomeActionKey = '';
      this.handleHomeAction(actionKey);
    })
  }

  @Builder
  private buildContextCompactingDivider(): void {
    Row({ space: 10 }) {
      Divider()
        .layoutWeight(1)
        .height(1)
        .color($r('app.color.card_border'))
      Row({ space: 7 }) {
        SymbolGlyph($r('sys.symbol.arrow_2_circlepath'))
          .fontSize(15)
          .fontColor([$r('app.color.text_secondary')])
        Text($r('app.string.agent_home_context_compacting'))
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
      }
      .padding({ left: 10, right: 10, top: 5, bottom: 5 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .borderRadius(12)
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)
      Divider()
        .layoutWeight(1)
        .height(1)
        .color($r('app.color.card_border'))
    }
    .width('100%')
  }

  @Builder
  private buildActiveTurnTimerRow(): void {
    Row() {
      Blank()
      Row({ space: 6 }) {
        SymbolGlyph($r('sys.symbol.timer'))
          .fontSize(14)
          .fontColor([$r('app.color.text_secondary')])
        Text(this.activeTurnElapsedText)
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
      }
      .height(28)
      .padding({ left: 10, right: 10 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .borderRadius(14)
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)
      Blank()
    }
    .width('100%')
  }

  @Builder
  private buildConversationItem(item: AgentHomeConversationItem): void {
    Column() {
      if (item.kind === AgentHomeConversationItemKind.MESSAGE) {
        ForEach(this.conversationMessageItems(item), (message: AgentHomeChatItem) => {
          this.buildMessageItem(message)
        }, (message: AgentHomeChatItem): string => this.conversationMessageItemId(message))
      } else if (item.kind === AgentHomeConversationItemKind.TOOL_CALL) {
        ForEach(this.conversationToolCallItems(item), (toolCall: AgentHomeToolCallItem) => {
          this.buildToolCallRow(toolCall)
        }, (toolCall: AgentHomeToolCallItem): string => this.conversationToolCallItemId(toolCall))
      } else if (item.kind === AgentHomeConversationItemKind.USER_REQUEST) {
        ForEach(this.conversationUserRequestItems(item), (request: AgentHomeUserRequestItem) => {
          this.buildUserRequestRow(request)
        }, (request: AgentHomeUserRequestItem): string => request.id + '_' + request.status + '_' + String(request.updatedAt))
      } else if (item.kind === AgentHomeConversationItemKind.PLAN) {
        ForEach(this.conversationPlanItems(item), (plan: AgentHomePlanItem) => {
          this.buildPlanRow(plan)
        }, (plan: AgentHomePlanItem): string => plan.id)
      }
    }
    .width('100%')
    .margin({ bottom: this.conversationItemBottomMargin(item.kind) })
  }

  @Builder
  private buildMessageItem(item: AgentHomeChatItem): void {
    if (item.role === AgentHomeMessageRole.USER) {
      this.buildUserMessage(item)
    } else if (item.role === AgentHomeMessageRole.TOOL || item.role === AgentHomeMessageRole.STATUS) {
      this.buildStatusMessage(item)
    } else {
      this.buildAssistantMessage(item)
    }
  }

  @Builder
  private buildAssistantMessage(item: AgentHomeChatItem): void {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.AI_search'))
          .fontSize(15)
          .fontColor([this.agentHomeReadableSecondaryColor()])
        Text(this.providerDisplayNameForId(this.providerIdForSession(item.sessionId)))
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        this.buildAgentNameBadge(item.agentName)
      }
      .width('100%')
      .padding({ left: 2, right: 2 })

      if (item.reasoningText.length > 0) {
        this.buildAssistantReasoningBlock(item)
      }

      if (item.text.length > 0) {
        this.buildAssistantAnswerBlock(item)
      }
    }
    .width('100%')
    .padding({ left: 2, right: 2, top: 2, bottom: 0 })
  }

  @Builder
  private buildAssistantAnswerBlock(item: AgentHomeChatItem): void {
    Column({ space: 8 }) {
      if (this.messageAttachmentItems(item.id, item.text).length > 0) {
        this.buildMessageAttachmentGroup(item.id, this.messageAttachmentItems(item.id, item.text), false)
      }

      if (this.messageAttachmentBodyText(item.id, item.text).length > 0) {
        if (this.shouldDeferRichContentRenderForText(item.id, this.messageAttachmentBodyText(item.id, item.text)) && !this.isRichContentReady(item.id)) {
          this.buildDeferredRichContentLoadingText(item.id, this.messageAttachmentBodyText(item.id, item.text))
        } else {
          this.buildAssistantNativeRichContent(item.id, this.messageAttachmentBodyText(item.id, item.text))
        }
      }

      if (item.durationText.length > 0) {
        Row({ space: 8 }) {
          SymbolGlyph($r('sys.symbol.square_and_pencil'))
            .fontSize(16)
            .fontColor([this.agentHomeReadableSecondaryColor()])
          Text($r('app.string.agent_home_worked_for', item.durationText))
            .fontSize(12)
            .fontColor(this.agentHomeReadableSecondaryColor())
        }
        .width('100%')
        .padding({ left: 2, right: 2 })
      }

      this.buildMessageRevertAction(item, false)
    }
    .width('100%')
    .padding({ left: 0, right: 0, top: 0, bottom: 2 })
    .backgroundColor(Color.Transparent)
  }

  @Builder
  private buildAssistantNativeRichContent(messageId: string, text: string): void {
    Column({ space: 8 }) {
      ForEach(this.richBlocksForText(messageId, text), (block: AgentHomeRichBlock) => {
        this.buildAssistantRichBlock(block)
      }, (block: AgentHomeRichBlock): string => block.id)
    }
    .width('100%')
    .padding({ bottom: 8 })
  }

  @Builder
  private buildDeferredRichContentLoading(item: AgentHomeChatItem): void {
    this.buildDeferredRichContentLoadingText(item.id, item.text)
  }

  @Builder
  private buildDeferredRichContentLoadingText(messageId: string, text: string): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        LoadingProgress()
          .width(16)
          .height(16)
          .color(this.agentHomeReadableMutedColor())
          .enableLoading(true)
        Text($r('app.string.agent_home_conversation_rendering'))
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')

      Text(this.richContentLoadingPreviewText(text))
        .width('100%')
        .fontSize(13)
        .lineHeight(20)
        .fontColor(this.agentHomeReadableMutedColor())
        .maxLines(4)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding(12)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onAppear((): void => {
      this.scheduleRichContentRender(messageId);
    })
  }

  @Builder
  private buildAssistantRichBlock(block: AgentHomeRichBlock): void {
    if (block.kind === AgentHomeRichBlockKind.CODE) {
      Column({ space: block.meta.length > 0 ? 6 : 0 }) {
        if (block.meta.length > 0) {
          Text(block.meta)
            .fontSize(10)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.codeBlockMetaTextColor())
            .textCase(TextCase.UpperCase)
            .maxLines(1)
        }
        Text(block.text)
          .width('100%')
          .fontSize(14)
          .lineHeight(22)
          .fontFamily('monospace')
          .fontColor(this.codeBlockTextColor())
          .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
          .copyOption(CopyOptions.LocalDevice)
      }
      .width('100%')
      .padding({ left: 12, right: 12, top: 10, bottom: 10 })
      .backgroundColor(this.codeBlockBackgroundColor())
      .border({
        width: 1,
        color: this.codeBlockBorderColor()
      })
      .borderRadius(12)
    } else if (block.kind === AgentHomeRichBlockKind.TABLE) {
      this.buildAssistantMarkdownTable(block)
    } else if (block.kind === AgentHomeRichBlockKind.IMAGE) {
      this.buildAssistantMarkdownImage(block)
    } else if (block.kind === AgentHomeRichBlockKind.BULLET || block.kind === AgentHomeRichBlockKind.ORDERED) {
      Row({ space: 8 }) {
        Text(block.marker)
          .width(22)
          .fontSize(16)
          .lineHeight(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_secondary'))
        Column() {
          this.buildRichInlineText(block.text, 16, 24, $r('app.color.text_body'))
        }
        .layoutWeight(1)

      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
    } else if (block.kind === AgentHomeRichBlockKind.HEADING) {
      this.buildRichInlineText(block.text, this.headingFontSize(block.level), this.headingLineHeight(block.level), $r('app.color.text_body'))
    } else if (block.kind === AgentHomeRichBlockKind.QUOTE) {
      Row({ space: 10 }) {
        Text('▎')
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.tag_blue'))
        Column() {
          this.buildRichInlineText(block.text, 16, 25, $r('app.color.text_body'))
        }
        .layoutWeight(1)

      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
    } else {
      this.buildRichInlineText(block.text, 17, 26, $r('app.color.text_body'))
    }
  }

  @Builder
  private buildAssistantMarkdownImage(block: AgentHomeRichBlock): void {
    Column({ space: 6 }) {
      Image(block.meta)
        .width('100%')
        .height(112)
        .objectFit(ImageFit.Contain)
        .borderRadius(12)
      if (block.text.length > 0) {
        Text(block.text)
          .fontSize(12)
          .lineHeight(18)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
    }
    .width('100%')
    .padding(10)
    .backgroundColor(this.codeBlockBackgroundColor())
    .border({
      width: 1,
      color: this.codeBlockBorderColor()
    })
    .borderRadius(12)
  }

  @Builder
  private buildAssistantMarkdownTable(block: AgentHomeRichBlock): void {
    Column() {
      ForEach(this.markdownTableRowsForBlock(block), (row: AgentHomeMarkdownTableRow) => {
        Row() {
          ForEach(row.cells, (cell: AgentHomeMarkdownTableCell) => {
            Text(cell.text)
              .fontSize(row.isHeader ? 13 : 12)
              .lineHeight(row.isHeader ? 20 : 19)
              .fontWeight(row.isHeader ? FontWeight.Medium : FontWeight.Regular)
              .fontColor(row.isHeader ? this.agentHomeReadableTextColor() : this.agentHomeReadableSecondaryColor())
              .layoutWeight(1)
              .padding({ left: 8, right: 8, top: 7, bottom: 7 })
              .maxLines(3)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }, (cell: AgentHomeMarkdownTableCell): string => cell.id)
        }
        .width('100%')
        .backgroundColor(row.isHeader ? this.codeBlockBackgroundColor() : Color.Transparent)
        .border({
          width: { bottom: 1 },
          color: this.codeBlockBorderColor()
        })
      }, (row: AgentHomeMarkdownTableRow): string => row.id)
    }
    .width('100%')
    .clip(true)
    .border({
      width: 1,
      color: this.codeBlockBorderColor()
    })
    .borderRadius(12)
  }

  private richContentKindForText(text: string): string {
    const trimmed = text.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.startsWith('<body')) {
      return NGFRichContentKind.HTML;
    }
    return NGFRichContentKind.MARKDOWN;
  }

  private richContentEstimatedHeight(text: string): number {
    const measuredLength = Math.min(text.length, AGENT_HOME_RICH_HEIGHT_ESTIMATE_MAX_CHARS);
    const measuredText = text.substring(0, measuredLength).split('\r\n').join('\n').split('\r').join('\n');
    let lineCount = 1;
    for (let index = 0; index < measuredText.length; index++) {
      if (measuredText.charAt(index) === '\n') {
        lineCount = lineCount + 1;
      }
    }
    const wrappedLineCount = Math.floor(measuredText.length / 36);
    let height = 72 + (lineCount + wrappedLineCount) * 24;
    if (height < 120) {
      height = 120;
    }
    if (height > 760) {
      height = 760;
    }
    return height;
  }

  private shouldDeferRichContentRender(item: AgentHomeChatItem): boolean {
    return item.text.length >= AGENT_HOME_DEFERRED_RICH_RENDER_CHARS;
  }

  private shouldDeferRichContentRenderForText(_messageId: string, text: string): boolean {
    return text.length >= AGENT_HOME_DEFERRED_RICH_RENDER_CHARS;
  }

  private isRichContentReady(messageId: string): boolean {
    for (let index = 0; index < this.richContentReadyMessageIds.length; index++) {
      if (this.richContentReadyMessageIds[index] === messageId) {
        return true;
      }
    }
    return false;
  }

  private isRichContentPending(messageId: string): boolean {
    for (let index = 0; index < this.richContentPendingMessageIds.length; index++) {
      if (this.richContentPendingMessageIds[index] === messageId) {
        return true;
      }
    }
    return false;
  }

  private scheduleRichContentRender(messageId: string): void {
    if (messageId.length === 0 || this.isRichContentReady(messageId) || this.isRichContentPending(messageId)) {
      return;
    }
    const pendingIds: Array<string> = [];
    for (let index = 0; index < this.richContentPendingMessageIds.length; index++) {
      pendingIds.push(this.richContentPendingMessageIds[index]);
    }
    pendingIds.push(messageId);
    this.richContentPendingMessageIds = pendingIds;
    this.scheduleNextRichContentRender();
  }

  private scheduleNextRichContentRender(): void {
    if (this.richContentRenderTimer >= 0 || this.richContentPendingMessageIds.length === 0) {
      return;
    }
    this.richContentRenderTimer = setTimeout((): void => {
      this.richContentRenderTimer = -1;
      this.markNextRichContentReady();
      this.scheduleNextRichContentRender();
    }, AGENT_HOME_DEFERRED_RICH_RENDER_DELAY_MS);
  }

  private markNextRichContentReady(): void {
    if (this.richContentPendingMessageIds.length === 0) {
      return;
    }
    const messageId = this.richContentPendingMessageIds[0];
    const nextPending: Array<string> = [];
    for (let index = 1; index < this.richContentPendingMessageIds.length; index++) {
      nextPending.push(this.richContentPendingMessageIds[index]);
    }
    this.richContentPendingMessageIds = nextPending;
    if (this.isRichContentReady(messageId)) {
      return;
    }
    const readyIds: Array<string> = [];
    for (let index = 0; index < this.richContentReadyMessageIds.length; index++) {
      readyIds.push(this.richContentReadyMessageIds[index]);
    }
    readyIds.push(messageId);
    this.richContentReadyMessageIds = readyIds;
  }

  private clearRichContentRenderTimer(): void {
    if (this.richContentRenderTimer >= 0) {
      clearTimeout(this.richContentRenderTimer);
      this.richContentRenderTimer = -1;
    }
    this.richContentPendingMessageIds = [];
  }

  private loadOnboardingRichContentIconDataUrl(): void {
    if (this.onboardingRichContentIconLoadRequested || this.onboardingRichContentImageDataUrl.length > 0) {
      return;
    }
    this.onboardingRichContentIconLoadRequested = true;
    const hostContext = this.getUIContext().getHostContext();
    if (hostContext === undefined) {
      return;
    }
    try {
      const startIconResource: Resource = $r('app.media.startIcon');
      const base64Text: string = hostContext.resourceManager.getMediaContentBase64Sync(startIconResource.id);
      this.onboardingRichContentImageDataUrl = this.normalizedOnboardingImageDataUrl(base64Text);
    } catch (error) {
      logger.warn(TAG, 'load onboarding rich content icon failed: ' + this.errorToString(error));
    }
  }

  private normalizedOnboardingImageDataUrl(base64Text: string): string {
    const trimmed = base64Text.trim();
    if (trimmed.length === 0) {
      return '';
    }
    if (trimmed.toLowerCase().startsWith('data:image/')) {
      return trimmed;
    }
    return 'data:image/png;base64,' + trimmed;
  }

  private scheduleOnboardingRichContentRender(): void {
    if (this.onboardingRichContentReady || this.onboardingRichContentRenderTimer >= 0) {
      return;
    }
    this.onboardingRichContentRenderTimer = setTimeout((): void => {
      this.onboardingRichContentRenderTimer = -1;
      this.onboardingRichContentReady = true;
      this.onboardingRichContentProbeStage = AGENT_HOME_ONBOARDING_PROBE_NATIVE_STAGE;
      this.scheduleOnboardingRichContentProbeAdvance();
    }, AGENT_HOME_ONBOARDING_RICH_RENDER_DELAY_MS);
  }

  private clearOnboardingRichContentRenderTimer(): void {
    if (this.onboardingRichContentRenderTimer >= 0) {
      clearTimeout(this.onboardingRichContentRenderTimer);
      this.onboardingRichContentRenderTimer = -1;
    }
  }

  private scheduleOnboardingRichContentProbeAdvance(): void {
    if (!this.onboardingRichContentReady || this.onboardingRichContentProbeTimer >= 0) {
      return;
    }
    if (this.onboardingRichContentProbeStage >= AGENT_HOME_ONBOARDING_PROBE_MARKDOWN_STAGE) {
      return;
    }
    this.onboardingRichContentProbeTimer = setTimeout((): void => {
      this.onboardingRichContentProbeTimer = -1;
      if (!this.onboardingRichContentReady) {
        return;
      }
      if (this.onboardingRichContentProbeStage < AGENT_HOME_ONBOARDING_PROBE_MARKDOWN_STAGE) {
        this.onboardingRichContentProbeStage = this.onboardingRichContentProbeStage + 1;
        this.scheduleOnboardingRichContentProbeAdvance();
      }
    }, AGENT_HOME_ONBOARDING_PROBE_ADVANCE_DELAY_MS);
  }

  private clearOnboardingRichContentProbeTimer(): void {
    if (this.onboardingRichContentProbeTimer >= 0) {
      clearTimeout(this.onboardingRichContentProbeTimer);
      this.onboardingRichContentProbeTimer = -1;
    }
  }

  private onboardingWebProbeHtml(label: ResourceStr): string {
    const text = resolveResourceString(
      this.getUIContext().getHostContext(),
      label
    );
    return '<p><strong>WebView OK</strong><br>' + text + '</p>';
  }

  private onboardingMarkdownDemoContent(): string {
    const template = resolveResourceString(
      this.getUIContext().getHostContext(),
      $r('app.string.agent_home_onboarding_md_demo_content')
    );
    return template.split('{{startIcon}}').join(this.onboardingRichContentImageDataUrl);
  }

  private richContentLoadingPreviewText(text: string): string {
    const normalized = text.trim();
    if (normalized.length <= 360) {
      return normalized;
    }
    return normalized.substring(0, 360) + '...';
  }

  @Builder
  private buildRichInlineText(text: string, fontSize: number, lineHeight: number, fontColor: ResourceColor): void {
    if (this.hasClickableRichInlineRun(text)) {
      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.richInlineRunsForText(text), (run: AgentHomeRichInlineRun) => {
          this.buildRichInlineRunText(run, fontSize, lineHeight, fontColor)
        }, (run: AgentHomeRichInlineRun): string => run.id)
      }
      .width('100%')
    } else {
      Text() {
        ForEach(this.richInlineRunsForText(text), (run: AgentHomeRichInlineRun) => {
          this.buildRichInlineRun(run, fontSize, lineHeight, fontColor)
        }, (run: AgentHomeRichInlineRun): string => run.id)
      }
      .width('100%')
      .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
      .copyOption(CopyOptions.LocalDevice)
    }
  }

  @Builder
  private buildRichInlineRunText(
    run: AgentHomeRichInlineRun,
    fontSize: number,
    lineHeight: number,
    fontColor: ResourceColor
  ): void {
    if (run.kind === AgentHomeRichInlineKind.LINK) {
      Text(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.tag_blue'))
        .decoration({ type: TextDecorationType.Underline, color: $r('app.color.tag_blue') })
        .onClick((): void => {
          this.handleAssistantAnswerLinkClick(run.target);
        })
    } else if (run.kind === AgentHomeRichInlineKind.CODE) {
      Text(run.text)
        .fontSize(fontSize - 1)
        .lineHeight(lineHeight)
        .fontFamily('monospace')
        .fontColor(this.inlineCodeTextColor())
        .backgroundColor(this.inlineCodeTextBackgroundColor())
        .borderRadius(6)
        .padding({ left: 3, right: 3 })
    } else if (run.kind === AgentHomeRichInlineKind.STRONG) {
      Text(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontWeight(FontWeight.Medium)
        .fontColor(fontColor)
    } else if (run.kind === AgentHomeRichInlineKind.EMPHASIS) {
      Text(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontStyle(FontStyle.Italic)
        .fontColor(fontColor)
    } else {
      Text(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontColor(fontColor)
    }
  }

  @Builder
  private buildRichInlineRun(
    run: AgentHomeRichInlineRun,
    fontSize: number,
    lineHeight: number,
    fontColor: ResourceColor
  ): void {
    if (run.kind === AgentHomeRichInlineKind.CODE) {
      Span(run.text)
        .fontSize(fontSize - 1)
        .lineHeight(lineHeight)
        .fontFamily('monospace')
        .fontColor(this.inlineCodeTextColor())
        .textBackgroundStyle(this.inlineCodeTextBackgroundStyle())
    } else if (run.kind === AgentHomeRichInlineKind.STRONG) {
      Span(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontWeight(FontWeight.Medium)
        .fontColor(fontColor)
    } else if (run.kind === AgentHomeRichInlineKind.EMPHASIS) {
      Span(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontStyle(FontStyle.Italic)
        .fontColor(fontColor)
    } else if (run.kind === AgentHomeRichInlineKind.LINK) {
      Span(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.tag_blue'))
        .decoration({ type: TextDecorationType.Underline, color: $r('app.color.tag_blue') })
    } else {
      Span(run.text)
        .fontSize(fontSize)
        .lineHeight(lineHeight)
        .fontColor(fontColor)
    }
  }

  @Builder
  private buildAssistantReasoningBlock(item: AgentHomeChatItem): void {
    Column({ space: 4 }) {
      Row({ space: 8 }) {
        Text($r('app.string.agent_home_thinking_label'))
          .fontSize(11)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
        Blank()
        Text(this.isReasoningExpanded(item.id) ? $r('app.string.agent_home_thinking_collapse') : $r('app.string.agent_home_thinking_expand'))
          .fontSize(11)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
      }
      .width('100%')
      .height(18)

      Text(item.reasoningText)
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .maxLines(this.reasoningMaxLines(item.id))
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
        .copyOption(CopyOptions.LocalDevice)
    }
    .width('100%')
    .padding({ left: 2, right: 2, top: 2, bottom: 2 })
    .onClick((): void => {
      this.toggleReasoningExpansion(item.id);
    })
  }

  @Builder
  private buildUserMessage(item: AgentHomeChatItem): void {
    Row() {
      Blank()
      Column({ space: 10 }) {
        if (this.messageAttachmentItems(item.id, item.text).length > 0) {
          this.buildMessageAttachmentGroup(item.id, this.messageAttachmentItems(item.id, item.text), true)
        }
        if (this.messageAttachmentBodyText(item.id, item.text).length > 0) {
          Text(this.messageAttachmentBodyText(item.id, item.text))
            .fontSize(17)
            .lineHeight(26)
            .fontColor($r('app.color.text_white'))
            .width('100%')
            .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
            .copyOption(CopyOptions.LocalDevice)
        }
        this.buildMessageRevertAction(item, true)
      }
      .width('86%')
      .padding({ left: 15, right: 15, top: 12, bottom: 12 })
      .backgroundColor(this.agentHomeSolidControlBackgroundColor())
      .borderRadius(18)
    }
    .width('100%')
  }

  @Builder
  private buildMessageRevertAction(item: AgentHomeChatItem, onDark: boolean): void {
    if (this.canRevertToMessage(item)) {
      Row() {
        Blank()
        Button() {
          SymbolGlyph($r('sys.symbol.undo'))
            .fontSize(15)
            .fontColor([onDark ? $r('app.color.text_white') : $r('app.color.text_body')])
        }
          .width(30)
          .height(30)
          .backgroundColor(onDark ? '#22FFFFFF' : $r('app.color.background_secondary'))
          .borderRadius(15)
          .onClick((): void => {
            this.confirmRevertToMessage(item);
          })
      }
      .width('100%')
      .padding({ top: 8 })
    }
  }

  @Builder
  private buildStatusMessage(item: AgentHomeChatItem): void {
    Row({ space: 8 }) {
      SymbolGlyph(item.role === AgentHomeMessageRole.TOOL ? $r('sys.symbol.slider_horizontal_2') : $r('sys.symbol.info_circle'))
        .fontSize(17)
        .fontColor([this.agentHomeReadableSecondaryColor()])
      Text(item.text)
        .fontSize(14)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .layoutWeight(1)
        .maxLines(3)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 4, right: 4 })
    .onClick((): void => {
      this.openSheet(AgentHomeSheetKey.SESSION_DETAILS);
    })
  }

  @Builder
  private buildToolCallRow(item: AgentHomeToolCallItem): void {
    Row({ space: 8 }) {
      SymbolGlyph(this.symbolForCompactToolCall(item))
        .fontSize(13)
        .fontColor([this.colorForCompactToolCall(item)])
      Text(this.compactToolCallLine(item))
        .fontSize(13)
        .fontWeight(FontWeight.Regular)
        .fontColor(this.colorForCompactToolCallText(item))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
    }
    .width('100%')
    .height(26)
    .padding({ left: 2, right: 2 })
    .backgroundColor(Color.Transparent)
    .onClick((): void => {
      if (this.shouldDisplayToolCallAsPlan(item)) {
        this.openPlanFromToolCall(item);
        return;
      }
      this.activeToolCallId = item.id;
      this.openSheet(AgentHomeSheetKey.TOOL_DETAIL);
    })
  }

  @Builder
  private buildUserRequestRow(item: AgentHomeUserRequestItem): void {
    if (this.isPermissionRequest(item)) {
      this.buildPermissionRequestRow(item)
    } else {
      Row({ space: 10 }) {
        SymbolGlyph(this.symbolForInteractionStatus(item.status))
          .fontSize(18)
          .fontColor([this.colorForInteractionStatus(item.status)])
        Column({ space: 5 }) {
          Row({ space: 8 }) {
            Text(this.userRequestTitle(item))
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.agentHomeReadableTextColor())
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            this.buildAgentNameBadge(item.agentName)
            Text(this.displayInteractionStatus(item.status))
              .fontSize(11)
              .fontColor(this.colorForInteractionStatus(item.status))
              .maxLines(1)
          }
          .width('100%')

          Text(item.prompt.length > 0 ? item.prompt : item.rawJson)
            .width('100%')
            .fontSize(12)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

        if (item.status === AgentHomeInteractionStatus.PENDING) {
          Button($r('app.string.agent_home_request_submit'))
            .height(32)
            .padding({ left: 12, right: 12 })
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.agentHomeSolidControlBackgroundColor())
            .borderRadius(16)
            .buttonStyle(ButtonStyleMode.NORMAL)
            .onClick((): void => {
              this.openUserRequestSheet(item);
            })
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
      .padding({ left: 2, right: 2, top: 4, bottom: 4 })
      .backgroundColor(Color.Transparent)
      .onClick((): void => {
        this.openUserRequestSheet(item);
      })
    }
  }

  @Builder
  private buildPermissionRequestRow(item: AgentHomeUserRequestItem): void {
    this.buildPermissionRequestRowContent(
      item,
      NGFHdsEffectPresetFactory.buildFlowLightSurfacePreset(this.isPendingPermissionRequest(item)),
      NGFHdsEffectPresetFactory.buildFlowLightScenePreset(this.isPendingPermissionRequest(item))
    )
  }

  @Builder
  private buildPermissionRequestRowContent(
    item: AgentHomeUserRequestItem,
    surfacePreset: NGFHdsInteractiveEffectPreset,
    scenePreset: NGFHdsSceneFlowPreset
  ): void {
    Stack({ alignContent: Alignment.Center }) {
      if (this.isPendingPermissionRequest(item)) {
        HdsVisualComponent()
          .width('100%')
          .height('100%')
          .borderRadius(18)
          .opacity(scenePreset.visualOpacity)
          .hitTestBehavior(HitTestMode.None)
          .scene(
            HdsSceneType.DUAL_EDGE_FLOW_LIGHT_WITH_BACKGROUND_MASK,
            this.permissionRequestFlowLightController,
            (): void => {
              this.handlePermissionRequestFlowLightFinished();
            },
            scenePreset.frameRateRange
          )
      }

      Row({ space: 10 }) {
        Stack({ alignContent: Alignment.Center }) {
          SymbolGlyph($r('sys.symbol.security_shield'))
            .fontSize(21)
            .fontColor([this.permissionRequestAccentColor(item)])
        }
        .width(38)
        .height(38)
        .borderRadius(19)
        .backgroundColor(this.permissionRequestIconBackgroundColor(item))

        Column({ space: 5 }) {
          Row({ space: 8 }) {
            Text(this.userRequestTitle(item))
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.agentHomeReadableTextColor())
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            this.buildAgentNameBadge(item.agentName)
            Text(this.displayInteractionStatus(item.status))
              .fontSize(11)
              .fontColor(this.permissionRequestAccentColor(item))
              .maxLines(1)
          }
          .width('100%')

          Text(item.prompt.length > 0 ? item.prompt : this.permissionRawDisplayText(item.rawJson))
            .width('100%')
            .fontSize(12)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

        if (this.isPendingPermissionRequest(item)) {
          Button($r('app.string.agent_home_permission_allow_once'))
            .height(34)
            .padding({ left: 12, right: 12 })
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.permissionAllowButtonBackgroundColor(item))
            .borderRadius(17)
            .buttonStyle(ButtonStyleMode.NORMAL)
            .onClick((): void => {
              this.allowPermissionOnceFromRow(item);
            })
        } else {
          Row({ space: 5 }) {
            SymbolGlyph(this.symbolForInteractionStatus(item.status))
              .fontSize(13)
              .fontColor([this.permissionRequestAccentColor(item)])
            Text(this.displayInteractionStatus(item.status))
              .fontSize(11)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.permissionRequestAccentColor(item))
              .maxLines(1)
          }
          .height(30)
          .padding({ left: 9, right: 9 })
          .borderRadius(15)
          .backgroundColor(this.permissionRequestIconBackgroundColor(item))
          .border({ width: 1, color: this.permissionRequestAccentColor(item) })
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
      .padding({ left: 12, right: 12, top: 10, bottom: 10 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(surfacePreset.backgroundEffect)
      .border({
        width: surfacePreset.borderWidth,
        color: this.permissionRequestBorderColor(item, surfacePreset)
      })
      .borderRadius(18)
      .shadow(surfacePreset.shadowOptions)
      .visualEffect(surfacePreset.buildVisualEffect())
      .scale(surfacePreset.scaleOptions)
      .translate(surfacePreset.translateOptions)
      .opacity(surfacePreset.contentOpacity)
    }
    .width('100%')
    .height(86)
    .padding({ left: 2, right: 2, top: 4, bottom: 4 })
    .clip(true)
    .onClick((): void => {
      this.openUserRequestSheet(item);
    })
  }

  @Builder
  private buildPlanRow(item: AgentHomePlanItem): void {
    Column({ space: 10 }) {
      Row({ space: 10 }) {
        SymbolGlyph($r('sys.symbol.route_plan'))
          .fontSize(18)
          .fontColor([this.colorForInteractionStatus(item.status)])
        Column({ space: 3 }) {
          Row({ space: 8 }) {
            Text(this.planTitle(item))
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.agentHomeReadableTextColor())
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            this.buildAgentNameBadge(item.agentName)
          }
          .width('100%')
          Text(this.displayInteractionStatus(item.status))
            .fontSize(11)
            .fontColor(this.colorForInteractionStatus(item.status))
        }
        .layoutWeight(1)

      }
      .width('100%')

      if (this.planStepsForItem(item).length > 0) {
        Column({ space: 7 }) {
          this.buildPlanProgressTitle(true)
          ForEach(this.visiblePlanStepsForItem(item, 4), (step: AgentHomePlanStep) => {
            this.buildPlanStepRow(step, true)
          }, (step: AgentHomePlanStep): string => step.id)
        }
        .width('100%')
      } else {
        Text(this.planFallbackDisplayContent(item.content))
          .width('100%')
          .fontSize(12)
          .lineHeight(18)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(6)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }

      if (item.status === AgentHomeInteractionStatus.PENDING) {
        Row({ space: 8 }) {
          Button($r('app.string.agent_home_plan_reject'))
            .height(30)
            .fontSize(12)
            .borderRadius(8)
            .fontColor($r('app.color.text_body'))
            .backgroundColor(Color.Transparent)
            .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
            .border({
              width: this.agentHomeSurfaceBorderWidth(),
              color: this.agentHomeSurfaceBorderColor()
            })
            .visualEffect(this.agentHomeSurfaceVisualEffect())
            .clip(true)
            .onClick((): void => {
              this.respondToPlan(item, AgentHomeInteractionStatus.REJECTED);
            })
          Button($r('app.string.agent_home_plan_implement'))
            .height(30)
            .fontSize(12)
            .borderRadius(8)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.agentHomeSolidControlBackgroundColor())
            .onClick((): void => {
              this.respondToPlan(item, AgentHomeInteractionStatus.IMPLEMENTING);
            })
        }
        .width('100%')
      }
    }
    .width('100%')
    .padding({ left: 2, right: 2, top: 4, bottom: 4 })
    .backgroundColor(Color.Transparent)
    .onClick((): void => {
      this.activePlanId = item.id;
      this.openSheet(AgentHomeSheetKey.PLAN_DETAIL);
    })
  }

  @Builder
  private buildTransientStatusTicker(): void {
    if (this.transientStatusVisible) {
      Row({ space: 8 }) {
        Circle()
          .width(7)
          .height(7)
          .fill(this.resolveComposerStatusColor())
        Text(this.transientStatusText)
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .height(32)
      .padding({ left: 14, right: 14 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
      .border({
        width: this.buildAgentHomeSurfacePreset().borderWidth,
        color: this.buildAgentHomeSurfacePreset().borderColor
      })
      .borderRadius(16)
      .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
      .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
      .margin({ left: 18, right: 18, top: 4, bottom: 0 })
      .opacity(this.transientStatusOpacity)
      .clip(true)
    }
  }

  @Builder
  private buildComposer(): void {
    Column({ space: 8 }) {
      this.buildComposerTopExtras()
      this.buildComposerFloatingControls()

      if (this.shouldShowDisconnectedComposerState()) {
        this.buildDisconnectedComposerSurface()
      } else {
        Stack({ alignContent: Alignment.BottomStart }) {
          Column() {
            this.buildExpandedComposerSurface()
          }
          .width('100%')
          .height(this.composerExpandedPanelHeight())
          .opacity(this.composerExpandedSurfaceOpacity())
          .translate({ y: this.composerExpandedTranslateY() })
          .hitTestBehavior(this.shouldUseExpandedComposerHitTest() ? HitTestMode.Transparent : HitTestMode.BLOCK_DESCENDANTS)

          Column() {
            this.buildCompactComposerSurface()
          }
          .width('100%')
          .opacity(this.composerCompactSurfaceOpacity())
          .scale({
            x: this.composerCompactSurfaceScale(),
            y: this.composerCompactSurfaceScale()
          })
          .translate({ y: this.composerCompactTranslateY() })
          .hitTestBehavior(this.shouldUseCompactComposerHitTest() ? HitTestMode.Transparent : HitTestMode.BLOCK_DESCENDANTS)

          this.buildComposerDragHandle()
        }
        .width('100%')
        .height(this.composerInteractivePanelHeight())
        .clip(true)
      }
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 6, bottom: this.bottomInsetVp + 8 })
    .backgroundColor(Color.Transparent)
  }

  @Builder
  private buildComposerFloatingControls(): void {
    if (this.shouldShowComposerPlanPanel() || this.showConversationBottomButton) {
      Column({ space: 6 }) {
        if (this.shouldShowComposerPlanPanel() && this.isComposerPlanPanelExpanded) {
          this.buildComposerPlanExpandedPanel()
        }

        Row({ space: 8 }) {
          if (this.shouldShowComposerPlanPanel()) {
            this.buildComposerPlanSummaryPill()
          } else {
            Blank()
          }
          Blank()
          if (this.showConversationBottomButton) {
            this.buildConversationBottomIconButton()
          }
        }
        .width('100%')
        .height(34)
        .alignItems(VerticalAlign.Center)
      }
      .width('100%')
    }
  }

  @Builder
  private buildComposerPlanExpandedPanel(): void {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.route_plan'))
          .fontSize(14)
          .fontColor([this.colorForInteractionStatus(this.composerPlanStatus())])
        Text(this.composerPlanTitle())
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.displayInteractionStatus(this.composerPlanStatus()))
          .fontSize(11)
          .fontColor(this.colorForInteractionStatus(this.composerPlanStatus()))
          .maxLines(1)
      }
      .width('100%')

      if (this.composerPlanSteps().length > 0) {
        Column({ space: 7 }) {
          this.buildPlanProgressTitle(true)
          ForEach(this.visibleComposerPlanSteps(4), (step: AgentHomePlanStep) => {
            this.buildPlanStepRow(step, true)
          }, (step: AgentHomePlanStep): string => step.id)
        }
        .width('100%')
      } else {
        Text(this.planFallbackDisplayContent(this.composerPlanContent()))
          .width('100%')
          .fontSize(12)
          .lineHeight(18)
          .fontColor(this.agentHomeReadableMutedColor())
          .maxLines(5)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
          .copyOption(CopyOptions.LocalDevice)
      }
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
  }

  @Builder
  private buildComposerPlanSummaryPill(): void {
    Row({ space: 7 }) {
      SymbolGlyph($r('sys.symbol.route_plan'))
        .fontSize(13)
        .fontColor([this.colorForInteractionStatus(this.composerPlanStatus())])
      Text(this.composerPlanSummaryText())
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableTextColor())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
      SymbolGlyph(this.isComposerPlanPanelExpanded ? $r('sys.symbol.chevron_down') : $r('sys.symbol.chevron_up'))
        .fontSize(12)
        .fontColor([this.agentHomeReadableMutedColor()])
    }
    .width('78%')
    .height(28)
    .padding({ left: 10, right: 9 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(14)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
    .onClick((): void => {
      this.toggleComposerPlanPanel();
    })
  }

  @Builder
  private buildConversationBottomIconButton(): void {
    Button() {
      SymbolGlyph($r('sys.symbol.arrow_down'))
        .fontSize(16)
        .fontColor([this.agentHomeControlIconColor(false)])
    }
    .width(34)
    .height(34)
    .borderRadius(17)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
    .onClick((): void => {
      this.scrollConversationToBottom(true);
    })
  }

  @Builder
  private buildComposerTopExtras(): void {
    if (this.shouldShowDisconnectedComposerState()) {
      if (this.shouldShowAgentFilterBar()) {
        this.buildAgentFilterBar()
      }
    } else {
      if (this.attachments.length > 0) {
        this.buildComposerAttachments()
      }

      if (this.shouldShowSlashCommandMenu()) {
        this.buildSlashCommandMenu()
      }

      if (this.shouldShowAgentFilterBar()) {
        this.buildAgentFilterBar()
      }
    }
  }

  @Builder
  private buildExpandedComposerSurface(): void {
    Column({ space: 10 }) {
      Column({ space: 10 }) {
        TextInput({ placeholder: $r('app.string.agent_home_message_placeholder'), text: this.draftText })
          .width('100%')
          .height(48)
          .fontSize(18)
          .fontColor(this.agentHomeReadableTextColor())
          .placeholderColor(this.agentHomeReadableMutedColor())
          .backgroundColor(Color.Transparent)
          .onChange((value: string): void => {
            this.draftText = value;
          })

        if (this.shouldShowRunModeControls()) {
          this.buildRunModeControls()
        }

        Row({ space: 10 }) {
          this.buildComposerModelButton()
          this.buildComposerMaterialIconButton($r('sys.symbol.slider_horizontal_2'), AgentHomeActionKey.OPEN_RUNTIME, false)
          if (this.shouldShowPermissionModeButton()) {
            this.buildComposerPermissionModeButton()
          }
          Blank()
          if (this.isReplyInProgress()) {
            this.buildStopReplyButton()
          } else {
            this.buildComposerMaterialIconButton($r('sys.symbol.paperplane_right_fill'), AgentHomeActionKey.SEND_MESSAGE, true)
          }
        }
        .width('100%')
        .height(40)
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 10, bottom: 10 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
      .border({
        width: this.buildAgentHomeSurfacePreset().borderWidth,
        color: this.buildAgentHomeSurfacePreset().borderColor
      })
      .borderRadius(22)
      .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
      .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
      .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
      .translate(this.buildAgentHomeSurfacePreset().translateOptions)

      this.buildComposerStatusStrip()
    }
    .width('100%')
  }

  @Builder
  private buildCompactComposerSurface(): void {
    Stack({ alignContent: Alignment.Center }) {
      Row({ space: 8 }) {
        this.buildCompactComposerIconButton($r('sys.symbol.plus'), AgentHomeActionKey.PICK_ATTACHMENT, false)
        TextInput({ placeholder: $r('app.string.agent_home_message_placeholder'), text: this.draftText })
          .layoutWeight(1)
          .height(46)
          .fontSize(17)
          .fontColor(this.agentHomeReadableTextColor())
          .placeholderColor(this.agentHomeReadableMutedColor())
          .backgroundColor(Color.Transparent)
          .onChange((value: string): void => {
            this.draftText = value;
          })
          .onSubmit((): void => {
            this.handleSendMessage();
          })
        if (this.isReplyInProgress()) {
          this.buildStopReplyButton()
        } else {
          this.buildCompactComposerIconButton($r('sys.symbol.paperplane_right_fill'), AgentHomeActionKey.SEND_MESSAGE, true)
        }
      }
      .width('100%')
      .height('100%')
      .padding({ left: 8, right: 8 })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(this.composerCompactPanelHeight())
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.compactComposerBorderWidth(),
      color: this.compactComposerBorderColor()
    })
    .borderRadius(32)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
  }

  @Builder
  private buildDisconnectedComposerSurface(): void {
    Stack({ alignContent: Alignment.Center }) {
      Row({ space: 8 }) {
        Stack({ alignContent: Alignment.Center }) {
          SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
            .fontSize(22)
            .fontColor([$r('app.color.tag_amber')])
        }
        .width(42)
        .height(42)
        .borderRadius(21)

        Text(this.disconnectedComposerReasonText())
          .layoutWeight(1)
          .height(46)
          .fontSize(17)
          .fontColor(this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Button() {
          SymbolGlyph($r('sys.symbol.arrow_clockwise'))
            .fontSize(22)
            .fontColor([this.canReconnectBridgeFromComposer() ? this.agentHomeControlIconColor(true) : this.agentHomeReadableMutedColor()])
        }
        .width(42)
        .height(42)
        .borderRadius(21)
        .backgroundColor(Color.Transparent)
        .buttonStyle(ButtonStyleMode.NORMAL)
        .enabled(this.canReconnectBridgeFromComposer())
        .onClick((): void => {
          this.handleComposerReconnect();
        })
      }
      .width('100%')
      .height('100%')
      .padding({ left: 8, right: 8 })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(this.composerCompactPanelHeight())
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.compactComposerBorderWidth(),
      color: this.compactComposerBorderColor()
    })
    .borderRadius(32)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
  }

  @Builder
  private buildComposerDragHandle(): void {
    Row() {
      Blank()
    }
    .width('100%')
    .height(24)
    .position({ x: 0, y: 0 })
    .hitTestBehavior(HitTestMode.Transparent)
    .gesture(
      PanGesture({ fingers: 1, direction: PanDirection.Vertical, distance: 4 })
        .onActionStart((event: GestureEvent): void => {
          this.handleComposerPanStart(event);
        })
        .onActionUpdate((event: GestureEvent): void => {
          this.handleComposerPanUpdate(event);
        })
        .onActionEnd((event: GestureEvent): void => {
          this.handleComposerPanEnd(event);
        })
        .onActionCancel((event: GestureEvent): void => {
          this.handleComposerPanCancel(event);
        })
    )
  }

  private clampComposerProgress(value: number): number {
    if (value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  private composerCompactPanelHeight(): number {
    return 64;
  }

  private composerExpandedPanelHeight(): number {
    let height = AGENT_HOME_BASE_COMPOSER_HEIGHT;
    if (this.shouldShowRunModeControls()) {
      height = height + this.runModeControlsReservedHeight();
    }
    return height;
  }

  private runModeControlsReservedHeight(): number {
    const controlsHeight = this.runModeControlsHeight();
    if (controlsHeight <= 0) {
      return 0;
    }
    return controlsHeight + 10;
  }

  private runModeControlsHeight(): number {
    const rowCount = this.interactionModeControlRowCount();
    if (rowCount <= 0) {
      return 0;
    }
    return rowCount * 32 + (rowCount - 1) * 6;
  }

  private interactionModeControlRowCount(): number {
    let count = 0;
    if (this.hasInteractionModesInCategory('run')) {
      count = count + 1;
    }
    return count;
  }

  private composerInteractivePanelHeight(): number {
    const progress = this.clampComposerProgress(this.composerExpansionProgress);
    return this.composerCompactPanelHeight() +
      (this.composerExpandedPanelHeight() - this.composerCompactPanelHeight()) * progress;
  }

  private composerExpandedSurfaceOpacity(): number {
    const progress = this.clampComposerProgress(this.composerExpansionProgress);
    if (progress <= 0.08) {
      return 0;
    }
    return this.clampComposerProgress((progress - 0.08) / 0.72);
  }

  private composerExpandedTranslateY(): number {
    return (1 - this.clampComposerProgress(this.composerExpansionProgress)) * 18;
  }

  private shouldUseExpandedComposerHitTest(): boolean {
    return this.clampComposerProgress(this.composerExpansionProgress) >= 0.56;
  }

  private composerCompactSurfaceOpacity(): number {
    const progress = this.clampComposerProgress(this.composerExpansionProgress);
    if (progress >= 0.92) {
      return 0;
    }
    return this.clampComposerProgress(1 - progress * 1.08);
  }

  private composerCompactSurfaceScale(): number {
    return 1 - this.clampComposerProgress(this.composerExpansionProgress) * 0.035;
  }

  private composerCompactTranslateY(): number {
    return -this.clampComposerProgress(this.composerExpansionProgress) * 8;
  }

  private shouldUseCompactComposerHitTest(): boolean {
    return this.clampComposerProgress(this.composerExpansionProgress) < 0.56;
  }

  @Builder
  private buildCompactComposer(): void {
    Column({ space: 8 }) {
      if (this.attachments.length > 0) {
        this.buildComposerAttachments()
      }

      if (this.shouldShowSlashCommandMenu()) {
        this.buildSlashCommandMenu()
      }

      if (this.shouldShowAgentFilterBar()) {
        this.buildAgentFilterBar()
      }

      Column({ space: 0 }) {
        Row() {
          Blank()
        }
        .width('100%')
        .height(12)
        .gesture(
          PanGesture({ fingers: 1, direction: PanDirection.Up, distance: 6 })
            .onActionEnd((_event: GestureEvent): void => {
              this.expandComposerFromCompact();
            })
        )

        Row({ space: 8 }) {
          this.buildCompactComposerIconButton($r('sys.symbol.plus'), AgentHomeActionKey.PICK_ATTACHMENT, false)
          TextInput({ placeholder: $r('app.string.agent_home_message_placeholder'), text: this.draftText })
            .layoutWeight(1)
            .height(44)
            .fontSize(17)
            .fontColor(this.agentHomeReadableTextColor())
            .placeholderColor(this.agentHomeReadableMutedColor())
            .backgroundColor(Color.Transparent)
            .onChange((value: string): void => {
              this.draftText = value;
            })
            .onSubmit((): void => {
              this.handleSendMessage();
            })
          if (this.isReplyInProgress()) {
            this.buildStopReplyButton()
          } else {
            this.buildCompactComposerIconButton($r('sys.symbol.paperplane_right_fill'), AgentHomeActionKey.SEND_MESSAGE, true)
          }
        }
        .width('100%')
        .height(52)
        .padding({ left: 8, right: 8, bottom: 4 })
      }
      .width('100%')
      .height(64)
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.compactComposerBorderWidth(),
        color: this.compactComposerBorderColor()
      })
      .borderRadius(32)
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .scale(this.agentHomeSurfaceScaleOptions())
      .translate(this.agentHomeSurfaceTranslateOptions())
      .clip(true)
      .animation({ duration: 180, curve: Curve.EaseOut })
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 6, bottom: this.bottomInsetVp + 8 })
    .backgroundColor(Color.Transparent)
    .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })))
  }

  @Builder
  private buildFullComposer(): void {
    Column({ space: 10 }) {
      Column({ space: 10 }) {
        if (this.attachments.length > 0) {
          this.buildComposerAttachments()
        }

        if (this.shouldShowSlashCommandMenu()) {
          this.buildSlashCommandMenu()
        }

        if (this.shouldShowAgentFilterBar()) {
          this.buildAgentFilterBar()
        }

        TextInput({ placeholder: $r('app.string.agent_home_message_placeholder'), text: this.draftText })
          .width('100%')
          .height(48)
          .fontSize(18)
          .fontColor(this.agentHomeReadableTextColor())
          .placeholderColor(this.agentHomeReadableMutedColor())
          .backgroundColor(Color.Transparent)
          .onChange((value: string): void => {
            this.draftText = value;
          })

        if (this.shouldShowRunModeControls()) {
          this.buildRunModeControls()
        }

        Row({ space: 10 }) {
          this.buildComposerModelButton()
          this.buildComposerMaterialIconButton($r('sys.symbol.slider_horizontal_2'), AgentHomeActionKey.OPEN_RUNTIME, false)
          if (this.shouldShowPermissionModeButton()) {
            this.buildComposerPermissionModeButton()
          }
          Blank()
          if (this.isReplyInProgress()) {
            this.buildStopReplyButton()
          } else {
            this.buildComposerMaterialIconButton($r('sys.symbol.paperplane_right_fill'), AgentHomeActionKey.SEND_MESSAGE, true)
          }
        }
        .width('100%')
        .height(40)
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 10, bottom: 10 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
      .border({
        width: this.buildAgentHomeSurfacePreset().borderWidth,
        color: this.buildAgentHomeSurfacePreset().borderColor
      })
      .borderRadius(22)
      .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
      .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
      .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
      .translate(this.buildAgentHomeSurfacePreset().translateOptions)

      this.buildComposerStatusStrip()
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 8, bottom: this.bottomInsetVp + 8 })
    .backgroundColor(Color.Transparent)
    .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })))
  }

  @Builder
  private buildCompactComposerIconButton(symbol: Resource, actionKey: string, emphasized: boolean): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(22)
        .fontColor([this.agentHomeControlIconColor(emphasized)])
    }
    .width(42)
    .height(42)
    .borderRadius(21)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .onClick((): void => {
      this.handleAction(actionKey);
    })
  }

  @Builder
  private buildSlashCommandMenu(): void {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Text($r('app.string.agent_home_slash_commands_title'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.currentProviderOption().displayName)
          .fontSize(11)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')

      if (this.currentSlashCommands().length === 0) {
        Text($r('app.string.agent_home_slash_commands_empty'))
          .width('100%')
          .height(54)
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .textAlign(TextAlign.Center)
      } else if (this.filteredSlashCommands().length === 0) {
        Text($r('app.string.agent_home_slash_commands_no_match'))
          .width('100%')
          .height(54)
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .textAlign(TextAlign.Center)
      } else {
        Scroll() {
          Column({ space: 6 }) {
            ForEach(this.filteredSlashCommands(), (item: AgentHomeSlashCommandOption) => {
              this.buildSlashCommandRow(item)
            }, (item: AgentHomeSlashCommandOption): string => item.providerId + '_' + item.command)
          }
          .width('100%')
        }
        .width('100%')
        .height(this.slashCommandMenuHeight())
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }
    }
    .width('100%')
    .padding(10)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .borderRadius(14)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
  }

  @Builder
  private buildRunModeControls(): void {
    Column({ space: 6 }) {
      if (this.hasInteractionModesInCategory('run')) {
        this.buildInteractionModeControlRow('run')
      }
    }
    .width('100%')
  }

  @Builder
  private buildInteractionModeControlRow(category: string): void {
    Scroll() {
      Row({ space: 6 }) {
        ForEach(this.currentProviderInteractionModesForCategory(category), (item: AgentBridgeInteractionModeOption) => {
          this.buildRunModePill(item)
        }, (item: AgentBridgeInteractionModeOption): string => item.id)
        Blank()
      }
      .height(32)
      .padding({ right: 2 })
    }
    .width('100%')
    .height(32)
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
  }

  @Builder
  private buildRunModePill(mode: AgentBridgeInteractionModeOption): void {
    Row({ space: 5 }) {
      SymbolGlyph(this.symbolForInteractionMode(mode.id))
        .fontSize(13)
        .fontColor([this.agentHomeControlIconColor(this.isInteractionModeSelected(mode.id))])
      Text(mode.displayName)
        .fontSize(12)
        .fontWeight(this.isInteractionModeSelected(mode.id) ? FontWeight.Medium : FontWeight.Regular)
        .fontColor(this.agentHomeControlTextColor(this.isInteractionModeSelected(mode.id)))
        .maxLines(1)
    }
    .height(28)
    .padding({ left: 10, right: 10 })
    .backgroundColor(this.runModePillBackgroundColor(this.isInteractionModeSelected(mode.id)))
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.runModePillBorderWidth(this.isInteractionModeSelected(mode.id)),
      color: this.runModePillBorderColor(this.isInteractionModeSelected(mode.id))
    })
    .borderRadius(14)
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .onClick((): void => {
      this.toggleInteractionMode(mode.id);
    })
  }

  @Builder
  private buildSlashCommandRow(item: AgentHomeSlashCommandOption): void {
    Row({ space: 10 }) {
      Text(item.command)
        .width(100)
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableTextColor())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Column({ space: 2 }) {
        Text(this.slashCommandSourceText(item))
          .width('100%')
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
    }
    .width('100%')
    .height(48)
    .padding({ left: 8, right: 8 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .borderRadius(10)
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .onClick((): void => {
      this.applySlashCommand(item.command);
    })
  }

  @Builder
  private buildComposerAttachments(): void {
    Flex({ wrap: FlexWrap.Wrap }) {
      ForEach(this.attachments, (item: AgentHomeAttachmentItem) => {
        this.buildCompactAttachmentChip(item)
      }, (item: AgentHomeAttachmentItem): string => item.id)
    }
    .width('100%')
  }

  @Builder
  private buildComposerStatusStrip(): void {
    Column({ space: 5 }) {
      Row({ space: 7 }) {
        Circle()
          .width(8)
          .height(8)
          .fill(this.resolveComposerStatusColor())
        Text(this.buildComposerStatusText())
          .fontSize(11)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        SymbolGlyph($r('sys.symbol.chevron_right'))
          .fontSize(13)
          .fontColor([this.agentHomeReadableMutedColor()])
      }
      .width('100%')

      Progress({ value: this.resolveComposerProgressValue(), total: 100, type: ProgressType.Linear })
        .width('100%')
        .height(3)
        .color(this.resolveComposerStatusColor())
    }
    .width('100%')
    .padding({ left: 8, right: 8, top: 6, bottom: 5 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .borderRadius(10)
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .onClick((): void => {
      this.openSheet(AgentHomeSheetKey.SESSION_DETAILS);
    })
  }

  @Builder
  private buildCompactAttachmentChip(item: AgentHomeAttachmentItem): void {
    if (item.kind === AgentHomeAttachmentKind.IMAGE) {
      Stack({ alignContent: Alignment.TopEnd }) {
        Image(item.uri)
          .width(40)
          .height(40)
          .objectFit(ImageFit.Cover)
          .borderRadius(9)
        this.buildCompactAttachmentRemoveButton(item.id)
      }
      .width(44)
      .height(44)
      .margin({ right: 6, bottom: 6 })
    } else {
      Stack({ alignContent: Alignment.TopEnd }) {
        Column({ space: 1 }) {
          SymbolGlyph(this.resolveAttachmentSymbol(item))
            .fontSize(18)
            .fontColor([this.agentHomeReadableSecondaryColor()])
          Text(item.extensionName)
            .fontSize(8)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(1)
        }
        .width(40)
        .height(40)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
        .borderRadius(9)
        .border({
          width: this.buildAgentHomeSurfacePreset().borderWidth,
          color: this.buildAgentHomeSurfacePreset().borderColor
        })
        .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
        .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
        this.buildCompactAttachmentRemoveButton(item.id)
      }
      .width(44)
      .height(44)
      .margin({ right: 6, bottom: 6 })
    }
  }

  @Builder
  private buildCompactAttachmentRemoveButton(attachmentId: string): void {
    Button() {
      SymbolGlyph($r('sys.symbol.xmark'))
        .fontSize(10)
        .fontColor([this.agentHomeControlIconColor(false)])
    }
    .width(18)
    .height(18)
    .borderRadius(9)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .onClick((): void => {
      this.removeAttachment(attachmentId);
    })
  }

  @Builder
  private buildAttachmentDetailRow(item: AgentHomeAttachmentItem): void {
    Row({ space: 10 }) {
      if (item.kind === AgentHomeAttachmentKind.IMAGE) {
        Image(item.uri)
          .width(42)
          .height(42)
          .objectFit(ImageFit.Cover)
          .borderRadius(9)
      } else {
        SymbolGlyph(this.resolveAttachmentSymbol(item))
          .fontSize(22)
          .fontColor([this.agentHomeReadableSecondaryColor()])
      }
      Column({ space: 2 }) {
        Text(item.displayName)
          .fontSize(13)
          .fontColor(this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(item.extensionName)
          .fontSize(11)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(1)
      }
      .layoutWeight(1)
      this.buildAttachmentRemoveButton(item.id)
    }
    .width('100%')
    .height(54)
    .padding({ left: 10, right: 6 })
    .margin({ bottom: 8 })
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildAttachmentSheetAttachments(): void {
    Column({ space: 0 }) {
      ForEach(this.attachments, (item: AgentHomeAttachmentItem) => {
        this.buildAttachmentDetailRow(item)
      }, (item: AgentHomeAttachmentItem): string => item.id)
    }
    .width('100%')
  }

  @Builder
  private buildAttachmentRemoveButton(attachmentId: string): void {
    Button() {
      SymbolGlyph($r('sys.symbol.xmark'))
        .fontSize(14)
        .fontColor([$r('app.color.text_secondary')])
    }
    .width(24)
    .height(24)
    .borderRadius(12)
    .backgroundColor($r('app.color.panel_background'))
    .onClick((): void => {
      this.removeAttachment(attachmentId);
    })
  }

  @Builder
  private buildWorkspaceSheet(): void {
    this.buildWorkspacePage(false)
  }

  @Builder
  private buildWorkspaceTitleBarUnderlaySpacer(): void {
    Column() {
    }
    .width('100%')
    .height(this.agentHomeMainPageTitleBarSpacerHeight())
    .backgroundColor(this.workspaceTitleBarUnderlayColor())
    .hitTestBehavior(HitTestMode.None)
  }

  @Builder
  private buildWorkspacePage(avoidTitleBar: boolean): void {
    Column({ space: 0 }) {
      if (avoidTitleBar) {
        this.buildWorkspaceTitleBarUnderlaySpacer()
        this.buildMainWorkspaceArea()
        this.buildWorkspaceStatusFooter(false)
      } else {
        Column({ space: 0 }) {
          Row({ space: 12 }) {
            Column({ space: 2 }) {
              Text($r('app.string.agent_home_workspaces_title'))
                .fontSize(24)
                .fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_body'))
                .maxLines(1)
              Text($r('app.string.agent_home_workspaces_sheet_hint'))
                .fontSize(12)
                .fontColor($r('app.color.text_secondary'))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
            .layoutWeight(1)
          }
          .width('100%')
          .height(this.statusInsetVp + 79)
          .padding({ left: 22, right: 20, top: this.statusInsetVp + 12, bottom: 12 })

          Divider()
            .width('100%')
            .height(1)
            .color($r('app.color.card_border'))
        }
        .width('100%')
        .height(this.statusInsetVp + 80)

        Row() {
          Text($r('app.string.agent_home_workspaces_title'))
            .fontSize(22)
            .fontColor($r('app.color.text_secondary'))
            .layoutWeight(1)
          this.buildSheetIconButton($r('sys.symbol.plus'), AgentHomeActionKey.NEW_WORKSPACE)
          this.buildSheetIconButton($r('sys.symbol.slider_horizontal_2'), AgentHomeActionKey.OPEN_SETTINGS)
        }
        .width('100%')
        .height(64)
        .padding({ left: 22, right: 20 })

        this.buildWorkspaceOverview()

        List({ space: 6 }) {
          ForEach(this.workspaces, (item: AgentHomeWorkspaceItem) => {
            ListItem() {
              this.buildWorkspaceListItem(item)
            }
          }, (item: AgentHomeWorkspaceItem): string => item.id)
        }
        .width('100%')
        .layoutWeight(1)
        .padding({ left: 18, right: 18, top: 4 })
        .scrollBar(BarState.Off)

        this.buildWorkspaceStatusFooter(true)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildMainWorkspaceArea(): void {
    List({ space: 8 }) {
      ForEach(this.workspaces, (item: AgentHomeWorkspaceItem) => {
        ListItem() {
          this.buildMainWorkspaceListItem(item)
        }
      }, (item: AgentHomeWorkspaceItem): string => item.id)
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ left: 18, right: 18, top: 8, bottom: 8 })
    .scrollBar(BarState.Off)
    .edgeEffect(EdgeEffect.None)
  }

  @Builder
  private buildWorkspaceStatusFooter(useBottomInset: boolean): void {
    Column({ space: 0 }) {
      Divider()
        .width('100%')
        .height(1)
        .color($r('app.color.card_border'))

      Row({ space: 10 }) {
        Row({ space: 8 }) {
          Circle()
            .width(9)
            .height(9)
            .fill(this.resolveConnectionStatusColor())
          Text(this.currentConnectedDeviceIpText())
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .height(42)

        this.buildWorkspaceFooterActionButton(
          $r('sys.symbol.qrcode'),
          AgentHomeActionKey.SCAN_BRIDGE_QR,
          true
        )
        this.buildWorkspaceFooterActionButton(
          $r('sys.symbol.control'),
          AgentHomeActionKey.OPEN_GLOBAL_SETTINGS,
          false
        )
      }
      .width('100%')
      .height((useBottomInset ? this.bottomInsetVp : 0) + 69)
      .padding({ left: 22, right: 18, bottom: useBottomInset ? this.bottomInsetVp : 0 })
    }
    .width('100%')
    .height((useBottomInset ? this.bottomInsetVp : 0) + 70)
  }

  @Builder
  private buildWorkspaceFooterActionButton(symbol: Resource, actionKey: string, emphasized: boolean): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(17)
        .fontColor([this.agentHomeControlIconColor(emphasized)])
    }
    .width(38)
    .height(38)
    .borderRadius(19)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: emphasized ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.handleAction(actionKey);
    })
  }

  @Builder
  private buildMainWorkspaceListItem(item: AgentHomeWorkspaceItem): void {
    Column({ space: 6 }) {
      Row({ space: 12 }) {
        Stack() {
          Text(item.initial)
            .fontSize(15)
            .fontColor($r('app.color.text_white'))
            .fontWeight(FontWeight.Medium)
        }
        .width(30)
        .height(30)
        .backgroundColor(item.accentColor)
        .borderRadius(8)

        Text(item.title)
          .fontSize(17)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        if (item.id === this.activeWorkspaceId) {
          Circle()
            .width(8)
            .height(8)
            .fill($r('app.color.tag_blue'))
        }
      }
      .width('100%')
      .height(42)
      .onClick((): void => {
        this.activateWorkspace(item.id);
      })
      .gesture(
        LongPressGesture({ repeat: false })
          .onAction((): void => {
            this.openWorkspaceActions(item.id);
          })
      )

      if (item.id === this.activeWorkspaceId) {
        Column({ space: 4 }) {
          if (this.sessionsForWorkspace(item.id).length === 0) {
            Text($r('app.string.agent_home_no_sessions_in_workspace'))
              .width('100%')
              .height(34)
              .fontSize(12)
              .fontColor($r('app.color.text_secondary'))
              .textAlign(TextAlign.Center)
          } else {
            ForEach(this.sessionsForWorkspace(item.id), (session: AgentHomeSessionItem) => {
              this.buildMainWorkspaceSessionRow(session)
            }, (session: AgentHomeSessionItem): string => session.id)
          }
        }
        .width('100%')
        .padding({ left: 42, right: 2, bottom: 4 })
      }
    }
    .width('100%')
    .constraintSize({ minHeight: 50 })
    .padding({ left: 12, right: 14, top: 4, bottom: 4 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSelectedBorderColor(item.id === this.activeWorkspaceId)
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildMainWorkspaceSessionRow(session: AgentHomeSessionItem): void {
    Row({ space: 8 }) {
      this.buildSessionStatusIndicator(session, 22)

      Column({ space: 2 }) {
        Text(session.title)
          .fontSize(13)
          .fontWeight(session.id === this.activeSessionId ? FontWeight.Medium : FontWeight.Regular)
          .fontColor(session.id === this.activeSessionId ? $r('app.color.text_body') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.buildSessionRuntimeText(session))
          .fontSize(10)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      if (session.id === this.activeSessionId) {
        SymbolGlyph($r('sys.symbol.checkmark'))
          .fontSize(15)
          .fontColor([$r('app.color.tag_blue')])
      }
    }
    .width('100%')
    .height(42)
    .padding({ left: 8, right: 8 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSelectedBorderColor(session.id === this.activeSessionId)
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.activateSession(session.id);
    })
    .gesture(
      LongPressGesture({ repeat: false })
        .onAction((): void => {
          this.openSessionActions(session.id);
        })
    )
  }

  @Builder
  private buildSessionStatusIndicator(session: AgentHomeSessionItem, size: number): void {
    Stack({ alignContent: Alignment.Center }) {
      if (this.sessionVisualStatus(session) === AgentHomeSessionVisualStatus.RUNNING) {
        Circle()
          .width(size)
          .height(size)
          .fill(this.sessionStatusColor(session))
          .opacity(this.sessionStatusPulseOuterOpacity())
          .scale({
            x: this.sessionStatusPulseOuterScale(),
            y: this.sessionStatusPulseOuterScale()
          })
        Circle()
          .width(size - 8)
          .height(size - 8)
          .fill(this.sessionStatusColor(session))
          .opacity(0.16)
      } else {
        Circle()
          .width(size)
          .height(size)
          .fill(this.sessionStatusColor(session))
          .opacity(0.14)
      }
      SymbolGlyph(this.symbolForSessionVisualStatus(this.sessionVisualStatus(session)))
        .fontSize(size - 7)
        .fontColor([this.sessionStatusColor(session)])
    }
    .width(size)
    .height(size)
  }

  @Builder
  private buildWorkspaceOverview(): void {
    Column({ space: 8 }) {
      this.buildWorkspaceOverviewRow(
        $r('sys.symbol.folder'),
        $r('app.string.agent_home_detail_workspace_path'),
        this.currentWorkspacePathForDisplay()
      )
      this.buildWorkspaceOverviewRow(
        $r('sys.symbol.display'),
        $r('app.string.agent_home_local_device'),
        this.currentConnectedDeviceText()
      )
      this.buildWorkspaceOverviewRow(
        $r('sys.symbol.ellipsis_message'),
        $r('app.string.agent_home_remote_sessions_title'),
        this.importedSessionSummaryText()
      )
      this.buildWorkspaceOverviewRow(
        $r('sys.symbol.checkmark_circle'),
        $r('app.string.agent_home_status_detail_session'),
        this.currentSessionStatusText()
      )
    }
    .width('100%')
    .margin({ left: 18, right: 18, bottom: 8 })
    .padding(12)
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildWorkspaceOverviewRow(symbol: Resource, label: ResourceStr, value: string): void {
    Row({ space: 10 }) {
      SymbolGlyph(symbol)
        .fontSize(16)
        .fontColor([$r('app.color.text_secondary')])
      Text(label)
        .fontSize(12)
        .fontColor($r('app.color.text_secondary'))
        .width(86)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(value)
        .fontSize(12)
        .fontColor($r('app.color.text_body'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(24)
  }

  @Builder
  private buildWorkspaceListItem(item: AgentHomeWorkspaceItem): void {
    Column({ space: 6 }) {
      Row({ space: 14 }) {
        Stack() {
          Text(item.initial)
            .fontSize(16)
            .fontColor($r('app.color.text_white'))
            .fontWeight(FontWeight.Medium)
        }
        .width(28)
        .height(28)
        .backgroundColor(item.accentColor)
        .borderRadius(6)

        Text(item.title)
          .fontSize(20)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        if (item.id === this.activeWorkspaceId) {
          SymbolGlyph($r('sys.symbol.ohos_folder_badge_plus'))
            .fontSize(21)
            .fontColor([$r('app.color.text_secondary')])
        }
      }
      .width('100%')
      .height(48)
      .padding({ left: 2, right: 2 })
      .onClick((): void => {
        this.activateWorkspace(item.id);
      })

      if (item.id === this.activeWorkspaceId) {
        Row({ space: 14 }) {
          SymbolGlyph($r('sys.symbol.display'))
            .fontSize(22)
            .fontColor([$r('app.color.text_secondary')])
          Text(item.branchName)
            .fontSize(20)
            .fontColor($r('app.color.text_secondary'))
            .layoutWeight(1)
        }
        .width('100%')
        .height(48)
        .padding({ left: 58, right: 18 })
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(12)

        Column({ space: 6 }) {
          ForEach(this.sessionsForWorkspace(item.id), (session: AgentHomeSessionItem) => {
            this.buildWorkspaceSessionStatusRow(session)
          }, (session: AgentHomeSessionItem): string => session.id)
        }
        .width('100%')
        .padding({ left: 58, right: 18 })
      }
    }
    .width('100%')
  }

  @Builder
  private buildWorkspaceSessionStatusRow(session: AgentHomeSessionItem): void {
    Row({ space: 8 }) {
      this.buildSessionStatusIndicator(session, 20)
      Text(session.title)
        .fontSize(13)
        .fontColor(session.id === this.activeSessionId ? $r('app.color.text_body') : $r('app.color.text_secondary'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.providerDisplayNameForId(session.providerId))
        .fontSize(11)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
      Text(this.sessionStatusText(session))
        .fontSize(11)
        .fontColor(this.sessionStatusColor(session))
        .maxLines(1)
    }
    .width('100%')
    .height(30)
    .onClick((): void => {
      this.activateSession(session.id);
    })
  }

  @Builder
  private buildWorkspaceActionsSheet(): void {
    Column({ space: 12 }) {
      this.buildContextActionSheetTitle(
        $r('app.string.agent_home_workspace_actions_title'),
        this.workspaceActionTitle()
      )
      this.buildContextActionButton(
        $r('sys.symbol.square_and_pencil'),
        $r('app.string.agent_home_rename_workspace'),
        AgentHomeActionKey.RENAME_WORKSPACE,
        false
      )
      this.buildContextActionButton(
        $r('sys.symbol.trash'),
        $r('app.string.agent_home_delete_workspace'),
        AgentHomeActionKey.DELETE_WORKSPACE,
        true
      )
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 14, bottom: this.bottomInsetVp + 18 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSessionActionsSheet(): void {
    Column({ space: 12 }) {
      this.buildContextActionSheetTitle(
        $r('app.string.agent_home_session_actions_title'),
        this.sessionActionTitle()
      )
      this.buildContextActionButton(
        $r('sys.symbol.square_and_pencil'),
        $r('app.string.agent_home_rename_session'),
        AgentHomeActionKey.RENAME_SESSION,
        false
      )
      this.buildContextActionButton(
        $r('sys.symbol.doc_text_on_doc_text'),
        $r('app.string.agent_home_copy_session_id'),
        AgentHomeActionKey.COPY_SESSION_ID,
        false
      )
      this.buildContextActionButton(
        $r('sys.symbol.trash'),
        $r('app.string.agent_home_delete_session'),
        AgentHomeActionKey.DELETE_SESSION,
        true
      )
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 14, bottom: this.bottomInsetVp + 18 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRenameWorkspaceSheet(): void {
    Column({ space: 14 }) {
      this.buildContextActionSheetTitle(
        $r('app.string.agent_home_rename_workspace_title'),
        this.workspaceActionTitle()
      )
      TextInput({ placeholder: $r('app.string.agent_home_name_placeholder'), text: this.renameWorkspaceDraft })
        .width('100%')
        .height(46)
        .fontSize(15)
        .fontColor($r('app.color.text_body'))
        .placeholderColor($r('app.color.text_muted'))
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .borderRadius(14)
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSurfaceBorderColor()
        })
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)
        .onChange((value: string): void => {
          this.renameWorkspaceDraft = value;
        })

      Button($r('app.string.agent_home_save_name'))
        .width('100%')
        .height(44)
        .fontSize(14)
        .fontColor($r('app.color.panel_background'))
        .backgroundColor($r('app.color.tag_blue'))
        .borderRadius(14)
        .onClick((): void => {
          this.applyWorkspaceRename();
        })
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 14, bottom: this.bottomInsetVp + 18 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRenameSessionSheet(): void {
    Column({ space: 14 }) {
      this.buildContextActionSheetTitle(
        $r('app.string.agent_home_rename_session_title'),
        this.sessionActionTitle()
      )
      TextInput({ placeholder: $r('app.string.agent_home_name_placeholder'), text: this.renameSessionDraft })
        .width('100%')
        .height(46)
        .fontSize(15)
        .fontColor($r('app.color.text_body'))
        .placeholderColor($r('app.color.text_muted'))
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .borderRadius(14)
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSurfaceBorderColor()
        })
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)
        .onChange((value: string): void => {
          this.renameSessionDraft = value;
        })

      Button($r('app.string.agent_home_save_name'))
        .width('100%')
        .height(44)
        .fontSize(14)
        .fontColor($r('app.color.panel_background'))
        .backgroundColor($r('app.color.tag_blue'))
        .borderRadius(14)
        .onClick((): void => {
          this.applySessionRename();
        })
    }
    .width('100%')
    .padding({ left: 18, right: 18, top: 14, bottom: this.bottomInsetVp + 18 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildContextActionSheetTitle(title: ResourceStr, subtitle: string): void {
    Column({ space: 4 }) {
      Text(title)
        .width('100%')
        .fontSize(20)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_body'))
        .maxLines(1)
      Text(subtitle)
        .width('100%')
        .fontSize(12)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 4, right: 4, bottom: 4 })
  }

  @Builder
  private buildContextActionButton(symbol: Resource, title: ResourceStr, actionKey: string, isDanger: boolean): void {
    Button() {
      Row({ space: 10 }) {
        SymbolGlyph(symbol)
          .fontSize(19)
          .fontColor([isDanger ? $r('app.color.tag_red') : $r('app.color.text_body')])
        Text(title)
          .fontSize(15)
          .fontColor(isDanger ? $r('app.color.tag_red') : $r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
        SymbolGlyph($r('sys.symbol.chevron_right'))
          .fontSize(13)
          .fontColor([$r('app.color.text_muted')])
      }
      .width('100%')
    }
    .width('100%')
    .height(48)
    .padding({ left: 14, right: 14 })
    .borderRadius(14)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: isDanger ? $r('app.color.tag_red') : this.agentHomeSurfaceBorderColor()
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.handleContextAction(actionKey);
    })
  }

  @Builder
  private buildSessionSheet(): void {
    Column({ space: 14 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text(this.sessionImportSheetTitleText())
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.sessionImportSheetSummaryText())
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(56)
      .padding({ left: 18, right: 16, top: 8, bottom: 8 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .borderRadius(18)
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)

      Column() {
        this.buildSessionImportProviderTabs()
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 8, bottom: 8 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .borderRadius(16)
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)

      Row({ space: 10 }) {
        SymbolGlyph($r('sys.symbol.AI_search'))
          .fontSize(16)
          .fontColor([this.agentHomeReadableMutedColor()])
        TextInput({ placeholder: $r('app.string.agent_home_session_search_placeholder'), text: this.sessionSheetSearchText })
          .layoutWeight(1)
          .height(40)
          .fontSize(14)
          .fontColor(this.agentHomeReadableTextColor())
          .placeholderColor(this.agentHomeReadableMutedColor())
          .backgroundColor(Color.Transparent)
          .onChange((value: string): void => {
            this.sessionSheetSearchText = value;
          })
        this.buildRemoteWorkspaceFilterButton()
        Button($r('app.string.agent_home_refresh_remote_sessions'))
          .height(34)
          .padding({ left: 12, right: 12 })
          .fontSize(12)
          .borderRadius(10)
          .fontColor($r('app.color.text_body'))
          .backgroundColor(Color.Transparent)
          .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
          .border({
            width: this.agentHomeSurfaceBorderWidth(),
            color: this.agentHomeSurfaceBorderColor()
          })
          .visualEffect(this.agentHomeSurfaceVisualEffect())
          .clip(true)
          .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && !this.loadingRemoteSessions)
          .onClick((): void => {
            this.requestRemoteSessions();
          })
      }
      .width('100%')
      .height(54)
      .padding({ left: 16, right: 10 })
      .alignItems(VerticalAlign.Center)
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .borderRadius(16)
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)

      Scroll() {
        Column({ space: 12 }) {
          Text($r('app.string.agent_home_remote_sessions_title'))
            .width('100%')
            .fontSize(13)
            .fontColor($r('app.color.text_secondary'))

          if (this.remoteSessionSectionsForSheet().length === 0) {
            if (this.loadingRemoteSessions) {
              this.buildRemoteSessionsLoading()
            } else {
              Text(this.sessionSheetSearchText.trim().length > 0 ?
                $r('app.string.agent_home_remote_sessions_search_empty') :
                $r('app.string.agent_home_remote_sessions_empty'))
                .width('100%')
                .height(70)
                .fontSize(13)
                .fontColor($r('app.color.text_secondary'))
                .textAlign(TextAlign.Center)
                .backgroundColor(Color.Transparent)
                .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
                .borderRadius(12)
                .border({
                  width: this.agentHomeSurfaceBorderWidth(),
                  color: this.agentHomeSurfaceBorderColor()
                })
                .shadow(this.agentHomeSurfaceShadowOptions())
                .visualEffect(this.agentHomeSurfaceVisualEffect())
                .clip(true)
            }
          } else {
            Column({ space: 12 }) {
              if (this.loadingRemoteSessions) {
                this.buildRemoteSessionsLoading()
              }
              ForEach(this.remoteSessionSectionsForSheet(), (section: AgentHomeRemoteSessionSection) => {
                this.buildRemoteSessionSection(section)
              }, (section: AgentHomeRemoteSessionSection): string => section.id)
            }
            .width('100%')
          }
        }
        .width('100%')
        .padding({ left: 18, right: 18, bottom: this.bottomInsetVp + 12 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRemoteSessionsLoading(): void {
    Row({ space: 10 }) {
      LoadingProgress()
        .width(22)
        .height(22)
        .color($r('app.color.tag_blue'))
        .enableLoading(true)
      Text($r('app.string.agent_home_remote_sessions_loading'))
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(70)
    .justifyContent(FlexAlign.Center)
    .alignItems(VerticalAlign.Center)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildRemoteWorkspaceFilterButton(): void {
    Button() {
      SymbolGlyph($r('sys.symbol.slider_horizontal_2'))
        .fontSize(17)
        .fontColor([this.effectiveRemoteWorkspaceFilterId() === AgentHomeRemoteWorkspaceFilter.ALL ?
          this.agentHomeReadableSecondaryColor() : $r('app.color.tag_blue')])
    }
    .width(40)
    .height(34)
    .padding({ left: 0, right: 0 })
    .borderRadius(10)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .bindPopup(this.isRemoteWorkspaceFilterPopupOpen, {
      builder: (): void => {
        this.buildRemoteWorkspaceFilterPopup()
      },
      placement: Placement.Bottom,
      popupColor: Color.Transparent,
      enableArrow: true,
      autoCancel: true,
      mask: false,
      targetSpace: 8,
      onStateChange: (event: PopupStateChangeParam): void => {
        this.isRemoteWorkspaceFilterPopupOpen = event.isVisible;
      }
    })
    .onClick((): void => {
      this.isRemoteWorkspaceFilterPopupOpen = !this.isRemoteWorkspaceFilterPopupOpen;
    })
  }

  @Builder
  private buildRemoteWorkspaceFilterPopup(): void {
    Column({ space: 6 }) {
      Text($r('app.string.agent_home_remote_workspace_filter_title'))
        .width('100%')
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .padding({ left: 10, right: 10, top: 4, bottom: 2 })
      ForEach(this.remoteWorkspaceFilterOptions(), (item: AgentHomeRemoteWorkspaceFilterOption) => {
        this.buildRemoteWorkspaceFilterPopupRow(item)
      }, (item: AgentHomeRemoteWorkspaceFilterOption): string => item.id)
    }
    .width(286)
    .padding({ left: 8, right: 8, top: 8, bottom: 8 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(18)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildRemoteWorkspaceFilterPopupRow(item: AgentHomeRemoteWorkspaceFilterOption): void {
    Row({ space: 9 }) {
      SymbolGlyph(this.isRemoteWorkspaceFilterSelected(item.id) ? $r('sys.symbol.checkmark_circle') : $r('sys.symbol.folder'))
        .fontSize(17)
        .fontColor([this.isRemoteWorkspaceFilterSelected(item.id) ? $r('app.color.text_white') : this.agentHomeReadableSecondaryColor()])
      Column({ space: 2 }) {
        Text(item.title)
          .width('100%')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.isRemoteWorkspaceFilterSelected(item.id) ? $r('app.color.text_white') : this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(item.path.length > 0 ? item.path : String(item.count))
          .width('100%')
          .fontSize(10)
          .fontColor(this.isRemoteWorkspaceFilterSelected(item.id) ? $r('app.color.text_white') : this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      Text(String(item.count))
        .fontSize(11)
        .fontColor(this.isRemoteWorkspaceFilterSelected(item.id) ? $r('app.color.text_white') : this.agentHomeReadableMutedColor())
    }
    .width('100%')
    .height(50)
    .padding({ left: 10, right: 10 })
    .borderRadius(12)
    .backgroundColor(this.isRemoteWorkspaceFilterSelected(item.id) ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
    .onClick((): void => {
      this.remoteWorkspaceFilterId = item.id;
      this.isRemoteWorkspaceFilterPopupOpen = false;
    })
  }

  @Builder
  private buildRemoteSessionSection(section: AgentHomeRemoteSessionSection): void {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.folder'))
          .fontSize(14)
          .fontColor([this.agentHomeReadableSecondaryColor()])
        Column({ space: 1 }) {
          Text(section.title)
            .width('100%')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          if (section.path.length > 0) {
            Text(section.path)
              .width('100%')
              .fontSize(10)
              .fontColor($r('app.color.text_secondary'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
        }
        .layoutWeight(1)
        Text(String(section.count))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')
      .padding({ left: 4, right: 4 })

      ForEach(section.sessions, (item: AgentBridgeRemoteSession) => {
        this.buildRemoteSessionRow(item)
      }, (item: AgentBridgeRemoteSession): string => item.sessionId)
    }
    .width('100%')
  }

  @Builder
  private buildSessionRow(item: AgentHomeSessionItem): void {
    Row({ space: 14 }) {
      SymbolGlyph($r('sys.symbol.ellipsis_message'))
        .fontSize(22)
        .fontColor([item.id === this.activeSessionId ? $r('app.color.tag_blue') : $r('app.color.text_secondary')])
      Column({ space: 3 }) {
        Text(item.title)
          .fontSize(16)
          .fontWeight(item.id === this.activeSessionId ? FontWeight.Medium : FontWeight.Regular)
          .fontColor($r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.buildSessionRuntimeText(item))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      if (this.isSessionConversationRendering(item.id)) {
        LoadingProgress()
          .width(22)
          .height(22)
          .color($r('app.color.tag_blue'))
          .enableLoading(true)
      } else if (item.id === this.activeSessionId) {
        SymbolGlyph($r('sys.symbol.checkmark'))
          .fontSize(22)
          .fontColor([$r('app.color.tag_blue')])
      }
    }
    .width('100%')
    .constraintSize({ minHeight: 68 })
    .padding({ left: 14, right: 14, top: 12, bottom: 12 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(16)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSelectedBorderColor(item.id === this.activeSessionId)
    })
    .shadow({
      radius: item.id === this.activeSessionId ? 18 : 8,
      color: this.agentHomeSessionShadowColor(item.id === this.activeSessionId),
      offsetX: 0,
      offsetY: 5
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .scale(this.agentHomeSurfaceScaleOptions())
    .translate(this.agentHomeSurfaceTranslateOptions())
    .clip(true)
    .animation({ duration: 180, curve: Curve.EaseOut })
    .onClick((): void => {
      this.activateSession(item.id);
    })
  }

  @Builder
  private buildRemoteSessionRow(item: AgentBridgeRemoteSession): void {
    Column({ space: 8 }) {
      Row({ space: 12 }) {
        Column({ space: 4 }) {
          Text(item.title.length > 0 ? item.title : item.sessionId)
            .width('100%')
            .fontSize(15)
            .fontColor($r('app.color.text_body'))
            .fontWeight(FontWeight.Medium)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Text(this.buildRemoteSessionMetaText(item))
            .width('100%')
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Text(this.buildRemoteSessionFootnoteText(item))
            .width('100%')
            .fontSize(11)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        if (this.isRemoteSessionImported(item)) {
          SymbolGlyph($r('sys.symbol.checkmark'))
            .fontSize(20)
            .fontColor([$r('app.color.tag_blue')])
        } else {
          Text($r('app.string.agent_home_import_remote_session'))
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
        }
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 14, right: 14, top: 13, bottom: 13 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.isRemoteSessionImported(item) ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.handleRemoteSessionRowClick(item);
    })
  }

  @Builder
  private buildSessionImportProviderTabs(): void {
    Scroll() {
      Row({ space: 6 }) {
        ForEach(this.providerOptions, (provider: AgentBridgeProviderOption) => {
          this.buildSessionImportProviderPill(provider)
        }, (provider: AgentBridgeProviderOption): string => provider.id)
      }
      .height(30)
      .padding({ left: 2, right: 2 })
    }
    .width('100%')
    .height(32)
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .edgeEffect(EdgeEffect.Spring)
  }

  @Builder
  private buildSessionImportProviderPill(provider: AgentBridgeProviderOption): void {
    Button() {
      Stack({ alignContent: Alignment.Center }) {
        this.buildSessionImportProviderIcon(provider.id, this.isSessionImportProviderSelected(provider.id))
      }
      .width(32)
      .height(28)
    }
    .width(34)
    .height(30)
    .borderRadius(15)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSelectedBorderColor(this.isSessionImportProviderSelected(provider.id))
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.selectSessionImportProvider(provider.id);
    })
  }

  @Builder
  private buildSessionImportProviderIcon(providerId: string, emphasized: boolean): void {
    if (providerId === AgentBridgeProviderId.OPENCODE) {
      Image($r('app.media.opencode'))
        .width(20)
        .height(20)
        .objectFit(ImageFit.Contain)
    } else if (providerId === AgentBridgeProviderId.DEVECO) {
      SymbolGlyph($r('sys.symbol.Huawei_logo'))
        .fontSize(20)
        .fontColor([this.agentHomeControlIconColor(emphasized)])
    } else if (providerId === AgentBridgeProviderId.MIMO) {
      Image($r('app.media.xiaomimimo'))
        .width(20)
        .height(20)
        .objectFit(ImageFit.Contain)
    } else if (providerId === AgentBridgeProviderId.CODEX) {
      Image($r('app.media.codex'))
        .width(20)
        .height(20)
        .objectFit(ImageFit.Contain)
    } else if (providerId === AgentBridgeProviderId.CLAUDE) {
      Image($r('app.media.claudecode'))
        .width(20)
        .height(20)
        .objectFit(ImageFit.Contain)
    } else if (providerId === AgentBridgeProviderId.ANTIGRAVITY) {
      Image($r('app.media.antigravity'))
        .width(20)
        .height(20)
        .objectFit(ImageFit.Contain)
    } else {
      Circle()
        .width(6)
        .height(6)
        .fill(this.agentHomeControlIconColor(emphasized))
        .opacity(emphasized ? 1 : 0.72)
    }
  }

  @Builder
  private buildNewSessionProviderTabs(): void {
    Flex({ wrap: FlexWrap.Wrap }) {
      ForEach(this.providerOptions, (provider: AgentBridgeProviderOption) => {
        this.buildNewSessionProviderPill(provider)
      }, (provider: AgentBridgeProviderOption): string => provider.id)
    }
    .width('100%')
  }

  @Builder
  private buildNewSessionProviderPill(provider: AgentBridgeProviderOption): void {
    Button() {
      Row({ space: 6 }) {
        Text(provider.displayName)
          .fontSize(12)
          .fontColor(this.isNewSessionProviderSelected(provider.id) ? $r('app.color.tag_blue') : $r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(provider.status)
          .fontSize(11)
          .fontColor(this.isNewSessionProviderSelected(provider.id) ? $r('app.color.tag_blue') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .padding({ left: 12, right: 12 })
    }
    .height(34)
    .margin({ right: 8, bottom: 8 })
    .borderRadius(17)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSelectedBorderColor(this.isNewSessionProviderSelected(provider.id))
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.selectNewSessionProvider(provider.id);
    })
  }

  @Builder
  private buildGlobalSettingsSheet(): void {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text($r('app.string.agent_home_global_settings_title'))
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
          Text($r('app.string.agent_home_global_settings_hint'))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
      }
      .width('100%')
      .height(56)
      .padding({ top: 8 })

      Scroll() {
        Column({ space: 12 }) {
          this.buildGlobalThemeSection()
          this.buildGlobalLanguageSection()
          this.buildGlobalReplayGuideSection()
          this.buildGlobalDeveloperSection()
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 20 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildGlobalThemeSection(): void {
    Column({ space: 12 }) {
      this.buildGlobalSettingsSectionHeader($r('app.string.settings_appearance_theme_title'), $r('sys.symbol.gearshape'))
      Row({ space: 8 }) {
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_theme_light'),
          AgentHomeGlobalSettingGroup.THEME,
          NGFThemeMode.LIGHT
        )
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_theme_dark'),
          AgentHomeGlobalSettingGroup.THEME,
          NGFThemeMode.DARK
        )
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_follow_system'),
          AgentHomeGlobalSettingGroup.THEME,
          NGFThemeMode.AUTO
        )
      }
      .width('100%')
    }
    .width('100%')
    .padding(14)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildGlobalLanguageSection(): void {
    Column({ space: 12 }) {
      this.buildGlobalSettingsSectionHeader($r('app.string.settings_language_title'), $r('sys.symbol.character_upper_plus'))
      Row({ space: 8 }) {
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_lang_zh'),
          AgentHomeGlobalSettingGroup.LANGUAGE,
          'zh-Hans'
        )
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_lang_en'),
          AgentHomeGlobalSettingGroup.LANGUAGE,
          'en'
        )
        this.buildGlobalSettingOptionButton(
          $r('app.string.settings_follow_system'),
          AgentHomeGlobalSettingGroup.LANGUAGE,
          ''
        )
      }
      .width('100%')
    }
    .width('100%')
    .padding(14)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildGlobalReplayGuideSection(): void {
    Column({ space: 10 }) {
      this.buildGlobalSettingsSectionHeader($r('app.string.agent_home_global_settings_replay_title'), $r('sys.symbol.play_circle'))
      Text($r('app.string.agent_home_global_settings_replay_desc'))
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor(this.agentHomeReadableSecondaryColor())
      Button() {
        Row({ space: 8 }) {
          SymbolGlyph($r('sys.symbol.play_circle'))
            .fontSize(16)
            .fontColor([this.agentHomeControlIconColor(true)])
          Text($r('app.string.agent_home_global_settings_replay_button'))
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeControlTextColor(true))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
      }
      .width('100%')
      .height(40)
      .borderRadius(20)
      .backgroundColor(Color.Transparent)
      .buttonStyle(ButtonStyleMode.NORMAL)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSelectedBorderColor(true)
      })
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)
      .onClick((): void => {
        this.replayStartupGuide();
      })
    }
    .width('100%')
    .padding(14)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildGlobalDeveloperSection(): void {
    Column({ space: 10 }) {
      this.buildGlobalSettingsSectionHeader($r('app.string.agent_home_developer_section_title'), $r('sys.symbol.figure_mixed_cardio'))
      this.buildGlobalDeveloperEntryRow(
        $r('app.string.agent_home_developer_apps_title'),
        $r('app.string.agent_home_developer_apps_desc'),
        $r('sys.symbol.more'),
        AgentHomeSheetKey.DEVELOPER_APPS
      )
      this.buildGlobalDeveloperEntryRow(
        $r('app.string.agent_home_support_project_title'),
        $r('app.string.agent_home_support_project_desc'),
        $r('sys.symbol.qrcode'),
        AgentHomeSheetKey.SUPPORT_PROJECT
      )
    }
    .width('100%')
    .padding(14)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildGlobalDeveloperEntryRow(title: ResourceStr, description: ResourceStr, symbol: Resource, sheetKey: string): void {
    Row({ space: 12 }) {
      Column() {
        SymbolGlyph(symbol)
          .fontSize(18)
          .fontColor([this.agentHomeControlIconColor(true)])
      }
      .width(38)
      .height(38)
      .borderRadius(19)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .backgroundColor(this.agentHomeSolidControlBackgroundColor())
      .border({
        width: 1,
        color: this.agentHomeSelectedBorderColor(true)
      })

      Column({ space: 3 }) {
        Text(title)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(description)
          .fontSize(12)
          .lineHeight(17)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      SymbolGlyph($r('sys.symbol.chevron_right'))
        .fontSize(16)
        .fontColor([this.agentHomeReadableMutedColor()])
    }
    .width('100%')
    .padding({ left: 10, right: 10, top: 10, bottom: 10 })
    .borderRadius(14)
    .backgroundColor($r('app.color.background_secondary'))
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .onClick((): void => {
      this.openSheet(sheetKey);
    })
  }

  @Builder
  private buildDeveloperAppsSheet(): void {
    Column({ space: 12 }) {
      this.buildSheetTitleBlock(
        $r('app.string.agent_home_developer_apps_title'),
        $r('app.string.agent_home_developer_apps_sheet_hint')
      )

      Scroll() {
        Column({ space: 12 }) {
          ForEach(this.developerAppItems, (item: AgentHomeDeveloperAppItem): void => {
            this.buildDeveloperAppCard(item)
          }, (item: AgentHomeDeveloperAppItem): string => item.id)

          Text($r('app.string.agent_home_developer_apps_footer'))
            .width('100%')
            .padding({ top: 12, bottom: 24 })
            .fontSize(12)
            .fontColor(this.agentHomeReadableMutedColor())
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 20 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildDeveloperAppCard(item: AgentHomeDeveloperAppItem): void {
    Column({ space: 0 }) {
      Row({ space: 14 }) {
        if (item.isAvailable) {
          Image(item.icon)
            .width(56)
            .height(56)
            .borderRadius(14)
            .objectFit(ImageFit.Cover)
        } else {
          Column() {
            SymbolGlyph($r('sys.symbol.code'))
              .fontSize(24)
              .fontColor([this.agentHomeReadableSecondaryColor()])
          }
          .width(56)
          .height(56)
          .borderRadius(14)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .backgroundColor($r('app.color.background_secondary'))
          .border({
            width: this.agentHomeSurfaceBorderWidth(),
            color: this.agentHomeSurfaceBorderColor()
          })
        }

        Column({ space: 5 }) {
          Text(item.title)
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.description)
            .fontSize(12)
            .lineHeight(18)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 16, bottom: 14 })

      Divider()
        .strokeWidth(1)
        .color(this.agentHomeSurfaceBorderColor())
        .margin({ left: 14, right: 14 })

      if (item.isAvailable) {
        Row() {
          Text($r('app.string.agent_home_developer_app_open_market'))
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          SymbolGlyph($r('sys.symbol.chevron_right'))
            .fontSize(16)
            .fontColor([this.agentHomeReadableMutedColor()])
        }
        .width('100%')
        .height(48)
        .padding({ left: 14, right: 14 })
        .onClick((): void => {
          this.openDeveloperApp(item);
        })
      } else {
        Row() {
          Text($r('app.string.agent_home_developer_app_coming_soon'))
            .fontSize(14)
            .fontColor(this.agentHomeReadableMutedColor())
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .width('100%')
        .height(48)
        .padding({ left: 14, right: 14 })
      }
    }
    .width('100%')
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildSupportProjectSheet(): void {
    Column({ space: 12 }) {
      this.buildSheetTitleBlock(
        $r('app.string.agent_home_support_project_title'),
        $r('app.string.agent_home_support_project_sheet_hint')
      )

      Scroll() {
        Column({ space: 12 }) {
          this.buildSupportQrcodeCard()
          this.buildSupportLinkCard()
          Text($r('app.string.agent_home_support_footer'))
            .width('100%')
            .padding({ top: 12, bottom: 24 })
            .fontSize(12)
            .fontColor(this.agentHomeReadableMutedColor())
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 20 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSupportQrcodeCard(): void {
    Column({ space: 16 }) {
      Text($r('app.string.agent_home_support_scan_title'))
        .fontSize(17)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableTextColor())
        .width('100%')
        .textAlign(TextAlign.Center)

      Column() {
        Image($r('app.media.developer_support_reward_qrcode'))
          .width(220)
          .height(220)
          .borderRadius(12)
          .objectFit(ImageFit.Contain)
          .clip(true)
      }
      .width(236)
      .height(236)
      .padding(8)
      .borderRadius(18)
      .backgroundColor(Color.White)
      .clip(true)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 24, bottom: 24 })
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildSupportLinkCard(): void {
    Column({ space: 0 }) {
      Text($r('app.string.agent_home_support_link_title'))
        .fontSize(17)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableTextColor())
        .width('100%')
        .padding({ left: 14, right: 14, top: 16, bottom: 8 })

      Text($r('app.string.agent_home_support_link_desc'))
        .fontSize(12)
        .lineHeight(18)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .width('100%')
        .padding({ left: 14, right: 14, bottom: 12 })

      Row({ space: 8 }) {
        Text(AGENT_HOME_AFDIAN_URL)
          .fontSize(13)
          .fontColor($r('app.color.tag_blue'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        SymbolGlyph($r('sys.symbol.doc_plaintext'))
          .fontSize(16)
          .fontColor([this.agentHomeReadableMutedColor()])
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 8, bottom: 12 })
      .onClick((): void => {
        this.copySupportLink();
      })

      Divider()
        .strokeWidth(1)
        .color(this.agentHomeSurfaceBorderColor())
        .margin({ left: 14, right: 14 })

      Row() {
        Text($r('app.string.agent_home_support_open_afdian'))
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableTextColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        SymbolGlyph($r('sys.symbol.chevron_right'))
          .fontSize(16)
          .fontColor([this.agentHomeReadableMutedColor()])
      }
      .width('100%')
      .height(48)
      .padding({ left: 14, right: 14 })
      .onClick((): void => {
        this.openSupportPage();
      })
    }
    .width('100%')
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .borderRadius(16)
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildSheetTitleBlock(title: ResourceStr, hint: ResourceStr): void {
    Row({ space: 10 }) {
      Column({ space: 2 }) {
        Text(title)
          .fontSize(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(hint)
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
    }
    .width('100%')
    .height(62)
    .padding({ top: 8 })
  }

  @Builder
  private buildGlobalSettingsSectionHeader(title: ResourceStr, symbol: Resource): void {
    Row({ space: 8 }) {
      SymbolGlyph(symbol)
        .fontSize(17)
        .fontColor([this.agentHomeReadableSecondaryColor()])
      Text(title)
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.agentHomeReadableTextColor())
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
  }

  @Builder
  private buildGlobalSettingOptionButton(title: ResourceStr, group: string, value: string): void {
    Button() {
      Row({ space: 5 }) {
        if (this.isGlobalSettingOptionSelected(group, value)) {
          SymbolGlyph($r('sys.symbol.checkmark'))
            .fontSize(12)
            .fontColor([this.agentHomeControlIconColor(true)])
        } else {
          Blank()
            .width(12)
            .height(12)
        }
        Text(title)
          .fontSize(12)
          .fontWeight(this.isGlobalSettingOptionSelected(group, value) ? FontWeight.Medium : FontWeight.Regular)
          .fontColor(this.isGlobalSettingOptionSelected(group, value) ? this.agentHomeControlTextColor(true) : this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
    }
    .layoutWeight(1)
    .height(36)
    .borderRadius(18)
    .backgroundColor(this.isGlobalSettingOptionSelected(group, value) ? this.globalSettingSelectedBackgroundColor() : $r('app.color.background_secondary'))
    .border({
      width: this.isGlobalSettingOptionSelected(group, value) ? 1.6 : this.agentHomeSurfaceBorderWidth(),
      color: this.isGlobalSettingOptionSelected(group, value) ? this.agentHomeSelectedBorderColor(true) : this.agentHomeSurfaceBorderColor()
    })
    .shadow({
      radius: this.isGlobalSettingOptionSelected(group, value) ? 12 : 0,
      color: this.isGlobalSettingOptionSelected(group, value) ? '#22005DFF' : '#00000000',
      offsetX: 0,
      offsetY: this.isGlobalSettingOptionSelected(group, value) ? 4 : 0
    })
    .buttonStyle(ButtonStyleMode.NORMAL)
    .onClick((): void => {
      this.handleGlobalSettingOption(group, value);
    })
  }

  @Builder
  private buildSettingsSheet(): void {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text($r('app.string.agent_home_connection_title'))
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
          Text($r('app.string.agent_home_connection_sheet_hint'))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(56)
      .padding({ top: 8 })

      this.buildSettingsTabBar()

      Scroll() {
        Column({ space: 12 }) {
          if (this.settingsTabIndex === AgentHomeSettingsTabIndex.CONNECTION) {
            this.buildSettingsConnectionTab()
          } else if (this.settingsTabIndex === AgentHomeSettingsTabIndex.WORKSPACE) {
            this.buildSettingsWorkspaceTab()
          } else {
            this.buildSettingsDataTab()
          }
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 20 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSettingsTabBar(): void {
    Row({ space: 6 }) {
      this.buildSettingsTabButton(
        AgentHomeSettingsTabIndex.CONNECTION,
        $r('app.string.agent_home_settings_tab_connection'),
        $r('sys.symbol.desktop')
      )
      this.buildSettingsTabButton(
        AgentHomeSettingsTabIndex.WORKSPACE,
        $r('app.string.agent_home_settings_tab_workspace'),
        $r('sys.symbol.folder')
      )
      this.buildSettingsTabButton(
        AgentHomeSettingsTabIndex.DATA,
        $r('app.string.agent_home_settings_tab_data'),
        $r('sys.symbol.externaldrive')
      )
    }
    .width('100%')
    .height(44)
    .padding(4)
    .backgroundColor($r('app.color.background_secondary'))
    .borderRadius(12)
  }

  @Builder
  private buildSettingsTabButton(index: number, title: ResourceStr, symbol: Resource): void {
    Button() {
      Row({ space: 5 }) {
        SymbolGlyph(symbol)
          .fontSize(16)
          .fontColor([this.settingsTabIndex === index ? $r('app.color.text_white') : $r('app.color.text_secondary')])
        Text(title)
          .fontSize(12)
          .fontColor(this.settingsTabIndex === index ? $r('app.color.text_white') : $r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .justifyContent(FlexAlign.Center)
      .width('100%')
    }
    .layoutWeight(1)
    .height(36)
    .borderRadius(9)
    .padding({ left: 2, right: 2 })
    .backgroundColor(this.settingsTabIndex === index ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
    .onClick((): void => {
      this.settingsTabIndex = index;
    })
  }

  @Builder
  private buildSettingsConnectionTab(): void {
    Column({ space: 12 }) {
      Text($r('app.string.agent_home_settings_hint'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))

      this.buildSettingsStageHeader(
        '1',
        $r('app.string.agent_home_settings_stage_bridge_title'),
        $r('app.string.agent_home_settings_stage_bridge_desc')
      )

      Text($r('app.string.agent_bridge_endpoint_label'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
      TextInput({ placeholder: $r('app.string.agent_bridge_endpoint_placeholder'), text: this.bridgeEndpoint })
        .width('100%')
        .height(42)
        .fontSize(14)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.bridgeEndpoint = value;
          this.bridgeConnectionReasonText = this.buildBridgeConnectionReasonText(this.connectionStatus, '');
          this.persistProfile();
        })

      Text($r('app.string.agent_bridge_token_label'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
      TextInput({ placeholder: $r('app.string.agent_bridge_token_placeholder'), text: this.bridgeToken })
        .width('100%')
        .height(42)
        .fontSize(14)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.bridgeToken = value;
          this.bridgeConnectionReasonText = this.buildBridgeConnectionReasonText(this.connectionStatus, '');
          this.persistProfile();
        })

      Button() {
        Row() {
          Text($r('app.string.agent_home_scan_bridge_qr'))
            .fontSize(14)
            .fontColor($r('app.color.panel_background'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
      }
      .width('100%')
      .height(42)
      .borderRadius(12)
      .backgroundColor($r('app.color.button_primary'))
      .onClick((): void => {
        this.scanBridgeConnectionQr();
      })

      this.buildSettingsStageHeader(
        '2',
        $r('app.string.agent_home_settings_stage_status_title'),
        $r('app.string.agent_home_settings_stage_status_desc')
      )
      Row({ space: 10 }) {
        Button($r('app.string.agent_bridge_connect'))
          .layoutWeight(1)
          .height(42)
          .fontSize(14)
          .borderRadius(12)
          .backgroundColor(this.agentHomeSolidControlBackgroundColor())
          .enabled(
            this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED &&
              this.bridgeEndpoint.trim().length > 0 &&
              this.bridgeToken.trim().length > 0
          )
          .onClick((): void => {
            this.handleConnect();
          })
        Button($r('app.string.agent_bridge_disconnect'))
          .layoutWeight(1)
          .height(42)
          .fontSize(14)
          .borderRadius(12)
          .fontColor($r('app.color.text_body'))
          .backgroundColor($r('app.color.background_secondary'))
          .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED)
          .onClick((): void => {
            this.client.disconnect();
          })
      }
      .width('100%')

      Row() {
        Text(this.resolveConnectionStatusText())
          .fontSize(14)
          .fontColor(this.resolveConnectionStatusColor())
          .layoutWeight(1)
      }
      .width('100%')

      this.buildSettingsStageHeader(
        '3',
        $r('app.string.agent_home_settings_stage_connection_log_title'),
        $r('app.string.agent_home_settings_stage_connection_log_desc')
      )
      this.buildConnectionLogList()
    }
    .width('100%')
  }

  @Builder
  private buildSettingsWorkspaceTab(): void {
    Column({ space: 12 }) {
      this.buildSettingsStageHeader(
        '1',
        $r('app.string.agent_home_settings_stage_workspace_identity_title'),
        $r('app.string.agent_home_settings_stage_workspace_identity_desc')
      )
      Text($r('app.string.agent_home_workspace_title_label'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
      TextInput({ placeholder: $r('app.string.agent_home_workspace_title_placeholder'), text: this.workspaceTitleDraft })
        .width('100%')
        .height(42)
        .fontSize(14)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.workspaceTitleDraft = value;
          this.persistWorkspaceDraftIfComplete();
        })

      this.buildSettingsStageHeader(
        '2',
        $r('app.string.agent_home_settings_stage_workspace_path_title'),
        $r('app.string.agent_home_settings_stage_workspace_path_desc')
      )
      Text($r('app.string.agent_bridge_workspace_label'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
      TextInput({ placeholder: $r('app.string.agent_bridge_workspace_placeholder'), text: this.workspacePathDraft })
        .width('100%')
        .height(42)
        .fontSize(14)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.workspacePathDraft = value;
          this.persistWorkspaceDraftIfComplete();
        })

      Button($r('app.string.agent_home_save_workspace'))
        .width('100%')
        .height(40)
        .fontSize(13)
        .borderRadius(12)
        .fontColor($r('app.color.text_body'))
        .backgroundColor($r('app.color.background_secondary'))
        .onClick((): void => {
          this.saveActiveWorkspace();
        })
    }
    .width('100%')
  }

  @Builder
  private buildSettingsDataTab(): void {
    Column({ space: 12 }) {
      this.buildSettingsStageHeader(
        '1',
        $r('app.string.agent_home_settings_stage_cleanup_title'),
        $r('app.string.agent_home_settings_stage_cleanup_desc')
      )
      Row({ space: 10 }) {
        Button($r('app.string.agent_home_clear_session'))
          .layoutWeight(1)
          .height(38)
          .fontSize(12)
          .borderRadius(10)
          .fontColor($r('app.color.text_body'))
          .backgroundColor($r('app.color.background_secondary'))
          .onClick((): void => {
            this.confirmClearCurrentSession();
          })
        Button($r('app.string.agent_home_clear_previews'))
          .layoutWeight(1)
          .height(38)
          .fontSize(12)
          .borderRadius(10)
          .fontColor($r('app.color.text_body'))
          .backgroundColor($r('app.color.background_secondary'))
          .onClick((): void => {
            this.confirmClearCurrentPreviews();
          })
      }
      .width('100%')

      this.buildSettingsStageHeader(
        '2',
        $r('app.string.agent_home_settings_stage_reset_title'),
        $r('app.string.agent_home_settings_stage_reset_desc')
      )
      Button($r('app.string.agent_home_reset_data'))
        .width('100%')
        .height(38)
        .fontSize(12)
        .borderRadius(10)
        .fontColor($r('app.color.tag_red'))
        .backgroundColor($r('app.color.background_error'))
        .onClick((): void => {
          this.confirmResetAgentData();
        })
    }
    .width('100%')
  }

  @Builder
  private buildSettingsStageHeader(step: string, title: ResourceStr, desc: ResourceStr): void {
    Row({ space: 10 }) {
      Text(step)
        .width(26)
        .height(26)
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_white'))
        .textAlign(TextAlign.Center)
        .backgroundColor(this.agentHomeSolidControlBackgroundColor())
        .borderRadius(13)
      Column({ space: 2 }) {
        Text(title)
          .width('100%')
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
        Text(desc)
          .width('100%')
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .lineHeight(17)
      }
      .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: 2, right: 2, top: 8 })
  }

  @Builder
  private buildConnectionLogList(): void {
    if (this.connectionLogMessages().length === 0) {
      Text($r('app.string.agent_home_connection_log_empty'))
        .width('100%')
        .height(76)
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))
        .textAlign(TextAlign.Center)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(12)
        .border({ width: 1, color: $r('app.color.card_border') })
    } else {
      List({ space: 8 }) {
        ForEach(this.connectionLogMessages(), (item: AgentHomeChatItem) => {
          ListItem() {
            this.buildConnectionLogItem(item)
          }
        }, (item: AgentHomeChatItem): string => item.id)
      }
      .width('100%')
      .height(184)
      .scrollBar(BarState.Auto)
    }
  }

  @Builder
  private buildConnectionLogItem(item: AgentHomeChatItem): void {
    Column({ space: 6 }) {
      Row({ space: 8 }) {
        SymbolGlyph(this.resolveConnectionLogSymbol(item.text))
          .fontSize(15)
          .fontColor([this.resolveConnectionLogColor(item.text)])
        Text(this.formatTime(item.createdAt))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
          .layoutWeight(1)
      }
      .width('100%')

      Text(item.text)
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor($r('app.color.text_body'))
        .maxLines(4)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding(10)
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildModelSheet(): void {
    Column({ space: 14 }) {
      this.buildSheetTitle(
        $r('app.string.agent_home_model_sheet_title'),
        this.hasActiveSession() ? $r('app.string.agent_home_model_sheet_session_hint') : $r('app.string.agent_home_model_sheet_hint')
      )

      Scroll() {
        Column({ space: 12 }) {
          if (!this.hasActiveSession()) {
            this.buildSettingsStageHeader(
              '1',
              $r('app.string.agent_home_settings_stage_provider_title'),
              $r('app.string.agent_home_settings_stage_provider_desc')
            )
            Column({ space: 8 }) {
              ForEach(this.providerOptions, (item: AgentBridgeProviderOption) => {
                this.buildProviderOptionRow(item)
              }, (item: AgentBridgeProviderOption): string => item.id)
            }
            .width('100%')
          }

          this.buildModelSheetSectionHeader(
            $r('app.string.agent_home_settings_stage_model_title'),
            $r('sys.symbol.AI_search')
          )
          Grid() {
            ForEach(this.currentProviderModels(), (item: AgentBridgeModelOption) => {
              GridItem() {
                this.buildModelOptionRow(item)
              }
            }, (item: AgentBridgeModelOption): string => item.id)
          }
          .width('100%')
          .columnsTemplate('1fr 1fr')
          .columnsGap(8)
          .rowsGap(8)

          this.buildModelSheetSectionHeader(
            $r('app.string.agent_home_settings_stage_speed_title'),
            $r('sys.symbol.bolt')
          )
          Grid() {
            ForEach(this.currentProviderSpeedModes(), (item: AgentBridgeSpeedModeOption) => {
              GridItem() {
                this.buildSpeedModeOptionRow(item)
              }
            }, (item: AgentBridgeSpeedModeOption): string => item.id)
          }
          .width('100%')
          .columnsTemplate('1fr 1fr')
          .columnsGap(8)
          .rowsGap(8)

          this.buildModelSheetSectionHeader(
            $r('app.string.agent_home_settings_stage_reasoning_title'),
            $r('sys.symbol.scope')
          )
          Grid() {
            ForEach(this.currentProviderReasoningModes(), (item: AgentBridgeReasoningModeOption) => {
              GridItem() {
                this.buildReasoningModeOptionRow(item)
              }
            }, (item: AgentBridgeReasoningModeOption): string => item.id)
          }
          .width('100%')
          .columnsTemplate('1fr 1fr')
          .columnsGap(8)
          .rowsGap(8)

          if (this.hasInteractionModesInCategory('run')) {
            this.buildModelSheetSectionHeader(
              $r('app.string.agent_home_settings_stage_run_mode_title'),
              $r('sys.symbol.route_plan')
            )
            Grid() {
              ForEach(this.currentProviderInteractionModesForCategory('run'), (item: AgentBridgeInteractionModeOption) => {
                GridItem() {
                  this.buildInteractionModeOptionRow(item)
                }
              }, (item: AgentBridgeInteractionModeOption): string => item.id)
            }
            .width('100%')
            .columnsTemplate('1fr 1fr')
            .columnsGap(8)
            .rowsGap(8)
          }

          if (this.hasInteractionModesInCategory('approval')) {
            this.buildModelSheetSectionHeader(
              $r('app.string.agent_home_settings_stage_permission_mode_title'),
              $r('sys.symbol.security_shield')
            )
            Grid() {
              ForEach(this.currentProviderInteractionModesForCategory('approval'), (item: AgentBridgeInteractionModeOption) => {
                GridItem() {
                  this.buildInteractionModeOptionRow(item)
                }
              }, (item: AgentBridgeInteractionModeOption): string => item.id)
            }
            .width('100%')
            .columnsTemplate('1fr 1fr')
            .columnsGap(8)
            .rowsGap(8)
          }
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 18 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRuntimeSheet(): void {
    Column({ space: 14 }) {
      this.buildSheetTitle(
        $r('app.string.agent_home_runtime_sheet_title'),
        $r('app.string.agent_home_runtime_sheet_hint')
      )

      Scroll() {
        Column({ space: 12 }) {
          this.buildRuntimeCapabilityCard()

          this.buildSettingsStageHeader(
            '1',
            $r('app.string.agent_home_settings_stage_tools_title'),
            $r('app.string.agent_home_settings_stage_tools_desc')
          )
          if (this.currentProviderTools().length === 0) {
            Text($r('app.string.agent_home_runtime_tools_empty'))
              .width('100%')
              .height(72)
              .fontSize(13)
              .fontColor($r('app.color.text_secondary'))
              .textAlign(TextAlign.Center)
              .backgroundColor($r('app.color.background_surface'))
              .borderRadius(12)
              .border({ width: 1, color: $r('app.color.card_border') })
          } else {
            Column({ space: 8 }) {
              ForEach(this.currentProviderTools(), (item: AgentBridgeToolOption) => {
                this.buildToolOptionRow(item)
              }, (item: AgentBridgeToolOption): string => item.id)
            }
            .width('100%')
          }

          this.buildSettingsStageHeader(
            '2',
            $r('app.string.agent_home_runtime_preview_title'),
            $r('app.string.agent_home_runtime_preview_desc')
          )
          Button($r('app.string.agent_home_preview_title'))
            .width('100%')
            .height(40)
            .fontSize(13)
            .borderRadius(12)
            .fontColor($r('app.color.text_body'))
            .backgroundColor($r('app.color.background_secondary'))
            .onClick((): void => {
              this.openSheet(AgentHomeSheetKey.PREVIEW);
            })
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 18 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRuntimeCapabilityCard(): void {
    Column({ space: 8 }) {
      Row() {
        Text(this.currentProviderOption().displayName)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.currentProviderOption().status)
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')

      Text(this.buildProviderFeatureText(this.currentProviderOption()))
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor($r('app.color.text_secondary'))
    }
    .width('100%')
    .padding(12)
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildAttachmentSheet(): void {
    Column({ space: 14 }) {
      this.buildSheetTitle(
        $r('app.string.agent_home_attachment_sheet_title'),
        $r('app.string.agent_home_attachment_sheet_hint')
      )

      Row({ space: 10 }) {
        Button($r('app.string.agent_home_pick_image'))
          .layoutWeight(1)
          .height(42)
          .fontSize(13)
          .borderRadius(12)
          .backgroundColor(this.agentHomeSolidControlBackgroundColor())
          .onClick((): void => {
            this.handleAction(AgentHomeActionKey.PICK_IMAGE);
          })
        Button($r('app.string.agent_home_pick_document'))
          .layoutWeight(1)
          .height(42)
          .fontSize(13)
          .borderRadius(12)
          .fontColor($r('app.color.text_body'))
          .backgroundColor($r('app.color.background_secondary'))
          .onClick((): void => {
            this.handleAction(AgentHomeActionKey.PICK_DOCUMENT);
          })
      }
      .width('100%')

      if (this.attachments.length > 0) {
        Row() {
          Text($r('app.string.agent_home_attachment_selected_title'))
            .fontSize(13)
            .fontColor($r('app.color.text_secondary'))
            .layoutWeight(1)
          Button($r('app.string.agent_home_clear_attachments'))
            .height(30)
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .backgroundColor(Color.Transparent)
            .onClick((): void => {
              this.handleAction(AgentHomeActionKey.CLEAR_ATTACHMENTS);
            })
        }
        .width('100%')

        this.buildAttachmentSheetAttachments()
      } else {
        Text($r('app.string.agent_home_attachment_empty'))
          .width('100%')
          .height(76)
          .fontSize(13)
          .fontColor($r('app.color.text_secondary'))
          .textAlign(TextAlign.Center)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10, bottom: this.bottomInsetVp + 16 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSheetTitle(title: ResourceStr, hint: ResourceStr): void {
    Row() {
      Column({ space: 2 }) {
        Text(title)
          .fontSize(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .maxLines(1)
        Text(hint)
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
    }
    .width('100%')
    .height(56)
  }

  @Builder
  private buildWorkspaceBrowserSheet(): void {
    this.buildWorkspaceBrowserPage(false)
  }

  @Builder
  private buildWorkspaceBrowserPage(avoidTitleBar: boolean): void {
    Column({ space: avoidTitleBar ? 0 : 12 }) {
      if (avoidTitleBar) {
        this.buildWorkspaceTitleBarUnderlaySpacer()
        Column() {
          this.buildMainFileArea()
        }
        .width('100%')
        .layoutWeight(1)
        .padding({ left: 20, right: 20, top: 10, bottom: 16 })
      } else {
        Row({ space: 10 }) {
          Column({ space: 2 }) {
            Text($r('app.string.agent_home_workspace_panel_title'))
              .fontSize(24)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.text_body'))
              .maxLines(1)
            Text($r('app.string.agent_home_workspace_panel_hint'))
              .fontSize(12)
              .fontColor($r('app.color.text_secondary'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
          .layoutWeight(1)

          this.buildSheetIconButton($r('sys.symbol.arrow_clockwise'), AgentHomeActionKey.REFRESH_WORKSPACE_CHANGES)
        }
        .width('100%')
        .height(56)
        .padding({ left: 12, right: 12 })
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .borderRadius(18)
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSurfaceBorderColor()
        })
        .shadow(this.agentHomeSurfaceShadowOptions())
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)

        this.buildWorkspaceBrowserWorkspaceSelector()

        Row({ space: 8 }) {
          this.buildWorkspacePanelTab($r('app.string.agent_home_workspace_tab_changes'), AgentHomeWorkspacePanelTab.CHANGES)
          this.buildWorkspacePanelTab($r('app.string.agent_home_workspace_tab_files'), AgentHomeWorkspacePanelTab.FILES)
        }
        .width('100%')
        .height(42)
        .padding(4)
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .borderRadius(12)
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSurfaceBorderColor()
        })
        .shadow(this.agentHomeSurfaceShadowOptions())
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)

        if (this.workspacePanelTabIndex === AgentHomeWorkspacePanelTab.CHANGES) {
          this.buildWorkspaceChangesPane()
        } else {
          this.buildWorkspaceFilesPane()
        }
      }
    }
    .width('100%')
    .height('100%')
    .padding({
      left: avoidTitleBar ? 0 : 20,
      right: avoidTitleBar ? 0 : 20,
      top: avoidTitleBar ? 0 : 10,
      bottom: avoidTitleBar ? 0 : this.bottomInsetVp + 16
    })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildMainFileArea(): void {
    Column({ space: 10 }) {
      this.buildWorkspaceBrowserWorkspaceSelector()
      this.buildMainFileAreaTabs()
      if (this.workspacePanelTabIndex === AgentHomeWorkspacePanelTab.CHANGES) {
        this.buildMainWorkspaceChangesArea()
      } else {
        this.buildWorkspaceFilesPane()
      }
    }
    .width('100%')
    .layoutWeight(1)
  }

  @Builder
  private buildWorkspaceBrowserWorkspaceSelector(): void {
    Button() {
      Row({ space: 12 }) {
        SymbolGlyph($r('sys.symbol.folder'))
          .fontSize(20)
          .fontColor([this.agentHomeReadableSecondaryColor()])
        Column({ space: 2 }) {
          Text(this.currentWorkspaceTitle())
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.currentWorkspacePathForDisplay())
            .fontSize(11)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        SymbolGlyph($r('sys.symbol.chevron_down'))
          .fontSize(16)
          .fontColor([this.agentHomeReadableMutedColor()])
      }
      .width('100%')
    }
    .width('100%')
    .height(54)
    .padding({ left: 12, right: 12 })
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.openSheet(AgentHomeSheetKey.WORKSPACES);
    })
  }

  @Builder
  private buildMainFileAreaTabs(): void {
    Row({ space: 8 }) {
      this.buildMainFileTabItem(
        $r('app.string.agent_home_workspace_tab_changes'),
        $r('sys.symbol.list_checkmark'),
        AgentHomeWorkspacePanelTab.CHANGES
      )
      this.buildMainFileTabItem(
        $r('app.string.agent_home_workspace_tab_files'),
        $r('sys.symbol.folder'),
        AgentHomeWorkspacePanelTab.FILES
      )
      this.buildMainFileRefreshButton()
    }
    .width('100%')
    .height(44)
    .padding(4)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildMainFileTabItem(title: ResourceStr, symbol: Resource, index: number): void {
    Button() {
      Row({ space: 6 }) {
        SymbolGlyph(symbol)
          .fontSize(15)
          .fontColor([this.mainFileTabTextColor(index)])
        Text(title)
          .fontSize(13)
          .fontWeight(this.workspacePanelTabIndex === index ? FontWeight.Medium : FontWeight.Regular)
          .fontColor(this.mainFileTabTextColor(index))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .justifyContent(FlexAlign.Center)
      .width('100%')
    }
    .layoutWeight(1)
    .height(36)
    .borderRadius(10)
    .backgroundColor(this.mainFileTabBackgroundColor(index))
    .buttonStyle(ButtonStyleMode.NORMAL)
    .onClick((): void => {
      if (this.workspacePanelTabIndex !== index) {
        this.workspacePanelTabIndex = index;
        this.refreshWorkspacePanel();
      }
    })
  }

  @Builder
  private buildMainFileRefreshButton(): void {
    Button() {
      SymbolGlyph($r('sys.symbol.arrow_clockwise'))
        .fontSize(18)
        .fontColor([this.agentHomeReadableSecondaryColor()])
    }
    .width(36)
    .height(36)
    .borderRadius(10)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .onClick((): void => {
      this.refreshWorkspacePanel();
    })
  }

  @Builder
  private buildMainWorkspaceChangesArea(): void {
    Column({ space: 6 }) {
      Row({ space: 8 }) {
        Text($r('app.string.agent_home_workspace_tab_changes'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableSecondaryColor())
        .layoutWeight(1)
        .maxLines(1)
      }
      .width('100%')
      .height(22)

      if (this.loadingWorkspaceChanges && this.visibleWorkspaceChanges().length === 0) {
        Row({ space: 8 }) {
          LoadingProgress()
            .width(14)
            .height(14)
            .color(this.agentHomeReadableMutedColor())
          Text($r('app.string.agent_home_workspace_loading'))
            .fontSize(11)
            .fontColor(this.agentHomeReadableMutedColor())
            .maxLines(1)
        }
        .width('100%')
        .height(28)
      } else if (this.visibleWorkspaceChanges().length > 0) {
        Scroll() {
          Column({ space: 4 }) {
            ForEach(this.visibleWorkspaceChanges(), (item: AgentHomeWorkspaceChangeItem) => {
              this.buildMainWorkspaceChangeRow(item)
            }, (item: AgentHomeWorkspaceChangeItem): string => item.id)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.None)
      } else {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_changes_empty'), $r('sys.symbol.checkmark_circle'))
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .backgroundColor(Color.Transparent)
    .borderRadius(12)
    .border({
      width: 0,
      color: Color.Transparent
    })
    .clip(true)
  }

  @Builder
  private buildMainWorkspaceChangeRow(item: AgentHomeWorkspaceChangeItem): void {
    Row({ space: 8 }) {
      Text(this.fileNameFromPath(item.path))
        .fontSize(12)
        .fontColor(this.agentHomeReadableTextColor())
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      this.buildWorkspaceChangeCompactStatusLabel(item)
    }
    .width('100%')
    .height(30)
    .padding({ left: 8, right: 8 })
    .backgroundColor(this.workspaceChangeRowBackgroundColor(item))
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(9)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.workspaceChangeRowBorderColor(item)
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .onClick((): void => {
      this.openWorkspaceDiffDetail(item);
    })
  }

  @Builder
  private buildWorkspacePanelTab(title: ResourceStr, index: number): void {
    Button(title)
      .layoutWeight(1)
      .height(34)
      .fontSize(13)
      .borderRadius(9)
      .fontColor(this.workspacePanelTabIndex === index ? $r('app.color.tag_blue') : $r('app.color.text_body'))
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSelectedBorderColor(this.workspacePanelTabIndex === index)
      })
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)
      .onClick((): void => {
        this.workspacePanelTabIndex = index;
        this.refreshWorkspacePanel();
      })
  }

  @Builder
  private buildWorkspaceChangesPane(): void {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Text(this.currentBranchName())
          .fontSize(13)
          .fontColor($r('app.color.text_secondary'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Button($r('app.string.agent_home_workspace_commit'))
          .height(34)
          .fontSize(12)
          .borderRadius(10)
          .backgroundColor(this.agentHomeSolidControlBackgroundColor())
          .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED)
          .onClick((): void => {
            this.confirmCommitWorkspaceChanges();
          })
      }
      .width('100%')
      .padding({ left: 12, right: 8, top: 6, bottom: 6 })
      .backgroundColor(Color.Transparent)
      .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
      .borderRadius(14)
      .border({
        width: this.agentHomeSurfaceBorderWidth(),
        color: this.agentHomeSurfaceBorderColor()
      })
      .shadow(this.agentHomeSurfaceShadowOptions())
      .visualEffect(this.agentHomeSurfaceVisualEffect())
      .clip(true)

      TextInput({ placeholder: $r('app.string.agent_home_workspace_commit_placeholder'), text: this.commitMessageDraft })
        .width('100%')
        .height(40)
        .fontSize(13)
        .fontColor($r('app.color.text_body'))
        .placeholderColor($r('app.color.text_muted'))
        .backgroundColor(Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .borderRadius(10)
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSurfaceBorderColor()
        })
        .shadow(this.agentHomeSurfaceShadowOptions())
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)
        .onChange((value: string): void => {
          this.commitMessageDraft = value;
        })

      Text($r('app.string.agent_home_workspace_uncommitted'))
        .width('100%')
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_secondary'))

      if (this.loadingWorkspaceChanges) {
        this.buildWorkspaceLoading($r('app.string.agent_home_workspace_loading'))
      } else if (this.visibleWorkspaceChanges().length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_changes_empty'), $r('sys.symbol.checkmark_circle'))
      } else {
        Scroll() {
          Column({ space: 8 }) {
            ForEach(this.visibleWorkspaceChanges(), (item: AgentHomeWorkspaceChangeItem) => {
              this.buildWorkspaceChangeRow(item)
            }, (item: AgentHomeWorkspaceChangeItem): string => item.id)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.None)
      }
    }
    .width('100%')
    .layoutWeight(1)
  }

  @Builder
  private buildWorkspaceChangeRow(item: AgentHomeWorkspaceChangeItem): void {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        SymbolGlyph(this.symbolForWorkspaceChange(item))
          .fontSize(17)
          .fontColor([$r('app.color.text_secondary')])
        Column({ space: 2 }) {
          Text(this.fileNameFromPath(item.path))
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.path)
            .fontSize(11)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        if (this.isWorkspaceDirectoryChange(item)) {
          Text(this.workspaceChangeFileCountText(item))
            .fontSize(11)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
        }
        Text('+' + String(item.additions))
          .fontSize(11)
          .fontColor($r('app.color.tag_green'))
        Text('-' + String(item.deletions))
          .fontSize(11)
          .fontColor($r('app.color.tag_red'))
      }
      .width('100%')
      .onClick((): void => {
        this.openWorkspaceDiffDetail(item);
      })

      Row({ space: 8 }) {
        Button(item.staged ? $r('app.string.agent_home_workspace_unstage') : $r('app.string.agent_home_workspace_stage'))
          .height(28)
          .fontSize(11)
          .borderRadius(8)
          .backgroundColor(Color.Transparent)
          .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
          .border({
            width: this.agentHomeSurfaceBorderWidth(),
            color: this.agentHomeSurfaceBorderColor()
          })
          .visualEffect(this.agentHomeSurfaceVisualEffect())
          .clip(true)
          .fontColor($r('app.color.text_body'))
          .onClick((): void => {
            this.stageOrUnstageWorkspacePath(item);
          })
        Button($r('app.string.agent_home_workspace_diff'))
          .height(28)
          .fontSize(11)
          .borderRadius(8)
          .backgroundColor(Color.Transparent)
          .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
          .border({
            width: this.agentHomeSurfaceBorderWidth(),
            color: this.agentHomeSurfaceBorderColor()
          })
          .visualEffect(this.agentHomeSurfaceVisualEffect())
          .clip(true)
          .fontColor($r('app.color.text_body'))
          .onClick((): void => {
            this.openWorkspaceDiffDetail(item);
          })
        Button($r('app.string.agent_home_workspace_discard'))
          .height(28)
          .fontSize(11)
          .borderRadius(8)
          .backgroundColor(Color.Transparent)
          .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
          .border({
            width: this.agentHomeSurfaceBorderWidth(),
            color: $r('app.color.tag_red')
          })
          .visualEffect(this.agentHomeSurfaceVisualEffect())
          .clip(true)
          .fontColor($r('app.color.tag_red'))
          .onClick((): void => {
            this.confirmDiscardWorkspacePath(item.path);
          })
      }
      .width('100%')
    }
    .width('100%')
    .padding(12)
    .backgroundColor(this.workspaceChangeRowBackgroundColor(item))
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildWorkspaceFilesPane(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Text($r('app.string.agent_home_workspace_tab_files'))
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .layoutWeight(1)
          .maxLines(1)
        if (this.isWorkspaceDirLoading('')) {
          LoadingProgress()
            .width(14)
            .height(14)
            .color(this.agentHomeReadableMutedColor())
        }
      }
      .width('100%')
      .height(22)

      if (this.isWorkspaceDirLoading('') && this.visibleWorkspaceFiles().length === 0) {
        this.buildWorkspaceLoading($r('app.string.agent_home_workspace_loading'))
      } else if (this.visibleWorkspaceFiles().length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_files_empty'), $r('sys.symbol.folder'))
      } else {
        Scroll() {
          Column({ space: 4 }) {
            if (this.isWorkspaceDirLoading('')) {
              this.buildWorkspaceInlineLoading($r('app.string.agent_home_workspace_loading'))
            }
            ForEach(this.visibleWorkspaceFiles(), (item: AgentHomeWorkspaceFileItem) => {
              this.buildWorkspaceFileRow(item)
            }, (item: AgentHomeWorkspaceFileItem): string => item.id)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.None)
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .backgroundColor(Color.Transparent)
    .borderRadius(12)
    .border({
      width: 0,
      color: Color.Transparent
    })
    .clip(true)
  }

  @Builder
  private buildWorkspaceFileRow(item: AgentHomeWorkspaceFileItem): void {
    Column({ space: 6 }) {
      Row({ space: 8 }) {
        Blank()
          .width(this.workspaceFileIndent(item))
        if (item.kind === 'directory') {
          SymbolGlyph(this.isWorkspaceDirExpanded(item.path) ? $r('sys.symbol.chevron_down') : $r('sys.symbol.chevron_right'))
            .fontSize(13)
            .fontColor([$r('app.color.text_muted')])
        } else {
          Blank()
            .width(13)
        }
        SymbolGlyph(item.kind === 'directory' ? $r('sys.symbol.folder') : $r('sys.symbol.doc_plaintext'))
          .fontSize(17)
          .fontColor([$r('app.color.text_secondary')])
        Text(item.name)
          .fontSize(14)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(item.kind === 'file' ? this.formatBytes(item.sizeBytes) : '')
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
      }
      .width('100%')
      .height(40)
      .onClick((): void => {
        this.handleWorkspaceFileClick(item);
      })

      if (item.kind === 'directory' && this.isWorkspaceDirLoading(item.path)) {
        Row({ space: 8 }) {
          Blank()
            .width(this.workspaceFileIndent(item) + 25)
          LoadingProgress()
            .width(16)
            .height(16)
            .color($r('app.color.text_secondary'))
          Text($r('app.string.agent_home_workspace_loading'))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
        }
        .width('100%')
        .height(30)
      }
    }
    .width('100%')
    .padding({ left: 8, right: 8, top: 2, bottom: 2 })
    .backgroundColor(this.workspaceFileRowBackgroundColor(item))
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(10)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.workspaceFileRowBorderColor(item)
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildWorkspaceEmpty(text: ResourceStr, symbol: Resource): void {
    Column({ space: 10 }) {
      SymbolGlyph(symbol)
        .fontSize(30)
        .fontColor([$r('app.color.text_muted')])
      Text(text)
        .fontSize(14)
        .fontColor($r('app.color.text_secondary'))
    }
    .width('100%')
    .height(220)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildWorkspaceLoading(text: ResourceStr): void {
    Column({ space: 10 }) {
      LoadingProgress()
        .width(28)
        .height(28)
        .color($r('app.color.text_secondary'))
      Text(text)
        .fontSize(14)
        .fontColor($r('app.color.text_secondary'))
    }
    .width('100%')
    .height(220)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildWorkspaceInlineLoading(text: ResourceStr): void {
    Row({ space: 8 }) {
      LoadingProgress()
        .width(16)
        .height(16)
        .color($r('app.color.text_secondary'))
      Text(text)
        .fontSize(12)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
    }
    .width('100%')
    .height(42)
    .padding({ left: 10, right: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .borderRadius(10)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
  }

  @Builder
  private buildToolDetailSheet(): void {
    Column({ space: 12 }) {
      Column({ space: 2 }) {
        Text(this.activeToolDetailTitle())
          .fontSize(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.activeToolDetailStatusText())
          .fontSize(12)
          .fontColor(this.activeToolDetailColor())
      }
      .width('100%')
      .height(56)
      .justifyContent(FlexAlign.Center)

      Scroll() {
        Column({ space: 12 }) {
          if (this.shouldShowActiveToolDiffDetail()) {
            this.buildActiveToolDiffPane()
          } else {
            this.buildToolDetailBlock($r('app.string.agent_home_tool_detail_input'), this.activeToolDetailInputText())
            this.buildToolDetailBlock($r('app.string.agent_home_tool_detail_output'), this.activeToolDetailOutputText())
            this.buildToolDetailBlock($r('app.string.agent_home_tool_detail_error'), this.activeToolDetailErrorText())
            this.buildToolDetailBlock($r('app.string.agent_home_tool_detail_raw'), this.activeToolDetailRawText())
          }
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 12 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(this.shouldShowActiveToolDiffDetail() ? BarState.Off : BarState.Auto)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildToolDetailBlock(title: ResourceStr, content: string): void {
    Column({ space: 8 }) {
      Text(title)
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_secondary'))
      Text(content.length > 0 ? content : this.resolveDetailEmptyText())
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor($r('app.color.text_body'))
        .padding(10)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
        .copyOption(CopyOptions.LocalDevice)
    }
    .width('100%')
  }

  @Builder
  private buildActiveToolDiffPane(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        SymbolGlyph($r('sys.symbol.AI_pencil'))
          .fontSize(17)
          .fontColor([this.agentHomeReadableMutedColor()])
        Text(this.activeToolDiffSummaryText())
          .fontSize(13)
          .fontColor(this.agentHomeReadableSecondaryColor())
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')

      if (this.activeToolDiffText().length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_diff_empty'), $r('sys.symbol.doc_plaintext'))
      } else {
        Column() {
          this.buildWorkspaceDiffTable(this.activeToolDiffLines(), 6)
        }
        .width('100%')
        .height(260)
      }
    }
    .width('100%')
  }

  @Builder
  private buildWorkspaceDiffDetailSheet(): void {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text(this.activeWorkspaceChangeTitleText())
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          this.buildActiveWorkspaceChangeSummaryLabel()
        }
        .layoutWeight(1)
        Button($r('app.string.agent_home_workspace_preview_full'))
          .width(136)
          .height(36)
          .fontSize(12)
          .borderRadius(10)
          .backgroundColor(this.agentHomeSolidControlBackgroundColor())
          .fontColor($r('app.color.text_white'))
          .enabled(this.canPreviewActiveWorkspaceChangeContent())
          .onClick((): void => {
            this.openWorkspaceContentPreview(this.activeWorkspaceChangePreviewPath());
          })
      }
      .width('100%')
      .height(60)

      if (this.activeWorkspaceChange() === null) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_diff_empty'), $r('sys.symbol.doc_plaintext'))
      } else if (this.isWorkspaceDiffLoading(this.activeWorkspaceChangeId)) {
        this.buildWorkspaceLoading($r('app.string.agent_home_workspace_diff_loading'))
      } else if (this.activeWorkspaceDiffText().length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_diff_empty'), $r('sys.symbol.doc_plaintext'))
      } else {
        Column() {
          this.buildWorkspaceDiffTable(this.activeWorkspaceDiffLines(), this.bottomInsetVp + 18)
        }
        .width('100%')
        .layoutWeight(1)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildActiveWorkspaceChangeSummaryLabel(): void {
    Text() {
      Span(this.activeWorkspaceChangeSummaryPathText())
        .fontSize(12)
        .fontColor(this.agentHomeReadableSecondaryColor())
      if (this.activeWorkspaceChangeIsDirectory()) {
        Span('  ' + this.activeWorkspaceChangeFileCountText())
          .fontSize(12)
          .fontColor(this.agentHomeReadableSecondaryColor())
      }
      if (this.hasActiveWorkspaceChange()) {
        Span('  +' + String(this.activeWorkspaceChangeAdditions()))
          .fontSize(12)
          .fontColor($r('app.color.tag_green'))
        Span('  -' + String(this.activeWorkspaceChangeDeletions()))
          .fontSize(12)
          .fontColor($r('app.color.tag_red'))
      }
    }
    .maxLines(1)
    .textOverflow({ overflow: TextOverflow.Ellipsis })
  }

  @Builder
  private buildWorkspaceContentPreviewSheet(): void {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 3 }) {
          Text($r('app.string.agent_home_workspace_content_preview_title'))
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.activeWorkspacePreviewPath.length > 0 ? this.activeWorkspacePreviewPath : this.resolveDetailEmptyText())
            .fontSize(12)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(60)

      if (this.isActiveWorkspacePreviewMedia()) {
        this.buildWorkspacePreviewSurfaceSwitch()
      }

      if (this.activeWorkspacePreviewPath.length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_content_preview_empty'), $r('sys.symbol.doc_plaintext'))
      } else if (this.activeWorkspacePreviewErrorText.length > 0) {
        this.buildWorkspacePreviewError()
      } else if (this.isActiveWorkspacePreviewImageDownloadPending()) {
        this.buildWorkspaceLoading($r('app.string.agent_home_workspace_loading'))
      } else if (this.activeWorkspacePreviewItem() === null) {
        this.buildWorkspaceLoading($r('app.string.agent_home_workspace_loading'))
      } else if (this.activeWorkspacePreviewContent().length === 0) {
        this.buildWorkspaceEmpty($r('app.string.agent_home_workspace_content_preview_empty'), $r('sys.symbol.doc_plaintext'))
      } else if (this.activeWorkspacePreviewContentKind() === NGFRichContentKind.IMAGE) {
        this.buildWorkspaceRasterPreviewStage(this.activeWorkspacePreviewContent(), this.bottomInsetVp + 18)
      } else if (this.activeWorkspacePreviewContentKind() === NGFRichContentKind.MARKDOWN) {
        this.buildWorkspaceMarkdownPreview(this.activeWorkspacePreviewContent(), this.bottomInsetVp + 18)
      } else if (this.isActiveWorkspacePreviewCodeContent()) {
        Column() {
          this.buildWorkspaceCodePreviewTable(this.activeWorkspacePreviewContent(), this.bottomInsetVp + 18)
        }
        .width('100%')
        .layoutWeight(1)
      } else {
        NGFRichContentRenderer({
          content: this.activeWorkspacePreviewContent(),
          contentKind: this.activeWorkspacePreviewContentKind(),
          mediaType: this.activeWorkspacePreviewMediaType(),
          isDarkMode: this.isDarkMode,
          previewSurfaceDark: this.activeWorkspacePreviewSurfaceDark,
          bottomPadding: this.bottomInsetVp + 18
        })
        .width('100%')
        .layoutWeight(1)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildWorkspaceMarkdownPreview(content: string, bottomPadding: number): void {
    Scroll() {
      Column() {
        this.buildAssistantNativeRichContent('workspace_markdown_preview_' + this.activeWorkspacePreviewPath, content)
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 12, bottom: bottomPadding })
    }
    .width('100%')
    .layoutWeight(1)
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
    .backgroundColor(this.codeBlockBackgroundColor())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .clip(true)
  }

  @Builder
  private buildWorkspacePreviewSurfaceSwitch(): void {
    Row({ space: 8 }) {
      Button($r('app.string.agent_home_workspace_preview_light'))
        .height(32)
        .layoutWeight(1)
        .fontSize(12)
        .borderRadius(9)
        .fontColor(this.activeWorkspacePreviewSurfaceDark ? this.agentHomeReadableSecondaryColor() : $r('app.color.text_white'))
        .backgroundColor(this.activeWorkspacePreviewSurfaceDark ? Color.Transparent : this.agentHomeSolidControlBackgroundColor())
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSelectedBorderColor(!this.activeWorkspacePreviewSurfaceDark)
        })
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)
        .onClick((): void => {
          this.activeWorkspacePreviewSurfaceDark = false;
        })
      Button($r('app.string.agent_home_workspace_preview_dark'))
        .height(32)
        .layoutWeight(1)
        .fontSize(12)
        .borderRadius(9)
        .fontColor(this.activeWorkspacePreviewSurfaceDark ? $r('app.color.text_white') : this.agentHomeReadableSecondaryColor())
        .backgroundColor(this.activeWorkspacePreviewSurfaceDark ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
        .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
        .border({
          width: this.agentHomeSurfaceBorderWidth(),
          color: this.agentHomeSelectedBorderColor(this.activeWorkspacePreviewSurfaceDark)
        })
        .visualEffect(this.agentHomeSurfaceVisualEffect())
        .clip(true)
        .onClick((): void => {
          this.activeWorkspacePreviewSurfaceDark = true;
        })
    }
    .width('100%')
  }

  @Builder
  private buildWorkspaceRasterPreviewStage(content: string, bottomPadding: number): void {
    Column() {
      Image(this.activeWorkspaceRasterPreviewImageSource(content))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Contain)
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ left: 12, right: 12, top: 12, bottom: bottomPadding })
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(this.workspacePreviewMediaStageBackgroundColor())
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .clip(true)
  }

  @Builder
  private buildWorkspacePreviewError(): void {
    Column({ space: 12 }) {
      SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
        .fontSize(30)
        .fontColor([this.agentHomeReadableMutedColor()])
      Text(this.activeWorkspacePreviewErrorText)
        .fontSize(15)
        .lineHeight(22)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .textAlign(TextAlign.Center)
        .maxLines(4)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(220)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(Color.Transparent)
    .borderRadius(14)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
  }

  @Builder
  private buildWorkspaceDiffTable(lines: Array<AgentHomeDiffLine>, bottomPadding: number): void {
    Scroll() {
      Scroll() {
        Column({ space: 0 }) {
          ForEach(this.workspaceDiffRenderableLines(lines), (line: AgentHomeDiffLine) => {
            this.buildWorkspaceDiffLine(line)
          }, (line: AgentHomeDiffLine): string => line.id)
        }
        .width(this.workspaceDiffTableWidth(this.workspaceDiffRenderableLines(lines)))
        .padding({ top: 6, bottom: bottomPadding })
      }
      .width('100%')
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .scrollable(ScrollDirection.Vertical)
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
    .backgroundColor(this.workspaceDiffCodeBackgroundColor())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .clip(true)
  }

  @Builder
  private buildWorkspaceDiffLine(line: AgentHomeDiffLine): void {
    Row({ space: 0 }) {
      Text(this.workspaceDiffLineNumberText(line.oldLineNumber))
        .width(46)
        .height('100%')
        .fontSize(11)
        .fontFamily('monospace')
        .fontColor(this.workspaceDiffLineNumberColor(line.kind))
        .textAlign(TextAlign.End)
        .padding({ right: 8 })
      Text(this.workspaceDiffLineNumberText(line.newLineNumber))
        .width(46)
        .height('100%')
        .fontSize(11)
        .fontFamily('monospace')
        .fontColor(this.workspaceDiffLineNumberColor(line.kind))
        .textAlign(TextAlign.End)
        .padding({ right: 8 })
      Text(this.workspaceDiffLineGutterText(line))
        .width(26)
        .height('100%')
        .fontSize(13)
        .fontFamily('monospace')
        .fontColor(this.workspaceDiffLineAccentColor(line.kind))
        .textAlign(TextAlign.Center)
      Text(this.workspaceDiffLineContentText(line))
        .layoutWeight(1)
        .fontSize(13)
        .lineHeight(22)
        .fontFamily('monospace')
        .fontColor(this.workspaceDiffLineTextColor(line.kind))
        .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
        .copyOption(CopyOptions.LocalDevice)
    }
    .width('100%')
    .height(this.workspaceDiffLineHeight(line.kind))
    .backgroundColor(this.workspaceDiffLineBackgroundColor(line.kind))
  }

  @Builder
  private buildWorkspaceCodePreviewTable(content: string, bottomPadding: number): void {
    Scroll() {
      Scroll() {
        Column({ space: 0 }) {
          ForEach(this.workspaceCodePreviewLines(content), (line: AgentHomeCodeLine) => {
            this.buildWorkspaceCodePreviewLine(line)
          }, (line: AgentHomeCodeLine): string => line.id)
        }
        .width(this.workspaceCodePreviewTableWidth(this.workspaceCodePreviewLines(content)))
        .padding({ top: 6, bottom: bottomPadding })
      }
      .width('100%')
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
    .scrollable(ScrollDirection.Vertical)
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
    .backgroundColor(this.workspaceDiffCodeBackgroundColor())
    .borderRadius(12)
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .clip(true)
  }

  @Builder
  private buildWorkspaceCodePreviewLine(line: AgentHomeCodeLine): void {
    Row({ space: 0 }) {
      Text(this.workspaceCodePreviewLineNumberText(line.lineNumber))
        .width(58)
        .height('100%')
        .fontSize(11)
        .fontFamily('monospace')
        .fontColor(this.agentHomeReadableMutedColor())
        .textAlign(TextAlign.End)
        .padding({ right: 10 })
      Text(this.workspaceCodePreviewLineText(line))
        .layoutWeight(1)
        .fontSize(13)
        .lineHeight(22)
        .fontFamily('monospace')
        .fontColor(this.workspaceCodePreviewLineTextColor(line.lineNumber))
        .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
        .copyOption(CopyOptions.LocalDevice)
    }
    .width('100%')
    .height(line.lineNumber > 0 ? 28 : 30)
    .backgroundColor(this.workspaceCodePreviewLineBackgroundColor(line.lineNumber))
  }

  @Builder
  private buildRequestDetailSheet(): void {
    Column({ space: 12 }) {
      Column({ space: 2 }) {
        Text(this.activeRequestTitle())
          .fontSize(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.displayInteractionStatus(this.activeRequestStatus()))
          .fontSize(12)
          .fontColor(this.activeRequestHeaderIconColor())
      }
      .width('100%')
      .height(56)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)

      Text(this.activeRequestPrompt())
        .width('100%')
        .fontSize(15)
        .lineHeight(22)
        .fontColor($r('app.color.text_body'))
        .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
        .copyOption(CopyOptions.LocalDevice)

      if (this.activeRequestOptions().length > 0) {
        Column({ space: 8 }) {
          ForEach(this.activeRequestOptions(), (item: AgentHomeRequestOptionItem) => {
            this.buildRequestOptionRow(item)
          }, (item: AgentHomeRequestOptionItem): string => item.id)
        }
        .width('100%')
      }

      if (this.isActivePermissionRequest()) {
        TextArea({ placeholder: $r('app.string.agent_home_permission_edit_placeholder'), text: this.requestAnswerDraft })
          .width('100%')
          .height(92)
          .fontSize(14)
          .backgroundColor($r('app.color.background_secondary'))
          .borderRadius(10)
          .onChange((value: string): void => {
            this.requestAnswerDraft = value;
          })
      } else {
        TextInput({ placeholder: $r('app.string.agent_home_request_other_placeholder'), text: this.requestAnswerDraft })
          .width('100%')
          .height(42)
          .fontSize(14)
          .backgroundColor($r('app.color.background_secondary'))
          .borderRadius(10)
          .onChange((value: string): void => {
            this.requestAnswerDraft = value;
          })
      }

      if (this.isActivePermissionRequest()) {
        Row({ space: 8 }) {
          Button($r('app.string.agent_home_permission_deny'))
            .layoutWeight(1)
            .height(40)
            .fontSize(13)
            .borderRadius(10)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.permissionDenyButtonBackgroundColor())
            .enabled(this.canRespondActivePermission())
            .opacity(this.canRespondActivePermission() ? 1 : 0.55)
            .onClick((): void => {
              this.respondToActivePermission(AgentHomePermissionReply.REJECT);
            })
          Button($r('app.string.agent_home_permission_allow_once'))
            .layoutWeight(1)
            .height(40)
            .fontSize(13)
            .borderRadius(10)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.permissionAllowButtonBackgroundColor())
            .enabled(this.canRespondActivePermission())
            .opacity(this.canRespondActivePermission() ? 1 : 0.55)
            .onClick((): void => {
              this.respondToActivePermission(AgentHomePermissionReply.ONCE);
            })
        }
        .width('100%')
      } else {
        Row({ space: 8 }) {
          Button($r('app.string.agent_home_request_dismiss'))
            .layoutWeight(1)
            .height(40)
            .fontSize(13)
            .borderRadius(10)
            .fontColor($r('app.color.text_body'))
            .backgroundColor($r('app.color.background_secondary'))
            .onClick((): void => {
              this.dismissActiveRequest();
            })
          Button($r('app.string.agent_home_request_submit'))
            .layoutWeight(1)
            .height(40)
            .fontSize(13)
            .borderRadius(10)
            .fontColor($r('app.color.text_white'))
            .backgroundColor(this.agentHomeSolidControlBackgroundColor())
            .enabled(this.canSubmitActiveRequest())
            .onClick((): void => {
              this.submitActiveRequest();
            })
        }
        .width('100%')
      }

      this.buildToolDetailBlock($r('app.string.agent_home_tool_detail_raw'), this.activeRequestRawDisplayText())
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10, bottom: this.bottomInsetVp + 16 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildRequestOptionRow(item: AgentHomeRequestOptionItem): void {
    Column({ space: 3 }) {
      Row({ space: 8 }) {
        SymbolGlyph(this.selectedRequestOptionId === item.id ? $r('sys.symbol.checkmark_circle') : $r('sys.symbol.circle'))
          .fontSize(17)
          .fontColor([this.selectedRequestOptionId === item.id ? $r('app.color.text_body') : $r('app.color.text_secondary')])
        Text(item.label)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      if (item.description.length > 0) {
        Text(item.description)
          .width('100%')
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .padding({ left: 25 })
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
    }
    .width('100%')
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .backgroundColor(this.selectedRequestOptionId === item.id ? $r('app.color.background_secondary') : $r('app.color.panel_background'))
    .border({ width: 1, color: this.selectedRequestOptionId === item.id ? $r('app.color.card_border_alt') : $r('app.color.card_border') })
    .borderRadius(10)
    .onClick((): void => {
      this.selectedRequestOptionId = item.id;
    })
  }

  @Builder
  private buildPlanDetailSheet(): void {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        SymbolGlyph($r('sys.symbol.route_plan'))
          .fontSize(24)
          .fontColor([this.colorForInteractionStatus(this.activePlanStatus())])
        Column({ space: 2 }) {
          Text(this.activePlanTitle())
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.displayInteractionStatus(this.activePlanStatus()))
            .fontSize(12)
            .fontColor(this.colorForInteractionStatus(this.activePlanStatus()))
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(56)

      Scroll() {
        Column({ space: 8 }) {
          if (this.activePlanSteps().length > 0) {
            this.buildPlanProgressTitle(false)
            ForEach(this.activePlanSteps(), (step: AgentHomePlanStep) => {
              this.buildPlanStepRow(step, false)
            }, (step: AgentHomePlanStep): string => step.id)
          } else {
            Text(this.planFallbackDisplayContent(this.activePlanContent()))
              .width('100%')
              .fontSize(14)
              .lineHeight(21)
              .fontColor($r('app.color.text_body'))
              .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
              .copyOption(CopyOptions.LocalDevice)
          }
        }
        .width('100%')
      }
      .width('100%')
      .layoutWeight(1)
      .backgroundColor($r('app.color.background_surface'))
      .border({ width: 1, color: $r('app.color.card_border') })
      .borderRadius(12)
      .padding(12)

      Row({ space: 8 }) {
        Button($r('app.string.agent_home_plan_reject'))
          .layoutWeight(1)
          .height(40)
          .fontSize(13)
          .borderRadius(10)
          .fontColor($r('app.color.text_body'))
          .backgroundColor($r('app.color.background_secondary'))
          .enabled(this.activePlanStatus() === AgentHomeInteractionStatus.PENDING)
          .onClick((): void => {
            const item = this.activePlan();
            if (item) {
              this.respondToPlan(item, AgentHomeInteractionStatus.REJECTED);
            }
          })
        Button($r('app.string.agent_home_plan_implement'))
          .layoutWeight(1)
          .height(40)
          .fontSize(13)
          .borderRadius(10)
          .fontColor($r('app.color.text_white'))
          .backgroundColor(this.agentHomeSolidControlBackgroundColor())
          .enabled(this.activePlanStatus() === AgentHomeInteractionStatus.PENDING)
          .onClick((): void => {
            const item = this.activePlan();
            if (item) {
              this.respondToPlan(item, AgentHomeInteractionStatus.IMPLEMENTING);
            }
          })
      }
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10, bottom: this.bottomInsetVp + 16 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildPlanStepRow(step: AgentHomePlanStep, compact: boolean): void {
    Row({ space: 10 }) {
      SymbolGlyph(this.symbolForPlanStepStatus(step.status))
        .fontSize(compact ? 15 : 17)
        .fontColor([this.colorForPlanStepStatus(step.status)])
      Column({ space: 3 }) {
        Text(step.title)
          .width('100%')
          .fontSize(compact ? 12 : 14)
          .lineHeight(compact ? 18 : 21)
          .fontColor($r('app.color.text_body'))
          .maxLines(compact ? 2 : 5)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .textSelectable(TextSelectableMode.SELECTABLE_UNFOCUSABLE)
          .copyOption(CopyOptions.LocalDevice)
        if (!compact) {
          Text(this.displayPlanStepStatus(step.status))
            .fontSize(11)
            .fontColor(this.colorForPlanStepStatus(step.status))
            .maxLines(1)
        }
      }
      .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: compact ? 0 : 10, right: compact ? 0 : 10, top: compact ? 0 : 8, bottom: compact ? 0 : 8 })
    .backgroundColor(Color.Transparent)
    .borderRadius(compact ? 0 : 10)
    .border({
      width: 0,
      color: Color.Transparent
    })
  }

  @Builder
  private buildPlanProgressTitle(compact: boolean): void {
    Text($r('app.string.agent_home_plan_progress_title'))
      .width('100%')
      .fontSize(compact ? 11 : 13)
      .fontWeight(FontWeight.Medium)
      .fontColor($r('app.color.text_secondary'))
      .maxLines(1)
  }

  @Builder
  private buildPreviewSheet(): void {
    Column({ space: 14 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text($r('app.string.agent_home_preview_title'))
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_body'))
            .maxLines(1)
          Text($r('app.string.agent_home_preview_sheet_hint'))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(56)

      Text($r('app.string.agent_home_preview_path_label'))
        .width('100%')
        .fontSize(13)
        .fontColor($r('app.color.text_secondary'))

      TextInput({ placeholder: $r('app.string.agent_home_preview_path_placeholder'), text: this.previewPath })
        .width('100%')
        .height(42)
        .fontSize(14)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.previewPath = value;
          this.persistProfile();
        })

      Button($r('app.string.agent_home_preview_request'))
        .width('100%')
        .height(42)
        .fontSize(14)
        .borderRadius(12)
        .backgroundColor(this.agentHomeSolidControlBackgroundColor())
        .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED)
        .onClick((): void => {
          this.handleAction(AgentHomeActionKey.REQUEST_PREVIEW);
        })

      if (this.hasPreviewForActiveSession()) {
        this.buildLatestPreviewCard()
      } else {
        Column({ space: 10 }) {
          SymbolGlyph($r('sys.symbol.doc_plaintext_and_checkmark'))
            .fontSize(28)
            .fontColor([$r('app.color.text_muted')])
          Text($r('app.string.agent_home_preview_empty'))
            .fontSize(14)
            .fontColor($r('app.color.text_secondary'))
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .height(180)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(14)
        .border({ width: 1, color: $r('app.color.card_border') })
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10, bottom: this.bottomInsetVp + 16 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSessionDetailsSheet(): void {
    Column({ space: 14 }) {
      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text($r('app.string.agent_home_status_detail_title'))
            .fontSize(24)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.agentHomeReadableTextColor())
            .maxLines(1)
          Text($r('app.string.agent_home_status_detail_hint'))
            .fontSize(12)
            .fontColor(this.agentHomeReadableSecondaryColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

      }
      .width('100%')
      .height(56)

      Scroll() {
        Column({ space: 14 }) {
          Column({ space: 8 }) {
            Row({ space: 8 }) {
              Text($r('app.string.agent_home_status_detail_context'))
                .fontSize(13)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.agentHomeReadableSecondaryColor())
                .layoutWeight(1)
              Text(this.currentContextUsageText())
                .fontSize(13)
                .fontColor(this.agentHomeReadableTextColor())
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
            .width('100%')

            Progress({ value: this.currentContextUsagePercentValue(), total: 100, type: ProgressType.Linear })
              .width('100%')
              .height(5)
              .color(this.resolveComposerStatusColor())
          }
          .width('100%')
          .padding(12)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })

          this.buildSessionDetailSectionTitle($r('app.string.agent_home_status_detail_session'))
          Column({ space: 10 }) {
            this.buildSessionDetailRow($r('app.string.agent_home_detail_session_title'), this.currentSessionTitle())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_local_session'), this.currentLocalSessionIdText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_workspace_title'), this.currentWorkspaceTitle())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_workspace_path'), this.currentWorkspacePath())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_branch'), this.currentBranchName())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_updated_at'), this.currentSessionUpdatedText())
          }
          .width('100%')
          .padding(12)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })

          this.buildSessionDetailSectionTitle($r('app.string.agent_home_status_detail_runtime'))
          Column({ space: 10 }) {
            this.buildSessionDetailRow($r('app.string.agent_home_detail_connection_status'), this.resolveConnectionStatusPlainText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_endpoint'), this.resolveDetailValue(this.bridgeEndpoint))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_provider'), this.currentProviderOption().displayName)
            this.buildSessionDetailRow($r('app.string.agent_home_detail_model'), this.currentModelDisplayText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_speed'), this.selectedSpeedMode)
            this.buildSessionDetailRow($r('app.string.agent_home_detail_reasoning'), this.selectedReasoningMode)
            this.buildSessionDetailRow($r('app.string.agent_home_detail_permission_mode'), this.resolveDetailValue(this.currentPermissionModeDisplayText()))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_bridge_session'), this.currentBridgeSessionId())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_remote_source'), this.currentRemoteSourceText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_remote_messages'), this.currentRemoteMessageCountText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_reply_state'), this.resolveReplyStateText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_active_tool'), this.resolveDetailValue(this.activeToolName))
            if (this.currentProviderSupportsVisibleSubagents()) {
              this.buildSessionDetailRow($r('app.string.agent_home_detail_subagent'), this.resolveDetailValue(this.currentVisibleSubagentName()))
            }
          }
          .width('100%')
          .padding(12)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })

          this.buildSessionDetailSectionTitle($r('app.string.agent_home_status_detail_context'))
          Column({ space: 10 }) {
            this.buildSessionDetailRow($r('app.string.agent_home_detail_messages'), String(this.activeSessionMessageCount()))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_input_tokens'), this.formatTokenCount(this.estimateInputTokens()))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_output_tokens'), this.formatTokenCount(this.estimateOutputTokens()))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_total_tokens'), this.formatTokenCount(this.estimateCurrentContextTokens()))
            this.buildSessionDetailRow($r('app.string.agent_home_detail_context_limit'), this.currentContextLimitText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_context_remaining'), this.currentContextRemainingText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_context_usage'), this.currentContextUsageText())
          }
          .width('100%')
          .padding(12)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })

          this.buildSessionDetailSectionTitle($r('app.string.agent_home_status_detail_cost'))
          Column({ space: 10 }) {
            this.buildSessionDetailRow($r('app.string.agent_home_detail_estimated_cost'), this.estimateCurrentCostText())
            this.buildSessionDetailRow($r('app.string.agent_home_detail_pricing'), this.currentPricingSourceText())
          }
          .width('100%')
          .padding(12)
          .backgroundColor($r('app.color.background_surface'))
          .borderRadius(12)
          .border({ width: 1, color: $r('app.color.card_border') })
        }
        .width('100%')
        .padding({ bottom: this.bottomInsetVp + 12 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: 10 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.agentHomeSurfaceBackgroundEffect())
    .border({
      width: this.agentHomeSurfaceBorderWidth(),
      color: this.agentHomeSurfaceBorderColor()
    })
    .shadow(this.agentHomeSurfaceShadowOptions())
    .visualEffect(this.agentHomeSurfaceVisualEffect())
    .clip(true)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  private buildSessionDetailSectionTitle(title: ResourceStr): void {
    Text(title)
      .width('100%')
      .fontSize(13)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.agentHomeReadableSecondaryColor())
  }

  @Builder
  private buildSessionDetailRow(label: ResourceStr, value: string): void {
    Row({ space: 10 }) {
      Text(label)
        .fontSize(12)
        .fontColor(this.agentHomeReadableSecondaryColor())
        .width(104)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(value.length > 0 ? value : this.resolveDetailEmptyText())
        .fontSize(13)
        .fontColor(this.agentHomeReadableTextColor())
        .layoutWeight(1)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.End)
    }
    .width('100%')
  }

  @Builder
  private buildLatestPreviewCard(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Text(this.latestPreviewPath())
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.latestPreviewMediaType())
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
      }
      .width('100%')

      if (this.latestPreviewContent().length === 0) {
        this.buildLatestPreviewEmptyStage()
      } else if (this.latestPreviewContentKind() === NGFRichContentKind.IMAGE) {
        this.buildLatestRasterPreviewStage(this.latestPreviewContent())
      } else {
        NGFRichContentRenderer({
          content: this.latestPreviewContent(),
          contentKind: this.latestPreviewContentKind(),
          mediaType: this.latestPreviewMediaType(),
          isDarkMode: this.isDarkMode,
          previewSurfaceDark: this.isDarkMode,
          bottomPadding: 14
        })
        .width('100%')
        .height(260)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(12)
        .border({ width: 1, color: $r('app.color.card_border') })
      }
    }
    .width('100%')
    .padding(12)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(14)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildLatestPreviewEmptyStage(): void {
    Column({ space: 10 }) {
      SymbolGlyph($r('sys.symbol.doc_plaintext'))
        .fontSize(28)
        .fontColor([$r('app.color.text_muted')])
      Text($r('app.string.agent_home_workspace_content_preview_empty'))
        .fontSize(14)
        .fontColor($r('app.color.text_secondary'))
        .textAlign(TextAlign.Center)
    }
    .width('100%')
    .height(260)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildLatestRasterPreviewStage(content: string): void {
    Column() {
      Image(this.latestWorkspaceRasterPreviewImageSource(content))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Contain)
    }
    .width('100%')
    .height(260)
    .padding(12)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(this.isDarkMode ? '#111827' : '#F8FAFC')
    .borderRadius(12)
    .border({ width: 1, color: $r('app.color.card_border') })
    .clip(true)
  }

  @Builder
  private buildProviderOptionRow(provider: AgentBridgeProviderOption): void {
    Column({ space: 5 }) {
      Row() {
        Text(provider.displayName)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.selectedProviderId === provider.id ? $r('app.color.text_white') : $r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(provider.status)
          .fontSize(11)
          .fontColor(this.selectedProviderId === provider.id ? $r('app.color.text_white') : $r('app.color.text_secondary'))
          .maxLines(1)
      }
      .width('100%')

      Text(this.buildProviderFeatureText(provider))
        .width('100%')
        .fontSize(11)
        .fontColor(this.selectedProviderId === provider.id ? $r('app.color.text_white') : $r('app.color.text_secondary'))
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding(10)
    .borderRadius(10)
      .backgroundColor(this.selectedProviderId === provider.id ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
    .onClick((): void => {
      this.selectProvider(provider.id);
    })
  }

  @Builder
  private buildModelSheetSectionHeader(title: ResourceStr, symbol: Resource): void {
    Row({ space: 6 }) {
      SymbolGlyph(symbol)
        .fontSize(15)
        .fontColor([$r('app.color.text_secondary')])
      Text(title)
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_body'))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(24)
  }

  @Builder
  private buildModelOptionRow(model: AgentBridgeModelOption): void {
    Column({ space: 5 }) {
      Row({ space: 6 }) {
        Image(this.iconForModel(model))
          .width(26)
          .height(26)
          .objectFit(ImageFit.Contain)
        Blank()
          .layoutWeight(1)
        SymbolGlyph(this.selectedModelId === model.id ? $r('sys.symbol.checkmark_circle') : $r('sys.symbol.circle'))
          .fontSize(16)
          .fontColor([this.selectedModelId === model.id ? $r('app.color.text_white') : $r('app.color.text_muted')])
      }
      .width('100%')
      Column({ space: 1 }) {
        Text(model.displayName)
          .width('100%')
          .fontSize(13)
          .fontColor(this.selectedModelId === model.id ? $r('app.color.text_white') : $r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(model.contextWindow > 0 ? this.formatTokenCount(model.contextWindow) : model.vendor)
          .width('100%')
          .fontSize(10)
          .fontColor(this.selectedModelId === model.id ? $r('app.color.text_white') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
    }
    .width('100%')
    .height(70)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .borderRadius(10)
    .backgroundColor(this.selectedModelId === model.id ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
    .onClick((): void => {
      this.selectModel(model.id);
    })
  }

  @Builder
  private buildSpeedModeOptionRow(mode: AgentBridgeSpeedModeOption): void {
    Column({ space: 5 }) {
      SymbolGlyph(this.symbolForSpeedMode(mode.id))
        .fontSize(19)
        .fontColor([this.selectedSpeedMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_secondary')])
      Column({ space: 1 }) {
        Text(mode.displayName)
          .width('100%')
          .fontSize(13)
          .fontColor(this.selectedSpeedMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_body'))
          .maxLines(1)
        Text(mode.description)
          .width('100%')
          .fontSize(10)
          .fontColor(this.selectedSpeedMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
    }
    .width('100%')
    .height(70)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .borderRadius(10)
    .backgroundColor(this.selectedSpeedMode === mode.id ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
    .onClick((): void => {
      this.selectSpeedMode(mode.id);
    })
  }

  @Builder
  private buildReasoningModeOptionRow(mode: AgentBridgeReasoningModeOption): void {
    Column({ space: 5 }) {
      SymbolGlyph(this.symbolForReasoningMode(mode.id))
        .fontSize(19)
        .fontColor([this.selectedReasoningMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_secondary')])
      Column({ space: 1 }) {
        Text(mode.displayName)
          .width('100%')
          .fontSize(13)
          .fontColor(this.selectedReasoningMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_body'))
          .maxLines(1)
        Text(mode.description)
          .width('100%')
          .fontSize(10)
          .fontColor(this.selectedReasoningMode === mode.id ? $r('app.color.text_white') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
    }
    .width('100%')
    .height(70)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .borderRadius(10)
    .backgroundColor(this.selectedReasoningMode === mode.id ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
    .onClick((): void => {
      this.selectReasoningMode(mode.id);
    })
  }

  @Builder
  private buildInteractionModeOptionRow(mode: AgentBridgeInteractionModeOption): void {
    Column({ space: 5 }) {
      Row({ space: 6 }) {
        SymbolGlyph(this.symbolForInteractionMode(mode.id))
          .fontSize(19)
          .fontColor([this.isInteractionModeSelected(mode.id) ? $r('app.color.text_white') : $r('app.color.text_secondary')])
        Blank()
          .layoutWeight(1)
        SymbolGlyph(this.isInteractionModeSelected(mode.id) ? $r('sys.symbol.checkmark_circle') : $r('sys.symbol.circle'))
          .fontSize(16)
          .fontColor([this.isInteractionModeSelected(mode.id) ? $r('app.color.text_white') : $r('app.color.text_muted')])
      }
      .width('100%')
      Column({ space: 1 }) {
        Text(mode.displayName)
          .width('100%')
          .fontSize(13)
          .fontColor(this.isInteractionModeSelected(mode.id) ? $r('app.color.text_white') : $r('app.color.text_body'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(mode.agent.length > 0 ? mode.agent : mode.id)
          .width('100%')
          .fontSize(10)
          .fontColor(this.isInteractionModeSelected(mode.id) ? $r('app.color.text_white') : $r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
    }
    .width('100%')
    .height(70)
    .padding({ left: 10, right: 10, top: 8, bottom: 8 })
    .borderRadius(10)
    .backgroundColor(this.isInteractionModeSelected(mode.id) ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
    .onClick((): void => {
      this.toggleInteractionMode(mode.id);
    })
  }

  @Builder
  private buildToolOptionRow(tool: AgentBridgeToolOption): void {
    Column({ space: 4 }) {
      Row() {
        Text(tool.displayName)
          .fontSize(13)
          .fontColor($r('app.color.text_body'))
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(tool.risk)
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')

      Text(tool.description)
        .width('100%')
        .fontSize(11)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding(10)
    .borderRadius(10)
    .backgroundColor($r('app.color.background_surface'))
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildProviderPill(providerId: string, title: ResourceStr): void {
    Button(title)
      .layoutWeight(1)
      .height(38)
      .fontSize(13)
      .borderRadius(10)
      .fontColor(this.selectedProviderId === providerId ? $r('app.color.text_white') : $r('app.color.text_body'))
      .backgroundColor(this.selectedProviderId === providerId ? this.agentHomeSolidControlBackgroundColor() : $r('app.color.background_secondary'))
      .onClick((): void => {
        this.selectProvider(providerId);
      })
  }

  private normalizedHdsMaterialLevel(): hdsMaterial.MaterialLevel {
    if (this.effectiveMaterialLevel === hdsMaterial.MaterialLevel.EXQUISITE) {
      return hdsMaterial.MaterialLevel.EXQUISITE;
    }
    if (this.effectiveMaterialLevel === hdsMaterial.MaterialLevel.GENTLE) {
      return hdsMaterial.MaterialLevel.GENTLE;
    }
    if (this.effectiveMaterialLevel === hdsMaterial.MaterialLevel.SMOOTH) {
      return hdsMaterial.MaterialLevel.SMOOTH;
    }
    return hdsMaterial.MaterialLevel.GENTLE;
  }

  private buildAgentHomeSurfacePreset(): NGFHdsMaterialSurfacePreset {
    return NGFHdsEffectPresetFactory.buildMaterialSurfacePreset(this.normalizedHdsMaterialLevel(), false);
  }

  private buildHomeActionSurfacePreset(actionKey: string): NGFHdsMaterialSurfacePreset {
    return NGFHdsEffectPresetFactory.buildMaterialSurfacePreset(
      this.normalizedHdsMaterialLevel(),
      this.pressedHomeActionKey === actionKey
    );
  }

  private agentHomeSurfaceBackgroundEffect(): BackgroundEffectOptions {
    return this.buildAgentHomeSurfacePreset().backgroundEffect;
  }

  private agentHomeSurfaceBorderWidth(): number {
    return this.buildAgentHomeSurfacePreset().borderWidth;
  }

  private agentHomeSurfaceBorderColor(): ResourceColor {
    return this.buildAgentHomeSurfacePreset().borderColor;
  }

  private agentHomeSolidControlBackgroundColor(): ResourceColor {
    return $r('app.color.component_control_bg');
  }

  private globalSettingSelectedBackgroundColor(): ResourceColor {
    if (this.isDarkMode) {
      return '#264A7DFF';
    }
    return '#EAF2FF';
  }

  private agentHomeReadableTextColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_white_high');
    }
    return $r('app.color.text_body');
  }

  private agentHomeReadableSecondaryColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_white_medium');
    }
    return $r('app.color.text_secondary');
  }

  private agentHomeReadableMutedColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_white_low');
    }
    return $r('app.color.text_muted');
  }

  private conversationRichContentDarkMode(): boolean {
    if (this.currentTheme === NGFThemeMode.DARK) {
      return true;
    }
    if (this.currentTheme === NGFThemeMode.LIGHT) {
      return false;
    }
    return this.isDarkMode;
  }

  private conversationRichContentThemeKey(): string {
    return this.conversationRichContentDarkMode() ? 'dark' : 'light';
  }

  private workspacePreviewMediaStageBackgroundColor(): ResourceColor {
    if (this.activeWorkspacePreviewSurfaceDark) {
      return '#111827';
    }
    return '#F8FAFC';
  }

  private agentHomeControlIconColor(emphasized: boolean): ResourceColor {
    if (this.isDarkMode) {
      if (emphasized) {
        return $r('app.color.text_white_high');
      }
      return $r('app.color.text_white_medium');
    }
    if (emphasized) {
      return $r('app.color.tag_blue');
    }
    return $r('app.color.text_secondary');
  }

  private agentHomeControlTextColor(emphasized: boolean): ResourceColor {
    if (this.isDarkMode) {
      if (emphasized) {
        return $r('app.color.text_white_high');
      }
      return $r('app.color.text_white_medium');
    }
    if (emphasized) {
      return $r('app.color.tag_blue');
    }
    return $r('app.color.text_body');
  }

  private runModePillBackgroundColor(selected: boolean): ResourceColor {
    if (!selected) {
      return Color.Transparent;
    }
    if (this.isDarkMode) {
      return '#1D4ED8';
    }
    return '#EAF2FF';
  }

  private runModePillBorderColor(selected: boolean): ResourceColor {
    if (!selected) {
      return this.agentHomeSurfaceBorderColor();
    }
    if (this.isDarkMode) {
      return '#93C5FD';
    }
    return $r('app.color.tag_blue');
  }

  private runModePillBorderWidth(selected: boolean): number {
    if (selected) {
      return 1.5;
    }
    return this.agentHomeSurfaceBorderWidth();
  }

  private agentHomeSelectedBorderColor(selected: boolean): ResourceColor {
    if (selected) {
      return $r('app.color.tag_blue');
    }
    return this.agentHomeSurfaceBorderColor();
  }

  private mainFileTabBackgroundColor(index: number): ResourceColor {
    if (this.workspacePanelTabIndex !== index) {
      return Color.Transparent;
    }
    if (this.isDarkMode) {
      return '#26FFFFFF';
    }
    return '#F7FFFFFF';
  }

  private mainFileTabTextColor(index: number): ResourceColor {
    if (this.workspacePanelTabIndex === index) {
      return $r('app.color.tag_blue');
    }
    return this.agentHomeReadableSecondaryColor();
  }

  private mainFileTabCounterColor(index: number): ResourceColor {
    if (this.workspacePanelTabIndex === index) {
      return $r('app.color.tag_blue');
    }
    return this.agentHomeReadableMutedColor();
  }

  private agentHomeSurfaceShadowOptions(): ShadowOptions {
    return this.buildAgentHomeSurfacePreset().shadowOptions;
  }

  private agentHomeSurfaceVisualEffect(): VisualEffect {
    return this.buildAgentHomeSurfacePreset().buildVisualEffect();
  }

  private agentHomeSurfaceScaleOptions(): ScaleOptions {
    return this.buildAgentHomeSurfacePreset().scaleOptions;
  }

  private agentHomeSurfaceTranslateOptions(): TranslateOptions {
    return this.buildAgentHomeSurfacePreset().translateOptions;
  }

  private compactComposerBorderWidth(): number {
    if (this.isReplyInProgress() || this.isContextCompacting || this.connectionStatus !== AgentBridgeConnectionStatus.DISCONNECTED) {
      return 1.2;
    }
    return this.agentHomeSurfaceBorderWidth();
  }

  private compactComposerBorderColor(): ResourceColor {
    if (this.isReplyInProgress() || this.isContextCompacting || this.connectionStatus !== AgentBridgeConnectionStatus.DISCONNECTED) {
      return this.resolveComposerStatusColor();
    }
    return this.agentHomeSurfaceBorderColor();
  }

  private agentHomeFloatingShadowColor(): ResourceColor {
    if (this.isDarkMode) {
      return '#3A000000';
    }
    return '#26000000';
  }

  private conversationRenderOverlayColor(): ResourceColor {
    if (this.isDarkMode) {
      return '#66000000';
    }
    return '#66FFFFFF';
  }

  private agentHomeSessionShadowColor(selected: boolean): ResourceColor {
    if (selected) {
      if (this.isDarkMode) {
        return '#332563EB';
      }
      return '#1A2563EB';
    }
    if (this.isDarkMode) {
      return '#24000000';
    }
    return '#08000000';
  }

  @Builder
  private buildIconButton(symbol: Resource, actionKey: string, emphasized: boolean): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(24)
        .fontColor([emphasized ? $r('app.color.text_body') : $r('app.color.text_secondary')])
    }
    .width(40)
    .height(40)
    .borderRadius(20)
    .backgroundColor(Color.Transparent)
    .onClick((): void => {
      this.handleAction(actionKey);
    })
  }

  @Builder
  private buildComposerMaterialIconButton(symbol: Resource, actionKey: string, emphasized: boolean): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(22)
        .fontColor([this.agentHomeControlIconColor(emphasized)])
    }
    .width(40)
    .height(40)
    .borderRadius(20)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
    .translate(this.buildAgentHomeSurfacePreset().translateOptions)
    .clip(true)
    .onClick((): void => {
      this.handleAction(actionKey);
    })
  }

  @Builder
  private buildComposerModelButton(): void {
    Button() {
      Image(this.currentModelIcon())
        .width(22)
        .height(22)
        .objectFit(ImageFit.Contain)
    }
    .width(40)
    .height(40)
    .borderRadius(20)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
    .translate(this.buildAgentHomeSurfacePreset().translateOptions)
    .clip(true)
    .onClick((): void => {
      this.handleAction(AgentHomeActionKey.OPEN_MODELS);
    })
  }

  @Builder
  private buildComposerPermissionModeButton(): void {
    Button() {
      SymbolGlyph(this.symbolForCurrentPermissionMode())
        .fontSize(22)
        .fontColor([this.agentHomeControlIconColor(this.isPermissionModeNonDefault())])
    }
    .width(40)
    .height(40)
    .borderRadius(20)
    .backgroundColor(Color.Transparent)
    .buttonStyle(ButtonStyleMode.NORMAL)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .scale(this.buildAgentHomeSurfacePreset().scaleOptions)
    .translate(this.buildAgentHomeSurfacePreset().translateOptions)
    .clip(true)
    .bindPopup(this.isPermissionModePopupOpen, {
      builder: (): void => {
        this.buildPermissionModePopup()
      },
      placement: Placement.Top,
      popupColor: Color.Transparent,
      enableArrow: true,
      autoCancel: true,
      mask: false,
      targetSpace: 8,
      onStateChange: (event: PopupStateChangeParam): void => {
        this.isPermissionModePopupOpen = event.isVisible;
      }
    })
    .onClick((): void => {
      this.isPermissionModePopupOpen = !this.isPermissionModePopupOpen;
    })
  }

  @Builder
  private buildPermissionModePopup(): void {
    Column({ space: 6 }) {
      ForEach(this.currentProviderInteractionModesForCategory('approval'), (mode: AgentBridgeInteractionModeOption) => {
        this.buildPermissionModePopupRow(mode)
      }, (mode: AgentBridgeInteractionModeOption): string => mode.id)
    }
    .width(238)
    .padding({ left: 8, right: 8, top: 8, bottom: 8 })
    .backgroundColor(Color.Transparent)
    .backgroundEffect(this.buildAgentHomeSurfacePreset().backgroundEffect)
    .border({
      width: this.buildAgentHomeSurfacePreset().borderWidth,
      color: this.buildAgentHomeSurfacePreset().borderColor
    })
    .borderRadius(18)
    .shadow(this.buildAgentHomeSurfacePreset().shadowOptions)
    .visualEffect(this.buildAgentHomeSurfacePreset().buildVisualEffect())
    .clip(true)
  }

  @Builder
  private buildPermissionModePopupRow(mode: AgentBridgeInteractionModeOption): void {
    Row({ space: 9 }) {
      SymbolGlyph(this.symbolForInteractionMode(mode.id))
        .fontSize(18)
        .fontColor([this.isCurrentPermissionMode(mode.id) ? $r('app.color.text_white') : this.agentHomeReadableSecondaryColor()])
      Column({ space: 2 }) {
        Text(mode.displayName)
          .width('100%')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.isCurrentPermissionMode(mode.id) ? $r('app.color.text_white') : this.agentHomeReadableTextColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(mode.description)
          .width('100%')
          .fontSize(10)
          .fontColor(this.isCurrentPermissionMode(mode.id) ? $r('app.color.text_white') : this.agentHomeReadableSecondaryColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .layoutWeight(1)
      SymbolGlyph(this.isCurrentPermissionMode(mode.id) ? $r('sys.symbol.checkmark_circle') : $r('sys.symbol.circle'))
        .fontSize(15)
        .fontColor([this.isCurrentPermissionMode(mode.id) ? $r('app.color.text_white') : this.agentHomeReadableMutedColor()])
    }
    .width('100%')
    .height(48)
    .padding({ left: 10, right: 10 })
    .borderRadius(12)
    .backgroundColor(this.isCurrentPermissionMode(mode.id) ? this.agentHomeSolidControlBackgroundColor() : Color.Transparent)
    .onClick((): void => {
      this.selectInteractionModeInCategory(mode.id);
      this.isPermissionModePopupOpen = false;
    })
  }

  @Builder
  private buildStopReplyButton(): void {
    Button() {
      SymbolGlyph($r('sys.symbol.stop_circle_fill'))
        .fontSize(24)
        .fontColor([$r('app.color.panel_background')])
    }
    .width(40)
    .height(40)
    .borderRadius(20)
    .backgroundColor($r('app.color.tag_red'))
    .onClick((): void => {
      this.handleStopReply();
    })
  }

  @Builder
  private buildSheetIconButton(symbol: Resource, actionKey: string): void {
    Button() {
      SymbolGlyph(symbol)
        .fontSize(24)
        .fontColor([$r('app.color.text_secondary')])
    }
    .width(42)
    .height(42)
    .borderRadius(21)
    .backgroundColor(Color.Transparent)
    .onClick((): void => {
      this.handleAction(actionKey);
    })
  }

  private conversationContentTopPadding(): number {
    return 18;
  }

  private isOnboardingBridgeStepComplete(): boolean {
    return this.bridgeEndpoint.trim().length > 0 && this.bridgeToken.trim().length > 0;
  }

  private isOnboardingConnectionStepComplete(): boolean {
    return this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED;
  }

  private isOnboardingSessionStepComplete(): boolean {
    return this.activeSessionId.length > 0;
  }

  private isOnboardingStepActive(step: string): boolean {
    if (this.isOnboardingConnectionStepComplete()) {
      return step === 'session' && !this.isOnboardingSessionStepComplete();
    }
    if (!this.isOnboardingBridgeStepComplete()) {
      return step === 'bridge' || step === 'connection';
    }
    return step === 'connection';
  }

  private shouldShowConversationInlineStatus(): boolean {
    return this.activeSessionId.length > 0 && (this.activeTurnTimerVisible || this.isContextCompacting);
  }

  private shouldShowContextCompactingDivider(): boolean {
    return this.activeSessionId.length > 0 && this.isContextCompacting;
  }

  private shouldShowActiveTurnTimerRow(): boolean {
    return this.activeSessionId.length > 0 && this.activeTurnTimerVisible;
  }

  private agentHomeMainPageTitleBarSpacerHeight(): number {
    return this.statusInsetVp + 68;
  }

  private workspaceTitleBarUnderlayColor(): ResourceColor {
    if (this.isDarkMode) {
      return '#F20A1020';
    }
    return '#EAF3F7FB';
  }

  private shouldUseWorkspaceTitleBarContrast(): boolean {
    return this.isDarkMode &&
      (this.mainPageIndex === AgentHomeMainPageIndex.WORKSPACES ||
        this.mainPageIndex === AgentHomeMainPageIndex.WORKSPACE_BROWSER);
  }

  private agentHomeTitleSubtitle(): string {
    const workspaceTitle = this.currentWorkspaceTitle();
    const sessionCount = this.sessionsForActiveWorkspace().length;
    const sessionsLabel = resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_sessions_title'));
    const statusText = resolveResourceString(this.getUIContext().getHostContext(), this.resolveConnectionStatusText());
    return workspaceTitle + ' / ' + String(sessionCount) + ' ' + sessionsLabel + ' / ' + statusText;
  }

  private agentHomeTitleBarMenuActions(): Array<NGFHdsTitleBarMenuAction> {
    const actions: Array<NGFHdsTitleBarMenuAction> = [];
    if (this.isLargeScreenNavigation) {
      return actions;
    }
    actions.push(new NGFHdsTitleBarMenuAction(
      $r('sys.symbol.plus'),
      $r('app.string.agent_home_new_session'),
      (): void => {
        this.handleAction(AgentHomeActionKey.NEW_SESSION);
      }
    ));
    actions.push(new NGFHdsTitleBarMenuAction(
      $r('sys.symbol.ellipsis_message'),
      $r('app.string.agent_home_sessions_title'),
      (): void => {
        this.handleAction(AgentHomeActionKey.OPEN_SESSIONS);
      }
    ));
    actions.push(new NGFHdsTitleBarMenuAction(
      $r('sys.symbol.gearshape'),
      $r('app.string.agent_home_connection_title'),
      (): void => {
        this.handleAction(AgentHomeActionKey.OPEN_SETTINGS);
      }
    ));
    return actions;
  }

  private conversationContentBottomPadding(): number {
    if (this.shouldShowDisconnectedComposerState()) {
      let disconnectedPadding = this.bottomInsetVp + 18;
      if (this.shouldShowAgentFilterBar()) {
        disconnectedPadding = disconnectedPadding + AGENT_HOME_AGENT_FILTER_BAR_HEIGHT;
      }
      return disconnectedPadding;
    }
    const progress = this.clampComposerProgress(this.composerExpansionProgress);
    const composerHeight = AGENT_HOME_COMPACT_COMPOSER_HEIGHT +
      (AGENT_HOME_BASE_COMPOSER_HEIGHT - AGENT_HOME_COMPACT_COMPOSER_HEIGHT) * progress;
    let bottomPadding = this.bottomInsetVp + composerHeight;
    if (this.shouldShowAgentFilterBar()) {
      bottomPadding = bottomPadding + AGENT_HOME_AGENT_FILTER_BAR_HEIGHT;
    }
    if (this.transientStatusVisible) {
      bottomPadding = bottomPadding + 38;
    }
    if (this.attachments.length > 0) {
      bottomPadding = bottomPadding + 54;
    }
    if (this.shouldShowRunModeControls()) {
      bottomPadding = bottomPadding + this.runModeControlsReservedHeight() * progress;
    }
    if (this.shouldShowSlashCommandMenu()) {
      bottomPadding = bottomPadding + this.slashCommandMenuHeight() + 20;
    }
    bottomPadding = bottomPadding + this.composerFloatingControlsReservedHeight();
    return bottomPadding;
  }

  private composerFloatingControlsReservedHeight(): number {
    if (!this.shouldShowComposerPlanPanel() && !this.showConversationBottomButton) {
      return 0;
    }
    if (this.shouldShowComposerPlanPanel() && this.isComposerPlanPanelExpanded) {
      return 146;
    }
    return 42;
  }

  private readInsets(): void {
    NGFPageWindowSupport.loadDynamicTopInset(
      this.getUIContext(),
      0,
      AGENT_HOME_DEFAULT_STATUS_INSET,
      (inset: number): void => {
        this.statusInsetVp = inset;
      }
    );
    const uiCtx = this.getUIContext();
    if (!uiCtx) {
      return;
    }
    const hostCtx = uiCtx.getHostContext();
    if (!hostCtx) {
      return;
    }
    window.getLastWindow(hostCtx).then((lastWindow: window.Window): void => {
      const bottomArea: window.AvoidArea = lastWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      this.bottomInsetVp = uiCtx.px2vp(bottomArea.bottomRect.height);
    }).catch((_err: Error): void => {
      this.bottomInsetVp = 12;
    });
  }

  private initializeDefaults(): void {
    if (this.workspaces.length > 0) {
      return;
    }
    const bootstrap = this.buildBootstrapState();
    this.bridgeEndpoint = bootstrap.profile.endpoint;
    this.bridgeToken = bootstrap.profile.token;
    this.previewPath = bootstrap.profile.previewPath;
    this.selectedProviderId = bootstrap.profile.providerId;
    this.sessionImportProviderId = bootstrap.profile.providerId;
    this.newSessionProviderId = bootstrap.profile.providerId;
    this.selectedModelId = bootstrap.profile.modelId;
    this.newSessionModelId = bootstrap.profile.modelId;
    this.selectedSpeedMode = bootstrap.profile.speedMode;
    this.newSessionSpeedMode = bootstrap.profile.speedMode;
    this.selectedReasoningMode = bootstrap.profile.reasoningMode;
    this.newSessionReasoningMode = bootstrap.profile.reasoningMode;
    this.activeWorkspaceId = bootstrap.profile.activeWorkspaceId;
    this.activeSessionId = bootstrap.profile.activeSessionId;
    this.workspaces = bootstrap.workspaces;
    this.sessions = bootstrap.sessions;
    this.messages = [];
    this.previews = [];
    this.toolCalls = [];
    this.workspaceChanges = [];
    this.workspaceFiles = [];
    this.gitCommits = [];
    this.userRequests = [];
    this.syncPermissionRequestFlowLight();
    this.plans = [];
    this.syncWorkspaceDrafts();
  }

  private buildBootstrapState(): AgentHomeBootstrapState {
    const workspaces: Array<AgentHomeWorkspaceItem> = [];
    const sessions: Array<AgentHomeSessionItem> = [];
    const profile = new AgentHomeProfile(
      '',
      '',
      AgentBridgeProviderId.CODEX,
      'configured',
      'auto',
      'auto',
      '',
      '',
      '',
      Date.now()
    );
    return new AgentHomeBootstrapState(profile, workspaces, sessions);
  }

  private async loadPersistentState(): Promise<void> {
    try {
      const snapshot = await this.persistence.loadOrCreate(this.buildBootstrapState());
      this.applySnapshot(snapshot);
      this.remoteSessions = await this.persistence.loadRemoteSessions();
      this.ensureSessionImportProvider();
      logger.info(TAG, 'agent home state loaded from database');
      const shouldWaitHistory = this.shouldWaitForStartupHistorySync();
      if (shouldWaitHistory) {
        this.schedulePersistentStateLoadingTimeout();
      } else {
        this.finishPersistentStateLoading();
      }
      this.restoreLastBridgeConnection();
      if (shouldWaitHistory && this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
        const requestedHistory = this.refreshActiveSessionHistory();
        if (!requestedHistory) {
          this.finishPersistentStateLoading();
        }
      }
    } catch (e) {
      logger.error(TAG, 'load agent home state failed: ' + e);
      this.finishPersistentStateLoading();
    }
  }

  @Builder
  private buildWorkspaceChangeCompactStatusLabel(item: AgentHomeWorkspaceChangeItem): void {
    Text() {
      Span(this.workspaceChangeActionText(item))
        .fontSize(11)
        .fontColor(this.workspaceChangeStatusColor(item))
      if (this.isWorkspaceDirectoryChange(item)) {
        Span(' ' + this.workspaceChangeFileCountText(item))
          .fontSize(11)
          .fontColor(this.workspaceChangeStatusColor(item))
      }
      if (item.additions > 0) {
        Span(' +' + String(item.additions))
          .fontSize(11)
          .fontColor($r('app.color.tag_green'))
      }
      if (item.deletions > 0) {
        Span(' -' + String(item.deletions))
          .fontSize(11)
          .fontColor($r('app.color.tag_red'))
      }
      if (!this.isWorkspaceDirectoryChange(item) && item.additions === 0 && item.deletions === 0) {
        Span(' 0')
          .fontSize(11)
          .fontColor(this.workspaceChangeStatusColor(item))
      }
    }
    .maxLines(1)
    .textOverflow({ overflow: TextOverflow.Ellipsis })
  }

  private shouldWaitForStartupHistorySync(): boolean {
    if (!this.isPersistentStateLoading) {
      return false;
    }
    if (this.bridgeEndpoint.trim().length === 0 || this.bridgeToken.trim().length === 0) {
      return false;
    }
    const session = this.currentSession();
    if (!session || session.bridgeSessionId.length === 0) {
      return false;
    }
    if (session.providerId !== AgentBridgeProviderId.CODEX && session.providerId !== AgentBridgeProviderId.CLAUDE) {
      return false;
    }
    const provider = this.providerOptionForId(session.providerId);
    if (!provider || !provider.supportsHistory) {
      return false;
    }
    return true;
  }

  private beginStartupHistorySyncWait(localSessionId: string): void {
    if (!this.isPersistentStateLoading || localSessionId.length === 0) {
      return;
    }
    this.startupHistoryImportSessionId = localSessionId;
    this.schedulePersistentStateLoadingTimeout();
  }

  private finishStartupHistorySyncIfNeeded(localSessionId: string): void {
    if (this.startupHistoryImportSessionId.length === 0 || this.startupHistoryImportSessionId === localSessionId) {
      this.finishPersistentStateLoading();
    }
  }

  private schedulePersistentStateLoadingTimeout(): void {
    this.clearPersistentStateLoadingTimeout();
    this.persistentStateLoadingTimeoutTimer = setTimeout((): void => {
      logger.warn(TAG, 'startup history sync wait timed out');
      this.finishPersistentStateLoading();
    }, AGENT_HOME_STARTUP_HISTORY_SYNC_TIMEOUT_MS);
  }

  private finishPersistentStateLoading(): void {
    this.clearPersistentStateLoadingTimeout();
    this.isPersistentStateLoading = false;
    this.startupHistoryImportSessionId = '';
  }

  private clearPersistentStateLoadingTimeout(): void {
    if (this.persistentStateLoadingTimeoutTimer >= 0) {
      clearTimeout(this.persistentStateLoadingTimeoutTimer);
      this.persistentStateLoadingTimeoutTimer = -1;
    }
  }

  private applySnapshot(snapshot: AgentHomeStateSnapshot): void {
    this.bridgeEndpoint = snapshot.profile.endpoint;
    this.bridgeToken = snapshot.profile.token;
    const profileProviderId = this.normalizeSelectableProviderId(snapshot.profile.providerId);
    this.selectedProviderId = profileProviderId;
    this.sessionImportProviderId = profileProviderId;
    this.newSessionProviderId = profileProviderId;
    this.selectedModelId = snapshot.profile.modelId;
    this.newSessionModelId = snapshot.profile.modelId;
    this.selectedSpeedMode = snapshot.profile.speedMode;
    this.newSessionSpeedMode = snapshot.profile.speedMode;
    this.selectedReasoningMode = snapshot.profile.reasoningMode;
    this.newSessionReasoningMode = snapshot.profile.reasoningMode;
    this.activeWorkspaceId = snapshot.profile.activeWorkspaceId;
    this.activeSessionId = snapshot.profile.activeSessionId;
    this.previewPath = snapshot.profile.previewPath;
    this.workspaces = snapshot.workspaces;
    this.sessions = snapshot.sessions;
    this.messages = snapshot.messages;
    this.previews = this.normalizePersistedPreviewItems(snapshot.previews);
    this.toolCalls = snapshot.toolCalls;
    this.workspaceChanges = snapshot.changes;
    this.workspaceFiles = snapshot.files;
    this.gitCommits = snapshot.commits;
    this.userRequests = snapshot.userRequests;
    this.syncPermissionRequestFlowLight();
    this.plans = snapshot.plans;
    this.syncPlansFromToolCalls(this.toolCalls);
    this.bridgeConnectionReasonText = this.buildBridgeConnectionReasonText(this.connectionStatus, '');
    this.dedupeWorkspacesByPath();
    this.ensureSelectedRuntimeOptions();
    this.syncWorkspaceDrafts();
    this.scheduleConversationScrollToBottom(false);
  }

  private dedupeWorkspacesByPath(): void {
    const orderedWorkspaces = this.sortWorkspacesByPathDepth(this.workspaces);
    const nextWorkspaces: Array<AgentHomeWorkspaceItem> = [];
    const migratedOldIds: Array<string> = [];
    const migratedNewIds: Array<string> = [];
    let changed = false;

    for (let index = 0; index < orderedWorkspaces.length; index++) {
      const item = orderedWorkspaces[index];
      if (item.subtitle.length === 0) {
        nextWorkspaces.push(item);
        continue;
      }

      let duplicateIndex = -1;
      for (let nextIndex = 0; nextIndex < nextWorkspaces.length; nextIndex++) {
        if (this.workspacePathContains(nextWorkspaces[nextIndex].subtitle, item.subtitle)) {
          duplicateIndex = nextIndex;
        }
      }

      if (duplicateIndex >= 0) {
        migratedOldIds.push(item.id);
        migratedNewIds.push(nextWorkspaces[duplicateIndex].id);
        changed = true;
        continue;
      }

      const canonicalId = this.workspaceIdForPath(item.subtitle);
      if (canonicalId.length > 0 && item.id !== canonicalId) {
        const migratedWorkspace = new AgentHomeWorkspaceItem(
          canonicalId,
          item.title,
          item.subtitle,
          item.initial,
          item.accentColor,
          item.branchName,
          item.isOnline
        );
        nextWorkspaces.push(migratedWorkspace);
        migratedOldIds.push(item.id);
        migratedNewIds.push(canonicalId);
        changed = true;
      } else {
        nextWorkspaces.push(item);
      }
    }

    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, migratedOldIds, migratedNewIds);
      if (workspaceId !== item.workspaceId) {
        nextSessions.push(new AgentHomeSessionItem(
          item.id,
          workspaceId,
          item.title,
          item.branchName,
          item.providerId,
          item.modelId,
          item.speedMode,
          item.reasoningMode,
          item.bridgeSessionId,
          item.updatedAt
        ));
        changed = true;
      } else {
        nextSessions.push(item);
      }
    }

    const activeWorkspaceId = this.migratedWorkspaceId(this.activeWorkspaceId, migratedOldIds, migratedNewIds);
    if (activeWorkspaceId !== this.activeWorkspaceId) {
      this.activeWorkspaceId = activeWorkspaceId;
      changed = true;
    }

    if (!changed) {
      return;
    }
    this.workspaces = nextWorkspaces;
    this.sessions = nextSessions;
    this.workspaceChanges = this.migrateWorkspaceChanges(migratedOldIds, migratedNewIds);
    this.workspaceFiles = this.migrateWorkspaceFiles(migratedOldIds, migratedNewIds);
    this.gitCommits = this.migrateGitCommits(migratedOldIds, migratedNewIds);
    this.plans = this.migratePlans(migratedOldIds, migratedNewIds);
    this.persistence.replaceWorkspaceSessionState(
      this.workspaces,
      this.sessions,
      migratedOldIds,
      migratedNewIds
    ).catch((error: Error): void => {
      logger.error(TAG, 'persist deduped workspace session state failed: ' + this.errorToString(error));
    });
    this.persistProfile();
  }

  private migratedWorkspaceId(workspaceId: string, oldIds: Array<string>, newIds: Array<string>): string {
    for (let index = 0; index < oldIds.length; index++) {
      if (oldIds[index] === workspaceId) {
        return newIds[index];
      }
    }
    return workspaceId;
  }

  private rebindWorkspaceReferences(oldWorkspaceId: string, newWorkspaceId: string): void {
    if (oldWorkspaceId.length === 0 || newWorkspaceId.length === 0 || oldWorkspaceId === newWorkspaceId) {
      return;
    }
    const oldIds: Array<string> = [oldWorkspaceId];
    const newIds: Array<string> = [newWorkspaceId];
    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, oldIds, newIds);
      if (workspaceId !== item.workspaceId) {
        nextSessions.push(new AgentHomeSessionItem(
          item.id,
          workspaceId,
          item.title,
          item.branchName,
          item.providerId,
          item.modelId,
          item.speedMode,
          item.reasoningMode,
          item.bridgeSessionId,
          item.updatedAt
        ));
      } else {
        nextSessions.push(item);
      }
    }
    this.sessions = nextSessions;
    this.workspaceChanges = this.migrateWorkspaceChanges(oldIds, newIds);
    this.workspaceFiles = this.migrateWorkspaceFiles(oldIds, newIds);
    this.gitCommits = this.migrateGitCommits(oldIds, newIds);
    this.plans = this.migratePlans(oldIds, newIds);
    if (this.activeWorkspaceId === oldWorkspaceId) {
      this.activeWorkspaceId = newWorkspaceId;
    }
    this.persistence.replaceWorkspaceSessionState(
      this.workspaces,
      this.sessions,
      oldIds,
      newIds
    ).catch((error: Error): void => {
      logger.error(TAG, 'persist rebound workspace references failed: ' + this.errorToString(error));
    });
    this.persistProfile();
  }

  private migrateWorkspaceChanges(oldIds: Array<string>, newIds: Array<string>): Array<AgentHomeWorkspaceChangeItem> {
    const result: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, oldIds, newIds);
      if (workspaceId !== item.workspaceId) {
        result.push(new AgentHomeWorkspaceChangeItem(
          item.id,
          item.sessionId,
          workspaceId,
          item.providerId,
          item.path,
          item.oldPath,
          item.status,
          item.staged,
          item.additions,
          item.deletions,
          item.diffText,
          item.updatedAt,
          item.kind,
          item.changedFileCount
        ));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  private migrateWorkspaceFiles(oldIds: Array<string>, newIds: Array<string>): Array<AgentHomeWorkspaceFileItem> {
    const result: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, oldIds, newIds);
      if (workspaceId !== item.workspaceId) {
        result.push(new AgentHomeWorkspaceFileItem(
          workspaceId + ':' + item.path,
          workspaceId,
          item.path,
          item.parentPath,
          item.name,
          item.kind,
          item.depth,
          item.sizeBytes,
          item.modifiedAt,
          item.isHidden,
          item.updatedAt
        ));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  private migrateGitCommits(oldIds: Array<string>, newIds: Array<string>): Array<AgentHomeGitCommitItem> {
    const result: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < this.gitCommits.length; index++) {
      const item = this.gitCommits[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, oldIds, newIds);
      if (workspaceId !== item.workspaceId) {
        result.push(new AgentHomeGitCommitItem(
          item.id,
          item.sessionId,
          workspaceId,
          item.providerId,
          item.hash,
          item.message,
          item.author,
          item.committedAt,
          item.updatedAt
        ));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  private migratePlans(oldIds: Array<string>, newIds: Array<string>): Array<AgentHomePlanItem> {
    const result: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      const workspaceId = this.migratedWorkspaceId(item.workspaceId, oldIds, newIds);
      if (workspaceId !== item.workspaceId) {
        result.push(new AgentHomePlanItem(
          item.id,
          item.sessionId,
          workspaceId,
          item.providerId,
          item.planId,
          item.title,
          item.content,
          item.status,
          item.rawJson,
          item.createdAt,
          item.updatedAt,
          item.agentName
        ));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  private sortWorkspacesByPathDepth(items: Array<AgentHomeWorkspaceItem>): Array<AgentHomeWorkspaceItem> {
    const result: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const itemLength = this.normalizeWorkspacePathForCompare(item.subtitle).length;
      let inserted = false;
      for (let resultIndex = 0; resultIndex < result.length; resultIndex++) {
        const existingLength = this.normalizeWorkspacePathForCompare(result[resultIndex].subtitle).length;
        if (itemLength > 0 && (existingLength === 0 || itemLength < existingLength)) {
          result.splice(resultIndex, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        result.push(item);
      }
    }
    return result;
  }

  private handleAction(actionKey: string): void {
    if (actionKey === AgentHomeActionKey.OPEN_WORKSPACES) {
      this.showMainPage(AgentHomeMainPageIndex.WORKSPACES);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_SESSIONS) {
      this.openSheet(AgentHomeSheetKey.SESSIONS);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_SETTINGS) {
      this.openSheet(AgentHomeSheetKey.SETTINGS);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_GLOBAL_SETTINGS) {
      this.openSheet(AgentHomeSheetKey.GLOBAL_SETTINGS);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_MODELS) {
      this.openSheet(AgentHomeSheetKey.MODELS);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_RUNTIME) {
      this.openSheet(AgentHomeSheetKey.RUNTIME);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_PREVIEW) {
      this.openSheet(AgentHomeSheetKey.PREVIEW);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_WORKSPACE_BROWSER) {
      this.showMainPage(AgentHomeMainPageIndex.WORKSPACE_BROWSER);
      return;
    }
    if (actionKey === AgentHomeActionKey.PICK_ATTACHMENT) {
      this.openSheet(AgentHomeSheetKey.ATTACHMENTS);
      return;
    }
    if (actionKey === AgentHomeActionKey.PICK_IMAGE) {
      this.pickImageAttachments().catch((error: Error): void => {
        logger.error(TAG, 'pick image attachments failed: ' + this.errorToString(error));
      });
      return;
    }
    if (actionKey === AgentHomeActionKey.PICK_DOCUMENT) {
      this.pickDocumentAttachments().catch((error: Error): void => {
        logger.error(TAG, 'pick document attachments failed: ' + this.errorToString(error));
      });
      return;
    }
    if (actionKey === AgentHomeActionKey.CLEAR_ATTACHMENTS) {
      this.attachments = [];
      return;
    }
    if (actionKey === AgentHomeActionKey.NEW_SESSION) {
      this.prepareNewSessionRuntimeFromActiveSelection();
      this.createLocalSession();
      return;
    }
    if (actionKey === AgentHomeActionKey.NEW_WORKSPACE) {
      this.prepareNewSessionRuntimeFromActiveSelection();
      if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
        this.requestRemoteSessions();
      }
      this.openSheet(AgentHomeSheetKey.SESSIONS);
      return;
    }
    if (actionKey === AgentHomeActionKey.SEND_MESSAGE) {
      this.handleSendMessage();
      return;
    }
    if (actionKey === AgentHomeActionKey.REQUEST_PREVIEW) {
      this.handleRequestPreview();
      return;
    }
    if (actionKey === AgentHomeActionKey.REFRESH_WORKSPACE_CHANGES) {
      this.refreshWorkspacePanel();
      return;
    }
    if (actionKey === AgentHomeActionKey.REFRESH_WORKSPACE_FILES) {
      this.refreshWorkspaceFiles('');
      return;
    }
    if (actionKey === AgentHomeActionKey.COMMIT_WORKSPACE_CHANGES) {
      this.confirmCommitWorkspaceChanges();
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_HOME) {
      this.showEmptyHomeGuide();
      return;
    }
    if (actionKey === AgentHomeActionKey.SCAN_BRIDGE_QR) {
      this.scanBridgeConnectionQr();
      return;
    }
    if (actionKey === AgentHomeActionKey.COPY_DESKTOP_COMMAND) {
      this.copyDesktopSetupCommand();
      return;
    }
  }

  private showEmptyHomeGuide(): void {
    this.activeSessionId = '';
    this.isConversationRenderPending = false;
    this.conversationRenderOverlayOpacity = 0;
    this.showMainPage(AgentHomeMainPageIndex.CHAT);
  }

  private showMainPage(index: number): void {
    this.animateMainPageIndex(index);
    this.mainTabsController.changeIndex(index);
    this.closeSheet();
    this.ensureLargeScreenMainDestination();
    if (index === AgentHomeMainPageIndex.WORKSPACE_BROWSER) {
      this.refreshWorkspaceBrowserRoot();
    } else if (index === AgentHomeMainPageIndex.WORKSPACES && this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      this.requestRemoteSessions();
    }
  }

  @Builder
  private buildMessageAttachmentGroup(
    messageId: string,
    attachments: Array<AgentHomeMessageAttachmentItem>,
    onDark: boolean
  ): void {
    Column({ space: 8 }) {
      ForEach(attachments, (item: AgentHomeMessageAttachmentItem) => {
        this.buildMessageAttachmentCard(messageId, item, onDark)
      }, (item: AgentHomeMessageAttachmentItem): string => item.id)
    }
    .width('100%')
  }

  @Builder
  private buildMessageAttachmentCard(messageId: string, item: AgentHomeMessageAttachmentItem, onDark: boolean): void {
    if (item.kind === AgentHomeAttachmentKind.IMAGE) {
      Row({ space: 10 }) {
        Stack() {
          if (this.messageAttachmentImageSource(item).length > 0) {
            Image(this.messageAttachmentImageSource(item))
              .width('100%')
              .height('100%')
              .objectFit(ImageFit.Cover)
          } else {
            SymbolGlyph($r('sys.symbol.doc_plaintext'))
              .fontSize(24)
              .fontColor([onDark ? '#CCFFFFFF' : this.agentHomeReadableSecondaryColor()])
          }
        }
        .width(74)
        .height(56)
        .backgroundColor(onDark ? '#22FFFFFF' : this.codeBlockBackgroundColor())
        .borderRadius(12)
        .clip(true)
        .onAppear((): void => {
          this.requestMessageAttachmentImagePreview(messageId, item);
        })

        Column({ space: 3 }) {
          Text(item.displayName)
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(onDark ? $r('app.color.text_white') : this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.path)
            .fontSize(11)
            .lineHeight(16)
            .fontColor(onDark ? '#B8FFFFFF' : this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .padding(8)
      .backgroundColor(onDark ? '#1AFFFFFF' : this.codeBlockBackgroundColor())
      .border({
        width: 1,
        color: onDark ? '#24FFFFFF' : this.codeBlockBorderColor()
      })
      .borderRadius(14)
    } else {
      Row({ space: 10 }) {
        SymbolGlyph($r('sys.symbol.doc_plaintext'))
          .fontSize(22)
          .fontColor([onDark ? '#D8FFFFFF' : this.agentHomeReadableSecondaryColor()])
        Column({ space: 3 }) {
          Text(item.displayName)
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(onDark ? $r('app.color.text_white') : this.agentHomeReadableTextColor())
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.path)
            .fontSize(11)
            .lineHeight(16)
            .fontColor(onDark ? '#B8FFFFFF' : this.agentHomeReadableSecondaryColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .padding(9)
      .backgroundColor(onDark ? '#1AFFFFFF' : this.codeBlockBackgroundColor())
      .border({
        width: 1,
        color: onDark ? '#24FFFFFF' : this.codeBlockBorderColor()
      })
      .borderRadius(14)
    }
  }

  private parseMessageAttachmentContent(messageId: string, text: string): AgentHomeMessageAttachmentParseResult {
    const normalized = text.split('\r\n').join('\n').split('\r').join('\n');
    const lines = normalized.split('\n');
    const filesHeaderIndex = this.findMessageFilesHeaderIndex(lines);
    const requestHeaderIndex = this.findMessageRequestHeaderIndex(lines);
    const attachments: Array<AgentHomeMessageAttachmentItem> = [];
    let bodyText = normalized.trim();
    if (filesHeaderIndex >= 0) {
      const attachmentEnd = requestHeaderIndex > filesHeaderIndex ? requestHeaderIndex : lines.length;
      const parsedAttachments = this.parseMessageAttachmentLines(messageId, lines, filesHeaderIndex + 1, attachmentEnd);
      for (let index = 0; index < parsedAttachments.length; index++) {
        this.appendMessageAttachmentIfAbsent(attachments, parsedAttachments[index]);
      }
      if (requestHeaderIndex > filesHeaderIndex) {
        bodyText = this.joinLines(lines, requestHeaderIndex + 1, lines.length).trim();
      } else {
        bodyText = this.joinLines(lines, 0, filesHeaderIndex).trim();
      }
    } else if (requestHeaderIndex >= 0) {
      bodyText = this.joinLines(lines, requestHeaderIndex + 1, lines.length).trim();
    }
    const inlineResult = this.extractInlineMessageAttachmentTags(messageId, bodyText, attachments.length);
    for (let index = 0; index < inlineResult.attachments.length; index++) {
      this.appendMessageAttachmentIfAbsent(attachments, inlineResult.attachments[index]);
    }
    return new AgentHomeMessageAttachmentParseResult(inlineResult.bodyText, attachments);
  }

  private messageAttachmentBodyText(messageId: string, text: string): string {
    return this.parseMessageAttachmentContent(messageId, text).bodyText;
  }

  private messageAttachmentItems(messageId: string, text: string): Array<AgentHomeMessageAttachmentItem> {
    return this.parseMessageAttachmentContent(messageId, text).attachments;
  }

  private findMessageFilesHeaderIndex(lines: Array<string>): number {
    for (let index = 0; index < lines.length; index++) {
      const heading = this.normalizedMessageHeading(lines[index]);
      if (heading === 'files mentioned by the user:') {
        return index;
      }
    }
    return -1;
  }

  private findMessageRequestHeaderIndex(lines: Array<string>): number {
    for (let index = 0; index < lines.length; index++) {
      const heading = this.normalizedMessageHeading(lines[index]);
      if (heading === 'my request for codex:') {
        return index;
      }
    }
    return -1;
  }

  private normalizedMessageHeading(line: string): string {
    let value = line.trim();
    while (value.startsWith('#')) {
      value = value.substring(1).trim();
    }
    return value.toLowerCase();
  }

  private parseMessageAttachmentLines(
    messageId: string,
    lines: Array<string>,
    startIndex: number,
    endIndex: number
  ): Array<AgentHomeMessageAttachmentItem> {
    const items: Array<AgentHomeMessageAttachmentItem> = [];
    for (let index = startIndex; index < endIndex; index++) {
      const tagItem = this.parseMessageAttachmentTag(messageId, lines[index], items.length);
      if (tagItem !== null) {
        this.appendMessageAttachmentIfAbsent(items, tagItem);
        continue;
      }
      const item = this.parseMessageAttachmentLine(messageId, lines[index], items.length);
      if (item !== null) {
        this.appendMessageAttachmentIfAbsent(items, item);
      }
    }
    return items;
  }

  private extractInlineMessageAttachmentTags(messageId: string, text: string, ordinalStart: number): AgentHomeMessageAttachmentParseResult {
    const attachments: Array<AgentHomeMessageAttachmentItem> = [];
    let bodyText = '';
    let cursor = 0;
    const lowerText = text.toLowerCase();
    while (cursor < text.length) {
      const imageIndex = lowerText.indexOf('<image', cursor);
      const fileIndex = lowerText.indexOf('<file', cursor);
      const tagStart = this.nextInlineAttachmentTagStart(imageIndex, fileIndex);
      if (tagStart < 0) {
        bodyText = bodyText + text.substring(cursor);
        break;
      }
      const tagOpenEnd = text.indexOf('>', tagStart);
      if (tagOpenEnd < 0) {
        bodyText = bodyText + text.substring(cursor);
        break;
      }
      bodyText = bodyText + text.substring(cursor, tagStart);
      const tagText = text.substring(tagStart, tagOpenEnd + 1);
      const item = this.parseMessageAttachmentTag(messageId, tagText, ordinalStart + attachments.length);
      if (item !== null) {
        this.appendMessageAttachmentIfAbsent(attachments, item);
        cursor = this.inlineAttachmentTagEnd(lowerText, tagStart, tagOpenEnd + 1);
      } else {
        bodyText = bodyText + tagText;
        cursor = tagOpenEnd + 1;
      }
    }
    return new AgentHomeMessageAttachmentParseResult(this.compactMessageAttachmentBodyText(bodyText), attachments);
  }

  private nextInlineAttachmentTagStart(imageIndex: number, fileIndex: number): number {
    if (imageIndex < 0) {
      return fileIndex;
    }
    if (fileIndex < 0) {
      return imageIndex;
    }
    return imageIndex < fileIndex ? imageIndex : fileIndex;
  }

  private inlineAttachmentTagEnd(lowerText: string, tagStart: number, fallbackEnd: number): number {
    if (lowerText.startsWith('<image', tagStart)) {
      const closeIndex = lowerText.indexOf('</image>', fallbackEnd);
      if (closeIndex >= 0) {
        return closeIndex + '</image>'.length;
      }
    }
    if (lowerText.startsWith('<file', tagStart)) {
      const closeIndex = lowerText.indexOf('</file>', fallbackEnd);
      if (closeIndex >= 0) {
        return closeIndex + '</file>'.length;
      }
    }
    return fallbackEnd;
  }

  private parseMessageAttachmentTag(messageId: string, tagText: string, ordinal: number): AgentHomeMessageAttachmentItem | null {
    const entry = tagText.trim();
    const lowerEntry = entry.toLowerCase();
    const isImageTag = lowerEntry.startsWith('<image');
    const isFileTag = lowerEntry.startsWith('<file');
    if (!isImageTag && !isFileTag) {
      return null;
    }
    let path = this.messageAttachmentTagAttribute(entry, 'path');
    if (path.length === 0) {
      path = this.messageAttachmentTagAttribute(entry, 'src');
    }
    if (path.length === 0) {
      path = this.messageAttachmentTagAttribute(entry, 'href');
    }
    path = this.cleanMessageAttachmentPath(path);
    if (path.length === 0) {
      return null;
    }
    let label = this.messageAttachmentTagAttribute(entry, 'name');
    if (label.length === 0) {
      label = this.messageAttachmentTagAttribute(entry, 'title');
    }
    label = this.cleanMessageAttachmentLabel(label);
    const kind = isImageTag || this.isMessageAttachmentImage(label, path) ? AgentHomeAttachmentKind.IMAGE : AgentHomeAttachmentKind.DOCUMENT;
    const displayName = this.messageAttachmentDisplayName(label, path, kind);
    const id = 'message_attachment_' + this.safeIdPart(messageId) + '_' + String(ordinal) + '_' + this.safeIdPart(displayName);
    return new AgentHomeMessageAttachmentItem(id, kind, displayName, path);
  }

  private messageAttachmentTagAttribute(tagText: string, attributeName: string): string {
    const lowerText = tagText.toLowerCase();
    const marker = attributeName.toLowerCase() + '=';
    const markerIndex = lowerText.indexOf(marker);
    if (markerIndex < 0) {
      return '';
    }
    let valueStart = markerIndex + marker.length;
    while (valueStart < tagText.length && tagText.charAt(valueStart) === ' ') {
      valueStart++;
    }
    if (valueStart >= tagText.length) {
      return '';
    }
    const firstChar = tagText.charAt(valueStart);
    if (firstChar === '"' || firstChar === '\'') {
      const quoteEnd = tagText.indexOf(firstChar, valueStart + 1);
      if (quoteEnd > valueStart) {
        return tagText.substring(valueStart + 1, quoteEnd).trim();
      }
      return tagText.substring(valueStart + 1).trim();
    }
    if (firstChar === '[') {
      const bracketEnd = tagText.indexOf(']', valueStart + 1);
      if (bracketEnd > valueStart) {
        return tagText.substring(valueStart, bracketEnd + 1).trim();
      }
    }
    const valueEnd = this.messageAttachmentTagAttributeEnd(lowerText, valueStart);
    return tagText.substring(valueStart, valueEnd).trim();
  }

  private messageAttachmentTagAttributeEnd(lowerText: string, valueStart: number): number {
    let valueEnd = lowerText.indexOf('>', valueStart);
    if (valueEnd < 0) {
      valueEnd = lowerText.length;
    }
    const attributeMarkers: Array<string> = [' name=', ' path=', ' src=', ' title=', ' href=', ' file='];
    for (let index = 0; index < attributeMarkers.length; index++) {
      const markerIndex = lowerText.indexOf(attributeMarkers[index], valueStart);
      if (markerIndex >= 0 && markerIndex < valueEnd) {
        valueEnd = markerIndex;
      }
    }
    return valueEnd;
  }

  private cleanMessageAttachmentLabel(labelValue: string): string {
    let value = labelValue.trim();
    if (value.startsWith('[') && value.endsWith(']') && value.length > 2) {
      value = value.substring(1, value.length - 1).trim();
    }
    return value;
  }

  private compactMessageAttachmentBodyText(text: string): string {
    const lines = text.split('\n');
    const keptLines: Array<string> = [];
    let blankCount = 0;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.trim().length === 0) {
        blankCount++;
        if (blankCount <= 1) {
          keptLines.push('');
        }
      } else {
        blankCount = 0;
        keptLines.push(line);
      }
    }
    return this.joinLines(keptLines, 0, keptLines.length).trim();
  }

  private appendMessageAttachmentIfAbsent(
    items: Array<AgentHomeMessageAttachmentItem>,
    item: AgentHomeMessageAttachmentItem
  ): void {
    const normalizedPath = this.normalizedMessageAttachmentPath(item.path);
    for (let index = 0; index < items.length; index++) {
      if (this.normalizedMessageAttachmentPath(items[index].path) === normalizedPath) {
        return;
      }
    }
    items.push(item);
  }

  private parseMessageAttachmentLine(messageId: string, line: string, ordinal: number): AgentHomeMessageAttachmentItem | null {
    let entry = line.trim();
    if (entry.length === 0) {
      return null;
    }
    while (entry.startsWith('#')) {
      entry = entry.substring(1).trim();
    }
    if (entry.length === 0 || this.normalizedMessageHeading(entry) === 'my request for codex:') {
      return null;
    }
    const delimiterIndex = entry.indexOf(': ');
    let label = '';
    let path = '';
    if (delimiterIndex >= 0) {
      label = entry.substring(0, delimiterIndex).trim();
      path = entry.substring(delimiterIndex + 2).trim();
    } else {
      label = entry;
      path = entry;
    }
    path = this.cleanMessageAttachmentPath(path);
    if (path.length === 0) {
      return null;
    }
    const kind = this.isMessageAttachmentImage(label, path) ? AgentHomeAttachmentKind.IMAGE : AgentHomeAttachmentKind.DOCUMENT;
    const displayName = this.messageAttachmentDisplayName(label, path, kind);
    const id = 'message_attachment_' + this.safeIdPart(messageId) + '_' + String(ordinal) + '_' + this.safeIdPart(displayName);
    return new AgentHomeMessageAttachmentItem(id, kind, displayName, path);
  }

  private cleanMessageAttachmentPath(pathValue: string): string {
    let value = pathValue.trim();
    if (value.startsWith('<') && value.endsWith('>') && value.length > 2) {
      value = value.substring(1, value.length - 1).trim();
    }
    if (value.startsWith('"') && value.endsWith('"') && value.length > 2) {
      value = value.substring(1, value.length - 1).trim();
    }
    if (value.startsWith('`') && value.endsWith('`') && value.length > 2) {
      value = value.substring(1, value.length - 1).trim();
    }
    return value;
  }

  private messageAttachmentDisplayName(label: string, pathValue: string, kind: string): string {
    const cleanLabel = label.trim();
    if (cleanLabel.length > 0 && this.messageAttachmentExtension(cleanLabel).length > 0) {
      return cleanLabel;
    }
    return this.extractAttachmentDisplayName(pathValue, kind);
  }

  private isMessageAttachmentImage(label: string, pathValue: string): boolean {
    const extension = this.messageAttachmentExtension(pathValue).toLowerCase();
    if (this.isImageExtension(extension)) {
      return true;
    }
    return this.isImageExtension(this.messageAttachmentExtension(label).toLowerCase());
  }

  private isImageExtension(extension: string): boolean {
    return extension === 'png' || extension === 'jpg' || extension === 'jpeg' ||
      extension === 'webp' || extension === 'gif' || extension === 'bmp' ||
      extension === 'ico' || extension === 'avif' || extension === 'apng' ||
      extension === 'heic' || extension === 'heif' || extension === 'tif' ||
      extension === 'tiff';
  }

  private messageAttachmentExtension(pathValue: string): string {
    let value = pathValue;
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0) {
      value = value.substring(0, queryIndex);
    }
    const hashIndex = value.indexOf('#');
    if (hashIndex >= 0) {
      value = value.substring(0, hashIndex);
    }
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex >= 0 && dotIndex + 1 < value.length) {
      return value.substring(dotIndex + 1);
    }
    return '';
  }

  private joinLines(lines: Array<string>, startIndex: number, endIndex: number): string {
    let result = '';
    for (let index = startIndex; index < endIndex; index++) {
      if (index > startIndex) {
        result = result + '\n';
      }
      result = result + lines[index];
    }
    return result;
  }

  private messageAttachmentImageSource(item: AgentHomeMessageAttachmentItem): string {
    const cached = this.cachedMessageAttachmentImageContent(item.path);
    if (cached.length > 0) {
      return this.workspacePreviewImageSource(cached);
    }
    if (item.path.startsWith('file://') || item.path.startsWith('/') || item.path.startsWith('data:image/')) {
      return item.path;
    }
    return '';
  }

  private cachedMessageAttachmentImageContent(pathValue: string): string {
    const normalizedPath = this.normalizedMessageAttachmentPath(pathValue);
    for (let index = 0; index < this.messageAttachmentImageCache.length; index++) {
      const item = this.messageAttachmentImageCache[index];
      if (this.normalizedMessageAttachmentPath(item.path) === normalizedPath) {
        return item.content;
      }
    }
    return '';
  }

  private requestMessageAttachmentImagePreview(messageId: string, item: AgentHomeMessageAttachmentItem): void {
    if (item.kind !== AgentHomeAttachmentKind.IMAGE || item.path.length === 0 ||
      this.cachedMessageAttachmentImageContent(item.path).length > 0 ||
      this.isMessageAttachmentImagePending(item.path) ||
      this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      return;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0) {
      return;
    }
    const nextPaths: Array<string> = [];
    for (let index = 0; index < this.pendingMessageAttachmentImagePaths.length; index++) {
      nextPaths.push(this.pendingMessageAttachmentImagePaths[index]);
    }
    nextPaths.push(item.path);
    this.pendingMessageAttachmentImagePaths = nextPaths;
    logger.info(TAG, 'request message attachment image preview: messageId=' + messageId + ', path=' + item.path);
    this.client.requestAttachmentFileDownload(bridgeSessionId, item.path, AGENT_HOME_ATTACHMENT_PREVIEW_DOWNLOAD_KIND);
  }

  private isMessageAttachmentImagePending(pathValue: string): boolean {
    const normalizedPath = this.normalizedMessageAttachmentPath(pathValue);
    for (let index = 0; index < this.pendingMessageAttachmentImagePaths.length; index++) {
      if (this.normalizedMessageAttachmentPath(this.pendingMessageAttachmentImagePaths[index]) === normalizedPath) {
        return true;
      }
    }
    return false;
  }

  private removePendingMessageAttachmentImagePath(pathValue: string): void {
    const normalizedPath = this.normalizedMessageAttachmentPath(pathValue);
    const nextPaths: Array<string> = [];
    for (let index = 0; index < this.pendingMessageAttachmentImagePaths.length; index++) {
      const itemPath = this.pendingMessageAttachmentImagePaths[index];
      if (this.normalizedMessageAttachmentPath(itemPath) !== normalizedPath) {
        nextPaths.push(itemPath);
      }
    }
    this.pendingMessageAttachmentImagePaths = nextPaths;
  }

  private normalizedMessageAttachmentPath(pathValue: string): string {
    return pathValue.trim().split('\\').join('/').toLowerCase();
  }

  private handleNavigationModeChange(mode: NavigationMode): void {
    const isSplit = mode === NavigationMode.Split;
    if (this.isLargeScreenNavigation !== isSplit) {
      this.isLargeScreenNavigation = isSplit;
    }
    if (isSplit) {
      this.ensureLargeScreenMainDestination();
    } else {
      this.clearLargeScreenMainDestination();
    }
  }

  private ensureLargeScreenMainDestination(): void {
    if (!this.isLargeScreenNavigation) {
      return;
    }
    const pathNames = this.pathStack.getAllPathName();
    if (pathNames.length === 1 && pathNames[0] === AGENT_HOME_MAIN_DESTINATION_NAME) {
      return;
    }
    this.pathStack.clear(false);
    this.pathStack.pushPath(new NavPathInfo(AGENT_HOME_MAIN_DESTINATION_NAME, new AgentHomeNavPayload()), false);
  }

  private clearLargeScreenMainDestination(): void {
    if (this.pathStack.size() === 0) {
      return;
    }
    this.pathStack.clear(false);
  }

  private animateMainPageIndex(index: number): void {
    if (this.mainPageIndex === index) {
      return;
    }
    this.getUIContext().animateTo({ duration: 260, curve: Curve.FastOutSlowIn }, (): void => {
      this.mainPageIndex = index;
    });
  }

  private mainPageOpacity(index: number): number {
    return this.mainPageIndex === index ? 1 : 0.72;
  }

  private mainPageScale(index: number): number {
    return this.mainPageIndex === index ? 1 : 0.985;
  }

  private mainPageTranslateX(index: number): number {
    if (this.mainPageIndex === index) {
      return 0;
    }
    return index < this.mainPageIndex ? -18 : 18;
  }

  private handleHomeAction(actionKey: string): void {
    if (actionKey === AgentHomeActionKey.SCAN_BRIDGE_QR) {
      this.scanBridgeConnectionQr(true);
      return;
    }
    if (actionKey === AgentHomeActionKey.COPY_DESKTOP_COMMAND) {
      this.copyDesktopSetupCommand();
      return;
    }
    if (actionKey === AgentHomeActionKey.REFRESH_REMOTE_SESSIONS) {
      if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
        this.requestRemoteSessions();
      }
      this.openSheet(AgentHomeSheetKey.SESSIONS);
      return;
    }
    if (actionKey === AgentHomeActionKey.OPEN_WORKSPACE_BROWSER) {
      this.workspacePanelTabIndex = AgentHomeWorkspacePanelTab.CHANGES;
      this.handleAction(actionKey);
      return;
    }
    this.handleAction(actionKey);
  }

  private handleGlobalSettingOption(group: string, value: string): void {
    if (group === AgentHomeGlobalSettingGroup.THEME) {
      this.globalSettingsThemeSelection = value;
      if (this.applyGlobalTheme(value)) {
        this.globalSettingsThemeSelection = ngfThemeManagerFacade.getCurrentTheme();
      } else {
        this.syncGlobalSettingsSelections();
      }
      return;
    }
    if (group === AgentHomeGlobalSettingGroup.LANGUAGE) {
      this.globalSettingsLocaleSelection = value;
      if (this.applyGlobalLanguage(value)) {
        this.globalSettingsLocaleSelection = this.currentGlobalLocaleOverride();
      } else {
        this.syncGlobalSettingsSelections();
      }
    }
  }

  private applyGlobalTheme(mode: string): boolean {
    try {
      const context = uiContextManager.getFullAbilityContext();
      if (mode === NGFThemeMode.DARK) {
        ngfThemeManagerFacade.setThemeOverride(NGFThemeMode.DARK);
        if (context) {
          context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
        }
        return true;
      }
      if (mode === NGFThemeMode.LIGHT) {
        ngfThemeManagerFacade.setThemeOverride(NGFThemeMode.LIGHT);
        if (context) {
          context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT);
        }
        return true;
      }
      ngfThemeManagerFacade.setThemeOverride(NGFThemeMode.AUTO);
      if (context) {
        context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
      }
      return true;
    } catch (error) {
      logger.warn(TAG, 'apply global theme failed: ' + this.errorToString(error));
      return false;
    }
  }

  private applyGlobalLanguage(locale: string): boolean {
    try {
      if (locale.length > 0) {
        ngfI18nManagerFacade.setLocaleOverride(locale);
      } else {
        ngfI18nManagerFacade.clearLocaleOverride();
      }
      return true;
    } catch (error) {
      logger.warn(TAG, 'apply global language failed: ' + this.errorToString(error));
      return false;
    }
  }

  private syncGlobalSettingsSelections(): void {
    this.globalSettingsThemeSelection = ngfThemeManagerFacade.getCurrentTheme();
    this.globalSettingsLocaleSelection = this.currentGlobalLocaleOverride();
  }

  private isGlobalSettingOptionSelected(group: string, value: string): boolean {
    if (group === AgentHomeGlobalSettingGroup.THEME) {
      return this.globalSettingsThemeSelection === value;
    }
    if (group === AgentHomeGlobalSettingGroup.LANGUAGE) {
      return this.globalSettingsLocaleSelection === value;
    }
    return false;
  }

  private currentGlobalLocaleOverride(): string {
    const locale = AppStorage.get<string>('ngf_current_locale');
    if (locale === undefined || locale === null) {
      return '';
    }
    return locale;
  }

  private replayStartupGuide(): void {
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_global_settings_replay_opened'))
    );
    this.showEmptyHomeGuide();
  }

  private openDeveloperApp(item: AgentHomeDeveloperAppItem): void {
    if (!item.isAvailable || item.appGalleryUrl.length === 0) {
      return;
    }
    this.openExternalLink(item.appGalleryUrl, $r('app.string.agent_home_developer_app_open_failed'));
  }

  private openSupportPage(): void {
    this.openExternalLink(AGENT_HOME_AFDIAN_URL, $r('app.string.agent_home_support_open_failed'));
  }

  private openExternalLink(url: string, failureMessage: ResourceStr): void {
    try {
      const hostContext = this.getUIContext().getHostContext();
      if (!hostContext) {
        this.showAgentHomeToast(failureMessage);
        return;
      }
      const abilityContext = hostContext as common.UIAbilityContext;
      abilityContext.openLink(url, { appLinkingOnly: false }).catch((error: Error): void => {
        logger.error(TAG, 'open external link failed: ' + this.errorToString(error));
        this.showAgentHomeToast(failureMessage);
      });
    } catch (error) {
      logger.error(TAG, 'open external link task failed: ' + this.errorToString(error));
      this.showAgentHomeToast(failureMessage);
    }
  }

  private copySupportLink(): void {
    pasteboard.getSystemPasteboard().setData(
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, AGENT_HOME_AFDIAN_URL)
    ).then((): void => {
      this.showAgentHomeToast($r('app.string.agent_home_support_link_copied'));
    }).catch((error: Error): void => {
      logger.error(TAG, 'copy support link failed: ' + this.errorToString(error));
    });
  }

  private showAgentHomeToast(message: ResourceStr): void {
    try {
      this.getUIContext().getPromptAction().showToast({
        message: resolveResourceString(this.getUIContext().getHostContext(), message)
      });
    } catch (error) {
      logger.warn(TAG, 'show agent home toast failed: ' + this.errorToString(error));
    }
  }

  private openSheet(sheetKey: string): void {
    if (this.isSheetOpen(sheetKey)) {
      logger.info(TAG, 'agent sheet already open: ' + sheetKey);
      return;
    }
    if (sheetKey === AgentHomeSheetKey.SETTINGS) {
      this.syncWorkspaceDrafts();
    }
    if (sheetKey === AgentHomeSheetKey.GLOBAL_SETTINGS) {
      this.syncGlobalSettingsSelections();
    }
    if (sheetKey === AgentHomeSheetKey.SESSIONS) {
      this.ensureNewSessionProvider();
      this.ensureSessionImportProvider();
      if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
        this.requestRemoteSessions();
      }
    }
    if (sheetKey === AgentHomeSheetKey.WORKSPACE_BROWSER) {
      this.refreshWorkspacePanel();
    }
    logger.info(TAG, 'open agent sheet: ' + sheetKey);
    this.activeSheetKey = sheetKey;
    this.isWorkspaceSheetOpen = sheetKey === AgentHomeSheetKey.WORKSPACES;
    this.isSessionSheetOpen = sheetKey === AgentHomeSheetKey.SESSIONS;
    this.isSettingsSheetOpen = sheetKey === AgentHomeSheetKey.SETTINGS;
    this.isGlobalSettingsSheetOpen = sheetKey === AgentHomeSheetKey.GLOBAL_SETTINGS;
    this.isDeveloperAppsSheetOpen = sheetKey === AgentHomeSheetKey.DEVELOPER_APPS;
    this.isSupportProjectSheetOpen = sheetKey === AgentHomeSheetKey.SUPPORT_PROJECT;
    this.isModelSheetOpen = sheetKey === AgentHomeSheetKey.MODELS;
    this.isRuntimeSheetOpen = sheetKey === AgentHomeSheetKey.RUNTIME;
    this.isAttachmentSheetOpen = sheetKey === AgentHomeSheetKey.ATTACHMENTS;
    this.isPreviewSheetOpen = sheetKey === AgentHomeSheetKey.PREVIEW;
    this.isSessionDetailsSheetOpen = sheetKey === AgentHomeSheetKey.SESSION_DETAILS;
    this.isWorkspaceBrowserSheetOpen = sheetKey === AgentHomeSheetKey.WORKSPACE_BROWSER;
    this.isToolDetailSheetOpen = sheetKey === AgentHomeSheetKey.TOOL_DETAIL;
    this.isRequestDetailSheetOpen = sheetKey === AgentHomeSheetKey.REQUEST_DETAIL;
    this.isPlanDetailSheetOpen = sheetKey === AgentHomeSheetKey.PLAN_DETAIL;
    this.isWorkspaceDiffDetailSheetOpen = sheetKey === AgentHomeSheetKey.WORKSPACE_DIFF_DETAIL;
    this.isWorkspaceContentPreviewSheetOpen = sheetKey === AgentHomeSheetKey.WORKSPACE_CONTENT_PREVIEW;
    this.isWorkspaceActionsSheetOpen = sheetKey === AgentHomeSheetKey.WORKSPACE_ACTIONS;
    this.isSessionActionsSheetOpen = sheetKey === AgentHomeSheetKey.SESSION_ACTIONS;
    this.isRenameWorkspaceSheetOpen = sheetKey === AgentHomeSheetKey.RENAME_WORKSPACE;
    this.isRenameSessionSheetOpen = sheetKey === AgentHomeSheetKey.RENAME_SESSION;
  }

  private closeSheet(): void {
    if (!this.hasOpenSheet()) {
      this.activeSheetKey = AgentHomeSheetKey.NONE;
      return;
    }
    logger.info(TAG, 'close agent sheet: ' + this.activeSheetKey);
    this.isWorkspaceSheetOpen = false;
    this.isSessionSheetOpen = false;
    this.isSettingsSheetOpen = false;
    this.isGlobalSettingsSheetOpen = false;
    this.isDeveloperAppsSheetOpen = false;
    this.isSupportProjectSheetOpen = false;
    this.isModelSheetOpen = false;
    this.isRuntimeSheetOpen = false;
    this.isAttachmentSheetOpen = false;
    this.isPreviewSheetOpen = false;
    this.isSessionDetailsSheetOpen = false;
    this.isWorkspaceBrowserSheetOpen = false;
    this.isToolDetailSheetOpen = false;
    this.isRequestDetailSheetOpen = false;
    this.isPlanDetailSheetOpen = false;
    this.isWorkspaceDiffDetailSheetOpen = false;
    this.isWorkspaceContentPreviewSheetOpen = false;
    this.isWorkspaceActionsSheetOpen = false;
    this.isSessionActionsSheetOpen = false;
    this.isRenameWorkspaceSheetOpen = false;
    this.isRenameSessionSheetOpen = false;
    this.activeWorkspacePreviewPath = '';
    this.activeWorkspacePreviewErrorText = '';
    this.activeSheetKey = AgentHomeSheetKey.NONE;
  }

  private handleSheetDisappear(sheetKey: string): void {
    logger.info(TAG, 'agent sheet disappeared: ' + sheetKey);
    if (sheetKey === AgentHomeSheetKey.WORKSPACES) {
      this.isWorkspaceSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.SESSIONS) {
      this.isSessionSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.SETTINGS) {
      this.isSettingsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.GLOBAL_SETTINGS) {
      this.isGlobalSettingsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.DEVELOPER_APPS) {
      this.isDeveloperAppsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.SUPPORT_PROJECT) {
      this.isSupportProjectSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.MODELS) {
      this.isModelSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.RUNTIME) {
      this.isRuntimeSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.ATTACHMENTS) {
      this.isAttachmentSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.PREVIEW) {
      this.isPreviewSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.SESSION_DETAILS) {
      this.isSessionDetailsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.WORKSPACE_BROWSER) {
      this.isWorkspaceBrowserSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.TOOL_DETAIL) {
      this.isToolDetailSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.REQUEST_DETAIL) {
      this.isRequestDetailSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.PLAN_DETAIL) {
      this.isPlanDetailSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.WORKSPACE_DIFF_DETAIL) {
      this.isWorkspaceDiffDetailSheetOpen = false;
      this.activeWorkspaceChangeId = '';
    } else if (sheetKey === AgentHomeSheetKey.WORKSPACE_CONTENT_PREVIEW) {
      this.isWorkspaceContentPreviewSheetOpen = false;
      this.activeWorkspacePreviewPath = '';
      this.activeWorkspacePreviewErrorText = '';
    } else if (sheetKey === AgentHomeSheetKey.WORKSPACE_ACTIONS) {
      this.isWorkspaceActionsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.SESSION_ACTIONS) {
      this.isSessionActionsSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.RENAME_WORKSPACE) {
      this.isRenameWorkspaceSheetOpen = false;
    } else if (sheetKey === AgentHomeSheetKey.RENAME_SESSION) {
      this.isRenameSessionSheetOpen = false;
    }
    if (this.activeSheetKey === sheetKey) {
      this.activeSheetKey = AgentHomeSheetKey.NONE;
    }
  }

  private isSheetOpen(sheetKey: string): boolean {
    if (sheetKey === AgentHomeSheetKey.WORKSPACES) {
      return this.isWorkspaceSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.SESSIONS) {
      return this.isSessionSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.SETTINGS) {
      return this.isSettingsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.GLOBAL_SETTINGS) {
      return this.isGlobalSettingsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.DEVELOPER_APPS) {
      return this.isDeveloperAppsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.SUPPORT_PROJECT) {
      return this.isSupportProjectSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.MODELS) {
      return this.isModelSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.RUNTIME) {
      return this.isRuntimeSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.ATTACHMENTS) {
      return this.isAttachmentSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.PREVIEW) {
      return this.isPreviewSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.SESSION_DETAILS) {
      return this.isSessionDetailsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.WORKSPACE_BROWSER) {
      return this.isWorkspaceBrowserSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.TOOL_DETAIL) {
      return this.isToolDetailSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.REQUEST_DETAIL) {
      return this.isRequestDetailSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.PLAN_DETAIL) {
      return this.isPlanDetailSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.WORKSPACE_DIFF_DETAIL) {
      return this.isWorkspaceDiffDetailSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.WORKSPACE_CONTENT_PREVIEW) {
      return this.isWorkspaceContentPreviewSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.WORKSPACE_ACTIONS) {
      return this.isWorkspaceActionsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.SESSION_ACTIONS) {
      return this.isSessionActionsSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.RENAME_WORKSPACE) {
      return this.isRenameWorkspaceSheetOpen;
    }
    if (sheetKey === AgentHomeSheetKey.RENAME_SESSION) {
      return this.isRenameSessionSheetOpen;
    }
    return false;
  }

  private hasOpenSheet(): boolean {
    return this.isWorkspaceSheetOpen ||
      this.isSessionSheetOpen ||
      this.isSettingsSheetOpen ||
      this.isGlobalSettingsSheetOpen ||
      this.isDeveloperAppsSheetOpen ||
      this.isSupportProjectSheetOpen ||
      this.isModelSheetOpen ||
      this.isRuntimeSheetOpen ||
      this.isAttachmentSheetOpen ||
      this.isPreviewSheetOpen ||
      this.isSessionDetailsSheetOpen ||
      this.isWorkspaceBrowserSheetOpen ||
      this.isToolDetailSheetOpen ||
      this.isRequestDetailSheetOpen ||
      this.isPlanDetailSheetOpen ||
      this.isWorkspaceDiffDetailSheetOpen ||
      this.isWorkspaceContentPreviewSheetOpen ||
      this.isWorkspaceActionsSheetOpen ||
      this.isSessionActionsSheetOpen ||
      this.isRenameWorkspaceSheetOpen ||
      this.isRenameSessionSheetOpen;
  }

  private isReasoningExpanded(messageId: string): boolean {
    for (let index = 0; index < this.expandedReasoningMessageIds.length; index++) {
      if (this.expandedReasoningMessageIds[index] === messageId) {
        return true;
      }
    }
    return false;
  }

  private reasoningViewportHeight(messageId: string): number {
    return this.isReasoningExpanded(messageId) ? AGENT_HOME_REASONING_EXPANDED_HEIGHT : AGENT_HOME_REASONING_COLLAPSED_HEIGHT;
  }

  private reasoningMaxLines(messageId: string): number {
    return this.isReasoningExpanded(messageId) ? 60 : 1;
  }

  private toggleReasoningExpansion(messageId: string): void {
    this.setReasoningExpansion(messageId, !this.isReasoningExpanded(messageId), true);
  }

  private expandReasoningMessage(messageId: string): void {
    if (this.isReasoningExpanded(messageId)) {
      return;
    }
    this.setReasoningExpansion(messageId, true, false);
  }

  private collapseReasoningMessage(messageId: string): void {
    if (!this.isReasoningExpanded(messageId)) {
      return;
    }
    this.setReasoningExpansion(messageId, false, true);
  }

  private collapseReasoningForCurrentSession(): void {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (
        item.sessionId === this.activeSessionId &&
          item.role === AgentHomeMessageRole.ASSISTANT &&
          item.reasoningText.length > 0
      ) {
        this.collapseReasoningMessage(item.id);
      }
    }
  }

  private setReasoningExpansion(messageId: string, expanded: boolean, animated: boolean): void {
    const updater = (): void => {
      const nextIds: Array<string> = [];
      let found = false;
      for (let index = 0; index < this.expandedReasoningMessageIds.length; index++) {
        const itemId = this.expandedReasoningMessageIds[index];
        if (itemId === messageId) {
          found = true;
          if (expanded) {
            nextIds.push(itemId);
          }
        } else {
          nextIds.push(itemId);
        }
      }
      if (expanded && !found) {
        nextIds.push(messageId);
      }
      this.expandedReasoningMessageIds = nextIds;
    };
    if (animated) {
      this.animateTransientState(220, Curve.EaseInOut, updater);
      return;
    }
    updater();
  }

  private showTransientStatus(text: string): void {
    const normalized = this.normalizeTransientStatusText(text);
    if (normalized.length === 0) {
      return;
    }
    this.clearTransientStatusTimer();
    this.transientStatusSequence = this.transientStatusSequence + 1;
    const sequence = this.transientStatusSequence;
    this.transientStatusText = normalized;
    this.transientStatusVisible = true;
    this.animateTransientState(180, Curve.EaseOut, (): void => {
      this.transientStatusOpacity = 1;
    });
    this.transientStatusTimer = setTimeout((): void => {
      if (this.transientStatusSequence === sequence) {
        this.hideTransientStatus();
      }
    }, 3200);
  }

  private hideTransientStatus(): void {
    this.clearTransientStatusTimer();
    this.animateTransientState(220, Curve.EaseOut, (): void => {
      this.transientStatusOpacity = 0;
    });
    const sequence = this.transientStatusSequence;
    this.transientStatusTimer = setTimeout((): void => {
      if (this.transientStatusSequence === sequence) {
        this.transientStatusVisible = false;
        this.transientStatusText = '';
        this.transientStatusTimer = -1;
      }
    }, 240);
  }

  private clearTransientStatusTimer(): void {
    if (this.transientStatusTimer >= 0) {
      clearTimeout(this.transientStatusTimer);
      this.transientStatusTimer = -1;
    }
  }

  private beginConversationRenderTransition(sessionId: string): void {
    if (sessionId.length === 0) {
      return;
    }
    this.clearConversationRenderTimers();
    this.conversationRenderSequence = this.conversationRenderSequence + 1;
    const sequence = this.conversationRenderSequence;
    this.conversationRenderSessionId = sessionId;
    this.isConversationRenderPending = true;
    this.animateTransientState(AGENT_HOME_CONVERSATION_RENDER_FADE_MS, Curve.EaseOut, (): void => {
      this.conversationRenderOverlayOpacity = 1;
    });
    this.conversationRenderTimeoutTimer = setTimeout((): void => {
      if (this.conversationRenderSequence === sequence) {
        this.hideConversationRenderTransition(sequence);
      }
    }, AGENT_HOME_CONVERSATION_RENDER_TIMEOUT_MS);
  }

  private scheduleConversationRenderReady(sessionId: string): void {
    if (!this.isConversationRenderPending) {
      return;
    }
    if (this.conversationRenderSessionId.length > 0 && this.conversationRenderSessionId !== sessionId) {
      return;
    }
    if (this.conversationRenderSettleTimer >= 0) {
      clearTimeout(this.conversationRenderSettleTimer);
      this.conversationRenderSettleTimer = -1;
    }
    const sequence = this.conversationRenderSequence;
    this.conversationRenderSettleTimer = setTimeout((): void => {
      if (this.conversationRenderSequence === sequence) {
        this.hideConversationRenderTransition(sequence);
      }
    }, AGENT_HOME_CONVERSATION_RENDER_SETTLE_MS);
  }

  private hideConversationRenderTransition(sequence: number): void {
    if (this.conversationRenderSequence !== sequence) {
      return;
    }
    if (this.conversationRenderTimeoutTimer >= 0) {
      clearTimeout(this.conversationRenderTimeoutTimer);
      this.conversationRenderTimeoutTimer = -1;
    }
    if (this.conversationRenderSettleTimer >= 0) {
      clearTimeout(this.conversationRenderSettleTimer);
      this.conversationRenderSettleTimer = -1;
    }
    this.animateTransientState(AGENT_HOME_CONVERSATION_RENDER_FADE_MS, Curve.EaseOut, (): void => {
      this.conversationRenderOverlayOpacity = 0;
    });
    this.conversationRenderSettleTimer = setTimeout((): void => {
      if (this.conversationRenderSequence === sequence) {
        this.isConversationRenderPending = false;
        this.conversationRenderSessionId = '';
        this.conversationRenderSettleTimer = -1;
      }
    }, AGENT_HOME_CONVERSATION_RENDER_FADE_MS + 40);
  }

  private clearConversationRenderTimers(): void {
    if (this.conversationRenderSettleTimer >= 0) {
      clearTimeout(this.conversationRenderSettleTimer);
      this.conversationRenderSettleTimer = -1;
    }
    if (this.conversationRenderTimeoutTimer >= 0) {
      clearTimeout(this.conversationRenderTimeoutTimer);
      this.conversationRenderTimeoutTimer = -1;
    }
  }

  private handleConversationScroll(yOffset: number): void {
    if (this.isConversationProgrammaticScroll) {
      return;
    }
    const distance = Math.abs(yOffset);
    if (distance <= 0) {
      return;
    }
    this.conversationAwayFromBottomDistance = this.conversationAwayFromBottomDistance + distance;
    if (this.conversationAwayFromBottomDistance >= AGENT_HOME_CONVERSATION_BOTTOM_BUTTON_THRESHOLD) {
      this.showConversationBottomButton = true;
    }
    this.collapseComposerToCompact();
  }

  private scheduleConversationScrollToBottom(animated: boolean): void {
    this.clearConversationAutoScrollTimer();
    this.conversationAutoScrollTimer = setTimeout((): void => {
      this.conversationAutoScrollTimer = -1;
      this.scrollConversationToBottom(animated);
      this.scheduleConversationScrollToBottomAfterContentSettle();
    }, 60);
  }

  private scheduleConversationScrollForNewContent(): void {
    if (!this.showConversationBottomButton) {
      this.scheduleConversationScrollToBottom(true);
    }
  }

  private finishBridgeReplyUiUpdate(): void {
    this.resetConversationBottomButtonState();
    this.scheduleConversationScrollToBottom(true);
  }

  private scheduleConversationScrollToBottomAfterContentSettle(): void {
    if (this.showConversationBottomButton) {
      return;
    }
    this.conversationAutoScrollTimer = setTimeout((): void => {
      this.conversationAutoScrollTimer = -1;
      if (!this.showConversationBottomButton) {
        this.scrollConversationToBottom(false);
      }
    }, 260);
  }

  private scrollConversationToBottom(animated: boolean): void {
    this.beginConversationProgrammaticScrollGuard();
    this.resetConversationBottomButtonState();
    try {
      if (animated) {
        this.conversationScroller.scrollEdge(Edge.Bottom);
      } else {
        this.conversationScroller.scrollEdge(Edge.Bottom);
      }
    } catch (error) {
      logger.warn(TAG, 'scroll conversation to bottom failed: ' + this.errorToString(error));
    }
  }

  private resetConversationBottomButtonState(): void {
    this.showConversationBottomButton = false;
    this.conversationAwayFromBottomDistance = 0;
  }

  private beginConversationProgrammaticScrollGuard(): void {
    this.clearConversationScrollGuardTimer();
    this.isConversationProgrammaticScroll = true;
    this.conversationScrollGuardTimer = setTimeout((): void => {
      this.isConversationProgrammaticScroll = false;
      this.conversationScrollGuardTimer = -1;
    }, AGENT_HOME_CONVERSATION_SCROLL_GUARD_MS);
  }

  private clearConversationScrollGuardTimer(): void {
    if (this.conversationScrollGuardTimer >= 0) {
      clearTimeout(this.conversationScrollGuardTimer);
      this.conversationScrollGuardTimer = -1;
    }
    this.isConversationProgrammaticScroll = false;
  }

  private clearConversationAutoScrollTimer(): void {
    if (this.conversationAutoScrollTimer >= 0) {
      clearTimeout(this.conversationAutoScrollTimer);
      this.conversationAutoScrollTimer = -1;
    }
  }

  private startActiveTurnTimer(): void {
    if (this.activeTurnStartedAt <= 0) {
      this.activeTurnStartedAt = Date.now();
    }
    this.activeTurnTimerVisible = true;
    this.updateActiveTurnElapsedText();
    if (this.activeTurnTimer >= 0) {
      return;
    }
    this.activeTurnTimer = setInterval((): void => {
      this.updateActiveTurnElapsedText();
    }, 1000);
  }

  private stopActiveTurnTimer(): void {
    if (this.activeTurnTimer >= 0) {
      clearInterval(this.activeTurnTimer);
      this.activeTurnTimer = -1;
    }
    this.clearActiveTurnWatchdog();
    this.activeTurnStartedAt = 0;
    this.assistantResponseStartedAt = 0;
    this.activeTurnLastActivityAt = 0;
    this.activeTurnElapsedText = '';
    this.activeTurnTimerVisible = false;
  }

  private startSessionStatusPulse(): void {
    if (this.sessionStatusPulseTimer >= 0) {
      return;
    }
    this.sessionStatusPulseTimer = setInterval((): void => {
      const nextValue = this.sessionStatusPulseValue > 0 ? 0 : 1;
      const uiContext = this.getUIContext();
      if (uiContext) {
        uiContext.animateTo({ duration: 820, curve: Curve.EaseInOut }, (): void => {
          this.sessionStatusPulseValue = nextValue;
        });
      } else {
        this.sessionStatusPulseValue = nextValue;
      }
    }, 920);
  }

  private clearSessionStatusPulse(): void {
    if (this.sessionStatusPulseTimer >= 0) {
      clearInterval(this.sessionStatusPulseTimer);
      this.sessionStatusPulseTimer = -1;
    }
    this.sessionStatusPulseValue = 0;
  }

  private markActiveTurnActivity(): void {
    this.activeTurnLastActivityAt = Date.now();
    this.startActiveTurnWatchdog();
  }

  private startActiveTurnWatchdog(): void {
    if (this.activeTurnWatchdogTimer >= 0) {
      return;
    }
    this.activeTurnWatchdogTimer = setInterval((): void => {
      this.handleActiveTurnWatchdogTick();
    }, AGENT_HOME_REPLY_STALL_CHECK_MS);
  }

  private clearActiveTurnWatchdog(): void {
    if (this.activeTurnWatchdogTimer >= 0) {
      clearInterval(this.activeTurnWatchdogTimer);
      this.activeTurnWatchdogTimer = -1;
    }
  }

  private handleActiveTurnWatchdogTick(): void {
    if (!this.isReplyInProgress()) {
      this.clearActiveTurnWatchdog();
      return;
    }
    if (this.activeTurnLastActivityAt <= 0) {
      this.activeTurnLastActivityAt = this.activeTurnStartedAt > 0 ? this.activeTurnStartedAt : Date.now();
      return;
    }
    const elapsedMs = Date.now() - this.activeTurnLastActivityAt;
    if (elapsedMs < AGENT_HOME_REPLY_STALL_TIMEOUT_MS) {
      return;
    }
    this.finishStalledActiveTurn(elapsedMs);
  }

  private finishStalledActiveTurn(elapsedMs: number): void {
    const message = this.buildStalledReplyText(elapsedMs);
    logger.warn(
      TAG,
      'bridge active session stalled: sessionId=' + this.currentBridgeSessionId() +
        ', elapsedMs=' + String(elapsedMs) +
        ', activeTool=' + this.activeToolName
    );
    this.markActiveSessionRunningToolsFailed(message);
    this.addMessage(AgentHomeMessageRole.STATUS, '', message, '');
    this.replyState = AgentHomeReplyState.IDLE;
    this.activeToolName = '';
    this.activeSubagentName = '';
    this.publishAgentTaskErrorNotification(message);
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.resetActiveAssistantStream();
    this.showTransientStatus(message);
  }

  private buildStalledReplyText(elapsedMs: number): string {
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_reply_stalled')) +
      ' ' + this.formatElapsedSeconds(elapsedSeconds);
  }

  private updateActiveTurnElapsedText(): void {
    if (this.activeTurnStartedAt <= 0) {
      this.activeTurnElapsedText = '';
      return;
    }
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.activeTurnStartedAt) / 1000));
    this.activeTurnElapsedText = this.formatElapsedSeconds(elapsedSeconds);
  }

  private formatElapsedSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return String(hours) + 'h ' + String(minutes) + 'm ' + String(seconds) + 's';
    }
    if (minutes > 0) {
      return String(minutes) + 'm ' + String(seconds) + 's';
    }
    return String(seconds) + 's';
  }

  private publishAgentTaskRunningNotification(detail: string): void {
    this.agentTaskNotificationActive = true;
    this.ensureAgentTaskNotificationKey();
    this.startAgentContinuousTask();
    const title = this.resolveAgentNotificationString($r('app.string.agent_home_notification_running_title'));
    const baseContent = detail.length > 0 ? detail :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_running_content'));
    this.publishAgentNotification(
      AGENT_HOME_AGENT_TASK_NOTIFICATION_ID,
      title,
      this.buildAgentNotificationContent(baseContent, ''),
      true,
      true
    );
  }

  private publishAgentTaskToolNotification(toolName: string): void {
    const baseContent = this.resolveAgentNotificationString($r('app.string.agent_home_notification_tool_content'));
    const detail = toolName.length > 0 ? toolName : this.resolveAgentNotificationString($r('app.string.agent_home_status_tool'));
    this.publishAgentTaskRunningNotification(baseContent + ': ' + detail);
  }

  private publishAgentTaskWaitingNotification(detail: string): void {
    this.agentTaskNotificationActive = true;
    this.ensureAgentTaskNotificationKey();
    this.startAgentContinuousTask();
    this.publishAgentNotification(
      AGENT_HOME_AGENT_TASK_NOTIFICATION_ID,
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_waiting_title')),
      this.buildAgentNotificationContent(detail, ''),
      true,
      true
    );
  }

  private publishAgentTaskCompletedNotification(): void {
    if (!this.shouldPublishAgentTaskEndNotification()) {
      return;
    }
    const elapsedText = this.activeTurnElapsedText;
    const baseContent = this.resolveAgentNotificationString($r('app.string.agent_home_notification_completed_content'));
    const detail = elapsedText.length > 0 ?
      this.resolveAgentNotificationString($r('app.string.agent_home_status_elapsed')) + ': ' + elapsedText :
      '';
    this.agentTaskNotificationActive = false;
    this.agentTaskNotificationKey = '';
    this.stopAgentContinuousTask();
    this.cancelAgentRequestNotification();
    this.publishAgentNotification(
      AGENT_HOME_AGENT_TASK_NOTIFICATION_ID,
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_completed_title')),
      this.buildAgentNotificationContent(baseContent, detail),
      false,
      false
    );
  }

  private publishAgentTaskInterruptedNotification(message: string): void {
    if (!this.shouldPublishAgentTaskEndNotification()) {
      return;
    }
    const content = message.length > 0 ? message :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_interrupted_content'));
    this.agentTaskNotificationActive = false;
    this.agentTaskNotificationKey = '';
    this.stopAgentContinuousTask();
    this.cancelAgentRequestNotification();
    this.publishAgentNotification(
      AGENT_HOME_AGENT_TASK_NOTIFICATION_ID,
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_interrupted_title')),
      this.buildAgentNotificationContent(content, ''),
      false,
      false
    );
  }

  private publishAgentTaskErrorNotification(message: string): void {
    if (!this.shouldPublishAgentTaskEndNotification()) {
      return;
    }
    const content = message.length > 0 ? message :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_error_content'));
    this.agentTaskNotificationActive = false;
    this.agentTaskNotificationKey = '';
    this.stopAgentContinuousTask();
    this.cancelAgentRequestNotification();
    this.publishAgentNotification(
      AGENT_HOME_AGENT_TASK_NOTIFICATION_ID,
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_error_title')),
      this.buildAgentNotificationContent(content, ''),
      false,
      false
    );
  }

  private publishAgentUserRequestNotification(item: AgentHomeUserRequestItem): void {
    if (item.status !== AgentHomeInteractionStatus.PENDING) {
      this.cancelAgentRequestNotification();
      return;
    }
    const title = item.title.length > 0 ? item.title :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_waiting_title'));
    const baseContent = this.isPermissionRequest(item) ?
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_permission_content')) :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_request_content'));
    const detail = item.prompt.length > 0 ? item.prompt : title;
    this.activeRequestNotificationKey = item.sessionId + ':' + item.requestId;
    this.publishAgentRequestNotification(
      this.activeRequestNotificationKey,
      title,
      this.buildAgentNotificationContent(baseContent, detail)
    );
    this.publishAgentTaskWaitingNotification(baseContent + ': ' + detail);
  }

  private publishAgentPlanRequestNotification(item: AgentHomePlanItem): void {
    if (item.status !== AgentHomeInteractionStatus.PENDING) {
      this.cancelAgentRequestNotification();
      return;
    }
    const title = item.title.length > 0 ? item.title :
      this.resolveAgentNotificationString($r('app.string.agent_home_plan_title'));
    const baseContent = this.resolveAgentNotificationString($r('app.string.agent_home_notification_plan_content'));
    const detail = item.content.length > 0 ? item.content : title;
    this.activeRequestNotificationKey = item.sessionId + ':' + item.planId;
    this.publishAgentRequestNotification(
      this.activeRequestNotificationKey,
      title,
      this.buildAgentNotificationContent(baseContent, detail)
    );
    this.publishAgentTaskWaitingNotification(baseContent + ': ' + detail);
  }

  private cancelAgentRequestNotification(): void {
    if (this.activeRequestNotificationKey.length === 0) {
      return;
    }
    this.activeRequestNotificationKey = '';
    ngfSystemNotificationManager.cancel(AGENT_HOME_AGENT_REQUEST_NOTIFICATION_ID).catch((error: Error): void => {
      logger.warn(TAG, 'cancel agent request notification failed: ' + this.errorToString(error));
    });
  }

  private publishAgentNotification(
    id: number,
    title: string,
    content: string,
    isOngoing: boolean,
    isAlertOnce: boolean
  ): void {
    const safeTitle = title.length > 0 ? title : this.resolveAgentNotificationString($r('app.string.EntryAbility_label'));
    const safeContent = content.length > 0 ? content : safeTitle;
    const request = new NGFNotificationRequest(
      id,
      this.compactAgentNotificationText(safeTitle),
      this.compactAgentNotificationText(safeContent),
      NGFNotificationType.BASIC,
      0,
      0,
      isOngoing,
      isAlertOnce
    );
    this.ensureAgentNotificationPermission().then((enabled: boolean): void => {
      if (!enabled) {
        return;
      }
      ngfSystemNotificationManager.publish(request).catch((error: Error): void => {
        logger.error(TAG, 'publish agent notification failed: ' + this.errorToString(error));
      });
    }).catch((error: Error): void => {
      logger.error(TAG, 'request agent notification permission failed: ' + this.errorToString(error));
    });
  }

  private startAgentContinuousTask(): void {
    if (this.agentContinuousTaskActive || this.agentContinuousTaskPending) {
      return;
    }
    this.ensureAgentTaskNotificationKey();
    this.agentContinuousTaskPending = true;
    this.agentContinuousTaskStopRequested = false;
    const taskId = this.agentTaskNotificationKey.length > 0 ?
      this.agentTaskNotificationKey :
      'agent_task_' + String(Date.now());
    this.agentContinuousTaskId = taskId;
    ngfBackgroundTaskManager.startContinuousTask(
      taskId,
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_running_title')),
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_running_content'))
    ).then((enabled: boolean): void => {
      this.agentContinuousTaskPending = false;
      this.agentContinuousTaskActive = enabled;
      if (this.agentContinuousTaskStopRequested) {
        this.agentContinuousTaskStopRequested = false;
        if (enabled) {
          this.stopAgentContinuousTask();
        } else {
          this.agentContinuousTaskId = '';
        }
        return;
      }
      if (!enabled) {
        this.agentContinuousTaskId = '';
      }
    }).catch((error: Error): void => {
      this.agentContinuousTaskPending = false;
      this.agentContinuousTaskActive = false;
      this.agentContinuousTaskStopRequested = false;
      this.agentContinuousTaskId = '';
      logger.warn(TAG, 'start agent continuous task failed: ' + this.errorToString(error));
    });
  }

  private stopAgentContinuousTask(): void {
    if (this.agentContinuousTaskPending) {
      this.agentContinuousTaskStopRequested = true;
      return;
    }
    if (!this.agentContinuousTaskActive) {
      return;
    }
    this.agentContinuousTaskActive = false;
    this.agentContinuousTaskStopRequested = false;
    const taskId = this.agentContinuousTaskId;
    this.agentContinuousTaskId = '';
    ngfBackgroundTaskManager.stopContinuousTask(taskId).catch((error: Error): void => {
      logger.warn(TAG, 'stop agent continuous task failed: ' + this.errorToString(error));
    });
  }

  private publishAgentRequestNotification(expectedKey: string, title: string, content: string): void {
    const safeTitle = title.length > 0 ? title :
      this.resolveAgentNotificationString($r('app.string.agent_home_notification_waiting_title'));
    const safeContent = content.length > 0 ? content : safeTitle;
    const request = new NGFNotificationRequest(
      AGENT_HOME_AGENT_REQUEST_NOTIFICATION_ID,
      this.compactAgentNotificationText(safeTitle),
      this.compactAgentNotificationText(safeContent),
      NGFNotificationType.BASIC,
      0,
      0,
      false
    );
    this.ensureAgentNotificationPermission().then((enabled: boolean): void => {
      if (!enabled || this.activeRequestNotificationKey !== expectedKey) {
        return;
      }
      ngfSystemNotificationManager.publish(request).catch((error: Error): void => {
        logger.error(TAG, 'publish agent request notification failed: ' + this.errorToString(error));
      });
    }).catch((error: Error): void => {
      logger.error(TAG, 'request agent notification permission failed: ' + this.errorToString(error));
    });
  }

  private ensureAgentNotificationPermission(): Promise<boolean> {
    if (this.agentNotificationPermissionChecked) {
      return Promise.resolve(this.agentNotificationPermissionEnabled);
    }
    const existingPending = this.agentNotificationPermissionPending;
    if (existingPending !== null) {
      return existingPending;
    }
    const pending = ngfSystemNotificationManager.requestPermission().then((enabled: boolean): boolean => {
      this.agentNotificationPermissionChecked = true;
      this.agentNotificationPermissionEnabled = enabled;
      this.agentNotificationPermissionPending = null;
      return enabled;
    }).catch((error: Error): boolean => {
      this.agentNotificationPermissionPending = null;
      this.agentNotificationPermissionEnabled = false;
      logger.error(TAG, 'request agent notification permission failed: ' + this.errorToString(error));
      return false;
    });
    this.agentNotificationPermissionPending = pending;
    return pending;
  }

  private shouldPublishAgentTaskEndNotification(): boolean {
    return this.agentTaskNotificationActive ||
      this.activeTurnTimerVisible ||
      this.replyState !== AgentHomeReplyState.IDLE;
  }

  private ensureAgentTaskNotificationKey(): void {
    if (this.agentTaskNotificationKey.length > 0) {
      return;
    }
    this.agentTaskNotificationKey = this.activeSessionId + ':' + String(this.activeTurnStartedAt);
  }

  private buildAgentNotificationContent(baseContent: string, detail: string): string {
    const parts: Array<string> = [];
    if (baseContent.length > 0) {
      parts.push(baseContent);
    }
    if (detail.length > 0) {
      parts.push(detail);
    }
    const contextText = this.agentNotificationContextText();
    if (contextText.length > 0) {
      parts.push(contextText);
    }
    return this.compactAgentNotificationText(parts.join(' · '));
  }

  private agentNotificationContextText(): string {
    const parts: Array<string> = [];
    const session = this.currentSession();
    if (session !== null && session.title.length > 0) {
      parts.push(session.title);
    }
    const providerName = this.providerDisplayNameForId(this.currentSessionProviderId());
    if (providerName.length > 0) {
      parts.push(providerName);
    }
    const subagentName = this.currentVisibleSubagentName();
    if (subagentName.length > 0) {
      parts.push(subagentName);
    }
    return parts.join(' · ');
  }

  private resolveAgentNotificationString(resource: ResourceStr): string {
    return resolveResourceString(this.getUIContext().getHostContext(), resource);
  }

  private compactAgentNotificationText(text: string): string {
    const value = text.trim();
    if (value.length <= AGENT_HOME_NOTIFICATION_TEXT_LIMIT) {
      return value;
    }
    return value.substring(0, AGENT_HOME_NOTIFICATION_TEXT_LIMIT) + '...';
  }

  private startContextCompactionStatus(): void {
    this.isContextCompacting = true;
  }

  private stopContextCompactionStatus(): void {
    this.isContextCompacting = false;
  }

  private animateTransientState(duration: number, curve: Curve, updater: () => void): void {
    const uiContext = this.getUIContext();
    if (uiContext) {
      uiContext.animateTo({ duration: duration, curve: curve }, updater);
      return;
    }
    updater();
  }

  private setComposerExpansionProgress(progress: number): void {
    const nextProgress = this.clampComposerProgress(progress);
    this.composerExpansionProgress = nextProgress;
    this.isCompactComposerMode = nextProgress < 0.5;
  }

  private shouldExpandComposerAfterPan(event: GestureEvent): boolean {
    if (event.velocityY <= -AGENT_HOME_COMPOSER_EXPANSION_VELOCITY_THRESHOLD) {
      return true;
    }
    if (event.velocityY >= AGENT_HOME_COMPOSER_EXPANSION_VELOCITY_THRESHOLD) {
      return false;
    }
    return this.clampComposerProgress(this.composerExpansionProgress) >= AGENT_HOME_COMPOSER_EXPANSION_SNAP_THRESHOLD;
  }

  private handleComposerPanStart(_event: GestureEvent): void {
    this.clearComposerSettleTimer();
    this.isComposerDragging = true;
    this.composerDragStartProgress = this.clampComposerProgress(this.composerExpansionProgress);
  }

  private handleComposerPanUpdate(event: GestureEvent): void {
    const dragProgress = -event.offsetY / AGENT_HOME_COMPOSER_EXPANSION_DRAG_DISTANCE;
    this.setComposerExpansionProgress(this.composerDragStartProgress + dragProgress);
  }

  private handleComposerPanEnd(event: GestureEvent): void {
    this.isComposerDragging = false;
    this.settleComposerExpansion(this.shouldExpandComposerAfterPan(event));
  }

  private handleComposerPanCancel(_event: GestureEvent): void {
    this.isComposerDragging = false;
    this.settleComposerExpansion(this.composerExpansionProgress >= AGENT_HOME_COMPOSER_EXPANSION_SNAP_THRESHOLD);
  }

  private settleComposerExpansion(expanded: boolean): void {
    this.clearComposerSettleTimer();
    this.isComposerDragging = false;
    this.composerSettleSequence = this.composerSettleSequence + 1;
    const sequence = this.composerSettleSequence;
    const startProgress = this.clampComposerProgress(this.composerExpansionProgress);
    const targetProgress = expanded ? 1 : 0;
    const distance = Math.abs(targetProgress - startProgress);
    if (distance <= 0.01) {
      this.setComposerExpansionProgress(targetProgress);
      return;
    }
    const duration = Math.max(96, AGENT_HOME_COMPOSER_SETTLE_DURATION_MS * distance);
    const startTime = Date.now();
    this.composerSettleTimer = setInterval((): void => {
      if (this.composerSettleSequence !== sequence) {
        this.clearComposerSettleTimer();
        return;
      }
      const elapsed = Date.now() - startTime;
      const linearProgress = this.clampComposerProgress(elapsed / duration);
      const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
      this.setComposerExpansionProgress(startProgress + (targetProgress - startProgress) * easedProgress);
      if (linearProgress >= 1) {
        this.clearComposerSettleTimer();
        this.setComposerExpansionProgress(targetProgress);
      }
    }, AGENT_HOME_COMPOSER_SETTLE_FRAME_MS);
  }

  private clearComposerSettleTimer(): void {
    if (this.composerSettleTimer >= 0) {
      clearInterval(this.composerSettleTimer);
      this.composerSettleTimer = -1;
    }
  }

  private expandComposerFromCompact(): void {
    if (this.composerExpansionProgress >= 1) {
      return;
    }
    this.settleComposerExpansion(true);
  }

  private collapseComposerToCompact(): void {
    if (this.composerExpansionProgress <= 0) {
      return;
    }
    this.settleComposerExpansion(false);
  }

  private normalizeTransientStatusText(text: string): string {
    let normalized = text.split('\r').join(' ').split('\n').join(' ').trim();
    while (normalized.indexOf('  ') >= 0) {
      normalized = normalized.split('  ').join(' ');
    }
    if (normalized.length > 180) {
      return normalized.substring(0, 180) + '...';
    }
    return normalized;
  }

  private handleConnect(): void {
    if (this.bridgeEndpoint.trim().length === 0) {
      this.addBridgeLogMessage(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_endpoint_required'))
      );
      this.openSheet(AgentHomeSheetKey.SETTINGS);
      return;
    }
    if (this.bridgeToken.trim().length === 0) {
      this.addBridgeLogMessage(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_token_required'))
      );
      this.openSheet(AgentHomeSheetKey.SETTINGS);
      return;
    }
    const normalizedEndpoint = AgentBridgeClient.normalizeEndpointInput(this.bridgeEndpoint);
    this.bridgeEndpoint = normalizedEndpoint;
    this.persistProfile();
    const config = new AgentBridgeConnectionConfig(normalizedEndpoint, this.bridgeToken);
    this.client.connect(config);
  }

  private restoreLastBridgeConnection(): void {
    if (this.bridgeEndpoint.trim().length === 0 || this.bridgeToken.trim().length === 0) {
      return;
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING ||
      this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return;
    }
    const normalizedEndpoint = AgentBridgeClient.normalizeEndpointInput(this.bridgeEndpoint);
    if (normalizedEndpoint.length === 0) {
      return;
    }
    this.bridgeEndpoint = normalizedEndpoint;
    this.addBridgeLogMessage(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_restore_connection'))
    );
    const config = new AgentBridgeConnectionConfig(normalizedEndpoint, this.bridgeToken.trim());
    this.client.connect(config);
  }

  private handleComposerReconnect(): void {
    if (!this.canReconnectBridgeFromComposer()) {
      return;
    }
    this.restoreLastBridgeConnection();
  }

  private scanBridgeConnectionQr(openSessionsAfterConnect: boolean = false): void {
    const options: scanBarcode.ScanOptions = {
      scanTypes: [scanCore.ScanType.QR_CODE],
      enableAlbum: true,
      enableMultiMode: false
    };
    try {
      scanBarcode.startScanForResult(
        this.getUIContext().getHostContext(),
        options,
        (error: BusinessError, result: scanBarcode.ScanResult): void => {
          if (error) {
            this.handleScanBridgeQrError(error);
            return;
          }
          this.applyBridgeQrPayload(result.originalValue, openSessionsAfterConnect);
        }
      );
    } catch (error) {
      this.handleScanBridgeQrError(error);
    }
  }

  private handleScanBridgeQrError(error: Object | string | number | boolean | null | undefined): void {
    const message = this.errorToString(error);
    if (message.indexOf('1000500002') >= 0) {
      return;
    }
    logger.error(TAG, 'scan bridge qr failed: ' + message);
    this.addBridgeLogMessage(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_scan_bridge_qr_failed')) +
        ': ' + message
    );
  }

  private applyBridgeQrPayload(source: string, openSessionsAfterConnect: boolean = false): void {
    const payload = this.parseBridgeQrPayload(source);
    if (payload.endpoint.trim().length === 0 || payload.token.trim().length === 0) {
      this.addBridgeLogMessage(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_scan_bridge_qr_invalid'))
      );
      return;
    }

    this.bridgeEndpoint = AgentBridgeClient.normalizeEndpointInput(payload.endpoint);
    this.bridgeToken = payload.token.trim();
    if (payload.providerId.trim().length > 0 && this.hasProvider(payload.providerId.trim())) {
      this.selectedProviderId = payload.providerId.trim();
      this.ensureSelectedRuntimeOptions();
    }
    this.applyBridgeQrWorkspace(payload.workspacePath, payload.workspaceTitle);
    this.persistProfile();
    this.addBridgeLogMessage(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_scan_bridge_qr_applied'))
    );
    try {
      this.getUIContext().getPromptAction().showToast({
        message: resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_scan_bridge_qr_applied'))
      });
    } catch (error) {
      logger.warn(TAG, 'show bridge qr applied toast failed: ' + this.errorToString(error));
    }
    this.handleConnect();
    this.pendingOpenSessionsSheetAfterBridgeQrConnect = openSessionsAfterConnect;
  }

  private parseBridgeQrPayload(source: string): AgentBridgeQrPayload {
    const trimmed = source.trim();
    if (trimmed.startsWith('ngf-agent-bridge://connect?')) {
      return new AgentBridgeQrPayload(
        this.extractQueryParam(trimmed, 'endpoint'),
        this.extractQueryParam(trimmed, 'token'),
        this.extractQueryParam(trimmed, 'providerId'),
        this.extractQueryParam(trimmed, 'workspacePath'),
        this.extractQueryParam(trimmed, 'workspaceTitle')
      );
    }
    return new AgentBridgeQrPayload(
      this.extractJsonString(trimmed, 'endpoint'),
      this.extractJsonString(trimmed, 'token'),
      this.extractJsonString(trimmed, 'providerId'),
      this.extractJsonString(trimmed, 'workspacePath'),
      this.extractJsonString(trimmed, 'workspaceTitle')
    );
  }

  private extractQueryParam(source: string, key: string): string {
    const queryStart = source.indexOf('?');
    if (queryStart < 0 || queryStart + 1 >= source.length) {
      return '';
    }
    const query = source.substring(queryStart + 1);
    const pairs = query.split('&');
    for (let index = 0; index < pairs.length; index++) {
      const pair = pairs[index];
      const separator = pair.indexOf('=');
      const name = separator >= 0 ? pair.substring(0, separator) : pair;
      if (name === key) {
        const value = separator >= 0 ? pair.substring(separator + 1) : '';
        return this.decodeUriComponentSafe(value);
      }
    }
    return '';
  }

  private extractJsonString(source: string, key: string): string {
    const pattern = '"' + key + '"';
    const keyIndex = source.indexOf(pattern);
    if (keyIndex < 0) {
      return '';
    }
    const colonIndex = source.indexOf(':', keyIndex + pattern.length);
    if (colonIndex < 0) {
      return '';
    }
    let quoteIndex = colonIndex + 1;
    while (quoteIndex < source.length && source.charAt(quoteIndex) === ' ') {
      quoteIndex++;
    }
    if (quoteIndex >= source.length || source.charAt(quoteIndex) !== '"') {
      return '';
    }

    let result = '';
    let cursor = quoteIndex + 1;
    while (cursor < source.length) {
      const ch = source.charAt(cursor);
      if (ch === '"') {
        return result;
      }
      if (ch === '\\' && cursor + 1 < source.length) {
        const escaped = source.charAt(cursor + 1);
        if (escaped === 'n') {
          result = result + '\n';
        } else if (escaped === 'r') {
          result = result + '\r';
        } else if (escaped === 't') {
          result = result + '\t';
        } else {
          result = result + escaped;
        }
        cursor = cursor + 2;
      } else {
        result = result + ch;
        cursor = cursor + 1;
      }
    }
    return '';
  }

  private decodeUriComponentSafe(value: string): string {
    try {
      return decodeURIComponent(value.split('+').join(' '));
    } catch (error) {
      logger.warn(TAG, 'decode qr payload field failed: ' + this.errorToString(error));
    }
    return value;
  }

  private applyBridgeQrWorkspace(workspacePath: string, workspaceTitle: string): void {
    const path = workspacePath.trim();
    if (path.length === 0) {
      return;
    }
    const existing = this.findWorkspaceByPath(path);
    if (existing) {
      this.activeWorkspaceId = existing.id;
      this.workspaceTitleDraft = existing.title;
      this.workspacePathDraft = existing.subtitle;
      return;
    }

    const title = workspaceTitle.trim().length > 0 ? workspaceTitle.trim() : this.workspaceTitleFromPath(path);
    const initial = title.length > 0 ? title.substring(0, 1) : 'W';
    const workspace = new AgentHomeWorkspaceItem(
      'workspace_qr_' + String(Date.now()),
      title,
      path,
      initial,
      '#2D6CDF',
      this.currentBranchName(),
      true
    );
    const nextWorkspaces: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < this.workspaces.length; index++) {
      nextWorkspaces.push(this.workspaces[index]);
    }
    nextWorkspaces.push(workspace);
    this.workspaces = nextWorkspaces;
    this.activeWorkspaceId = workspace.id;
    this.workspaceTitleDraft = workspace.title;
    this.workspacePathDraft = workspace.subtitle;
    this.persistence.saveWorkspace(workspace).catch((error: Error): void => {
      logger.error(TAG, 'persist qr workspace failed: ' + this.errorToString(error));
    });
  }

  private handleSendMessage(): void {
    if (this.isReplyInProgress()) {
      this.handleStopReply();
      return;
    }
    const text = this.draftText.trim();
    if (text.length === 0 && this.attachments.length === 0) {
      return;
    }
    const outgoingContextItems = this.buildOutgoingContextItems(text);
    const outgoingText = this.buildOutgoingMessageText(text);
    this.draftText = '';
    this.attachments = [];
    this.resetActiveAssistantStream();

    if (this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_bridge_local_only'))
      );
      return;
    }

    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length > 0) {
      this.addMessage(AgentHomeMessageRole.USER, '', outgoingText, '');
      this.touchActiveSession();
      this.markReplySubmitted();
      if (this.isOutgoingContextCompactionRequest(outgoingText)) {
        this.startContextCompactionStatus();
      }
      this.client.sendMessage(
        bridgeSessionId,
        outgoingText,
        this.selectedModelId,
        this.selectedSpeedMode,
        this.selectedReasoningMode,
        this.currentAgentRunMode(),
        this.currentSelectedInteractionModes(),
        this.currentOpenCodeAgent(),
        outgoingContextItems
      );
      return;
    }

    this.pendingFirstMessage = outgoingText;
    this.pendingFirstContextItems = outgoingContextItems;
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_bridge_session_creating'))
    );
    this.markReplySubmitted();
    if (this.isOutgoingContextCompactionRequest(outgoingText)) {
      this.startContextCompactionStatus();
    }
    this.pendingBridgeCreateProviderId = this.selectedProviderId;
    this.client.createSession(
      this.selectedProviderId,
      this.currentWorkspacePath(),
      this.currentWorkspaceTitle(),
      this.selectedModelId,
      this.selectedSpeedMode,
      this.selectedReasoningMode
    );
  }

  private handleStopReply(): void {
    this.pendingFirstMessage = '';
    this.pendingFirstContextItems = [];
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length > 0) {
      this.stoppedBridgeSessionId = bridgeSessionId;
    }
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.finishLocalStopReply();
      return;
    }
    this.client.abortSession(
      this.currentSessionProviderId(),
      bridgeSessionId,
      this.remoteSessionIdForAbort(bridgeSessionId)
    );
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_stop_reply_requested'))
    );
    this.finishLocalStopReply();
  }

  private finishLocalStopReply(): void {
    this.publishAgentTaskInterruptedNotification(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_notification_interrupted_content'))
    );
    this.replyState = AgentHomeReplyState.IDLE;
    this.activeToolName = '';
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.resetActiveAssistantStream();
  }

  private markReplySubmitted(): void {
    this.stoppedBridgeSessionId = '';
    this.assistantResponseStartedAt = 0;
    this.markActiveTurnActivity();
    this.replyState = AgentHomeReplyState.RESPONDING;
    this.activeToolName = '';
    this.startActiveTurnTimer();
    this.publishAgentTaskRunningNotification('');
  }

  private async pickImageAttachments(): Promise<void> {
    const uris = await ngfMediaPickerFacade.pickImages(6);
    this.appendPickedAttachments(uris, AgentHomeAttachmentKind.IMAGE);
    if (uris.length > 0) {
      this.closeSheet();
    }
  }

  private async pickDocumentAttachments(): Promise<void> {
    const uris = await ngfMediaPickerFacade.pickDocuments();
    this.appendPickedAttachments(uris, AgentHomeAttachmentKind.DOCUMENT);
    if (uris.length > 0) {
      this.closeSheet();
    }
  }

  private appendPickedAttachments(uris: Array<string>, kind: string): void {
    if (uris.length === 0) {
      return;
    }
    const nextItems: Array<AgentHomeAttachmentItem> = [];
    for (let index = 0; index < this.attachments.length; index++) {
      nextItems.push(this.attachments[index]);
    }
    for (let index = 0; index < uris.length; index++) {
      const uri = uris[index];
      if (uri.length === 0 || this.hasAttachmentUri(uri, nextItems)) {
        continue;
      }
      nextItems.push(this.buildAttachmentItem(uri, kind, index));
    }
    this.attachments = nextItems;
  }

  private buildAttachmentItem(uri: string, kind: string, ordinal: number): AgentHomeAttachmentItem {
    const displayName = this.extractAttachmentDisplayName(uri, kind);
    const extensionName = this.extractAttachmentExtension(displayName, kind);
    const id = 'attachment_' + kind + '_' + String(Date.now()) + '_' + String(ordinal);
    return new AgentHomeAttachmentItem(id, uri, displayName, extensionName, kind);
  }

  private removeAttachment(attachmentId: string): void {
    const nextItems: Array<AgentHomeAttachmentItem> = [];
    for (let index = 0; index < this.attachments.length; index++) {
      const item = this.attachments[index];
      if (item.id !== attachmentId) {
        nextItems.push(item);
      }
    }
    this.attachments = nextItems;
  }

  private hasAttachmentUri(uri: string, items: Array<AgentHomeAttachmentItem>): boolean {
    for (let index = 0; index < items.length; index++) {
      if (items[index].uri === uri) {
        return true;
      }
    }
    return false;
  }

  private extractAttachmentDisplayName(uri: string, kind: string): string {
    let normalized = uri;
    const queryIndex = normalized.indexOf('?');
    if (queryIndex >= 0) {
      normalized = normalized.substring(0, queryIndex);
    }
    while (normalized.endsWith('/') || normalized.endsWith('\\')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    const slashIndex = normalized.lastIndexOf('/');
    const backslashIndex = normalized.lastIndexOf('\\');
    const segmentIndex = slashIndex > backslashIndex ? slashIndex : backslashIndex;
    if (segmentIndex >= 0 && segmentIndex + 1 < normalized.length) {
      const name = normalized.substring(segmentIndex + 1);
      if (name.length > 0) {
        return name;
      }
    }
    if (normalized.length > 0) {
      return normalized;
    }
    if (kind === AgentHomeAttachmentKind.IMAGE) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_attachment_image_fallback'));
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_attachment_file_fallback'));
  }

  private extractAttachmentExtension(displayName: string, kind: string): string {
    const dotIndex = displayName.lastIndexOf('.');
    if (dotIndex >= 0 && dotIndex + 1 < displayName.length) {
      return displayName.substring(dotIndex + 1).toUpperCase();
    }
    if (kind === AgentHomeAttachmentKind.IMAGE) {
      return 'IMG';
    }
    return 'FILE';
  }

  private resolveAttachmentSymbol(item: AgentHomeAttachmentItem): Resource {
    if (item.kind === AgentHomeAttachmentKind.DOCUMENT) {
      return $r('sys.symbol.doc_plaintext');
    }
    return $r('sys.symbol.doc_plaintext');
  }

  private buildOutgoingContextItems(text: string): Array<AgentBridgeContextItem> {
    const items: Array<AgentBridgeContextItem> = [];
    const workspacePath = this.currentWorkspacePath();
    if (workspacePath.length > 0) {
      this.appendContextItemIfMissing(
        items,
        new AgentBridgeContextItem(
          'workspace',
          workspacePath,
          '',
          this.currentWorkspaceTitle(),
          '',
          'text/plain'
        )
      );
    }
    this.appendMentionContextItems(items, text);
    this.appendAttachmentContextItems(items);
    return items;
  }

  private appendMentionContextItems(items: Array<AgentBridgeContextItem>, text: string): void {
    const tokens = this.extractContextMentionTokens(text);
    for (let index = 0; index < tokens.length; index++) {
      const pathValue = tokens[index];
      this.appendContextItemIfMissing(
        items,
        new AgentBridgeContextItem(
          'file',
          pathValue,
          '',
          this.contextTitleForPath(pathValue),
          '',
          'text/plain'
        )
      );
    }
  }

  private appendAttachmentContextItems(items: Array<AgentBridgeContextItem>): void {
    for (let index = 0; index < this.attachments.length; index++) {
      const item = this.attachments[index];
      const kind = item.kind === AgentHomeAttachmentKind.IMAGE ? 'image' : 'file';
      this.appendContextItemIfMissing(
        items,
        new AgentBridgeContextItem(
          kind,
          this.pathFromAttachmentUri(item.uri),
          item.uri,
          item.displayName,
          '',
          this.mediaTypeForAttachment(item)
        )
      );
    }
  }

  private appendContextItemIfMissing(items: Array<AgentBridgeContextItem>, item: AgentBridgeContextItem): void {
    if (item.path.length === 0 && item.uri.length === 0 && item.content.length === 0) {
      return;
    }
    for (let index = 0; index < items.length; index++) {
      const existing = items[index];
      if (existing.kind === item.kind && existing.path === item.path && existing.uri === item.uri) {
        return;
      }
      if (item.path.length > 0 && existing.path === item.path) {
        return;
      }
    }
    items.push(item);
  }

  private extractContextMentionTokens(text: string): Array<string> {
    const items: Array<string> = [];
    let token = '';
    for (let index = 0; index < text.length; index++) {
      const ch = text.charAt(index);
      if (this.isContextTokenSeparator(ch)) {
        this.appendCleanContextMentionToken(items, token);
        token = '';
      } else {
        token = token + ch;
      }
    }
    this.appendCleanContextMentionToken(items, token);
    return items;
  }

  private appendCleanContextMentionToken(items: Array<string>, token: string): void {
    const cleanToken = this.cleanContextMentionToken(token);
    if (cleanToken.length === 0) {
      return;
    }
    for (let index = 0; index < items.length; index++) {
      if (items[index] === cleanToken) {
        return;
      }
    }
    items.push(cleanToken);
  }

  private cleanContextMentionToken(token: string): string {
    let value = token.trim();
    if (value.length <= 1 || value.charAt(0) !== '@') {
      return '';
    }
    value = value.substring(1);
    while (value.length > 0 && this.isContextTokenTrailingPunctuation(value.charAt(value.length - 1))) {
      value = value.substring(0, value.length - 1);
    }
    if (value.length === 0 || value.charAt(0) === '/') {
      return '';
    }
    return value;
  }

  private isContextTokenSeparator(value: string): boolean {
    return value === ' ' || value === '\n' || value === '\r' || value === '\t';
  }

  private isContextTokenTrailingPunctuation(value: string): boolean {
    return value === ',' || value === '.' || value === ';' || value === ':' ||
      value === ')' || value === ']' || value === '}';
  }

  private contextTitleForPath(pathValue: string): string {
    const slashIndex = pathValue.lastIndexOf('/');
    const backslashIndex = pathValue.lastIndexOf('\\');
    const index = slashIndex > backslashIndex ? slashIndex : backslashIndex;
    if (index >= 0 && index + 1 < pathValue.length) {
      return pathValue.substring(index + 1);
    }
    return pathValue;
  }

  private pathFromAttachmentUri(uri: string): string {
    if (uri.startsWith('file://')) {
      return uri.substring(7);
    }
    return uri;
  }

  private mediaTypeForAttachment(item: AgentHomeAttachmentItem): string {
    const extension = item.extensionName.toLowerCase();
    if (item.kind === AgentHomeAttachmentKind.IMAGE) {
      return 'image/' + (extension.length > 0 ? extension : 'png');
    }
    if (extension.length > 0) {
      return 'text/' + extension;
    }
    return 'text/plain';
  }

  private buildOutgoingMessageText(text: string): string {
    let content = text;
    if (this.attachments.length === 0) {
      return content;
    }
    if (content.length > 0) {
      content = content + '\n\n';
    }
    content = content + 'Attachments:';
    for (let index = 0; index < this.attachments.length; index++) {
      const item = this.attachments[index];
      const label = item.kind === AgentHomeAttachmentKind.IMAGE ? 'image' : 'file';
      let line = '\n- ' + label + ': ' + item.displayName;
      if (item.uri !== item.displayName) {
        line = line + ' (' + item.uri + ')';
      }
      content = content + line;
    }
    return content;
  }

  private isOutgoingContextCompactionRequest(text: string): boolean {
    const trimmed = text.trim().toLowerCase();
    return trimmed === '/compact' || trimmed.startsWith('/compact ') ||
      trimmed === '/summarize' || trimmed.startsWith('/summarize ');
  }

  private updateContextCompactionFromBridgeText(text: string): void {
    const value = text.toLowerCase();
    if (this.isContextCompactionEndText(value)) {
      this.stopContextCompactionStatus();
      return;
    }
    if (this.isContextCompactionStartText(value)) {
      this.startContextCompactionStatus();
    }
  }

  private isContextCompactionStartText(value: string): boolean {
    if (value.indexOf('context.compacting') >= 0 || value.indexOf('compact.started') >= 0 ||
      value.indexOf('compaction.started') >= 0) {
      return true;
    }
    const hasCompactTerm = value.indexOf('/compact') >= 0 || value.indexOf('compacting') >= 0 ||
      value.indexOf('compact context') >= 0 || value.indexOf('summariz') >= 0;
    if (!hasCompactTerm) {
      return false;
    }
    return value.indexOf('context') >= 0 || value.indexOf('/compact') >= 0;
  }

  private isContextCompactionEndText(value: string): boolean {
    if (this.isContextCompacting && (value.indexOf('"event":"message.completed"') >= 0 ||
      value.indexOf('"type":"session.idle"') >= 0)) {
      return true;
    }
    return value.indexOf('context.compacted') >= 0 || value.indexOf('context.compaction.completed') >= 0 ||
      value.indexOf('compact.completed') >= 0 || value.indexOf('compaction.completed') >= 0 ||
      value.indexOf('context compressed') >= 0 || value.indexOf('summarization completed') >= 0;
  }

  private handleRequestPreview(): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED || bridgeSessionId.length === 0) {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_preview_requires_session'))
      );
      return;
    }

    const path = this.previewPath.trim();
    this.persistProfile();
    this.client.requestPreview(bridgeSessionId, path);
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_preview_requested')) + ': ' + path
    );
  }

  private handleBridgeStatus(status: string, detail: string): void {
    this.connectionStatus = status;
    this.bridgeConnectionReasonText = this.buildBridgeConnectionReasonText(status, detail);
    if (status === AgentBridgeConnectionStatus.CONNECTING) {
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
    }
    if (status === AgentBridgeConnectionStatus.DISCONNECTED || status === AgentBridgeConnectionStatus.ERROR) {
      if (status === AgentBridgeConnectionStatus.ERROR) {
        this.publishAgentTaskErrorNotification(this.buildBridgeConnectionReasonText(status, detail));
      } else {
        this.publishAgentTaskInterruptedNotification(this.buildBridgeConnectionReasonText(status, detail));
      }
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
      this.pendingRemoteSessionsRequestPairs = [];
      this.loadingRemoteSessions = false;
      this.pendingOpenSessionsSheetAfterBridgeQrConnect = false;
      this.finishPersistentStateLoading();
      this.stopActiveTurnTimer();
      this.stopContextCompactionStatus();
    }
    if (
      status === AgentBridgeConnectionStatus.CONNECTING ||
        status === AgentBridgeConnectionStatus.DISCONNECTED ||
        status === AgentBridgeConnectionStatus.ERROR
    ) {
      this.addBridgeLogMessage(this.buildConnectionStatusLogText(detail));
    }
    if (status === AgentBridgeConnectionStatus.CONNECTED) {
      if (this.pendingOpenSessionsSheetAfterBridgeQrConnect) {
        this.pendingOpenSessionsSheetAfterBridgeQrConnect = false;
        this.openSheet(AgentHomeSheetKey.SESSIONS);
      } else {
        this.requestRemoteSessions();
      }
      const requestedHistory = this.refreshActiveSessionHistory();
      if (!requestedHistory) {
        this.finishPersistentStateLoading();
      }
    }
  }

  private handleBridgeError(message: string): void {
    this.connectionStatus = AgentBridgeConnectionStatus.ERROR;
    this.bridgeConnectionReasonText = this.buildBridgeConnectionReasonText(AgentBridgeConnectionStatus.ERROR, message);
    this.replyState = AgentHomeReplyState.IDLE;
    this.activeToolName = '';
    this.activeSubagentName = '';
    this.pendingRemoteSessionsRequestPairs = [];
    this.loadingRemoteSessions = false;
    this.pendingOpenSessionsSheetAfterBridgeQrConnect = false;
    this.finishPersistentStateLoading();
    this.publishAgentTaskErrorNotification(this.bridgeConnectionReasonText);
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    if (this.isConversationRenderPending && this.activeSessionId.length > 0) {
      this.scheduleConversationRenderReady(this.activeSessionId);
    }
    this.addBridgeLogMessage(message);
  }

  private handleBridgeText(text: string): void {
    const compactText = this.compactText(text);
    logger.info(TAG, 'bridge event received: ' + compactText);
    const parsed = AgentBridgeIncomingParser.parse(text);
    const isCurrentEvent = this.isCurrentBridgeEvent(parsed);
    const isStoppedReplyEvent = this.shouldIgnoreStoppedReplyEvent(parsed);
    const isMessageImportPayload = text.indexOf('"messages":[') >= 0;
    if (isCurrentEvent && !isStoppedReplyEvent) {
      if (this.shouldCountAsActiveTurnActivity(parsed)) {
        this.markActiveTurnActivity();
      }
      this.updateActivityFromBridgeText(text);
      if (!isMessageImportPayload) {
        this.updateContextCompactionFromBridgeText(text);
      }
    }
    if (text.indexOf('"providers":[') >= 0) {
      this.applyProviderOptions(AgentBridgeIncomingParser.parseProviders(text));
    }
    if (text.indexOf('"sessions":[') >= 0) {
      const remoteSessions = AgentBridgeIncomingParser.parseRemoteSessions(text);
      this.replaceRemoteSessions(this.resolveRemoteSessionProviderIdFromResponse(text, remoteSessions, parsed), remoteSessions);
    }
    if (isMessageImportPayload) {
      const targetSessionId = this.resolveMessageImportTargetSessionId(text);
      if (targetSessionId.length > 0) {
        this.applyImportedMessages(
          AgentBridgeIncomingParser.parseImportedMessages(text),
          AgentBridgeIncomingParser.parseImportedToolCalls(text),
          targetSessionId
        );
      }
    }
    if (text.indexOf('"diffText"') >= 0 && text.indexOf('"path"') >= 0) {
      this.applyWorkspaceDiffFromBridge(text);
    }
    if (text.indexOf('"session":{') >= 0) {
      this.applyRemoteSessionUpdate(AgentBridgeIncomingParser.parseFirstRemoteSession(text));
    }
    if (parsed.sessionId.length > 0) {
      this.handleBridgeSession(parsed.sessionId);
    }
    if (isStoppedReplyEvent) {
      return;
    }
    if (parsed.eventType.length > 0 && !isCurrentEvent) {
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.OPENCODE_EVENT) {
      this.upsertOpenCodeToolCallFromRawEvent(text, parsed);
    }
    this.updateActiveSubagentFromParsed(parsed);
    if (!parsed.isOk) {
      const errorText = this.resolveBridgeErrorText(parsed, compactText);
      this.applyWorkspacePreviewErrorIfNeeded(errorText);
      if (this.isPersistentStateLoading) {
        this.finishPersistentStateLoading();
      }
      this.showTransientStatus(errorText);
      this.publishAgentTaskErrorNotification(errorText);
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
      this.stopActiveTurnTimer();
      this.stopContextCompactionStatus();
      if (this.isConversationRenderPending && this.activeSessionId.length > 0) {
        this.scheduleConversationRenderReady(this.activeSessionId);
      }
      return;
    }
    if (parsed.envelopeType === AgentBridgeEnvelopeType.RESPONSE && parsed.previewPath.length > 0) {
      this.addPreviewFromBridge(parsed, compactText);
      return;
    }
    if (parsed.envelopeType === AgentBridgeEnvelopeType.RESPONSE && parsed.downloadPath.length > 0) {
      this.handleBridgeDownloadReady(parsed);
      return;
    }

    if (parsed.eventType === AgentBridgeEventType.MESSAGE_DELTA) {
      if (parsed.text.length > 0 || parsed.reasoningText.length > 0) {
        this.startActiveTurnTimer();
        this.replyState = AgentHomeReplyState.RESPONDING;
        if (parsed.role === AgentHomeMessageRole.USER) {
          this.appendUserDelta(parsed.text, parsed.messageId);
        } else if (this.isReasoningDelta(parsed)) {
          this.appendAssistantReasoning(parsed);
        } else {
          this.appendAssistantDelta(parsed);
        }
      }
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.MESSAGE_COMPLETED) {
      if (parsed.role !== AgentHomeMessageRole.USER) {
        if (parsed.reasoningText.length > 0) {
          this.appendAssistantReasoning(parsed);
        }
        if (parsed.text.length > 0) {
          this.appendAssistantCompletion(parsed);
        }
        this.finalizeActiveAssistantDuration();
      }
      this.publishAgentTaskCompletedNotification();
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
      this.stopActiveTurnTimer();
      this.stopContextCompactionStatus();
      this.collapseReasoningForCurrentSession();
      this.resetActiveAssistantStream();
      this.finishBridgeReplyUiUpdate();
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.TOOL_STARTED) {
      this.startActiveTurnTimer();
      this.replyState = AgentHomeReplyState.TOOL_RUNNING;
      this.activeToolName = this.resolveToolStatusName(parsed);
      this.upsertToolCallFromBridge(parsed, AgentHomeToolCallStatus.RUNNING);
      this.publishAgentTaskToolNotification(this.activeToolName);
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_tool_started')) +
          ': ' + this.activeToolName
      );
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.TOOL_OUTPUT) {
      this.startActiveTurnTimer();
      this.replyState = AgentHomeReplyState.TOOL_RUNNING;
      this.activeToolName = this.resolveToolStatusName(parsed);
      this.upsertToolCallFromBridge(parsed, parsed.toolErrorText.length > 0 ? AgentHomeToolCallStatus.ERROR : AgentHomeToolCallStatus.RUNNING);
      this.publishAgentTaskToolNotification(this.activeToolName);
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_tool_output')) +
          ': ' + this.activeToolName
      );
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.TOOL_COMPLETED) {
      if (this.isReplyInProgress()) {
        this.replyState = AgentHomeReplyState.RESPONDING;
      }
      this.upsertToolCallFromBridge(parsed, this.normalizeToolCallStatus(parsed.toolStatus));
      this.activeToolName = '';
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_tool_completed'))
      );
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.PERMISSION_REQUESTED) {
      this.upsertPermissionRequestFromBridge(text, parsed);
      this.showTransientStatus(compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.QUESTION_REQUESTED) {
      this.upsertUserRequestFromBridge(text, parsed);
      this.showTransientStatus(compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.PLAN_REQUESTED) {
      this.upsertPlanFromBridge(parsed);
      this.showTransientStatus(compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.PLAN_UPDATED) {
      this.updatePlanFromBridge(parsed);
      this.showTransientStatus(compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.TODO_UPDATED) {
      this.showTransientStatus(compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.PREVIEW_UPDATED) {
      this.addPreviewFromBridge(parsed, compactText);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.WORKSPACE_CHANGES_UPDATED) {
      this.applyWorkspaceChangesFromBridge(text);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.WORKSPACE_FILES_UPDATED) {
      this.applyWorkspaceFilesFromBridge(text);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.FILE_DOWNLOAD_READY) {
      this.handleBridgeDownloadReady(parsed);
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.BRIDGE_CONNECTED) {
      return;
    }
    if (parsed.eventType === AgentBridgeEventType.ERROR) {
      const errorText = this.resolveBridgeErrorText(parsed, compactText);
      this.showTransientStatus(errorText);
      this.publishAgentTaskErrorNotification(errorText);
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
      this.stopActiveTurnTimer();
      this.stopContextCompactionStatus();
    }
  }

  private appendAssistantReasoning(parsed: AgentBridgeParsedMessage): void {
    const text = this.resolveReasoningText(parsed);
    if (text.length === 0) {
      return;
    }
    this.markAssistantResponseStarted();
    const streamKey = this.streamKeyForParsedMessage(parsed);
    const targetIndex = this.resolveAppendableAssistantMessageIndex(streamKey);
    const nextItems: Array<AgentHomeChatItem> = [];
    let updatedItem: AgentHomeChatItem | null = null;
    let appended = false;
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (
        index === targetIndex &&
          item.sessionId === this.activeSessionId &&
          item.role === AgentHomeMessageRole.ASSISTANT
      ) {
        updatedItem = new AgentHomeChatItem(
          item.id,
          item.sessionId,
          item.role,
          item.title,
          item.text,
          item.durationText,
          item.createdAt,
          this.mergeStreamText(item.reasoningText, text),
          this.resolveMessageNodeId(item, parsed),
          this.resolveAgentNameForParsedItem(parsed, item.agentName)
        );
        nextItems.push(updatedItem);
        appended = true;
      } else {
        nextItems.push(item);
      }
    }
    if (!appended) {
      updatedItem = new AgentHomeChatItem(
        'agent_home_message_' + String(Date.now()) + '_' + String(this.messageSequence + 1),
        this.activeSessionId,
        AgentHomeMessageRole.ASSISTANT,
        '',
        '',
        '',
        Date.now(),
        text,
        parsed.messageId,
        parsed.agentName
      );
      nextItems.push(updatedItem);
      this.messageSequence = this.messageSequence + 1;
    }
    this.messages = nextItems;
    if (updatedItem) {
      this.rememberActiveAssistantStream(streamKey, updatedItem.id);
      if (updatedItem.text.length > 0) {
        this.collapseReasoningMessage(updatedItem.id);
      } else {
        this.expandReasoningMessage(updatedItem.id);
      }
      this.persistMessage(updatedItem);
      this.scheduleConversationScrollForNewContent();
    }
  }

  private appendAssistantDelta(parsed: AgentBridgeParsedMessage): void {
    const text = parsed.text;
    if (text.length === 0) {
      return;
    }
    this.markAssistantResponseStarted();
    const streamKey = this.streamKeyForParsedMessage(parsed);
    const targetIndex = this.resolveAppendableAssistantMessageIndex(streamKey);
    const nextItems: Array<AgentHomeChatItem> = [];
    let updatedItem: AgentHomeChatItem | null = null;
    let appended = false;
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (
        index === targetIndex &&
          item.sessionId === this.activeSessionId &&
          item.role === AgentHomeMessageRole.ASSISTANT
      ) {
        updatedItem = new AgentHomeChatItem(
          item.id,
          item.sessionId,
          item.role,
          item.title,
          item.text + text,
          item.durationText,
          item.createdAt,
          item.reasoningText,
          this.resolveMessageNodeId(item, parsed),
          this.resolveAgentNameForParsedItem(parsed, item.agentName)
        );
        nextItems.push(updatedItem);
        appended = true;
      } else {
        nextItems.push(item);
      }
    }
    if (!appended) {
      updatedItem = new AgentHomeChatItem(
        'agent_home_message_' + String(Date.now()) + '_' + String(this.messageSequence + 1),
        this.activeSessionId,
        AgentHomeMessageRole.ASSISTANT,
        '',
        text,
        '',
        Date.now(),
        '',
        parsed.messageId,
        parsed.agentName
      );
      nextItems.push(updatedItem);
      this.messageSequence = this.messageSequence + 1;
    }
    this.messages = nextItems;
    if (updatedItem) {
      this.rememberActiveAssistantStream(streamKey, updatedItem.id);
      if (updatedItem.reasoningText.length > 0) {
        this.collapseReasoningMessage(updatedItem.id);
      }
      this.persistMessage(updatedItem);
      this.scheduleConversationScrollForNewContent();
    }
  }

  private appendAssistantCompletion(parsed: AgentBridgeParsedMessage): void {
    const text = parsed.text;
    if (text.length === 0) {
      return;
    }
    const streamKey = this.streamKeyForParsedMessage(parsed);
    const targetIndex = this.resolveAppendableAssistantMessageIndex(streamKey);
    if (targetIndex >= 0) {
      const current = this.messages[targetIndex];
      if (current.text === text || current.text.endsWith(text)) {
        return;
      }
      if (text.startsWith(current.text)) {
        this.replaceAssistantMessageText(targetIndex, text);
        return;
      }
    }
    this.appendAssistantDelta(parsed);
  }

  private isReasoningDelta(parsed: AgentBridgeParsedMessage): boolean {
    if (parsed.reasoningText.length > 0) {
      return true;
    }
    return parsed.contentKind === 'reasoning' || parsed.contentKind === 'thinking';
  }

  private resolveReasoningText(parsed: AgentBridgeParsedMessage): string {
    if (parsed.reasoningText.length > 0) {
      return parsed.reasoningText;
    }
    if (this.isReasoningDelta(parsed)) {
      return parsed.text;
    }
    return '';
  }

  private updateActiveSubagentFromParsed(parsed: AgentBridgeParsedMessage): void {
    const agentName = this.visibleAgentNameForProvider(this.currentSessionProviderId(), parsed.agentName);
    if (agentName.length > 0) {
      this.activeSubagentName = agentName;
    }
  }

  private resolveAgentNameForParsedItem(parsed: AgentBridgeParsedMessage, existingAgentName: string): string {
    const providerId = this.currentSessionProviderId();
    if (parsed.agentName.length > 0) {
      return this.visibleAgentNameForProvider(providerId, parsed.agentName);
    }
    return this.visibleAgentNameForProvider(providerId, existingAgentName);
  }

  private mergeStreamText(existingText: string, deltaText: string): string {
    if (deltaText.length === 0) {
      return existingText;
    }
    if (existingText.length === 0) {
      return deltaText;
    }
    const compactExisting = this.compactStreamComparableText(existingText);
    const compactDelta = this.compactStreamComparableText(deltaText);
    if (compactExisting.length > 0 && compactDelta.length > 0) {
      if (compactExisting === compactDelta || compactExisting.endsWith(compactDelta)) {
        return existingText;
      }
      if (compactDelta.startsWith(compactExisting)) {
        return deltaText;
      }
    }
    if (existingText === deltaText || existingText.endsWith(deltaText)) {
      return existingText;
    }
    if (deltaText.startsWith(existingText)) {
      return deltaText;
    }
    return existingText + deltaText;
  }

  private compactStreamComparableText(text: string): string {
    let compact = '';
    for (let index = 0; index < text.length; index++) {
      const current = text.charAt(index);
      if (current !== ' ' && current !== '\n' && current !== '\r' && current !== '\t') {
        compact = compact + current;
      }
    }
    return compact;
  }

  private replaceAssistantMessageText(messageIndex: number, text: string): void {
    if (messageIndex < 0 || messageIndex >= this.messages.length) {
      return;
    }
    const nextItems: Array<AgentHomeChatItem> = [];
    let updatedItem: AgentHomeChatItem | null = null;
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (index === messageIndex && item.sessionId === this.activeSessionId && item.role === AgentHomeMessageRole.ASSISTANT) {
        updatedItem = new AgentHomeChatItem(
          item.id,
          item.sessionId,
          item.role,
          item.title,
          text,
          item.durationText,
          item.createdAt,
          item.reasoningText,
          item.messageId,
          item.agentName
        );
        nextItems.push(updatedItem);
      } else {
        nextItems.push(item);
      }
    }
    this.messages = nextItems;
    if (updatedItem) {
      if (updatedItem.reasoningText.length > 0) {
        this.collapseReasoningMessage(updatedItem.id);
      }
      this.persistMessage(updatedItem);
      this.scheduleConversationScrollForNewContent();
    }
  }

  private markAssistantResponseStarted(): void {
    if (this.assistantResponseStartedAt <= 0) {
      this.assistantResponseStartedAt = Date.now();
    }
  }

  private finalizeActiveAssistantDuration(): void {
    const messageIndex = this.latestAssistantMessageIndexForCurrentSession();
    if (messageIndex < 0) {
      this.assistantResponseStartedAt = 0;
      return;
    }
    const now = Date.now();
    const message = this.messages[messageIndex];
    const responseStartedAt = this.assistantResponseStartedAt > 0 ? this.assistantResponseStartedAt : message.createdAt;
    const turnStartedAt = this.activeTurnStartedAt > 0 ? this.activeTurnStartedAt : responseStartedAt;
    const responseSeconds = Math.max(0, Math.floor((now - responseStartedAt) / 1000));
    const turnSeconds = Math.max(responseSeconds, Math.floor((now - turnStartedAt) / 1000));
    this.updateAssistantMessageDuration(messageIndex, this.buildAssistantDurationText(responseSeconds, turnSeconds));
    this.assistantResponseStartedAt = 0;
  }

  private latestAssistantMessageIndexForCurrentSession(): number {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (item.sessionId === this.activeSessionId && item.role === AgentHomeMessageRole.ASSISTANT) {
        return index;
      }
    }
    return -1;
  }

  private updateAssistantMessageDuration(messageIndex: number, durationText: string): void {
    if (durationText.length === 0 || messageIndex < 0 || messageIndex >= this.messages.length) {
      return;
    }
    const nextItems: Array<AgentHomeChatItem> = [];
    let updatedItem: AgentHomeChatItem | null = null;
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (index === messageIndex && item.sessionId === this.activeSessionId && item.role === AgentHomeMessageRole.ASSISTANT) {
        updatedItem = new AgentHomeChatItem(
          item.id,
          item.sessionId,
          item.role,
          item.title,
          item.text,
          durationText,
          item.createdAt,
          item.reasoningText,
          item.messageId,
          item.agentName
        );
        nextItems.push(updatedItem);
      } else {
        nextItems.push(item);
      }
    }
    this.messages = nextItems;
    if (updatedItem) {
      this.persistMessage(updatedItem);
      this.scheduleConversationScrollForNewContent();
    }
  }

  private buildAssistantDurationText(responseSeconds: number, turnSeconds: number): string {
    const hostContext = this.getUIContext().getHostContext();
    const responseLabel = resolveResourceString(hostContext, $r('app.string.agent_home_duration_response'));
    const turnLabel = resolveResourceString(hostContext, $r('app.string.agent_home_duration_turn'));
    return responseLabel + ' ' + this.formatElapsedSeconds(responseSeconds) +
      ' · ' + turnLabel + ' ' + this.formatElapsedSeconds(turnSeconds);
  }

  private latestAppendableAssistantMessageIndex(): number {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (item.sessionId !== this.activeSessionId) {
        continue;
      }
      if (item.role === AgentHomeMessageRole.STATUS || item.role === AgentHomeMessageRole.TOOL) {
        continue;
      }
      if (item.role === AgentHomeMessageRole.ASSISTANT && item.durationText.length === 0) {
        return index;
      }
      return -1;
    }
    return -1;
  }

  private resolveAppendableAssistantMessageIndex(streamKey: string): number {
    if (streamKey.length > 0) {
      if (this.activeAssistantStreamKey === streamKey && this.activeAssistantLocalMessageId.length > 0) {
        return this.activeAssistantMessageIndex();
      }
      return -1;
    }
    return this.latestAppendableAssistantMessageIndex();
  }

  private activeAssistantMessageIndex(): number {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (
        item.id === this.activeAssistantLocalMessageId &&
          item.sessionId === this.activeSessionId &&
          item.role === AgentHomeMessageRole.ASSISTANT
      ) {
        return index;
      }
    }
    return -1;
  }

  private rememberActiveAssistantStream(streamKey: string, localMessageId: string): void {
    if (streamKey.length === 0 || localMessageId.length === 0) {
      return;
    }
    this.activeAssistantStreamKey = streamKey;
    this.activeAssistantLocalMessageId = localMessageId;
  }

  private resetActiveAssistantStream(): void {
    this.activeAssistantStreamKey = '';
    this.activeAssistantLocalMessageId = '';
  }

  private streamKeyForParsedMessage(parsed: AgentBridgeParsedMessage): string {
    if (parsed.sessionId.length === 0 || parsed.messageId.length === 0) {
      return '';
    }
    return parsed.sessionId + ':message:' + parsed.messageId;
  }

  private resolveMessageNodeId(item: AgentHomeChatItem, parsed: AgentBridgeParsedMessage): string {
    if (parsed.messageId.length > 0) {
      return parsed.messageId;
    }
    return item.messageId;
  }

  private appendUserDelta(text: string, messageId: string): void {
    if (text.length === 0 || this.isDuplicateLatestUserDelta(text)) {
      return;
    }
    this.resetActiveAssistantStream();
    this.addMessage(AgentHomeMessageRole.USER, '', text, '', messageId);
  }

  private isDuplicateLatestUserDelta(text: string): boolean {
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (item.sessionId !== this.activeSessionId) {
        continue;
      }
      if (item.role === AgentHomeMessageRole.STATUS || item.role === AgentHomeMessageRole.TOOL) {
        continue;
      }
      return item.role === AgentHomeMessageRole.USER && (item.text === text || item.text.endsWith(text));
    }
    return false;
  }

  private updateActivityFromBridgeText(text: string): void {
    if (text.indexOf('"event":"opencode.event"') >= 0) {
      const agentName = this.visibleAgentNameForProvider(this.currentSessionProviderId(), this.extractJsonString(text, 'agent'));
      if (agentName.length > 0) {
        this.activeSubagentName = agentName;
      }
      if (text.indexOf('"type":"session.status"') >= 0) {
        if (text.indexOf('"type":"busy"') >= 0 || text.indexOf('"type":"retry"') >= 0) {
          this.startActiveTurnTimer();
          this.replyState = AgentHomeReplyState.RESPONDING;
        } else {
          this.publishAgentTaskCompletedNotification();
          this.replyState = AgentHomeReplyState.IDLE;
          this.activeToolName = '';
          this.activeSubagentName = '';
          this.stopActiveTurnTimer();
          this.stopContextCompactionStatus();
        }
      }
      if (text.indexOf('"type":"session.idle"') >= 0) {
        this.publishAgentTaskCompletedNotification();
        this.replyState = AgentHomeReplyState.IDLE;
        this.activeToolName = '';
        this.activeSubagentName = '';
        this.stopActiveTurnTimer();
        this.stopContextCompactionStatus();
      }
    }
    if (text.indexOf('"event":"message.completed"') >= 0) {
      this.publishAgentTaskCompletedNotification();
      this.replyState = AgentHomeReplyState.IDLE;
      this.activeToolName = '';
      this.activeSubagentName = '';
      this.stopActiveTurnTimer();
      this.stopContextCompactionStatus();
    }
  }

  private resolveToolStatusName(parsed: AgentBridgeParsedMessage): string {
    if (parsed.toolName.length > 0) {
      return parsed.toolName;
    }
    if (parsed.toolCallId.length > 0) {
      return parsed.toolCallId;
    }
    return 'tool';
  }

  private normalizeToolCallStatus(status: string): string {
    const value = status.toLowerCase();
    if (value === 'completed' || value === 'complete' || value === 'success' || value === 'succeeded' || value === 'done') {
      return AgentHomeToolCallStatus.COMPLETED;
    }
    if (value === 'error' || value === 'failed' || value === 'failure' || value === 'cancelled' || value === 'canceled' || value === 'timeout') {
      return AgentHomeToolCallStatus.ERROR;
    }
    return AgentHomeToolCallStatus.RUNNING;
  }

  private upsertOpenCodeToolCallFromRawEvent(source: string, baseParsed: AgentBridgeParsedMessage): void {
    if (source.indexOf('"type":"message.part.updated"') < 0) {
      return;
    }
    const partObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'part');
    if (partObject.length === 0) {
      return;
    }
    const partType = AgentBridgeIncomingParser.extractStringProperty(partObject, 'type');
    if (partType !== 'tool') {
      return;
    }
    const parsed = new AgentBridgeParsedMessage();
    parsed.eventType = AgentBridgeEventType.TOOL_STARTED;
    parsed.sessionId = baseParsed.sessionId;
    parsed.messageId = AgentBridgeIncomingParser.extractFirstStringProperty(partObject, 'messageID', 'messageId');
    parsed.partId = AgentBridgeIncomingParser.extractStringProperty(partObject, 'id');
    parsed.agentName = baseParsed.agentName;
    parsed.toolCallId = AgentBridgeIncomingParser.extractFirstStringProperty(partObject, 'callID', 'id');
    parsed.toolName = AgentBridgeIncomingParser.extractStringProperty(partObject, 'tool');
    parsed.rawJson = partObject;

    const stateObject = AgentBridgeIncomingParser.extractObjectProperty(partObject, 'state');
    const status = AgentBridgeIncomingParser.extractStringProperty(stateObject, 'status');
    parsed.toolStatus = status;
    parsed.toolInputText = this.extractOpenCodeToolInputText(stateObject);
    parsed.toolOutputText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(stateObject, 'output')
    );
    parsed.toolErrorText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractFirstStringProperty(stateObject, 'error', 'stderr')
    );
    parsed.text = parsed.toolOutputText.length > 0 ? parsed.toolOutputText : parsed.toolErrorText;

    if (status === 'completed' || status === 'error' || status === 'failed' || status === 'failure') {
      this.activeToolName = '';
      this.replyState = AgentHomeReplyState.RESPONDING;
      this.upsertToolCallFromBridge(parsed, this.normalizeToolCallStatus(status));
      return;
    }
    this.startActiveTurnTimer();
    this.replyState = AgentHomeReplyState.TOOL_RUNNING;
    this.activeToolName = this.resolveToolStatusName(parsed);
    this.upsertToolCallFromBridge(parsed, AgentHomeToolCallStatus.RUNNING);
    this.publishAgentTaskToolNotification(this.activeToolName);
  }

  private extractOpenCodeToolInputText(stateObject: string): string {
    if (stateObject.length === 0) {
      return '';
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(stateObject, 'input');
    if (inputObject.length > 0) {
      return inputObject;
    }
    return AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(stateObject, 'input')
    );
  }

  private upsertToolCallFromBridge(parsed: AgentBridgeParsedMessage, status: string): void {
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    if (sessionId.length === 0) {
      return;
    }
    const toolCallId = parsed.toolCallId.length > 0 ? parsed.toolCallId : this.resolveToolStatusName(parsed);
    const existingIndex = this.findToolCallIndex(sessionId, toolCallId);
    const now = Date.now();
    let item: AgentHomeToolCallItem;
    if (existingIndex >= 0) {
      const existing = this.toolCalls[existingIndex];
      item = new AgentHomeToolCallItem(
        existing.id,
        existing.sessionId,
        existing.providerId,
        parsed.messageId.length > 0 ? parsed.messageId : existing.messageId,
        existing.toolCallId,
        this.resolveMergedToolCallName(existing.name, parsed.toolName),
        status,
        parsed.toolInputText.length > 0 ? parsed.toolInputText : existing.inputText,
        parsed.toolOutputText.length > 0 ? parsed.toolOutputText : (parsed.text.length > 0 ? parsed.text : existing.outputText),
        parsed.toolErrorText.length > 0 ? parsed.toolErrorText : existing.errorText,
        parsed.rawJson.length > 0 ? parsed.rawJson : existing.rawJson,
        existing.startedAt,
        status === AgentHomeToolCallStatus.RUNNING ? existing.completedAt : now,
        now,
        this.resolveAgentNameForParsedItem(parsed, existing.agentName)
      );
      const nextItems: Array<AgentHomeToolCallItem> = [];
      for (let index = 0; index < this.toolCalls.length; index++) {
        nextItems.push(index === existingIndex ? item : this.toolCalls[index]);
      }
      this.toolCalls = nextItems;
    } else {
      this.toolCallSequence = this.toolCallSequence + 1;
      item = new AgentHomeToolCallItem(
        'agent_tool_call_' + String(now) + '_' + String(this.toolCallSequence),
        sessionId,
        this.providerIdForLocalSession(sessionId),
        parsed.messageId,
        toolCallId,
        parsed.toolName.length > 0 ? parsed.toolName : toolCallId,
        status,
        parsed.toolInputText,
        parsed.toolOutputText.length > 0 ? parsed.toolOutputText : parsed.text,
        parsed.toolErrorText,
        parsed.rawJson,
        now,
        status === AgentHomeToolCallStatus.RUNNING ? 0 : now,
        now,
        parsed.agentName
      );
      const nextItems: Array<AgentHomeToolCallItem> = [];
      for (let index = 0; index < this.toolCalls.length; index++) {
        nextItems.push(this.toolCalls[index]);
      }
      nextItems.push(item);
      this.toolCalls = nextItems;
    }
    this.persistence.saveToolCall(item).catch((error: Error): void => {
      logger.error(TAG, 'persist tool call failed: ' + this.errorToString(error));
    });
    this.syncPlanFromToolCall(item);
  }

  private syncPlansFromToolCalls(items: Array<AgentHomeToolCallItem>): void {
    for (let index = 0; index < items.length; index++) {
      this.syncPlanFromToolCall(items[index]);
    }
  }

  private syncPlanFromToolCall(item: AgentHomeToolCallItem): void {
    if (!this.isPlanToolCall(item)) {
      return;
    }
    const content = this.planContentFromToolCall(item);
    if (content.length === 0) {
      return;
    }
    const planId = this.planIdForPlanToolCall(item);
    let existingIndex = this.findPlanIndex(item.sessionId, planId);
    if (existingIndex < 0) {
      existingIndex = this.findLatestPlanIndexForSession(item.sessionId);
    }
    const now = item.updatedAt > 0 ? item.updatedAt : Date.now();
    let planItem: AgentHomePlanItem;
    if (existingIndex >= 0) {
      const existing = this.plans[existingIndex];
      planItem = new AgentHomePlanItem(
        existing.id,
        existing.sessionId,
        existing.workspaceId,
        existing.providerId,
        existing.planId.length > 0 ? existing.planId : planId,
        existing.title,
        content,
        this.planStatusFromContentAndToolStatus(content, item.status),
        item.rawJson.length > 0 ? item.rawJson : existing.rawJson,
        existing.createdAt,
        now,
        item.agentName.length > 0 ? item.agentName : existing.agentName
      );
      const nextItems: Array<AgentHomePlanItem> = [];
      for (let index = 0; index < this.plans.length; index++) {
        nextItems.push(index === existingIndex ? planItem : this.plans[index]);
      }
      this.plans = nextItems;
    } else {
      planItem = new AgentHomePlanItem(
        'agent_plan_tool_' + this.safeIdPart(item.sessionId),
        item.sessionId,
        this.workspaceIdForLocalSession(item.sessionId),
        item.providerId.length > 0 ? item.providerId : this.providerIdForLocalSession(item.sessionId),
        planId,
        '',
        content,
        this.planStatusFromContentAndToolStatus(content, item.status),
        item.rawJson.length > 0 ? item.rawJson : item.inputText,
        item.startedAt > 0 ? item.startedAt : now,
        now,
        item.agentName
      );
      const nextItems: Array<AgentHomePlanItem> = [];
      for (let index = 0; index < this.plans.length; index++) {
        nextItems.push(this.plans[index]);
      }
      nextItems.push(planItem);
      this.plans = nextItems;
    }
    this.syncActivePlanAfterBridgeUpdate(planItem);
    this.persistence.savePlan(planItem).catch((error: Error): void => {
      logger.error(TAG, 'persist plan from tool call failed: ' + this.errorToString(error));
    });
  }

  private openPlanFromToolCall(item: AgentHomeToolCallItem): void {
    const content = this.planContentFromToolCall(item);
    this.syncPlanFromToolCall(item);
    const planId = this.planIdForPlanToolCall(item);
    let planIndex = this.findPlanIndex(item.sessionId, planId);
    if (planIndex < 0 && content.length > 0) {
      planIndex = this.findLatestPlanIndexForSession(item.sessionId);
    }
    if (planIndex >= 0) {
      this.activePlanId = this.plans[planIndex].id;
      this.openSheet(AgentHomeSheetKey.PLAN_DETAIL);
      return;
    }
    this.activeToolCallId = item.id;
    this.openSheet(AgentHomeSheetKey.TOOL_DETAIL);
  }

  private shouldDisplayToolCallAsPlan(item: AgentHomeToolCallItem): boolean {
    if (!this.isPlanToolCall(item)) {
      return false;
    }
    if (this.planContentFromToolCall(item).length > 0) {
      return true;
    }
    return this.findPlanIndex(item.sessionId, this.planIdForPlanToolCall(item)) >= 0;
  }

  private isPlanToolCall(item: AgentHomeToolCallItem): boolean {
    return this.isPlanToolCallName(this.displayToolName(item).toLowerCase());
  }

  private isPlanToolCallName(normalizedName: string): boolean {
    return normalizedName === 'update_plan' ||
      normalizedName === 'create_plan' ||
      normalizedName === 'plan.update' ||
      normalizedName === 'plan.create' ||
      normalizedName.endsWith('.update_plan') ||
      normalizedName.endsWith('.create_plan') ||
      normalizedName.indexOf('update_plan') >= 0 ||
      normalizedName.indexOf('create_plan') >= 0;
  }

  private planContentFromToolCall(item: AgentHomeToolCallItem): string {
    let content = this.extractPlanContentFromSource(item.inputText);
    if (content.length > 0) {
      return content;
    }
    content = this.extractPlanContentFromSource(item.rawJson);
    if (content.length > 0) {
      return content;
    }
    content = this.extractPlanContentFromSource(item.outputText);
    if (content.length > 0) {
      return content;
    }
    return this.extractPlanContentFromSource(item.errorText);
  }

  private extractPlanContentFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    const cleanSource = AgentBridgeIncomingParser.cleanJsonText(source).trim();
    if (AgentBridgeIncomingParser.extractObjectArray(cleanSource, 'plan').length > 0) {
      return cleanSource;
    }
    const planText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(cleanSource, 'plan')
    ).trim();
    if (planText.startsWith('[') && AgentBridgeIncomingParser.extractObjectArray('{"plan":' + planText + '}', 'plan').length > 0) {
      return '{"plan":' + planText + '}';
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(cleanSource, 'input');
    if (AgentBridgeIncomingParser.extractObjectArray(inputObject, 'plan').length > 0) {
      return inputObject;
    }
    const inputText = AgentBridgeIncomingParser.cleanJsonText(
      AgentBridgeIncomingParser.extractStringProperty(cleanSource, 'input')
    ).trim();
    if (AgentBridgeIncomingParser.extractObjectArray(inputText, 'plan').length > 0) {
      return inputText;
    }
    return '';
  }

  private planStatusFromContentAndToolStatus(content: string, toolStatus: string): string {
    const steps = this.parsePlanSteps(content, 'status');
    if (steps.length === 0) {
      return this.planStatusFromToolStatus(toolStatus);
    }
    let completedCount = 0;
    let hasActiveStep = false;
    for (let index = 0; index < steps.length; index++) {
      const status = this.normalizePlanStepStatus(steps[index].status);
      if (status === AgentHomeInteractionStatus.ERROR || status === AgentHomeInteractionStatus.REJECTED) {
        return AgentHomeInteractionStatus.ERROR;
      }
      if (status === AgentHomeInteractionStatus.IMPLEMENTED) {
        completedCount = completedCount + 1;
      } else if (status === AgentHomeInteractionStatus.IMPLEMENTING) {
        hasActiveStep = true;
      }
    }
    if (completedCount === steps.length) {
      return AgentHomeInteractionStatus.IMPLEMENTED;
    }
    if (hasActiveStep || completedCount > 0) {
      return AgentHomeInteractionStatus.IMPLEMENTING;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private planStatusFromToolStatus(toolStatus: string): string {
    const normalized = this.normalizeToolCallStatus(toolStatus);
    if (normalized === AgentHomeToolCallStatus.ERROR) {
      return AgentHomeInteractionStatus.ERROR;
    }
    if (normalized === AgentHomeToolCallStatus.COMPLETED) {
      return AgentHomeInteractionStatus.IMPLEMENTED;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private planIdForPlanToolCall(item: AgentHomeToolCallItem): string {
    return 'tool_plan_' + this.safeIdPart(item.sessionId);
  }

  private markActiveSessionRunningToolsFailed(errorText: string): void {
    if (this.activeSessionId.length === 0) {
      return;
    }
    const now = Date.now();
    const nextItems: Array<AgentHomeToolCallItem> = [];
    const changedItems: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (item.sessionId === this.activeSessionId && item.status === AgentHomeToolCallStatus.RUNNING) {
        const updated = new AgentHomeToolCallItem(
          item.id,
          item.sessionId,
          item.providerId,
          item.messageId,
          item.toolCallId,
          item.name,
          AgentHomeToolCallStatus.ERROR,
          item.inputText,
          item.outputText,
          this.appendToolErrorText(item.errorText, errorText),
          item.rawJson,
          item.startedAt,
          now,
          now,
          item.agentName
        );
        nextItems.push(updated);
        changedItems.push(updated);
      } else {
        nextItems.push(item);
      }
    }
    if (changedItems.length === 0) {
      return;
    }
    this.toolCalls = nextItems;
    for (let index = 0; index < changedItems.length; index++) {
      this.persistence.saveToolCall(changedItems[index]).catch((error: Error): void => {
        logger.error(TAG, 'persist stalled tool call failed: ' + this.errorToString(error));
      });
    }
  }

  private resolveMergedToolCallName(existingName: string, incomingName: string): string {
    if (incomingName.length === 0) {
      return existingName;
    }
    if (this.isGenericToolCallName(incomingName) && existingName.length > 0) {
      return existingName;
    }
    return incomingName;
  }

  private isGenericToolCallName(name: string): boolean {
    return name === 'tool' ||
      name === 'codex.tool' ||
      name === 'codex.function_call' ||
      name === 'claude.tool' ||
      name === 'claude.function_call';
  }

  private appendToolErrorText(existingText: string, errorText: string): string {
    if (existingText.length === 0) {
      return errorText;
    }
    if (errorText.length === 0 || existingText.indexOf(errorText) >= 0) {
      return existingText;
    }
    return existingText + '\n' + errorText;
  }

  private findToolCallIndex(sessionId: string, toolCallId: string): number {
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (item.sessionId === sessionId && item.toolCallId === toolCallId) {
        return index;
      }
    }
    return -1;
  }

  private providerIdForLocalSession(sessionId: string): string {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === sessionId) {
        return item.providerId;
      }
    }
    return this.currentSessionProviderId();
  }

  private workspaceIdForLocalSession(sessionId: string): string {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === sessionId) {
        return item.workspaceId;
      }
    }
    return this.activeWorkspaceId;
  }

  private upsertPermissionRequestFromBridge(source: string, parsed: AgentBridgeParsedMessage): void {
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    if (sessionId.length === 0) {
      return;
    }
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const payloadRequestId = this.extractRawPayloadField(payloadObject, source, 'requestId');
    const payloadPermissionId = this.extractRawPayloadField(payloadObject, source, 'permissionId');
    let requestId = payloadRequestId.length > 0 ? payloadRequestId : parsed.requestId;
    if (requestId.length === 0) {
      requestId = payloadPermissionId;
    }
    if (requestId.length === 0) {
      requestId = 'permission_' + String(Date.now());
    }
    const permissionId = payloadPermissionId.length > 0 ? payloadPermissionId : requestId;
    const requestStatus = this.extractRawPayloadField(payloadObject, source, 'status');
    const requestAnswer = this.extractRawPayloadField(payloadObject, source, 'answer');
    const requestOptionId = this.extractRawPayloadField(payloadObject, source, 'optionId');
    const requestReply = this.extractRawPayloadField(payloadObject, source, 'reply');
    const nextStatus = requestStatus.length > 0 ? requestStatus : parsed.requestStatus;
    const nextOptionId = requestOptionId.length > 0 ? requestOptionId : requestReply;
    const existingIndex = this.findPermissionUserRequestIndex(sessionId, requestId, permissionId);
    const now = Date.now();
    const title = this.permissionRequestTitleFromSource(source);
    const prompt = this.permissionRequestPromptFromSource(source);
    let item: AgentHomeUserRequestItem;
    if (existingIndex >= 0) {
      const existing = this.userRequests[existingIndex];
      item = new AgentHomeUserRequestItem(
        existing.id,
        existing.sessionId,
        existing.providerId,
        existing.requestId,
        AgentHomeUserRequestKind.PERMISSION,
        title.length > 0 ? title : existing.title,
        prompt.length > 0 ? prompt : existing.prompt,
        existing.optionsJson,
        true,
        nextStatus.length > 0 ? nextStatus : existing.status,
        requestAnswer.length > 0 ? requestAnswer : existing.answer,
        nextOptionId.length > 0 ? nextOptionId : existing.selectedOptionId,
        source.length > 0 ? source : existing.rawJson,
        existing.createdAt,
        now,
        this.resolveAgentNameForParsedItem(parsed, existing.agentName)
      );
      const nextItems: Array<AgentHomeUserRequestItem> = [];
      for (let index = 0; index < this.userRequests.length; index++) {
        nextItems.push(index === existingIndex ? item : this.userRequests[index]);
      }
      this.userRequests = nextItems;
    } else {
      item = new AgentHomeUserRequestItem(
        'agent_permission_' + String(now),
        sessionId,
        this.providerIdForLocalSession(sessionId),
        requestId,
        AgentHomeUserRequestKind.PERMISSION,
        title,
        prompt,
        '',
        true,
        nextStatus.length > 0 ? nextStatus : AgentHomeInteractionStatus.PENDING,
        requestAnswer,
        nextOptionId,
        source,
        now,
        now,
        parsed.agentName
      );
      const nextItems: Array<AgentHomeUserRequestItem> = [];
      for (let index = 0; index < this.userRequests.length; index++) {
        nextItems.push(this.userRequests[index]);
      }
      nextItems.push(item);
      this.userRequests = nextItems;
    }
    this.persistence.saveUserRequest(item).catch((error: Error): void => {
      logger.error(TAG, 'persist permission request failed: ' + this.errorToString(error));
    });
    this.syncPermissionRequestFlowLight();
    this.publishAgentUserRequestNotification(item);
  }

  private upsertUserRequestFromBridge(source: string, parsed: AgentBridgeParsedMessage): void {
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    if (sessionId.length === 0) {
      return;
    }
    const requestId = parsed.requestId.length > 0 ? parsed.requestId : 'request_' + String(Date.now());
    const existingIndex = this.findUserRequestIndex(sessionId, requestId);
    const now = Date.now();
    const optionsJson = AgentBridgeIncomingParser.extractArrayProperty(source, 'options');
    let item: AgentHomeUserRequestItem;
    if (existingIndex >= 0) {
      const existing = this.userRequests[existingIndex];
      item = new AgentHomeUserRequestItem(
        existing.id,
        existing.sessionId,
        existing.providerId,
        existing.requestId,
        parsed.requestKind.length > 0 ? parsed.requestKind : existing.kind,
        parsed.requestTitle.length > 0 ? parsed.requestTitle : existing.title,
        parsed.requestPrompt.length > 0 ? parsed.requestPrompt : existing.prompt,
        optionsJson.length > 0 ? optionsJson : existing.optionsJson,
        true,
        parsed.requestStatus.length > 0 ? parsed.requestStatus : existing.status,
        parsed.requestAnswer.length > 0 ? parsed.requestAnswer : existing.answer,
        parsed.requestOptionId.length > 0 ? parsed.requestOptionId : existing.selectedOptionId,
        parsed.rawJson.length > 0 ? parsed.rawJson : existing.rawJson,
        existing.createdAt,
        now,
        this.resolveAgentNameForParsedItem(parsed, existing.agentName)
      );
      const nextItems: Array<AgentHomeUserRequestItem> = [];
      for (let index = 0; index < this.userRequests.length; index++) {
        nextItems.push(index === existingIndex ? item : this.userRequests[index]);
      }
      this.userRequests = nextItems;
    } else {
      item = new AgentHomeUserRequestItem(
        'agent_request_' + String(now),
        sessionId,
        this.providerIdForLocalSession(sessionId),
        requestId,
        parsed.requestKind.length > 0 ? parsed.requestKind : AgentHomeUserRequestKind.REQUEST,
        parsed.requestTitle,
        parsed.requestPrompt,
        optionsJson,
        true,
        parsed.requestStatus.length > 0 ? parsed.requestStatus : AgentHomeInteractionStatus.PENDING,
        parsed.requestAnswer,
        parsed.requestOptionId,
        parsed.rawJson,
        now,
        now,
        parsed.agentName
      );
      const nextItems: Array<AgentHomeUserRequestItem> = [];
      for (let index = 0; index < this.userRequests.length; index++) {
        nextItems.push(this.userRequests[index]);
      }
      nextItems.push(item);
      this.userRequests = nextItems;
    }
    this.persistence.saveUserRequest(item).catch((error: Error): void => {
      logger.error(TAG, 'persist user request failed: ' + this.errorToString(error));
    });
    this.publishAgentUserRequestNotification(item);
  }

  private permissionRequestTitleFromSource(source: string): string {
    const hostContext = this.getUIContext().getHostContext();
    const baseTitle = resolveResourceString(hostContext, $r('app.string.agent_home_permission_title'));
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    let permissionObject = AgentBridgeIncomingParser.extractObjectProperty(payloadObject, 'permission');
    if (permissionObject.length === 0) {
      permissionObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'permission');
    }
    const targetSource = permissionObject.length > 0 ? permissionObject : source;
    const permissionName = this.cleanPermissionField(
      AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'permission', 'type')
    );
    if (permissionName.length > 0) {
      return baseTitle + ': ' + permissionName;
    }
    const metadataObject = AgentBridgeIncomingParser.extractObjectProperty(targetSource, 'metadata');
    const toolName = this.permissionToolValue(targetSource, metadataObject);
    if (toolName.length > 0) {
      return baseTitle + ': ' + toolName;
    }
    return baseTitle;
  }

  private permissionRequestPromptFromSource(source: string): string {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    let permissionObject = AgentBridgeIncomingParser.extractObjectProperty(payloadObject, 'permission');
    if (permissionObject.length === 0) {
      permissionObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'permission');
    }
    const targetSource = permissionObject.length > 0 ? permissionObject : source;
    const permissionName = this.cleanPermissionField(
      AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'permission', 'type')
    );
    const metadataObject = AgentBridgeIncomingParser.extractObjectProperty(targetSource, 'metadata');
    const pathValue = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'filePath')),
      this.firstNonEmptyText(
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'path')),
        this.firstNonEmptyText(
          this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'directory')),
          this.firstNonEmptyText(
            this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'filePath')),
            this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'path'))
          )
        )
      )
    );
    const patternsJson = AgentBridgeIncomingParser.extractArrayProperty(targetSource, 'patterns');
    const actionValue = this.permissionActionValue(targetSource, metadataObject);
    const toolValue = this.permissionToolValue(targetSource, metadataObject);
    const commandValue = this.permissionCommandValue(targetSource, metadataObject);
    let prompt = '';
    if (permissionName.length > 0) {
      prompt = permissionName;
    }
    if (actionValue.length > 0) {
      prompt = this.appendPromptLine(prompt, actionValue);
    }
    if (toolValue.length > 0 && prompt.indexOf(toolValue) < 0) {
      prompt = this.appendPromptLine(prompt, toolValue);
    }
    if (commandValue.length > 0) {
      prompt = this.appendPromptLine(prompt, commandValue);
    }
    if (pathValue.length > 0) {
      prompt = this.appendPromptLine(prompt, pathValue);
    }
    if (patternsJson.length > 0) {
      prompt = this.appendPromptLine(prompt, patternsJson);
    }
    if (prompt.length === 0) {
      return this.compactText(source);
    }
    return prompt;
  }

  private cleanPermissionField(value: string): string {
    return AgentBridgeIncomingParser.cleanJsonText(value).trim();
  }

  private firstNonEmptyText(firstValue: string, secondValue: string): string {
    if (firstValue.length > 0) {
      return firstValue;
    }
    return secondValue;
  }

  private appendPromptLine(source: string, value: string): string {
    if (source.length === 0) {
      return value;
    }
    return source + '\n' + value;
  }

  private permissionActionValue(targetSource: string, metadataObject: string): string {
    const metadataAction = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'action')),
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'operation'))
    );
    if (metadataAction.length > 0) {
      return metadataAction;
    }
    return this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'action')),
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'operation'))
    );
  }

  private permissionToolValue(targetSource: string, metadataObject: string): string {
    const metadataTool = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'toolName')),
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'tool'))
    );
    if (metadataTool.length > 0) {
      return metadataTool;
    }
    return this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'toolName')),
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'tool'))
    );
  }

  private permissionCommandValue(targetSource: string, metadataObject: string): string {
    let value = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'command')),
      this.firstNonEmptyText(
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'cmd')),
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'bash'))
      )
    );
    if (value.length > 0) {
      return value;
    }
    value = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'command')),
      this.firstNonEmptyText(
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'cmd')),
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'bash'))
      )
    );
    if (value.length > 0) {
      return value;
    }
    value = AgentBridgeIncomingParser.extractArrayProperty(metadataObject, 'argv');
    if (value.length > 0) {
      return value;
    }
    value = AgentBridgeIncomingParser.extractArrayProperty(metadataObject, 'args');
    if (value.length > 0) {
      return value;
    }
    value = AgentBridgeIncomingParser.extractArrayProperty(targetSource, 'argv');
    if (value.length > 0) {
      return value;
    }
    return AgentBridgeIncomingParser.extractArrayProperty(targetSource, 'args');
  }

  private upsertPlanFromBridge(parsed: AgentBridgeParsedMessage): void {
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    if (sessionId.length === 0) {
      return;
    }
    const fallbackPlanId = 'plan_' + String(Date.now());
    const planId = parsed.planId.length > 0 ? parsed.planId : fallbackPlanId;
    const existingIndex = parsed.planId.length > 0 ? this.findPlanIndex(sessionId, parsed.planId) : this.findLatestPlanIndexForSession(sessionId);
    const now = Date.now();
    let item: AgentHomePlanItem;
    if (existingIndex >= 0) {
      const existing = this.plans[existingIndex];
      item = new AgentHomePlanItem(
        existing.id,
        existing.sessionId,
        existing.workspaceId,
        existing.providerId,
        parsed.planId.length > 0 ? parsed.planId : existing.planId,
        parsed.planTitle.length > 0 ? parsed.planTitle : existing.title,
        this.resolvePlanContentFromParsed(parsed, existing.content),
        parsed.planStatus.length > 0 ? parsed.planStatus : existing.status,
        parsed.rawJson.length > 0 ? parsed.rawJson : existing.rawJson,
        existing.createdAt,
        now,
        this.resolveAgentNameForParsedItem(parsed, existing.agentName)
      );
      const nextItems: Array<AgentHomePlanItem> = [];
      for (let index = 0; index < this.plans.length; index++) {
        nextItems.push(index === existingIndex ? item : this.plans[index]);
      }
      this.plans = nextItems;
    } else {
      item = new AgentHomePlanItem(
        'agent_plan_' + String(now),
        sessionId,
        this.workspaceIdForLocalSession(sessionId),
        this.providerIdForLocalSession(sessionId),
        planId,
        parsed.planTitle,
        parsed.planContent,
        parsed.planStatus.length > 0 ? parsed.planStatus : AgentHomeInteractionStatus.PENDING,
        parsed.rawJson,
        now,
        now,
        parsed.agentName
      );
      const nextItems: Array<AgentHomePlanItem> = [];
      for (let index = 0; index < this.plans.length; index++) {
        nextItems.push(this.plans[index]);
      }
      nextItems.push(item);
      this.plans = nextItems;
    }
    this.syncActivePlanAfterBridgeUpdate(item);
    this.persistence.savePlan(item).catch((error: Error): void => {
      logger.error(TAG, 'persist plan failed: ' + this.errorToString(error));
    });
    this.publishAgentPlanRequestNotification(item);
  }

  private updatePlanFromBridge(parsed: AgentBridgeParsedMessage): void {
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    const planId = parsed.planId;
    const existingIndex = planId.length > 0 ? this.findPlanIndex(sessionId, planId) : this.findLatestPlanIndexForSession(sessionId);
    if (existingIndex < 0) {
      this.upsertPlanFromBridge(parsed);
      return;
    }
    const existing = this.plans[existingIndex];
    const now = Date.now();
    const item = new AgentHomePlanItem(
      existing.id,
      existing.sessionId,
      existing.workspaceId,
      existing.providerId,
      planId.length > 0 ? planId : existing.planId,
      parsed.planTitle.length > 0 ? parsed.planTitle : existing.title,
      this.resolvePlanContentFromParsed(parsed, existing.content),
      parsed.planStatus.length > 0 ? parsed.planStatus : existing.status,
      parsed.rawJson.length > 0 ? parsed.rawJson : existing.rawJson,
      existing.createdAt,
      now,
      this.resolveAgentNameForParsedItem(parsed, existing.agentName)
    );
    const nextItems: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      nextItems.push(index === existingIndex ? item : this.plans[index]);
    }
    this.plans = nextItems;
    this.syncActivePlanAfterBridgeUpdate(item);
    this.persistence.savePlan(item).catch((error: Error): void => {
      logger.error(TAG, 'persist plan update failed: ' + this.errorToString(error));
    });
    this.publishAgentPlanRequestNotification(item);
  }

  private resolvePlanContentFromParsed(parsed: AgentBridgeParsedMessage, fallback: string): string {
    if (parsed.planContent.length > 0) {
      return parsed.planContent;
    }
    if (parsed.planMessage.length > 0) {
      return parsed.planMessage;
    }
    return fallback;
  }

  private syncActivePlanAfterBridgeUpdate(item: AgentHomePlanItem): void {
    if (item.sessionId !== this.activeSessionId) {
      return;
    }
    if (this.activePlanId.length === 0 || this.activePlanId === item.id || this.isComposerPlanPanelExpanded) {
      this.activePlanId = item.id;
    }
  }

  private findUserRequestIndex(sessionId: string, requestId: string): number {
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (item.sessionId === sessionId && item.requestId === requestId) {
        return index;
      }
    }
    return -1;
  }

  private findPermissionUserRequestIndex(sessionId: string, requestId: string, permissionId: string): number {
    if (requestId.length > 0) {
      const directIndex = this.findUserRequestIndex(sessionId, requestId);
      if (directIndex >= 0) {
        return directIndex;
      }
    }
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (item.sessionId !== sessionId || !this.isPermissionRequest(item)) {
        continue;
      }
      if (permissionId.length > 0 && item.requestId === permissionId) {
        return index;
      }
      const itemPermissionId = this.permissionIdForRequest(item);
      if (requestId.length > 0 && itemPermissionId === requestId) {
        return index;
      }
      if (permissionId.length > 0 && itemPermissionId === permissionId) {
        return index;
      }
    }
    return -1;
  }

  private findPlanIndex(sessionId: string, planId: string): number {
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (item.sessionId === sessionId && item.planId === planId) {
        return index;
      }
    }
    return -1;
  }

  private findLatestPlanIndexForSession(sessionId: string): number {
    let latestIndex = -1;
    let latestUpdatedAt = -1;
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (item.sessionId === sessionId && item.updatedAt >= latestUpdatedAt) {
        latestIndex = index;
        latestUpdatedAt = item.updatedAt;
      }
    }
    return latestIndex;
  }

  private localSessionIdForBridgeSession(bridgeSessionId: string): string {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.bridgeSessionId === bridgeSessionId || item.id === bridgeSessionId) {
        return item.id;
      }
    }
    return this.activeSessionId;
  }

  private bridgeSessionIdForLocalSession(sessionId: string): string {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === sessionId) {
        return item.bridgeSessionId;
      }
    }
    return '';
  }

  private sessionIdsForLocalSession(sessionId: string): Array<string> {
    const sessionIds: Array<string> = [];
    this.addUniqueSessionId(sessionIds, sessionId);
    const bridgeSessionId = this.bridgeSessionIdForLocalSession(sessionId);
    this.addUniqueSessionId(sessionIds, bridgeSessionId);
    if (bridgeSessionId.length > 0) {
      this.addUniqueSessionId(sessionIds, this.localSessionIdForBridgeSession(bridgeSessionId));
    }
    return sessionIds;
  }

  private addUniqueSessionId(sessionIds: Array<string>, sessionId: string): void {
    if (sessionId.length === 0 || this.isSessionIdInList(sessionId, sessionIds)) {
      return;
    }
    sessionIds.push(sessionId);
  }

  private sessionIdListForLog(sessionIds: Array<string>): string {
    if (sessionIds.length === 0) {
      return '';
    }
    let text = sessionIds[0];
    for (let index = 1; index < sessionIds.length; index++) {
      text += ',' + sessionIds[index];
    }
    return text;
  }

  private resolveMessageImportTargetSessionId(source: string): string {
    if (this.pendingHistoryImportSessionId.length > 0) {
      const pending = this.pendingHistoryImportSessionId;
      this.pendingHistoryImportSessionId = '';
      return pending;
    }
    const bridgeSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    if (bridgeSessionId.length > 0) {
      return this.localSessionIdForBridgeSession(bridgeSessionId);
    }
    return '';
  }

  private addPreviewFromBridge(parsed: AgentBridgeParsedMessage, fallbackText: string): void {
    const path = parsed.previewPath.length > 0 ? parsed.previewPath : this.previewPath;
    const mediaType = parsed.previewMediaType.length > 0 ? parsed.previewMediaType : 'text/plain';
    const rawContent = parsed.previewPath.length > 0 ? parsed.previewContent : fallbackText;
    const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
    this.previewSequence = this.previewSequence + 1;
    const previewId = 'agent_home_preview_' + String(Date.now()) + '_' + String(this.previewSequence);
    const normalizedContent = this.normalizedPreviewContentForKind(path, mediaType, rawContent);
    if (this.workspacePreviewContentKind(path, mediaType) === NGFRichContentKind.IMAGE && normalizedContent.length === 0) {
      if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentBridgeSessionId().length > 0) {
        this.pendingWorkspacePreviewImagePath = this.normalizeWorkspaceFilePath(path);
        this.client.requestWorkspaceFileDownload(this.currentBridgeSessionId(), this.activeWorkspaceId, path);
      }
      return;
    }
    const content = this.materializedPreviewContentForKind(previewId, path, mediaType, normalizedContent);
    if (this.workspacePreviewContentKind(path, mediaType) === NGFRichContentKind.IMAGE && content.length === 0) {
      if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentBridgeSessionId().length > 0) {
        this.pendingWorkspacePreviewImagePath = this.normalizeWorkspaceFilePath(path);
        this.client.requestWorkspaceFileDownload(this.currentBridgeSessionId(), this.activeWorkspaceId, path);
      }
      return;
    }
    if (this.workspacePreviewContentKind(path, mediaType) === NGFRichContentKind.IMAGE && this.isRasterPreviewDataUrl(normalizedContent)) {
      const imageBuffer = this.rasterPreviewBufferFromDataUrl(normalizedContent);
      if (imageBuffer !== null) {
        this.updateActiveWorkspacePreviewPixelMap(imageBuffer, path).catch((error: Error): void => {
          logger.warn(TAG, 'decode inline preview image failed: ' + this.errorToString(error));
        });
      }
    }

    const preview = new AgentHomePreviewItem(
      previewId,
      sessionId,
      path,
      mediaType,
      content,
      Date.now()
    );
    this.pushWorkspacePreviewItem(preview);
    if (this.normalizeWorkspaceFilePath(path) === this.normalizeWorkspaceFilePath(this.activeWorkspacePreviewPath)) {
      this.activeWorkspacePreviewErrorText = '';
    }

    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_preview_updated')) + ': ' + path
    );
  }

  private pushWorkspacePreviewItem(preview: AgentHomePreviewItem): void {
    const nextItems: Array<AgentHomePreviewItem> = [];
    nextItems.push(preview);
    for (let index = 0; index < this.previews.length && index < 19; index++) {
      const item = this.previews[index];
      if (item.sessionId === preview.sessionId && this.normalizeWorkspaceFilePath(item.path) === this.normalizeWorkspaceFilePath(preview.path)) {
        continue;
      }
      nextItems.push(item);
    }
    this.previews = nextItems;
    this.persistPreview(preview);
  }

  private applyWorkspacePreviewErrorIfNeeded(errorText: string): void {
    if (!this.isWorkspaceContentPreviewSheetOpen || this.activeWorkspacePreviewPath.length === 0) {
      return;
    }
    this.activeWorkspacePreviewErrorText = errorText;
  }

  private handleBridgeDownloadReady(parsed: AgentBridgeParsedMessage): void {
    if (parsed.downloadPath.length === 0 || this.isBridgeDownloadPathHandled(parsed.downloadPath)) {
      return;
    }
    this.markBridgeDownloadPathHandled(parsed.downloadPath);
    if (this.shouldHandleAsMessageAttachmentImageDownload(parsed)) {
      this.saveMessageAttachmentImageDownload(parsed).catch((error: Error): void => {
        logger.warn(TAG, 'save message attachment image failed: ' + this.errorToString(error));
        this.removePendingMessageAttachmentImagePath(parsed.downloadFilePath);
      });
    } else if (this.shouldHandleAsWorkspacePreviewImageDownload(parsed)) {
      this.saveWorkspacePreviewImageDownload(parsed).catch((error: Error): void => {
        logger.error(TAG, 'save preview image download failed: ' + this.errorToString(error));
        this.pendingWorkspacePreviewImagePath = '';
        this.applyWorkspacePreviewErrorIfNeeded(this.errorToString(error));
        this.showTransientStatus(this.errorToString(error));
      });
    } else {
      this.saveBridgeDownload(parsed).catch((error: Error): void => {
        logger.error(TAG, 'save bridge download failed: ' + this.errorToString(error));
        this.showTransientStatus(this.errorToString(error));
      });
    }
  }

  private isBridgeDownloadPathHandled(downloadPath: string): boolean {
    for (let index = 0; index < this.handledBridgeDownloadPaths.length; index++) {
      if (this.handledBridgeDownloadPaths[index] === downloadPath) {
        return true;
      }
    }
    return false;
  }

  private markBridgeDownloadPathHandled(downloadPath: string): void {
    const nextItems: Array<string> = [];
    nextItems.push(downloadPath);
    for (let index = 0; index < this.handledBridgeDownloadPaths.length && index < 39; index++) {
      nextItems.push(this.handledBridgeDownloadPaths[index]);
    }
    this.handledBridgeDownloadPaths = nextItems;
  }

  private resolveBridgeErrorText(parsed: AgentBridgeParsedMessage, fallbackText: string): string {
    if (parsed.errorMessage.length > 0) {
      return parsed.errorMessage;
    }
    return fallbackText;
  }

  private isCurrentBridgeEvent(parsed: AgentBridgeParsedMessage): boolean {
    if (parsed.sessionId.length === 0) {
      return true;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length > 0) {
      return parsed.sessionId === bridgeSessionId;
    }
    return this.pendingBridgeCreateLocalSessionId.length > 0 || this.pendingFirstMessage.length > 0;
  }

  private shouldCountAsActiveTurnActivity(parsed: AgentBridgeParsedMessage): boolean {
    if (parsed.eventType.length === 0) {
      return false;
    }
    if (parsed.sessionId.length === 0) {
      return false;
    }
    return true;
  }

  private shouldIgnoreStoppedReplyEvent(parsed: AgentBridgeParsedMessage): boolean {
    return this.stoppedBridgeSessionId.length > 0 &&
      parsed.sessionId === this.stoppedBridgeSessionId &&
      parsed.eventType.length > 0;
  }

  private handleBridgeSession(sessionId: string): void {
    if (sessionId.length === 0) {
      return;
    }
    const existingSession = this.findLocalSessionByBridgeSession(sessionId);
    if (existingSession) {
      this.sendPendingFirstMessageIfNeeded(sessionId);
      return;
    }
    const targetSessionId = this.pendingBridgeCreateLocalSessionId.length > 0 ? this.pendingBridgeCreateLocalSessionId : this.activeSessionId;
    const targetSession = this.findLocalSessionById(targetSessionId);
    if (!targetSession || (targetSession.bridgeSessionId.length > 0 && targetSession.bridgeSessionId !== sessionId)) {
      return;
    }
    const providerId = this.pendingBridgeCreateProviderId.length > 0 ? this.pendingBridgeCreateProviderId : this.selectedProviderId;
    const nextItems: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      const isTargetSession = item.id === targetSessionId;
      const bridgeSessionId = isTargetSession ? sessionId : item.bridgeSessionId;
      const updatedSession = new AgentHomeSessionItem(
        item.id,
        item.workspaceId,
        item.title,
        item.branchName,
        isTargetSession ? providerId : item.providerId,
        isTargetSession ? this.selectedModelId : item.modelId,
        isTargetSession ? this.selectedSpeedMode : item.speedMode,
        isTargetSession ? this.selectedReasoningMode : item.reasoningMode,
        bridgeSessionId,
        item.updatedAt
      );
      nextItems.push(updatedSession);
      if (isTargetSession) {
        this.persistSession(updatedSession);
      }
    }
    this.sessions = nextItems;
    if (targetSessionId === this.pendingBridgeCreateLocalSessionId) {
      this.pendingBridgeCreateLocalSessionId = '';
      this.pendingBridgeCreateProviderId = '';
    }
    this.sendPendingFirstMessageIfNeeded(sessionId);
  }

  private sendPendingFirstMessageIfNeeded(sessionId: string): void {
    if (this.pendingFirstMessage.length > 0 && this.currentBridgeSessionId() === sessionId) {
      const pending = this.pendingFirstMessage;
      const contextItems = this.pendingFirstContextItems;
      this.pendingFirstMessage = '';
      this.pendingFirstContextItems = [];
      this.addMessage(AgentHomeMessageRole.USER, '', pending, '');
      this.touchActiveSession();
      this.markReplySubmitted();
      if (this.isOutgoingContextCompactionRequest(pending)) {
        this.startContextCompactionStatus();
      }
      this.client.sendMessage(
        sessionId,
        pending,
        this.selectedModelId,
        this.selectedSpeedMode,
        this.selectedReasoningMode,
        this.currentAgentRunMode(),
        this.currentSelectedInteractionModes(),
        this.currentOpenCodeAgent(),
        contextItems
      );
    }
  }

  private createLocalSession(closeAfterCreate: boolean = true): void {
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.ensureNewSessionProvider();
    const providerId = this.activeNewSessionProviderId();
    const modelId = this.activeNewSessionModelId();
    const speedMode = this.activeNewSessionSpeedMode();
    const reasoningMode = this.activeNewSessionReasoningMode();
    this.selectedProviderId = providerId;
    this.selectedModelId = modelId;
    this.selectedSpeedMode = speedMode;
    this.selectedReasoningMode = reasoningMode;
    this.activeSessionId = '';
    this.pendingFirstMessage = '';
    this.pendingFirstContextItems = [];
    this.pendingBridgeCreateLocalSessionId = '';
    this.pendingBridgeCreateProviderId = '';
    this.persistProfile();
    if (closeAfterCreate) {
      this.closeSheet();
    }
    this.mainPageIndex = AgentHomeMainPageIndex.CHAT;
  }

  private createWorkspaceDraft(): void {
    this.prepareNewSessionRuntimeFromActiveSelection();
    this.showMainPage(AgentHomeMainPageIndex.CHAT);
    this.openSheet(AgentHomeSheetKey.SESSIONS);
  }

  private openWorkspaceActions(workspaceId: string): void {
    const workspace = this.findWorkspaceById(workspaceId);
    if (!workspace) {
      return;
    }
    this.activeWorkspaceActionId = workspaceId;
    this.renameWorkspaceDraft = workspace.title;
    this.openSheet(AgentHomeSheetKey.WORKSPACE_ACTIONS);
  }

  private openSessionActions(sessionId: string): void {
    const session = this.findLocalSessionById(sessionId);
    if (!session) {
      return;
    }
    this.activeSessionActionId = sessionId;
    this.renameSessionDraft = session.title;
    this.openSheet(AgentHomeSheetKey.SESSION_ACTIONS);
  }

  private handleContextAction(actionKey: string): void {
    if (actionKey === AgentHomeActionKey.RENAME_WORKSPACE) {
      const workspace = this.workspaceForActiveAction();
      if (!workspace) {
        return;
      }
      this.renameWorkspaceDraft = workspace.title;
      this.openSheet(AgentHomeSheetKey.RENAME_WORKSPACE);
      return;
    }
    if (actionKey === AgentHomeActionKey.DELETE_WORKSPACE) {
      this.confirmDeleteWorkspace(this.activeWorkspaceActionId);
      return;
    }
    if (actionKey === AgentHomeActionKey.RENAME_SESSION) {
      const session = this.sessionForActiveAction();
      if (!session) {
        return;
      }
      this.renameSessionDraft = session.title;
      this.openSheet(AgentHomeSheetKey.RENAME_SESSION);
      return;
    }
    if (actionKey === AgentHomeActionKey.DELETE_SESSION) {
      this.confirmDeleteSession(this.activeSessionActionId);
      return;
    }
    if (actionKey === AgentHomeActionKey.COPY_SESSION_ID) {
      this.copyActiveSessionOriginalId();
    }
  }

  private applyWorkspaceRename(): void {
    const workspace = this.workspaceForActiveAction();
    const title = this.renameWorkspaceDraft.trim();
    if (!workspace || title.length === 0) {
      return;
    }
    const updatedWorkspace = new AgentHomeWorkspaceItem(
      workspace.id,
      title,
      workspace.subtitle,
      this.resolveWorkspaceInitial(title),
      workspace.accentColor,
      workspace.branchName,
      workspace.isOnline
    );
    const nextWorkspaces: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      nextWorkspaces.push(item.id === workspace.id ? updatedWorkspace : item);
    }
    this.workspaces = nextWorkspaces;
    this.persistence.saveWorkspace(updatedWorkspace).catch((error: Error): void => {
      logger.error(TAG, 'rename workspace persist failed: ' + this.errorToString(error));
    });
    if (workspace.id === this.activeWorkspaceId) {
      this.syncWorkspaceDrafts();
    }
    this.closeSheet();
  }

  private applySessionRename(): void {
    const session = this.sessionForActiveAction();
    const title = this.renameSessionDraft.trim();
    if (!session || title.length === 0) {
      return;
    }
    const updatedSession = new AgentHomeSessionItem(
      session.id,
      session.workspaceId,
      title,
      session.branchName,
      session.providerId,
      session.modelId,
      session.speedMode,
      session.reasoningMode,
      session.bridgeSessionId,
      Date.now()
    );
    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      nextSessions.push(item.id === session.id ? updatedSession : item);
    }
    this.sessions = nextSessions;
    this.persistSession(updatedSession);
    this.closeSheet();
  }

  private confirmDeleteWorkspace(workspaceId: string): void {
    const workspace = this.findWorkspaceById(workspaceId);
    if (!workspace) {
      return;
    }
    if (this.workspaces.length <= 1) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_last_workspace_required')));
      return;
    }
    const hostContext = this.getUIContext().getHostContext();
    this.closeSheet();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_delete_workspace_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_delete_workspace_message')) + '\n' + workspace.title,
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_delete_workspace')),
        action: (): void => {
          this.deleteWorkspaceById(workspaceId).catch((error: Error): void => {
            logger.error(TAG, 'delete workspace action failed: ' + this.errorToString(error));
          });
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_cancel')),
        action: (): void => {
        }
      }
    });
  }

  private confirmDeleteSession(sessionId: string): void {
    const session = this.findLocalSessionById(sessionId);
    if (!session) {
      return;
    }
    if (this.sessionsForWorkspace(session.workspaceId).length <= 1) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_last_session_required')));
      return;
    }
    const hostContext = this.getUIContext().getHostContext();
    this.closeSheet();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_delete_session_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_delete_session_message')) + '\n' + session.title,
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_delete_session')),
        action: (): void => {
          this.deleteSessionById(sessionId).catch((error: Error): void => {
            logger.error(TAG, 'delete session action failed: ' + this.errorToString(error));
          });
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_cancel')),
        action: (): void => {
        }
      }
    });
  }

  private workspaceForActiveAction(): AgentHomeWorkspaceItem | null {
    return this.findWorkspaceById(this.activeWorkspaceActionId);
  }

  private sessionForActiveAction(): AgentHomeSessionItem | null {
    return this.findLocalSessionById(this.activeSessionActionId);
  }

  private workspaceActionTitle(): string {
    const workspace = this.workspaceForActiveAction();
    if (workspace) {
      return workspace.title;
    }
    return '';
  }

  private sessionActionTitle(): string {
    const session = this.sessionForActiveAction();
    if (session) {
      return session.title;
    }
    return '';
  }

  private copyActiveSessionOriginalId(): void {
    const session = this.sessionForActiveAction();
    if (!session) {
      return;
    }
    const sessionId = this.originalSessionIdForDisplay(session);
    pasteboard.getSystemPasteboard().setData(
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, sessionId)
    ).then((): void => {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_session_id_copied')) +
          ': ' + sessionId
      );
      this.closeSheet();
    }).catch((error: Error): void => {
      logger.error(TAG, 'copy session id failed: ' + this.errorToString(error));
    });
  }

  private copyDesktopSetupCommand(): void {
    pasteboard.getSystemPasteboard().setData(
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, AGENT_HOME_DESKTOP_SETUP_COMMAND)
    ).then((): void => {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_onboarding_command_copied'))
      );
    }).catch((error: Error): void => {
      logger.error(TAG, 'copy desktop bridge command failed: ' + this.errorToString(error));
    });
  }

  private originalSessionIdForDisplay(session: AgentHomeSessionItem): string {
    const remoteSession = this.remoteSessionForLocalSession(session);
    if (remoteSession && remoteSession.remoteSessionId.length > 0) {
      return remoteSession.remoteSessionId;
    }
    if (session.bridgeSessionId.length > 0) {
      return session.bridgeSessionId;
    }
    return session.id;
  }

  private remoteSessionForLocalSession(session: AgentHomeSessionItem): AgentBridgeRemoteSession | null {
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (
        item.sessionId === session.bridgeSessionId &&
        (item.providerId === session.providerId || item.providerId.length === 0 || session.providerId.length === 0)
      ) {
        return item;
      }
    }
    return null;
  }

  private removeRemoteSessionCacheForLocalSession(session: AgentHomeSessionItem): void {
    const nextItems: Array<AgentBridgeRemoteSession> = [];
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (!this.isRemoteSessionCacheForLocalSession(item, session)) {
        nextItems.push(item);
      }
    }
    this.remoteSessions = nextItems;
    this.ensureSessionImportProvider();
  }

  private isRemoteSessionCacheForLocalSession(
    item: AgentBridgeRemoteSession,
    session: AgentHomeSessionItem
  ): boolean {
    const providerMatches = item.providerId === session.providerId ||
      item.providerId.length === 0 ||
      session.providerId.length === 0;
    if (!providerMatches) {
      return false;
    }
    if (session.bridgeSessionId.length > 0) {
      if (item.sessionId === session.bridgeSessionId || item.remoteSessionId === session.bridgeSessionId) {
        return true;
      }
    }
    return item.sessionId === session.id || item.remoteSessionId === session.id;
  }

  private async deleteSessionById(sessionId: string): Promise<void> {
    const session = this.findLocalSessionById(sessionId);
    if (!session || this.sessionsForWorkspace(session.workspaceId).length <= 1) {
      return;
    }
    await this.persistence.deleteSessionCascade(session.id);
    if (session.bridgeSessionId.length > 0 && session.bridgeSessionId !== session.id) {
      await this.persistence.deleteSessionCascade(session.bridgeSessionId);
    }
    const removedSessionIds: Array<string> = [];
    const removedBridgeSessionIds: Array<string> = [];
    removedSessionIds.push(session.id);
    if (session.bridgeSessionId.length > 0) {
      removedBridgeSessionIds.push(session.bridgeSessionId);
    }
    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id !== session.id) {
        nextSessions.push(item);
      }
    }
    this.sessions = nextSessions;
    this.removeSessionScopedLocalState(removedSessionIds, removedBridgeSessionIds);
    if (this.activeSessionId === session.id) {
      const workspaceSessions = this.sessionsForWorkspace(session.workspaceId);
      this.activeSessionId = workspaceSessions.length > 0 ? workspaceSessions[0].id : '';
      if (this.activeSessionId.length > 0) {
        this.beginConversationRenderTransition(this.activeSessionId);
        this.syncRuntimeOptionsFromActiveSession();
        const requestedHistory = this.refreshActiveSessionHistory();
        if (!requestedHistory) {
          this.scheduleConversationRenderReady(this.activeSessionId);
        }
      }
    }
    this.persistProfile();
    this.closeSheet();
  }

  private async deleteWorkspaceById(workspaceId: string): Promise<void> {
    if (this.workspaces.length <= 1) {
      return;
    }
    const workspace = this.findWorkspaceById(workspaceId);
    if (!workspace) {
      return;
    }
    await this.persistence.deleteWorkspaceCascade(workspaceId);
    const removedSessionIds: Array<string> = [];
    const removedBridgeSessionIds: Array<string> = [];
    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.workspaceId === workspaceId) {
        removedSessionIds.push(item.id);
        if (item.bridgeSessionId.length > 0) {
          removedBridgeSessionIds.push(item.bridgeSessionId);
        }
      } else {
        nextSessions.push(item);
      }
    }
    const nextWorkspaces: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id !== workspaceId) {
        nextWorkspaces.push(item);
      }
    }
    this.workspaces = nextWorkspaces;
    this.sessions = nextSessions;
    this.removeSessionScopedLocalState(removedSessionIds, removedBridgeSessionIds);
    this.removeWorkspaceScopedLocalState(workspaceId);
    if (this.activeWorkspaceId === workspaceId) {
      this.activeWorkspaceId = this.workspaces.length > 0 ? this.workspaces[0].id : '';
      const workspaceSessions = this.sessionsForWorkspace(this.activeWorkspaceId);
      this.activeSessionId = workspaceSessions.length > 0 ? workspaceSessions[0].id : '';
      if (this.activeSessionId.length > 0) {
        this.beginConversationRenderTransition(this.activeSessionId);
        this.syncRuntimeOptionsFromActiveSession();
        const requestedHistory = this.refreshActiveSessionHistory();
        if (!requestedHistory) {
          this.scheduleConversationRenderReady(this.activeSessionId);
        }
      }
    } else if (this.isSessionIdInList(this.activeSessionId, removedSessionIds)) {
      const workspaceSessions = this.sessionsForWorkspace(this.activeWorkspaceId);
      this.activeSessionId = workspaceSessions.length > 0 ? workspaceSessions[0].id : '';
    }
    this.syncWorkspaceDrafts();
    this.persistProfile();
    this.closeSheet();
  }

  private removeSessionScopedLocalState(sessionIds: Array<string>, bridgeSessionIds: Array<string>): void {
    const nextMessages: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextMessages.push(item);
      }
    }
    this.messages = nextMessages;

    const nextPreviews: Array<AgentHomePreviewItem> = [];
    for (let index = 0; index < this.previews.length; index++) {
      const item = this.previews[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextPreviews.push(item);
      }
    }
    this.previews = nextPreviews;

    const nextToolCalls: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextToolCalls.push(item);
      }
    }
    this.toolCalls = nextToolCalls;

    const nextUserRequests: Array<AgentHomeUserRequestItem> = [];
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextUserRequests.push(item);
      }
    }
    this.userRequests = nextUserRequests;

    const nextPlans: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextPlans.push(item);
      }
    }
    this.plans = nextPlans;

    const nextChanges: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextChanges.push(item);
      }
    }
    this.workspaceChanges = nextChanges;

    const nextCommits: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < this.gitCommits.length; index++) {
      const item = this.gitCommits[index];
      if (!this.isRemovedSessionId(item.sessionId, sessionIds, bridgeSessionIds)) {
        nextCommits.push(item);
      }
    }
    this.gitCommits = nextCommits;
  }

  private removeWorkspaceScopedLocalState(workspaceId: string): void {
    const nextChanges: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (item.workspaceId !== workspaceId) {
        nextChanges.push(item);
      }
    }
    this.workspaceChanges = nextChanges;

    const nextFiles: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId !== workspaceId) {
        nextFiles.push(item);
      }
    }
    this.workspaceFiles = nextFiles;

    const nextCommits: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < this.gitCommits.length; index++) {
      const item = this.gitCommits[index];
      if (item.workspaceId !== workspaceId) {
        nextCommits.push(item);
      }
    }
    this.gitCommits = nextCommits;

    const nextPlans: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (item.workspaceId !== workspaceId) {
        nextPlans.push(item);
      }
    }
    this.plans = nextPlans;
  }

  private isRemovedSessionId(sessionId: string, sessionIds: Array<string>, bridgeSessionIds: Array<string>): boolean {
    return this.isSessionIdInList(sessionId, sessionIds) || this.isSessionIdInList(sessionId, bridgeSessionIds);
  }

  private isSessionIdInList(sessionId: string, items: Array<string>): boolean {
    for (let index = 0; index < items.length; index++) {
      if (items[index] === sessionId) {
        return true;
      }
    }
    return false;
  }

  private activateWorkspace(workspaceId: string): void {
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.isComposerPlanPanelExpanded = false;
    this.activeWorkspaceId = workspaceId;
    const workspaceSessions = this.sessionsForWorkspace(workspaceId);
    if (workspaceSessions.length > 0) {
      this.activeSessionId = workspaceSessions[0].id;
      this.syncRuntimeOptionsFromActiveSession();
    } else {
      this.prepareNewSessionRuntimeFromActiveSelection();
        this.createLocalSession();
    }
    if (this.activeSessionId.length > 0) {
      this.beginConversationRenderTransition(this.activeSessionId);
    }
    this.prepareWorkspaceBrowserForWorkspaceSwitch();
    this.syncWorkspaceDrafts();
    this.persistProfile();
    this.closeSheet();
    const requestedHistory = this.refreshActiveSessionHistory();
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      this.refreshWorkspaceBrowserRoot();
    }
    if (!requestedHistory && this.activeSessionId.length > 0) {
      this.scheduleConversationRenderReady(this.activeSessionId);
    }
    this.scheduleConversationScrollToBottom(false);
  }

  private activateSession(sessionId: string): void {
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.isComposerPlanPanelExpanded = false;
    this.activeSessionId = sessionId;
    this.beginConversationRenderTransition(sessionId);
    this.syncRuntimeOptionsFromActiveSession();
    const requestedHistory = this.refreshActiveSessionHistory();
    this.persistProfile();
    this.closeSheet();
    if (!requestedHistory) {
      this.scheduleConversationRenderReady(sessionId);
    }
    this.scheduleConversationScrollToBottom(false);
  }

  private syncRuntimeOptionsFromActiveSession(): void {
    const session = this.currentSession();
    if (session) {
      this.selectedProviderId = session.providerId;
      this.selectedModelId = session.modelId;
      this.selectedSpeedMode = session.speedMode;
      this.selectedReasoningMode = session.reasoningMode;
      this.ensureSelectedRuntimeOptions();
    }
  }

  private addMessage(role: string, title: string, text: string, durationText: string, messageId: string = ''): AgentHomeChatItem {
    this.messageSequence = this.messageSequence + 1;
    const item = new AgentHomeChatItem(
      'agent_home_message_' + String(Date.now()) + '_' + String(this.messageSequence),
      this.activeSessionId,
      role,
      title,
      text,
      durationText,
      Date.now(),
      '',
      messageId
    );
    const nextItems: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < this.messages.length; index++) {
      nextItems.push(this.messages[index]);
    }
    nextItems.push(item);
    this.messages = nextItems;
    this.persistMessage(item);
    this.scheduleConversationScrollToBottom(true);
    return item;
  }

  private addBridgeLogMessage(text: string): void {
    if (text.length === 0) {
      return;
    }
    this.showTransientStatus(text);
  }

  private touchActiveSession(): void {
    const nextItems: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      const updatedSession = new AgentHomeSessionItem(
        item.id,
        item.workspaceId,
        item.title,
        item.branchName,
        item.providerId,
        item.modelId,
        item.speedMode,
        item.reasoningMode,
        item.bridgeSessionId,
        item.id === this.activeSessionId ? Date.now() : item.updatedAt
      );
      nextItems.push(updatedSession);
      if (item.id === this.activeSessionId) {
        this.persistSession(updatedSession);
      }
    }
    this.sessions = nextItems;
  }

  private selectProvider(providerId: string): void {
    if (!this.hasProvider(providerId)) {
      return;
    }
    const session = this.currentSession();
    this.selectedProviderId = providerId;
    this.newSessionProviderId = providerId;
    this.newSessionModelId = '';
    this.newSessionSpeedMode = '';
    this.newSessionReasoningMode = '';
    this.sessionImportProviderId = providerId;
    this.ensureSelectedRuntimeOptions();
    this.ensureNewSessionProvider();
    if (session && session.bridgeSessionId.length > 0 && session.providerId !== providerId) {
      this.createLocalSession(false);
      return;
    }
    this.updateActiveSessionRuntimeOptions();
    this.persistProfile();
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      this.requestRemoteSessions();
    }
  }

  private selectNewSessionProvider(providerId: string): void {
    if (!this.hasProvider(providerId)) {
      return;
    }
    this.newSessionProviderId = providerId;
    this.newSessionModelId = '';
    this.newSessionSpeedMode = '';
    this.newSessionReasoningMode = '';
    this.ensureNewSessionProvider();
  }

  private selectModel(modelId: string): void {
    this.selectedModelId = modelId;
    this.updateActiveSessionRuntimeOptions();
    this.persistProfile();
  }

  private selectSpeedMode(speedMode: string): void {
    this.selectedSpeedMode = speedMode;
    this.updateActiveSessionRuntimeOptions();
    this.persistProfile();
  }

  private selectReasoningMode(reasoningMode: string): void {
    this.selectedReasoningMode = reasoningMode;
    this.updateActiveSessionRuntimeOptions();
    this.persistProfile();
  }

  private selectInteractionMode(modeId: string): void {
    const modes = this.currentProviderInteractionModes();
    if (!this.hasInteractionMode(modeId, modes)) {
      return;
    }
    if (this.interactionModeCategory(modeId, modes) === 'run') {
      this.agentRunMode = modeId;
    }
    const items: Array<string> = [];
    items.push(modeId);
    this.selectedInteractionModeIds = this.withDefaultInteractionModes(items, modes);
  }

  private selectInteractionModeInCategory(modeId: string): void {
    const modes = this.currentProviderInteractionModes();
    if (!this.hasInteractionMode(modeId, modes)) {
      return;
    }
    const targetCategory = this.interactionModeCategory(modeId, modes);
    const items: Array<string> = [];
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      const item = this.selectedInteractionModeIds[index];
      if (this.hasInteractionMode(item, modes) && this.interactionModeCategory(item, modes) !== targetCategory) {
        items.push(item);
      }
    }
    items.push(modeId);
    this.selectedInteractionModeIds = this.withDefaultInteractionModes(items, modes);
    this.agentRunMode = this.currentAgentRunMode();
  }

  private toggleInteractionMode(modeId: string): void {
    const modes = this.currentProviderInteractionModes();
    if (!this.hasInteractionMode(modeId, modes)) {
      return;
    }
    const targetCategory = this.interactionModeCategory(modeId, modes);
    const items: Array<string> = [];
    let didRemove = false;
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      const item = this.selectedInteractionModeIds[index];
      if (item === modeId) {
        didRemove = true;
      } else if (this.hasInteractionMode(item, modes) && this.interactionModeCategory(item, modes) !== targetCategory) {
        items.push(item);
      }
    }
    if (!didRemove) {
      items.push(modeId);
    }
    this.selectedInteractionModeIds = this.withDefaultInteractionModes(items, modes);
    this.agentRunMode = this.currentAgentRunMode();
  }

  private selectSessionImportProvider(providerId: string): void {
    if (!this.hasProvider(providerId)) {
      return;
    }
    this.sessionImportProviderId = providerId;
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      this.requestRemoteSessions();
    } else {
      this.updateRemoteSessionsLoadingState();
    }
  }

  private requestRemoteSessions(): void {
    if (this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.pendingRemoteSessionsRequestPairs = [];
      this.loadingRemoteSessions = false;
      return;
    }
    const providerId = this.activeSessionImportProviderId();
    const requestId = this.client.requestSessions(providerId);
    if (requestId.length > 0) {
      this.trackPendingRemoteSessionsRequest(requestId, providerId);
      this.loadingRemoteSessions = true;
      logger.info(TAG, 'request remote sessions: providerId=' + providerId + ', requestId=' + requestId);
    } else {
      this.updateRemoteSessionsLoadingState();
    }
  }

  private applyProviderOptions(providers: Array<AgentBridgeProviderOption>): void {
    if (providers.length === 0) {
      return;
    }
    this.providerOptions = providers;
    if (!this.hasProvider(this.selectedProviderId)) {
      this.selectedProviderId = providers[0].id;
    }
    this.ensureNewSessionProvider();
    this.ensureSessionImportProvider();
    this.ensureSelectedRuntimeOptions();
    this.updateActiveSessionRuntimeOptions();
  }

  private applyRemoteSessionUpdate(remoteSession: AgentBridgeRemoteSession): void {
    if (remoteSession.sessionId.length === 0) {
      return;
    }
    const normalizedRemoteSession = this.normalizeRemoteSessionProvider(
      remoteSession,
      this.pendingBridgeCreateProviderId.length > 0 ?
        this.pendingBridgeCreateProviderId :
        this.activeSessionImportProviderId()
    );
    if (this.bindPendingBridgeSession(normalizedRemoteSession)) {
      this.upsertRemoteSessionCache(normalizedRemoteSession);
      return;
    }
    this.upsertRemoteSessionCache(normalizedRemoteSession);
  }

  private bindPendingBridgeSession(remoteSession: AgentBridgeRemoteSession): boolean {
    if (remoteSession.sessionId.length === 0) {
      return false;
    }
    const providerId = remoteSession.providerId.length > 0 ? remoteSession.providerId : this.pendingBridgeCreateProviderId;
    if (this.pendingBridgeCreateProviderId.length > 0 && providerId !== this.pendingBridgeCreateProviderId) {
      return false;
    }
    const localSession = this.pendingBridgeCreateLocalSessionId.length > 0 ?
      this.findLocalSessionById(this.pendingBridgeCreateLocalSessionId) :
      this.buildPersistedSessionFromRemoteSession(remoteSession, providerId);
    if (!localSession) {
      this.pendingBridgeCreateLocalSessionId = '';
      this.pendingBridgeCreateProviderId = '';
      return false;
    }
    const workspaceId = this.syncWorkspaceFromRemoteSession(remoteSession, localSession.workspaceId);
    const updatedSession = new AgentHomeSessionItem(
      localSession.id,
      workspaceId,
      remoteSession.title.length > 0 ? remoteSession.title : localSession.title,
      remoteSession.branchName.length > 0 ? remoteSession.branchName : localSession.branchName,
      providerId,
      remoteSession.modelId.length > 0 ? remoteSession.modelId : localSession.modelId,
      remoteSession.speedMode.length > 0 ? remoteSession.speedMode : localSession.speedMode,
      remoteSession.reasoningMode.length > 0 ? remoteSession.reasoningMode : localSession.reasoningMode,
      remoteSession.sessionId,
      remoteSession.updatedAt > 0 ? remoteSession.updatedAt : Date.now()
    );
    this.upsertSession(updatedSession);
    this.activeWorkspaceId = updatedSession.workspaceId;
    this.activeSessionId = updatedSession.id;
    this.selectedProviderId = updatedSession.providerId;
    this.selectedModelId = updatedSession.modelId;
    this.selectedSpeedMode = updatedSession.speedMode;
    this.selectedReasoningMode = updatedSession.reasoningMode;
    this.pendingBridgeCreateLocalSessionId = '';
    this.pendingBridgeCreateProviderId = '';
    this.persistSession(updatedSession);
    this.persistProfile();
    return true;
  }

  private buildPersistedSessionFromRemoteSession(remoteSession: AgentBridgeRemoteSession, providerId: string): AgentHomeSessionItem | null {
    if (remoteSession.workspacePath.length === 0) {
      return null;
    }
    const workspacePath = this.canonicalWorkspacePathForRemotePath(remoteSession.workspacePath);
    const workspaceId = this.workspaceIdForPath(workspacePath);
    const workspaceTitle = this.resolveRemoteWorkspaceTitleForPath(remoteSession, workspacePath);
    const branchName = remoteSession.branchName.length > 0 ? remoteSession.branchName : this.currentBranchName();
    const workspace = new AgentHomeWorkspaceItem(
      workspaceId,
      workspaceTitle,
      workspacePath,
      this.resolveWorkspaceInitial(workspaceTitle),
      this.resolveWorkspaceAccentColor(workspaceId),
      branchName,
      true
    );
    const localSession = new AgentHomeSessionItem(
      'remote_session_' + this.safeIdPart(remoteSession.sessionId),
      workspaceId,
      remoteSession.title.length > 0 ? remoteSession.title : workspaceTitle,
      branchName,
      providerId,
      remoteSession.modelId.length > 0 ? remoteSession.modelId : this.selectedModelId,
      remoteSession.speedMode.length > 0 ? remoteSession.speedMode : this.selectedSpeedMode,
      remoteSession.reasoningMode.length > 0 ? remoteSession.reasoningMode : this.selectedReasoningMode,
      remoteSession.sessionId,
      remoteSession.updatedAt > 0 ? remoteSession.updatedAt : Date.now()
    );
    this.upsertWorkspace(workspace);
    this.persistence.saveWorkspace(workspace).catch((error: Error): void => {
      logger.error(TAG, 'persist provider workspace failed: ' + this.errorToString(error));
    });
    return localSession;
  }

  private syncActiveSessionFromRemoteSession(remoteSession: AgentBridgeRemoteSession): void {
    const session = this.currentSession();
    if (!session || session.bridgeSessionId !== remoteSession.sessionId) {
      return;
    }
    const providerId = remoteSession.providerId.length > 0 ? remoteSession.providerId : session.providerId;
    const modelId = remoteSession.modelId.length > 0 ? remoteSession.modelId : session.modelId;
    const speedMode = remoteSession.speedMode.length > 0 ? remoteSession.speedMode : session.speedMode;
    const reasoningMode = remoteSession.reasoningMode.length > 0 ? remoteSession.reasoningMode : session.reasoningMode;
    const title = remoteSession.title.length > 0 ? remoteSession.title : session.title;
    const workspaceId = this.syncWorkspaceFromRemoteSession(remoteSession, session.workspaceId);
    const updatedSession = new AgentHomeSessionItem(
      session.id,
      workspaceId,
      title,
      remoteSession.branchName.length > 0 ? remoteSession.branchName : session.branchName,
      providerId,
      modelId,
      speedMode,
      reasoningMode,
      session.bridgeSessionId,
      remoteSession.updatedAt > 0 ? remoteSession.updatedAt : session.updatedAt
    );
    this.upsertSession(updatedSession);
    this.selectedProviderId = providerId;
    this.selectedModelId = modelId;
    this.selectedSpeedMode = speedMode;
    this.selectedReasoningMode = reasoningMode;
    this.persistSession(updatedSession);
    this.persistProfile();
  }

  private syncWorkspaceFromRemoteSession(remoteSession: AgentBridgeRemoteSession, fallbackWorkspaceId: string): string {
    if (remoteSession.workspacePath.length === 0) {
      return fallbackWorkspaceId;
    }
    const workspacePath = this.canonicalWorkspacePathForRemotePath(remoteSession.workspacePath);
    const workspaceId = this.workspaceIdForPath(workspacePath);
    const workspaceTitle = this.resolveRemoteWorkspaceTitleForPath(remoteSession, workspacePath);
    const workspace = new AgentHomeWorkspaceItem(
      workspaceId,
      workspaceTitle,
      workspacePath,
      this.resolveWorkspaceInitial(workspaceTitle),
      this.resolveWorkspaceAccentColor(workspaceId),
      remoteSession.branchName.length > 0 ? remoteSession.branchName : this.currentBranchName(),
      true
    );
    this.upsertWorkspace(workspace);
    this.persistence.saveWorkspace(workspace).catch((error: Error): void => {
      logger.error(TAG, 'persist remote workspace failed: ' + this.errorToString(error));
    });
    if (workspaceId === this.activeWorkspaceId) {
      this.syncWorkspaceDrafts();
    }
    return workspaceId;
  }

  private replaceRemoteSessions(providerId: string, items: Array<AgentBridgeRemoteSession>): void {
    const effectiveProviderId = this.resolveRemoteSessionProviderId(providerId);
    const nextItems: Array<AgentBridgeRemoteSession> = [];
    const normalizedItems = this.normalizeRemoteSessionsForProvider(effectiveProviderId, items);
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.providerId !== effectiveProviderId) {
        nextItems.push(item);
      }
    }
    for (let index = 0; index < normalizedItems.length; index++) {
      nextItems.push(normalizedItems[index]);
    }
    this.applyRemoteSessionCache(nextItems);
    this.persistRemoteSessionsForProvider(effectiveProviderId, normalizedItems);
    this.clearPendingRemoteSessionsRequestsForProvider(effectiveProviderId);
    this.updateRemoteSessionsLoadingState();
  }

  private upsertRemoteSessionCache(remoteSession: AgentBridgeRemoteSession): void {
    const normalizedRemoteSession = this.normalizeRemoteSessionProvider(
      remoteSession,
      this.resolveRemoteSessionProviderId(remoteSession.providerId)
    );
    const nextItems: Array<AgentBridgeRemoteSession> = [];
    let replaced = false;
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.providerId === normalizedRemoteSession.providerId && item.sessionId === normalizedRemoteSession.sessionId) {
        nextItems.push(normalizedRemoteSession);
        replaced = true;
      } else {
        nextItems.push(item);
      }
    }
    if (!replaced) {
      nextItems.push(normalizedRemoteSession);
    }
    this.applyRemoteSessionCache(nextItems);
    this.persistRemoteSession(normalizedRemoteSession);
  }

  private applyRemoteSessionCache(items: Array<AgentBridgeRemoteSession>): void {
    items.sort((left: AgentBridgeRemoteSession, right: AgentBridgeRemoteSession): number => {
      return right.updatedAt - left.updatedAt;
    });
    this.remoteSessions = items;
    this.ensureSessionImportProvider();
    const remoteSession = this.currentRemoteSession();
    if (remoteSession && remoteSession.providerId === this.currentSessionProviderId()) {
      this.syncActiveSessionFromRemoteSession(remoteSession);
    }
  }

  private updateActiveSessionRuntimeOptions(): void {
    const nextItems: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === this.activeSessionId) {
        const updatedSession = new AgentHomeSessionItem(
          item.id,
          item.workspaceId,
          item.title,
          item.branchName,
          this.selectedProviderId,
          this.selectedModelId,
          this.selectedSpeedMode,
          this.selectedReasoningMode,
          item.bridgeSessionId,
          item.updatedAt
        );
        nextItems.push(updatedSession);
        this.persistSession(updatedSession);
      } else {
        nextItems.push(item);
      }
    }
    this.sessions = nextItems;
  }

  private importRemoteSession(item: AgentBridgeRemoteSession): void {
    if (item.sessionId.length === 0) {
      return;
    }

    const existingSession = this.findImportedSessionForRemoteSession(item);
    if (item.workspacePath.length === 0 && !existingSession) {
      return;
    }
    const workspacePath = item.workspacePath.length > 0 ? this.canonicalWorkspacePathForRemotePath(item.workspacePath) : '';
    const workspaceId = workspacePath.length > 0 ? this.workspaceIdForPath(workspacePath) : this.resolveWorkspaceIdForRemoteSession(item, existingSession);
    const workspaceTitle = workspacePath.length > 0 ? this.resolveRemoteWorkspaceTitleForPath(item, workspacePath) : this.resolveRemoteWorkspaceTitle(item);
    const branchName = item.branchName.length > 0 ? item.branchName : this.currentBranchName();

    const localSessionId = existingSession ? existingSession.id : 'remote_session_' + this.safeIdPart(item.sessionId);
    const sessionTitle = item.title.length > 0 ? item.title : workspaceTitle;
    const localSession = new AgentHomeSessionItem(
      localSessionId,
      workspaceId,
      sessionTitle,
      branchName,
      item.providerId.length > 0 ? item.providerId : this.selectedProviderId,
      item.modelId.length > 0 ? item.modelId : this.selectedModelId,
      item.speedMode.length > 0 ? item.speedMode : this.selectedSpeedMode,
      item.reasoningMode.length > 0 ? item.reasoningMode : this.selectedReasoningMode,
      item.sessionId,
      item.updatedAt > 0 ? item.updatedAt : Date.now()
    );

    if (workspacePath.length > 0) {
      const workspace = new AgentHomeWorkspaceItem(
        workspaceId,
        workspaceTitle,
        workspacePath,
        this.resolveWorkspaceInitial(workspaceTitle),
        this.resolveWorkspaceAccentColor(workspaceId),
        branchName,
        true
      );
      this.upsertWorkspace(workspace);
      this.persistence.saveWorkspace(workspace).catch((error: Error): void => {
        logger.error(TAG, 'persist imported workspace failed: ' + this.errorToString(error));
      });
    }
    this.upsertSession(localSession);
    this.activeWorkspaceId = workspaceId;
    this.activeSessionId = localSessionId;
    if (item.providerId.length > 0) {
      this.selectedProviderId = item.providerId;
      this.sessionImportProviderId = item.providerId;
    }
    if (item.modelId.length > 0) {
      this.selectedModelId = item.modelId;
    }
    if (item.speedMode.length > 0) {
      this.selectedSpeedMode = item.speedMode;
    }
    if (item.reasoningMode.length > 0) {
      this.selectedReasoningMode = item.reasoningMode;
    }
    this.ensureSelectedRuntimeOptions();
    this.syncWorkspaceDrafts();
    this.persistSession(localSession);
    this.persistProfile();
    this.pendingHistoryImportSessionId = localSessionId;
    this.beginConversationRenderTransition(localSessionId);
    this.closeSheet();
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_session_imported'))
    );
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      this.client.requestSessionMessages(item.sessionId);
      return;
    }
    this.pendingHistoryImportSessionId = '';
    this.scheduleConversationRenderReady(localSessionId);
  }

  private applyImportedMessages(
    messages: Array<AgentBridgeImportedMessage>,
    toolCalls: Array<AgentBridgeImportedToolCall>,
    localSessionId: string
  ): void {
    if (localSessionId.length === 0) {
      return;
    }
    const providerId = this.providerIdForSession(localSessionId);
    const nextItems: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (item.sessionId !== localSessionId) {
        nextItems.push(item);
      }
    }

    const importedItems: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < messages.length; index++) {
      const item = messages[index];
      const createdAt = item.createdAt > 0 ? item.createdAt : Date.now() + index;
      const chatItem = new AgentHomeChatItem(
        this.buildImportedMessageId(localSessionId, item, index),
        localSessionId,
        this.normalizeImportedRole(item.role),
        item.title,
        item.text,
        '',
        createdAt,
        item.reasoningText,
        item.messageId.length > 0 ? item.messageId : item.id,
        this.visibleAgentNameForProvider(providerId, item.agentName)
      );
      importedItems.push(chatItem);
      nextItems.push(chatItem);
    }
    this.messages = nextItems;

    const nextToolCalls: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (item.sessionId !== localSessionId) {
        nextToolCalls.push(item);
      }
    }
    const importedToolCalls: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < toolCalls.length; index++) {
      const item = toolCalls[index];
      const updatedAt = item.updatedAt > 0 ? item.updatedAt : Date.now() + index;
      const startedAt = item.startedAt > 0 ? item.startedAt : updatedAt;
      const normalizedStatus = this.normalizeToolCallStatus(item.status);
      const completedAt = item.completedAt > 0 ? item.completedAt :
        (normalizedStatus === AgentHomeToolCallStatus.RUNNING ? 0 : updatedAt);
      const toolCallId = item.toolCallId.length > 0 ? item.toolCallId : item.id;
      const toolCall = new AgentHomeToolCallItem(
        this.buildImportedToolCallId(localSessionId, item, index),
        localSessionId,
        item.providerId.length > 0 ? item.providerId : providerId,
        item.messageId,
        toolCallId,
        item.name.length > 0 ? item.name : toolCallId,
        normalizedStatus,
        item.inputText,
        item.outputText,
        item.errorText,
        item.rawJson,
        startedAt,
        completedAt,
        updatedAt,
        this.visibleAgentNameForProvider(providerId, item.agentName)
      );
      importedToolCalls.push(toolCall);
      nextToolCalls.push(toolCall);
    }
    this.toolCalls = nextToolCalls;
    this.syncPlansFromToolCalls(importedToolCalls);
    if (localSessionId === this.activeSessionId) {
      this.scheduleConversationScrollToBottom(false);
      this.scheduleConversationRenderReady(localSessionId);
    }

    this.persistence.deleteMessagesForSession(localSessionId).then((): void => {
      for (let index = 0; index < importedItems.length; index++) {
        this.persistMessage(importedItems[index]);
      }
      if (importedItems.length === 0) {
        this.showTransientStatus(
          resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_session_history_empty'))
        );
      } else {
        this.showTransientStatus(
          resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_session_history_loaded'))
        );
      }
      this.finishStartupHistorySyncIfNeeded(localSessionId);
    }).catch((error: Error): void => {
      logger.error(TAG, 'replace imported messages failed: ' + this.errorToString(error));
      this.finishStartupHistorySyncIfNeeded(localSessionId);
    });
    this.persistence.deleteToolCallsForSession(localSessionId).then((): void => {
      for (let index = 0; index < importedToolCalls.length; index++) {
        this.persistence.saveToolCall(importedToolCalls[index]).catch((error: Error): void => {
          logger.error(TAG, 'persist imported tool call failed: ' + this.errorToString(error));
        });
      }
    }).catch((error: Error): void => {
      logger.error(TAG, 'replace imported tool calls failed: ' + this.errorToString(error));
    });
  }

  private buildProviderFeatureText(provider: AgentBridgeProviderOption): string {
    let text = provider.description;
    if (provider.endpoint.length > 0) {
      text = text.length > 0 ? text + ' · ' + provider.endpoint : provider.endpoint;
    }
    const features = this.buildProviderFeatureList(provider);
    if (features.length > 0) {
      text = text.length > 0 ? text + ' · ' + features : features;
    }
    return text;
  }

  private buildImportedToolCallId(localSessionId: string, item: AgentBridgeImportedToolCall, index: number): string {
    if (item.id.length > 0) {
      return 'imported_tool_' + this.safeIdPart(localSessionId) + '_' + this.safeIdPart(item.id);
    }
    if (item.toolCallId.length > 0) {
      return 'imported_tool_' + this.safeIdPart(localSessionId) + '_' + this.safeIdPart(item.toolCallId);
    }
    return 'imported_tool_' + this.safeIdPart(localSessionId) + '_' + String(index);
  }

  private buildProviderFeatureList(provider: AgentBridgeProviderOption): string {
    const items: Array<string> = [];
    if (provider.supportsStreaming) {
      items.push('streaming');
    }
    if (provider.supportsTools) {
      items.push('tools');
    }
    if (provider.supportsHistory) {
      items.push('history');
    }
    if (provider.supportsPreviews) {
      items.push('preview');
    }
    return items.join(' / ');
  }

  private buildRemoteSessionMetaText(item: AgentBridgeRemoteSession): string {
    const parts: Array<string> = [];
    const workspace = item.workspacePath.length > 0 ? item.workspacePath : item.workspaceTitle;
    if (workspace.length > 0) {
      parts.push(workspace);
    }
    if (item.branchName.length > 0) {
      parts.push(item.branchName);
    }
    if (item.modelId.length > 0) {
      parts.push(item.modelId);
    }
    if (item.messageCount > 0) {
      parts.push(String(item.messageCount));
    }
    return parts.join(' · ');
  }

  private buildRemoteSessionFootnoteText(item: AgentBridgeRemoteSession): string {
    const parts: Array<string> = [];
    if (item.sessionId.length > 0) {
      parts.push(item.sessionId);
    }
    if (item.updatedAt > 0) {
      parts.push(this.formatDateTime(item.updatedAt));
    }
    if (item.status.length > 0) {
      parts.push(item.status);
    }
    return parts.join(' · ');
  }

  private buildSessionRuntimeText(item: AgentHomeSessionItem): string {
    const parts: Array<string> = [];
    parts.push(this.providerDisplayNameForId(item.providerId));
    if (item.modelId.length > 0) {
      parts.push(item.modelId);
    }
    if (item.bridgeSessionId.length > 0) {
      parts.push(item.bridgeSessionId);
    }
    return parts.join(' · ');
  }

  private isSessionConversationRendering(sessionId: string): boolean {
    return this.isConversationRenderPending &&
      this.conversationRenderSessionId.length > 0 &&
      this.conversationRenderSessionId === sessionId;
  }

  private findLocalSessionByBridgeSession(bridgeSessionId: string): AgentHomeSessionItem | null {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.bridgeSessionId === bridgeSessionId) {
        return item;
      }
    }
    return null;
  }

  private findImportedSessionForRemoteSession(remoteSession: AgentBridgeRemoteSession): AgentHomeSessionItem | null {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.bridgeSessionId !== remoteSession.sessionId) {
        continue;
      }
      if (remoteSession.providerId.length === 0 || item.providerId.length === 0 || item.providerId === remoteSession.providerId) {
        return item;
      }
    }
    return null;
  }

  private isRemoteSessionImported(remoteSession: AgentBridgeRemoteSession): boolean {
    return this.findImportedSessionForRemoteSession(remoteSession) !== null;
  }

  private handleRemoteSessionRowClick(remoteSession: AgentBridgeRemoteSession): void {
    const importedSession = this.findImportedSessionForRemoteSession(remoteSession);
    if (importedSession) {
      this.activateSession(importedSession.id);
      return;
    }
    this.importRemoteSession(remoteSession);
  }

  private findLocalSessionById(sessionId: string): AgentHomeSessionItem | null {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === sessionId) {
        return item;
      }
    }
    return null;
  }

  private resolveWorkspaceIdForRemoteSession(
    item: AgentBridgeRemoteSession,
    existingSession: AgentHomeSessionItem | null
  ): string {
    if (item.workspacePath.length > 0) {
      return this.resolveWorkspaceIdForPath(item.workspacePath);
    }
    if (existingSession) {
      return existingSession.workspaceId;
    }
    return '';
  }

  private resolveWorkspaceIdForPath(workspacePath: string): string {
    const containingWorkspace = this.findWorkspaceContainingPath(workspacePath);
    if (containingWorkspace && containingWorkspace.subtitle.length > 0) {
      return this.workspaceIdForPath(containingWorkspace.subtitle);
    }
    return this.workspaceIdForPath(workspacePath);
  }

  private canonicalWorkspacePathForRemotePath(workspacePath: string): string {
    const containingWorkspace = this.findWorkspaceContainingPath(workspacePath);
    if (containingWorkspace && containingWorkspace.subtitle.length > 0) {
      return containingWorkspace.subtitle;
    }
    return workspacePath;
  }

  private workspaceIdForPath(workspacePath: string): string {
    const normalizedPath = this.normalizeWorkspacePathForCompare(workspacePath);
    if (normalizedPath.length === 0) {
      return '';
    }
    return 'workspace_path_' + this.safeIdPart(normalizedPath);
  }

  private normalizeWorkspacePathForCompare(workspacePath: string): string {
    let normalized = workspacePath.trim().split('\\').join('/');
    while (normalized.endsWith('/') && !this.isWorkspacePathRoot(normalized)) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    if (normalized.length >= 2 && normalized.charAt(1) === ':') {
      return normalized.toLowerCase();
    }
    return normalized;
  }

  private isWorkspacePathRoot(workspacePath: string): boolean {
    if (workspacePath === '/') {
      return true;
    }
    return workspacePath.length === 3 && workspacePath.charAt(1) === ':' && workspacePath.charAt(2) === '/';
  }

  private workspacePathEquals(left: string, right: string): boolean {
    const normalizedLeft = this.normalizeWorkspacePathForCompare(left);
    const normalizedRight = this.normalizeWorkspacePathForCompare(right);
    return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
  }

  private workspacePathContains(workspacePath: string, sessionPath: string): boolean {
    const normalizedWorkspace = this.normalizeWorkspacePathForCompare(workspacePath);
    const normalizedSession = this.normalizeWorkspacePathForCompare(sessionPath);
    if (normalizedWorkspace.length === 0 || normalizedSession.length === 0) {
      return false;
    }
    if (normalizedWorkspace === normalizedSession) {
      return true;
    }
    const prefix = normalizedWorkspace.endsWith('/') ? normalizedWorkspace : normalizedWorkspace + '/';
    return normalizedSession.startsWith(prefix);
  }

  private findWorkspaceContainingPath(workspacePath: string): AgentHomeWorkspaceItem | null {
    let matched: AgentHomeWorkspaceItem | null = null;
    let matchedLength = -1;
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (this.workspacePathContains(item.subtitle, workspacePath)) {
        const normalized = this.normalizeWorkspacePathForCompare(item.subtitle);
        if (normalized.length > matchedLength) {
          matched = item;
          matchedLength = normalized.length;
        }
      }
    }
    return matched;
  }

  private resolveRemoteWorkspaceTitle(item: AgentBridgeRemoteSession): string {
    if (item.workspaceTitle.length > 0) {
      return item.workspaceTitle;
    }
    if (item.workspacePath.length > 0) {
      return this.lastPathSegment(item.workspacePath);
    }
    if (item.title.length > 0) {
      return item.title;
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_default_workspace_title'));
  }

  private resolveRemoteWorkspaceTitleForPath(item: AgentBridgeRemoteSession, workspacePath: string): string {
    const workspace = this.findWorkspaceByPath(workspacePath);
    if (workspace) {
      return workspace.title;
    }
    if (this.workspacePathEquals(workspacePath, item.workspacePath)) {
      return this.resolveRemoteWorkspaceTitle(item);
    }
    if (workspacePath.length > 0) {
      return this.lastPathSegment(workspacePath);
    }
    return this.resolveRemoteWorkspaceTitle(item);
  }

  private resolveWorkspaceInitial(title: string): string {
    if (title.length > 0) {
      return title.substring(0, 1);
    }
    return 'W';
  }

  private resolveWorkspaceAccentColor(workspaceId: string): string {
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id === workspaceId) {
        return item.accentColor;
      }
    }
    return '#4F7DE8';
  }

  private upsertWorkspace(workspace: AgentHomeWorkspaceItem): void {
    const nextItems: Array<AgentHomeWorkspaceItem> = [];
    let replaced = false;
    let migratedWorkspaceId = '';
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id === workspace.id || this.workspacePathEquals(item.subtitle, workspace.subtitle)) {
        nextItems.push(workspace);
        if (item.id !== workspace.id) {
          migratedWorkspaceId = item.id;
        }
        replaced = true;
      } else {
        nextItems.push(item);
      }
    }
    if (!replaced) {
      nextItems.push(workspace);
    }
    this.workspaces = nextItems;
    if (migratedWorkspaceId.length > 0) {
      this.rebindWorkspaceReferences(migratedWorkspaceId, workspace.id);
    }
  }

  private upsertSession(session: AgentHomeSessionItem): void {
    const nextItems: Array<AgentHomeSessionItem> = [];
    let replaced = false;
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === session.id) {
        nextItems.push(session);
        replaced = true;
      } else {
        nextItems.push(item);
      }
    }
    if (!replaced) {
      nextItems.push(session);
    }
    this.sessions = nextItems;
  }

  private buildImportedMessageId(
    localSessionId: string,
    message: AgentBridgeImportedMessage,
    index: number
  ): string {
    const sourceId = message.id.length > 0 ? message.id : String(message.createdAt) + '_' + String(index);
    return 'imported_' + this.safeIdPart(localSessionId) + '_' + this.safeIdPart(sourceId);
  }

  private normalizeImportedRole(role: string): string {
    if (role === AgentHomeMessageRole.USER) {
      return AgentHomeMessageRole.USER;
    }
    if (role === AgentHomeMessageRole.ASSISTANT) {
      return AgentHomeMessageRole.ASSISTANT;
    }
    return AgentHomeMessageRole.STATUS;
  }

  private lastPathSegment(path: string): string {
    let normalized = path;
    while (normalized.endsWith('\\') || normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    const slashIndex = normalized.lastIndexOf('/');
    const backslashIndex = normalized.lastIndexOf('\\');
    const index = slashIndex > backslashIndex ? slashIndex : backslashIndex;
    if (index >= 0 && index + 1 < normalized.length) {
      return normalized.substring(index + 1);
    }
    return normalized.length > 0 ? normalized : path;
  }

  private safeIdPart(text: string): string {
    let result = '';
    for (let index = 0; index < text.length; index++) {
      const current = text.charAt(index);
      const isNumber = current >= '0' && current <= '9';
      const isLower = current >= 'a' && current <= 'z';
      const isUpper = current >= 'A' && current <= 'Z';
      if (isNumber || isLower || isUpper) {
        result = result + current;
      } else {
        result = result + '_';
      }
    }
    if (result.length === 0) {
      return String(Date.now());
    }
    return result;
  }

  private ensureSelectedRuntimeOptions(): void {
    if (!this.hasProvider(this.selectedProviderId)) {
      this.selectedProviderId = this.defaultSelectableProviderId();
    }
    const models = this.currentProviderModels();
    if (models.length > 0 && !this.hasModel(this.selectedModelId, models)) {
      if (!this.shouldPreserveExternalModelId(models)) {
        this.selectedModelId = this.defaultModelId(models);
      }
    }
    const modes = this.currentProviderSpeedModes();
    if (modes.length > 0 && !this.hasSpeedMode(this.selectedSpeedMode, modes)) {
      this.selectedSpeedMode = this.defaultSpeedModeId(modes);
    }
    const reasoningModes = this.currentProviderReasoningModes();
    if (reasoningModes.length > 0 && !this.hasReasoningMode(this.selectedReasoningMode, reasoningModes)) {
      this.selectedReasoningMode = this.defaultReasoningModeId(reasoningModes);
    }
    const interactionModes = this.currentProviderInteractionModes();
    this.ensureSelectedInteractionModes(interactionModes);
    if (interactionModes.length > 0 && !this.hasInteractionMode(this.agentRunMode, interactionModes)) {
      this.agentRunMode = this.currentAgentRunMode();
    }
  }

  private saveActiveWorkspace(): void {
    const title = this.workspaceTitleDraft.trim();
    const path = this.workspacePathDraft.trim();
    if (title.length === 0 || path.length === 0) {
      return;
    }

    const current = this.currentWorkspace();
    const workspaceId = current ? current.id : 'workspace_' + String(Date.now());
    const branchName = current ? current.branchName : this.currentBranchName();
    const accentColor = current ? current.accentColor : '#4F7DE8';
    const initial = title.length > 0 ? title.substring(0, 1) : 'W';
    const updatedWorkspace = new AgentHomeWorkspaceItem(
      workspaceId,
      title,
      path,
      initial,
      accentColor,
      branchName,
      true
    );

    const nextWorkspaces: Array<AgentHomeWorkspaceItem> = [];
    let replaced = false;
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id === workspaceId) {
        nextWorkspaces.push(updatedWorkspace);
        replaced = true;
      } else {
        nextWorkspaces.push(item);
      }
    }
    if (!replaced) {
      nextWorkspaces.push(updatedWorkspace);
    }

    this.workspaces = nextWorkspaces;
    this.activeWorkspaceId = workspaceId;
    this.persistence.saveWorkspace(updatedWorkspace).catch((error: Error): void => {
      logger.error(TAG, 'persist workspace failed: ' + this.errorToString(error));
    });
    this.persistProfile();
  }

  private persistWorkspaceDraftIfComplete(): void {
    if (this.workspaceTitleDraft.trim().length === 0 || this.workspacePathDraft.trim().length === 0) {
      return;
    }
    this.saveActiveWorkspace();
  }

  private confirmClearCurrentSession(): void {
    const session = this.currentSession();
    if (session === null) {
      logger.warn(TAG, 'clear current session ignored: no active session');
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_no_active_session')));
      return;
    }
    const hostContext = this.getUIContext().getHostContext();
    const sessionId = session.id;
    logger.info(TAG, 'clear current session confirmation requested: sessionId=' + sessionId + ', bridgeSessionId=' + session.bridgeSessionId);
    this.closeSheet();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_clear_session_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_clear_session_message')),
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_clear')),
        action: (): void => {
          logger.info(TAG, 'clear current session confirmed: sessionId=' + sessionId);
          this.clearCurrentSessionContent(sessionId).then((): void => {
            this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_clear_session_done')));
          }).catch((error: Error): void => {
            logger.error(TAG, 'clear current session action failed: ' + this.errorToString(error));
            this.showTransientStatus(this.errorToString(error));
          });
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_cancel')),
        action: (): void => {
          logger.info(TAG, 'clear current session cancelled: sessionId=' + sessionId);
        }
      }
    });
  }

  private confirmClearCurrentPreviews(): void {
    const session = this.currentSession();
    if (session === null) {
      logger.warn(TAG, 'clear current previews ignored: no active session');
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_no_active_session')));
      return;
    }
    const hostContext = this.getUIContext().getHostContext();
    const sessionId = session.id;
    logger.info(TAG, 'clear current previews confirmation requested: sessionId=' + sessionId + ', bridgeSessionId=' + session.bridgeSessionId);
    this.closeSheet();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_clear_previews_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_clear_previews_message')),
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_clear')),
        action: (): void => {
          logger.info(TAG, 'clear current previews confirmed: sessionId=' + sessionId);
          this.clearCurrentPreviews(sessionId).then((): void => {
            this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_clear_previews_done')));
          }).catch((error: Error): void => {
            logger.error(TAG, 'clear current previews action failed: ' + this.errorToString(error));
            this.showTransientStatus(this.errorToString(error));
          });
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_cancel')),
        action: (): void => {
          logger.info(TAG, 'clear current previews cancelled: sessionId=' + sessionId);
        }
      }
    });
  }

  private confirmResetAgentData(): void {
    const hostContext = this.getUIContext().getHostContext();
    logger.info(TAG, 'reset agent data confirmation requested: workspaces=' + String(this.workspaces.length) +
      ', sessions=' + String(this.sessions.length) +
      ', messages=' + String(this.messages.length) +
      ', previews=' + String(this.previews.length));
    this.closeSheet();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_reset_data_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_reset_data_message')),
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_reset_data')),
        action: (): void => {
          logger.info(TAG, 'reset agent data confirmed');
          this.resetAgentData().then((): void => {
            this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_reset_data_done')));
          }).catch((error: Error): void => {
            logger.error(TAG, 'reset agent data action failed: ' + this.errorToString(error));
            this.showTransientStatus(this.errorToString(error));
          });
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_cancel')),
        action: (): void => {
          logger.info(TAG, 'reset agent data cancelled');
        }
      }
    });
  }

  private async clearCurrentSessionContent(sessionId: string): Promise<void> {
    const session = this.findLocalSessionById(sessionId);
    if (session === null) {
      throw new Error('session not found: ' + sessionId);
    }
    const remoteSession = this.remoteSessionForLocalSession(session);
    const remoteSessionId = remoteSession !== null ? remoteSession.remoteSessionId : '';
    const remoteCacheSessionId = remoteSession !== null ? remoteSession.sessionId :
      (session.bridgeSessionId.length > 0 ? session.bridgeSessionId : session.id);
    const sessionIds = this.sessionIdsForLocalSession(sessionId);
    logger.info(TAG, 'clear current session content start: sessionId=' + sessionId +
      ', sessionIds=' + this.sessionIdListForLog(sessionIds) +
      ', remoteCacheSessionId=' + remoteCacheSessionId +
      ', remoteSessionId=' + remoteSessionId);
    const sessionsBefore = this.sessions.length;
    const remoteSessionsBefore = this.remoteSessions.length;
    const messagesBefore = this.messages.length;
    const previewsBefore = this.previews.length;
    const toolCallsBefore = this.toolCalls.length;
    const userRequestsBefore = this.userRequests.length;
    const plansBefore = this.plans.length;
    const previewCachePaths = await this.previewCachePathsForSessionIds(sessionIds);
    await this.persistence.deleteSessionCascade(session.id);
    if (session.bridgeSessionId.length > 0 && session.bridgeSessionId !== session.id) {
      await this.persistence.deleteSessionCascade(session.bridgeSessionId);
    }
    await this.persistence.deleteRemoteSessionCache(session.providerId, remoteCacheSessionId, remoteSessionId);
    const nextSessions: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id !== session.id) {
        nextSessions.push(item);
      }
    }
    this.sessions = nextSessions;
    const removedSessionIds: Array<string> = [];
    const removedBridgeSessionIds: Array<string> = [];
    removedSessionIds.push(session.id);
    if (session.bridgeSessionId.length > 0) {
      removedBridgeSessionIds.push(session.bridgeSessionId);
    }
    this.removeSessionScopedLocalState(removedSessionIds, removedBridgeSessionIds);
    this.removeRemoteSessionCacheForLocalSession(session);
    const previewFilesRemoved = this.clearPreviewCacheFiles(previewCachePaths);
    this.activeSessionId = '';
    if (this.activeSessionActionId === session.id) {
      this.activeSessionActionId = '';
    }
    if (this.pendingBridgeCreateLocalSessionId === session.id) {
      this.pendingBridgeCreateLocalSessionId = '';
      this.pendingBridgeCreateProviderId = '';
    }
    this.previewPath = '';
    this.activeWorkspacePreviewPath = '';
    this.activeWorkspacePreviewErrorText = '';
    this.pendingWorkspacePreviewImagePath = '';
    this.stopActiveTurnTimer();
    this.stopContextCompactionStatus();
    this.resetActiveAssistantStream();
    this.releaseActiveWorkspacePreviewPixelMap();
    this.persistProfile();
    logger.info(TAG, 'clear current session content done: sessionId=' + sessionId +
      ', sessionsRemoved=' + String(sessionsBefore - this.sessions.length) +
      ', remoteSessionsRemoved=' + String(remoteSessionsBefore - this.remoteSessions.length) +
      ', messagesRemoved=' + String(messagesBefore - this.messages.length) +
      ', previewsRemoved=' + String(previewsBefore - this.previews.length) +
      ', previewFilesRemoved=' + String(previewFilesRemoved) +
      ', toolCallsRemoved=' + String(toolCallsBefore - this.toolCalls.length) +
      ', userRequestsRemoved=' + String(userRequestsBefore - this.userRequests.length) +
      ', plansRemoved=' + String(plansBefore - this.plans.length) +
      ', activeSessionId=' + this.activeSessionId);
  }

  private async clearCurrentPreviews(sessionId: string): Promise<void> {
    const sessionIds = this.sessionIdsForLocalSession(sessionId);
    logger.info(TAG, 'clear current previews start: sessionId=' + sessionId +
      ', sessionIds=' + this.sessionIdListForLog(sessionIds));
    const previewsBefore = this.previews.length;
    const previewCachePaths = await this.previewCachePathsForSessionIds(sessionIds);
    for (let index = 0; index < sessionIds.length; index++) {
      await this.persistence.deletePreviewsForSession(sessionIds[index]);
    }
    const nextPreviews: Array<AgentHomePreviewItem> = [];
    for (let index = 0; index < this.previews.length; index++) {
      const item = this.previews[index];
      if (!this.isSessionIdInList(item.sessionId, sessionIds)) {
        nextPreviews.push(item);
      }
    }
    this.previews = nextPreviews;
    this.previewPath = '';
    this.activeWorkspacePreviewPath = '';
    this.activeWorkspacePreviewErrorText = '';
    this.pendingWorkspacePreviewImagePath = '';
    this.releaseActiveWorkspacePreviewPixelMap();
    const previewFilesRemoved = this.clearPreviewCacheFiles(previewCachePaths);
    logger.info(TAG, 'clear current previews done: sessionId=' + sessionId +
      ', previewsRemoved=' + String(previewsBefore - this.previews.length) +
      ', previewFilesRemoved=' + String(previewFilesRemoved));
  }

  private async resetAgentData(): Promise<void> {
    logger.info(TAG, 'reset agent data start: workspaces=' + String(this.workspaces.length) +
      ', sessions=' + String(this.sessions.length) +
      ', messages=' + String(this.messages.length) +
      ', previews=' + String(this.previews.length) +
      ', toolCalls=' + String(this.toolCalls.length) +
      ', userRequests=' + String(this.userRequests.length) +
      ', plans=' + String(this.plans.length));
    await this.persistence.clearAll();
    this.workspaces = [];
    this.sessions = [];
    this.messages = [];
    this.previews = [];
    this.toolCalls = [];
    this.userRequests = [];
    this.plans = [];
    this.workspaceChanges = [];
    this.workspaceFiles = [];
    this.gitCommits = [];
    this.previewPath = '';
    this.activeWorkspacePreviewPath = '';
    this.activeWorkspacePreviewErrorText = '';
    this.pendingWorkspacePreviewImagePath = '';
    this.releaseActiveWorkspacePreviewPixelMap();
    const previewFilesRemoved = this.clearAllPreviewCacheFiles();
    this.resetActiveAssistantStream();
    this.initializeDefaults();
    const snapshot = await this.persistence.loadOrCreate(this.buildBootstrapState());
    this.applySnapshot(snapshot);
    logger.info(TAG, 'reset agent data done: workspaces=' + String(this.workspaces.length) +
      ', sessions=' + String(this.sessions.length) +
      ', previewFilesRemoved=' + String(previewFilesRemoved) +
      ', activeWorkspaceId=' + this.activeWorkspaceId +
      ', activeSessionId=' + this.activeSessionId);
  }

  private async previewCachePathsForSessionIds(sessionIds: Array<string>): Promise<Array<string>> {
    const paths: Array<string> = [];
    for (let index = 0; index < this.previews.length; index++) {
      const item = this.previews[index];
      if (this.isSessionIdInList(item.sessionId, sessionIds)) {
        this.addPreviewCachePath(paths, this.previewCachePathFromContent(item.content));
      }
    }
    for (let index = 0; index < sessionIds.length; index++) {
      const contents: Array<string> = await this.persistence.loadPreviewContentsForSession(sessionIds[index]);
      for (let contentIndex = 0; contentIndex < contents.length; contentIndex++) {
        this.addPreviewCachePath(paths, this.previewCachePathFromContent(contents[contentIndex]));
      }
    }
    return paths;
  }

  private previewCachePathFromContent(content: string): string {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return '';
    }
    const relativePrefix = AGENT_HOME_PREVIEW_CACHE_DIR + '/';
    if (trimmed.startsWith(relativePrefix)) {
      return trimmed;
    }
    const normalized = trimmed.startsWith('file://') ? trimmed.substring('file://'.length) : trimmed;
    const marker = '/' + AGENT_HOME_PREVIEW_CACHE_DIR + '/';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0) {
      return '';
    }
    const fileNameStart = markerIndex + marker.length;
    if (fileNameStart >= normalized.length) {
      return '';
    }
    return relativePrefix + normalized.substring(fileNameStart);
  }

  private addPreviewCachePath(paths: Array<string>, path: string): void {
    if (!this.isSafePreviewCachePath(path)) {
      return;
    }
    for (let index = 0; index < paths.length; index++) {
      if (paths[index] === path) {
        return;
      }
    }
    paths.push(path);
  }

  private isSafePreviewCachePath(path: string): boolean {
    const prefix = AGENT_HOME_PREVIEW_CACHE_DIR + '/';
    if (!path.startsWith(prefix)) {
      return false;
    }
    if (path.length <= prefix.length) {
      return false;
    }
    if (path.indexOf('..') >= 0 || path.indexOf('\\') >= 0) {
      logger.warn(TAG, 'unsafe preview cache path ignored: ' + path);
      return false;
    }
    return true;
  }

  private clearPreviewCacheFiles(paths: Array<string>): number {
    let removed = 0;
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      if (!FileUtils.exists(path)) {
        logger.info(TAG, 'preview cache file already absent: ' + path);
        continue;
      }
      if (FileUtils.deleteFile(path)) {
        removed = removed + 1;
        logger.info(TAG, 'preview cache file deleted: ' + path);
      } else {
        logger.warn(TAG, 'preview cache file delete failed: ' + path);
      }
    }
    return removed;
  }

  private clearAllPreviewCacheFiles(): number {
    if (!FileUtils.exists(AGENT_HOME_PREVIEW_CACHE_DIR)) {
      logger.info(TAG, 'preview cache directory already absent: ' + AGENT_HOME_PREVIEW_CACHE_DIR);
      return 0;
    }
    const removed = this.clearPreviewCacheDirectoryContent(AGENT_HOME_PREVIEW_CACHE_DIR);
    if (FileUtils.exists(AGENT_HOME_PREVIEW_CACHE_DIR) && FileUtils.deleteDirectory(AGENT_HOME_PREVIEW_CACHE_DIR)) {
      logger.info(TAG, 'preview cache directory deleted: ' + AGENT_HOME_PREVIEW_CACHE_DIR);
    }
    return removed;
  }

  private clearPreviewCacheDirectoryContent(directoryPath: string): number {
    let removed = 0;
    const entries: Array<NGFFileEntry> = FileUtils.listDirectory(directoryPath);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const childPath = directoryPath + '/' + entry.name;
      if (entry.isDirectory) {
        removed = removed + this.clearPreviewCacheDirectoryContent(childPath);
        if (FileUtils.deleteDirectory(childPath)) {
          logger.info(TAG, 'preview cache subdirectory deleted: ' + childPath);
        } else {
          logger.warn(TAG, 'preview cache subdirectory delete failed: ' + childPath);
        }
        continue;
      }
      if (FileUtils.deleteFile(childPath)) {
        removed = removed + 1;
        logger.info(TAG, 'preview cache file deleted: ' + childPath);
      } else {
        logger.warn(TAG, 'preview cache file delete failed: ' + childPath);
      }
    }
    return removed;
  }

  private syncWorkspaceDrafts(): void {
    const workspace = this.currentWorkspace();
    if (workspace) {
      this.workspaceTitleDraft = workspace.title;
      this.workspacePathDraft = workspace.subtitle;
      return;
    }
    this.workspaceTitleDraft = '';
    this.workspacePathDraft = '';
  }

  private buildCurrentProfile(): AgentHomeProfile {
    return new AgentHomeProfile(
      this.bridgeEndpoint,
      this.bridgeToken,
      this.selectedProviderId,
      this.selectedModelId,
      this.selectedSpeedMode,
      this.selectedReasoningMode,
      this.activeWorkspaceId,
      this.activeSessionId,
      this.previewPath,
      Date.now()
    );
  }

  private persistProfile(): void {
    this.persistence.saveProfile(this.buildCurrentProfile()).catch((error: Error): void => {
      logger.error(TAG, 'persist profile failed: ' + this.errorToString(error));
    });
  }

  private persistSession(session: AgentHomeSessionItem): void {
    this.persistence.saveSession(session).catch((error: Error): void => {
      logger.error(TAG, 'persist session failed: ' + this.errorToString(error));
    });
  }

  private persistMessage(message: AgentHomeChatItem): void {
    this.persistence.saveMessage(message).catch((error: Error): void => {
      logger.error(TAG, 'persist message failed: ' + this.errorToString(error));
    });
  }

  private persistPreview(preview: AgentHomePreviewItem): void {
    this.persistence.savePreview(preview).catch((error: Error): void => {
      logger.error(TAG, 'persist preview failed: ' + this.errorToString(error));
    });
  }

  private applyWorkspaceChangesFromBridge(source: string): void {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'changes');
    const nextItems: Array<AgentHomeWorkspaceChangeItem> = [];
    const bridgeSessionId = AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId');
    const sessionId = bridgeSessionId.length > 0 ? this.localSessionIdForBridgeSession(bridgeSessionId) : this.activeSessionId;
    const workspaceId = this.activeWorkspaceId;
    for (let index = 0; index < objects.length; index++) {
      const item = this.parseWorkspaceChangeObject(objects[index], sessionId, workspaceId);
      if (item.path.length > 0) {
        nextItems.push(item);
      }
    }
    const kept: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (item.sessionId !== sessionId) {
        kept.push(item);
      }
    }
    for (let index = 0; index < nextItems.length; index++) {
      kept.push(nextItems[index]);
    }
    this.loadingWorkspaceChanges = false;
    this.workspaceChanges = kept;
    this.persistence.replaceWorkspaceChangesForSession(sessionId, nextItems).catch((error: Error): void => {
      logger.error(TAG, 'persist workspace changes failed: ' + this.errorToString(error));
    });

    const commitObjects = AgentBridgeIncomingParser.extractObjectArray(source, 'commits');
    const commits: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < commitObjects.length; index++) {
      const commit = this.parseGitCommitObject(commitObjects[index], sessionId, workspaceId);
      if (commit.hash.length > 0) {
        commits.push(commit);
      }
    }
    if (commits.length > 0) {
      this.gitCommits = commits;
      this.persistence.replaceGitCommitsForSession(sessionId, commits).catch((error: Error): void => {
        logger.error(TAG, 'persist git commits failed: ' + this.errorToString(error));
      });
    }
  }

  private applyWorkspaceFilesFromBridge(source: string): void {
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'files');
    const responseParentPath = this.normalizeWorkspaceFilePath(AgentBridgeIncomingParser.extractStringProperty(source, 'parentPath'));
    const workspaceId = this.activeWorkspaceId;
    const nextItems: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < objects.length; index++) {
      const item = this.parseWorkspaceFileObject(objects[index], workspaceId);
      if (item.path.length > 0) {
        nextItems.push(item);
      }
    }
    const parentPath = this.resolveWorkspaceFilesParentPath(responseParentPath, nextItems);
    const scopedItems = this.scopeWorkspaceFileItemsForParent(parentPath, nextItems);
    const kept: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId !== workspaceId || item.parentPath !== parentPath) {
        kept.push(item);
      }
    }
    for (let index = 0; index < scopedItems.length; index++) {
      kept.push(scopedItems[index]);
    }
    this.loadingWorkspaceFiles = false;
    this.removeLoadingWorkspaceFileParentPath(parentPath);
    this.workspaceFiles = kept;
    this.persistence.replaceWorkspaceFilesForParent(workspaceId, parentPath, scopedItems).catch((error: Error): void => {
      logger.error(TAG, 'persist workspace files failed: ' + this.errorToString(error));
    });
  }

  private applyWorkspaceDiffFromBridge(source: string): void {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    let path = AgentBridgeIncomingParser.extractPayloadFirstPairStringProperty(payloadObject, source, 'path', 'filePath');
    if (path.length === 0) {
      path = AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'relativePath');
    }
    path = this.normalizeWorkspaceFilePath(path);
    let rawDiffText = AgentBridgeIncomingParser.extractPayloadFirstPairStringProperty(payloadObject, source, 'diffText', 'diff');
    if (rawDiffText.length === 0) {
      rawDiffText = AgentBridgeIncomingParser.extractPayloadFirstPairStringProperty(payloadObject, source, 'patch', 'content');
    }
    const diffText = AgentBridgeIncomingParser.cleanJsonText(rawDiffText);
    this.removeLoadingWorkspaceDiffForPath(path);
    if (path.length === 0 || diffText.length === 0) {
      return;
    }
    let additions = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'additions', 0);
    if (additions === 0) {
      additions = AgentBridgeIncomingParser.extractNumberProperty(source, 'additions', 0);
    }
    let deletions = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'deletions', 0);
    if (deletions === 0) {
      deletions = AgentBridgeIncomingParser.extractNumberProperty(source, 'deletions', 0);
    }
    if (additions === 0 && deletions === 0) {
      additions = this.countWorkspaceDiffAdditions(diffText);
      deletions = this.countWorkspaceDiffDeletions(diffText);
    }
    const diffKind = this.normalizeWorkspaceChangeKind(
      AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'kind'),
      path
    );
    const diffChangedFileCount = AgentBridgeIncomingParser.extractNumberProperty(payloadObject, 'changedFileCount', 0);
    const bridgeSessionId = AgentBridgeIncomingParser.extractPayloadFirstStringProperty(payloadObject, source, 'sessionId');
    const targetSessionId = bridgeSessionId.length > 0 ? this.localSessionIdForBridgeSession(bridgeSessionId) : this.activeSessionId;
    const nextItems: Array<AgentHomeWorkspaceChangeItem> = [];
    let matched = false;
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (this.shouldApplyWorkspaceDiffToChange(item, path, targetSessionId)) {
        matched = true;
        nextItems.push(new AgentHomeWorkspaceChangeItem(
          item.id,
          item.sessionId,
          item.workspaceId,
          item.providerId,
          item.path,
          item.oldPath,
          item.status,
          item.staged,
          additions > 0 || deletions > 0 ? additions : item.additions,
          additions > 0 || deletions > 0 ? deletions : item.deletions,
          diffText,
          Date.now(),
          diffKind.length > 0 ? diffKind : item.kind,
          diffChangedFileCount > 0 ? diffChangedFileCount : item.changedFileCount
        ));
      } else {
        nextItems.push(item);
      }
    }
    this.workspaceChanges = nextItems;
    if (!matched) {
      logger.warn(TAG, 'workspace diff response did not match change item: ' + path);
    }
    this.persistence.replaceWorkspaceChangesForSession(this.activeSessionId, this.visibleWorkspaceChanges()).catch((error: Error): void => {
      logger.error(TAG, 'persist workspace diff failed: ' + this.errorToString(error));
    });
  }

  private shouldApplyWorkspaceDiffToChange(item: AgentHomeWorkspaceChangeItem, path: string, targetSessionId: string): boolean {
    if (item.path !== path) {
      return false;
    }
    if (targetSessionId.length > 0 && item.sessionId === targetSessionId) {
      return true;
    }
    if (item.sessionId === this.activeSessionId) {
      return true;
    }
    return item.workspaceId === this.activeWorkspaceId;
  }

  private countWorkspaceDiffAdditions(diffText: string): number {
    return this.countWorkspaceDiffLinesByPrefix(diffText, '+', '+++');
  }

  private countWorkspaceDiffDeletions(diffText: string): number {
    return this.countWorkspaceDiffLinesByPrefix(diffText, '-', '---');
  }

  private countWorkspaceDiffLinesByPrefix(diffText: string, prefix: string, skipPrefix: string): number {
    let count = 0;
    let lineStart = 0;
    while (lineStart <= diffText.length) {
      const nextLineStart = diffText.indexOf('\n', lineStart);
      let line = '';
      if (nextLineStart < 0) {
        line = diffText.substring(lineStart);
        lineStart = diffText.length + 1;
      } else {
        line = diffText.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      if (line.endsWith('\r')) {
        line = line.substring(0, line.length - 1);
      }
      if (line.length === 0 && lineStart > diffText.length) {
        continue;
      }
      if (line.startsWith(skipPrefix)) {
        continue;
      }
      if (line.startsWith(prefix)) {
        count += 1;
      }
    }
    return count;
  }

  private parseWorkspaceChangeObject(source: string, sessionId: string, workspaceId: string): AgentHomeWorkspaceChangeItem {
    let path = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'path', 'filePath');
    if (path.length === 0) {
      path = AgentBridgeIncomingParser.extractStringProperty(source, 'relativePath');
    }
    path = this.normalizeWorkspaceFilePath(path);
    const id = AgentBridgeIncomingParser.extractStringProperty(source, 'id');
    let rawDiffText = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'diffText', 'diff');
    if (rawDiffText.length === 0) {
      rawDiffText = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'patch', 'content');
    }
    return new AgentHomeWorkspaceChangeItem(
      id.length > 0 ? id : sessionId + ':' + path,
      sessionId,
      workspaceId,
      AgentBridgeIncomingParser.extractStringProperty(source, 'providerId'),
      path,
      AgentBridgeIncomingParser.extractStringProperty(source, 'oldPath'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'status'),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'staged'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'additions', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'deletions', 0),
      AgentBridgeIncomingParser.cleanJsonText(rawDiffText),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', Date.now()),
      this.normalizeWorkspaceChangeKind(AgentBridgeIncomingParser.extractStringProperty(source, 'kind'), path),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'changedFileCount', 1)
    );
  }

  private parseWorkspaceFileObject(source: string, workspaceId: string): AgentHomeWorkspaceFileItem {
    let path = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'path', 'filePath');
    if (path.length === 0) {
      path = AgentBridgeIncomingParser.extractStringProperty(source, 'relativePath');
    }
    path = this.normalizeWorkspaceFilePath(path);
    const parentPath = this.normalizeWorkspaceFilePath(AgentBridgeIncomingParser.extractStringProperty(source, 'parentPath'));
    const name = AgentBridgeIncomingParser.extractStringProperty(source, 'name');
    const kind = AgentBridgeIncomingParser.extractStringProperty(source, 'kind');
    const depth = AgentBridgeIncomingParser.extractNumberProperty(source, 'depth', this.depthForWorkspacePath(path));
    return new AgentHomeWorkspaceFileItem(
      workspaceId + ':' + path,
      workspaceId,
      path,
      parentPath.length > 0 ? parentPath : this.parentPathFromWorkspacePath(path),
      name.length > 0 ? name : this.fileNameFromPath(path),
      kind.length > 0 ? kind : 'file',
      depth,
      AgentBridgeIncomingParser.extractNumberProperty(source, 'sizeBytes', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'modifiedAt', 0),
      AgentBridgeIncomingParser.extractBooleanProperty(source, 'isHidden'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', Date.now())
    );
  }

  private parseGitCommitObject(source: string, sessionId: string, workspaceId: string): AgentHomeGitCommitItem {
    const hash = AgentBridgeIncomingParser.extractStringProperty(source, 'hash');
    return new AgentHomeGitCommitItem(
      AgentBridgeIncomingParser.extractStringProperty(source, 'id'),
      sessionId,
      workspaceId,
      AgentBridgeIncomingParser.extractStringProperty(source, 'providerId'),
      hash,
      AgentBridgeIncomingParser.extractStringProperty(source, 'message'),
      AgentBridgeIncomingParser.extractStringProperty(source, 'author'),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'committedAt', 0),
      AgentBridgeIncomingParser.extractNumberProperty(source, 'updatedAt', Date.now())
    );
  }

  private refreshWorkspacePanel(): void {
    if (this.workspacePanelTabIndex === AgentHomeWorkspacePanelTab.CHANGES) {
      this.refreshWorkspaceChanges();
    } else {
      this.refreshWorkspaceFiles('');
    }
  }

  private prepareWorkspaceBrowserForWorkspaceSwitch(): void {
    this.expandedWorkspaceDirs = [];
    this.pendingWorkspaceFilesParentPath = '';
    this.loadingWorkspaceFileParentPaths = [];
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentBridgeSessionId().length > 0) {
      this.loadingWorkspaceChanges = true;
      this.loadingWorkspaceFiles = true;
      this.addLoadingWorkspaceFileParentPath('');
      return;
    }
    this.loadingWorkspaceChanges = false;
    this.loadingWorkspaceFiles = false;
  }

  private refreshWorkspaceBrowserRoot(): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.loadingWorkspaceChanges = false;
      this.loadingWorkspaceFiles = false;
      this.removeLoadingWorkspaceFileParentPath('');
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    }
    this.loadingWorkspaceChanges = true;
    this.client.requestWorkspaceChanges(bridgeSessionId, this.activeWorkspaceId);
    this.requestWorkspaceFilesWithBridgeSession(bridgeSessionId, '');
  }

  private refreshWorkspaceChanges(): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    }
    this.loadingWorkspaceChanges = true;
    this.client.requestWorkspaceChanges(bridgeSessionId, this.activeWorkspaceId);
  }

  private refreshWorkspaceFiles(parentPath: string): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    }
    const normalizedParentPath = this.normalizeWorkspaceFilePath(parentPath);
    this.requestWorkspaceFilesWithBridgeSession(bridgeSessionId, normalizedParentPath);
  }

  private requestWorkspaceFilesWithBridgeSession(bridgeSessionId: string, parentPath: string): void {
    const normalizedParentPath = this.normalizeWorkspaceFilePath(parentPath);
    this.pendingWorkspaceFilesParentPath = normalizedParentPath;
    this.loadingWorkspaceFiles = true;
    this.addLoadingWorkspaceFileParentPath(normalizedParentPath);
    this.client.requestWorkspaceFiles(bridgeSessionId, this.activeWorkspaceId, normalizedParentPath);
  }

  private stageOrUnstageWorkspacePath(item: AgentHomeWorkspaceChangeItem): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    const paths: Array<string> = [];
    paths.push(item.path);
    if (item.staged) {
      this.client.unstageWorkspacePaths(bridgeSessionId, this.activeWorkspaceId, paths);
    } else {
      this.client.stageWorkspacePaths(bridgeSessionId, this.activeWorkspaceId, paths);
    }
  }

  private openWorkspaceDiffDetail(item: AgentHomeWorkspaceChangeItem): void {
    this.activeWorkspaceChangeId = item.id;
    this.requestWorkspaceDiffIfNeeded(item);
    this.openSheet(AgentHomeSheetKey.WORKSPACE_DIFF_DETAIL);
  }

  private requestWorkspaceDiffIfNeeded(item: AgentHomeWorkspaceChangeItem): void {
    if (item.diffText.length > 0 || this.isWorkspaceDiffLoading(item.id)) {
      return;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    }
    this.addLoadingWorkspaceDiff(item.id);
    this.client.requestWorkspaceDiff(bridgeSessionId, this.activeWorkspaceId, item.path, item.staged);
  }

  private toggleWorkspaceDiff(item: AgentHomeWorkspaceChangeItem): void {
    if (this.isWorkspaceDiffExpanded(item.id)) {
      this.removeExpandedWorkspaceDiff(item.id);
      return;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    }
    this.addExpandedWorkspaceDiff(item.id);
    if (item.diffText.length > 0) {
      return;
    }
    this.addLoadingWorkspaceDiff(item.id);
    this.client.requestWorkspaceDiff(bridgeSessionId, this.activeWorkspaceId, item.path, item.staged);
  }

  private confirmDiscardWorkspacePath(path: string): void {
    const hostContext = this.getUIContext().getHostContext();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_discard_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_discard_message')) + '\n' + path,
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_workspace_discard')),
        action: (): void => {
          const paths: Array<string> = [];
          paths.push(path);
          this.client.discardWorkspacePaths(this.currentBridgeSessionId(), this.activeWorkspaceId, paths);
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_action_cancel')),
        action: (): void => {}
      }
    });
  }

  private confirmCommitWorkspaceChanges(): void {
    const hostContext = this.getUIContext().getHostContext();
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_commit_title')),
      message: resolveResourceString(hostContext, $r('app.string.agent_home_confirm_commit_message')),
      primaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_workspace_commit')),
        action: (): void => {
          this.client.commitWorkspaceChanges(this.currentBridgeSessionId(), this.activeWorkspaceId, this.commitMessageDraft);
        }
      },
      secondaryButton: {
        value: resolveResourceString(hostContext, $r('app.string.agent_home_action_cancel')),
        action: (): void => {}
      }
    });
  }

  private handleWorkspaceFileClick(item: AgentHomeWorkspaceFileItem): void {
    if (item.kind === 'directory') {
      this.selectedWorkspaceFilePath = this.selectedWorkspaceFilePath === item.path ? '' : item.path;
      if (this.isWorkspaceDirExpanded(item.path)) {
        this.removeExpandedWorkspaceDir(item.path);
      } else {
        this.addExpandedWorkspaceDir(item.path);
        if (!this.hasWorkspaceFilesForParent(item.path)) {
          this.refreshWorkspaceFiles(item.path);
        }
      }
      return;
    }
    this.selectedWorkspaceFilePath = item.path;
    this.openWorkspaceContentPreview(item.path);
  }

  private openWorkspaceContentPreview(path: string, preferExactPath: boolean = false): void {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    if (normalizedPath.length === 0) {
      return;
    }
    const requestPath = preferExactPath ? normalizedPath : this.resolveWorkspacePreviewRequestPath(normalizedPath);
    if (requestPath.length === 0) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_content_preview_file_required')));
      return;
    }
    this.activeWorkspacePreviewErrorText = '';
    this.activeWorkspacePreviewSurfaceDark = false;
    this.releaseActiveWorkspacePreviewPixelMapIfNeeded(requestPath);
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentBridgeSessionId().length > 0) {
      this.activeWorkspacePreviewPath = requestPath;
      if (this.workspacePreviewContentKind(requestPath, '') === NGFRichContentKind.IMAGE) {
        this.previewWorkspaceImageFile(requestPath);
      } else {
        this.previewWorkspaceFile(requestPath);
      }
    } else if (this.previewItemForWorkspacePath(requestPath) === null) {
      this.showTransientStatus(resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_requires_session')));
      return;
    } else {
      this.activeWorkspacePreviewPath = requestPath;
    }
    this.openSheet(AgentHomeSheetKey.WORKSPACE_CONTENT_PREVIEW);
  }

  private handleAssistantAnswerLinkClick(url: string): boolean {
    const path = this.workspaceReferencePathFromRichContentLink(url);
    logger.info(TAG, 'assistant answer link clicked: url=' + url + ', workspacePath=' + path);
    if (path.length > 0) {
      this.openWorkspaceReferenceFromRichContent(path);
      return true;
    }
    this.showTransientStatus(url);
    return true;
  }

  private workspaceReferencePathFromRichContentLink(url: string): string {
    let value = this.decodeRichContentLinkUrl(url).trim();
    if (value.length === 0 || value.startsWith('#')) {
      return '';
    }
    value = this.stripRichContentFileUrlPrefix(value);
    if (this.richContentLinkHasExternalScheme(value)) {
      return '';
    }
    value = this.stripRichContentUrlSuffix(value);
    value = this.stripRichContentLineSuffix(value);
    return this.resolveWorkspaceReferencePath(value);
  }

  private resolveWorkspaceReferencePath(rawText: string): string {
    let value = this.stripRichContentReferenceEdge(rawText);
    if (value.length === 0 || value.startsWith('#')) {
      return '';
    }
    value = this.stripRichContentFileUrlPrefix(value);
    if (this.richContentLinkHasExternalScheme(value)) {
      return '';
    }
    value = this.stripRichContentUrlSuffix(value);
    value = this.stripRichContentLineSuffix(value);
    value = this.stripRichContentReferenceEdge(value);
    const normalizedPath = this.normalizeWorkspaceFilePath(value);
    if (normalizedPath.length === 0) {
      return '';
    }
    const change = this.workspaceChangeForReferencePath(normalizedPath);
    if (change !== null) {
      return this.normalizeWorkspaceFilePath(change.path);
    }
    if (this.isWorkspacePreviewableFilePath(normalizedPath)) {
      return normalizedPath;
    }
    const knownPath = this.knownWorkspacePathForShortReference(normalizedPath);
    if (knownPath.length > 0) {
      return knownPath;
    }
    return '';
  }

  private stripRichContentReferenceEdge(text: string): string {
    let value = text.trim();
    let changed = true;
    while (changed && value.length > 0) {
      changed = false;
      const first = value.charAt(0);
      if (first === '`' || first === '"' || first === '\'' || first === '<' || first === '[' || first === '(' || first === '（') {
        value = value.substring(1).trim();
        changed = true;
      }
      if (value.length === 0) {
        return value;
      }
      const last = value.charAt(value.length - 1);
      if (last === '`' ||
        last === '"' ||
        last === '\'' ||
        last === '>' ||
        last === ']' ||
        last === ')' ||
        last === '）' ||
        last === '.' ||
        last === ',' ||
        last === '，' ||
        last === '。' ||
        last === '、' ||
        last === ';' ||
        last === '；' ||
        last === ':') {
        value = value.substring(0, value.length - 1).trim();
        changed = true;
      }
    }
    return value;
  }

  private workspaceChangeForReferencePath(path: string): AgentHomeWorkspaceChangeItem | null {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    const changes = this.visibleWorkspaceChanges();
    for (let index = 0; index < changes.length; index++) {
      const item = changes[index];
      if (this.normalizeWorkspaceFilePath(item.path) === normalizedPath ||
        this.normalizeWorkspaceFilePath(item.oldPath) === normalizedPath) {
        return item;
      }
    }
    return this.workspaceChangeForShortReference(normalizedPath);
  }

  private workspaceChangeForShortReference(path: string): AgentHomeWorkspaceChangeItem | null {
    if (path.indexOf('/') >= 0) {
      return null;
    }
    const changes = this.visibleWorkspaceChanges();
    for (let index = 0; index < changes.length; index++) {
      const item = changes[index];
      if (this.fileNameFromPath(item.path) === path || this.fileNameFromPath(item.oldPath) === path) {
        return item;
      }
    }
    return null;
  }

  private knownWorkspacePathForShortReference(path: string): string {
    if (path.indexOf('/') >= 0) {
      return '';
    }
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId === this.activeWorkspaceId && item.kind === 'file' && item.name === path) {
        return this.normalizeWorkspaceFilePath(item.path);
      }
    }
    return '';
  }

  private openWorkspaceReferenceFromRichContent(path: string): void {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    const change = this.workspaceChangeForReferencePath(normalizedPath);
    if (change !== null) {
      this.openWorkspaceDiffDetail(change);
      return;
    }
    this.openWorkspaceContentPreview(normalizedPath, true);
  }

  private decodeRichContentLinkUrl(url: string): string {
    try {
      return decodeURIComponent(url);
    } catch (_error) {
      return url;
    }
  }

  private stripRichContentFileUrlPrefix(url: string): string {
    if (url.startsWith('file:///')) {
      return url.substring(8);
    }
    if (url.startsWith('file://')) {
      return url.substring(7);
    }
    if (url.startsWith('vscode://file/')) {
      return url.substring(14);
    }
    return url;
  }

  private richContentLinkHasExternalScheme(url: string): boolean {
    const colonIndex = url.indexOf(':');
    if (colonIndex < 0 || colonIndex === 1) {
      return false;
    }
    const slashIndex = url.indexOf('/');
    return slashIndex < 0 || colonIndex < slashIndex;
  }

  private stripRichContentUrlSuffix(url: string): string {
    let value = url;
    const hashIndex = value.indexOf('#');
    if (hashIndex >= 0) {
      value = value.substring(0, hashIndex);
    }
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0) {
      value = value.substring(0, queryIndex);
    }
    return value;
  }

  private stripRichContentLineSuffix(path: string): string {
    let value = path;
    let shouldContinue = true;
    while (shouldContinue) {
      const colonIndex = value.lastIndexOf(':');
      if (colonIndex <= 1 || colonIndex >= value.length - 1) {
        shouldContinue = false;
      } else {
        const suffix = value.substring(colonIndex + 1);
        if (this.isPositiveIntegerText(suffix)) {
          value = value.substring(0, colonIndex);
        } else {
          shouldContinue = false;
        }
      }
    }
    return value;
  }

  private isPositiveIntegerText(text: string): boolean {
    if (text.length === 0) {
      return false;
    }
    for (let index = 0; index < text.length; index++) {
      const char = text.charAt(index);
      if (char < '0' || char > '9') {
        return false;
      }
    }
    return true;
  }

  private previewWorkspaceFile(path: string): void {
    this.previewPath = path;
    const parentPath = this.parentPathFromWorkspacePath(path);
    logger.info(TAG, 'request workspace file preview: path=' + path + ', parentPath=' + parentPath);
    this.client.requestWorkspaceFile(this.currentBridgeSessionId(), this.activeWorkspaceId, path, parentPath);
  }

  private previewWorkspaceImageFile(path: string): void {
    this.previewPath = path;
    this.pendingWorkspacePreviewImagePath = this.normalizeWorkspaceFilePath(path);
    const parentPath = this.parentPathFromWorkspacePath(path);
    logger.info(TAG, 'request workspace image preview: path=' + path + ', parentPath=' + parentPath);
    this.client.requestWorkspaceFileDownload(this.currentBridgeSessionId(), this.activeWorkspaceId, path, parentPath);
  }

  private downloadWorkspaceFile(path: string): void {
    this.client.requestWorkspaceFileDownload(
      this.currentBridgeSessionId(),
      this.activeWorkspaceId,
      path,
      this.parentPathFromWorkspacePath(path)
    );
  }

  private shouldHandleAsMessageAttachmentImageDownload(parsed: AgentBridgeParsedMessage): boolean {
    if (parsed.requestKind !== AGENT_HOME_ATTACHMENT_PREVIEW_DOWNLOAD_KIND) {
      return false;
    }
    const parsedPath = parsed.downloadFilePath;
    if (parsedPath.length === 0) {
      return false;
    }
    return this.isMessageAttachmentImagePending(parsedPath);
  }

  private async saveMessageAttachmentImageDownload(parsed: AgentBridgeParsedMessage): Promise<void> {
    if (parsed.downloadPath.length === 0 || parsed.downloadFilePath.length === 0) {
      throw new Error('attachment download payload is incomplete');
    }
    const pathValue = parsed.downloadFilePath;
    const url = this.buildBridgeDownloadUrl(parsed.downloadPath);
    const httpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        connectTimeout: 15000,
        readTimeout: 60000,
        expectDataType: http.HttpDataType.ARRAY_BUFFER
      };
      const response: http.HttpResponse = await httpRequest.request(url, options);
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw new Error('download failed: ' + String(response.responseCode));
      }
      if (!(response.result instanceof ArrayBuffer) || response.result.byteLength <= 0) {
        throw new Error('download response is empty');
      }
      const mediaType = this.workspaceRasterMediaTypeForPath(pathValue);
      let content = this.writeMessageAttachmentImageCache(pathValue, mediaType, response.result);
      if (content.length === 0) {
        content = this.rasterPreviewDataUrlFromBuffer(response.result, mediaType);
      }
      this.upsertMessageAttachmentImageCache(pathValue, content);
      this.removePendingMessageAttachmentImagePath(pathValue);
      logger.info(TAG, 'message attachment image cached: path=' + pathValue);
    } catch (error) {
      throw new Error(this.errorToString(error));
    } finally {
      httpRequest.destroy();
    }
  }

  private writeMessageAttachmentImageCache(pathValue: string, mediaType: string, imageBuffer: ArrayBuffer): string {
    const fileName = this.safePreviewImageFileName('message_attachment_' + String(Date.now()), pathValue, mediaType);
    const directory = this.messageAttachmentPreviewCacheDirectoryPath();
    if (directory.length > 0) {
      const absolutePath = directory + '/' + fileName;
      if (FileUtils.createDirectory(directory, true) && FileUtils.writeBytes(absolutePath, imageBuffer)) {
        return absolutePath;
      }
    }
    const relativePath = AGENT_HOME_ATTACHMENT_PREVIEW_CACHE_DIR + '/' + fileName;
    if (FileUtils.createDirectory(AGENT_HOME_ATTACHMENT_PREVIEW_CACHE_DIR, true) && FileUtils.writeBytes(relativePath, imageBuffer)) {
      return relativePath;
    }
    return '';
  }

  private messageAttachmentPreviewCacheDirectoryPath(): string {
    const ctx = uiContextManager.getAbilityContext();
    if (ctx !== null && ctx.filesDir.length > 0) {
      return ctx.filesDir + '/' + AGENT_HOME_ATTACHMENT_PREVIEW_CACHE_DIR;
    }
    return '';
  }

  private upsertMessageAttachmentImageCache(pathValue: string, content: string): void {
    const normalizedPath = this.normalizedMessageAttachmentPath(pathValue);
    const nextItems: Array<AgentHomeMessageAttachmentImageCache> = [];
    nextItems.push(new AgentHomeMessageAttachmentImageCache(pathValue, content));
    for (let index = 0; index < this.messageAttachmentImageCache.length && nextItems.length < 80; index++) {
      const item = this.messageAttachmentImageCache[index];
      if (this.normalizedMessageAttachmentPath(item.path) !== normalizedPath) {
        nextItems.push(item);
      }
    }
    this.messageAttachmentImageCache = nextItems;
  }

  private shouldHandleAsWorkspacePreviewImageDownload(parsed: AgentBridgeParsedMessage): boolean {
    if (this.pendingWorkspacePreviewImagePath.length === 0) {
      return false;
    }
    const parsedPath = this.normalizeWorkspaceFilePath(parsed.downloadFilePath);
    if (parsedPath.length === 0) {
      return this.workspacePreviewContentKind(this.pendingWorkspacePreviewImagePath, '') === NGFRichContentKind.IMAGE;
    }
    return parsedPath === this.pendingWorkspacePreviewImagePath &&
      this.workspacePreviewContentKind(parsedPath, '') === NGFRichContentKind.IMAGE;
  }

  private async saveWorkspacePreviewImageDownload(parsed: AgentBridgeParsedMessage): Promise<void> {
    if (parsed.downloadPath.length === 0) {
      throw new Error('download path is empty');
    }
    const sourcePath = parsed.downloadFilePath.length > 0 ? parsed.downloadFilePath : this.pendingWorkspacePreviewImagePath;
    const normalizedPath = this.normalizeWorkspaceFilePath(sourcePath);
    if (normalizedPath.length === 0) {
      throw new Error('preview image path is empty');
    }
    const url = this.buildBridgeDownloadUrl(parsed.downloadPath);
    const httpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        connectTimeout: 15000,
        readTimeout: 60000,
        expectDataType: http.HttpDataType.ARRAY_BUFFER
      };
      const response: http.HttpResponse = await httpRequest.request(url, options);
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw new Error('download failed: ' + String(response.responseCode));
      }
      if (!(response.result instanceof ArrayBuffer)) {
        throw new Error('download response is not binary');
      }
      if (response.result.byteLength <= 0) {
        throw new Error('download response is empty');
      }
      this.previewSequence = this.previewSequence + 1;
      const previewId = 'agent_home_preview_' + String(Date.now()) + '_' + String(this.previewSequence);
      await this.updateActiveWorkspacePreviewPixelMap(response.result, normalizedPath);
      const mediaType = this.workspaceRasterMediaTypeForPath(normalizedPath);
      let previewContent = this.writeRasterPreviewBuffer(previewId, normalizedPath, mediaType, response.result);
      if (previewContent.length === 0) {
        logger.warn(TAG, 'preview image cache write failed, keeping in-memory pixel map: path=' + normalizedPath);
        previewContent = this.rasterPreviewDataUrlFromBuffer(response.result, mediaType);
      }
      const sessionId = parsed.sessionId.length > 0 ? this.localSessionIdForBridgeSession(parsed.sessionId) : this.activeSessionId;
      const preview = new AgentHomePreviewItem(
        previewId,
        sessionId,
        normalizedPath,
        mediaType,
        previewContent,
        Date.now()
      );
      this.pushWorkspacePreviewItem(preview);
      this.activeWorkspacePreviewErrorText = '';
      this.pendingWorkspacePreviewImagePath = '';
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_preview_updated')) + ': ' + normalizedPath
      );
    } catch (error) {
      throw new Error(this.errorToString(error));
    } finally {
      httpRequest.destroy();
    }
  }

  private async saveBridgeDownload(parsed: AgentBridgeParsedMessage): Promise<void> {
    if (parsed.downloadPath.length === 0) {
      throw new Error('download path is empty');
    }
    const url = this.buildBridgeDownloadUrl(parsed.downloadPath);
    const fallbackPath = parsed.downloadFilePath.length > 0 ? parsed.downloadFilePath : parsed.previewPath;
    const fileName = this.safeDownloadFileName(parsed.fileName.length > 0 ? parsed.fileName : this.fileNameFromPath(fallbackPath));
    const relativePath = 'agent-downloads/' + fileName;
    const httpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        connectTimeout: 15000,
        readTimeout: 60000
      };
      const response: http.HttpResponse = await httpRequest.request(url, options);
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw new Error('download failed: ' + String(response.responseCode));
      }
      FileUtils.createDirectory('agent-downloads', true);
      if (typeof response.result === 'string') {
        FileUtils.writeText(relativePath, response.result);
      } else if (response.result instanceof ArrayBuffer) {
        FileUtils.writeBytes(relativePath, response.result);
      } else {
        throw new Error('download response is empty');
      }
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_download_ready')) +
          ': ' + relativePath
      );
    } catch (error) {
      throw new Error(this.errorToString(error));
    } finally {
      httpRequest.destroy();
    }
  }

  private buildBridgeDownloadUrl(downloadPath: string): string {
    let base = this.bridgeEndpoint.trim();
    if (base.startsWith('ws://')) {
      base = 'http://' + base.substring(5);
    } else if (base.startsWith('wss://')) {
      base = 'https://' + base.substring(6);
    }
    const wsIndex = base.indexOf('/ws');
    if (wsIndex >= 0) {
      base = base.substring(0, wsIndex);
    }
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    const separator = downloadPath.indexOf('?') >= 0 ? '&' : '?';
    return base + downloadPath + separator + 'token=' + encodeURIComponent(this.bridgeToken);
  }

  private safeDownloadFileName(fileName: string): string {
    let value = fileName.trim();
    if (value.length === 0) {
      value = 'download.bin';
    }
    value = value.split('\\').join('_').split('/').join('_').split(':').join('_');
    return value;
  }

  private copyWorkspacePath(path: string): void {
    pasteboard.getSystemPasteboard().setData(
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, path)
    ).then((): void => {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_path_copied')) +
          ': ' + path
      );
    }).catch((error: Error): void => {
      logger.error(TAG, 'copy workspace path failed: ' + this.errorToString(error));
    });
  }

  private shouldShowAgentFilterBar(): boolean {
    return this.agentFilterOptions().length > 1;
  }

  private agentFilterOptions(): Array<AgentHomeAgentFilterOption> {
    const hostContext = this.getUIContext().getHostContext();
    const options: Array<AgentHomeAgentFilterOption> = [];
    const agentNames: Array<string> = [];
    this.collectCurrentAgentNames(agentNames);
    options.push(new AgentHomeAgentFilterOption(
      AgentHomeAgentFilter.ALL,
      resolveResourceString(hostContext, $r('app.string.agent_home_agent_filter_all')),
      '',
      true
    ));
    if (!this.currentProviderSupportsVisibleSubagents()) {
      return options;
    }
    if (agentNames.length === 0) {
      return options;
    }
    options.push(new AgentHomeAgentFilterOption(
      AgentHomeAgentFilter.MAIN,
      resolveResourceString(hostContext, $r('app.string.agent_home_agent_filter_main')),
      '',
      true
    ));
    for (let index = 0; index < agentNames.length; index++) {
      const agentName = agentNames[index];
      options.push(new AgentHomeAgentFilterOption(
        this.agentFilterIdForName(agentName),
        agentName,
        agentName,
        false
      ));
    }
    return options;
  }

  private collectCurrentAgentNames(agentNames: Array<string>): void {
    if (!this.currentProviderSupportsVisibleSubagents()) {
      return;
    }
    this.collectAgentName(agentNames, this.currentVisibleSubagentName());
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId)) {
        this.collectAgentName(agentNames, item.agentName);
      }
    }
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId)) {
        this.collectAgentName(agentNames, item.agentName);
      }
    }
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId)) {
        this.collectAgentName(agentNames, item.agentName);
      }
    }
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId)) {
        this.collectAgentName(agentNames, item.agentName);
      }
    }
  }

  private collectAgentName(agentNames: Array<string>, agentName: string): void {
    const normalized = this.visibleAgentNameForProvider(this.currentSessionProviderId(), agentName);
    if (normalized.length === 0 || this.hasAgentName(agentNames, normalized)) {
      return;
    }
    agentNames.push(normalized);
  }

  private hasAgentName(agentNames: Array<string>, agentName: string): boolean {
    for (let index = 0; index < agentNames.length; index++) {
      if (agentNames[index] === agentName) {
        return true;
      }
    }
    return false;
  }

  private agentFilterIdForName(agentName: string): string {
    return AgentHomeAgentFilter.SUBAGENT_PREFIX + agentName;
  }

  private isAgentFilterSelected(filterId: string): boolean {
    return this.effectiveAgentFilterId() === filterId;
  }

  private switchAgentFilter(filterId: string): void {
    if (this.selectedAgentFilterId === filterId) {
      return;
    }
    this.getUIContext().animateTo({ duration: 160, curve: Curve.EaseOut }, (): void => {
      this.selectedAgentFilterId = filterId;
      this.resetConversationBottomButtonState();
      this.scheduleConversationScrollToBottom(false);
    });
  }

  private effectiveAgentFilterId(): string {
    if (!this.currentProviderSupportsVisibleSubagents()) {
      return AgentHomeAgentFilter.ALL;
    }
    if (this.selectedAgentFilterId === AgentHomeAgentFilter.ALL) {
      return AgentHomeAgentFilter.ALL;
    }
    if (this.selectedAgentFilterId === AgentHomeAgentFilter.MAIN) {
      return this.hasCurrentSubagentItems() ? AgentHomeAgentFilter.MAIN : AgentHomeAgentFilter.ALL;
    }
    const agentName = this.agentNameFromFilterId(this.selectedAgentFilterId);
    if (agentName.length > 0 && this.hasCurrentAgentName(agentName)) {
      return this.selectedAgentFilterId;
    }
    return AgentHomeAgentFilter.ALL;
  }

  private agentNameFromFilterId(filterId: string): string {
    if (filterId.indexOf(AgentHomeAgentFilter.SUBAGENT_PREFIX) !== 0) {
      return '';
    }
    return filterId.substring(AgentHomeAgentFilter.SUBAGENT_PREFIX.length);
  }

  private hasCurrentSubagentItems(): boolean {
    const names: Array<string> = [];
    this.collectCurrentAgentNames(names);
    return names.length > 0;
  }

  private hasCurrentAgentName(agentName: string): boolean {
    const names: Array<string> = [];
    this.collectCurrentAgentNames(names);
    return this.hasAgentName(names, agentName);
  }

  private isChatMessageVisibleForAgentFilter(item: AgentHomeChatItem): boolean {
    if (item.role === AgentHomeMessageRole.USER) {
      return true;
    }
    return this.isAgentNameVisibleForSelectedFilter(item.agentName);
  }

  private isAgentNameVisibleForSelectedFilter(agentName: string): boolean {
    if (!this.currentProviderSupportsVisibleSubagents()) {
      return true;
    }
    const visibleAgentName = this.visibleAgentNameForProvider(this.currentSessionProviderId(), agentName);
    const filterId = this.effectiveAgentFilterId();
    if (filterId === AgentHomeAgentFilter.ALL) {
      return true;
    }
    if (filterId === AgentHomeAgentFilter.MAIN) {
      return visibleAgentName.length === 0;
    }
    return visibleAgentName === this.agentNameFromFilterId(filterId);
  }

  private visibleMessages(): Array<AgentHomeChatItem> {
    const items: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (
        item.sessionId === this.activeSessionId &&
          item.role !== AgentHomeMessageRole.STATUS &&
          item.role !== AgentHomeMessageRole.TOOL &&
          this.isChatMessageVisibleForAgentFilter(item)
      ) {
        items.push(item);
      }
    }
    return this.mergeDisplayReasoningOnlyMessages(items);
  }

  private mergeDisplayReasoningOnlyMessages(items: Array<AgentHomeChatItem>): Array<AgentHomeChatItem> {
    const result: Array<AgentHomeChatItem> = [];
    let pendingReasoning: AgentHomeChatItem | null = null;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (this.isDisplayReasoningOnlyMessage(item)) {
        if (pendingReasoning !== null && pendingReasoning.agentName === item.agentName) {
          pendingReasoning = this.mergeDisplayReasoningMessage(pendingReasoning, item);
        } else {
          if (pendingReasoning !== null) {
            result.push(pendingReasoning);
          }
          pendingReasoning = item;
        }
      } else {
        if (pendingReasoning !== null) {
          result.push(pendingReasoning);
          pendingReasoning = null;
        }
        result.push(item);
      }
    }
    if (pendingReasoning !== null) {
      result.push(pendingReasoning);
    }
    return result;
  }

  private isDisplayReasoningOnlyMessage(item: AgentHomeChatItem): boolean {
    return item.role === AgentHomeMessageRole.ASSISTANT &&
      item.text.length === 0 &&
      item.reasoningText.length > 0;
  }

  private mergeDisplayReasoningMessage(left: AgentHomeChatItem, right: AgentHomeChatItem): AgentHomeChatItem {
    return new AgentHomeChatItem(
      left.id,
      left.sessionId,
      left.role,
      left.title,
      '',
      '',
      left.createdAt,
      this.joinReasoningTextForDisplay(left.reasoningText, right.reasoningText),
      left.messageId.length > 0 ? left.messageId : right.messageId,
      left.agentName
    );
  }

  private joinReasoningTextForDisplay(left: string, right: string): string {
    if (left.length === 0) {
      return right;
    }
    if (right.length === 0) {
      return left;
    }
    if (left.endsWith('\n') || right.startsWith('\n')) {
      return left + right;
    }
    return left + '\n' + right;
  }

  private visibleConversationItems(): Array<AgentHomeConversationItem> {
    const items: Array<AgentHomeConversationItem> = [];
    const messages = this.visibleMessages();
    for (let index = 0; index < messages.length; index++) {
      const item = messages[index];
      this.insertConversationItem(items, new AgentHomeConversationItem(
        this.conversationMessageItemId(item),
        AgentHomeConversationItemKind.MESSAGE,
        item.createdAt,
        item,
        null,
        null,
        null
      ));
    }

    const toolCalls = this.visibleToolCalls();
    for (let index = 0; index < toolCalls.length; index++) {
      const item = toolCalls[index];
      const createdAt = item.startedAt > 0 ? item.startedAt : item.updatedAt;
      this.insertConversationItem(items, new AgentHomeConversationItem(
        this.conversationToolCallItemId(item),
        AgentHomeConversationItemKind.TOOL_CALL,
        createdAt,
        null,
        item,
        null,
        null
      ));
    }

    const userRequests = this.visibleUserRequests();
    for (let index = 0; index < userRequests.length; index++) {
      const item = userRequests[index];
      this.insertConversationItem(items, new AgentHomeConversationItem(
        'conversation_request_' + item.id + '_' + item.status + '_' + String(item.updatedAt),
        AgentHomeConversationItemKind.USER_REQUEST,
        item.createdAt,
        null,
        null,
        item,
        null
      ));
    }

    const plans = this.visiblePlans();
    for (let index = 0; index < plans.length; index++) {
      const item = plans[index];
      this.insertConversationItem(items, new AgentHomeConversationItem(
        'conversation_plan_' + item.id + '_' + item.status + '_' + String(item.content.length) + '_' + String(item.updatedAt),
        AgentHomeConversationItemKind.PLAN,
        item.updatedAt > 0 ? item.updatedAt : item.createdAt,
        null,
        null,
        null,
        item
      ));
    }
    return items;
  }

  private conversationItemBottomMargin(kind: string): number {
    if (kind === AgentHomeConversationItemKind.TOOL_CALL) {
      return 4;
    }
    return 22;
  }

  private conversationMessageItemId(item: AgentHomeChatItem): string {
    return 'conversation_message_' + item.id +
      '_' + String(item.text.length) +
      '_' + String(item.reasoningText.length) +
      '_' + String(item.durationText.length) +
      '_' + item.agentName +
      '_' + this.conversationRichContentThemeKey();
  }

  private conversationToolCallItemId(item: AgentHomeToolCallItem): string {
    return 'conversation_tool_' + item.id +
      '_' + item.status +
      '_' + String(item.inputText.length) +
      '_' + String(item.outputText.length) +
      '_' + String(item.errorText.length) +
      '_' + String(item.rawJson.length) +
      '_' + item.agentName;
  }

  private conversationMessageItems(item: AgentHomeConversationItem): Array<AgentHomeChatItem> {
    const result: Array<AgentHomeChatItem> = [];
    if (item.message !== null) {
      result.push(item.message);
    }
    return result;
  }

  private conversationToolCallItems(item: AgentHomeConversationItem): Array<AgentHomeToolCallItem> {
    const result: Array<AgentHomeToolCallItem> = [];
    if (item.toolCall !== null) {
      result.push(item.toolCall);
    }
    return result;
  }

  private conversationUserRequestItems(item: AgentHomeConversationItem): Array<AgentHomeUserRequestItem> {
    const result: Array<AgentHomeUserRequestItem> = [];
    if (item.userRequest !== null) {
      result.push(item.userRequest);
    }
    return result;
  }

  private conversationPlanItems(item: AgentHomeConversationItem): Array<AgentHomePlanItem> {
    const result: Array<AgentHomePlanItem> = [];
    if (item.plan !== null) {
      result.push(item.plan);
    }
    return result;
  }

  private insertConversationItem(items: Array<AgentHomeConversationItem>, item: AgentHomeConversationItem): void {
    for (let index = 0; index < items.length; index++) {
      if (item.createdAt < items[index].createdAt) {
        items.splice(index, 0, item);
        return;
      }
    }
    items.push(item);
  }

  private visibleToolCalls(): Array<AgentHomeToolCallItem> {
    const items: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (
          this.isToolCallVisibleForActiveSession(item) &&
          !this.isProviderMessageToolCall(item) &&
          !this.shouldDisplayToolCallAsPlan(item) &&
          this.isAgentNameVisibleForSelectedFilter(item.agentName)
      ) {
        items.push(item);
      }
    }
    return items;
  }

  private isToolCallVisibleForActiveSession(item: AgentHomeToolCallItem): boolean {
    if (item.sessionId === this.activeSessionId) {
      return true;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length > 0 && item.sessionId === bridgeSessionId) {
      return true;
    }
    return bridgeSessionId.length > 0 && this.localSessionIdForBridgeSession(bridgeSessionId) === item.sessionId;
  }

  private isProviderMessageToolCall(item: AgentHomeToolCallItem): boolean {
    if (item.toolCallId === item.providerId + '_message') {
      return true;
    }
    if (item.name === item.providerId + '.message') {
      return true;
    }
    return false;
  }

  private visibleUserRequests(): Array<AgentHomeUserRequestItem> {
    const items: Array<AgentHomeUserRequestItem> = [];
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) && this.isAgentNameVisibleForSelectedFilter(item.agentName)) {
        items.push(item);
      }
    }
    return items;
  }

  private isSessionVisibleForActiveSession(sessionId: string): boolean {
    if (sessionId === this.activeSessionId) {
      return true;
    }
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length > 0 && sessionId === bridgeSessionId) {
      return true;
    }
    return bridgeSessionId.length > 0 && this.localSessionIdForBridgeSession(bridgeSessionId) === sessionId;
  }

  private visiblePlans(): Array<AgentHomePlanItem> {
    const items: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) && this.isAgentNameVisibleForSelectedFilter(item.agentName)) {
        items.push(item);
      }
    }
    return items;
  }

  private visibleWorkspaceChanges(): Array<AgentHomeWorkspaceChangeItem> {
    const items: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (item.sessionId === this.activeSessionId) {
        items.push(item);
      }
    }
    return items;
  }

  private visibleWorkspaceFiles(): Array<AgentHomeWorkspaceFileItem> {
    const items: Array<AgentHomeWorkspaceFileItem> = [];
    const sourceFiles = this.workspaceFilesWithSyntheticDirectories();
    this.appendVisibleWorkspaceFiles('', items, 0, sourceFiles);
    return items;
  }

  private appendVisibleWorkspaceFiles(
    parentPath: string,
    output: Array<AgentHomeWorkspaceFileItem>,
    depthGuard: number,
    sourceFiles: Array<AgentHomeWorkspaceFileItem>
  ): void {
    if (depthGuard > 24) {
      return;
    }
    for (let index = 0; index < sourceFiles.length; index++) {
      const item = sourceFiles[index];
      if (item.workspaceId !== this.activeWorkspaceId || item.parentPath !== parentPath) {
        continue;
      }
      output.push(item);
      if (item.kind === 'directory' && this.isWorkspaceDirExpanded(item.path)) {
        this.appendVisibleWorkspaceFiles(item.path, output, depthGuard + 1, sourceFiles);
      }
    }
  }

  private workspaceFilesWithSyntheticDirectories(): Array<AgentHomeWorkspaceFileItem> {
    const items: Array<AgentHomeWorkspaceFileItem> = [];
    const sourceItems: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId === this.activeWorkspaceId) {
        sourceItems.push(item);
      }
    }

    for (let index = 0; index < sourceItems.length; index++) {
      this.appendSyntheticWorkspaceDirectories(sourceItems[index].path, items);
    }

    for (let index = 0; index < sourceItems.length; index++) {
      const item = sourceItems[index];
      if (!this.hasWorkspaceFilePath(items, item.path)) {
        items.push(item);
      }
    }
    return items;
  }

  private appendSyntheticWorkspaceDirectories(path: string, output: Array<AgentHomeWorkspaceFileItem>): void {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    if (normalizedPath.length === 0) {
      return;
    }
    const segments = normalizedPath.split('/');
    let currentPath = '';
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index];
      if (segment.length === 0) {
        continue;
      }
      const parentPath = currentPath;
      currentPath = currentPath.length > 0 ? currentPath + '/' + segment : segment;
      if (!this.hasWorkspaceFilePath(output, currentPath)) {
        output.push(new AgentHomeWorkspaceFileItem(
          this.activeWorkspaceId + ':' + currentPath,
          this.activeWorkspaceId,
          currentPath,
          parentPath,
          segment,
          'directory',
          this.depthForWorkspacePath(currentPath),
          0,
          0,
          false,
          0
        ));
      }
    }
  }

  private hasWorkspaceFilesForParent(parentPath: string): boolean {
    const normalizedParentPath = this.normalizeWorkspaceFilePath(parentPath);
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId === this.activeWorkspaceId && item.parentPath === normalizedParentPath) {
        return true;
      }
    }
    return false;
  }

  private hasWorkspaceFilePath(items: Array<AgentHomeWorkspaceFileItem>, path: string): boolean {
    for (let index = 0; index < items.length; index++) {
      if (items[index].path === path) {
        return true;
      }
    }
    return false;
  }

  private activeToolCall(): AgentHomeToolCallItem | null {
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (item.id === this.activeToolCallId) {
        return item;
      }
    }
    return null;
  }

  private activeWorkspaceChange(): AgentHomeWorkspaceChangeItem | null {
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (item.id === this.activeWorkspaceChangeId) {
        return item;
      }
    }
    return null;
  }

  private activeRequest(): AgentHomeUserRequestItem | null {
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (item.id === this.activeRequestId) {
        return item;
      }
    }
    return null;
  }

  private isActivePermissionRequest(): boolean {
    const item = this.activeRequest();
    if (item === null) {
      return false;
    }
    return this.isPermissionRequest(item);
  }

  private isPermissionRequest(item: AgentHomeUserRequestItem): boolean {
    return item.kind === AgentHomeUserRequestKind.PERMISSION;
  }

  private isPendingPermissionRequest(item: AgentHomeUserRequestItem): boolean {
    return this.isPermissionRequest(item) && item.status.toLowerCase() === AgentHomeInteractionStatus.PENDING;
  }

  private hasPendingPermissionRequests(): boolean {
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.isPendingPermissionRequest(item)) {
        return true;
      }
    }
    return false;
  }

  private syncPermissionRequestFlowLight(): void {
    if (this.hasPendingPermissionRequests()) {
      const scenePreset: NGFHdsSceneFlowPreset = NGFHdsEffectPresetFactory.buildFlowLightScenePreset(true);
      this.permissionRequestFlowLightStopping = false;
      this.permissionRequestFlowLightController.setSceneParams(scenePreset.sceneParams);
      if (!this.permissionRequestFlowLightActive) {
        this.permissionRequestFlowLightController.start();
      }
      this.permissionRequestFlowLightActive = true;
      return;
    }
    this.stopPermissionRequestFlowLight();
  }

  private stopPermissionRequestFlowLight(): void {
    if (!this.permissionRequestFlowLightActive || this.permissionRequestFlowLightStopping) {
      this.permissionRequestFlowLightActive = false;
      return;
    }
    const scenePreset: NGFHdsSceneFlowPreset = NGFHdsEffectPresetFactory.buildFlowLightScenePreset(false);
    this.permissionRequestFlowLightStopping = true;
    this.permissionRequestFlowLightActive = false;
    this.permissionRequestFlowLightController.setSceneParams(scenePreset.sceneParams);
    this.permissionRequestFlowLightController.stop();
    this.permissionRequestFlowLightStopping = false;
  }

  private handlePermissionRequestFlowLightFinished(): void {
    if (this.permissionRequestFlowLightStopping) {
      return;
    }
    if (!this.hasPendingPermissionRequests()) {
      this.stopPermissionRequestFlowLight();
    }
  }

  private activePlan(): AgentHomePlanItem | null {
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (item.id === this.activePlanId) {
        return item;
      }
    }
    return null;
  }

  private latestComposerPlan(): AgentHomePlanItem | null {
    let latestPlan: AgentHomePlanItem | null = null;
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) && this.isAgentNameVisibleForSelectedFilter(item.agentName)) {
        if (latestPlan === null || item.updatedAt >= latestPlan.updatedAt) {
          latestPlan = item;
        }
      }
    }
    return latestPlan;
  }

  private shouldShowComposerPlanPanel(): boolean {
    return this.latestComposerPlan() !== null;
  }

  private toggleComposerPlanPanel(): void {
    const item = this.latestComposerPlan();
    if (item === null) {
      this.isComposerPlanPanelExpanded = false;
      return;
    }
    this.activePlanId = item.id;
    this.isComposerPlanPanelExpanded = !this.isComposerPlanPanelExpanded;
  }

  private composerPlanTitle(): string {
    const item = this.latestComposerPlan();
    if (item !== null) {
      return this.planTitle(item);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_plan_title'));
  }

  private composerPlanStatus(): string {
    const item = this.latestComposerPlan();
    if (item !== null) {
      return item.status;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private composerPlanContent(): string {
    const item = this.latestComposerPlan();
    if (item !== null) {
      if (item.content.length > 0) {
        return item.content;
      }
      if (item.rawJson.length > 0) {
        return item.rawJson;
      }
    }
    return this.resolveDetailEmptyText();
  }

  private composerPlanSteps(): Array<AgentHomePlanStep> {
    const item = this.latestComposerPlan();
    if (item !== null) {
      return this.planStepsForItem(item);
    }
    return [];
  }

  private visibleComposerPlanSteps(limit: number): Array<AgentHomePlanStep> {
    const item = this.latestComposerPlan();
    if (item !== null) {
      return this.visiblePlanStepsForItem(item, limit);
    }
    return [];
  }

  private composerPlanSummaryText(): string {
    const item = this.latestComposerPlan();
    const title = item !== null ? this.planTitle(item) :
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_plan_title'));
    return title + ' · ' + this.displayInteractionStatus(this.composerPlanStatus());
  }

  private toolDetailSheetDetents(): [SheetSize, SheetSize] {
    if (this.shouldShowActiveToolDiffDetail() && this.diffTextHasAtLeastLines(this.activeToolDiffText(), AGENT_HOME_DIFF_LARGE_LINE_THRESHOLD)) {
      return [SheetSize.LARGE, SheetSize.MEDIUM];
    }
    return [SheetSize.MEDIUM, SheetSize.LARGE];
  }

  private workspaceDiffDetailSheetDetents(): [SheetSize, SheetSize] {
    if (this.diffTextHasAtLeastLines(this.activeWorkspaceDiffText(), AGENT_HOME_DIFF_LARGE_LINE_THRESHOLD)) {
      return [SheetSize.LARGE, SheetSize.MEDIUM];
    }
    return [SheetSize.MEDIUM, SheetSize.LARGE];
  }

  private activeToolDetailTitle(): string {
    const item = this.activeToolCall();
    if (item) {
      return this.compactToolCallDisplayName(item);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_tool_detail_title'));
  }

  private activeToolDetailStatusText(): string {
    const item = this.activeToolCall();
    if (item) {
      return this.displayToolStatus(item.status);
    }
    return '';
  }

  private activeToolDetailSymbol(): Resource {
    const item = this.activeToolCall();
    if (item) {
      return this.symbolForToolCallStatus(item.status);
    }
    return $r('sys.symbol.slider_horizontal_2');
  }

  private activeToolDetailColor(): ResourceColor {
    const item = this.activeToolCall();
    if (item) {
      return this.colorForToolCallStatus(item.status);
    }
    return $r('app.color.text_secondary');
  }

  private activeToolDetailInputText(): string {
    const item = this.activeToolCall();
    if (item) {
      return item.inputText;
    }
    return '';
  }

  private activeToolDetailOutputText(): string {
    const item = this.activeToolCall();
    if (item) {
      return item.outputText;
    }
    return '';
  }

  private activeToolDetailErrorText(): string {
    const item = this.activeToolCall();
    if (item) {
      return item.errorText;
    }
    return '';
  }

  private activeToolDetailRawText(): string {
    const item = this.activeToolCall();
    if (item) {
      return item.rawJson;
    }
    return '';
  }

  private shouldShowActiveToolDiffDetail(): boolean {
    const item = this.activeToolCall();
    if (item === null) {
      return false;
    }
    if (!this.isEditToolCallName(this.displayToolName(item).toLowerCase())) {
      return false;
    }
    return this.activeToolDiffText().length > 0;
  }

  private activeToolDiffSummaryText(): string {
    const item = this.activeToolCall();
    if (item === null) {
      return this.resolveDetailEmptyText();
    }
    const path = this.extractCompactToolPath(item);
    if (path.length > 0) {
      return path;
    }
    return this.toolCallRawSummary(item);
  }

  private activeToolDiffLines(): Array<AgentHomeDiffLine> {
    const diffText = this.activeToolDiffText();
    if (diffText.length === 0) {
      return [];
    }
    return this.parseWorkspaceDiffLines(diffText);
  }

  private activeToolDiffText(): string {
    const item = this.activeToolCall();
    if (item === null) {
      return '';
    }
    let diffText = this.extractToolDiffTextFromSource(item.inputText);
    if (diffText.length > 0) {
      return diffText;
    }
    diffText = this.extractToolDiffTextFromSource(item.rawJson);
    if (diffText.length > 0) {
      return diffText;
    }
    diffText = this.extractToolDiffTextFromSource(item.outputText);
    if (diffText.length > 0) {
      return diffText;
    }
    return this.extractToolDiffTextFromSource(item.errorText);
  }

  private extractToolDiffTextFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    let value = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'diffText', 'diff');
    if (value.length === 0) {
      value = AgentBridgeIncomingParser.extractFirstStringProperty(source, 'patch', 'content');
    }
    if (value.length > 0) {
      return AgentBridgeIncomingParser.cleanJsonText(value);
    }
    const cleanSource = AgentBridgeIncomingParser.cleanJsonText(source);
    if (cleanSource.indexOf('*** Begin Patch') >= 0 || cleanSource.indexOf('@@') >= 0) {
      return cleanSource;
    }
    return '';
  }

  private userRequestTitle(item: AgentHomeUserRequestItem): string {
    if (item.title.length > 0) {
      return item.title;
    }
    if (this.isPermissionRequest(item)) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_permission_title'));
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_request_title'));
  }

  private planTitle(item: AgentHomePlanItem): string {
    if (item.title.length > 0) {
      return item.title;
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_plan_title'));
  }

  private activeRequestTitle(): string {
    const item = this.activeRequest();
    if (item) {
      return this.userRequestTitle(item);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_request_title'));
  }

  private activeRequestPrompt(): string {
    const item = this.activeRequest();
    if (item) {
      return item.prompt.length > 0 ? item.prompt : item.rawJson;
    }
    return '';
  }

  private activeRequestStatus(): string {
    const item = this.activeRequest();
    if (item) {
      return item.status;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private activeRequestRawDisplayText(): string {
    const item = this.activeRequest();
    if (item === null) {
      return '';
    }
    if (this.isPermissionRequest(item)) {
      return this.permissionRawDisplayText(item.rawJson);
    }
    return this.requestRawDisplayText(item.rawJson);
  }

  private requestRawDisplayText(source: string): string {
    const cleanSource = AgentBridgeIncomingParser.cleanJsonText(source).trim();
    if (cleanSource.length === 0) {
      return '';
    }
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const targetSource = payloadObject.length > 0 ? payloadObject : source;
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(targetSource, 'input');
    const questionSource = inputObject.length > 0 ? inputObject : targetSource;
    const questionObjects = AgentBridgeIncomingParser.extractObjectArray(questionSource, 'questions');
    const firstQuestion = questionObjects.length > 0 ? questionObjects[0] : '';
    const lines: Array<string> = [];
    this.appendRawDisplayLine(lines, 'event', AgentBridgeIncomingParser.extractStringProperty(source, 'event'));
    this.appendRawDisplayLine(lines, 'provider', this.extractRawPayloadField(payloadObject, source, 'providerId'));
    this.appendRawDisplayLine(lines, 'session', AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId'));
    this.appendRawDisplayLine(lines, 'requestId', this.extractRawPayloadField(payloadObject, source, 'requestId'));
    this.appendRawDisplayLine(lines, 'toolCallId', AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'toolCallId', 'id'));
    this.appendRawDisplayLine(lines, 'tool', AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'name', 'toolName'));
    this.appendRawDisplayLine(lines, 'status', this.extractRawPayloadField(payloadObject, source, 'status'));
    this.appendRawDisplayLine(lines, 'optionId', this.extractRawPayloadField(payloadObject, source, 'optionId'));
    this.appendRawDisplayLine(lines, 'title', this.extractRawPayloadField(payloadObject, source, 'title'));
    this.appendRawDisplayLine(lines, 'prompt', this.extractRawPayloadField(payloadObject, source, 'prompt'));
    if (firstQuestion.length > 0) {
      this.appendRawDisplayLine(lines, 'question.header', AgentBridgeIncomingParser.extractStringProperty(firstQuestion, 'header'));
      this.appendRawDisplayLine(lines, 'question.text', AgentBridgeIncomingParser.extractStringProperty(firstQuestion, 'question'));
      this.appendRawDisplayLine(lines, 'question.options', AgentBridgeIncomingParser.extractArrayProperty(firstQuestion, 'options'));
    } else {
      this.appendRawDisplayLine(lines, 'options', AgentBridgeIncomingParser.extractArrayProperty(targetSource, 'options'));
    }
    const createdAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'createdAt', 0);
    if (createdAt > 0) {
      lines.push('createdAt: ' + String(createdAt));
    }
    if (lines.length > 0) {
      return lines.join('\n');
    }
    return cleanSource;
  }

  private permissionRawDisplayText(source: string): string {
    const cleanSource = AgentBridgeIncomingParser.cleanJsonText(source).trim();
    if (cleanSource.length === 0) {
      return '';
    }
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'payload');
    const permissionObject = AgentBridgeIncomingParser.extractObjectProperty(payloadObject, 'permission');
    const targetSource = permissionObject.length > 0 ? permissionObject :
      (payloadObject.length > 0 ? payloadObject : source);
    const metadataObject = AgentBridgeIncomingParser.extractObjectProperty(targetSource, 'metadata');
    const lines: Array<string> = [];
    this.appendRawDisplayLine(lines, 'event', AgentBridgeIncomingParser.extractStringProperty(source, 'event'));
    this.appendRawDisplayLine(lines, 'provider', this.extractRawPayloadField(payloadObject, source, 'providerId'));
    this.appendRawDisplayLine(lines, 'session', AgentBridgeIncomingParser.extractStringProperty(source, 'sessionId'));
    this.appendRawDisplayLine(lines, 'requestId', this.extractRawPayloadField(payloadObject, source, 'requestId'));
    this.appendRawDisplayLine(lines, 'permissionId', this.extractRawPayloadField(payloadObject, source, 'permissionId'));
    this.appendRawDisplayLine(lines, 'status', this.extractRawPayloadField(payloadObject, source, 'status'));
    this.appendRawDisplayLine(lines, 'reply', this.extractRawPayloadField(payloadObject, source, 'reply'));
    this.appendRawDisplayLine(lines, 'optionId', this.extractRawPayloadField(payloadObject, source, 'optionId'));
    this.appendRawDisplayLine(
      lines,
      'permission',
      AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'permission', 'type')
    );
    this.appendRawDisplayLine(lines, 'action', AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'action', 'name'));
    this.appendRawDisplayLine(lines, 'tool', AgentBridgeIncomingParser.extractFirstStringProperty(targetSource, 'toolName', 'tool'));
    this.appendRawDisplayLine(lines, 'command', this.permissionCommandValue(targetSource, metadataObject));
    this.appendRawDisplayLine(lines, 'path', this.permissionRawPathValue(targetSource, metadataObject));
    this.appendRawDisplayLine(lines, 'patterns', AgentBridgeIncomingParser.extractArrayProperty(targetSource, 'patterns'));
    this.appendRawDisplayLine(lines, 'prompt', this.extractRawPayloadField(payloadObject, source, 'prompt'));
    const createdAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'createdAt', 0);
    if (createdAt > 0) {
      lines.push('createdAt: ' + String(createdAt));
    }
    if (lines.length > 0) {
      return lines.join('\n');
    }
    return cleanSource;
  }

  private extractRawPayloadField(payloadObject: string, source: string, key: string): string {
    const payloadValue = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(payloadObject, key));
    if (payloadValue.length > 0) {
      return payloadValue;
    }
    return this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, key));
  }

  private permissionRawPathValue(targetSource: string, metadataObject: string): string {
    const metadataPath = this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'filePath')),
      this.firstNonEmptyText(
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'path')),
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(metadataObject, 'directory'))
      )
    );
    if (metadataPath.length > 0) {
      return metadataPath;
    }
    return this.firstNonEmptyText(
      this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'filePath')),
      this.firstNonEmptyText(
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'path')),
        this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(targetSource, 'directory'))
      )
    );
  }

  private appendRawDisplayLine(lines: Array<string>, label: string, value: string): void {
    const cleanValue = this.cleanPermissionField(value);
    if (cleanValue.length === 0) {
      return;
    }
    lines.push(label + ': ' + cleanValue);
  }

  private activeRequestOptions(): Array<AgentHomeRequestOptionItem> {
    const item = this.activeRequest();
    if (!item || item.optionsJson.length === 0) {
      return [];
    }
    return this.parseRequestOptions(item.optionsJson);
  }

  private activePlanTitle(): string {
    const item = this.activePlan();
    if (item) {
      return this.planTitle(item);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_plan_title'));
  }

  private activePlanContent(): string {
    const item = this.activePlan();
    if (item) {
      return item.content;
    }
    return '';
  }

  private activePlanStatus(): string {
    const item = this.activePlan();
    if (item) {
      return item.status;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private activePlanSteps(): Array<AgentHomePlanStep> {
    const item = this.activePlan();
    if (item) {
      return this.planStepsForItem(item);
    }
    return [];
  }

  private planStepsForItem(item: AgentHomePlanItem): Array<AgentHomePlanStep> {
    return this.parsePlanSteps(item.content, item.id);
  }

  private visiblePlanStepsForItem(item: AgentHomePlanItem, limit: number): Array<AgentHomePlanStep> {
    const source = this.planStepsForItem(item);
    if (limit <= 0 || source.length <= limit) {
      return source;
    }
    const result: Array<AgentHomePlanStep> = [];
    for (let index = 0; index < source.length && index < limit; index++) {
      result.push(source[index]);
    }
    return result;
  }

  private parsePlanSteps(content: string, ownerId: string): Array<AgentHomePlanStep> {
    const items: Array<AgentHomePlanStep> = [];
    const normalizedContent = this.normalizedPlanContentSource(content);
    let objects = AgentBridgeIncomingParser.extractObjectArray(normalizedContent, 'plan');
    if (objects.length === 0) {
      const planText = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractStringProperty(normalizedContent, 'plan')
      ).trim();
      if (planText.startsWith('[')) {
        objects = AgentBridgeIncomingParser.extractObjectArray('{"plan":' + planText + '}', 'plan');
      }
    }
    if (objects.length === 0 && normalizedContent.startsWith('[')) {
      objects = AgentBridgeIncomingParser.extractObjectArray('{"plan":' + normalizedContent + '}', 'plan');
    }
    for (let index = 0; index < objects.length; index++) {
      const objectText = objects[index];
      const title = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(objectText, 'step', 'title')
      ).trim();
      if (title.length === 0) {
        continue;
      }
      const rawStatus = AgentBridgeIncomingParser.extractStringProperty(objectText, 'status');
      items.push(new AgentHomePlanStep(
        'plan_step_' + this.safeIdPart(ownerId) + '_' + String(index),
        index + 1,
        title,
        this.normalizePlanStepStatus(rawStatus)
      ));
    }
    if (items.length === 0) {
      return this.parsePlanStepsByKeyScan(normalizedContent, ownerId);
    }
    return items;
  }

  private normalizedPlanContentSource(content: string): string {
    let value = AgentBridgeIncomingParser.cleanJsonText(content).trim();
    value = this.stripPlanMarkdownFence(value);
    if (value.length >= 2 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = AgentBridgeIncomingParser.cleanJsonText(value.substring(1, value.length - 1)).trim();
      value = this.stripPlanMarkdownFence(value);
    }
    return value;
  }

  private stripPlanMarkdownFence(content: string): string {
    if (!content.startsWith('```')) {
      return content;
    }
    const firstLineEnd = content.indexOf('\n');
    if (firstLineEnd < 0) {
      return content;
    }
    const fenceEnd = content.lastIndexOf('```');
    if (fenceEnd <= firstLineEnd) {
      return content.substring(firstLineEnd + 1).trim();
    }
    return content.substring(firstLineEnd + 1, fenceEnd).trim();
  }

  private parsePlanStepsByKeyScan(content: string, ownerId: string): Array<AgentHomePlanStep> {
    const items: Array<AgentHomePlanStep> = [];
    let searchStart = 0;
    while (searchStart >= 0 && searchStart < content.length && items.length < 80) {
      const stepIndex = this.nextPlanStepKeyIndex(content, searchStart);
      if (stepIndex < 0) {
        break;
      }
      const nextStepIndex = this.nextPlanStepKeyIndex(content, stepIndex + 6);
      const segmentEnd = nextStepIndex > stepIndex ? nextStepIndex : content.length;
      const segment = content.substring(stepIndex, segmentEnd);
      const title = AgentBridgeIncomingParser.cleanJsonText(
        AgentBridgeIncomingParser.extractFirstStringProperty(segment, 'step', 'title')
      ).trim();
      if (title.length > 0) {
        const rawStatus = AgentBridgeIncomingParser.extractStringProperty(segment, 'status');
        items.push(new AgentHomePlanStep(
          'plan_step_' + this.safeIdPart(ownerId) + '_scan_' + String(items.length),
          items.length + 1,
          title,
          this.normalizePlanStepStatus(rawStatus)
        ));
      }
      if (nextStepIndex <= stepIndex) {
        break;
      }
      searchStart = nextStepIndex;
    }
    return items;
  }

  private nextPlanStepKeyIndex(content: string, searchStart: number): number {
    const stepIndex = content.indexOf('"step"', searchStart);
    const titleIndex = content.indexOf('"title"', searchStart);
    if (stepIndex < 0) {
      return titleIndex;
    }
    if (titleIndex < 0) {
      return stepIndex;
    }
    return Math.min(stepIndex, titleIndex);
  }

  private normalizePlanStepStatus(status: string): string {
    const value = status.toLowerCase();
    if (value === 'completed' || value === 'complete' || value === 'done' || value === 'implemented') {
      return AgentHomeInteractionStatus.IMPLEMENTED;
    }
    if (value === 'in_progress' || value === 'in-progress' || value === 'running' || value === 'active') {
      return AgentHomeInteractionStatus.IMPLEMENTING;
    }
    if (value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled') {
      return AgentHomeInteractionStatus.ERROR;
    }
    return AgentHomeInteractionStatus.PENDING;
  }

  private displayPlanStepStatus(status: string): string {
    return this.displayInteractionStatus(this.normalizePlanStepStatus(status));
  }

  private symbolForPlanStepStatus(status: string): Resource {
    const normalized = this.normalizePlanStepStatus(status);
    if (normalized === AgentHomeInteractionStatus.IMPLEMENTED) {
      return $r('sys.symbol.checkmark_circle');
    }
    if (normalized === AgentHomeInteractionStatus.ERROR || normalized === AgentHomeInteractionStatus.REJECTED) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    return $r('sys.symbol.circle');
  }

  private colorForPlanStepStatus(status: string): ResourceColor {
    return this.colorForInteractionStatus(this.normalizePlanStepStatus(status));
  }

  private planFallbackDisplayContent(content: string): string {
    const normalized = this.normalizedPlanContentSource(content);
    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      return this.resolveDetailEmptyText();
    }
    if (normalized.length > 0) {
      return normalized;
    }
    return this.resolveDetailEmptyText();
  }

  private parseRequestOptions(optionsJson: string): Array<AgentHomeRequestOptionItem> {
    const source = '{"options":' + optionsJson + '}';
    const objects = AgentBridgeIncomingParser.extractObjectArray(source, 'options');
    const items: Array<AgentHomeRequestOptionItem> = [];
    for (let index = 0; index < objects.length; index++) {
      const objectText = objects[index];
      const label = AgentBridgeIncomingParser.extractStringProperty(objectText, 'label');
      const fallbackId = AgentBridgeIncomingParser.extractStringProperty(objectText, 'id');
      const itemLabel = label.length > 0 ? label : fallbackId;
      if (itemLabel.length === 0) {
        continue;
      }
      const itemId = fallbackId.length > 0 ? fallbackId : itemLabel;
      items.push(new AgentHomeRequestOptionItem(
        itemId,
        itemLabel,
        AgentBridgeIncomingParser.extractStringProperty(objectText, 'description')
      ));
    }
    return items;
  }

  private displayInteractionStatus(status: string): string {
    const hostContext = this.getUIContext().getHostContext();
    const value = status.toLowerCase();
    if (value === AgentHomeInteractionStatus.ANSWERED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_request_status_answered'));
    }
    if (value === AgentHomePermissionStatus.ALLOWED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_permission_status_allowed'));
    }
    if (value === AgentHomeInteractionStatus.DISMISSED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_request_status_dismissed'));
    }
    if (value === AgentHomeInteractionStatus.REJECTED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_plan_status_rejected'));
    }
    if (value === AgentHomeInteractionStatus.IMPLEMENTING) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_plan_status_implementing'));
    }
    if (value === AgentHomeInteractionStatus.IMPLEMENTED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_plan_status_implemented'));
    }
    if (value === AgentHomeInteractionStatus.ERROR) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_tool_status_error'));
    }
    return resolveResourceString(hostContext, $r('app.string.agent_home_request_status_pending'));
  }

  private symbolForInteractionStatus(status: string): Resource {
    const value = status.toLowerCase();
    if (value === AgentHomeInteractionStatus.ANSWERED || value === AgentHomeInteractionStatus.IMPLEMENTED ||
      value === AgentHomePermissionStatus.ALLOWED) {
      return $r('sys.symbol.checkmark_circle');
    }
    if (value === AgentHomeInteractionStatus.REJECTED || value === AgentHomeInteractionStatus.ERROR) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    return $r('sys.symbol.questionmark_circle');
  }

  private colorForInteractionStatus(status: string): ResourceColor {
    const value = status.toLowerCase();
    if (value === AgentHomeInteractionStatus.REJECTED || value === AgentHomeInteractionStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    if (value === AgentHomeInteractionStatus.ANSWERED || value === AgentHomeInteractionStatus.IMPLEMENTED ||
      value === AgentHomePermissionStatus.ALLOWED) {
      return $r('app.color.text_secondary');
    }
    return $r('app.color.text_body');
  }

  private permissionStatusAccentColor(status: string): ResourceColor {
    const value = status.toLowerCase();
    if (value === AgentHomeInteractionStatus.REJECTED || value === AgentHomeInteractionStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    return $r('app.color.tag_green');
  }

  private permissionRequestAccentColor(item: AgentHomeUserRequestItem): ResourceColor {
    return this.permissionStatusAccentColor(item.status);
  }

  private permissionRequestIconBackgroundColor(item: AgentHomeUserRequestItem): ResourceColor {
    const value = item.status.toLowerCase();
    if (value === AgentHomeInteractionStatus.REJECTED || value === AgentHomeInteractionStatus.ERROR) {
      return this.isDarkMode ? '#33DC2626' : $r('app.color.background_error');
    }
    return this.isDarkMode ? '#3322C55E' : $r('app.color.background_success');
  }

  private permissionRequestBorderColor(
    item: AgentHomeUserRequestItem,
    surfacePreset: NGFHdsInteractiveEffectPreset
  ): ResourceColor {
    const value = item.status.toLowerCase();
    if (value === AgentHomeInteractionStatus.REJECTED || value === AgentHomeInteractionStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    if (this.isPendingPermissionRequest(item) || value === AgentHomePermissionStatus.ALLOWED) {
      return $r('app.color.tag_green');
    }
    return surfacePreset.borderColor;
  }

  private permissionAllowButtonBackgroundColor(item: AgentHomeUserRequestItem | null = null): ResourceColor {
    if (item !== null && !this.isPendingPermissionRequest(item)) {
      return $r('app.color.background_secondary');
    }
    return $r('app.color.tag_green');
  }

  private permissionDenyButtonBackgroundColor(): ResourceColor {
    return $r('app.color.tag_red');
  }


  private activeRequestHeaderIconColor(): ResourceColor {
    const item = this.activeRequest();
    if (item !== null && this.isPermissionRequest(item)) {
      return this.permissionStatusAccentColor(item.status);
    }
    return this.colorForInteractionStatus(this.activeRequestStatus());
  }


  private activateUserRequest(item: AgentHomeUserRequestItem): void {
    this.activeRequestId = item.id;
    this.selectedRequestOptionId = item.selectedOptionId;
    this.requestAnswerDraft = item.answer;
  }

  private openUserRequestSheet(item: AgentHomeUserRequestItem): void {
    this.activateUserRequest(item);
    this.openSheet(AgentHomeSheetKey.REQUEST_DETAIL);
  }

  private bridgeSessionIdForRequestItem(item: AgentHomeUserRequestItem): string {
    const requestBridgeSessionId = this.bridgeSessionIdForLocalSession(item.sessionId);
    if (requestBridgeSessionId.length > 0) {
      return requestBridgeSessionId;
    }
    const currentBridgeSessionId = this.currentBridgeSessionId();
    if (currentBridgeSessionId.length > 0) {
      return currentBridgeSessionId;
    }
    return item.sessionId;
  }

  private permissionRequestIdForRequest(item: AgentHomeUserRequestItem): string {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(item.rawJson, 'payload');
    const requestId = this.extractRawPayloadField(payloadObject, item.rawJson, 'requestId');
    if (requestId.length > 0) {
      return requestId;
    }
    return item.requestId;
  }

  private permissionIdForRequest(item: AgentHomeUserRequestItem): string {
    const payloadObject = AgentBridgeIncomingParser.extractObjectProperty(item.rawJson, 'payload');
    const permissionId = this.extractRawPayloadField(payloadObject, item.rawJson, 'permissionId');
    if (permissionId.length > 0) {
      return permissionId;
    }
    return this.permissionRequestIdForRequest(item);
  }

  private allowPermissionOnceFromRow(item: AgentHomeUserRequestItem): void {
    if (!this.isPendingPermissionRequest(item)) {
      return;
    }
    this.activateUserRequest(item);
    this.respondToPermissionRequest(item, AgentHomePermissionReply.ONCE);
  }

  private canSubmitActiveRequest(): boolean {
    const item = this.activeRequest();
    if (!item || item.status !== AgentHomeInteractionStatus.PENDING) {
      return false;
    }
    if (this.isPermissionRequest(item)) {
      return false;
    }
    return this.selectedRequestOptionId.length > 0 || this.requestAnswerDraft.trim().length > 0;
  }

  private submitActiveRequest(): void {
    const item = this.activeRequest();
    if (!item || !this.canSubmitActiveRequest()) {
      return;
    }
    const answer = this.requestAnswerDraft.trim();
    const responseSessionId = this.bridgeSessionIdForRequestItem(item);
    this.updateUserRequestStatus(item, AgentHomeInteractionStatus.ANSWERED, answer, this.selectedRequestOptionId);
    this.client.respondRequest(
      item.providerId,
      responseSessionId,
      item.requestId,
      this.selectedRequestOptionId,
      answer,
      answer
    );
    this.closeSheet();
  }

  private canRespondActivePermission(): boolean {
    const item = this.activeRequest();
    if (item === null) {
      return false;
    }
    return this.isPendingPermissionRequest(item);
  }

  private respondToActivePermission(reply: string): void {
    const item = this.activeRequest();
    if (item === null || !this.canRespondActivePermission()) {
      return;
    }
    this.respondToPermissionRequest(item, reply);
  }

  private respondToPermissionRequest(item: AgentHomeUserRequestItem, reply: string): void {
    if (!this.isPendingPermissionRequest(item)) {
      return;
    }
    const answer = item.id === this.activeRequestId ? this.requestAnswerDraft.trim() : item.answer.trim();
    const nextStatus = reply === AgentHomePermissionReply.REJECT ? AgentHomeInteractionStatus.REJECTED : AgentHomePermissionStatus.ALLOWED;
    const responseSessionId = this.bridgeSessionIdForRequestItem(item);
    const requestId = this.permissionRequestIdForRequest(item);
    const permissionId = this.permissionIdForRequest(item);
    this.updateUserRequestStatus(item, nextStatus, answer, reply);
    this.client.respondPermission(
      item.providerId,
      responseSessionId,
      requestId,
      permissionId,
      reply,
      answer
    );
    this.closeSheet();
  }

  private dismissActiveRequest(): void {
    const item = this.activeRequest();
    if (!item) {
      return;
    }
    if (!this.isPermissionRequest(item) && item.status === AgentHomeInteractionStatus.PENDING) {
      this.client.respondRequest(
        item.providerId,
        this.bridgeSessionIdForRequestItem(item),
        item.requestId,
        AgentHomeInteractionStatus.DISMISSED,
        '',
        ''
      );
    }
    this.updateUserRequestStatus(item, AgentHomeInteractionStatus.DISMISSED, '', AgentHomeInteractionStatus.DISMISSED);
    this.closeSheet();
  }

  private updateUserRequestStatus(
    source: AgentHomeUserRequestItem,
    status: string,
    answer: string,
    optionId: string
  ): void {
    const now = Date.now();
    const item = new AgentHomeUserRequestItem(
      source.id,
      source.sessionId,
      source.providerId,
      source.requestId,
      source.kind,
      source.title,
      source.prompt,
      source.optionsJson,
      source.allowFreeText,
      status,
      answer,
      optionId,
      source.rawJson,
      source.createdAt,
      now,
      source.agentName
    );
    const nextItems: Array<AgentHomeUserRequestItem> = [];
    for (let index = 0; index < this.userRequests.length; index++) {
      nextItems.push(this.userRequests[index].id === source.id ? item : this.userRequests[index]);
    }
    this.userRequests = nextItems;
    this.syncPermissionRequestFlowLight();
    this.persistence.saveUserRequest(item).catch((error: Error): void => {
      logger.error(TAG, 'persist request response failed: ' + this.errorToString(error));
    });
    if (status !== AgentHomeInteractionStatus.PENDING) {
      this.cancelAgentRequestNotification();
    }
  }

  private respondToPlan(source: AgentHomePlanItem, nextStatus: string): void {
    const reply = nextStatus === AgentHomeInteractionStatus.REJECTED ? 'reject' : 'implement';
    this.updatePlanStatus(source, nextStatus);
    this.client.respondPlan(source.providerId, this.bridgeSessionIdForPlanItem(source), source.planId, reply, '');
    if (nextStatus === AgentHomeInteractionStatus.IMPLEMENTING) {
      this.agentRunMode = AgentHomeRunMode.GOAL;
    }
    this.closeSheet();
  }

  private bridgeSessionIdForPlanItem(item: AgentHomePlanItem): string {
    const planBridgeSessionId = this.bridgeSessionIdForLocalSession(item.sessionId);
    if (planBridgeSessionId.length > 0) {
      return planBridgeSessionId;
    }
    const currentBridgeSessionId = this.currentBridgeSessionId();
    if (currentBridgeSessionId.length > 0) {
      return currentBridgeSessionId;
    }
    return item.sessionId;
  }

  private updatePlanStatus(source: AgentHomePlanItem, status: string): void {
    const now = Date.now();
    const item = new AgentHomePlanItem(
      source.id,
      source.sessionId,
      source.workspaceId,
      source.providerId,
      source.planId,
      source.title,
      source.content,
      status,
      source.rawJson,
      source.createdAt,
      now,
      source.agentName
    );
    const nextItems: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < this.plans.length; index++) {
      nextItems.push(this.plans[index].id === source.id ? item : this.plans[index]);
    }
    this.plans = nextItems;
    this.persistence.savePlan(item).catch((error: Error): void => {
      logger.error(TAG, 'persist plan response failed: ' + this.errorToString(error));
    });
    if (status !== AgentHomeInteractionStatus.PENDING) {
      this.cancelAgentRequestNotification();
    }
  }

  private displayToolName(item: AgentHomeToolCallItem): string {
    if (item.name.length > 0) {
      return item.name;
    }
    return item.toolCallId;
  }

  private compactToolCallLine(item: AgentHomeToolCallItem): string {
    const title = this.compactToolCallDisplayName(item);
    const detail = this.compactToolCallDetail(item);
    if (detail.length > 0) {
      return title + ' ' + detail;
    }
    return title;
  }

  private compactToolCallDisplayName(item: AgentHomeToolCallItem): string {
    const toolName = this.displayToolName(item);
    const normalizedName = toolName.toLowerCase();
    if (this.isEditToolCallName(normalizedName)) {
      return 'Edit';
    }
    if (this.isShellToolCallName(normalizedName)) {
      return 'Shell';
    }
    if (toolName.length > 0) {
      return this.compactInlineToolText(toolName);
    }
    return 'Tool';
  }

  private compactToolCallDetail(item: AgentHomeToolCallItem): string {
    const toolName = this.displayToolName(item).toLowerCase();
    let detail = '';
    if (this.isShellToolCallName(toolName)) {
      detail = this.extractCompactToolCommand(item);
    } else if (this.isEditToolCallName(toolName)) {
      detail = this.extractCompactToolPath(item);
    }
    if (detail.length === 0) {
      detail = this.toolCallRawSummary(item);
    }
    if (detail.length === 0 && item.errorText.length > 0) {
      detail = item.errorText;
    }
    if (detail.length === 0 && item.inputText.length > 0 && item.inputText !== '{}') {
      detail = item.inputText;
    }
    return this.compactInlineToolText(detail);
  }

  private isShellToolCallName(normalizedName: string): boolean {
    return normalizedName.indexOf('shell') >= 0 ||
      normalizedName.indexOf('command') >= 0 ||
      normalizedName.indexOf('terminal') >= 0 ||
      normalizedName.indexOf('exec') >= 0;
  }

  private isEditToolCallName(normalizedName: string): boolean {
    return normalizedName.indexOf('apply_patch') >= 0 ||
      normalizedName.indexOf('patch') >= 0 ||
      normalizedName.indexOf('edit') >= 0 ||
      normalizedName.indexOf('write') >= 0;
  }

  private extractCompactToolCommand(item: AgentHomeToolCallItem): string {
    let command = this.extractCompactToolCommandFromSource(item.inputText);
    if (command.length > 0) {
      return command;
    }
    command = this.extractCompactToolCommandFromSource(item.rawJson);
    if (command.length > 0) {
      return command;
    }
    return this.toolCallRawSummary(item);
  }

  private extractCompactToolCommandFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    let command = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'command'));
    if (command.length > 0) {
      return command;
    }
    command = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'cmd'));
    if (command.length > 0) {
      return command;
    }
    command = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'script'));
    if (command.length > 0) {
      return command;
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'input');
    if (inputObject.length > 0 && inputObject !== source) {
      command = this.extractCompactToolCommandFromSource(inputObject);
      if (command.length > 0) {
        return command;
      }
    }
    return '';
  }

  private extractCompactToolPath(item: AgentHomeToolCallItem): string {
    let path = this.extractCompactToolPathFromSource(item.inputText);
    if (path.length > 0) {
      return path;
    }
    path = this.extractCompactToolPathFromSource(item.rawJson);
    if (path.length > 0) {
      return path;
    }
    path = this.extractPatchTargetPath(item.inputText);
    if (path.length > 0) {
      return path;
    }
    return this.extractPatchTargetPath(item.rawJson);
  }

  private extractCompactToolPathFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    const directSummary = this.extractDirectToolSummaryFromSource(source);
    if (directSummary.length > 0) {
      return directSummary;
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'input');
    if (inputObject.length > 0 && inputObject !== source) {
      return this.extractCompactToolPathFromSource(inputObject);
    }
    return '';
  }

  private extractPatchTargetPath(source: string): string {
    if (source.length === 0) {
      return '';
    }
    let path = this.extractPatchTargetPathAfterMarker(source, '*** Update File: ');
    if (path.length > 0) {
      return path;
    }
    path = this.extractPatchTargetPathAfterMarker(source, '*** Add File: ');
    if (path.length > 0) {
      return path;
    }
    return this.extractPatchTargetPathAfterMarker(source, '*** Delete File: ');
  }

  private extractPatchTargetPathAfterMarker(source: string, marker: string): string {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) {
      return '';
    }
    const valueStart = markerIndex + marker.length;
    let valueEnd = source.indexOf('\n', valueStart);
    const escapedLineEnd = source.indexOf('\\n', valueStart);
    if (escapedLineEnd >= 0 && (valueEnd < 0 || escapedLineEnd < valueEnd)) {
      valueEnd = escapedLineEnd;
    }
    if (valueEnd < 0) {
      valueEnd = source.length;
    }
    return this.cleanPermissionField(source.substring(valueStart, valueEnd));
  }

  private compactInlineToolText(value: string): string {
    let text = AgentBridgeIncomingParser.cleanJsonText(value)
      .split('\r\n').join(' ')
      .split('\n').join(' ')
      .split('\r').join(' ')
      .trim();
    while (text.indexOf('  ') >= 0) {
      text = text.split('  ').join(' ');
    }
    if (text.length > 180) {
      return text.substring(0, 180) + '...';
    }
    return text;
  }

  private displayToolStatus(status: string): string {
    const normalized = this.normalizeToolCallStatus(status);
    const hostContext = this.getUIContext().getHostContext();
    if (normalized === AgentHomeToolCallStatus.ERROR) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_tool_status_error'));
    }
    if (normalized === AgentHomeToolCallStatus.COMPLETED) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_tool_status_completed'));
    }
    return resolveResourceString(hostContext, $r('app.string.agent_home_tool_status_running'));
  }

  private toolCallSummary(item: AgentHomeToolCallItem): string {
    if (item.errorText.length > 0) {
      return item.errorText;
    }
    if (item.outputText.length > 0) {
      return item.outputText;
    }
    if (item.inputText.length > 0 && item.inputText !== '{}') {
      return item.inputText;
    }
    const rawSummary = this.toolCallRawSummary(item);
    if (rawSummary.length > 0) {
      return rawSummary;
    }
    return item.toolCallId;
  }

  private shouldShowToolCallSummary(item: AgentHomeToolCallItem): boolean {
    const normalized = this.normalizeToolCallStatus(item.status);
    if (normalized === AgentHomeToolCallStatus.ERROR) {
      return true;
    }
    if (normalized === AgentHomeToolCallStatus.RUNNING) {
      return true;
    }
    return item.outputText.length > 0 || item.inputText.length > 0 || this.toolCallRawSummary(item).length > 0;
  }

  private toolCallRawSummary(item: AgentHomeToolCallItem): string {
    const inputSummary = this.extractToolSummaryFromSource(item.inputText);
    if (inputSummary.length > 0) {
      return inputSummary;
    }
    const rawSummary = this.extractToolSummaryFromSource(item.rawJson);
    if (rawSummary.length > 0) {
      return rawSummary;
    }
    const stateObject = AgentBridgeIncomingParser.extractObjectProperty(item.rawJson, 'state');
    const stateSummary = this.extractToolSummaryFromSource(stateObject);
    if (stateSummary.length > 0) {
      return stateSummary;
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(stateObject, 'input');
    return this.extractToolSummaryFromSource(inputObject);
  }

  private extractToolSummaryFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    const directSummary = this.extractDirectToolSummaryFromSource(source);
    if (directSummary.length > 0) {
      return directSummary;
    }
    const inputObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'input');
    const inputSummary = this.extractDirectToolSummaryFromSource(inputObject);
    if (inputSummary.length > 0) {
      return inputSummary;
    }
    const argsObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'args');
    const argsSummary = this.extractDirectToolSummaryFromSource(argsObject);
    if (argsSummary.length > 0) {
      return argsSummary;
    }
    const argumentsObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'arguments');
    const argumentsSummary = this.extractDirectToolSummaryFromSource(argumentsObject);
    if (argumentsSummary.length > 0) {
      return argumentsSummary;
    }
    const parametersObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'parameters');
    const parametersSummary = this.extractDirectToolSummaryFromSource(parametersObject);
    if (parametersSummary.length > 0) {
      return parametersSummary;
    }
    const metadataObject = AgentBridgeIncomingParser.extractObjectProperty(source, 'metadata');
    const metadataSummary = this.extractDirectToolSummaryFromSource(metadataObject);
    if (metadataSummary.length > 0) {
      return metadataSummary;
    }
    const commandArray = AgentBridgeIncomingParser.extractArrayProperty(source, 'command');
    if (commandArray.length > 0) {
      return commandArray;
    }
    const patternsArray = AgentBridgeIncomingParser.extractArrayProperty(source, 'patterns');
    if (patternsArray.length > 0) {
      return patternsArray;
    }
    const filesArray = AgentBridgeIncomingParser.extractArrayProperty(source, 'files');
    if (filesArray.length > 0) {
      return filesArray;
    }
    return '';
  }

  private extractDirectToolSummaryFromSource(source: string): string {
    if (source.length === 0 || source === '{}') {
      return '';
    }
    const filePath = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'filePath'));
    if (filePath.length > 0) {
      return filePath;
    }
    const path = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'path'));
    if (path.length > 0) {
      return path;
    }
    const relativePath = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'relativePath'));
    if (relativePath.length > 0) {
      return relativePath;
    }
    const file = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'file'));
    if (file.length > 0) {
      return file;
    }
    const directory = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'directory'));
    if (directory.length > 0) {
      return directory;
    }
    const cwd = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'cwd'));
    if (cwd.length > 0) {
      return cwd;
    }
    const command = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'command'));
    if (command.length > 0) {
      return command;
    }
    const query = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'query'));
    if (query.length > 0) {
      return query;
    }
    const pattern = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'pattern'));
    if (pattern.length > 0) {
      return pattern;
    }
    const glob = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'glob'));
    if (glob.length > 0) {
      return glob;
    }
    const target = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'target'));
    if (target.length > 0) {
      return target;
    }
    const url = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'url'));
    if (url.length > 0) {
      return url;
    }
    const uri = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'uri'));
    if (uri.length > 0) {
      return uri;
    }
    const title = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'title'));
    if (title.length > 0) {
      return title;
    }
    const description = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'description'));
    if (description.length > 0) {
      return description;
    }
    const message = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'message'));
    if (message.length > 0) {
      return message;
    }
    const text = this.cleanPermissionField(AgentBridgeIncomingParser.extractStringProperty(source, 'text'));
    if (text.length > 0) {
      return text;
    }
    return '';
  }

  private symbolForToolCallStatus(status: string): Resource {
    const normalized = this.normalizeToolCallStatus(status);
    if (normalized === AgentHomeToolCallStatus.ERROR) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    if (normalized === AgentHomeToolCallStatus.COMPLETED) {
      return $r('sys.symbol.checkmark_circle');
    }
    return $r('sys.symbol.slider_horizontal_2');
  }

  private symbolForCompactToolCall(item: AgentHomeToolCallItem): Resource {
    if (this.normalizeToolCallStatus(item.status) === AgentHomeToolCallStatus.ERROR) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    if (this.isEditToolCallName(this.displayToolName(item).toLowerCase())) {
      return $r('sys.symbol.AI_pencil');
    }
    if (this.isShellToolCallName(this.displayToolName(item).toLowerCase())) {
      return $r('sys.symbol.code');
    }
    return $r('sys.symbol.slider_horizontal_2');
  }

  private colorForToolCallStatus(status: string): ResourceColor {
    const normalized = this.normalizeToolCallStatus(status);
    if (normalized === AgentHomeToolCallStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    if (normalized === AgentHomeToolCallStatus.COMPLETED) {
      return $r('app.color.text_secondary');
    }
    return $r('app.color.text_body');
  }

  private colorForCompactToolCall(item: AgentHomeToolCallItem): ResourceColor {
    if (this.normalizeToolCallStatus(item.status) === AgentHomeToolCallStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    return $r('app.color.text_secondary');
  }

  private colorForCompactToolCallText(item: AgentHomeToolCallItem): ResourceColor {
    if (this.normalizeToolCallStatus(item.status) === AgentHomeToolCallStatus.ERROR) {
      return $r('app.color.text_secondary');
    }
    return $r('app.color.text_secondary');
  }

  private backgroundForToolCallStatus(status: string): ResourceColor {
    if (this.normalizeToolCallStatus(status) === AgentHomeToolCallStatus.ERROR) {
      return $r('app.color.background_error');
    }
    return $r('app.color.background_surface');
  }

  private borderForToolCallStatus(status: string): ResourceColor {
    if (this.normalizeToolCallStatus(status) === AgentHomeToolCallStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    return $r('app.color.card_border');
  }

  private symbolForWorkspaceChange(item: AgentHomeWorkspaceChangeItem): Resource {
    if (this.isWorkspaceDirectoryChange(item)) {
      return $r('sys.symbol.folder');
    }
    if (this.isWorkspaceChangeAdded(item)) {
      return $r('sys.symbol.plus');
    }
    if (this.isWorkspaceChangeDeleted(item)) {
      return $r('sys.symbol.trash');
    }
    if (this.isWorkspaceChangeRenamed(item)) {
      return $r('sys.symbol.arrow_left_arrow_right');
    }
    return $r('sys.symbol.AI_pencil');
  }

  private workspaceChangeStatusColor(item: AgentHomeWorkspaceChangeItem): ResourceColor {
    if (this.isWorkspaceChangeAdded(item)) {
      return $r('app.color.tag_green');
    }
    if (this.isWorkspaceChangeDeleted(item)) {
      return $r('app.color.tag_red');
    }
    if (this.isWorkspaceChangeRenamed(item)) {
      return $r('app.color.tag_blue');
    }
    return this.agentHomeReadableSecondaryColor();
  }

  private workspaceChangeCompactStatusText(item: AgentHomeWorkspaceChangeItem): string {
    const deltaText = this.workspaceChangeLineDeltaText(item);
    if (deltaText.length === 0) {
      return this.workspaceChangeActionText(item);
    }
    return this.workspaceChangeActionText(item) + ' ' + deltaText;
  }

  private workspaceChangeLineDeltaText(item: AgentHomeWorkspaceChangeItem): string {
    let text = '';
    if (this.isWorkspaceDirectoryChange(item)) {
      text = this.workspaceChangeFileCountText(item);
    }
    if (item.additions > 0) {
      if (text.length > 0) {
        text = text + ' ';
      }
      text = text + '+' + String(item.additions);
    }
    if (item.deletions > 0) {
      if (text.length > 0) {
        text = text + ' ';
      }
      text = text + '-' + String(item.deletions);
    }
    if (text.length === 0) {
      return '0';
    }
    return text;
  }

  private workspaceChangeRowBackgroundColor(item: AgentHomeWorkspaceChangeItem): ResourceColor {
    if (this.isWorkspaceChangeAdded(item)) {
      return this.isDarkMode ? '#1A34C759' : '#1434C759';
    }
    if (this.isWorkspaceChangeDeleted(item)) {
      return this.isDarkMode ? '#1AFF3B30' : '#14FF3B30';
    }
    if (this.isWorkspaceChangeRenamed(item)) {
      return this.isDarkMode ? '#1A0A84FF' : '#140A84FF';
    }
    return Color.Transparent;
  }

  private workspaceChangeRowBorderColor(item: AgentHomeWorkspaceChangeItem): ResourceColor {
    if (this.isWorkspaceChangeAdded(item)) {
      return this.isDarkMode ? '#2F6B45' : '#BFE9CB';
    }
    if (this.isWorkspaceChangeDeleted(item)) {
      return this.isDarkMode ? '#7A353B' : '#F4C5C5';
    }
    if (this.isWorkspaceChangeRenamed(item)) {
      return this.isDarkMode ? '#315A87' : '#C6DBFA';
    }
    return this.workspaceFileRowNeutralBorderColor();
  }

  private workspaceFileSectionBackgroundColor(): ResourceColor {
    return Color.Transparent;
  }

  private workspaceFileRowBackgroundColor(item: AgentHomeWorkspaceFileItem): ResourceColor {
    if (this.selectedWorkspaceFilePath === item.path) {
      return this.isDarkMode ? '#223B82F6' : '#183B82F6';
    }
    return Color.Transparent;
  }

  private workspaceFileRowBorderColor(item: AgentHomeWorkspaceFileItem): ResourceColor {
    if (this.selectedWorkspaceFilePath === item.path) {
      return $r('app.color.tag_blue');
    }
    if (item.kind === 'directory') {
      return this.isDarkMode ? '#FFFFFF18' : '#DCE4EF';
    }
    return this.workspaceFileRowNeutralBorderColor();
  }

  private workspaceFileRowNeutralBorderColor(): ResourceColor {
    return this.isDarkMode ? '#FFFFFF10' : '#E8EDF4';
  }

  private mainWorkspaceChangesAreaHeight(): number {
    const count = this.visibleWorkspaceChanges().length;
    if (count <= 0) {
      return this.loadingWorkspaceChanges ? 76 : 42;
    }
    const height = 42 + count * 34;
    return Math.min(190, height);
  }

  private normalizedWorkspaceChangeStatus(item: AgentHomeWorkspaceChangeItem): string {
    return item.status.trim().toLowerCase();
  }

  private normalizedWorkspaceChangeKind(item: AgentHomeWorkspaceChangeItem): string {
    return this.normalizeWorkspaceChangeKind(item.kind, item.path);
  }

  private normalizeWorkspaceChangeKind(kind: string, path: string): string {
    const normalizedKind = kind.trim().toLowerCase();
    if (normalizedKind === 'directory' || normalizedKind === 'folder' || normalizedKind === 'dir') {
      return 'directory';
    }
    if (normalizedKind === 'file') {
      return 'file';
    }
    if (this.isWorkspaceKnownDirectoryPath(path)) {
      return 'directory';
    }
    const name = this.fileNameFromPath(path);
    if (path.indexOf('/') >= 0 && name.indexOf('.') < 0) {
      return 'directory';
    }
    return 'file';
  }

  private isWorkspaceDirectoryChange(item: AgentHomeWorkspaceChangeItem): boolean {
    return this.normalizedWorkspaceChangeKind(item) === 'directory';
  }

  private workspaceChangeFileCountText(item: AgentHomeWorkspaceChangeItem): string {
    const count = item.changedFileCount > 0 ? item.changedFileCount : 1;
    const hostContext = this.getUIContext().getHostContext();
    let unit = '';
    if (count === 1) {
      unit = resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_file_singular'));
    } else {
      unit = resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_file_plural'));
    }
    return String(count) + ' ' + unit;
  }

  private isWorkspaceChangeAdded(item: AgentHomeWorkspaceChangeItem): boolean {
    const status = this.normalizedWorkspaceChangeStatus(item);
    return status === 'added' ||
      status === 'untracked' ||
      status === 'new' ||
      status === 'created' ||
      status === 'a' ||
      status === '??';
  }

  private isWorkspaceChangeDeleted(item: AgentHomeWorkspaceChangeItem): boolean {
    const status = this.normalizedWorkspaceChangeStatus(item);
    return status === 'deleted' ||
      status === 'removed' ||
      status === 'd';
  }

  private isWorkspaceChangeRenamed(item: AgentHomeWorkspaceChangeItem): boolean {
    const status = this.normalizedWorkspaceChangeStatus(item);
    return status === 'renamed' ||
      status === 'moved' ||
      status === 'r';
  }

  private activeWorkspaceChangeSymbol(): Resource {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return $r('sys.symbol.doc_plaintext');
    }
    return this.symbolForWorkspaceChange(item);
  }

  private activeWorkspaceChangeTitleText(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_diff'));
    }
    return this.workspaceChangeActionText(item);
  }

  private activeWorkspaceChangeSummaryText(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return this.resolveDetailEmptyText();
    }
    let path = item.path;
    if (item.oldPath.length > 0 && item.oldPath !== item.path) {
      path = item.oldPath + ' -> ' + item.path;
    }
    if (this.isWorkspaceDirectoryChange(item)) {
      return path + '  ' + this.workspaceChangeFileCountText(item) + '  +' + String(item.additions) + '  -' + String(item.deletions);
    }
    return path + '  +' + String(item.additions) + '  -' + String(item.deletions);
  }

  private hasActiveWorkspaceChange(): boolean {
    return this.activeWorkspaceChange() !== null;
  }

  private activeWorkspaceChangeSummaryPathText(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return this.resolveDetailEmptyText();
    }
    if (item.oldPath.length > 0 && item.oldPath !== item.path) {
      return item.oldPath + ' -> ' + item.path;
    }
    return item.path;
  }

  private activeWorkspaceChangeIsDirectory(): boolean {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return false;
    }
    return this.isWorkspaceDirectoryChange(item);
  }

  private activeWorkspaceChangeFileCountText(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return '';
    }
    return this.workspaceChangeFileCountText(item);
  }

  private activeWorkspaceChangeAdditions(): number {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return 0;
    }
    return item.additions;
  }

  private activeWorkspaceChangeDeletions(): number {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return 0;
    }
    return item.deletions;
  }

  private activeWorkspaceChangePreviewPath(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return '';
    }
    const directPath = this.normalizeWorkspaceFilePath(item.path);
    if (this.isWorkspacePreviewableFilePath(directPath)) {
      return directPath;
    }
    return this.uniqueWorkspacePreviewFilePathFromDiff(item.diffText);
  }

  private canPreviewActiveWorkspaceChangeContent(): boolean {
    const path = this.activeWorkspaceChangePreviewPath();
    if (path.length === 0 || this.isActiveWorkspaceChangeDeleted()) {
      return false;
    }
    return this.isWorkspacePreviewableFilePath(path);
  }

  private resolveWorkspacePreviewRequestPath(path: string): string {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    if (this.isWorkspacePreviewableFilePath(normalizedPath)) {
      return normalizedPath;
    }
    const item = this.activeWorkspaceChange();
    if (item !== null && this.normalizeWorkspaceFilePath(item.path) === normalizedPath) {
      return this.uniqueWorkspacePreviewFilePathFromDiff(item.diffText);
    }
    return '';
  }

  private isWorkspacePreviewableFilePath(path: string): boolean {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    if (normalizedPath.length === 0) {
      return false;
    }
    if (this.isAbsoluteWorkspaceFilePath(normalizedPath)) {
      return false;
    }
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId === this.activeWorkspaceId && this.normalizeWorkspaceFilePath(item.path) === normalizedPath) {
        return item.kind === 'file';
      }
    }
    if (this.isWorkspaceKnownDirectoryPath(normalizedPath)) {
      return false;
    }
    const name = this.fileNameFromPath(normalizedPath);
    return name.indexOf('.') > 0;
  }

  private isWorkspaceKnownDirectoryPath(path: string): boolean {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    for (let index = 0; index < this.workspaceFiles.length; index++) {
      const item = this.workspaceFiles[index];
      if (item.workspaceId !== this.activeWorkspaceId) {
        continue;
      }
      if (this.normalizeWorkspaceFilePath(item.path) === normalizedPath && item.kind === 'directory') {
        return true;
      }
      if (this.normalizeWorkspaceFilePath(item.parentPath) === normalizedPath) {
        return true;
      }
    }
    return false;
  }

  private uniqueWorkspacePreviewFilePathFromDiff(diffText: string): string {
    if (diffText.length === 0) {
      return '';
    }
    let firstPath = '';
    let lineStart = 0;
    let scannedLines = 0;
    while (lineStart <= diffText.length && scannedLines < 6000) {
      const nextLineStart = diffText.indexOf('\n', lineStart);
      let line = '';
      if (nextLineStart < 0) {
        line = diffText.substring(lineStart);
        lineStart = diffText.length + 1;
      } else {
        line = diffText.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      scannedLines += 1;
      const path = this.workspacePreviewPathFromDiffLine(line);
      if (path.length === 0) {
        continue;
      }
      if (firstPath.length === 0) {
        firstPath = path;
      } else if (firstPath !== path) {
        return '';
      }
    }
    return firstPath;
  }

  private workspacePreviewPathFromDiffLine(line: string): string {
    let rawPath = '';
    if (line.startsWith('+++ b/')) {
      rawPath = line.substring(6);
    } else if (line.startsWith('diff --git ')) {
      const marker = ' b/';
      const markerIndex = line.indexOf(marker);
      if (markerIndex >= 0) {
        rawPath = line.substring(markerIndex + marker.length);
      }
    }
    if (rawPath.length === 0 || rawPath === '/dev/null') {
      return '';
    }
    const normalizedPath = this.normalizeWorkspaceFilePath(rawPath);
    if (normalizedPath.length === 0 || normalizedPath === '/dev/null') {
      return '';
    }
    return normalizedPath;
  }

  private isActiveWorkspaceChangeDeleted(): boolean {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return false;
    }
    return this.isWorkspaceChangeDeleted(item);
  }

  private workspaceChangeActionText(item: AgentHomeWorkspaceChangeItem): string {
    const hostContext = this.getUIContext().getHostContext();
    if (this.isWorkspaceDirectoryChange(item)) {
      if (this.isWorkspaceChangeAdded(item)) {
        return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_directory_added'));
      }
      if (this.isWorkspaceChangeDeleted(item)) {
        return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_directory_deleted'));
      }
      if (this.isWorkspaceChangeRenamed(item)) {
        return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_directory_renamed'));
      }
      return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_directory_edit'));
    }
    if (this.isWorkspaceChangeAdded(item)) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_added'));
    }
    if (this.isWorkspaceChangeDeleted(item)) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_deleted'));
    }
    if (this.isWorkspaceChangeRenamed(item)) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_renamed'));
    }
    return resolveResourceString(hostContext, $r('app.string.agent_home_workspace_change_edit'));
  }

  private activeWorkspaceDiffLines(): Array<AgentHomeDiffLine> {
    const item = this.activeWorkspaceChange();
    if (item === null || item.diffText.length === 0) {
      return [];
    }
    return this.parseWorkspaceDiffLines(item.diffText);
  }

  private activeWorkspaceDiffText(): string {
    const item = this.activeWorkspaceChange();
    if (item === null) {
      return '';
    }
    return item.diffText;
  }

  private diffTextHasAtLeastLines(diffText: string, threshold: number): boolean {
    if (diffText.length === 0 || threshold <= 0) {
      return false;
    }
    let lineCount = 1;
    for (let index = 0; index < diffText.length; index++) {
      if (diffText.charAt(index) === '\n') {
        lineCount = lineCount + 1;
        if (lineCount >= threshold) {
          return true;
        }
      }
    }
    return lineCount >= threshold;
  }

  private parseWorkspaceDiffLines(diffText: string): Array<AgentHomeDiffLine> {
    const items: Array<AgentHomeDiffLine> = [];
    let oldLineNumber = 0;
    let newLineNumber = 0;
    let sourceLineIndex = 0;
    let lineStart = 0;
    while (lineStart <= diffText.length && items.length < AGENT_HOME_DIFF_TABLE_MAX_LINES) {
      const nextLineStart = diffText.indexOf('\n', lineStart);
      let text = '';
      if (nextLineStart < 0) {
        text = diffText.substring(lineStart);
        lineStart = diffText.length + 1;
      } else {
        text = diffText.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      if (text.endsWith('\r')) {
        text = text.substring(0, text.length - 1);
      }
      if (text.length === 0 && lineStart > diffText.length) {
        continue;
      }
      const kind = this.workspaceDiffLineKind(text);
      let displayOldLineNumber = 0;
      let displayNewLineNumber = 0;
      if (kind === AgentHomeDiffLineKind.HUNK) {
        oldLineNumber = this.parseDiffHunkStartLine(text, '-');
        newLineNumber = this.parseDiffHunkStartLine(text, '+');
      } else if (kind === AgentHomeDiffLineKind.META) {
        if (text.startsWith('*** Add File:')) {
          oldLineNumber = 0;
          newLineNumber = 1;
        } else if (text.startsWith('*** Delete File:')) {
          oldLineNumber = 1;
          newLineNumber = 0;
        } else if (text.startsWith('*** Update File:') || text.startsWith('diff --git')) {
          oldLineNumber = 0;
          newLineNumber = 0;
        }
      } else if (kind === AgentHomeDiffLineKind.ADDITION) {
        if (newLineNumber > 0) {
          displayNewLineNumber = newLineNumber;
          newLineNumber = newLineNumber + 1;
        }
      } else if (kind === AgentHomeDiffLineKind.DELETION) {
        if (oldLineNumber > 0) {
          displayOldLineNumber = oldLineNumber;
          oldLineNumber = oldLineNumber + 1;
        }
      } else if (kind === AgentHomeDiffLineKind.CONTEXT) {
        if (oldLineNumber > 0 && newLineNumber > 0) {
          displayOldLineNumber = oldLineNumber;
          displayNewLineNumber = newLineNumber;
          oldLineNumber = oldLineNumber + 1;
          newLineNumber = newLineNumber + 1;
        }
      }
      items.push(new AgentHomeDiffLine(
        'workspace_diff_line_' + String(sourceLineIndex),
        kind,
        this.workspaceDiffLimitedLineText(text),
        displayOldLineNumber,
        displayNewLineNumber
      ));
      sourceLineIndex = sourceLineIndex + 1;
    }
    if (lineStart <= diffText.length) {
      items.push(new AgentHomeDiffLine(
        'workspace_diff_line_limited',
        AgentHomeDiffLineKind.META,
        '... preview truncated ...',
        0,
        0
      ));
    }
    return items;
  }

  private parseDiffHunkStartLine(text: string, marker: string): number {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) {
      return 0;
    }
    let cursor = markerIndex + marker.length;
    let value = '';
    while (cursor < text.length) {
      const ch = text.charAt(cursor);
      if (ch < '0' || ch > '9') {
        break;
      }
      value = value + ch;
      cursor = cursor + 1;
    }
    if (value.length === 0) {
      return 0;
    }
    return Number(value);
  }

  private workspaceDiffLineKind(text: string): string {
    if (text.startsWith('@@')) {
      return AgentHomeDiffLineKind.HUNK;
    }
    if (
      text.startsWith('diff --git') ||
        text.startsWith('index ') ||
        text.startsWith('--- ') ||
        text.startsWith('+++ ') ||
        text.startsWith('rename from ') ||
        text.startsWith('rename to ') ||
        text.startsWith('new file mode ') ||
        text.startsWith('deleted file mode ') ||
        text.startsWith('*** Begin Patch') ||
        text.startsWith('*** End Patch') ||
        text.startsWith('*** Update File:') ||
        text.startsWith('*** Add File:') ||
        text.startsWith('*** Delete File:')
    ) {
      return AgentHomeDiffLineKind.META;
    }
    if (text.startsWith('+')) {
      return AgentHomeDiffLineKind.ADDITION;
    }
    if (text.startsWith('-')) {
      return AgentHomeDiffLineKind.DELETION;
    }
    return AgentHomeDiffLineKind.CONTEXT;
  }

  private workspaceDiffLineGutterText(line: AgentHomeDiffLine): string {
    if (line.kind === AgentHomeDiffLineKind.ADDITION) {
      return '+';
    }
    if (line.kind === AgentHomeDiffLineKind.DELETION) {
      return '-';
    }
    return '';
  }

  private workspaceDiffLineNumberText(value: number): string {
    if (value <= 0) {
      return '';
    }
    return String(value);
  }

  private workspaceCodePreviewLineNumberText(value: number): string {
    if (value <= 0) {
      return '';
    }
    return String(value);
  }

  private workspaceCodePreviewLineText(line: AgentHomeCodeLine): string {
    return this.workspaceDiffLimitedLineText(line.text);
  }

  private workspaceDiffLineContentText(line: AgentHomeDiffLine): string {
    let text = line.text;
    if (
      (line.kind === AgentHomeDiffLineKind.ADDITION || line.kind === AgentHomeDiffLineKind.DELETION) &&
        text.length > 0
    ) {
      text = text.substring(1);
    } else if (line.kind === AgentHomeDiffLineKind.CONTEXT && text.startsWith(' ')) {
      text = text.substring(1);
    }
    return this.workspaceDiffLimitedLineText(text);
  }

  private workspaceDiffLimitedLineText(text: string): string {
    if (text.length <= AGENT_HOME_DIFF_TABLE_MAX_LINE_CHARS) {
      return text;
    }
    return text.substring(0, AGENT_HOME_DIFF_TABLE_MAX_LINE_CHARS) + '...';
  }

  private workspaceCodePreviewLines(content: string): Array<AgentHomeCodeLine> {
    const items: Array<AgentHomeCodeLine> = [];
    let lineNumber = 1;
    let lineStart = 0;
    while (lineStart <= content.length && items.length < AGENT_HOME_DIFF_TABLE_MAX_LINES) {
      const nextLineStart = content.indexOf('\n', lineStart);
      let text = '';
      if (nextLineStart < 0) {
        text = content.substring(lineStart);
        lineStart = content.length + 1;
      } else {
        text = content.substring(lineStart, nextLineStart);
        lineStart = nextLineStart + 1;
      }
      if (text.endsWith('\r')) {
        text = text.substring(0, text.length - 1);
      }
      if (text.length === 0 && lineStart > content.length) {
        continue;
      }
      items.push(new AgentHomeCodeLine(
        'workspace_code_line_' + String(lineNumber),
        lineNumber,
        this.workspaceDiffLimitedLineText(text)
      ));
      lineNumber = lineNumber + 1;
    }
    if (lineStart <= content.length) {
      items.push(new AgentHomeCodeLine(
        'workspace_code_line_limited',
        0,
        '... preview truncated ...'
      ));
    }
    return items;
  }

  private workspaceCodePreviewTableWidth(lines: Array<AgentHomeCodeLine>): number {
    let maxLength = 0;
    for (let index = 0; index < lines.length; index++) {
      const contentLength = this.workspaceCodePreviewLineText(lines[index]).length;
      if (contentLength > maxLength) {
        maxLength = contentLength;
      }
    }
    const measuredLength = Math.min(maxLength, AGENT_HOME_DIFF_TABLE_MAX_LINE_CHARS);
    const estimatedWidth = 86 + measuredLength * 8;
    return Math.min(3600, Math.max(720, estimatedWidth));
  }

  private workspaceDiffRenderableLines(lines: Array<AgentHomeDiffLine>): Array<AgentHomeDiffLine> {
    if (lines.length <= AGENT_HOME_DIFF_TABLE_MAX_LINES) {
      return lines;
    }
    const visibleLines: Array<AgentHomeDiffLine> = [];
    for (let index = 0; index < lines.length && index < AGENT_HOME_DIFF_TABLE_MAX_LINES; index++) {
      visibleLines.push(lines[index]);
    }
    visibleLines.push(new AgentHomeDiffLine(
      'workspace_diff_line_visible_limited',
      AgentHomeDiffLineKind.META,
      '... preview truncated ...',
      0,
      0
    ));
    return visibleLines;
  }

  private workspaceDiffTableWidth(lines: Array<AgentHomeDiffLine>): number {
    let maxLength = 0;
    for (let index = 0; index < lines.length; index++) {
      const contentLength = this.workspaceDiffLineContentText(lines[index]).length;
      if (contentLength > maxLength) {
        maxLength = contentLength;
      }
    }
    const measuredLength = Math.min(maxLength, AGENT_HOME_DIFF_TABLE_MAX_LINE_CHARS);
    const estimatedWidth = 140 + measuredLength * 8;
    return Math.min(3600, Math.max(780, estimatedWidth));
  }

  private workspaceDiffLineHeight(kind: string): number {
    if (kind === AgentHomeDiffLineKind.HUNK || kind === AgentHomeDiffLineKind.META) {
      return 30;
    }
    return 28;
  }

  private workspaceDiffCodeBackgroundColor(): ResourceColor {
    if (this.isDarkMode) {
      return '#141821';
    }
    return '#FAFBFD';
  }

  private workspaceDiffLineBackgroundColor(kind: string): ResourceColor {
    if (kind === AgentHomeDiffLineKind.ADDITION) {
      return this.isDarkMode ? '#263A2D' : '#E7F6EA';
    }
    if (kind === AgentHomeDiffLineKind.DELETION) {
      return this.isDarkMode ? '#402728' : '#FCE8E8';
    }
    if (kind === AgentHomeDiffLineKind.HUNK) {
      return this.isDarkMode ? '#202A3A' : '#F0F4FA';
    }
    if (kind === AgentHomeDiffLineKind.META) {
      return this.isDarkMode ? '#171D28' : '#F7F9FC';
    }
    return Color.Transparent;
  }

  private workspaceDiffLineTextColor(kind: string): ResourceColor {
    if (kind === AgentHomeDiffLineKind.HUNK || kind === AgentHomeDiffLineKind.META) {
      return this.agentHomeReadableMutedColor();
    }
    return this.agentHomeReadableTextColor();
  }

  private workspaceDiffLineAccentColor(kind: string): ResourceColor {
    if (kind === AgentHomeDiffLineKind.ADDITION) {
      return $r('app.color.tag_green');
    }
    if (kind === AgentHomeDiffLineKind.DELETION) {
      return $r('app.color.tag_red');
    }
    return this.agentHomeReadableMutedColor();
  }

  private workspaceDiffLineNumberColor(kind: string): ResourceColor {
    if (kind === AgentHomeDiffLineKind.ADDITION) {
      return $r('app.color.tag_green');
    }
    if (kind === AgentHomeDiffLineKind.DELETION) {
      return $r('app.color.tag_red');
    }
    return this.agentHomeReadableMutedColor();
  }

  private workspaceCodePreviewLineTextColor(lineNumber: number): ResourceColor {
    if (lineNumber <= 0) {
      return this.agentHomeReadableMutedColor();
    }
    return this.agentHomeReadableTextColor();
  }

  private workspaceCodePreviewLineBackgroundColor(lineNumber: number): ResourceColor {
    if (lineNumber <= 0) {
      return this.workspaceDiffLineBackgroundColor(AgentHomeDiffLineKind.META);
    }
    return Color.Transparent;
  }

  private isWorkspaceDiffExpanded(id: string): boolean {
    for (let index = 0; index < this.expandedWorkspaceDiffIds.length; index++) {
      if (this.expandedWorkspaceDiffIds[index] === id) {
        return true;
      }
    }
    return false;
  }

  private addExpandedWorkspaceDiff(id: string): void {
    if (this.isWorkspaceDiffExpanded(id)) {
      return;
    }
    const items: Array<string> = [];
    for (let index = 0; index < this.expandedWorkspaceDiffIds.length; index++) {
      items.push(this.expandedWorkspaceDiffIds[index]);
    }
    items.push(id);
    this.expandedWorkspaceDiffIds = items;
  }

  private isWorkspaceDiffLoading(id: string): boolean {
    for (let index = 0; index < this.loadingWorkspaceDiffIds.length; index++) {
      if (this.loadingWorkspaceDiffIds[index] === id) {
        return true;
      }
    }
    return false;
  }

  private addLoadingWorkspaceDiff(id: string): void {
    if (this.isWorkspaceDiffLoading(id)) {
      return;
    }
    const items: Array<string> = [];
    for (let index = 0; index < this.loadingWorkspaceDiffIds.length; index++) {
      items.push(this.loadingWorkspaceDiffIds[index]);
    }
    items.push(id);
    this.loadingWorkspaceDiffIds = items;
  }

  private removeLoadingWorkspaceDiff(id: string): void {
    const items: Array<string> = [];
    for (let index = 0; index < this.loadingWorkspaceDiffIds.length; index++) {
      const item = this.loadingWorkspaceDiffIds[index];
      if (item !== id) {
        items.push(item);
      }
    }
    this.loadingWorkspaceDiffIds = items;
  }

  private removeLoadingWorkspaceDiffForPath(path: string): void {
    if (path.length === 0) {
      return;
    }
    for (let index = 0; index < this.workspaceChanges.length; index++) {
      const item = this.workspaceChanges[index];
      if (item.sessionId === this.activeSessionId && item.path === path) {
        this.removeLoadingWorkspaceDiff(item.id);
      }
    }
  }

  private removeExpandedWorkspaceDiff(id: string): void {
    const items: Array<string> = [];
    for (let index = 0; index < this.expandedWorkspaceDiffIds.length; index++) {
      const item = this.expandedWorkspaceDiffIds[index];
      if (item !== id) {
        items.push(item);
      }
    }
    this.expandedWorkspaceDiffIds = items;
  }

  private isWorkspaceDirExpanded(path: string): boolean {
    for (let index = 0; index < this.expandedWorkspaceDirs.length; index++) {
      if (this.expandedWorkspaceDirs[index] === path) {
        return true;
      }
    }
    return false;
  }

  private isWorkspaceDirLoading(path: string): boolean {
    for (let index = 0; index < this.loadingWorkspaceFileParentPaths.length; index++) {
      if (this.loadingWorkspaceFileParentPaths[index] === path) {
        return true;
      }
    }
    return false;
  }

  private addLoadingWorkspaceFileParentPath(path: string): void {
    if (this.isWorkspaceDirLoading(path)) {
      return;
    }
    const items: Array<string> = [];
    for (let index = 0; index < this.loadingWorkspaceFileParentPaths.length; index++) {
      items.push(this.loadingWorkspaceFileParentPaths[index]);
    }
    items.push(path);
    this.loadingWorkspaceFileParentPaths = items;
  }

  private removeLoadingWorkspaceFileParentPath(path: string): void {
    const items: Array<string> = [];
    for (let index = 0; index < this.loadingWorkspaceFileParentPaths.length; index++) {
      const item = this.loadingWorkspaceFileParentPaths[index];
      if (item !== path) {
        items.push(item);
      }
    }
    this.loadingWorkspaceFileParentPaths = items;
  }

  private addExpandedWorkspaceDir(path: string): void {
    if (this.isWorkspaceDirExpanded(path)) {
      return;
    }
    const items: Array<string> = [];
    for (let index = 0; index < this.expandedWorkspaceDirs.length; index++) {
      items.push(this.expandedWorkspaceDirs[index]);
    }
    items.push(path);
    this.expandedWorkspaceDirs = items;
  }

  private removeExpandedWorkspaceDir(path: string): void {
    const items: Array<string> = [];
    for (let index = 0; index < this.expandedWorkspaceDirs.length; index++) {
      const item = this.expandedWorkspaceDirs[index];
      if (item !== path) {
        items.push(item);
      }
    }
    this.expandedWorkspaceDirs = items;
  }

  private fileNameFromPath(path: string): string {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    const slashIndex = normalizedPath.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex + 1 < normalizedPath.length) {
      return normalizedPath.substring(slashIndex + 1);
    }
    return normalizedPath;
  }

  private parentPathFromWorkspacePath(path: string): string {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    const slashIndex = normalizedPath.lastIndexOf('/');
    if (slashIndex > 0) {
      return normalizedPath.substring(0, slashIndex);
    }
    return '';
  }

  private depthForWorkspacePath(path: string): number {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    if (normalizedPath.length === 0) {
      return 0;
    }
    let depth = 0;
    for (let index = 0; index < normalizedPath.length; index++) {
      if (normalizedPath.charAt(index) === '/') {
        depth = depth + 1;
      }
    }
    return depth;
  }

  private normalizeWorkspaceFilePath(path: string): string {
    let normalized = path.trim().split('\\').join('/');
    normalized = this.stripKnownWorkspacePrefixFromFilePath(normalized);
    while (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    while (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  private stripKnownWorkspacePrefixFromFilePath(path: string): string {
    let normalized = this.stripWorkspacePrefixFromFilePath(path, this.currentWorkspacePath());
    if (normalized !== path) {
      return normalized;
    }
    const currentRemoteSession = this.currentRemoteSession();
    if (currentRemoteSession !== null) {
      normalized = this.stripWorkspacePrefixFromFilePath(path, currentRemoteSession.workspacePath);
      if (normalized !== path) {
        return normalized;
      }
    }
    for (let index = 0; index < this.workspaces.length; index++) {
      normalized = this.stripWorkspacePrefixFromFilePath(path, this.workspaces[index].subtitle);
      if (normalized !== path) {
        return normalized;
      }
    }
    for (let index = 0; index < this.remoteSessions.length; index++) {
      normalized = this.stripWorkspacePrefixFromFilePath(path, this.remoteSessions[index].workspacePath);
      if (normalized !== path) {
        return normalized;
      }
    }
    normalized = this.stripWorkspaceTitleSegmentFromFilePath(path);
    if (normalized !== path) {
      return normalized;
    }
    return path;
  }

  private stripWorkspaceTitleSegmentFromFilePath(path: string): string {
    let normalized = this.stripWorkspaceTitleSegment(path, this.currentWorkspaceTitle());
    if (normalized !== path) {
      return normalized;
    }
    for (let index = 0; index < this.workspaces.length; index++) {
      normalized = this.stripWorkspaceTitleSegment(path, this.workspaces[index].title);
      if (normalized !== path) {
        return normalized;
      }
    }
    for (let index = 0; index < this.remoteSessions.length; index++) {
      normalized = this.stripWorkspaceTitleSegment(path, this.remoteSessions[index].workspaceTitle);
      if (normalized !== path) {
        return normalized;
      }
    }
    return path;
  }

  private stripWorkspaceTitleSegment(path: string, workspaceTitle: string): string {
    const title = workspaceTitle.trim();
    if (title.length === 0 || title === '-') {
      return path;
    }
    const normalizedPath = path.split('\\').join('/');
    const lowerPath = normalizedPath.toLowerCase();
    const lowerTitle = title.toLowerCase();
    if (lowerPath === lowerTitle) {
      return '';
    }
    if (lowerPath.startsWith(lowerTitle + '/')) {
      return normalizedPath.substring(title.length + 1);
    }
    if (lowerPath.startsWith('/' + lowerTitle + '/')) {
      return normalizedPath.substring(title.length + 2);
    }
    return path;
  }

  private stripWorkspacePrefixFromFilePath(path: string, workspacePath: string): string {
    const normalizedWorkspace = this.normalizeWorkspacePathForCompare(workspacePath);
    if (normalizedWorkspace.length === 0) {
      return path;
    }
    const comparablePath = path.length >= 2 && path.charAt(1) === ':' ? path.toLowerCase() : path;
    if (comparablePath === normalizedWorkspace) {
      return '';
    }
    const workspacePrefix = normalizedWorkspace.endsWith('/') ? normalizedWorkspace : normalizedWorkspace + '/';
    if (comparablePath.startsWith(workspacePrefix)) {
      return path.substring(workspacePrefix.length);
    }
    return path;
  }

  private isAbsoluteWorkspaceFilePath(path: string): boolean {
    if (path.startsWith('/')) {
      return true;
    }
    return path.length >= 3 && path.charAt(1) === ':' &&
      (path.charAt(2) === '/' || path.charAt(2) === '\\');
  }

  private resolveWorkspaceFilesParentPath(
    responseParentPath: string,
    nextItems: Array<AgentHomeWorkspaceFileItem>
  ): string {
    if (responseParentPath.length > 0) {
      return responseParentPath;
    }
    if (nextItems.length === 0) {
      return this.pendingWorkspaceFilesParentPath;
    }
    let parentPath = nextItems[0].parentPath;
    for (let index = 1; index < nextItems.length; index++) {
      if (nextItems[index].parentPath !== parentPath) {
        parentPath = '';
        break;
      }
    }
    if (parentPath.length > 0) {
      return parentPath;
    }
    return this.pendingWorkspaceFilesParentPath.length > 0 ? this.pendingWorkspaceFilesParentPath : '';
  }

  private scopeWorkspaceFileItemsForParent(
    parentPath: string,
    items: Array<AgentHomeWorkspaceFileItem>
  ): Array<AgentHomeWorkspaceFileItem> {
    if (parentPath.length === 0) {
      return items;
    }
    const scopedItems: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.parentPath.length > 0) {
        scopedItems.push(item);
        continue;
      }
      const itemPath = this.normalizeWorkspaceFilePath(item.path);
      const scopedPath = itemPath.startsWith(parentPath + '/') ? itemPath : parentPath + '/' + itemPath;
      scopedItems.push(new AgentHomeWorkspaceFileItem(
        item.workspaceId + ':' + scopedPath,
        item.workspaceId,
        scopedPath,
        parentPath,
        item.name.length > 0 ? item.name : this.fileNameFromPath(scopedPath),
        item.kind,
        this.depthForWorkspacePath(scopedPath),
        item.sizeBytes,
        item.modifiedAt,
        item.isHidden,
        item.updatedAt
      ));
    }
    return scopedItems;
  }

  private workspaceFileIndent(item: AgentHomeWorkspaceFileItem): number {
    const depth = item.depth > 0 ? item.depth : this.depthForWorkspacePath(item.path);
    return Math.min(96, depth * 16);
  }

  private formatBytes(value: number): string {
    if (value < 1024) {
      return String(value) + ' B';
    }
    if (value < 1024 * 1024) {
      return String(Math.round(value / 102.4) / 10) + ' KB';
    }
    return String(Math.round(value / 1024 / 102.4) / 10) + ' MB';
  }

  private connectionLogMessages(): Array<AgentHomeChatItem> {
    const items: Array<AgentHomeChatItem> = [];
    for (let index = this.messages.length - 1; index >= 0 && items.length < 12; index--) {
      const item = this.messages[index];
      if (item.sessionId === this.activeSessionId && item.role === AgentHomeMessageRole.STATUS) {
        items.push(item);
      }
    }
    return items;
  }

  private sessionsForActiveWorkspace(): Array<AgentHomeSessionItem> {
    return this.sessionsForWorkspace(this.activeWorkspaceId);
  }

  private sessionsForWorkspace(workspaceId: string): Array<AgentHomeSessionItem> {
    const items: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.workspaceId === workspaceId) {
        items.push(item);
      }
    }
    return items;
  }

  private filteredRemoteSessionsForSheet(): Array<AgentBridgeRemoteSession> {
    const items: Array<AgentBridgeRemoteSession> = [];
    const providerId = this.activeSessionImportProviderId();
    const query = this.normalizedSessionSheetSearchText();
    const workspaceFilterId = this.effectiveRemoteWorkspaceFilterId();
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.providerId === providerId &&
        this.matchesRemoteWorkspaceFilter(item, workspaceFilterId) &&
        this.matchesRemoteSessionSearch(item, query)) {
        items.push(item);
      }
    }
    items.sort((left: AgentBridgeRemoteSession, right: AgentBridgeRemoteSession): number => {
      return right.updatedAt - left.updatedAt;
    });
    return items;
  }

  private remoteSessionSectionsForSheet(): Array<AgentHomeRemoteSessionSection> {
    const sessions = this.filteredRemoteSessionsForSheet();
    const sections: Array<AgentHomeRemoteSessionSection> = [];
    for (let index = 0; index < sessions.length; index++) {
      const item = sessions[index];
      const sectionId = this.remoteWorkspaceFilterIdForSession(item);
      const existingIndex = this.findRemoteSessionSectionIndex(sections, sectionId);
      if (existingIndex < 0) {
        const sectionSessions: Array<AgentBridgeRemoteSession> = [];
        sectionSessions.push(item);
        sections.push(new AgentHomeRemoteSessionSection(
          sectionId,
          this.remoteWorkspaceTitleForSession(item),
          this.remoteWorkspacePathForSession(item),
          1,
          item.updatedAt,
          sectionSessions
        ));
      } else {
        const section = sections[existingIndex];
        section.sessions.push(item);
        section.count = section.count + 1;
        section.updatedAt = Math.max(section.updatedAt, item.updatedAt);
      }
    }
    sections.sort((left: AgentHomeRemoteSessionSection, right: AgentHomeRemoteSessionSection): number => {
      return right.updatedAt - left.updatedAt;
    });
    return sections;
  }

  private findRemoteSessionSectionIndex(sections: Array<AgentHomeRemoteSessionSection>, sectionId: string): number {
    for (let index = 0; index < sections.length; index++) {
      if (sections[index].id === sectionId) {
        return index;
      }
    }
    return -1;
  }

  private remoteWorkspaceFilterOptions(): Array<AgentHomeRemoteWorkspaceFilterOption> {
    const providerId = this.activeSessionImportProviderId();
    const options: Array<AgentHomeRemoteWorkspaceFilterOption> = [];
    options.push(new AgentHomeRemoteWorkspaceFilterOption(
      AgentHomeRemoteWorkspaceFilter.ALL,
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_workspace_filter_all')),
      '',
      this.remoteSessionCountForProvider(providerId)
    ));
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.providerId !== providerId) {
        continue;
      }
      const optionId = this.remoteWorkspaceFilterIdForSession(item);
      const existingIndex = this.findRemoteWorkspaceFilterOptionIndex(options, optionId);
      if (existingIndex < 0) {
        options.push(new AgentHomeRemoteWorkspaceFilterOption(
          optionId,
          this.remoteWorkspaceTitleForSession(item),
          this.remoteWorkspacePathForSession(item),
          1
        ));
      } else {
        const option = options[existingIndex];
        option.count = option.count + 1;
      }
    }
    options.sort((left: AgentHomeRemoteWorkspaceFilterOption, right: AgentHomeRemoteWorkspaceFilterOption): number => {
      if (left.id === AgentHomeRemoteWorkspaceFilter.ALL) {
        return -1;
      }
      if (right.id === AgentHomeRemoteWorkspaceFilter.ALL) {
        return 1;
      }
      if (left.title < right.title) {
        return -1;
      }
      if (left.title > right.title) {
        return 1;
      }
      return 0;
    });
    return options;
  }

  private findRemoteWorkspaceFilterOptionIndex(options: Array<AgentHomeRemoteWorkspaceFilterOption>, optionId: string): number {
    for (let index = 0; index < options.length; index++) {
      if (options[index].id === optionId) {
        return index;
      }
    }
    return -1;
  }

  private effectiveRemoteWorkspaceFilterId(): string {
    const options = this.remoteWorkspaceFilterOptions();
    for (let index = 0; index < options.length; index++) {
      if (options[index].id === this.remoteWorkspaceFilterId) {
        return this.remoteWorkspaceFilterId;
      }
    }
    return AgentHomeRemoteWorkspaceFilter.ALL;
  }

  private matchesRemoteWorkspaceFilter(item: AgentBridgeRemoteSession, filterId: string): boolean {
    if (filterId === AgentHomeRemoteWorkspaceFilter.ALL) {
      return true;
    }
    return this.remoteWorkspaceFilterIdForSession(item) === filterId;
  }

  private isRemoteWorkspaceFilterSelected(filterId: string): boolean {
    return this.effectiveRemoteWorkspaceFilterId() === filterId;
  }

  private remoteWorkspaceFilterIdForSession(item: AgentBridgeRemoteSession): string {
    const path = this.remoteWorkspacePathForSession(item);
    if (path.length === 0) {
      return 'workspace:unknown';
    }
    return 'workspace:' + this.normalizeWorkspacePathForCompare(path);
  }

  private remoteWorkspacePathForSession(item: AgentBridgeRemoteSession): string {
    if (item.workspacePath.length > 0) {
      return item.workspacePath;
    }
    return item.workspaceTitle;
  }

  private remoteWorkspaceTitleForSession(item: AgentBridgeRemoteSession): string {
    if (item.workspaceTitle.length > 0) {
      return item.workspaceTitle;
    }
    if (item.workspacePath.length > 0) {
      return this.workspaceTitleFromPath(item.workspacePath);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_workspace_filter_unknown'));
  }

  private normalizedSessionSheetSearchText(): string {
    return this.sessionSheetSearchText.trim().toLowerCase();
  }

  private matchesRemoteSessionSearch(item: AgentBridgeRemoteSession, query: string): boolean {
    if (query.length === 0) {
      return true;
    }
    const title = item.title.toLowerCase();
    const sessionId = item.sessionId.toLowerCase();
    const remoteSessionId = item.remoteSessionId.toLowerCase();
    const workspacePath = item.workspacePath.toLowerCase();
    const workspaceTitle = item.workspaceTitle.toLowerCase();
    return title.indexOf(query) >= 0 ||
      sessionId.indexOf(query) >= 0 ||
      remoteSessionId.indexOf(query) >= 0 ||
      workspacePath.indexOf(query) >= 0 ||
      workspaceTitle.indexOf(query) >= 0;
  }

  private activeSessionImportProviderId(): string {
    if (this.hasProvider(this.sessionImportProviderId)) {
      return this.sessionImportProviderId;
    }
    return this.selectedProviderId;
  }

  private isSessionImportProviderSelected(providerId: string): boolean {
    return this.activeSessionImportProviderId() === providerId;
  }

  private shouldShowRunModeControls(): boolean {
    return this.currentProviderInteractionModesForCategory('run').length > 1;
  }

  private currentAgentRunMode(): string {
    const modes = this.currentProviderInteractionModes();
    if (modes.length === 0) {
      return '';
    }
    if (this.isInteractionModeSelected(AgentHomeRunMode.PLAN) && this.hasInteractionModeInCategory(AgentHomeRunMode.PLAN, modes, 'run')) {
      return AgentHomeRunMode.PLAN;
    }
    if (this.isInteractionModeSelected(AgentHomeRunMode.BUILD) && this.hasInteractionModeInCategory(AgentHomeRunMode.BUILD, modes, 'run')) {
      return AgentHomeRunMode.BUILD;
    }
    if (this.isInteractionModeSelected(AgentHomeRunMode.GOAL) && this.hasInteractionModeInCategory(AgentHomeRunMode.GOAL, modes, 'run')) {
      return AgentHomeRunMode.GOAL;
    }
    return '';
  }

  private currentSelectedInteractionModes(): Array<string> {
    const modes = this.currentProviderInteractionModes();
    const items: Array<string> = [];
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      const modeId = this.selectedInteractionModeIds[index];
      if (this.hasInteractionMode(modeId, modes)) {
        items.push(modeId);
      }
    }
    return this.withDefaultInteractionModes(items, modes);
  }

  private currentProviderInteractionModesForCategory(category: string): Array<AgentBridgeInteractionModeOption> {
    const targetCategory = this.normalizedInteractionModeCategory(category);
    const modes = this.currentProviderInteractionModes();
    const items: Array<AgentBridgeInteractionModeOption> = [];
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (this.normalizedInteractionModeCategory(mode.category) === targetCategory) {
        items.push(mode);
      }
    }
    return items;
  }

  private hasInteractionModesInCategory(category: string): boolean {
    const targetCategory = this.normalizedInteractionModeCategory(category);
    const modes = this.currentProviderInteractionModes();
    for (let index = 0; index < modes.length; index++) {
      if (this.normalizedInteractionModeCategory(modes[index].category) === targetCategory) {
        return true;
      }
    }
    return false;
  }

  private shouldShowPermissionModeButton(): boolean {
    return this.currentProviderInteractionModesForCategory('approval').length > 0;
  }

  private currentOpenCodeAgent(): string {
    if (!this.isOpenCodeCompatibleProvider()) {
      return '';
    }
    const modes = this.currentProviderInteractionModes();
    if (this.isInteractionModeSelected(AgentHomeRunMode.PLAN)) {
      return this.agentForInteractionMode(AgentHomeRunMode.PLAN, modes, AgentHomeRunMode.PLAN);
    }
    if (this.isInteractionModeSelected(AgentHomeRunMode.BUILD)) {
      return this.agentForInteractionMode(AgentHomeRunMode.BUILD, modes, AgentHomeRunMode.BUILD);
    }
    return '';
  }

  private agentForInteractionMode(modeId: string, modes: Array<AgentBridgeInteractionModeOption>, fallback: string): string {
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (mode.id === modeId && mode.agent.length > 0) {
        return mode.agent;
      }
    }
    return fallback;
  }

  private remoteSessionIdForAbort(bridgeSessionId: string): string {
    const remoteSession = this.currentRemoteSession();
    if (remoteSession && remoteSession.remoteSessionId.length > 0) {
      return remoteSession.remoteSessionId;
    }
    const prefix = this.currentSessionProviderId() + ':';
    if (bridgeSessionId.startsWith(prefix) && bridgeSessionId.length > prefix.length) {
      return bridgeSessionId.substring(prefix.length);
    }
    return bridgeSessionId;
  }

  private ensureSelectedInteractionModes(modes: Array<AgentBridgeInteractionModeOption>): void {
    const items: Array<string> = [];
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      const modeId = this.selectedInteractionModeIds[index];
      if (this.hasInteractionMode(modeId, modes)) {
        items.push(modeId);
      }
    }
    this.selectedInteractionModeIds = this.withDefaultInteractionModes(items, modes);
  }

  private withDefaultInteractionModes(
    selectedModes: Array<string>,
    modes: Array<AgentBridgeInteractionModeOption>
  ): Array<string> {
    const items: Array<string> = [];
    const selectedCategories: Array<string> = [];
    for (let index = 0; index < selectedModes.length; index++) {
      const modeId = selectedModes[index];
      if (!this.hasInteractionMode(modeId, modes)) {
        continue;
      }
      const category = this.interactionModeCategory(modeId, modes);
      if (this.hasInteractionCategory(category, selectedCategories)) {
        continue;
      }
      items.push(modeId);
      selectedCategories.push(category);
    }
    for (let index = 0; index < modes.length; index++) {
      const category = this.normalizedInteractionModeCategory(modes[index].category);
      if (this.hasInteractionCategory(category, selectedCategories)) {
        continue;
      }
      if (category === 'run') {
        continue;
      }
      const defaultModeId = this.defaultInteractionModeIdForCategory(modes, category);
      if (defaultModeId.length > 0) {
        items.push(defaultModeId);
        selectedCategories.push(category);
      }
    }
    return items;
  }

  private hasInteractionModeInCategory(
    modeId: string,
    modes: Array<AgentBridgeInteractionModeOption>,
    category: string
  ): boolean {
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (mode.id === modeId && this.normalizedInteractionModeCategory(mode.category) === category) {
        return true;
      }
    }
    return false;
  }

  private interactionModeCategory(modeId: string, modes: Array<AgentBridgeInteractionModeOption>): string {
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (mode.id === modeId) {
        return this.normalizedInteractionModeCategory(mode.category);
      }
    }
    return 'run';
  }

  private normalizedInteractionModeCategory(category: string): string {
    const value = category.trim();
    return value.length > 0 ? value : 'run';
  }

  private hasInteractionCategory(category: string, categories: Array<string>): boolean {
    for (let index = 0; index < categories.length; index++) {
      if (categories[index] === category) {
        return true;
      }
    }
    return false;
  }

  private isInteractionModeSelected(modeId: string): boolean {
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      if (this.selectedInteractionModeIds[index] === modeId) {
        return true;
      }
    }
    return false;
  }

  private currentModelIcon(): Resource {
    const model = this.currentModelOption();
    if (model) {
      return this.iconForModel(model);
    }
    const fallbackModels = this.currentProviderModels();
    if (fallbackModels.length > 0) {
      return this.iconForModel(fallbackModels[0]);
    }
    return $r('app.media.opencode');
  }

  private iconForModel(model: AgentBridgeModelOption): Resource {
    const identity = (model.vendor + ' ' + model.id + ' ' + model.displayName).toLowerCase();
    if (identity.indexOf('claude-code') >= 0 || identity.indexOf('claudecode') >= 0) {
      return $r('app.media.claudecode');
    }
    if (
      identity.indexOf('codex') >= 0 ||
        identity.indexOf('gpt-5-codex') >= 0 ||
        identity.indexOf('gpt-5.1-codex') >= 0
    ) {
      return $r('app.media.codex');
    }
    if (
      identity.indexOf('chatgpt') >= 0 ||
        identity.indexOf('gpt') >= 0 ||
        identity.indexOf('openai') >= 0
    ) {
      return $r('app.media.openai');
    }
    if (identity.indexOf('claude') >= 0 || identity.indexOf('anthropic') >= 0) {
      return $r('app.media.claude');
    }
    if (identity.indexOf('deepseek') >= 0 || identity.indexOf('deep-seek') >= 0) {
      return $r('app.media.deepseek');
    }
    if (identity.indexOf('mimo') >= 0 || identity.indexOf('xiaomi') >= 0) {
      return $r('app.media.xiaomimimo');
    }
    if (identity.indexOf('glm') >= 0 || identity.indexOf('chatglm') >= 0 || identity.indexOf('zhipu') >= 0) {
      return $r('app.media.zhipu');
    }
    if (identity.indexOf('minimax') >= 0 || identity.indexOf('minmax') >= 0 || identity.indexOf('mini-max') >= 0 || identity.indexOf('abab') >= 0) {
      return $r('app.media.minimax');
    }
    if (
      identity.indexOf('qwen') >= 0 ||
        identity.indexOf('qwq') >= 0 ||
        identity.indexOf('qvq') >= 0 ||
        identity.indexOf('tongyi') >= 0 ||
        identity.indexOf('dashscope') >= 0
    ) {
      return $r('app.media.qwen');
    }
    if (identity.indexOf('opencode') >= 0 || identity.indexOf('deveco') >= 0) {
      return $r('app.media.opencode');
    }
    if (identity.indexOf('alibabacloud') >= 0 || identity.indexOf('alibaba cloud') >= 0 || identity.indexOf('aliyun') >= 0 || identity.indexOf('alibaba') >= 0) {
      return $r('app.media.alibabacloud');
    }
    if (identity.indexOf('cloudflare') >= 0 || identity.indexOf('@cf') >= 0) {
      return $r('app.media.cloudflare');
    }
    if (identity.indexOf('github') >= 0 || identity.indexOf('copilot') >= 0) {
      return $r('app.media.github');
    }
    return $r('app.media.opencode');
  }

  private symbolForInteractionMode(modeId: string): Resource {
    if (modeId.indexOf('permissions-full-access') >= 0 || modeId.indexOf('full-access') >= 0) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    if (modeId.indexOf('permissions') >= 0 || modeId.indexOf('approval') >= 0 || modeId.indexOf('review') >= 0) {
      return $r('sys.symbol.security_shield');
    }
    if (modeId === AgentHomeRunMode.BUILD || modeId.indexOf('build') >= 0) {
      return $r('sys.symbol.wrench_arrow_counterclockwise');
    }
    if (modeId === AgentHomeRunMode.PLAN || modeId.indexOf('plan') >= 0) {
      return $r('sys.symbol.route_plan');
    }
    if (modeId.indexOf('fast') >= 0) {
      return $r('sys.symbol.bolt');
    }
    if (modeId.indexOf('task') >= 0) {
      return $r('sys.symbol.list_checkmark');
    }
    return $r('sys.symbol.scope');
  }

  private currentPermissionMode(): AgentBridgeInteractionModeOption | null {
    const modes = this.currentProviderInteractionModesForCategory('approval');
    for (let index = 0; index < this.selectedInteractionModeIds.length; index++) {
      const modeId = this.selectedInteractionModeIds[index];
      for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
        const mode = modes[modeIndex];
        if (mode.id === modeId) {
          return mode;
        }
      }
    }
    const defaultModeId = this.defaultInteractionModeIdForCategory(this.currentProviderInteractionModes(), 'approval');
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (mode.id === defaultModeId) {
        return mode;
      }
    }
    return modes.length > 0 ? modes[0] : null;
  }

  private symbolForCurrentPermissionMode(): Resource {
    const mode = this.currentPermissionMode();
    if (mode !== null) {
      return this.symbolForInteractionMode(mode.id);
    }
    return $r('sys.symbol.security_shield');
  }

  private isCurrentPermissionMode(modeId: string): boolean {
    const mode = this.currentPermissionMode();
    return mode !== null && mode.id === modeId;
  }

  private isPermissionModeNonDefault(): boolean {
    const mode = this.currentPermissionMode();
    if (mode === null) {
      return false;
    }
    return !mode.isDefault;
  }

  private symbolForSpeedMode(modeId: string): Resource {
    if (modeId.indexOf('fast') >= 0) {
      return $r('sys.symbol.bolt');
    }
    if (modeId.indexOf('deep') >= 0) {
      return $r('sys.symbol.scope');
    }
    return $r('sys.symbol.slider_horizontal_2');
  }

  private symbolForReasoningMode(modeId: string): Resource {
    if (modeId === 'low') {
      return $r('sys.symbol.bolt');
    }
    if (modeId === 'high' || modeId === 'xhigh') {
      return $r('sys.symbol.scope');
    }
    return $r('sys.symbol.slider_horizontal_2');
  }

  private isReplyInProgress(): boolean {
    return this.replyState === AgentHomeReplyState.RESPONDING || this.replyState === AgentHomeReplyState.TOOL_RUNNING;
  }

  private activeNewSessionProviderId(): string {
    if (this.hasProvider(this.newSessionProviderId)) {
      return this.newSessionProviderId;
    }
    if (this.hasProvider(this.selectedProviderId)) {
      return this.selectedProviderId;
    }
    if (this.providerOptions.length > 0) {
      return this.providerOptions[0].id;
    }
    return AgentBridgeProviderId.CODEX;
  }

  private isNewSessionProviderSelected(providerId: string): boolean {
    return this.activeNewSessionProviderId() === providerId;
  }

  private ensureNewSessionProvider(): void {
    const providerId = this.activeNewSessionProviderId();
    this.newSessionProviderId = providerId;
    const models = this.providerModelsForId(providerId);
    if (models.length > 0 && !this.hasModel(this.newSessionModelId, models)) {
      this.newSessionModelId = this.defaultModelId(models);
    }
    const modes = this.providerSpeedModesForId(providerId);
    if (modes.length > 0 && !this.hasSpeedMode(this.newSessionSpeedMode, modes)) {
      this.newSessionSpeedMode = this.defaultSpeedModeId(modes);
    }
    const reasoningModes = this.providerReasoningModesForId(providerId);
    if (reasoningModes.length > 0 && !this.hasReasoningMode(this.newSessionReasoningMode, reasoningModes)) {
      this.newSessionReasoningMode = this.defaultReasoningModeId(reasoningModes);
    }
  }

  private prepareNewSessionRuntimeFromActiveSelection(): void {
    if (this.hasProvider(this.selectedProviderId)) {
      this.newSessionProviderId = this.selectedProviderId;
      this.newSessionModelId = this.selectedModelId;
      this.newSessionSpeedMode = this.selectedSpeedMode;
      this.newSessionReasoningMode = this.selectedReasoningMode;
    }
    this.ensureNewSessionProvider();
  }

  private activeNewSessionModelId(): string {
    if (this.newSessionModelId.length > 0) {
      return this.newSessionModelId;
    }
    const models = this.providerModelsForId(this.activeNewSessionProviderId());
    if (models.length > 0) {
      return this.defaultModelId(models);
    }
    return 'configured';
  }

  private activeNewSessionSpeedMode(): string {
    if (this.newSessionSpeedMode.length > 0) {
      return this.newSessionSpeedMode;
    }
    const modes = this.providerSpeedModesForId(this.activeNewSessionProviderId());
    if (modes.length > 0) {
      return this.defaultSpeedModeId(modes);
    }
    return 'auto';
  }

  private activeNewSessionReasoningMode(): string {
    if (this.newSessionReasoningMode.length > 0) {
      return this.newSessionReasoningMode;
    }
    const modes = this.providerReasoningModesForId(this.activeNewSessionProviderId());
    if (modes.length > 0) {
      return this.defaultReasoningModeId(modes);
    }
    return 'auto';
  }

  private ensureSessionImportProvider(): void {
    if (this.hasProvider(this.sessionImportProviderId)) {
      return;
    }
    if (this.hasProvider(this.selectedProviderId)) {
      this.sessionImportProviderId = this.selectedProviderId;
      return;
    }
    if (this.providerOptions.length > 0) {
      this.sessionImportProviderId = this.providerOptions[0].id;
    }
  }

  private normalizeSelectableProviderId(providerId: string): string {
    if (providerId.length > 0 && providerId !== AgentBridgeProviderId.MOCK && this.hasProvider(providerId)) {
      return providerId;
    }
    return this.defaultSelectableProviderId();
  }

  private defaultSelectableProviderId(): string {
    if (this.hasProvider(AgentBridgeProviderId.CODEX)) {
      return AgentBridgeProviderId.CODEX;
    }
    if (this.providerOptions.length > 0) {
      return this.providerOptions[0].id;
    }
    return AgentBridgeProviderId.CODEX;
  }

  private remoteSessionCountForProvider(providerId: string): number {
    let count = 0;
    for (let index = 0; index < this.remoteSessions.length; index++) {
      if (this.remoteSessions[index].providerId === providerId) {
        count = count + 1;
      }
    }
    return count;
  }

  private importedSessionCountForProvider(providerId: string): number {
    let count = 0;
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.providerId === providerId && item.bridgeSessionId.length > 0) {
        count = count + 1;
      }
    }
    return count;
  }

  private sessionImportSheetTitleText(): string {
    const title = resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_switch_tab_title'));
    const providerName = this.providerDisplayNameForId(this.activeSessionImportProviderId());
    if (providerName.length === 0) {
      return title;
    }
    return title + ' - ' + providerName;
  }

  private sessionImportSheetSummaryText(): string {
    const providerId = this.activeSessionImportProviderId();
    const remoteLabel = resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_remote_sessions_count_label'));
    const importedLabel = resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_imported_sessions_count_label'));
    return remoteLabel + ' ' + String(this.remoteSessionCountForProvider(providerId)) +
      ' / ' + importedLabel + ' ' + String(this.importedSessionCountForProvider(providerId));
  }

  private shouldShowSlashCommandMenu(): boolean {
    if (!this.draftText.startsWith('/')) {
      return false;
    }
    return this.firstWhitespaceIndex(this.draftText) < 0;
  }

  private currentSlashCommands(): Array<AgentHomeSlashCommandOption> {
    const provider = this.currentProviderOption();
    return AgentHomeSlashCommandCatalog.commandsForProvider(provider.id, provider.displayName);
  }

  private filteredSlashCommands(): Array<AgentHomeSlashCommandOption> {
    const query = this.currentSlashCommandQuery();
    const commands = this.currentSlashCommands();
    const items: Array<AgentHomeSlashCommandOption> = [];
    for (let index = 0; index < commands.length; index++) {
      const item = commands[index];
      if (query.length === 0 || item.command.substring(1).toLowerCase().startsWith(query)) {
        items.push(item);
      }
    }
    return items;
  }

  private currentSlashCommandQuery(): string {
    if (!this.draftText.startsWith('/')) {
      return '';
    }
    const whitespaceIndex = this.firstWhitespaceIndex(this.draftText);
    if (whitespaceIndex > 0) {
      return '';
    }
    return this.draftText.substring(1).toLowerCase();
  }

  private firstWhitespaceIndex(text: string): number {
    let result = -1;
    const spaceIndex = text.indexOf(' ');
    if (spaceIndex >= 0) {
      result = spaceIndex;
    }
    const tabIndex = text.indexOf('\t');
    if (tabIndex >= 0 && (result < 0 || tabIndex < result)) {
      result = tabIndex;
    }
    const lineIndex = text.indexOf('\n');
    if (lineIndex >= 0 && (result < 0 || lineIndex < result)) {
      result = lineIndex;
    }
    const returnIndex = text.indexOf('\r');
    if (returnIndex >= 0 && (result < 0 || returnIndex < result)) {
      result = returnIndex;
    }
    return result;
  }

  private slashCommandMenuHeight(): number {
    const count = this.filteredSlashCommands().length;
    if (count <= 1) {
      return 54;
    }
    if (count === 2) {
      return 104;
    }
    if (count === 3) {
      return 154;
    }
    return 204;
  }

  private slashCommandSourceText(item: AgentHomeSlashCommandOption): string {
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_slash_commands_source')) +
      ': ' + item.source;
  }

  private applySlashCommand(command: string): void {
    this.draftText = command + ' ';
  }

  private currentProviderOption(): AgentBridgeProviderOption {
    for (let index = 0; index < this.providerOptions.length; index++) {
      const item = this.providerOptions[index];
      if (item.id === this.currentSessionProviderId()) {
        return item;
      }
    }
    return AgentBridgeDefaultOptions.buildProviders()[0];
  }

  private providerOptionForId(providerId: string): AgentBridgeProviderOption | null {
    for (let index = 0; index < this.providerOptions.length; index++) {
      const item = this.providerOptions[index];
      if (item.id === providerId) {
        return item;
      }
    }
    return null;
  }

  private providerModelsForId(providerId: string): Array<AgentBridgeModelOption> {
    const provider = this.providerOptionForId(providerId);
    if (provider && provider.models.length > 0) {
      return provider.models;
    }
    return AgentBridgeDefaultOptions.buildProviders()[0].models;
  }

  private providerSpeedModesForId(providerId: string): Array<AgentBridgeSpeedModeOption> {
    const provider = this.providerOptionForId(providerId);
    if (provider && provider.speedModes.length > 0) {
      return provider.speedModes;
    }
    return AgentBridgeDefaultOptions.buildProviders()[0].speedModes;
  }

  private providerReasoningModesForId(providerId: string): Array<AgentBridgeReasoningModeOption> {
    const provider = this.providerOptionForId(providerId);
    if (provider && provider.reasoningModes.length > 0) {
      return provider.reasoningModes;
    }
    if (providerId === AgentBridgeProviderId.CODEX) {
      return AgentBridgeDefaultOptions.buildCodexReasoningModes();
    }
    return AgentBridgeDefaultOptions.buildDefaultReasoningModes();
  }

  private providerInteractionModesForId(providerId: string): Array<AgentBridgeInteractionModeOption> {
    const provider = this.providerOptionForId(providerId);
    if (provider) {
      return this.mergeProviderInteractionModesWithDefaults(providerId, provider.interactionModes);
    }
    return this.defaultInteractionModesForProviderId(providerId);
  }

  private defaultInteractionModesForProviderId(providerId: string): Array<AgentBridgeInteractionModeOption> {
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

  private mergeProviderInteractionModesWithDefaults(
    providerId: string,
    providerModes: Array<AgentBridgeInteractionModeOption>
  ): Array<AgentBridgeInteractionModeOption> {
    const defaults = this.defaultInteractionModesForProviderId(providerId);
    if (providerModes.length === 0) {
      return defaults;
    }
    if (providerId !== AgentBridgeProviderId.CODEX) {
      return providerModes;
    }
    const modes: Array<AgentBridgeInteractionModeOption> = [];
    for (let index = 0; index < providerModes.length; index++) {
      modes.push(providerModes[index]);
    }
    for (let index = 0; index < defaults.length; index++) {
      const mode = defaults[index];
      if (!this.hasInteractionMode(mode.id, modes)) {
        modes.push(mode);
      }
    }
    return modes;
  }

  private providerDisplayNameForId(providerId: string): string {
    const provider = this.providerOptionForId(providerId);
    if (provider) {
      return provider.displayName;
    }
    if (providerId.length > 0) {
      return providerId;
    }
    return AgentBridgeDefaultOptions.buildProviders()[0].displayName;
  }

  private providerIdForSession(sessionId: string): string {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === sessionId && item.providerId.length > 0) {
        return item.providerId;
      }
    }
    if (sessionId === this.activeSessionId) {
      return this.currentSessionProviderId();
    }
    return this.selectedProviderId;
  }

  private providerSupportsVisibleSubagents(providerId: string): boolean {
    return providerId === AgentBridgeProviderId.OPENCODE ||
      providerId === AgentBridgeProviderId.DEVECO ||
      providerId === AgentBridgeProviderId.MIMO;
  }

  private currentProviderSupportsVisibleSubagents(): boolean {
    return this.providerSupportsVisibleSubagents(this.currentSessionProviderId());
  }

  private visibleAgentNameForProvider(providerId: string, agentName: string): string {
    if (!this.providerSupportsVisibleSubagents(providerId)) {
      return '';
    }
    return agentName.trim();
  }

  private currentVisibleSubagentName(): string {
    const visibleName = this.visibleAgentNameForProvider(this.currentSessionProviderId(), this.activeSubagentName);
    if (visibleName.length === 0) {
      return '';
    }
    if (this.replyState !== AgentHomeReplyState.IDLE) {
      return visibleName;
    }
    return this.hasPersistedCurrentAgentName(visibleName) ? visibleName : '';
  }

  private hasPersistedCurrentAgentName(agentName: string): boolean {
    const providerId = this.currentSessionProviderId();
    for (let index = 0; index < this.messages.length; index++) {
      const item = this.messages[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) &&
        this.visibleAgentNameForProvider(providerId, item.agentName) === agentName) {
        return true;
      }
    }
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) &&
        this.visibleAgentNameForProvider(providerId, item.agentName) === agentName) {
        return true;
      }
    }
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) &&
        this.visibleAgentNameForProvider(providerId, item.agentName) === agentName) {
        return true;
      }
    }
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.isSessionVisibleForActiveSession(item.sessionId) &&
        this.visibleAgentNameForProvider(providerId, item.agentName) === agentName) {
        return true;
      }
    }
    return false;
  }

  private refreshActiveSessionHistory(): boolean {
    const session = this.currentSession();
    if (!session || session.bridgeSessionId.length === 0 || this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      return false;
    }
    if (session.providerId !== AgentBridgeProviderId.CODEX && session.providerId !== AgentBridgeProviderId.CLAUDE) {
      return false;
    }
    const provider = this.providerOptionForId(session.providerId);
    if (!provider || !provider.supportsHistory) {
      return false;
    }
    this.beginConversationRenderTransition(session.id);
    this.pendingHistoryImportSessionId = session.id;
    this.beginStartupHistorySyncWait(session.id);
    this.client.requestSessionMessages(session.bridgeSessionId);
    return true;
  }

  private currentProviderModels(): Array<AgentBridgeModelOption> {
    const provider = this.currentProviderOption();
    if (provider.models.length > 0) {
      return provider.models;
    }
    return AgentBridgeDefaultOptions.buildProviders()[0].models;
  }

  private currentProviderSpeedModes(): Array<AgentBridgeSpeedModeOption> {
    const provider = this.currentProviderOption();
    if (provider.speedModes.length > 0) {
      return provider.speedModes;
    }
    return AgentBridgeDefaultOptions.buildProviders()[0].speedModes;
  }

  private currentProviderReasoningModes(): Array<AgentBridgeReasoningModeOption> {
    const provider = this.currentProviderOption();
    if (provider.reasoningModes.length > 0) {
      return provider.reasoningModes;
    }
    if (provider.id === AgentBridgeProviderId.CODEX) {
      return AgentBridgeDefaultOptions.buildCodexReasoningModes();
    }
    return AgentBridgeDefaultOptions.buildDefaultReasoningModes();
  }

  private currentProviderInteractionModes(): Array<AgentBridgeInteractionModeOption> {
    const provider = this.currentProviderOption();
    return this.mergeProviderInteractionModesWithDefaults(provider.id, provider.interactionModes);
  }

  private currentModelOption(): AgentBridgeModelOption | null {
    const models = this.currentProviderModels();
    const modelId = this.currentEffectiveModelId();
    for (let index = 0; index < models.length; index++) {
      const item = models[index];
      if (this.isSameModelId(item.id, modelId)) {
        return item;
      }
    }
    return null;
  }

  private currentModelDisplayText(): string {
    const model = this.currentModelOption();
    if (model) {
      return model.displayName;
    }
    const modelId = this.currentEffectiveModelId();
    return modelId.length > 0 ? modelId : this.currentProviderOption().displayName;
  }

  private currentPermissionModeDisplayText(): string {
    const mode = this.currentPermissionMode();
    if (mode !== null) {
      return mode.displayName;
    }
    return '';
  }

  private richBlocksForText(messageId: string, text: string): Array<AgentHomeRichBlock> {
    const blocks: Array<AgentHomeRichBlock> = [];
    if (text.length === 0) {
      return blocks;
    }
    const normalized = this.sanitizeRichText(text).split('\r\n').join('\n').split('\r').join('\n');
    const lines = normalized.split('\n');
    const paragraphLines: Array<string> = [];
    const structuredLines: Array<string> = [];
    const codeLines: Array<string> = [];
    let codeLanguage = '';
    let inCodeBlock = false;
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (inCodeBlock) {
        if (this.isFencedCodeDelimiter(line)) {
          blocks.push(new AgentHomeRichBlock(
            this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.CODE),
            AgentHomeRichBlockKind.CODE,
            codeLines.join('\n'),
            '',
            codeLanguage
          ));
          codeLines.length = 0;
          codeLanguage = '';
          inCodeBlock = false;
        } else {
          codeLines.push(line);
        }
        index = index + 1;
        continue;
      }

      if (this.isFencedCodeDelimiter(line)) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        inCodeBlock = true;
        codeLanguage = this.codeLanguageFromFence(line);
        index = index + 1;
        continue;
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        index = index + 1;
        continue;
      }

      const imageTarget = this.markdownImageTargetForLine(trimmed);
      if (imageTarget.length > 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.IMAGE),
          AgentHomeRichBlockKind.IMAGE,
          this.markdownImageAltForLine(trimmed),
          '',
          imageTarget
        ));
        index = index + 1;
        continue;
      }

      if (this.isMarkdownTableLine(trimmed) && index + 1 < lines.length && this.isMarkdownTableSeparator(lines[index + 1].trim())) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        const tableLines: Array<string> = [];
        tableLines.push(trimmed);
        tableLines.push(lines[index + 1].trim());
        index = index + 2;
        while (index < lines.length && this.isMarkdownTableLine(lines[index].trim())) {
          tableLines.push(lines[index].trim());
          index = index + 1;
        }
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.TABLE),
          AgentHomeRichBlockKind.TABLE,
          tableLines.join('\n')
        ));
        continue;
      }

      const headingLevel = this.headingLevelForLine(trimmed);
      if (headingLevel > 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.HEADING),
          AgentHomeRichBlockKind.HEADING,
          this.headingTextForLine(trimmed, headingLevel),
          '',
          '',
          headingLevel
        ));
        index = index + 1;
        continue;
      }

      const bulletMarker = this.bulletMarkerForLine(trimmed);
      if (bulletMarker.length > 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.BULLET),
          AgentHomeRichBlockKind.BULLET,
          this.bulletTextForLine(trimmed),
          bulletMarker
        ));
        index = index + 1;
        continue;
      }

      const orderedMarker = this.orderedMarkerForLine(trimmed);
      if (orderedMarker.length > 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.ORDERED),
          AgentHomeRichBlockKind.ORDERED,
          this.orderedTextForLine(trimmed, orderedMarker),
          orderedMarker
        ));
        index = index + 1;
        continue;
      }

      const quoteText = this.quoteTextForLine(trimmed);
      if (quoteText.length > 0) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
        blocks.push(new AgentHomeRichBlock(
          this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.QUOTE),
          AgentHomeRichBlockKind.QUOTE,
          quoteText,
          '▎'
        ));
        index = index + 1;
        continue;
      }

      if (this.isStructuredPlainTextLine(trimmed)) {
        this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
        structuredLines.push(trimmed);
        index = index + 1;
        continue;
      }

      this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
      paragraphLines.push(trimmed);
      index = index + 1;
    }

    if (inCodeBlock && codeLines.length > 0) {
      blocks.push(new AgentHomeRichBlock(
        this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.CODE),
        AgentHomeRichBlockKind.CODE,
        codeLines.join('\n'),
        '',
        codeLanguage
      ));
    }
    this.flushRichParagraphBlocks(messageId, blocks, paragraphLines);
    this.flushRichStructuredBlocks(messageId, blocks, structuredLines);
    return blocks;
  }

  private flushRichParagraphBlocks(
    messageId: string,
    blocks: Array<AgentHomeRichBlock>,
    paragraphLines: Array<string>
  ): void {
    if (paragraphLines.length === 0) {
      return;
    }
    const text = paragraphLines.join('\n');
    if (text.length > 0) {
      blocks.push(new AgentHomeRichBlock(
        this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.PARAGRAPH),
        AgentHomeRichBlockKind.PARAGRAPH,
        text
      ));
    }
    paragraphLines.length = 0;
  }

  private flushRichStructuredBlocks(
    messageId: string,
    blocks: Array<AgentHomeRichBlock>,
    structuredLines: Array<string>
  ): void {
    if (structuredLines.length === 0) {
      return;
    }
    blocks.push(new AgentHomeRichBlock(
      this.richBlockId(messageId, blocks.length, AgentHomeRichBlockKind.CODE),
      AgentHomeRichBlockKind.CODE,
      structuredLines.join('\n')
    ));
    structuredLines.length = 0;
  }

  private richBlockId(messageId: string, index: number, kind: string): string {
    return messageId + '_' + kind + '_' + String(index);
  }

  private sanitizeRichText(text: string): string {
    let normalized = text;
    normalized = this.removeTaggedRichTextBlock(normalized, 'image');
    normalized = this.removeStandaloneRichTextTag(normalized, 'image');
    return normalized;
  }

  private removeTaggedRichTextBlock(text: string, tagName: string): string {
    const lowerTagName = tagName.toLowerCase();
    let result = text;
    let searchStart = 0;
    const closeTag = '</' + lowerTagName + '>';
    while (searchStart < result.length) {
      const lower = result.toLowerCase();
      const openStart = lower.indexOf('<' + lowerTagName, searchStart);
      if (openStart < 0) {
        break;
      }
      const openEnd = result.indexOf('>', openStart);
      if (openEnd < 0) {
        break;
      }
      const closeStart = lower.indexOf(closeTag, openEnd + 1);
      if (closeStart < 0) {
        result = result.substring(0, openStart) + result.substring(openEnd + 1);
        searchStart = openStart;
        continue;
      }
      result = result.substring(0, openStart) + result.substring(closeStart + closeTag.length);
      searchStart = openStart;
    }
    return result;
  }

  private removeStandaloneRichTextTag(text: string, tagName: string): string {
    const lines = text.split('\r\n').join('\n').split('\r').join('\n').split('\n');
    const keptLines: Array<string> = [];
    for (let index = 0; index < lines.length; index++) {
      const trimmed = lines[index].trim().toLowerCase();
      if (trimmed.startsWith('<' + tagName.toLowerCase()) && trimmed.endsWith('>')) {
        continue;
      }
      if (trimmed === '</' + tagName.toLowerCase() + '>') {
        continue;
      }
      keptLines.push(lines[index]);
    }
    return keptLines.join('\n');
  }

  private isFencedCodeDelimiter(line: string): boolean {
    return line.trim().startsWith('```');
  }

  private codeLanguageFromFence(line: string): string {
    const trimmed = line.trim();
    if (trimmed.length <= 3) {
      return '';
    }
    return trimmed.substring(3).trim();
  }

  private headingLevelForLine(line: string): number {
    let level = 0;
    while (level < line.length && line.charAt(level) === '#') {
      level = level + 1;
    }
    if (level === 0 || level > 3 || level >= line.length) {
      return 0;
    }
    return line.charAt(level) === ' ' ? level : 0;
  }

  private headingTextForLine(line: string, level: number): string {
    return line.substring(level + 1).trim();
  }

  private bulletMarkerForLine(line: string): string {
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('+ ')) {
      return '•';
    }
    return '';
  }

  private bulletTextForLine(line: string): string {
    return line.substring(2).trim();
  }

  private orderedMarkerForLine(line: string): string {
    let index = 0;
    while (index < line.length) {
      const code = line.charCodeAt(index);
      if (code < 48 || code > 57) {
        break;
      }
      index = index + 1;
    }
    if (index === 0 || index + 1 >= line.length) {
      return '';
    }
    const marker = line.charAt(index);
    if ((marker !== '.' && marker !== ')') || line.charAt(index + 1) !== ' ') {
      return '';
    }
    return line.substring(0, index + 1);
  }

  private orderedTextForLine(line: string, marker: string): string {
    return line.substring(marker.length + 1).trim();
  }

  private quoteTextForLine(line: string): string {
    if (!line.startsWith('> ')) {
      return '';
    }
    return line.substring(2).trim();
  }

  private markdownImageAltForLine(line: string): string {
    if (!line.startsWith('![')) {
      return '';
    }
    const labelClose = line.indexOf('](');
    if (labelClose <= 2) {
      return '';
    }
    return line.substring(2, labelClose).trim();
  }

  private markdownImageTargetForLine(line: string): string {
    if (!line.startsWith('![')) {
      return '';
    }
    const labelClose = line.indexOf('](');
    if (labelClose <= 2) {
      return '';
    }
    const targetClose = line.lastIndexOf(')');
    if (targetClose <= labelClose + 2) {
      return '';
    }
    return line.substring(labelClose + 2, targetClose).trim();
  }

  private isMarkdownTableLine(line: string): boolean {
    return line.indexOf('|') >= 0;
  }

  private isMarkdownTableSeparator(line: string): boolean {
    if (line.indexOf('-') < 0 || line.indexOf('|') < 0) {
      return false;
    }
    const cleaned = line.split('|').join('').split('-').join('').split(':').join('').split(' ').join('').split('\t').join('');
    return cleaned.length === 0;
  }

  private markdownTableRowsForBlock(block: AgentHomeRichBlock): Array<AgentHomeMarkdownTableRow> {
    const rows: Array<AgentHomeMarkdownTableRow> = [];
    const lines = block.text.split('\r\n').join('\n').split('\r').join('\n').split('\n');
    if (lines.length < 2) {
      return rows;
    }
    rows.push(new AgentHomeMarkdownTableRow(
      block.id + '_header',
      this.markdownTableCellsForLine(block.id + '_header', lines[0]),
      true
    ));
    for (let index = 2; index < lines.length; index++) {
      rows.push(new AgentHomeMarkdownTableRow(
        block.id + '_row_' + index.toString(),
        this.markdownTableCellsForLine(block.id + '_row_' + index.toString(), lines[index]),
        false
      ));
    }
    return rows;
  }

  private markdownTableCellsForLine(rowId: string, line: string): Array<AgentHomeMarkdownTableCell> {
    let normalized = line.trim();
    if (normalized.startsWith('|')) {
      normalized = normalized.substring(1);
    }
    if (normalized.endsWith('|')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    const rawCells = normalized.split('|');
    const cells: Array<AgentHomeMarkdownTableCell> = [];
    for (let index = 0; index < rawCells.length; index++) {
      cells.push(new AgentHomeMarkdownTableCell(
        rowId + '_cell_' + index.toString(),
        rawCells[index].trim()
      ));
    }
    return cells;
  }

  private isStructuredPlainTextLine(line: string): boolean {
    if (line.length === 0) {
      return false;
    }
    if (this.isAngleWrappedPathOrUri(line)) {
      return false;
    }
    if (line.startsWith('<') && line.endsWith('>') && this.isKnownStructuredTagLine(line)) {
      return true;
    }
    if (this.looksLikePathOrUri(line) && line.indexOf(' ') < 0) {
      return true;
    }
    return this.looksLikeEnvironmentBinding(line);
  }

  private looksLikePathOrUri(text: string): boolean {
    return text.indexOf('://') >= 0 ||
      text.startsWith('./') ||
      text.startsWith('../') ||
      text.startsWith('/') ||
      (text.length > 2 && text.charAt(1) === ':' && text.charAt(2) === '\\') ||
      text.indexOf('\\') >= 0;
  }

  private isKnownStructuredTagLine(line: string): boolean {
    const normalized = line.trim().toLowerCase();
    if (normalized.startsWith('<image') || normalized.startsWith('</image')) {
      return false;
    }
    if (this.isAngleWrappedPathOrUri(line)) {
      return false;
    }
    return normalized.startsWith('<environment_context') ||
      normalized.startsWith('</environment_context') ||
      normalized.startsWith('<turn_aborted') ||
      normalized.startsWith('</turn_aborted') ||
      normalized.startsWith('<system') ||
      normalized.startsWith('</system');
  }

  private isAngleWrappedPathOrUri(text: string): boolean {
    if (!text.startsWith('<') || !text.endsWith('>') || text.length <= 2) {
      return false;
    }
    const inner = text.substring(1, text.length - 1).trim();
    return this.looksLikePathOrUri(inner);
  }

  private looksLikeEnvironmentBinding(text: string): boolean {
    const equalsIndex = text.indexOf('=');
    if (equalsIndex > 0 && this.isUpperIdentifier(text.substring(0, equalsIndex))) {
      return true;
    }
    const colonIndex = text.indexOf(': ');
    if (colonIndex > 0 && colonIndex <= 24) {
      return this.isUpperIdentifier(text.substring(0, colonIndex));
    }
    return false;
  }

  private isUpperIdentifier(text: string): boolean {
    if (text.length === 0) {
      return false;
    }
    for (let index = 0; index < text.length; index++) {
      const char = text.charAt(index);
      const code = text.charCodeAt(index);
      const isUpper = code >= 65 && code <= 90;
      const isDigit = code >= 48 && code <= 57;
      if (!isUpper && !isDigit && char !== '_') {
        return false;
      }
    }
    return true;
  }

  private hasClickableRichInlineRun(text: string): boolean {
    if (text.indexOf('](') >= 0) {
      return true;
    }
    let token = '';
    for (let index = 0; index < text.length; index++) {
      const char = text.charAt(index);
      if (char === '`') {
        const closing = text.indexOf('`', index + 1);
        if (closing > index + 1 && this.richInlineTokenLooksWorkspaceReference(text.substring(index + 1, closing))) {
          return true;
        }
      }
      if (this.isRichPlainTokenSeparator(char)) {
        if (this.richInlineTokenLooksWorkspaceReference(token)) {
          return true;
        }
        token = '';
      } else {
        token = token + char;
      }
    }
    return this.richInlineTokenLooksWorkspaceReference(token);
  }

  private richInlineTokenLooksWorkspaceReference(rawText: string): boolean {
    const value = this.lightNormalizeRichContentReference(rawText);
    if (value.length === 0 || value.startsWith('#')) {
      return false;
    }
    if (this.richContentLinkHasExternalScheme(value)) {
      return false;
    }
    if (value.indexOf('/') >= 0 || value.indexOf('\\') >= 0) {
      return true;
    }
    if (value.startsWith('.')) {
      return value.length > 1;
    }
    return this.fileNameLooksPreviewable(value);
  }

  private lightNormalizeRichContentReference(rawText: string): string {
    let value = this.stripRichContentReferenceEdge(rawText);
    if (value.length === 0) {
      return '';
    }
    value = this.stripRichContentFileUrlPrefix(value);
    value = this.stripRichContentUrlSuffix(value);
    value = this.stripRichContentLineSuffix(value);
    value = this.stripRichContentReferenceEdge(value);
    return value;
  }

  private fileNameLooksPreviewable(name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.indexOf(' ') >= 0) {
      return false;
    }
    const dotIndex = trimmed.indexOf('.');
    if (dotIndex < 0) {
      return false;
    }
    if (dotIndex === trimmed.length - 1) {
      return false;
    }
    for (let index = 0; index < trimmed.length; index++) {
      const char = trimmed.charAt(index);
      const code = trimmed.charCodeAt(index);
      const isUpper = code >= 65 && code <= 90;
      const isLower = code >= 97 && code <= 122;
      const isDigit = code >= 48 && code <= 57;
      if (!isUpper && !isLower && !isDigit && char !== '.' && char !== '_' && char !== '-' && char !== '+') {
        return false;
      }
    }
    return true;
  }

  private clickableRichInlineTarget(rawText: string): string {
    const value = this.lightNormalizeRichContentReference(rawText);
    if (this.richInlineTokenLooksWorkspaceReference(value)) {
      return value;
    }
    return '';
  }

  private appendRichPathOrPlainRun(runs: Array<AgentHomeRichInlineRun>, text: string, fallbackKind: string): void {
    const target = this.clickableRichInlineTarget(text);
    if (target.length > 0) {
      this.appendRichRun(runs, AgentHomeRichInlineKind.LINK, text, target);
      return;
    }
    this.appendRichRun(runs, fallbackKind, text);
  }

  private appendRichPathOrPlainRunForDisplay(runs: Array<AgentHomeRichInlineRun>, text: string): void {
    const target = this.clickableRichInlineTarget(text);
    if (target.length > 0) {
      this.appendRichRun(runs, AgentHomeRichInlineKind.LINK, text, target);
      return;
    }
    this.appendRichRun(runs, this.inlineKindForPathText(text), text);
  }

  private richInlineRunsForText(text: string): Array<AgentHomeRichInlineRun> {
    const runs: Array<AgentHomeRichInlineRun> = [];
    let buffer = '';
    let index = 0;
    while (index < text.length) {
      if (text.charAt(index) === '[') {
        const labelClose = text.indexOf('](', index + 1);
        if (labelClose > index + 1) {
          const targetClose = text.indexOf(')', labelClose + 2);
          if (targetClose > labelClose + 2) {
            this.appendRichPlainRun(runs, buffer);
            buffer = '';
            const label = text.substring(index + 1, labelClose);
            const target = text.substring(labelClose + 2, targetClose);
            const normalizedLabel = this.inlinePathDisplayText(label);
            this.appendRichRun(runs, AgentHomeRichInlineKind.LINK, normalizedLabel, target);
            if (target.length > 0) {
              const normalizedTarget = this.inlinePathDisplayText(target);
              if (!this.isRedundantMarkdownLinkTarget(normalizedLabel, normalizedTarget)) {
                this.appendRichRun(runs, AgentHomeRichInlineKind.PLAIN, ' ');
                this.appendRichPathOrPlainRunForDisplay(runs, normalizedTarget);
              }
            }
            index = targetClose + 1;
            continue;
          }
        }
      }
      if (text.charAt(index) === '<') {
        const closing = text.indexOf('>', index + 1);
        if (closing > index + 1) {
          const candidate = text.substring(index, closing + 1);
          if (this.isAngleWrappedPathOrUri(candidate)) {
            this.appendRichPlainRun(runs, buffer);
            buffer = '';
            const normalizedCandidate = this.inlinePathDisplayText(candidate);
            this.appendRichPathOrPlainRunForDisplay(runs, normalizedCandidate);
            index = closing + 1;
            continue;
          }
        }
      }
      if (text.charAt(index) === '`') {
        const closing = text.indexOf('`', index + 1);
        if (closing > index + 1) {
          this.appendRichPlainRun(runs, buffer);
          buffer = '';
          const codeText = text.substring(index + 1, closing);
          this.appendRichPathOrPlainRun(runs, codeText, AgentHomeRichInlineKind.CODE);
          index = closing + 1;
          continue;
        }
      }
      if (index + 1 < text.length && text.substring(index, index + 2) === '**') {
        const closing = text.indexOf('**', index + 2);
        if (closing > index + 2 && this.canApplyMarkdownDelimiter(text, index, closing + 1)) {
          this.appendRichPlainRun(runs, buffer);
          buffer = '';
          this.appendRichRun(runs, AgentHomeRichInlineKind.STRONG, text.substring(index + 2, closing));
          index = closing + 2;
          continue;
        }
      }
      if (text.charAt(index) === '*') {
        const closing = text.indexOf('*', index + 1);
        if (closing > index + 1 && this.canApplyMarkdownDelimiter(text, index, closing)) {
          this.appendRichPlainRun(runs, buffer);
          buffer = '';
          this.appendRichRun(runs, AgentHomeRichInlineKind.EMPHASIS, text.substring(index + 1, closing));
          index = closing + 1;
          continue;
        }
      }
      buffer = buffer + text.charAt(index);
      index = index + 1;
    }
    this.appendRichPlainRun(runs, buffer);
    return runs;
  }

  private inlinePathDisplayText(text: string): string {
    let normalized = text.trim();
    if (this.isAngleWrappedPathOrUri(normalized)) {
      normalized = normalized.substring(1, normalized.length - 1).trim();
    }
    return normalized;
  }

  private inlineKindForLinkLabel(text: string): string {
    if (this.looksLikePathOrUri(text)) {
      return this.inlineKindForPathText(text);
    }
    return AgentHomeRichInlineKind.STRONG;
  }

  private inlineKindForPathText(text: string): string {
    if (this.shouldRenderPathAsInlineCode(text)) {
      return AgentHomeRichInlineKind.CODE;
    }
    return AgentHomeRichInlineKind.PLAIN;
  }

  private shouldRenderPathAsInlineCode(text: string): boolean {
    if (!this.looksLikePathOrUri(text)) {
      return false;
    }
    return text.length <= 64 && text.indexOf(' ') < 0;
  }

  private isRedundantMarkdownLinkTarget(label: string, target: string): boolean {
    return label === target || this.inlinePathDisplayText(label) === this.inlinePathDisplayText(target);
  }

  private canApplyMarkdownDelimiter(text: string, startIndex: number, endIndex: number): boolean {
    if (startIndex > 0) {
      const before = text.charAt(startIndex - 1);
      if (!this.isMarkdownDelimiterBoundary(before)) {
        return false;
      }
    }
    if (endIndex + 1 < text.length) {
      const after = text.charAt(endIndex + 1);
      if (!this.isMarkdownDelimiterBoundary(after)) {
        return false;
      }
    }
    return true;
  }

  private isMarkdownDelimiterBoundary(char: string): boolean {
    return char === ' ' ||
      char === '\n' ||
      char === '\t' ||
      char === '(' ||
      char === ')' ||
      char === '[' ||
      char === ']' ||
      char === '{' ||
      char === '}' ||
      char === ':' ||
      char === ';' ||
      char === ',' ||
      char === '.' ||
      char === '!' ||
      char === '?' ||
      char === '"' ||
      char === '\'';
  }

  private appendRichPlainRun(runs: Array<AgentHomeRichInlineRun>, text: string): void {
    if (text.length === 0) {
      return;
    }
    let token = '';
    for (let index = 0; index < text.length; index++) {
      const char = text.charAt(index);
      if (this.isRichPlainTokenSeparator(char)) {
        this.appendRichPlainToken(runs, token);
        token = '';
        this.appendRichRun(runs, AgentHomeRichInlineKind.PLAIN, char);
      } else {
        token = token + char;
      }
    }
    this.appendRichPlainToken(runs, token);
  }

  private appendRichPlainToken(runs: Array<AgentHomeRichInlineRun>, token: string): void {
    if (token.length === 0) {
      return;
    }
    const referencePath = this.clickableRichInlineTarget(token);
    if (referencePath.length > 0) {
      this.appendRichRun(runs, AgentHomeRichInlineKind.LINK, token, referencePath);
      return;
    }
    this.appendRichRun(runs, AgentHomeRichInlineKind.PLAIN, token);
  }

  private isRichPlainTokenSeparator(char: string): boolean {
    return char === ' ' ||
      char === '\n' ||
      char === '\t' ||
      char === ',' ||
      char === '，' ||
      char === '。' ||
      char === '、' ||
      char === ';' ||
      char === '；' ||
      char === '(' ||
      char === ')' ||
      char === '（' ||
      char === '）' ||
      char === '[' ||
      char === ']' ||
      char === '【' ||
      char === '】' ||
      char === '"' ||
      char === '\'' ||
      char === '“' ||
      char === '”';
  }

  private appendRichRun(runs: Array<AgentHomeRichInlineRun>, kind: string, text: string, target: string = ''): void {
    if (text.length === 0) {
      return;
    }
    runs.push(new AgentHomeRichInlineRun(
      kind + '_' + String(runs.length),
      kind,
      text,
      target
    ));
  }

  private inlineCodeTextBackgroundStyle(): TextBackgroundStyle {
    const style: TextBackgroundStyle = {
      color: this.isDarkMode ? $r('app.color.glass_bg_effect_strong') : $r('app.color.background_surface'),
      radius: 6
    };
    return style;
  }

  private inlineCodeTextBackgroundColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.glass_bg_effect_strong');
    }
    return $r('app.color.background_surface');
  }

  private inlineCodeTextColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_glass_value');
    }
    return $r('app.color.button_primary');
  }

  private codeBlockBackgroundColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.component_control_bg');
    }
    return $r('app.color.background_surface');
  }

  private codeBlockBorderColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.glass_border_light_dark');
    }
    return $r('app.color.card_border');
  }

  private codeBlockTextColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_white_high');
    }
    return $r('app.color.text_body');
  }

  private codeBlockMetaTextColor(): ResourceColor {
    if (this.isDarkMode) {
      return $r('app.color.text_glass_status');
    }
    return $r('app.color.text_secondary');
  }

  private headingFontSize(level: number): number {
    if (level <= 1) {
      return 19;
    }
    if (level === 2) {
      return 18;
    }
    return 17;
  }

  private headingLineHeight(level: number): number {
    if (level <= 1) {
      return 28;
    }
    return 26;
  }

  private currentEffectiveModelId(): string {
    const remoteSession = this.currentRemoteSession();
    if (remoteSession && remoteSession.modelId.length > 0 && remoteSession.modelId !== 'configured') {
      return remoteSession.modelId;
    }
    const session = this.currentSession();
    if (session && session.modelId.length > 0 && session.modelId !== 'configured') {
      return session.modelId;
    }
    if (this.selectedModelId.length > 0) {
      return this.selectedModelId;
    }
    return '';
  }

  private currentRemoteSession(): AgentBridgeRemoteSession | null {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0) {
      return null;
    }
    const providerId = this.currentSessionProviderId();
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.sessionId === bridgeSessionId && item.providerId === providerId) {
        return item;
      }
    }
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.sessionId === bridgeSessionId) {
        return item;
      }
    }
    return null;
  }

  private currentRemoteSourceText(): string {
    const remoteSession = this.currentRemoteSession();
    if (remoteSession && remoteSession.source.length > 0) {
      return remoteSession.source;
    }
    return this.resolveDetailEmptyText();
  }

  private currentRemoteMessageCountText(): string {
    const remoteSession = this.currentRemoteSession();
    if (remoteSession) {
      return String(remoteSession.messageCount);
    }
    return this.resolveDetailEmptyText();
  }

  private isSameModelId(left: string, right: string): boolean {
    if (left === right) {
      return true;
    }
    if (left.length === 0 || right.length === 0) {
      return false;
    }
    const leftBare = this.bareModelId(left);
    const rightBare = this.bareModelId(right);
    return leftBare === rightBare;
  }

  private bareModelId(modelId: string): string {
    const slashIndex = modelId.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex + 1 < modelId.length) {
      return modelId.substring(slashIndex + 1);
    }
    return modelId;
  }

  private buildComposerStatusText(): string {
    const hostContext = this.getUIContext().getHostContext();
    const parts: Array<string> = [];
    parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_model')) + ': ' + this.currentModelDisplayText());
    const permissionMode = this.currentPermissionModeDisplayText();
    if (permissionMode.length > 0) {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_detail_permission_mode')) + ': ' + permissionMode);
    }
    if (this.activeSessionId.length > 0) {
      parts.push(this.resolveReplyStateText());
    } else {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_idle')));
    }
    if (this.activeSessionId.length > 0 && this.activeToolName.length > 0) {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_tool')) + ': ' + this.activeToolName);
    }
    const visibleSubagentName = this.currentVisibleSubagentName();
    if (this.activeSessionId.length > 0 && visibleSubagentName.length > 0) {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_subagent')) + ': ' + visibleSubagentName);
    }
    if (this.shouldShowActiveTurnTimerRow() && this.activeTurnElapsedText.length > 0) {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_elapsed')) + ': ' + this.activeTurnElapsedText);
    }
    if (this.shouldShowContextCompactingDivider()) {
      parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_context_compacting')));
    }
    parts.push(resolveResourceString(hostContext, $r('app.string.agent_home_status_context')) + ': ' + this.currentContextUsageText());
    return parts.join(' · ');
  }

  private resolveReplyStateText(): string {
    const hostContext = this.getUIContext().getHostContext();
    if (this.replyState === AgentHomeReplyState.RESPONDING) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_status_replying'));
    }
    if (this.replyState === AgentHomeReplyState.TOOL_RUNNING) {
      return resolveResourceString(hostContext, $r('app.string.agent_home_status_tool_running'));
    }
    return resolveResourceString(hostContext, $r('app.string.agent_home_status_idle'));
  }

  private currentContextWindowText(): string {
    return this.currentContextLimitText();
  }

  private currentContextWindowValue(): number {
    const model = this.currentModelOption();
    if (model && model.contextWindow > 0) {
      return model.contextWindow;
    }
    return 0;
  }

  private currentContextLimitText(): string {
    const contextWindow = this.currentContextWindowValue();
    if (contextWindow > 0) {
      return this.formatTokenCount(contextWindow);
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_status_context_limit_unknown'));
  }

  private currentContextRemainingText(): string {
    const contextWindow = this.currentContextWindowValue();
    if (contextWindow <= 0) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_status_context_limit_unknown'));
    }
    const remaining = Math.max(0, contextWindow - this.estimateCurrentContextTokens());
    return this.formatTokenCount(remaining);
  }

  private currentContextUsageText(): string {
    const used = this.estimateCurrentContextTokens();
    const contextWindow = this.currentContextWindowValue();
    if (contextWindow <= 0) {
      return this.formatTokenCount(used) + ' / ' +
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_status_context_limit_unknown'));
    }
    const percent = Math.min(100, Math.round((used / contextWindow) * 100));
    return this.formatTokenCount(used) + ' / ' + this.formatTokenCount(contextWindow) + ' (' + String(percent) + '%)';
  }

  private currentContextUsagePercentValue(): number {
    const contextWindow = this.currentContextWindowValue();
    if (contextWindow <= 0) {
      return 0;
    }
    const used = this.estimateCurrentContextTokens();
    return Math.min(100, Math.round((used / contextWindow) * 100));
  }

  private estimateInputTokens(): number {
    let total = 0;
    const items = this.visibleMessages();
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.role === AgentHomeMessageRole.USER) {
        total = total + this.estimateTokensForText(item.text) + 4;
      }
    }
    if (this.draftText.trim().length > 0) {
      total = total + this.estimateTokensForText(this.draftText) + 4;
    }
    return total;
  }

  private estimateOutputTokens(): number {
    let total = 0;
    const items = this.visibleMessages();
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.role === AgentHomeMessageRole.ASSISTANT) {
        total = total + this.estimateTokensForText(item.text) + 4;
      }
    }
    return total;
  }

  private estimateCurrentContextTokens(): number {
    return this.estimateInputTokens() + this.estimateOutputTokens();
  }

  private estimateTokensForText(text: string): number {
    let cjkCount = 0;
    let otherCount = 0;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x30FF) || (code >= 0xAC00 && code <= 0xD7AF)) {
        cjkCount = cjkCount + 1;
      } else if (code > 32) {
        otherCount = otherCount + 1;
      }
    }
    return Math.max(0, Math.ceil(cjkCount + otherCount / 4));
  }

  private activeSessionMessageCount(): number {
    return this.visibleMessages().length;
  }

  private estimateCurrentCostText(): string {
    const modelId = this.currentEffectiveModelId().toLowerCase();
    if (modelId.indexOf('free') >= 0) {
      return '$0.00';
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_detail_pricing_not_configured'));
  }

  private currentPricingSourceText(): string {
    const modelId = this.currentEffectiveModelId().toLowerCase();
    if (modelId.indexOf('free') >= 0) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_detail_pricing_free_model'));
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_detail_pricing_not_configured'));
  }

  private resolveDetailValue(value: string): string {
    if (value.length > 0) {
      return value;
    }
    return this.resolveDetailEmptyText();
  }

  private resolveDetailEmptyText(): string {
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_detail_empty'));
  }

  private formatContextWindow(value: number): string {
    return this.formatTokenCount(value);
  }

  private formatTokenCount(value: number): string {
    if (value >= 1000000) {
      return String(Math.round(value / 100000) / 10) + 'M';
    }
    if (value >= 1000) {
      return String(Math.round(value / 100) / 10) + 'K';
    }
    return String(value);
  }

  private resolveComposerStatusColor(): ResourceColor {
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return $r('app.color.tag_amber');
    }
    if (this.activeSessionId.length > 0 && this.replyState === AgentHomeReplyState.TOOL_RUNNING) {
      return $r('app.color.tag_amber');
    }
    if (this.activeSessionId.length > 0 && this.replyState === AgentHomeReplyState.RESPONDING) {
      return $r('app.color.button_primary');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.color.tag_green');
    }
    return $r('app.color.text_secondary');
  }

  private resolveComposerProgressValue(): number {
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return 100;
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return 32;
    }
    if (this.activeSessionId.length > 0 && this.replyState === AgentHomeReplyState.TOOL_RUNNING) {
      return 76;
    }
    if (this.activeSessionId.length > 0 && this.replyState === AgentHomeReplyState.RESPONDING) {
      return 62;
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return 100;
    }
    return 0;
  }

  private currentProviderTools(): Array<AgentBridgeToolOption> {
    return this.currentProviderOption().tools;
  }

  private hasProvider(providerId: string): boolean {
    for (let index = 0; index < this.providerOptions.length; index++) {
      if (this.providerOptions[index].id === providerId) {
        return true;
      }
    }
    return false;
  }

  private hasModel(modelId: string, models: Array<AgentBridgeModelOption>): boolean {
    for (let index = 0; index < models.length; index++) {
      if (this.isSameModelId(models[index].id, modelId)) {
        return true;
      }
    }
    return false;
  }

  private shouldPreserveExternalModelId(models: Array<AgentBridgeModelOption>): boolean {
    if (this.selectedModelId.length === 0) {
      return false;
    }
    return models.length === 1 && models[0].id === 'configured';
  }

  private hasSpeedMode(speedMode: string, modes: Array<AgentBridgeSpeedModeOption>): boolean {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].id === speedMode) {
        return true;
      }
    }
    return false;
  }

  private hasReasoningMode(reasoningMode: string, modes: Array<AgentBridgeReasoningModeOption>): boolean {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].id === reasoningMode) {
        return true;
      }
    }
    return false;
  }

  private hasInteractionMode(modeId: string, modes: Array<AgentBridgeInteractionModeOption>): boolean {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].id === modeId) {
        return true;
      }
    }
    return false;
  }

  private defaultModelId(models: Array<AgentBridgeModelOption>): string {
    for (let index = 0; index < models.length; index++) {
      if (models[index].isDefault) {
        return models[index].id;
      }
    }
    return models[0].id;
  }

  private defaultSpeedModeId(modes: Array<AgentBridgeSpeedModeOption>): string {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].isDefault) {
        return modes[index].id;
      }
    }
    return modes[0].id;
  }

  private defaultReasoningModeId(modes: Array<AgentBridgeReasoningModeOption>): string {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].isDefault) {
        return modes[index].id;
      }
    }
    return modes[0].id;
  }

  private defaultInteractionModeId(modes: Array<AgentBridgeInteractionModeOption>): string {
    for (let index = 0; index < modes.length; index++) {
      if (modes[index].isDefault) {
        return modes[index].id;
      }
    }
    return modes[0].id;
  }

  private defaultInteractionModeIdForCategory(modes: Array<AgentBridgeInteractionModeOption>, category: string): string {
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (this.normalizedInteractionModeCategory(mode.category) === category && mode.isDefault) {
        return mode.id;
      }
    }
    for (let index = 0; index < modes.length; index++) {
      const mode = modes[index];
      if (this.normalizedInteractionModeCategory(mode.category) === category) {
        return mode.id;
      }
    }
    return '';
  }

  private currentWorkspaceTitle(): string {
    const workspace = this.currentWorkspace();
    if (workspace) {
      return workspace.title;
    }
    return '-';
  }

  private currentWorkspacePath(): string {
    const workspace = this.currentWorkspace();
    if (workspace) {
      return workspace.subtitle;
    }
    return '';
  }

  private currentWorkspacePathForDisplay(): string {
    const path = this.currentWorkspacePath();
    if (path.length > 0) {
      return path;
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_workspace_path_empty'));
  }

  private currentConnectedDeviceText(): string {
    if (this.bridgeEndpoint.length > 0) {
      return this.bridgeEndpoint;
    }
    return this.resolveDetailEmptyText();
  }

  private importedSessionSummaryText(): string {
    let count = 0;
    for (let index = 0; index < this.sessions.length; index++) {
      if (this.sessions[index].bridgeSessionId.length > 0) {
        count = count + 1;
      }
    }
    return String(count);
  }

  private currentSessionStatusText(): string {
    const remoteSession = this.currentRemoteSession();
    if (remoteSession && remoteSession.status.length > 0) {
      return remoteSession.status;
    }
    return this.resolveDetailEmptyText();
  }

  private sessionVisualStatus(session: AgentHomeSessionItem): string {
    if (this.sessionHasErrorState(session)) {
      return AgentHomeSessionVisualStatus.ERROR;
    }
    if (this.sessionNeedsAttention(session)) {
      return AgentHomeSessionVisualStatus.WARNING;
    }
    if (this.sessionIsRunning(session)) {
      return AgentHomeSessionVisualStatus.RUNNING;
    }
    return AgentHomeSessionVisualStatus.COMPLETED;
  }

  private sessionStatusColor(session: AgentHomeSessionItem): ResourceColor {
    return this.colorForSessionVisualStatus(this.sessionVisualStatus(session));
  }

  private colorForSessionVisualStatus(status: string): ResourceColor {
    if (status === AgentHomeSessionVisualStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    if (status === AgentHomeSessionVisualStatus.WARNING) {
      return $r('app.color.tag_amber');
    }
    if (status === AgentHomeSessionVisualStatus.RUNNING) {
      return $r('app.color.tag_blue');
    }
    return $r('app.color.tag_green');
  }

  private symbolForSessionVisualStatus(status: string): Resource {
    if (status === AgentHomeSessionVisualStatus.ERROR) {
      return $r('sys.symbol.xmark_circle_fill');
    }
    if (status === AgentHomeSessionVisualStatus.WARNING) {
      return $r('sys.symbol.exclamationmark_triangle_fill');
    }
    if (status === AgentHomeSessionVisualStatus.RUNNING) {
      return $r('sys.symbol.dot_radiowaves');
    }
    return $r('sys.symbol.checkmark_circle_fill');
  }

  private sessionStatusPulseOuterOpacity(): number {
    return this.sessionStatusPulseValue > 0 ? 0.08 : 0.26;
  }

  private sessionStatusPulseOuterScale(): number {
    return this.sessionStatusPulseValue > 0 ? 1.28 : 0.74;
  }

  private sessionHasErrorState(session: AgentHomeSessionItem): boolean {
    if (session.id === this.activeSessionId && this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return true;
    }
    if (this.isErrorSessionStatus(this.remoteSessionStatusForSession(session))) {
      return true;
    }
    if (!this.sessionIsManuallyStopped(session) && this.latestToolCallStatusForSession(session) === AgentHomeToolCallStatus.ERROR) {
      return true;
    }
    return this.sessionHasErroredInteraction(session);
  }

  private sessionNeedsAttention(session: AgentHomeSessionItem): boolean {
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.sessionReferenceMatches(item.sessionId, session) && this.isPendingInteractionStatus(item.status)) {
        return true;
      }
    }
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.sessionReferenceMatches(item.sessionId, session) && this.isPendingInteractionStatus(item.status)) {
        return true;
      }
    }
    return false;
  }

  private sessionIsRunning(session: AgentHomeSessionItem): boolean {
    if (this.sessionIsManuallyStopped(session)) {
      return false;
    }
    if (session.id === this.activeSessionId && this.isReplyInProgress()) {
      return true;
    }
    if (this.isRunningSessionStatus(this.remoteSessionStatusForSession(session))) {
      return true;
    }
    return this.latestToolCallStatusForSession(session) === AgentHomeToolCallStatus.RUNNING;
  }

  private sessionIsManuallyStopped(session: AgentHomeSessionItem): boolean {
    return this.stoppedBridgeSessionId.length > 0 &&
      session.bridgeSessionId.length > 0 &&
      session.bridgeSessionId === this.stoppedBridgeSessionId;
  }

  private sessionHasErroredInteraction(session: AgentHomeSessionItem): boolean {
    for (let index = 0; index < this.userRequests.length; index++) {
      const item = this.userRequests[index];
      if (this.sessionReferenceMatches(item.sessionId, session) && item.status.toLowerCase() === AgentHomeInteractionStatus.ERROR) {
        return true;
      }
    }
    for (let index = 0; index < this.plans.length; index++) {
      const item = this.plans[index];
      if (this.sessionReferenceMatches(item.sessionId, session) && item.status.toLowerCase() === AgentHomeInteractionStatus.ERROR) {
        return true;
      }
    }
    return false;
  }

  private isPendingInteractionStatus(status: string): boolean {
    const value = status.toLowerCase();
    return value === AgentHomeInteractionStatus.PENDING ||
      value === 'requested' ||
      value === 'waiting' ||
      value === 'awaiting' ||
      value === 'approval_required' ||
      value.indexOf('pending') >= 0 ||
      value.indexOf('approval') >= 0;
  }

  private isErrorSessionStatus(status: string): boolean {
    const value = status.toLowerCase();
    return value === 'error' ||
      value === 'failed' ||
      value === 'failure' ||
      value === 'crashed' ||
      value === 'timeout' ||
      value.indexOf('error') >= 0 ||
      value.indexOf('failed') >= 0 ||
      value.indexOf('failure') >= 0 ||
      value.indexOf('crash') >= 0;
  }

  private isRunningSessionStatus(status: string): boolean {
    const value = status.toLowerCase();
    return value === 'running' ||
      value === 'busy' ||
      value === 'responding' ||
      value === 'working' ||
      value === 'active' ||
      value === 'retry' ||
      value.indexOf('running') >= 0 ||
      value.indexOf('busy') >= 0 ||
      value.indexOf('responding') >= 0 ||
      value.indexOf('working') >= 0;
  }

  private latestToolCallStatusForSession(session: AgentHomeSessionItem): string {
    let latestStatus = '';
    let latestUpdatedAt = 0;
    for (let index = 0; index < this.toolCalls.length; index++) {
      const item = this.toolCalls[index];
      if (this.sessionReferenceMatches(item.sessionId, session) && item.updatedAt >= latestUpdatedAt) {
        latestStatus = this.normalizeToolCallStatus(item.status);
        latestUpdatedAt = item.updatedAt;
      }
    }
    return latestStatus;
  }

  private sessionReferenceMatches(value: string, session: AgentHomeSessionItem): boolean {
    if (value === session.id) {
      return true;
    }
    return session.bridgeSessionId.length > 0 && value === session.bridgeSessionId;
  }

  private remoteSessionStatusForSession(session: AgentHomeSessionItem): string {
    if (session.bridgeSessionId.length === 0) {
      return '';
    }
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.sessionId === session.bridgeSessionId && item.providerId === session.providerId && item.status.length > 0) {
        return item.status;
      }
    }
    for (let index = 0; index < this.remoteSessions.length; index++) {
      const item = this.remoteSessions[index];
      if (item.sessionId === session.bridgeSessionId && item.status.length > 0) {
        return item.status;
      }
    }
    return '';
  }

  private sessionStatusText(session: AgentHomeSessionItem): string {
    if (session.bridgeSessionId.length === 0) {
      return this.resolveDetailEmptyText();
    }
    const status = this.remoteSessionStatusForSession(session);
    if (status.length > 0) {
      return status;
    }
    return this.resolveDetailEmptyText();
  }

  private currentBranchName(): string {
    const session = this.currentSession();
    if (session) {
      return session.branchName;
    }
    const workspace = this.currentWorkspace();
    if (workspace) {
      return workspace.branchName;
    }
    return 'main';
  }

  private currentSessionTitle(): string {
    const session = this.currentSession();
    if (session) {
      return session.title;
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_new_session'));
  }

  private currentLocalSessionIdText(): string {
    const session = this.currentSession();
    if (session && session.id.length > 0) {
      return session.id;
    }
    return this.resolveDetailEmptyText();
  }

  private currentSessionUpdatedText(): string {
    const session = this.currentSession();
    if (session && session.updatedAt > 0) {
      return this.formatDateTime(session.updatedAt);
    }
    return this.resolveDetailEmptyText();
  }

  private currentBridgeSessionId(): string {
    const session = this.currentSession();
    if (session) {
      return session.bridgeSessionId;
    }
    return '';
  }

  private canRevertToMessage(item: AgentHomeChatItem): boolean {
    return this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED &&
      item.sessionId === this.activeSessionId &&
      item.messageId.length > 0 &&
      this.currentBridgeSessionId().length > 0 &&
      this.isCurrentProviderRevertCapable();
  }

  private isCurrentProviderRevertCapable(): boolean {
    const providerId = this.currentSessionProviderId();
    return providerId === AgentBridgeProviderId.OPENCODE ||
      providerId === AgentBridgeProviderId.DEVECO ||
      providerId === AgentBridgeProviderId.MIMO;
  }

  private isOpenCodeCompatibleProvider(): boolean {
    return this.isCurrentProviderRevertCapable();
  }

  private confirmRevertToMessage(item: AgentHomeChatItem): void {
    if (!this.canRevertToMessage(item)) {
      this.showTransientStatus(
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_revert_missing_node'))
      );
      return;
    }
    this.getUIContext().showAlertDialog({
      title: resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_revert_confirm_title')),
      message: resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_revert_confirm_message')),
      primaryButton: {
        value: resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_revert_to_message')),
        action: (): void => {
          this.revertToMessage(item);
        }
      },
      secondaryButton: {
        value: resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_cancel')),
        action: (): void => {}
      }
    });
  }

  private revertToMessage(item: AgentHomeChatItem): void {
    const bridgeSessionId = this.currentBridgeSessionId();
    if (bridgeSessionId.length === 0 || item.messageId.length === 0) {
      return;
    }
    this.client.revertSession(bridgeSessionId, item.messageId);
    this.showTransientStatus(
      resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_revert_success'))
    );
  }

  private hasPreviewForActiveSession(): boolean {
    return this.latestPreviewForActiveSession() !== null;
  }

  private latestPreviewPath(): string {
    const item = this.latestPreviewForActiveSession();
    if (item) {
      return item.path;
    }
    return '';
  }

  private latestPreviewMediaType(): string {
    const item = this.latestPreviewForActiveSession();
    if (item) {
      return item.mediaType;
    }
    return '';
  }

  private latestPreviewContent(): string {
    const item = this.latestPreviewForActiveSession();
    if (item) {
      return this.normalizedPreviewContentForKind(item.path, item.mediaType, item.content);
    }
    return '';
  }

  private latestPreviewContentKind(): string {
    return this.workspacePreviewContentKind(this.latestPreviewPath(), this.latestPreviewMediaType());
  }

  private activeWorkspacePreviewContent(): string {
    const item = this.activeWorkspacePreviewItem();
    if (item !== null) {
      return this.normalizedPreviewContentForKind(item.path, item.mediaType, item.content);
    }
    return '';
  }

  private activeWorkspacePreviewContentKind(): string {
    const item = this.activeWorkspacePreviewItem();
    if (item !== null) {
      return this.workspacePreviewContentKind(item.path, item.mediaType);
    }
    return this.workspacePreviewContentKind(this.activeWorkspacePreviewPath, '');
  }

  private activeWorkspacePreviewMediaType(): string {
    const item = this.activeWorkspacePreviewItem();
    if (item !== null) {
      return item.mediaType;
    }
    return '';
  }

  private isActiveWorkspacePreviewMedia(): boolean {
    const kind = this.activeWorkspacePreviewContentKind();
    return kind === NGFRichContentKind.SVG || kind === NGFRichContentKind.IMAGE;
  }

  private isActiveWorkspacePreviewCodeContent(): boolean {
    return this.isWorkspacePreviewCodeContent(
      this.activeWorkspacePreviewPath,
      this.activeWorkspacePreviewMediaType(),
      this.activeWorkspacePreviewContentKind()
    );
  }

  private isWorkspacePreviewCodeContent(pathValue: string, mediaTypeValue: string, kind: string): boolean {
    if (kind === NGFRichContentKind.SVG || kind === NGFRichContentKind.IMAGE ||
      kind === NGFRichContentKind.HTML || kind === NGFRichContentKind.MARKDOWN) {
      return false;
    }
    const mediaType = mediaTypeValue.toLowerCase();
    if (mediaType.indexOf('json') >= 0 || mediaType.indexOf('javascript') >= 0 ||
      mediaType.indexOf('typescript') >= 0 || mediaType.indexOf('xml') >= 0 ||
      mediaType.indexOf('yaml') >= 0) {
      return true;
    }
    return this.isWorkspacePreviewCodePath(pathValue.toLowerCase());
  }

  private isActiveWorkspacePreviewImageDownloadPending(): boolean {
    return this.pendingWorkspacePreviewImagePath.length > 0 &&
      this.pendingWorkspacePreviewImagePath === this.normalizeWorkspaceFilePath(this.activeWorkspacePreviewPath);
  }

  private activeWorkspacePreviewItem(): AgentHomePreviewItem | null {
    return this.previewItemForWorkspacePath(this.activeWorkspacePreviewPath);
  }

  private previewItemForWorkspacePath(path: string): AgentHomePreviewItem | null {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    for (let index = 0; index < this.previews.length; index++) {
      const item = this.previews[index];
      if (item.sessionId === this.activeSessionId && this.normalizeWorkspaceFilePath(item.path) === normalizedPath) {
        return item;
      }
    }
    return null;
  }

  private workspacePreviewContentKind(pathValue: string, mediaTypeValue: string): string {
    const mediaType = mediaTypeValue.toLowerCase();
    const path = pathValue.toLowerCase();
    if (mediaType.indexOf('image/svg') >= 0 || path.endsWith('.svg')) {
      return NGFRichContentKind.SVG;
    }
    if (mediaType.startsWith('image/') || this.isWorkspacePreviewRasterImagePath(path)) {
      return NGFRichContentKind.IMAGE;
    }
    if (mediaType.indexOf('html') >= 0 || path.endsWith('.html') || path.endsWith('.htm')) {
      return NGFRichContentKind.HTML;
    }
    if (mediaType.indexOf('markdown') >= 0 || path.endsWith('.md') || path.endsWith('.markdown')) {
      return NGFRichContentKind.MARKDOWN;
    }
    return NGFRichContentKind.PLAIN;
  }

  private isWorkspacePreviewCodePath(path: string): boolean {
    return path.endsWith('.ets') ||
      path.endsWith('.ts') ||
      path.endsWith('.tsx') ||
      path.endsWith('.js') ||
      path.endsWith('.jsx') ||
      path.endsWith('.mjs') ||
      path.endsWith('.cjs') ||
      path.endsWith('.json') ||
      path.endsWith('.json5') ||
      path.endsWith('.css') ||
      path.endsWith('.scss') ||
      path.endsWith('.less') ||
      path.endsWith('.xml') ||
      path.endsWith('.yml') ||
      path.endsWith('.yaml') ||
      path.endsWith('.toml') ||
      path.endsWith('.ini') ||
      path.endsWith('.properties') ||
      path.endsWith('.java') ||
      path.endsWith('.kt') ||
      path.endsWith('.swift') ||
      path.endsWith('.c') ||
      path.endsWith('.h') ||
      path.endsWith('.cpp') ||
      path.endsWith('.hpp') ||
      path.endsWith('.cs') ||
      path.endsWith('.go') ||
      path.endsWith('.rs') ||
      path.endsWith('.py') ||
      path.endsWith('.rb') ||
      path.endsWith('.php') ||
      path.endsWith('.sh') ||
      path.endsWith('.ps1') ||
      path.endsWith('.bat') ||
      path.endsWith('.cmd') ||
      path.endsWith('.gradle') ||
      path.endsWith('.cmake') ||
      path.endsWith('cmakelists.txt') ||
      path.endsWith('makefile') ||
      path.endsWith('dockerfile');
  }

  private isWorkspacePreviewRasterImagePath(path: string): boolean {
    return path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.jpeg') ||
      path.endsWith('.webp') ||
      path.endsWith('.gif') ||
      path.endsWith('.bmp') ||
      path.endsWith('.ico') ||
      path.endsWith('.avif') ||
      path.endsWith('.apng') ||
      path.endsWith('.heic') ||
      path.endsWith('.heif') ||
      path.endsWith('.tif') ||
      path.endsWith('.tiff');
  }

  private workspaceRasterMediaTypeForPath(path: string): string {
    const extension = this.rasterPreviewExtension(path, '');
    if (extension === 'jpg') {
      return 'image/jpeg';
    }
    if (extension === 'ico') {
      return 'image/x-icon';
    }
    if (extension === 'tiff') {
      return 'image/tiff';
    }
    return 'image/' + extension;
  }

  private normalizePersistedPreviewItems(items: Array<AgentHomePreviewItem>): Array<AgentHomePreviewItem> {
    const nextItems: Array<AgentHomePreviewItem> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const normalizedContent = this.normalizedPreviewContentForKind(item.path, item.mediaType, item.content);
      const materializedContent = this.materializedPreviewContentForKind(item.id, item.path, item.mediaType, normalizedContent);
      if (materializedContent !== item.content) {
        const migratedItem = new AgentHomePreviewItem(
          item.id,
          item.sessionId,
          item.path,
          item.mediaType,
          materializedContent,
          item.updatedAt
        );
        nextItems.push(migratedItem);
        this.persistPreview(migratedItem);
      } else {
        nextItems.push(item);
      }
    }
    return nextItems;
  }

  private materializedPreviewContentForKind(previewId: string, path: string, mediaType: string, content: string): string {
    if (this.workspacePreviewContentKind(path, mediaType) !== NGFRichContentKind.IMAGE) {
      return content;
    }
    if (this.isRasterPreviewFileContent(content)) {
      return content;
    }
    if (!this.isRasterPreviewDataUrl(content)) {
      return content;
    }
    const cachedContent = this.writeRasterPreviewDataUrl(previewId, path, mediaType, content);
    return cachedContent.length > 0 ? cachedContent : content;
  }

  private writeRasterPreviewDataUrl(previewId: string, path: string, mediaType: string, content: string): string {
    const imageBuffer = this.rasterPreviewBufferFromDataUrl(content);
    if (imageBuffer === null) {
      return '';
    }
    return this.writeRasterPreviewBuffer(previewId, path, mediaType, imageBuffer);
  }

  private rasterPreviewBufferFromDataUrl(content: string): ArrayBuffer | null {
    const trimmed = content.trim();
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex < 0 || commaIndex + 1 >= trimmed.length) {
      return null;
    }
    const base64Content = trimmed.substring(commaIndex + 1);
    try {
      const base64Helper: util.Base64Helper = new util.Base64Helper();
      const imageBytes: Uint8Array = base64Helper.decodeSync(base64Content);
      if (imageBytes.length <= 0) {
        return null;
      }
      const imageBuffer: ArrayBuffer = new ArrayBuffer(imageBytes.length);
      const targetBytes: Uint8Array = new Uint8Array(imageBuffer);
      targetBytes.set(imageBytes);
      return imageBuffer;
    } catch (error) {
      logger.warn(TAG, 'decode raster preview data url failed: ' + this.errorToString(error));
    }
    return null;
  }

  private rasterPreviewDataUrlFromBuffer(buffer: ArrayBuffer, mediaType: string): string {
    try {
      const base64Helper: util.Base64Helper = new util.Base64Helper();
      const encodedBytes: Uint8Array = base64Helper.encodeSync(new Uint8Array(buffer));
      const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
      const normalizedMediaType = mediaType.length > 0 ? mediaType : 'image/png';
      return 'data:' + normalizedMediaType + ';base64,' + decoder.decodeToString(encodedBytes);
    } catch (error) {
      logger.warn(TAG, 'encode raster preview data url failed: ' + this.errorToString(error));
    }
    return 'agent-preview-pixelmap:' + String(Date.now());
  }

  private writeRasterPreviewBuffer(previewId: string, path: string, mediaType: string, imageBuffer: ArrayBuffer): string {
    const fileName = this.safePreviewImageFileName(previewId, path, mediaType);
    const absoluteDirectory = this.previewCacheDirectoryPath();
    if (absoluteDirectory.length > 0) {
      const absolutePath = absoluteDirectory + '/' + fileName;
      if (FileUtils.createDirectory(absoluteDirectory, true) && FileUtils.writeBytes(absolutePath, imageBuffer)) {
        return absolutePath;
      }
    }
    const relativeDirectory = AGENT_HOME_PREVIEW_CACHE_DIR;
    const relativePath = relativeDirectory + '/' + fileName;
    if (FileUtils.createDirectory(relativeDirectory, true) && FileUtils.writeBytes(relativePath, imageBuffer)) {
      return relativePath;
    }
    return '';
  }

  private previewCacheDirectoryPath(): string {
    const ctx = uiContextManager.getAbilityContext();
    if (ctx !== null && ctx.filesDir.length > 0) {
      return ctx.filesDir + '/' + AGENT_HOME_PREVIEW_CACHE_DIR;
    }
    return '';
  }

  private safePreviewImageFileName(previewId: string, path: string, mediaType: string): string {
    let baseName = this.safeDownloadFileName(this.fileNameFromPath(path));
    if (baseName.length === 0) {
      baseName = previewId;
    }
    baseName = baseName.split('?').join('_')
      .split('#').join('_')
      .split('&').join('_')
      .split('=').join('_')
      .split('%').join('_')
      .split('"').join('_')
      .split("'").join('_')
      .split('<').join('_')
      .split('>').join('_')
      .split('|').join('_')
      .split('*').join('_');
    if (!this.isWorkspacePreviewRasterImagePath(baseName.toLowerCase())) {
      baseName = baseName + '.' + this.rasterPreviewExtension(path, mediaType);
    }
    return previewId + '_' + baseName;
  }

  private rasterPreviewExtension(path: string, mediaType: string): string {
    const lowerPath = path.toLowerCase();
    const lowerMediaType = mediaType.toLowerCase();
    if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || lowerMediaType.indexOf('jpeg') >= 0 || lowerMediaType.indexOf('jpg') >= 0) {
      return 'jpg';
    }
    if (lowerPath.endsWith('.webp') || lowerMediaType.indexOf('webp') >= 0) {
      return 'webp';
    }
    if (lowerPath.endsWith('.gif') || lowerMediaType.indexOf('gif') >= 0) {
      return 'gif';
    }
    if (lowerPath.endsWith('.bmp') || lowerMediaType.indexOf('bmp') >= 0) {
      return 'bmp';
    }
    if (lowerPath.endsWith('.ico') || lowerMediaType.indexOf('icon') >= 0) {
      return 'ico';
    }
    if (lowerPath.endsWith('.avif') || lowerMediaType.indexOf('avif') >= 0) {
      return 'avif';
    }
    if (lowerPath.endsWith('.apng') || lowerMediaType.indexOf('apng') >= 0) {
      return 'apng';
    }
    if (lowerPath.endsWith('.heic') || lowerMediaType.indexOf('heic') >= 0) {
      return 'heic';
    }
    if (lowerPath.endsWith('.heif') || lowerMediaType.indexOf('heif') >= 0) {
      return 'heif';
    }
    if (lowerPath.endsWith('.tif') || lowerPath.endsWith('.tiff') || lowerMediaType.indexOf('tiff') >= 0) {
      return 'tiff';
    }
    return 'png';
  }

  private workspacePreviewImageSource(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('file://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return 'file://' + trimmed;
    }
    if (trimmed.startsWith(AGENT_HOME_PREVIEW_CACHE_DIR + '/')) {
      const ctx = uiContextManager.getAbilityContext();
      if (ctx !== null && ctx.filesDir.length > 0) {
        return 'file://' + ctx.filesDir + '/' + trimmed;
      }
    }
    return trimmed;
  }

  private activeWorkspaceRasterPreviewImageSource(content: string): PixelMap | ResourceStr {
    if (this.activeWorkspacePreviewPixelMap !== null &&
      this.activeWorkspacePreviewPixelMapPath === this.normalizeWorkspaceFilePath(this.activeWorkspacePreviewPath)) {
      return this.activeWorkspacePreviewPixelMap;
    }
    return this.workspacePreviewImageSource(content);
  }

  private latestWorkspaceRasterPreviewImageSource(content: string): PixelMap | ResourceStr {
    const latestPath = this.normalizeWorkspaceFilePath(this.latestPreviewPath());
    if (this.activeWorkspacePreviewPixelMap !== null && this.activeWorkspacePreviewPixelMapPath === latestPath) {
      return this.activeWorkspacePreviewPixelMap;
    }
    return this.workspacePreviewImageSource(content);
  }

  private async updateActiveWorkspacePreviewPixelMap(buffer: ArrayBuffer, path: string): Promise<void> {
    const normalizedPath = this.normalizeWorkspaceFilePath(path);
    this.releaseActiveWorkspacePreviewPixelMap();
    const source: image.ImageSource = image.createImageSource(buffer);
    try {
      const pixelMap: PixelMap = await source.createPixelMap();
      this.activeWorkspacePreviewPixelMap = pixelMap;
      this.activeWorkspacePreviewPixelMapPath = normalizedPath;
      logger.info(TAG, 'preview image pixel map decoded: path=' + normalizedPath + ', bytes=' + String(buffer.byteLength));
    } finally {
      source.release().catch((error: Error): void => {
        logger.warn(TAG, 'release preview image source failed: ' + this.errorToString(error));
      });
    }
  }

  private releaseActiveWorkspacePreviewPixelMapIfNeeded(nextPath: string): void {
    const normalizedPath = this.normalizeWorkspaceFilePath(nextPath);
    if (this.activeWorkspacePreviewPixelMapPath.length > 0 && this.activeWorkspacePreviewPixelMapPath !== normalizedPath) {
      this.releaseActiveWorkspacePreviewPixelMap();
    }
  }

  private releaseActiveWorkspacePreviewPixelMap(): void {
    const pixelMap = this.activeWorkspacePreviewPixelMap;
    this.activeWorkspacePreviewPixelMap = null;
    this.activeWorkspacePreviewPixelMapPath = '';
    if (pixelMap !== null) {
      pixelMap.release().catch((error: Error): void => {
        logger.warn(TAG, 'release preview pixel map failed: ' + this.errorToString(error));
      });
    }
  }

  private normalizedPreviewContentForKind(path: string, mediaType: string, content: string): string {
    if (this.isInvalidMediaPreviewContent(path, mediaType, content)) {
      return '';
    }
    return content;
  }

  private isInvalidMediaPreviewContent(path: string, mediaType: string, content: string): boolean {
    const kind = this.workspacePreviewContentKind(path, mediaType);
    if (kind === NGFRichContentKind.SVG) {
      return !this.isValidSvgPreviewContent(content);
    }
    if (kind === NGFRichContentKind.IMAGE) {
      return !this.isValidRasterPreviewContent(content);
    }
    return false;
  }

  private isValidSvgPreviewContent(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }
    return normalized.startsWith('<svg') ||
      (normalized.startsWith('<?xml') && normalized.indexOf('<svg') >= 0) ||
      (normalized.startsWith('<!doctype') && normalized.indexOf('<svg') >= 0);
  }

  private isValidRasterPreviewContent(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    return this.isRasterPreviewFileContent(content) ||
      normalized.startsWith('data:image/png;base64,') ||
      normalized.startsWith('data:image/jpeg;base64,') ||
      normalized.startsWith('data:image/jpg;base64,') ||
      normalized.startsWith('data:image/webp;base64,') ||
      normalized.startsWith('data:image/gif;base64,') ||
      normalized.startsWith('data:image/bmp;base64,') ||
      normalized.startsWith('data:image/x-icon;base64,') ||
      normalized.startsWith('data:image/vnd.microsoft.icon;base64,') ||
      normalized.startsWith('data:image/avif;base64,') ||
      normalized.startsWith('data:image/apng;base64,') ||
      normalized.startsWith('data:image/heic;base64,') ||
      normalized.startsWith('data:image/heif;base64,') ||
      normalized.startsWith('data:image/tiff;base64,');
  }

  private isRasterPreviewDataUrl(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    return normalized.startsWith('data:image/') && normalized.indexOf(';base64,') > 0;
  }

  private isRasterPreviewFileContent(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.startsWith(AGENT_HOME_PREVIEW_CACHE_DIR + '/')) {
      return true;
    }
    if (trimmed.startsWith('file://') || trimmed.startsWith('/')) {
      return true;
    }
    return false;
  }

  private latestPreviewForActiveSession(): AgentHomePreviewItem | null {
    for (let index = 0; index < this.previews.length; index++) {
      const item = this.previews[index];
      if (item.sessionId === this.activeSessionId) {
        return item;
      }
    }
    return null;
  }

  private currentWorkspace(): AgentHomeWorkspaceItem | null {
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id === this.activeWorkspaceId) {
        return item;
      }
    }
    return null;
  }

  private findWorkspaceById(workspaceId: string): AgentHomeWorkspaceItem | null {
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (item.id === workspaceId) {
        return item;
      }
    }
    return null;
  }

  private findWorkspaceByPath(workspacePath: string): AgentHomeWorkspaceItem | null {
    for (let index = 0; index < this.workspaces.length; index++) {
      const item = this.workspaces[index];
      if (this.workspacePathEquals(item.subtitle, workspacePath)) {
        return item;
      }
    }
    return null;
  }

  private workspaceTitleFromPath(workspacePath: string): string {
    const slashIndex = workspacePath.lastIndexOf('/');
    const backslashIndex = workspacePath.lastIndexOf('\\');
    const separatorIndex = Math.max(slashIndex, backslashIndex);
    if (separatorIndex >= 0 && separatorIndex + 1 < workspacePath.length) {
      return workspacePath.substring(separatorIndex + 1);
    }
    if (workspacePath.length > 0) {
      return workspacePath;
    }
    return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_default_workspace_title'));
  }

  private currentSession(): AgentHomeSessionItem | null {
    for (let index = 0; index < this.sessions.length; index++) {
      const item = this.sessions[index];
      if (item.id === this.activeSessionId) {
        return item;
      }
    }
    return null;
  }

  private hasActiveSession(): boolean {
    return this.currentSession() !== null;
  }

  private currentSessionProviderId(): string {
    const session = this.currentSession();
    if (session && session.providerId.length > 0) {
      return session.providerId;
    }
    return this.selectedProviderId;
  }

  private resolveConnectionStatusText(): ResourceStr {
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.string.agent_home_bridge_connected');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return $r('app.string.agent_home_bridge_connecting');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('app.string.agent_home_bridge_error');
    }
    return $r('app.string.agent_home_bridge_disconnected');
  }

  private resolveSelectedProviderLabel(): ResourceStr {
    if (this.selectedProviderId === AgentBridgeProviderId.OPENCODE) {
      return $r('app.string.agent_bridge_provider_opencode');
    }
    if (this.selectedProviderId === AgentBridgeProviderId.DEVECO) {
      return $r('app.string.agent_bridge_provider_deveco');
    }
    if (this.selectedProviderId === AgentBridgeProviderId.MIMO) {
      return $r('app.string.agent_bridge_provider_mimo');
    }
    if (this.selectedProviderId === AgentBridgeProviderId.CODEX) {
      return $r('app.string.agent_bridge_provider_codex');
    }
    if (this.selectedProviderId === AgentBridgeProviderId.CLAUDE) {
      return $r('app.string.agent_bridge_provider_claude');
    }
    if (this.selectedProviderId === AgentBridgeProviderId.ANTIGRAVITY) {
      return $r('app.string.agent_bridge_provider_antigravity');
    }
    return $r('app.string.agent_bridge_provider_codex');
  }

  private resolveConnectionStatusPlainText(): string {
    return resolveResourceString(this.getUIContext().getHostContext(), this.resolveConnectionStatusText());
  }

  private currentConnectedDeviceIpText(): string {
    if (this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED) {
      return this.resolveConnectionStatusPlainText();
    }
    const host = this.extractHostFromBridgeEndpoint(this.bridgeEndpoint);
    if (host.length > 0) {
      return host;
    }
    return this.resolveConnectionStatusPlainText();
  }

  private extractHostFromBridgeEndpoint(input: string): string {
    const normalizedEndpoint = AgentBridgeClient.normalizeEndpointInput(input);
    let value = normalizedEndpoint.length > 0 ? normalizedEndpoint : input.trim();
    const schemeIndex = value.indexOf('://');
    if (schemeIndex >= 0) {
      value = value.substring(schemeIndex + 3);
    }
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0) {
      value = value.substring(0, queryIndex);
    }
    const pathIndex = value.indexOf('/');
    if (pathIndex >= 0) {
      value = value.substring(0, pathIndex);
    }
    const userInfoIndex = value.lastIndexOf('@');
    if (userInfoIndex >= 0 && userInfoIndex + 1 < value.length) {
      value = value.substring(userInfoIndex + 1);
    }
    if (value.startsWith('[')) {
      const bracketEndIndex = value.indexOf(']');
      if (bracketEndIndex > 1) {
        return value.substring(1, bracketEndIndex);
      }
    }
    const portIndex = value.indexOf(':');
    if (portIndex > 0) {
      return value.substring(0, portIndex);
    }
    return value;
  }

  private resolveConnectionStatusColor(): ResourceColor {
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.color.tag_green');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('app.color.tag_red');
    }
    return $r('app.color.text_secondary');
  }

  private resolveConnectionStatusSymbol(): Resource {
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('sys.symbol.checkmark_circle');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    return $r('sys.symbol.info_circle');
  }

  private shouldShowDisconnectedComposerState(): boolean {
    return this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED;
  }

  private canReconnectBridgeFromComposer(): boolean {
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return false;
    }
    const endpoint = AgentBridgeClient.normalizeEndpointInput(this.bridgeEndpoint);
    return endpoint.length > 0 && this.bridgeToken.trim().length > 0;
  }

  private disconnectedComposerReasonText(): string {
    if (this.bridgeConnectionReasonText.length > 0) {
      return this.bridgeConnectionReasonText;
    }
    return this.buildBridgeConnectionReasonText(this.connectionStatus, '');
  }

  private buildBridgeConnectionReasonText(status: string, detail: string): string {
    const normalizedDetail = this.normalizeTransientStatusText(detail);
    if (normalizedDetail.length > 0) {
      return normalizedDetail;
    }
    if (this.bridgeEndpoint.trim().length === 0 || this.bridgeToken.trim().length === 0) {
      return resolveResourceString(
        this.getUIContext().getHostContext(),
        $r('app.string.agent_home_composer_missing_connection_config')
      );
    }
    if (status === AgentBridgeConnectionStatus.CONNECTING) {
      return resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_home_restore_connection'));
    }
    return this.resolveConnectionStatusPlainText();
  }

  private normalizeRemoteSessionProvider(remoteSession: AgentBridgeRemoteSession, fallbackProviderId: string): AgentBridgeRemoteSession {
    const providerId = remoteSession.providerId.length > 0 ? remoteSession.providerId : fallbackProviderId;
    return new AgentBridgeRemoteSession(
      remoteSession.sessionId,
      remoteSession.remoteSessionId,
      providerId,
      remoteSession.title,
      remoteSession.workspacePath,
      remoteSession.workspaceTitle,
      remoteSession.branchName,
      remoteSession.modelId,
      remoteSession.speedMode,
      remoteSession.reasoningMode,
      remoteSession.status,
      remoteSession.source,
      remoteSession.messageCount,
      remoteSession.updatedAt
    );
  }

  private normalizeRemoteSessionsForProvider(providerId: string, items: Array<AgentBridgeRemoteSession>): Array<AgentBridgeRemoteSession> {
    const normalizedItems: Array<AgentBridgeRemoteSession> = [];
    for (let index = 0; index < items.length; index++) {
      normalizedItems.push(this.normalizeRemoteSessionProvider(items[index], providerId));
    }
    return normalizedItems;
  }

  private resolveRemoteSessionProviderId(providerId: string): string {
    if (providerId.length > 0) {
      return providerId;
    }
    return this.activeSessionImportProviderId();
  }

  private resolveRemoteSessionProviderIdFromResponse(
    source: string,
    items: Array<AgentBridgeRemoteSession>,
    parsed: AgentBridgeParsedMessage
  ): string {
    let providerIdFromPayload = '';
    if (items.length > 0 && items[0].providerId.length > 0) {
      providerIdFromPayload = items[0].providerId;
    } else {
      providerIdFromPayload = AgentBridgeIncomingParser.extractStringProperty(source, 'providerId');
    }
    if (providerIdFromPayload.length > 0) {
      if (parsed.requestId.length > 0) {
        this.clearPendingRemoteSessionsRequest(parsed.requestId);
      }
      logger.info(
        TAG,
        'remote sessions response attributed from payload: requestId=' + parsed.requestId +
          ', providerId=' + providerIdFromPayload +
          ', count=' + String(items.length)
      );
      return providerIdFromPayload;
    }
    if (parsed.requestId.length > 0) {
      const requestProviderId = this.consumePendingRemoteSessionsRequestProviderId(parsed.requestId);
      if (requestProviderId.length > 0) {
        logger.info(
          TAG,
          'remote sessions response attributed from request: requestId=' + parsed.requestId +
            ', providerId=' + requestProviderId +
            ', count=' + String(items.length)
        );
        return requestProviderId;
      }
    }
    return this.activeSessionImportProviderId();
  }

  private trackPendingRemoteSessionsRequest(requestId: string, providerId: string): void {
    const nextPairs: Array<string> = [];
    let replaced = false;
    for (let index = 0; index < this.pendingRemoteSessionsRequestPairs.length; index += 2) {
      const existingRequestId = this.pendingRemoteSessionsRequestPairs[index];
      const existingProviderId = index + 1 < this.pendingRemoteSessionsRequestPairs.length ?
        this.pendingRemoteSessionsRequestPairs[index + 1] :
        '';
      if (existingRequestId === requestId) {
        nextPairs.push(requestId);
        nextPairs.push(providerId);
        replaced = true;
      } else {
        nextPairs.push(existingRequestId);
        nextPairs.push(existingProviderId);
      }
    }
    if (!replaced) {
      nextPairs.push(requestId);
      nextPairs.push(providerId);
    }
    this.pendingRemoteSessionsRequestPairs = nextPairs;
    this.updateRemoteSessionsLoadingState();
  }

  private consumePendingRemoteSessionsRequestProviderId(requestId: string): string {
    let providerId = '';
    const nextPairs: Array<string> = [];
    for (let index = 0; index < this.pendingRemoteSessionsRequestPairs.length; index += 2) {
      const existingRequestId = this.pendingRemoteSessionsRequestPairs[index];
      const existingProviderId = index + 1 < this.pendingRemoteSessionsRequestPairs.length ?
        this.pendingRemoteSessionsRequestPairs[index + 1] :
        '';
      if (existingRequestId === requestId && providerId.length === 0) {
        providerId = existingProviderId;
      } else {
        nextPairs.push(existingRequestId);
        nextPairs.push(existingProviderId);
      }
    }
    this.pendingRemoteSessionsRequestPairs = nextPairs;
    this.updateRemoteSessionsLoadingState();
    if (providerId.length > 0) {
      logger.info(TAG, 'resolve remote sessions provider from request: requestId=' + requestId + ', providerId=' + providerId);
    }
    return providerId;
  }

  private clearPendingRemoteSessionsRequest(requestId: string): void {
    if (requestId.length === 0) {
      return;
    }
    const nextPairs: Array<string> = [];
    for (let index = 0; index < this.pendingRemoteSessionsRequestPairs.length; index += 2) {
      const existingRequestId = this.pendingRemoteSessionsRequestPairs[index];
      const existingProviderId = index + 1 < this.pendingRemoteSessionsRequestPairs.length ?
        this.pendingRemoteSessionsRequestPairs[index + 1] :
        '';
      if (existingRequestId !== requestId) {
        nextPairs.push(existingRequestId);
        nextPairs.push(existingProviderId);
      }
    }
    this.pendingRemoteSessionsRequestPairs = nextPairs;
    this.updateRemoteSessionsLoadingState();
  }

  private clearPendingRemoteSessionsRequestsForProvider(providerId: string): void {
    const nextPairs: Array<string> = [];
    for (let index = 0; index < this.pendingRemoteSessionsRequestPairs.length; index += 2) {
      const existingRequestId = this.pendingRemoteSessionsRequestPairs[index];
      const existingProviderId = index + 1 < this.pendingRemoteSessionsRequestPairs.length ?
        this.pendingRemoteSessionsRequestPairs[index + 1] :
        '';
      if (existingProviderId !== providerId) {
        nextPairs.push(existingRequestId);
        nextPairs.push(existingProviderId);
      }
    }
    this.pendingRemoteSessionsRequestPairs = nextPairs;
  }

  private updateRemoteSessionsLoadingState(): void {
    this.loadingRemoteSessions = this.hasPendingRemoteSessionsRequestForProvider(this.activeSessionImportProviderId());
  }

  private hasPendingRemoteSessionsRequestForProvider(providerId: string): boolean {
    for (let index = 0; index < this.pendingRemoteSessionsRequestPairs.length; index += 2) {
      const existingProviderId = index + 1 < this.pendingRemoteSessionsRequestPairs.length ?
        this.pendingRemoteSessionsRequestPairs[index + 1] :
        '';
      if (existingProviderId === providerId) {
        return true;
      }
    }
    return false;
  }

  private persistRemoteSessionsForProvider(providerId: string, items: Array<AgentBridgeRemoteSession>): void {
    this.persistence.replaceRemoteSessionsForProvider(providerId, items).catch((error: Error): void => {
      logger.error(TAG, 'persist remote sessions failed: ' + this.errorToString(error));
    });
  }

  private persistRemoteSession(item: AgentBridgeRemoteSession): void {
    const providerId = this.resolveRemoteSessionProviderId(item.providerId);
    this.persistence.saveRemoteSession(providerId, item).catch((error: Error): void => {
      logger.error(TAG, 'persist remote session failed: ' + this.errorToString(error));
    });
  }

  private resolveConnectionLogSymbol(text: string): Resource {
    if (text.indexOf('code=') >= 0 || text.indexOf('error') >= 0) {
      return $r('sys.symbol.exclamationmark_triangle');
    }
    return $r('sys.symbol.info_circle');
  }

  private resolveConnectionLogColor(text: string): ResourceColor {
    if (text.indexOf('code=') >= 0 || text.indexOf('error') >= 0) {
      return $r('app.color.tag_red');
    }
    return $r('app.color.text_secondary');
  }

  private buildConnectionStatusLogText(detail: string): string {
    if (detail.length === 0) {
      return this.resolveConnectionStatusPlainText();
    }
    return this.resolveConnectionStatusPlainText() + ': ' + detail;
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return this.pad2(date.getHours()) + ':' + this.pad2(date.getMinutes()) + ':' + this.pad2(date.getSeconds());
  }

  private formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return String(date.getFullYear()) + '-' +
      this.pad2(date.getMonth() + 1) + '-' +
      this.pad2(date.getDate()) + ' ' +
      this.pad2(date.getHours()) + ':' +
      this.pad2(date.getMinutes()) + ':' +
      this.pad2(date.getSeconds());
  }

  private pad2(value: number): string {
    if (value < 10) {
      return '0' + String(value);
    }
    return String(value);
  }

  private compactText(text: string): string {
    if (text.length <= 420) {
      return text;
    }
    return text.substring(0, 420) + '...';
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
    return String(error);
  }
}



