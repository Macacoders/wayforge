---
status: completed
created: 2026-07-10
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: false
---

# Plan: Remove stale PATs from .gh-config (Issue #107)

## Goal

Add a silent, dry-run-aware cleanup step in the CLI installer that removes legacy PAT files (`.gh-config/hosts.yml`, `.gh-config/_config.yml`) on install/upgrade, marked as temporal for future ponytail harvest.

## Questions Answered

- Cleanup targets: `hosts.yml` and `_config.yml` (the two files ADR-0016 recorded)
- Messaging: Silent — no `ctx.log()` calls for cleanup
- Dry-run: Respected — files are not deleted during `--dry-run`
- Ponytail marker: Add `// ponytail: temporal — ...` comment for ponytail-audit detection

## Assumptions

- Auth is fully migrated to device flow (`gh-app-auth.ts`) — PAT removal is safe.
- No tests needed: mechanical cleanup of files that no longer exist in new installs; existing validation commands (`make check`) suffice.
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

### Phase 1: Add legacy PAT cleanup to CLI installer

**Scope:**
In `cli/src/commands/install.ts`, add a cleanup step after the existing `.gh-config/app.yml` block (around line 315) that removes `.gh-config/hosts.yml` and `.gh-config/_config.yml` from the target repo if they exist.

**Acceptance criteria:**
- [ ] On install/upgrade, legacy PAT files are silently removed from the target repo's `.gh-config/` directory
- [ ] `--dry-run` does not delete files (silently skips)
- [ ] Cleanup code includes a `// ponytail: temporal — ...` comment marking it for future harvest
- [ ] `npx vitest run` passes with no regressions
- [ ] `make check` passes

**Risks:**
- None: File removal on a directory that already holds managed files; no runtime impact.

## Validation Strategy

1. Run `npx vitest run` to confirm no test regressions
2. Run `make check` for full QA (type-check, lint, format, duplication)
3. Manual dry-run verification: `npx tsx cli/src/index.ts install --repo /tmp/test-repo --dry-run`

## Decisions To Record

- None: This is a mechanical safety-net addition, not an architectural decision. ADR-0016 already covers the device-flow migration.

## Repository root

`C:\DEV\ai-config`
