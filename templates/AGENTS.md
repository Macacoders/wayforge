# AGENTS.md

## Mission

Use the installed OpenCode workflow to onboard repositories and deliver minimal, reviewed, and documented changes through explicit planning phases.

## Workflow

1. Use `plan` for orchestration, questions, phased planning, and git-based review.
2. Use `research` for repository onboarding before planning changes in unfamiliar repos.
3. Use one `code` child session per approved phase.
4. `code` must stop after each atomic stage and wait for manual validation.
5. Use `test` when completed changes need critical testing review or regression coverage.
6. Update durable memory under `docs/ai/` only for onboarding findings, approved plans, decisions, architecture changes, and short logs.

## Progressive Disclosure

- Read this file and the repository `README.md` first.
- Read `docs/ai/README.md` before loading other AI memory.
- Load only task-relevant plans, ADRs, architecture notes, or logs.
- Run onboarding before implementation planning if `docs/ai/` memory is missing or stale.
- Pass compact handoff briefs with paths and reasons to load references.
- Do not paste full docs, diffs, logs, or chat transcripts into handoffs.

## Engineering Rules

- Prefer the smallest correct change.
- Preserve unrelated user changes in the worktree.
- Avoid speculative abstractions and broad refactors.
- Update documentation when behavior, configuration, or workflows change.
- Do not commit unless the user explicitly asks.

## Validation Rules

- Start with checks closest to the changed code.
- Propose manual validation commands after each atomic stage.
- Report exactly what was run and what was not run.
- Treat missing validation as a review risk.

## Definition Of Done

- The approved phase acceptance criteria are satisfied.
- Manual validation checkpoints were offered between atomic stages.
- Relevant tests or testing rationale were reviewed.
- Documentation and durable AI memory are updated when needed.
- The final handoff includes changed files, validation, risks, and a proposed commit message.
