# ADR-0040: Override built-in `/init` as the single repo-onboarding entry point

**Date:** 2026-09-15
**Status:** accepted

## Context

OpenCode ships a built-in `/init` command that generates a root `AGENTS.md` file. ai-config previously added a custom `/onboard-repo` command that was a superset of `/init`: it scaffolded `docs/ai/` memory (architecture, decisions, logs, plans, backlog) and filled the target repository's root `AGENTS.md` with repo-specific guidance. Having two onboarding commands was confusing and gave users no single entry point.

Custom OpenCode commands can override built-in commands when their identifiers match. `base/AGENTS.md` was also evolving from a minimal placeholder into a richer, general Coldtea-shaped template that combines project-specific sections, `[FILL IN]` placeholders, and a concise `## Working with ai-config` workflow note.

## Decision

1. Retire the `/onboard-repo` custom command and override OpenCode's built-in `/init` as the single onboarding entry point.
2. The overridden `/init` command, backed by the `research` subagent, performs full onboarding:
   - Scaffolds/populates `docs/ai/` memory (`README.md`, `architecture.md`, `decisions/`, `logs/`, `plans/`, `backlog/`).
   - Fills each target repository's root `AGENTS.md` with repo-specific guidance, derived from `base/AGENTS.md`.
3. `base/AGENTS.md` becomes a general Coldtea-shaped template: project sections + `[FILL IN]` placeholders + a fixed `## Working with ai-config` section.

## Rationale

- **One entry point.** `/init` is the command users already expect for new-repo setup; overriding it removes the ambiguity of two onboarding paths.
- **Superset behavior preserved.** Full onboarding still leaves a repository ready to use with ai-config, not just a generic `AGENTS.md`.
- **Template alignment.** A richer `base/AGENTS.md` gives `research` a consistent structure to fill while keeping placeholders for project-specific values.

## Alternatives

- Keep `/onboard-repo` alongside `/init` and document when to use each. Rejected because it fragments onboarding and duplicates user guidance.
- Leave `/init` unmodified and only use `/onboard-repo`. Rejected because `/init` is the discoverable, built-in convention.

## Consequences

- `/onboard-repo` is removed from `base/opencode/commands/`.
- Live references in `README.md` and `docs/ai/architecture.md` are updated to `/init`.
- `research` gains explicit write approval under `/init` to create and populate `docs/ai/` and the target repo's root `AGENTS.md`.
- Historical ADRs, logs, and plans that mention `/onboard-repo` remain intact for continuity.
