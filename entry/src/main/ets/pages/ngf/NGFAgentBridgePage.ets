import { HdsNavDestination, hdsMaterial } from '@kit.UIDesignKit';
import {
  NGFImmersiveTopChromePresetFactory,
  NGFImmersiveTopChromeSpec,
  NGFImmersiveTopChromeUnderlay,
  NGFHdsTitleBarOptionsFactory,
  NGFRichContentKind,
  NGFRichContentRenderer,
  logger,
  resolveResourceString
} from 'ngf_framework';
import { AgentBridgeClient } from '../../features/agentBridge/AgentBridgeClient';
import {
  AgentBridgeConnectionConfig,
  AgentBridgeConnectionStatus,
  AgentBridgeEventType,
  AgentBridgeIncomingParser,
  AgentBridgeParsedMessage,
  AgentBridgeProviderId,
  AgentBridgeTimelineItem,
  AgentBridgeTimelineKind
} from '../../features/agentBridge/AgentBridgeModels';
import {
  AgentHomeBootstrapState,
  AgentHomePreviewItem,
  AgentHomeProfile,
  AgentHomeSeedFactory,
  AgentHomeSessionItem,
  AgentHomeStateSnapshot,
  AgentHomeWorkspaceItem
} from '../../features/agentHome/AgentHomeModels';
import { AgentHomePersistenceRepository } from '../../features/agentHome/AgentHomePersistenceRepository';
import { NGFPageWindowSupport } from './NGFPageWindowSupport';

const TAG: string = 'NGFAgentBridgePage';
const AGENT_BRIDGE_TOP_CHROME: NGFImmersiveTopChromeSpec = NGFImmersiveTopChromePresetFactory.build(
  '#08111F', '#12331F', '#081A16', '#22C55ED8', '#38BDF8D8', 168, 108
);

@Component
export struct NGFAgentBridgePage {
  @State private pathStack: NavPathStack = new NavPathStack();
  @State private topInsetVp: number = AGENT_BRIDGE_TOP_CHROME.metrics.contentTopInset;
  @State private endpoint: string = '';
  @State private token: string = '';
  @State private workspacePath: string = '';
  @State private userMessage: string = '';
  @State private previewPath: string = '';
  @State private connectionStatus: string = AgentBridgeConnectionStatus.DISCONNECTED;
  @State private selectedProviderId: string = AgentBridgeProviderId.MOCK;
  @State private currentSessionId: string = '';
  @State private timeline: Array<AgentBridgeTimelineItem> = [];
  @State private previewText: string = '';
  @State private previewMediaType: string = 'text/plain';
  @State private previewPlaceholderText: string = '';
  @StorageProp('ngf_is_dark_mode')
  private isDarkMode: boolean = false;
  private readonly client: AgentBridgeClient = new AgentBridgeClient();
  private readonly persistence: AgentHomePersistenceRepository = new AgentHomePersistenceRepository();
  private timelineSequence: number = 0;
  private previewSequence: number = 0;
  private activeWorkspaceId: string = '';
  private activeWorkspaceTitle: string = '';
  private activeWorkspaceInitial: string = 'W';
  private activeWorkspaceAccentColor: string = '#4F7DE8';
  private activeWorkspaceBranchName: string = 'main';
  private activeWorkspaceIsOnline: boolean = true;
  private activeAgentSessionId: string = '';
  private activeAgentSessionTitle: string = '';
  private activeAgentSessionBranchName: string = 'main';

