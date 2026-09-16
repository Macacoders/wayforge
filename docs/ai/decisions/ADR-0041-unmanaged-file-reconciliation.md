# ADR-0041: Unmanaged File Reconciliation During Install

**Date**: 2026-09-16
**Status**: Accepted

## Context

`.ai-config-managed` is a copy ledger: `initManagedManifest` creates an empty `.ai-config-managed.tmp`, `managedTrackFile`/`addManagedPath` appends only files actually copied, and `finalizeManagedManifest` renames the temp file to the final manifest. Files skipped as "unmanaged conflict" were never tracked, silently orphaning agent/command/skill/plugin files in the target repo that happened to match a `base/opencode` template. Stale content persisted and the normal permission-injection flow did not run for those files.

The previous `--force` contract regenerated managed files, but matching unmanaged files under `.opencode/{agents,commands,skills,plugins}` were still preserved. User-only files (no `base/opencode` counterpart) must remain untouched in all cases.

## Decision

1. During install, after `initManagedManifest` and before syncing files, detect unmanaged conflicts: walk `base/opencode/{agents,commands,skills,plugins}` and report any target path that exists but is **not** managed (`!isManagedFile(target)`). Reuse existing `walkFiles`/`posixPath` from `cli/src/lib/manifest.ts`.

2. Resolve conflicts as follows:
   - **`--force`**: override all matching unmanaged files.
   - **Interactive TTY**: print a single aggregate list and prompt once with "Override these N file(s) with the managed templates? [y/N]".
   - **Non-TTY (CI/piped)**: print a warning listing the conflicts and preserve the local files.
   - **`--dry-run`**: log what would be prompted/overridden and preserve everything.

3. `--force` now overrides matching unmanaged agent/command/skill/plugin files while preserving user-only files that have no bundled template counterpart.

4. Override means **overwrite + track**: the destination file is copied from `base/opencode` and added to `.ai-config-managed`, so the existing permission-injection flow applies.

5. No new runtime dependencies: the prompt reuses `node:readline/promises` through `cli/src/lib/prompt.ts`.

## Consequences

- Matching unmanaged files are no longer silently orphaned; stale content is refreshed when the user opts in or uses `--force`.
- `--force` is now a stronger "reset to bundled templates" switch, but it still respects user-only files that have no `base/opencode` counterpart.
- The installer gains a small async reconciliation step (`cli/src/lib/reconcile.ts`) that runs after manifest initialization and before file sync.
- Detection and tracking reuse existing manifest utilities; the change is localized to install orchestration and the two sync functions.

## Residual Risks & Follow-Ups

- The aggregate prompt is all-or-nothing; per-item override is deferred.
- Files removed from `base/opencode` but left in the target repo are still not deleted by the installer.
