'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  authenticateCredential,
  hashPassword,
  hostAllowed,
  validateAndRememberNonce,
  validateBcryptHash
} = require('../src/auth');
const { createDaemonStore } = require('../src/daemon-store');
const { prepareLauncherAuthentication, removePersistedConnectionQrFiles } = require('../src/desktop-launcher');
const { RequestType } = require('../src/protocol');

const bridgeRoot = path.resolve(__dirname, '..');
const serverPath = path.join(bridgeRoot, 'src', 'server.js');
const launcherPath = path.join(bridgeRoot, 'src', 'desktop-launcher.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-security-hardening-'));
const bridgeHome = path.join(root, 'bridge');
const cliHome = path.join(root, 'cli');
const bearerToken = 'security-hardening-bearer-token';
const bcryptPassword = 'security-hardening-password';

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

function requestJson(port, options) {
  const source = options && typeof options === 'object' ? options : {};
  const body = typeof source.body === 'string' ? source.body : '';
  const headers = Object.assign({
    host: typeof source.hostHeader === 'string' ? source.hostHeader : '127.0.0.1:' + String(port)
  }, source.headers || {});
  if (body.length > 0) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: typeof source.method === 'string' ? source.method : 'GET',
      path: typeof source.path === 'string' ? source.path : '/health',
      headers,
      timeout: 10000
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = text.length > 0 ? JSON.parse(text) : null;
        } catch (_error) {
          parsed = null;
        }
        resolve({
          statusCode: response.statusCode || 0,
          body: parsed,
          text
        });
      });
    });
    request.once('error', reject);
    request.once('timeout', () => request.destroy(new Error('HTTP request timed out.')));
    if (body.length > 0) {
      request.write(body);
    }
    request.end();
  });
}

function rpcBody(type, payload) {
  return JSON.stringify({
    id: 'security_' + crypto.randomBytes(6).toString('hex'),
    type,
    payload: payload || {}
  });
}

function rpcRequest(port, token, type, payload) {
  return requestJson(port, {
    method: 'POST',
    path: '/rpc',
    headers: {
      authorization: 'Bearer ' + token
    },
    body: rpcBody(type, payload)
  });
}

function waitForHealth(port, child, output) {
  return new Promise(async (resolve, reject) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        reject(new Error('Bridge exited before health check: ' + output.join('')));
        return;
      }
      try {
        const response = await requestJson(port, { path: '/health' });
        if (response.statusCode === 200 && response.body && response.body.ok === true) {
          resolve(response.body);
          return;
        }
      } catch (_error) {
        // Listener startup is asynchronous.
      }
      await delay(100);
    }
    reject(new Error('Timed out waiting for Bridge health: ' + output.join('')));
  });
}

function websocketUpgrade(port, token, clientId, nonce, includeNonce) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('WebSocket upgrade timed out.'));
    }, 10000);
    socket.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      const headerEnd = text.indexOf('\r\n\r\n');
      if (headerEnd < 0 || settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const statusLine = text.substring(0, text.indexOf('\r\n'));
      resolve({ socket, statusLine, responseText: text });
    });
    socket.once('connect', () => {
      const query = [
        'token=' + encodeURIComponent(token),
        'clientId=' + encodeURIComponent(clientId)
      ];
      if (includeNonce) {
        query.push('appNonce=' + encodeURIComponent(nonce));
      }
      socket.write(
        'GET /ws?' + query.join('&') + ' HTTP/1.1\r\n' +
        'Host: 127.0.0.1:' + String(port) + '\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\n' +
        '\r\n'
      );
    });
  });
}

