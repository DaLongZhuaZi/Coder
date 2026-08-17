'use strict';

const { readString } = require('./protocol');
const { withProviderUsageCapability } = require('./provider-registry');

const DEFAULT_CACHE_TTL_MS = 15000;
const OPTION_SOURCE_VALUES = ['runtime', 'profile', 'cache', 'fallback'];
const RUNTIME_MODE_VALUES = ['oneshot', 'stdio', 'service'];

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function readStringArray(source, key) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  const value = source[key];
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) {
      result.push(item);
    }
  }
  return result;
}

function safeErrorMessage(error) {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error || '');
}

function normalizeOptionSource(value, fallbackValue) {
  if (typeof value !== 'string' || value.length === 0) {
    return fallbackValue;
  }
  const normalized = value.trim().toLowerCase();
  return OPTION_SOURCE_VALUES.includes(normalized) ? normalized : fallbackValue;
}

function inferArraySource(items, fallbackValue) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallbackValue;
  }
  let selected = '';
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const source = normalizeOptionSource(item.source, '');
    if (source.length > 0) {
      if (selected.length === 0) {
        selected = source;
      } else if (selected !== source) {
        return 'runtime';
      }
    }
  }
  return selected.length > 0 ? selected : fallbackValue;
}

function normalizeOption(item, providerId, fallbackSource, kind) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }
  const id = readString(item, 'id', '');
  const displayName = readString(item, 'displayName', readString(item, 'name', id));
  if (id.length === 0 && displayName.length === 0) {
    return null;
  }
  const normalized = Object.assign({}, item);
  normalized.id = id.length > 0 ? id : displayName;
  normalized.displayName = displayName.length > 0 ? displayName : normalized.id;
  normalized.source = normalizeOptionSource(readString(item, 'source', ''), fallbackSource);
  normalized.available = item.available === false ? false : true;
  normalized.warning = readString(item, 'warning', '');
  if (kind === 'model') {
    normalized.vendor = readString(item, 'vendor', providerId);
    normalized.isDefault = item.isDefault === true;
    normalized.contextWindow = readNumber(item, 'contextWindow', 0);
  } else if (kind === 'tool') {
    normalized.risk = readString(item, 'risk', 'provider');
    normalized.category = readString(item, 'category', 'tool');
    normalized.requiresConfirmation = item.requiresConfirmation === true;
    const slashCommand = readString(item, 'slashCommand', '');
    normalized.slashCommand = slashCommand.length > 0 ? slashCommand : slashCommandFromToolId(normalized.id);
    normalized.aliases = readStringArray(item, 'aliases');
  } else {
    normalized.description = readString(item, 'description', '');
    normalized.isDefault = item.isDefault === true;
  }
  return normalized;
}

function slashCommandFromToolId(toolId) {
  if (typeof toolId !== 'string' || toolId.length === 0) {
    return '';
  }
  const parts = toolId.split('.');
  const raw = parts.length > 1 ? parts[parts.length - 1] : toolId;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return cleaned.length > 0 ? '/' + cleaned : '';
}

function normalizeOptions(items, providerId, fallbackSource, kind) {
  if (!Array.isArray(items)) {
    return [];
  }
  const result = [];
  const seenIds = new Set();
  for (const item of items) {
    const normalized = normalizeOption(item, providerId, fallbackSource, kind);
    if (!normalized || seenIds.has(normalized.id)) {
      continue;
    }
    seenIds.add(normalized.id);
    result.push(normalized);
  }
  return result;
}

function normalizeRuntimeMode(value) {
  if (typeof value !== 'string') {
    return 'oneshot';
  }
  const normalized = value.trim().toLowerCase();
  return RUNTIME_MODE_VALUES.includes(normalized) ? normalized : 'oneshot';
}

function normalizeRuntimeCapabilities(source) {
  const capabilities = source && typeof source.capabilities === 'object' && !Array.isArray(source.capabilities) ? source.capabilities : {};
  return Object.assign({}, capabilities, {
    interactiveSessions: readBoolean(capabilities, 'interactiveSessions', false),
    speechRecognition: readBoolean(capabilities, 'speechRecognition', false),
    textToSpeech: readBoolean(capabilities, 'textToSpeech', false),
    voiceStreaming: readBoolean(capabilities, 'voiceStreaming', false)
  });
}

function normalizeSessionFeatures(source) {
  const features = source && typeof source.sessionFeatures === 'object' && !Array.isArray(source.sessionFeatures) ? source.sessionFeatures : {};
  return Object.assign({}, features, {
    attach: readBoolean(features, 'attach', false),
    abort: readBoolean(features, 'abort', false),
    resume: readBoolean(features, 'resume', false),
    checkpointRestore: readBoolean(features, 'checkpointRestore', false)
  });
}

