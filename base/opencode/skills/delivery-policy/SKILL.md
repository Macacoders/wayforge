---
name: delivery-policy
description: Risk classification, work-order contracts, acceptance gates, and retry/escalation budget for the delivery loop. Use when classifying a request, dispatching or reviewing work, or deciding to accept, repair, or escalate.
compatibility: opencode
metadata:
  workflow: delivery
  owner: delivery
---

# Delivery Policy

The single owning location for how work enters the workflow, how it is dispatched, how it is
verified, and when an agent stops and asks the user. `delivery` applies this policy; `planner`,
`troubleshooter`, and the delivery commands reference it instead of restating it.

## Risk Classification

Classify before dispatching any work. There are two paths: `direct` and `full`.

Choose `full` (intent, then plan) when any of these is true:

- **Boundary trigger:** public contract or API, CLI/wire format, persistence or file-format change,
  authentication/authorization/secrets/trust boundary, deployment or runtime topology, data model
  or invariants, or a cross-module/internal API other modules depend on.
- Requirements are ambiguous, or a decision belongs to the user (product behaviour, tradeoff,
  authorisation).
- The change spans more than one deliverable, or the blast radius is not visible from a small diff.
- Risk is unknown or uncertain — treat unknown as `full`.

Choose `direct` when all of these are true:

- It is a localized correction: one obvious cause, bounded blast radius.
- No boundary trigger applies.
- The expected behaviour is stated or obvious from the request, and existing validation (or one
  small test) can prove it.

Classification is `delivery`'s judgement and is recorded in one line:
`Risk: direct — <reason>` or `Risk: full — <trigger>`.

Overrides:

- A user may declare a change `direct`. That never crosses a boundary trigger or a hard safety
  boundary (edit/commit authority, independent review, destructive-action guards). If a boundary
  trigger applies, escalate to `full` and say why.
- `delivery` may reclassify upward at any time. Reclassifying downward after `full` work started
  requires the user's explicit agreement.

## Work Orders

A plan task is a **deliverable**. A work order is the **operation** dispatched to implement or
verify it. `delivery` derives work orders from task state and this policy; it does not invent
bespoke instructions per dispatch.

| Kind                  | Purpose                                   | Owner       |
| --------------------- | ----------------------------------------- | ----------- |
| `implementation`      | Deliver one task or direct-path objective | `code`      |
| `repair`              | Fix specified review findings             | `code`      |
| `functional_review`   | Verify one task or direct-path change     | `reviewer`  |
| `integration_review`  | Verify cross-task interaction in a phase   | `reviewer`  |
| `architecture_review` | Verify boundary changes against ADRs      | `architect` |
| `research`            | Answer one bounded investigation question | `research`  |

Every work order is one message with these fields:

- **Work order:** id and kind.
- **Plan/task reference:** plan path and task id (omit for direct-path work).
- **Objective:** the single outcome required.
- **Context:** bounded paths, symbols, decisions, and prior evidence the worker needs.
- **Acceptance criteria:** observable conditions, copied from the task or derived for direct work.
- **Constraints:** scope limits, invariants, reuse expectation, agent-owned vs human-owned
  validations.
- **Review target:** revision or diff scope (review kinds only).
- **Previous findings:** the findings to fix (repair only).
- **Expected result:** the result format below.

Never send implementation steps to a reviewer, and never ask a worker to approve its own output.

## Result Format

Workers return:

```md
Work order: <id> (<kind>)
Status: completed | blocked | failed
Summary: <2-3 sentences>
Changed files / artifacts: <paths, or none>
Validation: <commands run and outcome, or "not run — <reason>">
Findings / risks: <bullets, or none>
```

Reviewers add:

- `Verdict: pass | changes_required | blocked`
- `Reviewed revision:` the git range, sha, or working-tree diff actually inspected
- per-criterion results: `AC1 pass|fail — <evidence>`
- actionable findings: severity, evidence, location

