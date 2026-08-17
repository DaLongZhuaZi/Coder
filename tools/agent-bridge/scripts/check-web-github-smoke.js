'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

function startGithubMock() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ method: req.method, url: req.url, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/repos/octo/web/pulls?state=open&page=1&per_page=20' && req.method === 'GET') {
        res.end(JSON.stringify([{ number: 7, html_url: 'https://github.com/octo/web/pull/7', state: 'open', title: 'Web smoke PR', draft: true, head: { ref: 'feature/web', sha: 'sha-web' }, base: { ref: 'main' }, requested_reviewers: [], labels: [], updated_at: '2026-08-08T00:00:00Z' }]));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7' && req.method === 'GET') {
        res.end(JSON.stringify({ number: 7, html_url: 'https://github.com/octo/web/pull/7', state: 'open', title: 'Web smoke PR', body: 'body', draft: true, mergeable: true, mergeable_state: 'clean', head: { ref: 'feature/web', sha: 'sha-web' }, base: { ref: 'main' }, requested_reviewers: [], labels: [], updated_at: '2026-08-08T00:00:00Z' }));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7/reviews' && req.method === 'GET') {
        res.end(JSON.stringify([{ user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-08-08T00:00:00Z' }]));
        return;
      }
      if (req.url === '/repos/octo/web/commits/sha-web/check-runs' && req.method === 'GET') {
        res.end(JSON.stringify({ check_runs: [{ name: 'build', status: 'completed', conclusion: 'success' }] }));
        return;
      }
      if (req.url === '/repos/octo/web/commits/sha-web/status' && req.method === 'GET') {
        res.end(JSON.stringify({ statuses: [] }));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7' && req.method === 'PATCH') {
        const update = JSON.parse(body);
        res.end(JSON.stringify({ number: 7, html_url: 'https://github.com/octo/web/pull/7', state: 'open', title: update.title || 'Web smoke PR', body: update.body || 'body', draft: false, mergeable: true, mergeable_state: 'clean', head: { ref: 'feature/web', sha: 'sha-web' }, base: { ref: 'main' } }));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7/ready_for_review' && req.method === 'POST') {
        res.end(JSON.stringify({ number: 7, html_url: 'https://github.com/octo/web/pull/7', state: 'open', title: 'Web smoke PR', body: 'body', draft: false, mergeable: true, mergeable_state: 'clean', head: { ref: 'feature/web', sha: 'sha-web' }, base: { ref: 'main' } }));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7/requested_reviewers' && req.method === 'POST') {
        res.end(JSON.stringify({ requested_reviewers: JSON.parse(body).reviewers || [] }));
        return;
      }
      if (req.url === '/repos/octo/web/issues/7/labels' && req.method === 'POST') {
        res.end(JSON.stringify((JSON.parse(body).labels || []).map((name) => ({ name }))));
        return;
      }
      if (req.url === '/repos/octo/web/pulls/7/merge' && req.method === 'PUT') {
        res.end(JSON.stringify({ merged: true, sha: 'sha-merged', message: 'Pull request successfully merged' }));
        return;
      }
      if (req.url === '/repos/octo/web/pulls' && req.method === 'POST') {
        const create = JSON.parse(body);
        res.statusCode = 201;
        res.end(JSON.stringify({ number: 8, html_url: 'https://github.com/octo/web/pull/8', state: 'open', title: create.title, draft: create.draft === true, head: { ref: create.head, sha: 'sha-new' }, base: { ref: create.base } }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'Not Found' }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({ server, requests, apiBaseUrl: 'http://127.0.0.1:' + String(address.port) });
  }));
}

function request(port, method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers: { Host: '127.0.0.1:' + String(port), Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const github = await startGithubMock();
  const bridgePort = await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = address && typeof address === 'object' ? address.port : 0; server.close(() => resolve(port)); });
  });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-web-github-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-web-github-workspace-'));
  fs.writeFileSync(path.join(workspace, 'report.md'), '# smoke\n', 'utf8');
  const root = path.resolve(__dirname, '..');
  const bridgeToken = 'web-github-token-' + String(Date.now());
  const child = childProcess.spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, { AGENT_BRIDGE_HOME: home, AGENT_BRIDGE_HOST: '127.0.0.1', AGENT_BRIDGE_PORT: String(bridgePort), AGENT_BRIDGE_TOKEN: bridgeToken, GITHUB_TOKEN: 'github-web-smoke', NO_COLOR: '1' }),
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true
  });
  async function rpc(type, payload) {
    const response = await request(bridgePort, 'POST', '/rpc', bridgeToken, JSON.stringify({ id: 'web-github-' + type.replace(/[^a-z0-9]/gi, '_') + '-' + String(Date.now()), type, payload: payload || {} }));
    assert.strictEqual(response.status, 200, type + ' must return HTTP 200');
    const body = JSON.parse(response.body);
    assert.ok(body.response && body.response.type === 'response', type + ' must return an RPC response');
    return body.response.payload || body.response;
  }
  try {
    let health = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { health = await request(bridgePort, 'GET', '/health', bridgeToken); if (health.status === 200) break; } catch (_error) { /* wait for Bridge */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(health && health.status === 200, 'Bridge should become healthy');
    const workspaceId = 'web-github-workspace';
    const common = { hostProfileId: 'web-github-host', workspaceId, accountId: 'env-account', owner: 'octo', repo: 'web', apiBaseUrl: github.apiBaseUrl };
    const auth = await rpc('github.auth.status', {});
    assert.strictEqual(auth.authenticated, true, 'environment token should authenticate');
    const binding = await rpc('github.binding.set', Object.assign({}, common, { confirm: true }));
    assert.strictEqual(binding.ok, true);
    const bindingRead = await rpc('github.binding.get', { hostProfileId: common.hostProfileId, workspaceId });
    assert.strictEqual(bindingRead.binding.repo, 'web');
    const list = await rpc('github.pr.list', Object.assign({}, common, { page: 1, perPage: 20, state: 'open' }));
    assert.strictEqual(list.ok, true);
    assert.strictEqual(list.pullRequests.length, 1);
    const status = await rpc('github.pr.status', Object.assign({}, common, { number: 7 }));
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.reviewDecision, 'approved');
    const updatePreview = await rpc('github.pr.update', Object.assign({}, common, { number: 7, title: 'Updated from Web', preview: true }));
    assert.strictEqual(updatePreview.preview, true);
    const updated = await rpc('github.pr.update', Object.assign({}, common, { number: 7, title: 'Updated from Web', planId: updatePreview.planId, confirm: true, preview: false }));
    assert.strictEqual(updated.confirmed, true);
    const reviewersPreview = await rpc('github.pr.reviewers.update', Object.assign({}, common, { number: 7, reviewers: ['octo-reviewer'], preview: true }));
    assert.strictEqual(reviewersPreview.preview, true);
    const reviewers = await rpc('github.pr.reviewers.update', Object.assign({}, common, { number: 7, reviewers: ['octo-reviewer'], planId: reviewersPreview.planId, confirm: true, preview: false }));
    assert.strictEqual(reviewers.confirmed, true);
    const labelsPreview = await rpc('github.pr.labels.update', Object.assign({}, common, { number: 7, labels: ['web'], preview: true }));
    assert.strictEqual(labelsPreview.preview, true);
    const labels = await rpc('github.pr.labels.update', Object.assign({}, common, { number: 7, labels: ['web'], planId: labelsPreview.planId, confirm: true, preview: false }));
    assert.strictEqual(labels.confirmed, true);
    const mergePreview = await rpc('github.pr.merge', Object.assign({}, common, { number: 7, dryRun: true, mergeMethod: 'squash' }));
    assert.strictEqual(mergePreview.preview, true);
    const merged = await rpc('github.pr.merge', Object.assign({}, common, { number: 7, planId: mergePreview.planId, confirm: true, mergeMethod: 'squash', dryRun: false }));
    assert.strictEqual(merged.state, 'merged');
    const checks = await rpc('github.checks.list', Object.assign({}, common, { sha: 'sha-web' }));
    assert.strictEqual(checks.checksSummary.passed, 1);
    const watch = await rpc('github.watch.start', Object.assign({}, common, { number: 7, subscriberId: 'web-tab-smoke', intervalMs: 15000 }));
    assert.strictEqual(watch.watching, true);
    const stopped = await rpc('github.watch.stop', Object.assign({}, common, { watchId: watch.watchId, subscriberId: 'web-tab-smoke' }));
    assert.strictEqual(stopped.watching, false);
    const attachment = await rpc('github.attachment.preview', Object.assign({}, common, { number: 7, workspacePath: workspace, filePath: path.join(workspace, 'report.md') }));
    assert.strictEqual(attachment.failureCategory, 'capability_unavailable');
    assert.ok(github.requests.some((item) => item.url.indexOf('/pulls/7') >= 0), 'Web GitHub smoke must hit PR endpoints');
    console.log('web github smoke ok');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    github.server.close();
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
