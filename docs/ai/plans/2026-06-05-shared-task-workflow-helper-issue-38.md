# Shared Task Workflow Helper And Helper Boundary Update (Issue #38)

Date: 2026-06-05  
Status: Completed  
Issue: [#38](https://github.com/Macacoders/ai-config/issues/38)

## Final Goal

Use one command (`/issue`) and one GitHub helper pair (`gh-issue` / `gh-issue.ps1`) for shared issue creation and management. Keep GitHub-only support for now while using issue-oriented wording where possible.

## Phase Summary

### Phase 1–2 (superseded intermediate implementation)

- Added workflow-level helper scripts:
  - `base/opencode/skills/shared-task/scripts/shared-task`
  - `base/opencode/skills/shared-task/scripts/shared-task.ps1`
- Updated shared-task command/skill/docs guidance to prefer `shared-task` for `/tasks` and retain `gh-issue` for low-level/direct `gh issue` usage (including `/newtask` creation internals).
- Documented conservative `prclose` behavior: refuse protected branches and dirty working trees; create PR and move issue to `status:in-review` without closing issue.

### Phase 3 (validation + consistency + memory)

- Revalidated Bash helper syntax (`bash -n`) and script usage/help output.
- Confirmed PowerShell validation tool unavailability in this environment (`pwsh` not found).
- Confirmed read-only `list` operation path is non-mutating and works with the repository-local GitHub credentials available in this session.
- Fixed one consistency gap in `/tasks` docs so close-label cleanup explicitly includes `status:in-review`.
- Set executable bit on `shared-task` Bash script.

## Validation Notes

- Passed: `bash -n base/opencode/skills/shared-task/scripts/shared-task`
- Passed: usage/help output from `shared-task` with no args
- Not run (environment): PowerShell parse/smoke checks (`pwsh` unavailable)
- Passed: read-only `shared-task list` returned open issues without mutating issue state

## Post-Phase-3 Review Fixes

- Updated `assign` safety checks in both Bash and PowerShell `shared-task` helpers to refuse issues already marked `status:doing`, matching claim/assign duplicate-work prevention rules.
- Updated `/tasks`, shared-task skill, and backlog docs so `assign` explicitly refuses already-assigned or already-`status:doing` issues.
- Updated `/newtask` required status label list to include `status:in-review` for consistency with shared-task required labels.
- Re-ran Bash syntax validation: `bash -n base/opencode/skills/shared-task/scripts/shared-task`.

## Phase 3 Finalization (one-command migration)

- Finalized shared issue workflow on one command: `/issue` (`create`, `list`, `claim`, `assign`, `release`, `close`, `prclose`).
- Finalized helper boundary on one helper: `gh-issue` / `gh-issue.ps1` for all shared issue operations.
- Removed retired command files: `base/opencode/commands/newtask.md` and `base/opencode/commands/tasks.md`.
- Updated active docs/agent/skill guidance to stop presenting `/newtask` and `/tasks` as active commands.
