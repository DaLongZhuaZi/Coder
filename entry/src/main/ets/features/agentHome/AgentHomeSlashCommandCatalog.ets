import { AgentBridgeProviderId } from '../agentBridge/AgentBridgeModels';

export class AgentHomeSlashCommandOption {
  providerId: string;
  command: string;
  description: string;
  source: string;
  available: boolean;
  warning: string;
  category: string;
  requiresConfirmation: boolean;
  aliases: Array<string>;

  constructor(
    providerId: string,
    command: string,
    description: string,
    source: string,
    available: boolean = true,
    warning: string = '',
    category: string = '',
    requiresConfirmation: boolean = false,
    aliases: Array<string> = []
  ) {
    this.providerId = providerId;
    this.command = command;
    this.description = description;
    this.source = source;
    this.available = available;
    this.warning = warning;
    this.category = category;
    this.requiresConfirmation = requiresConfirmation;
    this.aliases = aliases;
  }
}

export class AgentHomeSlashCommandCatalog {
  static commandsForProvider(providerId: string, providerName: string): Array<AgentHomeSlashCommandOption> {
    const items: Array<AgentHomeSlashCommandOption> = [];
    if (AgentHomeSlashCommandCatalog.matchesOpenCodeCompatibleProvider(providerId, providerName)) {
      AgentHomeSlashCommandCatalog.pushOpenCodeCommands(items, providerId, providerName);
      return items;
    }
    if (AgentHomeSlashCommandCatalog.matchesProvider(providerId, providerName, AgentBridgeProviderId.CODEX)) {
      AgentHomeSlashCommandCatalog.pushCodexCommands(items);
      return items;
    }
    if (AgentHomeSlashCommandCatalog.matchesProvider(providerId, providerName, AgentBridgeProviderId.CLAUDE)) {
      AgentHomeSlashCommandCatalog.pushClaudeCommands(items);
      return items;
    }
    return items;
  }

  private static matchesProvider(providerId: string, providerName: string, target: string): boolean {
    const id = providerId.toLowerCase();
    const name = providerName.toLowerCase();
    if (id === target) {
      return true;
    }
    if (target === AgentBridgeProviderId.OPENCODE && id.indexOf('opencode') >= 0) {
      return true;
    }
    if (target === AgentBridgeProviderId.CODEX && (id.indexOf('codex') >= 0 || name.indexOf('codex') >= 0)) {
      return true;
    }
    if (target === AgentBridgeProviderId.CLAUDE && (id.indexOf('claude') >= 0 || name.indexOf('claude') >= 0)) {
      return true;
    }
    return false;
  }

  private static matchesOpenCodeCompatibleProvider(providerId: string, providerName: string): boolean {
    if (AgentHomeSlashCommandCatalog.matchesProvider(providerId, providerName, AgentBridgeProviderId.OPENCODE)) {
      return true;
    }
    if (providerId === AgentBridgeProviderId.DEVECO || providerId === AgentBridgeProviderId.MIMO) {
      return true;
    }
    const name = providerName.toLowerCase();
    return name.indexOf('deveco') >= 0 || name.indexOf('mimo') >= 0;
  }

  private static pushOpenCodeCommands(items: Array<AgentHomeSlashCommandOption>, providerId: string, providerName: string): void {
    const source = providerName.length > 0 ? providerName : 'OpenCode TUI';
    AgentHomeSlashCommandCatalog.push(items, providerId, '/connect', 'Add a provider and API key.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/compact', 'Compact the current session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/summarize', 'Alias for compacting the current session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/details', 'Toggle tool execution details.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/editor', 'Open an external editor for a longer message.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/exit', 'Exit OpenCode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/quit', 'Alias for exiting OpenCode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/q', 'Short alias for exiting OpenCode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/export', 'Export the current conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/help', 'Show the help dialog.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/init', 'Create or update AGENTS.md instructions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/models', 'List available models.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/new', 'Start a new session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/clear', 'Alias for starting a new session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/redo', 'Redo a previously undone message.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/sessions', 'List and switch sessions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/resume', 'Alias for listing and switching sessions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/continue', 'Alias for listing and switching sessions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/share', 'Share the current session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/themes', 'List available themes.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/thinking', 'Toggle display of reasoning blocks.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/undo', 'Undo the last message and file changes.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/unshare', 'Stop sharing the current session.', source);
  }

