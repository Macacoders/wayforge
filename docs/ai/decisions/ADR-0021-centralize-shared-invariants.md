# ADR-0021: Centralize shared invariants into one reference file

## Status
Accepted

## Date
2026-07-07

## Context

ADR-0012 deduplicated workflow rules from `AGENTS.md` into `planner.md` but accepted Repository
Boundary duplication across all 6 agent files as a "critical safety invariant each agent must
enforce independently." Three additional text blocks were also duplicated verbatim across agent
files:

- **Progressive Disclosure** — the canonical planner load-order and a simplified subagent variant
  appeared in 6 agent files
- **Ponytail 7-rung ladder** — inlined in `planner.md`, `code.md`, `quickcode.md` plus
  `commands/ponytail-help.md` and `skills/ponytail/SKILL.md`
- **Reuse expectation rule** ("before creating new repeatable logic") — verbatim in
  `planner.md`, `code.md`, `quickcode.md`

This duplication was token waste (~85 duplicated lines across 6 files) and a maintenance hazard:
changes had to be synchronized across files.

## Decision

Create `base/opencode/agents/references/invariants.md` as the single canonical source for:

1. Repository Boundary (canonical)
2. Progressive Disclosure (canonical and simplified subagent variant)
3. Ponytail 7-rung ladder and full ladder directive with `ponytail:` comment convention
4. Reuse expectation rule

Replace all inline copies in the 6 agent files (`planner`, `code`, `quickcode`, `research`,
`test`, `taskanalyst`) with a single reference line:
`## Shared Invariants — see \`base/opencode/agents/references/invariants.md\``.

The installer rewrites `base/opencode/` paths in agent `.md` files to `.opencode/` at install
time, so the installed agents correctly reference the deployed invariants file.

Skills reference invariants by name only (not by path) since the loading agent already carries the
invariants.

## Consequences

- 6 agent files each gain ~5-10 lines of available context.
- The 7-rung ladder, Repository Boundary, Progressive Disclosure, and reuse expectation rule each
  have exactly one authoritative location.
- An invariant change in the reference file propagates to all agents without per-file edits.
- Extends ADR-0012's deduplication principle from AGENTS.md to agent files.

## Related

- Issue #160
- ADR-0012: Deduplicate workflow rules to planner
- ADR-0022: Thin ponytail commands to routing slips
