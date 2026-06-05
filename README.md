# ai-config

`ai-config` is a project-local OpenCode configuration repository. It captures a small, repeatable AI-assisted development workflow around planning, phased implementation, critical testing review, and persistent project memory.

The repository is intentionally narrow:

- **Runtime**: OpenCode (default) or Kilo Code, selectable at install time.
- **Providers**: OpenAI (default), GitHub Copilot, and laberit, selectable at install time (`openai`, `github-copilot`, `laberit`, or comma-separated combinations).
- **Installation model**: generate/copy project-local OpenCode runtime files from reusable sources under `base/opencode/**`.
- **Context model**: progressive disclosure, where agents load indexes and targeted references instead of dumping whole documentation trees into context.

## Workflows

This setup supports two delivery workflows. **Staged delivery** is the default conservative workflow. **Quick delivery** handles clear, small, low-risk tasks where staged pauses would add unnecessary overhead. Quick delivery can be started with `/quick` or `planner` may proactively suggest it when the task is clearly eligible.

Use `/plan` when the work needs onboarding, planning, architecture or safety review, multiple files or phases, ambiguous decisions, migrations, dependency changes, deployment/release changes, or higher regression risk. Use `/quick` only when the task has a narrow outcome, obvious acceptance criteria, low risk, and safe local validation.

If a quick task turns out to be ambiguous, broad, security-sensitive, operationally risky, or otherwise outside its approved scope, it escalates back to staged delivery.

Staged delivery still follows phase economy. It should use the fewest phases that preserve clear, reviewable deliverables: 1 phase for simple or single-outcome work, 2-3 phases for moderate work, justification for more than 3 phases, explicit user confirmation for 6-8 phases, and task splitting instead of one large plan when the work appears to require more than 8 phases.

Use `/newtask` when the user wants to capture a problem, idea, or repository improvement as a GitHub Issue in the shared team tracker instead of implementing it immediately. Use `/tasks` for list/claim/release/close operations.

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

## Agents

The target OpenCode setup uses one primary agent and five specialized subagents.

| Agent | Mode | Purpose | Preferred model | Reasoning / verbosity |
| :--- | :--- | :--- | :--- | :--- |
| `planner` | Primary | Planning, research, questions, phase design, handoffs, git-based review, memory updates. | `openai/gpt-5.5` / `github-copilot/gpt-5.4` / `laberit/laberit-ai-preview` | Medium / medium |
| `research` | Subagent | Onboards existing repositories and creates or proposes initial `docs/ai/` memory before implementation planning. | `github-copilot/gpt-5.4` / `openai/gpt-5.5-fast` / `laberit/laberit-ai-preview` | Medium / low |
| `code` | Subagent | Implements one approved phase across atomic stages and pauses after each stage for manual validation. | `openai/gpt-5.3-codex` / `github-copilot/gpt-5.3-codex` / `laberit/laberit-ai` | Medium / low |
| `quickcode` | Subagent | Implements one approved quick-delivery task autonomously within narrow low-risk scope, then reports once for planner review. | `openai/gpt-5.3-codex` / `github-copilot/gpt-5.3-codex` / `laberit/laberit-ai` | Low / low |
| `test` | Subagent | Critically reviews implementation quality and regression risk; recommends tests when justified and writes new tests only with explicit approval. | `github-copilot/gpt-5.4` / `openai/gpt-5.5-fast` / `laberit/laberit-ai-preview` | Medium / low |
| `taskanalyst` | Subagent | Interprets problem reports and improvement ideas before shared task issue creation. | `github-copilot/gemini-3.5-flash` / `openai/gpt-5.5-fast` / `laberit/laberit-ai` | Low / low |

The default model policy balances reasoning quality, implementation fit, and subscription stability. OpenAI + GitHub Copilot installs keep planning and implementation on OpenAI (`planner`, `code`, `quickcode`), while Copilot handles repository research, testing review, lightweight `small_model` work, and shared-task analysis with Gemini Flash. Thinking-oriented agents stay on stronger reasoning models, implementation agents use Codex-oriented models, and `test` uses a review-oriented model rather than a coding model. Keep `github-copilot/claude-opus-4.6` as a manual escalation option for unusually difficult review/research tasks where latency and quota use are acceptable. Reasoning, verbosity, and step limits are centralized under each generated `opencode.jsonc` `agent` entry rather than in agent-file frontmatter. Model availability still depends on what OpenCode exposes after `/connect` and the connected subscription.

**Switching providers**: You can switch between OpenAI, GitHub Copilot, and laberit models interactively:

- `/model openai/gpt-5.5` - Use OpenAI (default)
- `/model github-copilot/gpt-5.4` - Use GitHub Copilot
- `/model laberit/laberit-ai` - Use laberit AI

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

Use `/newtask` to create shared tasks as GitHub Issues. Use `/tasks` to list, claim, release, and close shared work.

Do not store full chat transcripts, long terminal output, raw diffs, or trivial implementation notes.

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

### Guided interactive install (Bash-first)

Use the interactive wrapper when you want safe numbered choices instead of manually composing flags:

