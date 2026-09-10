---
description: Start an intent-formalization conversation to clarify and bound the user's request.
agent: planner
---

Use the `intent` skill to formalize the user's request into a precise, bounded intent.

- Start in conversation mode: restate the request and desired outcome, investigate relevant code/docs, and search for state-of-the-art approaches when useful.
- Ask one clarifying question at a time until scope, constraints, and success criteria are clear.
- Propose a minimal high-level solution and iterate with the user until accepted.
- Do not design the implementation or write code; keep the intent at the what/why level.
- Present the final intent using the intent schema, then offer the next step: file a GitHub issue (`shared-task`) or produce a plan (`plan`).

Additional scope or clarification:

$ARGUMENTS
