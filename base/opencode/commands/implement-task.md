---
description: Hand off the current plan task to the code agent.
agent: delivery
---

Hand off the current task from the loaded plan to `code`.

Build a Code Handoff Brief by copy-pasting the task's description from the plan: use the task's Objective as the goal, its Files list as the relevant files, and its Steps as the atomic stages. Keep the plan's wording; do not rewrite or reinterpret the task.

Invoke one `code` subagent session for the whole task. Do not split the task into new tasks during handoff; use atomic stages only as implementation checkpoints inside the task. The `code` subagent must stop after each atomic stage and wait for explicit user approval before continuing in the same child session.

Use the Code Handoff Brief format in `base/opencode/agents/planner/references/code-handoff-template.md`.

Additional context:

$ARGUMENTS
