# ADR-0006: Make New Tests Opt-In

Date: 2026-05-13
Status: Accepted

## Context

The staged workflow already separates implementation and testing review, but prior wording allowed ambiguous defaults around when `planner` should invoke `test` and when `test` could author test files. That ambiguity can produce unnecessary test churn, longer delivery cycles for low-risk changes, and unclear authorization for creating new tests.

We need a clearer policy that distinguishes three different actions:

1. Running existing validation commands.
2. Recommending additional tests.
3. Creating new tests.

## Decision

Adopt a strict opt-in policy for new test creation.

- `planner` must not invoke `test` by default.
- `planner` may run existing safe, relevant validation without invoking `test`.
- `planner` may recommend tests without creating them or delegating creation.
- `planner` may ask `test` to write tests only when one of these authorization conditions is true:
  - user explicitly requested tests,
  - tests were included in approved acceptance criteria,
  - user explicitly approved a concrete recommendation.
- Test handoffs must include auditable authorization fields:
  - `Mode`
  - `New tests approved`
  - `Approval source`
  - `Test budget`
  - `Allowed test types`
- `test` must not create or modify test files unless `New tests approved: yes` and mode is `write-tests`.

## Consequences

- Testing behavior is more predictable and explicit across phases.
- Low-risk documentation/configuration tasks can complete faster without default escalation into test authoring.
- User control increases because test creation requires explicit authorization.
- Handoffs become slightly heavier due to additional authorization metadata.
- Some useful tests may be deferred if explicit approval is not requested or captured.

## Alternatives Considered

- Keep current behavior (invoke `test` whenever useful): rejected because it does not make test creation authorization auditable and can imply default delegation.
- Require `test` invocation after every phase: rejected because it increases overhead for low-risk phases and conflates review with test authoring.
- Disallow test creation entirely in this workflow: rejected because explicit, high-value test creation is still needed for approved risk coverage.
