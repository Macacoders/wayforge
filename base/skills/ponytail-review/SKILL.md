---
name: ponytail-review
description: Review current changes for over-engineering when the user asks to review for over-engineering, check diff for bloat, ponytail review, or is this over-engineered.
compatibility: opencode
metadata:
  workflow: ponytail
  owner: planner
---

# Ponytail Review

Run `git diff` and examine each addition against the ponytail ladder. For every new chunk, ask:

- Was it necessary? (YAGNI)
- Could existing codebase, stdlib, native features, or dependencies solve it?
- Could it be a one-liner?

Flag violations by rung, propose concrete simplifications, and use `ponytail:` comments to mark deferred cleanups. Trigger `/ponytail-debt` later to harvest them.
