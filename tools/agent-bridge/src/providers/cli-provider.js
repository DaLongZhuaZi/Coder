'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventType, makeEvent } = require('../protocol');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_HISTORY_SESSIONS = 500;
const MAX_HISTORY_LINE_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_READ_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_TAIL_BYTES = 16 * 1024 * 1024;

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

function shouldImportCodexHistoryMessage(role, phase, text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return false;
  }
  if (role === 'assistant') {
    if (phase === 'commentary') {
      return false;
    }
    return phase.length === 0 || phase === 'final_answer';
  }
  if (role === 'user') {
    if (phase.length > 0) {
      return false;
    }
    return !isCodexInternalWrapperText(text);
  }
  return false;
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
    if (isToolJsonValue(parsed)) {
      return '';
    }
    const fragments = [];
    collectTextFragments(parsed, fragments, 0);
    return fragments.join('\n').trim();
  } catch (error) {
    return '';
  }
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
  return false;
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
      result.push({
        id: firstStringValue(item, ['id', 'value', 'label']),
        label,
        description: firstStringValue(item, ['description', 'detail', 'hint'])
      });
    }
  }
  return result;
}

function makeRequestEvent(providerId, source) {
  const requestId = firstStringValue(source, ['requestId', 'request_id', 'id', 'callId', 'call_id']);
  const prompt = firstStringValue(source, ['question', 'prompt', 'message', 'text', 'content']);
  const title = firstStringValue(source, ['title', 'header', 'name']);
  const allowFreeText = source && typeof source === 'object' && source.allowFreeText === true;
  return {
    requestId: requestId.length > 0 ? requestId : providerId + '_request_' + crypto.createHash('sha1').update(safeJsonText(source)).digest('hex').substring(0, 12),
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
    contextWindow: 0
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
      isDefault: false,
      contextWindow: readNumberValue(item, 'contextWindow', 0)
    });
  }
  return models;
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
    this.promptMode = readStringValue(config, 'promptMode', 'stdin');
    this.modelFlag = readStringValue(config, 'modelFlag', '--model');
    this.cwdFlag = readStringValue(config, 'cwdFlag', '');
    this.jsonMode = readStringValue(config, 'jsonMode', 'none');
    this.planArgs = splitArgs(readStringValue(config, 'planArgs', ''));
    this.goalArgs = splitArgs(readStringValue(config, 'goalArgs', ''));
    this.planPromptPrefix = readStringValue(config, 'planPromptPrefix', '');
    this.goalPromptPrefix = readStringValue(config, 'goalPromptPrefix', '');
    this.supportsPlanMode = config && config.supportsPlanMode === true;
    this.supportsGoalMode = config && config.supportsGoalMode === true;
    this.timeoutMs = readNumberValue(config, 'timeoutMs', DEFAULT_TIMEOUT_MS);
    this.models = buildConfiguredModels(this.id, Array.isArray(config && config.models) ? config.models : []);
    this.tools = Array.isArray(config && config.tools) ? config.tools : [];
    this.sessions = new Map();
    this.messages = new Map();
    this.sessionHistoryFiles = new Map();
    this.pendingPlans = new Map();
  }

  buildSessionFeatures() {
    return {
      list: true,
      import: true,
      resume: false,
      messages: true,
      update: false,
      delete: false,
      abort: false,
      fork: false,
      share: false,
      revert: false,
      todo: false,
      diff: false,
      command: true,
      shell: true
    };
  }

  async describe() {
    const available = await commandExists(this.command);
    return {
      id: this.id,
      displayName: this.displayName,
      status: available ? 'available' : 'unavailable',
      description: this.description,
      endpoint: this.command,
      capabilities: {
        streaming: this.jsonMode !== 'none',
        tools: this.tools.length > 0,
        previews: false,
        permissions: false,
        history: true,
        modelSelection: this.modelFlag.length > 0,
        speedProfiles: false,
        workspaceAware: this.cwdFlag.length > 0,
        nativeProxy: false,
        events: false,
        requests: true,
        plans: this.supportsPlanMode,
        health: available ? this.command + ' is available' : this.command + ' is not on PATH'
      },
      models: this.models,
      speedModes: buildDefaultSpeedModes(),
      reasoningModes: buildDefaultReasoningModes(),
      tools: this.tools,
      sessionFeatures: this.buildSessionFeatures(),
      interactionModes: this.buildInteractionModes()
    };
  }

  buildInteractionModes() {
    const modes = [];
    if (this.supportsGoalMode) {
      modes.push({
        id: 'goal',
        displayName: 'Goal',
        description: 'Run the prompt as an implementation request.'
      });
    }
    if (this.supportsPlanMode) {
      modes.push({
        id: 'plan',
        displayName: 'Plan',
        description: 'Draft a plan first and wait for approval.'
      });
    }
    return modes;
  }

  createSession(payload) {
    const sessionId = createSessionId(this.id);
    const requestedWorkspacePath = readStringValue(payload, 'workspacePath', '');
    const workspacePath = requestedWorkspacePath.length > 0 ? requestedWorkspacePath : process.cwd();
    const requestedWorkspaceTitle = readStringValue(payload, 'workspaceTitle', '');
    const workspaceTitle = requestedWorkspaceTitle.length > 0 ? requestedWorkspaceTitle : path.basename(workspacePath);
    const modelId = readStringValue(payload, 'modelId', 'configured');
    const speedMode = readStringValue(payload, 'speedMode', 'auto');
    const reasoningMode = readStringValue(payload, 'reasoningMode', 'auto');
    const now = Date.now();
    const session = {
      sessionId,
      remoteSessionId: sessionId,
      providerId: this.id,
      title: workspaceTitle.length > 0 ? workspaceTitle : (workspacePath.length > 0 ? this.displayName + ': ' + workspacePath : this.displayName + ' Session'),
      workspacePath,
      workspaceTitle,
      branchName: 'main',
      modelId,
      speedMode,
      reasoningMode,
      interactionMode: 'goal',
      messageCount: 0,
      status: 'ready',
      source: this.id,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(sessionId, session);
    this.messages.set(sessionId, []);
    return session;
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
      return this.sessions.get(sessionId) || null;
    }
    return null;
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
      const session = {
        sessionId: this.id + ':' + id,
        remoteSessionId: id,
        providerId: this.id,
        title: title.length > 0 ? title : this.displayName + ' Session',
        workspacePath: '',
        workspaceTitle: '',
        branchName: 'main',
        modelId: modelId.length > 0 ? modelId : 'configured',
        speedMode: 'auto',
        reasoningMode: 'auto',
        interactionMode: 'goal',
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
      const records = readSampledJsonLines(filePath, 64, 24);
      const metaEntries = [];
      let workspacePath = '';
      let primaryRemoteSessionId = codexSessionIdFromRolloutPath(filePath);
      let createdAt = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
      let updatedAt = stat.mtimeMs;
      let messageCount = 0;
      let discoveredModelId = '';
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
        const hasSpecificTitle = existingTitle.length > 0 && existingTitle !== this.displayName + ' Session';
        const title = hasSpecificTitle ? existingTitle :
          (workspaceTitle.length > 0 ? workspaceTitle : this.displayName + ' Session');
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
          interactionMode: existing && existing.interactionMode.length > 0 ? existing.interactionMode : 'goal',
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
        interactionMode: 'goal',
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
        interactionMode: existing && existing.interactionMode.length > 0 ? existing.interactionMode : 'goal',
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
        messages.push(message);
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
      const text = textFromContentParts(content);
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
    const sessions = Array.from(merged.values());
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

    const output = await this.runCli(session, text, interactionMode, emit);
    const assistantText = output.trim();
    if (interactionMode === 'plan' && assistantText.length > 0) {
      const planId = this.id + '_plan_' + crypto.createHash('sha1').update(sessionId + ':' + text + ':' + assistantText).digest('hex').substring(0, 16);
      this.pendingPlans.set(planId, {
        sessionId,
        providerId: this.id,
        originalPrompt: text,
        planContent: assistantText,
        modelId: session.modelId,
        speedMode: session.speedMode,
        reasoningMode: session.reasoningMode
      });
      emit(makeEvent(EventType.PLAN_REQUESTED, sessionId, {
        providerId: this.id,
        planId,
        title: this.displayName + ' Plan',
        content: assistantText,
        status: 'pending',
        originalPrompt: text
      }));
    } else if (assistantText.length > 0) {
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
    }
    this.messages.set(sessionId, history);
    session.status = 'ready';
    session.updatedAt = Date.now();
    emit(makeEvent(EventType.TOOL_COMPLETED, sessionId, {
      toolCallId: this.id + '_cli',
      status: 'completed'
    }));
    emit(makeEvent(EventType.SESSION_UPDATED, sessionId, { session }));
  }

  normalizeInteractionMode(value) {
    const mode = typeof value === 'string' ? value.toLowerCase() : '';
    if (mode === 'plan' && this.supportsPlanMode) {
      return 'plan';
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
    return this.normalizeInteractionMode(readStringValue(payload, 'interactionMode', readStringValue(payload, 'runMode', 'goal')));
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

  buildArgs(session, promptText, interactionMode) {
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
    this.appendRuntimeModeArgs(args, session);
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

  appendRuntimeModeArgs(args, session) {
    return args;
  }

  runCli(session, promptText, interactionMode, emit) {
    return new Promise((resolve, reject) => {
      const effectivePrompt = this.buildPromptText(promptText, interactionMode);
      const args = this.buildArgs(session, effectivePrompt, interactionMode);
      const child = spawn(this.command, args, {
        cwd: session.workspacePath.length > 0 ? session.workspacePath : process.cwd(),
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let jsonBuffer = '';
      let lastEmittedText = '';
      const emittedToolEvents = new Set();
      const emittedRequestEvents = new Set();
      const emittedPlanEvents = new Set();
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(this.displayName + ' timed out after ' + String(this.timeoutMs) + 'ms'));
      }, this.timeoutMs);

      const emitText = (text, contentKind) => {
        if (text.length === 0) {
          return;
        }
        emit(makeEvent(EventType.MESSAGE_DELTA, session.sessionId, {
          role: 'assistant',
          text,
          contentKind
        }));
      };

      const handleJsonLine = (line) => {
        const toolEvents = parseToolEventsFromJsonLine(this.id, line);
        for (const toolEvent of toolEvents) {
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
              if (outputText.length > 0) {
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
        const requestEvents = parseRequestEventsFromJsonLine(this.id, line);
        for (const requestEvent of requestEvents) {
          const eventKey = requestEvent.requestId + ':' + crypto.createHash('sha1').update(requestEvent.rawJson).digest('hex');
          if (!emittedRequestEvents.has(eventKey)) {
            emittedRequestEvents.add(eventKey);
            emit(makeEvent(EventType.QUESTION_REQUESTED, session.sessionId, {
              providerId: this.id,
              requestId: requestEvent.requestId,
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
              reasoningMode: session.reasoningMode
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
        const extracted = textFromJsonLine(line);
        if (extracted.length === 0 || extracted === lastEmittedText) {
          return;
        }
        lastEmittedText = extracted;
        emitText(extracted, 'text');
      };

      child.stdout.on('data', (chunk) => {
        const text = Buffer.from(chunk).toString('utf8');
        stdout = stdout + text;
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
        emit(makeEvent(EventType.TOOL_OUTPUT, session.sessionId, {
          toolCallId: this.id + '_cli',
          name: this.id + '.cli',
          text
        }));
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (this.jsonMode === 'jsonl' && jsonBuffer.trim().length > 0) {
          handleJsonLine(jsonBuffer.trim());
        }
        if (code !== 0) {
          reject(new Error(this.displayName + ' exited with code ' + String(code) + (stderr.length > 0 ? ': ' + stderr.trim() : '')));
          return;
        }
        if (this.jsonMode === 'jsonl') {
          const lines = stdout.split(/\r?\n/);
          const fragments = [];
          for (const line of lines) {
            const text = textFromJsonLine(line);
            if (text.length > 0) {
              fragments.push(text);
            }
          }
          resolve(fragments.length > 0 ? fragments.join('\n') : stdout);
          return;
        }
        resolve(stdout);
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
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
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
    emit(makeEvent(EventType.QUESTION_REQUESTED, sessionId, {
      providerId: this.id,
      requestId,
      status: 'answered',
      answer,
      optionId
    }));
    await this.sendMessage({
      sessionId,
      text: responseText,
      modelId: session.modelId,
      speedMode: session.speedMode,
      reasoningMode: session.reasoningMode,
      interactionMode: 'goal'
    }, emit);
    return { status: 'answered', requestId };
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
      interactionMode: 'goal'
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
      capabilities: {
        streaming: this.jsonMode !== 'none',
        tools: true,
        previews: false,
        permissions: false,
        history: true,
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
      speedModes: buildCodexSpeedModes(),
      reasoningModes: discovery.reasoningModes.length > 0 ? discovery.reasoningModes : buildCodexReasoningModes(),
      tools: discovery.tools,
      sessionFeatures: this.buildSessionFeatures(),
      interactionModes: this.buildInteractionModes()
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
        modelSource = 'debug models';
      }
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
    const models = buildConfiguredModels(this.id, orderedModels, configuredDisplayName);
    const enabledFeatures = parseCodexFeatureFlags(featureText);
    const discovery = {
      version,
      modelSource,
      models,
      reasoningModes: this.buildCodexReasoningModes(orderedModels),
      tools: this.buildCodexToolOptions(rootHelp, execHelp, enabledFeatures),
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
    return args;
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
    commandArgs: splitArgs(readStringValue(config, 'args', '-p --output-format stream-json --include-partial-messages')),
    promptMode: 'arg',
    modelFlag: '--model',
    cwdFlag: '',
    jsonMode: 'jsonl',
    supportsGoalMode: true,
    supportsPlanMode: true,
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

module.exports = {
  CliProvider,
  createCodexProvider,
  createClaudeProvider,
  createAntigravityProvider
};
