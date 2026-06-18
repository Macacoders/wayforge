---
description: Manage GitHub issues via the shared gh-issue helper.
agent: planner
---

Use `/issue` for GitHub issue workflow only.

Usage:

- `/issue list`
- `/issue create <description>`
- `/issue claim <issue-number>`
- `/issue assign <issue-number> <collaborator>`
- `/issue release <issue-number>`
- `/issue close <issue-number>`
- `/issue prclose <issue-number>`

For `/issue create <description>`:

1. Use/load the `shared-task` skill as needed.
2. Run `.opencode/skills/shared-task/scripts/gh-issue check`; if access is missing, ask the user to authenticate/login.
3. Run `.opencode/skills/shared-task/scripts/gh-issue labels-check`; if labels are missing, report missing labels and stop.
4. Invoke `taskanalyst` to extract the issue description.
5. Iterate in the same `taskanalyst` session only when the extracted description is ambiguous, duplicate-prone/likely duplicate, vague, missing acceptance criteria, or missing required labels.
6. Write the final issue body to a temporary aux file.
7. Create with `.opencode/skills/shared-task/scripts/gh-issue create <title> --body-file <tmp> --label ...`.
8. Report the created issue number and URL.

For non-create operations, call the following helper command directly and do not restate operation procedures. The script handles all guardrails (branch protection, PR formatting, temp file, status labels, etc.) automatically.

Helper commands:
- Bash: `.opencode/skills/shared-task/scripts/gh-issue <operation> ...`
- PowerShell: `.opencode/skills/shared-task/scripts/gh-issue.ps1 <operation> ...`

## prclose conventions

Use `/issue prclose <issue-number>` to create a pull request from a feature branch.

### PR title format

```
[Issue #XX] 'Title of issue #XX'
```

### PR body — temp file workflow

The script checks for a pre-populated temp file at `temp/pr-body-<issue>.md`:

- **If the file exists** (agent pre-populated): used verbatim with `gh pr create --body-file`.
- **If the file does not exist**: generated from `.github/pull_request_template.md` as fallback, with `Fixes #XX` prepended.

In both modes the temp file is cleaned up after PR creation.

### Pre-PR validation

- Current branch is a feature branch (not `develop`, `main`, or `master`), OR auto-branching triggered for protected branches.
- Working tree is clean (for feature branches).
- All acceptance criteria from the issue are addressed.
- Tests and validation have been considered and run as appropriate.

## Safety minimums

- Use repo-local credentials (`GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`).