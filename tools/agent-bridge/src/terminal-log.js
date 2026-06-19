'use strict';

const COLOR_ENABLED = process.env.NO_COLOR !== '1' &&
  process.env.NO_COLOR !== 'true' &&
  process.stdout.isTTY !== false;

function color(code, value) {
  if (!COLOR_ENABLED) {
    return value;
  }
  return '\x1b[' + code + 'm' + value + '\x1b[0m';
}

function dim(value) {
  return color('2', value);
}

function green(value) {
  return color('32', value);
}

function yellow(value) {
  return color('33', value);
}

function red(value) {
  return color('31', value);
}

function cyan(value) {
  return color('36', value);
}

function padRight(value, width) {
  const text = String(value);
  if (text.length >= width) {
    return text;
  }
  return text + ' '.repeat(width - text.length);
}

function timestampText() {
  const date = new Date();
  return String(date.getFullYear()) + '-' +
    pad2(date.getMonth() + 1) + '-' +
    pad2(date.getDate()) + ' ' +
    pad2(date.getHours()) + ':' +
    pad2(date.getMinutes()) + ':' +
    pad2(date.getSeconds()) + '.' +
    pad3(date.getMilliseconds());
}

function pad2(value) {
  if (value < 10) {
    return '0' + String(value);
  }
  return String(value);
}

function pad3(value) {
  if (value < 10) {
    return '00' + String(value);
  }
  if (value < 100) {
    return '0' + String(value);
  }
  return String(value);
}

function normalizeText(value) {
  return String(value).replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
}

function formatFieldValue(value) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized.length === 0) {
      return '""';
    }
    if (/[\s="]/.test(normalized)) {
      return JSON.stringify(normalized);
    }
    return normalized;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return formatFieldValue(value.message);
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return formatFieldValue(String(value));
  }
}

function formatFields(fields) {
  if (!fields || typeof fields !== 'object') {
    return '';
  }
  const parts = [];
  for (const key of Object.keys(fields)) {
    const rendered = formatFieldValue(fields[key]);
    if (rendered.length === 0) {
      continue;
    }
    parts.push(key + '=' + rendered);
  }
  return parts.join(' ');
}

function colorizeLevel(level, text) {
  if (level === 'WARN') {
    return yellow(text);
  }
  if (level === 'ERROR') {
    return red(text);
  }
  if (level === 'READY') {
    return green(text);
  }
  return cyan(text);
}

function createTerminalLogger(scope) {
  const baseScope = typeof scope === 'string' && scope.length > 0 ? scope : 'agent-bridge';

  function write(level, event, fields) {
    const timestamp = dim(timestampText());
    const levelText = colorizeLevel(level, padRight(level, 5));
    const scopeText = padRight(baseScope, 18);
    const eventText = typeof event === 'string' && event.length > 0 ? event : 'log';
    const fieldText = formatFields(fields);
    const line = fieldText.length > 0 ?
      timestamp + ' | ' + levelText + ' | ' + scopeText + ' | ' + eventText + ' | ' + fieldText :
      timestamp + ' | ' + levelText + ' | ' + scopeText + ' | ' + eventText;
    console.log(line);
  }

  return {
    info(event, fields) {
      write('INFO', event, fields);
    },
    warn(event, fields) {
      write('WARN', event, fields);
    },
    error(event, fields) {
      write('ERROR', event, fields);
    },
    ready(event, fields) {
      write('READY', event, fields);
    }
  };
}

module.exports = {
  createTerminalLogger
};
