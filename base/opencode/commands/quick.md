---
description: Route a small, low-risk request through planner for quick delivery.
agent: planner
---

Use the quick-delivery workflow for this request:

$ARGUMENTS

First establish the active repository root. Keep searches, reads, reviews, and handoff references inside that root unless the user explicitly approves an external path, and include `Repository root:` in the Quick Code Handoff Brief.

Classify whether the request is eligible for quick delivery. If eligible, prepare a compact Quick Code Handoff Brief and invoke one `quickcode` subagent session to complete the approved quick task without staged pauses. If not eligible, explain why and fall back to the staged-delivery planning workflow.
