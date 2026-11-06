# PR #253 final-review comment draft (not published)

**Revision:** 6e90494 plus the Task 1 pointer-layer refactor.

> Updated 2026-10-28: the lockfile row, final architecture gate row, and the
> human-gates section below were reconciled with verified evidence at HEAD
> `6e90494` plus the Task 1 pointer-layer refactor; the original 2026-10-27
> evidence is retained unchanged. See `docs/ai/logs/2026-10.md` (2026-10-28
> entry) for the full record.

Push and posting this PR comment are authorized but have not been executed.
Review requests, approvals, issue closure, and other PR actions remain separate
unauthorized actions. This local draft is not a review verdict or a claim that
external acceptance has occurred.

## Reconciliation of PKCPablo's follow-up items

| Item | Evidence / disposition |
| --- | --- |
| Lockfile preservation | *(Updated 2026-10-28)* The earlier worktree-only `package-lock.json` diff is gone and deliberately excluded/abandoned: the worktree is clean (`git status --porcelain` empty), `git diff -- package-lock.json` and `git diff origin/develop...HEAD -- package-lock.json` are both empty, `git stash list` is empty, and no unreachable blob near the 118883-byte lockfile size was found with `git fsck --no-reflogs --unreachable`. This PR intentionally contains no dependency or lockfile change. The original 2026-10-27 row below described that checkout before the diff disappeared. |
| Final architecture gate | *(Updated 2026-10-28)* The `architect` review of the final working tree (HEAD `6e90494` + the Task 1 pointer-layer refactor) returned **"No conflicts."**: Task 1 does not cross an architectural boundary or contradict ADR-0046/ADR-0031; user-owned config/pointer preservation, dry-run read-only behavior, and residual parity are unchanged. One non-blocking edge note: on any platform where a junction lstat's as a plain directory, the new code accepts a valid pointer idempotently where the old code would residual-block — ADR-0046-consistent and unreachable on the verified Windows host. Confidence high on the verified platform, medium-high on that edge. The staged-index records below remain the historical evidence for the combined index. |
| ADR-0033 context | Amended: the legacy installers were retained during migration and were deleted on 2026-10-26. |
| Superseded permissions ADR | Amended: this Four-Tier Bash Permission Categories ADR-0035 is superseded by ADR-0036; its old path/scanner/re-run text is historical only. It is distinct from the one-shot CLI installer ADR-0035. |
| Log correction and historical tests | The 15:07 correcting PR comment was published. The earlier 456-test result remains historical; it is not rewritten as the later 458-total result. Linux Bats evidence is 9/9 on its recorded Linux host. |
| Optional ponytail findings | Applied in Task 1 on 2026-10-28: isPointerPath moved to layout.ts, ensureRuntimePointers reuses isValidRuntimePointer, the manifest read is dry-run-only, the unused dry-run type computation was removed, and the legacyArtifactRoot wrapper was inlined. The pre-existing isManagedFile/isManagedDir twin ancestor walk was not refactored; it carries a ponytail debt marker. |

## Current read-only GitHub state

Checked 2026-10-27 with `gh pr view 253`: PR #253 is open; GitHub reports
`mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, and
`reviewDecision: CHANGES_REQUESTED`. The formal requested-changes review was
submitted against `5d79855`; it is not represented here as withdrawn and does
not decide `b1affb6`. No GitHub checks were reported by that query.

## Pending human-owned acceptance gates

*(Updated 2026-10-28: Windows/Kilo items are now verified; Pi and the GitHub
gates remain outstanding.)*

- Linux OpenCode 1.18.35 smoke is user-confirmed at `3d5d3be` from a fresh
  disposable install: dry-run, actual install, agent list, external-skills-
  disabled skill debug, and config debug had no errors; all six agents,
  wayforge skills, the `.agents/plugins/ponytail` plugin path, and command
  entries including `intent` and `load-plan` appeared. The retained config
  excerpt is partial, so it does not freshly establish the historical
  15-command count; Linux distribution/host version metadata was not supplied.
- *(Updated 2026-10-28 — verified)* Native Windows junction lifecycle and Kilo
  7.8.17 were exercised on host `Microsoft Windows NT 10.0.26300.0`, Node
  `v24.19.0`, at HEAD `6e90494` plus the Task 1 refactor: a fresh OpenCode
  install created real junction pointers for `.opencode/agents` and
  `.opencode/commands` (symlink creation unavailable), both traversable; after
  moving the repository both junctions pointed at the old absolute path and
  were not traversable, reinstall reported both as residuals and exited 1, and
  after removing the stale pointers reinstall recreated junctions to the new
  path; `uninstall` removed the pointers and managed `.agents` targets while
  preserving a user-authored `.agents/agents/user-note.md`. Kilo 7.8.17 on the
  same host listed all six wayforge agents, `debug skill` resolved wayforge
  skills from `.agents/skills`, and `debug config` resolved
  `.agents/plugins/ponytail/ponytail.mjs` plus `intent`/`load-plan` command
   entries. The two real-CLI provider cases (free-tier and openai,github-copilot) passed on native Windows through cli/tests/integration/install-layout.test.ts (9/9 tests passed).
- Pi discovery remains pending: Pi 0.73.1 package documentation/source
  confirms `.agents/skills/**/SKILL.md` auto-discovery, but no active Pi
  session was run. Record an active-session result or obtain an explicit
  maintainer waiver; the static documentation check is not a substitute.
- After the authorized-but-unexecuted push, inspect PR #253 for real
  mergeability and obtain the required CODEOWNERS approval. Request fresh
  review only with separate explicit authorization; `CHANGES_REQUESTED` remains
  pending until a reviewer updates it.

No external action has been taken from this draft.
