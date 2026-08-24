---
status: completed
created: 2026-08-21
phase: 2/2
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Issue #188: Fix active QA path on Windows (inline jscpd + repair e2e spawns)

Issue: https://github.com/Macacoders/ai-config/issues/188 (repurposed 2026-08-21; original npm-script migration superseded)

## Goal

Make the documented QA gate (`make check`) fully green on the primary Windows dev machine by (a) removing the last bash dependency from the active QA path — inline jscpd into the Makefile, delete `qa/check-duplication` — and (b) fixing the gh-issue e2e suite's Windows spawn failure, plus documenting the GNU-Make-on-Windows prerequisite and correcting stale docs.

## Confirmed decisions

- **QA entry point stays make-only** — npm-script layer rejected as redundant with #177's make-first direction. GNU Make 4.4.1 installed via Chocolatey; `make check-node` verified green on Windows.
- **Branch/close flow** — `gh-issue.ts prclose 188` auto-creates `feature/issue-188-<slug>` from protected `develop`, commits tracked changes (`git add -u`), pushes, opens PR with auto-prepended `Fixes #188`; issue closes at merge; labels move to `status:in-review`.
- **POSIX verification** — no POSIX box available; accept portable-by-construction patterns (`shell: true`, double-quoted globs). Residual risk accepted.
- **jscpd parity** — arguments byte-for-byte identical to deleted wrapper: pattern `**/*.ts`; ignores `.git`/`node_modules`/`base`; threshold 8; min-lines 8; reporters console.
- **e2e fix minimalism** — `shell: true` in the test helper only; no assertion/skip changes.

## Scope Classification

- **Size**: Small — 5 tracked files, net-negative diff (~30 lines).
- **Phase budget**: 2 (+ standard close workflow).
- **Phase budget rationale**: The two fixes are mechanically independent with independent revert paths; splitting gives each a reviewable deliverable and its own validation gate. Delivery stays a workflow step (single prclose commit), not a third phase.
- **Quick delivery eligible**: Yes — user elected the staged/planned path.
- **Split required**: No.
- **Architect review**: Not required (no architecture-boundary change).
- **Constraint**: All changed files must stay tracked — prclose stages tracked files only (`git add -u`). Current set qualifies: Makefile, AGENTS.md, README.md, qa/check-duplication (deletion), tests/typescript/gh-issue/e2e.test.ts.

## Evidence baseline (2026-08-21, Windows 11, GNU Make 4.4.1)

- `make check-node` ✅ green (tsc + eslint + prettier)
- `make check-duplication` ❌ `CreateProcess(NULL, env bash ...\qa\check-duplication) failed` Error 2
- `npx vitest run`: 245 passed / 12 failed / 2 skipped — all failures in `tests/typescript/gh-issue/e2e.test.ts`; root cause: `spawnSync('npx', ...)` without `shell: true` cannot execute npx `.cmd` shim on Windows
- Repo has no CI workflows

## Phase 1: Inline duplication check + Windows-prerequisite documentation

**Scope**:

1. `Makefile`
   - `check-duplication:` → single-line direct recipe:
     `npx --yes jscpd --pattern "**/*.ts" --ignore "**/.git/**" --ignore "**/node_modules/**" --ignore "**/base/**" --threshold 8 --min-lines 8 --reporters console`
     (single physical line: make handles backslash-newline continuations differently between sh and cmd fallback)
   - `check:` → replace `./qa/check-duplication` with `@$(MAKE) check-duplication` (mirrors existing `check-node` recursion)
   - Add ponytail-style rung-2 inline comment (matches existing Makefile convention)
2. Delete `qa/check-duplication`
3. `AGENTS.md` Build/Test Commands — duplication entry corrected `.sh/.ps1` → `.ts`; add GNU Make prerequisite note (Windows: not preinstalled — `choco install make`, verified working 4.4.1)
4. `README.md` — same prerequisite note where make commands are referenced (~line 130 area)

**Acceptance criteria**:

- [x] `make check-duplication` passes on Windows PowerShell
- [x] `make check-node` still green (untouched path)
- [x] `qa/check-duplication` deleted; zero remaining references outside historical `docs/ai/plans/**` (sole exception: plan-mandated ponytail comment in Makefile naming the deletion)
- [x] jscpd args parity confirmed against wrapper quoted in #188 (byte-for-byte)
- [x] AGENTS.md duplication entry says `.ts`; AGENTS.md + README state the GNU Make prerequisite with `choco install make`

**Validation evidence (2026-08-22, Windows 11, GNU Make 4.4.1)**: `make check-duplication` green — 6.97% duplicated lines vs 8% threshold (first successful Windows run); `make check-node` green.

**Risks**:

- jscpd threshold may legitimately fail — wrapper never ran successfully on Windows, so parity is unproven there. If it fails: stop and report; do NOT silently tune thresholds/ignores.

## Phase 2: Repair gh-issue e2e suite spawn mechanics

**Scope**:

- `tests/typescript/gh-issue/e2e.test.ts` — `run()` helper: add `shell: true` to `spawnSync('npx', ...)` with a brief comment explaining the Windows `.cmd`-shim constraint
  - **Implemented addition (2026-08-22, within helper-only constraint)**: `shell: true` alone left 2 failures — cmd.exe splits multi-word args unescaped (DEP0190), verified manually (`create E2E Test Issue` → `Error: unknown create option: Test`, exit 1). Fixed by quoting whitespace-containing args inside the same `run()` helper. No assertion/skip/timeout changes.
- No assertion changes, no skips, no new dependencies

**Acceptance criteria**:

- [x] `npx vitest run tests/typescript/gh-issue` → 0 failed (145 passed)
- [x] Full `npx vitest run` → 0 failed overall (257 passed, 2 skipped)
- [x] Full capstone: `make check` passes end-to-end on Windows for the first time (vitest → check-node → duplication) — verified 2026-08-22
- [x] Diff touches only the `run()` helper + comment

**Risks**:

- npm notice noise may appear on stderr under `shell: true` — assertions use `toContain`, unaffected.
- POSIX regression — `shell: true` is standard-portable; residual risk accepted (no POSIX machine available).

## Close workflow (after both phases approved)

1. Write `temp/pr-body-188.md` (summary of both fixes + validation evidence)
2. `gh-issue.ts --dry-run prclose 188` → inspect → real `prclose 188 <completion-summary>`
3. Verify: feature branch created, PR opened with `Fixes #188`, labels → `status:in-review`
4. Post-merge: verify #188 auto-closed
5. Memory duties: plan status → `completed`; ADR for "make-only QA entry point" decision (#177 coordination); monthly log line

## Validation Strategy

| Gate | Command | Expected |
|---|---|---|
| Phase 1 targeted | `make check-duplication` | green (first time on Windows) |
| Phase 1 regression | `make check-node` | still green |
| Phase 2 targeted | `npx vitest run tests/typescript/gh-issue` | 0 failed |
| Phase 2 full | `npx vitest run` | 0 failed |
| Capstone | `make check` | green end-to-end |
| Static | reference greps + docs checks | clean |
| Delivery | dry-run then real `prclose 188` | PR URL + label flip |
| Post-merge | issue state | closed |

## Decisions To Record

1. **QA entry point stays make-only** — ADR at close (durable: #177 will grow Makefile surface)
2. **Windows prerequisite: GNU Make via Chocolatey** — docs (AGENTS.md/README), not an ADR
3. **e2e cross-platform spawn = `shell: true`** — inline code comment suffices

## Repository root for implementation handoffs

`C:\DEV\ai-config`
