---
name: shared-task
description: Use for shared GitHub Issues task workflow with /tasks, /newtask, and gh-issue helper operations.
compatibility: opencode
metadata:
  workflow: shared-task-github-issues
---

# Shared Task GitHub Issues Helper

Use this skill when working on shared task issue operations for this repository (`/tasks`, `/newtask`, and direct helper usage).

## Preferred helper

Choose the appropriate script for your platform:

- **Linux/macOS/Git Bash**: `.opencode/skills/shared-task/scripts/gh-issue <issue-subcommand> ...`
- **Windows PowerShell**: `.opencode/skills/shared-task/scripts/gh-issue.ps1 <issue-subcommand> ...`

Example: `.opencode/skills/shared-task/scripts/gh-issue view 8 --json number,title,state`

## Safety and credential contract

- Keep `GH_CONFIG_DIR` repository-local by default: `$(git rev-parse --show-toplevel)/.gh-config`.
- Repository resolution order:
  1. Respect `GH_REPO` when set.
  2. Otherwise derive `OWNER/REPO` from `git remote get-url origin`.
  3. Respect explicit `--repo OWNER/REPO` (or `-R OWNER/REPO`) when provided.
- Do not require or rely on `gh repo view`.
- Use a personal fine-grained token scoped to the repository only (Metadata read-only, Issues read/write).
- Do not rely on broad/global `gh` credentials for shared task operations.

## Required issue labels for this workflow

Shared task operations assume these labels already exist in the consuming repository:

- Status: `status:to-do`, `status:doing`, `status:in-review`, `status:blocked`
- Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
- Priority: `priority:high`, `priority:medium`, `priority:low`

Do not auto-create labels from `/newtask` or `/tasks`. If required labels are missing, stop and report the missing names so the user can create them manually in GitHub repository settings.

## Manual fallback if helper is unavailable

Use plain `gh issue` with equivalent prelude:

**Linux/macOS/Git Bash:**
```bash
export GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"
# If GH_REPO is unset, derive OWNER/REPO from git remote get-url origin
gh issue --repo OWNER/REPO <subcommand> ...
```

**Windows PowerShell:**
```powershell
$env:GH_CONFIG_DIR = "$(git rev-parse --show-toplevel)/.gh-config"
# If GH_REPO is unset, derive OWNER/REPO from git remote get-url origin
gh issue --repo OWNER/REPO <subcommand> ...
```

For close/completion flow, close only after acceptance criteria are addressed. Add completion text with `gh issue comment <issue-number> --body "<summary>"`, remove active/open status labels (`status:doing`, `status:to-do`, `status:blocked`) if present, and then close with `gh issue close <issue-number>`. Do not use `gh issue close --comment`.