  aboutToAppear(): void {
    NGFPageWindowSupport.loadDynamicTopInset(
      this.getUIContext(),
      108,
      AGENT_BRIDGE_TOP_CHROME.metrics.contentTopInset,
      (inset: number): void => {
        this.topInsetVp = inset;
      }
    );
    this.initializeDefaults();
    this.loadPersistentState().catch((error: Error): void => {
      logger.error(TAG, 'load bridge persistent state failed: ' + this.errorToString(error));
    });
    this.client.setHandlers(
      (status: string, detail: string): void => {
        this.connectionStatus = status;
        this.addTimeline(AgentBridgeTimelineKind.STATUS, this.resolveTimelineTitle(AgentBridgeTimelineKind.STATUS), status + ': ' + detail);
      },
      (text: string): void => {
        this.handleBridgeText(text);
      },
      (message: string): void => {
        this.connectionStatus = AgentBridgeConnectionStatus.ERROR;
        this.addTimeline(AgentBridgeTimelineKind.ERROR, this.resolveTimelineTitle(AgentBridgeTimelineKind.ERROR), message);
      },
      (sessionId: string): void => {
        this.handleSessionDiscovered(sessionId);
      }
    );
  }

  aboutToDisappear(): void {
    this.client.disconnect();
    NGFPageWindowSupport.restoreMainMenu();
  }

