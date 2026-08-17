import { bundleManager } from '@kit.AbilityKit';
import { logger, ngfPlatformWindowManagerFacade } from 'ngf_framework';
import { AgentBridgeConnectionStatus, AgentBridgeUsageEventRecord } from '../../features/agentBridge/AgentBridgeModels';
import {
  AgentHomeSessionWindowController,
  AgentHomeSessionWindowFailureCategory,
  AgentHomeSessionWindowMessage,
  AgentHomeSessionWindowQueueItem,
  AgentHomeSessionWindowScope,
  AgentHomeSessionWindowSnapshot,
  AgentHomeSessionWindowStorageKey,
  AgentHomeSessionWindowTerminal,
  agentHomeSessionWindowRuntimeRegistry
} from '../../features/agentHome/AgentHomeSessionWindowController';

const TAG: string = 'NGFAgentSessionWindowPage';

@Entry({ useSharedStorage: true })
@Component
struct NGFAgentSessionWindowPage {
  @LocalStorageProp(AgentHomeSessionWindowStorageKey.HOST_PROFILE_ID) @Watch('onScopeChanged')
  private hostProfileId: string = '';
  @LocalStorageProp(AgentHomeSessionWindowStorageKey.WORKSPACE_ID) @Watch('onScopeChanged')
  private workspaceId: string = '';
  @LocalStorageProp(AgentHomeSessionWindowStorageKey.AGENT_ID) @Watch('onScopeChanged')
  private agentId: string = '';
  @LocalStorageProp(AgentHomeSessionWindowStorageKey.SESSION_ID) @Watch('onScopeChanged')
  private sessionId: string = '';
  @LocalStorageProp(AgentHomeSessionWindowStorageKey.INSTANCE_ID) @Watch('onScopeChanged')
  private windowInstanceId: string = '';

  @State private snapshot: AgentHomeSessionWindowSnapshot = new AgentHomeSessionWindowSnapshot();
  @State private activeTabIndex: number = 0;
  @State private composerText: string = '';
  private readonly controller: AgentHomeSessionWindowController = new AgentHomeSessionWindowController();
  private isVisible: boolean = false;
  private appVersion: string = '';
  private appVersionReady: boolean = false;
  private startedScopeKey: string = '';

  aboutToAppear(): void {
    this.isVisible = true;
    this.controller.setObserver((snapshot: AgentHomeSessionWindowSnapshot): void => {
      if (this.isVisible) {
        this.snapshot = snapshot;
      }
    });
    this.loadAppVersion();
  }

  aboutToDisappear(): void {
    this.isVisible = false;
    this.controller.setObserver(null);
    this.controller.stop();
    agentHomeSessionWindowRuntimeRegistry.release(this.windowInstanceId);
  }

  private loadAppVersion(): void {
    bundleManager.getBundleInfoForSelf(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION)
      .then((info: bundleManager.BundleInfo): void => {
        const versionName: string = info.versionName.trim();
        if (versionName.length > 0) {
          this.appVersion = versionName;
        }
        this.appVersionReady = true;
        this.tryStartController();
      })
      .catch((error: Error): void => {
        logger.warn(TAG, 'load app version failed: ' + error.message);
        this.appVersionReady = true;
        this.tryStartController();
      });
  }

  private onScopeChanged(): void {
    this.tryStartController();
  }

  private tryStartController(): void {
    if (!this.isVisible || !this.appVersionReady) {
      return;
    }
    const scope = new AgentHomeSessionWindowScope(
      this.hostProfileId,
      this.workspaceId,
      this.agentId,
      this.sessionId,
      this.windowInstanceId
    );
    if (!scope.isValid() || scope.identityKey() === this.startedScopeKey) {
      return;
    }
    this.startedScopeKey = scope.identityKey();
    this.controller.start(scope, this.appVersion);
  }

