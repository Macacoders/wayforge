---
description: Hand off the current plan task to the code agent.
agent: delivery
---

Hand off the current task from the loaded plan to `code`.

Build a Code Handoff Brief by copy-pasting the task's description from the plan: use the task's Objective as the goal, its Files list as the relevant files, and its Steps as the atomic steps. Keep the plan's wording; do not rewrite or reinterpret the task.

Invoke one `code` subagent session for the whole task. Do not split the task into new tasks during handoff; `code` will use atomic steps only as implementation checkpoints inside the task. When invoking the agent, start with "The following is your Handoff Brief:", and include the task.

Include these brief fields: Task, Goal, Repository root, Acceptance criteria, Atomic steps, Relevant files, Confirmed decisions, Constraints, References to load. Add a reuse expectation when the task touches repeatable logic: apply the ponytail ladder and name the patterns/utilities/tests/conventions to inspect, or state why none are expected.

Additional context:

$ARGUMENTS
