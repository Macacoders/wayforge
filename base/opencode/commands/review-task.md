---
description: Verify a completed task's criteria independently, then accept, request bounded repairs, or stop.
agent: delivery
---

Load `delivery-policy`. After required agent-owned validations pass, dispatch `functional_review` to `reviewer` with the task contract, criteria/evidence, inspected revision or diff, validation evidence, and expected result. Include available shared-contract counterparts or documented specifications when applicable. Do not self-review or send implementation instructions to reviewers. Dispatch `architecture_review` only for `required_gates.architect_review`; reconcile current independent verdicts under the policy.

On `pass`, commit, mark the task `accepted`, update `task:`, and report the next ready task. On `changes_required`, dispatch a bounded `repair` with finding history and preserved tally, then review the new revision. On `blocked`, seek evidence or an authorized decision. Stop on policy stop conditions with attempts, evidence, and the needed decision. Record non-blocking follow-ups without dispatching them; check memory freshness at plan close, not per task. Keep verification within the repository root unless the user approves an external path.

Additional context:

$ARGUMENTS
