'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PROVIDERS = Object.freeze([
  {
    id: 'opencode',
    displayName: 'OpenCode',
    commandCandidates: ['opencode'],
    defaultUrl: 'http://127.0.0.1:4096',
    canStartServer: true
  },
  {
    id: 'deveco',
    displayName: 'DevEco Code',
    commandCandidates: ['deveco', 'deveco-code', 'devecocode'],
    defaultUrl: 'http://127.0.0.1:4097',
    canStartServer: true
  },
  {
    id: 'mimo',
    displayName: 'MiMo Code',
    commandCandidates: ['mimo', 'mimo-code', 'mimocode'],
    defaultUrl: 'http://127.0.0.1:4098',
    canStartServer: true
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    commandCandidates: ['codex'],
    defaultUrl: '',
    canStartServer: false
  },
  {
    id: 'claude',
    displayName: 'Claude Code',
    commandCandidates: ['claude'],
    defaultUrl: '',
    canStartServer: false
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    commandCandidates: ['antigravity'],
    defaultUrl: '',
    canStartServer: false
  },
  {
    id: 'openclaw',
    displayName: 'OpenClaw CLI',
    commandCandidates: ['openclaw'],
    defaultUrl: '',
    canStartServer: false
  },
  {
    id: 'openclaw-gateway',
    displayName: 'OpenClaw Gateway',
    commandCandidates: ['openclaw'],
    defaultUrl: 'http://127.0.0.1:18789',
    healthPaths: ['/v1/models'],
    canStartServer: true
  },
  {
    id: 'hermes',
    displayName: 'Hermes CLI',
    commandCandidates: ['hermes'],
    defaultUrl: '',
    canStartServer: false
  },
  {
    id: 'hermes-studio',
    displayName: 'Hermes Studio',
    commandCandidates: ['hermes-web-ui'],
    defaultUrl: 'http://127.0.0.1:8648',
    healthPaths: ['/api/health', '/health', '/'],
    canStartServer: true
  },
  {
    id: 'mock',
    displayName: 'Mock Provider',
    commandCandidates: [],
    defaultUrl: '',
    canStartServer: false
  }
]);

function commandExists(commandName) {
  return new Promise((resolve) => {
    if (typeof commandName !== 'string' || commandName.length === 0) {
      resolve(false);
      return;
    }
    if (path.isAbsolute(commandName) || commandName.indexOf('/') >= 0 || commandName.indexOf('\\') >= 0) {
      resolve(fs.existsSync(commandName));
      return;
    }
    const checker = process.platform === 'win32' ? 'where.exe' : 'command';
    const args = process.platform === 'win32' ? [commandName] : ['-v', commandName];
    const child = spawn(checker, args, { stdio: 'ignore', shell: process.platform !== 'win32' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function runCommandCapture(command, args, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof command !== 'string' || command.length === 0) {
      resolve({
        ok: false,
        stdout: '',
        stderr: '',
        error: 'Command is not configured'
      });
      return;
    }
    const child = spawn(command, Array.isArray(args) ? args : [], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (error) {
        // Ignore kill failures while probing provider metadata.
      }
      finish({
        ok: false,
        stdout,
        stderr,
        error: 'Timed out after ' + String(timeoutMs) + 'ms'
      });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout = stdout + Buffer.from(chunk).toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr = stderr + Buffer.from(chunk).toString('utf8');
    });
    child.on('error', (error) => {
      finish({
        ok: false,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    child.on('exit', (code) => {
      finish({
        ok: code === 0,
        stdout,
        stderr,
        error: code === 0 ? '' : (stderr.trim().length > 0 ? stderr.trim() : 'Exited with code ' + String(code))
      });
    });
  });
}

async function firstAvailableCommand(candidates) {
  for (const candidate of candidates) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }
  return '';
}

function checkHttpHealth(urlText, timeoutMs, paths) {
  return new Promise((resolve) => {
    if (typeof urlText !== 'string' || urlText.length === 0) {
      resolve(false);
      return;
    }
    const candidates = Array.isArray(paths) && paths.length > 0 ? paths : ['/global/health'];
    let index = 0;
    function attempt() {
      if (index >= candidates.length) {
        resolve(false);
        return;
      }
      let url = null;
      try {
        url = new URL(candidates[index], urlText);
      } catch (error) {
        resolve(false);
        return;
      }
      index += 1;
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(url, { method: 'GET', timeout: timeoutMs }, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) {
          resolve(true);
          return;
        }
        attempt();
      });
      request.on('timeout', () => {
        request.destroy();
        attempt();
      });
      request.on('error', attempt);
      request.end();
    }
    attempt();
  });
}

function firstOutputLine(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return '';
  }
  return text.trim().split(/\r?\n/)[0].trim();
}

function outputIncludes(text, value) {
  if (typeof text !== 'string' || typeof value !== 'string') {
    return false;
  }
  return text.toLowerCase().indexOf(value.toLowerCase()) >= 0;
}

function parseCodexVisibleModelCount(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return 0;
  }
  try {
    const parsed = JSON.parse(text);
    const models = parsed && typeof parsed === 'object' && Array.isArray(parsed.models) ? parsed.models : [];
    let count = 0;
    for (const model of models) {
      if (!model || typeof model !== 'object') {
        continue;
      }
      if (typeof model.slug !== 'string' || model.slug.length === 0) {
        continue;
      }
      const visibility = typeof model.visibility === 'string' ? model.visibility.toLowerCase() : '';
      if (visibility === 'hide') {
        continue;
      }
      if (model.supported_in_api === false) {
        continue;
      }
      count += 1;
    }
    return count;
  } catch (error) {
    return 0;
  }
}

