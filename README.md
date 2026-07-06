# ai-config

`ai-config` is a project-local OpenCode configuration repository. It captures a small, repeatable AI-assisted development workflow around planning, phased implementation, critical testing review, and persistent project memory.

The repository is intentionally narrow:

- **Runtime**: OpenCode (default) or Kilo Code, selectable at install time.
- **Providers**: Free tier (default for opencode), OpenAI, GitHub Copilot, laberit, and OpenCode Go, selectable at install time (`free-tier`, `openai`, `github-copilot`, `laberit`, `opencode-go`, or comma-separated combinations).
- **Installation model**: generate/copy project-local OpenCode runtime files from reusable sources under `base/opencode/**`.
- **Context model**: progressive disclosure, where agents load indexes and targeted references instead of dumping whole documentation trees into context.

## Workflows

This setup supports two delivery workflows. **Staged delivery** is the default conservative workflow. **Quick delivery** handles clear, small, low-risk tasks where staged pauses would add unnecessary overhead. Quick delivery can be started with `/quick` or `planner` may proactively suggest it when the task is clearly eligible.

Use `/plan` when the work needs onboarding, planning, architecture or safety review, multiple files or phases, ambiguous decisions, migrations, dependency changes, deployment/release changes, or higher regression risk. Use `/quick` only when the task has a narrow outcome, obvious acceptance criteria, low risk, and safe local validation.

If a quick task turns out to be ambiguous, broad, security-sensitive, operationally risky, or otherwise outside its approved scope, it escalates back to staged delivery.

Staged delivery still follows phase economy. It should use the fewest phases that preserve clear, reviewable deliverables: 1 phase for simple or single-outcome work, 2-3 phases for moderate work, justification for more than 3 phases, explicit user confirmation for 6-8 phases, and task splitting instead of one large plan when the work appears to require more than 8 phases.

All delivery workflows follow a reuse-first contract. Before creating new repeatable logic, agents inspect reasonable existing patterns, utilities, scripts, helpers, commands, tests, and conventions within the approved scope. Suitable existing project patterns should be reused; new duplication must be justified or flagged as debt/risk. Agents should avoid both unnecessary copying and speculative abstraction or broad refactors.

Use `/issue` when the user wants to capture a problem, idea, or repository improvement as a GitHub Issue in the shared team tracker instead of implementing it immediately.

For shared task operations, each person/collaborator should use one responsible agent/session to interact with GitHub Issues for this repository.

### Staged delivery

The staged-delivery workflow keeps repository onboarding, planning, implementation, testing, and memory responsibilities separate.

1. Start with the `planner` agent or the `/plan` command.
2. For an existing or unfamiliar repository, run onboarding first with `/onboard-repo`.
3. `planner` invokes `research` to create or propose initial `docs/ai/` memory before feature planning.
4. Describe the feature, bug, refactor, or investigation.
5. `planner` performs a lightweight repository/documentation review.
6. `planner` asks clarifying questions before locking in ambiguous decisions.
7. `planner` classifies scope and creates the smallest useful implementation plan split into reviewable phases.
8. Each phase includes explicit acceptance criteria.
9. After user approval, `planner` prepares a compact handoff brief for one phase.
10. `planner` invokes a single `code` subagent session for that phase.
11. `code` implements the phase across atomic stages, stopping after each stage.
12. After every stage, `code` reports changes, proposes manual validation commands, and waits for user approval before continuing in the same child session.
13. When the phase is complete, `code` updates relevant project documentation and proposes a commit message.
14. `planner` reviews the phase using git status/diff/log tools and checks alignment with the approved plan.
15. `planner` distinguishes running existing validation, recommending tests, and creating new tests.
16. `planner` runs existing safe, relevant validation as needed, does not invoke `test` by default, and may close low-risk work with a clear no-test rationale.
17. `planner` may recommend tests only when it can name the observable behavior protected, concrete regression risk, why existing validation is insufficient, and the smallest useful test budget.
18. `planner` invokes `test` to write tests only when test creation is explicitly authorized (user request, approved acceptance criteria, or user-approved recommendation).
19. `test` critically reviews `code`'s work, identifies regression risks, and only creates tests within the approved test budget.
20. The workflow repeats for the next phase.
21. At the end, `planner` performs a final documentation, decisions, and change-log review.

