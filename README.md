# ai-config

`ai-config` is a dotfiles-style repository for AI agent ecosystems. It separates stable role intent from tool-specific wiring, so you can evolve prompts and workflows without locking into a single UI or model vendor.

## Layering model

This repo uses four layers:

1. **AGENTS templates** (`templates/AGENTS*.md`)
   - Repo-local contract: setup, tests, style, definition of done.
   - Keep short, and point to detailed procedures in `skills/`.
2. **Roles** (`agents/roles/*.md`)
   - Tool-agnostic behavior contracts for agent personas.
   - Reusable across editors and runtimes.
3. **Adapters** (`agents/adapters/vscode-copilot/*.agent.md`)
   - Tool-specific wrappers for VS Code custom agents.
   - Bind adapter metadata to a base role.
4. **Skills** (`skills/**/SKILL.md`)
   - Reusable operating procedures for specific tasks.
   - Referenced by roles and adapters when relevant.

### Routing policy

- Prefer the most specific skill for the task.
- If a selected skill declares `metadata.depends_on`, apply dependencies first.

### Boundary contract

- Roles are tool-agnostic principles.
- Adapters are tool-specific wiring.
- Skills are concise procedures.

## Why not organize by model?

Model names, capabilities, and pricing change often. Organizing by model creates churn and duplicates logic. This repository instead organizes by **intent** (role), **tool integration** (adapter), and **task procedure** (skill). You can swap models in your tooling configuration while keeping your operational knowledge stable.

## Install options

VS Code custom agents are Markdown files with YAML frontmatter and should live in discoverable custom agent locations. This repo ships a bootstrap script to link adapter files either globally or per repository.

### Global (user profile)

Installs symlinks for VS Code user-level custom agents.

```bash
./install/bootstrap.sh --global
```

### Per repository

Seeds `AGENTS.md` and links shared agent adapters into a target repo.

```bash
./install/bootstrap.sh --repo /path/to/some/repo
```

This creates `.github/agents` as a symlink to this repo’s `agents/` directory.

## VS Code Copilot usage

Adapter files are linked to VS Code custom agent folders:

- Linux: `~/.config/Code/User/agents` (and `Code - Insiders` variant)
- macOS: `~/Library/Application Support/Code/User/agents` (and `Code - Insiders` variant)
- Windows: `%APPDATA%/Code/User/agents` (and `Code - Insiders` variant)

Use `./install/bootstrap.sh --global` to create symlinks in those folders.

### Useful flags

- `--dry-run` preview operations.
- `--force` replace only when safe (existing symlinks, or explicit overwrite behavior in script).
- `--skills-global [path]` link shared skills globally (default target: `~/.skills/ai-config`).

## Getting started

1. Clone this repository.
2. Optionally copy [profiles/defaults.env.example](profiles/defaults.env.example) to `.env` and customize.
3. Run one of:
   - `./install/bootstrap.sh --global`
   - `./install/bootstrap.sh --repo /path/to/some/repo`
4. Open your repo and verify custom agents appear in VS Code.

## How to add a new role

1. Create `agents/roles/<new-role>.md` with the standard sections:
   - Purpose
   - Non-goals
   - Operating principles
   - Standard output formats
   - When stuck
2. Keep role content principle-focused (no tool wiring or step-by-step procedures).
3. Reference relevant skills by name where useful.

## How to add a new adapter (VS Code)

1. Create `agents/adapters/vscode-copilot/<new-role>.agent.md`.
2. Keep only VS Code wiring in frontmatter (e.g., `name`, `description`, `model`, optional `handoffs`).
3. Link to the base role in the body.
4. Keep routing minimal:
   - prefer the most specific skill
   - apply `metadata.depends_on` dependencies first

## How to add a new skill

1. Create `skills/<domain>/<skill-name>/SKILL.md`.
2. Use YAML frontmatter with supported keys:
   - `name` (unique)
   - `description`
   - `user-invokable`
   - `license`
   - `metadata`
3. Use the standard structure:
   - Trigger
   - Inputs expected
   - Procedure
   - Output template
   - Common failure modes
4. Keep it procedural and specific; avoid repeating base role guidance.
5. For adapter skills, express composition in `metadata.depends_on` (core + adapter pattern).
6. Link to the skill from role docs or `AGENTS.md` templates where appropriate.

## Minimal invocation examples

- Planner + skill: “Use Planner and apply `terraform-change-plan` for this infra update.”
- Implementer + skill chain: “Use Implementer with `test-harness-junit` (and required dependencies) for this Java bugfix.”
- Reviewer + skill: “Use Reviewer with the most specific testing/review skill and report must-fix items.”

## Design principles

- Keep role files stable and concise.
- Keep adapters thin and tool-specific.
- Keep skills detailed enough to execute, but short enough to read quickly.
- Prefer markdown and bash with minimal dependencies.
