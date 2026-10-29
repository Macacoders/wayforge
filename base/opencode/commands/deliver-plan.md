---
description: Execute an approved plan autonomously - dispatch, verify, repair, integrate, and stop only on completion, a blocker, or a decision only the user can make.
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
2. Pick the next `pending` task whose dependencies are all `accepted`; mark it `in-progress`.
3. Dispatch one `implementation` work order to `code` (see `/implement-task` for the work-order shape).
4. Confirm the agent-owned validations ran. Never run human-owned validations; report them instead.
5. Dispatch a `functional_review` work order to `reviewer` against the resulting revision (see
   `/review-task`). Dispatch `architecture_review` to `architect` when the task touches a boundary
   category or the plan's `required_gates.architect_review` is true.
6. Apply the reconciled review outcome under `delivery-policy`: accept only current compatible
   functional and required architecture evidence; `changes_required` → one bounded `repair` work
   order with the findings, then review the new revision; `blocked`, unresolved conflict, or exhausted
   budget → escalate and stop. Do not treat clarification as a repair or extra-review authorization.
7. Run `integration_review` after a phase whose integration gate the plan declares.
8. At the end, run plan acceptance checks (all required tasks accepted, plan acceptance criteria,
   declared gates, human-owned validations reported), set `status: completed`, and report a plan-level
   summary: accepted tasks, commits, validations, findings resolved, and anything deliberately left
   open.

Never implement product code, never substitute your own reading of a diff for independent
verification, and never ask the user to confirm a successful routine transition. Stop only on the
policy's stop conditions, asking the specific escalation question.

Additional context:

$ARGUMENTS
