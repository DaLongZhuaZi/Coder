'use strict';

const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GitHubCredentialStore } = require('./github-credential-store');

const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_ATTACHMENT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'application/json', 'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/zip', 'application/gzip']);
const TERMINAL_DEVICE_AUTH_ERRORS = new Set(['access_denied', 'expired_token', 'invalid_grant', 'unauthorized_client', 'device_code_expired']);

function attachmentMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mapping = { '.txt': 'text/plain', '.log': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.zip': 'application/zip', '.gz': 'application/gzip', '.tgz': 'application/gzip' };
  return mapping[extension] || 'application/octet-stream';
}

function readString(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readStringArray(source, key) {
  if (!source || typeof source !== 'object' || !Array.isArray(source[key])) {
    return [];
  }
  return source[key].filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function emptyChecksSummary() {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    conclusion: 'unknown',
    failures: []
  };
}

function baseResult(action, context, extra) {
  return Object.assign({
    ok: false,
    action,
    repository: context.repository,
    owner: context.owner,
    repo: context.repo,
    apiBaseUrl: context.apiBaseUrl,
    number: 0,
    url: '',
    state: '',
    title: '',
    head: '',
    base: '',
    sha: '',
    checksSummary: emptyChecksSummary(),
    issues: [],
    attachments: [],
    failureCategory: '',
    message: '',
    remediation: '',
    rateLimitResetAt: ''
  }, extra || {});
}

function errorResult(action, context, failureCategory, message, remediation, extra) {
  return Object.assign(baseResult(action, context, extra), {
    ok: false,
    failureCategory,
    message,
    remediation
  });
}

function successResult(action, context, extra) {
  return Object.assign(baseResult(action, context, extra), {
    ok: true,
    failureCategory: '',
    message: readString(extra || {}, 'message', ''),
    remediation: ''
  });
}

function normalizeApiBaseUrl(value) {
  const input = typeof value === 'string' && value.trim().length > 0 ? value.trim() : DEFAULT_API_BASE_URL;
  return input.endsWith('/') ? input.substring(0, input.length - 1) : input;
}

function parseRepository(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/([^/\s]+)\/([^/\s]+)$/);
  if (!match) {
    return { owner: '', repo: '' };
  }
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, '')
  };
}

function parseRemoteUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) {
    return { owner: '', repo: '' };
  }
  const sshMatch = text.match(/^git@[^:]+:([^/]+)\/(.+?)(\.git)?$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2].replace(/\.git$/, '')
    };
  }
  const httpsMatch = text.match(/^https?:\/\/[^/]+\/([^/]+)\/(.+?)(\.git)?$/);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2].replace(/\.git$/, '')
    };
  }
  return parseRepository(text);
}

function gitRemoteUrl(cwd, remoteName) {
  return new Promise((resolve) => {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      resolve('');
      return;
    }
    const remote = typeof remoteName === 'string' && remoteName.length > 0 ? remoteName : 'origin';
    execFile('git', ['-C', cwd, 'remote', 'get-url', remote], {
      cwd,
      windowsHide: true,
      timeout: 10000
    }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve(typeof stdout === 'string' ? stdout.trim() : '');
    });
  });
}

function tokenFromProfiles(store) {
  if (!store || typeof store.readProviderProfiles !== 'function') {
    return '';
  }
  const profiles = store.readProviderProfiles();
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') {
      continue;
    }
    const env = profile.env && typeof profile.env === 'object' && !Array.isArray(profile.env) ? profile.env : {};
    const token = readString(env, 'GITHUB_TOKEN', '');
    if (token.length > 0) {
      return token;
    }
  }
  return '';
}

function resolveToken(payload, store) {
  const tokenEnv = readString(payload, 'tokenEnv', readString(payload, 'githubTokenEnv', 'GITHUB_TOKEN'));
  if (tokenEnv.length > 0 && typeof process.env[tokenEnv] === 'string' && process.env[tokenEnv].length > 0) {
    return process.env[tokenEnv];
  }
  const directToken = readString(payload, 'token', '');
  if (directToken.length > 0) {
    return directToken;
  }
  return tokenFromProfiles(store);
}

function classifyStatus(statusCode, bodyText) {
  const text = typeof bodyText === 'string' ? bodyText.toLowerCase() : '';
  if (statusCode === 401) {
    return 'auth_missing';
  }
  if (statusCode === 403) {
    if (text.indexOf('rate limit') >= 0) {
      return 'rate_limited';
    }
    return 'permission_denied';
  }
  if (statusCode === 404) {
    return 'not_found';
  }
  if (statusCode === 405 || statusCode === 409) {
    return 'merge_blocked';
  }
  if (statusCode === 422) {
    return 'validation_failed';
  }
  if (statusCode >= 500) {
    return 'api_unavailable';
  }
  return 'api_unavailable';
}

function remediationForFailure(category) {
  if (category === 'auth_missing') {
    return 'Set GITHUB_TOKEN or pass --token-env with a configured environment variable.';
  }
  if (category === 'repo_missing') {
    return 'Pass owner/repo explicitly or run the command inside a workspace with a GitHub remote.';
  }
  if (category === 'permission_denied') {
    return 'Check token scopes and repository permissions.';
  }
  if (category === 'rate_limited') {
    return 'Wait for the rate limit reset or use a token with higher quota.';
  }
  if (category === 'validation_failed') {
    return 'Check request fields such as head, base, title, labels, or issue number.';
  }
  if (category === 'merge_blocked') {
    return 'Resolve branch protection, failing checks, conflicts, or review requirements before merging.';
  }
  if (category === 'not_found') {
    return 'Check repository, PR number, issue number, or token visibility.';
  }
  if (category === 'network_error') {
    return 'Check network connectivity and apiBaseUrl.';
  }
  return 'Inspect GitHub API response and retry when the service is available.';
}

function parseJsonBody(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function apiMessage(body, fallbackValue) {
  if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.length > 0) {
    return body.message;
  }
  return fallbackValue;
}

