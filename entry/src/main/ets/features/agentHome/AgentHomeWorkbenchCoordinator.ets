export class AgentHomeWorkbenchMode {
  static readonly LEGACY: string = 'legacy';
  static readonly COMPACT: string = 'compact';
  static readonly MEDIUM: string = 'medium';
  static readonly EXPANDED: string = 'expanded';
}

export class AgentHomeWorkbenchLayoutSnapshot {
  mode: string;
  widthVp: number;
  columnCount: number;
  scopePaneWidth: number;
  conversationMinWidth: number;
  detailPaneWidth: number;
  usesLegacyNavigation: boolean;

  constructor(
    mode: string,
    widthVp: number,
    columnCount: number,
    scopePaneWidth: number,
    conversationMinWidth: number,
    detailPaneWidth: number,
    usesLegacyNavigation: boolean
  ) {
    this.mode = mode;
    this.widthVp = widthVp;
    this.columnCount = columnCount;
    this.scopePaneWidth = scopePaneWidth;
    this.conversationMinWidth = conversationMinWidth;
    this.detailPaneWidth = detailPaneWidth;
    this.usesLegacyNavigation = usesLegacyNavigation;
  }
}

export class AgentHomeWorkbenchCoordinator {
  static readonly MEDIUM_BREAKPOINT_VP: number = 720;
  static readonly EXPANDED_BREAKPOINT_VP: number = 1200;
  static readonly MEDIUM_SCOPE_WIDTH_VP: number = 280;
  static readonly EXPANDED_SCOPE_WIDTH_VP: number = 300;
  static readonly EXPANDED_CONVERSATION_MIN_WIDTH_VP: number = 480;
  static readonly EXPANDED_DETAIL_MIN_WIDTH_VP: number = 320;
  static readonly EXPANDED_DETAIL_MAX_WIDTH_VP: number = 420;

  resolve(widthVp: number, adaptiveWorkbenchEnabled: boolean): AgentHomeWorkbenchLayoutSnapshot {
    const normalizedWidth = widthVp > 0 ? widthVp : 0;
    if (!adaptiveWorkbenchEnabled) {
      return new AgentHomeWorkbenchLayoutSnapshot(
        AgentHomeWorkbenchMode.LEGACY,
        normalizedWidth,
        1,
        0,
        normalizedWidth,
        0,
        true
      );
    }
    if (normalizedWidth < AgentHomeWorkbenchCoordinator.MEDIUM_BREAKPOINT_VP) {
      return new AgentHomeWorkbenchLayoutSnapshot(
        AgentHomeWorkbenchMode.COMPACT,
        normalizedWidth,
        1,
        0,
        normalizedWidth,
        0,
        false
      );
    }
    if (normalizedWidth < AgentHomeWorkbenchCoordinator.EXPANDED_BREAKPOINT_VP) {
      return new AgentHomeWorkbenchLayoutSnapshot(
        AgentHomeWorkbenchMode.MEDIUM,
        normalizedWidth,
        2,
        AgentHomeWorkbenchCoordinator.MEDIUM_SCOPE_WIDTH_VP,
        normalizedWidth - AgentHomeWorkbenchCoordinator.MEDIUM_SCOPE_WIDTH_VP,
        0,
        false
      );
    }
    let detailWidth = normalizedWidth - AgentHomeWorkbenchCoordinator.EXPANDED_SCOPE_WIDTH_VP -
      AgentHomeWorkbenchCoordinator.EXPANDED_CONVERSATION_MIN_WIDTH_VP;
    if (detailWidth < AgentHomeWorkbenchCoordinator.EXPANDED_DETAIL_MIN_WIDTH_VP) {
      detailWidth = AgentHomeWorkbenchCoordinator.EXPANDED_DETAIL_MIN_WIDTH_VP;
    }
    if (detailWidth > AgentHomeWorkbenchCoordinator.EXPANDED_DETAIL_MAX_WIDTH_VP) {
      detailWidth = AgentHomeWorkbenchCoordinator.EXPANDED_DETAIL_MAX_WIDTH_VP;
    }
    return new AgentHomeWorkbenchLayoutSnapshot(
      AgentHomeWorkbenchMode.EXPANDED,
      normalizedWidth,
      3,
      AgentHomeWorkbenchCoordinator.EXPANDED_SCOPE_WIDTH_VP,
      AgentHomeWorkbenchCoordinator.EXPANDED_CONVERSATION_MIN_WIDTH_VP,
      detailWidth,
      false
    );
  }
}
