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
verified, and when an agent stops and asks the user. `delivery` applies this policy; `planner` may
consult it for classification. Other roles receive relevant work-order information or concise
diagnostic routing guidance instead of loading it.

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
- **Expected result:** the complete, bounded result required from this worker, using the format below
  plus any role-specific fields. Include it in the work order; never tell a worker to load this skill
  to obtain its contract.

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
- per-criterion results: `AC1 pass|fail|unjudgeable — <evidence or missing decision>`; use
  `unjudgeable`, not `fail`, when the approved contract cannot decide the criterion
- actionable findings, each with a stable within-run ID; review kind, task, inspected revision/diff,
  affected contract or validation boundary, category, severity/blocking disposition, evidence and
  location, relation to a prior finding when applicable, cross-round disposition (`new`,
  `persisting`, `regression`, or `changed_expectation`), recommended route, and decision owner

Finding categories are `explicit_requirement`, `demonstrable_defect`,
`underspecified_requirement`, `architectural_conflict`, `architectural_preference`, and
`optional_improvement`. A blocking finding must cite an approved criterion or documented contract, or
provide reproducible correctness, reliability, or security impact and evidence. Category alone does
not determine severity. Keep preferences, suggestions, unrelated pre-existing issues, and optional
improvements separate from blocking findings; avoid exposing unnecessary sensitive artifact content.

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

When the touched task affects a shared configuration constraint, resource budget, API schema,
serialization format, or integration assumption, the functional review also includes a focused
compatibility check before task acceptance. The work order identifies the affected shared contract
and the available component to compare, or cites the explicitly documented contract when no
counterpart is available. The reviewer records the two sides and the contract in any concrete
incompatibility finding. A documented-contract violation or demonstrable defect is
`changes_required`; an underspecified expectation is `blocked` and follows the finding-resolution
route rather than becoming an invented requirement. Missing evidence from a future component is an
identified integration risk, not an inferred pass or failure.

This is evidence within the existing task-review gate, not a new worker, global gate, or full-suite
integration review. Tasks without that shared-contract risk use ordinary independent review.

Focused-check walkthroughs:

- A shared configuration change is compared with its available consumer; a changed constraint the
  consumer cannot satisfy is a blocking finding only when both sides and their contract show it.
- A resource-limit change is compared with the scheduler or documented budget; incompatible limits
  are a documented-contract violation or demonstrable defect, not a preference.
- A schema or serialization change is compared with its producer/consumer or wire-format contract;
  an evidenced mismatch blocks, while an unspecified expectation follows the `blocked` route.
- With no future counterpart available, the reviewer checks the explicit contract and reports the
  remaining integration risk without inferring a pass or failure from absence.
- An unrelated task receives no focused check or extra integration gate. If its phase declares an
  integration gate, that gate still runs after the phase; an earlier task check never accepts it.

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

## Finding Resolution and Conflicting Verdicts

`delivery` records compact finding IDs and dispositions in the within-run handoff; this is not a
persistent ledger, new authority, or permission to rewrite a plan. Use these routes:

| Finding | Outcome and authority |
| --- | --- |
| Approved criterion or documented contract violation with evidence | `changes_required`; the independent functional reviewer identifies it and `delivery` routes a bounded repair and fresh review. |
| Demonstrable correctness, reliability, or security defect, including one not enumerated by the plan | `changes_required`; the independent functional reviewer identifies it. When the task touches an ADR-0025 boundary category or its plan declares an architecture gate, an architecture review assesses boundary implications; the owner approves any material scope change. A prior pass does not dismiss new evidence. |
| Underspecified requirement or two materially equivalent implementations with no demonstrated defect | `blocked` if a new product requirement is needed; no repair for preference. The authorized project owner chooses behaviour, and the planner revises an approved intent/plan when material. A minor choice within approved architecture remains the implementer's discretion. |
| Architectural conflict with an ADR/invariant, or missing architectural decision | `changes_required` for a demonstrated conflict; `blocked` for missing facts or a required decision. The architect supplies independent boundary evidence; the owner approves a material plan/ADR change. |
| Optional improvement, unsupported preference, or unrelated pre-existing issue | Non-blocking and outside the verdict; report separately and track only with authorization. |

