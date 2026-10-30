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
3. Dispatch an `implementation` work order to `code` carrying those criteria.
4. Confirm required agent-owned validations passed. Never run human-owned validations; report them.
5. Dispatch a `functional_review` work order to `reviewer` against the working-tree diff, including
   the criteria, required evidence, and applicable shared contracts.
6. Apply the policy's verdict, revision, repair budget, and stop rules: commit on a current `pass`;
   dispatch only evidenced `changes_required` findings as bounded `repair`; route `blocked` to the
   decision or evidence owner. Report attempts and the decision needed on escalation.
7. Record non-blocking follow-ups without dispatching them.

Do not write the code yourself, and do not accept a change whose criteria are not evidenced.

Request:

$ARGUMENTS
