'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventType, makeEvent } = require('../protocol');
const { buildPromptWithContext } = require('./context-utils');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_STDIO_RESPONSE_IDLE_MS = 180;
const DEFAULT_STDIO_STARTUP_TIMEOUT_MS = 4000;
const MAX_STDIO_RECENT_OUTPUT_TAIL_BYTES = 8192;
const MAX_HISTORY_SESSIONS = 500;
const MAX_HISTORY_LINE_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_READ_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_TAIL_BYTES = 16 * 1024 * 1024;
const CODEX_TITLE_DEEP_SCAN_MAX_LINES = 4096;

function readStringValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'string') {
    return value;
  }
  return fallbackValue;
}

function readNumberValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallbackValue;
}

function readBooleanValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return fallbackValue;
}

function normalizeCliRuntimeMode(value) {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return mode === 'stdio' ? 'stdio' : 'oneshot';
}

function createCliRuntimeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    for (const key of Object.keys(details)) {
      error[key] = details[key];
    }
  }
  return error;
}

function patternMatches(patternText, value) {
  if (typeof patternText !== 'string' || patternText.length === 0) {
    return false;
  }
  const text = typeof value === 'string' ? value : '';
  if (text.length === 0) {
    return false;
  }
  try {
    return new RegExp(patternText).test(text);
  } catch (error) {
    return text.indexOf(patternText) >= 0;
  }
}

function appendRecentOutputTail(existing, text) {
  const next = (typeof existing === 'string' ? existing : '') + (typeof text === 'string' ? text : '');
  const bytes = Buffer.byteLength(next, 'utf8');
  if (bytes <= MAX_STDIO_RECENT_OUTPUT_TAIL_BYTES) {
    return next;
  }
  const buffer = Buffer.from(next, 'utf8');
  return buffer.subarray(Math.max(0, buffer.length - MAX_STDIO_RECENT_OUTPUT_TAIL_BYTES)).toString('utf8');
}

function readArrayValue(source, key) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  const value = source[key];
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function normalizeStringArray(value) {
  const items = [];
  if (!Array.isArray(value)) {
    return items;
  }
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) {
      items.push(item);
    }
  }
  return items;
}

function readObjectValue(source, key) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return null;
}

function normalizeEnvObject(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === 'string') {
      result[key] = item;
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      result[key] = String(item);
    }
  }
  return result;
}

function safeJsonText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function splitArgs(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (escaped) {
      current = current + char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote.length > 0) {
      if (char === quote) {
        quote = '';
      } else {
        current = current + char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current = current + char;
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function normalizeClaudeCommandArgs(args) {
  if (!Array.isArray(args)) {
    return [];
  }
  const items = [];
  let hasPrint = false;
  let hasStreamJson = false;
  let hasVerbose = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (typeof arg !== 'string' || arg.length === 0) {
      continue;
    }
    items.push(arg);
    if (arg === '-p' || arg === '--print') {
      hasPrint = true;
    }
    if (arg === '--verbose') {
      hasVerbose = true;
    }
    if (arg === '--output-format' && index + 1 < args.length && args[index + 1] === 'stream-json') {
      hasStreamJson = true;
    }
    if (arg === '--output-format=stream-json') {
      hasStreamJson = true;
    }
  }
  if (hasPrint && hasStreamJson && !hasVerbose) {
    const insertIndex = Math.min(1, items.length);
    items.splice(insertIndex, 0, '--verbose');
  }
  return items;
}

function terminateChildProcess(child) {
  if (!child || typeof child.kill !== 'function') {
    return false;
  }
  let requested = false;
  if (process.platform === 'win32' && child.pid) {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      killer.on('error', () => {});
      requested = true;
    } catch (error) {
      // Fall back to child.kill below.
    }
  }
  try {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      child.kill('SIGTERM');
    }
    requested = true;
  } catch (error) {
    // Ignore kill failures; the process may already be gone.
  }
  return requested;
}

function waitForChildProcessExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      child.removeListener('exit', onExit);
      child.removeListener('close', onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

function commandExists(command) {
  return new Promise((resolve) => {
    if (typeof command !== 'string' || command.length === 0) {
      resolve(false);
      return;
    }
    const child = spawn(command, ['--version'], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'ignore']
    });
    let settled = false;
    const finish = (available) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(available);
    };
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === 0));
    setTimeout(() => {
      if (!settled) {
        child.kill();
        finish(false);
      }
    }, 3000);
  });
}

function runCommandCapture(command, args, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof command !== 'string' || command.length === 0) {
      resolve({
        ok: false,
        code: -1,
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
        // Ignore kill failures while probing local CLI metadata.
      }
      finish({
        ok: false,
        code: -1,
        stdout,
        stderr,
        error: 'Timed out after ' + String(timeoutMs) + 'ms'
      });
    }, timeoutMs);
    child.on('error', (error) => {
      finish({
        ok: false,
        code: -1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    child.stdout.on('data', (chunk) => {
      stdout = stdout + Buffer.from(chunk).toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr = stderr + Buffer.from(chunk).toString('utf8');
    });
    child.on('exit', (code) => {
      const exitCode = typeof code === 'number' ? code : -1;
      finish({
        ok: exitCode === 0,
        code: exitCode,
        stdout,
        stderr,
        error: exitCode === 0 ? '' : (stderr.trim().length > 0 ? stderr.trim() : 'Exited with code ' + String(exitCode))
      });
    });
  });
}

function createSessionId(providerId) {
  return providerId + ':' + crypto.randomBytes(8).toString('hex');
}

function createUuidSessionId(providerId) {
  return providerId + ':' + crypto.randomUUID();
}

function remoteSessionIdFromLocalSessionId(providerId, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return '';
  }
  const prefix = providerId + ':';
  if (sessionId.startsWith(prefix)) {
    return sessionId.substring(prefix.length);
  }
  return sessionId;
}

function isUuidText(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeFileStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    return null;
  }
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

function safeReadTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function listJsonlFiles(rootPath, maxFiles) {
  const rootStat = safeFileStat(rootPath);
  if (!rootStat || !rootStat.isDirectory() || maxFiles <= 0) {
    return [];
  }
  const candidates = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = safeReadDir(current);
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl')) {
        const stat = safeFileStat(fullPath);
        if (stat && stat.isFile()) {
          candidates.push({
            filePath: fullPath,
            mtimeMs: stat.mtimeMs
          });
        }
      }
    }
  }
  candidates.sort((left, right) => {
    return right.mtimeMs - left.mtimeMs;
  });
  return candidates.slice(0, maxFiles).map((item) => item.filePath);
}

function parseJsonLine(line) {
  if (typeof line !== 'string' || line.trim().length === 0 || line.length > MAX_HISTORY_LINE_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function readFileTextWindow(filePath, fromEnd, maxBytes) {
  const stat = safeFileStat(filePath);
  if (!stat || !stat.isFile() || stat.size <= 0 || maxBytes <= 0) {
    return {
      text: '',
      offset: 0
    };
  }
  const byteLength = Math.min(stat.size, maxBytes);
  const offset = fromEnd ? Math.max(0, stat.size - byteLength) : 0;
  const buffer = Buffer.alloc(byteLength);
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, byteLength, offset);
    return {
      text: buffer.subarray(0, bytesRead).toString('utf8'),
      offset
    };
  } catch (error) {
    return {
      text: '',
      offset: 0
    };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (error) {
        // Ignore close failures while scanning best-effort CLI histories.
      }
    }
  }
}

function parseJsonLinesFromText(text, maxLines, skipFirstLine, keepLast) {
  if (typeof text !== 'string' || text.length === 0 || maxLines <= 0) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const result = [];
  const startIndex = skipFirstLine ? 1 : 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    const parsed = parseJsonLine(lines[index]);
    if (parsed) {
      result.push(parsed);
      if (!keepLast && result.length >= maxLines) {
        break;
      }
    }
  }
  if (keepLast && result.length > maxLines) {
    return result.slice(result.length - maxLines);
  }
  return result;
}

function readFirstJsonLines(filePath, maxLines) {
  const window = readFileTextWindow(filePath, false, MAX_HISTORY_READ_BYTES);
  return parseJsonLinesFromText(window.text, maxLines, false, false);
}

function readLastJsonLines(filePath, maxLines) {
  const window = readFileTextWindow(filePath, true, MAX_HISTORY_TAIL_BYTES);
  return parseJsonLinesFromText(window.text, maxLines, window.offset > 0, true);
}

function readSampledJsonLines(filePath, firstLineCount, lastLineCount) {
  const records = [];
  const seen = new Set();
  const samples = readFirstJsonLines(filePath, firstLineCount).concat(readLastJsonLines(filePath, lastLineCount));
  for (const record of samples) {
    const key = safeJsonText(record);
    if (!seen.has(key)) {
      seen.add(key);
      records.push(record);
    }
  }
  return records;
}

function readAllJsonLines(filePath) {
  const window = readFileTextWindow(filePath, false, MAX_HISTORY_TAIL_BYTES);
  return parseJsonLinesFromText(window.text, Number.MAX_SAFE_INTEGER, false, false);
}

function textFromContentParts(value) {
  const fragments = [];
  collectTextFragments(value, fragments, 0);
  return fragments.join('\n').trim();
}

const CODEX_INTERNAL_WRAPPER_TAGS = [
  'environment_context',
  'turn_aborted'
];
const CODEX_SESSION_TITLE_MAX_LENGTH = 80;

function isCodexInternalWrapperText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized.length === 0) {
    return false;
  }
  for (const tag of CODEX_INTERNAL_WRAPPER_TAGS) {
    const openTag = '<' + tag + '>';
    const closeTag = '</' + tag + '>';
    if (normalized.startsWith(openTag) && normalized.endsWith(closeTag)) {
      return true;
    }
  }
  return false;
}

function isCodexSystemUserMessageText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized.length === 0) {
    return true;
  }
  if (isCodexInternalWrapperText(normalized)) {
    return true;
  }
  if (normalized.startsWith('# AGENTS.md instructions') || normalized.startsWith('AGENTS.md instructions')) {
    return true;
  }
  if (normalized.startsWith('<environment_context>') || normalized.indexOf('<environment_context>') >= 0) {
    return true;
  }
  if (normalized.startsWith('<permissions instructions>') || normalized.indexOf('<permissions instructions>') >= 0) {
    return true;
  }
  if (normalized.indexOf('<INSTRUCTIONS>') >= 0 && normalized.indexOf('# AGENTS') >= 0) {
    return true;
  }
  if (normalized.startsWith('The following is the Codex agent history whose request action')) {
    return true;
  }
  return false;
}

function isClaudeInternalUserMessage(record, text) {
  if (!record || typeof record !== 'object') {
    return true;
  }
  if (readBooleanValue(record, 'isMeta', false) || readBooleanValue(record, 'isSidechain', false)) {
    return true;
  }
  const userType = readStringValue(record, 'userType', '');
  if (userType === 'system' || userType === 'internal') {
    return true;
  }
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.startsWith('<system-reminder>') || normalized.indexOf('<system-reminder>') >= 0) {
    return true;
  }
  if (normalized.startsWith('<environment_context>') || normalized.indexOf('<environment_context>') >= 0) {
    return true;
  }
  if (normalized.startsWith('<permissions instructions>') || normalized.indexOf('<permissions instructions>') >= 0) {
    return true;
  }
  if (normalized.startsWith('# AGENTS.md instructions') || normalized.indexOf('<INSTRUCTIONS>') >= 0) {
    return true;
  }
  return false;
}

function contentPartText(part) {
  if (typeof part === 'string') {
    return part;
  }
  if (!part || typeof part !== 'object') {
    return '';
  }
  return readStringValue(part, 'text', '');
}

function textFromClaudeUserContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return textFromContentParts(content);
  }
  const fragments = [];
  for (const part of content) {
    if (typeof part === 'string') {
      if (part.trim().length > 0) {
        fragments.push(part.trim());
      }
      continue;
    }
    if (!part || typeof part !== 'object') {
      continue;
    }
    const partType = readStringValue(part, 'type', '');
    if (partType.length > 0 && partType !== 'text') {
      continue;
    }
    const text = contentPartText(part).trim();
    if (text.length > 0 && !isClaudeInternalUserMessage({}, text)) {
      fragments.push(text);
    }
  }
  return fragments.join('\n').trim();
}

function shouldImportCodexHistoryMessage(role, phase, text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return false;
  }
  if (role === 'assistant') {
    return phase.length === 0 || phase === 'commentary' || phase === 'final_answer';
  }
  if (role === 'user') {
    if (phase.length > 0) {
      return false;
    }
    return !isCodexSystemUserMessageText(text);
  }
  return false;
}

function normalizeCodexSessionTitleText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  let normalized = text.split(/\s+/).join(' ').trim();
  if (normalized.length === 0) {
    return '';
  }
  const slashCommand = normalized.match(/^\/([A-Za-z0-9_-]+)\s+(.+)$/);
  if (slashCommand && typeof slashCommand[2] === 'string') {
    normalized = slashCommand[2].trim();
  }
  if (normalized.length <= CODEX_SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }
  return normalized.substring(0, CODEX_SESSION_TITLE_MAX_LENGTH - 3).trim() + '...';
}

function isCodexNonTitleInstructionText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.startsWith('# AGENTS.md instructions')) {
    return true;
  }
  if (normalized.startsWith('AGENTS.md instructions')) {
    return true;
  }
  if (normalized === 'AGENTS' || normalized.startsWith('# AGENTS') || normalized.startsWith('AGENTS ')) {
    return true;
  }
  if (normalized.startsWith('# Files mentioned by the user:')) {
    return true;
  }
  if (normalized.startsWith('<permissions instructions>')) {
    return true;
  }
  if (normalized.startsWith('<environment_context>')) {
    return true;
  }
  if (normalized.startsWith('The following is the Codex agent history whose request action')) {
    return true;
  }
  return normalized.indexOf('<INSTRUCTIONS>') >= 0 && normalized.indexOf('# AGENTS') >= 0;
}

function extractCodexRequestText(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return '';
  }
  const marker = '## My request for Codex:';
  const fallbackMarker = 'My request for Codex:';
  let text = source.trim();
  let markerIndex = text.indexOf(marker);
  if (markerIndex >= 0) {
    text = text.substring(markerIndex + marker.length).trim();
  } else {
    markerIndex = text.indexOf(fallbackMarker);
    if (markerIndex >= 0) {
      text = text.substring(markerIndex + fallbackMarker.length).trim();
    }
  }
  if (isCodexNonTitleInstructionText(text)) {
    return '';
  }
  const lines = text.split(/\r?\n/);
  const titleLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith('# Files mentioned by the user:')) {
      continue;
    }
    if (trimmed.startsWith('## ') && trimmed.endsWith(':')) {
      continue;
    }
    if (trimmed.startsWith('<image ')) {
      continue;
    }
    if (isCodexNonTitleInstructionText(trimmed)) {
      return '';
    }
    titleLines.push(trimmed);
    if (titleLines.join(' ').length >= CODEX_SESSION_TITLE_MAX_LENGTH) {
      break;
    }
  }
  return titleLines.join(' ');
}

function codexSessionTitleFromText(text) {
  return normalizeCodexSessionTitleText(extractCodexRequestText(text));
}

function codexSessionTitleFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return '';
  }
  if (record.type === 'turn_context') {
    const payload = readObjectValue(record, 'payload');
    if (payload) {
      const title = codexSessionTitleFromText(readStringValue(payload, 'user_instructions', ''));
      if (title.length > 0) {
        return title;
      }
    }
    return '';
  }
  if (record.type === 'event_msg') {
    const payload = readObjectValue(record, 'payload');
    if (!payload || readStringValue(payload, 'type', '') !== 'user_message') {
      return '';
    }
    const directTitle = codexSessionTitleFromText(readStringValue(payload, 'message', ''));
    if (directTitle.length > 0) {
      return directTitle;
    }
    return codexSessionTitleFromText(textFromContentParts(payload.text_elements));
  }
  if (record.type !== 'response_item') {
    return '';
  }
  const payload = readObjectValue(record, 'payload');
  if (!payload || readStringValue(payload, 'type', '') !== 'message') {
    return '';
  }
  const role = readStringValue(payload, 'role', '');
  const phase = readStringValue(payload, 'phase', '');
  const text = textFromContentParts(payload.content);
  if (!shouldImportCodexHistoryMessage(role, phase, text)) {
    return '';
  }
  return codexSessionTitleFromText(text);
}

function firstCodexSessionTitleFromRecords(records) {
  if (!Array.isArray(records)) {
    return '';
  }
  for (const record of records) {
    const title = codexSessionTitleFromRecord(record);
    if (title.length > 0) {
      return title;
    }
  }
  return '';
}

function firstCodexSessionTitleFromFile(filePath) {
  const records = readFirstJsonLines(filePath, CODEX_TITLE_DEEP_SCAN_MAX_LINES);
  return firstCodexSessionTitleFromRecords(records);
}

function isSpecificCodexHistoryTitle(title, workspaceTitle, displayName) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return false;
  }
  const normalized = title.trim();
  if (normalized === displayName + ' Session') {
    return false;
  }
  if (isCodexNonTitleInstructionText(normalized)) {
    return false;
  }
  return workspaceTitle.length === 0 || normalized !== workspaceTitle;
}
function decodeClaudeProjectPath(projectKey) {
  if (typeof projectKey !== 'string' || projectKey.length === 0) {
    return '';
  }
  const normalized = projectKey.split('--').join(':\\').split('-').join(path.sep);
  if (/^[A-Za-z]:/.test(normalized)) {
    return normalized;
  }
  return projectKey;
}

function encodeClaudeProjectPath(workspacePath) {
  if (typeof workspacePath !== 'string' || workspacePath.trim().length === 0) {
    return '';
  }
  const normalized = path.resolve(workspacePath.trim()).split('\\').join('/');
  return normalized.split(':').join('').split('/').join('-');
}

