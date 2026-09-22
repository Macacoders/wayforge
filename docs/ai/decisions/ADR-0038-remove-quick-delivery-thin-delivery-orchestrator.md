# ADR-0038: Remove Quick Delivery and Refactor Delivery into a Task Orchestrator

**Date**: 2026-09-11
**Status**: Accepted

## Context

ADR-0004 added a second delivery path (`/quick` → `quickcode`) alongside staged delivery, and the `delivery` agent body accumulated the whole pipeline inline (phase handoff, quick delivery, review, close). Issue #47 rewired the workflow around the `intent` and `plan` skills with task-based plans, which made quick delivery redundant: a "quick" task is now just a single-task plan handed to `code` through the normal loop.

## Decision

1. **Remove quick delivery**: delete the `quick` command, the `quickcode` agent, the `quick-delivery` skill, and the quick-code handoff template. Small work is planned as a single task; scope classification becomes `single-task | multi-task | too-large`.
2. **Remove the `staged-delivery` skill**: its phase-economy and progressive-disclosure guidance is folded into the `plan` skill, using tasks rather than phases.
3. **Thin the `delivery` agent** into an orchestrator entrypoint that delegates to three commands: `/load-plan` (load the plan and identify the current task), `/implement-task` (hand the task to `code`), and `/review-task` (validate and, if insufficient, clarify/redirect then re-handoff before closing).
4. **Remove the `close` command**: memory close-out is handled by `/memory update`.

## Supersedes

- ADR-0004 (quick delivery workflow).

## Consequences

- A single delivery path exists; `quickcode` is gone and no permission/config block references it.
- `delivery` no longer owns memory or close-out — those stay with `planner` via `/memory`.
- Handoff briefs are copy-pasted from the plan's task description (Objective, Files, Steps) rather than re-derived.
- The `triage` skill's recommendation narrows from `/quick | /plan | backlog` to `/plan | backlog`.