function disableUnavailableOptions(items, warning) {
  const result = [];
  for (const item of items) {
    result.push(Object.assign({}, item, {
      available: false,
      warning: item.warning && item.warning.length > 0 ? item.warning : warning
    }));
  }
  return result;
}

function normalizeProviderDescriptor(provider, defaults) {
  const source = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {};
  const providerId = readString(source, 'id', 'unknown');
  const warnings = readStringArray(source, 'discoveryWarnings');
  const errors = readStringArray(source, 'discoveryErrors');
  const fallbackSource = normalizeOptionSource(readString(source, 'capabilitySource', ''), defaults.fallbackSource);
  const models = normalizeOptions(source.models, providerId, inferArraySource(source.models, fallbackSource), 'model');
  const speedModes = normalizeOptions(source.speedModes, providerId, inferArraySource(source.speedModes, fallbackSource), 'mode');
  const reasoningModes = normalizeOptions(source.reasoningModes, providerId, inferArraySource(source.reasoningModes, fallbackSource), 'mode');
  const interactionModes = normalizeOptions(source.interactionModes, providerId, inferArraySource(source.interactionModes, fallbackSource), 'mode');
  const tools = normalizeOptions(source.tools, providerId, inferArraySource(source.tools, fallbackSource), 'tool');
  const providerAvailable = readString(source, 'status', '') !== 'unavailable';
  const unavailableWarning = providerAvailable ? '' : readString(source.capabilities, 'health', 'Provider is unavailable.');
  let status = readString(source, 'capabilityStatus', '');
  if (status.length === 0) {
    status = errors.length > 0 || warnings.length > 0 || readString(source, 'status', '') === 'unavailable' ? 'degraded' : 'ready';
  }
  return Object.assign({}, source, {
    id: providerId,
    capabilitySource: fallbackSource,
    capabilityStatus: status,
    lastDiscoveredAt: readNumber(source, 'lastDiscoveredAt', defaults.now),
    discoveryWarnings: warnings,
    discoveryErrors: errors,
    cacheStatus: defaults.cacheStatus,
    cacheTtlMs: DEFAULT_CACHE_TTL_MS,
    runtimeMode: normalizeRuntimeMode(source.runtimeMode),
    capabilities: normalizeRuntimeCapabilities(source),
    sessionFeatures: normalizeSessionFeatures(source),
    models: providerAvailable ? models : disableUnavailableOptions(models, unavailableWarning),
    speedModes,
    reasoningModes,
    interactionModes,
    tools: providerAvailable ? tools : disableUnavailableOptions(tools, unavailableWarning)
  });
}

function degradedProviderDescriptor(provider, error, defaults) {
  const id = provider && typeof provider.id === 'string' && provider.id.length > 0 ? provider.id : 'unknown';
  const displayName = provider && typeof provider.displayName === 'string' && provider.displayName.length > 0 ? provider.displayName : id;
  return normalizeProviderDescriptor({
    id,
    displayName,
    status: 'unavailable',
    description: provider && typeof provider.description === 'string' ? provider.description : '',
    endpoint: provider && typeof provider.command === 'string' ? provider.command : '',
    capabilities: {
      streaming: false,
      tools: false,
      previews: false,
      permissions: false,
      history: false,
      modelSelection: false,
      speedProfiles: false,
      workspaceAware: false,
      interactiveSessions: false,
      health: safeErrorMessage(error)
    },
    models: [
      {
        id: 'configured',
        displayName: 'Configured Model',
        vendor: id,
        isDefault: true,
        contextWindow: 0,
        source: 'fallback',
        available: false,
        warning: safeErrorMessage(error)
      }
    ],
    speedModes: [],
    reasoningModes: [],
    interactionModes: [],
    tools: [],
    runtimeMode: 'oneshot',
    sessionFeatures: {
      attach: false,
      abort: false,
      resume: false,
      checkpointRestore: false
    },
    capabilitySource: 'fallback',
    capabilityStatus: 'degraded',
    discoveryWarnings: ['Provider discovery failed; using fallback capability metadata.'],
    discoveryErrors: [safeErrorMessage(error)]
  }, defaults);
}

function withProviderCacheStatus(providers, cacheStatus) {
  if (!Array.isArray(providers)) {
    return [];
  }
  const result = [];
  for (const provider of providers) {
    if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
      result.push(Object.assign({}, provider, { cacheStatus }));
    }
  }
  return result;
}

class ProviderCatalog {
  constructor(registry) {
    this.registry = registry;
    this.cache = new Map();
  }

