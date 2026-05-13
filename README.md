# ai-config

`ai-config` is a project-local OpenCode configuration repository. It captures a small, repeatable AI-assisted development workflow around planning, phased implementation, critical testing review, and persistent project memory.

The repository is intentionally narrow:

- **Runtime**: OpenCode only.
- **Providers**: OpenAI (default) and Kimi25, authenticated in OpenCode with `/connect` using ChatGPT Plus/Pro or Azure credentials.
- **Installation model**: per-project symlinks, so target repositories keep ownership of their files and can opt in without copying this repository.
- **Context model**: progressive disclosure, where agents load indexes and targeted references instead of dumping whole documentation trees into context.

## Workflows

This setup supports two delivery workflows. **Staged delivery** is the default conservative workflow. **Quick delivery** is opt-in for clear, small, low-risk tasks where staged pauses would add unnecessary overhead.

Use `/plan` when the work needs onboarding, planning, architecture or safety review, multiple files or phases, ambiguous decisions, migrations, dependency changes, deployment/release changes, or higher regression risk. Use `/quick` only when the task has a narrow outcome, obvious acceptance criteria, low risk, and safe local validation.

If a quick task turns out to be ambiguous, broad, security-sensitive, operationally risky, or otherwise outside its approved scope, it escalates back to staged delivery.

### Staged delivery

The staged-delivery workflow keeps repository onboarding, planning, implementation, testing, and memory responsibilities separate.

1. Start with the `planner` agent or the `/plan` command.
2. For an existing or unfamiliar repository, run onboarding first with `/onboard-repo`.
3. `planner` invokes `research` to create or propose initial `docs/ai/` memory before feature planning.
4. Describe the feature, bug, refactor, or investigation.
5. `planner` performs a lightweight repository/documentation review.
6. `planner` asks clarifying questions before locking in ambiguous decisions.
7. `planner` creates an implementation plan split into phases.
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

1. Start with `/quick` or explicitly ask for quick delivery.
2. `planner` classifies whether the request is eligible for quick delivery.
3. If eligible, `planner` prepares a compact quick handoff with approved scope, expected files, validation expectations, and escalation conditions.
4. `planner` invokes one `quickcode` subagent session.
5. `quickcode` completes the approved low-risk task without staged pauses, using autonomous edits and allowlisted validation/git inspection commands only.
6. `quickcode` reports once for `planner` review.
7. `planner` reviews the result with git status/diff/log evidence before responding to the user.

## Agents

The target OpenCode setup uses one primary agent and four specialized subagents.

| Agent | Mode | Purpose | Preferred model | Reasoning |
| :--- | :--- | :--- | :--- | :--- |
| `planner` | Primary | Planning, research, questions, phase design, handoffs, git-based review, memory updates. | `openai/gpt-5.5` | Medium |
| `research` | Subagent | Onboards existing repositories and creates or proposes initial `docs/ai/` memory before implementation planning. | `openai/gpt-5.5-fast` | Medium |
| `code` | Subagent | Implements one approved phase across atomic stages and pauses after each stage for manual validation. | `openai/gpt-5.3-codex` | Medium |
| `quickcode` | Subagent | Implements one approved quick-delivery task autonomously within narrow low-risk scope, then reports once for planner review. | `openai/gpt-5.3-codex` | Low |
| `test` | Subagent | Critically reviews implementation quality and regression risk; recommends tests when justified and writes new tests only with explicit approval. | `openai/gpt-5.5-fast` | Medium |

The default model policy balances reasoning quality and implementation cost: planning/research stay on the GPT-5.5 family with medium reasoning, implementation agents use Codex-oriented models, and `test` stays on GPT-5.5-fast for independent critical review rather than Codex. Use `openai/gpt-5.5-pro` only for unusually difficult research or review tasks where latency and cost are acceptable. Use `openai/gpt-5.4-mini-fast` for OpenCode's lightweight `small_model` setting when available in your connected account.

**Switching providers**: You can switch between OpenAI and Kimi models interactively:
- `/model openai/gpt-5.5` - Use OpenAI (default)
- `/model kimi25/Kimi-K2.5` - Use Kimi K2.5 via Azure

