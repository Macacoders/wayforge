---
name: delivery-policy
description: Risk classification, work orders, independent verification, acceptance, recovery, repair budgets, and escalation.
compatibility: opencode
metadata:
  workflow: delivery
  owner: delivery
---

# Delivery Policy

`delivery` owns workflow orchestration, dispatch, acceptance, and escalation. It never implements product changes or independently judges their correctness.

Other agents receive bounded work orders. They do not need to load this entire policy.

**Core principles:**

- Acceptance requires evidence against approved criteria and applicable contracts.
- Demonstrable correctness, reliability, or security defects may block even when not explicitly anticipated by the plan.
- Reviewers cannot introduce unsupported preferences as new requirements.
- Previously completed gates, authorizations, and repair counts must survive workflow resumption.
- No role may bypass its authority or silently change approved scope.

## 1. Risk Classification

Classify requests before dispatching.

**`direct`** requires all of:

- Localized change with a bounded impact.
- No public API, persistence, security, runtime, or shared-contract boundary change.
- Clear expected behavior and straightforward verification.

**`full`** applies when:

- The change affects an architectural, security, persistence, API, data-model, or deployment boundary.
- Requirements or ownership decisions are unresolved.
- Multiple deliverables are involved.
- Impact or risk is uncertain.

Record `Risk: direct — <reason>` or `Risk: full — <trigger>`.

The user may request `direct`, but cannot waive mandatory safety or verification boundaries through classification alone. Downgrading active `full` work requires explicit approval.

## 2. Work Orders

A plan task is a deliverable. A work order is an authorized operation on that deliverable.

| Kind | Owner | Purpose |
|---|---|---|
| `implementation` | `code` | Implement approved criteria |
| `repair` | `code` | Address bounded review findings |
| `functional_review` | `reviewer` | Independently verify implementation |
| `architecture_review` | `architect` | Verify architectural boundaries |
| `integration_review` | Authorized reviewer | Verify declared cross-task contracts |
| `research` | `research` | Answer a bounded investigation |

Each work order contains:

- ID, kind, objective, and plan/task reference.
- Numbered acceptance criteria and required evidence.
- Bounded context, scope, constraints, and relevant decisions.
- Review target and prior findings when applicable.
- Agent-owned and human-owned validations.
- Expected result format.

Never send implementation instructions to reviewers or ask implementers to approve their own work.

### Worker results

Workers return:

- Work order ID and kind.
- `Status: completed | blocked | failed`.
- Summary and changed files.
- Validation commands and outcomes.
- Risks and unresolved findings.

### Review results

Reviewers return:

- `Verdict: pass | changes_required | blocked`.
- `Reviewed revision:` identifying the inspected revision or diff.
- `ACn pass|fail|unverifiable — evidence` for each criterion.
- Structured blocking findings with IDs, category, evidence, affected boundary, location, disposition, route, and owner.
- Prior-finding relationships and cross-round disposition where applicable.
- Up to three non-blocking observations outside the criteria.

A review verdict applies only to its inspected revision and affected scope.

## 3. Independent Verification

The reviewer obtains evidence independently through the actual diff, surrounding code, tests, and required validation commands.

The implementer's report is supporting information, not proof.

Reviewers must:

- Verify approved acceptance criteria and applicable contracts.
- Examine demonstrable correctness, reliability, security, and regression risks within the affected boundary.
- Verify shared contracts against available components or documented specifications when relevant.
- Distinguish defects from ambiguities and preferences.
- Remain read-only and never implement repairs.

For re-verification, cover prior findings, failed criteria, and behavior affected by the new revision. Unrelated accepted behavior need not be reviewed again.

A focused compatibility check does not replace a declared phase integration review.

## 4. Finding Classification and Resolution

| Finding | Disposition | Resolution |
|---|---|---|
| Violated approved criterion or contract | `changes_required` | Bounded repair |
| Demonstrable correctness, reliability, or security defect | `changes_required` | Evidence-backed repair |
| Missing or ambiguous requirement | `blocked` when judgment requires a decision | Authorized clarification |
| Conflict with existing ADR or invariant | `changes_required` | Architectural resolution |
| Missing architectural decision | `blocked` when required | Authorized decision |
| Preference or optional improvement | Non-blocking | Follow-up |

A blocking finding must cite a violated approved requirement or demonstrate a concrete defect with evidence.

Reviewers must not convert unspecified preferences into new acceptance criteria.

### Conflicting verdicts

When functional and architecture reviews disagree:

1. Compare the evidence, inspected revisions, approved criteria, and prior decisions.
2. Determine whether the disagreement concerns a demonstrated defect, contract ambiguity, or architectural decision.
3. Route unresolved decisions to the appropriate authorized owner.
4. Obtain a current independent verdict against the clarified contract when necessary.

`delivery` coordinates this process but cannot unilaterally override a substantiated finding.

Clarification does not consume a repair dispatch or automatically authorize an additional review.

## 5. Task and Plan Readiness

Task statuses are:

- `pending`
- `in-progress`
- `accepted`
- `blocked`

Explicit task statuses and `Depends on:` fields determine readiness.

Only pending tasks with all dependencies accepted may receive an initial implementation dispatch.

