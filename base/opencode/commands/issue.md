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

For non-create operations, call the following helper command directly and do not restate operation procedures.

Helper commands:
- Bash: `.opencode/skills/shared-task/scripts/gh-issue <operation> ...`
- PowerShell: `.opencode/skills/shared-task/scripts/gh-issue.ps1 <operation> ...`

## Safety minimums

- Use repo-local credentials (`GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`).

## prclose conventions

Use `/issue prclose <issue-number>` to create a pull request from a feature branch.

### PR title format

```
[Issue #XX] 'Title of issue #XX'
```

### PR body template sections

The pull request body is populated from the `.github/pull_request_template.md` template (with `Fixes #<issue-number>` prepended as bare keyword text). The template contains these sections:

- **Summary**
- **Testing**
- **Breaking changes**

`Fixes #<issue-number>` is prepended as bare keyword text (not a section) to auto-close the referenced issue on merge.

After the PR is created, the user edits these sections to fill in details.

### Pre-PR validation expectations

Before `prclose` creates the PR, confirm:

- If on a protected branch (`main`, `master`, `develop`), prclose automatically creates a feature branch, commits, and pushes.
- Working tree is clean (checked only on feature branches — auto-committed on protected branches).
- All acceptance criteria from the issue are addressed.
- Tests and validation have been considered and run as appropriate.