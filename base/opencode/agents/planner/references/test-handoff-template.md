# Test Handoff Brief Template

Use this format when invoking `test`:

```md
## Test Handoff Brief

Phase:
Repository root:
Acceptance criteria:
Changed files:
Risk areas:
Existing validation:
Mode:
New tests approved:
Approval source:
Test budget:
Allowed test types:
Reuse expectation: Review existing tests, helpers, fixtures, and coverage before recommending or writing new tests.
References to load:
Expected output:
```

`Mode` must be one of: `review-only`, `recommend-only`, or `write-tests`.

`New tests approved` must be `yes` only when test creation authorization is auditable. Otherwise set `no`.

`Approval source` must identify why test creation is allowed: `user explicit request`, `approved acceptance criteria`, `user approved recommendation`, or `not approved`.

`Test budget` must be concrete and minimal. Use `none` when new tests are not approved or not needed. Do not use broad budgets such as "add relevant tests".

`Allowed test types` must constrain scope to observable behavior, public contracts, error paths, or edge cases tied to the named risk.
