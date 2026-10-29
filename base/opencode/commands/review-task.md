---
description: Independently review a completed task, apply the verdict, and bound the repair loop.
agent: delivery
---

Load the `delivery-policy` skill. Dispatch the task just implemented to `reviewer` as a
`functional_review` work order containing: the task contract and acceptance criteria, the review
target (working-tree diff or commit range), the agent-owned validations that were reported as run, and
the expected result format. Do not send implementation instructions, and do not review the change
yourself.

Dispatch `architect` with an `architecture_review` work order when the change touches a boundary
category or the plan's `required_gates.architect_review` is true.

Reconcile the functional and any required architecture verdicts under `delivery-policy` before
acceptance. Do not automatically prefer either role, accept stale review evidence, or turn an
unjudgeable criterion into a failure or repair.

Apply the reconciled outcome:

- `pass` — commit the accepted change with a conventional message, mark the task `accepted` in the
  plan, update the frontmatter `task:` cursor, and report the next ready task.
- `changes_required` — dispatch one bounded `repair` work order containing the findings and evidence,
  then review the new revision. Repairs and re-reviews share the policy budget and never reset it.
- `blocked`, unresolved disagreement, or exhausted budget — ask the user the policy's escalation
  question and stop. Do not close a task that does not meet its acceptance criteria. Clarification does
  not consume a repair dispatch or authorize an extra review.

Check only the `required_gates` the plan declares. Keep memory freshness at plan close (`/memory
check` or `ai-memory close-check`), not after every task.

Confirm the active repository root from the plan or the current git repository, and constrain review
and git inspection to that root unless the user explicitly approves an external path.

Additional context:

$ARGUMENTS
