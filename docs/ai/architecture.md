# AI Configuration Architecture

## Scope

This repository provides reusable OpenCode source configuration and installs generated project-local runtime output for target projects.

## Runtime Boundary

- OpenCode (default) and Kilo Code are supported AI runtimes, selectable at install time via the `--runtime` / `-Runtime` parameter.
- Both Bash and PowerShell support guided interactive installs (`install/bootstrap-interactive.sh`, `install/bootstrap-interactive.ps1`) and non-interactive installs (`install/bootstrap.sh`, `install/bootstrap.ps1`).
- Supported provider sets during installation include `free-tier` (default for opencode), `openai`, `github-copilot`, `laberit`, `opencode-go`, and comma-separated combinations of those providers. `free-tier` is only available for the opencode runtime and installs the default OpenCode structure without configuring an external provider.
- OpenAI authentication is handled in OpenCode with `/connect` (ChatGPT Plus/Pro or Azure credentials).
- GitHub Copilot authentication is handled in OpenCode with `/connect` (device login flow).
- laberit is configured via environment variables (`OPENAI_BASE_URL`, `OPENAI_API_KEY`).
- Model IDs are recommendations and may need adjustment with `/models` depending on account availability.
- The default OpenAI model policy uses documented general GPT models (`openai/gpt-5.5` plus lightweight `openai/gpt-5.4-mini`) instead of Codex or undocumented fast-model IDs so ChatGPT Plus/Pro installs avoid known account-availability failures.
- Generated `opencode.jsonc` (or `kilo.jsonc` for Kilo Code) is the provider/model brain for each target repository and centralizes per-agent model assignments under `agent`.
- Generated runtime config includes `enabled_providers` based on installer provider selection and supports agent presets (`balanced`, `fast`, `thorough`) through `--agent-preset` / `-AgentPreset`.
- Users can switch providers interactively: `/model openai/gpt-5.5`, `/model github-copilot/gpt-5.4`, `/model laberit/laberit-ai`, or `/model opencode-go/deepseek-v4-pro`.

## Installed Surface

Reusable versioned source lives in this repository under `base/opencode/**`.

Agent permissions are centrally maintained in `base/opencode/permissions/agents.yml`. The installer renders those permissions into generated target `.opencode/agents/*.md` frontmatter because OpenCode consumes native agent metadata and does not natively import shared permission fragments from secondary files.

Target projects receive generated/local runtime output:

- `opencode.jsonc` (generated per install)
- `.opencode/agents/**` (copied/generated local output)
- `.opencode/commands/**` (copied/generated local output)
- `.opencode/skills/**` (copied/generated local output)
- `AGENTS.md` (repo-specific entrypoint generated/curated per repository)

### AGENTS.md vs docs/ai/README.md Relationship

- **AGENTS.md**: Practical repo-specific entrypoint for AI agents. Installed as a managed file (customizable per repository). Contains project-specific guidance, build/test commands, conventions, and workflow rules. Read this first when starting work in a repository.
- **docs/ai/README.md**: Durable AI memory index. Persistent across work sessions. Contains architecture, decisions, plans, and logs. Load when the task touches structure, boundaries, or historical decisions.
- **Relationship**: AGENTS.md is the "how to work in this repo" guide; docs/ai/README.md is the "what we've decided and built" memory. Both use progressive disclosure.

The `.opencode/` directory in consuming repositories is local/generated runtime output, not the reusable source-of-truth for this repository.

## Repository-Self Editing Rule

- In the `ai-config` repository itself, durable workflow changes should normally be made in `base/opencode/**`, `templates/AGENTS.md`, and the installer scripts.
- Root `.opencode/` and root `opencode.jsonc` are local/generated artifacts and are gitignored in this repository.
- `templates/AGENTS.md` is the generic placeholder template (`[FILL IN]` values preserved) used for onboarding target repositories.
- `/onboard-repo` + `research` are responsible for filling repo-specific guidance into each target repository root `AGENTS.md`.
- Root `AGENTS.md` in this `ai-config` repository is curated repo-specific guidance and may be tracked/updated directly when repository guidance changes.

The installer must not overwrite unmanaged existing files by default and supports dry-run preview. With force enabled, it refreshes generated OpenCode runtime trees (`.opencode/agents`, `.opencode/commands`, `.opencode/skills`) plus managed output and legacy symlink targets when encountered.

Portable workflow helpers used by shared commands should be packaged under `.opencode/skills/**` so they are available through the installed surface; consuming repositories should not require a top-level `scripts/` directory for those helpers.

### Installed Projects Tracking

`installed-projects.json` at the repository root tracks which projects have been installed with ai-config. It is excluded from version control via `.gitignore`.

- **Format**: Structured JSON with `version` (schema version) and `projects` array. Each entry contains:
  - `name`: Project directory basename.
  - `path`: Canonical absolute path (Windows-native format `C:\DEV\project` on WSL).
  - `description`: Reserved for future use (`null` for now).
  - `lastUpdated`: ISO 8601 timestamp of the install.
- **Created by**: `install/bootstrap.sh` and `install/bootstrap.ps1` create or append to the file after a successful first install.
- **Duplicate prevention**: Re-running the installer or using `--force` does not add duplicate entries — scripts check for existing path matches.
- **`--force`/`-Force` behavior**: Force refreshes skip tracking entirely.
- **`--dry-run`/`-DryRun` behavior**: Dry runs never write to the tracking file.
- **Cross-platform paths**: On WSL, `bootstrap.sh` converts paths with `wslpath -w` when writing. Git Bash preserves forward slashes natively.

### Bootstrap Scripts

`install/bootstrap.sh` and `install/bootstrap.ps1` install the runtime configuration into a target repository. Both source shared helper libraries from `install/lib/`.

- **No Administrator privileges required** (PowerShell): The installer uses `Copy-Item` and file writes — no symbolic link creation. The previous admin check (which auto-enabled dry-run when not elevated) has been removed.
- **Managed sync**: Agent, command, and skill files are synced via `Sync-ManagedTree` (or `sync_managed_tree` in Bash). Files are tracked with `.ai-config-managed` markers for safe refresh without clobbering local additions.

## Agent Topology

- `planner` is the default primary agent. It uses a non-native id to avoid colliding with OpenCode's built-in `plan` agent.
- `research` is a subagent used for onboarding existing repositories before implementation planning.
- `code` is a conservative implementation subagent used once per approved implementation phase, with medium reasoning effort and low temperature.
- `quickcode` is an implementation subagent invoked by `planner` for one approved quick-delivery task, with low reasoning effort for small low-risk changes. It may edit autonomously within narrow low-risk scope, run allowlisted validation/git inspection commands, and must not invoke subagents.
- `test` is an independent review subagent used when review identifies meaningful testing or regression risk, keeping critical review independent from implementation output.
- `taskanalyst` is a lightweight analysis subagent used by `/issue create` to interpret problem reports and propose structured GitHub Issue content without editing files.

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