**Provider-specific agents**: You can also configure specific agents to use different providers by modifying their model assignments in `opencode.jsonc`.

Model availability depends on what OpenCode exposes after `/connect`. If a preferred model is unavailable, choose the closest available reasoning/coding model with `/models`.

## Provider Configuration

This configuration supports multiple AI providers. The default is OpenAI, but Kimi25 (Azure-hosted Kimi K2.5) is also available.

### OpenAI (Default)

- Authenticate with `/connect` in OpenCode
- Requires ChatGPT Plus/Pro subscription
- Default models: `openai/gpt-5.5` (primary), `openai/gpt-5.3-codex` (coding agents)

### Kimi25 (Azure-hosted)

- Configure via environment variables in your shell profile:
  ```powershell
  $env:KIMI_BASE_URL = "https://your-resource.openai.azure.com/openai/deployments/your-deployment"
  $env:KIMI_API_KEY = "your-api-key"
  $env:KIMI_API_VERSION = "2024-12-01-preview"
  ```
- Available model: `kimi25/Kimi-K2.5`

### Switching Between Providers

**Interactive switching** (per session):
```bash
/model openai/gpt-5.5     # Switch to OpenAI
/model kimi25/Kimi-K2.5   # Switch to Kimi
```

**Per-project configuration**: Create a local `opencode.jsonc` in your project root with the desired model.

**Agent-specific models**: Modify `opencode.jsonc` to assign different providers to specific agents:
```jsonc
{
  "agents": {
    "planner": { "model": "openai/gpt-5.5" },
    "code": { "model": "kimi25/Kimi-K2.5" }
  }
}
```

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

## Persistent Memory

Target projects may keep AI-relevant memory under `docs/ai/`.

Recommended structure:

```text
docs/ai/
  README.md
  architecture.md
  decisions/
    ADR-0001-example.md
  logs/
    YYYY-MM.md
  plans/
    YYYY-MM-DD-short-task-name.md
```

Use this memory for durable information only:

- Approved plans and phase status.
- Architecture boundaries and invariants.
- Decisions that affect future work.
- Tradeoffs and rejected alternatives.
- Short monthly change logs.

Do not store full chat transcripts, long terminal output, raw diffs, or trivial implementation notes.

## Installation Model

This repository is intended to be installed into each target project through symlinks.

The bootstrap script should create project-local links such as:

```text
<target-repo>/opencode.jsonc -> <ai-config>/opencode.jsonc
<target-repo>/.opencode/agents -> <ai-config>/.opencode/agents
<target-repo>/.opencode/commands -> <ai-config>/.opencode/commands
<target-repo>/.opencode/skills -> <ai-config>/.opencode/skills
<target-repo>/AGENTS.md -> <ai-config>/templates/AGENTS.md
```

The installer must be conservative:

- Never overwrite existing real files by default.
- Skip conflicting non-symlink paths and report them.
- Refresh symlinks only with `--force`.
- Support `--dry-run` before modifying a target repository.

Expected command shape:

```bash
./install/bootstrap.sh --repo /path/to/repo --dry-run
./install/bootstrap.sh --repo /path/to/repo
```

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

`planner` should hand off one approved phase to `code` using a compact brief:

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

## Repository Direction

This repository has been simplified around the OpenCode setup described above.

The old multi-runtime structure has been replaced:

- VS Code Copilot adapters were removed.
- Tool-agnostic role files that are no longer installed were removed.
- Broad skill categories were replaced with one staged delivery workflow skill.
- Profile-specific templates were replaced with a single OpenCode-oriented project template.
- The bootstrap script now focuses on project-local OpenCode symlinks.

## Design Principles

- Keep the installed configuration small and predictable.
- Prefer explicit phase gates for staged delivery and reserve autonomous quick delivery for approved low-risk tasks.
- Preserve user control through staged manual checkpoints or planner review of quick-delivery results.
- Keep planning context separate from implementation context.
- Persist decisions and architecture notes, not chat history.
- Use git evidence for review instead of relying on agent memory.
