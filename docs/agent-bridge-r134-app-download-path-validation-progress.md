# R134 App download path validation

## Scope

R134 extends the R133 download boundary so an authenticated Bridge response cannot make the App request an arbitrary URL or path. It preserves the existing `/download/<one-time-token>` protocol and does not change the server route.

## Implementation

- `NGFAgentHomePage.ets` adds `isSafeBridgeDownloadPath()` before URL construction.
- Only a non-empty single token segment below `/download/` is accepted.
- Absolute/external schemes, extra path segments, query or fragment injection, backslashes, percent-encoded path injection and ASCII control characters are rejected.
- Invalid values throw before `http.createHttp().request()` is reached; valid legacy token characters remain accepted.
- `check-protocol-alignment-smoke.js` asserts the validator and fail-closed construction are present, while retaining the R133 credential and server path-token assertions.

## Verification

- `node --check scripts/check-protocol-alignment-smoke.js`: passed.
- `node scripts/check-protocol-alignment-smoke.js`: passed (`protocol alignment smoke ok`).
- `git diff --check` for the changed sources: no whitespace errors; existing LF/CRLF normalization warning only.
- SDK 23 HAP and Bridge full check are pending for this R134 change.
- No device was installed, started, inspected or tested.

## Boundary

R134 closes the App-side path injection sub-stage for items 16, 23B and 23D. It does not provide a supported Browser platform host, real browser upload/download, Web multi-tab field validation, or HarmonyOS device evidence. Those items remain `部分实现`.

