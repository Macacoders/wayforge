---
description: Prepare and invoke code for the next approved phase.
agent: planner
---

Prepare the next approved phase for implementation.

Use a compact Code Handoff Brief. Invoke one `code` subagent session for the whole phase. Do not split the approved phase into new phases during handoff; use atomic stages only as implementation checkpoints inside the approved phase. The `code` subagent must stop after each atomic stage and wait for explicit user approval before continuing in the same child session.

Additional context:

$ARGUMENTS
