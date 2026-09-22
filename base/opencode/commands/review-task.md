---
description: Review the completed task against the plan and redirect if changes are insufficient.
agent: delivery
metadata:
  workflow: deliver
---

Review the completed task using git evidence. Inspect changed and added files and compare them against the task's acceptance criteria from the plan.

If the changes are not sufficient, ask the user for clarification and redirection, then suggest handing the task off again via `/implement-task` so `code` can continue before closing the task. Do not close a task that does not meet its acceptance criteria.

Validation is specified in the plan task and run by `code` as part of implementation; confirm it was actually run and matches the task's acceptance criteria.

If the task touches an architectural boundary (public contract, persistence format, auth/security, deployment topology, data model, or cross-module API), invoke `architect` in `review-only` mode before finalizing.

Update the plan's frontmatter: bump `task:` to the next task and, when all tasks are complete, set `status: completed`. Check only the `required_gates` the plan declares.

Include memory freshness in review by running `/memory check` (planner), `memory-maintenance` freshness check, or `ai-memory close-check` (with the companion `ai-memory` skill), then load only routed, task-relevant memory files.

Confirm the active repository root from the handoff or current git repository. Constrain review searches, reads, and git inspection to that root unless the user explicitly approves an external path.

Additional context:

$ARGUMENTS
