# Unmanaged agent/command/skill/plugin reconciliation during install

**Status:** complete

## Goal

When the installer finds an **unmanaged** agent/command/skill/plugin in the target repo whose name matches a `base/opencode` template, warn and offer to override it. Make `--force` override every matching template while preserving any user files that have no `base/opencode` counterpart.

## Resolved decisions

1. **Non-TTY (CI/piped):** print a warning listing the conflicts and preserve the local files (non-destructive); no prompt.
2. **Prompt granularity:** single aggregate prompt — list all conflicts, ask "override all? [y/N]". No per-item interactive flow for now.
3. **Scope:** agents, commands, skills, **and plugins**.

## Background (verified this session)

- `.ai-config-managed` is a **copy ledger**: `initManagedManifest` writes an empty `.tmp`, `managedTrackFile`→`addManagedPath` appends only files actually copied, `finalizeManagedManifest` renames it. Files skipped as "unmanaged conflict" are never tracked.
- The installer preserves unmanaged local files (`skip conflict with unmanaged file (preserving local content)`) in `syncManagedFile` and `syncManagedTree`, even with `--force`.
- "Keep files not in base/opencode" is already true — the installer never deletes files outside the source tree. Only *overwriting matching* unmanaged files needs to change.
- Overriding = overwrite + track, so the existing permission-injection flow applies afterward.

## Phases

### Phase 1: Reconciliation core + single prompt + `--force` override

- Add `overrideUnmanaged: Set<string>` (absolute dst paths) to `ManifestContext` (`cli/src/lib/context.ts`).
- New `cli/src/lib/prompt.ts`: `isInteractive()` + `promptYesNo(question)` (readline-based, no new deps).
- New `cli/src/lib/reconcile.ts`:
  - `findUnmanagedConflicts(repo, sourceDir)`: walk `base/opencode/{agents,commands,skills,plugins}`; conflict = target exists and `!isManagedFile(target)`; returns flat `{ relPath, dstPath }[]` (reuse `walkFiles`/`posixPath` from `manifest.ts`).
  - `resolveUnmanagedConflicts(conflicts, ctx, promptFn)`: `--force` → override all; dry-run → log-only; non-TTY → warn + keep; TTY → single "override all?" prompt.
- Make `doInstall` / `installCommand` async; `install` action awaits; inject `promptFn` (defaults to `promptYesNo`). Run reconcile after `initManagedManifest`, before the sync branches.
- Modify `syncManagedFile` (two "skip unmanaged" branches) and `syncManagedTree` (two branches) to overwrite + track when `ctx.overrideUnmanaged.has(dst)`.

**Acceptance:** `--force` overwrites+track an unmanaged `planner.md`/`plan.md`/skill/plugin matching source and injects its `permission:` block; user-only files untouched; TTY prompts once and honors yes/no; non-TTY warns and preserves.

### Phase 2: Interactive command + tests + docs

- `interactiveCommand` awaits `doInstall`.
- Unit tests: `cli/tests/unit/reconcile.test.ts` (detection, force, non-TTY warn, prompt mock) + manifest sync-override assertions.
- Reconcile pre-existing test breakage: `agents.yml` working-tree edits (removed `/tmp/**`, added `question: allow`) fail 2 `permissions.test.ts` assertions — settle yml + tests together.
- ADR (unmanaged-file reconciliation + new `--force` contract) + `README`/installer doc update.
- `make check` + manual end-to-end (fresh / refresh / unmanaged-conflict).

## Outcome

Both phases completed. Phase 1 added `overrideUnmanaged` to `ManifestContext`, the `prompt.ts` readline utilities, and `reconcile.ts` detection/resolution wired into `doInstall`. Phase 2 fixed the pre-existing `agents.yml` test breakage (restored `/tmp/**`, added `question: allow` assertions), added `cli/tests/unit/manifest-override.test.ts` for sync override behavior, wrote ADR-0041, updated README `--force` docs, and produced a green `make check`.

## Out of scope / deferred

- Per-item interactive override flow (single aggregate prompt for now).
- Deleting orphaned files no longer in `base/opencode` (e.g. stale `quickcode.md`, `taskanalyst.md`, `test.md` in this repo's `.opencode/`).

## Decisions to record (Phase 2)

- ADR: unmanaged-file reconciliation; `--force` = overwrite matching templates, preserve non-matching user files.
