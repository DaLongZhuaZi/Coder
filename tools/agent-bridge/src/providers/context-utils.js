'use strict';

const fs = require('fs');
const path = require('path');

const MAX_CONTEXT_FILE_BYTES = 220 * 1024;
const MAX_CONTEXT_TOTAL_CHARS = 180 * 1024;
const MAX_CONTEXT_ITEMS = 24;

function readStringValue(source, key, fallbackValue) {
  if (!source || typeof source !== 'object') {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'string' ? value : fallbackValue;
}

function readArrayValue(source, key) {
  if (!source || typeof source !== 'object') {
    return [];
  }
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function normalizeSlashPath(value) {
  return String(value || '').trim().split('\\').join('/');
}

function isLikelyBinaryPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.png' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.gif' ||
    ext === '.webp' ||
    ext === '.bmp' ||
    ext === '.ico' ||
    ext === '.pdf' ||
    ext === '.zip' ||
    ext === '.7z' ||
    ext === '.rar' ||
    ext === '.exe' ||
    ext === '.dll' ||
    ext === '.so' ||
    ext === '.dylib';
}

function safeWorkspacePath(rootPath, candidatePath) {
  if (typeof rootPath !== 'string' || rootPath.trim().length === 0 ||
      typeof candidatePath !== 'string' || candidatePath.trim().length === 0) {
    return '';
  }
  const root = path.resolve(rootPath);
  const rawCandidate = candidatePath.trim();
  const withoutFileScheme = rawCandidate.startsWith('file://') ? rawCandidate.substring('file://'.length) : rawCandidate;
  const target = path.isAbsolute(withoutFileScheme) ?
    path.resolve(withoutFileScheme) :
    path.resolve(root, withoutFileScheme);
  const comparableRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const comparableTarget = process.platform === 'win32' ? target.toLowerCase() : target;
  if (comparableTarget === comparableRoot || comparableTarget.startsWith(comparableRoot + path.sep)) {
    return target;
  }
  return '';
}

function readContextFile(rootPath, candidatePath) {
  const finalPath = safeWorkspacePath(rootPath, candidatePath);
  if (finalPath.length === 0) {
    return null;
  }
  let stat = null;
  try {
    stat = fs.statSync(finalPath);
  } catch (error) {
    return null;
  }
  if (stat.isDirectory()) {
    try {
      const entries = fs.readdirSync(finalPath, { withFileTypes: true })
        .slice(0, 80)
        .map((entry) => entry.name + (entry.isDirectory() ? '/' : ''));
      return {
        path: path.relative(path.resolve(rootPath), finalPath).split(path.sep).join('/'),
        title: candidatePath,
        mediaType: 'inode/directory',
        content: entries.join('\n')
      };
    } catch (error) {
      return null;
    }
  }
  if (!stat.isFile() || stat.size > MAX_CONTEXT_FILE_BYTES || isLikelyBinaryPath(finalPath)) {
    return {
      path: path.relative(path.resolve(rootPath), finalPath).split(path.sep).join('/'),
      title: candidatePath,
      mediaType: isLikelyBinaryPath(finalPath) ? 'application/octet-stream' : 'text/plain',
      content: '[File omitted: unsupported or larger than ' + String(MAX_CONTEXT_FILE_BYTES) + ' bytes]'
    };
  }
  try {
    return {
      path: path.relative(path.resolve(rootPath), finalPath).split(path.sep).join('/'),
      title: candidatePath,
      mediaType: 'text/plain',
      content: fs.readFileSync(finalPath, 'utf8')
    };
  } catch (error) {
    return null;
  }
}

function cleanMentionToken(value) {
  let token = String(value || '').trim();
  if (!token.startsWith('@') || token.length <= 1) {
    return '';
  }
  token = token.substring(1);
  while (token.length > 0) {
    const last = token.charAt(token.length - 1);
    if (last === ',' || last === '.' || last === ';' || last === ':' || last === ')' || last === ']' || last === '}') {
      token = token.substring(0, token.length - 1);
    } else {
      break;
    }
  }
  return token;
}

function extractMentionPaths(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const items = [];
  let token = '';
  const flush = () => {
    const value = cleanMentionToken(token);
    token = '';
    if (value.length === 0) {
      return;
    }
    for (const existing of items) {
      if (existing === value) {
        return;
      }
    }
    items.push(value);
  };
  for (let index = 0; index < text.length; index += 1) {
    const ch = text.charAt(index);
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      flush();
    } else {
      token = token + ch;
    }
  }
  flush();
  return items.slice(0, MAX_CONTEXT_ITEMS);
}

