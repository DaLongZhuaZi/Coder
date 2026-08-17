export class AgentHomeCommandId {
  static readonly OPEN_PALETTE: string = 'command_palette';
  static readonly SEND_MESSAGE: string = 'send_message';
  static readonly FOCUS_COMPOSER: string = 'focus_composer';
  static readonly OPEN_TERMINAL: string = 'open_terminal';
  static readonly REFRESH_VISIBLE_SCOPE: string = 'refresh_visible_scope';
  static readonly FOCUS_LEFT_PANE: string = 'focus_left_pane';
  static readonly FOCUS_MIDDLE_PANE: string = 'focus_middle_pane';
  static readonly FOCUS_RIGHT_PANE: string = 'focus_right_pane';
  static readonly CLOSE_TOP_OVERLAY: string = 'close_top_overlay';
}

export class AgentHomeCommandDefinition {
  id: string;
  category: string;
  title: string;
  keywords: Array<string>;
  symbolName: string;
  action: string;
  shortcut: string;
  enabled: boolean;
  disabledReason: string;
  requiresConfirmation: boolean;

  constructor(
    id: string,
    category: string,
    title: string,
    keywords: Array<string>,
    symbolName: string,
    action: string,
    shortcut: string = '',
    enabled: boolean = true,
    disabledReason: string = '',
    requiresConfirmation: boolean = false
  ) {
    this.id = id;
    this.category = category;
    this.title = title;
    this.keywords = keywords;
    this.symbolName = symbolName;
    this.action = action;
    this.shortcut = shortcut;
    this.enabled = enabled;
    this.disabledReason = disabledReason;
    this.requiresConfirmation = requiresConfirmation;
  }

  copy(): AgentHomeCommandDefinition {
    const keywordCopies: Array<string> = [];
    for (let index = 0; index < this.keywords.length; index++) {
      keywordCopies.push(this.keywords[index]);
    }
    return new AgentHomeCommandDefinition(
      this.id,
      this.category,
      this.title,
      keywordCopies,
      this.symbolName,
      this.action,
      this.shortcut,
      this.enabled,
      this.disabledReason,
      this.requiresConfirmation
    );
  }
}

export class AgentHomeKeyboardShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  composerFocused: boolean;
  commandSearchFocused: boolean;
  dialogOpen: boolean;
  overlayVisible: boolean;
  shortcutsEnabled: boolean;
  leftPaneAvailable: boolean;
  middlePaneAvailable: boolean;
  rightPaneAvailable: boolean;

  constructor(key: string) {
    this.key = key;
    this.ctrlKey = false;
    this.metaKey = false;
    this.altKey = false;
    this.shiftKey = false;
    this.composerFocused = false;
    this.commandSearchFocused = false;
    this.dialogOpen = false;
    this.overlayVisible = false;
    this.shortcutsEnabled = true;
    this.leftPaneAvailable = true;
    this.middlePaneAvailable = true;
    this.rightPaneAvailable = true;
  }
}

export class AgentHomeCommandShortcutDecision {
  handled: boolean;
  commandId: string;
  blocked: boolean;
  disabledReason: string;

  constructor(
    handled: boolean = false,
    commandId: string = '',
    blocked: boolean = false,
    disabledReason: string = ''
  ) {
    this.handled = handled;
    this.commandId = commandId;
    this.blocked = blocked;
    this.disabledReason = disabledReason;
  }
}

export class AgentHomeCommandRegistry {
  private definitions: Array<AgentHomeCommandDefinition> = [];

  replace(definitions: Array<AgentHomeCommandDefinition>): void {
    const nextDefinitions: Array<AgentHomeCommandDefinition> = [];
    for (let index = 0; index < definitions.length; index++) {
      if (definitions[index].id.length > 0 && this.indexOfId(nextDefinitions, definitions[index].id) < 0) {
        nextDefinitions.push(definitions[index].copy());
      }
    }
    this.definitions = nextDefinitions;
  }

  all(): Array<AgentHomeCommandDefinition> {
    const copies: Array<AgentHomeCommandDefinition> = [];
    for (let index = 0; index < this.definitions.length; index++) {
      copies.push(this.definitions[index].copy());
    }
    return copies;
  }

