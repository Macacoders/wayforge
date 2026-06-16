# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes. Staged delivery is the default conservative path; quick delivery handles clear, small, low-risk tasks via `/quick` or proactive planner suggestion.

## AI Memory Index

This file is the practical entrypoint for AI agents working in this repository. For durable memory (architecture, decisions, approved plans, and logs), see `docs/ai/README.md`.

Treat `docs/ai/README.md` as a tiny router. Do not load all memory files by default; use `/memory` (planner) or `memory-maintenance` for low-token lookup/freshness/update routing.

## Repository Guidance

The sections below contain repository-specific guidance. `/onboard-repo` and `research` fill these values during onboarding.

### Project Overview

[FILL IN: One sentence. What does this repository do? Who are the users? Link to README.md.]

### Build/Test Commands

[FILL IN: Build, test, lint, and run commands. Link to README.md or Makefile for details.]

### Key Conventions & Constraints

[FILL IN: 2-4 rules that directly affect agent behavior — e.g., never commit .env, always dry-run first, use conventional commits, required PR approvals. Skip anything already in README.md.]

## Workflow

1. Use `planner` for orchestration, questions, workflow selection, planning, handoffs, and git-based review.
2. Use `/plan` for staged delivery when work needs onboarding, planning, architecture or safety review, multiple phases, or has meaningful regression risk.
3. Use `/quick` for quick delivery when the task is clear, small, low-risk, and safely validated with local checks. `planner` may also proactively suggest quick delivery for clearly eligible tasks, but must ask for explicit user confirmation before proceeding.
4. Use `research` for repository onboarding before planning changes in unfamiliar repos.
5. For staged delivery, use one `code` child session per approved phase; `code` stops after each atomic stage and waits for manual validation.
6. Keep staged plans compact: phases are reviewable deliverables, not technical microtasks.
7. Justify plans with more than 3 phases, require explicit confirmation for 6-8 phases, and split work that appears to require more than 8 phases.
8. For quick delivery, `planner` may invoke `quickcode` for one approved low-risk task; `quickcode` works without staged pauses and reports once for planner review.
9. Escalate quick delivery back to staged delivery if scope, risk, validation, or acceptance criteria become unclear.
10. Use `test` when completed changes need critical testing review or regression coverage.
11. Use `/issue` to create and manage shared repository tasks as GitHub Issues.
12. Update durable memory under `docs/ai/` only for onboarding findings, backlog tasks, approved plans, decisions, architecture changes, and short logs.
13. Use `/memory` (planner) or `memory-maintenance` for low-token memory find/check/update routing.

## Progressive Disclosure

- Read this file and the repository `README.md` first.
- Read `docs/ai/README.md` before loading other AI memory.
- Use GitHub Issues through `/issue` when selecting or creating repository improvement tasks.
- Load only task-relevant plans, ADRs, architecture notes, or logs.
- Run onboarding before implementation planning if `docs/ai/` memory is missing or stale.
- Pass compact handoff briefs with paths and reasons to load references.
- Do not paste full docs, diffs, logs, or chat transcripts into handoffs.

## Repository Boundary

- Treat the installed target repository root as the default boundary for searches, reads, edits, and commands.
- Do not operate outside that root unless the user explicitly approves the external path.
- Include `Repository root:` in handoffs so child agents inherit the boundary.
- Require explicit user approval before reviewing cross-repository or external paths.

## Engineering Rules

- Prefer the smallest correct change.
- Prefer the fewest phases that preserve clear acceptance criteria and safe review.
- Preserve unrelated user changes in the worktree.
- Before creating new repeatable logic, inspect reasonable existing patterns, utilities, scripts, helpers, commands, tests, and conventions within task scope.
- Reuse suitable existing project patterns; justify new duplication or flag it as debt/risk.
- Avoid unnecessary copying, speculative abstractions, and broad refactors.
- Update documentation when behavior, configuration, or workflows change.
- Do not commit unless the user explicitly asks.

## Validation Rules

- Start with checks closest to the changed code.
- For staged delivery, propose manual validation commands after each atomic stage.
- For quick delivery, report validation run and any validation still recommended in the single completion report.
- Prefer existing safe validation before recommending new tests.
- Create or request new tests only for concrete uncovered regression risk tied to observable behavior.
- Keep test budgets explicit and minimal; use `none` when new tests are not approved or not needed.
- For low-risk, docs-only, mechanical, or configuration-only changes, a clear no-test rationale is acceptable.
- Report exactly what was run and what was not run.
- Treat missing validation as a review risk.

## Definition Of Done

- The approved phase acceptance criteria are satisfied.
- Staged-delivery manual checkpoints were offered between atomic stages, or quick-delivery results received planner review.
- Relevant tests, existing validation, or a no-test rationale were reviewed.
- Documentation and durable AI memory are updated when needed.
- The final handoff includes changed files, validation, risks, and a proposed commit message.
