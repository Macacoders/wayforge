# AGENTS.md

## Project overview

`wayforge` ships a reusable AI-assisted development workflow for OpenCode: three primary agents (`planner`, `delivery`, `troubleshooter`), three subagents (`research`, `code`, `architect`), skills, commands, plugins, and a persistent `docs/ai/` memory convention. Users are this repo's maintainers and maintainers of consuming repos that install it. Agents most often touch `base/opencode/**` (source templates), `cli/src/**` (installer), and `docs/ai/**` (memory). See [README.md](README.md) for usage and [docs/ai/architecture.md](docs/ai/architecture.md) for architecture.

## Project structure

- `base/opencode/**` — reusable source templates (the source of truth; edit here, not generated output)
- `base/AGENTS.md` — generic skeleton with `[FILL IN]` placeholders for consuming repos
- `cli/src/**` — TypeScript installer CLI
- `cli/tests/` — CLI integration and unit tests
- `install/` — one-shot installer scripts (`install.sh`, `install.ps1`) + frozen legacy
- `scripts/` — release helper (`release.ts`)
- `qa/` — QA scripts (lint runners, dependency installer, coverage)
- `tests/` — unit tests (bash, powershell, typescript subdirs)
- `docs/` + `docs/ai/` — contributor docs + durable AI memory (plans, ADRs, logs)
- `.github/` — release workflow, PR/issue templates
- `.opencode/` + `opencode.jsonc` — gitignored generated artifacts (do not edit directly)
- `profiles/` — provider/model profile definitions

## Setup & build

- `npm install` — installs root + `cli/` workspace dependencies (npm workspaces)
- `make install-deps` — runs `qa/install-deps` for all toolchains
- `make check` — full validation (typecheck, lint, format, duplication)
- `make cli-binary` — compiles standalone binary via `bun build --compile`
- `npx tsx cli/src/index.ts install --repo /path/to/repo --providers openai` — run installer locally during development

## Testing

- Full suite: `make check` (typecheck + lint + format + duplication)
- Unit tests: `npx vitest run` (or `npm test`)
- Typecheck: `npm run typecheck` or `cd cli && npx tsc --noEmit`
- Lint: `cd cli && npx eslint src/` — auto-fix with `make fix-node`
- Format: `cd cli && npx prettier --check src/`
- Integration: `cli/tests/integration/run.sh`
- Duplication: `make check-duplication` (jscpd, 8% threshold)
- Deprecated (legacy shell/PowerShell scripts): `make check-bash`, `make check-powershell`

## Code style

TypeScript (CLI): Prettier via `.prettierrc` — no semicolons, single quotes, tab indentation (`useTabs`, `tabWidth: 4`), trailing commas all, `printWidth: 80`. ESLint via `cli/eslint.config.mjs`. Shell scripts: shfmt + ShellCheck. PowerShell: PSScriptAnalyzer. Reuse-first: follow patterns already in neighboring files.

## Git workflow

`develop` = active development, `main` = stable/release. Feature branches from `develop`, PR back into `develop`. Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`) with `(Issue #NN)` where applicable. PR template at `.github/pull_request_template.md` (Summary/Testing/Breaking changes). Releases: SemVer tag `vX.Y.Z`, update `VERSION` + `CHANGELOG.md` (Keep a Changelog), merge develop→main; see [RELEASE.md](RELEASE.md).

## Boundaries

1. **Source vs generated** — edit `base/opencode/**`, never the gitignored `.opencode/` or `opencode.jsonc`.
2. **Template preservation** — keep `base/AGENTS.md` generic with placeholders; root `AGENTS.md` is this repo's curated guidance.
3. **Secrets** — never commit `.env*`, `.gh-config/`, tokens, or auth state.
4. **Installer safety** — always `--dry-run` first; `--force` overwrites managed output deliberately.

## Repository boundary

Stay inside the repository root (`git rev-parse --show-toplevel` when in a git repo, otherwise the working directory). Don't read or write outside it unless the user approves.

## Working with wayforge

This repository uses the wayforge workflow. Match process to risk:

- **Small, low-risk fix:** `/deliver <request>` — `delivery` classifies it, dispatches implementation to `code`, verifies each acceptance criterion with the `reviewer`, and commits. No intent or plan artifact needed.
- **Complex or risky work:** `/intent` then `/plan` (the `planner` agent, which also obtains boundary review), then `/deliver-plan` to execute the approved plan autonomously (dispatch → verify criteria → integrate), or `/load-plan` + `/implement-task` + `/review-task` to drive one task by hand.

Risk classification, work-order and verification contracts, acceptance, and the loop's stop rule live in the `delivery-policy` skill. Track shared tasks with `/issue`. Load context progressively: start from this file and `README.md`, then route through `docs/ai/README.md` and load only what the task needs.
