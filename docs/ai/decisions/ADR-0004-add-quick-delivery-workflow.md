# ADR-0004: Add Quick Delivery Workflow

Date: 2026-05-06
Status: Accepted

## Context

Staged delivery is intentionally conservative: it plans work in phases, uses `code` for one phase, and pauses after each atomic stage for manual validation. That control is useful for risky or ambiguous work, but it adds overhead for clear, small, low-risk changes.

## Decision

Add an opt-in quick-delivery workflow started with `/quick`.

`planner` remains the user-facing orchestrator. It classifies eligibility, writes a compact `Quick Code Handoff Brief`, invokes one `quickcode` subagent, then reviews the result with git evidence before responding.

`quickcode` implements one approved quick task without staged pauses. It may edit autonomously within the approved scope and may run allowlisted validation/git inspection commands. It must not invoke subagents.

Staged delivery remains the default conservative workflow and is required whenever quick-delivery eligibility is not clear.

## Constraints And Safety Boundaries

- Quick delivery is only for clear, small, low-risk tasks with obvious acceptance criteria.
- Escalate to staged delivery for ambiguous scope, architecture decisions, broad refactors, migrations, dependency installation, deployments, releases, secret handling, or meaningful security, data, operational, or regression risk.
- `quickcode` uses Option A permissions: autonomous edits, allowlisted validation/git inspection commands, and no subagents.
- `quickcode` must not commit, amend, push, rebase, reset, clean, checkout, switch branches, install dependencies, edit secrets, or broaden scope.
- `planner` must review every quick-delivery result with git status/diff/log evidence.

## Consequences

- Small safe tasks can complete with less interaction while preserving planner review.
- The workflow now has two paths, so documentation and handoffs must clearly distinguish `/plan` from `/quick`.
- Some tasks initially requested as quick delivery will be redirected to staged delivery.
- Safety depends on conservative eligibility classification and strict quickcode scope control.

## Alternatives Considered

- Use staged delivery for every task: rejected because manual checkpoints after every atomic stage are unnecessary for many trivial low-risk changes.
- Let `planner` make quick edits directly: rejected because implementation context should remain separated from orchestration and review.
- Give quick delivery broader shell or subagent permissions: rejected because quick tasks should stay narrow, local, and easy to review.
