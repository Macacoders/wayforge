# ADR-0043: Workflow Terminology — Task, Step, and `task:` Frontmatter Field

**Date**: 2026-09-16
**Status**: Accepted — amended by ADR-0048: plans now also carry per-task `**Status:**` and
`**Depends on:**` as the authoritative readiness state, with `task:` retained as a summary cursor.
The task/step vocabulary is unchanged.

## Context

Issue #47 migrated planning and delivery from phases to tasks. ADR-0038 renamed delivery to a task orchestrator, and the `code` agent handoff brief now describes each work item as a task with atomic steps. Despite that shift, the canonical vocabulary and the plan frontmatter field remained inconsistent:

- Plans still expose a `phase:` frontmatter field per ADR-0026, even though the workflow no longer uses phases.
- "Stage" is overloaded: it refers to git staging in some places and to workflow sub-units in others (for example, the former "Stage Loop" in `code.md`).
- "Phase" lingers in documentation and briefs, causing brief authors to write "phase goal" and "atomic stages" instead of the current "task goal" and "atomic steps".

We need a single, canonical vocabulary so that agents, skills, plans, and handoff briefs use the same terms.

## Decision

1. The unit of work in a plan is a **task**; its sub-units are **steps** (atomic steps). A plan contains one or more tasks; a task contains one or more steps.
2. The plan frontmatter progress field is renamed from `phase:` (ADR-0026) to **`task:`** and is written as `task: <n>/<total>`.
3. The terms "phase" and "stage" are retired from the workflow vocabulary:
   - "phase" is no longer used for plan progress or workflow periods.
   - "stage" is reserved for git staging only (for example, "stage files for commit"); it is no longer used for workflow sub-units.
4. `delivery` updates `task:` at task boundaries, `memory-maintenance` uses `task:` for staleness detection, and plan/skills briefs use "task goal" / "atomic steps".

## Consequences

- ADR-0026 is amended: its YAML frontmatter now uses `task:` instead of `phase:`; all other rules (`status`, `created`, `required_gates`) remain unchanged.
- Existing in-progress plans are migrated to the `task:` field as they are next touched; completed/superseded historical plans are left as-is.
- `code.md` and future handoff briefs use the Step Loop and atomic steps, removing the previous "Stage Loop" terminology.
- Skills and plugins that reference plan progress should read `task:` and avoid "phase" / "stage" in the workflow sense.

## Related

- Amends ADR-0026 (plan frontmatter format).
- Follows ADR-0038 (task-based delivery orchestrator).
- Plan: `docs/ai/plans/2026-09-16-consolidate-task-step-terminology.md`
