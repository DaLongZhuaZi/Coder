import { logger, NGFRdbConfig, NGFRdbRow, ngfRdbManager } from 'ngf_framework';
import { AgentBridgeRemoteSession } from '../agentBridge/AgentBridgeModels';
import {
  AgentHomeBootstrapState,
  AgentHomeChatItem,
  AgentHomeGitCommitItem,
  AgentHomePlanItem,
  AgentHomePreviewItem,
  AgentHomeProfile,
  AgentHomeSessionItem,
  AgentHomeStateSnapshot,
  AgentHomeToolCallItem,
  AgentHomeUserRequestItem,
  AgentHomeWorkspaceChangeItem,
  AgentHomeWorkspaceFileItem,
  AgentHomeWorkspaceItem
} from './AgentHomeModels';
import { AgentBridgeProviderId } from '../agentBridge/AgentBridgeModels';

const TAG: string = 'AgentHomePersistenceRepository';
const AGENT_DB_NAME: string = 'NGFAgentHome.db';
const AGENT_PROFILE_ID: string = 'default';

export class AgentHomePersistenceRepository {
  private isInitialized: boolean = false;

  async initialize(): Promise<boolean> {
    if (ngfRdbManager.isReadyForStore(AGENT_DB_NAME)) {
      this.isInitialized = true;
      await this.ensureProfileSchema();
      return true;
    }

    const config: NGFRdbConfig = {
      name: AGENT_DB_NAME,
      securityLevel: 1
    };
    const createSqls: Array<string> = [];
    createSqls.push(
      'CREATE TABLE IF NOT EXISTS agent_profile (' +
        'profile_id TEXT PRIMARY KEY, ' +
        'endpoint TEXT, ' +
        'token TEXT, ' +
        'provider_id TEXT, ' +
        'model_id TEXT, ' +
        'speed_mode TEXT, ' +
        'reasoning_mode TEXT, ' +
        'active_workspace_id TEXT, ' +
        'active_session_id TEXT, ' +
        'preview_path TEXT, ' +
        'updated_at INTEGER' +
      ')'
    );
    createSqls.push(
      'CREATE TABLE IF NOT EXISTS agent_workspace (' +
        'id TEXT PRIMARY KEY, ' +
        'title TEXT, ' +
        'workspace_path TEXT, ' +
        'initial TEXT, ' +
        'accent_color TEXT, ' +
        'branch_name TEXT, ' +
        'is_online INTEGER, ' +
        'sort_order INTEGER, ' +
        'updated_at INTEGER' +
      ')'
    );
    createSqls.push(
      'CREATE TABLE IF NOT EXISTS agent_session (' +
        'id TEXT PRIMARY KEY, ' +
        'workspace_id TEXT, ' +
        'title TEXT, ' +
        'branch_name TEXT, ' +
        'provider_id TEXT, ' +
        'model_id TEXT, ' +
        'speed_mode TEXT, ' +
        'reasoning_mode TEXT, ' +
        'bridge_session_id TEXT, ' +
        'updated_at INTEGER' +
      ')'
    );
    createSqls.push(
      'CREATE INDEX IF NOT EXISTS idx_agent_session_workspace ON agent_session (workspace_id)'
    );
    createSqls.push(
      'CREATE INDEX IF NOT EXISTS idx_agent_session_provider_workspace ON agent_session (provider_id, workspace_id)'
    );
    createSqls.push(
      'CREATE TABLE IF NOT EXISTS agent_message (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'role TEXT, ' +
        'title TEXT, ' +
        'body TEXT, ' +
        'message_id TEXT, ' +
        'reasoning_text TEXT, ' +
        'agent_name TEXT, ' +
        'duration_text TEXT, ' +
        'created_at INTEGER' +
      ')'
    );
    createSqls.push(
      'CREATE TABLE IF NOT EXISTS agent_preview (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'path TEXT, ' +
        'media_type TEXT, ' +
        'content TEXT, ' +
        'updated_at INTEGER' +
      ')'
    );
    this.pushRemoteSessionSchemaSqls(createSqls);
    this.pushWorkspaceSchemaSqls(createSqls);

    const initialized = await ngfRdbManager.init(config, createSqls);
    this.isInitialized = initialized;
    if (initialized) {
      await this.ensureProfileSchema();
    }
    return initialized;
  }

