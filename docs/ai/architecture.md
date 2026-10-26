# AI Configuration Architecture

## Scope

This repository provides reusable OpenCode source configuration and installs generated project-local runtime output for target projects.

## Runtime Boundary

- OpenCode (default) and Kilo Code are supported AI runtimes, selectable at install time via the `--runtime` parameter.
- Guided interactive installs are handled by the TypeScript CLI only (`wfg interactive`); non-interactive installs use `wfg install --repo <path>`. Users first install the CLI via the one-shot installer (`curl | sh` / `irm | iex`), then install configuration into each target repository. `wfg install --repo` requires Node.js >= 18 on PATH (the one-shot installer provisions it user-locally when missing).
- Supported provider sets during installation include `free-tier` (default for opencode), `openai`, `github-copilot`, `laberit`, `opencode-go`, and comma-separated combinations of those providers (e.g. `openai,laberit`, `opencode-go,laberit`). `free-tier` is only available for the opencode runtime and installs the default OpenCode structure without configuring an external provider.
- OpenAI authentication is handled in OpenCode with `/connect` (ChatGPT Plus/Pro or Azure credentials).
- GitHub Copilot authentication is handled in OpenCode with `/connect` (device login flow).
- laberit is configured via `OPENAI_BASE_URL` and `OPENAI_API_KEY`, both required in the process environment before launch (a project `.env` file is not picked up). Both runtimes emit the same unified provider shape — `env: ["OPENAI_API_KEY"]` + `options.baseURL: "${OPENAI_BASE_URL}"` — and generated project config never emits `{env:}`/`{file:}` references (invariant, candidate for a future ADR). This avoids Kilo's trusted-config guard: project-level `kilo.jsonc` is untrusted and rejects active `{env:VAR}` references. Fallback if Kilo stops honoring project-level `provider.env`: move `options` with `{env:...}` into the trusted global `~/.config/kilo/kilo.jsonc` (manual; the installer never writes it). A missing variable leaves `${VAR}` literal and the request fails loudly; see README for setup.
- Model IDs are recommendations and may need adjustment with `/models` depending on account availability.
- The default OpenAI model policy uses the current configured OpenAI model set (`openai/gpt-6-sol` plus lightweight `openai/gpt-5.6-luna`) and keeps installer defaults aligned with the provider fragment.
- Generated `opencode.jsonc` (or `kilo.jsonc` for Kilo Code) is the provider/model brain for each target repository and centralizes per-agent model assignments under `agent`.
- Generated runtime config includes `enabled_providers` based on installer provider selection. Agent presets (`balanced`, `fast`, `thorough`) were removed (ADR-0015); the interactive installer instead offers a model preset choice (installer defaults vs faster responses).
- Users can switch providers interactively: `/model openai/gpt-6-sol`, `/model github-copilot/gpt-5.4`, `/model laberit/laberit-ai-preview`, `/model laberit/laberit-kimi-k2.7-code`, or `/model opencode-go/deepseek-v4.1-flash`.

## Installed Surface

### Installer (CLI)

The installer surface is a TypeScript CLI under `cli/src/`, distributed as a prebuilt binary plus a static source snapshot.

- **Framework**: TypeScript + Commander for argument parsing
- **Source**: `cli/src/index.ts` (entrypoint), `cli/src/commands/` (install, uninstall, interactive), `cli/src/lib/` (shared libraries)
- **Binary compilation**: `make cli-binary` produces a standalone executable via `bun build --compile` (~100MB)
- **One-shot installer**: `install/install.sh` (POSIX) and `install/install.ps1` (PowerShell 5.1+) download the compiled binary and share archive into a dedicated prefix and register `bin` on the user PATH. When Node.js >= 18 is absent (or too old), the installer provisions a pinned user-local Node.js into the prefix (`node/`) and adds it to PATH; `--skip-node-check` / `-SkipNodeCheck` bypasses this. No administrator privileges are required.
- **Dedicated prefix / layout**:
  - Linux / macOS: `~/.wayforge`
  - Windows: `%LOCALAPPDATA%\wayforge`
  - Layout: `bin/wfg` (`wfg.exe` on Windows), `node/` (provisioned Node.js, when installed), `share/wayforge/base/**`, `share/wayforge/VERSION`, and `installed-projects.json`
