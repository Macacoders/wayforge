---
name: implementation-quality
description: Adopt an eligible approved plan or execute an experimental one end to end with bounded scouting, per-task validation and commits, and a final execution changelog. Use when the implementer runs a plan.
compatibility: opencode
metadata:
  workflow: experimental-implementation
  owner: implementer
---

# Implementation Quality

Use this for a plan whose frontmatter declares `workflow: implement-then-audit`, or adopt an eligible unstarted ordinary approved plan before execution. This is separate from the legacy delivery workflow; do not load `delivery-policy` or interpret legacy `Status:` as delivery acceptance.

## Plan Adoption

An ordinary plan is eligible only when its frontmatter is `status: planned` and no task has started: every task is `Status: pending`, or it is a legacy plan at `task: 0/<total>`. Add `workflow: implement-then-audit`, add `Experimental status: pending` to every task, and record the adoption under `## Implementation amendments` with the source state. Preserve legacy fields; do not adopt an in-progress, accepted, blocked, or completed delivery plan. Report the conflicting state instead of guessing.

## Execute the Plan

1. Read the plan and its routed references. Require every task to carry `Experimental status:`; valid values are `pending`, `in-progress`, `completed`, and `blocked`.
2. Select a dependency-ready pending task, set its experimental status to `in-progress`, and make the smallest change that meets its approved criteria.
3. Ask `scout` only for a missing fact. Its handoff names one lens/question, allowed paths or references, and the evidence expected. Do not use a scout as an open-ended explorer.
4. Run every agent-owned validation named by the task. Report, but never run, human-owned validation.
5. When evidence is green, commit the task, record its commit and validation evidence, set its experimental status to `completed`, and continue. A completed task is not independently accepted.
6. When implementation evidence changes a task's direction, amend the active plan and continue: record the change, repository evidence, affected tasks, and validation impact under `## Implementation amendments`. Update relevant durable `docs/ai/**` facts in the same bounded change.
7. If an unresolved public contract, persistence, auth/security, deployment, or user-visible scope decision is required, set the task to `blocked` and ask the user directly. Otherwise do not stop merely to return the plan to `planner`.

## Execution Changelog

After every task is completed, append or update a compact `## Execution changelog` in the experimental plan. For each task record: task ID, commit, validations/evidence, decisions, and residual risks. End with the reviewed commit range and an audit request.

At closeout, use `memory-maintenance` to identify the smallest durable update and `ai-memory` for deterministic status or close-check operations. Apply factual implementation memory updates directly; record unresolved material choices for the user rather than routing routine plan evolution back through `planner`.

Do not create a second state store, rewrite legacy `Status:` fields, or persist broad scout transcripts. Preserve unrelated changes.
