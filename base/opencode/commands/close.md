---
description: Close the current work via the delivery pipeline with docs, decisions, logs, and commit message.
agent: delivery
---

Close the current work. Review documentation and decisions. Before broad memory review, run `/memory check` (planner), `memory-maintenance` freshness check, or `ai-memory close-check` and load only routed, task-relevant memory files. If the task involves architecture, data flow, module boundary, deployment, or public contract changes, load and review `docs/ai/architecture.md` only when routed as needed. Route durable memory updates via `/memory update` (planner) or `memory-maintenance` update flow. Review active plan status, monthly log if present, validation evidence, and unresolved risks. Propose a concise commit message but do not commit. If optional memory files (architecture.md, decisions/, logs/) are absent, continue without error.

Additional context:

$ARGUMENTS