function safeAppendJsonLine(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(value) + '\n', 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function safePrependJsonLines(filePath, values) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const prefix = values.map((value) => JSON.stringify(value)).join('\n') + '\n';
    const existing = safeReadTextFile(filePath);
    fs.writeFileSync(filePath, prefix + existing, 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function firstJsonLineType(filePath) {
  const records = readFirstJsonLines(filePath, 1);
  if (records.length === 0) {
    return '';
  }
  return readStringValue(records[0], 'type', '');
}

function isClaudeResumeCompatibleHistoryFile(filePath) {
  const firstType = firstJsonLineType(filePath);
  return firstType.length > 0 && firstType !== 'queue-operation';
}

function normalizeHistoryTimestamp(value, fallbackValue) {
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return normalizeTimestamp(value, fallbackValue);
}

function normalizeTimestamp(value, fallbackValue) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  if (value < 1000000000000) {
    return value * 1000;
  }
  return value;
}

function collectTextFragments(value, fragments, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 0) {
      fragments.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFragments(item, fragments, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const delta = readStringValue(value, 'delta', '');
  if (delta.length > 0) {
    fragments.push(delta);
  }
  const text = readStringValue(value, 'text', '');
  if (text.length > 0) {
    fragments.push(text);
  }
  const content = readStringValue(value, 'content', '');
  if (content.length > 0) {
    fragments.push(content);
  }
  const result = readStringValue(value, 'result', '');
  if (result.length > 0) {
    fragments.push(result);
  }
  const message = value.message;
  if (message && typeof message === 'object') {
    collectTextFragments(message, fragments, depth + 1);
  }
  const item = value.item;
  if (item && typeof item === 'object') {
    collectTextFragments(item, fragments, depth + 1);
  }
  const payload = value.payload;
  if (payload && typeof payload === 'object') {
    collectTextFragments(payload, fragments, depth + 1);
  }
  const parts = readArrayValue(value, 'parts');
  for (const part of parts) {
    collectTextFragments(part, fragments, depth + 1);
  }
  const contentParts = readArrayValue(value, 'content');
  for (const part of contentParts) {
    collectTextFragments(part, fragments, depth + 1);
  }
}

function textFromJsonLine(line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return '';
  }
  try {
    const parsed = JSON.parse(line);
    if (isToolJsonValue(parsed) || isUserRoleJsonValue(parsed)) {
      return '';
    }
    const fragments = [];
    collectTextFragments(parsed, fragments, 0);
    return fragments.join('\n').trim();
  } catch (error) {
    return '';
  }
}

function mergeCliStreamText(existingText, nextText) {
  if (typeof nextText !== 'string' || nextText.length === 0) {
    return typeof existingText === 'string' ? existingText : '';
  }
  if (typeof existingText !== 'string' || existingText.length === 0) {
    return nextText;
  }
  if (existingText === nextText || existingText.endsWith(nextText)) {
    return existingText;
  }
  if (nextText.startsWith(existingText)) {
    return nextText;
  }
  return existingText + nextText;
}

function deltaFromCliStreamText(previousText, nextText) {
  if (typeof nextText !== 'string' || nextText.length === 0) {
    return '';
  }
  if (typeof previousText !== 'string' || previousText.length === 0) {
    return nextText;
  }
  if (previousText === nextText || previousText.endsWith(nextText)) {
    return '';
  }
  if (nextText.startsWith(previousText)) {
    return nextText.substring(previousText.length);
  }
  return nextText;
}

function cliRunText(output) {
  if (typeof output === 'string') {
    return output;
  }
  if (output && typeof output === 'object') {
    return readStringValue(output, 'text', '');
  }
  return '';
}

function cliRunToolStatus(output) {
  if (output && typeof output === 'object') {
    return readStringValue(output, 'toolStatus', 'completed');
  }
  return 'completed';
}

function cliRunSkipsAssistantCompletion(output) {
  if (output && typeof output === 'object') {
    return readBooleanValue(output, 'skipAssistantCompletion', false);
  }
  return false;
}

function firstStringValue(source, keys) {
  for (const key of keys) {
    const value = readStringValue(source, key, '');
    if (value.length > 0) {
      return value;
    }
  }
  return '';
}

function codexModelIdFromValue(source) {
  const modelId = firstStringValue(source, [
    'modelId',
    'model_id',
    'model',
    'modelSlug',
    'model_slug',
    'modelName',
    'model_name',
    'selectedModel',
    'selected_model'
  ]).trim();
  if (modelId.length > 0) {
    return modelId;
  }
  const model = readObjectValue(source, 'model');
  if (model) {
    return firstStringValue(model, ['id', 'slug', 'name']).trim();
  }
  return '';
}

function firstPayloadText(source, keys) {
  for (const key of keys) {
    if (!source || typeof source !== 'object') {
      return '';
    }
    const value = source[key];
    const text = safeJsonText(value);
    if (text.length > 0) {
      return text;
    }
  }
  return '';
}

function isToolLikeType(typeText) {
  const lower = typeof typeText === 'string' ? typeText.toLowerCase() : '';
  return lower.indexOf('tool') >= 0 ||
    lower.indexOf('function_call') >= 0 ||
    lower.indexOf('function-call') >= 0 ||
    lower.indexOf('exec_command') >= 0 ||
    lower.indexOf('shell') >= 0 ||
    lower.indexOf('apply_patch') >= 0 ||
    lower.indexOf('command') >= 0;
}

function isToolJsonValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isToolJsonValue(item)) {
        return true;
      }
    }
    return false;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const typeText = firstStringValue(value, ['type', 'event', 'kind']);
  if (isToolLikeType(typeText)) {
    return true;
  }
  const payload = readObjectValue(value, 'payload');
  if (payload && isToolJsonValue(payload)) {
    return true;
  }
  const item = readObjectValue(value, 'item');
  if (item && isToolJsonValue(item)) {
    return true;
  }
  const content = value.content;
  if (content && isToolJsonValue(content)) {
    return true;
  }
  const parts = value.parts;
  if (parts && isToolJsonValue(parts)) {
    return true;
  }
  return false;
}

function isUserRoleJsonValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isUserRoleJsonValue(item)) {
        return true;
      }
    }
    return false;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const typeText = firstStringValue(value, ['type', 'role']);
  if (typeText.toLowerCase() === 'user') {
    return true;
  }
  const message = readObjectValue(value, 'message');
  if (message) {
    const messageRole = readStringValue(message, 'role', '').toLowerCase();
    if (messageRole === 'user') {
      return true;
    }
  }
  return false;
}

function normalizeCliPermissionReply(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'once';
  }
  const lower = value.toLowerCase();
  if (lower === 'allow' || lower === 'approve' || lower === 'approved' || lower === 'yes') {
    return 'once';
  }
  if (lower === 'deny' || lower === 'denied' || lower === 'reject' || lower === 'rejected' || lower === 'no') {
    return 'reject';
  }
  if (lower === 'always') {
    return 'always';
  }
  if (lower === 'once') {
    return 'once';
  }
  return 'once';
}

function extractClaudePermissionDenialText(value, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.indexOf('Claude requested permissions to ') >= 0 &&
      normalized.indexOf("but you haven't granted it yet") >= 0) {
      return normalized;
    }
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractClaudePermissionDenialText(item, depth + 1);
      if (text.length > 0) {
        return text;
      }
    }
    return '';
  }
  if (typeof value !== 'object') {
    return '';
  }
  const fields = ['text', 'content', 'result', 'message', 'output', 'error'];
  for (const field of fields) {
    const fieldValue = value[field];
    const text = extractClaudePermissionDenialText(fieldValue, depth + 1);
    if (text.length > 0) {
      return text;
    }
  }
  const payload = readObjectValue(value, 'payload');
  if (payload) {
    return extractClaudePermissionDenialText(payload, depth + 1);
  }
  return '';
}

function hasClaudePermissionToolResult(value, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (hasClaudePermissionToolResult(item, depth + 1)) {
        return true;
      }
    }
    return false;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const typeText = readStringValue(value, 'type', '').toLowerCase();
  if (typeText === 'tool_result' && extractClaudePermissionDenialText(value, depth).length > 0) {
    return true;
  }
  const message = readObjectValue(value, 'message');
  if (message && hasClaudePermissionToolResult(message, depth + 1)) {
    return true;
  }
  const payload = readObjectValue(value, 'payload');
  if (payload && hasClaudePermissionToolResult(payload, depth + 1)) {
    return true;
  }
  const content = value.content;
  if (content && hasClaudePermissionToolResult(content, depth + 1)) {
    return true;
  }
  return false;
}

function isClaudePermissionDenialJsonLine(line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return false;
  }
  try {
    return hasClaudePermissionToolResult(JSON.parse(line), 0);
  } catch (error) {
    return false;
  }
}

function claudePermissionTargetFromAction(actionText) {
  const prefixes = [
    'read from ',
    'write to ',
    'edit ',
    'execute ',
    'access '
  ];
  for (const prefix of prefixes) {
    if (actionText.indexOf(prefix) === 0 && actionText.length > prefix.length) {
      return actionText.substring(prefix.length).trim();
    }
  }
  return '';
}

function claudePermissionTypeFromAction(actionText) {
  if (actionText.indexOf('read') === 0) {
    return 'read';
  }
  if (actionText.indexOf('write') === 0 || actionText.indexOf('edit') === 0) {
    return 'write';
  }
  if (actionText.indexOf('execute') === 0) {
    return 'execute';
  }
  return 'permission';
}

function makeClaudePermissionEvent(providerId, source) {
  if (!hasClaudePermissionToolResult(source, 0)) {
    return null;
  }
  const text = extractClaudePermissionDenialText(source, 0);
  if (text.length === 0) {
    return null;
  }
  const marker = 'Claude requested permissions to ';
  const suffix = ", but you haven't granted it yet";
  let actionText = '';
  const markerIndex = text.indexOf(marker);
  const suffixIndex = text.indexOf(suffix);
  if (markerIndex >= 0 && suffixIndex > markerIndex) {
    actionText = text.substring(markerIndex + marker.length, suffixIndex).trim();
  }
  const toolCallId = firstStringValue(source, ['tool_use_id', 'toolUseId', 'toolCallId', 'tool_call_id', 'id']);
  const requestId = toolCallId.length > 0 ? toolCallId :
    providerId + '_permission_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12);
  const permissionType = claudePermissionTypeFromAction(actionText);
  const targetPath = claudePermissionTargetFromAction(actionText);
  return {
    requestId,
    permissionId: requestId,
    kind: 'permission',
    title: 'Claude permission required',
    prompt: text,
    permission: {
      type: permissionType,
      path: targetPath,
      action: actionText,
      metadata: {
        path: targetPath,
        filePath: targetPath
      }
    },
    status: 'pending',
    rawJson: safeJsonText(source)
  };
}

function parsePermissionEventsFromJsonLine(providerId, line) {
  if (providerId !== 'claude' || typeof line !== 'string' || line.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(line);
    const event = makeClaudePermissionEvent(providerId, parsed);
    return event ? [event] : [];
  } catch (error) {
    return [];
  }
}

function isRequestLikeType(typeText) {
  const lower = typeof typeText === 'string' ? typeText.toLowerCase() : '';
  return lower.indexOf('request_user_input') >= 0 ||
    lower.indexOf('user_input') >= 0 ||
    lower.indexOf('question') >= 0;
}

function isPlanLikeType(typeText) {
  const lower = typeof typeText === 'string' ? typeText.toLowerCase() : '';
  return lower === 'plan' ||
    lower.indexOf('plan.request') >= 0 ||
    lower.indexOf('plan_requested') >= 0 ||
    lower.indexOf('plan-requested') >= 0 ||
    lower.indexOf('proposal') >= 0;
}

function normalizeToolStatus(typeText, source) {
  const lower = typeof typeText === 'string' ? typeText.toLowerCase() : '';
  const direct = firstStringValue(source, ['status', 'state']);
  const directLower = direct.toLowerCase();
  if (directLower === 'completed' || directLower === 'complete' || directLower === 'success' || directLower === 'succeeded') {
    return 'completed';
  }
  if (directLower === 'error' || directLower === 'failed' || directLower === 'failure') {
    return 'error';
  }
  if (directLower === 'running' || directLower === 'started' || directLower === 'pending') {
    return 'started';
  }
  if (lower.indexOf('result') >= 0 || lower.indexOf('output') >= 0 || lower.indexOf('completed') >= 0 || lower.indexOf('complete') >= 0) {
    return 'completed';
  }
  if (lower.indexOf('error') >= 0 || lower.indexOf('failed') >= 0) {
    return 'error';
  }
  return 'started';
}

function normalizeRequestOptions(source) {
  const candidates = readArrayValue(source, 'options');
  const result = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    if (typeof item === 'string') {
      result.push({
        id: item,
        label: item,
        description: ''
      });
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const label = firstStringValue(item, ['label', 'title', 'text', 'value', 'id']);
      if (label.length === 0) {
        continue;
      }
      const id = firstStringValue(item, ['id', 'value', 'label']);
      result.push({
        id: id.length > 0 ? id : label,
        label,
        description: firstStringValue(item, ['description', 'detail', 'hint'])
      });
    }
  }
  return result;
}

function isAskUserQuestionToolName(nameText) {
  const lower = typeof nameText === 'string' ? nameText.toLowerCase() : '';
  return lower === 'askuserquestion' ||
    lower === 'ask_user_question' ||
    lower === 'ask-user-question' ||
    lower.indexOf('askuserquestion') >= 0;
}

function firstAskUserQuestion(source) {
  const directQuestions = readArrayValue(source, 'questions');
  if (directQuestions.length > 0) {
    const directQuestion = directQuestions[0];
    if (directQuestion && typeof directQuestion === 'object' && !Array.isArray(directQuestion)) {
      return directQuestion;
    }
  }
  const input = readObjectValue(source, 'input');
  const inputQuestions = readArrayValue(input, 'questions');
  if (inputQuestions.length > 0) {
    const inputQuestion = inputQuestions[0];
    if (inputQuestion && typeof inputQuestion === 'object' && !Array.isArray(inputQuestion)) {
      return inputQuestion;
    }
  }
  return null;
}

function makeAskUserQuestionRequestEvent(providerId, source) {
  const toolName = firstStringValue(source, ['name', 'toolName', 'tool_name', 'tool']);
  const question = firstAskUserQuestion(source);
  if (!question || !isAskUserQuestionToolName(toolName)) {
    return null;
  }
  const input = readObjectValue(source, 'input');
  const requestId = firstStringValue(source, ['requestId', 'request_id', 'id', 'callId', 'call_id']);
  const toolCallId = firstStringValue(source, ['toolCallId', 'tool_call_id', 'toolUseId', 'tool_use_id', 'id']);
  const prompt = firstStringValue(question, ['question', 'prompt', 'message', 'text', 'content']);
  const title = firstStringValue(question, ['header', 'title', 'name']);
  const allowFreeText = readBooleanValue(question, 'allowFreeText', readBooleanValue(input, 'allowFreeText', true));
  return {
    requestId: requestId.length > 0 ? requestId : providerId + '_request_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12),
    toolCallId,
    kind: 'request',
    title,
    prompt,
    options: normalizeRequestOptions(question),
    allowFreeText,
    status: 'pending',
    rawJson: safeJsonText(source)
  };
}

function makeRequestEvent(providerId, source) {
  const askUserQuestionEvent = makeAskUserQuestionRequestEvent(providerId, source);
  if (askUserQuestionEvent) {
    return askUserQuestionEvent;
  }
  const requestId = firstStringValue(source, ['requestId', 'request_id', 'id', 'callId', 'call_id']);
  const toolCallId = firstStringValue(source, ['toolCallId', 'tool_call_id', 'toolUseId', 'tool_use_id']);
  const prompt = firstStringValue(source, ['question', 'prompt', 'message', 'text', 'content']);
  const title = firstStringValue(source, ['title', 'header', 'name']);
  const allowFreeText = source && typeof source === 'object' && source.allowFreeText === true;
  return {
    requestId: requestId.length > 0 ? requestId : providerId + '_request_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12),
    toolCallId,
    kind: 'request',
    title,
    prompt,
    options: normalizeRequestOptions(source),
    allowFreeText,
    status: 'pending',
    rawJson: safeJsonText(source)
  };
}

function makePlanEvent(providerId, source) {
  const planId = firstStringValue(source, ['planId', 'plan_id', 'requestId', 'request_id', 'id']);
  const content = firstStringValue(source, ['plan', 'content', 'text', 'message', 'markdown', 'proposal']);
  return {
    planId: planId.length > 0 ? planId : providerId + '_plan_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12),
    title: firstStringValue(source, ['title', 'name']),
    content,
    status: firstStringValue(source, ['status', 'state']) || 'pending',
    rawJson: safeJsonText(source)
  };
}

function makeToolEvent(providerId, source, typeText) {
  const toolCallId = firstStringValue(source, [
    'toolCallId',
    'tool_call_id',
    'toolUseId',
    'tool_use_id',
    'callId',
    'call_id',
    'callID',
    'id'
  ]);
  let name = firstStringValue(source, ['name', 'toolName', 'tool_name', 'tool', 'function']);
  if (name.length === 0) {
    name = providerId + (normalizeToolStatus(typeText, source) === 'completed' ? '.function_call' : '.tool');
  }
  const inputText = firstPayloadText(source, ['input', 'arguments', 'args', 'parameters', 'command']);
  const outputText = firstPayloadText(source, ['output', 'stdout', 'result', 'content', 'text']);
  const errorText = firstPayloadText(source, ['error', 'errorText', 'stderr', 'message']);
  return {
    toolCallId: toolCallId.length > 0 ? toolCallId : providerId + '_tool_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12),
    name,
    status: normalizeToolStatus(typeText, source),
    inputText,
    outputText,
    errorText,
    rawJson: safeJsonText(source)
  };
}

function collectRequestEventsFromValue(providerId, value, events, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRequestEventsFromValue(providerId, item, events, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const typeText = firstStringValue(value, ['type', 'event', 'kind', 'name']);
  const toolName = firstStringValue(value, ['name', 'toolName', 'tool_name', 'tool']);
  if (isAskUserQuestionToolName(toolName)) {
    const requestEvent = makeRequestEvent(providerId, value);
    if (requestEvent.prompt.length > 0 || requestEvent.options.length > 0) {
      events.push(requestEvent);
    }
    return;
  }
  if (isRequestLikeType(typeText)) {
    events.push(makeRequestEvent(providerId, value));
  }
  const item = readObjectValue(value, 'item');
  if (item) {
    collectRequestEventsFromValue(providerId, item, events, depth + 1);
  }
  const message = readObjectValue(value, 'message');
  if (message) {
    collectRequestEventsFromValue(providerId, message, events, depth + 1);
  }
  const payload = readObjectValue(value, 'payload');
  if (payload) {
    collectRequestEventsFromValue(providerId, payload, events, depth + 1);
  }
  const delta = readObjectValue(value, 'delta');
  if (delta) {
    collectRequestEventsFromValue(providerId, delta, events, depth + 1);
  }
  const content = value.content;
  if (content) {
    collectRequestEventsFromValue(providerId, content, events, depth + 1);
  }
}

function collectPlanEventsFromValue(providerId, value, events, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPlanEventsFromValue(providerId, item, events, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const typeText = firstStringValue(value, ['type', 'event', 'kind', 'name']);
  if (isPlanLikeType(typeText)) {
    events.push(makePlanEvent(providerId, value));
  }
  const item = readObjectValue(value, 'item');
  if (item) {
    collectPlanEventsFromValue(providerId, item, events, depth + 1);
  }
  const message = readObjectValue(value, 'message');
  if (message) {
    collectPlanEventsFromValue(providerId, message, events, depth + 1);
  }
  const payload = readObjectValue(value, 'payload');
  if (payload) {
    collectPlanEventsFromValue(providerId, payload, events, depth + 1);
  }
  const delta = readObjectValue(value, 'delta');
  if (delta) {
    collectPlanEventsFromValue(providerId, delta, events, depth + 1);
  }
  const content = value.content;
  if (content) {
    collectPlanEventsFromValue(providerId, content, events, depth + 1);
  }
}

function collectToolEventsFromValue(providerId, value, events, depth) {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolEventsFromValue(providerId, item, events, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    return;
  }
  const typeText = firstStringValue(value, ['type', 'event', 'kind']);
  if (isToolLikeType(typeText)) {
    events.push(makeToolEvent(providerId, value, typeText));
  }
  const item = readObjectValue(value, 'item');
  if (item) {
    collectToolEventsFromValue(providerId, item, events, depth + 1);
  }
  const message = readObjectValue(value, 'message');
  if (message) {
    collectToolEventsFromValue(providerId, message, events, depth + 1);
  }
  const payload = readObjectValue(value, 'payload');
  if (payload) {
    collectToolEventsFromValue(providerId, payload, events, depth + 1);
  }
  const delta = readObjectValue(value, 'delta');
  if (delta) {
    collectToolEventsFromValue(providerId, delta, events, depth + 1);
  }
  const content = value.content;
  if (content) {
    collectToolEventsFromValue(providerId, content, events, depth + 1);
  }
  const parts = value.parts;
  if (parts) {
    collectToolEventsFromValue(providerId, parts, events, depth + 1);
  }
}

function parseRequestEventsFromJsonLine(providerId, line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(line);
    const events = [];
    collectRequestEventsFromValue(providerId, parsed, events, 0);
    return events;
  } catch (error) {
    return [];
  }
}

function parsePlanEventsFromJsonLine(providerId, line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(line);
    const events = [];
    collectPlanEventsFromValue(providerId, parsed, events, 0);
    return events;
  } catch (error) {
    return [];
  }
}

function parseToolEventsFromJsonLine(providerId, line) {
  if (typeof line !== 'string' || line.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(line);
    const events = [];
    collectToolEventsFromValue(providerId, parsed, events, 0);
    return events;
  } catch (error) {
    return [];
  }
}

function buildConfiguredModelOption(providerId, displayName) {
  return {
    id: 'configured',
    displayName: typeof displayName === 'string' && displayName.length > 0 ? displayName : 'Configured Model',
    vendor: providerId,
    isDefault: true,
    contextWindow: 0,
    source: 'fallback',
    available: true,
    warning: ''
  };
}

