---
name: ponytail-debt
description: Harvest simplification debt when the user mentions harvest ponytail comments, simplification debt, deferred simplifications, or ponytail debt ledger.
compatibility: opencode
metadata:
  workflow: ponytail
  owner: planner
---

# Ponytail Debt Ledger

Search the repository for `ponytail:` comments (literal match). Compile a structured ledger with:

- File path and line
- What was deferred
- Which ladder rung it violates
- Estimated impact (low/medium/high)

Output a markdown report for planning future simplification sprints. This is read-only — do not modify source files unless explicitly asked.
