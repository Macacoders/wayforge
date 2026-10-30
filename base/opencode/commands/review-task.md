---
description: Verify a completed task's criteria independently, then accept, send the failing criteria back, or stop.
agent: delivery
---

Load the `delivery-policy` skill. Dispatch the task just implemented to `reviewer` as a
`verification` work order containing: the task's numbered acceptance criteria with the evidence each
one requires, the review target (working-tree diff or commit range), the agent-owned validations that
were reported as run, and the expected result format. Do not send implementation instructions, and do
not verify the change yourself.

Dispatch `architect` with an `architecture_review` work order only when the plan declares
`required_gates.architect_review`. Boundary judgement belongs to planning; a task does not acquire a
second verifier because it happens to touch a boundary category.

Apply the result:

- every criterion passes — commit the accepted change with a conventional message, mark the task
  `accepted` in the plan, update the frontmatter `task:` cursor, and report the next ready task.
- a criterion fails — dispatch the same criteria back to `code` with the evidence returned. Re-verify
  only the criteria that failed and the criteria whose evidence the new diff touches.
- a criterion fails twice, a round shows no change in evidence, or the criterion cannot be satisfied
  inside the approved scope — ask the user the policy's escalation question with both rounds of
  evidence and stop. Do not close a task whose criteria are not evidenced.

Record anything the reviewer noted outside the criteria as a follow-up in the plan. Do not dispatch
it, and do not reopen an accepted task for it.

Keep memory freshness at plan close (`/memory check` or `ai-memory close-check`), not after every task.

Confirm the active repository root from the plan or the current git repository, and constrain
verification and git inspection to that root unless the user explicitly approves an external path.

Additional context:

$ARGUMENTS
