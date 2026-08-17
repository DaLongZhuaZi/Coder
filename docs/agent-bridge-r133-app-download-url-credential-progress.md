# R133 App download URL credential boundary

## Scope

R133 closes a concrete security sub-stage for Paseo alignment items 16, 23B and 23D. It removes an unused Bridge credential query parameter from App download requests while preserving the existing one-time `/download/<token>` protocol.

## Implementation

- `NGFAgentHomePage.ets` now builds download URLs from the Bridge endpoint and the server-issued `downloadPath` only.
- Message attachment, workspace preview image and generic Bridge download paths no longer pass `activeBridgeCredential` to the URL builder.
- The Bridge route continues to extract the path token and calls `workspaceService.consumeDownloadToken(token)`; no RPC or server route change was required.
- `check-protocol-alignment-smoke.js` asserts the App signature has no credential parameter, rejects the old `token=` query construction, and verifies the Bridge path-token consumer.

## Verification

- `node --check scripts/check-protocol-alignment-smoke.js`: passed.
- `node scripts/check-protocol-alignment-smoke.js`: passed (`protocol alignment smoke ok`).
- `git diff --check` for the changed sources: no whitespace errors; existing LF/CRLF normalization warning only.
- SDK 23 `assembleHap --no-daemon --stacktrace`: passed on retry after an initial transient `.hvigor` build-log `EBUSY`; HAP `entry/build/default/outputs/default/entry-default-signed.hap`, 14,522,413 bytes, SHA-256 `29837DC68661EBBE38F14CF917D36EF0BE405AC7A77908FEC458AED8DD2EC638`.
- Bridge full `npm --prefix tools/agent-bridge run check` with `AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND=system-conpty`: passed.
- No device was installed, started, inspected or tested.

## Boundary

This change prevents a local App-to-Bridge credential from entering download URLs, proxy logs or access logs. It does not prove a supported Browser platform host, real browser upload/download, Web UI field behavior, or HarmonyOS device behavior. Items 16, 23B and 23D therefore remain `部分实现`; those现场验收 gates are unchanged.