function requestJson(context, method, route, body, requestHeaders) {
  return new Promise((resolve) => {
    const base = new URL(context.apiBaseUrl);
    const target = new URL(route, context.apiBaseUrl + '/');
    const requestBody = body ? JSON.stringify(body) : '';
    const transport = target.protocol === 'http:' ? http : https;
    const options = {
      method,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'ngf-agent-bridge',
        'x-github-api-version': '2022-11-28'
      },
      timeout: DEFAULT_TIMEOUT_MS
    };
    if (context.token.length > 0) {
      options.headers.authorization = 'Bearer ' + context.token;
    }
    const extraHeaders = requestHeaders && typeof requestHeaders === 'object' ? requestHeaders : {};
    for (const key of Object.keys(extraHeaders)) {
      if (typeof extraHeaders[key] === 'string' && extraHeaders[key].length > 0) options.headers[key] = extraHeaders[key];
    }
    if (requestBody.length > 0) {
      options.headers['content-type'] = 'application/json';
      options.headers['content-length'] = Buffer.byteLength(requestBody);
    }
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = parseJsonBody(text);
        const statusCode = typeof res.statusCode === 'number' ? res.statusCode : 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          statusCode,
          headers: res.headers || {},
          body: parsed,
          text
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('GitHub API request timed out.'));
    });
    req.on('error', (error) => {
      resolve({
        ok: false,
        statusCode: 0,
        headers: {},
        body: {},
        text: error instanceof Error ? error.message : String(error),
        networkError: true
      });
    });
    if (requestBody.length > 0) {
      req.write(requestBody);
    }
    req.end();
  });
}

function apiFailure(action, context, response) {
  const category = response.networkError === true ? 'network_error' : classifyStatus(response.statusCode, response.text);
  const resetHeader = response.headers && typeof response.headers['x-ratelimit-reset'] === 'string'
    ? response.headers['x-ratelimit-reset']
    : '';
  const resetAt = resetHeader.length > 0 ? new Date(Number.parseInt(resetHeader, 10) * 1000).toISOString() : '';
  return errorResult(action, context, category, apiMessage(response.body, response.text || 'GitHub API request failed.'), remediationForFailure(category), {
    statusCode: response.statusCode,
    rateLimitResetAt: resetAt,
    rateLimit: {
      remaining: Number.parseInt(readString(response.headers, 'x-ratelimit-remaining', '-1'), 10),
      limit: Number.parseInt(readString(response.headers, 'x-ratelimit-limit', '-1'), 10),
      resetAt
    }
  });
}

function prResult(action, context, pr, extra) {
  const head = pr && pr.head && typeof pr.head === 'object' ? pr.head : {};
  const base = pr && pr.base && typeof pr.base === 'object' ? pr.base : {};
  return successResult(action, context, Object.assign({
    number: readNumber(pr, 'number', 0),
    url: readString(pr, 'html_url', readString(pr, 'url', '')),
    state: readString(pr, 'state', ''),
    title: readString(pr, 'title', ''),
    head: readString(head, 'ref', ''),
    base: readString(base, 'ref', ''),
    sha: readString(head, 'sha', ''),
    draft: pr && pr.draft === true,
    mergeable: pr && pr.mergeable === true,
    mergeState: readString(pr, 'mergeable_state', ''),
    reviewDecision: readString(pr, 'review_decision', ''),
    updatedAt: readString(pr, 'updated_at', ''),
    reviewers: Array.isArray(pr && pr.requested_reviewers) ? pr.requested_reviewers.map((item) => readString(item, 'login', '')).filter(Boolean) : [],
    labels: Array.isArray(pr && pr.labels) ? pr.labels.map((item) => readString(item, 'name', '')).filter(Boolean) : []
  }, extra || {}));
}

function issueItem(issue) {
  return {
    number: readNumber(issue, 'number', 0),
    title: readString(issue, 'title', ''),
    state: readString(issue, 'state', ''),
    url: readString(issue, 'html_url', readString(issue, 'url', '')),
    updatedAt: readString(issue, 'updated_at', '')
  };
}

function extractLinks(text, source) {
  const links = [];
  const input = typeof text === 'string' ? text : '';
  const pattern = /https?:\/\/[^\s)>\]]+/g;
  let match = pattern.exec(input);
  while (match) {
    links.push({
      url: match[0],
      source
    });
    match = pattern.exec(input);
  }
  return links;
}

function summarizeChecks(checkRuns, statuses) {
  const summary = emptyChecksSummary();
  const failures = [];
  for (const run of checkRuns) {
    summary.total += 1;
    const conclusion = readString(run, 'conclusion', '');
    const status = readString(run, 'status', '');
    if (conclusion === 'success') {
      summary.passed += 1;
    } else if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
      summary.failed += 1;
      failures.push(readString(run, 'name', 'check'));
    } else if (conclusion === 'cancelled' || conclusion === 'skipped') {
      summary.cancelled += 1;
    } else if (status.length > 0) {
      summary.pending += 1;
    }
  }
  for (const status of statuses) {
    summary.total += 1;
    const state = readString(status, 'state', '');
    if (state === 'success') {
      summary.passed += 1;
    } else if (state === 'failure' || state === 'error') {
      summary.failed += 1;
      failures.push(readString(status, 'context', 'status'));
    } else {
      summary.pending += 1;
    }
  }
  if (summary.failed > 0) {
    summary.conclusion = 'failed';
  } else if (summary.pending > 0) {
    summary.conclusion = 'pending';
  } else if (summary.cancelled > 0 && summary.passed === 0) {
    summary.conclusion = 'cancelled';
  } else if (summary.total > 0) {
    summary.conclusion = 'passed';
  }
  summary.failures = failures.slice(0, 12);
  return summary;
}

class GitHubClient {
  constructor(options) {
    const opts = options && typeof options === 'object' ? options : {};
    this.store = opts.store || null;
    this.credentialStore = opts.credentialStore || new GitHubCredentialStore({ home: this.store && this.store.baseDirectory ? this.store.baseDirectory : '' });
    this.deviceSessions = new Map();
    this.plans = new Map();
    this.watchers = new Map();
  }

  state() {
    return this.store && typeof this.store.readGitHubState === 'function'
      ? this.store.readGitHubState()
      : { version: 1, accounts: [], bindings: [] };
  }

  saveState(state) {
    if (this.store && typeof this.store.writeGitHubState === 'function') this.store.writeGitHubState(state);
  }

  createPlan(action, context, payload) {
    const planId = crypto.randomBytes(18).toString('base64url');
    const plan = Object.assign({}, payload, {
      action,
      repository: context.repository,
      accountId: readString(payload, 'accountId', ''),
      hostProfileId: readString(payload, 'hostProfileId', ''),
      expiresAt: Date.now() + 300000,
      consumed: false
    });
    this.plans.set(planId, plan);
    return planId;
  }

