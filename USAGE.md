# ai-config Usage Guide

## 1. What is ai-config?

ai-config is a reusable OpenCode configuration that installs AI-assisted development workflows into any Git repository. It provides three main workflows:

- **Staged delivery** — For features, bugs, and refactors that need planning, phased implementation, and review.
- **Quick delivery** — For small, clear, low-risk tasks that can be handled in one pass.
- **Shared task tracking** — For team collaboration via GitHub Issues.

ai-config works with both **OpenCode** and **Kilo Code** runtimes.

---

## 2. Prerequisites

Before installing ai-config, make sure you have:

- **OpenCode** or **Kilo Code** installed on your machine.
- A **Git repository** that you want to install ai-config into.
- An account with at least one supported provider:
  - **OpenAI** — ChatGPT Plus or Pro subscription (or Azure credentials)
  - **GitHub Copilot** — GitHub Copilot subscription
  - **laberit** — account on the laberit platform

---

## 3. Installation

### Interactive installer (easiest)

Run the interactive wrapper and follow the prompts:

```bash
./install/bootstrap-interactive.sh
```

The interactive installer will walk you through:
- Target repository path
- Runtime (OpenCode or Kilo Code)
- Provider selection (safe numbered presets)
- Model preset
- Agent profile (balanced, fast, or thorough)
- Dry-run or force options

### Non-interactive (bash)

```bash
# OpenAI only (default)
./install/bootstrap.sh --repo /path/to/repo --providers openai

# GitHub Copilot
./install/bootstrap.sh --repo /path/to/repo --providers github-copilot

# Multiple providers
./install/bootstrap.sh --repo /path/to/repo --providers openai,github-copilot

# Kilo Code runtime
./install/bootstrap.sh --repo /path/to/repo --runtime kilocode --providers openai

# Preview changes without applying
./install/bootstrap.sh --repo /path/to/repo --dry-run

# Force refresh existing installation
./install/bootstrap.sh --repo /path/to/repo --force
```

### Non-interactive (PowerShell / Windows)

```powershell
.\install\bootstrap.ps1 -Repo C:\path\to\repo -Providers openai
.\install\bootstrap.ps1 -Repo C:\path\to\repo -Providers openai,github-copilot
.\install\bootstrap.ps1 -Repo C:\path\to\repo -DryRun
```

### Optional overrides

| Option | Bash flag | PowerShell flag | Description |
|--------|-----------|-----------------|-------------|
| Default model | `--model <provider/model>` | `-Model <provider/model>` | Override the default model (e.g., `openai/gpt-5.5`) |
| Small model | `--small-model <provider/model>` | `-SmallModel <provider/model>` | Override the lightweight model |
| Agent profile | `--agent-preset <name>` | Not yet supported | Agent behavior: `balanced`, `fast`, or `thorough` |
| Runtime | `--runtime <name>` | `-Runtime <name>` | `opencode` (default) or `kilocode` |

---

## 4. Connecting Providers

After installation, connect your AI provider inside OpenCode or Kilo Code:

| Provider | Connection method |
|----------|-------------------|
| **OpenAI** | Use the `/connect` command in OpenCode. Requires ChatGPT Plus/Pro or Azure credentials. |
| **GitHub Copilot** | Use the `/connect` command in OpenCode and complete the device login flow. |
| **laberit** | Set these environment variables before starting OpenCode: `OPENAI_BASE_URL` and `OPENAI_API_KEY`. See `profiles/defaults.env.example` for the format. |

The installer prints provider connection instructions, but does not run authentication automatically.

---

## 5. Switching Providers / Models

During a session, switch models interactively:

| Command | Provider |
|---------|----------|
| `/model openai/gpt-5.5` | OpenAI |
| `/model github-copilot/gpt-5.4` | GitHub Copilot |
| `/model laberit/laberit-ai` | laberit |

Run `/models` at any time to see which models are available from your connected provider. Available models depend on what OpenCode or Kilo Code exposes after authentication.

---

## 6. Workflows and Commands

### Staged Delivery (`/plan`)

The default workflow for features, bugs, and refactors. Use it when work needs onboarding, planning, architecture review, multiple files or phases, or has higher risk.

1. Describe your task to the planner.
2. The planner researches and asks clarifying questions if needed.
3. An implementation plan is proposed, split into reviewable phases with clear acceptance criteria.
4. Approve the plan, then each phase is implemented one at a time with manual checkpoints.
5. You validate changes after each phase using git diff and local checks.
6. Completed work is reviewed with git evidence before the next phase begins.

### Quick Delivery (`/quick`)

For small, clear, low-risk tasks where staged pauses would add unnecessary overhead.

1. Start with `/quick` and describe your task.
2. The planner confirms the task qualifies for quick delivery (narrow outcome, obvious acceptance criteria, low risk, safe local validation).
3. The task is implemented autonomously.
4. Results are reviewed before responding to you.
5. If a quick task turns out to be ambiguous or risky, it escalates back to staged delivery.

### Shared Tasks (`/newtask` and `/tasks`)

For team task tracking via GitHub Issues. Use these to capture ideas, problems, or repository improvements without implementing immediately.

| Command | Description |
|---------|-------------|
| `/newtask` | Create a new shared task as a GitHub Issue |
| `/tasks list` | List open issues |
| `/tasks claim <number>` | Claim an issue to work on it |
| `/tasks assign <number> <collaborator>` | Assign an issue to someone else |
| `/tasks release <number>` | Release a claimed issue |
| `/tasks close <number>` | Close a completed issue |
| `/tasks prclose <number>` | Close an issue via Pull Request |

---

## 7. Quick Start Walkthrough

Here is a complete end-to-end example of using ai-config with the staged delivery workflow:

**Step 1: Install ai-config into your project**

```bash
cd /your-project
/path/to/ai-config/install/bootstrap.sh --repo . --providers openai
```

**Step 2: Connect your provider**

Open your project in OpenCode and run:

```
/connect
```

Follow the authentication prompts for your chosen provider.

**Step 3: Start a task with `/plan`**

```
/plan Add a login page to the app
```

**Step 4: Review the proposed plan**

The planner will ask clarifying questions, then propose a plan split into phases. Each phase has a clear goal and acceptance criteria. Approve the plan to begin.

**Step 5: Implement Phase 1**

The code agent implements the first phase step by step, pausing after each atomic change. At each checkpoint, you can:

- Review what changed
- Run `git diff` to inspect the diff
- Run your project's build or tests

Approve each checkpoint to continue.

**Step 6: Review the completed phase**

When Phase 1 is complete, use `git status` and `git diff` to review everything. Check that the acceptance criteria are met.

**Step 7: Continue or use `/quick` for small follow-ups**

- Approve the next phase to continue with staged delivery.
- For a small, safe follow-up (e.g., fixing a typo in the login form), use `/quick` instead.

---

## 8. Where to Go Next

- **GitHub Issues** — Check the Issues page for known improvements, bugs, and pending tasks. You can also create new issues via `/newtask` in the ai-config repository.
- **README.md** — For AI-agent documentation and contributor guidance on how this repository is structured.
- **Repository discussions or issues** — For questions, feedback, or help getting started.

When working *on* ai-config itself (not using it in another project), see the Contributing section of the README for guidance on editing source templates rather than generated files.