### Quick delivery

1. Start with `/quick`, explicitly ask for quick delivery, or let `planner` proactively suggest it when the task is clearly quick-eligible.
2. If `planner` suggests quick delivery proactively, it explains the eligibility reasons and expected scope, then asks for explicit confirmation before proceeding.
3. `planner` classifies whether the request is eligible for quick delivery.
4. If eligible, `planner` prepares a compact quick handoff with approved scope, expected files, validation expectations, and escalation conditions.
5. `planner` invokes one `quickcode` subagent session.
6. `quickcode` completes the approved low-risk task without staged pauses, using autonomous edits and allowlisted validation/git inspection commands only.
7. `quickcode` reports once for `planner` review.
8. `planner` reviews the result with git status/diff/log evidence before responding to the user.

## Ponytail Reuse-First Discipline

ai-config integrates the [ponytail](https://github.com/DietrichGebert/ponytail) reuse-first discipline. Before writing any new code, agents climb a 7-rung ladder:

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

### Intensity Levels

| Mode | Behavior |
|------|----------|
| `off` | No reuse-first injection |
| `lite` | Gentle reminder to prefer reuse |
| `full` | Standard 7-rung ladder (default) |
| `ultra` | Strict — no new code without rung justification |

### Commands

| Command | Purpose |
|---------|---------|
| `/ponytail [mode]` | Switch intensity (persists across sessions) |
| `/ponytail-review` | Review current diff for over-engineering |
| `/ponytail-audit` | Whole-repository audit |
| `/ponytail-debt` | Harvest `ponytail:` comments into a debt ledger |
| `/ponytail-gain` | Impact scoreboard |
| `/ponytail-help` | Quick reference |

### Configuration

- Default mode: `full`
- Override via `PONYTAIL_DEFAULT_MODE` env var
- Disable entirely: `/ponytail off` or `PONYTAIL_DEFAULT_MODE=off`
- Mode persists in `~/.config/opencode/.ponytail-active`
- The ponytail plugin injects ladder rules into the system prompt at the configured intensity

## Agents

The target OpenCode setup uses one primary agent and five specialized subagents.

| Agent | Mode | Purpose | Preferred model | Reasoning / verbosity |
| :--- | :--- | :--- | :--- | :--- |
| `planner` | Primary | Planning, research, questions, phase design, handoffs, git-based review, memory updates. | `openai/gpt-5.5` / `github-copilot/gpt-5.4` / `laberit/laberit-ai-preview` / `opencode-go/deepseek-v4-pro` | Medium / medium |
| `research` | Subagent | Onboards existing repositories and creates or proposes initial `docs/ai/` memory before implementation planning. | `github-copilot/gpt-5.4` / `openai/gpt-5.5` / `laberit/laberit-ai-preview` / `opencode-go/qwen3.7-max` | Medium / low |
| `code` | Subagent | Implements one approved phase across atomic stages and pauses after each stage for manual validation. | `openai/gpt-5.5` / `github-copilot/gpt-5.3-codex` / `laberit/laberit-ai` / `opencode-go/kimi-k2.7-code` | Medium / low |
| `quickcode` | Subagent | Implements one approved quick-delivery task autonomously within narrow low-risk scope, then reports once for planner review. | `openai/gpt-5.5` / `github-copilot/gpt-5.3-codex` / `laberit/laberit-ai` / `opencode-go/deepseek-v4-flash` | Low / low |
| `test` | Subagent | Critically reviews implementation quality and regression risk; recommends tests when justified and writes new tests only with explicit approval. | `github-copilot/gpt-5.4` / `openai/gpt-5.5` / `laberit/laberit-ai-preview` / `opencode-go/qwen3.7-plus` | Medium / low |
| `taskanalyst` | Subagent | Interprets problem reports and improvement ideas before shared task issue creation. | `github-copilot/gemini-3.5-flash` / `openai/gpt-5.4-mini` / `laberit/laberit-ai` / `opencode-go/mimo-v2.5` | Low / low |

The default model policy balances reasoning quality, implementation fit, and subscription stability. OpenAI defaults use documented general GPT models (`openai/gpt-5.5` and lightweight `openai/gpt-5.4-mini`) instead of Codex or undocumented fast-model IDs so ChatGPT Plus/Pro installs avoid known account-availability failures. OpenAI + GitHub Copilot installs keep planning and implementation on OpenAI (`planner`, `code`, `quickcode`), while Copilot handles repository research, testing review, lightweight `small_model` work, and shared-task analysis with Gemini Flash. Codex-oriented models such as `openai/gpt-5.3-codex` remain manual overrides only when `/models` shows the connected account exposes them. Keep `github-copilot/claude-opus-4.6` as a manual escalation option for unusually difficult review/research tasks where latency and quota use are acceptable. Reasoning, verbosity, and step limits are centralized under each generated `opencode.jsonc` `agent` entry rather than in agent-file frontmatter. Model availability still depends on what OpenCode exposes after `/connect` and the connected subscription.

**Switching providers**: You can switch between OpenAI, GitHub Copilot, laberit, and OpenCode Go models interactively:

- `/model openai/gpt-5.5` - Use OpenAI (default)
- `/model github-copilot/gpt-5.4` - Use GitHub Copilot
- `/model laberit/laberit-ai` - Use laberit AI
- `/model opencode-go/deepseek-v4-pro` - Use OpenCode Go

Model availability depends on what OpenCode exposes after `/connect`. If a preferred model is unavailable, choose the closest available reasoning/coding model with `/models`.

## Progressive Disclosure

Agents must avoid loading all repository memory by default.

The standard loading order is:

1. Read the user's task and the repository root `README.md`.
2. Read `docs/ai/README.md` if present.
3. Load the active plan only when working on an existing feature/bug/refactor.
4. Load architecture notes only when the task touches structure, module boundaries, data flow, deployment, or public contracts.
5. Load ADRs only when a decision may conflict with or extend previous decisions.
6. Load logs only for historical continuity, incident follow-up, or unresolved regressions.

Handoffs between agents should pass compact briefs with paths and reasons to load references. They should not paste whole documents, terminal logs, or diffs unless the user explicitly asks.

When memory lookup or maintenance is needed, route through `/memory` so `planner` can keep updates targeted and low-token.

## Persistent Memory

Target projects may keep AI-relevant memory under `docs/ai/`.

`docs/ai/README.md` should stay tiny and act as a router: guide targeted loading, not a large summary dump.

Recommended structure:

```text
docs/ai/
  README.md
  architecture.md
  backlog/
    README.md
  decisions/
    ADR-0001-example.md
  logs/
    YYYY-MM.md
  plans/
    YYYY-MM-DD-short-task-name.md
```

Use this memory for durable information only:

- Approved plans and phase status.
- Shared repository improvement task references in GitHub Issues with status, priorities, goals, and acceptance criteria.
- Architecture boundaries and invariants.
- Decisions that affect future work.
- Tradeoffs and rejected alternatives.
- Short monthly change logs.

Use GitHub Issues as the operational source of truth for shared repository work (create, claim, release, close).

Use `/issue` to create, list, claim, assign, release, close, and prclose shared GitHub issue work.

Shared issue tooling boundary: `gh-issue.ts` is the single helper wrapper for GitHub issue operations.

Do not store full chat transcripts, long terminal output, raw diffs, or trivial implementation notes.

## CLI Installer (TypeScript)

The recommended way to install ai-config is via the TypeScript CLI, which replaces the legacy dual-platform shell installers with a single cross-platform tool.

### Quick install

```bash
npx tsx cli/src/index.ts install --repo /path/to/your-project --providers openai
```

The `install/bootstrap.sh` entrypoint is a thin wrapper that auto-downloads a pre-built standalone binary (no Node.js required) or falls back to `npx tsx` if Node.js is available:

```bash
./install/bootstrap.sh --repo /path/to/your-project --providers openai
```

### CLI commands

| Command | Purpose |
|---|---|
| `npx tsx cli/src/index.ts install` | Install ai-config into a target repository |
| `npx tsx cli/src/index.ts uninstall` | Remove ai-config managed files |
| `npx tsx cli/src/index.ts interactive` | Guided interactive installer |

All flags from the legacy shell installers are supported, plus `--gh-app-client-id` and `--no-track`.

### Binary download (no Node.js required)

Run `make cli-binary` to compile a standalone binary for your platform. The thin `install/bootstrap.sh` wrapper uses a 4-tier fallback chain: local binary → cached release → GitHub download → `npx tsx`.

## Installation Model

This repository keeps reusable OpenCode sources under `base/opencode/**` and generates project-local runtime configuration in each consuming repository.

Installer entrypoints remain `install/bootstrap.sh` and `install/bootstrap.ps1`; managed sync helper implementations are kept in `install/lib/managed_sync.sh` and `install/lib/managed_sync.ps1`.

Expected generated/local output in a target repository:

```text
<target-repo>/opencode.jsonc  (or <target-repo>/kilo.jsonc for Kilo Code)
<target-repo>/.opencode/agents/**
<target-repo>/.opencode/commands/**
<target-repo>/.opencode/skills/**
<target-repo>/AGENTS.md
```

`opencode.jsonc` is generated per installation and acts as the provider/model brain, including centralized per-agent model assignments under the `agent` section. Provider config blocks used by both installers are sourced from `base/opencode/config/providers/*-provider-block.jsonc`. The `.opencode/` directory, `AGENTS.md`, and provider/model logic are identical for both runtimes — only the runtime configuration filename (`opencode.jsonc` vs `kilo.jsonc`) differs. Existing local runtime config is preserved by default; with `--force` / `-Force`, it is refreshed only when the existing file is ai-config-managed.

Shared workflow helpers that commands depend on should live inside the installed `.opencode/skills` surface (for example `.opencode/skills/shared-task/scripts/gh-issue`). Consuming repositories should not need a top-level `scripts/` directory for shared task workflows.

Provider-selectable installation commands:

### Guided interactive install (Bash and PowerShell)

Use the interactive wrapper when you want safe numbered choices instead of manually composing flags:

```bash
./install/bootstrap-interactive.sh
```

```powershell
.\install\bootstrap-interactive.ps1
```

The interactive installer prompts for:

- target repository path
- runtime (`opencode` or `kilocode`)
- provider set (safe numbered presets; free-tier is the default for opencode)
- model preset
- agent preset (`balanced`, `fast`, `thorough`)
- `dry-run`
- `force`

It prints provider connection instructions during install but does **not** run authentication automatically. The free-tier option requires no connection steps.

- OpenAI and GitHub Copilot auth are still completed in OpenCode/Kilo Code via `/connect`.
- laberit still requires local environment variables (`OPENAI_BASE_URL`, `OPENAI_API_KEY`).

### Non-interactive install commands

**Linux/macOS:**

```bash
# Free tier only (default for opencode, no external provider needed)
./install/bootstrap.sh --repo /path/to/repo

# Explicit free tier
./install/bootstrap.sh --repo /path/to/repo --providers free-tier

# OpenAI only
./install/bootstrap.sh --repo /path/to/repo --providers openai

# GitHub Copilot only
./install/bootstrap.sh --repo /path/to/repo --providers github-copilot

# laberit only
./install/bootstrap.sh --repo /path/to/repo --providers laberit

# OpenCode Go
./install/bootstrap.sh --repo /path/to/repo --providers opencode-go

# Free tier + OpenAI (opencode runtime with openai provider)
./install/bootstrap.sh --repo /path/to/repo --providers free-tier,openai

# OpenAI + laberit
./install/bootstrap.sh --repo /path/to/repo --providers openai,laberit

# Kilo Code (Opencode fork) — free-tier not available for kilocode
./install/bootstrap.sh --repo /path/to/repo --runtime kilocode --providers openai

# OpenAI + GitHub Copilot
./install/bootstrap.sh --repo /path/to/repo --providers openai,github-copilot

# OpenAI + GitHub Copilot + laberit
./install/bootstrap.sh --repo /path/to/repo --providers openai,github-copilot,laberit
```

**Windows (PowerShell):**

```powershell
# Free tier only (default for opencode, no external provider needed)
.\install\bootstrap.ps1 -Repo /path/to/repo

# Explicit free tier
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers free-tier

# OpenAI only
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai

# GitHub Copilot only
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers github-copilot

# laberit only
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers laberit

# OpenCode Go
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers opencode-go

# Free tier + OpenAI (opencode runtime with openai provider)
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers free-tier,openai

# OpenAI + laberit
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,laberit

# Kilo Code (Opencode fork) — free-tier not available for kilocode
.\install\bootstrap.ps1 -Repo /path/to/repo -Runtime kilocode -Providers openai

# OpenAI + GitHub Copilot
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,github-copilot

# OpenAI + GitHub Copilot + laberit
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,github-copilot,laberit
```

Optional overrides:

- `--model` / `-Model` to override the generated default model (`<provider>/<model>` format).
- `--small-model` / `-SmallModel` to override the generated lightweight `small_model` value.
- `--agent-preset` / `-AgentPreset` to select `balanced` (default behavior), `fast`, or `thorough` agent profile generation (model/steps plus safe reasoning/verbosity options where configured providers support them).

Conservative installer policy:

- Use `--dry-run` / `-DryRun` to preview changes before modifying a target repository.
- Do not overwrite unmanaged existing files/directories by default.
- **Re-install without `--force`**: `AGENTS.md` and runtime config (`opencode.jsonc` / `kilo.jsonc`) are **never modified** — existing content is preserved as-is. Managed files under `.opencode/agents/**`, `.opencode/commands/**`, and `.opencode/skills/**` are refreshed from source templates to receive updates.
- **Re-install with `--force` / `-Force`**: All managed output is regenerated as a fresh installation — `AGENTS.md` is copied from source template, runtime config is generated from scratch, and all agent/command/skill files are refreshed. User-modified files that lack the ai-config managed header are still overwritten when `--force` is used.
- The `.opencode/` subdirectory is treated as a managed overlay: ai-config-managed files are refreshed, while custom entries not tracked by the manifest are preserved.

Configuration and secrets boundary:

- **Reusable source config in this repo**: versioned templates/source under `base/opencode/**`.
- **Generated local config in consuming repos**: local `opencode.jsonc`, `.opencode/**`, and `AGENTS.md` runtime output.
- **Secrets/auth**:
  - OpenAI authentication is handled in OpenCode via `/connect` (ChatGPT Plus/Pro or Azure credentials).
  - GitHub Copilot authentication is handled in OpenCode via `/connect` (device login flow).
  - laberit uses environment variables documented in `profiles/defaults.env.example`: `OPENAI_BASE_URL`, `OPENAI_API_KEY`.

## Uninstall

ai-config provides `install/uninstall.sh` (Bash) and `install/uninstall.ps1` (PowerShell) to remove managed files from a target project.

**What is removed:**

- Every file listed in the target project's `.ai-config-manifest` (the manifest is always under the repo root).
- The `.ai-config-manifest` file itself.
- Any parent directories that become empty after file removal, walking up to (but not including) the repo root.
- The matching entry in `installed-projects.json` at the ai-config root. If the removed project was the only entry, the tracking file is removed entirely.

**What is NOT removed:**

- **User-created files** — only files tracked in `.ai-config-manifest` are touched. Any file you added or modified outside the manifest stays.
- **Shell profile snippets** — `install/bashrc_snippet.sh` and `install/powershell_profile_snippet.ps1` are sourced manually. They must be removed from `~/.bashrc` or `$PROFILE` by hand.
- **The target repository itself** — even if the repo becomes empty, it is not deleted.

**Dry-run as safety mechanism:**

There is no confirmation prompt. Use `--dry-run` / `-DryRun` to preview what would be removed before running the full uninstall.

**Linux/macOS:**

```bash
# Preview
./install/uninstall.sh --repo /path/to/repo --dry-run

# Uninstall
./install/uninstall.sh --repo /path/to/repo
```

**Windows (PowerShell):**

```powershell
# Preview
.\install\uninstall.ps1 -Repo C:\path\to\repo -DryRun

# Uninstall
.\install\uninstall.ps1 -Repo C:\path\to\repo
```

**Snippet helpers (Bash):**

```bash
ai-uninstall-repo /path/to/repo
ai-uninstall-repo-dry-run /path/to/repo
```

**Snippet helpers (PowerShell):**

```powershell
Uninstall-AIConfigRepo -RepoPath C:\path\to\repo
ai-uninstall-repo C:\path\to\repo

Uninstall-AIConfigRepoDryRun -RepoPath C:\path\to\repo
ai-uninstall-repo-dry-run C:\path\to\repo
```

After uninstalling, you can re-install with `install/bootstrap.sh` or `install/bootstrap.ps1` at any time.

## Releases & Versioning

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`vMAJOR.MINOR.PATCH`). Pre-1.0 versions (`0.x.y`) indicate initial development where breaking changes may occur between minor versions.

