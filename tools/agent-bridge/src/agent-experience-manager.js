'use strict';

const crypto = require('crypto');

function text(source, key, fallback) { return source && typeof source[key] === 'string' ? source[key] : fallback; }
function number(source, key, fallback) { return source && typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback; }
function bool(source, key, fallback) { return source && typeof source[key] === 'boolean' ? source[key] : fallback; }
function id(prefix) { return prefix + '_' + crypto.randomBytes(12).toString('base64url'); }

const RICH_CONTENT_NODE_LIMIT = 100;
const RICH_CONTENT_TEXT_BYTES = 64 * 1024;
const RICH_CONTENT_CODE_BYTES = 128 * 1024;
const RICH_CONTENT_FIELD_BYTES = 4 * 1024;
const RICH_CONTENT_LINE_LIMIT = 2000;
const RICH_CONTENT_DIFF_LINE_LIMIT = 4000;
const RICH_CONTENT_TOKEN_LIMIT = 4096;
const RICH_CONTENT_KINDS = new Set(['text', 'code', 'link', 'file', 'tool', 'todo', 'diff', 'warning', 'fallback']);
const TOOL_CARD_MATCHERS = Object.freeze([
  Object.freeze({ type: 'github', names: Object.freeze(['github', 'gh.']) }),
  Object.freeze({ type: 'checkpoint', names: Object.freeze(['checkpoint', 'agent.checkpoint']) }),
  Object.freeze({ type: 'terminal', names: Object.freeze(['terminal', 'pty.']) }),
  Object.freeze({ type: 'permission', names: Object.freeze(['permission', 'approval', 'request.permission']) }),
  Object.freeze({ type: 'plan', names: Object.freeze(['plan', 'todo.write', 'update_plan']) }),
  Object.freeze({ type: 'git', names: Object.freeze(['git', 'workspace.git']) }),
  Object.freeze({ type: 'file', names: Object.freeze(['file', 'workspace.file', 'read_file', 'write_file', 'apply_patch']) }),
  Object.freeze({ type: 'shell', names: Object.freeze(['shell', 'exec', 'command', 'bash', 'powershell', 'cmd.']) })
]);

