---
name: ponytail-audit
description: Audit the codebase for over-engineering when the user asks to audit for over-engineering, codebase audit, find bloat, or ponytail audit.
compatibility: opencode
metadata:
  workflow: ponytail
  owner: planner
---

# Ponytail Audit

Scan the repository systematically for structural over-engineering. Look for:

- Duplicated logic that could share a utility (rung 2)
- Custom reimplementations of stdlib or native features (rungs 3-4)
- Complex code where a one-liner would work (rung 6)
- Premature abstraction or unnecessary generalization (rung 1)

Group findings by severity, estimate simplification impact, and mark them with `ponytail:` comments for `/ponytail-debt` harvesting.