  consumePlan(planId, action, context, number, hostProfileId) {
    const plan = this.plans.get(planId);
    const requestedHostProfileId = readString({ hostProfileId }, 'hostProfileId', '');
    if (!plan || plan.consumed || plan.action !== action || plan.repository !== context.repository || plan.number !== number ||
      (readString(plan, 'hostProfileId', '').length > 0 && readString(plan, 'hostProfileId', '') !== requestedHostProfileId) ||
      Date.now() > plan.expiresAt) return null;
    plan.consumed = true;
    this.plans.delete(planId);
    return plan;
  }

  async deviceStart(payload) {
    const clientId = readString(payload, 'clientId', process.env.AGENT_BRIDGE_GITHUB_CLIENT_ID || '');
    if (!clientId) return errorResult('github.auth.device.start', { owner: '', repo: '', repository: '', apiBaseUrl: DEFAULT_API_BASE_URL }, 'configuration_missing', 'GitHub OAuth client id is not configured.', 'Set AGENT_BRIDGE_GITHUB_CLIENT_ID.');
    const context = { owner: '', repo: '', repository: '', apiBaseUrl: normalizeApiBaseUrl(readString(payload, 'oauthBaseUrl', 'https://github.com')), token: '' };
    const response = await requestJson(context, 'POST', 'login/device/code', { client_id: clientId, scope: readString(payload, 'scope', 'repo read:user') });
    if (!response.ok) return apiFailure('github.auth.device.start', context, response);
    const sessionId = crypto.randomBytes(18).toString('base64url');
    const session = {
      sessionId,
      clientId,
      deviceCode: readString(response.body, 'device_code', ''),
      userCode: readString(response.body, 'user_code', ''),
      verificationUri: readString(response.body, 'verification_uri', readString(response.body, 'verification_uri_complete', '')),
      interval: Math.max(5, readNumber(response.body, 'interval', 5)),
      expiresAt: Date.now() + readNumber(response.body, 'expires_in', 900) * 1000,
      nextPollAt: Date.now(),
      polling: false,
      hostProfileId: readString(payload, 'hostProfileId', ''),
      oauthBaseUrl: context.apiBaseUrl,
      apiBaseUrl: normalizeApiBaseUrl(readString(payload, 'apiBaseUrl', DEFAULT_API_BASE_URL))
    };
    this.deviceSessions.set(sessionId, session);
    return successResult('github.auth.device.start', context, { sessionId, userCode: session.userCode, verificationUri: session.verificationUri, interval: session.interval, expiresAt: new Date(session.expiresAt).toISOString() });
  }