Before accepting, reconcile functional and architecture conclusions that conflict, a finding that
contradicts a recorded decision, a changed expectation, or results for different revisions. Hold
acceptance; compare the approved criterion, impact, inspected revisions, and prior decision. A stale
result requires current independent review of the touched scope. Neither reviewer is automatically
favored: `delivery` coordinates evidence but does not overrule a substantiated finding or invent a
criterion. The relevant owner resolves product or material architectural/plan changes, and the
affected revision receives required validation and a current independent verdict. An architecture pass
does not negate a substantiated functional defect; a disputed blocking finding remains unresolved until
the independent reviewer reclassifies it on evidence or the authorized owner resolves the contract.

Clarification itself consumes neither a repair dispatch nor an additional review authorization. Record
the decision and authority in the approved plan or ADR before treating a material change as an
acceptance expectation; then obtain a current independent review. Existing budgets still apply:
ordinary fresh reviews after a repair, or of a stale touched scope, remain authorized within their
applicable policy budget. Explicit authorization is required only for a review dispatch beyond that
budget; clarification never grants one.

**Identity/digest example:** when both identity and embedded digest are invalid, inspect the approved
artifact contract and security rationale. Enforce documented precedence or an order with demonstrated
security/correctness impact as an evidence-backed finding. If the contract leaves both materially
equivalent, do not block for a preferred order; obtain owner-approved clarification before judging a
new guarantee. This example does not determine any consumer artifact's actual order.

## Retry and Escalation

### Paused-task recovery

On every `/deliver-plan` entry, inventory each `in-progress` task before selecting a fresh pending
task. Record the task status; implementation and repair counts; latest validation and functional,
architecture, and integration-review outcomes and their revisions; pending repair, review,
clarification, or authorization; and whether uncommitted worktree changes belong to that task. Use
the plan, the active conversation/recovery handoff, logs, and repository evidence; these are
inspection inputs, not persistent retry state.

Do not rewrite an `in-progress` task to `pending`, reset a tally, discard changes, or send a fresh
`implementation` merely because delivery restarted. Incomplete, contradictory, or missing history,
counts, review/revision evidence, validation evidence, or worktree ownership fails closed: preserve
the task and ask the owner for a recovery decision. A blocked task remains blocked until its recorded
decision or authorization is supplied. External blockers may be deferred only when dependency
readiness and approved gates leave another pending task ready.

| Recovered state | Delivery action |
| --- | --- |
| Incomplete existing implementation; scope and authority are clear | Resume that already-authorized implementation only; retain its implementation tally and changes. |
| Validation pending or failed | Obtain/repair the required validation evidence; do not review or accept first. |
| Current validation passed; functional review pending | Dispatch only `functional_review` against the current revision; do not implement again. |
| Current validation passed; functional review passed and required architecture review pending | Dispatch only `architecture_review` against the current revision; do not repeat functional review. |
| Current validation passed; all required reviews passed and commit/acceptance pending | Confirm criteria and required gates, then commit and mark the task accepted; do not re-review. |
| `changes_required` with repair capacity | Dispatch the bounded repair with the preserved tally and findings, then fresh review. |
| Ambiguous or blocked finding, pending clarification/authorization | Stop for the named owner decision; do not dispatch a repair. |
| Repair capacity exhausted | Stop with the consolidated exhaustion diagnosis unless a finite, task-scoped user extension exists. |
| All task gates passed and the change is committed | Keep the task `accepted`; never reimplement or rereview solely on resume. |

For every row, first require complete, non-contradictory evidence for the current revision: implementation
and repair counts; validation outcome; required functional and architecture verdicts; criteria/gate status;
commit status; and ownership of uncommitted changes. A review `pass` is usable only for the exact
unchanged revision and touched scope. A known, authorized task-owned change with consistent history moves
the task to validation and then the required fresh touched reviews for that new revision; it never permits
use of an old pass. Only unexplained, missing, or contradictory revision ownership/history selects the
owner stop. External deferral is available only for an evidenced external blocker, never for absent or
inconsistent recovery evidence.

The next-action selection is exhaustive for a recovered task: implementation `pending` selects the one
authorized implementation; implementation `completed` with validation `pending` selects validation;
validation `failed` selects its evidenced correction/re-run before review; validation `passed` with
functional review `pending` selects functional review; functional `pass` with required architecture
review `pending` selects architecture review; functional or architecture `changes_required` selects an
authorized repair or the exhaustion stop; either review `blocked` selects its named owner decision;
both required reviews `pass` with task acceptance/commit `pending` selects criteria/gate confirmation,
commit, and acceptance; a committed accepted task selects nothing. An architecture gate not required is
already satisfied, not a review dispatch. These labels are revision-specific: a known authorized change
moves the task back to validation and the required touched reviews, while missing, unexplained, or
contradictory revision evidence selects the owner stop.

