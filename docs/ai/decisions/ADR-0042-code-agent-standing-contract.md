# ADR-0042: Code Agent File Holds Only Its Standing Operating Contract

**Date**: 2026-09-16
**Status**: Accepted — amended by ADR-0048: `code.md` keeps the standing-contract shape, but
the Step Loop, the manual per-step validation pauses, and the "wait for explicit approval" contract
are removed in favour of one dispatched work order (`implementation` or `repair`) returning the
shared result format. Per-task specifics still come from the dispatch, not from `code.md`.

## Context

`base/opencode/agents/code.md` had accumulated content that is supplied elsewhere at runtime:

- The ponytail reuse-first ladder is injected into the system prompt by the ponytail plugin (`experimental.chat.system.transform`) whenever mode ≠ `off`.
- Per-task specifics (task goal, acceptance criteria, atomic steps, relevant files, confirmed decisions, constraints, and reuse expectations) are supplied by the `/implement-task` handoff brief from `delivery`.
- A `## Mission` section restated the one-line role and the Step Loop.
- Two separate scope bullets and a task-completion documentation bullet duplicated rules already present in the Operating Rules.

ADR-0012 established that workflow rules should live with the agent that enforces them, and ADR-0038 thinned `delivery` into a task orchestrator that hands each task to `code` with a complete brief. Continuing that direction, `code.md` should not duplicate brief/plugin content.

## Decision

1. `base/opencode/agents/code.md` contains only its **standing operating contract**: frontmatter, one-line role, Operating Rules (brief-first, reference loading, scope, preserve worktree, no commits, documentation update rules, and `docs/ai/**` authorization), the Step Loop, the checkpoint format (including `Reuse check outcome`), and the "wait for explicit approval" contract.

2. Per-task specifics and the reuse-first ladder are intentionally omitted from `code.md`; they are supplied by the `/implement-task` brief and the ponytail plugin respectively.

3. No installer change is required because the file path is unchanged.

## Consequences

- `code.md` is smaller and no longer drifts when the plugin or handoff brief evolve.
- Future edits to `code.md` should keep only standing-contract material; anything task-specific belongs in the plan task or the relevant skill/plugin.
- The `code` agent remains responsible for stepwise execution, manual validation pauses, and the checkpoint format.

## Related

- Complements ADR-0012 (deduplicate workflow rules to planner) and ADR-0038 (thin delivery into task orchestrator).
- Plan: `docs/ai/plans/2026-09-16-slim-code-agent.md`
