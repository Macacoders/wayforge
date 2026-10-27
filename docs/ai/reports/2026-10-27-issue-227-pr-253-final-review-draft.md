# PR #253 final-review comment draft (not published)

**Revision:** `3d5d3be` (includes merge `b1affb6`, parents `36c01dd` and
`de381c1`)

Push and posting this PR comment are authorized but have not been executed.
Review requests, approvals, issue closure, and other PR actions remain separate
unauthorized actions. This local draft is not a review verdict or a claim that
external acceptance has occurred.

## Reconciliation of PKCPablo's follow-up items

| Item | Evidence / disposition |
| --- | --- |
| Lockfile preservation | This checkout still has an unstaged `package-lock.json` diff. It was not staged, reset, or attributed to a cause. The PR-range diff (`origin/develop...HEAD`) has no lockfile change. |
| Final architecture gate | Staged-index records `227-T1-functional-review` (functional: passed) and `227-T1-architecture-review` (architectural coherence: passed) inspected the combined index against `36c01dd` with `MERGE_HEAD` `de381c1`. The architecture record explicitly deferred precommit ancestry and validation; ancestry of `de381c1` was verified after commit. They do not inspect this changed final documentation diff, substitute for an independent final-revision verdict, or constitute GitHub approval. |
| ADR-0033 context | Amended: the legacy installers were retained during migration and were deleted on 2026-10-26. |
| Superseded permissions ADR | Amended: this Four-Tier Bash Permission Categories ADR-0035 is superseded by ADR-0036; its old path/scanner/re-run text is historical only. It is distinct from the one-shot CLI installer ADR-0035. |
| Log correction and historical tests | The 15:07 correcting PR comment was published. The earlier 456-test result remains historical; it is not rewritten as the later 458-total result. Linux Bats evidence is 9/9 on its recorded Linux host. |
| Optional ponytail findings | Deferred; they are non-blocking and no cleanup was added in this reconciliation. |

## Current read-only GitHub state

Checked 2026-10-27 with `gh pr view 253`: PR #253 is open; GitHub reports
`mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, and
`reviewDecision: CHANGES_REQUESTED`. The formal requested-changes review was
submitted against `5d79855`; it is not represented here as withdrawn and does
not decide `b1affb6`. No GitHub checks were reported by that query.

## Pending human-owned acceptance gates

- Linux OpenCode 1.18.35 smoke is user-confirmed at `3d5d3be` from a fresh
  disposable install: dry-run, actual install, agent list, external-skills-
  disabled skill debug, and config debug had no errors; all six agents,
  wayforge skills, the `.agents/plugins/ponytail` plugin path, and command
  entries including `intent` and `load-plan` appeared. The retained config
  excerpt is partial, so it does not freshly establish the historical
  15-command count; Linux distribution/host version metadata was not supplied.
- PKCPablo will test Kilo 7.8.17 on Windows. Native-Windows junction creation,
  relocation, recovery, and uninstall removal without deleting targets or user
  files, plus real-CLI `free-tier` and `openai,github-copilot` provider cases,
  remain pending.
- Pi discovery remains pending; record its result or obtain an explicit
  maintainer waiver.
- After the authorized-but-unexecuted push, inspect PR #253 for real
  mergeability and obtain the required CODEOWNERS approval. Request fresh
  review only with separate explicit authorization; `CHANGES_REQUESTED` remains
  pending until a reviewer updates it.

No external action has been taken from this draft.
