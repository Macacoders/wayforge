---
description: Deliver a small, low-risk change end to end - classify, dispatch implementation, verify independently, and commit.
agent: delivery
---

Load the `delivery-policy` skill.

1. Classify the request below as `direct` or `full` using the policy's risk classification, and record
   it in the policy's one-line form (`Risk: direct — <reason>` / `Risk: full — <trigger>`). A
   user-declared `direct` never crosses a boundary trigger. If the result is `full`, do not implement:
   route the user to `/intent` (ambiguous request) or `/plan` (clear but risky) with the trigger that
   made it `full`.
2. For `direct`, state the bounded objective, 1-3 observable acceptance criteria, and the
   agent-owned validation command(s).
3. Dispatch one `implementation` work order to `code`.
4. Confirm the agent-owned validations ran and passed. Never run human-owned validations; report them.
5. Dispatch a `functional_review` work order to `reviewer` against the working-tree diff.
6. Apply the verdict:
   - `pass` — commit with a conventional message and report the change, the evidence, and the commit.
   - `changes_required` — dispatch one bounded `repair` work order carrying the findings, then review
     the new revision again. Repairs share the policy budget and do not reset it.
   - `blocked` or budget exhausted — ask the user the policy's escalation question and stop.

Do not write the code yourself, and do not accept the change without a reviewer verdict.

Request:

$ARGUMENTS
