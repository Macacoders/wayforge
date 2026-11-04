---
status: in-progress
created: 2026-10-27
task: 1/1
required_gates:
  architect_review: true
  memory_update: true
---

# PR #253 / develop integration — Implementation plan

**Goal:** Incorporate the current `develop` changes into PR #253 without losing Issue #227's canonical `.agents/` layout or #254's retirement of frozen legacy installers, so the branch can become mergeable.

**Architecture:** Keep the approved flat `base/{agents,commands,skills,plugins,config,permissions}` source split and `.agents/` install contract from ADR-0046; accept the deletion of `install/legacy/**` and legacy-only test surface from `develop` (#254). Reconcile overlapping test and documentation changes against the combined state, not by restoring obsolete files or reverting either feature.

**Tech Stack:** Git, TypeScript CLI, Vitest, Bash smoke checks, `make check`.

**Scope classification:** `single-task` (one reviewable branch-integration outcome).

**Basis:** Current feature head `734cfc2`, locally available `origin/develop` head `8243db3`, merge base `b24a206` (2026-10-27); `develop` adds #254 (`ce40dbf`) and #257 (`8243db3`). PR #253 reports `CONFLICTING`. The maintainer explicitly chose to resolve this within PR #253, retaining Issue #227's flat `base/` and `.agents/` layout while incorporating #254's retirement. Research identified shared changes in `AGENTS.md`, `docs/ai/architecture.md`, `docs/ai/logs/2026-10.md`, and `cli/tests/integration/run.sh` (deleted on this branch, rewritten as TS-only smoke on develop); the obsolete bats test is deleted on both sides. GitHub's conflict report need not correspond to textual conflict markers in the locally available three-way comparison; verify against the actual integration target before claiming remote mergeability. An unrelated, pre-existing `package-lock.json` worktree modification must not be discarded, resolved by choosing a side, or staged.

**Plan acceptance criteria:**
- The branch contains the chosen `develop` revision (or a subsequently confirmed current develop head), has no unresolved merge entries, and preserves the flattened `base/` and canonical `.agents/` runtime-pointer behavior and tests from Issue #227, including the reviewed config-ownership and dry-run protections.
- The eight retired `install/legacy/**` files and legacy-only bats/Pester tests stay removed. No stale parity workflow, path reference to the deleted scripts, or smoke assertion that Kilo installs under `.opencode/` is reintroduced; the resulting integration-test surface verifies the combined TS installer layout without duplicating existing Vitest coverage unnecessarily.
- Both #254/#257 changes and #227 documentation remain represented: living ADR-0046/ADR-0033, architecture, contributor guidance, release/version notes and a new dated monthly-log entry accurately describe the combined repository. Historical plans and log entries remain historical; do not rewrite them to imply a different earlier scope.
- `make check` and relevant existing shell/PowerShell/CLI validations for changed surviving surfaces pass where agent-owned; final independent functional and architecture review gates pass. The unrelated `package-lock.json` change is left untouched. Do not claim PR mergeability until GitHub confirms it after the integration is pushed with authorization.

### Task 1: Integrate develop without regressing the canonical layout

**Status:** accepted
**Depends on:** none

**Objective:** Deliver a conflict-free integration of `develop` into the Issue #227 branch that keeps `.agents/` behavior, accepts the legacy-installer retirement, and reconciles affected tests and living documentation.

**Context:**
- `cli/src/lib/layout.ts`, `cli/src/commands/install.ts`, `cli/src/lib/pointers.ts`, and `cli/tests/integration/install-layout.test.ts` implement the chosen layout; ADR-0046 records its ownership/pointer policy. The accepted follow-up plan `docs/ai/plans/2026-10-27_153718-issue-227-pr-253-review-follow-up.md` tracks existing human-owned checks still pending.
- On `origin/develop`, #254 removes `install/legacy/**`, `tests/bash/bootstrap_cli.bats`, `tests/powershell/bootstrap.Tests.ps1`, and rewrites `cli/tests/integration/run.sh` to TS-only smoke; this branch deleted `run.sh` in favor of Vitest. `qa/_helpers.sh`, `tests/bash/bashrc_snippet.bats`, `tests/powershell/install.Tests.ps1`, `base/opencode/permissions/agents.yml`, and `base/opencode/skills/shared-task/SKILL.md` have #254 edits that may need placement under flat `base/`. #257 updates PR-close guidance in docs.
- `docs/ai/decisions/ADR-0046-generic-agents-artifact-directory.md` decision 10 currently describes frozen scripts as retained; `origin/develop` amends ADR-0033 to record their removal. `docs/ai/architecture.md`, `AGENTS.md`, `docs/ai/logs/2026-10.md`, `CHANGELOG.md`, and `VERSION` need combined-state inspection rather than taking one side wholesale.

**Acceptance criteria:**
- The integrated branch is descended from the integration target and has no unmerged paths; flat source inputs/content and `.agents/` destinations remain in effect for OpenCode/Kilo, with correct existing pointer, manifest, config-ownership, and dry-run regression coverage.
- #254's retired files remain absent; surviving shell/PowerShell tests and any surviving TS smoke checks target only the TS installer and correct runtime paths. If the feature's Vitest integration tests already cover the smoke behavior, leaving the deleted `run.sh` deleted is acceptable; no legacy parity check returns.
- Living ADR/contributor/architecture/version/release guidance incorporates both #254's executed deletion and Issue #227's layout. A new dated log entry records the integration result and evidence, including that the earlier Issue #227 log/plan statements describe the state *before* #254; the prior records stay intact.
- Independent review can identify which `develop` changes were retained and which conflicting claims/tests were deliberately superseded, with `package-lock.json` still unstaged and unmodified by the integration work.

**Constraints:**
- Do not restore the frozen scripts, reintroduce `base/opencode/`, alter the manifest schema, change pointer fallback, weaken unmanaged-file or read-only dry-run protections, or silently erase #257's PR-close guidance. Do not modify GitHub PR state or push without explicit authorization. Preserve the existing `package-lock.json` worktree change; if it prevents safe integration, stop and request a clean-worktree decision rather than stashing or overwriting it without permission.
- Integrate using existing CLI/test patterns and minimal reconciliation; do not build a new installer or a parallel test harness.

**Validations:**
- `agent`: `git merge-base --is-ancestor <integrated-develop-revision> HEAD` and `git diff --name-only --diff-filter=U` — expected: chosen develop revision is integrated and no unmerged paths remain (check revision immediately before dispatch, without fetching or changing branches during planning).
- `agent`: `make check` — expected: Vitest, typecheck, ESLint, Prettier, and duplication pass for the combined revision.
- `agent`: `make check-bats` — expected: surviving Bash tests pass and no retired bats suite is invoked, if the toolchain is available; report environmental limitations rather than treating them as a product failure.
- `human`: After an explicitly authorized push, check PR #253's GitHub mergeability and CODEOWNERS approval — expected: no base-branch conflict, with any review requirements reported separately. Existing post-fix runtime smoke and real-Windows verification (or explicit waiver) from the Issue #227 follow-up plan remain human-owned; do not claim those gates passed on the basis of local tests.

**Proposed commit message:** `merge: reconcile develop legacy retirement with issue #227 layout`

## Required gates and handoff

- `architect_review`: independently verify ADR-0046/ADR-0033 alignment, canonical layout, ownership and dry-run safety across the combined revision.
- `memory_update`: append integration evidence to the current monthly log and correct *living* references to retained frozen scripts; preserve historical plans and entries.
- Task review must cover actual integrated diff and the combined test surface; no per-task approval is needed after this plan is approved. If `develop` changes materially before integration, recheck scope and conflicts before dispatch. The existing Issue #227 plan remains in progress for its outstanding human validations.
