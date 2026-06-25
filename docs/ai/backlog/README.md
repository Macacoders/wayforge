# Shared Task Workflow

GitHub Issues is the operational source of truth for shared repository tasks. Use issues for active teamwork: create, list, claim, assign, release, and close work.

Use `/issue create <description>` to create shared tasks as GitHub Issues.
Use `/issue` for list/claim/assign/release/close/prclose operations.

Rule: each person/collaborator should use one responsible agent/session to interact with GitHub Issues for this repository to reduce duplicate updates and race conditions.

## Credentials and Safe `gh` Usage

- Each collaborator must use their own fine-grained GitHub token scoped only to this repository.
- Minimum required token permissions:
  - Metadata: **Read-only**
  - Issues: **Read and write**
- Never share tokens between people, sessions, or agents.
- Do not rely on broad/global `gh` credentials for shared task operations.
- Prefer repository-local credentials by setting `GH_CONFIG_DIR` to `.gh-config/` in this repository.
- For issue operations, resolve repository in this order:
  1. Use `GH_REPO` if set.
  2. Otherwise derive `OWNER/REPO` from `git remote get-url origin`.

Use `.opencode/skills/shared-task/scripts/gh-issue.ts` as the shared helper for issue operations. It enforces repository-local `GH_CONFIG_DIR` and repository resolution via native GitHub REST API calls.

Do not require or assume a top-level `scripts/` directory for shared task issue operations.

## GitHub Issues Workflow

1. **Create**: Use `/issue create <description>` to open a new GitHub Issue.
2. **List available work**: Use `/issue list` and focus on open issues with `status:to-do` and no assignee.
3. **Claim**: Use `/issue claim <issue-number>`.
   - First verify the issue is not assigned and does not already have `status:doing`.
   - Then assign yourself and set `status:doing` (remove `status:to-do` if present).
   - Add a short claim comment before implementation.
4. **Assign**: Use `/issue assign <issue-number> <collaborator>` to assign an issue to another collaborator.
   - First check the current assignee and `status:doing`; if already assigned or already `status:doing`, stop and resolve ownership before proceeding.
   - Then attempt to assign to the specified collaborator; if GitHub rejects the username (invalid user, not a collaborator, etc.), the command fails with an error and no changes are made.
   - On success, assign to the collaborator and set `status:doing` (remove `status:to-do` if present), then add a short assignment comment.
   - Note: `claim` is for self-assignment; `assign` is for assigning to others.
5. **Release**: Use `/issue release <issue-number>` when pausing or handing off.
   - Remove self assignee.
   - Set `status:to-do` unless blocked (then set `status:blocked` with a short reason).
6. **prclose**: Use `/issue prclose <issue-number>` when ready for code review (creates a PR and keeps the issue open).
   - The script handles branch protection, PR formatting, status labels, and comments automatically.
   - Ensure acceptance criteria are addressed before opening the PR.
   - Remove `status:doing` and add `status:in-review` label — handled by the script.
   - Create the Pull Request (issue remains open, will auto-close on merge).
7. **Close**: Use `/issue close <issue-number>` after completion and validation.
   - Use for tasks completed without code review or when closing rejected/abandoned work.
   - Ensure acceptance criteria are addressed.
   - Add a short completion summary comment.
   - Remove active/open status labels if present: `status:doing`, `status:to-do`, `status:in-review`, `status:blocked`.
   - Close the issue.
   - If using plain `gh` commands, prefer supported usage: `gh issue comment <issue-number> --body "<completion-summary>"` followed by `gh issue close <issue-number>` (do not use unsupported `gh issue close --comment`).

Duplicate-work prevention is process-based: always check assignee and `status:doing` before starting, then claim via assignee + status label + comment.

## Task Identifiers

- **New issues** — Use `/issue create <description>` to create an issue with a descriptive title. The issue number assigned by GitHub is the official identifier for all references, claims, and status tracking.
- **Cross-references** — Reference tasks by `#<issue-number>` (e.g., `#5`) in comments, commit messages, pull requests, ADRs, and plans.
- **Branch naming** — Use `feature/issue-{number}-{slugified-title}` for pull requests (already the convention in `/issue prclose`).

## Labels

Required labels for the shared task workflow (must already exist in the repository):

| Label | Hex color | Description |
| :--- | :--- | :--- |
| `status:to-do` | `#ededed` | Task is available to be claimed |
| `status:doing` | `#fbca04` | Task is currently assigned or in progress |
| `status:in-review` | `#1d76db` | Issue has an open Pull Request under review |
| `status:blocked` | `#d73a4a` | Task is blocked |
| `type:task` | `#0e8a16` | General shared task |
| `type:feature` | `#1d76db` | Feature work |
| `type:bug` | `#d73a4a` | Bug fix |
| `type:docs` | `#0075ca` | Documentation work |
| `type:chore` | `#cfd3d7` | Maintenance or cleanup |
| `priority:high` | `#b60205` | High priority |
| `priority:medium` | `#fbca04` | Medium priority |
| `priority:low` | `#0e8a16` | Low priority |

If required labels are missing, stop task creation/updates and report the missing label names. Create missing labels manually in GitHub repository settings, then retry `/issue`. Do not auto-create labels from workflow commands.

## Maintenance Rules

- Keep GitHub Issues as the operational shared tracker.
- Add new shared tasks through `/issue create` by default.
- Use `/issue claim <issue-number>` for self-assignment or `/issue assign <issue-number> <collaborator>` to assign to others before starting implementation on shared work.
- Keep issue state current through assignees, status labels, and short comments.
- Link ADRs, plans, or pull requests from the issue when a task creates durable decisions or implementation work.
- Do not store raw diffs, transcripts, or long logs in issues; summarize outcomes and link durable references instead.

## PR Creation Standards

Use `/issue prclose <issue-number>` to create a pull request. The script handles branch protection, PR formatting, status labels, and comments automatically. The branch naming convention is `feature/issue-{number}-{slugified-title}`.
