ARG NODE_IMAGE=node:22-bookworm-slim
ARG BUILD_NODE_IMAGE=node:22-bookworm

FROM ${BUILD_NODE_IMAGE} AS dependencies
WORKDIR /opt/ngf-agent-bridge
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && node -e "require('node-pty'); process.stdout.write('node-pty ok\n')" \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG AGENT_BRIDGE_VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="NGF Agent Bridge" \
  org.opencontainers.image.description="Containerized NGF Agent Bridge daemon and management CLI" \
  org.opencontainers.image.version="${AGENT_BRIDGE_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}" \
  org.opencontainers.image.created="${BUILD_DATE}" \
  org.opencontainers.image.source="https://github.com/dlzz/ngf" \
  io.ngf.agent-bridge.components="bridge,cli,web-ui" \
  io.ngf.agent-bridge.web-ui="static-same-origin"

ENV NODE_ENV=production \
  NO_COLOR=1 \
  HOME=/home/ngf \
  AGENT_BRIDGE_CONTAINER=1 \
  AGENT_BRIDGE_HOME=/data \
  AGENT_BRIDGE_HOST=0.0.0.0 \
  AGENT_BRIDGE_PORT=8787 \
  AGENT_BRIDGE_ARCHIVE_TOOL=bsdtar

RUN apt-get -o Acquire::Retries=3 update \
  && installed=0 \
  && for attempt in 1 2 3; do \
       if apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates git libarchive-tools openssh-client tini; then installed=1; break; fi; \
       apt-get -o Acquire::Retries=3 update; \
     done \
  && test "$installed" = "1" \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 ngf \
  && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/ngf --shell /bin/sh ngf \
  && mkdir -p /data /workspace /opt/ngf/providers \
  && chown -R 10001:10001 /data /workspace /home/ngf /opt/ngf/providers

WORKDIR /opt/ngf-agent-bridge
COPY --from=dependencies --chown=10001:10001 /opt/ngf-agent-bridge/node_modules ./node_modules
COPY --chown=10001:10001 package.json package-lock.json README.md ./
COPY --chown=10001:10001 src ./src
COPY --chown=10001:10001 scripts ./scripts
COPY --chown=10001:10001 docker/healthcheck.js ./docker/healthcheck.js
COPY --chown=10001:10001 src/web ./src/web

USER 10001:10001
WORKDIR /workspace
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/opt/ngf-agent-bridge/docker/healthcheck.js"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/opt/ngf-agent-bridge/src/supervisor-entrypoint.js"]

FROM runtime AS cli
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/ngf-agent-bridge/src/desktop-launcher.js"]
CMD ["--help"]

FROM runtime AS bridge