function readArrayFromValue(value, depth) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== 'object' || depth > 4) {
    return [];
  }
  const keys = ['sessions', 'items', 'data', 'result', 'results', 'all', 'providers'];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = readArrayFromValue(candidate, depth + 1);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
}

function parseJsonBody(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function parseOpenCodeModelCount(body) {
  const seen = new Set();
  function collectProvider(provider) {
    if (!provider || typeof provider !== 'object') {
      return;
    }
    const providerId = typeof provider.id === 'string' && provider.id.length > 0 ? provider.id :
      (typeof provider.providerID === 'string' ? provider.providerID : '');
    const models = provider.models;
    if (Array.isArray(models)) {
      for (const model of models) {
        const modelId = typeof model === 'string' ? model : (model && typeof model === 'object' && typeof model.id === 'string' ? model.id : '');
        if (modelId.length > 0) {
          seen.add((providerId.length > 0 ? providerId + '/' : '') + modelId);
        }
      }
    } else if (models && typeof models === 'object') {
      for (const modelId of Object.keys(models)) {
        if (modelId.length > 0) {
          seen.add((providerId.length > 0 ? providerId + '/' : '') + modelId);
        }
      }
    }
  }
  if (Array.isArray(body)) {
    for (const provider of body) {
      collectProvider(provider);
    }
  } else if (body && typeof body === 'object') {
    const providers = Array.isArray(body.providers) ? body.providers : (Array.isArray(body.all) ? body.all : []);
    if (providers.length > 0) {
      for (const provider of providers) {
        collectProvider(provider);
      }
    } else if (body.providers && typeof body.providers === 'object') {
      for (const key of Object.keys(body.providers)) {
        collectProvider(body.providers[key]);
      }
    }
  }
  return seen.size;
}

function collectSessionIdsFromBody(body, ids) {
  const sessions = readArrayFromValue(body, 0);
  for (const item of sessions) {
    if (item && typeof item === 'object') {
      const id = typeof item.id === 'string' ? item.id :
        (typeof item.sessionId === 'string' ? item.sessionId : (typeof item.sessionID === 'string' ? item.sessionID : ''));
      if (id.length > 0) {
        ids.add(id);
      }
    }
  }
}

function requestJson(urlText, pathname, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof urlText !== 'string' || urlText.length === 0) {
      resolve(null);
      return;
    }
    let url = null;
    try {
      url = new URL(pathname, urlText);
    } catch (error) {
      resolve(null);
      return;
    }
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method: 'GET', timeout: timeoutMs, headers: { Accept: 'application/json' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          resolve(null);
          return;
        }
        resolve(parseJsonBody(Buffer.concat(chunks).toString('utf8')));
      });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
    request.end();
  });
}

function localDatabasePath(providerId) {
  if (providerId === 'mimo') {
    return path.join(os.homedir(), '.local', 'share', 'mimocode', 'mimocode.db');
  }
  return path.join(os.homedir(), '.local', 'share', providerId, providerId + '.db');
}

