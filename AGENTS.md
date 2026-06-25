# AGENTS.md

## Mission

Use the installed OpenCode workflows to onboard repositories and deliver minimal, reviewed, and documented changes. Staged delivery is the default conservative path; quick delivery handles clear, small, low-risk tasks via `/quick` or proactive planner suggestion.

## AI Memory Index

This file is the practical entrypoint for AI agents working in this repository. For durable memory (architecture, decisions, approved plans, and logs), see `docs/ai/README.md`.

Treat `docs/ai/README.md` as a tiny router. Do not load all memory files by default; use `/memory` (planner) or `memory-maintenance` for low-token lookup/freshness/update routing.

## Repository Guidance

The sections below contain repository-specific guidance. `/onboard-repo` and `research` fill these values during onboarding.

### Project Overview

`ai-config` is a project-local OpenCode configuration repository that provides reusable AI-assisted development workflow sources (agents, skills, commands, plugins), installer scripts, and durable AI-memory conventions. Users are maintainers of this repo and maintainers of consuming repositories that install the configuration. See [README.md](./README.md) for the installation model and workflow contract.

### Build/Test Commands

- **Full QA**: `make check` — runs Bash lint/format (shfmt + ShellCheck), PowerShell analysis (PSScriptAnalyzer), Bats/Pester tests, and duplication checks (jscpd)
- **Bash only**: `make check-bash` — shfmt formatting + ShellCheck lint
- **PowerShell only**: `make check-powershell` — PSScriptAnalyzer + Pester tests (requires `pwsh`)
- **TypeScript type-check**: `npx --yes -p typescript -p @types/node -- tsc --noEmit` (requires `node_modules/` with `@types/node`; `strict: true` is now enabled)
- **Tests only**: `make check-tests` — Bats for Bash (`tests/bash/*.bats`), Pester for PowerShell
- **Coverage**: `make coverage` (Bash + PowerShell)
- **Duplication**: `make check-duplication` (jscpd, 8% threshold on `.sh`/`.ps1` files)
- **Fix Bash formatting**: `make fix-bash`
- **Install QA deps**: `make install-deps`
- **Installer dry-run**: `./install/bootstrap.sh --repo /path/to/repo --dry-run`
- **Installer install**: `./install/bootstrap.sh --repo /path/to/repo --providers free-tier`
- See [Makefile](./Makefile) for all targets.

### Key Conventions & Constraints

1. **Source vs generated**: Edit `base/opencode/**` for durable agent/skill/command/plugin changes. `.opencode/` and `opencode.jsonc` are gitignored generated artifacts — never edit them directly in this repo.
2. **Template preservation**: Keep `base/AGENTS.md` generic with `[FILL IN]` placeholders for consuming-repo onboarding. Root `AGENTS.md` is curated repo-specific guidance for this repository only.
3. **Secrets boundary**: Never commit `.env*`, `.gh-config/`, tokens, or auth state. Provider auth is established in OpenCode via `/connect`; laberit uses local environment variables.
4. **Installer safety**: Always use `--dry-run` first when testing installer changes. `--force` overwrites managed output — use only when intentionally refreshing.

## Workflow & Engineering Rules

The `planner` agent is the single source of truth for workflow rules, progressive disclosure, repository boundary, engineering rules, validation rules, and definition of done. These are runtime invariants enforced by planner at plan, handoff, and review time. Agent files carry their own Repository Boundary section for safety. See the installed planner agent for the canonical ruleset.
