---
description: Manage shared GitHub Issues tasks (list, claim, release, close).
agent: planner
---

Manage shared tasks in GitHub Issues for this repository.

Usage:

- `/tasks list`
- `/tasks claim <issue-number>`
- `/tasks release <issue-number>`
- `/tasks close <issue-number>`

Rules:

1. Use one responsible agent/session per person/collaborator when interacting with GitHub Issues for this repository.
2. Before `claim`, verify the issue is not already assigned and does not already have `status:doing`.
3. Claim by assigning yourself, setting `status:doing`, removing `status:to-do` if present, and adding a short claim comment.
4. Release by removing your assignee and restoring `status:to-do` unless blocked (`status:blocked` + short reason).
5. Close only after acceptance criteria are addressed; add a short completion summary comment.
6. For issue operations, prefer `.opencode/skills/shared-task/scripts/gh-issue ...`.
7. Compatibility fallback: use `scripts/gh-issue ...` when this repository provides it.
8. If no helper path is available, use equivalent `gh issue` prelude:
   - `export GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`
   - Use `GH_REPO` when set; otherwise derive `OWNER/REPO` from `git remote get-url origin` and pass `--repo OWNER/REPO`.
9. Do not require or use `gh repo view` for repository resolution.

Use labels (not GitHub Projects) for status tracking in this initial workflow.

Action contract:

- `list`: query open issues and show number, title, assignee, and status labels (prefer filtering available work as `status:to-do` + no assignee).
- `claim <issue-number>`: check current assignee/labels first, then assign self, set `status:doing` (remove `status:to-do`), and add a short claim comment.
- `release <issue-number>`: add a short release comment, remove self assignee, then set `status:to-do` (or `status:blocked` with reason).
- `close <issue-number>`: add a completion summary comment and close the issue only after acceptance criteria are addressed.

Use `gh issue` commands via the helper when available for these checks and updates.

Credential policy for this workflow:

- Use a personal fine-grained token scoped to this repository only.
- Minimum permissions: Metadata (read-only) and Issues (read/write).
- Never share tokens and do not use broad/global `gh` credentials.