function collectLocalDatabaseSessionIds(providerId, ids) {
  const dbPath = localDatabasePath(providerId);
  if (!fs.existsSync(dbPath)) {
    return;
  }
  const originalEmitWarning = process.emitWarning;
  try {
    process.emitWarning = function suppressedSqliteExperimentalWarning(warning, type) {
      const warningText = typeof warning === 'string' ? warning : (warning && typeof warning.message === 'string' ? warning.message : '');
      if (type === 'ExperimentalWarning' && warningText.indexOf('SQLite') >= 0) {
        return;
      }
      return originalEmitWarning.apply(process, arguments);
    };
    const sqlite = require('node:sqlite');
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare('select id from session limit 1000').all();
      for (const row of rows) {
        if (row && typeof row.id === 'string' && row.id.length > 0) {
          ids.add(row.id);
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    return;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function collectBridgeMetadataSessionIds(providerId, ids) {
  const metadataPath = path.join(os.homedir(), '.ngf-agent-bridge', providerId + '-sessions.json');
  if (!fs.existsSync(metadataPath)) {
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    const prefix = providerId + ':';
    for (const key of Object.keys(parsed)) {
      const value = parsed[key];
      if (value && typeof value === 'object' && typeof value.remoteSessionId === 'string' && value.remoteSessionId.length > 0) {
        ids.add(value.remoteSessionId);
      } else if (key.startsWith(prefix) && key.length > prefix.length) {
        ids.add(key.substring(prefix.length));
      }
    }
  } catch (error) {
    return;
  }
}

function parseEnabledFeatures(text) {
  const enabled = new Set();
  if (typeof text !== 'string' || text.length === 0) {
    return enabled;
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([a-z0-9_]+)\s+.+\s+(true|false)$/i);
    if (match && match[2].toLowerCase() === 'true') {
      enabled.add(match[1]);
    }
  }
  return enabled;
}

function normalizeScanOptions(options) {
  const input = options && typeof options === 'object' ? options : {};
  const mode = typeof input.mode === 'string' ? input.mode : '';
  const deep = typeof input.deep === 'boolean' ? input.deep : mode === 'deep';
  return {
    deep,
    commandTimeoutMs: deep ? 7000 : 1200,
    httpTimeoutMs: deep ? 1500 : 650,
    healthTimeoutMs: deep ? 800 : 350
  };
}

async function scanOpenCodeCompatibleMetadata(providerId, command, url, options) {
  const metadata = {
    version: '',
    modelCount: 0,
    sessionCount: 0,
    capabilities: [],
    detail: ''
  };
  const scanOptions = normalizeScanOptions(options);
  if (typeof command === 'string' && command.length > 0) {
    const versionResult = await runCommandCapture(command, ['--version'], scanOptions.commandTimeoutMs);
    metadata.version = versionResult.ok ? firstOutputLine(versionResult.stdout) : '';
  }
  if (!scanOptions.deep) {
    if (metadata.version.length > 0) {
      metadata.capabilities.push('model');
    }
    metadata.capabilities.push('sessions');
    metadata.capabilities.push('workspace');
    metadata.capabilities.push('tools');
    metadata.capabilities.push('events');
    return metadata;
  }
  const [providersBody, providerBody, sessionsBody, apiSessionsBody] = await Promise.all([
    requestJson(url, '/config/providers', scanOptions.httpTimeoutMs),
    requestJson(url, '/provider', scanOptions.httpTimeoutMs),
    requestJson(url, '/session?limit=1000', scanOptions.httpTimeoutMs),
    requestJson(url, '/api/session?limit=1000', scanOptions.httpTimeoutMs)
  ]);
  metadata.modelCount = Math.max(parseOpenCodeModelCount(providersBody), parseOpenCodeModelCount(providerBody));
  const sessionIds = new Set();
  collectSessionIdsFromBody(sessionsBody, sessionIds);
  collectSessionIdsFromBody(apiSessionsBody, sessionIds);
  collectLocalDatabaseSessionIds(providerId, sessionIds);
  collectBridgeMetadataSessionIds(providerId, sessionIds);
  metadata.sessionCount = sessionIds.size;
  if (metadata.modelCount > 0) {
    metadata.capabilities.push('model');
  }
  if (metadata.sessionCount > 0) {
    metadata.capabilities.push('sessions');
  }
  metadata.capabilities.push('workspace');
  metadata.capabilities.push('tools');
  metadata.capabilities.push('events');
  return metadata;
}

async function scanCodexMetadata(command, options) {
  const metadata = {
    version: '',
    modelCount: 0,
    sessionCount: 0,
    capabilities: [],
    detail: ''
  };
  if (typeof command !== 'string' || command.length === 0) {
    return metadata;
  }
  const scanOptions = normalizeScanOptions(options);
  if (!scanOptions.deep) {
    const versionResult = await runCommandCapture(command, ['--version'], scanOptions.commandTimeoutMs);
    metadata.version = versionResult.ok ? firstOutputLine(versionResult.stdout).replace(/^codex-cli\s+/i, '') : '';
    metadata.capabilities.push('model');
    metadata.capabilities.push('workspace');
    metadata.capabilities.push('shell');
    metadata.capabilities.push('reasoning');
    metadata.capabilities.push('speed');
    return metadata;
  }
  const [
    versionResult,
    rootHelpResult,
    execHelpResult,
    modelResult,
    featuresResult
  ] = await Promise.all([
    runCommandCapture(command, ['--version'], 3000),
    runCommandCapture(command, ['--help'], 5000),
    runCommandCapture(command, ['exec', '--help'], 5000),
    runCommandCapture(command, ['debug', 'models'], 8000),
    runCommandCapture(command, ['features', 'list'], 5000)
  ]);
  metadata.version = versionResult.ok ? firstOutputLine(versionResult.stdout).replace(/^codex-cli\s+/i, '') : '';
  metadata.modelCount = modelResult.ok ? parseCodexVisibleModelCount(modelResult.stdout) : 0;
  const helpText = (rootHelpResult.ok ? rootHelpResult.stdout : '') + '\n' + (execHelpResult.ok ? execHelpResult.stdout : '');
  const enabledFeatures = parseEnabledFeatures(featuresResult.ok ? featuresResult.stdout : '');
  if (outputIncludes(helpText, '--model <model>')) {
    metadata.capabilities.push('model');
  }
  if (outputIncludes(helpText, '--cd <dir>')) {
    metadata.capabilities.push('workspace');
  }
  if (outputIncludes(helpText, '--search')) {
    metadata.capabilities.push('search');
  }
  if (outputIncludes(helpText, '--image <file>')) {
    metadata.capabilities.push('image');
  }
  if (enabledFeatures.has('shell_tool') || enabledFeatures.has('shell_snapshot') || outputIncludes(helpText, '--sandbox <sandbox_mode>')) {
    metadata.capabilities.push('shell');
  }
  if (enabledFeatures.has('multi_agent') || enabledFeatures.has('multi_agent_v2')) {
    metadata.capabilities.push('subagents');
  }
  if (enabledFeatures.has('browser_use') || enabledFeatures.has('browser_use_external') || enabledFeatures.has('in_app_browser')) {
    metadata.capabilities.push('browser');
  }
  if (enabledFeatures.has('computer_use')) {
    metadata.capabilities.push('computer-use');
  }
  return metadata;
}

async function scanCliMetadata(providerId, command, options) {
  if (providerId === 'codex') {
    return await scanCodexMetadata(command, options);
  }
  const scanOptions = normalizeScanOptions(options);
  const metadata = {
    version: '',
    modelCount: 0,
    sessionCount: 0,
    capabilities: [],
    detail: ''
  };
  if (typeof command !== 'string' || command.length === 0) {
    return metadata;
  }
  const versionResult = await runCommandCapture(command, ['--version'], scanOptions.deep ? 3000 : scanOptions.commandTimeoutMs);
  metadata.version = versionResult.ok ? firstOutputLine(versionResult.stdout) : '';
  return metadata;
}

async function scanOpenClawGatewayMetadata(url, options) {
  const scanOptions = normalizeScanOptions(options);
  const metadata = {
    version: '',
    modelCount: 0,
    sessionCount: 0,
    capabilities: ['responses', 'sse'],
    detail: ''
  };
  const body = await requestJson(url, '/v1/models', scanOptions.healthTimeoutMs);
  if (body && typeof body === 'object') {
    const models = readArrayFromValue(body, 0);
    metadata.modelCount = models.length;
    metadata.detail = 'Responses API';
  }
  return metadata;
}

async function scanHermesStudioMetadata(url, options) {
  const scanOptions = normalizeScanOptions(options);
  const metadata = {
    version: '',
    modelCount: 0,
    sessionCount: 0,
    capabilities: ['chat-run'],
    detail: ''
  };
  const health = await requestJson(url, '/api/health', scanOptions.healthTimeoutMs);
  if (health && typeof health === 'object') {
    metadata.version = typeof health.version === 'string' ? health.version : '';
    metadata.detail = 'Hermes Studio BFF';
  }
  return metadata;
}

async function scanProvider(provider, overrides, options) {
  const command = await firstAvailableCommand(commandCandidatesFor(provider, overrides));
  const url = providerUrl(provider.id, provider.defaultUrl, overrides);
  const scanOptions = normalizeScanOptions(options);
  const serverHealthy = await checkHttpHealth(url, scanOptions.healthTimeoutMs, provider.healthPaths);
  let metadata = {
      version: '',
      modelCount: 0,
      sessionCount: 0,
      capabilities: [],
      detail: ''
    };
  if (provider.id === 'opencode' || provider.id === 'deveco' || provider.id === 'mimo') {
    metadata = await scanOpenCodeCompatibleMetadata(provider.id, command, url, scanOptions);
  } else if (provider.id === 'openclaw-gateway') {
    metadata = await scanOpenClawGatewayMetadata(url, scanOptions);
  } else if (provider.id === 'hermes-studio') {
    metadata = await scanHermesStudioMetadata(url, scanOptions);
  } else if (command.length > 0) {
    metadata = await scanCliMetadata(provider.id, command, scanOptions);
  }
  return {
    id: provider.id,
    displayName: provider.displayName,
    command,
    installed: provider.id === 'mock' || command.length > 0,
    serverHealthy,
    defaultUrl: url,
    canStartServer: provider.canStartServer,
    version: metadata.version,
    modelCount: metadata.modelCount,
    sessionCount: metadata.sessionCount,
    capabilities: metadata.capabilities,
    detail: metadata.detail
  };
}

async function scanProviders(overrides, options) {
  const tasks = [];
  const scanOptions = normalizeScanOptions(options);
  for (const provider of PROVIDERS) {
    tasks.push(scanProvider(provider, overrides, scanOptions));
  }
  return await Promise.all(tasks);
}

function commandCandidatesFor(provider, overrides) {
  const candidates = [];
  const override = providerCommand(provider.id, overrides);
  if (override.length > 0) {
    candidates.push(override);
  }
  for (const item of provider.commandCandidates) {
    if (!candidates.includes(item)) {
      candidates.push(item);
    }
  }
  return candidates;
}

function providerCommand(providerId, overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return '';
  }
  if (providerId === 'opencode' && typeof overrides.openCodeCommand === 'string') {
    return overrides.openCodeCommand;
  }
  if (providerId === 'deveco' && typeof overrides.devEcoCommand === 'string') {
    return overrides.devEcoCommand;
  }
  if (providerId === 'mimo' && typeof overrides.mimoCodeCommand === 'string') {
    return overrides.mimoCodeCommand;
  }
  if (providerId === 'codex' && typeof overrides.codexCommand === 'string') {
    return overrides.codexCommand;
  }
  if (providerId === 'claude' && typeof overrides.claudeCommand === 'string') {
    return overrides.claudeCommand;
  }
  if (providerId === 'antigravity' && typeof overrides.antigravityCommand === 'string') {
    return overrides.antigravityCommand;
  }
  if (providerId === 'openclaw' && typeof overrides.openClawCommand === 'string') {
    return overrides.openClawCommand;
  }
  if (providerId === 'openclaw-gateway' && typeof overrides.openClawCommand === 'string') {
    return overrides.openClawCommand;
  }
  if (providerId === 'hermes' && typeof overrides.hermesCommand === 'string') {
    return overrides.hermesCommand;
  }
  if (providerId === 'hermes-studio' && typeof overrides.hermesStudioCommand === 'string') {
    return overrides.hermesStudioCommand;
  }
  return '';
}

function providerUrl(providerId, fallbackValue, overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return fallbackValue;
  }
  if (providerId === 'opencode' && typeof overrides.openCodeUrl === 'string' && overrides.openCodeUrl.length > 0) {
    return overrides.openCodeUrl;
  }
  if (providerId === 'deveco' && typeof overrides.devEcoUrl === 'string' && overrides.devEcoUrl.length > 0) {
    return overrides.devEcoUrl;
  }
  if (providerId === 'mimo' && typeof overrides.mimoCodeUrl === 'string' && overrides.mimoCodeUrl.length > 0) {
    return overrides.mimoCodeUrl;
  }
  if (providerId === 'openclaw-gateway' && typeof overrides.openClawGatewayUrl === 'string' && overrides.openClawGatewayUrl.length > 0) {
    return overrides.openClawGatewayUrl;
  }
  if (providerId === 'hermes-studio' && typeof overrides.hermesStudioUrl === 'string' && overrides.hermesStudioUrl.length > 0) {
    return overrides.hermesStudioUrl;
  }
  return fallbackValue;
}

function recommendedProviderId(scanResults, fallbackValue) {
  for (const item of scanResults) {
    if (item.serverHealthy) {
      return item.id;
    }
  }
  for (const item of scanResults) {
    if (item.installed && item.id !== 'mock') {
      return item.id;
    }
  }
  return fallbackValue && fallbackValue.length > 0 ? fallbackValue : 'mock';
}

module.exports = {
  PROVIDERS,
  recommendedProviderId,
  scanProviders
};
