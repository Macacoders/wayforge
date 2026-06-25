---
name: ponytail
description: Apply the ponytail reuse-first discipline when the user mentions ponytail, be lazy, lazy mode, yagni, simplest solution, reuse-first, or over-engineered.
compatibility: opencode
metadata:
  workflow: ponytail
  owner: planner
---

# Ponytail Reuse-First Discipline

Before writing new code, climb the 7-rung ladder:

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

Intensity levels are `off`, `lite`, `full` (default), and `ultra`. The active mode is injected into the system prompt by the ponytail plugin. Switch modes with `/ponytail [mode]` and view the full reference with `/ponytail-help`.

When deferring a simpler solution, leave a `ponytail:` comment so it can be harvested later with `/ponytail-debt`.
