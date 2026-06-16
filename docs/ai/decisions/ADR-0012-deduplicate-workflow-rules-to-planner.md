# ADR-0012: Deduplicate workflow rules in AGENTS.md into planner.md

## Status
Accepted

## Date
2026-06-16

## Context

Both `base/AGENTS.md` (the template) and the root `AGENTS.md` contained ~63 lines of near-identical copies of rules already present in `base/opencode/agents/planner.md`:

- `## Workflow` (13 items, ~15 lines)
- `## Progressive Disclosure` (7 bullets, ~9 lines)
- `## Repository Boundary` (4 bullets, ~6 lines)
- `## Engineering Rules` (8 bullets, ~10 lines)
- `## Validation Rules` (9 bullets, ~11 lines)
- `## Definition Of Done` (5 bullets, ~7 lines)

The `planner` agent is the runtime enforcer of all these rules — it orchestrates all work, creates handoff briefs with relevant rules injected, and reviews completed phases. The AGENTS.md duplication was token waste and a maintenance hazard (changes had to be synced across files).

The Repository Boundary section is an exception: all 6 agent files (planner, code, quickcode, research, test, taskanalyst) each carry their own 4–7 line version. This duplication is accepted because Repository Boundary is a critical safety invariant that every agent must enforce independently, without depending on planner orchestration.

## Decision

Replace the 6 duplicated sections in `base/AGENTS.md` and root `AGENTS.md` with a compact indirection pointing to the installed `planner` agent as the single source of truth for all workflow, progressive disclosure, repository boundary, engineering, validation, and definition-of-done rules.

The indirection text:

> The `planner` agent is the single source of truth for workflow rules, progressive disclosure, repository boundary, engineering rules, validation rules, and definition of done. These are runtime invariants enforced by planner at plan, handoff, and review time. Agent files carry their own Repository Boundary section for safety. See the installed planner agent for the canonical ruleset.

## Rationale

- **Single source of truth**: Planner already enforces these rules; no other agent needs them inline.
- **Token reduction**: `base/AGENTS.md` dropped from 91 to 31 lines (~600 tokens).
- **Maintenance safety**: Rule changes only need to be made in `planner.md`.
- **Safety preserved**: Individual agent files retain their own Repository Boundary sections.

## Consequences

- `base/AGENTS.md` and root `AGENTS.md` no longer contain inline workflow rules.
- Generated AGENTS.md (via `onboard-repo`) will carry the indirection instead of duplicated rules.
- Other agents (`code`, `quickcode`, `test`, `research`, `taskanalyst`) rely on planner's handoff briefs for workflow rules; their own agent files still carry Repository Boundary.
- The `research.md` AGENTS.md Guidance procedure was moved to a reference file (`base/opencode/agents/research/references/agents-guidance.md`), reducing `research.md` from 107 to 95 lines.

## Related

- Issue #75: refactor deduplication
- Documented Repository Boundary duplication as accepted design (safety invariant)
- Finding C from `docs/ai/prompt-audit-2026-06-16.md`