  async loadOrCreate(defaultState: AgentHomeBootstrapState): Promise<AgentHomeStateSnapshot> {
    await this.ensureReady();

    let workspaces = await this.loadWorkspaces();
    if (workspaces.length === 0) {
      workspaces = defaultState.workspaces;
      await this.replaceWorkspaces(workspaces);
    }

    let sessions = await this.loadSessions();
    if (sessions.length === 0) {
      sessions = defaultState.sessions;
      await this.replaceSessions(sessions);
    }

    let profile = await this.loadProfile(defaultState.profile);
    let profileChanged = false;
    if (!this.hasWorkspace(workspaces, profile.activeWorkspaceId) && workspaces.length > 0) {
      profile = new AgentHomeProfile(
        profile.endpoint,
        profile.token,
        profile.providerId,
        profile.modelId,
        profile.speedMode,
        profile.reasoningMode,
        workspaces[0].id,
        profile.activeSessionId,
        profile.previewPath,
        Date.now()
      );
      profileChanged = true;
    }

    if (!this.hasSessionInWorkspace(sessions, profile.activeSessionId, profile.activeWorkspaceId) && sessions.length > 0) {
      let nextSessionId = this.findFirstSessionIdForWorkspace(sessions, profile.activeWorkspaceId);
      if (nextSessionId.length === 0) {
        nextSessionId = sessions[0].id;
      }
      profile = new AgentHomeProfile(
        profile.endpoint,
        profile.token,
        profile.providerId,
        profile.modelId,
        profile.speedMode,
        profile.reasoningMode,
        profile.activeWorkspaceId,
        nextSessionId,
        profile.previewPath,
        Date.now()
      );
      profileChanged = true;
    }

    if (profileChanged) {
      await this.saveProfile(profile);
    }

    const messages = await this.loadMessages();
    const previews = await this.loadPreviews();
    const toolCalls = await this.loadToolCalls();
    const changes = await this.loadWorkspaceChanges();
    const files = await this.loadWorkspaceFiles();
    const commits = await this.loadGitCommits();
    const userRequests = await this.loadUserRequests();
    const plans = await this.loadPlans();
    return new AgentHomeStateSnapshot(profile, workspaces, sessions, messages, previews, toolCalls, changes, files, commits, userRequests, plans);
  }

