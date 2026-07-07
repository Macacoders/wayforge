# ADR-0020: Split planner into planner + delivery primary agents

## Status
Accepted

## Date
2026-07-07

## Context

ADR-0001 established a single primary `planner` agent plus specialized subagents. Since then,
`planner.md` grew to 171 lines and loaded context for planning, delivery pipeline, phase review,
quick delivery review, memory, shared task (issue) management, and audit for every workflow.

The single-gate design meant every conversation — whether planning a new feature or reviewing a
completed phase — loaded all 171 lines of rules, including sections irrelevant to the task at hand.
Agents that only needed implementation-pipeline context (phase handoff, review, close) still
carried planning-output, discovery, memory, and shared-task rules.

## Decision

Split the single `planner` primary agent into two independent primary entry gates:

- **`planner`** — discovery, phased plan creation, phase economy classification, quick delivery
  classification, research onboarding delegation, memory duties (freshness checks, plans, ADRs,
  logs), shared task (issue) workflow, and task analysis
- **`delivery`** — implementation pipeline: phase handoff to `code`, quick delivery handoff to
  `quickcode`, git-based phase review, quick delivery review, close workflow, and handoff brief
  preparation from persisted plans

Both are independent primary agents. A conversation entered via `/plan` never loads `delivery`'s
context, and vice-versa. Transitions are user-driven via command routing.

Planner writes approved plans to `docs/ai/plans/`. Delivery reads them from disk and prepares
implementation handoff briefs from the persisted plan.

Five pipeline commands reroute to `delivery`: `/implement-phase`, `/review-phase`, `/quick`,
`/close`, `/ponytail-review`. Nine planning/support commands stay on `planner`.

## Consequences

- Planner dropped from 171 to 121 lines; delivery loads 82 lines of context.
- Each gate carries only the rules its workflow needs.
- `delivery` has its own permissions block and config-fragment entries in all five provider
  profiles.
- `base/AGENTS.md` and root `AGENTS.md` now reference both `planner` and `delivery` as the two
  primary entry gates.
- Supersedes ADR-0001's "one primary `planner` agent" wording.

## Related

- Issue #160: Split planner primary agent into planner + delivery gates
- ADR-0021: Centralize duplicated invariants into shared reference
- ADR-0012: Deduplicate workflow rules to planner (predecessor; now extended by ADR-0021)
