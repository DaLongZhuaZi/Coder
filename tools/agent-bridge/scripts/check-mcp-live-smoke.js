'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const bridgeRoot = path.resolve(__dirname, '..');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-mcp-live-smoke-'));
const smokeToken = 'mcp-live-smoke-token';
const missingEnvironmentVariable = 'NGF_MCP_LIVE_MISSING_PROVIDER_ENV';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ statusCode: response.statusCode || 0, body: JSON.parse(text) });
        } catch (error) {
          reject(new Error('Invalid health JSON: ' + (error instanceof Error ? error.message : String(error))));
        }
      });
    });
    request.on('error', reject);
  });
}

async function waitForHealth(url, child, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Bridge exited before health check. Output: ' + output.join(''));
    }
    try {
      const response = await getJson(url);
      if (response.statusCode === 200 && response.body && response.body.ok === true) {
        return response.body;
      }
    } catch (_error) {
      // The listener may not be ready yet.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Bridge health. Output: ' + output.join(''));
}

function writeMcpMessage(child, message) {
  const body = JSON.stringify(message);
  child.stdin.write('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
}

function createMcpClient(child) {
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf('\r\n\r\n');
      if (separator < 0) {
        return;
      }
      const header = buffer.subarray(0, separator).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      assert.ok(match, 'MCP response must include Content-Length');
      const length = Number.parseInt(match[1], 10);
      const bodyStart = separator + 4;
      if (buffer.length < bodyStart + length) {
        return;
      }
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      buffer = buffer.subarray(bodyStart + length);
      const parsed = JSON.parse(body);
      const resolver = pending.get(parsed.id);
      if (resolver) {
        pending.delete(parsed.id);
        resolver(parsed);
      }
    }
  });
  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = 'live_' + String(nextId);
        nextId += 1;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Timed out waiting for MCP response: ' + method));
        }, 10000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        writeMcpMessage(child, {
          jsonrpc: '2.0',
          id,
          method,
          params: params || {}
        });
      });
    }
  };
}

function parseToolResult(result) {
  assert.ok(result && result.result && Array.isArray(result.result.content));
  return JSON.parse(result.result.content[0].text);
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await waitForExit(child, 5000);
  if (child.exitCode === null) {
    child.kill();
    await waitForExit(child, 2000);
  }
}

