#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const { randomUUID, randomBytes } = require('crypto');
const { mcpToolDefinitions, toolRequestType, toolConfirmationFailure } = require('./mcp-host');

function readArg(name, fallbackValue) {
  const prefix = name + '=';
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    if (item === name && index + 1 < process.argv.length) {
      return process.argv[index + 1];
    }
    if (item.startsWith(prefix)) {
      return item.substring(prefix.length);
    }
  }
  return fallbackValue;
}

function bridgeUrlFromEnv() {
  return readArg('--bridge-url', process.env.AGENT_BRIDGE_MCP_BRIDGE_URL || process.env.AGENT_BRIDGE_URL || 'http://127.0.0.1:8787');
}

function bridgeTokenFromEnv() {
  return readArg('--token', process.env.AGENT_BRIDGE_TOKEN || '');
}

function normalizeRpcUrl(rawUrl) {
  let url = rawUrl;
  if (url.startsWith('ws://')) {
    url = 'http://' + url.substring('ws://'.length);
  } else if (url.startsWith('wss://')) {
    url = 'https://' + url.substring('wss://'.length);
  }
  const parsed = new URL(url);
  parsed.pathname = '/rpc';
  parsed.search = '';
  return parsed;
}

function postJson(rawUrl, token, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body);
    const parsed = normalizeRpcUrl(rawUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      method: 'POST',
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Authorization': 'Bearer ' + token
      },
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error('Invalid Bridge RPC JSON: ' + (error instanceof Error ? error.message : String(error))));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('Bridge RPC timed out.'));
    });
    request.on('error', reject);
    request.write(requestBody);
    request.end();
  });
}

function makeJsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function makeJsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data: data || {}
    }
  };
}

function writeMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
}

function textContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}

function parseToolArguments(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return {};
  }
  const args = params.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }
  return args;
}

function requestId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return randomBytes(8).toString('hex');
}

function normalizeBridgeRpcResponse(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) &&
    value.response && typeof value.response === 'object' && !Array.isArray(value.response)) {
    return value.response;
  }
  return value;
}

async function callTool(params) {
  const toolName = params && typeof params.name === 'string' ? params.name : '';
  const args = parseToolArguments(params);
  const mapped = toolRequestType(toolName, args);
  if (!mapped) {
    return textContent({
      ok: false,
      failureCategory: 'tool_not_found',
      message: 'Unknown MCP tool: ' + toolName
    });
  }
  const confirmationFailure = toolConfirmationFailure(toolName, args);
  if (confirmationFailure) {
    return textContent(confirmationFailure);
  }
  const token = bridgeTokenFromEnv();
  if (token.length === 0) {
    return textContent({
      ok: false,
      failureCategory: 'auth_missing',
      message: 'AGENT_BRIDGE_TOKEN is required for MCP tool calls.',
      remediation: 'Launch this MCP server with AGENT_BRIDGE_TOKEN set to the local Bridge token.'
    });
  }
  const bridgeUrl = bridgeUrlFromEnv();
  const rpcPayload = {
    id: requestId(),
    type: mapped.type,
    payload: mapped.payload
  };
  const response = await postJson(bridgeUrl, token, rpcPayload, 30000);
  return textContent(normalizeBridgeRpcResponse(response));
}

async function handleRequest(message) {
  const id = message && Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null;
  const method = message && typeof message.method === 'string' ? message.method : '';
  if (method === 'notifications/initialized') {
    return null;
  }
  if (method === 'initialize') {
    return makeJsonRpcResult(id, {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'ngf-agent-bridge',
        version: '0.1.4'
      },
      capabilities: {
        tools: {}
      }
    });
  }
  if (method === 'tools/list') {
    return makeJsonRpcResult(id, {
      tools: mcpToolDefinitions()
    });
  }
  if (method === 'tools/call') {
    try {
      return makeJsonRpcResult(id, await callTool(message.params));
    } catch (error) {
      return makeJsonRpcError(id, -32000, error instanceof Error ? error.message : String(error), {});
    }
  }
  return makeJsonRpcError(id, -32601, 'Method not found: ' + method, {});
}

let inputBuffer = Buffer.alloc(0);

function readNextMessage() {
  const separator = inputBuffer.indexOf('\r\n\r\n');
  if (separator < 0) {
    return null;
  }
  const headerText = inputBuffer.subarray(0, separator).toString('utf8');
  const match = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!match) {
    inputBuffer = inputBuffer.subarray(separator + 4);
    return null;
  }
  const length = Number.parseInt(match[1], 10);
  const bodyStart = separator + 4;
  if (inputBuffer.length < bodyStart + length) {
    return null;
  }
  const bodyText = inputBuffer.subarray(bodyStart, bodyStart + length).toString('utf8');
  inputBuffer = inputBuffer.subarray(bodyStart + length);
  return JSON.parse(bodyText);
}

async function processInput() {
  while (true) {
    let message = null;
    try {
      message = readNextMessage();
    } catch (error) {
      writeMessage(makeJsonRpcError(null, -32700, error instanceof Error ? error.message : String(error), {}));
      continue;
    }
    if (!message) {
      return;
    }
    const response = await handleRequest(message);
    if (response) {
      writeMessage(response);
    }
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processInput().catch((error) => {
    writeMessage(makeJsonRpcError(null, -32000, error instanceof Error ? error.message : String(error), {}));
  });
});

process.stdin.resume();
