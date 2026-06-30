# Plan: QA Infrastructure Cleanup (Issue #148)

## Goal
Deliver all 7 QA infrastructure cleanup items from Issue #148, keeping `make check` passing. Acknowledges that install/release scripts are being migrated to TS under Issue #131 (separate scope).

## Scope Classification
- Size: single-phase-per-deliverable (implemented as 2 reviewable phases)
- Phase budget: 2
- Phase budget rationale: Phase 1 handles all script changes (shared helpers extraction, check-powershell scoping, check-bats simplification). Phase 2 handles Makefile cleanup and install-deps simplification. Split ensures script changes are reviewed before Makefile is updated.
- Quick delivery eligible: No (7 acceptance criteria across multiple files)

## Phase 1: Script simplifications & shared helpers — ✅ Complete
**Scope:**
- Create `qa/_helpers.sh` with `run_pwsh_heredoc()` and `find_bash_files()`
- Source it in: `check-bash`, `check-pester`, `check-powershell`, `coverage-powershell`, `fix-bash`, `install-deps`
- Scope `check-powershell` to PSScriptAnalyzer only (remove Pester block)
- Remove `check-bats` directory existence double guard

**Acceptance criteria:**
- [x] `qa/_helpers.sh` exists with both shared functions
- [x] 6 consumer scripts source it and use shared functions
- [x] `check-powershell` no longer runs Pester
- [x] `check-bats` has no redundant directory check
- [x] `make check-bash`, `make check-powershell`, `make check-tests` still work

**Risks:** Low — mechanical extractions; sourcing errors caught by validation

## Phase 2: Makefile cleanup & install-deps simplification — ✅ Complete
**Scope:**
- Lightly simplify `qa/install-deps` (shorter, acknowledging #131 may port it later)
- Remove Makefile duplicate aliases: `qa`, `bash-format`, `bash-lint`
- Unify `check-ts` to use `./qa/check-ts` pattern
- Remove `coverage-bash` and `coverage-powershell` Makefile targets; keep only `coverage`

**Acceptance criteria:**
- [x] `qa/install-deps` simplified (lighter touch)
- [x] Makefile duplicate aliases removed
- [x] `check-ts` uses `./qa/` pattern
- [x] Only `coverage` Makefile target remains
- [x] `make check` passes

**Risks:** Low — Makefile changes are cosmetic

## Validation Strategy
- `make check` after each phase
- No test invocation needed (mechanical/config changes)