function buildConfiguredModels(providerId, modelNames, configuredDisplayName) {
  const models = [
    buildConfiguredModelOption(providerId, configuredDisplayName)
  ];
  for (const item of modelNames) {
    if (!item || typeof item.id !== 'string' || item.id.length === 0) {
      continue;
    }
    models.push({
      id: item.id,
      displayName: typeof item.displayName === 'string' && item.displayName.length > 0 ? item.displayName : item.id,
      vendor: typeof item.vendor === 'string' && item.vendor.length > 0 ? item.vendor : providerId,
      isDefault: item.isDefault === true,
      contextWindow: readNumberValue(item, 'contextWindow', 0),
      source: typeof item.source === 'string' && item.source.length > 0 ? item.source : 'profile',
      available: item.available === false ? false : true,
      warning: typeof item.warning === 'string' ? item.warning : ''
    });
  }
  return models;
}

function optionArrayHasExplicitItems(items) {
  return Array.isArray(items) && items.length > 0;
}

function withOptionSource(items, source, fallbackWarning) {
  if (!Array.isArray(items)) {
    return [];
  }
  const result = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const next = Object.assign({}, item);
    if (typeof next.source !== 'string' || next.source.length === 0) {
      next.source = source;
    }
    if (typeof next.available !== 'boolean') {
      next.available = true;
    }
    if ((typeof next.warning !== 'string' || next.warning.length === 0) && fallbackWarning.length > 0) {
      next.warning = fallbackWarning;
    }
    result.push(next);
  }
  return result;
}

function withForcedOptionSource(items, source, fallbackWarning) {
  if (!Array.isArray(items)) {
    return [];
  }
  const result = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const next = Object.assign({}, item);
    next.source = source;
    if (typeof next.available !== 'boolean') {
      next.available = true;
    }
    if ((typeof next.warning !== 'string' || next.warning.length === 0) && fallbackWarning.length > 0) {
      next.warning = fallbackWarning;
    }
    result.push(next);
  }
  return result;
}

function buildDefaultSpeedModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the CLI default runtime settings.',
      isDefault: true
    }
  ];
}

function buildCodexSpeedModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the Codex configured service tier.',
      isDefault: true
    },
    {
      id: 'fast',
      displayName: 'Fast',
      description: 'Use the Codex priority service tier when available.',
      isDefault: false
    }
  ];
}

function buildDefaultReasoningModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the CLI configured reasoning effort.',
      isDefault: true
    }
  ];
}

function buildCodexReasoningModes() {
  return [
    {
      id: 'auto',
      displayName: 'Auto',
      description: 'Use the CLI configured reasoning effort.',
      isDefault: true
    },
    {
      id: 'low',
      displayName: 'Low',
      description: 'Fast responses with lighter reasoning.',
      isDefault: false
    },
    {
      id: 'medium',
      displayName: 'Medium',
      description: 'Balanced reasoning for everyday coding work.',
      isDefault: false
    },
    {
      id: 'high',
      displayName: 'High',
      description: 'Greater reasoning depth for complex work.',
      isDefault: false
    },
    {
      id: 'xhigh',
      displayName: 'Extra High',
      description: 'Maximum local Codex reasoning effort when available.',
      isDefault: false
    }
  ];
}

function displayNameFromReasoningEffort(effort) {
  if (effort === 'low') {
    return 'Low';
  }
  if (effort === 'medium') {
    return 'Medium';
  }
  if (effort === 'high') {
    return 'High';
  }
  if (effort === 'xhigh') {
    return 'Extra High';
  }
  return effort;
}

function descriptionFromReasoningEffort(effort) {
  if (effort === 'low') {
    return 'Fast responses with lighter reasoning.';
  }
  if (effort === 'medium') {
    return 'Balanced reasoning for everyday coding work.';
  }
  if (effort === 'high') {
    return 'Greater reasoning depth for complex work.';
  }
  if (effort === 'xhigh') {
    return 'Maximum local Codex reasoning effort when available.';
  }
  return 'Provider reasoning effort.';
}

function resolveCodexHomeDir() {
  const configured = typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME.trim() : '';
  if (configured.length > 0) {
    return configured;
  }
  return path.join(os.homedir(), '.codex');
}

function readCodexConfiguredModelSlug() {
  const configText = safeReadTextFile(path.join(resolveCodexHomeDir(), 'config.toml'));
  if (configText.length === 0) {
    return '';
  }
  const match = configText.match(/^\s*model\s*=\s*["']([^"']+)["']\s*$/m);
  return match && typeof match[1] === 'string' ? match[1].trim() : '';
}

function helpTextIncludes(text, needle) {
  if (typeof text !== 'string' || typeof needle !== 'string') {
    return false;
  }
  return text.toLowerCase().indexOf(needle.toLowerCase()) >= 0;
}

function parseCodexFeatureFlags(text) {
  const enabled = new Set();
  if (typeof text !== 'string' || text.length === 0) {
    return enabled;
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = trimmed.match(/^([a-z0-9_]+)\s+.+\s+(true|false)$/i);
    if (!match) {
      continue;
    }
    if (match[2].toLowerCase() === 'true') {
      enabled.add(match[1]);
    }
  }
  return enabled;
}

function normalizeCodexModelOption(source, isDefault) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const slug = firstStringValue(source, ['slug', 'id', 'name']);
  if (slug.length === 0 || slug === 'configured') {
    return null;
  }
  const visibility = readStringValue(source, 'visibility', '');
  if (visibility.toLowerCase() === 'hide') {
    return null;
  }
  if (!readBooleanValue(source, 'supported_in_api', true)) {
    return null;
  }
  const displayName = firstStringValue(source, ['display_name', 'displayName', 'name', 'slug']);
  const contextWindow = readNumberValue(
    source,
    'context_window',
    readNumberValue(source, 'contextWindow', readNumberValue(source, 'max_context_window', 0))
  );
  const defaultReasoning = firstStringValue(source, ['default_reasoning_level', 'defaultReasoningLevel']);
  const supportedReasoningLevels = readArrayValue(source, 'supported_reasoning_levels');
  const reasoningLevels = [];
  for (const level of supportedReasoningLevels) {
    if (!level || typeof level !== 'object' || Array.isArray(level)) {
      continue;
    }
    const effort = firstStringValue(level, ['effort', 'id', 'name']);
    if (effort.length === 0) {
      continue;
    }
    const levelDescription = firstStringValue(level, ['description']);
    reasoningLevels.push({
      id: effort,
      displayName: displayNameFromReasoningEffort(effort),
      description: levelDescription.length > 0 ? levelDescription : descriptionFromReasoningEffort(effort),
      isDefault: effort === defaultReasoning
    });
  }
  return {
    id: slug,
    displayName: displayName.length > 0 ? displayName : slug,
    vendor: 'openai',
    isDefault,
    contextWindow,
    reasoningLevels
  };
}

function appendUniqueModelOptions(target, candidates, seenIds) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== 'string' || candidate.id.length === 0 || seenIds.has(candidate.id)) {
      continue;
    }
    seenIds.add(candidate.id);
    target.push(candidate);
  }
}

function parseCodexModelCatalogText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    const sources = readArrayValue(parsed, 'models');
    const models = [];
    for (const item of sources) {
      const model = normalizeCodexModelOption(item, false);
      if (model) {
        models.push(model);
      }
    }
    return models;
  } catch (error) {
    return [];
  }
}

function readCodexCachedModels() {
  const codexHome = resolveCodexHomeDir();
  const discovered = [];
  const seenIds = new Set();
  const primaryFiles = [
    path.join(codexHome, 'models_cache.json')
  ];
  for (const filePath of primaryFiles) {
    appendUniqueModelOptions(discovered, parseCodexModelCatalogText(safeReadTextFile(filePath)), seenIds);
  }
  if (discovered.length > 0) {
    return discovered;
  }
  const catalogFiles = [];
  const entries = safeReadDir(codexHome);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.startsWith('model-catalog') || !entry.name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const fullPath = path.join(codexHome, entry.name);
    const stat = safeFileStat(fullPath);
    if (stat && stat.isFile()) {
      catalogFiles.push({
        filePath: fullPath,
        mtimeMs: stat.mtimeMs
      });
    }
  }
  catalogFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const item of catalogFiles) {
    appendUniqueModelOptions(discovered, parseCodexModelCatalogText(safeReadTextFile(item.filePath)), seenIds);
    if (discovered.length > 0) {
      break;
    }
  }
  return discovered;
}

function codexSessionIdFromRolloutPath(filePath) {
  const baseName = path.basename(filePath, '.jsonl');
  const match = baseName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (match && typeof match[1] === 'string') {
    return match[1];
  }
  return baseName.replace(/^rollout-/, '');
}

