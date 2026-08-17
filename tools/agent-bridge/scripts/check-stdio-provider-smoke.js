'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { CliProvider } = require('../src/providers/cli-provider');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function removeTempDirectory(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp + path.sep)) {
    throw new Error('refusing to remove path outside temp directory: ' + resolvedTarget);
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!error || error.code !== 'EBUSY') {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-stdio-provider-'));
  try {
    const childScript = path.join(root, 'stdio-child.js');
    fs.writeFileSync(childScript, [
      "'use strict';",
      "let count = 0;",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      "  const lines = String(chunk).split(/\\r?\\n/).filter((line) => line.length > 0);",
      "  for (const line of lines) {",
      "    count += 1;",
      "    process.stdout.write('reply-' + String(count) + ':' + line + '\\n');",
      "  }",
      "});",
      "process.stdin.on('end', () => process.exit(0));"
    ].join('\n'), 'utf8');

    const provider = new CliProvider({
      id: 'profile.smoke',
      displayName: 'Smoke Stdio Provider',
      command: process.execPath,
      commandArgs: [childScript],
      runtimeMode: 'stdio',
      promptMode: 'stdin',
      modelFlag: '',
      cwdFlag: '',
      supportsGoalMode: true,
      supportsPlanMode: false,
      stdioResponseIdleMs: 40,
      timeoutMs: 2000,
      models: [
        { id: 'configured', displayName: 'Configured Model' }
      ]
    });

    assert(provider.supportsInteractiveSessions === true, 'stdio provider should advertise interactive sessions');
    const described = await provider.describe();
    assert(described.runtimeMode === 'stdio', 'provider description should expose runtime mode');
    assert(described.capabilities.interactiveSessions === true, 'provider capabilities should expose interactive sessions');

    const events = [];
    const emit = (event) => {
      events.push(event);
    };
    const session = provider.createSession({ workspacePath: path.join(__dirname, '..'), workspaceTitle: 'Stdio Smoke' });
    await provider.sendMessage({ sessionId: session.sessionId, text: 'first' }, emit);
    const firstDiagnostics = provider.sessionRuntimeDiagnostics(session.sessionId);
    assert(firstDiagnostics.pid > 0, 'stdio diagnostics should expose child pid');
    assert(firstDiagnostics.sessionState === 'idle', 'stdio session should become idle after first send');
    assert(firstDiagnostics.interactiveReady === true, 'stdio session should stay interactively ready after first send');
    await provider.sendMessage({ sessionId: session.sessionId, text: 'second' }, emit);
    const secondDiagnostics = provider.sessionRuntimeDiagnostics(session.sessionId);
    assert(secondDiagnostics.pid === firstDiagnostics.pid, 'second send should reuse the same stdio child pid');
    assert(secondDiagnostics.sessionState === 'idle', 'stdio session should become idle after second send');
    assert(secondDiagnostics.recentOutputTail.includes('second'), 'stdio diagnostics should keep recent output tail');
    const messages = await provider.listMessages(session.sessionId);
    const assistantText = messages.filter((message) => message.role === 'assistant').map((message) => message.text).join('\n');
    assert(assistantText.includes('reply-5:first'), 'first send should reach stdio child after context prelude');
    assert(assistantText.includes('reply-10:second'), 'second send should reuse the same stdio child counter');
    assert(events.some((event) => event && event.event === 'message.delta'), 'stdio provider should emit message deltas');

    const abortResult = await provider.abortSession({ sessionId: session.sessionId }, emit);
    assert(abortResult.status === 'aborted', 'stdio abort should report aborted');
    assert(abortResult.terminated === true, 'stdio abort should terminate child process');
    assert(abortResult.runtimeMode === 'stdio', 'stdio abort should expose runtime mode');
    assert(abortResult.sessionState === 'aborted', 'stdio abort should expose aborted session state');

    const readyScript = path.join(root, 'stdio-ready-child.js');
    fs.writeFileSync(readyScript, [
      "'use strict';",
      "process.stdout.write('READY\\n');",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      "  process.stdout.write('ready-reply:' + String(chunk).trim() + '\\n');",
      "});"
    ].join('\n'), 'utf8');
    const readyProvider = new CliProvider({
      id: 'profile.ready-smoke',
      displayName: 'Ready Stdio Provider',
      command: process.execPath,
      commandArgs: [readyScript],
      runtimeMode: 'stdio',
      promptMode: 'stdin',
      modelFlag: '',
      cwdFlag: '',
      stdioReadyPattern: 'READY',
      stdioStartupTimeoutMs: 1000,
      stdioResponseIdleMs: 40,
      timeoutMs: 2000,
      models: [
        { id: 'configured', displayName: 'Configured Model' }
      ]
    });
    const readySession = readyProvider.createSession({ workspacePath: path.join(__dirname, '..'), workspaceTitle: 'Ready Smoke' });
    const readyStatus = await readyProvider.startInteractiveSession(readySession.sessionId, () => {});
    assert(readyStatus.interactiveReady === true, 'ready pattern should mark stdio session interactive');
    assert(readyStatus.sessionState === 'idle', 'ready pattern session should become idle');
    assert(readyStatus.recentOutputTail.includes('READY'), 'ready pattern output should be retained in diagnostics');
    await readyProvider.abortSession({ sessionId: readySession.sessionId }, () => {});

    const timeoutScript = path.join(root, 'stdio-timeout-child.js');
    fs.writeFileSync(timeoutScript, [
      "'use strict';",
      "setInterval(() => {}, 1000);"
    ].join('\n'), 'utf8');
    const timeoutProvider = new CliProvider({
      id: 'profile.timeout-smoke',
      displayName: 'Timeout Stdio Provider',
      command: process.execPath,
      commandArgs: [timeoutScript],
      runtimeMode: 'stdio',
      promptMode: 'stdin',
      modelFlag: '',
      cwdFlag: '',
      stdioReadyPattern: 'NEVER_READY',
      stdioStartupTimeoutMs: 60,
      stdioResponseIdleMs: 20,
      timeoutMs: 500,
      models: [
        { id: 'configured', displayName: 'Configured Model' }
      ]
    });
    const timeoutSession = timeoutProvider.createSession({ workspacePath: path.join(__dirname, '..'), workspaceTitle: 'Timeout Smoke' });
    let timeoutFailed = false;
    try {
      await timeoutProvider.startInteractiveSession(timeoutSession.sessionId, () => {});
    } catch (error) {
      timeoutFailed = true;
      assert(error && error.code === 'STARTUP_TIMEOUT', 'stdio startup timeout should preserve STARTUP_TIMEOUT code');
    }
    assert(timeoutFailed === true, 'stdio startup should fail when ready pattern never appears');
    const timeoutDiagnostics = timeoutProvider.sessionRuntimeDiagnostics(timeoutSession.sessionId);
    assert(timeoutDiagnostics.interactiveReady === false, 'timed out stdio session should not be interactive ready');
    assert(timeoutDiagnostics.lastError.includes('timed out'), 'timed out stdio session should keep timeout diagnostic');

    const exitScript = path.join(root, 'stdio-exit-child.js');
    fs.writeFileSync(exitScript, [
      "'use strict';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      "  process.stdout.write('once:' + String(chunk).trim() + '\\n');",
      "  process.exit(0);",
      "});"
    ].join('\n'), 'utf8');
    const exitProvider = new CliProvider({
      id: 'profile.exit-smoke',
      displayName: 'Exit Stdio Provider',
      command: process.execPath,
      commandArgs: [exitScript],
      runtimeMode: 'stdio',
      promptMode: 'stdin',
      modelFlag: '',
      cwdFlag: '',
      stdioResponseIdleMs: 40,
      timeoutMs: 2000,
      models: [
        { id: 'configured', displayName: 'Configured Model' }
      ]
    });
    const exitSession = exitProvider.createSession({ workspacePath: path.join(__dirname, '..'), workspaceTitle: 'Exit Smoke' });
    await exitProvider.sendMessage({ sessionId: exitSession.sessionId, text: 'once' }, () => {});
    const exitedDiagnostics = exitProvider.sessionRuntimeDiagnostics(exitSession.sessionId);
    assert(exitedDiagnostics.sessionState === 'exited', 'stdio session should keep exited state after child exits normally');
    let sendAfterExitFailed = false;
    try {
      await exitProvider.sendMessage({ sessionId: exitSession.sessionId, text: 'again' }, () => {});
    } catch (error) {
      sendAfterExitFailed = true;
      assert(error && error.code === 'SESSION_EXITED', 'send after exited stdio process should fail with SESSION_EXITED');
      assert(error && error.pid === exitedDiagnostics.pid, 'send-after-exit error should expose original pid');
    }
    assert(sendAfterExitFailed === true, 'send after exited stdio process should fail');
    assert(exitProvider.sessionRuntimeDiagnostics(exitSession.sessionId).pid === exitedDiagnostics.pid, 'send after exit should not restart child process');

    const crashScript = path.join(root, 'stdio-crash-child.js');
    fs.writeFileSync(crashScript, [
      "'use strict';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', () => {",
      "  process.stderr.write('crash requested\\n');",
      "  process.exit(7);",
      "});"
    ].join('\n'), 'utf8');
    const crashProvider = new CliProvider({
      id: 'profile.crash-smoke',
      displayName: 'Crash Stdio Provider',
      command: process.execPath,
      commandArgs: [crashScript],
      runtimeMode: 'stdio',
      promptMode: 'stdin',
      modelFlag: '',
      cwdFlag: '',
      supportsGoalMode: true,
      supportsPlanMode: false,
      stdioResponseIdleMs: 40,
      timeoutMs: 2000,
      models: [
        { id: 'configured', displayName: 'Configured Model' }
      ]
    });
    const crashEvents = [];
    const crashSession = crashProvider.createSession({ workspacePath: path.join(__dirname, '..'), workspaceTitle: 'Crash Smoke' });
    let failed = false;
    try {
      await crashProvider.sendMessage({ sessionId: crashSession.sessionId, text: 'explode' }, (event) => {
        crashEvents.push(event);
      });
    } catch (error) {
      failed = true;
      assert(error && error.code === 'SESSION_EXITED', 'stdio crash should throw structured runtime error');
      assert(error && error.exitCode === 7, 'stdio crash should expose exit code');
      assert(error && error.pid > 0, 'stdio crash should expose child pid');
    }
    assert(failed === true, 'stdio crash should fail sendMessage');
    assert(crashSession.status === 'ready', 'stdio crash should reset session status');
    assert(crashSession.sessionState === 'failed', 'stdio crash should expose failed state');
    assert(crashSession.exitCode === 7, 'stdio crash should keep exit code on session');
    assert(crashSession.lastError.length > 0, 'stdio crash should keep last error on session');
    assert(crashSession.interactiveReady === false, 'stdio crash should clear interactive ready');
    assert(crashProvider.activeRuns.has(crashSession.sessionId) === false, 'stdio crash should clear active run');
    assert(crashEvents.some((event) => event && event.event === 'tool.completed' && event.payload && event.payload.status === 'failed'), 'stdio crash should emit failed tool completion');
    console.log('stdio provider smoke ok');
  } finally {
    removeTempDirectory(root);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
