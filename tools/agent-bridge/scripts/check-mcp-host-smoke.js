'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-mcp-smoke-'));
process.env.AGENT_BRIDGE_HOME = tempHome;

const { createDaemonStore } = require('../src/daemon-store');
const {
  McpHostManager,
  mcpToolDefinitions,
  toolRequestType,
  toolAccessPolicy,
  toolConfirmationFailure
} = require('../src/mcp-host');
const { RequestType } = require('../src/protocol');

function writeMcpMessage(child, message) {
  const body = JSON.stringify(message);
  child.stdin.write('Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
}

function createMcpClient(child) {
  let buffer = Buffer.alloc(0);
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
        const id = 'req_' + pending.size + '_' + Date.now();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Timed out waiting for MCP response: ' + method));
        }, 5000);
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

function parseToolText(result) {
  assert.ok(result && result.result && Array.isArray(result.result.content), 'tool result should contain content');
  const text = result.result.content[0].text;
  return JSON.parse(text);
}

function startMockBridge() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(body);
      received.push({
        authorization: req.headers.authorization || '',
        body: parsed
      });
      let responsePayload = {
        ok: true,
        action: parsed.type
      };
      if (parsed.type === RequestType.PERMISSION_LIST) {
        responsePayload = {
          ok: true,
          action: 'permission.list',
          requests: [{
            agentId: 'agt-smoke',
            requestId: 'perm-smoke',
            status: 'pending'
          }],
          totalCount: 1,
          pendingCount: 1
        };
      } else if (parsed.type === RequestType.SERVER_INFO_GET) {
        responsePayload = {
          serverInfo: {
            serverId: 'server-smoke',
            protocolVersion: 'agent-bridge.v2',
            features: {
              mcpHost: true,
              fileTransferBinaryFrames: true
            }
          }
        };
      } else if (parsed.type === RequestType.CAPABILITIES_GET) {
        responsePayload = {
          protocolVersion: 'agent-bridge.v2',
          providers: [{
            providerId: 'mock',
            displayName: 'Mock'
          }],
          serverInfo: {
            serverId: 'server-smoke',
            features: {
              mcpHost: true
            }
          }
        };
      } else if (parsed.type === RequestType.NOTIFICATION_LIST) {
        responsePayload = {
          ok: true,
          action: 'notification.list',
          notifications: [{
            notificationId: 'ntf-smoke',
            kind: 'permission',
            read: false
          }],
          totalCount: 1,
          unreadCount: 1,
          prunedCount: 0
        };
      } else if (parsed.type === RequestType.NOTIFICATION_PRUNE) {
        responsePayload = {
          ok: true,
          action: 'notification.prune',
          removedCount: 1,
          remainingCount: 0,
          unreadCount: 0
        };
      } else if (parsed.type === RequestType.CHECKPOINT_LIST) {
        responsePayload = {
          ok: true,
          action: 'checkpoint.list',
          agentId: parsed.payload.agentId,
          checkpoints: [{
            checkpointId: 'chk-smoke',
            agentId: parsed.payload.agentId,
            title: 'Smoke checkpoint'
          }]
        };
      } else if (parsed.type === RequestType.AGENT_ATTACH) {
        responsePayload = {
          ok: true,
          action: 'agent.attach',
          attached: true,
          agent: {
            agentId: parsed.payload.agentId,
            status: 'running'
          },
          runtime: {
            interactiveReady: true,
            sessionState: 'running'
          },
          recentOutputTail: 'agent attach smoke tail'
        };
      } else if (parsed.type === RequestType.AGENT_MODE_SET) {
        responsePayload = {
          ok: true,
          action: 'agent.mode.set',
          agent: {
            agentId: parsed.payload.agentId,
            modeId: parsed.payload.modeId,
            thinkingOptionId: parsed.payload.thinkingOptionId
          }
        };
      } else if (parsed.type === RequestType.TIMELINE_FETCH) {
        responsePayload = {
          ok: true,
          action: 'timeline.fetch',
          agentId: parsed.payload.agentId,
          items: [{
            seq: 3,
            kind: 'message',
            text: 'timeline smoke'
          }],
          nextCursor: 'cursor-smoke'
        };
      } else if (parsed.type === RequestType.AGENT_FORK) {
        responsePayload = {
          ok: true,
          action: 'agent.fork',
          parent: {
            agentId: parsed.payload.agentId
          },
          agent: {
            agentId: 'agt-fork-smoke',
            parentAgentId: parsed.payload.agentId
          }
        };
      } else if (parsed.type === RequestType.TERMINAL_CAPTURE) {
        responsePayload = {
          ok: true,
          action: 'terminal.capture',
          terminalId: parsed.payload.terminalId,
          text: 'terminal smoke output',
          source: 'memory',
          truncated: false,
          bytes: 21
        };
      } else if (parsed.type === RequestType.TERMINAL_SUBSCRIBE) {
        responsePayload = {
          ok: true,
          action: 'terminal.subscribe',
          terminal: {
            terminalId: parsed.payload.terminalId,
            status: 'running',
            snapshotSource: 'memory',
            restoreSeq: 2
          },
          slot: 1
        };
      } else if (parsed.type === RequestType.TERMINAL_HOOK_STATUS) {
        responsePayload = {
          ok: true,
          action: 'terminal.hook.status',
          shell: parsed.payload.shell,
          installed: false,
          profilePath: 'C:\\Users\\Smoke\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1',
          confirmRequired: false
        };
      } else if (parsed.type === RequestType.PROVIDER_PROFILE_LIST) {
        responsePayload = {
          ok: true,
          action: 'provider.profile.list',
          profiles: [{
            profileId: 'profile-smoke',
            providerId: 'profile-smoke',
            displayName: 'Smoke Provider',
            enabled: true
          }],
          totalCount: 1
        };
      } else if (parsed.type === RequestType.PROVIDER_ACP_DISCOVER) {
        responsePayload = {
          ok: true,
          action: 'provider.acp.discover',
          path: parsed.payload.path,
          validationReport: {
            scanned: 1,
            accepted: 1,
            rejected: 0,
            duplicates: 0,
            warnings: [],
            errors: []
          },
          providers: [{
            profileId: 'acp-smoke',
            displayName: 'ACP Smoke'
          }]
        };
      } else if (parsed.type === RequestType.PROVIDER_CATALOG_REFRESH) {
        responsePayload = {
          ok: true,
          action: 'provider.catalog.refresh',
          cacheStatus: 'refreshed',
          reason: parsed.payload.reason || 'smoke',
          providers: [{
            providerId: 'mock',
            capabilityStatus: 'ready'
          }],
          degradedProviderCount: 0
        };
      } else if (parsed.type === RequestType.WORKSPACE_REGISTRY_SUGGESTIONS) {
        responsePayload = {
          ok: true,
          action: 'workspace.registry.suggestions',
          suggestions: [{
            cwd: 'C:\\Smoke\\Workspace',
            displayName: 'Workspace'
          }],
          totalCount: 1
        };
      } else if (parsed.type === RequestType.WORKSPACE_REGISTRY_ARCHIVE) {
        responsePayload = {
          ok: true,
          action: 'workspace.registry.archive',
          workspaceId: parsed.payload.workspaceId,
          preview: parsed.payload.preview === true,
          confirmed: parsed.payload.confirm === true,
          archived: parsed.payload.confirm === true
        };
      } else if (parsed.type === RequestType.PROJECT_REGISTRY_LIST) {
        responsePayload = {
          ok: true,
          action: 'project.registry.list',
          projects: [{
            projectId: 'project-smoke',
            displayName: 'Project Smoke'
          }]
        };
      } else if (parsed.type === RequestType.WORKSPACE_CHANGES_GET) {
        responsePayload = {
          ok: true,
          action: 'workspace.changes.get',
          cwd: parsed.payload.cwd,
          files: [{
            path: 'src/smoke.js',
            status: 'modified'
          }],
          changedFiles: 1
        };
      } else if (parsed.type === RequestType.WORKSPACE_FILE_GET) {
        responsePayload = {
          ok: true,
          action: 'workspace.file.get',
          preview: {
            path: parsed.payload.filePath || parsed.payload.path,
            text: 'console.log("smoke");',
            truncated: false
          }
        };
      } else if (parsed.type === RequestType.FILE_TRANSFER_UPLOAD) {
        responsePayload = {
          ok: true,
          action: 'file.transfer.upload',
          available: true,
          accepted: true,
          ready: true,
          requestId: parsed.payload.requestId,
          workspaceId: parsed.payload.workspaceId,
          path: parsed.payload.path || parsed.payload.relativePath
        };
      } else if (parsed.type === RequestType.FILE_TRANSFER_CANCEL) {
        responsePayload = {
          ok: true,
          action: 'file.transfer.cancel',
          canceled: true,
          requestId: parsed.payload.requestId
        };
      } else if (parsed.type === RequestType.WORKSPACE_GIT_PULL) {
        responsePayload = {
          ok: true,
          action: 'workspace.git.pull',
          cwd: parsed.payload.cwd,
          remoteName: parsed.payload.remoteName || 'origin',
          branchName: parsed.payload.branchName || 'main',
          conflictSummary: {
            hasConflicts: false,
            count: 0,
            files: []
          }
        };
      } else if (parsed.type === RequestType.WORKSPACE_GIT_SUBSCRIBE) {
        responsePayload = {
          ok: true,
          action: 'workspace.git.subscribe',
          subscriptionId: parsed.payload.subscriptionId || 'sub-smoke',
          status: parsed.payload.action || 'active',
          paused: parsed.payload.action === 'pause',
          changesCount: 0
        };
      } else if (parsed.type === RequestType.GITHUB_PR_STATUS) {
        responsePayload = {
          ok: true,
          action: 'github.pr.status',
          owner: parsed.payload.owner,
          repo: parsed.payload.repo,
          repository: parsed.payload.owner + '/' + parsed.payload.repo,
          number: parsed.payload.number,
          state: 'open',
          title: 'Smoke PR',
          url: 'https://github.example/smoke/repo/pull/' + String(parsed.payload.number)
        };
      } else if (parsed.type === RequestType.GITHUB_CHECKS_LIST) {
        responsePayload = {
          ok: true,
          action: 'github.checks.list',
          owner: parsed.payload.owner,
          repo: parsed.payload.repo,
          repository: parsed.payload.owner + '/' + parsed.payload.repo,
          sha: parsed.payload.sha,
          checksSummary: {
            passed: 1,
            failed: 0,
            pending: 0,
            cancelled: 0
          }
        };
      } else if (parsed.type === RequestType.DAEMON_STATUS) {
        responsePayload = {
          ok: true,
          action: 'daemon.status',
          status: 'running',
          health: 'ok',
          checks: [{
            id: 'daemon_log_path',
            status: 'ok',
            message: 'log path writable'
          }]
        };
      } else if (parsed.type === RequestType.DAEMON_LOGS) {
        responsePayload = {
          ok: true,
          action: 'daemon.logs',
          maxBytes: parsed.payload.maxBytes,
          text: 'daemon smoke log',
          truncated: false
        };
      } else if (parsed.type === RequestType.SECURITY_DEVICE_LIST) {
        responsePayload = {
          ok: true,
          action: 'security.device.list',
          devices: [{
            deviceId: 'device-smoke',
            trusted: true
          }],
          totalCount: 1
        };
      } else if (parsed.type === RequestType.SECURITY_HOSTS_STATUS) {
        responsePayload = {
          ok: true,
          action: 'security.hosts.status',
          hosts: ['127.0.0.1', 'localhost'],
          wildcardAllowed: false
        };
      }
      const response = {
        id: parsed.id,
        type: 'response',
        ok: true,
        payload: responsePayload
      };
      res.writeHead(200, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify({
        ok: true,
        response,
        messages: [response]
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        received,
        url: 'http://127.0.0.1:' + String(address.port)
      });
    });
  });
}

