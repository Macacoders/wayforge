# AI Memory Index

This directory is a **router**, not a summary corpus. Read this file first, then load only the smallest relevant memory file.

Do **not** load all `docs/ai/**` by default.

## Topic Routes

- Planning current work: `plans/<active-plan>.md`
- Benchmark evaluation handoff: `plans/2026-10-31_224912-benchmark-backed-harness-evaluation.md` (see its final handoff section)
- Repo boundaries/contracts: `architecture.md`
- Durable decisions/tradeoffs: `decisions/*.md` (only related ADRs)
- Shared task workflow context: `backlog/README.md`
- Research deliverables/feasibility reports: `reports/<report-name>.md`
- Historical continuity: `logs/YYYY-MM.md` (only when needed)

## Low-token Load Rules

1. Read this index first.
2. Load one route file at a time.
3. Stop when you have enough context to proceed safely.
4. Ask `planner` to run `/memory` when you need memory lookup, freshness review, or durable updates outside an active experimental implementation run.

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

- `delivery` owns legacy-plan progress state (`status:`, `task:`, per-task `**Status:**`) and acceptance evidence within a run; it does not persist worker results as memory files.
- For an ADR-0049 experimental plan, `implementer` owns active-plan evolution (`Experimental status:`, implementation amendments, and execution changelog) and may update factual implementation memory under `docs/ai/**`. It asks the user directly for unresolved material decisions rather than returning routine drift to `planner`.
- `auditor` appends final audit evidence to the experimental plan and may record durable outcomes under `docs/ai/logs/**`; it does not change architecture notes or ADRs.
- `planner` creates initial plans and remains the default owner for plans, architecture notes, and ADRs outside an active experimental run.

## Handoff Rule

Pass compact paths + reasons to load; do not paste whole memory files unless requested.