The version is tracked in the `VERSION` file at the repository root (plain `0.1.0` without the `v` prefix). Releases are published as GitHub Releases with corresponding annotated tags (`v0.1.0`, `v0.2.0`, etc.). See the [Releases page](https://github.com/Macacoders/ai-config/releases) for the latest stable version and release notes.

Branch model: `main` is the stable branch reflecting the latest release; `develop` is the active development branch. All feature work merges into `develop` first, and releases are cut from `develop` into `main`.

**Consuming a release**: To install `ai-config` into a consuming repository from a specific release tag, use the `--ref` flag (or `-Ref` in PowerShell). Without `--ref`, the installer uses the local ai-config source tree — this is the development mode for working on ai-config itself.

```bash
./install/bootstrap.sh --repo /path/to/repo --ref v0.1.0 --providers openai
```

```powershell
.\install\bootstrap.ps1 -Repo /path/to/repo -Ref v0.1.0 -Providers openai
```

When `--ref` is specified, the installer clones the ai-config repository at that tag and installs from the release source, recording `ref:` in `.ai-config-managed`. Pinning to a specific tag is recommended for reproducible installs in production consuming repositories.

For the full release process — including version updates, changelog management, tagging, and first-release procedure — see [`RELEASE.md`](./RELEASE.md). Notable changes per release are documented in [`CHANGELOG.md`](./CHANGELOG.md).

## Contributing

**When working on the ai-config repository itself**, durable changes to agents, skills, commands, and generated config logic should be made to the **source templates** under `base/opencode/**` and `base/AGENTS.md`.

Keep `base/AGENTS.md` generic with `[FILL IN]` placeholders. During onboarding in consuming repositories, `/onboard-repo` + `research` are responsible for filling repository-specific guidance into each target repository's root `AGENTS.md`.

In this repository specifically, root `AGENTS.md` is curated repo-specific guidance and may be updated when ai-config repository guidance changes.

### Why this matters

- `base/opencode/**` contains the source-of-truth templates that get copied/generated into consuming repositories
- `.opencode/**` is generated local runtime output in this repository and is gitignored
- `base/AGENTS.md` is the generic placeholder template used by onboarding to produce repository-specific root `AGENTS.md` guidance in consuming repositories
- root `AGENTS.md` in this repository is curated repo-specific guidance
- Changes made directly to `.opencode/` files are **not persistent**; they will be lost the next time the installation scripts run or when the repository is cloned fresh
- The installation model (described above) treats `base/opencode/` as the reusable source and `.opencode/` as the per-project runtime
- `opencode.jsonc` is generated from code in the installation scripts, not copied from a template

### What to edit

| If you want to change... | Edit this location | Do not edit |
| :--- | :--- | :--- |
| Agents | `base/opencode/agents/**` | `.opencode/agents/**` |
| Skills | `base/opencode/skills/**` | `.opencode/skills/**` |
| Commands | `base/opencode/commands/**` | `.opencode/commands/**` |
| Agent documentation template | `base/AGENTS.md` | `.opencode/**` generated output |
| ai-config repo guidance | `AGENTS.md` (root) | `base/AGENTS.md` placeholders |
| Configuration | `install/bootstrap.sh` and `install/bootstrap.ps1` | `opencode.jsonc` (root) |

## Handoff Contracts

`planner` should hand off unfamiliar repository onboarding to `research` before creating implementation plans:

```md
## Research Handoff Brief

Goal:
Repository state:
Known docs or entrypoints:
Areas to inspect:
Memory files to create or update:
Constraints:
Expected output:
```

`research` must not modify product code or plan feature work. It may create or update `docs/ai/**` memory when approved.

`planner` should hand off one approved phase to `code` using a compact brief. Atomic stages are checkpoints inside a phase, not new phases:

```md
## Code Handoff Brief

Phase:
Goal:
Acceptance criteria:
Atomic stages:
Relevant files:
Confirmed decisions:
Constraints:
References to load:
Stop rule:
```

`code` owns exactly one phase per child session. It must stop after each atomic stage and wait for explicit user approval before continuing.

If planning would require more than 8 phases, `planner` should not produce one large implementation plan. It should explain why the request is too large, propose smaller task splits, and ask which task to plan first.

For quick delivery, `planner` should hand off one approved low-risk task to `quickcode`:

```md
## Quick Code Handoff Brief

Task:
Goal:
Acceptance criteria:
Approved scope:
Expected files:
References to load:
Validation expectations:
Escalation conditions:
Constraints:
```

`quickcode` is a subagent invoked by `planner`, not a primary starting point for users. It may edit autonomously within the approved scope and run allowlisted validation/git inspection commands, but it must not invoke subagents, commit, install dependencies, edit secrets, or broaden scope.

`planner` should hand off testing work to `test` only when review indicates meaningful regression risk or missing coverage. New test creation is strictly opt-in:

```md
## Test Handoff Brief

Phase:
Acceptance criteria:
Changed files:
Risk areas:
Existing validation:
Mode:
New tests approved:
Approval source:
Test budget:
Allowed test types:
References to load:
Expected output:
```

`Mode` must be `review-only`, `recommend-only`, or `write-tests`.

`test` must not create or modify test files unless `New tests approved: yes` and mode is `write-tests`.

`Test budget` must be concrete and minimal. Use `none` when new tests are not approved or not needed; avoid vague budgets such as "add relevant tests".

`test` must be critical. It should challenge assumptions, identify untested behavior, and prefer focused tests that validate observable outcomes instead of implementation details. It should also say `No new tests needed` when the change is docs-only, configuration-only, mechanical, already covered by existing validation, or does not change observable behavior.

`planner` should hand off shared task analysis to `taskanalyst` before creating new GitHub Issues:

```md
## Task Analysis Brief

Raw request:
Repository root:
Workflow references:
Known context:
Constraints:
Expected output:
```

`taskanalyst` must not edit files or create implementation plans.

For shared team task operations, use GitHub Issues through `/issue` (`create`, `list`, `claim`, `assign`, `release`, `close`, `prclose`). Track claim state with assignee + status labels (`status:to-do`, `status:doing`, `status:blocked`) and short comments.

## Repository Direction

This repository has been simplified around the OpenCode setup described above.

The old multi-runtime structure has been replaced:

- VS Code Copilot adapters were removed.
- Tool-agnostic role files that are no longer installed were removed.
- Broad skill categories were replaced with one staged delivery workflow skill.
- Profile-specific templates were replaced with a single OpenCode-oriented project template.
- The bootstrap script now focuses on provider-selectable generated OpenCode project-local output.

## Design Principles

- Keep the installed configuration small and predictable.
- Prefer explicit phase gates for staged delivery and reserve autonomous quick delivery for approved low-risk tasks.
- Preserve user control through staged manual checkpoints or planner review of quick-delivery results.
- Keep planning context separate from implementation context.
- Persist decisions and architecture notes, not chat history.
- Use git evidence for review instead of relying on agent memory.