function truncateUtf8(value, maxBytes) {
  const input = String(value || '');
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input;
  let low = 0; let high = input.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(input.substring(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  let end = low;
  if (end > 0 && end < input.length) {
    const code = input.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
  }
  return input.substring(0, end);
}

function truncateText(value, maxBytes, maxLines) {
  const input = String(value || ''); const lines = input.split(/\r?\n/); let output = lines.slice(0, maxLines).join('\n'); let reason = lines.length > maxLines ? 'line_limit' : '';
  if (Buffer.byteLength(output, 'utf8') > maxBytes) { output = truncateUtf8(output, maxBytes); reason = 'byte_limit'; }
  return { text: output, truncated: reason.length > 0, truncationReason: reason, lineCount: lines.length };
}

function codeLanguage(value) {
  const language = truncateUtf8(String(value || '').trim().toLowerCase(), 64);
  if (language === 'ts') return { display: language, tokenizer: 'typescript' };
  if (language === 'js' || language === 'jsx') return { display: language, tokenizer: 'javascript' };
  if (language === 'ets') return { display: language, tokenizer: 'arkts' };
  if (language === 'sh' || language === 'bash' || language === 'zsh' || language === 'powershell' || language === 'ps1') return { display: language, tokenizer: 'shell' };
  if (language === 'json' || language === 'json5') return { display: language, tokenizer: 'json' };
  if (language === 'diff' || language === 'patch') return { display: language, tokenizer: 'diff' };
  if (language === 'typescript' || language === 'javascript' || language === 'arkts' || language === 'shell') return { display: language, tokenizer: language };
  return { display: language, tokenizer: '' };
}

function tokenKind(value, language) {
  if (/^\s+$/.test(value)) return 'whitespace';
  if (language === 'diff') {
    if (value.startsWith('+++') || value.startsWith('---') || value.startsWith('@@')) return 'header';
    if (value.startsWith('+')) return 'addition';
    if (value.startsWith('-')) return 'deletion';
    return 'context';
  }
  if (/^(?:\/\/|\/\*|\*|#)/.test(value)) return 'comment';
  if (/^(?:"|'|`)/.test(value)) return 'string';
  if (/^(?:true|false|null|undefined|const|let|var|function|class|interface|type|import|export|return|if|else|for|while|async|await|throw|try|catch|finally|switch|case|break|continue|new|extends|implements|readonly|private|public|protected|static|in|of|do|then|fi|done|function)$/.test(value)) return 'keyword';
  if (/^-?(?:\d+(?:\.\d+)?|0x[0-9a-f]+)$/i.test(value)) return 'number';
  if (/^[{}()[\],.:;]+$/.test(value)) return 'punctuation';
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return 'variable';
  return 'plain';
}

function tokenizeCode(value, language) {
  if (!language) return { tokenized: false, tokens: [], truncated: false };
  try {
    const input = String(value || '');
    if (language === 'diff') {
      const allLines = input.split(/(?<=\n)/);
      const lines = allLines.slice(0, RICH_CONTENT_TOKEN_LIMIT);
      return { tokenized: true, tokens: lines.map((line) => ({ kind: tokenKind(line, language), text: line })), truncated: allLines.length > lines.length };
    }
    const pattern = language === 'json'
      ? /(?:"(?:\\.|[^"\\])*"|-?(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|0x[0-9a-f]+)|true|false|null|[{}[\],:]|\s+|[^\s{}[\],:]+)/gi
      : /(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\$[A-Za-z_][A-Za-z0-9_]*|-?(?:\d+(?:\.\d+)?|0x[0-9a-f]+)|[A-Za-z_$][A-Za-z0-9_$]*|[{}()[\],.:;]|\s+|.)/g;
    const tokens = []; let match;
    while ((match = pattern.exec(input)) && tokens.length < RICH_CONTENT_TOKEN_LIMIT) {
      tokens.push({ kind: tokenKind(match[0], language), text: match[0] });
    }
    return { tokenized: true, tokens, truncated: tokens.length >= RICH_CONTENT_TOKEN_LIMIT && pattern.lastIndex < input.length };
  } catch (_error) {
    return { tokenized: false, tokens: [], truncated: false };
  }
}

function safeRelativePath(value) {
  const candidate = String(value || '').trim().replace(/\\/g, '/');
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:\//.test(candidate)) return '';
  const segments = candidate.split('/');
  if (segments.includes('..') || segments.includes('')) return '';
  return candidate;
}

function safeLink(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.username || url.password) return '';
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function toolCardType(value) {
  const name = String(value || '').toLowerCase();
  for (const matcher of TOOL_CARD_MATCHERS) {
    for (const candidate of matcher.names) {
      if (name === candidate || name.startsWith(candidate + '.') || name.startsWith(candidate + '_') || name.startsWith(candidate)) return matcher.type;
    }
  }
  return 'fallback';
}

function stableNodeId(node, index) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(node)).digest('hex').slice(0, 16);
  return 'content_' + String(index) + '_' + digest;
}

function fallbackNode(source, reason) {
  const rawText = source && typeof source === 'object'
    ? text(source, 'text', text(source, 'content', ''))
    : String(source || '');
  const limited = truncateText(rawText, RICH_CONTENT_TEXT_BYTES, RICH_CONTENT_LINE_LIMIT);
  return {
    kind: 'fallback', text: limited.text, source: truncateUtf8(reason || 'unknown_node', 128),
    truncated: limited.truncated, truncationReason: limited.truncationReason, lineCount: limited.lineCount
  };
}

function normalizeRichContentNode(source, options) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fallbackNode(source, 'invalid_node');
  const kind = text(source, 'kind', '').toLowerCase();
  if (!RICH_CONTENT_KINDS.has(kind)) return fallbackNode(source, 'unknown_node_kind');
  const workspaceId = text(source, 'workspaceId', '');
  if (kind === 'file') {
    const relativePath = safeRelativePath(text(source, 'path', text(source, 'relativePath', '')));
    const expectedWorkspaceId = options && typeof options.workspaceId === 'string' ? options.workspaceId : '';
    const effectiveWorkspaceId = workspaceId || expectedWorkspaceId;
    if (!relativePath || !effectiveWorkspaceId || (expectedWorkspaceId && workspaceId && workspaceId !== expectedWorkspaceId)) return fallbackNode(source, 'unsafe_file_reference');
    return {
      kind, workspaceId: effectiveWorkspaceId, path: relativePath,
      displayName: truncateUtf8(text(source, 'displayName', text(source, 'title', relativePath)), RICH_CONTENT_FIELD_BYTES),
      line: Math.max(0, Math.floor(number(source, 'line', 0))), source: truncateUtf8(text(source, 'source', 'provider'), 128)
    };
  }
  if (kind === 'link') {
    const url = safeLink(text(source, 'url', text(source, 'href', '')));
    if (!url) return fallbackNode(source, 'unsafe_link');
    return { kind, url, text: truncateUtf8(text(source, 'text', text(source, 'title', url)), RICH_CONTENT_FIELD_BYTES), source: truncateUtf8(text(source, 'source', 'provider'), 128) };
  }
  if (kind === 'code' || kind === 'diff') {
    const lineLimit = kind === 'diff' ? RICH_CONTENT_DIFF_LINE_LIMIT : RICH_CONTENT_LINE_LIMIT;
    const limited = truncateText(text(source, 'text', text(source, 'content', '')), RICH_CONTENT_CODE_BYTES, lineLimit);
    const language = codeLanguage(kind === 'diff' ? 'diff' : text(source, 'language', ''));
    const tokenResult = tokenizeCode(limited.text, language.tokenizer);
    return {
      kind, language: language.display, text: limited.text, lineCount: limited.lineCount,
      truncated: limited.truncated || tokenResult.truncated || bool(source, 'truncated', false),
      truncationReason: limited.truncationReason || (tokenResult.truncated ? 'token_limit' : text(source, 'truncationReason', '')),
      tokenized: tokenResult.tokenized, tokens: tokenResult.tokens,
      source: truncateUtf8(text(source, 'source', 'provider'), 128)
    };
  }
  const byteLimit = kind === 'tool' ? RICH_CONTENT_CODE_BYTES : RICH_CONTENT_TEXT_BYTES;
  const limited = truncateText(text(source, 'text', text(source, 'content', '')), byteLimit, RICH_CONTENT_LINE_LIMIT);
  const result = {
    kind, text: limited.text, lineCount: limited.lineCount,
    truncated: limited.truncated || bool(source, 'truncated', false),
    truncationReason: limited.truncationReason || text(source, 'truncationReason', ''),
    source: truncateUtf8(text(source, 'source', 'provider'), 128)
  };
  if (kind === 'tool') {
    result.toolName = truncateUtf8(text(source, 'toolName', text(source, 'name', '')), RICH_CONTENT_FIELD_BYTES);
    result.toolType = toolCardType(result.toolName);
    result.status = truncateUtf8(text(source, 'status', ''), 128);
  } else if (kind === 'todo') {
    result.todoId = truncateUtf8(text(source, 'todoId', text(source, 'id', '')), 256);
    const status = text(source, 'status', 'pending').toLowerCase();
    result.status = ['pending', 'in_progress', 'completed', 'cancelled'].includes(status) ? status : 'pending';
  }
  return result;
}

function normalizeRichContentNodes(sourceNodes, fallbackText, options) {
  const input = Array.isArray(sourceNodes) ? sourceNodes : [];
  const opts = options || {};
  let source = input.length > 0 ? input : parseRichContentText(fallbackText);
  if (input.length > 0 && opts.requireFullTextCoverage === true && String(fallbackText || '').length > 0) {
    const hasStructuredNode = input.some((item) => item && typeof item === 'object' && ['link', 'file', 'tool', 'todo', 'warning'].includes(text(item, 'kind', '').toLowerCase()));
    const providerText = input.map((item) => item && typeof item === 'object' ? text(item, 'text', text(item, 'content', '')) : '').join('');
    const normalizedProviderText = providerText.replace(/\r\n/g, '\n').trim();
    const normalizedFallbackText = String(fallbackText || '').replace(/\r\n/g, '\n').trim();
    if (!hasStructuredNode && normalizedProviderText !== normalizedFallbackText) source = parseRichContentText(fallbackText);
  }
  const nodes = [];
  const count = Math.min(source.length, RICH_CONTENT_NODE_LIMIT);
  for (let index = 0; index < count; index += 1) {
    const node = normalizeRichContentNode(source[index], opts);
    node.id = truncateUtf8(text(source[index], 'id', ''), 256) || stableNodeId(node, index);
    nodes.push(node);
  }
  if (source.length > RICH_CONTENT_NODE_LIMIT && nodes.length > 0) {
    const lastIndex = nodes.length - 1;
    nodes[lastIndex] = Object.assign({}, nodes[lastIndex], { truncated: true, truncationReason: 'node_limit' });
  }
  if (nodes.length === 0) {
    const node = fallbackNode({ text: String(fallbackText || '') }, 'empty_content');
    node.id = stableNodeId(node, 0);
    nodes.push(node);
  }
  return nodes;
}

function parseRichContentText(source) {
  const input = String(source || ''); const nodes = []; const pattern = /```([^\n`]*)\n([\s\S]*?)```/g; let cursor = 0; let match;
  while ((match = pattern.exec(input)) && nodes.length < RICH_CONTENT_NODE_LIMIT) {
    if (match.index > cursor) nodes.push({ kind: 'text', text: input.substring(cursor, match.index), source: 'bridge' });
    nodes.push({ kind: codeLanguage(match[1]).tokenizer === 'diff' ? 'diff' : 'code', language: String(match[1] || '').trim(), text: match[2], source: 'bridge' });
    cursor = pattern.lastIndex;
  }
  if (cursor < input.length && nodes.length < RICH_CONTENT_NODE_LIMIT) nodes.push({ kind: 'text', text: input.substring(cursor), source: 'bridge' });
  if (nodes.length === 0) nodes.push({ kind: 'text', text: input });
  return nodes;
}

function richContentNodes(source, options) {
  return normalizeRichContentNodes([], source, options || {});
}

function sanitizeComposerTokens(payload) {
  const raw = text(payload, 'composerTokensJson', '');
  if (!raw) return { ok: true, tokens: [] };
  let input;
  try { input = JSON.parse(raw); } catch { return { ok: false, failureCategory: 'invalid_composer_tokens', message: 'Composer tokens must be valid JSON.' }; }
  if (!Array.isArray(input) || input.length > 100) return { ok: false, failureCategory: 'invalid_composer_tokens', message: 'Composer token list is invalid or too large.' };
  const hostProfileId = text(payload, 'hostProfileId', ''); const workspaceId = text(payload, 'workspaceId', ''); const tokens = [];
  for (const source of input) {
    if (!source || typeof source !== 'object') return { ok: false, failureCategory: 'invalid_composer_token', message: 'Composer token must be an object.' };
    const kind = text(source, 'kind', ''); const allowed = ['text', 'slash', 'workspace', 'file', 'agent', 'attachment'];
    if (!allowed.includes(kind)) return { ok: false, failureCategory: 'invalid_composer_token_kind', message: 'Composer token kind is not supported.' };
    const tokenHost = text(source, 'hostProfileId', ''); const tokenWorkspace = text(source, 'workspaceId', ''); const value = text(source, 'value', '');
    if (tokenHost && hostProfileId && tokenHost !== hostProfileId) return { ok: false, failureCategory: 'composer_scope_mismatch', message: 'Composer token belongs to another host.' };
    if ((kind === 'file' || kind === 'agent') && tokenWorkspace && workspaceId && tokenWorkspace !== workspaceId) return { ok: false, failureCategory: 'composer_scope_mismatch', message: 'Composer token belongs to another workspace.' };
    if (kind === 'file' && (value.startsWith('/') || value.startsWith('\\') || value.split(/[\\/]+/).includes('..'))) return { ok: false, failureCategory: 'unsafe_composer_path', message: 'Composer file token must use a safe relative path.' };
    tokens.push({ id: text(source, 'id', ''), kind, label: text(source, 'label', ''), value, hostProfileId: tokenHost, workspaceId: tokenWorkspace });
  }
  return { ok: true, tokens };
}

const MESSAGE_QUEUE_ATTEMPT_LIMIT = 20;
const MESSAGE_QUEUE_ATTEMPT_STATUSES = new Set(['queued', 'sending', 'accepted', 'failed', 'cancelled']);

function normalizeQueueAttempt(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const attemptId = text(source, 'attemptId', text(source, 'id', ''));
  if (!attemptId) return null;
  const rawStatus = text(source, 'status', 'queued');
  const status = MESSAGE_QUEUE_ATTEMPT_STATUSES.has(rawStatus) ? rawStatus : 'queued';
  return {
    attemptId: truncateUtf8(attemptId, 128),
    attemptNumber: Math.max(1, Math.floor(number(source, 'attemptNumber', 1))),
    status,
    retryOfAttemptId: truncateUtf8(text(source, 'retryOfAttemptId', ''), 128),
    failureCategory: truncateUtf8(text(source, 'failureCategory', ''), 128),
    message: truncateUtf8(text(source, 'message', ''), 1024),
    startedAt: text(source, 'startedAt', ''),
    completedAt: text(source, 'completedAt', '')
  };
}

function normalizeMessageQueueState(source) {
  const rawState = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const rawItems = Array.isArray(rawState.items) ? rawState.items : [];
  let changed = rawState.version !== 2 || !Array.isArray(rawState.items);
  const items = [];
  for (const sourceItem of rawItems) {
    if (!sourceItem || typeof sourceItem !== 'object' || Array.isArray(sourceItem)) {
      changed = true;
      continue;
    }
    const item = Object.assign({}, sourceItem);
    if (!text(item, 'id', '')) {
      item.id = id('queue');
      changed = true;
    }
    if (!text(item, 'clientMessageId', '')) {
      item.clientMessageId = id('msg');
      changed = true;
    }
    const attempts = Math.max(0, Math.floor(number(item, 'attempts', 0)));
    if (item.attempts !== attempts) changed = true;
    item.attempts = attempts;
    const historySource = Array.isArray(item.attemptHistory) ? item.attemptHistory : [];
    const history = [];
    for (const sourceAttempt of historySource) {
      const attempt = normalizeQueueAttempt(sourceAttempt);
      if (attempt) {
        if (JSON.stringify(attempt) !== JSON.stringify(sourceAttempt)) changed = true;
        history.push(attempt);
      } else changed = true;
    }
    if (history.length > MESSAGE_QUEUE_ATTEMPT_LIMIT) {
      history.splice(0, history.length - MESSAGE_QUEUE_ATTEMPT_LIMIT);
      changed = true;
    }
    const lastAttempt = history.length > 0 ? history[history.length - 1] : null;
    const requestedAttemptId = text(item, 'attemptId', '');
    const matchingAttempt = requestedAttemptId.length > 0
      ? history.find((attempt) => attempt.attemptId === requestedAttemptId)
      : null;
    const attemptId = matchingAttempt ? requestedAttemptId : (lastAttempt ? lastAttempt.attemptId : '');
    if (item.attemptId !== attemptId) changed = true;
    item.attemptId = attemptId;
    if (lastAttempt && item.attempts < lastAttempt.attemptNumber) {
      item.attempts = lastAttempt.attemptNumber;
      changed = true;
    }
    if (!Array.isArray(item.attemptHistory)) changed = true;
    item.attemptHistory = history;
    items.push(item);
  }
  return { changed, state: { version: 2, items } };
}

function currentQueueAttempt(item) {
  if (!item || !Array.isArray(item.attemptHistory)) return null;
  const attemptId = text(item, 'attemptId', '');
  if (attemptId) {
    const match = item.attemptHistory.find((attempt) => attempt && attempt.attemptId === attemptId);
    if (match) return match;
  }
  return item.attemptHistory.length > 0 ? item.attemptHistory[item.attemptHistory.length - 1] : null;
}

function publicQueueAttempt(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  return {
    attemptId: truncateUtf8(text(attempt, 'attemptId', ''), 128),
    attemptNumber: Math.max(1, Math.floor(number(attempt, 'attemptNumber', 1))),
    status: text(attempt, 'status', 'queued'),
    retryOfAttemptId: truncateUtf8(text(attempt, 'retryOfAttemptId', ''), 128),
    failureCategory: truncateUtf8(text(attempt, 'failureCategory', ''), 128),
    message: truncateUtf8(text(attempt, 'message', ''), 1024),
    startedAt: text(attempt, 'startedAt', ''),
    completedAt: text(attempt, 'completedAt', '')
  };
}

function publicQueueItem(item) {
  if (!item || typeof item !== 'object') return item;
  const result = Object.assign({}, item);
  result.attemptId = text(item, 'attemptId', '');
  result.attemptHistory = Array.isArray(item.attemptHistory)
    ? item.attemptHistory.slice(-MESSAGE_QUEUE_ATTEMPT_LIMIT).map((attempt) => publicQueueAttempt(attempt)).filter((attempt) => attempt !== null)
    : [];
  if (item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)) {
    const payload = Object.assign({}, item.payload);
    if (Array.isArray(payload.contextItems)) {
      payload.contextItems = payload.contextItems.filter((contextItem) => !contextItem || typeof contextItem !== 'object' || contextItem.kind !== 'chat-history');
      if (payload.contextItems.length === 0) delete payload.contextItems;
    }
    delete payload.token;
    delete payload.credential;
    result.payload = payload;
  }
  return result;
}

class MessageQueueManager {
  constructor(store) { this.store = store; this.runningSessions = new Set(); }
  state() {
    const normalized = normalizeMessageQueueState(this.store.readMessageQueueState());
    if (normalized.changed) this.save(normalized.state);
    return normalized.state;
  }
  save(state) { this.store.writeMessageQueueState(state); }
  list(payload) { const state = this.state(); const hostProfileId = text(payload, 'hostProfileId', ''); const sessionId = text(payload, 'sessionId', ''); return { ok: true, action: 'message.queue.list', hostProfileId, sessionId, items: state.items.filter((item) => usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && (!sessionId || item.sessionId === sessionId)).map((item) => publicQueueItem(item)) }; }
  enqueue(payload) {
    const state = this.state(); const clientMessageId = text(payload, 'clientMessageId', '') || id('msg');
    const hostProfileId = text(payload, 'hostProfileId', ''); const sessionId = text(payload, 'sessionId', '');
    const existing = state.items.find((item) => item.clientMessageId === clientMessageId && usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && item.sessionId === sessionId);
    if (existing) return { ok: true, action: 'message.queue.enqueue', duplicate: true, item: publicQueueItem(existing) };
    const item = { id: id('queue'), clientMessageId, hostProfileId, sessionId, agentId: text(payload, 'agentId', ''), status: 'queued', attempts: 0, attemptId: '', attemptHistory: [], payload: Object.assign({}, payload, { clientMessageId, token: undefined, credential: undefined }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), failureCategory: '', message: '' };
    state.items.push(item); if (state.items.length > 2000) state.items = state.items.slice(-2000); this.save(state); return { ok: true, action: 'message.queue.enqueue', duplicate: false, item: publicQueueItem(item) };
  }
  createAttempt(target, status, retryOfAttemptId, requestedAttemptNumber) {
    const previous = currentQueueAttempt(target);
    const previousNumber = previous ? previous.attemptNumber : 0;
    const requested = Number.isSafeInteger(requestedAttemptNumber) && requestedAttemptNumber > 0 ? requestedAttemptNumber : 0;
    const attemptNumber = requested > 0 ? Math.max(requested, target.attempts, previousNumber) : Math.max(target.attempts, previousNumber) + 1;
    const attempt = {
      attemptId: id('attempt'),
      attemptNumber,
      status,
      retryOfAttemptId: retryOfAttemptId || '',
      failureCategory: '',
      message: '',
      startedAt: status === 'sending' ? new Date().toISOString() : '',
      completedAt: ''
    };
    target.attempts = attemptNumber;
    target.attemptId = attempt.attemptId;
    if (!Array.isArray(target.attemptHistory)) target.attemptHistory = [];
    target.attemptHistory.push(attempt);
    if (target.attemptHistory.length > MESSAGE_QUEUE_ATTEMPT_LIMIT) target.attemptHistory = target.attemptHistory.slice(-MESSAGE_QUEUE_ATTEMPT_LIMIT);
    return attempt;
  }
  updateAttempt(target, status, failureCategory, message) {
    let attempt = currentQueueAttempt(target);
    if (!attempt || (status === 'sending' && attempt.status !== 'queued' && attempt.status !== 'sending')) {
      const existingAttemptNumber = Math.max(target.attempts, 1);
      attempt = this.createAttempt(target, status, '', existingAttemptNumber);
    }
    attempt.status = status;
    attempt.failureCategory = truncateUtf8(failureCategory || '', 128);
    attempt.message = truncateUtf8(message || '', 1024);
    if (status === 'sending' && !attempt.startedAt) attempt.startedAt = new Date().toISOString();
    if ((status === 'accepted' || status === 'failed' || status === 'cancelled') && !attempt.completedAt) attempt.completedAt = new Date().toISOString();
    target.attemptId = attempt.attemptId;
  }
  startAttempt(item) {
    const state = this.state();
    const target = state.items.find((entry) => entry.id === item.id);
    if (!target) return publicQueueItem(item);
    const current = currentQueueAttempt(target);
    if (!current) this.createAttempt(target, 'sending', '', Math.max(target.attempts, 1));
    else if (current.status !== 'queued') this.createAttempt(target, 'sending', '');
    else this.updateAttempt(target, 'sending', '', '');
    target.status = 'sending';
    target.failureCategory = '';
    target.message = '';
    target.updatedAt = new Date().toISOString();
    this.save(state);
    return publicQueueItem(target);
  }
  update(item, status, failureCategory, message) { const state = this.state(); const target = state.items.find((entry) => entry.id === item.id); if (!target) return publicQueueItem(item); target.status = status; target.failureCategory = failureCategory || ''; target.message = message || ''; if (item.payload && typeof item.payload === 'object') target.payload = item.payload; this.updateAttempt(target, status, failureCategory || '', message || ''); if (status === 'accepted' && target.payload && Array.isArray(target.payload.contextItems)) { target.payload = Object.assign({}, target.payload, { contextItems: target.payload.contextItems.filter((contextItem) => !contextItem || typeof contextItem !== 'object' || contextItem.kind !== 'chat-history') }); if (target.payload.contextItems.length === 0) delete target.payload.contextItems; } target.updatedAt = new Date().toISOString(); this.save(state); return publicQueueItem(target); }
  persistPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const state = this.state();
    const queueId = text(payload, 'queueId', '');
    const clientMessageId = text(payload, 'clientMessageId', '');
    const hostProfileId = text(payload, 'hostProfileId', '');
    const sessionId = text(payload, 'sessionId', '');
    const target = state.items.find((item) => usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && (!sessionId || item.sessionId === sessionId) && ((queueId && item.id === queueId) || (clientMessageId && item.clientMessageId === clientMessageId)));
    if (!target) return null;
    target.payload = payload;
    target.updatedAt = new Date().toISOString();
    this.save(state);
    return publicQueueItem(target);
  }
  cancel(payload) { const state = this.state(); const hostProfileId = text(payload, 'hostProfileId', ''); const sessionId = text(payload, 'sessionId', ''); const target = state.items.find((item) => usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && (!sessionId || item.sessionId === sessionId) && (item.id === text(payload, 'queueId', '') || item.clientMessageId === text(payload, 'clientMessageId', ''))); if (!target || target.status === 'sending') return { ok: false, action: 'message.queue.cancel', failureCategory: target ? 'message_sending' : 'not_found' }; target.status = 'cancelled'; target.failureCategory = ''; target.message = ''; this.updateAttempt(target, 'cancelled', '', ''); target.updatedAt = new Date().toISOString(); this.save(state); return { ok: true, action: 'message.queue.cancel', item: publicQueueItem(target) }; }
  retry(payload) { const state = this.state(); const hostProfileId = text(payload, 'hostProfileId', ''); const sessionId = text(payload, 'sessionId', ''); const target = state.items.find((item) => usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && (!sessionId || item.sessionId === sessionId) && (item.id === text(payload, 'queueId', '') || item.clientMessageId === text(payload, 'clientMessageId', ''))); if (!target || target.status !== 'failed') return { ok: false, action: 'message.queue.retry', failureCategory: 'retry_unavailable' }; const previous = currentQueueAttempt(target); if (!previous || previous.status !== 'failed') this.updateAttempt(target, 'failed', target.failureCategory || 'provider_error', target.message || ''); const failedAttempt = currentQueueAttempt(target); const next = this.createAttempt(target, 'queued', failedAttempt ? failedAttempt.attemptId : ''); target.status = 'queued'; target.failureCategory = ''; target.message = ''; target.updatedAt = new Date().toISOString(); this.save(state); return { ok: true, action: 'message.queue.retry', item: publicQueueItem(target), attempt: publicQueueAttempt(next) }; }
  async drain(sessionId, sender, updated, hostProfileId) {
    const hostScope = usageHostScope(hostProfileId);
    const runningKey = hostScope + '|' + sessionId;
    if (this.runningSessions.has(runningKey)) return; this.runningSessions.add(runningKey);
    try {
      while (true) {
        const item = this.state().items.find((entry) => usageHostScope(entry.hostProfileId) === hostScope && entry.sessionId === sessionId && entry.status === 'queued'); if (!item) break;
        const started = this.startAttempt(item); updated(started);
        try { await sender(item.payload); updated(this.update(item, 'accepted')); } catch (error) { updated(this.update(item, 'failed', 'provider_error', error instanceof Error ? error.message : String(error))); break; }
      }
    } finally { this.runningSessions.delete(runningKey); }
  }
}

function optionalNumber(source, key) {
  return source && typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : undefined;
}

const USAGE_INTEGER_KEYS = new Set([
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'totalTokens',
  'beforeTokens',
  'afterTokens',
  'quotaRemaining',
  'quotaLimit'
]);

function usageEventNumber(source, key) {
  const value = optionalNumber(source, key);
  if (value === undefined || value < 0) return undefined;
  if (USAGE_INTEGER_KEYS.has(key) && !Number.isSafeInteger(value)) return undefined;
  return value;
}

function normalizeOccurredAt(value, fallback) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function usageHostScope(value) {
  return typeof value === 'string' && value.length > 0 ? value : 'local';
}

function usageWindow(value) {
  return value === 'day' || value === 'month' ? value : 'session';
}

function usageWindowBounds(windowName, anchorAt) {
  const parsed = typeof anchorAt === 'string' ? Date.parse(anchorAt) : Number.NaN;
  const anchor = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  if (windowName === 'day') {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    return { startAt: start.toISOString(), endAt: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
  }
  if (windowName === 'month') {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }
  return { startAt: '', endAt: '' };
}

function usageBudgetScope(payload) {
  const hostProfileId = text(payload, 'hostProfileId', '');
  const sessionId = text(payload, 'sessionId', '');
  const agentId = text(payload, 'agentId', '');
  const windowName = usageWindow(text(payload, 'window', 'session'));
  const scopeType = sessionId ? 'session' : (agentId ? 'agent' : 'global');
  const scopeId = sessionId || agentId || 'global';
  const key = JSON.stringify([usageHostScope(hostProfileId), scopeType, scopeId, windowName]);
  return { key, hostProfileId, sessionId, agentId, scopeType, scopeId, window: windowName };
}

function addOptionalNumber(target, key, value) {
  if (typeof value === 'number' && Number.isFinite(value)) target[key] = value;
}

function usageSnapshotIsNewer(candidate, current) {
  if (!current) return true;
  const candidateTime = Date.parse(text(candidate, 'occurredAt', ''));
  const currentTime = Date.parse(text(current, 'occurredAt', ''));
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  if (Number.isFinite(candidateTime) && !Number.isFinite(currentTime)) return true;
  if (!Number.isFinite(candidateTime) && Number.isFinite(currentTime)) return false;
  return text(candidate, 'eventId', '') > text(current, 'eventId', '');
}

function addUsageAggregate(target, key, value) {
  const current = typeof target[key] === 'number' ? target[key] : 0;
  const next = current + value;
  if (!Number.isFinite(next)) return false;
  if (USAGE_INTEGER_KEYS.has(key) && !Number.isSafeInteger(next)) return false;
  target[key] = next;
  return true;
}

function aggregateUsageEvents(events, estimated) {
  const tokenKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens'];
  const tokens = {};
  const knownTokens = new Set();
  const costs = new Map();
  const invalidCurrencies = new Set();
  let eventCount = 0;
  for (const event of events) {
    if ((event.estimated === true) !== estimated || event.kind === 'compaction') continue;
    eventCount += 1;
    for (const key of tokenKeys) {
      const value = usageEventNumber(event, key);
      if (value === undefined) continue;
      if (addUsageAggregate(tokens, key, value)) knownTokens.add(key);
      else {
        delete tokens[key];
        knownTokens.delete(key);
      }
    }
    const cost = usageEventNumber(event, 'cost');
    if (cost !== undefined) {
      const currency = text(event, 'currency', '').trim().toUpperCase();
      if (currency.length > 0 && !invalidCurrencies.has(currency)) {
        const next = (costs.get(currency) || 0) + cost;
        if (Number.isFinite(next)) costs.set(currency, next);
        else {
          costs.delete(currency);
          invalidCurrencies.add(currency);
        }
      }
    }
  }
  const normalizedTokens = {};
  for (const key of tokenKeys) if (knownTokens.has(key)) normalizedTokens[key] = tokens[key];
  return {
    eventCount,
    tokens: normalizedTokens,
    costs: Array.from(costs.entries()).map(([currency, amount]) => ({ currency, amount }))
  };
}

class UsageManager {
  constructor(store, options) {
    this.store = store;
    const opts = options && typeof options === 'object' ? options : {};
    this.onBudgetWarning = typeof opts.onBudgetWarning === 'function' ? opts.onBudgetWarning : null;
  }

  state() {
    const source = this.store.readUsageState();
    const state = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    let stateChanged = false;
    if (!Array.isArray(state.events)) state.events = [];
    if (!state.budgets || typeof state.budgets !== 'object' || Array.isArray(state.budgets)) state.budgets = {};
    if (!state.budgetWarnings || typeof state.budgetWarnings !== 'object' || Array.isArray(state.budgetWarnings)) state.budgetWarnings = {};
    if (state.version !== 2) {
      const migrated = {};
      for (const [legacyScope, value] of Object.entries(state.budgets)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        if (typeof value.scopeKey === 'string' && value.scopeKey.length > 0) {
          migrated[value.scopeKey] = value;
          continue;
        }
        const scope = usageBudgetScope({ sessionId: legacyScope === 'global' ? '' : legacyScope, window: text(value, 'window', 'session') });
        migrated[scope.key] = Object.assign({}, value, scope, { scopeKey: scope.key });
      }
      state.budgets = migrated;
      state.version = 2;
      stateChanged = true;
    }
    for (const scopeKey of Object.keys(state.budgets)) {
      const budget = state.budgets[scopeKey];
      if (!budget || typeof budget !== 'object' || Array.isArray(budget)) continue;
      const currency = text(budget, 'currency', '');
      const normalizedCurrency = currency.trim().toUpperCase();
      if (currency !== normalizedCurrency) {
        budget.currency = normalizedCurrency;
        stateChanged = true;
      }
    }
    if (stateChanged) this.save(state);
    return state;
  }

  save(state) { this.store.writeUsageState(state); }

  record(payload, sourceConnection) {
    const state = this.state();
    const eventId = text(payload, 'eventId', '') || id('usage');
    const hostProfileId = text(payload, 'hostProfileId', '');
    const sessionId = text(payload, 'sessionId', '');
    const providerId = text(payload, 'providerId', '');
    if (state.events.some((item) => item.eventId === eventId && usageHostScope(item.hostProfileId) === usageHostScope(hostProfileId) && item.sessionId === sessionId && item.providerId === providerId)) return null;
    const occurredAt = normalizeOccurredAt(text(payload, 'occurredAt', ''), new Date().toISOString());
    const event = {
      eventId,
      hostProfileId,
      agentId: text(payload, 'agentId', ''),
      sessionId,
      providerId,
      source: text(payload, 'source', 'provider'),
      estimated: bool(payload, 'estimated', false),
      kind: text(payload, 'kind', 'usage'),
      occurredAt
    };
    const optionalKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens', 'cost', 'beforeTokens', 'afterTokens', 'quotaRemaining', 'quotaLimit'];
    for (const key of optionalKeys) addOptionalNumber(event, key, usageEventNumber(payload, key));
    if (event.totalTokens === undefined && event.inputTokens !== undefined && event.outputTokens !== undefined) {
      const derivedTotal = event.inputTokens + event.outputTokens;
      if (Number.isSafeInteger(derivedTotal)) event.totalTokens = derivedTotal;
    }
    const optionalTextKeys = ['currency', 'window', 'reason', 'quotaResetAt', 'quotaSource'];
    for (const key of optionalTextKeys) {
      const value = text(payload, key, '');
      if (value) {
        if (key === 'quotaResetAt') event[key] = normalizeOccurredAt(value, '');
        else if (key === 'currency') event[key] = value.trim().toUpperCase();
        else event[key] = value;
      }
    }
    if (!event.quotaResetAt) delete event.quotaResetAt;
    state.events.push(event);
    if (state.events.length > 10000) state.events = state.events.slice(-10000);
    this.save(state);
    this.evaluateBudgetsForEvent(state, event, sourceConnection);
    return event;
  }

  filteredEvents(payload) {
    const state = this.state();
    const hostProfileId = text(payload, 'hostProfileId', '');
    const sessionId = text(payload, 'sessionId', '');
    const agentId = text(payload, 'agentId', '');
    const providerId = text(payload, 'providerId', '');
    const windowName = usageWindow(text(payload, 'window', 'session'));
    const bounds = usageWindowBounds(windowName, text(payload, 'anchorAt', ''));
    const events = state.events.filter((event) => {
      if (usageHostScope(event.hostProfileId) !== usageHostScope(hostProfileId)) return false;
      if (sessionId && event.sessionId !== sessionId) return false;
      if (agentId && event.agentId !== agentId) return false;
      if (providerId && event.providerId !== providerId) return false;
      if (bounds.startAt && (event.occurredAt < bounds.startAt || event.occurredAt >= bounds.endAt)) return false;
      return true;
    });
    return { hostProfileId, sessionId, agentId, window: windowName, windowStartAt: bounds.startAt, windowEndAt: bounds.endAt, events };
  }

  events(payload) {
    const listed = this.filteredEvents(payload);
    const limit = Math.max(1, Math.min(1000, number(payload, 'limit', 200)));
    return {
      ok: true,
      action: 'usage.events.list',
      hostProfileId: listed.hostProfileId,
      sessionId: listed.sessionId,
      agentId: listed.agentId,
      window: listed.window,
      windowStartAt: listed.windowStartAt,
      windowEndAt: listed.windowEndAt,
      totalCount: listed.events.length,
      events: listed.events.slice(-limit)
    };
  }

  summary(payload) {
    const listed = this.filteredEvents(payload);
    const events = listed.events;
    const actual = aggregateUsageEvents(events, false);
    const estimated = aggregateUsageEvents(events, true);
    const compactionEvents = [];
    const quotaSnapshots = new Map();
    for (const event of events) {
      if (event.kind === 'compaction') {
        const compaction = { eventId: event.eventId, providerId: event.providerId, estimated: event.estimated === true, occurredAt: event.occurredAt };
        addOptionalNumber(compaction, 'beforeTokens', usageEventNumber(event, 'beforeTokens'));
        addOptionalNumber(compaction, 'afterTokens', usageEventNumber(event, 'afterTokens'));
        if (event.reason) compaction.reason = event.reason;
        compactionEvents.push(compaction);
      }
      if (event.quotaRemaining !== undefined || event.quotaLimit !== undefined || event.quotaResetAt || event.quotaSource) {
        const key = (event.providerId || '') + '|' + (event.quotaSource || 'provider') + '|' + (event.window || '');
        const current = quotaSnapshots.get(key);
        if (!current || usageSnapshotIsNewer(event, current)) quotaSnapshots.set(key, event);
      }
    }
    const quotas = [];
    for (const event of quotaSnapshots.values()) {
      quotas.push({
        providerId: event.providerId || '',
        source: event.quotaSource || 'provider',
        window: event.window || '',
        remaining: event.quotaRemaining,
        limit: event.quotaLimit,
        resetAt: event.quotaResetAt || '',
        occurredAt: event.occurredAt
      });
    }
    const summary = {
      eventCount: events.length,
      actual,
      estimated,
      costs: { actual: actual.costs, estimated: estimated.costs },
      quotas,
      compactions: compactionEvents.length,
      compactionEvents,
      window: listed.window,
      windowStartAt: listed.windowStartAt,
      windowEndAt: listed.windowEndAt
    };
    if (actual.tokens.totalTokens !== undefined) summary.realTokens = actual.tokens.totalTokens;
    if (estimated.tokens.totalTokens !== undefined) summary.estimatedTokens = estimated.tokens.totalTokens;
    if (actual.costs.length === 1) {
      summary.realCost = actual.costs[0].amount;
      summary.currency = actual.costs[0].currency;
    }
    if (estimated.costs.length === 1 && (actual.costs.length === 0 || estimated.costs[0].currency === summary.currency)) {
      summary.estimatedCost = estimated.costs[0].amount;
      if (!summary.currency) summary.currency = estimated.costs[0].currency;
    }
    return { ok: true, action: 'usage.summary.get', hostProfileId: listed.hostProfileId, sessionId: listed.sessionId, agentId: listed.agentId, summary };
  }

  budgetGet(payload) {
    const state = this.state();
    const scope = usageBudgetScope(payload);
    return { ok: true, action: 'usage.budget.get', scope: scope.scopeId, scopeKey: scope.key, hostProfileId: scope.hostProfileId, sessionId: scope.sessionId, agentId: scope.agentId, window: scope.window, budget: state.budgets[scope.key] || null };
  }

  budgetSet(payload) {
    const state = this.state();
    const rawWindow = text(payload, 'window', 'session');
    if (!['session', 'day', 'month'].includes(rawWindow)) return { ok: false, action: 'usage.budget.set', failureCategory: 'invalid_budget_window', message: 'Budget window must be session, day, or month.' };
    const tokenLimit = optionalNumber(payload, 'tokenLimit');
    const costLimit = optionalNumber(payload, 'costLimit');
    const warningThreshold = optionalNumber(payload, 'warningThreshold');
    if ((tokenLimit !== undefined && (!Number.isSafeInteger(tokenLimit) || tokenLimit < 0)) || (costLimit !== undefined && costLimit < 0)) return { ok: false, action: 'usage.budget.set', failureCategory: 'invalid_budget_limit', message: 'Token limits must be non-negative safe integers and cost limits must be non-negative.' };
    if (warningThreshold !== undefined && (warningThreshold <= 0 || warningThreshold > 1)) return { ok: false, action: 'usage.budget.set', failureCategory: 'invalid_warning_threshold', message: 'warningThreshold must be greater than zero and no more than one.' };
    const currency = text(payload, 'currency', '').trim().toUpperCase();
    if (costLimit !== undefined && !currency) return { ok: false, action: 'usage.budget.set', failureCategory: 'budget_currency_required', message: 'A currency is required for a cost budget.' };
    const scope = usageBudgetScope(payload);
    if (tokenLimit === undefined && costLimit === undefined) {
      delete state.budgets[scope.key];
      for (const key of Object.keys(state.budgetWarnings)) if (key === scope.key || key.startsWith(scope.key + '|')) delete state.budgetWarnings[key];
      this.save(state);
      return { ok: true, action: 'usage.budget.set', scope: scope.scopeId, scopeKey: scope.key, cleared: true, budget: null };
    }
    const budget = {
      scopeKey: scope.key,
      hostProfileId: scope.hostProfileId,
      sessionId: scope.sessionId,
      agentId: scope.agentId,
      scopeType: scope.scopeType,
      window: scope.window,
      currency,
      warningThreshold: warningThreshold === undefined ? 0.8 : warningThreshold,
      updatedAt: new Date().toISOString()
    };
    addOptionalNumber(budget, 'tokenLimit', tokenLimit);
    addOptionalNumber(budget, 'costLimit', costLimit);
    state.budgets[scope.key] = budget;
    for (const key of Object.keys(state.budgetWarnings)) if (key === scope.key || key.startsWith(scope.key + '|')) delete state.budgetWarnings[key];
    this.save(state);
    const warnings = this.evaluateBudget(state, budget, new Date().toISOString());
    return { ok: true, action: 'usage.budget.set', scope: scope.scopeId, scopeKey: scope.key, hostProfileId: scope.hostProfileId, sessionId: scope.sessionId, agentId: scope.agentId, window: scope.window, budget, warnings };
  }

  evaluateBudgetsForEvent(state, event, sourceConnection) {
    for (const budget of Object.values(state.budgets)) {
      if (!budget || typeof budget !== 'object') continue;
      if (usageHostScope(budget.hostProfileId) !== usageHostScope(event.hostProfileId)) continue;
      if (budget.sessionId && budget.sessionId !== event.sessionId) continue;
      if (!budget.sessionId && budget.agentId && budget.agentId !== event.agentId) continue;
      this.evaluateBudget(state, budget, event.occurredAt, sourceConnection);
    }
  }

  evaluateBudget(state, budget, anchorAt, sourceConnection) {
    const result = this.summary({ hostProfileId: budget.hostProfileId, sessionId: budget.sessionId, agentId: budget.agentId, window: budget.window, anchorAt });
    const actualTokens = result.summary.actual.tokens.totalTokens;
    const currencyCost = result.summary.actual.costs.find((item) => item.currency === budget.currency);
    const actualCost = currencyCost ? currencyCost.amount : undefined;
    const reasons = [];
    if (budget.tokenLimit !== undefined && actualTokens !== undefined && actualTokens >= budget.tokenLimit * budget.warningThreshold) reasons.push('token');
    if (budget.costLimit !== undefined && actualCost !== undefined && actualCost >= budget.costLimit * budget.warningThreshold) reasons.push('cost');
    const bounds = usageWindowBounds(budget.window, anchorAt);
    const warningKey = budget.scopeKey + '|' + (bounds.startAt || 'session');
    const previous = state.budgetWarnings[warningKey] === true;
    state.budgetWarnings[warningKey] = reasons.length > 0;
    const warningKeys = Object.keys(state.budgetWarnings);
    if (warningKeys.length > 1000) for (const key of warningKeys.slice(0, warningKeys.length - 1000)) delete state.budgetWarnings[key];
    this.save(state);
    if (reasons.length === 0 || previous) return [];
    const warning = {
      action: 'usage.budget.warning',
      hostProfileId: budget.hostProfileId,
      sessionId: budget.sessionId,
      agentId: budget.agentId,
      window: budget.window,
      windowStartAt: bounds.startAt,
      windowEndAt: bounds.endAt,
      warningThreshold: budget.warningThreshold,
      reasons,
      currency: budget.currency,
      emittedAt: new Date().toISOString(),
      budget
    };
    addOptionalNumber(warning, 'actualTokens', actualTokens);
    addOptionalNumber(warning, 'actualCost', actualCost);
    if (this.onBudgetWarning) {
      try { this.onBudgetWarning(warning, sourceConnection); } catch (_error) { /* Budget persistence remains authoritative. */ }
    }
    return [warning];
  }
}

function metadataSuggestion(kind, payload) {
  const prompt = text(payload, 'prompt', '').trim(); const branch = text(payload, 'branchName', '').trim(); const summary = text(payload, 'diffSummary', '').trim(); const seed = prompt || summary || branch || 'Agent work';
  if (kind === 'branchName') return seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'agent-update';
  if (kind === 'commitMessage') return (seed.split(/\r?\n/)[0] || 'Update workspace').slice(0, 72);
  if (kind === 'pullRequest') return '## Summary\n\n' + seed.slice(0, 2000) + '\n\n## Test plan\n\n- Review generated changes';
  return seed.split(/\r?\n/)[0].slice(0, 80) || 'New session';
}

module.exports = {
  MessageQueueManager,
  UsageManager,
  metadataSuggestion,
  normalizeRichContentNodes,
  richContentNodes,
  sanitizeComposerTokens,
  tokenizeCode,
  truncateText,
  truncateUtf8
};
