'use strict';

(() => {
  const state = {
    endpoint: '',
    token: '',
    ticket: '',
    clientId: '',
    appNonce: '',
    socket: null,
    seq: 0,
    pending: new Map(),
    agents: [],
    workspaces: [],
    workspaceActionInFlight: '',
    selectedAgent: '',
    selectedWorkspace: '',
    sessionId: '',
    terminals: [],
    selectedTerminal: '',
    terminalSlot: 0,
    terminalStreamProtocolVersion: 0,
    terminalOutput: '',
    terminalOutputBytes: 0,
    terminalOutputTruncated: false,
    terminalStreamState: null,
    changes: [],
    diffSummary: null,
    diffMode: 'files',
    diffCache: new Map(),
    selectedPath: '',
    diffText: '',
      diffRequest: null,
    fileParentPath: '',
    files: [],
    diagnostics: {
      loading: false,
      error: '',
      health: null,
      daemonStatus: null,
      workspaceDoctor: null,
      report: null,
      compatibility: null,
      updatedAt: ''
    },
    experience: {
      loading: false,
      error: '',
      queueItems: [],
      usageSummary: null,
      usageEvents: [],
      usageBudget: null,
      providerUsage: null,
      budgetWarning: null,
      usageWindow: 'session',
      usageWindowNotice: '',
      actionInFlight: new Set(),
      scopeKey: '',
      updatedAt: ''
    },
    composer: {
      tokens: [],
      mentionQuery: '',
      mentionCandidates: [],
      mentionSelectedIndex: 0,
      mentionStart: -1
    },
    metadata: {
      loading: false,
      applying: false,
      error: '',
      kind: 'sessionTitle',
      suggestion: '',
      alternatives: [],
      planId: '',
      requestId: '',
      sourceProvider: '',
      estimatedUsage: false,
      warnings: [],
      status: ''
    },
    hostProfileId: '',
    github: {
      loading: false,
      error: '',
      authenticated: false,
      source: '',
      account: null,
      accounts: [],
      authSessionId: '',
      authPending: null,
      authNextPollAt: 0,
      authPollTimer: 0,
      binding: null,
      owner: '',
      repo: '',
      prState: 'open',
      pullRequests: [],
      page: 1,
      perPage: 20,
      hasNext: false,
      selectedNumber: 0,
      selected: null,
      checks: null,
      watchId: '',
      watching: false,
      attachmentPlanId: '',
      attachmentPreview: null
    },
    browser: {
      hosts: [],
      instances: [],
      pages: [],
      selectedHostId: '',
      selectedPageId: '',
      refreshToken: 0,
      downloads: [],
      screenshot: {
        hostId: '',
        pageId: '',
        dataUrl: '',
        mimeType: '',
        bytes: null,
        fullPage: false
      },
      screenshotFullPage: false
    },
    capabilities: {
      serverInfo: {},
      features: {},
      hasFeatureAdvertisement: false,
      legacy: true,
      core: { agentList: true, agentAttach: true, agentSend: true, workspaceFallback: true, sessionAttachTimeline: true },
      compatibility: { status: 'unknown', blocking: false, reason: '', remediation: '', minimumAppVersion: '', recommendedAppVersion: '', minimumBridgeVersion: '', recommendedBridgeVersion: '' },
      warnings: ['feature_advertisement_missing']
    },
    providerCapabilities: [],
    providerCapabilitiesKnown: false,
    providerCapabilitiesGeneration: -1,
    features: {},
    reconnectTimer: 0,
    reconnectAttempt: 0,
    reconnectEnabled: true,
    pageClosing: false,
    connectionGeneration: 0,
    refreshInFlight: null,
    sessionRefreshInFlight: null,
    refreshTimer: 0,
    refreshInterval: 15000,
    sessionMessagesStaleFor: '',
    tabChannel: null
  };

  const byId = (id) => document.getElementById(id);
  const text = (node, value) => { if (node) node.textContent = value == null ? '' : String(value); };
  const clear = (node) => { if (!node) return; while (node.firstChild) node.removeChild(node.firstChild); };
  const safe = (value) => typeof value === 'string' ? value : '';
  const numberValue = (source, key, fallback) => source && typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback;
  const endpoint = () => state.endpoint.replace(/\/$/, '');
  const requestId = () => 'web_' + String(Date.now()) + '_' + String(++state.seq);
  const arrayValue = (source, key) => source && Array.isArray(source[key]) ? source[key] : [];
  const field = (source, key, fallback) => source && typeof source[key] === 'string' ? source[key] : fallback;
  const objectValue = (source, key) => source && source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : null;
  const webCompatibility = window.AgentBridgeWebCompatibility;
  const USAGE_WINDOWS = Object.freeze(['session', 'day', 'month']);

  function normalizeUsageWindow(value) {
    return typeof value === 'string' && USAGE_WINDOWS.includes(value) ? value : 'session';
  }

  function currentUsageWindow() {
    const selector = byId('usage-view-window');
    const candidate = selector && typeof selector.value === 'string' ? selector.value : state.experience.usageWindow;
    const normalized = normalizeUsageWindow(candidate);
    state.experience.usageWindow = normalized;
    return normalized;
  }

  function featureEnabled(name) {
    return webCompatibility ? webCompatibility.featureEnabled(state.capabilities, name) : state.features[name] === true;
  }

  function currentProviderId() {
    const agent = currentAgent();
    return field(agent, 'providerId', field(agent, 'provider', ''));
  }

  function providerCapabilityEnabled(capability) {
    if (!state.providerCapabilitiesKnown) return featureEnabled(capability);
    if (!webCompatibility || typeof webCompatibility.providerCapabilityEnabled !== 'function') return false;
    return webCompatibility.providerCapabilityEnabled(state.providerCapabilities, currentProviderId(), capability);
  }

  function usageEventsEnabled() {
    return featureEnabled('usageEvents') && providerCapabilityEnabled('usageEvents');
  }

  function metadataGenerationEnabled() {
    return featureEnabled('metadataGeneration') && providerCapabilityEnabled('metadataGeneration');
  }

  function experienceFeatureState() {
    const queueEnabled = featureEnabled('messageQueue');
    const usageEvents = usageEventsEnabled();
    const usageBudgets = featureEnabled('usageBudgets');
    const providerUsage = featureEnabled('providerUsage') && providerCapabilityEnabled('providerUsage');
    return {
      queueEnabled,
      usageEventsEnabled: usageEvents,
      usageBudgetEnabled: usageBudgets,
      usageEnabled: usageEvents || usageBudgets,
      providerUsageEnabled: providerUsage,
      metadataEnabled: metadataGenerationEnabled()
    };
  }

  function renderExperienceVisibility() {
    const stateSnapshot = experienceFeatureState();
    const section = byId('experience-section');
    const queuePanel = byId('queue-panel');
    const usagePanel = byId('usage-panel');
    const providerUsagePanel = byId('provider-usage-panel');
    const metadataPanel = byId('metadata-panel');
    const visible = stateSnapshot.queueEnabled || stateSnapshot.usageEnabled ||
      stateSnapshot.providerUsageEnabled || stateSnapshot.metadataEnabled;
    section.classList.toggle('hidden', !visible);
    queuePanel.classList.toggle('hidden', !stateSnapshot.queueEnabled);
    usagePanel.classList.toggle('hidden', !stateSnapshot.usageEnabled);
    providerUsagePanel.classList.toggle('hidden', !stateSnapshot.providerUsageEnabled);
    metadataPanel.classList.toggle('hidden', !stateSnapshot.metadataEnabled);
    return stateSnapshot;
  }

  function currentEventScope() {
    return {
      hostProfileId: state.hostProfileId,
      workspaceId: currentWorkspaceId(),
      agentId: state.selectedAgent,
      sessionId: state.sessionId
    };
  }

  const DIAGNOSTIC_GROUPS = ['daemon', 'provider', 'terminal', 'queue', 'usage', 'secureStorage', 'remoteConfig', 'persistence'];
  const DIAGNOSTIC_ACTIONS = new Set([
    'open_daemon_settings',
    'open_provider_settings',
    'open_terminal_settings',
    'review_message_queue',
    'open_usage_settings',
    'open_secure_storage_help',
    'refresh_remote_config',
    'repair_persistence'
  ]);

  const TerminalStreamOpcode = Object.freeze({
    OUTPUT: 0x01,
    INPUT: 0x02,
    RESIZE: 0x03,
    SNAPSHOT: 0x04,
    RESTORE: 0x05,
    MOUSE: 0x06
  });
  const TERMINAL_MAX_OUTPUT_BYTES = 512 * 1024;
  const terminalStream = window.AgentBridgeWebTerminalStream;
  if (!terminalStream) throw new Error('Terminal stream state module is unavailable.');
  state.terminalStreamState = terminalStream.createState();

  function textDecoder() {
    return new TextDecoder('utf-8', { fatal: false });
  }

  function decodeBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(0);
  }

  function decodeUtf8(bytes) {
    return textDecoder().decode(bytes);
  }

  function boundedTerminalText(value, replace) {
    const source = typeof value === 'string' ? value : '';
    const combined = replace ? source : state.terminalOutput + source;
    const bytes = new TextEncoder().encode(combined);
    if (bytes.length <= TERMINAL_MAX_OUTPUT_BYTES) {
      return { text: combined, bytes: bytes.length, truncated: false };
    }
    const tail = bytes.slice(bytes.length - TERMINAL_MAX_OUTPUT_BYTES);
    return { text: decodeUtf8(tail), bytes: tail.length, truncated: true };
  }

  function renderTerminalOutput() {
    text(byId('terminal-output'), state.terminalOutput);
    const status = state.terminalOutputTruncated ? 'Output truncated to the most recent 512 KiB.' : '';
    text(byId('terminal-stream-status'), status);
  }

  function setTerminalOutput(value, replace) {
    const bounded = boundedTerminalText(value, replace);
    state.terminalOutput = bounded.text;
    state.terminalOutputBytes = bounded.bytes;
    state.terminalOutputTruncated = bounded.truncated;
    renderTerminalOutput();
  }

  function decodeTerminalSnapshot(bytes) {
    return terminalStream.decodeSnapshot(bytes);
  }

  function handleTerminalBinaryFrame(value) {
    const bytes = decodeBytes(value);
    if (bytes.length < 2) return;
    const opcode = bytes[0];
    const slot = bytes[1];
    if (state.terminalSlot <= 0 || slot !== state.terminalSlot) return;
    const payload = bytes.slice(2);
    if (opcode === TerminalStreamOpcode.OUTPUT) {
      if (!terminalStream.acceptOutput(state.terminalStreamState)) return;
      setTerminalOutput(decodeUtf8(payload), false);
      return;
    }
    if (opcode === TerminalStreamOpcode.RESTORE || opcode === TerminalStreamOpcode.SNAPSHOT) {
      const snapshot = decodeTerminalSnapshot(payload);
      if (!terminalStream.acceptSnapshot(state.terminalStreamState, snapshot)) {
        text(byId('terminal-stream-status'), 'Ignored stale terminal restore frame.');
        return;
      }
      setTerminalOutput(snapshot.text, true);
      if (snapshot.truncated) {
        state.terminalOutputTruncated = true;
        renderTerminalOutput();
      }
    }
  }

  function sendTerminalFrame(opcode, slot, payload) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) throw new Error('Bridge is disconnected.');
    if (!Number.isInteger(slot) || slot <= 0 || slot > 255) throw new Error('Terminal stream is not subscribed.');
    if (state.socket.bufferedAmount > 1024 * 1024) throw new Error('Terminal stream is backpressured; try again shortly.');
    const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : decodeBytes(payload);
    const frame = new Uint8Array(2 + body.length);
    frame[0] = opcode;
    frame[1] = slot;
    frame.set(body, 2);
    state.socket.send(frame);
  }

  function showWorkspace(visible) {
    byId('auth-panel').classList.toggle('hidden', visible);
    byId('workspace').classList.toggle('hidden', !visible);
  }

  function restoreTabIdentity() {
    if (state.clientId.length === 0) {
      state.clientId = sessionStorage.getItem('ngf_web_client_id') || ('web_' + crypto.randomUUID());
      sessionStorage.setItem('ngf_web_client_id', state.clientId);
    }
    if (state.tabChannel) return;
    if (typeof BroadcastChannel === 'function') {
      state.tabChannel = new BroadcastChannel('ngf-agent-bridge-web');
      state.tabChannel.addEventListener('message', (event) => handleTabMessage(event && event.data));
    }
  }

  function broadcastTabEvent(type, payload) {
    if (!state.tabChannel) return;
    state.tabChannel.postMessage({
      source: state.clientId,
      type,
      endpoint: endpoint(),
      hostProfileId: state.hostProfileId,
      payload: payload || {}
    });
  }

  function experienceTabScope(extra) {
    const scope = {
      hostProfileId: state.hostProfileId,
      workspaceId: currentWorkspaceId(),
      agentId: state.selectedAgent,
      sessionId: state.sessionId
    };
    if (extra && typeof extra === 'object') {
      if (typeof extra.reason === 'string') scope.reason = extra.reason;
      if (typeof extra.queueId === 'string') scope.queueId = extra.queueId;
      if (typeof extra.providerId === 'string') scope.providerId = extra.providerId;
      if (typeof extra.window === 'string') scope.window = normalizeUsageWindow(extra.window);
    }
    return scope;
  }

  function broadcastExperienceChanged(reason, extra) {
    const scope = experienceTabScope(extra);
    scope.reason = typeof reason === 'string' && reason.length > 0 ? reason : 'updated';
    broadcastTabEvent('experience.changed', scope);
  }

  function tabScopeMatches(message) {
    const messageEndpoint = field(message, 'endpoint', '').trim().replace(/\/+$/, '');
    const currentEndpoint = endpoint();
    if (messageEndpoint.length > 0 && currentEndpoint.length > 0 && messageEndpoint !== currentEndpoint) return false;
    const eventType = field(message, 'type', '');
    if (eventType === 'logout') return true;
    const messageHost = field(message, 'hostProfileId', '');
    if (messageHost.length > 0 && state.hostProfileId.length > 0 && messageHost !== state.hostProfileId) return false;
    const payload = objectValue(message, 'payload');
    const payloadHost = field(payload, 'hostProfileId', '');
    return payloadHost.length === 0 || state.hostProfileId.length === 0 || payloadHost === state.hostProfileId;
  }

  function tabExperienceScopeMatches(payload) {
    const current = currentEventScope();
    const hostProfileId = field(payload, 'hostProfileId', '');
    const workspaceId = field(payload, 'workspaceId', '');
    const agentId = field(payload, 'agentId', '');
    const sessionId = field(payload, 'sessionId', '');
    if (hostProfileId !== current.hostProfileId) return false;
    if (workspaceId.length === 0 || workspaceId !== current.workspaceId) return false;
    if (agentId.length === 0 || agentId !== current.agentId) return false;
    if (sessionId.length === 0 || sessionId !== current.sessionId) return false;
    return true;
  }

  function handleTabMessage(message) {
    if (!message || typeof message !== 'object' || field(message, 'source', '') === state.clientId) return;
    if (!tabScopeMatches(message)) return;
    const eventType = field(message, 'type', '');
    const payload = objectValue(message, 'payload');
    if (eventType === 'refresh') {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) refreshAll().catch(() => {});
      return;
    }
    if (eventType === 'workspace.changed') {
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
      const workspaceId = field(payload, 'workspaceId', '');
      const previousWorkspace = state.selectedWorkspace;
      const previousAgent = state.selectedAgent;
      refreshWorkspaces().then(() => {
        renderAgents();
        const selectionChanged = previousWorkspace !== state.selectedWorkspace || previousAgent !== state.selectedAgent;
        if (selectionChanged || workspaceId.length === 0 || workspaceId === state.selectedWorkspace) return refreshSession();
        return null;
      }).catch(() => {});
      return;
    }
    if (eventType === 'scope.changed') {
      const workspaceId = field(payload, 'workspaceId', '');
      const agentId = field(payload, 'agentId', '');
      if (state.socket && state.socket.readyState === WebSocket.OPEN &&
        (workspaceId.length === 0 || workspaceId === state.selectedWorkspace) &&
        (agentId.length === 0 || agentId === state.selectedAgent)) refreshSession().catch(() => {});
      return;
    }
    if (eventType === 'session.changed') {
      const sessionId = field(payload, 'sessionId', '');
      const workspaceId = field(payload, 'workspaceId', '');
      const agentId = field(payload, 'agentId', '');
      if (state.socket && state.socket.readyState === WebSocket.OPEN &&
        (sessionId.length === 0 || sessionId === state.sessionId) &&
        (workspaceId.length === 0 || workspaceId === state.selectedWorkspace) &&
        (agentId.length === 0 || agentId === state.selectedAgent)) refreshSession().catch(() => {});
      return;
    }
    if (eventType === 'experience.changed') {
      if (!tabExperienceScopeMatches(payload)) return;
      if (state.socket && state.socket.readyState === WebSocket.OPEN) refreshExperience().catch(() => {});
      return;
    }
    if (eventType === 'logout') {
      void shutdownTransport('web logout in another tab', true).then(() => {
        setConnection('Signed out in another tab', '');
        showWorkspace(false);
      });
    }
  }

  function setConnection(label, kind) {
    const node = byId('connection-state');
    text(node, label);
    node.className = 'badge ' + (kind || '');
  }

  function parseJson(value) {
    try { return JSON.parse(value); } catch (_error) { return null; }
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    text(byId('auth-error'), message);
    text(byId('detail-output'), message);
  }

  function normalizeDiagnosticCheck(source) {
    const item = source && typeof source === 'object' ? source : {};
    const status = ['ok', 'info', 'warning', 'error'].includes(field(item, 'status', 'info')) ? field(item, 'status', 'info') : 'info';
    const actionId = DIAGNOSTIC_ACTIONS.has(field(item, 'actionId', '')) ? field(item, 'actionId', '') : '';
    return {
      id: field(item, 'id', 'check'),
      status,
      message: field(item, 'message', ''),
      remediation: field(item, 'remediation', ''),
      actionId
    };
  }

  function normalizeDiagnosticGroup(source, fallbackId) {
    const item = source && typeof source === 'object' ? source : {};
    const checks = arrayValue(item, 'checks').map((check) => normalizeDiagnosticCheck(check));
    return {
      id: field(item, 'id', fallbackId),
      title: field(item, 'title', field(item, 'id', fallbackId)),
      status: ['ok', 'info', 'warning', 'error'].includes(field(item, 'status', 'info')) ? field(item, 'status', 'info') : 'info',
      checks
    };
  }

  function normalizeDiagnosticsReport(source) {
    const report = source && typeof source === 'object' ? source : {};
    const rawGroups = arrayValue(report, 'groups');
    const groups = [];
    DIAGNOSTIC_GROUPS.forEach((groupId) => {
      const match = rawGroups.find((group) => field(group, 'id', '') === groupId);
      groups.push(normalizeDiagnosticGroup(match, groupId));
    });
    return {
      schemaVersion: numberValue(report, 'schemaVersion', 0),
      format: field(report, 'format', 'json'),
      generatedAt: field(report, 'generatedAt', ''),
      truncated: report.truncated === true,
      groups
    };
  }

  function normalizeCompatibility(source) {
    const compatibility = source && typeof source === 'object' ? source : {};
    const status = ['compatible', 'upgradeRecommended', 'appTooOld', 'bridgeTooOld', 'unknown'].includes(field(compatibility, 'status', 'unknown'))
      ? field(compatibility, 'status', 'unknown')
      : 'unknown';
    return {
      status,
      blocking: compatibility.blocking === true,
      reason: field(compatibility, 'reason', ''),
      remediation: field(compatibility, 'remediation', ''),
      minimumAppVersion: field(compatibility, 'minimumAppVersion', ''),
      recommendedAppVersion: field(compatibility, 'recommendedAppVersion', ''),
      minimumBridgeVersion: field(compatibility, 'minimumBridgeVersion', ''),
      recommendedBridgeVersion: field(compatibility, 'recommendedBridgeVersion', '')
    };
  }

  function normalizeQueueItem(source) {
    return webCompatibility && typeof webCompatibility.normalizeQueueItem === 'function'
      ? webCompatibility.normalizeQueueItem(source) : (source && typeof source === 'object' ? source : {});
  }

  function normalizeUsageSummary(source) {
    return webCompatibility && typeof webCompatibility.normalizeUsageSummary === 'function'
      ? webCompatibility.normalizeUsageSummary(source) : (source && typeof source === 'object' ? source : {});
  }

  function normalizeUsageEvent(source) {
    return webCompatibility && typeof webCompatibility.normalizeUsageEvent === 'function'
      ? webCompatibility.normalizeUsageEvent(source) : (source && typeof source === 'object' ? source : {});
  }

  function normalizeUsageBudget(source) {
    return webCompatibility && typeof webCompatibility.normalizeUsageBudget === 'function'
      ? webCompatibility.normalizeUsageBudget(source) : (source && typeof source === 'object' ? source : {});
  }

  function normalizeMetadataResult(source) {
    return webCompatibility && typeof webCompatibility.normalizeMetadataResult === 'function'
      ? webCompatibility.normalizeMetadataResult(source) : (source && typeof source === 'object' ? source : {});
  }

  function normalizeGithubAccount(source) {
    const item = source && typeof source === 'object' ? source : {};
    return {
      id: field(item, 'id', ''),
      login: field(item, 'login', field(item, 'id', 'Account')),
      avatarUrl: field(item, 'avatarUrl', ''),
      scope: field(item, 'scope', ''),
      source: field(item, 'source', 'unknown'),
      updatedAt: field(item, 'updatedAt', '')
    };
  }

  function normalizeGithubBinding(source) {
    const item = source && typeof source === 'object' ? source : {};
    return {
      id: field(item, 'id', ''),
      hostProfileId: field(item, 'hostProfileId', ''),
      workspaceId: field(item, 'workspaceId', ''),
      accountId: field(item, 'accountId', ''),
      owner: field(item, 'owner', ''),
      repo: field(item, 'repo', ''),
      updatedAt: field(item, 'updatedAt', '')
    };
  }

  function normalizeGithubPullRequest(source) {
    const item = source && typeof source === 'object' ? source : {};
    return {
      number: numberValue(item, 'number', 0),
      url: field(item, 'url', ''),
      state: field(item, 'state', ''),
      title: field(item, 'title', ''),
      body: field(item, 'body', ''),
      head: field(item, 'head', ''),
      base: field(item, 'base', ''),
      sha: field(item, 'sha', ''),
      draft: item.draft === true,
      mergeable: item.mergeable === true,
      mergeState: field(item, 'mergeState', ''),
      reviewDecision: field(item, 'reviewDecision', ''),
      reviewers: arrayValue(item, 'reviewers').map((value) => typeof value === 'string' ? value : field(value, 'login', '')).filter((value) => value.length > 0),
      labels: arrayValue(item, 'labels').map((value) => typeof value === 'string' ? value : field(value, 'name', '')).filter((value) => value.length > 0),
      conflict: item.conflict === true,
      updatedAt: field(item, 'updatedAt', '')
    };
  }

  function normalizeGithubChecks(source) {
    const item = source && typeof source === 'object' ? source : {};
    const rawSummary = objectValue(item, 'checksSummary') || {};
    return {
      sha: field(item, 'sha', ''),
      summary: {
        total: numberValue(rawSummary, 'total', 0),
        passed: numberValue(rawSummary, 'passed', 0),
        failed: numberValue(rawSummary, 'failed', 0),
        pending: numberValue(rawSummary, 'pending', 0),
        cancelled: numberValue(rawSummary, 'cancelled', 0),
        conclusion: field(rawSummary, 'conclusion', 'unknown'),
        failures: arrayValue(rawSummary, 'failures').filter((value) => typeof value === 'string')
      },
      checkRuns: arrayValue(item, 'checkRuns'),
      statuses: arrayValue(item, 'statuses'),
      updatedAt: field(item, 'updatedAt', new Date().toISOString())
    };
  }

  function githubPayload(extra) {
    const base = {
      hostProfileId: state.hostProfileId,
      workspaceId: currentWorkspaceId(),
      accountId: state.github.account ? state.github.account.id : '',
      owner: state.github.owner,
      repo: state.github.repo,
      sessionId: state.sessionId,
      workspacePath: currentWorkspacePath()
    };
    return Object.assign(base, extra || {});
  }

  function githubAccountId() {
    return state.github.account ? state.github.account.id : '';
  }

  function setGithubError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    state.github.error = message;
    text(byId('github-error'), message);
  }

  function githubVerificationUrl(value) {
    const candidate = safe(value).trim();
    if (!candidate) return '';
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch (_error) {
      return '';
    }
  }

  function renderGithubAccounts() {
    const select = byId('github-account-select');
    clear(select);
    state.github.accounts.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      text(option, account.login + ' · ' + account.source);
      select.appendChild(option);
    });
    select.disabled = state.github.accounts.length === 0;
    if (state.github.account) select.value = state.github.account.id;
  }

  function renderGithubPrList() {
    const list = byId('github-pr-list');
    clear(list);
    state.github.pullRequests.forEach((pullRequest) => {
      const item = document.createElement('div');
      item.className = 'item github-pr-item' + (pullRequest.number === state.github.selectedNumber ? ' active' : '');
      const title = document.createElement('strong');
      text(title, '#' + String(pullRequest.number) + ' ' + pullRequest.title);
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'meta';
      text(meta, pullRequest.state + (pullRequest.draft ? ' · draft' : '') + ' · ' + pullRequest.head + ' → ' + pullRequest.base);
      item.appendChild(meta);
      const button = document.createElement('button');
      button.type = 'button';
      text(button, 'Open');
      button.addEventListener('click', () => selectGithubPullRequest(pullRequest.number).catch(setGithubError));
      item.appendChild(button);
      list.appendChild(item);
    });
    if (state.github.pullRequests.length === 0) text(list, 'No pull requests for this binding.');
  }

  function renderGithubDetail() {
    const detail = byId('github-pr-detail');
    const selected = state.github.selected;
    detail.classList.toggle('hidden', !selected);
    if (!selected) return;
    text(byId('github-pr-summary'), '#' + String(selected.number) + ' · ' + selected.state + (selected.draft ? ' · draft' : ' · ready') + ' · review ' + selected.reviewDecision + ' · merge ' + selected.mergeState + (selected.conflict ? ' · conflict' : ''));
    byId('github-pr-title').value = selected.title;
    byId('github-pr-body').value = selected.body;
    const readyButton = byId('github-pr-ready-button');
    readyButton.disabled = !selected.draft;
    text(readyButton, selected.draft ? 'Mark ready' : 'Ready');
    const watchButton = byId('github-pr-watch-button');
    text(watchButton, state.github.watching ? 'Stop watch' : 'Watch');
    byId('github-attachment-controls').classList.toggle('hidden', !featureEnabled('githubAssetUpload'));
    byId('github-attachment-upload-button').classList.toggle('hidden', state.github.attachmentPlanId.length === 0);
    renderGithubChecks();
  }

  function renderGithubChecks() {
    const checks = state.github.checks;
    if (!checks) {
      text(byId('github-checks-output'), 'Checks unavailable.');
      return;
    }
    const summary = checks.summary;
    const lines = ['Checks: ' + summary.conclusion, 'total=' + String(summary.total) + ' passed=' + String(summary.passed) + ' failed=' + String(summary.failed) + ' pending=' + String(summary.pending)];
    if (summary.failures.length > 0) lines.push('Failures: ' + summary.failures.join(', '));
    text(byId('github-checks-output'), lines.join('\n'));
  }

  function renderGithub() {
    const section = byId('github-section');
    if (!section) return;
    const enabled = featureEnabled('githubIntegration') && featureEnabled('githubPrWorkflow');
    section.classList.toggle('hidden', !enabled);
    if (!enabled) return;
    const authLabel = state.github.authenticated ? 'Signed in' : 'Not signed in';
    const bindingLabel = state.github.owner && state.github.repo ? state.github.owner + '/' + state.github.repo : 'No workspace binding';
    text(byId('github-status'), authLabel + ' · ' + bindingLabel + (state.github.watching ? ' · watching' : ''));
    text(byId('github-error'), state.github.error);
    byId('github-auth-button').classList.toggle('hidden', state.github.authenticated || state.github.authSessionId.length > 0);
    byId('github-logout-button').classList.toggle('hidden', !state.github.authenticated);
    byId('github-auth-poll-button').classList.toggle('hidden', state.github.authSessionId.length === 0);
    const code = byId('github-auth-code');
    const link = byId('github-auth-link');
    code.classList.toggle('hidden', state.github.authSessionId.length === 0);
    link.classList.toggle('hidden', state.github.authSessionId.length === 0);
    if (state.github.authSessionId.length > 0) text(code, 'User code: ' + field(state.github.authPending, 'userCode', 'available from Bridge') + ' · next poll ' + (state.github.authNextPollAt > 0 ? new Date(state.github.authNextPollAt).toLocaleTimeString() : 'now'));
    const verificationUrl = githubVerificationUrl(field(state.github.authPending, 'verificationUri', ''));
    clear(link);
    if (verificationUrl) {
      const anchor = document.createElement('a');
      anchor.href = verificationUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      text(anchor, verificationUrl);
      link.appendChild(anchor);
    }
    renderGithubAccounts();
    byId('github-binding-button').disabled = !state.github.authenticated || state.github.accounts.length === 0 || !currentWorkspaceId();
    byId('github-pr-create-button').disabled = !state.github.authenticated || !state.github.owner || !state.github.repo;
    byId('github-pr-prev-button').disabled = state.github.page <= 1;
    byId('github-pr-next-button').disabled = !state.github.hasNext;
    renderGithubPrList();
    renderGithubDetail();
  }

  function fallbackReportFromDoctor(doctor, daemonStatus) {
    const checks = arrayValue(doctor, 'checks').map((check) => normalizeDiagnosticCheck(check));
    const daemonChecks = checks.length > 0 ? checks : [{ id: 'daemon_status', status: field(daemonStatus, 'instanceHealth', 'info') === 'healthy' ? 'ok' : 'info', message: field(daemonStatus, 'status', 'Bridge status unavailable.'), remediation: '', actionId: '' }];
    return {
      schemaVersion: 0,
      format: 'json',
      generatedAt: field(doctor, 'generatedAt', new Date().toISOString()),
      truncated: false,
      groups: DIAGNOSTIC_GROUPS.map((groupId) => ({ id: groupId, title: groupId, status: groupId === 'daemon' ? (daemonChecks.some((check) => check.status === 'error') ? 'error' : 'info') : 'info', checks: groupId === 'daemon' ? daemonChecks : [] }))
    };
  }

  function diagnosticStatusLabel(status) {
    if (status === 'ok') return 'OK';
    if (status === 'warning') return 'Warning';
    if (status === 'error') return 'Error';
    return 'Info';
  }

  function renderCompatibility(compatibility) {
    const item = compatibility || normalizeCompatibility(null);
    const parts = [item.status];
    if (item.reason.length > 0) parts.push(item.reason);
    if (item.blocking) parts.push('Blocking');
    text(byId('compatibility'), parts.join(' · '));
    const remediation = item.remediation.length > 0 ? 'Remediation: ' + item.remediation : '';
    text(byId('compatibility-remediation'), remediation);
    const node = byId('compatibility');
    if (node) node.className = 'notice compatibility-' + item.status;
  }

  function renderDiagnosticsReport(report, diagnostics) {
    const doctorSection = byId('doctor-section');
    if (!doctorSection) return;
    doctorSection.classList.remove('hidden');
    const stateLabel = diagnostics && diagnostics.loading ? 'Loading diagnostic state...' : 'Updated ' + (diagnostics && diagnostics.updatedAt ? diagnostics.updatedAt : 'not yet');
    text(byId('doctor-summary'), stateLabel);
    text(byId('doctor-error'), diagnostics && diagnostics.error ? diagnostics.error : '');
    const list = byId('doctor-groups');
    clear(list);
    const source = report || normalizeDiagnosticsReport(null);
    source.groups.forEach((group) => {
      const item = document.createElement('div');
      item.className = 'item doctor-group status-' + group.status;
      const heading = document.createElement('div');
      heading.className = 'section-title';
      const title = document.createElement('strong');
      text(title, group.title + ' · ' + diagnosticStatusLabel(group.status));
      heading.appendChild(title);
      item.appendChild(heading);
      group.checks.forEach((check) => {
        const row = document.createElement('div');
        row.className = 'doctor-check status-' + check.status;
        const message = document.createElement('span');
        text(message, check.id + ': ' + check.message);
        row.appendChild(message);
        if (check.remediation.length > 0) {
          const remediation = document.createElement('div');
          remediation.className = 'muted';
          text(remediation, check.remediation);
          row.appendChild(remediation);
        }
        if (check.actionId.length > 0) {
          const action = document.createElement('button');
          action.type = 'button';
          text(action, 'Open safe action');
          action.addEventListener('click', () => handleDiagnosticAction(check.actionId));
          row.appendChild(action);
        }
        item.appendChild(row);
      });
      list.appendChild(item);
    });
  }

  function handleDiagnosticAction(actionId) {
    if (!DIAGNOSTIC_ACTIONS.has(actionId)) {
      text(byId('doctor-error'), 'This diagnostic action is unavailable in the Web UI.');
      return;
    }
    if (actionId === 'open_terminal_settings') {
      byId('terminal-section').scrollIntoView({ block: 'nearest' });
      refreshTerminals().catch(showError);
      return;
    }
    if (actionId === 'refresh_remote_config') {
      refreshDiagnostics().catch(showError);
      return;
    }
    if (actionId === 'open_daemon_settings' || actionId === 'open_provider_settings' || actionId === 'open_usage_settings' || actionId === 'open_secure_storage_help' || actionId === 'repair_persistence' || actionId === 'review_message_queue') {
      byId('settings-dialog').showModal();
      text(byId('settings-status'), 'Review the Bridge settings and run a fresh diagnostic check.');
    }
  }

  async function http(pathname, options) {
    const request = Object.assign({ headers: {}, credentials: 'include' }, options || {});
    request.headers = Object.assign({}, request.headers);
    if (state.token.length > 0) request.headers.Authorization = 'Bearer ' + state.token;
    request.headers.Accept = 'application/json';
    const response = await fetch(endpoint() + pathname, request);
    if (!response.ok) {
      const error = new Error('HTTP ' + String(response.status));
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function openTicket() {
    const headers = { Origin: window.location.origin };
    if (state.token.length > 0) headers.Authorization = 'Bearer ' + state.token;
    const response = await fetch(endpoint() + '/web/auth/session', { method: 'POST', headers, credentials: 'include' });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Web session expired; connect again.' : 'Authentication failed.');
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    state.ticket = field(payload, 'ticket', '');
    if (state.ticket.length === 0) throw new Error('Bridge did not issue a WebSocket ticket.');
  }

  function rejectPending(error) {
    for (const item of state.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    state.pending.clear();
  }

  function ensureRefreshCurrent(generation) {
    if (state.connectionGeneration === generation && state.reconnectEnabled && !state.pageClosing && state.socket && state.socket.readyState === WebSocket.OPEN) return;
    const error = new Error('Web refresh cancelled by connection lifecycle.');
    error.code = 'WEB_REFRESH_CANCELLED';
    throw error;
  }

  function send(type, payload, explicitRequestId) {
    return new Promise((resolve, reject) => {
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Bridge is disconnected.'));
        return;
      }
      const id = typeof explicitRequestId === 'string' && explicitRequestId.length > 0 ? explicitRequestId : requestId();
      const timer = window.setTimeout(() => {
        const item = state.pending.get(id);
        if (!item) return;
        state.pending.delete(id);
        item.reject(new Error('Request timed out.'));
      }, 20000);
      state.pending.set(id, { resolve, reject, timer });
      state.socket.send(JSON.stringify({ id, type, payload: payload || {} }));
    });
  }

  function scheduleReconnect() {
    if (!state.reconnectEnabled || state.pageClosing) return;
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(30000, 500 * Math.pow(2, state.reconnectAttempt));
    state.reconnectAttempt += 1;
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = 0;
      if (!state.reconnectEnabled || state.pageClosing) return;
      connect().catch(() => scheduleReconnect());
    }, delay);
  }

  async function connect() {
    if (!state.reconnectEnabled || state.pageClosing) return;
    if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = 0;
    const connectionGeneration = state.connectionGeneration + 1;
    state.connectionGeneration = connectionGeneration;
    state.providerCapabilities = [];
    state.providerCapabilitiesKnown = false;
    state.providerCapabilitiesGeneration = -1;
    state.appNonce = crypto.randomUUID();
    await openTicket();
    if (!state.reconnectEnabled || state.pageClosing || state.connectionGeneration !== connectionGeneration) return;
    const socketUrl = endpoint().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws?clientId=' + encodeURIComponent(state.clientId) + '&appNonce=' + encodeURIComponent(state.appNonce) + '&webTicket=' + encodeURIComponent(state.ticket);
    const socket = new WebSocket(socketUrl);
    socket.binaryType = 'arraybuffer';
    state.socket = socket;
    socket.onopen = async () => {
      if (state.socket !== socket || state.connectionGeneration !== connectionGeneration || !state.reconnectEnabled || state.pageClosing) {
        socket.close(1000, 'stale web connection');
        return;
      }
      state.reconnectAttempt = 0;
      setConnection('Connected', 'ok');
      try {
        // Resolve the host identity before the first hello so usage events are
        // recorded under the same hostProfileId the workbench later queries with.
        // (Previously the hello carried no host; events landed hostless while
        // refreshExperience queried 'web-host', so the Usage panel could never
        // see the Web UI's own message usage.)
        state.hostProfileId = state.hostProfileId || 'web-host';
        await send('hello', { clientId: state.clientId, appNonce: state.appNonce, appName: 'NGF Web UI', appVersion: 'r6', protocolVersion: 'agent-bridge.v2', hostProfileId: state.hostProfileId });
        await refreshAll();
      } catch (error) {
        setConnection(error.message, 'bad');
        showError(error);
      }
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') handleMessage(parseJson(event.data));
      else handleTerminalBinaryFrame(event.data);
    };
    socket.onclose = () => {
      if (state.socket !== socket) return;
      state.socket = null;
      clearComposerTokens();
      clearBrowserScreenshot();
      stopGithubWatch().catch(() => {});
      state.terminalSlot = 0;
      state.terminalStreamProtocolVersion = 0;
      terminalStream.reset(state.terminalStreamState);
      rejectPending(new Error('Bridge connection closed.'));
      if (!state.reconnectEnabled || state.pageClosing) {
        setConnection('Disconnected', '');
        return;
      }
      setConnection('Reconnecting', '');
      scheduleReconnect();
    };
    socket.onerror = () => setConnection('Connection error', 'bad');
  }

  async function shutdownTransport(reason, closeTabChannel) {
    state.reconnectEnabled = false;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = 0;
    clearInterval(state.refreshTimer);
    state.refreshTimer = 0;
    clearComposerTokens();
    void stopGithubWatch().catch(() => {});
    void unsubscribeTerminal(state.selectedTerminal).catch(() => {});
    const socket = state.socket;
    state.socket = null;
    clearBrowserScreenshot();
    state.terminalSlot = 0;
    state.terminalStreamProtocolVersion = 0;
    terminalStream.reset(state.terminalStreamState);
    state.connectionGeneration += 1;
    state.refreshInFlight = null;
    rejectPending(new Error(reason || 'Web connection closed.'));
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, reason || 'web shutdown');
    if (closeTabChannel && state.tabChannel) {
      state.tabChannel.close();
      state.tabChannel = null;
    }
  }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'response' && typeof message.id === 'string') {
      const item = state.pending.get(message.id);
      if (!item) return;
      state.pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.ok === false) item.reject(new Error(field(message.error, 'message', 'Request failed.')));
      else item.resolve(message.payload || message);
      return;
    }
    if (message.type !== 'event') return;
    const normalizedEvent = webCompatibility ? webCompatibility.normalizeEvent(message) : { event: field(message, 'event', ''), known: true, payload: {}, hostProfileId: '', workspaceId: '', agentId: '', sessionId: field(message, 'sessionId', '') };
    if (!normalizedEvent.known) return;
    if (webCompatibility && !webCompatibility.eventMatchesScope(normalizedEvent, currentEventScope())) return;
    const eventName = normalizedEvent.event;
    if (eventName === 'session.messages') {
      // The session.messages response already carries the full message list.
      // Do not re-query on its broadcast event to avoid an event->query feedback loop.
      return;
    }
    if (eventName === 'agent.updated' || eventName === 'message.completed' || eventName === 'message.delta') refreshSession().catch(() => {});
    if (eventName === 'message.queue.updated' || eventName === 'usage.updated' || eventName === 'usage.budget.warning') refreshExperience().catch(() => {});
    if (eventName === 'workspace.registry.updated') refreshWorkspaces().catch(() => {});
    if (eventName === 'terminal.updated' || eventName === 'terminal.activity' || eventName === 'terminal.snapshot' || eventName === 'terminal.stream.exit' || eventName === 'terminal.attention') refreshTerminals().catch(() => {});
    if (eventName === 'workspace.changes.updated') refreshGit().catch(() => {});
    if (eventName === 'notification.updated') loadNotifications().catch(() => {});
    if (eventName === 'browser.updated') refreshBrowser().catch(() => {});
    if (eventName === 'github.auth.updated' || eventName === 'github.binding.updated') refreshGithub().catch(() => {});
    if (eventName === 'github.checks.updated') refreshGithubChecks().catch(() => {});
    if (eventName === 'github.pr.updated') {
      if (state.github.selectedNumber > 0) selectGithubPullRequest(state.github.selectedNumber).catch(() => {});
      else refreshGithubPullRequests().catch(() => {});
    }
    if (eventName === 'daemon.health.updated' || eventName === 'daemon.config.updated' || eventName === 'workspace.registry.updated') refreshDiagnostics().catch(() => {});
  }

  function currentAgent() {
    return state.agents.find((item) => field(item, 'id', '') === state.selectedAgent) || null;
  }

  function currentWorkspace() {
    return state.workspaces.find((item) => field(item, 'workspaceId', '') === state.selectedWorkspace) || null;
  }

  function currentWorkspaceId() {
    const agent = currentAgent();
    return state.selectedWorkspace || (agent ? field(agent, 'workspaceId', '') : '');
  }

  function currentWorkspacePath() {
    const workspace = currentWorkspace();
    if (workspace) return field(workspace, 'cwd', field(workspace, 'workspacePath', ''));
    const agent = currentAgent();
    return agent ? field(agent, 'cwd', field(agent, 'rootPath', '')) : '';
  }

  const COMPOSER_MENTION_KINDS = Object.freeze(['workspace', 'file', 'agent']);

  function safeComposerFilePath(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().replace(/\\/g, '/');
    if (normalized.length === 0 || normalized.startsWith('/') || normalized.includes(':') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) return '';
    return normalized;
  }

  function composerMentionContext(input) {
    if (!input || typeof input.value !== 'string' || input.selectionStart !== input.selectionEnd) return null;
    const caret = input.selectionEnd;
    const prefix = input.value.substring(0, caret);
    const match = /(?:^|\s)@([A-Za-z0-9._:/-]*)$/.exec(prefix);
    if (!match) return null;
    const raw = match[1];
    const atIndex = prefix.length - raw.length - 1;
    let kindFilter = '';
    let query = raw;
    const separator = raw.indexOf(':');
    if (separator > 0) {
      const candidateKind = raw.substring(0, separator).toLowerCase();
      if (COMPOSER_MENTION_KINDS.includes(candidateKind)) {
        kindFilter = candidateKind;
        query = raw.substring(separator + 1);
      }
    }
    return { start: atIndex, end: caret, query: query.toLowerCase(), kindFilter };
  }

  function composerMentionCandidates(context) {
    const candidates = [];
    const seen = new Set();
    const hostProfileId = state.hostProfileId;
    const currentWorkspaceIdValue = currentWorkspaceId();
    const query = context.query;
    const add = (kind, label, value, workspaceId, description) => {
      if (!COMPOSER_MENTION_KINDS.includes(kind) || (context.kindFilter && context.kindFilter !== kind)) return;
      const normalizedLabel = typeof label === 'string' ? label.replace(/[\r\n]+/g, ' ').trim() : '';
      const normalizedValue = typeof value === 'string' ? value.trim() : '';
      if (!normalizedLabel || !normalizedValue) return;
      if (kind === 'file' && !safeComposerFilePath(normalizedValue)) return;
      const haystack = (normalizedLabel + ' ' + normalizedValue + ' ' + (description || '')).toLowerCase();
      if (query.length > 0 && !haystack.includes(query)) return;
      const key = kind + ':' + normalizedValue + ':' + (workspaceId || '');
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        kind,
        label: normalizedLabel.slice(0, 96),
        value: normalizedValue.slice(0, 512),
        workspaceId: workspaceId || '',
        hostProfileId,
         description: typeof description === 'string' ? description.replace(/[\r\n]+/g, ' ').slice(0, 180) : ''
      });
    };
    state.workspaces.forEach((workspace) => {
      const workspaceId = field(workspace, 'workspaceId', '');
      const title = field(workspace, 'title', field(workspace, 'displayName', workspaceId));
      add('workspace', title, workspaceId, workspaceId, field(workspace, 'cwd', field(workspace, 'workspacePath', '')));
    });
    state.agents.forEach((agent) => {
      const workspaceId = field(agent, 'workspaceId', '');
      if (currentWorkspaceIdValue && workspaceId !== currentWorkspaceIdValue) return;
      add('agent', field(agent, 'title', field(agent, 'id', 'Agent')), field(agent, 'id', ''), workspaceId, field(agent, 'status', field(agent, 'lastStatus', '')));
    });
    state.files.forEach((file) => {
      if (field(file, 'kind', 'file') === 'directory') return;
      const filePath = safeComposerFilePath(field(file, 'path', ''));
      if (!filePath) return;
      add('file', field(file, 'name', filePath), filePath, currentWorkspaceIdValue, field(file, 'parentPath', state.fileParentPath));
    });
    candidates.sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
    return candidates.slice(0, 20);
  }

  function hideComposerMentionMenu() {
    state.composer.mentionQuery = '';
    state.composer.mentionCandidates = [];
    state.composer.mentionSelectedIndex = 0;
    state.composer.mentionStart = -1;
    const menu = byId('composer-mention-menu');
    if (menu) menu.classList.add('hidden');
    const input = byId('composer-input');
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function renderComposerMentionMenu() {
    const menu = byId('composer-mention-menu');
    if (!menu) return;
    clear(menu);
    if (state.composer.mentionCandidates.length === 0) {
      hideComposerMentionMenu();
      return;
    }
    menu.classList.remove('hidden');
    const input = byId('composer-input');
    if (input) input.setAttribute('aria-expanded', 'true');
    state.composer.mentionCandidates.forEach((candidate, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'composer-mention-option' + (index === state.composer.mentionSelectedIndex ? ' active' : '');
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', index === state.composer.mentionSelectedIndex ? 'true' : 'false');
      const kind = document.createElement('span');
      kind.className = 'kind';
      text(kind, candidate.kind);
      option.appendChild(kind);
      const label = document.createElement('strong');
      text(label, '@' + candidate.label);
      option.appendChild(label);
      if (candidate.description.length > 0) {
        const description = document.createElement('span');
        description.className = 'description';
        text(description, candidate.description);
        option.appendChild(description);
      }
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => selectComposerMention(index));
      menu.appendChild(option);
    });
  }

  function updateComposerMentionMenu() {
    const input = byId('composer-input');
    const context = composerMentionContext(input);
    if (!context) {
      hideComposerMentionMenu();
      return;
    }
    const candidates = composerMentionCandidates(context);
    state.composer.mentionQuery = context.query;
    state.composer.mentionCandidates = candidates;
    state.composer.mentionSelectedIndex = Math.min(state.composer.mentionSelectedIndex, Math.max(0, candidates.length - 1));
    state.composer.mentionStart = context.start;
    renderComposerMentionMenu();
  }

  function renderComposerTokens() {
    const list = byId('composer-token-list');
    if (!list) return;
    clear(list);
    const tokens = webCompatibility && typeof webCompatibility.normalizeComposerTokens === 'function'
      ? webCompatibility.normalizeComposerTokens(state.composer.tokens)
      : state.composer.tokens;
    tokens.forEach((token, index) => {
      const item = document.createElement('span');
      item.className = 'composer-token';
      text(item, token.kind + ': @' + (token.label || token.value));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + (token.label || token.value));
      text(remove, 'x');
      remove.addEventListener('click', () => {
        state.composer.tokens.splice(index, 1);
        renderComposerTokens();
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  function clearComposerTokens() {
    state.composer.tokens = [];
    hideComposerMentionMenu();
    renderComposerTokens();
  }

  function selectComposerMention(index) {
    const input = byId('composer-input');
    const context = composerMentionContext(input);
    const candidate = state.composer.mentionCandidates[index];
    if (!input || !context || !candidate) return;
    const before = input.value.substring(0, context.start);
    const after = input.value.substring(context.end);
    input.value = before + '@' + candidate.label + ' ' + after;
    const caret = before.length + candidate.label.length + 2;
    input.setSelectionRange(caret, caret);
    state.composer.tokens.push({
      id: requestId(),
      kind: candidate.kind,
      label: candidate.label,
      value: candidate.value,
      hostProfileId: candidate.hostProfileId,
      workspaceId: candidate.workspaceId
    });
    renderComposerTokens();
    hideComposerMentionMenu();
    input.focus();
  }

  function composerTokensJson() {
    const tokens = webCompatibility && typeof webCompatibility.normalizeComposerTokens === 'function'
      ? webCompatibility.normalizeComposerTokens(state.composer.tokens)
      : state.composer.tokens;
    return JSON.stringify(tokens);
  }

  function workspaceActionKey(action, workspaceId) {
    return action + ':' + (workspaceId || 'new');
  }

  function workspaceActionIsBusy(action, workspaceId) {
    return state.workspaceActionInFlight === workspaceActionKey(action, workspaceId);
  }

  function setWorkspaceStatus(message, isError) {
    const node = byId('workspace-status');
    text(node, message || '');
    if (node) node.className = isError === true ? 'error' : 'muted';
  }

  function workspaceResultError(result, fallback) {
    const source = result && typeof result === 'object' ? result : {};
    const validation = objectValue(source, 'validation');
    const message = field(source, 'message', field(validation, 'message', ''));
    const remediation = field(source, 'remediation', field(validation, 'remediation', ''));
    const error = new Error(message || fallback);
    if (remediation.length > 0) error.message += ' ' + remediation;
    return error;
  }

  async function workspaceRegistryRequest(action, payload, fallbackAction) {
    try {
      return await send(action, payload);
    } catch (error) {
      if (!fallbackAction) throw error;
      return send(fallbackAction, payload);
    }
  }

  function renderWorkspaces() {
    const list = byId('workspace-list');
    clear(list);
    arrayValue(state, 'workspaces').forEach((workspace) => {
      const id = field(workspace, 'workspaceId', '');
      const title = field(workspace, 'title', field(workspace, 'displayName', id || 'Workspace'));
      const item = document.createElement('div');
      item.className = 'item workspace-item' + (id === state.selectedWorkspace ? ' active' : '');
      const select = document.createElement('button');
      select.type = 'button';
      select.className = id === state.selectedWorkspace ? 'active' : '';
      text(select, title + (field(workspace, 'status', '').length > 0 ? ' · ' + field(workspace, 'status', '') : ''));
      select.addEventListener('click', () => selectWorkspace(id).catch(showError));
      item.appendChild(select);
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(workspace, 'cwd', field(workspace, 'workspacePath', '')));
      item.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const opening = document.createElement('button');
      opening.type = 'button';
      opening.disabled = state.workspaceActionInFlight.length > 0;
      text(opening, 'Open');
      opening.addEventListener('click', () => openRegisteredWorkspace(workspace).catch(showError));
      actions.appendChild(opening);
      const archiving = document.createElement('button');
      archiving.type = 'button';
      archiving.disabled = state.workspaceActionInFlight.length > 0 || field(workspace, 'status', '') === 'archived';
      text(archiving, 'Archive');
      archiving.addEventListener('click', () => archiveRegisteredWorkspace(workspace).catch(showError));
      actions.appendChild(archiving);
      item.appendChild(actions);
      list.appendChild(item);
    });
    text(byId('workspace-empty'), state.workspaces.length === 0 ? 'No registered workspace.' : '');
  }

  async function selectWorkspace(workspaceId) {
    clearComposerTokens();
    await unsubscribeTerminal(state.selectedTerminal);
    await stopGithubWatch();
    state.selectedTerminal = '';
    setTerminalOutput('', true);
    state.selectedWorkspace = workspaceId;
    sessionStorage.setItem('ngf_web_workspace_id', workspaceId);
    broadcastTabEvent('scope.changed', { workspaceId });
    const matching = state.agents.find((item) => field(item, 'workspaceId', '') === workspaceId);
    state.selectedAgent = matching ? field(matching, 'id', '') : '';
    if (state.selectedAgent) sessionStorage.setItem('ngf_web_agent_id', state.selectedAgent);
    renderWorkspaces();
    renderAgents();
    await refreshSession();
  }

  async function importWorkspace() {
    if (state.workspaceActionInFlight.length > 0) return;
    const workspacePath = window.prompt('Workspace path to import');
    if (!workspacePath || workspacePath.trim().length === 0) return;
    const workspaceTitle = window.prompt('Workspace title', workspacePath.split(/[\\/]/).pop() || 'Workspace') || '';
    state.workspaceActionInFlight = workspaceActionKey('import', 'new');
    setWorkspaceStatus('Preparing workspace import...');
    renderWorkspaces();
    const payload = { workspacePath: workspacePath.trim(), workspaceTitle };
    try {
      let preview = await workspaceRegistryRequest('workspace.registry.import', payload, 'workspace.registry.create');
      if (preview.ok === false) throw workspaceResultError(preview, 'Workspace import preview failed.');
      if (preview.preview === true) {
        const target = field(preview, 'workspacePath', payload.workspacePath);
        const prompt = 'Import this workspace into the registry?\n' + target + '\nLocal files will not be copied.';
        if (!preview.confirmed && !window.confirm(prompt)) {
          setWorkspaceStatus('Workspace import cancelled.');
          return;
        }
        preview = await workspaceRegistryRequest('workspace.registry.import', Object.assign({}, payload, { preview: false, confirm: true }), 'workspace.registry.create');
        if (preview.ok === false) throw workspaceResultError(preview, 'Workspace import failed.');
      }
      setWorkspaceStatus('Workspace imported.');
      await refreshWorkspaces();
      broadcastTabEvent('workspace.changed', { workspaceId: field(preview, 'workspaceId', '') });
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : String(error), true);
      throw error;
    } finally {
      state.workspaceActionInFlight = '';
      renderWorkspaces();
    }
  }

  async function openRegisteredWorkspace(workspace) {
    const workspaceId = field(workspace, 'workspaceId', '');
    if (!workspaceId || state.workspaceActionInFlight.length > 0) return;
    state.workspaceActionInFlight = workspaceActionKey('open', workspaceId);
    setWorkspaceStatus('Preparing workspace open...');
    renderWorkspaces();
    const payload = { workspaceId, workspacePath: field(workspace, 'cwd', field(workspace, 'workspacePath', '')) };
    try {
      let preview = await send('workspace.registry.open', Object.assign({}, payload, { preview: true, confirm: false, dryRun: true }));
      if (preview.ok === false) throw workspaceResultError(preview, 'Workspace open preview failed.');
      if (preview.preview === true) {
        const target = field(preview, 'workspacePath', payload.workspacePath);
        if (!window.confirm('Open this workspace in the host application?\n' + target)) {
          setWorkspaceStatus('Workspace open cancelled.');
          return;
        }
        preview = await send('workspace.registry.open', Object.assign({}, payload, { preview: false, confirm: true, dryRun: false }));
        if (preview.ok === false) throw workspaceResultError(preview, 'Workspace open failed.');
      }
      setWorkspaceStatus(field(preview, 'message', 'Workspace opened.'));
      await refreshWorkspaces();
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : String(error), true);
      throw error;
    } finally {
      state.workspaceActionInFlight = '';
      renderWorkspaces();
    }
  }

  async function archiveRegisteredWorkspace(workspace) {
    const workspaceId = field(workspace, 'workspaceId', '');
    if (!workspaceId || state.workspaceActionInFlight.length > 0) return;
    state.workspaceActionInFlight = workspaceActionKey('archive', workspaceId);
    setWorkspaceStatus('Preparing workspace archive...');
    renderWorkspaces();
    const payload = { workspaceId, workspacePath: field(workspace, 'cwd', field(workspace, 'workspacePath', '')) };
    try {
      let preview = await send('workspace.registry.archive', Object.assign({}, payload, { preview: true, confirm: false }));
      if (preview.ok === false) throw workspaceResultError(preview, 'Workspace archive preview failed.');
      if (preview.preview === true) {
        if (!window.confirm('Archive this workspace registry entry?\nLocal files will not be deleted.')) {
          setWorkspaceStatus('Workspace archive cancelled.');
          return;
        }
        preview = await send('workspace.registry.archive', Object.assign({}, payload, { preview: false, confirm: true }));
        if (preview.ok === false) throw workspaceResultError(preview, 'Workspace archive failed.');
      }
      if (state.selectedWorkspace === workspaceId) {
        clearComposerTokens();
        state.selectedWorkspace = '';
        state.selectedAgent = '';
        sessionStorage.removeItem('ngf_web_workspace_id');
        sessionStorage.removeItem('ngf_web_agent_id');
      }
      setWorkspaceStatus('Workspace archived. Local files were not deleted.');
      await refreshWorkspaces();
      renderAgents();
      await refreshSession();
      broadcastTabEvent('workspace.changed', { workspaceId });
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : String(error), true);
      throw error;
    } finally {
      state.workspaceActionInFlight = '';
      renderWorkspaces();
    }
  }

  function renderAgents() {
    const list = byId('agent-list');
    clear(list);
    state.agents.filter((agent) => !state.selectedWorkspace || field(agent, 'workspaceId', '') === state.selectedWorkspace).forEach((agent) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = field(agent, 'id', '') === state.selectedAgent ? 'active' : '';
      text(button, field(agent, 'title', field(agent, 'id', 'Agent')));
      button.addEventListener('click', () => {
        const previousTerminalId = state.selectedTerminal;
        unsubscribeTerminal(previousTerminalId).catch(() => {});
        stopGithubWatch().catch(() => {});
        clearComposerTokens();
        state.selectedTerminal = '';
        setTerminalOutput('', true);
        state.selectedAgent = field(agent, 'id', '');
        state.selectedWorkspace = field(agent, 'workspaceId', state.selectedWorkspace);
        broadcastTabEvent('scope.changed', { workspaceId: state.selectedWorkspace, agentId: state.selectedAgent });
        sessionStorage.setItem('ngf_web_agent_id', state.selectedAgent);
        sessionStorage.setItem('ngf_web_workspace_id', state.selectedWorkspace);
        renderAgents();
        renderWorkspaces();
        refreshSession().catch(showError);
      });
      list.appendChild(button);
    });
  }

  function contentText(message) {
    const direct = field(message, 'text', field(message, 'content', ''));
    if (direct.length > 0) return direct;
    const nodes = arrayValue(message, 'contentNodes');
    return nodes.map((node) => field(node, 'text', field(node, 'content', field(node, 'name', '')))).filter((value) => value.length > 0).join('\n');
  }

  function appendRichNode(parent, node) {
    const kind = field(node, 'kind', 'fallback');
    if (kind === 'text') {
      text(parent, field(node, 'text', ''));
      return;
    }
    if (kind === 'code' || kind === 'diff') {
      const wrapper = document.createElement('div');
      wrapper.className = 'rich-block ' + kind;
      const label = document.createElement('div');
      label.className = 'rich-label';
      const language = kind === 'code' ? field(node, 'language', 'text') : field(node, 'path', 'diff');
      text(label, language || kind);
      wrapper.appendChild(label);
      const pre = document.createElement('pre');
      text(pre, field(node, 'text', ''));
      wrapper.appendChild(pre);
      if (node.truncated === true) {
        const note = document.createElement('div');
        note.className = 'muted rich-truncated';
        text(note, field(node, 'truncationReason', 'Content truncated by the Bridge safety limit.'));
        wrapper.appendChild(note);
      }
      parent.appendChild(wrapper);
      return;
    }
    if (kind === 'link') {
      const anchor = document.createElement('a');
      anchor.href = field(node, 'url', '');
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      text(anchor, field(node, 'label', field(node, 'url', 'Link')));
      parent.appendChild(anchor);
      return;
    }
    if (kind === 'file') {
      const workspaceId = field(node, 'workspaceId', '');
      const relativePath = field(node, 'relativePath', '');
      const label = field(node, 'displayName', relativePath);
      if (workspaceId === currentWorkspaceId() && relativePath.length > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        text(button, label + (typeof node.line === 'number' ? ':' + String(node.line) : ''));
        button.addEventListener('click', () => showDiffForPath(relativePath).catch(showError));
        parent.appendChild(button);
      } else text(parent, label);
      return;
    }
    if (kind === 'tool') {
      const wrapper = document.createElement('div');
      wrapper.className = 'rich-tool';
      const title = document.createElement('strong');
      text(title, field(node, 'title', field(node, 'toolName', 'Tool')) + ' · ' + field(node, 'status', 'info'));
      wrapper.appendChild(title);
      const body = field(node, 'text', '');
      if (body.length > 0) {
        const detail = document.createElement('div');
        text(detail, body);
        wrapper.appendChild(detail);
      }
      parent.appendChild(wrapper);
      return;
    }
    if (kind === 'todo') {
      const todo = document.createElement('div');
      todo.className = 'rich-todo status-' + field(node, 'status', 'pending');
      text(todo, field(node, 'title', field(node, 'id', 'Todo')) + ' · ' + field(node, 'status', 'pending'));
      parent.appendChild(todo);
      return;
    }
    if (kind === 'warning') {
      const warning = document.createElement('div');
      warning.className = 'notice rich-warning';
      text(warning, field(node, 'text', field(node, 'code', 'Warning')));
      parent.appendChild(warning);
      return;
    }
    const fallback = document.createElement('div');
    fallback.className = 'muted rich-fallback';
    text(fallback, field(node, 'text', 'Unsupported content node.') || 'Unsupported content node.');
    parent.appendChild(fallback);
  }

  function appendRichContent(parent, message) {
    const astEnabled = featureEnabled(state.capabilities, 'richContentAst');
    const rawNodes = astEnabled ? arrayValue(message, 'contentNodes') : [];
    const nodes = webCompatibility && typeof webCompatibility.normalizeRichContentNodes === 'function'
      ? webCompatibility.normalizeRichContentNodes(rawNodes)
      : rawNodes;
    if (nodes.length === 0) {
      text(parent, contentText(message));
      return;
    }
    nodes.forEach((node, index) => {
      if (index > 0) parent.appendChild(document.createTextNode('\n'));
      appendRichNode(parent, node);
    });
  }

  function renderMessages(messages) {
    const list = byId('message-list');
    clear(list);
    (Array.isArray(messages) ? messages : []).forEach((message) => {
      const item = document.createElement('article');
      item.className = 'message ' + (field(message, 'role', '') === 'user' ? 'user' : '');
      const role = document.createElement('div');
      role.className = 'role';
      text(role, field(message, 'role', 'assistant'));
      const body = document.createElement('div');
      body.className = 'rich-content';
      appendRichContent(body, message);
      item.appendChild(role);
      item.appendChild(body);
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }

  function experiencePayload(extra) {
    const agent = currentAgent();
    const payload = {
      hostProfileId: state.hostProfileId,
      workspaceId: currentWorkspaceId(),
      agentId: state.selectedAgent,
      sessionId: state.sessionId,
      providerId: field(agent, 'providerId', field(agent, 'provider', ''))
    };
    return Object.assign(payload, extra || {});
  }

  function experienceScopeMatches(snapshot, generation) {
    if (!snapshot || state.connectionGeneration !== generation) return false;
    const snapshotWindow = field(snapshot, 'window', '');
    return state.hostProfileId === field(snapshot, 'hostProfileId', '') &&
      currentWorkspaceId() === field(snapshot, 'workspaceId', '') &&
      state.selectedAgent === field(snapshot, 'agentId', '') &&
      state.sessionId === field(snapshot, 'sessionId', '') &&
      (snapshotWindow.length === 0 || normalizeUsageWindow(snapshotWindow) === currentUsageWindow());
  }

  function experienceScopeKey(snapshot) {
    return JSON.stringify([
      field(snapshot, 'hostProfileId', ''),
      field(snapshot, 'workspaceId', ''),
      field(snapshot, 'agentId', ''),
      field(snapshot, 'sessionId', ''),
      field(snapshot, 'providerId', ''),
      normalizeUsageWindow(field(snapshot, 'window', state.experience.usageWindow))
    ]);
  }

  async function runExperienceAction(actionId, operation) {
    if (state.experience.actionInFlight.has(actionId)) return;
    state.experience.actionInFlight.add(actionId);
    renderQueue();
    renderUsage();
    renderProviderUsage();
    try {
      await operation();
    } finally {
      state.experience.actionInFlight.delete(actionId);
      renderQueue();
      renderUsage();
      renderProviderUsage();
    }
  }

  function displayMetric(value) {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'unavailable';
  }

  function usageTokenLine(label, value) {
    return label + ': ' + displayMetric(value);
  }

  function setInputValueIfIdle(id, value) {
    const node = byId(id);
    if (!node || document.activeElement === node) return;
    node.value = value;
  }

  function renderQueue() {
    const list = byId('queue-list');
    clear(list);
    const items = state.experience.queueItems;
    if (items.length === 0) {
      text(list, 'No queued messages for this session.');
      return;
    }
    items.forEach((queueItem) => {
      const item = document.createElement('div');
      item.className = 'item queue-item status-' + field(queueItem, 'status', 'queued');
      const title = document.createElement('strong');
      text(title, field(queueItem, 'status', 'queued') + ' · ' + field(queueItem, 'clientMessageId', field(queueItem, 'queueId', 'Message')));
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      const attempt = numberValue(queueItem, 'attempt', 0);
      text(meta, 'Attempt ' + (attempt > 0 ? String(attempt) : 'unavailable') + (field(queueItem, 'updatedAt', '') ? ' · ' + field(queueItem, 'updatedAt', '') : ''));
      item.appendChild(meta);
      const failureCategory = field(queueItem, 'failureCategory', '');
      const message = field(queueItem, 'message', '');
      if (failureCategory || message) {
        const error = document.createElement('div');
        error.className = 'error';
        text(error, [failureCategory, message].filter((value) => value.length > 0).join(': '));
        item.appendChild(error);
      }
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const queueId = field(queueItem, 'queueId', '');
      if (queueId && ['queued', 'sending'].includes(field(queueItem, 'status', ''))) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.disabled = state.experience.actionInFlight.has('cancel:' + queueId);
        text(cancel, 'Cancel');
        cancel.addEventListener('click', () => cancelQueuedMessage(queueId));
        actions.appendChild(cancel);
      }
      if (queueId && field(queueItem, 'status', '') === 'failed') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.disabled = state.experience.actionInFlight.has('retry:' + queueId);
        text(retry, 'Retry');
        retry.addEventListener('click', () => retryQueuedMessage(queueId));
        actions.appendChild(retry);
      }
      if (actions.childElementCount > 0) item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function renderUsage() {
    const summary = state.experience.usageSummary;
    const output = byId('usage-output');
    const quotaList = byId('usage-quota-list');
    const eventList = byId('usage-event-list');
    const viewWindow = currentUsageWindow();
    setInputValueIfIdle('usage-view-window', viewWindow);
    clear(quotaList);
    clear(eventList);
    if (!summary) {
      text(output, state.experience.usageWindowNotice || 'Usage is unavailable for this session.');
      text(eventList, 'Usage events are unavailable for this session.');
      return;
    }
    const actual = summary.actual || {};
    const estimated = summary.estimated || {};
    const actualTokens = actual.tokens || {};
    const estimatedTokens = estimated.tokens || {};
    const lines = [
      'Window: ' + (summary.window || 'unavailable'),
      'Actual tokens',
      usageTokenLine('  input', actualTokens.inputTokens),
      usageTokenLine('  output', actualTokens.outputTokens),
      usageTokenLine('  cache read', actualTokens.cacheReadTokens),
      usageTokenLine('  cache write', actualTokens.cacheWriteTokens),
      usageTokenLine('  reasoning', actualTokens.reasoningTokens),
      usageTokenLine('  total', actualTokens.totalTokens),
      'Estimated tokens',
      usageTokenLine('  input', estimatedTokens.inputTokens),
      usageTokenLine('  output', estimatedTokens.outputTokens),
      usageTokenLine('  total', estimatedTokens.totalTokens)
    ];
    const actualCosts = Array.isArray(actual.costs) ? actual.costs : [];
    const estimatedCosts = Array.isArray(estimated.costs) ? estimated.costs : [];
    lines.push('Actual cost: ' + (actualCosts.length > 0 ? actualCosts.map((cost) => displayMetric(cost.amount) + ' ' + field(cost, 'currency', 'unavailable')).join(', ') : 'unavailable'));
    lines.push('Estimated cost: ' + (estimatedCosts.length > 0 ? estimatedCosts.map((cost) => displayMetric(cost.amount) + ' ' + field(cost, 'currency', 'unavailable')).join(', ') : 'unavailable'));
    const compactions = Array.isArray(summary.compactionEvents) ? summary.compactionEvents : [];
    lines.push('Compactions: ' + String(compactions.length));
    compactions.slice(-5).forEach((event) => {
      lines.push('  ' + field(event, 'occurredAt', 'unavailable') + ' · ' + field(event, 'reason', 'compaction') + ' · ' + displayMetric(event.beforeTokens) + ' → ' + displayMetric(event.afterTokens));
    });
    text(output, lines.join('\n'));
    const quotas = Array.isArray(summary.quotas) ? summary.quotas : [];
    if (quotas.length === 0) {
      text(quotaList, 'Quota unavailable from this Provider.');
    } else {
      quotas.forEach((quota) => {
        const item = document.createElement('div');
        item.className = 'item';
        const title = document.createElement('strong');
        text(title, field(quota, 'providerId', 'Provider') + ' · ' + field(quota, 'window', 'unavailable'));
        item.appendChild(title);
        const meta = document.createElement('div');
        meta.className = 'muted';
        text(meta, 'Remaining ' + displayMetric(quota.remaining) + ' / ' + displayMetric(quota.limit) + ' · reset ' + (field(quota, 'resetAt', '') || 'unavailable'));
        item.appendChild(meta);
        quotaList.appendChild(item);
      });
    }
    const events = Array.isArray(state.experience.usageEvents) ? state.experience.usageEvents.slice(-50).reverse() : [];
    if (events.length === 0) {
      text(eventList, 'No usage events for this session.');
    } else {
      events.forEach((event) => {
        const item = document.createElement('div');
        item.className = 'item usage-event-item';
        const title = document.createElement('strong');
        text(title, field(event, 'kind', 'usage') + ' · ' + (event.estimated === true ? 'estimated' : 'actual'));
        item.appendChild(title);
        const meta = document.createElement('div');
        meta.className = 'muted';
        const tokens = event.tokens || {};
        const total = displayMetric(tokens.totalTokens);
        const cost = typeof event.cost === 'number' && Number.isFinite(event.cost)
          ? displayMetric(event.cost) + ' ' + (field(event, 'currency', '') || 'unavailable')
          : 'unavailable';
        text(meta, field(event, 'occurredAt', 'unavailable') + ' · tokens ' + total + ' · cost ' + cost);
        item.appendChild(meta);
        const quota = event.quota || {};
        if (field(event, 'kind', '') === 'quota' || field(quota, 'window', '') !== '') {
          const quotaLine = document.createElement('div');
          quotaLine.className = 'muted';
          text(quotaLine, 'Quota ' + displayMetric(quota.remaining) + ' / ' + displayMetric(quota.limit) + ' · ' + (field(quota, 'window', '') || 'unavailable'));
          item.appendChild(quotaLine);
        }
        eventList.appendChild(item);
      });
    }
    const budget = state.experience.usageBudget || {};
    setInputValueIfIdle('usage-budget-window', field(budget, 'window', summary.window || 'session'));
    setInputValueIfIdle('usage-token-limit', typeof budget.tokenLimit === 'number' ? String(budget.tokenLimit) : '');
    setInputValueIfIdle('usage-cost-limit', typeof budget.costLimit === 'number' ? String(budget.costLimit) : '');
    setInputValueIfIdle('usage-currency', field(budget, 'currency', ''));
    if (typeof budget.warningThreshold === 'number') setInputValueIfIdle('usage-warning-threshold', String(budget.warningThreshold));
    byId('usage-budget-save-button').disabled = state.experience.actionInFlight.has('budget-save');
    byId('usage-budget-clear-button').disabled = state.experience.actionInFlight.has('budget-clear');
    const warning = state.experience.budgetWarning;
    if (warning) {
      const warningLine = 'Budget warning: ' + (Array.isArray(warning.reasons) ? warning.reasons.join(', ') : 'threshold reached');
      text(byId('usage-status'), (state.experience.usageWindowNotice ? state.experience.usageWindowNotice + ' ' : '') + warningLine);
    } else if (state.experience.usageWindowNotice) {
      text(byId('usage-status'), state.experience.usageWindowNotice);
    }
  }

  function renderProviderUsage() {
    const result = state.experience.providerUsage;
    const status = byId('provider-usage-status');
    const summary = byId('provider-usage-summary');
    const windowList = byId('provider-usage-window-list');
    const detailList = byId('provider-usage-detail-list');
    clear(windowList);
    clear(detailList);
    if (!result) {
      text(status, 'Provider usage is unavailable for this session.');
      text(summary, 'No Provider usage snapshot.');
      return;
    }
    const stateLabel = field(result, 'availabilityState', 'unsupported');
    const summaryLines = [
      'Provider: ' + (field(result, 'providerId', '') || 'unavailable'),
      'Plan: ' + (field(result, 'planLabel', '') || 'unavailable'),
      'Source: ' + (field(result, 'source', '') || 'unavailable'),
      'State: ' + stateLabel,
      'Fetched: ' + (field(result, 'fetchedAt', '') || 'unavailable'),
      'Expires: ' + (field(result, 'expiresAt', '') || 'unavailable')
    ];
    text(summary, summaryLines.join('\n'));
    const statusText = result.ok === false
      ? [field(result, 'failureCategory', ''), field(result, 'message', ''), field(result, 'remediation', '')]
        .filter((value) => value.length > 0).join(': ') || 'Provider usage request failed.'
      : (result.stale === true ? 'Provider usage is stale; values are read-only.' : 'Provider usage refreshed.');
    text(status, statusText);
    const windows = Array.isArray(result.windows) ? result.windows : [];
    windows.forEach((window) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(window, 'label', field(window, 'name', 'Quota')) + ' · ' + stateLabel);
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, 'Used ' + displayMetric(window.used) + ' / ' + displayMetric(window.limit) +
        ' · remaining ' + displayMetric(window.remaining) + ' · reset ' + (field(window, 'resetAt', '') || 'unavailable'));
      item.appendChild(meta);
      windowList.appendChild(item);
    });
    if (windows.length === 0) text(windowList, 'No Provider quota windows reported.');
    const details = Array.isArray(result.details) ? result.details : [];
    details.forEach((detail) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(detail, 'label', field(detail, 'key', 'Detail')));
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(detail, 'value', '') || 'unavailable');
      item.appendChild(meta);
      detailList.appendChild(item);
    });
    if (details.length === 0) text(detailList, 'No Provider plan details reported.');
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    if (warnings.length > 0) {
      const warning = document.createElement('div');
      warning.className = 'notice';
      text(warning, 'Warnings: ' + warnings.join(', '));
      detailList.appendChild(warning);
    }
    const refresh = byId('provider-usage-refresh-button');
    if (refresh) refresh.disabled = state.experience.actionInFlight.has('provider-usage-refresh');
  }

  function renderMetadata() {
    const metadata = state.metadata;
    const suggestion = byId('metadata-suggestion');
    const hasSuggestion = metadata.suggestion.length > 0;
    const canApply = hasSuggestion && ['sessionTitle', 'branchName', 'commitMessage', 'pullRequest'].includes(metadata.kind);
    suggestion.classList.toggle('hidden', !hasSuggestion);
    setInputValueIfIdle('metadata-suggestion', metadata.suggestion);
    byId('metadata-copy-button').classList.toggle('hidden', !hasSuggestion);
    byId('metadata-cancel-button').classList.toggle('hidden', !hasSuggestion);
    const apply = byId('metadata-apply-button');
    apply.classList.toggle('hidden', !canApply);
    apply.disabled = metadata.applying;
    text(apply, metadata.kind === 'sessionTitle' ? 'Apply to session' : 'Apply suggestion');
    byId('metadata-regenerate-button').classList.toggle('hidden', !hasSuggestion);
    const generate = byId('metadata-generate-button');
    generate.disabled = metadata.loading || metadata.applying || !state.selectedAgent;
    text(byId('metadata-status'), metadata.error || metadata.status || (hasSuggestion ? 'Preview ready; edit before applying.' : ''));
    const alternatives = byId('metadata-alternatives');
    clear(alternatives);
    metadata.alternatives.forEach((alternative) => {
      const button = document.createElement('button');
      button.type = 'button';
      text(button, alternative);
      button.addEventListener('click', () => { metadata.suggestion = alternative; renderMetadata(); });
      alternatives.appendChild(button);
    });
    if (metadata.warnings.length > 0) {
      const warning = document.createElement('div');
      warning.className = 'muted';
      text(warning, 'Warnings: ' + metadata.warnings.join(', '));
      alternatives.appendChild(warning);
    }
  }

  async function refreshExperience() {
    const experienceState = renderExperienceVisibility();
    const queueEnabled = experienceState.queueEnabled;
    const usageEventsCapability = experienceState.usageEventsEnabled;
    const usageEnabled = experienceState.usageEnabled;
    const providerUsageEnabled = experienceState.providerUsageEnabled;
    const metadataEnabled = experienceState.metadataEnabled;
    const visible = queueEnabled || usageEnabled || providerUsageEnabled || metadataEnabled;
    const generation = state.connectionGeneration;
    const usageWindow = currentUsageWindow();
    const scope = experiencePayload({ window: usageWindow });
    const nextScopeKey = experienceScopeKey(scope);
    if (state.experience.scopeKey !== nextScopeKey) {
      state.experience.scopeKey = nextScopeKey;
      state.experience.queueItems = [];
      state.experience.usageSummary = null;
      state.experience.usageEvents = [];
      state.experience.usageBudget = null;
      state.experience.providerUsage = null;
      state.experience.budgetWarning = null;
      state.experience.usageWindowNotice = '';
      renderQueue();
      renderUsage();
      renderProviderUsage();
    }
    if (!visible || !state.selectedAgent || !state.sessionId) {
      state.experience.queueItems = [];
      state.experience.usageSummary = null;
      state.experience.usageEvents = [];
      state.experience.usageBudget = null;
      state.experience.providerUsage = null;
      state.experience.budgetWarning = null;
      state.experience.usageWindowNotice = '';
      renderQueue();
      renderUsage();
      renderProviderUsage();
      renderMetadata();
      return;
    }
    state.experience.loading = true;
    state.experience.error = '';
    const queuePayload = experiencePayload();
    const usagePayload = experiencePayload({ window: usageWindow });
    const requests = await Promise.all([
      queueEnabled ? optionalRequest('message.queue.list', queuePayload) : Promise.resolve({ ok: false }),
      usageEventsCapability ? optionalRequest('usage.summary.get', usagePayload) : Promise.resolve({ ok: false }),
      usageEventsCapability ? optionalRequest('usage.events.list', Object.assign({}, usagePayload, { limit: 200 })) : Promise.resolve({ ok: false }),
      featureEnabled('usageBudgets') ? optionalRequest('usage.budget.get', usagePayload) : Promise.resolve({ ok: false }),
      providerUsageEnabled ? optionalRequest('provider.usage.list', usagePayload) : Promise.resolve({ ok: false })
    ]);
    if (!experienceScopeMatches(scope, generation)) return;
    const queueResult = requests[0];
    const summaryResult = requests[1];
    const eventsResult = requests[2];
    const budgetResult = requests[3];
    const providerUsageResult = requests[4];
    if (queueResult.ok) {
      const normalized = webCompatibility.normalizeResponse('message.queue.list', queueResult.value);
      state.experience.queueItems = normalized.items;
    }
    if (summaryResult.ok) {
      const normalized = webCompatibility.normalizeResponse('usage.summary.get', summaryResult.value);
      state.experience.usageSummary = normalized.summary;
      const returnedWindow = field(normalized.summary, 'window', '');
      state.experience.usageWindowNotice = returnedWindow.length > 0 && returnedWindow !== usageWindow
        ? 'Bridge returned usage window ' + returnedWindow + ' instead of ' + usageWindow + '.'
        : '';
    }
    if (eventsResult.ok) {
      const normalized = webCompatibility.normalizeResponse('usage.events.list', eventsResult.value);
      state.experience.usageEvents = normalized.events;
    }
    if (budgetResult.ok) {
      const normalized = webCompatibility.normalizeResponse('usage.budget.get', budgetResult.value);
      state.experience.usageBudget = normalized.budget;
    }
    if (providerUsageResult.ok) {
      const normalized = webCompatibility.normalizeResponse('provider.usage.list', providerUsageResult.value);
      state.experience.providerUsage = normalized.result;
      const returnedWindow = field(normalized.result, 'window', '');
      if (returnedWindow.length > 0 && returnedWindow !== usageWindow) {
        state.experience.usageWindowNotice = 'Bridge returned Provider usage window ' + returnedWindow + ' instead of ' + usageWindow + '.';
      }
    }
    const failures = requests.filter((result) => result.ok === false && result.error && !result.unsupported);
    state.experience.error = failures.length > 0 ? 'Some session experience RPCs are unavailable.' : '';
    state.experience.loading = false;
    state.experience.updatedAt = new Date().toISOString();
    text(byId('queue-status'), state.experience.error || '');
    text(byId('usage-status'), state.experience.error || '');
    renderQueue();
    renderUsage();
    renderProviderUsage();
    renderMetadata();
  }

  async function refreshProviderUsage() {
    if (!experienceFeatureState().providerUsageEnabled || !state.selectedAgent || !state.sessionId) return;
    await runExperienceAction('provider-usage-refresh', async () => {
      const generation = state.connectionGeneration;
      const scope = experiencePayload({ window: currentUsageWindow() });
      const result = await optionalRequest('provider.usage.list', scope);
      if (!experienceScopeMatches(scope, generation)) return;
      if (result.ok) {
        const normalized = webCompatibility.normalizeResponse('provider.usage.list', result.value);
        state.experience.providerUsage = normalized.result;
      } else if (!result.unsupported) {
        state.experience.providerUsage = {
          ok: false,
          providerId: currentProviderId(),
          hostProfileId: state.hostProfileId,
          workspaceId: currentWorkspaceId(),
          agentId: state.selectedAgent,
          sessionId: state.sessionId,
          window: currentUsageWindow(),
          availabilityState: 'failed',
          status: 'failed',
          planLabel: '',
          source: '',
          fetchedAt: '',
          expiresAt: '',
          stale: false,
          windows: [],
          details: [],
          warnings: [],
          failureCategory: 'provider_usage_request_failed',
          message: result.message || 'Provider usage request failed.',
          remediation: ''
        };
      }
      if (result.ok) {
        const normalized = webCompatibility.normalizeResponse('provider.usage.list', result.value);
        const returnedWindow = field(normalized.result, 'window', '');
        state.experience.usageWindowNotice = returnedWindow.length > 0 && returnedWindow !== currentUsageWindow()
          ? 'Bridge returned Provider usage window ' + returnedWindow + ' instead of ' + currentUsageWindow() + '.'
          : '';
      }
      renderProviderUsage();
      broadcastExperienceChanged('provider-usage.updated', {
        providerId: currentProviderId(),
        window: currentUsageWindow()
      });
    });
  }

  async function cancelQueuedMessage(queueId) {
    if (!queueId) return;
    await runExperienceAction('cancel:' + queueId, async () => {
      try {
        await send('message.queue.cancel', experiencePayload({ queueId }));
        await refreshExperience();
        broadcastExperienceChanged('queue.cancelled', { queueId });
      } catch (error) { showError(error); }
    });
  }

  async function retryQueuedMessage(queueId) {
    if (!queueId) return;
    await runExperienceAction('retry:' + queueId, async () => {
      try {
        await send('message.queue.retry', experiencePayload({ queueId }));
        await refreshExperience();
        broadcastExperienceChanged('queue.retried', { queueId });
      } catch (error) { showError(error); }
    });
  }

  async function saveUsageBudget() {
    if (!featureEnabled('usageBudgets')) return;
    const windowName = byId('usage-budget-window').value;
    const tokenText = byId('usage-token-limit').value.trim();
    const costText = byId('usage-cost-limit').value.trim();
    const currency = byId('usage-currency').value.trim().toUpperCase();
    const threshold = Number(byId('usage-warning-threshold').value);
    const payload = experiencePayload({ window: windowName, warningThreshold: Number.isFinite(threshold) ? threshold : 0.8 });
    if (tokenText.length > 0) {
      const tokenLimit = Number(tokenText);
      if (!Number.isSafeInteger(tokenLimit) || tokenLimit < 0) { text(byId('usage-status'), 'Token limit must be a non-negative integer.'); return; }
      payload.tokenLimit = tokenLimit;
    }
    if (costText.length > 0) {
      const costLimit = Number(costText);
      if (!Number.isFinite(costLimit) || costLimit < 0) { text(byId('usage-status'), 'Cost limit must be a non-negative number.'); return; }
      payload.costLimit = costLimit;
    }
    if (currency.length > 0) payload.currency = currency;
    await runExperienceAction('budget-save', async () => {
      try {
        const result = await send('usage.budget.set', payload);
        if (result.ok === false) throw new Error(field(result, 'message', 'Budget update failed.'));
        await refreshExperience();
        broadcastExperienceChanged('budget.updated', { window: windowName });
      } catch (error) { text(byId('usage-status'), error instanceof Error ? error.message : String(error)); }
    });
  }

  async function clearUsageBudget() {
    if (!featureEnabled('usageBudgets')) return;
    await runExperienceAction('budget-clear', async () => {
      try {
        const result = await send('usage.budget.set', experiencePayload({ window: byId('usage-budget-window').value }));
        if (result.ok === false) throw new Error(field(result, 'message', 'Budget clear failed.'));
        await refreshExperience();
        broadcastExperienceChanged('budget.cleared', { window: byId('usage-budget-window').value });
      } catch (error) { text(byId('usage-status'), error instanceof Error ? error.message : String(error)); }
    });
  }

  async function generateMetadataPreview() {
    if (!metadataGenerationEnabled() || !state.selectedAgent || !state.sessionId) return;
    state.metadata.kind = byId('metadata-kind').value;
    const metadataRequestId = requestId();
    state.metadata.requestId = metadataRequestId;
    state.metadata.loading = true;
    state.metadata.applying = false;
    state.metadata.error = '';
    state.metadata.status = '';
    renderMetadata();
    const payload = experiencePayload({
      kind: state.metadata.kind,
      prompt: byId('metadata-prompt').value.trim(),
      branchName: field(state.diffSummary, 'branchName', ''),
      diffSummary: state.diffSummary ? JSON.stringify(state.diffSummary) : ''
    });
    try {
      const result = await send('metadata.generate', payload, metadataRequestId);
      if (state.metadata.requestId !== metadataRequestId) return;
      const normalized = normalizeMetadataResult(result);
      if (!normalized.ok || normalized.suggestion.length === 0) throw new Error(normalized.message || normalized.remediation || 'Metadata preview failed.');
      state.metadata.suggestion = normalized.suggestion;
      state.metadata.alternatives = normalized.alternatives;
      state.metadata.planId = normalized.planId;
      state.metadata.requestId = normalized.requestId;
      state.metadata.sourceProvider = normalized.sourceProvider;
      state.metadata.estimatedUsage = normalized.estimatedUsage;
      state.metadata.warnings = normalized.warnings;
    } catch (error) {
      if (state.metadata.requestId !== metadataRequestId) return;
      state.metadata.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (state.metadata.requestId === metadataRequestId) {
        state.metadata.loading = false;
        renderMetadata();
      }
    }
  }

  async function applyMetadataSuggestion() {
    if (state.metadata.applying || !state.selectedAgent || !state.sessionId) return;
    const kind = state.metadata.kind;
    const suggestion = byId('metadata-suggestion').value.trim();
    if (!['sessionTitle', 'branchName', 'commitMessage', 'pullRequest'].includes(kind) || suggestion.length === 0) return;
    state.metadata.suggestion = suggestion;
    state.metadata.applying = true;
    state.metadata.error = '';
    state.metadata.status = '';
    renderMetadata();
    try {
      if (kind === 'sessionTitle') {
        const result = await send('agent.update', experiencePayload({ title: suggestion }));
        if (result.ok === false) throw new Error(field(result, 'message', 'Session title update failed.'));
        state.metadata.status = 'Session title updated.';
        await refreshSession();
      } else if (kind === 'branchName') {
        await mutateGit('workspace.git.branch', { action: 'create', name: suggestion });
        state.metadata.status = 'Branch created from the metadata suggestion.';
      } else if (kind === 'commitMessage') {
        const base = gitPayload({ message: suggestion, preview: true, requireConfirm: true });
        let result = await send('workspace.git.commit', base);
        if (result.preview === true) {
          const planId = field(result, 'planId', '');
          if (!planId || !window.confirm(field(result, 'message', 'Confirm this commit?'))) return;
          result = await send('workspace.git.commit', Object.assign({}, base, { preview: false, planId, confirm: true }));
        }
        if (result.ok === false) throw new Error(field(result, 'message', 'Commit failed.'));
        state.metadata.status = 'Commit created from the metadata suggestion.';
        await refreshGit();
      } else if (kind === 'pullRequest') {
        if (!state.github.authenticated || !state.github.owner || !state.github.repo) {
          throw new Error('Sign in to GitHub and bind a repository before applying a pull request suggestion.');
        }
        const head = field(state.diffSummary, 'branchName', '') || (window.prompt('Head branch') || '').trim();
        if (!head) throw new Error('A head branch is required for pull request creation.');
        const baseBranch = (window.prompt('Base branch', 'main') || '').trim();
        if (!baseBranch) throw new Error('A base branch is required for pull request creation.');
        const request = githubPayload({
          head,
          base: baseBranch,
          title: suggestion,
          body: byId('metadata-prompt').value.trim(),
          draft: false,
          preview: true,
          confirm: false,
          dryRun: true
        });
        const preview = await send('github.pr.create', request);
        if (preview.ok === false) throw new Error(field(preview, 'message', 'Pull request preview failed.'));
        if (!window.confirm(field(preview, 'message', 'Create this pull request?'))) return;
        const result = await send('github.pr.create', Object.assign({}, request, { preview: false, confirm: true, dryRun: false }));
        if (result.ok === false) throw new Error(field(result, 'message', 'Pull request creation failed.'));
        state.metadata.status = 'Pull request created from the metadata suggestion.';
        await refreshGithubPullRequests();
      }
      state.metadata.error = '';
    } catch (error) {
      state.metadata.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.metadata.applying = false;
      renderMetadata();
    }
  }

  async function copyMetadataSuggestion() {
    const value = byId('metadata-suggestion').value.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      text(byId('metadata-status'), 'Metadata copied to the clipboard.');
    } catch (error) { state.metadata.error = error instanceof Error ? error.message : String(error); renderMetadata(); }
  }

  async function cancelMetadataPreview() {
    const activeRequestId = state.metadata.loading ? state.metadata.requestId : '';
    if (activeRequestId) {
      state.metadata.error = '';
      text(byId('metadata-status'), 'Cancelling metadata preview...');
      try { await send('metadata.generate.cancel', experiencePayload({ requestId: activeRequestId })); } catch (_error) { /* The original request may already have completed. */ }
    }
    state.metadata = { loading: false, applying: false, error: '', kind: byId('metadata-kind').value, suggestion: '', alternatives: [], planId: '', requestId: '', sourceProvider: '', estimatedUsage: false, warnings: [], status: '' };
    renderMetadata();
  }

  async function refreshWorkspaces() {
    try {
      const result = await send('workspace.registry.list', { includeArchived: false });
      const normalized = webCompatibility ? webCompatibility.normalizeWorkspaceRegistry(result) : { workspaces: arrayValue(result, 'workspaces'), supported: true };
      if (!normalized.supported) throw new Error('Workspace registry is unavailable on this Bridge.');
      state.workspaces = normalized.workspaces;
    } catch (_error) {
      const fallback = [];
      state.agents.forEach((agent) => {
        const workspaceId = field(agent, 'workspaceId', '');
        const cwd = field(agent, 'cwd', field(agent, 'rootPath', ''));
        if (!workspaceId && !cwd) return;
        if (fallback.some((item) => field(item, 'workspaceId', '') === workspaceId && field(item, 'cwd', '') === cwd)) return;
        fallback.push({ workspaceId, cwd, title: cwd || workspaceId, displayName: cwd || workspaceId, status: 'legacy' });
      });
      state.workspaces = fallback;
    }
    const previousWorkspaceId = state.selectedWorkspace;
    const activeWorkspaceIds = state.workspaces.map((item) => field(item, 'workspaceId', '')).filter((item) => item.length > 0);
    if (!state.selectedWorkspace || !activeWorkspaceIds.includes(state.selectedWorkspace)) {
      const stored = sessionStorage.getItem('ngf_web_workspace_id') || '';
      const storedIsActive = activeWorkspaceIds.includes(stored);
      const firstActiveWorkspace = state.workspaces[0] || null;
      const firstAgent = state.agents.find((item) => field(item, 'workspaceId', '') === stored && (activeWorkspaceIds.length === 0 || activeWorkspaceIds.includes(stored))) ||
        state.agents.find((item) => activeWorkspaceIds.includes(field(item, 'workspaceId', '')));
      state.selectedWorkspace = storedIsActive ? stored : (firstAgent ? field(firstAgent, 'workspaceId', '') : field(firstActiveWorkspace, 'workspaceId', ''));
    }
    if (state.selectedAgent) {
      const selectedAgentWorkspaceId = field(currentAgent(), 'workspaceId', '');
      if (selectedAgentWorkspaceId.length > 0 && activeWorkspaceIds.length > 0 && !activeWorkspaceIds.includes(selectedAgentWorkspaceId)) {
        state.selectedAgent = '';
        clearComposerTokens();
        sessionStorage.removeItem('ngf_web_agent_id');
      }
    }
    if (previousWorkspaceId !== state.selectedWorkspace) clearComposerTokens();
    renderWorkspaces();
  }

  async function refreshServices() {
    const visible = featureEnabled('serviceProxy');
    byId('services-section').classList.toggle('hidden', !visible);
    if (!visible || !state.selectedAgent) return;
    const result = await send('workspace.service.list', { workspaceId: currentWorkspaceId(), ownerAgentId: state.selectedAgent });
    renderServices(arrayValue(result, 'services'));
  }

  function renderServices(services) {
    const list = byId('service-list');
    clear(list);
    services.forEach((service) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(service, 'name', field(service, 'serviceId', 'Service')));
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(service, 'status', 'unknown') + ' · port ' + String(numberValue(service, 'port', 0) || '') + ' · ' + field(service, 'health', ''));
      item.appendChild(title);
      item.appendChild(meta);
      const open = document.createElement('button');
      open.type = 'button';
      open.disabled = field(service, 'status', '') !== 'running';
      text(open, 'Open');
      open.addEventListener('click', () => openService(service));
      item.appendChild(open);
      const action = document.createElement('button');
      action.type = 'button';
      text(action, field(service, 'status', '') === 'running' ? 'Stop' : 'Start');
      action.addEventListener('click', () => toggleService(service));
      item.appendChild(action);
      const logs = document.createElement('button');
      logs.type = 'button';
      text(logs, 'Logs');
      logs.addEventListener('click', () => send('workspace.service.logs', { serviceId: field(service, 'serviceId', '') }).then((result) => text(byId('detail-output'), field(result, 'text', ''))).catch(showError));
      item.appendChild(logs);
      list.appendChild(item);
    });
  }

  async function toggleService(service) {
    const serviceId = field(service, 'serviceId', '');
    const type = field(service, 'status', '') === 'running' ? 'workspace.service.stop' : 'workspace.service.start';
    try {
      const preview = await send(type, { serviceId });
      if (preview.preview === true && preview.planId) await send(type, { serviceId, planId: preview.planId, confirm: true });
      await refreshServices();
    } catch (error) { showError(error); }
  }

  function safeServiceAccessUrl(value) {
    try {
      const access = new URL(safe(value), endpoint() + '/');
      const bridge = new URL(endpoint());
      if ((access.protocol !== 'http:' && access.protocol !== 'https:') || access.origin !== bridge.origin || access.username.length > 0 || access.password.length > 0 || access.hash.length > 0 || !access.pathname.startsWith('/service/') || safe(access.searchParams.get('accessTicket')).length === 0) return '';
      return access.href;
    } catch (_error) { return ''; }
  }

  async function openService(service) {
    try {
      const serviceId = field(service, 'serviceId', '');
      if (!serviceId || field(service, 'status', '') !== 'running') return;
      const ownerAgentId = field(service, 'ownerAgentId', '');
      const preview = await send('workspace.service.open', { serviceId, ownerAgentId });
      if (preview.preview !== true || !preview.planId || !window.confirm('Open this workspace service with a short-lived access ticket?')) return;
      const confirmed = await send('workspace.service.open', { serviceId, ownerAgentId, planId: preview.planId, confirm: true });
      const accessUrl = safeServiceAccessUrl(field(confirmed, 'accessUrl', ''));
      if (confirmed.confirmed !== true || accessUrl.length === 0) throw new Error('Bridge returned an invalid service access URL.');
      window.open(accessUrl, '_blank', 'noopener,noreferrer');
    } catch (error) { showError(error); }
  }

  function renderTerminals(terminals) {
    const list = byId('terminal-list');
    clear(list);
    terminals.forEach((terminal) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(terminal, 'name', field(terminal, 'terminalId', 'Terminal')));
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(terminal, 'status', 'unknown') + ' · ' + field(terminal, 'cwd', ''));
      item.appendChild(title);
      item.appendChild(meta);
      const capture = document.createElement('button');
      capture.type = 'button';
      text(capture, 'Open');
      capture.addEventListener('click', () => captureTerminal(terminal));
      item.appendChild(capture);
      const kill = document.createElement('button');
      kill.type = 'button';
      text(kill, 'Close');
      kill.addEventListener('click', () => killTerminal(terminal));
      item.appendChild(kill);
      list.appendChild(item);
    });
  }

  async function refreshTerminals() {
    const visible = featureEnabled('terminalBinaryFrames') || featureEnabled('terminalActivity');
    byId('terminal-section').classList.toggle('hidden', !visible);
    if (!visible || !state.selectedAgent) return;
    const result = await send('terminal.list', { workspaceId: currentWorkspaceId(), agentId: state.selectedAgent, cwd: currentWorkspacePath() });
    state.terminals = arrayValue(result, 'terminals');
    renderTerminals(state.terminals);
    if (state.selectedTerminal && state.terminalSlot <= 0 && featureEnabled('terminalBinaryFrames')) {
      const selected = state.terminals.find((item) => field(item, 'terminalId', '') === state.selectedTerminal);
      if (selected) await subscribeTerminal(selected);
    }
  }

  async function captureTerminal(terminal) {
    try {
      const terminalId = field(terminal, 'terminalId', '');
      if (terminalId.length === 0) return;
      if (state.selectedTerminal !== terminalId) await unsubscribeTerminal(state.selectedTerminal);
      state.selectedTerminal = terminalId;
      const result = await send('terminal.capture', { terminalId: state.selectedTerminal, workspaceId: currentWorkspaceId(), agentId: state.selectedAgent });
      setTerminalOutput(field(result, 'text', ''), true);
      if (featureEnabled('terminalBinaryFrames')) await subscribeTerminal(terminal);
    } catch (error) { showError(error); }
  }

  async function unsubscribeTerminal(terminalId) {
    if (!terminalId || state.terminalSlot <= 0 || !state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    try {
      await send('terminal.unsubscribe', { terminalId, workspaceId: currentWorkspaceId(), agentId: state.selectedAgent });
    } finally {
      state.terminalSlot = 0;
      state.terminalStreamProtocolVersion = 0;
      terminalStream.reset(state.terminalStreamState);
    }
  }

  async function subscribeTerminal(terminal) {
    if (!featureEnabled('terminalBinaryFrames')) return;
    const terminalId = field(terminal, 'terminalId', '');
    if (terminalId.length === 0) return;
    const previousTerminalId = state.selectedTerminal;
    if (previousTerminalId !== terminalId) await unsubscribeTerminal(previousTerminalId);
    state.selectedTerminal = terminalId;
    const result = await send('terminal.subscribe', {
      terminalId,
      workspaceId: currentWorkspaceId(),
      agentId: state.selectedAgent,
      streamProtocolVersion: 2,
      preserveAttention: false
    });
    const slot = numberValue(result, 'slot', 0);
    if (slot <= 0) throw new Error('Bridge did not allocate a terminal stream slot.');
    state.terminalSlot = slot;
    state.terminalStreamProtocolVersion = numberValue(result, 'streamProtocolVersion', 1);
    if (state.terminalStreamProtocolVersion >= 2) terminalStream.beginSubscribe(state.terminalStreamState, result);
    else terminalStream.reset(state.terminalStreamState);
    text(byId('terminal-stream-status'), 'Subscribed; restoring terminal output...');
  }

  function requestTerminalSnapshot() {
    if (!featureEnabled('terminalBinaryFrames') || state.terminalSlot <= 0) return;
    try {
      terminalStream.beginSnapshotRequest(state.terminalStreamState);
      sendTerminalFrame(TerminalStreamOpcode.SNAPSHOT, state.terminalSlot, new Uint8Array(0));
      text(byId('terminal-stream-status'), 'Restoring terminal output...');
    } catch (error) {
      terminalStream.reset(state.terminalStreamState);
      showError(error);
    }
  }

  function sendTerminalInput(event) {
    event.preventDefault();
    const input = byId('terminal-input');
    const value = input.value;
    if (!value || state.terminalSlot <= 0) return;
    try {
      sendTerminalFrame(TerminalStreamOpcode.INPUT, state.terminalSlot, value);
      input.value = '';
      text(byId('terminal-stream-status'), 'Input sent');
    } catch (error) { showError(error); }
  }

  function resizeTerminal() {
    if (state.terminalSlot <= 0) return;
    const rows = Number.parseInt(byId('terminal-rows').value, 10);
    const cols = Number.parseInt(byId('terminal-cols').value, 10);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || rows > 500 || cols < 2 || cols > 500) {
      text(byId('terminal-stream-status'), 'Rows and columns must be between 2 and 500.');
      return;
    }
    try {
      sendTerminalFrame(TerminalStreamOpcode.RESIZE, state.terminalSlot, JSON.stringify({ rows, cols }));
      text(byId('terminal-stream-status'), 'Terminal resized');
    } catch (error) { showError(error); }
  }

  async function createTerminal() {
    if (!state.selectedAgent || !currentWorkspacePath()) return;
    try {
      await send('terminal.create', { workspaceId: currentWorkspaceId(), agentId: state.selectedAgent, cwd: currentWorkspacePath(), name: 'Web Terminal', rows: 24, cols: 80 });
      await refreshTerminals();
    } catch (error) { showError(error); }
  }

  async function killTerminal(terminal) {
    if (!window.confirm('Close this terminal?')) return;
    try {
      const terminalId = field(terminal, 'terminalId', '');
      await unsubscribeTerminal(terminalId);
      await send('terminal.kill', { terminalId, workspaceId: currentWorkspaceId(), agentId: state.selectedAgent });
      if (state.selectedTerminal === terminalId) {
        state.selectedTerminal = '';
        state.terminalOutput = '';
        state.terminalOutputBytes = 0;
        state.terminalOutputTruncated = false;
        renderTerminalOutput();
      }
      await refreshTerminals();
    } catch (error) { showError(error); }
  }

  function renderChanges(changes) {
    const list = byId('change-list');
    clear(list);
    changes.forEach((change) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(change, 'path', 'Changed file'));
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(change, 'status', '') + ' · +' + String(numberValue(change, 'additions', 0)) + ' / -' + String(numberValue(change, 'deletions', 0)));
      item.appendChild(title);
      item.appendChild(meta);
      const open = document.createElement('button');
      open.type = 'button';
      text(open, 'Diff');
      open.addEventListener('click', () => showDiffForPath(field(change, 'path', '')));
      item.appendChild(open);
      const stage = document.createElement('button');
      stage.type = 'button';
      text(stage, change.staged === true ? 'Unstage' : 'Stage');
      stage.addEventListener('click', () => mutateGit(change.staged === true ? 'workspace.git.unstage' : 'workspace.git.stage', { paths: [field(change, 'path', '')] }).catch(showError));
      item.appendChild(stage);
      const discard = document.createElement('button');
      discard.type = 'button';
      text(discard, 'Discard');
      discard.disabled = field(change, 'path', '').length === 0;
      discard.addEventListener('click', () => mutateGit('workspace.git.discard', { paths: [field(change, 'path', '')] }, 'Discard this change?').catch(showError));
      item.appendChild(discard);
      list.appendChild(item);
    });
  }

  function renderDiffSummary(summary) {
    const item = summary && typeof summary === 'object' ? summary : {};
    const lines = [
      'Branch: ' + field(item, 'branchName', 'unavailable'),
      'Changed files: ' + String(numberValue(item, 'changedFiles', numberValue(item, 'changesCount', 0))),
      'Additions: ' + String(numberValue(item, 'additions', 0)),
      'Deletions: ' + String(numberValue(item, 'deletions', 0)),
      'Conflicts: ' + String(numberValue(item, 'conflicts', 0))
    ];
    text(byId('git-summary-output'), lines.join('\n'));
  }

  function renderGitMode() {
    const summary = byId('git-summary-output');
    const files = byId('change-list');
    const unified = byId('git-unified-output');
    if (summary) summary.classList.toggle('hidden', state.diffMode !== 'summary');
    if (files) files.classList.toggle('hidden', state.diffMode !== 'files');
    if (unified) unified.classList.toggle('hidden', state.diffMode !== 'unified');
    ['summary', 'files', 'unified'].forEach((mode) => {
      const button = byId('git-mode-' + mode + '-button');
      if (button) button.classList.toggle('active', state.diffMode === mode);
    });
    const more = byId('diff-more-button');
    if (more) more.classList.toggle('hidden', state.diffMode !== 'unified' || !state.diffRequest || (!state.diffRequest.nextLine && !state.diffRequest.nextFile));
    const diffStatus = byId('diff-status');
    if (diffStatus) {
      const request = state.diffRequest;
      const reason = request && typeof request.truncationReason === 'string' ? request.truncationReason : '';
      text(diffStatus, request && request.truncated === true && reason.length > 0 ? 'Truncated: ' + reason : '');
    }
  }

  function selectGitMode(mode) {
    if (!['summary', 'files', 'unified'].includes(mode)) return;
    state.diffMode = mode;
    renderGitMode();
    if (mode === 'summary') {
      renderDiffSummary(state.diffSummary);
      return;
    }
    if (mode === 'unified' && state.selectedPath) {
      showDiffForPath(state.selectedPath).catch(showError);
    }
  }

  function gitPayload(extra) {
    return Object.assign({
      agentId: state.selectedAgent,
      sessionId: state.sessionId,
      workspaceId: currentWorkspaceId(),
      workspacePath: currentWorkspacePath()
    }, extra || {});
  }

  async function mutateGit(type, extra, confirmationMessage) {
    if (!state.selectedAgent || !currentWorkspacePath()) return;
    if (confirmationMessage && !window.confirm(confirmationMessage)) return;
    const base = gitPayload(extra);
    let result = await send(type, base);
    if (result.preview === true) {
      if (!result.planId) throw new Error('Bridge returned a Git preview without a plan.');
      if (!window.confirm(field(result, 'message', 'Confirm this Git operation?'))) return;
      result = await send(type, Object.assign({}, base, { planId: result.planId, confirm: true }));
    }
    if (result.ok === false) throw new Error(field(result, 'message', 'Git operation failed.'));
    await refreshGit();
    await loadFiles(state.fileParentPath);
    broadcastTabEvent('workspace.changed', { workspaceId: currentWorkspaceId() });
  }

  async function commitGit() {
    const message = window.prompt('Commit message');
    if (!message || message.trim().length === 0) return;
    await mutateGit('workspace.git.commit', { message: message.trim() }, 'Create this commit?');
  }

  async function pullGit() {
    await mutateGit('workspace.git.pull', { ffOnly: true });
  }

  async function pushGit() {
    await mutateGit('workspace.git.push', {}, 'Push the current branch?');
  }

  async function branchGit() {
    const action = (window.prompt('Branch action: create, checkout, delete') || '').trim().toLowerCase();
    if (!['create', 'checkout', 'delete'].includes(action)) return;
    const name = (window.prompt('Branch name') || '').trim();
    if (!name) return;
    await mutateGit('workspace.git.branch', { action, name, force: false }, action === 'delete' ? '' : 'Apply this branch operation?');
  }

  async function stashGit() {
    const action = (window.prompt('Stash action: push, pop, apply, drop') || '').trim().toLowerCase();
    if (!['push', 'pop', 'apply', 'drop'].includes(action)) return;
    const ref = (window.prompt('Stash ref (optional)', 'stash@{0}') || '').trim();
    const message = action === 'push' ? (window.prompt('Stash message (optional)') || '').trim() : '';
    await mutateGit('workspace.git.stash', { action, ref, message, includeUntracked: true }, action === 'push' || action === 'apply' ? 'Apply this stash operation?' : '');
  }

  async function mergeGit() {
    const ref = (window.prompt('Merge ref') || '').trim();
    if (!ref) return;
    await mutateGit('workspace.git.merge', { ref, ffOnly: false, noCommit: false });
  }

  function safeDownloadUrl(value) {
    try {
      const download = new URL(safe(value), endpoint() + '/');
      const bridge = new URL(endpoint());
      const token = download.pathname.substring('/download/'.length);
      if (download.origin !== bridge.origin || download.pathname.indexOf('/download/') !== 0 || token.length === 0 || token.indexOf('/') >= 0 || download.username.length > 0 || download.password.length > 0 || download.hash.length > 0) return '';
      return download.href;
    } catch (_error) { return ''; }
  }

  function renderFiles(files, parentPath) {
    const list = byId('file-list');
    clear(list);
    const normalizedParent = typeof parentPath === 'string' ? parentPath : '';
    text(byId('file-path'), normalizedParent.length > 0 ? normalizedParent : '/');
    if (normalizedParent.length > 0) {
      const up = document.createElement('button');
      up.type = 'button';
      text(up, 'Up');
      up.addEventListener('click', () => {
        const parts = normalizedParent.split('/');
        parts.pop();
        loadFiles(parts.join('/')).catch(showError);
      });
      list.appendChild(up);
    }
    files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(file, 'name', field(file, 'path', 'File')));
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(file, 'kind', 'file') + (numberValue(file, 'sizeBytes', 0) > 0 ? ' · ' + String(numberValue(file, 'sizeBytes', 0)) + ' bytes' : ''));
      item.appendChild(meta);
      if (field(file, 'kind', 'file') === 'directory') {
        const open = document.createElement('button');
        open.type = 'button';
        text(open, 'Open');
        open.addEventListener('click', () => loadFiles(field(file, 'path', '')).catch(showError));
        item.appendChild(open);
      } else {
        const preview = document.createElement('button');
        preview.type = 'button';
        text(preview, 'Preview');
        preview.addEventListener('click', () => previewFile(file).catch(showError));
        item.appendChild(preview);
        const download = document.createElement('button');
        download.type = 'button';
        text(download, 'Download');
        download.addEventListener('click', () => downloadFile(file).catch(showError));
        item.appendChild(download);
      }
      list.appendChild(item);
    });
    text(byId('file-empty'), files.length === 0 ? 'No files in this directory.' : '');
  }

  async function loadFiles(parentPath) {
    if (!featureEnabled('workspaceFiles') || !state.selectedAgent || !currentWorkspacePath()) return;
    const result = await send('workspace.files.list', {
      agentId: state.selectedAgent,
      sessionId: state.sessionId,
      workspaceId: currentWorkspaceId(),
      workspacePath: currentWorkspacePath(),
      parentPath: typeof parentPath === 'string' ? parentPath : state.fileParentPath
    });
    state.fileParentPath = field(result, 'parentPath', '');
    state.files = arrayValue(result, 'files');
    renderFiles(state.files, state.fileParentPath);
  }

  async function previewFile(file) {
    const filePath = field(file, 'path', '');
    if (!filePath) return;
    const result = await send('workspace.file.get', {
      agentId: state.selectedAgent,
      sessionId: state.sessionId,
      workspaceId: currentWorkspaceId(),
      workspacePath: currentWorkspacePath(),
      path: filePath
    });
    const preview = result && result.preview && typeof result.preview === 'object' ? result.preview : {};
    const content = field(preview, 'content', '');
    text(byId('detail-output'), content.length > 0 ? content : (preview.truncated === true ? 'Preview is bounded; download the file to inspect it.' : 'No preview available for this file.'));
  }

  async function downloadFile(file) {
    const filePath = field(file, 'path', '');
    if (!filePath) return;
    const result = await send('workspace.file.download', {
      agentId: state.selectedAgent,
      sessionId: state.sessionId,
      workspaceId: currentWorkspaceId(),
      workspacePath: currentWorkspacePath(),
      path: filePath
    });
    const downloadUrl = safeDownloadUrl(field(result, 'downloadPath', ''));
    if (!downloadUrl) throw new Error('Bridge returned an invalid download URL.');
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = field(result, 'fileName', field(file, 'name', 'download'));
    anchor.rel = 'noreferrer';
    anchor.click();
  }

  async function refreshGit() {
    const visible = featureEnabled('gitAdvanced');
    byId('git-section').classList.toggle('hidden', !visible);
    if (!visible || !currentWorkspacePath()) return;
    const result = await send('workspace.changes.get', { agentId: state.selectedAgent, sessionId: state.sessionId, workspaceId: currentWorkspaceId(), workspacePath: currentWorkspacePath() });
    state.changes = arrayValue(result, 'changes');
    state.diffSummary = objectValue(result, 'diffSummary');
    state.diffCache.clear();
    renderChanges(state.changes);
    renderDiffSummary(state.diffSummary);
    renderGitMode();
    text(byId('git-summary'), field(result, 'branchName', '') + ' · ' + String(state.changes.length) + ' changed');
  }

  async function showDiffForPath(filePath) {
    if (!filePath) return;
    try {
      state.selectedPath = filePath;
      state.diffText = '';
      state.diffMode = 'unified';
      const cacheKey = filePath + ':worktree';
      const cached = state.diffCache.get(cacheKey);
      state.diffRequest = { path: filePath, lineOffset: 0, fileCursor: 0, nextLine: false, nextFile: false, truncated: false, truncationReason: '', loadedPages: [], cacheKey };
      if (cached) {
        state.diffText = cached.text;
        state.diffRequest.lineOffset = cached.lineOffset;
        state.diffRequest.fileCursor = cached.fileCursor;
        state.diffRequest.nextLine = cached.nextLine;
        state.diffRequest.nextFile = cached.nextFile;
        state.diffRequest.truncated = cached.truncated === true;
        state.diffRequest.truncationReason = field(cached, 'truncationReason', '');
        state.diffRequest.loadedPages = Array.isArray(cached.loadedPages) ? cached.loadedPages.slice(0, 128) : [];
        text(byId('git-unified-output'), state.diffText || 'No diff for this file.');
        text(byId('detail-output'), state.diffText || 'No diff for this file.');
        renderGitMode();
        return;
      }
      renderGitMode();
      await loadDiffPage(false);
    } catch (error) { showError(error); }
  }

  async function loadDiffPage(append) {
    const request = state.diffRequest;
    if (!request) return;
    if (!Array.isArray(request.loadedPages)) request.loadedPages = [];
    const pageKey = [request.cacheKey || request.path, String(request.fileCursor), String(request.lineOffset)].join('|');
    if (append && request.loadedPages.includes(pageKey)) {
      renderGitMode();
      return;
    }
    const result = await send('workspace.diff.get', { agentId: state.selectedAgent, sessionId: state.sessionId, workspaceId: currentWorkspaceId(), workspacePath: currentWorkspacePath(), path: request.path, lineOffset: request.lineOffset, fileCursor: request.fileCursor, lineLimit: 1200, fileLimit: 20, maxBytes: 512 * 1024 });
    const page = field(result, 'diffText', '');
    const separator = state.diffText.length > 0 && !state.diffText.endsWith('\n') ? '\n' : '';
    state.diffText = append && state.diffText.length > 0 ? state.diffText + separator + page : page;
    if (!request.loadedPages.includes(pageKey)) request.loadedPages.push(pageKey);
    if (request.loadedPages.length > 128) request.loadedPages.splice(0, request.loadedPages.length - 128);
    text(byId('detail-output'), state.diffText || 'No diff for this file.');
    text(byId('git-unified-output'), state.diffText || 'No diff for this file.');
    const nextLineOffset = numberValue(result, 'nextLineOffset', -1);
    const nextFileCursor = numberValue(result, 'nextFileCursor', -1);
    state.diffRequest.lineOffset = nextLineOffset >= 0 ? nextLineOffset : 0;
    state.diffRequest.fileCursor = nextFileCursor >= 0 ? nextFileCursor : 0;
    state.diffRequest.nextLine = nextLineOffset >= 0;
    state.diffRequest.nextFile = nextFileCursor >= 0;
    state.diffRequest.truncated = result.truncated === true || state.diffRequest.nextLine || state.diffRequest.nextFile;
    state.diffRequest.truncationReason = field(result, 'truncationReason', '');
    state.diffCache.set(request.cacheKey || request.path + ':worktree', {
      text: state.diffText,
      lineOffset: state.diffRequest.lineOffset,
      fileCursor: state.diffRequest.fileCursor,
      nextLine: state.diffRequest.nextLine,
      nextFile: state.diffRequest.nextFile,
      truncated: state.diffRequest.truncated,
      truncationReason: state.diffRequest.truncationReason,
      loadedPages: state.diffRequest.loadedPages.slice(0, 128)
    });
    renderGitMode();
  }

  function browserPayload(page, extra) {
    const source = page && typeof page === 'object' ? page : {};
    return Object.assign({
      workspaceId: currentWorkspaceId(),
      agentId: state.selectedAgent,
      hostId: field(source, 'hostId', state.browser.selectedHostId),
      instanceId: field(source, 'instanceId', ''),
      pageId: field(source, 'pageId', '')
    }, extra || {});
  }

  function browserHostById(hostId) {
    return state.browser.hosts.find((host) => field(host, 'hostId', '') === hostId) || null;
  }

  function browserHostSupportsAction(hostId, action) {
    const host = browserHostById(hostId);
    if (!host) return false;
    if (webCompatibility && typeof webCompatibility.browserHostSupportsAction === 'function') {
      return webCompatibility.browserHostSupportsAction(host, action, state.capabilities);
    }
    if (host.actionCapabilitiesExplicit !== true) return true;
    return arrayValue(host, 'supportedActions').includes(action);
  }

  function browserHostSupportsCommand(hostId, command) {
    const host = browserHostById(hostId);
    if (!host || !Array.isArray(host.supportedCommands)) return false;
    if (webCompatibility && typeof webCompatibility.browserHostSupportsCommand === 'function') {
      return webCompatibility.browserHostSupportsCommand(host, command, state.capabilities);
    }
    return host.supportedCommands.includes(command);
  }

  function browserResultMessage(result, fallback) {
    if (result && result.ok === false) return field(result, 'message', field(result, 'failureCategory', fallback));
    return fallback;
  }

  function normalizeBrowserActionResult(result) {
    if (webCompatibility && typeof webCompatibility.normalizeBrowserActionResult === 'function') {
      return webCompatibility.normalizeBrowserActionResult(result);
    }
    return result && typeof result === 'object' ? result : { ok: false, message: 'Browser action result is unavailable.' };
  }

  function browserActionButton(parent, label, handler, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = disabled === true;
    text(button, label);
    button.addEventListener('click', () => handler().catch(showError));
    parent.appendChild(button);
  }

  async function browserActionPreviewConfirm(page, action, extra, prompt) {
    const base = browserPayload(page, Object.assign({}, extra || {}, { action }));
    let result = normalizeBrowserActionResult(await send('browser.page.action', base));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser action failed.'));
    if (result.preview === true) {
      const targetState = result.targetState && result.targetState.mode === 'legacy'
        ? ' The host did not provide a page snapshot; confirm only if the selected host is trusted.'
        : '';
      if (!result.planId || !window.confirm((prompt || 'Confirm this browser action?') + targetState)) return null;
      result = normalizeBrowserActionResult(await send('browser.page.action', Object.assign({}, base, { planId: result.planId, confirm: true })));
      if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser action confirmation failed.'));
    }
    return result;
  }

  function workspaceRelativeBrowserPath(value) {
    const relative = typeof value === 'string' ? value.trim() : '';
    if (!relative || relative.startsWith('/') || relative.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(relative) || relative.split(/[\\/]/).includes('..')) return '';
    const root = currentWorkspacePath();
    if (!root) return '';
    return root.replace(/[\\/]$/, '') + '/' + relative.replace(/^[\\/]+/, '');
  }

  async function runBrowserAction(page, action) {
    const extra = {};
    const ref = () => window.prompt('Accessibility element ref (for example @e1)', '@e1') || '';
    if (['click', 'fill', 'type', 'keypress', 'hover', 'select', 'download'].includes(action)) {
      extra.ref = ref();
      if (!extra.ref) return;
    }
    if (action === 'fill' || action === 'select') extra.value = window.prompt(action === 'select' ? 'Select value' : 'Fill value', '') || '';
    if (action === 'type') extra.text = window.prompt('Text to type', '') || '';
    if (action === 'keypress') extra.key = window.prompt('Key name', 'Enter') || '';
    if (action === 'drag') {
      extra.sourceRef = window.prompt('Drag source ref', '@e1') || '';
      extra.targetRef = window.prompt('Drag target ref', '@e2') || '';
      if (!extra.sourceRef || !extra.targetRef) return;
    }
    if (action === 'upload') {
      extra.ref = ref();
      const filePath = workspaceRelativeBrowserPath(window.prompt('Workspace-relative upload path', '') || '');
      if (!extra.ref || !filePath) throw new Error('Upload requires a workspace-relative file path.');
      extra.filePaths = [filePath];
    }
    if (action === 'scroll') {
      extra.deltaX = Number.parseInt(window.prompt('Horizontal scroll delta', '0') || '0', 10) || 0;
      extra.deltaY = Number.parseInt(window.prompt('Vertical scroll delta', '600') || '600', 10) || 0;
    }
    if (action === 'evaluate') {
      extra.function = window.prompt('Bounded JavaScript function', '() => document.title') || '';
      if (!extra.function) return;
    }
    const result = await browserActionPreviewConfirm(page, action, extra, 'Preview and confirm browser ' + action + '?');
    if (result) {
      const targetState = result.targetState && result.targetState.mode === 'legacy' ? ' · target snapshot unavailable' : '';
      text(byId('detail-output'), 'Browser action completed: ' + field(result, 'action', action) + (result.applied === true ? ' · applied' : ' · accepted') + targetState + '. Sensitive action parameters and return values are not displayed.');
      await refreshBrowser();
    }
  }

  async function navigateBrowserPage(page, operation) {
    const url = operation === 'navigate' ? window.prompt('Credential-free HTTP(S) URL', field(page, 'url', '')) || '' : '';
    if (operation === 'navigate' && !url) return;
    const result = await send('browser.page.navigate', browserPayload(page, { operation, url }));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser navigation failed.'));
    text(byId('detail-output'), JSON.stringify(result, null, 2));
    await refreshBrowser();
  }

  async function closeBrowserPage(page) {
    const base = browserPayload(page);
    let result = await send('browser.page.close', base);
    if (result.preview === true) {
      if (!result.planId || !window.confirm('Preview and close this browser page?')) return;
      result = await send('browser.page.close', Object.assign({}, base, { planId: result.planId, confirm: true }));
    }
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser page close failed.'));
    await refreshBrowser();
  }

  async function closeBrowserInstance(instanceId, hostId) {
    const base = browserPayload({ hostId, instanceId });
    let result = await send('browser.instance.close', base);
    if (result.preview === true) {
      if (!result.planId || !window.confirm('Preview and close this browser instance?')) return;
      result = await send('browser.instance.close', Object.assign({}, base, { planId: result.planId, confirm: true }));
    }
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser instance close failed.'));
    await refreshBrowser();
  }

  function clearBrowserScreenshot() {
    state.browser.screenshot = {
      hostId: '',
      pageId: '',
      dataUrl: '',
      mimeType: '',
      bytes: null,
      fullPage: false
    };
    const image = byId('browser-screenshot-image');
    if (image) {
      image.removeAttribute('src');
      image.removeAttribute('alt');
      image.classList.add('hidden');
    }
    const preview = byId('browser-screenshot-preview');
    if (preview) preview.classList.add('hidden');
    text(byId('browser-screenshot-status'), '');
  }

  function browserScreenshotFullPage() {
    const checkbox = byId('browser-screenshot-full-page');
    if (checkbox && typeof checkbox.checked === 'boolean') {
      state.browser.screenshotFullPage = checkbox.checked === true;
    }
    return state.browser.screenshotFullPage === true;
  }

  function setBrowserSelectedPage(pageId) {
    if (state.browser.selectedPageId !== pageId) clearBrowserScreenshot();
    state.browser.selectedPageId = pageId;
  }

  function renderBrowserScreenshot(snapshot, page) {
    const preview = byId('browser-screenshot-preview');
    const image = byId('browser-screenshot-image');
    const status = byId('browser-screenshot-status');
    if (!preview || !image || !status) return;
    if (!snapshot || snapshot.valid !== true || !snapshot.dataBase64 || !snapshot.mimeType) {
      clearBrowserScreenshot();
      text(status, 'Screenshot preview unavailable: ' + field(snapshot, 'message', 'The host returned unsupported or incomplete image data.') + ' ' + field(snapshot, 'remediation', 'Request a fresh screenshot.'));
      preview.classList.remove('hidden');
      return;
    }
    const hostId = field(page, 'hostId', state.browser.selectedHostId);
    const pageId = field(page, 'pageId', state.browser.selectedPageId);
    const dataUrl = 'data:' + snapshot.mimeType + ';base64,' + snapshot.dataBase64;
    state.browser.screenshot = {
      hostId,
      pageId,
      dataUrl,
      mimeType: snapshot.mimeType,
      bytes: snapshot.bytes,
      fullPage: snapshot.fullPage === true
    };
    image.src = dataUrl;
    image.alt = 'Browser screenshot for ' + (field(page, 'title', pageId || 'page'));
    image.classList.remove('hidden');
    preview.classList.remove('hidden');
    const size = snapshot.bytes === null ? 'unavailable' : String(snapshot.bytes) + ' bytes';
    text(status, 'Screenshot preview · ' + snapshot.mimeType + ' · ' + size + (snapshot.fullPage === true ? ' · full page' : ''));
  }

  async function showBrowserSnapshot(page) {
    setBrowserSelectedPage(field(page, 'pageId', ''));
    const result = await send('browser.page.snapshot', browserPayload(page));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser snapshot failed.'));
    text(byId('detail-output'), field(result.snapshot, 'text', JSON.stringify(result, null, 2)));
  }

  async function showBrowserScreenshot(page) {
    setBrowserSelectedPage(field(page, 'pageId', ''));
    const requestGeneration = state.connectionGeneration;
    const requestHostId = field(page, 'hostId', state.browser.selectedHostId);
    const requestPageId = field(page, 'pageId', '');
    const result = await send('browser.page.screenshot', browserPayload(page, { fullPage: browserScreenshotFullPage() }));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser screenshot failed.'));
    if (requestGeneration !== state.connectionGeneration || requestHostId !== state.browser.selectedHostId || requestPageId !== state.browser.selectedPageId) return;
    const normalized = webCompatibility && typeof webCompatibility.normalizeBrowserScreenshot === 'function'
      ? webCompatibility.normalizeBrowserScreenshot(result)
      : { screenshot: { valid: false, dataBase64: '', mimeType: '', bytes: null, fullPage: false }, message: 'Screenshot parser unavailable.', remediation: 'Upgrade the Web UI and retry.' };
    if (normalized.screenshot.valid !== true) {
      renderBrowserScreenshot(normalized, page);
      text(byId('detail-output'), 'Screenshot preview unavailable.');
      return;
    }
    renderBrowserScreenshot(normalized.screenshot, page);
    text(byId('detail-output'), 'Screenshot captured: ' + (normalized.screenshot.bytes === null ? 'unavailable' : String(normalized.screenshot.bytes) + ' bytes') + '.');
  }

  async function showBrowserLogs(page) {
    const result = await send('browser.page.logs', browserPayload(page, { maxEntries: 100 }));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser logs unavailable.'));
    text(byId('detail-output'), JSON.stringify(result.logs || result, null, 2));
  }

  async function waitBrowserPage(page) {
    const condition = window.prompt('Wait for page text (leave blank to wait for URL fragment)', '') || '';
    const payload = condition ? { text: condition, timeoutMs: 10000 } : { url: window.prompt('URL fragment', '') || '', timeoutMs: 10000 };
    const result = await send('browser.page.wait', browserPayload(page, payload));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser wait failed.'));
    text(byId('detail-output'), JSON.stringify(result, null, 2));
  }

  async function listBrowserDownloads(page) {
    const result = await send('browser.download.list', browserPayload(page));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser download list unavailable.'));
    state.browser.downloads = arrayValue(result, 'downloads');
    renderBrowserDownloads(state.browser.downloads);
    const summaries = state.browser.downloads.map((download) => ({
      pageId: field(download, 'pageId', ''),
      state: field(download, 'state', field(download, 'status', 'unknown')),
      suggestedFilename: field(download, 'suggestedFilename', field(download, 'fileName', '')),
      totalBytes: numberValue(download, 'totalBytes', 0),
      receivedBytes: numberValue(download, 'receivedBytes', numberValue(download, 'bytes', 0)),
      updatedAt: field(download, 'updatedAt', '')
    }));
    text(byId('detail-output'), JSON.stringify(summaries, null, 2));
  }

  function selectBrowserHost(hostId) {
    if (!browserHostById(hostId)) return;
    clearBrowserScreenshot();
    state.browser.selectedHostId = hostId;
    state.browser.selectedPageId = '';
    renderBrowserHosts(state.browser.hosts);
    refreshBrowser().catch(showError);
  }

  async function createBrowserInstance() {
    const hostId = state.browser.selectedHostId;
    if (!hostId || !browserHostSupportsCommand(hostId, 'instance.create')) return;
    const result = await send('browser.instance.create', browserPayload({ hostId }));
    if (result.ok === false) throw new Error(browserResultMessage(result, 'Browser instance creation failed.'));
    text(byId('detail-output'), 'Browser instance ready: ' + field(result.instance, 'instanceId', field(result, 'instanceId', 'unavailable')));
    await refreshBrowser();
  }

  function renderBrowserDownloads(downloads) {
    const list = byId('browser-download-list');
    if (!list) return;
    clear(list);
    const entries = Array.isArray(downloads) ? downloads : [];
    entries.forEach((download) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(download, 'fileName', field(download, 'suggestedFilename', field(download, 'downloadId', 'Download'))));
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      const status = field(download, 'state', field(download, 'status', 'unknown'));
      const bytes = numberValue(download, 'bytes', numberValue(download, 'receivedBytes', 0));
      text(meta, status + (bytes > 0 ? ' · ' + String(bytes) + ' bytes' : '') + (field(download, 'updatedAt', '').length > 0 ? ' · ' + field(download, 'updatedAt', '') : ''));
      item.appendChild(meta);
      list.appendChild(item);
    });
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      text(empty, 'No browser downloads reported.');
      list.appendChild(empty);
    }
  }

  function renderBrowserInstances(instances) {
    const list = byId('browser-instance-list');
    if (!list) return;
    clear(list);
    const entries = Array.isArray(instances) ? instances : [];
    entries.forEach((instance) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(instance, 'name', field(instance, 'instanceId', 'Browser instance')));
      item.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted';
      text(meta, field(instance, 'engine', 'unknown') + ' · ' + (instance.connected === false ? 'disconnected' : 'connected'));
      item.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'button-row';
      const instanceId = field(instance, 'instanceId', '');
      const hostId = field(instance, 'hostId', state.browser.selectedHostId);
      if (hostId) {
        browserActionButton(actions, 'Use host', () => {
          if (state.browser.selectedHostId !== hostId) clearBrowserScreenshot();
          state.browser.selectedHostId = hostId;
          renderBrowserHosts(state.browser.hosts);
          return refreshBrowser();
        }, hostId === state.browser.selectedHostId);
      }
      if (instanceId && browserHostSupportsCommand(hostId, 'instance.close')) {
        browserActionButton(actions, 'Close instance', () => closeBrowserInstance(instanceId, hostId), false);
      }
      item.appendChild(actions);
      list.appendChild(item);
    });
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      text(empty, 'No browser instances reported by the selected host.');
      list.appendChild(empty);
    }
  }

  function renderBrowserHosts(hosts) {
    const list = byId('browser-host-list');
    clear(list);
    hosts.forEach((host) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = document.createElement('strong');
      text(title, field(host, 'label', field(host, 'hostId', 'Browser Host')));
      const meta = document.createElement('div');
      meta.className = 'muted';
      const actions = arrayValue(host, 'supportedActions');
      const commands = arrayValue(host, 'supportedCommands');
      const gate = webCompatibility && typeof webCompatibility.browserHostGate === 'function'
        ? webCompatibility.browserHostGate(host, state.capabilities)
        : { ok: true };
      const readiness = field(host, 'readiness', '');
      const connectionState = host.connected === false ? 'disconnected' : readiness && readiness !== 'legacy' ? readiness : 'connected';
      const hostState = field(host, 'platform', 'external') + ' · ' + (gate.ok ? connectionState : 'unavailable') + ' · ' + String(actions.length) + ' actions · ' + String(commands.length) + ' commands';
      text(meta, field(host, 'platform', 'external') + ' · ' + String(actions.length) + ' actions · ' + String(commands.length) + ' commands');
      item.appendChild(title);
      item.appendChild(meta);
      const use = document.createElement('button');
      text(meta, hostState);
      use.type = 'button';
      use.className = field(host, 'hostId', '') === state.browser.selectedHostId ? 'active' : '';
      use.disabled = field(host, 'hostId', '') === state.browser.selectedHostId;
      text(use, use.disabled ? 'Selected host' : 'Use host');
      use.addEventListener('click', () => selectBrowserHost(field(host, 'hostId', '')));
      item.appendChild(use);
      list.appendChild(item);
    });
    if (hosts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      text(empty, 'No compatible browser host is connected for this workspace.');
      list.appendChild(empty);
    }
  }

  function renderBrowserPages(pages) {
    const list = byId('browser-page-list');
    clear(list);
    pages.forEach((page) => {
      const item = document.createElement('div');
      item.className = 'item browser-page-item' + (field(page, 'pageId', '') === state.browser.selectedPageId ? ' selected' : '');
      const title = document.createElement('strong');
      text(title, field(page, 'title', field(page, 'pageId', 'Page')));
      const meta = document.createElement('div');
      meta.className = 'muted';
      const hostId = field(page, 'hostId', state.browser.selectedHostId);
      const instanceId = field(page, 'instanceId', '');
      text(meta, field(page, 'url', 'about:blank') + ' · host ' + (hostId || 'unavailable') + (instanceId ? ' · instance ' + instanceId : ''));
      item.appendChild(title);
      item.appendChild(meta);
      const controls = document.createElement('div');
      controls.className = 'button-row';
      const pageId = field(page, 'pageId', '');
      const supported = (command) => browserHostSupportsCommand(hostId, command);
      if (supported('page.snapshot')) browserActionButton(controls, 'Snapshot', () => { setBrowserSelectedPage(pageId); return showBrowserSnapshot(page); }, false);
      if (supported('page.screenshot')) browserActionButton(controls, 'Screenshot', () => { setBrowserSelectedPage(pageId); return showBrowserScreenshot(page); }, false);
      if (supported('page.navigate')) {
        browserActionButton(controls, 'Navigate', () => navigateBrowserPage(page, 'navigate'), false);
        browserActionButton(controls, 'Back', () => navigateBrowserPage(page, 'back'), false);
        browserActionButton(controls, 'Forward', () => navigateBrowserPage(page, 'forward'), false);
        browserActionButton(controls, 'Reload', () => navigateBrowserPage(page, 'reload'), false);
      }
      if (supported('page.logs')) browserActionButton(controls, 'Logs', () => showBrowserLogs(page), false);
      if (supported('page.wait')) browserActionButton(controls, 'Wait', () => waitBrowserPage(page), false);
      if (supported('download.list')) browserActionButton(controls, 'Downloads', () => listBrowserDownloads(page), false);
      if (supported('page.close')) browserActionButton(controls, 'Close page', () => closeBrowserPage(page), false);
      const actionControls = document.createElement('div');
      actionControls.className = 'button-row browser-action-row';
      ['click', 'fill', 'type', 'keypress', 'hover', 'select', 'drag', 'upload', 'scroll', 'download', 'evaluate'].forEach((action) => {
        if (!supported('page.action') || !browserHostSupportsAction(hostId, action)) return;
        browserActionButton(actionControls, action, () => runBrowserAction(page, action), false);
      });
      controls.appendChild(actionControls);
      item.appendChild(controls);
      item.addEventListener('click', (event) => {
        if (event.target && event.target.tagName === 'BUTTON') return;
        setBrowserSelectedPage(pageId);
        renderBrowserPages(state.browser.pages);
      });
      list.appendChild(item);
    });
    if (pages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      text(empty, 'No browser pages reported by the selected host.');
      list.appendChild(empty);
    }
  }

  async function refreshBrowser() {
    const refreshToken = state.browser.refreshToken + 1;
    state.browser.refreshToken = refreshToken;
    const refreshGeneration = state.connectionGeneration;
    const refreshWorkspaceId = currentWorkspaceId();
    const refreshIsCurrent = () => state.browser.refreshToken === refreshToken &&
      state.connectionGeneration === refreshGeneration &&
      state.socket && state.socket.readyState === WebSocket.OPEN &&
      !state.pageClosing && currentWorkspaceId() === refreshWorkspaceId;
    const visible = featureEnabled('browserAutomation');
    byId('browser-section').classList.toggle('hidden', !visible);
    if (!visible || !currentWorkspaceId()) {
      clearBrowserScreenshot();
      state.browser.hosts = [];
      state.browser.instances = [];
      state.browser.pages = [];
      renderBrowserHosts([]);
      renderBrowserInstances([]);
      renderBrowserPages([]);
      renderBrowserPermission(null);
      return;
    }
    const hosts = await send('browser.host.list', { workspaceId: refreshWorkspaceId });
    if (!refreshIsCurrent()) return;
    const normalizedHostList = webCompatibility && typeof webCompatibility.normalizeBrowserHostList === 'function'
      ? webCompatibility.normalizeBrowserHostList(hosts)
      : { hosts: arrayValue(hosts, 'hosts') };
    state.browser.hosts = normalizedHostList.hosts;
    if (!state.browser.selectedHostId || !browserHostById(state.browser.selectedHostId)) {
      const compatible = state.browser.hosts.find((host) => browserHostSupportsCommand(field(host, 'hostId', ''), 'page.list'));
      const nextHostId = compatible ? field(compatible, 'hostId', '') : field(state.browser.hosts[0], 'hostId', '');
      if (nextHostId !== state.browser.selectedHostId) clearBrowserScreenshot();
      state.browser.selectedHostId = nextHostId;
    }
    renderBrowserHosts(state.browser.hosts);
    await refreshBrowserPermission(refreshIsCurrent);
    if (!refreshIsCurrent()) return;
    const hostId = state.browser.selectedHostId;
    const instanceButton = byId('browser-instance-button');
    if (instanceButton) instanceButton.disabled = !hostId || !browserHostSupportsCommand(hostId, 'instance.create');
    const pageButton = byId('browser-page-button');
    if (pageButton) pageButton.disabled = !hostId || !browserHostSupportsCommand(hostId, 'page.create');
    const downloadButton = byId('browser-download-button');
    if (downloadButton) downloadButton.disabled = !hostId || !browserHostSupportsCommand(hostId, 'download.list');
    state.browser.instances = [];
    state.browser.pages = [];
    if (!hostId) {
      clearBrowserScreenshot();
      renderBrowserInstances([]);
      renderBrowserPages([]);
      renderBrowserDownloads(state.browser.downloads);
      return;
    }
    if (browserHostSupportsCommand(hostId, 'instance.list')) {
      const instances = await send('browser.instance.list', browserPayload({ hostId }));
      if (!refreshIsCurrent() || state.browser.selectedHostId !== hostId) return;
      state.browser.instances = arrayValue(instances, 'instances').map((instance) => Object.assign({}, instance, { hostId: field(instance, 'hostId', field(instances, 'hostId', hostId)) }));
    }
    renderBrowserInstances(state.browser.instances);
    if (browserHostSupportsCommand(hostId, 'page.list')) {
      const pages = await send('browser.page.list', browserPayload({ hostId }));
      if (!refreshIsCurrent() || state.browser.selectedHostId !== hostId) return;
      state.browser.pages = arrayValue(pages, 'pages').map((page) => Object.assign({}, page, { hostId: field(page, 'hostId', field(pages, 'hostId', hostId)) }));
    }
    if (!refreshIsCurrent() || state.browser.selectedHostId !== hostId) return;
    const screenshot = state.browser.screenshot;
    if (screenshot.pageId.length > 0 && !state.browser.pages.some((page) =>
      field(page, 'pageId', '') === screenshot.pageId && field(page, 'hostId', hostId) === screenshot.hostId)) clearBrowserScreenshot();
    renderBrowserPages(state.browser.pages);
    renderBrowserDownloads(state.browser.downloads);
  }

  async function updateBrowserPermission() {
    const domain = byId('browser-domain-input').value.trim();
    if (!currentWorkspaceId() || !domain) return;
    try {
      const preview = await send('browser.permission.set', { workspaceId: currentWorkspaceId(), domains: [domain] });
      if (preview.preview !== true || !preview.planId || !window.confirm('Allow browser automation to navigate to this domain?')) return;
      await send('browser.permission.set', { workspaceId: currentWorkspaceId(), domains: [domain], planId: preview.planId, confirm: true });
      await refreshBrowser();
    } catch (error) { showError(error); }
  }

  function renderBrowserPermission(permission) {
    const status = byId('browser-permission-status');
    if (!status) return;
    const source = permission && typeof permission === 'object' ? permission : {};
    const domains = Array.isArray(source.domains) ? source.domains.filter((item) => typeof item === 'string') : [];
    const parts = [];
    parts.push(domains.length > 0 ? 'Allowed domains: ' + domains.join(', ') : 'No allowed domains.');
    parts.push(source.downloadDirectoryConfigured === true
      ? 'Managed download directory: configured'
      : 'Managed download directory: not configured');
    if (typeof source.updatedAt === 'string' && source.updatedAt.length > 0) {
      parts.push('Updated: ' + source.updatedAt);
    }
    text(status, parts.join(' · '));
  }

  async function refreshBrowserPermission(isCurrent) {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId) {
      renderBrowserPermission(null);
      return;
    }
    const current = typeof isCurrent === 'function' ? isCurrent : () => true;
    try {
      const result = await send('browser.permission.get', { workspaceId });
      if (!current()) return;
      renderBrowserPermission(result && result.ok === true ? (result.permission || result) : null);
    } catch (_error) {
      if (current()) renderBrowserPermission(null);
    }
  }

  async function createBrowserPage() {
    const url = byId('browser-url-input').value.trim();
    if (!currentWorkspaceId() || !url) return;
    const hostId = state.browser.selectedHostId;
    if (!hostId || !browserHostSupportsCommand(hostId, 'page.create')) return;
    try {
      await send('browser.page.create', browserPayload({ hostId }, { url }));
      await refreshBrowser();
    } catch (error) { showError(error); }
  }

  function renderNotifications(notifications) {
    const list = byId('notification-list');
    clear(list);
    notifications.forEach((notification) => {
      const item = document.createElement('div');
      item.className = 'item ' + (notification.read === true ? 'read' : 'unread');
      const title = document.createElement('strong');
      text(title, field(notification, 'title', field(notification, 'body', 'Notification')));
      item.appendChild(title);
      const body = document.createElement('div');
      body.className = 'muted';
      text(body, field(notification, 'message', field(notification, 'body', '')));
      item.appendChild(body);
      const read = document.createElement('button');
      read.type = 'button';
      text(read, notification.read === true ? 'Unread' : 'Read');
      read.addEventListener('click', () => send('notification.read', { notificationId: field(notification, 'notificationId', ''), read: notification.read !== true }).then(loadNotifications).catch(showError));
      item.appendChild(read);
      const actions = arrayValue(notification, 'actions');
      actions.slice(0, 3).forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        text(button, field(action, 'label', field(action, 'id', 'Open')));
        button.addEventListener('click', async () => {
          if (field(action, 'kind', '') === 'open' && !window.confirm('Open this notification route?')) return;
          try { await send('notification.action', { notificationId: field(notification, 'notificationId', ''), actionId: field(action, 'id', 'open') }); await loadNotifications(); } catch (error) { showError(error); }
        });
        item.appendChild(button);
      });
      list.appendChild(item);
    });
  }

  async function loadNotifications() {
    if (!featureEnabled('offlineNotifications')) return;
    try {
      const result = await send('notification.list', { includeRead: false, limit: 100 });
      renderNotifications(arrayValue(result, 'notifications'));
    } catch (error) { showError(error); }
  }

  async function optionalRequest(type, payload) {
    try {
      return { ok: true, value: await send(type, payload || {}) };
    } catch (error) {
      return webCompatibility ? webCompatibility.normalizeOptionalFailure(type, error) : { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function clearGithubAuthTimer() {
    if (state.github.authPollTimer) window.clearTimeout(state.github.authPollTimer);
    state.github.authPollTimer = 0;
  }

  async function refreshGithubAuth() {
    const result = await send('github.auth.status', { accountId: githubAccountId() });
    state.github.authenticated = result.authenticated === true;
    state.github.source = field(result, 'source', 'none');
    state.github.accounts = arrayValue(result, 'accounts').map((item) => normalizeGithubAccount(item));
    const account = result.account && typeof result.account === 'object' ? normalizeGithubAccount(result.account) : null;
    state.github.account = account || (state.github.accounts.length > 0 ? state.github.accounts[0] : null);
    if (state.github.account && !state.github.accounts.some((item) => item.id === state.github.account.id)) state.github.accounts.push(state.github.account);
    renderGithub();
  }

  async function refreshGithubBinding() {
    if (!state.hostProfileId || !currentWorkspaceId()) {
      state.github.binding = null;
      state.github.owner = '';
      state.github.repo = '';
      renderGithub();
      return;
    }
    const result = await send('github.binding.get', { hostProfileId: state.hostProfileId, workspaceId: currentWorkspaceId() });
    const binding = result.binding && typeof result.binding === 'object' ? normalizeGithubBinding(result.binding) : null;
    state.github.binding = binding;
    state.github.owner = binding ? binding.owner : '';
    state.github.repo = binding ? binding.repo : '';
    byId('github-owner-input').value = state.github.owner;
    byId('github-repo-input').value = state.github.repo;
    renderGithub();
  }

  async function refreshGithubPullRequests() {
    if (!state.github.authenticated || !state.github.owner || !state.github.repo) {
      state.github.pullRequests = [];
      state.github.selected = null;
      state.github.selectedNumber = 0;
      renderGithub();
      return;
    }
    const result = await send('github.pr.list', githubPayload({ state: state.github.prState, page: state.github.page, perPage: state.github.perPage }));
    if (result.ok === false) throw new Error(field(result, 'message', 'GitHub pull request list failed.'));
    state.github.pullRequests = arrayValue(result, 'pullRequests').map((item) => normalizeGithubPullRequest(item));
    const pagination = objectValue(result, 'pagination') || {};
    state.github.page = numberValue(pagination, 'page', state.github.page);
    state.github.hasNext = pagination.hasNext === true;
    if (state.github.selectedNumber > 0 && !state.github.pullRequests.some((item) => item.number === state.github.selectedNumber)) {
      state.github.selectedNumber = 0;
      state.github.selected = null;
    }
    renderGithub();
  }

  async function refreshGithub() {
    if (!featureEnabled('githubIntegration') || !featureEnabled('githubPrWorkflow')) return;
    state.github.loading = true;
    state.github.error = '';
    renderGithub();
    try {
      await refreshGithubAuth();
      await refreshGithubBinding();
      await refreshGithubPullRequests();
    } catch (error) {
      setGithubError(error);
    } finally {
      state.github.loading = false;
      renderGithub();
    }
  }

  function scheduleGithubAuthPoll() {
    clearGithubAuthTimer();
    if (!state.github.authSessionId) return;
    const delay = Math.max(250, state.github.authNextPollAt - Date.now());
    state.github.authPollTimer = window.setTimeout(() => pollGithubAuth(true).catch(setGithubError), delay);
  }

  async function startGithubAuth() {
    clearGithubAuthTimer();
    try {
      const result = await send('github.auth.device.start', {});
      if (result.ok === false) throw new Error(field(result, 'message', 'GitHub authorization could not start.'));
      state.github.authPending = result;
      state.github.authSessionId = field(result, 'sessionId', '');
      state.github.authNextPollAt = Date.now() + numberValue(result, 'interval', 5) * 1000;
      state.github.error = '';
      renderGithub();
      scheduleGithubAuthPoll();
    } catch (error) { setGithubError(error); }
  }

  async function pollGithubAuth(automatic) {
    if (!state.github.authSessionId) return;
    if (Date.now() < state.github.authNextPollAt) {
      if (!automatic) text(byId('github-error'), 'Wait for the next GitHub authorization poll interval.');
      scheduleGithubAuthPoll();
      return;
    }
    clearGithubAuthTimer();
    try {
      const result = await send('github.auth.device.poll', { authSessionId: state.github.authSessionId });
      const category = field(result, 'failureCategory', '');
      if (result.ok === false) {
        if (category === 'authorization_pending' || category === 'slow_down' || category === 'poll_too_early') {
          state.github.authNextPollAt = Date.now() + numberValue(result, 'interval', numberValue(state.github.authPending, 'interval', 5)) * 1000;
          state.github.error = category === 'poll_too_early' ? 'GitHub asks us to wait before polling again.' : 'Waiting for GitHub authorization.';
          renderGithub();
          scheduleGithubAuthPoll();
          return;
        }
        throw new Error(field(result, 'message', 'GitHub authorization failed.'));
      }
      state.github.authenticated = true;
      state.github.account = result.account && typeof result.account === 'object' ? normalizeGithubAccount(result.account) : null;
      state.github.accounts = state.github.account ? [state.github.account] : state.github.accounts;
      state.github.authSessionId = '';
      state.github.authPending = null;
      state.github.authNextPollAt = 0;
      state.github.error = '';
      renderGithub();
      await refreshGithubBinding();
      await refreshGithubPullRequests();
    } catch (error) { setGithubError(error); }
  }

  async function selectGithubAccount() {
    const accountId = byId('github-account-select').value;
    if (!accountId) return;
    try {
      const result = await send('github.auth.status', { accountId });
      state.github.authenticated = result.authenticated === true;
      state.github.account = result.account && typeof result.account === 'object' ? normalizeGithubAccount(result.account) : state.github.accounts.find((item) => item.id === accountId) || null;
      state.github.source = field(result, 'source', state.github.source);
      await stopGithubWatch();
      await refreshGithubBinding();
      await refreshGithubPullRequests();
    } catch (error) { setGithubError(error); }
  }

  async function saveGithubBinding() {
    const owner = byId('github-owner-input').value.trim();
    const repo = byId('github-repo-input').value.trim();
    if (!owner || !repo || !githubAccountId() || !currentWorkspaceId()) return;
    if (!window.confirm('Bind this GitHub account to the selected workspace repository?')) return;
    try {
      const result = await send('github.binding.set', githubPayload({ owner, repo, confirm: true }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Repository binding failed.'));
      state.github.binding = result.binding && typeof result.binding === 'object' ? normalizeGithubBinding(result.binding) : null;
      state.github.owner = owner;
      state.github.repo = repo;
      state.github.page = 1;
      await refreshGithubPullRequests();
      renderGithub();
    } catch (error) { setGithubError(error); }
  }

  async function selectGithubPullRequest(number) {
    await stopGithubWatch();
    state.github.selectedNumber = number;
    try {
      const result = await send('github.pr.status', githubPayload({ number }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Pull request status unavailable.'));
      state.github.selected = normalizeGithubPullRequest(result);
      state.github.checks = normalizeGithubChecks({ sha: state.github.selected.sha, checksSummary: result.checksSummary });
      renderGithub();
      await refreshGithubChecks();
    } catch (error) { setGithubError(error); }
  }

  async function refreshGithubChecks() {
    if (!state.github.selected || !state.github.selected.sha) return;
    try {
      const result = await send('github.checks.list', githubPayload({ sha: state.github.selected.sha }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Checks unavailable.'));
      state.github.checks = normalizeGithubChecks(result);
      renderGithubChecks();
    } catch (error) { setGithubError(error); }
  }

  async function githubPreviewConfirm(type, previewExtra, confirmExtra, prompt) {
    const preview = await send(type, githubPayload(Object.assign({}, previewExtra || {}, { preview: true, confirm: false })));
    if (preview.ok === false) throw new Error(field(preview, 'message', 'GitHub preview failed.'));
    const planId = field(preview, 'planId', '');
    if (!planId || !window.confirm(prompt)) return null;
    const payload = Object.assign({}, confirmExtra || {}, { planId, confirm: true, preview: false, dryRun: false });
    const result = await send(type, githubPayload(payload));
    if (result.ok === false) throw new Error(field(result, 'message', 'GitHub confirmation failed.'));
    return result;
  }

  async function updateGithubPullRequest() {
    if (!state.github.selected) return;
    try {
      const result = await githubPreviewConfirm('github.pr.update', { number: state.github.selected.number, title: byId('github-pr-title').value.trim(), body: byId('github-pr-body').value }, {}, 'Preview this pull request update and apply it?');
      if (result) await selectGithubPullRequest(state.github.selected.number);
    } catch (error) { setGithubError(error); }
  }

  async function markGithubReady() {
    if (!state.github.selected) return;
    try {
      const result = await githubPreviewConfirm('github.pr.update', { number: state.github.selected.number, ready: true }, {}, 'Mark this pull request ready for review?');
      if (result) await selectGithubPullRequest(state.github.selected.number);
    } catch (error) { setGithubError(error); }
  }

  async function updateGithubCollection(kind) {
    if (!state.github.selected) return;
    const current = kind === 'reviewers' ? state.github.selected.reviewers.join(', ') : state.github.selected.labels.join(', ');
    const input = window.prompt(kind === 'reviewers' ? 'Reviewers, comma separated' : 'Labels, comma separated', current);
    if (input === null) return;
    const values = input.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
    try {
      const type = kind === 'reviewers' ? 'github.pr.reviewers.update' : 'github.pr.labels.update';
      const result = await githubPreviewConfirm(type, { number: state.github.selected.number, [kind]: values }, {}, 'Preview this ' + kind + ' update and apply it?');
      if (result) await selectGithubPullRequest(state.github.selected.number);
    } catch (error) { setGithubError(error); }
  }

  async function mergeGithubPullRequest() {
    if (!state.github.selected) return;
    try {
      const result = await githubPreviewConfirm('github.pr.merge', { number: state.github.selected.number, dryRun: true, mergeMethod: 'squash' }, {}, 'Preview and merge this pull request?');
      if (result) { await refreshGithubPullRequests(); await selectGithubPullRequest(state.github.selected.number); }
    } catch (error) { setGithubError(error); }
  }

  async function createGithubPullRequest() {
    if (!state.github.owner || !state.github.repo) return;
    const head = window.prompt('Head branch');
    if (!head) return;
    const base = window.prompt('Base branch', 'main') || 'main';
    const title = window.prompt('Pull request title');
    if (!title) return;
    const body = window.prompt('Pull request body', '') || '';
    try {
      const preview = await send('github.pr.create', githubPayload({ head, base, title, body, draft: false, dryRun: true }));
      if (preview.ok === false || preview.dryRun !== true || !window.confirm('Create this pull request?')) return;
      const result = await send('github.pr.create', githubPayload({ head, base, title, body, draft: false, dryRun: false }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Pull request creation failed.'));
      await refreshGithubPullRequests();
    } catch (error) { setGithubError(error); }
  }

  async function startGithubWatch() {
    if (!state.github.selected) return;
    if (state.github.watching) { await stopGithubWatch(); return; }
    try {
      const result = await send('github.watch.start', githubPayload({ number: state.github.selected.number, subscriberId: state.clientId, intervalMs: 30000 }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Pull request watch failed.'));
      state.github.watchId = field(result, 'watchId', '');
      state.github.watching = state.github.watchId.length > 0;
      renderGithub();
    } catch (error) { setGithubError(error); }
  }

  async function stopGithubWatch() {
    if (!state.github.watchId) { state.github.watching = false; return; }
    const watchId = state.github.watchId;
    state.github.watchId = '';
    state.github.watching = false;
    try { await send('github.watch.stop', githubPayload({ watchId, subscriberId: state.clientId })); } catch (_error) { /* connection may already be closed */ }
    renderGithub();
  }

  async function previewGithubAttachment() {
    if (!state.github.selected || !featureEnabled('githubAssetUpload')) return;
    const relativePath = byId('github-attachment-path').value.trim();
    if (!relativePath || relativePath.startsWith('/') || relativePath.startsWith('\\') || relativePath.split(/[\\/]/).includes('..')) {
      setGithubError(new Error('Attachment path must be a workspace-relative file without path traversal.'));
      return;
    }
    const workspacePath = currentWorkspacePath();
    const filePath = workspacePath.replace(/[\\/]$/, '') + '/' + relativePath.replace(/^[\\/]+/, '');
    try {
      const result = await send('github.attachment.preview', githubPayload({ number: state.github.selected.number, workspacePath, filePath }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Attachment preview failed.'));
      state.github.attachmentPlanId = field(result, 'planId', '');
      state.github.attachmentPreview = result;
      text(byId('github-attachment-status'), field(result, 'fileName', relativePath) + ' · ' + String(numberValue(result, 'size', 0)) + ' bytes · preview ready');
      renderGithub();
    } catch (error) { setGithubError(error); }
  }

  async function uploadGithubAttachment() {
    if (!state.github.attachmentPlanId || !state.github.selected) return;
    if (!window.confirm('Upload the attachment and add a GitHub comment?')) return;
    try {
      const result = await send('github.attachment.upload', githubPayload({ number: state.github.selected.number, planId: state.github.attachmentPlanId, confirm: true }));
      if (result.ok === false) throw new Error(field(result, 'message', 'Attachment upload failed.'));
      state.github.attachmentPlanId = '';
      const assetUrl = field(result, 'assetUrl', '');
      text(byId('github-attachment-status'), result.commented === true ? 'Uploaded and commented.' : 'Uploaded; comment was not created.' + (assetUrl ? ' ' + assetUrl : ''));
      renderGithub();
    } catch (error) { setGithubError(error); }
  }

  async function refreshDiagnostics() {
    if (!featureEnabled('diagnosticsExport')) {
      byId('doctor-section').classList.add('hidden');
      return;
    }
    state.diagnostics.loading = true;
    state.diagnostics.error = '';
    renderDiagnosticsReport(state.diagnostics.report, state.diagnostics);
    const results = await Promise.all([
      optionalRequest('daemon.status', { hostProfileId: '' }),
      optionalRequest('daemon.health', {}),
      optionalRequest('workspace.registry.doctor', { includeArchived: true }),
      optionalRequest('diagnostics.export', { format: 'json', maxBytes: 256 * 1024 })
    ]);
    const daemonStatusResult = results[0];
    const healthResult = results[1];
    const workspaceDoctorResult = results[2];
    const reportResult = results[3];
    state.diagnostics.daemonStatus = daemonStatusResult.ok ? daemonStatusResult.value : null;
    state.diagnostics.health = healthResult.ok ? healthResult.value : null;
    state.diagnostics.workspaceDoctor = workspaceDoctorResult.ok ? workspaceDoctorResult.value : null;
    const reportPayload = reportResult.ok ? reportResult.value : null;
    state.diagnostics.report = reportPayload && objectValue(reportPayload, 'report')
      ? normalizeDiagnosticsReport(reportPayload.report)
      : fallbackReportFromDoctor(
        workspaceDoctorResult.ok ? workspaceDoctorResult.value : (healthResult.ok ? objectValue(healthResult.value, 'doctor') : null),
        daemonStatusResult.ok ? daemonStatusResult.value : null
      );
    state.diagnostics.loading = false;
    state.diagnostics.updatedAt = new Date().toISOString();
    const failures = results.filter((item) => item.ok !== true);
    state.diagnostics.error = failures.length === results.length
      ? 'Diagnostic RPCs are unavailable on this Bridge; showing a compatibility fallback.'
      : '';
    renderDiagnosticsReport(state.diagnostics.report, state.diagnostics);
  }

  async function exportDiagnostics(format) {
    if (!featureEnabled('diagnosticsExport')) return;
    try {
      const exportFormat = format === 'text' ? 'text' : 'json';
      const result = await send('diagnostics.export', { format: exportFormat, maxBytes: 256 * 1024 });
      const report = result && objectValue(result, 'report') ? normalizeDiagnosticsReport(result.report) : normalizeDiagnosticsReport(result);
      state.diagnostics.report = report;
      state.diagnostics.updatedAt = new Date().toISOString();
      renderDiagnosticsReport(report, state.diagnostics);
      const rawReport = result && result.report && typeof result.report === 'object' ? result.report : result;
      const content = exportFormat === 'text' && field(rawReport, 'text', '').length > 0
        ? field(rawReport, 'text', '')
        : JSON.stringify(rawReport, null, 2);
      text(byId('detail-output'), content);
      const mime = exportFormat === 'text' ? 'text/plain' : 'application/json';
      const extension = exportFormat === 'text' ? 'txt' : 'json';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ngf-bridge-diagnostics.' + extension;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { showError(error); }
  }

  async function createWorkspace() {
    const workspacePath = window.prompt('Workspace path');
    if (!workspacePath) return;
    const workspaceTitle = window.prompt('Workspace title', workspacePath.split(/[\\/]/).pop() || 'Workspace') || '';
    try {
      const preview = await send('workspace.registry.create', { workspacePath, workspaceTitle });
      if (preview.preview === true && preview.planId && window.confirm('Register this workspace?')) await send('workspace.registry.create', { workspacePath, workspaceTitle, planId: preview.planId, confirm: true });
      await refreshWorkspaces();
      broadcastTabEvent('workspace.changed', {});
    } catch (error) { showError(error); }
  }

  function openNewAgentDialog() {
    if (!featureEnabled('agentLifecycle')) return;
    const select = byId('new-agent-provider');
    clear(select);
    const providers = Array.isArray(state.providerCapabilities) ? state.providerCapabilities : [];
    let added = 0;
    providers.forEach((provider) => {
      const providerId = field(provider, 'id', '');
      if (providerId.length === 0) return;
      const option = document.createElement('option');
      option.value = providerId;
      text(option, providerId);
      select.appendChild(option);
      added += 1;
    });
    if (added === 0) {
      const option = document.createElement('option');
      option.value = 'mock';
      text(option, 'mock');
      select.appendChild(option);
    }
    const workspace = byId('new-agent-workspace');
    if (currentWorkspace()) workspace.value = field(currentWorkspace(), 'path', '');
    else workspace.value = '';
    byId('new-agent-title').value = '';
    text(byId('new-agent-status'), '');
    byId('new-agent-dialog').showModal();
  }

  async function createAgent() {
    const providerId = byId('new-agent-provider').value;
    const workspacePath = byId('new-agent-workspace').value.trim();
    if (!workspacePath) {
      text(byId('new-agent-status'), 'A workspace path is required.');
      return;
    }
    const workspaceTitle = byId('new-agent-title').value.trim();
    text(byId('new-agent-status'), 'Creating...');
    try {
      const result = await send('agent.create', { providerId, workspacePath, workspaceTitle });
      const agent = result && objectValue(result, 'agent') ? result.agent : null;
      if (!agent) throw new Error('Agent creation returned no agent.');
      byId('new-agent-dialog').close();
      state.selectedAgent = field(agent, 'id', '');
      sessionStorage.setItem('ngf_web_agent_id', state.selectedAgent);
      await refreshAll();
      renderAgents();
      broadcastTabEvent('scope.changed', { workspaceId: state.selectedWorkspace, agentId: state.selectedAgent });
      await refreshSession();
    } catch (error) {
      text(byId('new-agent-status'), error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshSession() {
    if (state.sessionRefreshInFlight) return state.sessionRefreshInFlight;
    const sessionCurrent = refreshSessionInternal();
    state.sessionRefreshInFlight = sessionCurrent;
    try {
      return await sessionCurrent;
    } finally {
      if (state.sessionRefreshInFlight === sessionCurrent) state.sessionRefreshInFlight = null;
    }
  }

  async function refreshSessionInternal() {
    if (!state.selectedAgent) {
      renderMessages([]);
      await refreshTerminals();
      await refreshGit();
      await refreshExperience();
      byId('files-section').classList.add('hidden');
      return;
    }
    try {
      const attached = await send('agent.attach', { agentId: state.selectedAgent });
      const normalizedAttach = webCompatibility ? webCompatibility.normalizeAgentAttach(attached) : {
        agent: attached.agent && typeof attached.agent === 'object' ? attached.agent : null,
        messages: arrayValue(attached, 'messages'),
        timeline: arrayValue(attached, 'timeline'),
        sessionMessagesSupported: true
      };
      const agent = normalizedAttach.agent || currentAgent();
      state.sessionId = field(agent, 'providerSessionId', field(agent, 'remoteSessionId', ''));
      text(byId('conversation-title'), field(agent, 'title', 'Conversation'));
      text(byId('session-summary'), field(agent, 'lastStatus', field(agent, 'lifecycleState', '')));
      if (state.sessionId) {
        let messages = normalizedAttach.messages;
        if (state.sessionMessagesStaleFor !== state.sessionId) {
          try {
            const result = await send('session.messages', { sessionId: state.sessionId, agentId: state.selectedAgent, workspaceId: currentWorkspaceId() });
            const normalized = webCompatibility ? webCompatibility.normalizeSessionMessages(result) : { messages: arrayValue(result, 'messages') };
            if (normalized.supported && normalized.messages.length > 0) messages = normalized.messages;
          } catch (error) {
            const code = error && typeof error.code === 'string' ? error.code : '';
            const messageText = error && typeof error.message === 'string' ? error.message : '';
            if (code === 'session_not_found' || messageText.indexOf('Session not found') >= 0) {
              // The session no longer exists on the Bridge; stop polling it every
              // refresh cycle (each poll triggers provider session discovery on the
              // Bridge, which storms CPU when many tabs hold stale sessions).
              state.sessionMessagesStaleFor = state.sessionId;
            }
            /* Old Bridge attach payload remains the compatibility source. */
          }
        }
        renderMessages(messages.length > 0 ? messages : normalizedAttach.timeline);
      } else renderMessages(normalizedAttach.timeline.length > 0 ? normalizedAttach.timeline : normalizedAttach.messages);
       await Promise.all([refreshTerminals(), refreshGit(), loadFiles(''), refreshServices(), refreshBrowser(), refreshGithub(), refreshExperience()]);
    } catch (error) { showError(error); }
  }

  async function refreshAllInternal(generation) {
    ensureRefreshCurrent(generation);
    const health = await http('/health');
    ensureRefreshCurrent(generation);
    state.capabilities = webCompatibility ? webCompatibility.normalizeBridgeCapabilities(health) : {
      serverInfo: health.serverInfo && typeof health.serverInfo === 'object' ? health.serverInfo : {},
      features: health.features && typeof health.features === 'object' ? health.features : {},
      hasFeatureAdvertisement: health.features && typeof health.features === 'object',
      legacy: !(health.features && typeof health.features === 'object'),
      core: { agentList: true, agentAttach: true, agentSend: true, workspaceFallback: true, sessionAttachTimeline: true },
      compatibility: normalizeCompatibility(health.serverInfo && typeof health.serverInfo === 'object' ? health.serverInfo.compatibility : null),
      warnings: []
    };
    state.features = state.capabilities.features;
    if (state.providerCapabilitiesGeneration !== generation) {
      try {
        const providerPayload = await http('/capabilities');
        const normalizedProviders = webCompatibility
          ? webCompatibility.normalizeProviderCapabilities(providerPayload)
          : { providers: Array.isArray(providerPayload.providers) ? providerPayload.providers : [], advertised: Array.isArray(providerPayload.providers) };
        state.providerCapabilities = normalizedProviders.providers;
        state.providerCapabilitiesKnown = normalizedProviders.advertised;
      } catch (error) {
        if (state.connectionGeneration !== generation) throw error;
        state.providerCapabilities = [];
        state.providerCapabilitiesKnown = false;
      }
      state.providerCapabilitiesGeneration = generation;
    }
    ensureRefreshCurrent(generation);
    const serverInfo = state.capabilities.serverInfo;
    state.hostProfileId = field(serverInfo, 'hostProfileId', field(serverInfo, 'instanceId', state.hostProfileId || 'web-host'));
    byId('terminal-focus-button').classList.toggle('hidden', !featureEnabled('terminalBinaryFrames') && !featureEnabled('terminalActivity'));
    byId('diff-button').classList.toggle('hidden', !featureEnabled('gitAdvanced'));
    byId('files-section').classList.toggle('hidden', !featureEnabled('workspaceFiles'));
    byId('diagnostics-button').classList.toggle('hidden', !featureEnabled('diagnosticsExport'));
    byId('notifications-button').classList.toggle('hidden', !featureEnabled('offlineNotifications'));
    byId('new-agent-button').classList.toggle('hidden', !featureEnabled('agentLifecycle'));
    byId('github-section').classList.toggle('hidden', !featureEnabled('githubIntegration') || !featureEnabled('githubPrWorkflow'));
    renderExperienceVisibility();
    text(byId('host-summary'), field(serverInfo, 'version', field(health, 'version', 'Bridge')) + ' · ' + field(health, 'serverId', ''));
    state.diagnostics.compatibility = state.capabilities.compatibility;
    renderCompatibility(state.diagnostics.compatibility);
    const result = await send('agent.list', {});
    ensureRefreshCurrent(generation);
    state.agents = arrayValue(result, 'agents');
    await refreshWorkspaces();
    ensureRefreshCurrent(generation);
    if (!state.selectedAgent || !state.agents.some((item) => field(item, 'id', '') === state.selectedAgent)) {
      const storedAgent = sessionStorage.getItem('ngf_web_agent_id') || '';
      const candidate = state.agents.find((item) => field(item, 'id', '') === storedAgent && (!state.selectedWorkspace || field(item, 'workspaceId', '') === state.selectedWorkspace)) || state.agents.find((item) => !state.selectedWorkspace || field(item, 'workspaceId', '') === state.selectedWorkspace) || state.agents[0];
      state.selectedAgent = candidate ? field(candidate, 'id', '') : '';
    }
    if (state.selectedAgent) sessionStorage.setItem('ngf_web_agent_id', state.selectedAgent);
    renderExperienceVisibility();
    renderAgents();
    await refreshSession();
    ensureRefreshCurrent(generation);
    await loadNotifications();
    ensureRefreshCurrent(generation);
    await refreshDiagnostics();
    ensureRefreshCurrent(generation);
    await refreshGithub();
    ensureRefreshCurrent(generation);
  }

  async function refreshAll() {
    if (state.refreshInFlight) return state.refreshInFlight;
    const generation = state.connectionGeneration;
    ensureRefreshCurrent(generation);
    const current = refreshAllInternal(generation);
    state.refreshInFlight = current;
    try {
      return await current;
    } catch (error) {
      if (error && error.code === 'WEB_REFRESH_CANCELLED') return null;
      throw error;
    } finally {
      if (state.refreshInFlight === current) state.refreshInFlight = null;
    }
  }

  function prepareTransportForLogin() {
    state.pageClosing = false;
    state.reconnectEnabled = true;
    state.reconnectAttempt = 0;
    state.connectionGeneration += 1;
    clearComposerTokens();
    restoreTabIdentity();
    setRefreshTimer();
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = byId('composer-input');
    const value = input.value.trim();
    if (!value || !state.selectedAgent) return;
    const clientMessageId = requestId();
    const tokens = composerTokensJson();
    text(byId('composer-status'), 'Sending...');
    try {
      const payload = {
        agentId: state.selectedAgent,
        sessionId: state.sessionId,
        workspaceId: currentWorkspaceId(),
        text: value,
        clientMessageId,
        queuePolicy: 'queue',
        composerTokensJson: tokens
      };
      let result;
      try {
        result = await send('message.send', payload, clientMessageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const legacy = /unknown request|unsupported|not implemented|method not found|unknown type|not available/i.test(message);
        if (!legacy) throw error;
        result = await send('agent.send', payload, clientMessageId);
      }
      const normalized = webCompatibility && typeof webCompatibility.normalizeResponse === 'function'
        ? webCompatibility.normalizeResponse('message.send', result)
        : { accepted: true, queued: false, queueItem: null };
      input.value = '';
      clearComposerTokens();
      const queueStatus = normalized.queueItem && field(normalized.queueItem, 'status', 'queued');
      text(byId('composer-status'), normalized.queued || queueStatus === 'queued' || queueStatus === 'sending' ? 'Queued' : 'Sent');
      await refreshSession();
      broadcastTabEvent('session.changed', { sessionId: state.sessionId });
    } catch (error) { text(byId('composer-status'), error instanceof Error ? error.message : String(error)); }
  }

  function setRefreshTimer() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = window.setInterval(() => {
      // Hidden/background tabs must not hammer the Bridge with full refresh storms;
      // a visible tab refreshes on its next tick and the hidden tab is skipped entirely.
      if (document.hidden) return;
      if (state.socket && state.socket.readyState === WebSocket.OPEN) refreshAll().catch(() => {});
    }, state.refreshInterval);
  }

  async function logout() {
    broadcastTabEvent('logout', {});
    clearGithubAuthTimer();
    await shutdownTransport('web logout', true);
    try { await http('/web/auth/logout', { method: 'POST', headers: { Origin: window.location.origin } }); } catch (_error) {}
    state.ticket = '';
    state.token = '';
    showWorkspace(false);
    setConnection('Signed out', '');
  }

  function restoreTransportAfterPageShow(event) {
    if (!event || event.persisted !== true || !state.pageClosing) return;
    // A bfcache restore keeps the JS heap but pagehide has already torn down all transport state.
    // Reuse only the tab endpoint and the in-memory session; credentials remain in the existing
    // short-lived cookie or tab memory and are never copied into the URL or a new storage key.
    const savedEndpoint = sessionStorage.getItem('ngf_web_endpoint') || '';
    const hasSession = state.token.length > 0 || state.ticket.length > 0;
    if (!savedEndpoint || !hasSession) {
      showWorkspace(false);
      setConnection('Connect required', '');
      return;
    }
    state.endpoint = savedEndpoint.replace(/\/$/, '');
    prepareTransportForLogin();
    showWorkspace(true);
    setConnection('Reconnecting', '');
    connect().catch((error) => {
      showWorkspace(false);
      setConnection('Connect required', '');
      text(byId('auth-error'), error instanceof Error ? error.message : String(error));
    });
  }

  window.addEventListener('pagehide', () => {
    state.pageClosing = true;
    void shutdownTransport('web page closed', true);
  });
  window.addEventListener('pageshow', restoreTransportAfterPageShow);

  function init() {
    restoreTabIdentity();
    const savedEndpoint = sessionStorage.getItem('ngf_web_endpoint') || '';
    const savedInterval = Number.parseInt(sessionStorage.getItem('ngf_web_refresh_interval') || '15', 10);
    if (Number.isFinite(savedInterval) && savedInterval >= 5 && savedInterval <= 300) state.refreshInterval = savedInterval * 1000;
    byId('endpoint-input').value = savedEndpoint;
    byId('refresh-interval').value = String(Math.floor(state.refreshInterval / 1000));
    byId('auth-form').addEventListener('submit', (event) => { event.preventDefault(); prepareTransportForLogin(); state.endpoint = byId('endpoint-input').value.trim().replace(/\/$/, ''); state.token = byId('token-input').value; byId('token-input').value = ''; sessionStorage.setItem('ngf_web_endpoint', state.endpoint); showWorkspace(true); connect().catch((error) => { showWorkspace(false); showError(error); }); });
    byId('composer-form').addEventListener('submit', sendMessage);
    const composerInput = byId('composer-input');
    if (composerInput) {
      composerInput.addEventListener('input', () => {
        state.composer.mentionSelectedIndex = 0;
        updateComposerMentionMenu();
      });
      composerInput.addEventListener('keydown', (event) => {
        const candidates = state.composer.mentionCandidates;
        if (event.key === 'ArrowDown' && candidates.length > 0) {
          event.preventDefault();
          state.composer.mentionSelectedIndex = (state.composer.mentionSelectedIndex + 1) % candidates.length;
          renderComposerMentionMenu();
          return;
        }
        if (event.key === 'ArrowUp' && candidates.length > 0) {
          event.preventDefault();
          state.composer.mentionSelectedIndex = (state.composer.mentionSelectedIndex - 1 + candidates.length) % candidates.length;
          renderComposerMentionMenu();
          return;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && candidates.length > 0) {
          event.preventDefault();
          selectComposerMention(state.composer.mentionSelectedIndex);
          return;
        }
        if (event.key === 'Escape' && candidates.length > 0) {
          event.preventDefault();
          hideComposerMentionMenu();
        }
      });
      composerInput.addEventListener('blur', () => {
        window.setTimeout(() => {
          if (document.activeElement !== composerInput) hideComposerMentionMenu();
        }, 120);
      });
    }
    renderComposerTokens();
    byId('refresh-button').addEventListener('click', () => refreshAll().catch(showError));
    byId('notifications-button').addEventListener('click', () => loadNotifications().catch(showError));
    byId('diff-button').addEventListener('click', () => refreshGit().catch(showError));
     byId('diff-more-button').addEventListener('click', () => loadDiffPage(true).catch(showError));
     byId('git-mode-summary-button').addEventListener('click', () => selectGitMode('summary'));
     byId('git-mode-files-button').addEventListener('click', () => selectGitMode('files'));
     byId('git-mode-unified-button').addEventListener('click', () => selectGitMode('unified'));
     byId('files-refresh-button').addEventListener('click', () => loadFiles(state.fileParentPath).catch(showError));
     byId('git-stage-all-button').addEventListener('click', () => mutateGit('workspace.git.stage', { paths: state.changes.map((item) => field(item, 'path', '')).filter((item) => item.length > 0) }).catch(showError));
     byId('git-commit-button').addEventListener('click', () => commitGit().catch(showError));
     byId('git-pull-button').addEventListener('click', () => pullGit().catch(showError));
     byId('git-push-button').addEventListener('click', () => pushGit().catch(showError));
     byId('git-branch-button').addEventListener('click', () => branchGit().catch(showError));
    byId('git-stash-button').addEventListener('click', () => stashGit().catch(showError));
    byId('git-merge-button').addEventListener('click', () => mergeGit().catch(showError));
    byId('diagnostics-button').addEventListener('click', () => refreshDiagnostics().catch(showError));
    byId('doctor-refresh-button').addEventListener('click', () => refreshDiagnostics().catch(showError));
    byId('experience-refresh-button').addEventListener('click', () => refreshExperience().catch(showError));
    byId('provider-usage-refresh-button').addEventListener('click', () => refreshProviderUsage().catch(showError));
    byId('usage-budget-save-button').addEventListener('click', () => saveUsageBudget().catch(showError));
    byId('usage-budget-clear-button').addEventListener('click', () => clearUsageBudget().catch(showError));
    byId('usage-view-window').addEventListener('change', () => {
      state.experience.usageWindow = normalizeUsageWindow(byId('usage-view-window').value);
      state.experience.usageWindowNotice = '';
      refreshExperience().catch(showError);
    });
    byId('metadata-kind').addEventListener('change', () => { state.metadata.kind = byId('metadata-kind').value; renderMetadata(); });
    byId('metadata-generate-button').addEventListener('click', () => generateMetadataPreview().catch(showError));
    byId('metadata-regenerate-button').addEventListener('click', () => generateMetadataPreview().catch(showError));
    byId('metadata-copy-button').addEventListener('click', () => copyMetadataSuggestion().catch(showError));
    byId('metadata-apply-button').addEventListener('click', () => applyMetadataSuggestion().catch(showError));
    byId('metadata-cancel-button').addEventListener('click', cancelMetadataPreview);
    byId('settings-button').addEventListener('click', () => byId('settings-dialog').showModal());
    byId('diagnostics-export-button').addEventListener('click', () => exportDiagnostics('json').catch(showError));
    byId('diagnostics-text-export-button').addEventListener('click', () => exportDiagnostics('text').catch(showError));
    byId('logout-button').addEventListener('click', () => logout().catch(showError));
    byId('new-agent-button').addEventListener('click', () => openNewAgentDialog());
byId('new-agent-create-button').addEventListener('click', () => createAgent().catch(showError));
byId('new-workspace-button').addEventListener('click', () => createWorkspace().catch(showError));
    byId('import-workspace-button').addEventListener('click', () => importWorkspace().catch(showError));
     byId('terminal-button').addEventListener('click', () => refreshTerminals().catch(showError));
     byId('terminal-focus-button').addEventListener('click', () => { byId('terminal-section').scrollIntoView({ block: 'nearest' }); refreshTerminals().catch(showError); });
     byId('terminal-create-button').addEventListener('click', () => createTerminal().catch(showError));
     byId('terminal-restore-button').addEventListener('click', requestTerminalSnapshot);
     byId('terminal-resize-button').addEventListener('click', resizeTerminal);
     byId('terminal-input-form').addEventListener('submit', sendTerminalInput);
    byId('services-button').addEventListener('click', () => refreshServices().catch(showError));
    byId('browser-button').addEventListener('click', () => refreshBrowser().catch(showError));
    const browserScreenshotFullPageInput = byId('browser-screenshot-full-page');
    if (browserScreenshotFullPageInput) {
      browserScreenshotFullPageInput.addEventListener('change', () => {
        state.browser.screenshotFullPage = browserScreenshotFullPageInput.checked === true;
      });
    }
    byId('browser-instance-button').addEventListener('click', () => createBrowserInstance().catch(showError));
    byId('browser-download-button').addEventListener('click', () => {
      const page = state.browser.pages.find((item) => field(item, 'pageId', '') === state.browser.selectedPageId) || state.browser.pages[0];
      if (page) listBrowserDownloads(page).catch(showError);
    });
    byId('browser-domain-button').addEventListener('click', () => updateBrowserPermission().catch(showError));
    byId('browser-page-button').addEventListener('click', () => createBrowserPage().catch(showError));
    byId('github-refresh-button').addEventListener('click', () => refreshGithub().catch(setGithubError));
    byId('github-auth-button').addEventListener('click', () => startGithubAuth().catch(setGithubError));
    byId('github-auth-poll-button').addEventListener('click', () => pollGithubAuth(false).catch(setGithubError));
    byId('github-logout-button').addEventListener('click', async () => { if (!window.confirm('Sign out of GitHub on this Bridge?')) return; try { await send('github.auth.logout', { accountId: githubAccountId() }); state.github = Object.assign(state.github, { authenticated: false, account: null, accounts: [], binding: null, owner: '', repo: '', pullRequests: [], selected: null, selectedNumber: 0, watchId: '', watching: false }); await refreshGithub(); } catch (error) { setGithubError(error); } });
    byId('github-account-select').addEventListener('change', () => selectGithubAccount().catch(setGithubError));
    byId('github-binding-button').addEventListener('click', () => saveGithubBinding().catch(setGithubError));
    byId('github-pr-state').addEventListener('change', () => { state.github.prState = byId('github-pr-state').value; state.github.page = 1; refreshGithubPullRequests().catch(setGithubError); });
    byId('github-pr-prev-button').addEventListener('click', () => { if (state.github.page <= 1) return; state.github.page -= 1; refreshGithubPullRequests().catch(setGithubError); });
    byId('github-pr-next-button').addEventListener('click', () => { if (!state.github.hasNext) return; state.github.page += 1; refreshGithubPullRequests().catch(setGithubError); });
    byId('github-pr-create-button').addEventListener('click', () => createGithubPullRequest().catch(setGithubError));
    byId('github-pr-update-button').addEventListener('click', () => updateGithubPullRequest().catch(setGithubError));
    byId('github-pr-ready-button').addEventListener('click', () => markGithubReady().catch(setGithubError));
    byId('github-pr-reviewers-button').addEventListener('click', () => updateGithubCollection('reviewers').catch(setGithubError));
    byId('github-pr-labels-button').addEventListener('click', () => updateGithubCollection('labels').catch(setGithubError));
    byId('github-pr-merge-button').addEventListener('click', () => mergeGithubPullRequest().catch(setGithubError));
    byId('github-pr-watch-button').addEventListener('click', () => startGithubWatch().catch(setGithubError));
    byId('github-attachment-preview-button').addEventListener('click', () => previewGithubAttachment().catch(setGithubError));
    byId('github-attachment-upload-button').addEventListener('click', () => uploadGithubAttachment().catch(setGithubError));
    byId('refresh-interval').addEventListener('change', () => { const value = Number.parseInt(byId('refresh-interval').value, 10); if (!Number.isFinite(value) || value < 5 || value > 300) return; state.refreshInterval = value * 1000; sessionStorage.setItem('ngf_web_refresh_interval', String(value)); setRefreshTimer(); });
    setRefreshTimer();
    const endpointFromTab = savedEndpoint;
    if (endpointFromTab) {
      state.endpoint = endpointFromTab;
      showWorkspace(true);
      connect().catch((error) => { showWorkspace(false); setConnection('Connect required', ''); text(byId('auth-error'), error.message); });
    }
  }

  init();
})();