class CliProvider {
  constructor(config) {
    this.id = readStringValue(config, 'id', 'cli');
    this.displayName = readStringValue(config, 'displayName', this.id);
    this.description = readStringValue(config, 'description', 'Runs a local coding-agent CLI non-interactively.');
    this.command = readStringValue(config, 'command', this.id);
    this.commandArgs = Array.isArray(config && config.commandArgs) ? config.commandArgs : [];
    this.defaultWorkspacePath = readStringValue(config, 'defaultWorkspacePath', readStringValue(config, 'cwd', ''));
    this.env = normalizeEnvObject(config && config.env);
    this.promptMode = readStringValue(config, 'promptMode', 'stdin');
    this.modelFlag = readStringValue(config, 'modelFlag', '--model');
    this.cwdFlag = readStringValue(config, 'cwdFlag', '');
    this.usageEndpoint = readStringValue(config, 'usageEndpoint', '');
    this.usageEndpointEnv = readStringValue(config, 'usageEndpointEnv', '');
    this.usageEndpointTokenEnv = readStringValue(config, 'usageEndpointTokenEnv', '');
    this.jsonMode = readStringValue(config, 'jsonMode', 'none');
    this.planArgs = splitArgs(readStringValue(config, 'planArgs', ''));
    this.goalArgs = splitArgs(readStringValue(config, 'goalArgs', ''));
    this.planPromptPrefix = readStringValue(config, 'planPromptPrefix', '');
    this.goalPromptPrefix = readStringValue(config, 'goalPromptPrefix', '');
    this.supportsPlanMode = config && config.supportsPlanMode === true;
    this.supportsGoalMode = config && config.supportsGoalMode === true;
    this.supportsPermissions = config && config.supportsPermissions === true;
    this.runtimeMode = normalizeCliRuntimeMode(readStringValue(config, 'runtimeMode', 'oneshot'));
    this.supportsInteractiveSessions = this.runtimeMode === 'stdio';
    this.stdioPromptSuffix = readStringValue(config, 'stdioPromptSuffix', '\n');
    this.stdioResponseIdleMs = readNumberValue(config, 'stdioResponseIdleMs', DEFAULT_STDIO_RESPONSE_IDLE_MS);
    this.stdioStartupTimeoutMs = readNumberValue(config, 'stdioStartupTimeoutMs', DEFAULT_STDIO_STARTUP_TIMEOUT_MS);
    this.stdioReadyPattern = readStringValue(config, 'stdioReadyPattern', '');
    this.stdioPromptPattern = readStringValue(config, 'stdioPromptPattern', '');
    this.stdioExitPattern = readStringValue(config, 'stdioExitPattern', '');
    this.timeoutMs = readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS);
    this.declaredModels = Array.isArray(config && config.models) ? config.models : [];
    this.declaredTools = Array.isArray(config && config.tools) ? config.tools : [];
    this.declaredSpeedModes = Array.isArray(config && config.speedModes) ? config.speedModes : [];
    this.declaredReasoningModes = Array.isArray(config && config.reasoningModes) ? config.reasoningModes : [];
    this.declaredInteractionModes = Array.isArray(config && config.interactionModes) ? config.interactionModes : [];
    this.capabilitySource = readStringValue(config, 'capabilitySource', 'fallback');
    this.models = buildConfiguredModels(this.id, this.declaredModels);
    this.tools = withOptionSource(this.declaredTools, this.capabilitySource === 'profile' ? 'profile' : 'fallback', '');
    this.sessions = new Map();
    this.messages = new Map();
    this.sessionHistoryFiles = new Map();
    this.pendingPlans = new Map();
    this.pendingPermissionRuns = new Map();
    this.pendingRequestRuns = new Map();
    this.activeRuns = new Map();
    this.stdioSessions = new Map();
  }

  runtimeStatusForSession(sessionId) {
    if (this.runtimeMode !== 'stdio') {
      return {
        runtimeMode: this.runtimeMode,
        interactiveReady: false,
        sessionState: 'oneshot',
        exitCode: null,
        lastError: '',
        pid: 0,
        startedAt: 0,
        lastActivityAt: 0,
        recentOutputTail: ''
      };
    }
    const state = this.stdioSessions.get(sessionId);
    if (!state) {
      return {
        runtimeMode: this.runtimeMode,
        interactiveReady: this.supportsInteractiveSessions,
        sessionState: 'idle',
        exitCode: null,
        lastError: '',
        pid: 0,
        startedAt: 0,
        lastActivityAt: 0,
        recentOutputTail: ''
      };
    }
    if (state.exited) {
      return {
        runtimeMode: this.runtimeMode,
        interactiveReady: false,
        sessionState: state.sessionState || (state.aborted ? 'aborted' : 'exited'),
        exitCode: state.exitCode,
        lastError: state.lastError || (state.exitError ? String(state.exitError.message || state.exitError) : ''),
        pid: state.pid || 0,
        startedAt: state.startedAt || 0,
        lastActivityAt: state.lastActivityAt || 0,
        recentOutputTail: state.recentOutputTail || ''
      };
    }
    return {
      runtimeMode: this.runtimeMode,
      interactiveReady: state.ready === true && state.exited !== true && state.sessionState !== 'failed' && state.sessionState !== 'aborted',
      sessionState: state.sessionState || (state.current ? 'busy' : 'idle'),
      exitCode: null,
      lastError: state.lastError || '',
      pid: state.pid || 0,
      startedAt: state.startedAt || 0,
      lastActivityAt: state.lastActivityAt || 0,
      recentOutputTail: state.recentOutputTail || ''
    };
  }

  applyRuntimeStatus(session) {
    if (!session || typeof session !== 'object') {
      return session;
    }
    const status = this.runtimeStatusForSession(session.sessionId || '');
    session.runtimeMode = status.runtimeMode;
    session.interactiveReady = status.interactiveReady;
    session.sessionState = status.sessionState;
    session.exitCode = status.exitCode;
    session.lastError = status.lastError;
    session.pid = status.pid;
    session.startedAt = status.startedAt;
    session.lastActivityAt = status.lastActivityAt;
    session.recentOutputTail = status.recentOutputTail;
    return session;
  }

  permissionRunKey(sessionId, requestId) {
    return sessionId + ':' + requestId;
  }

  rememberPendingPermissionRun(session, promptText, interactionMode, permissionEvent) {
    const requestId = readStringValue(permissionEvent, 'requestId', '');
    const permissionId = readStringValue(permissionEvent, 'permissionId', requestId);
    const effectiveRequestId = requestId.length > 0 ? requestId : permissionId;
    if (session.sessionId.length === 0 || effectiveRequestId.length === 0) {
      return null;
    }
    const key = this.permissionRunKey(session.sessionId, effectiveRequestId);
    const existing = this.pendingPermissionRuns.get(key);
    if (existing) {
      return existing;
    }
    const pending = {
      sessionId: session.sessionId,
      requestId: effectiveRequestId,
      permissionId: permissionId.length > 0 ? permissionId : effectiveRequestId,
      promptText,
      interactionMode,
      resolved: false,
      resolve: null,
      promise: null
    };
    pending.promise = new Promise((resolve) => {
      pending.resolve = resolve;
    });
    this.pendingPermissionRuns.set(this.permissionRunKey(pending.sessionId, pending.requestId), pending);
    this.pendingPermissionRuns.set(this.permissionRunKey(pending.sessionId, pending.permissionId), pending);
    return pending;
  }

  findPendingPermissionRun(sessionId, requestId, permissionId) {
    const ids = [];
    if (requestId.length > 0) {
      ids.push(requestId);
    }
    if (permissionId.length > 0 && permissionId !== requestId) {
      ids.push(permissionId);
    }
    if (sessionId.length > 0) {
      for (const id of ids) {
        const pending = this.pendingPermissionRuns.get(this.permissionRunKey(sessionId, id));
        if (pending) {
          return pending;
        }
      }
    }
    for (const pending of this.pendingPermissionRuns.values()) {
      if (sessionId.length > 0 && pending.sessionId !== sessionId) {
        continue;
      }
      if (pending.requestId === requestId || pending.permissionId === requestId ||
        pending.requestId === permissionId || pending.permissionId === permissionId) {
        return pending;
      }
    }
    return null;
  }

  resolvePendingPermissionRun(pending, response) {
    if (!pending || pending.resolved) {
      return;
    }
    pending.resolved = true;
    if (typeof pending.resolve === 'function') {
      pending.resolve(response);
    }
  }

  clearPendingPermissionRun(pending) {
    if (!pending) {
      return;
    }
    this.pendingPermissionRuns.delete(this.permissionRunKey(pending.sessionId, pending.requestId));
    this.pendingPermissionRuns.delete(this.permissionRunKey(pending.sessionId, pending.permissionId));
  }

  requestRunKey(sessionId, requestId) {
    return sessionId + ':' + requestId;
  }

  rememberPendingRequestRun(session, promptText, interactionMode, requestEvent) {
    const requestId = readStringValue(requestEvent, 'requestId', '');
    if (session.sessionId.length === 0 || requestId.length === 0) {
      return null;
    }
    const key = this.requestRunKey(session.sessionId, requestId);
    const existing = this.pendingRequestRuns.get(key);
    if (existing) {
      return existing;
    }
    const pending = {
      sessionId: session.sessionId,
      requestId,
      toolCallId: readStringValue(requestEvent, 'toolCallId', ''),
      title: readStringValue(requestEvent, 'title', ''),
      prompt: readStringValue(requestEvent, 'prompt', ''),
      promptText,
      interactionMode,
      resolved: false,
      resolve: null,
      promise: null
    };
    pending.promise = new Promise((resolve) => {
      pending.resolve = resolve;
    });
    this.pendingRequestRuns.set(this.requestRunKey(pending.sessionId, pending.requestId), pending);
    if (pending.toolCallId.length > 0) {
      this.pendingRequestRuns.set(this.requestRunKey(pending.sessionId, pending.toolCallId), pending);
    }
    return pending;
  }

  findPendingRequestRun(sessionId, requestId) {
    if (sessionId.length > 0 && requestId.length > 0) {
      const pending = this.pendingRequestRuns.get(this.requestRunKey(sessionId, requestId));
      if (pending) {
        return pending;
      }
    }
    for (const pending of this.pendingRequestRuns.values()) {
      if (sessionId.length > 0 && pending.sessionId !== sessionId) {
        continue;
      }
      if (pending.requestId === requestId || pending.toolCallId === requestId) {
        return pending;
      }
    }
    return null;
  }

  resolvePendingRequestRun(pending, response) {
    if (!pending || pending.resolved) {
      return;
    }
    pending.resolved = true;
    if (typeof pending.resolve === 'function') {
      pending.resolve(response);
    }
  }

  clearPendingRequestRun(pending) {
    if (!pending) {
      return;
    }
    this.pendingRequestRuns.delete(this.requestRunKey(pending.sessionId, pending.requestId));
    if (pending.toolCallId.length > 0) {
      this.pendingRequestRuns.delete(this.requestRunKey(pending.sessionId, pending.toolCallId));
    }
  }

  resolveAbortSessionId(sessionId, remoteSessionId) {
    const candidates = [];
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      candidates.push(sessionId);
    }
    if (typeof remoteSessionId === 'string' && remoteSessionId.length > 0) {
      candidates.push(remoteSessionId);
      candidates.push(this.id + ':' + remoteSessionId);
    }
    for (const candidate of candidates) {
      if (this.sessions.has(candidate)) {
        return candidate;
      }
    }
    for (const candidate of candidates) {
      if (this.activeRuns.has(candidate)) {
        return candidate;
      }
    }
    return candidates.length > 0 ? candidates[0] : '';
  }

  abortPendingInteractionRuns(sessionId, emit) {
    let count = 0;
    const permissionRuns = new Set();
    for (const pending of this.pendingPermissionRuns.values()) {
      if (pending && pending.sessionId === sessionId) {
        permissionRuns.add(pending);
      }
    }
    for (const pending of permissionRuns.values()) {
      this.resolvePendingPermissionRun(pending, {
        status: 'rejected',
        requestId: pending.requestId,
        permissionId: pending.permissionId,
        reply: 'reject',
        message: 'Session aborted.',
        aborted: true
      });
      this.clearPendingPermissionRun(pending);
      count += 1;
      if (typeof emit === 'function') {
        emit(makeEvent(EventType.PERMISSION_REQUESTED, sessionId, {
          providerId: this.id,
          requestId: pending.requestId,
          permissionId: pending.permissionId,
          status: 'rejected',
          answer: 'Session aborted.',
          optionId: 'abort',
          reply: 'reject'
        }));
      }
    }

    const requestRuns = new Set();
    for (const pending of this.pendingRequestRuns.values()) {
      if (pending && pending.sessionId === sessionId) {
        requestRuns.add(pending);
      }
    }
    for (const pending of requestRuns.values()) {
      this.resolvePendingRequestRun(pending, {
        status: 'dismissed',
        requestId: pending.requestId,
        toolCallId: pending.toolCallId,
        answer: '',
        optionId: 'abort',
        message: 'Session aborted.',
        aborted: true
      });
      this.clearPendingRequestRun(pending);
      count += 1;
      if (typeof emit === 'function') {
        emit(makeEvent(EventType.QUESTION_REQUESTED, sessionId, {
          providerId: this.id,
          requestId: pending.requestId,
          toolCallId: pending.toolCallId,
          status: 'dismissed',
          answer: '',
          optionId: 'abort'
        }));
      }
    }
    return count;
  }

  buildStdioArgs(session, interactionMode) {
    const args = [];
    for (const arg of this.commandArgs) {
      if (typeof arg === 'string' && arg.length > 0) {
        args.push(arg);
      }
    }
    if (this.cwdFlag.length > 0 && session.workspacePath.length > 0) {
      args.push(this.cwdFlag);
      args.push(session.workspacePath);
    }
    if (this.modelFlag.length > 0 && session.modelId.length > 0 && session.modelId !== 'configured') {
      args.push(this.modelFlag);
      args.push(session.modelId);
    }
    this.appendRuntimeModeArgs(args, session, {});
    const modeArgs = interactionMode === 'plan' ? this.planArgs : this.goalArgs;
    for (const arg of modeArgs) {
      if (typeof arg === 'string' && arg.length > 0) {
        args.push(arg);
      }
    }
    return args;
  }

  ensureStdioSession(session, interactionMode, emit) {
    const existing = this.stdioSessions.get(session.sessionId);
    if (existing && existing.child) {
      return existing;
    }
    const args = this.buildStdioArgs(session, interactionMode);
    const child = spawn(this.command, args, {
      cwd: session.workspacePath.length > 0 ? session.workspacePath : process.cwd(),
      env: Object.assign({}, process.env, this.env),
      shell: process.platform === 'win32' && !path.isAbsolute(this.command),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const state = {
      sessionId: session.sessionId,
      child,
      queue: Promise.resolve(),
      current: null,
      exited: false,
      exitCode: null,
      exitError: null,
      lastError: '',
      aborted: false,
      sessionState: 'starting',
      session,
      pid: child.pid || 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      recentOutputTail: '',
      ready: false,
      readyTimer: null,
      readyResolve: null,
      readyReject: null,
      readyPromise: null
    };
    state.readyPromise = new Promise((resolve, reject) => {
      state.readyResolve = resolve;
      state.readyReject = reject;
    });
    state.readyPromise.catch(() => {});
    this.stdioSessions.set(session.sessionId, state);
    this.activeRuns.set(session.sessionId, {
      sessionId: session.sessionId,
      child,
      aborted: false,
      abortReason: '',
      runtimeMode: 'stdio'
    });
    child.stdout.on('data', (chunk) => {
      this.handleStdioOutput(session, state, chunk, emit, false);
    });
    child.stderr.on('data', (chunk) => {
      this.handleStdioOutput(session, state, chunk, emit, true);
    });
    child.on('error', (error) => {
      state.exitError = createCliRuntimeError('STDIO_START_FAILED', error && error.message ? error.message : String(error), {
        runtimeMode: 'stdio',
        sessionState: 'failed',
        exitCode: state.exitCode
      });
      state.exited = true;
      state.sessionState = 'failed';
      state.lastActivityAt = Date.now();
      state.lastError = state.exitError.message;
      this.applyRuntimeStatus(session);
      this.rejectStdioReady(state, state.exitError);
      this.finishStdioCurrent(state, state.exitError, true);
    });
    child.on('exit', (code) => {
      state.exited = true;
      state.exitCode = typeof code === 'number' ? code : 0;
      state.lastActivityAt = Date.now();
      if (state.aborted) {
        state.sessionState = 'aborted';
      } else if (state.exitCode === 0) {
        state.sessionState = 'exited';
      } else {
        state.sessionState = 'failed';
      }
      if (state.exitCode !== 0 && state.lastError.length === 0) {
        state.lastError = this.displayName + ' stdio session exited with code ' + String(state.exitCode);
      }
      if (this.activeRuns.get(session.sessionId) && this.activeRuns.get(session.sessionId).runtimeMode === 'stdio') {
        this.activeRuns.delete(session.sessionId);
      }
      if (state.current) {
        if (state.aborted) {
          this.finishStdioCurrent(state, null, false);
        } else if (state.exitError) {
          this.finishStdioCurrent(state, state.exitError, true);
        } else if (state.exitCode !== 0) {
          state.lastError = this.displayName + ' stdio session exited with code ' + String(state.exitCode);
          state.exitError = createCliRuntimeError('SESSION_EXITED', state.lastError, {
            runtimeMode: 'stdio',
            sessionState: state.sessionState,
            exitCode: state.exitCode,
            pid: state.pid || 0
          });
          this.finishStdioCurrent(state, state.exitError, true);
        } else {
          this.finishStdioCurrent(state, null, false);
        }
      }
      if (!state.ready && state.sessionState !== 'aborted') {
        this.rejectStdioReady(state, createCliRuntimeError('SESSION_EXITED', state.lastError || (this.displayName + ' stdio session exited.'), {
          runtimeMode: 'stdio',
          sessionState: state.sessionState,
          exitCode: state.exitCode
        }));
      }
      this.applyRuntimeStatus(session);
    });
    if (this.stdioReadyPattern.length > 0) {
      state.readyTimer = setTimeout(() => {
        const error = createCliRuntimeError('STARTUP_TIMEOUT', this.displayName + ' stdio startup timed out after ' + String(this.stdioStartupTimeoutMs) + 'ms', {
          runtimeMode: 'stdio',
          sessionState: 'failed',
          exitCode: state.exitCode
        });
        state.sessionState = 'failed';
        state.exitError = error;
        state.lastError = error.message;
        state.lastActivityAt = Date.now();
        this.rejectStdioReady(state, error);
        terminateChildProcess(child);
        this.applyRuntimeStatus(session);
      }, this.stdioStartupTimeoutMs);
    } else {
      this.markStdioReady(state);
    }
    if (typeof emit === 'function') {
      emit(makeEvent(EventType.TOOL_OUTPUT, session.sessionId, {
        toolCallId: this.id + '_cli',
        name: this.id + '.cli',
        text: this.displayName + ' stdio runtime started.\n'
      }));
    }
    return state;
  }

  markStdioReady(state) {
    if (!state || state.ready || state.exited) {
      return;
    }
    state.ready = true;
    state.sessionState = 'idle';
    state.lastActivityAt = Date.now();
    if (state.readyTimer !== null) {
      clearTimeout(state.readyTimer);
      state.readyTimer = null;
    }
    if (typeof state.readyResolve === 'function') {
      state.readyResolve(state);
    }
    if (state.session) {
      this.applyRuntimeStatus(state.session);
    }
  }

  rejectStdioReady(state, error) {
    if (!state || state.ready) {
      return;
    }
    state.ready = true;
    if (!state.exitError && error) {
      state.exitError = error;
    }
    if (state.readyTimer !== null) {
      clearTimeout(state.readyTimer);
      state.readyTimer = null;
    }
    if (typeof state.readyReject === 'function') {
      state.readyReject(error);
    }
  }

  handleStdioOutput(session, state, chunk, emit, isStderr) {
    const text = Buffer.from(chunk).toString('utf8');
    if (text.length === 0) {
      return;
    }
    state.lastActivityAt = Date.now();
    state.recentOutputTail = appendRecentOutputTail(state.recentOutputTail, text);
    if (state.sessionState === 'starting' && this.stdioReadyPattern.length > 0 && patternMatches(this.stdioReadyPattern, state.recentOutputTail)) {
      this.markStdioReady(state);
    }
    if (this.stdioExitPattern.length > 0 && patternMatches(this.stdioExitPattern, text)) {
      state.lastError = text.trim();
    }
    const current = state.current;
    if (!current || current.settled) {
      return;
    }
    if (isStderr) {
      current.stderr = current.stderr + text;
      emit(makeEvent(EventType.TOOL_OUTPUT, session.sessionId, {
        toolCallId: this.id + '_cli',
        name: this.id + '.cli',
        text
      }));
    } else {
      current.stdout = current.stdout + text;
      emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
        role: 'assistant',
        text,
        contentKind: 'text'
      }));
    }
    state.sessionState = 'busy';
    this.applyRuntimeStatus(session);
    this.armStdioIdleTimer(state);
  }

  armStdioIdleTimer(state) {
    const current = state.current;
    if (!current || current.settled) {
      return;
    }
    if (current.idleTimer !== null) {
      clearTimeout(current.idleTimer);
    }
    current.idleTimer = setTimeout(() => {
      this.finishStdioCurrent(state, null, false);
    }, this.stdioResponseIdleMs);
  }

  finishStdioCurrent(state, error, rejectOutput) {
    const current = state.current;
    if (!current || current.settled) {
      return;
    }
    current.settled = true;
    if (current.timeoutTimer !== null) {
      clearTimeout(current.timeoutTimer);
    }
    if (current.idleTimer !== null) {
      clearTimeout(current.idleTimer);
    }
    state.current = null;
    if (!state.exited && !state.aborted) {
      state.sessionState = 'idle';
      state.lastActivityAt = Date.now();
      if (state.session) {
        this.applyRuntimeStatus(state.session);
      }
    }
    if (rejectOutput && error) {
      state.lastError = error && error.message ? error.message : String(error);
      current.reject(error);
      return;
    }
    current.resolve({
      text: current.stdout,
      stderr: current.stderr,
      toolStatus: state.aborted ? 'cancelled' : 'completed',
      skipAssistantCompletion: state.aborted
    });
  }

  enqueueStdioRun(session, promptText, interactionMode, emit) {
    const state = this.ensureStdioSession(session, interactionMode, emit);
    state.queue = state.queue.catch(() => {}).then(() => {
      return this.writeStdioPrompt(session, state, promptText, interactionMode);
    });
    return state.queue;
  }

  writeStdioPrompt(session, state, promptText, interactionMode) {
    return state.readyPromise.then(() => new Promise((resolve, reject) => {
      if (!state.child || state.exited) {
        reject(state.exitError || createCliRuntimeError('SESSION_EXITED', this.displayName + ' stdio session is not running.', {
          runtimeMode: 'stdio',
          sessionState: state.sessionState || 'exited',
          exitCode: state.exitCode
        }));
        return;
      }
      const effectivePrompt = this.buildPromptText(promptText, interactionMode);
      const current = {
        stdout: '',
        stderr: '',
        resolve,
        reject,
        idleTimer: null,
        timeoutTimer: null,
        settled: false
      };
      state.current = current;
      state.sessionState = 'busy';
      state.lastActivityAt = Date.now();
      this.applyRuntimeStatus(session);
      current.timeoutTimer = setTimeout(() => {
        const error = createCliRuntimeError('STDIO_RESPONSE_TIMEOUT', this.displayName + ' stdio response timed out after ' + String(this.timeoutMs) + 'ms', {
          runtimeMode: 'stdio',
          sessionState: 'busy',
          exitCode: state.exitCode
        });
        this.finishStdioCurrent(state, error, true);
      }, this.timeoutMs);
      try {
        state.child.stdin.write(effectivePrompt + this.stdioPromptSuffix);
      } catch (error) {
        this.finishStdioCurrent(state, error, true);
      }
    }));
  }

  runStdioCli(session, promptText, interactionMode, emit) {
    return this.enqueueStdioRun(session, promptText, interactionMode, emit);
  }

  async startInteractiveSession(sessionId, emit) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw createCliRuntimeError('SESSION_NOT_FOUND', 'Session not found: ' + sessionId, {
        runtimeMode: this.runtimeMode,
        sessionState: 'missing'
      });
    }
    if (this.runtimeMode !== 'stdio') {
      this.applyRuntimeStatus(session);
      return this.runtimeStatusForSession(sessionId);
    }
    const state = this.ensureStdioSession(session, session.interactionMode || 'goal', emit);
    await state.readyPromise;
    this.applyRuntimeStatus(session);
    return this.runtimeStatusForSession(sessionId);
  }

  sessionRuntimeDiagnostics(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }
    this.applyRuntimeStatus(session);
    const status = this.runtimeStatusForSession(session.sessionId);
    return {
      providerId: this.id,
      sessionId: session.sessionId,
      remoteSessionId: session.remoteSessionId || '',
      runtimeMode: status.runtimeMode,
      interactiveReady: status.interactiveReady,
      sessionState: status.sessionState,
      pid: status.pid || 0,
      startedAt: status.startedAt || 0,
      lastActivityAt: status.lastActivityAt || 0,
      exitCode: status.exitCode,
      lastError: status.lastError || '',
      recentOutputTail: status.recentOutputTail || ''
    };
  }

  async abortSession(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const remoteSessionId = readStringValue(payload, 'remoteSessionId', '');
    const effectiveSessionId = this.resolveAbortSessionId(sessionId, remoteSessionId);
    if (effectiveSessionId.length === 0) {
      throw new Error('Session id is required for abort request: ' + this.id);
    }
    const session = this.getSession(effectiveSessionId);
    const runState = this.activeRuns.get(effectiveSessionId);
    const stdioState = this.stdioSessions.get(effectiveSessionId);
    const pendingCount = this.abortPendingInteractionRuns(effectiveSessionId, emit);
    let terminated = false;
    let abortRuntimeStatus = null;
    if (stdioState) {
      stdioState.aborted = true;
      stdioState.lastError = 'Session aborted.';
      try {
        if (stdioState.child && stdioState.child.stdin) {
          stdioState.child.stdin.end();
        }
      } catch (_error) {
        // Termination below still handles stubborn stdio children.
      }
      terminated = terminateChildProcess(stdioState.child);
      this.finishStdioCurrent(stdioState, null, false);
      await waitForChildProcessExit(stdioState.child, 1500);
      abortRuntimeStatus = this.runtimeStatusForSession(effectiveSessionId);
      this.stdioSessions.delete(effectiveSessionId);
      this.activeRuns.delete(effectiveSessionId);
    } else if (runState) {
      runState.aborted = true;
      runState.abortReason = 'user';
      terminated = terminateChildProcess(runState.child);
    }
    if (session) {
      session.status = 'ready';
      session.updatedAt = Date.now();
      if (abortRuntimeStatus) {
        session.runtimeMode = abortRuntimeStatus.runtimeMode;
        session.interactiveReady = abortRuntimeStatus.interactiveReady;
        session.sessionState = abortRuntimeStatus.sessionState;
        session.exitCode = abortRuntimeStatus.exitCode;
        session.lastError = abortRuntimeStatus.lastError;
      } else {
        this.applyRuntimeStatus(session);
      }
      if (typeof emit === 'function') {
        emit(makeEvent(EventType.SESSION_UPDATED, effectiveSessionId, { session }));
      }
    }
    const runtimeStatus = abortRuntimeStatus || this.runtimeStatusForSession(effectiveSessionId);
    return {
      status: runState || stdioState || pendingCount > 0 ? 'aborted' : 'idle',
      providerId: this.id,
      sessionId: effectiveSessionId,
      remoteSessionId,
      terminated,
      pendingCount,
      runtimeMode: runtimeStatus.runtimeMode,
      interactiveReady: runtimeStatus.interactiveReady,
      sessionState: runtimeStatus.sessionState,
      exitCode: runtimeStatus.exitCode,
      lastError: runtimeStatus.lastError
    };
  }

  async shutdown(reason) {
    const results = [];
    for (const [sessionId, state] of this.stdioSessions.entries()) {
      try {
        if (state.child) {
          terminateChildProcess(state.child);
        }
        results.push({ sessionId, status: 'terminated' });
      } catch (error) {
        results.push({ sessionId, status: 'failed', reason: error instanceof Error ? error.message : String(error) });
      }
    }
    for (const [sessionId, runState] of this.activeRuns.entries()) {
      if (runState && runState.child) {
        terminateChildProcess(runState.child);
      }
      if (!this.stdioSessions.has(sessionId)) {
        results.push({ sessionId, status: 'terminated' });
      }
    }
    this.stdioSessions.clear();
    this.activeRuns.clear();
    return { status: 'completed', reason: reason || '', results };
  }

  buildPromptWithRequestResponse(promptText, pending, response) {
    const answer = readStringValue(response, 'answer', readStringValue(response, 'message', '')).trim();
    const optionId = readStringValue(response, 'optionId', '').trim();
    const title = readStringValue(pending, 'title', '').trim();
    const question = readStringValue(pending, 'prompt', '').trim();
    const replyText = answer.length > 0 ? answer : optionId;
    const parts = [];
    parts.push(promptText);
    parts.push('');
    parts.push('User answered an interactive question from the previous run. Continue the original task using this response.');
    if (title.length > 0) {
      parts.push('Question header: ' + title);
    }
    if (question.length > 0) {
      parts.push('Question: ' + question);
    }
    if (optionId.length > 0) {
      parts.push('Selected option: ' + optionId);
    }
    if (replyText.length > 0) {
      parts.push('Answer: ' + replyText);
    }
    return parts.join('\n');
  }

  buildSessionFeatures() {
    return {
      list: true,
      import: true,
      resume: false,
      attach: this.supportsInteractiveSessions,
      messages: true,
      update: false,
      delete: false,
      abort: true,
      fork: false,
      share: false,
      revert: false,
      interactive: this.supportsInteractiveSessions,
      todo: false,
      diff: false,
      command: true,
      shell: true
    };
  }

  async describe() {
    const available = await commandExists(this.command);
    const declaredProfileCapabilities = this.capabilitySource === 'profile' && (
      optionArrayHasExplicitItems(this.declaredModels) ||
      optionArrayHasExplicitItems(this.declaredTools) ||
      optionArrayHasExplicitItems(this.declaredSpeedModes) ||
      optionArrayHasExplicitItems(this.declaredReasoningModes) ||
      optionArrayHasExplicitItems(this.declaredInteractionModes)
    );
    const capabilitySource = declaredProfileCapabilities ? 'profile' : 'fallback';
    const discoveryWarnings = [];
    if (!available) {
      discoveryWarnings.push(this.command + ' is not on PATH; using declared or fallback capability metadata.');
    } else if (!declaredProfileCapabilities) {
      discoveryWarnings.push(this.displayName + ' does not expose a reliable runtime discovery endpoint; using fallback capability metadata.');
    }
    const fallbackWarning = capabilitySource === 'fallback' ? 'Fallback metadata; runtime discovery is not available for this CLI provider.' : '';
    return {
      id: this.id,
      displayName: this.displayName,
      status: available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.command,
      runtimeMode: this.runtimeMode,
      capabilitySource,
      capabilityStatus: discoveryWarnings.length > 0 ? 'degraded' : 'ready',
      lastDiscoveredAt: Date.now(),
      discoveryWarnings,
      discoveryErrors: [],
      capabilities: {
        streaming: this.jsonMode !== 'none',
        tools: this.tools.length > 0,
        previews: false,
        permissions: this.supportsPermissions,
        history: true,
        interactiveSessions: this.supportsInteractiveSessions,
        modelSelection: this.modelFlag.length > 0,
        speedProfiles: false,
        workspaceAware: this.cwdFlag.length > 0,
        nativeProxy: false,
        events: false,
        requests: true,
        plans: this.supportsPlanMode,
        health: available ? this.command + ' is available' : this.command + ' is not on PATH'
      },
      interactiveReady: this.supportsInteractiveSessions && available,
      sessionState: this.runtimeMode === 'stdio' ? 'idle' : 'oneshot',
      exitCode: null,
      lastError: '',
      models: withOptionSource(this.models, capabilitySource, fallbackWarning),
      speedModes: withOptionSource(
        this.declaredSpeedModes.length > 0 ? this.declaredSpeedModes : buildDefaultSpeedModes(),
        this.declaredSpeedModes.length > 0 && capabilitySource === 'profile' ? 'profile' : 'fallback',
        fallbackWarning
      ),
      reasoningModes: withOptionSource(
        this.declaredReasoningModes.length > 0 ? this.declaredReasoningModes : buildDefaultReasoningModes(),
        this.declaredReasoningModes.length > 0 && capabilitySource === 'profile' ? 'profile' : 'fallback',
        fallbackWarning
      ),
      tools: withOptionSource(this.tools, capabilitySource, fallbackWarning),
      sessionFeatures: this.buildSessionFeatures(),
      interactionModes: withOptionSource(
        this.declaredInteractionModes.length > 0 ? this.declaredInteractionModes : this.buildInteractionModes(),
        this.declaredInteractionModes.length > 0 && capabilitySource === 'profile' ? 'profile' : 'fallback',
        fallbackWarning
      )
    };
  }

  buildInteractionModes() {
    const modes = [];
    if (this.supportsGoalMode) {
      modes.push({
        id: 'goal',
        displayName: 'Goal',
        description: 'Run the prompt as an implementation request.',
        category: 'run'
      });
    }
    if (this.supportsPlanMode) {
      modes.push({
        id: 'plan',
        displayName: 'Plan',
        description: 'Draft a plan first and wait for approval.',
        category: 'run'
      });
    }
    if (this.id === 'claude' && this.supportsPermissions) {
      modes.push({
        id: 'claude-permissions-default',
        displayName: 'Default permissions',
        description: 'Use the Claude Code configured permission behavior.',
        isDefault: true,
        category: 'approval'
      });
      modes.push({
        id: 'claude-permissions-accept-edits',
        displayName: 'Accept edits',
        description: 'Allow Claude Code to accept file edits while preserving other checks.',
        isDefault: false,
        category: 'approval'
      });
      modes.push({
        id: 'claude-permissions-full-access',
        displayName: 'Full access',
        description: 'Run Claude Code with bypassPermissions for trusted local runs.',
        isDefault: false,
        category: 'approval'
      });
    }
    return modes;
  }

  createSession(payload) {
    const sessionId = this.id === 'claude' ? createUuidSessionId(this.id) : createSessionId(this.id);
    const remoteSessionId = this.id === 'claude' ? remoteSessionIdFromLocalSessionId(this.id, sessionId) : sessionId;
    const requestedWorkspacePath = readStringValue(payload, 'workspacePath', '');
    const workspacePath = requestedWorkspacePath.length > 0
      ? requestedWorkspacePath
      : (this.defaultWorkspacePath.length > 0 ? this.defaultWorkspacePath : process.cwd());
    const requestedWorkspaceTitle = readStringValue(payload, 'workspaceTitle', '');
    const workspaceTitle = requestedWorkspaceTitle.length > 0 ? requestedWorkspaceTitle : path.basename(workspacePath);
    const modelId = readStringValue(payload, 'modelId', 'configured');
    const speedMode = readStringValue(payload, 'speedMode', 'auto');
    const reasoningMode = readStringValue(payload, 'reasoningMode', 'auto');
    const now = Date.now();
    const session = {
      sessionId,
      remoteSessionId,
      providerId: this.id,
      title: workspaceTitle.length > 0 ? workspaceTitle : (workspacePath.length > 0 ? this.displayName + ': ' + workspacePath : this.displayName + ' Session'),
      workspacePath,
      workspaceTitle,
      branchName: 'main',
      modelId,
      speedMode,
      reasoningMode,
      interactionMode: '',
      messageCount: 0,
      status: 'ready',
      source: this.id,
      runtimeMode: this.runtimeMode,
      interactiveReady: this.supportsInteractiveSessions,
      sessionState: this.runtimeMode === 'stdio' ? 'idle' : 'oneshot',
      exitCode: null,
      lastError: '',
      pid: 0,
      startedAt: 0,
      lastActivityAt: 0,
      recentOutputTail: '',
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(sessionId, session);
    this.messages.set(sessionId, []);
    return this.applyRuntimeStatus(session);
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }
    if (sessionId.startsWith(this.id + ':')) {
      const merged = new Map();
      for (const item of this.sessions.values()) {
        merged.set(item.sessionId, item);
      }
      this.collectPersistentSessions(merged);
      const persistentSession = this.sessions.get(sessionId);
      if (persistentSession) {
        return persistentSession;
      }
      if (this.id === 'claude') {
        return this.getLegacyClaudeSession(sessionId);
      }
    }
    return null;
  }

  getLegacyClaudeSession(sessionId) {
    const remoteSessionId = remoteSessionIdFromLocalSessionId(this.id, sessionId);
    if (remoteSessionId.length === 0) {
      return null;
    }
    const rootPath = path.join(os.homedir(), '.claude', 'projects');
    const files = listJsonlFiles(rootPath, MAX_HISTORY_SESSIONS);
    for (const filePath of files) {
      if (path.basename(filePath, '.jsonl') !== remoteSessionId) {
        continue;
      }
      const session = this.buildClaudeSessionFromFile(filePath, sessionId, remoteSessionId, false);
      if (session) {
        this.sessionHistoryFiles.set(session.sessionId, filePath);
        return session;
      }
    }
    return null;
  }

  buildClaudeSessionFromFile(filePath, requestedSessionId, requestedRemoteSessionId, requireResumeCompatible) {
    if (requireResumeCompatible && !isClaudeResumeCompatibleHistoryFile(filePath)) {
      return null;
    }
    const stat = safeFileStat(filePath);
    if (!stat || !stat.isFile()) {
      return null;
    }
    const records = readSampledJsonLines(filePath, 120, 80);
    let remoteSessionId = requestedRemoteSessionId.length > 0 ? requestedRemoteSessionId : path.basename(filePath, '.jsonl');
    let workspacePath = '';
    let branchName = 'main';
    let aiTitle = '';
    let createdAt = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
    let updatedAt = stat.mtimeMs;
    let messageCount = 0;
    for (const record of records) {
      const recordSessionId = readStringValue(record, 'sessionId', '');
      if (recordSessionId.length > 0) {
        remoteSessionId = recordSessionId;
      }
      const cwd = readStringValue(record, 'cwd', '');
      if (cwd.length > 0 && workspacePath.length === 0) {
        workspacePath = cwd;
      }
      const gitBranch = readStringValue(record, 'gitBranch', '');
      if (gitBranch.length > 0) {
        branchName = gitBranch;
      }
      const title = readStringValue(record, 'aiTitle', '');
      if (title.length > 0) {
        aiTitle = title;
      }
      const timestamp = normalizeHistoryTimestamp(readStringValue(record, 'timestamp', ''), 0);
      if (timestamp > 0) {
        createdAt = Math.min(createdAt, timestamp);
        updatedAt = Math.max(updatedAt, timestamp);
      }
      if (record.type === 'user' || record.type === 'assistant') {
        messageCount += 1;
      }
    }
    if (workspacePath.length === 0) {
      workspacePath = decodeClaudeProjectPath(path.basename(path.dirname(filePath)));
    }
    const workspaceTitle = workspacePath.length > 0 ? path.basename(workspacePath) : '';
    const sessionId = requestedSessionId.length > 0 ? requestedSessionId : this.id + ':' + remoteSessionId;
    return {
      sessionId,
      remoteSessionId,
      providerId: this.id,
      title: aiTitle.length > 0 ? aiTitle : (workspaceTitle.length > 0 ? workspaceTitle : this.displayName + ' Session'),
      workspacePath,
      workspaceTitle,
      branchName,
      modelId: 'configured',
      speedMode: 'auto',
      reasoningMode: 'auto',
      interactionMode: '',
      messageCount,
      status: 'ready',
      source: this.id,
      createdAt,
      updatedAt
    };
  }

  collectCodexIndexedSessions(merged) {
    const indexPath = path.join(os.homedir(), '.codex', 'session_index.jsonl');
    const stat = safeFileStat(indexPath);
    if (!stat || !stat.isFile()) {
      return;
    }
    const records = readLastJsonLines(indexPath, MAX_HISTORY_SESSIONS);
    for (const record of records) {
      const id = readStringValue(record, 'id', '');
      if (id.length === 0) {
        continue;
      }
      const updatedAt = normalizeHistoryTimestamp(readStringValue(record, 'updated_at', ''), stat.mtimeMs);
      const title = readStringValue(record, 'thread_name', '');
      const modelId = codexModelIdFromValue(record);
      const sessionTitle = isCodexNonTitleInstructionText(title) ? '' : title;
      const session = {
        sessionId: this.id + ':' + id,
        remoteSessionId: id,
        providerId: this.id,
        title: sessionTitle.length > 0 ? sessionTitle : this.displayName + ' Session',
        workspacePath: '',
        workspaceTitle: '',
        branchName: 'main',
        modelId: modelId.length > 0 ? modelId : 'configured',
        speedMode: 'auto',
        reasoningMode: 'auto',
        interactionMode: '',
        messageCount: 0,
        status: 'ready',
        source: this.id,
        createdAt: updatedAt,
        updatedAt
      };
      merged.set(session.sessionId, session);
      this.sessions.set(session.sessionId, session);
    }
  }

  collectCodexFileSessions(merged) {
    const rootPath = path.join(os.homedir(), '.codex', 'sessions');
    const files = listJsonlFiles(rootPath, MAX_HISTORY_SESSIONS);
    for (const filePath of files) {
      const stat = safeFileStat(filePath);
      if (!stat || !stat.isFile()) {
        continue;
      }
      const records = readSampledJsonLines(filePath, 192, 32);
      const metaEntries = [];
      let workspacePath = '';
      let primaryRemoteSessionId = codexSessionIdFromRolloutPath(filePath);
      let createdAt = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
      let updatedAt = stat.mtimeMs;
      let messageCount = 0;
      let discoveredModelId = '';
      let discoveredTitle = '';
      for (const record of records) {
        const timestamp = normalizeHistoryTimestamp(readStringValue(record, 'timestamp', ''), 0);
        if (timestamp > 0) {
          createdAt = Math.min(createdAt, timestamp);
          updatedAt = Math.max(updatedAt, timestamp);
        }
        const recordModelId = codexModelIdFromValue(record);
        if (recordModelId.length > 0 && discoveredModelId.length === 0) {
          discoveredModelId = recordModelId;
        }
        const recordTitle = codexSessionTitleFromRecord(record);
        if (recordTitle.length > 0 && discoveredTitle.length === 0) {
          discoveredTitle = recordTitle;
        }
        if (record.type === 'session_meta') {
          const payload = readObjectValue(record, 'payload');
          if (payload) {
            const payloadId = readStringValue(payload, 'id', '');
            const cwd = readStringValue(payload, 'cwd', '');
            const payloadModelId = codexModelIdFromValue(payload);
            if (payloadModelId.length > 0 && discoveredModelId.length === 0) {
              discoveredModelId = payloadModelId;
            }
            if (cwd.length > 0) {
              workspacePath = cwd;
            }
            if (payloadId.length > 0 && (metaEntries.length === 0 || payloadId === primaryRemoteSessionId)) {
              if (metaEntries.length === 0) {
                primaryRemoteSessionId = payloadId;
              }
              metaEntries.push({
                remoteSessionId: payloadId,
                workspacePath: cwd,
                modelId: payloadModelId,
                createdAt: timestamp > 0 ? timestamp : createdAt,
                updatedAt: timestamp > 0 ? timestamp : updatedAt
              });
            }
          }
        } else if (record.type === 'turn_context') {
          const payload = readObjectValue(record, 'payload');
          if (payload) {
            const cwd = readStringValue(payload, 'cwd', '');
            const payloadModelId = codexModelIdFromValue(payload);
            if (payloadModelId.length > 0 && discoveredModelId.length === 0) {
              discoveredModelId = payloadModelId;
            }
            if (cwd.length > 0 && workspacePath.length === 0) {
              workspacePath = cwd;
            }
          }
        } else if (record.type === 'response_item' || record.type === 'event_msg') {
          messageCount += 1;
        }
      }
      if (discoveredTitle.length === 0) {
        discoveredTitle = firstCodexSessionTitleFromFile(filePath);
      }
      if (metaEntries.length === 0) {
        metaEntries.push({
          remoteSessionId: primaryRemoteSessionId,
          workspacePath,
          modelId: discoveredModelId,
          createdAt,
          updatedAt
        });
      }
      const seenRemoteIds = new Set();
      for (const entry of metaEntries) {
        if (entry.remoteSessionId.length === 0 || seenRemoteIds.has(entry.remoteSessionId)) {
          continue;
        }
        seenRemoteIds.add(entry.remoteSessionId);
        const sessionId = this.id + ':' + entry.remoteSessionId;
        const existing = merged.get(sessionId);
        const effectiveWorkspacePath = entry.workspacePath.length > 0 ? entry.workspacePath :
          (workspacePath.length > 0 ? workspacePath : (existing ? existing.workspacePath : ''));
        const workspaceTitle = effectiveWorkspacePath.length > 0 ? path.basename(effectiveWorkspacePath) :
          (existing ? existing.workspaceTitle : '');
        const existingTitle = existing ? existing.title : '';
        const hasSpecificTitle = isSpecificCodexHistoryTitle(existingTitle, workspaceTitle, this.displayName);
        const title = hasSpecificTitle ? existingTitle :
          (discoveredTitle.length > 0 ? discoveredTitle : this.displayName + ' Session');
        const entryCreatedAt = entry.createdAt > 0 ? entry.createdAt : createdAt;
        const entryUpdatedAt = entry.updatedAt > 0 ? entry.updatedAt : updatedAt;
        const entryModelId = typeof entry.modelId === 'string' && entry.modelId.length > 0 ? entry.modelId : discoveredModelId;
        const existingModelId = existing && typeof existing.modelId === 'string' ? existing.modelId : '';
        const session = {
          sessionId,
          remoteSessionId: entry.remoteSessionId,
          providerId: this.id,
          title,
          workspacePath: effectiveWorkspacePath,
          workspaceTitle,
          branchName: existing && existing.branchName.length > 0 ? existing.branchName : 'main',
          modelId: existingModelId.length > 0 && existingModelId !== 'configured' ? existingModelId :
            (entryModelId.length > 0 ? entryModelId : 'configured'),
          speedMode: existing && existing.speedMode.length > 0 ? existing.speedMode : 'auto',
          reasoningMode: existing && existing.reasoningMode && existing.reasoningMode.length > 0 ? existing.reasoningMode : 'auto',
          interactionMode: existing && existing.interactionMode.length > 0 ? existing.interactionMode : '',
          messageCount: existing ? Math.max(existing.messageCount || 0, messageCount) : messageCount,
          status: 'ready',
          source: this.id,
          createdAt: existing ? Math.min(existing.createdAt || entryCreatedAt, entryCreatedAt) : entryCreatedAt,
          updatedAt: existing ? Math.max(existing.updatedAt || entryUpdatedAt, entryUpdatedAt) : entryUpdatedAt
        };
        merged.set(sessionId, session);
        this.sessions.set(sessionId, session);
        this.sessionHistoryFiles.set(sessionId, filePath);
      }
    }
  }

  collectClaudeHistorySessions(merged) {
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
    const stat = safeFileStat(historyPath);
    if (!stat || !stat.isFile()) {
      return;
    }
    const records = readLastJsonLines(historyPath, MAX_HISTORY_SESSIONS);
    for (const record of records) {
      const remoteSessionId = readStringValue(record, 'sessionId', '');
      if (remoteSessionId.length === 0) {
        continue;
      }
      const project = readStringValue(record, 'project', '');
      const workspacePath = decodeClaudeProjectPath(project);
      const workspaceTitle = workspacePath.length > 0 ? path.basename(workspacePath) : project;
      const updatedAt = normalizeHistoryTimestamp(readStringValue(record, 'timestamp', ''), stat.mtimeMs);
      const title = readStringValue(record, 'display', '');
      if (title.trim().startsWith('/')) {
        continue;
      }
      const session = {
        sessionId: this.id + ':' + remoteSessionId,
        remoteSessionId,
        providerId: this.id,
        title: title.length > 0 ? title : (workspaceTitle.length > 0 ? workspaceTitle : this.displayName + ' Session'),
        workspacePath,
        workspaceTitle,
        branchName: 'main',
        modelId: 'configured',
        speedMode: 'auto',
        reasoningMode: 'auto',
        interactionMode: '',
        messageCount: 0,
        status: 'ready',
        source: this.id,
        createdAt: updatedAt,
        updatedAt
      };
      merged.set(session.sessionId, session);
      this.sessions.set(session.sessionId, session);
    }
  }

  collectClaudeFileSessions(merged) {
    const rootPath = path.join(os.homedir(), '.claude', 'projects');
    const files = listJsonlFiles(rootPath, MAX_HISTORY_SESSIONS);
    for (const filePath of files) {
      if (filePath.indexOf(path.sep + 'subagents' + path.sep) >= 0) {
        continue;
      }
      const stat = safeFileStat(filePath);
      if (!stat || !stat.isFile()) {
        continue;
      }
      if (!isClaudeResumeCompatibleHistoryFile(filePath)) {
        continue;
      }
      const records = readSampledJsonLines(filePath, 120, 80);
      let remoteSessionId = path.basename(filePath, '.jsonl');
      let workspacePath = '';
      let branchName = 'main';
      let aiTitle = '';
      let createdAt = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
      let updatedAt = stat.mtimeMs;
      let messageCount = 0;
      for (const record of records) {
        const recordSessionId = readStringValue(record, 'sessionId', '');
        if (recordSessionId.length > 0) {
          remoteSessionId = recordSessionId;
        }
        const cwd = readStringValue(record, 'cwd', '');
        if (cwd.length > 0 && workspacePath.length === 0) {
          workspacePath = cwd;
        }
        const gitBranch = readStringValue(record, 'gitBranch', '');
        if (gitBranch.length > 0) {
          branchName = gitBranch;
        }
        const title = readStringValue(record, 'aiTitle', '');
        if (title.length > 0) {
          aiTitle = title;
        }
        const timestamp = normalizeHistoryTimestamp(readStringValue(record, 'timestamp', ''), 0);
        if (timestamp > 0) {
          createdAt = Math.min(createdAt, timestamp);
          updatedAt = Math.max(updatedAt, timestamp);
        }
        if (record.type === 'user' || record.type === 'assistant') {
          messageCount += 1;
        }
      }
      if (workspacePath.length === 0) {
        workspacePath = decodeClaudeProjectPath(path.basename(path.dirname(filePath)));
      }
      const workspaceTitle = workspacePath.length > 0 ? path.basename(workspacePath) : '';
      const sessionId = this.id + ':' + remoteSessionId;
      const existing = merged.get(sessionId);
      const title = aiTitle.length > 0 ? aiTitle : (existing && existing.title.length > 0 ? existing.title :
        (workspaceTitle.length > 0 ? workspaceTitle : this.displayName + ' Session'));
      const session = {
        sessionId,
        remoteSessionId,
        providerId: this.id,
        title,
        workspacePath: workspacePath.length > 0 ? workspacePath : (existing ? existing.workspacePath : ''),
        workspaceTitle: workspaceTitle.length > 0 ? workspaceTitle : (existing ? existing.workspaceTitle : ''),
        branchName: branchName.length > 0 ? branchName : (existing ? existing.branchName : 'main'),
        modelId: existing && existing.modelId.length > 0 ? existing.modelId : 'configured',
        speedMode: existing && existing.speedMode.length > 0 ? existing.speedMode : 'auto',
        reasoningMode: existing && existing.reasoningMode && existing.reasoningMode.length > 0 ? existing.reasoningMode : 'auto',
        interactionMode: existing && existing.interactionMode.length > 0 ? existing.interactionMode : '',
        messageCount: existing ? Math.max(existing.messageCount || 0, messageCount) : messageCount,
        status: 'ready',
        source: this.id,
        createdAt: existing ? Math.min(existing.createdAt || createdAt, createdAt) : createdAt,
        updatedAt: existing ? Math.max(existing.updatedAt || updatedAt, updatedAt) : updatedAt
      };
      merged.set(sessionId, session);
      this.sessions.set(sessionId, session);
      this.sessionHistoryFiles.set(sessionId, filePath);
    }
  }

  collectPersistentSessions(merged) {
    if (this.id === 'codex') {
      this.collectCodexIndexedSessions(merged);
      this.collectCodexFileSessions(merged);
      return;
    }
    if (this.id === 'claude') {
      this.collectClaudeHistorySessions(merged);
      this.collectClaudeFileSessions(merged);
    }
  }

  normalizeImportedMessageRole(role) {
    if (role === 'assistant') {
      return 'assistant';
    }
    if (role === 'user') {
      return 'user';
    }
    return '';
  }

  buildHistoryMessage(sessionId, role, text, timestamp, messageId, index, reasoningText) {
    const normalizedRole = this.normalizeImportedMessageRole(role);
    if (normalizedRole.length === 0 || text.length === 0) {
      return null;
    }
    const baseCreatedAt = normalizeHistoryTimestamp(timestamp, Date.now());
    const createdAt = baseCreatedAt > 0 ? baseCreatedAt + index : Date.now() + index;
    const stableMessageId = messageId.length > 0 ? messageId : String(createdAt) + ':' + String(index);
    return {
      id: sessionId + ':history:' + stableMessageId,
      sessionId,
      role: normalizedRole,
      title: '',
      text,
      createdAt,
      reasoningText,
      messageId: stableMessageId,
      agentName: ''
    };
  }

  hasRecentDuplicateHistoryMessage(messages, message) {
    if (!message || typeof message !== 'object') {
      return true;
    }
    const startIndex = Math.max(0, messages.length - 4);
    for (let index = startIndex; index < messages.length; index += 1) {
      const existing = messages[index];
      if (existing && existing.role === message.role && existing.text === message.text) {
        return true;
      }
    }
    return false;
  }

  pushHistoryMessage(messages, message) {
    if (!message || this.hasRecentDuplicateHistoryMessage(messages, message)) {
      return;
    }
    messages.push(message);
  }

  historyTimestampFromRecord(record, index) {
    const baseCreatedAt = normalizeHistoryTimestamp(readStringValue(record, 'timestamp', ''), Date.now());
    return baseCreatedAt > 0 ? baseCreatedAt + index : Date.now() + index;
  }

  normalizeHistoryToolStatus(status) {
    if (status === 'completed' || status === 'error') {
      return status;
    }
    return 'running';
  }

  buildHistoryToolCall(sessionId, toolEvent, record, index) {
    if (!toolEvent || typeof toolEvent !== 'object' || toolEvent.toolCallId.length === 0) {
      return null;
    }
    const createdAt = this.historyTimestampFromRecord(record, index);
    const status = this.normalizeHistoryToolStatus(toolEvent.status);
    const completedAt = status === 'running' ? 0 : createdAt;
    return {
      id: sessionId + ':history_tool:' + toolEvent.toolCallId,
      sessionId,
      providerId: this.id,
      messageId: firstStringValue(record, ['messageId', 'message_id', 'id']),
      toolCallId: toolEvent.toolCallId,
      name: toolEvent.name,
      status,
      inputText: toolEvent.inputText,
      outputText: toolEvent.outputText,
      errorText: toolEvent.errorText,
      rawJson: toolEvent.rawJson,
      startedAt: createdAt,
      completedAt,
      updatedAt: createdAt,
      agentName: ''
    };
  }

  mergeHistoryToolCall(existing, toolEvent, record, index) {
    const updatedAt = this.historyTimestampFromRecord(record, index);
    const status = this.normalizeHistoryToolStatus(toolEvent.status);
    return {
      id: existing.id,
      sessionId: existing.sessionId,
      providerId: existing.providerId,
      messageId: existing.messageId.length > 0 ? existing.messageId : firstStringValue(record, ['messageId', 'message_id', 'id']),
      toolCallId: existing.toolCallId,
      name: toolEvent.name.length > 0 && toolEvent.name !== this.id + '.function_call' ? toolEvent.name : existing.name,
      status,
      inputText: toolEvent.inputText.length > 0 ? toolEvent.inputText : existing.inputText,
      outputText: toolEvent.outputText.length > 0 ? toolEvent.outputText : existing.outputText,
      errorText: toolEvent.errorText.length > 0 ? toolEvent.errorText : existing.errorText,
      rawJson: toolEvent.rawJson.length > 0 ? toolEvent.rawJson : existing.rawJson,
      startedAt: existing.startedAt,
      completedAt: status === 'running' ? existing.completedAt : updatedAt,
      updatedAt,
      agentName: existing.agentName
    };
  }

  parseCodexHistoryMessages(sessionId, filePath) {
    const records = readAllJsonLines(filePath);
    const messages = [];
    let pendingReasoningText = '';
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.type === 'event_msg') {
        const payload = readObjectValue(record, 'payload');
        if (!payload) {
          continue;
        }
        const payloadType = readStringValue(payload, 'type', '');
        if (payloadType === 'user_message') {
          let text = readStringValue(payload, 'message', '');
          if (text.length === 0) {
            text = textFromContentParts(payload.text_elements);
          }
          if (!shouldImportCodexHistoryMessage('user', '', text)) {
            continue;
          }
          pendingReasoningText = '';
          const message = this.buildHistoryMessage(
            sessionId,
            'user',
            text,
            readStringValue(record, 'timestamp', ''),
            readStringValue(payload, 'client_id', ''),
            messages.length,
            ''
          );
          this.pushHistoryMessage(messages, message);
          continue;
        }
        if (payloadType === 'agent_message') {
          const text = readStringValue(payload, 'message', '');
          const phase = readStringValue(payload, 'phase', '');
          if (!shouldImportCodexHistoryMessage('assistant', phase, text)) {
            continue;
          }
          const message = this.buildHistoryMessage(
            sessionId,
            'assistant',
            text,
            readStringValue(record, 'timestamp', ''),
            readStringValue(payload, 'turn_id', ''),
            messages.length,
            pendingReasoningText
          );
          this.pushHistoryMessage(messages, message);
          if (pendingReasoningText.length > 0) {
            pendingReasoningText = '';
          }
          continue;
        }
      }
      if (record.type !== 'response_item') {
        continue;
      }
      const payload = readObjectValue(record, 'payload');
      if (!payload) {
        continue;
      }
      const payloadType = readStringValue(payload, 'type', '');
      if (payloadType === 'reasoning') {
        const reasoningText = textFromContentParts(payload.summary);
        if (reasoningText.length > 0) {
          pendingReasoningText = pendingReasoningText.length > 0 ? pendingReasoningText + '\n\n' + reasoningText : reasoningText;
        }
        continue;
      }
      if (payloadType !== 'message') {
        continue;
      }
      const role = readStringValue(payload, 'role', '');
      const text = textFromContentParts(payload.content);
      const phase = readStringValue(payload, 'phase', '');
      if (!shouldImportCodexHistoryMessage(role, phase, text)) {
        if (role === 'user') {
          pendingReasoningText = '';
        }
        continue;
      }
      if (role === 'user') {
        pendingReasoningText = '';
      }
      const message = this.buildHistoryMessage(
        sessionId,
        role,
        text,
        readStringValue(record, 'timestamp', ''),
        readStringValue(payload, 'id', ''),
        messages.length,
        role === 'assistant' ? pendingReasoningText : ''
      );
      if (message) {
        this.pushHistoryMessage(messages, message);
        if (role === 'assistant') {
          pendingReasoningText = '';
        }
      }
    }
    return messages;
  }

  parseCodexHistoryToolCalls(sessionId, filePath) {
    const records = readAllJsonLines(filePath);
    const byToolCallId = new Map();
    const orderedIds = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.type !== 'response_item') {
        continue;
      }
      const payload = readObjectValue(record, 'payload');
      if (!payload) {
        continue;
      }
      const payloadType = readStringValue(payload, 'type', '');
      if (!isToolLikeType(payloadType)) {
        continue;
      }
      const toolEvent = makeToolEvent(this.id, payload, payloadType);
      const existing = byToolCallId.get(toolEvent.toolCallId);
      if (existing) {
        byToolCallId.set(toolEvent.toolCallId, this.mergeHistoryToolCall(existing, toolEvent, record, index));
      } else {
        const item = this.buildHistoryToolCall(sessionId, toolEvent, record, index);
        if (item) {
          orderedIds.push(toolEvent.toolCallId);
          byToolCallId.set(toolEvent.toolCallId, item);
        }
      }
    }
    const items = [];
    for (const toolCallId of orderedIds) {
      const item = byToolCallId.get(toolCallId);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  parseClaudeHistoryMessages(sessionId, filePath) {
    const records = readAllJsonLines(filePath);
    const messages = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const type = readStringValue(record, 'type', '');
      if (type !== 'user' && type !== 'assistant') {
        continue;
      }
      const messageObject = readObjectValue(record, 'message');
      const role = messageObject ? readStringValue(messageObject, 'role', type) : type;
      const content = messageObject ? messageObject.content : record.content;
      const text = role === 'user' ? textFromClaudeUserContent(content) : textFromContentParts(content);
      if (role === 'user' && isClaudeInternalUserMessage(record, text)) {
        continue;
      }
      const message = this.buildHistoryMessage(
        sessionId,
        role,
        text,
        readStringValue(record, 'timestamp', ''),
        readStringValue(record, 'uuid', readStringValue(record, 'messageId', '')),
        messages.length,
        ''
      );
      if (message) {
        messages.push(message);
      }
    }
    return messages;
  }

  async listSessions() {
    const merged = new Map();
    for (const session of this.sessions.values()) {
      merged.set(session.sessionId, session);
    }
    this.collectPersistentSessions(merged);
    const sessions = Array.from(merged.values()).map((session) => this.applyRuntimeStatus(session));
    sessions.sort((left, right) => right.updatedAt - left.updatedAt);
    return sessions;
  }

  async listMessages(sessionId) {
    const messages = this.messages.get(sessionId) || [];
    if (messages.length > 0) {
      return messages;
    }
    const filePath = this.sessionHistoryFiles.get(sessionId) || '';
    if (filePath.length === 0) {
      return [];
    }
    if (this.id === 'codex') {
      return this.parseCodexHistoryMessages(sessionId, filePath);
    }
    if (this.id === 'claude') {
      return this.parseClaudeHistoryMessages(sessionId, filePath);
    }
    return [];
  }

  async listToolCalls(sessionId) {
    const filePath = this.sessionHistoryFiles.get(sessionId) || '';
    if (filePath.length === 0) {
      return [];
    }
    if (this.id === 'codex') {
      return this.parseCodexHistoryToolCalls(sessionId, filePath);
    }
    return [];
  }

  async sendMessage(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const text = readStringValue(payload, 'text', '');
    const modelId = readStringValue(payload, 'modelId', '');
    const speedMode = readStringValue(payload, 'speedMode', '');
    const reasoningMode = readStringValue(payload, 'reasoningMode', '');
    const interactionMode = this.normalizeRequestedInteractionMode(payload);
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }
    if (modelId.length > 0) {
      session.modelId = modelId;
    }
    if (speedMode.length > 0) {
      session.speedMode = speedMode;
    }
    if (reasoningMode.length > 0) {
      session.reasoningMode = reasoningMode;
    }
    session.interactionMode = interactionMode;
    session.interactionModes = normalizeStringArray(readArrayValue(payload, 'interactionModes'));
    session.status = 'running';
    session.updatedAt = Date.now();
    session.messageCount = session.messageCount + 1;
    const history = this.messages.get(sessionId) || [];
    const now = Date.now();
    history.push({
      id: sessionId + ':user:' + String(history.length + 1),
      sessionId,
      role: 'user',
      title: '',
      text,
      createdAt: now
    });
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
    emit(makeEvent(EventType.TOOL_STARTED, sessionId, {
      toolCallId: this.id + '_cli',
      name: this.id + '.cli',
      input: {
        command: this.command,
        modelId: session.modelId,
        workspacePath: session.workspacePath
      }
    }));

    const promptText = buildPromptWithContext(text, payload, session);
    let output;
    try {
      output = this.runtimeMode === 'stdio'
        ? await this.runStdioCli(session, promptText, interactionMode, emit)
        : await this.runCli(session, promptText, interactionMode, emit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error && typeof error.code === 'string' && error.code.length > 0 ? error.code : 'cli_runtime_failed';
      session.status = 'ready';
      session.updatedAt = Date.now();
      this.applyRuntimeStatus(session);
      session.lastError = message;
      this.messages.set(sessionId, history);
      emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
        toolCallId: this.id + '_cli',
        status: 'failed',
        error: {
          code,
          message,
          runtimeMode: this.runtimeMode,
          sessionState: session.sessionState,
          exitCode: session.exitCode
        }
      }));
      emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
      const wrapped = new Error(message);
      wrapped.code = code;
      wrapped.runtimeMode = this.runtimeMode;
      wrapped.sessionState = session.sessionState;
      wrapped.exitCode = session.exitCode;
      wrapped.pid = session.pid || 0;
      throw wrapped;
    }
    this.ensureClaudeResumeScaffold(session, text);
    const assistantText = cliRunText(output).trim();
    const skipAssistantCompletion = cliRunSkipsAssistantCompletion(output);
    const toolStatus = cliRunToolStatus(output);
    if (interactionMode === 'plan' && assistantText.length > 0 && !skipAssistantCompletion) {
      const planId = this.id + '_plan_' + crypto.createHash('sha1').update(sessionId + ':' + text + ':' + assistantText).digest('hex').substring(0, 16);
      this.pendingPlans.set(planId, {
        sessionId,
        providerId: this.id,
        originalPrompt: text,
        planContent: assistantText,
        modelId: session.modelId,
        speedMode: session.speedMode,
        reasoningMode: session.reasoningMode,
        interactionModes: Array.isArray(session.interactionModes) ? session.interactionModes : []
      });
      emit(makeEvent(EventType.PLAN_REQUESTED, sessionId, {
        providerId: this.id,
        planId,
        title: this.displayName + ' Plan',
        content: assistantText,
        status: 'pending',
        originalPrompt: text
      }));
    } else if (assistantText.length > 0 && !skipAssistantCompletion) {
      history.push({
        id: sessionId + ':assistant:' + String(history.length + 1),
        sessionId,
        role: 'assistant',
        title: '',
        text: assistantText,
        createdAt: Date.now(),
        reasoningText: ''
      });
      emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
        role: 'assistant',
        text: assistantText,
        contentKind: 'text'
      }));
    } else if (skipAssistantCompletion) {
      emit(makeEvent(EventType.MESSAGE_COMPLETED, sessionId, {
        role: 'assistant',
        text: '',
        contentKind: 'text'
      }));
    }
    this.messages.set(sessionId, history);
    session.status = 'ready';
    session.updatedAt = Date.now();
    session.lastError = '';
    this.applyRuntimeStatus(session);
    emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
      toolCallId: this.id + '_cli',
      status: toolStatus
    }));
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
  }

  normalizeInteractionMode(value) {
    const mode = typeof value === 'string' ? value.toLowerCase() : '';
    if (mode === 'plan' && this.supportsPlanMode) {
      return 'plan';
    }
    if (mode === 'goal') {
      return 'goal';
    }
    return 'goal';
  }

  normalizeRequestedInteractionMode(payload) {
    const modes = readArrayValue(payload, 'interactionModes');
    for (const item of modes) {
      if (typeof item === 'string' && item.toLowerCase() === 'plan' && this.supportsPlanMode) {
        return 'plan';
      }
    }
    for (const item of modes) {
      if (typeof item === 'string' && item.toLowerCase() === 'goal') {
        return 'goal';
      }
    }
    const requestedMode = readStringValue(payload, 'interactionMode', readStringValue(payload, 'runMode', ''));
    if (requestedMode.length === 0) {
      return '';
    }
    return this.normalizeInteractionMode(requestedMode);
  }

  buildPromptText(promptText, interactionMode) {
    if (interactionMode === 'plan' && this.planPromptPrefix.length > 0) {
      return this.planPromptPrefix + '\n\n' + promptText;
    }
    if (interactionMode === 'goal' && this.goalPromptPrefix.length > 0) {
      return this.goalPromptPrefix + '\n\n' + promptText;
    }
    return promptText;
  }

  buildArgs(session, promptText, interactionMode, runtimeOptions = {}) {
    const args = [];
    for (const arg of this.commandArgs) {
      if (typeof arg === 'string' && arg.length > 0) {
        args.push(arg);
      }
    }
    if (this.id === 'claude') {
      const remoteSessionId = readStringValue(session, 'remoteSessionId', remoteSessionIdFromLocalSessionId(this.id, session.sessionId));
      if (isUuidText(remoteSessionId)) {
        if (readNumberValue(session, 'messageCount', 0) > 1) {
          args.push('--resume');
          args.push(remoteSessionId);
        } else {
          args.push('--session-id');
          args.push(remoteSessionId);
        }
      }
    }
    if (this.cwdFlag.length > 0 && session.workspacePath.length > 0) {
      args.push(this.cwdFlag);
      args.push(session.workspacePath);
    }
    if (this.modelFlag.length > 0 && session.modelId.length > 0 && session.modelId !== 'configured') {
      args.push(this.modelFlag);
      args.push(session.modelId);
    }
    this.appendRuntimeModeArgs(args, session, runtimeOptions);
    const modeArgs = interactionMode === 'plan' ? this.planArgs : this.goalArgs;
    for (const arg of modeArgs) {
      if (typeof arg === 'string' && arg.length > 0) {
        args.push(arg);
      }
    }
    if (this.promptMode === 'arg') {
      args.push(promptText);
    } else if (this.promptMode === 'dash') {
      args.push('-');
    }
    return args;
  }

  appendRuntimeModeArgs(args, session, runtimeOptions = {}) {
    if (this.id === 'claude') {
      const permissionMode = this.selectedClaudePermissionMode(session, runtimeOptions);
      if (permissionMode.length > 0) {
        args.push('--permission-mode');
        args.push(permissionMode);
      }
    }
    return args;
  }

  selectedClaudePermissionMode(session, runtimeOptions = {}) {
    const override = readStringValue(runtimeOptions, 'claudePermissionMode', '');
    if (override.length > 0) {
      return override;
    }
    const modes = Array.isArray(session.interactionModes) ? session.interactionModes : [];
    for (const mode of modes) {
      if (mode === 'claude-permissions-full-access' || mode === 'full-access' || mode === 'bypassPermissions') {
        return 'bypassPermissions';
      }
    }
    for (const mode of modes) {
      if (mode === 'claude-permissions-accept-edits' || mode === 'accept-edits' || mode === 'acceptEdits') {
        return 'acceptEdits';
      }
    }
    return '';
  }

  claudeSessionFilePath(session) {
    if (this.id !== 'claude') {
      return '';
    }
    const remoteSessionId = readStringValue(session, 'remoteSessionId', remoteSessionIdFromLocalSessionId(this.id, session.sessionId));
    if (!isUuidText(remoteSessionId)) {
      return '';
    }
    const workspacePath = readStringValue(session, 'workspacePath', '');
    const projectKey = encodeClaudeProjectPath(workspacePath.length > 0 ? workspacePath : process.cwd());
    if (projectKey.length === 0) {
      return '';
    }
    return path.join(os.homedir(), '.claude', 'projects', projectKey, remoteSessionId + '.jsonl');
  }

  ensureClaudeHistoryIndex(session, promptText) {
    if (this.id !== 'claude') {
      return;
    }
    const remoteSessionId = readStringValue(session, 'remoteSessionId', remoteSessionIdFromLocalSessionId(this.id, session.sessionId));
    if (!isUuidText(remoteSessionId)) {
      return;
    }
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
    const records = readLastJsonLines(historyPath, MAX_HISTORY_SESSIONS);
    for (const record of records) {
      if (readStringValue(record, 'sessionId', '') === remoteSessionId) {
        return;
      }
    }
    let display = typeof promptText === 'string' ? promptText.split(/\s+/).join(' ').trim() : '';
    if (display.length > 120) {
      display = display.substring(0, 117).trim() + '...';
    }
    safeAppendJsonLine(historyPath, {
      display: display.length > 0 ? display : readStringValue(session, 'title', this.displayName + ' Session'),
      pastedContents: {},
      timestamp: Date.now(),
      project: readStringValue(session, 'workspacePath', ''),
      sessionId: remoteSessionId
    });
  }

  ensureClaudeResumeScaffold(session, promptText) {
    if (this.id !== 'claude') {
      return;
    }
    const remoteSessionId = readStringValue(session, 'remoteSessionId', remoteSessionIdFromLocalSessionId(this.id, session.sessionId));
    if (!isUuidText(remoteSessionId)) {
      return;
    }
    const filePath = this.claudeSessionFilePath(session);
    if (filePath.length === 0) {
      return;
    }
    const firstType = firstJsonLineType(filePath);
    if (firstType !== 'mode') {
      const nowIso = new Date().toISOString();
      safePrependJsonLines(filePath, [
        {
          type: 'mode',
          sessionId: remoteSessionId,
          mode: 'normal'
        },
        {
          type: 'permission-mode',
          permissionMode: 'default',
          sessionId: remoteSessionId
        },
        {
          type: 'file-history-snapshot',
          sessionId: remoteSessionId,
          snapshot: {
            trackedFileBackups: {}
          },
          timestamp: nowIso,
          isSnapshotUpdate: false
        }
      ]);
    }
    this.sessionHistoryFiles.set(session.sessionId, filePath);
    this.ensureClaudeHistoryIndex(session, promptText);
  }

  runCli(session, promptText, interactionMode, emit, runtimeOptions = {}) {
    return new Promise((resolve, reject) => {
      const effectivePrompt = this.buildPromptText(promptText, interactionMode);
      if (this.id === 'claude') {
        const filePath = this.claudeSessionFilePath(session);
        if (filePath.length > 0 && safeFileStat(filePath)) {
          this.ensureClaudeResumeScaffold(session, promptText);
        }
      }
      const args = this.buildArgs(session, effectivePrompt, interactionMode, runtimeOptions);
      const child = spawn(this.command, args, {
        cwd: session.workspacePath.length > 0 ? session.workspacePath : process.cwd(),
        env: Object.assign({}, process.env, this.env),
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const runState = {
        sessionId: session.sessionId,
        child,
        aborted: false,
        abortReason: ''
      };
      this.activeRuns.set(session.sessionId, runState);
      let stdout = '';
      let stderr = '';
      let jsonBuffer = '';
      let lastEmittedText = readStringValue(runtimeOptions, 'initialEmittedText', '');
      let pendingPermissionRun = null;
      let pendingRequestRun = null;
      let settled = false;
      let timer = null;
      const pendingRequestToolCallIds = new Set();
      const emittedToolEvents = new Set();
      const emittedRequestEvents = new Set();
      const emittedPlanEvents = new Set();
      const emittedPermissionEvents = new Set();
      const clearActiveRun = () => {
        if (this.activeRuns.get(session.sessionId) === runState) {
          this.activeRuns.delete(session.sessionId);
        }
      };
      const cancelledOutput = () => {
        return {
          text: '',
          toolStatus: 'cancelled',
          skipAssistantCompletion: true
        };
      };
      const finishResolve = (output) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
        }
        clearActiveRun();
        resolve(output);
      };
      const finishReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
        }
        clearActiveRun();
        reject(error);
      };
      timer = setTimeout(() => {
        runState.aborted = true;
        runState.abortReason = 'timeout';
        terminateChildProcess(child);
        finishReject(new Error(this.displayName + ' timed out after ' + String(this.timeoutMs) + 'ms'));
      }, this.timeoutMs);

      const emitText = (text, contentKind) => {
        if (runState.aborted || text.length === 0) {
          return;
        }
        emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
          role: 'assistant',
          text,
          contentKind
        }));
      };

      const handleJsonLine = (line) => {
        const permissionEvents = parsePermissionEventsFromJsonLine(this.id, line);
        const requestEvents = parseRequestEventsFromJsonLine(this.id, line);
        for (const requestEvent of requestEvents) {
          if (requestEvent.toolCallId && requestEvent.toolCallId.length > 0) {
            pendingRequestToolCallIds.add(requestEvent.toolCallId);
          }
        }
        const hasPermissionEvent = permissionEvents.length > 0;
        const hasRequestEvent = requestEvents.length > 0;
        const toolEvents = parseToolEventsFromJsonLine(this.id, line);
        for (const toolEvent of toolEvents) {
          if (pendingRequestToolCallIds.has(toolEvent.toolCallId) || isAskUserQuestionToolName(toolEvent.name)) {
            continue;
          }
          const eventKey = toolEvent.toolCallId + ':' + toolEvent.status + ':' + crypto.createHash('sha1').update(toolEvent.rawJson).digest('hex');
          if (!emittedToolEvents.has(eventKey)) {
            emittedToolEvents.add(eventKey);
            if (toolEvent.status === 'started') {
              emit(makeEvent(EventType.TOOL_STARTED, session.sessionId, {
                toolCallId: toolEvent.toolCallId,
                name: toolEvent.name,
                inputText: toolEvent.inputText,
                rawJson: toolEvent.rawJson
              }));
            } else {
              const outputText = toolEvent.status === 'error' && toolEvent.errorText.length > 0 ? toolEvent.errorText : toolEvent.outputText;
              if (outputText.length > 0 && !hasPermissionEvent && !hasRequestEvent) {
                emit(makeEvent(EventType.TOOL_OUTPUT, session.sessionId, {
                  toolCallId: toolEvent.toolCallId,
                  name: toolEvent.name,
                  text: outputText,
                  outputText,
                  errorText: toolEvent.errorText,
                  rawJson: toolEvent.rawJson
                }));
              }
              emit(makeEvent(EventType.TOOL_COMPLETED, session.sessionId, {
                toolCallId: toolEvent.toolCallId,
                name: toolEvent.name,
                status: toolEvent.status,
                outputText: toolEvent.outputText,
                errorText: toolEvent.errorText,
                rawJson: toolEvent.rawJson
              }));
            }
          }
        }
        for (const permissionEvent of permissionEvents) {
          const eventKey = permissionEvent.requestId + ':' + crypto.createHash('sha1').update(permissionEvent.rawJson).digest('hex');
          if (!emittedPermissionEvents.has(eventKey)) {
            emittedPermissionEvents.add(eventKey);
            if (pendingPermissionRun === null) {
              pendingPermissionRun = this.rememberPendingPermissionRun(session, promptText, interactionMode, permissionEvent);
            }
            emit(makeEvent(EventType.PERMISSION_REQUESTED, session.sessionId, {
              providerId: this.id,
              requestId: permissionEvent.requestId,
              permissionId: permissionEvent.permissionId,
              kind: permissionEvent.kind,
              title: permissionEvent.title,
              prompt: permissionEvent.prompt,
              permission: permissionEvent.permission,
              status: permissionEvent.status,
              rawJson: permissionEvent.rawJson
            }));
          }
        }
        for (const requestEvent of requestEvents) {
          const eventKey = requestEvent.requestId + ':' + crypto.createHash('sha1').update(requestEvent.rawJson).digest('hex');
          if (!emittedRequestEvents.has(eventKey)) {
            emittedRequestEvents.add(eventKey);
            if (requestEvent.toolCallId && requestEvent.toolCallId.length > 0) {
              pendingRequestToolCallIds.add(requestEvent.toolCallId);
            }
            if (pendingRequestRun === null) {
              pendingRequestRun = this.rememberPendingRequestRun(session, promptText, interactionMode, requestEvent);
            }
            emit(makeEvent(EventType.QUESTION_REQUESTED, session.sessionId, {
              providerId: this.id,
              requestId: requestEvent.requestId,
              toolCallId: requestEvent.toolCallId,
              kind: requestEvent.kind,
              title: requestEvent.title,
              prompt: requestEvent.prompt,
              options: requestEvent.options,
              allowFreeText: requestEvent.allowFreeText,
              status: requestEvent.status,
              rawJson: requestEvent.rawJson
            }));
          }
        }
        const planEvents = parsePlanEventsFromJsonLine(this.id, line);
        for (const planEvent of planEvents) {
          if (planEvent.content.length === 0) {
            continue;
          }
          const eventKey = planEvent.planId + ':' + crypto.createHash('sha1').update(planEvent.rawJson).digest('hex');
          if (!emittedPlanEvents.has(eventKey)) {
            emittedPlanEvents.add(eventKey);
            this.pendingPlans.set(planEvent.planId, {
              sessionId: session.sessionId,
              providerId: this.id,
              originalPrompt: promptText,
              planContent: planEvent.content,
              modelId: session.modelId,
              speedMode: session.speedMode,
              reasoningMode: session.reasoningMode,
              interactionModes: Array.isArray(session.interactionModes) ? session.interactionModes : []
            });
            emit(makeEvent(EventType.PLAN_REQUESTED, session.sessionId, {
              providerId: this.id,
              planId: planEvent.planId,
              title: planEvent.title.length > 0 ? planEvent.title : this.displayName + ' Plan',
              content: planEvent.content,
              status: planEvent.status,
              rawJson: planEvent.rawJson
            }));
          }
        }
        if (pendingPermissionRun !== null || pendingRequestRun !== null) {
          return;
        }
        const extracted = isClaudePermissionDenialJsonLine(line) ? '' : textFromJsonLine(line);
        const deltaText = deltaFromCliStreamText(lastEmittedText, extracted);
        if (deltaText.length === 0) {
          return;
        }
        lastEmittedText = mergeCliStreamText(lastEmittedText, extracted);
        emitText(deltaText, 'text');
      };
      child.stdout.on('data', (chunk) => {
        const text = Buffer.from(chunk).toString('utf8');
        stdout = stdout + text;
        if (runState.aborted) {
          return;
        }
        if (this.jsonMode === 'jsonl') {
          jsonBuffer = jsonBuffer + text;
          let newlineIndex = jsonBuffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = jsonBuffer.substring(0, newlineIndex).trim();
            jsonBuffer = jsonBuffer.substring(newlineIndex + 1);
            handleJsonLine(line);
            newlineIndex = jsonBuffer.indexOf('\n');
          }
          return;
        }
        emitText(text, 'text');
      });
      child.stderr.on('data', (chunk) => {
        const text = Buffer.from(chunk).toString('utf8');
        stderr = stderr + text;
        if (runState.aborted) {
          return;
        }
        emit(makeEvent(EventType.TOOL_OUTPUT, session.sessionId, {
          toolCallId: this.id + '_cli',
          name: this.id + '.cli',
          text
        }));
      });
      child.on('error', (error) => {
        if (runState.aborted) {
          finishResolve(cancelledOutput());
          return;
        }
        finishReject(error);
      });
      child.on('exit', async (code) => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        try {
          if (runState.aborted) {
            finishResolve(cancelledOutput());
            return;
          }
          if (this.jsonMode === 'jsonl' && jsonBuffer.trim().length > 0) {
            handleJsonLine(jsonBuffer.trim());
          }
          if (pendingPermissionRun !== null) {
            session.status = 'waiting_permission';
            session.updatedAt = Date.now();
            emit(makeEvent(EventType.SESSION_UPDATED, session.sessionId, { session }));
            const permissionResponse = await pendingPermissionRun.promise;
            this.clearPendingPermissionRun(pendingPermissionRun);
            if (runState.aborted || readBooleanValue(permissionResponse, 'aborted', false)) {
              finishResolve(cancelledOutput());
              return;
            }
            const responseStatus = readStringValue(permissionResponse, 'status', '');
            if (responseStatus === 'rejected') {
              finishResolve({
                text: '',
                toolStatus: 'rejected',
                skipAssistantCompletion: true
              });
              return;
            }
            const rerunOutput = await this.runCli(session, promptText, interactionMode, emit, {
              claudePermissionMode: 'bypassPermissions',
              initialEmittedText: lastEmittedText
            });
            finishResolve(rerunOutput);
            return;
          }
          if (pendingRequestRun !== null) {
            session.status = 'waiting_request';
            session.updatedAt = Date.now();
            emit(makeEvent(EventType.SESSION_UPDATED, session.sessionId, { session }));
            const requestResponse = await pendingRequestRun.promise;
            this.clearPendingRequestRun(pendingRequestRun);
            if (runState.aborted || readBooleanValue(requestResponse, 'aborted', false)) {
              finishResolve(cancelledOutput());
              return;
            }
            const responseStatus = readStringValue(requestResponse, 'status', '');
            if (responseStatus === 'dismissed' || responseStatus === 'rejected') {
              finishResolve({
                text: '',
                toolStatus: responseStatus,
                skipAssistantCompletion: true
              });
              return;
            }
            const requestPrompt = this.buildPromptWithRequestResponse(promptText, pendingRequestRun, requestResponse);
            const rerunOutput = await this.runCli(session, requestPrompt, interactionMode, emit, {
              initialEmittedText: lastEmittedText
            });
            finishResolve(rerunOutput);
            return;
          }
          if (code !== 0) {
            finishReject(new Error(this.displayName + ' exited with code ' + String(code) + (stderr.length > 0 ? ': ' + stderr.trim() : '')));
            return;
          }
          if (this.jsonMode === 'jsonl') {
            const lines = stdout.split(/\r?\n/);
            let mergedText = '';
            for (const line of lines) {
              if (isClaudePermissionDenialJsonLine(line)) {
                continue;
              }
              const text = textFromJsonLine(line);
              if (text.length > 0) {
                mergedText = mergeCliStreamText(mergedText, text);
              }
            }
            finishResolve({
              text: mergedText.length > 0 ? mergedText : stdout,
              toolStatus: 'completed',
              skipAssistantCompletion: false
            });
            return;
          }
          finishResolve({
            text: stdout,
            toolStatus: 'completed',
            skipAssistantCompletion: false
          });
          return;
        } catch (error) {
          finishReject(error);
        }
      });
      if (this.promptMode !== 'arg') {
        child.stdin.write(effectivePrompt);
        child.stdin.end();
      } else {
        child.stdin.end();
      }
    });
  }

  async respondRequest(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const requestId = readStringValue(payload, 'requestId', '');
    const answer = readStringValue(payload, 'answer', readStringValue(payload, 'message', ''));
    const optionId = readStringValue(payload, 'optionId', '');
    const status = optionId === 'dismissed' && answer.length === 0 ? 'dismissed' : 'answered';
    const pending = this.findPendingRequestRun(sessionId, requestId);
    const responseSessionId = pending ? pending.sessionId : sessionId;
    const session = this.getSession(responseSessionId);
    if (!session) {
      throw new Error('Session not found: ' + responseSessionId);
    }
    if (typeof emit === 'function' && responseSessionId.length > 0) {
      emit(makeEvent(EventType.QUESTION_REQUESTED, responseSessionId, {
        providerId: this.id,
        requestId,
        status,
        answer,
        optionId
      }));
    }
    if (pending) {
      this.resolvePendingRequestRun(pending, {
        status,
        requestId: pending.requestId,
        toolCallId: pending.toolCallId,
        answer,
        optionId
      });
      return {
        status,
        requestId: pending.requestId,
        continued: status === 'answered',
        message: status === 'answered' ?
          this.displayName + ' request answered; continuing the waiting run.' :
          this.displayName + ' request dismissed; the waiting run will stop.'
      };
    }
    const parts = [];
    parts.push('User response for request ' + (requestId.length > 0 ? requestId : 'latest') + ':');
    if (optionId.length > 0) {
      parts.push('Selected option: ' + optionId);
    }
    if (answer.length > 0) {
      parts.push(answer);
    }
    const responseText = parts.join('\n');
    await this.sendMessage({
      sessionId: responseSessionId,
      text: responseText,
      modelId: session.modelId,
      speedMode: session.speedMode,
      reasoningMode: session.reasoningMode,
      interactionMode: 'goal',
      interactionModes: Array.isArray(session.interactionModes) ? session.interactionModes : []
    }, emit);
    return { status, requestId, continued: true };
  }

  async respondPermission(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const requestId = readStringValue(payload, 'requestId', readStringValue(payload, 'permissionId', ''));
    const permissionId = readStringValue(payload, 'permissionId', requestId);
    const reply = normalizeCliPermissionReply(readStringValue(payload, 'reply', readStringValue(payload, 'response', 'once')));
    const message = readStringValue(payload, 'message', '');
    const status = reply === 'reject' ? 'rejected' : 'allowed';
    const pending = this.findPendingPermissionRun(sessionId, requestId, permissionId);
    if (typeof emit === 'function' && sessionId.length > 0) {
      emit(makeEvent(EventType.PERMISSION_REQUESTED, sessionId, {
        providerId: this.id,
        requestId,
        permissionId,
        status,
        answer: message,
        optionId: reply,
        reply
      }));
    }
    if (pending) {
      this.resolvePendingPermissionRun(pending, {
        status,
        requestId: pending.requestId,
        permissionId: pending.permissionId,
        reply,
        message
      });
      return {
        status,
        requestId: pending.requestId,
        permissionId: pending.permissionId,
        reply,
        continued: status !== 'rejected',
        message: status === 'rejected' ?
          this.displayName + ' permission rejected; the waiting run will stop.' :
          this.displayName + ' permission accepted; continuing the waiting run with a permission-enabled rerun.'
      };
    }
    return {
      status,
      requestId,
      permissionId,
      reply,
      continued: false,
      message: this.displayName + ' print-mode permission responses update the request state; rerun with an appropriate permission mode to apply the grant.'
    };
  }

  async respondPlan(payload, emit) {
    const sessionId = readStringValue(payload, 'sessionId', '');
    const planId = readStringValue(payload, 'planId', '');
    const reply = readStringValue(payload, 'reply', readStringValue(payload, 'action', 'implement')).toLowerCase();
    const message = readStringValue(payload, 'message', '');
    const pending = this.pendingPlans.get(planId);
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('Plan not found: ' + planId);
    }
    if (reply === 'reject' || reply === 'rejected') {
      this.pendingPlans.delete(planId);
      emit(makeEvent(EventType.PLAN_UPDATED, sessionId, {
        providerId: this.id,
        planId,
        status: 'rejected',
        message
      }));
      return { status: 'rejected', planId };
    }
    emit(makeEvent(EventType.PLAN_UPDATED, sessionId, {
      providerId: this.id,
      planId,
      status: 'implementing',
      message
    }));
    const implementationPrompt = 'Implement the approved plan.\n\nOriginal request:\n' +
      pending.originalPrompt +
      '\n\nApproved plan:\n' +
      pending.planContent +
      (message.length > 0 ? '\n\nAdditional user note:\n' + message : '');
    await this.sendMessage({
      sessionId,
      text: implementationPrompt,
      modelId: pending.modelId,
      speedMode: pending.speedMode,
      reasoningMode: pending.reasoningMode,
      interactionMode: 'goal',
      interactionModes: Array.isArray(pending.interactionModes) ? pending.interactionModes : []
    }, emit);
    this.pendingPlans.delete(planId);
    emit(makeEvent(EventType.PLAN_UPDATED, sessionId, {
      providerId: this.id,
      planId,
      status: 'implemented'
    }));
    return { status: 'implemented', planId };
  }
}

