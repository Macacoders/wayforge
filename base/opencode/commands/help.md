---
description: Guide users across every ai-config command, skill, and agent, auto-discovered at runtime.
agent: planner
metadata:
  workflow: meta
---

Discover and render a reference to every ai-config command, skill, and agent installed in this repository. Do the discovery live — never hardcode the lists.

## Discovery

Enumerate (use `rg`/`glob`, do not assume a fixed set):

- Commands: `.opencode/commands/*.md`
- Skills: `.opencode/skills/*/SKILL.md`
- Agents: `.opencode/agents/*.md`

For each file read ONLY the YAML frontmatter and extract:

- Commands: `description` and `metadata.workflow` (fallback to `agent` if `workflow` is absent).
- Skills: `name`, `description`, `metadata.workflow`.
- Agents: `description` and `mode` (`primary` or `subagent`).

## Render

1. **Start here** — one line pointing to `/intent` as the entry point, then the flow: intent → plan → issue → deliver → memory.
2. **Commands** — grouped by `metadata.workflow` in canonical order (`init`, `intent`, `plan`, `issue`, `deliver`, `memory`, `ponytail`, `triage`, `authoring`, `meta`). Each entry: `/command` + one-line description.
3. **Skills** — grouped by `metadata.workflow`, same canonical order. Each entry: skill name + one-line description.
4. **Agents** — grouped by `mode`, primary agents first then subagents. Each entry: agent name + `mode` + one-line description.

## Rules

- Discover at runtime; new commands/skills/agents appear automatically.
- If a file lacks `metadata.workflow`, list it under a final `uncategorized` group rather than dropping it.
- Keep every description to one line.
