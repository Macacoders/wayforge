---
status: completed
created: 2026-10-28
task: 2/2
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #227 / PR #253 final review closure - Implementation plan

**Goal:** Close the remaining non-human review items on PR #253 at `6e90494` by applying the deferred pointer-layer cleanups and reconciling living records with verified evidence, without changing installer behavior or GitHub state.

**Architecture:** Keep ADR-0046's canonical `.agents/` tree, per-runtime pointers, managed-config ownership, and dry-run parity unchanged. Task 1 is a mechanical reuse/deduplication pass inside the existing pointer layer. Task 2 records the already-verified native Windows/Kilo evidence, resolves the stale `package-lock.json` statement, and attaches the final architecture verdict. No new runtime, manifest schema, pointer fallback, or public CLI behavior is introduced.

**Tech Stack:** TypeScript, Vitest, docs/ai memory.

**Scope classification:** `multi-task` (2 separately reviewable outcomes). **Risk: low** - Task 1 is internal refactoring covered by existing tests; Task 2 is memory-only.

**Basis:** PKCPablo's 2026-10-27 follow-up review (`#issuecomment-6450012477`) and PabloBen's 2026-10-27 20:59 reconciliation comment. Current `HEAD` is `6e90494` (upstream `origin/feature/issue-227-agents-artifact-dir` matches). The code-side B3/pointer/dry-run/cleanup findings are already cleared and re-verified on this HEAD. Remaining items are: (1) unrecorded disposition of the vanished `package-lock.json` worktree diff, (2) no final-revision `architect_review` verdict, (3) optional pointer cleanups, and (4) human/GitHub acceptance. Verified on 2026-10-28 in this checkout: `make check` passes (19 files, 445 passed / 13 skipped = 458; tsc/ESLint/Prettier clean; jscpd 6.22%); native Windows junction creation, relocation failure, recovery, and uninstall-preserving-user-file were exercised; Kilo 7.8.17 on native Windows listed all six wayforge agents, loaded wayforge skills from `.agents/skills`, and resolved the `.agents/plugins/ponytail` plugin plus `intent`/`load-plan` commands. Pi 0.73.1 documents `.agents/skills` auto-discovery but no active Pi session was run.

**Constraints:**
- Do not commit, push, comment, approve, or otherwise mutate GitHub state.
- Preserve unrelated worktree changes; the working tree is currently clean.
- Do not change installer behavior, generated output, manifest format, or pointer fallback.
- Update `docs/ai/**` only under Task 2.
- Do not rewrite historical log entries; append a dated correction.

### Task 1: Apply deferred pointer-layer cleanups

**Status:** accepted
**Depends on:** none

**Objective:** Remove the six optional duplication/inconsistency findings from PKCPablo's review without changing observable behavior.

**Files:**
- Modify: `cli/src/lib/layout.ts`
- Modify: `cli/src/lib/pointers.ts`
- Modify: `cli/src/lib/legacy-cleanup.ts`
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/lib/manifest.ts` (debt marker only)
- Validate: `cli/tests/unit/pointers.test.ts`
- Validate: `cli/tests/unit/migration.test.ts`

**Step 1: Move the pointer predicate to its data owner**

Move `isPointerPath` from `cli/src/lib/pointers.ts` into `cli/src/lib/layout.ts`, next to `POINTER_PATHS`. It must remain behaviorally identical: normalize separators with `posixPath` and test membership in `POINTER_PATHS`.

Update imports:
- `cli/src/lib/pointers.ts`: import `isPointerPath` from `./layout.js`; keep using it in `isValidRuntimePointer`.
- `cli/src/commands/install.ts`: import `isPointerPath` from `../lib/layout.js` (remove it from the `pointers.js` import).
- `cli/src/lib/legacy-cleanup.ts`: replace `POINTER_PATHS.includes(posixPath(relPath))` with `isPointerPath(relPath)` imported from `./layout.js`.
- `cli/tests/unit/pointers.test.ts`: import `isPointerPath` from `../../src/lib/layout.js`.

**Step 2: Reuse `isValidRuntimePointer` in `ensureRuntimePointers`**

In `ensureRuntimePointers`, replace the inline "existing symlink points at the expected target" branch with `isValidRuntimePointer(repo, managedRel)`. Keep the current log message and `managedTrackFile` call for a valid pointer. If the path exists but is not a valid pointer:
- A directory (including an empty one) keeps the existing `collectResiduals` / empty-directory replacement behavior.
- A non-directory, non-pointer path keeps being reported as a residual.

This must not change the existing behavior for `.opencode` and `.kilo` pointer paths, or the handling of blocked pointer directories.

**Step 3: Read the manifest only when dry-run needs it**

In `ensureRuntimePointers`, change the manifest read to `const manifestPaths = ctx.dryRun ? readManagedManifest(repo) : []`. `collectResiduals` only consumes manifest entries in the dry-run branch; real runs must inspect what is actually present.

**Step 4: Remove the unused type computation from dry-run and the one-line wrapper**

- Move `const type = symlinks ? 'dir' : 'junction'` after the `if (ctx.dryRun) { ... continue }` block so dry-run does not compute an unused value.
- Delete `legacyArtifactRoot()` in `cli/src/commands/install.ts` and replace both call sites (line ~244 and line ~442) with `path.join(repo, LEGACY_ARTIFACT_ROOT)`.

**Step 5: Mark the pre-existing manifest twin walks as debt**

Above `isManagedFile` in `cli/src/lib/manifest.ts`, add a concise marker such as:
`// ponytail: debt - isManagedFile/isManagedDir share the same ancestor walk; merge only with a dedicated refactor and tests.`

