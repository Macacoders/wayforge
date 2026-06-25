# Plan: Address six low-severity QA findings in gh-issue.ts rewrite (Issue #121)

**Date:** 2026-06-25
**Status:** ✅ Phase 1 — Complete
**Issue:** [#121](https://github.com/Macacoders/ai-config/issues/121)

## Scope

Six independent, low-severity code quality fixes in the `gh-issue.ts` rewrite.

## Phases

### Phase 1 — All six fixes ✅

| Item | Fix | Status |
|------|-----|--------|
| L1 | Throw error in `api()` when body is passed with GET method | ✅ |
| L2 | Fix `slugify` comment to describe word-boundary-aware truncation | ✅ |
| L3 | Delete unused `ambient-types.d.ts` | ✅ |
| L4 | Validate body file before `ensureRequiredLabels()` in `cmdCreate` | ✅ |
| L5 | Tighten `agents.yml` glob from `gh-issue.ts*` to `gh-issue.ts` | ✅ |
| L6 | Add `check-ts` target to `Makefile` | ✅ |

**Files changed:** 4 files, +12/-11 lines
- `base/opencode/skills/shared-task/scripts/gh-issue.ts` (3 edits)
- `base/opencode/permissions/agents.yml` (1 edit)
- `Makefile` (2 edits)
- `base/opencode/skills/shared-task/scripts/ambient-types.d.ts` (deleted)

**Validation:** `npx vitest run` — 88 tests passed.

## Decisions Made

- L1: `api()` throws `Error('GET request must not include a body')` — defensive guard catches programming errors early
- L3: `ambient-types.d.ts` removed — no importers existed; the `open` module it declared is guarded at runtime

## Open Items

- L5 glob `gh-issue.ts` (without trailing `*`) should be verified against OpenCode's permission-matching behavior when the compiled artifacts are regenerated. The previous `gh-issue.ts*` was more permissive but could match backup files.
