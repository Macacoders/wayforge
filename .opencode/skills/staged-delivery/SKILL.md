---
name: staged-delivery
description: Plan, implement, test, review, and document software work through phased delivery with progressive disclosure.
compatibility: opencode
metadata:
  workflow: staged-delivery
  agents: plan-code-test
---

# Staged Delivery

Use this skill for features, bugs, refactors, and repository workflow changes that benefit from controlled phases.

## Progressive Disclosure

- Start from indexes: root `README.md`, then `docs/ai/README.md` when present.
- Load the active plan only for ongoing work.
- Load architecture notes only for boundary, contract, data flow, deployment, or structure changes.
- Load ADRs only when making or revising durable decisions.
- Load logs only for continuity or regression history.
- Handoffs pass compact summaries plus reference paths, not full documents.

## Planning

- Do lightweight research before questions.
- Ask about missing constraints, decisions, and acceptance criteria.
- Split approved work into phases.
- Give every phase acceptance criteria and validation expectations.

## Implementation

- Invoke one `code` subagent per approved phase.
- `code` owns the full phase but stops after each atomic stage.
- Continue in the same child session after user approval.
- Keep diffs minimal and avoid unrelated changes.

## Review And Testing

- `plan` reviews each completed phase with git status/diff/log evidence.
- Invoke `test` when risk, behavior change, or missing validation justifies it.
- `test` must challenge assumptions and prefer observable behavior tests.

## Memory

- Persist approved plans, durable decisions, architecture changes, and short change logs.
- Do not persist raw diffs, full transcripts, or long terminal output.
