---
description: Show quick reference for all ponytail commands, modes, and the reuse-first ladder.
agent: planner
---

Display the ponytail quick reference.

$ARGUMENTS

## Ponytail Commands

| Command | Purpose |
|---------|---------|
| `/ponytail [mode]` | Set intensity: `off`, `lite`, `full` (default), `ultra` |
| `/ponytail-review` | Review current diff for over-engineering |
| `/ponytail-audit` | Whole-repository over-engineering audit |
| `/ponytail-debt` | Harvest `ponytail:` comments into a debt ledger |
| `/ponytail-gain` | Impact scoreboard (less code, less cost, more speed) |

## The Ladder (applied before any new code)

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

## Convention

Use `ponytail:` comments when deferring a simpler solution. Harvest them later with `/ponytail-debt`.

## Configuration

- Default mode: `full`
- Override via `PONYTAIL_DEFAULT_MODE` environment variable
- Modes persist across sessions via `~/.config/opencode/.ponytail-active`
- Plugin injects ladder rules into system prompt at configured intensity
