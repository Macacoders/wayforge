# ai-config

`ai-config` provides a repeatable AI-assisted development workflow for OpenCode. It installs three primary agents (`planner` for discovery and planning, `delivery` for implementation, `troubleshooter` for command-first diagnostics), three specialized subagents, a reuse-first discipline, and a persistent project memory convention.

- **Runtime**: OpenCode (default) or Kilo Code, selectable at install time.
- **Providers**: Free tier (default), OpenAI, GitHub Copilot, laberit, and OpenCode Go — pick one or combine them.
- **Installation**: Copies templates from `base/opencode/**` into your project as `.opencode/` runtime files.
- **Context model**: Agents load only what they need (progressive disclosure), not entire documentation trees.

## Workflows

**Staged delivery** is the single delivery path — all work is planned as one or more tasks and reviewed task-by-task.

Use `/plan` when the work needs planning, multiple files or tasks, architecture review, migrations, dependency changes, or has meaningful regression risk. Narrow tasks with obvious acceptance criteria are planned as a single task in the same workflow.

Agents follow a reuse-first contract: before writing new code, they check existing patterns, utilities, and conventions in the codebase. New duplication must be justified.

Use `/issue` to capture problems or ideas as GitHub Issues instead of implementing them immediately.

### Staged delivery

1. Start with `planner` (or `/plan`).
2. For unfamiliar repos, run `/init` first to create project memory.
3. Describe the feature, bug, or refactor. `planner` reviews the codebase, asks clarifying questions, and proposes a task-based plan with acceptance criteria.
4. Once approved, `delivery` takes over: it reads the plan from disk, hands each task to the `code` subagent, and reviews the results with git evidence.
5. `code` implements one task at a time in atomic stages, pausing after each for your approval.
6. `delivery` reviews each completed task and runs validation.
7. At the end, run `/memory` to update durable memory (plans, ADRs, logs).

## Ponytail Reuse-First Discipline

Before writing new code, agents climb a 7-rung ladder:

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

Default intensity is `full`. Available modes: `off`, `lite`, `full`, `ultra`.

| Command | Purpose |
|---------|---------|
| `/ponytail [mode]` | Switch intensity |
| `/ponytail-review` | Review current diff for over-engineering |
| `/ponytail-audit` | Whole-repository audit |
| `/ponytail-debt` | Harvest `ponytail:` comments into a debt ledger |
| `/ponytail-gain` | Impact scoreboard |
| `/ponytail-help` | Quick reference |

Set `PONYTAIL_DEFAULT_MODE` to override the default, or `/ponytail off` to disable.

## Agents

The installed setup includes three primary agents and three subagents.

| Agent | Mode | Purpose |
| :--- | :--- | :--- |
| `planner` | Primary | Discovery, phased planning, clarifying questions, memory maintenance, shared task (issue) management. |
| `delivery` | Primary | Reads approved plans from disk, hands tasks to `code`, and reviews completed work with git evidence. |
| `troubleshooter` | Primary | Provides command-first, safe, non-destructive diagnostic troubleshooting guidance via `/troubleshooter`. |
| `research` | Subagent | Onboards unfamiliar repositories and creates initial `docs/ai/` memory. |
| `code` | Subagent | Implements one task across atomic stages, pausing after each for manual validation. |
| `architect` | Subagent | Reviews changes against architectural decisions (ADRs) when a task touches boundaries, contracts, or data models. |
| `triage` | Skill | Classifies error/bug pastes and recommends the right next gate (`/plan` or backlog). |

Model assignments (OpenAI, GitHub Copilot, laberit, OpenCode Go) are configured at install time and written into `opencode.jsonc` (or `kilo.jsonc` for Kilo Code). Switch providers interactively with `/model <provider>/<model>`.

## Progressive Disclosure

Agents load context in this order, only as needed:

1. User task and root `README.md`
2. `docs/ai/README.md` (the memory router)
3. Active plan under `docs/ai/plans/`
4. Architecture notes (`docs/ai/architecture.md`) — only for boundary, contract, or deployment changes
5. ADRs under `docs/ai/decisions/` — only when a decision may conflict with prior ones
6. Monthly logs under `docs/ai/logs/` — only for historical continuity

Agents pass compact briefs between each other, not full documents or transcripts.

## Persistent Memory

Each project keeps AI-relevant memory under `docs/ai/`:

```text
docs/ai/
  README.md          # tiny router — not a summary dump
  architecture.md    # boundaries, invariants, structure
  decisions/         # ADRs (architecture decision records)
  logs/              # short monthly change logs
  plans/             # approved implementation plans
  backlog/           # shared task references
```

Store only durable information: approved plans, architecture decisions, and short monthly summaries. Never persist raw diffs, terminal output, or full transcripts.

Use `/issue` (backed by `gh-issue.ts`) for shared GitHub Issue operations: create, list, claim, assign, release, close, and prclose.

## Install the ai-config CLI

The one-shot installer downloads the compiled CLI and the `base/` snapshot, places them in a dedicated prefix, and registers the `bin` directory on your PATH.

**Linux / macOS:**

```bash
curl -fsSL https://github.com/Macacoders/ai-config/releases/latest/download/install.sh | sh
```

