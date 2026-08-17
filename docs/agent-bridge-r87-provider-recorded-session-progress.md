# R87 Provider recorded session and metadata evidence

## Scope

This source milestone strengthens the production usage/metadata chain for alignment items 22 and 34. It does not claim that a recorded fixture is a live Provider or field validation.

## Completed

- [x] Codex usage events preserve authoritative Provider timestamps when `occurredAt`, `completedAtMs`, `timestamp` or equivalent fields are present; missing timestamps keep the existing current-time fallback.
- [x] Codex context compaction notification and completed item are paired by thread/turn. Either arrival order emits one event and the item details win when available. A notification-only compaction is flushed at turn completion.
- [x] Added sanitized protocol-shape fixture covering multi-turn Codex/OpenCode/Gateway usage, OpenCode compaction, quota reset windows and all four metadata kinds.
- [x] Added `scripts/check-provider-recorded-session-smoke.js` to replay real adapter normalizers into `UsageManager`, verify quota reset ordering, compaction de-duplication, metadata usage, manager reconstruction and duplicate replay after a simulated reconnect.
- [x] Added `check:r87` to the Bridge `postcheck` chain.

## Verification performed

```text
node --check src/providers/codex-app-server-provider.js
node --check scripts/check-provider-recorded-session-smoke.js
npm run check:r87
$env:AGENT_BRIDGE_TERMINAL_WINDOWS_BACKEND='system-conpty'; npm run check
git diff --check
```

Result: `provider recorded session smoke ok`; the targeted command and the full Bridge `npm run check` both exited with code `0`. Full `postcheck` executed through `check:r87`; Docker runtime smoke remained the existing explicit opt-in skip. `git diff --check` reported no actual whitespace errors (only the repository's existing LF/CRLF conversion notices).

## Evidence boundary

- The fixture is sanitized protocol-shape evidence, not a live account response and not a basis for claiming real quota or billing support.
- Real Codex/OpenCode/Gateway accounts, quota reset behavior, long-session compaction during network loss, reconnect recovery and App Usage/Diagnostics on `5KLBB25A10203862` remain field acceptance work.
- No HAP was built or installed for this Node-only milestone.
