'use strict';

const path = require('path');
const { RequestType } = require('./protocol');

const MCP_SERVER_ID = 'ngf-agent-bridge-stdio';

const READ_ONLY_TOOL_NAMES = new Set([
  'server_info_get', 'capabilities_get', 'agent_list', 'agent_status', 'timeline_fetch',
  'checkpoint_list', 'permission_list', 'notification_list', 'terminal_list', 'terminal_capture',
  'terminal_hook_status', 'provider_profile_list', 'provider_acp_discover', 'provider_directory_list', 'provider_directory_status', 'provider_usage_list',
  'workspace_registry_list', 'workspace_registry_suggestions', 'workspace_registry_doctor',
  'project_registry_list', 'workspace_changes_get', 'workspace_diff_get', 'workspace_files_list',
  'workspace_file_get', 'worktree_list', 'github_pr_list', 'github_pr_status', 'github_checks_list', 'github_auth_status', 'github_account_list', 'github_binding_get',
  'github_issue_search', 'github_issue_attachment_list', 'usage_summary_get', 'usage_events_list', 'usage_budget_get', 'message_queue_list', 'diagnostics_export', 'daemon_status', 'daemon_health', 'daemon_instance_status', 'daemon_config_status', 'daemon_config_validate', 'daemon_config_preview',
  'daemon_logs', 'daemon_autostart_status', 'daemon_autostart_preview', 'daemon_update_status',
  'daemon_update_check', 'daemon_update_preview', 'security_device_list',
  'security_audit_list', 'security_tls_status', 'security_hosts_status', 'security_token_status',
  'security_auth_status', 'relay_status', 'relay_device_list',
  'schedule_status', 'schedule_list', 'schedule_get', 'schedule_history',
  'loop_status', 'loop_list', 'loop_get', 'loop_rounds',
  'chat_room_status', 'chat_room_list', 'chat_room_get', 'chat_room_message_list'
  , 'voice_status', 'workspace_service_list', 'workspace_service_status', 'workspace_service_health', 'workspace_service_logs',
  'browser_host_list', 'browser_instance_list', 'browser_page_list', 'browser_page_snapshot', 'browser_page_screenshot',
  'browser_page_logs', 'browser_page_wait', 'browser_download_list', 'browser_permission_get'
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'agent_stop', 'agent_archive', 'agent_detach', 'checkpoint_restore', 'permission_respond',
  'notification_prune', 'terminal_kill', 'terminal_hook_install', 'provider_profile_upsert',
  'provider_profile_delete', 'provider_acp_import', 'provider_directory_install', 'provider_directory_rollback', 'provider_directory_remove', 'workspace_registry_create',
  'workspace_registry_import', 'workspace_registry_upsert', 'workspace_registry_archive',
  'workspace_registry_open', 'file_transfer_upload', 'workspace_git_discard',
  'workspace_git_commit', 'workspace_git_pull', 'workspace_git_push', 'workspace_git_branch',
  'workspace_git_stash', 'workspace_git_merge', 'worktree_create', 'worktree_archive',
  'github_pr_create', 'github_pr_update', 'github_pr_reviewers_update', 'github_pr_labels_update', 'github_pr_merge', 'github_auth_device_start', 'github_auth_device_poll', 'github_auth_logout', 'github_binding_set', 'github_watch_start', 'github_watch_stop', 'github_attachment_preview', 'github_attachment_upload', 'daemon_start', 'daemon_stop', 'daemon_restart',
  'daemon_autostart_set', 'daemon_autostart_install', 'daemon_autostart_uninstall',
  'daemon_update_install', 'daemon_update_rollback', 'daemon_config_apply', 'daemon_config_rollback', 'usage_budget_set', 'message_queue_cancel', 'message_queue_retry', 'metadata_generate',
  'security_device_trust', 'security_device_revoke', 'security_tls_set',
  'security_hosts_set', 'security_token_rotate', 'security_auth_set',
  'relay_pairing_start', 'relay_pairing_cancel', 'relay_connect', 'relay_disconnect',
  'relay_device_revoke', 'relay_identity_rotate',
  'schedule_create', 'schedule_update', 'schedule_enable', 'schedule_disable', 'schedule_run_now', 'schedule_remove',
  'loop_create', 'loop_update', 'loop_start', 'loop_pause', 'loop_resume', 'loop_stop', 'loop_takeover', 'loop_remove',
  'chat_room_create', 'chat_room_update', 'chat_room_archive', 'chat_room_member_add', 'chat_room_member_update',
  'chat_room_member_remove', 'chat_room_message_post'
  , 'voice_session_start', 'voice_session_chunk', 'voice_session_finish', 'voice_session_cancel', 'voice_tts_speak', 'voice_tts_stop',
  'workspace_service_upsert', 'workspace_service_open', 'workspace_service_start', 'workspace_service_stop', 'workspace_service_remove',
  'browser_instance_close', 'browser_page_close', 'browser_page_action', 'browser_permission_set'
]);

const OPEN_WORLD_TOOL_NAMES = new Set([
  'agent_attach', 'agent_run', 'agent_send', 'agent_stop', 'agent_resume', 'terminal_create',
  'terminal_kill', 'terminal_hook_install', 'provider_catalog_refresh', 'provider_profile_test',
  'provider_acp_discover', 'provider_acp_import', 'provider_directory_refresh', 'provider_directory_install', 'workspace_registry_open',
  'workspace_file_download', 'attachment_file_download', 'file_transfer_download',
  'file_transfer_upload', 'file_transfer_cancel', 'workspace_git_pull', 'workspace_git_push',
  'github_pr_create', 'github_pr_status', 'github_pr_merge', 'github_checks_list',
  'github_issue_search', 'github_issue_attachment_list', 'daemon_start', 'daemon_stop',
  'daemon_restart', 'daemon_autostart_install', 'daemon_autostart_uninstall', 'daemon_config_fetch',
  'daemon_update_check', 'daemon_update_preview', 'daemon_update_install', 'daemon_update_rollback',
  'relay_pairing_start', 'relay_connect', 'schedule_create', 'schedule_run_now', 'loop_start', 'loop_resume',
  'chat_room_message_post'
  , 'voice_session_start', 'voice_session_chunk', 'voice_session_finish', 'voice_session_cancel', 'voice_tts_speak', 'voice_tts_stop',
  'workspace_service_open', 'workspace_service_start', 'workspace_service_stop',
  'browser_instance_create', 'browser_page_create', 'browser_page_navigate', 'browser_page_action'
]);

