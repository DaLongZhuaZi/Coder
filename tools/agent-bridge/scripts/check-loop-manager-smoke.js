'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LoopManager, normalizeVerification } = require('../src/loop-manager');

function temporaryDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-' + name + '-'));
}

function storeFor(directory) {
  const loops = path.join(directory, 'loops');
  fs.mkdirSync(loops, { recursive: true });
  return { paths: { loops } };
}

function loopInput(overrides) {
  return Object.assign({
    name: 'Verifier loop',
    prompt: 'Implement the requested change.',
    verifyPrompt: 'Return a structured acceptance result.',
    acceptanceCriteria: [
      { id: 'tests', description: 'Targeted tests pass.' },
      { id: 'scope', description: 'No unrelated files are changed.' }
    ],
    workspacePath: process.cwd(),
    workerProviderId: 'mock',
    verifierProviderId: 'mock',
    workspaceMode: 'isolated',
    maxRounds: 3,
    budget: { maxTokens: 1000, maxCost: 10, currency: 'USD', maxDurationMs: 60000 }
  }, overrides || {});
}

function createConfirmed(manager, input) {
  const preview = manager.create(input);
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.preview, true);
  assert.strictEqual(manager.list({}).loops.length, 0, 'create preview must not write');
  const confirmed = manager.create({ confirm: true, planId: preview.planId });
  assert.strictEqual(confirmed.ok, true);
  assert.strictEqual(confirmed.confirmed, true);
  return confirmed.loop;
}

function confirmAction(manager, method, loopId) {
  const preview = manager[method]({ loopId });
  assert.strictEqual(preview.ok, true, method + ' preview failed');
  assert.strictEqual(preview.preview, true);
  return manager[method]({ loopId, confirm: true, planId: preview.planId });
}

function passVerification(criteria, summary) {
  return {
    passed: true,
    summary: summary || 'accepted',
    remediation: '',
    checks: criteria.map((item) => ({ criterionId: item.id, passed: true, evidence: 'verified' }))
  };
}

function failVerification(criteria, remediation) {
  return {
    passed: false,
    summary: 'not yet',
    remediation,
    checks: criteria.map((item, index) => ({ criterionId: item.id, passed: index > 0, evidence: 'check' }))
  };
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for Loop state.');
}

function checkVerifierContract() {
  const criteria = [{ id: 'one', description: 'One' }];
  assert.throws(() => normalizeVerification({ summary: 'missing pass' }, criteria), /boolean passed/);
  assert.throws(() => normalizeVerification({ passed: true, checks: [] }, criteria), /omitted/);
  assert.throws(() => normalizeVerification({ passed: true, checks: [{ criterionId: 'one', passed: false }] }, criteria), /conflicts/);
  const result = normalizeVerification({ passed: true, checks: [{ criterionId: 'one', passed: true }] }, criteria);
  assert.strictEqual(result.passed, true);
}

async function checkRoundsAndRemediation() {
  const directory = temporaryDirectory('loop-rounds');
  const workerInputs = [];
  let verifierRound = 0;
  const events = [];
  const manager = new LoopManager({
    store: storeFor(directory),
    executeWorker: async (input) => {
      workerInputs.push(input);
      input.onAgentStarted('worker_' + String(input.round));
      return { ok: true, agentId: 'worker_' + String(input.round), output: 'output_' + String(input.round), usage: { totalTokens: 10, cost: 0.1, currency: 'USD' } };
    },
    executeVerifier: async (input) => {
      verifierRound += 1;
      input.onAgentStarted('verifier_' + String(input.round));
      return {
        ok: true,
        agentId: 'verifier_' + String(input.round),
        verification: verifierRound === 1 ? failVerification(input.acceptanceCriteria, 'fix the tests') : passVerification(input.acceptanceCriteria),
        usage: { totalTokens: 5, cost: 0.05, currency: 'USD' }
      };
    },
    onUpdated: (event) => events.push(event)
  });
  const loop = createConfirmed(manager, loopInput());
  const started = confirmAction(manager, 'start', loop.id);
  assert.strictEqual(started.ok, true);
  await waitFor(() => manager.get({ loopId: loop.id }).loop.status === 'succeeded', 1000);
  const result = manager.get({ loopId: loop.id }).loop;
  assert.strictEqual(result.rounds.length, 2);
  assert.strictEqual(result.rounds[0].verification.passed, false);
  assert.strictEqual(result.rounds[1].verification.passed, true);
  assert.strictEqual(workerInputs[1].remediation, 'fix the tests');
  assert.strictEqual(result.usage.totalTokens, 30);
  assert.strictEqual(Math.abs(result.usage.costByCurrency.USD - 0.3) < 0.000001, true);
  assert.strictEqual(events.some((item) => item.kind === 'completed'), true);
  fs.rmSync(directory, { recursive: true, force: true });
}

