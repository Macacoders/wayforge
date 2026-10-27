---
description: Dispatch one plan task to code as an implementation work order.
agent: delivery
---

Load the `delivery-policy` skill. Dispatch the current task from the loaded plan to `code` as a
single `implementation` work order, then mark that task `in-progress` in the plan.

Build the work order from the task contract in the plan — task id, objective, context, acceptance
criteria, constraints, dependencies, validations — plus the repository root. Keep the plan's wording
for the deliverable: state the outcome and its guardrails, not a coding sequence. Include concrete
technical requirements only where the plan states them (mandatory interfaces, invariants, known
regressions, repository conventions).

Add a reuse expectation when the task touches repeatable logic: apply the ponytail ladder and name
the patterns, utilities, tests, or conventions to inspect, or state why none are expected.

Do not split the task into new tasks, do not prescribe steps the plan does not require, and do not
ask `code` to approve its own work.

Additional context:

$ARGUMENTS
