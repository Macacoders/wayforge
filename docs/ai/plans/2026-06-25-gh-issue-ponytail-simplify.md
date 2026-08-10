---
status: completed
created: 2026-06-25
phase: 1/1
required_gates:
  test_verdict: true
  memory_update: true
---

# Plan: Ponytail Audit — Simplify gh-issue.ts

**Date:** 2026-06-25
**Status:** ✅ Phase 1 — Complete

## Goal

Address four ponytail audit findings in `gh-issue.ts`: N+1 API waste, overbuilt retry logic, complex slugify, and an inlinable one-caller abstraction. Keep all 85 tests passing.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Single-phase |
| **Phase budget** | 1 |
| **Phase budget rationale** | Four independent changes in one file + test updates. All low/medium risk. Reviewable as a single diff. |

## Phase 1 — Four simplification stages ✅

| Stage | Change | Lines saved |
|-------|--------|-------------|
| S1 | Inline `getMissingRequiredLabels` into `ensureRequiredLabels`/`cmdLabelsCheck`, remove export | −12 |
| S2 | Simplify `slugify` to simple `.slice(0, 60)` (no word-boundary awareness) | −11 |
| S3 | Simplify `api()` retry: one 5xx retry (500ms), no network-error retry, no `Retry-After` parsing | −28 |
| S4 | Fix N+1 issue fetching: `getIssueState`/`getIssueAssigneeCount`/`getIssueFirstAssignee`/`issueHasLabel` accept `GitHubIssue` object; each command handler calls `getIssue()` once | −11 (net, after signature changes) |

## Files Changed

- `base/opencode/skills/shared-task/scripts/gh-issue.ts`: −62 lines net (all 4 stages)
- `tests/typescript/gh-issue/gh-issue.test.ts`: −40 lines (removed `getMissingRequiredLabels` tests, updated `slugify`/`api` test descriptions and assertions)

## Validation

- `npx vitest run`: **85 tests pass** (was 88; −3 removed `getMissingRequiredLabels` tests)
- `npx tsc --noEmit`: gh-issue.ts type-checks clean (pre-existing `gh-app-auth.ts` error unrelated)

## Decisions Recorded

- ADR-0017 updated with simplification summary.
