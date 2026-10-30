---
name: delivery-policy
description: Risk classification, work orders, independent verification, acceptance, recovery, repair budgets, and escalation.
compatibility: opencode
metadata:
  workflow: delivery
  owner: delivery
---

# Delivery Policy

`delivery` orchestrates and commits; independent workers implement and verify through bounded work orders. This skill owns shared decision rules; workers receive their contracts in the work order.

## 1. Risk Classification

Classify before dispatch: `direct` requires a localized, bounded change with clear behavior and straightforward verification. Use `full` for public API, persistence, security, runtime, shared-contract, data-model, or deployment boundaries; unresolved requirements/ownership, multiple deliverables, or uncertain impact/risk.

Record `Risk: direct — <reason>` or `Risk: full — <trigger>`.

The user may request `direct`, but cannot waive mandatory safety or verification boundaries through classification alone. Downgrading active `full` work requires explicit approval.

## 2. Work Orders

A plan task is a deliverable; a work order is an authorized operation on it.

| Kind | Owner | Purpose |
|---|---|---|
| `implementation` | `code` | Implement approved criteria |
| `repair` | `code` | Address bounded review findings |
| `functional_review` | `reviewer` | Independently verify implementation |
| `architecture_review` | `architect` | Verify architectural boundaries |
| `integration_review` | Authorized reviewer | Verify declared cross-task contracts |
| `research` | `research` | Answer a bounded investigation |

Each work order contains its ID/kind, objective, plan/task reference (if any), numbered criteria and evidence, bounded context and constraints, agent- versus human-owned validations, and expected result. Reviews also name the target revision; repairs carry prior findings.

Never send implementation instructions to reviewers or ask implementers to approve their own work.

### Worker results

Workers return work order ID/kind, `Status: completed | blocked | failed`, summary, changed files, validation commands/outcomes, and unresolved risks.

### Review results

Reviewers add `Verdict: pass | changes_required | blocked`, `Reviewed revision:`, `ACn pass|fail|unverifiable — evidence` for each criterion, and blocking findings with ID, category, evidence, impact, boundary/location, disposition, route, and owner. For re-reviews, relate prior findings and mark `new | persisting | regression | changed_expectation`; report at most three non-blocking follow-ups. Verdicts apply only to the inspected revision and affected scope.

## 3. Independent Verification

Reviewers inspect the diff, surrounding code, tests, and required validations independently; the implementer's report is not proof. Check approved criteria, applicable contracts, and material correctness, reliability, security, or regression defects in the affected boundary. Compare shared contracts with available counterparts or documented specifications. Re-review prior findings and behavior affected by a new revision, not unrelated accepted behavior. Reviewers remain read-only. Focused compatibility checks do not replace declared phase gates.

## 4. Finding Classification and Resolution

| Finding | Disposition | Resolution |
|---|---|---|
| Failed approved criterion or violated established applicable contract/invariant | `changes_required` | Evidence-backed bounded repair; identify both sides of a shared-contract mismatch |
| Demonstrated material correctness, reliability, or security defect within the affected boundary | `changes_required` | Evidence-backed bounded repair even if no criterion named the defect |
| Unverifiable criterion, missing evidence, or consequential unresolved requirement/decision | `blocked` | Obtain evidence or authorized clarification, not a repair |
| Demonstrated conflict with an applicable ADR | `changes_required` | Resolve the conflict through the authorized architectural route |
| Preference, speculative edge case without demonstrated material impact, unrelated/pre-existing observation, or ADR proposal without a demonstrated conflict | Non-blocking | At most three bounded follow-ups |

A blocking finding cites the criterion or contract, or shows concrete impact and evidence for a material in-scope defect; lack of a numbered criterion does not excuse it. Missing future counterparts are integration risks, not automatic failures. Do not invent requirements from preferences.

### Conflicting verdicts