function nowIso() {
  return new Date().toISOString();
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function gitToolAction(toolName, args) {
  const action = readString(args, 'action', '').trim();
  if (action.length > 0) {
    return action;
  }
  if (toolName === 'workspace_git_branch') {
    if (readBoolean(args, 'list', false)) return 'list';
    if (readBoolean(args, 'checkout', false)) return 'checkout';
  }
  if (toolName === 'workspace_git_stash') {
    if (readBoolean(args, 'list', false)) return 'list';
    if (readBoolean(args, 'pop', false)) return 'pop';
  }
  return '';
}

function protectedGitToolOperation(toolName, args) {
  if (toolName === 'workspace_git_discard') return 'discard';
  if (toolName === 'workspace_git_pull') return 'pull';
  if (toolName === 'workspace_git_merge') return 'merge';
  if (toolName === 'workspace_git_push' && readBoolean(args, 'force', false)) return 'push.force';
  const action = gitToolAction(toolName, args);
  if (toolName === 'workspace_git_branch' && action === 'delete') return 'branch.delete';
  if (toolName === 'workspace_git_stash' && (action === 'pop' || action === 'drop')) return 'stash.' + action;
  return '';
}

function gitPlanConfirmationFailure(toolName, args) {
  const operation = protectedGitToolOperation(toolName, args);
  if (operation.length === 0) {
    return null;
  }
  if (!readBoolean(args, 'confirm', false)) {
    return null;
  }
  if (readString(args, 'planId', '').trim().length > 0) {
    return null;
  }
  return {
    ok: false,
    failureCategory: 'git_plan_required',
    toolName,
    operation,
    riskLevel: 'high',
    message: 'Confirming this high-risk Git operation requires the planId returned by preview.',
    remediation: 'Call the tool without confirm to obtain a preview, then repeat it with the returned planId and confirm=true.'
  };
}

function httpBridgeUrl(config) {
  const host = config && typeof config.host === 'string' && config.host.length > 0 ? config.host : '127.0.0.1';
  const port = config && typeof config.port === 'number' && config.port > 0 ? config.port : 8787;
  return 'http://' + host + ':' + String(port);
}

function stdioServerPath() {
  return path.join(__dirname, 'mcp-stdio-server.js');
}

function toolAccessPolicy(name) {
  const readOnly = READ_ONLY_TOOL_NAMES.has(name);
  const destructive = DESTRUCTIVE_TOOL_NAMES.has(name);
  return {
    riskLevel: destructive ? 'high' : (readOnly ? 'read_only' : 'mutating'),
    confirmationRequired: destructive,
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly,
    openWorldHint: OPEN_WORLD_TOOL_NAMES.has(name)
  };
}

function toolDefinition(name, description, inputSchema) {
  const policy = toolAccessPolicy(name);
  if (policy.confirmationRequired && inputSchema && inputSchema.properties &&
    !Object.prototype.hasOwnProperty.call(inputSchema.properties, 'confirm')) {
    inputSchema.properties.confirm = booleanProperty('Explicitly confirm this potentially destructive MCP operation.');
  }
  return {
    name,
    description,
    inputSchema,
    annotations: {
      readOnlyHint: policy.readOnlyHint,
      destructiveHint: policy.destructiveHint,
      idempotentHint: policy.idempotentHint,
      openWorldHint: policy.openWorldHint
    },
    _meta: {
      'ngf/riskLevel': policy.riskLevel,
      'ngf/confirmationRequired': policy.confirmationRequired
    }
  };
}

function objectSchema(properties, required) {
  return {
    type: 'object',
    properties,
    required: Array.isArray(required) ? required : []
  };
}

function stringProperty(description) {
  return {
    type: 'string',
    description
  };
}

function booleanProperty(description) {
  return {
    type: 'boolean',
    description
  };
}

function numberProperty(description) {
  return {
    type: 'number',
    description
  };
}

function objectProperty(description) {
  return {
    type: 'object',
    description
  };
}

function arrayProperty(description) {
  return {
    type: 'array',
    description
  };
}

function toolRequiresConfirmation(toolName, args) {
  if (!DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return false;
  }
  if (toolName === 'checkpoint_restore') {
    return !readBoolean(args, 'dryRun', false);
  }
  if (toolName === 'terminal_hook_install' || toolName === 'provider_acp_import' ||
    toolName === 'provider_directory_install' || toolName === 'provider_directory_rollback' || toolName === 'provider_directory_remove' ||
    toolName === 'workspace_registry_create' || toolName === 'workspace_registry_import' ||
    toolName === 'workspace_registry_archive' || toolName === 'workspace_registry_open' ||
    toolName === 'worktree_create' || toolName === 'worktree_archive' ||
    toolName === 'workspace_service_upsert' || toolName === 'workspace_service_open' || toolName === 'workspace_service_start' ||
    toolName === 'workspace_service_stop' || toolName === 'workspace_service_remove' ||
    toolName === 'browser_page_action' || toolName === 'browser_permission_set' ||
    toolName === 'browser_instance_close' || toolName === 'browser_page_close') {
    return readBoolean(args, 'confirm', false);
  }
  if (toolName === 'file_transfer_upload') {
    return readBoolean(args, 'overwrite', true);
  }
  if (toolName === 'workspace_git_branch' || toolName === 'workspace_git_stash') {
    const action = gitToolAction(toolName, args);
    return action !== 'list';
  }
  if (toolName === 'github_pr_create' || toolName === 'github_pr_merge') {
    return !readBoolean(args, 'dryRun', false);
  }
  if (toolName === 'github_pr_update' || toolName === 'github_pr_reviewers_update' ||
    toolName === 'github_pr_labels_update' || toolName === 'github_binding_set' ||
    toolName === 'github_auth_logout' || toolName === 'github_attachment_upload') {
    return readBoolean(args, 'confirm', false);
  }
  if (toolName === 'daemon_config_apply' || toolName === 'daemon_config_rollback') return true;
  if (toolName === 'relay_device_revoke' || toolName === 'relay_identity_rotate') {
    return readBoolean(args, 'confirm', false);
  }
  if (toolName === 'schedule_create' || toolName === 'schedule_update' || toolName === 'schedule_enable' ||
    toolName === 'schedule_disable' || toolName === 'schedule_run_now' || toolName === 'schedule_remove' ||
    toolName === 'loop_create' || toolName === 'loop_update' || toolName === 'loop_start' ||
    toolName === 'loop_resume' || toolName === 'loop_stop' || toolName === 'loop_takeover' || toolName === 'loop_remove' ||
    toolName === 'chat_room_create' || toolName === 'chat_room_update' || toolName === 'chat_room_archive' ||
    toolName === 'chat_room_member_add' || toolName === 'chat_room_member_update' || toolName === 'chat_room_member_remove') {
    return readBoolean(args, 'confirm', false);
  }
  return true;
}

function toolConfirmationFailure(toolName, args) {
  const gitPlanFailure = gitPlanConfirmationFailure(toolName, args);
  if (gitPlanFailure) {
    return gitPlanFailure;
  }
  if (protectedGitToolOperation(toolName, args).length > 0 && !readBoolean(args, 'confirm', false)) {
    return null;
  }
  if (!toolRequiresConfirmation(toolName, args) || readBoolean(args, 'confirm', false)) {
    return null;
  }
  return {
    ok: false,
    failureCategory: 'confirmation_required',
    toolName,
    riskLevel: 'high',
    message: 'This MCP tool can change or remove local or remote state and requires confirm=true.',
    remediation: 'Review the tool arguments, then call the tool again with confirm=true.'
  };
}

function mcpToolDefinitions() {
  return [
    toolDefinition('server_info_get', 'Read Bridge server identity, protocol version, and feature flags.', objectSchema({
      endpoint: stringProperty('Optional endpoint used for server info proof context.'),
      clientId: stringProperty('Optional client id used for server info proof context.'),
      appNonce: stringProperty('Optional app nonce used for server info proof context.')
    }, [])),
    toolDefinition('capabilities_get', 'Read Bridge capabilities including providers, features, request types, and binary frame support.', objectSchema({}, [])),
    toolDefinition('agent_list', 'List Bridge agents for the current daemon store.', objectSchema({
      workspaceId: stringProperty('Optional workspace id filter.'),
      cwd: stringProperty('Optional workspace path filter.')
    }, [])),
    toolDefinition('agent_status', 'Read a single Bridge agent status.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('agent_attach', 'Attach to a Bridge agent and read runtime status/tail when supported.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('agent_run', 'Create or run an agent turn through Bridge.', objectSchema({
      agentId: stringProperty('Optional existing agent id.'),
      providerId: stringProperty('Provider id.'),
      workspacePath: stringProperty('Workspace path.'),
      workspaceTitle: stringProperty('Workspace title.'),
      workspaceId: stringProperty('Workspace id.'),
      text: stringProperty('User prompt text.'),
      modelId: stringProperty('Model id.'),
      speedMode: stringProperty('Speed mode.'),
      reasoningMode: stringProperty('Reasoning mode.')
    }, ['providerId', 'workspacePath', 'text'])),
    toolDefinition('agent_send', 'Send a follow-up message to an existing Bridge agent.', objectSchema({
      agentId: stringProperty('Agent id.'),
      text: stringProperty('User prompt text.'),
      modelId: stringProperty('Model id.'),
      speedMode: stringProperty('Speed mode.'),
      reasoningMode: stringProperty('Reasoning mode.')
    }, ['agentId', 'text'])),
    toolDefinition('agent_stop', 'Stop or abort a running Bridge agent.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('agent_resume', 'Resume a stopped Bridge agent and fetch fresh timeline items.', objectSchema({
      agentId: stringProperty('Agent id.'),
      cursor: stringProperty('Optional timeline cursor.')
    }, ['agentId'])),
    toolDefinition('agent_update', 'Update Bridge agent metadata such as title.', objectSchema({
      agentId: stringProperty('Agent id.'),
      title: stringProperty('Agent title.'),
      workspaceTitle: stringProperty('Workspace title.'),
      archived: booleanProperty('Archived state when supported.')
    }, ['agentId'])),
    toolDefinition('agent_mode_set', 'Set Bridge agent speed/thinking mode.', objectSchema({
      agentId: stringProperty('Agent id.'),
      modeId: stringProperty('Mode id.'),
      speedMode: stringProperty('Speed mode alias.'),
      thinkingOptionId: stringProperty('Thinking option id.'),
      reasoningMode: stringProperty('Reasoning mode alias.')
    }, ['agentId'])),
    toolDefinition('agent_model_set', 'Set Bridge agent model.', objectSchema({
      agentId: stringProperty('Agent id.'),
      modelId: stringProperty('Model id.')
    }, ['agentId', 'modelId'])),
    toolDefinition('agent_archive', 'Archive an agent. Cascade is opt-in.', objectSchema({
      agentId: stringProperty('Agent id.'),
      cascade: booleanProperty('Archive child agents too.')
    }, ['agentId'])),
    toolDefinition('agent_attention_clear', 'Clear Bridge attention state for an agent.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('agent_fork', 'Fork an existing Bridge agent relationship.', objectSchema({
      agentId: stringProperty('Source agent id.'),
      title: stringProperty('Optional fork title.'),
      text: stringProperty('Optional first message for the fork.'),
      checkpointId: stringProperty('Optional source checkpoint id.'),
      boundaryMessageId: stringProperty('Optional durable completed assistant message id used as the fork boundary.'),
      timelineEpoch: numberProperty('Authoritative timeline epoch for the selected message.'),
      timelineSeq: numberProperty('Authoritative timeline sequence for the selected message.'),
      detach: booleanProperty('Create the fork as detached.'),
      workspaceMode: stringProperty('Workspace mode: shared or isolated.'),
      worktreePath: stringProperty('Optional absolute isolated worktree path.'),
      branch: stringProperty('Optional isolated worktree branch.'),
      startPoint: stringProperty('Optional isolated worktree start point.'),
      setupCommand: stringProperty('Optional setup command run after worktree creation.'),
      preview: booleanProperty('Preview a message or isolated fork without writing.'),
      confirm: booleanProperty('Confirm a message or isolated fork preview.'),
      forkPlanId: stringProperty('Fork plan id returned by preview.')
    }, ['agentId'])),
    toolDefinition('agent_detach', 'Detach an agent from its parent relationship.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('timeline_fetch', 'Fetch Bridge agent timeline items.', objectSchema({
      agentId: stringProperty('Agent id.'),
      cursor: stringProperty('Timeline cursor.'),
      direction: stringProperty('Direction such as before or after.'),
      limit: numberProperty('Maximum timeline items to return.')
    }, ['agentId'])),
    toolDefinition('timeline_ack', 'Acknowledge Bridge agent timeline sequence.', objectSchema({
      agentId: stringProperty('Agent id.'),
      latestSeq: numberProperty('Latest sequence number observed by the caller.')
    }, ['agentId', 'latestSeq'])),
    toolDefinition('checkpoint_list', 'List checkpoints for a Bridge agent.', objectSchema({
      agentId: stringProperty('Agent id.')
    }, ['agentId'])),
    toolDefinition('checkpoint_create', 'Create a Bridge agent checkpoint.', objectSchema({
      agentId: stringProperty('Agent id.'),
      title: stringProperty('Checkpoint title.'),
      description: stringProperty('Checkpoint description.'),
      includeFiles: booleanProperty('Capture eligible workspace files too.')
    }, ['agentId'])),
    toolDefinition('checkpoint_restore', 'Restore a Bridge agent checkpoint. File restore should be dry-run before confirm.', objectSchema({
      agentId: stringProperty('Agent id.'),
      checkpointId: stringProperty('Checkpoint id.'),
      restoreFiles: booleanProperty('Restore files from the checkpoint snapshot.'),
      dryRun: booleanProperty('Preview restore without writing files.'),
      confirm: booleanProperty('Confirm the restore operation.'),
      forceConflicts: booleanProperty('Force file restore when conflicts exist.'),
      restoreRuntime: booleanProperty('Restore Provider runtime when the checkpoint and adapter support it.'),
      requireRuntimeRestore: booleanProperty('Block before mutation when Provider runtime cannot be restored.'),
      restorePlanId: stringProperty('Restore plan id returned by dry-run.'),
      preRestoreSnapshotId: stringProperty('Restore from a pre-restore snapshot instead of a checkpoint.')
    }, ['agentId'])),
    toolDefinition('permission_list', 'List pending permission, question, and plan requests from Bridge agent timelines.', objectSchema({
      agentId: stringProperty('Optional agent id filter.'),
      includeResolved: booleanProperty('Include already resolved permission requests.'),
      includeArchived: booleanProperty('Include archived agents.'),
      limit: numberProperty('Maximum number of requests to return.')
    }, [])),
    toolDefinition('permission_respond', 'Respond to a pending Bridge permission, question, or plan request.', objectSchema({
      agentId: stringProperty('Agent id.'),
      providerId: stringProperty('Provider id.'),
      sessionId: stringProperty('Provider session id.'),
      requestId: stringProperty('Permission request id.'),
      permissionId: stringProperty('Permission id.'),
      reply: stringProperty('Provider-specific reply such as once, reject, accept, or message text.'),
      message: stringProperty('Optional response message.')
    }, ['requestId', 'reply'])),
    toolDefinition('notification_list', 'List Bridge local notifications.', objectSchema({
      includeRead: booleanProperty('Include already read notifications.'),
      limit: numberProperty('Maximum number of notifications to return.'),
      nowMs: numberProperty('Optional current time override for TTL pruning.')
    }, [])),
    toolDefinition('notification_read', 'Mark a Bridge notification as read or unread.', objectSchema({
      notificationId: stringProperty('Notification id.'),
      id: stringProperty('Notification id alias.'),
      read: booleanProperty('Mark read when true, unread when false.'),
      sessionId: stringProperty('Optional session id for emitted events.')
    }, [])),
    toolDefinition('notification_action', 'Record a Bridge notification action such as open.', objectSchema({
      notificationId: stringProperty('Notification id.'),
      id: stringProperty('Notification id alias.'),
      actionId: stringProperty('Action id, defaults to open.'),
      sessionId: stringProperty('Optional session id for emitted events.')
    }, [])),
    toolDefinition('notification_prune', 'Prune expired Bridge notifications.', objectSchema({
      includeRead: booleanProperty('Allow removing expired read notifications.'),
      nowMs: numberProperty('Optional current time override for TTL pruning.'),
      sessionId: stringProperty('Optional session id for emitted events.')
    }, [])),
    toolDefinition('terminal_list', 'List Bridge terminal sessions.', objectSchema({
      cwd: stringProperty('Optional workspace path filter.')
    }, [])),
    toolDefinition('terminal_create', 'Create a Bridge-managed terminal session.', objectSchema({
      cwd: stringProperty('Working directory.'),
      title: stringProperty('Terminal title.'),
      rows: numberProperty('Terminal rows.'),
      cols: numberProperty('Terminal columns.')
    }, ['cwd'])),
    toolDefinition('terminal_subscribe', 'Subscribe to a Bridge terminal and receive restore metadata when the Bridge connection supports events.', objectSchema({
      terminalId: stringProperty('Terminal id.'),
      id: stringProperty('Terminal id alias.')
    }, [])),
    toolDefinition('terminal_unsubscribe', 'Unsubscribe from a Bridge terminal.', objectSchema({
      terminalId: stringProperty('Terminal id.'),
      id: stringProperty('Terminal id alias.')
    }, [])),
    toolDefinition('terminal_capture', 'Read the current transcript/capture for a Bridge terminal.', objectSchema({
      terminalId: stringProperty('Terminal id.'),
      id: stringProperty('Terminal id alias.'),
      maxBytes: numberProperty('Maximum capture bytes to return.')
    }, [])),
    toolDefinition('terminal_rename', 'Rename a Bridge terminal session.', objectSchema({
      terminalId: stringProperty('Terminal id.'),
      id: stringProperty('Terminal id alias.'),
      title: stringProperty('New terminal title.')
    }, ['title'])),
    toolDefinition('terminal_kill', 'Kill a Bridge terminal session.', objectSchema({
      terminalId: stringProperty('Terminal id.'),
      id: stringProperty('Terminal id alias.')
    }, [])),
    toolDefinition('terminal_hook_status', 'Read Bridge terminal hook installation status.', objectSchema({
      shell: stringProperty('Optional shell id such as powershell, bash, or zsh.'),
      profilePath: stringProperty('Optional explicit shell profile path.')
    }, [])),
    toolDefinition('terminal_hook_install', 'Preview, install, or uninstall Bridge terminal hooks. Confirm is required before writing profile files.', objectSchema({
      shell: stringProperty('Optional shell id such as powershell, bash, or zsh.'),
      profilePath: stringProperty('Optional explicit shell profile path.'),
      mode: stringProperty('Operation mode such as preview, install, or uninstall.'),
      uninstall: booleanProperty('Uninstall the hook when true.'),
      confirm: booleanProperty('Actually write profile changes when true.')
    }, [])),
    toolDefinition('provider_catalog', 'Read the Bridge provider capability catalog.', objectSchema({
      refresh: booleanProperty('Request a refreshed catalog.')
    }, [])),
    toolDefinition('provider_catalog_refresh', 'Refresh the Bridge provider capability catalog and return per-provider discovery diagnostics.', objectSchema({
      reason: stringProperty('Optional refresh reason for diagnostics.'),
      providerId: stringProperty('Optional provider id to focus refresh diagnostics.')
    }, [])),
    toolDefinition('provider_profile_list', 'List custom Bridge provider profiles.', objectSchema({
      includeDisabled: booleanProperty('Include disabled provider profiles.')
    }, [])),
    toolDefinition('provider_profile_upsert', 'Create or update a custom Bridge provider profile.', objectSchema({
      profileId: stringProperty('Provider profile id.'),
      providerId: stringProperty('Runtime provider id.'),
      displayName: stringProperty('Provider display name.'),
      kind: stringProperty('Provider kind such as cli, opencode, or gateway.'),
      endpoint: stringProperty('Custom endpoint URL.'),
      binary: stringProperty('Provider binary path or command.'),
      args: arrayProperty('Provider command arguments.'),
      env: objectProperty('Provider environment variables.'),
      cwd: stringProperty('Provider working directory.'),
      runtimeMode: stringProperty('Runtime mode, such as oneshot or stdio.'),
      enabled: booleanProperty('Enable this profile for runtime registration.'),
      models: arrayProperty('Declared model capabilities.'),
      speedModes: arrayProperty('Declared speed mode capabilities.'),
      reasoningModes: arrayProperty('Declared reasoning mode capabilities.'),
      interactionModes: arrayProperty('Declared interaction mode capabilities.'),
      tools: arrayProperty('Declared tool or slash command capabilities.'),
      envMutations: arrayProperty('Environment mutations. Each entry must use keep, set, or remove; set values are stored by the Bridge secure credential adapter.')
    }, [])),
    toolDefinition('provider_profile_delete', 'Delete a custom Bridge provider profile and unregister its runtime provider.', objectSchema({
      profileId: stringProperty('Provider profile id.'),
      providerId: stringProperty('Runtime provider id.')
    }, [])),
    toolDefinition('provider_profile_test', 'Test a custom Bridge provider profile.', objectSchema({
      profileId: stringProperty('Provider profile id.'),
      providerId: stringProperty('Runtime provider id.'),
      timeoutMs: numberProperty('Startup or health-check timeout in milliseconds.')
    }, [])),
    toolDefinition('provider_acp_discover', 'Preview local ACP provider catalog entries without importing them.', objectSchema({
      path: stringProperty('Local ACP catalog file or directory path.'),
      catalogPath: stringProperty('Local ACP catalog file or directory path alias.')
    }, [])),
    toolDefinition('provider_acp_import', 'Import selected local ACP provider catalog entries. Confirm is required before writing profiles.', objectSchema({
      path: stringProperty('Local ACP catalog file or directory path.'),
      catalogPath: stringProperty('Local ACP catalog file or directory path alias.'),
      confirm: booleanProperty('Actually import profiles when true.'),
      selectedProfileIds: arrayProperty('Profile ids to import.'),
      duplicatePolicy: stringProperty('Duplicate policy: skip or replace.')
    }, [])),
    toolDefinition('provider_directory_list', 'List or search the currently verified remote provider directory.', objectSchema({
      query: stringProperty('Optional search text.'),
      providerId: stringProperty('Optional exact provider id.')
    }, [])),
    toolDefinition('provider_directory_refresh', 'Fetch and verify a signed remote provider directory over HTTPS.', objectSchema({
      url: stringProperty('HTTPS provider directory manifest URL.')
    }, ['url'])),
    toolDefinition('provider_directory_status', 'Read installed managed Provider version and health state.', objectSchema({
      providerId: stringProperty('Optional managed provider id.')
    }, [])),
    toolDefinition('provider_directory_install', 'Preview or confirm installation of one verified remote provider profile.', objectSchema({
      providerId: stringProperty('Remote provider id.'),
      planId: stringProperty('Install plan id returned by preview.'),
      confirm: booleanProperty('Install only when true and planId matches.')
    }, ['providerId'])),
    toolDefinition('provider_directory_remove', 'Preview or confirm removal of an installed remote provider profile.', objectSchema({
      profileId: stringProperty('Installed provider profile id.'),
      providerId: stringProperty('Managed provider id.'),
      planId: stringProperty('Remove plan id returned by preview.'),
      confirm: booleanProperty('Remove only when true.')
    }, ['profileId'])),
    toolDefinition('provider_directory_rollback', 'Preview or confirm rollback to the previous managed Provider version.', objectSchema({
      providerId: stringProperty('Managed provider id.'),
      planId: stringProperty('Rollback plan id returned by preview.'),
      confirm: booleanProperty('Rollback only when true.')
    }, ['providerId'])),
    toolDefinition('provider_usage_list', 'Read current Provider usage and quota windows without exposing credentials.', objectSchema({
      providerId: stringProperty('Provider id.'),
      sessionId: stringProperty('Optional session scope.'),
      agentId: stringProperty('Optional agent scope.'),
      window: stringProperty('Usage window: session, day, or month.')
    }, ['providerId'])),
    toolDefinition('workspace_registry_list', 'List registered projects and workspaces.', objectSchema({
      includeArchived: booleanProperty('Include archived workspaces.')
    }, [])),
    toolDefinition('workspace_registry_create', 'Preview or confirm creating a registered workspace.', objectSchema({
      cwd: stringProperty('Workspace directory path.'),
      workspacePath: stringProperty('Workspace directory path alias.'),
      displayName: stringProperty('Workspace display name.'),
      projectId: stringProperty('Project id.'),
      projectDisplayName: stringProperty('Project display name.'),
      kind: stringProperty('Workspace kind such as directory, git, or worktree.'),
      preview: booleanProperty('Preview without writing registry changes.'),
      confirm: booleanProperty('Actually write registry changes.')
    }, [])),
    toolDefinition('workspace_registry_import', 'Preview or confirm importing an existing directory into the workspace registry.', objectSchema({
      cwd: stringProperty('Workspace directory path.'),
      workspacePath: stringProperty('Workspace directory path alias.'),
      displayName: stringProperty('Workspace display name.'),
      projectId: stringProperty('Project id.'),
      projectDisplayName: stringProperty('Project display name.'),
      preview: booleanProperty('Preview without writing registry changes.'),
      confirm: booleanProperty('Actually write registry changes.')
    }, [])),
    toolDefinition('workspace_registry_upsert', 'Upsert a workspace registry record.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      cwd: stringProperty('Workspace directory path.'),
      workspacePath: stringProperty('Workspace directory path alias.'),
      displayName: stringProperty('Workspace display name.'),
      projectId: stringProperty('Project id.'),
      projectDisplayName: stringProperty('Project display name.'),
      kind: stringProperty('Workspace kind such as directory, git, or worktree.')
    }, [])),
    toolDefinition('workspace_registry_archive', 'Preview or confirm archiving a workspace registry record without deleting local files.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      cwd: stringProperty('Workspace directory path.'),
      workspacePath: stringProperty('Workspace directory path alias.'),
      preview: booleanProperty('Preview without archiving.'),
      confirm: booleanProperty('Actually archive the registry record.')
    }, [])),
    toolDefinition('workspace_registry_open', 'Preview or confirm opening a workspace directory with the local launcher.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      cwd: stringProperty('Workspace directory path.'),
      workspacePath: stringProperty('Workspace directory path alias.'),
      preview: booleanProperty('Preview without launching.'),
      confirm: booleanProperty('Actually launch the directory.')
    }, [])),
    toolDefinition('workspace_registry_suggestions', 'List suggested local workspace directories.', objectSchema({
      cwd: stringProperty('Optional starting directory.'),
      limit: numberProperty('Maximum number of suggestions to return.')
    }, [])),
    toolDefinition('workspace_registry_doctor', 'Run workspace registry consistency checks.', objectSchema({
      includeArchived: booleanProperty('Include archived workspaces in checks.')
    }, [])),
    toolDefinition('workspace_service_list', 'List Bridge-managed workspace services.', objectSchema({ workspaceId: stringProperty('Optional workspace id.'), ownerAgentId: stringProperty('Optional owner Agent id.') }, [])),
    toolDefinition('workspace_service_status', 'Read one workspace service status.', objectSchema({ serviceId: stringProperty('Service id.') }, ['serviceId'])),
    toolDefinition('workspace_service_health', 'Run the configured loopback health check for a workspace service.', objectSchema({ serviceId: stringProperty('Service id.') }, ['serviceId'])),
    toolDefinition('workspace_service_logs', 'Read a bounded tail of workspace service stdout/stderr.', objectSchema({ serviceId: stringProperty('Service id.'), maxBytes: numberProperty('Maximum log bytes.') }, ['serviceId'])),
    toolDefinition('workspace_service_open', 'Preview or confirm issuing a short-lived, single-use access URL for a running workspace service. The URL exchanges into a scoped HttpOnly browser session and never contains the Bridge bearer credential.', objectSchema({ serviceId: stringProperty('Service id.'), ownerAgentId: stringProperty('Required matching owner Agent id for owner-only services.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm issuing the one-time access URL.') }, ['serviceId'])),
    toolDefinition('workspace_service_upsert', 'Preview or confirm a workspace-scoped service definition. Commands run without a shell.', objectSchema({ serviceId: stringProperty('Optional service id.'), name: stringProperty('Display name.'), workspaceId: stringProperty('Workspace id.'), ownerAgentId: stringProperty('Optional owner Agent id.'), command: stringProperty('Executable name or absolute path.'), args: arrayProperty('Command arguments; do not include credentials.'), cwd: stringProperty('Working directory inside the workspace.'), port: numberProperty('Loopback port.'), protocol: stringProperty('http or https.'), health: objectProperty('TCP or HTTP health configuration.'), visibility: stringProperty('workspace or owner.'), auth: objectProperty('Bridge or environment-backed upstream auth.'), lifecycle: stringProperty('workspace or owner.'), environmentNames: arrayProperty('Environment variable names to pass through.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm persisting the definition.') }, ['workspaceId', 'command', 'port'])),
    toolDefinition('workspace_service_start', 'Preview or confirm starting a workspace service process.', objectSchema({ serviceId: stringProperty('Service id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm process start.') }, ['serviceId'])),
    toolDefinition('workspace_service_stop', 'Preview or confirm stopping a workspace service process.', objectSchema({ serviceId: stringProperty('Service id.'), reason: stringProperty('Optional stop reason.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm process stop.') }, ['serviceId'])),
    toolDefinition('workspace_service_remove', 'Preview or confirm stopping and removing a workspace service definition.', objectSchema({ serviceId: stringProperty('Service id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm removal.') }, ['serviceId'])),
    toolDefinition('browser_host_list', 'List connected browser automation hosts and their explicitly advertised commands.', objectSchema({ workspaceId: stringProperty('Optional workspace scope.') }, [])),
    toolDefinition('browser_instance_list', 'List browser instances through a compatible host.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional explicit browser host id.') }, ['workspaceId'])),
    toolDefinition('browser_instance_create', 'Create a browser instance through a compatible host.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional explicit browser host id.'), profile: stringProperty('Optional isolated browser profile name.') }, ['workspaceId'])),
    toolDefinition('browser_instance_close', 'Close and clean up a browser instance.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), instanceId: stringProperty('Browser instance id.'), confirm: booleanProperty('Confirm closing the instance.') }, ['workspaceId', 'instanceId'])),
    toolDefinition('browser_page_list', 'List browser pages for a workspace-scoped browser instance.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), instanceId: stringProperty('Optional browser instance id.') }, ['workspaceId'])),
    toolDefinition('browser_page_create', 'Create a browser page. URL navigation is restricted by the workspace domain allowlist.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), instanceId: stringProperty('Optional browser instance id.'), url: stringProperty('Optional credential-free HTTP(S) URL.') }, ['workspaceId'])),
    toolDefinition('browser_page_close', 'Close and clean up a browser page.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), confirm: booleanProperty('Confirm closing the page.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_navigate', 'Navigate, reload, go back, or go forward in a browser page.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), operation: stringProperty('navigate, back, forward, or reload.'), url: stringProperty('HTTP(S) URL for navigate.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_snapshot', 'Read a bounded accessibility snapshot with page-scoped element refs.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_screenshot', 'Capture a bounded PNG screenshot from a browser page.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), fullPage: booleanProperty('Capture the full page when supported.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_logs', 'Read bounded browser console and network timing entries.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), maxEntries: numberProperty('Maximum entries.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_wait', 'Wait for page text or a URL fragment.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), text: stringProperty('Optional text condition.'), url: stringProperty('Optional URL fragment condition.'), timeoutMs: numberProperty('Bounded timeout.') }, ['workspaceId', 'pageId'])),
    toolDefinition('browser_page_action', 'Preview or confirm a browser input or page action. Upload paths must remain inside the active workspace.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), pageId: stringProperty('Browser page id.'), action: stringProperty('click, fill, type, keypress, hover, select, drag, upload, scroll, download, or evaluate.'), ref: stringProperty('Page-scoped element ref.'), sourceRef: stringProperty('Drag source ref.'), targetRef: stringProperty('Drag target ref.'), targetX: numberProperty('Drag target X coordinate.'), targetY: numberProperty('Drag target Y coordinate.'), steps: numberProperty('Bounded drag interpolation steps.'), value: stringProperty('Input/select value.'), text: stringProperty('Text input.'), key: stringProperty('Key name.'), function: stringProperty('Bounded JavaScript function for evaluate.'), filePaths: arrayProperty('Absolute workspace file paths for upload.'), deltaX: numberProperty('Horizontal scroll delta.'), deltaY: numberProperty('Vertical scroll delta.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm sensitive page input.') }, ['workspaceId', 'pageId', 'action'])),
    toolDefinition('browser_download_list', 'List bounded downloads associated with a workspace browser host.', objectSchema({ workspaceId: stringProperty('Workspace id.'), agentId: stringProperty('Optional Agent owner.'), hostId: stringProperty('Optional browser host id.'), instanceId: stringProperty('Optional browser instance id.'), pageId: stringProperty('Optional page id.') }, ['workspaceId'])),
    toolDefinition('browser_permission_get', 'Read workspace browser domain and download restrictions.', objectSchema({ workspaceId: stringProperty('Workspace id.') }, ['workspaceId'])),
    toolDefinition('browser_permission_set', 'Preview or confirm the workspace browser domain allowlist.', objectSchema({ workspaceId: stringProperty('Workspace id.'), domains: arrayProperty('Exact domains or leading-wildcard subdomain rules.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm the permission update.') }, ['workspaceId'])),
    toolDefinition('project_registry_list', 'List project registry records through Bridge. This is a read-only compatibility view over workspace projects.', objectSchema({
      includeArchived: booleanProperty('Include archived projects when supported.')
    }, [])),
    toolDefinition('workspace_changes_get', 'Read workspace change summary from Bridge.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_diff_get', 'Read workspace diff from Bridge.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      filePath: stringProperty('Optional file path filter.'),
      path: stringProperty('Optional file path alias.'),
      mode: stringProperty('Diff mode such as unified, stat, or files.')
    }, [])),
    toolDefinition('workspace_files_list', 'List workspace files through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      query: stringProperty('Optional search query.'),
      limit: numberProperty('Maximum number of files to return.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_file_get', 'Read a workspace file preview through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      filePath: stringProperty('File path.'),
      path: stringProperty('File path alias.'),
      maxBytes: numberProperty('Maximum preview bytes.'),
      sessionId: stringProperty('Optional session id for preview update events.')
    }, [])),
    toolDefinition('workspace_file_download', 'Prepare a workspace file download through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      filePath: stringProperty('File path.'),
      path: stringProperty('File path alias.'),
      sessionId: stringProperty('Optional session id for download ready events.')
    }, [])),
    toolDefinition('attachment_file_download', 'Prepare an attachment file download through Bridge.', objectSchema({
      attachmentId: stringProperty('Attachment id.'),
      fileId: stringProperty('File id alias.'),
      agentId: stringProperty('Optional agent id.'),
      sessionId: stringProperty('Optional session id for download ready events.')
    }, [])),
    toolDefinition('file_transfer_download', 'Initiate a Bridge binary file download. File bytes are delivered by Bridge binary frames, not through MCP tool content.', objectSchema({
      requestId: stringProperty('Transfer request id.'),
      sessionId: stringProperty('Optional session id for transfer events.'),
      workspaceId: stringProperty('Workspace id.'),
      path: stringProperty('Workspace-relative file path.'),
      relativePath: stringProperty('Workspace-relative file path alias.'),
      parentPath: stringProperty('Optional parent path for App-side save hints.')
    }, ['requestId'])),
    toolDefinition('file_transfer_upload', 'Prepare a Bridge binary file upload. File chunks must be sent by Bridge binary frames after this tool returns ready.', objectSchema({
      requestId: stringProperty('Transfer request id.'),
      workspaceId: stringProperty('Workspace id.'),
      path: stringProperty('Workspace-relative target path.'),
      relativePath: stringProperty('Workspace-relative target path alias.'),
      sizeBytes: numberProperty('Expected upload size in bytes.'),
      size: numberProperty('Expected upload size alias.'),
      sha256: stringProperty('Expected upload sha256 checksum.'),
      overwrite: booleanProperty('Allow replacing an existing file.')
    }, ['requestId'])),
    toolDefinition('file_transfer_cancel', 'Cancel a prepared or active Bridge binary file transfer.', objectSchema({
      requestId: stringProperty('Transfer request id.'),
      message: stringProperty('Optional cancel reason.')
    }, ['requestId'])),
    toolDefinition('workspace_git_stage', 'Stage workspace files with Git.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      files: arrayProperty('File paths to stage.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_unstage', 'Unstage workspace files with Git.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      files: arrayProperty('File paths to unstage.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_discard', 'Preview or confirm discarding workspace file changes with Git.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      files: arrayProperty('File paths to discard.'),
      paths: arrayProperty('File paths to discard alias.'),
      planId: stringProperty('Git operation plan id returned by preview.'),
      confirm: booleanProperty('Confirm discard only when planId matches the current repository state.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_commit', 'Commit staged workspace changes with Git.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      message: stringProperty('Commit message.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, ['message'])),
    toolDefinition('workspace_git_pull', 'Preview or confirm Git pull for a workspace.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      remote: stringProperty('Remote name.'),
      remoteName: stringProperty('Remote name.'),
      branch: stringProperty('Branch name.'),
      branchName: stringProperty('Branch name.'),
      ffOnly: booleanProperty('Require fast-forward only.'),
      planId: stringProperty('Git operation plan id returned by preview.'),
      confirm: booleanProperty('Confirm pull only when planId matches the current repository state.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_push', 'Run Git push for a workspace. Force push uses preview and plan confirmation.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      remote: stringProperty('Remote name.'),
      remoteName: stringProperty('Remote name.'),
      branch: stringProperty('Branch name.'),
      branchName: stringProperty('Branch name.'),
      force: booleanProperty('Force push when true.'),
      planId: stringProperty('Git operation plan id returned by force-push preview.'),
      confirm: booleanProperty('Confirm the operation. Force push also requires planId.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_branch', 'Create, switch, list, or preview/confirm deletion of Git branches for a workspace.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      action: stringProperty('Branch action: list, create, checkout, switch, or delete.'),
      name: stringProperty('Branch name.'),
      branchName: stringProperty('Branch name.'),
      startPoint: stringProperty('Optional start point.'),
      force: booleanProperty('Use force deletion when action is delete.'),
      checkout: booleanProperty('Switch to the branch after create.'),
      list: booleanProperty('List branches.'),
      planId: stringProperty('Git operation plan id returned by delete preview.'),
      confirm: booleanProperty('Confirm mutation. Branch deletion also requires planId.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_stash', 'Run Git stash for a workspace. Pop and drop use preview and plan confirmation.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      action: stringProperty('Stash action: list, push, apply, pop, or drop.'),
      message: stringProperty('Stash message.'),
      ref: stringProperty('Optional stash ref such as stash@{0}.'),
      includeUntracked: booleanProperty('Include untracked files.'),
      pop: booleanProperty('Pop the latest stash.'),
      list: booleanProperty('List stashes.'),
      planId: stringProperty('Git operation plan id returned by pop/drop preview.'),
      confirm: booleanProperty('Confirm mutation. Pop and drop also require planId.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_merge', 'Preview or confirm Git merge for a workspace.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      ref: stringProperty('Ref or branch to merge.'),
      branch: stringProperty('Branch name alias.'),
      branchName: stringProperty('Branch name alias.'),
      noCommit: booleanProperty('Pass --no-commit.'),
      ffOnly: booleanProperty('Require fast-forward only.'),
      planId: stringProperty('Git operation plan id returned by preview.'),
      confirm: booleanProperty('Confirm merge only when planId matches the current repository state.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('workspace_git_subscribe', 'Manage workspace diff subscription updates.', objectSchema({
      cwd: stringProperty('Workspace path.'),
      workspacePath: stringProperty('Workspace path alias.'),
      subscriptionId: stringProperty('Subscription id.'),
      action: stringProperty('Subscription action such as subscribe, pause, resume, unsubscribe, or status.'),
      intervalMs: numberProperty('Polling interval in milliseconds.'),
      sessionId: stringProperty('Optional session id for update events.')
    }, [])),
    toolDefinition('worktree_list', 'List Git worktrees for a workspace/repository.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      workspacePath: stringProperty('Workspace path.')
    }, [])),
    toolDefinition('worktree_create', 'Preview or confirm creating a Git worktree.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      workspacePath: stringProperty('Source repository path.'),
      worktreePath: stringProperty('New worktree path.'),
      branch: stringProperty('Branch name.'),
      startPoint: stringProperty('Optional start point.'),
      preview: booleanProperty('Preview only.'),
      confirm: booleanProperty('Actually create the worktree.')
    }, ['workspacePath', 'worktreePath'])),
    toolDefinition('worktree_archive', 'Archive a Git-registered worktree.', objectSchema({
      workspaceId: stringProperty('Workspace id.'),
      workspacePath: stringProperty('Source repository path.'),
      worktreePath: stringProperty('Worktree path.'),
      force: booleanProperty('Pass force to git worktree remove.'),
      confirm: booleanProperty('Actually archive/remove the registered worktree.')
    }, ['workspacePath', 'worktreePath'])),
    toolDefinition('github_pr_create', 'Create a GitHub pull request through Bridge. Dry-run is supported by the Bridge GitHub handler.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      head: stringProperty('PR head branch.'),
      base: stringProperty('PR base branch.'),
      title: stringProperty('PR title.'),
      body: stringProperty('PR body.'),
      draft: booleanProperty('Create a draft PR.'),
      dryRun: booleanProperty('Preview request payload without calling GitHub.')
    }, ['head', 'base', 'title'])),
    toolDefinition('github_auth_device_start', 'Start GitHub OAuth Device Flow.', objectSchema({ clientId: stringProperty('Optional OAuth client id override.') }, [])),
    toolDefinition('github_auth_device_poll', 'Poll a GitHub OAuth Device Flow session.', objectSchema({ authSessionId: stringProperty('Authorization session id.') }, ['authSessionId'])),
    toolDefinition('github_auth_status', 'Read GitHub authentication status without exposing credentials.', objectSchema({ accountId: stringProperty('Optional account id.') }, [])),
    toolDefinition('github_auth_logout', 'Remove a securely stored GitHub account credential.', objectSchema({ accountId: stringProperty('Account id.'), confirm: booleanProperty('Confirm logout.') }, ['accountId'])),
    toolDefinition('github_account_list', 'List GitHub account metadata.', objectSchema({}, [])),
    toolDefinition('github_binding_get', 'Read the GitHub repository binding for a host/workspace.', objectSchema({ hostProfileId: stringProperty('Host profile id.'), workspaceId: stringProperty('Workspace id.') }, ['hostProfileId', 'workspaceId'])),
    toolDefinition('github_binding_set', 'Confirm a GitHub account/repository binding.', objectSchema({ hostProfileId: stringProperty('Host profile id.'), workspaceId: stringProperty('Workspace id.'), accountId: stringProperty('GitHub account id.'), owner: stringProperty('Repository owner.'), repo: stringProperty('Repository name.'), confirm: booleanProperty('Confirm binding.') }, ['hostProfileId', 'workspaceId', 'accountId', 'owner', 'repo'])),
    toolDefinition('github_pr_list', 'List GitHub pull requests with pagination.', objectSchema({ workspacePath: stringProperty('Workspace path.'), owner: stringProperty('Owner.'), repo: stringProperty('Repository.'), state: stringProperty('PR state.'), page: numberProperty('Page.'), perPage: numberProperty('Page size.') }, [])),
    toolDefinition('github_pr_update', 'Preview or confirm updating a pull request.', objectSchema({ workspacePath: stringProperty('Workspace path.'), number: numberProperty('PR number.'), title: stringProperty('Title.'), body: stringProperty('Body.'), state: stringProperty('State.'), ready: booleanProperty('Mark ready for review.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['number'])),
    toolDefinition('github_pr_reviewers_update', 'Preview or confirm requested reviewers.', objectSchema({ workspacePath: stringProperty('Workspace path.'), number: numberProperty('PR number.'), reviewers: arrayProperty('Reviewer logins.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['number'])),
    toolDefinition('github_pr_labels_update', 'Preview or confirm PR labels.', objectSchema({ workspacePath: stringProperty('Workspace path.'), number: numberProperty('PR number.'), labels: arrayProperty('Labels.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['number'])),
    toolDefinition('github_watch_start', 'Start a controlled GitHub PR watch.', objectSchema({ workspacePath: stringProperty('Workspace path.'), workspaceId: stringProperty('Workspace id.'), number: numberProperty('PR number.'), subscriberId: stringProperty('Subscriber id.'), intervalMs: numberProperty('Polling interval.') }, ['subscriberId'])),
    toolDefinition('github_watch_stop', 'Stop a controlled GitHub PR watch.', objectSchema({ watchId: stringProperty('Watch id.') }, ['watchId'])),
    toolDefinition('github_attachment_preview', 'Preview uploading a workspace attachment.', objectSchema({ workspacePath: stringProperty('Workspace path.'), filePath: stringProperty('File path.'), number: numberProperty('Issue or PR number.') }, ['workspacePath', 'filePath', 'number'])),
    toolDefinition('github_attachment_upload', 'Confirm an attachment upload plan.', objectSchema({ planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm upload.') }, ['planId'])),
    toolDefinition('github_pr_status', 'Read GitHub pull request status through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      number: numberProperty('Pull request number.'),
      pullNumber: numberProperty('Pull request number alias.')
    }, [])),
    toolDefinition('github_pr_merge', 'Merge a GitHub pull request through Bridge. Confirm is required before merging.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      number: numberProperty('Pull request number.'),
      pullNumber: numberProperty('Pull request number alias.'),
      mergeMethod: stringProperty('Merge method: merge, squash, or rebase.'),
      commitTitle: stringProperty('Optional merge commit title.'),
      commitMessage: stringProperty('Optional merge commit message.'),
      confirm: booleanProperty('Actually merge the PR when true.'),
      dryRun: booleanProperty('Preview request payload without calling GitHub.')
    }, [])),
    toolDefinition('github_checks_list', 'List GitHub checks/status summary through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      sha: stringProperty('Commit SHA. Defaults to the latest workspace commit when Bridge can infer it.')
    }, [])),
    toolDefinition('github_issue_search', 'Search GitHub issues in a repository through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      keyword: stringProperty('Keyword query.'),
      state: stringProperty('Issue state such as open, closed, or all.'),
      labels: arrayProperty('Issue labels to filter by.')
    }, [])),
    toolDefinition('github_issue_attachment_list', 'List recognizable attachment links from a GitHub issue body/comments through Bridge.', objectSchema({
      cwd: stringProperty('Workspace path used for repository remote inference.'),
      workspacePath: stringProperty('Workspace path alias.'),
      workspaceId: stringProperty('Workspace id.'),
      owner: stringProperty('Repository owner.'),
      repo: stringProperty('Repository name.'),
      apiBaseUrl: stringProperty('GitHub API base URL for Enterprise or mock servers.'),
      tokenEnv: stringProperty('Environment variable name that contains the GitHub token.'),
      number: numberProperty('Issue number.'),
      issueNumber: numberProperty('Issue number alias.')
    }, [])),
    toolDefinition('relay_status', 'Read Relay transport, E2E session, pairing, queue, and identity status without exposing secrets.', objectSchema({}, [])),
    toolDefinition('voice_status', 'Read configured Voice capabilities and active session limits without exposing credentials.', objectSchema({}, [])),
    toolDefinition('voice_session_start', 'Start a short-lived Voice speech recognition session. Confirmation is required before microphone audio is accepted.', objectSchema({ mimeType: stringProperty('Audio MIME type.'), language: stringProperty('Recognition language.'), sampleRate: numberProperty('Audio sample rate.'), channels: numberProperty('Audio channels.'), confirm: booleanProperty('Confirm starting Voice capture.') }, [])),
    toolDefinition('voice_session_chunk', 'Append one base64 audio chunk to an active Voice session.', objectSchema({ sessionId: stringProperty('Voice session id.'), sequence: numberProperty('Chunk sequence.'), audioBase64: stringProperty('Base64 audio bytes.'), confirm: booleanProperty('Confirm sending audio to the configured Provider.') }, ['sessionId', 'audioBase64'])),
    toolDefinition('voice_session_finish', 'Finish Voice capture and request a final transcript.', objectSchema({ sessionId: stringProperty('Voice session id.'), language: stringProperty('Optional recognition language.'), confirm: booleanProperty('Confirm sending the captured audio for transcription.') }, ['sessionId'])),
    toolDefinition('voice_session_cancel', 'Cancel an active Voice capture and erase buffered audio.', objectSchema({ sessionId: stringProperty('Voice session id.'), confirm: booleanProperty('Confirm cancelling and erasing the Voice session.') }, ['sessionId'])),
    toolDefinition('voice_tts_speak', 'Synthesize speech through the configured Voice Provider. Confirmation is required before external text is sent.', objectSchema({ text: stringProperty('Text to synthesize.'), language: stringProperty('Speech language.'), voiceId: stringProperty('Provider voice id.'), format: stringProperty('Requested audio MIME type.'), confirm: booleanProperty('Confirm sending text to the speech Provider.') }, ['text'])),
    toolDefinition('voice_tts_stop', 'Stop an active text-to-speech request and discard its result.', objectSchema({ requestId: stringProperty('TTS request id.'), confirm: booleanProperty('Confirm stopping the request.') }, ['requestId'])),
    toolDefinition('relay_pairing_start', 'Create a short-lived Relay pairing offer and connect the Bridge outbound. The offer contains sensitive pairing material and requires confirmation.', objectSchema({
      relayUrl: stringProperty('HTTPS or WSS Relay endpoint.'),
      ttlMs: numberProperty('Pairing offer lifetime in milliseconds.'),
      confirm: booleanProperty('Explicitly confirm creating a sensitive pairing offer and contacting the Relay.')
    }, ['relayUrl'])),
    toolDefinition('relay_pairing_cancel', 'Cancel an outstanding Relay pairing offer and erase its in-memory secret.', objectSchema({
      offerId: stringProperty('Optional offer id; defaults to the active offer.'),
      confirm: booleanProperty('Explicitly confirm invalidating the pairing offer.')
    }, [])),
    toolDefinition('relay_connect', 'Connect the Bridge outbound to its configured Relay without restoring old E2E session keys.', objectSchema({
      relayUrl: stringProperty('HTTPS or WSS Relay endpoint.'),
      relayId: stringProperty('Relay rendezvous id.'),
      confirm: booleanProperty('Explicitly confirm the outbound network connection.')
    }, [])),
    toolDefinition('relay_disconnect', 'Disconnect the Bridge from Relay and clear active E2E sessions.', objectSchema({
      confirm: booleanProperty('Explicitly confirm disconnecting Relay sessions.')
    }, [])),
    toolDefinition('relay_device_list', 'List paired Relay devices and revocation metadata without public keys or secrets.', objectSchema({
      includeRevoked: booleanProperty('Include revoked device records.')
    }, [])),
    toolDefinition('relay_device_revoke', 'Preview or confirm revocation of a paired Relay device. Confirmation closes its active sessions.', objectSchema({
      deviceId: stringProperty('Paired Relay device id.'),
      reason: stringProperty('Controlled human-readable revocation reason.'),
      planId: stringProperty('Plan id returned by the preview.'),
      confirm: booleanProperty('Explicitly confirm device revocation.')
    }, ['deviceId'])),
    toolDefinition('relay_identity_rotate', 'Preview or confirm rotation of the Bridge Relay identity. Confirmation invalidates existing pairings and sessions.', objectSchema({
      planId: stringProperty('Plan id returned by the preview.'),
      confirm: booleanProperty('Explicitly confirm Relay identity rotation.')
    }, [])),
    toolDefinition('schedule_status', 'Read the persistent schedule runner and lease status.', objectSchema({}, [])),
    toolDefinition('schedule_list', 'List persistent schedules.', objectSchema({ query: stringProperty('Optional search text.'), enabled: booleanProperty('Optional enabled filter.') }, [])),
    toolDefinition('schedule_get', 'Read one schedule.', objectSchema({ scheduleId: stringProperty('Schedule id.') }, ['scheduleId'])),
    toolDefinition('schedule_history', 'Read paginated schedule run history.', objectSchema({ scheduleId: stringProperty('Optional schedule id.'), limit: numberProperty('Maximum runs.'), before: stringProperty('Created-at cursor.') }, [])),
    toolDefinition('schedule_create', 'Preview or confirm a persistent cron schedule that runs through Agent Manager.', objectSchema({
      name: stringProperty('Schedule name.'), prompt: stringProperty('Agent prompt.'), workspaceId: stringProperty('Workspace id.'), workspacePath: stringProperty('Workspace path.'),
      providerId: stringProperty('Provider id.'), modelId: stringProperty('Optional model id.'), cadence: objectProperty('Cron cadence with expression and IANA timezone.'),
      concurrency: objectProperty('Concurrency limit and overlap policy.'), retry: objectProperty('Retry attempts and backoff.'), retention: objectProperty('Run retention limits.'),
      missedRunPolicy: stringProperty('skip, run_once, or catch_up.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm creation.')
    }, [])),
    toolDefinition('schedule_update', 'Preview or confirm updating a schedule.', objectSchema({ scheduleId: stringProperty('Schedule id.'), name: stringProperty('Optional name.'), prompt: stringProperty('Optional prompt.'), cadence: objectProperty('Optional cron cadence.'), concurrency: objectProperty('Optional concurrency.'), retry: objectProperty('Optional retry.'), retention: objectProperty('Optional retention.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['scheduleId'])),
    toolDefinition('schedule_enable', 'Preview or confirm enabling a schedule.', objectSchema({ scheduleId: stringProperty('Schedule id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm enable.') }, ['scheduleId'])),
    toolDefinition('schedule_disable', 'Preview or confirm disabling a schedule.', objectSchema({ scheduleId: stringProperty('Schedule id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm disable.') }, ['scheduleId'])),
    toolDefinition('schedule_run_now', 'Preview or confirm an immediate schedule run.', objectSchema({ scheduleId: stringProperty('Schedule id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm run-now.') }, ['scheduleId'])),
    toolDefinition('schedule_remove', 'Preview or confirm removing a schedule definition.', objectSchema({ scheduleId: stringProperty('Schedule id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm removal.') }, ['scheduleId'])),
    toolDefinition('loop_status', 'Read autonomous Loop runtime status.', objectSchema({}, [])),
    toolDefinition('loop_list', 'List Loops.', objectSchema({ query: stringProperty('Optional search text.'), status: stringProperty('Optional status filter.') }, [])),
    toolDefinition('loop_get', 'Read one Loop with rounds and logs.', objectSchema({ loopId: stringProperty('Loop id.') }, ['loopId'])),
    toolDefinition('loop_rounds', 'Read paginated Loop rounds.', objectSchema({ loopId: stringProperty('Loop id.'), offset: numberProperty('Round offset.'), limit: numberProperty('Maximum rounds.') }, ['loopId'])),
    toolDefinition('loop_create', 'Preview or confirm a worker/verifier Loop definition.', objectSchema({
      name: stringProperty('Loop name.'), prompt: stringProperty('Worker prompt.'), verifyPrompt: stringProperty('Verifier prompt.'), acceptanceCriteria: arrayProperty('Structured acceptance criteria.'),
      workspaceId: stringProperty('Workspace id.'), workspacePath: stringProperty('Workspace path.'), sourceAgentId: stringProperty('Optional parent Agent id.'),
      workerProviderId: stringProperty('Worker provider.'), workerModelId: stringProperty('Worker model.'), verifierProviderId: stringProperty('Verifier provider.'), verifierModelId: stringProperty('Verifier model.'),
      workspaceMode: stringProperty('shared or isolated.'), maxRounds: numberProperty('Maximum rounds.'), budget: objectProperty('Token, cost, currency, and duration limits.'),
      planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm creation.')
    }, [])),
    toolDefinition('loop_update', 'Preview or confirm editing a non-running Loop.', objectSchema({ loopId: stringProperty('Loop id.'), name: stringProperty('Optional name.'), prompt: stringProperty('Optional prompt.'), verifyPrompt: stringProperty('Optional verifier prompt.'), acceptanceCriteria: arrayProperty('Optional criteria.'), maxRounds: numberProperty('Optional maximum rounds.'), budget: objectProperty('Optional budget.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['loopId'])),
    toolDefinition('loop_start', 'Preview or confirm starting a Loop.', objectSchema({ loopId: stringProperty('Loop id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm start.') }, ['loopId'])),
    toolDefinition('loop_pause', 'Pause a running Loop and cancel its active automation turn.', objectSchema({ loopId: stringProperty('Loop id.'), confirm: booleanProperty('Confirm pause.') }, ['loopId'])),
    toolDefinition('loop_resume', 'Preview or confirm resuming a paused Loop.', objectSchema({ loopId: stringProperty('Loop id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm resume.') }, ['loopId'])),
    toolDefinition('loop_stop', 'Preview or confirm stopping a Loop.', objectSchema({ loopId: stringProperty('Loop id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm stop.') }, ['loopId'])),
    toolDefinition('loop_takeover', 'Preview or confirm handing the current Loop Agent to a human.', objectSchema({ loopId: stringProperty('Loop id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm takeover.') }, ['loopId'])),
    toolDefinition('loop_remove', 'Preview or confirm removing an inactive Loop.', objectSchema({ loopId: stringProperty('Loop id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm removal.') }, ['loopId'])),
    toolDefinition('chat_room_status', 'Read Chat Room service status.', objectSchema({}, [])),
    toolDefinition('chat_room_list', 'List Chat Rooms visible to the authenticated Bridge client.', objectSchema({ query: stringProperty('Optional search text.'), includeArchived: booleanProperty('Include archived rooms.') }, [])),
    toolDefinition('chat_room_get', 'Read one Chat Room and its members.', objectSchema({ roomId: stringProperty('Room id.') }, ['roomId'])),
    toolDefinition('chat_room_create', 'Preview or confirm creating a Chat Room.', objectSchema({ name: stringProperty('Room name.'), purpose: stringProperty('Room purpose.'), workspaceId: stringProperty('Optional workspace id.'), retentionMaxMessages: numberProperty('Message retention count.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm creation.') }, [])),
    toolDefinition('chat_room_update', 'Preview or confirm updating a Chat Room.', objectSchema({ roomId: stringProperty('Room id.'), name: stringProperty('Optional name.'), purpose: stringProperty('Optional purpose.'), retentionMaxMessages: numberProperty('Optional retention count.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['roomId'])),
    toolDefinition('chat_room_archive', 'Preview or confirm archiving a Chat Room.', objectSchema({ roomId: stringProperty('Room id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm archive.') }, ['roomId'])),
    toolDefinition('chat_room_member_add', 'Preview or confirm adding a human or Agent member.', objectSchema({ roomId: stringProperty('Room id.'), member: objectProperty('Member id, type, Agent id, display name, and role.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm addition.') }, ['roomId'])),
    toolDefinition('chat_room_member_update', 'Preview or confirm changing a member role or name.', objectSchema({ roomId: stringProperty('Room id.'), memberId: stringProperty('Member id.'), role: stringProperty('New role.'), displayName: stringProperty('New display name.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm update.') }, ['roomId', 'memberId'])),
    toolDefinition('chat_room_member_remove', 'Preview or confirm removing a room member.', objectSchema({ roomId: stringProperty('Room id.'), memberId: stringProperty('Member id.'), planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm removal.') }, ['roomId', 'memberId'])),
    toolDefinition('chat_room_message_post', 'Post an idempotent room message and explicitly fan out Agent mentions.', objectSchema({ roomId: stringProperty('Room id.'), clientMessageId: stringProperty('Stable idempotency id.'), body: stringProperty('Message body.'), replyToMessageId: stringProperty('Optional reply target.'), mentionMemberIds: arrayProperty('Explicit Agent member mentions.'), confirm: booleanProperty('Confirm sending this open-world message.') }, ['roomId', 'clientMessageId', 'body'])),
    toolDefinition('chat_room_message_list', 'Read paginated Chat Room messages.', objectSchema({ roomId: stringProperty('Room id.'), afterSeq: numberProperty('Read messages after this sequence.'), beforeSeq: numberProperty('Read messages before this sequence.'), limit: numberProperty('Maximum messages.') }, ['roomId'])),
    toolDefinition('chat_room_ack', 'Acknowledge messages through a monotonic room sequence.', objectSchema({ roomId: stringProperty('Room id.'), lastSeq: numberProperty('Last read sequence.') }, ['roomId'])),
    toolDefinition('daemon_status', 'Read Bridge daemon status and local diagnostic summary.', objectSchema({
      includeChecks: booleanProperty('Include daemon health checks when supported.')
    }, [])),
    toolDefinition('usage_summary_get', 'Read actual and estimated usage summary.', objectSchema({ sessionId: stringProperty('Session id.'), agentId: stringProperty('Agent id.') }, [])),
    toolDefinition('usage_events_list', 'List normalized usage and compaction events.', objectSchema({ sessionId: stringProperty('Session id.'), limit: numberProperty('Maximum events.') }, [])),
    toolDefinition('usage_budget_get', 'Read a usage budget.', objectSchema({ sessionId: stringProperty('Session id.'), agentId: stringProperty('Agent id.') }, [])),
    toolDefinition('usage_budget_set', 'Set a warning-only usage budget.', objectSchema({ sessionId: stringProperty('Session id.'), agentId: stringProperty('Agent id.'), tokenLimit: numberProperty('Token limit.'), costLimit: numberProperty('Cost limit.'), currency: stringProperty('Currency.'), window: stringProperty('Budget window.') }, [])),
    toolDefinition('message_queue_list', 'List persistent queued messages.', objectSchema({ sessionId: stringProperty('Session id.') }, [])),
    toolDefinition('message_queue_cancel', 'Cancel a queued message.', objectSchema({ sessionId: stringProperty('Session id.'), queueId: stringProperty('Queue id.') }, ['queueId'])),
    toolDefinition('message_queue_retry', 'Retry a failed queued message.', objectSchema({ sessionId: stringProperty('Session id.'), queueId: stringProperty('Queue id.') }, ['queueId'])),
    toolDefinition('metadata_generate', 'Generate preview metadata for title, branch, commit, or PR.', objectSchema({ sessionId: stringProperty('Session id.'), agentId: stringProperty('Agent id.'), kind: stringProperty('Metadata kind.'), prompt: stringProperty('Scoped prompt.'), diffSummary: stringProperty('Git diff summary.'), timeoutMs: numberProperty('Optional Provider timeout in milliseconds.') }, ['sessionId', 'kind'])),
    toolDefinition('metadata_generate_cancel', 'Cancel an active metadata generation request without exposing Provider content.', objectSchema({ requestId: stringProperty('Active metadata request id.'), sessionId: stringProperty('Session id.'), agentId: stringProperty('Agent id.'), hostProfileId: stringProperty('Host profile scope.') }, ['requestId'])),
    toolDefinition('diagnostics_export', 'Export a redacted diagnostic report.', objectSchema({ format: stringProperty('json or text.') }, [])),
    toolDefinition('daemon_instance_status', 'Read the current Bridge instance identity and health snapshot.', objectSchema({ hostProfileId: stringProperty('Caller host profile id to echo.') }, [])),
    toolDefinition('daemon_config_status', 'Read applied remote daemon config status.', objectSchema({}, [])),
    toolDefinition('daemon_config_validate', 'Validate the last fetched signed remote config.', objectSchema({}, [])),
    toolDefinition('daemon_config_fetch', 'Fetch and verify a signed HTTPS remote config.', objectSchema({ url: stringProperty('HTTPS config URL.') }, ['url'])),
    toolDefinition('daemon_config_preview', 'Preview applying the last fetched remote config.', objectSchema({}, [])),
    toolDefinition('daemon_config_apply', 'Confirm applying a remote config plan.', objectSchema({ planId: stringProperty('Preview plan id.'), confirm: booleanProperty('Confirm apply.') }, ['planId'])),
    toolDefinition('daemon_config_rollback', 'Preview or confirm remote config rollback.', objectSchema({ planId: stringProperty('Rollback plan id.'), confirm: booleanProperty('Confirm rollback.') }, [])),
    toolDefinition('daemon_health', 'Read Bridge daemon health checks.', objectSchema({
      includeChecks: booleanProperty('Include detailed checks when supported.')
    }, [])),
    toolDefinition('daemon_start', 'Request Bridge daemon start. Existing Bridge safety and lifecycle semantics still apply.', objectSchema({
      detached: booleanProperty('Start as a detached local daemon when supported.'),
      port: numberProperty('Requested port.'),
      host: stringProperty('Requested host.')
    }, [])),
    toolDefinition('daemon_stop', 'Request Bridge daemon stop. Use carefully because this can stop the local Bridge process.', objectSchema({
      reason: stringProperty('Optional stop reason.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('daemon_restart', 'Request Bridge daemon restart. Use carefully because this can stop the local Bridge process.', objectSchema({
      reason: stringProperty('Optional restart reason.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('daemon_logs', 'Read Bridge daemon logs.', objectSchema({
      maxBytes: numberProperty('Maximum log bytes to return.'),
      tailBytes: numberProperty('Tail bytes alias.'),
      includeWarnings: booleanProperty('Include structured log warnings when supported.')
    }, [])),
    toolDefinition('daemon_autostart_status', 'Read Bridge daemon OS autostart registration status.', objectSchema({
      method: stringProperty('Autostart method or auto.')
    }, [])),
    toolDefinition('daemon_autostart_preview', 'Preview Bridge daemon OS autostart changes without writing.', objectSchema({
      enabled: booleanProperty('Desired autostart enabled state.'),
      method: stringProperty('Autostart method preference.')
    }, [])),
    toolDefinition('daemon_autostart_set', 'Set Bridge daemon autostart preference without installing an OS entry.', objectSchema({
      enabled: booleanProperty('Autostart enabled state.'),
      method: stringProperty('Autostart method preference.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('daemon_autostart_install', 'Install the managed current-user OS autostart entry after explicit confirmation.', objectSchema({
      method: stringProperty('Autostart method or auto.'),
      confirm: booleanProperty('Explicitly confirm the OS-level installation.')
    }, [])),
    toolDefinition('daemon_autostart_uninstall', 'Remove only the managed current-user OS autostart entry after explicit confirmation.', objectSchema({
      method: stringProperty('Autostart method or auto.'),
      confirm: booleanProperty('Explicitly confirm the OS-level removal.')
    }, [])),
    toolDefinition('daemon_update_status', 'Read Bridge self-update state without contacting the registry.', objectSchema({}, [])),
    toolDefinition('daemon_update_check', 'Check the configured npm registry for a Bridge update.', objectSchema({
      channel: stringProperty('Registry dist-tag such as latest, next, or beta.'),
      version: stringProperty('Optional exact semantic version.')
    }, [])),
    toolDefinition('daemon_update_preview', 'Preview a Bridge update without downloading or installing it.', objectSchema({
      channel: stringProperty('Registry dist-tag such as latest, next, or beta.'),
      version: stringProperty('Optional exact semantic version.'),
      allowLifecycleScripts: booleanProperty('Show a preview that allows package lifecycle scripts. Defaults to false.')
    }, [])),
    toolDefinition('daemon_update_install', 'Download, verify, back up, and install a Bridge update after explicit confirmation.', objectSchema({
      channel: stringProperty('Registry dist-tag such as latest, next, or beta.'),
      version: stringProperty('Optional exact semantic version.'),
      force: booleanProperty('Allow an explicitly reviewed same-version install or downgrade.'),
      allowLifecycleScripts: booleanProperty('Allow npm lifecycle scripts. Defaults to false.'),
      confirm: booleanProperty('Explicitly confirm package installation and daemon replacement.')
    }, [])),
    toolDefinition('daemon_update_rollback', 'Restore the verified pre-update package backup after explicit confirmation.', objectSchema({
      allowLifecycleScripts: booleanProperty('Allow npm lifecycle scripts. Defaults to the installation setting.'),
      confirm: booleanProperty('Explicitly confirm rollback and daemon replacement.')
    }, [])),
    toolDefinition('security_device_list', 'List trusted Bridge devices.', objectSchema({
      includeRevoked: booleanProperty('Include revoked device records.')
    }, [])),
    toolDefinition('security_device_trust', 'Trust a Bridge device.', objectSchema({
      deviceId: stringProperty('Device id.'),
      displayName: stringProperty('Device display name.'),
      publicKey: stringProperty('Device public key.'),
      fingerprint: stringProperty('Device fingerprint.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, ['deviceId'])),
    toolDefinition('security_device_revoke', 'Revoke trust for a Bridge device.', objectSchema({
      deviceId: stringProperty('Device id.'),
      reason: stringProperty('Revocation reason.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, ['deviceId'])),
    toolDefinition('security_audit_list', 'List Bridge security audit events.', objectSchema({
      limit: numberProperty('Maximum audit events to return.'),
      kind: stringProperty('Optional audit kind filter.'),
      severity: stringProperty('Optional severity filter.')
    }, [])),
    toolDefinition('security_tls_status', 'Read optional Bridge HTTPS/TLS listener status.', objectSchema({}, [])),
    toolDefinition('security_tls_set', 'Set optional Bridge HTTPS/TLS listener preference and material paths. Do not pass secret contents.', objectSchema({
      enabled: booleanProperty('Enable the optional TLS listener preference.'),
      port: numberProperty('TLS listener port.'),
      certPath: stringProperty('Certificate file path.'),
      keyPath: stringProperty('Private key file path.'),
      caPath: stringProperty('Optional CA file path.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('security_hosts_status', 'Read Bridge host allowlist status.', objectSchema({}, [])),
    toolDefinition('security_hosts_set', 'Set Bridge host allowlist entries.', objectSchema({
      hosts: arrayProperty('Allowed host names.'),
      mode: stringProperty('Update mode such as set, add, remove, or reset.'),
      host: stringProperty('Single host for add/remove flows.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('security_token_status', 'Read Bridge bearer token status without revealing token plaintext.', objectSchema({}, [])),
    toolDefinition('security_token_rotate', 'Rotate Bridge bearer token when managed by the local profile store.', objectSchema({
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, [])),
    toolDefinition('security_auth_status', 'Read Bridge auth preference status.', objectSchema({}, [])),
    toolDefinition('security_auth_set', 'Switch Bridge auth mode after a bcrypt hash has been configured locally. Secrets and password hashes must not be passed through MCP.', objectSchema({
      mode: stringProperty('Auth mode: bearer or bcrypt.'),
      confirm: booleanProperty('Caller confirmation marker for UI/client flows.')
    }, []))
  ];
}

function workspaceGitToolPayload(toolName, args) {
  const payload = Object.assign({}, args || {});
  if (toolName === 'workspace_git_pull' || toolName === 'workspace_git_push') {
    payload.remote = readString(args, 'remote', readString(args, 'remoteName', ''));
    payload.branch = readString(args, 'branch', readString(args, 'branchName', ''));
  } else if (toolName === 'workspace_git_branch') {
    const action = gitToolAction(toolName, args);
    payload.action = action.length > 0 ? action : 'list';
    payload.name = readString(args, 'name', readString(args, 'branchName', ''));
  } else if (toolName === 'workspace_git_stash') {
    let action = gitToolAction(toolName, args);
    if (action.length === 0) {
      action = readString(args, 'message', '').length > 0 ||
        (args && typeof args.includeUntracked === 'boolean') ? 'push' : 'list';
    }
    payload.action = action;
  } else if (toolName === 'workspace_git_merge') {
    payload.ref = readString(args, 'ref', readString(args, 'branch', readString(args, 'branchName', '')));
  }
  return payload;
}

function toolRequestType(toolName, args) {
  if (toolName === 'server_info_get') {
    return { type: RequestType.SERVER_INFO_GET, payload: args };
  }
  if (toolName === 'capabilities_get') {
    return { type: RequestType.CAPABILITIES_GET, payload: args };
  }
  if (toolName === 'agent_list') {
    return { type: RequestType.AGENT_LIST, payload: args };
  }
  if (toolName === 'agent_status') {
    return { type: RequestType.AGENT_STATUS, payload: args };
  }
  if (toolName === 'agent_attach') {
    return { type: RequestType.AGENT_ATTACH, payload: args };
  }
  if (toolName === 'agent_run') {
    return { type: RequestType.AGENT_RUN, payload: args };
  }
  if (toolName === 'agent_send') {
    return { type: RequestType.AGENT_SEND, payload: args };
  }
  if (toolName === 'agent_stop') {
    return { type: RequestType.AGENT_STOP, payload: args };
  }
  if (toolName === 'agent_resume') {
    return { type: RequestType.AGENT_RESUME, payload: args };
  }
  if (toolName === 'agent_update') {
    return { type: RequestType.AGENT_UPDATE, payload: args };
  }
  if (toolName === 'agent_mode_set') {
    return { type: RequestType.AGENT_MODE_SET, payload: args };
  }
  if (toolName === 'agent_model_set') {
    return { type: RequestType.AGENT_MODEL_SET, payload: args };
  }
  if (toolName === 'agent_archive') {
    return { type: RequestType.AGENT_ARCHIVE, payload: args };
  }
  if (toolName === 'agent_attention_clear') {
    return { type: RequestType.AGENT_ATTENTION_CLEAR, payload: args };
  }
  if (toolName === 'agent_fork') {
    return { type: RequestType.AGENT_FORK, payload: args };
  }
  if (toolName === 'agent_detach') {
    return { type: RequestType.AGENT_DETACH, payload: args };
  }
  if (toolName === 'timeline_fetch') {
    return { type: RequestType.TIMELINE_FETCH, payload: args };
  }
  if (toolName === 'timeline_ack') {
    return { type: RequestType.TIMELINE_ACK, payload: args };
  }
  if (toolName === 'checkpoint_list') {
    return { type: RequestType.CHECKPOINT_LIST, payload: args };
  }
  if (toolName === 'checkpoint_create') {
    return { type: RequestType.CHECKPOINT_CREATE, payload: args };
  }
  if (toolName === 'checkpoint_restore') {
    return { type: RequestType.CHECKPOINT_RESTORE, payload: args };
  }
  if (toolName === 'permission_list') {
    return { type: RequestType.PERMISSION_LIST, payload: args };
  }
  if (toolName === 'permission_respond') {
    return { type: RequestType.PERMISSION_RESPOND, payload: args };
  }
  if (toolName === 'notification_list') {
    return { type: RequestType.NOTIFICATION_LIST, payload: args };
  }
  if (toolName === 'notification_read') {
    return { type: RequestType.NOTIFICATION_READ, payload: args };
  }
  if (toolName === 'notification_action') {
    return { type: RequestType.NOTIFICATION_ACTION, payload: args };
  }
  if (toolName === 'notification_prune') {
    return { type: RequestType.NOTIFICATION_PRUNE, payload: args };
  }
  if (toolName === 'terminal_list') {
    return { type: RequestType.TERMINAL_LIST, payload: args };
  }
  if (toolName === 'terminal_create') {
    return { type: RequestType.TERMINAL_CREATE, payload: args };
  }
  if (toolName === 'terminal_subscribe') {
    return { type: RequestType.TERMINAL_SUBSCRIBE, payload: args };
  }
  if (toolName === 'terminal_unsubscribe') {
    return { type: RequestType.TERMINAL_UNSUBSCRIBE, payload: args };
  }
  if (toolName === 'terminal_capture') {
    return { type: RequestType.TERMINAL_CAPTURE, payload: args };
  }
  if (toolName === 'terminal_rename') {
    return { type: RequestType.TERMINAL_RENAME, payload: args };
  }
  if (toolName === 'terminal_kill') {
    return { type: RequestType.TERMINAL_KILL, payload: args };
  }
  if (toolName === 'terminal_hook_status') {
    return { type: RequestType.TERMINAL_HOOK_STATUS, payload: args };
  }
  if (toolName === 'terminal_hook_install') {
    return { type: RequestType.TERMINAL_HOOK_INSTALL, payload: args };
  }
  if (toolName === 'provider_catalog') {
    return { type: readBoolean(args, 'refresh', false) ? RequestType.PROVIDER_CATALOG_REFRESH : RequestType.PROVIDER_CATALOG, payload: args };
  }
  if (toolName === 'provider_catalog_refresh') {
    return { type: RequestType.PROVIDER_CATALOG_REFRESH, payload: args };
  }
  if (toolName === 'provider_profile_list') {
    return { type: RequestType.PROVIDER_PROFILE_LIST, payload: args };
  }
  if (toolName === 'provider_profile_upsert') {
    return { type: RequestType.PROVIDER_PROFILE_UPSERT, payload: args };
  }
  if (toolName === 'provider_profile_delete') {
    return { type: RequestType.PROVIDER_PROFILE_DELETE, payload: args };
  }
  if (toolName === 'provider_profile_test') {
    return { type: RequestType.PROVIDER_PROFILE_TEST, payload: args };
  }
  if (toolName === 'provider_acp_discover') {
    return { type: RequestType.PROVIDER_ACP_DISCOVER, payload: args };
  }
  if (toolName === 'provider_acp_import') {
    return { type: RequestType.PROVIDER_ACP_IMPORT, payload: args };
  }
  if (toolName === 'provider_directory_list') {
    return { type: RequestType.PROVIDER_DIRECTORY_LIST, payload: args };
  }
  if (toolName === 'provider_directory_refresh') {
    return { type: RequestType.PROVIDER_DIRECTORY_REFRESH, payload: args };
  }
  if (toolName === 'provider_directory_status') {
    return { type: RequestType.PROVIDER_DIRECTORY_STATUS, payload: args };
  }
  if (toolName === 'provider_directory_install') {
    return { type: RequestType.PROVIDER_DIRECTORY_INSTALL, payload: args };
  }
  if (toolName === 'provider_directory_remove') {
    return { type: RequestType.PROVIDER_DIRECTORY_REMOVE, payload: args };
  }
  if (toolName === 'provider_directory_rollback') {
    return { type: RequestType.PROVIDER_DIRECTORY_ROLLBACK, payload: args };
  }
  if (toolName === 'provider_usage_list') {
    return { type: RequestType.PROVIDER_USAGE_LIST, payload: args };
  }
  if (toolName === 'workspace_registry_list') {
    return { type: RequestType.WORKSPACE_REGISTRY_LIST, payload: args };
  }
  if (toolName === 'workspace_registry_create') {
    return { type: RequestType.WORKSPACE_REGISTRY_CREATE, payload: args };
  }
  if (toolName === 'workspace_registry_import') {
    return { type: RequestType.WORKSPACE_REGISTRY_IMPORT, payload: args };
  }
  if (toolName === 'workspace_registry_upsert') {
    return { type: RequestType.WORKSPACE_REGISTRY_UPSERT, payload: args };
  }
  if (toolName === 'workspace_registry_archive') {
    return { type: RequestType.WORKSPACE_REGISTRY_ARCHIVE, payload: args };
  }
  if (toolName === 'workspace_registry_open') {
    return { type: RequestType.WORKSPACE_REGISTRY_OPEN, payload: args };
  }
  if (toolName === 'workspace_registry_suggestions') {
    return { type: RequestType.WORKSPACE_REGISTRY_SUGGESTIONS, payload: args };
  }
  if (toolName === 'workspace_registry_doctor') {
    return { type: RequestType.WORKSPACE_REGISTRY_DOCTOR, payload: args };
  }
  if (toolName === 'project_registry_list') {
    return { type: RequestType.PROJECT_REGISTRY_LIST, payload: args };
  }
  if (toolName === 'workspace_changes_get') {
    return { type: RequestType.WORKSPACE_CHANGES_GET, payload: args };
  }
  if (toolName === 'workspace_diff_get') {
    return { type: RequestType.WORKSPACE_DIFF_GET, payload: args };
  }
  if (toolName === 'workspace_files_list') {
    return { type: RequestType.WORKSPACE_FILES_LIST, payload: args };
  }
  if (toolName === 'workspace_file_get') {
    return { type: RequestType.WORKSPACE_FILE_GET, payload: args };
  }
  if (toolName === 'workspace_file_download') {
    return { type: RequestType.WORKSPACE_FILE_DOWNLOAD, payload: args };
  }
  if (toolName === 'attachment_file_download') {
    return { type: RequestType.ATTACHMENT_FILE_DOWNLOAD, payload: args };
  }
  if (toolName === 'file_transfer_download') {
    return { type: RequestType.FILE_TRANSFER_DOWNLOAD, payload: args };
  }
  if (toolName === 'file_transfer_upload') {
    return { type: RequestType.FILE_TRANSFER_UPLOAD, payload: args };
  }
  if (toolName === 'file_transfer_cancel') {
    return { type: RequestType.FILE_TRANSFER_CANCEL, payload: args };
  }
  if (toolName === 'workspace_git_stage') {
    return { type: RequestType.WORKSPACE_GIT_STAGE, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_unstage') {
    return { type: RequestType.WORKSPACE_GIT_UNSTAGE, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_discard') {
    return { type: RequestType.WORKSPACE_GIT_DISCARD, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_commit') {
    return { type: RequestType.WORKSPACE_GIT_COMMIT, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_pull') {
    return { type: RequestType.WORKSPACE_GIT_PULL, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_push') {
    return { type: RequestType.WORKSPACE_GIT_PUSH, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_branch') {
    return { type: RequestType.WORKSPACE_GIT_BRANCH, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_stash') {
    return { type: RequestType.WORKSPACE_GIT_STASH, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_merge') {
    return { type: RequestType.WORKSPACE_GIT_MERGE, payload: workspaceGitToolPayload(toolName, args) };
  }
  if (toolName === 'workspace_git_subscribe') {
    return { type: RequestType.WORKSPACE_GIT_SUBSCRIBE, payload: args };
  }
  if (toolName === 'worktree_list') {
    return { type: RequestType.WORKTREE_LIST, payload: args };
  }
  if (toolName === 'worktree_create') {
    return { type: RequestType.WORKTREE_CREATE, payload: args };
  }
  if (toolName === 'worktree_archive') {
    return { type: RequestType.WORKTREE_ARCHIVE, payload: args };
  }
  if (toolName === 'github_pr_create') {
    return { type: RequestType.GITHUB_PR_CREATE, payload: args };
  }
  const githubMappings = {
    github_auth_device_start: RequestType.GITHUB_AUTH_DEVICE_START,
    github_auth_device_poll: RequestType.GITHUB_AUTH_DEVICE_POLL,
    github_auth_status: RequestType.GITHUB_AUTH_STATUS,
    github_auth_logout: RequestType.GITHUB_AUTH_LOGOUT,
    github_account_list: RequestType.GITHUB_ACCOUNT_LIST,
    github_binding_get: RequestType.GITHUB_BINDING_GET,
    github_binding_set: RequestType.GITHUB_BINDING_SET,
    github_pr_list: RequestType.GITHUB_PR_LIST,
    github_pr_update: RequestType.GITHUB_PR_UPDATE,
    github_pr_reviewers_update: RequestType.GITHUB_PR_REVIEWERS_UPDATE,
    github_pr_labels_update: RequestType.GITHUB_PR_LABELS_UPDATE,
    github_watch_start: RequestType.GITHUB_WATCH_START,
    github_watch_stop: RequestType.GITHUB_WATCH_STOP,
    github_attachment_preview: RequestType.GITHUB_ATTACHMENT_PREVIEW,
    github_attachment_upload: RequestType.GITHUB_ATTACHMENT_UPLOAD
  };
  if (Object.prototype.hasOwnProperty.call(githubMappings, toolName)) {
    return { type: githubMappings[toolName], payload: args };
  }
  if (toolName === 'github_pr_status') {
    return { type: RequestType.GITHUB_PR_STATUS, payload: args };
  }
  if (toolName === 'github_pr_merge') {
    return { type: RequestType.GITHUB_PR_MERGE, payload: args };
  }
  if (toolName === 'github_checks_list') {
    return { type: RequestType.GITHUB_CHECKS_LIST, payload: args };
  }
  if (toolName === 'github_issue_search') {
    return { type: RequestType.GITHUB_ISSUE_SEARCH, payload: args };
  }
  if (toolName === 'github_issue_attachment_list') {
    return { type: RequestType.GITHUB_ISSUE_ATTACHMENT_LIST, payload: args };
  }
  if (toolName === 'daemon_status') {
    return { type: RequestType.DAEMON_STATUS, payload: args };
  }
  const relayMappings = {
    relay_status: RequestType.RELAY_STATUS,
    relay_pairing_start: RequestType.RELAY_PAIRING_START,
    relay_pairing_cancel: RequestType.RELAY_PAIRING_CANCEL,
    relay_connect: RequestType.RELAY_CONNECT,
    relay_disconnect: RequestType.RELAY_DISCONNECT,
    relay_device_list: RequestType.RELAY_DEVICE_LIST,
    relay_device_revoke: RequestType.RELAY_DEVICE_REVOKE,
    relay_identity_rotate: RequestType.RELAY_IDENTITY_ROTATE
  };
  if (Object.prototype.hasOwnProperty.call(relayMappings, toolName)) {
    return { type: relayMappings[toolName], payload: args };
  }
  const m7Mappings = {
    schedule_status: RequestType.SCHEDULE_STATUS, schedule_list: RequestType.SCHEDULE_LIST,
    schedule_get: RequestType.SCHEDULE_GET, schedule_history: RequestType.SCHEDULE_HISTORY,
    schedule_create: RequestType.SCHEDULE_CREATE, schedule_update: RequestType.SCHEDULE_UPDATE,
    schedule_enable: RequestType.SCHEDULE_ENABLE, schedule_disable: RequestType.SCHEDULE_DISABLE,
    schedule_run_now: RequestType.SCHEDULE_RUN_NOW, schedule_remove: RequestType.SCHEDULE_REMOVE,
    loop_status: RequestType.LOOP_STATUS, loop_list: RequestType.LOOP_LIST, loop_get: RequestType.LOOP_GET,
    loop_rounds: RequestType.LOOP_ROUNDS, loop_create: RequestType.LOOP_CREATE, loop_update: RequestType.LOOP_UPDATE,
    loop_start: RequestType.LOOP_START, loop_pause: RequestType.LOOP_PAUSE, loop_resume: RequestType.LOOP_RESUME,
    loop_stop: RequestType.LOOP_STOP, loop_takeover: RequestType.LOOP_TAKEOVER, loop_remove: RequestType.LOOP_REMOVE,
    chat_room_status: RequestType.CHAT_ROOM_STATUS, chat_room_list: RequestType.CHAT_ROOM_LIST,
    chat_room_get: RequestType.CHAT_ROOM_GET, chat_room_create: RequestType.CHAT_ROOM_CREATE,
    chat_room_update: RequestType.CHAT_ROOM_UPDATE, chat_room_archive: RequestType.CHAT_ROOM_ARCHIVE,
    chat_room_member_add: RequestType.CHAT_ROOM_MEMBER_ADD, chat_room_member_update: RequestType.CHAT_ROOM_MEMBER_UPDATE,
    chat_room_member_remove: RequestType.CHAT_ROOM_MEMBER_REMOVE, chat_room_message_post: RequestType.CHAT_ROOM_MESSAGE_POST,
    chat_room_message_list: RequestType.CHAT_ROOM_MESSAGE_LIST, chat_room_ack: RequestType.CHAT_ROOM_ACK
  };
  if (Object.prototype.hasOwnProperty.call(m7Mappings, toolName)) return { type: m7Mappings[toolName], payload: args };
  const voiceMappings = {
    voice_status: RequestType.VOICE_STATUS,
    voice_session_start: RequestType.VOICE_SESSION_START,
    voice_session_chunk: RequestType.VOICE_SESSION_CHUNK,
    voice_session_finish: RequestType.VOICE_SESSION_FINISH,
    voice_session_cancel: RequestType.VOICE_SESSION_CANCEL,
    voice_tts_speak: RequestType.VOICE_TTS_SPEAK,
    voice_tts_stop: RequestType.VOICE_TTS_STOP
  };
  if (Object.prototype.hasOwnProperty.call(voiceMappings, toolName)) return { type: voiceMappings[toolName], payload: args };
  const workspaceServiceMappings = {
    workspace_service_list: RequestType.WORKSPACE_SERVICE_LIST,
    workspace_service_upsert: RequestType.WORKSPACE_SERVICE_UPSERT,
    workspace_service_status: RequestType.WORKSPACE_SERVICE_STATUS,
    workspace_service_health: RequestType.WORKSPACE_SERVICE_HEALTH,
    workspace_service_open: RequestType.WORKSPACE_SERVICE_OPEN,
    workspace_service_start: RequestType.WORKSPACE_SERVICE_START,
    workspace_service_stop: RequestType.WORKSPACE_SERVICE_STOP,
    workspace_service_logs: RequestType.WORKSPACE_SERVICE_LOGS,
    workspace_service_remove: RequestType.WORKSPACE_SERVICE_REMOVE
  };
  if (Object.prototype.hasOwnProperty.call(workspaceServiceMappings, toolName)) return { type: workspaceServiceMappings[toolName], payload: args };
  const browserMappings = {
    browser_host_list: RequestType.BROWSER_HOST_LIST,
    browser_instance_list: RequestType.BROWSER_INSTANCE_LIST,
    browser_instance_create: RequestType.BROWSER_INSTANCE_CREATE,
    browser_instance_close: RequestType.BROWSER_INSTANCE_CLOSE,
    browser_page_list: RequestType.BROWSER_PAGE_LIST,
    browser_page_create: RequestType.BROWSER_PAGE_CREATE,
    browser_page_close: RequestType.BROWSER_PAGE_CLOSE,
    browser_page_navigate: RequestType.BROWSER_PAGE_NAVIGATE,
    browser_page_snapshot: RequestType.BROWSER_PAGE_SNAPSHOT,
    browser_page_screenshot: RequestType.BROWSER_PAGE_SCREENSHOT,
    browser_page_logs: RequestType.BROWSER_PAGE_LOGS,
    browser_page_wait: RequestType.BROWSER_PAGE_WAIT,
    browser_page_action: RequestType.BROWSER_PAGE_ACTION,
    browser_download_list: RequestType.BROWSER_DOWNLOAD_LIST,
    browser_permission_get: RequestType.BROWSER_PERMISSION_GET,
    browser_permission_set: RequestType.BROWSER_PERMISSION_SET
  };
  if (Object.prototype.hasOwnProperty.call(browserMappings, toolName)) return { type: browserMappings[toolName], payload: args };
  const experienceMappings = {
    usage_summary_get: RequestType.USAGE_SUMMARY_GET, usage_events_list: RequestType.USAGE_EVENTS_LIST,
    usage_budget_get: RequestType.USAGE_BUDGET_GET, usage_budget_set: RequestType.USAGE_BUDGET_SET,
    message_queue_list: RequestType.MESSAGE_QUEUE_LIST, message_queue_cancel: RequestType.MESSAGE_QUEUE_CANCEL,
    message_queue_retry: RequestType.MESSAGE_QUEUE_RETRY, metadata_generate: RequestType.METADATA_GENERATE,
    metadata_generate_cancel: RequestType.METADATA_GENERATE_CANCEL,
    diagnostics_export: RequestType.DIAGNOSTICS_EXPORT
  };
  if (Object.prototype.hasOwnProperty.call(experienceMappings, toolName)) return { type: experienceMappings[toolName], payload: args };
  if (toolName === 'daemon_instance_status') return { type: RequestType.DAEMON_INSTANCE_STATUS, payload: args };
  if (toolName === 'daemon_config_status') return { type: RequestType.DAEMON_CONFIG_STATUS, payload: args };
  if (toolName === 'daemon_config_validate') return { type: RequestType.DAEMON_CONFIG_VALIDATE, payload: args };
  if (toolName === 'daemon_config_fetch') return { type: RequestType.DAEMON_CONFIG_FETCH, payload: args };
  if (toolName === 'daemon_config_preview') return { type: RequestType.DAEMON_CONFIG_PREVIEW, payload: args };
  if (toolName === 'daemon_config_apply') return { type: RequestType.DAEMON_CONFIG_APPLY, payload: args };
  if (toolName === 'daemon_config_rollback') return { type: RequestType.DAEMON_CONFIG_ROLLBACK, payload: args };
  if (toolName === 'daemon_health') {
    return { type: RequestType.DAEMON_HEALTH, payload: args };
  }
  if (toolName === 'daemon_start') {
    return { type: RequestType.DAEMON_START, payload: args };
  }
  if (toolName === 'daemon_stop') {
    return { type: RequestType.DAEMON_STOP, payload: args };
  }
  if (toolName === 'daemon_restart') {
    return { type: RequestType.DAEMON_RESTART, payload: args };
  }
  if (toolName === 'daemon_logs') {
    return { type: RequestType.DAEMON_LOGS, payload: args };
  }
  if (toolName === 'daemon_autostart_status') {
    return { type: RequestType.DAEMON_AUTOSTART_STATUS, payload: args };
  }
  if (toolName === 'daemon_autostart_preview') {
    return { type: RequestType.DAEMON_AUTOSTART_PREVIEW, payload: args };
  }
  if (toolName === 'daemon_autostart_set') {
    return { type: RequestType.DAEMON_AUTOSTART_SET, payload: args };
  }
  if (toolName === 'daemon_autostart_install') {
    return { type: RequestType.DAEMON_AUTOSTART_INSTALL, payload: args };
  }
  if (toolName === 'daemon_autostart_uninstall') {
    return { type: RequestType.DAEMON_AUTOSTART_UNINSTALL, payload: args };
  }
  if (toolName === 'daemon_update_status') {
    return { type: RequestType.DAEMON_UPDATE_STATUS, payload: args };
  }
  if (toolName === 'daemon_update_check') {
    return { type: RequestType.DAEMON_UPDATE_CHECK, payload: args };
  }
  if (toolName === 'daemon_update_preview') {
    return { type: RequestType.DAEMON_UPDATE_PREVIEW, payload: args };
  }
  if (toolName === 'daemon_update_install') {
    return { type: RequestType.DAEMON_UPDATE_INSTALL, payload: args };
  }
  if (toolName === 'daemon_update_rollback') {
    return { type: RequestType.DAEMON_UPDATE_ROLLBACK, payload: args };
  }
  if (toolName === 'security_device_list') {
    return { type: RequestType.SECURITY_DEVICE_LIST, payload: args };
  }
  if (toolName === 'security_device_trust') {
    return { type: RequestType.SECURITY_DEVICE_TRUST, payload: args };
  }
  if (toolName === 'security_device_revoke') {
    return { type: RequestType.SECURITY_DEVICE_REVOKE, payload: args };
  }
  if (toolName === 'security_audit_list') {
    return { type: RequestType.SECURITY_AUDIT_LIST, payload: args };
  }
  if (toolName === 'security_tls_status') {
    return { type: RequestType.SECURITY_TLS_STATUS, payload: args };
  }
  if (toolName === 'security_tls_set') {
    return { type: RequestType.SECURITY_TLS_SET, payload: args };
  }
  if (toolName === 'security_hosts_status') {
    return { type: RequestType.SECURITY_HOSTS_STATUS, payload: args };
  }
  if (toolName === 'security_hosts_set') {
    return { type: RequestType.SECURITY_HOSTS_SET, payload: args };
  }
  if (toolName === 'security_token_status') {
    return { type: RequestType.SECURITY_TOKEN_STATUS, payload: args };
  }
  if (toolName === 'security_token_rotate') {
    return { type: RequestType.SECURITY_TOKEN_ROTATE, payload: args };
  }
  if (toolName === 'security_auth_status') {
    return { type: RequestType.SECURITY_AUTH_STATUS, payload: args };
  }
  if (toolName === 'security_auth_set') {
    return { type: RequestType.SECURITY_AUTH_SET, payload: args };
  }
  return null;
}

function normalizeMcpConfig(config, bridgeConfig, existing) {
  const current = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const bridgeUrl = readString(config, 'bridgeUrl', readString(current, 'bridgeUrl', httpBridgeUrl(bridgeConfig)));
  const status = readBoolean(config, 'active', readBoolean(current, 'active', false)) ? 'active' : 'stopped';
  return {
    serverId: MCP_SERVER_ID,
    status,
    active: status === 'active',
    command: process.execPath,
    args: [stdioServerPath()],
    bridgeUrl,
    tokenEnv: readString(config, 'tokenEnv', readString(current, 'tokenEnv', 'AGENT_BRIDGE_TOKEN')),
    toolsCount: mcpToolDefinitions().length,
    startedAt: status === 'active' ? readString(current, 'startedAt', nowIso()) : readString(current, 'startedAt', ''),
    updatedAt: nowIso()
  };
}

class McpHostManager {
  constructor(options) {
    this.store = options && options.store ? options.store : null;
    this.config = options && options.config ? options.config : {};
  }

  isAvailable() {
    return true;
  }

  listTools() {
    return {
      ok: true,
      action: 'mcp.tools.list',
      serverId: MCP_SERVER_ID,
      protocol: 'stdio',
      tools: mcpToolDefinitions()
    };
  }

  status() {
    const mcp = this.store && this.store.config && this.store.config.daemon ? this.store.config.daemon.mcp : {};
    const normalized = normalizeMcpConfig({}, this.config, mcp);
    return Object.assign({}, normalized, {
      ok: true,
      action: 'mcp.server.status',
      protocol: 'stdio',
      tokenConfigured: typeof this.config.token === 'string' && this.config.token.length > 0,
      tools: mcpToolDefinitions()
    });
  }

  start(payload) {
    const mcp = this.store && this.store.config && this.store.config.daemon ? this.store.config.daemon.mcp : {};
    const next = normalizeMcpConfig(Object.assign({}, payload || {}, { active: true }), this.config, mcp);
    if (this.store) {
      const config = this.store.config;
      config.daemon.mcp = next;
      this.store.writeConfig(config);
    }
    return Object.assign({}, next, {
      ok: true,
      action: 'mcp.server.start',
      protocol: 'stdio',
      message: 'MCP stdio server configuration is ready. Launch the returned command from an MCP client.',
      tokenConfigured: typeof this.config.token === 'string' && this.config.token.length > 0,
      tools: mcpToolDefinitions()
    });
  }

  stop(payload) {
    const mcp = this.store && this.store.config && this.store.config.daemon ? this.store.config.daemon.mcp : {};
    const next = normalizeMcpConfig(Object.assign({}, payload || {}, { active: false }), this.config, mcp);
    if (this.store) {
      const config = this.store.config;
      config.daemon.mcp = next;
      this.store.writeConfig(config);
    }
    return Object.assign({}, next, {
      ok: true,
      action: 'mcp.server.stop',
      protocol: 'stdio',
      message: 'MCP stdio server configuration is stopped. Existing client-launched stdio processes are not force-killed.',
      tools: mcpToolDefinitions()
    });
  }
}

module.exports = {
  MCP_SERVER_ID,
  McpHostManager,
  mcpToolDefinitions,
  toolRequestType,
  toolAccessPolicy,
  toolConfirmationFailure,
  httpBridgeUrl
};
