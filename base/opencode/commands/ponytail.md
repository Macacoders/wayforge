---
description: Set ponytail reuse-first intensity level (lite, full, ultra, off). Default: full.
agent: planner
---

Switch ponytail intensity for the current session. Persists across turns via the ponytail plugin.

$ARGUMENTS

Supported modes:
- `off` — no reuse-first injection
- `lite` — gentle reminder to prefer reuse
- `full` — standard 7-rung ladder (default)
- `ultra` — strict mode; no new code without rung justification

After switching, confirm the new mode. Use `/ponytail-review` to audit current work or `/ponytail-help` for all commands.
