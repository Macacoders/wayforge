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

### Useful flags

- `--dry-run` preview operations.
- `--force` replace only when safe (existing symlinks, or explicit overwrite behavior in script).

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
2. Create an adapter file at `agents/adapters/vscode-copilot/<new-role>.agent.md` with YAML frontmatter (`name`, `description`) and role linkage.
3. Reference relevant skills in the role and adapter.
4. If needed, update templates so repo-level rules mention the new role.

## How to add a new skill

1. Create `skills/<domain>/<skill-name>/SKILL.md`.
2. Use the standard structure:
   - Trigger
   - Inputs expected
   - Procedure
   - Output template
   - Common failure modes
3. Keep it procedural and specific; avoid repeating base role guidance.
4. Link to the skill from role docs or `AGENTS.md` templates where appropriate.

## Design principles

- Keep role files stable and concise.
- Keep adapters thin and tool-specific.
- Keep skills detailed enough to execute, but short enough to read quickly.
- Prefer markdown and bash with minimal dependencies.
