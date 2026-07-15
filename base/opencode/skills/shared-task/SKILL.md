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
- `/issue show <issue-number>`

Helper command:

- TypeScript: `.opencode/skills/shared-task/scripts/gh-issue.ts <operation> ...`

## Notes
- For `/issue prclose <issue-number>` Write `temp/pr-body-<issue-number>.md` before calling `prclose` to populate the PR body with custom content. Without this file, the PR uses an empty template.
- `gh-issue.ts` has a `show <issue-number>` subcommand to view issue details (title, body, assignee, labels). For comments or full raw details, use `gh issue view <number>` (set `GITHUB_TOKEN` from `gh-app-auth.ts --token` if needed).


## Safety minimums

- Authentication uses the GitHub App Device Flow via `gh-app-auth.ts`. First use requires browser authorization; token is cached for subsequent runs.
- Set `GITHUB_TOKEN` to bypass app authentication.
- Required labels must exist already:
  - Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
  - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
  - Priority: `priority:high`, `priority:medium`, `priority:low`
- Do not auto-create labels.
- Do not use `gh repo view`.
- Do not mutate issues without clear user intent.
