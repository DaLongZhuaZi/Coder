import { logger, NGFRdbConfig, NGFRdbRow, ngfRdbManager } from 'ngf_framework';
import {
  AgentBridgeAgentRecord,
  AgentBridgeAgentTimelineRecord,
  AgentBridgeIncomingParser,
  AgentBridgeProjectRecord,
  AgentBridgeRemoteSession,
  AgentBridgeServerInfo,
  AgentBridgeTerminalSession,
  AgentBridgeTerminalState,
  AgentBridgeTrustState,
  AgentBridgeTrustedDevice,
  AgentBridgeWorkspaceRecord
} from '../agentBridge/AgentBridgeModels';
import {
  AgentHomeBootstrapState,
  AgentHomeChatItem,
  AgentHomeGitCommitItem,
  AgentHomeHostIdentityStatus,
  AgentHomeHostProfile,
  AgentHomeHostSnapshot,
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
export const AGENT_LEGACY_HOST_PROFILE_ID: string = 'host_legacy_default';
const AGENT_HOST_MIGRATION_VERSION: number = 1;
const AGENT_HOST_SCOPED_TABLES: Array<string> = [
  'agent_workspace',
  'agent_session',
  'agent_message',
  'agent_preview',
  'agent_remote_session',
  'agent_tool_call',
  'agent_user_request',
  'agent_plan',
  'agent_workspace_change',
  'agent_workspace_file',
  'agent_git_commit'
];

export class AgentHomePersistenceRepository {
  private isInitialized: boolean = false;

  private scopedLocalId(hostProfileId: string, value: string): string {
    if (hostProfileId.length === 0 || hostProfileId === AGENT_LEGACY_HOST_PROFILE_ID || value.length === 0) {
      return value;
    }
    return hostProfileId + '::' + value;
  }

  private logicalLocalId(hostProfileId: string, value: string): string {
    const prefix = hostProfileId + '::';
    return value.startsWith(prefix) ? value.substring(prefix.length) : value;
  }

  async initialize(): Promise<boolean> {
    if (ngfRdbManager.isReadyForStore(AGENT_DB_NAME)) {
      this.isInitialized = true;
      await this.ensureProfileSchema();
      await this.ensureHostProfileSchema();
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
        'active_device_id TEXT, ' +
        'last_device_id TEXT, ' +
        'updated_at INTEGER' +
      ')'
    );
    this.pushDeviceSchemaSqls(createSqls);
    this.pushDaemonSchemaSqls(createSqls);
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
        'content_nodes_json TEXT, ' +
        'timeline_epoch INTEGER, ' +
        'timeline_seq INTEGER, ' +
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
      await this.ensureHostProfileSchema();
    }
    return initialized;
  }

  async loadHostProfiles(): Promise<Array<AgentHomeHostProfile>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT host_profile_id, display_name, endpoint, credential_alias, credential_digest, provider_id, model_id, ' +
        'speed_mode, reasoning_mode, active_workspace_id, active_session_id, preview_path, last_device_id, last_server_id, ' +
        'auto_connect_on_launch, identity_status, created_at, updated_at, last_used_at ' +
        'FROM agent_host_profile ORDER BY last_used_at DESC, created_at ASC'
    );
    const items: Array<AgentHomeHostProfile> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeHostProfile(
        row.getString('host_profile_id', ''),
        row.getString('display_name', ''),
        row.getString('endpoint', ''),
        row.getString('credential_alias', ''),
        row.getString('credential_digest', ''),
        row.getString('provider_id', ''),
        row.getString('model_id', ''),
        row.getString('speed_mode', ''),
        row.getString('reasoning_mode', ''),
        row.getString('active_workspace_id', ''),
        row.getString('active_session_id', ''),
        row.getString('preview_path', ''),
        row.getString('last_device_id', ''),
        row.getString('last_server_id', ''),
        row.getNumber('auto_connect_on_launch', 1) === 1,
        row.getString('identity_status', AgentHomeHostIdentityStatus.UNBOUND),
        row.getNumber('created_at', 0),
        row.getNumber('updated_at', 0),
        row.getNumber('last_used_at', 0)
      ));
    }
    return items;
  }

  async saveHostProfile(profile: AgentHomeHostProfile): Promise<void> {
    await this.ensureReady();
    await this.saveHostProfileWithoutReady(profile);
  }

  async saveHostProfileWithCredentialRotation(
    profile: AgentHomeHostProfile,
    previousCredentialAlias: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await this.saveHostProfileWithoutReady(profile);
      if (previousCredentialAlias.length > 0 && previousCredentialAlias !== profile.credentialAlias) {
        await this.queueCredentialGarbageCollectionWithoutReady(previousCredentialAlias);
      }
      await ngfRdbManager.commit();
    } catch (error) {
      await ngfRdbManager.rollback();
      throw new Error('save host profile credential rotation failed: ' + error);
    }
  }

  async loadActiveHostProfileId(): Promise<string> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT active_host_profile_id FROM agent_profile WHERE profile_id = ?',
      [AGENT_PROFILE_ID]
    );
    return rows.length > 0 ? rows[0].getString('active_host_profile_id', '') : '';
  }

  async saveActiveHostProfileId(hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'UPDATE agent_profile SET active_host_profile_id = ?, updated_at = ? WHERE profile_id = ?',
      [hostProfileId, Date.now(), AGENT_PROFILE_ID]
    );
  }

  async hostMigrationVersion(): Promise<number> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT host_migration_version FROM agent_profile WHERE profile_id = ?',
      [AGENT_PROFILE_ID]
    );
    return rows.length > 0 ? rows[0].getNumber('host_migration_version', 0) : 0;
  }

  async migrateLegacyHostProfile(profile: AgentHomeHostProfile): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await this.saveHostProfileWithoutReady(profile);
      for (let index = 0; index < AGENT_HOST_SCOPED_TABLES.length; index++) {
        const tableName = AGENT_HOST_SCOPED_TABLES[index];
        await ngfRdbManager.executeSql(
          'UPDATE ' + tableName + ' SET host_profile_id = ? WHERE host_profile_id IS NULL OR host_profile_id = ""',
          [profile.hostProfileId]
        );
      }
      await ngfRdbManager.executeSql(
        'UPDATE agent_profile SET token = "", active_host_profile_id = ?, host_migration_version = ?, updated_at = ? ' +
          'WHERE profile_id = ?',
        [profile.hostProfileId, AGENT_HOST_MIGRATION_VERSION, Date.now(), AGENT_PROFILE_ID]
      );
      await ngfRdbManager.commit();
    } catch (error) {
      await ngfRdbManager.rollback();
      throw new Error('migrate legacy host profile failed: ' + error);
    }
  }

  async queueCredentialGarbageCollection(alias: string): Promise<void> {
    await this.ensureReady();
    await this.queueCredentialGarbageCollectionWithoutReady(alias);
  }

  private async queueCredentialGarbageCollectionWithoutReady(alias: string): Promise<void> {
    if (alias.length === 0) {
      return;
    }
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_host_credential_gc (credential_alias, queued_at) VALUES (?, ?)',
      [alias, Date.now()]
    );
  }

  async loadCredentialGarbageCollection(): Promise<Array<string>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT credential_alias FROM agent_host_credential_gc ORDER BY queued_at ASC'
    );
    const items: Array<string> = [];
    for (let index = 0; index < rows.length; index++) {
      items.push(rows[index].getString('credential_alias', ''));
    }
    return items;
  }

  async removeCredentialGarbageCollection(alias: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_host_credential_gc WHERE credential_alias = ?', [alias]);
  }

  async deleteHostProfile(hostProfileId: string, credentialAlias: string): Promise<void> {
    await this.ensureReady();
    if (hostProfileId.length === 0) {
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < AGENT_HOST_SCOPED_TABLES.length; index++) {
        await ngfRdbManager.executeSql(
          'DELETE FROM ' + AGENT_HOST_SCOPED_TABLES[index] + ' WHERE host_profile_id = ?',
          [hostProfileId]
        );
      }
      await ngfRdbManager.executeSql('DELETE FROM agent_host_profile WHERE host_profile_id = ?', [hostProfileId]);
      await ngfRdbManager.executeSql(
        'UPDATE agent_profile SET active_host_profile_id = "", updated_at = ? WHERE active_host_profile_id = ?',
        [Date.now(), hostProfileId]
      );
      await this.queueCredentialGarbageCollectionWithoutReady(credentialAlias);
      await ngfRdbManager.commit();
    } catch (error) {
      await ngfRdbManager.rollback();
      throw new Error('delete host profile failed: ' + error);
    }
  }

  async loadOrCreate(defaultState: AgentHomeBootstrapState): Promise<AgentHomeStateSnapshot> {
    await this.ensureReady();

    let workspaces = await this.loadWorkspaces(AGENT_LEGACY_HOST_PROFILE_ID);
    if (workspaces.length === 0) {
      workspaces = defaultState.workspaces;
      await this.replaceWorkspaces(workspaces, AGENT_LEGACY_HOST_PROFILE_ID);
    }

    let sessions = await this.loadSessions(AGENT_LEGACY_HOST_PROFILE_ID);
    if (sessions.length === 0) {
      sessions = defaultState.sessions;
      await this.replaceSessions(sessions, AGENT_LEGACY_HOST_PROFILE_ID);
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
        Date.now(),
        profile.activeDeviceId,
        profile.lastDeviceId
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
        Date.now(),
        profile.activeDeviceId,
        profile.lastDeviceId
      );
      profileChanged = true;
    }

    if (profileChanged) {
      await this.saveProfile(profile);
    }

    const messages = await this.loadMessages(AGENT_LEGACY_HOST_PROFILE_ID);
    const previews = await this.loadPreviews(AGENT_LEGACY_HOST_PROFILE_ID);
    const toolCalls = await this.loadToolCalls(AGENT_LEGACY_HOST_PROFILE_ID);
    const changes = await this.loadWorkspaceChanges(AGENT_LEGACY_HOST_PROFILE_ID);
    const files = await this.loadWorkspaceFiles(AGENT_LEGACY_HOST_PROFILE_ID);
    const commits = await this.loadGitCommits(AGENT_LEGACY_HOST_PROFILE_ID);
    const userRequests = await this.loadUserRequests(AGENT_LEGACY_HOST_PROFILE_ID);
    const plans = await this.loadPlans(AGENT_LEGACY_HOST_PROFILE_ID);
    const trustedDevices = await this.loadTrustedDevices();
    return new AgentHomeStateSnapshot(
      profile,
      workspaces,
      sessions,
      messages,
      previews,
      toolCalls,
      changes,
      files,
      commits,
      userRequests,
      plans,
      trustedDevices
    );
  }

  async loadHostSnapshot(hostProfile: AgentHomeHostProfile): Promise<AgentHomeHostSnapshot> {
    await this.ensureReady();
    const snapshot = new AgentHomeHostSnapshot(hostProfile);
    snapshot.workspaces = await this.loadWorkspaces(hostProfile.hostProfileId);
    snapshot.sessions = await this.loadSessions(hostProfile.hostProfileId);
    snapshot.messages = await this.loadMessages(hostProfile.hostProfileId);
    snapshot.previews = await this.loadPreviews(hostProfile.hostProfileId);
    snapshot.toolCalls = await this.loadToolCalls(hostProfile.hostProfileId);
    snapshot.changes = await this.loadWorkspaceChanges(hostProfile.hostProfileId);
    snapshot.files = await this.loadWorkspaceFiles(hostProfile.hostProfileId);
    snapshot.commits = await this.loadGitCommits(hostProfile.hostProfileId);
    snapshot.userRequests = await this.loadUserRequests(hostProfile.hostProfileId);
    snapshot.plans = await this.loadPlans(hostProfile.hostProfileId);
    return snapshot;
  }

  async saveProfile(profile: AgentHomeProfile): Promise<void> {
    await this.ensureReady();
    const existingRows = await ngfRdbManager.queryRows(
      'SELECT active_host_profile_id, host_migration_version FROM agent_profile WHERE profile_id = ?',
      [AGENT_PROFILE_ID]
    );
    const activeHostProfileId = existingRows.length > 0 ? existingRows[0].getString('active_host_profile_id', '') : '';
    const migrationVersion = existingRows.length > 0 ? existingRows[0].getNumber('host_migration_version', 0) : 0;
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_profile (' +
        'profile_id, endpoint, token, provider_id, model_id, speed_mode, reasoning_mode, active_workspace_id, active_session_id, ' +
        'preview_path, active_device_id, last_device_id, updated_at, active_host_profile_id, host_migration_version' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        AGENT_PROFILE_ID,
        profile.endpoint,
        migrationVersion >= AGENT_HOST_MIGRATION_VERSION ? '' : profile.token,
        profile.providerId,
        profile.modelId,
        profile.speedMode,
        profile.reasoningMode,
        profile.activeWorkspaceId,
        profile.activeSessionId,
        profile.previewPath,
        profile.activeDeviceId,
        profile.lastDeviceId,
        profile.updatedAt,
        activeHostProfileId,
        migrationVersion
      ]
    );
  }

  async saveWorkspace(workspace: AgentHomeWorkspaceItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await this.saveWorkspaceAt(workspace, 0, hostProfileId);
  }

  async saveSession(session: AgentHomeSessionItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_session (' +
        'id, workspace_id, title, branch_name, provider_id, model_id, speed_mode, reasoning_mode, bridge_session_id, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, session.id),
        this.scopedLocalId(hostProfileId, session.workspaceId),
        session.title,
        session.branchName,
        session.providerId,
        session.modelId,
        session.speedMode,
        session.reasoningMode,
        session.bridgeSessionId,
        session.updatedAt,
        hostProfileId
      ]
    );
  }

  async loadTrustedDevices(): Promise<Array<AgentBridgeTrustedDevice>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT device_id, bridge_instance_id, display_name, platform, public_key_pem, public_key_fingerprint, ' +
        'last_endpoint, token_digest, trust_state, first_trusted_at, last_seen_at ' +
        'FROM agent_bridge_device ORDER BY last_seen_at DESC'
    );
    const items: Array<AgentBridgeTrustedDevice> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentBridgeTrustedDevice(
        row.getString('device_id', ''),
        row.getString('bridge_instance_id', ''),
        row.getString('display_name', ''),
        row.getString('platform', ''),
        row.getString('public_key_pem', ''),
        row.getString('public_key_fingerprint', ''),
        row.getString('last_endpoint', ''),
        row.getString('token_digest', ''),
        row.getString('trust_state', AgentBridgeTrustState.UNKNOWN),
        row.getNumber('first_trusted_at', 0),
        row.getNumber('last_seen_at', 0)
      ));
    }
    return items;
  }

  async saveTrustedDevice(device: AgentBridgeTrustedDevice): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_bridge_device (' +
        'device_id, bridge_instance_id, display_name, platform, public_key_pem, public_key_fingerprint, ' +
        'last_endpoint, token_digest, trust_state, first_trusted_at, last_seen_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        device.deviceId,
        device.bridgeInstanceId,
        device.displayName,
        device.platform,
        device.publicKeyPem,
        device.publicKeyFingerprint,
        device.lastEndpoint,
        device.tokenDigest,
        device.trustState,
        device.firstTrustedAt,
        device.lastSeenAt
      ]
    );
  }

  async deleteTrustedDevice(deviceId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_bridge_device WHERE device_id = ?', [deviceId]);
  }

  async migrateLegacyRemoteSessionsToDevice(deviceId: string): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0) {
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_remote_session WHERE device_id = "" AND EXISTS (' +
          'SELECT 1 FROM agent_remote_session AS target ' +
          'WHERE target.device_id = ? AND target.provider_id = agent_remote_session.provider_id ' +
          'AND target.session_id = agent_remote_session.session_id' +
        ')',
        [deviceId]
      );
      await ngfRdbManager.executeSql('UPDATE agent_remote_session SET device_id = ? WHERE device_id = ""', [deviceId]);
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'migrate legacy remote sessions failed: ' + e);
      throw new Error('migrate legacy remote sessions failed: ' + e);
    }
  }

  async loadRemoteSessions(hostProfileId: string): Promise<Array<AgentBridgeRemoteSession>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT device_id, provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, model_id, ' +
        'speed_mode, reasoning_mode, status, source, message_count, updated_at ' +
        'FROM agent_remote_session WHERE host_profile_id = ? ORDER BY updated_at DESC',
      [hostProfileId]
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
        row.getNumber('updated_at', 0),
        row.getString('device_id', '')
      ));
    }
    return items;
  }

  async replaceRemoteSessionsForProvider(
    providerId: string,
    sessions: Array<AgentBridgeRemoteSession>,
    deviceId: string,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_remote_session WHERE device_id = ? AND provider_id = ? AND host_profile_id = ?',
        [deviceId, providerId, hostProfileId]
      );
      for (let index = 0; index < sessions.length; index++) {
        await this.saveRemoteSessionWithoutReady(providerId, sessions[index], deviceId, hostProfileId);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace remote sessions failed: ' + e);
      throw new Error('replace remote sessions failed: ' + e);
    }
  }

  async saveRemoteSession(
    providerId: string,
    session: AgentBridgeRemoteSession,
    deviceId: string,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await this.saveRemoteSessionWithoutReady(providerId, session, deviceId, hostProfileId);
  }

  async saveDaemonServer(deviceId: string, serverInfo: AgentBridgeServerInfo, endpoint: string): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverInfo.serverId.length === 0) {
      logger.warn(TAG, 'save daemon server ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_daemon_server (' +
        'device_id, server_id, hostname, version, protocol_version, features_json, last_endpoint, last_seen_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        deviceId,
        serverInfo.serverId,
        serverInfo.hostname,
        serverInfo.version,
        serverInfo.protocolVersion,
        serverInfo.featuresJson,
        endpoint,
        Date.now()
      ]
    );
  }

  async saveProviderCatalogSnapshot(
    deviceId: string,
    serverId: string,
    scope: string,
    cwd: string,
    providersJson: string,
    cacheStatus: string,
    updatedAt: number
  ): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      logger.warn(TAG, 'save provider catalog ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_provider_catalog (' +
        'device_id, server_id, scope, cwd, providers_json, cache_status, updated_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        deviceId,
        serverId,
        scope.length > 0 ? scope : 'global',
        cwd,
        providersJson,
        cacheStatus,
        updatedAt > 0 ? updatedAt : Date.now()
      ]
    );
  }

  async saveAgentRecord(deviceId: string, serverId: string, agent: AgentBridgeAgentRecord): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0 || agent.id.length === 0) {
      logger.warn(TAG, 'save v2 agent ignored: missing trusted device, server, or agent id');
      return;
    }
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_v2 (' +
        'device_id, server_id, agent_id, provider_id, workspace_id, cwd, provider_session_id, remote_session_id, title, ' +
        'config_json, runtime_info_json, persistence_json, features_json, last_status, model_id, mode_id, thinking_option_id, ' +
        'requires_attention, attention_reason, last_error, timeline_size, latest_seq, timeline_ack_json, archived_at, created_at, ' +
        'updated_at, last_activity_at, last_user_message_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        deviceId,
        serverId,
        agent.id,
        agent.provider,
        agent.workspaceId,
        agent.cwd,
        agent.providerSessionId,
        agent.remoteSessionId,
        agent.title,
        agent.configJson,
        agent.runtimeInfoJson,
        agent.persistenceJson,
        agent.featuresJson,
        agent.lastStatus,
        agent.modelId,
        agent.lastModeId,
        agent.thinkingOptionId,
        agent.requiresAttention ? 1 : 0,
        agent.attentionReason,
        agent.lastError,
        agent.timelineSize,
        agent.latestSeq,
        agent.timelineAckJson,
        agent.archivedAt,
        agent.createdAt,
        agent.updatedAt,
        agent.lastActivityAt,
        agent.lastUserMessageAt
      ]
    );
  }

  async saveAgentRecords(deviceId: string, serverId: string, agents: Array<AgentBridgeAgentRecord>): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      logger.warn(TAG, 'save v2 agents ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < agents.length; index++) {
        await this.saveAgentRecordWithoutReady(deviceId, serverId, agents[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'save v2 agents failed: ' + e);
      throw new Error('save v2 agents failed: ' + e);
    }
  }

  async saveAgentTimelineItems(
    deviceId: string,
    serverId: string,
    agentId: string,
    items: Array<AgentBridgeAgentTimelineRecord>
  ): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0 || agentId.length === 0) {
      logger.warn(TAG, 'save v2 timeline ignored: missing trusted device, server, or agent id');
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < items.length; index++) {
        await this.saveAgentTimelineItemWithoutReady(deviceId, serverId, agentId, items[index]);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'save v2 timeline failed: ' + e);
      throw new Error('save v2 timeline failed: ' + e);
    }
  }

  async loadAgentTimelineCursor(deviceId: string, serverId: string, agentId: string): Promise<number> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0 || agentId.length === 0) {
      return 0;
    }
    const rows = await ngfRdbManager.queryRows(
      'SELECT MAX(seq) AS latest_seq FROM agent_timeline_v2 WHERE device_id = ? AND server_id = ? AND agent_id = ?',
      [deviceId, serverId, agentId]
    );
    if (rows.length === 0) {
      return 0;
    }
    return rows[0].getNumber('latest_seq', 0);
  }

  async saveProjectRecords(deviceId: string, serverId: string, projects: Array<AgentBridgeProjectRecord>): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      logger.warn(TAG, 'save project registry ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < projects.length; index++) {
        const item = projects[index];
        await ngfRdbManager.executeSql(
          'INSERT OR REPLACE INTO agent_project_registry (' +
            'device_id, server_id, project_id, root_path, kind, display_name, archived_at, created_at, updated_at' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            deviceId,
            serverId,
            item.projectId,
            item.rootPath,
            item.kind,
            item.displayName,
            item.archivedAt,
            item.createdAt,
            item.updatedAt
          ]
        );
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'save project registry failed: ' + e);
      throw new Error('save project registry failed: ' + e);
    }
  }

  async loadProjectRecords(deviceId: string, serverId: string): Promise<Array<AgentBridgeProjectRecord>> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      return [];
    }
    const rows = await ngfRdbManager.queryRows(
      'SELECT project_id, root_path, kind, display_name, archived_at, created_at, updated_at ' +
        'FROM agent_project_registry WHERE device_id = ? AND server_id = ? ORDER BY updated_at DESC',
      [deviceId, serverId]
    );
    const items: Array<AgentBridgeProjectRecord> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const item = new AgentBridgeProjectRecord();
      item.projectId = row.getString('project_id', '');
      item.rootPath = row.getString('root_path', '');
      item.kind = row.getString('kind', '');
      item.displayName = row.getString('display_name', '');
      item.archivedAt = row.getString('archived_at', '');
      item.createdAt = row.getString('created_at', '');
      item.updatedAt = row.getString('updated_at', '');
      items.push(item);
    }
    return items;
  }

  async saveWorkspaceRecords(deviceId: string, serverId: string, workspaces: Array<AgentBridgeWorkspaceRecord>): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      logger.warn(TAG, 'save workspace registry ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < workspaces.length; index++) {
        const item = workspaces[index];
        await ngfRdbManager.executeSql(
          'INSERT OR REPLACE INTO agent_workspace_registry (' +
            'device_id, server_id, workspace_id, project_id, cwd, kind, display_name, title, branch, archived_at, created_at, updated_at' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            deviceId,
            serverId,
            item.workspaceId,
            item.projectId,
            item.cwd,
            item.kind,
            item.displayName,
            item.title,
            item.branch,
            item.archivedAt,
            item.createdAt,
            item.updatedAt
          ]
        );
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'save workspace registry failed: ' + e);
      throw new Error('save workspace registry failed: ' + e);
    }
  }

  async loadWorkspaceRecords(deviceId: string, serverId: string): Promise<Array<AgentBridgeWorkspaceRecord>> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      return [];
    }
    const rows = await ngfRdbManager.queryRows(
      'SELECT workspace_id, project_id, cwd, kind, display_name, title, branch, archived_at, created_at, updated_at ' +
        'FROM agent_workspace_registry WHERE device_id = ? AND server_id = ? ORDER BY updated_at DESC',
      [deviceId, serverId]
    );
    const items: Array<AgentBridgeWorkspaceRecord> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const item = new AgentBridgeWorkspaceRecord();
      item.workspaceId = row.getString('workspace_id', '');
      item.projectId = row.getString('project_id', '');
      item.cwd = row.getString('cwd', '');
      item.workspacePath = item.cwd;
      item.kind = row.getString('kind', '');
      item.displayName = row.getString('display_name', '');
      item.title = row.getString('title', '');
      item.branch = row.getString('branch', '');
      item.archivedAt = row.getString('archived_at', '');
      item.createdAt = row.getString('created_at', '');
      item.updatedAt = row.getString('updated_at', '');
      items.push(item);
    }
    return items;
  }

  async saveTerminalSnapshots(deviceId: string, serverId: string, terminals: Array<AgentBridgeTerminalSession>): Promise<void> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      logger.warn(TAG, 'save terminal snapshots ignored: missing trusted device or server id');
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      for (let index = 0; index < terminals.length; index++) {
        const item = terminals[index];
        if (item.terminal.terminalId.length === 0) {
          continue;
        }
        await ngfRdbManager.executeSql(
          'INSERT OR REPLACE INTO agent_terminal_snapshot (' +
            'device_id, server_id, terminal_id, workspace_id, cwd, name, status, rows, cols, snapshot_json, updated_at' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            deviceId,
            serverId,
            item.terminal.terminalId,
            item.terminal.workspaceId,
            item.terminal.cwd,
            item.terminal.name,
            item.terminal.status,
            item.terminal.rows,
            item.terminal.cols,
            this.terminalSnapshotJson(item),
            item.terminal.updatedAt > 0 ? item.terminal.updatedAt : Date.now()
          ]
        );
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'save terminal snapshots failed: ' + e);
      throw new Error('save terminal snapshots failed: ' + e);
    }
  }

  async loadTerminalSnapshots(deviceId: string, serverId: string, workspaceId: string = ''): Promise<Array<AgentBridgeTerminalSession>> {
    await this.ensureReady();
    if (deviceId.length === 0 || serverId.length === 0) {
      return [];
    }
    const rows = workspaceId.length > 0 ?
      await ngfRdbManager.queryRows(
        'SELECT terminal_id, workspace_id, cwd, name, status, rows, cols, snapshot_json, updated_at FROM agent_terminal_snapshot ' +
          'WHERE device_id = ? AND server_id = ? AND workspace_id = ? ORDER BY updated_at DESC',
        [deviceId, serverId, workspaceId]
      ) :
      await ngfRdbManager.queryRows(
        'SELECT terminal_id, workspace_id, cwd, name, status, rows, cols, snapshot_json, updated_at FROM agent_terminal_snapshot ' +
          'WHERE device_id = ? AND server_id = ? ORDER BY updated_at DESC',
        [deviceId, serverId]
      );
    const items: Array<AgentBridgeTerminalSession> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const terminal = new AgentBridgeTerminalState();
      terminal.terminalId = row.getString('terminal_id', '');
      terminal.workspaceId = row.getString('workspace_id', '');
      terminal.cwd = row.getString('cwd', '');
      terminal.name = row.getString('name', '');
      terminal.status = row.getString('status', '');
      terminal.rows = row.getNumber('rows', 0);
      terminal.cols = row.getNumber('cols', 0);
      terminal.updatedAt = row.getNumber('updated_at', 0);
      const snapshotJson = row.getString('snapshot_json', '');
      this.applyTerminalSnapshotJson(terminal, snapshotJson);
      const session = new AgentBridgeTerminalSession();
      session.terminal = terminal;
      session.desiredSubscription = AgentBridgeIncomingParser.extractBooleanProperty(snapshotJson, 'desiredSubscription');
      session.lastAppliedRestoreSeq = AgentBridgeIncomingParser.extractNumberProperty(snapshotJson, 'lastAppliedRestoreSeq', 0);
      session.lastAppliedSnapshotSeq = AgentBridgeIncomingParser.extractNumberProperty(snapshotJson, 'lastAppliedSnapshotSeq', 0);
      items.push(session);
    }
    return items;
  }

  async deleteRemoteSessionCache(
    providerId: string,
    sessionId: string,
    remoteSessionId: string,
    deviceId: string,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    if (sessionId.length === 0 && remoteSessionId.length === 0) {
      logger.warn(TAG, 'delete remote session cache ignored: empty ids');
      return;
    }
    logger.info(TAG, 'delete remote session cache start: providerId=' + providerId +
      ', sessionId=' + sessionId +
      ', remoteSessionId=' + remoteSessionId);
    if (providerId.length > 0) {
      if (sessionId.length > 0) {
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_remote_session WHERE device_id = ? AND provider_id = ? AND host_profile_id = ? AND (session_id = ? OR remote_session_id = ?)',
          [deviceId, providerId, hostProfileId, sessionId, sessionId]
        );
      }
      if (remoteSessionId.length > 0 && remoteSessionId !== sessionId) {
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_remote_session WHERE device_id = ? AND provider_id = ? AND host_profile_id = ? AND (session_id = ? OR remote_session_id = ?)',
          [deviceId, providerId, hostProfileId, remoteSessionId, remoteSessionId]
        );
      }
    } else {
      if (sessionId.length > 0) {
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_remote_session WHERE device_id = ? AND host_profile_id = ? AND (session_id = ? OR remote_session_id = ?)',
          [deviceId, hostProfileId, sessionId, sessionId]
        );
      }
      if (remoteSessionId.length > 0 && remoteSessionId !== sessionId) {
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_remote_session WHERE device_id = ? AND host_profile_id = ? AND (session_id = ? OR remote_session_id = ?)',
          [deviceId, hostProfileId, remoteSessionId, remoteSessionId]
        );
      }
    }
    logger.info(TAG, 'delete remote session cache done: providerId=' + providerId +
      ', sessionId=' + sessionId +
      ', remoteSessionId=' + remoteSessionId);
  }

  async replaceWorkspaceSessionState(
    workspaces: Array<AgentHomeWorkspaceItem>,
    sessions: Array<AgentHomeSessionItem>,
    oldWorkspaceIds: Array<string>,
    newWorkspaceIds: Array<string>,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await this.replaceWorkspaces(workspaces, hostProfileId);
      await this.replaceSessions(sessions, hostProfileId);
      for (let index = 0; index < oldWorkspaceIds.length; index++) {
        const oldWorkspaceId = this.scopedLocalId(hostProfileId, oldWorkspaceIds[index]);
        const newWorkspaceId = this.scopedLocalId(hostProfileId, newWorkspaceIds[index]);
        await ngfRdbManager.executeSql(
          'UPDATE agent_workspace_change SET workspace_id = ? WHERE workspace_id = ? AND host_profile_id = ?',
          [newWorkspaceId, oldWorkspaceId, hostProfileId]
        );
        await ngfRdbManager.executeSql(
          'DELETE FROM agent_workspace_file WHERE workspace_id = ? AND host_profile_id = ? AND EXISTS (' +
            'SELECT 1 FROM agent_workspace_file AS target ' +
            'WHERE target.workspace_id = ? AND target.host_profile_id = ? AND target.path = agent_workspace_file.path' +
          ')',
          [oldWorkspaceId, hostProfileId, newWorkspaceId, hostProfileId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_workspace_file SET workspace_id = ? WHERE workspace_id = ? AND host_profile_id = ?',
          [newWorkspaceId, oldWorkspaceId, hostProfileId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_git_commit SET workspace_id = ? WHERE workspace_id = ? AND host_profile_id = ?',
          [newWorkspaceId, oldWorkspaceId, hostProfileId]
        );
        await ngfRdbManager.executeSql(
          'UPDATE agent_plan SET workspace_id = ? WHERE workspace_id = ? AND host_profile_id = ?',
          [newWorkspaceId, oldWorkspaceId, hostProfileId]
        );
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace agent workspace session state failed: ' + e);
      throw new Error('replace agent workspace session state failed: ' + e);
    }
  }

  async saveMessage(message: AgentHomeChatItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_message (' +
        'id, session_id, role, title, body, message_id, reasoning_text, agent_name, content_nodes_json, timeline_epoch, timeline_seq, duration_text, created_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, message.id),
        this.scopedLocalId(hostProfileId, message.sessionId),
        message.role,
        message.title,
        message.text,
        message.messageId,
        message.reasoningText,
        message.agentName,
        message.contentNodesJson,
        message.timelineEpoch,
        message.timelineSeq,
        message.durationText,
        message.createdAt,
        hostProfileId
      ]
    );
  }

  async savePreview(preview: AgentHomePreviewItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_preview (' +
        'id, session_id, path, media_type, content, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, preview.id),
        this.scopedLocalId(hostProfileId, preview.sessionId),
        preview.path,
        preview.mediaType,
        preview.content,
        preview.updatedAt,
        hostProfileId
      ]
    );
  }

  async loadPreviewContentsForSession(
    sessionId: string,
    hostProfileId: string
  ): Promise<Array<string>> {
    await this.ensureReady();
    const rows = await ngfRdbManager.queryRows(
      'SELECT content FROM agent_preview WHERE session_id = ? AND host_profile_id = ?',
      [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]
    );
    const contents: Array<string> = [];
    for (let index = 0; index < rows.length; index++) {
      contents.push(rows[index].getString('content', ''));
    }
    logger.info(TAG, 'loaded preview contents for session: ' + sessionId + ', count=' + String(contents.length));
    return contents;
  }

  async saveToolCall(toolCall: AgentHomeToolCallItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_tool_call (' +
        'id, session_id, provider_id, message_id, tool_call_id, name, status, input_text, output_text, error_text, ' +
        'raw_json, started_at, completed_at, updated_at, agent_name, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, toolCall.id),
        this.scopedLocalId(hostProfileId, toolCall.sessionId),
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
        toolCall.agentName,
        hostProfileId
      ]
    );
  }

  async saveUserRequest(item: AgentHomeUserRequestItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_user_request (' +
        'id, session_id, provider_id, request_id, kind, title, prompt, options_json, allow_free_text, status, ' +
        'answer, selected_option_id, raw_json, created_at, updated_at, agent_name, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, item.id),
        this.scopedLocalId(hostProfileId, item.sessionId),
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
        item.agentName,
        hostProfileId
      ]
    );
  }

  async savePlan(item: AgentHomePlanItem, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await this.savePlanWithoutReady(item, hostProfileId);
  }

  private async savePlanWithoutReady(item: AgentHomePlanItem, hostProfileId: string): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_plan (' +
        'id, session_id, workspace_id, provider_id, plan_id, title, content, status, raw_json, created_at, updated_at, agent_name, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, item.id),
        this.scopedLocalId(hostProfileId, item.sessionId),
        this.scopedLocalId(hostProfileId, item.workspaceId),
        item.providerId,
        item.planId,
        item.title,
        item.content,
        item.status,
        item.rawJson,
        item.createdAt,
        item.updatedAt,
        item.agentName,
        hostProfileId
      ]
    );
  }

  async replaceWorkspaceChangesForSession(
    sessionId: string,
    changes: Array<AgentHomeWorkspaceChangeItem>,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_workspace_change WHERE session_id = ? AND host_profile_id = ?',
        [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]
      );
      for (let index = 0; index < changes.length; index++) {
        await this.saveWorkspaceChangeWithoutReady(changes[index], hostProfileId);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace workspace changes failed: ' + e);
      throw new Error('replace workspace changes failed: ' + e);
    }
  }

  async replaceWorkspaceFilesForParent(
    workspaceId: string,
    parentPath: string,
    files: Array<AgentHomeWorkspaceFileItem>,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_workspace_file WHERE workspace_id = ? AND parent_path = ? AND host_profile_id = ?',
        [this.scopedLocalId(hostProfileId, workspaceId), parentPath, hostProfileId]
      );
      for (let index = 0; index < files.length; index++) {
        await this.saveWorkspaceFileWithoutReady(files[index], hostProfileId);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace workspace files failed: ' + e);
      throw new Error('replace workspace files failed: ' + e);
    }
  }

  async replaceGitCommitsForSession(
    sessionId: string,
    commits: Array<AgentHomeGitCommitItem>,
    hostProfileId: string
  ): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_git_commit WHERE session_id = ? AND host_profile_id = ?',
        [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]
      );
      for (let index = 0; index < commits.length; index++) {
        await this.saveGitCommitWithoutReady(commits[index], hostProfileId);
      }
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'replace git commits failed: ' + e);
      throw new Error('replace git commits failed: ' + e);
    }
  }

  async deleteMessagesForSession(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_message WHERE session_id = ? AND host_profile_id = ?', [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]);
    logger.info(TAG, 'deleted messages for session: ' + sessionId);
  }

  async deletePreviewsForSession(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_preview WHERE session_id = ? AND host_profile_id = ?', [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]);
    logger.info(TAG, 'deleted previews for session: ' + sessionId);
  }

  async deleteToolCallsForSession(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_tool_call WHERE session_id = ? AND host_profile_id = ?', [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]);
    logger.info(TAG, 'deleted tool calls for session: ' + sessionId);
  }

  async deleteUserRequestsForSession(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_user_request WHERE session_id = ? AND host_profile_id = ?', [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]);
    logger.info(TAG, 'deleted user requests for session: ' + sessionId);
  }

  async deletePlansForSession(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.executeSql('DELETE FROM agent_plan WHERE session_id = ? AND host_profile_id = ?', [this.scopedLocalId(hostProfileId, sessionId), hostProfileId]);
    logger.info(TAG, 'deleted plans for session: ' + sessionId);
  }

  async deleteSessionCascade(sessionId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    logger.info(TAG, 'delete session cascade start: ' + sessionId);
    await ngfRdbManager.beginTransaction();
    try {
      const scopedSessionId = this.scopedLocalId(hostProfileId, sessionId);
      await ngfRdbManager.executeSql('DELETE FROM agent_preview WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_tool_call WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_user_request WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_plan WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_message WHERE session_id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_session WHERE id = ? AND host_profile_id = ?', [scopedSessionId, hostProfileId]);
      await ngfRdbManager.commit();
      logger.info(TAG, 'delete session cascade done: ' + sessionId);
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'delete agent session failed: ' + e);
      throw new Error('delete agent session failed: ' + e);
    }
  }

  async deleteWorkspaceCascade(workspaceId: string, hostProfileId: string): Promise<void> {
    await this.ensureReady();
    await ngfRdbManager.beginTransaction();
    try {
      const scopedWorkspaceId = this.scopedLocalId(hostProfileId, workspaceId);
      const scopedSessionPrefix = hostProfileId === AGENT_LEGACY_HOST_PROFILE_ID ? '' : hostProfileId + '::';
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_preview WHERE host_profile_id = ? AND (' +
          'session_id IN (SELECT id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?) OR ' +
          'session_id IN (SELECT ? || bridge_session_id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?))',
        [hostProfileId, scopedWorkspaceId, hostProfileId, scopedSessionPrefix, scopedWorkspaceId, hostProfileId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_tool_call WHERE host_profile_id = ? AND (' +
          'session_id IN (SELECT id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?) OR ' +
          'session_id IN (SELECT ? || bridge_session_id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?))',
        [hostProfileId, scopedWorkspaceId, hostProfileId, scopedSessionPrefix, scopedWorkspaceId, hostProfileId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_user_request WHERE host_profile_id = ? AND (' +
          'session_id IN (SELECT id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?) OR ' +
          'session_id IN (SELECT ? || bridge_session_id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?))',
        [hostProfileId, scopedWorkspaceId, hostProfileId, scopedSessionPrefix, scopedWorkspaceId, hostProfileId]
      );
      await ngfRdbManager.executeSql(
        'DELETE FROM agent_message WHERE host_profile_id = ? AND (' +
          'session_id IN (SELECT id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?) OR ' +
          'session_id IN (SELECT ? || bridge_session_id FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?))',
        [hostProfileId, scopedWorkspaceId, hostProfileId, scopedSessionPrefix, scopedWorkspaceId, hostProfileId]
      );
      await ngfRdbManager.executeSql('DELETE FROM agent_git_commit WHERE workspace_id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_change WHERE workspace_id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_file WHERE workspace_id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_plan WHERE workspace_id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_session WHERE workspace_id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace WHERE id = ? AND host_profile_id = ?', [scopedWorkspaceId, hostProfileId]);
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'delete agent workspace failed: ' + e);
      throw new Error('delete agent workspace failed: ' + e);
    }
  }

  async clearAll(): Promise<void> {
    await this.ensureReady();
    logger.info(TAG, 'clear all agent home data start');
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DELETE FROM agent_remote_session');
      await ngfRdbManager.executeSql('DELETE FROM agent_provider_catalog');
      await ngfRdbManager.executeSql('DELETE FROM agent_chat_message');
      await ngfRdbManager.executeSql('DELETE FROM agent_chat_room');
      await ngfRdbManager.executeSql('DELETE FROM agent_loop');
      await ngfRdbManager.executeSql('DELETE FROM agent_schedule');
      await ngfRdbManager.executeSql('DELETE FROM agent_permission_policy');
      await ngfRdbManager.executeSql('DELETE FROM agent_terminal_snapshot');
      await ngfRdbManager.executeSql('DELETE FROM agent_workspace_registry');
      await ngfRdbManager.executeSql('DELETE FROM agent_project_registry');
      await ngfRdbManager.executeSql('DELETE FROM agent_timeline_v2');
      await ngfRdbManager.executeSql('DELETE FROM agent_v2');
      await ngfRdbManager.executeSql('DELETE FROM agent_daemon_server');
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
      await ngfRdbManager.executeSql('DELETE FROM agent_host_credential_gc');
      await ngfRdbManager.executeSql('DELETE FROM agent_host_profile');
      await ngfRdbManager.executeSql('DELETE FROM agent_profile');
      await ngfRdbManager.commit();
      logger.info(TAG, 'clear all agent home data done');
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'clear all agent data failed: ' + e);
      throw new Error('clear all agent data failed: ' + e);
    }
  }

  private async replaceWorkspaces(
    workspaces: Array<AgentHomeWorkspaceItem>,
    hostProfileId: string
  ): Promise<void> {
    await ngfRdbManager.executeSql('DELETE FROM agent_workspace WHERE host_profile_id = ?', [hostProfileId]);
    for (let index = 0; index < workspaces.length; index++) {
      await this.saveWorkspaceAt(workspaces[index], index, hostProfileId);
    }
  }

  private async replaceSessions(
    sessions: Array<AgentHomeSessionItem>,
    hostProfileId: string
  ): Promise<void> {
    await ngfRdbManager.executeSql('DELETE FROM agent_session WHERE host_profile_id = ?', [hostProfileId]);
    for (let index = 0; index < sessions.length; index++) {
      await this.saveSession(sessions[index], hostProfileId);
    }
  }

  private async saveWorkspaceAt(workspace: AgentHomeWorkspaceItem, sortOrder: number, hostProfileId: string): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace (' +
        'id, title, workspace_path, initial, accent_color, branch_name, is_online, sort_order, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, workspace.id),
        workspace.title,
        workspace.subtitle,
        workspace.initial,
        workspace.accentColor,
        workspace.branchName,
        workspace.isOnline ? 1 : 0,
        sortOrder,
        Date.now(),
        hostProfileId
      ]
    );
  }

  private async loadProfile(defaultProfile: AgentHomeProfile): Promise<AgentHomeProfile> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT endpoint, token, provider_id, model_id, speed_mode, reasoning_mode, active_workspace_id, active_session_id, ' +
        'preview_path, active_device_id, last_device_id, updated_at ' +
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
      row.getNumber('updated_at', defaultProfile.updatedAt),
      row.getString('active_device_id', defaultProfile.activeDeviceId),
      row.getString('last_device_id', defaultProfile.lastDeviceId)
    );
  }

  private async loadWorkspaces(hostProfileId: string): Promise<Array<AgentHomeWorkspaceItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, title, workspace_path, initial, accent_color, branch_name, is_online ' +
        'FROM agent_workspace WHERE host_profile_id = ? ORDER BY sort_order ASC, updated_at DESC',
      [hostProfileId]
    );
    const items: Array<AgentHomeWorkspaceItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeWorkspaceItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
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

  private async loadSessions(hostProfileId: string): Promise<Array<AgentHomeSessionItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, workspace_id, title, branch_name, provider_id, model_id, speed_mode, reasoning_mode, bridge_session_id, updated_at ' +
        'FROM agent_session WHERE host_profile_id = ? ORDER BY updated_at DESC',
      [hostProfileId]
    );
    const items: Array<AgentHomeSessionItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeSessionItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('workspace_id', '')),
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

  private async loadMessages(hostProfileId: string): Promise<Array<AgentHomeChatItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, role, title, body, message_id, reasoning_text, agent_name, content_nodes_json, timeline_epoch, timeline_seq, duration_text, created_at ' +
        'FROM agent_message WHERE host_profile_id = ? ORDER BY created_at ASC',
      [hostProfileId]
    );
    const items: Array<AgentHomeChatItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeChatItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
        row.getString('role', ''),
        row.getString('title', ''),
        row.getString('body', ''),
        row.getString('duration_text', ''),
        row.getNumber('created_at', 0),
        row.getString('reasoning_text', ''),
        row.getString('message_id', ''),
        row.getString('agent_name', ''),
        row.getString('content_nodes_json', ''),
        row.getNumber('timeline_epoch', 0),
        row.getNumber('timeline_seq', 0)
      ));
    }
    return items;
  }

  private async loadPreviews(hostProfileId: string): Promise<Array<AgentHomePreviewItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, path, media_type, content, updated_at ' +
        'FROM agent_preview WHERE host_profile_id = ? ORDER BY updated_at DESC LIMIT 100',
      [hostProfileId]
    );
    const items: Array<AgentHomePreviewItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomePreviewItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
        row.getString('path', ''),
        row.getString('media_type', 'text/plain'),
        row.getString('content', ''),
        row.getNumber('updated_at', 0)
      ));
    }
    return items;
  }

  private async loadToolCalls(hostProfileId: string): Promise<Array<AgentHomeToolCallItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, provider_id, message_id, tool_call_id, name, status, input_text, output_text, error_text, ' +
        'raw_json, started_at, completed_at, updated_at, agent_name FROM agent_tool_call ' +
        'WHERE host_profile_id = ? ORDER BY updated_at ASC LIMIT 500',
      [hostProfileId]
    );
    const items: Array<AgentHomeToolCallItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeToolCallItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
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

  private async loadWorkspaceChanges(hostProfileId: string): Promise<Array<AgentHomeWorkspaceChangeItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, path, old_path, status, staged, additions, deletions, diff_text, updated_at, item_kind, changed_file_count, diff_file_cursor, diff_file_limit, next_diff_file_cursor, diff_line_offset, next_diff_line_offset, diff_line_limit, diff_max_bytes, diff_truncated, diff_truncation_reason ' +
        'FROM agent_workspace_change WHERE host_profile_id = ? ORDER BY path ASC LIMIT 1000',
      [hostProfileId]
    );
    const items: Array<AgentHomeWorkspaceChangeItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeWorkspaceChangeItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
        this.logicalLocalId(hostProfileId, row.getString('workspace_id', '')),
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
        row.getNumber('changed_file_count', 1),
        row.getBoolean('diff_truncated', false),
        row.getString('diff_truncation_reason', ''),
        row.getNumber('next_diff_line_offset', -1),
        row.getNumber('diff_file_cursor', 0),
        row.getNumber('diff_file_limit', 50),
        row.getNumber('next_diff_file_cursor', -1),
        row.getNumber('diff_line_offset', 0),
        row.getNumber('diff_line_limit', 2000),
        row.getNumber('diff_max_bytes', 524288)
      ));
    }
    return items;
  }

  private async loadWorkspaceFiles(hostProfileId: string): Promise<Array<AgentHomeWorkspaceFileItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT workspace_id, path, parent_path, name, kind, depth, size_bytes, modified_at, is_hidden, updated_at ' +
        'FROM agent_workspace_file WHERE host_profile_id = ? ORDER BY depth ASC, kind ASC, name ASC LIMIT 5000',
      [hostProfileId]
    );
    const items: Array<AgentHomeWorkspaceFileItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const workspaceId = this.logicalLocalId(hostProfileId, row.getString('workspace_id', ''));
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

  private async loadGitCommits(hostProfileId: string): Promise<Array<AgentHomeGitCommitItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, hash, message, author, committed_at, updated_at ' +
        'FROM agent_git_commit WHERE host_profile_id = ? ORDER BY committed_at DESC LIMIT 100',
      [hostProfileId]
    );
    const items: Array<AgentHomeGitCommitItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeGitCommitItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
        this.logicalLocalId(hostProfileId, row.getString('workspace_id', '')),
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

  private async loadUserRequests(hostProfileId: string): Promise<Array<AgentHomeUserRequestItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, provider_id, request_id, kind, title, prompt, options_json, allow_free_text, status, ' +
        'answer, selected_option_id, raw_json, created_at, updated_at, agent_name FROM agent_user_request ' +
        'WHERE host_profile_id = ? ORDER BY updated_at ASC LIMIT 500',
      [hostProfileId]
    );
    const items: Array<AgentHomeUserRequestItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomeUserRequestItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
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

  private async loadPlans(hostProfileId: string): Promise<Array<AgentHomePlanItem>> {
    const rows = await ngfRdbManager.queryRows(
      'SELECT id, session_id, workspace_id, provider_id, plan_id, title, content, status, raw_json, created_at, updated_at, agent_name ' +
        'FROM agent_plan WHERE host_profile_id = ? ORDER BY updated_at ASC LIMIT 300',
      [hostProfileId]
    );
    const items: Array<AgentHomePlanItem> = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      items.push(new AgentHomePlanItem(
        this.logicalLocalId(hostProfileId, row.getString('id', '')),
        this.logicalLocalId(hostProfileId, row.getString('session_id', '')),
        this.logicalLocalId(hostProfileId, row.getString('workspace_id', '')),
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

  private async saveWorkspaceChangeWithoutReady(change: AgentHomeWorkspaceChangeItem, hostProfileId: string): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace_change (' +
        'id, session_id, workspace_id, provider_id, path, old_path, status, staged, additions, deletions, diff_text, updated_at, item_kind, changed_file_count, diff_file_cursor, diff_file_limit, next_diff_file_cursor, diff_line_offset, next_diff_line_offset, diff_line_limit, diff_max_bytes, diff_truncated, diff_truncation_reason, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, change.id),
        this.scopedLocalId(hostProfileId, change.sessionId),
        this.scopedLocalId(hostProfileId, change.workspaceId),
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
        change.changedFileCount,
        change.diffFileCursor,
        change.diffFileLimit,
        change.nextDiffFileCursor,
        change.diffLineOffset,
        change.nextDiffLineOffset,
        change.diffLineLimit,
        change.diffMaxBytes,
        change.diffTruncated ? 1 : 0,
        change.diffTruncationReason,
        hostProfileId
      ]
    );
  }

  private async saveWorkspaceFileWithoutReady(file: AgentHomeWorkspaceFileItem, hostProfileId: string): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_workspace_file (' +
        'workspace_id, path, parent_path, name, kind, depth, size_bytes, modified_at, is_hidden, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, file.workspaceId),
        file.path,
        file.parentPath,
        file.name,
        file.kind,
        file.depth,
        file.sizeBytes,
        file.modifiedAt,
        file.isHidden ? 1 : 0,
        file.updatedAt,
        hostProfileId
      ]
    );
  }

  private async saveGitCommitWithoutReady(commit: AgentHomeGitCommitItem, hostProfileId: string): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_git_commit (' +
        'id, session_id, workspace_id, provider_id, hash, message, author, committed_at, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.scopedLocalId(hostProfileId, commit.id),
        this.scopedLocalId(hostProfileId, commit.sessionId),
        this.scopedLocalId(hostProfileId, commit.workspaceId),
        commit.providerId,
        commit.hash,
        commit.message,
        commit.author,
        commit.committedAt,
        commit.updatedAt,
        hostProfileId
      ]
    );
  }

  private async saveRemoteSessionWithoutReady(
    providerId: string,
    session: AgentBridgeRemoteSession,
    deviceId: string,
    hostProfileId: string
  ): Promise<void> {
    const effectiveProviderId = providerId.length > 0 ? providerId : session.providerId;
    const effectiveDeviceId = deviceId.length > 0 ? deviceId : session.deviceId;
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_remote_session (' +
        'device_id, provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, model_id, ' +
        'speed_mode, reasoning_mode, status, source, message_count, updated_at, host_profile_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        effectiveDeviceId,
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
        session.updatedAt,
        hostProfileId
      ]
    );
  }

  private async saveAgentRecordWithoutReady(deviceId: string, serverId: string, agent: AgentBridgeAgentRecord): Promise<void> {
    if (agent.id.length === 0) {
      return;
    }
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_v2 (' +
        'device_id, server_id, agent_id, provider_id, workspace_id, cwd, provider_session_id, remote_session_id, title, ' +
        'config_json, runtime_info_json, persistence_json, features_json, last_status, model_id, mode_id, thinking_option_id, ' +
        'requires_attention, attention_reason, last_error, timeline_size, latest_seq, timeline_ack_json, archived_at, created_at, ' +
        'updated_at, last_activity_at, last_user_message_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        deviceId,
        serverId,
        agent.id,
        agent.provider,
        agent.workspaceId,
        agent.cwd,
        agent.providerSessionId,
        agent.remoteSessionId,
        agent.title,
        agent.configJson,
        agent.runtimeInfoJson,
        agent.persistenceJson,
        agent.featuresJson,
        agent.lastStatus,
        agent.modelId,
        agent.lastModeId,
        agent.thinkingOptionId,
        agent.requiresAttention ? 1 : 0,
        agent.attentionReason,
        agent.lastError,
        agent.timelineSize,
        agent.latestSeq,
        agent.timelineAckJson,
        agent.archivedAt,
        agent.createdAt,
        agent.updatedAt,
        agent.lastActivityAt,
        agent.lastUserMessageAt
      ]
    );
  }

  private async saveAgentTimelineItemWithoutReady(
    deviceId: string,
    serverId: string,
    agentId: string,
    item: AgentBridgeAgentTimelineRecord
  ): Promise<void> {
    if (item.seq <= 0) {
      return;
    }
    const effectiveAgentId = item.agentId.length > 0 ? item.agentId : agentId;
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_timeline_v2 (' +
        'device_id, server_id, agent_id, seq, epoch, kind, event_type, projected_json, provider_raw_json, created_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        deviceId,
        serverId,
        effectiveAgentId,
        item.seq,
        item.epoch,
        item.kind,
        item.eventType,
        item.projectedJson,
        item.providerRawJson,
        item.createdAt
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
    if (!this.hasColumn(rows, 'active_device_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN active_device_id TEXT');
    }
    if (!this.hasColumn(rows, 'last_device_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN last_device_id TEXT');
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
    if (!this.hasColumn(messageRows, 'content_nodes_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN content_nodes_json TEXT');
    }
    if (!this.hasColumn(messageRows, 'timeline_epoch')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN timeline_epoch INTEGER');
    }
    if (!this.hasColumn(messageRows, 'timeline_seq')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_message ADD COLUMN timeline_seq INTEGER');
    }
    const schemaSqls: Array<string> = [];
    this.pushDeviceSchemaSqls(schemaSqls);
    this.pushDaemonSchemaSqls(schemaSqls);
    this.pushRemoteSessionSchemaSqls(schemaSqls);
    this.pushWorkspaceSchemaSqls(schemaSqls);
    for (let index = 0; index < schemaSqls.length; index++) {
      await ngfRdbManager.executeSql(schemaSqls[index]);
    }
    await this.ensureAgentV2Schema();
    const remoteSessionRows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_remote_session)');
    if (!this.hasColumn(remoteSessionRows, 'reasoning_mode')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_remote_session ADD COLUMN reasoning_mode TEXT');
    }
    if (!this.hasColumn(remoteSessionRows, 'device_id')) {
      await this.rebuildRemoteSessionTableWithDeviceId();
    }
    await this.ensureAgentNameColumn('agent_tool_call');
    await this.ensureAgentNameColumn('agent_user_request');
    await this.ensureAgentNameColumn('agent_plan');
    await this.ensureWorkspaceChangeSchema();
  }

  private async ensureHostProfileSchema(): Promise<void> {
    const profileRows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_profile)');
    if (!this.hasColumn(profileRows, 'active_host_profile_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN active_host_profile_id TEXT');
    }
    if (!this.hasColumn(profileRows, 'host_migration_version')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_profile ADD COLUMN host_migration_version INTEGER');
    }
    await ngfRdbManager.executeSql(
      'CREATE TABLE IF NOT EXISTS agent_host_profile (' +
        'host_profile_id TEXT PRIMARY KEY, ' +
        'display_name TEXT, ' +
        'endpoint TEXT, ' +
        'credential_alias TEXT, ' +
        'credential_digest TEXT, ' +
        'provider_id TEXT, ' +
        'model_id TEXT, ' +
        'speed_mode TEXT, ' +
        'reasoning_mode TEXT, ' +
        'active_workspace_id TEXT, ' +
        'active_session_id TEXT, ' +
        'preview_path TEXT, ' +
        'last_device_id TEXT, ' +
        'last_server_id TEXT, ' +
        'auto_connect_on_launch INTEGER, ' +
        'identity_status TEXT, ' +
        'created_at INTEGER, ' +
        'updated_at INTEGER, ' +
        'last_used_at INTEGER' +
      ')'
    );
    await ngfRdbManager.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_agent_host_profile_used ON agent_host_profile (last_used_at DESC, created_at ASC)'
    );
    await ngfRdbManager.executeSql(
      'CREATE TABLE IF NOT EXISTS agent_host_credential_gc (' +
        'credential_alias TEXT PRIMARY KEY, queued_at INTEGER' +
      ')'
    );
    for (let index = 0; index < AGENT_HOST_SCOPED_TABLES.length; index++) {
      await this.ensureHostScopeColumn(AGENT_HOST_SCOPED_TABLES[index]);
    }
    await this.ensureRemoteSessionHostPrimaryKey();
  }

  private async ensureRemoteSessionHostPrimaryKey(): Promise<void> {
    const schemaRows = await ngfRdbManager.queryRows(
      'SELECT sql FROM sqlite_master WHERE type = "table" AND name = "agent_remote_session"'
    );
    if (schemaRows.length > 0 && schemaRows[0].getString('sql', '').indexOf('PRIMARY KEY (host_profile_id') >= 0) {
      return;
    }
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DROP TABLE IF EXISTS agent_remote_session_host_v2');
      await ngfRdbManager.executeSql(
        'CREATE TABLE agent_remote_session_host_v2 (' +
          'host_profile_id TEXT, device_id TEXT, provider_id TEXT, session_id TEXT, remote_session_id TEXT, title TEXT, ' +
          'workspace_path TEXT, workspace_title TEXT, branch_name TEXT, model_id TEXT, speed_mode TEXT, reasoning_mode TEXT, ' +
          'status TEXT, source TEXT, message_count INTEGER, updated_at INTEGER, ' +
          'PRIMARY KEY (host_profile_id, device_id, provider_id, session_id)' +
        ')'
      );
      await ngfRdbManager.executeSql(
        'INSERT OR REPLACE INTO agent_remote_session_host_v2 (' +
          'host_profile_id, device_id, provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, ' +
          'branch_name, model_id, speed_mode, reasoning_mode, status, source, message_count, updated_at' +
        ') SELECT CASE WHEN host_profile_id IS NULL OR host_profile_id = "" THEN ? ELSE host_profile_id END, ' +
          'device_id, provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, ' +
          'model_id, speed_mode, reasoning_mode, status, source, message_count, updated_at FROM agent_remote_session',
        [AGENT_LEGACY_HOST_PROFILE_ID]
      );
      await ngfRdbManager.executeSql('DROP TABLE agent_remote_session');
      await ngfRdbManager.executeSql('ALTER TABLE agent_remote_session_host_v2 RENAME TO agent_remote_session');
      await ngfRdbManager.executeSql(
        'CREATE INDEX IF NOT EXISTS idx_agent_remote_session_provider ON agent_remote_session ' +
          '(host_profile_id, device_id, provider_id, updated_at)'
      );
      await ngfRdbManager.commit();
    } catch (error) {
      await ngfRdbManager.rollback();
      throw new Error('rebuild remote session host scope failed: ' + error);
    }
  }

  private async ensureHostScopeColumn(tableName: string): Promise<void> {
    const rows = await ngfRdbManager.queryRows('PRAGMA table_info(' + tableName + ')');
    if (!this.hasColumn(rows, 'host_profile_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE ' + tableName + ' ADD COLUMN host_profile_id TEXT');
    }
    await ngfRdbManager.executeSql(
      'UPDATE ' + tableName + ' SET host_profile_id = ? WHERE host_profile_id IS NULL OR host_profile_id = ""',
      [AGENT_LEGACY_HOST_PROFILE_ID]
    );
    await ngfRdbManager.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_' + tableName + '_host ON ' + tableName + ' (host_profile_id)'
    );
  }

  private async saveHostProfileWithoutReady(profile: AgentHomeHostProfile): Promise<void> {
    await ngfRdbManager.executeSql(
      'INSERT OR REPLACE INTO agent_host_profile (' +
        'host_profile_id, display_name, endpoint, credential_alias, credential_digest, provider_id, model_id, speed_mode, ' +
        'reasoning_mode, active_workspace_id, active_session_id, preview_path, last_device_id, last_server_id, ' +
        'auto_connect_on_launch, identity_status, created_at, updated_at, last_used_at' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        profile.hostProfileId,
        profile.displayName,
        profile.endpoint,
        profile.credentialAlias,
        profile.credentialDigest,
        profile.providerId,
        profile.modelId,
        profile.speedMode,
        profile.reasoningMode,
        profile.activeWorkspaceId,
        profile.activeSessionId,
        profile.previewPath,
        profile.lastDeviceId,
        profile.lastServerId,
        profile.autoConnectOnLaunch ? 1 : 0,
        profile.identityStatus,
        profile.createdAt,
        profile.updatedAt,
        profile.lastUsedAt
      ]
    );
  }

  private pushDeviceSchemaSqls(sqls: Array<string>): void {
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_bridge_device (' +
        'device_id TEXT PRIMARY KEY, ' +
        'bridge_instance_id TEXT, ' +
        'display_name TEXT, ' +
        'platform TEXT, ' +
        'public_key_pem TEXT, ' +
        'public_key_fingerprint TEXT, ' +
        'last_endpoint TEXT, ' +
        'token_digest TEXT, ' +
        'trust_state TEXT, ' +
        'first_trusted_at INTEGER, ' +
        'last_seen_at INTEGER' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_bridge_device_seen ON agent_bridge_device (last_seen_at)');
  }

  private terminalSnapshotJson(item: AgentBridgeTerminalSession): string {
    return '{"slot":' + String(item.slot) +
      ',"subscribed":' + (item.subscribed ? 'true' : 'false') +
      ',"desiredSubscription":' + (item.desiredSubscription ? 'true' : 'false') +
      ',"lastAppliedRestoreSeq":' + String(item.lastAppliedRestoreSeq) +
      ',"lastAppliedSnapshotSeq":' + String(item.lastAppliedSnapshotSeq) +
      ',"captureLength":' + String(item.terminal.captureLength) +
      ',"captureBytes":' + String(item.terminal.captureBytes) +
      ',"captureStatus":"' + this.escapeJsonString(item.terminal.captureStatus) + '"' +
      ',"captureWarning":"' + this.escapeJsonString(item.terminal.captureWarning) + '"' +
      ',"capturePersisted":' + (item.terminal.capturePersisted ? 'true' : 'false') +
      ',"capturePersistedBytes":' + String(item.terminal.capturePersistedBytes) +
      ',"capturePersistedAt":' + String(item.terminal.capturePersistedAt) +
      ',"snapshotSeq":' + String(item.terminal.snapshotSeq) +
      ',"restoreSeq":' + String(item.terminal.restoreSeq) +
      ',"snapshotBytes":' + String(item.terminal.snapshotBytes) +
      ',"snapshotSource":"' + this.escapeJsonString(item.terminal.snapshotSource) + '"' +
      ',"snapshotTruncated":' + (item.terminal.snapshotTruncated ? 'true' : 'false') +
      ',"snapshotPersistedBytes":' + String(item.terminal.snapshotPersistedBytes) +
      ',"snapshotWarning":"' + this.escapeJsonString(item.terminal.snapshotWarning) + '"' +
      ',"activity":"' + this.escapeJsonString(item.terminal.activity) + '"' +
      ',"requiresAttention":' + (item.terminal.requiresAttention ? 'true' : 'false') +
      ',"attentionReason":"' + this.escapeJsonString(item.terminal.attentionReason) + '"' +
      ',"attentionAt":' + String(item.terminal.attentionAt) +
      ',"mouseMode":"' + this.escapeJsonString(item.terminal.mouseMode) + '"' +
      ',"lastMouseAt":' + String(item.terminal.lastMouseAt) +
      ',"lastMouseError":"' + this.escapeJsonString(item.terminal.lastMouseError) + '"' +
      '}';
  }

  private applyTerminalSnapshotJson(terminal: AgentBridgeTerminalState, source: string): void {
    if (source.length === 0) {
      return;
    }
    terminal.captureLength = AgentBridgeIncomingParser.extractNumberProperty(source, 'captureLength', terminal.captureLength);
    terminal.captureBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'captureBytes', terminal.captureBytes);
    terminal.captureStatus = AgentBridgeIncomingParser.extractStringProperty(source, 'captureStatus');
    terminal.captureWarning = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'captureWarning'));
    terminal.capturePersisted = AgentBridgeIncomingParser.extractBooleanProperty(source, 'capturePersisted');
    terminal.capturePersistedBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'capturePersistedBytes', 0);
    terminal.capturePersistedAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'capturePersistedAt', 0);
    terminal.snapshotSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotSeq', 0);
    terminal.restoreSeq = AgentBridgeIncomingParser.extractNumberProperty(source, 'restoreSeq', 0);
    terminal.snapshotBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotBytes', 0);
    terminal.snapshotSource = AgentBridgeIncomingParser.extractStringProperty(source, 'snapshotSource');
    terminal.snapshotTruncated = AgentBridgeIncomingParser.extractBooleanProperty(source, 'snapshotTruncated');
    terminal.snapshotPersistedBytes = AgentBridgeIncomingParser.extractNumberProperty(source, 'snapshotPersistedBytes', 0);
    terminal.snapshotWarning = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'snapshotWarning'));
    terminal.activity = AgentBridgeIncomingParser.extractStringProperty(source, 'activity');
    terminal.requiresAttention = AgentBridgeIncomingParser.extractBooleanProperty(source, 'requiresAttention');
    terminal.attentionReason = AgentBridgeIncomingParser.extractStringProperty(source, 'attentionReason');
    terminal.attentionAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'attentionAt', 0);
    terminal.mouseMode = AgentBridgeIncomingParser.extractStringProperty(source, 'mouseMode');
    terminal.lastMouseAt = AgentBridgeIncomingParser.extractNumberProperty(source, 'lastMouseAt', 0);
    terminal.lastMouseError = AgentBridgeIncomingParser.cleanJsonText(AgentBridgeIncomingParser.extractStringProperty(source, 'lastMouseError'));
  }

  private escapeJsonString(value: string): string {
    let result = '';
    for (let index = 0; index < value.length; index++) {
      const ch = value.charAt(index);
      if (ch === '\\') {
        result = result + '\\\\';
      } else if (ch === '"') {
        result = result + '\\"';
      } else if (ch === '\n') {
        result = result + '\\n';
      } else if (ch === '\r') {
        result = result + '\\r';
      } else if (ch === '\t') {
        result = result + '\\t';
      } else {
        result = result + ch;
      }
    }
    return result;
  }

  private pushDaemonSchemaSqls(sqls: Array<string>): void {
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_daemon_server (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'hostname TEXT, ' +
        'version TEXT, ' +
        'protocol_version TEXT, ' +
        'features_json TEXT, ' +
        'last_endpoint TEXT, ' +
        'last_seen_at INTEGER, ' +
        'PRIMARY KEY (device_id, server_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_daemon_server_seen ON agent_daemon_server (device_id, last_seen_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_provider_catalog (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'scope TEXT, ' +
        'cwd TEXT, ' +
        'providers_json TEXT, ' +
        'cache_status TEXT, ' +
        'updated_at INTEGER, ' +
        'PRIMARY KEY (device_id, server_id, scope, cwd)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_provider_catalog_scope ON agent_provider_catalog (device_id, server_id, scope, updated_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_v2 (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'agent_id TEXT, ' +
        'provider_id TEXT, ' +
        'workspace_id TEXT, ' +
        'cwd TEXT, ' +
        'provider_session_id TEXT, ' +
        'remote_session_id TEXT, ' +
        'title TEXT, ' +
        'config_json TEXT, ' +
        'runtime_info_json TEXT, ' +
        'persistence_json TEXT, ' +
        'features_json TEXT, ' +
        'last_status TEXT, ' +
        'model_id TEXT, ' +
        'mode_id TEXT, ' +
        'thinking_option_id TEXT, ' +
        'requires_attention INTEGER, ' +
        'attention_reason TEXT, ' +
        'last_error TEXT, ' +
        'timeline_size INTEGER, ' +
        'latest_seq INTEGER, ' +
        'timeline_ack_json TEXT, ' +
        'archived_at TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'last_activity_at TEXT, ' +
        'last_user_message_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, agent_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_v2_workspace ON agent_v2 (device_id, server_id, workspace_id, updated_at)');
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_v2_status ON agent_v2 (device_id, server_id, last_status, updated_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_timeline_v2 (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'agent_id TEXT, ' +
        'seq INTEGER, ' +
        'epoch INTEGER, ' +
        'kind TEXT, ' +
        'event_type TEXT, ' +
        'projected_json TEXT, ' +
        'provider_raw_json TEXT, ' +
        'created_at INTEGER, ' +
        'PRIMARY KEY (device_id, server_id, agent_id, seq)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_timeline_v2_kind ON agent_timeline_v2 (device_id, server_id, agent_id, kind, seq)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_project_registry (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'project_id TEXT, ' +
        'root_path TEXT, ' +
        'kind TEXT, ' +
        'display_name TEXT, ' +
        'archived_at TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, project_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_project_registry_root ON agent_project_registry (device_id, server_id, root_path)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_workspace_registry (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'workspace_id TEXT, ' +
        'project_id TEXT, ' +
        'cwd TEXT, ' +
        'kind TEXT, ' +
        'display_name TEXT, ' +
        'title TEXT, ' +
        'branch TEXT, ' +
        'archived_at TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, workspace_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_workspace_registry_cwd ON agent_workspace_registry (device_id, server_id, cwd)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_terminal_snapshot (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'terminal_id TEXT, ' +
        'workspace_id TEXT, ' +
        'cwd TEXT, ' +
        'name TEXT, ' +
        'status TEXT, ' +
        'rows INTEGER, ' +
        'cols INTEGER, ' +
        'snapshot_json TEXT, ' +
        'updated_at INTEGER, ' +
        'PRIMARY KEY (device_id, server_id, terminal_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_terminal_workspace ON agent_terminal_snapshot (device_id, server_id, workspace_id, updated_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_permission_policy (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'policy_id TEXT, ' +
        'provider_id TEXT, ' +
        'workspace_id TEXT, ' +
        'tool_id TEXT, ' +
        'risk TEXT, ' +
        'scope TEXT, ' +
        'decision TEXT, ' +
        'created_at INTEGER, ' +
        'updated_at INTEGER, ' +
        'expires_at INTEGER, ' +
        'PRIMARY KEY (device_id, server_id, policy_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_permission_policy_scope ON agent_permission_policy (device_id, server_id, provider_id, workspace_id, tool_id)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_schedule (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'schedule_id TEXT, ' +
        'name TEXT, ' +
        'prompt TEXT, ' +
        'status TEXT, ' +
        'target_json TEXT, ' +
        'cadence_json TEXT, ' +
        'next_run_at TEXT, ' +
        'last_run_at TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, schedule_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_schedule_status ON agent_schedule (device_id, server_id, status, updated_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_loop (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'loop_id TEXT, ' +
        'name TEXT, ' +
        'prompt TEXT, ' +
        'status TEXT, ' +
        'active_worker_agent_id TEXT, ' +
        'active_verifier_agent_id TEXT, ' +
        'summary_json TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, loop_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_loop_status ON agent_loop (device_id, server_id, status, updated_at)');
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_chat_room (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'room_id TEXT, ' +
        'name TEXT, ' +
        'purpose TEXT, ' +
        'created_at TEXT, ' +
        'updated_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, room_id)' +
      ')'
    );
    sqls.push(
      'CREATE TABLE IF NOT EXISTS agent_chat_message (' +
        'device_id TEXT, ' +
        'server_id TEXT, ' +
        'room_id TEXT, ' +
        'message_id TEXT, ' +
        'author_agent_id TEXT, ' +
        'body TEXT, ' +
        'reply_to_message_id TEXT, ' +
        'mention_agent_ids_json TEXT, ' +
        'created_at TEXT, ' +
        'PRIMARY KEY (device_id, server_id, room_id, message_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_chat_message_room ON agent_chat_message (device_id, server_id, room_id, created_at)');
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
        'changed_file_count INTEGER, ' +
        'diff_file_cursor INTEGER, ' +
        'diff_file_limit INTEGER, ' +
        'next_diff_file_cursor INTEGER, ' +
        'diff_line_offset INTEGER, ' +
        'next_diff_line_offset INTEGER, ' +
        'diff_line_limit INTEGER, ' +
        'diff_max_bytes INTEGER, ' +
        'diff_truncated INTEGER, ' +
        'diff_truncation_reason TEXT' +
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
        'device_id TEXT, ' +
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
        'PRIMARY KEY (device_id, provider_id, session_id)' +
      ')'
    );
    sqls.push('CREATE INDEX IF NOT EXISTS idx_agent_remote_session_provider ON agent_remote_session (device_id, provider_id, updated_at)');
  }

  private async rebuildRemoteSessionTableWithDeviceId(): Promise<void> {
    await ngfRdbManager.beginTransaction();
    try {
      await ngfRdbManager.executeSql('DROP TABLE IF EXISTS agent_remote_session_v2');
      await ngfRdbManager.executeSql(
        'CREATE TABLE IF NOT EXISTS agent_remote_session_v2 (' +
          'device_id TEXT, ' +
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
          'PRIMARY KEY (device_id, provider_id, session_id)' +
        ')'
      );
      await ngfRdbManager.executeSql(
        'INSERT OR REPLACE INTO agent_remote_session_v2 (' +
          'device_id, provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, ' +
          'model_id, speed_mode, reasoning_mode, status, source, message_count, updated_at' +
        ') SELECT "", provider_id, session_id, remote_session_id, title, workspace_path, workspace_title, branch_name, ' +
          'model_id, speed_mode, reasoning_mode, status, source, message_count, updated_at FROM agent_remote_session'
      );
      await ngfRdbManager.executeSql('DROP TABLE agent_remote_session');
      await ngfRdbManager.executeSql('ALTER TABLE agent_remote_session_v2 RENAME TO agent_remote_session');
      await ngfRdbManager.executeSql(
        'CREATE INDEX IF NOT EXISTS idx_agent_remote_session_provider ON agent_remote_session (device_id, provider_id, updated_at)'
      );
      await ngfRdbManager.commit();
    } catch (e) {
      await ngfRdbManager.rollback();
      logger.error(TAG, 'rebuild remote session table failed: ' + e);
      throw new Error('rebuild remote session table failed: ' + e);
    }
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
    if (!this.hasColumn(rows, 'diff_file_cursor')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_file_cursor INTEGER');
    }
    if (!this.hasColumn(rows, 'next_diff_file_cursor')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN next_diff_file_cursor INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_file_limit')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_file_limit INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_line_offset')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_line_offset INTEGER');
    }
    if (!this.hasColumn(rows, 'next_diff_line_offset')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN next_diff_line_offset INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_line_limit')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_line_limit INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_max_bytes')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_max_bytes INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_truncated')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_truncated INTEGER');
    }
    if (!this.hasColumn(rows, 'diff_truncation_reason')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_workspace_change ADD COLUMN diff_truncation_reason TEXT');
    }
  }

  private async ensureAgentV2Schema(): Promise<void> {
    const rows = await ngfRdbManager.queryRows('PRAGMA table_info(agent_v2)');
    if (!this.hasColumn(rows, 'config_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN config_json TEXT');
    }
    if (!this.hasColumn(rows, 'runtime_info_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN runtime_info_json TEXT');
    }
    if (!this.hasColumn(rows, 'persistence_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN persistence_json TEXT');
    }
    if (!this.hasColumn(rows, 'features_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN features_json TEXT');
    }
    if (!this.hasColumn(rows, 'thinking_option_id')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN thinking_option_id TEXT');
    }
    if (!this.hasColumn(rows, 'timeline_ack_json')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN timeline_ack_json TEXT');
    }
    if (!this.hasColumn(rows, 'last_user_message_at')) {
      await ngfRdbManager.executeSql('ALTER TABLE agent_v2 ADD COLUMN last_user_message_at TEXT');
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