function waitForSocketClose(socket, timeoutMs) {
  if (!socket || socket.destroyed) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function runCli(args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcherPath].concat(args), {
      cwd: bridgeRoot,
      windowsHide: true,
      env: Object.assign({}, process.env, {
        AGENT_BRIDGE_HOME: cliHome,
        AGENT_BRIDGE_HOOK_HOME: cliHome,
        NO_COLOR: '1'
      }, extraEnv || {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString('utf8')));
    child.once('error', reject);
    child.once('exit', (code) => {
      const text = stdout.join('').trim();
      let payload = null;
      try {
        payload = text.length > 0 ? JSON.parse(text) : null;
      } catch (error) {
        reject(new Error('CLI returned invalid JSON: ' + text + ' ' + String(error)));
        return;
      }
      resolve({ exitCode: code === null ? 1 : code, payload, stderr: stderr.join('') });
    });
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill();
      }
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function run() {
  const hash = await hashPassword(bcryptPassword);
  const hashValidation = validateBcryptHash(hash);
  assert.strictEqual(hashValidation.ok, true);
  assert.strictEqual(hashValidation.rounds, 12);
  assert.strictEqual(validateBcryptHash('$2b$smoke').ok, false);
  assert.strictEqual(hostAllowed('localhost:8787', []).allowed, true);
  assert.strictEqual(hostAllowed('app.localhost', []).allowed, true);
  assert.strictEqual(hostAllowed('127.0.0.1:8787', []).allowed, true);
  assert.strictEqual(hostAllowed('bridge.example', []).allowed, false);
  assert.strictEqual(hostAllowed('bridge.example', ['bridge.example']).allowed, true);

  const nonceCache = new Map();
  assert.strictEqual(validateAndRememberNonce(nonceCache, 'client', '', 1000).code, 'nonce_missing');
  assert.strictEqual(validateAndRememberNonce(nonceCache, 'client', 'valid-nonce-123', 1000).ok, true);
  assert.strictEqual(validateAndRememberNonce(nonceCache, 'client', 'valid-nonce-123', 1000).code, 'nonce_replay');

  const store = createDaemonStore(bridgeHome);
  store.writeConfig(Object.assign({}, store.config, {
    daemon: Object.assign({}, store.config.daemon, {
      auth: {
        mode: 'bcrypt',
        bcryptHash: '$2b$invalid',
        updatedAt: new Date().toISOString()
      }
    })
  }));
  const invalidAuth = await authenticateCredential(bearerToken, store, bearerToken);
  assert.strictEqual(invalidAuth.ok, false);
  assert.strictEqual(invalidAuth.failureCategory, 'auth_config_invalid');
  store.writeConfig(Object.assign({}, store.config, {
    daemon: Object.assign({}, store.config.daemon, {
      auth: {
        mode: 'bcrypt',
        bcryptHash: hash,
        updatedAt: new Date().toISOString()
      }
    })
  }));
  const launcherEnvironment = {
    NGF_LAUNCHER_PASSWORD: bcryptPassword,
    RETAINED_ENV: 'retained'
  };
  const launcherOptions = prepareLauncherAuthentication({
    token: '',
    passwordEnv: 'NGF_LAUNCHER_PASSWORD'
  }, {
    token: bearerToken
  }, {
    token: bearerToken
  }, store, launcherEnvironment);
  assert.strictEqual(launcherOptions.authMode, 'bcrypt');
  assert.strictEqual(launcherOptions.connectionCredential, bcryptPassword);
  assert.strictEqual(launcherOptions.token, bearerToken, 'bcrypt launcher must retain the non-password bearer profile token');
  assert.strictEqual(launcherOptions.credentialEphemeral, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(launcherEnvironment, 'NGF_LAUNCHER_PASSWORD'), false, 'bcrypt launcher should remove password env before spawning children');
  assert.strictEqual(launcherEnvironment.RETAINED_ENV, 'retained');
  assert.throws(() => prepareLauncherAuthentication({
    token: bcryptPassword,
    passwordEnv: ''
  }, {
    token: bearerToken
  }, {
    token: bcryptPassword
  }, store, {}), (error) => error && error.code === 'bcrypt_password_argument_rejected');
  const previousHome = process.env.AGENT_BRIDGE_HOME;
  const qrHome = path.join(root, 'qr-home');
  fs.mkdirSync(qrHome, { recursive: true });
  for (const extension of ['png', 'svg', 'html']) {
    fs.writeFileSync(path.join(qrHome, 'agent-bridge-connection.' + extension), 'stale', 'utf8');
  }
  try {
    process.env.AGENT_BRIDGE_HOME = qrHome;
    removePersistedConnectionQrFiles();
  } finally {
    if (typeof previousHome === 'string') {
      process.env.AGENT_BRIDGE_HOME = previousHome;
    } else {
      delete process.env.AGENT_BRIDGE_HOME;
    }
  }
  for (const extension of ['png', 'svg', 'html']) {
    assert.strictEqual(fs.existsSync(path.join(qrHome, 'agent-bridge-connection.' + extension)), false);
  }
  store.writeConfig(Object.assign({}, store.config, {
    daemon: Object.assign({}, store.config.daemon, {
      auth: {
        mode: 'bearer',
        bcryptHash: '',
        updatedAt: new Date().toISOString()
      }
    })
  }));
  fs.writeFileSync(path.join(bridgeHome, 'profile.json'), JSON.stringify({
    version: 1,
    token: bearerToken
  }, null, 2), 'utf8');

  const port = await reservePort();
  const output = [];
  const child = spawn(process.execPath, [serverPath], {
    cwd: bridgeRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      AGENT_BRIDGE_HOME: bridgeHome,
      AGENT_BRIDGE_HOST: '127.0.0.1',
      AGENT_BRIDGE_PORT: String(port),
      AGENT_BRIDGE_TOKEN: ''
    })
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  let liveSocket = null;
  try {
    await waitForHealth(port, child, output);

    const hostileHost = await requestJson(port, { path: '/health', hostHeader: 'bridge.example' });
    assert.strictEqual(hostileHost.statusCode, 403);
    assert.strictEqual(hostileHost.body.error.code, 'host_not_allowed');
    const malformedHost = await requestJson(port, { path: '/health', hostHeader: '[invalid' });
    assert.strictEqual(malformedHost.statusCode, 403);

    const bearerStatus = await rpcRequest(port, bearerToken, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(bearerStatus.statusCode, 200);
    assert.strictEqual(bearerStatus.body.response.payload.activeMode, 'bearer');
    const missingCredentialEnv = await runCli([
      'security', 'auth', 'status',
      '--daemon-url', 'http://127.0.0.1:' + String(port),
      '--credential-env', 'NGF_MISSING_CREDENTIAL'
    ]);
    assert.notStrictEqual(missingCredentialEnv.exitCode, 0);
    assert.strictEqual(missingCredentialEnv.payload.code, 'credential_env_empty');
    const wrongBearer = await rpcRequest(port, 'wrong-token', RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(wrongBearer.statusCode, 401);

    const missingNonce = await websocketUpgrade(port, bearerToken, 'missing-nonce-client', '', false);
    assert.ok(missingNonce.statusLine.includes('400 Bad Request'));
    assert.ok(!missingNonce.statusLine.includes('101'));
    missingNonce.socket.destroy();

    const replayNonce = 'replay-nonce-' + crypto.randomBytes(12).toString('base64url');
    const firstReplay = await websocketUpgrade(port, bearerToken, 'replay-client', replayNonce, true);
    assert.ok(firstReplay.statusLine.includes('101 Switching Protocols'));
    firstReplay.socket.destroy();
    const secondReplay = await websocketUpgrade(port, bearerToken, 'replay-client', replayNonce, true);
    assert.ok(secondReplay.statusLine.includes('409 Conflict'));
    assert.ok(!secondReplay.statusLine.includes('101'));
    secondReplay.socket.destroy();

    const liveNonce = 'live-nonce-' + crypto.randomBytes(12).toString('base64url');
    const liveUpgrade = await websocketUpgrade(port, bearerToken, 'live-client', liveNonce, true);
    assert.ok(liveUpgrade.statusLine.includes('101 Switching Protocols'));
    liveSocket = liveUpgrade.socket;

    const tokenRotate = await runCli([
      'security', 'token', 'rotate',
      '--daemon-url', 'http://127.0.0.1:' + String(port),
      '--token', bearerToken
    ]);
    assert.strictEqual(tokenRotate.exitCode, 0, tokenRotate.stderr);
    assert.strictEqual(tokenRotate.payload.rotated, true);
    assert.ok(tokenRotate.payload.connectionsInvalidated >= 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(tokenRotate.payload, 'token'));
    const tokenSocketClosed = await waitForSocketClose(liveSocket, 5000);
    assert.strictEqual(tokenSocketClosed, true, 'token rotation should close existing WebSocket connections');
    liveSocket = null;
    const rotatedProfile = JSON.parse(fs.readFileSync(path.join(bridgeHome, 'profile.json'), 'utf8'));
    const rotatedToken = typeof rotatedProfile.token === 'string' ? rotatedProfile.token : '';
    assert.ok(rotatedToken.length > 0 && rotatedToken !== bearerToken);
    const rejectedOldToken = await rpcRequest(port, bearerToken, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(rejectedOldToken.statusCode, 401);
    const acceptedRotatedToken = await rpcRequest(port, rotatedToken, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(acceptedRotatedToken.statusCode, 200);

    const authNonce = 'auth-nonce-' + crypto.randomBytes(12).toString('base64url');
    const authUpgrade = await websocketUpgrade(port, rotatedToken, 'auth-client', authNonce, true);
    assert.ok(authUpgrade.statusLine.includes('101 Switching Protocols'));
    liveSocket = authUpgrade.socket;

    const authSet = await runCli([
      'security', 'auth', 'set', '--mode', 'bcrypt',
      '--password-env', 'NGF_SECURITY_SMOKE_PASSWORD',
      '--daemon-url', 'http://127.0.0.1:' + String(port),
      '--token', rotatedToken
    ], {
      NGF_SECURITY_SMOKE_PASSWORD: bcryptPassword
    });
    assert.strictEqual(authSet.exitCode, 0, authSet.stderr);
    assert.strictEqual(authSet.payload.bcryptActive, true);
    assert.strictEqual(authSet.payload.bcryptCost, 12);
    assert.ok(!Object.prototype.hasOwnProperty.call(authSet.payload, 'bcryptHash'));
    const socketClosed = await waitForSocketClose(liveSocket, 5000);
    assert.strictEqual(socketClosed, true, 'auth mode switch should close existing WebSocket connections');
    liveSocket = null;

    const oldBearer = await rpcRequest(port, rotatedToken, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(oldBearer.statusCode, 401);
    const wrongPassword = await rpcRequest(port, 'wrong-password', RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(wrongPassword.statusCode, 401);
    const bcryptStatus = await rpcRequest(port, bcryptPassword, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(bcryptStatus.statusCode, 200);
    assert.strictEqual(bcryptStatus.body.response.payload.bcryptActive, true);
    assert.strictEqual(bcryptStatus.body.response.payload.activeMode, 'bcrypt');

    const bcryptCliStatus = await runCli([
      'security', 'auth', 'status',
      '--daemon-url', 'http://127.0.0.1:' + String(port),
      '--credential-env', 'NGF_CURRENT_BRIDGE_PASSWORD'
    ], {
      NGF_CURRENT_BRIDGE_PASSWORD: bcryptPassword
    });
    assert.strictEqual(bcryptCliStatus.exitCode, 0, bcryptCliStatus.stderr);
    assert.strictEqual(bcryptCliStatus.payload.bcryptActive, true);
    const rejectedDaemonStart = await runCli([
      'daemon', 'start',
      '--connect-host', '127.0.0.1',
      '--port', String(port),
      '--credential-env', 'NGF_CURRENT_BRIDGE_PASSWORD'
    ], {
      NGF_CURRENT_BRIDGE_PASSWORD: 'wrong-password',
      AGENT_BRIDGE_HOME: bridgeHome,
      AGENT_BRIDGE_HOOK_HOME: bridgeHome
    });
    assert.notStrictEqual(rejectedDaemonStart.exitCode, 0);
    assert.strictEqual(rejectedDaemonStart.payload.code, 'unauthorized');
    assert.strictEqual(rejectedDaemonStart.payload.alreadyRunning, false);

    const invalidSet = await rpcRequest(port, bcryptPassword, RequestType.SECURITY_AUTH_SET, {
      mode: 'bcrypt',
      bcryptHash: '$2b$invalid'
    });
    assert.strictEqual(invalidSet.statusCode, 200);
    assert.strictEqual(invalidSet.body.response.payload.ok, false);
    assert.strictEqual(invalidSet.body.response.payload.failureCategory, 'bcrypt_hash_invalid');
    const afterInvalid = await rpcRequest(port, bcryptPassword, RequestType.SECURITY_AUTH_STATUS, {});
    assert.strictEqual(afterInvalid.statusCode, 200, 'invalid auth update must retain working bcrypt configuration');

    const localRecovery = await runCli([
      'security', 'auth', 'set', '--local', '--mode', 'bearer',
      '--daemon-url', 'http://127.0.0.1:' + String(port)
    ], {
      AGENT_BRIDGE_HOME: bridgeHome,
      AGENT_BRIDGE_HOOK_HOME: bridgeHome
    });
    assert.strictEqual(localRecovery.exitCode, 0, localRecovery.stderr);
    assert.strictEqual(localRecovery.payload.localRecovery, true);
    assert.strictEqual(localRecovery.payload.restartRequired, true);
    const recoveredStore = createDaemonStore(bridgeHome);
    assert.strictEqual(recoveredStore.config.daemon.auth.mode, 'bearer');

    process.stdout.write('security hardening smoke ok\n');
  } finally {
    if (liveSocket) {
      liveSocket.destroy();
    }
    await stopChild(child);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  fs.rmSync(root, { recursive: true, force: true });
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