Do not refactor those functions in this task.

**Step 6: Run targeted validation**

Run:
`npx vitest run cli/tests/unit/pointers.test.ts cli/tests/unit/migration.test.ts`
Expected: all tests pass, including dry-run/no-probe, valid-pointer, residual, and sibling-config ownership cases.

Then run:
`make check`
Expected: 19 test files pass; tsc, ESLint, Prettier, and jscpd are clean.

**Step 7: Stop and report**

Return changed files, exact validation output, residual risks, and the proposed commit message `refactor(install): reuse pointer helpers (Issue #227)`. Do not commit.

### Task 2: Reconcile final review evidence and record the architecture verdict

**Status:** accepted
**Depends on:** Task 1 and the architect verdict on the final tree

**Objective:** Make the living records state the verified truth for `6e90494` plus Task 1 changes: the lockfile diff is gone and deliberately excluded, native Windows/Kilo evidence exists, Pi status is accurate, and the final architecture gate is recorded or explicitly waived.

**Files:**
- Modify: `docs/ai/logs/2026-10.md`
- Modify: `docs/ai/reports/2026-10-27-issue-227-pr-253-final-review-draft.md`
- Modify: `docs/ai/plans/2026-10-27_202502-issue-227-pr-253-final-review.md`
- Modify: `docs/compatibility-matrix.md`
- Modify: this plan's frontmatter after the verdict

**Step 1: Record the package-lock disposition**

Append a new `2026-10-28` entry at the top of `docs/ai/logs/2026-10.md` (do not rewrite the 2026-10-27 entry). State:
- The working tree is clean; `git diff -- package-lock.json` and `git diff origin/develop...HEAD -- package-lock.json` are both empty.
- No commit or stash contains the earlier worktree-only diff, and no unreachable blob near the lockfile size was found.
- Disposition: deliberately excluded/abandoned; this PR intentionally contains no dependency or lockfile change.
- This supersedes the 2026-10-27 "remains unstaged" sentence, which described that checkout before the diff disappeared.

**Step 2: Record the native Windows and Kilo evidence**

In the same log entry and in `docs/compatibility-matrix.md`:
- Windows host: `Microsoft Windows NT 10.0.26300.0`, Node `v24.19.0`, branch `6e90494`.
- Fresh OpenCode install created real junctions because symlink creation was unavailable. After moving the repository, both junctions pointed at the old absolute path and were not traversable. Re-running the installer reported both pointers as residuals and exited 1. After removing the stale pointers, reinstall recreated junctions to the new path. `uninstall` removed the pointers and managed `.agents` targets while preserving a user-authored `.agents/agents/user-note.md`.
- Kilo 7.8.17 on the same host listed `planner`, `delivery`, `troubleshooter`, `research`, `code`, and `architect`; `debug skill` resolved wayforge skills from `.agents/skills`; `debug config` resolved `.agents/plugins/ponytail/ponytail.mjs` and command entries including `intent` and `load-plan`.
- Update the Kilo matrix cells from `pending` to `verified` with the host/version/revision. Update the Windows pointer row from `pending` to `verified` for creation, relocation failure, recovery, and uninstall removal. Keep the limitation that junctions do not survive relocation.
- Pi: record that Pi 0.73.1 documents `.agents/skills` auto-discovery and that no active session was run; leave `pending` or mark the maintainer waiver explicitly. Do not claim an active Pi verification.

**Step 3: Record the final architecture verdict**

When the planner provides the `architect` verdict for the final working tree, add it to the log entry and the draft report. If the verdict is `approve`/`no conflicts`, record the gate as satisfied and mark this plan `status: completed`, `task: 2/2`. If it flags a conflict, record the flag and leave the plan `in-progress`; do not claim closure.

**Step 4: Correct the review draft**

In `docs/ai/reports/2026-10-27-issue-227-pr-253-final-review-draft.md`:
- Update the lockfile row to the clean-worktree/deliberate-exclusion disposition.
- Update the architecture row with the verdict reference.
- Update the human-gates section: Windows/Kilo marked verified; Pi still pending/waiver; GitHub review/mergeability still outstanding.
- Add a one-line `Updated 2026-10-28` note; do not rewrite the original 2026-10-27 evidence.

**Step 5: Update the active final-review plan**

In `docs/ai/plans/2026-10-27_202502-issue-227-pr-253-final-review.md`, correct the Basis/Context claim that the lockfile diff still exists unstaged. State that it is no longer present and is deliberately excluded. Update task statuses as appropriate.

**Step 6: Validate**

Run:
`make check`
Expected: 19 test files pass; tsc, ESLint, Prettier, and jscpd clean.

Run:
`git diff --check`
Expected: no whitespace errors.

**Step 7: Stop and report**

Return changed files, validation output, residual risks, and the proposed commit message `docs: close issue #227 final review evidence`. Do not commit.

## Human-owned gates (not executable by the agent)

- Push the branch and post the final PR comment only with explicit authorization.
- Request/obtain CODEOWNERS approval and confirm GitHub mergeability after the push.
- Run an active Pi session against a disposable install and record the version/output, or obtain an explicit maintainer waiver. The static 0.73.1 documentation check is not a substitute.
- `make check-bats` on a host with Bash remains an environmental gap on this Windows checkout; report the host or obtain a waiver.
