---
name: staged-delivery
description: Onboard, plan, implement, test, review, and document software work through phased delivery with progressive disclosure.
compatibility: opencode
metadata:
  workflow: staged-delivery
  agents: planner-research-code-test
---

# Staged Delivery

Use this skill for repository onboarding, features, bugs, refactors, and workflow changes that benefit from controlled phases.

## Progressive Disclosure

- Start from indexes: root `README.md`, then `docs/ai/README.md` when present.
- Load the active plan only for ongoing work.
- Load architecture notes only for boundary, contract, data flow, deployment, or structure changes.
- Load ADRs only when making or revising durable decisions.
- Load logs only for continuity or regression history.
- Handoffs pass compact summaries plus reference paths, not full documents.

## Repository Boundary

- Treat the active repository root as the default boundary for searches, reads, edits, and commands.
- Do not cross outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in all handoffs so child agents inherit the boundary.

## Planning

- Invoke `research` first for existing repositories that lack useful `docs/ai/` memory.
- Do lightweight research before questions.
- Ask about missing constraints, decisions, and acceptance criteria with OpenCode's native `question` tool.
- Split approved work into phases.
- Give every phase acceptance criteria and validation expectations.

### Phase Economy

Classify scope before proposing phases:

- `quick-sized`: clear, small, low-risk work that would fit quick delivery if the user invoked `/quick` or explicitly requested it.
- `single-phase`: one reviewable deliverable with clear acceptance criteria.
- `multi-phase`: several reviewable deliverables with meaningful sequencing, risk, or dependency boundaries.
- `too-large`: work that would require more than 8 implementation phases as one request.

Use these phase budget rules:

- Prefer 1 phase for simple, localized, or single-outcome work.
- Use 2-3 phases for moderate work with clearly separable deliverables.
- Plans with more than 3 phases must include `Phase budget rationale`.
- Plans with 6-8 phases require explicit user confirmation before implementation handoff.
- If the work appears to need more than 8 phases, do not present it as one implementation plan. Enter `Scope Too Large` mode and propose a split into smaller tasks.

Phases are reviewable deliverables, not technical microtasks. Do not create separate phases just to create files, add helpers, update imports, run validation, write docs, or perform other steps that belong inside one phase's atomic stages.

When scope is too large, use this format instead of an implementation plan:

```md
## Scope Too Large

This request appears to require more than 8 implementation phases.

Reason:

Recommended split:
1. Task A:
2. Task B:
3. Task C:

Blocking decision:
Choose one smaller task to plan first, or approve a revised scope boundary.
```

## Repository Onboarding

- Use `research` before planning feature work in an unfamiliar repository.
- Inspect docs, structure, stack, scripts, tests, CI/CD, entrypoints, conventions, and risks.
- Create initial routed `docs/ai/` memory only when durable-memory writes are explicitly approved by planner/user or in the handoff; otherwise propose concise memory updates.
- Do not modify product code or plan implementation during onboarding.
- Return a compact Repository Research Brief for `planner` and the user to review.

## Implementation

- Invoke one `code` subagent per approved phase.
- `code` owns the full phase but stops after each atomic stage.
- Continue in the same child session after user approval.
- Keep diffs minimal and avoid unrelated changes.

## Review And Testing

- `planner` reviews each completed phase with git status/diff/log evidence.
- Invoke `test` when risk, behavior change, or missing validation justifies it.
- `test` must challenge assumptions and prefer observable behavior tests.

## Memory

- Persist approved plans, durable decisions, architecture changes, and short change logs.
- Do not persist raw diffs, full transcripts, or long terminal output.
