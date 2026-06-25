# Issue #120 — Address QA Findings M1–M5 + Add `show` Subcommand

## Goal

Fix five medium-severity QA findings from the `gh-issue.ts` rewrite review and add a `show` subcommand so agents can read issue bodies through the proper tooling instead of ad-hoc API scripts.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Single-phase |
| **Phase budget** | 1 phase |
| **Quick delivery eligible** | No |
| **Split required** | No |

## Phase 1 — Fix QA findings M1–M5 + add `show` subcommand

**Status:** Implemented 2026-06-25

| Item | Change | File(s) |
|------|--------|---------|
| M1 | Move `--dry-run` guard in `cmdPrclose` after `ensureRequiredLabels()` and `ensureOpenIssue()` — validation always runs, even in dry-run mode | `gh-issue.ts` |
| M2 | Document `buildPRBody` graceful temp-file fallback in ADR-0017 | `ADR-0017.md` |
| M3 | Remove dead `&& state !== 'OPEN'` check from `ensureOpenIssue()` | `gh-issue.ts` |
| M4 | Replace `git add -A` with `git add -u` in protected-branch auto-commit path | `gh-issue.ts` |
| M5 | Add tests for: `cmdPrclose` full API flow, `slugify` edge cases, `cmdCreate --body-file=path`, `resolveToken` expired, `cmdClose` PATCH, `cmdRelease` labels | `gh-issue.test.ts` |
| M6 | Add `show <issue-number>` subcommand with human-readable and `--json` output | `gh-issue.ts`, `gh-issue.test.ts` |

## Files Changed

- `base/opencode/skills/shared-task/scripts/gh-issue.ts` (+59/−1): M1, M3, M4, show subcommand
- `tests/typescript/gh-issue/gh-issue.test.ts` (+295/−12): M5 tests, show tests, fix dry-run tests for M1
- `docs/ai/decisions/ADR-0017-single-ts-gh-issue.md` (+2/−1): M2 documentation

## Validation

- `npx vitest run`: 88/88 pass
- `npx tsx .opencode/skills/shared-task/scripts/gh-issue.ts --help`: file loads, show command listed
- `npx tsx .opencode/skills/shared-task/scripts/gh-issue.ts --json check`: existing commands work
