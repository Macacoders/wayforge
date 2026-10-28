---
status: in-progress
created: 2026-10-27
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #227 / PR #253 remaining review findings — Implementation plan

**Goal:** Clear PKCPablo's 2026-10-27 changes-requested review without overwriting user-owned configuration or content, make dry-run faithfully read-only, and reconcile the PR's scope and claims.

**Architecture:** Preserve ADR-0046's canonical `.agents/` tree, runtime-specific pointers, and existing manifest format. Limit changes to the refresh/config decision, pointer ownership and residual prediction, small cleanup, and current documentation; retain historical plans as records of their original scope.

**Tech Stack:** TypeScript CLI, fs-extra, vitest; `make check`.

**Scope classification:** `multi-task` (3 tasks: config ownership, pointer/dry-run correctness, and review reconciliation/validation).

**Basis:** PKCPablo's latest CHANGES_REQUESTED review on PR #253 (reviewed head `5d79855`), issue #227, ADR-0046, and completed plans `2026-10-25_075150-issue-227-agents-artifact-dir.md` and `2026-10-26_094410-issue-227-migration-hardening.md`. Local branch `feature/issue-227-agents-artifact-dir` is at `5d79855`; an unrelated `package-lock.json` modification is already present. Do not overwrite or stage that change. Existing `docs/ai/**` memory supplies the necessary repository research; no separate onboarding research is needed.

**Scope resolution approved by maintainer (2026-10-27):** Retain the already-landed ponytail harvest (`249e17b`) and retirement of `tests/bash/bootstrap_cli.bats` (`5d79855`), rather than undoing tested work or rewriting completed plans retroactively. The maintainer explicitly accepted both exceptions to the older plans' out-of-scope/baseline statements; record this later approval in the delivery record and a new dated log entry. This scope decision is no longer blocking.

**Plan acceptance criteria:**
- Forced refresh of one runtime never changes a user-authored sibling runtime config; existing stale wayforge-owned sibling config is repaired, and the selected runtime retains its documented `--force` behavior. Missing sibling configs remain absent.
- A real directory with user content at a pointer path remains untracked and intact when pointer creation is blocked; valid existing symlink/junction pointers are preserved and tracked.
- `--dry-run` makes no target-repository writes (including probes and corrupt-manifest cleanup), and predicts only residuals the corresponding real cleanup actually leaves; blocking paths and dry-run outcome agree with a real run on equivalent fixtures.
- The review's four cleanup items and contradictory PR/ADR/log claims are resolved without broadening the installed layout, manifest format, or pointer fallback policy. New evidence supersedes, rather than silently rewrites, historical claims.
- `make check` passes, required independent review gates pass, and human-owned runtime/Windows verification is either confirmed or explicitly waived before treating issue #227's compatibility criterion as met.

### Task 1: Protect sibling config ownership on forced refresh

**Status:** accepted
**Depends on:** none

**Objective:** Make forced refresh overwrite only the selected runtime's config, while migrating existing stale wayforge-owned sibling configs when necessary.

**Context:**
- `cli/src/commands/install.ts` refreshes every runtime under `ctx.force = true`; its `savedForce || !exists || isLayoutStaleConfig(configPath)` condition currently overwrites any existing sibling on `--force`.
- `cli/src/lib/config-gen.ts` `isLayoutStaleConfig` first checks `isManagedOpenCodeFile` (generated header); `syncGeneratedOpenCodeJsonc` replaces an existing file whenever `ctx.force` is true. `RUNTIMES` and `configFileFor` are in `cli/src/lib/layout.ts`.
- `cli/tests/unit/migration.test.ts` already covers a stale sibling and missing sibling on forced refresh; `cli/tests/integration/install-layout.test.ts` exercises mixed installs. Kilo also merges root `opencode.jsonc` (ADR-0046).

