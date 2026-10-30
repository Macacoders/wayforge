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
2. Pick the next `pending` task whose dependencies are all `accepted`; mark it `in-progress`.
3. Dispatch one `implementation` work order to `code` with the task's criteria and the evidence each
   one requires (see `/implement-task` for the work-order shape).
4. Confirm the agent-owned validations ran. Never run human-owned validations; report them instead.
5. Dispatch a `verification` work order to `reviewer` against the resulting revision, with the same
   criteria (see `/review-task`). Dispatch `architecture_review` to `architect` only when the plan's
   `required_gates.architect_review` is true.
6. Apply the result: every criterion passes → commit, mark the task `accepted`, update the frontmatter
   `task:` cursor. A criterion fails → dispatch the same criteria back with the evidence. A criterion
   that fails twice, a round with no change in evidence, or a criterion that cannot be satisfied
   inside the approved scope → escalate with the policy's evidence and stop.
7. When a phase declares an integration gate, verify the criteria the plan declares for that gate,
   once, after the phase's tasks are accepted.
8. At the end, run plan acceptance (every required task accepted, declared gates evidenced,
   human-owned validations reported), record follow-ups, set `status: completed`, and report a
   plan-level summary: accepted tasks, commits, criteria evidenced, follow-ups recorded, anything
   deliberately left open.

Never implement product code, never substitute your own reading of a diff for verification, and never
ask the user to confirm a successful routine transition. Stop only on the policy's stop conditions,
asking the specific escalation question.

Additional context:

$ARGUMENTS