  private static pushCodexCommands(items: Array<AgentHomeSlashCommandOption>): void {
    const providerId = AgentBridgeProviderId.CODEX;
    const source = 'Codex CLI';
    AgentHomeSlashCommandCatalog.push(items, providerId, '/permissions', 'Adjust approval requirements and allowed actions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ide', 'Include editor context in the next prompt.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/keymap', 'Inspect or update TUI key bindings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/vim', 'Toggle Vim composer mode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/sandbox-add-read-dir', 'Grant Windows sandbox read access to a directory.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/agent', 'Switch the active agent thread.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/apps', 'Browse connectors and insert them into a prompt.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/plugins', 'Browse and manage plugins.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/hooks', 'View and manage lifecycle hooks.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/clear', 'Clear the terminal and start a fresh chat.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/archive', 'Archive the current session and exit.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/compact', 'Summarize conversation context to free tokens.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/copy', 'Copy the latest completed output.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/diff', 'Show the Git diff.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/exit', 'Exit the CLI.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/quit', 'Alias for exiting the CLI.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/experimental', 'Toggle experimental features.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/approve', 'Approve one retry after an auto-review denial.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/memories', 'Configure memory use and generation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/skills', 'Browse and use skills.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/feedback', 'Send diagnostics or feedback.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/init', 'Generate an AGENTS.md scaffold.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/logout', 'Sign out of Codex.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/mcp', 'List configured MCP tools.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/mention', 'Attach a file or folder to the conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/model', 'Choose the active model and effort where available.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/fast', 'Toggle the Fast service tier when available.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/plan', 'Switch to plan mode and optionally send a prompt.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/goal', 'Set, view, pause, resume, or clear a task goal.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/personality', 'Choose a response style.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ps', 'Show background terminals and recent output.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/stop', 'Stop background terminal work.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/clean', 'Alias for stopping background terminal work.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/fork', 'Fork the current conversation into a new thread.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/side', 'Start an ephemeral side conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/btw', 'Alias for a side conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/raw', 'Toggle raw scrollback mode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/resume', 'Resume a saved conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/new', 'Start a new conversation in the same CLI session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/review', 'Ask Codex to review the working tree.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/status', 'Display session configuration and token usage.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/debug-config', 'Print config and policy diagnostics.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/statusline', 'Configure TUI footer fields.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/title', 'Configure terminal title fields.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/theme', 'Choose a syntax highlighting theme.', source);
  }

