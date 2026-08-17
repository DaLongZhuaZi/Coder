#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { GitHubClient, parseRemoteUrl, summarizeChecks } = require('../src/github-client');
const { createDaemonStore } = require('../src/daemon-store');

function startMockGitHubServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || '',
        body
      });
      res.setHeader('content-type', 'application/json');
      if (!req.headers.authorization) {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: 'Bad credentials' }));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls' && req.method === 'POST') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          number: 7,
          html_url: 'https://github.example/octo/hello/pull/7',
          state: 'open',
          title: 'Smoke PR',
          head: { ref: 'feature/smoke', sha: 'abc123' },
          base: { ref: 'main' }
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls?state=open&page=1&per_page=30' && req.method === 'GET') {
        res.end(JSON.stringify([{ number: 7, html_url: 'https://github.example/octo/hello/pull/7', state: 'open', title: 'Smoke PR', head: { ref: 'feature/smoke', sha: 'abc123' }, base: { ref: 'main' } }]));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls/7' && req.method === 'PATCH') {
        const update = JSON.parse(body);
        res.end(JSON.stringify({ number: 7, html_url: 'https://github.example/octo/hello/pull/7', state: 'open', title: update.title, head: { ref: 'feature/smoke', sha: 'abc123' }, base: { ref: 'main' } }));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls/7' && req.method === 'GET') {
        res.end(JSON.stringify({
          number: 7,
          html_url: 'https://github.example/octo/hello/pull/7',
          state: 'open',
          title: 'Smoke PR',
          mergeable: true,
          draft: false,
          head: { ref: 'feature/smoke', sha: 'abc123' },
          base: { ref: 'main' }
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls/7/merge' && req.method === 'PUT') {
        res.end(JSON.stringify({
          merged: true,
          sha: 'def456',
          message: 'Pull Request successfully merged'
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls/9/merge' && req.method === 'PUT') {
        res.statusCode = 405;
        res.end(JSON.stringify({ message: 'Pull Request is not mergeable' }));
        return;
      }
      if (req.url === '/repos/octo/hello/commits/abc123/check-runs' && req.method === 'GET') {
        res.end(JSON.stringify({
          check_runs: [
            { name: 'build', status: 'completed', conclusion: 'success' },
            { name: 'lint', status: 'completed', conclusion: 'failure' }
          ]
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/commits/abc123/status' && req.method === 'GET') {
        res.end(JSON.stringify({
          statuses: [
            { context: 'deploy', state: 'pending' }
          ]
        }));
        return;
      }
      if (req.url.indexOf('/search/issues?') === 0 && req.method === 'GET') {
        res.end(JSON.stringify({
          total_count: 1,
          items: [
            {
              number: 3,
              title: 'Smoke issue',
              state: 'open',
              html_url: 'https://github.example/octo/hello/issues/3',
              updated_at: '2026-07-10T00:00:00Z'
            }
          ]
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/issues/3' && req.method === 'GET') {
        res.end(JSON.stringify({
          number: 3,
          body: 'See https://example.test/asset.log'
        }));
        return;
      }
      if (req.url === '/repos/octo/hello/issues/3/comments' && req.method === 'GET') {
        res.end(JSON.stringify([
          { body: 'Screenshot https://example.test/screenshot.png' }
        ]));
        return;
      }
      if (req.url === '/repos/octo/hello/pulls/422' && req.method === 'GET') {
        res.statusCode = 403;
        res.setHeader('x-ratelimit-reset', '1780000000');
        res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'Not Found' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        requests,
        apiBaseUrl: 'http://127.0.0.1:' + String(address.port)
      });
    });
  });
}

function runCli(home, args, env) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(__dirname, '..', 'src', 'desktop-launcher.js')].concat(args), {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, env || {}, {
        AGENT_BRIDGE_HOME: home,
        NO_COLOR: '1'
      }),
      encoding: 'utf8',
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || '') + (stdout || '') + error.message));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

async function main() {
  const parsedHttps = parseRemoteUrl('https://github.com/octo/hello.git');
  assert.strictEqual(parsedHttps.owner, 'octo');
  assert.strictEqual(parsedHttps.repo, 'hello');
  const parsedSsh = parseRemoteUrl('git@github.com:octo/hello.git');
  assert.strictEqual(parsedSsh.owner, 'octo');
  assert.strictEqual(parsedSsh.repo, 'hello');
  const summary = summarizeChecks(
    [{ name: 'build', status: 'completed', conclusion: 'success' }],
    [{ context: 'deploy', state: 'failure' }]
  );
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.failed, 1);

  const mock = await startMockGitHubServer();
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-github-home-'));
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-github-repo-'));
  try {
    execFileSync('git', ['init'], { cwd: tempRepo, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.example/octo/hello.git'], { cwd: tempRepo, stdio: 'ignore', windowsHide: true });
  } catch (_error) {
    // Remote inference is best-effort when git is available.
  }
  try {
    const store = createDaemonStore(tempHome);
    const client = new GitHubClient({ store });
    const authMissing = await client.pullRequestStatus({
      owner: 'octo',
      repo: 'hello',
      number: 7,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_MISSING'
    });
    assert.strictEqual(authMissing.ok, false);
    assert.strictEqual(authMissing.failureCategory, 'auth_missing');

    process.env.AGENT_BRIDGE_GITHUB_SMOKE_TOKEN = 'smoke-token';
    const dryRun = await client.createPullRequest({
      owner: 'octo',
      repo: 'hello',
      head: 'feature/smoke',
      base: 'main',
      title: 'Smoke PR',
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_MISSING',
      dryRun: true
    });
    assert.strictEqual(dryRun.ok, true);
    assert.strictEqual(dryRun.dryRun, true);
    assert.strictEqual(mock.requests.length, 0);

    const created = await client.createPullRequest({
      workspacePath: tempRepo,
      cwd: tempRepo,
      head: 'feature/smoke',
      base: 'main',
      title: 'Smoke PR',
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.number, 7);
    assert.strictEqual(created.repository, 'octo/hello');

    const status = await client.pullRequestStatus({
      owner: 'octo',
      repo: 'hello',
      number: 7,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.mergeable, true);

    const listed = await client.pullRequestList({ owner: 'octo', repo: 'hello', apiBaseUrl: mock.apiBaseUrl, tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN' });
    assert.strictEqual(listed.ok, true);
    assert.strictEqual(listed.pullRequests.length, 1);
    const updatePreview = await client.updatePullRequest({ owner: 'octo', repo: 'hello', number: 7, title: 'Updated', apiBaseUrl: mock.apiBaseUrl, tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN' });
    assert.strictEqual(updatePreview.preview, true);
    const updated = await client.updatePullRequest({ owner: 'octo', repo: 'hello', number: 7, title: 'Updated', planId: updatePreview.planId, confirm: true, preview: false, apiBaseUrl: mock.apiBaseUrl, tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN' });
    assert.strictEqual(updated.title, 'Updated');
    const repeatedUpdate = await client.updatePullRequest({ owner: 'octo', repo: 'hello', number: 7, title: 'Updated', planId: updatePreview.planId, confirm: true, preview: false, apiBaseUrl: mock.apiBaseUrl, tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN' });
    assert.strictEqual(repeatedUpdate.failureCategory, 'plan_expired');

    const binding = await client.bindingSet({ hostProfileId: 'host-1', workspaceId: 'workspace-1', accountId: 'account-1', owner: 'octo', repo: 'hello', confirm: true });
    assert.strictEqual(binding.ok, true);
    const bindingRead = await client.bindingGet({ hostProfileId: 'host-1', workspaceId: 'workspace-1' });
    assert.strictEqual(bindingRead.binding.repo, 'hello');

    const checks = await client.checksList({
      owner: 'octo',
      repo: 'hello',
      sha: 'abc123',
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(checks.ok, true);
    assert.strictEqual(checks.checksSummary.total, 3);
    assert.strictEqual(checks.checksSummary.failed, 1);
    assert.strictEqual(checks.checksSummary.pending, 1);

    const mergeConfirmRequired = await client.mergePullRequest({
      owner: 'octo',
      repo: 'hello',
      number: 7,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(mergeConfirmRequired.failureCategory, 'confirm_required');

    const merged = await client.mergePullRequest({
      owner: 'octo',
      repo: 'hello',
      number: 7,
      confirm: true,
      mergeMethod: 'squash',
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(merged.ok, true);
    assert.strictEqual(merged.state, 'merged');

    const mergeBlocked = await client.mergePullRequest({
      owner: 'octo',
      repo: 'hello',
      number: 9,
      confirm: true,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(mergeBlocked.ok, false);
    assert.strictEqual(mergeBlocked.failureCategory, 'merge_blocked');

    const issues = await client.issueSearch({
      owner: 'octo',
      repo: 'hello',
      keyword: 'Smoke',
      state: 'open',
      labels: ['bug'],
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(issues.ok, true);
    assert.strictEqual(issues.issues.length, 1);

    const attachments = await client.issueAttachmentList({
      owner: 'octo',
      repo: 'hello',
      number: 3,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(attachments.ok, true);
    assert.strictEqual(attachments.attachments.length, 2);

    const rateLimited = await client.pullRequestStatus({
      owner: 'octo',
      repo: 'hello',
      number: 422,
      apiBaseUrl: mock.apiBaseUrl,
      tokenEnv: 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN'
    });
    assert.strictEqual(rateLimited.failureCategory, 'rate_limited');
    assert.ok(rateLimited.rateLimitResetAt.length > 0);

    const cliDryRun = await runCli(tempHome, [
      'github', 'pr', 'create',
      '--owner', 'octo',
      '--repo', 'hello',
      '--api-base-url', mock.apiBaseUrl,
      '--token-env', 'AGENT_BRIDGE_GITHUB_SMOKE_MISSING',
      '--head', 'feature/smoke',
      '--base', 'main',
      '--title', 'Smoke PR',
      '--dry-run'
    ]);
    assert.strictEqual(cliDryRun.ok, true);
    assert.strictEqual(cliDryRun.dryRun, true);

    const cliChecks = await runCli(tempHome, [
      'github', 'checks', 'list',
      '--owner', 'octo',
      '--repo', 'hello',
      '--api-base-url', mock.apiBaseUrl,
      '--token-env', 'AGENT_BRIDGE_GITHUB_SMOKE_TOKEN',
      '--sha', 'abc123'
    ], {
      AGENT_BRIDGE_GITHUB_SMOKE_TOKEN: 'smoke-token'
    });
    assert.strictEqual(cliChecks.ok, true, JSON.stringify(cliChecks));
    assert.strictEqual(cliChecks.checksSummary.failed, 1);
  } finally {
    mock.server.close();
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRepo, { recursive: true, force: true });
    delete process.env.AGENT_BRIDGE_GITHUB_SMOKE_TOKEN;
  }
  console.log('github client smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
