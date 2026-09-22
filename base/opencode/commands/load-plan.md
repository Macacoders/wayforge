---
description: Load an approved implementation plan and identify the current task to implement.
agent: delivery
metadata:
  workflow: deliver
---

Load the implementation plan named below and identify the current task to implement.

Plan (path or slug):

$ARGUMENTS

Resolve the plan file under `docs/ai/plans/`. Read the YAML frontmatter and task list, then report:

- Plan status and the current task from the `task: <n>/<total>` frontmatter field.
- The current task's name, Objective, Files, and Steps, copied verbatim from the plan.
- Any `required_gates` declared in the frontmatter.

This command only loads and reports. Do not implement anything. Next, use `/implement-task` to hand the current task off to `code`.