class CodexCliProvider extends CliProvider {
  constructor(config) {
    super(config);
    this.codexDiscoveryCache = null;
    this.codexDiscoveryCacheExpiresAt = 0;
  }

  async describe() {
    const available = await commandExists(this.command);
    const discovery = await this.discoverCodexState(available);
    const healthParts = [];
    if (discovery.version.length > 0) {
      healthParts.push(discovery.version);
    } else if (available) {
      healthParts.push(this.displayName + ' is available');
    } else {
      healthParts.push(this.command + ' is not on PATH');
    }
    if (discovery.models.length > 1) {
      healthParts.push(String(discovery.models.length - 1) + ' models');
    }
    if (discovery.modelSource.length > 0 && discovery.models.length > 1) {
      healthParts.push(discovery.modelSource);
    }
    return {
      id: this.id,
      displayName: this.displayName,
      status: available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.command,
      runtimeMode: 'oneshot',
      capabilitySource: discovery.capabilitySource,
      capabilityStatus: discovery.capabilityStatus,
      lastDiscoveredAt: discovery.lastDiscoveredAt,
      discoveryWarnings: discovery.discoveryWarnings,
      discoveryErrors: discovery.discoveryErrors,
      capabilities: {
        streaming: this.jsonMode !== 'none',
        tools: true,
        previews: false,
        permissions: false,
        history: true,
        interactiveSessions: false,
        modelSelection: discovery.supportsModelSelection,
        speedProfiles: false,
        workspaceAware: discovery.supportsWorkspace,
        nativeProxy: false,
        events: true,
        requests: true,
        plans: this.supportsPlanMode,
        questions: true,
        shell: discovery.supportsShell,
        commands: true,
        search: discovery.supportsSearch,
        images: discovery.supportsImages,
        approvals: discovery.supportsApprovals,
        mcp: discovery.supportsMcp,
        plugins: discovery.supportsPlugins,
        multiAgent: discovery.supportsMultiAgent,
        browser: discovery.supportsBrowser,
        computerUse: discovery.supportsComputerUse,
        imageGeneration: discovery.supportsImageGeneration,
        health: healthParts.join(' · ')
      },
      models: discovery.models,
      speedModes: withForcedOptionSource(buildCodexSpeedModes(), 'fallback', discovery.fallbackWarning),
      reasoningModes: discovery.reasoningModes.length > 0 ? discovery.reasoningModes : withForcedOptionSource(buildCodexReasoningModes(), 'fallback', discovery.fallbackWarning),
      tools: discovery.tools,
      sessionFeatures: this.buildSessionFeatures(),
      interactionModes: withForcedOptionSource(this.buildInteractionModes(), discovery.capabilitySource, discovery.fallbackWarning)
    };
  }

