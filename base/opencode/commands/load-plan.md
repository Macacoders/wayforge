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

Treat the `task: <n>/<total>` frontmatter field as a legacy summary cursor, not as the source of
readiness. Do not paste task bodies unless asked, do not implement anything, and do not mutate the
plan in this command. Next: `/deliver-plan` to execute autonomously, or `/implement-task` then
`/review-task` to drive a single task by hand.
