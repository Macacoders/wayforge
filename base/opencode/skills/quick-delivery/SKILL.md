---
name: quick-delivery
description: Classify, hand off, implement, and review small low-risk tasks without staged pauses.
compatibility: opencode
metadata:
  workflow: quick-delivery
  agents: planner-quickcode
---

# Quick Delivery

Use this skill for opt-in small, low-risk tasks where the user wants faster implementation with less supervision than staged delivery.

## Eligibility

A request is eligible for quick delivery only when all of these are true:

- The user invoked `/quick`, explicitly requested quick delivery, or explicitly confirmed a proactive quick-delivery suggestion from `planner`.
- The task has a clear, narrow outcome and obvious acceptance criteria.
- The change is expected to touch a small number of files.
- The risk of regression, data loss, security impact, or operational impact is low.
- The work does not require architectural decisions, broad refactors, migrations, dependency installation, deployments, releases, or secret handling.
- Reasonable validation can be done with safe git inspection and common local validation commands.

If any condition is not met, use the staged-delivery workflow instead.

## Repository Boundary

- Treat the active repository root as the default boundary for searches, reads, edits, and commands.
- Do not cross outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in quick handoffs so `quickcode` inherits the boundary.

## Workflow Steps

1. `planner` classifies the request for quick-delivery eligibility.
2. If the user did not invoke `/quick` or explicitly request quick delivery, `planner` may proactively suggest quick delivery only when eligibility is unambiguous.
3. For proactive suggestions, `planner` explains eligibility and expected scope, then waits for explicit user confirmation.
4. If eligible and confirmed, `planner` writes a compact `Quick Code Handoff Brief` with scope, files, references, acceptance criteria, validation expectations, and escalation conditions.
5. `planner` invokes one `quickcode` subagent session.
6. `quickcode` completes all approved quick-task steps without stopping between atomic steps.
7. `quickcode` reports once with files changed, behavior/config/docs changed, validation run, validation not run, risks, and suggested review commands.
8. `planner` reviews the result using git status/diff/log evidence before reporting to the user.

## Handoff Contract

Use this structure for quick implementation handoffs:

```md
## Quick Code Handoff Brief

Task:
Goal:
Repository root:
Acceptance criteria:
Approved scope:
Expected files:
References to load:
Validation expectations:
Escalation conditions:
Constraints:
```

Keep handoffs concise. Include only the references needed for the quick task. Do not include unrelated staged-delivery plans or broad repository context.

## Quickcode Constraints

`quickcode` may edit files autonomously within the approved scope and may run allowlisted validation/git inspection commands. It must not:

- Invoke other subagents.
- Commit, amend, push, rebase, reset, clean, checkout, switch branches, or run destructive git operations.
- Install dependencies or run package-manager install commands.
- Modify secrets, credentials, tokens, `.env` files, or generated secret material.
- Broaden scope beyond the handoff brief.

## Escalation Conditions

Escalate back to staged delivery when the task reveals:

- Ambiguous or conflicting acceptance criteria.
- Higher-than-expected regression, security, data, operational, or release risk.
- Need for dependency installation, migrations, deployment/release changes, or secret handling.
- Broad cross-cutting edits, architecture decisions, or multi-phase sequencing.
- Validation that requires unsafe commands or unavailable external services.
- A worktree state that makes safe isolated edits unclear.

## Review Expectations

`planner` reviews every quick-delivery result before final user response:

- Run safe git inspection, at minimum `git status` and relevant `git diff`.
- Compare the diff against the handoff scope and acceptance criteria.
- Verify `quickcode` did not commit, push, invoke other subagents, install dependencies, edit secrets, or broaden scope.
- Check validation output or clearly state what validation was not run.
- If the result is too broad or risky, stop and recommend staged-delivery follow-up instead of continuing quick delivery.