  async discoverCodexState(available) {
    const now = Date.now();
    if (this.codexDiscoveryCache && now < this.codexDiscoveryCacheExpiresAt) {
      return this.codexDiscoveryCache;
    }
    const configuredSlug = readCodexConfiguredModelSlug();
    const cachedModels = readCodexCachedModels();
    let version = '';
    let rootHelp = '';
    let execHelp = '';
    let featureText = '';
    let explicitModels = cachedModels;
    let modelSource = cachedModels.length > 0 ? 'cache' : '';
    const discoveryWarnings = [];
    const discoveryErrors = [];
    if (available) {
      const [
        versionResult,
        rootHelpResult,
        execHelpResult,
        debugModelsResult,
        featuresResult
      ] = await Promise.all([
        runCommandCapture(this.command, ['--version'], 4000),
        runCommandCapture(this.command, ['--help'], 6000),
        runCommandCapture(this.command, ['exec', '--help'], 6000),
        runCommandCapture(this.command, ['debug', 'models'], 8000),
        runCommandCapture(this.command, ['features', 'list'], 6000)
      ]);
      version = versionResult.ok ? versionResult.stdout.trim().split(/\r?\n/)[0] : '';
      rootHelp = rootHelpResult.ok ? rootHelpResult.stdout : '';
      execHelp = execHelpResult.ok ? execHelpResult.stdout : '';
      featureText = featuresResult.ok ? featuresResult.stdout : '';
      const debugModels = debugModelsResult.ok ? parseCodexModelCatalogText(debugModelsResult.stdout) : [];
      if (debugModels.length > 0) {
        explicitModels = debugModels;
        modelSource = 'runtime';
      } else if (!debugModelsResult.ok && cachedModels.length > 0) {
        discoveryWarnings.push('Codex debug models failed; using cached model metadata.');
      } else if (!debugModelsResult.ok) {
        discoveryWarnings.push('Codex debug models failed; using configured fallback model.');
      }
      if (!rootHelpResult.ok) {
        discoveryWarnings.push('Codex --help discovery failed: ' + rootHelpResult.error);
      }
      if (!execHelpResult.ok) {
        discoveryWarnings.push('Codex exec --help discovery failed: ' + execHelpResult.error);
      }
      if (!featuresResult.ok) {
        discoveryWarnings.push('Codex feature discovery failed: ' + featuresResult.error);
      }
    } else {
      discoveryWarnings.push(this.command + ' is not on PATH; using configured fallback model.');
    }
    const orderedModels = [];
    const seenIds = new Set();
    if (configuredSlug.length > 0) {
      for (let index = 0; index < explicitModels.length; index += 1) {
        if (explicitModels[index].id === configuredSlug) {
          appendUniqueModelOptions(orderedModels, [explicitModels[index]], seenIds);
          break;
        }
      }
    }
    appendUniqueModelOptions(orderedModels, explicitModels, seenIds);
    let configuredDisplayName = '';
    if (configuredSlug.length > 0) {
      for (const model of orderedModels) {
        if (model.id === configuredSlug) {
          configuredDisplayName = 'Configured (' + model.displayName + ')';
          break;
        }
      }
      if (configuredDisplayName.length === 0) {
        configuredDisplayName = 'Configured (' + configuredSlug + ')';
      }
    } else if (orderedModels.length > 0) {
      configuredDisplayName = 'Configured (' + orderedModels[0].displayName + ')';
    }
    let capabilitySource = 'fallback';
    if (modelSource === 'runtime' || modelSource === 'debug models') {
      capabilitySource = 'runtime';
    } else if (modelSource === 'cache') {
      capabilitySource = 'cache';
    }
    const fallbackWarning = capabilitySource === 'fallback' ? 'Fallback metadata; Codex runtime discovery did not return a model catalog.' : '';
    const models = withForcedOptionSource(buildConfiguredModels(this.id, orderedModels, configuredDisplayName), capabilitySource, fallbackWarning);
    const enabledFeatures = parseCodexFeatureFlags(featureText);
    const discovery = {
      version,
      modelSource,
      capabilitySource,
      capabilityStatus: discoveryWarnings.length > 0 || !available ? 'degraded' : 'ready',
      lastDiscoveredAt: now,
      discoveryWarnings,
      discoveryErrors,
      fallbackWarning,
      models,
      reasoningModes: withForcedOptionSource(this.buildCodexReasoningModes(orderedModels), capabilitySource, fallbackWarning),
      tools: withForcedOptionSource(this.buildCodexToolOptions(rootHelp, execHelp, enabledFeatures), capabilitySource, fallbackWarning),
      supportsModelSelection: this.modelFlag.length > 0 && (helpTextIncludes(rootHelp, '--model <model>') || helpTextIncludes(execHelp, '--model <model>') || orderedModels.length > 0),
      supportsWorkspace: this.cwdFlag.length > 0 && (helpTextIncludes(rootHelp, '--cd <dir>') || helpTextIncludes(execHelp, '--cd <dir>')),
      supportsSearch: helpTextIncludes(rootHelp, '--search'),
      supportsImages: helpTextIncludes(rootHelp, '--image <file>') || helpTextIncludes(execHelp, '--image <file>'),
      supportsApprovals: helpTextIncludes(rootHelp, '--ask-for-approval <approval_policy>') ||
        helpTextIncludes(execHelp, '--ask-for-approval <approval_policy>') ||
        enabledFeatures.has('guardian_approval'),
      supportsShell: enabledFeatures.has('shell_tool') || enabledFeatures.has('shell_snapshot') || helpTextIncludes(rootHelp, '--sandbox <sandbox_mode>'),
      supportsMcp: helpTextIncludes(rootHelp, 'mcp             manage external mcp servers') || helpTextIncludes(rootHelp, '\nmcp '),
      supportsPlugins: helpTextIncludes(rootHelp, 'plugin          manage codex plugins') || enabledFeatures.has('plugins'),
      supportsMultiAgent: enabledFeatures.has('multi_agent') || enabledFeatures.has('multi_agent_v2'),
      supportsBrowser: enabledFeatures.has('browser_use') || enabledFeatures.has('browser_use_external') || enabledFeatures.has('in_app_browser'),
      supportsComputerUse: enabledFeatures.has('computer_use'),
      supportsImageGeneration: enabledFeatures.has('image_generation')
    };
    this.codexDiscoveryCache = discovery;
    this.codexDiscoveryCacheExpiresAt = now + 15000;
    return discovery;
  }

