---
description: Verify a completed task's criteria independently, then accept, request bounded repairs, or stop.
agent: delivery
---

Load the `delivery-policy` skill. Dispatch the task just implemented to `reviewer` as a
`functional_review` work order containing: the task contract, numbered acceptance criteria and
the evidence each criterion requires, the review target (working-tree diff or commit range),
the agent-owned validations that were reported as run and their evidence, and the expected
result format.

Do not dispatch when required validation failed or its evidence is missing. Do not send
implementation instructions, and do not review the change yourself.

When the task affects a shared configuration constraint, resource budget, API schema,
serialization format, or integration assumption, include the affected contract and available
counterpart in that existing review work order; when a counterpart is unavailable, include
the explicitly documented contract instead. This is focused task evidence, not an
integration-review dispatch.

Dispatch `architect` with an `architecture_review` work order only when the plan declares
`required_gates.architect_review`. Boundary judgement belongs to planning; a task does not
acquire a second verifier because it happens to touch a boundary category.

Reconcile the functional and any required architecture verdicts under `delivery-policy`
before acceptance. Do not automatically prefer either role, accept stale review evidence,
or turn an unverifiable criterion into a failure or repair.

Apply the reconciled outcome:

- `pass` — commit the accepted change with a conventional message, mark the task `accepted`
  in the plan, update the frontmatter `task:` cursor, and report the next ready task.
- `changes_required` — dispatch one bounded `repair` work order containing finding IDs,
  prior IDs and decisions, cross-round dispositions, affected boundary, evidence, failing
  criteria, and the preserved dispatch tally. Re-verify the failed criteria, prior findings,
  and criteria whose evidence the new revision affects. Then obtain the required fresh
  reviews of the new revision. Repairs and re-reviews share the policy budget and never
  reset it.
- `blocked`, unresolved disagreement, validation failure, or exhausted budget — ask the user
  the policy's escalation question and stop. At exhaustion, consolidate same-boundary requests
  and state classification, evidence, scope, complexity, attempts, and recommended owner;
  only explicit finite user authorization for a named small local scope permits another
  dispatch. Do not close a task that does not meet its acceptance criteria. Clarification
  does not consume a repair dispatch or authorize an extra review.

Record anything the reviewer noted outside the criteria as a follow-up in the plan.
Do not dispatch it, and do not reopen an accepted task for it.

Keep memory freshness at plan close (`/memory check` or `ai-memory close-check`), not after
every task.

Confirm the active repository root from the plan or the current git repository, and
constrain verification and git inspection to that root unless the user explicitly approves
an external path.

Additional context:

$ARGUMENTS