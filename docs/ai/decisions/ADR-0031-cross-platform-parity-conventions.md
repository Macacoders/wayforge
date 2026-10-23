# ADR-0031: Cross-platform parity conventions (Windows == Linux)

**Date**: 2026-08-06
**Status**: Accepted
**Amended**: 2026-08-25 — noted one accepted exception to Decision 5: `cli/src/lib/tracking.ts` `isTempPath()` gates `%TEMP%` handling on `process.platform === 'win32'` (pre-existing). This is the single `win32` platform check in the codebase; it is documented here rather than churned.
**Amended**: 2026-10-23 — the PR-specific `win32` exception is narrowed to `cli/src/lib/upgrade.ts` platform-derived checks (asset naming, chmod skip); the existing `cli/src/lib/tracking.ts` `%TEMP%` exception remains, and the former `cli/src/lib/release.ts` state-directory exception is removed with the update cache; see ADR-0047 Decision 5.

## Context

The repo is developed on Linux CI and Windows workstations. On Windows, `core.autocrlf`/`.gitattributes` produce CRLF working trees while the git index stays LF, and Windows filesystem semantics differ from Linux (symlink creation requires admin or Developer Mode; path separator is `\`). Three bug classes resulted:

1. CRLF fragment files (`base/opencode/config/**`) leaked `\r` into generated `opencode.jsonc` (mixed EOLs) and broke LF-expecting unit tests — a Windows-only failure invisible on Linux CI.
2. Installer discovery loops built `relPath` from `path.relative(...)`, which yields backslash paths on Windows that never match the posix paths stored in `.ai-config-managed` — causing phantom "new managed path discovered" logs and redundant re-copies on every refresh.
3. Symlink-dependent tests crashed with EPERM on Windows without Developer Mode/admin.

## Decision

1. File reads that feed generated output normalize CRLF → LF (e.g. `readFragment` in `cli/src/lib/config-gen.ts`). Generated output is LF-only via `writeFile` on every platform.
2. Manifest paths are posix-only. Any path built for manifest comparison or discovery is normalized via `posixPath` (exported from `cli/src/lib/manifest.ts`).
3. Symlink-dependent tests feature-detect capability with a module-level probe and `it.skipIf(!canSymlink)` — never assume symlinks on Windows.
4. Prettier uses `"endOfLine": "auto"` so formatting gates pass on both LF (CI) and CRLF (Windows) working trees; mixed-EOL files still fail `--check`.
5. No `process.platform === 'win32'` hardcoding. Platform variance is handled by runtime detection only (`path.sep`, symlink probe).

## Consequences

- Generated `opencode.jsonc` is LF-only on every platform.
- Windows refresh is quiet and manifest-stable; no phantom discovery or redundant copies.
- Symlink code paths are covered on Linux/macOS CI and Windows+Developer Mode, documented-skipped elsewhere.
- Formatting gates are platform-agnostic; genuine formatting regressions (quote/semicolon/width) are still caught on both platforms.
- One accepted exception to "no `win32` hardcoding": `tracking.ts` `isTempPath()` uses `process.platform === 'win32'` to gate `%TEMP%` handling. Platform variance elsewhere continues to use runtime detection (`path.sep`, symlink probe).