- **Release workflow**: `.github/workflows/release.yml` builds binaries for linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64, win32-arm64, produces share archives (`wayforge-share-<version>.tar.gz` / `.zip`), and uploads `install.sh` / `install.ps1` as release assets
- **Legacy references**: `install/legacy/bootstrap-legacy.sh` and `install/legacy/bootstrap-legacy.ps1` preserve the original full installers; `install/legacy/bootstrap-thin.sh` and `install/legacy/bootstrap-thin.ps1` preserve the retired thin entrypoints. All legacy scripts are frozen.

Reusable versioned source lives in this repository under `base/`. `base/{agents,commands,skills,plugins}` are installed content; `base/{config,permissions}` are generation inputs that are read and never installed.

Agent permissions are centrally maintained in `base/permissions/agents.yml`. The installer renders those permissions into installed `.agents/agents/*.md` frontmatter because OpenCode consumes native agent metadata and does not natively import shared permission fragments from secondary files.

Target projects receive one canonical installed tree plus runtime indirection:

- `.agents/agents/**`, `.agents/commands/**`, `.agents/skills/**`, `.agents/plugins/**` — canonical installed artifacts
- `opencode.jsonc` / `kilo.jsonc` (generated per install); skills and plugin entries point at `.agents/skills` and `.agents/plugins/ponytail/ponytail.mjs`
- `.opencode/agents` + `.opencode/commands` — OpenCode directory pointers to `.agents/` (relative symlink; Windows junction fallback)
- `.kilo/agents` + `.kilo/commands` — Kilo Code directory pointers to `.agents/` (Kilo no longer reads `.opencode/`)
- `AGENTS.md` (repo-specific entrypoint generated/curated per repository)
- `.wayforge-managed` (manifest of managed paths, including pointer entries)
- The ponytail plugin (`.agents/plugins/ponytail/ponytail.mjs`) injects the reuse-first ladder into the system prompt via `experimental.chat.system.transform` and persists intensity mode via `command.execute.before`. Disable with `/ponytail off` or `PONYTAIL_DEFAULT_MODE=off`.

`.agents/` is the single source of installed content; `.opencode/` and the generated pointer directories under `.kilo/` contain only runtime indirection. Pi reads `.agents/skills/**/SKILL.md` natively and needs no installer step. Per-runtime materialization of `.agents/` into native trees is future work (ADR-0046).

### AGENTS.md vs docs/ai/README.md Relationship

- **AGENTS.md**: Practical repo-specific entrypoint for AI agents. Installed as a managed file (customizable per repository). Contains project-specific guidance, build/test commands, and conventions. Workflow and engineering rules are delegated to the `planner` agent (single source of truth). Read this first when starting work in a repository.
- **docs/ai/README.md**: Durable AI memory index. Persistent across work sessions. Contains architecture, decisions, plans, and logs. Load when the task touches structure, boundaries, or historical decisions.
- **Relationship**: AGENTS.md is the "how to work in this repo" guide; docs/ai/README.md is the "what we've decided and built" memory. Both use progressive disclosure.

The `.agents/` directory and generated runtime pointers in consuming repositories are local/generated runtime output, not the reusable source-of-truth for this repository.

## Repository-Self Editing Rule

- In the `wayforge` repository itself, durable workflow changes should normally be made in `base/**`, `base/AGENTS.md`, and the installer scripts.
- Root `.agents/`, `.opencode/`, `.kilo/agents`, `.kilo/commands`, `opencode.jsonc`, and `kilo.jsonc` are local/generated artifacts and are gitignored in this repository. Do not blanket-ignore `.kilo/` because it may hold user-authored Kilo configuration.
- `base/AGENTS.md` is now a general Coldtea-shaped template (project sections + `[FILL IN]` placeholders + a fixed `## Working with wayforge` section) used for onboarding target repositories.
- `/init` (overriding the built-in command) + `research` are responsible for full onboarding: scaffolding/populating `docs/ai/` and filling each target repository root `AGENTS.md`.
- Root `AGENTS.md` in this `wayforge` repository is curated repo-specific guidance and may be tracked/updated directly when repository guidance changes.

