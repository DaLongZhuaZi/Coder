export class AgentHomeDiagnosticsActionTarget {
  static readonly SETTINGS: string = 'settings';
  static readonly PROVIDERS: string = 'providers';
  static readonly TERMINAL: string = 'terminal';
  static readonly MESSAGE_QUEUE: string = 'message_queue';
  static readonly USAGE: string = 'usage';
  static readonly SECURE_STORAGE: string = 'secure_storage';
  static readonly REMOTE_CONFIG: string = 'remote_config';
  static readonly PERSISTENCE: string = 'persistence';
}

export class AgentHomeDiagnosticsActionPolicy {
  static readonly OPEN_DAEMON_SETTINGS: string = 'open_daemon_settings';
  static readonly OPEN_PROVIDER_SETTINGS: string = 'open_provider_settings';
  static readonly OPEN_TERMINAL_SETTINGS: string = 'open_terminal_settings';
  static readonly REVIEW_MESSAGE_QUEUE: string = 'review_message_queue';
  static readonly OPEN_USAGE_SETTINGS: string = 'open_usage_settings';
  static readonly OPEN_SECURE_STORAGE_HELP: string = 'open_secure_storage_help';
  static readonly REFRESH_REMOTE_CONFIG: string = 'refresh_remote_config';
  static readonly REPAIR_PERSISTENCE: string = 'repair_persistence';

  static normalize(actionId: string): string {
    if (actionId === AgentHomeDiagnosticsActionPolicy.OPEN_DAEMON_SETTINGS ||
      actionId === AgentHomeDiagnosticsActionPolicy.OPEN_PROVIDER_SETTINGS ||
      actionId === AgentHomeDiagnosticsActionPolicy.OPEN_TERMINAL_SETTINGS ||
      actionId === AgentHomeDiagnosticsActionPolicy.REVIEW_MESSAGE_QUEUE ||
      actionId === AgentHomeDiagnosticsActionPolicy.OPEN_USAGE_SETTINGS ||
      actionId === AgentHomeDiagnosticsActionPolicy.OPEN_SECURE_STORAGE_HELP ||
      actionId === AgentHomeDiagnosticsActionPolicy.REFRESH_REMOTE_CONFIG ||
      actionId === AgentHomeDiagnosticsActionPolicy.REPAIR_PERSISTENCE) {
      return actionId;
    }
    return '';
  }

  static isAllowed(actionId: string): boolean {
    return AgentHomeDiagnosticsActionPolicy.normalize(actionId).length > 0;
  }

  static targetForAction(actionId: string): string {
    const normalized = AgentHomeDiagnosticsActionPolicy.normalize(actionId);
    if (normalized === AgentHomeDiagnosticsActionPolicy.OPEN_DAEMON_SETTINGS) {
      return AgentHomeDiagnosticsActionTarget.SETTINGS;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.OPEN_PROVIDER_SETTINGS) {
      return AgentHomeDiagnosticsActionTarget.PROVIDERS;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.OPEN_TERMINAL_SETTINGS) {
      return AgentHomeDiagnosticsActionTarget.TERMINAL;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.REVIEW_MESSAGE_QUEUE) {
      return AgentHomeDiagnosticsActionTarget.MESSAGE_QUEUE;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.OPEN_USAGE_SETTINGS) {
      return AgentHomeDiagnosticsActionTarget.USAGE;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.OPEN_SECURE_STORAGE_HELP) {
      return AgentHomeDiagnosticsActionTarget.SECURE_STORAGE;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.REFRESH_REMOTE_CONFIG) {
      return AgentHomeDiagnosticsActionTarget.REMOTE_CONFIG;
    }
    if (normalized === AgentHomeDiagnosticsActionPolicy.REPAIR_PERSISTENCE) {
      return AgentHomeDiagnosticsActionTarget.PERSISTENCE;
    }
    return '';
  }
}