**Acceptance criteria:**
- Given a managed OpenCode config and a byte-distinct user-authored Kilo config, `--runtime opencode --force` leaves Kilo byte-identical; the converse also preserves an authored OpenCode sibling.
- A selected runtime's existing config remains force-regenerable, and an existing stale wayforge-owned sibling is regenerated with its own runtime's generated defaults without creating a missing sibling.
- Automated regression tests cover forced mixed installs and the migrated stale-sibling case, including ownership determined by the generated header rather than by filename alone.

**Constraints:**
- Do not change generated config shape, provider selection, or the `--force` contract for the selected runtime; do not treat `--force` as authority to replace user-authored sibling files.
- Reuse the existing staleness/managed-header and runtime mapping helpers; avoid a new config ownership system.

**Validations:**
- `agent`: `npx vitest run cli/tests/unit/migration.test.ts cli/tests/integration/install-layout.test.ts cli/tests/unit/config-gen.test.ts` — expected: all relevant config cases pass.

**Proposed commit message:** `fix(install): preserve user-owned sibling config on forced refresh (Issue #227)`

### Task 2: Keep pointer ownership and dry-run predictions honest

**Status:** accepted
**Depends on:** Task 1

**Objective:** Prevent unowned pointer directories from entering the managed manifest, make dry-run write-free, and align predicted residuals with actual legacy cleanup.

**Context:**
- `cli/src/commands/install.ts` refresh loop re-tracks every existing `isPointerPath` entry using `pathExistsSync`, even when it is an ordinary user directory. `cli/src/lib/pointers.ts` `ensureRuntimePointers` already validates links via `lstatIfExists` + `pointsAt`, reporting conflicting directories.
- `ensureRuntimePointers` calls `canSymlink(repo)` even under dry-run; that probe creates and deletes `wayforge-link-probe-*` inside the repository. `collectResiduals` currently skips *any* `isManagedFile` in dry-run, whereas `install.ts` `removeManagedLegacyPaths` removes only manifest-recorded legacy non-pointer files and checks their type/ownership.
- `install.ts` `failCorruptManifest` unconditionally removes `.wayforge-managed.tmp` even under dry-run. `LEGACY_ARTIFACT_ROOT` is already imported; the remediation message still spells out `.opencode`.
- Reuse `cli/tests/unit/pointers.test.ts`, `cli/tests/unit/migration.test.ts`, and `cli/tests/integration/install-layout.test.ts`; preserve existing unmanaged-file protection and residual messaging.

**Acceptance criteria:**
- A manifest-listed pointer path that is an ordinary directory with unmanaged files is not re-tracked on refresh; its contents remain intact, the install reports exact blockers, and uninstall cannot mistake it for a wayforge pointer. A correct existing symlink or Windows junction to the canonical target remains idempotent and tracked; a wrong-target link is not claimed.
- Fresh and refresh dry-runs create no probe or other target-repo artifacts; corrupt-manifest dry-run does not remove a pre-existing temporary manifest. Predicted pointer wording does not claim a verified filesystem capability when no probe was run.
- Dry-run skips exactly the manifest-recorded, cleanup-eligible legacy managed files a real run would remove, not managed files under `.kilo` or other non-legacy pointer directories; comparable dry-run/real fixtures report the same residual paths and block status. No user files or symlink targets are traversed or removed.
- Existing fallback-on-link-failure, Windows junction policy, and error reporting remain unchanged in real installs.

**Constraints:**
- No new override flag, stub fallback, manifest schema, or content duplication. Prefer reusing the real cleanup eligibility predicate (or one shared narrow helper) rather than introducing a second divergent definition.
- Dry-run must not call filesystem-mutating helpers even temporarily; ensure a blocked dry-run still reports the correct outcome without guessing a probe result.

**Validations:**
- `agent`: `npx vitest run cli/tests/unit/pointers.test.ts cli/tests/unit/migration.test.ts cli/tests/integration/install-layout.test.ts cli/tests/unit/uninstall.test.ts` — expected: ownership, dry-run, residual parity, and uninstall coverage pass.

