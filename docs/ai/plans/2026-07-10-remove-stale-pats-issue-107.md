---
status: completed
created: 2026-07-10
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: false
---

# Plan: Warn about stale PATs in .gh-config (Issue #107)

## Goal

Add a warning step in the CLI installer that alerts users about legacy PAT files (`.gh-config/hosts.yml`, `.gh-config/_config.yml`) on install/upgrade, but leaves the deletion decision to the user. Marked as temporal for future ponytail harvest.

## Decision

**Option A: Warn, don't delete.** Silent deletion was rejected because `_config.yml` can be user-crafted and consuming projects may still rely on PAT-based auth outside the `/issue` workflow. The installer now logs a `[WARNING]` message for each detected legacy file, recommending manual removal if the user no longer needs PAT-based auth.

## Questions Answered

- Cleanup targets: `hosts.yml` and `_config.yml` (the two files ADR-0016 recorded)
- Messaging: Warning — `ctx.log()` with `[WARNING]` prefix and actionable guidance
- Dry-run: Warnings still fire during dry-run (read-only check, no side effects)
- Ponytail marker: `// ponytail: temporal — remove this warning block once all users have upgraded past July 2026`

## Assumptions

- Auth is fully migrated to device flow (`gh-app-auth.ts`) for `/issue` workflows, but consuming projects may still use PATs for other purposes — silent deletion is unsafe.
- No ADR update needed: ADR-0016 already records the PAT removal and device-flow migration. This is a downstream safety net, not an architectural change.

## Scope Classification

| Attribute | Value |
|-----------|-------|
| Size | XS |
| Phase budget | 1 phase |
| Phase budget rationale | Single file change, one responsibility, no dependencies |
| Quick delivery eligible | Yes — single edit, low risk, mechanical |
| Split required | No |

## Phases

### Phase 1: Add legacy PAT warning to CLI installer

**Scope:**
In `cli/src/commands/install.ts`, add a warning step after the existing `.gh-config/app.yml` block (around line 315) that detects `.gh-config/hosts.yml` and `.gh-config/_config.yml` in the target repo and logs a `[WARNING]` message recommending manual removal.

**Acceptance criteria:**
- [x] On install/upgrade, legacy PAT files are detected and a warning is logged per file
- [x] Warnings fire regardless of `--dry-run` (read-only, no side effects)
- [x] Warning code includes a `// ponytail: temporal — ...` comment marking it for future harvest
- [x] `npx vitest run` passes with no regressions (233/233)
- [x] `make check` passes (type-check, lint, format, duplication)

**Risks:**
- None: Read-only file detection; no files are modified or deleted.

## Validation Strategy

1. Run `npx vitest run` to confirm no test regressions
2. Run `make check` for full QA (type-check, lint, format, duplication)
3. Manual dry-run verification: `npx tsx cli/src/index.ts install --repo /tmp/test-repo --dry-run`

## Decisions To Record

- None: This is a mechanical safety-net addition, not an architectural decision. ADR-0016 already covers the device-flow migration.

## Repository root

`C:\DEV\ai-config`