When functional and architecture reviews disagree, compare evidence, revisions, criteria, and prior decisions; route unresolved contract or architectural decisions to their authorized owner and obtain a current independent verdict when necessary. `delivery` cannot overrule a substantiated finding. Clarification neither consumes a repair nor authorizes an extra review.

## 5. Task and Plan Readiness

Task statuses: `pending | in-progress | accepted | blocked`. Only `pending` tasks with all `Depends on:` tasks accepted can start. For legacy plans missing status/dependencies, derive them from the frontmatter `task:` cursor and sequential order; backfill metadata without rewriting task bodies. Insufficient criteria require clarification, not invention.

## 6. Paused Delivery Recovery

Before any new dispatch, reconstruct each `in-progress` task's revision, dispatch counts, validations, verdicts, pending decisions, ownership of uncommitted changes, and commit status from the conversation, handoff, plan, and repository evidence. Never reset counts, discard work, or treat resumed work as fresh implementation.

### Next-action rules

| Recovered state | Next action |
|---|---|
| No implementation yet / incomplete | Dispatch once / resume authorized implementation |
| Validation pending / review pending | Validate / dispatch pending functional then declared architecture review |
| Current required reviews passed | Commit and accept |
| `changes_required` | Check early stop and remaining budget, then repair |
| `blocked`, ambiguous, or exhausted | Seek decision / escalate; accepted and committed work needs no action |

Changes invalidate affected validation and review evidence. Missing or contradictory recovery evidence stops for the owner; blocked tasks may be deferred while independent ready tasks proceed.

### Phase integration recovery

At a declared phase boundary, run a pending integration gate after its tasks are accepted; retain passes on unchanged revisions. Failed/blocked gates use the authorized repair/decision route; changed accepted revisions invalidate affected gate evidence and require authorization for another review. Pending phase gates do not block independent ready tasks, but must pass before plan completion.

## 7. Repair and Review Budgets

Per task or direct objective: **one** `implementation`, up to **two** `repair` dispatches, across resumption. Stop sooner if a repair makes no material change to failing evidence. A newly evidenced material defect does not reset the cap; `blocked`/clarification does not spend a repair. Each declared phase gets one `integration_review`; each approved boundary category gets one `architecture_review` per revision.

Repairs carry current/prior finding IDs and dispositions, decisions, affected boundary, tally, and regression evidence. For trust-sensitive parsing, validation, or authentication defects, inspect closely related failure modes before re-review. Confirm required agent-owned validations before review; report human-owned validations without running them.

### Budget exhaustion

At exhaustion, give one diagnosis: findings/evidence, defect classification, boundary, attempts, complexity, and decision owner. Further repairs require explicit user authorization for a named task/objective, scope, and finite extra attempts; additional architecture/integration gate reviews require separate finite authorization. Never reset counters or repeatedly seek authorization without new justification. Re-review repairs on their new revision.

## 8. Acceptance Gates

### Task acceptance

Accept a task or direct objective only after all criteria and required validations pass, current independent reviews pass, blocking findings are resolved, and the work is committed (unless no commit is produced). `pass` requires that evidence; `changes_required` routes evidenced defects to repair; `blocked` routes missing evidence or decisions to their owner. Changed revisions invalidate affected evidence.

### Phase acceptance

Declared phase gates verify cross-task contracts, regression, and integration constraints; a task-level compatibility check does not satisfy them.

### Plan acceptance

A plan completes when all required tasks and plan criteria pass, declared gates pass, blocking findings are resolved, and human-owned validations are confirmed or explicitly waived by their owner. Non-blocking follow-ups do not prevent acceptance.

## 9. Stop Conditions

Stop and request a specific decision when:

- A repair or review budget is exhausted.
- A repair made no material change to the failing evidence.
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

Only `delivery` commits and accepts; only `code` implements/repairs; `reviewer` and `architect` are independent and read-only. `planner` owns substantive plan changes; the project owner authorizes material scope/product/architecture decisions. Preserve unrelated work and never commit unaccepted changes. Retry state lives in conversation/recovery evidence (ADR-0048), not a new store.
