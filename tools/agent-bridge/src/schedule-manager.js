'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomId, writeJsonFileAtomic } = require('./daemon-store');

const STATE_SCHEMA_VERSION = 1;
const PLAN_TTL_MS = 5 * 60 * 1000;
const LEASE_TTL_MS = 45 * 1000;
const DEFAULT_TICK_INTERVAL_MS = 15 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_CRON_SEARCH_MINUTES = 370 * 24 * 60;
const MAX_CATCH_UP_RUNS = 10;
const MAX_HISTORY_LIMIT = 500;
const zonedFormatterCache = new Map();

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

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function publicFailure(action, failureCategory, message, remediation) {
  return {
    ok: false,
    action,
    failureCategory,
    message,
    remediation: typeof remediation === 'string' ? remediation : '',
    updatedAt: new Date().toISOString()
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalValue(item)).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalValue(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalValue(value), 'utf8').digest('hex');
}

function validateTimeZone(timeZone) {
  const value = typeof timeZone === 'string' && timeZone.trim().length > 0 ? timeZone.trim() : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return value;
  } catch (_error) {
    throw Object.assign(new Error('Schedule timezone is not a valid IANA timezone.'), { code: 'schedule_timezone_invalid' });
  }
}

function normalizeCronNumber(value, minimum, maximum, dayOfWeek) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw Object.assign(new Error('Cron field contains a non-numeric value.'), { code: 'schedule_cron_invalid' });
  }
  if (parsed < minimum || parsed > maximum) {
    throw Object.assign(new Error('Cron field value is outside its allowed range.'), { code: 'schedule_cron_invalid' });
  }
  return parsed;
}

function parseCronField(source, minimum, maximum, dayOfWeek) {
  const raw = typeof source === 'string' ? source.trim() : '';
  if (raw.length === 0) {
    throw Object.assign(new Error('Cron field is empty.'), { code: 'schedule_cron_invalid' });
  }
  const values = new Set();
  const tokens = raw.split(',');
  for (const tokenValue of tokens) {
    const token = tokenValue.trim();
    if (token.length === 0) {
      throw Object.assign(new Error('Cron field contains an empty list item.'), { code: 'schedule_cron_invalid' });
    }
    const stepParts = token.split('/');
    if (stepParts.length > 2) {
      throw Object.assign(new Error('Cron field contains an invalid step.'), { code: 'schedule_cron_invalid' });
    }
    const base = stepParts[0];
    const step = stepParts.length === 2 ? normalizeCronNumber(stepParts[1], 1, maximum - minimum + 1, false) : 1;
    let start = minimum;
    let end = maximum;
    if (base !== '*') {
      const rangeParts = base.split('-');
      if (rangeParts.length === 1) {
        start = normalizeCronNumber(rangeParts[0], minimum, maximum, dayOfWeek);
        end = stepParts.length === 2 ? maximum : start;
      } else if (rangeParts.length === 2) {
        start = normalizeCronNumber(rangeParts[0], minimum, maximum, dayOfWeek);
        end = normalizeCronNumber(rangeParts[1], minimum, maximum, dayOfWeek);
        if (end < start) {
          throw Object.assign(new Error('Cron ranges must be ascending.'), { code: 'schedule_cron_invalid' });
        }
      } else {
        throw Object.assign(new Error('Cron field contains an invalid range.'), { code: 'schedule_cron_invalid' });
      }
    }
    for (let value = start; value <= end; value += step) {
      values.add(dayOfWeek && value === 7 ? 0 : value);
    }
  }
  return { values, wildcard: raw === '*' || raw.startsWith('*/') };
}

function parseCronExpression(expression) {
  const normalized = typeof expression === 'string' ? expression.trim().replace(/\s+/g, ' ') : '';
  const parts = normalized.split(' ');
  if (parts.length !== 5) {
    throw Object.assign(new Error('Schedule cron must contain five fields.'), { code: 'schedule_cron_invalid' });
  }
  return {
    expression: normalized,
    minute: parseCronField(parts[0], 0, 59, false),
    hour: parseCronField(parts[1], 0, 23, false),
    dayOfMonth: parseCronField(parts[2], 1, 31, false),
    month: parseCronField(parts[3], 1, 12, false),
    dayOfWeek: parseCronField(parts[4], 0, 7, true)
  };
}

function zonedDateParts(date, timeZone) {
  let formatter = zonedFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
      timeZone,
      hour12: false,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    zonedFormatterCache.set(timeZone, formatter);
  }
  const output = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') output[part.type] = part.value;
  }
  const year = Number.parseInt(output.year, 10);
  const month = Number.parseInt(output.month, 10);
  const day = Number.parseInt(output.day, 10);
  let hour = Number.parseInt(output.hour, 10);
  if (hour === 24) hour = 0;
  const minute = Number.parseInt(output.minute, 10);
  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    localKey: [year, month, day, hour, minute].map((value) => String(value).padStart(2, '0')).join('-')
  };
}

