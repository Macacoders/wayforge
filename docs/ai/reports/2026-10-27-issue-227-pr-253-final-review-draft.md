# PR #253 final-review comment draft (not published)

**Revision:** `b1affb6` (parents `36c01dd` and `de381c1`)

This local draft requires maintainer authorization before any GitHub comment,
push, review request, or other PR action. It is not a review verdict or a
claim that external acceptance has occurred.

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

- From fresh disposable installs at `b1affb6`, run the OpenCode 1.18.35,
  Kilo 7.8.17, and Pi discovery commands in `docs/compatibility-matrix.md`;
  record host, versions, and output, or obtain an explicit maintainer waiver.
- On native Windows, verify junction creation, relocation, recovery, and
  uninstall removal without deleting targets or user files; run the real-CLI
  `free-tier` and `openai,github-copilot` provider cases if available.
- After an authorized push, inspect PR #253 for real mergeability and obtain
  the required CODEOWNERS approval. Request fresh review only with explicit
  authorization; `CHANGES_REQUESTED` remains pending until a reviewer updates
  it.

No external action has been taken from this draft.
