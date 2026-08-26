# ADR-0004: Add Quick Delivery Workflow

Date: 2026-05-06
Status: Accepted

## Context

Staged delivery is intentionally conservative: it plans work in phases, uses `code` for one phase, and pauses after each atomic stage for manual validation. That control is useful for risky or ambiguous work, but it adds overhead for clear, small, low-risk changes.

## Decision

Add an opt-in quick-delivery workflow started with `/quick`.

`planner` remains the user-facing orchestrator. It classifies eligibility, writes a compact `Quick Code Handoff Brief`, invokes one `quickcode` subagent, then reviews the result with git evidence before responding.

`quickcode` implements one approved quick task without staged pauses. It may edit autonomously within the approved scope and may run `bash` commands gated by the coarse allow + deny-list permission model (ADR-0036). It must not invoke subagents.

Staged delivery remains the default conservative workflow and is required whenever quick-delivery eligibility is not clear.

## Constraints And Safety Boundaries

- Quick delivery is only for clear, small, low-risk tasks with obvious acceptance criteria.
- Escalate to staged delivery for ambiguous scope, architecture decisions, broad refactors, migrations, dependency installation, deployments, releases, secret handling, or meaningful security, data, operational, or regression risk.
- `quickcode` uses Option A permissions: autonomous edits, `bash: allow` with a short deny-list (ADR-0036), and no subagents.
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

---

## Revised

Date: 2026-06-02
Status: Accepted (Revised)

### Context For Revision

Experience with quick delivery showed that users sometimes have clearly quick-eligible tasks but do not know to invoke `/quick`. Requiring explicit opt-in added friction in those cases. The safety boundaries and classification criteria are working well, so the change is to the *initiation path* rather than to the execution model.

### Decision Change

Add an additional initiation path: `planner` may **proactively suggest** quick delivery for clearly eligible tasks, but must ask for explicit user confirmation before executing. The `/quick` opt-in path remains unchanged.

This means quick delivery can be started in two ways:

- **Opt-in (unchanged):** User invokes `/quick` or explicitly asks for quick delivery.
- **Proactive suggestion (new):** `planner` identifies a clearly eligible task during conversation and proposes quick delivery; the user must confirm before `planner` proceeds with a Quick Code Handoff Brief and `quickcode` invocation.

The safety classification criteria, quickcode permissions, escalation rules, and planner review requirements from the original decision are unchanged.

### Rationale For Change

- Users with quick-eligible tasks do not always know the `/quick` command exists.
- Proactive suggestion preserves user control (confirmation required) while reducing the need for users to remember workflow syntax.
- The existing classification and escalation guardrails already prevent inappropriate use.
- No changes to `quickcode` permissions, scope rules, or review requirements are needed.
