# AI Configuration Architecture

## Scope

This repository provides reusable OpenCode source configuration and installs generated project-local runtime output for target projects.

## Runtime Boundary

- OpenCode (default) and Kilo Code are supported AI runtimes, selectable at install time via the `--runtime` parameter.
- Guided interactive installs are handled by the TypeScript CLI only (`ai-config interactive`); non-interactive installs use `ai-config install --repo <path>`. Users first install the CLI via the one-shot installer (`curl | sh` / `irm | iex`), then install configuration into each target repository.
- Supported provider sets during installation include `free-tier` (default for opencode), `openai`, `github-copilot`, `laberit`, `opencode-go`, and comma-separated combinations of those providers. `free-tier` is only available for the opencode runtime and installs the default OpenCode structure without configuring an external provider.
- OpenAI authentication is handled in OpenCode with `/connect` (ChatGPT Plus/Pro or Azure credentials).
- GitHub Copilot authentication is handled in OpenCode with `/connect` (device login flow).
- laberit is configured via environment variables (`OPENAI_BASE_URL`, `OPENAI_API_KEY`).
- Model IDs are recommendations and may need adjustment with `/models` depending on account availability.
- The default OpenAI model policy uses documented general GPT models (`openai/gpt-5.5` plus lightweight `openai/gpt-5.4-mini`) instead of Codex or undocumented fast-model IDs so ChatGPT Plus/Pro installs avoid known account-availability failures.
- Generated `opencode.jsonc` (or `kilo.jsonc` for Kilo Code) is the provider/model brain for each target repository and centralizes per-agent model assignments under `agent`.
- Generated runtime config includes `enabled_providers` based on installer provider selection. Agent presets (`balanced`, `fast`, `thorough`) were removed (ADR-0015); the interactive installer instead offers a model preset choice (installer defaults vs faster responses).
- Users can switch providers interactively: `/model openai/gpt-5.5`, `/model github-copilot/gpt-5.4`, `/model laberit/laberit-ai-preview`, or `/model opencode-go/deepseek-v4-pro`.

## Installed Surface

### Installer (CLI)

The installer surface is a TypeScript CLI under `cli/src/`, distributed as a prebuilt binary plus a static source snapshot.

- **Framework**: TypeScript + Commander for argument parsing
- **Source**: `cli/src/index.ts` (entrypoint), `cli/src/commands/` (install, uninstall, interactive), `cli/src/lib/` (shared libraries)
- **Binary compilation**: `make cli-binary` produces a standalone executable via `bun build --compile` (~100MB)
- **One-shot installer**: `install/install.sh` (POSIX) and `install/install.ps1` (PowerShell 5.1+) download the compiled binary and share archive into a dedicated prefix and register `bin` on the user PATH. No administrator privileges are required.
- **Dedicated prefix / layout**:
  - Linux / macOS: `~/.ai-config`
  - Windows: `%LOCALAPPDATA%\ai-config`
  - Layout: `bin/ai-config` (`ai-config.exe` on Windows), `share/ai-config/base/**`, `share/ai-config/VERSION`, and `installed-projects.json`
- **Release workflow**: `.github/workflows/release.yml` builds binaries for linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64, win32-arm64, produces share archives (`ai-config-share-<version>.tar.gz` / `.zip`), and uploads `install.sh` / `install.ps1` as release assets
- **Legacy references**: `install/legacy/bootstrap-legacy.sh` and `install/legacy/bootstrap-legacy.ps1` preserve the original full installers; `install/legacy/bootstrap-thin.sh` and `install/legacy/bootstrap-thin.ps1` preserve the retired thin entrypoints. All legacy scripts are frozen.

Reusable versioned source lives in this repository under `base/opencode/**`.

Agent permissions are centrally maintained in `base/opencode/permissions/agents.yml`. The installer renders those permissions into generated target `.opencode/agents/*.md` frontmatter because OpenCode consumes native agent metadata and does not natively import shared permission fragments from secondary files.

Target projects receive generated/local runtime output:

- `opencode.jsonc` (generated per install)
- `.opencode/agents/**` (copied/generated local output)
- `.opencode/commands/**` (copied/generated local output)
- `.opencode/skills/**` (copied/generated local output)
- `.opencode/plugins/**` (copied/generated local output); shared plugin utilities may live under `lib/` within the plugin tree
- `AGENTS.md` (repo-specific entrypoint generated/curated per repository)
- The ponytail plugin (`.opencode/plugins/ponytail/ponytail.mjs`) injects the reuse-first ladder into the system prompt via `experimental.chat.system.transform` and persists intensity mode via `command.execute.before`. Disable with `/ponytail off` or `PONYTAIL_DEFAULT_MODE=off`.