For legacy plans without explicit statuses or dependencies, use the frontmatter task cursor and sequential dependencies. Backfill progress metadata without rewriting task bodies.

If acceptance criteria are insufficient to verify a task, request clarification rather than inventing criteria.

## 6. Paused Delivery Recovery

Before dispatching new work, inspect every `in-progress` task.

Reconstruct:

- Current task status and revision.
- Implementation and repair dispatch counts.
- Validation results.
- Functional and architecture review verdicts.
- Outstanding decisions or authorizations.
- Task ownership of uncommitted changes.
- Commit and acceptance status.

Use the current conversation, recovery handoff, repository history, plan, and delivery logs.

Do not reset counts, discard work, or treat resumed tasks as fresh implementations.

### Next-action rules

| Recovered state | Next action |
|---|---|
| Implementation never dispatched | First authorized implementation |
| Existing implementation incomplete | Resume authorized implementation |
| Validation pending or failed | Validate or follow authorized repair route |
| Validation passed, functional review pending | Functional review |
| Functional passed, architecture pending | Architecture review |
| Required reviews passed, commit pending | Commit and accept |
| Review `changes_required` | Authorized bounded repair |
| Review `blocked` or ambiguous | Obtain required decision |
| Repair budget exhausted | Escalate |
| Accepted and committed | No action |

All decisions must use consistent evidence for the current revision.

A changed implementation invalidates affected prior validation/review evidence.

Missing or contradictory recovery evidence fails closed. An explicitly blocked task may be deferred while independent, dependency-ready tasks proceed.

### Phase integration recovery

When all tasks in a declared phase are accepted:

- Pending integration gate: run its authorized review.
- Passed gate on unchanged accepted revisions: retain the pass.
- `changes_required`: follow approved repair/escalation procedure.
- `blocked`: obtain the required decision.
- Changed accepted revisions: invalidate affected integration evidence and require appropriate authorization for another review.

A pending phase gate does not prevent otherwise eligible independent task work, but must pass before plan completion.

The detailed resume-transition regression matrix belongs in the harness test documentation, not in this policy.

## 7. Repair and Review Budgets

Default limits:

- One initial `implementation` dispatch per task.
- Up to two `repair` dispatches per task.
- One `integration_review` per declared phase gate.
- One `architecture_review` per boundary category per revision, subject to the approved gate.

Budgets apply throughout the delivery run and survive task re-entry.

Repair work orders must preserve:

- Current and prior finding IDs.
- Finding dispositions and relevant decisions.
- Affected contract or validation boundary.
- Existing implementation/repair tally.
- Required evidence and regression coverage.

For trust-sensitive parsing, validation, or authentication defects, inspect closely related failure modes before submitting another review.

Before independent review, confirm required agent-owned validations passed.

Human-owned validations must be reported, not executed by agents.

### Budget exhaustion

When exhausted, provide one consolidated diagnosis:

- Remaining findings and evidence.
- Defect classification.
- Affected boundary and scope.
- Attempts already used.
- Estimated complexity.
- Recommended decision or owner.

Additional repairs require explicit user authorization specifying task, scope, and finite extra attempts.

Repair authorization does not automatically extend independent review budgets.

Never reset counters or request repeated authorizations for the same unresolved boundary without new justification.

## 8. Acceptance Gates

### Task acceptance

A task may be accepted only when:

- Required criteria have passing evidence.
- Required validation commands pass.
- Required independent reviews pass on the current revision.
- Blocking findings are resolved.
- The accepted work is committed, or the task legitimately produces no commit.

### Phase acceptance

Declared integration gates must verify applicable cross-task contracts, regression behavior, and integration constraints.

A focused task-level compatibility review does not satisfy a phase gate.

### Plan acceptance

A plan is complete when:

- All required tasks are accepted.
- Plan acceptance criteria are satisfied.
- Required task, phase, and plan gates pass.
- Blocking findings are resolved.
- Human-owned validations are confirmed or explicitly waived by an authorized owner.

Non-blocking follow-ups do not prevent acceptance.

## 9. Stop Conditions

Stop and request a specific decision when:

- A repair or review budget is exhausted.
- No eligible task or recovery action can proceed.
- Required evidence is missing or contradictory.
- A consequential requirement or architectural decision is unresolved.
- Approved scope or an applicable invariant must change.
- Required human authorization or validation is outstanding and blocks further progress.
- A security or permission boundary would be crossed.
- Conflicting review findings cannot be reconciled under this policy.

Escalation must state what was attempted, what failed, supporting evidence, attempts already made, available options, and the exact decision required.

Do not request approval for successful routine transitions.

## 10. Authority and Compatibility

- `delivery` orchestrates, accepts, and commits.
- `code` implements and repairs; it does not commit.
- `reviewer` and `architect` independently evaluate; they do not modify implementation.
- `planner` owns substantive plan revisions.
- The authorized project owner approves material scope, product, and architectural changes.

Preserve unrelated worktree changes. Never commit unaccepted work.

Wayforge 1.x keeps retry state in conversation/recovery evidence as established by ADR-0048. Do not introduce persistent retry infrastructure without a separate architectural decision.

The planned 2.0 orchestrator may consume these concepts as structured contracts. This policy does not authorize implementing that infrastructure.