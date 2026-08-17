'use strict';

const crypto = require('crypto');

const DEFAULT_GIT_PLAN_TTL_MS = 2 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (!isObject(value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  const output = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const item = value[key];
    if (typeof item !== 'undefined') {
      output[key] = canonicalValue(item);
    }
  }
  return output;
}

function digestGitPlanValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readString(source, key, fallbackValue) {
  if (!isObject(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function gitPlanFailure(failureCategory, message, remediation) {
  return {
    ok: false,
    preview: false,
    confirmed: false,
    failureCategory,
    message,
    remediation,
    updatedAt: Date.now()
  };
}

class WorkspaceGitPlanManager {
  constructor(options) {
    const source = isObject(options) ? options : {};
    const ttlMs = typeof source.ttlMs === 'number' && Number.isFinite(source.ttlMs)
      ? Math.floor(source.ttlMs)
      : DEFAULT_GIT_PLAN_TTL_MS;
    this.ttlMs = Math.max(5000, ttlMs);
    this.plans = new Map();
  }

  removeExpired() {
    const now = Date.now();
    for (const entry of this.plans.entries()) {
      if (!entry[1] || entry[1].expiresAt <= now) {
        this.plans.delete(entry[0]);
      }
    }
  }

  create(input) {
    this.removeExpired();
    const source = isObject(input) ? input : {};
    const operation = readString(source, 'operation', '');
    const workspaceId = readString(source, 'workspaceId', '');
    const repositoryPath = readString(source, 'repositoryPath', '');
    if (operation.length === 0 || repositoryPath.length === 0) {
      return gitPlanFailure(
        'git_plan_invalid',
        'Git plan input is incomplete.',
        'Refresh the workspace Git state and request a new preview.'
      );
    }
    const request = isObject(source.request) ? source.request : {};
    const snapshot = isObject(source.snapshot) ? source.snapshot : {};
    const preview = isObject(source.preview) ? source.preview : {};
    const createdAt = Date.now();
    const planId = crypto.randomBytes(18).toString('base64url');
    const plan = {
      planId,
      operation,
      workspaceId,
      repositoryPath,
      request: cloneValue(request),
      requestDigest: digestGitPlanValue(request),
      snapshot: cloneValue(snapshot),
      snapshotDigest: digestGitPlanValue(snapshot),
      preview: cloneValue(preview),
      createdAt,
      expiresAt: createdAt + this.ttlMs
    };
    this.plans.set(planId, plan);
    return {
      ok: true,
      preview: true,
      confirmed: false,
      planId,
      operation,
      workspaceId,
      requestDigest: plan.requestDigest,
      snapshotDigest: plan.snapshotDigest,
      expiresAt: new Date(plan.expiresAt).toISOString(),
      updatedAt: createdAt
    };
  }

  consume(input) {
    const source = isObject(input) ? input : {};
    const planId = readString(source, 'planId', '');
    if (planId.length === 0 || !this.plans.has(planId)) {
      return gitPlanFailure(
        'git_plan_expired',
        'Git operation plan is missing, expired, already consumed, or belongs to a previous Bridge process.',
        'Refresh the Git state and request a new preview.'
      );
    }
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    if (!plan || plan.expiresAt <= Date.now()) {
      return gitPlanFailure(
        'git_plan_expired',
        'Git operation plan expired before confirmation.',
        'Refresh the Git state and request a new preview.'
      );
    }
    const operation = readString(source, 'operation', '');
    const workspaceId = readString(source, 'workspaceId', '');
    const repositoryPath = readString(source, 'repositoryPath', '');
    const request = isObject(source.request) ? source.request : {};
    const snapshot = isObject(source.snapshot) ? source.snapshot : {};
    const requestDigest = digestGitPlanValue(request);
    const snapshotDigest = digestGitPlanValue(snapshot);
    if (plan.operation !== operation ||
      plan.workspaceId !== workspaceId ||
      plan.repositoryPath !== repositoryPath ||
      plan.requestDigest !== requestDigest ||
      plan.snapshotDigest !== snapshotDigest) {
      return gitPlanFailure(
        'git_plan_stale',
        'Repository state or Git operation parameters changed after preview.',
        'Refresh the Git state, review the new risks, and request another preview.'
      );
    }
    return {
      ok: true,
      preview: false,
      confirmed: true,
      plan: cloneValue(plan),
      updatedAt: Date.now()
    };
  }

  clear() {
    this.plans.clear();
  }
}

module.exports = {
  DEFAULT_GIT_PLAN_TTL_MS,
  WorkspaceGitPlanManager,
  digestGitPlanValue
};
