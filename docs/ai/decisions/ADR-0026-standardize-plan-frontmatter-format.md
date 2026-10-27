# ADR-0026: Standardize Plan Frontmatter as YAML Format

Date: 2026-07-07
Status: Accepted — amended by ADR-0043 (`phase:` → `task:`) and ADR-0048 (per-task
`**Status:**` and `**Depends on:**` become the readiness source; `task:` survives as a compatibility
cursor; `required_gates` is optional and only declared gates are checked).

## Context

Plan persistence in `docs/ai/plans/` is informal — every plan file has an ad-hoc `**Status**` line with no stable format, no phase-tracking convention, and no mechanism for plans to declare which delivery gates they require. This makes it impossible for `delivery` to know *which* gates a plan actually needs, leading to either rubber-stamp ceremony on trivial changes or skipped gates on complex ones.

We need a stable, machine-readable format for plan-on-disk state that both primary agents (`planner`, `delivery`) can update at phase boundaries, and that `memory-maintenance` can use for staleness detection.

## Decision

Standardize plan-on-disk format as YAML frontmatter at the top of each plan file under `docs/ai/plans/`:

```yaml
---
status: planned | in-progress | completed | superseded
created: YYYY-MM-DD
phase: <n>/<total>
required_gates:
  test_verdict: true | false
  architect_review: true | false
  memory_update: true | false
---
```

Key rules:

- Planner writes the frontmatter when an approved plan is persisted.
- Planner updates `phase:` after each phase boundary is approved.
- Delivery bumps `phase:` and sets `status: completed` at phase boundaries during review.
- Delivery checks only the `required_gates` the plan declares — not universal mandatory verdicts.
- `memory-maintenance` treats `status: in-progress` with no recent `phase:` bump as a stale signal.
- `required_gates` is optional and set at plan-approval time based on the plan's scope.
- No plugin code or runtime state is introduced — the format is filesystem-only (YAGNI-safe for a future plugin).

## Consequences

- Plan status is stable and cross-gate readable without ad-hoc conventions.
- Delivery can determine which gates a plan needs without universal mandatory checks.
- Staleness detection becomes possible via the `phase:` field.
- The three arch-drift plans (P1, P2, P3) are backfilled as the first adopters; historical plans are left as-is.
- ADR-0006 (opt-in test writing) is preserved — `required_gates.test_verdict` is per-plan, not universal.

## Alternatives Considered

- Keep ad-hoc `**Status:**` lines: rejected because inconsistent format prevents gate automation and staleness detection.
- Plugin-backed state (database, JSON): rejected as over-engineering for the current need; the YAML frontmatter is filesystem-only and a future plugin can optionally consume it.
- Universal mandatory gates for every phase: rejected by reviewer feedback — replaced with per-plan `required_gates`.
