---
description: Review the current git diff for over-engineering against the ponytail ladder.
agent: planner
---

Review the current diff against the ponytail reuse-first discipline.

$ARGUMENTS

Run `git diff` and examine each change. For each addition:
1. Was it necessary? (YAGNI)
2. Could existing codebase, stdlib, native features, or dependencies have solved it?
3. Could it have been a one-liner?

Flag over-engineered code with the rung it violates. Propose simpler alternatives. Use `ponytail:` comments to mark deferred simplifications for future harvesting via `/ponytail-debt`.