  buildCodexReasoningModes(models) {
    const defaults = buildCodexReasoningModes();
    const seen = new Set();
    const modes = [];
    for (const model of models) {
      const levels = Array.isArray(model.reasoningLevels) ? model.reasoningLevels : [];
      for (const level of levels) {
        if (!level || typeof level.id !== 'string' || level.id.length === 0 || seen.has(level.id)) {
          continue;
        }
        seen.add(level.id);
        modes.push({
          id: level.id,
          displayName: typeof level.displayName === 'string' && level.displayName.length > 0 ? level.displayName : displayNameFromReasoningEffort(level.id),
          description: typeof level.description === 'string' && level.description.length > 0 ? level.description : descriptionFromReasoningEffort(level.id),
          isDefault: level.isDefault === true
        });
      }
    }
    if (modes.length === 0) {
      return defaults;
    }
    modes.unshift(defaults[0]);
    return modes;
  }

  appendRuntimeModeArgs(args, session) {
    const reasoningMode = typeof session.reasoningMode === 'string' ? session.reasoningMode : '';
    if (reasoningMode.length > 0 && reasoningMode !== 'auto') {
      args.push('-c');
      args.push('model_reasoning_effort="' + reasoningMode + '"');
    }
    const speedMode = typeof session.speedMode === 'string' ? session.speedMode : '';
    if (speedMode === 'fast') {
      args.push('-c');
      args.push('service_tier="priority"');
    }
    const permissionMode = this.selectedCodexPermissionMode(session);
    if (permissionMode === 'auto-review') {
      args.push('--ask-for-approval');
      args.push('on-request');
      args.push('--sandbox');
      args.push('workspace-write');
    } else if (permissionMode === 'full-access') {
      args.push('--ask-for-approval');
      args.push('never');
      args.push('--sandbox');
      args.push('danger-full-access');
    }
    return args;
  }