### AGENTS.md vs docs/ai/README.md Relationship

- **AGENTS.md**: Practical repo-specific entrypoint for AI agents. Installed as a managed file (customizable per repository). Contains project-specific guidance, build/test commands, and conventions. Workflow and engineering rules are delegated to the `planner` agent (single source of truth). Read this first when starting work in a repository.
- **docs/ai/README.md**: Durable AI memory index. Persistent across work sessions. Contains architecture, decisions, plans, and logs. Load when the task touches structure, boundaries, or historical decisions.
- **Relationship**: AGENTS.md is the "how to work in this repo" guide; docs/ai/README.md is the "what we've decided and built" memory. Both use progressive disclosure.

The `.opencode/` directory in consuming repositories is local/generated runtime output, not the reusable source-of-truth for this repository.

## Repository-Self Editing Rule

- In the `ai-config` repository itself, durable workflow changes should normally be made in `base/opencode/**`, `base/AGENTS.md`, and the installer scripts.
- Root `.opencode/` and root `opencode.jsonc` are local/generated artifacts and are gitignored in this repository.
- `base/AGENTS.md` is the generic placeholder template (`[FILL IN]` values preserved) used for onboarding target repositories.
- `/onboard-repo` + `research` are responsible for filling repo-specific guidance into each target repository root `AGENTS.md`.
- Root `AGENTS.md` in this `ai-config` repository is curated repo-specific guidance and may be tracked/updated directly when repository guidance changes.

The installer must not overwrite unmanaged existing files by default and supports dry-run preview. With force enabled, it refreshes generated OpenCode runtime trees (`.opencode/agents`, `.opencode/commands`, `.opencode/skills`) plus managed output and legacy symlink targets when encountered.

Portable workflow helpers used by shared commands should be packaged under `.opencode/skills/**` so they are available through the installed surface; consuming repositories should not require a top-level `scripts/` directory for those helpers.

### Installed Projects Tracking

`installed-projects.json` lives in the per-user ai-config prefix (`~/.ai-config/installed-projects.json` on Linux/macOS, `%LOCALAPPDATA%\ai-config\installed-projects.json` on Windows). It is excluded from version control via `.gitignore`.

- **Format**: Structured JSON with `schemaVersion` and `projects` array. Each entry contains:
  - `projectId`: UUIDv4 identifying the logical project. Stored in `.ai-config-managed` as `project_id: <uuid>` so the installer can recognize the same project after a rename or move.
  - `name`: Project directory basename.
  - `path`: Canonical absolute path (Windows-native format `C:\DEV\project` on WSL).
  - `lastUpdated`: ISO 8601 timestamp of the install.
  - `aiConfigVersion`: ai-config version used for the install.
  - `installRef`: Git ref (branch, tag, or commit) used for the install.
- **Created by**: `ai-config install --repo` appends to the tracking file after a successful first install.
- **Identity matching** (3-tier): On reinstall, the installer matches existing entries in this order:
  1. **`projectId` match** → update existing entry in-place (name, path, lastUpdated, aiConfigVersion, installRef). This handles project renames and moves.
  2. **Path match** (fallback) → idempotent no-op. Backward-compatible with pre-projectId entries.
  3. **No match** → append new entry.
- **Upgrade path**: Existing projects without `projectId` (installed before this feature) receive a generated UUID on next reinstall, written to `.ai-config-managed` for future matching.
- **`--force`/`-Force` behavior**: Force refreshes skip tracking entirely.
- **`--dry-run`/`-DryRun` behavior**: Dry runs never write to the tracking file.
- **Cross-platform paths**: The TS CLI normalizes paths internally; on WSL it writes Windows-native paths for consistency.

### Bootstrap Scripts

The canonical install surface is the one-shot installer (`install/install.sh` / `install/install.ps1`) plus the `ai-config install --repo <path>` command. The retired thin entrypoints `install/bootstrap.sh` and `install/bootstrap.ps1` have been moved to `install/legacy/bootstrap-thin.{sh,ps1}` as frozen reference.

- **No Administrator privileges required** (PowerShell): The one-shot installer uses file writes and updates the User PATH — no symbolic link creation and no elevation.
- **Managed sync**: Deployed by the TS CLI — agents, commands, and skill files are synced with `.ai-config-managed` markers for safe refresh without clobbering local additions.

### Runtime source-directory resolution

`resolveSourceDir()` (`cli/src/lib/source-dir.ts`) resolves the reusable `base/opencode/**` source tree at runtime using this precedence:

