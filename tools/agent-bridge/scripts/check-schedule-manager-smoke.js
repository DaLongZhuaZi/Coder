'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ScheduleManager, parseCronExpression, nextCronOccurrence } = require('../src/schedule-manager');

function temporaryDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-' + name + '-'));
}

function storeFor(directory) {
  const schedules = path.join(directory, 'schedules');
  fs.mkdirSync(schedules, { recursive: true });
  return { paths: { schedules } };
}

function scheduleInput(overrides) {
  return Object.assign({
    name: 'Nightly review',
    prompt: 'Review the workspace and report actionable findings.',
    workspacePath: process.cwd(),
    providerId: 'mock',
    cadence: { type: 'cron', expression: '*/5 * * * *', timezone: 'UTC' },
    retry: { maxAttempts: 2, initialDelayMs: 0, backoffMultiplier: 2 },
    retention: { maxRuns: 10, maxAgeDays: 30 },
    concurrency: { limit: 1, overlapPolicy: 'skip' },
    missedRunPolicy: 'run_once'
  }, overrides || {});
}

function createConfirmed(manager, input) {
  const preview = manager.create(input);
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.preview, true);
  assert.strictEqual(manager.list({}).schedules.length, 0, 'preview must not persist');
  const confirmed = manager.create({ confirm: true, planId: preview.planId });
  assert.strictEqual(confirmed.ok, true);
  assert.strictEqual(confirmed.confirmed, true);
  return confirmed.schedule;
}

function runNowConfirmed(manager, scheduleId) {
  const preview = manager.runNow({ scheduleId });
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.preview, true);
  return manager.runNow({ scheduleId, confirm: true, planId: preview.planId });
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for schedule state.');
}

function checkCronAndDst() {
  const stepped = parseCronExpression('5/10 * * * *');
  assert.strictEqual(stepped.minute.values.has(5), true);
  assert.strictEqual(stepped.minute.values.has(15), true);
  assert.strictEqual(stepped.minute.values.has(55), true);
  const sundayAlias = parseCronExpression('0 9 * * 5-7');
  assert.strictEqual(sundayAlias.dayOfWeek.values.has(5), true);
  assert.strictEqual(sundayAlias.dayOfWeek.values.has(6), true);
  assert.strictEqual(sundayAlias.dayOfWeek.values.has(0), true);

  const spring = nextCronOccurrence(
    { type: 'cron', expression: '30 2 * * *', timezone: 'America/New_York' },
    Date.parse('2026-03-08T06:59:00.000Z'),
    ''
  );
  assert.strictEqual(spring.at, '2026-03-09T06:30:00.000Z', 'nonexistent DST minute should be skipped');

  const firstFall = nextCronOccurrence(
    { type: 'cron', expression: '30 1 * * *', timezone: 'America/New_York' },
    Date.parse('2026-11-01T04:59:00.000Z'),
    ''
  );
  assert.strictEqual(firstFall.at, '2026-11-01T05:30:00.000Z');
  const afterFall = nextCronOccurrence(
    { type: 'cron', expression: '30 1 * * *', timezone: 'America/New_York' },
    Date.parse(firstFall.at),
    '2026-11-01-01-30'
  );
  assert.strictEqual(afterFall.at, '2026-11-02T06:30:00.000Z', 'repeated DST local minute should run once');
}

async function checkLifecycleRetryAndPersistence() {
  const directory = temporaryDirectory('schedule-lifecycle');
  let attempts = 0;
  const updates = [];
  const manager = new ScheduleManager({
    store: storeFor(directory),
    execute: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, failureCategory: 'provider_busy', message: 'busy' };
      return { ok: true, agentId: 'agt_schedule', sessionId: 'ses_schedule', message: 'done' };
    },
    sleep: async () => {},
    onUpdated: (event) => updates.push(event)
  });
  const schedule = createConfirmed(manager, scheduleInput());
  assert.strictEqual(manager.create({ confirm: true, planId: 'missing' }).failureCategory, 'plan_expired');

  const started = runNowConfirmed(manager, schedule.id);
  assert.strictEqual(started.ok, true);
  await waitFor(() => manager.history({ scheduleId: schedule.id }).runs.some((item) => item.status === 'succeeded'), 1000);
  const run = manager.history({ scheduleId: schedule.id }).runs[0];
  assert.strictEqual(run.attempts.length, 2);
  assert.strictEqual(run.agentId, 'agt_schedule');
  assert.strictEqual(attempts, 2);
  assert.strictEqual(updates.some((item) => item.kind === 'run.completed'), true);

  const reloaded = new ScheduleManager({ store: storeFor(directory), execute: async () => ({ ok: true }) });
  const restored = reloaded.get({ scheduleId: schedule.id });
  assert.strictEqual(restored.ok, true);
  assert.strictEqual(restored.schedule.revision, schedule.revision, 'load must preserve revision');
  assert.strictEqual(restored.schedule.nextRunAt, manager.get({ scheduleId: schedule.id }).schedule.nextRunAt, 'load must preserve nextRunAt');
  fs.rmSync(directory, { recursive: true, force: true });
}