function collectContextItems(payload, session) {
  const text = readStringValue(payload, 'text', '');
  const items = [];
  const rawItems = readArrayValue(payload, 'contextItems');
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    items.push({
      kind: readStringValue(raw, 'kind', 'file'),
      path: readStringValue(raw, 'path', ''),
      uri: readStringValue(raw, 'uri', ''),
      title: readStringValue(raw, 'title', ''),
      content: readStringValue(raw, 'content', ''),
      mediaType: readStringValue(raw, 'mediaType', '')
    });
    if (items.length >= MAX_CONTEXT_ITEMS) {
      return items;
    }
  }
  const mentions = extractMentionPaths(text);
  for (const mention of mentions) {
    let duplicate = false;
    for (const item of items) {
      if (normalizeSlashPath(item.path) === normalizeSlashPath(mention)) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      items.push({
        kind: 'file',
        path: mention,
        uri: '',
        title: mention,
        content: '',
        mediaType: ''
      });
    }
    if (items.length >= MAX_CONTEXT_ITEMS) {
      break;
    }
  }
  if (items.length === 0 && session && typeof session.workspacePath === 'string' && session.workspacePath.length > 0) {
    items.push({
      kind: 'workspace',
      path: session.workspacePath,
      uri: '',
      title: session.workspaceTitle || path.basename(session.workspacePath),
      content: '',
      mediaType: ''
    });
  }
  return items;
}

function resolveContextItems(payload, session) {
  const rootPath = session && typeof session.workspacePath === 'string' ? session.workspacePath : '';
  const rawItems = collectContextItems(payload, session);
  const resolved = [];
  for (const item of rawItems) {
    if (item.kind === 'workspace') {
      if (rootPath.length > 0) {
        resolved.push({
          kind: 'workspace',
          path: rootPath,
          title: item.title.length > 0 ? item.title : path.basename(rootPath),
          mediaType: 'text/plain',
          content: ''
        });
      }
      continue;
    }
    if (item.content.length > 0) {
      resolved.push(item);
      continue;
    }
    const candidatePath = item.path.length > 0 ? item.path : item.uri;
    const file = readContextFile(rootPath, candidatePath);
    if (file) {
      resolved.push({
        kind: item.kind,
        path: file.path,
        title: item.title.length > 0 ? item.title : (file.title.length > 0 ? file.title : file.path),
        mediaType: file.mediaType,
        content: file.content
      });
      continue;
    }
    if (item.title.length > 0 || candidatePath.length > 0) {
      resolved.push({
        kind: item.kind,
        path: candidatePath,
        title: item.title.length > 0 ? item.title : candidatePath,
        mediaType: item.mediaType,
        content: ''
      });
    }
  }
  return resolved;
}

function languageForPath(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return ext.length > 0 ? ext : 'text';
}

function buildContextText(payload, session) {
  const items = resolveContextItems(payload, session);
  if (items.length === 0) {
    return '';
  }
  let total = 0;
  const lines = [];
  lines.push('<agent_bridge_context>');
  if (session && typeof session.workspacePath === 'string' && session.workspacePath.length > 0) {
    lines.push('Workspace: ' + session.workspacePath);
  }
  for (const item of items) {
    if (item.kind === 'workspace') {
      continue;
    }
    const label = item.title.length > 0 ? item.title : item.path;
    lines.push('');
    lines.push('Context ' + item.kind + ': ' + label);
    if (item.path.length > 0) {
      lines.push('Path: ' + item.path);
    }
    if (item.content.length > 0) {
      let content = item.content;
      const remaining = MAX_CONTEXT_TOTAL_CHARS - total;
      if (remaining <= 0) {
        lines.push('[Further context omitted: context budget reached]');
        break;
      }
      if (content.length > remaining) {
        content = content.substring(0, remaining) + '\n[Truncated by Agent Bridge context budget]';
      }
      total = total + content.length;
      lines.push('```' + languageForPath(item.path));
      lines.push(content);
      lines.push('```');
    } else {
      lines.push('[Reference only: content was not available to Agent Bridge]');
    }
  }
  lines.push('</agent_bridge_context>');
  return lines.join('\n');
}

function buildPromptWithContext(text, payload, session) {
  const contextText = buildContextText(payload, session);
  if (contextText.length === 0) {
    return text;
  }
  return contextText + '\n\nUser request:\n' + text;
}

function buildOpenCodePartsWithContext(payload, session) {
  const text = readStringValue(payload, 'text', '');
  const explicitParts = readArrayValue(payload, 'parts');
  const contextText = buildContextText(payload, session);
  const parts = [];
  if (contextText.length > 0) {
    parts.push({
      type: 'text',
      text: contextText
    });
  }
  if (explicitParts.length > 0) {
    for (const part of explicitParts) {
      parts.push(part);
    }
  } else {
    parts.push({
      type: 'text',
      text
    });
  }
  return parts;
}

module.exports = {
  buildContextText,
  buildOpenCodePartsWithContext,
  buildPromptWithContext,
  collectContextItems,
  extractMentionPaths,
  resolveContextItems
};
