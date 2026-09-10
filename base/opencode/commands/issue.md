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
- `/issue show <issue-number>`

For `/issue create <description>`:

1. Use/load the `shared-task` skill as needed.
2. Run `.opencode/skills/shared-task/scripts/gh-issue.ts check`; if access is missing, ask the user to authenticate/login.
3. Run `.opencode/skills/shared-task/scripts/gh-issue.ts labels-check`; if labels are missing, report missing labels and stop.
4. Invoke `taskanalyst` agent to extract the issue description, use the [Task Analysis template](#task-analysis-template) as handoff template.
5. Write the final markdown issue body to a temporary aux file under `docs/ai/tmp/issue-<issue-title>.md`.
6. Create with `.opencode/skills/shared-task/scripts/gh-issue.ts create <title> --body-file <tmp> --label ...`.
7. Report the created issue number and URL.

For non-create operations, call the helper command directly. The script handles all guardrails, labels, and formatting automatically.
Mutating commands are silent on success by design: exit 0 = success, failures print to stderr with exit 1. Check the exit code if captured output looks incomplete.

Helper command:
- TypeScript: `.opencode/skills/shared-task/scripts/gh-issue.ts <operation> ...`

For `/issue prclose <issue-number>`: 

1. Check if `docs/ai/tmp/pr-body-<issue>.md` already exists.
2. If that file exists, use it verbatim.
3. If absent, generate it using `.github/pull_request_template.md`
4. If `.github/pull_request_template.md` absent, be sure the pr body populates Summary, Testing, and Breaking changes sections.

## Safety minimums

- Authentication uses the GitHub App Device Flow via `.opencode/skills/shared-task/scripts/gh-app-auth.ts`. On first use, the agent will prompt for browser authorization. Subsequent runs use the cached token. Run the helper via `npx tsx .opencode/skills/shared-task/scripts/gh-issue.ts`.
- To bypass app auth, set `GITHUB_TOKEN` manually.

## Task Analysis template

Raw request:
Repository root:
Workflow references:
Known context:
Constraints: Analyze only. Do not edit files, invoke subagents, or create implementation plans.
Expected output: Task Analysis with issue title/body draft, suggested labels (status/type/priority), duplicate assessment, acceptance criteria, and open questions.
