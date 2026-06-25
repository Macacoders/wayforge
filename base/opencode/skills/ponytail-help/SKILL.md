---
name: ponytail-help
description: Answer ponytail reference questions when the user asks about ponytail commands, ponytail reference, what ponytail modes, or ponytail help.
compatibility: opencode
metadata:
  workflow: ponytail
  owner: planner
---

# Ponytail Quick Reference

## Commands

| Command | Purpose |
|---------|---------|
| `/ponytail [mode]` | Switch intensity: `off`, `lite`, `full` (default), `ultra` |
| `/ponytail-review` | Review current diff for over-engineering |
| `/ponytail-audit` | Whole-repository audit |
| `/ponytail-debt` | Harvest `ponytail:` comments into a ledger |
| `/ponytail-gain` | Impact scoreboard |

## The Ladder

1. YAGNI → skip it
2. Already in codebase → reuse it
3. Stdlib → use it
4. Native platform → use it
5. Installed dependency → use it
6. One line → one line
7. Only then: minimum code that works

Modes persist via `~/.config/opencode/.ponytail-active`. Default is `full`.
