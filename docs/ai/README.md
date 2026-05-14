# AI Memory Index

This directory stores durable project memory for AI-assisted work. Use it with progressive disclosure: read this index first, then load only the documents needed for the current task.

## Documents

- `architecture.md`: Current architecture, boundaries, invariants, and installation model. Load when changing repository structure, agent responsibilities, install behavior, or public workflow contracts.
- `backlog/`: Shared task workflow docs and durable local backlog memory. Load `backlog/README.md` for GitHub Issues workflow/labels and `backlog/tasks.jsonl` for transition history and durable repository direction context.
- `decisions/`: ADRs for durable decisions. Load only ADRs related to the current change or when proposing a decision that may conflict with past choices.
- `plans/`: Approved implementation plans. Load the active plan for the current feature, bug, refactor, or workflow update.
- `logs/`: Short monthly change logs. Load only when historical continuity is needed.

## Persistence Rules

Persist:

- Approved plans and phase status.
- Backlog tasks that describe known problems, target outcomes, status, and acceptance criteria.
- Architecture boundaries and invariants.
- Durable decisions and rejected alternatives.
- Short summaries of completed work.

Do not persist:

- Full chat transcripts.
- Raw diffs.
- Long terminal logs.
- Trivial implementation details.
- Temporary assumptions that no longer matter.

## Agent Responsibilities

- `planner` owns this memory and decides when it must change.
- `planner` keeps shared work aligned between GitHub Issues (operational tracker) and `backlog/tasks.jsonl` (durable local memory when needed).
- `code` updates product or repository docs relevant to its phase and may propose memory updates.
- `test` may propose risk or coverage notes when they affect future work.

## Handoff Rule

Agent handoffs should include reference paths and reasons to load them. They should not paste entire memory files unless explicitly requested by the user.
