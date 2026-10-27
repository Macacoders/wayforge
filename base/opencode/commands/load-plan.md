---
description: Load an approved plan and report its risk, task states, and the tasks that are ready to run now.
agent: delivery
---

Load the implementation plan named below and report its execution state.

Plan (path or slug):

$ARGUMENTS

Resolve the plan file under `docs/ai/plans/`. Read the YAML frontmatter and the task sections, then
report:

- `status:` and the declared `required_gates:`.
- One line per task: id, title, `**Status:**` (`pending | in-progress | accepted | blocked`), and
  `**Depends on:**`.
- The tasks that are `pending` with all dependencies `accepted` — the tasks ready to run now.
- Any task marked `blocked`, or a stale `in-progress` task, with its recorded reason.

For a plan written before ADR-0048 — no per-task `**Status:**` or `**Depends on:**` — derive those
fields from the frontmatter `task: <n>/<total>` cursor using the legacy-plan rules in the
`delivery-policy` skill, and say that you derived them. Older plans are still executable; do not turn
reporting into a migration task for the user.

Treat the `task: <n>/<total>` frontmatter field as a summary cursor on current plans and as the
readiness source only on legacy plans. Do not paste task bodies unless asked, do not implement
anything, and do not mutate the plan in this command. Next: `/deliver-plan` to execute autonomously,
or `/implement-task` then `/review-task` to drive a single task by hand.
