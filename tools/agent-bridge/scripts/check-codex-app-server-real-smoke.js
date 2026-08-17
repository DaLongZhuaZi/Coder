'use strict';

const assert = require('assert');
const { CodexAppServerProvider } = require('../src/providers/codex-app-server-provider');

async function main() {
  if (process.env.AGENT_BRIDGE_CODEX_REAL_SMOKE !== '1') {
    console.log('codex app server real smoke skipped; set AGENT_BRIDGE_CODEX_REAL_SMOKE=1 to run');
    return;
  }
  const provider = new CodexAppServerProvider({
    runtime: 'app-server',
    command: process.env.AGENT_BRIDGE_CODEX_COMMAND || 'codex',
    timeoutMs: 120000
  });
  try {
    const session = await provider.createSession({ workspacePath: process.cwd() });
    const first = await provider.sendMessage({
      sessionId: session.sessionId,
      text: 'Reply with exactly NGF_CODEX_SMOKE_ONE. Do not use tools.'
    }, () => {});
    assert(String(first.text).includes('NGF_CODEX_SMOKE_ONE'));
    const second = await provider.sendMessage({
      sessionId: session.sessionId,
      text: 'Reply with exactly NGF_CODEX_SMOKE_TWO. Do not use tools.'
    }, () => {});
    assert(String(second.text).includes('NGF_CODEX_SMOKE_TWO'));

    const restored = new CodexAppServerProvider({ runtime: 'app-server', command: process.env.AGENT_BRIDGE_CODEX_COMMAND || 'codex', timeoutMs: 120000 });
    try {
      const attached = await restored.attachSession({ sessionId: session.sessionId, remoteSessionId: session.remoteSessionId, workspacePath: process.cwd() }, () => {});
      assert.strictEqual(attached.remoteSessionId, session.remoteSessionId);
      const archived = await restored.archiveSession({ sessionId: session.sessionId }, () => {});
      assert.strictEqual(archived.archived, true);
    } finally {
      restored.transport.stop();
    }
    console.log('codex app server real smoke ok');
  } finally {
    provider.transport.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
