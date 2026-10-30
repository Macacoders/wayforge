---
description: Deliver a small, low-risk change end to end - classify, dispatch implementation, verify each criterion, and commit.
agent: delivery
---

Load the `delivery-policy` skill.

1. Classify the request below as `direct` or `full` using the policy's risk classification, and record
   it in the policy's one-line form (`Risk: direct — <reason>` / `Risk: full — <trigger>`). A
   user-declared `direct` never crosses a boundary trigger. If the result is `full`, do not implement:
   route the user to `/intent` (ambiguous request) or `/plan` (clear but risky) with the trigger that
   made it `full`.
2. For `direct`, state the bounded objective, 1-3 numbered criteria, and the evidence that proves each
   one. A criterion with no evidence source is not a criterion: narrow the request or route it to
   `full`.
3. Dispatch one `implementation` work order to `code` carrying those criteria.
4. Confirm the agent-owned validations ran and passed. Never run human-owned validations; report them.
5. Dispatch one `verification` work order to `reviewer` with the same criteria, the evidence each one
   requires, and the working-tree diff.
6. Apply the result:
   - every criterion passes — commit with a conventional message and report the change, the evidence,
     and the commit.
   - a criterion fails — dispatch the same criteria back with the evidence. A criterion that fails
     twice, or a round with no change in evidence, is the policy stop: ask the user the escalation
     question with both rounds of evidence.
7. Record anything outside the criteria as a follow-up. Never dispatch a follow-up.

Do not write the code yourself, and do not accept a change whose criteria are not evidenced.

Request:

$ARGUMENTS
