---
description: Analyze a problem or idea and create a shared GitHub Issue task.
agent: planner
---

Create a new shared GitHub Issue task from this request:

$ARGUMENTS

Establish the active `Repository root:` once per session, then reuse it (and already-derived repo context) unless explicit cwd/repository changes or failed validation indicate context is stale. Keep all reads, searches, reviews, and handoff references inside that root unless the user explicitly approves an external path.

Use the shared task creation workflow:

1. Check if `docs/ai/backlog/README.md` exists:
   - If it exists: Read `docs/ai/backlog/README.md` and any relevant workflow references.
   - If it is missing: Read `.opencode/skills/shared-task/SKILL.md` as the fallback workflow reference.
2. Invoke `taskanalyst` with a compact Task Analysis Brief.
3. Check open GitHub Issues for probable duplicates (title/body/labels) before creating a new issue.
4. Review the analysis for missing required fields, duplicate risk, and classification errors.
5. Ask the user one concise clarification question if required fields are missing or a likely duplicate exists.
6. Before creating an issue, verify required workflow labels already exist in this repository:
   - Status: `status:to-do`, `status:doing`, `status:blocked`
   - Type: `type:task`, `type:feature`, `type:bug`, `type:docs`, `type:chore`
   - Priority: `priority:high`, `priority:medium`, `priority:low`
   - If any required labels are missing, stop and report exactly which labels are missing.
   - Tell the user to create missing labels manually in GitHub repository settings, then rerun `/newtask`.
   - Do not attempt automatic label creation.
7. If the task is ready, create a GitHub Issue in this repository.
   - Use a descriptive title that summarizes the work (the GitHub issue number is the canonical identifier).
   - Prefer `.opencode/skills/shared-task/scripts/gh-issue create ...` (installed target-repository path).
   - Reuse already-confirmed root/repo context when available; avoid redundant rediscovery in the same session.
   - If the skill helper is unavailable, use equivalent prelude for `gh issue`:
      - `export GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"` (or reuse existing session value when already set correctly).
      - Use `GH_REPO` when already set for this repository; if unset, derive `OWNER/REPO` from `git remote get-url origin` and pass `--repo OWNER/REPO`.
   - Do not require or use `gh repo view` for repository resolution.
8. Apply labels using the documented minimum set: one status label (`status:to-do`), one type label (default `type:task`), and one priority label.
9. Report the created issue number and URL.

Credential policy for this workflow:

- Use a personal fine-grained token scoped to this repository only.
- Minimum permissions: Metadata (read-only) and Issues (read/write).
- Never share tokens and do not use broad/global `gh` credentials.

Do not implement the task being created. This command only creates shared tasks.
