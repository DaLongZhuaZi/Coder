'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE !== '1') {
  console.log('docker runtime smoke skipped: set AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1 for the container build/run check');
  process.exit(0);
}

function run(args, options) {
  return childProcess.spawnSync('docker', args, Object.assign({ encoding: 'utf8', windowsHide: true }, options || {}));
}

const info = run(['info', '--format', '{{.ServerVersion}}'], { timeout: 15000 });
if (info.status !== 0) {
  console.log('docker runtime smoke skipped: Docker Linux daemon is unavailable');
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const suffix = String(process.pid) + '-' + String(Date.now());
const image = 'ngf-agent-bridge-smoke:' + suffix;
const container = 'ngf-agent-bridge-smoke-' + suffix;
const volume = 'ngf-agent-bridge-smoke-data-' + suffix;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ngf-agent-bridge-docker-'));
const workspace = path.join(temporary, 'workspace');
const secret = path.join(temporary, 'token.txt');
fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(secret, 'docker-smoke-token-' + suffix + '\n', 'utf8');

try {
  let result = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = run(['build', '--target', 'bridge', '-t', image, '-f', 'docker/Dockerfile', '.'], { cwd: root, timeout: 10 * 60 * 1000 });
    if (result.status === 0) break;
  }
  if (result.status !== 0) throw new Error('docker build failed: ' + String(result.stderr || result.stdout));
  result = run(['volume', 'create', volume]);
  if (result.status !== 0) throw new Error('docker volume create failed');
  result = run([
    'run', '-d', '--name', container, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
    '--mount', 'type=volume,src=' + volume + ',dst=/data',
    '--mount', 'type=bind,src=' + workspace + ',dst=/workspace,readonly',
    '--mount', 'type=bind,src=' + secret + ',dst=/run/secrets/agent_bridge_token,readonly',
    '-e', 'AGENT_BRIDGE_TOKEN_FILE=/run/secrets/agent_bridge_token', image
  ]);
  if (result.status !== 0) throw new Error('docker run failed: ' + String(result.stderr || result.stdout));
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    result = run(['exec', container, 'node', '/opt/ngf-agent-bridge/docker/healthcheck.js']);
    if (result.status === 0) { healthy = true; break; }
    childProcess.spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
  }
  if (!healthy) throw new Error('container did not become healthy');
  result = run(['exec', container, 'id', '-u']);
  if (String(result.stdout).trim() !== '10001') throw new Error('container is not running as uid 10001');
  result = run(['exec', container, 'sh', '-c', 'touch /workspace/should-fail']);
  if (result.status === 0) throw new Error('read-only workspace accepted a write');
  result = run(['exec', container, 'sh', '-c', 'test -s /data/instance-id && cp /data/instance-id /tmp/instance-id']);
  if (result.status !== 0) throw new Error('persistent instance id was not created');
  result = run(['restart', container]);
  if (result.status !== 0) throw new Error('container restart failed');
  result = run(['exec', container, 'test', '-s', '/data/instance-id']);
  if (result.status !== 0) throw new Error('instance id did not survive restart');
  console.log('docker runtime smoke ok');
} finally {
  run(['rm', '-f', container]);
  run(['volume', 'rm', '-f', volume]);
  run(['image', 'rm', '-f', image]);
  fs.rmSync(temporary, { recursive: true, force: true });
}
