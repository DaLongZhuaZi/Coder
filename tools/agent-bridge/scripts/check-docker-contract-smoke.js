'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const dockerfile = read('docker/Dockerfile');
const compose = read('docker/compose.example.yml');
const ignore = read('.dockerignore');
const config = read('src/config.js');
const server = read('src/server.js');
const providerDirectory = read('src/provider-directory-manager.js');

assert.ok(dockerfile.includes('USER 10001:10001'), 'runtime must use the fixed non-root user');
assert.ok(dockerfile.includes('HEALTHCHECK'), 'runtime must define a healthcheck');
assert.ok(dockerfile.includes('EXPOSE 8787'), 'runtime must expose the Bridge port');
assert.ok(dockerfile.includes('VOLUME ["/data"]'), 'Bridge Home must be a persistent volume');
assert.ok(dockerfile.includes('AGENT_BRIDGE_HOME=/data'), 'Bridge Home must be explicit');
assert.ok(dockerfile.includes('AGENT_BRIDGE_CONTAINER=1'), 'container mode must be explicit');
assert.ok(dockerfile.includes('AGENT_BRIDGE_ARCHIVE_TOOL=bsdtar'), 'container archive extraction must support ZIP and TGZ');
assert.ok(dockerfile.includes('node-pty ok'), 'native terminal dependency must be verified during build');
assert.ok(dockerfile.includes('org.opencontainers.image.version'), 'OCI version label must be present');
assert.ok(!dockerfile.includes('COPY . .'), 'Docker build must not copy the entire context');
assert.ok(!/AGENT_BRIDGE_TOKEN\s*=\s*[^\s$]/.test(dockerfile), 'image must not contain a default token');

assert.ok(compose.includes('127.0.0.1:8787:8787'), 'example must default to loopback publishing');
assert.ok(compose.includes('AGENT_BRIDGE_TOKEN_FILE:'), 'example must use a secret file');
assert.ok(compose.includes('agent-bridge-data:/data'), 'Bridge Home and workspace must be separate mounts');
assert.ok(compose.includes(':/workspace:rw'), 'workspace mount must be explicit');
assert.ok(compose.includes(':/opt/ngf/providers:ro'), 'external Provider binaries must be read-only');
assert.ok(compose.includes('read_only: true'), 'root filesystem must be read-only');
assert.ok(compose.includes('no-new-privileges:true'), 'privilege escalation must be disabled');
assert.ok(compose.includes('cap_drop:'), 'Linux capabilities must be dropped');

for (const sensitivePattern of ['*.pem', '*.key', '*.p12', '*.pfx', '.env']) {
  assert.ok(ignore.includes(sensitivePattern), '.dockerignore must exclude ' + sensitivePattern);
}
assert.ok(config.includes("readSecretFile('AGENT_BRIDGE_TOKEN_FILE')"), 'Bridge must read Docker secret token files');
assert.ok(config.includes("readBoolean('AGENT_BRIDGE_CONTAINER', false)"), 'Bridge must expose container mode');
assert.ok(server.includes('config.containerMode !== true && daemonUpdateManager.isAvailable()'), 'container mode must hide in-place self update');
assert.ok(server.includes('container_image_update_required'), 'container mode must reject in-place update');
assert.ok(providerDirectory.includes("process.env.AGENT_BRIDGE_ARCHIVE_TOOL === 'bsdtar'"), 'Provider extraction must honor bsdtar');

console.log('docker contract smoke ok');

