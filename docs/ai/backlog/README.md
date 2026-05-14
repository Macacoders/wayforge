# Shared Task Workflow

GitHub Issues is the operational source of truth for shared repository tasks. Use issues for active teamwork: create, list, claim, release, and close work.

Use `/newtask` to create shared tasks as GitHub Issues.
Use `/tasks` for list/claim/release/close operations.

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

Use `.opencode/skills/shared-task/scripts/gh-issue` for issue operations; it enforces repository-local `GH_CONFIG_DIR` and repository resolution for `gh issue` commands without requiring `gh repo view`.

`scripts/gh-issue` may exist in this repository as a compatibility wrapper, but consuming repositories should not require or assume a top-level `scripts/` directory.

## GitHub Issues Workflow

1. **Create**: Use `/newtask <description>` to open a new GitHub Issue.
2. **List available work**: Use `/tasks list` and focus on open issues with `status:to-do` and no assignee.
3. **Claim**: Use `/tasks claim <issue-number>`.
   - First verify the issue is not assigned and does not already have `status:doing`.
   - Then assign yourself and set `status:doing` (remove `status:to-do` if present).
   - Add a short claim comment before implementation.
4. **Release**: Use `/tasks release <issue-number>` when pausing or handing off.
   - Remove self assignee.
   - Set `status:to-do` unless blocked (then set `status:blocked` with a short reason).
5. **Close**: Use `/tasks close <issue-number>` after completion and validation.
   - Ensure acceptance criteria are addressed.
   - Add a short completion summary comment.
   - Remove active/open status labels if present: `status:doing`, `status:to-do`, `status:blocked`.
   - Close the issue.
   - If using plain `gh` commands, prefer supported usage: `gh issue comment <issue-number> --body "<completion-summary>"` followed by `gh issue close <issue-number>` (do not use unsupported `gh issue close --comment`).

Duplicate-work prevention is process-based: always check assignee and `status:doing` before starting, then claim via assignee + status label + comment.

## Labels

Minimum useful labels:

- Status:
  - `status:to-do`
  - `status:doing`
  - `status:blocked`
- Type:
  - `type:task`
  - `type:feature`
  - `type:bug`
  - `type:docs`
  - `type:chore`
- Priority:
  - `priority:high`
  - `priority:medium`
  - `priority:low`

## Maintenance Rules

- Keep GitHub Issues as the operational shared tracker.
- Add new shared tasks through `/newtask` by default.
- Use `/tasks claim <issue-number>` before starting implementation on shared work.
- Keep issue state current through assignees, status labels, and short comments.
- Link ADRs, plans, or pull requests from the issue when a task creates durable decisions or implementation work.
- Do not store raw diffs, transcripts, or long logs in issues; summarize outcomes and link durable references instead.
