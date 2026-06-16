# Plan: Deduplicate workflow rules and move research guidance (Issue #75)

## Goal

Replace duplicated workflow-rule sections in `base/AGENTS.md` (template) and root `AGENTS.md` with a short indirection pointing to `planner.md`. Move `research.md` AGENTS.md Guidance to a reference file.

## Source

Issue #75 + finding C from `docs/ai/prompt-audit-2026-06-16.md`

## Status

Completed 2026-06-16

## Phases

### Phase 1: Deduplicate and move (complete)

**Scope:**
- Replace lines 29–91 in `base/AGENTS.md` with planner indirection
- Apply same change to root `AGENTS.md` lines 62–122
- Move `research.md` AGENTS.md Guidance to `base/opencode/agents/research/references/agents-guidance.md`
- Verify with onboard-repo dry-run simulation

**Result:**
- `base/AGENTS.md`: 31 lines (from 91)
- `AGENTS.md`: 64 lines (from 122)
- `research.md`: 95 lines (from 107)
- Repository Boundary duplication across 6 agent files preserved
- See ADR-0012 for the deduplication decision
