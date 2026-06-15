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

1. Use repo-local credentials (`GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`).
2. Run `scripts/gh-issue check`; if access is missing, ask the user to authenticate/login.
3. Run `scripts/gh-issue labels-check`; if labels are missing, report missing labels and stop.
4. Invoke `taskanalyst` to extract the issue description.
5. Iterate in the same `taskanalyst` session only when the extracted description is ambiguous, duplicate-prone/likely duplicate, vague, missing acceptance criteria, or missing required labels.
6. Write the final issue body to a temporary aux file.
7. Create with `scripts/gh-issue create <title> --body-file <tmp> --label ...`.
8. Report the created issue number and URL.

For non-create operations, call `scripts/gh-issue <operation> ...` directly and do not restate operation procedures.

Helper commands:

- Bash: `scripts/gh-issue <operation> ...`
- PowerShell: `scripts/gh-issue.ps1 <operation> ...`

## Safety minimums for create

- Required labels must exist already:
  - Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
  - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
  - Priority: `priority:high`, `priority:medium`, `priority:low`
- Do not auto-create labels.
- Do not use `gh repo view`.
- Do not mutate issues without clear user intent.