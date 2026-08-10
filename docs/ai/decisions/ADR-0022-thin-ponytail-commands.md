# ADR-0022: Thin ponytail commands to routing slips

## Status
Accepted

## Date
2026-07-07

## Context

Six ponytail command files (`base/opencode/commands/ponytail*.md`) ranged from 15 to 39 lines
and inlined procedural content that also lived in corresponding skill files
(`base/opencode/skills/ponytail-*/SKILL.md`). The duplication meant:

- The 7-rung ladder appeared in both `ponytail-help.md` (command) and
  `skills/ponytail-help/SKILL.md`
- Audit scan criteria appeared in both `ponytail-audit.md` and `skills/ponytail-audit/SKILL.md`
- Debt ledger fields, impact metrics, and review criteria were similarly duplicated

Changes to ponytail procedure required editing two files per topic.

## Decision

Reduce all 6 ponytail command files to ≤6-line routing slips. Each command now says
"Load skill `<name>`. <one-sentence purpose>." plus `$ARGUMENTS`. All procedural content lives
in the skill files as the single source.

For `ponytail-help`, the Convention and Configuration sections that existed only in the command
file were moved into the skill since the skill is now the authoritative source.

`/ponytail-review` was also rerouted from `planner` to `delivery` (diff review is a delivery
concern). The other five ponytail commands remain on `planner`.

## Consequences

- Each command file dropped from 15-39 lines to 8 total (5 frontmatter + 3 body).
- No procedural bullet list, scan criteria, ledger field, or impact metric is duplicated between
  a command and its skill.
- Ponytail procedure changes now require editing only the skill file.

## Related

- Issue #160
- ADR-0021: Centralize shared invariants (ladder moved to invariants.md)
- ADR-0028: Ponytail reuse-first integration