async function main() {
  const port = await reservePort();
  assert.ok(port > 0, 'live smoke requires an available port');
  const bridgeOutput = [];
  let bridgeChild = null;
  let mcpChild = null;
  try {
    const bridgeEnvironment = Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: tempHome,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: smokeToken
    });
    delete bridgeEnvironment[missingEnvironmentVariable];
    bridgeChild = spawn(process.execPath, [path.join(bridgeRoot, 'src', 'server.js')], {
      cwd: bridgeRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: bridgeEnvironment
    });
    bridgeChild.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));
    bridgeChild.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString('utf8')));

    const bridgeUrl = 'http://127.0.0.1:' + String(port);
    const health = await waitForHealth(bridgeUrl + '/health', bridgeChild, bridgeOutput);
    assert.strictEqual(health.features.mcpHost, true);

    mcpChild = spawn(process.execPath, [path.join(bridgeRoot, 'src', 'mcp-stdio-server.js')], {
      cwd: bridgeRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_TOKEN: smokeToken,
        AGENT_BRIDGE_MCP_BRIDGE_URL: bridgeUrl
      })
    });
    const mcpClient = createMcpClient(mcpChild);
    const initialized = await mcpClient.request('initialize', {});
    assert.strictEqual(initialized.result.serverInfo.name, 'ngf-agent-bridge');

    const listed = await mcpClient.request('tools/list', {});
    const pruneTool = listed.result.tools.find((tool) => tool.name === 'notification_prune');
    assert.strictEqual(pruneTool.annotations.destructiveHint, true);
    assert.strictEqual(pruneTool.inputSchema.properties.confirm.type, 'boolean');
    const relayStatusTool = listed.result.tools.find((tool) => tool.name === 'relay_status');
    const relayRevokeTool = listed.result.tools.find((tool) => tool.name === 'relay_device_revoke');
    assert.strictEqual(relayStatusTool.annotations.readOnlyHint, true);
    assert.strictEqual(relayRevokeTool.annotations.destructiveHint, true);
    const scheduleListTool = listed.result.tools.find((tool) => tool.name === 'schedule_list');
    const loopStartTool = listed.result.tools.find((tool) => tool.name === 'loop_start');
    const chatPostTool = listed.result.tools.find((tool) => tool.name === 'chat_room_message_post');
    assert.strictEqual(scheduleListTool.annotations.readOnlyHint, true);
    assert.strictEqual(loopStartTool.annotations.openWorldHint, true);
    assert.strictEqual(chatPostTool.annotations.destructiveHint, true);

    const daemonStatus = parseToolResult(await mcpClient.request('tools/call', {
      name: 'daemon_status',
      arguments: {}
    }));
    assert.strictEqual(daemonStatus.ok, true);
    assert.strictEqual(daemonStatus.payload.action, 'daemon.status');
    assert.strictEqual(daemonStatus.payload.status, 'running');

    const daemonConfigStatusTool = listed.result.tools.find((tool) => tool.name === 'daemon_config_status');
    const daemonConfigFetchTool = listed.result.tools.find((tool) => tool.name === 'daemon_config_fetch');
    const daemonConfigApplyTool = listed.result.tools.find((tool) => tool.name === 'daemon_config_apply');
    const daemonConfigRollbackTool = listed.result.tools.find((tool) => tool.name === 'daemon_config_rollback');
    assert.strictEqual(daemonConfigStatusTool.annotations.readOnlyHint, true);
    assert.strictEqual(daemonConfigFetchTool.annotations.openWorldHint, true);
    assert.strictEqual(daemonConfigApplyTool.annotations.destructiveHint, true);
    assert.strictEqual(daemonConfigRollbackTool.annotations.destructiveHint, true);
    assert.strictEqual(daemonConfigApplyTool.inputSchema.properties.confirm.type, 'boolean');
    const daemonConfigStatus = parseToolResult(await mcpClient.request('tools/call', {
      name: 'daemon_config_status',
      arguments: {}
    }));
    assert.strictEqual(daemonConfigStatus.ok, true);
    assert.strictEqual(daemonConfigStatus.payload.action, 'daemon.config.status');
    const daemonConfigPreview = parseToolResult(await mcpClient.request('tools/call', {
      name: 'daemon_config_preview',
      arguments: {}
    }));
    assert.strictEqual(daemonConfigPreview.payload.failureCategory, 'config_missing');
    const daemonConfigApplyWithoutConfirm = parseToolResult(await mcpClient.request('tools/call', {
      name: 'daemon_config_apply',
      arguments: { planId: 'missing-plan' }
    }));
    assert.strictEqual(daemonConfigApplyWithoutConfirm.failureCategory, 'confirmation_required');

    const providerSecret = 'mcp-provider-secret-smoke';
    const blockedProviderUpsert = parseToolResult(await mcpClient.request('tools/call', {
      name: 'provider_profile_upsert',
      arguments: {
        profileId: 'mcp-provider-profile',
        providerId: 'mcp-provider',
        binary: process.execPath,
        envMutations: [
          { operation: 'set', key: 'MCP_SECRET', source: 'secure_store', value: providerSecret }
        ]
      }
    }));
    assert.strictEqual(blockedProviderUpsert.failureCategory, 'confirmation_required');
    assert.strictEqual(JSON.stringify(blockedProviderUpsert).includes(providerSecret), false);

    const providerUpsert = parseToolResult(await mcpClient.request('tools/call', {
      name: 'provider_profile_upsert',
      arguments: {
        profileId: 'mcp-provider-profile',
        providerId: 'mcp-provider',
        displayName: 'MCP Provider',
        binary: process.execPath,
        envMutations: [
          { operation: 'set', key: 'MCP_SECRET', source: 'secure_store', value: providerSecret }
        ],
        confirm: true
      }
    }));
    assert.strictEqual(providerUpsert.ok, true);
    assert.deepStrictEqual(providerUpsert.payload.profile.env, {});
    assert.ok(providerUpsert.payload.profile.envMetadata.some((item) => item.key === 'MCP_SECRET' && item.configured === true));
    assert.strictEqual(JSON.stringify(providerUpsert).includes(providerSecret), false);

    const providerProfiles = parseToolResult(await mcpClient.request('tools/call', {
      name: 'provider_profile_list',
      arguments: {}
    }));
    assert.strictEqual(providerProfiles.ok, true);
    assert.strictEqual(JSON.stringify(providerProfiles).includes(providerSecret), false);

    const missingEnvironmentProfile = parseToolResult(await mcpClient.request('tools/call', {
      name: 'provider_profile_upsert',
      arguments: {
        profileId: 'mcp-missing-environment-profile',
        providerId: 'mcp-missing-environment-provider',
        displayName: 'MCP Missing Environment Provider',
        binary: process.execPath,
        envMutations: [
          {
            operation: 'set',
            key: 'REQUIRED_TOKEN',
            source: 'process_environment',
            environmentVariable: missingEnvironmentVariable
          }
        ],
        confirm: true
      }
    }));
    assert.strictEqual(missingEnvironmentProfile.ok, true);
    const missingEnvironmentTest = parseToolResult(await mcpClient.request('tools/call', {
      name: 'provider_profile_test',
      arguments: {
        profileId: 'mcp-missing-environment-profile'
      }
    }));
    assert.strictEqual(missingEnvironmentTest.ok, true);
    assert.strictEqual(missingEnvironmentTest.payload.ok, false);
    assert.strictEqual(missingEnvironmentTest.payload.runtimeFailureCategory, 'provider_environment_variable_missing');

    const diagnostics = parseToolResult(await mcpClient.request('tools/call', {
      name: 'diagnostics_export',
      arguments: {
        format: 'json'
      }
    }));
    assert.strictEqual(diagnostics.ok, true);
    assert.strictEqual(JSON.stringify(diagnostics).includes(providerSecret), false);
    const secureStorageGroup = diagnostics.payload.report.groups.find((group) => group.id === 'secureStorage');
    assert.ok(secureStorageGroup.checks.some((check) => check.id === 'provider_secret_store'));

    const relayStatus = parseToolResult(await mcpClient.request('tools/call', {
      name: 'relay_status',
      arguments: {}
    }));
    assert.strictEqual(relayStatus.ok, true);
    assert.strictEqual(typeof relayStatus.payload.configured, 'boolean');
    assert.strictEqual(relayStatus.payload.e2ee.protocolVersion, 'ngf-agent-bridge.relay.v1');

    const relayDevices = parseToolResult(await mcpClient.request('tools/call', {
      name: 'relay_device_list',
      arguments: {
        includeRevoked: true
      }
    }));
    assert.strictEqual(relayDevices.ok, true);
    assert.ok(Array.isArray(relayDevices.payload.devices));

    const relayRotatePreview = parseToolResult(await mcpClient.request('tools/call', {
      name: 'relay_identity_rotate',
      arguments: {}
    }));
    assert.strictEqual(relayRotatePreview.ok, true);
    assert.strictEqual(relayRotatePreview.payload.preview, true);
    assert.strictEqual(relayRotatePreview.payload.confirmed, false);
    assert.strictEqual(typeof relayRotatePreview.payload.planId, 'string');

    const scheduleStatus = parseToolResult(await mcpClient.request('tools/call', { name: 'schedule_status', arguments: {} }));
    const loopStatus = parseToolResult(await mcpClient.request('tools/call', { name: 'loop_status', arguments: {} }));
    const roomList = parseToolResult(await mcpClient.request('tools/call', { name: 'chat_room_list', arguments: {} }));
    assert.strictEqual(scheduleStatus.payload.available, true);
    assert.strictEqual(loopStatus.payload.available, true);
    assert.ok(Array.isArray(roomList.payload.rooms));

    const blockedChatPost = parseToolResult(await mcpClient.request('tools/call', {
      name: 'chat_room_message_post',
      arguments: { roomId: 'missing', clientMessageId: 'mcp-smoke', body: 'blocked before RPC' }
    }));
    assert.strictEqual(blockedChatPost.failureCategory, 'confirmation_required');

    const blockedPrune = parseToolResult(await mcpClient.request('tools/call', {
      name: 'notification_prune',
      arguments: {}
    }));
    assert.strictEqual(blockedPrune.failureCategory, 'confirmation_required');

    const confirmedPrune = parseToolResult(await mcpClient.request('tools/call', {
      name: 'notification_prune',
      arguments: {
        confirm: true
      }
    }));
    assert.strictEqual(confirmedPrune.ok, true);
    assert.strictEqual(confirmedPrune.payload.action, 'notification.prune');

    const healthAfter = await getJson(bridgeUrl + '/health');
    assert.strictEqual(healthAfter.statusCode, 200);
    assert.strictEqual(healthAfter.body.ok, true);
    assert.strictEqual(bridgeOutput.join('').includes(providerSecret), false);
    console.log('mcp live smoke ok');
  } finally {
    await stopChild(mcpChild);
    await stopChild(bridgeChild);
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Ignore cleanup errors in the failure path.
  }
  console.error(error);
  process.exitCode = 1;
});
