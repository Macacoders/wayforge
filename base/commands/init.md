---
description: Onboard this repository: scaffold and populate docs/ai memory and generate AGENTS.md.
agent: planner
---

Fully onboard this repository so it is immediately ready to use with the wayforge workflow.

1. Treat the current working directory as the repository root — the `ai-memory` script operates on `process.cwd()`. Keep all reads/writes inside it.
2. Load the `ai-memory` skill and check `docs/ai/` with its script:
   - `npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts status`
   - If `docs/ai/` is missing or incomplete, scaffold with `npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts init`.
3. Invoke the `research` subagent with explicit write approval to complete onboarding:
   - Fill `docs/ai/architecture.md` (scope, boundaries, invariants).
   - Write `docs/ai/decisions/ADR-0001-initial-ai-memory.md`.
   - Write `docs/ai/logs/YYYY-MM.md` for the current month.
   - Generate root `AGENTS.md`. Fill every `[FILL IN]` placeholder with project-specific guidance: Project overview (one short paragraph), Project structure (key directories), Setup & build (install/build commands), Testing (full suite + single-test + lint/typecheck commands), Code style (formatter/linter), Git workflow (branch, commit format, merge requirements), Boundaries (2–4 explicit don'ts). Keep the `## Repository boundary` and `## Working with wayforge` sections verbatim, and add no wayforge boilerplate. If `AGENTS.md` already exists with useful content, improve it in place rather than replacing.
4. Report created/changed files, discovered validation commands, and any unknowns.

Additional context:

$ARGUMENTS
