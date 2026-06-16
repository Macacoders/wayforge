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