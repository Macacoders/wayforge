---
description: Start a progressive-disclosure planning conversation.
agent: planner
---

Use the `plan` skill to plan the intent established in the conversation. If no clear intent exists and the request is ambiguous, use the `intent` skill first. Ground the plan in repository facts, delegating to `research` when required. Do not implement — return the scope classification, task count, plan path, and any blocking decisions or required gates.

Check the risk classification in the `delivery-policy` skill before planning. If the request is a
small, low-risk correction that needs no intent or plan artifacts, say so and point the user at
`/deliver` instead of producing a plan. Once the plan is approved, `delivery` executes it
autonomously with `/deliver-plan`; do not plan per-task approval steps.

Additional scope or clarification:

$ARGUMENTS