  build() {
    HdsNavDestination() {
      Stack({ alignContent: Alignment.TopStart }) {
        NGFImmersiveTopChromeUnderlay({ spec: AGENT_BRIDGE_TOP_CHROME })

        Scroll() {
          Column({ space: 14 }) {
            this.buildConnectionCard()
            this.buildSessionCard()
            this.buildMessageCard()
            this.buildPreviewCard()
            this.buildTimelineCard()
          }
          .width('100%')
          .padding({ left: 16, right: 16, top: this.topInsetVp, bottom: 42 })
        }
        .width('100%')
        .height('100%')
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.Spring)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .backgroundColor($r('app.color.background_transparent'))
      }
      .width('100%')
      .height('100%')
    }
    .titleBar(NGFHdsTitleBarOptionsFactory.build(
      $r('app.string.agent_bridge_title'),
      $r('app.string.agent_bridge_subtitle'),
      '#08111F',
      hdsMaterial.MaterialLevel.GENTLE,
      true,
      false
    ))
    .ignoreLayoutSafeArea([LayoutSafeAreaType.SYSTEM], [LayoutSafeAreaEdge.TOP, LayoutSafeAreaEdge.BOTTOM])
    .onReady((context: NavDestinationContext): void => {
      this.pathStack = context.pathStack;
    })
    .onBackPressed((): boolean => {
      this.client.disconnect();
      NGFPageWindowSupport.restoreMainMenu();
      this.pathStack.pop();
      return true;
    })
  }

  @Builder
  private buildConnectionCard(): void {
    Column({ space: 12 }) {
      this.buildSectionHeader($r('app.string.agent_bridge_connection_panel'), this.resolveStatusLabel())

      this.buildInputLabel($r('app.string.agent_bridge_endpoint_label'))
      TextInput({ placeholder: $r('app.string.agent_bridge_endpoint_placeholder'), text: this.endpoint })
        .height(42)
        .fontSize(13)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.endpoint = value;
          this.persistProfile();
        })

      this.buildInputLabel($r('app.string.agent_bridge_token_label'))
      TextInput({ placeholder: $r('app.string.agent_bridge_token_placeholder'), text: this.token })
        .height(42)
        .fontSize(13)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.token = value;
          this.persistProfile();
        })

      Row({ space: 10 }) {
        Button($r('app.string.agent_bridge_connect'))
          .layoutWeight(1)
          .height(42)
          .fontSize(13)
          .borderRadius(12)
          .backgroundColor($r('app.color.button_primary'))
          .fontColor($r('app.color.panel_background'))
          .enabled(
            this.connectionStatus !== AgentBridgeConnectionStatus.CONNECTED &&
              this.endpoint.trim().length > 0 &&
              this.token.trim().length > 0
          )
          .onClick((): void => {
            this.handleConnect();
          })

        Button($r('app.string.agent_bridge_disconnect'))
          .layoutWeight(1)
          .height(42)
          .fontSize(13)
          .borderRadius(12)
          .backgroundColor($r('app.color.button_secondary'))
          .fontColor($r('app.color.panel_background'))
          .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED)
          .onClick((): void => {
            this.client.disconnect();
          })
      }
      .width('100%')
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildSessionCard(): void {
    Column({ space: 12 }) {
      this.buildSectionHeader($r('app.string.agent_bridge_session_panel'), this.resolveSelectedProviderLabel())

      this.buildInputLabel($r('app.string.agent_bridge_provider_label'))
      Column({ space: 8 }) {
        Row({ space: 10 }) {
          this.buildProviderButton(AgentBridgeProviderId.MOCK, $r('app.string.agent_bridge_provider_mock'))
          this.buildProviderButton(AgentBridgeProviderId.OPENCODE, $r('app.string.agent_bridge_provider_opencode'))
          this.buildProviderButton(AgentBridgeProviderId.DEVECO, $r('app.string.agent_bridge_provider_deveco'))
        }
        .width('100%')

        Row({ space: 10 }) {
          this.buildProviderButton(AgentBridgeProviderId.MIMO, $r('app.string.agent_bridge_provider_mimo'))
          this.buildProviderButton(AgentBridgeProviderId.CODEX, $r('app.string.agent_bridge_provider_codex'))
          this.buildProviderButton(AgentBridgeProviderId.CLAUDE, $r('app.string.agent_bridge_provider_claude'))
        }
        .width('100%')

        Row({ space: 10 }) {
          this.buildProviderButton(AgentBridgeProviderId.ANTIGRAVITY, $r('app.string.agent_bridge_provider_antigravity'))
        }
        .width('100%')
      }
      .width('100%')

      this.buildInputLabel($r('app.string.agent_bridge_workspace_label'))
      TextInput({ placeholder: $r('app.string.agent_bridge_workspace_placeholder'), text: this.workspacePath })
        .height(42)
        .fontSize(13)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.workspacePath = value;
          this.persistWorkspacePath();
        })

      Button($r('app.string.agent_bridge_create_session'))
        .width('100%')
        .height(42)
        .fontSize(13)
        .borderRadius(12)
        .backgroundColor($r('app.color.button_primary'))
        .fontColor($r('app.color.panel_background'))
        .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED)
        .onClick((): void => {
          this.handleCreateSession();
        })

      if (this.currentSessionId.length > 0) {
        Text(this.currentSessionId)
          .width('100%')
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      } else {
        Text($r('app.string.agent_bridge_empty_session'))
          .width('100%')
          .fontSize(12)
          .fontColor($r('app.color.text_secondary'))
      }
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildProviderButton(providerId: string, label: ResourceStr): void {
    Button(label)
      .layoutWeight(1)
      .height(36)
      .fontSize(12)
      .borderRadius(10)
      .backgroundColor(this.selectedProviderId === providerId ? $r('app.color.button_primary') : $r('app.color.button_inactive_bg'))
      .fontColor(this.selectedProviderId === providerId ? $r('app.color.panel_background') : $r('app.color.text_primary'))
      .onClick((): void => {
        this.selectedProviderId = providerId;
        this.persistProfile();
        this.persistBridgeSessionId();
      })
  }

  @Builder
  private buildMessageCard(): void {
    Column({ space: 12 }) {
      this.buildSectionHeader($r('app.string.agent_bridge_message_label'), this.resolveSelectedProviderLabel())

      TextInput({ placeholder: $r('app.string.agent_bridge_default_message'), text: this.userMessage })
        .height(44)
        .fontSize(13)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.userMessage = value;
        })

      Button($r('app.string.agent_bridge_send_message'))
        .width('100%')
        .height(42)
        .fontSize(13)
        .borderRadius(12)
        .backgroundColor($r('app.color.button_primary'))
        .fontColor($r('app.color.panel_background'))
        .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentSessionId.length > 0)
        .onClick((): void => {
          this.client.sendMessage(this.currentSessionId, this.userMessage, 'configured', 'auto', 'auto');
        })
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildPreviewCard(): void {
    Column({ space: 12 }) {
      this.buildSectionHeader($r('app.string.agent_bridge_preview_panel'), $r('app.string.agent_bridge_preview_path_label'))

      TextInput({ placeholder: $r('app.string.agent_bridge_preview_path_placeholder'), text: this.previewPath })
        .height(42)
        .fontSize(13)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
        .onChange((value: string): void => {
          this.previewPath = value;
          this.persistProfile();
        })

      Button($r('app.string.agent_bridge_request_preview'))
        .width('100%')
        .height(42)
        .fontSize(13)
        .borderRadius(12)
        .backgroundColor($r('app.color.button_secondary'))
        .fontColor($r('app.color.panel_background'))
        .enabled(this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED && this.currentSessionId.length > 0)
        .onClick((): void => {
          this.client.requestPreview(this.currentSessionId, this.previewPath);
        })

      NGFRichContentRenderer({
        content: this.previewText.length > 0 ? this.previewText : this.previewPlaceholderText,
        contentKind: this.previewContentKind(),
        isDarkMode: this.isDarkMode,
        bottomPadding: 12
      })
        .width('100%')
        .height(220)
        .backgroundColor($r('app.color.background_surface'))
        .borderRadius(10)
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildTimelineCard(): void {
    Column({ space: 12 }) {
      this.buildSectionHeader($r('app.string.agent_bridge_timeline_panel'), $r('app.string.agent_bridge_event_raw'))

      if (this.timeline.length === 0) {
        Text($r('app.string.agent_bridge_empty_timeline'))
          .width('100%')
          .height(96)
          .fontSize(13)
          .fontColor($r('app.color.text_secondary'))
          .textAlign(TextAlign.Center)
      } else {
        List({ space: 10 }) {
          ForEach(this.timeline, (item: AgentBridgeTimelineItem) => {
            ListItem() {
              this.buildTimelineItem(item)
            }
          }, (item: AgentBridgeTimelineItem): string => item.id)
        }
        .width('100%')
        .height(280)
        .scrollBar(BarState.Auto)
      }
    }
    .width('100%')
    .padding(16)
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
    .border({ width: 1, color: $r('app.color.card_border') })
  }

  @Builder
  private buildTimelineItem(item: AgentBridgeTimelineItem): void {
    Column({ space: 6 }) {
      Row() {
        Text(item.title)
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.resolveTimelineColor(item.kind))
          .layoutWeight(1)
        Text(this.formatTime(item.createdAt))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')

      Text(item.text)
        .width('100%')
        .fontSize(12)
        .lineHeight(18)
        .fontColor($r('app.color.text_body'))
        .maxLines(6)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding(10)
    .backgroundColor($r('app.color.background_surface'))
    .borderRadius(10)
  }

  @Builder
  private buildSectionHeader(title: ResourceStr, meta: ResourceStr): void {
    Row() {
      Text(title)
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
      Text(meta)
        .fontSize(12)
        .fontColor($r('app.color.text_secondary'))
        .maxLines(1)
    }
    .width('100%')
  }

  @Builder
  private buildInputLabel(label: ResourceStr): void {
    Text(label)
      .width('100%')
      .fontSize(12)
      .fontColor($r('app.color.text_secondary'))
  }

  private initializeDefaults(): void {
    const hostContext = this.getUIContext().getHostContext();
    if (this.userMessage.length === 0) {
      this.userMessage = resolveResourceString(hostContext, $r('app.string.agent_bridge_default_message'));
    }
    if (this.previewPlaceholderText.length === 0) {
      this.previewPlaceholderText = resolveResourceString(hostContext, $r('app.string.agent_bridge_preview_placeholder'));
    }
  }

  private buildBootstrapState(): AgentHomeBootstrapState {
    const hostContext = this.getUIContext().getHostContext();
    const mainBranch = resolveResourceString(hostContext, $r('app.string.agent_home_branch_main'));
    const workspaceTitle = resolveResourceString(hostContext, $r('app.string.agent_home_default_workspace_title'));
    const workspace = AgentHomeSeedFactory.buildDefaultWorkspace(workspaceTitle, '', mainBranch);
    const session = AgentHomeSeedFactory.buildDefaultSession(
      workspace.id,
      mainBranch,
      AgentBridgeProviderId.MOCK,
      resolveResourceString(hostContext, $r('app.string.agent_home_new_session')) + ' 1',
      'mock-fast',
      'auto',
      'auto'
    );
    const workspaces: Array<AgentHomeWorkspaceItem> = [];
    workspaces.push(workspace);
    const sessions: Array<AgentHomeSessionItem> = [];
    sessions.push(session);
    const profile = new AgentHomeProfile(
      '',
      '',
      AgentBridgeProviderId.MOCK,
      'mock-fast',
      'auto',
      'auto',
      workspace.id,
      session.id,
      '',
      Date.now()
    );
    return new AgentHomeBootstrapState(profile, workspaces, sessions);
  }

  private async loadPersistentState(): Promise<void> {
    const snapshot = await this.persistence.loadOrCreate(this.buildBootstrapState());
    this.applySnapshot(snapshot);
    logger.info(TAG, 'bridge settings loaded from agent database');
  }

  private applySnapshot(snapshot: AgentHomeStateSnapshot): void {
    this.endpoint = snapshot.profile.endpoint;
    this.token = snapshot.profile.token;
    this.selectedProviderId = snapshot.profile.providerId;
    this.previewPath = snapshot.profile.previewPath;
    this.activeWorkspaceId = snapshot.profile.activeWorkspaceId;
    this.activeAgentSessionId = snapshot.profile.activeSessionId;
    this.applyActiveWorkspace(snapshot.workspaces);
    this.applyActiveSession(snapshot.sessions);
  }

  private applyActiveWorkspace(workspaces: Array<AgentHomeWorkspaceItem>): void {
    for (let index = 0; index < workspaces.length; index++) {
      const item = workspaces[index];
      if (item.id === this.activeWorkspaceId) {
        this.activeWorkspaceTitle = item.title;
        this.activeWorkspaceInitial = item.initial;
        this.activeWorkspaceAccentColor = item.accentColor;
        this.activeWorkspaceBranchName = item.branchName;
        this.activeWorkspaceIsOnline = item.isOnline;
        this.workspacePath = item.subtitle;
        return;
      }
    }
  }

  private applyActiveSession(sessions: Array<AgentHomeSessionItem>): void {
    for (let index = 0; index < sessions.length; index++) {
      const item = sessions[index];
      if (item.id === this.activeAgentSessionId) {
        this.activeAgentSessionTitle = item.title;
        this.activeAgentSessionBranchName = item.branchName;
        this.currentSessionId = item.bridgeSessionId;
        return;
      }
    }
  }

  private persistProfile(): void {
    const profile = new AgentHomeProfile(
      this.endpoint,
      this.token,
      this.selectedProviderId,
      this.defaultModelIdForProfile(),
      'auto',
      'auto',
      this.activeWorkspaceId,
      this.activeAgentSessionId,
      this.previewPath,
      Date.now()
    );
    this.persistence.saveProfile(profile).catch((error: Error): void => {
      logger.error(TAG, 'persist bridge profile failed: ' + this.errorToString(error));
    });
  }

  private persistWorkspacePath(): void {
    if (this.activeWorkspaceId.length === 0) {
      return;
    }
    const workspace = new AgentHomeWorkspaceItem(
      this.activeWorkspaceId,
      this.activeWorkspaceTitle,
      this.workspacePath,
      this.activeWorkspaceInitial,
      this.activeWorkspaceAccentColor,
      this.activeWorkspaceBranchName,
      this.activeWorkspaceIsOnline
    );
    this.persistence.saveWorkspace(workspace).catch((error: Error): void => {
      logger.error(TAG, 'persist bridge workspace failed: ' + this.errorToString(error));
    });
  }

  private defaultModelIdForProfile(): string {
    if (this.selectedProviderId !== AgentBridgeProviderId.MOCK) {
      return 'configured';
    }
    return 'mock-fast';
  }

  private persistBridgeSessionId(): void {
    if (this.activeAgentSessionId.length === 0) {
      return;
    }
    const session = new AgentHomeSessionItem(
      this.activeAgentSessionId,
      this.activeWorkspaceId,
      this.activeAgentSessionTitle,
      this.activeAgentSessionBranchName,
      this.selectedProviderId,
      this.defaultModelIdForProfile(),
      'auto',
      'auto',
      this.currentSessionId,
      Date.now()
    );
    this.persistence.saveSession(session).catch((error: Error): void => {
      logger.error(TAG, 'persist bridge session failed: ' + this.errorToString(error));
    });
  }

  private handleConnect(): void {
    if (this.endpoint.trim().length === 0) {
      this.addTimeline(
        AgentBridgeTimelineKind.ERROR,
        this.resolveTimelineTitle(AgentBridgeTimelineKind.ERROR),
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_bridge_endpoint_required'))
      );
      return;
    }
    if (this.token.trim().length === 0) {
      this.addTimeline(
        AgentBridgeTimelineKind.ERROR,
        this.resolveTimelineTitle(AgentBridgeTimelineKind.ERROR),
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_bridge_token_required'))
      );
      return;
    }
    const normalizedEndpoint = AgentBridgeClient.normalizeEndpointInput(this.endpoint);
    this.endpoint = normalizedEndpoint;
    this.persistProfile();
    const config = new AgentBridgeConnectionConfig(normalizedEndpoint, this.token);
    this.client.connect(config);
  }

  private handleCreateSession(): void {
    if (this.workspacePath.trim().length === 0) {
      this.addTimeline(
        AgentBridgeTimelineKind.ERROR,
        this.resolveTimelineTitle(AgentBridgeTimelineKind.ERROR),
        resolveResourceString(this.getUIContext().getHostContext(), $r('app.string.agent_bridge_workspace_required'))
      );
      return;
    }
    this.persistProfile();
    this.persistWorkspacePath();
    this.client.createSession(this.selectedProviderId, this.workspacePath, this.activeWorkspaceTitle, 'configured', 'auto', 'auto');
  }

  private handleBridgeText(text: string): void {
    const kind = this.resolveTimelineKind(text);
    const compactText = this.compactText(text);
    const parsed = AgentBridgeIncomingParser.parse(text);
    if (
      parsed.eventType === AgentBridgeEventType.PREVIEW_UPDATED ||
        parsed.previewContent.length > 0 ||
        parsed.previewPath.length > 0
    ) {
      const previewContent = parsed.previewContent.length > 0 ? parsed.previewContent : compactText;
      this.previewText = previewContent;
      this.previewMediaType = parsed.previewMediaType.length > 0 ? parsed.previewMediaType : 'text/plain';
      this.persistPreviewFromBridge(parsed, previewContent);
    }
    this.addTimeline(kind, this.resolveTimelineTitle(kind), compactText);
  }

  private handleSessionDiscovered(sessionId: string): void {
    if (sessionId.length === 0 || sessionId === this.currentSessionId) {
      return;
    }
    this.currentSessionId = sessionId;
    this.persistBridgeSessionId();
    this.addTimeline(AgentBridgeTimelineKind.STATUS, this.resolveTimelineTitle(AgentBridgeTimelineKind.STATUS), 'sessionId: ' + sessionId);
  }

  private persistPreviewFromBridge(parsed: AgentBridgeParsedMessage, fallbackText: string): void {
    if (this.activeAgentSessionId.length === 0) {
      return;
    }
    this.previewSequence = this.previewSequence + 1;
    const path = parsed.previewPath.length > 0 ? parsed.previewPath : this.previewPath;
    const mediaType = parsed.previewMediaType.length > 0 ? parsed.previewMediaType : 'text/plain';
    const preview = new AgentHomePreviewItem(
      'agent_bridge_preview_' + String(Date.now()) + '_' + String(this.previewSequence),
      this.activeAgentSessionId,
      path,
      mediaType,
      fallbackText,
      Date.now()
    );
    this.persistence.savePreview(preview).catch((error: Error): void => {
      logger.error(TAG, 'persist bridge preview failed: ' + this.errorToString(error));
    });
  }

  private previewContentKind(): string {
    const mediaType = this.previewMediaType.toLowerCase();
    const path = this.previewPath.toLowerCase();
    if (mediaType.indexOf('html') >= 0 || path.endsWith('.html') || path.endsWith('.htm')) {
      return NGFRichContentKind.HTML;
    }
    if (mediaType.indexOf('markdown') >= 0 || path.endsWith('.md') || path.endsWith('.markdown')) {
      return NGFRichContentKind.MARKDOWN;
    }
    return NGFRichContentKind.PLAIN;
  }

  private addTimeline(kind: string, title: string, text: string): void {
    this.timelineSequence = this.timelineSequence + 1;
    const item = new AgentBridgeTimelineItem(
      'agent_bridge_event_' + String(this.timelineSequence),
      kind,
      title,
      text,
      Date.now()
    );
    const nextItems: Array<AgentBridgeTimelineItem> = [];
    nextItems.push(item);
    for (let index = 0; index < this.timeline.length && index < 49; index++) {
      nextItems.push(this.timeline[index]);
    }
    this.timeline = nextItems;
  }

  private resolveTimelineKind(text: string): string {
    if (text.indexOf('"message.delta"') >= 0 || text.indexOf('"message.completed"') >= 0) {
      return AgentBridgeTimelineKind.MESSAGE;
    }
    if (text.indexOf('"tool.') >= 0) {
      return AgentBridgeTimelineKind.TOOL;
    }
    if (text.indexOf('"error"') >= 0 || text.indexOf('"ok":false') >= 0) {
      return AgentBridgeTimelineKind.ERROR;
    }
    if (text.indexOf('"session.') >= 0 || text.indexOf('"bridge.connected"') >= 0) {
      return AgentBridgeTimelineKind.STATUS;
    }
    return AgentBridgeTimelineKind.RAW;
  }

  private resolveTimelineTitle(kind: string): string {
    const hostContext = this.getUIContext().getHostContext();
    if (kind === AgentBridgeTimelineKind.STATUS) {
      return resolveResourceString(hostContext, $r('app.string.agent_bridge_event_status'));
    }
    if (kind === AgentBridgeTimelineKind.MESSAGE) {
      return resolveResourceString(hostContext, $r('app.string.agent_bridge_event_message'));
    }
    if (kind === AgentBridgeTimelineKind.TOOL) {
      return resolveResourceString(hostContext, $r('app.string.agent_bridge_event_tool'));
    }
    if (kind === AgentBridgeTimelineKind.ERROR) {
      return resolveResourceString(hostContext, $r('app.string.agent_bridge_event_error'));
    }
    return resolveResourceString(hostContext, $r('app.string.agent_bridge_event_raw'));
  }

  private resolveStatusLabel(): ResourceStr {
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return $r('app.string.agent_bridge_status_connecting');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.string.agent_bridge_status_connected');
    }
    if (this.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('app.string.agent_bridge_status_error');
    }
    return $r('app.string.agent_bridge_status_disconnected');
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
    return $r('app.string.agent_bridge_provider_mock');
  }

  private resolveTimelineColor(kind: string): ResourceColor {
    if (kind === AgentBridgeTimelineKind.ERROR) {
      return $r('app.color.tag_red');
    }
    if (kind === AgentBridgeTimelineKind.TOOL) {
      return $r('app.color.tag_blue');
    }
    if (kind === AgentBridgeTimelineKind.MESSAGE) {
      return $r('app.color.tag_green');
    }
    return $r('app.color.text_secondary');
  }

  private compactText(text: string): string {
    if (text.length <= 720) {
      return text;
    }
    return text.substring(0, 720) + '...';
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return this.pad2(date.getHours()) + ':' + this.pad2(date.getMinutes()) + ':' + this.pad2(date.getSeconds());
  }

  private pad2(value: number): string {
    if (value < 10) {
      return '0' + String(value);
    }
    return String(value);
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