**Windows** (run from PowerShell; use `-ExecutionPolicy Bypass` if execution policy blocks remote scripts):

```powershell
powershell -c "irm https://github.com/Macacoders/ai-config/releases/latest/download/install.ps1 | iex"
```

Default prefix:

- Linux / macOS: `~/.ai-config`
- Windows: `%LOCALAPPDATA%\ai-config`

Installed layout:

```text
<prefix>/bin/ai-config
<prefix>/share/ai-config/base/**
<prefix>/share/ai-config/VERSION
<prefix>/installed-projects.json
```

### Install config into a repo

Once `ai-config` is on your PATH, install the runtime configuration into a target repository:

```bash
ai-config install --repo /path/to/your-project --providers openai
```

| Command | Purpose |
|---|---|
| `ai-config install --repo <path>` | Install ai-config runtime into a target repository |
| `ai-config uninstall --repo <path>` | Remove ai-config managed files from a target repository |
| `ai-config interactive` | Guided interactive installer |

Use `--dry-run` to preview, `--force` to regenerate managed files and override unmanaged agent/command/skill/plugin files that match a bundled template. Without `--force`, a matching unmanaged file triggers a one-time yes/no prompt (or a warning + preserve when non-interactive); user files with no bundled counterpart are never touched.

### Self-uninstall (remove the CLI)

```bash
# Preview
install.sh --uninstall --dry-run

# Remove
install.sh --uninstall
```

```powershell
# Preview
install.ps1 -Uninstall -DryRun

# Remove
install.ps1 -Uninstall
```

This removes the whole `<prefix>` directory and the exact PATH entry the installer added. Re-running is a no-op.

### Local development

When working from a clone of this repository, use the TypeScript source directly:

```bash
npx tsx cli/src/index.ts install --repo /path/to/your-project --providers openai
npx tsx cli/src/index.ts uninstall --repo /path/to/your-project
```

Run `make cli-binary` to compile a standalone binary (no Node.js required). On Windows, GNU Make is not preinstalled — install it with `choco install make`.

## Installation Model

Sources under `base/opencode/**` are the templates. The installer generates runtime files in each consuming project:

```text
<target-repo>/opencode.jsonc       # provider/model config (or kilo.jsonc for Kilo Code)
<target-repo>/.opencode/agents/**
<target-repo>/.opencode/commands/**
<target-repo>/.opencode/skills/**
<target-repo>/AGENTS.md            # repository-specific agent guidance
```

### Interactive install

For a guided walkthrough:

```bash
ai-config interactive
```

Prompts for target repo, runtime, providers (showing each option's auth requirements before selection), model preset (installer defaults vs faster responses), dry-run/force options, and an optional GitHub App Client ID — then shows a summary before installing.

### Non-interactive install examples

```bash
# Free tier (default)
ai-config install --repo /path/to/repo

# Specific provider
ai-config install --repo /path/to/repo --providers openai

# Multiple providers
ai-config install --repo /path/to/repo --providers openai,github-copilot

# Kilo Code
ai-config install --repo /path/to/repo --runtime kilocode --providers openai

# Pin to a release tag
ai-config install --repo /path/to/repo --ref v0.1.0 --providers openai
```

Optional `--model` and `--small-model` flags override generated defaults.

**Auth**: OpenAI and GitHub Copilot authenticate via `/connect` in OpenCode/Kilo Code. Laberit uses `OPENAI_BASE_URL` and `OPENAI_API_KEY` environment variables. Free tier requires no auth.

## Uninstall from a repo

Remove managed files from a target project:

```bash
# Preview
ai-config uninstall --repo /path/to/repo --dry-run

# Uninstall
ai-config uninstall --repo /path/to/repo
```

Only files tracked in `.ai-config-managed` are removed. User-created files, shell profile snippets, and the target repository itself are never touched.

## Releases & Versioning

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is in the `VERSION` file; releases are published as GitHub Releases with annotated tags.

`main` is the stable branch; `develop` is active development. To install from a specific release tag:

```bash
ai-config install --repo /path/to/repo --ref v0.1.0 --providers openai
```

See [`RELEASE.md`](./RELEASE.md) for the full release process and [`CHANGELOG.md`](./CHANGELOG.md) for version history.

## Contributing

Edit source templates under `base/opencode/**` — never the generated `.opencode/` files (they are gitignored and overwritten on reinstall). `base/AGENTS.md` is a generic template with `[FILL IN]` placeholders; root `AGENTS.md` is this repo's own curated guidance.

| To change... | Edit | Don't edit |
| :--- | :--- | :--- |
| Agents | `base/opencode/agents/**` | `.opencode/agents/**` |
| Skills | `base/opencode/skills/**` | `.opencode/skills/**` |
| Commands | `base/opencode/commands/**` | `.opencode/commands/**` |
| Agent doc template | `base/AGENTS.md` | Generated `.opencode/**` |
| Repo guidance | `AGENTS.md` (root) | `base/AGENTS.md` placeholders |
| Config generation | Installer scripts | `opencode.jsonc` (root) |

## Design Principles

- Keep installed configuration small and predictable.
- Separate planning from implementation — `planner` plans, `delivery` executes.
- Prefer explicit review gates for staged delivery.
- Persist decisions and architecture notes, not chat history.
- Use git evidence for review, not agent memory.
