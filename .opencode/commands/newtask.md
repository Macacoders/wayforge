---
description: Analyze a problem or idea and append a structured task to the AI backlog.
agent: planner
---

Create a new backlog task from this request:

$ARGUMENTS

First establish the active repository root. Keep all reads, searches, reviews, and handoff references inside that root unless the user explicitly approves an external path.

Use the backlog task creation workflow:

1. Read `docs/ai/backlog/README.md` and `docs/ai/backlog/tasks.jsonl`.
2. Invoke `taskanalyst` with a compact Task Analysis Brief.
3. Review the analysis for missing required fields, duplicate risk, and classification errors.
4. Ask the user one concise clarification question if required fields are missing or a likely duplicate exists.
5. If the task is ready, invoke `backlogwriter` with a Backlog Write Brief.
6. Validate that `docs/ai/backlog/tasks.jsonl` remains valid JSONL.
7. Review the diff and report the created task id.

Do not implement the task being created. This command only creates backlog entries.