async function checkConcurrencyAndLease() {
  const directory = temporaryDirectory('schedule-concurrency');
  let releaseFirst;
  const blocker = new Promise((resolve) => { releaseFirst = resolve; });
  const manager = new ScheduleManager({
    store: storeFor(directory),
    execute: async () => {
      await blocker;
      return { ok: true };
    }
  });
  const schedule = createConfirmed(manager, scheduleInput({ retry: { maxAttempts: 1 }, concurrency: { limit: 1, overlapPolicy: 'skip' } }));
  const first = runNowConfirmed(manager, schedule.id);
  assert.strictEqual(first.run.status, 'running');
  const second = runNowConfirmed(manager, schedule.id);
  assert.strictEqual(second.run.status, 'skipped');
  assert.strictEqual(second.run.failureCategory, 'concurrency_limit');
  releaseFirst();
  await waitFor(() => manager.history({ scheduleId: schedule.id }).runs.some((item) => item.id === first.run.id && item.status === 'succeeded'), 1000);

  const leader = new ScheduleManager({ store: storeFor(directory), execute: async () => ({ ok: true }), tickIntervalMs: 60000 });
  const follower = new ScheduleManager({ store: storeFor(directory), execute: async () => ({ ok: true }), tickIntervalMs: 60000 });
  assert.strictEqual(leader.start().leader, true);
  assert.strictEqual(follower.start().leader, false, 'only one manager may own the schedule lease');
  leader.shutdown();
  follower.shutdown();
  fs.rmSync(directory, { recursive: true, force: true });
}

async function checkMissedRunAndRestartRecovery() {
  const directory = temporaryDirectory('schedule-recovery');
  let nowMs = Date.parse('2026-07-15T10:00:00.000Z');
  let executions = 0;
  const store = storeFor(directory);
  const seed = new ScheduleManager({ store, execute: async () => ({ ok: true }), clock: () => nowMs });
  const schedule = createConfirmed(seed, scheduleInput({ cadence: { type: 'cron', expression: '*/5 * * * *', timezone: 'UTC' } }));
  const statePath = path.join(store.paths.schedules, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.schedules[0].nextRunAt = '2026-07-15T09:00:00.000Z';
  state.runs.push({
    id: 'run_interrupted', scheduleId: schedule.id, reason: 'scheduled', scheduledFor: '2026-07-15T08:00:00.000Z',
    status: 'running', attempts: [], createdAt: '2026-07-15T08:00:00.000Z', updatedAt: '2026-07-15T08:00:00.000Z'
  });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

  const recovered = new ScheduleManager({
    store,
    execute: async () => { executions += 1; return { ok: true }; },
    clock: () => nowMs,
    tickIntervalMs: 60000
  });
  assert.strictEqual(recovered.history({ scheduleId: schedule.id }).runs.some((item) => item.id === 'run_interrupted' && item.status === 'interrupted'), true);
  recovered.start();
  await waitFor(() => executions === 1, 1000);
  await waitFor(() => recovered.history({ scheduleId: schedule.id }).runs.some((item) => item.reason === 'missed_run' && item.status === 'succeeded'), 1000);
  recovered.shutdown();
  fs.rmSync(directory, { recursive: true, force: true });
}

async function main() {
  checkCronAndDst();
  await checkLifecycleRetryAndPersistence();
  await checkConcurrencyAndLease();
  await checkMissedRunAndRestartRecovery();
  console.log('schedule manager smoke passed: cron=true dst=true retry=true concurrency=true lease=true recovery=true');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
