---
description: Execute an approved plan autonomously - dispatch, verify criteria, commit, and stop only on completion, a blocker, or a decision only the user can make.
agent: delivery
---

Load the `delivery-policy` skill and the approved plan named below (`$ARGUMENTS`, resolved under
`docs/ai/plans/`; when empty, use the active plan).

Report the loop once at the start: plan status, required gates, task states, and the tasks that are
ready. Then stay quiet between successful transitions and keep working.

Repeat until plan acceptance or a stop condition:

1. Read the plan frontmatter and each task's `**Status:**` line. Task `**Depends on:**` fields decide
   readiness — not markdown order, not a single cursor. For a plan written before ADR-0048 (no
   per-task status or dependencies), apply the legacy-plan rules in `delivery-policy` and backfill the
   fields as you dispatch; legacy plans are executable, not a special case for the user to migrate.

2. Before any dispatch, apply the policy's paused-task recovery inventory and next-action table to
   every `in-progress` task:
   status, preserved implementation/repair tally, validation and revision-specific review outcomes,
   pending repair/review/clarification/authorization, and ownership of uncommitted changes. Resume
   only the next authorized action for complete, consistent evidence. Missing, contradictory, blocked,
   or ambiguous recovery evidence fails closed to the owner; do not reset, rewrite to `pending`,
   discard changes, or issue a fresh implementation dispatch. Defer an externally blocked task only
   when another dependency-ready pending task can proceed.

3. If recovery selected no in-progress action or stop, pick the next `pending` task whose
   dependencies are all `accepted`; mark it `in-progress` and dispatch its one `implementation` work
   order to `code`, including the task's acceptance criteria and the evidence each criterion requires
   (see `/implement-task` for the work-order shape). Never use this fresh route for a re-entered
   in-progress task.

4. If neither recovery nor an eligible fresh task selected an action, route every declared phase
   `integration_review` whose phase tasks are all `accepted` and whose current gate is pending before
   plan completion. A current passed gate is not repeated. A `changes_required` or `blocked` gate needs
   its approved policy route or a stop; do not dispatch another integration review over its budget or
   silently mark the gate passed. A focused task compatibility check does not accept a phase or replace
   its gate.

5. Execute only the selected action from the policy table: obtain validation evidence before review;
   dispatch only the required pending functional or architecture review against the current revision;
   commit and accept only after current validation, criteria, and required review gates pass. Never run
   human-owned validations; report them instead.

6. Apply the reconciled review outcome under `delivery-policy`: `changes_required` → one bounded
   `repair` work order with current/prior finding IDs, dispositions, prior decisions, affected boundary,
   and tally, then fresh review of the repair's new revision. Reconcile new, persisting, regression,
   and changed-expectation findings independently; an earlier pass does not suppress a demonstrated new
   defect. `blocked`, unresolved conflict, validation failure, or exhausted budget → stop with the
   policy's consolidated diagnosis. Do not treat clarification as a repair or extra-review authorization.

7. At the end, run plan acceptance checks (all required tasks accepted, plan acceptance criteria,
   declared gates, human-owned validations reported), set `status: completed`, and report a plan-level
   summary: accepted tasks, commits, validations, findings resolved, and anything deliberately left
   open.

Never implement product code, never substitute your own reading of a diff for verification, and never
ask the user to confirm a successful routine transition. Stop only on the policy's stop conditions,
asking the specific escalation question.

Additional context:

$ARGUMENTS