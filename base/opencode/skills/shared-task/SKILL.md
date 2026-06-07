---
name: shared-task
description: Use for shared GitHub Issues workflow via /issue and the gh-issue helper.
compatibility: opencode
metadata:
  workflow: issue-github-issues
---

# Shared Task GitHub Issues Helper

Use this skill for shared issue workflow through `/issue`.

## Quick reference

- `/issue list`
- `/issue create <description>`
- `/issue claim <issue-number>`
- `/issue assign <issue-number> <collaborator>`
- `/issue release <issue-number>`
- `/issue close <issue-number>`
- `/issue prclose <issue-number>`

Helper commands:

- Bash: `.opencode/skills/shared-task/scripts/gh-issue <operation> ...`
- PowerShell: `.opencode/skills/shared-task/scripts/gh-issue.ps1 <operation> ...`

## Safety minimums

- Use repo-local credentials (`GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`).
- Required labels must exist already:
  - Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
  - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
  - Priority: `priority:high`, `priority:medium`, `priority:low`
- Do not auto-create labels.
- Do not use `gh repo view`.
- Do not mutate issues without clear user intent.
