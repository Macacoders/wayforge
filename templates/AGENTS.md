# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes. Staged delivery is the default conservative path; quick delivery is opt-in for clear, small, low-risk tasks.

## AI Memory Index

This file is the practical entrypoint for AI agents working in this repository. For durable memory (architecture, decisions, approved plans, and logs), see `docs/ai/README.md`.

## Repository Guidance

The following sections contain repository-specific guidance. Customize these placeholders for your project.

### Project Overview

[FILL IN: What is this repository for? What problem does it solve? Who are the users? Link to main README if applicable.]

### Build/Test Commands

[FILL IN: How to build, run tests, and lint this project. Include common commands like:]
- Build: `[FILL IN: npm run build / make / cargo build / etc.]`
- Test: `[FILL IN: npm test / make test / cargo test / etc.]`
- Lint: `[FILL IN: npm run lint / cargo clippy / etc.]`
- Run locally: `[FILL IN: npm start / make run / etc.]`

### Code Style & Conventions

[FILL IN: Naming conventions, formatting rules, and architecture patterns for this codebase. Examples:]
- Language/Framework: `[FILL IN: Python/TypeScript/Rust/etc.]`
- Style guide: `[FILL IN: PEP 8 / Airbnb / Standard / etc.]`
- Formatter: `[FILL IN: black / prettier / rustfmt / etc.]`
- Key patterns: `[FILL IN: MVC, functional, hexagonal, etc.]`

### Testing Expectations

[FILL IN: Test types, coverage requirements, and testing philosophy. Examples:]
- Test framework: `[FILL IN: jest / pytest / cargo test / etc.]`
- Coverage target: `[FILL IN: 80% / 90% / etc.]`
- Test types: `[FILL IN: unit, integration, e2e, property-based]`
- CI requirements: `[FILL IN: all tests must pass before merge]`

### Security Notes

[FILL IN: Security considerations specific to this project. Examples:]
- Secrets handling: `[FILL IN: use .env files, never commit secrets, use secret manager]`
- Auth patterns: `[FILL IN: OAuth2, JWT, API keys, etc.]`
- Sensitive data: `[FILL IN: PII handling, encryption requirements]`
- Dependencies: `[FILL IN: vulnerability scanning, update policy]`

### Deployment

[FILL IN: How and where this project is deployed. Examples:]
- Platform: `[FILL IN: Vercel, AWS, Kubernetes, self-hosted]`
- Environments: `[FILL IN: dev, staging, production]`
- CI/CD: `[FILL IN: GitHub Actions, GitLab CI, Jenkins]`
- Release process: `[FILL IN: automated on tag, manual approval, etc.]`

### PR/Commit Guidance

[FILL IN: Commit message format and PR conventions. Examples:]
- Commit format: `[FILL IN: conventional commits / semantic / freeform]`
- PR template: `[FILL IN: link to PR template or describe required sections]`
- Branch naming: `[FILL IN: feature/, bugfix/, etc.]`
- Review requirements: `[FILL IN: require 1+ approvals, CI pass, etc.]`

## Workflow

1. Use `planner` for orchestration, questions, workflow selection, planning, handoffs, and git-based review.
2. Use `/plan` for staged delivery when work needs onboarding, planning, architecture or safety review, multiple phases, or has meaningful regression risk.
3. Use `/quick` only for quick delivery when the task is clear, small, low-risk, and safely validated with local checks.
4. Use `research` for repository onboarding before planning changes in unfamiliar repos.
5. For staged delivery, use one `code` child session per approved phase; `code` stops after each atomic stage and waits for manual validation.
6. Keep staged plans compact: phases are reviewable deliverables, not technical microtasks.
7. Justify plans with more than 3 phases, require explicit confirmation for 6-8 phases, and split work that appears to require more than 8 phases.
8. For quick delivery, `planner` may invoke `quickcode` for one approved low-risk task; `quickcode` works without staged pauses and reports once for planner review.
9. Escalate quick delivery back to staged delivery if scope, risk, validation, or acceptance criteria become unclear.
10. Use `test` when completed changes need critical testing review or regression coverage.
11. Use `/newtask` to create shared repository tasks as GitHub Issues, and `/tasks` to list/claim/release/close shared work.
12. Update durable memory under `docs/ai/` only for onboarding findings, backlog tasks, approved plans, decisions, architecture changes, and short logs.

## Progressive Disclosure

- Read this file and the repository `README.md` first.
- Read `docs/ai/README.md` before loading other AI memory.
- Use GitHub Issues through `/newtask` and `/tasks` when selecting or creating repository improvement tasks.
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
- Avoid speculative abstractions and broad refactors.
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