`delivery` verifies the reviewed revision is the revision being accepted. A later change
invalidates earlier verdicts for the touched scope; those reviews run again.

## Plan Readiness and Legacy Plans

Readiness comes from the plan, in this order:

1. If the plan declares per-task `**Status:**` (`pending | in-progress | accepted | blocked`), that is
   authoritative.
2. If it does not — any plan written before ADR-0048 — derive it from the frontmatter
   `task: <n>/<total>` cursor: tasks with an index below `<n>` are `accepted`, the task at `<n>` and
   after are `pending`. With no `task:` field, every task is `pending`.
3. A task with no `**Depends on:**` field depends on the task before it. That is the legacy
   sequential order, not permission to run tasks in parallel.

Executing a legacy plan:

- Backfill `**Status:**` and `**Depends on:**` as each task is dispatched. These are progress
  metadata; task bodies are never rewritten.
- Legacy tasks may carry `**Step 1..5**` instructions, including a commit step. Use the objective,
  files, and acceptance criteria; treat the steps as guidance for `code`, drop any commit
  instruction (you commit), and never send steps to a reviewer.
- If a legacy task has no verifiable acceptance criteria, that is a `blocked` review condition, not a
  licence to invent them.

## Acceptance Gates

**Task acceptance** (`functional_review`) inspects the actual diff and surrounding context, not the
implementer's report:

- acceptance criteria met; scope compliance; functional behaviour
- test adequacy for the touched behaviour
- required agent-owned validations actually ran, with matching evidence
- obvious correctness, regression, and security concerns

**Phase acceptance** (`integration_review`) runs only when the plan declares an integration gate
for the phase or cross-task interaction risk is real:

- interface and contract consistency between accepted tasks
- integration and regression tests
- architectural coherence, maintainability, security

**Plan acceptance** runs once at the end:

- every required task `accepted`
- plan acceptance criteria satisfied
- declared `required_gates` passed
- blocking findings resolved
- human-owned validations reported (and confirmed, or explicitly waived by the user)

Agents never execute human-owned validations; they report the exact command and expected result.

## Retry and Escalation

Budget, per task or direct-path change, for the whole run:

- `implementation`: **1** dispatch, plus up to **2** `repair` dispatches. The second repair failing
  review is the end of the line: 3 dispatches total, then escalation.
- Re-reviews after a repair do not reset the count. A task that re-enters the loop keeps its tally.
- `integration_review`: **1** per phase gate.
- `architecture_review`: **1** per boundary category per revision.

Budgets live with the run (the conversation), not in a file, and they do not reset when the same
task re-enters the loop.

Stop and ask the user when:

- the repair/review budget is exhausted
- no `pending` task is ready while the plan is not complete (a blocked task or a dependency deadlock)
- the work needs a material change to approved intent or scope
- a consequential architectural choice is unresolved
- a human-owned validation or authorisation is outstanding
- a safety or permission boundary would be crossed
- conflicting findings cannot be resolved under this policy

The escalation states: what was being attempted, what failed (with evidence), what was already
tried, the decision needed, and the available options. Then stop — do not dispatch another round.

Successful routine task and phase transitions are never approval prompts.

## Integration and Commit Authority

- Only `delivery` commits and integrates. `code` never commits; `reviewer`, `architect`, and
  `research` never write.
- Order within a task: dispatch implementation → confirm agent-owned validations → independent
  review verdict → commit on `pass`.
- `changes_required` routes to a bounded `repair` work order, then a fresh review of the new
  revision.
- A task becomes `accepted` only when the review passed, required validations passed, and the work
  is committed (or the task declares work that produces no commit).
- Direct-path work commits on the same terms.

## Compatibility Notes

Wayforge 1.x carries this policy as prose plus one shared handoff/result template. The planned 2.0
deterministic orchestrator will consume the same terms — `work order`, `kind`, `status`, `verdict`,
`reviewed revision` — as machine-readable contracts. Do not add persistence, queues, or a scheduler
for them in 1.x.
