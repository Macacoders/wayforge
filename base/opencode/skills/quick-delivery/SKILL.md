---
name: quick-delivery
description: Classify, hand off, implement, and review small low-risk tasks without staged pauses.
compatibility: opencode
metadata:
  workflow: quick-delivery
  agents: planner-quickcode
---

# Quick Delivery

Use this skill for opt-in small, low-risk tasks where the user wants faster implementation with less supervision than staged delivery.

## Eligibility

A request is eligible for quick delivery only when all of these are true:

- The user invoked `/quick`, explicitly requested quick delivery, or explicitly confirmed a proactive quick-delivery suggestion from `planner`.
- The task has a clear, narrow outcome and obvious acceptance criteria.
- The change is expected to touch a small number of files.
- The risk of regression, data loss, security impact, or operational impact is low.
- The work does not require architectural decisions, broad refactors, migrations, dependency installation, deployments, releases, or secret handling.
- Reasonable validation can be done with safe git inspection and common local validation commands.

If any condition is not met, use the staged-delivery workflow instead.

## Repository Boundary

- Treat the active repository root as the default boundary for searches, reads, edits, and commands.
- Do not cross outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in quick handoffs so `quickcode` inherits the boundary.


