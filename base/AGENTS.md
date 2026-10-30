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

## Working with wayforge

This repository uses the wayforge workflow. Match process to risk:

- **Small, low-risk fix:** `/deliver <request>` — `delivery` classifies it, dispatches implementation to `code`, verifies each acceptance criterion with the `reviewer`, and commits. No intent or plan artifact needed.
- **Complex or risky work:** `/intent` then `/plan` (the `planner` agent, which also obtains boundary review), then `/deliver-plan` to execute the approved plan autonomously (dispatch → verify criteria → integrate), or `/load-plan` + `/implement-task` + `/review-task` to drive one task by hand.

Risk classification, work-order and verification contracts, acceptance, and the loop's stop rule live in the `delivery-policy` skill. Track shared tasks with `/issue`. Load context progressively: start from this file and `README.md`, then route through `docs/ai/README.md` and load only what the task needs.