  private static pushClaudeCommands(items: Array<AgentHomeSlashCommandOption>): void {
    const providerId = AgentBridgeProviderId.CLAUDE;
    const source = 'Claude Code';
    AgentHomeSlashCommandCatalog.push(items, providerId, '/add-dir', 'Add a working directory for the current session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/advisor', 'Enable or disable advisor guidance.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/agents', 'Manage agent configurations.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/autofix-pr', 'Start a cloud session to fix PR issues.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/background', 'Detach the session to run in the background.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/bg', 'Alias for background session detaching.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/batch', 'Plan and run parallel codebase work.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/branch', 'Create a branch of the current conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/btw', 'Ask a quick side question.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/cd', 'Move the session to a new working directory.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/chrome', 'Configure Claude in Chrome settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/claude-api', 'Load Claude API guidance or run migration help.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/clear', 'Start a new empty conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/reset', 'Alias for starting a new conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/new', 'Alias for starting a new conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/code-review', 'Review current changes for bugs or cleanups.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/color', 'Set the prompt bar color.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/compact', 'Summarize conversation context.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/config', 'Open settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/settings', 'Alias for opening settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/context', 'Show context usage.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/copy', 'Copy a recent assistant response.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/cost', 'Alias for usage statistics.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/debug', 'Enable debug logging and troubleshoot.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/deep-research', 'Run a cited deep research workflow.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/desktop', 'Continue in Claude Code Desktop.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/app', 'Alias for continuing in Claude Code Desktop.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/diff', 'Open an interactive diff viewer.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/doctor', 'Diagnose installation and settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/effort', 'Set the model effort level.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/exit', 'Exit or detach the CLI session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/quit', 'Alias for exiting the CLI session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/export', 'Export the current conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/fast', 'Toggle fast mode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/feedback', 'Submit feedback or report a bug.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/bug', 'Alias for feedback.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/share', 'Alias for feedback sharing.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/fewer-permission-prompts', 'Generate allow rules to reduce prompts.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/focus', 'Toggle focused conversation view.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/fork', 'Spawn a forked background subagent.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/goal', 'Set, show, or clear a goal.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/heapdump', 'Write heap diagnostics.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/help', 'Show help and available commands.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/hooks', 'View hook configurations.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ide', 'Manage IDE integrations and status.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/init', 'Initialize project memory.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/insights', 'Analyze Claude Code sessions.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/install-github-app', 'Set up the Claude GitHub app.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/install-slack-app', 'Install the Claude Slack app.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/keybindings', 'Open keyboard shortcuts.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/login', 'Sign in to an Anthropic account.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/logout', 'Sign out from Anthropic.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/loop', 'Run a prompt repeatedly.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/proactive', 'Alias for loop automation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/mcp', 'Manage MCP connections.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/memory', 'Edit memory files and settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/mobile', 'Show a mobile app QR code.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ios', 'Alias for mobile app QR code.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/android', 'Alias for mobile app QR code.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/model', 'Switch the AI model.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/passes', 'Share a Claude Code pass when eligible.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/permissions', 'Manage tool permission rules.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/allowed-tools', 'Alias for permission rules.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/plan', 'Enter plan mode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/plugin', 'Manage Claude Code plugins.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/powerup', 'Discover Claude Code features.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/privacy-settings', 'View or update privacy settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/radio', 'Open Claude FM.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/recap', 'Generate a one-line session summary.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/release-notes', 'View changelog entries.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/reload-plugins', 'Reload active plugins.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/reload-skills', 'Re-scan skills and command directories.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/remote-control', 'Enable remote control from claude.ai.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/rc', 'Alias for remote control.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/remote-env', 'Choose the cloud agent environment.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/rename', 'Rename the current session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/resume', 'Resume an earlier conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/continue', 'Alias for resuming a conversation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/review', 'Review a pull request locally.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/rewind', 'Rewind conversation or code to a checkpoint.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/checkpoint', 'Alias for rewind.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/undo', 'Alias for rewind.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/run', 'Launch and inspect the running app.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/run-skill-generator', 'Create a project launch skill.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/sandbox', 'Toggle sandbox mode.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/schedule', 'Create or manage routines.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/routines', 'Alias for routines.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/scroll-speed', 'Adjust mouse wheel speed.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/security-review', 'Review pending changes for security risks.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/setup-bedrock', 'Configure Amazon Bedrock.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/setup-vertex', 'Configure Google Vertex AI.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/simplify', 'Review code for cleanup opportunities.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/skills', 'List available skills.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/stats', 'Alias for usage statistics.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/status', 'Show status settings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/statusline', 'Configure the status line.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/stickers', 'Order Claude Code stickers.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/stop', 'Stop an attached background session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/tasks', 'View background work.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/bashes', 'Alias for background tasks.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/team-onboarding', 'Generate a team onboarding guide.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/teleport', 'Pull a web session into the terminal.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/tp', 'Alias for teleport.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/terminal-setup', 'Configure terminal keybindings.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/theme', 'Change the color theme.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/tui', 'Set the terminal UI renderer.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ultraplan', 'Draft a plan in an ultraplan session.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/ultrareview', 'Run a cloud multi-agent code review.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/upgrade', 'Open the upgrade page.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/usage', 'Show cost and activity statistics.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/usage-credits', 'Configure usage credits.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/verify', 'Run and verify an app change.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/voice', 'Toggle voice dictation.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/web-setup', 'Connect GitHub for Claude Code on the web.', source);
    AgentHomeSlashCommandCatalog.push(items, providerId, '/workflows', 'Open the workflow progress view.', source);
  }

  private static push(
    items: Array<AgentHomeSlashCommandOption>,
    providerId: string,
    command: string,
    description: string,
    source: string
  ): void {
    items.push(new AgentHomeSlashCommandOption(providerId, command, description, source));
  }
}
