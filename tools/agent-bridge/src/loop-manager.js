'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomId, writeJsonFileAtomic } = require('./daemon-store');

const STATE_SCHEMA_VERSION = 1;
const PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_LOOPS = 500;
const MAX_ROUNDS = 100;
const MAX_LOGS = 2000;
const MAX_TEXT_BYTES = 128 * 1024;

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function numberValue(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function booleanValue(source, key, fallbackValue) {
  const value = objectValue(source)[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function boundedInteger(value, fallbackValue, minimum, maximum) {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallbackValue;
  return Math.min(Math.max(candidate, minimum), maximum);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function truncateUtf8(value, maximumBytes) {
  const source = typeof value === 'string' ? value : '';
  const buffer = Buffer.from(source, 'utf8');
  if (buffer.length <= maximumBytes) return source;
  let end = maximumBytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString('utf8');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalValue(item)).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalValue(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalValue(value), 'utf8').digest('hex');
}

function failure(action, category, message, remediation) {
  return {
    ok: false,
    action,
    failureCategory: category,
    message,
    remediation: typeof remediation === 'string' ? remediation : '',
    updatedAt: new Date().toISOString()
  };
}

function normalizeCriteria(source) {
  const items = Array.isArray(source) ? source : [];
  const output = [];
  const ids = new Set();
  for (let index = 0; index < items.length && output.length < 20; index += 1) {
    const item = objectValue(items[index]);
    const id = text(item, 'id', 'criterion_' + String(index + 1)).trim();
    const description = text(item, 'description', text(item, 'text', '')).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id) || description.length === 0 || ids.has(id)) {
      throw Object.assign(new Error('Loop acceptance criteria require unique stable ids and descriptions.'), { code: 'loop_criteria_invalid' });
    }
    ids.add(id);
    output.push({ id, description: truncateUtf8(description, 4096) });
  }
  return output;
}

function normalizeBudget(source) {
  const value = objectValue(source);
  const maxTokensRaw = numberValue(value, 'maxTokens', 0);
  const maxCostRaw = numberValue(value, 'maxCost', 0);
  const maxDurationMsRaw = numberValue(value, 'maxDurationMs', 0);
  if (maxTokensRaw < 0 || maxCostRaw < 0 || maxDurationMsRaw < 0) {
    throw Object.assign(new Error('Loop budget limits must be non-negative.'), { code: 'loop_budget_invalid' });
  }
  const currency = text(value, 'currency', '').trim().toUpperCase();
  if (maxCostRaw > 0 && currency.length === 0) {
    throw Object.assign(new Error('Loop cost budget requires a currency.'), { code: 'loop_budget_currency_required' });
  }
  return {
    maxTokens: maxTokensRaw > 0 ? Math.floor(maxTokensRaw) : 0,
    maxCost: maxCostRaw > 0 ? maxCostRaw : 0,
    currency,
    maxDurationMs: maxDurationMsRaw > 0 ? Math.floor(maxDurationMsRaw) : 0
  };
}

function normalizeLoopInput(payload, current, nowMs) {
  const source = objectValue(payload);
  const existing = objectValue(current);
  const prompt = text(source, 'prompt', text(existing, 'prompt', '')).trim();
  const verifyPrompt = text(source, 'verifyPrompt', text(existing, 'verifyPrompt', '')).trim();
  const criteriaSource = Array.isArray(source.acceptanceCriteria) ? source.acceptanceCriteria : existing.acceptanceCriteria;
  const acceptanceCriteria = normalizeCriteria(criteriaSource);
  const workspaceId = text(source, 'workspaceId', text(existing, 'workspaceId', '')).trim();
  const workspacePath = text(source, 'workspacePath', text(source, 'cwd', text(existing, 'workspacePath', ''))).trim();
  if (prompt.length === 0) throw Object.assign(new Error('Loop prompt is required.'), { code: 'loop_prompt_required' });
  if (verifyPrompt.length === 0 && acceptanceCriteria.length === 0) throw Object.assign(new Error('Loop requires verifyPrompt or acceptanceCriteria.'), { code: 'loop_verifier_required' });
  if (workspaceId.length === 0 && workspacePath.length === 0) throw Object.assign(new Error('Loop workspace scope is required.'), { code: 'loop_workspace_required' });
  const status = text(existing, 'status', 'draft');
  return {
    id: text(existing, 'id', randomId('loop')),
    name: text(source, 'name', text(existing, 'name', 'Loop')).trim() || 'Loop',
    prompt: truncateUtf8(prompt, MAX_TEXT_BYTES),
    verifyPrompt: truncateUtf8(verifyPrompt, MAX_TEXT_BYTES),
    acceptanceCriteria,
    workspaceId,
    workspacePath,
    runtimeWorkspaceId: text(existing, 'runtimeWorkspaceId', ''),
    runtimeWorkspacePath: text(existing, 'runtimeWorkspacePath', ''),
    worktreeId: text(existing, 'worktreeId', ''),
    branch: text(existing, 'branch', ''),
    sourceAgentId: text(source, 'sourceAgentId', text(existing, 'sourceAgentId', '')),
    workerProviderId: text(source, 'workerProviderId', text(source, 'providerId', text(existing, 'workerProviderId', 'mock'))),
    workerModelId: text(source, 'workerModelId', text(existing, 'workerModelId', '')),
    verifierProviderId: text(source, 'verifierProviderId', text(existing, 'verifierProviderId', text(source, 'providerId', text(existing, 'workerProviderId', 'mock')))),
    verifierModelId: text(source, 'verifierModelId', text(existing, 'verifierModelId', '')),
    workspaceMode: text(source, 'workspaceMode', text(existing, 'workspaceMode', 'isolated')) === 'shared' ? 'shared' : 'isolated',
    maxRounds: boundedInteger(numberValue(source, 'maxRounds', numberValue(existing, 'maxRounds', 5)), 5, 1, MAX_ROUNDS),
    budget: source.budget && typeof source.budget === 'object' ? normalizeBudget(source.budget) : normalizeBudget(existing.budget),
    status,
    terminationReason: text(existing, 'terminationReason', ''),
    failureCategory: text(existing, 'failureCategory', ''),
    message: text(existing, 'message', ''),
    remediation: text(existing, 'remediation', ''),
    activeWorkerAgentId: text(existing, 'activeWorkerAgentId', ''),
    activeVerifierAgentId: text(existing, 'activeVerifierAgentId', ''),
    takeoverAgentId: text(existing, 'takeoverAgentId', ''),
    generation: boundedInteger(numberValue(existing, 'generation', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    rounds: Array.isArray(existing.rounds) ? existing.rounds.slice(0, MAX_ROUNDS) : [],
    usage: normalizeUsage(existing.usage),
    logs: Array.isArray(existing.logs) ? existing.logs.slice(-MAX_LOGS) : [],
    pauseRequestedAt: text(existing, 'pauseRequestedAt', ''),
    stopRequestedAt: text(existing, 'stopRequestedAt', ''),
    startedAt: text(existing, 'startedAt', ''),
    completedAt: text(existing, 'completedAt', ''),
    createdAt: text(existing, 'createdAt', nowIso(nowMs)),
    updatedAt: nowIso(nowMs),
    revision: boundedInteger(numberValue(existing, 'revision', 0), 0, 0, Number.MAX_SAFE_INTEGER) + 1
  };
}

function normalizeUsage(source) {
  const value = objectValue(source);
  const costByCurrency = {};
  const rawCosts = objectValue(value.costByCurrency);
  for (const currency of Object.keys(rawCosts)) {
    const amount = rawCosts[currency];
    if (/^[A-Z]{3,8}$/.test(currency) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) costByCurrency[currency] = amount;
  }
  return {
    totalTokens: Math.max(0, Math.floor(numberValue(value, 'totalTokens', 0))),
    costByCurrency,
    startedAtMs: Math.max(0, Math.floor(numberValue(value, 'startedAtMs', 0)))
  };
}

function normalizeStoredLoop(source, nowMs) {
  const value = objectValue(source);
  const loop = normalizeLoopInput(value, value, nowMs);
  loop.revision = boundedInteger(numberValue(value, 'revision', 1), 1, 1, Number.MAX_SAFE_INTEGER);
  loop.updatedAt = text(value, 'updatedAt', loop.updatedAt);
  loop.createdAt = text(value, 'createdAt', loop.createdAt);
  if (loop.status === 'running' || loop.status === 'pausing' || loop.status === 'stopping') {
    loop.status = 'paused';
    loop.terminationReason = 'daemon_restart';
    loop.failureCategory = 'loop_interrupted';
    loop.message = 'Loop execution was interrupted by daemon restart and can be resumed.';
    loop.activeWorkerAgentId = '';
    loop.activeVerifierAgentId = '';
    for (const round of loop.rounds) {
      if (round.status === 'running' || round.status === 'verifying') {
        round.status = 'interrupted';
        round.failureCategory = 'daemon_restart';
        round.completedAt = nowIso(nowMs);
      }
    }
  }
  return loop;
}

function normalizeVerification(source, criteria) {
  const value = objectValue(source);
  if (typeof value.passed !== 'boolean') {
    throw Object.assign(new Error('Verifier result must contain a boolean passed field.'), { code: 'loop_verifier_invalid' });
  }
  const checks = [];
  const inputChecks = Array.isArray(value.checks) ? value.checks : [];
  const byId = new Map();
  for (const itemValue of inputChecks) {
    const item = objectValue(itemValue);
    const criterionId = text(item, 'criterionId', text(item, 'id', ''));
    if (criterionId.length === 0 || typeof item.passed !== 'boolean' || byId.has(criterionId)) {
      throw Object.assign(new Error('Verifier checks must use unique criterionId values and boolean passed fields.'), { code: 'loop_verifier_invalid' });
    }
    const check = {
      criterionId,
      passed: item.passed,
      evidence: truncateUtf8(text(item, 'evidence', ''), 8192),
      remediation: truncateUtf8(text(item, 'remediation', ''), 8192)
    };
    byId.set(criterionId, check);
  }
  for (const criterion of criteria) {
    const check = byId.get(criterion.id);
    if (!check) throw Object.assign(new Error('Verifier result omitted acceptance criterion: ' + criterion.id), { code: 'loop_verifier_incomplete' });
    checks.push(check);
  }
  const allChecksPassed = checks.every((item) => item.passed);
  if (value.passed && !allChecksPassed) {
    throw Object.assign(new Error('Verifier passed=true conflicts with a failed acceptance check.'), { code: 'loop_verifier_conflict' });
  }
  return {
    passed: value.passed && allChecksPassed,
    summary: truncateUtf8(text(value, 'summary', ''), 32768),
    remediation: truncateUtf8(text(value, 'remediation', ''), 32768),
    checks
  };
}

class LoopManager {
  constructor(options) {
    const source = objectValue(options);
    this.store = source.store || null;
    this.directory = this.store && this.store.paths ? this.store.paths.loops : path.join(process.cwd(), '.agent-bridge-loops');
    this.statePath = path.join(this.directory, 'state.json');
    this.executeWorker = typeof source.executeWorker === 'function' ? source.executeWorker : null;
    this.executeVerifier = typeof source.executeVerifier === 'function' ? source.executeVerifier : null;
    this.cancelAgent = typeof source.cancelAgent === 'function' ? source.cancelAgent : async () => ({ ok: true });
    this.onUpdated = typeof source.onUpdated === 'function' ? source.onUpdated : () => {};
    this.clock = typeof source.clock === 'function' ? source.clock : () => Date.now();
    this.loops = new Map();
    this.running = new Map();
    this.plans = new Map();
    this.loadWarnings = [];
    fs.mkdirSync(this.directory, { recursive: true });
    this.load();
  }

  isAvailable() {
    return this.executeWorker !== null && this.executeVerifier !== null;
  }

  load() {
    if (!fs.existsSync(this.statePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const source = objectValue(parsed);
      for (const item of Array.isArray(source.loops) ? source.loops.slice(0, MAX_LOOPS) : []) {
        try {
          const loop = normalizeStoredLoop(item, this.clock());
          this.loops.set(loop.id, loop);
        } catch (error) {
          this.loadWarnings.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (this.loops.size > 0) this.persist();
    } catch (_error) {
      this.loadWarnings.push('Loop state was corrupt and was ignored.');
    }
  }

  persist() {
    writeJsonFileAtomic(this.statePath, {
      schemaVersion: STATE_SCHEMA_VERSION,
      loops: Array.from(this.loops.values()),
      updatedAt: nowIso(this.clock())
    });
  }

  status() {
    return {
      ok: true,
      action: 'loop.status',
      available: this.isAvailable(),
      loops: this.loops.size,
      running: this.running.size,
      paused: Array.from(this.loops.values()).filter((item) => item.status === 'paused').length,
      warnings: this.loadWarnings.slice(),
      updatedAt: nowIso(this.clock())
    };
  }

  list(payload) {
    const query = text(payload, 'query', '').trim().toLowerCase();
    const status = text(payload, 'status', '');
    const loops = Array.from(this.loops.values())
      .filter((item) => status.length === 0 || item.status === status)
      .filter((item) => query.length === 0 || item.name.toLowerCase().includes(query) || item.prompt.toLowerCase().includes(query))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((item) => this.publicLoop(item, false));
    return { ok: true, action: 'loop.list', loops, total: loops.length, updatedAt: nowIso(this.clock()) };
  }

  get(payload) {
    const loop = this.find(payload);
    if (!loop) return failure('loop.get', 'loop_not_found', 'Loop was not found.');
    return { ok: true, action: 'loop.get', loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  rounds(payload) {
    const loop = this.find(payload);
    if (!loop) return failure('loop.rounds', 'loop_not_found', 'Loop was not found.');
    const offset = boundedInteger(numberValue(payload, 'offset', 0), 0, 0, loop.rounds.length);
    const limit = boundedInteger(numberValue(payload, 'limit', 20), 20, 1, 100);
    const rounds = loop.rounds.slice(offset, offset + limit).map((item) => cloneJson(item));
    return { ok: true, action: 'loop.rounds', loopId: loop.id, rounds, nextOffset: offset + rounds.length < loop.rounds.length ? offset + rounds.length : 0, updatedAt: nowIso(this.clock()) };
  }

  create(payload) {
    const action = 'loop.create';
    if (!booleanValue(payload, 'confirm', false)) {
      try {
        const loop = normalizeLoopInput(payload, null, this.clock());
        const plan = this.createPlan(action, loop.id, { loop });
        return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(loop, true), warnings: [], updatedAt: nowIso(this.clock()) };
      } catch (error) {
        return this.failureFromError(action, error);
      }
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), '');
    if (!consumed.ok) return consumed;
    const loop = consumed.plan.binding.loop;
    if (this.loops.size >= MAX_LOOPS) return failure(action, 'loop_limit_reached', 'Loop storage limit was reached.');
    this.loops.set(loop.id, loop);
    this.persist();
    this.emit('created', loop, {});
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  update(payload) {
    const action = 'loop.update';
    const current = this.find(payload);
    if (!current) return failure(action, 'loop_not_found', 'Loop was not found.');
    if (this.running.has(current.id)) return failure(action, 'loop_running', 'A running Loop cannot be edited.', 'Pause or stop the Loop first.');
    if (!booleanValue(payload, 'confirm', false)) {
      try {
        const next = normalizeLoopInput(payload, current, this.clock());
        const plan = this.createPlan(action, current.id, { loop: next, expectedRevision: current.revision });
        return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(next, true), updatedAt: nowIso(this.clock()) };
      } catch (error) {
        return this.failureFromError(action, error);
      }
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), current.id);
    if (!consumed.ok) return consumed;
    if (current.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Loop changed after preview.', 'Preview the update again.');
    const next = consumed.plan.binding.loop;
    this.loops.set(next.id, next);
    this.persist();
    this.emit('updated', next, {});
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loop: this.publicLoop(next, true), updatedAt: nowIso(this.clock()) };
  }

  start(payload) {
    return this.startOrResume(payload, false);
  }

  resume(payload) {
    return this.startOrResume(payload, true);
  }

  startOrResume(payload, resume) {
    const action = resume ? 'loop.resume' : 'loop.start';
    const loop = this.find(payload);
    if (!loop) return failure(action, 'loop_not_found', 'Loop was not found.');
    const allowed = resume ? loop.status === 'paused' : ['draft', 'failed', 'stopped'].includes(loop.status);
    if (!allowed || this.running.has(loop.id)) return failure(action, 'loop_state_invalid', 'Loop cannot start from its current state.');
    if (!this.isAvailable()) return failure(action, 'capability_unavailable', 'Loop Agent execution is unavailable.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, loop.id, { expectedRevision: loop.revision, resume });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), loop.id);
    if (!consumed.ok) return consumed;
    if (loop.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Loop changed after preview.', 'Preview the operation again.');
    const previousStatus = loop.status;
    loop.status = 'running';
    loop.terminationReason = '';
    loop.failureCategory = '';
    loop.message = '';
    loop.remediation = '';
    loop.pauseRequestedAt = '';
    loop.stopRequestedAt = '';
    loop.completedAt = '';
    loop.startedAt = loop.startedAt || nowIso(this.clock());
    if (!resume && (previousStatus === 'failed' || previousStatus === 'stopped')) {
      loop.rounds = [];
      loop.logs = [];
      loop.usage = normalizeUsage({ startedAtMs: this.clock() });
      loop.startedAt = nowIso(this.clock());
    }
    if (!loop.usage.startedAtMs) loop.usage.startedAtMs = this.clock();
    loop.generation += 1;
    loop.revision += 1;
    loop.updatedAt = nowIso(this.clock());
    const generation = loop.generation;
    const promise = this.run(loop, generation).finally(() => {
      const active = this.running.get(loop.id);
      if (active && active.generation === generation) this.running.delete(loop.id);
    });
    this.running.set(loop.id, { generation, promise });
    this.persist();
    this.emit(resume ? 'resumed' : 'started', loop, {});
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  pause(payload) {
    const action = 'loop.pause';
    const loop = this.find(payload);
    if (!loop) return failure(action, 'loop_not_found', 'Loop was not found.');
    if (loop.status !== 'running') return failure(action, 'loop_state_invalid', 'Only a running Loop can be paused.');
    loop.status = 'pausing';
    loop.pauseRequestedAt = nowIso(this.clock());
    loop.updatedAt = loop.pauseRequestedAt;
    loop.revision += 1;
    const agentId = loop.activeVerifierAgentId || loop.activeWorkerAgentId;
    if (agentId.length > 0) void this.cancelAgent(agentId, 'loop_paused');
    this.persist();
    this.emit('pausing', loop, {});
    return { ok: true, action, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  stop(payload) {
    const action = 'loop.stop';
    const loop = this.find(payload);
    if (!loop) return failure(action, 'loop_not_found', 'Loop was not found.');
    if (!['running', 'pausing', 'paused'].includes(loop.status)) return failure(action, 'loop_state_invalid', 'Loop is not active.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, loop.id, { expectedRevision: loop.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), loop.id);
    if (!consumed.ok) return consumed;
    if (loop.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Loop changed after preview.', 'Preview stop again.');
    loop.status = 'stopping';
    loop.stopRequestedAt = nowIso(this.clock());
    loop.updatedAt = loop.stopRequestedAt;
    loop.revision += 1;
    const agentId = loop.activeVerifierAgentId || loop.activeWorkerAgentId;
    if (agentId.length > 0) void this.cancelAgent(agentId, 'loop_stopped');
    if (!this.running.has(loop.id)) this.finish(loop, 'stopped', 'user_stopped', '', 'Loop stopped by user.');
    else {
      this.persist();
      this.emit('stopping', loop, {});
    }
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  takeover(payload) {
    const action = 'loop.takeover';
    const loop = this.find(payload);
    if (!loop) return failure(action, 'loop_not_found', 'Loop was not found.');
    if (!['running', 'pausing', 'paused'].includes(loop.status)) return failure(action, 'loop_state_invalid', 'Loop is not available for takeover.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, loop.id, { expectedRevision: loop.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), loop.id);
    if (!consumed.ok) return consumed;
    if (loop.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Loop changed after preview.', 'Preview takeover again.');
    loop.takeoverAgentId = loop.activeVerifierAgentId || loop.activeWorkerAgentId;
    loop.generation += 1;
    this.finish(loop, 'taken_over', 'human_takeover', '', 'Loop automation stopped for human takeover.');
    this.running.delete(loop.id);
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loop: this.publicLoop(loop, true), updatedAt: nowIso(this.clock()) };
  }

  remove(payload) {
    const action = 'loop.remove';
    const loop = this.find(payload);
    if (!loop) return failure(action, 'loop_not_found', 'Loop was not found.');
    if (this.running.has(loop.id) || ['running', 'pausing', 'stopping'].includes(loop.status)) return failure(action, 'loop_running', 'An active Loop cannot be removed.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, loop.id, { expectedRevision: loop.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, loop: this.publicLoop(loop, false), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), loop.id);
    if (!consumed.ok) return consumed;
    if (loop.revision !== consumed.plan.binding.expectedRevision) return failure(action, 'plan_stale', 'Loop changed after preview.', 'Preview removal again.');
    this.loops.delete(loop.id);
    this.persist();
    this.emit('removed', loop, { loopId: loop.id });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, loopId: loop.id, updatedAt: nowIso(this.clock()) };
  }

  async run(loop, generation) {
    let remediation = loop.remediation;
    while (loop.rounds.length < loop.maxRounds) {
      if (!this.isCurrent(loop, generation)) return;
      if (this.handleRequestedState(loop)) return;
      const budgetFailure = this.budgetFailure(loop);
      if (budgetFailure) {
        this.finish(loop, 'failed', 'budget_exhausted', 'loop_budget_exhausted', budgetFailure);
        return;
      }
      const roundNumber = loop.rounds.length + 1;
      const round = {
        round: roundNumber,
        status: 'running',
        workerAgentId: '',
        verifierAgentId: '',
        workerOutput: '',
        verification: null,
        usage: { worker: null, verifier: null },
        failureCategory: '',
        message: '',
        startedAt: nowIso(this.clock()),
        completedAt: ''
      };
      loop.rounds.push(round);
      this.log(loop, 'loop', 'Round ' + String(roundNumber) + ' started.');
      this.persistAndEmit('round.started', loop, { round: cloneJson(round) });
      let workerResult;
      try {
        workerResult = await this.executeWorker({
          loop: this.publicLoop(loop, false),
          round: roundNumber,
          prompt: loop.prompt,
          remediation,
          workspaceMode: loop.workspaceMode,
          generation,
          onAgentStarted: (agentId) => {
            if (!this.isCurrent(loop, generation)) return;
            round.workerAgentId = typeof agentId === 'string' ? agentId : '';
            loop.activeWorkerAgentId = round.workerAgentId;
            this.persistAndEmit('worker.started', loop, { round: cloneJson(round) });
          }
        });
      } catch (error) {
        workerResult = { ok: false, failureCategory: error && typeof error.code === 'string' ? error.code : 'worker_failed', message: error instanceof Error ? error.message : String(error) };
      }
      if (!this.isCurrent(loop, generation)) return;
      round.workerAgentId = text(workerResult, 'agentId', '');
      loop.sourceAgentId = text(workerResult, 'sourceAgentId', loop.sourceAgentId);
      loop.runtimeWorkspaceId = text(workerResult, 'runtimeWorkspaceId', loop.runtimeWorkspaceId);
      loop.runtimeWorkspacePath = text(workerResult, 'runtimeWorkspacePath', loop.runtimeWorkspacePath);
      loop.worktreeId = text(workerResult, 'worktreeId', loop.worktreeId);
      loop.branch = text(workerResult, 'branch', loop.branch);
      loop.activeWorkerAgentId = round.workerAgentId;
      if (this.handleRequestedState(loop, round)) return;
      if (!workerResult || workerResult.ok === false) {
        round.status = 'failed';
        round.failureCategory = text(workerResult, 'failureCategory', 'worker_failed');
        round.message = text(workerResult, 'message', 'Loop worker failed.');
        round.completedAt = nowIso(this.clock());
        this.finish(loop, 'failed', 'worker_failed', round.failureCategory, round.message);
        return;
      }
      round.workerOutput = truncateUtf8(text(workerResult, 'output', text(workerResult, 'message', '')), MAX_TEXT_BYTES);
      round.usage.worker = this.applyUsage(loop, workerResult.usage);
      loop.activeWorkerAgentId = '';
      const postWorkerBudget = this.budgetFailure(loop);
      if (postWorkerBudget) {
        round.status = 'failed';
        round.failureCategory = 'loop_budget_exhausted';
        round.message = postWorkerBudget;
        round.completedAt = nowIso(this.clock());
        this.finish(loop, 'failed', 'budget_exhausted', 'loop_budget_exhausted', postWorkerBudget);
        return;
      }

      round.status = 'verifying';
      this.persistAndEmit('round.verifying', loop, { round: cloneJson(round) });
      let verifierResult;
      try {
        verifierResult = await this.executeVerifier({
          loop: this.publicLoop(loop, false),
          round: roundNumber,
          workerOutput: round.workerOutput,
          verifyPrompt: loop.verifyPrompt,
          acceptanceCriteria: cloneJson(loop.acceptanceCriteria),
          generation,
          onAgentStarted: (agentId) => {
            if (!this.isCurrent(loop, generation)) return;
            round.verifierAgentId = typeof agentId === 'string' ? agentId : '';
            loop.activeVerifierAgentId = round.verifierAgentId;
            this.persistAndEmit('verifier.started', loop, { round: cloneJson(round) });
          }
        });
      } catch (error) {
        verifierResult = { ok: false, failureCategory: error && typeof error.code === 'string' ? error.code : 'verifier_failed', message: error instanceof Error ? error.message : String(error) };
      }
      if (!this.isCurrent(loop, generation)) return;
      round.verifierAgentId = text(verifierResult, 'agentId', '');
      loop.sourceAgentId = text(verifierResult, 'sourceAgentId', loop.sourceAgentId);
      loop.runtimeWorkspaceId = text(verifierResult, 'runtimeWorkspaceId', loop.runtimeWorkspaceId);
      loop.runtimeWorkspacePath = text(verifierResult, 'runtimeWorkspacePath', loop.runtimeWorkspacePath);
      loop.activeVerifierAgentId = round.verifierAgentId;
      if (this.handleRequestedState(loop, round)) return;
      if (!verifierResult || verifierResult.ok === false) {
        round.status = 'failed';
        round.failureCategory = text(verifierResult, 'failureCategory', 'verifier_failed');
        round.message = text(verifierResult, 'message', 'Loop verifier failed.');
        round.completedAt = nowIso(this.clock());
        this.finish(loop, 'failed', 'verifier_failed', round.failureCategory, round.message);
        return;
      }
      try {
        round.verification = normalizeVerification(verifierResult.verification || verifierResult.result, loop.acceptanceCriteria);
      } catch (error) {
        round.status = 'failed';
        round.failureCategory = error && typeof error.code === 'string' ? error.code : 'loop_verifier_invalid';
        round.message = error instanceof Error ? error.message : String(error);
        round.completedAt = nowIso(this.clock());
        this.finish(loop, 'failed', 'verifier_invalid', round.failureCategory, round.message);
        return;
      }
      round.usage.verifier = this.applyUsage(loop, verifierResult.usage);
      loop.activeVerifierAgentId = '';
      const postVerifierBudget = this.budgetFailure(loop);
      if (postVerifierBudget) {
        round.status = 'failed';
        round.failureCategory = 'loop_budget_exhausted';
        round.message = postVerifierBudget;
        round.completedAt = nowIso(this.clock());
        this.finish(loop, 'failed', 'budget_exhausted', 'loop_budget_exhausted', postVerifierBudget);
        return;
      }
      round.status = 'succeeded';
      round.completedAt = nowIso(this.clock());
      remediation = round.verification.remediation;
      loop.remediation = remediation;
      this.persistAndEmit('round.completed', loop, { round: cloneJson(round) });
      if (round.verification.passed) {
        this.finish(loop, 'succeeded', 'accepted', '', round.verification.summary || 'Loop acceptance criteria passed.');
        return;
      }
    }
    this.finish(loop, 'failed', 'max_rounds_exhausted', 'loop_max_rounds', 'Loop reached its maximum number of rounds without passing verification.');
  }

  handleRequestedState(loop, round) {
    if (loop.status === 'stopping' || loop.stopRequestedAt.length > 0) {
      if (round) {
        round.status = 'stopped';
        round.failureCategory = 'loop_stopped';
        round.message = 'Loop stopped by user.';
        round.completedAt = nowIso(this.clock());
      }
      this.finish(loop, 'stopped', 'user_stopped', '', 'Loop stopped by user.');
      return true;
    }
    if (loop.status === 'pausing' || loop.pauseRequestedAt.length > 0) {
      if (round) {
        round.status = 'paused';
        round.failureCategory = 'loop_paused';
        round.message = 'Loop paused by user.';
        round.completedAt = nowIso(this.clock());
      }
      loop.status = 'paused';
      loop.terminationReason = 'user_paused';
      loop.activeWorkerAgentId = '';
      loop.activeVerifierAgentId = '';
      loop.updatedAt = nowIso(this.clock());
      loop.revision += 1;
      this.persistAndEmit('paused', loop, {});
      return true;
    }
    return false;
  }

  budgetFailure(loop) {
    const budget = loop.budget;
    if (budget.maxTokens > 0 && loop.usage.totalTokens >= budget.maxTokens) return 'Loop token budget was exhausted.';
    if (budget.maxCost > 0 && numberValue(loop.usage.costByCurrency, budget.currency, 0) >= budget.maxCost) return 'Loop cost budget was exhausted.';
    if (budget.maxDurationMs > 0 && loop.usage.startedAtMs > 0 && this.clock() - loop.usage.startedAtMs >= budget.maxDurationMs) return 'Loop duration budget was exhausted.';
    return '';
  }

  applyUsage(loop, source) {
    const value = objectValue(source);
    const tokens = Math.max(0, Math.floor(numberValue(value, 'totalTokens', numberValue(value, 'tokens', 0))));
    const cost = Math.max(0, numberValue(value, 'cost', 0));
    const currency = text(value, 'currency', '').toUpperCase();
    loop.usage.totalTokens += tokens;
    if (cost > 0 && currency.length > 0) loop.usage.costByCurrency[currency] = numberValue(loop.usage.costByCurrency, currency, 0) + cost;
    return { totalTokens: tokens, cost, currency, estimated: booleanValue(value, 'estimated', false) };
  }

  finish(loop, status, reason, failureCategory, message) {
    loop.status = status;
    loop.terminationReason = reason;
    loop.failureCategory = failureCategory;
    loop.message = truncateUtf8(message, 32768);
    loop.activeWorkerAgentId = '';
    loop.activeVerifierAgentId = '';
    loop.pauseRequestedAt = '';
    loop.stopRequestedAt = '';
    loop.completedAt = nowIso(this.clock());
    loop.updatedAt = loop.completedAt;
    loop.revision += 1;
    this.log(loop, 'loop', 'Loop finished: ' + status + ' (' + reason + ').');
    this.persistAndEmit('completed', loop, {});
  }

  isCurrent(loop, generation) {
    return loop.generation === generation && loop.status !== 'taken_over';
  }

  log(loop, source, message) {
    loop.logs.push({ id: randomId('loop_log'), source, message: truncateUtf8(message, 8192), createdAt: nowIso(this.clock()) });
    if (loop.logs.length > MAX_LOGS) loop.logs.splice(0, loop.logs.length - MAX_LOGS);
  }

  persistAndEmit(kind, loop, extra) {
    loop.updatedAt = nowIso(this.clock());
    this.persist();
    this.emit(kind, loop, extra);
  }

  emit(kind, loop, extra) {
    try {
      this.onUpdated(Object.assign({ kind, loopId: loop.id, loop: this.publicLoop(loop, false), updatedAt: nowIso(this.clock()) }, extra || {}));
    } catch (_error) {
      // Persisted state remains authoritative.
    }
  }

  find(payload) {
    const id = text(payload, 'loopId', text(payload, 'id', ''));
    return id.length > 0 ? this.loops.get(id) || null : null;
  }

  publicLoop(loop, includeDetails) {
    const value = cloneJson(loop);
    if (!includeDetails) {
      value.rounds = [];
      value.logs = [];
    }
    value.running = this.running.has(loop.id);
    value.resumeAvailable = loop.status === 'paused';
    return value;
  }

  createPlan(action, targetId, binding) {
    this.cleanupPlans();
    const plan = {
      planId: randomId('loop_plan'),
      action,
      targetId,
      digest: sha256(binding),
      binding: cloneJson(binding),
      expiresAt: this.clock() + PLAN_TTL_MS
    };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  consumePlan(action, planId, targetId) {
    this.cleanupPlans();
    if (planId.length === 0) return failure(action, 'confirmation_required', 'A preview planId is required.', 'Preview the operation first.');
    const plan = this.plans.get(planId);
    if (!plan) return failure(action, 'plan_expired', 'Loop operation plan is missing or expired.', 'Preview the operation again.');
    if (plan.action !== action || (targetId.length > 0 && plan.targetId !== targetId) || plan.digest !== sha256(plan.binding)) return failure(action, 'plan_stale', 'Loop operation plan does not match current state.', 'Preview the operation again.');
    this.plans.delete(planId);
    return { ok: true, plan };
  }

  cleanupPlans() {
    const nowMs = this.clock();
    for (const [id, plan] of this.plans.entries()) if (plan.expiresAt <= nowMs) this.plans.delete(id);
  }

  failureFromError(action, error) {
    return failure(action, error && typeof error.code === 'string' ? error.code : 'loop_invalid', error instanceof Error ? error.message : String(error));
  }
}

module.exports = {
  LoopManager,
  normalizeVerification
};
