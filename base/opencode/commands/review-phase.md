---
description: Review completed phase changes against the approved plan via the delivery pipeline.
agent: delivery
---

Review the completed phase using git evidence. Inspect changed and added files, compare them against the approved plan and acceptance criteria, identify validation gaps or concrete test recommendations, and use an authorized Test Handoff only when justified and explicitly approved by the testing policy. Include memory freshness in phase review by running `/memory check` (planner), `memory-maintenance` freshness check, or `ai-memory close-check` (with the companion `ai-memory` skill for deterministic bookkeeping), then load only routed, task-relevant memory files.

Confirm the active repository root from the handoff or current git repository. Constrain review searches, reads, and git inspection to that root unless the user explicitly approves an external path.

Additional context:

$ARGUMENTS
