# Agent Bridge Docker

## Scope

The image packages the Agent Bridge daemon, management CLI and same-origin static Web UI in one immutable image. The browser UI reuses the Bridge HTTP/WS protocol and does not add a parallel backend.

The supported build context is `tools/agent-bridge`. Do not build from the repository root: that context contains HarmonyOS outputs and signing-related files that do not belong in a server image.

## Build

```bash
docker build \
  --target bridge \
  --build-arg AGENT_BRIDGE_VERSION=0.1.4 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t ngf-agent-bridge:0.1.4 \
  -f docker/Dockerfile .
```

The final image runs as uid/gid `10001:10001`, uses `tini`, verifies `node-pty` during the build, includes `bsdtar` for ZIP/TGZ Provider packages, and exposes `GET /health` on port 8787.

## Persistent data and mounts

Use one complete persistent volume for `/data`. Bridge records refer to each other and must be backed up as a consistent set.

| Container path | Mode | Purpose |
| --- | --- | --- |
| `/data` | read/write | Profile, config, instance identity, logs, agents, Provider profiles and managed binaries, checkpoints, terminal captures, schedules, loops, rooms, usage, queue, security state and migrations |
| `/workspace` | read/write or read-only | User-selected source trees; keep separate from Bridge state |
| `/opt/ngf/providers` | read-only | Optional externally managed Provider binaries explicitly referenced by a profile |
| `/run/secrets` | read-only | Bridge token, Provider tokens and TLS secrets supplied by the container runtime |

Do not mount the Docker socket. Do not add Provider directories to the system `PATH`; use explicit profile binary paths. The base image contains no Provider CLI and no user credential.

## Compose

Copy `tools/agent-bridge/docker/compose.example.yml`, create `secrets/agent-bridge-token.txt`, and start the service:

```bash
docker compose -f docker/compose.example.yml up -d --build
docker compose -f docker/compose.example.yml ps
```

The example binds only to `127.0.0.1`, drops Linux capabilities, prevents privilege escalation, uses a read-only root filesystem and applies CPU, memory and PID limits. Use a TLS reverse proxy before publishing it to another network.

Run the CLI from the same image:

```bash
docker run --rm --network host \
  --mount type=bind,src="$PWD/secrets/agent-bridge-token.txt",dst=/run/secrets/agent_bridge_token,readonly \
  -e AGENT_BRIDGE_TOKEN_FILE=/run/secrets/agent_bridge_token \
  ngf-agent-bridge:0.1.4 \
  node /opt/ngf-agent-bridge/src/desktop-launcher.js --daemon-url http://127.0.0.1:8787 daemon status
```

## Provider binaries

The base image deliberately excludes Codex, Claude, OpenCode and other Provider CLIs. Two supported approaches are:

1. Create a reviewed child image from `docker/Dockerfile.providers.example`, pin every Provider version and verify its release checksum.
2. Mount reviewed binaries at `/opt/ngf/providers:ro` and reference their absolute paths from a Provider profile.

Remote Provider directory installations remain under `/data/providers/<providerId>/<version>` and therefore survive container recreation. Archive installation never executes package scripts and does not modify `PATH`.

## Backup and restore

Stop the container before taking a consistent snapshot:

```bash
docker compose -f docker/compose.example.yml stop agent-bridge
docker run --rm \
  --mount source=agent-bridge_agent-bridge-data,target=/data,readonly \
  --mount type=bind,src="$PWD/backups",target=/backup \
  alpine:3.22 sh -c 'cd /data && tar -czf /backup/agent-bridge-data.tgz .'
docker compose -f docker/compose.example.yml start agent-bridge
```

Restore only into an empty volume, using the same uid/gid ownership:

```bash
docker volume create agent-bridge-restored
docker run --rm \
  --mount source=agent-bridge-restored,target=/data \
  --mount type=bind,src="$PWD/backups",target=/backup,readonly \
  alpine:3.22 sh -c 'cd /data && tar -xzf /backup/agent-bridge-data.tgz && chown -R 10001:10001 /data'
```

Workspace backup is independent and should follow the workspace repository's own Git or storage policy.

## Upgrade and rollback

Container mode disables Bridge in-place update and rollback RPCs. Use immutable image tags:

1. Stop the old container and back up `/data`.
2. Pull or build the new pinned image.
3. Recreate the container with the same `/data` volume.
4. Wait for `/health`, then run `doctor` and Provider status checks.

To roll back, stop the new container, restore the matching pre-upgrade `/data` snapshot when schema compatibility requires it, and recreate with the previous image tag. Never mix a restored old state volume with a running newer container.

## Validation

Without a Docker daemon, `check-docker-contract-smoke.js` validates the Dockerfile, Compose, secrets, volumes, non-root user, immutable update behavior and archive tooling. With Docker running:

```bash
AGENT_BRIDGE_DOCKER_RUNTIME_SMOKE=1 npm run check:docker-runtime
```

The runtime smoke is opt-in because it builds a multi-stage image and starts a constrained container. It verifies health, uid 10001, read-only workspace rejection, writable persistent Bridge Home, restart persistence and resource/security options. The regular `npm run check` executes `check:r75`, which always runs the static contract and remote-config checks while reporting runtime as an explicit skip unless this variable is set.

Release CI should additionally publish a manifest for both platforms:

```bash
docker buildx build --platform linux/amd64,linux/arm64 --target bridge \
  -f docker/Dockerfile --push -t registry.example/ngf-agent-bridge:0.1.4 .
```

Multi-architecture publication requires a working BuildKit builder or native runners for both architectures.