function cronMatches(parsed, parts) {
  if (!parsed.minute.values.has(parts.minute) || !parsed.hour.values.has(parts.hour) || !parsed.month.values.has(parts.month)) {
    return false;
  }
  const dayOfMonthMatches = parsed.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatches = parsed.dayOfWeek.values.has(parts.dayOfWeek);
  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) return true;
  if (parsed.dayOfMonth.wildcard) return dayOfWeekMatches;
  if (parsed.dayOfWeek.wildcard) return dayOfMonthMatches;
  return dayOfMonthMatches || dayOfWeekMatches;
}

function nextCronOccurrence(cadence, afterMs, excludedLocalKey) {
  const expression = text(cadence, 'expression', '');
  const timeZone = validateTimeZone(text(cadence, 'timezone', 'UTC'));
  const parsed = parseCronExpression(expression);
  let candidateMs = Math.floor(afterMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  for (let index = 0; index < MAX_CRON_SEARCH_MINUTES; index += 1) {
    const parts = zonedDateParts(new Date(candidateMs), timeZone);
    if (parts.localKey !== excludedLocalKey && cronMatches(parsed, parts)) {
      return { at: new Date(candidateMs).toISOString(), localKey: parts.localKey };
    }
    candidateMs += MINUTE_MS;
  }
  throw Object.assign(new Error('Unable to find the next cron occurrence within the supported search window.'), { code: 'schedule_cron_unreachable' });
}

function normalizeCadence(source) {
  const value = objectValue(source);
  const type = text(value, 'type', 'cron');
  if (type !== 'cron') {
    throw Object.assign(new Error('Only cron cadence is supported.'), { code: 'schedule_cadence_unsupported' });
  }
  const expression = parseCronExpression(text(value, 'expression', text(value, 'cron', ''))).expression;
  return { type: 'cron', expression, timezone: validateTimeZone(text(value, 'timezone', 'UTC')) };
}

function normalizeRetry(source) {
  const value = objectValue(source);
  return {
    maxAttempts: boundedInteger(numberValue(value, 'maxAttempts', 1), 1, 1, 10),
    initialDelayMs: boundedInteger(numberValue(value, 'initialDelayMs', 1000), 1000, 0, 60 * 60 * 1000),
    backoffMultiplier: Math.min(Math.max(numberValue(value, 'backoffMultiplier', 2), 1), 10)
  };
}

function normalizeRetention(source) {
  const value = objectValue(source);
  return {
    maxRuns: boundedInteger(numberValue(value, 'maxRuns', 100), 100, 1, 5000),
    maxAgeDays: boundedInteger(numberValue(value, 'maxAgeDays', 30), 30, 1, 3650)
  };
}

function normalizeConcurrency(source) {
  const value = objectValue(source);
  const overlapPolicy = text(value, 'overlapPolicy', 'skip');
  if (overlapPolicy !== 'skip' && overlapPolicy !== 'queue') {
    throw Object.assign(new Error('Schedule overlapPolicy must be skip or queue.'), { code: 'schedule_concurrency_invalid' });
  }
  return {
    limit: boundedInteger(numberValue(value, 'limit', 1), 1, 1, 20),
    overlapPolicy
  };
}

function normalizeMissedRunPolicy(value) {
  const normalized = typeof value === 'string' && value.length > 0 ? value : 'run_once';
  if (!['skip', 'run_once', 'catch_up'].includes(normalized)) {
    throw Object.assign(new Error('Schedule missedRunPolicy must be skip, run_once, or catch_up.'), { code: 'schedule_missed_policy_invalid' });
  }
  return normalized;
}

function scheduleFromPayload(payload, current, nowMs) {
  const source = objectValue(payload);
  const existing = objectValue(current);
  const cadenceSource = source.cadence && typeof source.cadence === 'object'
    ? source.cadence
    : (existing.cadence || { type: 'cron', expression: text(source, 'cron', ''), timezone: text(source, 'timezone', 'UTC') });
  const cadence = normalizeCadence(cadenceSource);
  const prompt = text(source, 'prompt', text(existing, 'prompt', '')).trim();
  const name = text(source, 'name', text(existing, 'name', '')).trim();
  const workspaceId = text(source, 'workspaceId', text(existing, 'workspaceId', '')).trim();
  const workspacePath = text(source, 'workspacePath', text(source, 'cwd', text(existing, 'workspacePath', ''))).trim();
  const providerId = text(source, 'providerId', text(existing, 'providerId', 'mock')).trim();
  if (prompt.length === 0) throw Object.assign(new Error('Schedule prompt is required.'), { code: 'schedule_prompt_required' });
  if (workspaceId.length === 0 && workspacePath.length === 0) throw Object.assign(new Error('Schedule workspace scope is required.'), { code: 'schedule_workspace_required' });
  if (providerId.length === 0) throw Object.assign(new Error('Schedule providerId is required.'), { code: 'schedule_provider_required' });
  const retry = source.retry && typeof source.retry === 'object' ? normalizeRetry(source.retry) : normalizeRetry(existing.retry);
  const retention = source.retention && typeof source.retention === 'object' ? normalizeRetention(source.retention) : normalizeRetention(existing.retention);
  const concurrency = source.concurrency && typeof source.concurrency === 'object' ? normalizeConcurrency(source.concurrency) : normalizeConcurrency(existing.concurrency);
  const createdAt = text(existing, 'createdAt', nowIso(nowMs));
  const lastScheduledLocalKey = text(existing, 'lastScheduledLocalKey', '');
  const next = nextCronOccurrence(cadence, nowMs, lastScheduledLocalKey);
  return {
    id: text(existing, 'id', randomId('sch')),
    name: name.length > 0 ? name : 'Schedule',
    prompt: prompt.substring(0, 100000),
    workspaceId,
    workspacePath,
    providerId,
    modelId: text(source, 'modelId', text(existing, 'modelId', '')),
    enabled: booleanValue(source, 'enabled', booleanValue(existing, 'enabled', true)),
    status: booleanValue(source, 'enabled', booleanValue(existing, 'enabled', true)) ? 'enabled' : 'disabled',
    cadence,
    concurrency,
    retry,
    retention,
    missedRunPolicy: normalizeMissedRunPolicy(text(source, 'missedRunPolicy', text(existing, 'missedRunPolicy', 'run_once'))),
    nextRunAt: next.at,
    lastRunAt: text(existing, 'lastRunAt', ''),
    lastScheduledLocalKey,
    totalRuns: boundedInteger(numberValue(existing, 'totalRuns', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    successfulRuns: boundedInteger(numberValue(existing, 'successfulRuns', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    failedRuns: boundedInteger(numberValue(existing, 'failedRuns', 0), 0, 0, Number.MAX_SAFE_INTEGER),
    createdAt,
    updatedAt: nowIso(nowMs),
    revision: boundedInteger(numberValue(existing, 'revision', 0), 0, 0, Number.MAX_SAFE_INTEGER) + 1
  };
}

function normalizeStoredSchedule(source, nowMs) {
  const value = objectValue(source);
  const schedule = scheduleFromPayload(value, value, nowMs);
  const storedNextRunAt = text(value, 'nextRunAt', '');
  if (Number.isFinite(Date.parse(storedNextRunAt))) schedule.nextRunAt = storedNextRunAt;
  schedule.revision = boundedInteger(numberValue(value, 'revision', 1), 1, 1, Number.MAX_SAFE_INTEGER);
  schedule.createdAt = text(value, 'createdAt', schedule.createdAt);
  schedule.updatedAt = text(value, 'updatedAt', schedule.updatedAt);
  schedule.status = schedule.enabled ? 'enabled' : 'disabled';
  return schedule;
}

function normalizeStoredRun(source) {
  const value = objectValue(source);
  const status = text(value, 'status', 'failed');
  return {
    id: text(value, 'id', randomId('run')),
    scheduleId: text(value, 'scheduleId', ''),
    reason: text(value, 'reason', 'scheduled'),
    scheduledFor: text(value, 'scheduledFor', ''),
    localKey: text(value, 'localKey', ''),
    status: status === 'running' ? 'interrupted' : status,
    attempts: Array.isArray(value.attempts) ? value.attempts.slice(0, 10) : [],
    agentId: text(value, 'agentId', ''),
    sessionId: text(value, 'sessionId', ''),
    failureCategory: status === 'running' ? 'daemon_restarted' : text(value, 'failureCategory', ''),
    message: status === 'running' ? 'Schedule run was interrupted by daemon restart.' : text(value, 'message', ''),
    startedAt: text(value, 'startedAt', ''),
    completedAt: status === 'running' ? new Date().toISOString() : text(value, 'completedAt', ''),
    createdAt: text(value, 'createdAt', new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
}

class ScheduleManager {
  constructor(options) {
    const source = objectValue(options);
    this.store = source.store || null;
    this.directory = this.store && this.store.paths ? this.store.paths.schedules : path.join(process.cwd(), '.agent-bridge-schedules');
    this.statePath = path.join(this.directory, 'state.json');
    this.leasePath = path.join(this.directory, 'runner.lock');
    this.execute = typeof source.execute === 'function' ? source.execute : null;
    this.onUpdated = typeof source.onUpdated === 'function' ? source.onUpdated : () => {};
    this.clock = typeof source.clock === 'function' ? source.clock : () => Date.now();
    this.setTimer = typeof source.setTimer === 'function' ? source.setTimer : setTimeout;
    this.clearTimer = typeof source.clearTimer === 'function' ? source.clearTimer : clearTimeout;
    this.sleep = typeof source.sleep === 'function' ? source.sleep : (delayMs) => new Promise((resolve) => this.setTimer(resolve, delayMs));
    this.tickIntervalMs = boundedInteger(numberValue(source, 'tickIntervalMs', DEFAULT_TICK_INTERVAL_MS), DEFAULT_TICK_INTERVAL_MS, 1000, 60000);
    this.processIsAlive = typeof source.processIsAlive === 'function' ? source.processIsAlive : this.defaultProcessIsAlive;
    this.schedules = new Map();
    this.runs = [];
    this.activeRuns = new Map();
    this.plans = new Map();
    this.timer = null;
    this.leaseTimer = null;
    this.lease = null;
    this.ticking = false;
    this.started = false;
    this.loadWarnings = [];
    fs.mkdirSync(this.directory, { recursive: true });
    this.load();
  }

  isAvailable() {
    return this.execute !== null;
  }

  defaultProcessIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return Boolean(error && error.code === 'EPERM');
    }
  }

  load() {
    if (!fs.existsSync(this.statePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const source = objectValue(parsed);
      const nowMs = this.clock();
      for (const item of Array.isArray(source.schedules) ? source.schedules : []) {
        try {
          const schedule = normalizeStoredSchedule(item, nowMs);
          this.schedules.set(schedule.id, schedule);
        } catch (error) {
          this.loadWarnings.push(error instanceof Error ? error.message : String(error));
        }
      }
      this.runs = (Array.isArray(source.runs) ? source.runs : []).map((item) => normalizeStoredRun(item));
      this.pruneHistory();
    } catch (_error) {
      this.loadWarnings.push('Schedule state was corrupt and was ignored.');
    }
  }

  persist() {
    writeJsonFileAtomic(this.statePath, {
      schemaVersion: STATE_SCHEMA_VERSION,
      schedules: Array.from(this.schedules.values()),
      runs: this.runs,
      updatedAt: nowIso(this.clock())
    });
  }

  status() {
    return {
      ok: true,
      action: 'schedule.status',
      available: this.isAvailable(),
      leader: this.lease !== null,
      leaseOwnerPid: this.lease ? this.lease.pid : 0,
      schedules: this.schedules.size,
      enabledSchedules: Array.from(this.schedules.values()).filter((item) => item.enabled).length,
      activeRuns: this.activeRuns.size,
      queuedRuns: this.runs.filter((item) => item.status === 'queued').length,
      warnings: this.loadWarnings.slice(),
      updatedAt: nowIso(this.clock())
    };
  }

  start() {
    if (this.started) return this.status();
    this.started = true;
    if (!this.isAvailable()) return this.status();
    if (!this.acquireLease()) {
      this.loadWarnings.push('Another Bridge instance owns the schedule runner lease.');
      return this.status();
    }
    this.recoverMissedRuns();
    this.scheduleTick();
    this.scheduleLeaseRenewal();
    return this.status();
  }

  shutdown() {
    this.started = false;
    if (this.timer) this.clearTimer(this.timer);
    if (this.leaseTimer) this.clearTimer(this.leaseTimer);
    this.timer = null;
    this.leaseTimer = null;
    this.releaseLease();
  }

  acquireLease() {
    const nowMs = this.clock();
    const lease = { leaseId: randomId('schedule_lease'), pid: process.pid, acquiredAt: nowIso(nowMs), expiresAt: nowMs + LEASE_TTL_MS };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = fs.openSync(this.leasePath, 'wx');
        try {
          fs.writeFileSync(handle, JSON.stringify(lease), 'utf8');
        } finally {
          fs.closeSync(handle);
        }
        this.lease = lease;
        return true;
      } catch (error) {
        if (!error || error.code !== 'EEXIST') return false;
        let existing = null;
        try {
          existing = JSON.parse(fs.readFileSync(this.leasePath, 'utf8'));
        } catch (_readError) {
          existing = null;
        }
        const expired = !existing || numberValue(existing, 'expiresAt', 0) <= nowMs || !this.processIsAlive(numberValue(existing, 'pid', 0));
        if (!expired) return false;
        try {
          fs.unlinkSync(this.leasePath);
        } catch (_unlinkError) {
          return false;
        }
      }
    }
    return false;
  }

  scheduleLeaseRenewal() {
    if (!this.started || !this.lease) return;
    this.leaseTimer = this.setTimer(() => {
      if (!this.lease) return;
      try {
        const existing = JSON.parse(fs.readFileSync(this.leasePath, 'utf8'));
        if (text(existing, 'leaseId', '') !== this.lease.leaseId) {
          this.loadWarnings.push('Schedule runner lease ownership changed.');
          this.lease = null;
          return;
        }
        this.lease.expiresAt = this.clock() + LEASE_TTL_MS;
        fs.writeFileSync(this.leasePath, JSON.stringify(this.lease), 'utf8');
      } catch (_error) {
        this.loadWarnings.push('Schedule runner lease renewal failed.');
        this.lease = null;
      }
      this.scheduleLeaseRenewal();
    }, Math.floor(LEASE_TTL_MS / 3));
    if (this.leaseTimer && typeof this.leaseTimer.unref === 'function') this.leaseTimer.unref();
  }

  releaseLease() {
    if (!this.lease) return;
    try {
      const existing = JSON.parse(fs.readFileSync(this.leasePath, 'utf8'));
      if (text(existing, 'leaseId', '') === this.lease.leaseId) fs.unlinkSync(this.leasePath);
    } catch (_error) {
      // Lease expiry is the fallback cleanup path.
    }
    this.lease = null;
  }

  scheduleTick() {
    if (!this.started || !this.lease) return;
    this.timer = this.setTimer(() => {
      void this.tick().finally(() => this.scheduleTick());
    }, this.tickIntervalMs);
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
  }

  recoverMissedRuns() {
    const nowMs = this.clock();
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled || Date.parse(schedule.nextRunAt) > nowMs) continue;
      if (schedule.missedRunPolicy === 'skip') {
        const next = nextCronOccurrence(schedule.cadence, nowMs, schedule.lastScheduledLocalKey);
        schedule.nextRunAt = next.at;
        schedule.updatedAt = nowIso(nowMs);
      } else if (schedule.missedRunPolicy === 'run_once') {
        const scheduledFor = schedule.nextRunAt;
        const parts = zonedDateParts(new Date(scheduledFor), schedule.cadence.timezone);
        schedule.lastScheduledLocalKey = parts.localKey;
        const next = nextCronOccurrence(schedule.cadence, nowMs, parts.localKey);
        schedule.nextRunAt = next.at;
        void this.trigger(schedule, 'missed_run', scheduledFor, parts.localKey);
      }
    }
    this.persist();
    if (Array.from(this.schedules.values()).some((item) => item.enabled && Date.parse(item.nextRunAt) <= nowMs)) void this.tick();
  }

  async tick() {
    if (this.ticking || !this.lease) return this.status();
    this.ticking = true;
    try {
      const nowMs = this.clock();
      for (const schedule of this.schedules.values()) {
        if (!schedule.enabled) continue;
        let catchUpCount = 0;
        while (Date.parse(schedule.nextRunAt) <= nowMs && catchUpCount < MAX_CATCH_UP_RUNS) {
          const scheduledFor = schedule.nextRunAt;
          const parts = zonedDateParts(new Date(scheduledFor), schedule.cadence.timezone);
          schedule.lastScheduledLocalKey = parts.localKey;
          const next = nextCronOccurrence(schedule.cadence, Date.parse(scheduledFor), parts.localKey);
          schedule.nextRunAt = next.at;
          schedule.updatedAt = nowIso(nowMs);
          void this.trigger(schedule, 'scheduled', scheduledFor, parts.localKey);
          catchUpCount += 1;
          if (schedule.missedRunPolicy !== 'catch_up') break;
        }
        if (Date.parse(schedule.nextRunAt) <= nowMs) {
          const next = nextCronOccurrence(schedule.cadence, nowMs, schedule.lastScheduledLocalKey);
          schedule.nextRunAt = next.at;
        }
      }
      this.persist();
      return this.status();
    } finally {
      this.ticking = false;
    }
  }

  list(payload) {
    const source = objectValue(payload);
    const query = text(source, 'query', '').trim().toLowerCase();
    const enabledFilter = typeof source.enabled === 'boolean' ? source.enabled : null;
    const items = Array.from(this.schedules.values())
      .filter((item) => enabledFilter === null || item.enabled === enabledFilter)
      .filter((item) => query.length === 0 || item.name.toLowerCase().includes(query) || item.prompt.toLowerCase().includes(query))
      .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt))
      .map((item) => this.publicSchedule(item));
    return { ok: true, action: 'schedule.list', schedules: items, total: items.length, updatedAt: nowIso(this.clock()) };
  }

  get(payload) {
    const schedule = this.findSchedule(payload);
    if (!schedule) return publicFailure('schedule.get', 'schedule_not_found', 'Schedule was not found.');
    return { ok: true, action: 'schedule.get', schedule: this.publicSchedule(schedule), updatedAt: nowIso(this.clock()) };
  }

  create(payload) {
    const action = 'schedule.create';
    if (!booleanValue(payload, 'confirm', false)) {
      try {
        const schedule = scheduleFromPayload(payload, null, this.clock());
        const plan = this.createPlan(action, schedule.id, { schedule });
        return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, schedule: this.publicSchedule(schedule), warnings: [], updatedAt: nowIso(this.clock()) };
      } catch (error) {
        return this.failureFromError(action, error);
      }
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), '');
    if (!consumed.ok) return consumed;
    const schedule = consumed.plan.binding.schedule;
    this.schedules.set(schedule.id, schedule);
    this.persist();
    this.emit('created', schedule.id, { schedule: this.publicSchedule(schedule) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, schedule: this.publicSchedule(schedule), updatedAt: nowIso(this.clock()) };
  }

  update(payload) {
    const action = 'schedule.update';
    const current = this.findSchedule(payload);
    if (!current) return publicFailure(action, 'schedule_not_found', 'Schedule was not found.');
    if (!booleanValue(payload, 'confirm', false)) {
      try {
        const schedule = scheduleFromPayload(payload, current, this.clock());
        const plan = this.createPlan(action, current.id, { schedule, expectedRevision: current.revision });
        return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, schedule: this.publicSchedule(schedule), warnings: [], updatedAt: nowIso(this.clock()) };
      } catch (error) {
        return this.failureFromError(action, error);
      }
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), current.id);
    if (!consumed.ok) return consumed;
    if (current.revision !== consumed.plan.binding.expectedRevision) return publicFailure(action, 'plan_stale', 'Schedule changed after preview.', 'Refresh and preview the update again.');
    const schedule = consumed.plan.binding.schedule;
    this.schedules.set(schedule.id, schedule);
    this.persist();
    this.emit('updated', schedule.id, { schedule: this.publicSchedule(schedule) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, schedule: this.publicSchedule(schedule), updatedAt: nowIso(this.clock()) };
  }

  setEnabled(payload, enabled) {
    const action = enabled ? 'schedule.enable' : 'schedule.disable';
    const current = this.findSchedule(payload);
    if (!current) return publicFailure(action, 'schedule_not_found', 'Schedule was not found.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, current.id, { expectedRevision: current.revision, enabled });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, schedule: this.publicSchedule(Object.assign({}, current, { enabled, status: enabled ? 'enabled' : 'disabled' })), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), current.id);
    if (!consumed.ok) return consumed;
    if (current.revision !== consumed.plan.binding.expectedRevision) return publicFailure(action, 'plan_stale', 'Schedule changed after preview.', 'Refresh and preview the operation again.');
    current.enabled = enabled;
    current.status = enabled ? 'enabled' : 'disabled';
    current.revision += 1;
    current.updatedAt = nowIso(this.clock());
    if (enabled) current.nextRunAt = nextCronOccurrence(current.cadence, this.clock(), current.lastScheduledLocalKey).at;
    this.persist();
    this.emit(enabled ? 'enabled' : 'disabled', current.id, { schedule: this.publicSchedule(current) });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, schedule: this.publicSchedule(current), updatedAt: nowIso(this.clock()) };
  }

  remove(payload) {
    const action = 'schedule.remove';
    const current = this.findSchedule(payload);
    if (!current) return publicFailure(action, 'schedule_not_found', 'Schedule was not found.');
    if (this.activeCount(current.id) > 0) return publicFailure(action, 'schedule_running', 'A running schedule cannot be removed.', 'Wait for the active run to finish or disable the schedule.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, current.id, { expectedRevision: current.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, schedule: this.publicSchedule(current), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), current.id);
    if (!consumed.ok) return consumed;
    if (current.revision !== consumed.plan.binding.expectedRevision) return publicFailure(action, 'plan_stale', 'Schedule changed after preview.', 'Refresh and preview the removal again.');
    this.schedules.delete(current.id);
    this.persist();
    this.emit('removed', current.id, { scheduleId: current.id });
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, scheduleId: current.id, updatedAt: nowIso(this.clock()) };
  }

  runNow(payload) {
    const action = 'schedule.run-now';
    const current = this.findSchedule(payload);
    if (!current) return publicFailure(action, 'schedule_not_found', 'Schedule was not found.');
    if (!booleanValue(payload, 'confirm', false)) {
      const plan = this.createPlan(action, current.id, { expectedRevision: current.revision });
      return { ok: true, action, preview: true, confirmed: false, planId: plan.planId, schedule: this.publicSchedule(current), updatedAt: nowIso(this.clock()) };
    }
    const consumed = this.consumePlan(action, text(payload, 'planId', ''), current.id);
    if (!consumed.ok) return consumed;
    if (current.revision !== consumed.plan.binding.expectedRevision) return publicFailure(action, 'plan_stale', 'Schedule changed after preview.', 'Refresh and preview run-now again.');
    const run = this.trigger(current, 'manual', nowIso(this.clock()), '');
    return { ok: true, action, preview: false, confirmed: true, planId: consumed.plan.planId, run: this.publicRun(run), schedule: this.publicSchedule(current), updatedAt: nowIso(this.clock()) };
  }

  history(payload) {
    const scheduleId = text(payload, 'scheduleId', text(payload, 'id', ''));
    const limit = boundedInteger(numberValue(payload, 'limit', 50), 50, 1, MAX_HISTORY_LIMIT);
    const before = text(payload, 'before', '');
    let items = this.runs.filter((item) => scheduleId.length === 0 || item.scheduleId === scheduleId);
    items = items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    if (before.length > 0) items = items.filter((item) => item.createdAt < before);
    const selected = items.slice(0, limit);
    return {
      ok: true,
      action: 'schedule.history',
      scheduleId,
      runs: selected.map((item) => this.publicRun(item)),
      nextCursor: items.length > selected.length && selected.length > 0 ? selected[selected.length - 1].createdAt : '',
      updatedAt: nowIso(this.clock())
    };
  }

  trigger(schedule, reason, scheduledFor, localKey) {
    const run = {
      id: randomId('run'),
      scheduleId: schedule.id,
      reason,
      scheduledFor,
      localKey,
      status: 'queued',
      attempts: [],
      agentId: '',
      sessionId: '',
      failureCategory: '',
      message: '',
      startedAt: '',
      completedAt: '',
      createdAt: nowIso(this.clock()),
      updatedAt: nowIso(this.clock())
    };
    this.runs.push(run);
    if (this.activeCount(schedule.id) >= schedule.concurrency.limit) {
      if (schedule.concurrency.overlapPolicy === 'skip') {
        run.status = 'skipped';
        run.failureCategory = 'concurrency_limit';
        run.message = 'Schedule run skipped because its concurrency limit was reached.';
        run.completedAt = nowIso(this.clock());
        run.updatedAt = run.completedAt;
        schedule.totalRuns += 1;
        schedule.failedRuns += 1;
        schedule.lastRunAt = run.completedAt;
        this.pruneHistory();
        this.persist();
        this.emit('run.completed', schedule.id, { run: this.publicRun(run), schedule: this.publicSchedule(schedule) });
        return run;
      }
      this.persist();
      this.emit('run.queued', schedule.id, { run: this.publicRun(run) });
      return run;
    }
    this.startRun(schedule, run);
    return run;
  }

  startRun(schedule, run) {
    run.status = 'running';
    run.startedAt = nowIso(this.clock());
    run.updatedAt = run.startedAt;
    const promise = this.executeRun(schedule, run)
      .catch((error) => {
        run.status = 'failed';
        run.failureCategory = error && typeof error.code === 'string' ? error.code : 'schedule_execution_failed';
        run.message = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        if (run.status === 'running') run.status = 'succeeded';
        run.completedAt = nowIso(this.clock());
        run.updatedAt = run.completedAt;
        schedule.totalRuns += 1;
        schedule.lastRunAt = run.completedAt;
        if (run.status === 'succeeded') schedule.successfulRuns += 1;
        else schedule.failedRuns += 1;
        schedule.updatedAt = run.completedAt;
        this.activeRuns.delete(run.id);
        this.pruneHistory();
        this.persist();
        this.emit('run.completed', schedule.id, { run: this.publicRun(run), schedule: this.publicSchedule(schedule) });
        this.drainQueued(schedule.id);
      });
    this.activeRuns.set(run.id, { scheduleId: schedule.id, promise });
    this.persist();
    this.emit('run.started', schedule.id, { run: this.publicRun(run), schedule: this.publicSchedule(schedule) });
  }

  async executeRun(schedule, run) {
    let delayMs = schedule.retry.initialDelayMs;
    for (let attemptNumber = 1; attemptNumber <= schedule.retry.maxAttempts; attemptNumber += 1) {
      const attempt = { attempt: attemptNumber, status: 'running', startedAt: nowIso(this.clock()), completedAt: '', failureCategory: '', message: '' };
      run.attempts.push(attempt);
      run.updatedAt = attempt.startedAt;
      this.persist();
      try {
        const result = await this.execute({ schedule: this.publicSchedule(schedule), run: this.publicRun(run), attempt: attemptNumber });
        if (!result || result.ok === false) {
          const error = new Error(result && typeof result.message === 'string' ? result.message : 'Schedule Agent execution failed.');
          error.code = result && typeof result.failureCategory === 'string' ? result.failureCategory : 'agent_execution_failed';
          throw error;
        }
        attempt.status = 'succeeded';
        attempt.completedAt = nowIso(this.clock());
        run.agentId = text(result, 'agentId', run.agentId);
        run.sessionId = text(result, 'sessionId', run.sessionId);
        run.message = text(result, 'message', '');
        run.status = 'succeeded';
        return;
      } catch (error) {
        attempt.status = 'failed';
        attempt.failureCategory = error && typeof error.code === 'string' ? error.code : 'schedule_execution_failed';
        attempt.message = error instanceof Error ? error.message : String(error);
        attempt.completedAt = nowIso(this.clock());
        run.failureCategory = attempt.failureCategory;
        run.message = attempt.message;
        if (attemptNumber >= schedule.retry.maxAttempts) {
          run.status = 'failed';
          return;
        }
        if (delayMs > 0) await this.sleep(delayMs);
        delayMs = Math.min(Math.floor(delayMs * schedule.retry.backoffMultiplier), 60 * 60 * 1000);
      }
    }
  }

  drainQueued(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return;
    while (this.activeCount(scheduleId) < schedule.concurrency.limit) {
      const run = this.runs.find((item) => item.scheduleId === scheduleId && item.status === 'queued');
      if (!run) return;
      this.startRun(schedule, run);
    }
  }

  activeCount(scheduleId) {
    let count = 0;
    for (const active of this.activeRuns.values()) if (active.scheduleId === scheduleId) count += 1;
    return count;
  }

  pruneHistory() {
    const nowMs = this.clock();
    const keep = [];
    const grouped = new Map();
    for (const run of this.runs) {
      const schedule = this.schedules.get(run.scheduleId);
      const retention = schedule ? schedule.retention : { maxRuns: 100, maxAgeDays: 30 };
      const ageLimit = nowMs - retention.maxAgeDays * 24 * 60 * 60 * 1000;
      if (run.status !== 'running' && run.status !== 'queued' && Date.parse(run.createdAt) < ageLimit) continue;
      if (!grouped.has(run.scheduleId)) grouped.set(run.scheduleId, []);
      grouped.get(run.scheduleId).push(run);
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const schedule = this.schedules.get(items[0] ? items[0].scheduleId : '');
      const maxRuns = schedule ? schedule.retention.maxRuns : 100;
      let completedCount = 0;
      for (const run of items) {
        if (run.status === 'running' || run.status === 'queued') keep.push(run);
        else if (completedCount < maxRuns) {
          keep.push(run);
          completedCount += 1;
        }
      }
    }
    this.runs = keep.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  findSchedule(payload) {
    const id = text(payload, 'scheduleId', text(payload, 'id', ''));
    return id.length > 0 ? this.schedules.get(id) || null : null;
  }

  publicSchedule(schedule) {
    const value = cloneJson(schedule);
    value.activeRuns = this.activeCount(schedule.id);
    value.queuedRuns = this.runs.filter((run) => run.scheduleId === schedule.id && run.status === 'queued').length;
    return value;
  }

  publicRun(run) {
    return cloneJson(run);
  }

  createPlan(action, targetId, binding) {
    this.cleanupPlans();
    const plan = {
      planId: randomId('schedule_plan'),
      action,
      targetId,
      digest: sha256(binding),
      binding: cloneJson(binding),
      createdAt: this.clock(),
      expiresAt: this.clock() + PLAN_TTL_MS
    };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  consumePlan(action, planId, targetId) {
    this.cleanupPlans();
    if (planId.length === 0) return publicFailure(action, 'confirmation_required', 'A valid preview planId is required.', 'Preview the operation and confirm the returned planId.');
    const plan = this.plans.get(planId);
    if (!plan) return publicFailure(action, 'plan_expired', 'Schedule operation plan is missing or expired.', 'Preview the operation again.');
    if (plan.action !== action || (targetId.length > 0 && plan.targetId !== targetId) || plan.digest !== sha256(plan.binding)) {
      return publicFailure(action, 'plan_stale', 'Schedule operation plan does not match the requested action.', 'Preview the operation again.');
    }
    this.plans.delete(planId);
    return { ok: true, plan };
  }

  cleanupPlans() {
    const nowMs = this.clock();
    for (const [planId, plan] of this.plans.entries()) if (plan.expiresAt <= nowMs) this.plans.delete(planId);
  }

  failureFromError(action, error) {
    return publicFailure(action, error && typeof error.code === 'string' ? error.code : 'schedule_invalid', error instanceof Error ? error.message : String(error));
  }

  emit(kind, scheduleId, payload) {
    try {
      this.onUpdated(Object.assign({ kind, scheduleId, updatedAt: nowIso(this.clock()) }, payload || {}));
    } catch (_error) {
      // Persistence is authoritative if an observer is unavailable.
    }
  }
}

module.exports = {
  ScheduleManager,
  parseCronExpression,
  nextCronOccurrence,
  zonedDateParts
};
