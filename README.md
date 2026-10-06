# ai-config

`ai-config` installs a repeatable, task-based AI-assisted workflow into OpenCode projects. It provides shared agents, commands, skills, and a `docs/ai/` memory convention, managed from a single CLI.

## Install

Install the CLI with the one-shot installer:

**Linux / macOS**

```bash
curl -fsSL https://github.com/Macacoders/ai-config/releases/latest/download/install.sh | sh
```

**Windows** (PowerShell)

```powershell
powershell -c "irm https://github.com/Macacoders/ai-config/releases/latest/download/install.ps1 | iex"
```

Default prefix: `~/.ai-config` (Linux/macOS) or `%LOCALAPPDATA%\ai-config` (Windows).

### Requirements

- **Node.js >= 18** is required to run the installed workflow (skills and commands execute via `npx tsx`).
- The one-shot installer provisions Node.js (>= 18) user-locally into the prefix when it is missing or too old — no manual install needed.
- `ai-config install --repo` requires Node.js >= 18 on PATH; pass `--skip-node-check` to bypass the check.

Install the runtime into a target repository:

```bash
ai-config install --repo /path/to/repo --providers openai
```

| Command | Purpose |
|---|---|
| `ai-config install --repo <path>` | Install runtime config into a repo |
| `ai-config uninstall --repo <path>` | Remove ai-config managed files from a repo |
| `ai-config interactive` | Guided interactive installer |

Use `--dry-run` to preview and `--force` to refresh managed files. Remove the CLI itself with `install.sh --uninstall` or `install.ps1 -Uninstall`.

### Use from source

Prefer a clone over the release? Run the installer straight from TypeScript source:

```bash
git clone https://github.com/Macacoders/ai-config.git
cd ai-config
npm install
npx tsx cli/src/index.ts install --repo /path/to/your-project --providers openai
```

Build a standalone binary with `make cli-binary` (no Node.js needed).

See [`RELEASE.md`](./RELEASE.md) and [`CHANGELOG.md`](./CHANGELOG.md) for release and version history.

## Use

Work flows through four workflows: formalize intent, plan approved intent, track via issues, and deliver task by task.

Node colors: gray = you · blue = `planner` · orange = `delivery` · green = `code` · purple = `research`.

### `/intent`

Formalize an ambiguous request into a bounded intent: problem, outcome, and acceptance criteria.

```mermaid
flowchart LR
    A["User request"] --> B{"Ambiguous?"}
    B -- "clarify" --> C["Ask one question"]
    C --> B
    B -- "clear" --> D["Intent: problem, outcome, criteria"]
    D --> E["Approve"] --> F["/issue or /plan"]

    classDef user fill:#1f2937,stroke:#6b7280,color:#e5e7eb
    classDef planner fill:#1e3a8a,stroke:#60a5fa,color:#dbeafe
    class A,E user
    class B,C,D,F planner
```

### `/plan`

Turn an approved intent into a concrete, task-based implementation plan.

```mermaid
flowchart LR
    A["Approved intent"] --> B["Investigate repo gaps"]
    B -- "delegates" --> C["research subagent scouts repo"]
    C -- "reports back" --> B
    B --> D["Task plan + acceptance criteria"]
    D --> E["Save to docs/ai/plans/"]
    E --> F["Approve"] --> G["/load-plan"]

    classDef user fill:#1f2937,stroke:#6b7280,color:#e5e7eb
    classDef planner fill:#1e3a8a,stroke:#60a5fa,color:#dbeafe
    classDef research fill:#581c87,stroke:#c084fc,color:#f3e8ff
    classDef delivery fill:#7c2d12,stroke:#fb923c,color:#ffedd5
    class A,F user
    class B,D,E planner
    class C research
    class G delivery
```

### `/issue`

Create and track a shared GitHub Issue for a problem or idea.

```mermaid
flowchart LR
    A["Problem or idea"] --> B["/issue create"]
    B --> C["Formalize intent"]
    C --> D["GitHub Issue + labels"]
    D --> E["status:to-do"]
    E --> F["claim → status:doing"]

    classDef user fill:#1f2937,stroke:#6b7280,color:#e5e7eb
    classDef planner fill:#1e3a8a,stroke:#60a5fa,color:#dbeafe
    class A,F user
    class B,C,D,E planner
```

### Delivery loop

Load an approved plan and implement it task by task, reviewing each step.

```mermaid
flowchart LR
    A["Approved plan"] --> B["/load-plan"]
    B --> C["/implement-task"]
    C -- "handoff" --> D["code subagent implements"]
    D --> E["Pause for review"]
    E --> F["/review-task git evidence"]
    F -- "more tasks" --> B
    F -- "done" --> G["/memory"]

    classDef user fill:#1f2937,stroke:#6b7280,color:#e5e7eb
    classDef delivery fill:#7c2d12,stroke:#fb923c,color:#ffedd5
    classDef code fill:#14532d,stroke:#4ade80,color:#dcfce7
    classDef planner fill:#1e3a8a,stroke:#60a5fa,color:#dbeafe
    class A,E user
    class B,C,F delivery
    class D code
    class G planner
```

## Contribute

Edit source templates under `base/opencode/**`. Never edit generated `.opencode/` files (they are gitignored and overwritten on reinstall).

> **Protection rule:** Agents must never merge changes to `develop` that touch `base/opencode` markdown files for skills, agents, or commands — `base/opencode/skills/**/SKILL.md`, `base/opencode/agents/**/*.md`, and `base/opencode/commands/**/*.md`. Changes to these files must always be validated through a pull request.

Deep workflow and memory guidance is in [`docs/ai/README.md`](./docs/ai/README.md) and [`AGENTS.md`](./AGENTS.md).