  buildInteractionModes() {
    const modes = [];
    modes.push({
      id: 'goal',
      displayName: 'Goal',
      description: 'Run the prompt as an implementation request.',
      isDefault: true,
      category: 'run'
    });
    modes.push({
      id: 'plan',
      displayName: 'Plan',
      description: 'Draft a plan first and wait for approval.',
      isDefault: false,
      category: 'run'
    });
    modes.push({
      id: 'codex-permissions-default',
      displayName: 'Default permissions',
      description: 'Use the approval and sandbox defaults from the local Codex configuration.',
      isDefault: true,
      category: 'approval'
    });
    modes.push({
      id: 'codex-permissions-auto-review',
      displayName: 'Auto-review',
      description: 'Run with workspace-write sandboxing and let Codex request approvals when needed.',
      isDefault: false,
      category: 'approval'
    });
    modes.push({
      id: 'codex-permissions-full-access',
      displayName: 'Full access',
      description: 'Run with danger-full-access sandboxing and no approval prompts.',
      isDefault: false,
      category: 'approval'
    });
    return modes;
  }

  selectedCodexPermissionMode(session) {
    const modes = Array.isArray(session.interactionModes) ? session.interactionModes : [];
    for (const mode of modes) {
      if (mode === 'codex-permissions-full-access' || mode === 'full-access') {
        return 'full-access';
      }
    }
    for (const mode of modes) {
      if (mode === 'codex-permissions-auto-review' || mode === 'auto-review') {
        return 'auto-review';
      }
    }
    return 'default';
  }

  buildCodexToolOptions(rootHelp, execHelp, enabledFeatures) {
    const tools = [
      {
        id: 'codex.exec',
        displayName: 'Codex Exec',
        description: 'Runs Codex non-interactively and streams JSONL output.',
        risk: 'write'
      },
      {
        id: 'codex.shell',
        displayName: 'Shell Command',
        description: 'Lets Codex execute shell commands inside the selected workspace.',
        risk: 'write'
      },
      {
        id: 'codex.apply_patch',
        displayName: 'Apply Patch',
        description: 'Lets Codex write file changes through its patch workflow.',
        risk: 'write'
      }
    ];
    if (helpTextIncludes(rootHelp, '--search')) {
      tools.push({
        id: 'codex.web_search',
        displayName: 'Web Search',
        description: 'Enables Codex live web search when the run is started with search support.',
        risk: 'read'
      });
    }
    if (helpTextIncludes(rootHelp, '--image <file>') || helpTextIncludes(execHelp, '--image <file>')) {
      tools.push({
        id: 'codex.image_input',
        displayName: 'Image Input',
        description: 'Accepts image attachments as part of the Codex prompt.',
        risk: 'read'
      });
    }
    if (enabledFeatures.has('multi_agent') || enabledFeatures.has('multi_agent_v2')) {
      tools.push({
        id: 'codex.multi_agent',
        displayName: 'Subagents',
        description: 'Allows Codex to delegate bounded work to subagents when enabled.',
        risk: 'write'
      });
    }
    if (enabledFeatures.has('browser_use') || enabledFeatures.has('browser_use_external') || enabledFeatures.has('in_app_browser')) {
      tools.push({
        id: 'codex.browser',
        displayName: 'Browser Control',
        description: 'Exposes Codex browser tooling when the local feature set enables it.',
        risk: 'provider'
      });
    }
    if (enabledFeatures.has('computer_use')) {
      tools.push({
        id: 'codex.computer_use',
        displayName: 'Computer Use',
        description: 'Exposes Codex computer-use tooling when the local feature set enables it.',
        risk: 'write'
      });
    }
    return tools;
  }
}

function createCodexProvider(config) {
  return new CodexCliProvider({
    id: 'codex',
    displayName: 'Codex CLI',
    description: 'Runs OpenAI Codex CLI through the official non-interactive `codex exec` command.',
    command: readStringValue(config, 'command', 'codex'),
    commandArgs: splitArgs(readStringValue(config, 'args', 'exec --json')),
    promptMode: 'dash',
    modelFlag: '-m',
    cwdFlag: '-C',
    jsonMode: 'jsonl',
    supportsGoalMode: true,
    supportsPlanMode: true,
    planArgs: readStringValue(config, 'planArgs', ''),
    goalArgs: readStringValue(config, 'goalArgs', ''),
    planPromptPrefix: readStringValue(
      config,
      'planPromptPrefix',
      'Plan mode: analyze the request and produce an implementation plan only. Do not edit files, run destructive commands, or perform the implementation yet. End with a concise plan that can be approved or rejected.'
    ),
    timeoutMs: readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS),
    models: [],
    tools: [
      {
        id: 'codex.exec',
        displayName: 'Codex Exec',
        description: 'Runs Codex non-interactively and streams JSONL output.',
        risk: 'write'
      }
    ]
  });
}

function createClaudeProvider(config) {
  return new CliProvider({
    id: 'claude',
    displayName: 'Claude Code',
    description: 'Runs Anthropic Claude Code through the official `claude -p` non-interactive mode.',
    command: readStringValue(config, 'command', 'claude'),
    commandArgs: normalizeClaudeCommandArgs(splitArgs(readStringValue(config, 'args', '-p --verbose --output-format stream-json --include-partial-messages'))),
    promptMode: 'arg',
    modelFlag: '--model',
    cwdFlag: '',
    jsonMode: 'jsonl',
    supportsGoalMode: true,
    supportsPlanMode: true,
    supportsPermissions: true,
    planArgs: readStringValue(config, 'planArgs', '--permission-mode plan'),
    goalArgs: readStringValue(config, 'goalArgs', ''),
    timeoutMs: readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS),
    models: [
      { id: 'sonnet', displayName: 'Sonnet' },
      { id: 'opus', displayName: 'Opus' },
      { id: 'fable', displayName: 'Fable' }
    ],
    tools: [
      {
        id: 'claude.print',
        displayName: 'Claude Print',
        description: 'Runs Claude Code print mode and streams JSON output.',
        risk: 'write'
      }
    ]
  });
}

function createAntigravityProvider(config) {
  return new CliProvider({
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    description: 'Runs an Antigravity-compatible CLI command when configured on PATH.',
    command: readStringValue(config, 'command', 'antigravity'),
    commandArgs: splitArgs(readStringValue(config, 'args', '')),
    promptMode: readStringValue(config, 'promptMode', 'arg'),
    modelFlag: readStringValue(config, 'modelFlag', ''),
    cwdFlag: readStringValue(config, 'cwdFlag', ''),
    jsonMode: readStringValue(config, 'jsonMode', 'none'),
    supportsGoalMode: true,
    supportsPlanMode: readStringValue(config, 'planArgs', '').length > 0,
    planArgs: readStringValue(config, 'planArgs', ''),
    goalArgs: readStringValue(config, 'goalArgs', ''),
    timeoutMs: readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS),
    models: [],
    tools: [
      {
        id: 'antigravity.cli',
        displayName: 'Antigravity CLI',
        description: 'Runs the configured Antigravity command.',
        risk: 'write'
      }
    ]
  });
}

function createOpenClawProvider(config) {
  return new CliProvider({
    id: 'openclaw',
    displayName: 'OpenClaw CLI',
    description: 'Runs OpenClaw CLI through the local `openclaw agent --message` command.',
    command: readStringValue(config, 'command', 'openclaw'),
    commandArgs: splitArgs(readStringValue(config, 'args', 'agent --message')),
    promptMode: 'arg',
    modelFlag: readStringValue(config, 'modelFlag', ''),
    cwdFlag: '',
    jsonMode: 'none',
    supportsGoalMode: true,
    supportsPlanMode: false,
    timeoutMs: readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS),
    models: [
      { id: 'configured', displayName: 'Configured Model' }
    ],
    tools: [
      {
        id: 'openclaw.cli',
        displayName: 'OpenClaw CLI',
        description: 'Runs OpenClaw in non-interactive agent mode.',
        risk: 'write'
      }
    ]
  });
}

function createHermesProvider(config) {
  return new CliProvider({
    id: 'hermes',
    displayName: 'Hermes CLI',
    description: 'Runs Nous Hermes Agent through `hermes chat --quiet -q`.',
    command: readStringValue(config, 'command', 'hermes'),
    commandArgs: splitArgs(readStringValue(config, 'args', 'chat --quiet -q')),
    promptMode: 'arg',
    modelFlag: '--model',
    cwdFlag: '',
    jsonMode: 'none',
    supportsGoalMode: true,
    supportsPlanMode: false,
    timeoutMs: readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS),
    models: [
      { id: 'configured', displayName: 'Configured Model' }
    ],
    tools: [
      {
        id: 'hermes.cli',
        displayName: 'Hermes CLI',
        description: 'Runs Hermes Agent in quiet chat mode.',
        risk: 'write'
      }
    ]
  });
}

module.exports = {
  CliProvider,
  createOpenClawProvider,
  createHermesProvider,
  createCodexProvider,
  createClaudeProvider,
  createAntigravityProvider
};
