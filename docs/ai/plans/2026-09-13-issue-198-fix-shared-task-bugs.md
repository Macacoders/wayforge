---
status: completed
created: 2026-09-13
phase: 1/1
required_gates:
  test_verdict: true
  architect_review: false
  memory_update: true
---

# Fix three bugs in shared-task gh-issue and gh-app-auth scripts (Issue #198)

## Goal

Fix the three correctness bugs from Issue #198 in `gh-issue.ts` / `gh-app-auth.ts`
independently of the agent-workflow refactor (Issue #47), per the issue's
acceptance criteria. Repository root: `/home/spinaks/dev/ai-config`.

## Context (verified findings — one issue claim is stale)

### Bug 1 — scratch path drift

The issue claims `commands/issue.md` now specifies `docs/ai/tmp/pr-body-<issue>.md`
while the script uses `temp/`. **Verified: this claim is stale** — `docs/ai/tmp`
never existed in git history (`git log -S "docs/ai/tmp"` is empty), and the
current source of truth is already consistent:

- `gh-issue.ts` `buildPRBody()` and `cmdPrclose()`: `path.join(<repoRoot>, 'temp', `pr-body-${issueNumber}.md`)`
- `base/opencode/commands/issue.md` line 37 and `SKILL.md`: `temp/pr-body-<issue>.md`
- ADR-0027 lines 21–24: `temp/pr-body-<issue>.md` documented as the agent↔script contract
- `.gitignore` contains `temp/` (and `tmp/`, `.tmp/`) — scratch file is never committed

The real residual risk is **the path formula is hardcoded twice** in `gh-issue.ts`
(buildPRBody ~line 373, cmdPrclose ~line 868) with a `ponytail:` comment flagging
the duplication ("extract helper when 3rd usage appears"). The durable fix is to
single-source the path so drift becomes impossible.

### Bug 2 — `prclose` protected-branch auto-commit is incomplete

`cmdPrclose()` protected-branch path (only runs when `git rev-parse --abbrev-ref HEAD`
is in `{main, master, develop}` and `--dry-run` is not set):

```ts
git(['checkout', '-b', featureBranch], undefined, 15000);
git(['add', '-u'], undefined, 15000);  // ← stages tracked only; omits untracked; sweeps unrelated tracked changes
git(['commit', '-m', `[Issue #${issueNumber}] ${issueTitle}`], undefined, 15000);
git(['push', '-u', 'origin', featureBranch], undefined, 30000);
```

`git add -u` omits new (untracked) files the issue work depends on, and sweeps any
unrelated tracked modifications into the auto-commit. Feature-branch path already
has a clean-tree requirement; protected path is the only auto-commit. ADR-0027
line 25 documents the auto-commit design but not its file scope. No existing test
exercises this git sequence (dry-run returns before it; only feature-branch and
failure paths are tested).

### Bug 3 — `--token` flag is a no-op

Verified: `gh-app-auth.ts` `main()` assigns `tokenOnlyMode = args.includes('--token')`
but never reads it. The documented behavior (token on stdout, logs on stderr) is
**already the behavior in both modes** — `logInfo`/`logError` write to
`process.stderr`, the token is the only stdout write. The variable survives because
`noUnusedLocals` is not part of `strict` and base scripts are outside the
`cli/src` ESLint scope. References: `usage()` (lines 316/319), dead assignment in
`main()` (line 327), `SKILL.md` line 30, e2e test `--token without credentials
exits 1` (e2e.test.ts line 35). `gh-app-auth.test.ts` has **no** `main`/usage tests.

## Decisions (locked)

### Bug 1: single-source the scratch path via a helper

- Add module function `prBodyScratchPath(repoRoot: string, issueNumber: number): string`
  returning `path.join(repoRoot, 'temp', `pr-body-${issueNumber}.md`)` and **export it**
  (codebase convention: helpers exported for testability; cf. export list).
- Use it in `buildPRBody()` (its existing `repoRoot` local) and `cmdPrclose()`
  (`getRepoRoot()`). Delete the two hardcoded formulas.
- **Docs unchanged** — they already agree on `temp/`; this eliminates future drift.
  ADR-0027's documented contract stays accurate. Registered here: the helper is the
  single canonical path definition (ponytail: bug-fix-driven extraction at 2 call
  sites, justified because the bug *is* the duplicated formula).

### Bug 2: stage-all + transparency + documented scope (Option A)

Acceptance offers two acceptable outcomes; choosing the stronger one:
- Change `git ['add', '-u']` → `git ['add', '-A']` in the protected-branch path
  (no pathspec = whole working tree; `.gitignore` keeps `temp/`, `tmp/`, `dist/`,
  `build/`, `.gh-config/`, `.opencode/` out).
- Before committing, print a `git status --porcelain` listing to stdout (transparency
  for what the auto-commit includes) — reuses the existing `status` git wrapper.
- Update docs so the limitation is explicit: `base/opencode/commands/issue.md` (one
  line: on protected branches prclose commits ALL working-tree changes — tracked +
  untracked, gitignored excluded — into the feature branch; stash/commit unrelated
  work first), `SKILL.md` (same note), and amend ADR-0027 line 25 with the file scope.
- Rejected alternative (Option B, fail-closed): keep `git add -u` + error when
  untracked files exist. Blocks the primary agent use case (WIP with new files on
  develop) — the issue's core complaint is silent omission of untracked files.

### Bug 3: remove the vestigial `--token` flag

- `gh-app-auth.ts`: delete the `tokenOnlyMode` assignment and the
  `args.includes('--token')` line; simplify `const args = process.argv.slice(2);`
  to just the `--help` check. `usage()` becomes
  `Usage: npx tsx gh-app-auth.ts [--help]` (drop the `--token` option line). `--help`
  path unchanged.
- `SKILL.md` line 30: `gh-app-auth.ts --token` → `gh-app-auth.ts` (drop the flag → run
  the script to print the token).
- e2e `--token without credentials exits 1` → retarget to default invocation
  (`run([AUTH_SCRIPT], { hostile env })`); same assertions (exit 1 + stderr contains
  `No GitHub App Client ID`), retitled.
- **Backward compatibility:** removing the flag is behavior-identical for callers —
  `--token` callers get the same token-on-stdout result (the arg is simply never
  read); only the dead code and doc surface disappear. No unit churn
  (gh-app-auth.test.ts has no `main` tests).
- Rejected alternative (keep + document): would preserve a flag that does nothing;
  the criterion explicitly allows removal.

## Files to change

1. `base/opencode/skills/shared-task/scripts/gh-issue.ts` — `prBodyScratchPath()`
   helper (+ export), both call sites, `git add -A` + `git status --porcelain`
   listing in the protected-branch path.
2. `base/opencode/skills/shared-task/scripts/gh-app-auth.ts` — remove `--token`
   (usage() text + main() dead code).
3. `base/opencode/skills/shared-task/SKILL.md` — drop `--token`; add protected-branch
   commit-scope note.
4. `base/opencode/commands/issue.md` — one-line protected-branch commit-scope note
   (script remains source of truth for behavior).
5. `docs/ai/decisions/ADR-0027-standardize-pr-creation-workflow.md` — amend
   "Protected branch support" bullet with the file-scope contract.
6. `tests/typescript/gh-issue/gh-issue.test.ts` — new tests (below).
7. `tests/typescript/gh-issue/e2e.test.ts` — retarget the `--token` test.
8. Plan file (this file; status → completed on delivery).

## Tests to add

### `gh-issue.test.ts`

- **`prBodyScratchPath`** (new describe): exact-path unit test, e.g.
  `expect(gh.prBodyScratchPath('/repo', 7)).toBe('/repo/temp/pr-body-7.md')` (path-
  independent via `path.join`). Optionally assert `buildPRBody` mock read/exists
  calls receive exactly that path (regression guard for drift).
- **Protected-branch git sequence** (new it in `cmdPrclose` describe):
  `mockExecFileSync` map: show-toplevel → `/tmp/repo`, abbrev-ref → `develop`,
  `status --porcelain` → e.g. `M file.ts\n?? new-file.ts`; `mockFetch` full API flow
  (labels/issues/repo/pulls/comments/user like the existing full-flow test);
  assert stdout includes the porcelain listing and the PR URL, and that
  `execFileSync('git', ['add', '-A'], ...)` / `['commit', ...]` / `['push', ...]`
  were invoked.

### `e2e.test.ts`

- Retarget `--token without credentials exits 1` → default invocation
  (`gh-app-auth.ts` with `GH_APP_CLIENT_ID: ''`, `GH_CONFIG_DIR:
  /tmp/nonexistent-gh-config`); keep exit-1 + stderr assertions.

## Verification

1. `npx vitest run tests/typescript/gh-issue/` — full unit + e2e suite green.
2. `npx tsc --noEmit` — root tsconfig covers `base/opencode/skills/shared-task/scripts/**/*.ts` (strict).
3. Manual probes:
   - `npx tsx gh-app-auth.ts --help` → `Usage: npx tsx gh-app-auth.ts [--help]` (no `--token`), exit 0.
   - Hostile-env default invocation: `GH_APP_CLIENT_ID='' GH_CONFIG_DIR=/tmp/nonexistent npx tsx gh-app-auth.ts` → exit 1, `No GitHub App Client ID` on stderr (no device flow).
   - `npx tsx gh-issue.ts --dry-run --repo test/repo prclose 1` → dry-run messages, exit 0 (unchanged).
   - Drift probe: `grep -n "pr-body" base/opencode/skills/shared-task/scripts/gh-issue.ts` shows exactly one `temp/pr-body-` formula (inside `prBodyScratchPath`).
4. Full suite: `make check`.
5. Protected-branch git sequence is verified at unit level (mocked `execFileSync`); no live-PR probe (would create a real PR — out of scope).

## Risks / Notes

- `git add -A` sweeps unrelated **tracked** changes into the auto-commit — the
  documented limitation (criterion option 2), mitigated by the porcelain listing +
  docs; gitignored artifacts (`temp/`, `build/`, `.opencode/`, `.gh-config/`) stay out.
- The updated protected path adds one extra `git status --porcelain` call before
  `add -A` — existing `workingTreeIsClean()` (feature-branch path) is unaffected;
  the new test configures the mock accordingly.
- `.opencode/` generated copies are gitignored and regenerated on install — base/
  remains the only edited source.
- `--token` removal is behavior-identical (see Bug 3 decision).
- Memory update after completion: `docs/ai/logs/2026-09.md` entry; then commit/push
  and close Issue #198 via `gh-issue.ts close 198 <summary>` (with `show 198` verify
  first), following the shared-task workflow.

## Acceptance criteria mapping

- [x] Single canonical scratch path, consistent script + docs → `prBodyScratchPath()` helper + regression test; docs verified already on `temp/`.
- [x] Auto-commit includes untracked files → `git add -A`; excludes unrelated changes → documented limitation + porcelain listing + gitignore protection.
- [x] `--token` works as documented **or removed** → removed (flag + usage text + SKILL.md ref + e2e test retargeted).

## Delivery record

Phase 1/1 complete. Delivered via three isolated git worktrees with parallel
implementers (commits `5f80e09`, `27f54ec`, `31d9a16`), merged into `develop`
(`3e42567`, `cced7ff`, `5995a1a`; one SKILL.md conflict resolved with both
sides kept). Full suite 277/277 (274 baseline + 3 new tests: helper-drift
unit + protected-branch git-sequence unit + e2e retarget), `npx tsc --noEmit`
clean. Three independent reviewer agents (one per bug) returned OK verdicts
with no P0/P1 findings. P2 notes recorded: ADR-0027:23 fallback-mode wording
pre-existing inaccuracy (future docs pass); porcelain print↔stage race accepted
and documented. Memory/log entry in `docs/ai/logs/2026-09.md`; issue #198
closed via gh-issue.ts.