The installer must not overwrite unmanaged existing files by default and supports dry-run preview. With force enabled, it refreshes the managed `.agents/` tree (`.agents/agents`, `.agents/commands`, `.agents/skills`, `.agents/plugins`), regenerates runtime config, and repairs runtime pointers when encountered.

Portable workflow helpers used by shared commands should be packaged under `base/skills/**` so they are installed to `.agents/skills/**` and available through the installed surface; consuming repositories should not require a top-level `scripts/` directory for those helpers.

### Installed Projects Tracking

`installed-projects.json` lives in the per-user wayforge prefix (`~/.wayforge/installed-projects.json` on Linux/macOS, `%LOCALAPPDATA%\wayforge\installed-projects.json` on Windows). It is excluded from version control via `.gitignore`.

- **Format**: Structured JSON with `schemaVersion` and `projects` array. Each entry contains:
  - `projectId`: UUIDv4 identifying the logical project. Stored in `.wayforge-managed` as `project_id: <uuid>` so the installer can recognize the same project after a rename or move.
  - `name`: Project directory basename.
  - `path`: Canonical absolute path (Windows-native format `C:\DEV\project` on WSL).
  - `lastUpdated`: ISO 8601 timestamp of the install.
  - `wayforgeVersion`: wayforge version used for the install.
  - `installRef`: Git ref (branch, tag, or commit) used for the install.
- **Created by**: `wfg install --repo` appends to the tracking file after a successful first install.
- **Identity matching** (3-tier): On reinstall, the installer matches existing entries in this order:
  1. **`projectId` match** → update existing entry in-place (name, path, lastUpdated, wayforgeVersion, installRef). This handles project renames and moves.
  2. **Path match** (fallback) → idempotent no-op. Backward-compatible with pre-projectId entries.
  3. **No match** → append new entry.
- **Upgrade path**: Existing projects without `projectId` (installed before this feature) receive a generated UUID on next reinstall, written to `.wayforge-managed` for future matching.
- **`--force`/`-Force` behavior**: Force refreshes skip tracking entirely.
- **`--dry-run`/`-DryRun` behavior**: Dry runs never write to the tracking file.
- **Cross-platform paths**: The TS CLI normalizes paths internally; on WSL it writes Windows-native paths for consistency.

### Bootstrap Scripts

The canonical install surface is the one-shot installer (`install/install.sh` / `install/install.ps1`) plus the `wfg install --repo <path>` command. The retired thin entrypoints `install/bootstrap.sh` and `install/bootstrap.ps1` have been moved to `install/legacy/bootstrap-thin.{sh,ps1}` as frozen reference.

- **No Administrator privileges required** (PowerShell): The one-shot installer uses file writes and updates the User PATH — no symbolic link creation and no elevation.
- **Managed sync**: Deployed by the TS CLI — agents, commands, skill, and plugin files are synced into `.agents/` with `.wayforge-managed` markers for safe refresh without clobbering local additions.
- **Frozen legacy installers**: `install/legacy/**` still reads the pre-flatten source layout and does not work against the flattened `base/` tree (ADR-0033, ADR-0046); only the TypeScript CLI is supported.

### Runtime source-directory resolution

`resolveSourceDir()` (`cli/src/lib/source-dir.ts`) resolves the reusable `base/**` source tree at runtime using this precedence:

1. `WAYFORGE_HOME` if non-empty.
2. A location-based fallback: `path.join(path.dirname(process.execPath), '..', 'share', 'wayforge')`, but only when `base/` exists there. This lets a compiled binary at `<prefix>/bin/wfg` find `<prefix>/share/wayforge/base` without an env var.
3. Dev fallback: `path.resolve(__dirname, '..', '..', '..')` (checkout via `npx tsx`).