  cacheKey(scope, cwd) {
    return scope + ':' + cwd;
  }

  async fetch(payload) {
    const scope = readString(payload, 'scope', 'global');
    const cwd = readString(payload, 'cwd', '');
    const force = readBoolean(payload, 'force', false);
    const effectiveScope = scope === 'workspace' ? 'workspace' : 'global';
    const effectiveCwd = effectiveScope === 'workspace' ? cwd : '';
    const key = this.cacheKey(effectiveScope, effectiveCwd);
    if (!force && this.cache.has(key)) {
      const cached = this.cache.get(key);
      return {
        scope: cached.scope,
        cwd: cached.cwd,
        providers: withProviderCacheStatus(cached.providers, 'warm'),
        updatedAt: cached.updatedAt,
        cacheStatus: 'warm',
        cacheTtlMs: DEFAULT_CACHE_TTL_MS,
        degradedProviders: cached.degradedProviders || 0,
        discoveryWarnings: cached.discoveryWarnings || [],
        discoveryErrors: cached.discoveryErrors || []
      };
    }

    const result = await this.fetchProviders(effectiveScope, effectiveCwd, force ? 'refreshed' : 'cold');
    const snapshot = {
      scope: effectiveScope,
      cwd: effectiveCwd,
      providers: result.providers,
      updatedAt: Date.now(),
      cacheStatus: force ? 'refreshed' : 'cold',
      cacheTtlMs: DEFAULT_CACHE_TTL_MS,
      degradedProviders: result.degradedProviders,
      discoveryWarnings: result.discoveryWarnings,
      discoveryErrors: result.discoveryErrors
    };
    this.cache.set(key, snapshot);
    return snapshot;
  }

  async refresh(payload) {
    const nextPayload = Object.assign({}, payload || {}, { force: true });
    return await this.fetch(nextPayload);
  }

  async fetchProviders(scope, cwd, cacheStatus) {
    const defaults = {
      now: Date.now(),
      cacheStatus,
      fallbackSource: 'runtime'
    };
    if (!this.registry.providers || typeof this.registry.providers.values !== 'function') {
      const providers = await this.registry.listCapabilities();
      return this.normalizeProviderResults(providers, defaults);
    }
    const tasks = [];
    for (const provider of this.registry.providers.values()) {
      if (typeof provider.fetchCatalog === 'function') {
        tasks.push(Promise.resolve()
          .then(() => provider.fetchCatalog({ scope, cwd, force: cacheStatus === 'refreshed' }))
          .catch((error) => degradedProviderDescriptor(provider, error, defaults)));
      } else {
        tasks.push(Promise.resolve()
          .then(() => provider.describe())
          .catch((error) => degradedProviderDescriptor(provider, error, defaults)));
      }
    }
    const results = await Promise.all(tasks);
    return this.normalizeProviderResults(results, defaults);
  }

  normalizeProviderResults(results, defaults) {
    const providers = [];
    for (const result of results) {
      if (Array.isArray(result)) {
        for (const item of result) {
          providers.push(normalizeProviderDescriptor(this.enrichProviderUsage(item), defaults));
        }
      } else if (result && typeof result === 'object') {
        if (Array.isArray(result.providers)) {
          for (const item of result.providers) {
            providers.push(normalizeProviderDescriptor(this.enrichProviderUsage(item), defaults));
          }
        } else {
          providers.push(normalizeProviderDescriptor(this.enrichProviderUsage(result), defaults));
        }
      }
    }
    let degradedProviders = 0;
    const discoveryWarnings = [];
    const discoveryErrors = [];
    for (const provider of providers) {
      if (provider.capabilityStatus === 'degraded') {
        degradedProviders += 1;
      }
      if (Array.isArray(provider.discoveryWarnings)) {
        for (const warning of provider.discoveryWarnings) {
          discoveryWarnings.push(provider.id + ': ' + warning);
        }
      }
      if (Array.isArray(provider.discoveryErrors)) {
        for (const error of provider.discoveryErrors) {
          discoveryErrors.push(provider.id + ': ' + error);
        }
      }
    }
    return {
      providers,
      degradedProviders,
      discoveryWarnings,
      discoveryErrors
    };
  }

  enrichProviderUsage(descriptor) {
    const source = descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor) ? descriptor : {};
    const providerId = readString(source, 'id', '');
    const provider = this.registry && this.registry.providers && typeof this.registry.providers.get === 'function'
      ? this.registry.providers.get(providerId)
      : null;
    return withProviderUsageCapability(provider, source);
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = {
  ProviderCatalog,
  normalizeProviderDescriptor
};
