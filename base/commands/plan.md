---
description: Start a progressive-disclosure planning conversation.
agent: planner
metadata:
  workflow: plan
---

Use the `plan` skill to plan the intent established in the conversation. If no clear intent exists and the request is ambiguous, use the `intent` skill first. Ground the plan in repository facts, delegating to `research` when required. Do not implement — return the scope classification, task count, plan path, and any blocking decisions or required gates.

Additional scope or clarification:

$ARGUMENTS