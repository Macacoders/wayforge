---
description: Find, check, and update durable AI memory with planner-owned routing.
agent: planner
---

Manage durable memory with low-token routing:

$ARGUMENTS

First establish the active repository root. Keep memory reads/writes inside that root unless the user explicitly approves an external path.

Load and follow the `memory-maintenance` skill before routing or persisting updates.

Supported intents:

- `find <topic>`: Route to the smallest relevant `docs/ai/**` file(s) and return concise paths + why.
- `check`: Run a memory freshness check for the current work before review/close.
- `update <summary>`: Propose or apply minimal durable memory updates (plans, architecture, ADRs, logs) when justified.

Keep memory compact. Do not load all memory files by default. Do not persist transcripts, raw diffs, or long terminal output.