Declared phase gates are not general task scheduling barriers. Continue eligible recovered work or
dependency-ready pending tasks even when an earlier declared gate is pending. Before plan completion,
when no eligible task work remains, route each declared phase gate whose tasks are all accepted: integration
`pending` selects its one integration review; integration `pass` on the exact unchanged accepted revisions
is retained; integration `changes_required` or `blocked` follows its approved finding-resolution or owner
route, otherwise stops. Do not silently accept the phase or dispatch another integration review beyond the
one-per-phase budget. A repair that changes an accepted task invalidates the phase gate; a further
integration review requires the policy's explicit authorization.

For a declared gate, integration `pending` after all its phase tasks are accepted selects the one
integration review before plan completion; integration `pass` on the exact unchanged accepted revisions
is retained; integration `changes_required` selects the finding-resolution/exhaustion route; integration
`blocked` selects its named owner decision or an evidenced allowed external deferral. The plan gate is
`pending` until all required tasks and declared phase gates pass, then selects
the plan acceptance checks. No phase or plan state may be inferred from a missing or contradictory
checkpoint.

Dependencies still govern all fresh work: only `pending` tasks whose dependencies are `accepted` are
ready. An in-progress recovery never bypasses a dependency; a pending phase gate does not block eligible
task work. An external blocked task does not prevent an independent ready task from advancing.

Paused-delivery walkthroughs:

1. A fresh pending task with accepted dependencies is marked in progress and receives its one implementation dispatch.
2. An in-progress task with passed validation and functional review pending receives only functional review; with functional pass and architecture pending, it receives only architecture review.
3. An in-progress task with failed or missing validation remains blocked until validation evidence is supplied; no review runs.
4. An in-progress task with two repairs used and `changes_required` stops with the exhaustion diagnosis.
5. A task with its normal repairs used and a user-authorized finite additional repair carries that authorization and tally into that one repair; it does not reset either count.
6. An in-progress task with uncommitted changes proceeds only after evidence identifies the changes as its owned authorized work; otherwise delivery stops for the owner.
7. An accepted task with its reviewed change committed stays accepted on resume.
8. Missing or contradictory dispatch, count, review, validation, or revision history stops for an owner recovery decision.
9. A task blocked by an external dependency is deferred while a different pending task with accepted dependencies advances; the blocked task is not accepted or reset.
10. An unresolved reviewer ambiguity remains blocked for the authorized owner; it cannot become a repair or acceptance, while unrelated dependency-ready work may advance.
11. A review-passed, commit-pending task confirms criteria and gates, commits, and becomes accepted without redispatching either review; an accepted task is never redispatched.
12. Once every task is accepted, each declared pending integration gate is selected before plan completion. A current passed gate is retained; a blocked gate stops or follows its approved route, and changed accepted work needs explicit authority for another gate review.

`/deliver-plan` next-action regression traces (the numbered command branch is the action that must be
selected, not an aspirational policy statement):