  private closeWindow(): void {
    const registeredName = agentHomeSessionWindowRuntimeRegistry.windowNameFor(this.windowInstanceId);
    const windowName = registeredName.length > 0 ? registeredName : this.windowInstanceId;
    if (windowName.length === 0) {
      return;
    }
    this.controller.stop();
    ngfPlatformWindowManagerFacade.destroySubWindow(windowName).catch((error: Error): void => {
      logger.error(TAG, 'close session window failed: ' + error.message);
    });
  }

  private submitMessage(): void {
    if (this.controller.sendMessage(this.composerText)) {
      this.composerText = '';
    }
  }

  private connectionStatusResource(): Resource {
    if (this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.INVALID_SCOPE) {
      return $r('app.string.agent_session_window_status_scope_missing');
    }
    if (this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.HOST_NOT_FOUND) {
      return $r('app.string.agent_session_window_status_host_missing');
    }
    if (this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.SESSION_NOT_FOUND ||
      this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.WORKSPACE_MISMATCH) {
      return $r('app.string.agent_session_window_status_session_missing');
    }
    if (this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.CREDENTIAL_MISSING) {
      return $r('app.string.agent_session_window_status_credential_missing');
    }
    if (this.snapshot.failureCategory === AgentHomeSessionWindowFailureCategory.BRIDGE_SESSION_MISSING) {
      return $r('app.string.agent_session_window_status_remote_missing');
    }
    if (this.snapshot.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.string.agent_session_window_status_connected');
    }
    if (this.snapshot.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return $r('app.string.agent_session_window_status_connecting');
    }
    if (this.snapshot.connectionStatus === AgentBridgeConnectionStatus.ERROR) {
      return $r('app.string.agent_session_window_status_error');
    }
    return $r('app.string.agent_session_window_status_disconnected');
  }

  private connectionStatusColor(): ResourceColor {
    if (this.snapshot.connectionStatus === AgentBridgeConnectionStatus.CONNECTED) {
      return $r('app.color.tag_green');
    }
    if (this.snapshot.connectionStatus === AgentBridgeConnectionStatus.CONNECTING) {
      return $r('app.color.tag_blue');
    }
    return $r('app.color.tag_red');
  }

  private messageRoleResource(role: string): Resource {
    if (role === 'user') {
      return $r('app.string.agent_session_window_role_user');
    }
    if (role === 'assistant') {
      return $r('app.string.agent_session_window_role_assistant');
    }
    return $r('app.string.agent_session_window_role_system');
  }

  private numericText(value: number): string {
    return value < 0 ? '--' : value.toString();
  }

  private costText(value: number): string {
    if (value < 0) {
      return '--';
    }
    const currency = this.snapshot.currency.length > 0 ? ' ' + this.snapshot.currency : '';
    return value.toFixed(4) + currency;
  }

  private usageEventTokenText(item: AgentBridgeUsageEventRecord): string {
    if (item.totalTokens >= 0) {
      return item.totalTokens.toString();
    }
    let total = 0;
    let available = false;
    if (item.inputTokens >= 0) {
      total = total + item.inputTokens;
      available = true;
    }
    if (item.outputTokens >= 0) {
      total = total + item.outputTokens;
      available = true;
    }
    return available ? total.toString() : '--';
  }