1. `AI_CONFIG_HOME` if non-empty.
2. A location-based fallback: `path.join(path.dirname(process.execPath), '..', 'share', 'ai-config')`, but only when `base/` exists there. This lets a compiled binary at `<prefix>/bin/ai-config` find `<prefix>/share/ai-config/base` without an env var.
3. Dev fallback: `path.resolve(__dirname, '..', '..', '..')` (checkout via `npx tsx`).

If no source tree is found, `install` raises a clear error rather than silently installing nothing. `--ref` continues to override `sourceDir` with a cloned checkout.

## Agent Topology

- `planner` is the default primary agent. It uses a non-native id to avoid colliding with OpenCode's built-in `plan` agent.
- `research` is a subagent used for onboarding existing repositories before implementation planning.
- `code` is a conservative implementation subagent used once per approved implementation phase, with medium reasoning effort and low temperature.
- `quickcode` is an implementation subagent invoked by `planner` for one approved quick-delivery task, with low reasoning effort for small low-risk changes. It may edit autonomously within narrow low-risk scope, run `bash` commands under the coarse allow + deny-list model (ADR-0036), and must not invoke subagents.
- `test` is an independent review subagent used when review identifies meaningful testing or regression risk, keeping critical review independent from implementation output.
- `taskanalyst` is a lightweight analysis subagent used by `/issue create` to interpret problem reports and propose structured GitHub Issue content without editing files.
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

The default staged-delivery workflow is:

1. Onboard unfamiliar repositories through `research` and create initial `docs/ai/` memory.
2. Plan with clarifying questions and acceptance criteria.
3. Apply phase economy before implementation: 1 phase for simple work, justification above 3 phases, explicit confirmation for 6-8 phases, and task splitting above 8 phases.
4. Implement one approved phase through `code`.
5. Check reasonable existing patterns, utilities, scripts, helpers, commands, tests, and conventions before creating new repeatable logic.
6. Pause after each atomic stage for manual validation.
7. Review the completed phase with git evidence.
8. Distinguish running existing validation, recommending tests, and creating new tests.
9. Do not invoke `test` by default.
10. Prefer existing validation or a no-test rationale for low-risk work before recommending new tests.
11. Invoke `test` in `write-tests` mode only when new test creation is explicitly approved (user request, approved acceptance criteria, or user-approved recommendation) and constrained by a concrete test budget.
12. Update docs, decisions, and logs at close.

The opt-in quick-delivery workflow is:

1. Start with `/quick` or an explicit request for quick delivery.
2. `planner` confirms the task is clear, small, low-risk, and safe to validate locally.
3. `planner` invokes `quickcode` with a compact approved-scope handoff.
4. `quickcode` completes the approved task without staged pauses and reports once.
5. `planner` reviews the result with git evidence before responding.

Quick delivery escalates back to staged delivery when scope, risk, validation, or acceptance criteria become unclear.

The shared issue creation workflow is:

1. Start with `/issue create` and a problem, idea, or repository improvement request.
2. `planner` uses `gh-issue check` and `gh-issue labels-check` for GitHub access and label readiness.
3. `planner` invokes `taskanalyst` to interpret the request and draft a concise issue body.
4. `planner` iterates only when the extracted issue description is ambiguous, duplicate-prone, vague, missing acceptance criteria, or missing required labels.
5. `planner` creates a GitHub Issue with type/priority/status labels (initial status `status:to-do`) through `gh-issue`.
6. `planner` reports the created issue number and URL.

## Invariants

- Keep installation project-local.
- Keep all operations inside the active repository root unless the user explicitly approves an external path.
- Keep subagent handoffs compact.
- Keep repository onboarding separate from feature planning.
- Keep phases as reviewable deliverables, not technical microtasks.
- Keep plans above 8 apparent implementation phases out of single-task planning; split them into smaller tasks first.
- Keep `test` independent and critical of `code` output.
- Keep new test creation strictly opt-in and auditable through Test Handoff Brief authorization fields.
- Keep test recommendations tied to observable behavior, concrete risk, insufficient existing validation, and minimal budget.
- Keep manual validation checkpoints between atomic stages for staged delivery.
- Keep quick delivery limited to approved low-risk tasks with no staged pauses and mandatory planner review.
- Keep durable memory under `docs/ai/`.
- Keep GitHub Issues as the operational shared source of truth for team tasks.
- Keep shared tasks in GitHub Issues rather than a local JSONL backlog.
- Keep shared task analysis separated from issue operations.
- Keep reuse-first guidance explicit: avoid unnecessary copying and speculative abstraction, and justify or flag new duplication.