| Case | Recovery / plan input | Selected command branch and next action |
| --- | --- | --- |
| 1. Pending, no implementation | Ready task is `pending`; dependencies accepted; no recovered action | Step 3 marks it `in-progress` and dispatches its one `implementation`. |
| 2. In progress, validation awaited | Implementation completed on revision R; validation `pending` | Step 2 selects validation; step 5 obtains evidence and dispatches no review. |
| 3. Functional pass, architecture pending | Validation and functional `pass` on R; required architecture review `pending` | Step 2 selects only `architecture_review(R)`; steps 5–6 do not redispatch functional review. |
| 4. Both passes, commit pending | Validation, functional, and required architecture `pass` on R; criteria/gates met; commit pending | Step 2 selects commit/accept; step 5 commits and marks accepted without either review. |
| 5. Review failure with capacity | Current functional or architecture verdict is `changes_required`; repair count below 2 (or named finite extension available) | Step 2 selects the bounded `repair`; step 6 carries findings/tally, then the changed revision follows validation and fresh touched review. |
| 6. Exhausted review failure | `changes_required`; two regular repairs used and no applicable finite authorization | Step 2 selects the consolidated exhaustion stop; steps 5–6 dispatch neither repair nor review. |
| 7. Accepted task | Committed task is `accepted`, with current recorded gates | Step 2 selects nothing for it; steps 3–4 never redispatch implementation or review. |
| 8. In-progress later work, earlier gate pending | An earlier declared phase integration is `pending`; a later in-progress task has an eligible recovery action | Step 2 continues that recovery action; the pending gate remains pending. |
| 9. Earlier gate pending, later task ready | Every task in an earlier declared phase accepted; its integration is `pending`; a later task is dependency-ready `pending` | Step 3 dispatches the later task's implementation; the pending gate remains pending. |
| 10. All tasks accepted, integration pending | Every required task is accepted; a declared phase integration is `pending` | Step 4 dispatches the one `integration_review` before plan completion. |
| 11. Integration passed, plan completion | Every required task is accepted; every declared integration gate `pass`es on unchanged accepted revisions | Step 4 retains each pass, then step 8 runs plan acceptance checks. |
| 12. Integration blocked | All tasks accepted; declared integration verdict `blocked` with evidenced external blocker | Step 4 selects its named owner decision or permitted external deferral; it neither accepts the phase nor dispatches another integration review. |
| 13. Missing or contradictory checkpoint | Recovered R has absent validation, unexplained revision mismatch, or incompatible pass/fail records | Step 2 fails closed to the owner; no step 3–6 dispatch or external deferral occurs. |
| 14. Known changed revision invalidates verdicts | Validation/reviews passed on R, but authorized task-owned work with consistent history produced R2 in their touched scope | Step 2 selects validation for R2, then only the required fresh touched reviews; it cannot commit from R's passes. |

These traces retain the earlier recovery cases: incomplete authorized implementation resumes rather than
restarts; failed/missing validation prevents review; normal and finite-authorized exhaustion preserve the
tally; owned-worktree evidence is required; reviewer ambiguity stops; and only an evidenced external
blocker may be deferred while independent ready work advances.

### Repair handoff and review

For each repair, `delivery` carries a compact within-run handoff: current and prior finding IDs,
their cross-round dispositions and relevant decisions, the affected contract or validation boundary,
the implementation/repair tally, and the review target that produced the findings. The implementer
reports the finding-by-finding disposition and evidence. For parsing, validation, authentication, or
an analogous trust-sensitive boundary, it also reports a bounded audit of adjacent failure modes,
adversarial regression coverage (or why it was omitted), and whether evidence shows an incorrect
test expectation rather than a code defect.

Before dispatching independent review, `delivery` confirms every required agent-owned validation ran
and has evidence. A failed validation or missing evidence stops dispatch and is reported as a blocked
result; human-owned validation is reported only. Every repair receives a functional review of its new
revision. Reconcile each finding across rounds: a valid `new` correctness or security defect remains
actionable even if a prior review passed; `persisting`, `regression`, and `changed_expectation` each
receive an evidence-backed disposition rather than being merged into an old pass.

Budget, per task or direct-path change, for the whole run:

- `implementation`: **1** dispatch, plus up to **2** `repair` dispatches. The second repair failing
  review is the end of the line: 3 dispatches total, then escalation.
- Re-reviews after a repair do not reset the count. A task that re-enters the loop keeps its tally.
- `integration_review`: **1** per phase gate.
- `architecture_review`: **1** per boundary category per revision.

Budgets live with the run (the conversation), not in a file, and they do not reset when the same
task re-enters the loop. A recovery handoff carries known used counts. If counts are missing, stop for
the owner; a new run is not authorization to repeat an exhausted repair budget.

At exhaustion, stop with one consolidated diagnosis for the affected boundary: classify each blocker
as an implementation defect, external dependency, architectural conflict, or contract ambiguity;
state evidence, affected scope, complexity, attempts used, and one recommended owner or decision.
Consolidate repeated requests for the same boundary and preserve the original tally. Only an explicit
user authorization may extend a small local implementation defect, and it must name the task, bounded
scope, and finite extra dispatch count. It does not authorize another architecture or integration
review beyond its separate budget. An external blocker may be deferred only when plan dependencies and
approved gates leave other work ready; it never accepts the blocked task. Material scope or
architectural conflicts return to the owner for plan or ADR approval.

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