async function checkBudgetAndInvalidVerifier() {
  const directory = temporaryDirectory('loop-budget');
  let verifierCalls = 0;
  const budgetManager = new LoopManager({
    store: storeFor(directory),
    executeWorker: async () => ({ ok: true, output: 'large', usage: { totalTokens: 11, cost: 100, currency: 'EUR' } }),
    executeVerifier: async (input) => {
      verifierCalls += 1;
      return { ok: true, verification: passVerification(input.acceptanceCriteria) };
    }
  });
  const budgetLoop = createConfirmed(budgetManager, loopInput({ budget: { maxTokens: 10, maxCost: 1, currency: 'USD' } }));
  confirmAction(budgetManager, 'start', budgetLoop.id);
  await waitFor(() => budgetManager.get({ loopId: budgetLoop.id }).loop.status === 'failed', 1000);
  const exhausted = budgetManager.get({ loopId: budgetLoop.id }).loop;
  assert.strictEqual(exhausted.terminationReason, 'budget_exhausted');
  assert.strictEqual(verifierCalls, 0, 'verifier must not run after worker exhausts budget');
  assert.strictEqual(exhausted.usage.costByCurrency.EUR, 100, 'cost currencies must remain separate');

  const invalidDirectory = temporaryDirectory('loop-invalid-verifier');
  const invalidManager = new LoopManager({
    store: storeFor(invalidDirectory),
    executeWorker: async () => ({ ok: true, output: 'done' }),
    executeVerifier: async () => ({ ok: true, verification: { passed: true, checks: [] } })
  });
  const invalidLoop = createConfirmed(invalidManager, loopInput());
  confirmAction(invalidManager, 'start', invalidLoop.id);
  await waitFor(() => invalidManager.get({ loopId: invalidLoop.id }).loop.status === 'failed', 1000);
  assert.strictEqual(invalidManager.get({ loopId: invalidLoop.id }).loop.terminationReason, 'verifier_invalid');
  fs.rmSync(directory, { recursive: true, force: true });
  fs.rmSync(invalidDirectory, { recursive: true, force: true });
}

