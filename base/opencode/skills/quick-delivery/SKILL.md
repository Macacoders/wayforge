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

## Quick Delivery Classification

Classify a request for quick delivery only when the user invoked `/quick` or explicitly asked for quick delivery. If the request is not quick-eligible, explain why and fall back to staged-delivery planning without weakening the staged workflow.

A request is quick-eligible only when all of these are true:

- The outcome and acceptance criteria are clear without substantial discovery.
- The expected diff is small and touches a small number of files.
- Regression, security, data, operational, release, and user-impact risk are low.
- The work does not require architecture decisions, broad refactors, migrations, dependency installation, deployments, releases, or secret handling.
- Safe local validation is likely possible with git inspection and common validation commands.

Escalate to staged delivery when quick-delivery scope becomes ambiguous, cross-cutting, high-risk, security-sensitive, dependent on unsafe validation, or larger than the handoff described.

### Proactive Suggestion

`planner` may proactively suggest quick delivery when all of these are true:

- The user has not invoked `/quick` or explicitly asked for quick delivery.
- The request unambiguously meets all Quick Delivery Classification criteria above.
- Planner can explain clearly why the task is quick-eligible and what the expected outcome is.

When `planner` suggests quick delivery:

1. Propose the quick-delivery path, state the eligibility reasons, and outline the expected scope.
2. Wait for explicit user confirmation before preparing a Quick Code Handoff Brief or invoking `quickcode`.
3. If the user declines, fall back to staged-delivery planning without weakening the staged workflow.
4. If the user confirms, follow the standard quick delivery workflow: prepare compact handoff, invoke `quickcode`, review results with git evidence.

Escalate to staged delivery if the request scope, risk, or validation requirements become unclear during discussion.

## Repository Boundary

- Treat the active repository root as the default boundary for searches, reads, edits, and commands.
- Do not cross outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in quick handoffs so `quickcode` inherits the boundary.


