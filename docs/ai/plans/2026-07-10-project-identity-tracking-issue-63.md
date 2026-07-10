---
status: approved
created: 2026-07-10
phase: 1/1
required_gates:
  test_verdict: true
  memory_update: true
---

# Issue #63 — Update installed-project tracking on project rename instead of appending a new entry

## Goal

Stop appending duplicate entries to `installed-projects.json` when a managed project is renamed or moved. Introduce a stable `projectId` (UUIDv4) stored in `.ai-config-managed` so the tracking system can recognize the same logical project after a path change and update its record in-place.

## Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Which installer surfaces? | **TS CLI only** — `cli/src/lib/tracking.ts` is the primary path. Legacy Bash/PowerShell are out of scope. |
| Q2 | UUID vs hash? | **UUIDv4** — stored in `.ai-config-managed`. A hash offers no advantage over stored UUID and adds complexity. |
| Q3 | Which fields to refresh on match? | **All fields** — `name`, `path`, `lastUpdated`, `aiConfigVersion`, `installRef`. |
| + | Existing projects without ID? | Assigned a UUID on next reinstall (upgrade path). |

## Assumptions

- `projectId` is generated via `crypto.randomUUID()` on first install, written to `.ai-config-managed` as `project_id: <uuid>`.
- On reinstall (refresh): existing `projectId` is read from `.ai-config-managed` and preserved in the new manifest.
- Tracking match order: (1) `projectId` match → (2) fallback to `path` match (backward compat) → (3) append new entry.
- The `ManifestContext` class carries `projectId` through the install lifecycle (set in `initManagedManifest`, consumed by `trackInstalledProject`).
- `--force`, `--dry-run`, `--no-track` continue to skip tracking entirely.
- New tests for `tracking.ts` cover: projectId rename, path fallback, upgrade from old format, dry-run, force, no-track, temp-path skip.
- Legacy installers (`install/legacy/`) are **not** updated — documented scope boundary.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Small-medium, well-understood |
| **Phase budget** | **1 phase** |
| **Phase budget rationale** | All changes are in the TS CLI installer stack (manifest → context → tracking → install command). Tightly coupled — splitting would create incomplete intermediate states. |
| **Quick delivery eligible** | No — touches 4 TS CLI files + new tests, needs test infrastructure setup for `tracking.ts` which currently has zero test coverage. |
| **Split required** | No |

## Phase 1: ProjectId identity for installed-project tracking

### Scope

| # | File | Change |
|---|------|--------|
| 1 | `cli/src/lib/context.ts` | Add `projectId: string` field to `ManifestContext` class (initialized to empty string, set during manifest init). |
| 2 | `cli/src/lib/manifest.ts` | **`initManagedManifest`**: Generate UUID via `crypto.randomUUID()`, write `project_id: <uuid>\n` to `.ai-config-managed.tmp` header, store in `ctx.projectId`. If `.ai-config-managed` already exists (reinstall from previous install), read and preserve existing `projectId`. |
| 2b | `cli/src/lib/manifest.ts` | Add `readManagedProjectId(repo: string): string \| null` helper — reads `project_id` from the final `.ai-config-managed` file. Returns `null` if file or field absent. |
| 3 | `cli/src/lib/tracking.ts` | Modify `trackInstalledProject` to accept `projectId: string` parameter. Change match logic: (a) if any entry has matching `projectId`, update all fields in-place; (b) else if any entry has matching `path`, return (existing dedup); (c) else append new entry with `projectId`. |
| 4 | `cli/src/commands/install.ts` | Pass `ctx.projectId` to both `trackInstalledProject` call sites (lines 257, 317). Ensure `initManagedManifest` (which generates projectId) is called before tracking on both code paths. |
| 5 | `tests/typescript/` | New test file or describe block for `tracking.ts` covering: fresh install with projectId, rename (same projectId, new path) updates entry, same path reinstall is idempotent, upgrade from old format (no projectId) assigns one, dry-run/force/no-track skip, temp-path skip. |
| 6 | `docs/ai/architecture.md` | Update §"Installed Projects Tracking" to document `projectId` identity mechanism and match-order logic. |

### Acceptance criteria

- [ ] Project renamed and reinstalled → existing `installed-projects.json` entry is **updated** (name, path, lastUpdated, aiConfigVersion, installRef) instead of appending a duplicate.
- [ ] Same project, same path, reinstall → idempotent (updates lastUpdated only, no duplicate).
- [ ] Existing project (from old format, no `projectId` in `.ai-config-managed`) → on reinstall, UUID generated, written to manifest, and used for future matching.
- [ ] `--force`, `--dry-run`, `--no-track` all skip tracking entirely (unchanged behavior).
- [ ] All new tracking tests pass.
- [ ] `npx vitest run` passes (existing CLI tests unaffected).
- [ ] `npx tsx cli/src/index.ts --help` loads without error.
- [ ] `docs/ai/architecture.md` updated with projectId contract.

### Risks

| Risk | Mitigation |
|------|------------|
| Timing: `trackInstalledProject` called before `initManagedManifest` on one code path | Audit both call sites in `install.ts` (lines 257, 317). If order is wrong, move tracking after finalization or ensure projectId is pre-generated. |
| Existing `.ai-config-managed.tmp` leftover from a failed install could shadow final manifest | `initManagedManifest` already handles this — it always creates a fresh `.tmp`. We read `projectId` from the **final** `.ai-config-managed` for reinstall detection. |
| `crypto.randomUUID()` availability | Available in Node.js 19+ and via `crypto.webcrypto.randomUUID()`. Need to verify Node 18 compat or use `crypto.randomUUID()` (available since Node 14.17). |
| Test mocking for `crypto.randomUUID()` | Mock at the module level or inject a deterministic UUID in test setup. |

## Validation Strategy

| Check | How |
|-------|-----|
| Unit tests (tracking) | `npx vitest run` — new describe block for `trackInstalledProject` with projectId scenarios |
| Existing CLI tests | `npx vitest run` — all existing 88+ tests continue to pass |
| Type check | `npx tsc --noEmit -p cli/tsconfig.json` |
| Manual smoke (rename) | Rename a test project dir, reinstall with `--dry-run`, inspect logging output for update vs append |
| Manifest format check | Inspect `.ai-config-managed` after install — verify `project_id` field present |

## Decisions To Record

| Decision | Value |
|----------|-------|
| Identity mechanism | UUIDv4 (`crypto.randomUUID()`), stored as `project_id` in `.ai-config-managed` |
| Match order | projectId → path → append |
| Existing projects without ID | Generate UUID on next reinstall (upgrade path) |
| Legacy installers | Out of scope — TS CLI only |
| `ManifestContext.projectId` | Carried through install lifecycle; set during `initManagedManifest`, consumed by `trackInstalledProject` |
| Temp file timing | `projectId` written to `.ai-config-managed.tmp` in `initManagedManifest`; for reinstall detection, read from **final** `.ai-config-managed` (which exists from a previous successful install) |