  async saveProfile(profile: AgentHomeProfile): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_profile (' +
        'profile_id, endpoint, token, provider_id, model_id, speed_mode, reasoning_mode, active_workspace_id, active_session_id, ' +
        'preview_path, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        AGENT_PROFILE_ID,
        profile.endpoint,
        profile.token,
        profile.providerId,
        profile.modelId,
        profile.speedMode,
        profile.reasoningMode,
        profile.activeWorkspaceId,
        profile.activeSessionId,
        profile.previewPath,
        profile.updatedAt
      ]
    );
  }

  async saveWorkspace(workspace: AgentHomeWorkspaceItem): Promise<void> {
    await this.ensureReady();
    await this.saveWorkspaceAt(workspace, 0);
  }

  async saveSession(session: AgentHomeSessionItem): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_session (' +
        'id, workspace_id, title, branch_name, provider_id, model_id, speed_mode, reasoning_mode, bridge_session_id, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        session.id,
        session.workspaceId,
        session.title,
        session.branchName,
        session.providerId,
        session.modelId,
        session.speedMode,
        session.reasoningMode,
        session.bridgeSessionId,
        session.updatedAt
      ]
    );
  }

  async loadRemoteSessions(): Promise<Array<AgentBridgeRemoteSession>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, model_id, ' +
        'speed_mode, reasoning_mode, status, source, message_count, updated_at ' +
        'FROM agent_remote_session ORDER BY updated_at DESC'
    );
    const items: Array<AgentBridgeRemoteSession> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentBridgeRemoteSession(
        row.getString('session_id', ''),
        row.getString('remote_session_id', ''),
        row.getString('provider_id', ''),
        row.getString('title', ''),
        row.getString('workspace_path', ''),
        row.getString('workspace_title', ''),
        row.getString('branch_name', ''),
        row.getString('model_id', ''),
        row.getString('speed_mode', ''),
        row.getString('reasoning_mode', 'auto'),
        row.getString('status', ''),
        row.getString('source', ''),
        row.getNumber('message_count', 0),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  async replaceRemoteSessionsForProvider(providerId: string, sessions: Array<AgentBridgeRemoteSession>): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_remote_session WHERE provider_id = ?', [providerId]);
      for (let index = 0; index < sessions.length; index++) {
        await this.saveRemoteSessionWithoutReady(providerId, sessions[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace remote sessions failed: ' + e);
      throw new Error('replace remote sessions failed: ' + e);
    }
  }

  async saveRemoteSession(providerId: string, session: AgentBridgeRemoteSession): Promise<void> {
    await this.ensureReady();
    await this.saveRemoteSessionWithoutReady(providerId, session);
  }

  async replaceWorkspaceSessionState(
    workspaces: Array<AgentHomeWorkspaceItem>,
    sessions: Array<AgentHomeSessionItem>,
    oldWorkspaceIds: Array<string>,
    newWorkspaceIds: Array<string>
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await this.replaceWorkspaces(workspaces);
      await this.replaceSessions(sessions);
      for (let index = 0; index < oldWorkspaceIds.length; index++) {
        const oldWorkspaceId = oldWorkspaceIds[index];
        const newWorkspaceId = newWorkspaceIds[index];
        await ngfRdbManager.executeSql(
          'UPDATE agent_workspace_change SET workspace_id = ? WHERE workspace_id = ?',
          [newWorkspaceId, oldWorkspaceId]
        );
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_workspace_file WHERE workspace_id = ? AND EXISTS (' +
            'SELECT 1 FROM agent_workspace_file AS target ' +
            'WHERE target.workspace_id = ? AND target.path = agent_workspace_file.path' +
          ')',
          [oldWorkspaceId, newWorkspaceId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_workspace_file SET workspace_id = ? WHERE workspace_id = ?',
          [newWorkspaceId, oldWorkspaceId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_git_commit SET workspace_id = ? WHERE workspace_id = ?',
          [newWorkspaceId, oldWorkspaceId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_plan SET workspace_id = ? WHERE workspace_id = ?',
          [newWorkspaceId, oldWorkspaceId]
        );
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace agent workspace session state failed: ' + e);
      throw new Error('replace agent workspace session state failed: ' + e);
    }
  }

  async saveMessage(message: AgentHomeChatItem): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_message (' +
        'id, session_id, role, title, body, message_id, reasoning_text, agent_name, duration_text, created_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        message.id,
        message.sessionId,
        message.role,
        message.title,
        message.text,
        message.messageId,
        message.reasoningText,
        message.agentName,
        message.durationText,
        message.createdAt
      ]
    );
  }

  async savePreview(preview: AgentHomePreviewItem): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_preview (' +
        'id, session_id, path, media_type, content, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?)',
      [
        preview.id,
        preview.sessionId,
        preview.path,
        preview.mediaType,
        preview.content,
        preview.updatedAt
      ]
    );
  }

  async saveToolCall(toolCall: AgentHomeToolCallItem): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_tool_call (' +
        'id, session_id, provider_id, message_id, tool_call_id, name, status, input_text, output_text, error_text, ' +
        'raw_json, started_at, completed_at, updated_at, agent_name' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        toolCall.id,
        toolCall.sessionId,
        toolCall.providerId,
        toolCall.messageId,
        toolCall.toolCallId,
        toolCall.name,
        toolCall.status,
        toolCall.inputText,
        toolCall.outputText,
        toolCall.errorText,
        toolCall.rawJson,
        toolCall.startedAt,
        toolCall.completedAt,
        toolCall.updatedAt,
        toolCall.agentName
      ]
    );
  }

  async saveUserRequest(item: AgentHomeUserRequestItem): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_user_request (' +
        'id, session_id, provider_id, request_id, kind, title, prompt, options_json, allow_free_text, status, ' +
        'answer, selected_option_id, raw_json, created_at, updated_at, agent_name' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        item.id,
        item.sessionId,
        item.providerId,
        item.requestId,
        item.kind,
        item.title,
        item.prompt,
        item.optionsJson,
        item.allowFreeText ? 1 : 0,
        item.status,
        item.answer,
        item.selectedOptionId,
        item.rawJson,
        item.createdAt,
        item.updatedAt,
        item.agentName
      ]
    );
  }

  async savePlan(item: AgentHomePlanItem): Promise<void> {
    await this.ensureReady();
    await this.savePlanWithoutReady(item);
  }

  private async savePlanWithoutReady(item: AgentHomePlanItem): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_plan (' +
        'id, session_id, workspace_id, provider_id, plan_id, title, content, status, raw_json, created_at, updated_at, agent_name' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        item.id,
        item.sessionId,
        item.workspaceId,
        item.providerId,
        item.planId,
        item.title,
        item.content,
        item.status,
        item.rawJson,
        item.createdAt,
        item.updatedAt,
        item.agentName
      ]
    );
  }

  async replaceWorkspaceChangesForSession(sessionId: string, changes: Array<AgentHomeWorkspaceChangeItem>): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change WHERE session_id = ?', [sessionId]);
      for (let index = 0; index < changes.length; index++) {
        await this.saveWorkspaceChangeWithoutReady(changes[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace workspace changes failed: ' + e);
      throw new Error('replace workspace changes failed: ' + e);
    }
  }

  async replaceWorkspaceFilesForParent(workspaceId: string, parentPath: string, files: Array<AgentHomeWorkspaceFileItem>): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_file WHERE workspace_id = ? AND parent_path = ?', [workspaceId, parentPath]);
      for (let index = 0; index < files.length; index++) {
        await this.saveWorkspaceFileWithoutReady(files[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace workspace files failed: ' + e);
      throw new Error('replace workspace files failed: ' + e);
    }
  }

  async replaceGitCommitsForSession(sessionId: string, commits: Array<AgentHomeGitCommitItem>): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit WHERE session_id = ?', [sessionId]);
      for (let index = 0; index < commits.length; index++) {
        await this.saveGitCommitWithoutReady(commits[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace git commits failed: ' + e);
      throw new Error('replace git commits failed: ' + e);
    }
  }

  async deleteMessagesForSession(sessionId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_message WHERE session_id = ?', [sessionId]);
  }

  async deletePreviewsForSession(sessionId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_preview WHERE session_id = ?', [sessionId]);
  }

  async deleteToolCallsForSession(sessionId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_tool_call WHERE session_id = ?', [sessionId]);
  }

  async deleteSessionCascade(sessionId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_preview WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_tool_call WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_user_request WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_plan WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_message WHERE session_id = ?', [sessionId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_session WHERE id = ?', [sessionId]);
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'delete agent session failed: ' + e);
      throw new Error('delete agent session failed: ' + e);
    }
  }

  async deleteWorkspaceCascade(workspaceId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_preview WHERE session_id IN (SELECT id FROM agent_session WHERE workspace_id = ?) ' +
          'OR session_id IN (SELECT bridge_session_id FROM agent_session WHERE workspace_id = ?)',
        [workspaceId, workspaceId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_tool_call WHERE session_id IN (SELECT id FROM agent_session WHERE workspace_id = ?) ' +
          'OR session_id IN (SELECT bridge_session_id FROM agent_session WHERE workspace_id = ?)',
        [workspaceId, workspaceId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_user_request WHERE session_id IN (SELECT id FROM agent_session WHERE workspace_id = ?) ' +
          'OR session_id IN (SELECT bridge_session_id FROM agent_session WHERE workspace_id = ?)',
        [workspaceId, workspaceId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_message WHERE session_id IN (SELECT id FROM agent_session WHERE workspace_id = ?) ' +
          'OR session_id IN (SELECT bridge_session_id FROM agent_session WHERE workspace_id = ?)',
        [workspaceId, workspaceId]
      );
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit WHERE workspace_id = ?', [workspaceId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change WHERE workspace_id = ?', [workspaceId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_file WHERE workspace_id = ?', [workspaceId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_plan WHERE workspace_id = ?', [workspaceId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_session WHERE workspace_id = ?', [workspaceId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace WHERE id = ?', [workspaceId]);
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'delete agent workspace failed: ' + e);
      throw new Error('delete agent workspace failed: ' + e);
    }
  }

  async clearAll(): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_remote_session');
      await ngfRdbManager.executeSql('DELETE FROM agent_preview');
      await ngfRdbManager.executeSql('DELETE FROM agent_plan');
      await ngfRdbManager.executeSql('DELETE FROM agent_user_request');
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit');
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_file');
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change');
      await ngfRdbManager.executeSql('DELETE FROM agent_tool_call');
      await ngfRdbManager.executeSql('DELETE FROM agent_message');
      await ngfRdbManager.executeSql('DELETE FROM agent_session');
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace');
      await ngfRdbManager.executeSql('DELETE FROM agent_profile');
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'clear all agent data failed: ' + e);
      throw new Error('clear all agent data failed: ' + e);
    }
  }

  private async replaceWorkspaces(workspaces: Array<AgentHomeWorkspaceItem>): Promise<void> {
    await ngfRdbManager.executeSql('DELETE FROM agent_workspace');
    for (let index = 0; index < workspaces.length; index++) {
      await this.saveWorkspaceAt(workspaces[index], index);
    }
  }

  private async replaceSessions(sessions: Array<AgentHomeSessionItem>): Promise<void> {
    await ngfRdbManager.executeSql('DELETE FROM agent_session');
    for (let index = 0; index < sessions.length; index++) {
      await this.saveSession(sessions[index]);
    }
  }

  private async saveWorkspaceAt(workspace: AgentHomeWorkspaceItem, sortOrder: number): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace (' +
        'id, title, workspace_path, initial, accent_color, branch_name, is_online, sort_order, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        workspace.id,
        workspace.title,
        workspace.subtitle,
        workspace.initial,
        workspace.accentColor,
        workspace.branchName,
        workspace.isOnline ? 1 : 0,
        sortOrder,
        Date.now()
      ]
    );
  }

  private async loadProfile(defaultProfile: AgentHomeProfile): Promise<AgentHomeProfile> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT endpoint, token, provider_id, model_id, speed_mode, reasoning_mode, active_workspace_id, active_session_id, ' +
        'preview_path, updated_at ' +
        'FROM agent_profile WHERE profile_id = ? LIMIT 1',
      [AGENT_PROFILE_ID]
    );
    if (rows.length === 0) {
      await this.saveProfile(defaultProfile);
      return defaultProfile;
    }
    const row = rows[0];
    return new AgentHomeProfile(
      row.getString('endpoint', defaultProfile.endpoint),
      row.getString('token', defaultProfile.token),
      row.getString('provider_id', defaultProfile.providerId),
      row.getString('model_id', defaultProfile.modelId),
      row.getString('speed_mode', defaultProfile.speedMode),
      row.getString('reasoning_mode', defaultProfile.reasoningMode),
      row.getString('active_workspace_id', defaultProfile.activeWorkspaceId),
      row.getString('active_session_id', defaultProfile.activeSessionId),
      row.getString('preview_path', defaultProfile.previewPath),
      row.getNumber('updated_at', defaultProfile.updatedAt)
    );
  }

  private async loadWorkspaces(): Promise<Array<AgentHomeWorkspaceItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, title, workspace_path, initial, accent_color, branch_name, is_online ' +
        'FROM agent_workspace ORDER BY sort_order ASC, updated_at DESC'
    );
    const items: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeWorkspaceItem(
        row.getString('id', ''),
        row.getString('title', ''),
        row.getString('workspace_path', ''),
        row.getString('initial', ''),
        row.getString('accent_color', '#4F7DE8'),
        row.getString('branch_name', 'main'),
        row.getBoolean('is_online', true)
      ));
    }
    return items;
  }

  private async loadSessions(): Promise<Array<AgentHomeSessionItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, workspace_id, title, branch_name, provider_id, model_id, speed_mode, reasoning_mode, bridge_session_id, updated_at ' +
        'FROM agent_session ORDER BY updated_at DESC'
    );
    const items: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeSessionItem(
        row.getString('id', ''),
        row.getString('workspace_id', ''),
        row.getString('title', ''),
        row.getString('branch_name', 'main'),
        row.getString('provider_id', ''),
        row.getString('model_id', this.defaultModelIdForProvider(row.getString('provider_id', ''))),
        row.getString('speed_mode', 'auto'),
        row.getString('reasoning_mode', 'auto'),
        row.getString('bridge_session_id', ''),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  private async loadMessages(): Promise<Array<AgentHomeChatItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, role, title, body, message_id, reasoning_text, agent_name, duration_text, created_at ' +
        'FROM agent_message ORDER BY created_at ASC'
    );
    const items: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeChatItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('role', ''),
        row.getString('title', ''),
        row.getString('body', ''),
        row.getString('duration_text', ''),
        row.getNumber('created_at', 0),
        row.getString('reasoning_text', ''),
        row.getString('message_id', ''),
        row.getString('agent_name', '')
      ));
    }
    return items;
  }

  private async loadPreviews(): Promise<Array<AgentHomePreviewItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, path, media_type, content, updated_at ' +
        'FROM agent_preview ORDER BY updated_at DESC LIMIT 100'
    );
    const items: Array<AgentHomePreviewItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomePreviewItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('path', ''),
        row.getString('media_type', 'text/plain'),
        row.getString('content', ''),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  private async loadToolCalls(): Promise<Array<AgentHomeToolCallItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, provider_id, message_id, tool_call_id, name, status, input_text, output_text, error_text, ' +
        'raw_json, started_at, completed_at, updated_at, agent_name FROM agent_tool_call ORDER BY updated_at ASC LIMIT 500'
    );
    const items: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeToolCallItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('provider_id', ''),
        row.getString('message_id', ''),
        row.getString('tool_call_id', ''),
        row.getString('name', ''),
        row.getString('status', ''),
        row.getString('input_text', ''),
        row.getString('output_text', ''),
        row.getString('error_text', ''),
        row.getString('raw_json', ''),
        row.getNumber('started_at', 0),
        row.getNumber('completed_at', 0),
        row.getNumber('updated_at', 0),
        row.getString('agent_name', '')
      ));
    }
    return items;
  }

  private async loadWorkspaceChanges(): Promise<Array<AgentHomeWorkspaceChangeItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, path, old_path, status, staged, additions, deletions, diff_text, updated_at, item_kind, changed_file_count ' +
        'FROM agent_workspace_change ORDER BY path ASC LIMIT 1000'
    );
    const items: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeWorkspaceChangeItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('workspace_id', ''),
        row.getString('provider_id', ''),
        row.getString('path', ''),
        row.getString('old_path', ''),
        row.getString('status', ''),
        row.getBoolean('staged', false),
        row.getNumber('additions', 0),
        row.getNumber('deletions', 0),
        row.getString('diff_text', ''),
        row.getNumber('updated_at', 0),
        row.getString('item_kind', ''),
        row.getNumber('changed_file_count', 1)
      ));
    }
    return items;
  }

  private async loadWorkspaceFiles(): Promise<Array<AgentHomeWorkspaceFileItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT workspace_id, path, parent_path, name, kind, depth, size_bytes, modified_at, is_hidden, updated_at ' +
        'FROM agent_workspace_file ORDER BY depth ASC, kind ASC, name ASC LIMIT 5000'
    );
    const items: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const workspaceId = row.getString('workspace_id', '');
      const filePath = row.getString('path', '');
      items.push(new AgentHomeWorkspaceFileItem(
        workspaceId + ':' + filePath,
        workspaceId,
        filePath,
        row.getString('parent_path', ''),
        row.getString('name', ''),
        row.getString('kind', ''),
        row.getNumber('depth', 0),
        row.getNumber('size_bytes', 0),
        row.getNumber('modified_at', 0),
        row.getBoolean('is_hidden', false),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  private async loadGitCommits(): Promise<Array<AgentHomeGitCommitItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, hash, message, author, committed_at, updated_at ' +
        'FROM agent_git_commit ORDER BY committed_at DESC LIMIT 100'
    );
    const items: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeGitCommitItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('workspace_id', ''),
        row.getString('provider_id', ''),
        row.getString('hash', ''),
        row.getString('message', ''),
        row.getString('author', ''),
        row.getNumber('committed_at', 0),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  private async loadUserRequests(): Promise<Array<AgentHomeUserRequestItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, provider_id, request_id, kind, title, prompt, options_json, allow_free_text, status, ' +
        'answer, selected_option_id, raw_json, created_at, updated_at, agent_name FROM agent_user_request ORDER BY updated_at ASC LIMIT 500'
    );
    const items: Array<AgentHomeUserRequestItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeUserRequestItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('provider_id', ''),
        row.getString('request_id', ''),
        row.getString('kind', ''),
        row.getString('title', ''),
        row.getString('prompt', ''),
        row.getString('options_json', ''),
        row.getBoolean('allow_free_text', true),
        row.getString('status', ''),
        row.getString('answer', ''),
        row.getString('selected_option_id', ''),
        row.getString('raw_json', ''),
        row.getNumber('created_at', 0),
        row.getNumber('updated_at', 0),
        row.getString('agent_name', '')
      ));
    }
    return items;
  }

  private async loadPlans(): Promise<Array<AgentHomePlanItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, plan_id, title, content, status, raw_json, created_at, updated_at, agent_name ' +
        'FROM agent_plan ORDER BY updated_at ASC LIMIT 300'
    );
    const items: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomePlanItem(
        row.getString('id', ''),
        row.getString('session_id', ''),
        row.getString('workspace_id', ''),
        row.getString('provider_id', ''),
        row.getString('plan_id', ''),
        row.getString('title', ''),
        row.getString('content', ''),
        row.getString('status', ''),
        row.getString('raw_json', ''),
        row.getNumber('created_at', 0),
        row.getNumber('updated_at', 0),
        row.getString('agent_name', '')
      ));
    }
    return items;
  }

  private async saveWorkspaceChangeWithoutReady(change: AgentHomeWorkspaceChangeItem): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace_change (' +
        'id, session_id, workspace_id, provider_id, path, old_path, status, staged, additions, deletions, diff_text, updated_at, item_kind, changed_file_count' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        change.id,
        change.sessionId,
        change.workspaceId,
        change.providerId,
        change.path,
        change.oldPath,
        change.status,
        change.staged ? 1 : 0,
        change.additions,
        change.deletions,
        change.diffText,
        change.updatedAt,
        change.kind,
        change.changedFileCount
      ]
    );
  }

  private async saveWorkspaceFileWithoutReady(file: AgentHomeWorkspaceFileItem): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace_file (' +
        'workspace_id, path, parent_path, name, kind, depth, size_bytes, modified_at, is_hidden, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        file.workspaceId,
        file.path,
        file.parentPath,
        file.name,
        file.kind,
        file.depth,
        file.sizeBytes,
        file.modifiedAt,
        file.isHidden ? 1 : 0,
        file.updatedAt
      ]
    );
  }

  private async saveGitCommitWithoutReady(commit: AgentHomeGitCommitItem): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_git_commit (' +
        'id, session_id, workspace_id, provider_id, hash, message, author, committed_at, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        commit.id,
        commit.sessionId,
        commit.workspaceId,
        commit.providerId,
        commit.hash,
        commit.message,
        commit.author,
        commit.committedAt,
        commit.updatedAt
      ]
    );
  }

  private async saveRemoteSessionWithoutReady(providerId: string, session: AgentBridgeRemoteSession): Promise<void> {
    const effectiveProviderId = providerId.length > 0 ? providerId : session.providerId;
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_remote_session (' +
        'provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, model_id, ' +
        'speed_mode, reasoning_mode, status, source, message_count, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        effectiveProviderId,
        session.sessionId,
        session.remoteSessionId,
        session.title,
        session.workspacePath,
        session.workspaceTitle,
        session.branchName,
        session.modelId,
        session.speedMode,
        session.reasoningMode,
        session.status,
        session.source,
        session.messageCount,
        session.updatedAt
      ]
    );
  }

  private hasWorkspace(workspaces: Array<AgentHomeWorkspaceItem>, workspaceId: string): boolean {
    for (let index = 0; index < workspaces.length; index++) {
      if (workspaces[index].id === workspaceId) {
        return true;
      }
    }
    return false;
  }

  private hasSessionInWorkspace(
    sessions: Array<AgentHomeSessionItem>,
    sessionId: string,
    workspaceId: string
  ): boolean {
    for (let index = 0; index < sessions.length; index++) {
      const session = sessions[index];
      if (session.id === sessionId && session.workspaceId === workspaceId) {
        return true;
      }
    }
    return false;
  }

  private findFirstSessionIdForWorkspace(sessions: Array<AgentHomeSessionItem>, workspaceId: string): string {
    for (let index = 0; index < sessions.length; index++) {
      const session = sessions[index];
      if (session.workspaceId === workspaceId) {
        return session.id;
      }
    }
    return '';
  }

  private async ensureProfileSchema(): Promise<void> {
    const rows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_profile)');
    if (!this.hasColumn(rows, 'model_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN model_id TEXT');
    }
    if (!this.hasColumn(rows, 'speed_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN speed_mode TEXT');
    }
    if (!this.hasColumn(rows, 'reasoning_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN reasoning_mode TEXT');
    }
    const sessionRows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_session)');
    if (!this.hasColumn(sessionRows, 'workspace_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN workspace_id TEXT');
    }
    if (!this.hasColumn(sessionRows, 'provider_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN provider_id TEXT');
    }
    if (!this.hasColumn(sessionRows, 'model_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN model_id TEXT');
    }
    if (!this.hasColumn(sessionRows, 'speed_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN speed_mode TEXT');
    }
    if (!this.hasColumn(sessionRows, 'reasoning_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN reasoning_mode TEXT');
    }
    if (!this.hasColumn(sessionRows, 'bridge_session_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_session ADD COLUMN bridge_session_id TEXT');
    }
    await ngfRdbManager.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_agent_session_workspace ON agent_session (workspace_id)'
    );
    await ngfRdbManager.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_agent_session_provider_workspace ON agent_session (provider_id, workspace_id)'
    );
    const messageRows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_message)');
    if (!this.hasColumn(messageRows, 'reasoning_text')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN reasoning_text TEXT');
    }
    if (!this.hasColumn(messageRows, 'message_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN message_id TEXT');
    }
    if (!this.hasColumn(messageRows, 'agent_name')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN agent_name TEXT');
    }
    const schemaSqls: Array<string> = [];
    this.pushRemoteSessionSchemaSqls(schemaSqls);
    this.pushWorkspaceSchemaSqls(schemaSqls);
    for (let index = 0; index < schemaSqls.length; index++) {
      await ngfRdbManager.executeSql(schemaSqls[index]);
    }
    const remoteSessionRows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_remote_session)');
    if (!this.hasColumn(remoteSessionRows, 'reasoning_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_remote_session ADD COLUMN reasoning_mode TEXT');
    }
    await this.ensureAgentNameColumn('agent_tool_call');
    await this.ensureAgentNameColumn('agent_user_request');
    await this.ensureAgentNameColumn('agent_plan');
    await this.ensureWorkspaceChangeSchema();
  }

  private pushWorkspaceSchemaSqls(sqls: Array<string>): void {
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_tool_call (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'provider_id TEXT, ' +
        'message_id TEXT, ' +
        'tool_call_id TEXT, ' +
        'name TEXT, ' +
        'status TEXT, ' +
        'input_text TEXT, ' +
        'output_text TEXT, ' +
        'error_text TEXT, ' +
        'raw_json TEXT, ' +
        'started_at INTEGER, ' +
        'completed_at INTEGER, ' +
        'updated_at INTEGER, ' +
        'agent_name TEXT' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_tool_call_session ON agent_tool_call (session_id, updated_at)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_tool_call_provider ON agent_tool_call (provider_id, session_id)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_user_request (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'provider_id TEXT, ' +
        'request_id TEXT, ' +
        'kind TEXT, ' +
        'title TEXT, ' +
        'prompt TEXT, ' +
        'options_json TEXT, ' +
        'allow_free_text INTEGER, ' +
        'status TEXT, ' +
        'answer TEXT, ' +
        'selected_option_id TEXT, ' +
        'raw_json TEXT, ' +
        'created_at INTEGER, ' +
        'updated_at INTEGER, ' +
        'agent_name TEXT' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_user_request_session ON agent_user_request (session_id, updated_at)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_user_request_provider ON agent_user_request (provider_id, session_id)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_plan (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'workspace_id TEXT, ' +
        'provider_id TEXT, ' +
        'plan_id TEXT, ' +
        'title TEXT, ' +
        'content TEXT, ' +
        'status TEXT, ' +
        'raw_json TEXT, ' +
        'created_at INTEGER, ' +
        'updated_at INTEGER, ' +
        'agent_name TEXT' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_plan_session ON agent_plan (session_id, updated_at)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_plan_workspace ON agent_plan (workspace_id, provider_id)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_workspace_change (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'workspace_id TEXT, ' +
        'provider_id TEXT, ' +
        'path TEXT, ' +
        'old_path TEXT, ' +
        'status TEXT, ' +
        'staged INTEGER, ' +
        'additions INTEGER, ' +
        'deletions INTEGER, ' +
        'diff_text TEXT, ' +
        'updated_at INTEGER, ' +
        'item_kind TEXT, ' +
        'changed_file_count INTEGER' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_workspace_change_session ON agent_workspace_change (session_id, path)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_workspace_change_workspace ON agent_workspace_change (workspace_id, provider_id)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_workspace_file (' +
        'workspace_id TEXT, ' +
        'path TEXT, ' +
        'parent_path TEXT, ' +
        'name TEXT, ' +
        'kind TEXT, ' +
        'depth INTEGER, ' +
        'size_bytes INTEGER, ' +
        'modified_at INTEGER, ' +
        'is_hidden INTEGER, ' +
        'updated_at INTEGER, ' +
        'PRIMARY KEY (workspace_id, path)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_workspace_file_parent ON agent_workspace_file (workspace_id, parent_path, kind, name)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_git_commit (' +
        'id TEXT PRIMARY KEY, ' +
        'session_id TEXT, ' +
        'workspace_id TEXT, ' +
        'provider_id TEXT, ' +
        'hash TEXT, ' +
        'message TEXT, ' +
        'author TEXT, ' +
        'committed_at INTEGER, ' +
        'updated_at INTEGER' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_git_commit_session ON agent_git_commit (session_id, committed_at)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_git_commit_workspace ON agent_git_commit (workspace_id, provider_id)');
  }

  private pushRemoteSessionSchemaSqls(sqls: Array<string>): void {
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_remote_session (' +
        'provider_id TEXT, ' +
        'session_id TEXT, ' +
        'remote_session_id TEXT, ' +
        'title TEXT, ' +
        'workspace_path TEXT, ' +
        'workspace_title TEXT, ' +
        'branch_name TEXT, ' +
        'model_id TEXT, ' +
        'speed_mode TEXT, ' +
        'reasoning_mode TEXT, ' +
        'status TEXT, ' +
        'source TEXT, ' +
        'message_count INTEGER, ' +
        'updated_at INTEGER, ' +
        'PRIMARY KEY (provider_id, session_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_remote_session_provider ON agent_remote_session (provider_id, updated_at)');
  }

  private hasColumn(rows: Array<NGFRdbRow>, columnName: string): boolean {
    for (let index = 0; index < rows.length; index++) {
      if (rows[index].getString('name', '') === columnName) {
        return true;
      }
    }
    return false;
  }

  private async ensureAgentNameColumn(tableName: string): Promise<void> {
    const rows = await ngfRdbManager.queryRows('PRAGMA table_info(' + tableName + ')');
    if (!this.hasColumn(rows, 'agent_name')) {
      await ngfRdbManager.executeSql('ALTER TABLE ' + tableName + ' ADD COLUMN agent_name TEXT');
    }
  }

  private async ensureWorkspaceChangeSchema(): Promise<void> {
    const rows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_workspace_change)');
    if (!this.hasColumn(rows, 'item_kind')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN item_kind TEXT');
    }
    if (!this.hasColumn(rows, 'changed_file_count')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN changed_file_count INTEGER');
    }
  }

  private defaultModelIdForProvider(providerId: string): string {
    if (providerId.length === 0 || providerId === AgentBridgeProviderId.MOCK) {
      return 'mock-fast';
    }
    return 'configured';
  }

  private async ensureReady(): Promise<void> {
    if (this.isInitialized && ngfRdbManager.isReadyForStore(AGENT_DB_NAME)) {
      return;
    }
    const initialized = await this.initialize();
    if (!initialized) {
      throw new Error('Agent home database is not available.');
    }
  }
}
