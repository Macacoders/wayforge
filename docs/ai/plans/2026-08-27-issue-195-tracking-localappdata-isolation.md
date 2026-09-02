---
status: in-progress
created: 2026-08-27
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Issue #195: Isolate LOCALAPPDATA in cli tracking unit test for native-Windows parity

Issue: https://github.com/Macacoders/ai-config/issues/195

## Goal

Make `cli/tests/unit/tracking.test.ts` pass on native Windows (and all platforms) by stubbing `LOCALAPPDATA` in the test's `beforeEach`, so `resolveStateDir()` uses the mocked `os.homedir` instead of the real per-user AppData path. This is a test-environment isolation fix only — no production code change.

## Confirmed decisions

- **Approach: Option A (minimal env stub)** — add `vi.stubEnv("LOCALAPPDATA", "")` to the test's `beforeEach`, next to the existing `WSL_DISTRO_NAME` stub. Rejected Option B (making `resolveStateDir()` injectable/overridable) as speculative abstraction violating the repo's ponytail/yagni discipline: it would touch production code and all call sites purely to serve a test.
- **Delivery path: quick delivery** — user explicitly confirmed `/quick` for this XS, single-line, low-risk change.
- **Linux/macOS/CI impact: none** — `LOCALAPPDATA` is absent on Linux; stubbing it to `""` (falsy) makes `if (localAppData)` false, the same `os.homedir()` branch Linux already takes. The only other `LOCALAPPDATA` reference in the repo is the PowerShell installer (`install/install.ps1`), untouched.
- **Cleanup** — existing `afterEach` already calls `vi.unstubAllEnvs()`, so stub isolation is automatic and non-leaking.
- **Not implemented yet** — plan persisted per user instruction; implementation deferred until planner handoff.

## Scope Classification

- **Size**: XS — single-line test-fixture change in one tracked file.
- **Phase budget**: 1.
- **Phase budget rationale**: One mechanical, low-risk edit; phase economy keeps it a single phase.
- **Quick delivery eligible**: Yes — confirmed by user.
- **Split required**: No.
- **Architect review**: Not required (no architecture-boundary change; test-only).

## Phase 1: Isolate `LOCALAPPDATA` in tracking unit test

**Scope**:

1. `cli/tests/unit/tracking.test.ts`
   - In `beforeEach` (line 39, next to the existing `vi.stubEnv("WSL_DISTRO_NAME", "")`), add:
     ```ts
     vi.stubEnv("LOCALAPPDATA", "");
     ```

**Acceptance criteria**:

- [ ] `npx vitest run cli/tests/unit/tracking.test.ts` passes all 10 tests on this native-Windows box (with `LOCALAPPDATA` set).
- [ ] No test writes to the real user AppData path during the run.
- [ ] No production source files changed; diff limited to the single test file.
- [ ] Linux/macOS/CI behavior unchanged (stub is env-isolation only).

**Risks**: Minimal/none. Isolated to test setup; follows the file's existing env-stubbing pattern.

## Validation Strategy

- Run `npx vitest run cli/tests/unit/tracking.test.ts` post-change (reproduces the current 6 failures; expects 0).
- Optional `make check-node` lint/type-check to confirm no unrelated regression (change is test-only).

## Decisions To Record

- **ADR**: None needed — test-only fix with no durable architectural decision. Recorded in this plan's "Confirmed decisions" section instead.

## Plan Status Convention

`status: planned`, `phase: 1/1`. On handoff to quick delivery, set `status: in-progress`; on completion and review, set `status: completed`.
