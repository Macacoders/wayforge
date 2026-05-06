---
description: Route a small, low-risk request through planner for quick delivery.
agent: planner
---

Use the quick-delivery workflow for this request:

$ARGUMENTS

Classify whether the request is eligible for quick delivery. If eligible, prepare a compact Quick Code Handoff Brief and invoke one `quickcode` subagent session to complete the approved quick task without staged pauses. If not eligible, explain why and fall back to the staged-delivery planning workflow.