async function checkPauseResumeAndTakeover() {
  const directory = temporaryDirectory('loop-pause');
  let firstRelease;
  const firstBlock = new Promise((resolve) => { firstRelease = resolve; });
  const cancelled = [];
  let workerCalls = 0;
  const manager = new LoopManager({
    store: storeFor(directory),
    executeWorker: async (input) => {
      workerCalls += 1;
      input.onAgentStarted('worker_pause_' + String(workerCalls));
      if (workerCalls === 1) await firstBlock;
      return { ok: workerCalls > 1, failureCategory: workerCalls === 1 ? 'cancelled' : '', output: 'done' };
    },
    executeVerifier: async (input) => ({ ok: true, verification: passVerification(input.acceptanceCriteria) }),
    cancelAgent: async (agentId, reason) => { cancelled.push({ agentId, reason }); return { ok: true }; }
  });
  const loop = createConfirmed(manager, loopInput());
  confirmAction(manager, 'start', loop.id);
  await waitFor(() => manager.get({ loopId: loop.id }).loop.activeWorkerAgentId.length > 0, 1000);
  assert.strictEqual(manager.pause({ loopId: loop.id }).ok, true);
  assert.strictEqual(cancelled[0].reason, 'loop_paused');
  firstRelease();
  await waitFor(() => manager.get({ loopId: loop.id }).loop.status === 'paused', 1000);
  confirmAction(manager, 'resume', loop.id);
  await waitFor(() => manager.get({ loopId: loop.id }).loop.status === 'succeeded', 1000);
  assert.strictEqual(manager.get({ loopId: loop.id }).loop.rounds.length, 2);

  const takeoverDirectory = temporaryDirectory('loop-takeover');
  let takeoverRelease;
  const takeoverBlock = new Promise((resolve) => { takeoverRelease = resolve; });
  const takeoverManager = new LoopManager({
    store: storeFor(takeoverDirectory),
    executeWorker: async (input) => {
      input.onAgentStarted('worker_takeover');
      await takeoverBlock;
      return { ok: true, output: 'late' };
    },
    executeVerifier: async (input) => ({ ok: true, verification: passVerification(input.acceptanceCriteria) })
  });
  const takeoverLoop = createConfirmed(takeoverManager, loopInput());
  confirmAction(takeoverManager, 'start', takeoverLoop.id);
  await waitFor(() => takeoverManager.get({ loopId: takeoverLoop.id }).loop.activeWorkerAgentId === 'worker_takeover', 1000);
  const takeover = confirmAction(takeoverManager, 'takeover', takeoverLoop.id);
  assert.strictEqual(takeover.loop.status, 'taken_over');
  assert.strictEqual(takeover.loop.takeoverAgentId, 'worker_takeover');
  takeoverRelease();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(takeoverManager.get({ loopId: takeoverLoop.id }).loop.status, 'taken_over', 'late worker result must not overwrite takeover');
  fs.rmSync(directory, { recursive: true, force: true });
  fs.rmSync(takeoverDirectory, { recursive: true, force: true });
}

async function checkRestartRecoveryAndMaxRounds() {
  const directory = temporaryDirectory('loop-recovery');
  const store = storeFor(directory);
  const manager = new LoopManager({
    store,
    executeWorker: async () => ({ ok: true, output: 'still not done' }),
    executeVerifier: async (input) => ({ ok: true, verification: failVerification(input.acceptanceCriteria, 'again') })
  });
  const loop = createConfirmed(manager, loopInput({ maxRounds: 2 }));
  confirmAction(manager, 'start', loop.id);
  await waitFor(() => manager.get({ loopId: loop.id }).loop.status === 'failed', 1000);
  assert.strictEqual(manager.get({ loopId: loop.id }).loop.terminationReason, 'max_rounds_exhausted');

  const statePath = path.join(store.paths.loops, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.loops[0].status = 'running';
  state.loops[0].activeWorkerAgentId = 'worker_lost';
  state.loops[0].rounds.push({ round: 3, status: 'running', startedAt: new Date().toISOString() });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  const recovered = new LoopManager({ store, executeWorker: async () => ({ ok: true }), executeVerifier: async () => ({ ok: true }) });
  const restored = recovered.get({ loopId: loop.id }).loop;
  assert.strictEqual(restored.status, 'paused');
  assert.strictEqual(restored.terminationReason, 'daemon_restart');
  assert.strictEqual(restored.activeWorkerAgentId, '');
  assert.strictEqual(restored.rounds[restored.rounds.length - 1].status, 'interrupted');
  fs.rmSync(directory, { recursive: true, force: true });
}

async function main() {
  checkVerifierContract();
  await checkRoundsAndRemediation();
  await checkBudgetAndInvalidVerifier();
  await checkPauseResumeAndTakeover();
  await checkRestartRecoveryAndMaxRounds();
  console.log('loop manager smoke passed: verifier=true rounds=true budget=true pause=true resume=true takeover=true restart=true');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
