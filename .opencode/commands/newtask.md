---
description: Analyze a problem or idea and create a shared GitHub Issue task.
agent: planner
---

Create a new shared GitHub Issue task from this request:

$ARGUMENTS

First establish the active repository root. Keep all reads, searches, reviews, and handoff references inside that root unless the user explicitly approves an external path.

Use the shared task creation workflow:

1. Read `docs/ai/backlog/README.md` and any relevant workflow references.
2. Invoke `taskanalyst` with a compact Task Analysis Brief.
3. Check open GitHub Issues for probable duplicates (title/body/labels) before creating a new issue.
4. Review the analysis for missing required fields, duplicate risk, and classification errors.
5. Ask the user one concise clarification question if required fields are missing or a likely duplicate exists.
6. If the task is ready, create a GitHub Issue in this repository.
   - Prefer `scripts/gh-issue create ...` when available.
   - If the helper is unavailable, use equivalent prelude for `gh issue`:
     - `export GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.gh-config"`
     - If `GH_REPO` is unset, derive `OWNER/REPO` from `git remote get-url origin` and pass `--repo OWNER/REPO`.
   - Do not require or use `gh repo view` for repository resolution.
7. Apply labels using the documented minimum set: one status label (`status:to-do`), one type label (default `type:task`), and one priority label.
8. Report the created issue number and URL.

Credential policy for this workflow:

- Use a personal fine-grained token scoped to this repository only.
- Minimum permissions: Metadata (read-only) and Issues (read/write).
- Never share tokens and do not use broad/global `gh` credentials.

Do not implement the task being created. This command only creates shared tasks.