If no source tree is found, `install` raises a clear error rather than silently installing nothing. `--ref` continues to override `sourceDir` with a cloned checkout.

## Agent Topology

- `planner` is the default primary agent. It uses a non-native id to avoid colliding with OpenCode's built-in `plan` agent. It formalizes intent (via the `intent` skill) and produces task-based implementation plans (via the `plan` skill).
- `delivery` is a primary orchestration gate that reads an approved plan from disk and drives it through three commands: `/load-plan` (identify the current task), `/implement-task` (handoff to `code`), and `/review-task` (validate and redirect). It does not implement code or own memory.
- `research` is a subagent used for onboarding existing repositories before implementation planning.
- `code` is a conservative implementation subagent used once per approved task, with medium reasoning effort and low temperature.
- `architect` is a read-only review subagent that flags architectural-boundary conflicts against ADRs and proposes new ADRs.
- `troubleshooter` is a `mode: primary` chat agent reachable via `/troubleshooter` that provides command-first, safe, non-destructive diagnostic troubleshooting guidance. It is opt-in (not the default agent; default stays `planner`) and is distinct from `planner` and `code` — it diagnoses problems but does not plan features or implement changes.

## Context Strategy

The system uses progressive disclosure:

- Agents start from indexes and task-specific references.
- Read `docs/ai/README.md` first as the memory router before loading other `docs/ai/**` files.
- `docs/ai/README.md` is intentionally tiny and acts as a route map, not a summary corpus.
- Load only routed memory files that are task-relevant.
- Memory lookup/maintenance should route through planner-owned `/memory` intents (`find`, `check`, `update`) to keep context and writes minimal.
- Handoffs contain compact briefs and reference paths.
- Subagents do not inherit whole planning transcripts.
- Persistent memory stores durable decisions, not chat history.
- Shared task operations live in GitHub Issues; repository direction and transition continuity should be captured through issues, ADRs, plans, architecture notes, and short logs.
- The active repository root is the default boundary for searches, reads, edits, commands, and reviews.
- Handoffs include `Repository root:` so subagents inherit the same boundary.

## Workflow Boundaries

The delivery workflow is:

1. Onboard unfamiliar repositories through `research` and create initial `docs/ai/` memory.
2. Formalize intent (`intent` skill) and plan task-based work with acceptance criteria (`plan` skill).
3. Apply task economy before implementation: 1 task for simple work, justification above 3 tasks, explicit confirmation for 6-8 tasks, and splitting above 8 tasks.
4. `delivery` loads the approved plan (`/load-plan`) and hands each task to `code` (`/implement-task`).
5. Check reasonable existing patterns, utilities, scripts, helpers, commands, tests, and conventions before creating new repeatable logic.
6. Pause after each atomic step for manual validation.
7. Review the completed task with git evidence (`/review-task`).
8. Update docs, decisions, and logs at close via `/memory`.

The shared issue creation workflow is:

1. Start with `/issue create` and a problem, idea, or repository improvement request.
2. `planner` formalizes the request into an intent (via the `intent` skill) and translates that intent directly into the issue body.
3. `planner` creates a GitHub Issue with type/priority/status labels (initial status `status:to-do`) through `gh-issue`.
4. `planner` reports the created issue number and URL.

## Invariants

- Keep installation project-local.
- Keep all operations inside the active repository root unless the user explicitly approves an external path.
- Keep subagent handoffs compact.
- Keep repository onboarding separate from feature planning.
- Keep tasks as reviewable deliverables, not technical microtasks.
- Keep plans above 8 apparent tasks out of single-task planning; split them into smaller tasks first.
- Keep manual validation checkpoints between atomic steps.
- Keep durable memory under `docs/ai/`.
- Keep `.agents/` as the single installed artifact tree; runtime-native pointer directories contain only indirection, and unmanaged files are never deleted to force a pointer into place.
- Keep GitHub Issues as the operational shared source of truth for team tasks.
- Keep shared tasks in GitHub Issues rather than a local JSONL backlog.
- Keep reuse-first guidance explicit: avoid unnecessary copying and speculative abstraction, and justify or flag new duplication.