  filter(query: string): Array<AgentHomeCommandDefinition> {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return this.all();
    }
    const matches: Array<AgentHomeCommandDefinition> = [];
    for (let score = 0; score <= 3; score++) {
      for (let index = 0; index < this.definitions.length; index++) {
        if (this.matchScore(this.definitions[index], normalizedQuery) === score) {
          matches.push(this.definitions[index].copy());
        }
      }
    }
    return matches;
  }

  nextSelection(currentIndex: number, direction: number, itemCount: number): number {
    if (itemCount <= 0) {
      return -1;
    }
    if (currentIndex < 0 || currentIndex >= itemCount) {
      return direction < 0 ? itemCount - 1 : 0;
    }
    if (direction < 0) {
      return currentIndex === 0 ? itemCount - 1 : currentIndex - 1;
    }
    return currentIndex === itemCount - 1 ? 0 : currentIndex + 1;
  }

  resolveShortcut(input: AgentHomeKeyboardShortcutInput): AgentHomeCommandShortcutDecision {
    const key = input.key.trim().toLowerCase();
    if (!input.shortcutsEnabled) {
      return new AgentHomeCommandShortcutDecision(false, '', true, 'shortcuts_disabled');
    }
    if (key === 'escape' || key === 'esc') {
      if (input.overlayVisible || input.dialogOpen) {
        return this.decisionForCommand(AgentHomeCommandId.CLOSE_TOP_OVERLAY);
      }
      return new AgentHomeCommandShortcutDecision();
    }
    const commandId = this.commandIdForShortcut(input, key);
    if (commandId.length === 0) {
      return new AgentHomeCommandShortcutDecision();
    }
    const isTextEntryFocused = input.composerFocused || input.commandSearchFocused || input.dialogOpen;
    if (isTextEntryFocused && commandId !== AgentHomeCommandId.SEND_MESSAGE) {
      return new AgentHomeCommandShortcutDecision(true, commandId, true, 'text_input_focused');
    }
    if (commandId === AgentHomeCommandId.FOCUS_LEFT_PANE && !input.leftPaneAvailable) {
      return new AgentHomeCommandShortcutDecision(true, commandId, true, 'pane_unavailable');
    }
    if (commandId === AgentHomeCommandId.FOCUS_MIDDLE_PANE && !input.middlePaneAvailable) {
      return new AgentHomeCommandShortcutDecision(true, commandId, true, 'pane_unavailable');
    }
    if (commandId === AgentHomeCommandId.FOCUS_RIGHT_PANE && !input.rightPaneAvailable) {
      return new AgentHomeCommandShortcutDecision(true, commandId, true, 'pane_unavailable');
    }
    return this.decisionForCommand(commandId);
  }

  private commandIdForShortcut(input: AgentHomeKeyboardShortcutInput, key: string): string {
    const commandModifier = input.ctrlKey || input.metaKey;
    if (commandModifier && !input.altKey && key === 'enter') {
      return AgentHomeCommandId.SEND_MESSAGE;
    }
    if (commandModifier && !input.altKey && !input.shiftKey && key === 'k') {
      return AgentHomeCommandId.OPEN_PALETTE;
    }
    if (commandModifier && !input.altKey && !input.shiftKey && key === 'l') {
      return AgentHomeCommandId.FOCUS_COMPOSER;
    }
    if (commandModifier && !input.altKey && input.shiftKey && key === 't') {
      return AgentHomeCommandId.OPEN_TERMINAL;
    }
    if (commandModifier && !input.altKey && !input.shiftKey && key === 'r') {
      return AgentHomeCommandId.REFRESH_VISIBLE_SCOPE;
    }
    if (input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey && key === '1') {
      return AgentHomeCommandId.FOCUS_LEFT_PANE;
    }
    if (input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey && key === '2') {
      return AgentHomeCommandId.FOCUS_MIDDLE_PANE;
    }
    if (input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey && key === '3') {
      return AgentHomeCommandId.FOCUS_RIGHT_PANE;
    }
    return '';
  }

  private decisionForCommand(commandId: string): AgentHomeCommandShortcutDecision {
    const definition = this.findById(commandId);
    if (definition === null) {
      return new AgentHomeCommandShortcutDecision(false, commandId, true, 'command_unavailable');
    }
    if (!definition.enabled) {
      return new AgentHomeCommandShortcutDecision(true, commandId, true, definition.disabledReason);
    }
    return new AgentHomeCommandShortcutDecision(true, commandId, false, '');
  }

  private findById(commandId: string): AgentHomeCommandDefinition | null {
    for (let index = 0; index < this.definitions.length; index++) {
      if (this.definitions[index].id === commandId) {
        return this.definitions[index];
      }
    }
    return null;
  }

  private indexOfId(definitions: Array<AgentHomeCommandDefinition>, commandId: string): number {
    for (let index = 0; index < definitions.length; index++) {
      if (definitions[index].id === commandId) {
        return index;
      }
    }
    return -1;
  }

  private matchScore(definition: AgentHomeCommandDefinition, query: string): number {
    const id = definition.id.toLowerCase();
    const title = definition.title.toLowerCase();
    if (id === query || title === query) {
      return 0;
    }
    if (title.indexOf(query) === 0) {
      return 1;
    }
    for (let index = 0; index < definition.keywords.length; index++) {
      if (definition.keywords[index].toLowerCase().indexOf(query) === 0) {
        return 2;
      }
    }
    if (id.indexOf(query) >= 0 || title.indexOf(query) >= 0 ||
      definition.category.toLowerCase().indexOf(query) >= 0 ||
      definition.action.toLowerCase().indexOf(query) >= 0 ||
      definition.shortcut.toLowerCase().indexOf(query) >= 0) {
      return 3;
    }
    for (let index = 0; index < definition.keywords.length; index++) {
      if (definition.keywords[index].toLowerCase().indexOf(query) >= 0) {
        return 3;
      }
    }
    return -1;
  }
}
