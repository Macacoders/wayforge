---
description: Execute an approved plan autonomously - dispatch, verify criteria, commit, and stop only on completion, a blocker, or a decision only the user can make.
agent: delivery
---

Load the `delivery-policy` skill and the approved plan named below (`$ARGUMENTS`, resolved under
`docs/ai/plans/`; when empty, use the active plan).

Report plan status, declared gates, task states, and ready tasks once. Continue through routine transitions without prompting.

Repeat until plan acceptance or a stop condition:

1. Apply the policy's readiness and legacy-plan rules. Recover every `in-progress` task before a fresh dispatch; retain its tally, revisions, worktree changes, and completed gates. Stop on missing or contradictory recovery evidence. An externally blocked task may be deferred if independent ready work exists.
2. Resume the next authorized action; otherwise select a dependency-ready `pending` task, mark it `in-progress`, and dispatch `implementation` to `code` with its criteria and evidence (work-order shape: `/implement-task`). Never reimplement a resumed task from scratch.
3. Confirm agent-owned validations, then obtain the pending `functional_review` and any declared `architecture_review` on the current revision. Report human-owned validations; do not execute them. Apply policy verdicts: bounded `repair` and fresh review on `changes_required`; seek evidence/decision on `blocked`; stop on unchanged failing evidence or exhausted budget.
4. Run each declared pending phase `integration_review` after its tasks are accepted, retaining passes on unchanged revisions. Apply the policy's bounded resolution to failed gates. After plan acceptance, set `status: completed` and summarize accepted tasks, commits, validations, and follow-ups.

Never implement or self-verify. Commit only on current passing evidence; stop with the policy's specific escalation question when required.

Additional context:

$ARGUMENTS
