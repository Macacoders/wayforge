# AGENTS.md

## Project overview

[FILL IN: One short paragraph. What does this repository do, who uses it, and which parts an agent will touch most. Link deeper docs instead of repeating them.]

## Project structure

[FILL IN: Key directories and what lives in each — e.g. `src/` core code, `tests/` mirrors `src/`, `docs/` contributor docs.]

## Setup & build

[FILL IN: Install and build commands, e.g. `npm install`, `npm run build`.]

## Testing

[FILL IN: Full test suite, a single-test command, and lint/typecheck commands.]

## Code style

[FILL IN: Formatter and linter; follow patterns already in neighboring files.]

## Git workflow

[FILL IN: Branch from / PR target, commit format, and merge requirements.]

## Boundaries

[FILL IN: 2–4 explicit don'ts — e.g. never commit `.env*`, don't widen scope beyond the request, don't add dependencies without asking.]

## Repository boundary

Stay inside the repository root (`git rev-parse --show-toplevel` when in a git repo, otherwise the working directory). Don't read or write outside it unless the user approves.

## Working with ai-config

This repository uses the ai-config workflow. Formalize and plan work with `/intent` then `/plan` (the `planner` agent). Track shared tasks with `/issue`. Implement approved plans with the `delivery` agent (`/load-plan`, `/implement-task`, `/review-task`). Load context progressively: start from this file and `README.md`, then route through `docs/ai/README.md` and load only what the task needs.
