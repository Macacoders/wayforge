# ai-config

`ai-config` is a dotfiles-style repository for AI agent ecosystems. It separates stable role intent from tool-specific wiring, so you can evolve prompts and workflows without locking into a single UI or model vendor.

## Layering model

This repo uses a 3-layer simplified model for AI configuration:

1. **Roles** (`agents/roles/*.md`)
   - Tool-agnostic behavior contracts for 3-4 core agent personas (Architect, Engineer, Auditor, Writer).
   - Reusable across editors and runtimes.
2. **Adapters** (`agents/adapters/vscode-copilot/*.agent.md`)
   - Tool-specific wrappers for VS Code custom agents.
   - Bind adapter metadata to a base role.
3. **Skills** (`skills/{category}/{subject}/SKILL.md`)
   - Reusable, dense operating procedures for specific tasks.
   - Follow a structured [Metadata / Constraints / Procedure] format (< 400 tokens).

### Routing policy (Dynamic Skill Discovery)

To optimize for token efficiency, this repository implements a "Lazy-load" mechanism:
- **Manifest Lookup**: Roles first read `skills/MANIFEST.md` to identify the correct skill path for a task.
- **Just-in-Time Loading**: Only the identified `SKILL.md` is loaded into the prompt context for execution.
- **Metadata Validation**: Ensure the skill's metadata aligns with the target environment before applying the procedure.


### Boundary contract

- Roles: Principles & personas.
- Adapters: Tool integration & wiring.
- Skills: Concrete checklists & procedures.

## Why not organize by model?

Model names, capabilities, and pricing change often. This repository organizes by **intent** (role), **tool integration** (adapter), and **task procedure** (skill), keeping operational knowledge stable across model transitions.

## Install options

VS Code custom agents are Markdown files with YAML frontmatter. Link them globally or per repository using the bootstrap script.

### Global (user profile)

Installs symlinks for VS Code user-level custom agents.

```bash
./install/bootstrap.sh --global
```

### Per repository

Seeds `AGENTS.md` and links shared agent adapters into `.github/agents/`.

```bash
./install/bootstrap.sh --repo /path/to/some/repo
```

## VS Code Copilot usage

Adapter files are linked to VS Code custom agent folders:

- Linux: `~/.config/Code/User/agents`
- macOS: `~/Library/Application Support/Code/User/agents`
- Windows: `%APPDATA%/Code/User/agents`

## Minimal invocation examples

- **Architect** + skill: “Use Architect and apply `terraform` for this infra update.”
- **Engineer** + skill: “Use Engineer with `junit` for this Java bugfix.”
- **Auditor** + skill: “Use Auditor with `testing/pytest` and report must-fix items.”
- **Writer** + skill: “Use Writer with `writing` to refine the contributions section.”

## Design principles

- **Token Efficiency**: All skill files are < 400 tokens; no prose, use checklists.
- **Architectural Clarity**: Flattened 3-layer structure for predictable lookups.
- **Reference-only Roles**: Roles point to relevant skill paths rather than embedding text.
- **Audit-ready**: Maintain evidence-first methodology across all roles.

