---
description: Harvest deferred ponytail: comments into a simplification debt ledger.
agent: planner
---

Collect all `ponytail:` comments in the codebase into a simplification debt ledger.

$ARGUMENTS

Search the repository for `ponytail:` comments (grep for the literal string). Compile them into a structured ledger listing:
- File path and line
- What was deferred
- Which rung it violates
- Estimated simplification impact (low/medium/high)

Output as a markdown report suitable for planning future simplification sprints. This is a read-only audit — do not modify any source files.
