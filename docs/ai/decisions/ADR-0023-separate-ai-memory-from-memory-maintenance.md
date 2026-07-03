# ADR-0023: Separate ai-memory Skill from memory-maintenance Skill

**Date:** 2026-07-02
**Status:** Accepted

## Context

The repository has two related but distinct needs for AI memory management:

1. **Routing and freshness judgment** — deciding which memory files to load, checking plan/ADR/log freshness, proposing what to persist. This requires agent judgment and is owned by `planner`.

2. **Deterministic bookkeeping** — listing plans with status signals, listing ADRs, running a closeout checklist, scaffolding missing `docs/ai/` directories. These are low-risk, repeatable operations that any agent can run without planner judgment.

The `memory-maintenance` skill was created for the first need (routing/freshness). Issue #39 proposes a scriptable helper for the second need.

## Decision

Create a separate `ai-memory` skill for deterministic script operations. Keep `memory-maintenance` for routing and freshness judgment guidance.

The two skills are complementary:
- `memory-maintenance` → `SKILL.md` with guidance (loaded via `/memory` command or `skill` tool)
- `ai-memory` → `SKILL.md` + TypeScript script for deterministic operations (invoked via `skill` tool + `npx tsx`)

Agents should use `ai-memory` for checklist evidence and `memory-maintenance` for routing/freshness judgment. Both preserve progressive disclosure.

## Consequences

- Two skills instead of one, but each has a clear, non-overlapping purpose
- Agents need to know which skill to load for which situation — handled by SKILL.md descriptions and command guidance
- No change to `memory-maintenance` SKILL.md content
- Future deterministic operations should go in `ai-memory`; future guidance/routing changes go in `memory-maintenance`

## Alternatives Considered

- **Single combined skill**: Rejected because mixing judgment guidance with deterministic scripts creates a larger, less focused skill surface. Agents would need to understand which parts apply to their situation.
- **No new skill — just add scripts to memory-maintenance**: Rejected because `memory-maintenance` SKILL.md is guidance-focused; adding a script directory would blur its purpose.
