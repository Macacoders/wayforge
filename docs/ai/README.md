# AI Memory Index

This directory is a **router**, not a summary corpus. Read this file first, then load only the smallest relevant memory file.

Do **not** load all `docs/ai/**` by default.

## Topic Routes

- Planning current work: `plans/<active-plan>.md`
- Repo boundaries/contracts: `architecture.md`
- Durable decisions/tradeoffs: `decisions/*.md` (only related ADRs)
- Shared task workflow context: `backlog/README.md`
- Research deliverables/feasibility reports: `reports/<report-name>.md`
- Historical continuity: `logs/YYYY-MM.md` (only when needed)

## Low-token Load Rules

1. Read this index first.
2. Load one route file at a time.
3. Stop when you have enough context to proceed safely.
4. Ask `planner` to run `/memory` when you need memory lookup, freshness review, or durable updates.

## What To Persist

- Approved plans and task status
- Architecture boundaries/invariants
- Durable decisions (ADRs)
- Short monthly logs
- Shared task references that matter for future work

## What Not To Persist

- Full transcripts
- Raw diffs
- Long terminal output
- Ephemeral notes or temporary assumptions

## Ownership

- `planner` is the final memory owner.
- Other agents may propose updates, but `planner` decides what gets persisted.

## Handoff Rule

Pass compact paths + reasons to load; do not paste whole memory files unless requested.