  @Builder
  private buildHeader(): void {
    Row({ space: 12 }) {
      Column({ space: 2 }) {
        if (this.snapshot.sessionTitle.length > 0) {
          Text(this.snapshot.sessionTitle)
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else {
          Text($r('app.string.agent_session_window_title'))
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
        }
        Row({ space: 6 }) {
          Text(this.connectionStatusResource())
            .fontSize(12)
            .fontColor(this.connectionStatusColor())
          if (this.snapshot.hostDisplayName.length > 0) {
            Text(this.snapshot.hostDisplayName)
              .fontSize(12)
              .fontColor($r('app.color.text_tertiary'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Button() {
        SymbolGlyph($r('sys.symbol.arrow_clockwise'))
          .fontSize(18)
          .fontColor([$r('app.color.text_secondary')])
      }
      .width(40)
      .height(40)
      .type(ButtonType.Normal)
      .backgroundColor($r('app.color.button_inactive_bg'))
      .borderRadius(6)
      .accessibilityText($r('app.string.agent_session_window_refresh'))
      .onClick((): void => {
        this.controller.refresh();
      })

      Button() {
        SymbolGlyph($r('sys.symbol.xmark'))
          .fontSize(18)
          .fontColor([$r('app.color.text_secondary')])
      }
      .width(40)
      .height(40)
      .type(ButtonType.Normal)
      .backgroundColor($r('app.color.button_inactive_bg'))
      .borderRadius(6)
      .accessibilityText($r('app.string.agent_session_window_close'))
      .onClick((): void => {
        this.closeWindow();
      })
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 14, bottom: 10 })
    .backgroundColor($r('app.color.panel_background'))
  }

  @Builder
  private buildMessageCard(item: AgentHomeSessionWindowMessage): void {
    ListItem() {
      Column({ space: 6 }) {
        Text(this.messageRoleResource(item.role))
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(item.role === 'user' ? $r('app.color.tag_blue') : $r('app.color.text_secondary'))
        Text(item.text)
          .fontSize(14)
          .fontColor($r('app.color.text_body'))
          .lineHeight(21)
          .copyOption(CopyOptions.LocalDevice)
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding(12)
      .backgroundColor(item.role === 'user' ? $r('app.color.background_secondary') : $r('app.color.panel_background'))
      .border({ width: 1, color: $r('app.color.card_border') })
      .borderRadius(6)
    }
  }

  @Builder
  private buildMessagesTab(): void {
    Column({ space: 8 }) {
      if (this.snapshot.messages.length === 0) {
        Column() {
          Text($r('app.string.agent_session_window_empty_messages'))
            .fontSize(14)
            .fontColor($r('app.color.text_tertiary'))
        }
        .width('100%')
        .height('calc(100% - 72vp)')
        .justifyContent(FlexAlign.Center)
      } else {
        List({ space: 8 }) {
          ForEach(this.snapshot.messages, (item: AgentHomeSessionWindowMessage): void => {
            this.buildMessageCard(item);
          }, (item: AgentHomeSessionWindowMessage): string => item.id)
        }
        .width('100%')
        .height('calc(100% - 72vp)')
        .padding({ left: 12, right: 12, top: 10, bottom: 4 })
        .scrollBar(BarState.Auto)
      }

      Row({ space: 8 }) {
        TextInput({
          text: this.composerText,
          placeholder: $r('app.string.agent_session_window_composer_placeholder')
        })
          .layoutWeight(1)
          .height(48)
          .backgroundColor($r('app.color.panel_background'))
          .border({ width: 1, color: $r('app.color.card_border') })
          .borderRadius(6)
          .onChange((value: string): void => {
            this.composerText = value;
          })

        Button() {
          SymbolGlyph($r('sys.symbol.paperplane_right_fill'))
            .fontSize(18)
            .fontColor([$r('app.color.text_white')])
        }
        .width(48)
        .height(48)
        .type(ButtonType.Normal)
        .backgroundColor($r('app.color.button_primary'))
        .borderRadius(6)
        .enabled(this.snapshot.connectionStatus === AgentBridgeConnectionStatus.CONNECTED &&
          this.composerText.trim().length > 0)
        .accessibilityText($r('app.string.agent_session_window_send'))
        .onClick((): void => {
          this.submitMessage();
        })
      }
      .width('100%')
      .height(64)
      .padding({ left: 12, right: 12, top: 4, bottom: 12 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private buildQueueItem(item: AgentHomeSessionWindowQueueItem): void {
    ListItem() {
      Row({ space: 10 }) {
        Column({ space: 4 }) {
          Text(item.textPreview.length > 0 ? item.textPreview : item.clientMessageId)
            .fontSize(14)
            .fontColor($r('app.color.text_body'))
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.status)
            .fontSize(12)
            .fontColor(item.status === 'failed' ? $r('app.color.tag_red') : $r('app.color.text_tertiary'))
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        if (item.status === 'queued' || item.status === 'sending') {
          Button($r('app.string.agent_session_window_queue_cancel'))
            .height(34)
            .type(ButtonType.Normal)
            .backgroundColor($r('app.color.button_inactive_bg'))
            .fontColor($r('app.color.text_secondary'))
            .borderRadius(6)
            .onClick((): void => {
              this.controller.cancelQueueItem(item.queueId);
            })
        }
        if (item.status === 'failed') {
          Button($r('app.string.agent_session_window_queue_retry'))
            .height(34)
            .type(ButtonType.Normal)
            .backgroundColor($r('app.color.button_primary'))
            .fontColor($r('app.color.text_white'))
            .borderRadius(6)
            .onClick((): void => {
              this.controller.retryQueueItem(item.queueId);
            })
        }
      }
      .width('100%')
      .padding(12)
      .backgroundColor($r('app.color.panel_background'))
      .border({ width: 1, color: $r('app.color.card_border') })
      .borderRadius(6)
    }
  }

  @Builder
  private buildQueueTab(): void {
    if (this.snapshot.queueItems.length === 0) {
      Column() {
        Text($r('app.string.agent_session_window_empty_queue'))
          .fontSize(14)
          .fontColor($r('app.color.text_tertiary'))
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    } else {
      List({ space: 8 }) {
        ForEach(this.snapshot.queueItems, (item: AgentHomeSessionWindowQueueItem): void => {
          this.buildQueueItem(item);
        }, (item: AgentHomeSessionWindowQueueItem): string => item.queueId)
      }
      .width('100%')
      .height('100%')
      .padding(12)
      .scrollBar(BarState.Auto)
    }
  }

  @Builder
  private buildUsageMetric(label: Resource, value: string): void {
    Column({ space: 4 }) {
      Text(label)
        .fontSize(12)
        .fontColor($r('app.color.text_tertiary'))
      Text(value)
        .fontSize(18)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
    .padding(10)
    .backgroundColor($r('app.color.panel_background'))
    .border({ width: 1, color: $r('app.color.card_border') })
    .borderRadius(6)
  }

  @Builder
  private buildUsageTab(): void {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        this.buildUsageMetric(
          $r('app.string.agent_session_window_usage_actual_tokens'),
          this.numericText(this.snapshot.actualTokens)
        );
        this.buildUsageMetric(
          $r('app.string.agent_session_window_usage_estimated_tokens'),
          this.numericText(this.snapshot.estimatedTokens)
        );
      }
      .width('100%')

      Row({ space: 8 }) {
        this.buildUsageMetric(
          $r('app.string.agent_session_window_usage_actual_cost'),
          this.costText(this.snapshot.actualCost)
        );
        this.buildUsageMetric(
          $r('app.string.agent_session_window_usage_estimated_cost'),
          this.costText(this.snapshot.estimatedCost)
        );
      }
      .width('100%')

      if (this.snapshot.budgetWarning) {
        Row({ space: 8 }) {
          SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
            .fontSize(16)
            .fontColor([$r('app.color.tag_red')])
          Text($r('app.string.agent_session_window_usage_budget_warning'))
            .fontSize(13)
            .fontColor($r('app.color.tag_red'))
        }
        .width('100%')
        .padding(10)
        .backgroundColor($r('app.color.background_secondary'))
        .borderRadius(6)
      }

      if (this.snapshot.usageEvents.length === 0) {
        Column() {
          Text($r('app.string.agent_session_window_empty_usage'))
            .fontSize(14)
            .fontColor($r('app.color.text_tertiary'))
        }
        .width('100%')
        .height(160)
        .justifyContent(FlexAlign.Center)
      } else {
        List({ space: 6 }) {
          ForEach(this.snapshot.usageEvents, (item: AgentBridgeUsageEventRecord): void => {
            ListItem() {
              Row({ space: 8 }) {
                Column({ space: 3 }) {
                  Text(item.providerId.length > 0 ? item.providerId : item.source)
                    .fontSize(13)
                    .fontColor($r('app.color.text_secondary'))
                  Text(item.occurredAt)
                    .fontSize(11)
                    .fontColor($r('app.color.text_muted'))
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)
                Text(this.usageEventTokenText(item))
                  .fontSize(13)
                  .fontColor(item.estimated ? $r('app.color.tag_purple') : $r('app.color.tag_green'))
              }
              .width('100%')
              .padding(9)
              .backgroundColor($r('app.color.panel_background'))
              .border({ width: 1, color: $r('app.color.card_border') })
              .borderRadius(6)
            }
          }, (item: AgentBridgeUsageEventRecord): string => item.eventId)
        }
        .width('100%')
        .height('calc(100% - 230vp)')
        .scrollBar(BarState.Auto)
      }
    }
    .width('100%')
    .height('100%')
    .padding(12)
  }

  @Builder
  private buildTerminalButton(item: AgentHomeSessionWindowTerminal): void {
    ListItem() {
      Button() {
        Column({ space: 3 }) {
          Text(item.name.length > 0 ? item.name : item.terminalId)
            .fontSize(13)
            .fontColor(item.selected ? $r('app.color.text_white') : $r('app.color.text_primary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(item.status)
            .fontSize(11)
            .fontColor(item.selected ? $r('app.color.text_white_medium') : $r('app.color.text_tertiary'))
        }
      }
      .width(176)
      .height(58)
      .type(ButtonType.Normal)
      .backgroundColor(item.selected ? $r('app.color.button_primary') : $r('app.color.panel_background'))
      .border({ width: 1, color: item.selected ? $r('app.color.button_primary') : $r('app.color.card_border') })
      .borderRadius(6)
      .accessibilityText($r('app.string.agent_session_window_terminal_select'))
      .onClick((): void => {
        this.controller.selectTerminal(item.terminalId);
      })
    }
  }

  @Builder
  private buildTerminalTab(): void {
    if (this.snapshot.terminals.length === 0) {
      Column() {
        Text($r('app.string.agent_session_window_empty_terminals'))
          .fontSize(14)
          .fontColor($r('app.color.text_tertiary'))
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    } else {
      Column({ space: 10 }) {
        List({ space: 8 }) {
          ForEach(this.snapshot.terminals, (item: AgentHomeSessionWindowTerminal): void => {
            this.buildTerminalButton(item);
          }, (item: AgentHomeSessionWindowTerminal): string => item.terminalId)
        }
        .width('100%')
        .height(66)
        .listDirection(Axis.Horizontal)
        .scrollBar(BarState.Off)

        Scroll() {
          if (this.snapshot.terminalText.length > 0) {
            Text(this.snapshot.terminalText)
              .width('100%')
              .fontSize(12)
              .lineHeight(18)
              .fontFamily('monospace')
              .fontColor($r('app.color.text_white'))
              .copyOption(CopyOptions.LocalDevice)
          } else {
            Text($r('app.string.agent_session_window_terminal_waiting'))
              .width('100%')
              .fontSize(13)
              .fontColor($r('app.color.text_white_low'))
              .textAlign(TextAlign.Center)
          }
        }
        .width('100%')
        .height('calc(100% - 76vp)')
        .padding(12)
        .backgroundColor($r('app.color.component_control_bg'))
        .borderRadius(6)
        .scrollBar(BarState.Auto)
      }
      .width('100%')
      .height('100%')
      .padding(12)
    }
  }

  build() {
    Column() {
      this.buildHeader();
      Tabs({ barPosition: BarPosition.Start, index: this.activeTabIndex }) {
        TabContent() {
          this.buildMessagesTab();
        }
        .tabBar($r('app.string.agent_session_window_messages'))

        TabContent() {
          this.buildQueueTab();
        }
        .tabBar($r('app.string.agent_session_window_queue'))

        TabContent() {
          this.buildUsageTab();
        }
        .tabBar($r('app.string.agent_session_window_usage'))

        TabContent() {
          this.buildTerminalTab();
        }
        .tabBar($r('app.string.agent_session_window_terminal'))
      }
      .width('100%')
      .layoutWeight(1)
      .barMode(BarMode.Scrollable)
      .onChange((index: number): void => {
        this.activeTabIndex = index;
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_primary'))
  }
}