```bash
./install/bootstrap-interactive.sh
```

The interactive installer prompts for:

- target repository path
- runtime (`opencode` or `kilocode`)
- provider set (safe numbered presets)
- model preset
- agent preset (`balanced`, `fast`, `thorough`)
- `dry-run`
- `force`

It prints provider connection instructions during install but does **not** run authentication automatically.

- OpenAI and GitHub Copilot auth are still completed in OpenCode/Kilo Code via `/connect`.
- laberit still requires local environment variables (`OPENAI_BASE_URL`, `OPENAI_API_KEY`).

PowerShell interactive parity is a follow-up. For Windows today, use the existing non-interactive `install/bootstrap.ps1` path.

### Non-interactive install commands

**Linux/macOS:**

```bash
# OpenAI only (default)
./install/bootstrap.sh --repo /path/to/repo --providers openai

# GitHub Copilot only
./install/bootstrap.sh --repo /path/to/repo --providers github-copilot

# laberit only
./install/bootstrap.sh --repo /path/to/repo --providers laberit

# OpenAI + laberit
./install/bootstrap.sh --repo /path/to/repo --providers openai,laberit

# Kilo Code (Opencode fork)
./install/bootstrap.sh --repo /path/to/repo --runtime kilocode --providers openai

# OpenAI + GitHub Copilot
./install/bootstrap.sh --repo /path/to/repo --providers openai,github-copilot

# OpenAI + GitHub Copilot + laberit
./install/bootstrap.sh --repo /path/to/repo --providers openai,github-copilot,laberit
```

**Windows (PowerShell):**

```powershell
# OpenAI only (default)
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai

# GitHub Copilot only
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers github-copilot

# laberit only
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers laberit

# OpenAI + laberit
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,laberit

# Kilo Code (Opencode fork)
.\install\bootstrap.ps1 -Repo /path/to/repo -Runtime kilocode -Providers openai

# OpenAI + GitHub Copilot
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,github-copilot

# OpenAI + GitHub Copilot + laberit
.\install\bootstrap.ps1 -Repo /path/to/repo -Providers openai,github-copilot,laberit
```

Optional overrides:

- `--model` / `-Model` to override the generated default model (`<provider>/<model>` format).
- `--small-model` / `-SmallModel` to override the generated lightweight `small_model` value.
- `--agent-preset` (Bash only currently) to select `balanced` (default behavior), `fast`, or `thorough` agent profile generation (model/steps plus safe reasoning/verbosity options where configured providers support them).

Conservative installer policy:

- Use `--dry-run` / `-DryRun` to preview changes before modifying a target repository.
- Do not overwrite unmanaged existing files/directories by default.
- Installer updates use safe overlay for `.opencode/agents`, `.opencode/commands`, and `.opencode/skills`: ai-config-managed files are refreshed, while custom entries are preserved.
- With `--force` / `-Force`, refresh managed output (including legacy managed-tree paths) but still preserve unmanaged user-owned config such as custom `.opencode/**` entries and unmanaged `AGENTS.md`.

Configuration and secrets boundary:

- **Reusable source config in this repo**: versioned templates/source under `base/opencode/**`.
- **Generated local config in consuming repos**: local `opencode.jsonc`, `.opencode/**`, and `AGENTS.md` runtime output.
- **Secrets/auth**:
  - OpenAI authentication is handled in OpenCode via `/connect` (ChatGPT Plus/Pro or Azure credentials).
  - GitHub Copilot authentication is handled in OpenCode via `/connect` (device login flow).
  - laberit uses environment variables documented in `profiles/defaults.env.example`: `OPENAI_BASE_URL`, `OPENAI_API_KEY`.

## Contributing

**When working on the ai-config repository itself**, all changes to agents, skills, commands, and configuration must be made to the **source templates** under `base/opencode/**` (or `templates/**` for `AGENTS.md`).

**Never edit files under `.opencode/` or `AGENTS.md`** when contributing to this repository.

### Why this matters

- `base/opencode/**` contains the source-of-truth templates that get copied/generated into consuming repositories
- `.opencode/**` and `AGENTS.md` are **generated output** — they are produced by the installation scripts and are gitignored in this repository
- Changes made directly to `.opencode/` files are **not persistent**; they will be lost the next time the installation scripts run or when the repository is cloned fresh
- The installation model (described above) treats `base/opencode/` as the reusable source and `.opencode/` as the per-project runtime
- `opencode.jsonc` is generated from code in the installation scripts, not copied from a template

### What to edit

| If you want to change... | Edit this location | Do not edit |
| :--- | :--- | :--- |
| Agents | `base/opencode/agents/**` | `.opencode/agents/**` |
| Skills | `base/opencode/skills/**` | `.opencode/skills/**` |
| Commands | `base/opencode/commands/**` | `.opencode/commands/**` |
| Agent documentation | `templates/AGENTS.md` | `AGENTS.md` (root) |
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

For shared team task operations, use GitHub Issues through `/newtask` (create) and `/tasks` (list, claim, release, close). Track claim state with assignee + status labels (`status:to-do`, `status:doing`, `status:blocked`) and short comments.

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
