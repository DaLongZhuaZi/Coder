'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CodexAppServerProvider } = require('../src/providers/codex-app-server-provider');
const { ProviderRegistry } = require('../src/provider-registry');
const { EventEmitter } = require('events');

function fakeServerSource() {
  return [
    "'use strict';",
    "const readline = require('readline');",
    "let threadCounter = 0;",
    "let turnCounter = 0;",
    "const turns = new Map();",
    "const threads = new Map();",
    "function send(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "function complete(threadId, turnId, text, status) {",
    "  let replyText = text; if (text.includes('Generate metadata')) { if (text.includes('invalid-branch')) { replyText = JSON.stringify({ suggestion: 'bad branch' }); } else if (text.includes('kind=branchName')) { replyText = JSON.stringify({ suggestion: 'feature/generated-metadata', alternatives: ['feature/metadata-alt'] }); } else if (text.includes('kind=commitMessage')) { replyText = JSON.stringify({ suggestion: 'chore: generated metadata', alternatives: ['docs: generated metadata'] }); } else if (text.includes('kind=pullRequest')) { replyText = JSON.stringify({ suggestion: 'Generated pull request\\n\\nSummary', alternatives: ['Alternative pull request'] }); } else { replyText = JSON.stringify({ suggestion: 'Generated session title', alternatives: ['Alternative session title'] }); } }",
    "  const record = turns.get(turnId); if (record && record.turn) { if (replyText) { record.turn.items.push({ id: 'agent-' + turnId, type: 'agentMessage', text: replyText }); } record.turn.status = status || 'completed'; record.turn.completedAt = Date.now(); }",
    "  send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'agent-' + turnId, delta: replyText } });",
    "  send({ method: 'item/completed', params: { threadId, turnId, completedAtMs: Date.now(), item: { id: 'agent-' + turnId, type: 'agentMessage', text: replyText } } });",
    "  send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: status || 'completed', items: [] } } });",
    "}",
    "readline.createInterface({ input: process.stdin }).on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (message.method === 'initialize') { send({ id: message.id, result: { userAgent: 'fake-codex' } }); return; }",
    "  if (message.method === 'initialized') { return; }",
    "  if (message.method === 'thread/start') {",
    "    threadCounter += 1; const id = 'thread-' + String(threadCounter);",
    "    const thread = { id, preview: '', ephemeral: false, modelProvider: 'openai', createdAt: Date.now(), updatedAt: Date.now(), status: { type: 'idle' }, path: null, cwd: message.params.cwd || process.cwd(), cliVersion: 'fake', source: 'appServer', agentNickname: null, agentRole: null, gitInfo: null, name: null, turns: [] }; threads.set(id, thread);",
    "    send({ id: message.id, result: { thread, approvalPolicy: 'on-request', approvalsReviewer: 'user', cwd: message.params.cwd || process.cwd(), model: 'configured', modelProvider: 'openai', sandbox: { type: 'workspaceWrite' } } }); return;",
    "  }",
    "  if (message.method === 'thread/resume') { send({ id: message.id, result: { thread: { id: message.params.threadId }, approvalPolicy: 'on-request', approvalsReviewer: 'user', cwd: process.cwd(), model: 'configured', modelProvider: 'openai', sandbox: { type: 'workspaceWrite' } } }); return; }",
    "  if (message.method === 'thread/list') { const values = Array.from(threads.values()).reverse(); const offset = Number(message.params.cursor || 0); const data = values.slice(offset, offset + 1); const nextCursor = offset + 1 < values.length ? String(offset + 1) : null; send({ id: message.id, result: { data, nextCursor } }); return; }",
    "  if (message.method === 'thread/read') { const thread = threads.get(message.params.threadId); send({ id: message.id, result: { thread } }); return; }",
    "  if (message.method === 'turn/start') {",
    "    turnCounter += 1; const turnId = 'turn-' + String(turnCounter); const text = String(message.params.input[0].text || '');",
    "    const turn = { id: turnId, items: [{ id: 'user-' + turnId, type: 'userMessage', content: [{ type: 'text', text }] }], status: 'inProgress', error: null, startedAt: Date.now(), completedAt: null }; const thread = threads.get(message.params.threadId); if (thread) { thread.turns.push(turn); thread.updatedAt = Date.now(); } turns.set(turnId, { threadId: message.params.threadId, text, turn });",
    "    send({ id: message.id, result: { turn: { id: turnId, items: [], status: 'inProgress', error: null } } });",
    "    setImmediate(() => {",
    "      send({ method: 'item/started', params: { threadId: message.params.threadId, turnId, startedAtMs: Date.now(), item: { id: 'cmd-' + turnId, type: 'commandExecution', command: 'echo fake', status: 'inProgress', aggregatedOutput: '', exitCode: null, durationMs: null, processId: null, cwd: process.cwd(), commandActions: [], source: 'agent' } } });",
    "      if (text.includes('compact-reverse')) { send({ method: 'thread/compacted', params: { threadId: message.params.threadId, turnId } }); send({ method: 'item/completed', params: { threadId: message.params.threadId, turnId, item: { id: 'compact-' + turnId, type: 'contextCompaction' } } }); } else if (text.includes('compact')) { send({ method: 'item/started', params: { threadId: message.params.threadId, turnId, item: { id: 'compact-' + turnId, type: 'contextCompaction' } } }); send({ method: 'item/completed', params: { threadId: message.params.threadId, turnId, item: { id: 'compact-' + turnId, type: 'contextCompaction', reason: 'automatic' } } }); send({ method: 'thread/compacted', params: { threadId: message.params.threadId, turnId } }); }",
    "      if (text.includes('approval')) { send({ id: 'approval-' + turnId, method: 'item/commandExecution/requestApproval', params: { threadId: message.params.threadId, turnId, itemId: 'cmd-' + turnId, reason: 'test', command: 'echo fake', cwd: process.cwd(), commandActions: [] } }); return; }",
    "      if (text.includes('question')) { send({ id: 'question-' + turnId, method: 'item/tool/requestUserInput', params: { threadId: message.params.threadId, turnId, itemId: 'tool-' + turnId, questions: [{ id: 'choice', header: 'Choice', question: 'Choose?', isOther: false, isSecret: false, options: [{ label: 'A', description: 'A' }] }] } }); return; }",
    "      if (text.includes('wait')) { return; }",
    "      complete(message.params.threadId, turnId, 'reply:' + text, 'completed');",
    "    }); return;",
    "  }",
    "  if (message.method === 'turn/interrupt') { send({ id: message.id, result: {} }); setImmediate(() => complete(message.params.threadId, message.params.turnId, '', 'interrupted')); return; }",
    "  if (message.method === 'thread/archive') { send({ id: message.id, result: {} }); return; }",
    "  if (message.id && !message.method) {",
    "    const turnId = String(message.id).replace(/^approval-/, '').replace(/^question-/, ''); const turn = turns.get(turnId);",
    "    if (turn) { complete(turn.threadId, turnId, message.result && message.result.answers ? 'answered' : 'approved', 'completed'); }",
    "  }",
    "});"
  ].join('\n');
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for fake App Server event.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-codex-app-server-'));
  const scriptPath = path.join(root, 'fake-app-server.js');
  fs.writeFileSync(scriptPath, fakeServerSource(), 'utf8');
  const fakeHistoryProvider = {
    async listSessions() { return []; },
    async listMessages() { return []; },
    async listToolCalls() { return []; }
  };
  const provider = new CodexAppServerProvider({
    command: process.execPath,
    appServerArgs: [scriptPath],
    runtime: 'app-server',
    timeoutMs: 3000,
    commandAvailable: async () => true,
    execProvider: fakeHistoryProvider
  });
  const subscribedEvents = [];
  provider.subscribeEvents('smoke', (event) => subscribedEvents.push(event));
  try {
    const descriptor = await provider.describe();
    assert.strictEqual(descriptor.runtimeMode, 'service');
    assert.strictEqual(descriptor.sessionFeatures.attach, true);
    const session = await provider.createSession({ workspacePath: root });
    assert.strictEqual(session.sessionId, 'codex:' + session.remoteSessionId);
    assert.strictEqual(session.workspacePath, root);
    const defaultWorkspaceSession = await provider.createSession({});
    assert.strictEqual(defaultWorkspaceSession.workspacePath, process.cwd());
    const firstEvents = [];
    const first = await provider.sendMessage({ sessionId: session.sessionId, text: 'first' }, (event) => firstEvents.push(event));
    assert.strictEqual(first.text, 'reply:first');
    const second = await provider.sendMessage({ sessionId: session.sessionId, text: 'second' }, () => {});
    assert.strictEqual(second.text, 'reply:second');
    assert.strictEqual(firstEvents.filter((event) => event.event === 'message.completed').length, 1);
    assert(firstEvents.some((event) => event.event === 'tool.started'));
    const listedSessions = await provider.listSessions();
    assert.strictEqual(listedSessions.length, 2);
    provider.messages.set(session.sessionId, []);
    const historicalMessages = await provider.listMessages(session.sessionId);
    assert.strictEqual(historicalMessages.filter((message) => message.role === 'user').length, 2);
    assert.strictEqual(historicalMessages.filter((message) => message.role === 'assistant').length, 2);
    const metadataSessionCount = provider.sessions.size;
    const metadataSessionIds = new Set(provider.sessions.keys());
    const metadataMessageIds = new Set(provider.messages.keys());
    const metadataKinds = [
      ['sessionTitle', 'Generated session title'],
      ['branchName', 'feature/generated-metadata'],
      ['commitMessage', 'chore: generated metadata'],
      ['pullRequest', 'Generated pull request\n\nSummary']
    ];
    for (const [kind, expected] of metadataKinds) {
      const suggestion = await provider.generateMetadata({
        kind,
        workspacePath: root,
        prompt: 'metadata smoke',
        timelineSummary: 'one completed turn',
        diffSummary: 'one changed file',
        branchName: 'main'
      });
      assert.strictEqual(suggestion, expected);
      assert.strictEqual(provider.sessions.size, metadataSessionCount);
      for (const sessionId of provider.sessions.keys()) {
        assert.strictEqual(metadataSessionIds.has(sessionId), true);
      }
      for (const messageId of provider.messages.keys()) {
        assert.strictEqual(metadataMessageIds.has(messageId), true);
      }
    }
    const structuredMetadata = await provider.generateMetadataResult({
      metadataRequestId: 'r144-codex-metadata',
      kind: 'branchName',
      workspacePath: root,
      prompt: 'metadata smoke',
      timelineSummary: 'one completed turn',
      diffSummary: 'one changed file',
      branchName: 'main'
    });
    assert.strictEqual(structuredMetadata.suggestion, 'feature/generated-metadata');
    assert.deepStrictEqual(structuredMetadata.alternatives, ['feature/metadata-alt']);
    assert.strictEqual(provider.metadataRequests.size, 0, 'metadata request registry must be cleaned after completion');
    await assert.rejects(
      provider.generateMetadata({ kind: 'branchName', workspacePath: root, prompt: 'invalid-branch' }),
      /branch name failed validation/
    );
    assert.strictEqual(provider.sessions.size, metadataSessionCount);
    for (const sessionId of provider.sessions.keys()) {
      assert.strictEqual(metadataSessionIds.has(sessionId), true);
    }
    for (const messageId of provider.messages.keys()) {
      assert.strictEqual(metadataMessageIds.has(messageId), true);
    }
    const compactionBefore = subscribedEvents.filter((event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.kind === 'compaction').length;
    const compacted = await provider.sendMessage({ sessionId: session.sessionId, text: 'compact' });
    assert.strictEqual(compacted.text, 'reply:compact');
    const compactionEvents = subscribedEvents.filter((event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.kind === 'compaction');
    assert.strictEqual(compactionEvents.length - compactionBefore, 1);
    assert.strictEqual(compactionEvents[compactionEvents.length - 1].payload.usage.reason, 'automatic');
    const reverseBefore = compactionEvents.length;
    const reverseCompacted = await provider.sendMessage({ sessionId: session.sessionId, text: 'compact-reverse' });
    assert.strictEqual(reverseCompacted.text, 'reply:compact-reverse');
    const reverseEvents = subscribedEvents.filter((event) => event.event === 'usage.updated' && event.payload && event.payload.usage && event.payload.usage.kind === 'compaction');
    assert.strictEqual(reverseEvents.length - reverseBefore, 1);

    const approvalRun = provider.sendMessage({ sessionId: session.sessionId, text: 'approval' }, () => {});
    await waitFor(() => subscribedEvents.some((event) => event.event === 'permission.requested'), 1000);
    const approvalEvent = subscribedEvents.find((event) => event.event === 'permission.requested');
    const approval = await provider.respondPermission({ sessionId: session.sessionId, requestId: approvalEvent.payload.requestId, reply: 'once' });
    assert.strictEqual(approval.status, 'approved');
    assert.strictEqual((await approvalRun).text, 'approved');

    const questionRun = provider.sendMessage({ sessionId: session.sessionId, text: 'question' }, () => {});
    await waitFor(() => subscribedEvents.some((event) => event.event === 'question.requested'), 1000);
    const questionEvent = subscribedEvents.find((event) => event.event === 'question.requested');
    const answer = await provider.respondRequest({ sessionId: session.sessionId, requestId: questionEvent.payload.requestId, questionId: 'choice', answer: 'A' });
    assert.strictEqual(answer.questionId, 'choice');
    assert.strictEqual((await questionRun).text, 'answered');

    const waitingRun = provider.sendMessage({ sessionId: session.sessionId, text: 'wait' }, () => {});
    await waitFor(() => provider.getSession(session.sessionId).activeTurnId.length > 0, 1000);
    const aborted = await provider.abortSession({ sessionId: session.sessionId }, () => {});
    assert.strictEqual(aborted.status, 'aborted');
    assert.strictEqual((await waitingRun).status, 'interrupted');

    const restoredProvider = new CodexAppServerProvider({ command: process.execPath, appServerArgs: [scriptPath], runtime: 'app-server', timeoutMs: 3000, commandAvailable: async () => true });
    try {
      const attached = await restoredProvider.attachSession({ sessionId: session.sessionId, remoteSessionId: session.remoteSessionId, workspacePath: root }, () => {});
      assert.strictEqual(attached.remoteSessionId, session.remoteSessionId);
      const archived = await restoredProvider.archiveSession({ sessionId: session.sessionId }, () => {});
      assert.strictEqual(archived.archived, true);
      assert(restoredProvider.transport.pid > 0);
    } finally {
      restoredProvider.transport.stop();
    }

    const catalogRequests = [];
    const catalogTransport = new EventEmitter();
    catalogTransport.generation = 1;
    catalogTransport.start = async () => {};
    catalogTransport.request = async (method, params) => {
      catalogRequests.push({ method, params });
      const includesAppServer = Array.isArray(params.sourceKinds) && params.sourceKinds.includes('appServer');
      return {
        data: includesAppServer ? [{
          id: 'remote-app-server',
          cwd: root,
          preview: 'Remote App Server Thread',
          source: 'appServer',
          createdAt: Date.now() - 100,
          updatedAt: Date.now(),
          status: { type: 'notLoaded' }
        }] : [],
        nextCursor: null
      };
    };
    const persistedOnlySession = {
      sessionId: 'codex:persisted-only',
      remoteSessionId: 'persisted-only',
      providerId: 'codex',
      title: 'Persisted Only Thread',
      workspacePath: root,
      workspaceTitle: path.basename(root),
      branchName: 'main',
      modelId: 'configured',
      speedMode: 'auto',
      reasoningMode: 'auto',
      interactionMode: '',
      messageCount: 1,
      status: 'ready',
      source: 'codex',
      createdAt: Date.now() - 200,
      updatedAt: Date.now() - 100,
      runtimeMode: 'oneshot',
      codexRuntime: 'exec'
    };
    const persistedHistoryProvider = {
      async listSessions() { return [persistedOnlySession]; },
      async listMessages() { return []; },
      async listToolCalls() { return []; }
    };
    const catalogProvider = new CodexAppServerProvider({
      runtime: 'app-server',
      transport: catalogTransport,
      execProvider: persistedHistoryProvider,
      commandAvailable: async () => true
    });
    const catalogSessions = await catalogProvider.listSessions();
    assert.strictEqual(catalogRequests.length, 1);
    assert.deepStrictEqual(
      catalogRequests[0].params.sourceKinds,
      ['cli', 'vscode', 'exec', 'appServer', 'unknown']
    );
    assert(catalogSessions.some((item) => item.sessionId === 'codex:remote-app-server'));
    assert(catalogSessions.some((item) => item.sessionId === persistedOnlySession.sessionId));

    const coldRegistry = new ProviderRegistry();
    coldRegistry.register(new CodexAppServerProvider({
      runtime: 'app-server',
      transport: catalogTransport,
      execProvider: persistedHistoryProvider,
      commandAvailable: async () => true
    }));
    const coldMessages = await coldRegistry.listSessionMessages(persistedOnlySession.sessionId);
    assert.deepStrictEqual(coldMessages, []);
    assert.ok(coldRegistry.findSession(persistedOnlySession.sessionId));

    const invalid = new CodexAppServerProvider({ runtime: 'invalid-runtime' });
    const invalidDescriptor = await invalid.describe();
    assert.strictEqual(invalidDescriptor.capabilityStatus, 'degraded');

    const failingTransport = new EventEmitter();
    failingTransport.pid = 0;
    failingTransport.startedAt = 0;
    failingTransport.lastActivityAt = 0;
    failingTransport.lastError = 'not supported';
    failingTransport.start = async () => { throw new Error('app-server unavailable'); };
    const execSessions = new Map();
    const execProvider = {
      createSession(payload) {
        const value = { sessionId: 'codex:exec-fallback', remoteSessionId: 'exec-fallback', providerId: 'codex', workspacePath: payload.workspacePath || '', runtimeMode: 'oneshot', status: 'ready' };
        execSessions.set(value.sessionId, value);
        return value;
      },
      getSession(sessionId) { return execSessions.get(sessionId) || null; },
      async listMessages() { return []; },
      sessionRuntimeDiagnostics(sessionId) { return { providerId: 'codex', sessionId, remoteSessionId: 'exec-fallback', runtimeMode: 'oneshot', interactiveReady: false, sessionState: 'oneshot', pid: 0, startedAt: 0, lastActivityAt: 0, exitCode: null, lastError: '', recentOutputTail: '' }; },
      async describe() { return { id: 'codex', runtimeMode: 'oneshot', capabilities: { interactiveSessions: false }, sessionFeatures: { attach: false, abort: true, resume: false } }; }
    };
    const automatic = new CodexAppServerProvider({ runtime: 'auto', transport: failingTransport, execProvider });
    const fallbackSession = await automatic.createSession({ workspacePath: root });
    assert.strictEqual(fallbackSession.runtimeMode, 'oneshot');
    assert(fallbackSession.runtimeFallbackReason.includes('app-server unavailable'));
    console.log('codex app server provider smoke ok');
  } finally {
    provider.transport.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