async function main() {
  const store = createDaemonStore(tempHome);
  const manager = new McpHostManager({
    store,
    config: {
      host: '127.0.0.1',
      port: 8787,
      token: 'test-token'
    }
  });

  const tools = manager.listTools();
  assert.strictEqual(tools.ok, true);
  assert.ok(tools.tools.length >= 8);
  for (const tool of mcpToolDefinitions()) {
    if (tool.annotations.destructiveHint) {
      assert.strictEqual(tool.inputSchema.properties.confirm.type, 'boolean', tool.name + ' must expose confirm');
      assert.strictEqual(tool._meta['ngf/confirmationRequired'], true, tool.name + ' must expose confirmation metadata');
    }
  }
  const agentListTool = mcpToolDefinitions().find((tool) => tool.name === 'agent_list');
  const gitPullTool = mcpToolDefinitions().find((tool) => tool.name === 'workspace_git_pull');
  assert.strictEqual(agentListTool.annotations.readOnlyHint, true);
  assert.strictEqual(agentListTool.annotations.destructiveHint, false);
  assert.strictEqual(gitPullTool.annotations.readOnlyHint, false);
  assert.strictEqual(gitPullTool.annotations.destructiveHint, true);
  assert.strictEqual(gitPullTool.inputSchema.properties.confirm.type, 'boolean');
  assert.strictEqual(gitPullTool.inputSchema.properties.planId.type, 'string');
  assert.strictEqual(gitPullTool._meta['ngf/riskLevel'], 'high');
  assert.strictEqual(gitPullTool._meta['ngf/confirmationRequired'], true);
  assert.strictEqual(toolAccessPolicy('workspace_git_pull').confirmationRequired, true);
  assert.strictEqual(toolConfirmationFailure('workspace_git_pull', {}), null);
  assert.strictEqual(toolConfirmationFailure('workspace_git_pull', { confirm: true }).failureCategory, 'git_plan_required');
  assert.strictEqual(toolConfirmationFailure('workspace_git_pull', { confirm: true, planId: 'git-plan-smoke' }), null);
  assert.strictEqual(toolConfirmationFailure('workspace_git_push', { force: true }), null);
  assert.strictEqual(toolConfirmationFailure('workspace_git_branch', { action: 'delete' }), null);
  assert.strictEqual(toolConfirmationFailure('workspace_git_stash', { action: 'drop' }), null);
  assert.strictEqual(toolConfirmationFailure('workspace_git_merge', { ref: 'main' }), null);
  assert.strictEqual(toolConfirmationFailure('checkpoint_restore', { dryRun: true }), null);
  assert.strictEqual(toolConfirmationFailure('provider_acp_import', { confirm: false }), null);
  assert.strictEqual(toolConfirmationFailure('file_transfer_upload', { overwrite: false }), null);
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'server_info_get'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'capabilities_get'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_run'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_attach'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_stop'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_resume'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_update'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_mode_set'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_model_set'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_attention_clear'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_fork'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'agent_detach'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'timeline_fetch'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'timeline_ack'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'checkpoint_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'checkpoint_create'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'checkpoint_restore'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'permission_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'permission_respond'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'notification_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'notification_read'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'notification_action'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'notification_prune'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_capture'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_subscribe'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_unsubscribe'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_rename'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_kill'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_hook_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'terminal_hook_install'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_catalog'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_catalog_refresh'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_profile_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_profile_upsert'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_profile_delete'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_profile_test'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_acp_discover'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'provider_acp_import'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_create'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_import'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_upsert'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_archive'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_open'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_suggestions'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_registry_doctor'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'project_registry_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_changes_get'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_diff_get'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_files_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_file_get'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_file_download'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'attachment_file_download'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'file_transfer_download'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'file_transfer_upload'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'file_transfer_cancel'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_stage'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_unstage'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_discard'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_commit'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_pull'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_push'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_branch'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_stash'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_merge'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'workspace_git_subscribe'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'worktree_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'worktree_create'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'worktree_archive'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_pr_create'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_pr_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_pr_merge'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_checks_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_issue_search'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'github_issue_attachment_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_pairing_start'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_pairing_cancel'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_connect'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_disconnect'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_device_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_device_revoke'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'relay_identity_rotate'));
  for (const toolName of [
    'schedule_status', 'schedule_list', 'schedule_get', 'schedule_history', 'schedule_create', 'schedule_update',
    'schedule_enable', 'schedule_disable', 'schedule_run_now', 'schedule_remove', 'loop_status', 'loop_list',
    'loop_get', 'loop_rounds', 'loop_create', 'loop_update', 'loop_start', 'loop_pause', 'loop_resume',
    'loop_stop', 'loop_takeover', 'loop_remove', 'chat_room_status', 'chat_room_list', 'chat_room_get',
    'chat_room_create', 'chat_room_update', 'chat_room_archive', 'chat_room_member_add', 'chat_room_member_update',
    'chat_room_member_remove', 'chat_room_message_post', 'chat_room_message_list', 'chat_room_ack'
  ]) {
    assert.ok(mcpToolDefinitions().some((tool) => tool.name === toolName), 'missing M7 MCP tool: ' + toolName);
  }
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_health'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_start'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_stop'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_restart'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_logs'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_autostart_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_autostart_preview'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_autostart_set'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_autostart_install'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'daemon_autostart_uninstall'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_device_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_device_trust'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_device_revoke'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_audit_list'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_tls_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_tls_set'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_hosts_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_hosts_set'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_token_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_token_rotate'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_auth_status'));
  assert.ok(mcpToolDefinitions().some((tool) => tool.name === 'security_auth_set'));
  assert.strictEqual(toolRequestType('server_info_get', {}).type, RequestType.SERVER_INFO_GET);
  assert.strictEqual(toolRequestType('capabilities_get', {}).type, RequestType.CAPABILITIES_GET);
  assert.strictEqual(toolRequestType('agent_run', { text: 'hello' }).type, RequestType.AGENT_RUN);
  assert.strictEqual(toolRequestType('agent_attach', { agentId: 'agt-smoke' }).type, RequestType.AGENT_ATTACH);
  assert.strictEqual(toolRequestType('agent_fork', { agentId: 'agt-smoke' }).type, RequestType.AGENT_FORK);
  assert.strictEqual(toolRequestType('agent_detach', { agentId: 'agt-smoke' }).type, RequestType.AGENT_DETACH);
  assert.strictEqual(toolRequestType('agent_stop', { agentId: 'agt-smoke' }).type, RequestType.AGENT_STOP);
  assert.strictEqual(toolRequestType('agent_resume', { agentId: 'agt-smoke' }).type, RequestType.AGENT_RESUME);
  assert.strictEqual(toolRequestType('agent_update', { agentId: 'agt-smoke', title: 'Smoke' }).type, RequestType.AGENT_UPDATE);
  assert.strictEqual(toolRequestType('agent_mode_set', { agentId: 'agt-smoke', modeId: 'fast' }).type, RequestType.AGENT_MODE_SET);
  assert.strictEqual(toolRequestType('agent_model_set', { agentId: 'agt-smoke', modelId: 'model-smoke' }).type, RequestType.AGENT_MODEL_SET);
  assert.strictEqual(toolRequestType('agent_attention_clear', { agentId: 'agt-smoke' }).type, RequestType.AGENT_ATTENTION_CLEAR);
  assert.strictEqual(toolRequestType('timeline_fetch', { agentId: 'agt-smoke' }).type, RequestType.TIMELINE_FETCH);
  assert.strictEqual(toolRequestType('timeline_ack', { agentId: 'agt-smoke', latestSeq: 3 }).type, RequestType.TIMELINE_ACK);
  assert.strictEqual(toolRequestType('checkpoint_list', { agentId: 'agt-smoke' }).type, RequestType.CHECKPOINT_LIST);
  assert.strictEqual(toolRequestType('checkpoint_create', { agentId: 'agt-smoke' }).type, RequestType.CHECKPOINT_CREATE);
  assert.strictEqual(toolRequestType('checkpoint_restore', { agentId: 'agt-smoke', checkpointId: 'chk-smoke' }).type, RequestType.CHECKPOINT_RESTORE);
  assert.strictEqual(toolRequestType('permission_list', {}).type, RequestType.PERMISSION_LIST);
  assert.strictEqual(toolRequestType('permission_respond', { requestId: 'perm-smoke', reply: 'once' }).type, RequestType.PERMISSION_RESPOND);
  assert.strictEqual(toolRequestType('notification_list', {}).type, RequestType.NOTIFICATION_LIST);
  assert.strictEqual(toolRequestType('notification_read', { notificationId: 'ntf-smoke' }).type, RequestType.NOTIFICATION_READ);
  assert.strictEqual(toolRequestType('notification_action', { notificationId: 'ntf-smoke', actionId: 'open' }).type, RequestType.NOTIFICATION_ACTION);
  assert.strictEqual(toolRequestType('notification_prune', {}).type, RequestType.NOTIFICATION_PRUNE);
  assert.strictEqual(toolRequestType('terminal_capture', { terminalId: 'term-smoke' }).type, RequestType.TERMINAL_CAPTURE);
  assert.strictEqual(toolRequestType('terminal_subscribe', { terminalId: 'term-smoke' }).type, RequestType.TERMINAL_SUBSCRIBE);
  assert.strictEqual(toolRequestType('terminal_unsubscribe', { terminalId: 'term-smoke' }).type, RequestType.TERMINAL_UNSUBSCRIBE);
  assert.strictEqual(toolRequestType('terminal_rename', { terminalId: 'term-smoke', title: 'Smoke' }).type, RequestType.TERMINAL_RENAME);
  assert.strictEqual(toolRequestType('terminal_kill', { terminalId: 'term-smoke' }).type, RequestType.TERMINAL_KILL);
  assert.strictEqual(toolRequestType('terminal_hook_status', { shell: 'powershell' }).type, RequestType.TERMINAL_HOOK_STATUS);
  assert.strictEqual(toolRequestType('terminal_hook_install', { shell: 'powershell', confirm: false }).type, RequestType.TERMINAL_HOOK_INSTALL);
  assert.strictEqual(toolRequestType('provider_catalog', {}).type, RequestType.PROVIDER_CATALOG);
  assert.strictEqual(toolRequestType('provider_catalog', { refresh: true }).type, RequestType.PROVIDER_CATALOG_REFRESH);
  assert.strictEqual(toolRequestType('provider_catalog_refresh', { reason: 'smoke' }).type, RequestType.PROVIDER_CATALOG_REFRESH);
  assert.strictEqual(toolRequestType('provider_profile_list', {}).type, RequestType.PROVIDER_PROFILE_LIST);
  assert.strictEqual(toolRequestType('provider_profile_upsert', { profileId: 'profile-smoke' }).type, RequestType.PROVIDER_PROFILE_UPSERT);
  assert.strictEqual(toolRequestType('provider_profile_delete', { profileId: 'profile-smoke' }).type, RequestType.PROVIDER_PROFILE_DELETE);
  assert.strictEqual(toolRequestType('provider_profile_test', { profileId: 'profile-smoke' }).type, RequestType.PROVIDER_PROFILE_TEST);
  assert.strictEqual(toolRequestType('provider_acp_discover', { path: 'C:\\Smoke\\catalog.json' }).type, RequestType.PROVIDER_ACP_DISCOVER);
  assert.strictEqual(toolRequestType('provider_acp_import', { path: 'C:\\Smoke\\catalog.json', confirm: false }).type, RequestType.PROVIDER_ACP_IMPORT);
  assert.strictEqual(toolRequestType('workspace_registry_list', {}).type, RequestType.WORKSPACE_REGISTRY_LIST);
  assert.strictEqual(toolRequestType('workspace_registry_create', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_REGISTRY_CREATE);
  assert.strictEqual(toolRequestType('workspace_registry_import', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_REGISTRY_IMPORT);
  assert.strictEqual(toolRequestType('workspace_registry_upsert', { workspaceId: 'ws-smoke' }).type, RequestType.WORKSPACE_REGISTRY_UPSERT);
  assert.strictEqual(toolRequestType('workspace_registry_archive', { workspaceId: 'ws-smoke' }).type, RequestType.WORKSPACE_REGISTRY_ARCHIVE);
  assert.strictEqual(toolRequestType('workspace_registry_open', { workspaceId: 'ws-smoke' }).type, RequestType.WORKSPACE_REGISTRY_OPEN);
  assert.strictEqual(toolRequestType('workspace_registry_suggestions', {}).type, RequestType.WORKSPACE_REGISTRY_SUGGESTIONS);
  assert.strictEqual(toolRequestType('workspace_registry_doctor', {}).type, RequestType.WORKSPACE_REGISTRY_DOCTOR);
  assert.strictEqual(toolRequestType('project_registry_list', {}).type, RequestType.PROJECT_REGISTRY_LIST);
  assert.strictEqual(toolRequestType('workspace_changes_get', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_CHANGES_GET);
  assert.strictEqual(toolRequestType('workspace_diff_get', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_DIFF_GET);
  assert.strictEqual(toolRequestType('workspace_files_list', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_FILES_LIST);
  assert.strictEqual(toolRequestType('workspace_file_get', { cwd: 'C:\\Smoke\\Workspace', filePath: 'src/smoke.js' }).type, RequestType.WORKSPACE_FILE_GET);
  assert.strictEqual(toolRequestType('workspace_file_download', { cwd: 'C:\\Smoke\\Workspace', filePath: 'src/smoke.js' }).type, RequestType.WORKSPACE_FILE_DOWNLOAD);
  assert.strictEqual(toolRequestType('attachment_file_download', { attachmentId: 'att-smoke' }).type, RequestType.ATTACHMENT_FILE_DOWNLOAD);
  assert.strictEqual(toolRequestType('file_transfer_download', { requestId: 'xfer-smoke' }).type, RequestType.FILE_TRANSFER_DOWNLOAD);
  assert.strictEqual(toolRequestType('file_transfer_upload', { requestId: 'xfer-smoke' }).type, RequestType.FILE_TRANSFER_UPLOAD);
  assert.strictEqual(toolRequestType('file_transfer_cancel', { requestId: 'xfer-smoke' }).type, RequestType.FILE_TRANSFER_CANCEL);
  assert.strictEqual(toolRequestType('workspace_git_stage', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_GIT_STAGE);
  assert.strictEqual(toolRequestType('workspace_git_unstage', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_GIT_UNSTAGE);
  assert.strictEqual(toolRequestType('workspace_git_discard', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_GIT_DISCARD);
  assert.strictEqual(toolRequestType('workspace_git_commit', { cwd: 'C:\\Smoke\\Workspace', message: 'Smoke' }).type, RequestType.WORKSPACE_GIT_COMMIT);
  const gitPullRequest = toolRequestType('workspace_git_pull', {
    cwd: 'C:\\Smoke\\Workspace',
    remoteName: 'origin',
    branchName: 'main',
    planId: 'git-plan-smoke',
    confirm: true
  });
  assert.strictEqual(gitPullRequest.type, RequestType.WORKSPACE_GIT_PULL);
  assert.strictEqual(gitPullRequest.payload.remote, 'origin');
  assert.strictEqual(gitPullRequest.payload.branch, 'main');
  assert.strictEqual(gitPullRequest.payload.planId, 'git-plan-smoke');
  assert.strictEqual(toolRequestType('workspace_git_push', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_GIT_PUSH);
  assert.strictEqual(toolRequestType('workspace_git_branch', { cwd: 'C:\\Smoke\\Workspace', action: 'delete', branchName: 'old' }).payload.name, 'old');
  assert.strictEqual(toolRequestType('workspace_git_stash', { cwd: 'C:\\Smoke\\Workspace', pop: true }).payload.action, 'pop');
  assert.strictEqual(toolRequestType('workspace_git_merge', { cwd: 'C:\\Smoke\\Workspace', ref: 'main' }).type, RequestType.WORKSPACE_GIT_MERGE);
  assert.strictEqual(toolRequestType('workspace_git_subscribe', { cwd: 'C:\\Smoke\\Workspace' }).type, RequestType.WORKSPACE_GIT_SUBSCRIBE);
  assert.strictEqual(toolRequestType('worktree_list', { workspacePath: 'C:\\Smoke\\Repo' }).type, RequestType.WORKTREE_LIST);
  assert.strictEqual(toolRequestType('worktree_create', { workspacePath: 'C:\\Smoke\\Repo', worktreePath: 'C:\\Smoke\\Repo-wt' }).type, RequestType.WORKTREE_CREATE);
  assert.strictEqual(toolRequestType('worktree_archive', { worktreePath: '/tmp/wt' }).type, RequestType.WORKTREE_ARCHIVE);
  assert.strictEqual(toolRequestType('github_pr_create', { head: 'feature', base: 'main', title: 'Smoke' }).type, RequestType.GITHUB_PR_CREATE);
  assert.strictEqual(toolRequestType('github_pr_status', { owner: 'smoke', repo: 'repo', number: 3 }).type, RequestType.GITHUB_PR_STATUS);
  assert.strictEqual(toolRequestType('github_pr_merge', { owner: 'smoke', repo: 'repo', number: 3 }).type, RequestType.GITHUB_PR_MERGE);
  assert.strictEqual(toolRequestType('github_checks_list', { owner: 'smoke', repo: 'repo', sha: 'abc123' }).type, RequestType.GITHUB_CHECKS_LIST);
  assert.strictEqual(toolRequestType('github_issue_search', { owner: 'smoke', repo: 'repo', keyword: 'bug' }).type, RequestType.GITHUB_ISSUE_SEARCH);
  assert.strictEqual(toolRequestType('github_issue_attachment_list', { owner: 'smoke', repo: 'repo', number: 5 }).type, RequestType.GITHUB_ISSUE_ATTACHMENT_LIST);
  assert.strictEqual(toolRequestType('provider_usage_list', { providerId: 'codex', sessionId: 's1', window: 'day' }).type, RequestType.PROVIDER_USAGE_LIST);
  assert.strictEqual(toolAccessPolicy('provider_usage_list').readOnlyHint, true);
  assert.strictEqual(toolAccessPolicy('provider_usage_list').openWorldHint, false);
  assert.strictEqual(toolRequestType('metadata_generate', { sessionId: 's1', kind: 'sessionTitle' }).type, RequestType.METADATA_GENERATE);
  assert.strictEqual(toolRequestType('metadata_generate_cancel', { requestId: 'metadata-request' }).type, RequestType.METADATA_GENERATE_CANCEL);
  assert.strictEqual(toolAccessPolicy('metadata_generate_cancel').readOnlyHint, false);
  assert.strictEqual(toolAccessPolicy('metadata_generate_cancel').destructiveHint, false);
  assert.strictEqual(toolConfirmationFailure('metadata_generate_cancel', { requestId: 'metadata-request' }), null);
  assert.strictEqual(toolRequestType('relay_status', {}).type, RequestType.RELAY_STATUS);
  assert.strictEqual(toolRequestType('relay_pairing_start', { relayUrl: 'wss://relay.invalid/ws', confirm: true }).type, RequestType.RELAY_PAIRING_START);
  assert.strictEqual(toolRequestType('relay_pairing_cancel', { confirm: true }).type, RequestType.RELAY_PAIRING_CANCEL);
  assert.strictEqual(toolRequestType('relay_connect', { confirm: true }).type, RequestType.RELAY_CONNECT);
  assert.strictEqual(toolRequestType('relay_disconnect', { confirm: true }).type, RequestType.RELAY_DISCONNECT);
  assert.strictEqual(toolRequestType('relay_device_list', {}).type, RequestType.RELAY_DEVICE_LIST);
  assert.strictEqual(toolRequestType('relay_device_revoke', { deviceId: 'relay-device', confirm: true }).type, RequestType.RELAY_DEVICE_REVOKE);
  assert.strictEqual(toolRequestType('relay_identity_rotate', { confirm: true }).type, RequestType.RELAY_IDENTITY_ROTATE);
  assert.strictEqual(toolAccessPolicy('relay_status').readOnlyHint, true);
  assert.strictEqual(toolAccessPolicy('relay_pairing_start').openWorldHint, true);
  assert.strictEqual(toolConfirmationFailure('relay_pairing_start', {}).failureCategory, 'confirmation_required');
  assert.strictEqual(toolConfirmationFailure('relay_device_revoke', { deviceId: 'relay-device' }), null);
  assert.strictEqual(toolConfirmationFailure('relay_identity_rotate', {}), null);
  assert.strictEqual(toolRequestType('schedule_list', {}).type, RequestType.SCHEDULE_LIST);
  assert.strictEqual(toolRequestType('schedule_run_now', { scheduleId: 'sch-smoke' }).type, RequestType.SCHEDULE_RUN_NOW);
  assert.strictEqual(toolRequestType('loop_start', { loopId: 'loop-smoke' }).type, RequestType.LOOP_START);
  assert.strictEqual(toolRequestType('loop_rounds', { loopId: 'loop-smoke' }).type, RequestType.LOOP_ROUNDS);
  assert.strictEqual(toolRequestType('chat_room_message_post', { roomId: 'room-smoke', body: 'hello' }).type, RequestType.CHAT_ROOM_MESSAGE_POST);
  assert.strictEqual(toolRequestType('chat_room_ack', { roomId: 'room-smoke', lastSeq: 2 }).type, RequestType.CHAT_ROOM_ACK);
  assert.strictEqual(toolAccessPolicy('schedule_list').readOnlyHint, true);
  assert.strictEqual(toolAccessPolicy('schedule_run_now').openWorldHint, true);
  assert.strictEqual(toolAccessPolicy('chat_room_message_post').destructiveHint, true);
  assert.strictEqual(toolConfirmationFailure('schedule_run_now', { scheduleId: 'sch-smoke' }), null, 'schedule preview must reach Bridge');
  assert.strictEqual(toolConfirmationFailure('loop_pause', { loopId: 'loop-smoke' }).failureCategory, 'confirmation_required');
  assert.strictEqual(toolConfirmationFailure('chat_room_message_post', { roomId: 'room-smoke', body: 'hello' }).failureCategory, 'confirmation_required');
  assert.strictEqual(toolRequestType('daemon_status', {}).type, RequestType.DAEMON_STATUS);
  assert.strictEqual(toolRequestType('daemon_health', {}).type, RequestType.DAEMON_HEALTH);
  assert.strictEqual(toolRequestType('daemon_start', { detached: true }).type, RequestType.DAEMON_START);
  assert.strictEqual(toolRequestType('daemon_stop', { confirm: true }).type, RequestType.DAEMON_STOP);
  assert.strictEqual(toolRequestType('daemon_restart', { confirm: true }).type, RequestType.DAEMON_RESTART);
  assert.strictEqual(toolRequestType('daemon_logs', { maxBytes: 1024 }).type, RequestType.DAEMON_LOGS);
  assert.strictEqual(toolRequestType('daemon_autostart_status', {}).type, RequestType.DAEMON_AUTOSTART_STATUS);
  assert.strictEqual(toolRequestType('daemon_autostart_preview', { enabled: true }).type, RequestType.DAEMON_AUTOSTART_PREVIEW);
  assert.strictEqual(toolRequestType('daemon_autostart_set', { enabled: true, confirm: true }).type, RequestType.DAEMON_AUTOSTART_SET);
  assert.strictEqual(toolRequestType('daemon_autostart_install', { method: 'auto', confirm: true }).type, RequestType.DAEMON_AUTOSTART_INSTALL);
  assert.strictEqual(toolRequestType('daemon_autostart_uninstall', { method: 'auto', confirm: true }).type, RequestType.DAEMON_AUTOSTART_UNINSTALL);
  assert.strictEqual(toolRequestType('daemon_update_status', {}).type, RequestType.DAEMON_UPDATE_STATUS);
  assert.strictEqual(toolRequestType('daemon_update_check', { channel: 'latest' }).type, RequestType.DAEMON_UPDATE_CHECK);
  assert.strictEqual(toolRequestType('daemon_update_preview', { channel: 'latest' }).type, RequestType.DAEMON_UPDATE_PREVIEW);
  assert.strictEqual(toolRequestType('daemon_update_install', { channel: 'latest', confirm: true }).type, RequestType.DAEMON_UPDATE_INSTALL);
  assert.strictEqual(toolRequestType('daemon_update_rollback', { confirm: true }).type, RequestType.DAEMON_UPDATE_ROLLBACK);
  assert.strictEqual(toolAccessPolicy('daemon_update_status').readOnlyHint, true);
  assert.strictEqual(toolAccessPolicy('daemon_update_check').readOnlyHint, true);
  assert.strictEqual(toolAccessPolicy('daemon_update_install').destructiveHint, true);
  assert.strictEqual(toolAccessPolicy('daemon_update_install').confirmationRequired, true);
  assert.strictEqual(toolAccessPolicy('daemon_update_rollback').destructiveHint, true);
  assert.strictEqual(toolAccessPolicy('daemon_update_rollback').confirmationRequired, true);
  assert.strictEqual(toolRequestType('security_device_list', {}).type, RequestType.SECURITY_DEVICE_LIST);
  assert.strictEqual(toolRequestType('security_device_trust', { deviceId: 'device-smoke' }).type, RequestType.SECURITY_DEVICE_TRUST);
  assert.strictEqual(toolRequestType('security_device_revoke', { deviceId: 'device-smoke' }).type, RequestType.SECURITY_DEVICE_REVOKE);
  assert.strictEqual(toolRequestType('security_audit_list', { limit: 5 }).type, RequestType.SECURITY_AUDIT_LIST);
  assert.strictEqual(toolRequestType('security_tls_status', {}).type, RequestType.SECURITY_TLS_STATUS);
  assert.strictEqual(toolRequestType('security_tls_set', { enabled: false }).type, RequestType.SECURITY_TLS_SET);
  assert.strictEqual(toolRequestType('security_hosts_status', {}).type, RequestType.SECURITY_HOSTS_STATUS);
  assert.strictEqual(toolRequestType('security_hosts_set', { hosts: ['127.0.0.1'] }).type, RequestType.SECURITY_HOSTS_SET);
  assert.strictEqual(toolRequestType('security_token_status', {}).type, RequestType.SECURITY_TOKEN_STATUS);
  assert.strictEqual(toolRequestType('security_token_rotate', { confirm: true }).type, RequestType.SECURITY_TOKEN_ROTATE);
  assert.strictEqual(toolRequestType('security_auth_status', {}).type, RequestType.SECURITY_AUTH_STATUS);
  assert.strictEqual(toolRequestType('security_auth_set', { mode: 'bearer' }).type, RequestType.SECURITY_AUTH_SET);

  const started = manager.start({ bridgeUrl: 'http://127.0.0.1:8787' });
  assert.strictEqual(started.ok, true);
  assert.strictEqual(started.active, true);
  assert.strictEqual(started.status, 'active');
  assert.ok(started.command.length > 0);
  assert.ok(started.args.length > 0);
  assert.strictEqual(started.tokenConfigured, true);

  const stopped = manager.stop({});
  assert.strictEqual(stopped.ok, true);
  assert.strictEqual(stopped.active, false);
  assert.strictEqual(stopped.status, 'stopped');

  const child = spawn(process.execPath, [path.join(repoRoot, 'src', 'mcp-stdio-server.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_TOKEN: '',
      AGENT_BRIDGE_MCP_BRIDGE_URL: 'http://127.0.0.1:1'
    })
  });
  const client = createMcpClient(child);
  const initialized = await client.request('initialize', {});
  assert.strictEqual(initialized.result.serverInfo.name, 'ngf-agent-bridge');
  const listed = await client.request('tools/list', {});
  assert.ok(Array.isArray(listed.result.tools));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'server_info_get'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'capabilities_get'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'agent_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'agent_attach'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'agent_fork'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'agent_mode_set'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'timeline_fetch'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'checkpoint_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'permission_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'notification_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'terminal_capture'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'terminal_subscribe'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'terminal_hook_status'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'provider_profile_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'provider_acp_discover'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_registry_suggestions'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_registry_archive'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'project_registry_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_changes_get'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_file_get'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'file_transfer_upload'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'file_transfer_cancel'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_git_pull'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'workspace_git_subscribe'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'worktree_create'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'github_pr_status'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'github_checks_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'daemon_status'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'security_device_list'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'security_hosts_status'));
  const callResult = await client.request('tools/call', {
    name: 'agent_list',
    arguments: {}
  });
  assert.ok(callResult.result.content[0].text.indexOf('auth_missing') >= 0);
  child.kill();

  const mockBridge = await startMockBridge();
  const permissionChild = spawn(process.execPath, [path.join(repoRoot, 'src', 'mcp-stdio-server.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_TOKEN: 'smoke-token',
      AGENT_BRIDGE_MCP_BRIDGE_URL: mockBridge.url
    })
  });
  const permissionClient = createMcpClient(permissionChild);
  await permissionClient.request('initialize', {});
  const serverInfoResult = await permissionClient.request('tools/call', {
    name: 'server_info_get',
    arguments: {}
  });
  const serverInfoPayload = parseToolText(serverInfoResult);
  assert.strictEqual(serverInfoPayload.payload.serverInfo.serverId, 'server-smoke');
  assert.strictEqual(serverInfoPayload.payload.serverInfo.features.fileTransferBinaryFrames, true);
  assert.strictEqual(mockBridge.received[0].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[0].body.type, RequestType.SERVER_INFO_GET);
  const capabilitiesResult = await permissionClient.request('tools/call', {
    name: 'capabilities_get',
    arguments: {}
  });
  const capabilitiesPayload = parseToolText(capabilitiesResult);
  assert.strictEqual(capabilitiesPayload.payload.providers[0].providerId, 'mock');
  assert.strictEqual(capabilitiesPayload.payload.serverInfo.features.mcpHost, true);
  assert.strictEqual(mockBridge.received[1].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[1].body.type, RequestType.CAPABILITIES_GET);
  const permissionResult = await permissionClient.request('tools/call', {
    name: 'permission_list',
    arguments: {
      limit: 5
    }
  });
  const permissionPayload = parseToolText(permissionResult);
  assert.strictEqual(permissionPayload.payload.action, 'permission.list');
  assert.strictEqual(permissionPayload.payload.pendingCount, 1);
  assert.strictEqual(mockBridge.received[2].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[2].body.type, RequestType.PERMISSION_LIST);
  const notificationResult = await permissionClient.request('tools/call', {
    name: 'notification_list',
    arguments: {
      includeRead: false,
      limit: 10
    }
  });
  const notificationPayload = parseToolText(notificationResult);
  assert.strictEqual(notificationPayload.payload.action, 'notification.list');
  assert.strictEqual(notificationPayload.payload.unreadCount, 1);
  assert.strictEqual(mockBridge.received[3].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[3].body.type, RequestType.NOTIFICATION_LIST);
  assert.strictEqual(mockBridge.received[3].body.payload.includeRead, false);
  const checkpointResult = await permissionClient.request('tools/call', {
    name: 'checkpoint_list',
    arguments: {
      agentId: 'agt-smoke'
    }
  });
  const checkpointPayload = parseToolText(checkpointResult);
  assert.strictEqual(checkpointPayload.payload.action, 'checkpoint.list');
  assert.strictEqual(checkpointPayload.payload.checkpoints[0].checkpointId, 'chk-smoke');
  assert.strictEqual(mockBridge.received[4].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[4].body.type, RequestType.CHECKPOINT_LIST);
  assert.strictEqual(mockBridge.received[4].body.payload.agentId, 'agt-smoke');
  const attachResult = await permissionClient.request('tools/call', {
    name: 'agent_attach',
    arguments: {
      agentId: 'agt-smoke'
    }
  });
  const attachPayload = parseToolText(attachResult);
  assert.strictEqual(attachPayload.payload.action, 'agent.attach');
  assert.strictEqual(attachPayload.payload.attached, true);
  assert.strictEqual(mockBridge.received[5].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[5].body.type, RequestType.AGENT_ATTACH);
  assert.strictEqual(mockBridge.received[5].body.payload.agentId, 'agt-smoke');
  const modeSetResult = await permissionClient.request('tools/call', {
    name: 'agent_mode_set',
    arguments: {
      agentId: 'agt-smoke',
      modeId: 'fast',
      thinkingOptionId: 'high'
    }
  });
  const modeSetPayload = parseToolText(modeSetResult);
  assert.strictEqual(modeSetPayload.payload.action, 'agent.mode.set');
  assert.strictEqual(modeSetPayload.payload.agent.modeId, 'fast');
  assert.strictEqual(mockBridge.received[6].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[6].body.type, RequestType.AGENT_MODE_SET);
  assert.strictEqual(mockBridge.received[6].body.payload.thinkingOptionId, 'high');
  const timelineResult = await permissionClient.request('tools/call', {
    name: 'timeline_fetch',
    arguments: {
      agentId: 'agt-smoke',
      limit: 10
    }
  });
  const timelinePayload = parseToolText(timelineResult);
  assert.strictEqual(timelinePayload.payload.action, 'timeline.fetch');
  assert.strictEqual(timelinePayload.payload.items[0].text, 'timeline smoke');
  assert.strictEqual(mockBridge.received[7].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[7].body.type, RequestType.TIMELINE_FETCH);
  assert.strictEqual(mockBridge.received[7].body.payload.limit, 10);
  const forkResult = await permissionClient.request('tools/call', {
    name: 'agent_fork',
    arguments: {
      agentId: 'agt-smoke',
      title: 'Fork smoke',
      boundaryMessageId: 'msg-boundary',
      timelineEpoch: 3,
      timelineSeq: 17
    }
  });
  const forkPayload = parseToolText(forkResult);
  assert.strictEqual(forkPayload.payload.action, 'agent.fork');
  assert.strictEqual(forkPayload.payload.agent.parentAgentId, 'agt-smoke');
  assert.strictEqual(mockBridge.received[8].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[8].body.type, RequestType.AGENT_FORK);
  assert.strictEqual(mockBridge.received[8].body.payload.title, 'Fork smoke');
  assert.strictEqual(mockBridge.received[8].body.payload.boundaryMessageId, 'msg-boundary');
  assert.strictEqual(mockBridge.received[8].body.payload.timelineEpoch, 3);
  assert.strictEqual(mockBridge.received[8].body.payload.timelineSeq, 17);
  const terminalCaptureResult = await permissionClient.request('tools/call', {
    name: 'terminal_capture',
    arguments: {
      terminalId: 'term-smoke',
      maxBytes: 128
    }
  });
  const terminalCapturePayload = parseToolText(terminalCaptureResult);
  assert.strictEqual(terminalCapturePayload.payload.action, 'terminal.capture');
  assert.strictEqual(terminalCapturePayload.payload.text, 'terminal smoke output');
  assert.strictEqual(mockBridge.received[9].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[9].body.type, RequestType.TERMINAL_CAPTURE);
  assert.strictEqual(mockBridge.received[9].body.payload.maxBytes, 128);
  const terminalSubscribeResult = await permissionClient.request('tools/call', {
    name: 'terminal_subscribe',
    arguments: {
      terminalId: 'term-smoke'
    }
  });
  const terminalSubscribePayload = parseToolText(terminalSubscribeResult);
  assert.strictEqual(terminalSubscribePayload.payload.action, 'terminal.subscribe');
  assert.strictEqual(terminalSubscribePayload.payload.terminal.restoreSeq, 2);
  assert.strictEqual(mockBridge.received[10].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[10].body.type, RequestType.TERMINAL_SUBSCRIBE);
  assert.strictEqual(mockBridge.received[10].body.payload.terminalId, 'term-smoke');
  const terminalHookResult = await permissionClient.request('tools/call', {
    name: 'terminal_hook_status',
    arguments: {
      shell: 'powershell'
    }
  });
  const terminalHookPayload = parseToolText(terminalHookResult);
  assert.strictEqual(terminalHookPayload.payload.action, 'terminal.hook.status');
  assert.strictEqual(terminalHookPayload.payload.shell, 'powershell');
  assert.strictEqual(mockBridge.received[11].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[11].body.type, RequestType.TERMINAL_HOOK_STATUS);
  assert.strictEqual(mockBridge.received[11].body.payload.shell, 'powershell');
  const providerProfileResult = await permissionClient.request('tools/call', {
    name: 'provider_profile_list',
    arguments: {
      includeDisabled: true
    }
  });
  const providerProfilePayload = parseToolText(providerProfileResult);
  assert.strictEqual(providerProfilePayload.payload.action, 'provider.profile.list');
  assert.strictEqual(providerProfilePayload.payload.profiles[0].profileId, 'profile-smoke');
  assert.strictEqual(mockBridge.received[12].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[12].body.type, RequestType.PROVIDER_PROFILE_LIST);
  assert.strictEqual(mockBridge.received[12].body.payload.includeDisabled, true);
  const acpDiscoverResult = await permissionClient.request('tools/call', {
    name: 'provider_acp_discover',
    arguments: {
      path: 'C:\\Smoke\\catalog.json'
    }
  });
  const acpDiscoverPayload = parseToolText(acpDiscoverResult);
  assert.strictEqual(acpDiscoverPayload.payload.action, 'provider.acp.discover');
  assert.strictEqual(acpDiscoverPayload.payload.validationReport.accepted, 1);
  assert.strictEqual(mockBridge.received[13].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[13].body.type, RequestType.PROVIDER_ACP_DISCOVER);
  assert.strictEqual(mockBridge.received[13].body.payload.path, 'C:\\Smoke\\catalog.json');
  const workspaceSuggestionsResult = await permissionClient.request('tools/call', {
    name: 'workspace_registry_suggestions',
    arguments: {
      limit: 3
    }
  });
  const workspaceSuggestionsPayload = parseToolText(workspaceSuggestionsResult);
  assert.strictEqual(workspaceSuggestionsPayload.payload.action, 'workspace.registry.suggestions');
  assert.strictEqual(workspaceSuggestionsPayload.payload.suggestions[0].cwd, 'C:\\Smoke\\Workspace');
  assert.strictEqual(mockBridge.received[14].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[14].body.type, RequestType.WORKSPACE_REGISTRY_SUGGESTIONS);
  assert.strictEqual(mockBridge.received[14].body.payload.limit, 3);
  const workspaceArchiveResult = await permissionClient.request('tools/call', {
    name: 'workspace_registry_archive',
    arguments: {
      workspaceId: 'ws-smoke',
      preview: true,
      confirm: false
    }
  });
  const workspaceArchivePayload = parseToolText(workspaceArchiveResult);
  assert.strictEqual(workspaceArchivePayload.payload.action, 'workspace.registry.archive');
  assert.strictEqual(workspaceArchivePayload.payload.workspaceId, 'ws-smoke');
  assert.strictEqual(workspaceArchivePayload.payload.preview, true);
  assert.strictEqual(mockBridge.received[15].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[15].body.type, RequestType.WORKSPACE_REGISTRY_ARCHIVE);
  assert.strictEqual(mockBridge.received[15].body.payload.confirm, false);
  const workspaceChangesResult = await permissionClient.request('tools/call', {
    name: 'workspace_changes_get',
    arguments: {
      cwd: 'C:\\Smoke\\Workspace',
      sessionId: 'session-smoke'
    }
  });
  const workspaceChangesPayload = parseToolText(workspaceChangesResult);
  assert.strictEqual(workspaceChangesPayload.payload.action, 'workspace.changes.get');
  assert.strictEqual(workspaceChangesPayload.payload.changedFiles, 1);
  assert.strictEqual(mockBridge.received[16].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[16].body.type, RequestType.WORKSPACE_CHANGES_GET);
  assert.strictEqual(mockBridge.received[16].body.payload.sessionId, 'session-smoke');
  const workspaceFileResult = await permissionClient.request('tools/call', {
    name: 'workspace_file_get',
    arguments: {
      cwd: 'C:\\Smoke\\Workspace',
      filePath: 'src/smoke.js',
      maxBytes: 256
    }
  });
  const workspaceFilePayload = parseToolText(workspaceFileResult);
  assert.strictEqual(workspaceFilePayload.payload.action, 'workspace.file.get');
  assert.strictEqual(workspaceFilePayload.payload.preview.path, 'src/smoke.js');
  assert.strictEqual(mockBridge.received[17].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[17].body.type, RequestType.WORKSPACE_FILE_GET);
  assert.strictEqual(mockBridge.received[17].body.payload.maxBytes, 256);
  const receivedBeforeGitPullPreview = mockBridge.received.length;
  const gitPullResult = await permissionClient.request('tools/call', {
    name: 'workspace_git_pull',
    arguments: {
      cwd: 'C:\\Smoke\\Workspace',
      remoteName: 'origin',
      branchName: 'main',
      ffOnly: true
    }
  });
  const gitPullPayload = parseToolText(gitPullResult);
  assert.strictEqual(gitPullPayload.payload.action, 'workspace.git.pull');
  assert.strictEqual(gitPullPayload.payload.remoteName, 'origin');
  assert.strictEqual(mockBridge.received.length, receivedBeforeGitPullPreview + 1);
  assert.strictEqual(mockBridge.received[18].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[18].body.type, RequestType.WORKSPACE_GIT_PULL);
  assert.strictEqual(mockBridge.received[18].body.payload.remote, 'origin');
  assert.strictEqual(mockBridge.received[18].body.payload.branch, 'main');
  assert.strictEqual(mockBridge.received[18].body.payload.ffOnly, true);
  const gitSubscribeResult = await permissionClient.request('tools/call', {
    name: 'workspace_git_subscribe',
    arguments: {
      cwd: 'C:\\Smoke\\Workspace',
      subscriptionId: 'sub-smoke',
      action: 'pause'
    }
  });
  const gitSubscribePayload = parseToolText(gitSubscribeResult);
  assert.strictEqual(gitSubscribePayload.payload.action, 'workspace.git.subscribe');
  assert.strictEqual(gitSubscribePayload.payload.subscriptionId, 'sub-smoke');
  assert.strictEqual(gitSubscribePayload.payload.paused, true);
  assert.strictEqual(mockBridge.received[19].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[19].body.type, RequestType.WORKSPACE_GIT_SUBSCRIBE);
  assert.strictEqual(mockBridge.received[19].body.payload.action, 'pause');
  const githubPrStatusResult = await permissionClient.request('tools/call', {
    name: 'github_pr_status',
    arguments: {
      owner: 'smoke',
      repo: 'repo',
      number: 7,
      apiBaseUrl: 'http://127.0.0.1/github-api'
    }
  });
  const githubPrStatusPayload = parseToolText(githubPrStatusResult);
  assert.strictEqual(githubPrStatusPayload.payload.action, 'github.pr.status');
  assert.strictEqual(githubPrStatusPayload.payload.repository, 'smoke/repo');
  assert.strictEqual(githubPrStatusPayload.payload.number, 7);
  assert.strictEqual(mockBridge.received[20].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[20].body.type, RequestType.GITHUB_PR_STATUS);
  assert.strictEqual(mockBridge.received[20].body.payload.apiBaseUrl, 'http://127.0.0.1/github-api');
  const githubChecksResult = await permissionClient.request('tools/call', {
    name: 'github_checks_list',
    arguments: {
      owner: 'smoke',
      repo: 'repo',
      sha: 'abc123'
    }
  });
  const githubChecksPayload = parseToolText(githubChecksResult);
  assert.strictEqual(githubChecksPayload.payload.action, 'github.checks.list');
  assert.strictEqual(githubChecksPayload.payload.checksSummary.passed, 1);
  assert.strictEqual(mockBridge.received[21].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[21].body.type, RequestType.GITHUB_CHECKS_LIST);
  assert.strictEqual(mockBridge.received[21].body.payload.sha, 'abc123');
  const daemonStatusResult = await permissionClient.request('tools/call', {
    name: 'daemon_status',
    arguments: {
      includeChecks: true
    }
  });
  const daemonStatusPayload = parseToolText(daemonStatusResult);
  assert.strictEqual(daemonStatusPayload.payload.action, 'daemon.status');
  assert.strictEqual(daemonStatusPayload.payload.status, 'running');
  assert.strictEqual(mockBridge.received[22].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[22].body.type, RequestType.DAEMON_STATUS);
  assert.strictEqual(mockBridge.received[22].body.payload.includeChecks, true);
  const daemonLogsResult = await permissionClient.request('tools/call', {
    name: 'daemon_logs',
    arguments: {
      maxBytes: 256
    }
  });
  const daemonLogsPayload = parseToolText(daemonLogsResult);
  assert.strictEqual(daemonLogsPayload.payload.action, 'daemon.logs');
  assert.strictEqual(daemonLogsPayload.payload.maxBytes, 256);
  assert.strictEqual(mockBridge.received[23].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[23].body.type, RequestType.DAEMON_LOGS);
  assert.strictEqual(mockBridge.received[23].body.payload.maxBytes, 256);
  const securityDeviceResult = await permissionClient.request('tools/call', {
    name: 'security_device_list',
    arguments: {
      includeRevoked: true
    }
  });
  const securityDevicePayload = parseToolText(securityDeviceResult);
  assert.strictEqual(securityDevicePayload.payload.action, 'security.device.list');
  assert.strictEqual(securityDevicePayload.payload.devices[0].deviceId, 'device-smoke');
  assert.strictEqual(mockBridge.received[24].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[24].body.type, RequestType.SECURITY_DEVICE_LIST);
  assert.strictEqual(mockBridge.received[24].body.payload.includeRevoked, true);
  const securityHostsResult = await permissionClient.request('tools/call', {
    name: 'security_hosts_status',
    arguments: {}
  });
  const securityHostsPayload = parseToolText(securityHostsResult);
  assert.strictEqual(securityHostsPayload.payload.action, 'security.hosts.status');
  assert.strictEqual(securityHostsPayload.payload.hosts[0], '127.0.0.1');
  assert.strictEqual(mockBridge.received[25].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[25].body.type, RequestType.SECURITY_HOSTS_STATUS);
  const fileTransferUploadResult = await permissionClient.request('tools/call', {
    name: 'file_transfer_upload',
    arguments: {
      requestId: 'xfer-smoke',
      workspaceId: 'ws-smoke',
      path: 'uploads/smoke.txt',
      sizeBytes: 11,
      sha256: 'sha-smoke',
      overwrite: false
    }
  });
  const fileTransferUploadPayload = parseToolText(fileTransferUploadResult);
  assert.strictEqual(fileTransferUploadPayload.payload.action, 'file.transfer.upload');
  assert.strictEqual(fileTransferUploadPayload.payload.ready, true);
  assert.strictEqual(fileTransferUploadPayload.payload.path, 'uploads/smoke.txt');
  assert.strictEqual(mockBridge.received[26].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[26].body.type, RequestType.FILE_TRANSFER_UPLOAD);
  assert.strictEqual(mockBridge.received[26].body.payload.overwrite, false);
  const fileTransferCancelResult = await permissionClient.request('tools/call', {
    name: 'file_transfer_cancel',
    arguments: {
      requestId: 'xfer-smoke',
      message: 'cancel smoke'
    }
  });
  const fileTransferCancelPayload = parseToolText(fileTransferCancelResult);
  assert.strictEqual(fileTransferCancelPayload.payload.action, 'file.transfer.cancel');
  assert.strictEqual(fileTransferCancelPayload.payload.canceled, true);
  assert.strictEqual(mockBridge.received[27].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[27].body.type, RequestType.FILE_TRANSFER_CANCEL);
  assert.strictEqual(mockBridge.received[27].body.payload.message, 'cancel smoke');
  const providerCatalogRefreshResult = await permissionClient.request('tools/call', {
    name: 'provider_catalog_refresh',
    arguments: {
      reason: 'mcp-smoke'
    }
  });
  const providerCatalogRefreshPayload = parseToolText(providerCatalogRefreshResult);
  assert.strictEqual(providerCatalogRefreshPayload.payload.action, 'provider.catalog.refresh');
  assert.strictEqual(providerCatalogRefreshPayload.payload.reason, 'mcp-smoke');
  assert.strictEqual(mockBridge.received[28].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[28].body.type, RequestType.PROVIDER_CATALOG_REFRESH);
  assert.strictEqual(mockBridge.received[28].body.payload.reason, 'mcp-smoke');
  const projectRegistryListResult = await permissionClient.request('tools/call', {
    name: 'project_registry_list',
    arguments: {
      includeArchived: true
    }
  });
  const projectRegistryListPayload = parseToolText(projectRegistryListResult);
  assert.strictEqual(projectRegistryListPayload.payload.action, 'project.registry.list');
  assert.strictEqual(projectRegistryListPayload.payload.projects[0].projectId, 'project-smoke');
  assert.strictEqual(mockBridge.received[29].authorization, 'Bearer smoke-token');
  assert.strictEqual(mockBridge.received[29].body.type, RequestType.PROJECT_REGISTRY_LIST);
  assert.strictEqual(mockBridge.received[29].body.payload.includeArchived, true);
  permissionChild.kill();
  await new Promise((resolve) => mockBridge.server.close(resolve));
  fs.rmSync(tempHome, { recursive: true, force: true });
  console.log('mcp host smoke ok');
}

main().catch((error) => {
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Ignore cleanup errors in smoke failure path.
  }
  console.error(error);
  process.exitCode = 1;
});