  async devicePoll(payload) {
    const sessionId = readString(payload, 'authSessionId', readString(payload, 'sessionId', ''));
    const session = this.deviceSessions.get(sessionId);
    const context = { owner: '', repo: '', repository: '', apiBaseUrl: session ? session.oauthBaseUrl : 'https://github.com', token: '' };
    if (!session || Date.now() >= session.expiresAt) {
      if (session) this.deviceSessions.delete(sessionId);
      return errorResult('github.auth.device.poll', context, 'authorization_expired', 'GitHub device authorization expired.', 'Start device authorization again.', { sessionId });
    }
    const requestedHostProfileId = readString(payload, 'hostProfileId', '');
    const sessionHostProfileId = readString(session, 'hostProfileId', '');
    if (sessionHostProfileId.length > 0 && sessionHostProfileId !== requestedHostProfileId) return errorResult('github.auth.device.poll', context, 'host_scope_mismatch', 'GitHub device authorization belongs to another host profile.', 'Continue polling from the host profile that started authorization.', { sessionId });
    if (session.polling) return errorResult('github.auth.device.poll', context, 'poll_in_progress', 'A device authorization poll is already running.', 'Wait for the active poll to finish.', { sessionId, interval: session.interval });
    if (Date.now() < session.nextPollAt) return errorResult('github.auth.device.poll', context, 'poll_too_early', 'Device authorization was polled before the allowed interval.', 'Wait until the returned nextPollAt.', { sessionId, interval: session.interval, nextPollAt: new Date(session.nextPollAt).toISOString() });
    session.polling = true;
    const response = await requestJson(context, 'POST', 'login/oauth/access_token', { client_id: session.clientId, device_code: session.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    session.polling = false;
    session.nextPollAt = Date.now() + session.interval * 1000;
    const oauthError = readString(response.body, 'error', '');
    if (oauthError) {
      if (oauthError === 'slow_down') { session.interval += 5; session.nextPollAt = Date.now() + session.interval * 1000; }
      if (TERMINAL_DEVICE_AUTH_ERRORS.has(oauthError)) this.deviceSessions.delete(sessionId);
      return errorResult('github.auth.device.poll', context, oauthError, readString(response.body, 'error_description', oauthError), oauthError === 'authorization_pending' || oauthError === 'slow_down' ? 'Continue polling at the returned interval.' : 'Start device authorization again.', { sessionId, interval: session.interval, nextPollAt: new Date(session.nextPollAt).toISOString() });
    }
    const token = readString(response.body, 'access_token', '');
    if (!token) {
      this.deviceSessions.delete(sessionId);
      return errorResult('github.auth.device.poll', context, 'auth_missing', 'GitHub did not return an access token.', remediationForFailure('auth_missing'));
    }
    const accountResponse = await requestJson({ owner: '', repo: '', repository: '', apiBaseUrl: session.apiBaseUrl, token }, 'GET', 'user');
    if (!accountResponse.ok) {
      this.deviceSessions.delete(sessionId);
      return apiFailure('github.auth.device.poll', context, accountResponse);
    }
    const accountId = String(readNumber(accountResponse.body, 'id', 0));
    if (!(await this.credentialStore.available()) || !(await this.credentialStore.write(accountId, token))) {
      this.deviceSessions.delete(sessionId);
      return errorResult('github.auth.device.poll', context, 'secure_storage_unavailable', 'OAuth completed but secure credential storage is unavailable.', 'Configure an environment token or enable the operating system credential service.');
    }
    const state = this.state();
    const account = { id: accountId, login: readString(accountResponse.body, 'login', ''), avatarUrl: readString(accountResponse.body, 'avatar_url', ''), scope: readString(response.body, 'scope', ''), source: 'oauth_device', updatedAt: new Date().toISOString() };
    state.accounts = (Array.isArray(state.accounts) ? state.accounts : []).filter((item) => item && item.id !== accountId).concat([account]);
    this.saveState(state);
    this.deviceSessions.delete(sessionId);
    return successResult('github.auth.device.poll', context, { account });
  }

  async authStatus(payload) {
    const state = this.state();
    const accountId = readString(payload, 'accountId', '');
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    const selected = accountId ? accounts.find((item) => item && item.id === accountId) : accounts[0];
    if (!selected) return successResult('github.auth.status', { owner: '', repo: '', repository: '', apiBaseUrl: DEFAULT_API_BASE_URL }, { authenticated: resolveToken(payload, this.store).length > 0, source: resolveToken(payload, this.store).length > 0 ? 'environment' : 'none', accounts: [] });
    const token = await this.credentialStore.read(selected.id);
    return successResult('github.auth.status', { owner: '', repo: '', repository: '', apiBaseUrl: DEFAULT_API_BASE_URL }, { authenticated: token.length > 0, source: selected.source, account: selected, accounts });
  }

  async logout(payload) {
    const accountId = readString(payload, 'accountId', '');
    const state = this.state();
    await this.credentialStore.remove(accountId);
    state.accounts = (Array.isArray(state.accounts) ? state.accounts : []).filter((item) => item && item.id !== accountId);
    state.bindings = (Array.isArray(state.bindings) ? state.bindings : []).filter((item) => item && item.accountId !== accountId);
    for (const [watchId, watcher] of this.watchers.entries()) {
      if (watcher && watcher.accountId === accountId) this.stopWatcher(watchId);
    }
    this.saveState(state);
    return successResult('github.auth.logout', { owner: '', repo: '', repository: '', apiBaseUrl: DEFAULT_API_BASE_URL }, { accountId });
  }

  async accountList() {
    const state = this.state();
    return successResult('github.account.list', { owner: '', repo: '', repository: '', apiBaseUrl: DEFAULT_API_BASE_URL }, { accounts: Array.isArray(state.accounts) ? state.accounts : [] });
  }

  async bindingSet(payload) {
    const hostProfileId = readString(payload, 'hostProfileId', '');
    const workspaceId = readString(payload, 'workspaceId', '');
    const accountId = readString(payload, 'accountId', '');
    const owner = readString(payload, 'owner', '');
    const repo = readString(payload, 'repo', '');
    const context = { owner, repo, repository: owner && repo ? owner + '/' + repo : '', apiBaseUrl: DEFAULT_API_BASE_URL };
    if (!hostProfileId || !workspaceId || !accountId || !owner || !repo || !readBoolean(payload, 'confirm', false)) return errorResult('github.binding.set', context, 'confirm_required', 'A complete repository binding requires confirm=true.', 'Review the account and repository, then confirm.');
    const state = this.state();
    const id = crypto.createHash('sha256').update(hostProfileId + '\n' + workspaceId).digest('hex').slice(0, 24);
    const binding = { id, hostProfileId, workspaceId, accountId, owner, repo, updatedAt: new Date().toISOString() };
    state.bindings = (Array.isArray(state.bindings) ? state.bindings : []).filter((item) => item && item.id !== id).concat([binding]);
    this.saveState(state);
    return successResult('github.binding.set', context, { binding });
  }

  async bindingGet(payload) {
    const state = this.state();
    const hostProfileId = readString(payload, 'hostProfileId', '');
    const workspaceId = readString(payload, 'workspaceId', '');
    const binding = (Array.isArray(state.bindings) ? state.bindings : []).find((item) => item && item.hostProfileId === hostProfileId && item.workspaceId === workspaceId) || null;
    return successResult('github.binding.get', { owner: binding ? binding.owner : '', repo: binding ? binding.repo : '', repository: binding ? binding.owner + '/' + binding.repo : '', apiBaseUrl: DEFAULT_API_BASE_URL }, { binding });
  }

  async pullRequestList(payload) {
    const resolved = await this.requireContext('github.pr.list', payload, true);
    if (resolved.error) return resolved.error;
    const page = Math.max(1, readNumber(payload, 'page', 1));
    const perPage = Math.min(100, Math.max(1, readNumber(payload, 'perPage', 30)));
    const query = new URLSearchParams({ state: readString(payload, 'state', 'open'), page: String(page), per_page: String(perPage) });
    for (const key of ['head', 'base']) { const value = readString(payload, key, ''); if (value) query.set(key, value); }
    const response = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls?' + query.toString());
    if (!response.ok) return apiFailure('github.pr.list', resolved.context, response);
    const items = Array.isArray(response.body) ? response.body.map((item) => prResult('github.pr.list', resolved.context, item)) : [];
    return successResult('github.pr.list', resolved.context, { pullRequests: items, pagination: { page, perPage, hasNext: items.length === perPage } });
  }

  async updatePullRequest(payload) {
    const resolved = await this.requireContext('github.pr.update', payload, !readBoolean(payload, 'preview', true));
    if (resolved.error) return resolved.error;
    const number = readNumber(payload, 'number', 0);
    const request = {};
    for (const key of ['title', 'body', 'state', 'base']) { const value = readString(payload, key, ''); if (value) request[key] = value; }
    if (readBoolean(payload, 'ready', false)) request.ready = true;
    if (!readBoolean(payload, 'confirm', false)) {
      const status = number > 0 ? await this.pullRequestStatus(Object.assign({}, payload, { number })) : null;
      const planId = this.createPlan('github.pr.update', resolved.context, {
        number,
        request,
        headSha: status && status.ok ? status.sha : '',
        accountId: readString(payload, 'accountId', ''),
        hostProfileId: readString(payload, 'hostProfileId', '')
      });
      return successResult('github.pr.update', resolved.context, { preview: true, confirmed: false, number, planId, request });
    }
    const plan = this.consumePlan(readString(payload, 'planId', ''), 'github.pr.update', resolved.context, number, readString(payload, 'hostProfileId', ''));
    if (!plan) return errorResult('github.pr.update', resolved.context, 'plan_expired', 'Update plan is missing, consumed, or expired.', 'Preview the update again.');
    const current = await this.pullRequestStatus(Object.assign({}, payload, { number }));
    if (!current.ok || (plan.headSha && current.sha !== plan.headSha)) return errorResult('github.pr.update', resolved.context, 'plan_stale', 'Pull request state changed after preview.', 'Refresh and preview the update again.');
    let response;
    if (plan.request.ready) response = await requestJson(resolved.context, 'POST', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls/' + number + '/ready_for_review');
    else response = await requestJson(resolved.context, 'PATCH', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls/' + number, plan.request);
    if (!response.ok) return apiFailure('github.pr.update', resolved.context, response);
    return prResult('github.pr.update', resolved.context, response.body, { preview: false, confirmed: true });
  }

  async updatePullRequestCollection(payload, kind) {
    const action = kind === 'reviewers' ? 'github.pr.reviewers.update' : 'github.pr.labels.update';
    const resolved = await this.requireContext(action, payload, !readBoolean(payload, 'preview', true));
    if (resolved.error) return resolved.error;
    const number = readNumber(payload, 'number', 0);
    const values = readStringArray(payload, kind);
    if (!readBoolean(payload, 'confirm', false)) {
      const status = await this.pullRequestStatus(Object.assign({}, payload, { number }));
      const planId = this.createPlan(action, resolved.context, {
        number,
        values,
        headSha: status && status.ok ? status.sha : '',
        accountId: readString(payload, 'accountId', ''),
        hostProfileId: readString(payload, 'hostProfileId', '')
      });
      return successResult(action, resolved.context, { preview: true, planId, number, [kind]: values });
    }
    const plan = this.consumePlan(readString(payload, 'planId', ''), action, resolved.context, number, readString(payload, 'hostProfileId', ''));
    if (!plan) return errorResult(action, resolved.context, 'plan_expired', 'Plan is missing, consumed, or expired.', 'Preview the operation again.');
    const current = await this.pullRequestStatus(Object.assign({}, payload, { number }));
    if (!current.ok || (plan.headSha && current.sha !== plan.headSha)) return errorResult(action, resolved.context, 'plan_stale', 'Pull request state changed after preview.', 'Refresh and preview the operation again.');
    const route = kind === 'reviewers' ? 'pulls/' + number + '/requested_reviewers' : 'issues/' + number + '/labels';
    const response = await requestJson(resolved.context, 'POST', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/' + route, { [kind]: plan.values });
    if (!response.ok) return apiFailure(action, resolved.context, response);
    return successResult(action, resolved.context, { confirmed: true, number, [kind]: plan.values });
  }

  async context(payload) {
    const apiBaseUrl = normalizeApiBaseUrl(readString(payload, 'apiBaseUrl', DEFAULT_API_BASE_URL));
    let owner = readString(payload, 'owner', '');
    let repo = readString(payload, 'repo', '');
    if (owner.length === 0 || repo.length === 0) {
      const parsed = parseRepository(readString(payload, 'repository', ''));
      owner = owner.length > 0 ? owner : parsed.owner;
      repo = repo.length > 0 ? repo : parsed.repo;
    }
    if ((owner.length === 0 || repo.length === 0) && readString(payload, 'cwd', readString(payload, 'workspacePath', '')).length > 0) {
      const remoteUrl = await gitRemoteUrl(readString(payload, 'cwd', readString(payload, 'workspacePath', '')), readString(payload, 'remote', 'origin'));
      const parsedRemote = parseRemoteUrl(remoteUrl);
      owner = owner.length > 0 ? owner : parsedRemote.owner;
      repo = repo.length > 0 ? repo : parsedRemote.repo;
    }
    const state = this.state();
    const hostProfileId = readString(payload, 'hostProfileId', '');
    const workspaceId = readString(payload, 'workspaceId', '');
    const binding = (Array.isArray(state.bindings) ? state.bindings : []).find((item) => item && item.hostProfileId === hostProfileId && item.workspaceId === workspaceId) || null;
    if (binding) {
      owner = owner.length > 0 ? owner : binding.owner;
      repo = repo.length > 0 ? repo : binding.repo;
    }
    let token = resolveToken(payload, this.store);
    const accountId = readString(payload, 'accountId', binding ? binding.accountId : '');
    if (!token && accountId) token = await this.credentialStore.read(accountId);
    return {
      owner,
      repo,
      repository: owner.length > 0 && repo.length > 0 ? owner + '/' + repo : '',
      apiBaseUrl,
      token
    };
  }

  async requireContext(action, payload, requireToken) {
    const context = await this.context(payload);
    if (context.owner.length === 0 || context.repo.length === 0) {
      return {
        context,
        error: errorResult(action, context, 'repo_missing', 'GitHub repository owner/repo could not be resolved.', remediationForFailure('repo_missing'))
      };
    }
    if (requireToken && context.token.length === 0) {
      return {
        context,
        error: errorResult(action, context, 'auth_missing', 'GitHub token is not configured.', remediationForFailure('auth_missing'))
      };
    }
    return {
      context,
      error: null
    };
  }

  async createPullRequest(payload) {
    const resolved = await this.requireContext('github.pr.create', payload, !readBoolean(payload, 'dryRun', false));
    if (resolved.error) {
      return resolved.error;
    }
    const body = {
      head: readString(payload, 'head', ''),
      base: readString(payload, 'base', ''),
      title: readString(payload, 'title', ''),
      body: readString(payload, 'body', ''),
      draft: readBoolean(payload, 'draft', false)
    };
    if (readBoolean(payload, 'dryRun', false)) {
      return successResult('github.pr.create', resolved.context, {
        dryRun: true,
        request: body,
        message: 'Dry run only; no GitHub request was sent.'
      });
    }
    const response = await requestJson(resolved.context, 'POST', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls', body);
    if (!response.ok) {
      return apiFailure('github.pr.create', resolved.context, response);
    }
    return prResult('github.pr.create', resolved.context, response.body);
  }

  async pullRequestStatus(payload) {
    const resolved = await this.requireContext('github.pr.status', payload, true);
    if (resolved.error) {
      return resolved.error;
    }
    const number = readNumber(payload, 'number', 0);
    if (number <= 0) {
      return errorResult('github.pr.status', resolved.context, 'validation_failed', 'PR number is required.', remediationForFailure('validation_failed'));
    }
    const response = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls/' + String(number));
    if (!response.ok) {
      return apiFailure('github.pr.status', resolved.context, response);
    }
    const reviewsResponse = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls/' + String(number) + '/reviews');
    const reviews = reviewsResponse.ok && Array.isArray(reviewsResponse.body) ? reviewsResponse.body : [];
    let reviewDecision = 'review_required';
    if (reviews.some((item) => readString(item, 'state', '').toUpperCase() === 'CHANGES_REQUESTED')) reviewDecision = 'changes_requested';
    else if (reviews.some((item) => readString(item, 'state', '').toUpperCase() === 'APPROVED')) reviewDecision = 'approved';
    const sha = readString(response.body && response.body.head, 'sha', '');
    const checks = sha.length > 0 ? await this.checksList(Object.assign({}, payload, { sha })) : null;
    return prResult('github.pr.status', resolved.context, response.body, {
      mergeable: response.body.mergeable === true,
      draft: response.body.draft === true,
      reviewDecision,
      reviews: reviews.map((item) => ({ user: readString(item && item.user, 'login', ''), state: readString(item, 'state', ''), submittedAt: readString(item, 'submitted_at', '') })),
      checksSummary: checks && checks.ok ? checks.checksSummary : emptyChecksSummary(),
      conflict: response.body.mergeable === false || readString(response.body, 'mergeable_state', '') === 'dirty'
    });
  }

  async mergePullRequest(payload) {
    const resolved = await this.requireContext('github.pr.merge', payload, !readBoolean(payload, 'dryRun', false));
    if (resolved.error) {
      return resolved.error;
    }
    const number = readNumber(payload, 'number', 0);
    if (number <= 0) {
      return errorResult('github.pr.merge', resolved.context, 'validation_failed', 'PR number is required.', remediationForFailure('validation_failed'));
    }
    const mergeMethod = readString(payload, 'mergeMethod', 'merge');
    if (!['merge', 'squash', 'rebase'].includes(mergeMethod)) {
      return errorResult('github.pr.merge', resolved.context, 'validation_failed', 'mergeMethod must be merge, squash, or rebase.', remediationForFailure('validation_failed'));
    }
    const request = {
      merge_method: mergeMethod,
      commit_title: readString(payload, 'commitTitle', ''),
      commit_message: readString(payload, 'commitMessage', '')
    };
    if (readBoolean(payload, 'dryRun', false)) {
      const status = await this.pullRequestStatus(Object.assign({}, payload, { number }));
      const planId = this.createPlan('github.pr.merge', resolved.context, {
        number,
        request,
        headSha: status && status.ok ? status.sha : '',
        accountId: readString(payload, 'accountId', ''),
        hostProfileId: readString(payload, 'hostProfileId', '')
      });
      return successResult('github.pr.merge', resolved.context, {
        dryRun: true,
        preview: true,
        planId,
        number,
        request,
        message: 'Dry run only; no GitHub request was sent.'
      });
    }
    if (!readBoolean(payload, 'confirm', false)) {
      return errorResult('github.pr.merge', resolved.context, 'confirm_required', 'PR merge requires confirm=true.', 'Review branch protection and confirm the merge explicitly.', {
        number
      });
    }
    const requestedPlanId = readString(payload, 'planId', '');
    if (requestedPlanId.length > 0) {
      const plan = this.consumePlan(requestedPlanId, 'github.pr.merge', resolved.context, number, readString(payload, 'hostProfileId', ''));
      if (!plan) return errorResult('github.pr.merge', resolved.context, 'plan_expired', 'Merge plan is missing, consumed, or expired.', 'Preview the merge again.');
      const current = await this.pullRequestStatus(Object.assign({}, payload, { number }));
      if (!current.ok || (plan.headSha && current.sha !== plan.headSha)) return errorResult('github.pr.merge', resolved.context, 'plan_stale', 'Pull request state changed after preview.', 'Refresh and preview the merge again.');
    }
    const response = await requestJson(resolved.context, 'PUT', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/pulls/' + String(number) + '/merge', request);
    if (!response.ok) {
      return apiFailure('github.pr.merge', resolved.context, response);
    }
    return successResult('github.pr.merge', resolved.context, {
      number,
      state: response.body.merged === true ? 'merged' : '',
      sha: readString(response.body, 'sha', ''),
      message: apiMessage(response.body, 'Pull request merged.')
    });
  }

  async checksList(payload) {
    const resolved = await this.requireContext('github.checks.list', payload, true);
    if (resolved.error) {
      return resolved.error;
    }
    const ref = readString(payload, 'sha', readString(payload, 'ref', readString(payload, 'head', 'HEAD')));
    const checkRunsResponse = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/commits/' + encodeURIComponent(ref) + '/check-runs');
    if (!checkRunsResponse.ok) {
      return apiFailure('github.checks.list', resolved.context, checkRunsResponse);
    }
    const statusesResponse = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/commits/' + encodeURIComponent(ref) + '/status');
    const checkRuns = Array.isArray(checkRunsResponse.body.check_runs) ? checkRunsResponse.body.check_runs : [];
    const statuses = statusesResponse.ok && Array.isArray(statusesResponse.body.statuses) ? statusesResponse.body.statuses : [];
    return successResult('github.checks.list', resolved.context, {
      sha: ref,
      checksSummary: summarizeChecks(checkRuns, statuses),
      checkRuns,
      statuses
    });
  }

  async issueSearch(payload) {
    const resolved = await this.requireContext('github.issue.search', payload, true);
    if (resolved.error) {
      return resolved.error;
    }
    const parts = ['repo:' + resolved.context.owner + '/' + resolved.context.repo, 'type:issue'];
    const keyword = readString(payload, 'keyword', readString(payload, 'query', '')).trim();
    if (keyword.length > 0) {
      parts.push(keyword);
    }
    const state = readString(payload, 'state', '').trim();
    if (state.length > 0) {
      parts.push('state:' + state);
    }
    const labels = readStringArray(payload, 'labels');
    for (const label of labels) {
      parts.push('label:"' + label.replace(/"/g, '') + '"');
    }
    const query = parts.join(' ');
    const response = await requestJson(resolved.context, 'GET', 'search/issues?q=' + encodeURIComponent(query));
    if (!response.ok) {
      return apiFailure('github.issue.search', resolved.context, response);
    }
    const rawItems = Array.isArray(response.body.items) ? response.body.items : [];
    return successResult('github.issue.search', resolved.context, {
      issues: rawItems.map(issueItem),
      totalCount: readNumber(response.body, 'total_count', rawItems.length)
    });
  }

  async issueAttachmentList(payload) {
    const resolved = await this.requireContext('github.issue.attachment.list', payload, true);
    if (resolved.error) {
      return resolved.error;
    }
    const number = readNumber(payload, 'number', readNumber(payload, 'issueNumber', 0));
    if (number <= 0) {
      return errorResult('github.issue.attachment.list', resolved.context, 'validation_failed', 'Issue number is required.', remediationForFailure('validation_failed'));
    }
    const issueResponse = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/issues/' + String(number));
    if (!issueResponse.ok) {
      return apiFailure('github.issue.attachment.list', resolved.context, issueResponse);
    }
    const commentsResponse = await requestJson(resolved.context, 'GET', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/issues/' + String(number) + '/comments');
    const attachments = extractLinks(readString(issueResponse.body, 'body', ''), 'issue');
    if (commentsResponse.ok && Array.isArray(commentsResponse.body)) {
      for (const comment of commentsResponse.body) {
        attachments.push(...extractLinks(readString(comment, 'body', ''), 'comment'));
      }
    }
    return successResult('github.issue.attachment.list', resolved.context, {
      number,
      attachments
    });
  }

  async attachmentPreview(payload) {
    const resolved = await this.requireContext('github.attachment.preview', payload, true);
    if (resolved.error) return resolved.error;
    const workspacePath = path.resolve(readString(payload, 'workspacePath', readString(payload, 'cwd', '')));
    const filePath = path.resolve(readString(payload, 'filePath', ''));
    const endpoint = readString(payload, 'uploadEndpoint', process.env.AGENT_BRIDGE_GITHUB_ASSET_UPLOAD_URL || '');
    const context = resolved.context;
    if (!workspacePath || !fs.existsSync(workspacePath) || !fs.existsSync(filePath)) return errorResult('github.attachment.preview', context, 'path_not_allowed', 'Attachment must be a regular file inside the workspace.', 'Choose a workspace file without symlink escape.');
    const realWorkspace = fs.realpathSync(workspacePath);
    const realFile = fs.realpathSync(filePath);
    if (!realFile.startsWith(realWorkspace + path.sep) || !fs.statSync(realFile).isFile() || fs.lstatSync(filePath).isSymbolicLink()) return errorResult('github.attachment.preview', context, 'path_not_allowed', 'Attachment must be a regular non-symlink file inside the workspace.', 'Choose a workspace file without symlink escape.');
    if (!endpoint.startsWith('https://')) return errorResult('github.attachment.preview', context, 'capability_unavailable', 'A HTTPS asset upload endpoint is not configured.', 'Set AGENT_BRIDGE_GITHUB_ASSET_UPLOAD_URL.');
    const stat = fs.statSync(realFile);
    const maxBytes = Math.max(1, readNumber(payload, 'maxBytes', Number(process.env.AGENT_BRIDGE_GITHUB_ASSET_MAX_BYTES) || 20 * 1024 * 1024));
    if (stat.size > maxBytes) return errorResult('github.attachment.preview', context, 'size_limit', 'Attachment exceeds the configured size limit.', 'Choose a smaller file.');
    const mimeType = attachmentMimeType(realFile);
    const configuredMimeTypes = readString(payload, 'allowedMimeTypes', process.env.AGENT_BRIDGE_GITHUB_ASSET_MIME_TYPES || '').split(',').map((item) => item.trim()).filter(Boolean);
    const allowedMimeTypes = configuredMimeTypes.length > 0 ? new Set(configuredMimeTypes) : DEFAULT_ATTACHMENT_MIME_TYPES;
    if (!allowedMimeTypes.has(mimeType)) return errorResult('github.attachment.preview', context, 'mime_not_allowed', 'Attachment MIME type is not allowed.', 'Choose an allowed document, image, or archive format.', { mimeType });
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(realFile)).digest('hex');
    const planId = crypto.randomBytes(18).toString('base64url');
    const plan = { action: 'github.attachment.upload', filePath: realFile, workspacePath: realWorkspace, endpoint, size: stat.size, sha256, mimeType, number: readNumber(payload, 'number', 0), repository: context.repository, hostProfileId: readString(payload, 'hostProfileId', ''), expiresAt: Date.now() + 300000, consumed: false };
    this.plans.set(planId, plan);
    return successResult('github.attachment.preview', context, { preview: true, confirmed: false, planId, fileName: path.basename(filePath), size: stat.size, sha256, mimeType, number: plan.number });
  }

  async attachmentUpload(payload) {
    const resolved = await this.requireContext('github.attachment.upload', payload, true);
    if (resolved.error) return resolved.error;
    const planId = readString(payload, 'planId', '');
    const plan = this.plans.get(planId);
    if (!readBoolean(payload, 'confirm', false)) return errorResult('github.attachment.upload', resolved.context, 'confirm_required', 'Attachment upload requires confirm=true.', 'Review the preview and confirm.');
    if (!plan || plan.consumed || plan.action !== 'github.attachment.upload' || plan.repository !== resolved.context.repository ||
      (readString(plan, 'hostProfileId', '').length > 0 && readString(plan, 'hostProfileId', '') !== readString(payload, 'hostProfileId', '')) ||
      Date.now() > plan.expiresAt) return errorResult('github.attachment.upload', resolved.context, 'plan_expired', 'Attachment plan is missing, consumed, or expired.', 'Preview the attachment again.');
    plan.consumed = true;
    this.plans.delete(planId);
    const realPath = fs.realpathSync(plan.filePath);
    const realWorkspace = fs.realpathSync(plan.workspacePath);
    const data = fs.readFileSync(realPath);
    const digest = crypto.createHash('sha256').update(data).digest('hex');
    if (!realPath.startsWith(realWorkspace + path.sep) || digest !== plan.sha256 || data.length !== plan.size) return errorResult('github.attachment.upload', resolved.context, 'plan_stale', 'Attachment changed after preview.', 'Preview the current file again.');
    const uploadContext = { owner: '', repo: '', repository: '', apiBaseUrl: plan.endpoint, token: readString(payload, 'uploaderTokenEnv', process.env.AGENT_BRIDGE_GITHUB_ASSET_TOKEN_ENV || '') ? process.env[readString(payload, 'uploaderTokenEnv', process.env.AGENT_BRIDGE_GITHUB_ASSET_TOKEN_ENV || '')] || '' : '' };
    const uploadResponse = await requestJson(uploadContext, 'POST', '', { fileName: path.basename(realPath), sha256: digest, contentBase64: data.toString('base64') });
    if (!uploadResponse.ok) return apiFailure('github.attachment.upload', resolved.context, uploadResponse);
    const assetUrl = readString(uploadResponse.body, 'url', '');
    if (!assetUrl.startsWith('https://')) return errorResult('github.attachment.upload', resolved.context, 'invalid_asset_response', 'Asset uploader did not return a HTTPS URL.', 'Check the uploader response contract.');
    const commentResponse = await requestJson(resolved.context, 'POST', 'repos/' + encodeURIComponent(resolved.context.owner) + '/' + encodeURIComponent(resolved.context.repo) + '/issues/' + String(plan.number) + '/comments', { body: '[' + path.basename(realPath) + '](' + assetUrl + ')' });
    if (!commentResponse.ok) return errorResult('github.attachment.upload', resolved.context, 'partial_failure', 'Asset uploaded but GitHub comment creation failed.', 'Copy the returned asset URL into the issue or pull request manually.', { assetUrl, uploaded: true, commented: false });
    return successResult('github.attachment.upload', resolved.context, { confirmed: true, assetUrl, uploaded: true, commented: true, number: plan.number });
  }

  async watchStart(payload, emit) {
    const subscriberId = readString(payload, 'subscriberId', '');
    const workspaceId = readString(payload, 'workspaceId', '');
    const number = readNumber(payload, 'number', 0);
    const hostProfileId = readString(payload, 'hostProfileId', '');
    const context = await this.context(payload);
    if (!subscriberId || (!workspaceId && number <= 0)) return errorResult('github.watch.start', context, 'validation_failed', 'subscriberId and a workspace/PR target are required.', remediationForFailure('validation_failed'));
    const targetKey = crypto.createHash('sha256').update(hostProfileId + '\n' + context.repository + '\n' + workspaceId + '\n' + String(number)).digest('hex').slice(0, 24);
    const existing = this.watchers.get(targetKey);
    if (existing) {
      existing.subscribers.set(subscriberId, emit);
      if (!(existing.subscriberOwners instanceof Map)) existing.subscriberOwners = new Map();
      existing.subscriberOwners.set(subscriberId, readString(payload, '_connectionId', ''));
      return successResult('github.watch.start', context, { watching: true, watchId: targetKey, subscriberCount: existing.subscribers.size, intervalMs: existing.intervalMs });
    }
    const watcher = {
      watchId: targetKey,
      payload: Object.assign({}, payload),
      hostProfileId,
      accountId: readString(payload, 'accountId', ''),
      intervalMs: Math.max(15000, readNumber(payload, 'intervalMs', 30000)),
      backoffMs: 0,
      etag: '',
      lastDigest: '',
      timer: null,
      subscribers: new Map([[subscriberId, emit]])
    };
    watcher.subscriberOwners = new Map([[subscriberId, readString(payload, '_connectionId', '')]]);
    const tick = async () => {
      if (!this.watchers.has(targetKey)) return;
      const route = 'repos/' + encodeURIComponent(context.owner) + '/' + encodeURIComponent(context.repo) + '/pulls/' + String(number);
      const response = await requestJson(context, 'GET', route, null, watcher.etag ? { 'if-none-match': watcher.etag } : {});
      if (response.statusCode === 304) watcher.backoffMs = 0;
      else if (response.ok) {
        watcher.etag = readString(response.headers, 'etag', watcher.etag);
        watcher.backoffMs = 0;
        const result = await this.pullRequestStatus(watcher.payload);
        const digest = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
        if (digest !== watcher.lastDigest) {
          watcher.lastDigest = digest;
          for (const callback of watcher.subscribers.values()) if (typeof callback === 'function') callback(Object.assign({}, result, { watchId: targetKey }));
        }
      } else {
        const remaining = Number.parseInt(readString(response.headers, 'x-ratelimit-remaining', '-1'), 10);
        const reset = Number.parseInt(readString(response.headers, 'x-ratelimit-reset', '0'), 10) * 1000;
        watcher.backoffMs = remaining === 0 && reset > Date.now() ? reset - Date.now() : Math.min(300000, Math.max(5000, watcher.backoffMs > 0 ? watcher.backoffMs * 2 : 5000));
      }
      const jitter = Math.floor(Math.random() * 1000);
      watcher.timer = setTimeout(tick, Math.max(watcher.intervalMs, watcher.backoffMs) + jitter);
      watcher.timer.unref();
    };
    this.watchers.set(targetKey, watcher);
    await tick();
    return successResult('github.watch.start', context, { watching: true, watchId: targetKey, subscriberCount: 1, intervalMs: watcher.intervalMs });
  }

  async watchStop(payload) {
    const watchId = readString(payload, 'watchId', '');
    const subscriberId = readString(payload, 'subscriberId', '');
    const watcher = this.watchers.get(watchId);
    const requestedHostProfileId = readString(payload, 'hostProfileId', '');
    if (watcher && readString(watcher, 'hostProfileId', '').length > 0 && readString(watcher, 'hostProfileId', '') !== requestedHostProfileId) {
      return errorResult('github.watch.stop', await this.context(payload), 'host_scope_mismatch', 'GitHub watch belongs to another host profile.', 'Stop the watch from the host profile that started it.');
    }
    if (watcher && subscriberId) {
      watcher.subscribers.delete(subscriberId);
      if (watcher.subscriberOwners instanceof Map) watcher.subscriberOwners.delete(subscriberId);
    }
    if (watcher && (!subscriberId || watcher.subscribers.size === 0)) this.stopWatcher(watchId);
    return successResult('github.watch.stop', await this.context(payload), { watching: this.watchers.has(watchId), watchId, subscriberCount: watcher && this.watchers.has(watchId) ? watcher.subscribers.size : 0 });
  }

  stopWatcher(watchId) {
    const watcher = this.watchers.get(watchId);
    if (watcher && watcher.timer) clearTimeout(watcher.timer);
    this.watchers.delete(watchId);
  }

  stopWatchersForConnection(connectionId) {
    const ownerId = typeof connectionId === 'string' ? connectionId.trim() : '';
    if (ownerId.length === 0) return 0;
    let removed = 0;
    for (const [watchId, watcher] of this.watchers.entries()) {
      if (!watcher || !(watcher.subscriberOwners instanceof Map)) continue;
      for (const [subscriberId, subscriberOwnerId] of watcher.subscriberOwners.entries()) {
        if (subscriberOwnerId !== ownerId) continue;
        watcher.subscriberOwners.delete(subscriberId);
        watcher.subscribers.delete(subscriberId);
        removed += 1;
      }
      if (watcher.subscribers.size === 0) this.stopWatcher(watchId);
    }
    return removed;
  }
}

module.exports = {
  GitHubClient,
  parseRemoteUrl,
  summarizeChecks
};
