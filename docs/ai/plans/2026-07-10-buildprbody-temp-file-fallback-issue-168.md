---
status: completed
created: 2026-07-10
phase: 1/1
completed: 2026-07-10
required_gates:
  test_verdict: pass
  memory_update: pass
---

# Issue #168 — Fix `buildPRBody()` to read `temp/pr-body-<issue>.md` before falling back

## Goal

Fix `buildPRBody()` in `gh-issue.ts` to implement the agent pre-population mode specified in ADR-0027: read `temp/pr-body-<issue>.md` when it exists (prepended with `Fixes #N`) before falling back to `.github/pull_request_template.md` or the hardcoded template. Clean up the temp file after consumption.

## Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Test-only or implement + test? | **Both** — implement the fix and write the missing test. |
| Q2 | Clean up temp file after consuming? | **Yes** — delete after consumed. |
| Q3 | Any callers besides `prclose`? | **No.** `buildPRBody()` is called from exactly one place: `cmdPrclose` (line 849). Also exported for tests (line 983). No other callers exist. |

## Assumptions

- The proposed fix in the issue description is the intended approach (temp-file check inserted before template check).
- Cleanup happens in `cmdPrclose` after the PR body is consumed (safer — if PR creation fails, the temp file remains for retry).
- ADR-0027 already documents the two-mode workflow (lines 21–24) — the code needs to match the spec.
- ADR-0017's M2 "documentation" of the temp-file fallback is purely documentary; the code change aligns implementation with the documented spec.
- Existing tests (template exists / no template) must continue to pass.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Small, well-understood bug fix |
| **Phase budget** | **1 phase** |
| **Phase budget rationale** | Single function change + one new test case + temp-file cleanup + documentation update. Independent, testable in one pass. |
| **Quick delivery eligible** | Yes — single file change, well-scoped, low risk |
| **Split required** | No |

## Phase 1: Implement temp-file fallback in `buildPRBody()`

**Scope:**

1. **`base/opencode/skills/shared-task/scripts/gh-issue.ts`** — Modify `buildPRBody()` (line 373):
   - Add `path.join(repoRoot, 'temp', `pr-body-${issueNumber}.md`)` check via `existsSync()`
   - If temp file exists: read it verbatim, prepend `Fixes #N\n\n`, return body
   - If temp file doesn't exist: fall through to existing template/hardcoded logic

2. **`base/opencode/skills/shared-task/scripts/gh-issue.ts`** — Add temp-file cleanup in `cmdPrclose()` after the PR body is used:
   - After `apiPost` creates the PR, if temp file exists, `unlinkSync()` it
   - Wrap in try/catch to tolerate ENOENT gracefully
   - This preserves the temp file if PR creation fails (retry-friendly)

3. **`tests/typescript/gh-issue/gh-issue.test.ts`** — Add third test case in the `buildPRBody` describe block:
   - Mock `existsSync` returning `true` for the temp path → `false` for template path
   - Mock `readFileSync` returning custom content for the temp path
   - Assert `body` starts with `Fixes #1` and contains the custom content

4. **`docs/ai/decisions/ADR-0017-single-ts-gh-issue.md`** — Update M2 documentation to note that the temp-file fallback is now implemented in code (not just documented).

**Acceptance criteria:**

- [ ] `buildPRBody()` reads `temp/pr-body-<issue>.md` when it exists and uses it verbatim (with `Fixes #N` prepended)
- [ ] When no temp file exists, the existing fallback chain is preserved: `.github/pull_request_template.md` → hardcoded template
- [ ] Temp file is cleaned up (`unlinkSync`) after PR is created; preserved if PR creation fails
- [ ] New test case covers the temp-file read path
- [ ] All existing `buildPRBody` tests continue to pass
- [ ] `npx vitest run` passes
- [ ] `make check-node` passes

**Risks:**

- Low — localized change to a single function + one new test case
- The mock setup for the temp path needs care: `existsSync` is called multiple times in `buildPRBody` (one for temp, one for template) — the test must mock returns in the correct order
- Temp file cleanup must handle the case where the temp file was already deleted externally (no crash on ENOENT)

## Validation Strategy

| Check | How |
|-------|-----|
| Unit tests | `npx vitest run` — verify new test + existing pass |
| Type check | `make check-node` |
| Doc consistency | Verify `issue.md` line 35 contract matches behavior |

## Decisions To Record

| Decision | Value |
|----------|-------|
| Cleanup timing | After `apiPost` succeeds (not inside `buildPRBody`) — preserves temp file for retry on failure |
| Cleanup safety | Wrap `unlinkSync` in try/catch — tolerate ENOENT gracefully |