**Proposed commit message:** `fix(install): respect pointer ownership and keep dry-run read-only (Issue #227)`

### Task 3: Reconcile review claims and close validation gaps

**Status:** accepted
**Depends on:** Task 1, Task 2

**Objective:** Clear the remaining small review findings, document the corrected behavior and approved scope exceptions, and provide final verification evidence for PR #253.

**Context:**
- `cli/src/commands/uninstall.ts` resolves `repo` at line 22, then redundantly resolves it again inside the cleanup loop. `cli/src/lib/layout.ts` exports `CONFIG_FILES` although it is used only inside that module.
- `docs/ai/logs/2026-10.md` and the current PR description claim that sibling configs are regenerated only when stale, a claim contradicted by the present forced-refresh path. ADR-0046 decision 5 says `--force` regenerates config without distinguishing selected from sibling. The two completed plans contain historical statements about out-of-scope harvest/bats and old `--force` semantics; do not edit them.
- `docs/compatibility-matrix.md` already labels real Windows junction creation/relocation/removal pending. PKCPablo notes no pull-request CI workflow; `make check` must therefore have explicit local evidence.

**Acceptance criteria:**
- The redundant `path.resolve` is removed without changing uninstall's repository-boundary protection; the legacy-root remediation uses `LEGACY_ARTIFACT_ROOT`, and the unused `CONFIG_FILES` export is private unless a real consumer is identified.
- ADR-0046 and a **new** dated log entry accurately state selected-runtime force vs managed stale sibling handling, dry-run probe/manifest behavior, and the maintainer-approved disposition of the two already-landed out-of-plan changes; historical log entries and completed plans remain intact. PR description or a correcting PR comment no longer misrepresents the behavior (external PR edit/comment requires explicit authorization from the maintainer/delivery owner; otherwise report as an outstanding action).
- Final review maps each PKCPablo finding to a test/diff or explicit decision, confirms the working-tree `package-lock.json` change was left untouched, and reports any external human validations still outstanding rather than marking them verified.

**Constraints:**
- Do not rework the retired bats suite or frozen legacy installers, and do not introduce unrelated cleanup. Do not change GitHub issue/PR state without authorization.

**Validations:**
- `agent`: `make check` — expected: vitest, typecheck, lint, formatting, and duplication checks pass on the final diff.
- `human`: On fresh scratch installs after the fixes, run the OpenCode and Kilo agent/command/skill/plugin smoke commands documented in `docs/compatibility-matrix.md` (Kilo via `npx --yes @kilocode/cli@7.8.17`), and verify Pi skill discovery in a Pi session — expected: only `.agents/` content is loaded, no dangling plugin path. Record versions and evidence; do not silently treat older smoke runs as post-fix evidence.
- `human`: On a real Windows host, use a disposable scratch repository to exercise junction fallback creation, repo relocation behavior (document the expected broken absolute pointer and recovery), and uninstall removal without deleting `.agents/` targets or user content — expected: matrix notes match observed behavior. If unavailable, maintainer must explicitly waive this issue #227 acceptance criterion before claiming full acceptance; mocked tests alone are insufficient.
- `human`: Confirm required CODEOWNERS approval and PR mergeability after final commits; no pull-request CI trigger is present, so local `make check` evidence must be reported.

**Proposed commit message:** `docs: reconcile PR #253 review and verify issue #227 follow-up`

## Required gates and handoff

- `architect_review`: independent check of user-owned config/manifest boundaries, dry-run parity, and consistency with ADR-0046 on the final revision.
- `memory_update`: append the final outcome/evidence and scope disposition to the current monthly log; correct living ADR/matrix statements without retroactively modifying historical plans.
- Human-owned validations above must be reported and confirmed or explicitly waived; delivery must not run them autonomously. No per-task approval is needed once this plan and its scope disposition are approved.
- The maintainer has approved retention of both out-of-plan changes; no further scope approval is needed to dispatch implementation. Preserve the pre-existing `package-lock.json` worktree modification.
